@echo off
REM setup.bat - Запуск PowerShell скрипта настройки
REM Запускать от имени администратора

echo ============================================================
echo   Настройка Normalizer на Windows 10
echo ============================================================
echo.
echo Этот BAT файл запустит PowerShell скрипт setup.ps1
echo.
pause

REM Проверка прав администратора
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ОШИБКА: Требуются права администратора!
    echo.
    echo Правый клик на setup.bat -^> "Запуск от имени администратора"
    echo.
    pause
    exit /b 1
)

REM Запуск PowerShell скрипта
echo Запуск PowerShell скрипта...
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*

if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo   ОШИБКА ВЫПОЛНЕНИЯ
    echo ============================================================
    echo.
    echo Код ошибки: %errorlevel%
    echo.
    echo Возможные причины:
    echo 1. Нет прав администратора
    echo 2. Нет интернет-соединения
    echo 3. Ошибки в скрипте
    echo.
    echo Попробуйте выполнить вручную:
    echo   PowerShell -ExecutionPolicy Bypass -File setup.ps1
    echo.
    pause
    exit /b %errorlevel%
)

echo.
echo ============================================================
echo   НАСТРОЙКА ЗАВЕРШЕНА
echo ============================================================
echo.
echo Для запуска приложения:
echo   1. Отредактируйте frontend\.env.local (укажите API ключи)
echo   2. Запустите: start.bat
echo.
pause