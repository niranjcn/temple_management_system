"""
Network Connectivity Monitor
Detects when internet connection is restored and triggers automatic sync.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional, Callable
from motor.motor_asyncio import AsyncIOMotorClient

from ..database import get_remote_database, is_sync_enabled

logger = logging.getLogger(__name__)


class NetworkMonitor:
    """
    Monitors network connectivity and triggers callbacks when connection is restored.
    
    Uses MongoDB ping to remote server as connectivity check.
    Default check interval: 5 minutes (300 seconds)
    """
    
    def __init__(
        self,
        check_interval_seconds: int = 300,  # 5 minutes
        on_reconnect_callback: Optional[Callable] = None
    ):
        """
        Initialize network monitor.
        
        Args:
            check_interval_seconds: How often to check connectivity (default: 300s = 5 minutes)
            on_reconnect_callback: Async function to call when connection restored
        """
        self.check_interval = check_interval_seconds
        self.on_reconnect_callback = on_reconnect_callback
        self.is_running = False
        self.was_online = False
        self.last_check_time: Optional[datetime] = None
        self.monitor_task: Optional[asyncio.Task] = None
    
    async def check_connectivity(self) -> bool:
        """
        Check if remote database is reachable.
        
        Returns:
            True if connected, False otherwise
        """
        try:
            if not is_sync_enabled():
                return False
            
            remote_db = get_remote_database()
            if remote_db is None:
                return False
            
            # Ping the remote database
            await remote_db.command("ping")
            return True
            
        except Exception as e:
            logger.debug(f"Connectivity check failed: {e}")
            return False
    
    async def start_monitoring(self):
        """Start the connectivity monitoring loop"""
        if self.is_running:
            logger.warning("Network monitor already running")
            return
        
        self.is_running = True
        
        # Check initial connectivity state to avoid false "reconnect" trigger
        # This is especially important during startup
        try:
            initial_state = await self.check_connectivity()
            self.was_online = initial_state
            logger.info(f"✓ Initial connectivity state: {'online' if initial_state else 'offline'}")
        except Exception as e:
            logger.warning(f"Could not determine initial connectivity state: {e}")
            self.was_online = False
        
        self.monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info(f"✓ Network monitor started (check interval: {self.check_interval}s)")
    
    async def stop_monitoring(self):
        """Stop the connectivity monitoring loop"""
        self.is_running = False
        
        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass
        
        logger.info("✓ Network monitor stopped")
    
    async def _monitor_loop(self):
        """Main monitoring loop"""
        # Add initial delay to avoid interfering with startup sync
        # This gives the application time to complete initial operations
        initial_delay = min(60, self.check_interval)  # Wait 1 minute or check_interval, whichever is smaller
        logger.debug(f"Network monitor delaying {initial_delay}s before first check")
        await asyncio.sleep(initial_delay)
        
        while self.is_running:
            try:
                self.last_check_time = datetime.utcnow()
                is_online = await self.check_connectivity()
                
                # Detect transition from offline to online
                if is_online and not self.was_online:
                    logger.info("🌐 Internet connection restored!")
                    
                    # Trigger reconnect callback
                    if self.on_reconnect_callback:
                        try:
                            await self.on_reconnect_callback()
                        except Exception as e:
                            logger.error(f"Error in reconnect callback: {e}")
                
                # Detect transition from online to offline
                elif not is_online and self.was_online:
                    logger.warning("⚠ Internet connection lost. Working in offline mode.")
                
                self.was_online = is_online
                
                # Wait before next check
                await asyncio.sleep(self.check_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in monitor loop: {e}")
                await asyncio.sleep(self.check_interval)
    
    def get_status(self) -> dict:
        """Get current monitor status"""
        return {
            "is_running": self.is_running,
            "is_online": self.was_online,
            "last_check": self.last_check_time,
            "check_interval_seconds": self.check_interval
        }


# Global monitor instance
_network_monitor: Optional[NetworkMonitor] = None


async def get_network_monitor() -> NetworkMonitor:
    """Get or create the global NetworkMonitor instance"""
    global _network_monitor
    
    if _network_monitor is None:
        # Import here to avoid circular dependency
        from .sync_manager_service import get_sync_manager
        
        async def on_reconnect():
            """Callback when internet reconnects - trigger automatic sync"""
            try:
                sync_manager = await get_sync_manager()
                
                # Check if auto-sync is enabled in configuration
                if sync_manager.config and sync_manager.config.autoSyncEnabled:
                    logger.info("🔄 Triggering automatic sync after reconnection...")
                    await sync_manager.sync_all_collections(trigger="reconnect")
                else:
                    logger.info("Auto-sync is disabled. Skipping automatic sync.")
                    
            except Exception as e:
                logger.error(f"Failed to trigger automatic sync on reconnect: {e}")
        
        _network_monitor = NetworkMonitor(
            check_interval_seconds=300,  # 5 minutes
            on_reconnect_callback=on_reconnect
        )
    
    return _network_monitor


async def start_network_monitoring():
    """Start the global network monitor"""
    monitor = await get_network_monitor()
    await monitor.start_monitoring()


async def stop_network_monitoring():
    """Stop the global network monitor"""
    if _network_monitor:
        await _network_monitor.stop_monitoring()
