$ErrorActionPreference = "Stop"

$dir = $PSScriptRoot

# 1. Make sure the HTTP/SSE server is running.
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "start-codex-reasoning-sidebar.ps1")

# 2. Make sure pywebview is available for the floating window.
$pywebviewOk = & python -c "import webview; print('ok')" 2>$null
if ($pywebviewOk -ne "ok") {
    Write-Host "Installing pywebview (one-time setup)..."
    & python -m pip install --user pywebview
    if ($LASTEXITCODE -ne 0) { throw "pip install pywebview failed" }
}

# 3. Launch the floating window without a console (pythonw).
$pythonw = Join-Path (Split-Path (Get-Command python).Source -Parent) "pythonw.exe"
if (-not (Test-Path $pythonw)) { $pythonw = (Get-Command python).Source }

Start-Process -FilePath $pythonw -ArgumentList (Join-Path $dir "float-sidebar.pyw") -WindowStyle Hidden
Write-Host "Floating sidebar launched."
