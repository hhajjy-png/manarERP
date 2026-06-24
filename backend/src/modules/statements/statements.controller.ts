import type { Request, Response } from 'express';
import { buildStatement } from '@shared/services/statement.service';
import { buildExcel } from '@shared/services/reportEngine/excel.service';
import { ok } from '@core/utils/response';
import { StatementQuerySchema, parseDate } from './statements.schema';

const formatKwd = (n: number) => Number(n.toFixed(3));

function refTypeAr(type: string): string {
  if (type === 'INVOICE') return 'فاتورة';
  if (type === 'PAYMENT') return 'دفعة';
  if (type === 'EXPENSE') return 'مصروف';
  return type;
}

const EXCEL_COLUMNS = [
  { header: 'التاريخ', key: 'date', width: 14 },
  { header: 'المرجع', key: 'reference', width: 20 },
  { header: 'النوع', key: 'referenceTypeAr', width: 14 },
  { header: 'البيان', key: 'description', width: 30 },
  { header: 'مدين', key: 'debit', width: 14, numFmt: '#,##0.000' },
  { header: 'دائن', key: 'credit', width: 14, numFmt: '#,##0.000' },
  { header: 'الرصيد', key: 'runningBalance', width: 14, numFmt: '#,##0.000' },
  { header: 'الحالة', key: 'status', width: 14 },
] as const;

export const statementsController = {
  async getCustomerStatement(req: Request, res: Response): Promise<void> {
    const entityId = Number(req.params.id);
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId,
      filters: {
        fromDate: parseDate(query.fromDate),
        toDate: parseDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    ok(res, result);
  },

  async getSupplierStatement(req: Request, res: Response): Promise<void> {
    const entityId = Number(req.params.id);
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId,
      filters: {
        fromDate: parseDate(query.fromDate),
        toDate: parseDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    ok(res, result);
  },

  async exportCustomerStatement(req: Request, res: Response): Promise<void> {
    const entityId = Number(req.params.id);
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId,
      filters: {
        fromDate: parseDate(query.fromDate),
        toDate: parseDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    const buf = await buildExcel({
      title: `كشف حساب العميل — ${result.entityName}`,
      columns: [...EXCEL_COLUMNS],
      rows: result.entries.map((e) => ({
        date: e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date),
        reference: e.reference,
        referenceTypeAr: refTypeAr(e.referenceType),
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
    const entityId = Number(req.params.id);
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId,
      filters: {
        fromDate: parseDate(query.fromDate),
        toDate: parseDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    const buf = await buildExcel({
      title: `كشف حساب المورد — ${result.entityName}`,
      columns: [...EXCEL_COLUMNS],
      rows: result.entries.map((e) => ({
        date: e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date),
        reference: e.reference,
        referenceTypeAr: refTypeAr(e.referenceType),
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
