"""自动跟进官方 latest；签名、哈希和模拟协议通过后空闲切换，失败保留原版本。"""
import argparse
import contextlib
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

ORIGINS = ['https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases',
           'https://downloads.claude.ai/claude-code-releases']
FINGERPRINT = '31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE'
LIVE = pathlib.Path('/usr/local/bin/velella-claude')
STORE = pathlib.Path('/usr/local/lib/claude-relay/versions')
RECEIPT = pathlib.Path('/usr/local/share/claude-relay/cli-release.json')
APP = pathlib.Path('/home/harness/app')
STATE = pathlib.Path('/home/harness/model-gateway')
PHASE = 'startup'


def run(args, timeout=30):
    # 输出仅由调用方按预期字段处理，禁止把探针正文或认证内容写入日志。
    return subprocess.run(list(map(str, args)), capture_output=True, text=True,
                          timeout=timeout, check=True).stdout


def digest(file):
    with pathlib.Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def version_tuple(value):
    if not re.fullmatch(r'\d+\.\d+\.\d+', value):
        raise ValueError('invalid release version')
    return tuple(map(int, value.split('.')))


def download(suffix, destination, timeout=180):
    for origin in ORIGINS:
        try:
            run(['curl', '-fsSL', '--connect-timeout', '15', '--max-time', str(timeout),
                 '-o', destination, origin + '/' + suffix], timeout=timeout + 10)
            return
        except (subprocess.SubprocessError, OSError):
            continue
    raise RuntimeError('official release download failed')


def signed_manifest(version, folder):
    # 固定官方公钥指纹，签名失败不会安装候选文件。
    manifest = folder / 'manifest.json'
    download(version + '/manifest.json', manifest)
    download(version + '/manifest.json.sig', folder / 'manifest.json.sig')
    key = folder / 'release.asc'
    run(['curl', '-fsSL', '--connect-timeout', '15', '--max-time', '30', '-o', key,
         'https://downloads.claude.ai/keys/claude-code.asc'], timeout=40)
    gnupg = folder / 'gnupg'
    gnupg.mkdir(mode=0o700)
    shown = run(['gpg', '--batch', '--homedir', gnupg, '--with-colons', '--show-keys', key])
    fingerprints = [line.split(':')[9] for line in shown.splitlines() if line.startswith('fpr:')]
    if FINGERPRINT not in fingerprints:
        raise RuntimeError('official signing key fingerprint mismatch')
    run(['gpg', '--batch', '--homedir', gnupg, '--import', key])
    result = run(['gpg', '--batch', '--homedir', gnupg, '--status-fd', '1',
                  '--verify', folder / 'manifest.json.sig', manifest])
    if not any('VALIDSIG' in line and FINGERPRINT in line for line in result.splitlines()):
        raise RuntimeError('official manifest signature mismatch')
    data = json.loads(manifest.read_text())
    checksum = data['platforms']['linux-x64']['checksum']
    if not re.fullmatch(r'[a-f0-9]{64}', checksum):
        raise ValueError('invalid release checksum')
    return checksum


def gateway_status():
    # 仅使用本网关的回环鉴权，不读取 Claude OAuth 文件。
    token = (STATE / 'token').read_text().strip()
    request = urllib.request.Request('http://127.0.0.1:18796/status',
                                    headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def idle(status):
    # 尚在接收入站体的请求没有启动 CLI，可在其真正执行前使用已验收新版。
    return all(status.get(key, 0) == 0 for key in ['activeRequests', 'queuedRequests'])


def health_matches(before, after, version):
    # 保留登录检查状态，兼容首次加载前尚无 CLI 版本字段的网关。
    return (after.get('checked') == before.get('checked')
            and after.get('loggedIn') == before.get('loggedIn')
            and after.get('cliVersion', version) == version)


def probe(candidate, version, models):
    # 独立源码副本和临时 HOME：官方 CLI 只连回环模拟上游，不携带正式账号登录。
    with tempfile.TemporaryDirectory(prefix='cli-update-probe-', dir=STATE) as temporary:
        folder = pathlib.Path(temporary)
        for source in (APP / 'model-gateway').glob('*.mjs'):
            if source.is_symlink():
                raise RuntimeError('probe source must be a regular file')
            shutil.copy2(source, folder / source.name)
        compat = folder / 'cli-compat.mjs'
        contents, count = re.subn(r'(export const SUPPORTED_CLI_VERSIONS = )\[[^\n;]+\]',
                                 lambda match: match[1] + json.dumps([version]), compat.read_text())
        if count != 1:
            raise RuntimeError('unsupported probe version configuration')
        compat.write_text(contents)
        import pwd
        user = pwd.getpwnam('harness')
        os.chown(folder, user.pw_uid, user.pw_gid)
        for file in folder.iterdir():
            os.chown(file, user.pw_uid, user.pw_gid)
        prefix = ['runuser', '-u', 'harness', '--', 'env', '-u', 'GATEWAY_CLI_RELEASE_FILE',
                  'GATEWAY_CLI_RELEASE_FILE=' + str(folder / 'unused-release.json'),
                  'PATH=/home/harness/app/node/bin:/usr/local/bin:/usr/bin:/bin',
                  'CLAUDE_BIN=' + str(candidate), '/usr/local/bin/velella-node']
        # 两个实际模型分别检查缓存、图像、动态指令及工具往返；十档测试补足强度覆盖。
        for key in ['claude-code-opus', 'claude-code-sonnet']:
            model = models[key]
            if not re.fullmatch(r'claude-[a-z0-9-]+(?:\[1m\])?', model):
                raise ValueError('invalid upstream model')
            output = run(prefix + [folder / 'cloud-probe.mjs', '--self-test', '--anthropic',
                                  '--images', '--instruction-updates', '--output-tokens=64000',
                                  '--cache-ttl=1h', '--upstream-model=' + model], timeout=130)
            if 'PASS: cloud CLI protocol and stable prompt prefix' not in output:
                raise RuntimeError('model protocol validation failed')
        output = run(prefix + [folder / 'effort-cloud-probe.mjs'], timeout=250)
        if 'PASS: ten model/effort combinations' not in output:
            raise RuntimeError('effort protocol validation failed')


def atomic_json(file, record):
    temporary = file.with_name(file.name + '.tmp')
    temporary.write_text(json.dumps(record) + '\n')
    temporary.chmod(0o644)
    os.replace(temporary, file)


def switch(candidate, live, receipt, record, health):
    # 二进制各版本单独存放；切换链接不会重启网关或截断正在运行的可执行文件。
    link = live.with_name(live.name + '.next')
    previous = live.resolve()
    old_receipt = receipt.read_bytes() if receipt.exists() else None
    try:
        link.unlink(missing_ok=True)
        link.symlink_to(candidate)
        os.replace(link, live)
        atomic_json(receipt, record)
        if not health():
            raise RuntimeError('post-update health check failed')
    except BaseException:
        link.unlink(missing_ok=True)
        link.symlink_to(previous)
        os.replace(link, live)
        if old_receipt is None:
            receipt.unlink(missing_ok=True)
        else:
            temporary = receipt.with_name(receipt.name + '.tmp')
            temporary.write_bytes(old_receipt); temporary.chmod(0o644)
            os.replace(temporary, receipt)
        raise
    finally:
        link.unlink(missing_ok=True)


def prune(current, previous):
    # 当前、上一版本与仍有进程使用的版本均保留，其他历史文件不长期占据磁盘。
    used = {pathlib.Path(current).resolve(), pathlib.Path(previous).resolve()}
    for process in pathlib.Path('/proc').glob('[0-9]*/exe'):
        with contextlib.suppress(OSError):
            used.add(process.resolve(strict=True))
    for file in STORE.iterdir():
        if file.is_file() and re.fullmatch(r'\d+\.\d+\.\d+', file.name) and file.resolve() not in used:
            file.unlink()


def main():
    global PHASE
    import fcntl
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError('updater requires root')
    for directory in [STORE, RECEIPT.parent]:
        directory.mkdir(mode=0o755, parents=True, exist_ok=True)
    with (RECEIPT.parent / 'update.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'update': 'already_running'})); return
        # 更新进程被系统中断时，下一轮清理超过一小时的本更新器下载目录。
        for old in STORE.parent.glob('download-*'):
            if old.is_dir() and not old.is_symlink() and time.time() - old.stat().st_mtime > 3600:
                shutil.rmtree(old)
        with tempfile.TemporaryDirectory(prefix='download-', dir=STORE.parent) as temporary:
            folder = pathlib.Path(temporary)
            folder.chmod(0o755)
            PHASE = 'release_check'
            download('latest', folder / 'latest', timeout=30)
            latest = (folder / 'latest').read_text().strip()
            current = run([LIVE, '--version']).split()[0]
            status = gateway_status()
            # 首次部署时等入站体也收完再加载新版网关；后续二进制更新无需重启。
            if not args.check_only and 'cliVersion' not in status and idle(status) and not status.get('inflightBytes', 0):
                run(['systemctl', 'restart', 'velella-model-gateway'])
                for attempt in range(20):
                    try:
                        status = gateway_status(); break
                    except OSError:
                        time.sleep(.5)
                else:
                    raise RuntimeError('gateway initialization failed')
                print(json.dumps({'update': 'gateway_management_loaded'}), flush=True)
            if version_tuple(latest) <= version_tuple(current):
                print(json.dumps({'update': 'current', 'version': current})); return
            if args.check_only:
                print(json.dumps({'update': 'available', 'current': current, 'latest': latest})); return
            if not idle(status):
                print(json.dumps({'update': 'deferred_busy', 'latest': latest})); return
            if shutil.disk_usage(STORE).free < 1024 ** 3:
                raise RuntimeError('at least 1 GiB free disk required')
            PHASE = 'signature'
            expected = signed_manifest(latest, folder)
            print(json.dumps({'update': 'signature_verified', 'version': latest}), flush=True)
            candidate = folder / 'claude'
            PHASE = 'binary_download'
            download(latest + '/linux-x64/claude', candidate)
            if digest(candidate) != expected:
                raise RuntimeError('binary checksum mismatch')
            candidate.chmod(0o755)
            if run([candidate, '--version']).split()[0] != latest:
                raise RuntimeError('binary version mismatch')
            print(json.dumps({'update': 'verifying_protocol', 'version': latest}), flush=True)
            PHASE = 'protocol_probe'
            probe(candidate, latest, status['upstreamModels'])
            if not idle(gateway_status()):
                print(json.dumps({'update': 'deferred_busy', 'latest': latest})); return
            # 首次接管旧的普通文件，先留一个不可变版本，确保失败能恢复同一版本。
            previous = LIVE.resolve()
            if not LIVE.is_symlink():
                previous = STORE / current
                if previous.exists() and digest(previous) != digest(LIVE):
                    raise RuntimeError('existing rollback binary differs')
                if not previous.exists():
                    shutil.copy2(LIVE, previous)
                link = LIVE.with_name(LIVE.name + '.next')
                link.unlink(missing_ok=True)
                link.symlink_to(previous); os.replace(link, LIVE)
            installed = STORE / latest
            if installed.exists() and digest(installed) != expected:
                raise RuntimeError('existing candidate binary differs')
            if installed.exists():
                candidate.unlink()
            else:
                os.replace(candidate, installed)
            record = {'version': latest, 'sha256': expected, 'protocol': 1, 'verifiedAt': int(time.time())}
            PHASE = 'switch'
            def healthy():
                if run([LIVE, '--version']).split()[0] != latest:
                    return False
                observed = gateway_status()
                # 健康检查还需保持认证检查结果，不能把返回 JSON 当作登录正常。
                return health_matches(status, observed, latest)
            switch(installed, LIVE, RECEIPT, record, healthy)
            prune(installed, previous)
            print(json.dumps({'update': 'installed', 'previous': current, 'version': latest}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        reason = str(error) if type(error) is RuntimeError else type(error).__name__
        print(json.dumps({'update': 'failed_kept_previous', 'phase': PHASE, 'reason': reason}), flush=True)
        raise SystemExit(1)
