import { describe, it, expect, vi, beforeEach } from 'vitest';

// Accounting Integrity Pack v1 — inverted invariant:
// P&L must be sourced from the GENERAL LEDGER (double-entry JournalEntry), never the
// legacy single-entry Transaction table. The legacy ledger was retired as an accounting
// source; reading it produced a parallel figure (e.g. missing payroll) that diverged from
// the trial balance and dashboard. This file locks the single-source invariant in.

vi.mock('../../../config/database', () => ({
  prisma: {
    // GL is the source now:
    journalEntryLine: { aggregate: vi.fn() },
    journalEntry:     { aggregate: vi.fn(), findMany: vi.fn() },
    // legacy ledger — must NEVER be touched for P&L:
    transaction:      { aggregate: vi.fn() },
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

/** Mock the GL line aggregate to yield fixed revenue/expense per month, keyed by account type. */
function mockGL(revenue: number, expense: number) {
  vi.mocked((prisma.journalEntryLine as any).aggregate).mockImplementation(async (args: any) => {
    const type = args?.where?.account?.type;
    if (type === 'REVENUE') return { _sum: { credit: revenue, debit: 0 } };
    if (type === 'EXPENSE') return { _sum: { debit: expense, credit: 0 } };
    return { _sum: { debit: 0, credit: 0 } };
  });
}

describe('Profit & Loss — single accounting source (GL)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGL(0, 0);
    vi.mocked((prisma.journalEntry as any).aggregate).mockResolvedValue({ _min: { date: null }, _max: { date: null } });
  });

  it('sources P&L from the GL (journalEntryLine.aggregate), never the legacy transaction table', async () => {
    const report = await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-02-28' });

    // GL is queried; legacy ledger is not.
    expect(vi.mocked((prisma.journalEntryLine as any).aggregate)).toHaveBeenCalled();
    expect(vi.mocked(prisma.transaction.aggregate)).not.toHaveBeenCalled();

    // two months in range → two GL REVENUE + two GL EXPENSE aggregates
    expect(vi.mocked((prisma.journalEntryLine as any).aggregate)).toHaveBeenCalledTimes(4);
    const types = vi.mocked((prisma.journalEntryLine as any).aggregate).mock.calls
      .map((c: any) => c[0]?.where?.account?.type);
    expect(types).toContain('REVENUE');
    expect(types).toContain('EXPENSE');
    // only POSTED journal entries are counted
    const statuses = vi.mocked((prisma.journalEntryLine as any).aggregate).mock.calls
      .map((c: any) => c[0]?.where?.journalEntry?.status);
    expect(statuses.every((s: string) => s === 'POSTED')).toBe(true);

    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]['month']).toBe('01/2026');
    expect(report.rows[1]['month']).toBe('02/2026');
  });

  it('returns one row per month with revenue/expense/net from GL, and a grand totals row', async () => {
    mockGL(12000, 4500); // each month: revenue 12000, expense 4500 → net 7500

    const report = await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-02-28' });

    expect(report.columns.map((c) => c.key)).toEqual(['month', 'revenue', 'expense', 'net']);
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toMatchObject({ month: '01/2026', revenue: 12000, expense: 4500, net: 7500 });
    expect(report.rows[1]).toMatchObject({ month: '02/2026', revenue: 12000, expense: 4500, net: 7500 });
    expect(report.totalsRow).toMatchObject({ month: 'الإجمالي', revenue: 24000, expense: 9000, net: 15000 });
  });

  it('applying a date range scopes the GL aggregates and never touches the legacy ledger', async () => {
    await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-06-30' });

    for (const call of vi.mocked((prisma.journalEntryLine as any).aggregate).mock.calls) {
      const date = (call[0] as any).where?.journalEntry?.date;
      expect(date).toBeDefined();
    }
    expect(vi.mocked(prisma.transaction.aggregate)).not.toHaveBeenCalled();
  });

  it('falls back to the earliest/latest POSTED journal dates when no range is given', async () => {
    vi.mocked((prisma.journalEntry as any).aggregate).mockResolvedValue({
      _min: { date: new Date(2026, 0, 15) },
      _max: { date: new Date(2026, 1, 10) },
    });

    const report = await reportsService.build('profit-loss', {});

    expect(report.rows.map((r) => r['month'])).toEqual(['01/2026', '02/2026']);
    // bounds come from the journal, not the legacy transaction table
    expect(vi.mocked(prisma.transaction.aggregate)).not.toHaveBeenCalled();
  });
});
