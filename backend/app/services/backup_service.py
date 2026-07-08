import os
import json
import shutil
import logging
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from pathlib import Path
import subprocess
from bson import decode_all, ObjectId
from bson.json_util import dumps
from ..database import (
    get_local_database,
    get_remote_database,
    is_sync_enabled,
    get_primary_database_type,
    bookings_collection,
    employee_bookings_collection,
    activities_collection,
    backup_metadata_collection,
    DATABASE_NAME
)
from ..models.backup_models import BackupMetadata, BackupStatus, SyncStatus

logger = logging.getLogger(__name__)


class BackupService:
    """Service for managing database backups with sync and deletion"""
    
    def __init__(self):
        self.backup_base_path = Path(__file__).parent.parent.parent / "backups"
        self.backup_base_path.mkdir(exist_ok=True)
        
    async def validate_local_mode(self) -> bool:
        """Validate that we're running in local mode"""
        primary_db = get_primary_database_type()
        if primary_db != "local":
            raise ValueError(
                f"Backup operations are only available in LOCAL mode. "
                f"Current PRIMARY_DATABASE: {primary_db}"
            )
        return True
    
    async def sync_databases(self) -> Tuple[bool, str]:
        """
        Sync local database with remote before backup.
        Returns (success, status_message)
        """
        try:
            if not is_sync_enabled():
                return True, "Sync skipped: Remote database not configured"
            
            # Use existing sync manager service
            from ..services.sync_manager_service import get_sync_manager
            
            try:
                sync_manager = await get_sync_manager()
            except Exception as e:
                return False, f"Failed to initialize sync manager: {str(e)}"
            
            if sync_manager is None:
                return False, "Sync manager not available"
            
            if sync_manager.config is None or not sync_manager.config.autoSyncEnabled:
                return True, "Sync skipped: Auto-sync is disabled in configuration"
            
            # Perform bidirectional sync (using "manual" as trigger)
            try:
                sync_result = await sync_manager.sync_all_collections(trigger="manual")
            except ValueError as ve:
                # Handle "sync already in progress" or "remote not configured"
                return False, f"Sync not available: {str(ve)}"
            except Exception as e:
                return False, f"Sync execution failed: {str(e)}"
            
            # SyncLogEntry object - access attributes, not dictionary keys
            if sync_result.status == "completed":
                summary = f"Synced {len(sync_result.collections)} collections in {sync_result.durationSeconds:.2f}s"
                return True, f"Sync completed: {summary}"
            elif sync_result.status == "partial":
                summary = f"Partial sync: {len(sync_result.errors)} errors"
                return True, f"Sync partially completed: {summary}"
            else:
                error_msg = "; ".join(sync_result.errors) if sync_result.errors else "Unknown error"
                return False, f"Sync failed: {error_msg}"
                
        except Exception as e:
            return False, f"Sync error: {str(e)}"
    
    async def create_backup(self, backup_id: str, backup_path: Path) -> Tuple[bool, List[str], Optional[str]]:
        """
        Create backup of local MongoDB using mongodump.
        Returns (success, collections_backed_up, error_message)
        """
        try:
            local_db = get_local_database()
            if local_db is None:
                return False, [], "Local database not available"
            
            # Get MongoDB connection string from env
            mongodb_local_url = os.getenv("MONGODB_LOCAL_URL", "")
            if not mongodb_local_url:
                return False, [], "MONGODB_LOCAL_URL not configured"
            
            # Create backup directory
            backup_path.mkdir(parents=True, exist_ok=True)
            
            # Build mongodump command
            # Note: Using list-based command (not shell=True) to prevent injection attacks
            dump_command = [
                "mongodump",
                f"--uri={mongodb_local_url}",
                f"--db={DATABASE_NAME}",
                f"--out={backup_path}"
            ]
            
            # Execute mongodump with timeout and capture output
            # subprocess.run with list args (no shell=True) is secure against injection
            result = subprocess.run(
                dump_command,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minute timeout
                check=False  # Explicitly handle return codes
            )
            
            if result.returncode != 0:
                error_msg = result.stderr or "Unknown mongodump error"
                return False, [], f"Mongodump failed: {error_msg}"
            
            # Get list of backed up collections
            db_backup_path = backup_path / DATABASE_NAME
            if not db_backup_path.exists():
                return False, [], "Backup directory not created"
            
            collections = [
                f.stem for f in db_backup_path.glob("*.bson")
            ]
            
            # Create metadata file
            metadata = {
                "backup_id": backup_id,
                "timestamp": datetime.utcnow().isoformat(),
                "database_name": DATABASE_NAME,
                "collections": collections,
                "total_collections": len(collections)
            }
            
            metadata_file = backup_path / "metadata.json"
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            return True, collections, None
            
        except subprocess.TimeoutExpired:
            return False, [], "Backup operation timed out"
        except Exception as e:
            return False, [], f"Backup error: {str(e)}"
    
    async def delete_collections_local(self, delete_bookings: bool) -> Tuple[List[str], Optional[str]]:
        """
        Delete collections from local database after backup.
        Returns (deleted_collections, error_message)
        """
        try:
            deleted = []
            
            # Always delete activities collection
            result = await activities_collection.delete_many({})
            deleted.append(f"activities ({result.deleted_count} documents)")
            
            # Delete bookings if requested
            if delete_bookings:
                bookings_result = await bookings_collection.delete_many({})
                deleted.append(f"bookings ({bookings_result.deleted_count} documents)")
                
                employee_result = await employee_bookings_collection.delete_many({})
                deleted.append(f"employee_bookings ({employee_result.deleted_count} documents)")
            
            return deleted, None
            
        except Exception as e:
            return [], f"Local deletion error: {str(e)}"
    
    async def delete_collections_remote(self, delete_bookings: bool) -> Tuple[List[str], Optional[str]]:
        """
        Delete collections from remote database after backup.
        Returns (deleted_collections, error_message)
        """
        try:
            remote_db = get_remote_database()
            if remote_db is None:
                return [], "Remote database not available"
            
            deleted = []
            
            # Get remote collections
            remote_activities = remote_db.get_collection("activities")
            remote_bookings = remote_db.get_collection("bookings")
            remote_employee_bookings = remote_db.get_collection("employee_bookings")
            
            # Always delete activities collection
            result = await remote_activities.delete_many({})
            deleted.append(f"activities ({result.deleted_count} documents)")
            
            # Delete bookings if requested
            if delete_bookings:
                bookings_result = await remote_bookings.delete_many({})
                deleted.append(f"bookings ({bookings_result.deleted_count} documents)")
                
                employee_result = await remote_employee_bookings.delete_many({})
                deleted.append(f"employee_bookings ({employee_result.deleted_count} documents)")
            
            return deleted, None
            
        except Exception as e:
            return [], f"Remote deletion error: {str(e)}"
    
    async def trigger_backup(
        self,
        delete_bookings: bool,
        created_by: str,
        with_cleanup: bool = False
    ) -> Dict:
        """
        Main backup workflow: [cleanup →] sync → backup → delete
        
        Args:
            delete_bookings: Whether to delete bookings after backup
            created_by: Username of admin triggering backup
            with_cleanup: Whether to perform security cleanup (tokens, sessions, etc.)
        """
        try:
            # Validate local mode
            await self.validate_local_mode()
        except ValueError as ve:
            return {
                "success": False,
                "error": str(ve)
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Validation error: {str(e)}"
            }
        
        # Generate backup ID and path
        backup_timestamp = datetime.utcnow()
        backup_id = backup_timestamp.strftime("%Y%m%d_%H%M%S")
        backup_path = self.backup_base_path / f"backup_{backup_id}"
        
        # Initialize metadata
        metadata = BackupMetadata(
            backup_id=backup_id,
            backup_timestamp=backup_timestamp,
            backup_path=str(backup_path),
            status=BackupStatus.IN_PROGRESS,
            sync_status=SyncStatus.IN_PROGRESS,
            collections_backed_up=[],
            collections_deleted_local=[],
            collections_deleted_remote=[],
            delete_bookings_requested=delete_bookings,
            created_by=created_by
        )
        
        cleanup_result = None
        
        try:
            # Step 0: Cleanup security collections if requested
            if with_cleanup:
                try:
                    from ..services.cleanup_service import get_cleanup_service
                    cleanup_service = await get_cleanup_service()
                    cleanup_result = await cleanup_service.perform_full_cleanup()
                    
                    if not cleanup_result.get("success"):
                        logger.warning(f"Cleanup had issues: {cleanup_result.get('error')}")
                except Exception as e:
                    logger.error(f"Cleanup failed: {e}")
                    cleanup_result = {"success": False, "error": str(e)}
            
            # Step 1: Sync databases
            try:
                sync_success, sync_message = await self.sync_databases()
                metadata.sync_status = SyncStatus.SUCCESS if sync_success else SyncStatus.FAILED
            except Exception as e:
                sync_success = False
                sync_message = f"Sync exception: {str(e)}"
                metadata.sync_status = SyncStatus.FAILED
            
            if not sync_success:
                metadata.status = BackupStatus.FAILED
                metadata.error_message = f"Sync failed: {sync_message}"
                try:
                    await backup_metadata_collection.insert_one(metadata.model_dump())
                except Exception as db_error:
                    print(f"Warning: Could not save backup metadata: {db_error}")
                return {
                    "success": False,
                    "error": metadata.error_message,
                    "sync_message": sync_message
                }
            
            # Step 2: Create backup
            try:
                backup_success, collections_backed_up, backup_error = await self.create_backup(
                    backup_id, backup_path
                )
            except Exception as e:
                backup_success = False
                collections_backed_up = []
                backup_error = f"Backup exception: {str(e)}"
            
            if not backup_success:
                metadata.status = BackupStatus.FAILED
                metadata.error_message = backup_error
                try:
                    await backup_metadata_collection.insert_one(metadata.model_dump())
                except Exception as db_error:
                    print(f"Warning: Could not save backup metadata: {db_error}")
                return {
                    "success": False,
                    "error": backup_error,
                    "sync_message": sync_message
                }
            
            metadata.collections_backed_up = collections_backed_up
            
            # Step 3: Delete collections locally
            try:
                deleted_local, local_error = await self.delete_collections_local(delete_bookings)
            except Exception as e:
                deleted_local = []
                local_error = f"Local deletion exception: {str(e)}"
            
            if local_error:
                metadata.status = BackupStatus.PARTIAL
                metadata.error_message = local_error
            else:
                metadata.collections_deleted_local = deleted_local
            
            # Step 4: Delete collections remotely (if sync is enabled)
            if is_sync_enabled():
                try:
                    deleted_remote, remote_error = await self.delete_collections_remote(delete_bookings)
                except Exception as e:
                    deleted_remote = []
                    remote_error = f"Remote deletion exception: {str(e)}"
                
                if remote_error:
                    metadata.status = BackupStatus.PARTIAL
                    metadata.error_message = (
                        metadata.error_message or ""
                    ) + f"; {remote_error}"
                else:
                    metadata.collections_deleted_remote = deleted_remote
            else:
                metadata.collections_deleted_remote = []
            
            # Step 5: Delete security collections if cleanup was performed
            security_cleanup_stats = None
            if with_cleanup and cleanup_result and cleanup_result.get("success"):
                logger.info("🗑️  Starting security collections deletion...")
                try:
                    from ..services.cleanup_service import get_cleanup_service
                    cleanup_service = await get_cleanup_service()
                    
                    # Delete from local
                    logger.info("Deleting security collections from LOCAL database...")
                    local_security = await cleanup_service.delete_security_collections_local()
                    logger.info(f"Local deletion complete: {local_security}")
                    
                    # Delete from remote
                    logger.info("Deleting security collections from REMOTE database...")
                    remote_security = await cleanup_service.delete_security_collections_remote()
                    logger.info(f"Remote deletion complete: {remote_security}")
                    
                    security_cleanup_stats = {
                        "local": local_security,
                        "remote": remote_security
                    }
                    
                    logger.info(f"✓ Security collections cleaned up successfully: {security_cleanup_stats}")
                    
                except Exception as e:
                    logger.error(f"❌ Failed to delete security collections: {e}")
                    import traceback
                    logger.error(traceback.format_exc())
                    security_cleanup_stats = {"error": str(e)}
                    # Don't fail the entire backup if cleanup deletion fails
                    metadata.status = BackupStatus.PARTIAL
                    if not metadata.error_message:
                        metadata.error_message = ""
                    metadata.error_message += f"; Security cleanup deletion failed: {str(e)}"
            elif with_cleanup and (not cleanup_result or not cleanup_result.get("success")):
                logger.warning(f"⚠️  Skipping security deletion because cleanup failed: {cleanup_result}")
                security_cleanup_stats = {"skipped": True, "reason": "cleanup_failed"}
            
            # Set final status
            if metadata.status != BackupStatus.PARTIAL:
                metadata.status = BackupStatus.SUCCESS
            
            # Save metadata
            try:
                await backup_metadata_collection.insert_one(metadata.model_dump())
            except Exception as db_error:
                print(f"Warning: Could not save backup metadata: {db_error}")
            
            result = {
                "success": True,
                "backup_id": backup_id,
                "backup_path": str(backup_path),
                "backup_timestamp": backup_timestamp.isoformat(),
                "sync_status": metadata.sync_status,
                "sync_message": sync_message,
                "collections_backed_up": collections_backed_up,
                "collections_deleted_local": deleted_local,
                "collections_deleted_remote": metadata.collections_deleted_remote,
                "message": "Backup completed successfully" if metadata.status == BackupStatus.SUCCESS else "Backup completed with warnings"
            }
            
            # Add cleanup stats if cleanup was performed
            if with_cleanup:
                result["cleanup_performed"] = True
                result["cleanup_result"] = cleanup_result
                result["security_cleanup_stats"] = security_cleanup_stats
            
            return result
            
        except Exception as e:
            metadata.status = BackupStatus.FAILED
            metadata.error_message = f"Unexpected error: {str(e)}"
            try:
                await backup_metadata_collection.insert_one(metadata.model_dump())
            except Exception as db_error:
                print(f"Warning: Could not save backup metadata: {db_error}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def list_backups(self) -> List[Dict]:
        """List all available backups"""
        try:
            backups = []
            
            for backup_dir in sorted(self.backup_base_path.glob("backup_*"), reverse=True):
                if not backup_dir.is_dir():
                    continue
                
                metadata_file = backup_dir / "metadata.json"
                if metadata_file.exists():
                    with open(metadata_file, 'r') as f:
                        metadata = json.load(f)
                    
                    backups.append({
                        "backup_id": metadata.get("backup_id", backup_dir.name),
                        "backup_date": metadata.get("timestamp", "Unknown")[:10],
                        "backup_timestamp": metadata.get("timestamp", "Unknown"),
                        "status": "success",
                        "collections_count": metadata.get("total_collections", 0)
                    })
                else:
                    # Fallback if metadata doesn't exist
                    backups.append({
                        "backup_id": backup_dir.name.replace("backup_", ""),
                        "backup_date": backup_dir.name.replace("backup_", "")[:8],
                        "backup_timestamp": "Unknown",
                        "status": "unknown",
                        "collections_count": 0
                    })
            
            return backups
            
        except Exception as e:
            raise Exception(f"Failed to list backups: {str(e)}")
    
    async def list_collections_in_backup(self, backup_id: str) -> List[Dict]:
        """List all collections in a specific backup"""
        try:
            backup_path = self.backup_base_path / f"backup_{backup_id}" / DATABASE_NAME
            
            if not backup_path.exists():
                raise FileNotFoundError(f"Backup {backup_id} not found")
            
            collections = []
            for bson_file in backup_path.glob("*.bson"):
                collection_name = bson_file.stem
                file_size = bson_file.stat().st_size
                
                # Count documents
                with open(bson_file, 'rb') as f:
                    documents = decode_all(f.read())
                    doc_count = len(documents)
                
                collections.append({
                    "collection_name": collection_name,
                    "document_count": doc_count,
                    "file_size": f"{file_size / 1024:.2f} KB"
                })
            
            return collections
            
        except Exception as e:
            raise Exception(f"Failed to list collections: {str(e)}")
    
    async def get_collection_data(self, backup_id: str, collection_name: str) -> Dict:
        """Get all documents from a backed-up collection"""
        try:
            bson_file = (
                self.backup_base_path / 
                f"backup_{backup_id}" / 
                DATABASE_NAME / 
                f"{collection_name}.bson"
            )
            
            if not bson_file.exists():
                raise FileNotFoundError(
                    f"Collection {collection_name} not found in backup {backup_id}"
                )
            
            # Read and decode BSON
            with open(bson_file, 'rb') as f:
                documents = decode_all(f.read())
            
            # Convert to JSON-serializable format
            json_documents = []
            for doc in documents:
                # Convert ObjectId and datetime to strings
                json_doc = json.loads(dumps(doc))
                json_documents.append(json_doc)
            
            return {
                "collection_name": collection_name,
                "documents": json_documents,
                "total_documents": len(json_documents)
            }
            
        except Exception as e:
            raise Exception(f"Failed to get collection data: {str(e)}")

# Singleton instance
_backup_service: Optional[BackupService] = None

async def get_backup_service() -> BackupService:
    """Get or create backup service singleton"""
    global _backup_service
    if _backup_service is None:
        _backup_service = BackupService()
    return _backup_service
