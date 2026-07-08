from fastapi import APIRouter, Body, HTTPException, status, Depends
from typing import List
from ..services import booking_service, auth_service
from ..models import BookingCreate, BookingInDB
# Assuming these imports are correct based on your project structure
# from ..services.activity_service import create_activity
# from ..models.activity_models import ActivityCreate
from datetime import datetime

router = APIRouter()

# Placeholder for activity service if it's not fully implemented yet
# This avoids crashing if the service is unavailable.
async def create_activity(activity_data):
    """A mock function to log activity details to the console."""
    print(f"INFO:     Activity Logged: {activity_data.__dict__}")
    pass

@router.post("/", response_description="Add new booking", response_model=BookingInDB, status_code=status.HTTP_201_CREATED)
async def create_new_booking(booking: BookingCreate = Body(...)):
    """
    Used to create a new booking record. This is a public endpoint.
    This will also check for stock availability, deduct the required stock,
    and log an activity upon successful creation.
    """
    try:
        created_booking = await booking_service.create_booking(booking)
        
        # Log activity for the new booking after it's successfully created
        # A booking can have multiple rituals, so we join their names for a clear log message.
        ritual_names = ", ".join([instance.ritualName for instance in booking.instances])
        
        # Mock ActivityCreate if the model isn't available
        # In a real application, you would import this from your models file.
        class ActivityCreate:
            def __init__(self, username: str, role: str, activity: str, timestamp: datetime):
                self.username = username
                self.role = role
                self.activity = activity
                self.timestamp = timestamp

        activity = ActivityCreate(
            username="guest",
            role="Public User",
            activity=f"New booking created by {booking.name} for: {ritual_names}",
            timestamp=datetime.utcnow()
        )
        await create_activity(activity)
        
        return created_booking

    except HTTPException as e:
        # Re-raise the specific exception from the service layer (e.g., insufficient stock)
        raise e
    except Exception as e:
        # Catch any other unexpected errors during the booking process
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during booking: {str(e)}")


@router.get("/", response_description="List all bookings", response_model=List[BookingInDB])
async def list_all_bookings(current_admin: dict = Depends(auth_service.get_current_admin)):
    """
    Used to retrieve all booking records. Protected endpoint for admins.
    """
    bookings = await booking_service.get_all_bookings()
    return bookings

