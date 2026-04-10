# stop.ps1 - Остановка серверов Normalizer на Windows 10

$ErrorActionPreference = "SilentlyContinue"

Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "      ОСТАНОВКА NORMALIZER" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

# Остановка Backend (порт 8000)
Write-Host "[1/2] Остановка Backend... " -NoNewline

$backendPid = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($backendPid) {
    Stop-Process -Id $backendPid -Force
    Write-Host "✓" -ForegroundColor Green
    Start-Sleep -Milliseconds 500
} else {
    Write-Host "не запущен" -ForegroundColor Gray
}

# Остановка Frontend (порт 3000)
Write-Host "[2/2] Остановка Frontend... " -NoNewline

$frontendPid = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($frontendPid) {
    Stop-Process -Id $frontendPid -Force
    Write-Host "✓" -ForegroundColor Green
    Start-Sleep -Milliseconds 500
} else {
    Write-Host "не запущен" -ForegroundColor Gray
}

# Дополнительная очистка (на случай если остались node/python процессы)
Write-Host "`nОчистка процессов..." -ForegroundColor Gray

$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$PWD*" }
if ($nodeProcesses) {
    $nodeProcesses | Stop-Process -Force
    Write-Host "  Удалены процессы Node.js: $($nodeProcesses.Count)" -ForegroundColor Gray
}

$pythonProcesses = Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$PWD*" }
if ($pythonProcesses) {
    $pythonProcesses | Stop-Process -Force
    Write-Host "  Удалены процессы Python: $($pythonProcesses.Count)" -ForegroundColor Gray
}

# Финальная проверка
Write-Host "`nПроверка портов..." -ForegroundColor Gray

$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if (-not $port3000 -and -not $port8000) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "      СЕРВЕРЫ ОСТАНОВЛЕНЫ" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "`n========================================" -ForegroundColor Yellow
    Write-Host "      ВНИМАНИЕ" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    
    if ($port3000) {
        Write-Host "  Порт 3000 все еще занят" -ForegroundColor Yellow
        Write-Host "  Убейте процесс вручную:" -ForegroundColor Gray
        Write-Host "  Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force" -ForegroundColor Gray
    }
    
    if ($port8000) {
        Write-Host "  Порт 8000 все еще занят" -ForegroundColor Yellow
        Write-Host "  Убейте процесс вручную:" -ForegroundColor Gray
        Write-Host "  Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force" -ForegroundColor Gray
    }
}

Write-Host "`nДля запуска: .\start.ps1" -ForegroundColor Cyan
Write-Host ""