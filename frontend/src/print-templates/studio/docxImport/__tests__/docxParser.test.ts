// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { docxHtmlToElements, tryDynamicField } from '../docxParser';
import type {
  TextElement,
  DynamicFieldElement,
  LineElement,
  LineItemsTableElement,
} from '../../templateStudioTypes';

// Helper: run with A4 defaults and no logo IDs
function parse(html: string, docType: 'invoice' | 'quotation' = 'invoice') {
  return docxHtmlToElements(html, docType, new Set(), 10, 210, 297);
}

// ─── Empty and basic text ─────────────────────────────────────────────────────
describe('empty document', () => {
  it('returns empty elements and no warnings for empty HTML', () => {
    const { elements, warnings } = parse('');
    expect(elements).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});

describe('paragraph → TextElement', () => {
  it('maps <p> to TextElement with correct content', () => {
    const { elements } = parse('<p>Hello</p>');
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe('text');
    expect((elements[0] as TextElement).content).toBe('Hello');
  });

  it('ignores empty paragraphs', () => {
    const { elements } = parse('<p></p><p>Text</p><p>  </p>');
    expect(elements).toHaveLength(1);
  });
});

// ─── Headings ─────────────────────────────────────────────────────────────────
describe('headings', () => {
  it('maps <h1> to xlarge + bold with label عنوان مستورد', () => {
    const { elements } = parse('<h1>Title</h1>');
    const el = elements[0] as TextElement;
    expect(el.type).toBe('text');
    expect(el.label).toBe('عنوان مستورد');
    expect(el.style.fontSize).toBe('xlarge');
    expect(el.style.fontWeight).toBe('bold');
  });

  it('maps <h2> to xlarge + bold', () => {
    const { elements } = parse('<h2>Sub</h2>');
    const el = elements[0] as TextElement;
    expect(el.style.fontSize).toBe('xlarge');
    expect(el.style.fontWeight).toBe('bold');
  });

  it('maps <h3> to large + medium', () => {
    const { elements } = parse('<h3>Sub3</h3>');
    const el = elements[0] as TextElement;
    expect(el.style.fontSize).toBe('large');
    expect(el.style.fontWeight).toBe('medium');
  });
});

// ─── Bold / italic / underline ────────────────────────────────────────────────
describe('inline styles', () => {
  it('sets fontWeight bold when <strong> present', () => {
    const { elements } = parse('<p><strong>Bold</strong></p>');
    expect((elements[0] as TextElement).style.fontWeight).toBe('bold');
  });

  it('emits italic_unsupported warning exactly once across multiple paragraphs', () => {
    const { elements, warnings } = parse('<p><em>Italic</em></p><p><em>More</em></p>');
    expect((elements[0] as TextElement).style.fontWeight).toBe('regular');
    const italicWarnings = warnings.filter(w => w.type === 'unsupported_feature_italic');
    expect(italicWarnings).toHaveLength(1);
  });

  it('emits underline_unsupported warning exactly once', () => {
    const { warnings } = parse('<p><u>Under</u></p><p><u>line</u></p>');
    expect(warnings.filter(w => w.type === 'unsupported_feature_underline')).toHaveLength(1);
  });
});

// ─── Alignment ────────────────────────────────────────────────────────────────
describe('text alignment', () => {
  it('maps text-align:center → center', () => {
    const { elements } = parse('<p style="text-align: center">C</p>');
    expect((elements[0] as TextElement).style.align).toBe('center');
  });

  it('maps text-align:right → start (RTL)', () => {
    const { elements } = parse('<p style="text-align: right">R</p>');
    expect((elements[0] as TextElement).style.align).toBe('start');
  });

  it('maps text-align:left → end (RTL)', () => {
    const { elements } = parse('<p style="text-align: left">L</p>');
    expect((elements[0] as TextElement).style.align).toBe('end');
  });

  it('maps text-align:justify → start', () => {
    const { elements } = parse('<p style="text-align: justify">J</p>');
    expect((elements[0] as TextElement).style.align).toBe('start');
  });

  it('defaults to start when no alignment specified', () => {
    const { elements } = parse('<p>No align</p>');
    expect((elements[0] as TextElement).style.align).toBe('start');
  });
});

// ─── Flow layout ──────────────────────────────────────────────────────────────
describe('flow layout', () => {
  it('assigns strictly increasing y values for multiple paragraphs', () => {
    const { elements } = parse('<p>A</p><p>B</p><p>C</p>');
    expect(elements).toHaveLength(3);
    expect(elements[0].y).toBeLessThan(elements[1].y);
    expect(elements[1].y).toBeLessThan(elements[2].y);
  });

  it('first element y starts at or above pageMarginMm', () => {
    const { elements } = parse('<p>First</p>');
    expect(elements[0].y).toBeGreaterThanOrEqual(10); // marginMm = 10
  });
});

// ─── Font size ────────────────────────────────────────────────────────────────
describe('font size mapping', () => {
  it('maps 7pt → small', () => {
    const { elements } = parse('<p style="font-size: 7pt">Small</p>');
    expect((elements[0] as TextElement).style.fontSize).toBe('small');
  });

  it('maps 20pt → xlarge', () => {
    const { elements } = parse('<p style="font-size: 20pt">XL</p>');
    expect((elements[0] as TextElement).style.fontSize).toBe('xlarge');
  });

  it('defaults to normal when no font-size', () => {
    const { elements } = parse('<p>Normal</p>');
    expect((elements[0] as TextElement).style.fontSize).toBe('normal');
  });
});

// ─── Dynamic fields ───────────────────────────────────────────────────────────
describe('tryDynamicField', () => {
  it('returns field name for valid whole-paragraph match (invoice)', () => {
    expect(tryDynamicField('{{invoice.number}}', 'invoice')).toBe('invoice.number');
  });

  it('returns null for mixed content', () => {
    expect(tryDynamicField('رقم: {{invoice.number}}', 'invoice')).toBeNull();
  });

  it('returns null for unknown field', () => {
    expect(tryDynamicField('{{unknown.xyz}}', 'invoice')).toBeNull();
  });

  it('returns null for cross-type field (quotation field in invoice context)', () => {
    expect(tryDynamicField('{{quotation.date}}', 'invoice')).toBeNull();
  });
});

describe('dynamic field elements', () => {
  it('converts whole-paragraph {{invoice.number}} to DynamicFieldElement', () => {
    const { elements } = parse('<p>{{invoice.number}}</p>');
    expect(elements[0].type).toBe('dynamicField');
    expect((elements[0] as DynamicFieldElement).field).toBe('invoice.number');
  });

  it('keeps mixed content as TextElement without dynamic_field_unknown warning', () => {
    const { elements, warnings } = parse('<p>رقم: {{invoice.number}}</p>');
    expect(elements[0].type).toBe('text');
    expect(warnings.some(w => w.type === 'dynamic_field_unknown')).toBe(false);
  });

  it('emits dynamic_field_unknown for standalone {{unknown.field}}', () => {
    const { elements, warnings } = parse('<p>{{unknown.field}}</p>');
    expect(elements[0].type).toBe('text');
    expect(warnings.some(w => w.type === 'dynamic_field_unknown')).toBe(true);
  });
});

// ─── Horizontal rule ─────────────────────────────────────────────────────────
describe('horizontal rule', () => {
  it('maps <hr> to LineElement with horizontal orientation and label خط فاصل', () => {
    const { elements } = parse('<p>Before</p><hr><p>After</p>');
    const hr = elements.find(e => e.type === 'line') as LineElement | undefined;
    expect(hr).toBeDefined();
    expect(hr!.orientation).toBe('horizontal');
    expect(hr!.label).toBe('خط فاصل');
    expect(hr!.color).toBe('dark');
  });
});

// ─── Table detection ─────────────────────────────────────────────────────────
describe('line-items table detection', () => {
  it('maps table with Arabic headers الوصف/الكمية/الإجمالي to LineItemsTableElement', () => {
    const html = `
      <table>
        <tr><th>الوصف</th><th>الكمية</th><th>الإجمالي</th></tr>
        <tr><td>بند 1</td><td>10</td><td>100</td></tr>
      </table>`;
    const { elements } = parse(html);
    const table = elements.find(e => e.type === 'lineItemsTable') as LineItemsTableElement | undefined;
    expect(table).toBeDefined();
    expect(table!.label).toBe('جدول البنود');
    expect(table!.columns.some(c => c.field === 'description')).toBe(true);
    expect(table!.columns.some(c => c.field === 'quantity')).toBe(true);
    expect(table!.columns.some(c => c.field === 'total')).toBe(true);
  });
});

// ─── Element count cap ────────────────────────────────────────────────────────
describe('element count cap', () => {
  it('caps at 200 elements and emits element_count_capped warning', () => {
    const manyParas = Array.from({ length: 201 }, (_, i) => `<p>P${i}</p>`).join('');
    const { elements, warnings } = parse(manyParas);
    expect(elements).toHaveLength(200);
    expect(warnings.some(w => w.type === 'element_count_capped')).toBe(true);
  });
});

// ─── Page breaks ─────────────────────────────────────────────────────────────
describe('page breaks', () => {
  it('skips top-level <br data-page-break="true"> and emits page_break_skipped', () => {
    const { elements, warnings } = parse(
      '<p>Before</p><br data-page-break="true"><p>After</p>',
    );
    expect(elements).toHaveLength(2);
    expect(warnings.some(w => w.type === 'page_break_skipped')).toBe(true);
  });
});

// ─── BaseElement fields ───────────────────────────────────────────────────────
describe('all generated elements have required BaseElement fields', () => {
  it('every element has id, label, x, y, w>0, h>0, rotation=0', () => {
    const { elements } = parse('<p>Test</p><h1>Title</h1><hr>');
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(typeof el.id).toBe('string');
      expect(el.id.length).toBeGreaterThan(0);
      expect(typeof el.label).toBe('string');
      expect(typeof el.x).toBe('number');
      expect(typeof el.y).toBe('number');
      expect(typeof el.w).toBe('number');
      expect(el.w).toBeGreaterThan(0);
      expect(typeof el.h).toBe('number');
      expect(el.h).toBeGreaterThan(0);
      expect((el as { rotation?: number }).rotation).toBe(0);
    }
  });
});
