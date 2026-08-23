import { describe, it, expect, vi, beforeEach } from 'vitest';

// Operational Reporting Migration — Pack 3 — inverted invariant:
// Dashboard revenue/expense/net-profit/trend must be sourced from the Operational
// Financial Engine (Invoice for revenue, APPROVED Expense for expenses, Payment for
// collections), never the General Ledger. GL was the source before this pack; the
// officially approved architecture decision moved all management/operational reporting
// off the GL — GL now serves only Journal Entries, Chart of Accounts, Trial Balance,
// and Accounting Audit/Review. This file locks the new single-source invariant in for
// overview(), monthlyTrend(), and executive()'s finance fields.

vi.mock('../../../config/database', () => ({
  prisma: {
    contract: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { monthlyTransportValue: 0 } }),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    customer: { count: vi.fn().mockResolvedValue(0) },
    employee: { count: vi.fn().mockResolvedValue(0) },
    equipment: { count: vi.fn().mockResolvedValue(0) },
    invoice: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { total: 0, paidAmount: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    expense: {
      aggregate: vi.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    attendance: { groupBy: vi.fn().mockResolvedValue([]) },
    // GL — must NEVER be touched by overview()/monthlyTrend()/executive() anymore:
    journalEntryLine: { aggregate: vi.fn() },
    journalEntry: { aggregate: vi.fn(), findMany: vi.fn() },
    // legacy ledger — must NEVER be touched either:
    transaction: { aggregate: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { dashboardService } from '../dashboard.service';

/** Sets the invoice/expense (and optionally payment) aggregates to fixed operational sums. */
function mockOperational(revenue: number, expense: number, collected = 0) {
  vi.mocked(prisma.invoice.aggregate).mockResolvedValue({
    _sum: { total: revenue, paidAmount: 0 },
    _count: { _all: 0 },
  } as never);
  vi.mocked(prisma.expense.aggregate).mockResolvedValue({
    _count: { _all: 0 },
    _sum: { amount: expense },
  } as never);
  vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: collected } } as never);
}

describe('Dashboard — single operational source (Invoice + Expense + Payment), Pack 3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOperational(0, 0);
    vi.mocked(prisma.contract.count).mockResolvedValue(0);
    vi.mocked(prisma.contract.aggregate).mockResolvedValue({ _sum: { monthlyTransportValue: 0 } } as never);
    vi.mocked(prisma.contract.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.contract.findMany).mockResolvedValue([]);
    vi.mocked(prisma.customer.count).mockResolvedValue(0);
    vi.mocked(prisma.employee.count).mockResolvedValue(0);
    vi.mocked(prisma.equipment.count).mockResolvedValue(0);
    vi.mocked(prisma.invoice.count).mockResolvedValue(0);
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
    vi.mocked(prisma.invoice.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.expense.findMany).mockResolvedValue([]);
    vi.mocked(prisma.attendance.groupBy).mockResolvedValue([]);
  });

  describe('overview()', () => {
    it('sources finance.totalRevenue/totalExpense/netProfit from Invoice/Expense, never GL', async () => {
      mockOperational(10000, 4000);

      const result = await dashboardService.overview();

      expect(result.finance.totalRevenue).toBe(10000);
      expect(result.finance.totalExpense).toBe(4000);
      expect(result.finance.netProfit).toBe(6000);
      expect(vi.mocked((prisma.journalEntryLine as any).aggregate)).not.toHaveBeenCalled();
      expect(vi.mocked((prisma.journalEntry as any).aggregate)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.transaction.aggregate)).not.toHaveBeenCalled();
    });

    it('reads revenue only from SALES invoices excluding CANCELLED', async () => {
      mockOperational(1000, 0);
      await dashboardService.overview();

      const revenueCall = vi.mocked(prisma.invoice.aggregate).mock.calls.find(
        (c) => (c[0] as any)?.where?.status?.not === 'CANCELLED',
      );
      expect(revenueCall).toBeDefined();
      const where = (revenueCall![0] as any).where;
      expect(where.direction).toBe('SALES');
      expect(where.status).toEqual({ not: 'CANCELLED' });
    });

    it('reads expenses only with status APPROVED', async () => {
      mockOperational(0, 500);
      await dashboardService.overview();

      const expenseCalls = vi.mocked(prisma.expense.aggregate).mock.calls;
      // every expense.aggregate call used for the finance figures must filter APPROVED
      const approvedCalls = expenseCalls.filter((c) => (c[0] as any).where?.status === 'APPROVED');
      expect(approvedCalls.length).toBeGreaterThan(0);
    });

    it('finance.monthlyExpense comes from the operational engine scoped to the current month', async () => {
      mockOperational(0, 250);
      const result = await dashboardService.overview();
      expect(result.finance.monthlyExpense).toBe(250);
    });

    it('an empty database returns zero for every finance figure', async () => {
      mockOperational(0, 0);
      const result = await dashboardService.overview();

      expect(result.finance.totalRevenue).toBe(0);
      expect(result.finance.totalExpense).toBe(0);
      expect(result.finance.netProfit).toBe(0);
      expect(result.finance.monthlyExpense).toBe(0);
    });
  });

  describe('monthlyTrend()', () => {
    it('uses the Operational Monthly P&L (Invoice/Expense), never GL', async () => {
      mockOperational(1000, 400);

      const trend = await dashboardService.monthlyTrend();

      expect(trend.length).toBeGreaterThan(0);
      for (const point of trend) {
        expect(point.revenue).toBe(1000);
        expect(point.expense).toBe(400);
      }
      expect(vi.mocked((prisma.journalEntryLine as any).aggregate)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.transaction.aggregate)).not.toHaveBeenCalled();
    });

    it('returns zero revenue/expense for an empty period', async () => {
      mockOperational(0, 0);
      const trend = await dashboardService.monthlyTrend();
      for (const point of trend) {
        expect(point.revenue).toBe(0);
        expect(point.expense).toBe(0);
      }
    });
  });

  describe('executive()', () => {
    it('sources kpis.finance.totalRevenue/totalExpense/netProfit from Invoice/Expense, never GL', async () => {
      mockOperational(8000, 3000);

      const result = await dashboardService.executive();

      expect(result.kpis.finance.totalRevenue).toBe(8000);
      expect(result.kpis.finance.totalExpense).toBe(3000);
      expect(result.kpis.finance.netProfit).toBe(5000);
      expect(vi.mocked((prisma.journalEntryLine as any).aggregate)).not.toHaveBeenCalled();
      expect(vi.mocked((prisma.journalEntry as any).aggregate)).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.transaction.aggregate)).not.toHaveBeenCalled();
    });

    it('trend uses the Operational Monthly P&L, matching monthlyTrend()\'s source', async () => {
      mockOperational(600, 200);
      const result = await dashboardService.executive();

      expect(result.trend.length).toBeGreaterThan(0);
      for (const point of result.trend) {
        expect(point.revenue).toBe(600);
        expect(point.expense).toBe(200);
      }
    });

    it('cancelled invoices never contribute to kpis.finance.totalRevenue', async () => {
      mockOperational(5000, 0);
      await dashboardService.executive();

      // مؤشّر الذمم صار هو الآخر مقيَّدًا بـ SALES (Hotfix Pack v1، البند 6)، فيلزم
      // تمييزه عن استعلام الإيراد: الذمم تفلتر بقائمة حالات (`in`)، والإيراد لا يفعل.
      const salesCalls = vi.mocked(prisma.invoice.aggregate).mock.calls.filter(
        (c) => (c[0] as any)?.where?.direction === 'SALES',
      );
      const revenueCall = salesCalls.find((c) => !(c[0] as any).where.status?.in);
      expect(revenueCall).toBeDefined();
      expect((revenueCall![0] as any).where.status).toEqual({ not: 'CANCELLED' });
    });

    it('«الدفعات المستحقة» مؤشّر ذمم عملاء — مقيَّد بفواتير البيع وحدها', async () => {
      mockOperational(5000, 0);
      await dashboardService.executive();

      const unpaidCall = vi.mocked(prisma.invoice.aggregate).mock.calls.find(
        (c) => (c[0] as any)?.where?.status?.in,
      );
      expect(unpaidCall).toBeDefined();
      expect((unpaidCall![0] as any).where.direction).toBe('SALES');

      // الدفعات المخصومة من المستحق تتبع المجموعة نفسها — لا فواتير موردين.
      const paymentCall = vi.mocked(prisma.payment.aggregate).mock.calls.find(
        (c) => (c[0] as any)?.where?.invoice?.status?.in,
      );
      expect(paymentCall).toBeDefined();
      expect((paymentCall![0] as any).where.invoice.direction).toBe('SALES');
    });

    it('payroll expenses (approved, entered via the Expense module) are included automatically — no category filter narrows the engine query', async () => {
      mockOperational(10000, 6000); // 6000 may include an approved SALARIES-category row
      const result = await dashboardService.executive();

      expect(result.kpis.finance.totalExpense).toBe(6000);
      const engineExpenseCalls = vi.mocked(prisma.expense.aggregate).mock.calls.filter(
        (c) => (c[0] as any).where?.status === 'APPROVED',
      );
      expect(engineExpenseCalls.length).toBeGreaterThan(0);
      for (const call of engineExpenseCalls) {
        expect((call[0] as any).where.category).toBeUndefined();
      }
    });

    it('an empty database returns zero for every finance KPI and every trend point', async () => {
      mockOperational(0, 0);
      const result = await dashboardService.executive();

      expect(result.kpis.finance.totalRevenue).toBe(0);
      expect(result.kpis.finance.totalExpense).toBe(0);
      expect(result.kpis.finance.netProfit).toBe(0);
      for (const point of result.trend) {
        expect(point.revenue).toBe(0);
        expect(point.expense).toBe(0);
      }
    });
  });
});
