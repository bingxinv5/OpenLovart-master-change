@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title OpenLovart

set "FIXED_PROJECT_ROOT=Z:\TD\TimeTable\AI\OpenLovart-master"
set "SCRIPT_DIR=%~dp0"
set "SOURCE_DIR="
set "TARGET_DIR="
set "LOCAL_RUNTIME=%LOCALAPPDATA%\OpenLovartRuntime\OpenLovart-master"
set "SOURCE_IS_NETWORK=0"
set "DEPS_STAMP=.openlovart-deps-installed.stamp"
set "NEEDS_INSTALL=0"
set "ALLOW_PORT_FALLBACK=0"
set "FALLBACK_PORT=3001"
set "UPSCAYL_PORT=3001"
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
echo    OpenLovart - Local Dev Server
echo  ========================================
echo.

:: Prefer fixed project directory; fall back to script directory
if exist "%FIXED_PROJECT_ROOT%\package.json" (
    set "SOURCE_DIR=%FIXED_PROJECT_ROOT%"
    echo  [OK] Using fixed project directory: %FIXED_PROJECT_ROOT%
) else (
    set "SOURCE_DIR=%SCRIPT_DIR%"
    echo  [!!] Fixed project directory unavailable, falling back to script directory
)

:: Switch to source directory first
pushd "%SOURCE_DIR%" 2>nul || (
    echo  [ERROR] Cannot access project directory: %SOURCE_DIR%
    pause
    exit /b 1
)

if not exist "package.json" (
    echo  [ERROR] package.json not found in: %CD%
    echo.
    echo  Expected project path:
    echo    %FIXED_PROJECT_ROOT%
    echo.
    echo  Please run this script from the real project folder, or restore the project files.
    popd
    pause
    exit /b 1
)

for %%d in ("%CD%") do set "SOURCE_DRIVE=%%~dd"
net use !SOURCE_DRIVE! >nul 2>&1
if !errorlevel! equ 0 (
    set "SOURCE_IS_NETWORK=1"
)

if "!SOURCE_IS_NETWORK!"=="1" (
    echo  [!!] Shared/network project detected
    echo  [..] Syncing source to local runtime: %LOCAL_RUNTIME%
    if not exist "%LOCAL_RUNTIME%" mkdir "%LOCAL_RUNTIME%" >nul 2>&1
    robocopy "%CD%" "%LOCAL_RUNTIME%" /MIR /XD node_modules .next .git >nul
    if !errorlevel! geq 8 (
        echo  [ERROR] Failed to sync project to local runtime.
        echo  Source: %CD%
        echo  Target: %LOCAL_RUNTIME%
        popd
        pause
        exit /b 1
    )
    popd
    pushd "%LOCAL_RUNTIME%" 2>nul || (
        echo  [ERROR] Cannot access local runtime directory: %LOCAL_RUNTIME%
        pause
        exit /b 1
    )
    set "TARGET_DIR=%LOCAL_RUNTIME%"
    echo  [OK] Running from local runtime: %LOCAL_RUNTIME%
) else (
    set "TARGET_DIR=%CD%"
)

echo  [OK] Source directory : %SOURCE_DIR%
echo  [OK] Runtime directory: %CD%
echo  [OK] Working directory: %CD%
echo.

:: ====== 1. Check Node.js ======
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found!
    echo.
    echo  Please install Node.js first:
    echo    Download: https://nodejs.org
    echo    Version:  v20 LTS or higher
    echo    Check "Add to PATH" during installation
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  [OK] Node.js: %NODE_VER%

:: ====== 2. Install dependencies ======
if not exist "node_modules\." (
    set "NEEDS_INSTALL=1"
) else if not exist "%DEPS_STAMP%" (
    set "NEEDS_INSTALL=1"
) else (
    for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$stamp=Join-Path (Get-Location) '.openlovart-deps-installed.stamp'; $pkg=Join-Path (Get-Location) 'package.json'; $lock=Join-Path (Get-Location) 'package-lock.json'; $stampTime=(Get-Item $stamp).LastWriteTimeUtc; $latest=@(); if (Test-Path $pkg) { $latest += (Get-Item $pkg).LastWriteTimeUtc }; if (Test-Path $lock) { $latest += (Get-Item $lock).LastWriteTimeUtc }; if (($latest | Sort-Object -Descending | Select-Object -First 1) -gt $stampTime) { '1' } else { '0' }"`) do set "NEEDS_INSTALL=%%i"
)

if "!NEEDS_INSTALL!"=="1" (
    echo.
    echo  [..] Installing/updating dependencies ^(please wait^)...
    echo.
    call npm install --no-fund --no-audit
    if !errorlevel! neq 0 (
        echo.
        echo  [ERROR] npm install failed.
        echo  If you see ENOENT/package.json errors, the project directory is incorrect.
        echo  Current directory: %CD%
        pause
        exit /b 1
    )
    type nul > "%DEPS_STAMP%"
    echo.
    echo  [OK] Dependencies installed/updated!
) else (
    echo  [OK] Dependencies ready
)

:: ====== 3. Ensure .env.local ======
if not exist ".env.local" (
    if exist ".env" (
        copy /y ".env" ".env.local" >nul
        echo  [OK] Config copied from .env
    ) else if exist ".env.example" (
        copy /y ".env.example" ".env.local" >nul
        echo  [OK] Config copied from .env.example
    )
)

:: ====== 4. Find available port ======
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

:: ====== 4. Find available port ======
set PORT=3000
set "PORT_PID="
set "NEXT_DEV_PID="
set "PORT_PROCESS_MATCH=0"

:: Detect existing OpenLovart/Next process for this project even if port is not yet listening
for /f "usebackq delims=" %%p in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$root=[regex]::Escape((Get-Location).Path); $pattern='next\\s+dev|next\\dist\\bin\\next.+\\bdev\\b|start-server\\.js'; $proc=Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|npm|npx)(\\.exe)?$' -and $_.CommandLine -match $root -and $_.CommandLine -match $pattern } | Sort-Object ProcessId | Select-Object -First 1 -ExpandProperty ProcessId; if ($proc) { Write-Output $proc }"`) do (
    set "NEXT_DEV_PID=%%p"
)

if defined NEXT_DEV_PID (
    echo.
    echo  [!!] Detected an existing OpenLovart dev process ^(PID !NEXT_DEV_PID!^)
    echo  [OK] Reuse existing server: http://localhost:3000
    echo  [OK] Opening browser...
    start "" "http://localhost:3000"
    echo  [OK] If you need a restart, close the old window first and run this script again.
    popd
    pause
    exit /b 0
)

:: Check whether port 3000 is already occupied
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
    set "PORT_PID=%%a"
)

if defined PORT_PID (
    for /f "usebackq delims=" %%m in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$pidValue='!PORT_PID!'; $root=[regex]::Escape((Get-Location).Path); $pattern='next\\s+dev|next\\dist\\bin\\next.+\\bdev\\b|start-server\\.js'; $proc=Get-CimInstance Win32_Process -Filter \"ProcessId=$pidValue\" -ErrorAction SilentlyContinue; if ($proc -and $proc.CommandLine -match $root -and $proc.CommandLine -match $pattern) { '1' } else { '0' }"`) do set "PORT_PROCESS_MATCH=%%m"
    if "!PORT_PROCESS_MATCH!"=="1" (
        echo.
        echo  [!!] Detected an existing OpenLovart dev server on port 3000 ^(PID !PORT_PID!^)
        echo  [OK] Reuse existing server: http://localhost:3000
        echo  [OK] Opening browser...
        start "" "http://localhost:3000"
        echo  [OK] If you need a restart, close the old window first and run this script again.
        popd
        pause
        exit /b 0
    )
)

:: Double check with node
node -e "var s=require('net').createServer();s.once('error',function(){process.exit(1)});s.listen(%PORT%,function(){s.close();process.exit(0)})" >nul 2>&1
if !errorlevel! neq 0 (
    if "!ALLOW_PORT_FALLBACK!"=="1" (
        echo  [!!] Port !PORT! is occupied by another process, trying !FALLBACK_PORT!...
        set PORT=!FALLBACK_PORT!
    ) else (
        echo  [ERROR] Port !PORT! is occupied by another process.
        echo  [ERROR] OpenLovart uses browser local data tied to http://localhost:3000
        echo  [ERROR] To avoid losing the same local workspace/history view, fallback to 3001 is disabled.
        echo.
        echo  Please close the process using port !PORT!, then run this script again.
        echo  If you really want automatic fallback, set ALLOW_PORT_FALLBACK=1 in this script.
        popd
        pause
        exit /b 1
    )
)

echo.
echo  ----------------------------------------
echo   URL: http://localhost:%PORT%
echo   Press Ctrl+C to stop
echo  ----------------------------------------
echo.

:: Clear stale Next.js dev lock if no active server is using the port
if exist ".next\dev\lock" (
    echo  [!!] Found existing .next dev lock, cleaning stale lock...
    del /f /q ".next\dev\lock" >nul 2>&1
    timeout /t 1 /nobreak >nul
)

:: ====== 5. Start dev server ======
:: Turbopack is default in Next.js 16 but fails on network drives (UNC path mismatch)
set TURBO_FLAG=
for %%d in ("%CD%") do set DRIVE=%%~dd
net use !DRIVE! >nul 2>&1
if !errorlevel! equ 0 (
    echo  [!!] Network drive detected — using Webpack instead of Turbopack
    set TURBO_FLAG=--webpack
)
call npx next dev -p %PORT% !TURBO_FLAG!

:: If server exits
echo.
echo  [!!] Server stopped.
popd
pause
