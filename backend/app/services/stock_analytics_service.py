from typing import Any, Dict, List, Literal
from datetime import datetime
from ..database import stock_collection

Period = Literal["monthly", "yearly", "category"]
AnalyticsPeriod = Literal["monthly", "yearly"]

async def _get_stock_analytics_data(period: AnalyticsPeriod, year: int) -> List[Dict[str, Any]]:
    """Runs a MongoDB aggregation to get stock analytics by month or year."""
    group_id = {"year": {"$year": "$addedOn"}}
    if period == "monthly":
        group_id["month"] = {"$month": "$addedOn"}

    pipeline = [
        {"$match": {"addedOn": {"$gte": datetime(year, 1, 1), "$lt": datetime(year + 1, 1, 1)}}},
        {
            "$group": {
                "_id": group_id,
                "totalItems": {"$sum": "$quantity"},
                "totalValue": {"$sum": {"$multiply": ["$quantity", "$price"]}},
                "lowStockItems": {"$sum": {"$cond": [{"$lte": ["$quantity", "$minimumStock"]}, 1, 0]}},
                "newItemsAdded": {"$sum": 1}
            }
        },
        {
            "$project": {
                "_id": 0, "year": "$_id.year",
                "month": {
                    "$let": {
                        "vars": {"months": ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]},
                        "in": {"$arrayElemAt": ["$$months", "$_id.month"]}
                    }
                } if period == "monthly" else "$$REMOVE",
                "totalItems": 1, "totalValue": 1, "lowStockItems": 1, "newItemsAdded": 1
            }
        },
        {"$sort": {"year": 1, "month": 1} if period == "monthly" else {"year": 1}}
    ]
    if period == "yearly" and "month" in pipeline[-1]["$sort"]:
        del pipeline[-1]["$sort"]["month"]

    return await stock_collection.aggregate(pipeline).to_list(None)

async def _get_stock_analytics_by_category(year: int) -> List[Dict[str, Any]]:
    """Runs a MongoDB aggregation to get stock analytics grouped by category."""
    pipeline = [
        {"$match": {"addedOn": {"$gte": datetime(year, 1, 1), "$lt": datetime(year + 1, 1, 1)}}},
        {"$group": {"_id": "$category", "totalItems": {"$sum": "$quantity"}, "totalValue": {"$sum": {"$multiply": ["$quantity", "$price"]}}}},
        {
            "$lookup": {
                "from": "stock", "let": {"target_year": year},
                "pipeline": [
                    {"$match": {"$expr": {"$eq": [{"$year": "$addedOn"}, "$$target_year"]}}},
                    {"$group": {"_id": None, "overallValue": {"$sum": {"$multiply": ["$quantity", "$price"]}}}}
                ],
                "as": "overall_total"
            }
        },
        {"$unwind": "$overall_total"},
        {
            "$project": {
                "_id": 0, "category": "$_id", "totalItems": 1, "totalValue": 1,
                "percentage": {
                    "$cond": [
                        {"$eq": ["$overall_total.overallValue", 0]}, 0,
                        {"$multiply": [{"$divide": ["$totalValue", "$overall_total.overallValue"]}, 100]}
                    ]
                }
            }
        },
        {"$sort": {"totalValue": -1}}
    ]
    results = await stock_collection.aggregate(pipeline).to_list(None)
    for res in results:
        res["percentage"] = round(res.get("percentage", 0), 2)
    return results

async def get_stock_analytics_service(period: Period, year: int) -> List[Dict[str, Any]]:
    """
    Business-layer entry to retrieve stock analytics.
    Delegates to the appropriate aggregation logic.
    """
    if period == "category":
        return await _get_stock_analytics_by_category(year)
    return await _get_stock_analytics_data(period, year)

async def get_stock_category_analytics_service(year: int) -> List[Dict[str, Any]]:
    """
    Explicit category analytics for consumers that prefer a dedicated method.
    """
    return await _get_stock_analytics_by_category(year)

