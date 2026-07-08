import logging
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from ..services.enhanced_jwt_security_service import enhanced_jwt_security
from ..services.security_service import SecurityService

# Configure logging for security events
logger = logging.getLogger("enhanced_jwt_security")
logger.setLevel(logging.INFO)

class EnhancedJWTAuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, exclude_paths: list = None):
        super().__init__(app)
        self.security_service = SecurityService()
        
        # Paths that don't require JWT authentication
        self.exclude_paths = exclude_paths or [
            "/docs", "/redoc", "/openapi.json", "/", 
            "/api/auth/login", "/api/auth/register", 
            "/api/auth/refresh-token", "/api/auth/logout", 
            "/api/auth/enhanced", "/api"
        ]
        
        # Public GET endpoints (no auth required)
        self.public_get_exact = {
            "/api/featured-event",
            "/api/featured-event/",
            "/api/rituals",
            "/api/rituals/",
        }
        
        self.public_get_prefixes = [
            "/api/events/",
            "/api/gallery/",
            "/api/gallery-home-preview",
            "/api/slideshow",
            "/api/v1/calendar/",
        ]
    
    async def dispatch(self, request: Request, call_next):
        # Skip validation for CORS preflight requests
        if request.method == "OPTIONS":
            logger.info(f"OPTIONS request for {request.url.path} - passing through JWT middleware")
            return await call_next(request)
            
        # Skip validation for excluded paths
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            logger.info(f"Excluding {request.url.path} from JWT validation (matched exclusion path)")
            return await call_next(request)
        
        # Skip validation for non-API paths
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        # Allow public GET endpoints
        if request.method == "GET":
            path = request.url.path
            if path in self.public_get_exact:
                return await call_next(request)
            if any(path.startswith(prefix) for prefix in self.public_get_prefixes):
                return await call_next(request)
        
        # Get enhanced client info
        client_info = enhanced_jwt_security.get_enhanced_client_info(request)
        client_ip = client_info.get("ip", "unknown")
        origin = request.headers.get("origin", "unknown")
        
        # Log the request for monitoring
        logger.info(f"API request: {request.method} {request.url.path} from IP {client_ip}, Origin: {origin}")
        
        try:
            # Extract token from Authorization header or secure cookie
            token = None
            auth_header = request.headers.get("Authorization")
            
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
            else:
                # Try to get token from secure cookie as fallback
                token = enhanced_jwt_security.get_secure_cookie(request, "access_token")
            
            if not token:
                logger.warning(f"Missing token for {request.method} {request.url.path} from IP {client_ip}")
                
                # Log security event
                await self.security_service.log_security_event(
                    event_type="missing_token",
                    ip_address=client_ip,
                    user_agent=client_info.get("user_agent"),
                    details={"endpoint": request.url.path, "method": request.method}
                )
                
                return JSONResponse(
                    status_code=401,
                    content={
                        "detail": "Authentication required",
                        "error_code": "MISSING_TOKEN"
                    }
                )
            
            # Extract device fingerprint from headers
            device_fingerprint = None
            device_fp_header = request.headers.get("x-device-fingerprint")
            if device_fp_header:
                try:
                    import json
                    device_fingerprint = json.loads(device_fp_header)
                except:
                    logger.warning(f"Invalid device fingerprint header from IP {client_ip}")
            
            # Verify token with enhanced security
            payload = await enhanced_jwt_security.verify_token(
                token, 
                token_type="access", 
                client_info=client_info, 
                device_fingerprint=device_fingerprint
            )
            
            # Add enhanced user info to request state
            request.state.user = payload
            request.state.client_info = client_info
            request.state.device_fingerprint = device_fingerprint
            
            # Continue with the request
            response = await call_next(request)
            
            # Log successful request
            await self.security_service.log_security_event(
                event_type="api_request_success",
                user_id=payload.get("user_id"),
                ip_address=client_ip,
                user_agent=client_info.get("user_agent"),
                details={
                    "endpoint": request.url.path,
                    "method": request.method,
                    "status_code": response.status_code
                }
            )
            
            return response
            
        except HTTPException as e:
            # Log authentication failure
            await self.security_service.log_security_event(
                event_type="authentication_failed",
                ip_address=client_ip,
                user_agent=client_info.get("user_agent"),
                details={
                    "endpoint": request.url.path,
                    "method": request.method,
                    "error": str(e.detail)
                }
            )
            
            logger.warning(f"Authentication failed for {request.method} {request.url.path} from IP {client_ip}: {e.detail}")
            
            return JSONResponse(
                status_code=e.status_code,
                content={
                    "detail": e.detail,
                    "error_code": "AUTH_FAILED"
                }
            )
            
        except Exception as e:
            # Log unexpected errors
            await self.security_service.log_security_event(
                event_type="authentication_error",
                ip_address=client_ip,
                user_agent=client_info.get("user_agent"),
                details={
                    "endpoint": request.url.path,
                    "method": request.method,
                    "error": str(e)
                }
            )
            
            logger.error(f"Unexpected authentication error for {request.method} {request.url.path} from IP {client_ip}: {str(e)}")
            
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal authentication error",
                    "error_code": "AUTH_ERROR"
                }
            )