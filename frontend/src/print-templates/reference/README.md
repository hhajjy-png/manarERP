# Print Templates — Reference React Components

> **Reference only.** These are static React components converted from HTML design sources.
> Do NOT connect to InvoicePreview, Quotation, PurchaseRequest, App routes, or the sidebar.

---

## History

### Phase 1 — HTML → React Conversion (2026-06-20, commit 74826ed)

Converted 26 HTML print template designs to static TSX components.

- All HTML structure faithfully preserved
- CSS extracted verbatim from source HTML
- `@font-face` base64 blocks removed — project loads Cairo via `@fontsource/cairo`
- Image `src` attributes set to `""` (placeholder for Phase 1.5)
- Global `<style>` blocks injected per component (fixed in Phase 1.5)

### Phase 1.5 — Production-Ready Reference Library (2026-06-20)

Upgraded templates to isolated, asset-wired reference components.

- **Asset wiring**: all `src=""` replaced with imported `almanar-logo.png`
- **CSS isolation**: inline `<style>` tags removed; each design family has a `.module.css` file (CSS Modules, Vite-native — no config changes)
- **CSS scoping**: standalone element selectors (`table`, `th,td`, `thead th`, etc.) prefixed under `.page` parent class to prevent cross-template collision
- **Blank variants**: header/footer hidden via React inline `style` props instead of a second global `<style>` tag
- **Barrel exports**: group `index.ts` files + top-level `reference/index.ts`
- **Sample data types**: one `*DesignTypes.ts` per group with interfaces and sample constants
- **Preview component**: `ReferenceTemplatePreview.tsx` — dev-only, NOT routed

---

## Structure

```
reference/
├── assets/
│   └── almanar-logo.png          # Company logo (used as logo + watermark)
├── invoices/
│   ├── InvoiceDesign1.tsx         # Full letterhead variant
│   ├── InvoiceDesign1.module.css  # Scoped CSS (shared with Blank variant)
│   ├── InvoiceDesign1Blank.tsx    # Pre-printed paper variant (hdr/foot hidden)
│   ├── InvoiceDesign2–5 ...       # Same pattern × 4 more designs
│   ├── InvoiceDesignTypes.ts      # ReferenceInvoiceData interface + sample
│   └── index.ts                   # Barrel export
├── quotations/
│   ├── QuotationDesign1–3 ...     # 3 designs × (tsx + module.css + Blank)
│   ├── QuotationDesignTypes.ts
│   └── index.ts
├── purchase-orders/
│   ├── PurchaseOrderDesign1–2 ... # 2 designs × (tsx + module.css + Blank)
│   ├── PurchaseOrderDesignTypes.ts
│   └── index.ts
├── rfq/
│   ├── RFQDesign1–3 ...           # 3 designs × (tsx + module.css + Blank)
│   ├── RFQDesignTypes.ts
│   └── index.ts
├── ReferenceTemplatePreview.tsx   # Dev-only preview browser (NOT routed)
├── index.ts                        # Top-level barrel export
└── README.md                       # This file
```

---

## Assets

| File | Source | Use |
|------|--------|-----|
| `assets/almanar-logo.png` | Copied from `frontend/src/assets/almanar-logo.png` | Logo header + watermark (opacity via CSS) |

No remote images. No base64 blobs. No broken image references.

---

## CSS Isolation Strategy

**CSS Modules** (Vite-native `.module.css`, zero config required).

Each design family has one module file shared by its regular and blank variant:
- Class selectors (`.page`, `.hdr`, `.foot`, ...) are scoped automatically by Vite
- Standalone element selectors (`table`, `th`, `td`, etc.) are prefixed under `.page` in the module file so they scope correctly
- Blank variants reuse the same module; header/footer visibility is controlled by React `style` props, not a second style tag
- `body { }` rules removed — the app's global CSS already sets font-family and base styles

Two templates can be rendered simultaneously on the same page without CSS collision.

---

## Developer Preview

To visually verify templates without routing them:

```tsx
// Temporary dev page — do NOT commit
import ReferenceTemplatePreview from 'frontend/src/print-templates/reference/ReferenceTemplatePreview';

export default function DevSandbox() {
  return <ReferenceTemplatePreview />;
}
```

The preview renders a sidebar with all 26 templates and a scaled A4 canvas on the right.

---

## Template Status

| Template | CSS Module | Asset Wired | Phase |
|----------|-----------|-------------|-------|
| InvoiceDesign1 / Blank | InvoiceDesign1.module.css | ✓ | 1.5 |
| InvoiceDesign2 / Blank | InvoiceDesign2.module.css | ✓ | 1.5 |
| InvoiceDesign3 / Blank | InvoiceDesign3.module.css | ✓ | 1.5 |
| InvoiceDesign4 / Blank | InvoiceDesign4.module.css | ✓ | 1.5 |
| InvoiceDesign5 / Blank | InvoiceDesign5.module.css | ✓ | 1.5 |
| QuotationDesign1 / Blank | QuotationDesign1.module.css | ✓ | 1.5 |
| QuotationDesign2 / Blank | QuotationDesign2.module.css | ✓ | 1.5 |
| QuotationDesign3 / Blank | QuotationDesign3.module.css | ✓ | 1.5 |
| PurchaseOrderDesign1 / Blank | PurchaseOrderDesign1.module.css | ✓ | 1.5 |
| PurchaseOrderDesign2 / Blank | PurchaseOrderDesign2.module.css | ✓ | 1.5 |
| RFQDesign1 / Blank | RFQDesign1.module.css | ✓ | 1.5 |
| RFQDesign2 / Blank | RFQDesign2.module.css | ✓ | 1.5 |
| RFQDesign3 / Blank | RFQDesign3.module.css | ✓ | 1.5 |

---

## Phase 2 — Planned (not started)

Phase 2 will add:

- **Template selector** — UI to choose design at print time
- **Props / data binding** — replace sample constants with real invoice/quotation/PO/RFQ data
- **Print Profiles integration** — plain-a4 vs letterhead switching
- **QR code** — supplier/customer/contract QR
- **Language / locale** — dynamic Arabic/English field values
- **InvoicePreview integration** — wire to existing Invoices page print flow
- **Quotation / PurchaseRequest integration** — wire to existing forms
- **Signature / stamp fields** — dynamic signatory names
