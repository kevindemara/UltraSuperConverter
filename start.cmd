@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title UltraSuperConvertor // Launcher

echo ================================================================
echo   ULTRASUPERCONVERTOR // QUANTUM MEDIA ENGINE LAUNCHER
echo ================================================================

where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else (
        echo [INFO] Node.js not detected. Launching Setup Wizard to install Node.js LTS...
        call "%~dp0setup-wizard.cmd"
        exit /b 0
    )
)

node -e "require('./lib/runtime').assertSupported()"
if %errorlevel% neq 0 (
    echo [ERROR] Install current Node.js LTS, then reopen UltraSuperConvertor.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] Installing dependencies for first-time setup...
    call npm.cmd install
    node node_modules/ffmpeg-static/install.js
)

:: Check if already running on port 3847
curl.exe -s -o nul http://localhost:3847/api/state
if !ERRORLEVEL! EQU 0 (
    echo [INFO] UltraSuperConvertor is already running on http://localhost:3847
    start "" "http://localhost:3847"
    exit /b 0
)

echo [INFO] Starting UltraSuperConvertor background engine on port 3847...
start "UltraSuperConvertor Engine" /min cmd /c "node server.js"

:: Wait briefly for server to bind port 3847
set /a retries=0
:waitloop
set /a retries+=1
curl.exe -s -o nul http://localhost:3847/api/state
if !ERRORLEVEL! EQU 0 goto ready
if !retries! GEQ 15 goto ready
ping 127.0.0.1 -n 2 >nul
goto waitloop

:ready
echo [OK] Engine online! Opening GUI in your browser: http://localhost:3847
start "" "http://localhost:3847"
exit /b 0
