from typing import List, Optional
from ..database import events_section_collection
from .featured_event_service import get_featured_event_id


async def get_events_section_ids() -> List[str]:
    """Return the selected event IDs for the homepage section, ensuring the featured event is included."""
    doc = await events_section_collection.find_one({})
    selected: List[str] = list((doc or {}).get("event_ids", []))
    # Deduplicate and ensure string type
    selected = [str(x) for x in selected if isinstance(x, (str,))]

    featured_id: Optional[str] = await get_featured_event_id()
    if featured_id and featured_id not in selected:
        selected.insert(0, featured_id)
    return selected


async def set_events_section_ids(event_ids: List[str]) -> List[str]:
    """Replace the selection of event IDs for the homepage section."""
    clean_ids = [str(x) for x in event_ids if isinstance(x, (str,))]
    await events_section_collection.update_one({}, {"$set": {"event_ids": clean_ids}}, upsert=True)
    return await get_events_section_ids()
