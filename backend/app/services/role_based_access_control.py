from typing import Optional, List, Dict, Any
from fastapi import HTTPException, Depends, Request
from functools import wraps
from datetime import datetime, timezone
from ..services.enhanced_jwt_security_service import enhanced_jwt_security
from ..services.auth_service import get_current_admin
from ..database import security_events_collection
import logging

logger = logging.getLogger("role_based_access_control")

class RoleBasedAccessControl:
    """Enhanced Role-Based Access Control System"""
    
    # Role hierarchy (lower number = higher privilege)
    ROLE_HIERARCHY = {
        0: "Super Admin",
        1: "Admin", 
        2: "Privileged",
        3: "Editor",
        4: "Employee",
        5: "Viewer"
    }
    
    # Role-based permissions
    ROLE_PERMISSIONS = {
        0: {  # Super Admin - Full system access
            "user_management": ["create", "read", "update", "delete"],
            "system_settings": ["read", "update"],
            "security_settings": ["read", "update"],
            "financial_operations": ["create", "read", "update", "delete"],
            "audit_logs": ["read"],
            "admin_functions": ["all"],
            "bulk_operations": ["all"],
            "priest_attendance": ["create", "read", "update", "delete"]
        },
        1: {  # Admin - Administrative access
            "user_management": ["create", "read", "update", "delete"],
            "system_settings": ["read"],
            "security_settings": ["read", "update"],
            "financial_operations": ["create", "read", "update"],
            "audit_logs": ["read"],
            "admin_functions": ["most"],
            "bulk_operations": ["limited"],
            "priest_attendance": ["create", "read", "update", "delete"]
        },
        2: {  # Privileged - Extended access (super_user)
            "user_management": ["read", "update"],
            "content_management": ["create", "read", "update", "delete"],
            "reporting": ["read", "create"],
            "bulk_operations": ["limited"],
            "priest_attendance": ["create", "read", "update", "delete"]
        },
        3: {  # Editor - Content management
            "content_management": ["create", "read", "update"],
            "reporting": ["read"],
            "basic_operations": ["all"]
        },
        4: {  # Employee - Basic operations
            "basic_operations": ["create", "read", "update"],
            "self_service": ["all"],
            "priest_attendance": ["create", "read", "update"]
        },
        5: {  # Viewer - Read-only
            "basic_operations": ["read"],
            "self_service": ["read"]
        }
    }
    
    @classmethod
    def get_role_name(cls, role_id: int) -> str:
        """Get human-readable role name"""
        return cls.ROLE_HIERARCHY.get(role_id, "Unknown")
    
    @classmethod
    def has_permission(cls, user_role_id: int, resource: str, action: str) -> bool:
        """Check if user role has permission for specific resource and action"""
        role_permissions = cls.ROLE_PERMISSIONS.get(user_role_id, {})
        resource_permissions = role_permissions.get(resource, [])
        
        return action in resource_permissions or "all" in resource_permissions
    
    @classmethod
    def can_access_role_level(cls, user_role_id: int, target_role_id: int) -> bool:
        """Check if user can access/modify users of target role level"""
        # Can only manage users with higher role_id (lower privilege)
        return user_role_id < target_role_id
    
    @classmethod
    def can_escalate_to_role(cls, actor_role_id: int, target_role_id: int) -> bool:
        """Check if actor can escalate someone to target role"""
        # Cannot escalate to Super Admin
        if target_role_id == 0:
            return False
        
        # Can only grant roles with higher role_id (lower privilege) than actor
        return actor_role_id < target_role_id
    
    @classmethod
    async def log_access_attempt(cls, user_id: str, resource: str, action: str, 
                                success: bool, client_info: Dict[str, str]):
        """Log access attempts for auditing"""
        try:
            await security_events_collection.insert_one({
                "event_type": "access_attempt",
                "user_id": user_id,
                "resource": resource,
                "action": action,
                "success": success,
                "timestamp": datetime.now(timezone.utc),
                "ip_address": client_info.get("ip"),
                "user_agent": client_info.get("user_agent"),
                "details": {
                    "resource": resource,
                    "action": action,
                    "access_granted": success
                }
            })
        except Exception as e:
            logger.error(f"Failed to log access attempt: {str(e)}")

# Decorators for role-based access control
def require_role(min_role_id: int):
    """Decorator to require minimum role level"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get current admin from kwargs or request
            current_admin = kwargs.get('current_admin')
            if not current_admin:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            user_role_id = current_admin.get("role_id", 99)
            
            if user_role_id > min_role_id:
                await RoleBasedAccessControl.log_access_attempt(
                    str(current_admin.get("_id")),
                    func.__name__,
                    "access",
                    False,
                    {"ip": "unknown", "user_agent": "unknown"}
                )
                raise HTTPException(
                    status_code=403, 
                    detail=f"Access denied. Required role: {RoleBasedAccessControl.get_role_name(min_role_id)} or higher"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

def require_permission(resource: str, action: str):
    """Decorator to require specific permission"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            current_admin = kwargs.get('current_admin')
            if not current_admin:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            user_role_id = current_admin.get("role_id", 99)
            
            if not RoleBasedAccessControl.has_permission(user_role_id, resource, action):
                await RoleBasedAccessControl.log_access_attempt(
                    str(current_admin.get("_id")),
                    resource,
                    action,
                    False,
                    {"ip": "unknown", "user_agent": "unknown"}
                )
                raise HTTPException(
                    status_code=403, 
                    detail=f"Access denied. Missing permission: {resource}:{action}"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

def require_step_up_auth(operation: str):
    """Decorator to require step-up authentication for sensitive operations"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request = None
            current_admin = kwargs.get('current_admin')
            
            # Try to find request object in args
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            
            if not current_admin or not request:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            user_role_id = current_admin.get("role_id", 99)
            
            # Check if operation requires step-up auth
            if enhanced_jwt_security.requires_step_up_auth(operation, user_role_id):
                # Verify step-up token
                token_payload = getattr(request.state, 'user', {})
                if not enhanced_jwt_security.verify_step_up_token(token_payload, operation):
                    raise HTTPException(
                        status_code=403, 
                        detail=f"Step-up authentication required for operation: {operation}"
                    )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

# Dependency functions for FastAPI
async def require_admin_role(current_admin: dict = Depends(get_current_admin)):
    """Dependency to require Admin role or higher"""
    user_role_id = current_admin.get("role_id", 99)
    if user_role_id > 1:  # Only Super Admin (0) and Admin (1)
        raise HTTPException(
            status_code=403, 
            detail="Admin role required"
        )
    return current_admin

async def require_super_admin_role(current_admin: dict = Depends(get_current_admin)):
    """Dependency to require Super Admin role"""
    user_role_id = current_admin.get("role_id", 99)
    if user_role_id != 0:  # Only Super Admin (0)
        raise HTTPException(
            status_code=403, 
            detail="Super Admin role required"
        )
    return current_admin

async def require_privileged_role(current_admin: dict = Depends(get_current_admin)):
    """Dependency to require Privileged role or higher"""
    user_role_id = current_admin.get("role_id", 99)
    if user_role_id > 2:  # Super Admin (0), Admin (1), Privileged (2)
        raise HTTPException(
            status_code=403, 
            detail="Privileged role or higher required"
        )
    return current_admin

# Role-based access control instance
rbac = RoleBasedAccessControl()