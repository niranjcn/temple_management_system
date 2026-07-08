from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from bson import ObjectId
from .main_models import PyObjectId
from datetime import datetime

# --- Schema for Committee Members ---
class CommitteeMemberBase(BaseModel):
    name: str = Field(..., example="John Doe")
    designation: str = Field(..., example="President")
    profile_description: str = Field(..., example="Experienced leader with 10 years in temple management.")
    mobile_prefix: str = Field(default="+91", example="+91")
    phone_number: str = Field(..., example="1234567890")
    # Ordering fields for public previews and full view listings
    # preview_order limits to top 7 entries, 1 is the featured member in CommitteeSection
    preview_order: Optional[int] = Field(default=None, ge=1, le=7)
    # view_order controls ordering on CommitteeMembers page; nulls go last
    view_order: Optional[int] = Field(default=None, ge=1)
    # Image will be a backend-served URL (e.g., /api/committee/files/<object_path>)
    image: str = Field(default="", example="/api/committee/files/2025-01-01_12-00-00_000000/photo.jpg")
    
    # Sync tracking fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"

class CommitteeMemberCreate(CommitteeMemberBase):
    pass

class CommitteeMemberInDB(CommitteeMemberBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})