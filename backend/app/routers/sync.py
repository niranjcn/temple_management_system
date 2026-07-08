"""
API Router for Database Synchronization
Provides endpoints for manual sync triggers, status checks, and conflict resolution.
"""

from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from datetime import datetime

from ..models.sync_models import (
    SyncLogEntry,
    SyncStats,
    ConflictLog,
    ConflictResolutionRequest,
    SyncConfiguration
)
from ..services.sync_manager_service import get_sync_manager
from ..services.network_monitor_service import get_network_monitor
from ..services.auth_service import get_current_user_with_admin_role
from ..models.admin_models import AdminInDB

router = APIRouter()


@router.post(
    "/sync",
    response_model=SyncLogEntry,
    summary="Trigger Manual Sync",
    description="Manually trigger synchronization between local and remote databases"
)
async def trigger_manual_sync(
    collections: Optional[List[str]] = None,
    current_user: AdminInDB = Depends(get_current_user_with_admin_role)
):
    """
    Manually trigger database synchronization.
    
    - **collections**: Optional list of specific collections to sync (empty = all)
    - Requires admin authentication
    - Returns sync log with detailed statistics
    """
    try:
        sync_manager = await get_sync_manager()
        
        if not sync_manager.is_remote_configured():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Remote database is not configured. Cannot perform sync."
            )
        
        if sync_manager.is_syncing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Sync is already in progress. Please wait for it to complete."
            )
        
        # Trigger sync
        result = await sync_manager.sync_all_collections(
            trigger="manual",
            collections=collections
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sync failed: {str(e)}"
        )


@router.get(
    "/sync/status",
    response_model=SyncStats,
    summary="Get Sync Status",
    description="Get current synchronization status and statistics"
)
async def get_sync_status(
    current_user: AdminInDB = Depends(get_current_user_with_admin_role)
):
    """
    Get current sync status including:
    - Last sync time and duration
    - Number of conflicts
    - Online/offline status
    - Whether sync is currently running
    """
    try:
        sync_manager = await get_sync_manager()
        stats = await sync_manager.get_sync_stats()
        return stats
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get sync status: {str(e)}"
        )


@router.get(
    "/sync/conflicts",
    response_model=List[ConflictLog],
    summary="List Sync Conflicts",
    description="Get list of synchronization conflicts with optional filtering"
)
async def list_conflicts(
    resolved: Optional[bool] = None,
    collection: Optional[str] = None,
    current_user: AdminInDB = Depends(get_current_user_with_admin_role)
):
    """
    List synchronization conflicts.
    
    - **resolved**: Filter by resolution status (true/false/null for all)
    - **collection**: Filter by collection name
    - Returns list of conflicts with details
    """
    try:
        sync_manager = await get_sync_manager()
        conflicts = await sync_manager.get_conflicts(
            resolved=resolved,
            collection=collection
        )
        
        # Convert to ConflictLog models
        result = []
        for conflict in conflicts:
            # Convert _id to string
            conflict_data = {**conflict}
            if "_id" in conflict_data:
                conflict_data["_id"] = str(conflict_data["_id"])
            result.append(conflict_data)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list conflicts: {str(e)}"
        )


@router.post(
    "/sync/conflicts/{conflict_id}/resolve",
    summary="Resolve Conflict",
    description="Resolve a synchronization conflict using specified strategy"
)
async def resolve_conflict(
    conflict_id: str,
    resolution: ConflictResolutionRequest,
    current_user: AdminInDB = Depends(get_current_user_with_admin_role)
):
    """
    Resolve a synchronization conflict.
    
    Strategies:
    - **keep_local**: Keep local version (requires new_value if renaming)
    - **keep_remote**: Discard local changes
    - **merge**: Manual merge (requires new_value)
    - **rename_local**: Rename local unique field
    
    Returns success status and updated conflict log.
    """
    try:
        sync_manager = await get_sync_manager()
        
        success = await sync_manager.resolve_conflict(
            conflict_id=conflict_id,
            strategy=resolution.strategy,
            new_value=resolution.newValue,
            resolved_by=current_user.username,
            notes=resolution.notes
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to resolve conflict. Check logs for details."
            )
        
        return {
            "success": True,
            "message": f"Conflict resolved using {resolution.strategy} strategy",
            "conflict_id": conflict_id,
            "resolved_by": current_user.username,
            "resolved_at": datetime.utcnow()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resolve conflict: {str(e)}"
        )


@router.get(
    "/sync/logs",
    response_model=List[SyncLogEntry],
    summary="Get Sync Logs",
    description="Get history of sync operations"
)
async def get_sync_logs(
    limit: int = 20,
    current_user: AdminInDB = Depends(get_current_user_with_admin_role)
):
    """
    Get sync operation logs.
    
    - **limit**: Maximum number of logs to return (default: 20)
    - Returns list of sync logs ordered by most recent first
    """
    try:
        from ..database import sync_logs_collection
        
        logs = await sync_logs_collection.find({}).sort("startTime", -1).limit(limit).to_list(length=limit)
        
        # Convert ObjectId to string
        for log in logs:
            if "_id" in log:
                log["_id"] = str(log["_id"])
        
        return logs
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get sync logs: {str(e)}"
        )


@router.get(
    "/sync/network-status",
    summary="Get Network Status",
    description="Get current network connectivity status"
)
async def get_network_status(
    current_user: AdminInDB = Depends(get_current_user_with_admin_role)
):
    """
    Get network connectivity monitoring status.
    
    Returns:
    - Whether monitor is running
    - Current online/offline status
    - Last connectivity check time
    - Check interval
    """
    try:
        monitor = await get_network_monitor()
        return monitor.get_status()
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get network status: {str(e)}"
        )


@router.get(
    "/sync/config",
    response_model=SyncConfiguration,
    summary="Get Sync Configuration",
    description="Get current synchronization configuration"
)
async def get_sync_config(
    current_user: AdminInDB = Depends(get_current_user_with_admin_role)
):
    """Get current sync configuration"""
    try:
        sync_manager = await get_sync_manager()
        return sync_manager.config
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get sync config: {str(e)}"
        )


@router.put(
    "/sync/config",
    response_model=SyncConfiguration,
    summary="Update Sync Configuration",
    description="Update synchronization configuration settings"
)
async def update_sync_config(
    config: SyncConfiguration,
    current_user: AdminInDB = Depends(get_current_user_with_admin_role)
):
    """
    Update sync configuration.
    
    Can modify:
    - Auto-sync on reconnect
    - Periodic sync interval
    - Default conflict resolution strategy
    - Collections to sync
    - Batch size and retry settings
    """
    try:
        from ..database import sync_config_collection
        
        # Update configuration in database
        await sync_config_collection.update_one(
            {"_id": "default"},
            {"$set": config.model_dump()},
            upsert=True
        )
        
        # Update in-memory config
        sync_manager = await get_sync_manager()
        sync_manager.config = config
        
        return config
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update sync config: {str(e)}"
        )
