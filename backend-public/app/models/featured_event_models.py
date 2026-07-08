from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class FeaturedEvent(BaseModel):
    event_id: Optional[str] = Field(default=None, description="The _id of the featured event")
    
    # Sync tracking fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"
