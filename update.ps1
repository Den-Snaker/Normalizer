# update.ps1 - Обновление Normalizer из GitHub на Windows 10
# Запускать из корневой директории проекта

param([switch]$Force)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "      ОБНОВЛЕНИЕ NORMALIZER" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

# Проверка, что мы в репозитории
if (-not (Test-Path ".git" -PathType Container)) {
    Write-Host "ОШИБКА: Не в репозитории Git" -ForegroundColor Red
    Write-Host "       Перейдите в директорию проекта:" -ForegroundColor Yellow
    Write-Host "       cd C:\Projects\Normalizer" -ForegroundColor Gray
    exit 1
}

# Проверка наличия .env файлов
$frontendEnv = "frontend\.env.local"
$backendEnv = "backend\.env"

if (-not (Test-Path $frontendEnv)) {
    Write-Host "ПРЕДУПРЕЖДЕНИЕ: $frontendEnv не найден" -ForegroundColor Yellow
    Write-Host "       После обновления создайте .env файлы вручную" -ForegroundColor Gray
}

if (-not (Test-Path $backendEnv)) {
    Write-Host "ПРЕДУПРЕЖДЕНИЕ: $backendEnv не найден" -ForegroundColor Yellow
    Write-Host "       После обновления создайте .env файлы вручную" -ForegroundColor Gray
}

# Шаг 1: Проверка изменений
Write-Host "[1/6] Проверка изменений в Git... " -NoNewline -ForegroundColor Cyan

$status = git status --porcelain 2>$null

if ($status -and -not $Force) {
    Write-Host "`nОбнаружены локальные изменения:" -ForegroundColor Yellow
    Write-Host "========================" -ForegroundColor Yellow
    git status --short
    Write-Host "========================" -ForegroundColor Yellow
    
    $confirm = Read-Host "`nПродолжить и перезаписать изменения? (y/N)"
    
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "`nОтмена обновления" -ForegroundColor Yellow
        Write-Host "Для сохранения изменений:" -ForegroundColor Gray
        Write-Host "  git stash" -ForegroundColor Gray
        Write-Host "  git pull origin main" -ForegroundColor Gray
        Write-Host "  git stash pop" -ForegroundColor Gray
        exit 0
    }
    
    Write-Host " Сброс изменений..." -ForegroundColor Yellow
}

Write-Host "✓" -ForegroundColor Green

# Шаг 2: Резервное копирование .env файлов
Write-Host "`n[2/6] Резервное копирование .env файлов... " -NoNewline -ForegroundColor Cyan

$backupCreated = $false

if (Test-Path $frontendEnv) {
    Copy-Item $frontendEnv "$frontendEnv.update-backup" -Force -ErrorAction SilentlyContinue
    Write-Host "✓ " -NoNewline -ForegroundColor Green
    $backupCreated = $true
} else {
    Write-Host "⊘ " -NoNewline -ForegroundColor Gray
}

if (Test-Path $backendEnv) {
    Copy-Item $backendEnv "$backendEnv.update-backup" -Force -ErrorAction SilentlyContinue
    Write-Host "✓" -ForegroundColor Green
    $backupCreated = $true
} else {
    Write-Host "⊘" -ForegroundColor Gray
}

if (-not $backupCreated) {
    Write-Host " (.env файлов нет)" -ForegroundColor Gray
}

# Шаг 3: Получение обновлений
Write-Host "`n[3/6] Получение обновлений из GitHub... " -NoNewline -ForegroundColor Cyan

try {
    git fetch origin 2>$null
    git reset --hard origin/main 2>$null
    
    Write-Host "✓" -ForegroundColor Green
    
} catch {
    Write-Host "✗" -ForegroundColor Red
    Write-Host "ОШИБКА: Не удалось обновить код" -ForegroundColor Red
    Write-Host "       Проверьте интернет-соединение" -ForegroundColor Yellow
    Write-Host "       Или выполните вручную: git pull origin main" -ForegroundColor Gray
    exit 1
}

# Показать что обновилось
Write-Host "`nИзменения:" -ForegroundColor Gray
git log --oneline HEAD~1..HEAD --max-count=1

# Шаг 4: Восстановление .env файлов
Write-Host "`n[4/6] Восстановление .env файлов... " -NoNewline -ForegroundColor Cyan

$envRestored = $false

if (Test-Path "$frontendEnv.update-backup") {
    Move-Item "$frontendEnv.update-backup" $frontendEnv -Force -ErrorAction SilentlyContinue
    Write-Host "✓ frontend\.env.local" -ForegroundColor Green
    $envRestored = $true
}

if (Test-Path "$backendEnv.update-backup") {
    Move-Item "$backendEnv.update-backup" $backendEnv -Force -ErrorAction SilentlyContinue
    Write-Host "✓ backend\.env" -ForegroundColor Green
    $envRestored = $true
}

if (-not $envRestored) {
    Write-Host "(.env файлов не было)" -ForegroundColor Gray
}

# Шаг 5: Обновление зависимостей Frontend
Write-Host "`n[5/6] Обновление зависимостей Frontend... " -NoNewline -ForegroundColor Cyan

if (Test-Path "frontend\package.json") {
    Set-Location "frontend"
    
    try {
        npm install --silent 2>$null
        Write-Host "✓" -ForegroundColor Green
    } catch {
        Write-Host "✗" -ForegroundColor Yellow
        Write-Host "Предупреждение: Не удалось обновить npm зависимости" -ForegroundColor Yellow
        Write-Host "                Выполните вручную: cd frontend && npm install" -ForegroundColor Gray
    }
    
    Set-Location ..
} else {
    Write-Host "⊘ (frontend не найден)" -ForegroundColor Gray
}

# Шаг 6: Обновление зависимостей Backend
Write-Host "`n[6/6] Обновление зависимостей Backend... " -NoNewline -ForegroundColor Cyan

if (Test-Path "backend\requirements.txt") {
    Set-Location "backend"
    
    try {
        python -m pip install --upgrade pip --quiet 2>$null
        pip install -r requirements.txt --quiet 2>$null
        Write-Host "✓" -ForegroundColor Green
    } catch {
        Write-Host "✗" -ForegroundColor Yellow
        Write-Host "Предупреждение: Не удалось обновить pip зависимости" -ForegroundColor Yellow
        Write-Host "                Выполните вручную: cd backend && pip install -r requirements.txt" -ForegroundColor Gray
    }
    
    Set-Location ..
} else {
    Write-Host "⊘ (backend не найден)" -ForegroundColor Gray
}

# Проверка наличия скриптов управления
Write-Host "`nПроверка скриптов управления... " -NoNewline -ForegroundColor Gray

$scripts = @("start.ps1", "stop.ps1", "status.ps1", "update.ps1", "deploy.ps1", "setup.ps1")
$missingScripts = @()

foreach ($script in $scripts) {
    if (-not (Test-Path $script)) {
        $missingScripts += $script
    }
}

if ($missingScripts.Count -gt 0) {
    Write-Host "/" -ForegroundColor Yellow
    Write-Host "Отсутствуют скрипты: $($missingScripts -join ', ')" -ForegroundColor Yellow
    Write-Host "Скачайте их из репозитория или создайте заново" -ForegroundColor Gray
} else {
    Write-Host "✓" -ForegroundColor Green
}

# Финальное сообщение
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "      ОБНОВЛЕНИЕ ЗАВЕРШЕНО" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Проверка API ключей
if (-not (Test-Path $frontendEnv)) {
    Write-Host "`n⚠ ВНИМАНИЕ: Отсутствует $frontendEnv" -ForegroundColor Yellow
    Write-Host "   Создайте файл и укажите API ключи:" -ForegroundColor Gray
    Write-Host "   VITE_GOOGLE_API_KEY=ВАШ_КЛЮЧ" -ForegroundColor Gray
    Write-Host "   VITE_OPENROUTER_API_KEY=ВАШ_КЛЮЧ" -ForegroundColor Gray
    Write-Host "   VITE_API_URL=http://localhost:8000" -ForegroundColor Gray
}

Write-Host "`nДальнейшие действия:" -ForegroundColor Cyan
Write-Host "  1. Проверьте .env файлы" -ForegroundColor White
Write-Host "  2. Запустите: .\stop.ps1" -ForegroundColor White
Write-Host "  3. Запустите: .\start.ps1" -ForegroundColor White
Write-Host "  4. Проверьте: .\status.ps1" -ForegroundColor White

Write-Host "`nДля просмотра изменений:" -ForegroundColor Cyan
Write-Host "  git log --oneline -10" -ForegroundColor Gray
Write-Host "  git diff HEAD~1" -ForegroundColor Gray

Write-Host ""