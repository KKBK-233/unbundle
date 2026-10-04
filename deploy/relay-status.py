"""桌面只读状态报告：通过 SSH 查资源，读取本机 CC Switch 用量记录。"""
import argparse
from contextlib import closing
import datetime as dt
import json
import pathlib
import sqlite3
import subprocess
import sys
import time
import webbrowser


def cache_rows(database, hours, limit):
    # 只读连接仍能看到 WAL 中的数据；只取统计字段，不读取请求正文和密钥。
    cutoff = int(time.time() - hours * 3600)
    with closing(sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True, timeout=3)) as db:
        db.row_factory = sqlite3.Row
        # 失败记录可能保留原始模型名；按同一应用及供应商关联，避免漏报或混入其他供应商。
        rows = db.execute('''WITH relay_providers AS (
            SELECT DISTINCT app_type, provider_id FROM proxy_request_logs
            WHERE model LIKE 'claude-code-%' AND created_at >= ?
        ) SELECT logs.created_at, logs.model, logs.status_code, logs.latency_ms,
            logs.input_tokens, logs.cache_read_tokens, logs.cache_creation_tokens, logs.input_token_semantics
            FROM proxy_request_logs AS logs WHERE logs.created_at >= ? AND (
                logs.model LIKE 'claude-code-%' OR EXISTS (
                    SELECT 1 FROM relay_providers AS relay
                    WHERE relay.app_type = logs.app_type AND relay.provider_id = logs.provider_id
                )
            ) ORDER BY logs.created_at DESC LIMIT ?''',
            (cutoff, cutoff, limit)).fetchall()
    return [dict(row) for row in rows]


def input_total(row):
    # CC Switch：1 是总输入，2 是未缓存输入；未知口径不能猜测命中率。
    fresh = row['input_tokens']
    if row['input_token_semantics'] == 1:
        return fresh
    if row['input_token_semantics'] == 2:
        return fresh + row['cache_read_tokens'] + row['cache_creation_tokens']
    return None


def show_cache(args):
    print('\n【缓存：本机 CC Switch 最近请求】')
    try:
        rows = cache_rows(args.database, args.hours, args.limit)
    except (sqlite3.Error, OSError) as exc:
        print('无法读取统计数据库：' + str(exc))
        return
    if not rows:
        print(f'最近 {args.hours:g} 小时没有 relay 请求记录。')
        return
    print('本地时间       模型                   状态  输入 tokens    命中率    耗时')
    total = read = eligible = 0
    for row in reversed(rows):
        n = input_total(row)
        valid = 200 <= row['status_code'] < 300 and n and n >= row['cache_read_tokens']
        ratio = f"{100 * row['cache_read_tokens'] / n:.1f}%" if valid else '--'
        if valid:
            total += n
            read += row['cache_read_tokens']
            eligible += 1
        stamp = dt.datetime.fromtimestamp(row['created_at']).strftime('%m-%d %H:%M:%S')
        print(f"{stamp}  {row['model']:<22} {row['status_code']:>3}  {n if n is not None else '?':>10}  {ratio:>7}  {row['latency_ms']/1000:>6.1f}s")
    if total:
        print(f'加权命中率：{read / total:.1%}（{read:,} / {total:,} 输入 tokens，{eligible} 条有用量的 2xx 记录）')
    print(f'范围：最近 {args.hours:g} 小时，最多 {args.limit} 条；进行中的请求完成后才计入。')
    print('每行是一轮模型请求，并非独立聊天；比例按 tokens 加权，不是各行百分比平均。')
    print('流式 HTTP 200 不保证推理完成；零用量记录不能判断是否消耗了订阅额度。')


def show_remote(args):
    print('\n通过 SSH 查询服务器资源和官方 /usage，请稍候（最长约 50 秒）…', flush=True)
    script = pathlib.Path(__file__).with_name('relay-status-remote.py').read_text(encoding='utf-8')
    ssh = ['ssh', '-F', 'NUL', '-i', str(args.identity), '-p', str(args.port),
           '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
           '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=5',
           '-o', 'ServerAliveCountMax=2']
    if args.relay:
        helper = pathlib.Path(__file__).with_name('ssh-relay-proxy.py')
        proxy = subprocess.list2cmdline([sys.executable, str(helper), '--relay', args.relay,
                                       '--identity', str(args.identity), '--host', '%h', '--port', '%p'])
        ssh += ['-o', 'ProxyCommand=' + proxy]
    ssh += [args.target, 'python3 -']
    try:
        result = subprocess.run(ssh, input=script, capture_output=True, encoding='utf-8', timeout=50)
        if result.returncode:
            print('SSH 查询失败：' + result.stderr.strip()[:600])
            return
        data = json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
        print('服务器查询未完成：' + str(exc))
        return
    print('\n【服务器资源】')
    for line in data['resources']:
        print(line)
    print('\n【最近云端请求阶段】')
    for line in data['timings']:
        print(line)
    print('\n【Claude 订阅额度：官方 /usage】')
    for line in data['quota']:
        print(line)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', required=True, help='SSH 用户@服务器')
    parser.add_argument('--port', type=int, default=22)
    parser.add_argument('--relay', help='可选 SSH 中继用户@地址，私钥继续保留在本机')
    parser.add_argument('--identity', type=pathlib.Path, default=pathlib.Path.home() / '.ssh/id_rsa')
    parser.add_argument('--database', type=pathlib.Path, default=pathlib.Path.home() / '.cc-switch/cc-switch.db')
    parser.add_argument('--hours', type=float, default=24)
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.limit <= 100 or not 0 < args.hours <= 720:
        parser.error('limit 须为 1..100，hours 须为 0..720 小时')
    while True:
        print('\n=== Claude Relay 状态 === ' + dt.datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S %Z'))
        print('只读查询，不发送模型对话；不会重启或中断正在运行的网关。')
        show_cache(args)
        show_remote(args)
        if args.once:
            break
        choice = input('\n[R] 刷新  [B] 打开官方额度网页  [回车] 退出：').strip().lower()
        if choice == 'b':
            webbrowser.open('https://claude.ai/settings/usage')
            input('请登录与云端相同的账号。按回车关闭窗口。')
            break
        if choice != 'r':
            break


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        main()
    except KeyboardInterrupt:
        print('\n已停止查询。')
