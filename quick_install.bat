@echo off
title Normalizer - Quick Install
setlocal enabledelayedexpansion

echo ==================================================
echo    NORMALIZER - Quick Install Script
echo ==================================================
echo.
echo This script will download and install Normalizer
echo from GitHub to the current directory.
echo.
echo Prerequisites:
echo   - Git (https://git-scm.com)
echo   - Node.js 20+ (https://nodejs.org)
echo   - Python 3.12+ (https://python.org)
echo.
pause

:: Set installation directory (current folder)
set "INSTALL_DIR=%~dp0"
cd /d "%INSTALL_DIR%"

:: Check if already installed
if exist "Normalizer" (
    echo.
    echo [WARNING] 'Normalizer' folder already exists!
    echo.
    echo Options:
    echo   1. Delete and reinstall
    echo   2. Update existing installation
    echo   3. Cancel
    echo.
    set /p choice="Select option (1/2/3): "

    if "!choice!"=="1" (
        echo Removing existing installation...
        rmdir /s /q "Normalizer" 2>nul
    ) else if "!choice!"=="2" (
        goto UPDATE
    ) else (
        echo Installation cancelled.
        pause
        exit /b 0
    )
)

:: ==================================================
:: CHECK PREREQUISITES
:: ==================================================
echo.
echo Checking prerequisites...
echo.

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git not found!
    echo Install from: https://git-scm.com/download/win
    pause
    exit /b 1
)
echo [OK] Git

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo Install from: https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found!
    echo Install from: https://python.org
    pause
    exit /b 1
)
echo [OK] Python

echo.
echo All prerequisites OK!
echo.

:: ==================================================
:: CLONE
:: ==================================================
echo [1/5] Cloning from GitHub...
git clone https://github.com/Den-Snaker/Normalizer.git
if %errorlevel% neq 0 (
    echo [ERROR] Failed to clone repository
    pause
    exit /b 1
)
echo [OK] Cloned
echo.

:: ==================================================
:: BACKEND DEPENDENCIES
:: ==================================================
echo [2/5] Installing backend dependencies...
cd /d "%INSTALL_DIR%Normalizer\backend"
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Backend dependencies failed
    pause
    exit /b 1
)
echo [OK] Backend ready
echo.

:: ==================================================
:: FRONTEND DEPENDENCIES
:: ==================================================
echo [3/5] Installing frontend dependencies...
cd /d "%INSTALL_DIR%Normalizer\old"
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Frontend dependencies failed
    pause
    exit /b 1
)
echo [OK] Frontend dependencies
echo.

:: ==================================================
:: BUILD
:: ==================================================
echo [4/5] Building frontend...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)
echo [OK] Build complete
echo.

:: ==================================================
:: CONFIG
:: ==================================================
echo [5/5] Setting up configuration...
cd /d "%INSTALL_DIR%Normalizer"

if not exist "backend\.env" (
    if exist "backend\.env.example" (
        copy "backend\.env.example" "backend\.env" >nul
        echo [OK] Created backend\.env
    )
)

echo.
echo ==================================================
echo    INSTALLATION COMPLETE!
echo ==================================================
echo.
echo Location: %INSTALL_DIR%Normalizer
echo.
echo Next steps:
echo   1. Edit Normalizer\old\.env.local
echo      Add your API keys:
echo      - VITE_GEMINI_API_KEY=your_key
echo      - VITE_OPENROUTER_API_KEY=your_key
echo.
echo   2. Run: Normalizer\servers.bat
echo      Or use: Normalizer\start_local.bat
echo.
echo   3. Open: http://localhost:3000/
echo.
echo ==================================================
pause
exit /b 0

:: ==================================================
:: UPDATE EXISTING
:: ==================================================
:UPDATE
echo.
echo Updating existing installation...
cd /d "%INSTALL_DIR%Normalizer"

echo [1/3] Pulling changes...
git pull origin main

echo [2/3] Updating backend...
cd /d "%INSTALL_DIR%Normalizer\backend"
pip install -r requirements.txt

echo [3/3] Updating frontend...
cd /d "%INSTALL_DIR%Normalizer\old"
call npm install
call npm run build

echo.
echo [OK] Update complete!
echo.
pause
exit /b 0