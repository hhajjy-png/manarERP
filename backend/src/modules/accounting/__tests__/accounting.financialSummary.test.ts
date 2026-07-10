import { describe, it, expect, vi, beforeEach } from 'vitest';

// Auto-generated referenceType values that must be excluded from GL informational totals
const AUTO_REFERENCE_TYPES = ['EXPENSE', 'EXPENSE_REVERSAL', 'INVOICE', 'PAYMENT'];

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice:          { aggregate: vi.fn() },
    expense:          { aggregate: vi.fn() },
    payment:          { aggregate: vi.fn() },
    // الإجماليات المحاسبية صارت تُجمَّع في قاعدة البيانات: aggregate على السطر + count للقيود.
    journalEntryLine: { aggregate: vi.fn() },
    journalEntry:     { count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { accountingService } from '../accounting.service';

const defaultMocks = () => {
  vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _sum: { total: null, paidAmount: null } } as any);
  vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: null } } as any);
  vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: null } } as any);
  vi.mocked(prisma.journalEntryLine.aggregate).mockResolvedValue({ _sum: { debit: null, credit: null } } as any);
  vi.mocked(prisma.journalEntry.count).mockResolvedValue(0 as any);
};

describe('financialSummary — double-counting prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultMocks();
  });

  // ── Blocker 2a: auto-generated GL entries are excluded from journal totals ──

  // الشرط الآن متداخل تحت علاقة journalEntry في aggregate على السطر.
  const lineAggWhere = () =>
    (vi.mocked(prisma.journalEntryLine.aggregate).mock.calls[0][0] as any).where.journalEntry;

  it('excludes EXPENSE journal entries from GL totals (already counted via Expense table)', async () => {
    await accountingService.financialSummary();

    expect(vi.mocked(prisma.journalEntryLine.aggregate).mock.calls.length).toBe(1);
    const je = lineAggWhere();
    expect(je.referenceType).toBeDefined();
    expect(je.referenceType.notIn).toEqual(expect.arrayContaining(AUTO_REFERENCE_TYPES));
  });

  it('excludes EXPENSE_REVERSAL entries from GL totals (reversed expense must not inflate GL debit)', async () => {
    await accountingService.financialSummary();
    expect(lineAggWhere().referenceType.notIn).toContain('EXPENSE_REVERSAL');
  });

  it('excludes INVOICE and PAYMENT entries from GL totals (already in invoice revenue)', async () => {
    await accountingService.financialSummary();
    expect(lineAggWhere().referenceType.notIn).toContain('INVOICE');
    expect(lineAggWhere().referenceType.notIn).toContain('PAYMENT');
  });

  // ── Blocker 2b: approved expense is in totalExpenses, not double-counted via GL ──

  it('totalExpenses comes from Expense table (APPROVED), not from journalEntry debit lines', async () => {
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: 500.000 } } as any);
    // GL EXPENSE entries excluded → line aggregate returns nulls
    const result = await accountingService.financialSummary();

    expect(result.totalExpenses).toBeCloseTo(500.000, 3);
    expect(result.totalJournalDebit).toBe(0); // no manual entries
  });

  it('REVERSED expense does not inflate GL totals (EXPENSE_REVERSAL excluded)', async () => {
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: 300.000 } } as any);
    const result = await accountingService.financialSummary();

    expect(result.totalJournalDebit).toBe(0);
    expect(result.totalExpenses).toBeCloseTo(300.000, 3);
  });

  it('MANUAL journal entries still appear in GL informational totals', async () => {
    // مجموع الأسطر يأتي من aggregate على مستوى قاعدة البيانات، وعدد القيود من count.
    vi.mocked(prisma.journalEntryLine.aggregate).mockResolvedValue({ _sum: { debit: 1000.000, credit: 1000.000 } } as any);
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(1 as any);

    const result = await accountingService.financialSummary();

    expect(result.journalEntryCount).toBe(1);
    expect(result.totalJournalDebit).toBeCloseTo(1000.000, 3);
    expect(result.totalJournalCredit).toBeCloseTo(1000.000, 3);
  });

  // ── Blocker 2c: invoice revenue / netProfit unaffected ──

  it('netProfit = paidAmount - totalExpenses (unaffected by GL exclusion)', async () => {
    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _sum: { total: 10000.000, paidAmount: 8000.000 } } as any);
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: 3000.000 } } as any);

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
    const jeCall     = (vi.mocked(prisma.journalEntryLine.aggregate).mock.calls[0][0] as any).where.journalEntry;

    expect(invoiceCall.issueDate).toBeDefined();
    expect(expenseCall.date).toBeDefined();
    expect(jeCall.date).toBeDefined();
  });
});
