from ..database import committee_collection
from ..models import CommitteeMemberCreate
from ..services.storage_service import storage_service
from bson import ObjectId
from typing import Dict, Any
from urllib.parse import urlparse

def _normalize_committee_image(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure the image field is a usable signed URL."""
    if not doc:
        return doc
    img = doc.get("image")
    if not img:
        return doc
    object_path = storage_service.normalize_stored_path(img, "committee")
    if object_path:
        doc["image"] = storage_service.get_signed_url_for_bucket(storage_service.gallery_bucket, object_path)
    return doc

async def get_all_committee_members():
    cursor = committee_collection.find({})
    members = [member async for member in cursor]
    return [_normalize_committee_image(m) for m in members]

async def get_committee_member_by_id(id: str):
    if not ObjectId.is_valid(id):
        return None
    doc = await committee_collection.find_one({"_id": ObjectId(id)})
    return _normalize_committee_image(doc)

async def create_committee_member(member_data: CommitteeMemberCreate):
    member = member_data.model_dump()
    result = await committee_collection.insert_one(member)
    doc = await committee_collection.find_one({"_id": result.inserted_id})
    return _normalize_committee_image(doc)

async def update_committee_member_by_id(id: str, member_data: Dict[str, Any]):
    if not ObjectId.is_valid(id):
        return None
    existing = await committee_collection.find_one({"_id": ObjectId(id)})
    if existing is None:
        return None
    previous_path = storage_service.normalize_stored_path(existing.get("image"), "committee")
    new_path = storage_service.normalize_stored_path(member_data.get("image"), "committee") if member_data.get("image") else None
    result = await committee_collection.update_one(
        {"_id": ObjectId(id)}, {"$set": member_data}
    )
    if result.matched_count == 0:
        return None
    doc = await committee_collection.find_one({"_id": ObjectId(id)})
    if previous_path and new_path and previous_path != new_path:
        storage_service.delete_committee_asset(existing.get("image"))
    return _normalize_committee_image(doc)

async def delete_committee_member_by_id(id: str) -> bool:
    if not ObjectId.is_valid(id):
        return False
    existing = await committee_collection.find_one({"_id": ObjectId(id)})
    if existing is None:
        return False
    result = await committee_collection.delete_one({"_id": ObjectId(id)})
    if result.deleted_count == 1:
        storage_service.delete_committee_asset(existing.get("image"))
        return True
    return False