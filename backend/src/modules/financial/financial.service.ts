import { buildStatement }           from '@shared/services/statement.service';
import { buildExcel }               from '@shared/services/reportEngine/excel.service';
import { buildPdf }                 from '@shared/services/reportEngine/pdf.service';
import { wrapFinancialResponse }    from '@shared/services/financial/financial.response';
import { buildDrillDownRef }        from '@shared/services/financial/drilldown.utils';
import type { DrillDownRef }        from '@shared/services/financial/drilldown.utils';
import { normalizeMoney }           from '@shared/services/financial/balance.utils';
import { sanitizeFilters }          from '@shared/services/financial/summary.utils';
import { toStatementReportInput }   from '@shared/services/financial/export/statement.export.adapter';
import type {
  FinancialResponse, StatementRow,
} from '@shared/services/financial/financial.types';

// Parts 3–5 will extend this class with more methods.

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
}

export const financialService = new FinancialService();
