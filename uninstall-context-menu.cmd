@echo off
setlocal
cd /d "%~dp0"
title UltraSuperConvertor // Remove Context Menu

echo ================================================================
echo   ULTRASUPERCONVERTOR // REMOVE CONTEXT MENU INTEGRATION
echo ================================================================
echo.
echo Removing context menu and SendTo shortcut...
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

node "%~dp0bin\register-context-menu.js" --uninstall

echo.
echo [DONE] Context menu integration has been removed.
echo.
pause
