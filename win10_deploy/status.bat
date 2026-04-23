@echo off

echo ============================================================
echo   NORMALIZER STATUS
echo ============================================================
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0status.ps1" %*

pause