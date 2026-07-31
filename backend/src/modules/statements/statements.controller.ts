import type { Request, Response } from 'express';
import { roundMoney } from '@shared/utils/money';
import { buildStatement } from '@shared/services/statement.service';
import { buildExcel } from '@shared/services/reportEngine/excel.service';
import { ok } from '@core/utils/response';
import { formatDisplayDate } from '@shared/utils/dateDisplay';
import { StatementQuerySchema, parseDate } from './statements.schema';

/**
 * كانت `Number(n.toFixed(3))` — عائلة تقريب ثالثة تخالف تقريب الترحيل عند التعادل
 * (`toFixed` تعطي 1.2345 → 1.234 بينما الدفتر يكتب 1.235). الكشف صار يُعرض بنفس القاعدة
 * التي كُتب بها القيد.
 */
const formatKwd = roundMoney;

/**
 * تسمية نوع الحركة في عمود «النوع». `INVOICE` نوع مرجع **مشترك**: buildStatement
 * يُصدره لفاتورة العميل وفاتورة المورّد معًا، لذا يُمرَّر نوع الكيان صريحًا فتحمل كل
 * جهة تسميتها الصحيحة — «فاتورة نقليات» للعميل و«فاتورة مشتريات» للمورّد — بنفس
 * التسميات المعروضة على الشاشة. عرض فقط: لا يمسّ قيمة `referenceType` نفسها (التي
 * تُستخدم أيضًا كمُعامل فلترة في الـAPI)، ولا يُنشئ نوع حركة تقنيًا جديدًا. بلا نوع
 * كيان تبقى التسمية المحايدة «فاتورة» كما كانت.
 */
function refTypeAr(type: string, entityType?: 'CUSTOMER' | 'SUPPLIER'): string {
  if (type === 'INVOICE') {
    if (entityType === 'CUSTOMER') return 'فاتورة نقليات';
    if (entityType === 'SUPPLIER') return 'فاتورة مشتريات';
    return 'فاتورة';
  }
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

function parseEntityId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const statementsController = {
  async getCustomerStatement(req: Request, res: Response): Promise<void> {
    const entityId = parseEntityId(req.params.id);
    if (!entityId) { res.status(400).json({ success: false, error: 'معرّف الكيان غير صالح' }); return; }
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
    const entityId = parseEntityId(req.params.id);
    if (!entityId) { res.status(400).json({ success: false, error: 'معرّف الكيان غير صالح' }); return; }
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
    const entityId = parseEntityId(req.params.id);
    if (!entityId) { res.status(400).json({ success: false, error: 'معرّف الكيان غير صالح' }); return; }
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
    if (!entityId) { res.status(400).json({ success: false, error: 'معرّف الكيان غير صالح' }); return; }
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
