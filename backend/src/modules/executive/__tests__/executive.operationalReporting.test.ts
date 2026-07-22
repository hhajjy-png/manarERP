import { describe, it, expect, vi, beforeEach } from 'vitest';

// Operational Reporting Migration — Pack 4 — inverted invariant:
// Executive Decision Center's revenue/expenses/collections/receivables/net-profit must be
// sourced from the Operational Financial Engine (Invoice for revenue, APPROVED Expense for
// expenses, Payment for collections, Invoice+Payment for receivables), never the General
// Ledger. This makes Executive's headline financial KPIs consistent with Dashboard and the
// Profit & Loss report (Packs 2-3). This file locks the new single-source invariant in for
// decisionCenter()'s financialSummary and kpiTimeline()'s monthly series.

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { total: 0, paidAmount: 0 } }),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    expense: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    payment: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    contract: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    customer: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    // GL — must NEVER be touched by decisionCenter() or kpiTimeline() anymore:
    journalEntryLine: { aggregate: vi.fn() },
    journalEntry: { aggregate: vi.fn(), findMany: vi.fn() },
    // legacy ledger — must NEVER be touched either:
    transaction: { aggregate: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { ExecutiveService } from '../executive.service';

/** Sets invoice/expense/payment aggregates to fixed operational sums for every call. */
function mockOperational(revenue: number, expense: number, collected: number) {
  vi.mocked(prisma.invoice.aggregate).mockResolvedValue({
    _sum: { total: revenue, paidAmount: 0 },
  } as never);
  vi.mocked(prisma.expense.aggregate).mockResolvedValue({
    _sum: { amount: expense },
  } as never);
  vi.mocked(prisma.payment.aggregate).mockResolvedValue({
    _sum: { amount: collected },
  } as never);
}

describe('Executive Decision Center — single operational source, Pack 4', () => {
  let service: ExecutiveService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOperational(0, 0, 0);
    service = new ExecutiveService();
  });

  describe('decisionCenter() — financialSummary', () => {
    it('sources totalRevenue/totalExpenses/netProfit from the engine, never GL', async () => {
      mockOperational(10000, 4000, 0);

      const result = await service.decisionCenter();

      expect(result.financialSummary.totalRevenue).toBe(10000);
      expect(result.financialSummary.totalExpenses).toBe(4000);
      expect(result.financialSummary.netProfit).toBe(6000);
      expect(vi.mocked(prisma.journalEntryLine.aggregate)).not.toHaveBeenCalled();
      expect(vi.mocked((prisma.journalEntry as any).aggregate)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.transaction.aggregate)).not.toHaveBeenCalled();
    });

    it('reads revenue only from SALES invoices, excluding CANCELLED', async () => {
      mockOperational(1000, 0, 0);
      await service.decisionCenter();

      const revenueCall = vi.mocked(prisma.invoice.aggregate).mock.calls.find(
        (c) => (c[0] as any)?.where?.status?.not === 'CANCELLED',
      );
      expect(revenueCall).toBeDefined();
      const where = (revenueCall![0] as any).where;
      expect(where.direction).toBe('SALES');
      expect(where.status).toEqual({ not: 'CANCELLED' });
    });

    it('reads expenses only with status APPROVED', async () => {
      mockOperational(0, 500, 0);
      await service.decisionCenter();

      const approvedCalls = vi.mocked(prisma.expense.aggregate).mock.calls.filter(
        (c) => (c[0] as any).where?.status === 'APPROVED',
      );
      expect(approvedCalls.length).toBeGreaterThan(0);
    });

    it('sources totalCollected from Payment', async () => {
      mockOperational(0, 0, 750);
      const result = await service.decisionCenter();
      expect(result.financialSummary.totalCollected).toBe(750);
    });

    it('sources totalOutstanding from Invoice + Payment (point-in-time balance)', async () => {
      // revenue side = 5000, payments side = 2000 → outstanding = 3000
      vi.mocked(prisma.invoice.aggregate).mockResolvedValue({
        _sum: { total: 5000, paidAmount: 0 },
      } as never);
      vi.mocked(prisma.payment.aggregate).mockResolvedValue({
        _sum: { amount: 2000 },
      } as never);
      vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: 0 } } as never);

      const result = await service.decisionCenter();
      expect(result.financialSummary.totalOutstanding).toBe(3000);
    });

    it('payroll expenses (approved, entered via the Expense module) are included automatically — no category filter narrows the engine query', async () => {
      mockOperational(10000, 6000, 0); // 6000 may include an approved SALARIES-category row

      const result = await service.decisionCenter();

      expect(result.financialSummary.totalExpenses).toBe(6000);
      const engineExpenseCalls = vi.mocked(prisma.expense.aggregate).mock.calls.filter(
        (c) => (c[0] as any).where?.status === 'APPROVED',
      );
      expect(engineExpenseCalls.length).toBeGreaterThan(0);
      for (const call of engineExpenseCalls) {
        expect((call[0] as any).where.category).toBeUndefined();
      }
    });

    it('an empty database returns zero for every financial summary figure', async () => {
      mockOperational(0, 0, 0);
      const result = await service.decisionCenter();

      expect(result.financialSummary.totalRevenue).toBe(0);
      expect(result.financialSummary.totalExpenses).toBe(0);
      expect(result.financialSummary.totalCollected).toBe(0);
      expect(result.financialSummary.totalOutstanding).toBe(0);
      expect(result.financialSummary.netProfit).toBe(0);
    });
  });

  describe('kpiTimeline() — monthly chart', () => {
    it('uses the Operational Monthly P&L for revenue/expenses/profit, never GL', async () => {
      mockOperational(1000, 400, 0);

      const timeline = await service.kpiTimeline('3m');

      expect(timeline.length).toBe(3);
      for (const point of timeline) {
        expect(point.revenue).toBe(1000);
        expect(point.expenses).toBe(400);
        expect(point.profit).toBe(600);
      }
      expect(vi.mocked(prisma.journalEntryLine.aggregate)).not.toHaveBeenCalled();
      expect(vi.mocked((prisma.journalEntry as any).aggregate)).not.toHaveBeenCalled();
    });

    it('excludes cancelled invoices from every monthly revenue point', async () => {
      mockOperational(1000, 0, 0);
      await service.kpiTimeline('1m');

      const revenueCalls = vi.mocked(prisma.invoice.aggregate).mock.calls.filter(
        (c) => (c[0] as any)?.where?.direction === 'SALES',
      );
      expect(revenueCalls.length).toBeGreaterThan(0);
      for (const call of revenueCalls) {
        expect((call[0] as any).where.status).toEqual({ not: 'CANCELLED' });
      }
    });

    it('an empty database returns zero revenue/expenses/profit for every month', async () => {
      mockOperational(0, 0, 0);
      const timeline = await service.kpiTimeline('6m');

      expect(timeline.length).toBe(6);
      for (const point of timeline) {
        expect(point.revenue).toBe(0);
        expect(point.expenses).toBe(0);
        expect(point.profit).toBe(0);
      }
    });
  });
});
