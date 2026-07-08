"""
Location Management Models

This module handles the temple/work location configuration.
Only super admins can modify these settings.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId


class PyObjectId(ObjectId):
    """Custom type for MongoDB ObjectId validation"""
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")


# ============= Location Configuration Models =============

class LocationConfigBase(BaseModel):
    """Base model for location configuration"""
    name: str = Field(..., description="Location name (e.g., 'Main Temple')")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude coordinate")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude coordinate")
    check_in_radius: float = Field(default=100.0, ge=10, le=1000, description="Radius for check-in/out in meters (default: 100m)")
    outside_radius: float = Field(default=500.0, ge=100, le=5000, description="Radius beyond which user is considered outside (default: 500m)")
    address: Optional[str] = Field(None, max_length=500, description="Physical address of the location")
    notes: Optional[str] = Field(None, max_length=1000, description="Additional notes")
    
    # Sync tracking fields
    synced_at: Optional[datetime] = Field(None, description="Last successful sync timestamp")
    sync_origin: Optional[str] = Field(default="local", description="Origin of the document: 'local', 'cloud', or 'remote'")
    sync_status: Optional[str] = Field(default="pending", description="Current sync status: 'synced', 'pending', 'conflict', or 'failed'")


class LocationConfigCreate(LocationConfigBase):
    """Model for creating location configuration"""
    pass


class LocationConfigUpdate(BaseModel):
    """Model for updating location configuration"""
    name: Optional[str] = Field(None, max_length=200)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    check_in_radius: Optional[float] = Field(None, ge=10, le=1000)
    outside_radius: Optional[float] = Field(None, ge=100, le=5000)
    address: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=1000)
    
    # Sync tracking fields are not included in update model
    # They are managed automatically by the sync system


class LocationConfigInDB(LocationConfigBase):
    """Location configuration as stored in database"""
    id: str = Field(alias="_id")
    created_by: str = Field(..., description="User ID of admin who created this")
    updated_by: str = Field(..., description="User ID of admin who last updated this")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True, description="Whether this location is currently active")

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str}


class LocationConfigResponse(BaseModel):
    """Response model for location configuration"""
    id: str
    name: str
    latitude: float
    longitude: float
    check_in_radius: float
    outside_radius: float
    address: Optional[str]
    notes: Optional[str]
    created_by: str
    created_by_name: Optional[str]
    updated_by: str
    updated_by_name: Optional[str]
    created_at: datetime
    updated_at: datetime
    is_active: bool
    
    # Sync tracking fields
    synced_at: Optional[datetime] = None
    sync_origin: Optional[str] = None
    sync_status: Optional[str] = None


# ============= Response Models =============

class LocationResponse(BaseModel):
    """Generic response for location operations"""
    success: bool
    message: str
    data: Optional[dict] = None
