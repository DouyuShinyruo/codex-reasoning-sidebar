@echo off
rem Double-click launcher: starts the local server and the floating window.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\start-codex-reasoning-sidebar-float.ps1"
if errorlevel 1 (
  echo.
  echo Start failed. Please report the error message above.
  pause
)
