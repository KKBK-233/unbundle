# 从 Windows 打开新机的官方登录流程；浏览器授权仍由账号持有人完成。
$ErrorActionPreference = 'Stop'
$relayRoot = Split-Path -Parent $PSScriptRoot
$cloud = Get-Content -LiteralPath (Join-Path $relayRoot '.local/cloud.json') -Raw | ConvertFrom-Json
$identity = if ($cloud.identity) { $cloud.identity } else { Join-Path $env:USERPROFILE '.ssh/id_rsa' }
$user = if ($cloud.user) { $cloud.user } else { 'root' }
$port = if ($cloud.sshPort) { $cloud.sshPort } else { 22 }
$sshArgs = @('-F', 'NUL', '-i', $identity, '-p', $port, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-tt')
if ($cloud.sshRelay) {
  $python = (Get-Command python -ErrorAction Stop).Source
  $helper = Join-Path $PSScriptRoot 'ssh-relay-proxy.py'
  $proxy = '"' + $python + '" "' + $helper + '" --relay "' + $cloud.sshRelay + '" --identity "' + $identity + '" --host %h --port %p'
  $sshArgs += @('-o', ('ProxyCommand=' + $proxy))
}
$sshArgs += @(($user + '@' + $cloud.host), 'bash /home/harness/app/deploy/model-login.sh')
& ssh @sshArgs
if ($LASTEXITCODE -ne 0) { throw "登录命令退出：$LASTEXITCODE" }
