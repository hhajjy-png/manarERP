# Print Templates — Architecture Reference

> **Status:** Phase 2B — Quotation.tsx preview connected. Invoice preview (2C) pending.
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
| `utils/` | Pure functions: tafqeet, KWD format, date format, sanitizePrintText | Via adapters / builders |
| `hooks/` | React hooks: usePrintProfile, usePrintTemplate | ✅ Yes |
| `components/` | Isolated UI: PrintTemplateSelector | ✅ Yes |
| `integration/` | Form-state → PrintData adapters for pages that own form state | ✅ Yes (Quotation.tsx) |

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

// sanitizePrintText.ts
sanitizePrintText(value?: string | null) → string
// null/undefined → ''. Trims whitespace. No HTML processing. No innerHTML. Plain text only.
// REQUIRED: apply to every string field rendered inside a template component.
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

### `integration/` — Form-State Adapters

For pages (like `Quotation.tsx`) that own their own form state and have no backend API entity yet.
Each integration file pairs a validator with a form-to-PrintData adapter.

```ts
// quotationPreviewIntegration.ts
interface PrintDataWarning { field: string; messageAr: string; }

adaptFormToQuotationPrintData(fields: QuotationPrintFields): QuotationPrintData
// Maps form strings → typed numbers, contactPerson → attention, project → projectName,
// validUntil date → formatted validity string, empty → fallback text.

validateQuotationPrintData(data: QuotationPrintData): PrintDataWarning[]
// Returns warnings for: missing quotationNumber, customerName, subject, empty lineItems, grandTotal=0.
// Never throws.
```

**Usage in pages:**
```tsx
const printData = useMemo(() => {
  try { return adaptFormToQuotationPrintData(printFields); } catch { return null; }
}, [printFields]);

const { resolvedTemplate, profile, setProfile } = usePrintTemplate('quotation', printData ?? undefined);
const warnings = useMemo(() => printData ? validateQuotationPrintData(printData) : [], [printData]);
```

**Rule:** Call `usePrintTemplate` unconditionally (before any early returns) — React hooks rules.

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
| `quotation` | 5 (Design 1–5) | 5 | 10 |
| `purchase-order` | 2 (Design 1–2) | 2 | 4 |
| `rfq` | 3 (Design 1–3) | 3 | 6 |
| **Total** | **15** | **15** | **30** |

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

## How-To Guides

### Add a New Template Design

1. **Create the CSS module** — copy the closest existing theme file (e.g. `QuotationShared.module.css`) and add a new `.tplN {}` block with your theme overrides. Descendant selectors work because both class names live in the same CSS module scope.
2. **Create the component file** — create `QuotationDesignN.tsx` as a thin wrapper:
   ```tsx
   import QuotationBase from './QuotationBase';
   import styles from './QuotationShared.module.css';
   import type { QuotationPrintData } from '../../engine/types';

   export default function QuotationDesignN({ data }: { data?: QuotationPrintData }) {
     return <QuotationBase themeClass={styles.tplN} showLetterhead={true} data={data} />;
   }
   ```
3. **Create the Blank variant** — same but `showLetterhead={false}` and `themeClass={styles.tplNBlank}` (or reuse `tplN` — blank uses the `.blank` CSS class for top padding).
4. **Export from `reference/quotations/index.ts`** — add both components.
5. **Register in `engine/quotationTemplates.ts`** — add two `PrintTemplateDefinition` entries (original + blank).
6. **Run validation** — `cd frontend && npx tsc --noEmit && npm test`.

---

### Add a New Adapter (for a Page With Its Own Form State)

Use this pattern when the page owns form state rather than reading from a backend API entity.

1. **Create `integration/<category>PreviewIntegration.ts`**:
   ```ts
   export interface PrintDataWarning { field: string; messageAr: string; }

   export function adaptFormTo<Category>PrintData(fields: <Category>PrintFields): <Category>PrintData { ... }
   export function validate<Category>PrintData(data: <Category>PrintData): PrintDataWarning[] { ... }
   ```
2. **Apply `sanitizePrintText`** on all string fields passed to JSX in `adaptForm...` or in the component itself.
3. **Add tests** in `frontend/src/__tests__/printTemplates/<category>Adapter.test.ts`.
4. **Call `usePrintTemplate` unconditionally** in the page component (before any early returns).

---

### Register a New Template in the Engine

In `engine/<category>Templates.ts`:

```ts
import { quotationTemplate } from './quotationTemplates'; // or appropriate helper
import MyDesignN from '../reference/quotations/MyDesignN';
import MyDesignNBlank from '../reference/quotations/MyDesignNBlank';

// Add to the registry array:
quotationTemplate(MyDesignN, {
  id: 'quotation-design-N',
  nameAr: 'اسم التصميم بالعربي',
  nameEn: 'Design Name',
  variant: 'original',
  sourceFile: 'docs/new q/quotation-template-0N-with-letterhead.html',
}),
quotationTemplate(MyDesignNBlank, {
  id: 'quotation-design-N-blank',
  nameAr: 'اسم التصميم بالعربي — بدون ترويسة',
  nameEn: 'Design Name — Blank',
  variant: 'blank-letterhead',
  sourceFile: 'docs/new q/quotation-template-0N-blank-letterhead.html',
}),
```

Convention: blank id = original id + `"-blank"`.

---

### Use PrintTemplateSelector in a Page

```tsx
import { usePrintTemplate, PrintTemplateSelector } from '../print-templates';

function MyPrintPage({ data }: { data?: CategoryPrintData }) {
  // Must be unconditional — call before any early return:
  const { resolvedTemplate, profile, setProfile } = usePrintTemplate('quotation', data);
  const EngineComponent = resolvedTemplate.component;

  return (
    <>
      <PrintTemplateSelector category="quotation" profile={profile} onSelect={setProfile} />
      <EngineComponent data={data} />
    </>
  );
}
```

`resolveTemplateForProfile` (via `usePrintTemplate`) automatically returns the blank-letterhead variant when `profile.paperType === 'letterhead'`.

---

## Rules

These rules apply to every file under `print-templates/`. Violations block merge.

### 1 — No External Font CDN

**Never** load fonts from Google Fonts, Adobe Fonts, or any CDN. The app is offline-only.

```css
/* ❌ Forbidden */
@import url('https://fonts.googleapis.com/css2?family=Cairo');

/* ✅ Required — self-hosted woff2 under src/assets/fonts/ */
@font-face { font-family: 'Tajawal'; src: url('...Tajawal-Regular.woff2') format('woff2'); }
```

### 2 — No PNG Backgrounds

PNG files in template layouts cause print bleed and file-size issues. Use SVG or CSS-only decorations. The company logo (`assets/almanar-logo.png`) is the only permitted PNG — as a standalone `<img>`, never as a CSS `background-image`.

### 3 — sanitizePrintText on All Printed Text

Every string field rendered as JSX text must pass through `sanitizePrintText`. This prevents `"undefined"` literals and strips whitespace that breaks layout.

```tsx
import { sanitizePrintText } from '../../utils/sanitizePrintText';

// ✅ Required
<span>{sanitizePrintText(d.customerName)}</span>

// ❌ Forbidden
<span>{d.customerName}</span>
```

Exceptions: static strings, numbers (`formatKWD(...)`), list keys, and fields already guaranteed non-null by the type system (e.g. `d.quotationNumber` after validation).

### 4 — Legacy Mode Is Default

For pages with an engine toggle, `previewMode` must default to `'legacy'`. Engine mode is opt-in. The original legacy rendering path must remain byte-for-byte identical to pre-Phase-2B behavior.

### 5 — Blank Variant = Layout Minus Header/Footer

The blank-letterhead variant does NOT use `visibility: hidden` (which wastes print space). It uses a CSS `.blank` class that adds `padding-top: 50mm` and simply excludes the header/footer JSX via `showLetterhead={false}`. The body, table, totals, and signature blocks are otherwise identical.

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
| 2B-1 | `feature/print-templates-react-phase1` | Quotation registry completed: 5 designs × 2 variants = 10 templates. `quotationTemplates.ts` rewritten with typed `quotationTemplate()` helper. QuotationBase.tsx + QuotationShared.module.css + D1–D5 + Blank variants. |
| 2B-2 | `feature/print-templates-react-phase1` | Quotation.tsx preview integration: `previewMode` toggle (default `'legacy'`), `adaptFormToQuotationPrintData`, `validateQuotationPrintData`, `PrintTemplateSelector` in engine mode, warning banner. |
| 2B-2 hardening | `feature/print-templates-react-phase1` | Gemini-required: `sanitizePrintText` utility, intro text CSS (`white-space: pre-line; overflow-wrap`), Totals Block always renders all 3 rows. |
