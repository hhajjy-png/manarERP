import { describe, it, expect } from 'vitest';
import {
  isBrandingElement,
  isTextElement,
  DESIGNER_CAPABILITIES,
  type DesignerElement,
} from '../../print-templates/designer/designerTypes';
import { getDesignerElementFromTarget } from '../../print-templates/designer/designerDom';

// Minimal HTMLElement mock that satisfies getDesignerElementFromTarget
function makeTarget(closestDataset: Record<string, string> | null): HTMLElement {
  return {
    closest: () =>
      closestDataset
        ? ({ dataset: closestDataset } as unknown as Element)
        : null,
  } as unknown as HTMLElement;
}

// ── isBrandingElement ─────────────────────────────────────────────────────────

describe('isBrandingElement', () => {
  it('returns false for null', () => {
    expect(isBrandingElement(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isBrandingElement(undefined)).toBe(false);
  });

  it('returns true for branding kind', () => {
    const el: DesignerElement = { id: 'signature', kind: 'branding', documentType: 'invoice', label: 'التوقيع' };
    expect(isBrandingElement(el)).toBe(true);
  });

  it('returns false for text kind', () => {
    const el: DesignerElement = { id: 'invoice.title', kind: 'text', documentType: 'invoice', label: 'العنوان' };
    expect(isBrandingElement(el)).toBe(false);
  });
});

// ── isTextElement ─────────────────────────────────────────────────────────────

describe('isTextElement', () => {
  it('returns false for null', () => {
    expect(isTextElement(null)).toBe(false);
  });

  it('returns true for text kind', () => {
    const el: DesignerElement = { id: 'invoice.title', kind: 'text', documentType: 'invoice', label: 'العنوان' };
    expect(isTextElement(el)).toBe(true);
  });

  it('returns false for branding kind', () => {
    const el: DesignerElement = { id: 'stamp', kind: 'branding', documentType: 'quotation', label: 'الختم' };
    expect(isTextElement(el)).toBe(false);
  });
});

// ── DESIGNER_CAPABILITIES ─────────────────────────────────────────────────────

describe('DESIGNER_CAPABILITIES', () => {
  it('all capabilities are disabled in Phase 5C', () => {
    expect(DESIGNER_CAPABILITIES.rotation).toBe(false);
    expect(DESIGNER_CAPABILITIES.copy).toBe(false);
    expect(DESIGNER_CAPABILITIES.paste).toBe(false);
    expect(DESIGNER_CAPABILITIES.duplicate).toBe(false);
    expect(DESIGNER_CAPABILITIES.lock).toBe(false);
    expect(DESIGNER_CAPABILITIES.hide).toBe(false);
  });
});

// ── getDesignerElementFromTarget ──────────────────────────────────────────────

describe('getDesignerElementFromTarget', () => {
  it('returns null when no [data-designer-type] ancestor', () => {
    const target = makeTarget(null);
    expect(getDesignerElementFromTarget(target)).toBeNull();
  });

  it('returns null for unrecognised kind', () => {
    const target = makeTarget({ designerType: 'unknown', designerId: 'x', designerDoc: 'invoice' });
    expect(getDesignerElementFromTarget(target)).toBeNull();
  });

  it('returns correct DesignerElement for text kind', () => {
    const target = makeTarget({
      designerType: 'text',
      designerId: 'invoice.title',
      designerDoc: 'invoice',
      designerLabel: 'عنوان الفاتورة',
    });
    expect(getDesignerElementFromTarget(target)).toEqual({
      id: 'invoice.title',
      kind: 'text',
      documentType: 'invoice',
      label: 'عنوان الفاتورة',
    });
  });

  it('returns correct DesignerElement for branding kind', () => {
    const target = makeTarget({
      designerType: 'branding',
      designerId: 'signature',
      designerDoc: 'quotation',
      designerLabel: 'التوقيع',
    });
    const result = getDesignerElementFromTarget(target);
    expect(result?.kind).toBe('branding');
    expect(result?.id).toBe('signature');
    expect(result?.documentType).toBe('quotation');
  });

  it('falls back to id as label when designerLabel is absent', () => {
    const target = makeTarget({
      designerType: 'text',
      designerId: 'invoice.footer',
      designerDoc: 'invoice',
    });
    const result = getDesignerElementFromTarget(target);
    expect(result?.label).toBe('invoice.footer');
  });

  it('uses empty string for missing designerDoc', () => {
    const target = makeTarget({ designerType: 'text', designerId: 'x' });
    const result = getDesignerElementFromTarget(target);
    expect(result?.documentType).toBe('');
  });
});
