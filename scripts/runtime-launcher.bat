@echo off
chcp 65001 >nul 2>&1
setlocal
title OpenLovart

set "SOURCE_ROOT=Z:\TD\AI\OpenLovart-master"
set "LOCAL_ROOT=%LOCALAPPDATA%\OpenLovartRuntime\OpenLovart-runtime"
set "LAUNCHER="

if exist "%SOURCE_ROOT%\runtime-launcher.ps1" (
    set "LAUNCHER=%SOURCE_ROOT%\runtime-launcher.ps1"
) else if exist "%LOCAL_ROOT%\runtime-launcher.ps1" (
    set "LAUNCHER=%LOCAL_ROOT%\runtime-launcher.ps1"
)

if not defined LAUNCHER (
    echo.
    echo [ERROR] OpenLovart source-free runtime was not found.
    echo [ERROR] Network: %SOURCE_ROOT%
    echo [ERROR] Local  : %LOCAL_ROOT%
    echo.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%" -SourceRoot "%SOURCE_ROOT%" -LocalRoot "%LOCAL_ROOT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] OpenLovart failed with exit code %EXIT_CODE%.
    pause
)

exit /b %EXIT_CODE%
