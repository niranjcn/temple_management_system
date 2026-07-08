from fastapi import APIRouter, Body, HTTPException, status, Depends
from typing import List
from ..services import ritual_service, auth_service
from ..models import AvailableRitualCreate, AvailableRitualInDB
from ..services.activity_service import create_activity
from ..models.activity_models import ActivityCreate
from datetime import datetime

router = APIRouter()

@router.get("/", response_description="List all available rituals", response_model=List[AvailableRitualInDB])
async def list_available_rituals():
    """
    Used to retrieve all available rituals from the database.
    Filters rituals based on availability date range.
    """
    rituals = await ritual_service.get_all_available_rituals()
    return rituals

@router.get("/featured", response_description="List featured rituals for home (max 3)", response_model=List[AvailableRitualInDB])
async def list_featured_rituals():
    """
    Used to retrieve up to 3 rituals flagged to be shown on home. Date filtering applies too.
    """
    rituals = await ritual_service.get_featured_rituals_for_home()
    return rituals

@router.get("/admin", response_description="List all rituals for admin", response_model=List[AvailableRitualInDB])
async def list_all_rituals_admin(current_admin: dict = Depends(auth_service.get_current_admin)):
    """
    Used to retrieve all rituals for admin without date filtering.
    """
    if int(current_admin.get("role_id", 99)) > 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view all rituals")
    rituals = await ritual_service.get_all_available_rituals_admin()
    return rituals

@router.get("/all", response_description="List all rituals (no date filtering)", response_model=List[AvailableRitualInDB])
async def list_all_rituals_public():
    """
    Public endpoint for clients (e.g., booking page) to fetch all rituals without
    date filtering. Employee-only filtering (if required) should be handled client-side.
    """
    rituals = await ritual_service.get_all_public_rituals_no_date()
    return rituals

@router.post("", response_description="Add new ritual", response_model=AvailableRitualInDB, status_code=status.HTTP_201_CREATED)
async def create_new_ritual(
    ritual: AvailableRitualCreate = Body(...),
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Used to create a new available ritual. Requires role_id <= 4 (Super/Admin/Privileged/Editor/Employee).
    """
    if int(current_admin.get("role_id", 99)) > 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to create rituals")
    try:
        created_ritual = await ritual_service.create_ritual(ritual)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if created_ritual:
        # Log activity
        activity = ActivityCreate(
            username=current_admin["username"],
            role=current_admin["role"],
            activity=f"Added a new ritual named '{ritual.name}'.",
            timestamp=datetime.utcnow()
        )
        await create_activity(activity)
        return created_ritual
    raise HTTPException(status_code=400, detail="Ritual could not be created.")

@router.put("/{id}", response_description="Update a ritual", response_model=AvailableRitualInDB)
async def update_ritual(
    id: str,
    ritual: AvailableRitualCreate = Body(...),
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Used to update an existing ritual. Requires role_id <= 4.
    """
    if int(current_admin.get("role_id", 99)) > 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update rituals")
    try:
        updated_ritual = await ritual_service.update_ritual_by_id(id, ritual.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if updated_ritual is not None:
        # Log activity
        activity = ActivityCreate(
            username=current_admin["username"],
            role=current_admin["role"],
            activity=f"Updated the ritual '{updated_ritual['name']}'.",
            timestamp=datetime.utcnow()
        )
        await create_activity(activity)
        return updated_ritual
    raise HTTPException(status_code=404, detail=f"Ritual with ID {id} not found")

@router.delete("/{id}", response_description="Delete a ritual", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ritual(
    id: str,
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Used to delete a ritual. Requires role_id <= 4.
    """
    if int(current_admin.get("role_id", 99)) > 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete rituals")
    deleted = await ritual_service.delete_ritual_by_id(id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Ritual with ID {id} not found")
    
    # Log activity
    activity = ActivityCreate(
        username=current_admin["username"],
        role=current_admin["role"],
        activity=f"Deleted a ritual (ID: {id}).",
        timestamp=datetime.utcnow()
    )
    await create_activity(activity)
    
    return
