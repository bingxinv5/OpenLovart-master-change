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
echo [OK] Synced to the server directory.
echo [OK] Run the release launcher in the target directory to start Next and the Upscayl API.
pause