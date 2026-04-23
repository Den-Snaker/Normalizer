@echo off
REM fix_python_version.bat - Исправление проблемы с Python 3.14
REM Устанавливает Python 3.11 и использует его для backend

echo ============================================================
echo   ИСПРАВЛЕНИЕ: PYTHON 3.14 НЕ ПОДДЕРЖИВАЕТСЯ
echo ============================================================
echo.
echo Проблема: Установлен Python 3.14
echo Некоторые пакеты (asyncpg, pydantic-core) еще не поддерживают Python 3.14
echo.
echo Решение: Установить Python 3.11 или 3.12
echo.
pause

REM Проверка текущей версии Python
echo Проверка версии Python...
python --version
echo.

REM Проверка Chocolatey
where choco >nul 2>&1
if %errorlevel% neq 0 (
    echo Chocolatey не установлен. Установка...
    PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
    timeout /t 5 /nobreak >nul
)

REM Установка Python 3.11
echo.
echo ============================================================
echo   Установка Python 3.11
echo ============================================================
echo.

REM Удаление Python 3.14 (если установлен через Chocolatey)
choco uninstall python -y >nul 2>&1

REM Установка Python 3.11
choco install python311 -y --force

if %errorlevel% neq 0 (
    echo.
    echo ОШИБКА: Не удалось установить Python 3.11
    echo.
    echo Скачайте вручную:
    echo https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe
    echo.
    echo При установке отметьте "Add Python to PATH"
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   Python 3.11 установлен
echo ============================================================
echo.

REM Обновление pip для Python 3.11
echo Обновление pip...
py -3.11 -m pip install --upgrade pip

REM Установка зависимостей для backend с Python 3.11
echo.
echo ============================================================
echo   Установка backend зависимостей (Python 3.11)
echo ============================================================
echo.

if exist "backend\requirements.txt" (
    cd backend
    
    REM Установка основных зависимостей
    echo Установка fastapi...
    py -3.11 -m pip install fastapi --quiet
    
    echo Установка uvicorn...
    py -3.11 -m pip install "uvicorn[standard]" --quiet
    
    echo Установка sqlalchemy...
    py -3.11 -m pip install sqlalchemy --quiet
    
    echo Установка psycopg2-binary (вместо asyncpg)...
    py -3.11 -m pip install psycopg2-binary --quiet
    
    echo Установка pydantic...
    py -3.11 -m pip install pydantic --quiet
    
    echo Установка остальных зависимостей...
    py -3.11 -m pip install python-multipart python-dotenv google-genai openpyxl python-docx pypdf extract-msg aiofiles httpx beautifulsoup4 --quiet
    
    cd ..
    
    echo.
    echo ============================================================
    echo   Проверка установки
    echo ============================================================
    echo.
    
    py -3.11 -m pip list | findstr "fastapi uvicorn sqlalchemy psycopg2 pydantic"
    
    echo.
    echo Если вы видите список пакетов - установка успешна!
)

echo.
echo ============================================================
echo   ГОТОВО К ИСПОЛЬЗОВАНИЮ
echo ============================================================
echo.
echo Python 3.11 установлен и готов к использованию.
echo.
echo Для запуска backend используйте:
echo   py -3.11 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
echo.
echo Или запустите:
echo   start_backend_py311.bat
echo.
pause