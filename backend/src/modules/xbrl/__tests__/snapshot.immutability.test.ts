import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * لقطة الإصدار المالي.
 *
 * «غير قابلة للتعديل» ادّعاء لا معنى له ما لم يُثبَت بنيويًا. الإثبات هنا من ثلاث جهات:
 *   ١. الخدمة لا تكشف `update` ولا `delete`.
 *   ٢. الراوتر لا يحمل PATCH/PUT/DELETE على `/snapshots`.
 *   ٣. اللقطة تُجمِّد الربط ونسخة التصنيف وقت الإنشاء لا وقت القراءة.
 */
vi.mock('../../../config/database', () => ({
  prisma: {
    xbrlSnapshot: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/readiness.service', () => ({
  readinessService: { buildDataset: vi.fn(), buildReportFromDataset: vi.fn() },
}));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';
import { computeSourceHash, SnapshotService, snapshotService } from '../services/snapshot.service';
import { readinessService } from '../services/readiness.service';
import { validateReadiness } from '../domain/validation.engine';
import { buildAccountRows, computeReadinessScore } from '../domain/readiness.score';
import { dataset, mapping, taxonomy } from './fixtures';

const db = prisma as unknown as { xbrlSnapshot: Record<string, ReturnType<typeof vi.fn>> };
const svc = readinessService as unknown as { buildDataset: ReturnType<typeof vi.fn>; buildReportFromDataset: ReturnType<typeof vi.fn> };

const req = { user: { userId: 7, username: 'محاسب' }, ip: '127.0.0.1' } as never;

function reportFor(ds: ReturnType<typeof dataset>) {
  const validation = validateReadiness(ds);
  const accounts = buildAccountRows(ds);
  return {
    generatedAt: new Date().toISOString(),
    taxonomy: ds.taxonomy,
    context: ds.context,
    company: ds.company,
    trialBalance: ds.trialBalance,
    equation: ds.equation,
    score: computeReadinessScore(accounts, validation, ds.hasOfficialTaxonomy),
    validation,
    accounts,
  };
}

describe('SnapshotService — سطح الخدمة', () => {
  it('لا تكشف أي دالة تعديل أو حذف', () => {
    const surface = [
      ...Object.getOwnPropertyNames(SnapshotService.prototype),
      ...Object.keys(snapshotService),
    ];
    for (const forbidden of ['update', 'remove', 'delete', 'patch', 'edit']) {
      expect(surface).not.toContain(forbidden);
    }
  });

  it('تكشف الإنشاء والقراءة فقط', () => {
    const methods = Object.getOwnPropertyNames(SnapshotService.prototype).filter((m) => m !== 'constructor');
    expect(methods.sort()).toEqual(['create', 'getById', 'list']);
  });
});

describe('مسارات اللقطات — لا فعل تعديل واحد', () => {
  it('الراوتر لا يسجّل PATCH ولا PUT ولا DELETE على /snapshots', async () => {
    // يُستورد داخل الاختبار: الراوتر يسحب سلسلة الوحدات كلها، ولا داعي لتحميلها
    // في ملفات الاختبار الأخرى.
    const router = (await import('../xbrl.routes')).default as unknown as {
      stack: { route?: { path: string; methods: Record<string, boolean> } }[];
    };

    const snapshotRoutes = router.stack
      .map((layer) => layer.route)
      .filter((route): route is { path: string; methods: Record<string, boolean> } =>
        Boolean(route?.path.startsWith('/snapshots')));

    expect(snapshotRoutes.length).toBeGreaterThan(0);
    const methods = new Set(snapshotRoutes.flatMap((r) => Object.keys(r.methods)));
    expect([...methods].sort()).toEqual(['get', 'post']);
  });
});

describe('SnapshotService.create — تجميد الحالة', () => {
  let service: SnapshotService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SnapshotService();
    db.xbrlSnapshot.findFirst.mockResolvedValue(null);
    db.xbrlSnapshot.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 1, ...data }),
    );
    svc.buildReportFromDataset.mockImplementation((ds) => reportFor(ds));
  });

  it('يخزّن رمز التصنيف ونسخته وحالة رسميته نصًّا وقت الإنشاء', async () => {
    const ds = dataset({ taxonomy: taxonomy({ id: 3, code: 'INTERNAL-DRAFT', version: '2.5' }) });
    svc.buildDataset.mockResolvedValue(ds);

    await service.create(req, {});
    const data = db.xbrlSnapshot.create.mock.calls[0][0].data;
    expect(data.taxonomyCode).toBe('INTERNAL-DRAFT');
    expect(data.taxonomyVersion).toBe('2.5');
    expect(data.taxonomyIsOfficial).toBe(false);
  });

  it('يجمّد الربط كما هو لحظة الإنشاء', async () => {
    const ds = dataset({
      accountMappings: [mapping({ id: 1, accountId: 1, conceptId: 10, notes: 'وقت اللقطة' })],
    });
    svc.buildDataset.mockResolvedValue(ds);

    await service.create(req, {});
    const stored = JSON.parse(db.xbrlSnapshot.create.mock.calls[0][0].data.accountMappingsJson);
    expect(stored).toHaveLength(1);
    expect(stored[0].notes).toBe('وقت اللقطة');
  });

  it('يجمّد نتائج التحقق ومؤشر الجاهزية', async () => {
    svc.buildDataset.mockResolvedValue(dataset());
    await service.create(req, {});
    const data = db.xbrlSnapshot.create.mock.calls[0][0].data;
    expect(JSON.parse(data.validationJson)).toHaveProperty('errorCount');
    expect(JSON.parse(data.readinessJson)).toHaveProperty('mappedPercentage');
  });

  it('يرقّم اللقطة XBRLS-<السنة>-00001 ويتصاعد', async () => {
    svc.buildDataset.mockResolvedValue(dataset());
    await service.create(req, {});
    expect(db.xbrlSnapshot.create.mock.calls[0][0].data.snapshotNumber).toBe('XBRLS-2026-00001');

    db.xbrlSnapshot.findFirst.mockResolvedValue({ snapshotNumber: 'XBRLS-2026-00007' });
    await service.create(req, {});
    expect(db.xbrlSnapshot.create.mock.calls[1][0].data.snapshotNumber).toBe('XBRLS-2026-00008');
  });

  it('يرفض الإنشاء بلا سياق تقرير', async () => {
    svc.buildDataset.mockResolvedValue(dataset({ context: null }));
    await expect(service.create(req, {})).rejects.toThrow(/بلا سياق تقرير/);
    expect(db.xbrlSnapshot.create).not.toHaveBeenCalled();
  });

  it('يسجّل حدث اللقطة في سجل التدقيق', async () => {
    svc.buildDataset.mockResolvedValue(dataset());
    await service.create(req, {});
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'SNAPSHOT', module: 'xbrl' }));
  });

  it('ينشئ اللقطة رغم وجود أخطاء تحقق — اللقطة سجل لا شهادة صحة', async () => {
    svc.buildDataset.mockResolvedValue(
      dataset({ trialBalance: { totalDebit: 5, totalCredit: 4, difference: 1, isBalanced: false } }),
    );
    await service.create(req, {});
    expect(db.xbrlSnapshot.create).toHaveBeenCalledTimes(1);
    expect(JSON.parse(db.xbrlSnapshot.create.mock.calls[0][0].data.validationJson).errorCount).toBeGreaterThan(0);
  });
});

describe('computeSourceHash', () => {
  it('يعطي البصمة نفسها لنفس البيانات', () => {
    expect(computeSourceHash(dataset())).toBe(computeSourceHash(dataset()));
  });

  it('تتغيّر البصمة عند تغيّر رصيد واحد', () => {
    const before = computeSourceHash(dataset());
    const after = computeSourceHash(
      dataset({
        accounts: [
          { accountId: 1, code: 'A1', name: 'حساب', nameEn: null, type: 'ASSET', normalBalance: 'DEBIT', isActive: true, balance: 11, totalDebit: 11, totalCredit: 0 },
        ],
      }),
    );
    expect(after).not.toBe(before);
  });

  it('تتغيّر البصمة عند تغيّر الربط', () => {
    const before = computeSourceHash(dataset({ accountMappings: [mapping({ id: 1, accountId: 1, conceptId: 10 })] }));
    const after = computeSourceHash(dataset({ accountMappings: [mapping({ id: 1, accountId: 1, conceptId: 11 })] }));
    expect(after).not.toBe(before);
  });
});
