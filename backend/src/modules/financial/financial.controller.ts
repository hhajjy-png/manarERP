import type { Request, Response } from 'express';
import { financialService }  from './financial.service';
import {
  StatementParamsSchema,
  StatementQuerySchema,
  ExportQuerySchema,
  AgingQuerySchema,
} from './financial.schema';
import { recordAudit }     from '@core/middleware/audit';
import { ok }              from '@core/utils/response';
import { sanitizeFilters } from '@shared/services/financial/summary.utils';

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

  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ap-aging-${Date.now()}.${ext}"`);
  res.send(buffer);
}
