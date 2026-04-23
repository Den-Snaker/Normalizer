$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "       STOP NORMALIZER"
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

Write-Host "[1/2] Stopping Backend... " -NoNewline

$backendPid = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($backendPid) {
    Stop-Process -Id $backendPid -Force
    Write-Host "OK" -ForegroundColor Green
    Start-Sleep -Milliseconds 500
} else {
    Write-Host "not running" -ForegroundColor Gray
}

Write-Host "[2/2] Stopping Frontend... " -NoNewline

$frontendPid = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($frontendPid) {
    Stop-Process -Id $frontendPid -Force
    Write-Host "OK" -ForegroundColor Green
    Start-Sleep -Milliseconds 500
} else {
    Write-Host "not running" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Cleaning up processes..." -ForegroundColor Gray

$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$PWD*" }
if ($nodeProcesses) {
    $nodeProcesses | Stop-Process -Force
    Write-Host "  Removed Node.js processes: $($nodeProcesses.Count)" -ForegroundColor Gray
}

$pythonProcesses = Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$PWD*" }
if ($pythonProcesses) {
    $pythonProcesses | Stop-Process -Force
    Write-Host "  Removed Python processes: $($pythonProcesses.Count)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Checking ports..." -ForegroundColor Gray

$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if (-not $port3000 -and -not $port8000) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "       SERVERS STOPPED" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "       WARNING" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow

    if ($port3000) {
        Write-Host "  Port 3000 still in use" -ForegroundColor Yellow
        Write-Host "  Kill manually:" -ForegroundColor Gray
        Write-Host "  Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force" -ForegroundColor Gray
    }

    if ($port8000) {
        Write-Host "  Port 8000 still in use" -ForegroundColor Yellow
        Write-Host "  Kill manually:" -ForegroundColor Gray
        Write-Host "  Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "To start: .\start.ps1" -ForegroundColor Cyan
Write-Host ""