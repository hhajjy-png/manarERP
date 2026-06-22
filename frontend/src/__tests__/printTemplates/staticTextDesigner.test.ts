import { describe, it, expect } from 'vitest';
import {
  getStaticText,
  validateStaticText,
  escapeStaticText,
  parseStaticTextOverrides,
  serializeStaticTextOverrides,
} from '../../print-templates/designer/staticTextUtils';
import {
  DEFAULT_STATIC_TEXT,
  STATIC_TEXT_LIMITS,
} from '../../print-templates/designer/staticTextTypes';
import type { StaticTextOverrides } from '../../print-templates/designer/staticTextTypes';

// ── getStaticText ─────────────────────────────────────────────────────────────

describe('getStaticText', () => {
  it('returns override when present', () => {
    const overrides: StaticTextOverrides = { 'invoice.titleAr': 'فاتورة مخصصة' };
    expect(getStaticText(overrides, 'invoice.titleAr')).toBe('فاتورة مخصصة');
  });

  it('returns designDefault when override absent', () => {
    expect(getStaticText({}, 'invoice.titleAr', 'عنوان افتراضي')).toBe('عنوان افتراضي');
  });

  it('returns DEFAULT_STATIC_TEXT fallback when no override and no designDefault', () => {
    expect(getStaticText(undefined, 'invoice.titleAr')).toBe(DEFAULT_STATIC_TEXT['invoice.titleAr']);
  });

  it('override takes precedence over designDefault', () => {
    const overrides: StaticTextOverrides = { 'invoice.footerManager': 'مدير مخصص' };
    expect(getStaticText(overrides, 'invoice.footerManager', 'المسؤول')).toBe('مدير مخصص');
  });
});

// ── validateStaticText ────────────────────────────────────────────────────────

describe('validateStaticText', () => {
  it('returns null for valid text', () => {
    expect(validateStaticText('invoice.titleAr', 'فاتورة')).toBeNull();
  });

  it('returns error for empty string', () => {
    expect(validateStaticText('invoice.titleAr', '   ')).not.toBeNull();
  });

  it('returns error when text exceeds limit', () => {
    const limit = STATIC_TEXT_LIMITS['invoice.titleAr'];
    const tooLong = 'أ'.repeat(limit + 1);
    expect(validateStaticText('invoice.titleAr', tooLong)).not.toBeNull();
  });

  it('accepts text exactly at the limit', () => {
    const limit = STATIC_TEXT_LIMITS['invoice.titleAr'];
    const atLimit = 'أ'.repeat(limit);
    expect(validateStaticText('invoice.titleAr', atLimit)).toBeNull();
  });
});

// ── escapeStaticText ──────────────────────────────────────────────────────────

describe('escapeStaticText', () => {
  it('escapes HTML special characters', () => {
    expect(escapeStaticText('<script>&"')).toBe('&lt;script&gt;&amp;&quot;');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeStaticText('فاتورة')).toBe('فاتورة');
  });
});

// ── parseStaticTextOverrides ──────────────────────────────────────────────────

describe('parseStaticTextOverrides', () => {
  it('parses valid JSON with known keys', () => {
    const json = JSON.stringify({ 'invoice.titleAr': 'مخصص', 'invoice.titleEn': 'Custom' });
    const result = parseStaticTextOverrides(json);
    expect(result['invoice.titleAr']).toBe('مخصص');
    expect(result['invoice.titleEn']).toBe('Custom');
  });

  it('ignores unknown keys', () => {
    const json = JSON.stringify({ 'unknown.key': 'value', 'invoice.titleAr': 'مخصص' });
    const result = parseStaticTextOverrides(json);
    expect('unknown.key' in result).toBe(false);
    expect(result['invoice.titleAr']).toBe('مخصص');
  });

  it('ignores non-string values', () => {
    const json = JSON.stringify({ 'invoice.titleAr': 123 });
    const result = parseStaticTextOverrides(json);
    expect('invoice.titleAr' in result).toBe(false);
  });

  it('returns empty object for malformed JSON', () => {
    expect(parseStaticTextOverrides('not-json')).toEqual({});
  });

  it('returns empty object for non-object JSON', () => {
    expect(parseStaticTextOverrides('"string"')).toEqual({});
    expect(parseStaticTextOverrides('null')).toEqual({});
    expect(parseStaticTextOverrides('[]')).toEqual({});
  });
});

// ── serializeStaticTextOverrides ──────────────────────────────────────────────

describe('serializeStaticTextOverrides', () => {
  it('round-trips through parse', () => {
    const overrides: StaticTextOverrides = { 'invoice.titleAr': 'مخصص', 'quotation.titleEn': 'Custom' };
    const json = serializeStaticTextOverrides(overrides);
    expect(parseStaticTextOverrides(json)).toEqual(overrides);
  });

  it('serializes empty overrides to empty object JSON', () => {
    expect(serializeStaticTextOverrides({})).toBe('{}');
  });
});

// ── DEFAULT_STATIC_TEXT completeness ─────────────────────────────────────────

describe('DEFAULT_STATIC_TEXT', () => {
  it('has non-empty string for every key', () => {
    for (const [key, val] of Object.entries(DEFAULT_STATIC_TEXT)) {
      expect(typeof val, `key ${key} should be string`).toBe('string');
      expect(val.trim().length, `key ${key} should not be empty`).toBeGreaterThan(0);
    }
  });
});

// ── Dynamic fields MUST NOT carry data-designer-editable ─────────────────────
// This test uses string-based snapshot to verify the template source doesn't
// accidentally mark dynamic data as editable.

describe('Dynamic fields locked (source-level guard)', () => {
  it('invoice number field does not appear as editable', async () => {
    const source = await import('../../print-templates/reference/invoices/InvoiceDesign1?raw');
    const text = source.default as string;
    // data.invoiceNumber should NOT be inside a data-designer-editable element
    // We check that no line has both invoiceNumber and data-designer-editable
    const lines = text.split('\n');
    const suspicious = lines.filter(
      (l) => l.includes('invoiceNumber') && l.includes('data-designer-editable'),
    );
    expect(suspicious).toHaveLength(0);
  });

  it('customer name field does not appear as editable', async () => {
    const source = await import('../../print-templates/reference/invoices/InvoiceDesign1?raw');
    const text = source.default as string;
    const lines = text.split('\n');
    const suspicious = lines.filter(
      (l) => l.includes('customerName') && l.includes('data-designer-editable'),
    );
    expect(suspicious).toHaveLength(0);
  });
});
