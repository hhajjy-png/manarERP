import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ELEMENT_LAYOUT,
  DEFAULT_BRANDING_LAYOUT,
  clampBrandingElementLayout,
  parseBrandingLayout,
  serializeBrandingLayout,
  getBrandingLayoutForDocument,
  applyBrandingElementStyle,
} from '../../print-templates/utils/brandingLayout';

describe('parseBrandingLayout', () => {
  it('returns defaults for null/undefined', () => {
    expect(parseBrandingLayout(null)).toEqual(DEFAULT_BRANDING_LAYOUT);
    expect(parseBrandingLayout(undefined)).toEqual(DEFAULT_BRANDING_LAYOUT);
    expect(parseBrandingLayout('')).toEqual(DEFAULT_BRANDING_LAYOUT);
  });

  it('returns defaults for invalid JSON', () => {
    expect(parseBrandingLayout('not-json')).toEqual(DEFAULT_BRANDING_LAYOUT);
    expect(parseBrandingLayout('{broken')).toEqual(DEFAULT_BRANDING_LAYOUT);
  });

  it('parses valid JSON correctly', () => {
    const layout = {
      invoice: {
        signature: { x: 10, y: -5, scale: 1.2, opacity: 0.8, zIndex: 1 },
        stamp: { x: -10, y: 20, scale: 0.9, opacity: 1, zIndex: 2 },
      },
      quotation: {
        signature: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1 },
        stamp: { x: 5, y: 5, scale: 1.1, opacity: 0.9, zIndex: 1 },
      },
    };
    expect(parseBrandingLayout(JSON.stringify(layout))).toEqual(layout);
  });

  it('falls back to defaults for malformed doc layout', () => {
    const partial = JSON.stringify({ invoice: { bad: true }, quotation: null });
    const result = parseBrandingLayout(partial);
    expect(result.invoice).toEqual(DEFAULT_BRANDING_LAYOUT.invoice);
    expect(result.quotation).toEqual(DEFAULT_BRANDING_LAYOUT.quotation);
  });
});

describe('clampBrandingElementLayout', () => {
  it('clamps x to −80..80', () => {
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, x: 200 }).x).toBe(80);
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, x: -200 }).x).toBe(-80);
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, x: 50 }).x).toBe(50);
  });

  it('clamps y to −60..60', () => {
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, y: 100 }).y).toBe(60);
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, y: -100 }).y).toBe(-60);
  });

  it('clamps scale to 0.4..2.5', () => {
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, scale: 0.1 }).scale).toBe(0.4);
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, scale: 5 }).scale).toBe(2.5);
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, scale: 1.5 }).scale).toBe(1.5);
  });

  it('clamps opacity to 0.2..1', () => {
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, opacity: 0 }).opacity).toBe(0.2);
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, opacity: 2 }).opacity).toBe(1);
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, opacity: 0.5 }).opacity).toBe(0.5);
  });

  it('clamps zIndex to 1 or 2', () => {
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, zIndex: 5 }).zIndex).toBe(2);
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, zIndex: 0 }).zIndex).toBe(1);
    expect(clampBrandingElementLayout({ ...DEFAULT_ELEMENT_LAYOUT, zIndex: 2 }).zIndex).toBe(2);
  });
});

describe('serializeBrandingLayout / roundtrip', () => {
  it('serialize then parse returns original', () => {
    const layout = {
      invoice: {
        signature: { x: 15, y: -10, scale: 1.3, opacity: 0.7, zIndex: 2 },
        stamp: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1 },
      },
      quotation: {
        signature: { x: -20, y: 30, scale: 0.8, opacity: 0.9, zIndex: 1 },
        stamp: { x: 10, y: -5, scale: 1.1, opacity: 1, zIndex: 1 },
      },
    };
    expect(parseBrandingLayout(serializeBrandingLayout(layout))).toEqual(layout);
  });
});

describe('getBrandingLayoutForDocument', () => {
  it('returns per-document layout', () => {
    const invoiceEl = { x: 10, y: 5, scale: 1.2, opacity: 0.9, zIndex: 1 };
    const layout = {
      invoice: { signature: invoiceEl, stamp: invoiceEl },
      quotation: DEFAULT_BRANDING_LAYOUT.quotation,
    };
    expect(getBrandingLayoutForDocument(layout, 'invoice').signature).toEqual(invoiceEl);
  });

  it('returns defaults when layout is undefined', () => {
    expect(getBrandingLayoutForDocument(undefined, 'invoice')).toEqual(DEFAULT_BRANDING_LAYOUT.invoice);
    expect(getBrandingLayoutForDocument(undefined, 'quotation')).toEqual(DEFAULT_BRANDING_LAYOUT.quotation);
  });

  it('invoice and quotation layouts are independent', () => {
    const layout = {
      invoice: {
        signature: { x: 20, y: 0, scale: 1, opacity: 1, zIndex: 1 },
        stamp: DEFAULT_ELEMENT_LAYOUT,
      },
      quotation: {
        signature: { x: -20, y: 0, scale: 1, opacity: 1, zIndex: 1 },
        stamp: DEFAULT_ELEMENT_LAYOUT,
      },
    };
    const inv = getBrandingLayoutForDocument(layout, 'invoice');
    const quot = getBrandingLayoutForDocument(layout, 'quotation');
    expect(inv.signature.x).toBe(20);
    expect(quot.signature.x).toBe(-20);
  });
});

describe('applyBrandingElementStyle', () => {
  it('returns safe CSS transform string', () => {
    const el = { x: 10, y: -5, scale: 1.5, opacity: 0.8, zIndex: 1 };
    const css = applyBrandingElementStyle(el);
    expect(css.transform).toBe('translate(10px, -5px) scale(1.5)');
    expect(css.opacity).toBe(0.8);
    expect(css.position).toBe('relative');
    expect(css.zIndex).toBe(1);
    expect(css.transformOrigin).toBe('center');
  });

  it('clamps out-of-range values before applying', () => {
    const el = { x: 200, y: -200, scale: 10, opacity: 0, zIndex: 5 };
    const css = applyBrandingElementStyle(el);
    expect(css.transform).toBe('translate(80px, -60px) scale(2.5)');
    expect(css.opacity).toBe(0.2);
    expect(css.zIndex).toBe(2);
  });

  it('identity defaults produce no visual change', () => {
    const css = applyBrandingElementStyle({ ...DEFAULT_ELEMENT_LAYOUT });
    expect(css.transform).toBe('translate(0px, 0px) scale(1)');
    expect(css.opacity).toBe(1);
  });
});
