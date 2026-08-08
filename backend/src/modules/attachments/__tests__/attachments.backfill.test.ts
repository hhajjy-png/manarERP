import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Zero Data Loss Certification Pack v1 — حارس ترحيل المرفقات القديمة.
 *
 * المرفقات المرفوعة قبل هذه الحزمة تحمل `content = NULL` وتعيش على القرص وحده، أي
 * أنها ما زالت خارج النسخ الاحتياطي والمزامنة. هذا الترحيل هو ما يجعل التثبيتات
 * القائمة تلحق بالضمانة بدل أن تقتصر على المرفقات الجديدة. الاختبارات هنا تثبّت
 * السلوك الذي لا يجوز أن ينكسر: يملأ ما يجده، ولا يخترع ما لا يجده، ولا يرمي أبدًا
 * (لأنه يعمل داخل مسار الإقلاع — فشله كان سيمنع النظام كله من العمل).
 */

const h = vi.hoisted(() => ({
  db: { attachment: { findMany: vi.fn(), update: vi.fn() } },
  dir: { current: '' },
}));

vi.mock('@config/database', () => ({ prisma: h.db }));
vi.mock('@core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@config/env', () => ({
  env: {
    get ATTACHMENTS_DIR() {
      return h.dir.current;
    },
  },
}));

import { backfillAttachmentContent } from '../attachments.backfill';
import { attachmentsService } from '../attachments.service';

const BYTES = Buffer.from('bytes on disk from before the pack');

function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    entityType: 'CONTRACT',
    entityId: 7,
    fileName: 'uuid-old.pdf',
    filePath: 'C:\\Users\\gone\\AppData\\Roaming\\Old\\attachments\\CONTRACT\\7\\uuid-old.pdf',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  h.dir.current = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-backfill-'));
});

afterEach(() => {
  try { fs.rmSync(h.dir.current, { recursive: true, force: true }); } catch { /* أفضل جهد */ }
});

describe('backfillAttachmentContent', () => {
  it('ينقل بايتات مرفق قديم من القرص إلى قاعدة البيانات', async () => {
    const target = attachmentsService.currentPath('CONTRACT', 7, 'uuid-old.pdf');
    fs.writeFileSync(target, BYTES);
    h.db.attachment.findMany.mockResolvedValue([legacyRow()]);
    h.db.attachment.update.mockResolvedValue({});

    const result = await backfillAttachmentContent();

    expect(result).toEqual({ scanned: 1, filled: 1, missing: 0 });
    const data = h.db.attachment.update.mock.calls[0][0].data;
    expect(Buffer.from(data.content)).toEqual(BYTES);
  });

  it('يقرأ من المسار المطلق القديم حين يكون هو الموجود فعلًا (جهاز الرفع الأصلي)', async () => {
    const legacyDir = path.join(h.dir.current, 'legacy');
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacy = path.join(legacyDir, 'uuid-old.pdf');
    fs.writeFileSync(legacy, BYTES);

    h.db.attachment.findMany.mockResolvedValue([legacyRow({ filePath: legacy })]);
    h.db.attachment.update.mockResolvedValue({});

    const result = await backfillAttachmentContent();

    expect(result.filled).toBe(1);
    expect(Buffer.from(h.db.attachment.update.mock.calls[0][0].data.content)).toEqual(BYTES);
  });

  it('يعدّ الملف المفقود ولا يخترع له محتوى', async () => {
    h.db.attachment.findMany.mockResolvedValue([legacyRow()]);

    const result = await backfillAttachmentContent();

    expect(result).toEqual({ scanned: 1, filled: 0, missing: 1 });
    expect(h.db.attachment.update).not.toHaveBeenCalled();
  });

  it('يستهدف الصفوف الفارغة وحدها — فلا يعيد كتابة مرفق مُرحَّل مسبقًا', async () => {
    h.db.attachment.findMany.mockResolvedValue([]);
    await backfillAttachmentContent();
    expect(h.db.attachment.findMany.mock.calls[0][0].where).toEqual({ content: null });
  });

  it('لا عمل إطلاقًا بعد اكتمال الترحيل (تشغيل ثانٍ رخيص)', async () => {
    h.db.attachment.findMany.mockResolvedValue([]);
    const result = await backfillAttachmentContent();
    expect(result).toEqual({ scanned: 0, filled: 0, missing: 0 });
    expect(h.db.attachment.update).not.toHaveBeenCalled();
  });

  it('لا يرمي حين تفشل قراءة قاعدة البيانات — الإقلاع لا يجوز أن يتوقف بسببه', async () => {
    h.db.attachment.findMany.mockRejectedValue(new Error('database is locked'));
    await expect(backfillAttachmentContent()).resolves.toEqual({ scanned: 0, filled: 0, missing: 0 });
  });

  it('لا يرمي حين يفشل تحديث صف واحد — يواصل بقية الصفوف', async () => {
    const a = attachmentsService.currentPath('CONTRACT', 7, 'a.pdf');
    const b = attachmentsService.currentPath('CONTRACT', 7, 'b.pdf');
    fs.writeFileSync(a, BYTES);
    fs.writeFileSync(b, BYTES);

    h.db.attachment.findMany.mockResolvedValue([
      legacyRow({ id: 1, fileName: 'a.pdf' }),
      legacyRow({ id: 2, fileName: 'b.pdf' }),
    ]);
    h.db.attachment.update
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce({});

    const result = await backfillAttachmentContent();

    expect(result).toEqual({ scanned: 2, filled: 1, missing: 1 });
  });
});
