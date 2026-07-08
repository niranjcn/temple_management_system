from fastapi import APIRouter, Depends, HTTPException, Request, status
from typing import Optional, List
from ..services.role_based_access_control import (
    rbac, require_admin_role, require_super_admin_role, require_privileged_role,
    require_role, require_permission, require_step_up_auth
)
from ..services.enhanced_jwt_security_service import enhanced_jwt_security
from ..services.auth_service import get_current_admin
from ..database import admins_collection
from ..models.admin_models import AdminUpdate
import logging

router = APIRouter()
logger = logging.getLogger("enhanced_admin")

@router.get("/role-info")
async def get_role_info(current_admin: dict = Depends(get_current_admin)):
    """Get current user's role information and permissions"""
    role_id = current_admin.get("role_id", 99)
    role_name = rbac.get_role_name(role_id)
    permissions = rbac.ROLE_PERMISSIONS.get(role_id, {})
    
    # Get token duration for this role
    token_duration_minutes = enhanced_jwt_security._get_role_based_token_duration(role_id)
    refresh_duration_days = enhanced_jwt_security._get_role_based_refresh_duration(role_id)
    
    return {
        "user_id": str(current_admin.get("_id")),
        "username": current_admin.get("username"),
        "role_id": role_id,
        "role_name": role_name,
        "permissions": permissions,
        "security_settings": {
            "token_duration_minutes": token_duration_minutes,
            "refresh_duration_days": refresh_duration_days,
            "requires_step_up_auth": enhanced_jwt_security.enable_step_up_auth,
            "role_escalation_protection": enhanced_jwt_security.enable_role_escalation_protection
        }
    }

@router.get("/users")
@require_permission("user_management", "read")
async def list_users(
    request: Request,
    current_admin: dict = Depends(require_privileged_role)
):
    """List users (Privileged role or higher required)"""
    try:
        # Get client info for logging
        client_info = enhanced_jwt_security.get_enhanced_client_info(request)
        
        # Get all users that current admin can view
        actor_role_id = current_admin.get("role_id", 99)
        
        # Build query to only show users with higher role_id (lower privilege)
        query = {"role_id": {"$gt": actor_role_id}} if actor_role_id < 99 else {}
        
        users = await admins_collection.find(
            query,
            {"password": 0}  # Exclude password field
        ).to_list(100)
        
        # Log successful access
        await rbac.log_access_attempt(
            str(current_admin.get("_id")),
            "user_management",
            "read",
            True,
            client_info
        )
        
        # Add role names to response
        for user in users:
            user["role_name"] = rbac.get_role_name(user.get("role_id", 99))
        
        return {
            "users": users,
            "total": len(users),
            "access_level": rbac.get_role_name(actor_role_id)
        }
        
    except Exception as e:
        logger.error(f"Failed to list users: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve users")

@router.put("/users/{user_id}")
@require_permission("user_management", "update")
async def update_user(
    user_id: str,
    user_update: AdminUpdate,
    request: Request,
    current_admin: dict = Depends(require_admin_role)
):
    """Update user (Admin role or higher required with escalation protection)"""
    try:
        # Get target user
        target_user = await admins_collection.find_one({"_id": user_id})
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        actor_role_id = current_admin.get("role_id", 99)
        target_role_id = target_user.get("role_id", 99)
        new_role_id = user_update.role_id if hasattr(user_update, 'role_id') else None
        
        # Permission Escalation Protection
        if not enhanced_jwt_security.can_modify_role(actor_role_id, target_role_id, new_role_id):
            client_info = enhanced_jwt_security.get_enhanced_client_info(request)
            await rbac.log_access_attempt(
                str(current_admin.get("_id")),
                "user_management",
                "escalation_attempt",
                False,
                client_info
            )
            raise HTTPException(
                status_code=403, 
                detail="Permission escalation protection: Cannot modify this user or grant this role"
            )
        
        # Update user
        update_data = user_update.dict(exclude_unset=True)
        if update_data:
            await admins_collection.update_one(
                {"_id": user_id},
                {"$set": update_data}
            )
        
        # Log successful update
        client_info = enhanced_jwt_security.get_enhanced_client_info(request)
        await rbac.log_access_attempt(
            str(current_admin.get("_id")),
            "user_management",
            "update",
            True,
            client_info
        )
        
        return {"message": "User updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update user")

@router.delete("/users/{user_id}")
@require_step_up_auth("delete_user")
@require_permission("user_management", "delete")
async def delete_user(
    user_id: str,
    request: Request,
    current_admin: dict = Depends(require_admin_role)
):
    """Delete user (Admin role + Step-up authentication required)"""
    try:
        # Get target user
        target_user = await admins_collection.find_one({"_id": user_id})
        if not target_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        actor_role_id = current_admin.get("role_id", 99)
        target_role_id = target_user.get("role_id", 99)
        
        # Permission Escalation Protection
        if not enhanced_jwt_security.can_modify_role(actor_role_id, target_role_id):
            raise HTTPException(
                status_code=403, 
                detail="Cannot delete user with equal or higher privileges"
            )
        
        # Prevent self-deletion
        if str(current_admin.get("_id")) == user_id:
            raise HTTPException(status_code=403, detail="Cannot delete your own account")
        
        # Delete user
        await admins_collection.delete_one({"_id": user_id})
        
        # Log deletion
        client_info = enhanced_jwt_security.get_enhanced_client_info(request)
        await rbac.log_access_attempt(
            str(current_admin.get("_id")),
            "user_management",
            "delete",
            True,
            client_info
        )
        
        return {"message": f"User {target_user.get('username')} deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete user: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete user")

@router.post("/step-up-auth")
async def request_step_up_auth(
    operation: str,
    request: Request,
    current_admin: dict = Depends(get_current_admin)
):
    """Request step-up authentication token for sensitive operations"""
    try:
        role_id = current_admin.get("role_id", 99)
        
        # Check if operation requires step-up auth for this role
        if not enhanced_jwt_security.requires_step_up_auth(operation, role_id):
            raise HTTPException(
                status_code=400, 
                detail="Step-up authentication not required for this operation"
            )
        
        # Get client info
        client_info = enhanced_jwt_security.get_enhanced_client_info(request)
        
        # Extract device fingerprint
        device_fingerprint = None
        device_fp_header = request.headers.get("x-device-fingerprint")
        if device_fp_header:
            try:
                import json
                device_fingerprint = json.loads(device_fp_header)
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"Failed to parse device fingerprint: {e}")
                device_fingerprint = None
        
        # Create step-up token
        base_token_data = {
            "sub": current_admin.get("username"),
            "user_id": str(current_admin.get("_id")),
            "role": current_admin.get("role"),
            "role_id": current_admin.get("role_id"),
        }
        
        step_up_token = await enhanced_jwt_security.create_step_up_token(
            base_token_data,
            operation,
            client_info,
            device_fingerprint
        )
        
        # Log step-up auth request
        await rbac.log_access_attempt(
            str(current_admin.get("_id")),
            "step_up_auth",
            operation,
            True,
            client_info
        )
        
        return {
            "step_up_token": step_up_token,
            "operation": operation,
            "expires_in": enhanced_jwt_security.step_up_auth_expire_minutes * 60,
            "message": f"Step-up authentication granted for operation: {operation}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Step-up auth failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Step-up authentication failed")

@router.get("/security/access-matrix")
async def get_access_matrix(current_admin: dict = Depends(require_admin_role)):
    """Get role-based access control matrix (Admin only)"""
    return {
        "role_hierarchy": rbac.ROLE_HIERARCHY,
        "role_permissions": rbac.ROLE_PERMISSIONS,
        "token_durations": {
            "super_admin": enhanced_jwt_security.super_admin_token_minutes,
            "admin": enhanced_jwt_security.admin_token_minutes,
            "privileged": enhanced_jwt_security.privileged_token_minutes,
            "editor": enhanced_jwt_security.editor_token_minutes,
            "employee": enhanced_jwt_security.employee_token_minutes
        },
        "refresh_token_durations": {
            "admin_roles": enhanced_jwt_security.admin_refresh_token_days,
            "other_roles": enhanced_jwt_security.other_refresh_token_days
        },
        "security_settings": {
            "role_escalation_protection": enhanced_jwt_security.enable_role_escalation_protection,
            "step_up_auth": enhanced_jwt_security.enable_step_up_auth,
            "step_up_expire_minutes": enhanced_jwt_security.step_up_auth_expire_minutes
        }
    }

@router.get("/security/my-sessions")
async def get_my_sessions(
    request: Request,
    current_admin: dict = Depends(get_current_admin)
):
    """Get current user's active sessions"""
    try:
        from ..database import user_sessions_collection
        
        user_id = str(current_admin.get("_id"))
        
        sessions = await user_sessions_collection.find({
            "user_id": user_id,
            "is_active": True
        }).to_list(50)
        
        # Get current session info
        client_info = enhanced_jwt_security.get_enhanced_client_info(request)
        current_ip = client_info.get("ip")
        
        # Mark current session
        for session in sessions:
            if session.get("ip_address") == current_ip:
                session["is_current"] = True
        
        return {
            "sessions": sessions,
            "total_active": len(sessions),
            "user_id": user_id
        }
        
    except Exception as e:
        logger.error(f"Failed to get user sessions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve sessions")