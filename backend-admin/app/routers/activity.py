from fastapi import APIRouter, Depends, Query, HTTPException
from typing import List, Optional
from ..services.activity_service import get_all_activities
from ..models.activity_models import ActivityInDB
from ..services.auth_service import get_current_admin

router = APIRouter()

@router.get("/activities", response_model=List[ActivityInDB], response_model_by_alias=False)
async def get_activities(
    role: Optional[str] = Query(None, description="Filter by role"),
    username: Optional[str] = Query(None, description="Filter by username"),
    date: Optional[str] = Query(None, description="Filter by date (YYYY-MM-DD)"),
    current_admin: dict = Depends(get_current_admin)
):
    """
    Get all activities, optionally filtered by role, username, or date.
    Requires admin authentication.
    """
    if int(current_admin.get("role_id", 99)) > 1:
        raise HTTPException(status_code=403, detail="Access denied")
    activities = await get_all_activities(role=role, username=username, date=date)
    # With response_model_by_alias=False, FastAPI will serialize `id` instead of `_id`.
    return activities