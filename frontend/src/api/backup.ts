import api from './api';

export interface BackupTriggerRequest {
  delete_bookings: boolean;
}

export interface BackupResponse {
  success: boolean;
  backup_id: string;
  backup_path: string;
  backup_timestamp: string;
  sync_status: string;
  collections_backed_up: string[];
  collections_deleted_local: string[];
  collections_deleted_remote: string[];
  message: string;
  error?: string;
}

export interface BackupListItem {
  backup_id: string;
  backup_date: string;
  backup_timestamp: string;
  status: string;
  collections_count: number;
}

export interface CollectionListItem {
  collection_name: string;
  document_count: number;
  file_size: string;
}

export interface BackupCollectionData {
  collection_name: string;
  documents: any[];
  total_documents: number;
}

export interface BackupStatus {
  primary_database: string;
  backup_available: boolean;
  sync_enabled: boolean;
  message: string;
}

export interface ManualSyncResponse {
  success: boolean;
  status: string;
  trigger: string;
  duration_seconds: number;
  collections_synced: number;
  total_pushed: number;
  total_pulled: number;
  total_conflicts: number;
  errors: string[];
  details: {
    local_to_remote: Record<string, number>;
    remote_to_local: Record<string, number>;
    conflicts: Record<string, number>;
  };
  message: string;
}

/**
 * Trigger a backup operation
 */
export const triggerBackup = async (
  deleteBookings: boolean, 
  withCleanup: boolean = false
): Promise<BackupResponse> => {
  const response = await api.post<BackupResponse>(
    `/backup?with_cleanup=${withCleanup}`,
    {
      delete_bookings: deleteBookings
    }
  );
  return response.data;
};

/**
 * Get list of all available backups
 */
export const getBackups = async (): Promise<BackupListItem[]> => {
  const response = await api.get<BackupListItem[]>('/backups');
  return response.data;
};

/**
 * Get list of collections in a specific backup
 */
export const getBackupCollections = async (backupId: string): Promise<CollectionListItem[]> => {
  const response = await api.get<CollectionListItem[]>(`/backups/${backupId}/collections`);
  return response.data;
};

/**
 * Get documents from a specific collection in a backup
 */
export const getCollectionData = async (
  backupId: string,
  collectionName: string
): Promise<BackupCollectionData> => {
  const response = await api.get<BackupCollectionData>(
    `/backups/${backupId}/collections/${collectionName}`
  );
  return response.data;
};

/**
 * Get backup system status
 */
export const getBackupStatus = async (): Promise<BackupStatus> => {
  const response = await api.get<BackupStatus>('/backup/status');
  return response.data;
};

/**
 * Trigger manual on-demand database synchronization
 */
export const triggerManualSync = async (): Promise<ManualSyncResponse> => {
  const response = await api.post<ManualSyncResponse>('/backup/sync');
  return response.data;
};
