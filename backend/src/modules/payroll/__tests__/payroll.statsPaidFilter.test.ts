import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: { payroll: { aggregate: vi.fn(), count: vi.fn() } },
}));
vi.mock('../payrollMonth.readModel', () => ({
  resolveImportedRowsForMonth: vi.fn(async () => []),
  findPayrollEligibilityGap: vi.fn(async () => ({
    missingPayrollCount: 0, missingPayrollEmployees: [], eligibleCount: 0, representedCount: 0,
  })),
}));

import { payrollService } from '../payroll.service';
import { prisma } from '../../../config/database';

const db = prisma as unknown as {
  payroll: { aggregate: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

/**
 * Filters, Dates & Loading Integrity Pack v3 — البند 1 (الرواتب).
 *
 * `{ ...where, status: 'PAID' }` كان ينشر فوق فلتر الحالة الذي اختاره المستخدم، فتعرض
 * بطاقة «مدفوع» عدد المدفوعة الكامل للفترة بينما بقية البطاقات تعرض المسوّدات وحدها.
 * نفس الفلاتر = نفس المجموعة.
 */

beforeEach(() => {
  vi.clearAllMocks();
  db.payroll.aggregate.mockResolvedValue({
    _sum: { grossSalary: 0, netSalary: 0 }, _count: { _all: 7 },
  });
  db.payroll.count.mockResolvedValue(4);
});

describe('payrollService.stats — «مدفوع» يحترم فلتر الحالة', () => {
  it('بلا فلتر حالة: يَعُدّ المدفوعة داخل المجموعة غير الملغاة', async () => {
    const stats = await payrollService.stats({ month: '8', year: '2026' });

    expect(stats.paid).toBe(4);
    const paidWhere = db.payroll.count.mock.calls[0]![0].where;
    expect(paidWhere.status).toBe('PAID');
  });

  it('فلتر DRAFT: البطاقة تعرض صفرًا ولا تستعلم عن مجموعة أخرى (الانحدار المُصلَح)', async () => {
    const stats = await payrollService.stats({ month: '8', year: '2026', status: 'DRAFT' });

    // قبل الإصلاح: 4 — عدد المدفوعة للفترة كلها بجوار بطاقات تعرض المسوّدات.
    expect(stats.paid).toBe(0);
    expect(db.payroll.count).not.toHaveBeenCalled();
  });

  it('فلتر PAID: البطاقة تساوي حجم المجموعة المفلترة نفسها', async () => {
    db.payroll.count.mockResolvedValue(7);
    const stats = await payrollService.stats({ month: '8', year: '2026', status: 'PAID' });

    expect(stats.paid).toBe(7);
    expect(stats.count).toBe(7);
    // تُستعلم المجموعة المفلترة كما هي — بلا نشر يفرض status فوقها.
    expect(db.payroll.count.mock.calls[0]![0].where.status).toBe('PAID');
  });

  it('أي حالة أخرى لا تتقاطع مع PAID فتُعطي صفرًا', async () => {
    for (const status of ['APPROVED', 'CANCELLED']) {
      vi.clearAllMocks();
      db.payroll.aggregate.mockResolvedValue({ _sum: { grossSalary: 0, netSalary: 0 }, _count: { _all: 3 } });
      const stats = await payrollService.stats({ month: '8', year: '2026', status });
      expect(stats.paid, status).toBe(0);
    }
  });
});
