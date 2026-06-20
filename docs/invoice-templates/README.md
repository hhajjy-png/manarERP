# Invoice Template Reference Package

> **These templates are reference assets only.**
> They must NOT be used directly in production.
> The future production implementation will recreate these layouts as React print templates
> integrated with manarERP, data-bound to Invoice entities.

---

## Status

| | |
|---|---|
| **Type** | Design reference — documentation only |
| **Production use** | Not permitted |
| **Connected to backend** | No |
| **Connected to frontend** | No |
| **Safe to open in browser** | Yes — fully self-contained |

---

## Five Available Designs

| File | Style |
|------|-------|
| `html/design1.html` | Classic — two-tone header, traditional Arabic invoice layout |
| `html/design2.html` | Modern — clean lines, accent stripe |
| `html/design3.html` | Corporate — full-width header with logo |
| `html/design4.html` | Minimal — white space, subtle borders |
| `html/design5.html` | Bold — dark header, high-contrast typography |

Open any file directly in a browser — no server required.
All fonts, styles, and layout are fully self-contained.

---

## Approved Modifications (v1.0 — 2026-06-20)

**Design 1:**
- Header and content moved upward
- Date field placed above "المطلوب من السيد"
- Table cells centered
- Footer ("المحاسبة" / "المسؤول") visible

**Designs 2–5:**
- VAT section removed
- Payment Terms: "السداد خلال 30 يوماً من تاريخ الفاتورة."
- Notes area left blank for handwriting

See [CHANGELOG.md](./CHANGELOG.md) for full verification record.

---

## Fonts

Cairo (Arabic/Latin, weights 400–600–700–800) embedded as base64 data URIs.
No CDN. No internet required. Works offline on any machine.

Source font files: `source/fonts/*.woff2`

---

## Source Files

| File | Purpose |
|------|---------|
| `source/common.py` | Shared rendering utilities |
| `source/data.py` | Sample invoice data for previews |
| `source/d1.py` – `d5.py` | Per-design HTML generators |
| `source/generate_all.py` | Batch renderer — regenerates all 5 |
| `source/render.py` | Single-design render entry point |
| `source/setup_fonts.sh` | Font download helper |
| `source/logo_tight.png` | Company logo (tight crop) |
| `source/logo_transparent.png` | Company logo (transparent background) |
| `source/README.md` | Source package notes |

---

## Screenshots

`screenshots/p_design*.png` — rendered preview of each design at A4 size.

---

## Future Integration — Invoice Templates

> **Do not implement now.** Document only.

These templates will later become production print templates in manarERP.
The integration will work as follows:

- **React print templates** — each design reimplemented as a React component inside `frontend/src/pages/InvoicePreview.tsx` (or a dedicated `frontend/src/pages/invoices/print/` folder)
- **Data-bound to Invoice entities** — all fields (customer, date, items, totals, notes) populated from the Invoice API response, not hardcoded
- **Compatible with Print Profiles** — the existing print profile system (A4, letter, custom margins) will control page layout and paper size
- **Multiple invoice layouts** — users will be able to select which of the five designs to use per invoice or globally via settings
- **Invoice template selection** — a future Settings page will allow admins to set the default invoice layout per company
- **Fully offline** — no CDN, no remote font loading; fonts bundled in the production build
- **Cairo / IBM Plex Sans Arabic ready** — the React implementation will support both Cairo (current brand) and IBM Plex Sans Arabic as a future alternative

---

## Future Integration — Quotation & Purchase Request Forms

> Added 2026-06-20 as part of Forms & Operations Polish Pack v3.

Two standalone print forms were added in Pack v3 that use hardcoded fields instead of backend entities. This section documents how they should eventually be integrated.

### Quotation (`/forms/quotation`)

**Current state (Pack v3):** Standalone form with manually-entered customer name, contact, phone, project description, and items. No backend connection. Data lives in React state only — not persisted.

**Integration contract (future):**

| Current field | Future data source | Notes |
|---|---|---|
| `customerName` | `customerId` → `GET /customers/:id` | Replace text input with customer selector |
| `contactPerson` | Customer entity `.contactPerson` | Derived from customer record |
| `phone` | Customer entity `.phone` | Derived from customer record |
| `project` | `projectId` → future Projects module | Replace text input with project selector |
| `currency` | Settings or per-customer default | Keep local state as override |
| `items[]` | React state only | No change — items are quotation-specific |

**Backend requirements:**
- No new tables needed for the form itself
- A future `Quotation` model (with status: `draft | sent | approved | rejected`) would enable saving and tracking quotations
- `formNumber` (currently `QTN-YYYY-XXXX`) should be replaced with a server-generated sequence

**Print integration:**
- The template already uses `FormLayout` with `ProfileId` — fully compatible with the Print Profile system
- Language toggle (AR/EN) is already implemented

### Purchase Request (`/forms/purchase-request`)

**Current state (Pack v3):** Standalone form with manually-entered requester name, department, date, priority, and items. No backend connection.

**Integration contract (future):**

| Current field | Future data source | Notes |
|---|---|---|
| `requesterName` | `employeeId` → `GET /employees/:id` | Replace text input with employee selector |
| `department` | Employee entity `.department` | Derived from employee record |
| `requestDate` | Default to today | Keep as override |
| `priority` | `PriorityLevel` enum | Keep as-is |
| `items[]` | React state only | No change — items are request-specific |

**Backend requirements:**
- A future `PurchaseRequest` model with status workflow (`draft | submitted | approved | rejected | ordered`) would enable tracking
- Approval section (Requester / Department Head / Purchasing) maps to a future multi-step approval workflow
- `formNumber` (currently `PR-YYYY-XXXX`) should be server-generated

**Print integration:**
- Same as Quotation — already uses `FormLayout`, `ProfileId`, language toggle

---

## Origin

Generated by Claude as part of the manarERP invoice system design phase.
Finalized and exported 2026-06-20.
Imported into the repository as a design reference package on branch `feature/invoice-template-references`.
