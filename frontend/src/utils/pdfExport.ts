import { api } from '../api/client';

/**
 * Fetches an HTML report from the backend (format=html) and sends it to the
 * Electron pdf:exportHtml IPC handler, which renders it via Chromium printToPDF.
 * Arabic text is correctly shaped, RTL, selectable, and searchable in the output PDF.
 */
export async function exportReportAsPdf(
  endpoint: string,
  params: Record<string, unknown>,
  filename: string,
): Promise<void> {
  if (!window.manar?.exportPdfFromHtml) {
    throw new Error('تصدير PDF غير متاح خارج التطبيق');
  }

  const response = await api.get<string>(endpoint, {
    params:       { ...params, format: 'html' },
    responseType: 'text',
  });

  const html   = response.data;
  const result = await window.manar.exportPdfFromHtml(html, filename);

  if (!result.success && !result.canceled) {
    throw new Error(result.error ?? 'فشل تصدير PDF');
  }
}
