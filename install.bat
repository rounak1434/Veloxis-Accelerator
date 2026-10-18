@echo off
chcp 65001 >nul
title Veloxis Accelerator Installer
echo.
echo ========================================================
echo             VELOXIS ACCELERATOR INSTALLER
echo ========================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
if %errorlevel% neq 0 (
    echo.
    echo Installation encountered an issue. Press any key to exit.
    pause >nul
) else (
    echo.
    echo Installation finished! Press any key to exit.
    pause >nul
)
