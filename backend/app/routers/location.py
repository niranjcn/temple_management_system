"""
Location Management Router

Endpoints for managing temple/work location configuration.
Accessible only to super admins (role_id = 0).
Mobile apps fetch this configuration to validate GPS-based attendance.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from datetime import datetime

from app.models.location_models import (
    LocationConfigCreate, LocationConfigUpdate, LocationConfigResponse,
    LocationResponse
)
from app.database import get_database
from app.services.auth_service import get_current_admin
from bson import ObjectId


router = APIRouter(prefix="/api/location", tags=["Location Management"])


# ============= Helper Functions =============

def location_helper(location, created_by_name: str = None, updated_by_name: str = None) -> dict:
    """Convert MongoDB location document to dict"""
    return {
        "id": str(location["_id"]),
        "name": location["name"],
        "latitude": location["latitude"],
        "longitude": location["longitude"],
        "check_in_radius": location.get("check_in_radius", 100.0),
        "outside_radius": location.get("outside_radius", 500.0),
        "address": location.get("address"),
        "notes": location.get("notes"),
        "created_by": location["created_by"],
        "created_by_name": created_by_name or location.get("created_by_name"),
        "updated_by": location["updated_by"],
        "updated_by_name": updated_by_name or location.get("updated_by_name"),
        "created_at": location.get("created_at", datetime.utcnow()),
        "updated_at": location.get("updated_at", datetime.utcnow()),
        "is_active": location.get("is_active", True),
        # Sync tracking fields
        "synced_at": location.get("synced_at"),
        "sync_origin": location.get("sync_origin", "local"),
        "sync_status": location.get("sync_status", "pending"),
    }


async def get_admin_name(user_id: str, db) -> str:
    """Get admin's full name from admins collection"""
    try:
        admin = await db.admins.find_one({"_id": ObjectId(user_id)})
        return admin["name"] if admin else "Unknown"
    except:
        return "Unknown"


def verify_super_admin(current_user: dict) -> None:
    """Verify that current user is a super admin (role_id = 0)"""
    if current_user.get("role_id") != 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can manage location configuration"
        )


# ============= Location Configuration Endpoints =============

@router.get("/config", response_model=LocationConfigResponse)
async def get_location_config(
    db = Depends(get_database)
):
    """
    Get the active location configuration.
    
    PUBLIC ENDPOINT - No authentication required.
    Mobile apps need this to validate GPS-based attendance.
    """
    # Find the active location configuration
    location = await db.location_config.find_one({"is_active": True})
    
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active location configuration found. Please contact your administrator."
        )
    
    created_by_name = await get_admin_name(location["created_by"], db)
    updated_by_name = await get_admin_name(location["updated_by"], db)
    
    return location_helper(location, created_by_name, updated_by_name)


@router.post("/config", response_model=LocationConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_location_config(
    location_data: LocationConfigCreate,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """
    Create a new location configuration.
    
    Only super admins (role_id = 0) can create location configurations.
    Automatically deactivates any existing active location.
    """
    verify_super_admin(current_user)
    
    # Deactivate all existing locations
    await db.location_config.update_many(
        {"is_active": True},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    # Create new location configuration
    location_dict = location_data.dict()
    location_dict["created_by"] = str(current_user["_id"])
    location_dict["updated_by"] = str(current_user["_id"])
    location_dict["created_at"] = datetime.utcnow()
    location_dict["updated_at"] = datetime.utcnow()
    location_dict["is_active"] = True
    
    # Initialize sync tracking fields
    location_dict["synced_at"] = None
    location_dict["sync_origin"] = "local"
    location_dict["sync_status"] = "pending"
    
    result = await db.location_config.insert_one(location_dict)
    created_location = await db.location_config.find_one({"_id": result.inserted_id})
    
    created_by_name = current_user["name"]
    
    return location_helper(created_location, created_by_name, created_by_name)


@router.put("/config", response_model=LocationConfigResponse)
async def update_location_config(
    location_update: LocationConfigUpdate,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """
    Update the active location configuration.
    
    Only super admins (role_id = 0) can update location configurations.
    """
    verify_super_admin(current_user)
    
    # Find the active location
    existing_location = await db.location_config.find_one({"is_active": True})
    
    if not existing_location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active location configuration found. Please create one first."
        )
    
    # Validate outside_radius > check_in_radius if both are being updated
    check_in = location_update.check_in_radius or existing_location.get("check_in_radius", 100.0)
    outside = location_update.outside_radius or existing_location.get("outside_radius", 500.0)
    
    if outside <= check_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Outside radius must be greater than check-in radius"
        )
    
    # Update location
    update_data = location_update.dict(exclude_unset=True)
    if update_data:
        update_data["updated_by"] = str(current_user["_id"])
        update_data["updated_at"] = datetime.utcnow()
        # Reset sync status to pending when location is updated
        update_data["sync_status"] = "pending"
        
        await db.location_config.update_one(
            {"_id": existing_location["_id"]},
            {"$set": update_data}
        )
    
    updated_location = await db.location_config.find_one({"_id": existing_location["_id"]})
    
    created_by_name = await get_admin_name(updated_location["created_by"], db)
    updated_by_name = current_user["name"]
    
    return location_helper(updated_location, created_by_name, updated_by_name)


@router.delete("/config/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location_config(
    location_id: str,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """
    Delete a location configuration.
    
    Only super admins (role_id = 0) can delete location configurations.
    Note: This will delete the location permanently. Consider deactivating instead.
    """
    verify_super_admin(current_user)
    
    if not ObjectId.is_valid(location_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid location ID"
        )
    
    result = await db.location_config.delete_one({"_id": ObjectId(location_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location configuration not found"
        )


@router.get("/config/all")
async def get_all_location_configs(
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """
    Get all location configurations (including inactive ones).
    
    Only super admins (role_id = 0) can view all location configurations.
    """
    verify_super_admin(current_user)
    
    cursor = db.location_config.find().sort("created_at", -1)
    locations = await cursor.to_list(length=None)
    
    enriched_locations = []
    for location in locations:
        created_by_name = await get_admin_name(location["created_by"], db)
        updated_by_name = await get_admin_name(location["updated_by"], db)
        enriched_locations.append(
            location_helper(location, created_by_name, updated_by_name)
        )
    
    return {
        "success": True,
        "data": enriched_locations,
        "total": len(enriched_locations)
    }


@router.patch("/config/{location_id}/activate")
async def activate_location_config(
    location_id: str,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """
    Activate a specific location configuration (and deactivate others).
    
    Only super admins (role_id = 0) can activate location configurations.
    """
    verify_super_admin(current_user)
    
    if not ObjectId.is_valid(location_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid location ID"
        )
    
    # Check if location exists
    location = await db.location_config.find_one({"_id": ObjectId(location_id)})
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location configuration not found"
        )
    
    # Deactivate all other locations
    await db.location_config.update_many(
        {"is_active": True},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    # Activate this location
    await db.location_config.update_one(
        {"_id": ObjectId(location_id)},
        {"$set": {
            "is_active": True,
            "updated_by": str(current_user["_id"]),
            "updated_at": datetime.utcnow(),
            "sync_status": "pending"  # Mark as pending sync when activated
        }}
    )
    
    return {
        "success": True,
        "message": f"Location '{location['name']}' activated successfully"
    }
