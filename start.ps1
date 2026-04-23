$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================"
Write-Host "       START NORMALIZER"
Write-Host "========================================"
Write-Host ""

$projectDir = $PWD.Path

if (-not (Test-Path "frontend" -PathType Container) -or -not (Test-Path "backend" -PathType Container)) {
    Write-Host "ERROR: frontend and backend folders not found" -ForegroundColor Red
    Write-Host "Run this script from the project root directory" -ForegroundColor Yellow
    Write-Host "Example: cd C:\Projects\Normalizer" -ForegroundColor Gray
    exit 1
}

Write-Host "Checking ports..." -ForegroundColor Gray

$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if ($port3000) {
    Write-Host "PORT 3000 ALREADY IN USE" -ForegroundColor Yellow
    Write-Host "Run .\stop.ps1 to stop it" -ForegroundColor Yellow
    exit 1
}

if ($port8000) {
    Write-Host "PORT 8000 ALREADY IN USE" -ForegroundColor Yellow
    Write-Host "Run .\stop.ps1 to stop it" -ForegroundColor Yellow
    exit 1
}

Write-Host "Ports are free" -ForegroundColor Green

if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" -Force | Out-Null
    Write-Host "Created logs directory" -ForegroundColor Green
}

Write-Host ""
Write-Host "[1/2] Starting Backend... " -NoNewline -ForegroundColor Cyan

$backendScript = @"
cd '$projectDir\backend'
Write-Host 'Backend started at http://localhost:8000' -ForegroundColor Green
Write-Host 'Press Ctrl+C to stop' -ForegroundColor Yellow
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript -WindowStyle Normal

Start-Sleep -Seconds 3

$backendCheck = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($backendCheck) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "WARN: Backend may not have started" -ForegroundColor Yellow
    Write-Host "Check logs: Get-Content logs\backend.log -Tail 50" -ForegroundColor Gray
}

Write-Host "[2/2] Starting Frontend... " -NoNewline -ForegroundColor Cyan

$frontendScript = @"
cd '$projectDir\frontend'
Write-Host 'Frontend started at http://localhost:3000' -ForegroundColor Green
Write-Host 'Press Ctrl+C to stop' -ForegroundColor Yellow
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendScript -WindowStyle Normal

Start-Sleep -Seconds 5

$frontendCheck = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($frontendCheck) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "WARN: Frontend may not have started" -ForegroundColor Yellow
    Write-Host "Check logs: Get-Content logs\frontend.log -Tail 50" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "       SERVERS STARTED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor Cyan
Write-Host "  Health:   http://localhost:8000/health" -ForegroundColor Cyan
Write-Host "  API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To stop: .\stop.ps1" -ForegroundColor Yellow
Write-Host "To check status: .\status.ps1" -ForegroundColor Yellow
Write-Host ""