# status.ps1 - Проверка статуса серверов Normalizer на Windows 10

$ErrorActionPreference = "SilentlyContinue"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "      СТАТУС NORMALIZER" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Функция для проверки HTTP
function Test-Server {
    param($url, $name)
    
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return @{Status = "OK"; Code = $response.StatusCode}
    } catch {
        return @{Status = "ERROR"; Code = $_.Exception.Message}
    }
}

# Проверка Frontend
Write-Host "Frontend (порт 3000): " -NoNewline

$frontend = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue

if ($frontend) {
    Write-Host "ЗАПУЩЕН" -ForegroundColor Green
    
    $process = Get-Process -Id $frontend.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "  Процесс: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Gray
        Write-Host "  Память: $([math]::Round($process.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host "  CPU: $($process.CPU) сек" -ForegroundColor Gray
    }
    
    # Проверка HTTP
    $httpTest = Test-Server -url "http://localhost:3000" -name "Frontend"
    if ($httpTest.Status -eq "OK") {
        Write-Host "  HTTP: OK (200)" -ForegroundColor Green
    } else {
        Write-Host "  HTTP: ERROR - $($httpTest.Code)" -ForegroundColor Red
    }
    
} else {
    Write-Host "ОСТАНОВЛЕН" -ForegroundColor Red
}

# Проверка Backend
Write-Host "`nBackend (порт 8000): " -NoNewline

$backend = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if ($backend) {
    Write-Host "ЗАПУЩЕН" -ForegroundColor Green
    
    $process = Get-Process -Id $backend.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "  Процесс: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Gray
        Write-Host "  Память: $([math]::Round($process.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host "  CPU: $($process.CPU) сек" -ForegroundColor Gray
    }
    
    # Проверка Health endpoint
    $httpTest = Test-Server -url "http://localhost:8000/health" -name "Backend"
    if ($httpTest.Status -eq "OK") {
        Write-Host "  Health: OK (200)" -ForegroundColor Green
        
        try {
            $json = $httpTest.Code | ConvertFrom-Json
            if ($json.message) {
                Write-Host "  Сообщение: $($json.message)" -ForegroundColor Gray
            }
        } catch {
            # Не JSON ответ
        }
    } else {
        Write-Host "  Health: ERROR - $($httpTest.Code)" -ForegroundColor Red
    }
    
    # Проверка API Docs
    $docsTest = Test-Server -url "http://localhost:8000/docs" -name "Docs"
    if ($docsTest.Status -eq "OK") {
        Write-Host "  API Docs: Доступны" -ForegroundColor Green
    }
    
} else {
    Write-Host "ОСТАНОВЛЕН" -ForegroundColor Red
}

# Проверка PostgreSQL
Write-Host "`nPostgreSQL (порт 5432): " -NoNewline

$pg = Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue

if ($pg) {
    Write-Host "ЗАПУЩЕН" -ForegroundColor Green
    
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    if ($pgService) {
        Write-Host "  Служба: $($pgService.Status)" -ForegroundColor Gray
    }
    
} else {
    Write-Host "ОСТАНОВЛЕН" -ForegroundColor Red
    Write-Host "  Запуск: Start-Service postgresql*-x64-16" -ForegroundColor Gray
}

# Общий статус
Write-Host "`n========================================" -ForegroundColor Cyan

if ($frontend -and $backend) {
    Write-Host "   СТАТУС: ВСЕ СЕРВИСЫ РАБОТАЮТ" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    Write-Host "URL приложения:" -ForegroundColor Yellow
    Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  Backend:   http://localhost:8000" -ForegroundColor Cyan
    Write-Host "  Health:    http://localhost:8000/health" -ForegroundColor Cyan
    Write-Host "  API Docs:  http://localhost:8000/docs" -ForegroundColor Cyan
    
} elseif ($frontend -or $backend) {
    Write-Host "   СТАТУС: ЧАСТИЧНО ЗАПУЩЕН" -ForegroundColor Yellow
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    if (-not $frontend) {
        Write-Host "Frontend не запущен" -ForegroundColor Red
        Write-Host "Запуск: .\start.ps1" -ForegroundColor Gray
    }
    if (-not $backend) {
        Write-Host "Backend не запущен" -ForegroundColor Red
        Write-Host "Запуск: .\start.ps1" -ForegroundColor Gray
    }
    
} else {
    Write-Host "   СТАТУС: ВСЕ ОСТАНОВЛЕНО" -ForegroundColor Red
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    Write-Host "Для запуска: .\start.ps1" -ForegroundColor Yellow
}

Write-Host ""