from __future__ import annotations
from datetime import datetime, timedelta, date
from typing import Dict, Any, List, Optional, Tuple
from fastapi import HTTPException, status
from bson import ObjectId
from ..database import calendar_collection, calendar_audit_collection
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from ..models.calendar_models import CalendarDayPublic
import logging

logger = logging.getLogger(__name__)


# Simple in-memory cache for month payloads (can be replaced with Redis)
_month_cache: Dict[str, Tuple[datetime, List[Dict[str, Any]]]] = {}


def _month_key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def _invalidate_month_cache_for_range(start_dt: date, end_dt: date):
    # Invalidate all months overlapping [start_dt, end_dt]
    cur = date(start_dt.year, start_dt.month, 1)
    while cur <= end_dt:
        key = _month_key(cur.year, cur.month)
        _month_cache.pop(key, None)
        # Move to first day of next month
        if cur.month == 12:
            cur = date(cur.year + 1, 1, 1)
        else:
            cur = date(cur.year, cur.month + 1, 1)


def _invalidate_single(date_iso: str):
    dt = date.fromisoformat(date_iso)
    _month_cache.pop(_month_key(dt.year, dt.month), None)


def _derive_parts(d: date) -> Dict[str, Any]:
    return {
        "dateISO": d.isoformat(),
        "year": d.year,
        "month": d.month,
        "day": d.day,
        "weekday": d.weekday(),  # Monday=0
    }


async def prepopulate_year(year: int, actor: Optional[str] = None) -> int:
    # Create all days for the given year if missing
    start = date(year, 1, 1)
    end = date(year, 12, 31)
    docs: List[Dict[str, Any]] = []
    cur = start
    now = datetime.utcnow()
    while cur <= end:
        base = _derive_parts(cur)
        base.update({
            "malayalam_year": None,
            "naal": None,
            "metadata": {},
            "created_at": now,
            "updated_at": now,
            "updated_by": actor or "system",
            "version": 0,
            "schema_version": 1,
        })
        docs.append(base)
        cur += timedelta(days=1)

    # Use upsert-like behavior via bulkWrite
    ops = []
    for d in docs:
        ops.append({
            "updateOne": {
                "filter": {"dateISO": d["dateISO"]},
                "update": {"$setOnInsert": d},
                "upsert": True,
            }
        })
    if ops:
        res = await calendar_collection.bulk_write(ops, ordered=False)
        # upserts count
        count = (res.upserted_count or 0)
    else:
        count = 0
    # Invalidate cache for the whole year
    _invalidate_month_cache_for_range(start, end)
    return count


async def get_month(year: int, month: int) -> Tuple[List[Dict[str, Any]], datetime]:
    key = _month_key(year, month)
    cached = _month_cache.get(key)
    if cached:
        return cached[1], cached[0]

    # Compute range
    start = date(year, month, 1)
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)

    cursor = calendar_collection.find({
        "dateISO": {"$gte": start.isoformat(), "$lt": next_month.isoformat()}
    }).sort("dateISO", 1)
    days = await cursor.to_list(1000)

    # Determine last modified (max updated_at)
    last_modified = max((d.get("updated_at") for d in days if d.get("updated_at")), default=datetime.utcnow())
    _month_cache[key] = (last_modified, days)
    return days, last_modified


async def assign_malayalam_year_range(start_date: str, end_date: str, malayalam_year: Any, actor: str, dry_run: bool = False) -> int:
    try:
        s = date.fromisoformat(start_date)
        e = date.fromisoformat(end_date)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format; expected YYYY-MM-DD")
    if s > e:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")

    now = datetime.utcnow()
    query = {"dateISO": {"$gte": s.isoformat(), "$lte": e.isoformat()}}

    if dry_run:
        count = await calendar_collection.count_documents(query)
        return count

    # Audit: fetch before snapshots (only needed for rollback granularity)
    existing = await calendar_collection.find(query, {"_id": 0}).to_list(None)
    op_id = str(ObjectId())

    res = await calendar_collection.update_many(query, {"$set": {"malayalam_year": malayalam_year, "updated_at": now, "updated_by": actor}, "$inc": {"version": 1}})
    modified = res.modified_count

    # Fetch after snapshots for modified docs
    after_docs = await calendar_collection.find(query, {"_id": 0}).to_list(None)
    before_map = {d["dateISO"]: d for d in existing}
    after_map = {d["dateISO"]: d for d in after_docs}

    audit_ops = []
    ts = now
    for k in after_map.keys():
        audit_ops.append({
            "insertOne": {
                "document": {
                    "dateISO": k,
                    "op": "set_malayalam_year",
                    "before": before_map.get(k),
                    "after": after_map.get(k),
                    "changed_by": actor,
                    "timestamp": ts,
                    "operation_id": op_id,
                }
            }
        })
    if audit_ops:
        try:
            await calendar_audit_collection.bulk_write(audit_ops, ordered=False)
        except Exception as e:
            logger.warning(f"Failed to write calendar audit logs: {e}")

    _invalidate_month_cache_for_range(s, e)
    return modified


async def upsert_day_naal(date_str: str, naal: Optional[str], actor: str, version: Optional[int]) -> Dict[str, Any]:
    try:
        d = date.fromisoformat(date_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format; expected YYYY-MM-DD")

    now = datetime.utcnow()
    filter_q = {"dateISO": d.isoformat()}

    # Optimistic concurrency if provided
    if version is not None:
        filter_q["version"] = int(version)

    # Prepare update
    update_doc = {
        "$set": {
            "naal": naal,
            "updated_at": now,
            "updated_by": actor,
        },
        "$inc": {"version": 1},
        "$setOnInsert": {
            **_derive_parts(d),
            "malayalam_year": None,
            "metadata": {},
            "created_at": now,
            "schema_version": 1,
            # updated_at/updated_by set in $set
        },
    }

    # Snapshot before
    before = await calendar_collection.find_one({"dateISO": d.isoformat()}, {"_id": 0})
    
    try:
        res = await calendar_collection.find_one_and_update(
            filter_q,
            update_doc,
            upsert=True,
            return_document=ReturnDocument.AFTER
        )
    except DuplicateKeyError:
        # This happens when version mismatch prevents update and upsert tries to create duplicate
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, 
            detail="Version conflict detected. The calendar entry was modified by another user. Please refresh and try again."
        )
    
    if res is None:
        # Likely version conflict
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Version conflict; please refresh and retry")

    # Snapshot after
    after = await calendar_collection.find_one({"dateISO": d.isoformat()}, {"_id": 0})

    # Audit
    try:
        await calendar_audit_collection.insert_one({
            "dateISO": d.isoformat(),
            "op": "set_naal",
            "before": before,
            "after": after,
            "changed_by": actor,
            "timestamp": now,
            "operation_id": str(ObjectId()),
        })
    except Exception as e:
        logger.warning(f"Failed to create calendar audit entry: {e}")

    _invalidate_single(d.isoformat())
    return after


async def get_day(date_str: str) -> Optional[Dict[str, Any]]:
    return await calendar_collection.find_one({"dateISO": date_str}, {"_id": 0})


async def search_by_naal(naal: str, limit: int = 10, after: Optional[str] = None) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {"naal": naal}
    if after:
        q["dateISO"] = {"$gte": after}
    cursor = calendar_collection.find(q).sort("dateISO", 1).limit(int(limit))
    return await cursor.to_list(int(limit))


async def search_naal_in_date_range(naal: str, start_date: str, end_date: str) -> Optional[str]:
    """
    Search for a naal within a specific date range and return the first matching date.
    Used for Nakshatrapooja bookings to map naal to actual dates.
    
    Args:
        naal: The naal (birth star) to search for
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
    
    Returns:
        The first date (YYYY-MM-DD) where the naal occurs, or None if not found
    """
    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format; expected YYYY-MM-DD")
    
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    
    # Query for the naal within the date range
    query = {
        "naal": naal,
        "dateISO": {
            "$gte": start.isoformat(),
            "$lte": end.isoformat()
        }
    }
    
    # Find the first occurrence, sorted by date
    result = await calendar_collection.find_one(query, {"dateISO": 1, "_id": 0}, sort=[("dateISO", 1)])
    
    if result:
        return result.get("dateISO")
    return None


async def search_naal_yearly(naal: str, year: int) -> List[str]:
    """
    Search for a naal throughout an entire year and return all matching dates (one per month).
    Used for Nakshatrapooja bookings with "this_year" option.
    
    Args:
        naal: The naal (birth star) to search for
        year: The year to search in
    
    Returns:
        List of dates (YYYY-MM-DD) where the naal occurs, one per month
    """
    from dateutil.relativedelta import relativedelta
    
    monthly_dates = []
    
    # Search each month of the year
    for month in range(1, 13):
        try:
            # First day of the month
            start_of_month = date(year, month, 1)
            # Last day of the month
            end_of_month = start_of_month + relativedelta(months=1) - relativedelta(days=1)
            
            # Query for the naal in this month
            query = {
                "naal": naal,
                "dateISO": {
                    "$gte": start_of_month.isoformat(),
                    "$lte": end_of_month.isoformat()
                }
            }
            
            # Find the first occurrence in this month
            result = await calendar_collection.find_one(query, {"dateISO": 1, "_id": 0}, sort=[("dateISO", 1)])
            
            if result:
                monthly_dates.append(result.get("dateISO"))
        except Exception as e:
            # Skip months that cause errors
            logger.warning(f"Error searching for naal {naal} in month {year}-{month:02d}: {e}")
            continue
    
    return monthly_dates


async def search_naal_in_range_all(naal: str, start_date: str, end_date: str) -> List[str]:
    """
    Search for all occurrences of a naal within a date range (for custom ranges spanning multiple months).
    Returns one date per month where the naal occurs.
    
    Args:
        naal: The naal (birth star) to search for
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
    
    Returns:
        List of dates (YYYY-MM-DD) where the naal occurs, one per month in the range
    """
    from dateutil.relativedelta import relativedelta
    
    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format; expected YYYY-MM-DD")
    
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    
    monthly_dates = []
    current = start.replace(day=1)  # Start from first day of start month
    
    while current <= end:
        # Calculate month boundaries
        month_start = current
        month_end = current + relativedelta(months=1) - relativedelta(days=1)
        
        # Don't go beyond the specified end date
        if month_end > end:
            month_end = end
        
        # Query for the naal in this month
        query = {
            "naal": naal,
            "dateISO": {
                "$gte": max(month_start, start).isoformat(),
                "$lte": month_end.isoformat()
            }
        }
        
        # Find the first occurrence in this month
        result = await calendar_collection.find_one(query, {"dateISO": 1, "_id": 0}, sort=[("dateISO", 1)])
        
        if result:
            monthly_dates.append(result.get("dateISO"))
        
        # Move to next month
        current = current + relativedelta(months=1)
    
    return monthly_dates
