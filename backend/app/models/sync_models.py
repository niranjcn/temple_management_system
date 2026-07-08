from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
from enum import Enum

class SyncOrigin(str, Enum):
    """Origin of the document"""
    LOCAL = "local"
    REMOTE = "remote"

class SyncStatus(str, Enum):
    """Sync status for documents"""
    SYNCED = "synced"
    PENDING = "pending"
    CONFLICT = "conflict"
    FAILED = "failed"

class SyncTrackingMixin(BaseModel):
    """Mixin to add sync tracking fields to models"""
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow, description="Creation time")
    updated_at: Optional[datetime] = Field(default_factory=datetime.utcnow, description="Last modification time")
    synced_at: Optional[datetime] = Field(default=None, description="Last successful sync timestamp")
    sync_origin: Optional[SyncOrigin] = Field(default=SyncOrigin.LOCAL, description="Origin of the document")
    sync_status: Optional[SyncStatus] = Field(default=SyncStatus.PENDING, description="Current sync status")

class ConflictLog(BaseModel):
    """Log entry for sync conflicts"""
    collection: str = Field(..., description="Collection name where conflict occurred")
    localId: str = Field(..., description="Local document ObjectId")
    remoteId: Optional[str] = Field(None, description="Remote document ObjectId if exists")
    field: str = Field(..., description="Conflicting field name")
    localValue: str = Field(..., description="Value in local database")
    remoteValue: Optional[str] = Field(None, description="Value in remote database")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="When conflict was detected")
    resolved: bool = Field(default=False, description="Whether conflict has been resolved")
    resolutionStrategy: Optional[str] = Field(None, description="How conflict was resolved")
    resolvedAt: Optional[datetime] = Field(None, description="When conflict was resolved")
    resolvedBy: Optional[str] = Field(None, description="Who resolved the conflict")
    notes: Optional[str] = Field(None, description="Additional notes about the conflict")

class SyncLogEntry(BaseModel):
    """Log entry for sync operations"""
    startTime: datetime = Field(default_factory=datetime.utcnow)
    endTime: Optional[datetime] = Field(None)
    status: Literal["in_progress", "completed", "failed", "partial"] = Field(default="in_progress")
    trigger: Literal["manual", "automatic", "scheduled", "reconnect", "startup"] = Field(...)
    collections: list[str] = Field(default_factory=list, description="Collections synced")
    
    # Statistics
    localToRemote: dict = Field(default_factory=dict, description="Documents pushed to remote")
    remoteToLocal: dict = Field(default_factory=dict, description="Documents pulled from remote")
    conflicts: dict = Field(default_factory=dict, description="Conflicts detected per collection")
    errors: list[str] = Field(default_factory=list, description="Errors encountered")
    
    # Performance metrics
    durationSeconds: Optional[float] = Field(None)
    bytesTransferred: Optional[int] = Field(None)

class SyncConfiguration(BaseModel):
    """Configuration for sync behavior"""
    autoSyncEnabled: bool = Field(default=True, description="Enable automatic sync on reconnect")
    syncIntervalMinutes: Optional[int] = Field(default=None, description="Periodic sync interval (None = disabled)")
    conflictResolutionStrategy: Literal["manual", "newest_wins", "local_wins", "remote_wins"] = Field(
        default="manual",
        description="Default conflict resolution strategy"
    )
    collectionsToSync: list[str] = Field(
        default_factory=lambda: [
            "admins",
            "attendance_records",
            "available_rituals",
            "bookings",
            "employee_bookings",
            "events",
            "gallery_images",
            "committee_members",
            "stock",
            "roles",
            "activities",
            "gallery_layouts",
            "gallery_slideshow",
            "gallery_home_preview",
            "events_featured",
            "events_section",
            "calendar",
            "location_config"
        ],
        description="Collections to include in sync"
    )
    maxRetries: int = Field(default=3, description="Maximum retry attempts for failed sync operations")
    batchSize: int = Field(default=100, description="Number of documents to process in each batch")

class SyncStats(BaseModel):
    """Current sync statistics"""
    lastSyncTime: Optional[datetime] = Field(None)
    lastSyncStatus: Optional[str] = Field(None)
    lastSyncDuration: Optional[float] = Field(None)
    totalSyncsCompleted: int = Field(default=0)
    totalConflicts: int = Field(default=0)
    unresolvedConflicts: int = Field(default=0)
    pendingDocuments: int = Field(default=0)
    isOnline: bool = Field(default=False)
    isSyncing: bool = Field(default=False)

class ConflictResolutionRequest(BaseModel):
    """Request to resolve a conflict"""
    conflictId: str = Field(..., description="Conflict log ObjectId")
    strategy: Literal["keep_local", "keep_remote", "merge", "rename_local"] = Field(...)
    newValue: Optional[str] = Field(None, description="New value if using rename strategy")
    notes: Optional[str] = Field(None, description="Resolution notes")
