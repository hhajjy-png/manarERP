/**
 * Bank Accounts module — service tests
 *
 * Covers:
 *  - listBankAccounts: empty DB, single account, multi-account, sort order
 *  - getBankAccountDashboard: no-data returns null, aggregate computation, monthly mapping
 *  - Net cash flow, largest deposit/withdrawal, coverage dates
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Prisma mock (must be hoisted) ──────────────────────────────────────────────

vi.mock('@config/database.js', () => ({
  prisma: {
    bankStatementTransaction: {
      groupBy:   vi.fn(),
      findFirst: vi.fn(),
      findMany:  vi.fn(),
      aggregate: vi.fn(),
      count:     vi.fn(),
    },
    bankStatementImport: {
      groupBy: vi.fn(),
      count:   vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { listBankAccounts, getBankAccountDashboard } from '../bankAccounts.service.js';
import { prisma } from '@config/database.js';

const mockTx  = prisma.bankStatementTransaction as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockImp = prisma.bankStatementImport      as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockRaw = prisma.$queryRaw                as unknown as ReturnType<typeof vi.fn>;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDecimal(n: number) {
  return { toNumber: () => n, toString: () => String(n), valueOf: () => n };
}

beforeEach(() => vi.clearAllMocks());

// ── listBankAccounts ───────────────────────────────────────────────────────────

describe('listBankAccounts', () => {
  it('returns empty array when no transactions exist', async () => {
    mockTx.groupBy.mockResolvedValue([]);
    const result = await listBankAccounts();
    expect(result).toEqual([]);
    expect(mockTx.groupBy).toHaveBeenCalledOnce();
  });

  it('maps a single account group to BankAccountSummary', async () => {
    mockTx.groupBy.mockResolvedValue([
      {
        accountKey: 'BANK:NBK',
        bankName:   'NBK',
        _count: { id: 5 },
        _sum:   { debit: makeDecimal(1000), credit: makeDecimal(3000) },
        _min:   { statementDate: new Date('2026-01-01') },
        _max:   { statementDate: new Date('2026-03-31') },
      },
    ]);
    mockImp.groupBy.mockResolvedValue([
      {
        accountKey: 'BANK:NBK',
        _count: { id: 2 },
        _max:   { importedAt: new Date('2026-03-15') },
      },
    ]);
    mockTx.findFirst.mockResolvedValue({
      balance:       makeDecimal(2000),
      accountNumber: '12345',
      iban:          'KW74NBK000...',
    });

    const result = await listBankAccounts();

    expect(result).toHaveLength(1);
    const a = result[0];
    expect(a.accountKey).toBe('BANK:NBK');
    expect(a.bankName).toBe('NBK');
    expect(a.transactionCount).toBe(5);
    expect(a.importCount).toBe(2);
    expect(a.totalDebits).toBe(1000);
    expect(a.totalCredits).toBe(3000);
    expect(a.currentBalance).toBe(2000);
    expect(a.firstTransactionDate).toBe('2026-01-01');
    expect(a.lastTransactionDate).toBe('2026-03-31');
    expect(a.iban).toBe('KW74NBK000...');
  });

  it('sorts accounts by lastTransactionDate descending', async () => {
    mockTx.groupBy.mockResolvedValue([
      {
        accountKey: 'BANK:KFH', bankName: 'KFH',
        _count: { id: 1 }, _sum: { debit: makeDecimal(0), credit: makeDecimal(100) },
        _min: { statementDate: new Date('2025-06-01') },
        _max: { statementDate: new Date('2025-06-01') },
      },
      {
        accountKey: 'BANK:NBK', bankName: 'NBK',
        _count: { id: 1 }, _sum: { debit: makeDecimal(0), credit: makeDecimal(200) },
        _min: { statementDate: new Date('2026-03-01') },
        _max: { statementDate: new Date('2026-03-01') },
      },
    ]);
    mockImp.groupBy.mockResolvedValue([]);
    mockTx.findFirst.mockResolvedValue(null);

    const result = await listBankAccounts();
    expect(result[0].accountKey).toBe('BANK:NBK');
    expect(result[1].accountKey).toBe('BANK:KFH');
  });

  it('handles missing importMap entry gracefully', async () => {
    mockTx.groupBy.mockResolvedValue([
      {
        accountKey: 'BANK:NBK', bankName: 'NBK',
        _count: { id: 3 }, _sum: { debit: makeDecimal(500), credit: makeDecimal(1500) },
        _min: { statementDate: new Date('2026-01-01') },
        _max: { statementDate: new Date('2026-01-31') },
      },
    ]);
    mockImp.groupBy.mockResolvedValue([]); // no import records
    mockTx.findFirst.mockResolvedValue(null);

    const result = await listBankAccounts();
    expect(result[0].importCount).toBe(0);
    expect(result[0].lastImportDate).toBeNull();
    expect(result[0].currentBalance).toBeNull();
  });
});

// ── getBankAccountDashboard ────────────────────────────────────────────────────

describe('getBankAccountDashboard', () => {
  it('returns null when no transactions exist for the account', async () => {
    mockTx.count.mockResolvedValue(0);
    const result = await getBankAccountDashboard('BANK:UNKNOWN');
    expect(result).toBeNull();
  });

  it('computes net cash flow as totalDeposits - totalWithdrawals', async () => {
    mockTx.count.mockResolvedValue(10);
    mockTx.findFirst
      .mockResolvedValueOnce({ bankName: 'NBK' })                          // meta
      .mockResolvedValueOnce({ balance: makeDecimal(500) })                // firstTx
      .mockResolvedValueOnce({ balance: makeDecimal(2500) });              // lastTx

    mockTx.aggregate
      .mockResolvedValueOnce({
        _count: { id: 10 },
        _min:   { statementDate: new Date('2026-01-01') },
        _max:   { statementDate: new Date('2026-03-31') },
      }) // overall
      .mockResolvedValueOnce({
        _count: { id: 6 }, _sum: { credit: makeDecimal(3000) },
        _max: { credit: makeDecimal(1000) }, _avg: { credit: makeDecimal(500) },
      }) // deposits
      .mockResolvedValueOnce({
        _count: { id: 4 }, _sum: { debit: makeDecimal(1000) },
        _max: { debit: makeDecimal(400) }, _avg: { debit: makeDecimal(250) },
      }); // withdrawals

    mockImp.count.mockResolvedValue(3);
    mockRaw.mockResolvedValue([]);
    mockTx.findMany.mockResolvedValue([]);

    const d = await getBankAccountDashboard('BANK:NBK');

    expect(d).not.toBeNull();
    expect(d!.netCashFlow).toBe(2000);           // 3000 - 1000
    expect(d!.totalDeposits).toBe(3000);
    expect(d!.totalWithdrawals).toBe(1000);
    expect(d!.largestDeposit).toBe(1000);
    expect(d!.largestWithdrawal).toBe(400);
    expect(d!.depositCount).toBe(6);
    expect(d!.withdrawalCount).toBe(4);
    expect(d!.transactionCount).toBe(10);
    expect(d!.importCount).toBe(3);
  });

  it('formats coverage dates as YYYY-MM-DD strings', async () => {
    mockTx.count.mockResolvedValue(5);
    mockTx.findFirst
      .mockResolvedValueOnce({ bankName: 'KFH' })
      .mockResolvedValueOnce({ balance: makeDecimal(100) })
      .mockResolvedValueOnce({ balance: makeDecimal(200) });

    mockTx.aggregate
      .mockResolvedValueOnce({
        _count: { id: 5 },
        _min: { statementDate: new Date('2026-01-15T00:00:00.000Z') },
        _max: { statementDate: new Date('2026-04-30T00:00:00.000Z') },
      })
      .mockResolvedValueOnce({
        _count: { id: 3 }, _sum: { credit: makeDecimal(600) },
        _max: { credit: makeDecimal(300) }, _avg: { credit: makeDecimal(200) },
      })
      .mockResolvedValueOnce({
        _count: { id: 2 }, _sum: { debit: makeDecimal(200) },
        _max: { debit: makeDecimal(150) }, _avg: { debit: makeDecimal(100) },
      });

    mockImp.count.mockResolvedValue(1);
    mockRaw.mockResolvedValue([]);
    mockTx.findMany.mockResolvedValue([]);

    const d = await getBankAccountDashboard('BANK:KFH');
    expect(d!.coverageStart).toBe('2026-01-15');
    expect(d!.coverageEnd).toBe('2026-04-30');
  });

  it('maps monthly raw SQL rows to MonthlyEntry with netFlow', async () => {
    mockTx.count.mockResolvedValue(3);
    mockTx.findFirst.mockResolvedValue({ bankName: 'NBK' });

    mockTx.aggregate
      .mockResolvedValueOnce({
        _count: { id: 3 },
        _min: { statementDate: new Date('2026-01-01') },
        _max: { statementDate: new Date('2026-02-28') },
      })
      .mockResolvedValueOnce({
        _count: { id: 2 }, _sum: { credit: makeDecimal(800) },
        _max: { credit: makeDecimal(500) }, _avg: { credit: makeDecimal(400) },
      })
      .mockResolvedValueOnce({
        _count: { id: 1 }, _sum: { debit: makeDecimal(200) },
        _max: { debit: makeDecimal(200) }, _avg: { debit: makeDecimal(200) },
      });

    mockImp.count.mockResolvedValue(1);
    mockRaw.mockResolvedValue([
      { month: '2026-01', totalDeposits: 500, totalWithdrawals: 100, txCount: 2, largestDeposit: 300, largestWithdrawal: 100 },
      { month: '2026-02', totalDeposits: 300, totalWithdrawals: 100, txCount: 1, largestDeposit: 300, largestWithdrawal: 100 },
    ]);
    mockTx.findMany.mockResolvedValue([]);

    const d = await getBankAccountDashboard('BANK:NBK');
    expect(d!.monthly).toHaveLength(2);
    expect(d!.monthly[0].month).toBe('2026-01');
    expect(d!.monthly[0].netFlow).toBe(400);   // 500 - 100
    expect(d!.monthly[1].month).toBe('2026-02');
    expect(d!.monthly[1].netFlow).toBe(200);   // 300 - 100
  });

  it('maps top deposits and withdrawals to TopTransaction', async () => {
    mockTx.count.mockResolvedValue(2);
    mockTx.findFirst.mockResolvedValue({ bankName: 'NBK' });

    mockTx.aggregate
      .mockResolvedValueOnce({
        _count: { id: 2 },
        _min: { statementDate: new Date('2026-01-10') },
        _max: { statementDate: new Date('2026-01-20') },
      })
      .mockResolvedValueOnce({
        _count: { id: 1 }, _sum: { credit: makeDecimal(1000) },
        _max: { credit: makeDecimal(1000) }, _avg: { credit: makeDecimal(1000) },
      })
      .mockResolvedValueOnce({
        _count: { id: 1 }, _sum: { debit: makeDecimal(500) },
        _max: { debit: makeDecimal(500) }, _avg: { debit: makeDecimal(500) },
      });

    mockImp.count.mockResolvedValue(1);
    mockRaw.mockResolvedValue([]);

    mockTx.findMany
      .mockResolvedValueOnce([
        {
          id: 1, statementDate: new Date('2026-01-20'), description: 'Wire transfer in',
          reference: 'REF001', credit: makeDecimal(1000), balance: makeDecimal(1200),
          importId: 7, bankName: 'NBK',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2, statementDate: new Date('2026-01-10'), description: 'Cheque payment',
          reference: 'CHQ001', debit: makeDecimal(500), balance: makeDecimal(200),
          importId: 7, bankName: 'NBK',
        },
      ]);

    const d = await getBankAccountDashboard('BANK:NBK');

    expect(d!.topDeposits).toHaveLength(1);
    expect(d!.topDeposits[0].amount).toBe(1000);
    expect(d!.topDeposits[0].description).toBe('Wire transfer in');
    expect(d!.topDeposits[0].statementDate).toBe('2026-01-20');

    expect(d!.topWithdrawals).toHaveLength(1);
    expect(d!.topWithdrawals[0].amount).toBe(500);
    expect(d!.topWithdrawals[0].description).toBe('Cheque payment');
  });
});
