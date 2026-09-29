# 在调用者的项目目录启动 OMP，仅在子进程环境中追加回环代理例外。
$ErrorActionPreference = 'Stop'
$previous = $env:NO_PROXY
try {
    $env:NO_PROXY = (@($previous, '127.0.0.1', 'localhost') | Where-Object { $_ }) -join ','
    $executable = if ($env:OMP_CLI) { $env:OMP_CLI } else { 'omp' }
    & $executable --model claude-code-relay/claude-code-deepseek @args
    if ($LASTEXITCODE -ne 0) { throw 'OMP 退出异常' }
} finally { $env:NO_PROXY = $previous }
