# Invoice Fast Entry Mode v1 — Functional Specification (Design Only)

> **Status:** Specification / design phase. **No implementation.** This document defines *what* to build and *why*; it is not an implementation plan.
> **Scope:** Invoices module only. A UX accelerator for entering many invoices quickly. Internally identical to creating normal invoices one-by-one.
> **Lineage:** Follows the philosophy of Expenses Fast Monthly Entry, ExplorerKit Information Hub, Universal Export File Naming, and Global Date Presentation Standardization.
> **Date:** 2026-07-07 · **Baseline:** production `40e7f82` (post `stable-expenses-operations-enhancement-v1`).
> **Revision:** v2 — incorporates the approved review comments: explicit Entry Mode selector (§2.2a, §4), always-on auto-suggested invoice number (§2.6), non-intrusive success toast (§2.4a), expanded session summary with last/next number (§2.2 Region C), and FastEntrySession kept independent with its future API documented (§5).
> **Revision:** v3 — adds an explicit Fast Entry Session Lifetime definition (§1.6), the Fast Entry Framework architectural-direction note (§5.5), and a deferred "Resume Current Fast Entry Session" future enhancement (§10). No v1 scope change.

---

## 0. Grounding — how invoice creation actually works today

All design below is anchored to the *current* invoice architecture (verified in code, not assumed).

**Live create payload (what `POST /invoices` actually persists)** — from `CreateInvoice` in `frontend/src/pages/Invoices.tsx` (`submit`, ~728-770) → `invoices.service.create()` (209-287):

| Posted on create | Not posted by the current form (schema default applies) |
|---|---|
| `invoiceNumber` (`MN-INV-{year}-{suffix}`), `direction`, `invoiceType`, `customerId` **or** `supplierId`, `issueDate`, `deliveryDate`, `billingMonth`, `billingYear`, `discount`, `items[]` | `taxRate` (→ 0), `paymentMethod`, `dueDate`, `contractId` (UI-only), `notes`, `number` (server mirrors `invoiceNumber`) |

Facts that drive this spec:

1. **Numbering is client-supplied.** The form builds `MN-INV-{year}-{suffix}` from a year `<select>` + a free-text suffix; the DB `@@unique` on `number`/`invoiceNumber` (P2002) is the only guard. The service's `generateNumber()` (count-based, per-direction `INV-`/`PINV-`) is **dead code** — no call site — and carries a `count()` collision risk if ever wired up. There is **no server auto-numbering in the live path.**
2. **Totals are server-authoritative.** `computeTotals(items, taxRate, discount)` (`invoices.calc.ts`) recomputes `subtotal → taxable → taxAmount → total` with 3-decimal (KWD) rounding; client line totals are ignored.
3. **Creation posts accounting immediately, inside one transaction.** SALES posts a legacy `Transaction` (REVENUE) **and** the new double-entry GL journal at create. PURCHASE also posts at create and additionally exposes an idempotent `approve()` (`invoices.approve`); a PURCHASE paid by `CASH`/`BANK` is created already `PAID`.
4. **Customer selection drives pricing context.** Choosing a customer fetches `GET /prices/for-invoice?customerId=` (price agreements) and `GET /contracts?customerId=` (contract list), and **resets item prices**. `contractId` narrows the price agreements shown but is not persisted on create.
5. **The invoice "row" is a nested sub-form**, not flat fields: 1..N line items (workType → composed `description`, quantity, unit, unitPrice with a per-line price-agreement picker) plus an invoice-level `discount`.
6. **Permission:** `invoices.create`. **No `salesperson` or `project` field exists** on the invoice model.

**Reference implementation to mirror:** the shipped Expenses Fast Monthly Entry — `frontend/src/components/FastMonthlyExpenseDialog.tsx` + pure helpers `frontend/src/pages/fastExpenseEntry.ts` (Save & Next / Finish / Cancel, `Ctrl+Enter` shortcuts, shared-vs-`PER_ROW` sentinel, display-only session summary, dirty-close guard).

---

## 1. Functional Specification

### 1.1 Purpose
Provide a single dialog in which a user issues many invoices back-to-back without re-entering the fields that stay constant across a session. Each saved invoice is a **completely normal invoice**: normal number, normal list appearance, normal approval/payment/accounting lifecycle, indistinguishable from one made on the existing screen.

### 1.2 Hard invariants (non-negotiable)
- Every save calls the **existing `POST /invoices` create path** (existing service, validation, `computeTotals`, GL posting, permissions). No new create logic.
- **No** parent/batch record, batch id, hidden grouping, special status, or special accounting.
- One save = one independent invoice. Failure of one row never corrupts or groups others.
- Fast Entry is gated by the same `invoices.create` permission as the normal create.

### 1.3 Scope of invoice kinds (v1)
- **In scope:** `SALES` invoices (the bulk case: many customer delivery invoices). `direction` is a **shared session field**.
- **Supported by the same mechanism, secondary:** `PURCHASE` (party becomes supplier; `paymentMethod` becomes relevant for auto-PAID). Recommended to enable once SALES is validated — the only added session field is a shared `paymentMethod`.
- **Out of scope v1:** custom/`OTHER` direction and custom party-type.

### 1.4 Session lifecycle (functional)
1. User opens Fast Entry from the Invoices page and **chooses an Entry Mode** — *Single Customer* (default) or *Multiple Customers* (§2.2a / §4). The chosen mode is displayed prominently for the whole session.
2. A dialog opens with **Shared Session Fields** pre-populated with sensible defaults, including an **auto-suggested invoice number** (never empty — §2.6).
3. User fills the **Invoice Entry Area** (line items + row-level fields) for one invoice.
4. **Save & Next** → creates the invoice via `POST /invoices`; on success shows a **non-intrusive success toast** (§2.4a), clears only row-specific fields, **advances the suggested invoice number**, updates the **Session Summary** (including *last* and *next* number), and refocuses the first row input. Shared fields (and the chosen mode) persist.
5. Repeat steps 3–4 any number of times.
6. **Save & Finish** → creates the current invoice, then closes and refreshes the invoice list.
7. **Cancel/Close** → discards only the *current unsaved* row (after a dirty confirm); all previously saved invoices remain as normal invoices.

### 1.5 Validation (functional)
- Each row is validated **individually** with the *same rules as normal creation* (mirror client-side, enforce server-side): ≥1 line item, positive quantities, non-negative prices, a party present (customer for SALES), and a well-formed unique invoice number.
- A failed save shows the same error as the normal form, **keeps the dialog open, preserves all entered data**, and does not advance the number or summary.
- Server remains the source of truth for totals and uniqueness; the client never posts computed totals.

### 1.6 Fast Entry Session Lifetime
The "session" is a **purely temporary UI construct** with no backing data model. Precisely:

- **The Fast Entry Session exists only while the Fast Entry dialog is open.**
- **Closing the dialog ends the session** — via Save & Finish, Cancel/Close, or navigating away.
- **Previously saved invoices remain ordinary invoices**, fully independent of the session that created them.
- **No batch object exists.** **No session record exists.** **Nothing about the session is persisted to the database.**
- **No accounting state depends on the session** — each invoice's posting is complete and self-contained at its own save.
- The shared session fields, chosen Entry Mode, running summary, and suggested next number live **only in component state** for the dialog's lifetime and vanish when it closes.

This lifetime definition is a hard invariant: any future enhancement (e.g., §10) must not violate it by introducing a persisted or accounting-bound session.

---

## 2. UX Specification

### 2.1 Entry point
- A **secondary** button `إدخال فواتير سريع` beside the existing `فاتورة جديدة` on the Invoices page header (mirrors `تسجيل مصروفات شهرية` on Expenses). Visible when the user has `invoices.create`.

### 2.2a Step 0 — Explicit Entry Mode selector (first thing the user sees)
Before any fields, the dialog presents a clear, unmissable choice:

> **اختر نمط الإدخال — Choose Entry Mode**
> ○ **عميل واحد — Single Customer** *(موصى به / Recommended)*
> ○ **عملاء متعددون — Multiple Customers**

- **Single Customer:** the customer is selected **once**; the customer field then **disappears entirely from every invoice** and stays fixed for the whole session.
- **Multiple Customers:** the customer becomes a **normal per-invoice field**; **all other shared session fields remain fixed**.

The selected mode must remain **obvious throughout the session** — e.g., a persistent mode badge/chip in the dialog header (`عميل واحد: <name>` or `عملاء متعددون`) so the user always knows which mode is active. Switching mode mid-session is allowed but requires confirmation if the current row is dirty (it changes where the customer field lives). See §4 for the full analysis; this selector is the concrete UX realization of that recommendation.

### 2.2 Layout — ExplorerKit dialog, three regions
Use an **ExplorerKit `Dialog`** (size `lg`/`xl`) with `DialogSection`s, consistent with `FastMonthlyExpenseDialog` and the Information Hub language (the legacy `CreateInvoice` Modal styling is *not* the target; see §3.4). After the Entry Mode selector (§2.2a), reading order (RTL):

**Region A — Shared Session Fields** (pinned, `push_pin` icon section):

| Field | Rationale for being shared |
|---|---|
| **Direction** (SALES/PURCHASE) | A session is one direction; also selects party type + posting path. |
| **Invoice type** (`نقل اسفلت` / …) | Rarely changes within a batch. |
| **Issue date** (+ auto-derived `billingMonth`/`billingYear`) | Same reuse as the normal form; billing period derives from it. |
| **Customer** *(Single Customer mode)* + **Contract** *(price-filter, UI-only)* | Highest-value shared field; keeps the price-agreement + contract context loaded once. See §4. |
| **Invoice-number year** (prefix `MN-INV-{year}`) | The year segment is constant; only the suffix advances. See §2.6. |
| **Notes prefix** *(optional)* | Optional convenience; prepended to each row's notes if used. |
| **Payment method** *(PURCHASE only)* | Drives PURCHASE auto-PAID; hidden for SALES. |

> `taxRate`, `dueDate` are **not** in the current create form and are omitted from v1 shared fields to preserve "identical to the normal screen." If a future package adds tax to the normal form, tax mode becomes a natural shared field.

**Region B — Invoice Entry Area** (per-invoice, `receipt_long` section): the **existing line-item editor** (workType, location autocomplete → description, quantity, unit, unitPrice + price-agreement picker, add/remove row), the invoice-level **discount**, a **delivery date**, the **auto-suggested, editable invoice number** (§2.6), an optional **row notes** field, and — in **Multiple Customers** mode only — the **customer (+ contract)** selector. A **live financial summary** (subtotal / discount / total) computed the same way the current form previews it.

**Region C — Session Summary** (display-only, `summarize` section) — **nothing here is persisted as any entity**:

| Metric | Example |
|---|---|
| Invoices entered (count) | `12` |
| Session total (Σ amounts) | `4,250.000 د.ك` |
| Latest customer | `شركة …` |
| Latest amount | `320.000 د.ك` |
| **Last invoice number** | `MN-INV-2026-00152` |
| **Next suggested invoice number** | `MN-INV-2026-00153` |

Rendered as a compact card block (`الأخير / Last` above `التالي / Next`) so the user always sees exactly what was just created and what will be created next.

### 2.3 Save controls (footer)
`حفظ وإضافة التالي` (primary) · `حفظ وإنهاء` (secondary) · `إلغاء` (ghost) — identical semantics to the expense dialog.

### 2.4 Reset-on-next behavior
On **Save & Next**, **reset**: all line items (back to one default row), discount, delivery date, row notes, and — in **Multiple Customers** mode — customer/contract. **Preserve**: every Shared Session Field and the chosen Entry Mode. **Advance** the auto-suggested invoice number to the next value. Refocus the first line-item input.

### 2.4a Non-intrusive success feedback
Save & Next must **never interrupt the workflow** — no blocking dialog, no confirmation window, no modal. On a successful create, show a **lightweight success toast** and immediately prepare the next invoice:

> ✓ تم إنشاء الفاتورة MN-INV-2026-00152 بنجاح
> ✓ Invoice MN-INV-2026-00152 created successfully

Use the existing shared toast store (the same one Expenses/Invoices already use). The toast auto-dismisses; focus moves straight to the next invoice's first field. On **Save & Finish**, a single summary toast (e.g., `تم حفظ N فاتورة`) is optional. Errors still surface inline in the dialog (§1.5), not as toasts, so the failing row and its data stay visible.

### 2.5 Keyboard workflow
- `Ctrl+Enter` → Save & Next · `Ctrl+Shift+Enter` → Save & Finish · `Esc` → Cancel/Close (with dirty confirm if the current row has data).
- Auto-focus: on open → first meaningful row input (or customer, in Multiple Customers mode); after Save & Next → first line-item input.
- Tab order: shared fields → row fields (item grid row-major) → discount → number suffix → footer. Enter inside a numeric line field should not submit the browser default; explicit shortcuts drive saving.

### 2.6 Invoice number handling — always auto-suggested (the decisive UX detail)
Because numbers are **client-supplied**, Fast Entry must **never start with an empty invoice number** and must not force the user to type a suffix every time. Required v1 behavior:

- **Always auto-suggest the next full number.** On open, and again after every successful save, the invoice-number field is **pre-filled** with the next value for the chosen `MN-INV-{year}` prefix (e.g., `MN-INV-2026-00152`). The field is never blank.
- **Editable.** The user may override the suggestion at any time. If they do, the **existing validation rules apply unchanged** (the `MN-INV-YYYY-<alnum>` format regex + DB uniqueness) — Fast Entry adds no new numbering rules.
- **Collision-safe strategy.** The suggestion derives from the **highest existing number** for that year/prefix (max-based), never a `count()` (which collides across gaps/deletions). On a uniqueness collision at save (P2002 → "رقم الفاتورة مُستخدم من قبل"), the dialog **keeps the row**, surfaces the error inline, and **re-suggests the next free number**.
- **Reuse existing numbering wherever possible.** Preferred realization: a small **additive, read-only** `GET /invoices/next-number?year=&direction=` endpoint that computes the next number with the collision-safe **max-based** scan — the same pattern already proven in the expenses/transactions numbering fix (explicitly **not** the dead `count()`-based `generateNumber`, which should be fixed to max-based or left unused). This centralizes the logic server-side and removes client race ambiguity. If that endpoint is declined for v1, the fallback is a client-side "max-of-existing + 1, editable, P2002-guarded" computation, acceptable for this offline, single-instance desktop app. **Either way the field is always pre-filled and always editable.**

### 2.7 Accessibility / consistency
- RTL, Arabic-first labels; reuse ExplorerKit `xpl-*` controls and the shared `SearchableSelect` for any long pick lists (e.g., customer).
- Money via the shared formatter; dates via the shared `dateText` (DD/MM/YYYY, English digits) per the Global Date standard.

---

## 3. Architecture Proposal

### 3.1 Reuse map (maximize reuse, avoid duplication)
| Concern | Reuse |
|---|---|
| Invoice creation | **Existing `POST /invoices`** → `invoices.service.create()` (validation, `computeTotals`, GL posting, numbering-uniqueness, permission). **No changes.** |
| Line-item editor | **Existing** `CreateInvoice` item-grid logic (workType/location/unit/price-agreement picker). Extract into a reusable subcomponent so both the normal form and Fast Entry share one editor (see §3.4). |
| Price agreements / contracts | Existing `GET /prices/for-invoice`, `GET /contracts` and the existing customer-change reset logic. |
| Totals preview | Existing client preview math (mirrors server `computeTotals`). |
| Customer selector | Existing selector; upgrade to shared `SearchableSelect` for speed. |
| Dialog shell, summary cards | ExplorerKit `Dialog` / `DialogSection` / `Button`. |
| Session mechanics | The proven pattern from `fastExpenseEntry.ts` + `FastMonthlyExpenseDialog` (see §5). |
| Money / date formatting | Shared `money` / `dateText`. |

### 3.2 New surface (frontend-only in the minimal variant)
- `InvoiceFastEntryDialog` (ExplorerKit) — the session shell + regions A/B/C.
- A pure, testable `invoiceFastEntry.ts` helper module: `InvoiceSharedFields`, `InvoiceRowFields`, `buildInvoiceCreatePayload(shared,row)` (byte-identical to the normal `submit` payload), `validateInvoiceRow(row)`, `makeEmptyRow()`, `nextSuffix(current)`, `addToSummary(...)`, `isRowDirty(row)` — the same shape as `fastExpenseEntry.ts`, so it is unit-testable without the DOM.
- A shared **`InvoiceLineItemsEditor`** subcomponent (extracted from `CreateInvoice`).

### 3.3 Optional backend addition (only if §2.6 helper is adopted)
- A read-only `GET /invoices/next-number` (auth + `invoices.create`) returning a collision-safe next suffix. Additive, no schema/migration, no posting change. **Not** required for v1.

### 3.4 ExplorerKit vs the legacy invoice Modal
The current `CreateInvoice` uses the legacy `Modal`, not ExplorerKit. Fast Entry should adopt ExplorerKit (consistent with Expenses Fast Entry + Information Hub) **without** rewriting the normal create form. The clean seam is extracting the **line-item editor** into a shared subcomponent used by both, so Fast Entry gets the ExplorerKit shell while the item-editing behavior stays single-sourced.

---

## 4. Customer Mode Recommendation

**Recommendation: Support both modes, surfaced as an explicit *Choose Entry Mode* selector (§2.2a) — *Single Customer* (default/recommended) and *Multiple Customers* — chosen as the first step and shown prominently for the whole session.** (This is the concrete realization of the earlier "Option C" recommendation, now made explicit per review.)

### 4.1 Why not Single-only or Multiple-only
- **Single only** is fastest and simplest but blocks the real "many customers in one day" workflow.
- **Multiple only** handles multi-customer but is *slower per row*: because customer drives the price-agreement + contract fetch and **resets item prices**, a per-row customer change re-loads pricing context every invoice — eroding the acceleration Fast Entry exists to provide, and it removes the biggest win (a stable, pre-loaded price context) for the common same-customer batch.

### 4.2 Why both, defaulting to Single
- Real usage spans both: bulk delivery invoices for one big customer (Single), and a day's mixed billing (Multiple).
- The pattern is **already proven and cheap** — the expense dialog implements exactly this via a shared value plus a `PER_ROW` sentinel for supplier. Invoice reuses that shape for customer, but promoted to an **explicit, obvious mode choice** rather than a hidden sentinel (per review comment #1).
- Accounting is **identical either way**: each invoice still stores its own `customerId`; the mode only decides *where the field lives* (fixed for the session vs per-invoice). Zero accounting implication.

### 4.3 UX of the two modes (via the §2.2a selector)
- **Single Customer** (default): the customer (+ optional contract) is selected once in Region A; the price context loads once; **the customer field is absent from every invoice** in Region B. A header chip shows the fixed customer for the whole session.
- **Multiple Customers:** the customer (+ contract) becomes a **normal per-invoice field** in Region B; **all other shared fields stay fixed**. On customer change, reuse the existing reset-prices + refetch behavior and **disable Save until the price context has loaded** to prevent applying stale/empty prices. The suggested number and all shared fields persist across saves.

### 4.4 Trade-off summary
| Axis | Single Customer (default) | Multiple Customers |
|---|---|---|
| Speed | Highest (price context cached) | Lower (per-invoice refetch) |
| UX complexity | Minimal | Moderate (loading state per invoice) |
| Accounting | Identical | Identical |
| Impl effort | Low | +price-context-per-invoice handling |
| Extensibility | — | Natural superset |

Default to Single Customer; let the user pick Multiple Customers up front. Both ship in v1 because the incremental cost over Single is small and the pattern is battle-tested.

---

## 5. FastEntrySession Abstraction Evaluation

**Recommendation (agreed at review): Do *not* extract a shared framework for v1. Build Invoice Fast Entry independently, mirroring the expense pattern. Keep the proposed `useFastEntrySession` hook/component API documented below as the **future architectural direction**, and defer extraction until a **third** Fast Entry implementation exists — at which point the boundary is validated by three real consumers, not speculation.**

### 5.1 What is genuinely generic (identical across expense + invoice)
Session state container (shared fields + current row + summary), Save&Next/Finish/Cancel orchestration, dirty detection, `Ctrl+Enter`/`Ctrl+Shift+Enter`/`Esc` handling, focus restoration, and display-only summary accumulation.

### 5.2 What is genuinely domain-specific (divergent)
- **Row body:** expense = flat fields (one POST of scalars); invoice = a nested **line-items grid + discount + price-agreement picker + customer-driven price context**. These are not the same "row."
- **Payload builder / validator:** trivial for expense; multi-item and party-aware for invoice.
- **Post-save session side effects:** invoice must **advance a client-supplied number** and (Multiple Customers mode) **reset price context**; expense has neither.

### 5.3 Why staged — defer until a third consumer
- **Rule of three, honestly applied:** expense is the first consumer; invoice will be the **second**. The invoice case already introduces session concerns the expense version never needed (client-supplied number advancement, per-invoice price-context loading gates), which proves the two shapes differ in non-trivial ways. Extracting at two consumers risks freezing the boundary around just those two; **waiting for a third** implementation lets the truly stable seam emerge before it is codified.
- **Protect shipped features:** the expense Fast Entry is released and Gemini-approved. Refactoring it into a new abstraction now — or when invoice ships — adds regression surface on production code for no user-visible gain. Two independent, well-tested copies are cheaper and safer than one premature abstraction.
- **The seam is documented, not built:** §5.4 records the intended API so the direction is preserved; it is a design note, not a v1 deliverable.

### 5.4 Target (future) hook shape — documented direction only, **not v1**, extract at the third consumer
```
useFastEntrySession({
  initialShared, makeEmptyRow, validateRow, buildPayload,
  createRequest, onAfterSave?, isRowDirty,
}) → { shared, row, summary, saving, error,
       saveAndNext, saveAndFinish, requestClose, keyboardProps, focusRow }
```
When a **third** Fast Entry surface appears, deliver this as **Fast Entry Framework v1** and migrate expense + invoice + the third consumer together. Until then, invoice Fast Entry remains an independent implementation that mirrors — but does not share code with — the expense implementation.

### 5.5 Architectural direction — the "Fast Entry Framework" family (long-term only)
Invoice Fast Entry Mode is intended to become one member of a future design family called the **Fast Entry Framework** — a consistent, accelerator-style entry pattern across high-volume operational documents. Anticipated members:

- **Expenses Fast Entry Mode** *(shipped)*
- **Invoice Fast Entry Mode** *(this spec)*
- **Receipt Voucher Fast Entry** *(future)*
- **Payment Voucher Fast Entry** *(future)*
- **Purchase Order Fast Entry** *(future)*

**This is a long-term architectural direction only.** It does **not** require creating a shared framework or reusable implementation in v1. Consistent *UX and behavior* (shared fields + repeating row, Save & Next/Finish/Cancel, keyboard shortcuts, display-only session summary, non-intrusive success feedback) is the near-term goal; *code sharing* is not. Per §5.3–§5.4, **`FastEntrySession` extraction remains deferred until there are at least three mature implementations** — at which point the framework is designed against three real consumers rather than speculation. Until then, each Fast Entry surface is built independently, mirroring the established pattern.

---

## 6. Risk Analysis

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Number collisions** — client-supplied numbers + rapid entry; auto-suggested suffix could race or be edited into a duplicate. | Med | Pre-fill "max+1" suffix, DB P2002 guard, on-collision keep the row + re-suggest. Prefer the optional read-only `next-number` helper (collision-safe, max-based) — never the dead `count()`-based `generateNumber`. Offline single-instance app makes true races unlikely. |
| R2 | **Mid-session save failure loses data** (duplicate number, DB error, GL posting error). | High | Same recovery as expense Fast Entry: keep dialog open, show the exact error, preserve the entered row, do not advance number/summary. Server transaction already makes each create atomic (all-or-nothing). |
| R3 | **Stale price context (Multiple Customers mode)** — applying prices before the new customer's agreements load. | Med | Reuse existing reset-prices-on-customer-change; gate Save until price fetch resolves; allow manual prices. |
| R4 | **PURCHASE auto-PAID surprise** — cash/bank purchases post as PAID immediately. | Low | v1 focuses on SALES; when PURCHASE is enabled, `paymentMethod` is a visible shared field and the summary reflects PAID status. |
| R5 | **GL side effects per save** — each save posts legacy + GL journal in a transaction. | Low (by design) | This is the intended "as if created one-by-one" behavior; nothing to change. Confirm no per-save UI assumes a draft state. |
| R6 | **Item-editor extraction regression** — sharing the editor between the normal form and Fast Entry. | Med | Extract behavior verbatim into `InvoiceLineItemsEditor`, cover with the existing invoice-payload tests, and verify the normal create form is byte-identical after extraction. |
| R7 | **Divergence from "normal invoice"** — a subtle payload difference makes Fast Entry invoices special. | High | `buildInvoiceCreatePayload` must be unit-tested to equal the normal `submit` payload field-for-field (same guarantee the expense pack proved for `buildFastExpensePayload`). |
| R8 | **Premature abstraction** (see §5). | Med | Ship invoice independently; defer the framework. |
| R9 | **Scope creep** toward templates/recurring/batch. | Med | Explicit non-goals (§9); session summary strictly display-only. |

---

## 7. Scope Definition

**In scope (v1):**
- A single ExplorerKit Fast Entry dialog on the Invoices page (`invoices.create`-gated).
- SALES invoices; PURCHASE via the same direction toggle (recommended fast-follow).
- Shared session fields (§2.2), per-invoice entry area reusing the existing item editor (§2.2/§3.1), display-only session summary.
- Save & Next / Finish / Cancel with keyboard shortcuts and dirty guard.
- Explicit Entry Mode selector — Single Customer (default) + Multiple Customers (§2.2a / §4).
- Always-on auto-suggested, editable invoice number (§2.6); non-intrusive success toast after Save & Next (§2.4a); session summary incl. last + next number (§2.2 Region C).
- Pure `invoiceFastEntry.ts` helpers + tests proving payload/validation parity with the normal create.
- Optional (only if chosen): read-only `GET /invoices/next-number` helper.

**Reused unchanged:** invoice create service, validation, `computeTotals`, GL/posting, numbering uniqueness, permissions, price agreements/contracts, customer selector, ExplorerKit controls, money/date formatters.

---

## 8. Implementation Strategy (high-level approach — *not* a build plan)

Strategic sequencing and principles only; concrete task breakdown belongs to a later planning phase.

1. **Prove parity first.** The linchpin is `buildInvoiceCreatePayload` returning exactly the normal-form payload. Establish this (and `validateInvoiceRow`) as pure, tested helpers before any UI — the same approach that de-risked the expense pack.
2. **Extract the item editor** into a shared subcomponent, verifying the existing create form is unchanged, so Fast Entry and the normal form stay single-sourced.
3. **Build the ExplorerKit shell** (Entry Mode selector §2.2a + regions A/B/C) around the shared editor and helpers, mirroring `FastMonthlyExpenseDialog` for session mechanics (Save&Next/Finish/Cancel, shortcuts, dirty guard, success toast, summary with last/next number).
4. **Implement Single Customer mode first** (fastest path, stable price context), then layer **Multiple Customers mode** using the proven `PER_ROW` pattern (promoted to the explicit mode selector) with a Save-gate during price loading.
5. **Numbering:** always pre-fill the next number (never empty), editable, collision-safe (max-based); prefer the small additive read-only `next-number` endpoint, else the client-side "max+1, editable, P2002-guarded" fallback (§2.6).
6. **Do NOT extract the framework.** Build invoice Fast Entry as an independent implementation mirroring expense; leave `useFastEntrySession` (§5.4) as documented direction to be delivered only when a **third** Fast Entry consumer appears.
7. **Testing strategy:** unit tests for payload/validation/summary/number-suffix parity; behavioral verification that a Fast-Entry invoice is indistinguishable from a normal one (number, list, status, GL entries); confirm error-recovery preserves data on a forced collision.
8. **Rollout:** Feature mode — checkpoint tag, feature branch, standard validation + Gemini review; no accounting/API/workflow changes to approve beyond the optional additive `next-number` endpoint.

---

## 9. Explicit Non-Goals

Not in this feature (future packages only):
- Invoice import (Excel/CSV) · recurring invoices · scheduled invoices · invoice templates.
- Parent/batch invoices · batch posting · any batch entity, id, status, or hidden grouping.
- Accounting redesign · posting redesign · approval redesign · reporting redesign · API redesign.
- Adding tax/payment-method/due-date/salesperson/project to the invoice model or the normal form.
- Rewriting the existing `CreateInvoice` form (only the item editor is extracted, behavior-preserving).
- Forcing the `FastEntrySession` abstraction in v1 (§5).

---

## 10. Deferred / Future Enhancements (post-v1)

These are documented for direction only. **None are part of v1.**

### 10.1 Resume Current Fast Entry Session — **Deferred from v1**
If the Fast Entry dialog is **accidentally closed during the same application session**, the application *may optionally* offer to restore the previous Fast Entry session, so the user does not lose their pinned context.

**Scope of any future restore (strict):**
- **Restore only:** the shared session fields, the selected Entry Mode, and transient UI state (e.g., suggested next number).
- **Do NOT restore already-saved invoices** — they already exist as normal invoices.
- **Do NOT restore partially-saved / in-progress row data.**
- **Do NOT persist anything to the database.**
- **Do NOT survive an application restart** — any retained state lives only in in-memory application/session scope and is discarded when the app closes.

This must honor the §1.6 lifetime invariant (no persisted or accounting-bound session). It is a convenience-only, in-memory affordance.

**Status: Deferred from v1.** Not designed, not scheduled here.

---

*End of specification. No code, no implementation, and no implementation plan are included by design. Next phase (if approved): detailed planning for Invoice Fast Entry Mode v1.*
