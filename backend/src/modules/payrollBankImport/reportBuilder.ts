import type { ImportReport, ImportReportRow, BankTemplate } from './types';
import { buildReportHtml } from '../../shared/services/reportEngine/html.service';
import { buildExcelWorkbook } from '../../shared/services/reportEngine/excel.service';
import type { ReportColumn, ReportInput } from '../../shared/services/reportEngine/excel.service';
import { BANK_CONFIGS } from './excelParser';
import { formatCurrency } from '../../shared/utils/currency';
import { ARABIC_MONTHS } from '../../core/utils/arabicMonths';

function monthAr(m: number): string {
  return ARABIC_MONTHS[Math.min(Math.max(m - 1, 0), 11)] ?? String(m);
}


function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ar-KW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function bankNameAr(templateName: string): string {
  return (BANK_CONFIGS[templateName as BankTemplate]?.nameAr) ?? templateName;
}

// ── Excel report (2 sheets: summary + details) via shared professional engine ──

const DETAIL_COLUMNS: ReportColumn[] = [
  { header: 'رقم الموظف',   key: 'code',     width: 14 },
  { header: 'اسم الموظف',   key: 'name',     width: 28 },
  { header: 'الرقم المدني', key: 'civil',    width: 14 },
  { header: 'المبلغ (KWD)', key: 'amount',   width: 14, type: 'currency' },
  { header: 'العملة',       key: 'currency', width: 10 },
  { header: 'رقم المعاملة', key: 'txId',     width: 22 },
  { header: 'تاريخ الدفع',  key: 'date',     width: 14 },
  { header: 'شهر الراتب',   key: 'month',    width: 14 },
  { header: 'الحالة',       key: 'status',   width: 14 },
  { header: 'السبب',        key: 'reason',   width: 32 },
];

/** تظليل خافت لكل صف حسب حالة الاستيراد (أخضر فاتح=تم الاستيراد، أحمر فاتح=تم التجاهل) — النص يبقى بلونه الافتراضي. */
function detailRowStyle(row: Record<string, unknown>): { fillArgb?: string } | undefined {
  return row._rawStatus === 'imported'
    ? { fillArgb: 'FFDCFCE7' }
    : { fillArgb: 'FFFEE2E2' };
}

function detailRowRecord(row: ImportReportRow): Record<string, unknown> {
  return {
    code:        row.employeeCode ?? '—',
    name:        row.employeeName ?? '—',
    civil:       row.civilId ?? '—',
    amount:      row.amount,
    currency:    row.currency,
    txId:        row.transactionId ?? '—',
    date:        fmtDate(row.paymentDate),
    month:       `${monthAr(row.payrollMonth)} ${row.payrollYear}`,
    status:      row.status === 'imported' ? 'تم الاستيراد' : 'تم التجاهل',
    reason:      row.reason ?? '',
    _rawStatus:  row.status,
  };
}

export async function buildImportReportExcel(report: ImportReport): Promise<Buffer> {
  const summarySheet: ReportInput = {
    title:     `تقرير استيراد رواتب البنك — ${bankNameAr(report.templateName)}`,
    sheetName: 'ملخص الاستيراد',
    columns: [
      { header: 'البند',  key: 'label', width: 24 },
      { header: 'القيمة', key: 'value', width: 32, type: 'currency' },
    ],
    rows: [
      { label: 'البنك',               value: bankNameAr(report.templateName) },
      { label: 'تاريخ الاستيراد',     value: new Date(report.importedAt).toLocaleString('ar-KW') },
      { label: 'بواسطة',              value: report.importedBy },
      { label: 'إجمالي الصفوف',       value: String(report.imported + report.skipped) },
      { label: 'تم استيراده',         value: String(report.imported) },
      { label: 'تم تجاهله',           value: String(report.skipped) },
      { label: 'إجمالي المبالغ (KWD)', value: report.totalAmount },
    ],
    autoFilter: false,
    zebra: false,
  };

  const detailsSheet: ReportInput = {
    title:     `تفاصيل صفوف الاستيراد — ${bankNameAr(report.templateName)}`,
    sheetName: 'تفاصيل الصفوف',
    columns:   DETAIL_COLUMNS,
    rows:      report.rows.map(detailRowRecord),
    rowStyle:  detailRowStyle,
  };

  return buildExcelWorkbook([summarySheet, detailsSheet]);
}

// ── HTML (PDF) report ─────────────────────────────────────────────────────────

const REPORT_COLUMNS: ReportColumn[] = [
  { header: 'رقم الموظف', key: 'code',     width: 14 },
  { header: 'الاسم',       key: 'name',     width: 28 },
  { header: 'الرقم المدني', key: 'civil',   width: 14 },
  { header: 'المبلغ',       key: 'amount',  width: 14, format: 'currency' },
  { header: 'العملة',       key: 'currency', width: 10 },
  { header: 'رقم المعاملة', key: 'txId',    width: 22 },
  { header: 'تاريخ الدفع', key: 'date',     width: 14 },
  { header: 'الشهر',        key: 'month',   width: 14 },
  { header: 'الحالة',       key: 'status',  width: 14 },
  { header: 'السبب',        key: 'reason',  width: 32 },
];

export function buildImportReportHtml(report: ImportReport): string {
  const rows = report.rows.map((r) => ({
    code:     r.employeeCode ?? '—',
    name:     r.employeeName ?? '—',
    civil:    r.civilId ?? '—',
    amount:   r.amount,
    currency: r.currency,
    txId:     r.transactionId ?? '—',
    date:     fmtDate(r.paymentDate),
    month:    `${monthAr(r.payrollMonth)} ${r.payrollYear}`,
    status:   r.status === 'imported' ? 'تم الاستيراد' : 'تم التجاهل',
    reason:   r.reason ?? '',
  }));

  return buildReportHtml({
    title: `تقرير استيراد رواتب البنك — ${bankNameAr(report.templateName)}`,
    subtitle: `المستورد: ${report.importedBy} | التاريخ: ${new Date(report.importedAt).toLocaleString('ar-KW')} | مستورد: ${report.imported} | مجموع المبالغ: ${formatCurrency(report.totalAmount)}`,
    columns: REPORT_COLUMNS,
    rows,
    totalsRow: {
      code: '', name: `الإجمالي: ${report.imported + report.skipped} صف`,
      civil: '', amount: report.totalAmount, currency: 'KWD',
      txId: '', date: '', month: '',
      status: `مستورد: ${report.imported}`,
      reason: `تجاهل: ${report.skipped}`,
    },
  }, { profile: 'a4-landscape' });
}
