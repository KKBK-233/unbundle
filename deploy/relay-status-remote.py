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
import urllib.request


def run(args, timeout=5):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout).stdout.strip()


def read_status():
    # 密钥仅用于本机回环查询，返回运行计数，不读取 Claude 凭据。
    token = pathlib.Path('/home/harness/model-gateway/token').read_text().strip()
    request = urllib.request.Request('http://127.0.0.1:18796/status', headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.load(response)


def activity_lines(status, records, now):
    # 用实时队列计数交叉检查日志；历史未结束记录和存活进程不能单独证明任务仍在推进。
    running, queued = status.get('activeRequests'), status.get('queuedRequests')
    receiving = status.get('receivingRequests', 0)
    if not isinstance(running, int) or not isinstance(queued, int):
        return ['任务状态：未知（网关未提供实时请求计数）。']
    if running == 0:
        if receiving:
            return [f'任务状态：正在接收 {receiving} 个请求的正文；尚未进入模型推理，排队 {queued} 个。']
        if queued:
            return [f'任务状态：等待调度，排队 {queued} 个请求。']
        return ['任务状态：云端当前空闲；本地工具可能仍在执行，此处不能判断整个桌面任务已结束。']
    lines = [f'任务状态：云端运行中 {running} 个请求，排队 {queued} 个。']
    unfinished = [item for item in records if item.get('stage') != 'finished']
    unfinished.sort(key=lambda item: item.get('loggedAt', 0), reverse=True)
    for item in unfinished[:running]:
        logged = item.get('loggedAt')
        if not isinstance(logged, (int, float)):
            continue
        age = max(0, now - logged)
        elapsed = item.get('elapsedMs', 0) / 1000 + age
        progress = item.get('progress') or {}
        event = progress.get('event') or item.get('stage')
        phases = {'thinking': '思考事件（不能证明任务进展）', 'first_thinking': '思考事件（不能证明任务进展）', 'text': '输出正文', 'tool_delta': '生成工具参数',
                  'tool_start': '开始工具调用', 'first_tool': '开始工具调用', 'tool_stop': '工具调用生成完毕',
                  'mcp_call': '工具交接', 'api_retry': '上游重试', 'request_received': '接收请求体',
                  'queue_started': '等待调度', 'auth_started': '检查登录', 'cli_spawned': '等待上游',
                  'cli_session_created': '新建 CLI 会话', 'cli_session_reused': '续接 CLI 会话',
                  'upstream_message_start': '上游已响应'}
        phase = phases.get(event, '等待后续事件')
        # 实际进展可能早于本条日志写入时间，按事件时间补足间隔，不把统计采集视为模型进展。
        last_ms = progress.get('lastEventMs', item.get('elapsedMs', 0))
        age += max(0, (item.get('elapsedMs', 0) - last_ms) / 1000)
        recent_progress = event in ['text', 'tool_delta', 'tool_start', 'first_tool', 'tool_stop', 'mcp_call']
        state = '仍在继续' if recent_progress and age <= 60 else '运行中，尚不能确认有新进展'
        lines.append(f"  {str(item.get('requestId', '?'))[:8]}：{state}；阶段：{phase}；已运行 {elapsed:.0f} 秒；最近事件距今 {age:.0f} 秒。")
    if not unfinished:
        lines.append('  尚未读到对应阶段日志；稍后刷新确认。')
    lines.append('这是云端请求快照；不代表本地隧道或整个桌面任务一定正常。')
    return lines


def failure_lines(item):
    # 只依据明确阶段区分上传失败与推理中断，不能把断线等同于用户主动取消。
    stages = item.get('stages', {})
    entered_cli = any(stage in stages for stage in ['cli_spawned', 'cli_session_created', 'cli_session_reused', 'upstream_message_start'])
    lines = []
    upload = item.get('upload')
    if upload:
        lines.append(f"  请求上传：已收 {upload.get('receivedBytes', 0):,} 字节 / 预期 {upload.get('expectedBytes', '未知')} 字节。")
    if item.get('outcome') == 'success':
        return []
    if 'request_body_idle_timeout' in stages or 'request_body_timeout' in stages:
        lines.append('  原因：请求上传超时；未启动模型推理。请检查本地代理及隧道。')
    elif not entered_cli and item.get('stage') == 'finished':
        lines.append('  本轮未启动模型推理；中断发生在上传、校验或等待阶段。')
    if 'downstream_disconnected' in stages:
        lines.append('  检测到下游连接断开（本地代理、隧道或客户端取消）；无法仅凭云端区分来源。')
    if entered_cli and item.get('outcome') in ['cancelled', 'timeout', 'error']:
        lines.append('  本轮已进入 Claude 执行路径；即使本地显示零用量，也可能已消耗额度。')
    return lines


def activity():
    journal = ['journalctl']
    namespace = run(['systemctl', 'show', 'velella-model-gateway', '-p', 'LogNamespace', '--value'])
    if namespace and re.fullmatch(r'[A-Za-z0-9_-]+', namespace):
        journal.append('--namespace=' + namespace)
    # 只看本次服务实例，避免重启前遗留的未结束日志被认作当前任务。
    invocation = run(['systemctl', 'show', 'velella-model-gateway', '-p', 'InvocationID', '--value'])
    if not re.fullmatch(r'[0-9a-fA-F]{32}', invocation):
        return ['任务状态：未知（无法确认当前服务实例）。']
    raw = run(journal + ['_SYSTEMD_INVOCATION_ID=' + invocation, '-u', 'velella-model-gateway', '--since', '24 hours ago', '-n', '5000', '-o', 'json', '--no-pager'])
    records = {}
    for line in raw.splitlines():
        try:
            envelope = json.loads(line)
            item = json.loads(envelope['MESSAGE'])
            if item.get('type') != 'gateway_timing':
                continue
            item['loggedAt'] = int(envelope['__REALTIME_TIMESTAMP']) / 1000000
            records[item['requestId']] = item
        except (ValueError, KeyError, TypeError):
            continue
    return activity_lines(read_status(), list(records.values()), time.time())


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
    lines.append('服务器时间：' + run(['date', '+%Y-%m-%d %H:%M:%S %Z %z'])
                 + '（' + run(['timedatectl', 'show', '-p', 'Timezone', '--value']) + '）')
    for unit in ['velella-model-gateway', 'velella-model-frpc']:
        lines.append(f'{unit}：' + run(['systemctl', 'is-active', unit]))
    properties = run(['systemctl', 'show', 'velella-model-gateway', '-p', 'MemoryCurrent', '-p', 'MemoryPeak', '-p', 'NRestarts'])
    props = dict(line.split('=', 1) for line in properties.splitlines() if '=' in line)
    used = props.get('MemoryCurrent', '')
    if used.isdigit():
        lines.append(f"网关进程组内存：{int(used)/2**20:.0f} MiB；自动重启次数：{props.get('NRestarts', '?')}")
    lines.append('Claude 进程数（本次额度查询启动前）：' + str(len(run(['pgrep', '-u', 'harness', '-x', 'velella-claude']).splitlines())))
    # 网关密钥仅在本机回环请求中使用，不进入输出，也不读取 Claude OAuth 凭据。
    try:
        status = read_status()
        cli_version = status.get('cliVersion') or run(['/usr/local/bin/velella-claude', '--version'])
        if cli_version:
            lines.append('Claude CLI：' + cli_version)
            lines.append('CLI 自动更新定时器：' + run(['systemctl', 'is-active', 'velella-cli-update.timer']))
        if status.get('relayHost'):
            lines.append('frps 中继：' + status['relayHost'] + '（此处未查询中继状态）')
            lines.append('velella-model-vless：' + run(['systemctl', 'is-active', 'velella-model-vless']))
        else:
            lines.append('harness-frps：' + run(['systemctl', 'is-active', 'harness-frps']))
        if 'activeRequests' in status:
            lines.append(f"推理队列：运行 {status['activeRequests']} / {status['maxConcurrent']}，等待 {status['queuedRequests']} / {status['maxQueued']}")
            lines.append(f"上下文预算声明：{status.get('contextWindow', '?')} tokens（客户端须配置对应压缩阈值）")
    except (OSError, ValueError):
        lines.append('推理队列：暂时无法读取网关状态。')
    return lines


def timings():
    # 只读取固定阶段元数据，不输出日志中的正文、身份或凭据。
    journal = ['journalctl']
    namespace = run(['systemctl', 'show', 'velella-model-gateway', '-p', 'LogNamespace', '--value'])
    if namespace and re.fullmatch(r'[A-Za-z0-9_-]+', namespace):
        journal.append('--namespace=' + namespace)
    raw = run(journal + ['-u', 'velella-model-gateway', '--since', '24 hours ago', '-n', '5000', '-o', 'cat', '--no-pager'])
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
        progress = item.get('progress')
        if progress:
            lines.append(f"  事件 {progress.get('event', '?')}，发生于 {progress.get('lastEventMs',0)/1000:.1f}s；工具参数 {progress.get('toolArgumentBytes',0):,} 字节；待完成块 {progress.get('pendingTools',0)}；已观察重试 {progress.get('retryEvents',0)}")
        lines.extend(failure_lines(item))
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
    # /usage 由官方 CLI 按时区格式化；显式采用服务器设置，避免继承查询进程的旧 TZ。
    timezone = run(['timedatectl', 'show', '-p', 'Timezone', '--value'])
    args = ['runuser', '-u', 'harness', '--', 'env', 'HOME=' + cwd,
            'CLAUDE_CONFIG_DIR=/home/harness/state/runtime-home/.claude',
            'DISABLE_AUTOUPDATER=1', 'DISABLE_TELEMETRY=1', 'DISABLE_ERROR_REPORTING=1',
            '/usr/local/bin/velella-claude', '--ax-screen-reader', '--setting-sources', '',
            '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', '']
    if timezone:
        args.insert(args.index('env') + 1, 'TZ=' + timezone)
    process = None
    data = b''
    sent = trusted = False
    pending_keys = []
    try:
        process = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave,
                                   cwd=cwd, env=dict(os.environ, TERM='xterm-256color'), start_new_session=True)
        os.close(slave)
        slave = None
        deadline = time.monotonic() + 28
        last_change = time.monotonic()
        while time.monotonic() < deadline and len(data) < 512 * 1024:
            # 发键间隔继续读取并响应终端光标查询，避免阻塞 sleep 让新版界面丢失确认键。
            while pending_keys and pending_keys[0][0] <= time.monotonic():
                _, key = pending_keys.pop(0)
                os.write(master, key)
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
                now = time.monotonic()
                pending_keys.extend([(now + .8, b'y'), (now + 1.8, b'\r')])
                trusted = True
            if not sent and terminal_ready(clean_terminal(data)):
                now = time.monotonic()
                pending_keys.extend([(now + .8, b'/usage'), (now + 1.8, b'\r')])
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


def terminal_ready(text):
    # 新版终端可显示 auto 等模式；只在官方主界面就绪后发送内置 /usage。
    return bool(re.search(r'(?m)^Claude Code v\d+\.\d+\.\d+', text)
                and re.search(r'(?m)^[A-Za-z][A-Za-z -]* mode on\b', text))


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
                    # 终端增量刷新可能省略标题；保留首个完整面板，防止读数串到另一额度项。
                    windows[current].setdefault('used', float(match.group(1)))
                if line.startswith('Resets '):
                    windows[current].setdefault('reset', line[7:])
                # 两项均完整后结束解析，后续刷新片段不再参与这次快照。
                labels = ['Current session', 'Current week (all models)']
                if all('used' in windows.get(label, {}) and 'reset' in windows[label] for label in labels):
                    break
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
    for key, fn in [('activity', activity), ('resources', resources), ('timings', timings), ('quota', quota)]:
        try:
            result[key] = fn()
        except Exception as exc:
            result[key] = ['此项查询失败：' + type(exc).__name__]
    print(json.dumps(result, ensure_ascii=True))


if __name__ == '__main__':
    main()
