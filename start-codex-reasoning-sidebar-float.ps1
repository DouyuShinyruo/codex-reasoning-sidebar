$ErrorActionPreference = "Stop"

$dir = $PSScriptRoot

# 1. Make sure the HTTP/SSE server is running.
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "start-codex-reasoning-sidebar.ps1")

# 2. Find a Python interpreter that has pywebview available.
function Test-Pywebview {
    param([string]$Exe)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Exe -c "import webview" 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $prev
    }
}

$pythons = @()
foreach ($name in @("python", "python3", "py")) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { $pythons += $cmd.Source }
}
$known = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"
if ((Test-Path $known) -and ($pythons -notcontains $known)) { $pythons += $known }

$python = $null
foreach ($p in $pythons) {
    if (Test-Pywebview $p) { $python = $p; break }
}

if (-not $python) {
    $python = $pythons | Select-Object -First 1
    if (-not $python) { throw "Python not found. Install Python 3.10+ and pywebview first." }
    Write-Host "Installing pywebview (one-time setup)..."
    & $python -m pip install --user pywebview
    if ($LASTEXITCODE -ne 0) { throw "pip install pywebview failed" }
}

# 3. Launch the floating window without a console (pythonw when available).
$pythonw = Join-Path (Split-Path $python -Parent) "pythonw.exe"
if (-not (Test-Path $pythonw)) { $pythonw = $python }

$target = Join-Path $dir "float-sidebar.pyw"
$sessionId = (Get-Process -Id $PID).SessionId

if ($sessionId -eq 0) {
    # Running from a non-interactive session (e.g. a service context).
    # WebView2 cannot start there, so relay the launch into the interactive
    # user's session via a one-shot scheduled task.
    $userName = (Get-CimInstance Win32_ComputerSystem).UserName
    if (-not $userName) { throw "No interactive user session found; log in first." }

    $taskName = "CodexReasoningSidebarFloat"
    $action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$target`"" -WorkingDirectory $dir
    $principal = New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
    $task = New-ScheduledTask -Action $action -Principal $principal -Settings $settings
    Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
    try {
        Start-ScheduledTask -TaskName $taskName
        Write-Host "Floating sidebar launched in interactive session ($userName)."
    } finally {
        Start-Sleep -Seconds 2
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    }
} else {
    Start-Process -FilePath $pythonw -ArgumentList $target -WindowStyle Hidden
    Write-Host "Floating sidebar launched with $pythonw"
}
