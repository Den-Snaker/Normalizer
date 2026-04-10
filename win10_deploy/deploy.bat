@echo off
REM deploy.bat - Развертывание Normalizer
REM Запускать от имени администратора

echo ============================================================
echo   РАЗВЕРТЫВАНИЕ NORMALIZER ИЗ GITHUB
echo ============================================================
echo.

REM Проверка прав администратора
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ОШИБКА: Требуются права администратора!
    echo.
    echo Правый клик на deploy.bat -^> "Запуск от имени администратора"
    echo.
    pause
    exit /b 1
)

echo Запуск развертывания...
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*

pause