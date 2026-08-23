import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: { maintenanceRecord: { findMany: vi.fn() } },
}));

import { maintenanceService } from '../maintenance.service';
import { prisma } from '../../../config/database';

const db = prisma as unknown as {
  maintenanceRecord: { findMany: ReturnType<typeof vi.fn> };
};

/**
 * Filters, Dates & Loading Integrity Pack v3 — البند 4.
 *
 * «الصيانة المستحقة» كانت تحتسب أي سجل له `nextDueDate` مهما كانت حالته. إلغاء عمل
 * الصيانة يُبطل جدولته فلا يبقى موعده «مستحقًا».
 *
 * أما المكتملة فتبقى محتسَبة **عمدًا**: `nextDueDate` يُكتب عند إتمام الصيانة ليدلّ على
 * موعد الخدمة القادمة، والحالة الافتراضية عند الإنشاء هي COMPLETED — فاستبعادها يُفرغ
 * المؤشر بدل أن يصحّحه. هذا الاختبار يثبّت القرار كي لا يُعكس لاحقًا بحسن نية.
 */

beforeEach(() => {
  vi.clearAllMocks();
  db.maintenanceRecord.findMany.mockResolvedValue([]);
});

describe('dueMaintenance — نطاق «المستحقة»', () => {
  it('يستبعد السجلات الملغاة', async () => {
    await maintenanceService.dueMaintenance();
    expect(db.maintenanceRecord.findMany.mock.calls[0]![0].where.status).toEqual({ not: 'CANCELLED' });
  });

  it('لا يستبعد المكتملة — هي مصدر موعد الخدمة القادمة', async () => {
    await maintenanceService.dueMaintenance();
    const status = db.maintenanceRecord.findMany.mock.calls[0]![0].where.status;

    // لو صار الشرط قائمة تستثني COMPLETED لأصبح المؤشر فارغًا عمليًا.
    expect(status).not.toHaveProperty('in');
    expect(JSON.stringify(status)).not.toContain('COMPLETED');
  });

  it('يبقى شرط تاريخ الاستحقاق قائمًا بلا مساس', async () => {
    await maintenanceService.dueMaintenance();
    const where = db.maintenanceRecord.findMany.mock.calls[0]![0].where;
    expect(where.nextDueDate.not).toBeNull();
    expect(where.nextDueDate.lte).toBeInstanceOf(Date);
  });

  it('الحدّ الأعلى نهاية اليوم المحلي لا لحظة التنفيذ', async () => {
    await maintenanceService.dueMaintenance(30);
    const until: Date = db.maintenanceRecord.findMany.mock.calls[0]![0].where.nextDueDate.lte;

    expect(until.getHours()).toBe(23);
    expect(until.getMinutes()).toBe(59);
    expect(until.getMilliseconds()).toBe(999);
  });

  it('عدد الأيام يُحترم كما هو', async () => {
    await maintenanceService.dueMaintenance(7);
    const until: Date = db.maintenanceRecord.findMany.mock.calls[0]![0].where.nextDueDate.lte;

    const expected = new Date();
    expected.setDate(expected.getDate() + 7);
    expect(until.getDate()).toBe(expected.getDate());
  });
});
