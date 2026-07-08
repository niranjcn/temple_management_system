# Dependency Security Update Script (PowerShell)
# This script updates vulnerable dependencies to their secure versions

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Temple Management System - Security Updates" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

function Print-Status {
    param($Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Print-Success {
    param($Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Print-Warning {
    param($Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Print-Error {
    param($Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if we're in the right directory
if (-not (Test-Path "README.md")) {
    Print-Error "Please run this script from the project root directory"
    exit 1
}

# ==========================================
# FRONTEND UPDATES
# ==========================================

Print-Status "Starting frontend dependency updates..."
Write-Host ""

if (Test-Path "frontend") {
    Push-Location frontend
    
    Print-Status "Current npm audit status:"
    npm audit
    Write-Host ""
    
    Print-Status "Updating Vite to latest version..."
    npm install vite@latest
    Print-Success "Vite updated"
    Write-Host ""
    
    Print-Status "Running npm audit fix..."
    npm audit fix
    Write-Host ""
    
    Print-Status "Checking for remaining vulnerabilities..."
    npm audit
    Write-Host ""
    
    Print-Status "Testing build..."
    npm run build
    Print-Success "Build successful"
    Write-Host ""
    
    Pop-Location
    Print-Success "Frontend updates completed"
} else {
    Print-Warning "Frontend directory not found, skipping"
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan

# ==========================================
# BACKEND UPDATES
# ==========================================

Print-Status "Starting backend dependency updates..."
Write-Host ""

if (Test-Path "backend") {
    Push-Location backend
    
    Print-Status "Current pip audit status:"
    pip-audit
    Write-Host ""
    
    Print-Status "Updating pip..."
    python -m pip install --upgrade pip
    Print-Success "Pip updated"
    Write-Host ""
    
    Print-Status "Checking pip version..."
    pip --version
    Write-Host ""
    
    Print-Status "Running pip check..."
    pip check
    Write-Host ""
    
    Pop-Location
    Print-Success "Backend updates completed"
} else {
    Print-Warning "Backend directory not found, skipping"
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Update Summary" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Generate summary
if (Test-Path "frontend") {
    Push-Location frontend
    Print-Status "Frontend vulnerabilities after update:"
    npm audit --json | Select-String -Pattern '"total":[0-9]*' | Select-Object -First 1
    Pop-Location
}

Write-Host ""

if (Test-Path "backend") {
    Push-Location backend
    Print-Status "Backend vulnerabilities after update:"
    Write-Host "Monitoring pip 25.3 release" -ForegroundColor Yellow
    Pop-Location
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Print-Success "Security updates completed!"
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Print-Status "Next steps:"
Write-Host "  1. Test the application thoroughly"
Write-Host "  2. Commit the updated package files"
Write-Host "  3. Monitor for pip 25.3 release"
Write-Host ""
Print-Status "Run the following to test:"
Write-Host "  cd frontend; npm run dev"
Write-Host "  cd backend; uvicorn app.main:app --reload"
Write-Host ""
