from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List
from ..models.backup_models import (
    BackupTriggerRequest,
    BackupResponse,
    BackupListItem,
    CollectionListItem,
    BackupCollectionData
)
from ..services.backup_service import get_backup_service
from ..database import get_primary_database_type
from ..services.auth_service import get_current_admin

router = APIRouter()

async def verify_local_mode():
    """Dependency to verify we're in local mode"""
    primary_db = get_primary_database_type()
    if primary_db != "local":
        raise HTTPException(
            status_code=403,
            detail=f"Backup operations are only available in LOCAL mode. Current mode: {primary_db}"
        )

async def verify_admin_permissions(current_admin: dict = Depends(get_current_admin)):
    """Verify user has admin permissions (role_id <= 1)"""
    role_id = current_admin.get("role_id", 99)
    if role_id > 1:
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions. Only Super Admin and Admin can manage backups."
        )
    return current_admin

@router.post("/backup", response_model=BackupResponse)
async def trigger_backup(
    request: BackupTriggerRequest,
    with_cleanup: bool = False,
    current_admin: dict = Depends(verify_admin_permissions),
    _: None = Depends(verify_local_mode)
):
    """
    Trigger backup operation: [cleanup →] sync → backup → delete
    
    **Workflow**:
    1. [Optional] Cleanup old tokens and fetch remote security collections
    2. Sync local database with remote Atlas
    3. Create backup of local database
    4. Delete activities collection (automatic)
    5. Delete bookings and employee_bookings (if requested)
    6. [Optional] Delete security collections (login_attempts, token_revocation, etc.)
    
    **Parameters**:
    - delete_bookings: Whether to delete bookings and employee_bookings after backup
    - with_cleanup: Whether to perform security cleanup (query parameter)
    
    **Permissions**: Super Admin and Admin only
    """
    try:
        backup_service = await get_backup_service()
        
        result = await backup_service.trigger_backup(
            delete_bookings=request.delete_bookings,
            created_by=current_admin.get("username", "unknown"),
            with_cleanup=with_cleanup
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Backup failed")
            )
        
        return BackupResponse(
            success=True,
            backup_id=result["backup_id"],
            backup_path=result["backup_path"],
            backup_timestamp=result["backup_timestamp"],
            sync_status=result["sync_status"],
            collections_backed_up=result["collections_backed_up"],
            collections_deleted_local=result["collections_deleted_local"],
            collections_deleted_remote=result.get("collections_deleted_remote", []),
            message=result["message"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Backup operation failed: {str(e)}"
        )

@router.get("/backups", response_model=List[BackupListItem])
async def list_backups(
    current_admin: dict = Depends(verify_admin_permissions),
    _: None = Depends(verify_local_mode)
):
    """
    List all available backups
    
    Returns a list of all backup folders with metadata.
    
    **Permissions**: Super Admin and Admin only
    """
    try:
        backup_service = await get_backup_service()
        backups = await backup_service.list_backups()
        
        return [BackupListItem(**backup) for backup in backups]
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list backups: {str(e)}"
        )

@router.get("/backups/{backup_id}/collections", response_model=List[CollectionListItem])
async def list_collections_in_backup(
    backup_id: str,
    current_admin: dict = Depends(verify_admin_permissions),
    _: None = Depends(verify_local_mode)
):
    """
    List all collections in a specific backup
    
    **Parameters**:
    - backup_id: The ID of the backup (YYYYMMDD_HHMMSS format)
    
    **Permissions**: Super Admin and Admin only
    """
    try:
        backup_service = await get_backup_service()
        collections = await backup_service.list_collections_in_backup(backup_id)
        
        return [CollectionListItem(**collection) for collection in collections]
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list collections: {str(e)}"
        )

@router.get("/backups/{backup_id}/collections/{collection_name}", response_model=BackupCollectionData)
async def get_collection_data(
    backup_id: str,
    collection_name: str,
    current_admin: dict = Depends(verify_admin_permissions),
    _: None = Depends(verify_local_mode)
):
    """
    Get all documents from a backed-up collection
    
    **Parameters**:
    - backup_id: The ID of the backup (YYYYMMDD_HHMMSS format)
    - collection_name: Name of the collection to retrieve
    
    **Returns**: All documents in the collection as JSON
    
    **Permissions**: Super Admin and Admin only
    """
    try:
        backup_service = await get_backup_service()
        data = await backup_service.get_collection_data(backup_id, collection_name)
        
        return BackupCollectionData(**data)
        
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get collection data: {str(e)}"
        )

@router.get("/backup/status")
async def get_backup_status(
    current_admin: dict = Depends(verify_admin_permissions)
):
    """
    Get backup system status and configuration
    
    **Permissions**: Super Admin and Admin only
    """
    try:
        from ..database import is_sync_enabled
        
        primary_db = get_primary_database_type()
        sync_enabled = is_sync_enabled()
        
        return {
            "primary_database": primary_db,
            "backup_available": primary_db == "local",
            "sync_enabled": sync_enabled,
            "message": (
                "Backup system ready" if primary_db == "local"
                else "Backup system disabled (not in local mode)"
            )
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get backup status: {str(e)}"
        )

@router.post("/backup/sync")
async def trigger_manual_sync(
    current_admin: dict = Depends(verify_admin_permissions)
):
    """
    Trigger manual on-demand database synchronization
    
    **Workflow**:
    1. Check if sync is enabled (remote database configured)
    2. Perform bidirectional sync (local ↔ remote)
    3. Return detailed sync results
    
    **Permissions**: Super Admin and Admin only
    """
    try:
        from ..database import is_sync_enabled
        
        # Check if sync is enabled
        if not is_sync_enabled():
            raise HTTPException(
                status_code=400,
                detail="Sync not available: Remote database not configured. Set MONGODB_CLOUD_URL in .env"
            )
        
        # Import sync manager
        try:
            from ..services.sync_manager_service import get_sync_manager
            sync_manager = await get_sync_manager()
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to initialize sync manager: {str(e)}"
            )
        
        if sync_manager is None:
            raise HTTPException(
                status_code=500,
                detail="Sync manager not available"
            )
        
        if sync_manager.config is None:
            raise HTTPException(
                status_code=400,
                detail="Sync not configured. Please configure sync settings first."
            )
        
        # Perform sync
        try:
            sync_result = await sync_manager.sync_all_collections(trigger="manual")
        except ValueError as ve:
            # Handle specific errors like "sync already in progress"
            raise HTTPException(
                status_code=409,
                detail=str(ve)
            )
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Sync execution failed: {str(e)}"
            )
        
        # Calculate totals
        total_pushed = sum(sync_result.localToRemote.values())
        total_pulled = sum(sync_result.remoteToLocal.values())
        total_conflicts = sum(sync_result.conflicts.values())
        
        # Prepare response
        return {
            "success": sync_result.status in ["completed", "partial"],
            "status": sync_result.status,
            "trigger": sync_result.trigger,
            "duration_seconds": sync_result.durationSeconds,
            "collections_synced": len(sync_result.collections),
            "total_pushed": total_pushed,
            "total_pulled": total_pulled,
            "total_conflicts": total_conflicts,
            "errors": sync_result.errors,
            "details": {
                "local_to_remote": sync_result.localToRemote,
                "remote_to_local": sync_result.remoteToLocal,
                "conflicts": sync_result.conflicts
            },
            "message": (
                f"Sync completed successfully in {sync_result.durationSeconds:.2f}s"
                if sync_result.status == "completed"
                else f"Sync {sync_result.status}: {'; '.join(sync_result.errors)}"
            )
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Manual sync failed: {str(e)}"
        )

@router.get("/backup/security-collections-count")
async def get_security_collections_count(
    current_admin: dict = Depends(verify_admin_permissions)
):
    """
    Get document count for security collections in local and remote databases.
    Useful for verifying cleanup worked correctly.
    
    **Permissions**: Super Admin and Admin only
    """
    try:
        from ..database import (
            get_local_database,
            get_remote_database,
            is_sync_enabled,
            login_attempts_collection,
            token_revocation_collection,
            user_sessions_collection,
            device_fingerprints_collection,
            security_events_collection
        )
        
        local_counts = {}
        remote_counts = {}
        
        # Count local collections
        security_collections = {
            "login_attempts": login_attempts_collection,
            "token_revocation": token_revocation_collection,
            "user_sessions": user_sessions_collection,
            "device_fingerprints": device_fingerprints_collection,
            "security_events": security_events_collection
        }
        
        for name, collection in security_collections.items():
            local_counts[name] = await collection.count_documents({})
        
        # Count remote collections if available
        if is_sync_enabled():
            remote_db = get_remote_database()
            if remote_db is not None:
                for name in security_collections.keys():
                    remote_collection = remote_db.get_collection(name)
                    remote_counts[name] = await remote_collection.count_documents({})
        
        total_local = sum(local_counts.values())
        total_remote = sum(remote_counts.values())
        
        return {
            "local": local_counts,
            "remote": remote_counts,
            "totals": {
                "local": total_local,
                "remote": total_remote,
                "combined": total_local + total_remote
            },
            "message": (
                "All security collections are empty" 
                if total_local == 0 and total_remote == 0 
                else f"Found {total_local} local and {total_remote} remote security documents"
            )
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to count security collections: {str(e)}"
        )
