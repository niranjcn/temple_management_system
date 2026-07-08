from fastapi import APIRouter, HTTPException, Request, Response, status
import os
import re
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import logging

from ..services.jwt_security_service import jwt_security
from ..services.auth_service import authenticate_admin, get_admin_by_username, update_last_login
from ..services.activity_service import create_activity
from ..services.login_rate_limit_service import login_rate_limit_service
from ..services.security_service import SecurityService
from ..models.activity_models import ActivityCreate
from ..database import token_revocation_collection, add_security_origin

router = APIRouter()
logger = logging.getLogger("auth")
security_service = SecurityService()


def _is_allowed_origin(origin: str) -> bool:
    """Validate Origin header against ALLOWED_ORIGINS and ALLOWED_ORIGIN_REGEX.
    Falls back to sane defaults if env not set."""
    if not origin:
        # Allow requests without Origin header (mobile apps)
        # Mobile verification middleware handles authentication
        return True
    raw_allowed = os.getenv("ALLOWED_ORIGINS", "").strip()
    allowed_list = [o.strip() for o in raw_allowed.split(",") if o.strip()] or [
        "https://vamana-temple.netlify.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    origin_regex_env = os.getenv("ALLOWED_ORIGIN_REGEX", "").strip()
    default_origin_regex = r"^https:\/\/([a-z0-9-]+\.)*netlify\.app$"
    allow_origin_regex = origin_regex_env or default_origin_regex

    if origin in allowed_list:
        return True
    try:
        if allow_origin_regex and re.match(allow_origin_regex, origin):
            return True
    except re.error:
        pass
    return False

# Handle CORS preflight requests for auth endpoints
@router.options("/login")
@router.options("/refresh-token")
@router.options("/logout")
async def handle_cors_preflight(request: Request):
    """Handle CORS preflight requests for auth endpoints"""
    origin = request.headers.get("origin", "")
    headers = {
        "Access-Control-Allow-Origin": origin if origin else "*",
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers", "authorization, content-type"),
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "600",
    }
    return Response(status_code=200, headers=headers)

# OAuth2 scheme for Swagger UI
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: Optional[str] = None

class RefreshTokenRequest(BaseModel):
    refresh_token: str


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=128)
    password: str = Field(..., min_length=8, max_length=128)


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, response: Response, credentials: LoginRequest):
    """Authenticate admin users using username and password."""
    origin = request.headers.get("origin", "")
    if not _is_allowed_origin(origin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid origin")

    client_info = jwt_security.get_client_info(request)
    client_ip = client_info.get("ip") or (request.client.host if request.client else "unknown")
    device_identifier = (
        request.headers.get("x-device-id")
        or request.headers.get("x-device-fingerprint")
        or client_info.get("user_agent", "unknown")
    )

    allowed, message, blocked_until = await login_rate_limit_service.register_attempt(client_ip, device_identifier)
    if not allowed:
        detail = message or "Too many login attempts. Please try again later."
        if blocked_until:
            detail = f"{detail} Next attempt after {blocked_until.isoformat()}"
        await security_service.log_security_event(
            event_type="login_rate_limited",
            user_id=None,
            ip_address=client_ip,
            user_agent=client_info.get("user_agent"),
            details={
                "device_identifier": device_identifier,
                "blocked_until": blocked_until.isoformat() if blocked_until else None,
            }
        )
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)

    username = credentials.username.strip()
    admin = await authenticate_admin(username, credentials.password)
    if not admin:
        await security_service.log_security_event(
            event_type="login_failed",
            user_id=None,
            ip_address=client_ip,
            user_agent=client_info.get("user_agent"),
            details={"username": username}
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if admin.get("isRestricted", False):
        await security_service.log_security_event(
            event_type="login_blocked",
            user_id=str(admin.get("_id")),
            ip_address=client_ip,
            user_agent=client_info.get("user_agent"),
            details={"reason": "account_restricted"}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is restricted. Please contact the administrator."
        )

    await update_last_login(admin["_id"])

    await create_activity(ActivityCreate(
        username=admin["username"],
        role=admin.get("role", "Unknown"),
        activity="Logged in via password authentication",
        timestamp=datetime.utcnow()
    ))

    await security_service.log_security_event(
        event_type="login_success",
        user_id=str(admin.get("_id")),
        ip_address=client_ip,
        user_agent=client_info.get("user_agent"),
        details={"device_identifier": device_identifier}
    )

    token_payload = {
        "sub": admin.get("username"),
        "user_id": str(admin.get("_id")),
        "role": admin.get("role", "admin"),
        "role_id": admin.get("role_id", 1),
        "permissions": admin.get("permissions", []),
    }

    # Detect if request is from mobile app (no Origin header or specific User-Agent)
    origin = request.headers.get("origin", "")
    user_agent = request.headers.get("user-agent", "").lower()
    is_mobile = not origin or "dart" in user_agent or "flutter" in user_agent

    access_token = jwt_security.create_access_token(token_payload, client_info, is_mobile=is_mobile)
    refresh_token = jwt_security.create_refresh_token(token_payload, client_info, is_mobile=is_mobile)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=jwt_security.get_refresh_token_duration(),
        path="/"
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=jwt_security.get_token_duration(),
        refresh_token=refresh_token
    )

@router.post("/refresh-token", response_model=TokenResponse)
async def refresh_token(request: Request, response: Response, refresh_request: Optional[RefreshTokenRequest] = None):
    """Issue a new access token and rotate the refresh token."""
    origin = request.headers.get("origin", "")
    if not _is_allowed_origin(origin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid origin")

    refresh_token_value: Optional[str] = None
    if refresh_request and refresh_request.refresh_token:
        refresh_token_value = refresh_request.refresh_token
    else:
        refresh_token_value = request.cookies.get("refresh_token")

    if not refresh_token_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token required")

    client_info = jwt_security.get_client_info(request)

    try:
        payload = jwt_security.verify_token(refresh_token_value, token_type="refresh", client_info=client_info)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Refresh token verification failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    jti = payload.get("jti")
    if jti:
        revoked = await token_revocation_collection.find_one({"jti": jti})
        if revoked:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    admin = await get_admin_by_username(username)
    if not admin or admin.get("isRestricted", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if jti:
        await token_revocation_collection.update_one(
            {"jti": jti},
            {
                "$setOnInsert": add_security_origin({
                    "revoked_at": datetime.utcnow(),
                    "reason": "rotated_refresh",
                })
            },
            upsert=True,
        )

    user_data = {
        "sub": admin.get("username"),
        "user_id": str(admin.get("_id")),
        "role": admin.get("role", "admin"),
        "role_id": admin.get("role_id", 1),
        "permissions": admin.get("permissions", []),
    }

    # Detect if request is from mobile app (no Origin header or specific User-Agent)
    user_agent = request.headers.get("user-agent", "").lower()
    is_mobile = not origin or "dart" in user_agent or "flutter" in user_agent

    new_access_token = jwt_security.create_access_token(user_data, client_info, is_mobile=is_mobile)
    new_refresh_token = jwt_security.create_refresh_token(user_data, client_info, is_mobile=is_mobile)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=jwt_security.get_refresh_token_duration(),
        path="/"
    )

    await security_service.log_security_event(
        event_type="refresh_token_rotated",
        user_id=str(admin.get("_id")),
        ip_address=client_info.get("ip"),
        user_agent=client_info.get("user_agent"),
        details={"previous_jti": jti}
    )

    return TokenResponse(
        access_token=new_access_token,
        expires_in=jwt_security.get_token_duration(),
        refresh_token=new_refresh_token
    )

@router.post("/logout")
async def logout(request: Request, response: Response):
    """Invalidate the current session by revoking the refresh token and clearing cookies."""
    origin = request.headers.get("origin", "")
    if not _is_allowed_origin(origin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid origin")

    refresh_token_value = request.cookies.get("refresh_token")
    if not refresh_token_value:
        try:
            body = await request.json()
            refresh_token_value = body.get("refresh_token")
        except Exception:
            refresh_token_value = None

    client_info = jwt_security.get_client_info(request)
    user_id = None

    if refresh_token_value:
        try:
            payload = jwt_security.verify_token(refresh_token_value, token_type="refresh", client_info=client_info)
            jti = payload.get("jti")
            if jti:
                await token_revocation_collection.update_one(
                    {"jti": jti},
                    {
                        "$setOnInsert": add_security_origin({
                            "revoked_at": datetime.utcnow(),
                            "reason": "logout",
                        })
                    },
                    upsert=True,
                )
            user_identifier = payload.get("user_id") or payload.get("sub")
            if user_identifier is not None:
                user_id = str(user_identifier)
        except Exception as exc:
            logger.debug("Failed to verify refresh token during logout: %s", exc)

    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=True,
        samesite="none",
        path="/"
    )

    await security_service.log_security_event(
        event_type="logout",
        user_id=user_id,
        ip_address=client_info.get("ip"),
        user_agent=client_info.get("user_agent"),
        details={"manual": True}
    )

    return {"message": "Logged out successfully"}

@router.get("/verify-token")
async def verify_token(request: Request):
    """
    Verify current token and return user info
    """
    # Extract token from Authorization header
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    else:
        # Try to get token from HTTP-only cookie as fallback
        token = request.cookies.get("access_token")
    
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    
    # Get client info
    client_info = jwt_security.get_client_info(request)
    
    # Verify token
    try:
        payload = jwt_security.verify_token(token, token_type="access", client_info=client_info)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

    username = payload.get("sub")
    if username:
        admin = await get_admin_by_username(username)
        if not admin or admin.get("isRestricted", False):
            raise HTTPException(status_code=401, detail="Invalid token")
    
    # Return filtered user info
    return {
        "valid": True,
        "user": {k: v for k, v in payload.items() 
                if k not in ["exp", "iat", "aud", "type", "client_hash"]}
    }