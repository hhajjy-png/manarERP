# PROJECT_STATE.md — manarERP

> Live state document. Update this file at the end of every session (Step 16 of the mandatory workflow).
> Read at session start AFTER AGENTS.md and CLAUDE.md.

---

## Current Production Baseline

| Field | Value |
|-------|-------|
| **Branch** | `production` |
| **HEAD** | `f55c65e` — Merge feature/attendance-ui-completion into production |
| **Stable tag** | `stable-attendance-ui-completion-v1` |
| **Remote sync** | `origin/production` — up to date |
| **DB state** | Operational reset completed 2026-06-09 — clean slate, seed data only |
| **DB path (dev)** | `backend/data/manar.db` |
| **DB path (prod)** | `userData/data/manar.db` |
| **DB backup (pre-reset)** | `backend/data/backups/manar_RESET_BACKUP_20260609_040414.db` |

---

## Completed Features (Newest First)

| Feature | Branch | Stable Tag | Notes |
|---------|--------|-----------|-------|
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

## Next Recommended Tasks

Priority order based on value vs. effort for this local internal ERP.

### 1. Audit Log Viewer (frontend page)

Backend fully implemented — `GET /api/audit` exists, all mutations are logged.
Missing: a dedicated frontend viewer (the `AuditLog.tsx` page was scaffolded but may need completion).

- Filters: module, action, user, date range, entity ID
- Details modal showing old/new value diff
- Register route in `App.tsx`, add nav entry gated by `audit.read`
- No backend changes required

### 2. Attendance Pagination

Current `listAttendance` returns all records (up to `pageSize: 500`).
As attendance data grows this will become slow.

- Add `getPagination` + `buildPaginatedResult` to `listAttendance` (matches employees list pattern)
- Update frontend `DataTable` `meta` prop + `onPage` handler in `Attendance.tsx`
- No schema changes required

### 3. Operational UX Improvements

Small quality-of-life improvements across existing modules.

- Historical attendance filtering: allow inactive/terminated employees in the employee dropdown
- Improve empty-state messaging consistency across pages
- Date format standardization in exports

### 4. API Rate Limiting (optional security hardening)

Lightweight measure to protect the local Express API from accidental or malicious request flooding.

- Express middleware (e.g., `express-rate-limit`) on sensitive endpoints
- Low implementation cost, low risk
- Not critical for offline-only desktop use but good hygiene

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
| Dashboard | `modules/dashboard/` | `Dashboard.tsx` | Complete |
| Customers | `modules/customers/` | `ResourcePage` | Complete |
| Employees | `modules/employees/` | `ResourcePage` | Complete |
| Attendance | `employees module` | `Attendance.tsx` | Production Ready — CRUD, KPI cards, filters, search, modals |
| Payroll | `modules/payroll/` | `Salaries.tsx` | Complete |
| Equipment | `modules/equipment/` | `ResourcePage` | Complete |
| Maintenance | `modules/maintenance/` | `Maintenance.tsx` | Production Ready — full CRUD, search, filters, details modal |
| Contracts | `modules/contracts/` | `ResourcePage` | Complete |
| Invoices | `modules/invoices/` | `Invoices.tsx` | Complete — custom type/direction fields added |
| Prices | `modules/prices/` | `Prices.tsx` | Complete — project unit prices with soft delete |
| Suppliers | `modules/suppliers/` | `ResourcePage` | Complete |
| Expenses | `modules/expenses/` | `ResourcePage` | Complete |
| Transactions | `modules/transactions/` | `Accounting.tsx` | Complete |
| Accounting | `modules/accounting/` | `Accounting.tsx` | Complete |
| Reports | `modules/reports/` | `Reports.tsx` | Complete |
| Users | `modules/users/` | `Users.tsx` | Complete |
| Roles | `modules/roles/` | `Users.tsx` | Complete |
| Audit | `modules/audit/` | — | Backend complete — no frontend viewer yet |
| Backups | `modules/backups/` | `Backup.tsx` | Complete |
| Settings | `modules/settings/` | `Settings.tsx` | Complete |
| Cheques | `modules/cheques/` | `Cheques.tsx` | Complete — tafqeet integrated |
| Inventory | `modules/inventory/` | `Inventory.tsx` | Complete |
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
| *(none)* | — | All feature branches merged as of 2026-06-09 |

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

*Last updated: 2026-06-10 — Attendance UI Completion released; baseline advanced to `f55c65e` (`stable-attendance-ui-completion-v1`). Also documenting: Maintenance Module Completion (`stable-maintenance-completion-v1`) and Test Coverage Foundation (`stable-test-coverage-foundation-v1`) released earlier this session.*
