import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from fastapi import HTTPException
from ..database import security_events_collection, add_security_origin

logger = logging.getLogger("security_service")

class SecurityService:
    def __init__(self):
        self.rate_limit_cache = {}  # In-memory cache for rate limiting
        
    async def log_security_event(self, event_type: str, user_id: Optional[str] = None,
                                ip_address: Optional[str] = None, user_agent: Optional[str] = None,
                                mobile_number: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        """Log security events for monitoring and audit purposes"""
        try:
            event_doc = add_security_origin({
                "event_type": event_type,
                "timestamp": datetime.now(timezone.utc),
                "ip_address": ip_address,
                "user_agent": user_agent,
                "details": details or {}
            })
            
            if user_id:
                event_doc["user_id"] = user_id
            if mobile_number:
                event_doc["mobile_number"] = mobile_number
                
            await security_events_collection.insert_one(event_doc)
            
        except Exception as e:
            logger.error(f"Failed to log security event: {str(e)}")
    
    async def check_rate_limit(self, ip_address: str, endpoint: str, 
                              limit: int, window_minutes: int):
        """Check rate limiting for specific endpoint and IP"""
        try:
            cache_key = f"{ip_address}:{endpoint}"
            current_time = datetime.now(timezone.utc)
            window_start = current_time - timedelta(minutes=window_minutes)
            
            # Count recent attempts from database
            recent_attempts = await security_events_collection.count_documents({
                "ip_address": ip_address,
                "event_type": {"$in": [endpoint, f"{endpoint}_failed"]},
                "timestamp": {"$gte": window_start}
            })
            
            if recent_attempts >= limit:
                await self.log_security_event(
                    event_type="rate_limit_exceeded",
                    ip_address=ip_address,
                    details={
                        "endpoint": endpoint,
                        "attempts": recent_attempts,
                        "limit": limit,
                        "window_minutes": window_minutes
                    }
                )
                raise HTTPException(
                    status_code=429, 
                    detail=f"Rate limit exceeded. Try again in {window_minutes} minutes."
                )
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Rate limiting check failed: {str(e)}")
    
    async def detect_suspicious_activity(self, user_id: str, ip_address: str) -> bool:
        """Detect suspicious login patterns"""
        try:
            # Check for multiple failed attempts
            window_start = datetime.now(timezone.utc) - timedelta(hours=24)
            
            failed_attempts = await security_events_collection.count_documents({
                "user_id": user_id,
                "event_type": {"$in": ["otp_verification_failed", "login_failed"]},
                "timestamp": {"$gte": window_start}
            })
            
            # Check for logins from multiple IPs
            recent_ips = await security_events_collection.distinct(
                "ip_address",
                {
                    "user_id": user_id,
                    "event_type": "login_success",
                    "timestamp": {"$gte": window_start}
                }
            )
            
            # Suspicious if too many failed attempts or too many different IPs
            is_suspicious = failed_attempts >= 10 or len(recent_ips) >= 5
            
            if is_suspicious:
                await self.log_security_event(
                    event_type="suspicious_activity_detected",
                    user_id=user_id,
                    ip_address=ip_address,
                    details={
                        "failed_attempts_24h": failed_attempts,
                        "unique_ips_24h": len(recent_ips)
                    }
                )
            
            return is_suspicious
            
        except Exception as e:
            logger.error(f"Suspicious activity detection failed: {str(e)}")
            return False
    
    async def get_security_events(self, user_id: Optional[str] = None,
                                 event_type: Optional[str] = None,
                                 ip_address: Optional[str] = None,
                                 hours: int = 24) -> list:
        """Get security events for monitoring dashboard"""
        try:
            query = {
                "timestamp": {
                    "$gte": datetime.now(timezone.utc) - timedelta(hours=hours)
                }
            }
            
            if user_id:
                query["user_id"] = user_id
            if event_type:
                query["event_type"] = event_type
            if ip_address:
                query["ip_address"] = ip_address
            
            events = await security_events_collection.find(
                query
            ).sort("timestamp", -1).limit(1000).to_list(1000)
            
            return events
            
        except Exception as e:
            logger.error(f"Failed to get security events: {str(e)}")
            return []
    
    async def cleanup_old_events(self, days_to_keep: int = 90):
        """Cleanup old security events to maintain database size"""
        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_to_keep)
            result = await security_events_collection.delete_many({
                "timestamp": {"$lt": cutoff_date}
            })
            logger.info(f"Cleaned up {result.deleted_count} old security events")
            return result.deleted_count
            
        except Exception as e:
            logger.error(f"Security events cleanup failed: {str(e)}")
            return 0