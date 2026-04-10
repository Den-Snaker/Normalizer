# start.ps1 - Запуск серверов Normalizer на Windows 10
# Запускать из корневой директории проекта

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "      ЗАПУСК NORMALIZER" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Определение директории проекта
$projectDir = $PWD.Path

# Проверка, что мы в правильной директории
if (-not (Test-Path "frontend" -PathType Container) -or -not (Test-Path "backend" -PathType Container)) {
    Write-Host "ОШИБКА: Не найдены папки frontend и backend" -ForegroundColor Red
    Write-Host "       Запустите скрипт из корневой директории проекта" -ForegroundColor Yellow
    Write-Host "       Пример: cd C:\Projects\Normalizer" -ForegroundColor Gray
    exit 1
}

# Проверка портов
Write-Host "Проверка портов..." -ForegroundColor Gray

$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if ($port3000) {
    Write-Host "⚠ ПОРТ 3000 УЖЕ ЗАНЯТ" -ForegroundColor Yellow
    Write-Host "  Для остановки выполните: .\stop.ps1" -ForegroundColor Yellow
    Write-Host "  Или убейте процесс:" -ForegroundColor Gray
    Write-Host "  Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force" -ForegroundColor Gray
    exit 1
}

if ($port8000) {
    Write-Host "⚠ ПОРТ 8000 УЖЕ ЗАНЯТ" -ForegroundColor Yellow
    Write-Host "  Для остановки выполните: .\stop.ps1" -ForegroundColor Yellow
    Write-Host "  Или убейте процесс:" -ForegroundColor Gray
    Write-Host "  Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force" -ForegroundColor Gray
    exit 1
}

Write-Host "✓ Порты свободны" -ForegroundColor Green

# Создание директории для логов
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" -Force | Out-Null
    Write-Host "✓ Создана директория logs" -ForegroundColor Green
}

# Запуск Backend
Write-Host "`n[1/2] Запуск Backend... " -NoNewline -ForegroundColor Cyan

$backendScript = @"
cd '$projectDir\backend'
Write-Host 'Backend запущен на http://localhost:8000' -ForegroundColor Green
Write-Host 'Press Ctrl+C to stop' -ForegroundColor Yellow
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript -WindowStyle Normal

Start-Sleep -Seconds 3

# Проверка запуска Backend
$backendCheck = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($backendCheck) {
    Write-Host "✓ Backend запущен" -ForegroundColor Green
} else {
    Write-Host "⚠ Backend может не запуститься" -ForegroundColor Yellow
    Write-Host "       Проверьте логи: Get-Content logs\backend.log -Tail 50" -ForegroundColor Gray
}

# Запуск Frontend
Write-Host "[2/2] Запуск Frontend... " -NoNewline -ForegroundColor Cyan

$frontendScript = @"
cd '$projectDir\frontend'
Write-Host 'Frontend запущен на http://localhost:3000' -ForegroundColor Green
Write-Host 'Press Ctrl+C to stop' -ForegroundColor Yellow
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendScript -WindowStyle Normal

Start-Sleep -Seconds 5

# Проверка запуска Frontend
$frontendCheck = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($frontendCheck) {
    Write-Host "✓ Frontend запущен" -ForegroundColor Green
} else {
    Write-Host "⚠ Frontend может не запуститься" -ForegroundColor Yellow
    Write-Host "       Проверьте логи: Get-Content logs\frontend.log -Tail 50" -ForegroundColor Gray
}

# Финальное сообщение
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "      СЕРВЕРЫ ЗАПУЩЕНЫ" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor Cyan
Write-Host "  Health:   http://localhost:8000/health" -ForegroundColor Cyan
Write-Host "  API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nДля остановки: .\stop.ps1" -ForegroundColor Yellow
Write-Host "Для проверки статуса: .\status.ps1" -ForegroundColor Yellow
Write-Host ""