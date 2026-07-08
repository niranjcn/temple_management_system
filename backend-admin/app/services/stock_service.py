from typing import List, Optional
from bson import ObjectId
from datetime import datetime, date

from ..models.stock_models import StockItemCreate, StockItemUpdate, StockItemInDB
from ..database import stock_collection

def _stock_item_helper(item) -> StockItemInDB:
    """Converts a MongoDB document to a Pydantic model, ensuring _id is a string."""
    item["_id"] = str(item["_id"])
    
    # Convert datetime objects back to dates for consistency
    if "expiryDate" in item and isinstance(item["expiryDate"], datetime):
        item["expiryDate"] = item["expiryDate"].date()
    if "addedOn" in item and isinstance(item["addedOn"], datetime):
        item["addedOn"] = item["addedOn"].date()
    
    return StockItemInDB(**item)

async def create_stock_item_service(data: StockItemCreate) -> StockItemInDB:
    """Inserts a new stock item into the database."""
    item_dict = data.model_dump()
    # Convert date objects to datetime for BSON compatibility
    if isinstance(item_dict.get("expiryDate"), date):
        item_dict["expiryDate"] = datetime.combine(item_dict["expiryDate"], datetime.min.time())
    if isinstance(item_dict.get("addedOn"), date):
        item_dict["addedOn"] = datetime.combine(item_dict["addedOn"], datetime.min.time())

    result = await stock_collection.insert_one(item_dict)
    new_item = await stock_collection.find_one({"_id": result.inserted_id})
    return _stock_item_helper(new_item)

async def get_all_stock_items_service() -> List[StockItemInDB]:
    """Retrieves all stock items from the database."""
    items = [_stock_item_helper(item) async for item in stock_collection.find()]
    return items

async def update_stock_item_service(item_id: str, data: StockItemUpdate) -> Optional[StockItemInDB]:
    """Updates a specific stock item by its ID."""
    if not ObjectId.is_valid(item_id):
        raise ValueError("Invalid ObjectId format")

    update_data = {k: v for k, v in data.model_dump(exclude_unset=True).items()}
    if not update_data:
        return None  # Return None if there's nothing to update

    # Convert date objects to datetime for BSON compatibility
    if 'expiryDate' in update_data and isinstance(update_data.get('expiryDate'), date):
        update_data['expiryDate'] = datetime.combine(update_data['expiryDate'], datetime.min.time())
    
    # Convert addedOn date to datetime if present
    if 'addedOn' in update_data and isinstance(update_data.get('addedOn'), date):
        update_data['addedOn'] = datetime.combine(update_data['addedOn'], datetime.min.time())

    updated_item = await stock_collection.find_one_and_update(
        {"_id": ObjectId(item_id)},
        {"$set": update_data},
        return_document=True
    )
    return _stock_item_helper(updated_item) if updated_item else None

async def delete_stock_item_service(item_id: str) -> bool:
    """Deletes a stock item by its ID."""
    if not ObjectId.is_valid(item_id):
        raise ValueError("Invalid ObjectId format")
        
    result = await stock_collection.delete_one({"_id": ObjectId(item_id)})
    return result.deleted_count > 0

