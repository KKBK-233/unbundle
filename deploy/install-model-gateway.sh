#!/bin/bash
# 安装回环模型网关和 STCP 发布端，复用现有双向 TLS frps。
set -euo pipefail
app=/home/harness/app
state=/home/harness/model-gateway
source_dir="$app/.local/model-gateway"
# 在覆盖已安装程序前检查协议版本；保留旧认证目录，避免登录失效。
"$app/node/bin/node" "$app/model-gateway/cli-compat.mjs" /home/harness/.local/bin/claude
install -d -o harness -g harness -m 700 "$state" "$state/runtime-home" "$state/pki" /home/harness/state/runtime-home /home/harness/state/runtime-home/.claude
install -o harness -g harness -m 600 "$source_dir/cloud-token" "$state/token"
install -o harness -g harness -m 600 "$source_dir/cloud-frpc.toml" "$state/frpc.toml"
for file in cloud.crt cloud.key; do
  install -o harness -g harness -m 600 "$source_dir/$file" "$state/pki/$file"
done
install -m 755 "$app/.local/frp/frp_0.71.0_linux_amd64/frpc" /usr/local/bin/velella-frpc
restorecon -F /usr/local/bin/velella-frpc
# systemd 服务使用标准可执行目录，避免用户主目录的 SELinux 执行标签。
install -m 755 "$app/node/bin/node" /usr/local/bin/velella-node
install -m 755 /home/harness/.local/bin/claude /usr/local/bin/velella-claude
restorecon -F /usr/local/bin/velella-node /usr/local/bin/velella-claude
chown -R harness:harness "$app/model-gateway"
runuser -u harness -- /usr/local/bin/velella-frpc verify -c "$state/frpc.toml"
install -m 644 "$app/deploy/model-gateway.service" /etc/systemd/system/velella-model-gateway.service
install -m 644 "$app/deploy/model-frpc.service" /etc/systemd/system/velella-model-frpc.service
systemctl daemon-reload
systemctl enable --now velella-model-gateway.service velella-model-frpc.service
