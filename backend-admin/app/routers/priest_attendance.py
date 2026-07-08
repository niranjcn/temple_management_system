"""
Priest Attendance Management Router

Endpoints for managing priests, marking attendance, and generating salary reports.
Accessible to all authenticated admin users.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from datetime import datetime, date
from calendar import monthrange
import math

from app.models.priest_attendance_models import (
    PriestCreate, PriestUpdate, PriestResponse, PriestInDB,
    AttendanceRecordCreate, AttendanceRecordUpdate, AttendanceRecordResponse,
    BulkAttendanceCreate, MonthlyReport, MonthlyAttendanceStats,
    AttendanceFilter, AttendanceDashboard, AttendanceResponse,
    PaginatedPriestResponse, PaginatedAttendanceResponse
)
from app.database import get_database
from app.services.auth_service import get_current_admin
from bson import ObjectId

router = APIRouter(prefix="/api/priest-attendance", tags=["Priest Attendance"])


# ============= Helper Functions =============

def priest_helper(priest) -> dict:
    """Convert MongoDB priest document to dict"""
    return {
        "id": str(priest["_id"]),
        "name": priest["name"],
        "phone": priest.get("phone"),
        "email": priest.get("email"),
        "daily_salary": priest["daily_salary"],
        "address": priest.get("address"),
        "specialization": priest.get("specialization"),
        "is_active": priest.get("is_active", True),
        "notes": priest.get("notes"),
        "created_at": priest.get("created_at", datetime.utcnow()),
        "updated_at": priest.get("updated_at", datetime.utcnow()),
    }


def attendance_helper(attendance, priest_name: str = None) -> dict:
    """Convert MongoDB attendance document to dict"""
    return {
        "id": str(attendance["_id"]),
        "priest_id": attendance["priest_id"],
        "priest_name": priest_name or attendance.get("priest_name", "Unknown"),
        "attendance_date": attendance["attendance_date"],
        "is_present": attendance["is_present"],
        "check_in_time": attendance.get("check_in_time"),
        "check_out_time": attendance.get("check_out_time"),
        "half_day": attendance.get("half_day", False),
        "overtime_hours": attendance.get("overtime_hours", 0.0),
        "daily_salary": attendance["daily_salary"],
        "calculated_salary": attendance["calculated_salary"],
        "notes": attendance.get("notes"),
        "marked_by": attendance["marked_by"],
        "created_at": attendance.get("created_at", datetime.utcnow()),
        "updated_at": attendance.get("updated_at", datetime.utcnow()),
    }


def calculate_daily_salary(daily_salary: float, is_present: bool, half_day: bool, overtime_hours: float = 0) -> float:
    """Calculate salary for a single day"""
    if not is_present:
        return 0.0
    
    base_salary = daily_salary / 2 if half_day else daily_salary
    overtime_pay = (daily_salary / 8) * overtime_hours  # Assuming 8-hour workday
    
    return round(base_salary + overtime_pay, 2)


# ============= Priest Management Endpoints =============

@router.post("/priests", response_model=PriestResponse, status_code=status.HTTP_201_CREATED)
async def create_priest(
    priest: PriestCreate,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Create a new priest record"""
    
    # Check if priest with same name already exists
    existing = await db.priests.find_one({"name": priest.name, "is_active": True})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Priest with name '{priest.name}' already exists"
        )
    
    priest_dict = priest.dict()
    priest_dict["created_at"] = datetime.utcnow()
    priest_dict["updated_at"] = datetime.utcnow()
    
    result = await db.priests.insert_one(priest_dict)
    created_priest = await db.priests.find_one({"_id": result.inserted_id})
    
    return priest_helper(created_priest)


@router.get("/priests", response_model=PaginatedPriestResponse)
async def get_priests(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Get all priests with pagination and filtering"""
    
    query = {}
    if is_active is not None:
        query["is_active"] = is_active
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"specialization": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    
    # Get total count
    total = await db.priests.count_documents(query)
    
    # Get paginated results
    skip = (page - 1) * page_size
    cursor = db.priests.find(query).sort("name", 1).skip(skip).limit(page_size)
    priests = await cursor.to_list(length=page_size)
    
    # Calculate attendance stats for current month
    current_date = datetime.utcnow()
    month_start = datetime(current_date.year, current_date.month, 1)
    
    priests_with_stats = []
    for priest in priests:
        priest_data = priest_helper(priest)
        
        # Get current month attendance
        attendance_count = await db.attendance.count_documents({
            "priest_id": str(priest["_id"]),
            "attendance_date": {"$gte": month_start},
            "is_present": True
        })
        
        # Calculate current month salary
        month_records = await db.attendance.find({
            "priest_id": str(priest["_id"]),
            "attendance_date": {"$gte": month_start}
        }).to_list(length=None)
        
        current_month_salary = sum(record.get("calculated_salary", 0) for record in month_records)
        
        priest_data["current_month_days"] = attendance_count
        priest_data["current_month_salary"] = current_month_salary
        
        priests_with_stats.append(priest_data)
    
    return {
        "priests": priests_with_stats,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size)
    }


@router.get("/priests/{priest_id}", response_model=PriestResponse)
async def get_priest(
    priest_id: str,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Get a specific priest by ID"""
    
    if not ObjectId.is_valid(priest_id):
        raise HTTPException(status_code=400, detail="Invalid priest ID")
    
    priest = await db.priests.find_one({"_id": ObjectId(priest_id)})
    if not priest:
        raise HTTPException(status_code=404, detail="Priest not found")
    
    priest_data = priest_helper(priest)
    
    # Get total days worked
    total_days = await db.attendance.count_documents({
        "priest_id": priest_id,
        "is_present": True
    })
    priest_data["total_days_worked"] = total_days
    
    return priest_data


@router.put("/priests/{priest_id}", response_model=PriestResponse)
async def update_priest(
    priest_id: str,
    priest_update: PriestUpdate,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Update priest information"""
    
    if not ObjectId.is_valid(priest_id):
        raise HTTPException(status_code=400, detail="Invalid priest ID")
    
    existing_priest = await db.priests.find_one({"_id": ObjectId(priest_id)})
    if not existing_priest:
        raise HTTPException(status_code=404, detail="Priest not found")
    
    update_data = {k: v for k, v in priest_update.dict(exclude_unset=True).items() if v is not None}
    
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        await db.priests.update_one(
            {"_id": ObjectId(priest_id)},
            {"$set": update_data}
        )
    
    updated_priest = await db.priests.find_one({"_id": ObjectId(priest_id)})
    return priest_helper(updated_priest)


@router.delete("/priests/{priest_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_priest(
    priest_id: str,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Soft delete a priest (set is_active to False)"""
    
    if not ObjectId.is_valid(priest_id):
        raise HTTPException(status_code=400, detail="Invalid priest ID")
    
    result = await db.priests.update_one(
        {"_id": ObjectId(priest_id)},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Priest not found")


# ============= Attendance Marking Endpoints =============

@router.post("/attendance", response_model=AttendanceRecordResponse, status_code=status.HTTP_201_CREATED)
async def mark_attendance(
    attendance: AttendanceRecordCreate,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Mark attendance for a priest on a specific date"""
    
    # Validate priest exists
    if not ObjectId.is_valid(attendance.priest_id):
        raise HTTPException(status_code=400, detail="Invalid priest ID")
    
    priest = await db.priests.find_one({"_id": ObjectId(attendance.priest_id)})
    if not priest:
        raise HTTPException(status_code=404, detail="Priest not found")
    
    # Convert date to datetime for MongoDB comparison
    attendance_datetime = attendance.attendance_date
    if isinstance(attendance_datetime, date) and not isinstance(attendance_datetime, datetime):
        attendance_datetime = datetime.combine(attendance_datetime, datetime.min.time())
    
    # Check if attendance already marked for this date
    existing = await db.attendance.find_one({
        "priest_id": attendance.priest_id,
        "attendance_date": attendance_datetime
    })
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Attendance already marked for {priest['name']} on {attendance.attendance_date}"
        )
    
    # Calculate salary
    calculated_salary = calculate_daily_salary(
        priest["daily_salary"],
        attendance.is_present,
        attendance.half_day,
        attendance.overtime_hours
    )
    
    attendance_dict = attendance.dict()
    # Convert date to datetime for MongoDB
    if isinstance(attendance_dict["attendance_date"], date) and not isinstance(attendance_dict["attendance_date"], datetime):
        attendance_dict["attendance_date"] = datetime.combine(attendance_dict["attendance_date"], datetime.min.time())
    
    attendance_dict.update({
        "marked_by": current_user.get("id", "unknown"),
        "daily_salary": priest["daily_salary"],
        "calculated_salary": calculated_salary,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    })
    
    result = await db.attendance.insert_one(attendance_dict)
    created_attendance = await db.attendance.find_one({"_id": result.inserted_id})
    
    return attendance_helper(created_attendance, priest["name"])


@router.post("/attendance/bulk", response_model=AttendanceResponse)
async def mark_bulk_attendance(
    bulk_data: BulkAttendanceCreate,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Mark attendance for multiple priests on the same date"""
    
    marked_count = 0
    errors = []
    
    # Convert date to datetime for MongoDB
    attendance_datetime = bulk_data.attendance_date
    if isinstance(attendance_datetime, date) and not isinstance(attendance_datetime, datetime):
        attendance_datetime = datetime.combine(attendance_datetime, datetime.min.time())
    
    for entry in bulk_data.attendances:
        try:
            # Validate priest
            if not ObjectId.is_valid(entry.priest_id):
                errors.append(f"Invalid priest ID: {entry.priest_id}")
                continue
            
            priest = await db.priests.find_one({"_id": ObjectId(entry.priest_id)})
            if not priest:
                errors.append(f"Priest not found: {entry.priest_id}")
                continue
            
            # Check if already marked
            existing = await db.attendance.find_one({
                "priest_id": entry.priest_id,
                "attendance_date": attendance_datetime
            })
            
            if existing:
                errors.append(f"Attendance already marked for {priest['name']}")
                continue
            
            # Calculate and insert
            calculated_salary = calculate_daily_salary(
                priest["daily_salary"],
                entry.is_present,
                entry.half_day,
                entry.overtime_hours
            )
            
            attendance_dict = {
                "priest_id": entry.priest_id,
                "attendance_date": attendance_datetime,
                "is_present": entry.is_present,
                "check_in_time": entry.check_in_time,
                "check_out_time": entry.check_out_time,
                "half_day": entry.half_day,
                "overtime_hours": entry.overtime_hours,
                "notes": entry.notes,
                "marked_by": current_user.get("id", "unknown"),
                "daily_salary": priest["daily_salary"],
                "calculated_salary": calculated_salary,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            await db.attendance.insert_one(attendance_dict)
            marked_count += 1
            
        except Exception as e:
            errors.append(f"Error marking attendance: {str(e)}")
    
    return {
        "success": marked_count > 0,
        "message": f"Marked attendance for {marked_count} priest(s)",
        "data": {"marked_count": marked_count, "errors": errors}
    }


@router.get("/attendance", response_model=PaginatedAttendanceResponse)
async def get_attendance_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    priest_id: Optional[str] = Query(None),
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
    
    if priest_id:
        query["priest_id"] = priest_id
    
    # Date filtering
    if month and year:
        month_start = datetime(year, month, 1)
        _, last_day = monthrange(year, month)
        month_end = datetime(year, month, last_day, 23, 59, 59)
        query["attendance_date"] = {"$gte": month_start, "$lte": month_end}
    elif start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = datetime.combine(start_date, datetime.min.time())
        if end_date:
            date_query["$lte"] = datetime.combine(end_date, datetime.max.time())
        query["attendance_date"] = date_query
    
    if is_present is not None:
        query["is_present"] = is_present
    
    # Get total count
    total = await db.attendance.count_documents(query)
    
    # Get paginated results
    skip = (page - 1) * page_size
    cursor = db.attendance.find(query).sort("attendance_date", -1).skip(skip).limit(page_size)
    records = await cursor.to_list(length=page_size)
    
    # Fetch priest names
    priest_ids = list(set(record["priest_id"] for record in records))
    priests = await db.priests.find({"_id": {"$in": [ObjectId(pid) for pid in priest_ids if ObjectId.is_valid(pid)]}}).to_list(length=None)
    priest_names = {str(p["_id"]): p["name"] for p in priests}
    
    records_with_names = [
        attendance_helper(record, priest_names.get(record["priest_id"], "Unknown"))
        for record in records
    ]
    
    return {
        "records": records_with_names,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size)
    }


@router.get("/attendance/{attendance_id}", response_model=AttendanceRecordResponse)
async def get_attendance_record(
    attendance_id: str,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Get a specific attendance record"""
    
    if not ObjectId.is_valid(attendance_id):
        raise HTTPException(status_code=400, detail="Invalid attendance ID")
    
    record = await db.attendance.find_one({"_id": ObjectId(attendance_id)})
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    
    priest = await db.priests.find_one({"_id": ObjectId(record["priest_id"])})
    priest_name = priest["name"] if priest else "Unknown"
    
    return attendance_helper(record, priest_name)


@router.put("/attendance/{attendance_id}", response_model=AttendanceRecordResponse)
async def update_attendance(
    attendance_id: str,
    attendance_update: AttendanceRecordUpdate,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Update an attendance record"""
    
    if not ObjectId.is_valid(attendance_id):
        raise HTTPException(status_code=400, detail="Invalid attendance ID")
    
    existing = await db.attendance.find_one({"_id": ObjectId(attendance_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    
    update_data = {k: v for k, v in attendance_update.dict(exclude_unset=True).items() if v is not None}
    
    if update_data:
        # Recalculate salary if relevant fields changed
        if any(key in update_data for key in ["is_present", "half_day", "overtime_hours"]):
            is_present = update_data.get("is_present", existing["is_present"])
            half_day = update_data.get("half_day", existing.get("half_day", False))
            overtime = update_data.get("overtime_hours", existing.get("overtime_hours", 0))
            
            update_data["calculated_salary"] = calculate_daily_salary(
                existing["daily_salary"],
                is_present,
                half_day,
                overtime
            )
        
        update_data["updated_at"] = datetime.utcnow()
        await db.attendance.update_one(
            {"_id": ObjectId(attendance_id)},
            {"$set": update_data}
        )
    
    updated_record = await db.attendance.find_one({"_id": ObjectId(attendance_id)})
    priest = await db.priests.find_one({"_id": ObjectId(updated_record["priest_id"])})
    
    return attendance_helper(updated_record, priest["name"] if priest else "Unknown")


@router.delete("/attendance/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attendance(
    attendance_id: str,
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Delete an attendance record"""
    
    if not ObjectId.is_valid(attendance_id):
        raise HTTPException(status_code=400, detail="Invalid attendance ID")
    
    result = await db.attendance.delete_one({"_id": ObjectId(attendance_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Attendance record not found")


# ============= Reports Endpoints =============

@router.get("/reports/monthly", response_model=MonthlyReport)
async def get_monthly_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000),
    priest_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Generate monthly attendance and salary report"""
    
    # Calculate date range
    month_start = datetime(year, month, 1)
    _, last_day = monthrange(year, month)
    month_end = datetime(year, month, last_day, 23, 59, 59)
    
    # Build query
    query = {
        "attendance_date": {"$gte": month_start, "$lte": month_end}
    }
    
    if priest_id:
        query["priest_id"] = priest_id
    
    # Get all attendance records for the month
    records = await db.attendance.find(query).to_list(length=None)
    
    # Get all priests (or specific priest)
    priest_query = {"is_active": True}
    if priest_id:
        priest_query["_id"] = ObjectId(priest_id)
    
    priests = await db.priests.find(priest_query).to_list(length=None)
    
    # Calculate stats for each priest
    priests_stats = []
    total_salary = 0.0
    
    for priest in priests:
        priest_id_str = str(priest["_id"])
        priest_records = [r for r in records if r["priest_id"] == priest_id_str]
        
        if not priest_records and priest_id:
            # Include priest even with no records if specifically requested
            pass
        
        total_days_present = sum(1 for r in priest_records if r["is_present"])
        total_half_days = sum(1 for r in priest_records if r.get("half_day", False) and r["is_present"])
        total_full_days = total_days_present - total_half_days
        total_overtime = sum(r.get("overtime_hours", 0) for r in priest_records)
        
        # Calculate salaries
        base_salary = sum(r["calculated_salary"] for r in priest_records)
        
        # Attendance percentage (use last_day instead of date subtraction)
        working_days = last_day
        attendance_pct = (total_days_present / working_days * 100) if working_days > 0 else 0
        
        stats = MonthlyAttendanceStats(
            priest_id=priest_id_str,
            priest_name=priest["name"],
            daily_salary=priest["daily_salary"],
            total_days_present=total_days_present,
            total_half_days=total_half_days,
            total_full_days=total_full_days,
            total_overtime_hours=total_overtime,
            base_salary=base_salary,
            overtime_pay=0.0,  # Already included in base_salary
            total_salary=base_salary,
            attendance_percentage=round(attendance_pct, 2)
        )
        
        priests_stats.append(stats)
        total_salary += base_salary
    
    return MonthlyReport(
        month=month,
        year=year,
        total_working_days=last_day,
        priests_stats=priests_stats,
        total_salary_disbursed=round(total_salary, 2)
    )


@router.get("/dashboard", response_model=AttendanceDashboard)
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_admin),
    db = Depends(get_database)
):
    """Get dashboard statistics for attendance overview"""
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    current_date = datetime.utcnow()
    month_start = datetime(current_date.year, current_date.month, 1)
    
    # Today's attendance
    today_end = today.replace(hour=23, minute=59, second=59)
    today_present = await db.attendance.count_documents({
        "attendance_date": {"$gte": today, "$lte": today_end},
        "is_present": True
    })
    
    today_absent = await db.attendance.count_documents({
        "attendance_date": {"$gte": today, "$lte": today_end},
        "is_present": False
    })
    
    # Active priests count
    active_priests = await db.priests.count_documents({"is_active": True})
    inactive_priests = await db.priests.count_documents({"is_active": False})
    
    # Current month total salary
    month_records = await db.attendance.find({
        "attendance_date": {"$gte": month_start}
    }).to_list(length=None)
    
    current_month_salary = sum(r.get("calculated_salary", 0) for r in month_records)
    
    return AttendanceDashboard(
        today_present=today_present,
        today_absent=today_absent,
        today_total=today_present + today_absent,
        current_month_total_salary=round(current_month_salary, 2),
        active_priests_count=active_priests,
        inactive_priests_count=inactive_priests,
        current_month=current_date.month,
        current_year=current_date.year
    )
