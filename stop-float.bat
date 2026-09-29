@echo off
rem Double-click stopper: closes the floating window, then stops the server.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\stop-codex-reasoning-sidebar.ps1"
if errorlevel 1 pause
