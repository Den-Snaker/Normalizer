@echo off
REM update.bat - Обновление Normalizer из GitHub
REM Запускать из корневой директории проекта

echo ============================================================
echo   ОБНОВЛЕНИЕ NORMALIZER
echo ============================================================
echo.

REM Проверка, что мы в Git репозитории
if not exist ".git" (
    echo ОШИБКА: Не в Git репозитории
    echo Запустите этот файл из корневой директории проекта
    pause
    exit /b 1
)

echo Запуск обновления...
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" %*

pause