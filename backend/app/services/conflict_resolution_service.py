"""
Conflict Resolution Utilities
Helper functions for resolving sync conflicts automatically or semi-automatically.
"""

import logging
from typing import Dict, Optional, List
from datetime import datetime
import secrets
import string

logger = logging.getLogger(__name__)


def generate_unique_suffix(length: int = 4) -> str:
    """
    Generate a cryptographically secure random alphanumeric suffix for renaming conflicts.
    
    Args:
        length: Length of the suffix (default: 4)
    
    Returns:
        Random string like "_a7k2"
    """
    chars = string.ascii_lowercase + string.digits
    return "_" + "".join(secrets.choice(chars) for _ in range(length))


def auto_rename_field(original_value: str, suffix: Optional[str] = None) -> str:
    """
    Automatically rename a field value to avoid conflicts.
    
    Args:
        original_value: Original field value (e.g., "username")
        suffix: Optional specific suffix (if None, generates random)
    
    Returns:
        Renamed value (e.g., "username_a7k2")
    """
    if suffix is None:
        suffix = generate_unique_suffix()
    
    return f"{original_value}{suffix}"


def suggest_conflict_resolution(
    conflict: Dict,
    local_doc: Dict,
    remote_doc: Optional[Dict] = None
) -> Dict[str, any]:
    """
    Suggest an automatic resolution strategy for a conflict.
    
    Args:
        conflict: Conflict log document
        local_doc: Local document causing conflict
        remote_doc: Remote conflicting document (if exists)
    
    Returns:
        Dictionary with suggested strategy and reasoning
    """
    field = conflict.get("field")
    collection = conflict.get("collection")
    
    suggestions = {
        "strategy": "manual",
        "reason": "Requires manual review",
        "auto_resolvable": False,
        "suggested_value": None
    }
    
    # Strategy 1: If local document is very recent, suggest rename
    if local_doc.get("created_at"):
        created_at = local_doc.get("created_at")
        if isinstance(created_at, datetime):
            age_minutes = (datetime.utcnow() - created_at).total_seconds() / 60
            
            if age_minutes < 60:  # Created in last hour
                new_value = auto_rename_field(conflict["localValue"])
                suggestions = {
                    "strategy": "rename_local",
                    "reason": f"Local document is recent (created {int(age_minutes)} min ago). Safe to rename.",
                    "auto_resolvable": True,
                    "suggested_value": new_value
                }
                return suggestions
    
    # Strategy 2: If remote document doesn't exist, keep local with rename
    if not remote_doc or not conflict.get("remoteId"):
        new_value = auto_rename_field(conflict["localValue"])
        suggestions = {
            "strategy": "rename_local",
            "reason": "No conflicting remote document found. Rename local to ensure uniqueness.",
            "auto_resolvable": True,
            "suggested_value": new_value
        }
        return suggestions
    
    # Strategy 3: Compare update timestamps if available
    if remote_doc:
        local_updated = local_doc.get("updated_at")
        remote_updated = remote_doc.get("updated_at")
        
        if local_updated and remote_updated:
            if isinstance(local_updated, datetime) and isinstance(remote_updated, datetime):
                if local_updated > remote_updated:
                    suggestions = {
                        "strategy": "rename_local",
                        "reason": "Local is newer but conflicts. Rename to preserve both versions.",
                        "auto_resolvable": True,
                        "suggested_value": auto_rename_field(conflict["localValue"])
                    }
                else:
                    suggestions = {
                        "strategy": "keep_remote",
                        "reason": "Remote is newer. Discard local changes.",
                        "auto_resolvable": True,
                        "suggested_value": None
                    }
                return suggestions
    
    # Default: Manual review needed
    return suggestions


async def auto_resolve_conflicts_batch(
    sync_manager,
    max_conflicts: int = 10,
    auto_rename: bool = True
) -> Dict[str, int]:
    """
    Automatically resolve a batch of conflicts using smart strategies.
    
    Args:
        sync_manager: SyncManager instance
        max_conflicts: Maximum number of conflicts to resolve in one batch
        auto_rename: Allow automatic renaming
    
    Returns:
        Statistics: resolved, failed, skipped counts
    """
    stats = {"resolved": 0, "failed": 0, "skipped": 0}
    
    try:
        # Get unresolved conflicts
        conflicts = await sync_manager.get_conflicts(resolved=False)
        conflicts = conflicts[:max_conflicts]
        
        for conflict in conflicts:
            try:
                collection_name = conflict["collection"]
                local_id = conflict["localId"]
                
                # Get local document
                local_collection = sync_manager.local_db.get_collection(collection_name)
                local_doc = await local_collection.find_one({"_id": local_id})
                
                if not local_doc:
                    logger.warning(f"Local document {local_id} not found. Skipping.")
                    stats["skipped"] += 1
                    continue
                
                # Get remote document if exists
                remote_doc = None
                if conflict.get("remoteId"):
                    remote_collection = sync_manager.remote_db.get_collection(collection_name)
                    remote_doc = await remote_collection.find_one({"_id": conflict["remoteId"]})
                
                # Get suggestion
                suggestion = suggest_conflict_resolution(conflict, local_doc, remote_doc)
                
                if not suggestion["auto_resolvable"]:
                    logger.info(f"Conflict {conflict['_id']} requires manual resolution")
                    stats["skipped"] += 1
                    continue
                
                # Apply resolution
                strategy = suggestion["strategy"]
                new_value = suggestion["suggested_value"]
                
                if strategy == "rename_local" and auto_rename:
                    success = await sync_manager.resolve_conflict(
                        conflict_id=str(conflict["_id"]),
                        strategy="rename_local",
                        new_value=new_value,
                        resolved_by="auto_resolver",
                        notes=suggestion["reason"]
                    )
                elif strategy == "keep_remote":
                    success = await sync_manager.resolve_conflict(
                        conflict_id=str(conflict["_id"]),
                        strategy="keep_remote",
                        resolved_by="auto_resolver",
                        notes=suggestion["reason"]
                    )
                else:
                    stats["skipped"] += 1
                    continue
                
                if success:
                    stats["resolved"] += 1
                    logger.info(f"✓ Auto-resolved conflict {conflict['_id']} using {strategy}")
                else:
                    stats["failed"] += 1
                    
            except Exception as e:
                logger.error(f"Error auto-resolving conflict: {e}")
                stats["failed"] += 1
        
        logger.info(f"Auto-resolve batch complete: {stats}")
        return stats
        
    except Exception as e:
        logger.error(f"Failed to auto-resolve conflicts: {e}")
        return stats


def validate_unique_value(value: str, field_name: str) -> bool:
    """
    Validate that a proposed unique field value meets requirements.
    
    Args:
        value: Proposed value
        field_name: Name of the field (e.g., "username")
    
    Returns:
        True if valid, False otherwise
    """
    if not value or not isinstance(value, str):
        return False
    
    # Field-specific validation
    if field_name == "username":
        # Username requirements: 3-30 chars, alphanumeric + underscore
        if len(value) < 3 or len(value) > 30:
            return False
        if not all(c.isalnum() or c == "_" for c in value):
            return False
    
    return True


async def merge_documents(
    local_doc: Dict,
    remote_doc: Dict,
    conflict_field: str,
    merge_strategy: str = "newest_wins"
) -> Dict:
    """
    Merge two conflicting documents based on strategy.
    
    Strategies:
    - newest_wins: Use most recent updatedAt for each field
    - local_wins: Prefer local values
    - remote_wins: Prefer remote values
    
    Args:
        local_doc: Local document
        remote_doc: Remote document
        conflict_field: Field that has conflict
        merge_strategy: Merge strategy to use
    
    Returns:
        Merged document
    """
    merged = {}
    
    if merge_strategy == "newest_wins":
        # Compare timestamps for each field if available
        local_updated = local_doc.get("updated_at")
        remote_updated = remote_doc.get("updated_at")
        
        if local_updated and remote_updated:
            if isinstance(local_updated, datetime) and isinstance(remote_updated, datetime):
                base_doc = local_doc if local_updated > remote_updated else remote_doc
                merged = {**base_doc}
        else:
            # No timestamps, default to local
            merged = {**local_doc}
    
    elif merge_strategy == "local_wins":
        merged = {**remote_doc, **local_doc}
    
    elif merge_strategy == "remote_wins":
        merged = {**local_doc, **remote_doc}
    
    else:
        # Default: local wins
        merged = {**local_doc}
    
    # Ensure merged document has proper sync fields
    merged["updated_at"] = datetime.utcnow()
    merged["synced_at"] = None  # Will be set after successful sync
    
    return merged


def format_conflict_summary(conflicts: List[Dict]) -> str:
    """
    Format a list of conflicts into a human-readable summary.
    
    Args:
        conflicts: List of conflict log documents
    
    Returns:
        Formatted string summary
    """
    if not conflicts:
        return "No conflicts found."
    
    summary = f"=== Sync Conflicts Summary ({len(conflicts)} total) ===\n\n"
    
    # Group by collection
    by_collection = {}
    for conflict in conflicts:
        coll = conflict.get("collection", "unknown")
        if coll not in by_collection:
            by_collection[coll] = []
        by_collection[coll].append(conflict)
    
    for collection, coll_conflicts in by_collection.items():
        summary += f"Collection: {collection} ({len(coll_conflicts)} conflicts)\n"
        
        for i, conflict in enumerate(coll_conflicts[:5], 1):  # Show first 5
            field = conflict.get("field", "unknown")
            local_val = conflict.get("localValue", "")
            resolved = "✓ Resolved" if conflict.get("resolved") else "⚠ Unresolved"
            
            summary += f"  {i}. {field} = '{local_val}' [{resolved}]\n"
        
        if len(coll_conflicts) > 5:
            summary += f"  ... and {len(coll_conflicts) - 5} more\n"
        
        summary += "\n"
    
    return summary


def get_conflict_resolution_recommendations(conflict: Dict) -> List[str]:
    """
    Get list of recommended actions for resolving a specific conflict.
    
    Args:
        conflict: Conflict log document
    
    Returns:
        List of recommendation strings
    """
    recommendations = []
    
    field = conflict.get("field")
    collection = conflict.get("collection")
    local_value = conflict.get("localValue")
    
    # Recommendation 1: Rename locally
    new_name = auto_rename_field(local_value)
    recommendations.append(
        f"Rename local '{field}' to '{new_name}' to avoid conflict"
    )
    
    # Recommendation 2: Keep remote
    recommendations.append(
        f"Discard local changes and use remote value"
    )
    
    # Recommendation 3: Manual edit
    recommendations.append(
        f"Manually edit local document to use a different {field}"
    )
    
    # Collection-specific recommendations
    if collection == "admins" and field == "username":
        recommendations.append(
            f"Contact the user to choose a new username"
        )
    
    return recommendations
