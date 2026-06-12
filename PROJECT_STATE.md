# PROJECT_STATE.md — manarERP

> Live state document. Update this file at the end of every session (Step 16 of the mandatory workflow).
> Read at session start AFTER AGENTS.md and CLAUDE.md.

---

## Current Production Baseline

| Field | Value |
|-------|-------|
| **Branch** | `production` |
| **HEAD** | `5f71d5a` — docs: update development workflow v3 model routing |
| **Stable tag** | `stable-contracts-price-binding-v1` |
| **Remote sync** | `origin/production` — up to date |
| **DB state** | Operational reset completed 2026-06-09 — clean slate, seed data only |
| **DB path (dev)** | `backend/data/manar.db` |
| **DB path (prod)** | `userData/data/manar.db` |
| **DB backup (pre-reset)** | `backend/data/backups/manar_RESET_BACKUP_20260609_040414.db` |

---

## Completed Features (Newest First)

| Feature | Branch | Stable Tag | Notes |
|---------|--------|-----------|-------|
| Development Workflow v3.0 | `production` (direct commit) | — | Documentation only. No code changes. Three workflow modes (Quick Fix, Feature, Major System), model routing policy (Sonnet default, Opus escalation, Gemini mandatory review, ChatGPT PM), Implementation Reference appendix restored: pre-implementation checklist, `/simplify` + `/code-review` + `/security-review` quality gates, Gemini report template (10 sections), merge verification commands, commit message format, tag and push rules, rollback procedure. CLAUDE.md updated with v3.0 workflow section and appendix reference. HEAD: `5f71d5a`. |
| Contracts Price Binding | `feature/contracts-price-binding` | `stable-contracts-price-binding-v1` | Frontend-only. Linked Price selector added to Contracts page. Auto-fills `asphaltPlant`, `companyName`, `location`, `unitName`, `price` when user selects a price. Customer column added to Contracts DataTable. Existing field values remain editable after auto-fill. No backend/schema/permission changes. **Implementation detail:** `linkedPrice` selector sends the selected price record ID to the backend but is silently stripped by Zod (`contracts.schema.ts` does not declare `linkedPrice`). No `linkedPriceId` FK exists in `schema.prisma`. No migration required. Only the 5 auto-filled fields are actually persisted. |
| Remove DataTable Sticky Header | `hotfix/remove-datatable-sticky-header` | `stable-remove-datatable-sticky-header-v1` | Frontend-only. Sticky column headers removed from `theme.css` — eliminates the first-row overlap issue introduced in DataTable Enhancement Phase 1. Zebra row stripes and hover styling preserved. |
| Operational Feedback Phase 1 | `feature/operational-feedback-phase1` | `stable-operational-feedback-phase1-v1` | Frontend-only. Equipment registration expiry split into two columns: Expiry Date and Remaining Duration. Invoice price picker UX clarification. DataTable first-row visibility fixes. Miscellaneous operational feedback improvements. |
| Executive Dashboard V3A-Lite | `feature/executive-dashboard-v3-planning` | `stable-executive-dashboard-v3a-lite-v1` | Frontend-only. Dashboard sub-components are now fully i18n-compliant: AlertPanel, ContractProgressCard, ContractStatusChart, LatestExpensesTable, LatestInvoicesTable, RevenueChart. 25 hardcoded Arabic strings removed; 10 new i18n key pairs added (AR+EN). `STATUS_MAP`/`STATUS_PILL` tuples refactored to `STATUS_COLOR` maps — labels now via `t('contract.status.*')`, `t('inv.status.*')`, `t('exp.status.*')`. All-time label `منذ التأسيس / All time` added as `sub` prop to Revenue, Expenses, Net Profit KPI cards (excluded from Unpaid Invoices which shows current outstanding). Weekend attendance empty state: if `today.getDay() === 5 || 6` (Kuwait Friday/Saturday) and `att.total === 0`, shows 🏖️ + `t('att.weekend')` instead of generic empty state. No backend/API/schema/permission changes. KPI grid replacement deferred. Period filter deferred. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Page Headers Standardization | `feature/ui-page-headers-standardization` | `stable-ui-page-headers-standardization-v1` | Frontend-only. Standardized page header markup across 2 non-ResourcePage pages: `Cheques.tsx` (`page-header` → `page-head` class, `<h1>` → `<h2>`); `DataImport.tsx` (inline styles replaced with `page-head` class + standard `<h2>`/`<p>` structure). Consistent with ResourcePage and other page headers. No i18n, no backend changes. |
| DataTable Enhancement Phase 1 | `feature/ui-datatables-enhancement-phase1` | `stable-ui-datatables-enhancement-phase1-v1` | Frontend-only. `theme.css` global table improvements: sticky column headers (`position: sticky; top: 49px` — accounts for 49px topbar height); alternating row stripes (`tbody tr:nth-child(even) td { background: var(--surface-2) }`); hover highlight updated to rgba tokens (light: `rgba(59,130,246,0.06)`, dark: `rgba(255,255,255,0.07)`); row hover `transition: background 0.15s ease`; header border changed to `2px` with `background: var(--surface-2)`; pagination `border-top` separator added; tighter cell padding (12px top/bottom for headers, 14px for rows). No i18n, no backend changes. **Note:** sticky headers were removed in `stable-remove-datatable-sticky-header-v1` and are not present in current production. Zebra rows, rgba hover tokens, and pagination border-top separator remain. |
| Operational Polish Phase 1B | `feature/operational-polish-phase1b` | `stable-operational-polish-phase1b-v1` | Frontend-only. 5 UX consistency improvements: (1) DataTable row-range indicator in pagination — `عرض {from}–{to} من {total}` replaces total-only display on multi-page views; 2 new i18n key pairs (`msg.showing_range`, `page.reports.date_range_hint`). (2) Reports `fmt()` number formatting — added `minimumFractionDigits: 0` to match `money()` options exactly. (3) Reports date-range guidance — soft informational hint for invoices, expenses, payroll report types when no date range is set; non-blocking. (4) ResourcePage visible status filter label — bare `<select>` now shows `فلترة:` label instead of tooltip-only, consistent with toolbar conventions. (5) Dashboard "View All" links — Latest Invoices and Latest Expenses cards now have navigation buttons (→ `/invoices`, → `/expenses`), gated on `!loading && items.length > 0`, consistent with existing Contracts card. No backend/schema/permission changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Operational Polish Phase 1A | `feature/operational-polish-phase1a` | `stable-operational-polish-phase1a-v1` | Frontend-only. 6 UX quick wins from the Operational Polish Audit: (1) Dashboard quick action buttons gated by `hasPermission('<module>.create')` — users without create permissions no longer see inapplicable actions. (2) Expense `date` field marked `required: true` — expenses without accounting dates are blocked at form submit. (3) Expense contract selector now uses `optionLabel: 'code'` — contract codes (unique) prevent duplicate-label ambiguity vs. plant names. (4) ResourcePage contracts/equipment stats strip fully localized — 8 hardcoded Arabic strings replaced with `t('stat.rp.*')` calls; 9 new i18n key pairs (AR+EN). (5) Approve/reject expense actions now prompt `confirm()` before API call — prevents misclick approvals. (6) Customer report filter label changed from generic "status" to "نوع العميل" / "Customer Type" via optional `statusLabel` on `ReportType`; all other report types unaffected. 14 new i18n key pairs total. No backend/schema/permission changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Operational Polish Hotfix 1 | `feature/operational-polish-invoice-year-prefix` | `stable-operational-polish-hotfix1-v1` | Frontend-only. One-line fix: `const invoicePrefix = 'MN-INV-2026-'` → `` `MN-INV-${new Date().getFullYear()}-` ``. Invoice number prefix was hardcoded to year 2026 — would have produced wrong prefixes on every January 1st rollover indefinitely. Now derives year from runtime clock. No backend/schema changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Prices Lookup Cleanup | `feature/prices-lookup-cleanup` | `stable-prices-lookup-cleanup-v1` | Backend-only refactor. Removed unused `GET /prices/lookup` endpoint — route, controller handler (`lookup`), service function (`lookupPrice`), and `lookupPriceSchema`. Zero frontend callers, zero test coverage, `findFirst` semantics were misleading (no uniqueness guarantee). Phase 3 auto-fill uses local price data instead. 38 lines removed, no functionality lost. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Project Prices Phase 3 | `feature/project-prices-phase3-smart-lookup` | `stable-project-prices-phase3-v1` | Frontend-only. Auto-fills `unitPrice` when user selects a contract unit and exactly one price exists for that unit in the loaded prices. Uses `priceTouched` flag (client-only, stripped from API payload) to detect manual edits — never overwrites a price the user has typed or picked manually. Uses local `prices` array instead of calling `GET /prices/lookup` per unit change (endpoint uses `findFirst` and cannot confirm uniqueness without a count; local data is already in memory). Picker remains visible as fallback when multiple prices match. No backend/schema/permission changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Project Prices Phase 2C | `feature/project-prices-phase2c` | `stable-project-prices-phase2c-v1` | Frontend-only. Invoice price picker now filters by current row's contract unit — only matching prices shown. Picker button hidden when no prices exist for that unit. Picker closes automatically on unit change (prevents ghost state). `contractLocation` added to picker rows; redundant `contractUnit` column removed. Prices page: `emptyText`, `isFiltered`, `onResetFilters` added to DataTable. 4 new i18n keys (AR+EN): `empty.prices`, `ph.prices.picker_btn`, `ph.prices.picker_list`, `msg.no_prices_for_unit`. No backend/schema changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Operational Stabilization Phase 2 | `feature/operational-stabilization-phase2-i18n-audit` | `stable-operational-stabilization-phase2-v1` | Frontend-only. Hardcoded Arabic strings replaced with i18n keys across 4 pages: Settings field labels (7 labels → `t()` calls), Dashboard equipment/vehicle alert titles and expired/expiring text (3 keys with `{days}` interpolation), Dashboard invoice status subtitle (`{count}` interpolation), Reports print button label. 10 new i18n key pairs (AR+EN). No backend/schema changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Operational Stabilization Phase 1 | `feature/operational-stabilization-phase1` | `stable-operational-stabilization-phase1-v1` | Frontend-only. Fixed missing i18n keys: `perm.module.inventory` and `perm.module.cheques` added to DICT. Fixed Attendance status badge rendering in EN mode (status values were Arabic-only, now resolved via t() keys). No backend/schema changes. Gemini: APPROVED. |
| Project Prices Phase 2B | `feature/project-prices-phase2b` | `stable-project-prices-phase2b-v1` | Backend-only. `GET /prices/lookup?asphaltPlant=&companyName=&contractUnit=&contractLocation=` — finds first matching price. All params optional. Route registered before `/:id` to avoid conflict. Endpoint exists and is ready; frontend auto-lookup not yet wired (deferred to Phase 3). 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Project Prices Phase 2A | `feature/project-prices-phase2a` | `stable-project-prices-phase2a-v1` | Frontend-only. Price picker added to each invoice item row in `CreateInvoice`. Loads all prices via `GET /prices?pageSize=200`. `openPickerIdx` tracks which row's picker is open. `applyPrice(i, p)` copies `unitPrice` and `contractUnit` to item. Clipping fix: `overflow: visible` + `position: relative` on price cell. No backend/schema changes. Gemini: APPROVED. |
| Operational UX Phase 1B-A | `feature/operational-ux-phase1b-a` | `stable-operational-ux-phase1b-a-v1` | Frontend-only. Standardized empty states for all 9 surfaces: Contracts, Customers, Suppliers, Equipment, Employees, Expenses, Users (via `emptyText?` on `ModuleConfig`), Invoices, Attendance. Unsaved changes protection: `onBeforeClose?: () => boolean` guard on `Modal` shared component; `isDirty` + `canClose()` on `FormDialog` shared forms; `createGuardClose`/`editGuardClose` on Attendance create/edit modals (`useRef` snapshot, `EMPTY_FORM_JSON` hoisting). 9 i18n keys added (AR + EN). No backend/Prisma/RBAC changes. Frontend TS ✓, Backend TS ✓, Electron TS ✓, build:front ✓, build:back ✓, 101/101 tests. Gemini: APPROVED. |
| Attendance Pagination | `feature/attendance-pagination` | `stable-attendance-pagination-v1` | Server-side pagination for `GET /employees/attendance`: skip/take/meta response, `groupBy`-based KPI stats (total/present/absent/late/leave) on full filtered dataset, server-side search over notes/employee fullName/employee code, DataTable meta/onPage integration, employee list fetch decoupled from paginated load. 17 unit tests added — suite now 101/101. Prisma validate ✓, Backend TS ✓, Frontend TS ✓, Electron TS ✓, build:back ✓, build:front ✓. Gemini: APPROVED WITH MINOR NOTES (optional search debounce deferred). |
| Operational UX Phase 1A | `feature/operational-ux-phase1a` | `stable-operational-ux-phase1a-v1` | Frontend: new `usePersistedState` hook; persisted search, filter, page, and tab state across 11 modules (Customers, Suppliers, Contracts, Employees, Equipment, Expenses, Users, Invoices, Attendance, Maintenance, Inventory); refresh buttons on all affected pages; Arabic/English refresh translations. Security: `clearPersistedUIState()` called on logout to prevent cross-user filter/search leakage. Prisma validate ✓, Backend TS ✓, Frontend TS ✓, Electron TS ✓, build:back ✓, build:front ✓, 84/84 tests pass. Gemini: APPROVED. |
| Attendance UI Completion | `feature/attendance-ui-completion` | `stable-attendance-ui-completion-v1` | Backend: `PATCH /employees/attendance/:id`, `DELETE /employees/attendance/:id`, status filter in `listAttendance`, audit log integration, `updateAttendanceSchema`. Frontend: `Attendance.tsx` page with KPI cards (total/present/absent/late), DataTable (8 cols), employee+status+date-range filters (server-side), client-side search, create/edit/details/delete modals, work-hours auto-calc from checkIn/checkOut. Sidebar entry `event_available`. Full Arabic/English i18n. Gemini: APPROVED WITH MINOR NOTES (pagination and inactive-employee filter recommended post-release). No Prisma migration — schema and permissions pre-existed. |
| Maintenance Module Completion | `feature/maintenance-completion` | `stable-maintenance-completion-v1` | Backend: `PATCH /maintenance/records/:id`, `DELETE /maintenance/records/:id`, type/dateFrom/dateTo/status filters, `updateMaintenanceSchema`, CANCELLED status. Frontend: `Maintenance.tsx` rewritten with full CRUD modals (Create/Edit/Details/Delete), client-side search, equipment+type+status+date filters, equipment name shown alongside code. Replaced all `alert()` with inline errors. |
| Test Coverage Foundation | `feature/test-coverage-foundation` | `stable-test-coverage-foundation-v1` | RED→GREEN→REFACTOR TDD cycle for payroll and accounting. Fixed 2 wrong test assertions (`tafqeet.test.ts`: 1.005 fils fix; `payroll.calc.test.ts`: deductions arg position fix). REFACTOR: `payroll.service.ts` imports from `payroll.calc.ts`; `accounting.service.ts` uses `validateJournalBalance`. 84/84 tests pass. |
| Invoice Custom Type / Direction | `feature/prices-and-invoice-custom-fields` | `stable-project-prices-phase1-v1` | Custom free-text invoice types (نقل اسفلت / يومية / أخرى) and custom directions (SALES / PURCHASE / OTHER with free-text). i18n fix: direction column uses `t('opt.direction.sales')` / `t('opt.direction.purchase')` — hardcoded Arabic removed. |
| Project Prices Phase 1 | `feature/prices-and-invoice-custom-fields` | `stable-project-prices-phase1-v1` | New `ProjectPrice` model + migration `20260610140000_add-project-prices`. Full backend module (routes/controller/service/schema). Frontend `Prices.tsx` page with CRUD + soft delete (`isArchived`). RBAC: `prices.read`, `prices.create`, `prices.update`, `prices.delete`. |
| UI Adoption Phase 1 | `feature/ui-adoption-phase1` | `stable-ui-adoption-phase1-v1` | DESIGN.md created (814-line design system guide). Dashboard CSS: 5 `--db-*` color/radius vars migrated to global tokens (`var(--accent/green/amber/red/radius)`). ~35 hardcoded hex values replaced with `var(--db-*)` in pills, alerts, exec-chips, aw-widgets, kpi gradients. Topbar height corrected to 49px in dashboard. No schema or backend changes. |
| Page-Level Improvements Phase 1 | `feature/page-level-improvements-phase1` | `stable-page-level-improvements-v1` | Frontend UX improvements: status/type filters on Customers, Employees, Equipment, Expenses; status+direction filters on Invoices; search+status filter on Cheques history; reset-filters button and row count on Reports; labeled actions column header in DataTable. No schema or backend changes. |
| Cheques Print Output Phase | `feature/cheques-print-output-v1` | `stable-cheques-print-output-v1` | Gulf Bank cheque image background; 4 overlay fields (beneficiary, date, tafqeet, numeric amount); image hidden on print for real paper; pt font units; NaN-guarded tafqeet. Physical calibration deferred — blocked on real cheque paper dimensions. |
| Cheques Improvements Phase 1+2 | `feature/cheques-improvements-v1` | `stable-cheques-improvements-v1` | Schema validation (enum currency, date bounds, chequeNumber format), enriched audit log, bank select (10 Kuwaiti banks), form field reorder, notes placeholder, dead code removal |
| Alert Deduplication | `feature/alerts-dedup` | `stable-alerts-dedup-v1` | Remove vehicleLicenseExpiry from employee alerts; equipment.registrationExpiry is sole source |
| Audit Log Viewer | `feature/audit-log-viewer` | — | Frontend viewer for AuditLog table |
| Cheques Tafqeet Phase 2 | `feature/cheques-tafqeet-phase2` | `stable-cheques-tafqeet-v1` | Arabic amount-in-words (tafqeet) for KWD cheques |
| Cheques Enhancement Phase 1 | `feature/cheques-enhancement-phase1` | `stable-cheques-enhancement-phase1-v1` | Print guards, status-machine refinements, audit logging |
| Full Operational Data Reset | — (script-only) | — | 91 rows cleared, seed re-applied, 2026-06-09 |
| Employee Import — Extended Fields | `feature/employee-import-extended-fields` | `stable-employee-import-extended-fields-v1` | Arabic header support added |
| Data Import Phase 1 | `feature/data-import-phase1` | `stable-data-import-phase1-v1` | Base import infrastructure |
| Cheques Management | `feature/cheques-management` | `stable-cheques-management-v1.1` | Finance module |
| i18n Phase 5 | `feature/i18n-phase5-remaining-modules` | `stable-i18n-phase5-v1` | Full localization pass |
| i18n Phase 4 | `feature/i18n-phase4-ui-standardization` | `stable-i18n-phase4-v1` | UI standardization |
| i18n Phase 3 | `feature/i18n-phase3-business-pages` | — | Business pages |
| Reports & Export Center | `feature/reports-export-center` | `stable-reports-center-v1` | ExcelJS + PDFKit |
| Executive Dashboard v2 | `feature/executive-dashboard-v2` | `stable-executive-dashboard-v2` | KPIs + charts |
| Payroll System | `feature/payroll-system` | `stable-payroll-system-v1` | Full payroll workflow |
| Roles & Permissions | `feature/roles-permissions` | `stable-roles-permissions-v1` | RBAC system |
| Backup & Restore | `feature/backup-restore` | `stable-backup-restore-v1` | IPC-based backup |

---

## Operational Feedback Audit — 2026-06-12

Verified against production HEAD `5f71d5a`. Code evidence confirmed in `theme.css`, `modules.tsx`, `FormDialog.tsx`, `Invoices.tsx`, `Dashboard.tsx`, `Reports.tsx`, `DataTable.tsx`, `ResourcePage.tsx`.

| # | Observation | Status | Released In | Stable Tag |
|---|---|---|---|---|
| 1 | Equipment registration expiry split into Expiry Date + Remaining Duration | **IMPLEMENTED** | Operational Feedback Phase 1 | `stable-operational-feedback-phase1-v1` |
| 2 | Contract form auto-fill from Prices | **IMPLEMENTED** | Contracts Price Binding | `stable-contracts-price-binding-v1` |
| 3 | Customer visibility in Contracts table | **IMPLEMENTED** | Contracts Price Binding | `stable-contracts-price-binding-v1` |
| 4 | Invoice price picker UX clarification | **IMPLEMENTED** | Operational Feedback Phase 1 | `stable-operational-feedback-phase1-v1` |
| 5 | First-row hidden in tables | **IMPLEMENTED** | Remove DataTable Sticky Header | `stable-remove-datatable-sticky-header-v1` |
| 6 | White gap under table headers | **IMPLEMENTED** | Remove DataTable Sticky Header | `stable-remove-datatable-sticky-header-v1` |
| 7 | Equipment ↔ Plate Number linked selectors | **OPEN** | — | — |

**DataTable current state (confirmed):** No sticky headers. Zebra rows (`tbody tr:nth-child(even)`), rgba hover tokens, `box-shadow: inset 0 -2px` header border, and pagination `border-top` separator all present. Row-range indicator (`showing_range`) in pagination present. Filter label visible in ResourcePage toolbar.

---

## Next Recommended Tasks

### 1. Equipment Plate Integration Phase 1 (Next Recommended)

Link Equipment and Plate Number selectors in operational forms. When a user selects an equipment record, the plate number should auto-populate in the same form row.

Scope:
- Maintenance forms
- Fuel logs
- Breakdown forms
- Spare Parts forms

Implementation approach:
- Prefer frontend-only: the equipment API response already includes `plateNumber` — use the same `onSelectRaw`-style auto-fill pattern proven in Contracts Price Binding
- No schema changes unless the equipment endpoint does not return `plateNumber`
- No backend changes unless proven necessary
- `Maintenance.tsx` uses custom form rendering (not `FormDialog`/`ResourcePage`) — update that file directly

### 2. Continued Operational Feedback Collection

Continue observing daily use for friction points before investing in larger features.

- Form simplification opportunities
- Workflow refinements based on actual usage patterns
- Any new friction points surfaced by real use

### 3. Optional Contracts UX Improvements

- Review advanced contract fields for simplification opportunities
- Evaluate further customer visibility improvements

---

## Open Operational Notes

1. **Equipment ↔ Plate Number linked selectors** — **OPEN.** Not yet implemented. Apply to Maintenance, Fuel, Breakdowns, and Spare Parts forms. See Next Recommended Tasks §1.
2. **Contract form simplification** — Optional. Review advanced contract fields for simplification opportunities.
3. **Continue operational UX feedback collection** — Ongoing. Observe daily use and surface friction points.

---

## Mandatory Development Workflow

Execute every step for every feature, bug fix, or enhancement. No exceptions.

```
Step 1:  git checkout production
Step 2:  git pull origin production         (verify clean tree)
Step 3:  git tag pre-<feature-slug>         (rollback checkpoint)
Step 4:  git checkout -b feature/<slug>
Step 5:  Implement (follow module pattern)
Step 6:  Run all validations:
           cd backend && npx tsc --noEmit
           cd frontend && npx tsc --noEmit
           tsc -p electron/tsconfig.json --noEmit
           npm run build:back
           npm run build:front
Step 7:  /simplify                          (Phase 4)
Step 8:  /code-review                       (Phase 5)
Step 9:  /security-review                   (Phase 6)
Step 10: Gemini review (architecture + security + production readiness)
Step 11: Fix all findings, re-run validations
Step 12: git commit (show diff + message draft, await approval)
Step 13: git checkout production
Step 14: git merge --no-ff feature/<slug>
Step 15: Verify: git log, tsc, builds
Step 16: git tag stable-<feature-slug>-v<n>
Step 17: git push origin production          (await approval)
Step 18: git push origin --tags              (await approval)
Step 19: Update this file (PROJECT_STATE.md)
Step 20: Confirm clean working tree
```

### Tag Naming Convention

```
Checkpoint (pre-feature):   pre-<feature-slug>
Stable release:             stable-<feature-slug>-v<n>

Examples:
  pre-cheques-enhancement
  stable-cheques-enhancement-v1
```

### Git Safety Rules

| Action | Policy |
|--------|--------|
| `git push` | Never automatic — always confirm with user |
| `git merge` | Always `--no-ff`, always confirm |
| `git tag` | Always confirm before pushing |
| `git reset --hard` | Never without explicit user request |
| `git clean -fd` | Never without explicit user request |
| Modify `production` directly | NEVER |

---

## Project Constraints

### What manarERP IS

- Local Electron desktop application (Windows)
- Offline-only — no internet required at runtime
- SQLite database — single file, easy backup
- Small internal ERP for one contracting company
- Arabic-first UI, English codebase
- Kuwaiti Dinar (د.ك), 3 decimal places

### What manarERP IS NOT

- SaaS — no multi-tenancy, no subscriptions
- Enterprise platform — no microservices, no Kubernetes
- Cloud-native — no cloud database, no hosted API
- Public product — no external users, no marketplace

### Design Principles

- Simplicity over cleverness
- Reliability over features
- Maintainability over abstraction
- Fast backup and recovery
- Minimal operational overhead
- Internal workflows only

### When Multiple Solutions Exist

**Always choose the simplest maintainable solution.**

### AI Model Routing Policy

| Task Type | Model |
|-----------|-------|
| Routine implementation (CRUD, UI, fixes, i18n, builds) | Claude Sonnet 4.6 (default) |
| Architecture decisions, large refactors, complex debugging | Claude Opus 4.8 (escalate only) |
| Log summaries, doc extraction, quick searches | Claude Haiku 4.5 (utility only) |
| Architecture / security audit | Gemini 3.1 Pro |
| Project management / workflow | ChatGPT |

Return to Sonnet 4.6 after any Opus escalation completes.

---

## Dev Port Policy

| Project | Port | URL |
|---------|------|-----|
| manarERP frontend (Vite) | **5173** | `http://localhost:5173` |
| manarERP backend (Express) | **48211** | `http://127.0.0.1:48211` (localhost only) |
| manar-ui-lab (prototype) | **5174** | `http://localhost:5174` |

### Port Rules

- Port `48211` is reserved for the manarERP backend. It must be free at Electron launch.
- Port `5173` is the manarERP Vite dev server.
- Port `5174` is reserved for `manar-ui-lab` prototypes — never run it on `5173` to avoid conflicts when both projects are open.
- `manar-ui-lab` is a **separate project** at `C:\Users\hhajj\Claude\Projects\manar-ui-lab`. Never modify production from there.

---

## Module Inventory

| Module | Backend | Frontend Page | Status |
|--------|---------|--------------|--------|
| Auth | `modules/auth/` | Login | Complete |
| Dashboard | `modules/dashboard/` | `Dashboard.tsx` | Complete — RBAC-gated quick action buttons (invoices/contracts/customers/expenses create); "View All" navigation buttons on Latest Invoices and Latest Expenses cards; all 6 dashboard sub-components i18n-compliant (V3A-Lite); all-time label on Revenue/Expenses/NetProfit KPI cards; weekend attendance empty state (Friday/Saturday) |
| Customers | `modules/customers/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state |
| Employees | `modules/employees/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state |
| Attendance | `employees module` | `Attendance.tsx` | Production Ready + Server-side Pagination — paginated attendance listing, filter-scoped KPI stats via groupBy, server-side search (notes/employee name/code); persisted filter/search/page state; refresh action; unsaved changes protection (create + edit modals); standardized empty state |
| Payroll | `modules/payroll/` | `Salaries.tsx` | Complete |
| Equipment | `modules/equipment/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state; stats strip fully localized (i18n); separate Expiry Date and Remaining Duration columns |
| Maintenance | `modules/maintenance/` | `Maintenance.tsx` | Production Ready — full CRUD, search, filters, details modal; persisted filter/search/page state; refresh action |
| Contracts | `modules/contracts/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state; stats strip fully localized (i18n); Customer column; Linked Price selector; auto-fill from Prices (asphaltPlant, companyName, location, unitName, price) |
| Invoices | `modules/invoices/` | `Invoices.tsx` | Complete — custom type/direction fields; persisted search, filter, tab, page state; refresh action; standardized empty state; dynamic year prefix on invoice number |
| Prices | `modules/prices/` | `Prices.tsx` | Complete — project unit prices with soft delete; invoice picker filters by contract unit; auto-fill on unit select when exactly one match (`priceTouched` guards manual edits); picker as fallback for multiple matches; `contractLocation` shown in picker; empty state + filter reset UX. Backend: CRUD only (`list`, `create`, `update`, `delete`) — lookup endpoint removed |
| Suppliers | `modules/suppliers/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state |
| Expenses | `modules/expenses/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state; date field required; contract selector uses code (not plant name); approve/reject require confirmation |
| Transactions | `modules/transactions/` | `Accounting.tsx` | Complete |
| Accounting | `modules/accounting/` | `Accounting.tsx` | Complete |
| Reports | `modules/reports/` | `Reports.tsx` | Complete — customer report filter correctly labeled as "نوع العميل" / "Customer Type" (not generic status); `fmt()` uses `minimumFractionDigits: 0` matching `money()` exactly; date-range hint shown for invoices/expenses/payroll when no date range is set |
| Users | `modules/users/` | `Users.tsx` | Complete — persisted search, filter, page state; refresh action; standardized empty state |
| Roles | `modules/roles/` | `Users.tsx` | Complete |
| Audit | `modules/audit/` | — | Backend complete — no frontend viewer yet |
| Backups | `modules/backups/` | `Backup.tsx` | Complete |
| Settings | `modules/settings/` | `Settings.tsx` | Complete |
| Cheques | `modules/cheques/` | `Cheques.tsx` | Complete — tafqeet integrated |
| Inventory | `modules/inventory/` | `Inventory.tsx` | Complete — persisted search, filter, page state; refresh action |
| Data Import | `modules/import/` | `DataImport.tsx` | Complete — employees, customers, equipment |

---

## Validation Checklist (Before Every Commit)

```
[ ] cd backend && npx tsc --noEmit          → 0 errors
[ ] cd frontend && npx tsc --noEmit         → 0 errors
[ ] tsc -p electron/tsconfig.json --noEmit  → 0 errors
[ ] npm run build:back                      → clean compile
[ ] npm run build:front                     → clean build
[ ] cd backend && npx prisma validate       → schema valid
[ ] New permission keys added to constants.ts
[ ] New routes protected by authenticate + requirePermission
[ ] Mutating operations write to AuditLog
[ ] No plain passwords or tokens in DB or logs
[ ] DB migration SQL reviewed before apply (if schema changed)
```

---

## Active Feature Branches (Open / Incomplete)

| Branch | Status | Notes |
|--------|--------|-------|
| *(none)* | — | All feature branches merged as of 2026-06-12 |

> Update this table when a new feature branch is opened.

---

## Seed Data (Post-Reset State)

After the 2026-06-09 operational reset, the database contains only seed data:

| Table | Rows | Content |
|-------|------|---------|
| users | 1 | admin / Admin@123 |
| roles | 7 | SYSTEM_ADMIN, GENERAL_MANAGER, ACCOUNTANT, PROJECT_MANAGER, EQUIPMENT_MANAGER, HR_MANAGER, STANDARD_USER |
| permissions | 93 | All module.action keys |
| role_permissions | 285 | Full RBAC assignments |
| settings | 11 | Company name, tax rate, backup config, etc. |

> **Default credentials:** `admin` / `Admin@123` — change on first login.

---

## Plugin and Skill Quick Reference

| Task | Use |
|------|-----|
| Before any feature design | `superpowers:brainstorming` |
| Multi-step implementation plan | `superpowers:writing-plans` |
| Feature with codebase context | `feature-dev:feature-dev` |
| After implementation — simplify | `/simplify` |
| After simplify — review logic | `/code-review` |
| After code review — review security | `/security-review` |
| Before claiming done | `superpowers:verification-before-completion` |
| Before merge decision | `superpowers:finishing-a-development-branch` |
| Bug investigation | `superpowers:systematic-debugging` |
| Library API docs | `context7: resolve-library-id → query-docs` |
| UI debugging | `chrome-devtools-mcp:chrome-devtools` |
| Large codebase search | `Explore` agent |
| Parallel independent tasks | `superpowers:dispatching-parallel-agents` |

---

*Last updated: 2026-06-12 — Operational Feedback Audit completed; baseline advanced to `5f71d5a`. All 6 of 7 operational observations confirmed IMPLEMENTED in production (code-verified). One item remains OPEN: Equipment ↔ Plate Number linked selectors. Development Workflow v3.0 published: three modes (Quick Fix / Feature / Major System), model routing policy, Implementation Reference appendix. DataTable current state confirmed: no sticky headers, zebra rows and rgba hover tokens present. Contracts Price Binding implementation detail documented: `linkedPrice` is frontend-only helper — no FK in schema, only 5 auto-filled fields persisted. Recommended next: Equipment Plate Integration Phase 1.*
