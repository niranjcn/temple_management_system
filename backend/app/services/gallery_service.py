from ..database import gallery_collection
from ..models import GalleryImageCreate
from ..services.storage_service import storage_service
from bson import ObjectId
from typing import Dict, Any
from urllib.parse import urlparse

def _normalize_gallery_src(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return doc
    src = doc.get("src")
    if not src:
        return doc
    object_path = storage_service.normalize_stored_path(src, "gallery")
    if object_path:
        doc["src"] = storage_service.get_signed_url_for_bucket(storage_service.gallery_bucket, object_path)
    return doc

async def get_all_gallery_images():
    cursor = gallery_collection.find({})
    images = [image async for image in cursor]
    return [_normalize_gallery_src(i) for i in images]

async def create_gallery_image(image_data: GalleryImageCreate):
    image = image_data.model_dump()
    result = await gallery_collection.insert_one(image)
    new_image = await gallery_collection.find_one({"_id": result.inserted_id})
    return _normalize_gallery_src(new_image)

async def update_gallery_image_by_id(id: str, image_data: Dict[str, Any]):
    if not ObjectId.is_valid(id):
        return None
    existing = await gallery_collection.find_one({"_id": ObjectId(id)})
    if existing is None:
        return None
    previous_path = storage_service.normalize_stored_path(existing.get("src"), "gallery")
    new_path = storage_service.normalize_stored_path(image_data.get("src"), "gallery") if image_data.get("src") else None
    result = await gallery_collection.update_one(
        {"_id": ObjectId(id)}, {"$set": image_data}
    )
    if result.matched_count == 0:
        return None
    doc = await gallery_collection.find_one({"_id": ObjectId(id)})
    if previous_path and new_path and previous_path != new_path:
        storage_service.delete_gallery_asset(existing.get("src"))
    return _normalize_gallery_src(doc)

async def delete_gallery_image_by_id(id: str) -> bool:
    if not ObjectId.is_valid(id):
        return False
    existing = await gallery_collection.find_one({"_id": ObjectId(id)})
    if existing is None:
        return False
    result = await gallery_collection.delete_one({"_id": ObjectId(id)})
    if result.deleted_count == 1:
        storage_service.delete_gallery_asset(existing.get("src"))
        return True
    return False

async def get_gallery_image_by_id(id: str):
    if not ObjectId.is_valid(id):
        return None
    doc = await gallery_collection.find_one({"_id": ObjectId(id)})
    return _normalize_gallery_src(doc)
