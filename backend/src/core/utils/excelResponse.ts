import type { Response } from 'express';

/** نوع MIME الموحّد لملفات Excel (xlsx) في كل النظام. */
export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** يحوّل أي حرف غير ASCII في اسم الملف إلى مكافئ آمن بسيط (يُستخدم في fallback ASCII فقط). */
function toAsciiFallback(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  return ascii.trim().length > 0 ? ascii : 'report.xlsx';
}

/**
 * يرسل Buffer كملف Excel جاهز للتنزيل، مع دعم كامل لأسماء الملفات العربية
 * عبر ترميز RFC 5987 (filename*=UTF-8''...) بالإضافة إلى fallback ASCII للمتصفحات القديمة.
 */
export function sendExcel(res: Response, buffer: Buffer, filename: string): void {
  const asciiFallback = toAsciiFallback(filename);
  const encoded = encodeURIComponent(filename);

  res.setHeader('Content-Type', EXCEL_MIME);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
  );
  res.send(buffer);
}
