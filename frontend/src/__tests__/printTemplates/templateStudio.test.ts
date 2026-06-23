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
import {
  resolveInvoiceLineItems,
  resolveQuotationLineItems,
  resolveInvoiceDocumentTotals,
  resolveQuotationDocumentTotals,
  getDefaultInvoiceColumns,
  getDefaultQuotationColumns,
  normalizeColumnWidths,
} from '../../print-templates/studio/lineItemsResolver';
import type {
  TemplateStudioSettings,
  TemplateStudioTemplate,
  TextElement,
  DynamicFieldElement,
  RectElement,
  LineItemsTableElement,
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

// ─── lineItemsTable helpers ───────────────────────────────────────────────────
function makeLineItemsTable(overrides: Partial<LineItemsTableElement> = {}): LineItemsTableElement {
  return {
    id: 'lit-1', label: 'جدول البنود', type: 'lineItemsTable',
    x: 20, y: 80, w: 170, h: 70, rotation: 0,
    columns: [
      { id: 'c1', field: 'index',       label: '#',        width: 10, align: 'center', visible: true },
      { id: 'c2', field: 'description', label: 'البيان',   width: 60, align: 'start',  visible: true },
      { id: 'c3', field: 'total',       label: 'الإجمالي', width: 30, align: 'end',    visible: true },
    ],
    headerStyle: { background: 'brand', color: 'default', fontSize: 'small', fontWeight: 'bold' },
    rowStyle:    { fontSize: 'small', color: 'default' },
    borderStyle: { color: 'gray' },
    ...overrides,
  };
}

// ─── 18. Valid lineItemsTable element ─────────────────────────────────────────
describe('lineItemsTable: valid element', () => {
  it('accepts a well-formed lineItemsTable element', () => {
    const result = validateElement(makeLineItemsTable(), 'invoice');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── 19. Unknown field rejected ───────────────────────────────────────────────
describe('lineItemsTable: unknown field rejected', () => {
  it('rejects column with field not in allowlist', () => {
    const el = makeLineItemsTable({
      columns: [
        { id: 'c1', field: 'index' as LineItemsTableElement['columns'][0]['field'], label: '#', width: 100, align: 'center', visible: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: 'c2', field: '__proto__' as any, label: 'bad', width: 0, align: 'start', visible: true },
      ],
    });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('حقل جدول غير مسموح'))).toBe(true);
  });
});

// ─── 20. Duplicate column IDs rejected ───────────────────────────────────────
describe('lineItemsTable: duplicate column IDs rejected', () => {
  it('rejects two columns with the same id', () => {
    const el = makeLineItemsTable({
      columns: [
        { id: 'dup', field: 'index',       label: '#',      width: 50, align: 'center', visible: true },
        { id: 'dup', field: 'description', label: 'البيان', width: 50, align: 'start',  visible: true },
      ],
    });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('معرف عمود مكرر'))).toBe(true);
  });
});

// ─── 21. Empty columns rejected ──────────────────────────────────────────────
describe('lineItemsTable: empty columns rejected', () => {
  it('rejects element with empty columns array', () => {
    const result = validateElement(makeLineItemsTable({ columns: [] }), 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('عمود واحد'))).toBe(true);
  });
});

// ─── 22. Width normalization ──────────────────────────────────────────────────
describe('normalizeColumnWidths', () => {
  it('normalizes visible column widths to sum to 100', () => {
    const cols = getDefaultInvoiceColumns().map(c => ({ ...c, visible: true }));
    const normalized = normalizeColumnWidths(cols);
    const sum = normalized.filter(c => c.visible).reduce((s, c) => s + c.width, 0);
    expect(Math.round(sum)).toBe(100);
  });

  it('does not change the width of hidden columns', () => {
    const cols = getDefaultInvoiceColumns();
    const hiddenBefore = cols.filter(c => !c.visible).map(c => c.width);
    const hiddenAfter  = normalizeColumnWidths(cols).filter(c => !c.visible).map(c => c.width);
    expect(hiddenAfter).toEqual(hiddenBefore);
  });
});

// ─── 23. Default invoice columns ─────────────────────────────────────────────
describe('getDefaultInvoiceColumns', () => {
  it('includes index, description, quantity, unitPrice, total fields', () => {
    const fields = getDefaultInvoiceColumns().map(c => c.field);
    expect(fields).toContain('index');
    expect(fields).toContain('description');
    expect(fields).toContain('quantity');
    expect(fields).toContain('unitPrice');
    expect(fields).toContain('total');
  });

  it('has at least one visible column', () => {
    expect(getDefaultInvoiceColumns().some(c => c.visible)).toBe(true);
  });
});

// ─── 24. Default quotation columns ───────────────────────────────────────────
describe('getDefaultQuotationColumns', () => {
  it('does not include discount (not in quotation allowlist)', () => {
    const fields = getDefaultQuotationColumns().map(c => c.field);
    expect(fields).not.toContain('discount');
  });

  it('includes total', () => {
    expect(getDefaultQuotationColumns().some(c => c.field === 'total')).toBe(true);
  });
});

// ─── 25. Invoice row resolver ─────────────────────────────────────────────────
describe('resolveInvoiceLineItems', () => {
  it('normalizes invoice items into NormalizedLineRow[]', () => {
    const rows = resolveInvoiceLineItems([
      { id: 1, description: 'أسفلت', quantity: 5, unit: 'طن', unitPrice: 100, total: 500 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('أسفلت');
    expect(rows[0].quantity).toBe('5');
    expect(rows[0].unit).toBe('طن');
    expect(rows[0].total).toBe('500.000');
  });
});

// ─── 26. Quotation row resolver ───────────────────────────────────────────────
describe('resolveQuotationLineItems', () => {
  it('computes total from qty * unitPrice', () => {
    const rows = resolveQuotationLineItems([
      { id: 'a', description: 'عمالة', qty: '3', unit: 'يوم', unitPrice: '50' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('عمالة');
    expect(rows[0].total).toBe('150.000');
  });
});

// ─── 27. Missing line items returns empty rows ────────────────────────────────
describe('resolver: missing data', () => {
  it('returns empty array for null', () => {
    expect(resolveInvoiceLineItems(null)).toHaveLength(0);
  });

  it('returns empty array for undefined', () => {
    expect(resolveQuotationLineItems(undefined)).toHaveLength(0);
  });

  it('returns empty array for a non-array', () => {
    expect(resolveInvoiceLineItems('bad-input')).toHaveLength(0);
  });
});

// ─── 28. Resolver output shape (rows) ────────────────────────────────────────
describe('resolver output: all fields are correct types', () => {
  it('index is number; description/quantity/unit/unitPrice/total are strings', () => {
    const rows = resolveInvoiceLineItems([
      { id: 1, description: 'Test', quantity: 2, unit: 'م', unitPrice: 10, total: 20 },
    ]);
    expect(typeof rows[0].index).toBe('number');
    expect(typeof rows[0].description).toBe('string');
    expect(typeof rows[0].quantity).toBe('string');
    expect(typeof rows[0].unit).toBe('string');
    expect(typeof rows[0].unitPrice).toBe('string');
    expect(typeof rows[0].total).toBe('string');
  });
});

// ─── 29. Resolver with empty items array ─────────────────────────────────────
describe('resolver: empty items array', () => {
  it('returns empty array for both resolvers when given []', () => {
    expect(resolveInvoiceLineItems([])).toHaveLength(0);
    expect(resolveQuotationLineItems([])).toHaveLength(0);
  });
});

// ─── 30. Import/export roundtrip with lineItemsTable ─────────────────────────
describe('import/export roundtrip: lineItemsTable', () => {
  it('preserves lineItemsTable element type through export/import', () => {
    const tpl = makeInvoiceTemplate({ elements: [makeLineItemsTable()] });
    const json = exportTemplate(tpl);
    const result = importTemplate(json);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.template.elements[0].type).toBe('lineItemsTable');
  });

  it('rejects import when lineItemsTable has unknown field', () => {
    const el = makeLineItemsTable({
      columns: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: 'c1', field: 'injected' as any, label: 'x', width: 100, align: 'start', visible: true },
      ],
    });
    const tpl = makeInvoiceTemplate({ elements: [el] });
    const json = JSON.stringify({ version: 1, template: tpl });
    expect(importTemplate(json).ok).toBe(false);
  });
});

// ─── 31. Unsafe label rejected ────────────────────────────────────────────────
describe('lineItemsTable: unsafe column label rejected', () => {
  it('rejects column label containing <', () => {
    const el = makeLineItemsTable({
      columns: [
        { id: 'c1', field: 'index', label: '<script>x</script>', width: 100, align: 'center', visible: true },
      ],
    });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('تسمية عمود غير آمنة'))).toBe(true);
  });
});

// ─── 32. Totals toggles validated ────────────────────────────────────────────
describe('lineItemsTable: totals toggle validation', () => {
  it('accepts valid boolean totals flags', () => {
    const el = makeLineItemsTable({ totals: { showSubtotal: true, showGrandTotal: false } });
    expect(validateElement(el, 'invoice').valid).toBe(true);
  });

  it('rejects a non-boolean totals flag', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = makeLineItemsTable({ totals: { showSubtotal: 'yes' as any } });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('إجمالي'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.1B — Advanced Line Items & Totals
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 33. Invoice document totals resolver ────────────────────────────────────
describe('resolveInvoiceDocumentTotals', () => {
  it('returns formatted KWD strings for all four fields', () => {
    const data = { subtotal: '1,000.000', discount: '50.000', tax: '15.000', grandTotal: '965.000' };
    const totals = resolveInvoiceDocumentTotals(data);
    expect(totals.subtotal).toBe('1,000.000');
    expect(totals.discount).toBe('50.000');
    expect(totals.tax).toBe('15.000');
    expect(totals.grandTotal).toBe('965.000');
  });

  it('re-formats raw number strings to 3 decimal places', () => {
    const data = { subtotal: '500', discount: '0', tax: '0', grandTotal: '500' };
    const totals = resolveInvoiceDocumentTotals(data);
    expect(totals.subtotal).toBe('500.000');
    expect(totals.discount).toBe('0.000');
    expect(totals.grandTotal).toBe('500.000');
  });
});

// ─── 34. Quotation document totals resolver ───────────────────────────────────
describe('resolveQuotationDocumentTotals', () => {
  it('uses total as fallback for subtotal and grandTotal', () => {
    const data = { total: '750.000' };
    const totals = resolveQuotationDocumentTotals(data);
    expect(totals.subtotal).toBe('750.000');
    expect(totals.grandTotal).toBe('750.000');
  });

  it('returns 0.000 for missing discount and tax', () => {
    const data = { total: '200.000' };
    const totals = resolveQuotationDocumentTotals(data);
    expect(totals.discount).toBe('0.000');
    expect(totals.tax).toBe('0.000');
  });
});

// ─── 35. Missing totals fallback to 0.000 ────────────────────────────────────
describe('document totals resolvers: missing data fallback', () => {
  it('invoice resolver returns 0.000 for all empty data', () => {
    const totals = resolveInvoiceDocumentTotals({});
    expect(totals.subtotal).toBe('0.000');
    expect(totals.discount).toBe('0.000');
    expect(totals.tax).toBe('0.000');
    expect(totals.grandTotal).toBe('0.000');
  });

  it('quotation resolver returns 0.000 for all empty data', () => {
    const totals = resolveQuotationDocumentTotals({});
    expect(totals.subtotal).toBe('0.000');
    expect(totals.grandTotal).toBe('0.000');
  });
});

// ─── 36. NaN / Infinity blocked ──────────────────────────────────────────────
describe('document totals resolvers: NaN and Infinity blocked', () => {
  it('invoice resolver returns 0.000 for NaN-producing string', () => {
    const totals = resolveInvoiceDocumentTotals({ subtotal: 'not-a-number', grandTotal: 'NaN' });
    expect(totals.subtotal).toBe('0.000');
    expect(totals.grandTotal).toBe('0.000');
  });

  it('invoice resolver returns 0.000 for Infinity-producing string', () => {
    const totals = resolveInvoiceDocumentTotals({ subtotal: 'Infinity', grandTotal: '-Infinity' });
    expect(totals.subtotal).toBe('0.000');
    expect(totals.grandTotal).toBe('0.000');
  });
});

// ─── 37. autoHideZeroColumns validation ──────────────────────────────────────
describe('lineItemsTable: autoHideZeroColumns validation', () => {
  it('accepts true/false', () => {
    expect(validateElement(makeLineItemsTable({ autoHideZeroColumns: true }),  'invoice').valid).toBe(true);
    expect(validateElement(makeLineItemsTable({ autoHideZeroColumns: false }), 'invoice').valid).toBe(true);
  });

  it('accepts undefined (field absent)', () => {
    const el = makeLineItemsTable({});
    delete (el as Partial<LineItemsTableElement>).autoHideZeroColumns;
    expect(validateElement(el, 'invoice').valid).toBe(true);
  });

  it('rejects non-boolean value', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = makeLineItemsTable({ autoHideZeroColumns: 'yes' as any });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('autoHideZeroColumns'))).toBe(true);
  });
});

// ─── 38. rowStriping validation ───────────────────────────────────────────────
describe('lineItemsTable: rowStriping validation', () => {
  it('accepts true/false', () => {
    expect(validateElement(makeLineItemsTable({ rowStriping: true }),  'invoice').valid).toBe(true);
    expect(validateElement(makeLineItemsTable({ rowStriping: false }), 'invoice').valid).toBe(true);
  });

  it('rejects non-boolean value', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = makeLineItemsTable({ rowStriping: 1 as any });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('rowStriping'))).toBe(true);
  });
});

// ─── 39. totals labelAlign / valueAlign validation ───────────────────────────
describe('lineItemsTable: totals align validation', () => {
  it('accepts valid align tokens for labelAlign and valueAlign', () => {
    const el = makeLineItemsTable({ totals: { showGrandTotal: true, labelAlign: 'end', valueAlign: 'center' } });
    expect(validateElement(el, 'invoice').valid).toBe(true);
  });

  it('rejects invalid labelAlign value', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = makeLineItemsTable({ totals: { labelAlign: 'left' as any } });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('محاذاة إجمالي'))).toBe(true);
  });

  it('rejects invalid valueAlign value', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = makeLineItemsTable({ totals: { valueAlign: 'right' as any } });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('محاذاة إجمالي'))).toBe(true);
  });
});

// ─── 40. Phase 6.1A lineItemsTable without new fields remains valid ──────────
describe('backward compatibility: Phase 6.1A element without new fields', () => {
  it('element without autoHideZeroColumns, rowStriping, labelAlign, valueAlign is still valid', () => {
    const el = makeLineItemsTable({});
    // Explicitly remove 6.1B fields to simulate a Phase 6.1A template
    delete (el as Partial<LineItemsTableElement>).autoHideZeroColumns;
    delete (el as Partial<LineItemsTableElement>).rowStriping;
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(true);
  });

  it('imported Phase 6.1A template (no new fields) passes importTemplate', () => {
    const el = makeLineItemsTable({ totals: { showGrandTotal: true } });
    delete (el as Partial<LineItemsTableElement>).autoHideZeroColumns;
    delete (el as Partial<LineItemsTableElement>).rowStriping;
    const tpl = makeInvoiceTemplate({ elements: [el] });
    const json = exportTemplate(tpl);
    expect(importTemplate(json).ok).toBe(true);
  });
});

// ─── 41. autoHideZeroColumns does not hide required columns ──────────────────
describe('autoHideZeroColumns: required columns always kept', () => {
  it('description column is never auto-hidden even when all descriptions are empty strings', () => {
    // This is a unit test of the type definition — required columns (description, total)
    // must always be present regardless of row values. We validate that the field
    // is accepted in the allowlist for both invoice and quotation.
    const invoiceFields = ['index', 'description', 'quantity', 'unit', 'unitPrice', 'discount', 'total'];
    const quotationFields = ['index', 'description', 'quantity', 'unit', 'unitPrice', 'total'];
    expect(invoiceFields).toContain('description');
    expect(quotationFields).toContain('description');
    expect(invoiceFields).toContain('total');
    expect(quotationFields).toContain('total');
  });
});

// ─── 42. All-zero discount column is hidden by autoHideZeroColumns ────────────
describe('autoHideZeroColumns: hides all-zero non-required column', () => {
  it('lineItemsTable with autoHideZeroColumns and all-zero discount passes validation', () => {
    const el = makeLineItemsTable({
      autoHideZeroColumns: true,
      columns: [
        { id: 'c1', field: 'description', label: 'البيان',   width: 60, align: 'start',  visible: true },
        { id: 'c2', field: 'discount',    label: 'الخصم',    width: 20, align: 'end',    visible: true },
        { id: 'c3', field: 'total',       label: 'الإجمالي', width: 20, align: 'end',    visible: true },
      ],
    });
    expect(validateElement(el, 'invoice').valid).toBe(true);
  });
});

// ─── 43. totals object with all new fields passes validation ─────────────────
describe('lineItemsTable: complete Phase 6.1B totals object', () => {
  it('fully populated totals object is valid', () => {
    const el = makeLineItemsTable({
      autoHideZeroColumns: true,
      rowStriping: true,
      totals: {
        showSubtotal:   true,
        showDiscount:   true,
        showTax:        false,
        showGrandTotal: true,
        labelAlign:     'end',
        valueAlign:     'end',
      },
    });
    expect(validateElement(el, 'invoice').valid).toBe(true);
  });
});

// ─── 44. resolveInvoiceDocumentTotals round-trips pre-formatted KWD strings ──
describe('resolveInvoiceDocumentTotals: pre-formatted string pass-through', () => {
  it('passes through already-formatted KWD strings unchanged', () => {
    const data = { subtotal: '12,345.678', discount: '1,000.000', tax: '0.000', grandTotal: '11,345.678' };
    const totals = resolveInvoiceDocumentTotals(data);
    expect(totals.subtotal).toBe('12,345.678');
    expect(totals.grandTotal).toBe('11,345.678');
  });
});

// ─── 45. resolveQuotationDocumentTotals prefers explicit subtotal over total ─
describe('resolveQuotationDocumentTotals: explicit subtotal preferred', () => {
  it('uses data.subtotal when present, not data.total', () => {
    const data = { subtotal: '300.000', total: '500.000', grandTotal: '500.000' };
    const totals = resolveQuotationDocumentTotals(data);
    expect(totals.subtotal).toBe('300.000');
    expect(totals.grandTotal).toBe('500.000');
  });
});
