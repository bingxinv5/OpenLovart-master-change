@echo off
chcp 65001 >nul 2>&1
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\sync_to_server.ps1"

if errorlevel 1 (
    echo.
    echo [ERROR] Sync failed. Check the output above.
    pause
    exit /b 1
)

echo.
echo [OK] Source-free runtime published to Z:\TD\AI\OpenLovart-master.
echo [OK] Production launcher: Z:\TD\AI\AI画布启动服务.bat
pause
