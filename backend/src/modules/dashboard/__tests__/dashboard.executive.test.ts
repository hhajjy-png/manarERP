import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service (hoisted by vitest)
vi.mock('../../../config/database', () => ({
  prisma: {
    customer:   { count: vi.fn().mockResolvedValue(0) },
    contract:   { count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue({ _sum: { monthlyTransportValue: 0 } }) },
    invoice:    { count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _sum: { total: 0, paidAmount: 0 } }), findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]) },
    expense:    { aggregate: vi.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: 0 } }), findMany: vi.fn().mockResolvedValue([]) },
    employee:   { count: vi.fn().mockResolvedValue(0) },
    equipment:  { count: vi.fn().mockResolvedValue(0) },
    // Operational Reporting Migration — Pack 3: revenue/expense/net profit come from the
    // Operational Financial Engine (Invoice + APPROVED Expense + Payment), never GL.
    payment:    { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    attendance: { groupBy: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '../../../config/database';
import { dashboardService } from '../dashboard.service';

describe('Executive Dashboard — expenses KPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mocks to their default resolved values
    vi.mocked(prisma.customer.count).mockResolvedValue(0);
    vi.mocked(prisma.contract.count).mockResolvedValue(0);
    vi.mocked(prisma.contract.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.contract.findMany).mockResolvedValue([]);
    vi.mocked(prisma.contract.aggregate).mockResolvedValue({ _sum: { monthlyTransportValue: null } } as any);
    vi.mocked(prisma.invoice.count).mockResolvedValue(0);
    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _sum: { total: null, paidAmount: null } } as any);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
    vi.mocked(prisma.invoice.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: null } } as any);
    vi.mocked(prisma.expense.findMany).mockResolvedValue([]);
    vi.mocked(prisma.employee.count).mockResolvedValue(0);
    vi.mocked(prisma.equipment.count).mockResolvedValue(0);
    vi.mocked((prisma as any).payment.aggregate).mockResolvedValue({ _sum: { amount: null } } as any);
    vi.mocked(prisma.attendance.groupBy).mockResolvedValue([]);
  });

  it('queries expenses with status: APPROVED only — not all statuses', async () => {
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({
      _count: { _all: 3 },
      _sum: { amount: 1500.000 },
    } as any);

    const result = await dashboardService.executive();

    // Verify the expense aggregate was called with status: APPROVED
    const expenseCalls = vi.mocked(prisma.expense.aggregate).mock.calls;
    // Find the call that includes _count and _sum (the KPI aggregate — not a date-filtered one)
    const kpiCall = expenseCalls.find((c) => (c[0] as any).where?.status === 'APPROVED');
    expect(kpiCall).toBeDefined();
    expect((kpiCall![0] as any).where.status).toBe('APPROVED');
  });

  it('kpis.expenses reflects only APPROVED count and totalAmount', async () => {
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({
      _count: { _all: 2 },
      _sum: { amount: 800.500 },
    } as any);

    const result = await dashboardService.executive();

    expect(result.kpis.expenses.count).toBe(2);
    expect(result.kpis.expenses.totalAmount).toBeCloseTo(800.500, 3);
  });

  it('PENDING and REJECTED expenses do not inflate the kpi total', async () => {
    // The mock only returns what the query produces — with status:APPROVED filter applied,
    // PENDING/REJECTED rows are excluded at DB level.
    // This test verifies the where clause is present so the filter reaches the database.
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({
      _count: { _all: 1 },
      _sum: { amount: 200.000 }, // only 1 approved expense at 200
    } as any);

    const result = await dashboardService.executive();

    const kpiCall = vi.mocked(prisma.expense.aggregate).mock.calls.find(
      (c) => (c[0] as any).where?.status === 'APPROVED',
    );
    expect(kpiCall).toBeDefined();
    // The result must reflect only what the APPROVED-filtered query returned
    expect(result.kpis.expenses.totalAmount).toBeCloseTo(200.000, 3);
    expect(result.kpis.expenses.count).toBe(1);
  });
});
