import { describe, it, expect } from 'vitest';
import {
  getPrintTemplates,
  getPrintTemplate,
  getDefaultPrintTemplate,
  getLetterheadVariant,
} from '../../print-templates/engine/registry';

describe('getPrintTemplates – quotation', () => {
  it('returns all 10 quotation templates', () => {
    const quotations = getPrintTemplates('quotation');
    expect(quotations).toHaveLength(10);
  });

  it('returns only original-variant templates when filtered', () => {
    const originals = getPrintTemplates('quotation').filter((t) => t.variant === 'original');
    expect(originals).toHaveLength(5);
  });

  it('returns only blank-letterhead variants when filtered', () => {
    const blanks = getPrintTemplates('quotation').filter((t) => t.variant === 'blank-letterhead');
    expect(blanks).toHaveLength(5);
  });

  it('all quotation templates have a valid component function', () => {
    const quotations = getPrintTemplates('quotation');
    quotations.forEach((t) => {
      expect(typeof t.component).toBe('function');
    });
  });

  it('all quotation templates have category set to "quotation"', () => {
    const quotations = getPrintTemplates('quotation');
    quotations.forEach((t) => {
      expect(t.category).toBe('quotation');
    });
  });

  it('all quotation templates have language set to "bilingual"', () => {
    const quotations = getPrintTemplates('quotation');
    quotations.forEach((t) => {
      expect(t.language).toBe('bilingual');
    });
  });
});

describe('getPrintTemplate – quotation', () => {
  it('returns the correct template for quotation-design-1', () => {
    const tmpl = getPrintTemplate('quotation', 'quotation-design-1');
    expect(tmpl).toBeDefined();
    expect(tmpl!.id).toBe('quotation-design-1');
    expect(tmpl!.variant).toBe('original');
    expect(tmpl!.supports.plainA4).toBe(true);
    expect(tmpl!.supports.letterhead).toBe(false);
  });

  it('returns the correct template for quotation-design-5-blank', () => {
    const tmpl = getPrintTemplate('quotation', 'quotation-design-5-blank');
    expect(tmpl).toBeDefined();
    expect(tmpl!.id).toBe('quotation-design-5-blank');
    expect(tmpl!.variant).toBe('blank-letterhead');
    expect(tmpl!.supports.plainA4).toBe(false);
    expect(tmpl!.supports.letterhead).toBe(true);
  });

  it('returns undefined for an unknown quotation templateId', () => {
    const tmpl = getPrintTemplate('quotation', 'quotation-design-99');
    expect(tmpl).toBeUndefined();
  });

  it('returns undefined for a cross-category id mismatch', () => {
    const tmpl = getPrintTemplate('invoice', 'quotation-design-1');
    expect(tmpl).toBeUndefined();
  });
});

describe('getDefaultPrintTemplate – quotation', () => {
  it('returns the first original quotation template without throwing', () => {
    const tmpl = getDefaultPrintTemplate('quotation');
    expect(tmpl).toBeDefined();
    expect(tmpl.variant).toBe('original');
    expect(tmpl.category).toBe('quotation');
  });

  it('returned default has a valid component function', () => {
    const tmpl = getDefaultPrintTemplate('quotation');
    expect(typeof tmpl.component).toBe('function');
  });
});

describe('getLetterheadVariant – quotation', () => {
  it('returns the blank variant for quotation-design-1', () => {
    const blank = getLetterheadVariant('quotation', 'quotation-design-1');
    expect(blank).toBeDefined();
    expect(blank!.id).toBe('quotation-design-1-blank');
    expect(blank!.variant).toBe('blank-letterhead');
  });

  it('returns the blank variant for quotation-design-3', () => {
    const blank = getLetterheadVariant('quotation', 'quotation-design-3');
    expect(blank).toBeDefined();
    expect(blank!.id).toBe('quotation-design-3-blank');
    expect(blank!.variant).toBe('blank-letterhead');
  });

  it('returns the blank variant for quotation-design-5', () => {
    const blank = getLetterheadVariant('quotation', 'quotation-design-5');
    expect(blank).toBeDefined();
    expect(blank!.id).toBe('quotation-design-5-blank');
    expect(blank!.variant).toBe('blank-letterhead');
  });

  it('returns undefined for an id with no blank counterpart', () => {
    const blank = getLetterheadVariant('quotation', 'quotation-design-99');
    expect(blank).toBeUndefined();
  });
});
