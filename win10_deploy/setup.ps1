# setup.ps1 - Автоматическая настройка Windows 10 для Normalizer
# Запускать от имени администратора

param(
    [switch]$SkipDeps,      # Пропустить установку зависимостей
    [switch]$SkipDb,        # Пропустить настройку БД
    [switch]$Force          # Принудительная установка
)

$ErrorActionPreference = "Stop"

# Цвета для вывода
function Write-Success { param($text) Write-Host $text -ForegroundColor Green }
function Write-Error { param($text) Write-Host $text -ForegroundColor Red }
function Write-Info { param($text) Write-Host $text -ForegroundColor Cyan }
function Write-Warning { param($text) Write-Host $text -ForegroundColor Yellow }

Write-Host "================================================" -ForegroundColor Magenta
Write-Host "  Настройка Normalizer на Windows 10" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta
Write-Host ""

# Проверка прав администратора
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "ОШИБКА: Скрипт должен запускаться от имени администратора!"
    Write-Host "      Правый клик на PowerShell -> 'Запуск от имени администратора'" -ForegroundColor Yellow
    exit 1
}

Write-Info "[1/7] Проверка прав администратора..."
Write-Success "✓ Права администратора подтверждены"

# Установка Chocolatey
Write-Info "`n[2/7] Проверка Chocolatey..."
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Warning "Chocolatey не установлен. Установка..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    try {
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        Write-Success "✓ Chocolatey установлен"
    } catch {
        Write-Error "ОШИБКА: Не удалось установить Chocolatey"
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
} else {
    Write-Success "✓ Chocolatey уже установлен"
}

if ($SkipDeps) {
    Write-Warning "⚠ Пропуск установки зависимостей (SkipDeps)"
} else {
    # Установка Node.js
    Write-Info "`n[3/7] Установка Node.js (LTS)..."
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        choco install nodejs-lts -y --force
        Write-Success "✓ Node.js установлен"
    } else {
        $nodeVersion = node --version
        Write-Success "✓ Node.js уже установлен ( версия $nodeVersion)"
    }
    
    # Установка Python
    Write-Info "`n[4/7] Установка Python..."
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        choco install python -y --force
        Write-Success "✓ Python установлен"
    } else {
        $pythonVersion = python --version 2>&1
        Write-Success "✓ Python уже установлен ($pythonVersion)"
    }
    
    # Установка PostgreSQL
    Write-Info "`n[5/7] Установка PostgreSQL..."
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    if (-not $pgService) {
        Write-Warning "PostgreSQL не установлен. Установка..."
        choco install postgresql16 -y --force
        
        # Задать пароль postgres
        $env:PGPASSWORD = "postgres"
        [Environment]::SetEnvironmentVariable("PGPASSWORD", "postgres", "User")
        
        Write-Success "✓ PostgreSQL установлен"
        
        # Запуск службы
        Write-Info "Запуск службы PostgreSQL..."
        Start-Sleep -Seconds 5
        Start-Service postgresql*-x64-16 -ErrorAction SilentlyContinue
        Write-Success "✓ Служба PostgreSQL запущена"
    } else {
        Write-Success "✓ PostgreSQL уже установлен"
        if ($pgService.Status -ne "Running") {
            Start-Service $pgService.Name
            Write-Success "✓ Служба PostgreSQL запущена"
        }
    }
    
    # Установка Git
    Write-Info "`n[6/7] Установка Git..."
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        choco install git -y --force
        Write-Success "✓ Git установлен"
    } else {
        $gitVersion = git --version
        Write-Success "✓ Git уже установлен ($gitVersion)"
    }
}

# Проверка и создание проекта
Write-Info "`n[7/7] Настройка проекта..."

# Определить директорию
$projectName = "Normalizer"
$projectPath = Join-Path $PWD.Path $projectName

if (Test-Path $projectPath) {
    if ($Force) {
        Write-Warning "Принудительное обновление существующего проекта..."
        Set-Location $projectPath
        git fetch origin
        git reset --hard origin/main
        Write-Success "✓ Проект обновлен"
    } else {
        Write-Success "✓ Проект уже существует в $projectPath"
        Write-Host "  Для обновления используйте: .\update.ps1" -ForegroundColor Yellow
        Set-Location $projectPath
    }
} else {
    Write-Info "Клонирование репозитория..."
    git clone https://github.com/Den-Snaker/Normalizer.git
    Set-Location $projectName
    Write-Success "✓ Репозиторий клонирован"
}

# Создание директории для логов
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" -Force | Out-Null
    Write-Success "✓ Директория logs создана"
}

# Установка зависимостей Frontend
Write-Info "`n[Frontend] Установка зависимостей..."
if (-not $SkipDeps) {
    Set-Location frontend
    npm install --silent
    Write-Success "✓ Зависимости Frontend установлены"
    Set-Location ..
}

# Установка зависимостей Backend
Write-Info "`n[Backend] Установка зависимостей..."
if (-not $SkipDeps) {
    Set-Location backend
    python -m pip install --upgrade pip --quiet
    pip install -r requirements.txt --quiet
    Write-Success "✓ Зависимости Backend установлены"
    Set-Location ..
}

# Создание .env файлов
Write-Info "`n[Config] Создание конфигурационных файлов..."

# Frontend .env.local
$envLocal = Join-Path "frontend" ".env.local"
if (-not (Test-Path $envLocal) -or $Force) {
    Write-Host "`nВведите API ключи (или нажмите Enter для использования placeholder):" -ForegroundColor Yellow
    
    $googleKey = Read-Host "Google Gemini API Key (получить на https://makersuite.google.com/app/apikey)"
    if ([string]::IsNullOrWhiteSpace($googleKey)) {
        $googleKey = "YOUR_GOOGLE_API_KEY"
        Write-Warning "  Используется placeholder для Google API"
    }
    
    $openrouterKey = Read-Host "OpenRouter API Key (получить на https://openrouter.ai/keys)"
    if ([string]::IsNullOrWhiteSpace($openrouterKey)) {
        $openrouterKey = "YOUR_OPENROUTER_API_KEY"
        Write-Warning "  Используется placeholder для OpenRouter API"
    }
    
    $envContent = @"
# Google Gemini API Key
VITE_GOOGLE_API_KEY=$googleKey

# OpenRouter API Key
VITE_OPENROUTER_API_KEY=$openrouterKey

# Backend URL
VITE_API_URL=http://localhost:8000
"@
    
    Set-Content -Path $envLocal -Value $envContent -Encoding UTF8
    Write-Success "✓ $envLocal создан"
} else {
    Write-Success "✓ $envLocal уже существует"
}

# Backend .env
$envBackend = Join-Path "backend" ".env"
if (-not (Test-Path $envBackend) -or $Force) {
    $envContent = @"
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ktru
"@
    
    Set-Content -Path $envBackend -Value $envContent -Encoding UTF8
    Write-Success "✓ $envBackend создан"
} else {
    Write-Success "✓ $envBackend уже существует"
}

# Настройка базы данных
if (-not $SkipDb) {
    Write-Info "`n[Database] Настройка PostgreSQL..."
    
    $env:PGPASSWORD = "postgres"
    
    # Проверка существования БД
    $dbExists = & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -lqt 2>$null | Select-String "ktru"
    
    if (-not $dbExists) {
        Write-Info "Создание базы данных ktru..."
        & "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres ktru 2>$null
        Write-Success "✓ База данных ktru создана"
        
        # Создание расширений
        & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ktru -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" 2>$null
        Write-Success "✓ Расширение uuid-ossp установлено"
        
        # Инициализация таблиц
        Write-Info "Создание таблиц..."
        Set-Location backend
        python -c "from database import engine; from main import Base; Base.metadata.create_all(bind=engine)" 2>$null
        Set-Location ..
        Write-Success "✓ Таблицы созданы"
    } else {
        Write-Success "✓ База данных ktru уже существует"
    }
}

# Создание скриптов управления
Write-Info "`n[Scripts] Создание скриптов управления..."

# start.ps1
$startPs1 = @"
# start.ps1 - Запуск серверов
`$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "      ЗАПУСК NORMALIZER" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Проверка портов
`$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
`$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if (`$port3000) {
    Write-Host "⚠ Порт 3000 уже занят" -ForegroundColor Yellow
    Write-Host "  Для остановки выполните: .\stop.ps1" -ForegroundColor Yellow
    exit 1
}

if (`$port8000) {
    Write-Host "⚠ Порт 8000 уже занят" -ForegroundColor Yellow
    Write-Host "  Для остановки выполните: .\stop.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/2] Запуск Backend... " -NoNewline
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"`"`$(Get-Location)`"`"\backend; python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload" -WindowStyle Normal
Start-Sleep -Seconds 3
Write-Host "✓" -ForegroundColor Green

Write-Host "[2/2] Запуск Frontend... " -NoNewline
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"`"`$(Get-Location)`"`"\frontend; npm run dev" -WindowStyle Normal
Start-Sleep -Seconds 5
Write-Host "✓" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "      СЕРВЕРЫ ЗАПУЩЕНЫ" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor Cyan
Write-Host "  Health:  http://localhost:8000/health" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nДля остановки: .\stop.ps1" -ForegroundColor Yellow
"@

Set-Content -Path "start.ps1" -Value $startPs1 -Encoding UTF8

# stop.ps1
$stopPs1 = @"
# stop.ps1 - Остановка серверов
`$ErrorActionPreference = "SilentlyContinue"

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "      ОСТАНОВКА NORMALIZER" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

Write-Host "[1/2] Остановка Backend... " -NoNewline
`$backendPid = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if (`$backendPid) {
    Stop-Process -Id `$backendPid -Force
    Write-Host "✓" -ForegroundColor Green
} else {
    Write-Host "не запущен" -ForegroundColor Yellow
}

Write-Host "[2/2] Остановка Frontend... " -NoNewline
`$frontendPid = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if (`$frontendPid) {
    Stop-Process -Id `$frontendPid -Force
    Write-Host "✓" -ForegroundColor Green
} else {
    Write-Host "не запущен" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "      СЕРВЕРЫ ОСТАНОВЛЕНЫ" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
"@

Set-Content -Path "stop.ps1" -Value $stopPs1 -Encoding UTF8

# status.ps1
$statusPs1 = @"
# status.ps1 - Проверка статуса серверов
`$ErrorActionPreference = "SilentlyContinue"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "      СТАТУС NORMALIZER" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Frontend (порт 3000): " -NoNewline
`$frontend = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if (`$frontend) {
    Write-Host "ЗАПУЩЕН" -ForegroundColor Green
    try {
        `$response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
        Write-Host "  Статус: OK (HTTP `$(`$response.StatusCode))" -ForegroundColor Gray
    } catch {
        Write-Host "  Статус: НЕ ОТВЕЧАЕТ" -ForegroundColor Red
    }
} else {
    Write-Host "ОСТАНОВЛЕН" -ForegroundColor Red
}

Write-Host "`nBackend (порт 8000): " -NoNewline
`$backend = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if (`$backend) {
    Write-Host "ЗАПУЩЕН" -ForegroundColor Green
    try {
        `$response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 2
        Write-Host "  Статус: OK (HTTP `$(`$response.StatusCode))" -ForegroundColor Gray
        `$json = `$response.Content | ConvertFrom-Json
        if (`$json.message) {
            Write-Host " Сообщение: `$(`$json.message)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  Статус: НЕ ОТВЕЧАЕТ" -ForegroundColor Red
    }
} else {
    Write-Host "ОСТАНОВЛЕН" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
"@

Set-Content -Path "status.ps1" -Value $statusPs1 -Encoding UTF8

# update.ps1
$updatePs1 = @"
# update.ps1 - Обновление из GitHub
param([switch]`$Force)

`$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "      ОБНОВЛЕНИЕ NORMALIZER" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "[1/4] Проверка изменений..." -NoNewline
`$status = git status --porcelain
if (`$status -and -not `$Force) {
    Write-Host "`nОбнаружены локальные изменения:" -ForegroundColor Yellow
    git status --short
    `$confirm = Read-Host "`nПродолжить и перезаписать изменения? (y/N)"
    if (`$confirm -ne "y" -and `$confirm -ne "Y") {
        Write-Host "Отмена обновления" -ForegroundColor Yellow
        exit 0
    }
}
Write-Host "✓" -ForegroundColor Green

Write-Host "`n[2/4] Резервное копирование .env файлов... " -NoNewline
Copy-Item "frontend\.env.local" "frontend\.env.local.backup" -Force -ErrorAction SilentlyContinue
Copy-Item "backend\.env" "backend\.env.backup" -Force -ErrorAction SilentlyContinue
Write-Host "✓" -ForegroundColor Green

Write-Host "`n[3/4] Получение обновлений... " -NoNewline
git fetch origin
git reset --hard origin/main
Write-Host "✓" -ForegroundColor Green

Write-Host "`n[4/4] Восстановление .env файлов... " -NoNewline
Move-Item "frontend\.env.local.backup" "frontend\.env.local" -Force -ErrorAction SilentlyContinue
Move-Item "backend\.env.backup" "backend\.env" -Force -ErrorAction SilentlyContinue
Write-Host "✓" -ForegroundColor Green

Write-Host "`n[5/6] Обновление зависимостей Frontend... " -NoNewline
Set-Location frontend
npm install --silent
Set-Location ..
Write-Host "✓" -ForegroundColor Green

Write-Host "`n[6/6] Обновление зависимостей Backend... " -NoNewline
Set-Location backend
pip install -r requirements.txt --quiet
Set-Location ..
Write-Host "✓" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "      ОБНОВЛЕНИЕ ЗАВЕРШЕНО" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nДля запуска: .\start.ps1" -ForegroundColor Cyan
"@

Set-Content -Path "update.ps1" -Value $updatePs1 -Encoding UTF8

Write-Success "✓ Скрипты управления созданы: start.ps1, stop.ps1, status.ps1, update.ps1"

# Финальное сообщение
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "      НАСТРОЙКА ЗАВЕРШЕНА" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Проект установлен в: $PWD" -ForegroundColor Cyan
Write-Host ""
Write-Host "Дальнейшие шаги:" -ForegroundColor Yellow
Write-Host "  1. Отредактируйте frontend\.env.local и укажите API ключи" -ForegroundColor White
Write-Host "  2. Запустите: .\start.ps1" -ForegroundColor White
Write-Host "  3. Откройте: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Управление:" -ForegroundColor Yellow
Write-Host "  .\start.ps1   - Запуск серверов" -ForegroundColor White
Write-Host "  .\stop.ps1    - Остановка серверов" -ForegroundColor White
Write-Host "  .\status.ps1  - Проверка статуса" -ForegroundColor White
Write-Host "  .\update.ps1  - Обновление из GitHub" -ForegroundColor White
Write-Host ""
Write-Host "Документация: README_WINDOWS_10.md" -ForegroundColor Cyan
Write-Host "================================================`n" -ForegroundColor Magenta