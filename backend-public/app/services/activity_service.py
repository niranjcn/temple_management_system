from ..database import activities_collection
from ..models.activity_models import ActivityCreate, ActivityInDB
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

async def create_activity(activity: ActivityCreate) -> ActivityInDB:
    """
    Create a new activity record.
    """
    activity_data = activity.model_dump()
    result = await activities_collection.insert_one(activity_data)
    new_activity = await activities_collection.find_one({"_id": result.inserted_id})
    return ActivityInDB(**new_activity)

async def get_all_activities(
    role: Optional[str] = None,
    username: Optional[str] = None,
    date: Optional[str] = None
) -> List[ActivityInDB]:
    """
    Get all activities, optionally filtered by role, username, or date (YYYY-MM-DD).
    """
    query = {}
    if role:
        query["role"] = role
    if username:
        query["username"] = username
    if date:
        # Assuming date is in YYYY-MM-DD format
        start = datetime.strptime(date, "%Y-%m-%d")
        end = start.replace(hour=23, minute=59, second=59)
        query["timestamp"] = {"$gte": start, "$lte": end}

    activities = await activities_collection.find(query).sort("timestamp", -1).to_list(1000)
    return [ActivityInDB(**activity) for activity in activities]