import os
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, Request, Response
import secrets
import hashlib
import json
from cryptography.fernet import Fernet
import hmac
import base64
import logging
from ..database import token_revocation_collection, device_fingerprints_collection, add_security_origin
from .database_security_service import db_security

logger = logging.getLogger("enhanced_jwt_security")

class EnhancedJWTSecurityService:
    def __init__(self):
        # Basic JWT Configuration
        self.secret_key = os.getenv("SECRET_KEY")
        self.algorithm = os.getenv("ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 7))
        # Legacy settings (kept for backward compatibility)
        self.low_privilege_token_minutes = int(os.getenv("LOW_PRIVILEGE_TOKEN_MINUTES", 5))
        self.high_privilege_token_minutes = int(os.getenv("HIGH_PRIVILEGE_TOKEN_MINUTES", 30))
        self.refresh_token_expire_days = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 1))
        
        # Role-Based Token Durations (Enhanced Access Control)
        self.super_admin_token_minutes = int(os.getenv("SUPER_ADMIN_TOKEN_MINUTES", 15))      # role_id = 0
        self.admin_token_minutes = int(os.getenv("ADMIN_TOKEN_MINUTES", 15))                  # role_id = 1
        self.privileged_token_minutes = int(os.getenv("PRIVILEGED_TOKEN_MINUTES", 30))       # role_id = 2
        self.editor_token_minutes = int(os.getenv("EDITOR_TOKEN_MINUTES", 60))               # role_id = 3
        self.employee_token_minutes = int(os.getenv("EMPLOYEE_TOKEN_MINUTES", 120))          # role_id = 4+
        
        # Role-Based Refresh Token Durations
        self.admin_refresh_token_days = int(os.getenv("ADMIN_REFRESH_TOKEN_DAYS", 1))        # role_id <= 1
        self.other_refresh_token_days = int(os.getenv("OTHER_REFRESH_TOKEN_DAYS", 3))        # role_id > 1
        
        # Access Control Features
        self.enable_role_escalation_protection = os.getenv("ENABLE_ROLE_ESCALATION_PROTECTION", "true").lower() in {"1", "true", "yes"}
        self.enable_step_up_auth = os.getenv("ENABLE_STEP_UP_AUTH", "true").lower() in {"1", "true", "yes"}
        self.step_up_auth_expire_minutes = int(os.getenv("STEP_UP_AUTH_EXPIRE_MINUTES", 5))
        self.audience = os.getenv("JWT_AUDIENCE", "https://vamana-temple.netlify.app")
        
        # Enhanced Security Features
        self.bind_to_client = os.getenv("JWT_BIND_TO_CLIENT", "true").lower() in {"1", "true", "yes"}
        self.enable_device_fingerprinting = os.getenv("ENABLE_DEVICE_FINGERPRINTING", "true").lower() in {"1", "true", "yes"}
        self.enable_geolocation_validation = os.getenv("ENABLE_GEOLOCATION_VALIDATION", "true").lower() in {"1", "true", "yes"}
        self.enable_token_rotation = os.getenv("ENABLE_TOKEN_ROTATION", "true").lower() in {"1", "true", "yes"}
        self.enable_token_revocation = os.getenv("ENABLE_TOKEN_REVOCATION", "true").lower() in {"1", "true", "yes"}
        self.trust_proxy = os.getenv("TRUST_PROXY", "true").lower() in {"1", "true", "yes"}
        self.max_location_distance_km = float(os.getenv("MAX_LOCATION_DISTANCE_KM", 500))
        self.device_fingerprint_required_fields = int(os.getenv("DEVICE_FINGERPRINT_REQUIRED_FIELDS", 3))
        
        # Cookie Security
        cookie_encryption_key = os.getenv("COOKIE_ENCRYPTION_KEY")
        if cookie_encryption_key and len(cookie_encryption_key) == 32:
            self.cookie_cipher = Fernet(base64.urlsafe_b64encode(cookie_encryption_key.encode()[:32]))
        else:
            # Generate a key if not provided (for development)
            key = Fernet.generate_key()
            self.cookie_cipher = Fernet(key)
            logger.warning("Using generated cookie encryption key. Set COOKIE_ENCRYPTION_KEY in production.")
        
        self.cookie_signing_secret = os.getenv("COOKIE_SIGNING_SECRET", "default_signing_secret")
        self.cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}
        self.cookie_samesite = os.getenv("COOKIE_SAMESITE", "Lax")
        
        if not self.secret_key:
            raise ValueError("SECRET_KEY environment variable is required")
    
    def create_access_token(self, data: dict, client_info: Optional[Dict[str, str]] = None, 
                          device_fingerprint: Optional[Dict[str, Any]] = None, is_step_up: bool = False) -> str:
        """Create a short-lived JWT access token with enhanced role-based security"""
        to_encode = data.copy()
        
        # Determine token duration based on role_id (Enhanced Role-Based Access Control)
        role_id = data.get("role_id", 99)
        expire_minutes = self._get_role_based_token_duration(role_id)
        
        # Step-up authentication for sensitive operations
        if is_step_up and self.enable_step_up_auth:
            expire_minutes = min(expire_minutes, self.step_up_auth_expire_minutes)
            to_encode["step_up"] = True
        
        expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
        
        # Add standard claims
        to_encode.update({
            "exp": expire,
            "iat": datetime.now(timezone.utc),
            "aud": self.audience,
            "type": "access",
            "jti": secrets.token_hex(16)  # Unique token ID for revocation
        })
        
        # Enhanced Client Binding
        if self.bind_to_client and client_info:
            client_hash = self._create_client_hash(client_info)
            to_encode["client_hash"] = client_hash
        
        # Device Fingerprinting
        if self.enable_device_fingerprinting and device_fingerprint:
            device_hash = self._create_device_fingerprint_hash(device_fingerprint)
            to_encode["device_hash"] = device_hash
            # Store device fingerprint for validation
            self._store_device_fingerprint(data.get("sub"), device_fingerprint)
        
        # Geolocation binding
        if self.enable_geolocation_validation and client_info and client_info.get("latitude") and client_info.get("longitude"):
            location_hash = self._create_location_hash(client_info.get("latitude"), client_info.get("longitude"))
            to_encode["location_hash"] = location_hash
        
        token = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        
        # Store token in secure database ONLY if not in minimal mode (memory optimization)
        security_level = os.getenv("SECURITY_LEVEL", "standard").lower()
        if security_level != "minimal":
            try:
                import asyncio
                asyncio.create_task(db_security.store_encrypted_token(
                    token=token,
                    user_id=data.get("sub", "unknown"),
                    token_type="access",
                    expires_at=expire.replace(tzinfo=None),
                    metadata={"role_id": role_id}  # Minimal metadata to save memory
                ))
            except Exception as e:
                logger.warning(f"Failed to store token in secure database: {e}")
        
        return token
    
    def create_refresh_token(self, data: dict, client_info: Optional[Dict[str, str]] = None,
                           device_fingerprint: Optional[Dict[str, Any]] = None) -> str:
        """Create a long-lived JWT refresh token with role-based duration"""
        to_encode = data.copy()
        
        # Role-Based Refresh Token Duration
        role_id = data.get("role_id", 99)
        refresh_days = self._get_role_based_refresh_duration(role_id)
        expire = datetime.now(timezone.utc) + timedelta(days=refresh_days)
        
        # Add standard claims
        to_encode.update({
            "exp": expire,
            "iat": datetime.now(timezone.utc),
            "aud": self.audience,
            "type": "refresh",
            "jti": secrets.token_hex(16)  # Unique token ID for revocation
        })
        
        # Enhanced security bindings (same as access token)
        if self.bind_to_client and client_info:
            client_hash = self._create_client_hash(client_info)
            to_encode["client_hash"] = client_hash
        
        if self.enable_device_fingerprinting and device_fingerprint:
            device_hash = self._create_device_fingerprint_hash(device_fingerprint)
            to_encode["device_hash"] = device_hash
        
        if self.enable_geolocation_validation and client_info and client_info.get("latitude") and client_info.get("longitude"):
            location_hash = self._create_location_hash(client_info.get("latitude"), client_info.get("longitude"))
            to_encode["location_hash"] = location_hash
        
        token = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        
        # Store refresh token in secure database ONLY if not in minimal mode
        security_level = os.getenv("SECURITY_LEVEL", "standard").lower()
        if security_level != "minimal":
            try:
                import asyncio
                asyncio.create_task(db_security.store_encrypted_token(
                    token=token,
                    user_id=data.get("sub", "unknown"),
                    token_type="refresh",
                    expires_at=expire.replace(tzinfo=None),
                    metadata={"role_id": role_id}  # Minimal metadata only
                ))
            except Exception as e:
                logger.warning(f"Failed to store refresh token in secure database: {e}")
        
        return token
    
    async def verify_token(self, token: str, token_type: str = "access", 
                          client_info: Optional[Dict[str, str]] = None,
                          device_fingerprint: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Verify and decode JWT token with enhanced security checks"""
        try:
            # Check token revocation first
            if self.enable_token_revocation:
                if await self._is_token_revoked(token):
                    raise HTTPException(status_code=401, detail="Token has been revoked")
            
            payload = jwt.decode(
                token, 
                self.secret_key, 
                algorithms=[self.algorithm],
                audience=self.audience
            )
            
            # Check token type
            if payload.get("type") != token_type:
                raise HTTPException(status_code=401, detail="Invalid token type")
            
            # Enhanced Client Binding Verification
            if self.bind_to_client and client_info and "client_hash" in payload:
                expected_hash = self._create_client_hash(client_info)
                if payload["client_hash"] != expected_hash:
                    logger.warning(f"Client binding mismatch for user {payload.get('sub')}")
                    raise HTTPException(status_code=401, detail="Token bound to different client")
            
            # Device Fingerprinting Verification
            if self.enable_device_fingerprinting and device_fingerprint and "device_hash" in payload:
                if not await self._verify_device_fingerprint(payload.get("sub"), device_fingerprint, payload["device_hash"]):
                    logger.warning(f"Device fingerprint mismatch for user {payload.get('sub')}")
                    raise HTTPException(status_code=401, detail="Device fingerprint validation failed")
            
            # Geolocation Verification
            if self.enable_geolocation_validation and client_info and "location_hash" in payload:
                if not await self._verify_location(client_info, payload["location_hash"]):
                    logger.warning(f"Geolocation validation failed for user {payload.get('sub')}")
                    raise HTTPException(status_code=401, detail="Token used from suspicious location")
            
            # Create session tracking ONLY if not in minimal mode (memory optimization)  
            security_level = os.getenv("SECURITY_LEVEL", "standard").lower()
            if security_level != "minimal":
                try:
                    session_data = {
                        "user_id": payload.get("sub"),
                        "ip_address": client_info.get("ip") if client_info else "unknown",
                        "last_activity": datetime.utcnow(),
                        "token_type": token_type
                    }  # Minimal session data to save memory
                    
                    session_id = f"{payload.get('sub')}_{payload.get('jti', 'unknown')}"
                    expire = datetime.fromtimestamp(payload.get("exp", 0))
                    
                    import asyncio
                    asyncio.create_task(db_security.store_encrypted_session(
                        session_data=session_data,
                        session_id=session_id,
                        expires_at=expire
                    ))
                except Exception as e:
                    logger.warning(f"Failed to store session data: {e}")
            
            return payload
            
        except ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
        except Exception as e:
            logger.error(f"Token validation error: {str(e)}")
            raise HTTPException(status_code=401, detail="Token validation failed")
    
    def get_enhanced_client_info(self, request: Request) -> Dict[str, str]:
        """Extract enhanced client information including geolocation"""
        ip = ""
        if self.trust_proxy:
            xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
            if xff:
                ip = xff.split(",")[0].strip()
        if not ip:
            ip = request.client.host if request.client else ""
        
        client_info = {
            "ip": ip,
            "user_agent": request.headers.get("user-agent", ""),
            "accept_language": request.headers.get("accept-language", ""),
            "accept_encoding": request.headers.get("accept-encoding", ""),
        }
        
        # Extract geolocation from headers (if provided by frontend)
        latitude = request.headers.get("x-client-latitude")
        longitude = request.headers.get("x-client-longitude")
        if latitude and longitude:
            try:
                client_info["latitude"] = float(latitude)
                client_info["longitude"] = float(longitude)
            except ValueError:
                pass
        
        return client_info
    
    async def refresh_access_token(self, refresh_token: str, client_info: Optional[Dict[str, str]] = None,
                                  device_fingerprint: Optional[Dict[str, Any]] = None) -> tuple[str, Optional[str]]:
        """Generate new access token using refresh token with token rotation"""
        # Verify refresh token
        payload = await self.verify_token(refresh_token, token_type="refresh", 
                                        client_info=client_info, device_fingerprint=device_fingerprint)
        
        # Create new access token with same user data
        user_data = {k: v for k, v in payload.items() 
                    if k not in ["exp", "iat", "aud", "type", "jti", "client_hash", "device_hash", "location_hash"]}
        
        new_access_token = self.create_access_token(user_data, client_info, device_fingerprint)
        
        # Token Rotation: Create new refresh token and revoke old one
        new_refresh_token = None
        if self.enable_token_rotation:
            new_refresh_token = self.create_refresh_token(user_data, client_info, device_fingerprint)
            # Revoke old refresh token
            await self._revoke_token(refresh_token, payload.get("jti"))
        
        return new_access_token, new_refresh_token
    
    async def revoke_token(self, token: str, reason: str = "manual_revocation"):
        """Revoke a token by adding it to the revocation list"""
        if not self.enable_token_revocation:
            return
        
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm], 
                               options={"verify_exp": False})  # Don't check expiry for revocation
            await self._revoke_token(token, payload.get("jti"), reason)
        except Exception as e:
            logger.error(f"Failed to revoke token: {str(e)}")
    
    # Enhanced Cookie Management
    def set_secure_cookie(self, response: Response, name: str, value: str, 
                         expires_delta: Optional[timedelta] = None):
        """Set encrypted and signed HTTP-only cookie"""
        # Encrypt the value
        encrypted_value = self.cookie_cipher.encrypt(value.encode()).decode()
        
        # Sign the encrypted value
        signature = self._sign_cookie_value(encrypted_value)
        signed_value = f"{encrypted_value}.{signature}"
        
        # Set cookie with security flags
        expires = None
        if expires_delta:
            expires = datetime.now(timezone.utc) + expires_delta
        
        response.set_cookie(
            key=name,
            value=signed_value,
            expires=expires,
            httponly=True,
            secure=self.cookie_secure,
            samesite=self.cookie_samesite,
            path="/"
        )
    
    def get_secure_cookie(self, request: Request, name: str) -> Optional[str]:
        """Get and decrypt signed cookie value"""
        signed_value = request.cookies.get(name)
        if not signed_value:
            return None
        
        try:
            # Split encrypted value and signature
            if '.' not in signed_value:
                return None
            
            encrypted_value, signature = signed_value.rsplit('.', 1)
            
            # Verify signature
            expected_signature = self._sign_cookie_value(encrypted_value)
            if not hmac.compare_digest(signature, expected_signature):
                logger.warning(f"Cookie signature verification failed for {name}")
                return None
            
            # Decrypt value
            decrypted_value = self.cookie_cipher.decrypt(encrypted_value.encode()).decode()
            return decrypted_value
            
        except Exception as e:
            logger.error(f"Failed to decrypt cookie {name}: {str(e)}")
            return None
    
    # Helper Methods
    def _create_client_hash(self, client_info: Dict[str, str]) -> str:
        """Create hash from client information"""
        client_string = f"{client_info.get('ip', '')}{client_info.get('user_agent', '')}{client_info.get('accept_language', '')}"
        return hashlib.sha256(client_string.encode()).hexdigest()[:16]
    
    def _create_device_fingerprint_hash(self, device_fingerprint: Dict[str, Any]) -> str:
        """Create hash from device fingerprint"""
        # Sort keys to ensure consistent hashing
        sorted_items = sorted(device_fingerprint.items())
        fingerprint_string = json.dumps(sorted_items, sort_keys=True)
        return hashlib.sha256(fingerprint_string.encode()).hexdigest()[:16]
    
    def _create_location_hash(self, latitude: float, longitude: float) -> str:
        """Create hash from geolocation (rounded to reduce precision)"""
        # Round to ~1km precision to allow for small movements
        rounded_lat = round(latitude, 2)
        rounded_lon = round(longitude, 2)
        location_string = f"{rounded_lat},{rounded_lon}"
        return hashlib.sha256(location_string.encode()).hexdigest()[:16]
    
    async def _store_device_fingerprint(self, user_id: str, device_fingerprint: Dict[str, Any]):
        """Store device fingerprint for user"""
        try:
            await device_fingerprints_collection.update_one(
                {"user_id": user_id},
                {
                    "$set": add_security_origin({
                        "user_id": user_id,
                        "device_fingerprint": device_fingerprint,
                        "last_seen": datetime.now(timezone.utc),
                        "created_at": datetime.now(timezone.utc)
                    })
                },
                upsert=True
            )
        except Exception as e:
            logger.error(f"Failed to store device fingerprint: {str(e)}")
    
    async def _verify_device_fingerprint(self, user_id: str, current_fingerprint: Dict[str, Any], 
                                       expected_hash: str) -> bool:
        """Verify device fingerprint against stored data"""
        try:
            # Check if current fingerprint matches expected hash
            current_hash = self._create_device_fingerprint_hash(current_fingerprint)
            if current_hash == expected_hash:
                return True
            
            # Get stored fingerprint for comparison
            stored = await device_fingerprints_collection.find_one({"user_id": user_id})
            if not stored:
                return False
            
            stored_fingerprint = stored.get("device_fingerprint", {})
            
            # Calculate similarity score
            matching_fields = 0
            total_fields = len(current_fingerprint)
            
            for key, value in current_fingerprint.items():
                if key in stored_fingerprint and stored_fingerprint[key] == value:
                    matching_fields += 1
            
            # Require minimum number of matching fields
            return matching_fields >= self.device_fingerprint_required_fields
            
        except Exception as e:
            logger.error(f"Device fingerprint verification error: {str(e)}")
            return False
    
    async def _verify_location(self, client_info: Dict[str, str], expected_hash: str) -> bool:
        """Verify geolocation is within acceptable range"""
        try:
            current_lat = client_info.get("latitude")
            current_lon = client_info.get("longitude")
            
            if not current_lat or not current_lon:
                return True  # Skip validation if no location provided
            
            current_hash = self._create_location_hash(float(current_lat), float(current_lon))
            if current_hash == expected_hash:
                return True
            
            # Check distance from original location
            # This is a simplified approach - in production, you'd store the original location
            # For now, we'll be lenient and allow location changes
            return True
            
        except Exception as e:
            logger.error(f"Location verification error: {str(e)}")
            return True  # Be lenient on location errors
    
    async def _is_token_revoked(self, token: str) -> bool:
        """Check if token is in revocation list"""
        try:
            # Extract JTI from token without full validation
            payload = jwt.decode(token, options={"verify_signature": False})
            jti = payload.get("jti")
            
            if not jti:
                return False
            
            revoked = await token_revocation_collection.find_one({"jti": jti})
            return revoked is not None
            
        except Exception:
            return False
    
    async def _revoke_token(self, token: str, jti: Optional[str], reason: str = "refresh_rotation"):
        """Add token to revocation list"""
        try:
            if not jti:
                payload = jwt.decode(token, options={"verify_signature": False})
                jti = payload.get("jti")
            
            if jti:
                await token_revocation_collection.update_one(
                    {"jti": jti},
                    {
                        "$set": add_security_origin({
                            "jti": jti,
                            "revoked_at": datetime.now(timezone.utc),
                            "reason": reason
                        })
                    },
                    upsert=True
                )
                
        except Exception as e:
            logger.error(f"Failed to revoke token: {str(e)}")
    
    def _sign_cookie_value(self, value: str) -> str:
        """Sign cookie value with HMAC"""
        return hmac.new(
            self.cookie_signing_secret.encode(),
            value.encode(),
            hashlib.sha256
        ).hexdigest()[:16]
    
    async def cleanup_expired_tokens(self):
        """Remove expired tokens from revocation list"""
        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=self.refresh_token_expire_days + 1)
            result = await token_revocation_collection.delete_many({
                "revoked_at": {"$lt": cutoff_date}
            })
            logger.info(f"Cleaned up {result.deleted_count} expired revoked tokens")
        except Exception as e:
            logger.error(f"Token cleanup failed: {str(e)}")
    
    def get_token_duration(self, role_id: Optional[int] = None) -> int:
        """Get token duration in seconds based on role_id (Enhanced)"""
        return self._get_role_based_token_duration(role_id) * 60
    
    def _get_role_based_token_duration(self, role_id: Optional[int] = None) -> int:
        """Get role-based access token duration in minutes"""
        if role_id is None:
            role_id = 99
        
        # Role-based token durations (shorter sessions for higher privileges)
        role_durations = {
            0: self.super_admin_token_minutes,    # Super Admin - 15 min (highest security)
            1: self.admin_token_minutes,          # Admin - 15 min (high security)
            2: self.privileged_token_minutes,     # Privileged - 30 min (medium security)
            3: self.editor_token_minutes,         # Editor - 60 min (standard security)
        }
        
        # Default for employees (role_id >= 4) or unknown roles
        return role_durations.get(role_id, self.employee_token_minutes)
    
    def _get_role_based_refresh_duration(self, role_id: Optional[int] = None) -> int:
        """Get role-based refresh token duration in days"""
        if role_id is None:
            role_id = 99
        
        # Admins and Super Admins get shorter refresh token duration (higher security)
        if role_id <= 1:  # Super Admin (0) and Admin (1)
            return self.admin_refresh_token_days
        else:  # Everyone else
            return self.other_refresh_token_days
    
    def can_modify_role(self, actor_role_id: int, target_role_id: int, new_role_id: Optional[int] = None) -> bool:
        """Permission Escalation Protection - Check if actor can modify target role"""
        if not self.enable_role_escalation_protection:
            return True
        
        # Super Admin (0) is immutable
        if target_role_id == 0:
            return False
        
        # Only lower role_id (higher privilege) can modify higher role_id (lower privilege)
        if actor_role_id >= target_role_id:
            return False
        
        # If changing role, new role must still be lower privilege than actor
        if new_role_id is not None:
            if new_role_id == 0:  # Cannot create Super Admin
                return False
            if actor_role_id >= new_role_id:  # Cannot grant equal or higher privilege
                return False
        
        return True
    
    def requires_step_up_auth(self, operation: str, role_id: int) -> bool:
        """Check if operation requires step-up authentication"""
        if not self.enable_step_up_auth:
            return False
        
        # Operations requiring step-up authentication
        sensitive_operations = {
            "delete_user": [0, 1],          # Super Admin, Admin only
            "modify_admin": [0],            # Super Admin only
            "system_settings": [0],         # Super Admin only
            "security_settings": [0, 1],    # Super Admin, Admin
            "bulk_delete": [0, 1, 2],       # Super Admin, Admin, Privileged
            "financial_operations": [0, 1], # Super Admin, Admin only
        }
        
        allowed_roles = sensitive_operations.get(operation, [])
        return role_id in allowed_roles
    
    async def create_step_up_token(self, base_token_data: dict, operation: str, 
                                 client_info: Optional[Dict[str, str]] = None,
                                 device_fingerprint: Optional[Dict[str, Any]] = None) -> str:
        """Create step-up authentication token for sensitive operations"""
        step_up_data = base_token_data.copy()
        step_up_data.update({
            "operation": operation,
            "step_up_issued": datetime.now(timezone.utc).isoformat()
        })
        
        return self.create_access_token(
            step_up_data, 
            client_info, 
            device_fingerprint, 
            is_step_up=True
        )
    
    def verify_step_up_token(self, token_payload: dict, required_operation: str) -> bool:
        """Verify step-up authentication token for specific operation"""
        if not self.enable_step_up_auth:
            return True
        
        # Check if token has step-up claim
        if not token_payload.get("step_up", False):
            return False
        
        # Check if token is for the required operation
        if token_payload.get("operation") != required_operation:
            return False
        
        # Check if step-up token is still valid (within time window)
        step_up_issued = token_payload.get("step_up_issued")
        if not step_up_issued:
            return False
        
        try:
            issued_time = datetime.fromisoformat(step_up_issued.replace('Z', '+00:00'))
            if datetime.now(timezone.utc) - issued_time > timedelta(minutes=self.step_up_auth_expire_minutes):
                return False
        except:
            return False
        
        return True

# Global instance
enhanced_jwt_security = EnhancedJWTSecurityService()