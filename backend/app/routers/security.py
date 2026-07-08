from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from datetime import datetime, timedelta
from bson import ObjectId
from ..database import security_events_collection, admins_collection
from ..services import auth_service
from ..models.security_models import SecurityEventInDB
from pydantic import BaseModel, Field

router = APIRouter()


class SecurityEventPublic(BaseModel):
    """Public model for security events with username resolved"""
    id: str = Field(alias="_id")
    event_type: str
    timestamp: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    user_id: Optional[str] = None
    username: Optional[str] = None  # Resolved from user_id
    mobile_number: Optional[str] = None
    details: dict = {}
    
    class Config:
        populate_by_name = True


class SecurityEventsResponse(BaseModel):
    """Response model for security events list"""
    events: List[SecurityEventPublic]
    total_count: int
    page: int
    page_size: int
    total_pages: int


def _can_view_security(actor: dict) -> bool:
    """Only Super Admin (0) and Admin (1) can view security events."""
    return int(actor.get("role_id", 99)) <= 1


@router.get("/events", response_model=SecurityEventsResponse)
async def get_security_events(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=200, description="Items per page"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    username: Optional[str] = Query(None, description="Filter by username"),
    start_date: Optional[datetime] = Query(None, description="Filter events from this date"),
    end_date: Optional[datetime] = Query(None, description="Filter events until this date"),
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Get security events with filtering and pagination.
    Accessible only to Super Admin (0) and Admin (1).
    """
    if not _can_view_security(current_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view security events"
        )
    
    # Build query filter
    query = {}
    
    # Filter by event type
    if event_type:
        query["event_type"] = event_type
    
    # Filter by date range
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date
        query["timestamp"] = date_filter
    
    # Filter by username - first resolve to user_id
    if username:
        admin = await admins_collection.find_one({"username": {"$regex": username, "$options": "i"}})
        if admin:
            query["user_id"] = str(admin["_id"])
        else:
            # No matching user, return empty results
            return SecurityEventsResponse(
                events=[],
                total_count=0,
                page=page,
                page_size=page_size,
                total_pages=0
            )
    
    # Get total count
    total_count = await security_events_collection.count_documents(query)
    
    # Calculate pagination
    total_pages = (total_count + page_size - 1) // page_size
    skip = (page - 1) * page_size
    
    # Fetch events
    cursor = security_events_collection.find(query).sort("timestamp", -1).skip(skip).limit(page_size)
    events = await cursor.to_list(length=page_size)
    
    # Resolve usernames for all events
    user_ids = [e.get("user_id") for e in events if e.get("user_id")]
    user_map = {}
    
    if user_ids:
        # Fetch all relevant admins in one query
        admins_cursor = admins_collection.find(
            {"_id": {"$in": [ObjectId(uid) for uid in user_ids if ObjectId.is_valid(uid)]}},
            {"username": 1}
        )
        admins = await admins_cursor.to_list(length=len(user_ids))
        user_map = {str(admin["_id"]): admin.get("username", "Unknown") for admin in admins}
    
    # Build response with resolved usernames
    public_events = []
    for event in events:
        event_dict = {
            "_id": str(event["_id"]),
            "event_type": event.get("event_type", "unknown"),
            "timestamp": event.get("timestamp"),
            "ip_address": event.get("ip_address"),
            "user_agent": event.get("user_agent"),
            "user_id": event.get("user_id"),
            "username": user_map.get(event.get("user_id"), "Unknown") if event.get("user_id") else None,
            "mobile_number": event.get("mobile_number"),
            "details": event.get("details", {})
        }
        public_events.append(SecurityEventPublic(**event_dict))
    
    return SecurityEventsResponse(
        events=public_events,
        total_count=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/events/types", response_model=List[str])
async def get_event_types(
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Get all distinct event types for filtering.
    Accessible only to Super Admin (0) and Admin (1).
    """
    if not _can_view_security(current_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view security events"
        )
    
    event_types = await security_events_collection.distinct("event_type")
    return sorted(event_types)


@router.get("/events/stats")
async def get_security_stats(
    hours: int = Query(24, ge=1, le=720, description="Time range in hours"),
    current_admin: dict = Depends(auth_service.get_current_admin)
):
    """
    Get security statistics for the specified time range.
    Accessible only to Super Admin (0) and Admin (1).
    """
    if not _can_view_security(current_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view security events"
        )
    
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)
    
    # Get event counts by type
    pipeline = [
        {"$match": {"timestamp": {"$gte": cutoff_time}}},
        {"$group": {
            "_id": "$event_type",
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}}
    ]
    
    event_counts = await security_events_collection.aggregate(pipeline).to_list(length=100)
    
    # Get unique IPs
    unique_ips = await security_events_collection.distinct(
        "ip_address",
        {"timestamp": {"$gte": cutoff_time}}
    )
    
    # Get unique users
    unique_users = await security_events_collection.distinct(
        "user_id",
        {"timestamp": {"$gte": cutoff_time}}
    )
    
    return {
        "time_range_hours": hours,
        "event_counts": {item["_id"]: item["count"] for item in event_counts},
        "unique_ips": len(unique_ips),
        "unique_users": len([u for u in unique_users if u]),
        "total_events": sum(item["count"] for item in event_counts)
    }
