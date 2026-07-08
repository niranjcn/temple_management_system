import os
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from fastapi import HTTPException, Request
import secrets
import hashlib

class JWTSecurityService:
    def __init__(self):
        self.secret_key = os.getenv("SECRET_KEY")
        self.algorithm = os.getenv("ALGORITHM", "HS256")
        
        # Check PRIMARY_DATABASE setting to determine token expiration strategy
        self.primary_database = os.getenv("PRIMARY_DATABASE", "local").lower()
        
        # For LOCAL database mode: Extended token expiration (6+ months)
        # For CLOUD database mode: Standard web session expiration
        if self.primary_database == "local":
            # Local mode: Extended token expiration for persistent local sessions
            # Access tokens: 180 days (6 months)
            # Refresh tokens: 365 days (1 year)
            self.access_token_expire_minutes = int(os.getenv("LOCAL_ACCESS_TOKEN_EXPIRE_DAYS", 180)) * 1440  # Convert days to minutes
            self.refresh_token_expire_minutes = int(os.getenv("LOCAL_REFRESH_TOKEN_EXPIRE_DAYS", 365)) * 1440  # Convert days to minutes
        else:
            # Cloud mode: Standard web session expiration
            self.access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))  # 1 day
            self.refresh_token_expire_minutes = int(os.getenv("REFRESH_TOKEN_EXPIRE_MINUTES", 10080))  # 7 days
        
        # Mobile app ALWAYS uses extended tokens regardless of database mode
        # Mobile tokens: 180 days access, 365 days refresh
        self.mobile_access_token_expire_minutes = int(os.getenv("MOBILE_ACCESS_TOKEN_EXPIRE_DAYS", 180)) * 1440  # Convert days to minutes
        self.mobile_refresh_token_expire_minutes = int(os.getenv("MOBILE_REFRESH_TOKEN_EXPIRE_DAYS", 365)) * 1440  # Convert days to minutes
        
        self.audience = os.getenv("JWT_AUDIENCE", "https://vamana-temple.netlify.app")
        # Whether to bind tokens to client info (IP/UA). Disabled by default to avoid issues behind proxies.
        self.bind_to_client = os.getenv("JWT_BIND_TO_CLIENT", "false").lower() in {"1", "true", "yes"}
        # When extracting client IP, trust X-Forwarded-For if running behind a reverse proxy
        self.trust_proxy = os.getenv("TRUST_PROXY", "true").lower() in {"1", "true", "yes"}
        
        if not self.secret_key:
            raise ValueError("SECRET_KEY environment variable is required")
        if self.access_token_expire_minutes <= 0:
            raise ValueError("ACCESS_TOKEN_EXPIRE_MINUTES must be greater than zero")
        if self.refresh_token_expire_minutes <= 0:
            raise ValueError("REFRESH_TOKEN_EXPIRE_MINUTES must be greater than zero")
        
        # Log token configuration for debugging
        print(f"🔐 JWT Security Service initialized:")
        print(f"   - Database Mode: {self.primary_database.upper()}")
        print(f"   - Access Token Expiry: {self.access_token_expire_minutes // 1440} days ({self.access_token_expire_minutes} minutes)")
        print(f"   - Refresh Token Expiry: {self.refresh_token_expire_minutes // 1440} days ({self.refresh_token_expire_minutes} minutes)")
        print(f"   - Mobile Access Token Expiry: {self.mobile_access_token_expire_minutes // 1440} days")
        print(f"   - Mobile Refresh Token Expiry: {self.mobile_refresh_token_expire_minutes // 1440} days")
    
    def create_access_token(self, data: dict, client_info: Optional[Dict[str, str]] = None, is_mobile: bool = False) -> str:
        """Create a JWT access token with device-specific expiration (longer for mobile)"""
        to_encode = data.copy()
        
        # Use extended expiration for mobile apps
        expire_minutes = self.mobile_access_token_expire_minutes if is_mobile else self.access_token_expire_minutes
        expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
        
        # Add standard claims
        to_encode.update({
            "exp": expire,
            "iat": datetime.now(timezone.utc),
            "aud": self.audience,
            "type": "access",
            "jti": secrets.token_hex(16),
        })
        
        # Add client binding for additional security (configurable)
        if self.bind_to_client and client_info:
            client_hash = hashlib.sha256(
                f"{client_info.get('ip', '')}{client_info.get('user_agent', '')}".encode()
            ).hexdigest()[:16]
            to_encode["client_hash"] = client_hash
        
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
    
    def create_refresh_token(self, data: dict, client_info: Optional[Dict[str, str]] = None, is_mobile: bool = False) -> str:
        """Create a JWT refresh token with device-specific expiration (longer for mobile)"""
        to_encode = data.copy()
        
        # Use extended expiration for mobile apps
        expire_minutes = self.mobile_refresh_token_expire_minutes if is_mobile else self.refresh_token_expire_minutes
        expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
        
        # Add standard claims
        to_encode.update({
            "exp": expire,
            "iat": datetime.now(timezone.utc),
            "aud": self.audience,
            "type": "refresh",
            "jti": secrets.token_hex(16)  # Unique token ID for revocation
        })
        
        # Add client binding
        if self.bind_to_client and client_info:
            client_hash = hashlib.sha256(
                f"{client_info.get('ip', '')}{client_info.get('user_agent', '')}".encode()
            ).hexdigest()[:16]
            to_encode["client_hash"] = client_hash
        
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
    
    def verify_token(self, token: str, token_type: str = "access", client_info: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(
                token, 
                self.secret_key, 
                algorithms=[self.algorithm],
                audience=self.audience
            )
            
            # Check token type
            if payload.get("type") != token_type:
                raise HTTPException(status_code=401, detail="Invalid token type")
            
            # Verify client binding if enabled and present
            if self.bind_to_client and client_info and "client_hash" in payload:
                expected_hash = hashlib.sha256(
                    f"{client_info.get('ip', '')}{client_info.get('user_agent', '')}".encode()
                ).hexdigest()[:16]

                if payload["client_hash"] != expected_hash:
                    raise HTTPException(status_code=401, detail="Token bound to different client")
            
            return payload
            
        except ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
        except Exception as e:
            raise HTTPException(status_code=401, detail="Token validation failed")
    
    def get_client_info(self, request: Request) -> Dict[str, str]:
        """Extract client information for token binding. If behind a proxy and TRUST_PROXY is true,
        prefer X-Forwarded-For header's first IP."""
        ip = ""
        if self.trust_proxy:
            xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
            if xff:
                # Take the first IP in the list
                ip = xff.split(",")[0].strip()
        if not ip:
            ip = request.client.host if request.client else ""
        return {
            "ip": ip,
            "user_agent": request.headers.get("user-agent", "")
        }
    
    def refresh_access_token(self, refresh_token: str, client_info: Optional[Dict[str, str]] = None, is_mobile: bool = False) -> tuple[str, str]:
        """Generate a new access token and rotated refresh token using the provided refresh token."""
        payload = self.verify_token(refresh_token, token_type="refresh", client_info=client_info)

        user_data = {
            k: v for k, v in payload.items()
            if k not in ["exp", "iat", "aud", "type", "jti", "client_hash"]
        }

        new_access_token = self.create_access_token(user_data, client_info, is_mobile=is_mobile)
        new_refresh_token = self.create_refresh_token(user_data, client_info, is_mobile=is_mobile)
        return new_access_token, new_refresh_token
    
    def get_token_duration(self, role_id: Optional[int] = None) -> int:
        """Get access token duration in seconds."""
        return self.access_token_expire_minutes * 60

    def get_refresh_token_duration(self) -> int:
        """Get refresh token duration in seconds."""
        return self.refresh_token_expire_minutes * 60

# Global instance
jwt_security = JWTSecurityService()