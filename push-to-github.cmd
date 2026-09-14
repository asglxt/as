@echo off
chcp 65001 >nul
title 推送学校管理系统到 GitHub
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\push-to-github.ps1"
echo.
echo ============================================
echo 按任意键关闭此窗口...
pause >nul