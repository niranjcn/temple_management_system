from typing import Optional
from ..database import gallery_slideshow_collection, gallery_collection
from bson import ObjectId
from ..models.slideshow_models import SlideshowCreate


async def get_slideshow() -> Optional[dict]:
    doc = await gallery_slideshow_collection.find_one({})
    if not doc:
        return None
    # Filter out any image_ids that no longer exist
    image_ids = doc.get("image_ids", []) or []
    if image_ids:
        obj_ids = [ObjectId(i) for i in image_ids if ObjectId.is_valid(i)]
        existing_ids = set()
        if obj_ids:
            async for img in gallery_collection.find({"_id": {"$in": obj_ids}}):
                # Mongo returns ObjectIds; convert to string for set membership
                existing_ids.add(str(img.get("_id")))
        filtered = [iid for iid in image_ids if iid in existing_ids]
        if filtered != image_ids:
            await gallery_slideshow_collection.update_one({}, {"$set": {"image_ids": filtered}})
            doc["image_ids"] = filtered
    return doc


async def save_slideshow(payload: SlideshowCreate) -> dict:
    data = payload.model_dump()
    await gallery_slideshow_collection.update_one({}, {"$set": data}, upsert=True)
    doc = await gallery_slideshow_collection.find_one({})
    return doc