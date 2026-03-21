@echo off
title Normalizer - Restart Servers

echo ========================================
echo    NORMALIZER - Restarting Servers
echo ========================================
echo.

:: Stop existing servers
echo [1/2] Stopping existing servers...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000"') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /FI "WINDOWTITLE eq Normalizer-Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Normalizer-Frontend*" /F >nul 2>&1

echo     Servers stopped.
timeout /t 2 /nobreak >nul

:: Start servers
echo [2/2] Starting servers...

start "Normalizer-Backend" cmd /c "cd /d D:\Opencode\OpenCode_models\Normalize\backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
echo     Backend starting...
timeout /t 3 /nobreak >nul

start "Normalizer-Frontend" cmd /c "cd /d D:\Opencode\OpenCode_models\Normalize\frontend && npm run dev"
echo     Frontend starting...
timeout /t 5 /nobreak >nul

:: Verify
echo.
echo Verifying servers...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; try { $null = Invoke-WebRequest -Uri 'http://localhost:8000/' -UseBasicParsing -TimeoutSec 5; Write-Host '[OK] Backend: http://localhost:8000/' -ForegroundColor Green } catch { Write-Host '[ERROR] Backend failed to start' -ForegroundColor Red }"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; try { $null = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 5; Write-Host '[OK] Frontend: http://localhost:3000/' -ForegroundColor Green } catch { Write-Host '[ERROR] Frontend failed to start' -ForegroundColor Red }"

echo.
echo ========================================
echo    Restart completed!
echo    Frontend: http://localhost:3000/
echo    Backend:  http://localhost:8000/
echo ========================================
echo.
pause