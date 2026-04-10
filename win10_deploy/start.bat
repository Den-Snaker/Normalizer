@echo off
REM start.bat - Запуск серверов Normalizer
REM Запускать из корневой директории проекта

echo ============================================================
echo   ЗАПУСК NORMALIZER
echo ============================================================
echo.

REM Проверка, что мы в правильной директории
if not exist "frontend" (
    echo ОШИБКА: Папка frontend не найдена
    echo Запустите этот файл из корневой директории проекта
    echo Пример: cd C:\Projects\Normalizer
    pause
    exit /b 1
)

if not exist "backend" (
    echo ОШИБКА: Папка backend не найдена
    echo Запустите этот файл из корневой директории проекта
    pause
    exit /b 1
)

REM Запуск PowerShell скрипта
echo Запуск серверов...
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*

pause