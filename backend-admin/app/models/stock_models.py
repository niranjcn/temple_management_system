from datetime import date, datetime
from typing import Optional, Union
from pydantic import BaseModel, Field, ConfigDict, field_validator
from bson import ObjectId

class StockItemBase(BaseModel):
    name: str
    category: str
    quantity: int
    unit: str
    price: float
    supplier: Optional[str] = None
    expiryDate: Optional[Union[date, datetime]] = None
    minimumStock: int = 10
    description: Optional[str] = None
    addedOn: Union[date, datetime]
    
    # Sync tracking fields
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"

    @field_validator('expiryDate', mode='before')
    @classmethod
    def validate_expiry_date(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00')).date()
            except ValueError:
                return datetime.strptime(v, '%Y-%m-%d').date()
        return v

    @field_validator('addedOn', mode='before')
    @classmethod
    def validate_added_on(cls, v):
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00')).date()
            except ValueError:
                return datetime.strptime(v, '%Y-%m-%d').date()
        return v

class StockItemCreate(StockItemBase):
    pass

class StockItemUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[int] = None
    unit: Optional[str] = None
    price: Optional[float] = None
    supplier: Optional[str] = None
    expiryDate: Optional[Union[date, datetime]] = None
    minimumStock: Optional[int] = None
    description: Optional[str] = None
    addedOn: Optional[Union[date, datetime]] = None

    @field_validator('expiryDate', mode='before')
    @classmethod
    def validate_expiry_date(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00')).date()
            except ValueError:
                return datetime.strptime(v, '%Y-%m-%d').date()
        return v

    @field_validator('addedOn', mode='before')
    @classmethod
    def validate_added_on(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00')).date()
            except ValueError:
                return datetime.strptime(v, '%Y-%m-%d').date()
        return v

class StockItemInDB(StockItemBase):
    id: str = Field(alias="_id")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={
            ObjectId: str,
            date: lambda v: v.isoformat(),
            datetime: lambda v: v.isoformat(),
        },
    )

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_object_id(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        return str(v)

    @field_validator('expiryDate', mode='before')
    @classmethod
    def validate_expiry_date(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00')).date()
            except ValueError:
                return datetime.strptime(v, '%Y-%m-%d').date()
        return v

    @field_validator('addedOn', mode='before')
    @classmethod
    def validate_added_on(cls, v):
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00')).date()
            except ValueError:
                return datetime.strptime(v, '%Y-%m-%d').date()
        return v