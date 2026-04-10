@echo off
REM status.bat - Проверка статуса серверов Normalizer

echo ============================================================
echo   СТАТУС NORMALIZER
echo ============================================================
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0status.ps1" %*

pause