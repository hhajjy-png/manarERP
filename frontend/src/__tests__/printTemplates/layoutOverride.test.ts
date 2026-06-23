import { describe, it, expect } from 'vitest';
import {
  clampLayoutElement,
  DEFAULT_LAYOUT_ELEMENT,
  layoutElementToCSS,
  buildLayoutStyleSheet,
  serializeAllLayouts,
  parseAllLayouts,
  patchDocumentLayout,
} from '../../print-templates/designer/layoutOverrideUtils';

describe('clampLayoutElement', () => {
  it('clamps x to -400..400', () => {
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, x: 9999 }).x).toBe(400);
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, x: -9999 }).x).toBe(-400);
  });

  it('clamps rotation to -180..180', () => {
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, rotation: 270 }).rotation).toBe(180);
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, rotation: -270 }).rotation).toBe(-180);
  });

  it('clamps scaleX to 0.1..5', () => {
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, scaleX: 0 }).scaleX).toBe(0.1);
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, scaleX: 100 }).scaleX).toBe(5);
  });

  it('clamps opacity to 0.1..1', () => {
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, opacity: 0 }).opacity).toBe(0.1);
    expect(clampLayoutElement({ ...DEFAULT_LAYOUT_ELEMENT, opacity: 2 }).opacity).toBe(1);
  });
});

describe('layoutElementToCSS', () => {
  it('generates transform with all components', () => {
    const el = { ...DEFAULT_LAYOUT_ELEMENT, x: 10, y: -5, rotation: 15, scaleX: 1.2, scaleY: 0.9 };
    const css = layoutElementToCSS('invoice.title', el);
    expect(css).toContain('translate(10px, -5px)');
    expect(css).toContain('rotate(15deg)');
    expect(css).toContain('scaleX(1.2)');
    expect(css).toContain('scaleY(0.9)');
    expect(css).toContain('[data-designer-id="invoice.title"]');
  });

  it('includes display none for hidden elements', () => {
    const el = { ...DEFAULT_LAYOUT_ELEMENT, hidden: true };
    expect(layoutElementToCSS('invoice.title', el)).toContain('display: none');
  });
});

describe('buildLayoutStyleSheet', () => {
  it('emits empty string when all overrides are default', () => {
    const css = buildLayoutStyleSheet({ 'invoice.title': { ...DEFAULT_LAYOUT_ELEMENT } });
    expect(css).toBe('');
  });

  it('emits CSS only for non-default elements', () => {
    const css = buildLayoutStyleSheet({
      'invoice.title': { ...DEFAULT_LAYOUT_ELEMENT, x: 20 },
      'invoice.customerBlock': { ...DEFAULT_LAYOUT_ELEMENT },
    });
    expect(css).toContain('invoice.title');
    expect(css).not.toContain('invoice.customerBlock');
  });
});

describe('parseAllLayouts / serializeAllLayouts', () => {
  it('round-trips correctly', () => {
    const layouts = {
      invoice: { 'invoice.title': { ...DEFAULT_LAYOUT_ELEMENT, x: 10 } },
      quotation: {},
    };
    const result = parseAllLayouts(serializeAllLayouts(layouts));
    expect(result.invoice['invoice.title']?.x).toBe(10);
  });

  it('returns defaults for null/invalid input', () => {
    expect(parseAllLayouts(null)).toEqual({ invoice: {}, quotation: {} });
    expect(parseAllLayouts('not-json')).toEqual({ invoice: {}, quotation: {} });
  });
});

describe('patchDocumentLayout', () => {
  it('patches a single element without affecting others', () => {
    const all = { invoice: { 'invoice.title': { ...DEFAULT_LAYOUT_ELEMENT } }, quotation: {} };
    const result = patchDocumentLayout(all, 'invoice', 'invoice.title', { x: 50 });
    expect(result.invoice['invoice.title']?.x).toBe(50);
    expect(result.invoice['invoice.title']?.y).toBe(0); // unchanged
    expect(result.quotation).toEqual({});
  });
});
