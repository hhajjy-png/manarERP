import { buildStatement }              from '@shared/services/statement.service';
import { buildExcel }                  from '@shared/services/reportEngine/excel.service';
import { buildPdf }                    from '@shared/services/reportEngine/pdf.service';
import { wrapFinancialResponse }       from '@shared/services/financial/financial.response';
import { buildDrillDownRef }           from '@shared/services/financial/drilldown.utils';
import type { DrillDownRef }           from '@shared/services/financial/drilldown.utils';
import { normalizeMoney }              from '@shared/services/financial/balance.utils';
import { sanitizeFilters }             from '@shared/services/financial/summary.utils';
import { calculateAgingBuckets, DEFAULT_AGING_BUCKETS } from '@shared/services/financial/aging.utils';
import { toStatementReportInput }      from '@shared/services/financial/export/statement.export.adapter';
import { toAgingReportInput }          from '@shared/services/financial/export/aging.export.adapter';
import { prisma }                      from '@config/database';
import type {
  FinancialResponse, StatementRow, ArAgingRow, ApAgingRow,
} from '@shared/services/financial/financial.types';

export class FinancialService {

  // ─── Statement ─────────────────────────────────────────────────────────────

  async getStatement(
    entityType: string,
    entityId: number,
    filters: { fromDate?: string; toDate?: string; search?: string; referenceType?: string; status?: string }
  ): Promise<FinancialResponse<StatementRow>> {

    const result = await buildStatement({
      entityType: entityType.toUpperCase() as 'CUSTOMER' | 'SUPPLIER',
      entityId,
      filters: {
        fromDate:      filters.fromDate  ? new Date(filters.fromDate)  : undefined,
        toDate:        filters.toDate    ? new Date(filters.toDate)    : undefined,
        search:        filters.search,
        referenceType: filters.referenceType as 'INVOICE' | 'PAYMENT' | 'EXPENSE' | undefined,
        status:        filters.status,
      },
    });

    const rows: StatementRow[] = result.entries.map(entry => ({
      // M4 FIX: timestamp fallback prevents 'STMT-INVOICE-undefined' for entries without referenceId
      id: `STMT-${entry.referenceType}-${entry.referenceId ?? new Date(entry.date).getTime()}`,
      date:           entry.date instanceof Date ? entry.date.toISOString() : String(entry.date),
      reference:      entry.reference,
      referenceType:  entry.referenceType,
      referenceId:    entry.referenceId,
      description:    entry.description,
      debit:          normalizeMoney(entry.debit),
      credit:         normalizeMoney(entry.credit),
      runningBalance: normalizeMoney(entry.runningBalance),
      status:         entry.status,
      drillDown: entry.referenceId
        ? buildDrillDownRef(entry.referenceType as DrillDownRef['entityType'], entry.referenceId)
        : undefined,
    }));

    return wrapFinancialResponse<StatementRow>({
      reportType: 'statement',
      summary: {
        openingBalance:   normalizeMoney(result.summary.openingBalance),
        totalDebit:       normalizeMoney(result.summary.totalDebit),
        totalCredit:      normalizeMoney(result.summary.totalCredit),
        closingBalance:   normalizeMoney(result.summary.closingBalance),
        transactionCount: rows.length,
      },
      metadata: {
        entityType:  result.entityType,
        entityName:  result.entityName,
        entityCode:  result.entityCode,
        fromDate:    filters.fromDate,
        toDate:      filters.toDate,
      },
      filters: sanitizeFilters(filters as Record<string, unknown>),
      rows,
      totals: {
        id:             'TOTALS',
        description:    'الإجمالي',
        debit:          normalizeMoney(result.summary.totalDebit),
        credit:         normalizeMoney(result.summary.totalCredit),
        runningBalance: normalizeMoney(result.summary.closingBalance),
      } as Partial<StatementRow>,
    });
  }

  async exportStatement(
    entityType: string,
    entityId: number,
    filters: { fromDate?: string; toDate?: string; search?: string; referenceType?: string },
    format: 'pdf' | 'excel'
  ): Promise<Buffer> {
    const data       = await this.getStatement(entityType, entityId, filters);
    const entityName = String(data.metadata?.entityName ?? '');
    const input      = toStatementReportInput(data, entityName);
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }

  // ─── AR Aging ─────────────────────────────────────────────────────────────

  async getArAging(filters: {
    asOfDate?:    string;
    search?:      string;
    customerType?: string;
    hideZero?:    boolean;
  }): Promise<FinancialResponse<ArAgingRow>> {
    const asOfDate = filters.asOfDate ? new Date(filters.asOfDate) : new Date();

    const customers = await prisma.customer.findMany({
      where: {
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search } },
            { code: { contains: filters.search } },
          ],
        }),
        ...(filters.customerType && { type: filters.customerType as 'GOVERNMENT' | 'PRIVATE' }),
      },
      select: {
        id: true, code: true, name: true,
        invoices: {
          where: {
            direction: 'SALES',
            status:    { notIn: ['PAID', 'CANCELLED'] },
          },
          select: {
            id: true, dueDate: true, issueDate: true,
            total: true, paidAmount: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const validRows: ArAgingRow[] = [];

    for (const customer of customers) {
      const outstanding = customer.invoices
        .map(inv => ({
          dueDate:           inv.dueDate ?? inv.issueDate,
          outstandingAmount: normalizeMoney(inv.total - inv.paidAmount),
        }))
        .filter(o => o.outstandingAmount > 0);

      const buckets = calculateAgingBuckets(outstanding, asOfDate, DEFAULT_AGING_BUCKETS);

      if (filters.hideZero && buckets.total === 0) continue;

      const lastInvoiceDate = customer.invoices
        .map(inv => inv.issueDate)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      validRows.push({
        id:              `AR-${customer.id}`,
        customerId:      customer.id,
        customerCode:    customer.code,
        customerName:    customer.name,
        current:         buckets['current']  ?? 0,
        '0_30':          buckets['0_30']     ?? 0,
        '31_60':         buckets['31_60']    ?? 0,
        '61_90':         buckets['61_90']    ?? 0,
        '91_120':        buckets['91_120']   ?? 0,
        over_120:        buckets['over_120'] ?? 0,
        total:           buckets.total,
        lastInvoiceDate: lastInvoiceDate?.toISOString(),
        invoiceCount:    customer.invoices.length,
        drillDown:       buildDrillDownRef('CUSTOMER', customer.id, customer.name),
      });
    }

    const totalOutstanding = normalizeMoney(validRows.reduce((s, r) => s + r.total, 0));
    const criticalOver90   = normalizeMoney(validRows.reduce((s, r) => s + r.over_120 + r['91_120'], 0));

    return wrapFinancialResponse<ArAgingRow>({
      reportType: 'ar-aging',
      summary:    { totalOutstanding, criticalOver90, entityCount: validRows.length },
      metadata:   { asOfDate: asOfDate.toISOString() },
      filters:    sanitizeFilters(filters as Record<string, unknown>),
      rows:       validRows,
    });
  }

  async exportArAging(
    filters: { asOfDate?: string; search?: string; customerType?: string; hideZero?: boolean },
    format:  'pdf' | 'excel'
  ): Promise<Buffer> {
    const data  = await this.getArAging(filters);
    const input = toAgingReportInput(data, 'ar');
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }

  // ─── AP Aging ─────────────────────────────────────────────────────────────

  async getApAging(filters: {
    asOfDate?: string;
    search?:   string;
    hideZero?: boolean;
  }): Promise<FinancialResponse<ApAgingRow>> {
    const asOfDate = filters.asOfDate ? new Date(filters.asOfDate) : new Date();

    const suppliers = await prisma.supplier.findMany({
      where: {
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search } },
            { code: { contains: filters.search } },
          ],
        }),
      },
      select: {
        id: true, code: true, name: true,
        invoices: {
          where: {
            direction: 'PURCHASE',
            status:    { notIn: ['PAID', 'CANCELLED'] },
          },
          select: {
            id: true, dueDate: true, issueDate: true,
            total: true, paidAmount: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const validRows: ApAgingRow[] = [];

    for (const supplier of suppliers) {
      const outstanding = supplier.invoices
        .map(inv => ({
          dueDate:           inv.dueDate ?? inv.issueDate,
          outstandingAmount: normalizeMoney(inv.total - inv.paidAmount),
        }))
        .filter(o => o.outstandingAmount > 0);

      const buckets = calculateAgingBuckets(outstanding, asOfDate, DEFAULT_AGING_BUCKETS);

      if (filters.hideZero && buckets.total === 0) continue;

      const lastInvoiceDate = supplier.invoices
        .map(inv => inv.issueDate)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      validRows.push({
        id:              `AP-${supplier.id}`,
        supplierId:      supplier.id,
        supplierCode:    supplier.code,
        supplierName:    supplier.name,
        current:         buckets['current']  ?? 0,
        '0_30':          buckets['0_30']     ?? 0,
        '31_60':         buckets['31_60']    ?? 0,
        '61_90':         buckets['61_90']    ?? 0,
        '91_120':        buckets['91_120']   ?? 0,
        over_120:        buckets['over_120'] ?? 0,
        total:           buckets.total,
        lastInvoiceDate: lastInvoiceDate?.toISOString(),
        invoiceCount:    supplier.invoices.length,
        drillDown:       buildDrillDownRef('SUPPLIER', supplier.id, supplier.name),
      });
    }

    const totalOutstanding = normalizeMoney(validRows.reduce((s, r) => s + r.total, 0));
    const criticalOver90   = normalizeMoney(validRows.reduce((s, r) => s + r.over_120 + r['91_120'], 0));

    return wrapFinancialResponse<ApAgingRow>({
      reportType: 'ap-aging',
      summary:    { totalOutstanding, criticalOver90, entityCount: validRows.length },
      metadata:   { asOfDate: asOfDate.toISOString() },
      filters:    sanitizeFilters(filters as Record<string, unknown>),
      rows:       validRows,
    });
  }

  async exportApAging(
    filters: { asOfDate?: string; search?: string; hideZero?: boolean },
    format:  'pdf' | 'excel'
  ): Promise<Buffer> {
    const data  = await this.getApAging(filters);
    const input = toAgingReportInput(data, 'ap');
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }
}

export const financialService = new FinancialService();
