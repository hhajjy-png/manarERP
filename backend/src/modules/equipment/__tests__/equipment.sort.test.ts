import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Enterprise Data Grid Foundation v1 — المعدات: الحالة المرجعية للعمود المشتق.
 * `regExpiry` و`regRemaining` عمودان عرضيان يُترجَمان إلى الحقل الفعلي
 * registrationExpiry مع nulls آخرًا — المدة الباقية = التاريخ − اليوم، فترتيبها
 * مطابق لترتيب التاريخ (Equipment Data Pack v1: صار الفرز عليه مسموحًا كي يكون
 * الترتيب الافتراضي لجدول المعدات «الأقرب انتهاءً أولًا» بلا حساب موازٍ).
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    equipment: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { equipmentService } from '../equipment.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  mp.equipment.findMany.mockResolvedValue([]);
  mp.equipment.count.mockResolvedValue(0);
});

function findManyArgs() {
  return mp.equipment.findMany.mock.calls[0][0];
}

describe('equipment.list — server-side sorting', () => {
  it('no sort params → historical default (id desc)', async () => {
    await equipmentService.list({});
    expect(findManyArgs().orderBy).toEqual([{ id: 'desc' }]);
  });

  it('computed display column regExpiry maps to registrationExpiry with nulls last', async () => {
    await equipmentService.list({ sortBy: 'regExpiry', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([
      { registrationExpiry: { sort: 'asc', nulls: 'last' } },
      { id: 'desc' },
    ]);
  });

  it('regRemaining sorts by the very field it is derived from (registrationExpiry), nulls last', async () => {
    await equipmentService.list({ sortBy: 'regRemaining', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([
      { registrationExpiry: { sort: 'asc', nulls: 'last' } },
      { id: 'desc' },
    ]);
  });

  it('regRemaining and regExpiry produce an identical query (one source, no parallel logic)', async () => {
    await equipmentService.list({ sortBy: 'regRemaining', sortDir: 'asc' });
    const remaining = findManyArgs().orderBy;
    mp.equipment.findMany.mockClear();
    await equipmentService.list({ sortBy: 'regExpiry', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual(remaining);
  });

  it('an unknown sort key is still rejected → module default', async () => {
    await equipmentService.list({ sortBy: 'color', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([{ id: 'desc' }]);
  });

  it('status filter + sort compose; registration enrichment still applied on rows', async () => {
    mp.equipment.findMany.mockResolvedValue([{ id: 1, code: 'EQ-1', registrationExpiry: null }]);
    mp.equipment.count.mockResolvedValue(1);
    const result = await equipmentService.list({ status: 'WORKING', sortBy: 'code', sortDir: 'asc' });
    expect(findManyArgs().where.status).toBe('WORKING');
    expect(findManyArgs().orderBy).toEqual([{ code: 'asc' }, { id: 'desc' }]);
    // إثراء registration (العمود المشتق) يعمل كما كان بعد الفرز
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.data[0] as any).registration.remainingText).toBe('غير محدد');
  });
});
