@echo off
REM install_skip_pgadmin.bat - Установка без блокировки на pgAdmin
REM Запускать от имени администратора

set LOG_FILE=install_log.txt

echo ============================================================
echo   УСТАНОВКА NORMALIZER (БЕЗ БЛОКИРОВКИ PGADMIN)
echo ============================================================
echo.
echo Этот скрипт НЕ будет запускать pgAdmin
echo Установка пройдет быстрее
echo.
pause

REM Проверка прав администратора
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ОШИБКА: Нужно запустить от имени администратора!
    pause
    exit /b 1
)

REM 1. Настройка PowerShell
echo [1/10] Настройка PowerShell...
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force"

REM 2. Установка Chocolatey (если нет)
echo [2/10] Проверка Chocolatey...
where choco >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка Chocolatey...
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
    timeout /t 5 /nobreak >nul
)

REM 3. Установка Node.js (если нет)
echo [3/10] Установка Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка Node.js LTS...
    choco install nodejs-lts -y --force
)

REM 4. Установка Python (если нет)
echo [4/10] Установка Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка Python...
    choco install python -y --force
)

REM 5. Установка PostgreSQL (если нет) - БЕЗА pgAdmin
echo [5/10] Установка PostgreSQL...
sc query postgresql*-x64-16 >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка PostgreSQL 16 (БЕЗ pgAdmin - должно пройти быстрее)...
    
    REM Установка PostgreSQL БЕЗ pgAdmin (используя параметры)
    choco install postgresql16 -y --package-parameters="'/NoPgAdmin'" --force
    
    REM Запуск службы
    timeout /t 10 /nobreak >nul
    net start postgresql*-x64-16 >nul 2>&1
    
    REM Создание БД
    set PGPASSWORD=postgres
    "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres ktru >nul 2>&1
    "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ktru -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" >nul 2>&1
)

REM 6. Установка Git (если нет)
echo [6/10] Установка Git...
where git >nul 2>&1
if %errorlevel% neq 0 (
    choco install git -y --force
)

REM 7. Frontend зависимости
echo [7/10] Установка Frontend зависимостей...
if exist "frontend\package.json" (
    cd frontend
    npm cache clean --force >nul 2>&1
    echo Установка npm пакетов (может занять 3-5 минут)...
    npm install --silent
    cd ..
)

REM 8. Backend зависимости
echo [8/10] Установка Backend зависимостей...
if exist "backend\requirements.txt" (
    cd backend
    python -m pip install --upgrade pip --quiet >nul 2>&1
    
    echo Установка Python пакетов (может занять 2-3 минуты)...
    python -m pip install -r requirements.txt --quiet >nul 2>&1
    
    REM Если ошибка - установка по одному
    if %errorlevel% neq 0 (
        echo Повторная установка по одному пакету...
        python -m pip install fastapi --quiet
        python -m pip install "uvicorn[standard]" --quiet
        python -m pip install sqlalchemy --quiet
        python -m pip install psycopg2-binary --quiet
        python -m pip install pydantic --quiet
        python -m pip install python-multipart --quiet
    )
    cd ..
)

REM 9. Создание .env файлов
echo [9/10] Создание конфигурационных файлов...

if not exist "frontend\.env.local" (
    (
        echo # Google Gemini API Key
        echo VITE_GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY_HERE
        echo.
        echo # OpenRouter API Key
        echo VITE_OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY_HERE
        echo.
        echo # Backend URL
        echo VITE_API_URL=http://localhost:8000
    ) > "frontend\.env.local"
    echo Создан frontend\.env.local
)

if not exist "backend\.env" (
    echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ktru > "backend\.env"
    echo Создан backend\.env
)

REM 10. Финал
echo [10/10] Проверка установки...
echo.
echo ============================================================
echo   УСТАНОВКА ЗАВЕРШЕНА
echo ============================================================
echo.
echo Установленные компоненты:
echo.

where node >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js
    node --version
) else (
    echo [ОШИБКА] Node.js не установлен
)

where python >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python
    python --version
) else (
    echo [ОШИБКА] Python не установлен
)

sc query postgresql*-x64-16 >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] PostgreSQL
) else (
    echo [ОШИБКА] PostgreSQL не установлен
)

if exist "frontend\node_modules" (
    echo [OK] Frontend зависимости
) else (
    echo [ОШИБКА] Frontend зависимости не установлены
)

python -m pip list 2>nul | findstr "fastapi" >nul
if %errorlevel% equ 0 (
    echo [OK] Backend зависимости
) else (
    echo [ОШИБКА] Backend зависимости не установлены
)

echo.
echo ============================================================
echo.
echo ДАЛЬНЕЙШИЕ ШАГИ:
echo.
echo 1. Отредактируйте frontend\.env.local
echo    и укажите API ключи:
echo    - VITE_GOOGLE_API_KEY=ВАШ_КЛЮЧ
echo    - VITE_OPENROUTER_API_KEY=ВАШ_КЛЮЧ
echo.
echo 2. Запустите приложение:
echo    .\start.ps1
echo    или из папки:
echo    .\win10_deploy\start.ps1
echo.
echo 3. Откройте в браузере: http://localhost:3000
echo.
echo ПРИ ОШИБКАХ:
echo    1. Запустите: diagnose.bat
echo    2. Скопируйте лог
echo    3. Отправьте разработчику
echo.
pause