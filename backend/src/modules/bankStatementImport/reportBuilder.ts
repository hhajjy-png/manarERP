import { buildReportHtml } from '../../shared/services/reportEngine/html.service.js';
import { buildExcelWorkbook } from '../../shared/services/reportEngine/excel.service.js';
import type { ReportInput } from '../../shared/services/reportEngine/excel.service.js';
import type { ReconciliationReport, ReconciliationReportRow, ReconcileStatus } from './types.js';


function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ar-KW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const STATUS_AR: Record<ReconcileStatus, string> = {
  UNMATCHED: 'غير مطابق',
  MATCHED:   'مطابق',
  IGNORED:   'متجاهل',
  DUPLICATE: 'مكرر',
  REVIEW:    'قيد المراجعة',
};

const MATCH_TYPE_AR: Record<string, string> = {
  invoice: 'فاتورة',
  payment: 'دفعة',
  expense: 'مصروف',
  journal: 'يومية',
  cheque:  'شيك',
  payroll: 'رواتب',
};

// ── Excel report (3 sheets: Summary, Matched, Unmatched) via shared professional engine ──

/** يحوّل صفًا مفصّلاً إلى شكل صف الجدول المشترك بين ورقتي "المطابقة" و"غير المطابقة". */
function txRowRecord(r: ReconciliationReportRow): Record<string, unknown> {
  return {
    statementDate:   fmtDate(r.statementDate),
    description:     r.description.substring(0, 80),
    reference:       r.reference ?? '—',
    debit:           r.debit  > 0 ? r.debit  : null,
    credit:          r.credit > 0 ? r.credit : null,
    reconcileStatus: STATUS_AR[r.reconcileStatus],
    matchedType:     r.matchedType ? (MATCH_TYPE_AR[r.matchedType] ?? r.matchedType) : '—',
    matchedRef:      r.matchedRef ?? '—',
    matchConfidence: r.matchConfidence != null ? `${r.matchConfidence}%` : '—',
  };
}

const TX_COLUMNS: ReportInput['columns'] = [
  { header: 'التاريخ',        key: 'statementDate',   width: 14 },
  { header: 'الوصف',          key: 'description',     width: 40 },
  { header: 'المرجع',         key: 'reference',       width: 20 },
  { header: 'مدين (KWD)',     key: 'debit',           width: 14, type: 'currency' },
  { header: 'دائن (KWD)',     key: 'credit',          width: 14, type: 'currency' },
  { header: 'الحالة',         key: 'reconcileStatus', width: 16 },
  { header: 'النوع المرتبط',  key: 'matchedType',     width: 16 },
  { header: 'المرجع المرتبط', key: 'matchedRef',      width: 20 },
  { header: 'الثقة',          key: 'matchConfidence', width: 10 },
];

export async function buildReconciliationReportExcel(report: ReconciliationReport): Promise<Buffer> {
  const summarySheet: ReportInput = {
    title:    `تقرير مطابقة كشف الحساب — ${report.bankName}`,
    sheetName: 'الملخص',
    columns: [
      { header: 'البند',   key: 'label', width: 28 },
      { header: 'القيمة',  key: 'value', width: 36, type: 'currency' },
    ],
    rows: [
      { label: 'البنك',              value: report.bankName },
      { label: 'الملف',              value: report.fileName },
      { label: 'تاريخ الاستيراد',    value: fmtDate(report.importedAt.substring(0, 10)) },
      { label: 'تاريخ التقرير',      value: fmtDate(report.generatedAt.substring(0, 10)) },
      { label: 'إجمالي الصفوف',      value: String(report.totalRows) },
      { label: 'إجمالي المدين (KWD)', value: report.totalDebits },
      { label: 'إجمالي الدائن (KWD)', value: report.totalCredits },
      { label: 'المطابقة',           value: String(report.matched.length) },
      { label: 'غير المطابقة',       value: String(report.unmatched.length) },
      { label: 'رسوم بنكية',         value: String(report.bankFees.length) },
    ],
    autoFilter: false,
    zebra: false,
  };

  const matchedSheet: ReportInput = {
    title:     `المطابقة — ${report.bankName}`,
    sheetName: 'المطابقة',
    columns:   TX_COLUMNS,
    rows:      report.matched.map(txRowRecord),
  };

  const unmatchedSheet: ReportInput = {
    title:     `غير المطابقة — ${report.bankName}`,
    sheetName: 'غير المطابقة',
    columns:   TX_COLUMNS,
    rows:      report.unmatched.map(txRowRecord),
  };

  return buildExcelWorkbook([summarySheet, matchedSheet, unmatchedSheet]);
}

// ── HTML report (via Unified Report Engine) ────────────────────────────────────

export function buildReconciliationReportHtml(report: ReconciliationReport): string {
  const allRows = [...report.matched, ...report.unmatched, ...report.bankFees];

  const input: ReportInput = {
    title:    `تقرير مطابقة كشف الحساب — ${report.bankName}`,
    subtitle: `الملف: ${report.fileName} | الاستيراد: ${fmtDate(report.importedAt.substring(0, 10))} | التقرير: ${fmtDate(report.generatedAt.substring(0, 10))}`,
    columns: [
      { header: 'التاريخ',        key: 'statementDate',   width: 14 },
      { header: 'الوصف',          key: 'description',     width: 40 },
      { header: 'المرجع',         key: 'reference',       width: 20 },
      { header: 'مدين',           key: 'debit',           width: 14, numFmt: '#,##0.000', format: 'currency' },
      { header: 'دائن',           key: 'credit',          width: 14, numFmt: '#,##0.000', format: 'currency' },
      { header: 'الحالة',         key: 'reconcileStatus', width: 16 },
      { header: 'النوع المرتبط',  key: 'matchedType',     width: 16 },
      { header: 'المرجع المرتبط', key: 'matchedRef',      width: 20 },
    ],
    rows: allRows.map((r) => ({
      statementDate:   fmtDate(r.statementDate),
      description:     r.description.substring(0, 80),
      reference:       r.reference ?? '—',
      debit:           r.debit  > 0 ? r.debit  : null,
      credit:          r.credit > 0 ? r.credit : null,
      reconcileStatus: STATUS_AR[r.reconcileStatus],
      matchedType:     r.matchedType ? (MATCH_TYPE_AR[r.matchedType] ?? r.matchedType) : '—',
      matchedRef:      r.matchedRef ?? '—',
    })),
    totalsRow: {
      statementDate:   'الإجمالي',
      description:     '',
      reference:       '',
      debit:           allRows.reduce((s, r) => s + r.debit,  0),
      credit:          allRows.reduce((s, r) => s + r.credit, 0),
      reconcileStatus: '',
      matchedType:     '',
      matchedRef:      '',
    },
  };

  return buildReportHtml(input, {
    profile: 'a4-landscape',
    showSignatureArea: false,
    showPageNumbers: true,
  });
}
