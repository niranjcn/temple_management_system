import os
from datetime import datetime
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
# Import only public-facing routers
from .routers import (
    auth, 
    bookings, 
    rituals, 
    events, 
    gallery, 
    gallery_layout, 
    gallery_home_preview, 
    slideshow, 
    featured_event, 
    events_section, 
    calendar, 
    committee  # Only GET endpoints will be exposed
)
from .database import available_rituals_collection, roles_collection, ensure_indexes
from .models.role_models import RoleBase
from .models.ritual_models import AvailableRitualBase
from fastapi.middleware.cors import CORSMiddleware
from .middleware.enhanced_jwt_auth_middleware import EnhancedJWTAuthMiddleware
from .middleware.enhanced_security_middleware import create_enhanced_security_middleware
from .middleware.mobile_verification_middleware import MobileVerificationMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# --- App Initialization ---
app = FastAPI(
    title="Temple Management System - Public API",
    description="Public-facing API for temple rituals, events, bookings, and content display.",
    version="2.0.0"
)

# ====================================================================
# --- MIDDLEWARE CONFIGURATION (Optimized for Public Service) ---
# ====================================================================

# --- 1. Enhanced Security Middleware (Lightweight) ---
# Disabled heavy protections for better performance on free tier
if os.getenv("DISABLE_HEAVY_MIDDLEWARE", "true").lower() != "true":
    app.add_middleware(
        create_enhanced_security_middleware(
            exclude_paths=["/docs", "/redoc", "/openapi.json", "/", "/api"],
            enable_waf=False,
            enable_ddos_protection=False,
            enable_rate_limiting=True,  # Keep basic rate limiting
            enable_request_signing=False
        )
    )

# --- 2. Mobile Verification Middleware ---
app.add_middleware(
    MobileVerificationMiddleware,
    exclude_paths=["/docs", "/redoc", "/openapi.json", "/", "/api"],
)

# --- 3. Enhanced JWT Authentication Middleware ---
app.add_middleware(
    EnhancedJWTAuthMiddleware,
    exclude_paths=[
        "/docs", "/redoc", "/openapi.json", "/", "/api",
        # Public endpoints
        "/api/auth/login", "/api/auth/register",
        "/api/auth/refresh-token", "/api/auth/logout",
        # Public read endpoints
        "/api/rituals", "/api/events", "/api/gallery",
        "/api/gallery-layout", "/api/gallery-home-preview",
        "/api/slideshow", "/api/featured-event",
        "/api/events-section", "/api/calendar",
        "/api/committee"  # GET only
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

print(f"[PUBLIC API] CORS allow_origins: {origins}")
if allow_origin_regex:
    print(f"[PUBLIC API] CORS allow_origin_regex: {allow_origin_regex}")

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
    print("PUBLIC API SERVICE - STARTUP")
    print("=" * 60)
    
    # Check database mode
    from .database import get_primary_database_type
    primary_db_type = get_primary_database_type()
    print(f"✓ Database Mode: {primary_db_type.upper()}")
    
    if primary_db_type != "cloud":
        print("⚠ Warning: PUBLIC API should run with PRIMARY_DATABASE=cloud")
        print("  Backup and sync features are disabled in cloud mode.")
    
    # --- Ensure Indexes ---
    try:
        await ensure_indexes()
        print("✓ Ensured required database indexes")
    except Exception as e:
        print(f"⚠ Warning: Could not ensure indexes: {e}")
    
    # --- Initialize Data (Rituals) ---
    if await available_rituals_collection.count_documents({}) == 0:
        print("Populating database with initial rituals...")
        initial_rituals = [
            AvailableRitualBase(
                name='Aarti & Prayers',
                description='Traditional evening prayers with sacred flames.',
                price=101,
                duration='30 mins',
                popular=True,
                icon_name='Flame'
            ),
            AvailableRitualBase(
                name='Puja & Offering',
                description='Personal worship ceremony with flowers and fruits.',
                price=251,
                duration='45 mins',
                popular=False,
                icon_name='Flower2'
            ),
            AvailableRitualBase(
                name='Special Blessing',
                description='Personalized blessing for health and prosperity.',
                price=501,
                duration='1 hour',
                popular=True,
                icon_name='Heart'
            ),
            AvailableRitualBase(
                name='Festival Ceremony',
                description='Grand rituals for special occasions.',
                price=1001,
                duration='2 hours',
                popular=False,
                icon_name='Star'
            ),
        ]
        await available_rituals_collection.insert_many([r.model_dump() for r in initial_rituals])
        print("✓ Initial rituals populated")
    
    # --- Nakshatrapooja Ritual ---
    nakshatrapooja_ritual = await available_rituals_collection.find_one({"name": "Nakshatrapooja"})
    if not nakshatrapooja_ritual:
        print("Creating special Nakshatrapooja ritual...")
        nakshatrapooja = AvailableRitualBase(
            name='Nakshatrapooja',
            description='Sacred ritual performed on your birth star (Naal) for blessings and prosperity.',
            price=751,
            duration='1.5 hours',
            popular=True,
            icon_name='Star',
            is_nakshatrapooja=True,
            nakshatrapooja_color='#FF6B35',
            show_on_home=False
        )
        await available_rituals_collection.insert_one(nakshatrapooja.model_dump())
        print("✓ Nakshatrapooja ritual created")
    
    # --- Populate Roles (if needed) ---
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
    
    print("=" * 60)
    print("PUBLIC API SERVICE - READY ✅")
    print("=" * 60)


# ====================================================================
# --- API ROUTERS (Public-Facing) ---
# ====================================================================

app.include_router(auth.router, tags=["Authentication"], prefix="/api/auth")
app.include_router(rituals.router, tags=["Rituals"], prefix="/api/rituals")
app.include_router(events.router, tags=["Events"], prefix="/api/events")
app.include_router(bookings.router, tags=["Bookings"], prefix="/api/bookings")
app.include_router(gallery.router, tags=["Gallery"], prefix="/api/gallery")
app.include_router(gallery_layout.router, tags=["Gallery Layout"], prefix="/api/gallery-layout")
app.include_router(gallery_home_preview.router, tags=["Gallery Home Preview"], prefix="/api/gallery-home-preview")
app.include_router(slideshow.router, tags=["Slideshow"], prefix="/api/slideshow")
app.include_router(featured_event.router, tags=["Featured Event"], prefix="/api/featured-event")
app.include_router(events_section.router, tags=["Events Section"], prefix="/api/events-section")
app.include_router(calendar.router, tags=["Calendar"], prefix="/api")
app.include_router(committee.router, tags=["Committee"], prefix="/api/committee")

# ====================================================================
# --- HEALTH CHECK ENDPOINTS ---
# ====================================================================

@app.get("/")
async def health_check():
    return {
        "status": "healthy",
        "service": "public-api",
        "message": "Temple Management System - Public API is running"
    }

@app.get("/api")
async def root():
    return {
        "message": "Welcome to the Temple Management System - Public API",
        "service": "public-api",
        "version": "2.0.0"
    }
