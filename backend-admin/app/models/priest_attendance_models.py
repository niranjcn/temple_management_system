"""
Attendance Management Models

This module handles:
- Daily attendance tracking for admin users
- Attendance records with check-in/out times
- Attendance reports and filtering
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from bson import ObjectId


class PyObjectId(ObjectId):
    """Custom type for MongoDB ObjectId validation"""
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")


# ============= Attendance Models =============

class AttendanceRecordBase(BaseModel):
    """Base model for daily attendance record"""
    user_id: str = Field(..., description="Admin user's unique ID")
    username: str = Field(..., description="Admin username for easy reference")
    attendance_date: date = Field(..., description="Date of attendance (YYYY-MM-DD)")
    is_present: bool = Field(default=True, description="Presence status - True if present, False if absent")
    check_in_time: Optional[str] = Field(None, description="Check-in time (HH:MM format, 24-hour)")
    check_out_time: Optional[str] = Field(None, description="Check-out time (HH:MM format, 24-hour)")
    overtime_hours: Optional[float] = Field(default=0.0, ge=0, description="Overtime hours (calculated automatically)")
    outside_hours: Optional[float] = Field(default=0.0, ge=0, description="Time spent outside work zone (in hours)")
    check_in_location: Optional[dict] = Field(None, description="GPS coordinates at check-in as {lat: float, lon: float}")
    check_out_location: Optional[dict] = Field(None, description="GPS coordinates at check-out as {lat: float, lon: float}")
    notes: Optional[str] = Field(None, max_length=500, description="Additional notes for the day")


class AttendanceRecordCreate(AttendanceRecordBase):
    """Model for creating a new attendance record"""
    pass


class AttendanceRecordUpdate(BaseModel):
    """Model for updating an existing attendance record"""
    is_present: Optional[bool] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    overtime_hours: Optional[float] = Field(None, ge=0)
    outside_hours: Optional[float] = Field(None, ge=0)
    check_in_location: Optional[dict] = None
    check_out_location: Optional[dict] = None
    notes: Optional[str] = Field(None, max_length=500)


class AttendanceRecordInDB(AttendanceRecordBase):
    """Attendance record as stored in database"""
    id: str = Field(alias="_id")
    marked_by: str = Field(..., description="User ID of admin who marked this attendance")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Sync tracking fields
    synced_at: Optional[datetime] = Field(None, description="Timestamp when record was synced from mobile")
    sync_origin: Optional[str] = Field(None, description="Origin of the record: 'web' (marked via web), 'cloud' (synced from mobile app)")
    sync_device_id: Optional[str] = Field(None, description="Device ID that created/synced this record")

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str, date: lambda v: v.isoformat()}


class AttendanceRecordResponse(BaseModel):
    """Response model for attendance record with user info"""
    id: str
    user_id: str
    username: str
    user_name: str  # Full name from admin record
    attendance_date: date
    is_present: bool
    check_in_time: Optional[str]
    check_out_time: Optional[str]
    overtime_hours: float
    outside_hours: float = 0.0
    check_in_location: Optional[dict] = None
    check_out_location: Optional[dict] = None
    notes: Optional[str]
    marked_by: str
    marked_by_name: Optional[str]  # Name of person who marked
    created_at: datetime
    updated_at: datetime
    
    # Sync tracking fields
    synced_at: Optional[datetime] = None
    sync_origin: Optional[str] = None  # "web" or "cloud"
    sync_device_id: Optional[str] = None

    class Config:
        json_encoders = {date: lambda v: v.isoformat()}


# ============= Bulk Attendance Models =============

class BulkAttendanceEntry(BaseModel):
    """Single entry in bulk attendance marking"""
    user_id: str
    username: str
    is_present: bool = True
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    overtime_hours: float = 0.0
    outside_hours: float = 0.0
    check_in_location: Optional[dict] = None
    check_out_location: Optional[dict] = None
    notes: Optional[str] = None


class BulkAttendanceCreate(BaseModel):
    """Model for marking attendance for multiple users"""
    attendance_date: date
    attendances: List[BulkAttendanceEntry]


# ============= Filter & Query Models =============

class AttendanceFilter(BaseModel):
    """Model for filtering attendance records"""
    user_id: Optional[str] = None
    username: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    month: Optional[int] = Field(None, ge=1, le=12)
    year: Optional[int] = Field(None, ge=2000)
    is_present: Optional[bool] = None


# ============= Dashboard Models =============

class AttendanceDashboard(BaseModel):
    """Dashboard statistics for attendance"""
    today_present: int
    today_absent: int
    today_total: int
    current_month_total_records: int
    eligible_users_count: int  # Users with daily_salary set
    current_month: int
    current_year: int


# ============= Response Models =============

class AttendanceResponse(BaseModel):
    """Generic response for attendance operations"""
    success: bool
    message: str
    data: Optional[dict] = None


class PaginatedAttendanceResponse(BaseModel):
    """Paginated response for attendance records"""
    records: List[AttendanceRecordResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

