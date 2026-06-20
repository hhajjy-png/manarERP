# Print Template Engine

> **Phase 1.8 — Foundation only. Not connected to production pages.**

The engine provides a typed registry and loader functions so production pages never import individual template components directly.

---

## What This Is

A thin abstraction layer between the raw React template components (in `../reference/`) and any future page that needs to print.

Instead of:
```tsx
// Don't do this in production pages
import { InvoiceDesign1 } from '../print-templates/reference/invoices';
```

Pages will eventually do:
```tsx
import { getPrintTemplate, getDefaultPrintTemplate } from '../print-templates/engine';

const template = getDefaultPrintTemplate('invoice');
const Template = template.component;
// <Template data={invoiceData} />
```

---

## Status

**Not connected to production.** None of the engine files are imported by:
- `App.tsx`
- `InvoicePreview.tsx`
- `Quotation.tsx`
- `PurchaseRequest.tsx`
- Any sidebar, route, or backend module

Phase 2 will wire the engine into production pages.

---

## Registry Functions

All functions exported from `engine/index.ts`.

### `getPrintTemplates(category?)`

Returns all 26 templates, or filtered by category.

```ts
getPrintTemplates()                 // all 26
getPrintTemplates('invoice')        // 10 invoice templates
getPrintTemplates('quotation')      // 6 quotation templates
getPrintTemplates('purchase-order') // 4 purchase order templates
getPrintTemplates('rfq')            // 6 RFQ templates
```

### `getPrintTemplate(category, id)`

Returns a single template by category + id, or `undefined`.

```ts
getPrintTemplate('invoice', 'invoice-design-1')
getPrintTemplate('rfq', 'rfq-design-2-blank')
```

### `getDefaultPrintTemplate(category)`

Returns the first `original` variant for the category. Throws if none registered.

```ts
getDefaultPrintTemplate('invoice')  // InvoiceDesign1 definition
```

### `getLetterheadVariant(category, originalId)`

Maps an original template id to its blank-letterhead counterpart, or `undefined`.

```ts
getLetterheadVariant('invoice', 'invoice-design-2')
// → definition for 'invoice-design-2-blank'
```

Convention: blank id = original id + `"-blank"`.

---

## Template Categories

| Category | Count | Original | Blank-Letterhead |
|---|---|---|---|
| `invoice` | 10 | Design 1–5 | Design 1–5 Blank |
| `quotation` | 6 | Design 1–3 | Design 1–3 Blank |
| `purchase-order` | 4 | Design 1–2 | Design 1–2 Blank |
| `rfq` | 6 | Design 1–3 | Design 1–3 Blank |
| **Total** | **26** | **13** | **13** |

---

## Original vs. Blank-Letterhead Variants

| Variant | Header/footer visible | Best for |
|---|---|---|
| `original` | Yes | Plain A4 paper (letterhead printed by template) |
| `blank-letterhead` | No (visibility:hidden / display:none) | Pre-printed letterhead paper |

---

## Template Component Type

```ts
type PrintTemplateComponent<TData = unknown> = React.ComponentType<{ data?: TData }>;
```

**Phase 1.8 status:** All components are Phase 1.5 static stubs — they accept no props and render sample data. The `bridge()` helper in each registry file casts them to the typed interface using `as unknown as`.

**Phase 2:** Static stubs will be replaced with data-driven components that render from the `data` prop.

---

## Document Data Types

Future-ready interfaces defined in `types.ts`:

| Interface | Used by |
|---|---|
| `CompanyPrintData` | All categories (shared company header) |
| `PrintLineItem` | All categories (line items table) |
| `InvoicePrintData` | `invoice` category |
| `QuotationPrintData` | `quotation` category |
| `PurchaseOrderPrintData` | `purchase-order` category |
| `RFQPrintData` | `rfq` category |

---

## Phase 2 Plan

- **Template selector** — UI dropdown to choose design at print time, driven by `getPrintTemplates(category)`
- **Data binding** — replace static stubs with components that render from `data` prop
- **Print Profiles integration** — auto-select `original` vs `blank-letterhead` based on user's print profile setting
- **QR code** — per-document QR in template via `data.qr`
- **Production page wiring**:
  - `InvoicePreview.tsx` → `getPrintTemplate('invoice', selectedId)`
  - `Quotation.tsx` → `getPrintTemplate('quotation', selectedId)`
  - `PurchaseRequest.tsx` → `getPrintTemplate('purchase-order', selectedId)`
  - RFQ page → `getPrintTemplate('rfq', selectedId)`
- **Language / locale** — bilingual field values from data
