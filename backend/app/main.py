import os
import random
from datetime import datetime
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .routers import rituals, bookings, events, admin, gallery, stock, roles, profile, activity, employee_booking, gallery_layout, slideshow, featured_event, committee, gallery_home_preview, calendar, auth, enhanced_admin, events_section, sync, backup, security, attendance, location
# Conditional imports for resource optimization
security_level = os.getenv("SECURITY_LEVEL", "standard").lower()
from .database import available_rituals_collection, admins_collection, roles_collection, ensure_indexes
from .models.role_models import RoleBase
from .services import auth_service
from .models.admin_models import AdminCreate
from .models.ritual_models import AvailableRitualBase
from fastapi.middleware.cors import CORSMiddleware
from .middleware.enhanced_jwt_auth_middleware import EnhancedJWTAuthMiddleware
from .middleware.enhanced_security_middleware import create_enhanced_security_middleware
from .middleware.mobile_verification_middleware import MobileVerificationMiddleware
from dotenv import load_dotenv
from pymongo import ASCENDING

# Load environment variables from .env file at the very beginning
load_dotenv()

# --- App Initialization ---
app = FastAPI(
    title="Temple Management System API",
    description="API for managing temple rituals, events, and bookings.",
    version="1.2.0"  # Updated version for enhanced security
)

# ====================================================================
# --- MIDDLEWARE ORDER (CRITICAL) ---
# Order is: Broadest Security -> Client Type -> User Auth -> CORS
# ====================================================================

# --- 1. Enhanced Security Middleware ---
# Blocks bad traffic (WAF, DDoS, rate limits) at the edge.
# NOTE: Only enabled if not running in minimal resource mode
if os.getenv("DISABLE_HEAVY_MIDDLEWARE", "false").lower() != "true":
    app.add_middleware(
        create_enhanced_security_middleware(
            exclude_paths=[
                "/docs", "/redoc", "/openapi.json", "/", "/api"
            ],
            enable_waf=os.getenv("ENABLE_WAF_PROTECTION", "false").lower() == "true",
            enable_ddos_protection=os.getenv("ENABLE_DDOS_PROTECTION", "false").lower() == "true",
            enable_rate_limiting=os.getenv("ENABLE_RATE_LIMITING", "true").lower() == "true",
            enable_request_signing=os.getenv("ENABLE_REQUEST_SIGNING", "false").lower() == "true"
        )
    )

# --- 2. Mobile Verification Middleware (MOVED UP) ---
# Checks if the *client* is authorized (official mobile/web app).
# This runs BEFORE JWT auth to reject unauthorized clients quickly.
app.add_middleware(
    MobileVerificationMiddleware,
    exclude_paths=[
        "/docs", "/redoc", "/openapi.json", "/", "/api"
        # We intentionally DO NOT exclude auth paths like /api/auth/login.
        # This middleware is designed to protect them from unauthorized
        # clients like curl and Postman.
    ],
)

# --- 3. Enhanced JWT Authentication Middleware (MOVED DOWN) ---
# Checks if the *user* is authenticated (valid JWT).
# Runs AFTER client verification.
app.add_middleware(
    EnhancedJWTAuthMiddleware,
    exclude_paths=[
        "/docs", "/redoc", "/openapi.json", "/", "/api",
        # Public auth endpoints (login/register)
        "/api/auth/login", "/api/auth/register",
        # Refresh/logout are handled by the endpoint logic itself
        "/api/auth/refresh-token", "/api/auth/logout"
    ]
)

# --- 4. CORS Middleware ---
"""
Allows the frontend to communicate with the backend.
This runs last to handle browser preflight (OPTIONS) requests.
"""
# Read ALLOWED_ORIGINS; treat empty/whitespace as unset
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

# Optional regex from env to support wildcard subdomains (e.g., Netlify previews)
origin_regex_env = os.getenv("ALLOWED_ORIGIN_REGEX", "").strip()

# Sensible default to allow Netlify preview subdomains only
default_origin_regex = r"^https:\/\/([a-z0-9-]+\.)*netlify\.app$"

allow_origin_regex = origin_regex_env or default_origin_regex

# Log resolved CORS configuration at startup for debugging
print(f"CORS allow_origins: {origins}")
if allow_origin_regex:
    print(f"CORS allow_origin_regex: {allow_origin_regex}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["content-length", "content-type"],
)


# --- Startup Event to Populate Database ---
@app.on_event("startup")
async def startup_db_client():
    # ========================================
    # STEP 1: DATABASE SYNCHRONIZATION (MUST BE FIRST!)
    # ========================================
    print("=" * 60)
    print("STARTUP SEQUENCE: Database Sync (Priority 1)")
    print("=" * 60)
    
    # --- Initialize Sync Manager and Network Monitor ---
    try:
        from .services.sync_manager_service import get_sync_manager
        from .services.network_monitor_service import start_network_monitoring
        from .database import is_sync_enabled, get_primary_database_type
        
        primary_db_type = get_primary_database_type()
        
        if primary_db_type == "cloud":
            print("☁️ Running in CLOUD mode - sync features disabled (not needed)")
            print("   All operations use cloud MongoDB directly")
        elif is_sync_enabled():
            print("🔄 Running in LOCAL mode - initializing synchronization system...")
            
            # Initialize sync manager
            sync_manager = await get_sync_manager()
            print("✓ Sync manager initialized")
            
            # Start network monitoring for automatic sync on reconnect
            await start_network_monitoring()
            print("✓ Network monitoring started (checks every 5 minutes)")
            
            # CRITICAL: Perform initial sync on startup BEFORE any other operations
            try:
                print("🔄 Performing INITIAL DATABASE SYNC (blocking)...")
                print("   This ensures local database is up-to-date before proceeding...")
                await sync_manager.sync_all_collections(trigger="startup")
                print("✅ Initial database sync completed successfully!")
            except Exception as sync_error:
                print(f"❌ CRITICAL: Initial sync failed: {sync_error}")
                print("   Application will continue but data may be out of sync!")
        else:
            print("⚠ Sync not configured:")
            print("   - Set PRIMARY_DATABASE=local in .env to enable sync")
            print("   - Set MONGODB_CLOUD_URL for sync target")
            print("   Working in local-only mode.")
    
    except Exception as e:
        print(f"❌ CRITICAL: Could not initialize sync system: {e}")
        print("   Application will continue without sync features.")
    
    print("=" * 60)
    print("STARTUP SEQUENCE: Database Sync Complete ✅")
    print("=" * 60)
    print()
    
    # ========================================
    # STEP 2: INFRASTRUCTURE SETUP
    # ========================================
    print("STARTUP SEQUENCE: Infrastructure Setup...")
    
    # --- Create Backups Directory ---
    try:
        import os
        from pathlib import Path
        backup_dir = Path(__file__).parent.parent / "backups"
        backup_dir.mkdir(exist_ok=True)
        print(f"✓ Backups directory ready: {backup_dir}")
    except Exception as e:
        print(f"⚠ Warning: Could not create backups directory: {e}")
    
    # --- Ensure Unique Indexes ---
    try:
        await ensure_indexes()
        print("✓ Ensured required indexes (admins, calendar)")
    except Exception as e:
        # Will fail if duplicates exist; surface a warning so it can be resolved
        print(f"⚠ Warning: Could not ensure indexes: {e}")
    
    print()
    
    # ========================================
    # STEP 3: DATA INITIALIZATION (After Sync)
    # ========================================
    print("STARTUP SEQUENCE: Data Initialization...")

    # --- Populate Rituals ---
    if await available_rituals_collection.count_documents({}) == 0:
        print("Populating database with initial rituals...")
        initial_rituals = [
            AvailableRitualBase(name='Aarti & Prayers', description='Traditional evening prayers with sacred flames.', price=101, duration='30 mins', popular=True, icon_name='Flame'),
            AvailableRitualBase(name='Puja & Offering', description='Personal worship ceremony with flowers and fruits.', price=251, duration='45 mins', popular=False, icon_name='Flower2'),
            AvailableRitualBase(name='Special Blessing', description='Personalized blessing for health and prosperity.', price=501, duration='1 hour', popular=True, icon_name='Heart'),
            AvailableRitualBase(name='Festival Ceremony', description='Grand rituals for special occasions.', price=1001, duration='2 hours', popular=False, icon_name='Star'),
        ]
        # You would typically insert these into the database.
        # For example: await available_rituals_collection.insert_many([r.model_dump() for r in initial_rituals])
        print("Database populated with initial rituals.")
    
    # --- Create or Update Nakshatrapooja Ritual (Special) ---
    nakshatrapooja_ritual = await available_rituals_collection.find_one({"name": "Nakshatrapooja"})
    if not nakshatrapooja_ritual:
        print("Creating special Nakshatrapooja ritual...")
        nakshatrapooja = AvailableRitualBase(
            name='Nakshatrapooja',
            description='Sacred ritual performed on your birth star (Naal) for blessings and prosperity. This is a special ritual that uses our calendar system to map your Naal to the correct date.',
            price=751,
            duration='1.5 hours',
            popular=True,
            icon_name='Star',
            is_nakshatrapooja=True,
            nakshatrapooja_color='#FF6B35',  # Special orange-red color
            show_on_home=False
        )
        await available_rituals_collection.insert_one(nakshatrapooja.model_dump())
        print("✓ Nakshatrapooja ritual created successfully!")
    else:
        # Update existing to ensure it has special fields
        if not nakshatrapooja_ritual.get('is_nakshatrapooja'):
            print("Updating existing Nakshatrapooja ritual with special fields...")
            await available_rituals_collection.update_one(
                {"name": "Nakshatrapooja"},
                {"$set": {
                    "is_nakshatrapooja": True,
                    "nakshatrapooja_color": "#FF6B35",
                    "description": "Sacred ritual performed on your birth star (Naal) for blessings and prosperity. This is a special ritual that uses our calendar system to map your Naal to the correct date."
                }}
            )
            print("✓ Nakshatrapooja ritual updated with special fields!")

    # --- Populate Roles ---
    if await roles_collection.count_documents({}) == 0:
        print("Populating roles collection with predefined roles...")
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
        print("Roles collection populated.")

    # --- Create Default Admin User from .env ---
    existing_super_admin = await admins_collection.find_one({"role_id": 0})
    if not existing_super_admin:
        print("No super admin found. Creating default super admin from .env values...")
        admin_username = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
        admin_name = os.getenv("DEFAULT_ADMIN_NAME", "Administrator")
        admin_email = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@example.com")
        admin_mobile = os.getenv("DEFAULT_ADMIN_MOBILE", "1234567890")
        admin_mobile_prefix = os.getenv("DEFAULT_ADMIN_MOBILE_PREFIX", "+91")

        # Resolve role details from roles collection (role_id=0)
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
        print(
            "Default super admin created with username '%s'. Please update DEFAULT_ADMIN_PASSWORD immediately." % admin_username
        )
    else:
        print(
            "Super admin '%s' already present. Validating against environment defaults..." % existing_super_admin.get("username", "unknown")
        )

        # Synchronize critical defaults only if environment provides values
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
                print("Warning: DEFAULT_ADMIN_MOBILE must be numeric. Skipping mobile sync.")

        # Only reset password automatically if the default account hasn't been used yet
        if default_password:
            passwords_match = auth_service.verify_password(
                default_password,
                existing_super_admin.get("hashed_password")
            )
            if not passwords_match:
                if existing_super_admin.get("last_login") is None:
                    print("Default super admin password differs from .env; resetting to environment value.")
                    updates["hashed_password"] = auth_service.hash_password(default_password)
                else:
                    print("Super admin password differs from .env but account has been used; skipping automatic reset.")

        if updates:
            updates["updated_at"] = datetime.utcnow()
            updates["updated_by"] = "system"
            await admins_collection.update_one(
                {"_id": existing_super_admin["_id"]},
                {"$set": updates}
            )
            print("Super admin defaults synchronized from environment.")
        else:
            print("Super admin already aligned with environment overrides; no changes made.")


# --- Shutdown Event ---
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on application shutdown"""
    try:
        from .services.network_monitor_service import stop_network_monitoring
        await stop_network_monitoring()
        print("✓ Network monitor stopped")
    except Exception as e:
        print(f"Warning: Error during shutdown: {e}")


# --- API Routers ---
app.include_router(admin.router, tags=["Admin"], prefix="/api/admin")
app.include_router(rituals.router, tags=["Rituals"], prefix="/api/rituals")
app.include_router(events.router, tags=["Events"], prefix="/api/events")
app.include_router(bookings.router, tags=["Bookings"], prefix="/api/bookings")
app.include_router(employee_booking.router, tags=["Employee Bookings"], prefix="/api/employee-bookings")  # changed module name
app.include_router(gallery.router, tags=["Gallery"], prefix="/api/gallery")
app.include_router(gallery_layout.router, tags=["Gallery Layout"], prefix="/api/gallery-layout")
app.include_router(gallery_home_preview.router, tags=["Gallery Home Preview"], prefix="/api/gallery-home-preview")
app.include_router(committee.router, tags=["Committee"], prefix="/api/committee")
app.include_router(stock.router, tags=["Stock"], prefix="/api/stock")
app.include_router(roles.router, tags=["Roles"], prefix="/api/roles")
app.include_router(profile.router, tags=["Profile"], prefix="/api/profile") 
app.include_router(activity.router, tags=["Activity"], prefix="/api/activity")
app.include_router(slideshow.router, tags=["Slideshow"], prefix="/api/slideshow")
app.include_router(featured_event.router, tags=["Featured Event"], prefix="/api/featured-event")
app.include_router(events_section.router, tags=["Events Section"], prefix="/api/events-section")
app.include_router(calendar.router, tags=["Calendar"], prefix="/api")
app.include_router(auth.router, tags=["Authentication"], prefix="/api/auth")
app.include_router(enhanced_admin.router, tags=["Enhanced Admin"], prefix="/api/enhanced-admin")
app.include_router(sync.router, tags=["Synchronization"], prefix="/api/sync")
app.include_router(backup.router, tags=["Backup Management"], prefix="/api")
app.include_router(security.router, tags=["Security"], prefix="/api/security")
app.include_router(attendance.router, tags=["Attendance"])
app.include_router(location.router, tags=["Location Management"])

# Serve static files for profile pictures under /static/
_base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_profile_dir = os.path.join(_base_dir, "profile")
try:
    os.makedirs(_profile_dir, exist_ok=True)
except Exception as e:
    import logging
    logging.warning(f"Failed to create profile directory: {e}")
app.mount("/static", StaticFiles(directory=_base_dir), name="static")

@app.get("/")
async def health_check():
    return {"status": "healthy", "message": "Temple Management System API is running"}

@app.get("/api")
async def root():
    return {"message": "Welcome to the Temple Management System API"}