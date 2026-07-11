import { describe, it, expect, vi, beforeEach } from 'vitest';

// Computed aggregate + count remain the primary stats queries; the unified read
// model additionally consults salaryPayment (imported transfers). An empty imported
// register keeps the computed totals unchanged (imported branch returns [] early).
vi.mock('../../../config/database', () => ({
  prisma: {
    payroll: {
      aggregate: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    salaryPayment: {
      findMany: vi.fn(),
    },
    employee: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../../config/database';
import { payrollService } from '../payroll.service';

const agg = prisma.payroll.aggregate as unknown as ReturnType<typeof vi.fn>;
const count = prisma.payroll.count as unknown as ReturnType<typeof vi.fn>;
const salaryPaymentFindMany = prisma.salaryPayment.findMany as unknown as ReturnType<typeof vi.fn>;

describe('PayrollService.stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 13 non-cancelled rows (> one page of 12), 4 of them paid.
    agg.mockResolvedValue({ _sum: { grossSalary: 5000, netSalary: 4200 }, _count: { _all: 13 } });
    count.mockResolvedValue(4);
    // No imported salary transfers for the period by default.
    salaryPaymentFindMany.mockResolvedValue([]);
  });

  it('aggregates across the full filtered dataset and excludes CANCELLED by default', async () => {
    const result = await payrollService.stats({ month: '6', year: '2026' });

    // Computed aggregate is still driven by month/year + CANCELLED-excluded where.
    expect(agg).toHaveBeenCalledOnce();
    const where = agg.mock.calls[0][0].where;
    expect(where.month).toBe(6);
    expect(where.year).toBe(2026);
    expect(where.status).toEqual({ not: 'CANCELLED' });

    // Additive imported fields present and zero when the register is empty.
    expect(result).toEqual({ count: 13, gross: 5000, net: 4200, paid: 4, importedCount: 0, importedNet: 0, grossIsPartial: false });
  });

  it('reports counts independent of pagination (same result regardless of page)', async () => {
    // stats() takes no page param; two identical filter calls must yield identical totals.
    const a = await payrollService.stats({ month: '6', year: '2026' });
    const b = await payrollService.stats({ month: '6', year: '2026' });
    expect(a).toEqual(b);
  });

  it('counts PAID payrolls via a dedicated status=PAID count query in the same period scope', async () => {
    await payrollService.stats({ month: '6', year: '2026', employeeId: '7' });
    const paidWhere = count.mock.calls[0][0].where;
    expect(paidWhere.status).toBe('PAID');
    expect(paidWhere.month).toBe(6);
    expect(paidWhere.year).toBe(2026);
    expect(paidWhere.employeeId).toBe(7);
  });

  it('honours an explicit status filter for the totals', async () => {
    await payrollService.stats({ month: '6', year: '2026', status: 'APPROVED' });
    expect(agg.mock.calls[0][0].where.status).toBe('APPROVED');
  });

  it('honours an explicit CANCELLED filter (no not-filter applied)', async () => {
    await payrollService.stats({ month: '6', year: '2026', status: 'CANCELLED' });
    expect(agg.mock.calls[0][0].where.status).toBe('CANCELLED');
  });

  it('applies the employeeId filter to the aggregate', async () => {
    await payrollService.stats({ employeeId: '7' });
    expect(agg.mock.calls[0][0].where.employeeId).toBe(7);
  });

  it('rounds sums to KWD 3dp and treats null sums as 0', async () => {
    agg.mockResolvedValue({ _sum: { grossSalary: 100.12345, netSalary: null }, _count: { _all: 2 } });
    count.mockResolvedValue(0);

    const result = await payrollService.stats({ month: '6', year: '2026' });
    expect(result.gross).toBeCloseTo(100.123, 3);
    expect(result.net).toBe(0);
    expect(result.count).toBe(2);
    expect(result.paid).toBe(0);
  });
});
