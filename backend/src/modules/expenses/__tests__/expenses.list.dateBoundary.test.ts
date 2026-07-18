import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Date Boundary Consistency Pack v1 — regression coverage for
 * ExpensesService.list(). Before this pack, `to` was converted with a bare
 * `new Date(query.to)` (midnight), silently dropping any expense dated later
 * on the final day of the range.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    expense: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock('../expenses.accounting', () => ({ repostExpenseToGL: vi.fn(), reverseExpenseFromGL: vi.fn() }));

import { ExpensesService } from '../expenses.service';
import { prisma } from '../../../config/database';
import { endOfDay } from '../../../core/utils/dateWindows';

const mockPrisma = prisma as unknown as {
  expense: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
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
    const lte = where.date.lte as Date;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
    expect(lte.getMilliseconds()).toBe(999);
    expect(lte.getTime()).toBe(endOfDay(new Date('2025-12-31')).getTime());
  });

  it('keeps both gte and lte bounds when from and to are both given', async () => {
    await service.list({ from: '2025-01-01', to: '2025-12-31' });

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expect(where.date.gte).toEqual(new Date('2025-01-01'));
    expect(where.date.lte.getTime()).toBe(endOfDay(new Date('2025-12-31')).getTime());
  });
});
