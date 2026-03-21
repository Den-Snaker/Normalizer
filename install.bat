@echo off
title Normalizer - First Time Installation
setlocal enabledelayedexpansion

echo ==================================================
echo    NORMALIZER - First Time Installation
echo ==================================================
echo.
echo This script will:
echo   1. Check prerequisites (Git, Node.js, Python)
echo   2. Clone repository from GitHub
echo   3. Install dependencies
echo   4. Build frontend
echo   5. Create start/stop scripts
echo.
pause

:: Set installation directory
set "INSTALL_DIR=%~dp0"
cd /d "%INSTALL_DIR%"

:: ==================================================
:: CHECK PREREQUISITES
:: ==================================================
echo.
echo [Step 1/7] Checking prerequisites...
echo.

:: Check Git
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed!
    echo.
    echo Please install Git from: https://git-scm.com/download/win
    echo After installation, run this script again.
    pause
    exit /b 1
)
echo [OK] Git found

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Recommended version: 20.x LTS
    echo After installation, run this script again.
    pause
    exit /b 1
)
echo [OK] Node.js found

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed!
    echo.
    echo Please install Python from: https://www.python.org/downloads/
    echo Recommended version: 3.12+
    echo After installation, run this script again.
    pause
    exit /b 1
)
echo [OK] Python found

echo.
echo All prerequisites installed!
echo.

:: ==================================================
:: CLONE REPOSITORY
:: ==================================================
echo [Step 2/7] Cloning repository from GitHub...
echo.

if exist "Normalizer" (
    echo [INFO] Directory 'Normalizer' already exists.
    echo       Delete it first if you want a fresh install.
    pause
    exit /b 1
)

git clone https://github.com/Den-Snaker/Normalizer.git
if %errorlevel% neq 0 (
    echo [ERROR] Failed to clone repository!
    echo.
    echo Make sure you have internet connection.
    echo Check your GitHub credentials if repository is private.
    pause
    exit /b 1
)

echo [OK] Repository cloned successfully!
echo.

:: ==================================================
:: INSTALL BACKEND DEPENDENCIES
:: ==================================================
echo [Step 3/7] Installing backend dependencies...
echo.

cd /d "%INSTALL_DIR%Normalizer\backend"

pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install backend dependencies!
    pause
    exit /b 1
)

echo [OK] Backend dependencies installed!
echo.

:: ==================================================
:: INSTALL FRONTEND DEPENDENCIES
:: ==================================================
echo [Step 4/7] Installing frontend dependencies...
echo.

cd /d "%INSTALL_DIR%Normalizer\frontend"

call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install frontend dependencies!
    pause
    exit /b 1
)

echo [OK] Frontend dependencies installed!
echo.

:: ==================================================
:: BUILD FRONTEND
:: ==================================================
echo [Step 5/7] Building frontend...
echo.

call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build frontend!
    pause
    exit /b 1
)

echo [OK] Frontend built successfully!
echo.

:: ==================================================
:: CREATE START/STOP SCRIPTS
:: ==================================================
echo [Step 6/7] Creating management scripts...
echo.

cd /d "%INSTALL_DIR%"

:: Create start.bat
(
echo @echo off
echo title Normalizer - Start Servers
echo cd /d "%INSTALL_DIR%Normalizer"
echo call servers.bat
) > start.bat

:: Create stop.bat
(
echo @echo off
echo title Normalizer - Stop Servers
echo cd /d "%INSTALL_DIR%Normalizer"
echo call stop_local.bat
) > stop.bat

:: Create update.bat
(
echo @echo off
echo title Normalizer - Update from GitHub
echo echo ==================================================
echo echo    NORMALIZER - Updating from GitHub
echo echo ==================================================
echo echo.
echo cd /d "%INSTALL_DIR%Normalizer"
echo.
echo echo [1/3] Stopping servers...
echo call stop_local.bat
echo.
echo echo [2/3] Pulling latest changes...
echo git pull origin main
echo if %%errorlevel%% neq 0 (
echo     echo [ERROR] Failed to pull changes!
echo     pause
echo     exit /b 1
echo )
echo.
echo echo [3/3] Updating dependencies...
echo cd /d "%INSTALL_DIR%Normalizer\backend"
echo pip install -r requirements.txt
echo cd /d "%INSTALL_DIR%Normalizer\frontend"
echo call npm install
echo call npm run build
echo.
echo echo.
echo echo ==================================================
echo echo    Update completed!
echo echo ==================================================
echo echo.
echo echo Run start.bat to launch the application.
echo pause
) > update.bat

:: Create run_tests.bat shortcut
(
echo @echo off
echo cd /d "%INSTALL_DIR%Normalizer"
echo call run_tests.bat
) > run_tests.bat

echo [OK] Management scripts created!
echo.

:: ==================================================
:: CONFIG COPY
:: ==================================================
echo [Step 7/7] Setting up configuration...
echo.

cd /d "%INSTALL_DIR%Normalizer"

if not exist "backend\.env" (
    if exist "backend\.env.example" (
        copy "backend\.env.example" "backend\.env" >nul
        echo [OK] Created backend\.env from example
    )
)

if not exist "frontend\.env.local" (
    echo [INFO] Please create frontend\.env.local with your API keys:
    echo        VITE_GEMINI_API_KEY=your_key
    echo        VITE_OPENROUTER_API_KEY=your_key
    echo        VITE_API_URL=http://localhost:8000
)

echo.

:: ==================================================
:: COMPLETE
:: ==================================================
echo ==================================================
echo    INSTALLATION COMPLETED!
echo ==================================================
echo.
echo Installation directory: %INSTALL_DIR%Normalizer
echo.
echo Commands:
echo   start.bat     - Start servers
echo   stop.bat      - Stop servers
echo   update.bat    - Update from GitHub
echo   run_tests.bat - Run tests
echo.
echo Or use the interactive menu:
echo   %INSTALL_DIR%Normalizer\servers.bat
echo.
echo ==================================================
echo.
pause