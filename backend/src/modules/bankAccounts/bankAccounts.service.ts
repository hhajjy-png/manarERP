import { prisma } from '@config/database.js';
import type {
  BankAccountSummary,
  BankAccountDashboard,
  MonthlyEntry,
  TopTransaction,
} from './bankAccounts.types.js';

// ── List all bank accounts ─────────────────────────────────────────────────────

export async function listBankAccounts(): Promise<BankAccountSummary[]> {
  // 1. Distinct accountKeys with aggregates
  const groups = await prisma.bankStatementTransaction.groupBy({
    by:    ['accountKey', 'bankName'],
    where: { accountKey: { not: null } },
    _count: { id: true },
    _sum:   { debit: true, credit: true },
    _min:   { statementDate: true },
    _max:   { statementDate: true },
  });

  if (groups.length === 0) return [];

  const accountKeys = groups.map((g) => g.accountKey!);

  // 2. Import counts + last import date per accountKey
  const importGroups = await prisma.bankStatementImport.groupBy({
    by:    ['accountKey'],
    where: { accountKey: { in: accountKeys } },
    _count: { id: true },
    _max:   { importedAt: true },
  });
  const importMap = new Map(
    importGroups.map((ig) => [
      ig.accountKey,
      { count: ig._count.id, lastImport: ig._max.importedAt },
    ]),
  );

  // 3. Last balance (current balance) — first data row of each account's most
  // recently imported statement (source of truth per business rule), not the
  // row with the max statementDate. One query pair per account; typically < 10 accounts.
  const balanceResults = await Promise.all(
    accountKeys.map((key) => getLatestStatementRow(key)),
  );

  return groups.map((g, i) => {
    const key = g.accountKey!;
    const im  = importMap.get(key);
    const bal = balanceResults[i];
    return {
      accountKey:           key,
      bankName:             g.bankName,
      accountNumber:        bal?.accountNumber ?? null,
      iban:                 bal?.iban ?? null,
      currentBalance:       bal?.balance != null ? Number(bal.balance) : null,
      firstTransactionDate: g._min.statementDate
        ? g._min.statementDate.toISOString().substring(0, 10)
        : null,
      lastTransactionDate:  g._max.statementDate
        ? g._max.statementDate.toISOString().substring(0, 10)
        : null,
      transactionCount: g._count.id,
      importCount:      im?.count ?? 0,
      lastImportDate:   im?.lastImport ? im.lastImport.toISOString() : null,
      totalDebits:      Number(g._sum.debit  ?? 0),
      totalCredits:     Number(g._sum.credit ?? 0),
    } satisfies BankAccountSummary;
  }).sort(
    (a, b) =>
      (b.lastTransactionDate ?? '').localeCompare(a.lastTransactionDate ?? ''),
  );
}

// ── Latest statement row (current balance source of truth) ────────────────────
//
// Business rule: official bank statement files are ordered newest → oldest, so
// the first data row of the most recently imported statement holds the true
// current balance. This must NOT be re-derived from statementDate — dates can
// repeat or, on some bank exports, not sort identically to the file's own row
// order. `statementSequence` (1 = first data row, set at import time — see
// bankStatementImport/service.ts) is the source of truth for "first row";
// `bankStatementImport` recency (not max statementDate) is the source of truth
// for "most recent statement". Returns null when the account has no imports.
async function getLatestStatementRow(accountKey: string): Promise<{
  balance: number | null;
  accountNumber: string | null;
  iban: string | null;
} | null> {
  const latestImport = await prisma.bankStatementImport.findFirst({
    where:   { accountKey },
    orderBy: [{ importedAt: 'desc' }, { id: 'desc' }],
    select:  { id: true },
  });
  if (!latestImport) return null;

  return prisma.bankStatementTransaction.findFirst({
    where:   { importId: latestImport.id, accountKey },
    orderBy: [{ statementSequence: 'asc' }, { id: 'asc' }],
    select:  { balance: true, accountNumber: true, iban: true },
  });
}

// ── Dashboard aggregates for one account ───────────────────────────────────────

export async function getBankAccountDashboard(
  accountKey: string,
): Promise<BankAccountDashboard | null> {
  const txCount = await prisma.bankStatementTransaction.count({
    where: { accountKey },
  });
  if (txCount === 0) return null;

  // Bank name from any transaction
  const meta = await prisma.bankStatementTransaction.findFirst({
    where:  { accountKey },
    select: { bankName: true },
  });

  const [overallAgg, depositAgg, withdrawalAgg, importCount, firstTx, currentRow] =
    await Promise.all([
      prisma.bankStatementTransaction.aggregate({
        where: { accountKey },
        _count: { id: true },
        _min:   { statementDate: true },
        _max:   { statementDate: true },
      }),
      prisma.bankStatementTransaction.aggregate({
        where: { accountKey, credit: { gt: 0 } },
        _count: { id: true },
        _sum:   { credit: true },
        _max:   { credit: true },
        _avg:   { credit: true },
      }),
      prisma.bankStatementTransaction.aggregate({
        where: { accountKey, debit: { gt: 0 } },
        _count: { id: true },
        _sum:   { debit: true },
        _max:   { debit: true },
        _avg:   { debit: true },
      }),
      prisma.bankStatementImport.count({ where: { accountKey } }),
      prisma.bankStatementTransaction.findFirst({
        where:   { accountKey },
        orderBy: { statementDate: 'asc' },
        select:  { balance: true },
      }),
      // Current balance source of truth — see getLatestStatementRow() above.
      getLatestStatementRow(accountKey),
    ]);

  const [monthly, topDeposits, topWithdrawals] = await Promise.all([
    getMonthlyStats(accountKey),
    prisma.bankStatementTransaction.findMany({
      where:   { accountKey, credit: { gt: 0 } },
      orderBy: { credit: 'desc' },
      take:    10,
      select:  {
        id: true, statementDate: true, description: true,
        reference: true, credit: true, balance: true, importId: true, bankName: true,
      },
    }),
    prisma.bankStatementTransaction.findMany({
      where:   { accountKey, debit: { gt: 0 } },
      orderBy: { debit: 'desc' },
      take:    10,
      select:  {
        id: true, statementDate: true, description: true,
        reference: true, debit: true, balance: true, importId: true, bankName: true,
      },
    }),
  ]);

  const totalDeposits    = Number(depositAgg._sum.credit    ?? 0);
  const totalWithdrawals = Number(withdrawalAgg._sum.debit  ?? 0);

  const mapTop = (
    txs: typeof topDeposits | typeof topWithdrawals,
    field: 'credit' | 'debit',
  ): TopTransaction[] =>
    txs.map((t) => ({
      id:            t.id,
      statementDate: t.statementDate
        ? t.statementDate.toISOString().substring(0, 10)
        : null,
      description: t.description,
      reference:   t.reference,
      amount:      Number((t as Record<string, unknown>)[field] ?? 0),
      balance:     t.balance != null ? Number(t.balance) : null,
      importId:    t.importId,
      bankName:    t.bankName,
    }));

  return {
    accountKey,
    bankName:         meta?.bankName ?? '',
    currentBalance:   currentRow?.balance != null ? Number(currentRow.balance) : null,
    openingBalance:   firstTx?.balance    != null ? Number(firstTx.balance)    : null,
    closingBalance:   currentRow?.balance != null ? Number(currentRow.balance) : null,
    totalDeposits,
    totalWithdrawals,
    netCashFlow:      totalDeposits - totalWithdrawals,
    largestDeposit:   Number(depositAgg._max.credit   ?? 0),
    largestWithdrawal: Number(withdrawalAgg._max.debit ?? 0),
    avgDeposit:       Number(depositAgg._avg.credit   ?? 0),
    avgWithdrawal:    Number(withdrawalAgg._avg.debit ?? 0),
    depositCount:     depositAgg._count.id,
    withdrawalCount:  withdrawalAgg._count.id,
    transactionCount: overallAgg._count.id,
    importCount,
    coverageStart: overallAgg._min.statementDate
      ? overallAgg._min.statementDate.toISOString().substring(0, 10)
      : null,
    coverageEnd: overallAgg._max.statementDate
      ? overallAgg._max.statementDate.toISOString().substring(0, 10)
      : null,
    monthly,
    topDeposits:    mapTop(topDeposits,    'credit'),
    topWithdrawals: mapTop(topWithdrawals, 'debit'),
  };
}

// ── Monthly statistics (raw SQL GROUP BY month) ────────────────────────────────

interface RawMonthRow {
  month:             string;
  totalDeposits:     number | string;
  totalWithdrawals:  number | string;
  txCount:           number | string;
  largestDeposit:    number | string;
  largestWithdrawal: number | string;
}

async function getMonthlyStats(accountKey: string): Promise<MonthlyEntry[]> {
  const rows = await prisma.$queryRaw<RawMonthRow[]>`
    SELECT
      strftime('%Y-%m', statementDate) AS month,
      COALESCE(SUM(credit), 0)         AS totalDeposits,
      COALESCE(SUM(debit),  0)         AS totalWithdrawals,
      COUNT(*)                         AS txCount,
      COALESCE(MAX(credit), 0)         AS largestDeposit,
      COALESCE(MAX(debit),  0)         AS largestWithdrawal
    FROM bank_statement_transactions
    WHERE accountKey = ${accountKey}
      AND statementDate IS NOT NULL
    GROUP BY strftime('%Y-%m', statementDate)
    ORDER BY month ASC
  `;

  const entries = rows.map((r) => {
    const dep   = Number(r.totalDeposits);
    const with_ = Number(r.totalWithdrawals);
    return {
      month:             r.month,
      totalDeposits:     dep,
      totalWithdrawals:  with_,
      netFlow:           dep - with_,
      txCount:           Number(r.txCount),
      largestDeposit:    Number(r.largestDeposit),
      largestWithdrawal: Number(r.largestWithdrawal),
    };
  });

  return fillMonthlyGaps(entries);
}

// Hard cap on generated month buckets. A malformed/out-of-range statementDate
// (e.g. a bad parse yielding year 0020 or 9999) could otherwise make the gap-fill
// loop produce tens of thousands of entries, which then froze/crashed the Analytics
// charts on the frontend. 600 months = 50 years, far beyond any real bank statement.
const MAX_MONTHLY_BUCKETS = 600;

// Fill zero-entry placeholders for months with no transactions so chart scale stays consistent.
// Exported for unit testing of the runaway-range / NaN guards.
export function fillMonthlyGaps(entries: MonthlyEntry[]): MonthlyEntry[] {
  if (entries.length < 2) return entries;

  const byMonth = new Map(entries.map((e) => [e.month, e]));
  const first   = entries[0].month;
  const last    = entries[entries.length - 1].month;

  const [fy, fm] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);

  // If either bound is unparseable, skip gap-filling entirely and return the raw
  // (already valid) entries rather than risk an infinite / runaway loop.
  if (![fy, fm, ly, lm].every(Number.isFinite)) return entries;

  const result: MonthlyEntry[] = [];
  let y = fy;
  let m = fm;

  while ((y < ly || (y === ly && m <= lm)) && result.length < MAX_MONTHLY_BUCKETS) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    result.push(byMonth.get(key) ?? {
      month:             key,
      totalDeposits:     0,
      totalWithdrawals:  0,
      netFlow:           0,
      txCount:           0,
      largestDeposit:    0,
      largestWithdrawal: 0,
    });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return result;
}
