$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "       NORMALIZER STATUS"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Test-Server {
    param($url, $name)

    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return @{Status = "OK"; Code = $response.StatusCode}
    } catch {
        return @{Status = "ERROR"; Code = $_.Exception.Message}
    }
}

Write-Host "Frontend (port 3000): " -NoNewline

$frontend = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue

if ($frontend) {
    Write-Host "RUNNING" -ForegroundColor Green

    $process = Get-Process -Id $frontend.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "  Process: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Gray
        Write-Host "  Memory: $([math]::Round($process.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host "  CPU: $($process.CPU) sec" -ForegroundColor Gray
    }

    $httpTest = Test-Server -url "http://localhost:3000" -name "Frontend"
    if ($httpTest.Status -eq "OK") {
        Write-Host "  HTTP: OK (200)" -ForegroundColor Green
    } else {
        Write-Host "  HTTP: ERROR - $($httpTest.Code)" -ForegroundColor Red
    }

} else {
    Write-Host "STOPPED" -ForegroundColor Red
}

Write-Host ""
Write-Host "Backend (port 8000): " -NoNewline

$backend = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if ($backend) {
    Write-Host "RUNNING" -ForegroundColor Green

    $process = Get-Process -Id $backend.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "  Process: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Gray
        Write-Host "  Memory: $([math]::Round($process.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host "  CPU: $($process.CPU) sec" -ForegroundColor Gray
    }

    $httpTest = Test-Server -url "http://localhost:8000/health" -name "Backend"
    if ($httpTest.Status -eq "OK") {
        Write-Host "  Health: OK (200)" -ForegroundColor Green

        try {
            $json = $httpTest.Code | ConvertFrom-Json
            if ($json.message) {
                Write-Host "  Message: $($json.message)" -ForegroundColor Gray
            }
        } catch {
        }
    } else {
        Write-Host "  Health: ERROR - $($httpTest.Code)" -ForegroundColor Red
    }

    $docsTest = Test-Server -url "http://localhost:8000/docs" -name "Docs"
    if ($docsTest.Status -eq "OK") {
        Write-Host "  API Docs: Available" -ForegroundColor Green
    }

} else {
    Write-Host "STOPPED" -ForegroundColor Red
}

Write-Host ""
Write-Host "PostgreSQL (port 5432): " -NoNewline

$pg = Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue

if ($pg) {
    Write-Host "RUNNING" -ForegroundColor Green

    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
    if ($pgService) {
        Write-Host "  Service: $($pgService.Status)" -ForegroundColor Gray
    }

} else {
    Write-Host "STOPPED" -ForegroundColor Red
    Write-Host "  Start: Start-Service postgresql*-x64-16" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($frontend -and $backend) {
    Write-Host "   STATUS: ALL SERVICES RUNNING" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "App URLs:" -ForegroundColor Yellow
    Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  Backend:   http://localhost:8000" -ForegroundColor Cyan
    Write-Host "  Health:    http://localhost:8000/health" -ForegroundColor Cyan
    Write-Host "  API Docs:  http://localhost:8000/docs" -ForegroundColor Cyan

} elseif ($frontend -or $backend) {
    Write-Host "   STATUS: PARTIALLY RUNNING" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    if (-not $frontend) {
        Write-Host "Frontend is not running" -ForegroundColor Red
        Write-Host "Start: .\start.ps1" -ForegroundColor Gray
    }
    if (-not $backend) {
        Write-Host "Backend is not running" -ForegroundColor Red
        Write-Host "Start: .\start.ps1" -ForegroundColor Gray
    }

} else {
    Write-Host "   STATUS: ALL STOPPED" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To start: .\start.ps1" -ForegroundColor Yellow
}

Write-Host ""