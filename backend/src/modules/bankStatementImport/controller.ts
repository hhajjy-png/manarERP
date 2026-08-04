import type { Request, Response } from 'express';
import { asyncHandler } from '@core/utils/asyncHandler.js';
import { ok, created } from '@core/utils/response.js';
import { AppError } from '@core/errors/AppError.js';
import { recordAudit } from '@core/middleware/audit.js';
import {
  PreviewRequestSchema,
  ExecuteImportSchema,
  WorkspaceQuerySchema,
  UpdateStatusSchema,
  BulkUpdateStatusSchema,
  ReportExportSchema,
  BulkDeleteImportSchema,
  TimelineQuerySchema,
  type TimelineQuery,
} from './schema.js';
import * as svc from './service.js';
import { buildExcel } from '@shared/services/reportEngine/excel.service.js';
import {
  buildTimelineReportInput, buildTimelineCsv,
  DIRECTION_LABELS_AR, CATEGORY_LABELS_AR,
} from './timelineExport.js';

// ── Preview ────────────────────────────────────────────────────────────────────

export const previewHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = PreviewRequestSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات غير صحيحة');
  const result = await svc.preview(parsed.data);
  ok(res, result);
});

// ── Execute import ─────────────────────────────────────────────────────────────

export const executeHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = ExecuteImportSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات غير صحيحة');

  const importedBy = req.user?.username ?? 'unknown';
  const result     = await svc.execute(parsed.data, importedBy);

  await recordAudit({
    req,
    action:   'CREATE',
    module:   'bankStatementImport',
    entityId: result.importId,
    newValue: { bankName: result.bankName, fileName: result.fileName, totalRows: result.totalRows },
  });

  created(res, result);
});

// ── List imports ───────────────────────────────────────────────────────────────

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const page     = parseInt(String(req.query.page     ?? '1'),  10);
  const pageSize = parseInt(String(req.query.pageSize ?? '20'), 10);
  const result   = await svc.listImports(page, pageSize);
  ok(res, result);
});

// ── Workspace ──────────────────────────────────────────────────────────────────

export const workspaceHandler = asyncHandler(async (req: Request, res: Response) => {
  const importId = parseInt(req.params.importId!, 10);
  if (isNaN(importId)) throw AppError.badRequest('معرّف الاستيراد غير صحيح');

  const queryParsed = WorkspaceQuerySchema.safeParse(req.query);
  if (!queryParsed.success) throw AppError.badRequest(queryParsed.error.errors[0]?.message ?? 'معامل استعلام غير صحيح');

  const q: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(queryParsed.data)) {
    if (v != null) q[k] = String(v);
  }

  const result = await svc.getWorkspaceByImport(importId, q);
  ok(res, result);
});

// ── Update transaction status ──────────────────────────────────────────────────

export const updateStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const importId      = parseInt(req.params.importId!,      10);
  const transactionId = parseInt(req.params.transactionId!, 10);
  if (isNaN(importId) || isNaN(transactionId)) throw AppError.badRequest('معرّف غير صحيح');

  const parsed = UpdateStatusSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات غير صحيحة');

  await svc.updateTransactionStatus(importId, transactionId, parsed.data);

  await recordAudit({
    req,
    action:   'UPDATE',
    module:   'bankStatementImport',
    entityId: transactionId,
    newValue: { importId, newStatus: parsed.data.status },
  });

  ok(res, { updated: 1 });
});

// ── Bulk update status ─────────────────────────────────────────────────────────

export const bulkUpdateStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const importId = parseInt(req.params.importId!, 10);
  if (isNaN(importId)) throw AppError.badRequest('معرّف الاستيراد غير صحيح');

  const parsed = BulkUpdateStatusSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات غير صحيحة');

  const result = await svc.bulkUpdateTransactionStatus(importId, parsed.data);

  await recordAudit({
    req,
    action:   'UPDATE',
    module:   'bankStatementImport',
    entityId: importId,
    newValue: { bulkCount: result.updated, status: parsed.data.status },
  });

  ok(res, result);
});

// ── Posting suggestions ────────────────────────────────────────────────────────

export const postingSuggestionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const importId      = parseInt(req.params.importId!,      10);
  const transactionId = parseInt(req.params.transactionId!, 10);
  if (isNaN(importId) || isNaN(transactionId)) throw AppError.badRequest('معرّف غير صحيح');

  const suggestions = await svc.getPostingSuggestions(importId, transactionId);
  ok(res, suggestions);
});

// ── Report export ──────────────────────────────────────────────────────────────

export const exportReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const importId = parseInt(req.params.importId!, 10);
  if (isNaN(importId)) throw AppError.badRequest('معرّف الاستيراد غير صحيح');

  const parsed = ReportExportSchema.safeParse(req.query);
  if (!parsed.success) throw AppError.badRequest('الصيغة غير صحيحة — يُسمح بـ excel أو pdf');

  const result = await svc.exportReport(importId, parsed.data.format);

  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Type', result.contentType);

  if (result.html) {
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.send(result.html);
  } else {
    res.send(result.buffer);
  }
});

// ── Delete single import ───────────────────────────────────────────────────────

export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  const importId = parseInt(req.params.importId!, 10);
  if (isNaN(importId)) throw AppError.badRequest('معرّف الاستيراد غير صحيح');

  await svc.deleteImport(importId);

  await recordAudit({
    req,
    action:   'DELETE',
    module:   'bankStatementImport',
    entityId: importId,
  });

  ok(res, { deleted: 1 });
});

// ── Unified Timeline ───────────────────────────────────────────────────────────

export const timelineHandler = asyncHandler(async (req: Request, res: Response) => {
  const accountKey = decodeURIComponent(req.params.accountKey ?? '');
  if (!accountKey) throw AppError.badRequest('مفتاح الحساب مطلوب');

  const parsed = TimelineQuerySchema.safeParse(req.query);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'معامل غير صحيح');

  const result = await svc.getTimeline(
    accountKey,
    parsed.data.page,
    parsed.data.pageSize,
    timelineFilterOptions(parsed.data),
  );
  ok(res, result);
});

/** يحوّل استعلام الشاشة إلى خيارات الفلترة — مصدر واحد للعرض والتصدير معًا. */
function timelineFilterOptions(q: TimelineQuery): svc.TimelineFilterOptions {
  return {
    fromDate:   q.fromDate,
    toDate:     q.toDate,
    search:     q.search,
    type:       q.type,
    direction:  q.direction,
    categories: q.categories as svc.TimelineFilterOptions['categories'],
    minAmount:  q.minAmount,
    maxAmount:  q.maxAmount,
    excludeDuplicates: q.excludeDuplicates,
  };
}

// ── Timeline export (Excel / CSV) ──────────────────────────────────────────────
// يُبنى من **نفس** خيارات الفلترة التي بنت الشاشة، وبنفس الترتيب والتصنيف —
// فالمُصدَّر هو نتيجة الفلترة كاملة، لا الصفحة الحالية.

function describeFilters(q: TimelineQuery): string[] {
  const parts: string[] = [];
  if (q.fromDate || q.toDate) parts.push(`الفترة: ${q.fromDate ?? '…'} — ${q.toDate ?? '…'}`);
  if (q.direction) parts.push(`الاتجاه: ${DIRECTION_LABELS_AR[q.direction]}`);
  if (q.categories?.length) {
    const labels = q.categories.map((c) => CATEGORY_LABELS_AR[c as keyof typeof CATEGORY_LABELS_AR] ?? c);
    parts.push(`التصنيف: ${labels.join('، ')}`);
  }
  if (q.minAmount != null) parts.push(`الحد الأدنى: ${q.minAmount}`);
  if (q.maxAmount != null) parts.push(`الحد الأعلى: ${q.maxAmount}`);
  if (q.search) parts.push(`بحث: ${q.search}`);
  if (q.excludeDuplicates) parts.push('استبعاد التكرارات');
  return parts;
}

export const timelineExportHandler = asyncHandler(async (req: Request, res: Response) => {
  const accountKey = decodeURIComponent(req.params.accountKey ?? '');
  if (!accountKey) throw AppError.badRequest('مفتاح الحساب مطلوب');

  const parsed = TimelineQuerySchema.safeParse(req.query);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'معامل غير صحيح');

  const format = String(req.query.format ?? 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
  const opts = timelineFilterOptions(parsed.data);

  const [{ rows, truncated }, coverage] = await Promise.all([
    svc.getTimelineRows(accountKey, opts),
    svc.getAccountCoverage(accountKey),
  ]);
  const totals = svc.summariseTransactions(rows);

  const ctx = {
    accountKey,
    bankName:      rows[0]?.bankName ?? null,
    filterSummary: describeFilters(parsed.data),
    coverageFrom:  coverage.fromDate,
    coverageTo:    coverage.toDate,
    exportedAt:    new Date(),
    truncated,
  };

  const slug = accountKey.replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 40);
  const stamp = ctx.exportedAt.toISOString().substring(0, 10);

  if (format === 'csv') {
    const csv = buildTimelineCsv(rows, totals, ctx);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="account-ledger-${slug}-${stamp}.csv"`);
    res.send(csv);
    return;
  }

  const buffer = await buildExcel(buildTimelineReportInput(rows, totals, ctx));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="account-ledger-${slug}-${stamp}.xlsx"`);
  res.send(buffer);
});

// ── Bulk delete imports ────────────────────────────────────────────────────────

export const bulkDeleteHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = BulkDeleteImportSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات غير صحيحة');

  const result = await svc.bulkDeleteImports(parsed.data.ids);

  await recordAudit({
    req,
    action:   'DELETE',
    module:   'bankStatementImport',
    entityId: 0,
    newValue: { bulkCount: result.deleted, ids: parsed.data.ids },
  });

  ok(res, result);
});
