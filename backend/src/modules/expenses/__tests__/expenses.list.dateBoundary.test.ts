import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Date Boundary Consistency Pack v1 — regression coverage for
 * ExpensesService.list(). Before this pack, `to` was converted with a bare
 * `new Date(query.to)` (midnight), silently dropping any expense dated later
 * on the final day of the range.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    expense: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    supplier: { findMany: vi.fn() },
  },
}));
vi.mock('../expenses.accounting', () => ({ repostExpenseToGL: vi.fn(), reverseExpenseFromGL: vi.fn() }));

import { ExpensesService } from '../expenses.service';
import { prisma } from '../../../config/database';
import { expectLocalRange, expectLocalEndOfDay, expectLocalStartOfDay } from '../../../core/utils/__tests__/localDayMatchers';

const mockPrisma = prisma as unknown as {
  expense: {
    findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn>;
  };
  supplier: { findMany: ReturnType<typeof vi.fn> };
};

describe('ExpensesService.list — date boundary', () => {
  let service: ExpensesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExpensesService();
    mockPrisma.expense.findMany.mockResolvedValue([]);
    mockPrisma.expense.count.mockResolvedValue(0);
  });

  it('resolves `to` to end-of-day (23:59:59.999), not midnight', async () => {
    await service.list({ to: '2025-12-31' });

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expectLocalEndOfDay(where.date.lte, '2025-12-31');
  });

  it('keeps both gte and lte bounds when from and to are both given', async () => {
    await service.list({ from: '2025-01-01', to: '2025-12-31' });

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expectLocalRange(where.date, '2025-01-01', '2025-12-31');
  });

  it('single-day range (from == to) covers the whole day', async () => {
    await service.list({ from: '2026-08-02', to: '2026-08-02' });

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expectLocalRange(where.date, '2026-08-02', '2026-08-02');
  });

  it('no bounds → no date filter at all (all periods)', async () => {
    await service.list({});
    expect(mockPrisma.expense.findMany.mock.calls[0][0].where.date).toBeUndefined();
  });

  it('only-from and only-to remain supported as partial bounds', async () => {
    await service.list({ from: '2026-08-01' });
    const fromOnly = mockPrisma.expense.findMany.mock.calls[0][0].where.date;
    expectLocalStartOfDay(fromOnly.gte, '2026-08-01');
    expect(fromOnly.lte).toBeUndefined();

    vi.clearAllMocks();
    mockPrisma.expense.findMany.mockResolvedValue([]);
    mockPrisma.expense.count.mockResolvedValue(0);

    await service.list({ to: '2026-08-31' });
    const toOnly = mockPrisma.expense.findMany.mock.calls[0][0].where.date;
    expectLocalEndOfDay(toOnly.lte, '2026-08-31');
    expect(toOnly.gte).toBeUndefined();
  });
});

/**
 * القائمة والإحصاء يقرآن نفس المدى. قبل التوحيد كان كلاهما يبني حدوده بنفسه،
 * فأي انحراف بينهما يعني جدولًا يعرض فترة وبطاقات إحصاء تعرض فترة أخرى.
 */
describe('ExpensesService.list vs stats — identical boundaries', () => {
  let service: ExpensesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExpensesService();
    mockPrisma.expense.findMany.mockResolvedValue([]);
    mockPrisma.expense.count.mockResolvedValue(0);
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
    mockPrisma.expense.groupBy.mockResolvedValue([]);
    mockPrisma.supplier.findMany.mockResolvedValue([]);
  });

  it('stats derives the same gte/lte instants as list for the same from/to', async () => {
    const range = { from: '2026-08-01', to: '2026-08-31' };

    await service.list(range);
    const listDate = mockPrisma.expense.findMany.mock.calls[0][0].where.date;

    await service.stats(range);
    const statsDate = mockPrisma.expense.aggregate.mock.calls[0][0].where.date;

    expect(statsDate.gte.getTime()).toBe(listDate.gte.getTime());
    expect(statsDate.lte.getTime()).toBe(listDate.lte.getTime());
    expectLocalRange(statsDate, '2026-08-01', '2026-08-31');
  });
});
