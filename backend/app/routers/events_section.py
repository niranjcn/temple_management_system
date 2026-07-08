from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from ..models.events_section_models import EventsSection
from ..services.events_section_service import get_events_section_ids, set_events_section_ids
from ..services import auth_service

router = APIRouter()


@router.get("/", response_model=EventsSection)
async def fetch_events_section():
    ids = await get_events_section_ids()
    return EventsSection(event_ids=ids)


@router.post("/", response_model=EventsSection)
async def update_events_section(payload: EventsSection, current_admin: dict = Depends(auth_service.get_current_admin)):
    # Allow roles with role_id <= 3 only
    if int(current_admin.get("role_id", 99)) > 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update events section")
    ids = await set_events_section_ids(payload.event_ids)
    return EventsSection(event_ids=ids)
