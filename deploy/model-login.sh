#!/bin/bash
# 管理员在云端终端执行；官方 CLI 自行保存登录，不向网关传递认证令牌。
set -euo pipefail
exec runuser -u harness -- env HOME=/home/harness/model-gateway/runtime-home \
  CLAUDE_CONFIG_DIR=/home/harness/state/runtime-home/.claude \
  /usr/local/bin/velella-claude auth login
