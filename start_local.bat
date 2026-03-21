@echo off
title Normalizer - Start Servers

echo ========================================
echo    NORMALIZER - Starting Servers
echo ========================================
echo.

:: Check if already running
echo [1/4] Checking ports...
echo.

netstat -ano | findstr "LISTENING" | findstr ":8000" >nul 2>&1
if %errorlevel%==0 (
    echo [INFO] Port 8000 is already in use.
    echo        If backend is not working, run stop_local.bat first.
    echo.
)

netstat -ano | findstr "LISTENING" | findstr ":3000" >nul 2>&1
if %errorlevel%==0 (
    echo [INFO] Port 3000 is already in use.
    echo        If frontend is not working, run stop_local.bat first.
    echo.
)

:: Start Backend
echo [2/4] Starting Backend (port 8000)...
start "Normalizer-Backend" cmd /c "cd /d D:\Opencode\OpenCode_models\Normalize\backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
echo     Backend starting...
timeout /t 3 /nobreak >nul

:: Start Frontend
echo [3/4] Starting Frontend (port 3000)...
start "Normalizer-Frontend" cmd /c "cd /d D:\Opencode\OpenCode_models\Normalize\old && npm run dev"
echo     Frontend starting...
timeout /t 5 /nobreak >nul

:: Verify
echo [4/4] Verifying servers...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; try { $null = Invoke-WebRequest -Uri 'http://localhost:8000/' -UseBasicParsing -TimeoutSec 5; Write-Host '[OK] Backend: http://localhost:8000/' -ForegroundColor Green } catch { Write-Host '[ERROR] Backend failed to start' -ForegroundColor Red }"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; try { $null = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 5; Write-Host '[OK] Frontend: http://localhost:3000/' -ForegroundColor Green } catch { Write-Host '[ERROR] Frontend failed to start' -ForegroundColor Red }"

echo.
echo ========================================
echo    Servers started!
echo    Frontend: http://localhost:3000/
echo    Backend:  http://localhost:8000/
echo ========================================
echo.
echo To stop servers: stop_local.bat
echo.
pause