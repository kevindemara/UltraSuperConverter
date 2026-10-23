@echo off
setlocal EnableDelayedExpansion
title UltraSuperConvertor // HTML Setup & Shortcut Wizard
cd /d "%~dp0"

echo.
echo  ====================================================================
echo   ULTRASUPERCONVERTOR // HTML SETUP ^& DESKTOP SHORTCUT WIZARD
echo  ====================================================================
echo.

:: Check if Node.js is in PATH or default Program Files location
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [!] Node.js LTS was not detected on this system.
    echo  [+] Opening HTML Setup Wizard in your browser...
    start "" "%~dp0setup-wizard.html"
    echo.
    echo  [+] Attempting automatic Node.js LTS installation...
    where winget >nul 2>nul
    if !errorlevel! equ 0 (
        echo  [+] Installing Official OpenJS.NodeJS.LTS via Windows Package Manager ^(winget^)...
        winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    ) else (
        echo  [+] Downloading Official Signed Node.js LTS Windows Installer ^(.msi^)...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile \"$env:TEMP\node-lts-x64.msi\""
        if exist "%TEMP%\node-lts-x64.msi" (
            echo  [+] Launching Official Node.js LTS Installer...
            msiexec /i "%TEMP%\node-lts-x64.msi"
        )
    )

    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else (
        echo.
        echo  [!] Please complete the Node.js LTS installer, then run setup-wizard.cmd again.
        pause
        exit /b 0
    )
)

:: Check if port 3847 is already listening
set "PORT_PID="
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3847" ^| findstr "LISTENING"') do (
    set "PORT_PID=%%a"
)

if defined PORT_PID (
    echo  [+] Local Engine already active on port 3847 ^(PID !PORT_PID!^).
    echo  [+] Opening HTML Setup Wizard at http://localhost:3847/setup ...
    start "" "http://localhost:3847/setup"
    exit /b 0
)

if exist "node_modules\express\index.js" (
    echo  [+] Starting UltraSuperConvertor Local Engine...
    start "UltraSuperConvertor Server" /min cmd /c "node server.js"
) else (
    echo  [+] Starting Zero-Dependency HTML Setup Wizard Bootstrapper...
    start "UltraSuperConvertor Wizard" /min cmd /c "node installer\wizard-server.js"
)

ping 127.0.0.1 -n 3 >nul
echo  [+] Opening HTML Setup Wizard in your browser: http://localhost:3847/setup
start "" "http://localhost:3847/setup"
exit /b 0
