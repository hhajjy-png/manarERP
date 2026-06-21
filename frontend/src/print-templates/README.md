# Print Templates — Architecture Reference

> **Status:** Phase 1.95 — hardening layer complete. Not connected to production pages.
>
> All files live exclusively under `frontend/src/print-templates/`.

---

## Pipeline Overview

```
Reference Templates  (reference/)
        ↓
Engine Registry      (engine/)
        ↓
Template Service     (service/)
        ↓
Adapters             (adapters/)
        ↓
Builders             (builders/)
        ↓
Hooks                (hooks/)
        ↓
Future Production Pages
```

---

## Package Map

| Folder | Role | Phase 2 consumer? |
|---|---|---|
| `reference/` | Static React components, CSS Modules, logo asset | No — dev preview only |
| `engine/` | Types + registry functions | Via `service/` |
| `storage/` | localStorage read/write — single I/O surface | Via `hooks/` |
| `service/` | Registry lookup API for production pages | ✅ Yes |
| `adapters/` | API response → PrintData converters | Via `builders/` |
| `builders/` | Composition entry point: adapter + overrides + future QR | ✅ Yes |
| `utils/` | Pure functions: tafqeet, KWD format, date format | Via adapters / builders |
| `hooks/` | React hooks: usePrintProfile, usePrintTemplate | ✅ Yes |
| `components/` | Isolated UI: PrintTemplateSelector | ✅ Yes |

---

## Sub-package Details

### `engine/` — Types and Registry

Defines all data interfaces and the 26-template registry.

```ts
// types.ts
PrintTemplateCategory    'invoice' | 'quotation' | 'purchase-order' | 'rfq'
PrintTemplateDefinition  { id, category, nameAr, nameEn, variant, component, ... }
InvoicePrintData         { company, invoiceNumber, date, customerName, lineItems, ... }
// + QuotationPrintData, PurchaseOrderPrintData, RFQPrintData, CompanyPrintData, PrintLineItem

// registry.ts
getPrintTemplates(category?)          → PrintTemplateDefinition[]
getPrintTemplate(category, id)        → PrintTemplateDefinition | undefined
getDefaultPrintTemplate(category)     → PrintTemplateDefinition
getLetterheadVariant(category, id)    → PrintTemplateDefinition | undefined
```

Template count: **26** (5 invoice × 2 + 3 quotation × 2 + 2 PO × 2 + 3 RFQ × 2).

---

### `storage/` — localStorage Wrapper

The **only** place that reads/writes `localStorage`. All other modules stay I/O-free.

```ts
// printProfileStorage.ts
PrintProfile             { templateId: string; paperType: 'plain-a4' | 'letterhead' }
PrintPaperType           'plain-a4' | 'letterhead'

loadPrintProfile(category)            → PrintProfile   (returns default if missing)
savePrintProfile(category, profile)   → void           (silently no-ops on error)
resetPrintProfile(category)           → void

PRINT_PROFILE_DEFAULTS                Record<category, PrintProfile>
```

Key format: `manar:print-profile:<category>` (e.g. `manar:print-profile:invoice`).
SSR/window-safe: guarded by `typeof window !== 'undefined'`.

---

### `service/` — Template Service

Production pages use this instead of importing raw registry functions.

```ts
// printTemplateService.ts
listTemplates(category?)                                → PrintTemplateDefinition[]
findTemplate(category, id)                              → PrintTemplateDefinition | undefined
getDefaultTemplate(category)                            → PrintTemplateDefinition
resolveTemplateForProfile(category, templateId, paper)  → PrintTemplateDefinition
```

`resolveTemplateForProfile` is the key function for Phase 2: given a saved profile, it
returns the correct component to render (original vs. blank-letterhead variant).

---

### `adapters/` — API Type Interfaces and Converters

```ts
// apiTypes.ts — mirrors backend FULL_INCLUDE shape
ApiInvoice / ApiInvoiceItem / ApiInvoicePayment / ApiInvoiceCustomer / ApiInvoiceSupplier
ApiQuotation / ApiRFQ  (forward-declaration stubs for future backend entities)

// invoiceAdapter.ts
adaptInvoice(ApiInvoice) → InvoicePrintData

// purchaseOrderAdapter.ts
adaptPurchaseOrder(ApiInvoice) → PurchaseOrderPrintData
isPurchaseInvoice(ApiInvoice)  → boolean

// quotationAdapter.ts — stub, backend entity does not exist yet
adaptQuotation(ApiQuotation) → QuotationPrintData

// rfqAdapter.ts — stub, backend entity does not exist yet
adaptRFQ(ApiRFQ) → RFQPrintData

// companyData.ts
ALMANAR_COMPANY                             — static default company data
getDefaultCompanyPrintData()                → CompanyPrintData
createCompanyPrintData(overrides?)          → CompanyPrintData
```

---

### `builders/` — Composition Entry Points

Builders call the adapter, apply optional company overrides, and hold stubs for
future hooks (QR codes, signatory names, approver fields).

```ts
buildInvoicePrintData(invoice, options?)        → InvoicePrintData
buildQuotationPrintData(quotation, options?)    → QuotationPrintData
buildPurchaseOrderPrintData(invoice, options?)  → PurchaseOrderPrintData
buildRFQPrintData(rfq, options?)                → RFQPrintData

// All options share the shape:
{ company?: Partial<CompanyPrintData>; /* future hooks */ }
```

Phase 2 production pages should call builders, not raw adapters.

---

### `utils/` — Pure Utility Functions

No React. No side effects. Safe to import anywhere including backend-adjacent tests.

```ts
// tafqeet.ts
tafqeet(amount: number) → string
// "732.500" → "سبعمائة واثنا وثلاثون ديناراً كويتياً وخمسمائة فلساً فقط لا غير"
// Handles 0 – 9,999,999.999 KWD. SSR-safe.

// formatKWD.ts
splitKWD(total)   → { dinars, fils, filsPadded }
formatKWD(total)  → "1,234.500"
formatKWDAr(total) → "1,234.500 د.ك"

// formatDate.ts
formatDateForPrint(date)     → "20 / 06 / 2026"
formatDateCompact(date)      → "20-06-2026"
formatDateArabicLong(date)   → "20 يونيو 2026"
```

---

### `hooks/` — React Hooks

```ts
// usePrintProfile.ts (delegates all I/O to storage/)
usePrintProfile(category) → [profile, setProfile]
getPrintProfile(category) → PrintProfile            (non-React)

// usePrintTemplate.ts
usePrintTemplate(category, data?) → {
  templates,         // all templates for picker UI
  activeTemplate,    // selected template (original variant)
  resolvedTemplate,  // correct variant per paperType (may be blank-letterhead)
  profile,
  setProfile,
  data,
}
```

---

### `components/` — Isolated UI

```tsx
<PrintTemplateSelector
  category="invoice"
  profile={profile}
  onSelect={setProfile}
  showPaperToggle={true}   // default: true
/>
```

Shows original-variant template names + paper-type toggle (plain-a4 / letterhead).
Uses app CSS tokens (`--accent`, `--border`, `--surface`, etc.). Not routed.

---

## Phase 2 Integration Pattern

```tsx
// InvoicePreview.tsx (Phase 2):
import {
  buildInvoicePrintData,
  resolveTemplateForProfile,
  usePrintProfile,
  PrintTemplateSelector,
  type ApiInvoice,
} from '../print-templates';

function InvoicePrintView({ apiInvoice }: { apiInvoice: ApiInvoice }) {
  const [profile, setProfile] = usePrintProfile('invoice');
  const template = resolveTemplateForProfile('invoice', profile.templateId, profile.paperType);
  const data = buildInvoicePrintData(apiInvoice);
  const Template = template.component;

  return (
    <>
      <PrintTemplateSelector category="invoice" profile={profile} onSelect={setProfile} />
      <Template data={data} />
    </>
  );
}
```

---

## Template Coverage

| Category | Original Designs | Blank-Letterhead Variants | Total |
|---|---|---|---|
| `invoice` | 5 (Design 1–5) | 5 | 10 |
| `quotation` | 3 (Design 1–3) | 3 | 6 |
| `purchase-order` | 2 (Design 1–2) | 2 | 4 |
| `rfq` | 3 (Design 1–3) | 3 | 6 |
| **Total** | **13** | **13** | **26** |

---

## Code Quality & Review History

### Gemini Review — Phase 1.95

**Result: APPROVED WITH MINOR IMPROVEMENTS**

Findings addressed in Phase 1.96:
- Company override logic changed from truthy-string (`||` semantics) to `??` semantics — empty strings are now intentional overrides, not silently dropped.
- Raw adapter functions removed from public top-level barrel — production pages must go through builders.
- Additional edge-case tests added (millions tafqeet, rounding, company override semantics).

---

### Public Barrel Rule

Production pages must import exclusively from `print-templates/index.ts` (the top-level barrel). Raw adapter functions (`adaptInvoice`, `adaptPurchaseOrder`, etc.) are **not exported** from the barrel — they are an implementation detail of builders. Import adapters directly only from `adapters/index.ts` inside this package for tests or internal tooling.

```ts
// ✅ Correct — Phase 2 production page
import { buildInvoicePrintData, resolveTemplateForProfile } from '../print-templates';

// ❌ Wrong — bypasses builder composition layer
import { adaptInvoice } from '../print-templates';
```

---

### Company Override Rule

`createCompanyPrintData` uses `??` semantics: every string key you provide in the overrides object is applied — including empty strings. Only `undefined` (key absent or explicitly `undefined`) falls back to the default.

```ts
// Clears fax field intentionally (e.g. for a document type that hides it)
createCompanyPrintData({ fax: '' })    // fax → ''

// Keeps default fax — undefined means "use default"
createCompanyPrintData({ fax: undefined })  // fax → '98777887'
createCompanyPrintData({})                  // fax → '98777887'
```

Do **not** use `override || default` patterns in builder or adapter code — use `??`.

---

## Phase History

| Phase | Commit | What |
|---|---|---|
| 1 | `74826ed` | HTML → React conversion (26 static TSX components) |
| 1.5 | `b344486` | CSS Modules, asset wiring, blank variants, barrel exports |
| 1.8 | `3af9999` | Engine: types.ts + registry.ts + template definitions |
| 1.9 | — | Adapters, utils (tafqeet/formatKWD/formatDate), hooks, PrintTemplateSelector, top-level barrel |
| 1.95 | — | Storage wrapper, Template Service, Builders, company provider, stub docs, unit tests, README |
| 1.96 | — | `??` override semantics in company data, adapters hidden from public barrel, edge-case tests, README update |
