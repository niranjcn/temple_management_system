from fastapi import APIRouter, Depends, HTTPException, status
from ..services.featured_event_service import get_featured_event_id, set_featured_event_id
from ..services import auth_service
from ..models.featured_event_models import FeaturedEvent

router = APIRouter()

@router.get("/", response_model=FeaturedEvent)
async def fetch_featured_event():
    event_id = await get_featured_event_id()
    return FeaturedEvent(event_id=event_id)

@router.post("/", response_model=FeaturedEvent)
async def update_featured_event(payload: FeaturedEvent, current_admin: dict = Depends(auth_service.get_current_admin)):
    if int(current_admin.get("role_id", 99)) > 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to set featured event")
    event_id = await set_featured_event_id(payload.event_id)
    return FeaturedEvent(event_id=event_id)
