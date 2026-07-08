from ..database import available_rituals_collection
from ..models import AvailableRitualCreate
from bson import ObjectId
from typing import Dict, Any
from datetime import datetime, date

async def get_all_available_rituals():
    """Get all available rituals with proper date filtering (public) and excluding employee-only."""
    cursor = available_rituals_collection.find({"employee_only": {"$ne": True}})
    rituals = [ritual async for ritual in cursor]
    
    # Filter rituals based on current date if they have date ranges
    current_date = date.today()
    filtered_rituals = []
    
    for ritual in rituals:
        # If no date range is specified, ritual is always available
        if not ritual.get('available_from') and not ritual.get('available_to'):
            filtered_rituals.append(ritual)
            continue
        
        # Check if current date is within the available range
        available_from = ritual.get('available_from')
        available_to = ritual.get('available_to')
        
        is_available = True
        
        if available_from:
            try:
                from_date = datetime.strptime(available_from, '%Y-%m-%d').date()
                if current_date < from_date:
                    is_available = False
            except ValueError:
                # If date parsing fails, skip this ritual
                continue
        
        if available_to and is_available:
            try:
                to_date = datetime.strptime(available_to, '%Y-%m-%d').date()
                if current_date > to_date:
                    is_available = False
            except ValueError:
                # If date parsing fails, skip this ritual
                continue
        
        if is_available:
            filtered_rituals.append(ritual)
    
    return filtered_rituals

async def get_all_available_rituals_admin():
    """Get all rituals for admin without date filtering"""
    cursor = available_rituals_collection.find({})
    return [ritual async for ritual in cursor]

async def get_all_public_rituals_no_date():
    """Get all rituals for public without date filtering and excluding employee-only."""
    cursor = available_rituals_collection.find({"employee_only": {"$ne": True}})
    return [ritual async for ritual in cursor]

async def create_ritual(ritual_data: AvailableRitualCreate):
    """Create a new ritual with proper date handling"""
    ritual = ritual_data.model_dump(exclude_none=True)
    
    # Ensure date fields are properly formatted or set to None for all_time
    if not ritual.get('available_from'):
        ritual['available_from'] = None
    if not ritual.get('available_to'):
        ritual['available_to'] = None
    
    # Enforce maximum of 3 featured rituals if show_on_home is True
    if ritual.get('show_on_home'):
        current_featured_count = await available_rituals_collection.count_documents({"show_on_home": True})
        if current_featured_count >= 3:
            # Do not allow insertion as featured beyond limit
            raise ValueError("Maximum of 3 rituals can be featured on home.")

    result = await available_rituals_collection.insert_one(ritual)
    new_ritual = await available_rituals_collection.find_one({"_id": result.inserted_id})
    return new_ritual

async def update_ritual_by_id(id: str, ritual_data: Dict[str, Any]):
    if not ObjectId.is_valid(id):
        return None
    # If toggling show_on_home to True, enforce cap of 3
    if ritual_data.get('show_on_home') is True:
        current_featured_count = await available_rituals_collection.count_documents({
            "_id": {"$ne": ObjectId(id)},
            "show_on_home": True
        })
        if current_featured_count >= 3:
            # Reject update attempting to exceed cap
            raise ValueError("Maximum of 3 rituals can be featured on home.")

    result = await available_rituals_collection.update_one(
        {"_id": ObjectId(id)}, {"$set": ritual_data}
    )
    if result.matched_count == 0:
        return None
    return await available_rituals_collection.find_one({"_id": ObjectId(id)})

async def delete_ritual_by_id(id: str) -> bool:
    if not ObjectId.is_valid(id):
        return False
    result = await available_rituals_collection.delete_one({"_id": ObjectId(id)})
    return result.deleted_count == 1

async def get_featured_rituals_for_home():
    """Get up to 3 rituals marked show_on_home without date filtering and excluding employee-only."""
    # Rely on DB limit for efficiency and predictable small payloads
    cursor = available_rituals_collection.find({
        "show_on_home": True,
        "employee_only": {"$ne": True}
    }).limit(3)
    return [ritual async for ritual in cursor]
