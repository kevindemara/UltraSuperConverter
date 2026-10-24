@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title UltraSuperConverter // Instance Stopper

echo ================================================================
echo   ULTRASUPERCONVERTER // STOPPING SERVER INSTANCE
echo ================================================================

:: 1. Request graceful API shutdown
curl.exe -s -X POST http://localhost:3847/api/shutdown >nul 2>&1
ping 127.0.0.1 -n 2 >nul

:: 2. Check .server.pid if still present
if exist ".server.pid" (
    set /p SERVER_PID=<.server.pid
    if defined SERVER_PID (
        echo [INFO] Terminating PID !SERVER_PID!...
        taskkill /F /PID !SERVER_PID! >nul 2>&1
    )
    del /f /q ".server.pid" >nul 2>&1
)

:: 3. Ensure port 3847 is completely freed
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3847" ^| findstr "LISTENING"') do (
    echo [INFO] Releasing port 3847 ^(PID %%a^)...
    taskkill /F /PID %%a >nul 2>&1
)

echo [OK] UltraSuperConverter instance has been completely stopped.
exit /b 0
