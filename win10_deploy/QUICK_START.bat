@echo off
REM QUICK_START.bat - Быстрый старт для новичков
REM Запускать от имени администратора

echo ============================================================
echo   БЫСТРЫЙ СТАРТ NORMALIZER
echo ============================================================
echo.
echo Этот скрипт выполнит:
echo   1. Настройку окружения
echo   2. Установку зависимостей
echo   3. Клонирование репозитория (если нужно)
echo   4. Запуск приложения
echo.
pause

REM Проверка прав администратора
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo   ТРЕБУЮТСЯ ПРАВА АДМИНИСТРАТОРА
    echo ============================================================
    echo.
    echo 1. Закройте это окно
    echo 2. Правый клик на QUICK_START.bat
    echo 3. Выберите "Запуск от имени администратора"
    echo.
    pause
    exit /b 1
)

echo.
echo [1/5] Проверка Chocolatey...
where choco >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка Chocolatey...
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
    if %errorlevel% neq 0 (
        echo ОШИБКА: Не удалось установить Chocolatey
        pause
        exit /b 1
    )
)
echo OK

echo.
echo [2/5] Проверка Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка Node.js...
    choco install nodejs-lts -y
)
echo OK

echo.
echo [3/5] Проверка Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка Python...
    choco install python -y
)
echo OK

echo.
echo [4/5] Проверка Git...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка Git...
    choco install git -y
)
echo OK

echo.
echo [5/5] Проверка PostgreSQL...
sc query postgresql*-x64-16 >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка PostgreSQL...
    choco install postgresql16 -y
    timeout /t 10 /nobreak >nul
    net start postgresql*-x64-16 >nul 2>&1
)
echo OK

echo.
echo ============================================================
echo   ВСЕ ЗАВИСИМОСТИ УСТАНОВЛЕНЫ
echo ============================================================
echo.
echo Теперь запустите:
echo   setup.bat - для полной настройки
echo.
pause