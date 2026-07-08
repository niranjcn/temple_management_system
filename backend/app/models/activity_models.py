from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime
from bson import ObjectId
from .main_models import PyObjectId

class ActivityBase(BaseModel):
    username: str = Field(..., example="admin")
    role: str = Field(..., example="Super Admin")
    activity: str = Field(..., example="Created new admin user")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    # Sync tracking fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"

class ActivityCreate(ActivityBase):
    pass

class ActivityInDB(ActivityBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})