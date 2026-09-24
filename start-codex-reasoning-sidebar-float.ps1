$ErrorActionPreference = "Stop"

$dir = $PSScriptRoot

# 1. Make sure the HTTP/SSE server is running.
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir "start-codex-reasoning-sidebar.ps1")

# 2. Electron runtime lives in a dedicated dir so the plugin folder (and the
#    marketplace cache copy) stays small. Installed once, reused afterwards.
$runtimeDir = Join-Path $env:LOCALAPPDATA "codex-reasoning-sidebar"
$electron = Join-Path $runtimeDir "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electron)) {
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    Write-Host "Installing Electron runtime (one-time setup)..."
    & npm install --prefix $runtimeDir electron --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw "npm install electron failed" }
}

$main = Join-Path $dir "float-main.mjs"
$sessionId = (Get-Process -Id $PID).SessionId

if ($sessionId -eq 0) {
    # Running from a non-interactive session (e.g. a service context); GUI
    # apps cannot start there. Ask the user's running Explorer to launch
    # Electron so it gets a real interactive desktop (Chromium/GPU cannot
    # initialize properly under a scheduled-task context).
    $userName = (Get-CimInstance Win32_ComputerSystem).UserName
    if (-not $userName) { throw "No interactive user session found; log in first." }

    $launched = $false
    try {
        $shellWindows = New-Object -ComObject Shell.Windows
        if ($shellWindows.Count -gt 0) {
            $shell = $shellWindows.Item(0).Document.Application
            $shell.ShellExecute($electron, "`"$main`"", $dir, "open", 1)
            $launched = $true
            Write-Host "Floating sidebar launched via Explorer ($userName)."
        }
    } catch {
        Write-Host "Explorer launch failed, falling back to scheduled task: $($_.Exception.Message)"
    }
    if (-not $launched) {
        $taskName = "CodexReasoningSidebarFloat"
        $action = New-ScheduledTaskAction -Execute $electron -Argument "`"$main`"" -WorkingDirectory $dir
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
    }
} else {
    Start-Process -FilePath $electron -ArgumentList "`"$main`"" -WorkingDirectory $dir -WindowStyle Hidden
    Write-Host "Floating sidebar launched."
}
