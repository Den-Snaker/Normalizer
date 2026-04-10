@echo off
REM install_backend_deps.bat - Установка только backend зависимостей
REM Запускать из корневой директории проекта

echo ============================================================
echo   УСТАНОВКА BACKEND ЗАВИСИМОСТЕЙ
echo ============================================================
echo.

REM Проверка Python
echo [1/3] Проверка Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo ОШИБКА: Python не установлен!
    echo Установите Python: choco install python -y
    pause
    exit /b 1
)

python --version
echo OK

REM Проверка pip
echo.
echo [2/3] Проверка pip...
python -m pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Установка pip...
    python -m ensurepip --upgrade
)

echo Обновление pip...
python -m pip install --upgrade pip
echo OK

REM Установка зависимостей
echo.
echo [3/3] Установка зависимостей из requirements.txt...
echo.

if not exist "backend\requirements.txt" (
    echo ОШИБКА: Файл backend\requirements.txt не найден!
    echo Убедитесь, что находитесь в корневой директории проекта
    pause
    exit /b 1
)

cd backend

echo Установка основных зависимостей...
python -m pip install fastapi uvicorn[standard] sqlalchemy psycopg2-binary pydantic python-multipart --quiet

if %errorlevel% neq 0 (
    echo.
    echo ПЕРВАЯ ПОПЫТКА НЕ УДАЛАСЬ
    echo Пробуем с --no-cache-dir...
    python -m pip install --no-cache-dir fastapi uvicorn[standard] sqlalchemy psycopg2-binary pydantic python-multipart
)

if %errorlevel% neq 0 (
    echo.
    echo ВТОРАЯ ПОПЫТКА НЕ УДАЛАСЬ
    echo Пробуем установить по одной...
    
    echo Installing fastapi...
    python -m pip install fastapi --quiet
    
    echo Installing uvicorn...
    python -m pip install uvicorn[standard] --quiet
    
    echo Installing sqlalchemy...
    python -m pip install sqlalchemy --quiet
    
    echo Installing psycopg2-binary...
    python -m pip install psycopg2-binary --quiet
    
    echo Installing pydantic...
    python -m pip install pydantic --quiet
    
    echo Installing python-multipart...
    python -m pip install python-multipart --quiet
)

cd ..

echo.
echo ============================================================
echo   УСТАНОВКА ЗАВЕРШЕНА
echo ============================================================
echo.
echo Проверка установки:
python -m pip list | findstr "fastapi uvicorn sqlalchemy psycopg2 pydantic"
echo.
echo Если зависимости установлены, запустите:
echo   cd backend
echo   python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
echo.
pause