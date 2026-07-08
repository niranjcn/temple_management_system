from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from bson import ObjectId
from .main_models import PyObjectId
from .ritual_models import RitualInstance
from datetime import datetime

# --- Schema for Bookings (transactions) ---
# Defines the base structure for a booking.
class BookingBase(BaseModel):
    name: str = Field(..., min_length=1, example="John Doe")
    email: str = Field(..., example="john.doe@example.com")
    phone: str = Field(..., example="1234567890")
    address: str = Field(..., example="123 Temple St")
    total_cost: float = Field(..., gt=0, example=553.0)
    instances: List[RitualInstance]
    booked_by: str = Field(default="self", example="self")  # <-- added, defaults to 'self'
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when the booking was made")
    
    # Sync tracking fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"

# Used when creating a new booking.
class BookingCreate(BookingBase):
    pass

# Represents a booking object as stored in the database.
class BookingInDB(BookingBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})
