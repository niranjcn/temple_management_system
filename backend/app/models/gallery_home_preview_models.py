from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from bson import ObjectId
from .main_models import PyObjectId
from datetime import datetime


class HomePreviewBase(BaseModel):
    # Exactly six slots; nulls allowed to indicate empty
    slots: List[Optional[str]] = Field(default_factory=lambda: [None, None, None, None, None, None], min_items=6, max_items=6)
    
    # Sync tracking fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"


class HomePreviewCreate(HomePreviewBase):
    pass


class HomePreviewInDB(HomePreviewBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})
