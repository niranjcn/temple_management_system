from typing import Optional
from bson import ObjectId
from ..database import gallery_layouts_collection, gallery_collection
from ..models.gallery_layout_models import GalleryLayoutCreate


async def get_layout(mode: str) -> Optional[dict]:
    doc = await gallery_layouts_collection.find_one({"mode": mode})
    if not doc:
        return None
    # Filter out items whose image id no longer exists
    items = doc.get("items", []) or []
    if not items:
        # Also filter 'order' list if present
        ord_list = doc.get("order") or []
        if ord_list:
            obj_ids = [ObjectId(i) for i in ord_list if ObjectId.is_valid(i)]
            existing = set()
            if obj_ids:
                async for img in gallery_collection.find({"_id": {"$in": obj_ids}}):
                    existing.add(str(img.get("_id")))
            doc["order"] = [i for i in ord_list if i in existing]
        return doc
    ids = [it.get("id") for it in items if it and it.get("id")]
    if not ids:
        doc["items"] = []
        return doc
    obj_ids = [ObjectId(i) for i in ids if ObjectId.is_valid(i)]
    existing = set()
    if obj_ids:
        async for img in gallery_collection.find({"_id": {"$in": obj_ids}}):
            existing.add(str(img.get("_id")))
    filtered = [it for it in items if it.get("id") in existing]
    doc["items"] = filtered
    # Also filter 'order' if present by checking DB
    ord_list = doc.get("order") or []
    if ord_list:
        ord_obj_ids = [ObjectId(i) for i in ord_list if ObjectId.is_valid(i)]
        ord_existing = set()
        if ord_obj_ids:
            async for img in gallery_collection.find({"_id": {"$in": ord_obj_ids}}):
                ord_existing.add(str(img.get("_id")))
        doc["order"] = [i for i in ord_list if i in ord_existing]
    return doc


async def upsert_layout(payload: GalleryLayoutCreate) -> dict:
    data = payload.model_dump()
    await gallery_layouts_collection.update_one(
        {"mode": data["mode"]},
        {"$set": data},
        upsert=True,
    )
    doc = await gallery_layouts_collection.find_one({"mode": data["mode"]})
    return doc