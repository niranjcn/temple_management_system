"""
Mobile App Verification Middleware for FastAPI
==============================================

This middleware ensures that only your authorized mobile app can access certain endpoints,
while still allowing web browsers from approved origins to work normally.

Features:
- Mobile app verification via secret token (X-Mobile-Auth header)
- Optional User-Agent validation
- Preserves existing CORS for web browsers
- Configurable per-endpoint via dependencies
- Works alongside JWT authentication

Configuration:
1. Set MOBILE_APP_SECRET in your .env file (generate a secure random string)
2. Add this middleware to your FastAPI app
3. Configure which endpoints require mobile verification
"""

import os
import logging
from typing import Optional, Callable
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("mobile_verification")


class MobileVerificationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to verify requests are coming from authorized mobile app.
    
    Configuration via environment variables:
    - MOBILE_APP_SECRET: Secret token the mobile app must send (REQUIRED)
    - MOBILE_APP_USER_AGENT: Expected User-Agent string (OPTIONAL)
    - MOBILE_VERIFICATION_ENABLED: Set to "false" to disable (default: true)
    """
    
    def __init__(
        self,
        app,
        exclude_paths: list = None,
        mobile_only_paths: list = None,
        require_user_agent_match: bool = False
    ):
        super().__init__(app)
        
        # Paths that don't need mobile verification (e.g., docs, health checks)
        self.exclude_paths = exclude_paths or [
            "/docs",
            "/redoc",
            "/openapi.json",
            "/",
            "/api"
        ]
        
        # Paths that REQUIRE mobile app (reject all others including web browsers)
        self.mobile_only_paths = mobile_only_paths or []
        
        # Whether to check User-Agent header
        self.require_user_agent_match = require_user_agent_match
        
        # Load configuration
        self.mobile_secret = os.getenv("MOBILE_APP_SECRET", "").strip()
        self.expected_user_agent = os.getenv("MOBILE_APP_USER_AGENT", "").strip()
        self.verification_enabled = os.getenv("MOBILE_VERIFICATION_ENABLED", "true").lower() == "true"
        
        # Validate configuration
        if self.verification_enabled and not self.mobile_secret:
            logger.error("MOBILE_APP_SECRET not configured! Mobile verification will be disabled.")
            self.verification_enabled = False
        
        if self.verification_enabled:
            logger.info(f"Mobile verification enabled with secret: {self.mobile_secret[:8]}...")
            if self.expected_user_agent:
                logger.info(f"User-Agent validation enabled: {self.expected_user_agent}")
    
    async def dispatch(self, request: Request, call_next):
        """Process each request through mobile verification"""
        
        # Skip if verification is disabled
        if not self.verification_enabled:
            return await call_next(request)
        
        # Skip excluded paths (docs, health checks, etc.)
        if self._should_exclude_path(request.url.path):
            return await call_next(request)
        
        # Skip OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Get request info
        origin = request.headers.get("origin", "")
        mobile_auth_header = request.headers.get("x-mobile-auth", "")
        user_agent = request.headers.get("user-agent", "")
        
        # Check if this path requires mobile-only access
        is_mobile_only_path = self._is_mobile_only_path(request.url.path)
        
        # Determine if request is from mobile app
        is_mobile_app = self._verify_mobile_app(mobile_auth_header, user_agent)
        
        # Determine if request is from web browser
        is_web_browser = self._is_web_browser_request(origin, user_agent)
        
        # DECISION LOGIC:
        # 1. Mobile-only paths: Only mobile app allowed
        # 2. Regular paths: Mobile app OR web browser from allowed origin
        # 3. Everything else: Reject
        
        if is_mobile_only_path:
            # Path requires mobile app
            if not is_mobile_app:
                logger.warning(
                    f"Rejected non-mobile request to mobile-only path: {request.url.path} "
                    f"from IP: {self._get_client_ip(request)}"
                )
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "detail": "This endpoint is only accessible from the authorized mobile application",
                        "error_code": "MOBILE_ONLY_ENDPOINT"
                    }
                )
        else:
            # Regular path: Allow mobile app OR web browser
            if not is_mobile_app and not is_web_browser:
                # Not mobile app and not web browser (probably curl, Postman, etc.)
                logger.warning(
                    f"Rejected unauthorized client request to: {request.url.path} "
                    f"from IP: {self._get_client_ip(request)}, "
                    f"User-Agent: {user_agent[:50]}"
                )
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "detail": "Access denied. Use the official mobile app or web application.",
                        "error_code": "UNAUTHORIZED_CLIENT"
                    }
                )
        
        # Request is authorized - add flag to request state
        request.state.is_mobile_app = is_mobile_app
        request.state.is_web_browser = is_web_browser
        
        # Continue with the request
        response = await call_next(request)
        
        # Log successful access
        logger.debug(
            f"Authorized access: {request.method} {request.url.path} "
            f"(mobile: {is_mobile_app}, web: {is_web_browser})"
        )
        
        return response
    
    def _verify_mobile_app(self, mobile_auth_header: str, user_agent: str) -> bool:
        """Verify if request is from authorized mobile app"""
        
        # Check if mobile auth token is present and correct
        if not mobile_auth_header:
            return False
        
        if mobile_auth_header != self.mobile_secret:
            logger.warning(f"Invalid mobile auth token received: {mobile_auth_header[:10]}...")
            return False
        
        # Optional: Check User-Agent
        if self.require_user_agent_match and self.expected_user_agent:
            if self.expected_user_agent not in user_agent:
                logger.warning(f"User-Agent mismatch. Expected: {self.expected_user_agent}, Got: {user_agent}")
                return False
        
        return True
    
    def _is_web_browser_request(self, origin: str, user_agent: str) -> bool:
        """
        Check if request appears to be from a web browser.
        Web browsers send Origin headers and have browser-like User-Agent.
        This will be further validated by CORS middleware.
        """
        # If there's an Origin header, it's likely a browser
        if origin:
            return True
        
        # Check for browser-like User-Agent
        browser_indicators = ["Mozilla", "Chrome", "Safari", "Firefox", "Edge"]
        return any(indicator in user_agent for indicator in browser_indicators)
    
    def _should_exclude_path(self, path: str) -> bool:
        """Check if path should be excluded from mobile verification"""
        for exclude_path in self.exclude_paths:
            if path.startswith(exclude_path):
                return True
        return False
    
    def _is_mobile_only_path(self, path: str) -> bool:
        """Check if path requires mobile-only access"""
        for mobile_path in self.mobile_only_paths:
            if path.startswith(mobile_path):
                return True
        return False
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address"""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip
        
        return request.client.host if request.client else "unknown"


# Alternative: Dependency for specific endpoints
# ===============================================

def require_mobile_app(request: Request) -> bool:
    """
    Dependency to require mobile app for specific endpoints.
    
    Usage:
        @router.post("/mobile-only-endpoint", dependencies=[Depends(require_mobile_app)])
        async def mobile_only_function():
            ...
    """
    mobile_secret = os.getenv("MOBILE_APP_SECRET", "").strip()
    mobile_auth_header = request.headers.get("x-mobile-auth", "")
    
    if not mobile_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Mobile verification not configured"
        )
    
    if mobile_auth_header != mobile_secret:
        logger.warning(
            f"Mobile-only endpoint accessed without valid token from IP: "
            f"{request.client.host if request.client else 'unknown'}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only accessible from the authorized mobile application"
        )
    
    return True


def require_mobile_or_web(request: Request) -> bool:
    """
    Dependency to require mobile app OR authorized web browser.
    Blocks curl, Postman, and other unauthorized clients.
    
    Usage:
        @router.post("/protected-endpoint", dependencies=[Depends(require_mobile_or_web)])
        async def protected_function():
            ...
    """
    mobile_secret = os.getenv("MOBILE_APP_SECRET", "").strip()
    mobile_auth_header = request.headers.get("x-mobile-auth", "")
    origin = request.headers.get("origin", "")
    
    # Check if it's mobile app
    if mobile_auth_header == mobile_secret:
        return True
    
    # Check if it's web browser with Origin header
    # (CORS middleware will validate the origin)
    if origin:
        return True
    
    # Neither mobile app nor web browser - reject
    logger.warning(
        f"Unauthorized client blocked from IP: {request.client.host if request.client else 'unknown'}"
    )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied. Use the official mobile app or web application."
    )


# Helper function to check if request is from mobile app
# ========================================================

def is_mobile_app_request(request: Request) -> bool:
    """
    Check if current request is from mobile app.
    Use this in endpoint logic if you need to conditionally handle mobile vs web.
    
    Usage:
        if is_mobile_app_request(request):
            # Mobile-specific logic
        else:
            # Web-specific logic
    """
    return getattr(request.state, "is_mobile_app", False)
