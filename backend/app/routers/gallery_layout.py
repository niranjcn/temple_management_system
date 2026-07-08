from fastapi import APIRouter, Depends, HTTPException, status
from ..services import auth_service
from ..services.gallery_layout_service import get_layout, upsert_layout
from ..models.gallery_layout_models import GalleryLayoutCreate, GalleryLayoutInDB

router = APIRouter()


@router.get("/{mode}", response_model=GalleryLayoutInDB)
async def fetch_layout(mode: str):
    if mode != "full":
        raise HTTPException(status_code=400, detail="Invalid mode")
    doc = await get_layout(mode)
    if not doc:
        # If no layout is found, return an empty default to avoid a 404 error
        return GalleryLayoutInDB(mode=mode)
    return doc


@router.post("/{mode}", response_model=GalleryLayoutInDB)
async def save_layout(mode: str, payload: GalleryLayoutCreate, current_admin: dict = Depends(auth_service.get_current_admin)):
    if mode != "full":
        raise HTTPException(status_code=400, detail="Invalid mode")
    if int(current_admin.get("role_id", 99)) > 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to save gallery layout")
    if payload.mode != mode:
        raise HTTPException(status_code=400, detail="Body mode mismatch")
    saved = await upsert_layout(payload)
    return saved

