from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List, Union
from bson import ObjectId
from .main_models import PyObjectId
from datetime import date, datetime

# --- Schema for Required Stock Item ---
# Defines the structure for a stock item required for a ritual.
class RequiredStockItem(BaseModel):
    stock_item_id: str = Field(..., example="60c72b2f9b1d8e001f8b4567")
    quantity_required: int = Field(..., gt=0, example=2)

# --- Schema for Available Rituals ---
# Defines the base structure for a ritual that is offered.
class AvailableRitualBase(BaseModel):
    name: str = Field(..., example="Aarti & Prayers")
    description: str = Field(..., example="Traditional evening prayers.")
    price: float = Field(..., example=101.0)
    duration: str = Field(..., example="30 mins")
    popular: Optional[bool] = Field(default=False, example=True)
    icon_name: str = Field(..., example="Flame")
    required_stock: Optional[List[RequiredStockItem]] = Field([], example=[{"stock_item_id": "60c72b2f9b1d8e001f8b4567", "quantity_required": 1}])
    # New booking window (24h HH:MM) and visibility flag
    booking_start_time: Optional[str] = Field(None, example="08:00")
    booking_end_time: Optional[str] = Field(None, example="18:30")
    employee_only: Optional[bool] = Field(False, example=False)
    # Date range for availability - using string format to avoid MongoDB serialization issues
    available_from: Optional[str] = Field(None, example="2023-01-01")
    available_to: Optional[str] = Field(None, example="2023-12-31")
    # Whether this ritual should be shown on the home RitualSection (max 3 allowed)
    show_on_home: Optional[bool] = Field(False, example=False)
    
    # Nakshatrapooja special fields
    is_nakshatrapooja: Optional[bool] = Field(False, example=False)
    nakshatrapooja_color: Optional[str] = Field(None, example="#FF6B35")  # Custom color for Nakshatrapooja
    
    # Sync tracking fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"

    @field_validator('available_from', 'available_to')
    @classmethod
    def validate_date_format(cls, v):
        """Validate that date strings are in YYYY-MM-DD format"""
        if v is not None:
            try:
                # Validate the date format
                datetime.strptime(v, '%Y-%m-%d')
            except ValueError:
                raise ValueError('Date must be in YYYY-MM-DD format')
        return v

# Used when creating a new available ritual.
class AvailableRitualCreate(AvailableRitualBase):
    pass

# Represents an available ritual object as stored in the database.
class AvailableRitualInDB(AvailableRitualBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})

# --- Schema for a single Ritual instance in a booking ---
# Defines the details of a specific ritual performed for a devotee.
class RitualInstance(BaseModel):
    ritualId: str = Field(...)
    ritualName: str = Field(...)
    devoteeName: str = Field(...)
    naal: str = Field(...)
    dob: str = Field(...)
    subscription: str = Field(...)
    quantity: int = Field(...)
    # Nakshatrapooja specific fields
    date_range_type: Optional[str] = Field(None, example="this_month")  # this_month, this_year, custom_range
    custom_range_start: Optional[str] = Field(None, example="2025-01-01")
    custom_range_end: Optional[str] = Field(None, example="2025-12-31")
    calculated_date: Optional[str] = Field(None, example="2025-10-25")  # Single date for this_month or custom_range
    calculated_dates: Optional[List[str]] = Field(None, example=["2025-01-15", "2025-02-12", "..."])  # All dates for this_year (12 months)
