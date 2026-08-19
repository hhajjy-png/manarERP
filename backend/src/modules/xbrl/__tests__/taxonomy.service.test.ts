import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * سجلّ التصنيفات — الاختبار المحوري هنا واحد:
 * **لا مسار في v1 يجعل تصنيفًا رسميًا.** بقية الاختبارات تحرس دورة الحياة.
 */
vi.mock('../../../config/database', () => ({
  prisma: {
    xbrlTaxonomy: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';
import { TaxonomyService } from '../services/taxonomy.service';

const db = prisma as unknown as {
  xbrlTaxonomy: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

const req = { user: { userId: 1, username: 'tester' }, ip: '127.0.0.1' } as never;

const VALID_INPUT = {
  code: 'KW-QAYD-2027',
  nameAr: 'تصنيف وزارة التجارة',
  jurisdiction: 'KW',
  version: '1.0',
};

describe('TaxonomyService.create — منع ادّعاء الرسمية', () => {
  let service: TaxonomyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaxonomyService();
    db.xbrlTaxonomy.findUnique.mockResolvedValue(null);
    db.xbrlTaxonomy.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 1, ...data }),
    );
  });

  it('ينشئ التصنيف بـ isOfficial = false دائمًا', async () => {
    await service.create(req, VALID_INPUT);
    expect(db.xbrlTaxonomy.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isOfficial: false }) }),
    );
  });

  it('يتجاهل isOfficial حتى لو مُرِّر صراحةً في المدخلات', async () => {
    await service.create(req, { ...VALID_INPUT, isOfficial: true } as never);
    const passed = db.xbrlTaxonomy.create.mock.calls[0][0].data;
    expect(passed.isOfficial).toBe(false);
  });

  it('اسم يحمل «QAYD» لا يمنح الرسمية', async () => {
    const created = await service.create(req, { ...VALID_INPUT, code: 'KW-QAYD-OFFICIAL' });
    expect(created.isOfficial).toBe(false);
  });

  it('يبدأ التصنيف مسودة — لا يُفعَّل تلقائيًا عند الإنشاء', async () => {
    await service.create(req, VALID_INPUT);
    expect(db.xbrlTaxonomy.create.mock.calls[0][0].data.status).toBe('DRAFT');
  });

  it('يرفض تكرار رمز التصنيف', async () => {
    db.xbrlTaxonomy.findUnique.mockResolvedValue({ id: 9 });
    await expect(service.create(req, VALID_INPUT)).rejects.toThrow(/مستخدم بالفعل/);
    expect(db.xbrlTaxonomy.create).not.toHaveBeenCalled();
  });

  it('يسجّل الإنشاء في سجل التدقيق', async () => {
    await service.create(req, VALID_INPUT);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', module: 'xbrl' }));
  });
});

describe('TaxonomyService.update — ما لا يمكن تعديله', () => {
  let service: TaxonomyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaxonomyService();
    db.xbrlTaxonomy.findUnique.mockResolvedValue({ id: 1, code: 'X', status: 'DRAFT', isOfficial: false });
    db.xbrlTaxonomy.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 1, ...data }),
    );
  });

  it('لا يمرّر isOfficial ولا status ولا code إلى قاعدة البيانات', async () => {
    await service.update(req, 1, { isOfficial: true, status: 'ACTIVE', code: 'NEW', nameAr: 'اسم جديد' } as never);
    const data = db.xbrlTaxonomy.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('isOfficial');
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('code');
    expect(data.nameAr).toBe('اسم جديد');
  });
});

describe('TaxonomyService.setStatus — تصنيف مفعَّل واحد على الأكثر', () => {
  let service: TaxonomyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaxonomyService();
    db.xbrlTaxonomy.findUnique.mockResolvedValue({ id: 2, code: 'X', status: 'DRAFT', isOfficial: false });
    db.xbrlTaxonomy.updateMany.mockResolvedValue({ count: 1 });
    db.xbrlTaxonomy.update.mockResolvedValue({ id: 2, status: 'ACTIVE' });
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  });

  it('التفعيل يُعطّل كل تصنيف مفعَّل آخر', async () => {
    await service.setStatus(req, 2, 'ACTIVE');
    expect(db.xbrlTaxonomy.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', id: { not: 2 } },
      data: { status: 'INACTIVE' },
    });
  });

  it('التعطيل لا يمسّ بقية التصنيفات', async () => {
    db.xbrlTaxonomy.update.mockResolvedValue({ id: 2, status: 'INACTIVE' });
    await service.setStatus(req, 2, 'INACTIVE');
    expect(db.xbrlTaxonomy.updateMany).not.toHaveBeenCalled();
  });

  it('التفعيل لا يغيّر isOfficial', async () => {
    await service.setStatus(req, 2, 'ACTIVE');
    expect(db.xbrlTaxonomy.update.mock.calls[0][0].data).toEqual({ status: 'ACTIVE' });
  });
});

describe('TaxonomyService.hasOfficialTaxonomy', () => {
  it('يستعلم فعليًا عن التصنيفات الرسمية بدل افتراض النتيجة', async () => {
    vi.clearAllMocks();
    db.xbrlTaxonomy.count.mockResolvedValue(0);
    expect(await new TaxonomyService().hasOfficialTaxonomy()).toBe(false);
    expect(db.xbrlTaxonomy.count).toHaveBeenCalledWith({ where: { isOfficial: true } });
  });
});
