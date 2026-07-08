from ..database import employee_bookings_collection, available_rituals_collection, stock_collection
from ..models import EmployeeBookingCreate
from fastapi import HTTPException, status
from bson import ObjectId
from .calendar_service import search_naal_in_date_range, search_naal_yearly, search_naal_in_range_all
from datetime import date
from dateutil.relativedelta import relativedelta

async def create_employee_booking(booking: EmployeeBookingCreate):
    """
    Creates a booking initiated by an employee, checks for stock, and deducts it.
    For Nakshatrapooja rituals, it maps the naal to the actual date from the calendar.
    This now uses the dedicated 'employee_bookings_collection'.
    """
    total_required_stock = {}
    
    # 1. Process Nakshatrapooja instances and aggregate required stock
    for instance in booking.instances:
        ritual = await available_rituals_collection.find_one({"_id": ObjectId(instance.ritualId)})
        if not ritual:
            continue
        
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
                        detail=f"Naal '{instance.naal}' not found in calendar for year {today.year}. Please contact admin to update the calendar."
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
                    start_date = today.replace(day=1)
                    next_month = start_date + relativedelta(months=1)
                    end_date = next_month - relativedelta(days=1)
                elif instance.date_range_type == "custom_range":
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
                                detail=f"Naal '{instance.naal}' not found in calendar between {start_date.isoformat()} and {end_date.isoformat()}. Please contact admin to update the calendar."
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
                                detail=f"Naal '{instance.naal}' not found in calendar between {start_date.isoformat()} and {end_date.isoformat()}. Please contact admin to update the calendar."
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
                            detail=f"Naal '{instance.naal}' not found in calendar between {start_date.isoformat()} and {end_date.isoformat()}. Please contact admin to update the calendar."
                        )
                    
                    instance.calculated_date = calculated_date
        
        # Aggregate stock requirements
        if ritual.get("required_stock"):
            for stock_req in ritual["required_stock"]:
                item_id = stock_req["stock_item_id"]
                quantity_needed = stock_req["quantity_required"] * instance.quantity
                total_required_stock[item_id] = total_required_stock.get(item_id, 0) + quantity_needed

    # 2. Verify stock availability
    for item_id, required_qty in total_required_stock.items():
        stock_item = await stock_collection.find_one({"_id": ObjectId(item_id)})
        if not stock_item or stock_item["quantity"] < required_qty:
            item_name = stock_item["name"] if stock_item else f"ID {item_id}"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient stock for {item_name}. Required: {required_qty}, Available: {stock_item.get('quantity', 0) if stock_item else 0}"
            )

    # 3. Deduct stock
    for item_id, required_qty in total_required_stock.items():
        await stock_collection.update_one(
            {"_id": ObjectId(item_id)},
            {"$inc": {"quantity": -required_qty}}
        )

    # 4. Create the booking in the correct collection
    booking_data = booking.model_dump()
    result = await employee_bookings_collection.insert_one(booking_data)
    new_booking = await employee_bookings_collection.find_one({"_id": result.inserted_id})
    return new_booking

async def get_all_employee_bookings():
    """Retrieves all employee bookings from the database."""
    cursor = employee_bookings_collection.find({})
    return [booking async for booking in cursor]

