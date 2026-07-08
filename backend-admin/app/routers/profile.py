from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from bson import ObjectId
from datetime import datetime, timedelta
from pymongo import ReturnDocument
from ..services import auth_service
from ..services.storage_service import storage_service
from ..database import admins_collection
from ..models.admin_models import AdminPublic
from pydantic import BaseModel, Field
from typing import Optional
import logging

logger = logging.getLogger(__name__)
from urllib.parse import unquote
from ..services.activity_service import create_activity
from ..models.activity_models import ActivityCreate
from ..models.upload_models import SignedUploadRequest, SignedUploadResponse, UploadFinalizeRequest

router = APIRouter()

# Pydantic model for updating a user's own profile.
class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, example="New Name")
    mobile_number: Optional[int] = Field(None, example=9876543210)
    mobile_prefix: Optional[str] = Field(None, example="+91")
    email: Optional[str] = Field(None, example="user@example.com")
    profile_picture: Optional[str] = Field(None, example="https://example.com/new_profile.jpg")
    dob: Optional[str] = Field(None, example="1990-01-01")

@router.get("/me", response_model=AdminPublic) # This will now work correctly
async def get_my_profile(current_admin: dict = Depends(auth_service.get_current_admin)):
    """
    Fetches the profile information for the currently authenticated admin.
    """
    # Generate signed URL for profile picture if it exists
    profile_picture = current_admin.get("profile_picture")
    if profile_picture:
        # Normalize to get the object path
        object_path = storage_service.normalize_stored_path(profile_picture, "profile")
        if object_path:
            signed_url = storage_service.get_signed_url_for_bucket(storage_service.bucket_name, object_path)
            current_admin["profile_picture"] = signed_url
    return current_admin

@router.put("/me", response_model=AdminPublic) # This will also work correctly now
async def update_my_profile(
    profile_data: ProfileUpdate,
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Updates the profile for the currently authenticated admin.
    """
    user_id = current_admin.get("_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    update_data = profile_data.model_dump(exclude_unset=True)
    
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No update data provided")

    update_data["updated_at"] = datetime.utcnow()
    update_data["updated_by"] = current_admin.get("username", "system")

    updated_admin = await admins_collection.find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER
    )

    if not updated_admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found")

    # Generate signed URL for profile picture if it exists
    profile_picture = updated_admin.get("profile_picture")
    if profile_picture:
        object_path = storage_service.normalize_stored_path(profile_picture, "profile")
        if object_path:
            signed_url = storage_service.get_signed_url_for_bucket(storage_service.bucket_name, object_path)
            updated_admin["profile_picture"] = signed_url

    # No password field to sanitize
    
    # Build a human-readable summary of what changed
    fields = ", ".join(k.replace("_", " ") for k in update_data.keys()) or "profile"
    summary = f"Updated own profile details ({fields})."
    await create_activity(ActivityCreate(
        username=current_admin["username"],
        role=current_admin["role"],
        activity=summary,
        timestamp=datetime.utcnow()
    ))
    
    return updated_admin


@router.post("/me/get_signed_upload", response_model=SignedUploadResponse)
async def get_signed_upload_for_profile(
    payload: SignedUploadRequest,
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """Return a signed Cloudinary request for direct profile picture uploads."""
    user_id = current_admin.get("_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    db_doc = await admins_collection.find_one(
        {"_id": ObjectId(user_id)},
        {"last_profile_update": 1}
    )
    last_update = db_doc.get("last_profile_update") if db_doc else None
    cooldown = timedelta(days=60)
    now = datetime.utcnow()
    if last_update and now < last_update + cooldown:
        next_allowed = last_update + cooldown
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "You can only update your profile picture once every 60 days.",
                "next_allowed": next_allowed.isoformat(),
            },
        )

    username = current_admin.get("username")
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username not found in the current session.")

    signature = storage_service.prepare_signed_upload(
        route_key="profile",
        filename=payload.filename,
        username=username,
    )

    await create_activity(
        ActivityCreate(
            username=username,
            role=current_admin.get("role", ""),
            activity=f"Authorised profile picture upload for '{payload.filename}'.",
            timestamp=now,
        )
    )

    return SignedUploadResponse(**signature)


@router.post("/me/finalize_upload", response_model=AdminPublic)
async def finalize_profile_upload(
    metadata: UploadFinalizeRequest,
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """Persist profile picture metadata after a successful direct upload to Cloudinary."""
    user_id = current_admin.get("_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    username = current_admin.get("username")
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username not found in the current session.")

    expected_prefix = f"{username}/"
    if not metadata.object_path.startswith(expected_prefix):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid upload path for this user")

    expected_public_id = storage_service.build_public_id(storage_service.bucket_name, metadata.object_path)
    if metadata.public_id != expected_public_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload verification failed")

    # Enforce 2MB limit for profile pictures
    max_profile_size_bytes = 2 * 1024 * 1024
    if metadata.bytes and metadata.bytes > max_profile_size_bytes:
        # Delete the uploaded asset since it exceeds the limit
        try:
            storage_service.delete_profile_asset(metadata.secure_url or f"{storage_service.bucket_name}/{metadata.object_path}")
        except Exception as e:
            logger.warning(f"Failed to delete oversized profile picture: {e}")
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Profile picture exceeds the maximum allowed size of 2MB. Uploaded size: {metadata.bytes} bytes."
        )

    db_doc = await admins_collection.find_one(
        {"_id": ObjectId(user_id)},
        {"profile_picture": 1, "last_profile_update": 1}
    )
    existing_profile_picture = db_doc.get("profile_picture") if db_doc else None

    public_url = metadata.object_path
    now = datetime.utcnow()

    update_data = {
        "profile_picture": public_url,
        "last_profile_update": now,
        "updated_at": now,
        "updated_by": username,
    }

    updated_admin = await admins_collection.find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    if not updated_admin:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update profile picture in the database.")

    # Generate signed URL for the new profile picture
    profile_picture = updated_admin.get("profile_picture")
    if profile_picture:
        signed_url = storage_service.get_signed_url_for_bucket(storage_service.bucket_name, profile_picture)
        updated_admin["profile_picture"] = signed_url

    if existing_profile_picture:
        previous_path = storage_service.normalize_stored_path(existing_profile_picture, "profile")
        new_path = storage_service.normalize_stored_path(public_url, "profile")
        if previous_path and new_path and previous_path != new_path:
            storage_service.delete_profile_asset(existing_profile_picture)

    await create_activity(
        ActivityCreate(
            username=username,
            role=current_admin.get("role", ""),
            activity="Finalized profile picture update via direct upload.",
            timestamp=now,
        )
    )

    return updated_admin


@router.get("/files/{object_path:path}")
async def serve_profile_file(object_path: str):
    """
    Serve files from Cloudinary-backed storage with proper content types and caching headers.
    """
    try:
        # Decode the URL-encoded object path
        decoded_path = unquote(object_path)
        
        # Get signed URL from Cloudinary for private image
        url = storage_service.get_signed_url_for_bucket(storage_service.bucket_name, decoded_path)
        
        # Redirect to Cloudinary URL with caching headers
        return RedirectResponse(
            url,
            status_code=302,
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
            }
        )
        
    except HTTPException:
        raise  # Re-raise HTTPException from storage service
    except Exception as e:
        print(f"Unexpected error serving file: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to serve file")

