import { prisma } from '@config/database.js';
import { buildAccountKey, computeFingerprint, isSimilarDescription } from './fingerprint.js';
import type { StatementTransaction, DedupSummary, CoverageSummary } from './types.js';

// ── Duplicate category ─────────────────────────────────────────────────────────

export type DupCategory =
  | 'SKIP_TRANSACTION_ID'  // Stage 1: exact transactionId match
  | 'SKIP_REFERENCE'       // Stage 2: reference match within accountKey
  | 'SKIP_FINGERPRINT'     // Stage 3: accountKey + fingerprint match
  | 'POTENTIAL_DUPLICATE'  // Stage 4: date + amount + similar description
  | 'NEW';                 // Stage 5: genuinely new

export interface DedupResult {
  category:    DupCategory;
  accountKey:  string;
  fingerprint: string | null;
}

// ── Existing data snapshot ─────────────────────────────────────────────────────

interface ExistingSnapshot {
  transactionIds: Set<string>;   // all transactionIds for bankName in DB
  fingerprints:   Set<string>;   // all fingerprints for accountKey in DB
  references:     Set<string>;   // all non-null references for accountKey in DB
  potentialRows: Array<{         // rows for accountKey in date window for stage-4 check
    statementDate: string | null;
    debit:         number;
    credit:        number;
    description:   string;
  }>;
}

// ── Fetch existing data ────────────────────────────────────────────────────────

async function fetchSnapshot(
  bankName:   string,
  accountKey: string,
  fromDate:   string | null,
  toDate:     string | null,
): Promise<ExistingSnapshot> {
  const [txIdRows, fpRows, refRows, potRows] = await Promise.all([
    // Stage 1: transactionIds for this bankName (regardless of accountKey)
    prisma.bankStatementTransaction.findMany({
      where: { bankName, transactionId: { not: null } },
      select: { transactionId: true },
    }),

    // Stage 3: fingerprints for this accountKey
    prisma.bankStatementTransaction.findMany({
      where: { accountKey, transactionFingerprint: { not: null } },
      select: { transactionFingerprint: true },
    }),

    // Stage 2: references for this accountKey
    prisma.bankStatementTransaction.findMany({
      where: { accountKey, reference: { not: null } },
      select: { reference: true },
    }),

    // Stage 4: rows for potential duplicate check (date window + accountKey)
    prisma.bankStatementTransaction.findMany({
      where: {
        accountKey,
        ...(fromDate || toDate
          ? {
              statementDate: {
                ...(fromDate ? { gte: new Date(fromDate) } : {}),
                ...(toDate   ? { lte: new Date(toDate)   } : {}),
              },
            }
          : {}),
      },
      select: { statementDate: true, debit: true, credit: true, description: true },
    }),
  ]);

  const transactionIds = new Set(
    txIdRows.map((r) => r.transactionId!).filter(Boolean),
  );
  const fingerprints = new Set(
    fpRows.map((r) => r.transactionFingerprint!).filter(Boolean),
  );
  const references = new Set(
    refRows.map((r) => r.reference!).filter(Boolean),
  );
  const potentialRows = potRows.map((r) => ({
    statementDate: r.statementDate ? r.statementDate.toISOString().substring(0, 10) : null,
    debit:         Number(r.debit),
    credit:        Number(r.credit),
    description:   r.description,
  }));

  return { transactionIds, fingerprints, references, potentialRows };
}

// ── Classify a single row ──────────────────────────────────────────────────────

function classifyRow(tx: StatementTransaction, snap: ExistingSnapshot): DedupResult {
  const accountKey  = buildAccountKey(tx);
  const fingerprint = computeFingerprint(tx);

  // Stage 1: transactionId exact match
  if (tx.transactionId?.trim() && snap.transactionIds.has(tx.transactionId.trim())) {
    return { category: 'SKIP_TRANSACTION_ID', accountKey, fingerprint };
  }

  // Stage 2: reference exact match within accountKey
  if (tx.reference?.trim() && snap.references.has(tx.reference.trim())) {
    return { category: 'SKIP_REFERENCE', accountKey, fingerprint };
  }

  // Stage 3: accountKey + fingerprint match
  if (fingerprint && snap.fingerprints.has(fingerprint)) {
    return { category: 'SKIP_FINGERPRINT', accountKey, fingerprint };
  }

  // Stage 4: potential duplicate by date + amount + similar description
  const txDate = tx.statementDate?.substring(0, 10) ?? null;
  const txDebit  = Math.round((tx.debit  ?? 0) * 1000);
  const txCredit = Math.round((tx.credit ?? 0) * 1000);

  if (txDate) {
    for (const existing of snap.potentialRows) {
      if (existing.statementDate !== txDate) continue;

      const exDebit  = Math.round(existing.debit  * 1000);
      const exCredit = Math.round(existing.credit * 1000);

      const amountMatch = (txDebit > 0 && exDebit === txDebit) ||
                          (txCredit > 0 && exCredit === txCredit);

      if (amountMatch && isSimilarDescription(tx.description, existing.description)) {
        return { category: 'POTENTIAL_DUPLICATE', accountKey, fingerprint };
      }
    }
  }

  // Stage 5: new transaction
  return { category: 'NEW', accountKey, fingerprint };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function classifyRows(
  rows:     StatementTransaction[],
  bankName: string,
): Promise<DedupResult[]> {
  if (rows.length === 0) return [];

  // Determine dominant accountKey from first row with a stable key
  const accountKey = rows.map(buildAccountKey).find((k) => !k.startsWith('BANK:')) ??
                     buildAccountKey(rows[0]!);

  const dates = rows.map((r) => r.statementDate).filter((d): d is string => d != null).sort();
  const fromDate = dates[0] ?? null;
  const toDate   = dates[dates.length - 1] ?? null;

  const snap = await fetchSnapshot(bankName, accountKey, fromDate, toDate);

  return rows.map((tx) => classifyRow(tx, snap));
}

// ── Dedup Summary (for preview) ────────────────────────────────────────────────

export async function buildDedupSummary(
  rows:     StatementTransaction[],
  bankName: string,
): Promise<DedupSummary> {
  const results = await classifyRows(rows, bankName);

  const accountKey = results[0]?.accountKey ?? buildAccountKey(rows[0]!);
  const total = results.length;

  let wouldInsert   = 0;
  let wouldSkipExact = 0;
  let wouldSkipPotential = 0;

  for (const r of results) {
    if (r.category === 'NEW')                 wouldInsert++;
    else if (r.category === 'POTENTIAL_DUPLICATE') wouldSkipPotential++;
    else                                      wouldSkipExact++;
  }

  return {
    accountKey,
    totalInFile:         total,
    wouldInsert,
    wouldSkipExact,
    wouldSkipPotential,
    duplicateRate:  total > 0 ? (wouldSkipExact + wouldSkipPotential) / total : 0,
    newDataRate:    total > 0 ? wouldInsert / total : 0,
  };
}

// ── Coverage Summary (existing data range for accountKey) ─────────────────────

export async function buildCoverageSummary(accountKey: string): Promise<CoverageSummary> {
  const agg = await prisma.bankStatementTransaction.aggregate({
    where: { accountKey },
    _min: { statementDate: true },
    _max: { statementDate: true },
    _count: { id: true },
  });

  const count = agg._count.id;

  return {
    accountKey,
    hasExisting:   count > 0,
    existingFrom:  agg._min.statementDate ? agg._min.statementDate.toISOString().substring(0, 10) : null,
    existingTo:    agg._max.statementDate ? agg._max.statementDate.toISOString().substring(0, 10) : null,
    existingCount: count,
  };
}
