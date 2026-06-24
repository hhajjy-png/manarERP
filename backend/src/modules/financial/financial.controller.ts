import type { Request, Response } from 'express';
import { financialService }  from './financial.service';
import {
  StatementParamsSchema,
  StatementQuerySchema,
  ExportQuerySchema,
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

// Parts 3–5 append additional handler functions here.
