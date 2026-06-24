import type { FinancialResponse, JournalBookRow } from '../financial.types';
import { buildSubtitle, formatDate, translateRefType } from '../summary.utils';
import type { ReportInput } from '../../reportEngine/excel.service';

export function toJournalBookReportInput(response: FinancialResponse<JournalBookRow>): ReportInput {
  const fromDate = String(response.metadata?.fromDate ?? '') || undefined;
  const toDate   = String(response.metadata?.toDate   ?? '') || undefined;

  const flatRows: Record<string, unknown>[] = [];
  for (const entry of response.rows) {
    flatRows.push({
      entryNumber:  entry.entryNumber,
      date:         formatDate(entry.date),
      description:  entry.description,
      referenceType: translateRefType(entry.referenceType),
      status:       entry.status,
      accountCode:  '',
      accountName:  '',
      description2: '',
      debit:        entry.totalDebit,
      credit:       entry.totalCredit,
    });
    for (const line of entry.lines) {
      flatRows.push({
        entryNumber:  '',
        date:         '',
        description:  '',
        referenceType: '',
        status:       '',
        accountCode:  line.accountCode,
        accountName:  line.accountName,
        description2: line.description ?? '',
        debit:        line.debit  || '',
        credit:       line.credit || '',
      });
    }
  }

  return {
    title:    'دفتر اليومية',
    subtitle: buildSubtitle(fromDate, toDate),
    columns: [
      { header: 'رقم القيد',  key: 'entryNumber',   width: 18 },
      { header: 'التاريخ',    key: 'date',           width: 14 },
      { header: 'البيان',     key: 'description',    width: 28 },
      { header: 'المرجع',     key: 'referenceType',  width: 12 },
      { header: 'الحالة',     key: 'status',         width: 10 },
      { header: 'الحساب',     key: 'accountCode',    width: 12 },
      { header: 'اسم الحساب', key: 'accountName',    width: 24 },
      { header: 'بيان البند', key: 'description2',   width: 20 },
      { header: 'مدين',       key: 'debit',          width: 14, numFmt: '#,##0.000' },
      { header: 'دائن',       key: 'credit',         width: 14, numFmt: '#,##0.000' },
    ],
    rows: flatRows,
  };
}
