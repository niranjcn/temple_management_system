"""
Robust Two-Way Synchronization System for MongoDB
Handles automatic sync between local and remote databases with conflict resolution.
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
import logging

from ..database import (
    get_local_database,
    get_remote_database,
    is_sync_enabled,
    get_primary_database_type,
    conflict_logs_collection,
    sync_logs_collection,
    sync_config_collection
)
from ..models.sync_models import (
    ConflictLog,
    SyncLogEntry,
    SyncConfiguration,
    SyncStats,
    SyncStatus,
    SyncOrigin
)

logger = logging.getLogger(__name__)


class SyncManager:
    """
    Manages two-way synchronization between local and remote MongoDB databases.
    
    Features:
    - Automatic sync on internet reconnection
    - Delta-based sync (only changed documents)
    - Conflict detection and resolution
    - Unique field handling (username in admins collection)
    - Resilient sync with resume capability
    """
    
    def __init__(self):
        self.local_db = get_local_database()
        self.remote_db = get_remote_database()
        self.is_syncing = False
        self.last_sync_time: Optional[datetime] = None
        self.config: Optional[SyncConfiguration] = None
        
        # Collections to exclude from sync (security-related, managed separately)
        self.excluded_collections = {
            "login_attempts",
            "token_revocation", 
            "user_sessions",
            "device_fingerprints",
            "security_events"
        }
        
        # Unique field mapping per collection
        self.unique_fields_map = {
            "admins": ["username"],  # username is unique in admins collection
            # Add other collections with unique fields if needed
        }
        
    async def initialize(self):
        """Initialize sync manager and load configuration"""
        try:
            # Load or create default configuration
            config_doc = await sync_config_collection.find_one({"_id": "default"})
            if config_doc:
                self.config = SyncConfiguration(**config_doc)
            else:
                # Create default configuration
                self.config = SyncConfiguration()
                await sync_config_collection.insert_one({
                    "_id": "default",
                    **self.config.model_dump()
                })
            
            logger.info("✓ SyncManager initialized successfully")
            
            # Create indexes for sync collections
            await self._ensure_sync_indexes()
            
        except Exception as e:
            logger.error(f"Failed to initialize SyncManager: {e}")
            raise
    
    async def _ensure_sync_indexes(self):
        """Create necessary indexes for sync operations"""
        try:
            # Conflict logs indexes
            await conflict_logs_collection.create_index([("collection", 1), ("resolved", 1)])
            await conflict_logs_collection.create_index([("localId", 1)])
            await conflict_logs_collection.create_index([("timestamp", -1)])
            
            # Sync logs indexes
            await sync_logs_collection.create_index([("startTime", -1)])
            await sync_logs_collection.create_index([("status", 1)])
            
            logger.info("✓ Sync indexes ensured")
        except Exception as e:
            logger.warning(f"Could not create sync indexes: {e}")
    
    def is_remote_configured(self) -> bool:
        """Check if sync is enabled and remote database is available"""
        return is_sync_enabled() and self.remote_db is not None
    
    async def get_sync_stats(self) -> SyncStats:
        """Get current synchronization statistics"""
        try:
            unresolved_conflicts = await conflict_logs_collection.count_documents({"resolved": False})
            
            # Get latest sync log
            latest_sync = await sync_logs_collection.find_one(
                {},
                sort=[("startTime", -1)]
            )
            
            stats = SyncStats(
                lastSyncTime=latest_sync.get("startTime") if latest_sync else None,
                lastSyncStatus=latest_sync.get("status") if latest_sync else None,
                lastSyncDuration=latest_sync.get("durationSeconds") if latest_sync else None,
                totalSyncsCompleted=await sync_logs_collection.count_documents({"status": "completed"}),
                totalConflicts=await conflict_logs_collection.count_documents({}),
                unresolvedConflicts=unresolved_conflicts,
                isOnline=self.is_remote_configured(),
                isSyncing=self.is_syncing
            )
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get sync stats: {e}")
            return SyncStats(isOnline=self.is_remote_configured(), isSyncing=self.is_syncing)
    
    async def sync_all_collections(
        self,
        trigger: str = "manual",
        collections: Optional[List[str]] = None
    ) -> SyncLogEntry:
        """
        Perform complete two-way sync for all configured collections.
        
        Args:
            trigger: How sync was initiated (manual, automatic, scheduled, reconnect)
            collections: Specific collections to sync (None = all configured)
        
        Returns:
            SyncLogEntry with results and statistics
        """
        if not self.is_remote_configured():
            logger.warning("Remote database not configured. Sync cannot proceed.")
            raise ValueError("Remote database not configured")
        
        if self.is_syncing:
            logger.warning("Sync already in progress")
            raise ValueError("Sync already in progress")
        
        self.is_syncing = True
        
        # Filter out excluded collections (security-related)
        collections_to_sync = collections or self.config.collectionsToSync
        collections_to_sync = [
            col for col in collections_to_sync 
            if col not in self.excluded_collections
        ]
        
        sync_log = SyncLogEntry(
            trigger=trigger,
            collections=collections_to_sync
        )
        
        try:
            start_time = datetime.utcnow()
            
            # Sync each collection
            for collection_name in sync_log.collections:
                logger.info(f"🔄 Syncing collection: {collection_name}")
                
                try:
                    result = await self._sync_collection(collection_name)
                    
                    # Update statistics
                    sync_log.localToRemote[collection_name] = result["pushed"]
                    sync_log.remoteToLocal[collection_name] = result["pulled"]
                    sync_log.conflicts[collection_name] = result["conflicts"]
                    
                except Exception as e:
                    error_msg = f"Error syncing {collection_name}: {str(e)}"
                    logger.error(error_msg)
                    sync_log.errors.append(error_msg)
            
            # Calculate duration
            end_time = datetime.utcnow()
            sync_log.endTime = end_time
            sync_log.durationSeconds = (end_time - start_time).total_seconds()
            
            # Determine overall status
            if len(sync_log.errors) == 0:
                sync_log.status = "completed"
            elif len(sync_log.errors) < len(sync_log.collections):
                sync_log.status = "partial"
            else:
                sync_log.status = "failed"
            
            self.last_sync_time = end_time
            
            logger.info(f"✓ Sync completed: {sync_log.status} in {sync_log.durationSeconds:.2f}s")
            
        except Exception as e:
            logger.error(f"Sync failed: {e}")
            sync_log.status = "failed"
            sync_log.errors.append(str(e))
            sync_log.endTime = datetime.utcnow()
            
        finally:
            self.is_syncing = False
            
            # Save sync log to database
            await sync_logs_collection.insert_one(sync_log.model_dump())
        
        return sync_log
    
    async def _sync_collection(self, collection_name: str) -> Dict[str, int]:
        """
        Sync a single collection between local and remote databases.
        
        Returns:
            Dictionary with counts: pushed, pulled, conflicts
        """
        local_collection = self.local_db.get_collection(collection_name)
        remote_collection = self.remote_db.get_collection(collection_name)
        
        stats = {"pushed": 0, "pulled": 0, "conflicts": 0}
        
        # Phase 1: Push local changes to remote
        stats["pushed"], conflicts_push = await self._push_local_changes(
            collection_name,
            local_collection,
            remote_collection
        )
        stats["conflicts"] += conflicts_push
        
        # Phase 2: Pull remote changes to local
        stats["pulled"], conflicts_pull = await self._pull_remote_changes(
            collection_name,
            local_collection,
            remote_collection
        )
        stats["conflicts"] += conflicts_pull
        
        return stats
    
    async def _push_local_changes(
        self,
        collection_name: str,
        local_collection,
        remote_collection
    ) -> Tuple[int, int]:
        """
        Push local changes to remote database.
        
        Returns:
            Tuple of (documents_pushed, conflicts_detected)
        """
        pushed_count = 0
        conflicts_count = 0
        
        try:
            # Find documents that need syncing (updated_at > synced_at or synced_at is None)
            # IMPORTANT: Exclude documents with sync_origin = "cloud" or "remote" as they originated from remote
            # This prevents pushing back records that were created by mobile apps with cloud origin
            query = {
                "$and": [
                    {
                        "$or": [
                            {"synced_at": {"$exists": False}},
                            {"synced_at": None},
                            {"$expr": {"$gt": ["$updated_at", "$synced_at"]}}
                        ]
                    },
                    {
                        "$or": [
                            {"sync_origin": {"$exists": False}},
                            {"sync_origin": None},
                            {"sync_origin": {"$nin": ["cloud", "remote"]}}
                        ]
                    }
                ]
            }
            
            local_docs = await local_collection.find(query).to_list(length=None)
            
            for doc in local_docs:
                try:
                    doc_id = doc["_id"]
                    
                    # Check if document exists on remote
                    remote_doc = await remote_collection.find_one({"_id": doc_id})
                    
                    if remote_doc:
                        # Update existing document
                        # Check for conflicts on unique fields
                        if await self._has_unique_field_conflict(
                            collection_name, doc, remote_doc, local_collection, remote_collection
                        ):
                            conflicts_count += 1
                            # Mark as conflict and skip
                            await local_collection.update_one(
                                {"_id": doc_id},
                                {"$set": {"syncStatus": SyncStatus.CONFLICT.value}}
                            )
                            continue
                        
                        # No conflict, update remote
                        update_data = {k: v for k, v in doc.items() if k != "_id"}
                        await remote_collection.update_one(
                            {"_id": doc_id},
                            {"$set": update_data}
                        )
                    else:
                        # Insert new document
                        # Check for unique field conflicts with other documents
                        if await self._check_unique_fields_before_insert(
                            collection_name, doc, remote_collection, local_collection
                        ):
                            conflicts_count += 1
                            await local_collection.update_one(
                                {"_id": doc_id},
                                {"$set": {"syncStatus": SyncStatus.CONFLICT.value}}
                            )
                            continue
                        
                        await remote_collection.insert_one(doc)
                    
                    # Update local synced_at timestamp
                    now = datetime.utcnow()
                    await local_collection.update_one(
                        {"_id": doc_id},
                        {
                            "$set": {
                                "synced_at": now,
                                "sync_status": SyncStatus.SYNCED.value
                            }
                        }
                    )
                    
                    pushed_count += 1
                    
                except DuplicateKeyError as e:
                    # Handle duplicate key error (shouldn't happen with our checks)
                    logger.warning(f"Duplicate key error pushing {doc_id}: {e}")
                    conflicts_count += 1
                    await self._log_conflict(
                        collection_name,
                        str(doc_id),
                        None,
                        "duplicate_key",
                        str(doc.get("username", "")),
                        None,
                        f"Duplicate key error: {str(e)}"
                    )
                except Exception as e:
                    logger.error(f"Error pushing document {doc.get('_id')}: {e}")
            
        except Exception as e:
            logger.error(f"Error in _push_local_changes for {collection_name}: {e}")
        
        return pushed_count, conflicts_count
    
    async def _pull_remote_changes(
        self,
        collection_name: str,
        local_collection,
        remote_collection
    ) -> Tuple[int, int]:
        """
        Pull remote changes to local database.
        
        Returns:
            Tuple of (documents_pulled, conflicts_detected)
        """
        pulled_count = 0
        conflicts_count = 0
        
        try:
            # Get all remote documents
            remote_docs = await remote_collection.find({}).to_list(length=None)
            
            for remote_doc in remote_docs:
                try:
                    doc_id = remote_doc["_id"]
                    
                    # Check if document exists locally
                    local_doc = await local_collection.find_one({"_id": doc_id})
                    
                    if local_doc:
                        # Compare timestamps
                        remote_updated = remote_doc.get("updated_at")
                        local_updated = local_doc.get("updated_at")
                        
                        if remote_updated and local_updated:
                            # Remote is newer, update local
                            # This includes records that originated from cloud (sync_origin: "cloud")
                            # because the remote version is the source of truth
                            if remote_updated > local_updated:
                                update_data = {k: v for k, v in remote_doc.items() if k != "_id"}
                                update_data["synced_at"] = datetime.utcnow()
                                update_data["sync_status"] = SyncStatus.SYNCED.value
                                # Preserve the original sync_origin if it exists
                                if "sync_origin" not in update_data and "sync_origin" in local_doc:
                                    update_data["sync_origin"] = local_doc["sync_origin"]
                                
                                await local_collection.update_one(
                                    {"_id": doc_id},
                                    {"$set": update_data}
                                )
                                pulled_count += 1
                    else:
                        # Document doesn't exist locally, insert it
                        remote_doc["synced_at"] = datetime.utcnow()
                        remote_doc["sync_status"] = SyncStatus.SYNCED.value
                        # Set sync_origin to remote only if not already set
                        if "sync_origin" not in remote_doc:
                            remote_doc["sync_origin"] = SyncOrigin.REMOTE.value
                        
                        await local_collection.insert_one(remote_doc)
                        pulled_count += 1
                except Exception as e:
                    logger.error(f"Error pulling document {remote_doc.get('_id')}: {e}")
            
        except Exception as e:
            logger.error(f"Error in _pull_remote_changes for {collection_name}: {e}")
        
        return pulled_count, conflicts_count
    
    async def _has_unique_field_conflict(
        self,
        collection_name: str,
        local_doc: Dict,
        remote_doc: Dict,
        local_collection,
        remote_collection
    ) -> bool:
        """Check if updating would cause unique field conflict"""
        unique_fields = self.unique_fields_map.get(collection_name, [])
        
        for field in unique_fields:
            if field in local_doc and field in remote_doc:
                if local_doc[field] != remote_doc[field]:
                    # Check if local value exists elsewhere on remote
                    conflict_doc = await remote_collection.find_one({
                        field: local_doc[field],
                        "_id": {"$ne": local_doc["_id"]}
                    })
                    
                    if conflict_doc:
                        # Log conflict
                        await self._log_conflict(
                            collection_name,
                            str(local_doc["_id"]),
                            str(conflict_doc["_id"]),
                            field,
                            str(local_doc[field]),
                            str(conflict_doc[field]),
                            f"Unique field '{field}' conflicts with existing remote document"
                        )
                        return True
        
        return False
    
    async def _check_unique_fields_before_insert(
        self,
        collection_name: str,
        doc: Dict,
        remote_collection,
        local_collection
    ) -> bool:
        """Check if inserting would violate unique constraints"""
        unique_fields = self.unique_fields_map.get(collection_name, [])
        
        for field in unique_fields:
            if field in doc:
                # Check if value already exists on remote
                existing = await remote_collection.find_one({field: doc[field]})
                
                if existing:
                    # Log conflict
                    await self._log_conflict(
                        collection_name,
                        str(doc["_id"]),
                        str(existing["_id"]),
                        field,
                        str(doc[field]),
                        str(existing[field]),
                        f"Cannot insert: unique field '{field}' already exists on remote"
                    )
                    return True
        
        return False
    
    async def _log_conflict(
        self,
        collection: str,
        local_id: str,
        remote_id: Optional[str],
        field: str,
        local_value: str,
        remote_value: Optional[str],
        notes: str
    ):
        """Log a synchronization conflict"""
        try:
            conflict = ConflictLog(
                collection=collection,
                localId=local_id,
                remoteId=remote_id,
                field=field,
                localValue=local_value,
                remoteValue=remote_value,
                notes=notes
            )
            
            await conflict_logs_collection.insert_one(conflict.model_dump())
            logger.warning(f"⚠ Conflict logged: {collection}.{field} = {local_value}")
            
        except Exception as e:
            logger.error(f"Failed to log conflict: {e}")
    
    async def get_conflicts(
        self,
        resolved: Optional[bool] = None,
        collection: Optional[str] = None
    ) -> List[Dict]:
        """
        Get conflict logs with optional filtering.
        
        Args:
            resolved: Filter by resolved status (None = all)
            collection: Filter by collection name (None = all)
        """
        query = {}
        
        if resolved is not None:
            query["resolved"] = resolved
        
        if collection:
            query["collection"] = collection
        
        conflicts = await conflict_logs_collection.find(query).sort("timestamp", -1).to_list(length=None)
        return conflicts
    
    async def resolve_conflict(
        self,
        conflict_id: str,
        strategy: str,
        new_value: Optional[str] = None,
        resolved_by: str = "system",
        notes: Optional[str] = None
    ) -> bool:
        """
        Resolve a conflict using specified strategy.
        
        Strategies:
        - keep_local: Keep local version, rename if needed
        - keep_remote: Discard local changes
        - merge: Manual merge (requires new_value)
        - rename_local: Rename local unique field value
        """
        try:
            conflict = await conflict_logs_collection.find_one({"_id": ObjectId(conflict_id)})
            
            if not conflict:
                logger.error(f"Conflict {conflict_id} not found")
                return False
            
            collection_name = conflict["collection"]
            local_collection = self.local_db.get_collection(collection_name)
            remote_collection = self.remote_db.get_collection(collection_name)
            
            local_id = ObjectId(conflict["localId"])
            field = conflict["field"]
            
            if strategy == "keep_local":
                # Rename local value and retry sync
                if new_value:
                    await local_collection.update_one(
                        {"_id": local_id},
                        {"$set": {field: new_value, "syncStatus": SyncStatus.PENDING.value}}
                    )
                else:
                    logger.error("keep_local strategy requires new_value")
                    return False
            
            elif strategy == "keep_remote":
                # Mark local as synced, don't push
                await local_collection.update_one(
                    {"_id": local_id},
                    {"$set": {"syncStatus": SyncStatus.SYNCED.value, "syncedAt": datetime.utcnow()}}
                )
            
            elif strategy == "rename_local":
                if new_value:
                    await local_collection.update_one(
                        {"_id": local_id},
                        {"$set": {field: new_value, "syncStatus": SyncStatus.PENDING.value}}
                    )
                else:
                    logger.error("rename_local strategy requires new_value")
                    return False
            
            elif strategy == "merge":
                # Manual merge requires new value
                if new_value:
                    await local_collection.update_one(
                        {"_id": local_id},
                        {"$set": {field: new_value, "syncStatus": SyncStatus.PENDING.value}}
                    )
                else:
                    logger.error("merge strategy requires new_value")
                    return False
            
            # Mark conflict as resolved
            await conflict_logs_collection.update_one(
                {"_id": ObjectId(conflict_id)},
                {
                    "$set": {
                        "resolved": True,
                        "resolutionStrategy": strategy,
                        "resolvedAt": datetime.utcnow(),
                        "resolvedBy": resolved_by,
                        "notes": notes or f"Resolved using {strategy} strategy"
                    }
                }
            )
            
            logger.info(f"✓ Conflict {conflict_id} resolved using {strategy}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to resolve conflict {conflict_id}: {e}")
            return False


# Global singleton instance
_sync_manager: Optional[SyncManager] = None


async def get_sync_manager() -> SyncManager:
    """Get or create the global SyncManager instance"""
    global _sync_manager
    
    if _sync_manager is None:
        _sync_manager = SyncManager()
        await _sync_manager.initialize()
    
    return _sync_manager
