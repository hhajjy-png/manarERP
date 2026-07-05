import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { ReportInput, ReportColumn } from './excel.service';
import { formatCurrency } from '../../utils/currency';

const cellText = (col: ReportColumn, v: unknown): string =>
  col.format === 'currency' && v != null && v !== '' ? formatCurrency(v) : String(v ?? '');

/**
 * توليد تقرير PDF جدولي.
 *
 * ملاحظة حول العربية: PDFKit لا يشكّل الحروف العربية المتصلة افتراضيًا.
 * لإخراج عربي مثالي ضع خطًا عربيًا في:
 *   backend/assets/fonts/Amiri-Regular.ttf
 * وللاتصال الكامل أضف معالج تشكيل (مثل arabic-reshaper + bidi) لاحقًا.
 * يعمل الجدول والأرقام والتخطيط بشكل سليم في كل الأحوال.
 */
const FONT_PATH = path.resolve(process.cwd(), 'assets', 'fonts', 'Amiri-Regular.ttf');

export function buildPdf(input: ReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const hasArabicFont = fs.existsSync(FONT_PATH);
      if (hasArabicFont) doc.font(FONT_PATH);

      const pageWidth = doc.page.width - 72;

      // الترويسة
      doc.fontSize(18).fillColor('#1d4e6f').text(input.title, { align: 'center' });
      if (input.subtitle) doc.moveDown(0.2).fontSize(10).fillColor('#64748b').text(input.subtitle, { align: 'center' });
      doc.moveDown(0.4).fontSize(8).fillColor('#94a3b8')
        .text(`تاريخ التقرير: ${new Date().toLocaleDateString('ar')}`, { align: 'center' });
      doc.moveDown(0.6);

      const cols = input.columns;
      const colWidth = pageWidth / cols.length;
      let y = doc.y;
      const startX = 36;
      const rowHeight = 22;

      const drawRow = (cells: string[], opts: { header?: boolean; zebra?: boolean }) => {
        if (y + rowHeight > doc.page.height - 40) {
          doc.addPage();
          y = 40;
        }
        if (opts.header) doc.rect(startX, y, pageWidth, rowHeight).fill('#1d4e6f');
        else if (opts.zebra) doc.rect(startX, y, pageWidth, rowHeight).fill('#f4f6f9');

        doc.fillColor(opts.header ? '#ffffff' : '#1f2933').fontSize(9);
        // RTL: نرسم الأعمدة من اليمين لليسار
        cells.forEach((text, i) => {
          const x = startX + pageWidth - (i + 1) * colWidth + 4;
          doc.text(String(text ?? ''), x, y + 6, { width: colWidth - 8, align: 'right', lineBreak: false });
        });
        y += rowHeight;
      };

      drawRow(cols.map((c) => c.header), { header: true });
      input.rows.forEach((row, idx) => drawRow(cols.map((c) => cellText(c, row[c.key])), { zebra: idx % 2 === 1 }));
      if (input.totalsRow) {
        doc.rect(startX, y, pageWidth, rowHeight).fill('#f0f3f7');
        doc.fillColor('#1f2933').fontSize(9.5);
        cols.forEach((c, i) => {
          const x = startX + pageWidth - (i + 1) * colWidth + 4;
          doc.text(cellText(c, input.totalsRow![c.key]), x, y + 6, { width: colWidth - 8, align: 'right', lineBreak: false });
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
