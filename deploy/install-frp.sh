#!/bin/bash
# 独立安装本项目 frps；只接收服务端证书、CA 公钥和令牌。
set -euo pipefail
app=/home/harness/app
source_dir="$app/.local/frp"
# 端口直接取自生成配置，拒绝缺失、重复或越界值。
port=$(sed -nE 's/^bindPort[[:space:]]*=[[:space:]]*([0-9]+)[[:space:]]*$/\1/p' "$source_dir/frps.server.toml")
[[ "$port" =~ ^[0-9]+$ ]] && ((10#$port >= 1 && 10#$port <= 65535)) || { printf 'frps bindPort 无效\n' >&2; exit 1; }
target=/etc/harness-frp
install -d -o root -g harness -m 750 "$target" "$target/pki"
install -o root -g harness -m 750 "$source_dir/frp_0.71.0_linux_amd64/frps" /usr/local/bin/harness-frps
for file in ca.crt server.crt server.key; do
  install -o root -g harness -m 640 "$source_dir/pki/$file" "$target/pki/$file"
done
install -o root -g harness -m 640 "$source_dir/token" "$target/token"
install -o root -g harness -m 640 "$source_dir/frps.server.toml" "$target/frps.toml"
restorecon -F /usr/local/bin/harness-frps
restorecon -RF "$target"
runuser -u harness -- /usr/local/bin/harness-frps verify -c "$target/frps.toml"
install -m 644 "$app/deploy/harness-frps.service" /etc/systemd/system/harness-frps.service
systemctl daemon-reload
systemctl enable --now harness-frps
systemctl restart harness-frps
for attempt in {1..20}; do
  if ss -Hltn "sport = :$port" | grep -q .; then break; fi
  sleep 0.2
done
systemctl is-active --quiet harness-frps
ss -Hltn "sport = :$port" | grep -q .
# 不重载整个防火墙，只添加本服务的 TLS 接入端口。
firewall-cmd --zone=public --add-port="$port/tcp"
firewall-cmd --permanent --zone=public --add-port="$port/tcp"
printf 'frps 已启动：%s/TCP；模型入口继续只监听云端回环地址。\n' "$port"
