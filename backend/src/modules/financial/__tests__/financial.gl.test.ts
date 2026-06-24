import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    account:           { findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
    journalEntryLine:  { aggregate: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    journalEntry:      { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('../../accounting/accounting.service', () => ({
  AccountingService: vi.fn().mockImplementation(() => ({
    listJournalEntries: vi.fn(),
  })),
}));

import { FinancialService } from '../financial.service';
import { prisma }           from '../../../config/database';
import { AccountingService } from '../../accounting/accounting.service';

type MockPrisma = {
  account:          { findUniqueOrThrow: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  journalEntryLine: { aggregate: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
  journalEntry:     { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

const mockPrisma      = prisma as unknown as MockPrisma;
const MockAccounting  = AccountingService as unknown as ReturnType<typeof vi.fn>;

const makeAccount = (id = 1, extras = {}) => ({
  id, code: `1${id}00`, name: `Cash Account`, type: 'ASSET', normalBalance: 'DEBIT',
  isActive: true, parent: null, ...extras,
});

const makeJeLine = (id: number, entryId: number, debit: number, credit: number, date: Date) => ({
  id, debit, credit,
  journalEntry: {
    id: entryId, entryNumber: `JRN-2025-${entryId.toString().padStart(5, '0')}`,
    date, description: `Entry ${entryId}`, referenceType: 'MANUAL', referenceId: null, status: 'POSTED',
  },
  description: null,
});

const zeroAgg = () => ({ _sum: { debit: null, credit: null } });
const agg     = (d: number, c: number) => ({ _sum: { debit: d, credit: c } });

describe('FinancialService.getGlStatement', () => {
  let service: FinancialService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FinancialService();
  });

  it('returns empty rows when account has no lines in period', async () => {
    mockPrisma.account.findUniqueOrThrow.mockResolvedValue(makeAccount());
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue(zeroAgg());
    mockPrisma.journalEntryLine.findMany.mockResolvedValue([]);

    const result = await service.getGlStatement(1, {});
    expect(result.rows).toHaveLength(0);
    expect(result.summary.openingBalance).toBe(0);
    expect(result.summary.totalDebit).toBe(0);
    expect(result.summary.closingBalance).toBe(0);
  });

  it('computes running balance correctly from opening balance', async () => {
    const date1 = new Date('2025-03-01');
    const date2 = new Date('2025-03-15');

    mockPrisma.account.findUniqueOrThrow.mockResolvedValue(makeAccount());
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue(agg(500, 200)); // opening = 300
    mockPrisma.journalEntryLine.findMany.mockResolvedValue([
      makeJeLine(1, 1, 100, 0,   date1),
      makeJeLine(2, 2, 0,   50,  date2),
    ]);

    const result = await service.getGlStatement(1, { fromDate: '2025-03-01' });
    expect(result.summary.openingBalance).toBe(300);
    expect(result.rows[0].runningBalance).toBe(400); // 300 + 100
    expect(result.rows[1].runningBalance).toBe(350); // 400 - 50
    expect(result.summary.closingBalance).toBe(350);
  });

  it('throws when account not found (findUniqueOrThrow behaviour)', async () => {
    mockPrisma.account.findUniqueOrThrow.mockRejectedValue(new Error('Account not found'));
    await expect(service.getGlStatement(999, {})).rejects.toThrow('Account not found');
  });

  it('includes metadata with accountCode and accountName', async () => {
    mockPrisma.account.findUniqueOrThrow.mockResolvedValue(makeAccount(1, { code: '1100', name: 'الصندوق' }));
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue(zeroAgg());
    mockPrisma.journalEntryLine.findMany.mockResolvedValue([]);

    const result = await service.getGlStatement(1, {});
    expect(result.metadata?.accountCode).toBe('1100');
    expect(result.metadata?.accountName).toBe('الصندوق');
    expect(result.metadata?.normalBalance).toBe('DEBIT');
  });

  it('builds JOURNAL_ENTRY drillDown for MANUAL lines', async () => {
    mockPrisma.account.findUniqueOrThrow.mockResolvedValue(makeAccount());
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue(zeroAgg());
    mockPrisma.journalEntryLine.findMany.mockResolvedValue([
      makeJeLine(1, 5, 200, 0, new Date('2025-04-01')),
    ]);

    const result = await service.getGlStatement(1, {});
    expect(result.rows[0].drillDown?.entityType).toBe('JOURNAL_ENTRY');
    expect(result.rows[0].drillDown?.entityId).toBe(5);
  });
});

describe('FinancialService.getGlReport', () => {
  let service: FinancialService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FinancialService();
  });

  it('returns paginated accounts with opening/period/closing totals', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      makeAccount(1), makeAccount(2),
    ]);
    // groupBy returns arrays — one entry per accountId
    mockPrisma.journalEntryLine.groupBy
      .mockResolvedValueOnce([{ accountId: 1, _sum: { debit: 1000, credit: 0 } }])   // opening
      .mockResolvedValueOnce([                                                          // period
        { accountId: 1, _sum: { debit: 200, credit: 50 } },
        { accountId: 2, _sum: { debit: 0,   credit: 300 } },
      ]);

    const result = await service.getGlReport({ page: 1, pageSize: 10 });
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[0].openingBalance).toBe(1000);
    expect(result.accounts[0].totalDebit).toBe(200);
    expect(result.accounts[0].totalCredit).toBe(50);
    expect(result.accounts[0].closingBalance).toBe(1150); // 1000 + 200 - 50
    expect(result.accounts[0].rows).toHaveLength(0);      // lines not fetched
    expect(result.pagination.total).toBe(2);
  });

  it('applies server-side pagination on account list', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      makeAccount(1), makeAccount(2), makeAccount(3),
    ]);
    // page 1 of size 1 → only account 1 in paginatedAccounts; groupBy returns empty
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);

    const result = await service.getGlReport({ page: 1, pageSize: 1 });
    expect(result.accounts).toHaveLength(1);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.totalPages).toBe(3);
  });
});

describe('FinancialService.getTrialBalance — as-of mode', () => {
  let service: FinancialService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FinancialService();
  });

  it('returns isBalanced:true when totalDebit ≈ totalCredit', async () => {
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([
      { accountId: 1, _sum: { debit: 1000, credit: 0 } },
      { accountId: 2, _sum: { debit: 0,    credit: 1000 } },
    ]);
    mockPrisma.account.findMany.mockResolvedValue([
      makeAccount(1), makeAccount(2, { normalBalance: 'CREDIT' }),
    ]);

    const result = await service.getTrialBalance({ mode: 'as-of' });
    expect(result.metadata?.isBalanced).toBe(true);
    expect(result.metadata?.difference).toBe(0);
  });

  it('returns isBalanced:false with correct difference when unbalanced', async () => {
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([
      { accountId: 1, _sum: { debit: 1000, credit: 0 } },
      { accountId: 2, _sum: { debit: 0,    credit: 800 } },
    ]);
    mockPrisma.account.findMany.mockResolvedValue([makeAccount(1), makeAccount(2)]);

    const result = await service.getTrialBalance({ mode: 'as-of' });
    expect(result.metadata?.isBalanced).toBe(false);
    expect(result.metadata?.difference).toBe(200);
  });

  it('excludes accounts with no movement when showZeroBalances is false', async () => {
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([
      { accountId: 1, _sum: { debit: 500, credit: 0 } },
    ]);
    mockPrisma.account.findMany.mockResolvedValue([makeAccount(1), makeAccount(2)]);

    const result = await service.getTrialBalance({ mode: 'as-of', showZeroBalances: false });
    expect(result.rows).toHaveLength(1);
    expect((result.rows[0] as { accountId: number }).accountId).toBe(1);
  });

  it('includes all accounts when showZeroBalances is true', async () => {
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);
    mockPrisma.account.findMany.mockResolvedValue([makeAccount(1), makeAccount(2)]);

    const result = await service.getTrialBalance({ mode: 'as-of', showZeroBalances: true });
    expect(result.rows).toHaveLength(2);
  });

  it('includes drillDown pointing to GL_ACCOUNT', async () => {
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([
      { accountId: 1, _sum: { debit: 100, credit: 0 } },
    ]);
    mockPrisma.account.findMany.mockResolvedValue([makeAccount(1)]);

    const result = await service.getTrialBalance({ mode: 'as-of' });
    expect(result.rows[0].drillDown?.entityType).toBe('GL_ACCOUNT');
  });
});

describe('FinancialService.getTrialBalance — period mode', () => {
  let service: FinancialService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FinancialService();
  });

  it('throws when fromDate or toDate missing', async () => {
    await expect(service.getTrialBalance({ mode: 'period', fromDate: '2025-01-01' }))
      .rejects.toThrow();
    await expect(service.getTrialBalance({ mode: 'period', toDate: '2025-12-31' }))
      .rejects.toThrow();
  });

  it('computes opening + period + closing per account', async () => {
    mockPrisma.journalEntryLine.groupBy
      .mockResolvedValueOnce([{ accountId: 1, _sum: { debit: 500, credit: 0 } }])  // opening
      .mockResolvedValueOnce([{ accountId: 1, _sum: { debit: 200, credit: 100 } }]) // period
    ;
    mockPrisma.account.findMany.mockResolvedValue([makeAccount(1)]);

    const result = await service.getTrialBalance({ mode: 'period', fromDate: '2025-01-01', toDate: '2025-12-31' });
    const row = result.rows[0] as { openingBalance: number; periodDebit: number; periodCredit: number; closingBalance: number };
    expect(row.openingBalance).toBe(500);
    expect(row.periodDebit).toBe(200);
    expect(row.periodCredit).toBe(100);
    expect(row.closingBalance).toBe(600); // 500 + 200 - 100
  });

  it('returns metadata.mode as period', async () => {
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);
    mockPrisma.account.findMany.mockResolvedValue([]);

    const result = await service.getTrialBalance({ mode: 'period', fromDate: '2025-01-01', toDate: '2025-12-31' });
    expect(result.metadata?.mode).toBe('period');
  });
});

describe('FinancialService.getJournalBook', () => {
  let service: FinancialService;

  // Captured during describe-collection phase (synchronous), before any beforeEach/vi.clearAllMocks runs
  const mockListJournalEntries = (
    MockAccounting.mock.results[0]?.value as { listJournalEntries: ReturnType<typeof vi.fn> }
  )?.listJournalEntries;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FinancialService();
  });

  const makeEntry = (id: number) => ({
    id, entryNumber: `JRN-2025-${id.toString().padStart(5, '0')}`,
    date: new Date('2025-05-01'), description: `Test entry ${id}`,
    referenceType: 'MANUAL', referenceId: null, status: 'POSTED',
    lines: [
      { account: { code: '1100', name: 'Cash' }, description: null, debit: 1000, credit: 0 },
      { account: { code: '4100', name: 'Revenue' }, description: null, debit: 0, credit: 1000 },
    ],
  });

  it('returns rows with correct totals and line count', async () => {
    mockListJournalEntries.mockResolvedValue({
      data: [makeEntry(1)],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });

    const result = await service.getJournalBook({});
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].totalDebit).toBe(1000);
    expect(result.rows[0].totalCredit).toBe(1000);
    expect(result.rows[0].lineCount).toBe(2);
    expect(result.rows[0].lines[0].accountCode).toBe('1100');
  });

  it('passes from/to date params to accountingService using from/to keys', async () => {
    mockListJournalEntries.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 } });

    await service.getJournalBook({ fromDate: '2025-01-01', toDate: '2025-12-31' });
    expect(mockListJournalEntries).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2025-01-01', to: '2025-12-31' })
    );
  });

  it('includes pagination in response', async () => {
    mockListJournalEntries.mockResolvedValue({
      data: [makeEntry(1)],
      meta: { page: 2, pageSize: 10, total: 25, totalPages: 3 },
    });

    const result = await service.getJournalBook({ page: 2, pageSize: 10 });
    expect(result.pagination?.total).toBe(25);
    expect(result.pagination?.totalPages).toBe(3);
  });

  it('row id format is JE-{id}', async () => {
    mockListJournalEntries.mockResolvedValue({
      data: [makeEntry(7)],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });

    const result = await service.getJournalBook({});
    expect(result.rows[0].id).toBe('JE-7');
  });
});
