@echo off
REM full_auto_install.bat - Полностью автоматическая установка с защитой от ошибок
REM Запускать от имени администратора
REM При ошибках - копируйте содержимое лог-файла и отправьте разработчику

set LOG_FILE=install_log.txt
echo ============================================================ > %LOG_FILE%
echo   ПОЛНАЯ УСТАНОВКА NORMALIZER >> %LOG_FILE%
echo   Дата: %date% %time% >> %LOG_FILE%
echo ============================================================ >> %LOG_FILE%
echo.

echo ============================================================
echo   ПОЛНОСТЬЮ АВТОМАТИЧЕСКАЯ УСТАНОВКА
echo ============================================================
echo.
echo Все ошибки будут записаны в: %LOG_FILE%
echo При проблемах - отправьте этот файл разработчику
echo.
pause

REM Сохранение информации о системе
echo СИСТЕМА: >> %LOG_FILE%
echo Windows: %OS% >> %LOG_FILE%
ver >> %LOG_FILE%
echo Компьютер: %COMPUTERNAME% >> %LOG_FILE%
echo Пользователь: %USERNAME% >> %LOG_FILE%
echo. >> %LOG_FILE%

REM ============================================================
echo [1/20] Проверка прав администратора... >> %LOG_FILE%
echo [1/20] Проверка прав администратора...
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ОШИБКА: Не администратор! >> %LOG_FILE%
    echo. >> %LOG_FILE%
    echo ТРЕБУЕТСЯ: Запуск от имени администратора >> %LOG_FILE%
    echo СКАЧАЙТЕ ЛОГ: %LOG_FILE% >> %LOG_FILE%
    pause
    exit /b 1
)
echo OK >> %LOG_FILE%
echo OK

REM ============================================================
echo. >> %LOG_FILE%
echo [2/20] Настройка PowerShell... >> %LOG_FILE%
echo [2/20] Настройка PowerShell...
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force" >> %LOG_FILE% 2>&1
echo OK >> %LOG_FILE%
echo OK

REM ============================================================
echo. >> %LOG_FILE%
echo [3/20] Проверка Chocolatey... >> %LOG_FILE%
echo [3/20] Проверка Chocolatey...
where choco >nul 2>&1
if %errorlevel% neq 0 (
    echo УСТАНОВКА Chocolatey... >> %LOG_FILE%
    echo Установка Chocolatey...
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))" >> %LOG_FILE% 2>&1
    
    REM Повторная проверка
    where choco >nul 2>&1
    if %errorlevel% neq 0 (
        echo ОШИБКА установки Chocolatey >> %LOG_FILE%
        echo ПРОДОЛЖАЕМ БЕЗ CHOCOLATEY >> %LOG_FILE%
        echo ВНИМАНИЕ: Без Chocolatey установка будет сложнее >> %LOG_FILE%
    ) else (
        echo OK >> %LOG_FILE%
        echo OK
    )
) else (
    echo OK >> %LOG_FILE%
    echo OK
)

REM ============================================================
echo. >> %LOG_FILE%
echo [4/20] Установка Node.js... >> %LOG_FILE%
echo [4/20] Установка Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка... >> %LOG_FILE%
    if exist "C:\ProgramData\chocolatey\bin\choco.exe" (
        choco install nodejs-lts -y >> %LOG_FILE% 2>&1
    ) else (
        echo СКАЧАЙТЕ Node.js вручную: https://nodejs.org/ >> %LOG_FILE%
        echo И установите, затем перезапустите этот скрипт >> %LOG_FILE%
    )
    
    REM Проверка
    where node >nul 2>&1
    if %errorlevel% neq 0 (
        echo ОШИБКА: Node.js не установлен >> %LOG_FILE%
    ) else (
        echo OK >> %LOG_FILE%
        echo OK
        node --version >> %LOG_FILE%
    )
) else (
    echo OK (уже установлен) >> %LOG_FILE%
    echo OK (уже установлен)
    node --version >> %LOG_FILE% 2>&1
)

REM ============================================================
echo. >> %LOG_FILE%
echo [5/20] Установка Python... >> %LOG_FILE%
echo [5/20] Установка Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка... >> %LOG_FILE%
    if exist "C:\ProgramData\chocolatey\bin\choco.exe" (
        choco install python -y >> %LOG_FILE% 2>&1
    ) else (
        echo СКАЧАЙТЕ Python вручную: https://python.org/ >> %LOG_FILE%
        echo Выберите Python 3.11 или выше >> %LOG_FILE%
        echo Добавьте Python в PATH при установке >> %LOG_FILE%
    )
    
    REM Проверка
    where python >nul 2>&1
    if %errorlevel% neq 0 (
        echo ОШИБКА: Python не установлен >> %LOG_FILE%
    ) else (
        echo OK >> %LOG_FILE%
        echo OK
        python --version >> %LOG_FILE% 2>&1
    )
) else (
    echo OK (уже установлен) >> %LOG_FILE%
    echo OK (уже установлен)
    python --version >> %LOG_FILE% 2>&1
)

REM ============================================================
echo. >> %LOG_FILE%
echo [6/20] Установка PostgreSQL... >> %LOG_FILE%
echo [6/20] Установка PostgreSQL...
sc query postgresql*-x64-16 >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка... >> %LOG_FILE%
    if exist "C:\ProgramData\chocolatey\bin\choco.exe" (
        choco install postgresql16 -y >> %LOG_FILE% 2>&1
        timeout /t 15 /nobreak >nul
    ) else (
        echo СКАЧАЙТЕ PostgreSQL вручную: https://postgresql.org/ >> %LOG_FILE%
        echo Выберите версию 16 >> %LOG_FILE%
        echo Пароль: postgres >> %LOG_FILE%
    )
    
    REM Запуск службы
    timeout /t 5 /nobreak >nul
    net start postgresql*-x64-16 >> %LOG_FILE% 2>&1
    
    REM Проверка
    sc query postgresql*-x64-16 >nul 2>&1
    if %errorlevel% neq 0 (
        echo ОШИБКА: PostgreSQL не установлен >> %LOG_FILE%
    ) else (
        echo OK >> %LOG_FILE%
        echo OK
    )
) else (
    echo OK (уже установлен) >> %LOG_FILE%
    echo OK (уже установлен)
)

REM ============================================================
echo. >> %LOG_FILE%
echo [7/20] Установка Git... >> %LOG_FILE%
echo [7/20] Установка Git...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка... >> %LOG_FILE%
    if exist "C:\ProgramData\chocolatey\bin\choco.exe" (
        choco install git -y >> %LOG_FILE% 2>&1
    ) else (
        echo СКАЧАЙТЕ Git вручную: https://git-scm.com/ >> %LOG_FILE%
    )
    
    REM Проверка
    where git >nul 2>&1
    if %errorlevel% neq 0 (
        echo ОШИБКА: Git не установлен >> %LOG_FILE%
    ) else (
        echo OK >> %LOG_FILE%
        echo OK
    )
) else (
    echo OK (уже установлен) >> %LOG_FILE%
    echo OK (уже установлен)
)

REM ============================================================
echo. >> %LOG_FILE%
echo [8/20] Проверка структуры проекта... >> %LOG_FILE%
echo [8/20] Проверка структуры проекта...

if not exist "frontend" (
    echo ОШИБКА: Папка frontend не найдена >> %LOG_FILE%
    echo Убедитесь, что запускаете из корневой директории проекта >> %LOG_FILE%
) else (
    echo OK - frontend найден >> %LOG_FILE%
    echo OK
)

if not exist "backend" (
    echo ОШИБКА: Папка backend не найдена >> %LOG_FILE%
    echo Убедитесь, что запускаете из корневой директории проекта >> %LOG_FILE%
) else (
    echo OK - backend найден >> %LOG_FILE%
    echo OK
)

REM ============================================================
echo. >> %LOG_FILE%
echo [9/20] Установка Frontend зависимостей... >> %LOG_FILE%
echo [9/20] Установка Frontend зависимостей...
if exist "frontend\package.json" (
    cd frontend
    
    echo Очистка кэша npm... >> %LOG_FILE%
    npm cache clean --force >> %LOG_FILE% 2>&1
    
    echo Установка пакетов... >> %LOG_FILE%
    echo Установка пакетов (это может занять несколько минут)...
    npm install >> %LOG_FILE% 2>&1
    
    if %errorlevel% neq 0 (
        echo ОШИБКА установки Frontend зависимостей >> %LOG_FILE%
        echo ПОВТОРНАЯ ПОПЫТКА... >> %LOG_FILE%
        npm install --force >> %LOG_FILE% 2>&1
    )
    
    cd ..
    
    if exist "frontend\node_modules" (
        echo OK >> %LOG_FILE%
        echo OK
    ) else (
        echo НЕ УСТАНОВЛЕНО >> %LOG_FILE%
    )
) else (
    echo ПРОПУСК (frontend не найден) >> %LOG_FILE%
)

REM ============================================================
echo. >> %LOG_FILE%
echo [10/20] Установка Backend зависимостей... >> %LOG_FILE%
echo [10/20] Установка Backend зависимостей...
if exist "backend\requirements.txt" (
    cd backend
    
    echo Обновление pip... >> %LOG_FILE%
    python -m pip install --upgrade pip >> %LOG_FILE% 2>&1
    
    echo Установка пакетов... >> %LOG_FILE%
    echo Установка пакетов (это может занять несколько минут)...
    
    REM Попытка 1: Обычная установка
    python -m pip install -r requirements.txt >> %LOG_FILE% 2>&1
    
    if %errorlevel% neq 0 (
        echo ОШИБКА первой попытки >> %LOG_FILE%
        echo ПОВТОРНАЯ ПОПЫТКА с --no-cache-dir... >> %LOG_FILE%
        
        REM Попытка 2: Без кэша
        python -m pip install --no-cache-dir -r requirements.txt >> %LOG_FILE% 2>&1
    )
    
    if %errorlevel% neq 0 (
        echo ОШИБКА второй попытки >> %LOG_FILE%
        echo УСТАНОВКА ПО ОДНОМУ... >> %LOG_FILE%
        
        REM Попытка 3: установка по одному пакету
        python -m pip install fastapi >> %LOG_FILE% 2>&1
        python -m pip install "uvicorn[standard]" >> %LOG_FILE% 2>&1
        python -m pip install sqlalchemy >> %LOG_FILE% 2>&1
        python -m pip install psycopg2-binary >> %LOG_FILE% 2>&1
        python -m pip install pydantic >> %LOG_FILE% 2>&1
        python -m pip install python-multipart >> %LOG_FILE% 2>&1
    )
    
    cd ..
    
    REM Проверка установки
    python -m pip list | findstr "fastapi uvicorn sqlalchemy psycopg2 pydantic" >> %LOG_FILE% 2>&1
    if %errorlevel% equ 0 (
        echo OK >> %LOG_FILE%
        echo OK
    ) else (
        echo ЧАСТИЧНО УСТАНОВЛЕНО >> %LOG_FILE%
    )
) else (
    echo ПРОПУСК (backend не найден) >> %LOG_FILE%
)

REM ============================================================
echo. >> %LOG_FILE%
echo [11/20] Создание .env файлов... >> %LOG_FILE%
echo [11/20] Создание .env файлов...

if not exist "frontend\.env.local" (
    echo Создание frontend\.env.local... >> %LOG_FILE%
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
    echo Создан frontend\.env.local (ЗАПОЛНИТЕ API КЛЮЧИ!) >> %LOG_FILE%
) else (
    echo OK (уже существует) >> %LOG_FILE%
)

if not exist "backend\.env" (
    echo Создание backend\.env... >> %LOG_FILE%
    echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ktru > "backend\.env"
    echo Создан backend\.env >> %LOG_FILE%
) else (
    echo OK (уже существует) >> %LOG_FILE%
)

echo OK
echo OK

REM ============================================================
echo. >> %LOG_FILE%
echo [12/20] Создание базы данных... >> %LOG_FILE%
echo [12/20] Создание базы данных...

set PGPASSWORD=postgres

"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -lqt 2>nul | findstr "ktru" >nul
if %errorlevel% neq 0 (
    echo Создание БД ktru... >> %LOG_FILE%
    "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres ktru >> %LOG_FILE% 2>&1
    
    if %errorlevel% equ 0 (
        echo OK >> %LOG_FILE%
        echo OK
        
        echo Создание расширений... >> %LOG_FILE%
        "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ktru -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" >> %LOG_FILE% 2>&1
    ) else (
        echo ОШИБКА создания БД >> %LOG_FILE%
        echo Создайте БД вручную: createdb -U postgres ktru >> %LOG_FILE%
    )
) else (
    echo OK (БД уже существует) >> %LOG_FILE%
    echo OK (БД уже существует)
)

REM ============================================================
echo. >> %LOG_FILE%
echo [13/20] Проверка портов... >> %LOG_FILE%
echo [13/20] Проверка портов...

netstat -ano | findstr ":3000" >nul 2>&1
if %errorlevel% equ 0 (
    echo ВНИМАНИЕ: Порт 3000 занят >> %LOG_FILE%
    netstat -ano | findstr ":3000" >> %LOG_FILE%
) else (
    echo OK - Порт 3000 свободен >> %LOG_FILE%
)

netstat -ano | findstr ":8000" >nul 2>&1
if %errorlevel% equ 0 (
    echo ВНИМАНИЕ: Порт 8000 занят >> %LOG_FILE%
    netstat -ano | findstr ":8000" >> %LOG_FILE%
) else (
    echo OK - Порт 8000 свободен >> %LOG_FILE%
)

netstat -ano | findstr ":5432" >nul 2>&1
if %errorlevel% equ 0 (
    echo OK - PostgreSQL запущен (порт 5432) >> %LOG_FILE%
) else (
    echo ВНИМАНИЕ: PostgreSQL не запущен >> %LOG_FILE%
    net start postgresql*-x64-16 >> %LOG_FILE% 2>&1
)

REM ============================================================
echo. >> %LOG_FILE%
echo [14/20] Создание скриптов запуска... >> %LOG_FILE%
echo [14/20] Создание скриптов запуска...

REM Создание ярлыков запуска в корне проекта
if exist "win10_deploy\start.ps1" (
    copy "win10_deploy\start.ps1" "start.ps1" >nul 2>&1
    copy "win10_deploy\stop.ps1" "stop.ps1" >nul 2>&1
    copy "win10_deploy\status.ps1" "status.ps1" >nul 2>&1
    echo OK >> %LOG_FILE%
    echo OK
) else (
    echo ПРОПУСК (скрипты не найдены) >> %LOG_FILE%
)

REM ============================================================
echo. >> %LOG_FILE%
echo [15/20] ИТОГОВАЯ ПРОВЕРКА... >> %LOG_FILE%
echo. >> %LOG_FILE%

echo УСТАНОВЛЕННЫЕ КОМПОНЕНТЫ: >> %LOG_FILE%
echo ================================ >> %LOG_FILE%

where node >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js: >> %LOG_FILE%
    node --version >> %LOG_FILE% 2>&1
) else (
    echo [ОШИБКА] Node.js не установлен >> %LOG_FILE%
)

where python >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python: >> %LOG_FILE%
    python --version >> %LOG_FILE% 2>&1
) else (
    echo [ОШИБКА] Python не установлен >> %LOG_FILE%
)

where git >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Git: >> %LOG_FILE%
    git --version >> %LOG_FILE% 2>&1
) else (
    echo [ОШИБКА] Git не установлен >> %LOG_FILE%
)

sc query postgresql*-x64-16 >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] PostgreSQL: установлен >> %LOG_FILE%
) else (
    echo [ОШИБКА] PostgreSQL не установлен >> %LOG_FILE%
)

if exist "frontend\node_modules" (
    echo [OK] Frontend зависимости >> %LOG_FILE%
) else (
    echo [ОШИБКА] Frontend зависимости не установлены >> %LOG_FILE%
)

python -m pip list 2>nul | findstr "fastapi" >nul
if %errorlevel% equ 0 (
    echo [OK] Backend зависимости >> %LOG_FILE%
) else (
    echo [ОШИБКА] Backend зависимости не установлены >> %LOG_FILE%
)

echo. >> %LOG_FILE%
echo ================================ >> %LOG_FILE%
echo. >> %LOG_FILE%

REM ============================================================
echo. >> %LOG_FILE%
echo [ОКОНЧАНИЕ] Установка завершена >> %LOG_FILE%
echo Проверьте лог: %LOG_FILE% >> %LOG_FILE%
echo.

echo.
echo ============================================================
echo   УСТАНОВКА ЗАВЕРШЕНА
echo ============================================================
echo.
echo Лог установки сохранен в: %LOG_FILE%
echo.
echo ДАЛЬНЕЙШИЕ ДЕЙСТВИЯ:
echo.
echo 1. Отредактируйте frontend\.env.local
echo    и укажите API ключи:
echo    - VITE_GOOGLE_API_KEY=ВАШ_КЛЮЧ
echo    - VITE_OPENROUTER_API_KEY=ВАШ_КЛЮЧ
echo.
echo 2. Запустите приложение:
echo    - PowerShell: .\start.ps1
echo    - или из папки: .\win10_deploy\start.ps1
echo.
echo 3. Откройте в браузере: http://localhost:3000
echo.
echo ЕСЛИ БЫЛИ ОШИБКИ:
echo   1. Откройте файл: %LOG_FILE%
echo   2. Скопируйте содержимое
echo   3. Отправьте разработчику
echo.
pause

REM Открыть лог в блокноте
notepad %LOG_FILE%