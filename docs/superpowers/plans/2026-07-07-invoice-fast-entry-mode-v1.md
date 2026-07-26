# Invoice Fast Entry Mode v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **This document is a plan only — no production code is written here.** Code steps are expressed as *contracts, signatures, and concrete test cases*; the executing engineer writes the implementation to satisfy them.

**Goal:** Add a UX-accelerator "Invoice Fast Entry" dialog that lets a user issue many invoices back-to-back, where each save creates a completely normal invoice through the existing `POST /invoices` path.

**Architecture:** Frontend-first, mirroring the shipped Expenses Fast Entry pattern (pure helper module + ExplorerKit dialog). Reuse the existing invoice create service, validation, `computeTotals`, GL posting, and permissions unchanged. One additive, read-only backend endpoint provides a collision-safe next invoice number. No shared "FastEntrySession" framework is extracted (deferred until a third consumer — spec §5).

**Tech Stack:** React 18 + TypeScript + Vite (frontend); Express + Prisma + Zod + Vitest (backend); ExplorerKit design system; shared `SearchableSelect`, `money`, `dateText`.

**Source spec:** `docs/superpowers/specs/2026-07-07-invoice-fast-entry-mode-v1-spec.md` (FINAL APPROVED, v3).

## Global Constraints

- **Arabic-first UI, English codebase.** Currency KWD, 3 decimals. Dates via shared `dateText` (DD/MM/YYYY, English digits). Money via shared `money`.
- **Reuse, don't rebuild:** `POST /invoices` (service `create`, `computeTotals`, GL posting, numbering uniqueness) is **unchanged**. Permission gate is the existing `invoices.create`.
- **No redesign of accounting, posting, reports, or approval.** No new invoice model, no batch entity, no session record, no persisted session (spec §1.6).
- **Byte-identical parity:** each fast-entry create posts **exactly** the field set the current `CreateInvoice` form posts (see Planning Decision PD-1).
- **Feature-mode workflow:** checkpoint tag → feature branch → per-task commits → validation → Gemini review → merge `--no-ff` → stable tag → PROJECT_STATE → push. **No auto-commit/merge/push.**
- **Backend path aliases** (`@core`, `@modules`, `@config`, `@shared`) compile via `build:back`.
- Frontend HashRouter; backend binds `127.0.0.1:48211`.

---

## Planning Decisions & Clarifications (confirm at plan review)

- **PD-1 — Notes deferred to preserve strict parity (RECOMMENDED).** The current `CreateInvoice` form does **not** post `notes`, `taxRate`, `paymentMethod`, `dueDate`, or `contractId`. To honor the spec's hard invariant ("indistinguishable from invoices created through the existing screen" / byte-identical payload, §1.2), **v1 Fast Entry posts the identical field set and omits the spec §2.2 optional "notes prefix / row notes."** If the user wants notes in Fast Entry, the normal create form must first be extended to post notes (separate package) — otherwise Fast Entry would produce invoices the normal screen cannot. **Recommendation: defer notes; keep parity.**
- **PD-2 — Include the read-only next-number endpoint (RECOMMENDED).** Spec §2.6 marks `GET /invoices/next-number` "preferred, optional." This plan **includes it** (Task 1) because it is additive, read-only, testable, and removes client race/format ambiguity, and because the live create path never used the dead `count()`-based `generateNumber`. The client keeps a fallback increment (Task 2) for resilience.
- **PD-3 — v1 direction scope = SALES.** `direction` is a pinned shared field defaulted to `SALES` (the bulk case). PURCHASE is a documented fast-follow (would add a shared `paymentMethod` + supplier party); **not built in v1.** Custom/`OTHER` direction is out of scope.
- **PD-4 — Item editor extraction is the top regression risk.** Task 3 extracts the line-item editor from `CreateInvoice` into a shared component with **zero behavior change** to the normal form, gated by existing tests + manual smoke. If review deems the extraction too risky for one PR, Task 3 may be split to its own branch/PR ahead of Tasks 4–5.

---

## File Structure

**Backend (additive, read-only — no schema/migration, no posting change):**
- Modify `backend/src/modules/invoices/invoices.service.ts` — add `getNextInvoiceNumber(year)`.
- Modify `backend/src/modules/invoices/invoices.controller.ts` — add `nextNumber` handler.
- Modify `backend/src/modules/invoices/invoices.routes.ts` — add `GET /next-number` (before `/:id`), gated `invoices.create`.
- Create `backend/src/modules/invoices/__tests__/invoices.nextNumber.test.ts`.

**Frontend:**
- Create `frontend/src/pages/invoiceFastEntry.ts` — pure helpers + types (mirrors `pages/fastExpenseEntry.ts`).
- Create `frontend/src/pages/__tests__/invoiceFastEntry.test.ts` — helper unit tests.
- Create `frontend/src/components/invoices/InvoiceLineItemsEditor.tsx` (+ move its CSS if needed) — extracted from `CreateInvoice`, behavior-preserving; consumed by both the normal form and Fast Entry.
- Create `frontend/src/components/InvoiceFastEntryDialog.tsx` — ExplorerKit dialog (Entry Mode selector + regions A/B/C + session mechanics).
- Modify `frontend/src/pages/Invoices.tsx` — (a) `CreateInvoice` consumes the extracted editor; (b) add `إدخال فواتير سريع` button + `fastEntry` state + dialog render.
- Reuse `frontend/src/utils/invoicePayload.ts` (`toInvoiceItemPayload`), `frontend/src/config` `money`, `frontend/src/lib` `dateText`, `SearchableSelect`, ExplorerKit `Dialog`/`DialogSection`/`Button`, `useToast`.

**Docs (release phase, not a code task):**
- Update `PROJECT_STATE.md` at release (own docs commit).

---

## Pre-flight (not a commit)

- [ ] Confirm on `production` synced with origin; create checkpoint tag `checkpoint/invoice-fast-entry-v1-<shortsha>` and branch `feature/invoice-fast-entry-mode-v1`.
- [ ] Baseline green: `cd backend && npx tsc --noEmit && npx vitest run`; `cd frontend && npx tsc --noEmit`. Record the pre-existing `printWorkspace.test.tsx` 2 failures as known-unrelated/out-of-scope.

---

### Task 1: Backend — collision-safe next invoice number (read-only)

**Scope:** Add a read-only endpoint returning the next `MN-INV-{year}-NNNNN` for a given year, computed max-based (never `count()`), gated by `invoices.create`. No schema/migration, no posting change.

**Files:**
- Modify: `backend/src/modules/invoices/invoices.service.ts` (add method to `InvoicesService`)
- Modify: `backend/src/modules/invoices/invoices.controller.ts`
- Modify: `backend/src/modules/invoices/invoices.routes.ts`
- Test: `backend/src/modules/invoices/__tests__/invoices.nextNumber.test.ts`

**Interfaces:**
- Produces (service): `getNextInvoiceNumber(year: number): Promise<string>` → e.g. `'MN-INV-2026-00153'`.
  - Contract: prefix = `MN-INV-${year}-`; scan `invoice.number` (or `invoiceNumber`) `startsWith` prefix; among suffixes matching `^\d+$`, take the **numeric max**; return `` `${prefix}${String(max+1).padStart(5,'0')}` ``. Non-numeric suffixes (manual overrides) are ignored for the suggestion. Empty → `...-00001`.
- Produces (route): `GET /invoices/next-number?year=<int>` → `{ nextNumber: string }`. If `year` omitted, default current year (server clock).
- Consumes: existing `prisma`, `requirePermission`, `ok` response helper.

- [ ] **Step 1 — Write failing service tests.** In the new test file, mock `prisma.invoice.findMany`. Cases:
  - returns `MN-INV-2026-00001` when no matching rows.
  - given numbers `['MN-INV-2026-00001','MN-INV-2026-00003']` → `MN-INV-2026-00004` (max+1, tolerates the gap that `count()` would mis-handle).
  - ignores non-numeric suffixes: given `['MN-INV-2026-00007','MN-INV-2026-A12']` → `MN-INV-2026-00008`.
  - respects the `year` argument (prefix uses the passed year).
- [ ] **Step 2 — Run, expect FAIL** (`getNextInvoiceNumber` undefined): `cd backend && npx vitest run src/modules/invoices/__tests__/invoices.nextNumber.test.ts`.
- [ ] **Step 3 — Implement `getNextInvoiceNumber(year)`** per the contract above (max-based scan). *(Engineer writes the method.)*
- [ ] **Step 4 — Add controller `nextNumber(req,res)`** reading `Number(req.query.year) || new Date().getFullYear()`, returning `ok(res, { nextNumber })`.
- [ ] **Step 5 — Register route** `router.get('/next-number', requirePermission('invoices.create'), asyncHandler(invoicesController.nextNumber))` **above** the `GET /:id` route (avoid `/:id` shadowing).
- [ ] **Step 6 — Run tests, expect PASS**; then `npx tsc --noEmit`.
- [ ] **Step 7 — Commit:** `feat(invoices): add read-only next-number endpoint (collision-safe)`.

**Risks:** Route ordering (`/next-number` vs `/:id`) — mitigated by registering before `/:id` and covering with a comment. Non-numeric legacy suffixes — explicitly ignored.
**Validation:** New unit tests pass; backend `tsc` clean; full backend `vitest` still green.
**Completion:** `GET /invoices/next-number?year=2026` returns the correct max+1 suffix; no existing test regressed.

---

### Task 2: Frontend — pure Fast Entry helpers (`invoiceFastEntry.ts`)

**Scope:** All non-UI logic as pure, unit-tested functions mirroring `fastExpenseEntry.ts`. The linchpin is `buildInvoiceCreatePayload` producing a payload **byte-identical** to the normal `CreateInvoice` submit (PD-1).

**Files:**
- Create: `frontend/src/pages/invoiceFastEntry.ts`
- Test: `frontend/src/pages/__tests__/invoiceFastEntry.test.ts`

**Interfaces (Produces — later tasks consume these exact names/types):**
```
type InvoiceEntryMode = 'SINGLE' | 'MULTI';

interface InvoiceFastItem { uid: string; description: string; quantity: number|string;
  unit: string; unitPrice: number|string; workType?: string; location?: string; priceTouched?: boolean; }

interface InvoiceSharedFields { entryMode: InvoiceEntryMode; direction: string; invoiceType: string;
  issueDate: string; billingMonth: number; billingYear: number; numberYear: number;
  customerId: string; contractId: string; }        // customerId/contractId used only in SINGLE mode

interface InvoiceRowFields { invoiceNumber: string; items: InvoiceFastItem[]; discount: number|string;
  deliveryDate: string; customerId: string; contractId: string; }   // customer/contract used only in MULTI mode

interface InvoiceSessionSummary { count: number; total: number;
  lastNumber: string|null; lastCustomer: string|null; lastAmount: number|null; nextNumber: string|null; }

// functions
makeEmptyItem(): InvoiceFastItem
makeEmptyRow(nextNumber: string): InvoiceRowFields
resolveInvoiceParty(shared, row): { customerId?: number }        // SALES v1: pick customerId from the active mode
buildInvoiceCreatePayload(shared, row): Record<string, unknown>  // byte-identical to normal form
validateInvoiceRow(shared, row): string | null                   // same rules as CreateInvoice.submit
clientNextInvoiceNumber(current: string): string                 // fallback: bump trailing numeric suffix, pad 5
addToInvoiceSummary(prev, amount, code, customerName, nextNumber): InvoiceSessionSummary
isInvoiceRowDirty(row): boolean
EMPTY_INVOICE_SUMMARY: InvoiceSessionSummary
```

**`buildInvoiceCreatePayload` contract (parity — the exact posted shape):**
```
{ invoiceNumber: row.invoiceNumber.trim(),
  direction: shared.direction,
  invoiceType: shared.invoiceType,
  customerId: resolveInvoiceParty(shared,row).customerId,   // SALES v1
  issueDate: shared.issueDate || undefined,
  deliveryDate: row.deliveryDate || null,
  billingMonth: shared.billingMonth,
  billingYear: shared.billingYear,
  discount: Number(row.discount) || 0,
  items: row.items.map(toInvoiceItemPayload) }   // reuse utils/invoicePayload → {description,quantity,unit,unitPrice}
// NOT included: taxRate, paymentMethod, dueDate, contractId, notes (PD-1 parity)
```
`resolveInvoiceParty`: SINGLE → `Number(shared.customerId)`; MULTI → `Number(row.customerId)`. `contractId` is never posted (UI price-filter only), matching the normal form.

**`validateInvoiceRow` contract (mirror `CreateInvoice.submit`):** invoice number matches `^MN-INV-\d{4}-[A-Za-z0-9]+$`; ≥1 item; every item has non-empty `description`, `quantity > 0`, `unitPrice >= 0`; a customer resolved for SALES (via the active mode). Returns the first Arabic error string, else `null`.

- [ ] **Step 1 — Write failing helper tests** covering:
  - `buildInvoiceCreatePayload` (SINGLE) deep-equals the documented parity shape; asserts **absence** of `taxRate`/`paymentMethod`/`dueDate`/`contractId`/`notes`.
  - `buildInvoiceCreatePayload` (MULTI) uses `row.customerId`.
  - item mapping equals `toInvoiceItemPayload` output (`{description,quantity,unit,unitPrice}` only).
  - `deliveryDate` empty → `null`; present → passthrough.
  - `validateInvoiceRow`: bad number format, zero items, empty description, non-positive quantity, negative price, missing customer → correct messages; valid → `null`.
  - `clientNextInvoiceNumber('MN-INV-2026-00152')` → `'MN-INV-2026-00153'`; pads; leaves non-numeric suffix unchanged or documented behavior.
  - `addToInvoiceSummary` accumulates count/total and records last number/customer/amount + next number.
  - `isInvoiceRowDirty(makeEmptyRow('MN-INV-2026-00001'))` is `false`; with an item description it is `true`.
- [ ] **Step 2 — Run, expect FAIL:** `cd frontend && npx vitest run src/pages/__tests__/invoiceFastEntry.test.ts`.
- [ ] **Step 3 — Implement `invoiceFastEntry.ts`** to satisfy the contracts above, importing `toInvoiceItemPayload` from `utils/invoicePayload`. *(Engineer writes it.)*
- [ ] **Step 4 — Run, expect PASS;** then `npx tsc --noEmit`.
- [ ] **Step 5 — Commit:** `feat(invoices): add pure Fast Entry helpers (payload/validation parity)`.

**Risks:** Silent payload divergence (R7) — mitigated by the explicit parity + absence assertions. Number-bump edge cases — covered by tests.
**Validation:** Helper tests pass; frontend `tsc` clean.
**Completion:** `buildInvoiceCreatePayload` proven equal to the normal-form field set; all helpers tested.

---

### Task 3: Extract `InvoiceLineItemsEditor` (behavior-preserving refactor)

**Scope:** Move the line-item editing UI/logic (workType select, `LocationAutocomplete` → `composeDescription`, quantity, unit select, `unitPrice` + price-agreement picker popover, add/remove, `applyPrice`) out of `CreateInvoice` into a reusable component. **The normal create form's behavior and posted payload must be unchanged.** This single-sources the editor for Fast Entry.

**Files:**
- Create: `frontend/src/components/invoices/InvoiceLineItemsEditor.tsx`
- Modify: `frontend/src/pages/Invoices.tsx` (`CreateInvoice` consumes the new component; `EditInvoice` left untouched unless trivially shared)

**Interfaces (Produces):**
```
interface InvoiceLineItemsEditorProps {
  items: InvoiceFastItem[];
  onItemsChange: (next: InvoiceFastItem[]) => void;
  priceAgreements: PriceAgreement[];      // existing shape from GET /prices/for-invoice
  disabled?: boolean;
}
```
- Consumes: existing `composeDescription`, `applyPrice`, work-type/unit option constants, `LocationAutocomplete`, `money`, and the price-picker popover — moved verbatim.

- [ ] **Step 1 — Characterize current behavior (safety net).** Confirm existing coverage: `frontend/src/utils/__tests__/*invoicePayload*` (item payload mapping) and any invoice tests. Run `cd frontend && npx vitest run` and record the current pass count (excluding the 2 known `printWorkspace` failures).
- [ ] **Step 2 — Extract component**, moving the item-row JSX + helpers into `InvoiceLineItemsEditor.tsx`, exposing the props above. Keep all logic byte-identical (copy, don't rewrite). *(Engineer performs the move.)*
- [ ] **Step 3 — Rewire `CreateInvoice`** to render `<InvoiceLineItemsEditor items={items} onItemsChange={setItems} priceAgreements={displayPrices} />`, deleting the now-moved inline JSX/helpers.
- [ ] **Step 4 — Verify no behavior change:** `npx tsc --noEmit`; `npx vitest run` (same pass count as Step 1); `npm run build:front`.
- [ ] **Step 5 — Manual smoke (normal create):** launch app, create a normal SALES invoice with 2 line items using the price picker; confirm number, totals, and that it appears normally. (See Manual Verification Checklist.)
- [ ] **Step 6 — Commit:** `refactor(invoices): extract InvoiceLineItemsEditor (no behavior change)`.

**Risks (highest in the plan):** Subtle regression in the normal invoice form (price picker, description composition, unit defaults). Mitigations: copy-not-rewrite; identical props; unchanged payload asserted by existing item-payload tests + manual smoke; `EditInvoice` left as-is to limit blast radius.
**Validation:** tsc + full frontend vitest (unchanged pass count) + build + manual normal-create smoke.
**Completion:** Normal invoice creation is visibly and behaviorally identical; the editor is now a standalone reusable component.

---

### Task 4: `InvoiceFastEntryDialog` — Single Customer mode + full session mechanics

**Scope:** The ExplorerKit dialog wired into the Invoices page, implementing **Single Customer** mode end-to-end: shared fields (Region A), per-invoice entry area reusing `InvoiceLineItemsEditor` (Region B), session summary with last/next number (Region C), Save & Next / Finish / Cancel, keyboard shortcuts, dirty-close guard, non-intrusive success toast, and auto-suggested editable invoice number (via Task 1 endpoint, Task 2 fallback).

**Files:**
- Create: `frontend/src/components/InvoiceFastEntryDialog.tsx`
- Modify: `frontend/src/pages/Invoices.tsx` (add `إدخال فواتير سريع` button in the header aside, `fastEntry` state, dialog render calling `load()` on close-with-saves)

**Interfaces:**
- Consumes: everything from Task 2 (`invoiceFastEntry.ts`), Task 3 (`InvoiceLineItemsEditor`), Task 1 (`GET /invoices/next-number`), ExplorerKit `Dialog`/`DialogSection`/`Button`, `SearchableSelect` (customer picker), `useToast`, `money`, `dateText`, `api`.
- Props: `{ onClose: () => void; onSaved: () => void; }` (parent `Invoices` passes `onSaved={load}`).

**Behavioral contract (per spec §1.4, §2.2–§2.6):**
- On open: fetch the suggested number (`GET /invoices/next-number?year=<numberYear>`; on failure fall back to `clientNextInvoiceNumber` from the latest known, else `...-00001`). Pre-fill shared fields with sensible defaults (direction SALES, issueDate today → derive billing month/year, invoiceType default).
- **Single Customer:** customer (+ optional contract) in Region A via `SearchableSelect`; selecting a customer fetches price agreements + contracts (reuse existing calls) once. Region B has **no** customer field.
- Region B: `InvoiceLineItemsEditor`, `discount`, `deliveryDate`, and the **editable auto-suggested invoice number** field; live subtotal/discount/total preview.
- Region C: count, session total, latest customer/amount, **Last** number, **Next** number — display-only.
- **Save & Next:** `validateInvoiceRow` → `POST /invoices` with `buildInvoiceCreatePayload`; on success: `useToast().ok('✓ تم إنشاء الفاتورة <code> بنجاح')`, `addToInvoiceSummary`, reset Region B (items → one empty row, discount, deliveryDate), set the next number (from response/endpoint/fallback), refocus first line-item input; shared fields persist. On error: keep dialog open, show inline error, preserve data, do **not** advance number/summary (P2002 → re-suggest next number).
- **Save & Finish:** create, then `onSaved()` + `onClose()`.
- **Cancel/Close (`requestClose`)**: if `isInvoiceRowDirty`, `window.confirm`; if any saved, `onSaved()`; then `onClose()`.
- **Keyboard:** `Ctrl+Enter` → Save & Next; `Ctrl+Shift+Enter` → Save & Finish; `Esc` → requestClose.

- [ ] **Step 1 — Add the entry point:** `Button variant="secondary" icon="calendar_month"` labelled `إدخال فواتير سريع` beside the existing new-invoice button (gated by the same permission that shows normal create); add `fastEntry` state + conditional render.
- [ ] **Step 2 — Build the dialog shell** (ExplorerKit `Dialog` size `lg`/`xl`, three `DialogSection`s, footer with the three buttons) consuming Task 2/3 pieces per the contract. *(Engineer writes the component; no new business logic — orchestration only.)*
- [ ] **Step 3 — Wire numbering:** on open and after each successful save, set the suggested editable number (endpoint → fallback). Ensure the field is never empty and always editable.
- [ ] **Step 4 — Wire session mechanics:** Save & Next/Finish/Cancel, toast, summary, reset, focus, keyboard handler, dirty guard — all delegating to Task 2 helpers.
- [ ] **Step 5 — Validate:** `npx tsc --noEmit`; `npm run build:front`; run the Task 2 helper tests (still green).
- [ ] **Step 6 — Manual verification (Single mode):** open Fast Entry, confirm pre-filled number; enter and Save & Next 3 invoices for one customer; confirm toast, summary count/total/last/next, number advances, list shows 3 normal invoices with correct GL. (Manual checklist.)
- [ ] **Step 7 — Commit:** `feat(invoices): add Fast Entry dialog (Single Customer mode)`.

**Risks:** Dropdown clipping inside the dialog (known ExplorerKit limitation — acceptable, deferred). Number race on rapid saves (offline single-instance + P2002 guard + re-suggest). Ensure the created invoice fully posts (SALES posts at create) — verify via list/GL.
**Validation:** tsc + build; helper tests green; manual Single-mode flow.
**Completion:** A user can issue many single-customer invoices rapidly; each is a normal invoice; no blocking dialogs; number always suggested/editable.

---

### Task 5: Entry Mode selector + Multiple Customers mode

**Scope:** Add the explicit **Choose Entry Mode** step (spec §2.2a) and implement **Multiple Customers** mode: customer (+ contract) becomes a per-invoice field with a Save-gate while price context loads; all other shared fields stay fixed; a persistent mode badge shows the active mode.

**Files:**
- Modify: `frontend/src/components/InvoiceFastEntryDialog.tsx`
- (Possibly) Modify: `frontend/src/pages/invoiceFastEntry.ts` only if a small mode-aware helper is missing (should already be covered by Task 2's `resolveInvoiceParty`/`entryMode`).

**Behavioral contract:**
- On open, show `اختر نمط الإدخال` — ○ عميل واحد (default/recommended) / ○ عملاء متعددون. Selected mode persists for the session and is shown as a header chip (`عميل واحد: <name>` or `عملاء متعددون`).
- **Single:** as Task 4.
- **Multiple:** customer (+ contract) render in Region B (per invoice); on customer change reuse existing reset-prices + refetch; **disable Save until price agreements have loaded** to prevent stale/empty prices; on Save & Next reset also clears the per-invoice customer/contract. Shared fields + suggested number persist.
- Switching mode mid-session with a dirty row prompts confirmation (it relocates the customer field).

- [ ] **Step 1 — Add the mode selector** (Step 0 of the dialog) driving `shared.entryMode`; render the mode badge in the header.
- [ ] **Step 2 — Conditionally place the customer/contract control** in Region A (Single) vs Region B (Multiple), driven by `entryMode`; `resolveInvoiceParty` already reads the correct source.
- [ ] **Step 3 — Add the Multiple-mode Save-gate:** disable Save while the selected customer's price agreements are loading; re-enable on load.
- [ ] **Step 4 — Validate:** `npx tsc --noEmit`; `npm run build:front`; helper tests green.
- [ ] **Step 5 — Manual verification (Multiple mode):** issue 3 invoices for 3 different customers; confirm price context reloads per customer, Save is gated during load, shared fields stay fixed, summary/number behave; confirm 3 normal invoices posted. (Manual checklist.)
- [ ] **Step 6 — Commit:** `feat(invoices): add Entry Mode selector + Multiple Customers mode`.

**Risks:** Stale price context (R3) — mitigated by the Save-gate + existing reset-on-customer-change. Mode-switch mid-session — guarded by dirty confirm.
**Validation:** tsc + build; manual Multiple-mode flow; re-verify Single mode still works.
**Completion:** Both modes selectable up front, obvious throughout; Multiple mode issues correct per-customer invoices without stale pricing.

---

### Task 6: Test sweep, regression, and pre-review stabilization

**Scope:** Full validation pass, regression checklist, and confirmation of parity + non-goals before Gemini. No new features.

**Files:** none (or tiny fixes surfaced by validation, each its own commit).

- [ ] **Step 1 — Full backend:** `cd backend && npx tsc --noEmit && npx vitest run` (all green incl. Task 1 tests).
- [ ] **Step 2 — Full frontend:** `cd frontend && npx tsc --noEmit && npx vitest run` (all green except the 2 known `printWorkspace` failures) `&& npm run build:front`.
- [ ] **Step 3 — Backend build:** `npm run build:back`.
- [ ] **Step 4 — Run the Regression Checklist and Manual Verification Checklist (below).**
- [ ] **Step 5 — `/code-review` + `/security-review`** on the branch diff; address any HIGH/MEDIUM.
- [ ] **Step 6 — Commit** any fixes with focused messages; stop for Gemini.

**Validation gate:** all of the above green; parity test (Task 2) green; normal-create smoke unchanged.
**Completion:** Branch is stabilized and ready for Gemini review.

---

## 1. Task Breakdown (summary)

| # | Task | Type | Independently testable via |
|---|---|---|---|
| 1 | Backend next-number endpoint | Backend, additive read-only | vitest unit + tsc |
| 2 | Pure Fast Entry helpers | Frontend pure logic (TDD) | vitest unit + tsc |
| 3 | Extract `InvoiceLineItemsEditor` | Frontend refactor (no behavior change) | existing tests + build + manual smoke |
| 4 | Fast Entry dialog — Single mode | Frontend feature | build + manual Single flow |
| 5 | Entry Mode selector + Multiple mode | Frontend feature increment | build + manual Multiple flow |
| 6 | Test sweep + regression + reviews | Stabilization | full validation gates |

## 2. Suggested Commit Structure (one logical task per commit)

1. `feat(invoices): add read-only next-number endpoint (collision-safe)`
2. `feat(invoices): add pure Fast Entry helpers (payload/validation parity)`
3. `refactor(invoices): extract InvoiceLineItemsEditor (no behavior change)`
4. `feat(invoices): add Fast Entry dialog (Single Customer mode)`
5. `feat(invoices): add Entry Mode selector + Multiple Customers mode`
6. `test(invoices): Fast Entry regression sweep` *(only if fixes/tests are added in Task 6)*

Release phase (after Gemini APPROVE): merge `--no-ff` → `stable-invoice-fast-entry-mode-v1` → `docs: update PROJECT_STATE …` (PROJECT_STATE only) → push.

## 3. Validation Gates (must pass before each commit / before review)

- **Per task:** backend `tsc --noEmit` and/or frontend `tsc --noEmit` clean; the task's own tests pass.
- **Before Task 4/5 commits:** `npm run build:front` succeeds.
- **Before review (Task 6):** `npm run build:back` + `npm run build:front` succeed; full backend `vitest` green; full frontend `vitest` green except the 2 known `printWorkspace` failures; `/code-review` + `/security-review` show no unaddressed HIGH/MEDIUM.
- **Parity gate:** the Task 2 payload test proves `buildInvoiceCreatePayload` equals the normal-form field set (no extra fields).

## 4. Regression Checklist (verify NOT broken by this work)

- [ ] **Normal invoice creation** (SALES) — unchanged UI, correct number/totals, appears in list, GL posted (Task 3 is the main risk).
- [ ] **Normal invoice creation** (PURCHASE) — party = supplier, cash/bank auto-PAID still works.
- [ ] **Invoice edit** (`EditInvoice`) — untouched; still edits items/totals correctly.
- [ ] **Invoice list / filters / stats** — unchanged.
- [ ] **Line-item price picker** — price-agreement selection still auto-fills `unitPrice`/`unit`; single-match auto-fill still works; customer-change still resets prices + refetches contracts.
- [ ] **Invoice payment flow** (`addPayment`) — unchanged.
- [ ] **Invoice force delete** (SYSTEM_ADMIN) — unchanged.
- [ ] **Existing invoice tests** — same pass count (backend `vitest`, frontend `vitest` minus known 2).
- [ ] **`invoicePayload` mapping** — `toInvoiceItemPayload` output unchanged.
- [ ] **No accounting/posting/report/approval behavior changed** anywhere.
- [ ] **New endpoint does not shadow** `GET /invoices/:id`.

## 5. Manual Verification Checklist (drive the real app)

Normal-form (post Task 3):
- [ ] Create a normal SALES invoice with 2 line items via the price picker → correct number, totals, list entry, GL.

Fast Entry — Single Customer (post Task 4):
- [ ] Open Fast Entry; invoice number is **pre-filled** and editable.
- [ ] Pick one customer; price agreements load once.
- [ ] Save & Next three invoices → each shows `✓ تم إنشاء الفاتورة …` toast, **no blocking dialog**; number advances each time; summary shows count=3, running total, Last + Next numbers.
- [ ] `Ctrl+Enter` saves & advances; `Ctrl+Shift+Enter` saves & closes.
- [ ] Force a duplicate number → inline error, row preserved, next number re-suggested.
- [ ] Close with a dirty row → confirm prompt; saved invoices remain in the list as normal invoices with correct GL.

Fast Entry — Multiple Customers (post Task 5):
- [ ] Choose "عملاء متعددون"; mode badge visible throughout.
- [ ] Enter invoices for 3 different customers → price context reloads per customer; Save disabled during load; shared fields stay fixed; 3 normal invoices posted.
- [ ] Switch mode mid-session with a dirty row → confirmation shown.

Indistinguishability:
- [ ] A Fast-Entry invoice and a normal-screen invoice with the same inputs are identical in the DB/list (number, fields, status, GL entries).

## 6. Release Readiness Checklist

- [ ] All 5 build/feature tasks committed; commit messages match §2.
- [ ] Backend `tsc` + full `vitest` green; frontend `tsc` + full `vitest` green except the 2 known unrelated `printWorkspace` CSS failures; both builds succeed.
- [ ] Parity test proves byte-identical payload (PD-1).
- [ ] Regression checklist (§4) fully checked.
- [ ] Manual verification checklist (§5) fully checked.
- [ ] `/code-review` + `/security-review` clean (no unaddressed HIGH/MEDIUM); security note: new endpoint is read-only and `invoices.create`-gated.
- [ ] No accounting/posting/reports/approval/API redesign; only additive read-only endpoint + frontend.
- [ ] Non-goals honored (no batch/session persistence/import/recurring/templates); §1.6 lifetime invariant intact.
- [ ] Gemini production review: **APPROVED** before merge.
- [ ] Release steps queued (not executed until approval): merge `--no-ff` → `stable-invoice-fast-entry-mode-v1` → PROJECT_STATE docs commit → push production + tag.

---

## Self-Review (planner's own check)

- **Spec coverage:** Entry point (T4) ✓; Entry Mode selector §2.2a (T5) ✓; shared/per-invoice fields §2.2 (T4/T5) ✓; auto-suggested editable number §2.6 (T1+T2+T4) ✓; success toast §2.4a (T4) ✓; session summary incl. last/next §2.2C (T2+T4) ✓; keyboard §2.5 (T4) ✓; customer modes §4 (T4/T5) ✓; reuse of create/validation/totals/posting/numbering/permissions/ExplorerKit/SearchableSelect (T1–T5) ✓; FastEntrySession NOT extracted §5 ✓; session lifetime §1.6 (no persistence — honored by design) ✓; Resume §10.1 explicitly **deferred** (no task) ✓; non-goals §9 ✓.
- **Deviation flagged:** PD-1 defers spec §2.2 optional notes to preserve strict parity — surfaced for user confirmation at plan review.
- **Type consistency:** `buildInvoiceCreatePayload`, `validateInvoiceRow`, `resolveInvoiceParty`, `InvoiceSharedFields`/`InvoiceRowFields`/`InvoiceSessionSummary`, `InvoiceLineItemsEditorProps`, `getNextInvoiceNumber` used consistently across Tasks 1–5.
- **No production code written here** — per the user's constraint; steps are contracts + concrete test cases the engineer implements.

*End of implementation plan. No code implemented. Next step: confirm PD-1/PD-2/PD-3, then begin execution task-by-task.*
