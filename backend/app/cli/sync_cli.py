"""
CLI Utility for Database Synchronization
Provides command-line interface for sync operations, conflict resolution, and diagnostics.

Usage:
    python -m app.cli.sync_cli --help
    python -m app.cli.sync_cli sync
    python -m app.cli.sync_cli status
    python -m app.cli.sync_cli conflicts
    python -m app.cli.sync_cli resolve <conflict_id> --strategy rename_local --value new_username
"""

import asyncio
import argparse
import sys
from datetime import datetime
from typing import Optional

# Add parent directory to path to import app modules
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.services.sync_manager_service import get_sync_manager
from app.services.network_monitor_service import get_network_monitor
from app.services.conflict_resolution_service import (
    format_conflict_summary,
    auto_resolve_conflicts_batch,
    get_conflict_resolution_recommendations
)
from app.database import is_remote_available


class SyncCLI:
    """Command-line interface for sync management"""
    
    def __init__(self):
        self.sync_manager = None
    
    async def initialize(self):
        """Initialize sync manager"""
        try:
            self.sync_manager = await get_sync_manager()
            print("✓ Sync manager initialized")
        except Exception as e:
            print(f"❌ Failed to initialize sync manager: {e}")
            sys.exit(1)
    
    async def cmd_status(self):
        """Show sync status and statistics"""
        print("\n=== Synchronization Status ===\n")
        
        # Check remote availability
        if not is_remote_available():
            print("❌ Remote database: NOT CONFIGURED")
            print("   Set MONGODB_CLOUD_URL in .env to enable sync\n")
            return
        
        print("✓ Remote database: CONFIGURED")
        
        # Get sync stats
        stats = await self.sync_manager.get_sync_stats()
        
        print(f"\nConnection Status: {'🟢 ONLINE' if stats.isOnline else '🔴 OFFLINE'}")
        print(f"Sync Status: {'🔄 SYNCING...' if stats.isSyncing else '✓ Ready'}")
        
        if stats.lastSyncTime:
            time_ago = datetime.utcnow() - stats.lastSyncTime
            minutes_ago = int(time_ago.total_seconds() / 60)
            print(f"\nLast Sync: {stats.lastSyncTime.strftime('%Y-%m-%d %H:%M:%S')} ({minutes_ago} min ago)")
            print(f"Status: {stats.lastSyncStatus}")
            if stats.lastSyncDuration:
                print(f"Duration: {stats.lastSyncDuration:.2f} seconds")
        else:
            print("\nLast Sync: Never")
        
        print(f"\nTotal Syncs: {stats.totalSyncsCompleted}")
        print(f"Total Conflicts: {stats.totalConflicts}")
        print(f"Unresolved Conflicts: {stats.unresolvedConflicts}")
        
        if stats.unresolvedConflicts > 0:
            print(f"\n⚠ WARNING: {stats.unresolvedConflicts} conflicts need resolution")
            print("   Run: python -m app.cli.sync_cli conflicts")
        
        print()
    
    async def cmd_sync(self, collections: Optional[list] = None):
        """Trigger manual sync"""
        print("\n🔄 Starting manual synchronization...\n")
        
        if not is_remote_available():
            print("❌ Cannot sync: Remote database not configured")
            return
        
        try:
            result = await self.sync_manager.sync_all_collections(
                trigger="manual",
                collections=collections
            )
            
            print(f"\n=== Sync Results ===")
            print(f"Status: {result.status.upper()}")
            print(f"Duration: {result.durationSeconds:.2f} seconds")
            
            print(f"\nPushed to remote:")
            for coll, count in result.localToRemote.items():
                print(f"  • {coll}: {count} documents")
            
            print(f"\nPulled from remote:")
            for coll, count in result.remoteToLocal.items():
                print(f"  • {coll}: {count} documents")
            
            print(f"\nConflicts detected:")
            for coll, count in result.conflicts.items():
                if count > 0:
                    print(f"  ⚠ {coll}: {count} conflicts")
            
            if result.errors:
                print(f"\n❌ Errors encountered:")
                for error in result.errors:
                    print(f"  • {error}")
            
            print()
            
        except Exception as e:
            print(f"❌ Sync failed: {e}\n")
    
    async def cmd_conflicts(self, show_resolved: bool = False):
        """List sync conflicts"""
        print("\n=== Sync Conflicts ===\n")
        
        resolved = None if show_resolved else False
        conflicts = await self.sync_manager.get_conflicts(resolved=resolved)
        
        if not conflicts:
            print("✓ No conflicts found\n")
            return
        
        print(format_conflict_summary(conflicts))
        
        # Show detailed info for unresolved conflicts
        unresolved = [c for c in conflicts if not c.get("resolved")]
        
        if unresolved:
            print("\n=== Unresolved Conflicts (Detailed) ===\n")
            
            for i, conflict in enumerate(unresolved[:10], 1):
                conflict_id = str(conflict["_id"])
                print(f"{i}. Conflict ID: {conflict_id}")
                print(f"   Collection: {conflict['collection']}")
                print(f"   Field: {conflict['field']}")
                print(f"   Local Value: {conflict['localValue']}")
                if conflict.get('remoteValue'):
                    print(f"   Remote Value: {conflict['remoteValue']}")
                print(f"   Time: {conflict['timestamp']}")
                print(f"   Notes: {conflict.get('notes', 'N/A')}")
                
                # Show recommendations
                recommendations = get_conflict_resolution_recommendations(conflict)
                print(f"\n   Recommendations:")
                for j, rec in enumerate(recommendations, 1):
                    print(f"     {j}. {rec}")
                
                print(f"\n   To resolve:")
                print(f"     python -m app.cli.sync_cli resolve {conflict_id} --strategy <strategy>")
                print()
            
            if len(unresolved) > 10:
                print(f"... and {len(unresolved) - 10} more conflicts\n")
    
    async def cmd_resolve(
        self,
        conflict_id: str,
        strategy: str,
        value: Optional[str] = None
    ):
        """Resolve a specific conflict"""
        print(f"\n🔧 Resolving conflict {conflict_id}...\n")
        
        valid_strategies = ["keep_local", "keep_remote", "merge", "rename_local"]
        if strategy not in valid_strategies:
            print(f"❌ Invalid strategy. Choose from: {', '.join(valid_strategies)}")
            return
        
        if strategy in ["rename_local", "merge"] and not value:
            print(f"❌ Strategy '{strategy}' requires --value parameter")
            return
        
        try:
            success = await self.sync_manager.resolve_conflict(
                conflict_id=conflict_id,
                strategy=strategy,
                new_value=value,
                resolved_by="cli_user",
                notes=f"Resolved via CLI using {strategy} strategy"
            )
            
            if success:
                print(f"✓ Conflict resolved successfully using '{strategy}' strategy")
                print(f"\nNext steps:")
                print(f"  1. Run: python -m app.cli.sync_cli sync")
                print(f"  2. This will sync the resolved document to remote\n")
            else:
                print(f"❌ Failed to resolve conflict. Check logs for details.\n")
        
        except Exception as e:
            print(f"❌ Error resolving conflict: {e}\n")
    
    async def cmd_auto_resolve(self, max_conflicts: int = 10):
        """Auto-resolve conflicts using smart strategies"""
        print(f"\n🤖 Auto-resolving up to {max_conflicts} conflicts...\n")
        
        stats = await auto_resolve_conflicts_batch(
            self.sync_manager,
            max_conflicts=max_conflicts,
            auto_rename=True
        )
        
        print(f"=== Auto-Resolution Results ===")
        print(f"✓ Resolved: {stats['resolved']}")
        print(f"⚠ Skipped (manual needed): {stats['skipped']}")
        print(f"❌ Failed: {stats['failed']}")
        
        if stats['resolved'] > 0:
            print(f"\n💡 Tip: Run sync to apply resolved changes to remote")
            print(f"     python -m app.cli.sync_cli sync\n")
        else:
            print(f"\n💡 No conflicts were auto-resolved. Try manual resolution:\n")
            print(f"     python -m app.cli.sync_cli conflicts\n")
    
    async def cmd_config(self):
        """Show sync configuration"""
        print("\n=== Sync Configuration ===\n")
        
        config = self.sync_manager.config
        
        print(f"Auto-sync on reconnect: {config.autoSyncEnabled}")
        print(f"Periodic sync interval: {config.syncIntervalMinutes or 'Disabled'} minutes")
        print(f"Default conflict resolution: {config.conflictResolutionStrategy}")
        print(f"Batch size: {config.batchSize}")
        print(f"Max retries: {config.maxRetries}")
        
        print(f"\nCollections to sync ({len(config.collectionsToSync)}):")
        for coll in config.collectionsToSync:
            print(f"  • {coll}")
        
        print()


async def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Database Synchronization CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Status command
    subparsers.add_parser("status", help="Show sync status and statistics")
    
    # Sync command
    sync_parser = subparsers.add_parser("sync", help="Trigger manual synchronization")
    sync_parser.add_argument(
        "--collections",
        nargs="+",
        help="Specific collections to sync (default: all)"
    )
    
    # Conflicts command
    conflicts_parser = subparsers.add_parser("conflicts", help="List sync conflicts")
    conflicts_parser.add_argument(
        "--all",
        action="store_true",
        help="Show resolved conflicts too"
    )
    
    # Resolve command
    resolve_parser = subparsers.add_parser("resolve", help="Resolve a specific conflict")
    resolve_parser.add_argument("conflict_id", help="Conflict ID to resolve")
    resolve_parser.add_argument(
        "--strategy",
        required=True,
        choices=["keep_local", "keep_remote", "merge", "rename_local"],
        help="Resolution strategy"
    )
    resolve_parser.add_argument(
        "--value",
        help="New value (required for rename_local and merge strategies)"
    )
    
    # Auto-resolve command
    auto_parser = subparsers.add_parser("auto-resolve", help="Auto-resolve conflicts")
    auto_parser.add_argument(
        "--max",
        type=int,
        default=10,
        help="Maximum conflicts to resolve (default: 10)"
    )
    
    # Config command
    subparsers.add_parser("config", help="Show sync configuration")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(0)
    
    # Initialize CLI
    cli = SyncCLI()
    await cli.initialize()
    
    # Execute command
    try:
        if args.command == "status":
            await cli.cmd_status()
        
        elif args.command == "sync":
            await cli.cmd_sync(collections=args.collections)
        
        elif args.command == "conflicts":
            await cli.cmd_conflicts(show_resolved=args.all)
        
        elif args.command == "resolve":
            await cli.cmd_resolve(
                conflict_id=args.conflict_id,
                strategy=args.strategy,
                value=args.value
            )
        
        elif args.command == "auto-resolve":
            await cli.cmd_auto_resolve(max_conflicts=args.max)
        
        elif args.command == "config":
            await cli.cmd_config()
        
        else:
            parser.print_help()
    
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
