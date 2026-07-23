import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    contract: { findMany: vi.fn() },
    invoice:  { groupBy: vi.fn() },
    expense:  { groupBy: vi.fn() },
    customer: { findMany: vi.fn() },
    // التحصيل صار من الدفعات (تعريف المحرك الوحيد) لا من لقطة paidAmount.
    payment:  { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { FinancialExecService } from '../financial-exec.service';

const svc = new FinancialExecService();

function resetMocks() {
  vi.mocked(prisma.contract.findMany).mockResolvedValue([]);
  vi.mocked(prisma.invoice.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.expense.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.customer.findMany).mockResolvedValue([]);
  vi.mocked(prisma.payment.findMany).mockResolvedValue([]);
}

beforeEach(() => { resetMocks(); });

describe('FinancialExecService.contractProfitability', () => {
  it('returns an array', async () => {
    const rows = await svc.contractProfitability();
    expect(Array.isArray(rows)).toBe(true);
  });

  it('each row has required fields', async () => {
    vi.mocked(prisma.contract.findMany).mockResolvedValue([
      { id: 1, code: 'C-001', asphaltPlant: 'Plant A', customer: { name: 'Test Customer' } },
    ] as any);
    vi.mocked(prisma.invoice.groupBy).mockResolvedValue([
      { contractId: 1, _sum: { total: 10000 } },
    ] as any);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([
      { amount: 8000, invoice: { contractId: 1 } },
    ] as any);
    vi.mocked(prisma.expense.groupBy).mockResolvedValue([
      { contractId: 1, _sum: { amount: 6000 } },
    ] as any);

    const rows = await svc.contractProfitability();
    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(typeof r.id).toBe('number');
    expect(typeof r.revenue).toBe('number');
    expect(typeof r.profit).toBe('number');
    expect(r.revenue).toBe(10000);
    expect(r.collected).toBe(8000);
    expect(r.expenses).toBe(6000);
    expect(r.profit).toBe(4000);
  });

  it('sorts by revenue descending', async () => {
    vi.mocked(prisma.contract.findMany).mockResolvedValue([
      { id: 1, code: 'C-001', asphaltPlant: 'Plant A', customer: null },
      { id: 2, code: 'C-002', asphaltPlant: 'Plant B', customer: null },
    ] as any);
    vi.mocked(prisma.invoice.groupBy).mockResolvedValue([
      { contractId: 1, _sum: { total: 5000 } },
      { contractId: 2, _sum: { total: 15000 } },
    ] as any);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([
      { amount: 3000, invoice: { contractId: 1 } },
      { amount: 12000, invoice: { contractId: 2 } },
    ] as any);

    const rows = await svc.contractProfitability();
    expect(rows[0].revenue).toBeGreaterThanOrEqual(rows[1].revenue);
  });

  it('returns null customerName when no customer', async () => {
    vi.mocked(prisma.contract.findMany).mockResolvedValue([
      { id: 1, code: 'C-001', asphaltPlant: 'Plant A', customer: null },
    ] as any);

    const rows = await svc.contractProfitability();
    expect(rows[0].customerName).toBeNull();
  });
});

describe('FinancialExecService.expenseBreakdown', () => {
  it('returns an empty array when no expenses', async () => {
    const rows = await svc.expenseBreakdown();
    expect(rows).toEqual([]);
  });

  it('returns rows in the order provided by the mock (sorted desc by Prisma orderBy)', async () => {
    // The service passes orderBy: { _sum: { amount: 'desc' } } to Prisma.
    // With a mock, Prisma returns data in whatever order we supply.
    // We verify the service passes through the order correctly.
    vi.mocked(prisma.expense.groupBy).mockResolvedValue([
      { category: 'SALARIES',  _sum: { amount: 20000 }, _count: { _all: 5 } },
      { category: 'FUEL',      _sum: { amount: 5000 },  _count: { _all: 10 } },
      { category: 'RENT',      _sum: { amount: 3000 },  _count: { _all: 3 } },
    ] as any);

    const rows = await svc.expenseBreakdown();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].total).toBeLessThanOrEqual(rows[i - 1].total);
    }
  });

  it('pct values sum to ~100', async () => {
    vi.mocked(prisma.expense.groupBy).mockResolvedValue([
      { category: 'FUEL',     _sum: { amount: 6000 }, _count: { _all: 5 } },
      { category: 'SALARIES', _sum: { amount: 4000 }, _count: { _all: 3 } },
    ] as any);

    const rows = await svc.expenseBreakdown();
    expect(rows.length).toBeGreaterThan(0);
    const sum = rows.reduce((a, r) => a + r.pct, 0);
    expect(sum).toBeCloseTo(100, 0);
  });

  it('each row has correct structure', async () => {
    vi.mocked(prisma.expense.groupBy).mockResolvedValue([
      { category: 'FUEL', _sum: { amount: 1000 }, _count: { _all: 2 } },
    ] as any);

    const rows = await svc.expenseBreakdown();
    expect(rows[0]).toMatchObject({ category: 'FUEL', total: 1000, count: 2, pct: 100 });
  });
});

describe('FinancialExecService.customerAnalytics', () => {
  it('returns an array', async () => {
    const rows = await svc.customerAnalytics();
    expect(Array.isArray(rows)).toBe(true);
  });

  it('computes outstanding correctly', async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      { id: 1, name: 'Customer A', code: 'CUST-001' },
    ] as any);
    vi.mocked(prisma.invoice.groupBy).mockResolvedValue([
      { customerId: 1, _sum: { total: 10000 }, _count: { _all: 5 } },
    ] as any);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([
      { amount: 7000, invoice: { customerId: 1 } },
    ] as any);

    const rows = await svc.customerAnalytics();
    expect(rows[0].outstanding).toBe(3000);
    expect(rows[0].invoiceCount).toBe(5);
  });

  it('returns null collectionRate when no revenue', async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      { id: 1, name: 'Customer A', code: 'CUST-001' },
    ] as any);

    const rows = await svc.customerAnalytics();
    expect(rows[0].collectionRate).toBeNull();
    expect(rows[0].revenue).toBe(0);
  });

  it('sorts by revenue descending', async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      { id: 1, name: 'Customer A', code: 'CUST-001' },
      { id: 2, name: 'Customer B', code: 'CUST-002' },
    ] as any);
    vi.mocked(prisma.invoice.groupBy).mockResolvedValue([
      { customerId: 1, _sum: { total: 5000 }, _count: { _all: 2 } },
      { customerId: 2, _sum: { total: 20000 }, _count: { _all: 8 } },
    ] as any);
    vi.mocked(prisma.payment.findMany).mockResolvedValue([
      { amount: 3000, invoice: { customerId: 1 } },
      { amount: 18000, invoice: { customerId: 2 } },
    ] as any);

    const rows = await svc.customerAnalytics();
    expect(rows[0].revenue).toBeGreaterThanOrEqual(rows[1].revenue);
  });
});
