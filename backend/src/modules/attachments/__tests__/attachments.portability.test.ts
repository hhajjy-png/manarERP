import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Zero Data Loss Certification Pack v1 — حراس انحدار لبقاء المرفقات.
 *
 * كل اختبار هنا يثبّت جزءًا من الضمانة: **بايتات المرفق تعيش داخل `manar.db`**،
 * وهو الملف الوحيد الذي تحمله النسخة الاحتياطية ومزامنة Google Drive. قبل هذه
 * الحزمة كانت البايتات على القرص وحده والمسار مطلقًا، فكانت الاستعادة على جهاز
 * آخر — أو مجرّد تغيير `productName` الذي ينقل مجلد `userData` — تُنتج سجلّات
 * مرفقات بلا ملفات وبمسارات يرفضها حارس `attachments:openPath`.
 *
 * نظام ملفات حقيقي في مجلد مؤقّت لا `vi.mock('fs')`: الشيء المُختبَر هنا هو تحديدًا
 * التفاعل مع القرص (اشتقاق المسار، الكتابة الذرّية، إعادة الإنشاء عند الغياب)،
 * ومحاكاة `fs` كانت ستختبر المحاكاة لا السلوك.
 */

// `vi.mock` تُرفَع إلى أعلى الملف قبل أي `const`، فيجب أن يعيش ما تلمسه مصانعُها
// داخل `vi.hoisted` — وإلا فُقرئ قبل تهيئته.
const h = vi.hoisted(() => ({
  db: {
    attachment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
  // مجلد المرفقات لكل اختبار — يُقرأ عبر getter كي يرى الخدمةُ المجلدَ المؤقّت
  // الذي أنشأه `beforeEach` بعد رفع المحاكاة، لا قيمة مجمّدة وقت الاستيراد.
  dir: { current: '' },
}));

const dbMock = h.db;

vi.mock('@config/database', () => ({ prisma: h.db }));
vi.mock('@core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@config/env', () => ({
  env: {
    get ATTACHMENTS_DIR() {
      return h.dir.current;
    },
  },
}));

import { attachmentsService } from '../attachments.service';

const ENTITY = 'INVOICE';
const ENTITY_ID = 42;
const FILE_NAME = 'uuid-contract.pdf';
const BYTES = Buffer.from('%PDF-1.7 fake contract bytes');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    entityType: ENTITY,
    entityId: ENTITY_ID,
    title: 'عقد موقّع',
    fileName: FILE_NAME,
    originalName: 'contract.pdf',
    // المسار كما كُتب على **جهاز الرفع الأصلي** — لا وجود له على هذا الجهاز.
    filePath: 'C:\\Users\\someone-else\\AppData\\Roaming\\Old Product\\data\\attachments\\INVOICE\\42\\uuid-contract.pdf',
    fileSize: BYTES.length,
    mimeType: 'application/pdf',
    uploadedById: 1,
    uploadedAt: new Date('2026-08-01T00:00:00.000Z'),
    content: BYTES,
    uploadedBy: { username: 'admin', fullName: 'المدير' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  h.dir.current = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-attach-'));
});

afterEach(() => {
  try { fs.rmSync(h.dir.current, { recursive: true, force: true }); } catch { /* تنظيف أفضل جهد */ }
});

describe('اشتقاق مسار المرفق — قابلية النقل بين الأجهزة', () => {
  it('يشتقّ المسار من مجلد المرفقات الحالي، لا من العمود filePath المخزَّن', () => {
    const derived = attachmentsService.currentPath(ENTITY, ENTITY_ID, FILE_NAME);
    expect(derived).toBe(path.join(h.dir.current, ENTITY, String(ENTITY_ID), FILE_NAME));
    expect(derived).not.toContain('someone-else');
    expect(derived).not.toContain('Old Product');
  });

  it('يرفض أي محاولة خروج من مجلد المرفقات عبر اسم ملف مركّب', () => {
    const derived = attachmentsService.currentPath(ENTITY, ENTITY_ID, '../../../etc/passwd');
    expect(derived.startsWith(path.resolve(h.dir.current))).toBe(true);
    expect(derived).toBe(path.join(h.dir.current, ENTITY, String(ENTITY_ID), 'passwd'));
  });

  it('يرفض نوع كيان غير مسموح به', () => {
    expect(() => attachmentsService.currentPath('SECRETS', 1, 'x.pdf')).toThrow();
  });
});

describe('list() — استعادة المرفقات على جهاز جديد', () => {
  it('يُعيد إنشاء الملف من قاعدة البيانات حين لا يكون موجودًا على القرص', async () => {
    dbMock.attachment.findMany.mockResolvedValue([row()]);

    const target = attachmentsService.currentPath(ENTITY, ENTITY_ID, FILE_NAME);
    expect(fs.existsSync(target)).toBe(false); // الحالة بعد استعادة نسخة على جهاز نظيف

    const result = await attachmentsService.list(ENTITY, ENTITY_ID);

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target)).toEqual(BYTES);
    expect(result[0].filePath).toBe(target);
  });

  it('لا يعيد الكتابة فوق ملف موجود (لا عمل في الحالة الطبيعية)', async () => {
    const target = attachmentsService.currentPath(ENTITY, ENTITY_ID, FILE_NAME);
    fs.writeFileSync(target, 'المحتوى الموجود مسبقًا');
    dbMock.attachment.findMany.mockResolvedValue([row()]);

    await attachmentsService.list(ENTITY, ENTITY_ID);

    expect(fs.readFileSync(target, 'utf8')).toBe('المحتوى الموجود مسبقًا');
  });

  it('لا يُسرّب البايتات في استجابة القائمة', async () => {
    dbMock.attachment.findMany.mockResolvedValue([row()]);

    const result = await attachmentsService.list(ENTITY, ENTITY_ID);

    expect('content' in result[0]).toBe(false);
    expect(JSON.stringify(result)).not.toContain('fake contract bytes');
  });

  it('يميّز المرفق الذي لا بايتات له بأنه غير قابل للنقل، ولا يخترع له ملفًا', async () => {
    dbMock.attachment.findMany.mockResolvedValue([row({ content: null })]);

    const result = await attachmentsService.list(ENTITY, ENTITY_ID);

    expect(result[0].isPortable).toBe(false);
    expect(fs.existsSync(attachmentsService.currentPath(ENTITY, ENTITY_ID, FILE_NAME))).toBe(false);
  });

  it('يطلب البايتات من القاعدة صراحةً — بدونها لا يمكن إعادة إنشاء أي ملف', async () => {
    dbMock.attachment.findMany.mockResolvedValue([]);
    await attachmentsService.list(ENTITY, ENTITY_ID);

    const args = dbMock.attachment.findMany.mock.calls[0][0];
    expect(args.select.content).toBe(true);
  });
});

describe('create() — كل مرفق جديد يدخل النسخ الاحتياطي فورًا', () => {
  it('يخزّن بايتات الملف داخل قاعدة البيانات', async () => {
    const dir = path.join(h.dir.current, ENTITY, String(ENTITY_ID));
    fs.mkdirSync(dir, { recursive: true });
    const uploaded = path.join(dir, FILE_NAME);
    fs.writeFileSync(uploaded, BYTES);

    dbMock.attachment.create.mockResolvedValue({ id: 7, originalName: 'contract.pdf' });

    await attachmentsService.create(
      ENTITY,
      ENTITY_ID,
      'عقد موقّع',
      { filename: FILE_NAME, originalname: 'contract.pdf', path: uploaded, size: BYTES.length, mimetype: 'application/pdf' },
      1,
      {} as never,
    );

    const data = dbMock.attachment.create.mock.calls[0][0].data;
    expect(Buffer.from(data.content)).toEqual(BYTES);
  });

  it('يفشل الرفع بدل تسجيل مرفق بلا بايتات حين يتعذّر قراءة الملف', async () => {
    await expect(
      attachmentsService.create(
        ENTITY,
        ENTITY_ID,
        'عقد',
        { filename: FILE_NAME, originalname: 'c.pdf', path: path.join(h.dir.current, 'لا-وجود-له.pdf'), size: 1, mimetype: 'application/pdf' },
        1,
        {} as never,
      ),
    ).rejects.toThrow();

    expect(dbMock.attachment.create).not.toHaveBeenCalled();
  });
});

describe('remove() — لا ملفات يتيمة على أي جهاز', () => {
  it('يحذف الملف من المسار المشتقّ لهذا الجهاز', async () => {
    const target = attachmentsService.currentPath(ENTITY, ENTITY_ID, FILE_NAME);
    fs.writeFileSync(target, BYTES);

    dbMock.attachment.findUnique.mockResolvedValue(row());
    dbMock.attachment.delete.mockResolvedValue({});

    await attachmentsService.remove(1, 1, {} as never);

    expect(fs.existsSync(target)).toBe(false);
    expect(dbMock.attachment.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('يحذف أيضًا المسار المطلق القديم حين يكون موجودًا (جهاز الرفع الأصلي)', async () => {
    const legacyDir = path.join(h.dir.current, 'legacy');
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacy = path.join(legacyDir, FILE_NAME);
    fs.writeFileSync(legacy, BYTES);

    dbMock.attachment.findUnique.mockResolvedValue(row({ filePath: legacy }));
    dbMock.attachment.delete.mockResolvedValue({});

    await attachmentsService.remove(1, 1, {} as never);

    expect(fs.existsSync(legacy)).toBe(false);
  });

  it('لا يقرأ البايتات أثناء الحذف — لا داعي لتحميل ملف كامل في الذاكرة', async () => {
    dbMock.attachment.findUnique.mockResolvedValue(row());
    dbMock.attachment.delete.mockResolvedValue({});

    await attachmentsService.remove(1, 1, {} as never);

    const args = dbMock.attachment.findUnique.mock.calls[0][0];
    expect(args.select.content).toBeUndefined();
  });
});
