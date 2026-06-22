import { describe, it, expect } from 'vitest';
import { sanitizePdfFilename, buildInvoicePdfName, buildQuotationPdfName } from '../utils/pdfFilename';

describe('sanitizePdfFilename', () => {
  it('returns fallback for empty string', () => {
    expect(sanitizePdfFilename('', 'fallback')).toBe('fallback');
  });

  it('returns fallback for whitespace-only string', () => {
    expect(sanitizePdfFilename('   ', 'fb')).toBe('fb');
  });

  it('removes all Windows-forbidden characters', () => {
    expect(sanitizePdfFilename('a\\b/c:d*e?f"g<h>i|j', 'fb')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('preserves valid ASCII filename', () => {
    expect(sanitizePdfFilename('INV-001-2026-06-22', 'fb')).toBe('INV-001-2026-06-22');
  });

  it('collapses multiple spaces into a single dash', () => {
    expect(sanitizePdfFilename('my  file  name', 'fb')).toBe('my-file-name');
  });
});

describe('buildInvoicePdfName', () => {
  it('produces INV- prefix with date suffix', () => {
    const name = buildInvoicePdfName('MN-2026-001');
    expect(name).toMatch(/^INV-MN-2026-001-\d{4}-\d{2}-\d{2}$/);
  });

  it('sanitizes invoice number with forbidden chars', () => {
    const name = buildInvoicePdfName('MN:001');
    expect(name).toMatch(/^INV-MN-001-\d{4}-\d{2}-\d{2}$/);
  });

  it('uses fallback when invoice number is empty', () => {
    const name = buildInvoicePdfName('');
    expect(name).toMatch(/^invoice-\d{4}-\d{2}-\d{2}$/);
  });
});

describe('buildQuotationPdfName', () => {
  it('produces QT- prefix with date suffix', () => {
    const name = buildQuotationPdfName('QT-240601');
    expect(name).toMatch(/^QT-QT-240601-\d{4}-\d{2}-\d{2}$/);
  });

  it('uses fallback when quotation number is empty', () => {
    const name = buildQuotationPdfName('');
    expect(name).toMatch(/^quotation-\d{4}-\d{2}-\d{2}$/);
  });
});
