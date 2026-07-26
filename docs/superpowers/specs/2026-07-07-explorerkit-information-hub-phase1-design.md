# ExplorerKit Information Hub — Phase 1 Design Spec

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan
**Scope:** Frontend-only, presentation/UX only. Package 1 of a multi-package modernization.
**Mode:** Feature (per `docs/development-workflow.md`)

---

## 1. Goal

Turn the ExplorerKit detail drawer into a professional **Information Hub** matching the three approved reference screenshots (Invoice, Equipment, Customer), by adding reusable drawer primitives to the shared kit and realizing them on those three reference entities. Every Explorer drawer should feel like one unified premium product.

**Hard constraints (from the package brief):** change **presentation and UX only**. NO changes to backend, database, APIs, business logic, routing behavior, permissions, validation, calculations, or existing workflows. Maintain ExplorerKit architecture. Prefer extending shared components over page-specific implementations. Additive, backward-compatible, offline-first. Preserve responsive behavior, keyboard nav, focus states, contrast.

**The references are a target, not the current state.** Today's Customer/Equipment drawers are icon+name+code header + one flat key/value list + edit/delete footer; the Invoice drawer is a grouped read-only panel. The header KPI strip, quick-actions grid, related records, and activity timeline do not exist yet and are the core of this package.

---

## 2. Scope decisions (approved)

1. **Phasing:** Package 1 = build the Information Hub primitives into ExplorerKit + realize them on the 3 reference entities (Customer, Equipment, Invoice). Rolling the hub to other explorer pages (Cheques, Salaries, Accounting, Maintenance, Inventory, …) and the app-wide toolbar/KPI/table/hero density pass are **later packages**. Migrating the bespoke Bank Account Explorer onto the kit is also deferred.
2. **Related Records & Activity data source:** existing endpoints only, lazy-loaded read-only; **hide a section entirely when its data is unavailable**. No new endpoints.
3. **Customer quick actions without a pre-select path:** navigate to the existing create flow **un-seeded** (user picks the party in the form, as today). No new deep-link/seed plumbing → no workflow changes.

---

## 3. Architecture

### 3.1 New shared primitives (presentation-only) — `components/explorer/ExplorerKit.tsx` + `explorer-kit.css`

All use the existing `--xpl-*` design tokens (colors, shadows, radius, font) so they inherit the current identity. All are additive and opt-in; existing exports (`Drawer`, `DrawerSection`, `DrawerField`, `MetricCard`, `Button`, `StatusChip`, …) are unchanged.

| Primitive | Props (interface sketch) | Renders |
|---|---|---|
| `DrawerHeaderCard` | `{ icon, title, subtitle?, status?: {tone,label,icon?}, kpis?: KpiTile[] }` where `KpiTile = { label, value, sub?, tone? }` | Compact card: icon tile + title + optional status chip on the top row; below, a responsive strip of 2–4 KPI tiles. |
| `DrawerQuickActions` | `{ actions: QuickAction[] }` where `QuickAction = { key, icon, label, onClick, tone?: 'default'\|'primary'\|'danger', disabled?: boolean }` | Responsive grid of icon-over-label (or icon+label) buttons. Renders nothing if `actions` is empty. |
| `DrawerInfoGrid` | `{ title?, icon?, items: InfoItem[] }` where `InfoItem = { label, value: ReactNode, mono?: boolean }` | A `DrawerSection`-styled card whose body is a 2-column key/value grid built from `DrawerField`. Items with `value == null/''/undefined` are dropped (hide-unavailable). Renders nothing if all items drop. |
| `DrawerRelated` | `{ title, icon?, loading?, error?, items?: RelatedItem[], emptyText?, onSeeAll? }` where `RelatedItem = { key, icon?, primary, secondary?, trailing?: ReactNode, tone?, onClick? }` | Titled list of related-record rows. Shows `SkeletonRows` while `loading`, `ErrorBanner` on `error`, and **renders nothing when not loading and `items` is empty** (section hidden). Optional "عرض الكل" link. |
| `DrawerActivity` | `{ title?, loading?, items?: ActivityItem[] }` where `ActivityItem = { key, icon?, tone?, title, meta?, timestamp?: string }` | Vertical timeline (dot + connector line, title, meta, right-aligned timestamp). Skeleton while loading; **hidden when empty**. |
| `DrawerActionBar` | `{ primary?: ActionBtn, secondary?: ActionBtn[], danger?: ActionBtn[] }` where `ActionBtn = { key, label, icon?, onClick, busy?, disabled? }` | Footer laying actions into groups: primary (filled) first, secondary (outline), danger (red) separated to the end. Used as the `Drawer` `footer`. |

New CSS classes (namespaced `xpl-`): `.xpl-drawer-headcard`, `.xpl-drawer-kpis`/`.xpl-drawer-kpi`, `.xpl-quick-actions`/`.xpl-quick-action`, `.xpl-info-grid`, `.xpl-related`/`.xpl-related-row`, `.xpl-timeline`/`.xpl-timeline-item`/`.xpl-timeline-dot`, `.xpl-actionbar`. Reuse existing tokens; add no new color identity. Include `@media` rules consistent with the kit's existing responsive block and honor `prefers-reduced-motion`.

### 3.2 Per-entity hub components (the `EmployeeFinancialTab` pattern)

Per-entity content (which KPIs, actions, related, activity) needs data fetching + navigation, so it lives in small components, not static `modules.tsx` config:

- `components/explorer/hubs/CustomerHub.tsx`
- `components/explorer/hubs/EquipmentHub.tsx`

Each receives the entity (`viewing`) plus the callbacks it needs (e.g. `onEdit`, `onDelete`, `navigate`) and composes the primitives. Each **lazy-loads** its related/activity data on mount, keyed by entity id, with an `alive` cleanup guard (mirrors `EmployeeFinancialTab`). Sections manage their own loading/empty/hidden state.

`ResourcePage.tsx` gains a tiny registry:
```ts
const DRAWER_HUBS: Record<string, HubComponent> = { customers: CustomerHub, equipment: EquipmentHub };
```
When `DRAWER_HUBS[cfg.key]` exists, the drawer body renders the hub; otherwise it falls back to **today's flat `basicSection`** (all other modules, and the employees financial tab, unchanged).

**Invoice** composes the primitives **directly inside `Invoices.tsx`** (its payment/edit/cancel/print handlers already live there), replacing the current bespoke `invcx-*` drawer markup with the shared primitives + its existing line-items table.

### 3.3 Isolation summary

- `ExplorerKit.tsx` / `.css`: additive primitives only.
- `hubs/CustomerHub.tsx`, `hubs/EquipmentHub.tsx`: new, self-contained, fetch via existing `api` client.
- `ResourcePage.tsx`: + registry + conditional render (fallback unchanged).
- `Invoices.tsx`: drawer body recomposed onto primitives; **handlers, data, and payload logic untouched**.

---

## 4. Per-entity realization (grounded in verified availability)

Legend: shown = data/handler verified present; **omitted** = genuinely absent (no backend change allowed), hidden per the hide-unavailable rule.

### 4.1 Customer (`CustomerHub`)
Lazy fetches: `GET /invoices/stats?customerId=<id>` (→ count/totalRemaining), `statementsApi.getCustomerStatement(id)` (→ `closingBalance` + dated `entries[]`), `GET /invoices?customerId=<id>` (recent), `GET /contracts?customerId=<id>`.

- **Header KPIs:** Current Balance (statement `closingBalance`), Invoice Count (stats), Outstanding (stats `totalRemaining`). *Last Update omitted — no per-entity audit feed.*
- **Quick actions:** Statement (navigate `#/financial?tab=statement&entityType=customer&entityId=<id>`), New Invoice (navigate `#/invoices`, un-seeded), Add Contract (navigate `#/contracts`, un-seeded), Edit (`onEdit`), Delete (`onDelete`). *Receipt Voucher / Payment Voucher omitted — not customer-linked; Payment Voucher is cheque-scoped.*
- **Info grid:** code, type, phone, contactName, email, address, notes (existing columns; empties hidden).
- **Related (lazy):** Recent Invoices (number · date · total · status), Contracts (code · dates · monthly value). *Standalone payments omitted — only reachable per-invoice.*
- **Activity (lazy):** latest statement `entries[]` (date · description · debit/credit). One fetch feeds both the Balance KPI and this timeline.

### 4.2 Equipment (`EquipmentHub`)
Lazy fetches: `GET /maintenance/records?equipmentId=<id>`, `GET /maintenance/fuel?equipmentId=<id>`.

- **Header KPIs:** Status (`status` → StatusChip tone), Registration Remaining (`registration.remainingText`/`remainingDays`), Registration Expiry (`registration.expiry`). *Purchase Date replaced by Registration Expiry — no `purchaseDate` field exists.*
- **Quick actions:** Request Maintenance (navigate `#/maintenance`), Log Fuel (navigate `#/maintenance`), Edit, Delete. *Transfer / Update-km / Print-card omitted — no route/handler/template.*
- **Info grid:** code, type, ownerName, driverName, plateNumber, status, registration expiry/remaining (empties hidden).
- **Related (lazy):** Maintenance Records (type · date · status/cost), Fuel Logs (date · liters · odometer · cost). *Transfers omitted — no endpoint.*
- **Activity (lazy):** maintenance + fuel entries merged and sorted by date (reuses the related fetches — no extra calls).

### 4.3 Invoice (composed in `Invoices.tsx`)
Uses the already-called `GET /invoices/:id` detail (`items[]`, `payments[]`).

- **Header KPIs:** Total, Paid (`paidAmount`), Remaining (`max(0, total − paidAmount)`), Age (days from `issueDate`). All present.
- **Quick actions:** Receive Payment (`setPaying`), Print (`navigate('/invoices/:id/preview?print=1')`), Export PDF (existing preview export handler / bridge), Edit (`setEditing`), Cancel (`executeCancel`), Delete (force, SYSTEM_ADMIN). *Email PDF + Duplicate omitted — not implemented anywhere.* Actions respect existing per-row permission gates (`canCollectRow`, `canEditRow`, `canCancelRow`, …).
- **Info grid:** number, party, type, direction, issue/delivery date, billing period, notes (existing; empties hidden). Financial summary (subtotal/discount/tax/total/paid/remaining) and the line-items table retained.
- **Related:** Customer (link/row) + Payments list (from `payments[]`). *Contract / PO omitted — not persisted on the invoice.*
- **Activity (synthesized):** Issued (`issueDate`) → each payment in `payments[]` (amount · date · method) → Cancelled (if status CANCELLED). No audit dependency.

---

## 5. Data & performance

- Related/Activity sections fetch **on drawer open, keyed by entity id**, with an `alive` guard so switching entities never shows stale data and closing aborts state updates. Each section renders skeleton → data/empty independently; **empty ⇒ section not rendered**.
- No new endpoints; only endpoints already called elsewhere in the frontend. Offline-first preserved (same local backend).
- No unnecessary rerenders: hub effects depend only on entity id; heavy sections are self-contained.
- Formatting via existing helpers: `money()` (`config/modules.tsx`), `formatDate`/`formatDateTime`/`dateText` (`lib/date.ts`).

---

## 6. Accessibility & responsiveness

- Reuse the kit's existing `useFocusTrap` in `Drawer` (unchanged) — focus trap, Escape, focus return, scroll lock all preserved.
- Quick-action and timeline items are real `<button>`/semantic elements with `aria-label`s; KPI tiles are non-interactive text.
- New CSS follows the kit's existing responsive breakpoints and `prefers-reduced-motion` handling; drawer stays 440px / 94vw.
- Maintain color contrast using existing tone tokens; status uses existing `StatusChip` tones.

---

## 7. Testing

- **Primitives (RTL render tests):** `DrawerHeaderCard` (renders KPIs, hides absent status), `DrawerQuickActions` (renders/omits, disabled state, click), `DrawerInfoGrid` (drops empty items, hides when all empty), `DrawerRelated` (skeleton while loading, hidden when empty, renders rows), `DrawerActivity` (timeline order, hidden when empty), `DrawerActionBar` (primary → secondary → danger order, busy/disabled).
- **Hubs (smoke tests):** with mocked `api`, assert a hub renders its sections when data is present and **hides Related/Activity when the fetch returns empty**; assert no crash on fetch error (ErrorBanner path).
- Keep the existing `explorerKitDialogFocus`/other kit tests green.
- Manual verification against the three reference screenshots before completion.

---

## 8. Explicitly NOT in this package

- No rollout to Cheques/Salaries/Accounting/Maintenance/Inventory drawers (later packages).
- No app-wide toolbar/KPI/table/hero density restyle across all pages (later package). Phase 1 touches shared CSS only by **adding** drawer-hub classes; it does not restyle existing toolbar/table/hero rules.
- No Bank Account Explorer migration onto the kit.
- No backend/API/schema/route/permission/validation/calculation/workflow changes. No new endpoints, no customer/equipment pre-select deep-links, no Email-PDF/Duplicate/Transfer/km/Print-card features (all confirmed absent and left out).

---

## 9. Deliverables

- 6 new ExplorerKit drawer primitives + their CSS (additive).
- `CustomerHub` + `EquipmentHub` components; `ResourcePage` hub registry with flat fallback.
- Invoice drawer recomposed onto the primitives (handlers/data untouched).
- Unit/smoke tests for primitives + hubs.
- Final report: shared components added/updated, pages affected, reusable improvements, before/after screenshots of the three reference drawers, and confirmation that no business logic/backend/workflow changed.
