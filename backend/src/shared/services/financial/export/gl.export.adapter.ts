import type { FinancialResponse, GlStatementRow, GlReportResponse } from '../financial.types';
import { buildSubtitle, formatDate, translateRefType } from '../summary.utils';
import type { ReportInput } from '../../reportEngine/excel.service';

export function toGlStatementReportInput(response: FinancialResponse<GlStatementRow>): ReportInput {
  const accountName = String(response.metadata?.accountName ?? '');
  const accountCode = String(response.metadata?.accountCode ?? '');
  const fromDate    = String(response.metadata?.fromDate ?? '');
  const toDate      = String(response.metadata?.toDate   ?? '');
  return {
    title:    `كشف الأستاذ — ${accountCode} ${accountName}`,
    subtitle: buildSubtitle(fromDate, toDate),
    columns: [
      { header: 'التاريخ',    key: 'date',           width: 14 },
      { header: 'رقم القيد',  key: 'journalNumber',  width: 18 },
      { header: 'النوع',      key: 'referenceType',  width: 12 },
      { header: 'البيان',     key: 'description',    width: 28 },
      { header: 'مدين',       key: 'debit',          width: 14, numFmt: '#,##0.000', format: 'currency' as const },
      { header: 'دائن',       key: 'credit',         width: 14, numFmt: '#,##0.000', format: 'currency' as const },
      { header: 'الرصيد',     key: 'runningBalance', width: 14, numFmt: '#,##0.000', format: 'currency' as const },
    ],
    rows: response.rows.map(r => ({
      date:           formatDate(r.date),
      journalNumber:  r.journalNumber,
      referenceType:  translateRefType(r.referenceType),
      description:    r.description,
      debit:          r.debit   || '',
      credit:         r.credit  || '',
      runningBalance: r.runningBalance,
    })),
    totalsRow: {
      description:  'الإجمالي',
      debit:        response.summary.totalDebit  ?? 0,
      credit:       response.summary.totalCredit ?? 0,
    },
  };
}

export function toGlReportInput(response: GlReportResponse): ReportInput {
  return {
    title:    'دفتر الأستاذ العام',
    subtitle: buildSubtitle(
      String(response.filters.fromDate ?? '') || undefined,
      String(response.filters.toDate   ?? '') || undefined,
    ),
    columns: [
      { header: 'الكود',          key: 'accountCode',    width: 14 },
      { header: 'اسم الحساب',    key: 'accountName',    width: 28 },
      { header: 'النوع',          key: 'accountType',    width: 14 },
      { header: 'رصيد الافتتاح', key: 'openingBalance', width: 16, numFmt: '#,##0.000', format: 'currency' as const },
      { header: 'مدين',           key: 'totalDebit',     width: 14, numFmt: '#,##0.000', format: 'currency' as const },
      { header: 'دائن',           key: 'totalCredit',    width: 14, numFmt: '#,##0.000', format: 'currency' as const },
      { header: 'رصيد الإقفال',  key: 'closingBalance', width: 16, numFmt: '#,##0.000', format: 'currency' as const },
    ],
    rows: response.accounts.map(a => ({
      accountCode:    a.accountCode,
      accountName:    a.accountName,
      accountType:    a.accountType,
      openingBalance: a.openingBalance,
      totalDebit:     a.totalDebit,
      totalCredit:    a.totalCredit,
      closingBalance: a.closingBalance,
    })),
  };
}
