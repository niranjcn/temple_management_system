from fastapi import APIRouter, Body, HTTPException, status, Depends
from fastapi.responses import RedirectResponse
from typing import List
from ..services import gallery_service, auth_service
from ..models import GalleryImageCreate, GalleryImageInDB
from ..models.upload_models import SignedUploadRequest, SignedUploadResponse, UploadFinalizeRequest
from ..services.activity_service import create_activity
from ..models.activity_models import ActivityCreate
from datetime import datetime
from urllib.parse import unquote
from ..services.storage_service import storage_service
import logging

logger = logging.getLogger(__name__)
from ..database import gallery_layouts_collection, gallery_slideshow_collection

router = APIRouter()

@router.get("/", response_description="List all gallery images", response_model=List[GalleryImageInDB])
async def list_all_gallery_images():
    """
    Used to retrieve all images from the gallery.
    """
    return await gallery_service.get_all_gallery_images()

@router.post("/get_signed_upload", response_description="Get signed upload for gallery image", response_model=SignedUploadResponse)
async def get_signed_upload_for_gallery(
    payload: SignedUploadRequest,
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """Issue a signed Cloudinary upload request for gallery images (role_id <= 3)."""
    if int(current_admin.get("role_id", 99)) > 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to upload gallery images")

    signature = storage_service.prepare_signed_upload(route_key="gallery", filename=payload.filename)

    await create_activity(
        ActivityCreate(
            username=current_admin["username"],
            role=current_admin["role"],
            activity=f"Issued gallery upload signature for '{payload.filename}'.",
            timestamp=datetime.utcnow(),
        )
    )

    return SignedUploadResponse(**signature)

@router.post("/finalize_upload", response_model=dict)
async def finalize_gallery_upload(
    metadata: UploadFinalizeRequest,
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """Validate and return the public URL for an uploaded gallery image."""
    if int(current_admin.get("role_id", 99)) > 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to upload gallery images")

    expected_public_id = storage_service.build_public_id(storage_service.gallery_bucket, metadata.object_path)
    if metadata.public_id != expected_public_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload verification failed")

    public_url = metadata.object_path

    await create_activity(
        ActivityCreate(
            username=current_admin["username"],
            role=current_admin["role"],
            activity=f"Finalized gallery image upload for '{metadata.object_path}'.",
            timestamp=datetime.utcnow(),
        )
    )

    return {"public_url": public_url}

@router.get("/files/{object_path:path}")
async def serve_gallery_file(object_path: str):
    """
    Serve gallery images from Cloudinary-backed storage with proper headers.
    """
    decoded_path = unquote(object_path)
    url = storage_service.get_signed_url_for_bucket(storage_service.gallery_bucket, decoded_path)
    return RedirectResponse(
        url,
        status_code=302,
        headers={
            "Cache-Control": "public, max-age=3600",
        }
    )

@router.post("/", response_description="Add new image to gallery", response_model=GalleryImageInDB, status_code=status.HTTP_201_CREATED)
async def create_gallery_image(
    image: GalleryImageCreate = Body(...),
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Used to create a new gallery image. Requires role_id <= 3 (Super/Admin/Privileged/Editor).
    """
    if int(current_admin.get("role_id", 99)) > 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to create gallery images")
    created_image = await gallery_service.create_gallery_image(image)
    if created_image:
        # Log activity
        activity = ActivityCreate(
            username=current_admin["username"],
            role=current_admin["role"],
            activity=f"Added a new image to the gallery: '{image.title}'.",
            timestamp=datetime.utcnow()
        )
        await create_activity(activity)
        return created_image
    raise HTTPException(status_code=400, detail="Image could not be created.")

@router.put("/{id}", response_description="Update a gallery image", response_model=GalleryImageInDB)
async def update_gallery_image(
    id: str,
    image: GalleryImageCreate = Body(...),
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Used to update an existing gallery image. Requires role_id <= 3.
    """
    if int(current_admin.get("role_id", 99)) > 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update gallery images")
    updated_image = await gallery_service.update_gallery_image_by_id(id, image.model_dump())
    if updated_image:
        # Log activity
        activity = ActivityCreate(
            username=current_admin["username"],
            role=current_admin["role"],
            activity=f"Updated the gallery image '{updated_image['title']}'.",
            timestamp=datetime.utcnow()
        )
        await create_activity(activity)
        return updated_image
    raise HTTPException(status_code=404, detail=f"Image with ID {id} not found")

@router.delete("/{id}", response_description="Delete a gallery image", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gallery_image(
    id: str,
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Used to delete a gallery image. Requires role_id <= 3.
    """
    if int(current_admin.get("role_id", 99)) > 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete gallery images")
    image = await gallery_service.get_gallery_image_by_id(id)
    if not image:
        raise HTTPException(status_code=404, detail=f"Image with ID {id} not found")
    deleted = await gallery_service.delete_gallery_image_by_id(id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Image with ID {id} not found")

    # Prune this image from any saved gallery layouts (both modes) and slideshow config
    try:
        # Remove any layout items referencing this image id
        await gallery_layouts_collection.update_many({}, {"$pull": {"items": {"id": id}}})
        # Also remove from static 'order' list if present
        await gallery_layouts_collection.update_many({}, {"$pull": {"order": id}})
    except Exception as e:
        logger.warning(f"Failed to remove image {id} from gallery layouts: {e}")
    try:
        # Remove from slideshow order if present
        await gallery_slideshow_collection.update_one({}, {"$pull": {"image_ids": id}})
    except Exception as e:
        logger.warning(f"Failed to remove image {id} from slideshow: {e}")
    
    # Log activity
    activity = ActivityCreate(
        username=current_admin["username"],
        role=current_admin["role"],
        activity=f"Deleted a gallery image: {image['title']} (ID: {id}).",
        timestamp=datetime.utcnow()
    )
    await create_activity(activity)
    
    return
