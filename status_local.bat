@echo off
title Normalizer - Server Status

echo ========================================
echo    NORMALIZER - Server Status
echo ========================================
echo.

:: Check Backend
echo Checking Backend (port 8000)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; try { $null = Invoke-WebRequest -Uri 'http://localhost:8000/' -UseBasicParsing -TimeoutSec 3; Write-Host '[OK] Backend is running' -ForegroundColor Green; Write-Host '     URL: http://localhost:8000/' } catch { Write-Host '[OFF] Backend not running' -ForegroundColor Red }"

echo.

:: Check Frontend
echo Checking Frontend (port 3000)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; try { $null = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 3; Write-Host '[OK] Frontend is running' -ForegroundColor Green; Write-Host '     URL: http://localhost:3000/' } catch { Write-Host '[OFF] Frontend not running' -ForegroundColor Red }"

echo.

:: Check ports with netstat
echo ========================================
echo    Listening ports:
echo ========================================
netstat -ano | findstr "LISTENING" | findstr ":8000 :3000"

echo.
echo ========================================
echo    To check status:  status_local.bat
echo    To start servers:  start_local.bat
echo    To stop servers:   stop_local.bat
echo    To restart:        restart_local.bat
echo    Interactive menu:  servers.bat
echo ========================================
echo.
pause