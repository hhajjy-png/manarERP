// Google Drive Backup — settings-backed config. Uses the existing generic
// `Setting` (key/value/group) store — NO Prisma migration required. Tokens are
// NEVER stored here (they live in Electron safeStorage); only non-secret flags
// + last-upload metadata.

import { prisma } from '../../config/database';
import { settingsService } from '../settings/settings.service';
import type { GoogleDriveConfig, LastUploadStatus } from './googleDriveBackup.types';

export const GD_GROUP = 'backup';

export const GD_KEYS = {
  enabled:                 'googleDriveBackup.enabled',
  connected:               'googleDriveBackup.connected',
  folderId:                'googleDriveBackup.folderId',
  lastUploadAt:            'googleDriveBackup.lastUploadAt',
  lastUploadStatus:        'googleDriveBackup.lastUploadStatus',
  uploadAfterManualBackup: 'googleDriveBackup.uploadAfterManualBackup',
  uploadAfterAutoBackup:   'googleDriveBackup.uploadAfterAutoBackup',
} as const;

export const GD_DEFAULTS: GoogleDriveConfig = {
  enabled: false,
  connected: false,
  folderId: '',
  lastUploadAt: '',
  lastUploadStatus: '',
  uploadAfterManualBackup: false,
  uploadAfterAutoBackup: false,
};

const asBool = (v: string | undefined, d: boolean): boolean => (v == null ? d : v === 'true');
const asStatus = (v: string | undefined): LastUploadStatus => (v === 'SUCCESS' || v === 'FAILED' ? v : '');

/** Build a typed config from a raw key→value map, filling defaults. Pure. */
export function parseConfig(map: Record<string, string | undefined>): GoogleDriveConfig {
  return {
    enabled:                 asBool(map[GD_KEYS.enabled], GD_DEFAULTS.enabled),
    connected:               asBool(map[GD_KEYS.connected], GD_DEFAULTS.connected),
    folderId:                map[GD_KEYS.folderId] ?? GD_DEFAULTS.folderId,
    lastUploadAt:            map[GD_KEYS.lastUploadAt] ?? GD_DEFAULTS.lastUploadAt,
    lastUploadStatus:        asStatus(map[GD_KEYS.lastUploadStatus]),
    uploadAfterManualBackup: asBool(map[GD_KEYS.uploadAfterManualBackup], GD_DEFAULTS.uploadAfterManualBackup),
    uploadAfterAutoBackup:   asBool(map[GD_KEYS.uploadAfterAutoBackup], GD_DEFAULTS.uploadAfterAutoBackup),
  };
}

/** Read the current Drive config from the settings store (single indexed query). */
export async function readConfig(): Promise<GoogleDriveConfig> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(GD_KEYS) } } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return parseConfig(map);
}

/** Persist a partial config change. Only the provided keys are written. */
export async function writeConfig(
  patch: Partial<Record<keyof typeof GD_KEYS, string>>,
  req: import('express').Request,
): Promise<void> {
  const updates = (Object.keys(patch) as (keyof typeof GD_KEYS)[]).map((k) => ({
    key: GD_KEYS[k],
    value: patch[k] as string,
    group: GD_GROUP,
  }));
  if (updates.length > 0) await settingsService.updateMany(updates, req);
}
