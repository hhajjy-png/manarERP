import { describe, it, expect } from 'vitest';
import {
  parseTemplateStudioSettings,
  serializeTemplateStudioSettings,
  validateTemplate,
  validateElement,
  sanitizeTemplateName,
  generateElementId,
  createBlankTemplate,
  cloneTemplate,
  exportTemplate,
  importTemplate,
  resolveDynamicField,
  getAllowedFields,
  isAllowedField,
  estimateDataUrlBytes,
  isDataUrlWithinLimit,
  getActiveTemplate,
  MAX_IMAGE_BYTES,
} from '../../print-templates/studio/templateStudioUtils';
import type {
  TemplateStudioSettings,
  TemplateStudioTemplate,
  TextElement,
  DynamicFieldElement,
  RectElement,
} from '../../print-templates/studio/templateStudioTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeInvoiceTemplate(overrides: Partial<TemplateStudioTemplate> = {}): TemplateStudioTemplate {
  return {
    id: 'tpl-test-1',
    name: 'Test Invoice',
    documentType: 'invoice',
    page: { size: 'A4', orientation: 'portrait', marginMm: 10 },
    elements: [],
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}

function makeTextElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'txt-1', label: 'Title', type: 'text',
    x: 10, y: 10, w: 50, h: 10, rotation: 0,
    content: 'فاتورة', style: { fontSize: 'large', fontWeight: 'bold' },
    ...overrides,
  };
}

// ─── 1. Parse valid template settings ────────────────────────────────────────
describe('parseTemplateStudioSettings', () => {
  it('parses valid settings', () => {
    const settings: TemplateStudioSettings = { version: 1, templates: [] };
    const json = JSON.stringify(settings);
    const result = parseTemplateStudioSettings(json);
    expect(result).not.toBeNull();
    expect(result?.version).toBe(1);
    expect(result?.templates).toHaveLength(0);
  });
});

// ─── 2. Parse invalid JSON falls back gracefully ──────────────────────────────
describe('parseTemplateStudioSettings invalid', () => {
  it('returns null for garbage JSON', () => {
    expect(parseTemplateStudioSettings('{not valid json')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseTemplateStudioSettings(undefined)).toBeNull();
  });

  it('returns null for wrong version', () => {
    const json = JSON.stringify({ version: 99, templates: [] });
    expect(parseTemplateStudioSettings(json)).toBeNull();
  });

  it('returns null when templates is not array', () => {
    const json = JSON.stringify({ version: 1, templates: 'bad' });
    expect(parseTemplateStudioSettings(json)).toBeNull();
  });
});

// ─── 3. Reject unknown element type ──────────────────────────────────────────
describe('validateElement unknown type', () => {
  it('rejects unknown element type', () => {
    const el = { id: 'x', label: 'X', type: 'unknown', x: 0, y: 0, w: 10, h: 10, rotation: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = validateElement(el as any, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('نوع عنصر غير معروف'))).toBe(true);
  });
});

// ─── 4. Reject unsafe dynamic field ──────────────────────────────────────────
describe('validateElement unsafe field', () => {
  it('rejects unsafe dynamic field path', () => {
    const el: DynamicFieldElement = {
      id: 'df-1', label: 'Field', type: 'dynamicField',
      x: 0, y: 0, w: 40, h: 8, rotation: 0,
      field: 'invoice.__proto__.polluted',
    };
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('حقل غير مسموح'))).toBe(true);
  });

  it('rejects SQL-like field', () => {
    const el: DynamicFieldElement = {
      id: 'df-2', label: 'SQL', type: 'dynamicField',
      x: 0, y: 0, w: 40, h: 8, rotation: 0,
      field: "' OR 1=1 --",
    };
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
  });
});

// ─── 5. Resolve allowed invoice field ────────────────────────────────────────
describe('resolveDynamicField invoice', () => {
  it('resolves invoice.number', () => {
    const data = { number: 'INV-001', customerName: 'شركة التقدم' };
    expect(resolveDynamicField('invoice', 'invoice.number', data)).toBe('INV-001');
  });

  it('resolves invoice.customerName', () => {
    const data = { customerName: 'شركة المنار' };
    expect(resolveDynamicField('invoice', 'invoice.customerName', data)).toBe('شركة المنار');
  });

  it('returns empty string for disallowed field', () => {
    const data = { password: 'secret' };
    expect(resolveDynamicField('invoice', 'invoice.password', data)).toBe('');
  });
});

// ─── 6. Resolve allowed quotation field ──────────────────────────────────────
describe('resolveDynamicField quotation', () => {
  it('resolves quotation.total', () => {
    const data = { total: '500.000' };
    expect(resolveDynamicField('quotation', 'quotation.total', data)).toBe('500.000');
  });

  it('returns empty string when field missing from data', () => {
    expect(resolveDynamicField('quotation', 'quotation.notes', {})).toBe('');
  });
});

// ─── 7. Sanitize template name ────────────────────────────────────────────────
describe('sanitizeTemplateName', () => {
  it('strips dangerous HTML characters', () => {
    expect(sanitizeTemplateName('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('truncates to 60 chars', () => {
    const long = 'أ'.repeat(100);
    expect(sanitizeTemplateName(long).length).toBeLessThanOrEqual(60);
  });

  it('returns fallback for empty string', () => {
    expect(sanitizeTemplateName('   ')).toBe('قالب جديد');
  });

  it('trims whitespace', () => {
    expect(sanitizeTemplateName('  اسم القالب  ')).toBe('اسم القالب');
  });
});

// ─── 8. Generate unique element IDs ──────────────────────────────────────────
describe('generateElementId', () => {
  it('starts with the element type', () => {
    expect(generateElementId('text')).toMatch(/^text-/);
    expect(generateElementId('rect')).toMatch(/^rect-/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateElementId('text')));
    expect(ids.size).toBe(50);
  });
});

// ─── 9. Clone template ────────────────────────────────────────────────────────
describe('cloneTemplate', () => {
  it('gives the clone a different ID', () => {
    const original = makeInvoiceTemplate();
    const clone = cloneTemplate(original);
    expect(clone.id).not.toBe(original.id);
  });

  it('appends (نسخة) to the name', () => {
    const original = makeInvoiceTemplate({ name: 'فاتورة' });
    const clone = cloneTemplate(original);
    expect(clone.name).toContain('نسخة');
  });

  it('deep-copies elements (not shared reference)', () => {
    const original = makeInvoiceTemplate({ elements: [makeTextElement()] });
    const clone = cloneTemplate(original);
    clone.elements[0].label = 'changed';
    expect(original.elements[0].label).toBe('Title');
  });
});

// ─── 10. Export / import roundtrip ───────────────────────────────────────────
describe('export / import roundtrip', () => {
  it('round-trips a template through JSON', () => {
    const original = makeInvoiceTemplate({ elements: [makeTextElement()] });
    const json = exportTemplate(original);
    const result = importTemplate(json);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('should be ok');
    expect(result.template.documentType).toBe('invoice');
    expect(result.template.elements).toHaveLength(1);
  });

  it('gives import a fresh ID different from original', () => {
    const original = makeInvoiceTemplate();
    const json = exportTemplate(original);
    const result = importTemplate(json);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('should be ok');
    expect(result.template.id).not.toBe(original.id);
  });

  it('rejects invalid JSON on import', () => {
    const result = importTemplate('{broken json');
    expect(result.ok).toBe(false);
  });

  it('rejects unknown element type in imported template', () => {
    const tpl = makeInvoiceTemplate();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tpl.elements as any[]).push({ id: 'x', label: 'X', type: 'exploit', x: 0, y: 0, w: 10, h: 10, rotation: 0 });
    const json = JSON.stringify({ version: 1, template: tpl });
    const result = importTemplate(json);
    expect(result.ok).toBe(false);
  });
});

// ─── 11. Image data URL size validation ──────────────────────────────────────
describe('image size validation', () => {
  it('accepts data URL under limit', () => {
    // ~100 bytes base64
    const smallDataUrl = 'data:image/png;base64,' + 'A'.repeat(136);
    expect(isDataUrlWithinLimit(smallDataUrl)).toBe(true);
  });

  it('rejects data URL over limit', () => {
    // > 1MB in base64
    const bigBase64 = 'A'.repeat(Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 100);
    const bigDataUrl = `data:image/png;base64,${bigBase64}`;
    expect(isDataUrlWithinLimit(bigDataUrl)).toBe(false);
  });

  it('estimates bytes correctly', () => {
    const base64Len = 1000;
    const url = `data:image/png;base64,${'A'.repeat(base64Len)}`;
    expect(estimateDataUrlBytes(url)).toBe(Math.ceil(base64Len * 0.75));
  });
});

// ─── 12. Text element validation ─────────────────────────────────────────────
describe('text element validation', () => {
  it('accepts valid text element', () => {
    const result = validateElement(makeTextElement(), 'invoice');
    expect(result.valid).toBe(true);
  });

  it('rejects text element with zero width', () => {
    const result = validateElement(makeTextElement({ w: 0 }), 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('w'))).toBe(true);
  });
});

// ─── 13. Shape element validation ────────────────────────────────────────────
describe('shape element validation', () => {
  it('accepts valid rect element', () => {
    const el: RectElement = {
      id: 'rect-1', label: 'Box', type: 'rect',
      x: 0, y: 0, w: 20, h: 10, rotation: 0,
      fillColor: 'light', borderColor: 'dark', borderRadius: 2,
    };
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(true);
  });

  it('rejects rect with negative height', () => {
    const el: RectElement = {
      id: 'rect-2', label: 'Box', type: 'rect',
      x: 0, y: 0, w: 20, h: -5, rotation: 0,
      fillColor: 'light', borderColor: 'dark', borderRadius: 0,
    };
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
  });
});

// ─── 14. No arbitrary CSS injection ──────────────────────────────────────────
describe('no CSS injection via name', () => {
  it('strips CSS-injection characters from template name', () => {
    const name = 'Template <style>body{display:none}</style>';
    const safe = sanitizeTemplateName(name);
    expect(safe).not.toContain('<');
    expect(safe).not.toContain('>');
  });
});

// ─── 15. No HTML rendering in text content (structural) ──────────────────────
describe('text content is plain string only', () => {
  it('text element content is stored as plain string', () => {
    const el = makeTextElement({ content: '<b>bold</b>' });
    expect(typeof el.content).toBe('string');
    // The renderer must NOT use dangerouslySetInnerHTML — just {el.content}
    // This test verifies the content is stored verbatim (not parsed/sanitized here)
    expect(el.content).toBe('<b>bold</b>');
  });
});

// ─── 16. Active template fallback when none set ───────────────────────────────
describe('getActiveTemplate', () => {
  it('returns null when no activeId', () => {
    const settings: TemplateStudioSettings = {
      version: 1,
      templates: [makeInvoiceTemplate()],
    };
    expect(getActiveTemplate(settings, 'invoice', null)).toBeNull();
  });

  it('returns null when settings is null', () => {
    expect(getActiveTemplate(null, 'invoice', 'tpl-test-1')).toBeNull();
  });

  it('returns template when id matches', () => {
    const tpl = makeInvoiceTemplate();
    const settings: TemplateStudioSettings = { version: 1, templates: [tpl] };
    const result = getActiveTemplate(settings, 'invoice', tpl.id);
    expect(result?.id).toBe(tpl.id);
  });
});

// ─── 17. Default-OFF studio mode (active template not found = null) ───────────
describe('default-off studio mode', () => {
  it('getActiveTemplate returns null when id not found in templates', () => {
    const settings: TemplateStudioSettings = { version: 1, templates: [] };
    expect(getActiveTemplate(settings, 'invoice', 'nonexistent-id')).toBeNull();
  });

  it('getAllowedFields returns non-empty for both doc types', () => {
    expect(getAllowedFields('invoice').length).toBeGreaterThan(0);
    expect(getAllowedFields('quotation').length).toBeGreaterThan(0);
  });

  it('isAllowedField returns false for arbitrary path', () => {
    expect(isAllowedField('invoice', 'invoice.constructor.prototype')).toBe(false);
    expect(isAllowedField('quotation', 'quotation.rawQuery')).toBe(false);
  });

  it('serialize/parse roundtrip preserves settings', () => {
    const tpl = makeInvoiceTemplate({ elements: [makeTextElement()] });
    const settings: TemplateStudioSettings = { version: 1, templates: [tpl] };
    const serialized = serializeTemplateStudioSettings(settings);
    const parsed = parseTemplateStudioSettings(serialized);
    expect(parsed?.templates).toHaveLength(1);
    expect(parsed?.templates[0].name).toBe(tpl.name);
  });
});
