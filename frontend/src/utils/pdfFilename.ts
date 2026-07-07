import {
  generateExportFileName,
  sanitizeFilenameSegment,
  ReportName,
} from './exportFilename';

/**
 * Backward-compatible wrappers that delegate to the single source of truth,
 * `exportFilename.ts`. All builders now return the full standardized name,
 * including the `.pdf` extension (the Electron export handler appends `.pdf`
 * idempotently, so a name that already ends in `.pdf` is passed through).
 */

/** Sanitize a filename, returning `fallback` when the result is empty. */
export function sanitizePdfFilename(name: string, fallback: string): string {
  return sanitizeFilenameSegment(name) || fallback;
}

export function buildInvoicePdfName(invoiceNumber: string): string {
  return generateExportFileName({
    reportName: ReportName.Invoice,
    identifier: invoiceNumber.trim() ? `INV-${invoiceNumber}` : null,
    extension: 'pdf',
  });
}

export function buildQuotationPdfName(quotationNumber: string): string {
  return generateExportFileName({
    reportName: ReportName.Quotation,
    identifier: quotationNumber.trim() ? `QT-${quotationNumber}` : null,
    extension: 'pdf',
  });
}

/** Generic builder kept for compatibility: `manarERP_<prefix>_<YYYY-MM-DD>.pdf`. */
export function buildFilenameFromDate(prefix: string): string {
  return generateExportFileName({ reportName: prefix, extension: 'pdf' });
}
