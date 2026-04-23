param([switch]$Force)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "       UPDATE NORMALIZER"
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

if (-not (Test-Path ".git" -PathType Container)) {
    Write-Host "ERROR: Not in a Git repository" -ForegroundColor Red
    Write-Host "Go to the project directory:" -ForegroundColor Yellow
    Write-Host "cd C:\Projects\Normalizer" -ForegroundColor Gray
    exit 1
}

$frontendEnv = "frontend\.env.local"
$backendEnv = "backend\.env"

if (-not (Test-Path $frontendEnv)) {
    Write-Host "WARNING: $frontendEnv not found" -ForegroundColor Yellow
    Write-Host "Create .env files manually after update" -ForegroundColor Gray
}

if (-not (Test-Path $backendEnv)) {
    Write-Host "WARNING: $backendEnv not found" -ForegroundColor Yellow
    Write-Host "Create .env files manually after update" -ForegroundColor Gray
}

Write-Host "[1/6] Checking Git changes... " -NoNewline -ForegroundColor Cyan

$status = git status --porcelain 2>$null

if ($status -and -not $Force) {
    Write-Host ""
    Write-Host "Local changes detected:" -ForegroundColor Yellow
    Write-Host "========================" -ForegroundColor Yellow
    git status --short
    Write-Host "========================" -ForegroundColor Yellow

    $confirm = Read-Host "Continue and overwrite changes? (y/N)"

    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host ""
        Write-Host "Update cancelled" -ForegroundColor Yellow
        Write-Host "To save changes:" -ForegroundColor Gray
        Write-Host "  git stash" -ForegroundColor Gray
        Write-Host "  git pull origin main" -ForegroundColor Gray
        Write-Host "  git stash pop" -ForegroundColor Gray
        exit 0
    }

    Write-Host " Resetting changes..." -ForegroundColor Yellow
}

Write-Host "OK" -ForegroundColor Green

Write-Host ""
Write-Host "[2/6] Backing up .env files... " -NoNewline -ForegroundColor Cyan

$backupCreated = $false

if (Test-Path $frontendEnv) {
    Copy-Item $frontendEnv "$frontendEnv.update-backup" -Force -ErrorAction SilentlyContinue
    Write-Host "frontend OK " -NoNewline -ForegroundColor Green
    $backupCreated = $true
} else {
    Write-Host "frontend skip " -NoNewline -ForegroundColor Gray
}

if (Test-Path $backendEnv) {
    Copy-Item $backendEnv "$backendEnv.update-backup" -Force -ErrorAction SilentlyContinue
    Write-Host "backend OK" -ForegroundColor Green
    $backupCreated = $true
} else {
    Write-Host "backend skip" -ForegroundColor Gray
}

if (-not $backupCreated) {
    Write-Host " (no .env files)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[3/6] Fetching updates from GitHub... " -NoNewline -ForegroundColor Cyan

try {
    git fetch origin 2>$null
    git reset --hard origin/main 2>$null

    Write-Host "OK" -ForegroundColor Green

} catch {
    Write-Host "FAIL" -ForegroundColor Red
    Write-Host "ERROR: Failed to update code" -ForegroundColor Red
    Write-Host "Check internet connection" -ForegroundColor Yellow
    Write-Host "Or run manually: git pull origin main" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Changes:" -ForegroundColor Gray
git log --oneline HEAD~1..HEAD --max-count=1

Write-Host ""
Write-Host "[4/6] Restoring .env files... " -NoNewline -ForegroundColor Cyan

$envRestored = $false

if (Test-Path "$frontendEnv.update-backup") {
    Move-Item "$frontendEnv.update-backup" $frontendEnv -Force -ErrorAction SilentlyContinue
    Write-Host "frontend OK" -ForegroundColor Green
    $envRestored = $true
}

if (Test-Path "$backendEnv.update-backup") {
    Move-Item "$backendEnv.update-backup" $backendEnv -Force -ErrorAction SilentlyContinue
    Write-Host "backend OK" -ForegroundColor Green
    $envRestored = $true
}

if (-not $envRestored) {
    Write-Host "(no .env files)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[5/6] Updating Frontend dependencies... " -NoNewline -ForegroundColor Cyan

if (Test-Path "frontend\package.json") {
    Set-Location "frontend"

    try {
        npm install --silent 2>$null
        Write-Host "OK" -ForegroundColor Green
    } catch {
        Write-Host "WARN" -ForegroundColor Yellow
        Write-Host "Failed to update npm dependencies" -ForegroundColor Yellow
        Write-Host "Run manually: cd frontend && npm install" -ForegroundColor Gray
    }

    Set-Location ..
} else {
    Write-Host "skip (frontend not found)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[6/6] Updating Backend dependencies... " -NoNewline -ForegroundColor Cyan

if (Test-Path "backend\requirements.txt") {
    Set-Location "backend"

    try {
        python -m pip install --upgrade pip --quiet 2>$null
        pip install -r requirements.txt --quiet 2>$null
        Write-Host "OK" -ForegroundColor Green
    } catch {
        Write-Host "WARN" -ForegroundColor Yellow
        Write-Host "Failed to update pip dependencies" -ForegroundColor Yellow
        Write-Host "Run manually: cd backend && pip install -r requirements.txt" -ForegroundColor Gray
    }

    Set-Location ..
} else {
    Write-Host "skip (backend not found)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Checking management scripts... " -NoNewline -ForegroundColor Gray

$scripts = @("start.ps1", "stop.ps1", "status.ps1", "update.ps1")
$missingScripts = @()

foreach ($script in $scripts) {
    if (-not (Test-Path $script)) {
        $missingScripts += $script
    }
}

if ($missingScripts.Count -gt 0) {
    Write-Host "MISSING" -ForegroundColor Yellow
    Write-Host "Missing scripts: $($missingScripts -join ', ')" -ForegroundColor Yellow
    Write-Host "Download from repository or recreate" -ForegroundColor Gray
} else {
    Write-Host "OK" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "       UPDATE COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

if (-not (Test-Path $frontendEnv)) {
    Write-Host ""
    Write-Host "WARNING: Missing $frontendEnv" -ForegroundColor Yellow
    Write-Host "Create the file with API keys:" -ForegroundColor Gray
    Write-Host "  VITE_GOOGLE_API_KEY=YOUR_KEY" -ForegroundColor Gray
    Write-Host "  VITE_OPENROUTER_API_KEY=YOUR_KEY" -ForegroundColor Gray
    Write-Host "  VITE_API_URL=http://localhost:8000" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Check .env files" -ForegroundColor White
Write-Host "  2. Run: .\stop.ps1" -ForegroundColor White
Write-Host "  3. Run: .\start.ps1" -ForegroundColor White
Write-Host "  4. Check: .\status.ps1" -ForegroundColor White

Write-Host ""
Write-Host "To view changes:" -ForegroundColor Cyan
Write-Host "  git log --oneline -10" -ForegroundColor Gray
Write-Host "  git diff HEAD~1" -ForegroundColor Gray

Write-Host ""