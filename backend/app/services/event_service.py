from ..database import events_collection
from ..models import EventCreate
from ..services.storage_service import storage_service
from bson import ObjectId
from typing import Dict, Any
from urllib.parse import urlparse

def _normalize_event_image(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure the image field is a usable signed URL."""
    if not doc:
        return doc
    img = doc.get("image")
    if not img:
        return doc
    object_path = storage_service.normalize_stored_path(img, "events")
    if object_path:
        doc["image"] = storage_service.get_signed_url_for_bucket(storage_service.events_bucket, object_path)
    return doc

async def get_all_events():
    cursor = events_collection.find({})
    events = [event async for event in cursor]
    return [_normalize_event_image(e) for e in events]

async def get_event_by_id(id: str):
    if not ObjectId.is_valid(id):
        return None
    doc = await events_collection.find_one({"_id": ObjectId(id)})
    return _normalize_event_image(doc)

async def create_event(event_data: EventCreate):
    event = event_data.model_dump()
    result = await events_collection.insert_one(event)
    doc = await events_collection.find_one({"_id": result.inserted_id})
    return _normalize_event_image(doc)

async def update_event_by_id(id: str, event_data: Dict[str, Any]):
    if not ObjectId.is_valid(id):
        return None
    existing = await events_collection.find_one({"_id": ObjectId(id)})
    if existing is None:
        return None
    previous_path = storage_service.normalize_stored_path(existing.get("image"), "events")
    new_path = storage_service.normalize_stored_path(event_data.get("image"), "events") if event_data.get("image") else None
    result = await events_collection.update_one(
        {"_id": ObjectId(id)}, {"$set": event_data}
    )
    if result.matched_count == 0:
        return None
    doc = await events_collection.find_one({"_id": ObjectId(id)})
    if previous_path and new_path and previous_path != new_path:
        storage_service.delete_event_asset(existing.get("image"))
    return _normalize_event_image(doc)

async def delete_event_by_id(id: str) -> bool:
    if not ObjectId.is_valid(id):
        return False
    existing = await events_collection.find_one({"_id": ObjectId(id)})
    if existing is None:
        return False
    result = await events_collection.delete_one({"_id": ObjectId(id)})
    if result.deleted_count == 1:
        storage_service.delete_event_asset(existing.get("image"))
        return True
    return False
