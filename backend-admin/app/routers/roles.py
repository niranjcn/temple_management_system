from fastapi import APIRouter, Depends
from typing import List
from ..database import roles_collection
from ..models.role_models import RoleInDB
from ..services import auth_service

router = APIRouter()

@router.get("/", response_model=List[RoleInDB])
async def get_roles(current_admin: dict = Depends(auth_service.get_current_admin)):
    # Any authenticated admin can list roles
    roles = await roles_collection.find().sort("role_id", 1).to_list(100)
    return roles
