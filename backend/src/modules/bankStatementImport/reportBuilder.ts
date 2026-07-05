import ExcelJS from 'exceljs';
import { buildReportHtml } from '../../shared/services/reportEngine/html.service.js';
import type { ReportInput } from '../../shared/services/reportEngine/excel.service.js';
import type { ReconciliationReport, ReconciliationReportRow, ReconcileStatus } from './types.js';
import { formatNumber } from '../../shared/utils/currency';


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

// ── Excel report (3 sheets: Summary, Matched, Unmatched) ──────────────────────

export async function buildReconciliationReportExcel(report: ReconciliationReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'نظام المنار';
  wb.created = new Date();

  const headerStyle: Partial<ExcelJS.Style> = {
    font:      { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border:    { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } },
  };

  const altFill: Partial<ExcelJS.Style> = {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } },
  };

  function applyHeaderRow(ws: ExcelJS.Worksheet, rowIdx: number, headers: string[]) {
    const row = ws.getRow(rowIdx);
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      cell.value = h;
      Object.assign(cell, headerStyle);
    });
    row.height = 22;
    row.commit();
  }

  function addDataRows(
    ws: ExcelJS.Worksheet,
    startRow: number,
    rows: (string | number | null)[][],
  ) {
    rows.forEach((data, ri) => {
      const row = ws.getRow(startRow + ri);
      data.forEach((v, ci) => { row.getCell(ci + 1).value = v ?? '—'; });
      if (ri % 2 === 1) {
        row.eachCell((c) => {
          c.fill = altFill.fill!;
        });
      }
      row.alignment = { horizontal: 'right' };
      row.commit();
    });
  }

  // ── Sheet 1: Summary ──
  const ws1 = wb.addWorksheet('الملخص', { views: [{ rightToLeft: true }] });
  ws1.mergeCells('A1:D1');
  ws1.getCell('A1').value = `تقرير مطابقة كشف الحساب — ${report.bankName}`;
  ws1.getCell('A1').font = { bold: true, size: 14 };
  ws1.getCell('A1').alignment = { horizontal: 'center' };

  const summaryData: [string, string][] = [
    ['البنك',          report.bankName],
    ['الملف',          report.fileName],
    ['تاريخ الاستيراد', fmtDate(report.importedAt.substring(0, 10))],
    ['تاريخ التقرير',   fmtDate(report.generatedAt.substring(0, 10))],
    ['إجمالي الصفوف',   String(report.totalRows)],
    ['إجمالي المدين (KWD)', formatNumber(report.totalDebits)],
    ['إجمالي الدائن (KWD)', formatNumber(report.totalCredits)],
    ['المطابقة',       String(report.matched.length)],
    ['غير المطابقة',   String(report.unmatched.length)],
    ['رسوم بنكية',     String(report.bankFees.length)],
  ];
  summaryData.forEach(([label, value], i) => {
    const row = ws1.getRow(i + 3);
    row.getCell(1).value = label; row.getCell(1).font = { bold: true };
    row.getCell(2).value = value;
    row.commit();
  });
  ws1.columns = [{ width: 28 }, { width: 36 }, { width: 20 }, { width: 20 }];

  // ── Shared columns for detail sheets ──
  const TX_HEADERS = ['التاريخ', 'الوصف', 'المرجع', 'مدين (KWD)', 'دائن (KWD)', 'الحالة', 'النوع المرتبط', 'المرجع المرتبط', 'الثقة'];
  const TX_WIDTHS  = [14, 40, 20, 14, 14, 16, 16, 20, 10];

  function txRow(r: ReconciliationReportRow): (string | number | null)[] {
    return [
      fmtDate(r.statementDate),
      r.description.substring(0, 80),
      r.reference ?? null,
      r.debit  > 0 ? r.debit  : null,
      r.credit > 0 ? r.credit : null,
      STATUS_AR[r.reconcileStatus],
      r.matchedType ? (MATCH_TYPE_AR[r.matchedType] ?? r.matchedType) : null,
      r.matchedRef ?? null,
      r.matchConfidence != null ? `${r.matchConfidence}%` : null,
    ];
  }

  // ── Sheet 2: Matched ──
  const ws2 = wb.addWorksheet('المطابقة', { views: [{ rightToLeft: true }] });
  ws2.columns = TX_WIDTHS.map((w) => ({ width: w }));
  applyHeaderRow(ws2, 1, TX_HEADERS);
  addDataRows(ws2, 2, report.matched.map(txRow));

  // ── Sheet 3: Unmatched ──
  const ws3 = wb.addWorksheet('غير المطابقة', { views: [{ rightToLeft: true }] });
  ws3.columns = TX_WIDTHS.map((w) => ({ width: w }));
  applyHeaderRow(ws3, 1, TX_HEADERS);
  addDataRows(ws3, 2, report.unmatched.map(txRow));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
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
