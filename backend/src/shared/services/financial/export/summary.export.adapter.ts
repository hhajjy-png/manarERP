import type { FinancialResponse, FinancialRow } from '../financial.types';
import { buildSubtitle } from '../summary.utils';

function fmt(n?: number) { return Number((n ?? 0).toFixed(3)); }

export function toSummaryReportInput(response: FinancialResponse<FinancialRow>) {
  const meta = response.metadata ?? {};
  return {
    title:    'الملخص المالي',
    subtitle: buildSubtitle(String(meta.fromDate ?? '') || undefined, String(meta.toDate ?? '') || undefined),
    columns: [
      { header: 'البند',  key: 'label',  width: 28 },
      { header: 'المبلغ', key: 'amount', width: 18, numFmt: '#,##0.000' },
    ],
    rows: [
      { label: 'إجمالي الإيرادات', amount: fmt(meta.totalRevenue   as number) },
      { label: 'إجمالي المصاريف',  amount: fmt(meta.totalExpenses  as number) },
      { label: 'صافي الدخل',       amount: fmt(meta.netIncome      as number) },
      { label: 'إجمالي التحصيلات', amount: fmt(meta.totalCollected as number) },
      { label: 'إجمالي المدفوعات', amount: fmt(meta.totalPaid      as number) },
    ],
    footer: String(meta.disclaimer ?? ''),
  };
}
