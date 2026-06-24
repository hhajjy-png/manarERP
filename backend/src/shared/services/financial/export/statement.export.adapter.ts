import type { FinancialResponse, StatementRow } from '../financial.types';
import type { ReportInput } from '../../reportEngine/excel.service';
import { buildSubtitle, formatDate, translateRefType } from '../summary.utils';

const STATEMENT_EXPORT_COLUMNS: import('../../reportEngine/excel.service').ReportColumn[] = [
  { header: 'التاريخ',  key: 'date',           width: 14 },
  { header: 'المرجع',   key: 'reference',       width: 20 },
  { header: 'النوع',    key: 'referenceType',   width: 14 },
  { header: 'البيان',   key: 'description',     width: 30 },
  { header: 'مدين',     key: 'debit',           width: 14, numFmt: '#,##0.000' },
  { header: 'دائن',     key: 'credit',          width: 14, numFmt: '#,##0.000' },
  { header: 'الرصيد',   key: 'runningBalance',  width: 14, numFmt: '#,##0.000' },
];

export function toStatementReportInput(
  response: FinancialResponse<StatementRow>,
  entityName: string
): ReportInput {
  return {
    title:    `كشف حساب — ${entityName}`,
    subtitle: buildSubtitle(
      String(response.metadata?.fromDate ?? ''),
      String(response.metadata?.toDate   ?? '')
    ),
    columns:  STATEMENT_EXPORT_COLUMNS,
    rows: response.rows.map(r => ({
      date:          formatDate(r.date),
      reference:     r.reference,
      referenceType: translateRefType(r.referenceType),
      description:   r.description,
      debit:         r.debit  || '',
      credit:        r.credit || '',
      runningBalance: r.runningBalance,
    })),
    totalsRow: response.totals ? {
      description:    'الإجمالي',
      debit:          response.summary.totalDebit,
      credit:         response.summary.totalCredit,
      runningBalance: response.summary.closingBalance,
    } : undefined,
  };
}
