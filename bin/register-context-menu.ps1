param(
    [switch]$Uninstall,
    [switch]$NoContextMenu,
    [switch]$NoSendTo
)

$AppPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$IcoPath = Join-Path $AppPath "UltraSuperConvertor.ico"
$SilentVbs = Join-Path $AppPath "bin\silent.vbs"
$CliCmd = Join-Path $AppPath "bin\cli-send.cmd"
$WscriptExe = "$env:SystemRoot\System32\wscript.exe"

$Command = "`"$WscriptExe`" `"$SilentVbs`" `"$CliCmd`" `"%1`""
$BgCommand = "`"$WscriptExe`" `"$SilentVbs`" `"$CliCmd`" `"%V`""

if ($Uninstall) {
    Remove-Item -Path "HKCU:\Software\Classes\*\shell\UltraSuperConvertor" -Recurse -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\Software\Classes\Directory\shell\UltraSuperConvertor" -Recurse -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\Software\Classes\Directory\Background\shell\UltraSuperConvertor" -Recurse -ErrorAction SilentlyContinue

    $SendToDir = [Environment]::GetFolderPath('SendTo')
    if (Test-Path $SendToDir) {
        Remove-Item -Path (Join-Path $SendToDir "UltraSuperConvertor.lnk") -ErrorAction SilentlyContinue
    }
    Write-Host "[OK] UltraSuperConvertor context menu and SendTo shortcut removed."
    return
}

if (-not $NoContextMenu) {
    # All files
    New-Item -Path "HKCU:\Software\Classes\*\shell\UltraSuperConvertor" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Classes\*\shell\UltraSuperConvertor" -Name "(Default)" -Value "Convert with UltraSuperConvertor"
    Set-ItemProperty -Path "HKCU:\Software\Classes\*\shell\UltraSuperConvertor" -Name "Icon" -Value "$IcoPath"
    New-Item -Path "HKCU:\Software\Classes\*\shell\UltraSuperConvertor\command" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Classes\*\shell\UltraSuperConvertor\command" -Name "(Default)" -Value $Command

    # Directories
    New-Item -Path "HKCU:\Software\Classes\Directory\shell\UltraSuperConvertor" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Classes\Directory\shell\UltraSuperConvertor" -Name "(Default)" -Value "Convert with UltraSuperConvertor"
    Set-ItemProperty -Path "HKCU:\Software\Classes\Directory\shell\UltraSuperConvertor" -Name "Icon" -Value "$IcoPath"
    New-Item -Path "HKCU:\Software\Classes\Directory\shell\UltraSuperConvertor\command" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Classes\Directory\shell\UltraSuperConvertor\command" -Name "(Default)" -Value $Command

    # Directory Background
    New-Item -Path "HKCU:\Software\Classes\Directory\Background\shell\UltraSuperConvertor" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Classes\Directory\Background\shell\UltraSuperConvertor" -Name "(Default)" -Value "Convert with UltraSuperConvertor"
    Set-ItemProperty -Path "HKCU:\Software\Classes\Directory\Background\shell\UltraSuperConvertor" -Name "Icon" -Value "$IcoPath"
    New-Item -Path "HKCU:\Software\Classes\Directory\Background\shell\UltraSuperConvertor\command" -Force | Out-Null
    Set-ItemProperty -Path "HKCU:\Software\Classes\Directory\Background\shell\UltraSuperConvertor\command" -Name "(Default)" -Value $BgCommand

    Write-Host "[OK] Right-click context menu registered in Windows File Explorer."
}

if (-not $NoSendTo) {
    $SendToDir = [Environment]::GetFolderPath('SendTo')
    if (Test-Path $SendToDir) {
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut((Join-Path $SendToDir "UltraSuperConvertor.lnk"))
        $Shortcut.TargetPath = $WscriptExe
        $Shortcut.Arguments = "`"$SilentVbs`" `"$CliCmd`""
        $Shortcut.WorkingDirectory = $AppPath
        $Shortcut.Description = "Convert with UltraSuperConvertor"
        $Shortcut.IconLocation = "$IcoPath,0"
        $Shortcut.Save()
        Write-Host "[OK] Shortcut created in Windows 'Send to' menu."
    }
}
