import { describe, it, expect } from 'vitest';
import {
  sanitizePdfFilename,
  buildInvoicePdfName,
  buildQuotationPdfName,
} from '../utils/pdfFilename';

describe('sanitizePdfFilename', () => {
  it('returns fallback for empty string', () => {
    expect(sanitizePdfFilename('', 'fallback')).toBe('fallback');
  });
  it('returns fallback for whitespace-only string', () => {
    expect(sanitizePdfFilename('   ', 'fb')).toBe('fb');
  });
  it('removes all Windows-forbidden characters', () => {
    expect(sanitizePdfFilename('a\\b/c:d*e?f"g<h>i|j', 'fb')).toBe('abcdefghij');
  });
  it('preserves a valid ASCII filename', () => {
    expect(sanitizePdfFilename('INV-001-2026-06-22', 'fb')).toBe('INV-001-2026-06-22');
  });
  it('collapses whitespace into a single underscore', () => {
    expect(sanitizePdfFilename('my  file  name', 'fb')).toBe('my_file_name');
  });
});

describe('buildInvoicePdfName', () => {
  it('produces the standard Invoice name', () => {
    expect(buildInvoicePdfName('MN-2026-001')).toMatch(
      /^manarERP_Invoice_INV-MN-2026-001_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });
  it('omits the identifier when the invoice number is empty', () => {
    expect(buildInvoicePdfName('')).toMatch(/^manarERP_Invoice_\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

describe('buildQuotationPdfName', () => {
  it('produces the standard Quotation name', () => {
    expect(buildQuotationPdfName('240601')).toMatch(
      /^manarERP_Quotation_QT-240601_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });
  it('omits the identifier when the quotation number is empty', () => {
    expect(buildQuotationPdfName('')).toMatch(/^manarERP_Quotation_\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
