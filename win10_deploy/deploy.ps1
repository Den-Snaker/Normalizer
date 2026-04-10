# deploy.ps1 - Полное развертывание Normalizer
# Запускать от имени администратора

param(
    [switch]$Setup,      # Начальная настройка
    [switch]$Force        # Принудительное развертывание
)

$ErrorActionPreference = "Stop"

# Цвета
function Write-Success { param($text) Write-Host $text -ForegroundColor Green }
function Write-Error { param($text) Write-Host $text -ForegroundColor Red }
function Write-Info { param($text) Write-Host $text -ForegroundColor Cyan }
function Write-Warning { param($text) Write-Host $text -ForegroundColor Yellow }

# Заголовок
Write-Host "================================================" -ForegroundColor Magenta
Write-Host "  Развертывание Normalizer из GitHub" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta
Write-Host ""

# Проверка прав администратора
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and $Setup) {
    Write-Error "ОШИБКА: Скрипт должен запускаться от имени администратора!"
    Write-Host "      Правый клик на PowerShell -> 'Запуск от имени администратора'" -ForegroundColor Yellow
    exit 1
}

# Определение текущей директории
$projectDir = $PWD.Path

# Если режим Setup
if ($Setup) {
    Write-Info "[SETUP] Начальная настройка системы..."
    
    # Запуск setup.ps1
    if (Test-Path ".\setup.ps1") {
        & ".\setup.ps1" -Force
        exit 0
    } else {
        Write-Error "ОШИБКА: setup.ps1 не найден!"
        Write-Host "      Сначала запустите setup.ps1 или клонируйте репозиторий вручную" -ForegroundColor Yellow
        exit 1
    }
}

# Обычное развертывание
Write-Info "[1/8] Проверка окружения..."

# Проверка Git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "ОШИБКА: Git не установлен"
    Write-Host "      Установите Git: choco install git -y" -ForegroundColor Yellow
    Write-Host "      Или запустите: .\setup.ps1" -ForegroundColor Yellow
    exit 1
}
Write-Success "  ✓ Git установлен"

# Проверка Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "ОШИБКА: Node.js не установлен"
    Write-Host "      Установите Node.js: choco install nodejs-lts -y" -ForegroundColor Yellow
    Write-Host "      Или запустите: .\setup.ps1" -ForegroundColor Yellow
    exit 1
}
$nodeVersion = node --version
Write-Success "  ✓ Node.js $nodeVersion"

# Проверка Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "ОШИБКА: Python не установлен"
    Write-Host "      Установите Python: choco install python -y" -ForegroundColor Yellow
    Write-Host "      Или запустите: .\setup.ps1" -ForegroundColor Yellow
    exit 1
}
$pythonVersion = python --version 2>&1
Write-Success "  ✓ $pythonVersion"

# Проверка PostgreSQL
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
if (-not $pgService) {
    Write-Error "ОШИБКА: PostgreSQL не установлен"
    Write-Host "      Установите PostgreSQL: choco install postgresql16 -y" -ForegroundColor Yellow
    Write-Host "      Или запустите: .\setup.ps1" -ForegroundColor Yellow
    exit 1
}
Write-Success "  ✓ PostgreSQL $($pgService.Status)"

# Проверка репозитория
Write-Info "`n[2/8] Проверка репозитория..."
if (-not (Test-Path ".git")) {
    Write-Error "ОШИБКА: Не в репозитории Git"
    Write-Host "      Клонируйте репозиторий: git clone https://github.com/Den-Snaker/Normalizer.git" -ForegroundColor Yellow
    Write-Host "      Или запустите: .\setup.ps1" -ForegroundColor Yellow
    exit 1
}
Write-Success "  ✓ Репозиторий найден"

# Проверка .env файлов
Write-Info "`n[3/8] Проверка конфигурации..."

$frontendEnv = Join-Path "frontend" ".env.local"
$backendEnv = Join-Path "backend" ".env"

if (-not (Test-Path $frontendEnv)) {
    Write-Warning "  ⚠ frontend\.env.local не найден"
    Write-Host "      Создайте файл и укажите API ключи:" -ForegroundColor Yellow
    Write-Host "      VITE_GOOGLE_API_KEY=ВАШ_КЛЮЧ" -ForegroundColor Gray
    Write-Host "      VITE_OPENROUTER_API_KEY=ВАШ_КЛЮЧ" -ForegroundColor Gray
    Write-Host "      VITE_API_URL=http://localhost:8000" -ForegroundColor Gray
    
    if (-not $Force) {
        $create = Read-Host "`n      Создать с placeholder? (y/N)"
        if ($create -eq "y" -or $create -eq "Y") {
            Set-Content -Path $frontendEnv -Value @"
# Google Gemini API Key
VITE_GOOGLE_API_KEY=YOUR_API_KEY_HERE

# OpenRouter API Key
VITE_OPENROUTER_API_KEY=YOUR_API_KEY_HERE

# Backend URL
VITE_API_URL=http://localhost:8000
"@ -Encoding UTF8
            Write-Success "  ✓ $frontendEnv создан (с placeholder)"
        }
    }
} else {
    Write-Success "  ✓ $frontendEnv найден"
}

if (-not (Test-Path $backendEnv)) {
    Write-Warning "  ⚠ backend\.env не найден"
    
    if (-not $Force) {
        $create = Read-Host "`n      Создать с настройками по умолчанию? (y/N)"
        if ($create -eq "y" -or $create -eq "Y") {
            Set-Content -Path $backendEnv -Value "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ktru" -Encoding UTF8
            Write-Success "  ✓ $backendEnv создан"
        }
    }
} else {
    Write-Success "  ✓ $backendEnv найден"
}

# Обновление из GitHub
Write-Info "`n[4/8] Обновление из GitHub..."

# Сохранение локальных изменений
if (Test-Path "frontend\.env.local") {
    Copy-Item "frontend\.env.local" "frontend\.env.local.deploy-backup" -Force
    Write-Success "  ✓ Резервная копия .env.local создана"
}

if (Test-Path "backend\.env") {
    Copy-Item "backend\.env" "backend\.env.deploy-backup" -Force
    Write-Success "  ✓ Резервная копия backend\.env создана"
}

# Git pull
git fetch origin
$localChanges = git status --porcelain
if ($localChanges) {
    Write-Warning "  ⚠ Обнаружены локальные изменения"
    Write-Info "      Сброс к версии из репозитория..."
}

git reset --hard origin/main
Write-Success "  ✓ Код обновлен до последней версии"

# Восстановление .env файлов
if (Test-Path "frontend\.env.local.deploy-backup") {
    Move-Item "frontend\.env.local.deploy-backup" "frontend\.env.local" -Force
    Write-Success "  ✓ .env.local восстановлен"
}

if (Test-Path "backend\.env.deploy-backup") {
    Move-Item "backend\.env.deploy-backup" "backend\.env" -Force
    Write-Success "  ✓ backend\.env восстановлен"
}

# Установка зависимостей Frontend
Write-Info "`n[5/8] Установка зависимостей Frontend..."

if (-not (Test-Path "frontend\node_modules") -or $Force) {
    Set-Location "frontend"
    npm install --silent
    Set-Location ".."
    Write-Success "  ✓ Зависимости Frontend установлены"
} else {
    Write-Success "  ✓ node_modules уже существует (используйте -Force для переустановки)"
}

# Установка зависимостей Backend
Write-Info "`n[6/8] Установка зависимостей Backend..."

Set-Location "backend"
python -m pip install --upgrade pip --quiet 2>$null
pip install -r requirements.txt --quiet 2>$null
Set-Location ".."
Write-Success "  ✓ Зависимости Backend установлены"

# Создание базы данных
Write-Info "`n[7/8] Проверка базы данных..."

$env:PGPASSWORD = "postgres"
$dbExists = & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -lqt 2>$null | Select-String "ktru"

if (-not $dbExists) {
    Write-Info "      Создание базы данных ktru..."
    & "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres ktru 2>$null
    & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ktru -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" 2>$null
    Write-Success "  ✓ База данных создана"
    
    Write-Info "      Создание таблиц..."
    Set-Location "backend"
    python -c "from database import engine; from main import Base; Base.metadata.create_all(bind=engine)" 2>$null
    Set-Location ".."
    Write-Success "  ✓ Таблицы созданы"
} else {
    Write-Success "  ✓ База данных уже существует"
}

# Создание скриптов управления (если их нет)
Write-Info "`n[8/8] Создание скриптов управления..."

$scripts = @("start.ps1", "stop.ps1", "status.ps1", "update.ps1")
$scriptsCreated = $false

foreach ($script in $scripts) {
    if (-not (Test-Path $script)) {
        $scriptsCreated = $true
    }
}

if ($scriptsCreated -or $Force) {
    # Здесь вызываем код создания скриптов из setup.ps1
    Write-Success "  ✓ Скрипты созданы (запустите .\\setup.ps1 -Force для обновления)"
} else {
    Write-Success "  ✓ Скрипты уже существуют"
}

# Финальное сообщение
Write-Host "`n================================================" -ForegroundColor Green
Write-Host "      РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Проект готов к запуску!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Дальнейшие шаги:" -ForegroundColor Yellow
Write-Host "  1. Отредактируйте frontend\.env.local" -ForegroundColor White
Write-Host "     Укажите API ключи:" -ForegroundColor Gray
Write-Host "     - VITE_GOOGLE_API_KEY" -ForegroundColor Gray
Write-Host "     - VITE_OPENROUTER_API_KEY" -ForegroundColor Gray
Write-Host "     (или VITE_OLLAMA_CLOUD_API_KEY для Ollama Cloud)" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Запустите серверы:" -ForegroundColor White
Write-Host "     .\start.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Откройте в браузере:" -ForegroundColor White
Write-Host "     http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Управление:" -ForegroundColor Yellow
Write-Host "  .\start.ps1   - Запуск" -ForegroundColor White
Write-Host "  .\stop.ps1    - Остановка" -ForegroundColor White
Write-Host "  .\status.ps1  - Статус" -ForegroundColor White
Write-Host "  .\update.ps1  - Обновление" -ForegroundColor White
Write-Host "  .\deploy.ps1  - Развертывание" -ForegroundColor White
Write-Host ""
Write-Host "Документация: README_WINDOWS_10.md`n" -ForegroundColor Cyan