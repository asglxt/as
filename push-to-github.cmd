@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\push-to-github.ps1"
echo.
echo --------------------------------------------
echo Done. Press any key to close this window.
pause >nul