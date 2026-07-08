from typing import Optional
from bson import ObjectId
from ..database import gallery_home_preview_collection, gallery_collection
from ..models.gallery_home_preview_models import HomePreviewCreate


async def get_home_preview() -> Optional[dict]:
    doc = await gallery_home_preview_collection.find_one({})
    if not doc:
        return None
    # Filter out any slots whose image does not exist anymore
    slots = doc.get("slots") or [None] * 6
    ids = [s for s in slots if s and ObjectId.is_valid(s)]
    existing: set[str] = set()
    if ids:
        async for img in gallery_collection.find({"_id": {"$in": [ObjectId(i) for i in ids]}}):
            existing.add(str(img.get("_id")))
    doc["slots"] = [s if s in existing else None for s in slots]
    return doc


async def save_home_preview(payload: HomePreviewCreate) -> dict:
    data = payload.model_dump()
    # Normalize to exactly 6 slots
    slots = (data.get("slots") or [])[:6]
    slots = slots + [None] * (6 - len(slots))
    data["slots"] = slots
    await gallery_home_preview_collection.update_one({}, {"$set": data}, upsert=True)
    doc = await gallery_home_preview_collection.find_one({})
    return doc
