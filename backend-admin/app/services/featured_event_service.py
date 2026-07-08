from typing import Optional
from ..database import events_featured_collection

async def get_featured_event_id() -> Optional[str]:
    doc = await events_featured_collection.find_one({})
    return doc.get("event_id") if doc else None

async def set_featured_event_id(event_id: Optional[str]) -> Optional[str]:
    await events_featured_collection.update_one({}, {"$set": {"event_id": event_id}}, upsert=True)
    doc = await events_featured_collection.find_one({})
    return doc.get("event_id") if doc else None
