import { describe, it, expect, vi, beforeEach } from 'vitest';

// Blocker 3: P&L must use Legacy Transactions ONLY — never JournalEntry.
// If both sources were mixed, every approved expense would be counted twice:
// once via transaction (type='EXPENSE') and once via journalEntry lines (EXPENSE/EXPENSE_REVERSAL).
// This test file locks that invariant in.

vi.mock('../../../config/database', () => ({
  prisma: {
    transaction:   { aggregate: vi.fn() },
    journalEntry:  { findMany: vi.fn(), aggregate: vi.fn() },
    // other models that build() routes to for non-profitLoss report types
    customer:   { findMany: vi.fn().mockResolvedValue([]) },
    contract:   { findMany: vi.fn().mockResolvedValue([]) },
    invoice:    { findMany: vi.fn().mockResolvedValue([]) },
    expense:    { findMany: vi.fn().mockResolvedValue([]) },
    equipment:  { findMany: vi.fn().mockResolvedValue([]) },
    employee:   { findMany: vi.fn().mockResolvedValue([]) },
    payroll:    { findMany: vi.fn().mockResolvedValue([]) },
    attendance: { findMany: vi.fn().mockResolvedValue([]) },
    supplier:   { findMany: vi.fn().mockResolvedValue([]) },
    projectPrice: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '../../../config/database';
import { reportsService } from '../reports.service';

describe('Profit & Loss — data source invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.transaction.aggregate).mockResolvedValue({ _sum: { credit: null, debit: null } } as any);
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);
    vi.mocked((prisma.journalEntry as any).aggregate).mockResolvedValue({ _sum: { debit: null, credit: null } });
  });

  it('calls prisma.transaction.aggregate for revenue and expense of every month in range', async () => {
    // نطاق شهرين → استعلامان (إيراد/مصروف) لكل شهر = 4 نداءات.
    const report = await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-02-28' });

    expect(vi.mocked(prisma.transaction.aggregate)).toHaveBeenCalledTimes(4);
    const calls = vi.mocked(prisma.transaction.aggregate).mock.calls;
    const types = calls.map((c) => (c[0] as any).where?.type);
    expect(types).toContain('REVENUE');
    expect(types).toContain('EXPENSE');
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]['month']).toBe('01/2026');
    expect(report.rows[1]['month']).toBe('02/2026');
  });

  it('does NOT call prisma.journalEntry for P&L — no GL mixing', async () => {
    await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-01-31' });

    expect(vi.mocked(prisma.journalEntry.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked((prisma.journalEntry as any).aggregate)).not.toHaveBeenCalled();
  });

  it('returns one row per month with revenue/expense/net, and a grand totals row', async () => {
    vi.mocked(prisma.transaction.aggregate)
      .mockResolvedValueOnce({ _sum: { credit: 12000.000, debit: null } } as any) // January REVENUE
      .mockResolvedValueOnce({ _sum: { credit: null, debit: 4500.000 } } as any) // January EXPENSE
      .mockResolvedValueOnce({ _sum: { credit: 8000.000, debit: null } } as any) // February REVENUE
      .mockResolvedValueOnce({ _sum: { credit: null, debit: 2000.000 } } as any); // February EXPENSE

    const report = await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-02-28' });

    expect(report.columns.map((c) => c.key)).toEqual(['month', 'revenue', 'expense', 'net']);
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toMatchObject({ month: '01/2026', revenue: 12000, expense: 4500, net: 7500 });
    expect(report.rows[1]).toMatchObject({ month: '02/2026', revenue: 8000, expense: 2000, net: 6000 });

    // صف إجمالي واحد فقط في نهاية التقرير — بلا مجاميع فرعية شهرية.
    expect(report.totalsRow).toMatchObject({ month: 'الإجمالي', revenue: 20000, expense: 6500, net: 13500 });
  });

  it('applying a date range passes the filter to transaction queries only', async () => {
    await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-06-30' });

    const calls = vi.mocked(prisma.transaction.aggregate).mock.calls;
    for (const call of calls) {
      const where = (call[0] as any).where;
      expect(where.date).toBeDefined();
    }
    // journalEntry still not touched
    expect(vi.mocked(prisma.journalEntry.findMany)).not.toHaveBeenCalled();
  });

  it('falls back to the earliest/latest transaction dates when no range is given', async () => {
    (vi.mocked(prisma.transaction.aggregate) as unknown as { mockImplementation: (fn: (args: any) => Promise<any>) => void }).mockImplementation(async (args: any) => {
      if (args?._min || args?._max) {
        return { _min: { date: new Date(2026, 0, 15) }, _max: { date: new Date(2026, 1, 10) } };
      }
      return { _sum: { credit: null, debit: null } };
    });

    const report = await reportsService.build('profit-loss', {});

    expect(report.rows.map((r) => r['month'])).toEqual(['01/2026', '02/2026']);
  });
});
