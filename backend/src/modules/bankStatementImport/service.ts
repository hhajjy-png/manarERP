import { prisma } from '@config/database.js';
import type { Prisma } from '@prisma/client';
import { AppError } from '@core/errors/AppError.js';
import { buildPreview } from './previewBuilder.js';
import { normalizeRow, buildNormalizedText } from './normalizer.js';
import { validateRows, detectFileDuplicates } from './validators.js';
import { matchAllTransactions } from './matcher.js';
import { detectBankFee } from './bankFeeDetector.js';
import { classifyRows } from './dedupDetector.js';
import { buildAccountKey, computeFingerprint } from './fingerprint.js';
import {
  getWorkspace,
  updateStatus,
  bulkUpdateStatus,
  type WorkspaceFilter,
  type StatusUpdateInput,
} from './reconciliationEngine.js';
import { generatePostingSuggestions } from './postingSuggestions.js';
import { buildReconciliationReportExcel, buildReconciliationReportHtml } from './reportBuilder.js';
import type {
  StatementTransaction,
  ImportResult,
  ImportPreviewSummary,
  ReconciliationWorkspace,
  PostingSuggestion,
  ReconciliationReport,
  ReconciliationReportRow,
  ReconcileStatus,
  TimelineResult,
  TimelineTransaction,
} from './types.js';
import type {
  PreviewRequest,
  ExecuteImportRequest,
  UpdateStatusRequest,
  BulkUpdateStatusRequest,
} from './schema.js';

// ── Preview ────────────────────────────────────────────────────────────────────

export async function preview(req: PreviewRequest): Promise<ImportPreviewSummary> {
  return buildPreview(req.bankName, req.fileName, req.rows as StatementTransaction[]);
}

// ── Execute import — Incremental v2 ───────────────────────────────────────────

export async function execute(req: ExecuteImportRequest, importedBy: string): Promise<ImportResult> {
  const startMs = Date.now();
  const rows        = req.rows as StatementTransaction[];
  const normalized  = rows.map(normalizeRow);
  const validations = validateRows(normalized);
  const dupSet      = detectFileDuplicates(normalized);

  // Re-validate: block import if any hard errors exist
  const invalid = validations.filter((v) => v.errors.length > 0);
  if (invalid.length > 0) {
    throw AppError.badRequest(`لا يمكن استيراد الكشف — يوجد ${invalid.length} صف(وف) بها أخطاء`);
  }

  // Incremental dedup: classify every row against the DB
  const dedupResults = await classifyRows(normalized, req.bankName);

  // Separate rows that need to be inserted from skipped duplicates
  const insertIndices: number[]  = [];
  const skipIndices:   number[]  = [];
  const potentialIndices: number[] = [];

  for (let i = 0; i < dedupResults.length; i++) {
    const cat = dedupResults[i]!.category;
    if (cat === 'NEW')                  insertIndices.push(i);
    else if (cat === 'POTENTIAL_DUPLICATE') { insertIndices.push(i); potentialIndices.push(i); }
    else                                skipIndices.push(i);
  }

  const matchResults = await matchAllTransactions(normalized.filter((_, i) => insertIndices.includes(i)));

  // Summary stats over ALL rows (file totals stay unchanged)
  const totalDebits  = normalized.reduce((s, r) => s + r.debit,  0);
  const totalCredits = normalized.reduce((s, r) => s + r.credit, 0);

  const dates = normalized.map((r) => r.statementDate).filter((d): d is string => d != null).sort();
  const fromDate = req.fromDate ? new Date(req.fromDate) : (dates[0]   ? new Date(dates[0])   : undefined);
  const toDate   = req.toDate   ? new Date(req.toDate)   : (dates.at(-1) ? new Date(dates.at(-1)!) : undefined);

  // Derive session-level accountKey
  const accountKey = dedupResults[0]?.accountKey ??
                     (normalized[0] ? buildAccountKey(normalized[0]) : null);

  const insertedNewCount        = insertIndices.length - potentialIndices.length;
  const skippedDuplicateCount   = skipIndices.length;
  const potentialDuplicateCount = potentialIndices.length;
  const total = normalized.length;

  const potentialSet = new Set(potentialIndices);

  const importRecord = await prisma.$transaction(async (tx) => {
    const imp = await tx.bankStatementImport.create({
      data: {
        bankName:     req.bankName,
        fileName:     req.fileName,
        importedBy,
        fromDate,
        toDate,
        totalRows:    total,
        totalDebits:  Math.round(totalDebits  * 1000) / 1000,
        totalCredits: Math.round(totalCredits * 1000) / 1000,
        status:       'ACTIVE',
        accountKey,
        insertedNewCount,
        skippedDuplicateCount,
        potentialDuplicateCount,
      },
    });

    // Build insertion data — only for NEW + POTENTIAL rows
    let matchIdx = 0;
    const txData = insertIndices.map((rowIdx) => {
      const row      = normalized[rowIdx]!;
      const val      = validations[rowIdx]!;
      const dedupRes = dedupResults[rowIdx]!;
      const matchRes = matchResults[matchIdx++];
      const feeInfo  = detectBankFee(row.description, row.reference);
      const isDup    = dupSet.has(rowIdx);
      const best     = matchRes?.best ?? null;
      const isPotential = potentialSet.has(rowIdx);

      // Potential duplicates get REVIEW status + a warning flag
      const autoStatus =
        isPotential         ? 'REVIEW' as const :
        best && best.confidence >= 90 ? 'MATCHED' as const :
        'UNMATCHED' as const;

      const warnings = [...val.warnings];
      if (isPotential) warnings.push('POTENTIAL_CROSS_IMPORT_DUPLICATE' as never);

      return {
        importId:              imp.id,
        // 1-based position among this file's data rows, in original file order
        // (rowIdx is the index into `normalized`/`rows`, which the parser already
        // built in file order with header/blank rows excluded). Source of truth
        // for display order and "current balance" — never re-derived from dates.
        statementSequence:     rowIdx + 1,
        transactionId:         row.transactionId,
        bankName:              row.bankName,
        statementDate:         row.statementDate ? new Date(row.statementDate) : null,
        postingDate:           row.postingDate   ? new Date(row.postingDate)   : null,
        description:           row.description,
        reference:             row.reference,
        debit:                 row.debit,
        credit:                row.credit,
        balance:               row.balance,
        currency:              row.currency,
        accountNumber:         row.accountNumber,
        iban:                  row.iban,
        chequeNumber:          row.chequeNumber,
        rawRow:                JSON.stringify(row.rawRow),
        normalizedText:        buildNormalizedText(row),
        reconcileStatus:       autoStatus,
        matchedType:           best?.type ?? null,
        matchedId:             best?.id   ?? null,
        matchedRef:            best?.ref  ?? null,
        matchConfidence:       best?.confidence ?? null,
        isDuplicate:           isDup,
        isBankFee:             feeInfo.isBankFee,
        bankFeeType:           feeInfo.bankFeeType,
        errors:                JSON.stringify(val.errors),
        warnings:              JSON.stringify(warnings),
        accountKey:            dedupRes.accountKey,
        transactionFingerprint: dedupRes.fingerprint,
      };
    });

    // Batch insert in chunks of 500 to avoid SQLite parameter limits
    const CHUNK = 500;
    for (let i = 0; i < txData.length; i += CHUNK) {
      await tx.bankStatementTransaction.createMany({ data: txData.slice(i, i + CHUNK) });
    }

    return imp;
  });

  const executionTimeMs = Date.now() - startMs;

  return {
    importId:                importRecord.id,
    bankName:                importRecord.bankName,
    fileName:                importRecord.fileName,
    totalRows:               total,
    totalDebits:             importRecord.totalDebits,
    totalCredits:            importRecord.totalCredits,
    importedAt:              importRecord.importedAt.toISOString(),
    accountKey,
    insertedNewCount,
    skippedDuplicateCount,
    potentialDuplicateCount,
    duplicateRate:   total > 0 ? (skippedDuplicateCount + potentialDuplicateCount) / total : 0,
    newDataRate:     total > 0 ? insertedNewCount / total : 0,
    executionTimeMs,
  };
}

// ── Workspace ──────────────────────────────────────────────────────────────────

export async function getWorkspaceByImport(
  importId: number,
  query: Record<string, string | undefined>,
): Promise<ReconciliationWorkspace> {
  const filter: WorkspaceFilter = {
    importId,
    status:      query.status as ReconcileStatus | undefined,
    isBankFee:   query.isBankFee   === 'true' ? true : query.isBankFee   === 'false' ? false : undefined,
    isDuplicate: query.isDuplicate === 'true' ? true : query.isDuplicate === 'false' ? false : undefined,
    search:      query.search,
    fromDate:    query.fromDate,
    toDate:      query.toDate,
    minAmount:   query.minAmount ? Number(query.minAmount) : undefined,
    maxAmount:   query.maxAmount ? Number(query.maxAmount) : undefined,
    page:        query.page     ? Number(query.page)     : undefined,
    pageSize:    query.pageSize ? Number(query.pageSize) : undefined,
  };
  return getWorkspace(filter);
}

// ── Status updates ─────────────────────────────────────────────────────────────

export async function updateTransactionStatus(
  importId: number,
  transactionId: number,
  body: UpdateStatusRequest,
): Promise<void> {
  // Verify the transaction belongs to this import
  const tx = await prisma.bankStatementTransaction.findFirst({
    where: { id: transactionId, importId },
  });
  if (!tx) throw AppError.notFound('المعاملة غير موجودة');

  const input: StatusUpdateInput = {
    transactionId,
    status:          body.status as ReconcileStatus,
    matchedType:     body.matchedType,
    matchedId:       body.matchedId,
    matchedRef:      body.matchedRef,
    matchConfidence: body.matchConfidence,
  };
  await updateStatus(input);
}

export async function bulkUpdateTransactionStatus(
  importId: number,
  body: BulkUpdateStatusRequest,
): Promise<{ updated: number }> {
  const count = await bulkUpdateStatus(importId, body.ids, body.status as ReconcileStatus);
  return { updated: count };
}

// ── Posting suggestions ────────────────────────────────────────────────────────

export async function getPostingSuggestions(
  importId: number,
  transactionId: number,
): Promise<PostingSuggestion[]> {
  const tx = await prisma.bankStatementTransaction.findFirst({
    where: { id: transactionId, importId },
  });
  if (!tx) throw AppError.notFound('المعاملة غير موجودة');

  const parsed = {
    id:              tx.id,
    importId:        tx.importId,
    transactionId:   tx.transactionId,
    bankName:        tx.bankName,
    statementDate:   tx.statementDate?.toISOString().substring(0, 10) ?? null,
    postingDate:     tx.postingDate?.toISOString().substring(0, 10) ?? null,
    description:     tx.description,
    reference:       tx.reference,
    debit:           Number(tx.debit),
    credit:          Number(tx.credit),
    balance:         tx.balance != null ? Number(tx.balance) : null,
    currency:        tx.currency,
    chequeNumber:    tx.chequeNumber,
    reconcileStatus: tx.reconcileStatus as ReconcileStatus,
    matchedType:     tx.matchedType as never,
    matchedId:       tx.matchedId,
    matchedRef:      tx.matchedRef,
    matchConfidence: tx.matchConfidence as never,
    isDuplicate:     Boolean(tx.isDuplicate),
    isBankFee:       Boolean(tx.isBankFee),
    bankFeeType:     tx.bankFeeType as never,
    errors:          JSON.parse(tx.errors || '[]') as never,
    warnings:        JSON.parse(tx.warnings || '[]') as never,
  };

  return generatePostingSuggestions(parsed);
}

// ── Report export ──────────────────────────────────────────────────────────────

async function buildReport(importId: number): Promise<ReconciliationReport> {
  const [imp, txs] = await Promise.all([
    prisma.bankStatementImport.findUniqueOrThrow({ where: { id: importId } }),
    prisma.bankStatementTransaction.findMany({
      where: { importId },
      orderBy: { statementDate: 'asc' },
    }),
  ]);

  function mapRow(tx: typeof txs[0]): ReconciliationReportRow {
    return {
      id:              tx.id,
      bankName:        tx.bankName,
      statementDate:   tx.statementDate?.toISOString().substring(0, 10) ?? null,
      description:     tx.description,
      reference:       tx.reference,
      debit:           Number(tx.debit),
      credit:          Number(tx.credit),
      reconcileStatus: tx.reconcileStatus as ReconcileStatus,
      matchedType:     tx.matchedType as never,
      matchedRef:      tx.matchedRef,
      matchConfidence: tx.matchConfidence as never,
      isBankFee:       Boolean(tx.isBankFee),
      bankFeeType:     tx.bankFeeType as never,
    };
  }

  return {
    importId:     imp.id,
    bankName:     imp.bankName,
    fileName:     imp.fileName,
    importedAt:   imp.importedAt.toISOString(),
    generatedAt:  new Date().toISOString(),
    totalRows:    imp.totalRows,
    totalDebits:  imp.totalDebits,
    totalCredits: imp.totalCredits,
    matched:      txs.filter((t) => t.reconcileStatus === 'MATCHED').map(mapRow),
    unmatched:    txs.filter((t) => t.reconcileStatus === 'UNMATCHED' || t.reconcileStatus === 'REVIEW').map(mapRow),
    bankFees:     txs.filter((t) => t.isBankFee).map(mapRow),
  };
}

export async function exportReport(
  importId: number,
  format: 'excel' | 'pdf',
): Promise<{ buffer?: Buffer; html?: string; filename: string; contentType: string }> {
  const report = await buildReport(importId);

  if (format === 'excel') {
    const buffer = await buildReconciliationReportExcel(report);
    return {
      buffer,
      filename:    `bank-reconciliation-${importId}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  const html = buildReconciliationReportHtml(report);
  return {
    html,
    filename:    `bank-reconciliation-${importId}.html`,
    contentType: 'text/html; charset=utf-8',
  };
}

// ── Unified Timeline ───────────────────────────────────────────────────────────

export type TimelineFilterType =
  'all' | 'deposits' | 'withdrawals' | 'fees' | 'cheques' | 'transfers';

// Pure builder for the timeline Prisma where clause. Extracted so the filter
// composition (date + type + amount range + text search) is unit-testable
// without a database.
export function buildTimelineWhere(
  accountKey: string,
  opts: {
    fromDate?:  string;
    toDate?:    string;
    search?:    string;
    type?:      TimelineFilterType;
    minAmount?: number;
    maxAmount?: number;
  } = {},
): Prisma.BankStatementTransactionWhereInput {
  const where: Prisma.BankStatementTransactionWhereInput = { accountKey };
  const and: Prisma.BankStatementTransactionWhereInput[] = [];

  if (opts.fromDate || opts.toDate) {
    where.statementDate = {};
    if (opts.fromDate) where.statementDate.gte = new Date(opts.fromDate);
    if (opts.toDate)   where.statementDate.lte = new Date(opts.toDate);
  }

  switch (opts.type) {
    case 'deposits':    where.credit = { gt: 0 }; break;
    case 'withdrawals': where.debit  = { gt: 0 }; break;
    case 'fees':        where.isBankFee = true; break;
    // A cheque transaction is one that carries a cheque number OR is categorised as a
    // cheque payment — mirrors the display badge (chequeNumber || bankFeeType==='CHEQUE_PAYMENT').
    // Previously matched chequeNumber only, so cheque-payment rows without a parsed cheque
    // number (shown as «شيك») were missing from the filter.
    case 'cheques':     and.push({ OR: [{ chequeNumber: { not: null } }, { bankFeeType: 'CHEQUE_PAYMENT' }] }); break;
    case 'transfers':   where.bankFeeType = 'BANK_TRANSFER'; break;
    default: break; // 'all' / undefined → no type constraint
  }

  // Amount range matches the non-zero side of the transaction (debit OR credit).
  if (opts.minAmount != null) {
    and.push({ OR: [{ debit: { gte: opts.minAmount } }, { credit: { gte: opts.minAmount } }] });
  }
  if (opts.maxAmount != null) {
    and.push({ OR: [
      { debit:  { gt: 0, lte: opts.maxAmount } },
      { credit: { gt: 0, lte: opts.maxAmount } },
    ] });
  }

  if (opts.search) {
    and.push({ OR: [
      { description: { contains: opts.search } },
      { reference:   { contains: opts.search } },
    ] });
  }

  if (and.length) where.AND = and;
  return where;
}

// Default ordering for the Bank Account / Transaction Explorer list.
//
// Source of truth: the bank's original statement file order, not statementDate.
// Business rule — official statement files are ordered newest → oldest, and a
// row's `statementSequence` (1 = first data row = newest, set at import time)
// is that file's row order verbatim. So: most recently imported batch first
// (importId is monotonic with import time), then ascending statementSequence
// within that batch reproduces the original file's row order exactly. `id`
// is a final tiebreaker only for legacy rows imported before statementSequence
// existed (backfilled, but kept here defensively). Exported so the rule is
// unit-testable without a database.
export const TIMELINE_ORDER_BY: Prisma.BankStatementTransactionOrderByWithRelationInput[] = [
  { importId:          'desc' },
  { statementSequence: 'asc' },
  { id:                'asc' },
];

export async function getTimeline(
  accountKey: string,
  page       = 1,
  pageSize   = 50,
  fromDate?:   string,
  toDate?:     string,
  search?:     string,
  type?:       TimelineFilterType,
  minAmount?:  number,
  maxAmount?:  number,
): Promise<TimelineResult> {
  const skip = (page - 1) * pageSize;

  const where = buildTimelineWhere(accountKey, {
    fromDate, toDate, search, type, minAmount, maxAmount,
  });

  const [total, txs, agg, filteredAgg, importCount] = await Promise.all([
    prisma.bankStatementTransaction.count({ where }),
    prisma.bankStatementTransaction.findMany({
      where,
      orderBy: TIMELINE_ORDER_BY,
      skip,
      take:    pageSize,
      include: {
        import: {
          select: { id: true, fileName: true, importedAt: true, bankName: true },
        },
      },
    }),
    prisma.bankStatementTransaction.aggregate({
      where: { accountKey },  // aggregate over the full account, not the filtered window
      _min:  { statementDate: true },
      _max:  { statementDate: true },
    }),
    // Filtered total: sum of the filtered set using the SAME `where` as count/findMany, so it
    // respects every active filter (type + search + date range + amount range). Each row is
    // single-sided (debit XOR credit), so debit+credit = total movement of the matching rows.
    prisma.bankStatementTransaction.aggregate({
      where,
      _sum: { debit: true, credit: true },
    }),
    prisma.bankStatementImport.count({ where: { accountKey } }),
  ]);

  const filteredTotal = Number(filteredAgg._sum.debit ?? 0) + Number(filteredAgg._sum.credit ?? 0);

  const transactions: TimelineTransaction[] = txs.map((t) => ({
    id:               t.id,
    importId:         t.importId,
    importBatchLabel: `Import #${t.importId}`,
    fileName:         t.import.fileName,
    importedAt:       t.import.importedAt.toISOString(),
    bankName:         t.bankName,
    accountKey:       t.accountKey,
    statementDate:    t.statementDate ? t.statementDate.toISOString().substring(0, 10) : null,
    postingDate:      t.postingDate   ? t.postingDate.toISOString().substring(0, 10)   : null,
    description:      t.description,
    reference:        t.reference,
    debit:            Number(t.debit),
    credit:           Number(t.credit),
    balance:          t.balance != null ? Number(t.balance) : null,
    currency:         t.currency,
    chequeNumber:     t.chequeNumber,
    reconcileStatus:  t.reconcileStatus as ReconcileStatus,
    matchedType:      t.matchedType as never,
    matchedRef:       t.matchedRef,
    isDuplicate:      Boolean(t.isDuplicate),
    isBankFee:        Boolean(t.isBankFee),
    bankFeeType:      (t.bankFeeType ?? null) as TimelineTransaction['bankFeeType'],
    transactionFingerprint: t.transactionFingerprint ?? null,
  }));

  return {
    accountKey,
    totalCount:  total,
    filteredTotal,
    fromDate:    agg._min.statementDate ? agg._min.statementDate.toISOString().substring(0, 10) : null,
    toDate:      agg._max.statementDate ? agg._max.statementDate.toISOString().substring(0, 10) : null,
    importCount,
    transactions,
    page,
    pageSize,
  };
}

// ── List imports ───────────────────────────────────────────────────────────────

export async function listImports(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  const [total, items] = await Promise.all([
    prisma.bankStatementImport.count({ where: { status: 'ACTIVE' } }),
    prisma.bankStatementImport.findMany({
      where:   { status: 'ACTIVE' },
      orderBy: { importedAt: 'desc' },
      skip,
      take:    pageSize,
      select: {
        id: true, bankName: true, fileName: true, importedBy: true,
        importedAt: true, fromDate: true, toDate: true,
        totalRows: true, totalDebits: true, totalCredits: true,
        accountKey: true,
        _count: { select: { transactions: true } },
      },
    }),
  ]);

  return { total, page, pageSize, items };
}

// ── Delete imports ─────────────────────────────────────────────────────────────

export async function deleteImport(importId: number): Promise<void> {
  const imp = await prisma.bankStatementImport.findUnique({ where: { id: importId } });
  if (!imp) throw AppError.notFound('الكشف البنكي غير موجود');
  await prisma.bankStatementImport.delete({ where: { id: importId } });
}

export async function bulkDeleteImports(ids: number[]): Promise<{ deleted: number }> {
  const result = await prisma.bankStatementImport.deleteMany({
    where: { id: { in: ids } },
  });
  return { deleted: result.count };
}

export { updateStatus, bulkUpdateStatus };
