# AGENTS.md — manarERP

> Permanent operating manual for all Claude Code sessions on this repository.
> Read this file first at the start of every session. These rules OVERRIDE all defaults.

---

## Project Identity

| Field | Value |
|-------|-------|
| System | نظام المنار لإدارة الأعمال |
| Company | شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م |
| Language | Arabic-first UI, English codebase |
| Currency | Kuwaiti Dinar (د.ك), 3 decimal places |
| Platform | Electron desktop app (Windows), offline-only |
| DB Port | `127.0.0.1:48211` (localhost only) |

---

## Primary Responsibilities

You are the implementation agent for this repository. You must:

- Understand existing architecture before changing any code.
- Prefer minimal-risk modifications over clever rewrites.
- Preserve production stability at all times.
- Maintain strict consistency with existing patterns.
- Avoid unnecessary refactoring.

---

## Architecture Overview

```
manarERP/
├── electron/          # Main process: window, IPC, backend launcher, backup scheduler
├── frontend/          # React + Vite renderer (loads via file:// or Vite dev server)
├── backend/           # Express REST API, runs as child process on localhost:48211
├── backend/prisma/    # SQLite schema + migrations
├── docs/              # Arabic documentation + workflow guides
└── scripts/           # Build utilities, data import scripts
```

**Data flow:** Electron forks backend → React frontend calls `http://127.0.0.1:48211/api` → Prisma reads/writes SQLite

**Auth flow:** JWT (12h) → localStorage → Axios `Authorization: Bearer` header → `authenticate` middleware → `requirePermission` guard

**IPC bridge:** `electron/preload.ts` exposes `window.manar.*` via contextBridge (context isolation enabled)

---

## Tech Stack

### Frontend
| Tool | Version | Role |
|------|---------|------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.5.0 | Type safety |
| Vite | 5.3.0 | Build tool |
| React Router | 6.24.0 | HashRouter (Electron file:// compatible) |
| Zustand | 4.5.4 | State management |
| Axios | 1.7.2 | HTTP client with JWT interceptor |
| Recharts | 3.8.1 | Charts and data visualization |
| Chart.js | 4.4.3 | Alternative charting (used in specific components) |
| Tailwind CSS | 4.3.2 | Scoped to the shadcn/ui integration only — see [Styling Architecture](#styling-architecture-officially-approved) |
| shadcn/ui | — | Vendored components under `frontend/src/components/ui/**` |

### Backend
| Tool | Version | Role |
|------|---------|------|
| Express | 4.19.2 | REST API |
| TypeScript | 5.5.0 | Type safety |
| Prisma | 5.18.0 | ORM |
| SQLite | — | Database (local file) |
| jsonwebtoken | 9.0.2 | Session tokens |
| bcryptjs | 2.4.3 | Password hashing |
| Zod | 3.23.8 | Request validation |
| Helmet | 7.1.0 | Security headers |
| ExcelJS | 4.4.0 | Excel export |
| PDFKit | 0.15.0 | PDF generation |
| Vitest | 2.0.0 | Unit testing |

### Electron
| Tool | Version | Role |
|------|---------|------|
| Electron | 31.0.0 | Desktop shell |
| electron-builder | 24.13.3 | NSIS installer (Windows) |
| concurrently | 8.2.2 | Dev runner |
| node-cron | — | Automatic backup scheduler |

---

## Folder Structure

### Frontend (`frontend/src/`)
```
api/client.ts              # Axios instance, token management, global interceptors
components/
  DataTable.tsx            # Reusable data grid (search, sort, pagination)
  FormDialog.tsx           # Generic form modal builder
  Layout.tsx               # Main shell: sidebar + topbar
  ProtectedRoute.tsx       # RBAC route guard
  dashboard/               # Dashboard-specific components
config/modules.tsx         # ModuleConfig[] drives all ResourcePage instances
pages/
  Dashboard.tsx            # KPIs, charts, recent data
  ResourcePage.tsx         # Generic CRUD (data-driven — see modules.tsx)
  Invoices.tsx             # Sales/purchase invoices with line items & payments
  Salaries.tsx             # Payroll management & approval workflow
  Accounting.tsx           # Transactions, ledger, P&L
  Reports.tsx              # Report generation & export
  PayrollPayslip.tsx       # Payslip print layout
  ReportPrint.tsx          # Print-optimized report layout
  Users.tsx                # User/role/permission management
  Backup.tsx               # Backup/restore via Electron IPC
  Settings.tsx             # Application settings
stores/
  authStore.ts             # Zustand: user, login, logout, hasPermission
  uiStore.ts               # UI state
```

### Backend (`backend/src/`)
```
config/
  constants.ts             # ROLES, MODULES, ACTIONS, ENUMS (source of truth for all types)
  database.ts              # Prisma client singleton
  env.ts                   # Zod-validated env vars
core/
  middleware/
    auth.middleware.ts     # JWT verification, loads user + permissions
    rbac.middleware.ts     # requirePermission(), requireRole()
    validate.middleware.ts # Zod request validation
    audit.ts               # Action logging to AuditLog table
  errors/
    AppError.ts            # Custom error class
    errorHandler.ts        # Express global error handler
  utils/
    jwt.ts, password.ts, response.ts, pagination.ts, asyncHandler.ts, logger.ts
modules/
  auth/            customers/       contracts/       invoices/
  expenses/        employees/       payroll/         salaries/
  equipment/       maintenance/     transactions/    accounting/
  reports/         dashboard/       users/           roles/
  audit/           backups/         settings/        suppliers/
shared/
  repositories/BaseRepository.ts    # Generic CRUD patterns
  services/
    backup.service.ts               # File I/O for DB backups
    reportEngine/excel.service.ts   # ExcelJS wrapper
    reportEngine/pdf.service.ts     # PDFKit wrapper
```

### Electron (`electron/`)
```
main.ts                    # App bootstrap: IPC + backend + scheduler + window
preload.ts                 # contextBridge → window.manar.*
services/
  backendLauncher.ts       # Fork backend child process (dev: tsx, prod: node dist/)
  backupScheduler.ts       # node-cron automatic backups
ipc/
  backup.ipc.ts            # backup:create, backup:restore, backup:getDatabasePath
  dialog.ipc.ts            # File open/save dialogs
  session.ipc.ts           # Sync JWT token to main process
windows/mainWindow.ts      # BrowserWindow config (1440×900, min 1024×680)
```

---

## Database Models (from `backend/prisma/schema.prisma`)

| Model | Table | Purpose |
|-------|-------|---------|
| User | users | System users linked to roles and optionally employees |
| Role | roles | RBAC roles (SYSTEM_ADMIN bypasses all checks) |
| Permission | permissions | Permission keys: `<module>.<action>` |
| RolePermission | role_permissions | M2M join between roles and permissions |
| Customer | customers | Clients (GOVERNMENT / PRIVATE) |
| Employee | employees | Staff with HR fields, linked to User optionally |
| Attendance | attendance | Daily check-in/check-out records |
| Leave | leaves | Leave requests with approval status |
| Deduction | deductions | One-off employee deductions |
| Bonus | bonuses | One-off employee bonuses |
| Payroll | payroll | Monthly payroll records per employee |
| PayrollLine | payroll_lines | Line items inside a payroll (BASE / ALLOWANCE / DEDUCTION / ADVANCE / OVERTIME) |
| EmployeeAllowance | employee_allowances | Recurring allowances per employee |
| EmployeeRecurringDeduction | employee_recurring_deductions | Recurring deductions per employee |
| PayrollAdvance | payroll_advances | Salary advances with remaining balance |
| PerformanceReview | performance_reviews | Employee performance scores by period |
| Equipment | equipment | Heavy equipment fleet |
| MaintenanceRecord | maintenance_records | Maintenance history per equipment |
| FuelLog | fuel_logs | Fuel consumption logs |
| Breakdown | breakdowns | Equipment breakdowns and resolutions |
| SparePartUsage | spare_part_usage | Spare parts consumed per equipment |
| Contract | contracts | Asphalt transport contracts |
| ContractDocument | contract_documents | Attached documents for contracts |
| Supplier | suppliers | Vendors/suppliers |
| Invoice | invoices | Sales (SALES) and purchase (PURCHASE) invoices |
| InvoiceItem | invoice_items | Line items inside invoices |
| Payment | payments | Payments against invoices |
| Expense | expenses | Operational expenses with approval workflow |
| Transaction | transactions | Simple accounting journal entries |
| Account | accounts | Chart of accounts with hierarchy |
| JournalEntry | journal_entries | Double-entry journal entries |
| JournalEntryLine | journal_entry_lines | Debit/credit lines per journal entry |
| AuditLog | audit_logs | Full audit trail for all actions |
| Backup | backups | Backup file records |
| Setting | settings | Key-value settings store |
| SalaryPayment | salary_payments | Salary payment records from bank imports |

---

## RBAC: Roles and Modules

### Roles (from `constants.ts`)
| Key | Display |
|-----|---------|
| `SYSTEM_ADMIN` | مدير النظام — bypasses all permission checks |
| `GENERAL_MANAGER` | المدير العام |
| `ACCOUNTANT` | المحاسب |
| `PROJECT_MANAGER` | مدير العقود |
| `EQUIPMENT_MANAGER` | مسؤول المعدات |
| `HR_MANAGER` | مسؤول الموارد البشرية |
| `STANDARD_USER` | مستخدم عادي |

### Modules
`dashboard` · `customers` · `employees` · `attendance` · `payroll` · `equipment` · `maintenance` · `contracts` · `invoices` · `suppliers` · `expenses` · `transactions` · `reports` · `users` · `roles` · `audit` · `backups` · `settings`

### Actions
`read` · `create` · `update` · `delete` · `approve` · `export` · `pay` · `generate` · `payslip` · `adjust` · `cancel`

### Permission Key Format
`<module>.<action>` — e.g., `invoices.create`, `payroll.approve`, `employees.view`

All permission keys must be declared in `backend/src/config/constants.ts` before use.

---

## Module Pattern (Mandatory)

Every backend module follows this exact structure:

```
modules/<name>/
  <name>.routes.ts      # Express router — authenticate + requirePermission applied here
  <name>.controller.ts  # Thin handler: validate → call service → return response
  <name>.service.ts     # Business logic + Prisma queries
  <name>.schema.ts      # Zod schemas for request/response validation
```

### API Response Format

All responses use `backend/src/core/utils/response.ts`:

```typescript
successResponse(res, data, statusCode?)   // { success: true, data }
errorResponse(res, message, statusCode?)  // { success: false, error }
```

### Path Aliases (Backend)
```
@core/*    → backend/src/core/*
@modules/* → backend/src/modules/*
@config/*  → backend/src/config/*
@shared/*  → backend/src/shared/*
```

Dev: resolved automatically by `tsx`. Production: rewritten to relative paths by `build:back`.

### Frontend Routing
`HashRouter` is mandatory — React Router's `createHashRouter` is required because Electron loads `index.html` via `file://`.

---

## Styling Architecture (Officially Approved)

> Permanent architectural decision — not a technology migration. Must not be reported as an architectural violation in future reviews.

Vanilla CSS is the primary styling system across the entire manarERP application.

Tailwind CSS is **not** a general-purpose styling framework in this project. It is permitted **only** for the isolated shadcn/ui integration, within these approved boundaries:

- `frontend/src/components/ui/**`
- `frontend/src/components/DateCalendarPicker*`
- `frontend/src/app/tailwind.css`

The integration must remain isolated. Mandatory rules:

- No Tailwind Preflight.
- No global Tailwind reset.
- No Tailwind utility usage outside the approved shadcn integration unless explicitly approved.
- The existing Vanilla CSS architecture remains the source of truth.
- Existing design tokens remain unchanged.
- shadcn tokens must remain namespaced (`--sh-*`).
- `rgb()` token values are used intentionally instead of `oklch()`, due to a documented Electron rendering issue.
- Vendor shadcn files should remain as close to upstream as practical.
- Wrapper components may contain integration code required for RTL, overlay interoperability, existing application architecture, or Electron compatibility.

---

## Commands

### Development
```bash
npm run dev              # Start Vite + Electron concurrently
npm run dev:front        # Vite only (port 5173)
npm run dev:electron     # Electron only
```

### Build & Validation
```bash
npm run build:back       # Compile backend TypeScript → backend/dist/
npm run build:front      # Vite build → frontend/dist/
npm run electron:build   # Compile electron TypeScript → electron-dist/
npm run dist             # Full production build + NSIS installer
```

### TypeScript Validation
```bash
cd backend && npx tsc --noEmit          # Type-check backend
cd frontend && npx tsc --noEmit         # Type-check frontend
tsc -p electron/tsconfig.json --noEmit  # Type-check electron
```

### Database
```bash
npm run db:generate      # Regenerate Prisma Client after schema changes
npm run db:migrate       # Apply new migrations (dev)
npm run db:seed          # Load initial data
cd backend && npx prisma studio         # Visual DB browser
```

### Linting & Testing
```bash
cd frontend && npm run lint   # ESLint frontend
cd backend && npm run lint    # ESLint backend
cd backend && npm test        # Vitest unit tests
```

---

## Mandatory Workflow (7 Phases)

Execute every phase for every feature, bug fix, enhancement, or refactor. Do not skip or reorder.

---

### Phase 1 — Analysis

1. Read AGENTS.md (this file).
2. Read CLAUDE.md.
3. Analyze all affected modules and their dependencies.
4. Identify which DB models, permission keys, and IPC channels are involved.
5. State the implementation plan clearly.
6. List every file that will be modified or created.

---

### Phase 2 — Implementation

1. Modify only required files — no scope creep.
2. Preserve the module pattern (routes → controller → service → schema).
3. Preserve the permission model — never bypass `authenticate` or `requirePermission`.
4. Preserve audit logging — all mutating operations must write to `AuditLog`.
5. Preserve database integrity — no orphaned records, cascades reviewed.
6. Preserve accounting integrations — changes to invoices, expenses, or payroll must check accounting impact.
7. Preserve reports compatibility — changes to data shape must not silently break report queries.

---

### Phase 3 — Validation

Run all four validation commands and confirm zero errors before proceeding:

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit
npm run build:back
npm run build:front
```

---

### Phase 4 — Simplification Review

Review only the code written in this session for:

- Duplication that can be eliminated without risk.
- Readability improvements (rename, extract small helper).
- Unnecessary complexity.

Only apply low-risk, obviously correct simplifications. Do not refactor surrounding code.

---

### Phase 5 — Code Review

Review against these dimensions:

| Dimension | Check |
|-----------|-------|
| Architecture | Follows module pattern, no layer violations |
| Type Safety | No `any`, no unchecked casts |
| Maintainability | Clear names, no magic strings not in `constants.ts` |
| Database Consistency | Migrations match schema, cascades correct |
| Permission Model | Every route protected, keys declared in `constants.ts` |
| Accounting Impact | Invoice/expense/payroll changes traced to journal entries |
| Reports Impact | Query changes do not break existing report fields |

Severity levels: **Critical** · **High** · **Medium** · **Low**

---

### Phase 6 — Security Review

Review against these dimensions:

| Dimension | Check |
|-----------|-------|
| Authentication | `authenticate` middleware on all protected routes |
| Authorization | `requirePermission` with correct key on every route |
| Sensitive Data | No plain passwords, no plain tokens in DB or logs |
| Payroll Access | `payroll.approve` and `payroll.pay` guarded separately |
| Audit Logging | All CREATE / UPDATE / DELETE / APPROVE actions logged |
| Input Validation | Zod schemas applied via `validate` middleware |
| Double Posting | Accounting entries cannot be created twice for same reference |
| Permission Escalation | Users cannot grant themselves permissions |

---

### Phase 7 — Production Readiness Review

Review:

| Dimension | Check |
|-----------|-------|
| Migration Safety | New migrations reviewed for destructive SQL before apply |
| Data Integrity | Existing production data not corrupted by migration |
| Rollback Safety | Rollback path identified before merging |
| Build Readiness | All three TypeScript targets compile clean |
| Deployment Risks | Port conflicts, file path changes, IPC channel renames |

---

## Decision Format

After completing all phases, return a structured decision:

```
Decision:
  APPROVED
  APPROVED WITH RECOMMENDATIONS
  BLOCKED

Merge Blockers
  [List critical/high issues that must be fixed]

Required Fixes Before Commit
  [Specific changes with file references]

Recommended Improvements
  [Medium/low issues — optional but desirable]

Security Concerns
  [Any auth, authorization, or data exposure risks]

Production Risks
  [Migration, data integrity, rollback concerns]

Safe To Commit:   Yes / No
Safe To Merge:    Yes / No
Safe To Deploy:   Yes / No
```

---

## Release Policy

> CLAUDE.md is the canonical source of truth for release workflow. If AGENTS.md and CLAUDE.md ever conflict regarding release automation, **CLAUDE.md takes precedence**.

Automatic release operations are **strictly forbidden** unless **all** required release gates have been satisfied.

Once all release gates defined in CLAUDE.md have been satisfied — including a successful independent Gemini review with an **APPROVED** verdict — the release workflow becomes fully autonomous.

Claude is explicitly authorized, without asking for additional confirmation, to:

- Commit release metadata when required.
- Merge the approved feature branch into `production` using the project's merge strategy (`--no-ff`).
- Push `production`.
- Create and push the stable tag.
- Update `PROJECT_STATE.md`.
- Complete the release.

If **any** release gate has not been satisfied, Claude **must stop immediately** and fall back to the approval-required behavior in [Git Rules](#git-rules) / [Commit Protocol](#commit-protocol).

---

## Git Rules

### NEVER execute automatically (no exceptions, regardless of release-gate status):
- `git reset --hard`
- `git clean -fd`
- `git branch -D`

Always ask the user for approval before running these commands.

### `git push` / `git merge` / `git tag`

Governed by the [Release Policy](#release-policy) above, not by the list above. Before all release gates in CLAUDE.md are satisfied, treat these the same as any command requiring explicit approval. Once every gate is satisfied, they are part of the fully autonomous release sequence and must not be gated by an additional confirmation ask.

### Commit Protocol

Applies to development-time commits made **before** all release gates are satisfied. Before every such commit, show the user:
1. Changed files (`git status`)
2. Staged files
3. Diff summary (`git diff --stat`)
4. Validation results (TypeScript + build)
5. Commit message draft

Then ask for explicit approval. Once release gates are satisfied, the release commit (if any) runs automatically as part of the Release Policy sequence instead.

### Merge Protocol

Always use:
```bash
git merge --no-ff <branch>
```

After merging, verify before recommending push:
- Build succeeds
- TypeScript passes on all three targets
- `git status` is clean
- Merge commit is visible in `git log`

### Tag Convention

Stable release tags follow this format:
```
stable-<feature-slug>-v<n>
```

Examples:
```
stable-backup-restore-v1
stable-roles-permissions-v1
stable-reports-center-v1
stable-executive-dashboard-v2
stable-dev-backend-watch
stable-payroll-system-v1
```

---

## Adding a New Module (Checklist)

1. Add model to `backend/prisma/schema.prisma` + run `npm run db:migrate`.
2. Review the generated SQL in `backend/prisma/migrations/` before applying.
3. Run `npm run db:generate` to regenerate Prisma Client.
4. Add all permission keys to `backend/src/config/constants.ts`.
5. Create `backend/src/modules/<name>/` with 4 files (routes, controller, service, schema).
6. Register router in `backend/src/app.ts`.
7. Add seed data for role-permission assignments in `backend/prisma/seed.ts`.
8. Add frontend page in `frontend/src/pages/`.
9. Register route in `frontend/src/App.tsx`.
10. Add module config to `frontend/src/config/modules.tsx` if it fits the generic CRUD pattern.
11. Add sidebar entry in `frontend/src/components/Layout.tsx`.
12. Run TypeScript validation on all touched files.

---

## Safety Rules

### NEVER (not even once, not even "just this time")
- Execute the release sequence (commit / merge / push / tag / `production`) before **all** release gates in CLAUDE.md are satisfied — see [Release Policy](#release-policy).
- Delete branches automatically.
- Run `prisma migrate` without reviewing the generated SQL first.
- Add a new permission key without adding it to `constants.ts`.
- Bypass `authenticate` or `requirePermission` middleware on any route.
- Store sensitive data outside bcrypt/JWT (no plain passwords, no plain tokens).

### ALWAYS (before starting any implementation)
- Read the existing architecture before adding new code.
- Follow the module pattern (routes → controller → service → schema).
- Run TypeScript validation before declaring done.
- Run build validation before declaring done.
- Check if a Prisma schema change requires a migration.
- Check if a new feature needs a new permission key in `constants.ts`.
- Check if the feature affects `auth.middleware.ts` or `rbac.middleware.ts`.
- Check if the feature affects `preload.ts` (new IPC channels must be bridged).
- Verify DB path logic in `backendLauncher.ts` if touching DB location.

---

## Review Model Selection

| Situation | Model |
|-----------|-------|
| Daily development | Claude Sonnet 4.6 (default) |
| Large feature review | Claude Opus |
| Full repository analysis | Claude Sonnet 1M Context |

---

## Coding Principles

- Production safety first.
- Data integrity first.
- Minimal-risk changes.
- No unrelated refactoring.
- No speculative rewrites.
- No architecture drift.
- Keep rollback paths available.
- Prefer maintainability over cleverness.
- No comments unless the WHY is non-obvious.
- No multi-paragraph docstrings.

---

## Expected Final Report

After every completed task return:

```
Files Changed
  [List of files with brief description of each change]

Summary of Changes
  [What was implemented and why]

Validation Results
  Backend TypeScript: PASS / FAIL
  Frontend TypeScript: PASS / FAIL
  Electron TypeScript: PASS / FAIL
  Backend Build: PASS / FAIL
  Frontend Build: PASS / FAIL

Review Results
  [Summary of Phases 4–7 findings and decisions]

Risks
  [Any production or data integrity risks identified]

Recommended Next Step
  [Specific next action for the user]
```

---

## Deployment Notes

- Production installer: `npm run dist` (electron-builder + NSIS)
- Backend compiled to `backend/dist/`, loaded by Electron as child process
- First-run: template DB copied to `userData/data/manar.db`
- Dev DB: `backend/data/manar.db`
- Default credentials: `admin` / `Admin@123` (must change on first login)
- Port `48211` must be free at launch — EADDRINUSE handled with graceful restart
