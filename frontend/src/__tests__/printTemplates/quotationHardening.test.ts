import { describe, it, expect } from 'vitest';
import { sanitizePrintText } from '../../print-templates/utils/sanitizePrintText';
import {
  adaptFormToQuotationPrintData,
  validateQuotationPrintData,
} from '../../print-templates/integration/quotationPreviewIntegration';
import { formatKWD } from '../../print-templates/utils/formatKWD';
import type { QuotationPrintFields } from '../../forms/QuotationTemplate';

// ─── sanitizePrintText ────────────────────────────────────────────────────────

describe('sanitizePrintText', () => {
  it('returns empty string for undefined', () => {
    expect(sanitizePrintText(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(sanitizePrintText(null)).toBe('');
  });

  it('trims leading/trailing whitespace', () => {
    expect(sanitizePrintText('  المنار  ')).toBe('المنار');
  });

  it('returns the original string for normal text', () => {
    expect(sanitizePrintText('شركة المنار الدولية')).toBe('شركة المنار الدولية');
  });

  it('does NOT strip HTML — returns plain text as-is (no innerHTML processing)', () => {
    const raw = '<script>alert("xss")</script>';
    expect(sanitizePrintText(raw)).toBe(raw);
  });

  it('preserves internal whitespace and newlines', () => {
    const multiline = 'سطر أول\nسطر ثانٍ';
    expect(sanitizePrintText(multiline)).toBe(multiline);
  });

  it('handles empty string', () => {
    expect(sanitizePrintText('')).toBe('');
  });

  it('handles whitespace-only string', () => {
    expect(sanitizePrintText('   ')).toBe('');
  });
});

// ─── Intro text safety ────────────────────────────────────────────────────────

describe('introText — safety', () => {
  it('sanitizePrintText on a very long introText does not throw', () => {
    const longText = 'ن'.repeat(10_000);
    expect(() => sanitizePrintText(longText)).not.toThrow();
    expect(sanitizePrintText(longText)).toHaveLength(10_000);
  });

  it('sanitizePrintText on multi-line text preserves newlines', () => {
    const text = 'بالإشارة إلى الموضوع أعلاه،\nيسرنا تقديم عرضنا.';
    const result = sanitizePrintText(text);
    expect(result).toContain('\n');
    expect(result).toContain('بالإشارة');
    expect(result).toContain('يسرنا');
  });

  it('sanitizePrintText never returns undefined or null', () => {
    expect(sanitizePrintText(undefined)).not.toBeNull();
    expect(sanitizePrintText(null)).not.toBeUndefined();
  });
});

// ─── Totals block stability ───────────────────────────────────────────────────

describe('Totals block — formatKWD stability', () => {
  it('formatKWD(0) returns "0.000" — discount=0 row will display a valid string', () => {
    expect(formatKWD(0)).toBe('0.000');
  });

  it('formatKWD renders consistently for any non-negative discount', () => {
    expect(formatKWD(0)).toBe('0.000');
    expect(formatKWD(100)).toBe('100.000');
    expect(formatKWD(13000)).toBe('13,000.000');
  });

  it('adapter sets discount to 0 when form has no discount field', () => {
    const fields: QuotationPrintFields = {
      quotationNumber: 'Q-001',
      date: '2026-06-01',
      validUntil: '',
      currency: 'KWD',
      subject: 'أعمال',
      customerName: 'عميل',
      contactPerson: '',
      phone: '',
      project: '',
      items: [{ id: '1', description: 'بند', qty: '10', unit: 'م²', unitPrice: '5' }],
      notes: '',
      paymentTerms: '',
    };
    const data = adaptFormToQuotationPrintData(fields);
    expect(data.discount).toBe(0);
    expect(data.grandTotal).toBe(data.subtotal);
  });
});

// ─── Safe text defaults ───────────────────────────────────────────────────────

describe('Safe text defaults — adapter', () => {
  const BLANK_FIELDS: QuotationPrintFields = {
    quotationNumber: '',
    date: '',
    validUntil: '',
    currency: 'KWD',
    subject: '',
    customerName: '',
    contactPerson: '',
    phone: '',
    project: '',
    items: [],
    notes: '',
    paymentTerms: '',
  };

  it('undefined optional fields do not appear as the string "undefined"', () => {
    const data = adaptFormToQuotationPrintData(BLANK_FIELDS);
    expect(data.attention).not.toBe('undefined');
    expect(data.projectName).not.toBe('undefined');
    expect(data.notes).not.toBe('undefined');
    expect(data.terms).not.toBe('undefined');
  });

  it('optional fields are undefined (not null) when absent', () => {
    const data = adaptFormToQuotationPrintData(BLANK_FIELDS);
    expect(data.attention).toBeUndefined();
    expect(data.projectName).toBeUndefined();
    expect(data.notes).toBeUndefined();
  });

  it('empty items array produces grandTotal = 0 without throwing', () => {
    const data = adaptFormToQuotationPrintData(BLANK_FIELDS);
    expect(data.grandTotal).toBe(0);
    expect(data.lineItems).toHaveLength(0);
  });
});

// ─── Validation never throws ──────────────────────────────────────────────────

describe('validateQuotationPrintData — never throws', () => {
  const BLANK_FIELDS: QuotationPrintFields = {
    quotationNumber: '',
    date: '',
    validUntil: '',
    currency: 'KWD',
    subject: '',
    customerName: '',
    contactPerson: '',
    phone: '',
    project: '',
    items: [],
    notes: '',
    paymentTerms: '',
  };

  it('does not throw with fully empty data', () => {
    const data = adaptFormToQuotationPrintData(BLANK_FIELDS);
    expect(() => validateQuotationPrintData(data)).not.toThrow();
  });

  it('returns an array (even when all fields are missing)', () => {
    const data = adaptFormToQuotationPrintData(BLANK_FIELDS);
    const warnings = validateQuotationPrintData(data);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('all warnings have field and messageAr properties', () => {
    const data = adaptFormToQuotationPrintData(BLANK_FIELDS);
    const warnings = validateQuotationPrintData(data);
    warnings.forEach((w) => {
      expect(typeof w.field).toBe('string');
      expect(typeof w.messageAr).toBe('string');
      expect(w.messageAr.length).toBeGreaterThan(0);
    });
  });
});
