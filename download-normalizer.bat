@echo off
title Normalizer - Download and Install
echo ==================================================
echo    NORMALIZER - One-Click Installer
echo ==================================================
echo.
echo This will download Normalizer from GitHub
echo and create all necessary scripts.
echo.
echo Press any key to start...
pause >nul

:: Check Git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Git is not installed!
    echo.
    echo Please install Git from:
    echo https://git-scm.com/download/win
    echo.
    echo After installing Git, run this script again.
    pause
    exit /b 1
)

:: Clone repository
echo.
echo Downloading Normalizer...
git clone https://github.com/Den-Snaker/Normalizer.git

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Download failed!
    echo.
    echo Make sure you have internet connection.
    pause
    exit /b 1
)

echo.
echo Download complete!
echo.
echo ==================================================
echo.
echo Next steps:
echo.
echo 1. Open folder: Normalizer
echo 2. Run: install.bat
echo.
echo This will install all dependencies.
echo.
echo ==================================================
pause