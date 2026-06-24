import type { ReportInput } from '../../reportEngine/excel.service';
import type { FinancialResponse, ArAgingRow, ApAgingRow } from '../financial.types';

const AGING_COLUMNS: ReportInput['columns'] = [
  { header: 'الكود',      key: 'code',     width: 14 },
  { header: 'الاسم',      key: 'name',     width: 30 },
  { header: 'جاري',       key: 'current',  width: 14, numFmt: '#,##0.000' },
  { header: '0–30 يوم',   key: '0_30',     width: 14, numFmt: '#,##0.000' },
  { header: '31–60 يوم',  key: '31_60',    width: 14, numFmt: '#,##0.000' },
  { header: '61–90 يوم',  key: '61_90',    width: 14, numFmt: '#,##0.000' },
  { header: '91–120 يوم', key: '91_120',   width: 14, numFmt: '#,##0.000' },
  { header: '+120 يوم',   key: 'over_120', width: 14, numFmt: '#,##0.000' },
  { header: 'الإجمالي',   key: 'total',    width: 14, numFmt: '#,##0.000' },
];

export function toAgingReportInput(
  response: FinancialResponse<ArAgingRow | ApAgingRow>,
  type: 'ar' | 'ap'
): ReportInput {
  const title    = type === 'ar' ? 'أعمار ذمم العملاء (مديونيات)' : 'أعمار ذمم الموردين (دائنية)';
  const asOfDate = String(response.metadata?.asOfDate ?? '').slice(0, 10);

  return {
    title,
    subtitle: asOfDate ? `حتى تاريخ ${asOfDate}` : undefined,
    columns:  [...AGING_COLUMNS],
    rows: response.rows.map(r => {
      const isAr = 'customerId' in r;
      return {
        code:     isAr ? (r as ArAgingRow).customerCode : (r as ApAgingRow).supplierCode,
        name:     isAr ? (r as ArAgingRow).customerName : (r as ApAgingRow).supplierName,
        current:  r.current   || '',
        '0_30':   r['0_30']   || '',
        '31_60':  r['31_60']  || '',
        '61_90':  r['61_90']  || '',
        '91_120': r['91_120'] || '',
        over_120: r.over_120  || '',
        total:    r.total,
      };
    }),
    totalsRow: {
      name:  'الإجمالي',
      total: response.summary.totalOutstanding ?? 0,
    },
  };
}
