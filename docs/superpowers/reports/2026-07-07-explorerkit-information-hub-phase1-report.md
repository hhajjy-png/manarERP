# ExplorerKit Information Hub — Phase 1 Final Report

**Date:** 2026-07-07
**Branch:** `feature/explorerkit-information-hub-phase1` (off `production`, base `65a3612`)
**Checkpoint tag:** `checkpoint/pre-explorer-hub-65a3612`
**Status:** Implementation complete. NOT merged / NOT pushed — awaiting Gemini review + merge decision.

---

## Result

The ExplorerKit detail drawer is now a reusable **Information Hub**, realized on the three reference entities (Customer, Equipment, Invoice). Six additive presentation-only primitives were added to the shared kit; two per-entity hub components and the invoice drawer compose them. **Nothing outside presentation changed.**

Validation: frontend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · `npm test` 757/759 (the 2 failures are the pre-existing `printWorkspace.test.tsx` CSS assertions — this branch never touches print-workspace) · `npm run build` ✅. Branch diff = **9 files, all frontend** (+1024/−33).

Final whole-branch review (Opus): **no Critical/Important issues**; "Ready to merge — with fixes"; the flagged fixes were applied (see below).

---

## Shared components added (reusable for later rollout)

In `frontend/src/components/explorer/ExplorerKit.tsx` + `explorer-kit.css` (existing `--xpl-*` tokens only, additive — no existing export or selector modified):

| Primitive | Purpose |
|---|---|
| `DrawerHeaderCard` | Compact header: icon + title + status chip + 2–4 KPI tiles |
| `DrawerQuickActions` | Responsive icon+label action grid; renders nothing when empty |
| `DrawerInfoGrid` | 2-column grouped key/value card; **drops empty values, hides when all empty** |
| `DrawerRelated` | Lazy list of related records; skeleton/error/**hidden-when-empty** |
| `DrawerActivity` | Vertical activity timeline; **hidden when empty** |
| `DrawerActionBar` | Footer with primary → secondary → danger hierarchy |

Plus `hubs/hubTypes.ts` (`EntityHubProps`, `HubComponent`, `buildInfoItems`). `Tone` was promoted to an `export type` (non-breaking widening).

## Pages affected

- **`pages/ResourcePage.tsx`** — added a tiny `DRAWER_HUBS` registry (`customers`, `equipment`). When a hub exists the drawer renders it (slim hero suppressed); **every other module + the employees Tabs/EmployeeFinancialTab branch + permissions + footer are byte-unchanged** (verified in review).
- **`components/explorer/hubs/CustomerHub.tsx`** — KPIs (Balance, Invoice Count, Outstanding), quick actions (Statement deep-link, New Invoice, Add Contract, Edit, Delete), info grid, related (Recent Invoices, Contracts), activity (statement entries). Lazy, `alive`-guarded, `Promise.allSettled`.
- **`components/explorer/hubs/EquipmentHub.tsx`** — KPIs (Status, Registration Remaining, Registration Expiry), quick actions (Request Maintenance, Log Fuel, Edit, Delete), info grid, related (Maintenance, Fuel), activity (merged maintenance+fuel).
- **`pages/Invoices.tsx`** — drawer recomposed onto the primitives: header KPIs (Total/Paid/Remaining/Age), quick actions (Receive Payment/Print/PDF/Edit/Cancel/Delete), existing financial summary + line-items retained, payments related + synthesized activity, action-bar footer. **All existing handlers/gates/data reused verbatim** (`setPaying`/`canCollectRow`, print nav, `setEditing`/`canEditRow`, `cancel`/`canCancelRow`, `setForceDeleteId`/`isSystemAdmin`).

## Honest omissions (no fabricated data — verified absent, hidden per rule)

- **Customer:** "Last Update" KPI (no per-entity audit feed); Receipt/Payment Voucher actions (not customer-linked).
- **Equipment:** "Purchase Date" (no field → Registration Expiry shown instead); Transfer / Update-km / Print-card actions and Transfers related (no route/endpoint/template).
- **Invoice:** Email-PDF, Duplicate, View-log actions; Contract/PO related (not persisted on the invoice).

## Data & performance

All Related/Activity data comes from **endpoints already called elsewhere** (`/invoices/stats`, `/statements/customers/:id`, `/invoices?customerId=`, `/contracts?customerId=`, `/maintenance/records?equipmentId=`, `/maintenance/fuel?equipmentId=`), lazy-loaded on drawer open, keyed by entity id, hidden when empty/failed. **Zero backend/API/route/permission/validation/calculation/workflow changes; no new endpoints; no deep-link seeding.**

## Final-review fixes applied (commit `c050ed1`)

1. **`prefers-reduced-motion`** now neutralizes `.xpl-quick-action` transition/`:active` transform (binding constraint).
2. `buildInfoItems` gained an `omitKeys` param so the field used as header title/subtitle no longer double-renders in the info grid.
3. Invoice **PDF** quick action now gated by `invoices.read` like Print.
4. Delete quick action disabled while a delete is in flight (`busy`).

## Open item for your decision (not a regression)

The invoice drawer's **الدفعات (payments) related + payment-derived activity render empty today** because the list payload doesn't include `payments`/`items` and the *view* drawer never fetched `GET /invoices/:id` (confirmed against the backend service — pre-existing, not caused by this work). The activity still shows the "أُنشئت"/"أُلغيت" events from `issueDate`/`status`. To make payments/items appear, a small **optional follow-up** could add a lazy `GET /invoices/:id` (an **existing** read endpoint) on drawer open. Deferred per the strict approved scope; your call whether to include it in a follow-up package.

## Remaining Minors (fair follow-ups, non-blocking)

- `DrawerRelated` clickable/static row markup duplicated (DRY nit).
- Edit/Delete appear both as quick-action tiles and in the footer bar — **intentional**, matching the reference screenshots and the invoice drawer.

## Deferred (explicitly out of this package)

Rollout of the hub to Cheques/Salaries/Accounting/Maintenance/Inventory; app-wide toolbar/table/hero density pass; Bank Account Explorer migration onto the kit; any workflow/deep-link/new-API changes.

## Visual parity note

Automated behavior is fully covered by unit/smoke tests (18 hub/primitive tests) and the primitives use the existing token system. **Pixel/visual parity against the three reference screenshots should be confirmed in the running app** — the authenticated Electron drawers can't be rendered headlessly here, so a live check (Customer, Equipment, Invoice drawers) is recommended before/at merge.

## Next steps (owner: user)

1. Gemini review (mandatory before production merge per CLAUDE.md).
2. Live visual check of the 3 drawers against the references.
3. On approval: merge `--no-ff` into `production`, stable tag, update PROJECT_STATE.
4. Optionally schedule the invoice lazy-detail follow-up + the DRY nit.
