import { describe, it, expect, vi } from 'vitest';
import { parseConfig, GD_DEFAULTS, GD_KEYS } from '../googleDriveBackup.config';
import {
  NullDriveProvider, uploadBackupFile, buildBackupMeta,
} from '../googleDriveBackup.service';
import type { DriveProvider, DriveUploadInput, DriveUploadResult, BackupMeta } from '../googleDriveBackup.types';

// ── A mock provider so we never touch the network or real Google client ──────────
class MockDriveProvider implements DriveProvider {
  readonly configured = true;
  public lastInput: DriveUploadInput | null = null;
  constructor(private behavior: 'ok' | 'throw', private connected = true) {}
  async isConnected(): Promise<boolean> { return this.connected; }
  async uploadBackup(input: DriveUploadInput): Promise<DriveUploadResult> {
    this.lastInput = input;
    if (this.behavior === 'throw') throw new Error('network unreachable');
    return { fileId: 'FILE-123', webViewLink: 'https://drive.google.com/file/d/FILE-123', folderId: 'FOLDER-1' };
  }
  getFolderLink(id: string): string { return `https://drive.google.com/drive/folders/${id}`; }
}

const okDeps = { fileExists: () => true, fileSize: () => 4096, now: () => new Date('2026-07-04T10:00:00.000Z') };
const META: BackupMeta = buildBackupMeta('manar-backup-2026-07-04.db', 'manual', { createdAt: '2026-07-04T09:59:00.000Z' });

// ── Config defaults ──────────────────────────────────────────────────────────
describe('googleDriveBackup config', () => {
  it('parses an empty settings map to safe disabled defaults', () => {
    expect(parseConfig({})).toEqual(GD_DEFAULTS);
  });

  it('coerces "true"/"false" strings and clamps lastUploadStatus', () => {
    const cfg = parseConfig({
      [GD_KEYS.enabled]: 'true',
      [GD_KEYS.uploadAfterAutoBackup]: 'true',
      [GD_KEYS.lastUploadStatus]: 'GARBAGE',
      [GD_KEYS.folderId]: 'F1',
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.uploadAfterAutoBackup).toBe(true);
    expect(cfg.uploadAfterManualBackup).toBe(false);
    expect(cfg.lastUploadStatus).toBe(''); // invalid value ignored
    expect(cfg.folderId).toBe('F1');
  });

  it('defaults to disabled + disconnected (offline-first, opt-in)', () => {
    expect(GD_DEFAULTS.enabled).toBe(false);
    expect(GD_DEFAULTS.connected).toBe(false);
  });
});

// ── Upload orchestration ─────────────────────────────────────────────────────
describe('uploadBackupFile', () => {
  it('uploads an existing non-empty file via the provider (success)', async () => {
    const provider = new MockDriveProvider('ok');
    const outcome = await uploadBackupFile(provider, '/tmp/manar-backup.db', META, {
      ...okDeps, computeChecksum: () => 'abc123',
    });
    expect(outcome.success).toBe(true);
    expect(outcome.fileId).toBe('FILE-123');
    expect(outcome.bytes).toBe(4096);
    expect(outcome.checksum).toBe('abc123');
    // provider received the file + metadata, folder name defaulted
    expect(provider.lastInput?.folderName).toBe('manarERP Backups');
    expect(provider.lastInput?.meta.app).toBe('manarERP');
  });

  it('returns failure (never throws) when the provider fails — local backup unaffected', async () => {
    const provider = new MockDriveProvider('throw');
    const outcome = await uploadBackupFile(provider, '/tmp/manar-backup.db', META, okDeps);
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain('network unreachable');
  });

  it('fails safely on a missing file', async () => {
    const provider = new MockDriveProvider('ok');
    const outcome = await uploadBackupFile(provider, '/tmp/none.db', META, { ...okDeps, fileExists: () => false });
    expect(outcome.success).toBe(false);
    expect(provider.lastInput).toBeNull(); // never handed to the provider
  });

  it('fails safely on an empty (0-byte) file', async () => {
    const provider = new MockDriveProvider('ok');
    const outcome = await uploadBackupFile(provider, '/tmp/empty.db', META, { ...okDeps, fileSize: () => 0 });
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain('فارغ');
  });

  it('the NullDriveProvider reports not-connected and refuses upload', async () => {
    const provider = new NullDriveProvider();
    expect(provider.configured).toBe(false);
    expect(await provider.isConnected()).toBe(false);
    const outcome = await uploadBackupFile(provider, '/tmp/manar-backup.db', META, okDeps);
    expect(outcome.success).toBe(false); // did not throw
  });

  it('never leaks a token in its outcome (only file + drive metadata)', async () => {
    const provider = new MockDriveProvider('ok');
    const outcome = await uploadBackupFile(provider, '/tmp/manar-backup.db', META, okDeps);
    const serialized = JSON.stringify(outcome).toLowerCase();
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('refresh');
    expect(serialized).not.toContain('secret');
  });
});

// ── Local backup is independent of the Drive layer ───────────────────────────
describe('offline-first guarantee', () => {
  it('uploadBackupFile has no side effects on failure and resolves (does not reject)', async () => {
    const provider = new MockDriveProvider('throw');
    const spy = vi.fn();
    await uploadBackupFile(provider, '/tmp/x.db', META, okDeps).then(spy);
    expect(spy).toHaveBeenCalledOnce(); // resolved, not rejected
  });
});
