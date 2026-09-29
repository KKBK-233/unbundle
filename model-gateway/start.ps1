# 独立启动模型服务，密钥仅用于本次进程，并恢复原工作目录。
$ErrorActionPreference = 'Stop'
$previous = $env:DEEPSEEK_API_KEY
Push-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
try {
    if (-not $env:DEEPSEEK_API_KEY) {
        $secret = Read-Host '输入 DeepSeek API Key（隐藏输入）' -AsSecureString
        $env:DEEPSEEK_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password.Trim()
    }
    node model-gateway/server.mjs
    if ($LASTEXITCODE -ne 0) { throw '模型服务退出异常' }
} finally {
    $env:DEEPSEEK_API_KEY = $previous
    Pop-Location
}
