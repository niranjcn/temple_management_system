from fastapi import APIRouter, Body, HTTPException, status, Depends
from typing import List
from app.services import employee_booking_service, auth_service
from app.models.employee_booking_models import EmployeeBookingCreate, EmployeeBookingInDB
from datetime import datetime

router = APIRouter(prefix="/api/employee-bookings", tags=["Employee Bookings"])

# A mock activity service to prevent crashes if it's not implemented.
async def create_activity(activity_data):
    print(f"Activity Logged: {activity_data}")
    pass

@router.post("/", response_description="Add new booking by employee", response_model=EmployeeBookingInDB, status_code=status.HTTP_201_CREATED)
async def create_new_employee_booking(
    booking: EmployeeBookingCreate = Body(...),
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Creates a new booking record by an employee. Role must be Employee (4) or lower.
    Checks stock and logs the activity.
    """
    # Ensure only authorized employees or higher can book
    if int(current_admin.get("role_id", 99)) > 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this action")

    try:
        # Pass the current admin's username to the booking data
        booking.booked_by = current_admin.get("username", "unknown_employee")
        created_booking = await employee_booking_service.create_employee_booking(booking)

        # Log the activity
        ritual_names = ", ".join([instance.ritualName for instance in booking.instances])
        
        # Mock class for activity logging
        class ActivityCreate:
            def __init__(self, username, role, activity, timestamp):
                self.username = username
                self.role = role
                self.activity = activity
                self.timestamp = timestamp
        
        activity = ActivityCreate(
            username=current_admin.get("username"),
            role=current_admin.get("role"),
            activity=f"Created a new booking for '{booking.name}' for rituals: {ritual_names}.",
            timestamp=datetime.utcnow()
        )
        await create_activity(activity)

        return created_booking

    except HTTPException as e:
        raise e  # Re-raise exceptions from the service layer (e.g., stock issues)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/", response_description="List all bookings", response_model=List[EmployeeBookingInDB])
async def list_all_bookings(current_admin: dict = Depends(auth_service.get_current_admin)):
    """
    Retrieves all booking records. Protected for authorized staff.
    """
    if int(current_admin.get("role_id", 99)) > 4:
         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    bookings = await employee_booking_service.get_all_employee_bookings()
    return bookings
