"""
Database and Storage Security Service
Implements encrypted token storage, token hashing, database access control
"""

import hashlib
import hmac
import secrets
import asyncio
import ast
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import os
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from ..database import get_database
import logging
from pymongo import ASCENDING, DESCENDING, TEXT
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger("database_security")

class DatabaseSecurityService:
    def __init__(self):
        self.encryption_key = None
        self.token_salt = None
        self.collections = {}
        
        # Initialize encryption
        self._initialize_encryption()
        
        # Resource-aware configuration
        self.security_level = os.getenv("SECURITY_LEVEL", "standard").lower()
        
        # Database access control (disabled for minimal mode)
        self.access_control_enabled = (
            os.getenv("ENABLE_DB_ACCESS_CONTROL", "true").lower() == "true" 
            and self.security_level != "minimal"
        )
        
        # Token cleanup settings (less frequent for low resources)
        self.cleanup_interval_hours = int(os.getenv("TOKEN_CLEANUP_INTERVAL_HOURS", "24" if self.security_level == "minimal" else "6"))
        self.token_retention_days = int(os.getenv("TOKEN_RETENTION_DAYS", "7" if self.security_level == "minimal" else "30"))
        
        # Background task will be started later when needed
        self._cleanup_task = None
    
    def _initialize_encryption(self):
        """Initialize encryption for token storage"""
        # Get encryption key from environment
        encryption_key = os.getenv("TOKEN_STORAGE_ENCRYPTION_KEY")
        
        if not encryption_key:
            # Generate a new key if not provided
            encryption_key = Fernet.generate_key().decode()
            logger.warning("No TOKEN_STORAGE_ENCRYPTION_KEY found, generated new key. Set this in .env for production!")
            logger.info(f"Generated encryption key: {encryption_key}")
        
        # Convert string key to bytes if needed
        if isinstance(encryption_key, str):
            # If it's a base64 encoded key from Fernet.generate_key()
            try:
                # First try to use it as a base64-encoded Fernet key
                self.encryption_key = Fernet(encryption_key.encode())
            except ValueError:
                # If it's not a valid Fernet key, derive one from the string
                password = encryption_key.encode()
                salt = os.getenv("TOKEN_ENCRYPTION_SALT", "temple_management_salt").encode()
                kdf = PBKDF2HMAC(
                    algorithm=hashes.SHA256(),
                    length=32,
                    salt=salt,
                    iterations=100000
                )
                key = base64.urlsafe_b64encode(kdf.derive(password))
                self.encryption_key = Fernet(key)
        else:
            # If it's already bytes, try to use it directly
            self.encryption_key = Fernet(encryption_key)
        
        # Salt for token hashing
        self.token_salt = os.getenv("TOKEN_HASH_SALT", "temple_token_salt").encode()
    
    async def get_secure_collections(self) -> Dict[str, AsyncIOMotorCollection]:
        """Get secure database collections with proper indexing"""
        if not self.collections:
            db = get_database()
            
            # Separate database for tokens if configured
            token_db_uri = os.getenv("TOKEN_DATABASE_URI")
            if token_db_uri:
                token_client = AsyncIOMotorClient(token_db_uri)
                token_db_name = os.getenv("TOKEN_DATABASE_NAME", "temple_tokens")
                token_db = token_client[token_db_name]
            else:
                token_db = db
            
            # Define collections
            self.collections = {
                "encrypted_tokens": token_db["encrypted_tokens"],
                "token_hashes": token_db["token_hashes"],
                "access_logs": db["access_logs"],
                "db_operations": db["db_operations"],
                "encrypted_sessions": token_db["encrypted_sessions"],
                "security_keys": token_db["security_keys"]
            }
            
            # Initialize cleanup task as None
            self._cleanup_task = None
            
            # Create indexes for performance and security
            await self._create_secure_indexes()
        
        return self.collections
    
    async def start_cleanup_task(self):
        """Start the periodic token cleanup task (disabled in minimal mode)"""
        if (self.security_level != "minimal" and 
            (self._cleanup_task is None or self._cleanup_task.done())):
            self._cleanup_task = asyncio.create_task(self._periodic_token_cleanup())
    
    async def stop_cleanup_task(self):
        """Stop the periodic token cleanup task"""
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
    
    async def _create_secure_indexes(self):
        """Create indexes for secure and efficient database operations"""
        collections = await self.get_secure_collections()
        
        try:
            # Encrypted tokens collection indexes
            await collections["encrypted_tokens"].create_index([
                ("token_hash", ASCENDING),
                ("expires_at", ASCENDING)
            ], unique=True)
            
            await collections["encrypted_tokens"].create_index([
                ("user_id", ASCENDING),
                ("token_type", ASCENDING)
            ])
            
            await collections["encrypted_tokens"].create_index("expires_at", expireAfterSeconds=0)
            
            # Token hashes collection indexes
            await collections["token_hashes"].create_index("token_hash", unique=True)
            await collections["token_hashes"].create_index([
                ("user_id", ASCENDING),
                ("created_at", DESCENDING)
            ])
            
            # Access logs indexes
            await collections["access_logs"].create_index([
                ("user_id", ASCENDING),
                ("timestamp", DESCENDING)
            ])
            
            await collections["access_logs"].create_index("timestamp")
            await collections["access_logs"].create_index("operation")
            
            # DB operations audit log
            await collections["db_operations"].create_index([
                ("collection", ASCENDING),
                ("operation", ASCENDING),
                ("timestamp", DESCENDING)
            ])
            
            # Encrypted sessions indexes
            await collections["encrypted_sessions"].create_index("session_hash", unique=True)
            await collections["encrypted_sessions"].create_index("expires_at", expireAfterSeconds=0)
            
            logger.info("Secure database indexes created successfully")
            
        except Exception as e:
            logger.error(f"Failed to create secure indexes: {str(e)}")
    
    async def store_encrypted_token(
        self,
        token: str,
        user_id: str,
        token_type: str,
        expires_at: datetime,
        metadata: Optional[Dict] = None
    ) -> str:
        """Store token with encryption and hashing"""
        collections = await self.get_secure_collections()
        
        try:
            # Hash the token for indexing
            token_hash = self._hash_token(token)
            
            # Encrypt the actual token
            encrypted_token = self.encryption_key.encrypt(token.encode())
            
            # Encrypt metadata if provided
            encrypted_metadata = None
            if metadata:
                metadata_json = str(metadata).encode()
                encrypted_metadata = self.encryption_key.encrypt(metadata_json)
            
            # Store encrypted token
            token_doc = {
                "token_hash": token_hash,
                "encrypted_token": encrypted_token,
                "user_id": user_id,
                "token_type": token_type,
                "expires_at": expires_at,
                "created_at": datetime.utcnow(),
                "encrypted_metadata": encrypted_metadata,
                "access_count": 0,
                "last_accessed": None
            }
            
            await collections["encrypted_tokens"].insert_one(token_doc)
            
            # Store hash reference for quick lookup
            hash_doc = {
                "token_hash": token_hash,
                "user_id": user_id,
                "token_type": token_type,
                "created_at": datetime.utcnow(),
                "expires_at": expires_at
            }
            
            await collections["token_hashes"].insert_one(hash_doc)
            
            # Log token creation
            await self._log_token_operation(user_id, "token_stored", {
                "token_type": token_type,
                "token_hash": token_hash,
                "expires_at": expires_at.isoformat()
            })
            
            return token_hash
            
        except DuplicateKeyError:
            logger.warning(f"Token hash collision detected for user {user_id}")
            raise Exception("Token storage collision - please retry")
        except Exception as e:
            logger.error(f"Failed to store encrypted token: {str(e)}")
            raise Exception("Token storage failed")
    
    async def retrieve_encrypted_token(self, token: str, user_id: Optional[str] = None) -> Optional[Dict]:
        """Retrieve and decrypt token"""
        collections = await self.get_secure_collections()
        
        try:
            token_hash = self._hash_token(token)
            
            # Build query
            query = {"token_hash": token_hash}
            if user_id:
                query["user_id"] = user_id
            
            # Find encrypted token
            token_doc = await collections["encrypted_tokens"].find_one(query)
            
            if not token_doc:
                await self._log_token_operation(user_id or "unknown", "token_not_found", {
                    "token_hash": token_hash
                })
                return None
            
            # Check expiration
            if token_doc["expires_at"] < datetime.utcnow():
                await self._log_token_operation(token_doc["user_id"], "token_expired", {
                    "token_hash": token_hash,
                    "expired_at": token_doc["expires_at"].isoformat()
                })
                
                # Clean up expired token
                await self.revoke_token(token)
                return None
            
            # Decrypt token
            decrypted_token = self.encryption_key.decrypt(token_doc["encrypted_token"]).decode()
            
            # Decrypt metadata if present
            decrypted_metadata = None
            if token_doc.get("encrypted_metadata"):
                decrypted_metadata = ast.literal_eval(self.encryption_key.decrypt(token_doc["encrypted_metadata"]).decode())
            
            # Update access statistics
            await collections["encrypted_tokens"].update_one(
                {"token_hash": token_hash},
                {
                    "$inc": {"access_count": 1},
                    "$set": {"last_accessed": datetime.utcnow()}
                }
            )
            
            # Log token access
            await self._log_token_operation(token_doc["user_id"], "token_accessed", {
                "token_hash": token_hash,
                "token_type": token_doc["token_type"]
            })
            
            return {
                "token": decrypted_token,
                "user_id": token_doc["user_id"],
                "token_type": token_doc["token_type"],
                "expires_at": token_doc["expires_at"],
                "created_at": token_doc["created_at"],
                "metadata": decrypted_metadata,
                "access_count": token_doc["access_count"] + 1
            }
            
        except Exception as e:
            logger.error(f"Failed to retrieve encrypted token: {str(e)}")
            return None
    
    async def revoke_token(self, token: str, user_id: Optional[str] = None) -> bool:
        """Revoke and remove encrypted token"""
        collections = await self.get_secure_collections()
        
        try:
            token_hash = self._hash_token(token)
            
            # Build query
            query = {"token_hash": token_hash}
            if user_id:
                query["user_id"] = user_id
            
            # Get token info before deletion
            token_doc = await collections["encrypted_tokens"].find_one(query)
            
            if not token_doc:
                return False
            
            # Remove from both collections
            await collections["encrypted_tokens"].delete_one(query)
            await collections["token_hashes"].delete_one({"token_hash": token_hash})
            
            # Log token revocation
            await self._log_token_operation(token_doc["user_id"], "token_revoked", {
                "token_hash": token_hash,
                "token_type": token_doc["token_type"],
                "reason": "manual_revocation"
            })
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to revoke token: {str(e)}")
            return False
    
    async def revoke_user_tokens(self, user_id: str, token_type: Optional[str] = None) -> int:
        """Revoke all tokens for a user"""
        collections = await self.get_secure_collections()
        
        try:
            query = {"user_id": user_id}
            if token_type:
                query["token_type"] = token_type
            
            # Get token hashes before deletion
            token_docs = await collections["encrypted_tokens"].find(query).to_list(1000)
            token_hashes = [doc["token_hash"] for doc in token_docs]
            
            if not token_hashes:
                return 0
            
            # Remove from both collections
            result = await collections["encrypted_tokens"].delete_many(query)
            await collections["token_hashes"].delete_many({"token_hash": {"$in": token_hashes}})
            
            # Log bulk token revocation
            await self._log_token_operation(user_id, "bulk_token_revocation", {
                "revoked_count": result.deleted_count,
                "token_type": token_type or "all"
            })
            
            return result.deleted_count
            
        except Exception as e:
            logger.error(f"Failed to revoke user tokens: {str(e)}")
            return 0
    
    async def store_encrypted_session(
        self,
        session_data: Dict,
        session_id: str,
        expires_at: datetime
    ) -> str:
        """Store encrypted session data"""
        collections = await self.get_secure_collections()
        
        try:
            # Hash session ID for indexing
            session_hash = hashlib.sha256((session_id + str(session_data)).encode()).hexdigest()
            
            # Encrypt session data
            session_json = str(session_data).encode()
            encrypted_session = self.encryption_key.encrypt(session_json)
            
            # Store encrypted session
            session_doc = {
                "session_hash": session_hash,
                "session_id": session_id,
                "encrypted_data": encrypted_session,
                "expires_at": expires_at,
                "created_at": datetime.utcnow(),
                "access_count": 0
            }
            
            await collections["encrypted_sessions"].insert_one(session_doc)
            
            return session_hash
            
        except Exception as e:
            logger.error(f"Failed to store encrypted session: {str(e)}")
            raise Exception("Session storage failed")
    
    async def retrieve_encrypted_session(self, session_id: str) -> Optional[Dict]:
        """Retrieve and decrypt session data"""
        collections = await self.get_secure_collections()
        
        try:
            session_doc = await collections["encrypted_sessions"].find_one({
                "session_id": session_id
            })
            
            if not session_doc:
                return None
            
            # Check expiration
            if session_doc["expires_at"] < datetime.utcnow():
                await collections["encrypted_sessions"].delete_one({"session_id": session_id})
                return None
            
            # Decrypt session data
            decrypted_data = ast.literal_eval(self.encryption_key.decrypt(session_doc["encrypted_data"]).decode())
            
            # Update access count
            await collections["encrypted_sessions"].update_one(
                {"session_id": session_id},
                {"$inc": {"access_count": 1}}
            )
            
            return {
                "data": decrypted_data,
                "created_at": session_doc["created_at"],
                "expires_at": session_doc["expires_at"],
                "access_count": session_doc["access_count"] + 1
            }
            
        except Exception as e:
            logger.error(f"Failed to retrieve encrypted session: {str(e)}")
            return None
    
    def _hash_token(self, token: str) -> str:
        """Hash token using HMAC for secure indexing"""
        return hmac.new(
            self.token_salt,
            token.encode(),
            hashlib.sha256
        ).hexdigest()
    
    async def _log_token_operation(self, user_id: str, operation: str, details: Dict):
        """Log token operation for audit"""
        collections = await self.get_secure_collections()
        
        try:
            log_doc = {
                "user_id": user_id,
                "operation": operation,
                "details": details,
                "timestamp": datetime.utcnow(),
                "client_ip": details.get("client_ip"),
                "user_agent": details.get("user_agent")
            }
            
            await collections["access_logs"].insert_one(log_doc)
            
        except Exception as e:
            logger.error(f"Failed to log token operation: {str(e)}")
    
    async def _periodic_token_cleanup(self):
        """Background task to clean up expired tokens"""
        while True:
            try:
                await asyncio.sleep(self.cleanup_interval_hours * 3600)  # Convert hours to seconds
                await self.cleanup_expired_tokens()
            except Exception as e:
                logger.error(f"Token cleanup task failed: {str(e)}")
    
    async def cleanup_expired_tokens(self) -> Dict[str, int]:
        """Clean up expired and old tokens"""
        collections = await self.get_secure_collections()
        
        try:
            current_time = datetime.utcnow()
            
            # Clean up expired tokens
            expired_result = await collections["encrypted_tokens"].delete_many({
                "expires_at": {"$lt": current_time}
            })
            
            await collections["token_hashes"].delete_many({
                "expires_at": {"$lt": current_time}
            })
            
            # Clean up old access logs (keep for retention period)
            retention_cutoff = current_time - timedelta(days=self.token_retention_days)
            old_logs_result = await collections["access_logs"].delete_many({
                "timestamp": {"$lt": retention_cutoff}
            })
            
            # Clean up expired sessions
            expired_sessions_result = await collections["encrypted_sessions"].delete_many({
                "expires_at": {"$lt": current_time}
            })
            
            cleanup_stats = {
                "expired_tokens": expired_result.deleted_count,
                "old_access_logs": old_logs_result.deleted_count,
                "expired_sessions": expired_sessions_result.deleted_count,
                "cleanup_time": current_time.isoformat()
            }
            
            logger.info(f"Token cleanup completed: {cleanup_stats}")
            
            # Log cleanup operation
            await collections["db_operations"].insert_one({
                "operation": "token_cleanup",
                "stats": cleanup_stats,
                "timestamp": current_time,
                "collection": "multiple"
            })
            
            return cleanup_stats
            
        except Exception as e:
            logger.error(f"Token cleanup failed: {str(e)}")
            return {"error": str(e)}
    
    async def get_token_statistics(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get token storage statistics"""
        collections = await self.get_secure_collections()
        
        try:
            stats = {}
            
            # Token counts by type
            pipeline = [
                {"$group": {
                    "_id": "$token_type",
                    "count": {"$sum": 1},
                    "avg_access_count": {"$avg": "$access_count"}
                }}
            ]
            
            if user_id:
                pipeline.insert(0, {"$match": {"user_id": user_id}})
            
            token_stats = await collections["encrypted_tokens"].aggregate(pipeline).to_list(100)
            stats["tokens_by_type"] = {stat["_id"]: stat for stat in token_stats}
            
            # Total counts
            total_query = {"user_id": user_id} if user_id else {}
            stats["total_tokens"] = await collections["encrypted_tokens"].count_documents(total_query)
            stats["total_sessions"] = await collections["encrypted_sessions"].count_documents({})
            
            # Expiration analysis
            current_time = datetime.utcnow()
            expiring_soon = current_time + timedelta(hours=24)
            
            stats["expiring_soon"] = await collections["encrypted_tokens"].count_documents({
                **total_query,
                "expires_at": {"$lt": expiring_soon, "$gt": current_time}
            })
            
            # Access patterns (last 24 hours)
            yesterday = current_time - timedelta(days=1)
            access_query = {"timestamp": {"$gte": yesterday}}
            if user_id:
                access_query["user_id"] = user_id
            
            stats["access_logs_24h"] = await collections["access_logs"].count_documents(access_query)
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get token statistics: {str(e)}")
            return {"error": str(e)}
    
    async def enforce_database_access_control(self, user_role: str, operation: str, collection: str) -> bool:
        """Enforce database access control based on user role"""
        
        if not self.access_control_enabled:
            return True
        
        # Define access control matrix
        access_matrix = {
            "super_admin": {"*": ["read", "write", "delete", "admin"]},
            "admin": {
                "encrypted_tokens": ["read", "write", "delete"],
                "access_logs": ["read"],
                "security_events": ["read", "write"],
                "admins": ["read", "write"],
                "users": ["read", "write"]
            },
            "privileged": {
                "encrypted_tokens": ["read"],
                "access_logs": ["read"],
                "users": ["read"]
            },
            "editor": {
                "events": ["read", "write"],
                "bookings": ["read", "write"],
                "gallery": ["read", "write"]
            },
            "employee": {
                "bookings": ["read", "write"],
                "rituals": ["read"]
            },
            "viewer": {
                "*": ["read"]
            }
        }
        
        role_permissions = access_matrix.get(user_role, {})
        
        # Check wildcard permission
        if "*" in role_permissions and operation in role_permissions["*"]:
            return True
        
        # Check specific collection permission
        if collection in role_permissions and operation in role_permissions[collection]:
            return True
        
        # Log access denial
        collections = await self.get_secure_collections()
        await collections["access_logs"].insert_one({
            "user_role": user_role,
            "operation": operation,
            "collection": collection,
            "access_granted": False,
            "timestamp": datetime.utcnow(),
            "reason": "insufficient_permissions"
        })
        
        return False

# Global instance
db_security = DatabaseSecurityService()