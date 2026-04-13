@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title OpenLovart Production

set "SCRIPT_DIR=%~dp0"
set "DEPS_STAMP=.openlovart-deps-installed.stamp"
set "NEEDS_INSTALL=0"
set "UPSCAYL_PORT=3001"
set "PORT=3000"
set "UPSCAYL_OUTPUT_MODE=inline"

if /I "%OPENLOVART_UPSCAYL_MODE%"=="hidden" (
    set "UPSCAYL_OUTPUT_MODE=hidden"
) else if /I "%OPENLOVART_UPSCAYL_MODE%"=="window" (
    set "UPSCAYL_OUTPUT_MODE=window"
)

if /I "%OPENLOVART_UPSCAYL_WINDOW%"=="1" (
    set "UPSCAYL_OUTPUT_MODE=window"
)

echo.
echo  ========================================
echo    OpenLovart - Production Server
echo  ========================================
echo.

pushd "%SCRIPT_DIR%" 2>nul || (
    echo  [ERROR] Cannot access project directory: %SCRIPT_DIR%
    pause
    exit /b 1
)

if not exist "package.json" (
    echo  [ERROR] package.json not found in: %CD%
    popd
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found!
    popd
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  [OK] Node.js: %NODE_VER%

if not exist "node_modules\." (
    set "NEEDS_INSTALL=1"
) else if not exist "%DEPS_STAMP%" (
    set "NEEDS_INSTALL=1"
)

if "!NEEDS_INSTALL!"=="1" (
    echo.
    echo  [..] Installing root dependencies...
    call npm install --no-fund --no-audit
    if !errorlevel! neq 0 (
        echo  [ERROR] npm install failed.
        popd
        pause
        exit /b 1
    )
    type nul > "%DEPS_STAMP%"
)

if not exist ".env.local" (
    if exist ".env" (
        copy /y ".env" ".env.local" >nul
        echo  [OK] Config copied from .env
    ) else if exist ".env.example" (
        copy /y ".env.example" ".env.local" >nul
        echo  [OK] Config copied from .env.example
    )
)

echo.
echo  [..] Ensuring Upscayl API service...
powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\ensure_upscayl_service.ps1" -ProjectRoot "%CD%" -Port %UPSCAYL_PORT% -InstallDependencies -OutputMode %UPSCAYL_OUTPUT_MODE%
if !errorlevel! neq 0 (
    echo  [WARN] Upscayl API is unavailable. Split storyboard AI upscale will fall back to original images.
) else (
    if /I "%UPSCAYL_OUTPUT_MODE%"=="inline" (
        echo  [OK] Upscayl API ready in this window: http://127.0.0.1:%UPSCAYL_PORT%
    ) else if /I "%UPSCAYL_OUTPUT_MODE%"=="hidden" (
        echo  [OK] Upscayl API ready in background: http://127.0.0.1:%UPSCAYL_PORT%
    ) else (
        echo  [OK] Upscayl API ready in a separate window: http://127.0.0.1:%UPSCAYL_PORT%
    )
)

node -e "var s=require('net').createServer();s.once('error',function(){process.exit(1)});s.listen(%PORT%,function(){s.close();process.exit(0)})" >nul 2>&1
if !errorlevel! neq 0 (
    echo  [ERROR] Port %PORT% is occupied by another process.
    popd
    pause
    exit /b 1
)

echo.
echo  [..] Building production bundle...
call npm run build
if !errorlevel! neq 0 (
    echo  [ERROR] Production build failed.
    popd
    pause
    exit /b 1
)

echo.
echo  ----------------------------------------
echo   URL: http://localhost:%PORT%
echo   Press Ctrl+C to stop
echo  ----------------------------------------
echo.

call npx next start -H 0.0.0.0 -p %PORT%

echo.
echo  [!!] Production server stopped.
popd
pause