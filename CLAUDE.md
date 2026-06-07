# CLAUDE.md — manarERP

> Instructions for Claude Code in this repository.
> These rules OVERRIDE all default behavior.

---

## Project Identity

**System:** نظام المنار لإدارة الأعمال
**Company:** شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م
**Language:** Arabic-first UI, English codebase
**Currency:** Kuwaiti Dinar (د.ك), 3 decimal places
**Platform:** Electron desktop app (Windows), offline-only

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
| node-cron | — | Automatic backup scheduler (runs inside Electron main process) |

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
stores/
  authStore.ts             # Zustand: user, login, logout, hasPermission
  uiStore.ts               # UI state
```

### Backend (`backend/src/`)
```
config/
  constants.ts             # ROLES, MODULES, ENUMS (source of truth for all types)
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
modules/                   # One folder per business domain
  auth/ customers/ contracts/ invoices/ expenses/ employees/
  payroll/ salaries/ equipment/ maintenance/ transactions/
  reports/ dashboard/ users/ roles/ audit/ backups/ accounting/ settings/ suppliers/
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

## Commands

### Development
```bash
npm run dev                 # Start Vite + Electron concurrently
npm run dev:front           # Vite only (port 5173)
npm run dev:electron        # Electron only (waits for Vite)
```

### Build & Validation
```bash
npm run build:back          # Compile backend TypeScript → backend/dist/
npm run build:front         # Vite build → frontend/dist/
npm run electron:build      # Compile electron TypeScript → electron-dist/
npm run dist                # Full production build + NSIS installer
```

### TypeScript Validation
```bash
cd backend && npx tsc --noEmit      # Type-check backend (no emit)
cd frontend && npx tsc --noEmit     # Type-check frontend (no emit)
tsc -p electron/tsconfig.json --noEmit  # Type-check electron
```

### Database
```bash
npm run db:generate         # Regenerate Prisma Client after schema changes
npm run db:migrate          # Apply new migrations (dev)
npm run db:seed             # Load initial data
cd backend && npx prisma studio     # Visual DB browser
```

### Linting
```bash
cd frontend && npm run lint  # ESLint frontend
cd backend && npm run lint   # ESLint backend
```

### Testing
```bash
cd backend && npm test       # Vitest unit tests
```

---

## Key Conventions

### Module Pattern
Every business module follows this exact structure:
```
modules/<name>/
  <name>.routes.ts      # Express router, applies authenticate + requirePermission
  <name>.controller.ts  # Thin handlers: validate input → call service → return response
  <name>.service.ts     # Business logic + Prisma queries
  <name>.schema.ts      # Zod schemas for request validation
```

### API Response Format
All responses use `backend/src/core/utils/response.ts`:
```typescript
successResponse(res, data, statusCode?)   // { success: true, data }
errorResponse(res, message, statusCode?)  // { success: false, error }
```

### Permission Keys
Format: `<module>.<action>` (e.g., `invoices.create`, `employees.view`)
Defined in: `backend/src/config/constants.ts`
Applied on routes: `requirePermission('invoices.create')`
Frontend check: `useAuth().hasPermission('invoices.create')`

### RBAC Bypass
`SYSTEM_ADMIN` role skips all permission checks in `rbac.middleware.ts`.

### Path Aliases (Backend)
```
@core/*    → backend/src/core/*
@modules/* → backend/src/modules/*
@config/*  → backend/src/config/*
@shared/*  → backend/src/shared/*
```
**Runtime note:** These are TypeScript compiler path mappings only. In dev, `tsx` resolves them automatically at runtime. For production, the `build:back` step compiles and rewrites all alias paths to relative paths — no separate runtime resolver is needed in `dist/`. If you see `Cannot find module '@config/...'` in a production build, the `npm run build:back` step was skipped or ran with errors.

### Frontend Routing
HashRouter is mandatory — React Router's `createHashRouter` is required because Electron loads `index.html` via `file://` protocol.

### Database Port
Backend always binds to `127.0.0.1:48211` (localhost only, not exposed to network).

---

## Development Workflow (Mandatory — 15 Steps)

> Full details: `docs/development-workflow.md`

```
Step 1:  Pull latest production
Step 2:  Create git checkpoint tag
Step 3:  Create feature branch
Step 4:  Implement feature
Step 5:  Run build and validation
Step 6:  Run /simplify
Step 7:  Run /code-review
Step 8:  Run /security-review
Step 9:  Prepare Gemini review report
Step 10: Commit
Step 11: Merge using --no-ff
Step 12: Verify merge result
Step 13: Push production
Step 14: Create stable tag
Step 15: Update project baseline
```

**Do not skip or reorder steps.**

---

## Safety Rules

### NEVER (not even once, not even "just this time")
- Commit automatically
- Push automatically
- Merge automatically
- Delete branches automatically
- Modify the `production` branch directly
- Run `prisma migrate` without reviewing the generated SQL first
- Add a new permission key without adding it to `constants.ts`
- Bypass `authenticate` or `requirePermission` middleware on any route
- Store sensitive data outside bcrypt/JWT (no plain passwords, no plain tokens)

### ALWAYS (before starting any implementation)
- Read the existing architecture before adding new code
- Follow the module pattern (routes → controller → service → schema)
- Run TypeScript validation (`tsc --noEmit`) before declaring done
- Run build validation before declaring done
- Check if a Prisma schema change requires a migration
- Check if a new feature needs a new permission key in `constants.ts`
- Check if the feature affects `auth.middleware.ts` or `rbac.middleware.ts`
- Check if the feature affects `preload.ts` (new IPC channels need to be bridged)
- Verify the DB path logic in `backendLauncher.ts` if touching DB location

---

## Plugin Usage

### Context7 (`mcp__plugin_context7_context7__*`)
**Use for:** Fetching current documentation before using any library API.
**Trigger:** Any time you're about to write code using Prisma, Express, React, Vite, Zod, ExcelJS, PDFKit, Electron, electron-builder, or any other dependency.
**Commands:** `resolve-library-id` then `query-docs`

### TypeScript LSP (`LSP`)
**Use for:** Type analysis, finding all references, safe renames, and verifying types before implementing.
**Trigger:** Before refactoring any exported type, interface, or function signature.

### Code Review (`/code-review`)
**Use for:** Reviewing implementation quality, logic correctness, and adherence to project patterns.
**Trigger:** Step 7 of development workflow — after /simplify, before security review.

### Security Review (`/security-review`)
**Use for:** Identifying auth bypasses, injection risks, insecure IPC exposure, or permission gaps.
**Trigger:** Step 8 of development workflow — after code review.

### PR Review Toolkit (`pr-review-toolkit:*`)
**Use for:** Comprehensive pre-merge review (type design, test coverage, error handling, silent failures).
**Trigger:** After completing a feature, before preparing the Gemini report.

### Code Simplifier (`/simplify`)
**Use for:** Reducing duplication, improving readability, removing dead code introduced during implementation.
**Trigger:** After implementation passes TypeScript validation, before running code review.

### Chrome DevTools MCP (`mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`)
**Use for:** Debugging frontend rendering issues, inspecting network requests, analyzing layout.
**Trigger:** When a frontend UI issue cannot be diagnosed from source code alone.

### Playwright (`mcp__plugin_playwright_playwright__*`)
**Use for:** UI testing, verifying that frontend interactions work end-to-end.
**Trigger:** When implementing new pages or significant UI flows.

### CodeRabbit (`coderabbit:coderabbit-review`)
**Use for:** Independent automated review pass before merging.
**Trigger:** After all other reviews pass, as a final sanity check.

### Systematic Debugging (`superpowers:systematic-debugging`)
**Use for:** Any bug, unexpected behavior, or test failure — before proposing a fix.
**Trigger:** Immediately when something doesn't work as expected.

### Brainstorming (`superpowers:brainstorming`)
**Use for:** Designing new features, major refactors, or architectural decisions.
**Trigger:** Before implementing any non-trivial feature.

### Test-Driven Development (`superpowers:test-driven-development`)
**Use for:** Guiding implementation by writing tests first, ensuring correctness by design.
**Trigger:** Before writing any implementation code for a new feature or bugfix.

### Verification Before Completion (`superpowers:verification-before-completion`)
**Use for:** Final check that a task actually does what it claims — runs the app and observes real behavior.
**Trigger:** Before declaring any implementation step or task complete.

### Finishing a Development Branch (`superpowers:finishing-a-development-branch`)
**Use for:** Structured decision-making at Steps 11–15 — choosing the right merge, PR, or cleanup path.
**Trigger:** When implementation is complete, all reviews pass, and it's time to integrate the work.

### Prisma Remote MCP (`mcp__plugin_prisma_Prisma-Remote__*`)
**Use for:** Authenticating and inspecting the remote Prisma data source during development.
**Trigger:** When diagnosing database state issues or verifying migration results beyond what `prisma studio` provides.
**Commands:** `authenticate` then `complete_authentication`

---

## Prisma Guidelines

- **Never** edit `schema.prisma` and skip `prisma migrate dev`
- After schema changes: `npm run db:generate` to regenerate client
- Always check migration SQL in `backend/prisma/migrations/` before applying
- Seed data lives in `backend/prisma/seed.ts` — run after fresh migration
- Production uses `userData/data/manar.db` — dev uses `backend/data/manar.db`

---

## Adding a New Module (Checklist)

1. Add model to `backend/prisma/schema.prisma` + run migration
2. Add permission keys to `backend/src/config/constants.ts`
3. Create `backend/src/modules/<name>/` with 4 files (routes, controller, service, schema)
4. Register router in `backend/src/app.ts`
5. Add seed data for role-permission assignments in `backend/prisma/seed.ts`
6. Add frontend page in `frontend/src/pages/`
7. Register route in `frontend/src/App.tsx`
8. Add module config to `frontend/src/config/modules.tsx` (for ResourcePage) if it fits the generic CRUD pattern
9. Add sidebar entry in `frontend/src/components/Layout.tsx`
10. Run TypeScript validation on all touched files

---

## Deployment Notes

- Production installer built via `npm run dist` (electron-builder + NSIS)
- Backend compiled to `backend/dist/`, loaded by Electron as child process
- First-run: template DB copied to `userData/data/manar.db`
- Default credentials: `admin` / `Admin@123` (change on first login)
- Port `48211` must be free at launch (EADDRINUSE handled with graceful restart)
