@echo off
REM stop.bat - Остановка серверов Normalizer

echo ============================================================
echo   ОСТАНОВКА NORMALIZER
echo ============================================================
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*

pause