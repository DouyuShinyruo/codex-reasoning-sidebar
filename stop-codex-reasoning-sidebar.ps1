$dir = $PSScriptRoot
$pidFile = Join-Path $dir ".server.pid"

if (-not (Test-Path $pidFile)) {
    Write-Host "not running"
    exit 0
}

$serverPid = Get-Content $pidFile -ErrorAction SilentlyContinue
if ($serverPid -and (Get-Process -Id $serverPid -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $serverPid -Force
    Write-Host "stopped"
} else {
    Write-Host "process already gone"
}
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
