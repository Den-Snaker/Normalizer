@echo off
REM diagnose.bat - Диагностика проблем установки
REM Запускать от имени администратора

echo ============================================================
echo   ДИАГНОСТИКА ПРОБЛЕМ NORMALIZER
echo ============================================================
echo.

REM 1. Проверка прав администратора
echo [1/10] Проверка прав администратора...
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ОШИБКА: Не администратор
    echo Запустите от имени администратора
    pause
    exit /b 1
)
echo OK - Администратор

REM 2. Проверка Chocolatey
echo.
echo [2/10] Проверка Chocolatey...
where chocnul 2>&1
if %errorlevel% neq 0 (
    echo НЕ УСТАНОВЛЕН
    echo Установка Chocolatey...
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
) else (
    echo OK - Установлен
)

REM 3. Проверка Node.js
echo.
echo [3/10] Проверка Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo НЕ УСТАНОВЛЕН
    echo Установка Node.js...
    choco install nodejs-lts -y
) else (
    node --version
    echo OK
)

REM 4. Проверка npm
echo.
echo [4/10] Проверка npm...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo НЕ УСТАНОВЛЕН
) else (
    npm --version
    echo OK
)

REM 5. Проверка Python
echo.
echo [5/10] Проверка Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo НЕ УСТАНОВЛЕН
    echo Установка Python...
    choco install python -y
) else (
    python --version
    echo OK
)

REM 6. Проверка pip
echo.
echo [6/10] Проверка pip...
python -m pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo НЕ УСТАНОВЛЕН
    echo Обновление pip...
    python -m ensurepip --upgrade
) else (
    python -m pip --version
    echo OK
)

REM 7. Проверка PostgreSQL
echo.
echo [7/10] Проверка PostgreSQL...
sc query postgresql*-x64-16 >nul 2>&1
if %errorlevel% neq 0 (
    echo НЕ УСТАНОВЛЕН
    echo Установка PostgreSQL...
    choco install postgresql16 -y
) else (
    sc query postgresql*-x64-16 | findstr "RUNNING"
    if %errorlevel% equ 0 (
        echo OK - Запущен
    ) else (
        echo УСТАНОВЛЕН, НО НЕ ЗАПУЩЕН
        echo Запуск службы...
        net start postgresql*-x64-16
    )
)

REM 8. Проверка Git
echo.
echo [8/10] Проверка Git...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo НЕ УСТАНОВЛЕН
    echo Установка Git...
    choco install git -y
) else (
    git --version
    echo OK
)

REM 9. Проверка структуры проекта
echo.
echo [9/10] Проверка структуры проекта...
if not exist "frontend" (
    echo ОШИБКА: Папка frontend не найдена
    echo Убедитесь, что находитесь в корневой директории проекта
) else (
    echo OK - frontend найден
)

if not exist "backend" (
    echo ОШИБКА: Папка backend не найдена
    echo Убедитесь, что находитесь в корневой директории проекта
) else (
    echo OK - backend найден
)

if not exist "backend\requirements.txt" (
    echo ОШИБКА: Файл backend\requirements.txt не найден
) else (
    echo OK - requirements.txt найден
)

if not exist "frontend\package.json" (
    echo ОШИБКА: Файл frontend\package.json не найден
) else (
    echo OK - package.json найден
)

REM 10. Проверка портов
echo.
echo [10/10] Проверка портов...

netstat -ano | findstr ":3000" >nul 2>&1
if %errorlevel% equ 0 (
    echo ВНИМАНИЕ: Порт 3000 занят
) else (
    echo OK - Порт 3000 свободен
)

netstat -ano | findstr ":8000" >nul 2>&1
if %errorlevel% equ 0 (
    echo ВНИМАНИЕ: Порт 8000 занят
) else (
    echo OK - Порт 8000 свободен
)

netstat -ano | findstr ":5432" >nul 2>&1
if %errorlevel% equ 0 (
    echo OK - PostgreSQL запущен (порт 5432)
) else (
    echo ВНИМАНИЕ: PostgreSQL не запущен
)

echo.
echo ============================================================
echo   ДИАГНОСТИКА ЗАВЕРШЕНА
echo ============================================================
echo.
echo Если все компоненты установлены, запустите:
echo   install_backend_deps.bat - для установки backend зависимостей
echo   install_frontend_deps.bat - для установки frontend зависимостей
echo.
pause