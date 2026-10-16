"""从空白 Debian/Ubuntu 安装 SSH 模式网关；账号登录始终由用户完成。"""
import argparse
import contextlib
import hashlib
import importlib.util
import json
import os
import pathlib
import platform
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

APP = pathlib.Path('/home/harness/app')
STATE = pathlib.Path('/home/harness/model-gateway')
UNIT = pathlib.Path('/etc/systemd/system/velella-model-gateway.service')
MODEL_MAP = {'claude-code-opus': 'claude-opus-5-5[1m]', 'claude-code-sonnet': 'claude-sonnet-5-5[1m]', 'claude-code-haiku': 'claude-haiku-5-5'}
RESULT_FILE = None
LAST_EVENT = {}


@contextlib.contextmanager
def install_lock():
    # 安装、升级与定时更新共用一把锁，避免同时替换二进制和验收记录。
    import fcntl
    if os.geteuid() != 0:
        raise RuntimeError('首次安装需要 root/sudo 权限')
    directory = pathlib.Path('/usr/local/share/claude-relay')
    directory.mkdir(parents=True, exist_ok=True, mode=0o755)
    with (directory / 'update.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('另一安装或 CLI 更新正在运行，请稍后重试')
        yield


def emit(phase, **fields):
    global LAST_EVENT
    LAST_EVENT = {'phase': phase, **fields}
    print(json.dumps(LAST_EVENT, ensure_ascii=False), flush=True)
    if RESULT_FILE:
        temporary = RESULT_FILE.with_suffix('.tmp')
        temporary.write_text(json.dumps({'state': 'running', **LAST_EVENT}) + '\n')
        temporary.chmod(0o600)
        temporary.replace(RESULT_FILE)


def run(args, timeout=900, **options):
    result = subprocess.run(list(map(str, args)), capture_output=True, text=True, timeout=timeout, **options)
    if result.returncode:
        raise RuntimeError(f'安装步骤失败：{pathlib.Path(str(args[0])).name}，退出码 {result.returncode}')
    return result.stdout.strip()


def sha256(file):
    digest = hashlib.sha256()
    with pathlib.Path(file).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def download(url, target):
    run(['curl', '-fsSL', '--retry', '2', '--connect-timeout', '20', '--max-time', '300', '-o', target, url], timeout=950)


def read_status(token):
    request = urllib.request.Request('http://127.0.0.1:18796/status', headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def inspect_existing(incoming_token):
    # 重跑只接管本项目；不覆盖别的应用或已有不匹配的访问令牌。
    if UNIT.exists() and 'Unbundle managed installer' not in UNIT.read_text():
        raise RuntimeError('已有非安装器管理的服务文件，未更改已有安装')
    if APP.exists() and any(APP.iterdir()):
        package = APP / 'package.json'
        if not package.exists() or json.loads(package.read_text()).get('name') not in ['unbundle', 'velella-model-gateway', 'claude-code-relay']:
            raise RuntimeError('目标应用目录已有其他内容，未覆盖')
    token_file = STATE / 'token'
    if token_file.exists() and token_file.read_text().strip() != incoming_token:
        raise RuntimeError('云端令牌与本地部署配置不一致，未更改已有安装')
    if subprocess.run(['systemctl', 'is-active', '--quiet', 'velella-model-gateway'], capture_output=True).returncode == 0:
        status = read_status(incoming_token)
        if any(status.get(key, 0) for key in ['activeRequests', 'queuedRequests', 'receivingRequests']):
            raise RuntimeError('云端有正在进行的请求，请空闲后重跑')


def install_node():
    binary = APP / 'node/bin/node'
    if binary.exists():
        version = run([binary, '--version'], timeout=15)
        if re.fullmatch(r'v2[4-9]\.\d+\.\d+', version):
            return version
    # 固定 Node 24 LTS 大版本，从官方发布目录获取对应 SHA256 后解包。
    with tempfile.TemporaryDirectory(prefix='unbundle-node-') as directory:
        folder = pathlib.Path(directory)
        download('https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt', folder / 'checksums')
        records = re.findall(r'^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-linux-x64\.tar\.xz)$', (folder / 'checksums').read_text(), re.M)
        if len(records) != 1:
            raise RuntimeError('Node 官方发布清单无法识别')
        expected, filename = records[0]
        download('https://nodejs.org/dist/latest-v24.x/' + filename, folder / filename)
        if sha256(folder / filename) != expected:
            raise RuntimeError('Node 安装包 SHA256 不匹配')
        destination = APP / 'node'
        destination.mkdir(parents=True, exist_ok=True)
        run(['tar', '-xJf', folder / filename, '--strip-components=1', '-C', destination])
    return run([binary, '--version'], timeout=15)


def service_text(memory_mib, concurrent):
    # 只开放回环模型入口，SSH 转发承载加密传输；服务不持有管理员权限。
    return f'''# Unbundle managed installer
[Unit]
Description=Unbundle single-user model gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=harness
Group=harness
WorkingDirectory={APP}
ExecStart=/usr/local/bin/velella-node {APP}/model-gateway/cloud-server.mjs
Environment=PATH={APP}/node/bin:/usr/local/bin:/usr/bin:/bin
Environment=GATEWAY_MAX_CONCURRENT={concurrent}
Environment=GATEWAY_MAX_QUEUED=8
Environment=GATEWAY_TIMEOUT_MS=0
Environment=GATEWAY_IDLE_TIMEOUT_MS=180000
Environment=GATEWAY_CONTEXT_DIAGNOSTICS=1
EnvironmentFile=-/etc/unbundle/gateway.env
MemoryMax={memory_mib}M
Restart=on-failure
RestartSec=3
KillMode=control-group
TimeoutStopSec=15
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths={STATE} /home/harness/state/runtime-home

[Install]
WantedBy=multi-user.target
'''


def install(source, token_file):
    if os.geteuid() != 0 or platform.system() != 'Linux' or platform.machine() not in ['x86_64', 'amd64']:
        raise RuntimeError('首次安装需要 Linux x64 和 root/sudo 权限')
    release = pathlib.Path('/etc/os-release').read_text()
    if not re.search(r'^ID=(?:debian|ubuntu|"debian"|"ubuntu")$', release, re.M):
        raise RuntimeError('首次安装当前支持 Debian/Ubuntu；其他系统请使用原有部署模板')
    if not pathlib.Path('/run/systemd/system').exists():
        raise RuntimeError('需要正在运行的 systemd')
    import pwd
    token = token_file.read_text().strip()
    if not re.fullmatch(r'[a-f0-9]{64}', token):
        raise RuntimeError('网关令牌格式无效')
    inspect_existing(token)
    emit('dependencies')
    env = {**os.environ, 'DEBIAN_FRONTEND': 'noninteractive'}
    run(['apt-get', 'update', '-qq'], env=env)
    run(['apt-get', 'install', '-y', '-qq', 'ca-certificates', 'curl', 'gnupg', 'xz-utils', 'python3'], env=env)
    try:
        account = pwd.getpwnam('harness')
    except KeyError:
        run(['useradd', '--create-home', '--shell', '/bin/bash', 'harness'])
        account = pwd.getpwnam('harness')
    APP.mkdir(parents=True, exist_ok=True)
    for directory in [STATE, STATE / 'runtime-home', pathlib.Path('/home/harness/state/runtime-home'), pathlib.Path('/home/harness/state/runtime-home/.claude')]:
        directory.mkdir(parents=True, exist_ok=True)
        os.chown(directory, account.pw_uid, account.pw_gid)
        directory.chmod(0o700)
    token_target = STATE / 'token'
    if not token_target.exists():
        token_target.write_text(token + '\n')
    token_target.chmod(0o600)
    os.chown(token_target, account.pw_uid, account.pw_gid)
    # 升级前保留程序和服务快照；OAuth 与私有配置始终原位保留。
    if (APP / 'package.json').exists():
        backup = pathlib.Path('/home/harness/releases') / ('before-' + str(time.time_ns()))
        backup.mkdir(parents=True)
        for name in ['model-gateway', 'deploy', 'src', 'package.json', 'package-lock.json']:
            target = APP / name
            if target.is_dir():
                shutil.copytree(target, backup / name)
            elif target.exists():
                shutil.copy2(target, backup / name)
        if UNIT.exists():
            shutil.copy2(UNIT, backup / 'gateway.service')
        emit('backup', path=str(backup))
    for name in ['model-gateway', 'deploy', 'src', 'package.json', 'package-lock.json']:
        origin = source / name
        if origin.is_dir():
            shutil.copytree(origin, APP / name, dirs_exist_ok=True)
        else:
            shutil.copy2(origin, APP / name)
    emit('node', version=install_node())
    node_next = pathlib.Path('/usr/local/bin/velella-node.install-next')
    shutil.copy2(APP / 'node/bin/node', node_next)
    node_next.chmod(0o755)
    os.replace(node_next, '/usr/local/bin/velella-node')
    run([APP / 'node/bin/npm', 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
        cwd=APP, env={**os.environ, 'PATH': str(APP / 'node/bin') + ':' + os.environ.get('PATH', '')})
    # 复用更新器的官方签名与隔离协议验收，首次安装不依赖已运行的网关。
    spec = importlib.util.spec_from_file_location('unbundle_cli_update', APP / 'deploy/update-cli.py')
    updater = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(updater)
    updater.STORE.mkdir(parents=True, exist_ok=True)
    updater.RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='unbundle-cli-', dir=updater.STORE.parent) as directory:
        folder = pathlib.Path(directory)
        folder.chmod(0o755)
        updater.download('latest', folder / 'latest', timeout=30)
        version = (folder / 'latest').read_text().strip()
        updater.version_tuple(version)
        emit('cli-signature', version=version)
        expected = updater.signed_manifest(version, folder)
        candidate = updater.STORE / version
        if not candidate.exists():
            updater.download(version + '/linux-x64/claude', folder / 'claude')
            if sha256(folder / 'claude') != expected:
                raise RuntimeError('Claude 二进制 SHA256 不匹配')
            (folder / 'claude').chmod(0o755)
            shutil.copy2(folder / 'claude', candidate)
        if sha256(candidate) != expected:
            raise RuntimeError('已下载 Claude 二进制与官方签名清单不符')
        emit('cli-protocol-probe', version=version)
        updater.probe(candidate, version, MODEL_MAP)
        link = updater.LIVE.with_name(updater.LIVE.name + '.install-next')
        link.unlink(missing_ok=True)
        link.symlink_to(candidate)
        os.replace(link, updater.LIVE)
        updater.atomic_json(updater.RECEIPT, {'version': version, 'sha256': expected, 'protocol': 1, 'verifiedAt': int(time.time())})
    memory_kib = int(re.search(r'^MemTotal:\s+(\d+)', pathlib.Path('/proc/meminfo').read_text(), re.M)[1])
    memory_mib = max(384, min(3072, memory_kib // 1024 * 65 // 100))
    concurrent = 1 if memory_kib < 2 * 1024 * 1024 else 3
    if UNIT.exists():
        if 'Unbundle managed installer' not in UNIT.read_text():
            raise RuntimeError('已有非安装器管理的服务文件；已保留，需人工核对后接管')
    UNIT.write_text(service_text(memory_mib, concurrent))
    UNIT.chmod(0o644)
    pathlib.Path('/etc/unbundle').mkdir(mode=0o755, exist_ok=True)
    for name, target in [('update-cli.py', '/usr/local/lib/claude-relay/update-cli.py'),
                         ('cli-update.service', '/etc/systemd/system/velella-cli-update.service'),
                         ('cli-update.timer', '/etc/systemd/system/velella-cli-update.timer')]:
        shutil.copy2(APP / 'deploy' / name, target)
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'enable', 'velella-model-gateway', 'velella-cli-update.timer'])
    run(['systemctl', 'restart', 'velella-model-gateway'])
    run(['systemctl', 'start', 'velella-cli-update.timer'])
    for attempt in range(30):
        try:
            status = read_status(token)
            emit('ready', version=json.loads((APP / 'package.json').read_text())['version'], cliVersion=status.get('cliVersion'),
                 loggedIn=status.get('loggedIn'), checked=status.get('checked'), maxConcurrent=concurrent, memoryLimitMiB=memory_mib)
            return
        except (OSError, ValueError):
            time.sleep(1)
    raise RuntimeError('服务尚未就绪；请检查 systemctl status velella-model-gateway')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path, required=True)
    parser.add_argument('--token-file', type=pathlib.Path, required=True)
    parser.add_argument('--result-file', type=pathlib.Path)
    arguments = parser.parse_args()
    RESULT_FILE = arguments.result_file
    code = 0
    try:
        with install_lock():
            install(arguments.source.resolve(), arguments.token_file.resolve())
    except Exception as error:
        emit('failed', reason=str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        code = 1
    if RESULT_FILE:
        temporary = RESULT_FILE.with_suffix('.tmp')
        temporary.write_text(json.dumps({'state': 'failed' if code else 'completed', **LAST_EVENT}) + '\n')
        temporary.chmod(0o600)
        temporary.replace(RESULT_FILE)
    raise SystemExit(code)
