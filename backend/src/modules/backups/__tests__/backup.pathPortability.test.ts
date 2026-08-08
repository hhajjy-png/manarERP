import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Zero Data Loss Certification Pack v1 — حارس قابلية استعادة النسخ الاحتياطية.
 *
 * العمود `Backup.filePath` يخزّن مسارًا مطلقًا كُتب لحظة إنشاء النسخة. ثلاثة أحداث
 * واقعية تُبطله بينما الملف نفسه سليم: استعادة على جهاز آخر (اسم مستخدم Windows
 * مختلف)، تغيير `productName`/`appId` الذي ينقل `userData` بكامله، أو نقل مجلد
 * النسخ يدويًا. قبل هذه الحزمة كانت كل نسخة عندئذٍ تُرفَض بـ«ملف النسخة غير موجود»
 * — أي فقدان **قدرة التعافي** وهو ما تمنعه الشهادة تمامًا كفقدان الملف نفسه.
 */

const h = vi.hoisted(() => ({
  db: { backup: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() }, $queryRawUnsafe: vi.fn() },
  dir: { current: '' },
  cwd: { current: '' },
}));

vi.mock('../../../config/database', () => ({
  prisma: h.db,
  disconnectDatabase: vi.fn(),
}));
vi.mock('../../../config/env', () => ({
  env: {
    get BACKUP_DIR() {
      return h.dir.current;
    },
    get DATABASE_URL() {
      return `file:${path.join(h.cwd.current, 'manar.db')}`;
    },
  },
}));

import { backupService } from '../../../shared/services/backup.service';

const FILE_NAME = 'manar-backup-2026-08-01T00-00-00-000Z.db';
/** رأسية SQLite صالحة — `verify` ترفض أي ملف بدونها. */
const SQLITE_HEADER = Buffer.concat([Buffer.from('SQLite format 3\x00'), Buffer.alloc(64)]);

function backupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    fileName: FILE_NAME,
    // كُتب على جهاز آخر تحت اسم منتج قديم — لا وجود له هنا.
    filePath: `C:\\Users\\previous-owner\\AppData\\Roaming\\Old Product\\data\\backups\\${FILE_NAME}`,
    sizeBytes: SQLITE_HEADER.length,
    type: 'MANUAL',
    status: 'SUCCESS',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  h.cwd.current = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-backup-'));
  h.dir.current = path.join(h.cwd.current, 'backups');
  fs.mkdirSync(h.dir.current, { recursive: true });
  h.db.$queryRawUnsafe.mockResolvedValue(undefined);
});

afterEach(() => {
  try { fs.rmSync(h.cwd.current, { recursive: true, force: true }); } catch { /* أفضل جهد */ }
});

describe('resolveBackupFile', () => {
  it('يشتقّ المسار من مجلد النسخ الحالي حين يكون الملف موجودًا فيه', () => {
    const derived = path.join(h.dir.current, FILE_NAME);
    fs.writeFileSync(derived, SQLITE_HEADER);

    expect(backupService.resolveBackupFile(backupRow())).toBe(derived);
  });

  it('يرجع إلى المسار المخزَّن حين لا يوجد الملف في المجلد الحالي — لا يخسر أحد نسخة قديمة', () => {
    const legacy = path.join(h.cwd.current, 'elsewhere', FILE_NAME);
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, SQLITE_HEADER);

    expect(backupService.resolveBackupFile(backupRow({ filePath: legacy }))).toBe(legacy);
  });
});

describe('restore — بعد انتقال مجلد البيانات', () => {
  it('يستعيد من الملف الموجود فعلًا رغم أن المسار المخزَّن يعود لجهاز آخر', async () => {
    const derived = path.join(h.dir.current, FILE_NAME);
    fs.writeFileSync(derived, SQLITE_HEADER);
    h.db.backup.findUnique.mockResolvedValue(backupRow());

    const result = await backupService.restore(3);

    expect(result.restored).toBe(true);
    expect(fs.readFileSync(path.join(h.cwd.current, 'manar.db'))).toEqual(SQLITE_HEADER);
  });

  it('يبقى يرفض بوضوح حين يكون الملف مفقودًا فعلًا في الموضعين', async () => {
    h.db.backup.findUnique.mockResolvedValue(backupRow());
    await expect(backupService.restore(3)).rejects.toThrow();
  });
});

describe('verify — لا إنذار كاذب بعد انتقال مجلد البيانات', () => {
  it('ينجح على نسخة سليمة يشير سجلّها إلى مسار جهاز آخر', async () => {
    fs.writeFileSync(path.join(h.dir.current, FILE_NAME), SQLITE_HEADER);
    h.db.backup.findUnique.mockResolvedValue(backupRow());
    h.db.backup.update.mockResolvedValue({});

    const result = await backupService.verify(3);

    expect(result.status).toBe('PASS');
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('remove — لا ملفات يتيمة', () => {
  it('يحذف الملف من المسار المشتقّ لا من المسار المخزَّن الميت', async () => {
    const derived = path.join(h.dir.current, FILE_NAME);
    fs.writeFileSync(derived, SQLITE_HEADER);
    h.db.backup.findUnique.mockResolvedValue(backupRow());
    h.db.backup.delete.mockResolvedValue({});

    await backupService.remove(3);

    expect(fs.existsSync(derived)).toBe(false);
    expect(h.db.backup.delete).toHaveBeenCalledWith({ where: { id: 3 } });
  });
});
