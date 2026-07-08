import os
from datetime import datetime
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
# Import only admin-facing routers
from .routers import (
    admin,
    enhanced_admin,
    roles,
    activity,
    stock,
    security,
    attendance,
    profile,
    committee,  # Only POST/PUT/DELETE endpoints
    location,
    employee_booking
)
from .database import admins_collection, roles_collection, ensure_indexes
from .models.role_models import RoleBase
from .services import auth_service
from .models.admin_models import AdminCreate
from fastapi.middleware.cors import CORSMiddleware
from .middleware.enhanced_jwt_auth_middleware import EnhancedJWTAuthMiddleware
from .middleware.enhanced_security_middleware import create_enhanced_security_middleware
from .middleware.mobile_verification_middleware import MobileVerificationMiddleware
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
load_dotenv()

# --- App Initialization ---
app = FastAPI(
    title="Temple Management System - Admin API",
    description="Administrative API for temple management, security, and operations.",
    version="2.0.0"
)

# ====================================================================
# --- MIDDLEWARE CONFIGURATION (Optimized for Admin Service) ---
# ====================================================================

# --- 1. Enhanced Security Middleware (Standard Protection) ---
# Admin service can afford slightly more security with lower traffic
if os.getenv("DISABLE_HEAVY_MIDDLEWARE", "false").lower() != "true":
    app.add_middleware(
        create_enhanced_security_middleware(
            exclude_paths=["/docs", "/redoc", "/openapi.json", "/", "/api"],
            enable_waf=False,
            enable_ddos_protection=False,
            enable_rate_limiting=True,
            enable_request_signing=False
        )
    )

# --- 2. Mobile Verification Middleware ---
app.add_middleware(
    MobileVerificationMiddleware,
    exclude_paths=["/docs", "/redoc", "/openapi.json", "/", "/api"],
)

# --- 3. Enhanced JWT Authentication Middleware ---
# All admin endpoints require authentication
app.add_middleware(
    EnhancedJWTAuthMiddleware,
    exclude_paths=[
        "/docs", "/redoc", "/openapi.json", "/", "/api"
        # No public endpoints in admin service
    ]
)

# --- 4. CORS Middleware ---
raw_allowed = os.getenv("ALLOWED_ORIGINS", "").strip()

default_origins = [
    "https://vamana-temple.netlify.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

if raw_allowed:
    origins = [o.strip() for o in raw_allowed.split(",") if o.strip()]
else:
    origins = default_origins

origin_regex_env = os.getenv("ALLOWED_ORIGIN_REGEX", "").strip()
default_origin_regex = r"^https:\/\/([a-z0-9-]+\.)*netlify\.app$"
allow_origin_regex = origin_regex_env or default_origin_regex

print(f"[ADMIN API] CORS allow_origins: {origins}")
if allow_origin_regex:
    print(f"[ADMIN API] CORS allow_origin_regex: {allow_origin_regex}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["content-length", "content-type"],
)

# ====================================================================
# --- STARTUP EVENT ---
# ====================================================================

@app.on_event("startup")
async def startup_db_client():
    print("=" * 60)
    print("ADMIN API SERVICE - STARTUP")
    print("=" * 60)
    
    # Check database mode
    from .database import get_primary_database_type
    primary_db_type = get_primary_database_type()
    print(f"✓ Database Mode: {primary_db_type.upper()}")
    
    if primary_db_type != "cloud":
        print("⚠ Warning: ADMIN API should run with PRIMARY_DATABASE=cloud")
        print("  Backup and sync features are disabled in cloud mode.")
    
    # --- Create Profile Directory ---
    try:
        _base_dir = Path(__file__).parent.parent
        _profile_dir = _base_dir / "profile"
        _profile_dir.mkdir(exist_ok=True)
        print(f"✓ Profile directory ready: {_profile_dir}")
    except Exception as e:
        print(f"⚠ Warning: Could not create profile directory: {e}")
    
    # --- Ensure Indexes ---
    try:
        await ensure_indexes()
        print("✓ Ensured required database indexes")
    except Exception as e:
        print(f"⚠ Warning: Could not ensure indexes: {e}")
    
    # --- Populate Roles ---
    if await roles_collection.count_documents({}) == 0:
        print("Populating roles collection...")
        predefined_roles = [
            RoleBase(role_id=0, role_name='Super Admin', basic_permissions=['*']),
            RoleBase(role_id=1, role_name='Admin', basic_permissions=['departments.manage', 'users.manage', 'approvals.manage']),
            RoleBase(role_id=2, role_name='Privileged User', basic_permissions=['staff.extended']),
            RoleBase(role_id=3, role_name='Editor', basic_permissions=['content.create', 'content.update', 'events.manage']),
            RoleBase(role_id=4, role_name='Employee', basic_permissions=['staff.basic']),
            RoleBase(role_id=5, role_name='Viewer', basic_permissions=['read.only']),
            RoleBase(role_id=6, role_name='Volunteer Coordinator', basic_permissions=['volunteers.manage']),
            RoleBase(role_id=7, role_name='Support / Helpdesk', basic_permissions=['support.assist']),
        ]
        await roles_collection.insert_many([r.model_dump() for r in predefined_roles])
        print("✓ Roles populated")
    
    # --- Create Default Admin User ---
    existing_super_admin = await admins_collection.find_one({"role_id": 0})
    if not existing_super_admin:
        print("Creating default super admin from .env...")
        admin_username = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
        admin_name = os.getenv("DEFAULT_ADMIN_NAME", "Administrator")
        admin_email = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@example.com")
        admin_mobile = os.getenv("DEFAULT_ADMIN_MOBILE", "1234567890")
        admin_mobile_prefix = os.getenv("DEFAULT_ADMIN_MOBILE_PREFIX", "+91")
        
        super_role = await roles_collection.find_one({"role_id": 0})
        role_name = (super_role or {}).get("role_name", "Super Admin")
        role_perms = (super_role or {}).get("basic_permissions", ["*"])
        
        default_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "ChangeMeNow123!")
        hashed_password = auth_service.hash_password(default_password)
        
        admin_user = AdminCreate(
            name=admin_name,
            email=admin_email,
            username=admin_username,
            role=role_name,
            role_id=0,
            mobile_number=int(admin_mobile),
            mobile_prefix=admin_mobile_prefix,
            profile_picture="https://example.com/default-avatar.png",
            dob="1970-01-01",
            created_by="system",
            last_profile_update=None,
            permissions=role_perms,
            notification_preference=["email", "whatsapp"],
            hashed_password=hashed_password,
        )
        await auth_service.create_admin(admin_user)
        print(f"✓ Default super admin created: {admin_username}")
        print("  ⚠ Please update DEFAULT_ADMIN_PASSWORD immediately!")
    else:
        print(f"✓ Super admin exists: {existing_super_admin.get('username', 'unknown')}")
        
        # Sync with environment if needed
        updates = {}
        admin_username = os.getenv("DEFAULT_ADMIN_USERNAME")
        admin_name = os.getenv("DEFAULT_ADMIN_NAME")
        admin_email = os.getenv("DEFAULT_ADMIN_EMAIL")
        admin_mobile = os.getenv("DEFAULT_ADMIN_MOBILE")
        admin_mobile_prefix = os.getenv("DEFAULT_ADMIN_MOBILE_PREFIX")
        default_password = os.getenv("DEFAULT_ADMIN_PASSWORD")
        
        if admin_name and admin_name != existing_super_admin.get("name"):
            updates["name"] = admin_name
        if admin_email and admin_email != existing_super_admin.get("email"):
            updates["email"] = admin_email
        if admin_username and admin_username != existing_super_admin.get("username"):
            updates["username"] = admin_username
        if admin_mobile_prefix and admin_mobile_prefix != existing_super_admin.get("mobile_prefix"):
            updates["mobile_prefix"] = admin_mobile_prefix
        if admin_mobile:
            try:
                mobile_int = int(admin_mobile)
                if mobile_int != existing_super_admin.get("mobile_number"):
                    updates["mobile_number"] = mobile_int
            except ValueError:
                pass
        
        if default_password and existing_super_admin.get("last_login") is None:
            if not auth_service.verify_password(default_password, existing_super_admin.get("hashed_password")):
                updates["hashed_password"] = auth_service.hash_password(default_password)
                print("  ⚠ Password reset to .env default (first-time account)")
        
        if updates:
            updates["updated_at"] = datetime.utcnow()
            updates["updated_by"] = "system"
            await admins_collection.update_one(
                {"_id": existing_super_admin["_id"]},
                {"$set": updates}
            )
            print("  ✓ Super admin synchronized with .env")
    
    print("=" * 60)
    print("ADMIN API SERVICE - READY ✅")
    print("=" * 60)


# ====================================================================
# --- API ROUTERS (Admin-Facing) ---
# ====================================================================

app.include_router(admin.router, tags=["Admin"], prefix="/api/admin")
app.include_router(enhanced_admin.router, tags=["Enhanced Admin"], prefix="/api/enhanced-admin")
app.include_router(roles.router, tags=["Roles"], prefix="/api/roles")
app.include_router(profile.router, tags=["Profile"], prefix="/api/profile")
app.include_router(activity.router, tags=["Activity"], prefix="/api/activity")
app.include_router(stock.router, tags=["Stock"], prefix="/api/stock")
app.include_router(security.router, tags=["Security"], prefix="/api/security")
app.include_router(attendance.router, tags=["Attendance"])  # Has its own prefix
app.include_router(committee.router, tags=["Committee Admin"], prefix="/api/committee")
app.include_router(location.router, tags=["Location Management"])  # Has its own prefix
app.include_router(employee_booking.router, tags=["Employee Bookings"])  # Has its own prefix

# Serve static files for profile pictures
_base_dir = Path(__file__).parent.parent
try:
    _profile_dir = _base_dir / "profile"
    _profile_dir.mkdir(exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(_base_dir)), name="static")
except Exception as e:
    print(f"⚠ Warning: Could not mount static files: {e}")

# ====================================================================
# --- HEALTH CHECK ENDPOINTS ---
# ====================================================================

@app.get("/")
async def health_check():
    return {
        "status": "healthy",
        "service": "admin-api",
        "message": "Temple Management System - Admin API is running"
    }

@app.get("/api")
async def root():
    return {
        "message": "Welcome to the Temple Management System - Admin API",
        "service": "admin-api",
        "version": "2.0.0"
    }
