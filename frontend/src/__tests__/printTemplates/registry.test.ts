import { describe, it, expect } from 'vitest';
import {
  getPrintTemplates,
  getPrintTemplate,
  getDefaultPrintTemplate,
  getLetterheadVariant,
} from '../../print-templates/engine/registry';

describe('getPrintTemplates', () => {
  it('returns all 10 invoice templates', () => {
    const invoices = getPrintTemplates('invoice');
    expect(invoices).toHaveLength(10);
  });

  it('returns only original-variant templates when filtered', () => {
    const originals = getPrintTemplates('invoice').filter((t) => t.variant === 'original');
    expect(originals).toHaveLength(5);
  });

  it('returns only blank-letterhead variants when filtered', () => {
    const blanks = getPrintTemplates('invoice').filter((t) => t.variant === 'blank-letterhead');
    expect(blanks).toHaveLength(5);
  });
});

describe('getPrintTemplate', () => {
  it('returns the correct template for a known id', () => {
    const tmpl = getPrintTemplate('invoice', 'invoice-design-1');
    expect(tmpl).toBeDefined();
    expect(tmpl!.id).toBe('invoice-design-1');
    expect(tmpl!.variant).toBe('original');
  });

  it('returns undefined for an unknown templateId (stale localStorage)', () => {
    const tmpl = getPrintTemplate('invoice', 'invoice-design-99');
    expect(tmpl).toBeUndefined();
  });

  it('returns undefined for a cross-category id mismatch', () => {
    const tmpl = getPrintTemplate('quotation', 'invoice-design-1');
    expect(tmpl).toBeUndefined();
  });
});

describe('getDefaultPrintTemplate', () => {
  it('returns the first original invoice template without throwing', () => {
    const tmpl = getDefaultPrintTemplate('invoice');
    expect(tmpl).toBeDefined();
    expect(tmpl.variant).toBe('original');
    expect(tmpl.category).toBe('invoice');
  });

  it('returned default has a valid component function', () => {
    const tmpl = getDefaultPrintTemplate('invoice');
    expect(typeof tmpl.component).toBe('function');
  });
});

describe('getLetterheadVariant', () => {
  it('returns the blank variant for a known original', () => {
    const blank = getLetterheadVariant('invoice', 'invoice-design-1');
    expect(blank).toBeDefined();
    expect(blank!.id).toBe('invoice-design-1-blank');
    expect(blank!.variant).toBe('blank-letterhead');
  });

  it('returns undefined for an id with no blank counterpart', () => {
    const blank = getLetterheadVariant('invoice', 'invoice-design-99');
    expect(blank).toBeUndefined();
  });
});
