import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * المرحلة 7 — إحصاءات المصروفات تُجمَّع في قاعدة البيانات (aggregate/groupBy)
 * بدل جلب كل الصفوف ثم reduce/تصنيف في الذاكرة. يحرس تكافؤ السلوك للبيانات الصغيرة.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    expense:  { aggregate: vi.fn(), groupBy: vi.fn() },
    supplier: { findMany: vi.fn() },
  },
}));
vi.mock('../expenses.accounting', () => ({ repostExpenseToGL: vi.fn(), reverseExpenseFromGL: vi.fn() }));

import { prisma } from '../../../config/database';
import { expensesService } from '../expenses.service';

const mp = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  mp.supplier.findMany.mockResolvedValue([]);
});

describe('expenses.stats — DB-side aggregation', () => {
  it('does NOT fetch raw expense rows (no findMany of the whole table)', async () => {
    // لا توجد expense.findMany في mock الخدمة — لو استدعتها الخدمة لفشل الاختبار.
    mp.expense.findMany = vi.fn();
    mp.expense.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } });
    mp.expense.groupBy.mockResolvedValue([]);

    await expensesService.stats({});

    expect(mp.expense.findMany).not.toHaveBeenCalled();
    // إجماليات عبر aggregate، وتصنيفات عبر groupBy.
    expect(mp.expense.aggregate).toHaveBeenCalled();
    expect(mp.expense.groupBy).toHaveBeenCalled();
  });

  it('computes total/pending/byCategory from aggregate + groupBy (small data unchanged)', async () => {
    mp.expense.aggregate
      // total (كل الحالات)
      .mockResolvedValueOnce({ _sum: { amount: 900 }, _count: { _all: 3 } })
      // pending فقط
      .mockResolvedValueOnce({ _sum: { amount: 200 }, _count: { _all: 1 } })
      // periods cards (cmAgg/pmAgg/cyAgg) — لا تهمّ هنا
      .mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
    mp.expense.groupBy.mockImplementation((arg: any) => {
      if (arg.by[0] === 'category') {
        return Promise.resolve([
          { category: 'FUEL',   _sum: { amount: 500 } },
          { category: 'HASSAN', _sum: { amount: 400 } }, // person cat
        ]);
      }
      // by supplierId/supplierName
      return Promise.resolve([
        { supplierId: 7, supplierName: null, _sum: { amount: 500 } },
        { supplierId: null, supplierName: 'مورد حر', _sum: { amount: 400 } },
      ]);
    });
    mp.supplier.findMany.mockResolvedValue([{ id: 7, name: 'شركة الوقود' }]);

    const s = await expensesService.stats({});

    expect(s.count).toBe(3);
    expect(s.total).toBe(900);
    expect(s.pendingCount).toBe(1);
    expect(s.pendingTotal).toBe(200);
    expect(s.byCategory).toEqual({ FUEL: 500, HASSAN: 400 });
    // byCompanyGroup: HASSAN شخص، FUEL عمليات — نفس منطق التسمية السابق.
    expect(s.byCompanyGroup['عمليات']).toBe(500);
    expect(Object.values(s.byCompanyGroup).reduce((a, b) => a + b, 0)).toBe(900);
    // اسم المورد: مُعرَّف → اسمه؛ حرّ → نصّه.
    expect(s.bySupplier['شركة الوقود']).toBe(500);
    expect(s.bySupplier['مورد حر']).toBe(400);
  });

  it('applies the date filter inside the Prisma where (not in JS)', async () => {
    mp.expense.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } });
    mp.expense.groupBy.mockResolvedValue([]);

    await expensesService.stats({ from: '2024-01-01', to: '2024-12-31' });

    const totalAggWhere = mp.expense.aggregate.mock.calls[0][0].where;
    expect(totalAggWhere.date).toBeDefined();
    expect(totalAggWhere.date.gte).toBeInstanceOf(Date);
    expect(totalAggWhere.date.lte).toBeInstanceOf(Date);
  });

  // Date Boundary Consistency Pack v1: `to` must resolve to 23:59:59.999 of that
  // day, not midnight — else an expense dated later that day is excluded from
  // the period's totals, understating expense stats for the last day.
  it('resolves `to` to end-of-day (23:59:59.999)', async () => {
    mp.expense.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } });
    mp.expense.groupBy.mockResolvedValue([]);

    await expensesService.stats({ to: '2024-12-31' });

    const lte = mp.expense.aggregate.mock.calls[0][0].where.date.lte as Date;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
    expect(lte.getMilliseconds()).toBe(999);
  });
});
