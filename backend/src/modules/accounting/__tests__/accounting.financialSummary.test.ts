import { describe, it, expect, vi, beforeEach } from 'vitest';

// Auto-generated referenceType values that must be excluded from GL informational totals
const AUTO_REFERENCE_TYPES = ['EXPENSE', 'EXPENSE_REVERSAL', 'INVOICE', 'PAYMENT'];

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice:      { aggregate: vi.fn() },
    expense:      { aggregate: vi.fn() },
    payment:      { aggregate: vi.fn() },
    journalEntry: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { accountingService } from '../accounting.service';

const defaultMocks = () => {
  vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _sum: { total: null, paidAmount: null } } as any);
  vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: null } } as any);
  vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: null } } as any);
  vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);
};

describe('financialSummary — double-counting prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultMocks();
  });

  // ── Blocker 2a: auto-generated GL entries are excluded from journal totals ──

  it('excludes EXPENSE journal entries from GL totals (already counted via Expense table)', async () => {
    await accountingService.financialSummary();

    const jeCalls = vi.mocked(prisma.journalEntry.findMany).mock.calls;
    expect(jeCalls.length).toBe(1);
    const where = (jeCalls[0][0] as any).where;
    expect(where.referenceType).toBeDefined();
    expect(where.referenceType.notIn).toEqual(expect.arrayContaining(AUTO_REFERENCE_TYPES));
  });

  it('excludes EXPENSE_REVERSAL entries from GL totals (reversed expense must not inflate GL debit)', async () => {
    await accountingService.financialSummary();

    const where = (vi.mocked(prisma.journalEntry.findMany).mock.calls[0][0] as any).where;
    expect(where.referenceType.notIn).toContain('EXPENSE_REVERSAL');
  });

  it('excludes INVOICE and PAYMENT entries from GL totals (already in invoice revenue)', async () => {
    await accountingService.financialSummary();

    const where = (vi.mocked(prisma.journalEntry.findMany).mock.calls[0][0] as any).where;
    expect(where.referenceType.notIn).toContain('INVOICE');
    expect(where.referenceType.notIn).toContain('PAYMENT');
  });

  // ── Blocker 2b: approved expense is in totalExpenses, not double-counted via GL ──

  it('totalExpenses comes from Expense table (APPROVED), not from journalEntry debit lines', async () => {
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: 500.000 } } as any);
    // GL would show 500 in EXPENSE entries, but those are excluded — journalEntry returns []
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);

    const result = await accountingService.financialSummary();

    expect(result.totalExpenses).toBeCloseTo(500.000, 3);
    expect(result.totalJournalDebit).toBe(0); // no manual entries
  });

  it('REVERSED expense does not inflate GL totals (EXPENSE_REVERSAL excluded)', async () => {
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: 300.000 } } as any);
    // Even if EXPENSE_REVERSAL entries existed, they'd be excluded from GL totals
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);

    const result = await accountingService.financialSummary();

    expect(result.totalJournalDebit).toBe(0);
    expect(result.totalExpenses).toBeCloseTo(300.000, 3);
  });

  it('MANUAL journal entries still appear in GL informational totals', async () => {
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      {
        id: 99,
        referenceType: 'MANUAL',
        lines: [
          { debit: 1000.000, credit: 0 },
          { debit: 0, credit: 1000.000 },
        ],
      },
    ] as any);

    const result = await accountingService.financialSummary();

    expect(result.journalEntryCount).toBe(1);
    expect(result.totalJournalDebit).toBeCloseTo(1000.000, 3);
    expect(result.totalJournalCredit).toBeCloseTo(1000.000, 3);
  });

  // ── Blocker 2c: invoice revenue / netProfit unaffected ──

  it('netProfit = paidAmount - totalExpenses (unaffected by GL exclusion)', async () => {
    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _sum: { total: 10000.000, paidAmount: 8000.000 } } as any);
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: 3000.000 } } as any);
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);

    const result = await accountingService.financialSummary();

    expect(result.totalRevenue).toBeCloseTo(10000.000, 3);
    expect(result.totalCollected).toBeCloseTo(8000.000, 3);
    expect(result.totalExpenses).toBeCloseTo(3000.000, 3);
    expect(result.netProfit).toBeCloseTo(5000.000, 3); // 8000 - 3000
  });

  it('date filters are applied to all sources when provided', async () => {
    await accountingService.financialSummary('2026-01-01', '2026-06-30');

    const invoiceCall = (vi.mocked(prisma.invoice.aggregate).mock.calls[0][0] as any).where;
    const expenseCall = (vi.mocked(prisma.expense.aggregate).mock.calls[0][0] as any).where;
    const jeCall     = (vi.mocked(prisma.journalEntry.findMany).mock.calls[0][0] as any).where;

    expect(invoiceCall.issueDate).toBeDefined();
    expect(expenseCall.date).toBeDefined();
    expect(jeCall.date).toBeDefined();
  });
});
