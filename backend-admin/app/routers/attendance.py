"""
Attendance Management Router

Endpoints for managing attendance records for admin users.
Accessible to all authenticated admin users.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from typing import List, Optional
from datetime import datetime, date, time
import math
from pydantic import BaseModel, Field

from app.models.priest_attendance_models import (
    AttendanceRecordCreate, AttendanceRecordUpdate, AttendanceRecordResponse,
    BulkAttendanceCreate, AttendanceFilter, AttendanceDashboard, 
    AttendanceResponse, PaginatedAttendanceResponse
)
from app.models.admin_models import AdminDetails
from app.database import get_database, admins_collection, attendance_records_collection
from app.services.auth_service import get_current_admin
from app.services.attendance_service import (
    calculate_overtime_hours, validate_attendance_times
)
from bson import ObjectId


# ============= Request Models =============

class EmployeeDetailsUpdate(BaseModel):
    """Model for updating employee details when enrolling in attendance"""
    address: Optional[str] = Field(None, max_length=500)
    specialization: Optional[str] = Field(None, max_length=200)
    daily_salary: float = Field(..., ge=0, description="Daily salary rate (required)")
    notes: Optional[str] = Field(None, max_length=1000)


# ============= Helper Functions =============

def date_to_datetime(d: date) -> datetime:
    """Convert date to datetime for MongoDB compatibility"""
    if isinstance(d, datetime):
        return d
    return datetime.combine(d, time.min)


router = APIRouter(prefix="/api/attendance", tags=["Attendance"])


# ============= Helper Functions =============

def attendance_helper(attendance, user_name: str = None, marked_by_name: str = None) -> dict:
    """Convert MongoDB attendance document to dict"""
    # Convert datetime back to date for API response
    attendance_date = attendance["attendance_date"]
    if isinstance(attendance_date, datetime):
        attendance_date = attendance_date.date()
    
    result = {
        "id": str(attendance["_id"]),
        "user_id": attendance["user_id"],
        "username": attendance["username"],
        "user_name": user_name or attendance.get("user_name", "Unknown"),
        "attendance_date": attendance_date,
        "is_present": attendance["is_present"],
        "check_in_time": attendance.get("check_in_time"),
        "check_out_time": attendance.get("check_out_time"),
        "overtime_hours": attendance.get("overtime_hours", 0.0),
        "outside_hours": attendance.get("outside_hours", 0.0),
        "check_in_location": attendance.get("check_in_location"),
        "check_out_location": attendance.get("check_out_location"),
        "notes": attendance.get("notes"),
        "marked_by": attendance["marked_by"],
        "marked_by_name": marked_by_name or attendance.get("marked_by_name"),
        "created_at": attendance.get("created_at", datetime.utcnow()),
        "updated_at": attendance.get("updated_at", datetime.utcnow()),
    }
    
    # Add sync tracking fields if they exist
    if "synced_at" in attendance:
        result["synced_at"] = attendance["synced_at"]
    if "sync_origin" in attendance:
        result["sync_origin"] = attendance["sync_origin"]
    if "sync_device_id" in attendance:
        result["sync_device_id"] = attendance["sync_device_id"]
    
    return result


async def get_user_name(user_id: str, db) -> str:
    """Get user's full name from admins collection"""
    try:
        admin = await db.admins.find_one({"_id": ObjectId(user_id)})
        return admin["name"] if admin else "Unknown"
    except:
        return "Unknown"


# ============= Attendance Marking Endpoints =============

@router.post("/mark", response_model=AttendanceRecordResponse, status_code=status.HTTP_201_CREATED)
async def mark_attendance(
    attendance: AttendanceRecordCreate,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Mark attendance for a single user"""
    
    # Validate user exists
    if not ObjectId.is_valid(attendance.user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID"
        )
    
    user = await db.admins.find_one({"_id": ObjectId(attendance.user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Validate username matches
    if user.get("username") != attendance.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username does not match user ID"
        )
    
    # Validate time formats
    is_valid, error = validate_attendance_times(
        attendance.check_in_time,
        attendance.check_out_time
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    # Check if attendance already marked for this date
    # Convert date to datetime for MongoDB query
    attendance_datetime = date_to_datetime(attendance.attendance_date)
    
    existing = await db.attendance_records.find_one({
        "user_id": attendance.user_id,
        "attendance_date": attendance_datetime
    })
    
    # If record exists and we have check_out_time, update the existing record (check-out scenario)
    if existing and attendance.check_out_time:
        # Calculate overtime hours
        overtime_hours = calculate_overtime_hours(
            existing.get("check_in_time") or attendance.check_in_time,
            attendance.check_out_time
        )
        
        # Prepare update data
        update_data = {
            "check_out_time": attendance.check_out_time,
            "check_out_location": attendance.check_out_location,
            "overtime_hours": overtime_hours,
            "outside_hours": attendance.outside_hours or existing.get("outside_hours", 0.0),
            "updated_at": datetime.utcnow(),
        }
        
        # Update sync tracking if GPS data present
        if attendance.check_out_location:
            update_data["synced_at"] = datetime.utcnow()
            update_data["sync_origin"] = "cloud"
        
        # Update the record
        await db.attendance_records.update_one(
            {"_id": existing["_id"]},
            {"$set": update_data}
        )
        
        # Get the updated record
        updated_record = await db.attendance_records.find_one({"_id": existing["_id"]})
        user_name = user["name"]
        marked_by_name = current_user["name"]
        
        return attendance_helper(updated_record, user_name, marked_by_name)
    
    # If record exists but no check_out_time, it's a duplicate check-in
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance already marked for {user['name']} on {attendance.attendance_date}"
        )
    
    # Calculate overtime hours automatically
    overtime_hours = calculate_overtime_hours(
        attendance.check_in_time,
        attendance.check_out_time
    )
    
    # Create attendance record
    attendance_dict = attendance.dict()
    # Convert date to datetime for MongoDB
    attendance_dict["attendance_date"] = attendance_datetime
    attendance_dict["overtime_hours"] = overtime_hours
    attendance_dict["outside_hours"] = attendance.outside_hours or 0.0
    attendance_dict["check_in_location"] = attendance.check_in_location
    attendance_dict["check_out_location"] = attendance.check_out_location
    attendance_dict["marked_by"] = str(current_user["_id"])
    attendance_dict["created_at"] = datetime.utcnow()
    attendance_dict["updated_at"] = datetime.utcnow()
    
    # Determine sync origin based on presence of GPS location data
    # If check_in_location or check_out_location exists, it's from mobile app (cloud sync)
    has_gps_data = attendance.check_in_location is not None or attendance.check_out_location is not None
    
    # Add sync tracking fields
    attendance_dict["synced_at"] = datetime.utcnow() if has_gps_data else None
    attendance_dict["sync_origin"] = "cloud" if has_gps_data else "web"
    attendance_dict["sync_device_id"] = None  # Can be added later if needed
    
    result = await db.attendance_records.insert_one(attendance_dict)
    created_record = await db.attendance_records.find_one({"_id": result.inserted_id})
    
    user_name = user["name"]
    marked_by_name = current_user["name"]
    
    return attendance_helper(created_record, user_name, marked_by_name)


@router.post("/mark-bulk", response_model=AttendanceResponse)
async def mark_bulk_attendance(
    bulk_data: BulkAttendanceCreate,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Mark attendance for multiple users at once"""
    
    if not bulk_data.attendances:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No attendance entries provided"
        )
    
    success_count = 0
    error_count = 0
    errors = []
    
    # Convert date to datetime once for all entries
    attendance_datetime = date_to_datetime(bulk_data.attendance_date)
    
    for entry in bulk_data.attendances:
        try:
            # Validate user exists
            if not ObjectId.is_valid(entry.user_id):
                errors.append(f"Invalid user ID: {entry.user_id}")
                error_count += 1
                continue
            
            user = await db.admins.find_one({"_id": ObjectId(entry.user_id)})
            if not user:
                errors.append(f"User not found: {entry.username}")
                error_count += 1
                continue
            
            # Validate time formats
            is_valid, error = validate_attendance_times(
                entry.check_in_time,
                entry.check_out_time
            )
            if not is_valid:
                errors.append(f"{entry.username}: {error}")
                error_count += 1
                continue
            
            # Check if already marked
            existing = await db.attendance_records.find_one({
                "user_id": entry.user_id,
                "attendance_date": attendance_datetime
            })
            
            if existing:
                errors.append(f"Already marked: {entry.username}")
                error_count += 1
                continue
            
            # Calculate overtime
            overtime_hours = calculate_overtime_hours(
                entry.check_in_time,
                entry.check_out_time
            )
            
            # Determine sync origin based on GPS data
            has_gps_data = entry.check_in_location is not None or entry.check_out_location is not None
            
            # Create record (use datetime instead of date for MongoDB)
            attendance_dict = {
                "user_id": entry.user_id,
                "username": entry.username,
                "attendance_date": attendance_datetime,
                "is_present": entry.is_present,
                "check_in_time": entry.check_in_time,
                "check_out_time": entry.check_out_time,
                "overtime_hours": overtime_hours,
                "outside_hours": entry.outside_hours or 0.0,
                "check_in_location": entry.check_in_location,
                "check_out_location": entry.check_out_location,
                "notes": entry.notes,
                "marked_by": str(current_user["_id"]),
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                # Sync tracking fields
                "synced_at": datetime.utcnow() if has_gps_data else None,
                "sync_origin": "cloud" if has_gps_data else "web",
                "sync_device_id": None
            }
            
            await db.attendance_records.insert_one(attendance_dict)
            success_count += 1
            
        except Exception as e:
            errors.append(f"{entry.username}: {str(e)}")
            error_count += 1
    
    return {
        "success": error_count == 0,
        "message": f"Successfully marked {success_count} attendance(s). {error_count} error(s).",
        "data": {
            "success_count": success_count,
            "error_count": error_count,
            "errors": errors if errors else None
        }
    }


# ============= Attendance Query Endpoints =============

@router.get("/records", response_model=PaginatedAttendanceResponse)
async def get_attendance_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user_id: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000),
    is_present: Optional[bool] = Query(None),
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Get attendance records with filtering and pagination"""
    
    query = {}
    
    # Build query filters
    if user_id:
        query["user_id"] = user_id
    
    if username:
        query["username"] = {"$regex": username, "$options": "i"}
    
    # Date filtering
    if month and year:
        # Get all records for specific month
        from calendar import monthrange
        _, last_day = monthrange(year, month)
        start_date = date(year, month, 1)
        end_date = date(year, month, last_day)
    
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = date_to_datetime(start_date)
        if end_date:
            date_query["$lte"] = date_to_datetime(end_date)
        query["attendance_date"] = date_query
    
    if is_present is not None:
        query["is_present"] = is_present
    
    # Get total count
    total = await db.attendance_records.count_documents(query)
    
    # Get paginated results
    skip = (page - 1) * page_size
    cursor = db.attendance_records.find(query).sort("attendance_date", -1).skip(skip).limit(page_size)
    records = await cursor.to_list(length=page_size)
    
    # Enrich records with user names
    enriched_records = []
    for record in records:
        user_name = await get_user_name(record["user_id"], db)
        marked_by_name = await get_user_name(record["marked_by"], db)
        enriched_records.append(
            attendance_helper(record, user_name, marked_by_name)
        )
    
    return {
        "records": enriched_records,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 0
    }


@router.get("/records/{attendance_id}", response_model=AttendanceRecordResponse)
async def get_attendance_record(
    attendance_id: str,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Get a specific attendance record by ID"""
    
    if not ObjectId.is_valid(attendance_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid attendance record ID"
        )
    
    record = await db.attendance_records.find_one({"_id": ObjectId(attendance_id)})
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance record not found"
        )
    
    user_name = await get_user_name(record["user_id"], db)
    marked_by_name = await get_user_name(record["marked_by"], db)
    
    return attendance_helper(record, user_name, marked_by_name)


@router.put("/records/{attendance_id}", response_model=AttendanceRecordResponse)
async def update_attendance(
    attendance_id: str,
    attendance_update: AttendanceRecordUpdate,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Update an existing attendance record"""
    
    if not ObjectId.is_valid(attendance_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid attendance record ID"
        )
    
    existing_record = await db.attendance_records.find_one({"_id": ObjectId(attendance_id)})
    if not existing_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance record not found"
        )
    
    # Validate time formats if provided
    update_data = attendance_update.dict(exclude_unset=True)
    
    if "check_in_time" in update_data or "check_out_time" in update_data:
        check_in = update_data.get("check_in_time", existing_record.get("check_in_time"))
        check_out = update_data.get("check_out_time", existing_record.get("check_out_time"))
        
        is_valid, error = validate_attendance_times(check_in, check_out)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )
        
        # Recalculate overtime if times changed
        overtime_hours = calculate_overtime_hours(check_in, check_out)
        update_data["overtime_hours"] = overtime_hours
    
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await db.attendance_records.update_one(
            {"_id": ObjectId(attendance_id)},
            {"$set": update_data}
        )
    
    updated_record = await db.attendance_records.find_one({"_id": ObjectId(attendance_id)})
    user_name = await get_user_name(updated_record["user_id"], db)
    marked_by_name = await get_user_name(updated_record["marked_by"], db)
    
    return attendance_helper(updated_record, user_name, marked_by_name)


@router.delete("/records/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attendance(
    attendance_id: str,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Delete an attendance record"""
    
    if not ObjectId.is_valid(attendance_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid attendance record ID"
        )
    
    result = await db.attendance_records.delete_one({"_id": ObjectId(attendance_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance record not found"
        )


# ============= Dashboard Endpoint =============

@router.get("/dashboard", response_model=AttendanceDashboard)
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Get attendance dashboard statistics"""
    
    today = date.today()
    current_month = today.month
    current_year = today.year
    
    # Convert today to datetime for MongoDB query
    today_datetime = date_to_datetime(today)
    
    # Today's stats
    today_present = await db.attendance_records.count_documents({
        "attendance_date": today_datetime,
        "is_present": True
    })
    
    today_absent = await db.attendance_records.count_documents({
        "attendance_date": today_datetime,
        "is_present": False
    })
    
    today_total = today_present + today_absent
    
    # Current month stats
    from calendar import monthrange
    _, last_day = monthrange(current_year, current_month)
    month_start = date_to_datetime(date(current_year, current_month, 1))
    month_end = date_to_datetime(date(current_year, current_month, last_day))
    
    current_month_total = await db.attendance_records.count_documents({
        "attendance_date": {
            "$gte": month_start,
            "$lte": month_end
        }
    })
    
    # Count users with daily_salary set (eligible for attendance tracking)
    eligible_users = await db.admins.count_documents({
        "details.daily_salary": {"$exists": True, "$ne": None}
    })
    
    return {
        "today_present": today_present,
        "today_absent": today_absent,
        "today_total": today_total,
        "current_month_total_records": current_month_total,
        "eligible_users_count": eligible_users,
        "current_month": current_month,
        "current_year": current_year
    }


# ============= Admin Management Endpoints for Attendance =============

@router.get("/users", response_model=List[dict])
async def get_eligible_users(
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Get all admin users eligible for attendance tracking (with isAttendance=True)"""
    
    # Get all admins with isAttendance set to True
    cursor = db.admins.find({"isAttendance": True}).sort("name", 1)
    admins = await cursor.to_list(length=None)
    
    result = []
    for admin in admins:
        details = admin.get("details", {})
        result.append({
            "id": str(admin["_id"]),
            "username": admin["username"],
            "name": admin["name"],
            "email": admin.get("email"),
            "role": admin.get("role"),
            "isAttendance": admin.get("isAttendance", False),
            "has_salary_configured": bool(details.get("daily_salary")),
            "daily_salary": details.get("daily_salary"),
            "address": details.get("address"),
            "specialization": details.get("specialization"),
            "notes": details.get("notes")
        })
    
    return result


@router.post("/users/{user_id}/toggle-attendance", response_model=AttendanceResponse)
async def toggle_user_attendance(
    user_id: str,
    employee_details: Optional[EmployeeDetailsUpdate] = Body(None),
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Toggle isAttendance flag for a user (Admin/Super Admin only)
    
    When enrolling (turning on), employee_details with salary is required.
    When removing (turning off), employee_details is ignored.
    """
    
    # Check if current user is admin (role_id: 1) or super admin (role_id: 0)
    current_role_id = current_user.get("role_id")
    if current_role_id not in [0, 1]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and super admins can manage employee attendance enrollment"
        )
    
    # Validate user ID
    if not ObjectId.is_valid(user_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID"
        )
    
    # Get the user
    user = await db.admins.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Regular admins (role_id: 1) can only manage users below their role level
    if current_role_id == 1:
        user_role_id = user.get("role_id")
        if user_role_id in [0, 1]:  # Cannot manage super admins or other admins
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admins cannot manage other admins or super admins"
            )
    
    # Toggle the isAttendance flag
    current_status = user.get("isAttendance", False)
    new_status = not current_status
    
    # Prepare update data
    update_data = {
        "isAttendance": new_status,
        "updated_at": datetime.utcnow(),
        "updated_by": current_user.get("username", "system")
    }
    
    # If enrolling (turning on attendance), update details if provided
    if new_status and employee_details:
        details_dict = {
            "address": employee_details.address,
            "specialization": employee_details.specialization,
            "daily_salary": employee_details.daily_salary,
            "notes": employee_details.notes
        }
        update_data["details"] = details_dict
    
    await db.admins.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": update_data}
    )
    
    action = "enrolled in" if new_status else "removed from"
    return {
        "success": True,
        "message": f"{user['name']} has been {action} attendance tracking",
        "data": {
            "user_id": user_id,
            "username": user["username"],
            "name": user["name"],
            "isAttendance": new_status
        }
    }


@router.get("/employees", response_model=List[dict])
async def get_all_employees(
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Get all users that can be enrolled for attendance (filtered by role for regular admins)"""
    
    current_role_id = current_user.get("role_id")
    
    # Check if current user is admin (role_id: 1) or super admin (role_id: 0)
    if current_role_id not in [0, 1]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and super admins can access employee management"
        )
    
    # Build query based on role
    query = {}
    if current_role_id == 1:  # Regular admin
        # Admins can only see users who are not admin or super admin (role_id not 0 or 1)
        query["role_id"] = {"$nin": [0, 1]}
    
    # Get all admins matching the query
    cursor = db.admins.find(query).sort("name", 1)
    admins = await cursor.to_list(length=None)
    
    result = []
    for admin in admins:
        details = admin.get("details") or {}
        result.append({
            "id": str(admin["_id"]),
            "username": admin["username"],
            "name": admin["name"],
            "email": admin.get("email"),
            "role": admin.get("role"),
            "role_id": admin.get("role_id"),
            "isAttendance": admin.get("isAttendance", False),
            "has_salary_configured": bool(details.get("daily_salary")),
            "daily_salary": details.get("daily_salary"),
            "address": details.get("address"),
            "specialization": details.get("specialization"),
            "mobile_number": admin.get("mobile_number"),
            "mobile_prefix": admin.get("mobile_prefix"),
            "created_at": admin.get("created_at")
        })
    
    return result


@router.get("/report", response_model=List[dict])
async def get_attendance_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000),
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Get attendance report for all users enrolled in attendance tracking"""
    
    # Build date filter
    date_query = {}
    
    if month and year:
        # Get all records for specific month
        from calendar import monthrange
        _, last_day = monthrange(year, month)
        start_date = date(year, month, 1)
        end_date = date(year, month, last_day)
    
    if start_date or end_date:
        if start_date:
            date_query["$gte"] = date_to_datetime(start_date)
        if end_date:
            date_query["$lte"] = date_to_datetime(end_date)
    else:
        # Default to current month if no dates provided
        today = date.today()
        from calendar import monthrange
        _, last_day = monthrange(today.year, today.month)
        date_query["$gte"] = date_to_datetime(date(today.year, today.month, 1))
        date_query["$lte"] = date_to_datetime(date(today.year, today.month, last_day))
    
    # Get all users with isAttendance=True
    cursor = db.admins.find({"isAttendance": True}).sort("name", 1)
    users = await cursor.to_list(length=None)
    
    report = []
    
    for user in users:
        user_id = str(user["_id"])
        
        # Get attendance records for this user in date range
        attendance_query = {
            "user_id": user_id,
            "attendance_date": date_query
        }
        
        records_cursor = db.attendance_records.find(attendance_query)
        records = await records_cursor.to_list(length=None)
        
        # Calculate statistics
        total_records = len(records)
        present_count = sum(1 for r in records if r.get("is_present", False))
        absent_count = total_records - present_count
        total_overtime = sum(r.get("overtime_hours", 0.0) for r in records)
        
        # Calculate working days in range
        if date_query:
            start = date_query.get("$gte", datetime.now()).date() if isinstance(date_query.get("$gte"), datetime) else date_query.get("$gte")
            end = date_query.get("$lte", datetime.now()).date() if isinstance(date_query.get("$lte"), datetime) else date_query.get("$lte")
            working_days = (end - start).days + 1
        else:
            working_days = 0
        
        attendance_percentage = (present_count / working_days * 100) if working_days > 0 else 0
        
        # Get salary info
        details = user.get("details", {})
        daily_salary = details.get("daily_salary", 0.0)
        total_salary = present_count * daily_salary if daily_salary else 0.0
        
        report.append({
            "user_id": user_id,
            "username": user["username"],
            "name": user["name"],
            "role": user.get("role"),
            "email": user.get("email"),
            "specialization": details.get("specialization"),
            "daily_salary": daily_salary,
            "total_days_marked": total_records,
            "days_present": present_count,
            "days_absent": absent_count,
            "total_overtime_hours": round(total_overtime, 2),
            "working_days_in_period": working_days,
            "attendance_percentage": round(attendance_percentage, 2),
            "total_salary": round(total_salary, 2)
        })
    
    return report


