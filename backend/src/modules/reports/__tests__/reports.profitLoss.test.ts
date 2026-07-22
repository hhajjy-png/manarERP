import { describe, it, expect, vi, beforeEach } from 'vitest';

// Operational Reporting Migration — Pack 2 — inverted invariant:
// P&L must be sourced from the OPERATIONAL FINANCIAL ENGINE (Invoice for revenue,
// APPROVED Expense for expenses), never the General Ledger. GL was the source before
// this pack (Accounting Integrity Pack v1) but the officially approved architecture
// decision moved all management/operational reporting off the GL — GL now serves only
// Journal Entries, Chart of Accounts, Trial Balance, and Accounting Audit/Review. This
// file locks the new single-source invariant in, exactly as its predecessor locked in
// the GL invariant it is now replacing.

vi.mock('../../../config/database', () => ({
  prisma: {
    // Operational Financial Engine is the source now:
    invoice: { aggregate: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    expense: { aggregate: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    // GL — must NEVER be touched for this report anymore:
    journalEntryLine: { aggregate: vi.fn() },
    journalEntry: { aggregate: vi.fn(), findMany: vi.fn() },
    // legacy ledger — must NEVER be touched either:
    transaction: { aggregate: vi.fn() },
    // other models that build() routes to for non-profitLoss report types
    customer: { findMany: vi.fn().mockResolvedValue([]) },
    contract: { findMany: vi.fn().mockResolvedValue([]) },
    equipment: { findMany: vi.fn().mockResolvedValue([]) },
    employee: { findMany: vi.fn().mockResolvedValue([]) },
    payroll: { findMany: vi.fn().mockResolvedValue([]) },
    attendance: { findMany: vi.fn().mockResolvedValue([]) },
    supplier: { findMany: vi.fn().mockResolvedValue([]) },
    projectPrice: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '../../../config/database';
import { reportsService } from '../reports.service';

/** Mock Invoice/Expense aggregates to yield a fixed revenue/expense per call. */
function mockOperational(revenue: number, expense: number) {
  vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _sum: { total: revenue } } as never);
  vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: expense } } as never);
}

describe('Profit & Loss — single operational source (Invoice + Expense)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOperational(0, 0);
  });

  it('sources P&L from the Operational Financial Engine, never GL or the legacy ledger', async () => {
    const report = await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-02-28' });

    // Operational tables are queried; GL and the legacy ledger are not.
    expect(vi.mocked(prisma.invoice.aggregate)).toHaveBeenCalled();
    expect(vi.mocked(prisma.expense.aggregate)).toHaveBeenCalled();
    expect(vi.mocked((prisma.journalEntryLine as any).aggregate)).not.toHaveBeenCalled();
    expect(vi.mocked((prisma.journalEntry as any).aggregate)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.transaction.aggregate)).not.toHaveBeenCalled();

    // two months in range → two revenue (Invoice) + two expense (Expense) aggregates
    expect(vi.mocked(prisma.invoice.aggregate)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prisma.expense.aggregate)).toHaveBeenCalledTimes(2);

    // revenue reads SALES invoices only, excluding CANCELLED
    for (const call of vi.mocked(prisma.invoice.aggregate).mock.calls) {
      const where = (call[0] as any).where;
      expect(where.direction).toBe('SALES');
      expect(where.status).toEqual({ not: 'CANCELLED' });
    }
    // expenses read only the single official operational status: APPROVED
    for (const call of vi.mocked(prisma.expense.aggregate).mock.calls) {
      expect((call[0] as any).where.status).toBe('APPROVED');
    }

    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]['month']).toBe('01/2026');
    expect(report.rows[1]['month']).toBe('02/2026');
  });

  it('returns one row per month with revenue/expense/net from the engine, and a grand totals row', async () => {
    mockOperational(12000, 4500); // each month: revenue 12000, expense 4500 → net 7500

    const report = await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-02-28' });

    expect(report.columns.map((c) => c.key)).toEqual(['month', 'revenue', 'expense', 'net']);
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toMatchObject({ month: '01/2026', revenue: 12000, expense: 4500, net: 7500 });
    expect(report.rows[1]).toMatchObject({ month: '02/2026', revenue: 12000, expense: 4500, net: 7500 });
    expect(report.totalsRow).toMatchObject({ month: 'الإجمالي', revenue: 24000, expense: 9000, net: 15000 });
  });

  it('grand totals equal the sum of the monthly values, not an independently recomputed figure', async () => {
    // Different revenue/expense per month would defeat a naive "reduce" bug — use varying
    // mock returns across sequential calls to prove totals are additive, not re-derived.
    let call = 0;
    vi.mocked(prisma.invoice.aggregate).mockImplementation((async () => {
      call += 1;
      return { _sum: { total: call === 1 ? 1000 : 2000 } };
    }) as never);
    let expCall = 0;
    vi.mocked(prisma.expense.aggregate).mockImplementation((async () => {
      expCall += 1;
      return { _sum: { amount: expCall === 1 ? 300 : 700 } };
    }) as never);

    const report = await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-02-28' });

    expect(report.rows[0]).toMatchObject({ revenue: 1000, expense: 300, net: 700 });
    expect(report.rows[1]).toMatchObject({ revenue: 2000, expense: 700, net: 1300 });
    expect(report.totalsRow).toMatchObject({ revenue: 3000, expense: 1000, net: 2000 });
  });

  it('an empty period (no revenue, no expenses) returns zero for every month and the totals row', async () => {
    mockOperational(0, 0);

    const report = await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-01-31' });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ revenue: 0, expense: 0, net: 0 });
    expect(report.totalsRow).toMatchObject({ revenue: 0, expense: 0, net: 0 });
  });

  it('cancelled invoices never contribute — the exclusion is enforced in the aggregate filter itself', async () => {
    mockOperational(5000, 0);
    await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-01-31' });

    const where = vi.mocked(prisma.invoice.aggregate).mock.calls[0][0].where as any;
    expect(where.status).toEqual({ not: 'CANCELLED' });
  });

  it('applying a date range scopes the operational aggregates and never touches GL or the legacy ledger', async () => {
    await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-06-30' });

    for (const call of vi.mocked(prisma.invoice.aggregate).mock.calls) {
      expect((call[0] as any).where.issueDate).toBeDefined();
    }
    for (const call of vi.mocked(prisma.expense.aggregate).mock.calls) {
      expect((call[0] as any).where.date).toBeDefined();
    }
    expect(vi.mocked((prisma.journalEntryLine as any).aggregate)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.transaction.aggregate)).not.toHaveBeenCalled();
  });

  it('falls back to the earliest/latest operational (Invoice/Expense) dates when no range is given', async () => {
    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({
      _sum: { total: 0 },
      _min: { issueDate: new Date(2026, 0, 15) },
      _max: { issueDate: new Date(2026, 1, 10) },
    } as never);
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({
      _sum: { amount: 0 },
      _min: { date: null },
      _max: { date: null },
    } as never);

    const report = await reportsService.build('profit-loss', {});

    expect(report.rows.map((r) => r['month'])).toEqual(['01/2026', '02/2026']);
    // bounds come from Invoice/Expense, not GL or the legacy transaction table
    expect(vi.mocked((prisma.journalEntry as any).aggregate)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.transaction.aggregate)).not.toHaveBeenCalled();
  });

  it('payroll expenses (entered through the Expense module as an approved SALARIES-category row) are included like any other approved expense', async () => {
    // Payroll never posts to GL, but it is a plain APPROVED Expense row — the operational
    // engine's single status filter includes it automatically, with no special-casing.
    mockOperational(10000, 6000); // 6000 includes, e.g., an approved SALARIES-category expense

    const report = await reportsService.build('profit-loss', { from: '2026-01-01', to: '2026-01-31' });

    expect(report.rows[0]).toMatchObject({ revenue: 10000, expense: 6000, net: 4000 });
    // no category filter is applied — every APPROVED expense counts, payroll included
    const where = vi.mocked(prisma.expense.aggregate).mock.calls[0][0].where as any;
    expect(where.category).toBeUndefined();
    expect(where.status).toBe('APPROVED');
  });
});
