# 注册当前用户登录触发的后台任务；无需保存密码，失败时使用用户启动目录。
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'start-local-frp.ps1'
$powershellPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '"'
$taskName = 'ClaudeCodeRelay-LocalFrp'
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description '当前用户登录后维护 Claude relay 的加密 FRP 隧道' -Force | Out-Null
} catch {
  # 无任务注册权限时，仅为当前用户创建隐藏启动快捷方式。
  $startup = [Environment]::GetFolderPath('Startup')
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut((Join-Path $startup ($taskName + '.lnk')))
  $link.TargetPath = $powershellPath
  $link.Arguments = $arguments
  $link.WindowStyle = 7
  $link.Description = 'Claude relay 加密 FRP 隧道'
  $link.Save()
  Start-Process -FilePath $powershellPath -ArgumentList $arguments -WindowStyle Hidden
  Write-Output '已配置当前用户登录自启动（启动目录）；隧道在后台运行。'
  exit 0
}
Start-ScheduledTask -TaskName $taskName
Write-Output '已配置当前用户登录自启动（计划任务）；隧道在后台运行。'
