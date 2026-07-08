from fastapi import APIRouter, Depends, HTTPException, status
from ..models.slideshow_models import SlideshowInDB, SlideshowCreate
from ..services.slideshow_service import get_slideshow, save_slideshow
from ..services import auth_service

router = APIRouter()


@router.get("/", response_model=SlideshowInDB)
async def fetch_slideshow():
    doc = await get_slideshow()
    if not doc:
        # default empty config
        raise HTTPException(status_code=404, detail="Slideshow not configured")
    return doc


@router.post("/", response_model=SlideshowInDB)
async def update_slideshow(payload: SlideshowCreate, current_admin: dict = Depends(auth_service.get_current_admin)):
    if int(current_admin.get("role_id", 99)) > 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update slideshow")
    return await save_slideshow(payload)