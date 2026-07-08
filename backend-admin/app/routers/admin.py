from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta, datetime
from bson import ObjectId
from typing import List
from pymongo import ReturnDocument
from ..services import auth_service
from ..services.storage_service import storage_service
from typing import Optional
from ..models.admin_models import AdminCreate, AdminCreateInput, AdminUpdate, AdminInDB, AdminPublic, Token
from ..database import admins_collection
from ..services.activity_service import create_activity
from ..models.activity_models import ActivityCreate

router = APIRouter()


def _is_super_admin(doc: dict) -> bool:
    role_flag = str(doc.get("role", "")).lower()
    return doc.get("role_id") == 0 or role_flag in {"super_admin", "super admin"}


def _validate_password_strength(password: str) -> None:
    """Ensure admin passwords meet basic complexity requirements."""
    if len(password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters long")
    if not any(ch.isalpha() for ch in password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must include at least one letter")
    if not any(ch.isdigit() for ch in password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must include at least one digit")
    if not any(ch in "!@#$%^&*()_-+=[]{}|:;\",.<>?/" for ch in password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must include at least one special character")

def _can_view_admin_mgmt(actor: dict) -> bool:
    """Super Admin (0), Admin (1), Privileged (2) can view admin management."""
    return int(actor.get("role_id", 99)) in (0, 1, 2)

def _can_create_user(actor: dict, new_role_id: int) -> bool:
    """Creator must have a strictly lower role_id than the new user and cannot create super admin (0)."""
    actor_rid = int(actor.get("role_id", 99))
    if new_role_id == 0:
        return False
    return actor_rid < int(new_role_id)

def _can_modify_user(actor: dict, target: dict, update_role_id: Optional[int] = None) -> bool:
    """
    Actor can modify target if:
    - Target is not Super Admin (role_id == 0)
    - Actor's role_id is strictly lower than target's current role_id
    - If update includes role_id change, the new role_id must still be strictly higher than actor's role_id and not 0
    - Privileged and lower (role_id >= 2) cannot modify themselves
    """
    actor_rid = int(actor.get("role_id", 99))
    target_rid = int(target.get("role_id", 99))

    # Super admin account is immutable
    if target_rid == 0:
        return False

    # Prevent self-modification for any non-super user (role_id >= 1)
    if actor_rid >= 1 and str(actor.get("_id")) == str(target.get("_id")):
        return False

    # Must be strictly more privileged than target
    if not (actor_rid < target_rid):
        return False

    # If changing role, ensure proposed role stays below actor's privilege ceiling
    if update_role_id is not None:
        if int(update_role_id) == 0:
            return False
        if not (actor_rid < int(update_role_id)):
            return False

    return True
# Who am I endpoint (for frontend to get real username)
@router.get("/me", response_model=AdminPublic)
async def get_me(current_admin: dict = Depends(auth_service.get_current_admin)):
    admin = current_admin.copy()
    admin.pop("hashed_password", None)
    # Ensure _id is converted to string for JSON serialization
    if "_id" in admin:
        admin["_id"] = str(admin["_id"])
    return admin

@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    """Deprecated. Use Google Sign-In via /api/auth/google."""
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password login disabled. Use Google Sign-In.")

# --- Admin Management Endpoints ---

@router.get("/users/", response_model=List[AdminPublic])
async def get_all_admins(current_admin: dict = Depends(auth_service.get_current_admin)):
    """
    Retrieves all admin users. Accessible by Super Admin (0), Admin (1), and Privileged (2).
    """
    if not _can_view_admin_mgmt(current_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view admin management")
    
    admins = await admins_collection.find({}, {"hashed_password": 0}).to_list(1000)
    return admins

@router.post("/users/", response_model=AdminPublic, status_code=status.HTTP_201_CREATED)
async def create_new_admin(
    admin_data: AdminCreateInput,
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """Create a new admin user after validating role and password policy."""
    if not _can_view_admin_mgmt(current_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Block creating Super Admin by any means
    if (getattr(admin_data, "role_id", None) == 0) or (str(getattr(admin_data, "role", "")).lower() in {"super_admin", "super admin"}):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot create another super admin")

    if not _can_create_user(current_admin, int(getattr(admin_data, "role_id", 99))):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient privileges to create this user")

    # Check mobile number uniqueness
    full_mobile = f"{admin_data.mobile_prefix}{admin_data.mobile_number}"
    existing_admin = await admins_collection.find_one({
        "$expr": {
            "$eq": [
                {"$concat": ["$mobile_prefix", {"$toString": "$mobile_number"}]},
                full_mobile
            ]
        }
    })
    if existing_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mobile number already registered to another admin")

    # Compose full create model on server: set created_by/created_at from token user
    payload = admin_data.model_dump()
    plain_password = payload.pop("password", None)
    if not plain_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is required for new admin accounts")

    _validate_password_strength(plain_password)
    hashed_password = auth_service.hash_password(plain_password)

    full_create = AdminCreate(
        **payload,
        hashed_password=hashed_password,
        created_by=current_admin["username"],
        created_at=datetime.utcnow(),
    )

    # Use the service to create the admin
    created_admin = await auth_service.create_admin(full_create)
    if isinstance(created_admin, dict):
        created_admin.pop("hashed_password", None)
    
    # Log activity
    activity = ActivityCreate(
        username=current_admin["username"],
        role=current_admin["role"],
        activity=f"Created a new admin user '{created_admin['username']}' with the role '{created_admin['role']}'.",
        timestamp=datetime.utcnow()
    )
    await create_activity(activity)
    
    return created_admin

@router.put("/users/{user_id}/", response_model=AdminPublic)
async def update_admin_user(
    user_id: str,
    admin_update: AdminUpdate,
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Update an admin user with strict role-based checks.
    """
    # Load target first
    try:
        target = await admins_collection.find_one({"_id": ObjectId(user_id)})
    except Exception:
        target = None

    if target is None:
        raise HTTPException(status_code=404, detail="Admin not found")

    payload = admin_update.model_dump(exclude_unset=True)

    # Handle username change: allow with uniqueness enforcement
    requested_username = payload.get("username")
    if requested_username is not None and str(requested_username) != str(target.get("username")):
        # Ensure actor can modify target (checked later as well)
        # Enforce uniqueness pre-check for better error message
        existing = await admins_collection.find_one({
            "username": str(requested_username),
            "_id": {"$ne": ObjectId(user_id)}
        })
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

    # Disallow any changes to Super Admin account
    if int(target.get("role_id", 99)) == 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin cannot be modified")

    # If role change requested, validate separately
    proposed_role_id = payload.get("role_id")

    if not _can_modify_user(current_admin, target, update_role_id=proposed_role_id if proposed_role_id is not None else None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient privileges to modify this user")

    # Prevent elevating someone to Super Admin
    if proposed_role_id is not None and int(proposed_role_id) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot assign super admin role")

    # Mobile number uniqueness check (if being updated)
    if "mobile_number" in payload or "mobile_prefix" in payload:
        # Get current values for fields not being updated
        current_prefix = payload.get("mobile_prefix", target.get("mobile_prefix"))
        current_number = payload.get("mobile_number", target.get("mobile_number"))
        
        if current_prefix and current_number:
            full_mobile = f"{current_prefix}{current_number}"
            existing_admin = await admins_collection.find_one({
                "$expr": {
                    "$eq": [
                        {"$concat": ["$mobile_prefix", {"$toString": "$mobile_number"}]},
                        full_mobile
                    ]
                },
                "_id": {"$ne": ObjectId(user_id)}
            })
            if existing_admin:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mobile number already registered to another admin")

    update_data = payload
    plain_password = update_data.pop("password", None)
    password_was_changed = False
    if plain_password:
        _validate_password_strength(plain_password)
        update_data["hashed_password"] = auth_service.hash_password(plain_password)
        password_was_changed = True

    update_data["updated_at"] = datetime.utcnow()
    update_data["updated_by"] = current_admin["username"]

    updated_admin = await admins_collection.find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
        projection={"hashed_password": 0},
    )

    if updated_admin is None:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Build human-readable change messages
    change_msgs = []
    # Username change
    if "username" in update_data and str(update_data.get("username")) != str(target.get("username")):
        change_msgs.append(f"changed username from '{target.get('username')}' to '{update_data.get('username')}'")
    # Role name change
    if "role" in update_data and str(update_data.get("role")) != str(target.get("role")):
        change_msgs.append(f"changed role from '{target.get('role')}' to '{update_data.get('role')}'")
    # Role level change (only if role not already captured)
    if "role_id" in update_data and int(update_data.get("role_id")) != int(target.get("role_id", -1)):
        change_msgs.append(f"updated role level from {target.get('role_id')} to {update_data.get('role_id')}")
    # Restriction status
    if "isRestricted" in update_data:
        prev = bool(target.get("isRestricted", False))
        now = bool(update_data.get("isRestricted"))
        if now and not prev:
            change_msgs.append("restricted the user account")
        elif not now and prev:
            change_msgs.append("lifted the restriction on the user account")
        else:
            change_msgs.append("updated account restriction settings")
    # Permissions
    if "permissions" in update_data:
        change_msgs.append("updated permissions")
    # Password change
    if password_was_changed:
        change_msgs.append("reset account password")
    # Profile-like fields
    profile_fields = [
        f for f in ("name","email","mobile_number","mobile_prefix","profile_picture","dob","notification_preference","notification_list")
        if f in update_data
    ]
    if profile_fields:
        # Humanize field names
        field_names = ", ".join(f.replace("_", " ") for f in profile_fields)
        change_msgs.append(f"updated profile details ({field_names})")

    # Fallback if nothing matched
    if not change_msgs:
        change_msgs.append("updated account details")

    msg = f"Updated admin user '{updated_admin['username']}': " + "; ".join(change_msgs)

    # Log activity with clear, non-technical language
    activity = ActivityCreate(
        username=current_admin["username"],
        role=current_admin["role"],
        activity=msg,
        timestamp=datetime.utcnow()
    )
    await create_activity(activity)
    
    return updated_admin

@router.delete("/users/{user_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_user(
    user_id: str,
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Delete an admin user with strict role-based checks.
    """
    try:
        target = await admins_collection.find_one({"_id": ObjectId(user_id)})
    except Exception:
        target = None

    if target is None:
        raise HTTPException(status_code=404, detail="Admin not found")

    # Disallow any delete of Super Admin
    if int(target.get("role_id", 99)) == 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin cannot be deleted")

    if not _can_modify_user(current_admin, target):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient privileges to delete this user")

    delete_result = await admins_collection.delete_one({"_id": ObjectId(user_id)})

    if delete_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Admin not found")

    storage_service.delete_profile_asset(target.get("profile_picture"))
    
    # Log activity
    activity = ActivityCreate(
        username=current_admin["username"],
        role=current_admin["role"],
        activity=f"Deleted the admin user '{target['username']}' (role: {target['role']}).",
        timestamp=datetime.utcnow()
    )
    await create_activity(activity)
    
    return
