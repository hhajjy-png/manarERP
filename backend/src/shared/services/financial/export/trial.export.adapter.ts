import type { FinancialResponse, TrialBalanceAsOfRow, TrialBalancePeriodRow } from '../financial.types';
import { buildSubtitle } from '../summary.utils';
import type { ReportInput } from '../../reportEngine/excel.service';

export function toTrialBalanceReportInput(
  response: FinancialResponse<TrialBalanceAsOfRow | TrialBalancePeriodRow>
): ReportInput {
  const mode     = String(response.metadata?.mode ?? 'as-of');
  const asOfDate = String(response.metadata?.asOfDate ?? '').slice(0, 10);
  const fromDate = String(response.metadata?.fromDate ?? '') || undefined;
  const toDate   = String(response.metadata?.toDate   ?? '') || undefined;

  if (mode === 'as-of') {
    return {
      title:    'ميزان المراجعة',
      subtitle: asOfDate ? `حتى تاريخ ${asOfDate}` : 'كل الفترات',
      columns: [
        { header: 'الكود',        key: 'accountCode',  width: 14 },
        { header: 'اسم الحساب',   key: 'accountName',  width: 28 },
        { header: 'النوع',        key: 'accountType',  width: 14 },
        { header: 'إجمالي مدين',  key: 'totalDebit',   width: 16, numFmt: '#,##0.000', format: 'currency' as const },
        { header: 'إجمالي دائن',  key: 'totalCredit',  width: 16, numFmt: '#,##0.000', format: 'currency' as const },
        { header: 'الرصيد',       key: 'balance',      width: 14, numFmt: '#,##0.000', format: 'currency' as const },
        { header: 'طبيعة الرصيد', key: 'balanceType',  width: 12 },
      ],
      rows: response.rows.map(r => {
        const row = r as TrialBalanceAsOfRow;
        return {
          accountCode: row.accountCode,
          accountName: row.accountName,
          accountType: row.accountType,
          totalDebit:  row.totalDebit,
          totalCredit: row.totalCredit,
          balance:     row.balance,
          balanceType: row.balanceType === 'DEBIT' ? 'مدين' : 'دائن',
        };
      }),
      totalsRow: {
        accountName: 'الإجمالي',
        totalDebit:  response.summary.totalDebit  ?? 0,
        totalCredit: response.summary.totalCredit ?? 0,
      },
    };
  }

  // Period mode
  return {
    title:    'ميزان المراجعة (فترة)',
    subtitle: buildSubtitle(fromDate, toDate),
    columns: [
      { header: 'الكود',          key: 'accountCode',    width: 14 },
      { header: 'اسم الحساب',    key: 'accountName',    width: 28 },
      { header: 'رصيد الافتتاح', key: 'openingBalance', width: 16, numFmt: '#,##0.000', format: 'currency' as const },
      { header: 'مدين الفترة',    key: 'periodDebit',    width: 16, numFmt: '#,##0.000', format: 'currency' as const },
      { header: 'دائن الفترة',    key: 'periodCredit',   width: 16, numFmt: '#,##0.000', format: 'currency' as const },
      { header: 'رصيد الإقفال',  key: 'closingBalance', width: 16, numFmt: '#,##0.000', format: 'currency' as const },
    ],
    rows: response.rows.map(r => {
      const row = r as TrialBalancePeriodRow;
      return {
        accountCode:    row.accountCode,
        accountName:    row.accountName,
        openingBalance: row.openingBalance,
        periodDebit:    row.periodDebit,
        periodCredit:   row.periodCredit,
        closingBalance: row.closingBalance,
      };
    }),
    totalsRow: {
      accountName:  'الإجمالي',
      periodDebit:  response.summary.totalDebit  ?? 0,
      periodCredit: response.summary.totalCredit ?? 0,
    },
  };
}
