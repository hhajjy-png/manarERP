import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cleanupOrphanSyncTemps, isSyncTempName, ORPHAN_MAX_AGE_MS } from '../syncTempCleanup';

/**
 * انحدار: Orphan Sync Temp Cleanup (R2).
 *
 * الخطر الحقيقي ليس بقاء الملفات — بل أن يحذف الكنس شيئًا محميًا. لذلك أغلب
 * الحالات هنا تُثبت **ما لا يُحذف**.
 */

let dataDir: string;
const NOW = Date.UTC(2026, 6, 30, 12, 0, 0);
const OLD = NOW - ORPHAN_MAX_AGE_MS - 60_000;   // أقدم من العتبة
const FRESH = NOW - 60_000;                      // أحدث بكثير — قد يكون نشطًا

function write(name: string, mtimeMs: number, sub = '') {
  const dir = sub ? path.join(dataDir, sub) : dataDir;
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, 'x');
  fs.utimesSync(p, new Date(mtimeMs), new Date(mtimeMs));
  return p;
}

beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-sweep-')); });
afterEach(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });

describe('syncTempCleanup — يحذف اليتيم فقط', () => {
  it('يحذف snapshot وdownload القديمَين', () => {
    write('sync-tmp-snapshot-1784829058124.db', OLD);
    write('sync-tmp-download-1784829060611.db', OLD);

    const r = cleanupOrphanSyncTemps(dataDir, { now: NOW });

    expect(r.deleted.sort()).toEqual([
      'sync-tmp-download-1784829060611.db',
      'sync-tmp-snapshot-1784829058124.db',
    ]);
    expect(fs.readdirSync(dataDir)).toHaveLength(0);
  });

  it('لا يمسّ لقطة حديثة — قد تكون رفعًا جاريًا الآن', () => {
    write('sync-tmp-snapshot-9999.db', FRESH);

    const r = cleanupOrphanSyncTemps(dataDir, { now: NOW });

    expect(r.deleted).toEqual([]);
    expect(r.skippedRecent).toEqual(['sync-tmp-snapshot-9999.db']);
    expect(fs.existsSync(path.join(dataDir, 'sync-tmp-snapshot-9999.db'))).toBe(true);
  });

  it('🔴 لا يمسّ أي ملف محمي مهما بلغ عمره', () => {
    const protectedFiles = [
      'manar.db',
      'manar.db-journal',
      'manar.db-wal',
      'manar.db.pre-integrity-20260717-040131.bak',
      'sync-metadata.json',
      'device-identity.json',
      'gdrive-account.json',
      'gdrive-client.json',
      'security.json',
    ];
    protectedFiles.forEach((f) => write(f, OLD));
    write('manar-backup-2026-07-29.db', OLD, 'backups');
    write('manar-auto-before-sync-1784827248726.db', OLD, path.join('backups', 'pre-sync'));

    const r = cleanupOrphanSyncTemps(dataDir, { now: NOW });

    expect(r.deleted).toEqual([]);
    protectedFiles.forEach((f) => expect(fs.existsSync(path.join(dataDir, f))).toBe(true));
    expect(fs.existsSync(path.join(dataDir, 'backups', 'manar-backup-2026-07-29.db'))).toBe(true);
    expect(
      fs.existsSync(path.join(dataDir, 'backups', 'pre-sync', 'manar-auto-before-sync-1784827248726.db')),
    ).toBe(true);
  });

  it('غير تعاودي — لا ينزل إلى backups/ حتى لو حمل اسمًا مطابقًا', () => {
    write('sync-tmp-snapshot-111.db', OLD, 'backups');
    const r = cleanupOrphanSyncTemps(dataDir, { now: NOW });
    expect(r.deleted).toEqual([]);
    expect(fs.existsSync(path.join(dataDir, 'backups', 'sync-tmp-snapshot-111.db'))).toBe(true);
  });

  it('أسماء مشابهة لكنها غير مطابقة لا تُحذف', () => {
    ['sync-tmp-snapshot-111.db.bak', 'sync-tmp-other-111.db', 'my-sync-tmp-snapshot-111.db', 'sync-tmp-snapshot-111.txt']
      .forEach((f) => write(f, OLD));

    const r = cleanupOrphanSyncTemps(dataDir, { now: NOW });
    expect(r.deleted).toEqual([]);
  });

  it('مجلد يحمل اسمًا مطابقًا لا يُحذف (ملفات عادية فقط)', () => {
    fs.mkdirSync(path.join(dataDir, 'sync-tmp-snapshot-222.db'));
    const r = cleanupOrphanSyncTemps(dataDir, { now: NOW });
    expect(r.deleted).toEqual([]);
    expect(fs.existsSync(path.join(dataDir, 'sync-tmp-snapshot-222.db'))).toBe(true);
  });

  it('مجلد بيانات غير موجود لا يرمي', () => {
    const missing = path.join(dataDir, 'nope');
    expect(() => cleanupOrphanSyncTemps(missing, { now: NOW })).not.toThrow();
    expect(cleanupOrphanSyncTemps(missing, { now: NOW }).deleted).toEqual([]);
  });

  it('مُطابِق الأسماء يقبل البادئتين فقط', () => {
    expect(isSyncTempName('sync-tmp-snapshot-1.db')).toBe(true);
    expect(isSyncTempName('sync-tmp-download-1.db')).toBe(true);
    expect(isSyncTempName('manar.db')).toBe(false);
    expect(isSyncTempName('sync-tmp-snapshot-1.json')).toBe(false);
  });
});
