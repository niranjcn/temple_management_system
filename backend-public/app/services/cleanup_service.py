"""
Security Collections Cleanup Service
Handles cleanup of security-related collections before backup operations.
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from ..database import (
    get_local_database,
    get_remote_database,
    is_sync_enabled,
    token_revocation_collection,
    login_attempts_collection,
    device_fingerprints_collection,
    security_events_collection,
    user_sessions_collection
)

logger = logging.getLogger(__name__)


class CleanupService:
    """
    Service for cleaning up security collections before backup.
    
    Features:
    - Clean old revoked tokens (older than REFRESH_TOKEN_EXPIRE_DAYS + 1)
    - Fetch and merge remote security collections with local
    - Delete security collections from both local and remote after backup
    - Preserve origin information for tracking
    """
    
    def __init__(self):
        self.local_db = get_local_database()
        self.remote_db = get_remote_database()
        
        # Security collections to manage
        self.security_collections = [
            "login_attempts",
            "token_revocation",
            "user_sessions",
            "device_fingerprints",
            "security_events"
        ]
        
        # Get token expiry settings from environment
        self.refresh_token_expire_days = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "1"))
        
    async def cleanup_old_tokens(self) -> Dict[str, int]:
        """
        Clean up old revoked tokens based on revoked_at timestamp.
        Removes tokens older than (REFRESH_TOKEN_EXPIRE_DAYS + 1) days.
        
        Returns:
            Dictionary with counts of deleted tokens from local and remote
        """
        try:
            # Calculate cutoff date: current_time - (REFRESH_TOKEN_EXPIRE_DAYS + 1)
            cutoff_date = datetime.utcnow() - timedelta(days=self.refresh_token_expire_days + 1)
            
            logger.info(f"🧹 Cleaning tokens older than {cutoff_date.isoformat()}")
            
            result = {
                "local_deleted": 0,
                "remote_deleted": 0,
                "total_deleted": 0
            }
            
            # Clean from local database
            local_result = await token_revocation_collection.delete_many({
                "revoked_at": {"$lt": cutoff_date}
            })
            result["local_deleted"] = local_result.deleted_count
            logger.info(f"  ✓ Deleted {result['local_deleted']} old tokens from local database")
            
            # Clean from remote database if sync enabled
            if is_sync_enabled() and self.remote_db is not None:
                remote_token_collection = self.remote_db.get_collection("token_revocation")
                remote_result = await remote_token_collection.delete_many({
                    "revoked_at": {"$lt": cutoff_date}
                })
                result["remote_deleted"] = remote_result.deleted_count
                logger.info(f"  ✓ Deleted {result['remote_deleted']} old tokens from remote database")
            
            result["total_deleted"] = result["local_deleted"] + result["remote_deleted"]
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to cleanup old tokens: {e}")
            raise Exception(f"Token cleanup failed: {str(e)}")
    
    async def fetch_and_merge_remote_collections(self) -> Dict[str, Dict]:
        """
        Fetch security collections from remote and merge with local.
        This ensures backup contains data from both local and remote systems.
        
        Returns:
            Dictionary with merge statistics for each collection
        """
        try:
            if not is_sync_enabled() or self.remote_db is None:
                logger.info("Remote database not configured. Skipping remote fetch.")
                return {}
            
            logger.info("🔄 Fetching security collections from remote database")
            
            merge_stats = {}
            
            for collection_name in self.security_collections:
                try:
                    # Get local and remote collections
                    local_collection = self.local_db.get_collection(collection_name)
                    remote_collection = self.remote_db.get_collection(collection_name)
                    
                    # Fetch all remote documents
                    remote_docs = await remote_collection.find({}).to_list(length=None)
                    
                    if not remote_docs:
                        merge_stats[collection_name] = {
                            "fetched": 0,
                            "merged": 0,
                            "skipped": 0
                        }
                        continue
                    
                    merged = 0
                    skipped = 0
                    
                    # Merge remote documents into local
                    for doc in remote_docs:
                        doc_id = doc.get("_id")
                        
                        # Check if document already exists in local
                        existing = await local_collection.find_one({"_id": doc_id})
                        
                        if not existing:
                            # Insert new document from remote
                            await local_collection.insert_one(doc)
                            merged += 1
                        else:
                            # Document already exists, skip
                            skipped += 1
                    
                    merge_stats[collection_name] = {
                        "fetched": len(remote_docs),
                        "merged": merged,
                        "skipped": skipped
                    }
                    
                    logger.info(
                        f"  ✓ {collection_name}: fetched {len(remote_docs)}, "
                        f"merged {merged}, skipped {skipped}"
                    )
                    
                except Exception as e:
                    logger.error(f"Failed to merge collection {collection_name}: {e}")
                    merge_stats[collection_name] = {
                        "error": str(e)
                    }
            
            return merge_stats
            
        except Exception as e:
            logger.error(f"Failed to fetch and merge remote collections: {e}")
            raise Exception(f"Remote fetch failed: {str(e)}")
    
    async def delete_security_collections_local(self) -> Dict[str, int]:
        """
        Delete all security collections from local database after backup.
        
        Returns:
            Dictionary with deletion counts for each collection
        """
        try:
            logger.info("🗑️  Deleting security collections from local database")
            
            deletion_stats = {}
            
            # Get collection references
            collections_map = {
                "login_attempts": login_attempts_collection,
                "token_revocation": token_revocation_collection,
                "user_sessions": user_sessions_collection,
                "device_fingerprints": device_fingerprints_collection,
                "security_events": security_events_collection
            }
            
            for collection_name, collection in collections_map.items():
                try:
                    logger.info(f"  Attempting to delete from {collection_name}...")
                    # Note: MongoDB delete_many({}) is safe - not SQL injection
                    result = await collection.delete_many({})
                    deletion_stats[collection_name] = result.deleted_count
                    logger.info(f"  ✓ Deleted {result.deleted_count} documents from {collection_name}")
                except Exception as e:
                    logger.error(f"  ❌ Failed to delete {collection_name}: {e}")
                    import traceback
                    logger.error(traceback.format_exc())
                    deletion_stats[collection_name] = 0
            
            logger.info(f"Local deletion summary: {deletion_stats}")
            return deletion_stats
            
        except Exception as e:
            logger.error(f"Failed to delete local security collections: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise Exception(f"Local deletion failed: {str(e)}")
    
    async def delete_security_collections_remote(self) -> Dict[str, int]:
        """
        Delete all security collections from remote database after backup.
        
        Returns:
            Dictionary with deletion counts for each collection
        """
        try:
            if not is_sync_enabled() or self.remote_db is None:
                logger.info("Remote database not configured. Skipping remote deletion.")
                return {}
            
            logger.info("🗑️  Deleting security collections from remote database")
            
            deletion_stats = {}
            
            for collection_name in self.security_collections:
                try:
                    logger.info(f"  Attempting to delete from remote {collection_name}...")
                    remote_collection = self.remote_db.get_collection(collection_name)
                    result = await remote_collection.delete_many({})
                    deletion_stats[collection_name] = result.deleted_count
                    logger.info(f"  ✓ Deleted {result.deleted_count} documents from remote {collection_name}")
                except Exception as e:
                    logger.error(f"  ❌ Failed to delete remote {collection_name}: {e}")
                    import traceback
                    logger.error(traceback.format_exc())
                    deletion_stats[collection_name] = 0
            
            logger.info(f"Remote deletion summary: {deletion_stats}")
            return deletion_stats
            
        except Exception as e:
            logger.error(f"Failed to delete remote security collections: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise Exception(f"Remote deletion failed: {str(e)}")
    
    async def perform_full_cleanup(self) -> Dict:
        """
        Perform complete cleanup workflow:
        1. Clean old revoked tokens
        2. Fetch and merge remote security collections
        3. Ready for backup (deletion happens after backup in backup service)
        
        Returns:
            Dictionary with all cleanup statistics
        """
        try:
            logger.info("🚀 Starting full security cleanup")
            
            # Step 1: Clean old tokens
            token_cleanup = await self.cleanup_old_tokens()
            
            # Step 2: Fetch and merge remote collections
            merge_stats = await self.fetch_and_merge_remote_collections()
            
            cleanup_result = {
                "success": True,
                "token_cleanup": token_cleanup,
                "merge_stats": merge_stats,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            logger.info("✓ Security cleanup completed successfully")
            
            return cleanup_result
            
        except Exception as e:
            logger.error(f"Full cleanup failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }


# Singleton instance
_cleanup_service: Optional[CleanupService] = None


async def get_cleanup_service() -> CleanupService:
    """Get or create cleanup service singleton"""
    global _cleanup_service
    if _cleanup_service is None:
        _cleanup_service = CleanupService()
    return _cleanup_service
