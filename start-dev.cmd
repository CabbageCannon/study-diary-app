@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0\dev.ps1"
if errorlevel 1 (
  echo.
  echo 项目启动失败，请查看上方错误。
  pause
)
endlocal
