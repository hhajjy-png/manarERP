const WINDOWS_FORBIDDEN = /[\\/:*?"<>|]/g;

/** Remove Windows-forbidden characters and collapse whitespace. */
export function sanitizePdfFilename(name: string, fallback: string): string {
  const cleaned = name.replace(WINDOWS_FORBIDDEN, '-').trim().replace(/\s+/g, '-');
  return cleaned || fallback;
}

export function buildInvoicePdfName(invoiceNumber: string): string {
  const date = new Date().toISOString().slice(0, 10);
  if (!invoiceNumber.trim()) return `invoice-${date}`;
  return sanitizePdfFilename(`INV-${invoiceNumber}-${date}`, `invoice-${date}`);
}

export function buildQuotationPdfName(quotationNumber: string): string {
  const date = new Date().toISOString().slice(0, 10);
  if (!quotationNumber.trim()) return `quotation-${date}`;
  return sanitizePdfFilename(`QT-${quotationNumber}-${date}`, `quotation-${date}`);
}

/** Generic filename builder: `{prefix}-{YYYY-MM-DD}` */
export function buildFilenameFromDate(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return sanitizePdfFilename(`${prefix}-${date}`, `document-${date}`);
}
