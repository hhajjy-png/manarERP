// Google Drive Backup — Phase 1 (scaffold).
// Types for an OPTIONAL, secondary external backup destination. Local backups
// remain the primary source of truth; Drive is an additional copy only.

/** Drive folder that backups are placed in. Lives here (not in config.ts) so the
 *  pure upload orchestrator can import it without pulling in the Prisma-coupled
 *  settings layer — letting Electron reuse the orchestrator in Phase 2. */
export const GD_FOLDER_NAME = 'manarERP Backups';

export type GoogleDriveBackupType = 'manual' | 'auto';

/** Optional metadata JSON uploaded alongside a backup file. Never contains tokens. */
export interface BackupMeta {
  app: 'manarERP';
  backupType: GoogleDriveBackupType;
  fileName: string;
  dbSize?: number;
  createdAt: string;   // ISO
  checksum?: string;   // sha256 (optional)
}

export interface DriveUploadInput {
  filePath: string;
  fileName: string;
  folderName: string;
  meta: BackupMeta;
}

export interface DriveUploadResult {
  fileId: string;
  webViewLink?: string;
  folderId?: string;
}

/**
 * Pluggable Google Drive backend. Phase 1 ships only `NullDriveProvider`.
 * The real implementation (google-auth-library + Drive REST, OAuth token from
 * Electron `safeStorage`) lands in Phase 2 and implements this same interface.
 * A provider is the ONLY holder of credentials — orchestration never sees a token.
 */
export interface DriveProvider {
  readonly configured: boolean;
  isConnected(): Promise<boolean>;
  uploadBackup(input: DriveUploadInput): Promise<DriveUploadResult>;
  getFolderLink(folderId: string): string | null;
}

export type LastUploadStatus = '' | 'SUCCESS' | 'FAILED';

export interface GoogleDriveConfig {
  enabled: boolean;
  connected: boolean;
  folderId: string;
  lastUploadAt: string;
  lastUploadStatus: LastUploadStatus;
  uploadAfterManualBackup: boolean;
  uploadAfterAutoBackup: boolean;
}

export interface UploadOutcome {
  success: boolean;
  fileId?: string;
  webViewLink?: string;
  bytes?: number;
  checksum?: string;
  error?: string;
  uploadedAt: string;  // ISO
}
