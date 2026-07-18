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
import { endOfDay }          from '../../../core/utils/dateWindows';

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

  // Regression (same spread-collision as getGlReport): the lines query must keep
  // both bounds, else it lists every line ≤ toDate (ignoring fromDate) on top of
  // an opening that already counted the pre-period rows — double-counting them.
  it('lines query carries BOTH gte and lte under one date key', async () => {
    mockPrisma.account.findUniqueOrThrow.mockResolvedValue(makeAccount());
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue(zeroAgg());
    mockPrisma.journalEntryLine.findMany.mockResolvedValue([]);

    await service.getGlStatement(1, { fromDate: '2025-01-01', toDate: '2025-12-31' });

    const linesWhere = mockPrisma.journalEntryLine.findMany.mock.calls[0][0].where.journalEntry.date;
    expect(linesWhere).toEqual({ gte: new Date('2025-01-01'), lte: endOfDay(new Date('2025-12-31')) });
  });

  // Regression (Date Boundary Consistency Pack v1): `toDate` must resolve to
  // 23:59:59.999 of the last day, not midnight — else an entry posted later on
  // the final day is silently excluded from the statement.
  it('resolves toDate to end-of-day (23:59:59.999), not midnight', async () => {
    mockPrisma.account.findUniqueOrThrow.mockResolvedValue(makeAccount());
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue(zeroAgg());
    mockPrisma.journalEntryLine.findMany.mockResolvedValue([]);

    await service.getGlStatement(1, { toDate: '2025-12-31' });

    const linesWhere = mockPrisma.journalEntryLine.findMany.mock.calls[0][0].where.journalEntry.date;
    const lte = linesWhere.lte as Date;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
    expect(lte.getMilliseconds()).toBe(999);
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

  // Regression: two separate `...{ date: {...} }` spreads collided — the `lte`
  // spread overwrote the `gte` spread — so the period movement silently summed
  // ALL history ≤ toDate. Broke every bounded GL Report with a nonzero opening
  // (i.e. any historical year after the first). Guard: both bounds must survive.
  it('period movement query carries BOTH gte and lte under one date key', async () => {
    mockPrisma.account.findMany.mockResolvedValue([makeAccount(1)]);
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);

    await service.getGlReport({ fromDate: '2025-01-01', toDate: '2025-12-31', page: 1, pageSize: 10 });

    // Call 0 = opening (lt fromDate); call 1 = period movement (gte..lte).
    const periodWhere = mockPrisma.journalEntryLine.groupBy.mock.calls[1][0].where.journalEntry.date;
    expect(periodWhere).toEqual({ gte: new Date('2025-01-01'), lte: endOfDay(new Date('2025-12-31')) });
  });

  // Date Boundary Consistency Pack v1: toDate must resolve to the very end of
  // the last day, not midnight, else the last day's postings are dropped.
  it('resolves toDate to end-of-day (23:59:59.999)', async () => {
    mockPrisma.account.findMany.mockResolvedValue([makeAccount(1)]);
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);

    await service.getGlReport({ toDate: '2025-12-31', page: 1, pageSize: 10 });

    const periodWhere = mockPrisma.journalEntryLine.groupBy.mock.calls[1][0].where.journalEntry.date;
    const lte = periodWhere.lte as Date;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
    expect(lte.getMilliseconds()).toBe(999);
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

  // Date Boundary Consistency Pack v1: an explicit asOfDate must resolve to the
  // end of that day (23:59:59.999), not midnight — else postings made later on
  // the as-of day are silently excluded from the trial balance.
  it('resolves an explicit asOfDate to end-of-day', async () => {
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);
    mockPrisma.account.findMany.mockResolvedValue([]);

    const result = await service.getTrialBalance({ mode: 'as-of', asOfDate: '2025-12-31' });

    const groupByWhere = mockPrisma.journalEntryLine.groupBy.mock.calls[0][0].where.journalEntry.date;
    const lte = groupByWhere.lte as Date;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
    expect(lte.getMilliseconds()).toBe(999);
    expect(new Date(result.metadata?.asOfDate as string).getTime()).toBe(lte.getTime());
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

  // Date Boundary Consistency Pack v1: the period-movement query's toDate must
  // resolve to end-of-day, matching as-of mode and every other financial report.
  it('resolves toDate to end-of-day in the period-movement query', async () => {
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);
    mockPrisma.account.findMany.mockResolvedValue([]);

    await service.getTrialBalance({ mode: 'period', fromDate: '2025-01-01', toDate: '2025-12-31' });

    // Call 0 = opening (lt fromDate); call 1 = period movement (gte..lte).
    const periodWhere = mockPrisma.journalEntryLine.groupBy.mock.calls[1][0].where.journalEntry.date;
    const lte = periodWhere.lte as Date;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
    expect(lte.getMilliseconds()).toBe(999);
  });
});

// Date Boundary Consistency Pack v1: every financial report that accepts a
// toDate/asOfDate must resolve the SAME calendar day to the SAME end-of-day
// instant. Before this pack, Trial Balance and GL Report used `new Date(toDate)`
// (midnight) while Financial Summary/AR/AP Aging already used `endOfDay()` —
// two different boundaries for "the same period" across reports. This proves
// GL Statement, GL Report, and both Trial Balance modes now agree.
describe('Date boundary consistency across financial reports', () => {
  let service: FinancialService;
  const SAME_DAY = '2025-06-30';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FinancialService();
  });

  it('GL Statement, GL Report, and Trial Balance all resolve the same toDate to an identical instant', async () => {
    const expected = endOfDay(new Date(SAME_DAY)).getTime();

    // GL Statement
    mockPrisma.account.findUniqueOrThrow.mockResolvedValue(makeAccount());
    mockPrisma.journalEntryLine.aggregate.mockResolvedValue(zeroAgg());
    mockPrisma.journalEntryLine.findMany.mockResolvedValue([]);
    await service.getGlStatement(1, { toDate: SAME_DAY });
    const glStatementLte = (mockPrisma.journalEntryLine.findMany.mock.calls[0][0].where.journalEntry.date.lte as Date).getTime();

    vi.clearAllMocks();

    // GL Report
    mockPrisma.account.findMany.mockResolvedValue([makeAccount(1)]);
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);
    await service.getGlReport({ toDate: SAME_DAY, page: 1, pageSize: 10 });
    const glReportLte = (mockPrisma.journalEntryLine.groupBy.mock.calls[1][0].where.journalEntry.date.lte as Date).getTime();

    vi.clearAllMocks();

    // Trial Balance — as-of mode
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);
    mockPrisma.account.findMany.mockResolvedValue([]);
    const tbAsOf = await service.getTrialBalance({ mode: 'as-of', asOfDate: SAME_DAY });
    const tbAsOfLte = new Date(tbAsOf.metadata?.asOfDate as string).getTime();

    vi.clearAllMocks();

    // Trial Balance — period mode
    mockPrisma.journalEntryLine.groupBy.mockResolvedValue([]);
    mockPrisma.account.findMany.mockResolvedValue([]);
    await service.getTrialBalance({ mode: 'period', fromDate: '2025-01-01', toDate: SAME_DAY });
    const tbPeriodLte = (mockPrisma.journalEntryLine.groupBy.mock.calls[1][0].where.journalEntry.date.lte as Date).getTime();

    expect(glStatementLte).toBe(expected);
    expect(glReportLte).toBe(expected);
    expect(tbAsOfLte).toBe(expected);
    expect(tbPeriodLte).toBe(expected);
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
