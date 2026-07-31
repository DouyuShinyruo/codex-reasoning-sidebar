$dir = $PSScriptRoot
$pidFile = Join-Path $dir ".server.pid"

if (-not (Test-Path $pidFile)) {
    Write-Host "not running"
    exit 0
}

$pid = Get-Content $pidFile -ErrorAction SilentlyContinue
if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $pid -Force
    Write-Host "stopped"
} else {
    Write-Host "process already gone"
}
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
