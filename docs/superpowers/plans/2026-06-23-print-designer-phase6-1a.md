# Print Designer Phase 6.1A — Dynamic Line Items Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `lineItemsTable` element type to Template Studio that renders invoice/quotation line items dynamically from live document data.

**Architecture:** New types go in `templateStudioTypes.ts`; data resolvers and column factories go in a new `lineItemsResolver.ts`; validation in `templateStudioUtils.ts`; rendering in `TemplateStudioRenderer.tsx`; editing in `TemplateStudioEditor.tsx`; callers (`InvoicePreview.tsx`, `Quotation.tsx`) pass `lineItems` prop to the renderer.

**Tech Stack:** React 18, TypeScript 5.5, Vitest 2.x — no new npm packages.

## Global Constraints

- No new npm packages.
- No Prisma schema changes.
- No new backend routes.
- No Electron IPC changes.
- No modifications to accounting, dashboard, HR forms, cheques, PO/RFQ.
- All column field values must come from allowlists only — no arbitrary field paths.
- No `dangerouslySetInnerHTML` anywhere.
- All style values must go through token maps — no arbitrary CSS strings.
- RTL layout is the default; text-align must respect the `align` token.
- Existing React templates remain the default; Studio is opt-in.

---

### Task 1: Add `lineItemsTable` types to `templateStudioTypes.ts`

**Files:**
- Modify: `frontend/src/print-templates/studio/templateStudioTypes.ts`

**Interfaces:**
- Produces: `INVOICE_LINE_ITEM_FIELDS`, `QUOTATION_LINE_ITEM_FIELDS`, `AllowedLineItemField`, `LineItemsColumn`, `TableHeaderStyle`, `TableRowStyle`, `TableBorderStyle`, `LineItemsTableElement`, `NormalizedLineRow` — consumed by Tasks 2–7.
- Produces: updated `TemplateStudioElement` union and `ALLOWED_ELEMENT_TYPES` set.

- [ ] **Step 1: Add line-item field allowlists and column type**

Append after the existing `QuotationAllowedField` type (line ~146):

```typescript
// ─── Line-items table allowlists ─────────────────────────────────────────────
export const INVOICE_LINE_ITEM_FIELDS = [
  'index', 'description', 'quantity', 'unit', 'unitPrice', 'discount', 'total',
] as const;

export const QUOTATION_LINE_ITEM_FIELDS = [
  'index', 'description', 'quantity', 'unit', 'unitPrice', 'total',
] as const;

export type AllowedLineItemField =
  | (typeof INVOICE_LINE_ITEM_FIELDS)[number]
  | (typeof QUOTATION_LINE_ITEM_FIELDS)[number];

export interface LineItemsColumn {
  id:      string;
  field:   AllowedLineItemField;
  label:   string;
  width:   number;   // percentage; visible columns should sum to ~100
  align:   'start' | 'center' | 'end';
  visible: boolean;
}

// ─── Table sub-styles (token-only) ───────────────────────────────────────────
export interface TableHeaderStyle {
  background: StudioColorToken;
  color:      StudioTextColor;
  fontSize:   StudioFontSize;
  fontWeight: StudioFontWeight;
}

export interface TableRowStyle {
  fontSize: StudioFontSize;
  color:    StudioTextColor;
}

export interface TableBorderStyle {
  color: StudioColorToken;
}

// ─── Line items table element ─────────────────────────────────────────────────
export interface LineItemsTableElement extends BaseElement {
  type:        'lineItemsTable';
  columns:     LineItemsColumn[];
  headerStyle: TableHeaderStyle;
  rowStyle:    TableRowStyle;
  borderStyle: TableBorderStyle;
  totals?: {
    showSubtotal?:  boolean;
    showDiscount?:  boolean;
    showTax?:       boolean;
    showGrandTotal?: boolean;
  };
}

// ─── Normalized row (resolver output) ────────────────────────────────────────
export interface NormalizedLineRow {
  index:       number;
  description: string;
  quantity:    string;
  unit:        string;
  unitPrice:   string;
  discount?:   string;
  total:       string;
}
```

- [ ] **Step 2: Add `LineItemsTableElement` to the union and to `ALLOWED_ELEMENT_TYPES`**

Replace the union block (lines ~80–95):

```typescript
export type TemplateStudioElement =
  | TextElement
  | DynamicFieldElement
  | QrElement
  | BarcodeElement
  | ImageElement
  | LineElement
  | RectElement
  | CircleElement
  | LineItemsTableElement;

export type TemplateStudioElementType = TemplateStudioElement['type'];

export const ALLOWED_ELEMENT_TYPES: ReadonlySet<TemplateStudioElementType> = new Set([
  'text', 'dynamicField', 'qr', 'barcode', 'image', 'line', 'rect', 'circle', 'lineItemsTable',
]);
```

- [ ] **Step 3: TypeScript-check types file**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors related to `templateStudioTypes.ts`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/print-templates/studio/templateStudioTypes.ts
git commit -m "feat(studio): add LineItemsTableElement types and NormalizedLineRow"
```

---

### Task 2: Create `lineItemsResolver.ts`

**Files:**
- Create: `frontend/src/print-templates/studio/lineItemsResolver.ts`
- Test: `frontend/src/__tests__/printTemplates/templateStudio.test.ts` (tests added in Task 7)

**Interfaces:**
- Consumes: `LineItemsColumn`, `AllowedLineItemField`, `NormalizedLineRow`, `INVOICE_LINE_ITEM_FIELDS`, `QUOTATION_LINE_ITEM_FIELDS`, `TemplateStudioDocumentType` from `templateStudioTypes.ts`
- Produces: `resolveInvoiceLineItems(items: unknown): NormalizedLineRow[]`, `resolveQuotationLineItems(items: unknown): NormalizedLineRow[]`, `getDefaultInvoiceColumns(): LineItemsColumn[]`, `getDefaultQuotationColumns(): LineItemsColumn[]`, `normalizeColumnWidths(columns: LineItemsColumn[]): LineItemsColumn[]`, `getDefaultLineItemsColumns(docType: TemplateStudioDocumentType): LineItemsColumn[]`

- [ ] **Step 1: Write the file**

```typescript
// frontend/src/print-templates/studio/lineItemsResolver.ts
import type {
  LineItemsColumn,
  NormalizedLineRow,
  TemplateStudioDocumentType,
} from './templateStudioTypes';

// ─── KWD formatter ───────────────────────────────────────────────────────────
function fmtNum(n: unknown): string {
  const num = typeof n === 'number' ? n : parseFloat(String(n ?? ''));
  if (!isFinite(num)) return '0.000';
  return num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtStr(s: unknown): string {
  return typeof s === 'string' ? s : String(s ?? '');
}

function safeInt(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : parseInt(String(n ?? ''), 10);
  return isFinite(v) ? v : fallback;
}

// ─── Invoice resolver ─────────────────────────────────────────────────────────
// Accepts the raw `items` array from the InvoicePreview FullInvoice type.
// Each item: { id, description, quantity, unit, unitPrice, total }
export function resolveInvoiceLineItems(items: unknown): NormalizedLineRow[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, idx) => {
    const obj = (typeof item === 'object' && item !== null) ? item as Record<string, unknown> : {};
    return {
      index:       safeInt(obj.number ?? obj.id, idx + 1),
      description: fmtStr(obj.description ?? obj.descriptionAr ?? ''),
      quantity:    fmtStr(
        typeof obj.quantity === 'number'
          ? obj.quantity.toString()
          : (obj.quantity ?? obj.qty ?? ''),
      ),
      unit:        fmtStr(obj.unit ?? ''),
      unitPrice:   fmtNum(obj.unitPrice),
      discount:    undefined,   // invoice-level discount, not per-row
      total:       fmtNum(obj.total),
    };
  });
}

// ─── Quotation resolver ───────────────────────────────────────────────────────
// Accepts the raw `items` array from the Quotation page (QuotationItem[]).
// Each item: { id, description, qty, unit, unitPrice }
export function resolveQuotationLineItems(items: unknown): NormalizedLineRow[] {
  if (!Array.isArray(items)) return [];
  return items.map((item, idx) => {
    const obj = (typeof item === 'object' && item !== null) ? item as Record<string, unknown> : {};
    const qty      = parseFloat(String(obj.qty ?? obj.quantity ?? 0)) || 0;
    const price    = parseFloat(String(obj.unitPrice ?? 0)) || 0;
    const total    = qty * price;
    return {
      index:       idx + 1,
      description: fmtStr(obj.description ?? ''),
      quantity:    fmtStr(qty === 0 ? '' : qty.toString()),
      unit:        fmtStr(obj.unit ?? ''),
      unitPrice:   fmtNum(price),
      total:       fmtNum(total),
    };
  });
}

// ─── Width normalization ──────────────────────────────────────────────────────
// Visible column widths are normalized so they sum to 100.
// Hidden columns keep their stored width but are excluded from normalization.
export function normalizeColumnWidths(columns: LineItemsColumn[]): LineItemsColumn[] {
  const visible = columns.filter((c) => c.visible);
  const totalW  = visible.reduce((s, c) => s + c.width, 0);
  if (totalW === 0 || visible.length === 0) return columns;
  return columns.map((c) =>
    c.visible
      ? { ...c, width: Math.round((c.width / totalW) * 100 * 10) / 10 }
      : c,
  );
}

// ─── Default column factories ─────────────────────────────────────────────────
export function getDefaultInvoiceColumns(): LineItemsColumn[] {
  return [
    { id: 'col-idx',   field: 'index',       label: '#',         width: 6,  align: 'center', visible: true },
    { id: 'col-desc',  field: 'description', label: 'البيان',    width: 40, align: 'start',  visible: true },
    { id: 'col-qty',   field: 'quantity',    label: 'الكمية',    width: 10, align: 'center', visible: true },
    { id: 'col-unit',  field: 'unit',        label: 'الوحدة',    width: 10, align: 'center', visible: true },
    { id: 'col-price', field: 'unitPrice',   label: 'سعر الوحدة', width: 17, align: 'end',   visible: true },
    { id: 'col-disc',  field: 'discount',    label: 'الخصم',     width: 0,  align: 'end',    visible: false },
    { id: 'col-total', field: 'total',       label: 'الإجمالي',  width: 17, align: 'end',    visible: true },
  ];
}

export function getDefaultQuotationColumns(): LineItemsColumn[] {
  return [
    { id: 'col-idx',   field: 'index',       label: '#',         width: 6,  align: 'center', visible: true },
    { id: 'col-desc',  field: 'description', label: 'البيان',    width: 44, align: 'start',  visible: true },
    { id: 'col-qty',   field: 'quantity',    label: 'الكمية',    width: 10, align: 'center', visible: true },
    { id: 'col-unit',  field: 'unit',        label: 'الوحدة',    width: 10, align: 'center', visible: true },
    { id: 'col-price', field: 'unitPrice',   label: 'سعر الوحدة', width: 15, align: 'end',   visible: true },
    { id: 'col-total', field: 'total',       label: 'الإجمالي',  width: 15, align: 'end',    visible: true },
  ];
}

export function getDefaultLineItemsColumns(docType: TemplateStudioDocumentType): LineItemsColumn[] {
  return docType === 'invoice'
    ? getDefaultInvoiceColumns()
    : getDefaultQuotationColumns();
}
```

- [ ] **Step 2: TypeScript-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/print-templates/studio/lineItemsResolver.ts
git commit -m "feat(studio): add lineItemsResolver with invoice/quotation row resolvers"
```

---

### Task 3: Add `lineItemsTable` validation to `templateStudioUtils.ts`

**Files:**
- Modify: `frontend/src/print-templates/studio/templateStudioUtils.ts`

**Interfaces:**
- Consumes: `INVOICE_LINE_ITEM_FIELDS`, `QUOTATION_LINE_ITEM_FIELDS`, `LineItemsTableElement` from `templateStudioTypes.ts`
- Produces: updated `validateElement` that returns errors for invalid `lineItemsTable` elements; updated `ALLOWED_ELEMENT_TYPES` check (already covered by types).

- [ ] **Step 1: Update imports in `templateStudioUtils.ts`**

Add to the import list from `./templateStudioTypes`:
```typescript
  INVOICE_LINE_ITEM_FIELDS,
  QUOTATION_LINE_ITEM_FIELDS,
  LineItemsTableElement,
```

- [ ] **Step 2: Add `lineItemsTable` branch in `validateElement`**

After the existing `element.type === 'image'` block (around line 131), add:

```typescript
  if (element.type === 'lineItemsTable') {
    const el = element as LineItemsTableElement;
    const allowedFields: readonly string[] =
      docType === 'invoice'
        ? INVOICE_LINE_ITEM_FIELDS
        : QUOTATION_LINE_ITEM_FIELDS;

    if (!Array.isArray(el.columns) || el.columns.length === 0) {
      errors.push('جدول البنود يجب أن يحتوي على عمود واحد على الأقل');
    } else {
      const seenIds = new Set<string>();
      for (const col of el.columns) {
        // duplicate IDs
        if (seenIds.has(col.id)) {
          errors.push(`معرف عمود مكرر: ${col.id}`);
        }
        seenIds.add(col.id);

        // unknown field
        if (!allowedFields.includes(col.field)) {
          errors.push(`حقل جدول غير مسموح: ${String(col.field)}`);
        }

        // unsafe label (must not contain < or >)
        if (
          typeof col.label !== 'string' ||
          col.label.includes('<') ||
          col.label.includes('>')
        ) {
          errors.push(`تسمية عمود غير آمنة`);
        }

        // invalid align
        if (!['start', 'center', 'end'].includes(col.align)) {
          errors.push(`محاذاة عمود غير صالحة: ${col.align}`);
        }

        // invalid width
        if (typeof col.width !== 'number' || col.width < 0) {
          errors.push(`عرض عمود غير صالح`);
        }
      }
    }

    // validate totals flags
    if (el.totals) {
      for (const key of ['showSubtotal', 'showDiscount', 'showTax', 'showGrandTotal'] as const) {
        const v = el.totals[key];
        if (v !== undefined && typeof v !== 'boolean') {
          errors.push(`قيمة إجمالي غير صالحة: ${key}`);
        }
      }
    }
  }
```

- [ ] **Step 3: TypeScript-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/print-templates/studio/templateStudioUtils.ts
git commit -m "feat(studio): validate lineItemsTable elements in validateElement"
```

---

### Task 4: Update `TemplateStudioRenderer.tsx`

**Files:**
- Modify: `frontend/src/print-templates/studio/TemplateStudioRenderer.tsx`

**Interfaces:**
- Consumes: `LineItemsTableElement`, `NormalizedLineRow`, `LineItemsColumn` from types; token maps already in file.
- Produces: updated `TemplateStudioRendererProps` with optional `lineItems?: NormalizedLineRow[]`; `renderLineItemsTableEl(el, lineItems)` function.

- [ ] **Step 1: Add imports**

At the top, add to the type import:
```typescript
import type {
  // ... existing imports ...
  LineItemsTableElement,
  NormalizedLineRow,
  LineItemsColumn,
  TableHeaderStyle,
  TableRowStyle,
  TableBorderStyle,
} from './templateStudioTypes';
```

- [ ] **Step 2: Add `renderLineItemsTableEl` function**

Add after `renderCircleEl` and before `ElementShell`:

```typescript
// ─── Line items table renderer ────────────────────────────────────────────────
function getCellValue(row: NormalizedLineRow, field: LineItemsColumn['field']): string {
  switch (field) {
    case 'index':       return String(row.index);
    case 'description': return row.description;
    case 'quantity':    return row.quantity;
    case 'unit':        return row.unit;
    case 'unitPrice':   return row.unitPrice;
    case 'discount':    return row.discount ?? '';
    case 'total':       return row.total;
  }
}

function headerBgColor(style: TableHeaderStyle): string {
  return COLOR_TOKEN_MAP[style.background] ?? COLOR_TOKEN_MAP.brand;
}

function headerTextColor(style: TableHeaderStyle): string {
  return TEXT_COLOR_MAP[style.color] ?? '#ffffff';
}

function rowTextColor(style: TableRowStyle): string {
  return TEXT_COLOR_MAP[style.color] ?? TEXT_COLOR_MAP.default;
}

function borderColor(style: TableBorderStyle): string {
  return COLOR_TOKEN_MAP[style.color] ?? COLOR_TOKEN_MAP.gray;
}

function renderLineItemsTableEl(
  el:        LineItemsTableElement,
  lineItems: NormalizedLineRow[],
): React.ReactNode {
  const visibleCols = el.columns.filter((c) => c.visible);
  const border      = `1px solid ${borderColor(el.borderStyle)}`;
  const hdrBg       = headerBgColor(el.headerStyle);
  const hdrColor    = headerTextColor(el.headerStyle);
  const hdrSize     = FONT_SIZE_MAP[el.headerStyle.fontSize]   ?? '11pt';
  const hdrWeight   = FONT_WEIGHT_MAP[el.headerStyle.fontWeight] ?? '700';
  const rowColor    = rowTextColor(el.rowStyle);
  const rowSize     = FONT_SIZE_MAP[el.rowStyle.fontSize] ?? '11pt';

  function cellAlign(align: LineItemsColumn['align']): 'right' | 'center' | 'left' {
    if (align === 'center') return 'center';
    if (align === 'end')    return 'left';   // LTR end = left in RTL layout
    return 'right';                           // start = right in RTL
  }

  const totalsData: { label: string; value: string }[] = [];
  if (el.totals?.showSubtotal) {
    const sub = lineItems.reduce((s, r) => s + parseFloat(r.total.replace(/,/g, '')) || 0, 0);
    totalsData.push({ label: 'المجموع الفرعي', value: sub.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) });
  }
  if (el.totals?.showDiscount) {
    totalsData.push({ label: 'الخصم', value: '' });
  }
  if (el.totals?.showTax) {
    totalsData.push({ label: 'الضريبة', value: '' });
  }
  if (el.totals?.showGrandTotal) {
    const grand = lineItems.reduce((s, r) => s + parseFloat(r.total.replace(/,/g, '')) || 0, 0);
    totalsData.push({ label: 'الإجمالي الكلي', value: grand.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) });
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'visible', fontFamily: 'Cairo, sans-serif', direction: 'rtl' }}>
      <table style={{
        width:           '100%',
        borderCollapse:  'collapse',
        tableLayout:     'fixed',
        fontSize:        rowSize,
        color:           rowColor,
      }}>
        <colgroup>
          {visibleCols.map((col) => (
            <col key={col.id} style={{ width: `${col.width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {visibleCols.map((col) => (
              <th key={col.id} style={{
                background:   hdrBg,
                color:        hdrColor,
                fontSize:     hdrSize,
                fontWeight:   hdrWeight,
                border,
                padding:      '4px 6px',
                textAlign:    cellAlign(col.align),
                fontFamily:   'Cairo, sans-serif',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust:       'exact',
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineItems.length === 0 ? (
            <tr>
              <td
                colSpan={visibleCols.length}
                style={{ border, padding: '6px', textAlign: 'center', color: '#9ca3af', fontSize: rowSize }}
              >
                لا توجد بنود
              </td>
            </tr>
          ) : (
            lineItems.map((row) => (
              <tr key={row.index}>
                {visibleCols.map((col) => (
                  <td key={col.id} style={{
                    border,
                    padding:    '3px 6px',
                    textAlign:  cellAlign(col.align),
                    fontSize:   rowSize,
                    fontFamily: 'Cairo, sans-serif',
                    wordBreak:  'break-word',
                  }}>
                    {getCellValue(row, col.field)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {totalsData.length > 0 && (
          <tfoot>
            {totalsData.map((t) => (
              <tr key={t.label}>
                <td
                  colSpan={visibleCols.length - 1}
                  style={{ border, padding: '3px 6px', textAlign: 'end', fontWeight: 700, fontSize: rowSize }}
                >
                  {t.label}
                </td>
                <td style={{ border, padding: '3px 6px', textAlign: 'end', fontWeight: 700, fontSize: rowSize }}>
                  {t.value}
                </td>
              </tr>
            ))}
          </tfoot>
        )}
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Add `lineItems` to `TemplateStudioRendererProps` and pass it through**

Replace the props interface:
```typescript
export interface TemplateStudioRendererProps {
  template:   TemplateStudioTemplate;
  data:       Record<string, string>;
  lineItems?: NormalizedLineRow[];   // optional; required only for lineItemsTable elements
  scale?:     number;
  className?: string;
}
```

Update `TemplateStudioRenderer` destructuring and `ElementShell` call:
```typescript
export default function TemplateStudioRenderer({
  template,
  data,
  lineItems = [],
  scale = 1,
  className,
}: TemplateStudioRendererProps) {
  // ...
  return (
    <div ...>
      <div style={canvasStyle}>
        {template.elements.map((el) => (
          <ElementShell
            key={el.id}
            el={el}
            docType={template.documentType}
            data={data}
            lineItems={lineItems}
          />
        ))}
      </div>
    </div>
  );
}
```

Update `ElementShell` props and switch:
```typescript
function ElementShell({
  el, docType, data, lineItems,
}: {
  el:        TemplateStudioElement;
  docType:   TemplateStudioDocumentType;
  data:      Record<string, string>;
  lineItems: NormalizedLineRow[];
}) {
  // ... existing code ...
  switch (el.type) {
    // ... existing cases ...
    case 'lineItemsTable': content = renderLineItemsTableEl(el as LineItemsTableElement, lineItems); break;
    default:               content = null;
  }
  // ...
}
```

- [ ] **Step 4: TypeScript-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/print-templates/studio/TemplateStudioRenderer.tsx
git commit -m "feat(studio): render lineItemsTable in TemplateStudioRenderer"
```

---

### Task 5: Update `TemplateStudioEditor.tsx`

**Files:**
- Modify: `frontend/src/print-templates/studio/TemplateStudioEditor.tsx`

**Interfaces:**
- Consumes: `LineItemsTableElement`, `LineItemsColumn`, `TableHeaderStyle`, `TableRowStyle`, `TableBorderStyle` from types; `getDefaultLineItemsColumns` from `lineItemsResolver.ts`.
- Produces: `addLineItemsTable()` action, `renderLineItemsTableProps(el)` property panel, canvas preview chip, toolbar button.

- [ ] **Step 1: Add imports**

Add to type imports:
```typescript
  LineItemsTableElement,
  LineItemsColumn,
  TableHeaderStyle,
  TableRowStyle,
  TableBorderStyle,
```

Add runtime import:
```typescript
import { getDefaultLineItemsColumns } from './lineItemsResolver';
```

- [ ] **Step 2: Add `addLineItemsTable()` action**

After `addCircle()` (around line 308):
```typescript
function addLineItemsTable() {
  const cols = getDefaultLineItemsColumns(activeDocType);
  addElement(makeElement<LineItemsTableElement>('lineItemsTable', {
    ...DEFAULT_POS,
    x: 20, y: 80, w: 170, h: 70,
    type:        'lineItemsTable',
    columns:     cols,
    headerStyle: { background: 'brand', color: 'default', fontSize: 'small', fontWeight: 'bold' },
    rowStyle:    { fontSize: 'small', color: 'default' },
    borderStyle: { color: 'gray' },
    totals:      { showGrandTotal: true },
  }));
}
```

- [ ] **Step 3: Add toolbar button**

In the element toolbar row array (around line 771), add entry:
```typescript
{ label: 'جدول بنود', fn: addLineItemsTable },
```

- [ ] **Step 4: Add canvas preview for `lineItemsTable`**

In `renderElementPreview` switch, add before `default`:
```typescript
case 'lineItemsTable':
  return (
    <div style={{
      width: '100%', height: '100%', background: '#f8fafc',
      border: '1px solid #94a3b8', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        background: '#1d4e6f', color: '#fff', fontSize: 6,
        padding: '1px 3px', fontFamily: 'Cairo, sans-serif',
      }}>
        {(el as LineItemsTableElement).columns.filter(c => c.visible).map(c => c.label).join(' | ')}
      </div>
      <div style={{ fontSize: 6, color: '#64748b', padding: '2px 3px', fontFamily: 'Cairo, sans-serif' }}>
        بنود الجدول…
      </div>
    </div>
  );
```

- [ ] **Step 5: Add property panel renderer `renderLineItemsTableProps`**

Add after `renderCircleProps` (around line 630):

```typescript
function renderLineItemsTableProps(el: LineItemsTableElement) {
  function updateCol(colId: string, patch: Partial<LineItemsColumn>) {
    const newCols = el.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c));
    updateElement(el.id, { columns: newCols } as Partial<LineItemsTableElement>);
  }
  function moveCol(colId: string, dir: -1 | 1) {
    const idx = el.columns.findIndex((c) => c.id === colId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= el.columns.length) return;
    const cols = [...el.columns];
    [cols[idx], cols[newIdx]] = [cols[newIdx], cols[idx]];
    updateElement(el.id, { columns: cols } as Partial<LineItemsTableElement>);
  }
  function updateHeader(patch: Partial<TableHeaderStyle>) {
    updateElement(el.id, { headerStyle: { ...el.headerStyle, ...patch } } as Partial<LineItemsTableElement>);
  }
  function updateRow(patch: Partial<TableRowStyle>) {
    updateElement(el.id, { rowStyle: { ...el.rowStyle, ...patch } } as Partial<LineItemsTableElement>);
  }
  function updateBorder(patch: Partial<TableBorderStyle>) {
    updateElement(el.id, { borderStyle: { ...el.borderStyle, ...patch } } as Partial<LineItemsTableElement>);
  }
  function updateTotals(patch: Partial<NonNullable<LineItemsTableElement['totals']>>) {
    updateElement(el.id, { totals: { ...el.totals, ...patch } } as Partial<LineItemsTableElement>);
  }

  return (
    <>
      {/* ── Columns ── */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>الأعمدة</div>
      {el.columns.map((col, i) => (
        <div key={col.id} style={{ border: '1px solid #334155', borderRadius: 3, padding: 4, marginBottom: 3 }}>
          {/* visible toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, marginBottom: 3 }}>
            <input
              type="checkbox"
              checked={col.visible}
              onChange={(e) => updateCol(col.id, { visible: e.target.checked })}
            />
            <span style={{ color: '#e2e8f0' }}>{col.field}</span>
          </label>
          {/* label */}
          <div style={propRow}>
            <label style={propLabel}>تسمية</label>
            <input
              type="text"
              style={propInput}
              value={col.label}
              maxLength={30}
              onChange={(e) => updateCol(col.id, { label: e.target.value.replace(/[<>]/g, '') })}
            />
          </div>
          {/* width */}
          <div style={propRow}>
            <label style={propLabel}>عرض %</label>
            <input
              type="number"
              style={propInput}
              value={col.width}
              min={0}
              max={100}
              step={1}
              onChange={(e) => updateCol(col.id, { width: parseFloat(e.target.value) || 0 })}
            />
          </div>
          {/* align */}
          <div style={propRow}>
            <label style={propLabel}>محاذاة</label>
            <select
              style={propInput}
              value={col.align}
              onChange={(e) => updateCol(col.id, { align: e.target.value as LineItemsColumn['align'] })}
            >
              <option value="start">يمين</option>
              <option value="center">وسط</option>
              <option value="end">يسار</option>
            </select>
          </div>
          {/* reorder */}
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            <button
              type="button"
              style={{ ...propInput, cursor: 'pointer', flex: 1, textAlign: 'center' }}
              disabled={i === 0}
              onClick={() => moveCol(col.id, -1)}
            >↑</button>
            <button
              type="button"
              style={{ ...propInput, cursor: 'pointer', flex: 1, textAlign: 'center' }}
              disabled={i === el.columns.length - 1}
              onClick={() => moveCol(col.id, 1)}
            >↓</button>
          </div>
        </div>
      ))}

      {/* ── Header style ── */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>رأس الجدول</div>
      <div style={propRow}>
        <label style={propLabel}>خلفية</label>
        <select style={propInput} value={el.headerStyle.background}
          onChange={(e) => updateHeader({ background: e.target.value as TableHeaderStyle['background'] })}>
          {COLOR_TOKEN_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div style={propRow}>
        <label style={propLabel}>حجم خط الرأس</label>
        <select style={propInput} value={el.headerStyle.fontSize}
          onChange={(e) => updateHeader({ fontSize: e.target.value as TableHeaderStyle['fontSize'] })}>
          {FONT_SIZE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* ── Row style ── */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>صفوف البيانات</div>
      <div style={propRow}>
        <label style={propLabel}>حجم الخط</label>
        <select style={propInput} value={el.rowStyle.fontSize}
          onChange={(e) => updateRow({ fontSize: e.target.value as TableRowStyle['fontSize'] })}>
          {FONT_SIZE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* ── Border ── */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>الحدود</div>
      <div style={propRow}>
        <label style={propLabel}>لون الحدود</label>
        <select style={propInput} value={el.borderStyle.color}
          onChange={(e) => updateBorder({ color: e.target.value as TableBorderStyle['color'] })}>
          {COLOR_TOKEN_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* ── Totals ── */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>الإجماليات</div>
      {([
        ['showSubtotal',  'المجموع الفرعي'],
        ['showDiscount',  'الخصم'],
        ['showTax',       'الضريبة'],
        ['showGrandTotal','الإجمالي الكلي'],
      ] as [keyof NonNullable<LineItemsTableElement['totals']>, string][]).map(([key, lbl]) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#e2e8f0' }}>
          <input
            type="checkbox"
            checked={!!el.totals?.[key]}
            onChange={(e) => updateTotals({ [key]: e.target.checked })}
          />
          {lbl}
        </label>
      ))}
    </>
  );
}
```

- [ ] **Step 6: Wire property panel**

In `renderPropertyPanel`, add before `{/* Delete */}`:
```typescript
{el.type === 'lineItemsTable' && renderLineItemsTableProps(el as LineItemsTableElement)}
```

- [ ] **Step 7: TypeScript-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/print-templates/studio/TemplateStudioEditor.tsx
git commit -m "feat(studio): add lineItemsTable toolbar button and property panel"
```

---

### Task 6: Update `InvoicePreview.tsx` and `Quotation.tsx`

**Files:**
- Modify: `frontend/src/pages/InvoicePreview.tsx`
- Modify: `frontend/src/pages/Quotation.tsx`

**Interfaces:**
- Consumes: `resolveInvoiceLineItems`, `resolveQuotationLineItems` from `lineItemsResolver.ts`.
- Produces: `lineItems` prop passed to `TemplateStudioRenderer` in both pages.

- [ ] **Step 1: Update `InvoicePreview.tsx`**

Add import after existing studio imports (around line 29):
```typescript
import { resolveInvoiceLineItems } from '../print-templates/studio/lineItemsResolver';
```

In the `TemplateStudioRenderer` usage (around line 833), add `lineItems` prop:
```typescript
<TemplateStudioRenderer
  template={studioTemplate}
  data={{ ... existing data object ... }}
  lineItems={resolveInvoiceLineItems(data?.items)}
/>
```

- [ ] **Step 2: Update `Quotation.tsx`**

Add import after existing studio imports (around line 34):
```typescript
import { resolveQuotationLineItems } from '../print-templates/studio/lineItemsResolver';
```

In the `TemplateStudioRenderer` usage (around line 428), add `lineItems` prop:
```typescript
<TemplateStudioRenderer
  template={studioTemplate}
  data={{ ... existing data object ... }}
  lineItems={resolveQuotationLineItems(printFields.items)}
/>
```

- [ ] **Step 3: TypeScript-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/InvoicePreview.tsx frontend/src/pages/Quotation.tsx
git commit -m "feat(studio): pass lineItems to TemplateStudioRenderer in invoice and quotation pages"
```

---

### Task 7: Add tests to `templateStudio.test.ts`

**Files:**
- Modify: `frontend/src/__tests__/printTemplates/templateStudio.test.ts`

**Interfaces:**
- Consumes: `validateElement`, `validateTemplate`, `exportTemplate`, `importTemplate` from `templateStudioUtils.ts`; `resolveInvoiceLineItems`, `resolveQuotationLineItems`, `getDefaultInvoiceColumns`, `getDefaultQuotationColumns`, `normalizeColumnWidths` from `lineItemsResolver.ts`; `LineItemsTableElement` from `templateStudioTypes.ts`.

- [ ] **Step 1: Add imports to the test file**

Append to the import block:
```typescript
import {
  resolveInvoiceLineItems,
  resolveQuotationLineItems,
  getDefaultInvoiceColumns,
  getDefaultQuotationColumns,
  normalizeColumnWidths,
} from '../../print-templates/studio/lineItemsResolver';
import type { LineItemsTableElement } from '../../print-templates/studio/templateStudioTypes';
```

- [ ] **Step 2: Write all 16 tests**

Append to the file:

```typescript
// ─── Helpers for lineItemsTable tests ────────────────────────────────────────
function makeLineItemsTable(overrides: Partial<LineItemsTableElement> = {}): LineItemsTableElement {
  return {
    id: 'lit-1', label: 'جدول البنود', type: 'lineItemsTable',
    x: 20, y: 80, w: 170, h: 70, rotation: 0,
    columns: [
      { id: 'c1', field: 'index',       label: '#',      width: 10, align: 'center', visible: true },
      { id: 'c2', field: 'description', label: 'البيان', width: 60, align: 'start',  visible: true },
      { id: 'c3', field: 'total',       label: 'الإجمالي', width: 30, align: 'end', visible: true },
    ],
    headerStyle: { background: 'brand', color: 'default', fontSize: 'small', fontWeight: 'bold' },
    rowStyle:    { fontSize: 'small', color: 'default' },
    borderStyle: { color: 'gray' },
    ...overrides,
  };
}

// ─── 18. Valid lineItemsTable element passes validation ───────────────────────
describe('lineItemsTable: valid element', () => {
  it('accepts a well-formed lineItemsTable element', () => {
    const result = validateElement(makeLineItemsTable(), 'invoice');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── 19. Unknown line item field rejected ─────────────────────────────────────
describe('lineItemsTable: unknown field rejected', () => {
  it('rejects column with field not in allowlist', () => {
    const el = makeLineItemsTable({
      columns: [
        { id: 'c1', field: 'index' as LineItemsTableElement['columns'][0]['field'], label: '#', width: 10, align: 'center', visible: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: 'c2', field: '__proto__' as any, label: 'bad', width: 90, align: 'start', visible: true },
      ],
    });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('حقل جدول غير مسموح'))).toBe(true);
  });
});

// ─── 20. Duplicate column IDs rejected ───────────────────────────────────────
describe('lineItemsTable: duplicate column IDs rejected', () => {
  it('rejects two columns with same id', () => {
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

// ─── 21. Empty columns array rejected ────────────────────────────────────────
describe('lineItemsTable: empty columns rejected', () => {
  it('rejects element with empty columns array', () => {
    const el = makeLineItemsTable({ columns: [] });
    const result = validateElement(el, 'invoice');
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

  it('preserves hidden columns without changing their width proportionally', () => {
    const cols = getDefaultInvoiceColumns();
    const before = cols.find(c => !c.visible)?.width;
    const after  = normalizeColumnWidths(cols).find(c => !c.visible)?.width;
    expect(before).toBe(after);
  });
});

// ─── 23. Default invoice columns ─────────────────────────────────────────────
describe('getDefaultInvoiceColumns', () => {
  it('returns columns including index, description, quantity, unitPrice, total', () => {
    const cols = getDefaultInvoiceColumns();
    const fields = cols.map(c => c.field);
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
  it('does not include discount column (not in quotation allowlist)', () => {
    const fields = getDefaultQuotationColumns().map(c => c.field);
    expect(fields).not.toContain('discount');
  });

  it('includes total column', () => {
    expect(getDefaultQuotationColumns().some(c => c.field === 'total')).toBe(true);
  });
});

// ─── 25. Invoice row resolver ─────────────────────────────────────────────────
describe('resolveInvoiceLineItems', () => {
  it('normalizes invoice items to NormalizedLineRow[]', () => {
    const items = [
      { id: 1, description: 'أسفلت', quantity: 5, unit: 'طن', unitPrice: 100, total: 500 },
    ];
    const rows = resolveInvoiceLineItems(items);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('أسفلت');
    expect(rows[0].quantity).toBe('5');
    expect(rows[0].unit).toBe('طن');
    expect(rows[0].total).toBe('500.000');
  });
});

// ─── 26. Quotation row resolver ───────────────────────────────────────────────
describe('resolveQuotationLineItems', () => {
  it('normalizes quotation items and computes total from qty * unitPrice', () => {
    const items = [
      { id: 'a', description: 'عمالة', qty: '3', unit: 'يوم', unitPrice: '50' },
    ];
    const rows = resolveQuotationLineItems(items);
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

  it('returns empty array for non-array', () => {
    expect(resolveInvoiceLineItems('bad')).toHaveLength(0);
  });
});

// ─── 28. Render table with rows (resolver output shape) ───────────────────────
describe('resolver output shape', () => {
  it('every row has index, description, quantity, unit, unitPrice, total as strings', () => {
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

// ─── 29. Render table with no rows ───────────────────────────────────────────
describe('resolver: empty items array', () => {
  it('returns empty NormalizedLineRow[] for empty items array', () => {
    expect(resolveInvoiceLineItems([])).toHaveLength(0);
    expect(resolveQuotationLineItems([])).toHaveLength(0);
  });
});

// ─── 30. Import/export roundtrip with lineItemsTable ─────────────────────────
describe('import/export roundtrip: lineItemsTable', () => {
  it('exports and re-imports a template containing a lineItemsTable element', () => {
    const el = makeLineItemsTable();
    const tpl = makeInvoiceTemplate({ elements: [el] });
    const json = exportTemplate(tpl);
    const result = importTemplate(json);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('should be ok');
    expect(result.template.elements[0].type).toBe('lineItemsTable');
  });

  it('rejects imported template with invalid lineItemsTable (unknown field)', () => {
    const el = makeLineItemsTable({
      columns: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: 'c1', field: 'injected' as any, label: 'x', width: 100, align: 'start', visible: true },
      ],
    });
    const tpl = makeInvoiceTemplate({ elements: [el] });
    const json = JSON.stringify({ version: 1, template: tpl });
    const result = importTemplate(json);
    expect(result.ok).toBe(false);
  });
});

// ─── 31. Unsafe label rejected ────────────────────────────────────────────────
describe('lineItemsTable: unsafe label rejected', () => {
  it('rejects column with < in label', () => {
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
describe('lineItemsTable: totals toggles', () => {
  it('accepts valid boolean totals flags', () => {
    const el = makeLineItemsTable({
      totals: { showSubtotal: true, showGrandTotal: true },
    });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(true);
  });

  it('rejects non-boolean totals flag', () => {
    const el = makeLineItemsTable({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      totals: { showSubtotal: 'yes' as any },
    });
    const result = validateElement(el, 'invoice');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('إجمالي'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -30
```

Expected: all tests pass, including the 16 new ones.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/__tests__/printTemplates/templateStudio.test.ts
git commit -m "test(studio): add 16 tests for lineItemsTable element type"
```

---

### Task 8: Run all validation commands

- [ ] **Step 1: Prisma validate**

```bash
cd backend && npx prisma validate
```

Expected: Schema is valid.

- [ ] **Step 2: Backend tsc**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 3: Frontend tsc**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 4: Electron tsc**

```bash
tsc -p electron/tsconfig.json --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 5: Backend tests**

```bash
cd backend && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 7: build:back**

```bash
npm run build:back 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 8: build:front**

```bash
npm run build:front 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 9: electron:build**

```bash
npm run electron:build 2>&1 | tail -20
```

Expected: no errors.

---

## Deferred Items

- Multi-page table pagination (explicit out-of-scope for Phase 6.1A)
- Barcode real rendering (out of scope)
- Layers panel, group/ungroup, asset library (out of scope)

## Regression Risks

- Adding `lineItems` optional prop to renderer is backward-compatible (defaults to `[]`).
- `ALLOWED_ELEMENT_TYPES` updated — import/export validation must not break existing templates (new type only adds to allowlist).
- `TemplateStudioElement` union is extended — TypeScript exhaustiveness checks in `ElementShell` must cover the new case.
- No changes to accounting, salaries, HR, or any other module.
