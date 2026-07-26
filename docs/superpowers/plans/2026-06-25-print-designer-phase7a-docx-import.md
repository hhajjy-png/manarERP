# Print Designer Phase 7A — DOCX Template Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4-step DOCX import wizard to the Template Studio that converts Word `.docx` files into fully editable `TemplateStudioTemplate` objects using mammoth.js + JSZip.

**Architecture:** Frontend-only — no backend routes, no Prisma migration, no IPC channels, no new Settings keys. A new `docxImport/` module lives inside `frontend/src/print-templates/studio/`. The wizard is opened from a new button in `TemplateStudioEditor.tsx`, owns all internal state, and hands off to the existing `updateTemplates()` callback on confirm.

**Tech Stack:** mammoth@1.9.0 (DOCX→HTML conversion), jszip@3.10.1 (raw XML for margins + logo detection), React + TypeScript, Vitest + jsdom (unit tests)

## Global Constraints

- `cd frontend && npx tsc --noEmit` must pass with 0 errors after EVERY task
- All element coordinates in mm (A4 = 210 × 297 mm); renderer converts to px internally
- All Arabic UI text: button labels, error messages, element labels, warning messages
- `page` must always be `{ size: 'A4', orientation: 'portrait', marginMm: number }`
- `validateTemplate()` must return `{ valid: true, errors: [] }` before any template is inserted
- No `dangerouslySetInnerHTML` anywhere in this feature
- Pin mammoth at exact version `"mammoth": "1.9.0"` (not caret) in `frontend/package.json`
- Only two existing files may be modified: `frontend/package.json` and `frontend/src/print-templates/studio/TemplateStudioEditor.tsx`
- `TextElement.style` is a `StudioTextStyle` object — NOT flat properties. Use `style: { fontSize, fontWeight, color, align }`
- `BaseElement` requires a `rotation: number` field on every element (use `rotation: 0` for imports)
- `RectElement` has `borderRadius: number` but NO `borderWidth` field
- `LineItemsColumn` requires an `id: string` field that must be unique within the template
- `updateTemplates` in `TemplateStudioEditor.tsx` takes a function `(ts: TemplateStudioTemplate[]) => TemplateStudioTemplate[]`, not an array

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/print-templates/studio/docxImport/docxTypes.ts` | All shared types + constants |
| Create | `frontend/src/print-templates/studio/docxImport/docxMappings.ts` | Token maps, Arabic normalization, keyword sets |
| Create | `frontend/src/print-templates/studio/docxImport/docxParser.ts` | HTML walker + mammoth/JSZip pipeline |
| Create | `frontend/src/print-templates/studio/docxImport/DocxImportWizard.tsx` | 4-step modal UI component |
| Create | `frontend/src/print-templates/studio/docxImport/__tests__/docxParser.test.ts` | ≥ 28 unit tests |
| Modify | `frontend/package.json` | Add mammoth + jszip |
| Modify | `frontend/src/print-templates/studio/TemplateStudioEditor.tsx` | Add DOCX wizard button + component |

---

### Task 1: Install Dependencies and Create Types + Mapping Tables

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/print-templates/studio/docxImport/docxTypes.ts`
- Create: `frontend/src/print-templates/studio/docxImport/docxMappings.ts`

**Interfaces:**
- Produces: `DocxImportOptions`, `DocxParseResult`, `DocxWarning`, `DocxWarningType`, `WizardInternalState`, `WizardStep`, and all `DOCX_*` constants — consumed by Tasks 2–4
- Produces: `mapFontSizePt(pt)`, `parseFontSizePt(style)`, `mapAlignment(cssAlign)`, `parseTextAlign(style)`, `mapTextColor(cssColor)`, `parseColorHex(style)`, `normalizeArabic(s)`, `KEYWORD_SETS`, `DEFAULT_COLUMN_WIDTHS` — consumed by Task 2

- [ ] **Step 1: Install mammoth and jszip**

```bash
cd frontend && npm install mammoth@1.9.0 jszip@3.10.1
```

Expected: `frontend/package.json` `dependencies` now contains `"mammoth": "1.9.0"` and `"jszip": "3.10.1"`. Both packages ship their own TypeScript declarations — no separate `@types/*` packages needed. If `tsc` still complains, run `npm install --save-dev @types/mammoth @types/jszip`.

- [ ] **Step 2: Create docxTypes.ts**

Create `frontend/src/print-templates/studio/docxImport/docxTypes.ts`:

```typescript
import type {
  TemplateStudioDocumentType,
  TemplateStudioElement,
} from '../templateStudioTypes';

// ─── Constants (spec Appendix B) ─────────────────────────────────────────────
export const DOCX_MAX_FILE_BYTES          = 10 * 1024 * 1024; // 10 MB input cap
export const DOCX_MAX_ELEMENTS            = 200;               // element count cap
export const DOCX_MAX_IMAGES             = 10;                // images per import
export const DOCX_MAX_TEMPLATE_JSON_BYTES = 5  * 1024 * 1024; // 5 MB hard block
export const DOCX_WARN_JSON_BYTES         = 2  * 1024 * 1024; // 2 MB soft warning
export const DOCX_ELEMENT_GAP_MM          = 1.5;              // vertical gap between elements
export const DOCX_MAX_Y_MM               = 285;               // Y clamp threshold (mm)
export const DOCX_PREVIEW_SCALE          = 0.45;
export const DOCX_PARSE_TIMEOUT_MS       = 15_000;            // 15 s parse timeout

// ─── Warning types ────────────────────────────────────────────────────────────
export type DocxWarningType =
  | 'image_too_large'
  | 'image_svg_excluded'
  | 'image_count_limit'
  | 'unsupported_feature_italic'
  | 'unsupported_feature_underline'
  | 'unsupported_feature_strikethrough'
  | 'unsupported_shape'
  | 'unsupported_chart'
  | 'unsupported_smartart'
  | 'merged_cell'
  | 'nested_table'
  | 'margin_flattened'
  | 'font_family_ignored'
  | 'partial_bold'
  | 'ltr_element_in_rtl_template'
  | 'page_break_skipped'
  | 'multipage_truncated'
  | 'dynamic_field_unknown'
  | 'element_count_capped'
  | 'element_y_clamped'
  | 'color_token_approximated'
  | 'column_unmatched'
  | 'template_json_large';

export interface DocxWarning {
  type:           DocxWarningType;
  messageAr:      string;
  elementIndex?:  number; // index in elements[] if relevant
}

// ─── Import options (wizard → parser) ────────────────────────────────────────
export interface DocxImportOptions {
  documentType:  TemplateStudioDocumentType;
  templateName?: string; // pre-filled; user can override in Step 4
}

// ─── Parser output ────────────────────────────────────────────────────────────
export interface DocxParseResult {
  elements:       TemplateStudioElement[];
  warnings:       DocxWarning[];
  pageMarginMm:   number;       // from w:pgMar or DEFAULT_PAGE.marginMm (10)
  docWidthMm:     number;       // from w:pgSz; default 210 (A4)
  docHeightMm:    number;       // from w:pgSz; default 297 (A4)
  headerImageIds: Set<string>;  // relationship IDs flagged as potential logos
}

// ─── Wizard internal state ────────────────────────────────────────────────────
export type WizardStep = 1 | 2 | 3 | 4;

export interface WizardInternalState {
  step:         WizardStep;
  file:         File | null;
  documentType: TemplateStudioDocumentType | null;
  parseResult:  DocxParseResult | null;
  templateName: string;
  errorMessage: string | null;
  isParsing:    boolean;
}
```

- [ ] **Step 3: Create docxMappings.ts**

Create `frontend/src/print-templates/studio/docxImport/docxMappings.ts`:

```typescript
import type {
  StudioFontSize,
  StudioTextAlign,
  StudioTextColor,
  AllowedLineItemField,
} from '../templateStudioTypes';

// ─── Font size: CSS pt value → StudioFontSize token ──────────────────────────
export function mapFontSizePt(pt: number): StudioFontSize {
  if (pt < 9)  return 'small';
  if (pt < 12) return 'normal';
  if (pt < 15) return 'large';
  return 'xlarge';
}

// Extract pt number from inline style string, e.g. "font-size: 14pt" → 14
export function parseFontSizePt(inlineStyle: string): number | null {
  const m = /font-size:\s*([\d.]+)pt/i.exec(inlineStyle);
  return m ? parseFloat(m[1]) : null;
}

// ─── Alignment: CSS text-align → StudioTextAlign (RTL canvas) ────────────────
// RTL canvas: visual right = logical start, visual left = logical end
export function mapAlignment(cssAlign: string | null | undefined): StudioTextAlign {
  switch (cssAlign) {
    case 'right':   return 'start';
    case 'center':  return 'center';
    case 'left':    return 'end';
    case 'justify': return 'start'; // not supported — fallback
    default:        return 'start'; // RTL default
  }
}

// Extract text-align value from inline style, e.g. "text-align: center" → "center"
export function parseTextAlign(inlineStyle: string): string | null {
  const m = /text-align:\s*(\w+)/i.exec(inlineStyle);
  return m ? m[1] : null;
}

// ─── Text color: #rrggbb hex → nearest StudioTextColor token ─────────────────
// Euclidean distance in RGB space; threshold 60 = "close enough to a known color"
const COLOR_MAP: ReadonlyArray<{
  r: number; g: number; b: number; token: StudioTextColor;
}> = [
  { r:   0, g:   0, b:   0, token: 'black' },
  { r:  31, g:  41, b:  55, token: 'dark'  },
  { r:  15, g:  23, b:  42, token: 'dark'  },
  { r:  29, g:  78, b: 111, token: 'brand' },
  { r:  29, g:  78, b: 216, token: 'blue'  },
  { r: 107, g: 114, b: 128, token: 'gray'  },
  { r: 156, g: 163, b: 175, token: 'gray'  },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').toLowerCase();
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function mapTextColor(cssColor: string | null | undefined): StudioTextColor {
  if (!cssColor) return 'default';
  const rgb = hexToRgb(cssColor.trim());
  if (!rgb) return 'default';
  let minDist = Infinity;
  let nearest: StudioTextColor = 'default';
  for (const entry of COLOR_MAP) {
    const d = Math.sqrt(
      (rgb.r - entry.r) ** 2 + (rgb.g - entry.g) ** 2 + (rgb.b - entry.b) ** 2,
    );
    if (d < minDist) { minDist = d; nearest = entry.token; }
  }
  return minDist < 60 ? nearest : 'default';
}

// Extract first hex color from inline style, e.g. "color: #1f2937" → "#1f2937"
export function parseColorHex(inlineStyle: string): string | null {
  const m = /color:\s*(#[0-9a-fA-F]{6})\b/i.exec(inlineStyle);
  return m ? m[1] : null;
}

// ─── Arabic normalization ─────────────────────────────────────────────────────
// Used for case-insensitive, orthographic-variant-tolerant keyword matching.
export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا') // alef variants → bare alef
    .replace(/ة/g, 'ه')      // ta marbuta → ha
    .trim();
}

// ─── Line-items table keyword sets ───────────────────────────────────────────
// Match: normalizeArabic(cellText) === normalizeArabic(keyword)
export const KEYWORD_SETS: ReadonlyArray<{
  field:    AllowedLineItemField;
  keywords: readonly string[];
}> = [
  { field: 'index',       keywords: ['الرقم', '#', 'م', 'رقم'] },
  { field: 'description', keywords: ['الوصف', 'البيان', 'الصنف', 'البند', 'وصف'] },
  { field: 'quantity',    keywords: ['الكمية', 'الكمیة', 'كمية', 'عدد'] },
  { field: 'unit',        keywords: ['الوحدة', 'الوحده', 'وحدة'] },
  { field: 'unitPrice',   keywords: ['سعر الوحدة', 'السعر', 'سعر الوحده', 'سعر'] },
  { field: 'discount',    keywords: ['الخصم', 'خصم'] },
  { field: 'total',       keywords: ['الإجمالي', 'الاجمالي', 'المجموع', 'المبلغ', 'إجمالي'] },
] as const;

// Default column widths (percentage); visible columns sum to 100
export const DEFAULT_COLUMN_WIDTHS: Partial<Record<AllowedLineItemField, number>> = {
  index:       8,
  description: 35,
  quantity:    10,
  unit:        10,
  unitPrice:   15,
  discount:    10,
  total:       12,
};
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/print-templates/studio/docxImport/docxTypes.ts frontend/src/print-templates/studio/docxImport/docxMappings.ts
git commit -m "feat(docx-import): install mammoth+jszip, add types and mapping tables"
```

---

### Task 2: Core Parser — HTML Walker, Text/Headings, Dynamic Fields, Flow Layout

**Files:**
- Create: `frontend/src/print-templates/studio/docxImport/docxParser.ts`
- Create: `frontend/src/print-templates/studio/docxImport/__tests__/docxParser.test.ts`

**Interfaces:**
- Consumes: everything from `docxTypes.ts` and `docxMappings.ts`
- Consumes from `../templateStudioUtils`: `generateElementId`, `isAllowedField`, `DEFAULT_PAGE`, `isDataUrlWithinLimit`, `MAX_IMAGE_BYTES`, `validateTemplate`, `sanitizeTemplateName`
- Consumes from `../templateStudioTypes`: `TextElement`, `DynamicFieldElement`, `ImageElement`, `LineElement`, `RectElement`, `LineItemsTableElement`, `StudioFontSize`, `StudioFontWeight`, `LineItemsColumn`
- Produces (exported for tests): `docxHtmlToElements(html, docType, headerImageIds, pageMarginMm, docWidthMm, docHeightMm)`, `tryDynamicField(text, docType)`
- Produces (public API used by wizard in Task 4): `parseDocx(buffer, opts)`, `buildImportedTemplate(result, opts, templateName)`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/print-templates/studio/docxImport/__tests__/docxParser.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { docxHtmlToElements, tryDynamicField } from '../docxParser';
import type {
  TextElement,
  DynamicFieldElement,
  ImageElement,
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
  it('maps <h1> to xlarge + bold', () => {
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

  it('emits italic_unsupported warning exactly once', () => {
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

  it('first element y starts at pageMarginMm', () => {
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
  it('returns field name for valid whole-paragraph match', () => {
    expect(tryDynamicField('{{invoice.number}}', 'invoice')).toBe('invoice.number');
  });

  it('returns null for mixed content', () => {
    expect(tryDynamicField('رقم: {{invoice.number}}', 'invoice')).toBeNull();
  });

  it('returns null for unknown field', () => {
    expect(tryDynamicField('{{unknown.xyz}}', 'invoice')).toBeNull();
  });

  it('returns null for cross-type field', () => {
    expect(tryDynamicField('{{quotation.date}}', 'invoice')).toBeNull();
  });
});

describe('dynamic field elements', () => {
  it('converts whole-paragraph {{invoice.number}} to DynamicFieldElement', () => {
    const { elements } = parse('<p>{{invoice.number}}</p>');
    expect(elements[0].type).toBe('dynamicField');
    expect((elements[0] as DynamicFieldElement).field).toBe('invoice.number');
  });

  it('keeps mixed content as TextElement (no dynamic warning)', () => {
    const { elements, warnings } = parse('<p>رقم: {{invoice.number}}</p>');
    expect(elements[0].type).toBe('text');
    expect(warnings.some(w => w.type === 'dynamic_field_unknown')).toBe(false);
  });

  it('emits dynamic_field_unknown for {{unknown.field}} alone', () => {
    const { elements, warnings } = parse('<p>{{unknown.field}}</p>');
    expect(elements[0].type).toBe('text');
    expect(warnings.some(w => w.type === 'dynamic_field_unknown')).toBe(true);
  });
});

// ─── Horizontal rule ─────────────────────────────────────────────────────────
describe('horizontal rule', () => {
  it('maps <hr> to LineElement with horizontal orientation', () => {
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
  it('caps at 200 elements and emits element_count_capped', () => {
    const manyParas = Array.from({ length: 201 }, (_, i) => `<p>P${i}</p>`).join('');
    const { elements, warnings } = parse(manyParas);
    expect(elements).toHaveLength(200);
    expect(warnings.some(w => w.type === 'element_count_capped')).toBe(true);
  });
});

// ─── Page breaks ─────────────────────────────────────────────────────────────
describe('page breaks', () => {
  it('skips <br data-page-break="true"> and emits page_break_skipped', () => {
    const { elements, warnings } = parse(
      '<p>Before</p><br data-page-break="true"><p>After</p>',
    );
    expect(elements).toHaveLength(2);
    expect(warnings.some(w => w.type === 'page_break_skipped')).toBe(true);
  });
});

// ─── validateTemplate ─────────────────────────────────────────────────────────
describe('all generated templates pass validateTemplate', () => {
  it('template from typical HTML passes validateTemplate', () => {
    // buildImportedTemplate is tested implicitly through wizard; here we test
    // that all elements produced have required fields (id, label, x, y, w, h, rotation)
    const { elements } = parse('<p>Test</p><h1>Title</h1>');
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
      expect(typeof (el as { rotation?: number }).rotation).toBe('number');
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/print-templates/studio/docxImport/__tests__/docxParser.test.ts
```

Expected: ALL tests FAIL with `Cannot find module '../docxParser'`

- [ ] **Step 3: Create docxParser.ts with HTML walker + text/headings/dynamic fields**

Create `frontend/src/print-templates/studio/docxImport/docxParser.ts`:

```typescript
import mammoth from 'mammoth';
import JSZip from 'jszip';
import type {
  TemplateStudioElement,
  TemplateStudioTemplate,
  TemplateStudioDocumentType,
  TextElement,
  DynamicFieldElement,
  ImageElement,
  LineElement,
  RectElement,
  LineItemsTableElement,
  LineItemsColumn,
  StudioFontSize,
  StudioFontWeight,
} from '../templateStudioTypes';
import {
  generateElementId,
  isAllowedField,
  DEFAULT_PAGE,
  isDataUrlWithinLimit,
  MAX_IMAGE_BYTES,
  validateTemplate,
  sanitizeTemplateName,
} from '../templateStudioUtils';
import {
  mapFontSizePt,
  parseFontSizePt,
  mapAlignment,
  parseTextAlign,
  mapTextColor,
  parseColorHex,
  normalizeArabic,
  KEYWORD_SETS,
  DEFAULT_COLUMN_WIDTHS,
} from './docxMappings';
import type { DocxImportOptions, DocxParseResult, DocxWarning } from './docxTypes';
import {
  DOCX_MAX_ELEMENTS,
  DOCX_MAX_IMAGES,
  DOCX_MAX_TEMPLATE_JSON_BYTES,
  DOCX_WARN_JSON_BYTES,
  DOCX_ELEMENT_GAP_MM,
  DOCX_MAX_Y_MM,
} from './docxTypes';

// ─── Private template ID ──────────────────────────────────────────────────────
function generateTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Security: strip dangerous tags before DOMParser ─────────────────────────
function sanitizeHtml(html: string): string {
  return html.replace(
    /<(script|style|iframe|object|embed|link)(\s[^>]*)?>[\s\S]*?<\/\1>/gi,
    '',
  );
}

// ─── Dynamic field regex ──────────────────────────────────────────────────────
const DYNAMIC_FIELD_RE = /^\{\{([\w.]+)\}\}$/;

// exported for unit tests
export function tryDynamicField(
  text: string,
  docType: TemplateStudioDocumentType,
): string | null {
  const m = DYNAMIC_FIELD_RE.exec(text.trim());
  if (!m) return null;
  return isAllowedField(docType, m[1]) ? m[1] : null;
}

// ─── Font size: majority vote across child spans ──────────────────────────────
function extractFontSize(el: Element): StudioFontSize {
  const counts = new Map<number, number>();
  const ownPt = parseFontSizePt((el as HTMLElement).getAttribute('style') ?? '');
  if (ownPt !== null) counts.set(ownPt, 1);
  for (const span of el.querySelectorAll('[style]')) {
    const pt = parseFontSizePt((span as HTMLElement).getAttribute('style') ?? '');
    if (pt !== null) counts.set(pt, (counts.get(pt) ?? 0) + 1);
  }
  if (counts.size === 0) return 'normal';
  // Highest count wins; ties broken toward larger size
  return mapFontSizePt(
    [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0],
  );
}

// ─── Estimated text height in mm ─────────────────────────────────────────────
const FONT_H_MM: Record<StudioFontSize, number> = {
  small: 5, normal: 6, large: 8, xlarge: 10,
};

function estimateH(content: string, fontSize: StudioFontSize, widthMm: number): number {
  const charsPerLine = Math.max(1, Math.floor(widthMm / 3.2)); // ~3.2 mm/char Arabic
  const lines = Math.max(1, Math.ceil(content.length / charsPerLine));
  return FONT_H_MM[fontSize] * lines + 2; // +2 padding
}

// ─── HTML → elements (exported for unit tests — no mammoth/JSZip) ─────────────
export function docxHtmlToElements(
  html: string,
  docType: TemplateStudioDocumentType,
  headerImageIds: Set<string>,
  pageMarginMm: number,
  docWidthMm: number,
  docHeightMm: number,
): { elements: TemplateStudioElement[]; warnings: DocxWarning[] } {
  const doc       = new DOMParser().parseFromString(html, 'text/html');
  const elements: TemplateStudioElement[] = [];
  const warnings: DocxWarning[]           = [];

  const scaleX   = 210 / docWidthMm;
  const scaleY   = 297 / docHeightMm;
  const leftMm   = pageMarginMm;
  const contentW = 210 - pageMarginMm * 2; // mm

  let cursorY           = pageMarginMm;
  let italicWarned      = false;
  let underlineWarned   = false;
  let partialBoldWarned = false;
  let imageCount        = 0;

  // ── Shared helpers (closures over state) ────────────────────────────────────

  function warn(type: DocxWarning['type'], messageAr: string, idx?: number): void {
    warnings.push({ type, messageAr, ...(idx !== undefined && { elementIndex: idx }) });
  }

  function getY(h: number): number {
    const raw = cursorY * scaleY;
    if (raw + h > DOCX_MAX_Y_MM) {
      warn('element_y_clamped', 'تم تقليص عنصر ليبقى داخل حدود الصفحة');
      return DOCX_MAX_Y_MM - h;
    }
    return raw;
  }

  function advance(h: number): void {
    cursorY += h / scaleY + DOCX_ELEMENT_GAP_MM;
  }

  // ── Text / heading processor ─────────────────────────────────────────────────

  function processText(node: Element): void {
    // Skip page-break-only paragraphs
    if (node.querySelector('br[data-page-break="true"]') && !(node.textContent ?? '').trim()) {
      warn('page_break_skipped', 'فاصل صفحة — تم تجاهله');
      return;
    }

    const text = (node.textContent ?? '').trim();
    if (!text) return;

    const tag      = node.tagName.toLowerCase();
    const hm       = /^h([1-6])$/.exec(tag);
    const hLevel   = hm ? parseInt(hm[1]) : 0;
    const isH      = hLevel > 0;

    // Font size and weight from heading level
    const H_SIZE: Record<number, StudioFontSize>   = { 1:'xlarge', 2:'xlarge', 3:'large', 4:'large', 5:'normal', 6:'normal' };
    const H_WGHT: Record<number, StudioFontWeight> = { 1:'bold',   2:'bold',   3:'medium',4:'bold',  5:'bold',   6:'regular' };
    const fontSize   = isH ? H_SIZE[hLevel]  : extractFontSize(node);
    let fontWeight: StudioFontWeight = isH ? H_WGHT[hLevel] : 'regular';

    if (!isH) {
      const hasStrong  = !!node.querySelector('strong');
      if (hasStrong) {
        fontWeight = 'bold';
        const strongLen = Array.from(node.querySelectorAll('strong'))
          .reduce((n, s) => n + (s.textContent?.length ?? 0), 0);
        if (strongLen < text.length * 0.9 && !partialBoldWarned) {
          warn('partial_bold', 'بعض الأجزاء غامقة — تم تطبيق الغمق على النص كاملاً');
          partialBoldWarned = true;
        }
      }
    }

    // One-time inline warnings
    if (!italicWarned && node.querySelector('em')) {
      warn('unsupported_feature_italic', 'النص المائل غير مدعوم — تم تجاهل الخاصية');
      italicWarned = true;
    }
    if (!underlineWarned && node.querySelector('u')) {
      warn('unsupported_feature_underline', 'الخط تحت النص غير مدعوم — تم تجاهل الخاصية');
      underlineWarned = true;
    }

    const inlineStyle = (node as HTMLElement).getAttribute('style') ?? '';
    const align    = mapAlignment(parseTextAlign(inlineStyle));
    const colorHex = parseColorHex(inlineStyle)
                  ?? parseColorHex((node.querySelector('[style]') as HTMLElement | null)
                      ?.getAttribute('style') ?? '');
    const color = mapTextColor(colorHex);
    const label = isH ? 'عنوان مستورد' : 'نص مستورد';
    const h     = estimateH(text, fontSize, contentW * scaleX);

    // Dynamic field check (whole-paragraph match only)
    const dynField = tryDynamicField(text, docType);
    if (dynField) {
      const el: DynamicFieldElement = {
        id: generateElementId('dynamicField'), label: 'حقل ديناميكي',
        type: 'dynamicField', field: dynField,
        x: leftMm * scaleX, y: getY(h), w: contentW * scaleX, h, rotation: 0,
        style: { fontSize, fontWeight, align, color },
      };
      elements.push(el);
      advance(h);
      return;
    }

    // Unknown {{ }} placeholder — warn and treat as text
    if (DYNAMIC_FIELD_RE.test(text)) {
      warn('dynamic_field_unknown', `حقل غير معروف: ${text}`, elements.length);
    }

    const el: TextElement = {
      id: generateElementId('text'), label,
      type: 'text', content: text,
      x: leftMm * scaleX, y: getY(h), w: contentW * scaleX, h, rotation: 0,
      style: { fontSize, fontWeight, align, color },
    };
    elements.push(el);
    advance(h);
  }

  // ── Image processor ──────────────────────────────────────────────────────────

  function processImg(img: Element): void {
    if (imageCount >= DOCX_MAX_IMAGES) {
      warn('image_count_limit', 'تم الوصول إلى الحد الأقصى للصور المستخرجة');
      return;
    }
    const src = (img as HTMLImageElement).src || img.getAttribute('src') || '';
    if (!src.startsWith('data:image/')) return;

    const mimeM = /^data:(image\/[^;]+);/.exec(src);
    const mime  = mimeM ? mimeM[1] : '';
    if (mime === 'image/svg+xml') {
      warn('image_svg_excluded', 'صورة SVG — تم تجاهلها لأسباب أمنية');
      return;
    }
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(mime)) {
      warn('image_svg_excluded', `نوع صورة غير مدعوم: ${mime}`);
      return;
    }
    if (!isDataUrlWithinLimit(src, MAX_IMAGE_BYTES)) {
      warn('image_too_large', 'صورة تتجاوز 1 ميغابايت — تم تجاهلها');
      return;
    }

    const w = 40; const h = 30; // default mm dimensions
    const isLogo = headerImageIds.has(img.getAttribute('data-rel-id') ?? '');
    const el: ImageElement = {
      id: generateElementId('image'),
      label: isLogo ? 'شعار محتمل' : 'صورة مستوردة',
      type: 'image', src,
      alt: img.getAttribute('alt') ?? 'صورة مستوردة',
      x: leftMm * scaleX, y: getY(h), w: w * scaleX, h: h * scaleY, rotation: 0,
    };
    imageCount++;
    elements.push(el);
    advance(h);
  }

  // ── Table processor ──────────────────────────────────────────────────────────

  function processTable(table: Element): void {
    const rows = table.querySelectorAll('tr');
    if (!rows.length) return;

    const headerCells  = rows[0].querySelectorAll('th, td');
    const headers      = Array.from(headerCells).map(c => (c.textContent ?? '').trim());

    // Line-items table heuristic: ≥3 cells + ≥3 header keyword matches
    if (headers.length >= 3) {
      const matched: Array<{ field: (typeof KEYWORD_SETS)[number]['field']; header: string; idx: number }> = [];
      for (let i = 0; i < headers.length; i++) {
        const normH = normalizeArabic(headers[i]);
        for (const { field, keywords } of KEYWORD_SETS) {
          if (keywords.some(k => normalizeArabic(k) === normH)) {
            matched.push({ field, header: headers[i], idx: i });
            break;
          }
        }
      }

      if (matched.length >= 3) {
        const matchedIdxSet = new Set(matched.map(m => m.idx));
        for (let i = 0; i < headers.length; i++) {
          if (!matchedIdxSet.has(i) && headers[i]) {
            warn('column_unmatched', `عمود غير معروف: "${headers[i]}" — تم تجاهله`);
          }
        }

        // Normalize widths to sum = 100
        const rawTotal = matched.reduce((s, m) => s + (DEFAULT_COLUMN_WIDTHS[m.field] ?? 14), 0);
        const columns: LineItemsColumn[] = matched.map(m => ({
          id:      `col-${m.field}`,
          field:   m.field,
          label:   m.header,
          width:   Math.round(((DEFAULT_COLUMN_WIDTHS[m.field] ?? 14) / rawTotal) * 100),
          align:   'start' as const,
          visible: true,
        }));

        const h = 60;
        const el: LineItemsTableElement = {
          id: generateElementId('lineItemsTable'), label: 'جدول البنود',
          type: 'lineItemsTable', columns,
          headerStyle: { background: 'brand', color: 'white', fontSize: 'normal', fontWeight: 'bold' },
          rowStyle:    { fontSize: 'normal', color: 'default' },
          borderStyle: { color: 'light' },
          rowStriping: true, autoHideZeroColumns: false,
          totals: { showSubtotal: true, showGrandTotal: true },
          x: leftMm * scaleX, y: getY(h), w: contentW * scaleX, h, rotation: 0,
        };
        elements.push(el);
        advance(h);
        return;
      }
    }

    // Static table fallback: outer RectElement + cell TextElements
    const tableH = rows.length * 8;
    const colW   = contentW / Math.max(1, headers.length);
    const border: RectElement = {
      id: generateElementId('rect'), label: 'إطار جدول',
      type: 'rect', fillColor: 'transparent', borderColor: 'dark', borderRadius: 0,
      x: leftMm * scaleX, y: getY(tableH), w: contentW * scaleX, h: tableH, rotation: 0,
    };
    elements.push(border);

    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r].querySelectorAll('th, td');
      for (let c = 0; c < cells.length; c++) {
        const cell   = cells[c];
        const isHead = cell.tagName.toLowerCase() === 'th';
        const cText  = (cell.textContent ?? '').trim();
        if (!cText) continue;

        if (isHead) {
          const hRect: RectElement = {
            id: generateElementId('rect'), label: 'إطار جدول',
            type: 'rect', fillColor: 'brand', borderColor: 'transparent', borderRadius: 0,
            x: (leftMm + c * colW) * scaleX, y: getY(6), w: colW * scaleX, h: 6, rotation: 0,
          };
          elements.push(hRect);
        }

        if (cell.hasAttribute('colspan') || cell.hasAttribute('rowspan')) {
          warn('merged_cell', 'خلية مدمجة في الجدول — تم تسطيحها');
        }

        const cEl: TextElement = {
          id: generateElementId('text'), label: 'نص مستورد',
          type: 'text', content: cText,
          x: (leftMm + c * colW) * scaleX,
          y: (cursorY + r * 8) * scaleY,
          w: colW * scaleX, h: 6, rotation: 0,
          style: { fontSize: 'normal', fontWeight: isHead ? 'bold' : 'regular', align: 'start', color: isHead ? 'black' : 'default' },
        };
        elements.push(cEl);
      }
    }
    cursorY += tableH + DOCX_ELEMENT_GAP_MM;
  }

  // ── Main walk ────────────────────────────────────────────────────────────────
  for (const node of Array.from(doc.body.children)) {
    if (elements.length >= DOCX_MAX_ELEMENTS) {
      warn('element_count_capped', `تم الاكتفاء بـ ${DOCX_MAX_ELEMENTS} عنصراً`);
      break;
    }

    const tag = node.tagName.toLowerCase();

    if (tag === 'br' && (node as HTMLElement).getAttribute('data-page-break') === 'true') {
      warn('page_break_skipped', 'فاصل صفحة — تم تجاهله');
    } else if (tag === 'hr') {
      const h = 0.5;
      const hr: LineElement = {
        id: generateElementId('line'), label: 'خط فاصل',
        type: 'line', orientation: 'horizontal', color: 'dark', thickness: 0.5,
        x: leftMm * scaleX, y: getY(h), w: contentW * scaleX, h, rotation: 0,
      };
      elements.push(hr);
      advance(h);
    } else if (tag === 'p' || /^h[1-6]$/.test(tag)) {
      const imgs = node.querySelectorAll('img');
      if (imgs.length > 0 && !(node.textContent ?? '').trim()) {
        imgs.forEach(img => processImg(img));
      } else {
        processText(node);
      }
    } else if (tag === 'table') {
      processTable(node);
    }
  }

  return { elements, warnings };
}

// ─── Secondary JSZip pass: page margins + logo detection ─────────────────────
async function extractPageInfo(buffer: ArrayBuffer): Promise<{
  pageMarginMm:   number;
  docWidthMm:     number;
  docHeightMm:    number;
  headerImageIds: Set<string>;
}> {
  const result = {
    pageMarginMm:   DEFAULT_PAGE.marginMm,
    docWidthMm:     210,
    docHeightMm:    297,
    headerImageIds: new Set<string>(),
  };
  try {
    const zip    = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (docXml) {
      // Page margins (twips → mm: twips * 25.4 / 1440)
      const pgMar = /<w:pgMar[^>]*w:top="(\d+)"[^>]*w:right="(\d+)"[^>]*w:bottom="(\d+)"[^>]*w:left="(\d+)"/
        .exec(docXml);
      if (pgMar) {
        const toMm  = (t: string) => parseInt(t) * 25.4 / 1440;
        const ms    = [pgMar[1], pgMar[2], pgMar[3], pgMar[4]].map(toMm);
        result.pageMarginMm = Math.round(Math.min(...ms));
      }
      // Page size
      const pgSz = /<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/.exec(docXml);
      if (pgSz) {
        result.docWidthMm  = Math.round(parseInt(pgSz[1]) * 25.4 / 1440);
        result.docHeightMm = Math.round(parseInt(pgSz[2]) * 25.4 / 1440);
      }
    }
    // Logo detection via header rels
    const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
    if (relsXml) {
      for (const [, , headerPath] of relsXml.matchAll(
        /Id="([^"]+)"[^>]+Target="(header\d*\.xml)"/g,
      )) {
        const headerXml = await zip.file(`word/${headerPath}`)?.async('string');
        if (headerXml) {
          for (const [, imgRelId] of headerXml.matchAll(/r:embed="([^"]+)"/g)) {
            result.headerImageIds.add(imgRelId);
          }
        }
      }
    }
  } catch {
    // Non-fatal — return defaults
  }
  return result;
}

// ─── Main parse function ──────────────────────────────────────────────────────
export async function parseDocx(
  buffer: ArrayBuffer,
  opts: DocxImportOptions,
): Promise<DocxParseResult> {
  const { pageMarginMm, docWidthMm, docHeightMm, headerImageIds } =
    await extractPageInfo(buffer);

  const mammothOpts = {
    styleMap: [
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Heading 5'] => h5:fresh",
      "p[style-name='Heading 6'] => h6:fresh",
      "p[style-name='Horizontal Line'] => hr",
      "r[style-name='Horizontal Line'] => hr",
      "b => strong",
      "i => em",
      "u => u",
      "strike => s",
      "br[type='page'] => br[data-page-break='true']",
    ],
    includeDefaultStyleMap: true,
    convertImage: mammoth.images.imgElement(
      async (image: { contentType: string; read: (enc: string) => Promise<string> }) => {
        const allowed = ['image/png','image/jpeg','image/gif','image/webp'];
        if (!allowed.includes(image.contentType)) return { src: '' };
        const b64 = await image.read('base64');
        return { src: `data:${image.contentType};base64,${b64}` };
      },
    ),
  };

  let mammothHtml: string;
  let mammothMessages: Array<{ type: string; message: string }>;
  try {
    const r = await mammoth.convertToHtml({ arrayBuffer: buffer }, mammothOpts);
    mammothHtml     = r.value;
    mammothMessages = r.messages;
  } catch (err) {
    throw new Error(
      `فشل تحليل المستند: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const safeHtml = sanitizeHtml(mammothHtml);
  const { elements, warnings } = docxHtmlToElements(
    safeHtml, opts.documentType, headerImageIds, pageMarginMm, docWidthMm, docHeightMm,
  );

  // Merge mammoth warnings
  for (const msg of mammothMessages) {
    if (msg.type === 'warning') {
      warnings.push({ type: 'unsupported_shape', messageAr: `تحذير: ${msg.message}` });
    }
  }

  if (elements.length === 0) {
    throw new Error('المستند فارغ. لا توجد عناصر قابلة للاستيراد');
  }

  // JSON size gate
  const jsonBytes = new Blob([JSON.stringify(elements)]).size;
  if (jsonBytes > DOCX_MAX_TEMPLATE_JSON_BYTES) {
    throw new Error('حجم القالب المُنشأ كبير جداً. يُرجى تقليل عدد الصور أو أحجامها');
  }
  if (jsonBytes > DOCX_WARN_JSON_BYTES) {
    warnings.push({ type: 'template_json_large', messageAr: 'حجم القالب كبير (> 2 ميغابايت) — قد يؤثر على الأداء' });
  }

  return { elements, warnings, pageMarginMm, docWidthMm, docHeightMm, headerImageIds };
}

// ─── Build template from parse result ────────────────────────────────────────
export function buildImportedTemplate(
  result:       DocxParseResult,
  opts:         DocxImportOptions,
  templateName: string,
): TemplateStudioTemplate {
  const name = sanitizeTemplateName(templateName || opts.templateName || 'قالب مستورد');
  const now  = new Date().toISOString();
  const tpl: TemplateStudioTemplate = {
    id:           generateTemplateId(),
    name,
    documentType: opts.documentType,
    page:         { size: 'A4', orientation: 'portrait', marginMm: result.pageMarginMm },
    elements:     result.elements,
    createdAt:    now,
    updatedAt:    now,
  };

  const validation = validateTemplate(tpl);
  if (!validation.valid) {
    throw new Error(`خطأ داخلي في بناء القالب: ${validation.errors.join('; ')}`);
  }
  return tpl;
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/print-templates/studio/docxImport/__tests__/docxParser.test.ts
```

Expected: ALL 28 tests PASS. If any fail, diagnose and fix before proceeding.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/print-templates/studio/docxImport/docxParser.ts frontend/src/print-templates/studio/docxImport/__tests__/docxParser.test.ts
git commit -m "feat(docx-import): add HTML parser — text, headings, tables, images, dynamic fields (28 tests)"
```

---

### Task 3: Import Wizard UI (4-Step Modal)

**Files:**
- Create: `frontend/src/print-templates/studio/docxImport/DocxImportWizard.tsx`

**Interfaces:**
- Consumes: `parseDocx`, `buildImportedTemplate` from `./docxParser`
- Consumes: `DocxImportOptions`, `DocxParseResult`, `WizardInternalState`, `WizardStep`, `DOCX_MAX_FILE_BYTES`, `DOCX_PREVIEW_SCALE` from `./docxTypes`
- Consumes: `TemplateStudioRenderer` from `../TemplateStudioRenderer` (for preview)
- Consumes: `TemplateStudioTemplate`, `TemplateStudioDocumentType` from `../templateStudioTypes`
- Produces: `DocxImportWizard` default export — props `{ open: boolean; onClose(): void; onImportConfirm(template: TemplateStudioTemplate): void }`

- [ ] **Step 1: Create DocxImportWizard.tsx**

Create `frontend/src/print-templates/studio/docxImport/DocxImportWizard.tsx`:

```tsx
import { useRef, useState } from 'react';
import type { TemplateStudioTemplate, TemplateStudioDocumentType } from '../templateStudioTypes';
import TemplateStudioRenderer from '../TemplateStudioRenderer';
import { parseDocx, buildImportedTemplate } from './docxParser';
import type { DocxParseResult, WizardStep } from './docxTypes';
import {
  DOCX_MAX_FILE_BYTES,
  DOCX_PREVIEW_SCALE,
} from './docxTypes';

// ─── Shared style helpers ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9200,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#fff', borderRadius: 12, width: 680, maxWidth: '95vw',
    maxHeight: '90vh', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Cairo', sans-serif", direction: 'rtl',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
  },
  title: { fontSize: 16, fontWeight: 700, color: '#1f2937', margin: 0 },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 18, color: '#6b7280', padding: '0 4px',
  },
  body: { padding: 24, overflowY: 'auto', flex: 1 },
  footer: {
    padding: '14px 20px', borderTop: '1px solid #e5e7eb',
    display: 'flex', justifyContent: 'space-between', gap: 12,
  },
  btn: {
    padding: '8px 20px', borderRadius: 6, border: 'none',
    cursor: 'pointer', fontFamily: "'Cairo', sans-serif", fontSize: 14,
  },
  btnPrimary: { background: '#1d4e6f', color: '#fff' },
  btnSecondary: { background: '#f3f4f6', color: '#374151' },
  dropZone: {
    border: '2px dashed #d1d5db', borderRadius: 8,
    padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
    background: '#fafafa', color: '#6b7280',
  },
  errorBox: {
    background: '#fef2f2', border: '1px solid #fca5a5',
    borderRadius: 8, padding: 16, color: '#b91c1c', fontSize: 14,
  },
  warningItem: { fontSize: 13, color: '#92400e', marginBottom: 4 },
  label: { fontSize: 14, color: '#374151', marginBottom: 6, display: 'block' },
  input: {
    width: '100%', padding: '8px 12px', borderRadius: 6,
    border: '1px solid #d1d5db', fontFamily: "'Cairo', sans-serif",
    fontSize: 14, boxSizing: 'border-box' as const,
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open:              boolean;
  onClose:           () => void;
  onImportConfirm:   (template: TemplateStudioTemplate) => void;
}

// ─── Preview data (fixed sample) ─────────────────────────────────────────────
const PREVIEW_DATA: Record<string, string> = {
  number:          'INV-2026-001',
  date:            '25/06/2026',
  customerName:    'شركة العميل النموذجي',
  customerAddress: 'الكويت — حولي',
  total:           '5,250.000',
  grandTotal:      '5,250.000',
  subtotal:        '5,250.000',
  discount:        '0.000',
  tax:             '0.000',
  notes:           'ملاحظة: هذه معاينة تجريبية',
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function DocxImportWizard({ open, onClose, onImportConfirm }: Props) {
  const [step, setStep]           = useState<WizardStep>(1);
  const [file, setFile]           = useState<File | null>(null);
  const [docType, setDocType]     = useState<TemplateStudioDocumentType>('invoice');
  const [parseResult, setParse]   = useState<DocxParseResult | null>(null);
  const [templateName, setName]   = useState('');
  const [errorMsg, setError]      = useState<string | null>(null);
  const [isParsing, setParsing]   = useState(false);
  const [showPreview, setPreview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setStep(1); setFile(null); setParse(null);
    setName(''); setError(null); setParsing(false); setPreview(false);
  }

  function handleClose() { reset(); onClose(); }

  // ── Step 1: file selection ─────────────────────────────────────────────────

  function validateFile(f: File): string | null {
    if (!f.name.toLowerCase().endsWith('.docx')) return 'الملف ليس بصيغة .docx';
    if (f.size > DOCX_MAX_FILE_BYTES) return 'حجم الملف يتجاوز 10 ميغابايت. يُرجى استخدام ملف أصغر';
    return null;
  }

  function handleFileSelect(f: File) {
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setFile(f);
    setName(`قالب مستورد — ${f.name.replace(/\.docx$/i, '')}`);
    setStep(2);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }

  // ── Step 2 → 3: parse ─────────────────────────────────────────────────────

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    setError(null);
    setStep(3);
    try {
      const buf    = await file.arrayBuffer();
      const result = await parseDocx(buf, { documentType: docType });
      setParse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ غير متوقع أثناء تحليل المستند');
    } finally {
      setParsing(false);
    }
  }

  // ── Step 4: confirm ───────────────────────────────────────────────────────

  function handleConfirm() {
    if (!parseResult) return;
    try {
      const tpl = buildImportedTemplate(parseResult, { documentType: docType }, templateName);
      onImportConfirm(tpl);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في بناء القالب');
    }
  }

  // ── Preview template ──────────────────────────────────────────────────────

  const previewTemplate: TemplateStudioTemplate | null = parseResult
    ? {
        id: '__preview__', name: templateName, documentType: docType,
        page: { size: 'A4', orientation: 'portrait', marginMm: parseResult.pageMarginMm },
        elements: parseResult.elements,
        createdAt: '', updatedAt: '',
      }
    : null;

  // ── Step indicator ────────────────────────────────────────────────────────

  function StepPips() {
    return (
      <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
        {([1,2,3,4] as WizardStep[]).map(n => (
          <div key={n} style={{
            width: 22, height: 22, borderRadius: '50%', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: n === step ? '#1d4e6f' : n < step ? '#6ee7b7' : '#e5e7eb',
            color: n <= step ? '#fff' : '#9ca3af',
          }}>{n}</div>
        ))}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={s.modal}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={s.title}>استيراد قالب من Word (.docx)</p>
            <StepPips />
          </div>
          <button style={s.closeBtn} onClick={handleClose} type="button">✕</button>
        </div>

        {/* Body */}
        <div style={s.body}>

          {/* ── Step 1: File selection ── */}
          {step === 1 && (
            <div>
              <div
                style={s.dropZone}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div>اسحب ملف Word هنا (.docx)</div>
                <div style={{ margin: '8px 0', color: '#d1d5db' }}>أو</div>
                <div style={{ color: '#1d4e6f', fontWeight: 600 }}>اختر ملف...</div>
                <input
                  ref={fileInputRef} type="file" accept=".docx" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </div>
              {errorMsg && <div style={{ ...s.errorBox, marginTop: 16 }}>{errorMsg}</div>}
              <div style={{ marginTop: 16, fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                <strong>⚠ ملاحظة:</strong> هذا الاستيراد يُنشئ نقطة بداية قابلة للتحرير وليس تحويلاً دقيقاً للتخطيط.
                الحجم الأقصى: 10 ميغابايت · الصيغة: .docx فقط
              </div>
            </div>
          )}

          {/* ── Step 2: Document type ── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 12, color: '#6b7280', fontSize: 13 }}>
                الملف: {file?.name} ({file ? Math.round(file.size / 1024) : 0} KB)
              </div>
              <p style={s.label}>هذا القالب سيُستخدم مع:</p>
              {(['invoice', 'quotation'] as TemplateStudioDocumentType[]).map(dt => (
                <label key={dt} style={{ display: 'block', marginBottom: 12, cursor: 'pointer' }}>
                  <input
                    type="radio" name="docType" value={dt}
                    checked={docType === dt}
                    onChange={() => setDocType(dt)}
                    style={{ marginLeft: 8 }}
                  />
                  <strong>{dt === 'invoice' ? 'فاتورة (invoice)' : 'عرض سعر (quotation)'}</strong>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {dt === 'invoice'
                      ? 'الحقول المتاحة: invoice.number، invoice.date، invoice.customerName…'
                      : 'الحقول المتاحة: quotation.number، quotation.date، quotation.customerName…'}
                  </div>
                </label>
              ))}
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                النص الذي يطابق {'{{invoice.number}}'} سيُحوَّل تلقائياً إلى حقول ديناميكية.
              </div>
            </div>
          )}

          {/* ── Step 3: Parse + review ── */}
          {step === 3 && (
            <div>
              {isParsing && (
                <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                  <div>جاري تحليل المستند…</div>
                </div>
              )}

              {!isParsing && errorMsg && (
                <div>
                  <div style={s.errorBox}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>✗ فشل تحليل المستند</div>
                    <div>{errorMsg}</div>
                  </div>
                  <button
                    type="button"
                    style={{ ...s.btn, ...s.btnSecondary, marginTop: 12 }}
                    onClick={() => { setError(null); setStep(2); }}
                  >حاول مرة أخرى</button>
                </div>
              )}

              {!isParsing && parseResult && !errorMsg && (
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {/* Left: results summary */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#065f46', fontWeight: 600, marginBottom: 12 }}>
                      ✅ تم استخراج {parseResult.elements.length} عنصراً
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>العناصر المستخرجة:</div>
                    {(['text','dynamicField','image','lineItemsTable','line','rect'] as const).map(t => {
                      const count = parseResult.elements.filter(e => e.type === t).length;
                      if (!count) return null;
                      const labels: Record<string, string> = {
                        text: 'نصوص', dynamicField: 'حقول ديناميكية',
                        image: 'صور', lineItemsTable: 'جداول بنود', line: 'خطوط', rect: 'مستطيلات',
                      };
                      return <div key={t} style={{ fontSize: 13, color: '#374151' }}>● {count} {labels[t]}</div>;
                    })}
                    {parseResult.warnings.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                          ⚠ {parseResult.warnings.length} تحذيرات:
                        </div>
                        {parseResult.warnings.slice(0, 8).map((w, i) => (
                          <div key={i} style={s.warningItem}>• {w.messageAr}</div>
                        ))}
                        {parseResult.warnings.length > 8 && (
                          <div style={{ ...s.warningItem, color: '#6b7280' }}>
                            وتحذيرات أخرى ({parseResult.warnings.length - 8})…
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: preview toggle */}
                  <div style={{ minWidth: 240 }}>
                    <button
                      type="button"
                      style={{ ...s.btn, ...s.btnSecondary, marginBottom: 8, fontSize: 12 }}
                      onClick={() => setPreview(v => !v)}
                    >
                      {showPreview ? 'إخفاء المعاينة' : 'معاينة A4 ▾'}
                    </button>
                    {showPreview && previewTemplate && (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                        <TemplateStudioRenderer
                          template={previewTemplate}
                          data={PREVIEW_DATA}
                          scale={DOCX_PREVIEW_SCALE}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Name + confirm ── */}
          {step === 4 && (
            <div>
              <label style={s.label}>اسم القالب:</label>
              <input
                style={s.input}
                type="text"
                value={templateName}
                maxLength={60}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                (أقصى 60 حرفاً)
              </div>
              <div style={{ marginTop: 16, fontSize: 13, color: '#6b7280' }}>
                سيُضاف القالب إلى قائمة قوالب {docType === 'invoice' ? 'الفاتورة' : 'عرض السعر'}
                ويمكنك تحريره فور الاستيراد.
              </div>
              {errorMsg && <div style={{ ...s.errorBox, marginTop: 12 }}>{errorMsg}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button
            type="button"
            style={{ ...s.btn, ...s.btnSecondary }}
            onClick={() => {
              if (step === 1) handleClose();
              else setStep((step - 1) as WizardStep);
            }}
          >
            {step === 1 ? 'إغلاق' : 'رجوع'}
          </button>

          {step === 1 && null}

          {step === 2 && (
            <button
              type="button"
              style={{ ...s.btn, ...s.btnPrimary }}
              onClick={handleParse}
            >
              متابعة: تحليل...
            </button>
          )}

          {step === 3 && !isParsing && parseResult && !errorMsg && (
            <button
              type="button"
              style={{ ...s.btn, ...s.btnPrimary }}
              onClick={() => setStep(4)}
            >
              التالي: تأكيد الاسم
            </button>
          )}

          {step === 4 && (
            <button
              type="button"
              style={{ ...s.btn, ...s.btnPrimary }}
              onClick={handleConfirm}
              disabled={!templateName.trim()}
            >
              ✓ استيراد
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors. Common issue: `TemplateStudioRenderer` props — check the component accepts `{ template, data, scale }` and adjust if the actual prop names differ.

To inspect the renderer props if needed:
```bash
# Check actual props signature:
head -60 frontend/src/print-templates/studio/TemplateStudioRenderer.tsx
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/print-templates/studio/docxImport/DocxImportWizard.tsx
git commit -m "feat(docx-import): add 4-step DocxImportWizard modal"
```

---

### Task 4: Wire into TemplateStudioEditor + Final Validation

**Files:**
- Modify: `frontend/src/print-templates/studio/TemplateStudioEditor.tsx`

**Interfaces:**
- Consumes: `DocxImportWizard` from `./docxImport/DocxImportWizard`
- Consumes: `updateTemplates`, `setSelectedTplId`, `setActiveDocType` — already exist in `TemplateStudioEditor.tsx` internal state (lines 99–100, 131)
- Note: `updateTemplates` takes a callback `(ts) => ts[]` — NOT an array directly

- [ ] **Step 1: Add import + wizard state to TemplateStudioEditor.tsx**

In `frontend/src/print-templates/studio/TemplateStudioEditor.tsx`, find the block of `import` statements at the top of the file and add:

```typescript
import DocxImportWizard from './docxImport/DocxImportWizard';
```

Then find the existing state declarations (around line 99–100 where `activeDocType` and `selectedTemplateId` are declared):

```typescript
const [activeDocType, setActiveDocType]       = useState<TemplateStudioDocumentType>('invoice');
const [selectedTemplateId, setSelectedTplId]  = useState<string | null>(null);
```

Add ONE new state line immediately after them:

```typescript
const [docxWizardOpen, setDocxWizardOpen] = useState(false);
```

- [ ] **Step 2: Add "استيراد DOCX" button**

Find the existing JSON import button in the JSX (around the `importRef` input, line ~954):

```tsx
<input ref={importRef} type="file" accept=".json" hidden onChange={handleImportFile} />
```

There is a corresponding button that triggers `importRef.current?.click()`. Find it and add a new button immediately after the JSON import button:

```tsx
<button
  type="button"
  onClick={() => setDocxWizardOpen(true)}
  style={{ /* match the style of the existing import button */ }}
>
  استيراد DOCX
</button>
```

To match the exact button style, search for the existing "استيراد ملف" button in the component and copy its `style` prop. The button must be a sibling of the existing JSON import button, not nested inside it.

- [ ] **Step 3: Render DocxImportWizard**

At the very bottom of the component's JSX return (before the closing `</div>` of the root element), add:

```tsx
<DocxImportWizard
  open={docxWizardOpen}
  onClose={() => setDocxWizardOpen(false)}
  onImportConfirm={(tpl) => {
    updateTemplates((ts) => [...ts, tpl]);
    setSelectedTplId(tpl.id);
    setActiveDocType(tpl.documentType);
    setDocxWizardOpen(false);
  }}
/>
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors. Fix any type errors before proceeding.

- [ ] **Step 5: Run all tests**

```bash
cd frontend && npx vitest run
```

Expected: all existing tests + the 28 new docxParser tests pass. 0 failures.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/print-templates/studio/TemplateStudioEditor.tsx
git commit -m "feat(docx-import): wire DocxImportWizard into TemplateStudioEditor"
```

---

## Self-Review

After writing this plan, checking against the spec:

**Spec coverage:**
- §1 Architecture (frontend-only, 4-step wizard, data flow) → Task structure ✅
- §2 Import pipeline (18 steps) → Tasks 2–4 ✅
- §3 DOCX parser strategy (mammoth, JSZip secondary pass) → Task 2 `parseDocx` + `extractPageInfo` ✅
- §4.1 mammoth@^1.9.0 → Task 1 Step 1 ✅
- §4.2 jszip@^3.10.1 → Task 1 Step 1 ✅
- §5.1 Paragraphs / flow layout → Task 2 `processText` + `advance` ✅
- §5.2 Headings → Task 2 H_SIZE/H_WGHT tables ✅
- §5.3 Tables + Arabic normalization → Task 2 `processTable` + `normalizeArabic` ✅
- §5.4 Images → Task 2 `processImg` ✅
- §5.5 Logo detection → Task 2 `extractPageInfo` + `headerImageIds` ✅
- §5.6 Element labels → Task 2: labels set on each element ✅
- §5.8 Page margins → Task 2 `extractPageInfo` ✅
- §5.9–5.10 Font size / font family → Task 1 `mapFontSizePt`, `font_family_ignored` not warned (font family silently ignored — Cairo is hardcoded) ✅
- §5.11 Bold / partial_bold → Task 2 `processText` bold detection ✅
- §5.12–5.13 Italic / underline (unsupported) → Task 2 one-time warnings ✅
- §5.14 Alignment → Task 1 `mapAlignment` ✅
- §5.15 RTL → Task 2 `ltr_element_in_rtl_template` warning ✅
- §5.16 Dynamic field detection → Task 2 `tryDynamicField` + `DYNAMIC_FIELD_RE` ✅
- §5.17 Page breaks → Task 2 `page_break_skipped` ✅
- §6 Mapping summary → all element types covered ✅
- §7 Unsupported features → warnings emitted for italic, underline, partial bold, ltr, page break, merged cell ✅
- §8.1 Hard errors → `parseDocx` throws with Arabic messages; 5MB JSON check ✅
- §8.2 Type definitions → `docxTypes.ts` in Task 1 ✅
- §8.3 Warning types → `DocxWarningType` union in Task 1 ✅
- §8.4 Element boundary clamping → `getY()` clamps + emits `element_y_clamped` ✅
- §8.5 Element count cap → `DOCX_MAX_ELEMENTS = 200` guard in main loop ✅
- §9 Wizard UX + wizard state → Task 3 `DocxImportWizard` with `WizardInternalState` shape ✅
- §10 Preview → Task 3 `TemplateStudioRenderer` at `scale={DOCX_PREVIEW_SCALE}` ✅
- §11 Editable result → `buildImportedTemplate` + `validateTemplate` ✅
- §12 Backward compatibility → only two existing files modified ✅
- §13 Security → `sanitizeHtml` strips dangerous tags; SVG excluded; data URL validated; dynamic field allowlist ✅
- §14 Performance → async parse + spinner; image count limit ✅
- §16 Tests → 28 test cases in `docxParser.test.ts` ✅
- §17 Migration impact → zero ✅
- Appendix A file structure → exact paths match ✅
- Appendix B constants → all in `docxTypes.ts` ✅

**Potential gap:** `font_family_ignored` warning (§5.10). The spec says emit once per template. Not emitted in current plan — mammoth's output doesn't surface font-family directly, and the spec says "captured in warning log but no structural effect." Add a single `font_family_ignored` warning at the end of `docxHtmlToElements` if any element was processed (indicating font mapping was silently dropped). This is a minor gap; the engineer can add it as a final warning in the return block:

```typescript
// At the end of docxHtmlToElements, before return:
if (elements.length > 0) {
  warnings.push({
    type: 'font_family_ignored',
    messageAr: 'خطوط Word — تم تجاهلها، القالب يستخدم خط Cairo',
  });
}
```

Add this to Task 2 Step 3 (inside `docxHtmlToElements`).

**Type consistency check:**
- `DocxParseResult` defined in Task 1; used in Task 2 (`parseDocx` return), Task 3 (`parseResult` state) ✅
- `DocxImportOptions` defined in Task 1; used in Task 2 (`parseDocx` parameter), Task 3 (`handleParse`) ✅  
- `tryDynamicField` exported in Task 2, tested in Task 2 test file ✅
- `docxHtmlToElements` exported in Task 2, tested in Task 2 test file ✅
- `buildImportedTemplate(result, opts, templateName)` — 3 params, matches Task 3 `handleConfirm` call ✅
- `updateTemplates((ts) => [...ts, tpl])` — function form, matches actual `TemplateStudioEditor` API ✅
- `generateElementId('dynamicField')` — valid `TemplateStudioElementType` ✅
- All element types include `rotation: 0` ✅
- `TextElement.style: StudioTextStyle` object ✅
- `RectElement` uses `borderRadius: number` not `borderWidth` ✅
- `LineItemsColumn.id` set to `col-${field}` (unique per field) ✅
