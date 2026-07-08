from fastapi import APIRouter, Depends, HTTPException, status
from ..models.gallery_home_preview_models import HomePreviewInDB, HomePreviewCreate
from ..services.gallery_home_preview_service import get_home_preview, save_home_preview
from ..services import auth_service


router = APIRouter()


@router.get("/", response_model=HomePreviewInDB)
async def fetch_home_preview():
    doc = await get_home_preview()
    if not doc:
        raise HTTPException(status_code=404, detail="Home preview not configured")
    return doc


@router.post("/", response_model=HomePreviewInDB)
async def update_home_preview(payload: HomePreviewCreate, current_admin: dict = Depends(auth_service.get_current_admin)):
    if int(current_admin.get("role_id", 99)) > 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update home gallery preview")
    return await save_home_preview(payload)
