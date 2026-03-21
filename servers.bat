@echo off
title Normalizer - Server Manager
setlocal enabledelayedexpansion

:menu
cls
echo.
echo ==================================================
echo        NORMALIZER - Server Manager
echo ==================================================
echo.
echo   [1] Start servers
echo   [2] Stop servers
echo   [3] Restart servers
echo   [4] Check status
echo.
echo   [0] Exit
echo.
echo ==================================================
echo.

:: Check Backend
set BACKEND_STATUS=OFF
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $null = Invoke-WebRequest -Uri 'http://localhost:8000/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
    echo Backend:  [ON]  http://localhost:8000/
    set BACKEND_STATUS=ON
) else (
    echo Backend:  [OFF]
)

:: Check Frontend  
set FRONTEND_STATUS=OFF
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $null = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
    echo Frontend: [ON]  http://localhost:3000/
    set FRONTEND_STATUS=ON
) else (
    echo Frontend: [OFF]
)

echo.
set /p choice="Select action: "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto restart
if "%choice%"=="4" goto status
if "%choice%"=="0" goto exit

echo Invalid choice!
timeout /t 2 /nobreak >nul
goto menu

:start
echo.
echo Starting servers...

start "Normalizer-Backend" cmd /c "cd /d D:\Opencode\OpenCode_models\Normalize\backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
echo     Backend starting...
timeout /t 3 /nobreak >nul

start "Normalizer-Frontend" cmd /c "cd /d D:\Opencode\OpenCode_models\Normalize\frontend && npm run dev"
echo     Frontend starting...
timeout /t 5 /nobreak >nul

echo.
echo Servers started!
pause
goto menu

:stop
echo.
echo Stopping servers...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000" 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000" 2^>nul') do taskkill /F /PID %%a >nul 2>&1
taskkill /FI "WINDOWTITLE eq Normalizer-Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Normalizer-Frontend*" /F >nul 2>&1

echo Servers stopped!
pause
goto menu

:restart
echo.
echo Restarting servers...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000" 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000" 2^>nul') do taskkill /F /PID %%a >nul 2>&1
taskkill /FI "WINDOWTITLE eq Normalizer-Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Normalizer-Frontend*" /F >nul 2>&1

timeout /t 2 /nobreak >nul

start "Normalizer-Backend" cmd /c "cd /d D:\Opencode\OpenCode_models\Normalize\backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 /nobreak >nul

start "Normalizer-Frontend" cmd /c "cd /d D:\Opencode\OpenCode_models\Normalize\frontend && npm run dev"
timeout /t 5 /nobreak >nul

echo Servers restarted!
pause
goto menu

:status
echo.
echo Checking servers...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $r = Invoke-WebRequest -Uri 'http://localhost:8000/' -UseBasicParsing -TimeoutSec 5; Write-Host '[OK] Backend is running' -ForegroundColor Green; Write-Host '     URL: http://localhost:8000/' -ForegroundColor Gray; Write-Host '     Status:' $r.StatusCode } catch { Write-Host '[ERROR] Backend not responding' -ForegroundColor Red; Write-Host '     Error:' $_.Exception.Message }"

echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 5; Write-Host '[OK] Frontend is running' -ForegroundColor Green; Write-Host '     URL: http://localhost:3000/' -ForegroundColor Gray } catch { Write-Host '[ERROR] Frontend not responding' -ForegroundColor Red; Write-Host '     Error:' $_.Exception.Message }"

echo.
echo Listening ports:
netstat -ano | findstr "LISTENING" | findstr ":8000 :3000"
echo.
pause
goto menu

:exit
exit