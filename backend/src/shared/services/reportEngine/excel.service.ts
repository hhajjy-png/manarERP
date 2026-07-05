import ExcelJS from 'exceljs';

export interface ReportColumn {
  header: string;
  key: string;
  width?: number;
  /** تنسيق رقمي/عملة اختياري. */
  numFmt?: string;
  /** Presentation-only: mark a monetary column so HTML/PDF render it as "144,922.400 KWD". Excel ignores this (uses numFmt + raw numeric). */
  format?: 'currency';
}

export interface ReportInput {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  /** صف مجاميع اختياري. */
  totalsRow?: Record<string, unknown>;
}

/**
 * توليد ملف Excel احترافي بدعم RTL عربي كامل.
 * يُرجع Buffer جاهزًا للتنزيل.
 */
export async function buildExcel(input: ReportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'نظام المنار';
  wb.created = new Date();

  const ws = wb.addWorksheet('التقرير', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: input.subtitle ? 3 : 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true },
  });

  const colCount = input.columns.length;

  // العنوان
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = input.title;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FF1D4E6F' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;

  let headerRowIndex = 2;
  if (input.subtitle) {
    ws.mergeCells(2, 1, 2, colCount);
    const sub = ws.getCell(2, 1);
    sub.value = input.subtitle;
    sub.font = { size: 11, color: { argb: 'FF64748B' } };
    sub.alignment = { horizontal: 'center' };
    headerRowIndex = 3;
  }

  // رؤوس الأعمدة
  ws.columns = input.columns.map((c) => ({ key: c.key, width: c.width ?? 18 }));
  const headerRow = ws.getRow(headerRowIndex);
  input.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4E6F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });
  headerRow.height = 22;

  // الصفوف
  input.rows.forEach((row) => {
    const r = ws.addRow(input.columns.map((c) => row[c.key] ?? ''));
    input.columns.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFEEEEEE' } } };
    });
  });

  // صف المجاميع
  if (input.totalsRow) {
    const r = ws.addRow(input.columns.map((c) => input.totalsRow![c.key] ?? ''));
    r.font = { bold: true };
    r.eachCell((cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F3F7' } };
      const col = input.columns[colNumber - 1];
      if (col?.numFmt) cell.numFmt = col.numFmt;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
