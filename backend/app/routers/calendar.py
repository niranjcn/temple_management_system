from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status, Query
from fastapi.responses import JSONResponse
from ..services import auth_service
from ..services.calendar_service import (
    prepopulate_year,
    get_month,
    assign_malayalam_year_range,
    upsert_day_naal,
    get_day,
    search_by_naal,
    search_naal_in_date_range,
    search_naal_in_range_all,
)
from ..models.calendar_models import (
    PrepopulateRequest,
    AssignMalayalamYearRangeRequest,
    CalendarDayUpdateNaal,
    MonthResponse,
    CalendarDayPublic,
)

router = APIRouter()


def _assert_admin(actor: dict):
    # Use role_id: 0 super admin, 1 admin
    rid = int(actor.get("role_id", 99))
    if rid not in (0, 1):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")


@router.get("/v1/calendar/{year}/{month}", response_model=MonthResponse)
async def get_calendar_month(year: int, month: int, response: Response):
    days, last_modified = await get_month(year, month)
    # Build strong ETag based on last_modified and count
    etag = f'W/"{int(last_modified.timestamp())}-{len(days)}"'
    response.headers["ETag"] = etag
    response.headers["Last-Modified"] = last_modified.strftime("%a, %d %b %Y %H:%M:%S GMT")
    public_days = [CalendarDayPublic(**d) for d in days]
    return MonthResponse(days=public_days, lastModified=last_modified)


@router.post("/v1/calendar/prepopulate", status_code=200)
async def prepopulate(req: PrepopulateRequest, current_admin: dict = Depends(auth_service.get_current_admin)):
    _assert_admin(current_admin)
    count = await prepopulate_year(req.year, actor=current_admin.get("username"))
    return {"inserted": count}


@router.post("/v1/calendar/range/malayalam-year")
async def set_malayalam_year_range(req: AssignMalayalamYearRangeRequest, current_admin: dict = Depends(auth_service.get_current_admin)):
    _assert_admin(current_admin)
    count = await assign_malayalam_year_range(req.start_date, req.end_date, req.malayalam_year, current_admin.get("username"), dry_run=req.dryRun)
    return {"matched": count, "dryRun": req.dryRun}


@router.post("/v1/calendar/day/naal")
async def set_day_naal(req: CalendarDayUpdateNaal, current_admin: dict = Depends(auth_service.get_current_admin)):
    _assert_admin(current_admin)
    doc = await upsert_day_naal(req.date, req.naal, current_admin.get("username"), req.version)
    return doc


@router.get("/v1/calendar/search")
async def search(naal: str = Query(..., max_length=256), limit: int = 10, after: Optional[str] = None):
    items = await search_by_naal(naal, limit=limit, after=after)
    return items


@router.get("/v1/calendar/day/{dateISO}")
async def get_single_day(dateISO: str):
    doc = await get_day(dateISO)
    if not doc:
        raise HTTPException(status_code=404, detail="Day not found")
    return doc


@router.get("/v1/calendar/naal-to-date")
async def get_naal_date(
    naal: str = Query(..., max_length=256),
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format")
):
    """
    Find the first occurrence of a naal within a date range.
    Used for Nakshatrapooja bookings to map naal to actual dates.
    """
    date_found = await search_naal_in_date_range(naal, start_date, end_date)
    if not date_found:
        raise HTTPException(
            status_code=404, 
            detail=f"Naal '{naal}' not found in the calendar between {start_date} and {end_date}. Please ensure the calendar is updated with naal information."
        )
    return {"naal": naal, "date": date_found, "start_date": start_date, "end_date": end_date}


@router.get("/v1/calendar/search-naal-range", response_model=List[str])
async def get_naal_dates_in_range(
    naal: str = Query(..., max_length=256),
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    end_date: str = Query(..., description="End date in YYYY-MM-DD format")
):
    """
    Find all occurrences of a naal within a date range (one per month).
    Used for Nakshatrapooja bookings to calculate cost based on naal count.
    Returns a list of dates where the naal occurs.
    """
    dates_found = await search_naal_in_range_all(naal, start_date, end_date)
    return dates_found
