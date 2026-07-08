"""
API Security Service
Implements Rate Limiting, Request Signing, API Versioning, and Input Validation
"""

import hmac
import hashlib
import time
import json
import re
from typing import Dict, List, Optional, Any
from collections import defaultdict, deque
from datetime import datetime, timedelta
from fastapi import Request, HTTPException, Header
from pydantic import BaseModel, validator
import bleach
import html
from ..database import security_events_collection
import logging

logger = logging.getLogger("api_security")

class APISecurityService:
    def __init__(self):
        # Rate limiting storage per endpoint
        self.endpoint_rate_limits = defaultdict(lambda: deque())
        self.global_rate_limits = defaultdict(lambda: deque())
        
        # API versioning
        self.supported_versions = ["v1", "v2"]
        self.deprecated_versions = {"v1": datetime(2025, 12, 31)}  # v1 deprecated end of 2025
        self.minimum_version = "v1"
        
        # Request signing configuration
        self.require_signature_endpoints = {
            "/api/enhanced-admin/users",
            "/api/admin/security",
            "/api/enhanced-auth/login"
        }
        
        # Input validation patterns
        self.validation_patterns = {
            "email": re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'),
            "phone": re.compile(r'^\+?1?-?\.?\s?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}$'),
            "username": re.compile(r'^[a-zA-Z0-9_.-]{3,30}$'),
            "safe_string": re.compile(r'^[a-zA-Z0-9\s._-]+$'),
            "mongodb_id": re.compile(r'^[a-fA-F0-9]{24}$')
        }
        
        # Rate limit configurations per endpoint type
        self.rate_limit_config = {
            "authentication": {"requests": 5, "window": 60, "burst": 10},  # 5/min, burst 10
            "user_management": {"requests": 20, "window": 60, "burst": 30},  # 20/min
            "data_read": {"requests": 100, "window": 60, "burst": 150},  # 100/min
            "data_write": {"requests": 30, "window": 60, "burst": 50},  # 30/min
            "admin_operations": {"requests": 10, "window": 60, "burst": 15},  # 10/min
            "global": {"requests": 200, "window": 60, "burst": 300}  # 200/min global
        }
        
        # Dangerous input patterns to block
        self.dangerous_patterns = [
            re.compile(r'<script[^>]*>.*?</script>', re.IGNORECASE | re.DOTALL),
            re.compile(r'javascript:', re.IGNORECASE),
            re.compile(r'vbscript:', re.IGNORECASE),
            re.compile(r'onload\s*=', re.IGNORECASE),
            re.compile(r'onerror\s*=', re.IGNORECASE),
            re.compile(r'onclick\s*=', re.IGNORECASE),
            re.compile(r'eval\s*\(', re.IGNORECASE),
            re.compile(r'expression\s*\(', re.IGNORECASE),
            re.compile(r'\.\./', re.IGNORECASE),
            re.compile(r'union\s+select', re.IGNORECASE),
            re.compile(r'drop\s+table', re.IGNORECASE),
            re.compile(r'insert\s+into', re.IGNORECASE),
            re.compile(r'delete\s+from', re.IGNORECASE)
        ]
    
    async def apply_rate_limiting(self, request: Request, endpoint_type: str = "data_read") -> Dict[str, Any]:
        """Apply rate limiting to API endpoints"""
        client_ip = self._get_client_ip(request)
        endpoint = str(request.url.path)
        current_time = time.time()
        
        # Get rate limit config for this endpoint type
        config = self.rate_limit_config.get(endpoint_type, self.rate_limit_config["data_read"])
        window_seconds = config["window"]
        max_requests = config["requests"]
        burst_limit = config["burst"]
        
        # Clean old entries
        cutoff_time = current_time - window_seconds
        
        # Endpoint-specific rate limiting
        endpoint_key = f"{client_ip}:{endpoint}"
        endpoint_requests = self.endpoint_rate_limits[endpoint_key]
        
        # Remove old requests
        while endpoint_requests and endpoint_requests[0] < cutoff_time:
            endpoint_requests.popleft()
        
        # Global rate limiting
        global_requests = self.global_rate_limits[client_ip]
        while global_requests and global_requests[0] < cutoff_time:
            global_requests.popleft()
        
        # Check limits
        endpoint_count = len(endpoint_requests)
        global_count = len(global_requests)
        global_config = self.rate_limit_config["global"]
        
        rate_limit_result = {
            "allowed": True,
            "endpoint_requests": endpoint_count,
            "global_requests": global_count,
            "endpoint_limit": max_requests,
            "global_limit": global_config["requests"],
            "window_seconds": window_seconds,
            "reset_time": current_time + window_seconds
        }
        
        # Check endpoint-specific limit
        if endpoint_count >= burst_limit:
            rate_limit_result["allowed"] = False
            rate_limit_result["reason"] = f"Endpoint burst limit exceeded ({endpoint_count}/{burst_limit})"
            
            await self._log_rate_limit_event(client_ip, endpoint, "burst_limit", rate_limit_result)
            
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded for endpoint. Try again in {window_seconds} seconds.",
                headers={
                    "Retry-After": str(window_seconds),
                    "X-RateLimit-Limit": str(burst_limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(current_time + window_seconds))
                }
            )
        
        elif endpoint_count >= max_requests:
            rate_limit_result["allowed"] = False
            rate_limit_result["reason"] = f"Endpoint rate limit exceeded ({endpoint_count}/{max_requests})"
            
            await self._log_rate_limit_event(client_ip, endpoint, "rate_limit", rate_limit_result)
            
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {window_seconds} seconds.",
                headers={
                    "Retry-After": str(window_seconds),
                    "X-RateLimit-Limit": str(max_requests),
                    "X-RateLimit-Remaining": str(max_requests - endpoint_count),
                    "X-RateLimit-Reset": str(int(current_time + window_seconds))
                }
            )
        
        # Check global limit
        if global_count >= global_config["requests"]:
            rate_limit_result["allowed"] = False
            rate_limit_result["reason"] = f"Global rate limit exceeded ({global_count}/{global_config['requests']})"
            
            await self._log_rate_limit_event(client_ip, "GLOBAL", "global_limit", rate_limit_result)
            
            raise HTTPException(
                status_code=429,
                detail="Global rate limit exceeded. Please slow down your requests.",
                headers={
                    "Retry-After": str(window_seconds),
                    "X-RateLimit-Global": str(global_config["requests"]),
                    "X-RateLimit-Global-Remaining": "0"
                }
            )
        
        # Add current request to counters
        endpoint_requests.append(current_time)
        global_requests.append(current_time)
        
        # Add rate limit headers to response
        rate_limit_result["headers"] = {
            "X-RateLimit-Limit": str(max_requests),
            "X-RateLimit-Remaining": str(max_requests - endpoint_count - 1),
            "X-RateLimit-Reset": str(int(current_time + window_seconds)),
            "X-RateLimit-Global": str(global_config["requests"]),
            "X-RateLimit-Global-Remaining": str(global_config["requests"] - global_count - 1)
        }
        
        return rate_limit_result
    
    async def verify_request_signature(
        self,
        request: Request,
        signature: Optional[str] = Header(None, alias="X-Signature"),
        timestamp: Optional[str] = Header(None, alias="X-Timestamp"),
        api_key: Optional[str] = Header(None, alias="X-API-Key")
    ) -> Dict[str, Any]:
        """Verify HMAC signature for critical operations"""
        
        # Check if this endpoint requires signature
        endpoint = str(request.url.path)
        requires_signature = any(
            endpoint.startswith(req_endpoint) 
            for req_endpoint in self.require_signature_endpoints
        )
        
        verification_result = {
            "verified": True,
            "required": requires_signature,
            "endpoint": endpoint
        }
        
        if not requires_signature:
            return verification_result
        
        # Signature is required for this endpoint
        if not signature or not timestamp or not api_key:
            verification_result["verified"] = False
            verification_result["reason"] = "Missing signature headers"
            
            raise HTTPException(
                status_code=401,
                detail="Request signature required for this endpoint",
                headers={"WWW-Authenticate": "HMAC-SHA256"}
            )
        
        try:
            # Check timestamp (prevent replay attacks)
            request_time = float(timestamp)
            current_time = time.time()
            
            if abs(current_time - request_time) > 300:  # 5 minutes
                verification_result["verified"] = False
                verification_result["reason"] = "Request timestamp too old"
                
                raise HTTPException(
                    status_code=401,
                    detail="Request timestamp is too old or in the future"
                )
            
            # Get request body for signature
            body = await request.body()
            
            # Create signature payload
            signature_payload = f"{request.method}{endpoint}{timestamp}{body.decode()}"
            
            # Get API key secret (in production, fetch from secure storage)
            api_key_secret = self._get_api_key_secret(api_key)
            if not api_key_secret:
                verification_result["verified"] = False
                verification_result["reason"] = "Invalid API key"
                
                raise HTTPException(
                    status_code=401,
                    detail="Invalid API key"
                )
            
            # Calculate expected signature
            expected_signature = hmac.new(
                api_key_secret.encode(),
                signature_payload.encode(),
                hashlib.sha256
            ).hexdigest()
            
            # Verify signature
            if not hmac.compare_digest(signature, expected_signature):
                verification_result["verified"] = False
                verification_result["reason"] = "Invalid signature"
                
                await self._log_signature_failure(request, api_key, signature)
                
                raise HTTPException(
                    status_code=401,
                    detail="Invalid request signature"
                )
            
            verification_result["api_key"] = api_key
            verification_result["timestamp"] = request_time
            
            return verification_result
            
        except ValueError:
            verification_result["verified"] = False
            verification_result["reason"] = "Invalid timestamp format"
            
            raise HTTPException(
                status_code=400,
                detail="Invalid timestamp format"
            )
    
    def validate_api_version(self, request: Request) -> Dict[str, Any]:
        """Validate and handle API versioning"""
        
        # Get version from header or URL
        version = request.headers.get("API-Version")
        
        if not version:
            # Try to extract from URL path
            path_parts = str(request.url.path).split("/")
            for part in path_parts:
                if part.startswith("v") and part[1:].isdigit():
                    version = part
                    break
        
        if not version:
            version = self.minimum_version  # Default to minimum version
        
        version_result = {
            "version": version,
            "supported": version in self.supported_versions,
            "deprecated": version in self.deprecated_versions,
            "minimum_version": self.minimum_version
        }
        
        # Check if version is supported
        if version not in self.supported_versions:
            version_result["error"] = f"Unsupported API version: {version}"
            
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported API version: {version}. Supported versions: {', '.join(self.supported_versions)}",
                headers={
                    "API-Version": self.supported_versions[-1],  # Latest version
                    "API-Supported-Versions": ",".join(self.supported_versions)
                }
            )
        
        # Check if version is deprecated
        if version in self.deprecated_versions:
            deprecation_date = self.deprecated_versions[version]
            version_result["deprecation_date"] = deprecation_date.isoformat()
            
            if datetime.now() > deprecation_date:
                version_result["error"] = f"API version {version} is deprecated and no longer supported"
                
                raise HTTPException(
                    status_code=400,
                    detail=f"API version {version} is deprecated. Please upgrade to {self.supported_versions[-1]}",
                    headers={
                        "API-Version": self.supported_versions[-1],
                        "API-Deprecated": "true",
                        "API-Sunset": deprecation_date.isoformat()
                    }
                )
        
        return version_result
    
    async def validate_and_sanitize_input(self, data: Any, validation_rules: Dict[str, str] = None) -> Dict[str, Any]:
        """Comprehensive input validation and sanitization"""
        
        validation_result = {
            "valid": True,
            "sanitized_data": data,
            "errors": [],
            "warnings": []
        }
        
        if isinstance(data, dict):
            sanitized_dict = {}
            
            for key, value in data.items():
                # Validate key name
                if not self._is_safe_key(key):
                    validation_result["valid"] = False
                    validation_result["errors"].append(f"Invalid key name: {key}")
                    continue
                
                # Sanitize and validate value
                sanitized_value, value_errors = await self._sanitize_value(value, key, validation_rules)
                
                if value_errors:
                    validation_result["errors"].extend(value_errors)
                    validation_result["valid"] = False
                else:
                    sanitized_dict[key] = sanitized_value
            
            validation_result["sanitized_data"] = sanitized_dict
        
        elif isinstance(data, list):
            sanitized_list = []
            
            for i, item in enumerate(data):
                sanitized_item, item_errors = await self._sanitize_value(item, f"item_{i}")
                
                if item_errors:
                    validation_result["errors"].extend(item_errors)
                    validation_result["valid"] = False
                else:
                    sanitized_list.append(sanitized_item)
            
            validation_result["sanitized_data"] = sanitized_list
        
        elif isinstance(data, str):
            sanitized_str, str_errors = await self._sanitize_value(data, "input")
            validation_result["sanitized_data"] = sanitized_str
            
            if str_errors:
                validation_result["errors"].extend(str_errors)
                validation_result["valid"] = False
        
        # Log validation failures
        if not validation_result["valid"]:
            await self._log_validation_failure(data, validation_result["errors"])
        
        return validation_result
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address"""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip
        
        return request.client.host if request.client else "unknown"
    
    def _get_api_key_secret(self, api_key: str) -> Optional[str]:
        """Get API key secret (in production, fetch from secure storage)"""
        # This is a simple example - in production, fetch from database or secure vault
        api_keys = {
            "admin_key_001": "super_secret_admin_key_001",
            "service_key_001": "super_secret_service_key_001"
        }
        return api_keys.get(api_key)
    
    def _is_safe_key(self, key: str) -> bool:
        """Check if key name is safe"""
        if not isinstance(key, str):
            return False
        
        # Check length
        if len(key) > 100:
            return False
        
        # Check for dangerous patterns
        for pattern in self.dangerous_patterns:
            if pattern.search(key):
                return False
        
        return True
    
    async def _sanitize_value(self, value: Any, field_name: str, validation_rules: Dict = None) -> tuple:
        """Sanitize and validate a single value"""
        errors = []
        
        if isinstance(value, str):
            # Check for dangerous patterns
            for pattern in self.dangerous_patterns:
                if pattern.search(value):
                    errors.append(f"Dangerous pattern detected in {field_name}")
                    break
            
            # HTML encode to prevent XSS
            sanitized = html.escape(value)
            
            # Use bleach for additional sanitization
            sanitized = bleach.clean(
                sanitized,
                tags=[],  # No HTML tags allowed
                attributes={},
                strip=True
            )
            
            # Apply field-specific validation
            if validation_rules and field_name in validation_rules:
                rule = validation_rules[field_name]
                if rule in self.validation_patterns:
                    pattern = self.validation_patterns[rule]
                    if not pattern.match(sanitized):
                        errors.append(f"Invalid format for {field_name} (expected {rule})")
            
            return sanitized, errors
        
        elif isinstance(value, (int, float)):
            # Validate numeric ranges
            if isinstance(value, int) and (value < -2147483648 or value > 2147483647):
                errors.append(f"Integer out of range for {field_name}")
            
            return value, errors
        
        elif isinstance(value, dict):
            sanitized_dict = {}
            for k, v in value.items():
                if self._is_safe_key(k):
                    sanitized_v, v_errors = await self._sanitize_value(v, f"{field_name}.{k}")
                    if not v_errors:
                        sanitized_dict[k] = sanitized_v
                    else:
                        errors.extend(v_errors)
                else:
                    errors.append(f"Unsafe key in {field_name}: {k}")
            
            return sanitized_dict, errors
        
        elif isinstance(value, list):
            sanitized_list = []
            for i, item in enumerate(value):
                sanitized_item, item_errors = await self._sanitize_value(item, f"{field_name}[{i}]")
                if not item_errors:
                    sanitized_list.append(sanitized_item)
                else:
                    errors.extend(item_errors)
            
            return sanitized_list, errors
        
        else:
            # For other types (bool, None, etc.), return as-is
            return value, errors
    
    async def _log_rate_limit_event(self, client_ip: str, endpoint: str, event_type: str, details: Dict):
        """Log rate limiting event"""
        await security_events_collection.insert_one({
            "event_type": f"rate_limit_{event_type}",
            "client_ip": client_ip,
            "endpoint": endpoint,
            "details": details,
            "timestamp": datetime.utcnow(),
            "severity": "medium"
        })
    
    async def _log_signature_failure(self, request: Request, api_key: str, provided_signature: str):
        """Log signature verification failure"""
        await security_events_collection.insert_one({
            "event_type": "signature_verification_failed",
            "client_ip": self._get_client_ip(request),
            "endpoint": str(request.url.path),
            "api_key": api_key,
            "provided_signature": provided_signature[:20] + "...",  # Truncated for security
            "timestamp": datetime.utcnow(),
            "severity": "high"
        })
    
    async def _log_validation_failure(self, data: Any, errors: List[str]):
        """Log input validation failure"""
        await security_events_collection.insert_one({
            "event_type": "input_validation_failed",
            "validation_errors": errors,
            "data_sample": str(data)[:200] if data else None,  # Truncated sample
            "timestamp": datetime.utcnow(),
            "severity": "medium"
        })
    
    def get_rate_limit_stats(self) -> Dict[str, Any]:
        """Get rate limiting statistics"""
        current_time = time.time()
        minute_ago = current_time - 60
        
        active_endpoints = 0
        total_requests = 0
        
        for endpoint_key, requests in self.endpoint_rate_limits.items():
            recent_requests = len([r for r in requests if r > minute_ago])
            if recent_requests > 0:
                active_endpoints += 1
                total_requests += recent_requests
        
        return {
            "active_endpoints": active_endpoints,
            "total_requests_last_minute": total_requests,
            "rate_limit_config": self.rate_limit_config,
            "supported_api_versions": self.supported_versions,
            "deprecated_versions": {
                k: v.isoformat() for k, v in self.deprecated_versions.items()
            }
        }

# Global instance
api_security = APISecurityService()