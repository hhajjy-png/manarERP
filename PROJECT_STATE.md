# PROJECT_STATE.md — manarERP

> Live state document. Update this file at the end of every session (Step 16 of the mandatory workflow).
> Read at session start AFTER AGENTS.md and CLAUDE.md.

---

## Current Production Baseline

| Field | Value |
|-------|-------|
| **Branch** | `production` |
| **HEAD** | `08cc8e3` — Merge feature/page-level-improvements-phase1 into production |
| **Stable tag** | `stable-page-level-improvements-v1` |
| **Remote sync** | `origin/production` — up to date |
| **DB state** | Operational reset completed 2026-06-09 — clean slate, seed data only |
| **DB path (dev)** | `backend/data/manar.db` |
| **DB path (prod)** | `userData/data/manar.db` |
| **DB backup (pre-reset)** | `backend/data/backups/manar_RESET_BACKUP_20260609_040414.db` |

---

## Completed Features (Newest First)

| Feature | Branch | Stable Tag | Notes |
|---------|--------|-----------|-------|
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

The backend audit module is fully implemented — `GET /api/audit` exists, all mutations are logged.
Missing: a frontend viewer page so operators can browse the audit trail.

- Add `frontend/src/pages/AuditLog.tsx`
- Register route in `App.tsx`
- Add nav entry in `modules.tsx` under `nav.group.system` (gated by `audit.read`)
- No backend changes required
- Run `superpowers:brainstorming` before implementing

### 2. Cheques Print Calibration (Phase 3 — deferred)

Print output phase complete. Screen preview shows cheque image with 4 overlaid fields.
Only physical paper calibration remains.

- Add `@page { size: <W>mm <H>mm; margin: 0; }` with exact Gulf Bank cheque dimensions
- Tune `top` / `left` / `width` percentages in `ChequePrintOutput` until text lands correctly on paper
- **Blocked on**: access to actual bank cheque paper to measure and test against
- Do NOT implement without real paper to verify alignment

### 3. Small Operational Improvements

Page-level polish on existing modules as issues are discovered during daily use.
Examples: column widths, filter defaults, sort order, label clarity.

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
| Attendance | — | — | Schema only |
| Payroll | `modules/payroll/` | `Salaries.tsx` | Complete |
| Equipment | `modules/equipment/` | `ResourcePage` | Complete |
| Maintenance | `modules/maintenance/` | — | Backend only — no frontend page |
| Contracts | `modules/contracts/` | `ResourcePage` | Complete |
| Invoices | `modules/invoices/` | `Invoices.tsx` | Complete |
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

*Last updated: 2026-06-09 — Page-Level Improvements Phase 1 released; baseline advanced to `08cc8e3`.*
