"""
Enhanced Security Middleware
Integrates network security, API security, and database security
"""

import time
import json
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from ..services.network_security_service import network_security
from ..services.api_security_service import api_security
from ..services.database_security_service import db_security
import logging
from typing import Dict, Any

logger = logging.getLogger("enhanced_security_middleware")

class EnhancedSecurityMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app: ASGIApp,
        exclude_paths: list = None,
        enable_waf: bool = True,
        enable_ddos_protection: bool = True,
        enable_rate_limiting: bool = True,
        enable_request_signing: bool = False  # Optional for critical endpoints
    ):
        super().__init__(app)
        self.exclude_paths = exclude_paths or []
        self.enable_waf = enable_waf
        self.enable_ddos_protection = enable_ddos_protection
        self.enable_rate_limiting = enable_rate_limiting
        self.enable_request_signing = enable_request_signing
        
        # Define endpoint security classifications
        self.endpoint_classifications = {
            "/api/enhanced-auth/login": {"type": "authentication", "critical": True},
            "/api/enhanced-auth/register": {"type": "authentication", "critical": True},
            "/api/enhanced-admin/users": {"type": "user_management", "critical": True},
            "/api/admin/security": {"type": "admin_operations", "critical": True},
            "/api/events": {"type": "data_write", "critical": False},
            "/api/bookings": {"type": "data_write", "critical": False},
            "/api/gallery": {"type": "data_read", "critical": False},
            "/api/rituals": {"type": "data_read", "critical": False}
        }
    
    async def dispatch(self, request: Request, call_next) -> Response:
        """Main middleware dispatch method"""
        start_time = time.time()
        
        # Skip security checks for excluded paths
        if self._should_exclude_path(request.url.path):
            return await call_next(request)
        
        try:
            # Step 1: Network Security (WAF + DDoS Protection)
            await self._apply_network_security(request)
            
            # Step 2: API Security (Rate Limiting + Versioning + Input Validation)
            await self._apply_api_security(request)
            
            # Step 3: Request Signing Verification (for critical endpoints)
            if self.enable_request_signing:
                await self._verify_request_signing(request)
            
            # Process the request
            response = await call_next(request)
            
            # Step 4: Apply security headers to response
            self._apply_security_headers(response)
            
            # Step 5: Log security metrics
            await self._log_security_metrics(request, response, time.time() - start_time)
            
            return response
            
        except HTTPException as e:
            # Security check failed - return appropriate error
            return JSONResponse(
                status_code=e.status_code,
                content={"error": e.detail},
                headers=e.headers or {}
            )
        except Exception as e:
            logger.error(f"Security middleware error: {str(e)}")
            return JSONResponse(
                status_code=500,
                content={"error": "Internal security error"}
            )
    
    async def _apply_network_security(self, request: Request):
        """Apply network-level security (WAF + DDoS)"""
        
        if self.enable_waf:
            # Web Application Firewall inspection
            waf_result = await network_security.waf_inspection(request)
            
            if waf_result["blocked"]:
                logger.warning(f"WAF blocked request from {waf_result['client_ip']}: {waf_result['threats_detected']}")
                raise HTTPException(
                    status_code=403,
                    detail="Request blocked by Web Application Firewall",
                    headers={"X-WAF-Block": "true"}
                )
        
        if self.enable_ddos_protection:
            # DDoS protection
            ddos_result = await network_security.ddos_protection(request)
            
            if ddos_result["blocked"]:
                logger.warning(f"DDoS protection blocked request from {ddos_result['client_ip']}")
                raise HTTPException(
                    status_code=429,
                    detail="Request blocked by DDoS protection",
                    headers={
                        "Retry-After": "300",  # 5 minutes
                        "X-DDoS-Block": "true"
                    }
                )
    
    async def _apply_api_security(self, request: Request):
        """Apply API-level security (Rate Limiting + Validation)"""
        
        # Determine endpoint classification
        endpoint_info = self._classify_endpoint(request.url.path)
        
        if self.enable_rate_limiting:
            # Apply rate limiting based on endpoint type
            try:
                rate_limit_result = await api_security.apply_rate_limiting(
                    request, 
                    endpoint_info["type"]
                )
                
                # Add rate limit headers to request for later use in response
                request.state.rate_limit_headers = rate_limit_result.get("headers", {})
                
            except HTTPException as e:
                # Rate limit exceeded
                raise e
        
        # API version validation
        try:
            version_result = api_security.validate_api_version(request)
            request.state.api_version = version_result
        except HTTPException as e:
            raise e
        
        # Input validation for POST/PUT requests
        if request.method in ["POST", "PUT", "PATCH"]:
            await self._validate_request_input(request)
    
    async def _verify_request_signing(self, request: Request):
        """Verify request signature for critical endpoints"""
        endpoint_info = self._classify_endpoint(request.url.path)
        
        if endpoint_info["critical"]:
            try:
                signature_result = await api_security.verify_request_signature(request)
                request.state.signature_verified = signature_result["verified"]
                request.state.api_key = signature_result.get("api_key")
            except HTTPException as e:
                raise e
    
    async def _validate_request_input(self, request: Request):
        """Validate and sanitize request input"""
        try:
            # Get request body
            body = await request.body()
            
            if body:
                # Parse JSON if content-type is JSON
                content_type = request.headers.get("content-type", "")
                
                if "application/json" in content_type:
                    try:
                        data = json.loads(body.decode())
                        
                        # Validate and sanitize input
                        validation_result = await api_security.validate_and_sanitize_input(data)
                        
                        if not validation_result["valid"]:
                            logger.warning(f"Input validation failed: {validation_result['errors']}")
                            raise HTTPException(
                                status_code=400,
                                detail=f"Input validation failed: {', '.join(validation_result['errors'])}"
                            )
                        
                        # Store sanitized data for use in the endpoint
                        request.state.sanitized_data = validation_result["sanitized_data"]
                        
                    except json.JSONDecodeError:
                        raise HTTPException(
                            status_code=400,
                            detail="Invalid JSON format"
                        )
                
                elif "application/x-www-form-urlencoded" in content_type:
                    # Handle form data
                    form_data = {}
                    for pair in body.decode().split("&"):
                        if "=" in pair:
                            key, value = pair.split("=", 1)
                            form_data[key] = value
                    
                    validation_result = await api_security.validate_and_sanitize_input(form_data)
                    
                    if not validation_result["valid"]:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Input validation failed: {', '.join(validation_result['errors'])}"
                        )
                    
                    request.state.sanitized_data = validation_result["sanitized_data"]
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Input validation error: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Input validation error"
            )
    
    def _apply_security_headers(self, response: Response):
        """Apply security headers to response"""
        # Apply HSTS and security headers (excluding HTTPS enforcement for localhost)
        network_security.add_hsts_headers(response)
        
        # Add rate limit headers if available
        if hasattr(response, 'state') and hasattr(response.state, 'rate_limit_headers'):
            for header, value in response.state.rate_limit_headers.items():
                response.headers[header] = value
        
        # Add API version headers
        if hasattr(response, 'state') and hasattr(response.state, 'api_version'):
            api_version = response.state.api_version
            if api_version.get("deprecated"):
                response.headers["API-Deprecated"] = "true"
                if "deprecation_date" in api_version:
                    response.headers["API-Sunset"] = api_version["deprecation_date"]
        
        # Add security processing headers
        response.headers["X-Security-Processed"] = "true"
        response.headers["X-WAF-Enabled"] = str(self.enable_waf).lower()
        response.headers["X-DDoS-Protection"] = str(self.enable_ddos_protection).lower()
        response.headers["X-Rate-Limiting"] = str(self.enable_rate_limiting).lower()
    
    async def _log_security_metrics(self, request: Request, response: Response, processing_time: float):
        """Log security processing metrics"""
        try:
            security_metrics = {
                "endpoint": str(request.url.path),
                "method": request.method,
                "status_code": response.status_code,
                "processing_time_ms": round(processing_time * 1000, 2),
                "client_ip": self._get_client_ip(request),
                "user_agent": request.headers.get("user-agent", ""),
                "waf_enabled": self.enable_waf,
                "ddos_protection": self.enable_ddos_protection,
                "rate_limiting": self.enable_rate_limiting,
                "timestamp": time.time()
            }
            
            # Add additional metrics if available
            if hasattr(request.state, 'api_version'):
                security_metrics["api_version"] = request.state.api_version.get("version")
            
            if hasattr(request.state, 'signature_verified'):
                security_metrics["signature_verified"] = request.state.signature_verified
            
            # Log to security events (this could be async but we'll keep it simple)
            from ..database import security_events_collection
            await security_events_collection.insert_one({
                "event_type": "security_middleware_metrics",
                "metrics": security_metrics,
                "timestamp": time.time(),
                "severity": "info"
            })
            
        except Exception as e:
            logger.error(f"Failed to log security metrics: {str(e)}")
    
    def _should_exclude_path(self, path: str) -> bool:
        """Check if path should be excluded from security checks"""
        for exclude_path in self.exclude_paths:
            if path.startswith(exclude_path):
                return True
        return False
    
    def _classify_endpoint(self, path: str) -> Dict[str, Any]:
        """Classify endpoint for security purposes"""
        # Check for exact matches first
        if path in self.endpoint_classifications:
            return self.endpoint_classifications[path]
        
        # Check for pattern matches
        for pattern, classification in self.endpoint_classifications.items():
            if path.startswith(pattern.rstrip("*")):
                return classification
        
        # Default classification
        return {"type": "data_read", "critical": False}
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address"""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip
        
        return request.client.host if request.client else "unknown"

# Middleware factory function
def create_enhanced_security_middleware(
    exclude_paths: list = None,
    enable_waf: bool = True,
    enable_ddos_protection: bool = True,
    enable_rate_limiting: bool = True,
    enable_request_signing: bool = False
):
    """Factory function to create enhanced security middleware with configuration"""
    
    def middleware_factory(app: ASGIApp):
        return EnhancedSecurityMiddleware(
            app,
            exclude_paths=exclude_paths,
            enable_waf=enable_waf,
            enable_ddos_protection=enable_ddos_protection,
            enable_rate_limiting=enable_rate_limiting,
            enable_request_signing=enable_request_signing
        )
    
    return middleware_factory