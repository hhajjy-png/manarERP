import type { Request, Response } from 'express';
import { z }                from 'zod';
import { financialService } from './financial.service';
import {
  StatementParamsSchema,
  StatementQuerySchema,
  ExportQuerySchema,
  AgingQuerySchema,
  GlStatementQuerySchema,
  GlReportQuerySchema,
  TrialBalanceQuerySchema,
  JournalBookQuerySchema,
  SummaryQuerySchema,
} from './financial.schema';
import { recordAudit }     from '@core/middleware/audit';
import { ok }              from '@core/utils/response';
import { sanitizeFilters } from '@shared/services/financial/summary.utils';

function sendFile(res: Response, buffer: Buffer, name: string, format: 'pdf' | 'excel') {
  const ext         = format === 'pdf' ? 'pdf' : 'xlsx';
  const contentType = format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${Date.now()}.${ext}"`);
  res.send(buffer);
}

// ─── Statement ───────────────────────────────────────────────────────────────

export async function getStatement(req: Request, res: Response): Promise<void> {
  const { entityType, id } = StatementParamsSchema.parse(req.params);
  const filters = StatementQuerySchema.parse(req.query);
  const data    = await financialService.getStatement(entityType, id, filters);
  ok(res, data);
}

export async function exportStatement(req: Request, res: Response): Promise<void> {
  const { entityType, id } = StatementParamsSchema.parse(req.params);
  const query  = ExportQuerySchema.parse(req.query);
  const format = query.format as 'pdf' | 'excel';

  const buffer = await financialService.exportStatement(entityType, id, query, format);

  recordAudit({
    req,
    action:   'REPORT_EXPORT',
    module:   'financial',
    entityId: undefined,
    newValue: {
      reportType: 'statement',
      entityType,
      entityId: id,
      format,
      filters: sanitizeFilters(query as Record<string, unknown>),
    },
  }).catch(() => {});

  const contentType = format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="statement-${entityType}-${id}-${Date.now()}.${ext}"`);
  res.send(buffer);
}

// ─── AR Aging ────────────────────────────────────────────────────────────────

export async function getArAging(req: Request, res: Response): Promise<void> {
  const query = AgingQuerySchema.parse(req.query);
  const data  = await financialService.getArAging(query);
  ok(res, data);
}

export async function exportArAging(req: Request, res: Response): Promise<void> {
  const query  = AgingQuerySchema.parse(req.query);
  const format = (query.format ?? 'excel') as 'pdf' | 'excel';
  const buffer = await financialService.exportArAging(query, format);

  recordAudit({
    req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined,
    newValue: { reportType: 'ar-aging', format, filters: sanitizeFilters(query as Record<string, unknown>) },
  }).catch(() => {});

  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ar-aging-${Date.now()}.${ext}"`);
  res.send(buffer);
}

// ─── AP Aging ────────────────────────────────────────────────────────────────

export async function getApAging(req: Request, res: Response): Promise<void> {
  const query = AgingQuerySchema.omit({ customerType: true }).parse(req.query);
  const data  = await financialService.getApAging(query);
  ok(res, data);
}

export async function exportApAging(req: Request, res: Response): Promise<void> {
  const query  = AgingQuerySchema.omit({ customerType: true }).parse(req.query);
  const format = (query.format ?? 'excel') as 'pdf' | 'excel';
  const buffer = await financialService.exportApAging(query, format);

  recordAudit({
    req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined,
    newValue: { reportType: 'ap-aging', format, filters: sanitizeFilters(query as Record<string, unknown>) },
  }).catch(() => {});

  sendFile(res, buffer, 'ap-aging', format);
}

// ─── GL Statement ─────────────────────────────────────────────────────────────

export async function getGlStatement(req: Request, res: Response): Promise<void> {
  const accountId = z.coerce.number().int().positive().parse(req.params.accountId);
  const query     = GlStatementQuerySchema.parse(req.query);
  ok(res, await financialService.getGlStatement(accountId, query));
}

export async function exportGlStatement(req: Request, res: Response): Promise<void> {
  const accountId = z.coerce.number().int().positive().parse(req.params.accountId);
  const query     = GlStatementQuerySchema.extend({ format: z.enum(['pdf', 'excel']).default('excel') }).parse(req.query);
  const format    = query.format as 'pdf' | 'excel';
  const buffer    = await financialService.exportGlStatement(accountId, query, format);
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined,
    newValue: { reportType: 'gl-statement', format, filters: sanitizeFilters(query as Record<string, unknown>) } }).catch(() => {});
  sendFile(res, buffer, `gl-statement-${accountId}`, format);
}

// ─── GL Report ────────────────────────────────────────────────────────────────

export async function getGlReport(req: Request, res: Response): Promise<void> {
  const query = GlReportQuerySchema.parse(req.query);
  ok(res, await financialService.getGlReport(query));
}

export async function exportGlReport(req: Request, res: Response): Promise<void> {
  const query  = GlReportQuerySchema.parse(req.query);
  const format = (query.format ?? 'excel') as 'pdf' | 'excel';
  const buffer = await financialService.exportGlReport(query, format);
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined,
    newValue: { reportType: 'gl-report', format, filters: sanitizeFilters(query as Record<string, unknown>) } }).catch(() => {});
  sendFile(res, buffer, 'gl-report', format);
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

export async function getTrialBalance(req: Request, res: Response): Promise<void> {
  const query = TrialBalanceQuerySchema.parse(req.query);
  ok(res, await financialService.getTrialBalance(query));
}

export async function exportTrialBalance(req: Request, res: Response): Promise<void> {
  const query  = TrialBalanceQuerySchema.parse(req.query);
  const format = (query.format ?? 'excel') as 'pdf' | 'excel';
  const buffer = await financialService.exportTrialBalance(query, format);
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined,
    newValue: { reportType: 'trial-balance', format, filters: sanitizeFilters(query as Record<string, unknown>) } }).catch(() => {});
  sendFile(res, buffer, 'trial-balance', format);
}

// ─── Journal Book ─────────────────────────────────────────────────────────────

export async function getJournalBook(req: Request, res: Response): Promise<void> {
  const query = JournalBookQuerySchema.parse(req.query);
  ok(res, await financialService.getJournalBook(query));
}

export async function exportJournalBook(req: Request, res: Response): Promise<void> {
  const query  = JournalBookQuerySchema.parse(req.query);
  const format = (query.format ?? 'excel') as 'pdf' | 'excel';
  const buffer = await financialService.exportJournalBook(query, format);
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined,
    newValue: { reportType: 'journal-book', format, filters: sanitizeFilters(query as Record<string, unknown>) } }).catch(() => {});
  sendFile(res, buffer, 'journal-book', format);
}

// ─── Financial Summary ────────────────────────────────────────────────────────

export async function getFinancialSummary(req: Request, res: Response): Promise<void> {
  const query = SummaryQuerySchema.parse(req.query);
  ok(res, await financialService.getFinancialSummary(query));
}

export async function exportFinancialSummary(req: Request, res: Response): Promise<void> {
  const query  = SummaryQuerySchema.parse(req.query);
  const format = (query.format ?? 'excel') as 'pdf' | 'excel';
  const buffer = await financialService.exportFinancialSummary(query, format);
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined,
    newValue: { reportType: 'financial-summary', format, filters: sanitizeFilters(query as Record<string, unknown>) } }).catch(() => {});
  sendFile(res, buffer, 'financial-summary', format);
}

// ─── Dashboard Summary ────────────────────────────────────────────────────────

export async function getDashboardSummary(req: Request, res: Response): Promise<void> {
  const data = await financialService.getDashboardSummary();
  const ageSeconds = Math.floor((Date.now() - new Date(data.generatedAt).getTime()) / 1000);
  res.setHeader('X-Cache-Age', String(ageSeconds));
  ok(res, data);
}
