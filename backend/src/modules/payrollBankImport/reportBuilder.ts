import ExcelJS from 'exceljs';
import type { ImportReport, BankTemplate } from './types';
import { buildReportHtml } from '../../shared/services/reportEngine/html.service';
import type { ReportColumn } from '../../shared/services/reportEngine/excel.service';
import { BANK_CONFIGS } from './excelParser';

const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function monthAr(m: number): string {
  return MONTH_AR[Math.min(Math.max(m - 1, 0), 11)] ?? String(m);
}

function fmtAmount(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ar-KW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function bankNameAr(templateName: string): string {
  return (BANK_CONFIGS[templateName as BankTemplate]?.nameAr) ?? templateName;
}

// ── Excel report ──────────────────────────────────────────────────────────────

export async function buildImportReportExcel(report: ImportReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'نظام المنار';
  wb.created = new Date();

  // ── Summary sheet ──
  const ws = wb.addWorksheet('ملخص الاستيراد', { views: [{ rightToLeft: true }] });

  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } },
    alignment: { horizontal: 'right', vertical: 'middle' },
    border: {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    },
  };

  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = `تقرير استيراد رواتب البنك — ${bankNameAr(report.templateName)}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ws.getCell('A3').value = 'البنك:';              ws.getCell('B3').value = bankNameAr(report.templateName);
  ws.getCell('A4').value = 'تاريخ الاستيراد:';   ws.getCell('B4').value = new Date(report.importedAt).toLocaleString('ar-KW');
  ws.getCell('A5').value = 'بواسطة:';             ws.getCell('B5').value = report.importedBy;
  ws.getCell('A6').value = 'إجمالي الصفوف:';      ws.getCell('B6').value = report.imported + report.skipped;
  ws.getCell('A7').value = 'تم استيراده:';         ws.getCell('B7').value = report.imported;
  ws.getCell('A8').value = 'تم تجاهله:';           ws.getCell('B8').value = report.skipped;
  ws.getCell('A9').value = 'إجمالي المبالغ (د.ك):'; ws.getCell('B9').value = fmtAmount(report.totalAmount);

  for (let r = 3; r <= 9; r++) {
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`A${r}`).alignment = { horizontal: 'right' };
    ws.getCell(`B${r}`).alignment = { horizontal: 'right' };
  }

  ws.getColumn('A').width = 24;
  ws.getColumn('B').width = 32;

  // ── Details sheet ──
  const ds = wb.addWorksheet('تفاصيل الصفوف', { views: [{ rightToLeft: true }] });

  const cols = [
    { header: 'رقم الموظف', key: 'code', width: 14 },
    { header: 'اسم الموظف', key: 'name', width: 28 },
    { header: 'الرقم المدني', key: 'civil', width: 14 },
    { header: 'المبلغ (د.ك)', key: 'amount', width: 14 },
    { header: 'العملة', key: 'currency', width: 10 },
    { header: 'رقم المعاملة', key: 'txId', width: 22 },
    { header: 'تاريخ الدفع', key: 'date', width: 14 },
    { header: 'شهر الراتب', key: 'month', width: 14 },
    { header: 'الحالة', key: 'status', width: 14 },
    { header: 'السبب', key: 'reason', width: 32 },
  ];

  ds.columns = cols;
  const headerRow = ds.getRow(1);
  headerRow.eachCell((cell) => {
    Object.assign(cell, headerStyle);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
  });
  headerRow.height = 22;

  for (const row of report.rows) {
    const statusAr = row.status === 'imported' ? 'تم الاستيراد' : 'تم التجاهل';
    const dr = ds.addRow({
      code:     row.employeeCode ?? '—',
      name:     row.employeeName ?? '—',
      civil:    row.civilId ?? '—',
      amount:   fmtAmount(row.amount),
      currency: row.currency,
      txId:     row.transactionId ?? '—',
      date:     fmtDate(row.paymentDate),
      month:    `${monthAr(row.payrollMonth)} ${row.payrollYear}`,
      status:   statusAr,
      reason:   row.reason ?? '',
    });
    dr.eachCell((cell) => { cell.alignment = { horizontal: 'right' }; });
    if (row.status === 'imported') {
      ds.getCell(`I${dr.number}`).font = { color: { argb: 'FF16A34A' } };
    } else {
      ds.getCell(`I${dr.number}`).font = { color: { argb: 'FFDC2626' } };
    }
  }

  ds.autoFilter = { from: 'A1', to: `J1` };

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

// ── HTML (PDF) report ─────────────────────────────────────────────────────────

const REPORT_COLUMNS: ReportColumn[] = [
  { header: 'رقم الموظف', key: 'code',     width: 14 },
  { header: 'الاسم',       key: 'name',     width: 28 },
  { header: 'الرقم المدني', key: 'civil',   width: 14 },
  { header: 'المبلغ (د.ك)', key: 'amount',  width: 14 },
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
    amount:   fmtAmount(r.amount),
    currency: r.currency,
    txId:     r.transactionId ?? '—',
    date:     fmtDate(r.paymentDate),
    month:    `${monthAr(r.payrollMonth)} ${r.payrollYear}`,
    status:   r.status === 'imported' ? 'تم الاستيراد' : 'تم التجاهل',
    reason:   r.reason ?? '',
  }));

  return buildReportHtml({
    title: `تقرير استيراد رواتب البنك — ${bankNameAr(report.templateName)}`,
    subtitle: `المستورد: ${report.importedBy} | التاريخ: ${new Date(report.importedAt).toLocaleString('ar-KW')} | مستورد: ${report.imported} | مجموع المبالغ: ${fmtAmount(report.totalAmount)} د.ك`,
    columns: REPORT_COLUMNS,
    rows,
    totalsRow: {
      code: '', name: `الإجمالي: ${report.imported + report.skipped} صف`,
      civil: '', amount: fmtAmount(report.totalAmount), currency: 'KWD',
      txId: '', date: '', month: '',
      status: `مستورد: ${report.imported}`,
      reason: `تجاهل: ${report.skipped}`,
    },
  }, { profile: 'a4-landscape' });
}
