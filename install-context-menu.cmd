@echo off
setlocal
cd /d "%~dp0"
title UltraSuperConvertor // Install Context Menu

echo ================================================================
echo   ULTRASUPERCONVERTOR // WINDOWS CONTEXT MENU INSTALLER
echo ================================================================
echo.
echo Installing "Convert with UltraSuperConvertor" to your right-click
echo context menu and "Send to" menu...
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

node "%~dp0bin\register-context-menu.js"

echo.
echo [DONE] You can now right-click any image, video, audio file, ZIP,
echo        or folder in Windows Explorer to convert with UltraSuperConvertor!
echo.
pause
