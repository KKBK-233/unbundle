"""通过指定中继执行部署和只读 SSH 查询；不复制本地 SSH 私钥。"""
import argparse
import os
import pathlib
import shlex
import subprocess
import sys


def command(host, port):
    # 转发标准输入输出，适用于中继未启用 OpenSSH TCP 转发的已有配置。
    if not 1 <= int(port) <= 65535:
        raise ValueError('目标端口无效')
    remote = '''import socket,sys,os,select
s=socket.create_connection((sys.argv[1],int(sys.argv[2])),10)
while True:
 ready,_,_=select.select([s,sys.stdin.buffer],[],[])
 if s in ready:
  data=s.recv(65536)
  if not data:break
  sys.stdout.buffer.write(data);sys.stdout.buffer.flush()
 if sys.stdin.buffer in ready:
  data=os.read(sys.stdin.fileno(),65536)
  if not data:break
  s.sendall(data)
'''
    return 'python3 -u -c ' + shlex.quote(remote) + ' ' + shlex.quote(host) + ' ' + str(int(port))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--relay', required=True)
    parser.add_argument('--identity', required=True, type=pathlib.Path)
    parser.add_argument('--host', required=True)
    parser.add_argument('--port', required=True, type=int)
    args = parser.parse_args()
    if args.relay.startswith('-'):
        parser.error('中继地址无效')
    config = 'NUL' if os.name == 'nt' else '/dev/null'
    result = subprocess.run(['ssh', '-F', config, '-i', str(args.identity), '-o', 'BatchMode=yes',
                             '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10',
                             args.relay, command(args.host, args.port)])
    sys.exit(result.returncode)


if __name__ == '__main__':
    main()
