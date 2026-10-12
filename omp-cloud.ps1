# 在当前项目目录启动 OMP，通过 frp 加密隧道使用云端 Claude Code。
node "$PSScriptRoot/model-gateway/cloud-client.mjs" @args
exit $LASTEXITCODE
