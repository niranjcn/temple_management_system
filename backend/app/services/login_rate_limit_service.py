import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple

from ..database import login_attempts_collection, get_security_origin

logger = logging.getLogger("login_rate_limit")


class LoginRateLimitService:
    """Rate limiting for credential-based login attempts."""

    MAX_REQUESTS_PER_HOUR = 10
    WINDOW_MINUTES = 60

    async def register_attempt(self, ip_address: str, device_identifier: str) -> Tuple[bool, Optional[str], Optional[datetime]]:
        """Record a login attempt and determine whether it is allowed.

        Returns a tuple of (allowed, error_message, blocked_until).
        """
        now = datetime.utcnow()
        normalized_ip = ip_address or "unknown"
        normalized_device = (device_identifier or "unknown").strip() or "unknown"
        key = {"ip_address": normalized_ip, "device_identifier": normalized_device}

        window_delta = timedelta(minutes=self.WINDOW_MINUTES)
        window_cutoff = now - window_delta

        record = await login_attempts_collection.find_one(key)

        if not record or record.get("window_start") is None or record["window_start"] < window_cutoff:
            # Start a new window for this client pair
            new_record = {
                "ip_address": normalized_ip,
                "device_identifier": normalized_device,
                "window_start": now,
                "last_attempt_at": now,
                "request_count": 1,
                "blocked_until": None,
                "origin": get_security_origin(),  # Track which system created this
            }
            await login_attempts_collection.update_one(key, {"$set": new_record}, upsert=True)
            return True, None, None

        # Existing record within the current window
        blocked_until = record.get("blocked_until")
        if blocked_until and blocked_until > now:
            message = "Too many login attempts. Please try again later."
            logger.warning(
                "Login rate limit enforced for IP %s device %s until %s",
                normalized_ip,
                normalized_device,
                blocked_until.isoformat(),
            )
            return False, message, blocked_until

        attempt_count = int(record.get("request_count", 0))
        if attempt_count >= self.MAX_REQUESTS_PER_HOUR:
            blocked_until = record.get("window_start", now) + window_delta
            await login_attempts_collection.update_one(
                key,
                {
                    "$set": {
                        "blocked_until": blocked_until,
                        "last_attempt_at": now,
                    }
                },
            )
            message = "Too many login attempts. Please try again later."
            logger.warning(
                "Login rate limit reached for IP %s device %s; blocking until %s",
                normalized_ip,
                normalized_device,
                blocked_until.isoformat(),
            )
            return False, message, blocked_until

        # Increment attempt counter within same window
        await login_attempts_collection.update_one(
            key,
            {
                "$set": {
                    "last_attempt_at": now,
                    "blocked_until": None,
                },
                "$inc": {"request_count": 1},
            },
        )
        return True, None, None

    async def clear_attempts(self, ip_address: str, device_identifier: str) -> None:
        """Reset attempt counter for an IP/device combination (optional administrative helper)."""
        normalized_ip = ip_address or "unknown"
        normalized_device = (device_identifier or "unknown").strip() or "unknown"
        await login_attempts_collection.delete_one({
            "ip_address": normalized_ip,
            "device_identifier": normalized_device,
        })

    async def cleanup_old_records(self, max_age_hours: int = 48) -> int:
        """Remove stale login attempt documents to keep the collection lean."""
        cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
        result = await login_attempts_collection.delete_many({"last_attempt_at": {"$lt": cutoff}})
        return getattr(result, "deleted_count", 0)


login_rate_limit_service = LoginRateLimitService()
