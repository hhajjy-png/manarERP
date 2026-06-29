import { prisma } from '@config/database.js';
import type { ReconcileStatus, ReconciliationTransaction, ReconciliationWorkspace } from './types.js';

// ── Status transition rules ────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ReconcileStatus, ReconcileStatus[]> = {
  UNMATCHED: ['MATCHED', 'IGNORED', 'REVIEW'],
  REVIEW:    ['MATCHED', 'IGNORED', 'UNMATCHED'],
  MATCHED:   ['UNMATCHED', 'IGNORED'],
  IGNORED:   ['UNMATCHED', 'MATCHED'],
  DUPLICATE: ['IGNORED', 'UNMATCHED'],
};

export function isTransitionAllowed(from: ReconcileStatus, to: ReconcileStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Workspace query ────────────────────────────────────────────────────────────

export interface WorkspaceFilter {
  importId:   number;
  status?:    ReconcileStatus;
  isBankFee?: boolean;
  isDuplicate?: boolean;
  search?:    string;
  fromDate?:  string;
  toDate?:    string;
  minAmount?: number;
  maxAmount?: number;
  page?:      number;
  pageSize?:  number;
}

function buildWhereClause(f: WorkspaceFilter) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { importId: f.importId };

  if (f.status)             where.reconcileStatus = f.status;
  if (f.isBankFee != null)  where.isBankFee       = f.isBankFee;
  if (f.isDuplicate != null) where.isDuplicate     = f.isDuplicate;

  if (f.search) {
    where.OR = [
      { description:    { contains: f.search } },
      { reference:      { contains: f.search } },
      { transactionId:  { contains: f.search } },
      { chequeNumber:   { contains: f.search } },
      { normalizedText: { contains: f.search } },
    ];
  }

  if (f.fromDate) where.statementDate = { ...where.statementDate, gte: new Date(f.fromDate) };
  if (f.toDate)   where.statementDate = { ...where.statementDate, lte: new Date(f.toDate) };

  if (f.minAmount != null || f.maxAmount != null) {
    // Filter by max of debit/credit
    const amtFilter: Record<string, number> = {};
    if (f.minAmount != null) amtFilter.gte = f.minAmount;
    if (f.maxAmount != null) amtFilter.lte = f.maxAmount;
    where.OR = [
      ...(where.OR ?? []),
      { debit:  amtFilter },
      { credit: amtFilter },
    ];
  }

  return where;
}

function mapTransaction(tx: Record<string, unknown>): ReconciliationTransaction {
  return {
    id:              tx.id as number,
    importId:        tx.importId as number,
    transactionId:   tx.transactionId as string | null,
    bankName:        tx.bankName as string,
    statementDate:   tx.statementDate ? (tx.statementDate as Date).toISOString().substring(0, 10) : null,
    postingDate:     tx.postingDate   ? (tx.postingDate   as Date).toISOString().substring(0, 10) : null,
    description:     tx.description as string,
    reference:       tx.reference as string | null,
    debit:           Number(tx.debit),
    credit:          Number(tx.credit),
    balance:         tx.balance != null ? Number(tx.balance) : null,
    currency:        tx.currency as string,
    chequeNumber:    tx.chequeNumber as string | null,
    reconcileStatus: tx.reconcileStatus as ReconcileStatus,
    matchedType:     (tx.matchedType ?? null) as ReconciliationTransaction['matchedType'],
    matchedId:       (tx.matchedId  ?? null) as number | null,
    matchedRef:      (tx.matchedRef ?? null) as string | null,
    matchConfidence: (tx.matchConfidence ?? null) as ReconciliationTransaction['matchConfidence'],
    isDuplicate:     Boolean(tx.isDuplicate),
    isBankFee:       Boolean(tx.isBankFee),
    bankFeeType:     (tx.bankFeeType ?? null) as ReconciliationTransaction['bankFeeType'],
    errors:          JSON.parse(tx.errors as string || '[]') as ReconciliationTransaction['errors'],
    warnings:        JSON.parse(tx.warnings as string || '[]') as ReconciliationTransaction['warnings'],
  };
}

export async function getWorkspace(filter: WorkspaceFilter): Promise<ReconciliationWorkspace> {
  const page     = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 50));
  const where    = buildWhereClause(filter);

  const [importRec, total, transactions, counts] = await Promise.all([
    prisma.bankStatementImport.findUniqueOrThrow({ where: { id: filter.importId } }),
    prisma.bankStatementTransaction.count({ where }),
    prisma.bankStatementTransaction.findMany({
      where,
      orderBy: { statementDate: 'asc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.bankStatementTransaction.groupBy({
      by: ['reconcileStatus'],
      where: { importId: filter.importId },
      _count: true,
    }),
  ]);

  const statusCounts = Object.fromEntries(counts.map((c) => [c.reconcileStatus, c._count]));

  return {
    importId:     importRec.id,
    bankName:     importRec.bankName,
    fileName:     importRec.fileName,
    importedAt:   importRec.importedAt.toISOString(),
    totalRows:    importRec.totalRows,
    unmatched:    statusCounts['UNMATCHED']  ?? 0,
    matched:      statusCounts['MATCHED']    ?? 0,
    ignored:      statusCounts['IGNORED']    ?? 0,
    duplicates:   statusCounts['DUPLICATE']  ?? 0,
    review:       statusCounts['REVIEW']     ?? 0,
    transactions: transactions.map(mapTransaction),
    page,
    pageSize,
    total,
    accountKey:   importRec.accountKey ?? null,
  };
}

// ── Status updates ─────────────────────────────────────────────────────────────

export interface StatusUpdateInput {
  transactionId: number;
  status:        ReconcileStatus;
  matchedType?:  string | null;
  matchedId?:    number | null;
  matchedRef?:   string | null;
  matchConfidence?: number | null;
}

export async function updateStatus(input: StatusUpdateInput): Promise<void> {
  const tx = await prisma.bankStatementTransaction.findUniqueOrThrow({
    where: { id: input.transactionId },
  });

  if (!isTransitionAllowed(tx.reconcileStatus as ReconcileStatus, input.status)) {
    throw new Error(`لا يمكن الانتقال من ${tx.reconcileStatus} إلى ${input.status}`);
  }

  await prisma.bankStatementTransaction.update({
    where: { id: input.transactionId },
    data:  {
      reconcileStatus: input.status,
      matchedType:     input.matchedType  ?? null,
      matchedId:       input.matchedId    ?? null,
      matchedRef:      input.matchedRef   ?? null,
      matchConfidence: input.matchConfidence ?? null,
      updatedAt:       new Date(),
    },
  });
}

export async function bulkUpdateStatus(
  importId: number,
  ids: number[],
  status: ReconcileStatus,
): Promise<number> {
  if (ids.length === 0) return 0;

  // Fetch current statuses to validate transitions
  const txs = await prisma.bankStatementTransaction.findMany({
    where: { id: { in: ids }, importId },
    select: { id: true, reconcileStatus: true },
  });

  const allowed = txs
    .filter((t) => isTransitionAllowed(t.reconcileStatus as ReconcileStatus, status))
    .map((t) => t.id);

  if (allowed.length === 0) return 0;

  const result = await prisma.bankStatementTransaction.updateMany({
    where: { id: { in: allowed }, importId },
    data:  { reconcileStatus: status, updatedAt: new Date() },
  });

  return result.count;
}
