import { describe, it, expect, vi, beforeEach } from 'vitest';

// Accounting Integrity Pack v1 — financialSummary is now sourced from the GENERAL LEDGER,
// accrual basis. Revenue/expense/net come from GL account-type sums (glProfitAndLoss); the
// old operational-table computation (Invoice/Expense/Payment) with a cash-flavored
// netProfit was retired because it produced a parallel figure that diverged from the
// trial balance. This file locks the GL-single-source, accrual behavior in.

vi.mock('../../../config/database', () => ({
  prisma: {
    journalEntryLine: { aggregate: vi.fn() },
    journalEntry:     { count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { accountingService } from '../accounting.service';

interface LineMock {
  revenueCredit?: number; revenueDebit?: number;
  expenseDebit?: number;  expenseCredit?: number;
  arCredit?: number;      apDebit?: number;
  journalDebit?: number;  journalCredit?: number;
}

/** Route each journalEntryLine.aggregate call to the right figure by its where-clause. */
function mockLines(m: LineMock = {}) {
  vi.mocked(prisma.journalEntryLine.aggregate).mockImplementation((async (args: any) => {
    const w = args?.where ?? {};
    const type = w.account?.type;
    const code = w.account?.code;
    if (type === 'REVENUE') return { _sum: { credit: m.revenueCredit ?? 0, debit: m.revenueDebit ?? 0 } } as any;
    if (type === 'EXPENSE') return { _sum: { debit: m.expenseDebit ?? 0, credit: m.expenseCredit ?? 0 } } as any;
    if (code === '1100')    return { _sum: { credit: m.arCredit ?? 0, debit: 0 } } as any; // AR ← PAYMENT
    if (code === '2000')    return { _sum: { debit: m.apDebit ?? 0, credit: 0 } } as any;  // AP ← PURCHASE_PAYMENT
    // journal grand totals (no account filter)
    return { _sum: { debit: m.journalDebit ?? 0, credit: m.journalCredit ?? 0 } } as any;
  }) as any);
}

describe('financialSummary — single accounting source (GL, accrual)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLines();
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(0 as any);
  });

  it('revenue and expenses come from the GL (account-type sums), not operational tables', async () => {
    mockLines({ revenueCredit: 10000, expenseDebit: 3000 });
    const result = await accountingService.financialSummary();

    expect(result.totalRevenue).toBeCloseTo(10000, 3);
    expect(result.totalExpenses).toBeCloseTo(3000, 3);

    // GL account-type aggregates were used, filtered to POSTED entries.
    const calls = vi.mocked(prisma.journalEntryLine.aggregate).mock.calls;
    const types = calls.map((c: any) => c[0]?.where?.account?.type);
    expect(types).toContain('REVENUE');
    expect(types).toContain('EXPENSE');
    const statuses = calls.map((c: any) => c[0]?.where?.journalEntry?.status);
    expect(statuses.every((s: string) => s === 'POSTED')).toBe(true);
  });

  it('netProfit is ACCRUAL (revenue − expenses), not cash (collected − expenses)', async () => {
    // revenue invoiced 10000, collected only 8000, expenses 3000.
    mockLines({ revenueCredit: 10000, expenseDebit: 3000, arCredit: 8000 });
    const result = await accountingService.financialSummary();

    expect(result.netProfit).toBeCloseTo(7000, 3); // 10000 − 3000 (accrual), NOT 8000 − 3000
    expect(result.totalCollected).toBeCloseTo(8000, 3);
  });

  it('reversal entries net out automatically on revenue/expense accounts', async () => {
    // a reversed invoice leaves a debit on the revenue account that nets the credit down.
    mockLines({ revenueCredit: 10000, revenueDebit: 2000, expenseDebit: 3000, expenseCredit: 500 });
    const result = await accountingService.financialSummary();

    expect(result.totalRevenue).toBeCloseTo(8000, 3);  // 10000 − 2000
    expect(result.totalExpenses).toBeCloseTo(2500, 3); // 3000 − 500
    expect(result.netProfit).toBeCloseTo(5500, 3);
  });

  it('totalCollected = customer collections (AR credit on PAYMENT entries)', async () => {
    mockLines({ arCredit: 4200 });
    const result = await accountingService.financialSummary();
    expect(result.totalCollected).toBeCloseTo(4200, 3);
  });

  it('exposes GL grand totals and the posted-entry count', async () => {
    mockLines({ journalDebit: 1000, journalCredit: 1000 });
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(3 as any);
    const result = await accountingService.financialSummary();

    expect(result.journalEntryCount).toBe(3);
    expect(result.totalJournalDebit).toBeCloseTo(1000, 3);
    expect(result.totalJournalCredit).toBeCloseTo(1000, 3);
  });

  it('date filters scope every GL query to the period', async () => {
    await accountingService.financialSummary('2026-01-01', '2026-06-30');

    const calls = vi.mocked(prisma.journalEntryLine.aggregate).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect((call[0] as any).where?.journalEntry?.date).toBeDefined();
    }
    const countWhere = (vi.mocked(prisma.journalEntry.count).mock.calls[0][0] as any).where;
    expect(countWhere.date).toBeDefined();
  });
});
