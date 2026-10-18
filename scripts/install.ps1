$ErrorActionPreference = 'Stop'

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "             VELOXIS ACCELERATOR INSTALLER              " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

$projectRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $projectRoot "dist"
$targetDir = Join-Path $env:LOCALAPPDATA "Programs\Veloxis Accelerator"

Write-Host "[1/5] Target Installation Folder: $targetDir" -ForegroundColor Gray
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

Write-Host "[2/5] Copying application files..." -ForegroundColor Yellow

$exeSource = Join-Path $distDir "Veloxis.exe"
if (Test-Path $exeSource) {
    Copy-Item $exeSource -Destination $targetDir -Force
} else {
    Write-Host "Error: dist\Veloxis.exe not found. Please run npm run package first." -ForegroundColor Red
    exit 1
}

$engineSource = Join-Path $distDir "VeloxisEngine.exe"
if (Test-Path $engineSource) {
    Copy-Item $engineSource -Destination $targetDir -Force
}

$folders = @('public', 'bin', 'assets', 'extension', 'data')
foreach ($f in $folders) {
    $src = Join-Path $distDir $f
    if (-not (Test-Path $src)) {
        $src = Join-Path $projectRoot $f
    }
    if (Test-Path $src) {
        $dest = Join-Path $targetDir $f
        if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
        Copy-Item -Path "$src\*" -Destination $dest -Recurse -Force
    }
}

Write-Host "[3/5] Creating Desktop & Start Menu Shortcuts..." -ForegroundColor Yellow

$wshShell = New-Object -ComObject WScript.Shell
$installedExe = Join-Path $targetDir "Veloxis.exe"

# Desktop Shortcut
$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$desktopShortcutPath = Join-Path $desktopPath "Veloxis Accelerator.lnk"
$shortcut = $wshShell.CreateShortcut($desktopShortcutPath)
$shortcut.TargetPath = $installedExe
$shortcut.WorkingDirectory = $targetDir
$shortcut.Description = "Veloxis Download Accelerator"
$shortcut.Save()

# Start Menu Shortcut
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Veloxis Accelerator"
if (-not (Test-Path $startMenuDir)) {
    New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null
}
$startMenuShortcutPath = Join-Path $startMenuDir "Veloxis Accelerator.lnk"
$smShortcut = $wshShell.CreateShortcut($startMenuShortcutPath)
$smShortcut.TargetPath = $installedExe
$smShortcut.WorkingDirectory = $targetDir
$smShortcut.Description = "Veloxis Download Accelerator"
$smShortcut.Save()

# Windows Startup Shortcut (Starts in Background on PC Turn On)
$startupDir = [System.Environment]::GetFolderPath('Startup')
$startupShortcutPath = Join-Path $startupDir "Veloxis Accelerator.lnk"
$stShortcut = $wshShell.CreateShortcut($startupShortcutPath)
$stShortcut.TargetPath = $installedExe
$stShortcut.Arguments = "--background"
$stShortcut.WorkingDirectory = $targetDir
$stShortcut.Description = "Veloxis Download Accelerator Background Service"
$stShortcut.Save()

# Windows Registry Run Key (Auto-start on PC boot)
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $runKey -Name "Veloxis Accelerator" -Value "`"$installedExe`" --background"

# Create uninstaller script
$uninstallerBat = Join-Path $targetDir "uninstall.bat"
$uninstallContent = @"
@echo off
title Uninstall Veloxis Accelerator
echo ========================================================
echo         UNINSTALL VELOXIS ACCELERATOR
echo ========================================================
echo.
set /p confirm="Are you sure you want to uninstall Veloxis Accelerator? (Y/N): "
if /i "%confirm%" neq "Y" exit /b 0

echo Removing shortcuts and registry entries...
powershell -NoProfile -Command "Remove-Item -Path '$desktopShortcutPath' -Force -ErrorAction SilentlyContinue; Remove-Item -Path '$startMenuDir' -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path '$startupShortcutPath' -Force -ErrorAction SilentlyContinue; Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Veloxis Accelerator' -ErrorAction SilentlyContinue; Remove-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VeloxisAccelerator' -Recurse -Force -ErrorAction SilentlyContinue;"
echo.
echo Veloxis Accelerator has been uninstalled from your system.
echo You may now close this window or delete this folder.
pause
"@
Set-Content -Path $uninstallerBat -Value $uninstallContent

# Register in Windows Installed Apps
Write-Host "[4/5] Registering in Windows Add/Remove Programs..." -ForegroundColor Yellow
$regKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VeloxisAccelerator"
if (-not (Test-Path $regKey)) {
    New-Item -Path $regKey -Force | Out-Null
}
Set-ItemProperty -Path $regKey -Name "DisplayName" -Value "Veloxis Accelerator"
Set-ItemProperty -Path $regKey -Name "DisplayVersion" -Value "1.0.0"
Set-ItemProperty -Path $regKey -Name "Publisher" -Value "Veloxis"
Set-ItemProperty -Path $regKey -Name "InstallLocation" -Value $targetDir
Set-ItemProperty -Path $regKey -Name "UninstallString" -Value "`"$uninstallerBat`""
Set-ItemProperty -Path $regKey -Name "DisplayIcon" -Value "`"$installedExe`""

Write-Host "[5/5] Ready to launch Veloxis Accelerator!" -ForegroundColor Green

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "       VELOXIS ACCELERATOR INSTALLED SUCCESSFULLY!       " -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Green
Write-Host "Installed Location : $targetDir" -ForegroundColor Cyan
Write-Host "Desktop Shortcut   : $desktopShortcutPath" -ForegroundColor Cyan
Write-Host "Start Menu         : $startMenuShortcutPath" -ForegroundColor Cyan
Write-Host "Uninstaller        : Windows Settings > Apps > Installed apps" -ForegroundColor Cyan
