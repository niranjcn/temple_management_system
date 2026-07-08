import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  triggerBackup, 
  getBackups, 
  getBackupCollections, 
  getCollectionData,
  getBackupStatus,
  triggerManualSync,
  BackupListItem,
  CollectionListItem,
  BackupCollectionData 
} from '@/api/backup';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Database, 
  Download, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  FolderOpen,
  FileJson,
  ChevronRight,
  Search,
  RefreshCw
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

const BackupManagement = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [primaryDatabase, setPrimaryDatabase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Backup trigger states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [deleteBookingsInCleanup, setDeleteBookingsInCleanup] = useState(false);
  const [backupInProgress, setBackupInProgress] = useState(false);
  
  // Sync states
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  
  // View backups states
  const [backups, setBackups] = useState<BackupListItem[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionListItem[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [collectionData, setCollectionData] = useState<BackupCollectionData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set());

  // Check if user has permissions (role_id <= 1)
  const hasPermission = user?.role_id !== undefined && user.role_id <= 1;

  useEffect(() => {
    checkBackupStatus();
  }, []);

  const checkBackupStatus = async () => {
    try {
      const status = await getBackupStatus();
      setBackupAvailable(status.backup_available);
      setSyncEnabled(status.sync_enabled);
      setPrimaryDatabase(status.primary_database);
    } catch (err: any) {
      console.error('Failed to check backup status:', err);
      setError(err.response?.data?.detail || 'Failed to check backup status');
    }
  };

  const handleTriggerBackup = async (deleteBookings: boolean, withCleanup: boolean = false) => {
    setBackupInProgress(true);
    setError(null);
    setSuccess(null);
    setSyncSuccess(null);
    setShowDeleteDialog(false);
    setShowCleanupDialog(false);

    try {
      const result = await triggerBackup(deleteBookings, withCleanup);
      
      let successMessage = 
        `Backup completed successfully!\n` +
        `Backup ID: ${result.backup_id}\n` +
        `Collections backed up: ${result.collections_backed_up.length}\n` +
        `Deleted locally: ${result.collections_deleted_local.join(', ')}\n` +
        (result.collections_deleted_remote.length > 0 
          ? `Deleted remotely: ${result.collections_deleted_remote.join(', ')}\n`
          : '');
      
      if (withCleanup) {
        successMessage += `\n🧹 Security Cleanup Performed:\n` +
          `- Old tokens cleaned\n` +
          `- Remote security data merged\n` +
          `- Security collections purged from both databases`;
      }
      
      setSuccess(successMessage);
      
      // Refresh backups list
      await loadBackups();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Backup operation failed');
    } finally {
      setBackupInProgress(false);
    }
  };

  const handleManualSync = async () => {
    setSyncInProgress(true);
    setError(null);
    setSuccess(null);
    setSyncSuccess(null);

    try {
      const result = await triggerManualSync();
      
      if (result.success) {
        setSyncSuccess(
          `Sync completed in ${result.duration_seconds.toFixed(2)}s\n` +
          `Collections synced: ${result.collections_synced}\n` +
          `Pushed to remote: ${result.total_pushed} documents\n` +
          `Pulled from remote: ${result.total_pulled} documents\n` +
          (result.total_conflicts > 0 
            ? `⚠️ Conflicts resolved: ${result.total_conflicts}`
            : '✓ No conflicts')
        );
      } else {
        setError(`Sync ${result.status}: ${result.errors.join('; ')}`);
      }
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail || 'Manual sync failed';
      
      // Provide user-friendly messages for common errors
      if (errorDetail.includes('Remote database not configured')) {
        setError('Sync not available: Remote database not configured. Please set MONGODB_CLOUD_URL in your environment.');
      } else if (errorDetail.includes('already in progress')) {
        setError('Sync already in progress. Please wait for the current sync to complete.');
      } else if (errorDetail.includes('network') || errorDetail.includes('connection')) {
        setError('Sync failed: Unable to connect to remote database. Please check your internet connection.');
      } else {
        setError(`Sync failed: ${errorDetail}`);
      }
    } finally {
      setSyncInProgress(false);
    }
  };

  const loadBackups = async () => {
    setIsLoading(true);
    try {
      const backupList = await getBackups();
      setBackups(backupList);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load backups');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCollections = async (backupId: string) => {
    setIsLoading(true);
    setSelectedBackup(backupId);
    setSelectedCollection(null);
    setCollectionData(null);
    
    try {
      const collectionList = await getBackupCollections(backupId);
      setCollections(collectionList);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load collections');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCollectionData = async (backupId: string, collectionName: string) => {
    setIsLoading(true);
    setSelectedCollection(collectionName);
    
    try {
      const data = await getCollectionData(backupId, collectionName);
      setCollectionData(data);
      setExpandedDocs(new Set());
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load collection data');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDocExpansion = (index: number) => {
    const newExpanded = new Set(expandedDocs);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedDocs(newExpanded);
  };

  const filterDocuments = (documents: any[]) => {
    if (!searchQuery) return documents;
    
    return documents.filter(doc => 
      JSON.stringify(doc).toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  if (!hasPermission) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access Backup Management. This feature is only available to Super Admin and Admin roles.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!backupAvailable) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Backup Management is only available in LOCAL mode. Current mode: {primaryDatabase?.toUpperCase() || 'Unknown'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-800">Backup Management</h1>
        <p className="text-neutral-600 mt-2">
          Manage database backups, sync operations, and view backed-up data
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-neutral-600">Primary Database</p>
              <Badge variant="outline" className="mt-1">
                {primaryDatabase?.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-neutral-600">Backup Available</p>
              <Badge variant={backupAvailable ? "default" : "secondary"} className="mt-1">
                {backupAvailable ? 'YES' : 'NO'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-neutral-600">Sync Enabled</p>
              <Badge variant={syncEnabled ? "default" : "secondary"} className="mt-1">
                {syncEnabled ? 'YES' : 'NO'}
              </Badge>
            </div>
          </div>

          {/* Manual Sync Button */}
          {syncEnabled && (
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-neutral-800">Manual Database Sync</h4>
                  <p className="text-sm text-neutral-600 mt-1">
                    Sync local and remote databases on-demand
                  </p>
                </div>
                <Button
                  onClick={handleManualSync}
                  disabled={syncInProgress}
                  variant="outline"
                  className="min-w-[140px]"
                >
                  {syncInProgress ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {syncSuccess && (
        <Alert className="border-blue-500 bg-blue-50">
          <CheckCircle2 className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 whitespace-pre-line">
            {syncSuccess}
          </AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 whitespace-pre-line">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Trigger Backup Section */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger Backup</CardTitle>
          <CardDescription>
            Create a new backup of the local database. This will sync with remote, backup all collections, 
            and optionally delete specified collections after backup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <h4 className="font-medium text-amber-900 mb-2">Backup Workflow:</h4>
            <ol className="text-sm text-amber-800 space-y-1 list-decimal list-inside">
              <li>Sync local database with remote Atlas</li>
              <li>Create backup in /backend/backups/YYYYMMDD_HHMMSS/</li>
              <li>Automatically delete <code>activities</code> collection</li>
              <li>Optionally delete <code>bookings</code> and <code>employee_bookings</code> (user confirmed)</li>
            </ol>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h4 className="font-medium text-blue-900 mb-2">🧹 Cleanup Option:</h4>
            <p className="text-sm text-blue-800 mb-2">
              Security cleanup will also:
            </p>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Remove old revoked tokens (older than 2 days)</li>
              <li>Fetch and merge remote security collections (login_attempts, user_sessions, etc.)</li>
              <li>Backup merged security data</li>
              <li>Purge security collections from both local and remote databases</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-sm font-medium mb-2">Standard Backup</p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => handleTriggerBackup(false, false)}
                  disabled={backupInProgress}
                  className="bg-orange-500 hover:bg-orange-600 w-full"
                >
                  {backupInProgress ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Backup in Progress...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Keep Bookings
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={backupInProgress}
                  variant="destructive"
                  className="w-full"
                >
                  {backupInProgress ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Backup in Progress...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Delete Bookings
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">With Security Cleanup 🧹</p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    setDeleteBookingsInCleanup(false);
                    setShowCleanupDialog(true);
                  }}
                  disabled={backupInProgress}
                  className="bg-blue-600 hover:bg-blue-700 w-full"
                >
                  {backupInProgress ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Backup in Progress...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Keep Bookings + Cleanup
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => {
                    setDeleteBookingsInCleanup(true);
                    setShowCleanupDialog(true);
                  }}
                  disabled={backupInProgress}
                  variant="destructive"
                  className="bg-red-700 hover:bg-red-800 w-full"
                >
                  {backupInProgress ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Backup in Progress...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Delete Bookings + Cleanup
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Backed-Up Data Section */}
      <Card>
        <CardHeader>
          <CardTitle>View Backed-Up Data</CardTitle>
          <CardDescription>
            Browse and view documents from previous backups
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button 
              onClick={loadBackups}
              disabled={isLoading}
              variant="outline"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="mr-2 h-4 w-4" />
              )}
              Load Backups
            </Button>
          </div>

          {backups.length > 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Select Backup</label>
                <Select onValueChange={loadCollections} value={selectedBackup || undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a backup..." />
                  </SelectTrigger>
                  <SelectContent>
                    {backups.map((backup) => (
                      <SelectItem key={backup.backup_id} value={backup.backup_id}>
                        {backup.backup_date} {backup.backup_timestamp.split('T')[1]?.substring(0, 8)} 
                        ({backup.collections_count} collections)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {collections.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Select Collection</label>
                  <Select 
                    onValueChange={(value) => loadCollectionData(selectedBackup!, value)}
                    value={selectedCollection || undefined}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a collection..." />
                    </SelectTrigger>
                    <SelectContent>
                      {collections.map((collection) => (
                        <SelectItem key={collection.collection_name} value={collection.collection_name}>
                          <div className="flex items-center gap-2">
                            <FileJson className="h-4 w-4" />
                            {collection.collection_name} ({collection.document_count} docs, {collection.file_size})
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {collectionData && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">
                      {collectionData.collection_name} ({collectionData.total_documents} documents)
                    </h3>
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-neutral-500" />
                      <Input
                        placeholder="Search documents..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-64"
                      />
                    </div>
                  </div>

                  <ScrollArea className="h-[600px] border rounded-md p-4">
                    <div className="space-y-2">
                      {filterDocuments(collectionData.documents).map((doc, index) => (
                        <div 
                          key={index} 
                          className="border rounded-md p-3 bg-white hover:bg-neutral-50 cursor-pointer"
                          onClick={() => toggleDocExpansion(index)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1">
                              <ChevronRight 
                                className={`h-4 w-4 transition-transform ${expandedDocs.has(index) ? 'rotate-90' : ''}`}
                              />
                              <span className="font-mono text-sm text-neutral-600">
                                {doc._id?.$oid || doc._id || `Document ${index + 1}`}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {Object.keys(doc).length} fields
                            </Badge>
                          </div>
                          
                          {expandedDocs.has(index) && (
                            <pre className="mt-3 p-3 bg-neutral-50 rounded text-xs overflow-x-auto">
                              {JSON.stringify(doc, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                      
                      {filterDocuments(collectionData.documents).length === 0 && (
                        <div className="text-center text-neutral-500 py-8">
                          No documents match your search
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Standard Delete */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Backup with Deletion</DialogTitle>
            <DialogDescription className="space-y-2">
              <p>This will perform the following actions:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Sync local database with remote</li>
                <li>Create a complete backup</li>
                <li>Delete <strong>activities</strong> collection (automatic)</li>
                <li>Delete <strong>bookings</strong> and <strong>employee_bookings</strong> collections (both locally and remotely)</li>
              </ol>
              <p className="font-medium text-red-600 mt-3">
                This action cannot be undone. Are you sure you want to proceed?
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => handleTriggerBackup(true, false)}
            >
              Yes, Backup and Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Cleanup */}
      <Dialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Backup with Security Cleanup</DialogTitle>
            <DialogDescription className="space-y-3">
              <p>This will perform the following actions:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li><strong>Security Cleanup:</strong></li>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>Remove old revoked tokens (older than 2 days)</li>
                  <li>Fetch and merge remote security collections</li>
                  <li>Prepare security data for backup</li>
                </ul>
                <li>Sync local database with remote</li>
                <li>Create a complete backup (including merged security data)</li>
                <li>Delete <strong>activities</strong> collection (automatic)</li>
                {deleteBookingsInCleanup && (
                  <li>Delete <strong>bookings</strong> and <strong>employee_bookings</strong> collections</li>
                )}
                <li><strong>Purge security collections:</strong></li>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>login_attempts</li>
                  <li>token_revocation</li>
                  <li>user_sessions</li>
                  <li>device_fingerprints</li>
                  <li>security_events</li>
                </ul>
                <li className="font-medium">Delete from <strong>both local and remote</strong> databases</li>
              </ol>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mt-3">
                <p className="text-sm text-blue-900 font-medium">
                  ℹ️ This will free up space and isolate local/server sessions while preserving all data in the backup.
                </p>
              </div>
              <p className="font-medium text-red-600 mt-3">
                This action cannot be undone. Are you sure you want to proceed?
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCleanupDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => handleTriggerBackup(deleteBookingsInCleanup, true)}
              className="bg-blue-700 hover:bg-blue-800"
            >
              Yes, Backup with Cleanup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BackupManagement;
