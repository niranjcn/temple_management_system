from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class EventsSection(BaseModel):
    """
    Represents the selection of event IDs to display in the homepage EventSection.
    Always include the featured event on the backend response regardless of this list.
    """
    event_ids: List[str] = Field(default_factory=list, description="List of event _id strings to show in homepage section")
    
    # Sync tracking fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"
