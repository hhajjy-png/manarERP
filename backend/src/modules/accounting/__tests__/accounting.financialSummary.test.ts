import { describe, it, expect, vi, beforeEach } from 'vitest';

// Operational Reporting Migration — Pack 6 — inverted invariant:
// financialSummary() is now a HYBRID (per the Pack 5 audit, officially approved):
//   Operational KPIs (totalRevenue, totalExpenses, totalCollected, netProfit) come from
//   the Operational Financial Engine (Invoice / APPROVED Expense / Payment) — matching
//   Dashboard, Executive, and the P&L Report exactly (Packs 2-4).
//   Accounting KPIs (journalEntryCount, totalJournalDebit, totalJournalCredit) remain
//   exactly as they were — GL-sourced, unchanged, no operational equivalent exists.
// This file replaces the prior "GL single source" invariant (Accounting Integrity Pack
// v1), which this pack deliberately supersedes for the four operational fields only.

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { aggregate: vi.fn() },
    expense: { aggregate: vi.fn() },
    payment: { aggregate: vi.fn() },
    // Still used, but ONLY for supplier-payments (AP control account, untouched by this
    // pack) and the raw journal debit/credit grand totals — never for revenue/expense.
    journalEntryLine: { aggregate: vi.fn() },
    journalEntry: { count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { accountingService } from '../accounting.service';

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

/**
 * Routes journalEntryLine.aggregate calls by shape. Only two call shapes remain in
 * financialSummary() after Pack 6: the AP control-account flow (account.code '2000',
 * untouched) and the raw journal grand totals (no account filter, untouched).
 */
function mockJournalLines(m: { apDebit?: number; journalDebit?: number; journalCredit?: number } = {}) {
  vi.mocked(prisma.journalEntryLine.aggregate).mockImplementation((async (args: any) => {
    const code = args?.where?.account?.code;
    if (code === '2000') return { _sum: { debit: m.apDebit ?? 0, credit: 0 } }; // AP ← PURCHASE_PAYMENT
    return { _sum: { debit: m.journalDebit ?? 0, credit: m.journalCredit ?? 0 } }; // journal grand totals
  }) as never);
}

describe('financialSummary — hybrid: Operational KPIs + Accounting KPIs (Pack 6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOperational(0, 0, 0);
    mockJournalLines();
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(0 as never);
  });

  it('totalRevenue/totalExpenses come from Invoice/APPROVED Expense, not GL', async () => {
    mockOperational(10000, 3000, 0);
    const result = await accountingService.financialSummary();

    expect(result.totalRevenue).toBeCloseTo(10000, 3);
    expect(result.totalExpenses).toBeCloseTo(3000, 3);

    const invoiceCall = vi.mocked(prisma.invoice.aggregate).mock.calls.find(
      (c) => (c[0] as any)?.where?.status?.not === 'CANCELLED',
    );
    expect(invoiceCall).toBeDefined();
    expect((invoiceCall![0] as any).where.direction).toBe('SALES');

    const approvedExpenseCalls = vi.mocked(prisma.expense.aggregate).mock.calls.filter(
      (c) => (c[0] as any).where?.status === 'APPROVED',
    );
    expect(approvedExpenseCalls.length).toBeGreaterThan(0);

    // GL is never queried for revenue/expense account-type sums anymore.
    const glCalls = vi.mocked(prisma.journalEntryLine.aggregate).mock.calls;
    const glAccountTypes = glCalls.map((c: any) => c[0]?.where?.account?.type);
    expect(glAccountTypes).not.toContain('REVENUE');
    expect(glAccountTypes).not.toContain('EXPENSE');
  });

  it('totalCollected comes from Payment, not the GL AR control-account flow', async () => {
    mockOperational(0, 0, 4200);
    const result = await accountingService.financialSummary();

    expect(result.totalCollected).toBeCloseTo(4200, 3);

    // The old AR (code '1100') control-account query no longer exists in this function.
    const glCalls = vi.mocked(prisma.journalEntryLine.aggregate).mock.calls;
    const arCall = glCalls.find((c: any) => c[0]?.where?.account?.code === '1100');
    expect(arCall).toBeUndefined();
  });

  it('netProfit comes from the Operational Financial Engine (revenue − expenses)', async () => {
    // revenue 10000, expenses 3000, collected 8000 (collections must NOT leak into netProfit)
    mockOperational(10000, 3000, 8000);
    const result = await accountingService.financialSummary();

    expect(result.netProfit).toBeCloseTo(7000, 3); // 10000 − 3000, not 8000 − 3000
  });

  it('cancelled invoices never contribute to totalRevenue', async () => {
    mockOperational(5000, 0, 0);
    await accountingService.financialSummary();

    const invoiceCall = vi.mocked(prisma.invoice.aggregate).mock.calls.find(
      (c) => (c[0] as any)?.where?.status?.not === 'CANCELLED',
    );
    expect(invoiceCall).toBeDefined();
  });

  it('journalEntryCount / totalJournalDebit / totalJournalCredit still come from GL, unaffected by operational values', async () => {
    mockOperational(999999, 999999, 999999); // large operational values, must not leak into journal totals
    mockJournalLines({ journalDebit: 1000, journalCredit: 1000 });
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(3 as never);

    const result = await accountingService.financialSummary();

    expect(result.journalEntryCount).toBe(3);
    expect(result.totalJournalDebit).toBeCloseTo(1000, 3);
    expect(result.totalJournalCredit).toBeCloseTo(1000, 3);
  });

  it('an empty period returns zero for every operational and accounting field', async () => {
    mockOperational(0, 0, 0);
    mockJournalLines({ journalDebit: 0, journalCredit: 0 });
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(0 as never);

    const result = await accountingService.financialSummary();

    expect(result.totalRevenue).toBe(0);
    expect(result.totalExpenses).toBe(0);
    expect(result.totalCollected).toBe(0);
    expect(result.netProfit).toBe(0);
    expect(result.journalEntryCount).toBe(0);
    expect(result.totalJournalDebit).toBe(0);
    expect(result.totalJournalCredit).toBe(0);
    expect(result.totalPaymentsRecorded).toBe(0);
  });

  it('date filters scope both the operational engine calls and the retained GL queries', async () => {
    await accountingService.financialSummary('2026-01-01', '2026-06-30');

    const invoiceCall = vi.mocked(prisma.invoice.aggregate).mock.calls.find(
      (c) => (c[0] as any)?.where?.status?.not === 'CANCELLED',
    );
    expect((invoiceCall![0] as any).where.issueDate).toBeDefined();

    const expenseCall = vi.mocked(prisma.expense.aggregate).mock.calls.find(
      (c) => (c[0] as any).where?.status === 'APPROVED',
    );
    expect((expenseCall![0] as any).where.date).toBeDefined();

    const glCalls = vi.mocked(prisma.journalEntryLine.aggregate).mock.calls;
    expect(glCalls.length).toBeGreaterThan(0);
    for (const call of glCalls) {
      expect((call[0] as any).where?.journalEntry?.date).toBeDefined();
    }
    const countWhere = (vi.mocked(prisma.journalEntry.count).mock.calls[0][0] as any).where;
    expect(countWhere.date).toBeDefined();
  });
});
