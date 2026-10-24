@echo off
setlocal
cd /d "%~dp0\.."

:: Locate node.exe
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

node "%~dp0cli-send.js" %*
