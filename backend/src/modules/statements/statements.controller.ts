import type { Request, Response } from 'express';
import { roundMoney } from '@shared/utils/money';
import { buildStatement } from '@shared/services/statement.service';
import { buildExcel } from '@shared/services/reportEngine/excel.service';
import { ok } from '@core/utils/response';
import { formatDisplayDate } from '@shared/utils/dateDisplay';
import { StatementQuerySchema, parseFromDate, parseToDate } from './statements.schema';

/**
 * ÙƒØ§Ù†Øª `Number(n.toFixed(3))` â€” Ø¹Ø§Ø¦Ù„Ø© ØªÙ‚Ø±ÙŠØ¨ Ø«Ø§Ù„Ø«Ø© ØªØ®Ø§Ù„Ù ØªÙ‚Ø±ÙŠØ¨ Ø§Ù„ØªØ±Ø­ÙŠÙ„ Ø¹Ù†Ø¯ Ø§Ù„ØªØ¹Ø§Ø¯Ù„
 * (`toFixed` ØªØ¹Ø·ÙŠ 1.2345 â†’ 1.234 Ø¨ÙŠÙ†Ù…Ø§ Ø§Ù„Ø¯ÙØªØ± ÙŠÙƒØªØ¨ 1.235). Ø§Ù„ÙƒØ´Ù ØµØ§Ø± ÙŠÙØ¹Ø±Ø¶ Ø¨Ù†ÙØ³ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©
 * Ø§Ù„ØªÙŠ ÙƒÙØªØ¨ Ø¨Ù‡Ø§ Ø§Ù„Ù‚ÙŠØ¯.
 */
const formatKwd = roundMoney;

/**
 * ØªØ³Ù…ÙŠØ© Ù†ÙˆØ¹ Ø§Ù„Ø­Ø±ÙƒØ© ÙÙŠ Ø¹Ù…ÙˆØ¯ Â«Ø§Ù„Ù†ÙˆØ¹Â». `INVOICE` Ù†ÙˆØ¹ Ù…Ø±Ø¬Ø¹ **Ù…Ø´ØªØ±Ùƒ**: buildStatement
 * ÙŠÙØµØ¯Ø±Ù‡ Ù„ÙØ§ØªÙˆØ±Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„ ÙˆÙØ§ØªÙˆØ±Ø© Ø§Ù„Ù…ÙˆØ±Ù‘Ø¯ Ù…Ø¹Ù‹Ø§ØŒ Ù„Ø°Ø§ ÙŠÙÙ…Ø±ÙŽÙ‘Ø± Ù†ÙˆØ¹ Ø§Ù„ÙƒÙŠØ§Ù† ØµØ±ÙŠØ­Ù‹Ø§ ÙØªØ­Ù…Ù„ ÙƒÙ„
 * Ø¬Ù‡Ø© ØªØ³Ù…ÙŠØªÙ‡Ø§ Ø§Ù„ØµØ­ÙŠØ­Ø© â€” Â«ÙØ§ØªÙˆØ±Ø© Ù†Ù‚Ù„ÙŠØ§ØªÂ» Ù„Ù„Ø¹Ù…ÙŠÙ„ ÙˆÂ«ÙØ§ØªÙˆØ±Ø© Ù…Ø´ØªØ±ÙŠØ§ØªÂ» Ù„Ù„Ù…ÙˆØ±Ù‘Ø¯ â€” Ø¨Ù†ÙØ³
 * Ø§Ù„ØªØ³Ù…ÙŠØ§Øª Ø§Ù„Ù…Ø¹Ø±ÙˆØ¶Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø´Ø§Ø´Ø©. Ø¹Ø±Ø¶ ÙÙ‚Ø·: Ù„Ø§ ÙŠÙ…Ø³Ù‘ Ù‚ÙŠÙ…Ø© `referenceType` Ù†ÙØ³Ù‡Ø§ (Ø§Ù„ØªÙŠ
 * ØªÙØ³ØªØ®Ø¯Ù… Ø£ÙŠØ¶Ù‹Ø§ ÙƒÙ…ÙØ¹Ø§Ù…Ù„ ÙÙ„ØªØ±Ø© ÙÙŠ Ø§Ù„Ù€API)ØŒ ÙˆÙ„Ø§ ÙŠÙÙ†Ø´Ø¦ Ù†ÙˆØ¹ Ø­Ø±ÙƒØ© ØªÙ‚Ù†ÙŠÙ‹Ø§ Ø¬Ø¯ÙŠØ¯Ù‹Ø§. Ø¨Ù„Ø§ Ù†ÙˆØ¹
 * ÙƒÙŠØ§Ù† ØªØ¨Ù‚Ù‰ Ø§Ù„ØªØ³Ù…ÙŠØ© Ø§Ù„Ù…Ø­Ø§ÙŠØ¯Ø© Â«ÙØ§ØªÙˆØ±Ø©Â» ÙƒÙ…Ø§ ÙƒØ§Ù†Øª.
 */
function refTypeAr(type: string, entityType?: 'CUSTOMER' | 'SUPPLIER'): string {
  if (type === 'INVOICE') {
    if (entityType === 'CUSTOMER') return 'ÙØ§ØªÙˆØ±Ø© Ù†Ù‚Ù„ÙŠØ§Øª';
    if (entityType === 'SUPPLIER') return 'ÙØ§ØªÙˆØ±Ø© Ù…Ø´ØªØ±ÙŠØ§Øª';
    return 'ÙØ§ØªÙˆØ±Ø©';
  }
  if (type === 'PAYMENT') return 'Ø¯ÙØ¹Ø©';
  if (type === 'EXPENSE') return 'Ù…ØµØ±ÙˆÙ';
  return type;
}

const EXCEL_COLUMNS = [
  { header: 'Ø§Ù„ØªØ§Ø±ÙŠØ®', key: 'date', width: 14 },
  { header: 'Ø§Ù„Ù…Ø±Ø¬Ø¹', key: 'reference', width: 20 },
  { header: 'Ø§Ù„Ù†ÙˆØ¹', key: 'referenceTypeAr', width: 14 },
  { header: 'Ø§Ù„Ø¨ÙŠØ§Ù†', key: 'description', width: 30 },
  { header: 'Ù…Ø¯ÙŠÙ†', key: 'debit', width: 14, numFmt: '#,##0.000' },
  { header: 'Ø¯Ø§Ø¦Ù†', key: 'credit', width: 14, numFmt: '#,##0.000' },
  { header: 'Ø§Ù„Ø±ØµÙŠØ¯', key: 'runningBalance', width: 14, numFmt: '#,##0.000' },
  { header: 'Ø§Ù„Ø­Ø§Ù„Ø©', key: 'status', width: 14 },
] as const;

function parseEntityId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const statementsController = {
  async getCustomerStatement(req: Request, res: Response): Promise<void> {
    const entityId = parseEntityId(req.params.id);
    if (!entityId) { res.status(400).json({ success: false, error: 'Ù…Ø¹Ø±Ù‘Ù Ø§Ù„ÙƒÙŠØ§Ù† ØºÙŠØ± ØµØ§Ù„Ø­' }); return; }
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId,
      filters: {
        fromDate: parseFromDate(query.fromDate),
        toDate: parseToDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    ok(res, result);
  },

  async getSupplierStatement(req: Request, res: Response): Promise<void> {
    const entityId = parseEntityId(req.params.id);
    if (!entityId) { res.status(400).json({ success: false, error: 'Ù…Ø¹Ø±Ù‘Ù Ø§Ù„ÙƒÙŠØ§Ù† ØºÙŠØ± ØµØ§Ù„Ø­' }); return; }
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId,
      filters: {
        fromDate: parseFromDate(query.fromDate),
        toDate: parseToDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    ok(res, result);
  },

  async exportCustomerStatement(req: Request, res: Response): Promise<void> {
    const entityId = parseEntityId(req.params.id);
    if (!entityId) { res.status(400).json({ success: false, error: 'Ù…Ø¹Ø±Ù‘Ù Ø§Ù„ÙƒÙŠØ§Ù† ØºÙŠØ± ØµØ§Ù„Ø­' }); return; }
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId,
      filters: {
        fromDate: parseFromDate(query.fromDate),
        toDate: parseToDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    const buf = await buildExcel({
      title: `ÙƒØ´Ù Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¹Ù…ÙŠÙ„ â€” ${result.entityName}`,
      columns: [...EXCEL_COLUMNS],
      rows: result.entries.map((e) => ({
        date: formatDisplayDate(e.date),
        reference: e.reference,
        referenceTypeAr: refTypeAr(e.referenceType, 'CUSTOMER'),
        description: e.description,
        debit: formatKwd(e.debit),
        credit: formatKwd(e.credit),
        runningBalance: formatKwd(e.runningBalance),
        status: e.status,
      })),
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="statement-customer-${entityId}.xlsx"`);
    res.end(buf);
  },

  async exportSupplierStatement(req: Request, res: Response): Promise<void> {
    const entityId = parseEntityId(req.params.id);
    if (!entityId) { res.status(400).json({ success: false, error: 'Ù…Ø¹Ø±Ù‘Ù Ø§Ù„ÙƒÙŠØ§Ù† ØºÙŠØ± ØµØ§Ù„Ø­' }); return; }
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId,
      filters: {
        fromDate: parseFromDate(query.fromDate),
        toDate: parseToDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    const buf = await buildExcel({
      title: `ÙƒØ´Ù Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ±Ø¯ â€” ${result.entityName}`,
      columns: [...EXCEL_COLUMNS],
      rows: result.entries.map((e) => ({
        date: formatDisplayDate(e.date),
        reference: e.reference,
        referenceTypeAr: refTypeAr(e.referenceType, 'SUPPLIER'),
        description: e.description,
        debit: formatKwd(e.debit),
        credit: formatKwd(e.credit),
        runningBalance: formatKwd(e.runningBalance),
        status: e.status,
      })),
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="statement-supplier-${entityId}.xlsx"`);
    res.end(buf);
  },
};

