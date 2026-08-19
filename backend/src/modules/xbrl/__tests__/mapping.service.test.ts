import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ربط الحسابات — ثلاثة أسئلة:
 *   ١. هل تُسمح «عدة حسابات ← مفهوم واحد»؟ (يجب: نعم)
 *   ٢. هل يُرفض «حساب واحد ← مفهومان في نفس الفترة»؟ (يجب: نعم)
 *   ٣. هل تكتب الخدمة في `accounts`؟ (يجب: أبدًا)
 */
vi.mock('../../../config/database', () => ({
  prisma: {
    account: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    xbrlConcept: { findUnique: vi.fn() },
    xbrlAccountMapping: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from '../../../config/database';
import { AccountMappingService } from '../services/mapping.service';

const db = prisma as unknown as {
  account: Record<string, ReturnType<typeof vi.fn>>;
  xbrlConcept: Record<string, ReturnType<typeof vi.fn>>;
  xbrlAccountMapping: Record<string, ReturnType<typeof vi.fn>>;
};

const req = { user: { userId: 1, username: 'tester' }, ip: '127.0.0.1' } as never;
const d = (iso: string) => new Date(iso);

describe('AccountMappingService.create', () => {
  let service: AccountMappingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AccountMappingService();
    db.account.findUnique.mockResolvedValue({ id: 1 });
    db.xbrlConcept.findUnique.mockResolvedValue({ id: 10, taxonomyId: 1 });
    db.xbrlAccountMapping.findMany.mockResolvedValue([]);
    db.xbrlAccountMapping.findUnique.mockResolvedValue(null);
    db.xbrlAccountMapping.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 55, ...data }),
    );
  });

  it('يسمح بربط عدة حسابات بمفهوم واحد', async () => {
    await service.create(req, { taxonomyId: 1, accountId: 1, conceptId: 10 });
    db.account.findUnique.mockResolvedValue({ id: 2 });
    await service.create(req, { taxonomyId: 1, accountId: 2, conceptId: 10 });
    db.account.findUnique.mockResolvedValue({ id: 3 });
    await service.create(req, { taxonomyId: 1, accountId: 3, conceptId: 10 });

    expect(db.xbrlAccountMapping.create).toHaveBeenCalledTimes(3);
  });

  it('يرفض ربطًا ثانيًا لنفس الحساب بنافذة سريان متداخلة', async () => {
    db.xbrlAccountMapping.findMany.mockResolvedValue([
      { id: 9, conceptId: 11, effectiveFrom: null, effectiveTo: null },
    ]);
    await expect(service.create(req, { taxonomyId: 1, accountId: 1, conceptId: 10 }))
      .rejects.toThrow(/مرتبط بالفعل بمفهوم آخر/);
    expect(db.xbrlAccountMapping.create).not.toHaveBeenCalled();
  });

  it('يسمح بربط ثانٍ لنفس الحساب بنافذة سريان لا تتقاطع', async () => {
    db.xbrlAccountMapping.findMany.mockResolvedValue([
      { id: 9, conceptId: 11, effectiveFrom: d('2025-01-01'), effectiveTo: d('2025-12-31') },
    ]);
    await service.create(req, {
      taxonomyId: 1, accountId: 1, conceptId: 10,
      effectiveFrom: d('2026-01-01'), effectiveTo: d('2026-12-31'),
    });
    expect(db.xbrlAccountMapping.create).toHaveBeenCalledTimes(1);
  });

  it('السطر المعطَّل لا يخضع لفحص التعارض', async () => {
    db.xbrlAccountMapping.findMany.mockResolvedValue([
      { id: 9, conceptId: 11, effectiveFrom: null, effectiveTo: null },
    ]);
    await service.create(req, { taxonomyId: 1, accountId: 1, conceptId: 10, isEnabled: false });
    expect(db.xbrlAccountMapping.create).toHaveBeenCalledTimes(1);
  });

  it('يرفض التكرار الحرفي لنفس الثلاثية (تصنيف، حساب، مفهوم)', async () => {
    db.xbrlAccountMapping.findUnique.mockResolvedValue({ id: 4 });
    await expect(service.create(req, { taxonomyId: 1, accountId: 1, conceptId: 10 }))
      .rejects.toThrow(/موجود بالفعل/);
  });

  it('يرفض مفهومًا من تصنيف آخر', async () => {
    db.xbrlConcept.findUnique.mockResolvedValue({ id: 10, taxonomyId: 99 });
    await expect(service.create(req, { taxonomyId: 1, accountId: 1, conceptId: 10 }))
      .rejects.toThrow(/لا ينتمي إلى التصنيف/);
  });

  it('يرفض حسابًا غير موجود', async () => {
    db.account.findUnique.mockResolvedValue(null);
    await expect(service.create(req, { taxonomyId: 1, accountId: 404, conceptId: 10 }))
      .rejects.toThrow(/الحساب غير موجود/);
  });

  it('يرفض نافذة سريان مقلوبة', async () => {
    await expect(service.create(req, {
      taxonomyId: 1, accountId: 1, conceptId: 10,
      effectiveFrom: d('2026-12-31'), effectiveTo: d('2026-01-01'),
    })).rejects.toThrow(/يسبق تاريخ نهايته/);
  });

  it('لا يكتب في جدول الحسابات إطلاقًا — قراءة فقط', async () => {
    await service.create(req, { taxonomyId: 1, accountId: 1, conceptId: 10 });
    expect(db.account.update).not.toHaveBeenCalled();
    expect(db.account.create).not.toHaveBeenCalled();
    expect(db.account.delete).not.toHaveBeenCalled();
  });
});

describe('AccountMappingService.update', () => {
  let service: AccountMappingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AccountMappingService();
    db.xbrlAccountMapping.findUnique.mockResolvedValue({
      id: 5, taxonomyId: 1, accountId: 1, conceptId: 10,
      status: 'MAPPED', isEnabled: true, effectiveFrom: null, effectiveTo: null,
    });
    db.account.findUnique.mockResolvedValue({ id: 1 });
    db.xbrlConcept.findUnique.mockResolvedValue({ id: 11, taxonomyId: 1 });
    db.xbrlAccountMapping.findMany.mockResolvedValue([]);
    db.xbrlAccountMapping.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 5, ...data }),
    );
  });

  it('يستثني السطر نفسه من فحص التعارض', async () => {
    await service.update(req, 5, { conceptId: 11 });
    expect(db.xbrlAccountMapping.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 5 } }) }),
    );
  });

  it('يسمح بتغيير الحالة إلى «يحتاج مراجعة»', async () => {
    const updated = await service.update(req, 5, { status: 'NEEDS_REVIEW' });
    expect(updated.status).toBe('NEEDS_REVIEW');
  });

  it('لا يسمح بتغيير الحساب أو التصنيف عبر التعديل', async () => {
    await service.update(req, 5, { accountId: 99, taxonomyId: 99 } as never);
    const data = db.xbrlAccountMapping.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('accountId');
    expect(data).not.toHaveProperty('taxonomyId');
  });
});
