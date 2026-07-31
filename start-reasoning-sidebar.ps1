$dir = $PSScriptRoot
$pidFile = Join-Path $dir ".server.pid"
$node = (Get-Command node).Source

if (Test-Path $pidFile) {
    $old = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {
        Write-Host "already running at http://127.0.0.1:8792"
        exit 0
    }
}

$proc = Start-Process -FilePath $node -ArgumentList (Join-Path $dir "server.mjs") -WindowStyle Hidden -PassThru
$proc.Id | Set-Content $pidFile
Start-Sleep -Milliseconds 800
Write-Host "reasoning sidebar: http://127.0.0.1:8792"
