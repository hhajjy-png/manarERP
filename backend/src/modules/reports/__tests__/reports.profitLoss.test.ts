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

  it('calls prisma.transaction.aggregate for revenue and expense', async () => {
    await reportsService.build('profit-loss', {});

    expect(vi.mocked(prisma.transaction.aggregate)).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(prisma.transaction.aggregate).mock.calls;
    const types = calls.map((c) => (c[0] as any).where?.type);
    expect(types).toContain('REVENUE');
    expect(types).toContain('EXPENSE');
  });

  it('does NOT call prisma.journalEntry for P&L — no GL mixing', async () => {
    await reportsService.build('profit-loss', {});

    expect(vi.mocked(prisma.journalEntry.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked((prisma.journalEntry as any).aggregate)).not.toHaveBeenCalled();
  });

  it('returns correct revenue and expense rows', async () => {
    vi.mocked(prisma.transaction.aggregate)
      .mockResolvedValueOnce({ _sum: { credit: 12000.000, debit: null } } as any) // REVENUE
      .mockResolvedValueOnce({ _sum: { credit: null, debit: 4500.000 } } as any); // EXPENSE

    const report = await reportsService.build('profit-loss', {});

    const revRow = report.rows.find((r) => String(r['item']).includes('إيراد'));
    const expRow = report.rows.find((r) => String(r['item']).includes('مصروف'));
    expect(revRow?.['amount']).toBeCloseTo(12000.000, 3);
    expect(expRow?.['amount']).toBeCloseTo(4500.000, 3);

    // totalsRow = net
    expect(report.totalsRow?.['amount']).toBeCloseTo(7500.000, 3);
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
});
