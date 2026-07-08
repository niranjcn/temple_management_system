from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from ..database import admins_collection
from .jwt_security_service import jwt_security
from ..models.admin_models import AdminInDB, AdminCreate
from bson import ObjectId
from datetime import datetime
import bcrypt
from typing import Optional

# Token URL is only used for docs; tokens are issued under /api/auth
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# --- Admin Database Operations ---
async def create_admin(admin: AdminCreate):
    """
    Used to create a new admin user in the database.
    This function takes an AdminCreate schema object, dumps it to a dictionary,
    and inserts it into the admins_collection.
    """
    admin_data = admin.model_dump()
    if not admin_data.get("hashed_password"):
        raise ValueError("hashed_password is required when creating an admin user")
    result = await admins_collection.insert_one(admin_data)
    new_admin = await admins_collection.find_one({"_id": result.inserted_id})
    return new_admin


def hash_password(password: str) -> str:
    """Hash a plain text password using bcrypt."""
    if not password or not isinstance(password, str):
        raise ValueError("Password must be a non-empty string")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    """Safely verify a password against its bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        # Occurs if hash is malformed
        return False


async def authenticate_admin(username: str, password: str) -> Optional[dict]:
    """Authenticate admin by username/password, returning admin document on success."""
    admin = await get_admin_by_username(username)
    if not admin:
        return None
    if not verify_password(password, admin.get("hashed_password")):
        return None
    return admin

async def get_admin_by_username(username: str):
    """Fetches a single admin user from the database by username."""
    return await admins_collection.find_one({"username": username})

async def get_admin_by_mobile(mobile_number: str):
    """Fetch admin by mobile number (full number with country code)."""
    # Try to find admin where mobile_prefix + mobile_number equals the provided mobile_number
    return await admins_collection.find_one({
        "$expr": {
            "$eq": [
                {"$concat": ["$mobile_prefix", {"$toString": "$mobile_number"}]},
                mobile_number
            ]
        }
    })

async def update_last_login(admin_id: str):
    """
    Update the last login timestamp for the admin user.
    """
    await admins_collection.update_one(
        {"_id": ObjectId(admin_id)},
        {"$set": {"last_login": datetime.utcnow()}}
    )

# --- Dependency for protected routes ---
async def get_current_admin(request: Request, token: str = Depends(oauth2_scheme)):
    """
    Validate JWT (prefer the already-verified payload from middleware), then
    load and return the current admin document from the database.
    
    Accepts tokens issued by the unified jwt_security service (with audience
    and optional client binding) to avoid decode mismatches.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # If middleware already validated, reuse its payload to keep validation consistent
        payload = getattr(request.state, "user", None)
        if not payload:
            # Fallback: verify using the centralized JWT security service
            client_info = jwt_security.get_client_info(request)
            payload = jwt_security.verify_token(token, token_type="access", client_info=client_info)

        username: str = payload.get("sub")
        if not username:
            raise credentials_exception
    except HTTPException:
        # Bubble up auth errors from jwt_security.verify_token
        raise
    except Exception:
        raise credentials_exception
    
    admin = await get_admin_by_username(username)
    if admin is None:
        raise credentials_exception
    return admin


async def get_current_user_with_admin_role(request: Request, token: str = Depends(oauth2_scheme)) -> AdminInDB:
    """
    Get current admin user and return as AdminInDB model.
    This is used for sync endpoints that require admin authentication.
    """
    # Get the admin dict using existing function
    admin_dict = await get_current_admin(request, token)
    
    # Convert to AdminInDB model
    admin_db = AdminInDB(**admin_dict)
    return admin_db
