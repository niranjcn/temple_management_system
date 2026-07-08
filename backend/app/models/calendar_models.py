from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field, field_validator
from datetime import datetime, date


class CalendarDayBase(BaseModel):
    dateISO: str = Field(..., description="YYYY-MM-DD")
    year: int
    month: int
    day: int
    weekday: int = Field(..., ge=0, le=6)
    malayalam_year: Optional[Union[int, str]] = None
    naal: Optional[str] = Field(default=None, max_length=256)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    updated_by: Optional[str] = None
    version: int = 0
    schema_version: int = 1
    
    # Sync tracking fields
    synced_at: Optional[datetime] = Field(None)
    sync_origin: Optional[str] = Field(default="local")  # "local" or "remote"
    sync_status: Optional[str] = Field(default="pending")  # "synced", "pending", "conflict"

    @field_validator("dateISO")
    @classmethod
    def validate_dateiso(cls, v: str):
        try:
            # Ensures YYYY-MM-DD
            date.fromisoformat(v)
        except Exception:
            raise ValueError("dateISO must be in YYYY-MM-DD format")
        return v


class CalendarDayCreate(BaseModel):
    dateISO: str
    malayalam_year: Optional[Union[int, str]] = None
    naal: Optional[str] = Field(default=None, max_length=256)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CalendarDayUpdateNaal(BaseModel):
    date: str
    naal: Optional[str] = Field(default=None, max_length=256)
    version: Optional[int] = None


class PrepopulateRequest(BaseModel):
    year: int


class AssignMalayalamYearRangeRequest(BaseModel):
    start_date: str
    end_date: str
    malayalam_year: Union[int, str]
    dryRun: bool = False


class CalendarDayPublic(BaseModel):
    dateISO: str
    year: int
    month: int
    day: int
    weekday: int
    malayalam_year: Optional[Union[int, str]] = None
    naal: Optional[str] = None
    metadata: Dict[str, Any]
    updated_at: datetime
    updated_by: Optional[str] = None
    created_at: datetime
    version: int


class MonthResponse(BaseModel):
    days: List[CalendarDayPublic]
    lastModified: datetime


class CalendarAuditEntry(BaseModel):
    dateISO: str
    op: str
    before: Optional[Dict[str, Any]]
    after: Optional[Dict[str, Any]]
    changed_by: str
    timestamp: datetime
    operation_id: str
