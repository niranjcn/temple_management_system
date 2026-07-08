from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime
from bson import ObjectId
from .main_models import PyObjectId
import os

class SecurityEventBase(BaseModel):
    """Base model for security events"""
    event_type: str = Field(..., description="Type of security event")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ip_address: Optional[str] = Field(None, description="IP address of the client")
    user_agent: Optional[str] = Field(None, description="User agent string")
    user_id: Optional[str] = Field(None, description="ID of the user involved")
    mobile_number: Optional[str] = Field(None, description="Mobile number involved")
    details: Dict[str, Any] = Field(default_factory=dict, description="Additional event details")
    origin: str = Field(default_factory=lambda: os.getenv("PRIMARY_DATABASE", "local"), description="Database origin (local/cloud)")

class SecurityEventCreate(SecurityEventBase):
    """Schema for creating security events"""
    pass

class SecurityEventInDB(SecurityEventBase):
    """Security event as stored in database"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})

class TokenRevocationBase(BaseModel):
    """Base model for token revocation"""
    jti: str = Field(..., description="JWT ID of the revoked token")
    revoked_at: datetime = Field(default_factory=datetime.utcnow)
    reason: str = Field(default="manual_revocation", description="Reason for revocation")
    origin: str = Field(default_factory=lambda: os.getenv("PRIMARY_DATABASE", "local"), description="Database origin (local/cloud)")

class TokenRevocationCreate(TokenRevocationBase):
    """Schema for creating token revocation records"""
    pass

class TokenRevocationInDB(TokenRevocationBase):
    """Token revocation as stored in database"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})

class DeviceFingerprintBase(BaseModel):
    """Base model for device fingerprints"""
    user_id: str = Field(..., description="ID of the user")
    device_fingerprint: Dict[str, Any] = Field(..., description="Device fingerprint data")
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    origin: str = Field(default_factory=lambda: os.getenv("PRIMARY_DATABASE", "local"), description="Database origin (local/cloud)")

class DeviceFingerprintCreate(DeviceFingerprintBase):
    """Schema for creating device fingerprints"""
    pass

class DeviceFingerprintInDB(DeviceFingerprintBase):
    """Device fingerprint as stored in database"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})

class UserSessionBase(BaseModel):
    """Base model for user sessions"""
    user_id: str = Field(..., description="ID of the user")
    session_id: str = Field(..., description="Unique session identifier")
    ip_address: str = Field(..., description="IP address of the session")
    user_agent: str = Field(..., description="User agent of the session")
    device_fingerprint: Optional[Dict[str, Any]] = Field(None, description="Device fingerprint")
    location: Optional[Dict[str, float]] = Field(None, description="Geographic location")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime = Field(..., description="Session expiration time")
    last_activity: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)
    origin: str = Field(default_factory=lambda: os.getenv("PRIMARY_DATABASE", "local"), description="Database origin (local/cloud)")

class UserSessionCreate(UserSessionBase):
    """Schema for creating user sessions"""
    pass

class UserSessionInDB(UserSessionBase):
    """User session as stored in database"""
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, json_encoders={ObjectId: str})

class SecuritySummary(BaseModel):
    """Summary of security events for monitoring"""
    total_events: int
    failed_login_attempts: int
    successful_logins: int
    token_refreshes: int
    suspicious_activities: int
    unique_ips: int
    active_sessions: int
    time_range_hours: int

class RateLimitInfo(BaseModel):
    """Rate limiting information"""
    endpoint: str
    ip_address: str
    current_attempts: int
    limit: int
    window_minutes: int
    reset_time: datetime