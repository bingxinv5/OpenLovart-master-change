@echo off
echo === DEBUG START ===
echo Step 1: chcp
chcp 65001
echo.

echo Step 2: current dir = %~dp0
pause

echo Step 3: pushd
pushd "%~dp0"
echo Result: %errorlevel%  Dir: %CD%
pause

echo Step 4: check node
where node
echo Result: %errorlevel%
pause

echo Step 5: check node_modules
if exist "node_modules\" (echo FOUND) else (echo NOT FOUND)
pause

echo Step 6: check .env.local
if exist ".env.local" (echo FOUND) else (echo NOT FOUND)
pause

echo Step 7: starting next...
call npx next dev -p 3000
echo.
echo Step 8: next exited with %errorlevel%
pause
