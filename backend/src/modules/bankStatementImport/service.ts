import { prisma } from '@config/database.js';
import { AppError } from '@core/errors/AppError.js';
import { buildPreview } from './previewBuilder.js';
import { normalizeRow, buildNormalizedText } from './normalizer.js';
import { validateRows, detectFileDuplicates } from './validators.js';
import { matchAllTransactions } from './matcher.js';
import { detectBankFee } from './bankFeeDetector.js';
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

// ── Execute import (atomic) ────────────────────────────────────────────────────

export async function execute(req: ExecuteImportRequest, importedBy: string): Promise<ImportResult> {
  const rows   = req.rows as StatementTransaction[];
  const normalized = rows.map(normalizeRow);
  const validations = validateRows(normalized);
  const dupSet = detectFileDuplicates(normalized);
  const matchResults = await matchAllTransactions(normalized);

  // Re-validate: block import if any hard errors exist
  const invalid = validations.filter((v) => v.errors.length > 0);
  if (invalid.length > 0) {
    throw AppError.badRequest(`لا يمكن استيراد الكشف — يوجد ${invalid.length} صف(وف) بها أخطاء`);
  }

  // Compute summary stats
  const totalDebits  = normalized.reduce((s, r) => s + r.debit,  0);
  const totalCredits = normalized.reduce((s, r) => s + r.credit, 0);

  const dates = normalized.map((r) => r.statementDate).filter((d): d is string => d != null).sort();
  const fromDate = req.fromDate ? new Date(req.fromDate) : (dates[0] ? new Date(dates[0]) : undefined);
  const toDate   = req.toDate   ? new Date(req.toDate)   : (dates[dates.length - 1] ? new Date(dates[dates.length - 1]) : undefined);

  const importRecord = await prisma.$transaction(async (tx) => {
    const imp = await tx.bankStatementImport.create({
      data: {
        bankName:     req.bankName,
        fileName:     req.fileName,
        importedBy,
        fromDate,
        toDate,
        totalRows:    normalized.length,
        totalDebits:  Math.round(totalDebits  * 1000) / 1000,
        totalCredits: Math.round(totalCredits * 1000) / 1000,
        status:       'ACTIVE',
      },
    });

    const txData = normalized.map((row, i) => {
      const val       = validations[i];
      const matchRes  = matchResults[i];
      const feeInfo   = detectBankFee(row.description, row.reference);
      const isDup     = dupSet.has(i);
      const best      = matchRes.best;

      return {
        importId:        imp.id,
        transactionId:   row.transactionId,
        bankName:        row.bankName,
        statementDate:   row.statementDate ? new Date(row.statementDate) : null,
        postingDate:     row.postingDate   ? new Date(row.postingDate)   : null,
        description:     row.description,
        reference:       row.reference,
        debit:           row.debit,
        credit:          row.credit,
        balance:         row.balance,
        currency:        row.currency,
        accountNumber:   row.accountNumber,
        iban:            row.iban,
        chequeNumber:    row.chequeNumber,
        rawRow:          JSON.stringify(row.rawRow),
        normalizedText:  buildNormalizedText(row),
        reconcileStatus: (best && best.confidence >= 90) ? 'MATCHED' as const : 'UNMATCHED' as const,
        matchedType:     best?.type    ?? null,
        matchedId:       best?.id      ?? null,
        matchedRef:      best?.ref     ?? null,
        matchConfidence: best?.confidence ?? null,
        isDuplicate:     isDup,
        isBankFee:       feeInfo.isBankFee,
        bankFeeType:     feeInfo.bankFeeType,
        errors:          JSON.stringify(val.errors),
        warnings:        JSON.stringify(val.warnings),
      };
    });

    // Batch insert in chunks of 500 to avoid SQLite parameter limits
    const CHUNK = 500;
    for (let i = 0; i < txData.length; i += CHUNK) {
      await tx.bankStatementTransaction.createMany({ data: txData.slice(i, i + CHUNK) });
    }

    return imp;
  });

  return {
    importId:     importRecord.id,
    bankName:     importRecord.bankName,
    fileName:     importRecord.fileName,
    totalRows:    importRecord.totalRows,
    totalDebits:  importRecord.totalDebits,
    totalCredits: importRecord.totalCredits,
    importedAt:   importRecord.importedAt.toISOString(),
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
