#!/bin/bash

# Dependency Security Update Script
# This script updates vulnerable dependencies to their secure versions

set -e  # Exit on error

echo "=================================================="
echo "Temple Management System - Security Updates"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "README.md" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# ==========================================
# FRONTEND UPDATES
# ==========================================

print_status "Starting frontend dependency updates..."
echo ""

if [ -d "frontend" ]; then
    cd frontend
    
    print_status "Current npm audit status:"
    npm audit || true
    echo ""
    
    print_status "Updating Vite to latest version..."
    npm install vite@latest
    print_success "Vite updated"
    echo ""
    
    print_status "Running npm audit fix..."
    npm audit fix
    echo ""
    
    print_status "Checking for remaining vulnerabilities..."
    npm audit || true
    echo ""
    
    print_status "Testing build..."
    npm run build
    print_success "Build successful"
    echo ""
    
    cd ..
    print_success "Frontend updates completed"
else
    print_warning "Frontend directory not found, skipping"
fi

echo ""
echo "=================================================="

# ==========================================
# BACKEND UPDATES
# ==========================================

print_status "Starting backend dependency updates..."
echo ""

if [ -d "backend" ]; then
    cd backend
    
    print_status "Current pip audit status:"
    pip-audit || true
    echo ""
    
    print_status "Updating pip..."
    python -m pip install --upgrade pip
    print_success "Pip updated"
    echo ""
    
    print_status "Checking pip version..."
    pip --version
    echo ""
    
    print_status "Running pip check..."
    pip check || true
    echo ""
    
    cd ..
    print_success "Backend updates completed"
else
    print_warning "Backend directory not found, skipping"
fi

echo ""
echo "=================================================="
echo "Update Summary"
echo "=================================================="
echo ""

# Generate summary
cd frontend 2>/dev/null && {
    print_status "Frontend vulnerabilities after update:"
    npm audit --json | grep -o '"total":[0-9]*' | head -1 || echo "Unable to parse"
    cd ..
}

echo ""

cd backend 2>/dev/null && {
    print_status "Backend vulnerabilities after update:"
    pip-audit --format json 2>/dev/null | grep -o '"vulnerability_count":[0-9]*' || echo "Monitoring pip 25.3 release"
    cd ..
}

echo ""
echo "=================================================="
print_success "Security updates completed!"
echo "=================================================="
echo ""
print_status "Next steps:"
echo "  1. Test the application thoroughly"
echo "  2. Commit the updated package files"
echo "  3. Monitor for pip 25.3 release"
echo ""
print_status "Run the following to test:"
echo "  cd frontend && npm run dev"
echo "  cd backend && uvicorn app.main:app --reload"
echo ""
