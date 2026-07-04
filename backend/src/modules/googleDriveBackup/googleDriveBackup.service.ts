// Google Drive Backup — orchestration + default provider.
//
// SAFETY CONTRACT:
//  • Uploads an ALREADY-CREATED backup FILE — never the live DB.
//  • Verifies the file exists and size > 0 before handing it to a provider.
//  • NEVER throws: a cloud failure returns an outcome, so local backup is never
//    blocked or altered by Drive errors.
//  • Holds no credentials and logs no tokens (the provider owns all auth).

import fs from 'fs';
import {
  GD_FOLDER_NAME,
  type DriveProvider, type DriveUploadResult, type BackupMeta, type UploadOutcome, type GoogleDriveBackupType,
} from './googleDriveBackup.types';

/**
 * Phase-1 default provider: reports not-connected and refuses uploads with a
 * clear message. Replaced by the real OAuth-backed provider in Phase 2.
 */
export class NullDriveProvider implements DriveProvider {
  readonly configured = false;
  async isConnected(): Promise<boolean> { return false; }
  async uploadBackup(): Promise<DriveUploadResult> {
    throw new Error('Google Drive غير متصل — لم يُكمَل إعداد اعتماد OAuth بعد');
  }
  getFolderLink(): string | null { return null; }
}

/** The provider used by the running backend. Phase 2 swaps this for the real one. */
export const activeDriveProvider: DriveProvider = new NullDriveProvider();

export function buildBackupMeta(
  fileName: string,
  backupType: GoogleDriveBackupType,
  opts: { dbSize?: number; checksum?: string; createdAt?: string } = {},
): BackupMeta {
  return {
    app: 'manarERP',
    backupType,
    fileName,
    dbSize: opts.dbSize,
    checksum: opts.checksum,
    createdAt: opts.createdAt ?? new Date().toISOString(),
  };
}

export interface UploadDeps {
  computeChecksum?: (filePath: string) => string;
  now?: () => Date;
  fileExists?: (p: string) => boolean;
  fileSize?: (p: string) => number;
}

/**
 * Upload a verified backup file to Drive via the given provider. Never throws —
 * returns an outcome describing success or failure. The caller persists
 * `lastUpload*` from the outcome; it does not touch local backup state.
 */
export async function uploadBackupFile(
  provider: DriveProvider,
  filePath: string,
  meta: BackupMeta,
  deps: UploadDeps = {},
): Promise<UploadOutcome> {
  const now = deps.now ?? (() => new Date());
  const exists = deps.fileExists ?? ((p) => fs.existsSync(p));
  const sizeOf = deps.fileSize ?? ((p) => fs.statSync(p).size);
  const uploadedAt = now().toISOString();

  try {
    if (!exists(filePath)) {
      return { success: false, error: 'ملف النسخة الاحتياطية غير موجود', uploadedAt };
    }
    const bytes = sizeOf(filePath);
    if (!bytes || bytes <= 0) {
      return { success: false, error: 'ملف النسخة الاحتياطية فارغ (٠ بايت)', uploadedAt };
    }

    const checksum = deps.computeChecksum?.(filePath);
    const res = await provider.uploadBackup({
      filePath,
      fileName: meta.fileName,
      folderName: GD_FOLDER_NAME,
      meta: { ...meta, dbSize: bytes, checksum },
    });

    return {
      success: true,
      fileId: res.fileId,
      webViewLink: res.webViewLink,
      bytes,
      checksum,
      uploadedAt,
    };
  } catch (err) {
    // Swallow — cloud failure must not affect local backup. Message only (no token).
    return {
      success: false,
      error: err instanceof Error ? err.message : 'فشل رفع النسخة إلى Google Drive',
      uploadedAt,
    };
  }
}
