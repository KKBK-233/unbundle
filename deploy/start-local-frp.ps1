# 登录后仅维护本地加密隧道；不启动 OMP，不调用模型，不执行本地工具。
$ErrorActionPreference = 'Stop'
$relayRoot = Split-Path -Parent $PSScriptRoot
$privateFolder = Join-Path $relayRoot '.local/model-gateway'
$frpConfig = Join-Path $privateFolder 'visitor.toml'
$cloud = Get-Content -LiteralPath (Join-Path $relayRoot '.local/cloud.json') -Raw | ConvertFrom-Json
$frpc = if ($cloud.frpc) { $cloud.frpc } else { Join-Path $relayRoot '.local/frp/frp_0.71.0_windows_amd64/frpc.exe' }
if ($cloud.vlessBin -and (-not (Test-Path -LiteralPath $cloud.vlessBin) -or -not (Test-Path -LiteralPath $cloud.vlessConfig))) { throw '缺少 VLESS 客户端或配置' }
if (-not (Test-Path -LiteralPath $frpc) -or -not (Test-Path -LiteralPath $frpConfig)) { throw '缺少 frpc 或加密隧道配置' }
$mutex = [System.Threading.Mutex]::new($false, 'Local\ClaudeCodeRelayLocalFrp')
$owned = $false
try {
  try { $owned = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
  if (-not $owned) { exit 0 }
  # 启动入口可能已启动同一隧道；等它结束再接管，避免重复绑定端口。
  while ($true) {
    # 可选 VLESS 外层独立保活，不修改用户当前 VPN 客户端的配置。
    if ($cloud.vlessBin) {
      $vless = Get-CimInstance Win32_Process -Filter "Name='sing-box.exe'" | Where-Object {
        $_.ExecutablePath -and $_.ExecutablePath.Replace('\', '/') -eq $cloud.vlessBin.Replace('\', '/') -and $_.CommandLine -and
        $_.CommandLine.Replace('\', '/').Contains($cloud.vlessConfig.Replace('\', '/'))
      } | Select-Object -First 1
      if (-not $vless) {
        Start-Process -FilePath $cloud.vlessBin -ArgumentList @('run', '-c', ('"' + $cloud.vlessConfig + '"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $privateFolder 'vless.out.log') -RedirectStandardError (Join-Path $privateFolder 'vless.err.log')
      }
    }
    $existing = Get-CimInstance Win32_Process -Filter "Name='frpc.exe'" | Where-Object {
      $_.ExecutablePath -and $_.ExecutablePath.Replace('\', '/') -eq $frpc.Replace('\', '/') -and $_.CommandLine -and
      $_.CommandLine.Replace('\', '/').Contains($frpConfig.Replace('\', '/'))
    } | Select-Object -First 1
    if (-not $existing) {
      $outLog = Join-Path $privateFolder 'autostart-frp.out.log'
      $errLog = Join-Path $privateFolder 'autostart-frp.err.log'
      foreach ($logFile in @($outLog, $errLog)) {
        if (Test-Path -LiteralPath $logFile) { Move-Item -LiteralPath $logFile -Destination ($logFile + '.previous') -Force }
      }
      Start-Process -FilePath $frpc -ArgumentList @('-c', ('"' + $frpConfig + '"')) -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    }
    Start-Sleep -Seconds 10
  }
} finally {
  if ($owned) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
