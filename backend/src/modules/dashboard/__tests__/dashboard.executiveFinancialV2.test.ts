import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    payment:  { aggregate: vi.fn() },
    expense:  { aggregate: vi.fn(), groupBy: vi.fn() },
    invoice:  { findMany: vi.fn(), groupBy: vi.fn() },
    contract: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { dashboardService } from '../dashboard.service';

const mockPrisma = prisma as unknown as {
  payment:  { aggregate: ReturnType<typeof vi.fn> };
  expense:  { aggregate: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
  invoice:  { findMany: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
  contract: { findMany: ReturnType<typeof vi.fn> };
};

function emptyAgg() { return { _sum: { amount: null } }; }

function makeInvoice(override = {}) {
  return {
    customerId: 1,
    total: 1000,
    paidAmount: 0,
    issueDate: new Date(),
    customer: { id: 1, name: 'عميل الاختبار' },
    ...override,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults — all empty
  mockPrisma.payment.aggregate.mockResolvedValue(emptyAgg());
  mockPrisma.expense.aggregate.mockResolvedValue(emptyAgg());
  mockPrisma.expense.groupBy.mockResolvedValue([]);
  mockPrisma.invoice.findMany.mockResolvedValue([]);
  mockPrisma.invoice.groupBy.mockResolvedValue([]);
  mockPrisma.contract.findMany.mockResolvedValue([]);
});

describe('executiveFinancialV2', () => {

  it('returns all required top-level keys', async () => {
    const result = await dashboardService.executiveFinancialV2();

    expect(result).toHaveProperty('collectionsThisMonth');
    expect(result).toHaveProperty('expensesThisMonth');
    expect(result).toHaveProperty('topDebtors');
    expect(result).toHaveProperty('agingSummary');
    expect(result).toHaveProperty('collectionTrend');
    expect(result).toHaveProperty('topProfitableContracts');
    expect(result).toHaveProperty('lowestProfitContracts');
    expect(result).toHaveProperty('financialAlerts');
  });

  it('empty database returns zeros safely — no NaN or Infinity', async () => {
    const result = await dashboardService.executiveFinancialV2();

    expect(result.collectionsThisMonth).toBe(0);
    expect(result.expensesThisMonth).toBe(0);
    expect(result.topDebtors).toHaveLength(0);
    expect(result.agingSummary.totalOutstanding).toBe(0);
    expect(result.topProfitableContracts).toHaveLength(0);
    expect(result.collectionTrend).toHaveLength(6);

    // Verify no NaN / Infinity in numeric fields
    for (const entry of result.collectionTrend) {
      expect(Number.isFinite(entry.collected)).toBe(true);
    }
    expect(Number.isFinite(result.agingSummary.bucket0_30)).toBe(true);
    expect(Number.isFinite(result.agingSummary.bucket90Plus)).toBe(true);
  });

  it('topDebtors sorted by outstanding descending, limited to 5', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ customerId: 1, total: 3000, paidAmount: 0, customer: { id: 1, name: 'أ' } }),
      makeInvoice({ customerId: 2, total: 9000, paidAmount: 0, customer: { id: 2, name: 'ب' } }),
      makeInvoice({ customerId: 3, total: 500,  paidAmount: 0, customer: { id: 3, name: 'ج' } }),
      makeInvoice({ customerId: 4, total: 7000, paidAmount: 0, customer: { id: 4, name: 'د' } }),
      makeInvoice({ customerId: 5, total: 1500, paidAmount: 0, customer: { id: 5, name: 'ه' } }),
      makeInvoice({ customerId: 6, total: 200,  paidAmount: 0, customer: { id: 6, name: 'و' } }),
    ]);

    const result = await dashboardService.executiveFinancialV2();

    expect(result.topDebtors).toHaveLength(5);
    expect(result.topDebtors[0].outstanding).toBeCloseTo(9000, 3); // ب first
    expect(result.topDebtors[1].outstanding).toBeCloseTo(7000, 3); // د second
    expect(result.topDebtors[2].outstanding).toBeCloseTo(3000, 3); // أ third
  });

  it('aging buckets computed correctly by days since issueDate', async () => {
    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ customerId: 1, total: 1000, paidAmount: 0, issueDate: daysAgo(15), customer: { id: 1, name: 'أ' } }), // 0-30
      makeInvoice({ customerId: 2, total: 2000, paidAmount: 0, issueDate: daysAgo(45), customer: { id: 2, name: 'ب' } }), // 31-60
      makeInvoice({ customerId: 3, total: 3000, paidAmount: 0, issueDate: daysAgo(75), customer: { id: 3, name: 'ج' } }), // 61-90
      makeInvoice({ customerId: 4, total: 4000, paidAmount: 0, issueDate: daysAgo(100), customer: { id: 4, name: 'د' } }), // 90+
    ]);

    const result = await dashboardService.executiveFinancialV2();

    expect(result.agingSummary.bucket0_30).toBeCloseTo(1000, 3);
    expect(result.agingSummary.bucket31_60).toBeCloseTo(2000, 3);
    expect(result.agingSummary.bucket61_90).toBeCloseTo(3000, 3);
    expect(result.agingSummary.bucket90Plus).toBeCloseTo(4000, 3);
    expect(result.agingSummary.totalOutstanding).toBeCloseTo(10000, 3);
  });

  it('contract profitability sorted correctly — top profitable first', async () => {
    mockPrisma.contract.findMany.mockResolvedValue([
      { id: 1, code: 'C1', asphaltPlant: 'مصنع 1' },
      { id: 2, code: 'C2', asphaltPlant: 'مصنع 2' },
      { id: 3, code: 'C3', asphaltPlant: 'مصنع 3' },
    ]);
    mockPrisma.invoice.groupBy.mockResolvedValue([
      { contractId: 1, _sum: { total: 10000 } },
      { contractId: 2, _sum: { total: 8000 } },
      { contractId: 3, _sum: { total: 5000 } },
    ]);
    mockPrisma.expense.groupBy.mockResolvedValue([
      { contractId: 1, _sum: { amount: 2000 } }, // margin 80%
      { contractId: 2, _sum: { amount: 4000 } }, // margin 50%
      { contractId: 3, _sum: { amount: 4500 } }, // margin 10%
    ]);

    const result = await dashboardService.executiveFinancialV2();

    expect(result.topProfitableContracts[0].code).toBe('C1');
    expect(result.topProfitableContracts[0].profitMargin).toBeCloseTo(80, 1);
    expect(result.lowestProfitContracts[0].code).toBe('C3');
    expect(result.lowestProfitContracts[0].profitMargin).toBeCloseTo(10, 1);
  });

  it('fully paid invoice (paidAmount >= total) excluded from topDebtors and aging', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ customerId: 1, total: 5000, paidAmount: 5000, customer: { id: 1, name: 'أ' } }), // paid
      makeInvoice({ customerId: 2, total: 3000, paidAmount: 6000, customer: { id: 2, name: 'ب' } }), // overpaid
    ]);

    const result = await dashboardService.executiveFinancialV2();

    expect(result.topDebtors).toHaveLength(0);
    expect(result.agingSummary.totalOutstanding).toBe(0);
  });

  it('financialAlerts populated when bucket90Plus > 0', async () => {
    const now = new Date();
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({
        customerId: 1, total: 5000, paidAmount: 0,
        issueDate: new Date(now.getTime() - 100 * 86_400_000),
        customer: { id: 1, name: 'أ' },
      }),
    ]);

    const result = await dashboardService.executiveFinancialV2();

    const danger = result.financialAlerts.find((a) => a.type === 'aging_90plus');
    expect(danger).toBeDefined();
    expect(danger?.level).toBe('danger');
  });
});
