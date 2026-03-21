@echo off
title Normalizer - Stop Servers

echo ========================================
echo    NORMALIZER - Stopping Servers
echo ========================================
echo.

echo [1/2] Stopping Backend (port 8000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000"') do (
    echo     Killing process %%a...
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/2] Stopping Frontend (port 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3000"') do (
    echo     Killing process %%a...
    taskkill /F /PID %%a >nul 2>&1
)

:: Additional cleanup by window title
taskkill /FI "WINDOWTITLE eq Normalizer-Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Normalizer-Frontend*" /F >nul 2>&1

echo.
echo ========================================
echo    Servers stopped
echo ========================================
echo.
pause