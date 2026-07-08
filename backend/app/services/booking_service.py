from fastapi import HTTPException, status
from bson import ObjectId
from ..database import bookings_collection, available_rituals_collection, stock_collection
from ..models import BookingCreate
from .calendar_service import search_naal_in_date_range, search_naal_yearly, search_naal_in_range_all
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
import bleach

async def create_booking(booking: BookingCreate):
    """
    Creates a new booking, but first checks for stock availability for all rituals in the booking.
    If stock is sufficient, it creates the booking and then deducts the required stock quantities.
    For Nakshatrapooja rituals, it maps the naal to the actual date from the calendar.
    Raises HTTPException if stock is insufficient or a required stock item is not found.
    """
    # Sanitize user inputs to prevent XSS
    booking.name = bleach.clean(booking.name, strip=True)
    booking.email = bleach.clean(booking.email, strip=True)
    booking.phone = bleach.clean(booking.phone, strip=True)
    booking.address = bleach.clean(booking.address, strip=True)
    for instance in booking.instances:
        instance.devoteeName = bleach.clean(instance.devoteeName, strip=True)

    # 1. Pre-check stock availability and process Nakshatrapooja instances
    for instance in booking.instances:
        if not ObjectId.is_valid(instance.ritualId):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid Ritual ID: {instance.ritualId}")
        
        ritual = await available_rituals_collection.find_one({"_id": ObjectId(instance.ritualId)})
        
        if not ritual:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ritual with ID {instance.ritualId} not found.")
        
        # Handle Nakshatrapooja special logic - map naal to date(s)
        if ritual.get("is_nakshatrapooja") and instance.naal:
            # Determine the date range based on date_range_type
            today = date.today()
            
            if instance.date_range_type == "this_year":
                # For "this_year", get all dates (one per month) for the entire year
                calculated_dates = await search_naal_yearly(instance.naal, today.year)
                
                if not calculated_dates or len(calculated_dates) == 0:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Naal '{instance.naal}' not found in calendar for year {today.year}. Please contact the temple to update the calendar."
                    )
                
                # Set all calculated dates for the year
                instance.calculated_dates = calculated_dates
                # Also set the first date as calculated_date for backward compatibility
                instance.calculated_date = calculated_dates[0] if calculated_dates else None
                
            else:
                # For "this_month" or "custom_range"
                start_date = None
                end_date = None
                
                if instance.date_range_type == "this_month":
                    # Current month
                    start_date = today.replace(day=1)
                    # Last day of current month
                    next_month = start_date + relativedelta(months=1)
                    end_date = next_month - relativedelta(days=1)
                elif instance.date_range_type == "custom_range":
                    # Custom range provided by user
                    if not instance.custom_range_start or not instance.custom_range_end:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Custom date range requires both custom_range_start and custom_range_end"
                        )
                    try:
                        start_date = date.fromisoformat(instance.custom_range_start)
                        end_date = date.fromisoformat(instance.custom_range_end)
                    except ValueError:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Invalid date format in custom range. Use YYYY-MM-DD format."
                        )
                else:
                    # Default to this month if not specified
                    start_date = today.replace(day=1)
                    next_month = start_date + relativedelta(months=1)
                    end_date = next_month - relativedelta(days=1)
                
                # Check if custom range spans more than one month
                if instance.date_range_type == "custom_range":
                    months_diff = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)
                    
                    if months_diff > 0:
                        # Multiple months - get all dates (one per month)
                        calculated_dates = await search_naal_in_range_all(
                            instance.naal,
                            start_date.isoformat(),
                            end_date.isoformat()
                        )
                        
                        if not calculated_dates or len(calculated_dates) == 0:
                            raise HTTPException(
                                status_code=status.HTTP_404_NOT_FOUND,
                                detail=f"Naal '{instance.naal}' not found in calendar between {start_date.isoformat()} and {end_date.isoformat()}. Please contact the temple to update the calendar."
                            )
                        
                        instance.calculated_dates = calculated_dates
                        instance.calculated_date = calculated_dates[0] if calculated_dates else None
                    else:
                        # Single month - get one date
                        calculated_date = await search_naal_in_date_range(
                            instance.naal,
                            start_date.isoformat(),
                            end_date.isoformat()
                        )
                        
                        if not calculated_date:
                            raise HTTPException(
                                status_code=status.HTTP_404_NOT_FOUND,
                                detail=f"Naal '{instance.naal}' not found in calendar between {start_date.isoformat()} and {end_date.isoformat()}. Please contact the temple to update the calendar."
                            )
                        
                        instance.calculated_date = calculated_date
                else:
                    # This month - single date
                    calculated_date = await search_naal_in_date_range(
                        instance.naal,
                        start_date.isoformat(),
                        end_date.isoformat()
                    )
                    
                    if not calculated_date:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Naal '{instance.naal}' not found in calendar between {start_date.isoformat()} and {end_date.isoformat()}. Please contact the temple to update the calendar."
                        )
                    
                    instance.calculated_date = calculated_date

        # Stock availability check
        if ritual.get("required_stock"):
            for req_stock in ritual["required_stock"]:
                stock_item_id = req_stock["stock_item_id"]
                if not ObjectId.is_valid(stock_item_id):
                     raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid Stock ID: {stock_item_id} for Ritual {ritual['name']}")

                stock_item = await stock_collection.find_one({"_id": ObjectId(stock_item_id)})
                
                if not stock_item:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Stock item required for ritual '{ritual['name']}' not found."
                    )
                
                required_quantity = req_stock["quantity_required"] * instance.quantity
                if stock_item["quantity"] < required_quantity:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Insufficient stock for '{stock_item['name']}' to perform '{ritual['name']}'. Required: {required_quantity}, Available: {stock_item['quantity']}."
                    )

    # 2. If all stock checks pass, create the booking
    booking_data = booking.model_dump()
    result = await bookings_collection.insert_one(booking_data)
    new_booking = await bookings_collection.find_one({"_id": result.inserted_id})

    # 3. After successful booking, deduct the stock
    for instance in booking.instances:
        ritual = await available_rituals_collection.find_one({"_id": ObjectId(instance.ritualId)})
        if ritual and ritual.get("required_stock"):
            for req_stock in ritual["required_stock"]:
                quantity_to_deduct = req_stock["quantity_required"] * instance.quantity
                await stock_collection.update_one(
                    {"_id": ObjectId(req_stock["stock_item_id"])},
                    {"$inc": {"quantity": -quantity_to_deduct}}
                )

    return new_booking

async def get_all_bookings():
    cursor = bookings_collection.find({})
    bookings = []
    async for booking in cursor:
        # Sanitize user inputs for safe display
        booking['name'] = bleach.clean(booking.get('name', ''), strip=True)
        booking['email'] = bleach.clean(booking.get('email', ''), strip=True)
        booking['phone'] = bleach.clean(booking.get('phone', ''), strip=True)
        booking['address'] = bleach.clean(booking.get('address', ''), strip=True)
        for instance in booking.get('instances', []):
            instance['devoteeName'] = bleach.clean(instance.get('devoteeName', ''), strip=True)
        bookings.append(booking)
    return bookings
