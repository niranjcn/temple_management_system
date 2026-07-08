from fastapi import APIRouter, HTTPException, Query, Body, status, Depends
from ..models.stock_models import StockItemCreate, StockItemUpdate, StockItemInDB
from typing import List,Dict, Any
from datetime import datetime
from bson import ObjectId
from ..services import stock_service, stock_analytics_service, auth_service
from ..services.activity_service import create_activity
from ..models.activity_models import ActivityCreate

router = APIRouter()

@router.post("/", response_model=StockItemInDB, status_code=status.HTTP_201_CREATED)
async def create_stock_item(stock_item: StockItemCreate, current_admin: dict = Depends(auth_service.get_current_admin)):
    """
    Create a new stock item.
    """
    if int(current_admin.get("role_id", 99)) > 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to create stock items")
    try:
        created_item = await stock_service.create_stock_item_service(stock_item)
        
        # Log activity
        activity = ActivityCreate(
            username=current_admin["username"],
            role=current_admin["role"],
            activity=f"Added a new stock item: '{stock_item.name}'.",
            timestamp=datetime.utcnow()
        )
        await create_activity(activity)
        
        return created_item
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/", response_model=List[StockItemInDB])
async def get_all_stock_items():
    """
    Retrieve all stock items.
    """
    return await stock_service.get_all_stock_items_service()

@router.put("/{item_id}", response_model=StockItemInDB)
async def update_stock_item(item_id: str, stock_item: StockItemUpdate = Body(...), current_admin: dict = Depends(auth_service.get_current_admin)):
    """
    Update a stock item by its ID.
    """
    if int(current_admin.get("role_id", 99)) > 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update stock items")
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=400, detail="Invalid ObjectId format")

    try:
        updated_item = await stock_service.update_stock_item_service(item_id, stock_item)
        if updated_item is None:
            raise HTTPException(status_code=404, detail="Stock item not found")
        
        # Log activity
        activity = ActivityCreate(
            username=current_admin["username"],
            role=current_admin["role"],
            activity=f"Updated the stock item '{updated_item.name}'.",
            timestamp=datetime.utcnow()
        )
        await create_activity(activity)
        
        return updated_item
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred while updating stock item: {str(e)}")

@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stock_item(item_id: str, current_admin: dict = Depends(auth_service.get_current_admin)):
    """
    Delete a stock item by its ID.
    """
    if int(current_admin.get("role_id", 99)) > 4:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete stock items")
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=400, detail="Invalid ObjectId format")

    deleted = await stock_service.delete_stock_item_service(item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Stock item not found")
    
    # Log activity
    activity = ActivityCreate(
        username=current_admin["username"],
        role=current_admin["role"],
        activity=f"Deleted a stock item (ID: {item_id}).",
        timestamp=datetime.utcnow()
    )
    await create_activity(activity)
    
    return

@router.get("/analytics")
async def get_stock_analytics(
    period: str = Query("monthly", enum=["monthly", "yearly", "category"]),
    year: int = Query(datetime.now().year)
):
    """
    Get stock analytics data.
    Can be filtered by period (monthly, yearly, or category) and year.
    """
    try:
        analytics_data = await stock_analytics_service.get_stock_analytics_service(period, year)
        return analytics_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")

@router.get("/analytics/category")
async def get_stock_category_analytics(year: int = Query(datetime.now().year)):
    """
    Get stock analytics data grouped by category for a specific year.
    """
    try:
        return await stock_analytics_service.get_stock_category_analytics_service(year)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

