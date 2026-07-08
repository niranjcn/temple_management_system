from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from bson import ObjectId
from .main_models import PyObjectId
from datetime import datetime

class SlideshowBase(BaseModel):
    image_ids: List[str] = Field(default_factory=list, description="Ordered list of gallery image IDs in slideshow")
    interval_ms: int = Field(default=4000, ge=1000, le=60000)
    transition_ms: int = Field(default=600, ge=100, le=5000)
    aspect_ratio: str = Field(default="16:9", description="e.g., 16:9, 4:3, 1:1")
    
    # Sync tracking fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"

class SlideshowCreate(SlideshowBase):
    pass

class SlideshowInDB(SlideshowBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})