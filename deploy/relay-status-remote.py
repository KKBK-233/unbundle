"""经 SSH 标准输入运行：资源、阶段日志、官方 CLI 额度，无第三方依赖。"""
import fcntl
import json
import os
import pathlib
import pty
import re
import select
import shutil
import signal
import struct
import subprocess
import termios
import time


def run(args, timeout=5):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout).stdout.strip()


def resources():
    # 一秒 CPU 差分；MemAvailable 包含可回收缓存，不能仅看 MemFree。
    def cpu():
        fields = list(map(int, pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
        return sum(fields), fields[3] + fields[4]
    a = cpu()
    time.sleep(1)
    b = cpu()
    busy = 100 * (1 - (b[1] - a[1]) / max(1, b[0] - a[0]))
    mem = {}
    for line in pathlib.Path('/proc/meminfo').read_text().splitlines():
        k, v = line.split(':', 1)
        mem[k] = int(v.split()[0]) / 1024
    disk = shutil.disk_usage('/')
    lines = [f'CPU：{busy:.1f}%（1 秒采样），{os.cpu_count()} 核；负载 ' + ' / '.join(f'{x:.2f}' for x in os.getloadavg()),
             f"内存：已用 {mem['MemTotal']-mem['MemAvailable']:.0f} / {mem['MemTotal']:.0f} MiB，可用 {mem['MemAvailable']:.0f} MiB",
             f"Swap：{mem['SwapTotal']-mem['SwapFree']:.0f} / {mem['SwapTotal']:.0f} MiB",
             f'根分区：已用 {disk.used/2**30:.1f} / {disk.total/2**30:.1f} GiB，剩余 {disk.free/2**30:.1f} GiB']
    for unit in ['velella-model-gateway', 'velella-model-frpc', 'harness-frps']:
        lines.append(f'{unit}：' + run(['systemctl', 'is-active', unit]))
    properties = run(['systemctl', 'show', 'velella-model-gateway', '-p', 'MemoryCurrent', '-p', 'MemoryPeak', '-p', 'NRestarts'])
    props = dict(line.split('=', 1) for line in properties.splitlines() if '=' in line)
    used = props.get('MemoryCurrent', '')
    if used.isdigit():
        lines.append(f"网关进程组内存：{int(used)/2**20:.0f} MiB；自动重启次数：{props.get('NRestarts', '?')}")
    lines.append('Claude 进程数（本次额度查询启动前）：' + str(len(run(['pgrep', '-u', 'harness', '-x', 'velella-claude']).splitlines())))
    return lines


def timings():
    # 只读取固定阶段元数据，不输出日志中的正文、身份或凭据。
    raw = run(['journalctl', '-u', 'velella-model-gateway', '--since', '24 hours ago', '-n', '5000', '-o', 'cat', '--no-pager'])
    requests = {}
    for line in raw.splitlines():
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if item.get('type') == 'gateway_timing':
            requests[item['requestId']] = item
    lines = []
    for rid, item in list(requests.items())[-5:]:
        if item.get('stage') == 'finished':
            stages = item.get('stages', {})
            def seconds(k):
                return f'{stages[k]/1000:.1f}s' if k in stages else '--'
            lines.append(f"{rid[:8]}  {item.get('outcome')}  总耗时 {item['elapsedMs']/1000:.1f}s  上游响应 {seconds('upstream_message_start')}  首字 {seconds('first_text')}")
        else:
            lines.append(f"{rid[:8]}  最后记录 {item.get('stage')}（请求开始后 {item.get('elapsedMs',0)/1000:.1f}s；未见结束记录）")
    return lines or ['最近 24 小时没有阶段记录。']


def quota():
    # 通过官方终端内置 /usage 查询；不读取 OAuth 文件、不向模型发送提示。
    lock = open('/run/lock/claude-relay-status.lock', 'w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        return ['另一个窗口正在查询额度，请稍后刷新。']
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 70, 160, 0, 0))
    cwd = '/home/harness/model-gateway/runtime-home'
    args = ['runuser', '-u', 'harness', '--', 'env', 'HOME=' + cwd,
            'CLAUDE_CONFIG_DIR=/home/harness/state/runtime-home/.claude',
            'DISABLE_AUTOUPDATER=1', 'DISABLE_TELEMETRY=1', 'DISABLE_ERROR_REPORTING=1',
            '/usr/local/bin/velella-claude', '--ax-screen-reader', '--setting-sources', '',
            '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', '']
    process = None
    data = b''
    sent = trusted = False
    try:
        process = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave,
                                   cwd=cwd, env=dict(os.environ, TERM='xterm-256color'), start_new_session=True)
        os.close(slave)
        slave = None
        deadline = time.monotonic() + 28
        last_change = time.monotonic()
        while time.monotonic() < deadline and len(data) < 512 * 1024:
            if not select.select([master], [], [], .2)[0]:
                if b'Settings  Status' in data and time.monotonic() - last_change > 2:
                    cleaned = clean_terminal(data)
                    if 'Failed to load usage data' in cleaned or re.search(r'\d+\s*%\s*(?:used|left|remaining)', cleaned, re.I):
                        break
                continue
            try:
                chunk = os.read(master, 65536)
            except OSError:
                break
            if not chunk:
                break
            data += chunk
            last_change = time.monotonic()
            if b'\x1b[6n' in chunk:
                os.write(master, b'\x1b[1;1R')
            # 仅信任指定的运行目录；禁用了用户设置、MCP 和内置工具。
            if not trusted and b'Enter y/n:' in data and cwd.encode() in data:
                time.sleep(.8)
                os.write(master, b'y')
                time.sleep(.3)
                os.write(master, b'\r')
                trusted = True
            if not sent and b'manual mode on' in data:
                time.sleep(1)
                os.write(master, b'/usage')
                time.sleep(.4)
                os.write(master, b'\r')
                sent = True
    finally:
        # 只清理本次查询的独立进程组，不能按进程名杀掉生产 Claude。
        if process is not None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
        if slave is not None:
            os.close(slave)
        os.close(master)
        lock.close()
    return quota_lines(clean_terminal(data))


def clean_terminal(data):
    text = data.decode('utf-8', errors='replace')
    text = re.sub(r'\x1b\][^\x07]*(?:\x07|\x1b\\)', '', text)
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]|\x1b[78]', '', text)
    return re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', text)


def quota_lines(text):
    fallback = '可按 B 打开官方用量网页：https://claude.ai/settings/usage'
    # 仅展示内置 Usage 面板，不把启动横幅中的账号身份输出到报告。
    if 'Settings  Status' in text:
        panel = text.rsplit('Settings  Status', 1)[-1]
        # 屏幕阅读器刷新时可能从第一个百分比开始，省略重复的 Current session 标题。
        panel = panel.replace('Esc to cancel', '\nCurrent session\n')
        windows = {}
        current = None
        for line in panel.splitlines():
            line = line.strip()
            if line.startswith(('Current session', 'Current week')):
                current = line
                windows.setdefault(current, {})
            elif current:
                match = re.search(r'(\d+(?:\.\d+)?)%\s*used', line)
                if match:
                    windows[current]['used'] = float(match.group(1))
                if line.startswith('Resets '):
                    windows[current]['reset'] = line[7:]
        lines = []
        for label, values in windows.items():
            if 'used' not in values:
                continue
            name = {'Current session': '5 小时额度', 'Current week (all models)': '每周额度（全部模型）'}.get(label, label)
            used = values['used']
            lines.append(f"{name}：剩余 {max(0, 100-used):g}% / 已用 {used:g}%；重置：{values.get('reset', '未提供')}")
        if lines:
            lines.append('重置时间保留官方面板的时区标注；比例为查询时快照。')
            return lines
    if 'Failed to load usage data' in text:
        return ['官方 CLI 返回：Failed to load usage data（未能加载订阅额度，不能据此判断剩余为零）。', fallback]
    if 'Select login method' in text or "Let's get started" in text:
        return ['官方 CLI 尚未完成终端初始化；请先交互启动 CLI 完成设置。', fallback]
    return ['未在 28 秒内读到官方额度面板，可能是连接超时或 CLI 界面变化。', fallback]


def main():
    result = {}
    for key, fn in [('resources', resources), ('timings', timings), ('quota', quota)]:
        try:
            result[key] = fn()
        except Exception as exc:
            result[key] = ['此项查询失败：' + type(exc).__name__]
    print(json.dumps(result, ensure_ascii=True))


if __name__ == '__main__':
    main()
