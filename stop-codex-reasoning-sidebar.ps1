$dir = $PSScriptRoot
$pidFile = Join-Path $dir ".server.pid"

# Close the floating window FIRST: its watchdog would restart the server
# within 30s if we stopped the server while the window is still open.
$floats = Get-CimInstance Win32_Process -Filter "name='electron.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'float-main\.mjs' }
foreach ($f in $floats) {
    Stop-Process -Id $f.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "floating window closed"
}

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
