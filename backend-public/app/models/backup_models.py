from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class BackupStatus(str, Enum):
    """Status of backup operations"""
    IN_PROGRESS = "in_progress"
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"

class SyncStatus(str, Enum):
    """Status of sync operations"""
    IN_PROGRESS = "in_progress"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"

class BackupMetadata(BaseModel):
    """Metadata for backup operations"""
    backup_id: str
    backup_timestamp: datetime
    backup_path: str
    status: BackupStatus
    sync_status: SyncStatus
    collections_backed_up: List[str]
    collections_deleted_local: List[str]
    collections_deleted_remote: List[str]
    delete_bookings_requested: bool
    error_message: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BackupTriggerRequest(BaseModel):
    """Request model for triggering backup"""
    delete_bookings: bool = False

class BackupResponse(BaseModel):
    """Response model for backup operations"""
    success: bool
    backup_id: str
    backup_path: str
    backup_timestamp: str
    sync_status: str
    collections_backed_up: List[str]
    collections_deleted_local: List[str]
    collections_deleted_remote: List[str]
    message: str
    error: Optional[str] = None

class BackupListItem(BaseModel):
    """Item in backup list"""
    backup_id: str
    backup_date: str
    backup_timestamp: str
    status: str
    collections_count: int

class CollectionListItem(BaseModel):
    """Item in collection list"""
    collection_name: str
    document_count: int
    file_size: str

class BackupCollectionData(BaseModel):
    """Data from a backed-up collection"""
    collection_name: str
    documents: List[dict]
    total_documents: int
