# PowerShell script to set up split backend services
# This script copies shared files to both backend-public and backend-admin

Write-Host "Setting up split backend services..." -ForegroundColor Green

# Copy shared database configuration
Write-Host "Copying database.py..." -ForegroundColor Yellow
Copy-Item -Path ".\backend\app\database.py" -Destination ".\backend-public\app\database.py" -Force
Copy-Item -Path ".\backend\app\database.py" -Destination ".\backend-admin\app\database.py" -Force

# Copy all models (both services need access to all models for consistency)
Write-Host "Copying models..." -ForegroundColor Yellow
Copy-Item -Path ".\backend\app\models\*" -Destination ".\backend-public\app\models\" -Recurse -Force
Copy-Item -Path ".\backend\app\models\*" -Destination ".\backend-admin\app\models\" -Recurse -Force

# Copy all services (both need access to services)
Write-Host "Copying services..." -ForegroundColor Yellow
Copy-Item -Path ".\backend\app\services\*" -Destination ".\backend-public\app\services\" -Recurse -Force
Copy-Item -Path ".\backend\app\services\*" -Destination ".\backend-admin\app\services\" -Recurse -Force

# Copy middleware
Write-Host "Copying middleware..." -ForegroundColor Yellow
Copy-Item -Path ".\backend\app\middleware\*" -Destination ".\backend-public\app\middleware\" -Recurse -Force
Copy-Item -Path ".\backend\app\middleware\*" -Destination ".\backend-admin\app\middleware\" -Recurse -Force

# Copy CLI if exists
if (Test-Path ".\backend\app\cli") {
    Write-Host "Copying CLI..." -ForegroundColor Yellow
    Copy-Item -Path ".\backend\app\cli\*" -Destination ".\backend-public\app\cli\" -Recurse -Force
    Copy-Item -Path ".\backend\app\cli\*" -Destination ".\backend-admin\app\cli\" -Recurse -Force
}

# Copy public-facing routers to backend-public
Write-Host "Copying public routers to backend-public..." -ForegroundColor Yellow
$publicRouters = @(
    "auth.py",
    "bookings.py",
    "employee_booking.py",
    "rituals.py",
    "events.py",
    "gallery.py",
    "gallery_layout.py",
    "gallery_home_preview.py",
    "slideshow.py",
    "featured_event.py",
    "events_section.py",
    "calendar.py",
    "location.py",
    "committee.py"
)

foreach ($router in $publicRouters) {
    Copy-Item -Path ".\backend\app\routers\$router" -Destination ".\backend-public\app\routers\$router" -Force
}

# Copy admin routers to backend-admin
Write-Host "Copying admin routers to backend-admin..." -ForegroundColor Yellow
$adminRouters = @(
    "admin.py",
    "enhanced_admin.py",
    "roles.py",
    "activity.py",
    "stock.py",
    "security.py",
    "attendance.py",
    "profile.py",
    "committee.py",
    "priest_attendance.py"
)

foreach ($router in $adminRouters) {
    if (Test-Path ".\backend\app\routers\$router") {
        Copy-Item -Path ".\backend\app\routers\$router" -Destination ".\backend-admin\app\routers\$router" -Force
    }
}

# Copy requirements.txt
Write-Host "Copying requirements.txt..." -ForegroundColor Yellow
Copy-Item -Path ".\backend\requirements.txt" -Destination ".\backend-public\requirements.txt" -Force
Copy-Item -Path ".\backend\requirements.txt" -Destination ".\backend-admin\requirements.txt" -Force

# Create __init__.py files (copy from backend to preserve content)
Write-Host "Creating/updating __init__.py files..." -ForegroundColor Yellow
Copy-Item -Path ".\backend\app\__init__.py" -Destination ".\backend-public\app\__init__.py" -Force -ErrorAction SilentlyContinue
Copy-Item -Path ".\backend\app\__init__.py" -Destination ".\backend-admin\app\__init__.py" -Force -ErrorAction SilentlyContinue

# Ensure routers __init__.py exists
if (-not (Test-Path ".\backend\app\routers\__init__.py")) {
    New-Item -Path ".\backend\app\routers\__init__.py" -ItemType File -Force | Out-Null
}
Copy-Item -Path ".\backend\app\routers\__init__.py" -Destination ".\backend-public\app\routers\__init__.py" -Force
Copy-Item -Path ".\backend\app\routers\__init__.py" -Destination ".\backend-admin\app\routers\__init__.py" -Force

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Review the generated main.py files in backend-public and backend-admin" -ForegroundColor White
Write-Host "2. Update frontend API configuration to use both endpoints" -ForegroundColor White
Write-Host "3. Test both services locally before deploying" -ForegroundColor White
