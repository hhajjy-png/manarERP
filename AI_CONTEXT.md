# AI_CONTEXT.md — manarERP

> **Purpose:** This is the official ChatGPT Bootstrap Document for manarERP. Attach this file alone at
> the start of any new ChatGPT conversation to give it the complete current state of the project —
> no other file, memory, or prior conversation needed.
>
> This is **not** documentation, changelog, or release history. It is a living snapshot of *current
> truth only*. It is maintained exclusively by Claude Code and updated automatically after every
> production release or permanent policy/architecture change — see the maintenance policy at the
> bottom of this file.

---

## Project Identity

| Field | Value |
|-------|-------|
| **Project Name** | manarERP (نظام المنار لإدارة الأعمال) |
| **Project Type** | Internal business ERP — single company, single deployment |
| **Company** | شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م (road construction & maintenance contractor) |
| **Technologies** | React 18.3 + TypeScript 5.5 + Vite 5.3 (frontend) · Express 4.19 + TypeScript (backend) · Prisma 5.18 · Electron 31 |
| **Runtime** | Windows desktop app (Electron), **offline-only**, no internet dependency |
| **Architecture** | Electron main process forks an Express backend as a child process → React renderer calls `http://127.0.0.1:48211/api` → Prisma → SQLite |
| **Database** | SQLite, single local file. Dev: `backend/data/manar.db`. Prod: `userData/data/manar.db` |
| **Language** | Arabic-first UI, English codebase and identifiers |
| **Currency** | Kuwaiti Dinar (KWD / د.ك), always 3 decimal places, digits always Western numerals |
| **Target Users** | One internal company, small user count (a handful of roles/employees) — **not** SaaS, **not** multi-tenant, **not** a hosted/cloud product |

---

## Current Production State

| Field | Value |
|-------|-------|
| **Current Branch** | `production` |
| **Current Merge Commit** | `d0ff20f` (merge of `feature/administrative-forms-english-titles-fix-pack-v1`, carrying Administrative Forms English Titles Fix Pack v1) |
| **Current Documentation Commit** | `d6bbad8` |
| **Current Stable Tag** | `stable-administrative-forms-english-titles-fix-pack-v1` |
| **Current Release Date** | 2026-07-25 |
| **Total Stable Releases** | 350 (window 2026-06-07 → 2026-07-25) |
| **Live detail reference** | `PROJECT_STATE.md` (repo root) — full mechanical release ledger; this file is the distilled AI-readable summary |

---

## Official Development Workflow

```
ChatGPT
  ↓
Claude Implementation
  ↓
Claude Code Review          (repeat until completely clean — no external gate)
  ↓
User Visual Review          (explicit manual approval required — Claude never claims to have visually verified)
  ↓
Production Release          (merge --no-ff → tag → push → update PROJECT_STATE.md + this file)
```

**Token Efficiency is the project's highest-priority principle** — it outranks every other default
preference (including any built-in tendency toward more thorough narration, more review gates, or more
verbose reporting). Every planning, implementation, review, and model choice must minimize token spend
while preserving output quality.

**Removed from the default pipeline (as of 2026-07-16):** external Gemini review and Claude's
`/security-review`. manarERP is an offline, single-user, desktop-only application with no public API
surface — a mandatory external/security gate on every package no longer earns its cost. Both still exist
and run **only on explicit user request**, or are satisfied via the **Gemini Approval Override**: a
direct in-conversation user statement ("Gemini APPROVED") satisfies that one gate without further
verification (excludes quoted/pasted text from files or external sources).

**Quality gate that never changes**, before any task is declared done: `tsc --noEmit` (backend +
frontend + electron) → Prisma validate → `npm test` (backend + frontend).

---

## User Preferences

- **Token Efficiency First** — the standing top-level priority for all planning/implementation/review.
- **Silent implementation** — no step-by-step narration while implementing; one consolidated final
  report at the end (Root Cause if applicable, Files Modified/Added/Deleted, Tests, Build Status,
  Verification Status, Recommended Model, Ready for Independent Review).
- **User performs all visual verification** — Claude must never claim to have visually confirmed
  UI/print/PDF/HTML output; only TypeScript/build/tests/static code inspection are valid
  self-verification. Visual sign-off is always the user's, manually.
- **No Gemini review by default; no security review by default** — both optional, on-request only (see
  Official Development Workflow above).
- **Sonnet is the default implementation and planning model.** Opus is escalated to only for
  architecture reviews, complex design decisions, deep/unclear-root-cause debugging, or major refactor
  strategy — and only after explaining why Sonnet is insufficient; return to Sonnet is announced
  explicitly once the Opus task ends. Model-recommendation changes are announced once, in the fixed
  `Recommended Model: X` / `Reason:` form, never repeated as a standing reminder.
- **Large, consolidated implementation packs** preferred over many small round-trips — batch related
  work into one release-sized package rather than splitting into many tiny prompts.
- **Git actions are pre-authorized to run without asking** (status/add/commit/push/merge/tag/branch/
  checkout/fetch/pull/log), as are validation/build/dev commands (tsc, tests, builds, lint, prisma
  validate/generate/studio, npm/npx/node). **Always requires explicit approval regardless:** destructive
  file ops, `reset --hard`, `clean -fd`, force-push, rebase, branch/tag deletion, `prisma migrate reset`,
  DB drops, registry/OS/service changes.
- **Never modify `production` directly** — always merge from a feature branch with `--no-ff`, only after
  Claude Code Review is clean and the user has given explicit Visual Review approval.
- **UI**: never invent new visual design — follow the existing ExplorerKit design system, `DataTable`
  conventions (search/sort/pagination/empty-state/loading-state), and existing color/spacing/button/table
  patterns exactly.
- **Architecture**: preserve Electron desktop + local-first + SQLite + Clean Architecture + RBAC +
  simplicity. Avoid SaaS conversion, full rewrites, enterprise complexity, unnecessary frameworks, or
  major unsolicited UI redesigns. Prefer incremental, practical, low-maintenance improvements.
- **Communication**: conversational interaction is frequently in Arabic; committed documentation/code
  (CLAUDE.md, PROJECT_STATE.md, source) stays English-first per the codebase convention.

---

## Current Architecture

```
manarERP/
├── electron/          # Main process: window, IPC, backend launcher, auto-backup scheduler (node-cron)
├── frontend/           # React 18.3 + Vite 5.3 renderer, HashRouter (mandatory — file:// compatible)
├── backend/            # Express 4.19 REST API, child process, binds 127.0.0.1:48211 only
├── backend/prisma/      # SQLite schema + migrations
└── docs/                # Arabic docs + workflow guides
```

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 31 |
| Frontend | React 18.3, TypeScript 5.5, Vite 5.3, React Router 6 (HashRouter), Zustand 4.5, Axios 1.7 |
| Charts | Recharts 3.8 + Chart.js 4.4 |
| Backend | Express 4.19, TypeScript 5.5, Prisma 5.18, Zod 3.23, Helmet 7.1 |
| Database | SQLite (local file, offline-first) |
| Auth | JWT (12h) + bcrypt; `authenticate` + `requirePermission('<module>.<action>')` guards; `SYSTEM_ADMIN` bypasses all |
| Export | ExcelJS 4.4 + PDFKit 0.15; Chromium HTML→PDF pipeline for Arabic-faithful printing |
| Testing | Vitest 2.0 |
| Build | electron-builder 24 (NSIS, Windows) |
| Styling | Vanilla CSS is the primary system app-wide. Tailwind CSS is permitted **only** inside the isolated shadcn/ui subtree (`components/ui/**`, `DateCalendarPicker*`, `app/tailwind.css`) — no Preflight, `--sh-*` token namespacing, `rgb()` over `oklch()` (documented Electron rendering bug) |

**Module pattern (backend):** every domain module = `routes.ts` → `controller.ts` → `service.ts` →
`schema.ts`. Path aliases: `@core/* @modules/* @config/* @shared/*` (compile-time only; production build
rewrites to relative paths).

**Permission keys:** `<module>.<action>`, defined in `backend/src/config/constants.ts`, applied via
`requirePermission()` on routes and `hasPermission()` on the frontend.

**Dev ports:** frontend 5173, backend 48211 (localhost only). A separate sibling project
`manar-ui-lab` uses 5174 — never run it on 5173 or let it touch production.

**Money/date presentation standard (locked in):** money always renders with fixed 3 decimals and
Western digits; currency symbol position/language follows the `finance.currencyDisplayLanguage`
setting but never changes the digits; dates render `dd/mm/yyyy`. Standardized across screen, print,
Chromium PDF, and backend HTML reports.

---

## Active Foundations

- **ExplorerKit** — unified `.xpl-`-namespaced design system. Rollout is **effectively complete** across
  all CRUD/business pages (Accounting, Invoices, Expenses, Cheques, Salaries, Prices, Settings, Reports,
  Attendance, Maintenance, Inventory, DataImport, ResourcePage, Document Expiration Center). Unmigrated
  pages (dashboards, print/form pages, bespoke bank explorers) are intentionally out of scope.
- **Double-entry GL engine** (`shared/services/gl.service.ts` → `createBalancedJournal`) — atomic,
  reversible, Dr=Cr enforced, double-post guarded, **immutable** (posted `JournalEntry` rows are never
  physically deleted — corrections reverse the live `revision` and post a new one via
  `supersedeBalancedJournal`). Wired to: Invoices, Payments, Expenses, Payroll, Purchase Invoices, driver
  Salary Payments (bank-import). The legacy single-sided `Transaction` table is **retired** — frozen
  historical data, no longer written to or read by any report.
- **Operational Financial Engine (as of Operational Reporting Consistency Pack v1, 2026-07-23):**
  `shared/services/operational.reporting.ts` (`getRevenue`/`getExpenses`/`getCollections`/
  `getAccountsReceivable`/`getOperationalProfitAndLoss`/`getMonthlyOperationalProfitAndLoss`/
  `getOperationalSummary`, plus exported definition constants `EXPENSE_OPERATIONAL_STATUS`
  (`'APPROVED'`) and `SALES_INVOICE_ACTIVE`) is now the **single, fully-consumed** source for
  Revenue (Invoice), Expenses (Expense), Collections (Payment), Accounts Receivable
  (Invoice−Σ Payment), and Net Profit (Revenue−Expenses) across **every** Dashboard, Executive
  Center, Financial Center, and Reports consumer — including secondary KPIs (per-contract/
  customer profitability, month-over-month comparisons, KPI timelines, aging/debtor widgets)
  that the 2026-07-22 migration had left on pre-migration ad-hoc filters. **GL
  (`gl.reporting.ts` — `glProfitAndLoss`/`glAccountFlow`) is not the source for any of those** —
  it remains authoritative only for Journal Entries, Chart of Accounts, Trial-Balance-adjacent
  totals (Accounting Summary's Journal Entry Count/Total Debit/Total Credit), and the
  still-GL-based `transactions.service.ts` `/transactions/profit-loss` endpoint (intentionally
  not yet migrated — deferred to a future cleanup pack; duplicates the Accounting Summary panel).
  `glMonthlyProfitAndLoss` was removed (zero remaining callers) in the migration's Cleanup Pack 1.
- **Banking modules** — Bank Statement Import/Explorer, Bank Reconciliation (manual-confirm only, never
  auto-posts by policy), Bank Account Explorer, Payroll Bank Import/Analytics, NBK Salary XLS export —
  all production-complete.
- **Print Engine** — considered **closed**: dual pipeline (PDFKit + Chromium HTML→PDF for Arabic), 30
  registered templates, 12 official forms, Template Studio (print designer), cheque printing +
  per-bank calibration, universal print preview across 15 supported document types. Do not open a new
  print-system generation.
- **AI Assistant layer** — fully deterministic/offline/rule-based, **zero LLM anywhere** in the codebase
  (verified: 0 hits for openai/anthropic/gpt/gemini/langchain). Keyword router, 6 skills, Quality Engine,
  Executive Intelligence, Integrations Center. Any future LLM integration would be optional and
  user-supplied — deterministic stays the built-in fallback.
- **RBAC** — 7 roles (SYSTEM_ADMIN, GENERAL_MANAGER, ACCOUNTANT, PROJECT_MANAGER, EQUIPMENT_MANAGER,
  HR_MANAGER, STANDARD_USER), ~100 permission keys, all enforced server-side.
- **Gemini Approval Override policy** (documented in AGENTS.md) — a direct in-conversation "Gemini
  APPROVED" statement from the project owner satisfies the independent-review gate.
- **Consolidated shared primitives (as of Cleanup & Architecture Remediation Pack v1, 2026-07-17):**
  `gl.service.ts`'s `createBalancedJournal` now retries entry-number collisions internally (all callers
  inherit it); canonical money rounding (`roundMoney`) is the single source for report/Tafqeet math;
  ExplorerKit's `useFocusTrap`/`Pagination` and `stores/toastStore` are the single implementations for
  focus-trapping/pagination/toasts (no more page-local reimplementations); `authStore.isSystemAdmin()` and
  `rbac.middleware.ts`'s `hasRolePermission()` are the single sources for those checks; every backend
  module (including `attachments`, the last holdout) now follows routes→controller→service→schema.
- **Table/Excel column unification (as of Excel Page Export Consistency Pack v1, 2026-07-23):**
  Invoices, Employees, and Expenses each render their visible table and build their own "Export Excel"
  Excel file from **one shared column-definition array per page** — `modules.tsx`'s existing
  `employees.columns` for Employees (via `ResourcePage.tsx`'s new opt-in `nativeExcelExport` flag), and
  new `invoiceColumns`/`expenseColumns` (`buildInvoiceColumns`/`buildExpenseColumns`) for the bespoke
  Invoices/Expenses pages. Adding, removing, or reordering a column in that one array changes both the
  table and the export together — structurally impossible to desynchronize. `frontend/src/utils/
  exportUtils.ts` (`fetchAllRows` + `downloadTableExcel`) is the shared client-side builder (fetches all
  filtered rows across pages, not just the visible page; money columns are raw numbers with the standard
  `#,##0.000` numFmt). These three pages' own export buttons no longer call the shared
  `/reports/:type/export` endpoint — the Reports page's own "Invoices"/"Expenses"/"Employees" report
  types (a wider, different column set) are untouched and unaffected. Every other `ResourcePage` module
  (contracts/customers/suppliers/equipment) still uses the original `/reports/:type/export` path
  unchanged.
- **Google Drive Sync Foundation (as of Google Drive Sync Foundation Pack v1, 2026-07-23):**
  `electron/services/syncEngine.service.ts` orchestrates optional Google Drive synchronization of the
  local SQLite database file — entirely additive to, never a replacement for, Offline-First: the app
  always reads/writes the local `.db` file directly; Drive is only a sync location (hidden
  `appDataFolder`, `drive.appdata` OAuth scope) between the user's own devices. Auth is a system-browser
  OAuth2 loopback flow (`googleDriveAuth.service.ts`, never an embedded WebView); Drive REST calls
  (`googleDriveApi.service.ts`) live outside `googleapis` to stay lightweight. Integrity is real —
  `PRAGMA integrity_check` via a throwaway `PrismaClient` pointed at the target file (reuses the
  backend's already-shipped query engine; no new native dependency) — run before every upload and after
  every download; uploads snapshot a `PRAGMA wal_checkpoint(FULL)`-flushed copy rather than reading the
  live file. Network calls retry with exponential backoff (`retry.ts`), classifying transient failures
  (network/timeout/429/5xx) from permanent ones (401/403/400/404 — never retried). IPC
  (`electron/ipc/sync.ipc.ts`) reuses the existing `backups.create`/`backups.update` permissions — no new
  permission key, no schema change. UI lives as a tab inside the existing Backup page
  (`CloudSyncPanel.tsx`), not a Sidebar entry.
- **Google Drive Conflict Resolution (as of Google Drive Conflict Resolution Pack v1, 2026-07-23):**
  extension of the Sync Engine above, not a redesign. `decide()`'s existing SHA-256 comparison now
  returns a distinct `CONFLICT` action (previously silently fell through to `NONE`) when both the local
  and remote databases changed since the last successful sync; startup/shutdown conflicts are logged and
  left untouched, and `CloudSyncPanel` proactively checks for one on mount (`sync:getConflict`, read-only,
  unlogged) so `ConflictResolutionDialog.tsx` can appear without a manual "Sync Now" click first.
  `resolveConflict('LOCAL' | 'REMOTE', ...)` is a thin wrapper around the unmodified
  `performUpload`/`performDownload` — Keep Local/Keep Cloud inherit every Foundation Pack protection
  automatically (WAL checkpoint, double integrity check, snapshot upload, atomic replace, pre-sync
  backup, retry); Cancel is client-side only and never calls the backend. New
  `electron/services/deviceIdentity.service.ts` gives each machine a persistent UUID + hostname (never
  synced as its own file — only its two values ride along as Drive `appProperties`); every sync log entry
  is now device-tagged, and conflict-resolving entries carry `conflictResolved`/`resolutionSelected`.
- **Google Drive Restore Reliability (as of Google Drive Database Restore Reliability Pack v1,
  2026-07-23):** fixes a real-world `EPERM` restore failure — the backend held the live SQLite file open
  on Windows, so `performDownload()`'s atomic rename failed. It now detects whether the database is
  actually in use (`isBackendRunning()` — a no-op during startup-sync, before the backend has started),
  stops the backend and awaits its real `'exit'` event (`stopBackendForRestart()`, not a fixed sleep),
  retries the rename on `EPERM`/`EBUSY` via the existing `withRetry()` helper, restarts the backend and
  waits for `/api/health`, and — in a `finally` block — restarts the backend even if the replace ultimately
  fails, so the app is never left without one. `backendLauncher.ts`'s `INTERNAL_SECRET` is now cached once
  per process (`getInternalSecret()`) instead of regenerated, so a mid-session restart reuses the secret
  the auto-backup scheduler already holds; the pre-existing "unexpected exit → crash dialog → `app.quit()`"
  handler is guarded against this deliberate restart. Frontend: `requiresRestart` → full Electron relaunch
  replaced with `backendRestarted` → `window.location.reload()` (in-window reload only) — no more manual
  app restarts after a Drive restore.
- **Window Lifecycle Foundation (as of Window Lifecycle Foundation v1, 2026-07-24):**
  `electron/windows/windowLifecycle.ts` is the authority for one question: does the app currently have a
  real application window, as opposed to only transient utility windows? `registerUtilityWindow(win)` —
  any transient window (Cloud Sync Progress dialog today; splash/update-check/migration/maintenance
  dialogs in the future) self-registers and self-cleans on close via this one call, with zero other code
  changes needed per new utility window. `registerMainWindow(win)` — called once, when the real app window
  is created; sets a permanent flag, never reset even after that window later closes.
  `shouldQuitOnAllWindowsClosed()` — true only if the main window has ever been registered.
  `electron/main.ts`'s `window-all-closed` handler now checks this before calling `app.quit()`, instead of
  quitting unconditionally the instant Electron's tracked window count hits zero — fixes a real bug where
  the sync-progress dialog closing before the main window existed was misread as "the user closed the
  app," silently exiting the process (code 0, no crash) before `createMainWindow()` ever ran. `before-quit`,
  startup/shutdown sync, and the Google Drive Sync architecture are unchanged.

---

## Active Roadmap

> Only genuinely unbuilt, still-wanted work. Reconciled against actual code, not stale documentation.

**High priority**
- Print Designer Phase 7B — PDF template import (needs a pdf.js parsing strategy).
- Bank Explorer — period opening/closing balance (fully designed in `docs/BANK_EXPLORER_HISTORICAL_READINESS.md`).

**Medium priority**
- Data Import Phase 4 — grouped-row engine for PurchaseOrders/GoodsReceipts/MaterialIssues (Prisma models
  already exist; only import validators are missing).
- GL auto-posting from the Bank Reconciliation workspace — **blocked**: conflicts with the standing
  "never auto-post" policy; the policy must be explicitly settled before this is scheduled.
- Per-document-type signer selection (image overlay mapping, not cryptographic signatures).
- Audit Log Viewer enhancements (export, advanced filters).
- Additional print profiles (custom margins, extra watermarks).

**Low priority**
- Historical Import Batch Review & Posting (`ImportBatch`/`ImportBatchItem` — designed, no models yet).
- Recurring invoices, VAT/tax report, end-of-service indemnity accrual — none exist in code.
- AuditLog retention/purge path — maintenance consideration only; revisit only if DB growth becomes
  measurable.

---

## Latest Completed Releases

- **Administrative Forms English Titles Fix Pack v1** (2026-07-25,
  `stable-administrative-forms-english-titles-fix-pack-v1`) — fixed administrative forms whose
  printed `<h1>` title (and matching print-preview dialog title/`documentLabel`) resolved via `t()`
  from `useT()`, which is bound to the app's **global UI language** (`useUI().lang`, Arabic by
  default) rather than the form's own local `lang` toggle (`ar`/`en`) selected on the print form
  itself. Selecting the English document while the app's UI language was Arabic (the default) still
  printed an Arabic title above an otherwise fully English document. Fixed by resolving each title via
  the i18n dictionary directly with the document's own `lang` state (`t(key, lang)`, imported as
  `translate`), independent of the global UI language. **Forms fixed:** Salary Certificate, To Whom It
  May Concern, Leave Request, Return to Work, Salary Advance, Resignation, Employee Warning,
  Performance Evaluation, Quotation, Purchase Request (10 forms, 55 lines changed — exactly the
  `t('page.X.title')` → `translate('page.X.title', lang)` call-site substitutions). **Excluded:**
  Employment Contract (out of scope). **Unchanged:** Payment Voucher and Receipt Voucher — their title
  boxes already render both languages together regardless of the toggle, so they were never affected.
  **No changes** to printing layout, margins, fonts, QR codes, form numbering, business logic, or
  translations outside the document title. Frontend `tsc --noEmit` clean (frontend-only release); no
  automated test previously existed for this defect. Product Owner visual review: **APPROVED**. Gemini
  final review: **APPROVED**.

- **Barcode Payload Standardization Pack v1** (2026-07-25,
  `stable-barcode-payload-standardization-pack-v1`) — standardized the JSON payload encoded inside
  every printed form's QR code onto one schema: `{formType, formNumber, entityName, entityId?}`.
  Previously 12 forms encoded `{formType, formNumber, employeeId, employeeName, issueDate}` and
  Employment Contract encoded a completely separate ad-hoc shape (`employeeName, civilId,
  contractDuration, salary, companyName, contractEndDate, formNumber`) via an `as never` cast that
  bypassed the shared `QRData` type. `entityId` is included only when a genuine backing record id
  exists — the app's pre-existing `0` "no entity" placeholder (Quotation, Purchase Request, Payment
  Voucher, Receipt Voucher, and Employment Contract's manual-entry path) is correctly treated as "no
  id" and omitted. **Removed from every QR:** `issueDate`/timestamps app-wide, and — Employment
  Contract only — Civil ID, salary, contract duration, contract end date, and the hardcoded company
  name; that PII no longer belongs in a scannable, unsigned code printed on a document that can be
  freely photographed. **Deliberately excluded:** Invoice's `DocumentVerificationQR`, which encodes a
  bare `verificationUuid` string (no JSON) consumed by the real `GET /api/verify/:uuid` backend
  endpoint — folding it into this schema would silently break that lookup; and Template Studio's
  per-template `qr`/`barcode` designer elements (a user-configurable single-field binding, not a fixed
  document payload). **No changes** to QR rendering, size, position, error correction, PNG/SVG output,
  printing pipeline, form numbering, layouts, backend, or APIs. Frontend `tsc --noEmit` clean
  (frontend-only release); targeted `vitest` run — 4 files / 70 tests passing. Product Owner visual
  review: **APPROVED**. Gemini final review: **APPROVED**.

- **Google Drive Database Restore Reliability Pack v1** (2026-07-23,
  `stable-google-drive-database-restore-reliability-pack-v1`) — fixes a real-world restore failure: a
  Google Drive download succeeded but the atomic replace threw `EPERM: operation not permitted, rename
  temp.db -> manar.db` because the backend still held the live SQLite file open on Windows (the existing
  local-file restore path already stopped the backend first; the sync download path never did). New
  `isBackendRunning()`/`stopBackendForRestart()` in `backendLauncher.ts` detect actual database-in-use
  state and await the backend's real process exit (not a fixed delay) before any file operation; the
  atomic rename retries on `EPERM`/`EBUSY` via the existing generic `withRetry()` helper (6 attempts,
  500ms-4s backoff); the backend restarts automatically afterward and a `finally` block guarantees it
  restarts even if the replace ultimately fails. `getInternalSecret()` now caches `INTERNAL_SECRET` for
  the process lifetime so a mid-session restart doesn't invalidate the auto-backup scheduler's
  authentication. Frontend: `CloudSyncPanel.tsx` swapped a full Electron relaunch
  (`requiresRestart`/`restartApp()`) for an in-window `window.location.reload()`
  (`backendRestarted`) — restores no longer require the user to manually restart the app. All integrity/
  backup/retry protections from the two prior sync packs preserved unchanged; no database schema changes,
  no business logic changes. Electron `tsc --noEmit` clean; frontend `tsc --noEmit` clean; frontend
  production build clean; full frontend suite shows the identical established baseline (8 failing files /
  18 failing tests / 1808 passing) — zero regressions. Product Owner visual review: **APPROVED**. Gemini
  review: **APPROVED**. Real-world runtime restore testing: **completed successfully**.

- **Google Drive Conflict Resolution Pack v1** (2026-07-23,
  `stable-google-drive-conflict-resolution-pack-v1`) — professional conflict detection/resolution built
  as an extension of the Sync Engine from Google Drive Sync Foundation Pack v1, not a redesign. `decide()`
  now returns a distinct `CONFLICT` action instead of silently doing nothing when local and remote both
  changed since the last successful sync; resolution (Keep Local / Keep Cloud / Cancel, via
  `ConflictResolutionDialog.tsx`) reuses the unmodified `performUpload`/`performDownload` so every
  Foundation Pack protection applies automatically — WAL checkpoint, double `PRAGMA integrity_check`,
  snapshot-before-upload, atomic rename, pre-sync backup, exponential-backoff retry. Cancel never touches
  either database. New persistent device identification
  (`electron/services/deviceIdentity.service.ts`) and version metadata (`appProperties.version`) on the
  Drive file; every sync log entry is now device-tagged and conflict-resolving entries record which side
  was kept. Electron `tsc --noEmit` clean; frontend `tsc --noEmit` clean; frontend production build
  clean; full frontend suite reproduces the same 8 pre-existing failing files against the unmodified
  checkpoint baseline (none touching Sync/Conflict Resolution code) — zero regressions. No database
  schema changes, no business logic changes; IPC reuses the existing `backups.update` permission. Product
  Owner visual review: **APPROVED**. Gemini architecture/security review: **APPROVED**.

- **Google Drive Sync Foundation Pack v1** (2026-07-23,
  `stable-google-drive-sync-foundation-pack-v1`) — professional Google Drive synchronization while
  preserving the Offline-First architecture: local SQLite remains the only active production database,
  Google Drive is used exclusively as a sync location (hidden `appDataFolder`). Startup sync
  downloads-if-newer before the backend forks (bounded, never blocks app start); shutdown sync
  uploads-if-changed after the backend stops (bounded, never blocks quit); manual Sync Now/Upload/Download
  from the new Cloud Sync tab on the Backup page. Real `PRAGMA integrity_check` (via a short-lived
  `PrismaClient`, not a new native dependency) runs before every upload and after every download; uploads
  are built from a `PRAGMA wal_checkpoint(FULL)`-flushed, integrity-verified temp snapshot, never the live
  file. Atomic download-replace (`fs.renameSync`) with an automatic pre-sync backup and rollback on
  failure. Exponential-backoff retry around every Drive network call, distinguishing transient failures
  from permanent ones; every retry logged. Simultaneous local+remote changes are surfaced as a conflict
  and never auto-resolved (manual Upload/Download picks a side) — conflict resolution and version history
  are explicitly out of scope for v1. No database schema changes, no business logic changes; IPC reuses
  the existing `backups.create`/`backups.update` permissions. Electron `tsc --noEmit` clean; frontend
  `tsc --noEmit` clean; frontend production build clean; full frontend suite shows the identical
  pre-existing 18 failures / 1808 passing (114 files) — zero regressions. No backend changes this release.
  Product Owner visual review: **APPROVED**. Gemini architecture/security review: **APPROVED**.

- **Excel Page Export Consistency Pack v1** (2026-07-23,
  `stable-excel-page-export-consistency-v1`) — frontend-only. Standardized table structure and Excel
  export behavior for exactly three pages: Invoices, Employees, Expenses. Phase 1 audited every visible
  column against each page's Prisma model — no missing required business columns found; tables left
  unchanged. Phase 2 found that all three pages' own "Export Excel" buttons called the shared
  `/reports/:type/export` backend endpoint, which the Reports page also uses for its own report types
  with a different column set — so decoupled each page's own export onto a new client-side path
  (`utils/exportUtils.ts`: `fetchAllRows` + `downloadTableExcel`) that fetches all filtered rows and
  builds the `.xlsx` directly from the table's own columns. A follow-up pass then made the **table
  itself** the single source of truth for all three pages (not just at export time): Employees exports
  from the existing `modules.tsx` `employees.columns` array via a new opt-in `ResourcePage.tsx`
  `nativeExcelExport` flag (every other `ResourcePage` module is unaffected — same original code path);
  Invoices and Expenses had their bespoke table JSX refactored to render from one new column-definition
  array per page (`invoiceColumns`/`expenseColumns`), with the export built from that same array —
  eliminating any possibility of the table and export drifting apart in the future for all three pages.
  Visual output unchanged (every render closure is a direct copy of the prior markup). **Deliberately
  unchanged:** GL, Journal Engine, Posting Engine, Chart of Accounts, Accounting Reports, the Reports
  page and all its report types, PDF generation, printing, backend APIs, database, business logic — no
  page or module outside Invoices/Employees/Expenses touched. Frontend `tsc --noEmit` clean; full
  frontend suite run against this release and separately against the clean pre-release baseline (via
  `git stash`) both show the identical pre-existing 18 failures / 1808 passing — zero regressions. No
  backend changes this release. Product Owner visual review: **APPROVED**. Architectural review:
  **PASSED**.

- **Operational Reporting Consistency Pack v1** (2026-07-23,
  `stable-operational-reporting-consistency-v1`) — backend-only follow-up to Operational
  Reporting Migration v1. A read-only Financial Integrity Audit verified the engine's core
  (double-entry balance, canonical rounding, invoice/payment denormalization) was sound, but
  found several **secondary** KPIs — per-contract/customer profitability, month-over-month
  comparisons, KPI timelines, aging/debtor widgets in Dashboard, Executive Center, and Financial
  Center — still carried pre-migration ad-hoc filters instead of consuming the shared engine.
  This pack closes that gap: removed every remaining legacy expense filter (`notIn: [REJECTED,
  CANCELLED, (REVERSED)]`) in favor of the engine's newly-exported `EXPENSE_OPERATIONAL_STATUS`;
  unified collections to exclude cancelled invoices everywhere via `getCollections()` /
  newly-exported `SALES_INVOICE_ACTIVE`; replaced every `Invoice.total − paidAmount` snapshot
  with the engine's `Invoice − Σ Payment` definition; standardized `reports.service` totals onto
  the canonical `round3` helper. **No formula changed** — Operational Profit/Loss remains
  exactly Revenue − Expenses; only *which definition* each screen consumes changed. **Deliberately
  unchanged:** GL, Journal Engine, Posting Engine, Chart of Accounts, Accounting Reports, API
  contracts, DTOs, database schema, frontend. Three findings intentionally excluded: legacy
  single-sided `Transaction`-table posting from Inventory (isolated, unread by any report), the
  already-pending production payroll-GL journal cleanup, and a minor invoice-stats rounding nit.
  Full backend suite: 135 files / 1897 tests passing (existing tests re-fixtured to the unified
  payment-based mocking, not weakened); `tsc --noEmit` clean. Product Owner visual review:
  **APPROVED**. Gemini review: **APPROVED**.

- **Operational Reporting Migration v1** (2026-07-22, `stable-operational-reporting-migration-v1`) —
  backend-only architecture migration executed as 7 sequential, individually-approved packs. Introduces
  a single reusable **Operational Financial Engine** (`backend/src/shared/services/operational.reporting.ts`)
  as the source for Revenue (Invoice), Expenses (Expense — one official status definition, `APPROVED`,
  replacing three previously-inconsistent filters), Collections (Payment), Accounts Receivable
  (Invoice+Payment), and Net Profit, plus `getOperationalSummary()` composing all five in one call.
  Migrated onto it: the Profit & Loss report, Dashboard (`overview`/`monthlyTrend`/`executive`), and the
  Executive Decision Center (`financialSummary`/`kpiTimeline`) — the last of which closed a pre-existing
  inconsistency where its headline Net Profit mixed Invoice-sourced revenue with GL-sourced expenses. A
  dedicated read-only architecture audit (Pack 5) then determined Accounting Summary's correct target
  shape, implemented in Pack 6: it is now a **hybrid** — Revenue/Expenses/Collections/Net Profit from the
  Operational Engine, while Journal Entry Count/Total Journal Debit/Total Journal Credit remain
  GL-sourced (no operational equivalent exists for ledger-wide totals spanning every account type).
  Cleanup Pack 1 removed the now-orphaned `glMonthlyProfitAndLoss()` GL wrapper (zero remaining callers)
  and corrected stale "GL is the sole source" comments. **Deliberately unchanged:** the GL reporting
  engine (`glProfitAndLoss`/`glAccountFlow`), the posting engine, Chart of Accounts, Journal Entries,
  Financial Center, other Reports, and `transactions.service.ts`'s `/transactions/profit-loss` (still
  GL-based, explicitly deferred to a future cleanup pack — it duplicates the Accounting Summary panel).
  **No API contract, response DTO, database schema, or frontend changes** — only the source of the
  underlying numbers changed. Full backend suite: 135 files / 1897 tests passing; `tsc --noEmit` clean.
  Product Owner visual review: **APPROVED**. Gemini review: **APPROVED**.

- **English & Unified Tafqeet Engine Pack v1** (2026-07-21,
  `stable-english-unified-tafqeet-engine-pack-v1`) — consolidates the three previously-duplicated Arabic
  amount-to-words (tafqeet) implementations into one canonical engine, `frontend/src/lib/tafqeet.ts`, and adds
  a complete English amount-to-words engine for KWD (zero, negative, thousands/millions/billions, correct
  Kuwaiti Dinar/Fils grammar), both auto-selected by document/UI language via new `amountToWordsKWD(amount,
  lang)` / `amountToWordsInvoiceKWD(amount, lang)` dispatchers. The two pre-existing Arabic phrasings (a
  "standard" variant and an "invoice-legacy" variant that produced genuinely different text for the same
  amount) were preserved byte-for-byte rather than merged — verified via an exhaustive diff across ~4,000
  sample amounts before the duplicate file (`print-templates/utils/tafqeet.ts`) was deleted.
  `backend/src/core/utils/tafqeet.ts` intentionally kept untouched (separate npm-workspace package, no shared
  source boundary, zero production backend call sites — used only by its own test suite). Wired into every
  existing amount-in-words call site: Cheques (unchanged, no language toggle there), Payment Voucher, Receipt
  Voucher (now read their existing `lang` prop), Salary Certificate (added the missing English row), Employment
  Contract, Invoice print templates (adapter/builder gained an optional `lang` param, default `'ar'`, zero
  behavior change for existing callers). **Fixes a live bug:** Employment Contract's English output was
  embedding raw Arabic tafqeet text verbatim in both its English render path and the English column of its
  bilingual layout — now renders correct English wording. **No amount-in-words feature added to documents that
  never had it** (Quotation, RFQ, Reports, Payslips, Purchase Orders untouched). **No business logic, API,
  database, or permission changes.** Product Owner visual review: **APPROVED**. Gemini final review:
  **APPROVED**.

- **Full English LTR Layout Pack v1** (2026-07-21,
  `stable-full-english-ltr-layout-pack-v1`) — when the UI language is English, the whole app now automatically
  renders as a native LTR enterprise layout (sidebar moves left, navigation/dashboard/forms/drawers/dialogs/
  tables/reports/search/filters/tabs/menus/toolbars/Print-Preview-UI all mirror); Arabic mode stays exactly as
  before, byte-for-byte RTL. No manual toggle — layout follows the existing `useUI().lang` language switch.
  `uiStore.applyLang()` now also syncs `document.documentElement.lang`. ExplorerKit's shared `Drawer`/`Dialog`
  (app-wide detail-panel/modal primitives) made language-aware instead of hardcoded RTL. ~50 hardcoded
  `dir="rtl"` overrides removed from 36 page/component roots so they inherit ambient direction; physical CSS
  (`direction`, `text-align`/`margin`/`padding` left-right, `left`/`right`) converted to logical properties
  across 17 stylesheets, preserving the exact current RTL appearance. **Frontend-only, 53 files, net code
  reduction (97 insertions / 127 deletions). No business logic/API/schema/permissions/calculations changed.**
  Deliberately excluded (stay Arabic/RTL always): official printed/legal documents (report print, payslip,
  cheque calibration sheet, cheque amount-in-words), money/numeric-cell isolation, chart containers, the
  always-LTR date-calendar popover, and pre-existing Arabic-only print-template tooling never wired into the
  i18n system. Product Owner visual review: **APPROVED**. Gemini final review: **APPROVED**.

- **English Localization Completion Pack v2** (2026-07-21,
  `stable-english-localization-completion-pack-v2`) — eliminates the remaining hardcoded Arabic UI strings
  app-wide (bundles the previously-unreleased Pack v1a as its prerequisite, since neither had reached
  `production` before this merge). **English localization only — Arabic UI, business logic, API, DB, routes,
  permissions, CSS, layout, RTL/LTR, charts, print logic, and calculations all untouched.** Covers Banking
  (BankReconciliation, BankAccounts, BankAccountExplorer, BankStatementImport, BankSalaryAnalytics,
  PayrollBankImport/Export), Financial Center (statements, GL, trial balance, aging, journal, period lock),
  Reports, Accounting, Integrations Hub, Employee Entitlements Center, Employment Contract, Cheque Calibrator +
  Wizard, invoice/quotation fast-entry flows, the generic Excel importer, HR print-forms, and the remaining
  ResourcePage/Prices/Cheques gaps. `frontend/src/lib/i18n.ts` grew from 1,211 to **3,879 keys in both
  `DICT.ar`/`DICT.en`** (net +2,668, key parity confirmed, zero duplicate keys, zero existing key values
  altered — purely additive). 138 files changed vs. the previous production baseline. Customer/supplier/employee
  names, notes, and other business data intentionally remain in Arabic, as does `DocumentVerify.tsx` (a
  localhost-only internal tool). **Known pre-existing, unrelated bug found during audit (not fixed here):** a
  set of HR/print-document pages maintain their own page-local language toggle decoupled from the app-wide
  one. Product Owner visual review: **APPROVED**. Gemini final review: **APPROVED**.

- **ERP Terminology Standardization Pack v1** (2026-07-21,
  `stable-erp-terminology-standardization-pack-v1`) — one professional English ERP terminology standard for the
  whole app. **English (`en`) localization only — Arabic baseline byte-for-byte unchanged; key parity 1211 ↔ 1211.**
  25 strings standardized in `frontend/src/lib/i18n.ts` against Dynamics 365 / SAP / Oracle Fusion / Odoo norms:
  canonical terms (Customer not Client, Invoice not "Invoices & Claims", Outstanding not Uncollected), unified
  `New X` create verbs, `Sign In`/`Sign Out`, `Expense via X` categories (Nazeer transliteration fix), title
  cleanups (`Accounting`, `Cheque Management`), and the official company legal name `Al Manar Al Duwaliya
  Company L.L.C` on payslip + cheque. Spelling standard: US English + retained `Cheque`. Adds
  `docs/ERP_TERMINOLOGY_STANDARD.md` as the permanent source of truth. **No** logic / API / DB / Prisma / routes /
  permissions / CSS / layout / print change. Independent Claude Opus review: **APPROVED**. Product Owner visual
  review: **APPROVED**. Gemini final review: **APPROVED**.

- **Employee & Equipment Tables Visual Consistency Pack v1** (2026-07-20,
  `stable-employee-equipment-tables-visual-consistency-pack-v1`) — executive-grade visual polish for the
  Employees explorer table plus a numeric sorting regression fix, a frozen-cell background consistency fix, and
  migration of the Equipment table's registration-remaining column onto the same shared visual system.
  **Presentation-only except the Employee Number sort fix** (server-side sort path change; no API/Prisma/DB
  change). **Employee table polish:** single-line, ellipsis + tooltip Arabic/English name cells; profession and
  nationality rendered as plain text (badges/flags/status labels removed after user feedback, in favor of a
  calmer, label-free look); the four expiry columns (residency/passport/license/vehicle license) share one
  `ExpiryCell` — soft pastel tint + thin colour accent, no badge/icon/label; frozen identity columns limited to
  Employee Number + Arabic Name (English Name unfrozen); rebalanced column widths, denser row rhythm, a
  stronger-but-quiet hover. **Employee Number numeric sort fix:** `code` is a digit string, and SQLite/Prisma
  sorted it lexically (1, 10, 11, 2); removed from the DB sort whitelist and routed through the existing shared
  `sortRowsInMemory` numeric collator (same pattern already used by payroll/financial) over the full filtered set
  before paging — no duplicate sort logic, no API/Prisma/DB change; regression tests added. **Frozen cell
  background consistency fix:** the frozen cells' opaque hover/selected overlay used independently hand-tuned
  percentages (8%/12%) instead of the actual row-level tint values (7%/10%), causing visible drift from the
  non-frozen English Name cell; both now derive from single-source `--emp-hover-pct`/`--emp-selected-pct` tokens.
  **Shared `ToneCell` + Equipment migration:** extracted the Employee expiry-tint system into a shared, reusable
  `ToneCell` component (`frontend/src/components/explorer/`) — the one green/amber/orange/red system for any
  explorer table's status/remaining-period cell, not a per-module copy; Employee's `ExpiryCell` now delegates to
  it (zero visual change, re-verified via full test suite + build); Equipment's Registration Remaining column
  migrated off the old loud `.pill` badge onto the same system (same `expired`/`expiringSoon` flags, no
  calculation change) — removes the saturated badge background and the warning-icon prefix. Equipment's
  WORKING/NOT_WORKING status column intentionally kept on the classic pill (Employee's own status column also
  still uses it, keeping both tables internally consistent with the same reference). 11 files (+427/−31; 5
  added, 6 modified: `backend/src/modules/employees/employees.service.ts`,
  `backend/src/modules/employees/__tests__/employees.sort.test.ts`, `frontend/src/components/DataTable.tsx`,
  `frontend/src/components/SortableHeader.tsx`, `frontend/src/config/modules.tsx`,
  `frontend/src/pages/ResourcePage.tsx` modified; `frontend/src/components/employees/employeeCells.tsx`,
  `frontend/src/components/employees/employee-table.css`, `frontend/src/components/equipment/equipmentCells.tsx`,
  `frontend/src/components/explorer/ToneCell.tsx`, `frontend/src/components/explorer/toneCell.css` added).
  Backend `tsc --noEmit` ✅ · backend build ✅ · backend vitest **1848/1848 pass** ✅ · frontend `tsc --noEmit` ✅ ·
  frontend build ✅ · frontend vitest **1775/1776 pass** (1 pre-existing, unrelated failure — a hardcoded
  `lazy()`-import counter in `routerFutureFlags.test.tsx` already stale against untouched `App.tsx`; reproduces
  identically on vanilla `production`) — all validated both pre-merge and on the merged `production` HEAD.
  Checkpoint tag `pre-employee-equipment-tables-visual-consistency-pack-v1`. Branched from `production` @
  `e52dc75`; feature branch `feature/employee-equipment-tables-visual-consistency-pack-v1` (kept — pushed, not
  deleted), feature commit `f46d203`, merge commit `db6a8a1`, stable tag
  `stable-employee-equipment-tables-visual-consistency-pack-v1`. Product Owner manual visual review: **APPROVED**.
  Gemini final review: **APPROVED**.
- **Employee Financial Position Dashboard v1** (2026-07-20, `stable-employee-financial-position-dashboard-v1`) —
  presentation-only redesign of the top of `EmployeeEntitlementsCenter.tsx` into an executive financial
  dashboard. **Financial Position card:** one `SectionCard` headline ("إجمالي الالتزام الحالي") plus two
  executive `MetricCard`s — Leave Allowance and End of Service — summed directly from the existing legal
  engine (`r.leaveAllowanceValue + eosAmount`, both already computed server-side); no ledger-derived or
  accounting-style figure is shown ("Previously Paid"/"Remaining Expected Liability" cards were deliberately
  dropped in a follow-up correction — the append-only historical ledger must never be presented as an actual
  paid/accounting balance). **Health Indicators panel:** compact `.ent-warning`-styled grid derived purely
  from existing response data (leave eligibility, data completeness, last-disbursement recency, high leave
  balance) merged with the existing `buildWarnings()` output — no new business rule, no warning lost.
  **Service Analytics grid:** consolidates hire date, service duration, approved wage, legal accrual,
  leave balance/used, holidays/sick excluded, and advances count into one responsive `auto-fit` grid — same
  values as before, each now appearing exactly once (no duplication). Built entirely from ExplorerKit
  (`SectionCard`/`MetricCard`) and its `--xpl-*` tokens, RTL, responsive (900px/700px breakpoints). **No
  backend, database, Prisma, or API change** — same single `GET /employees/:id/entitlements` read; every
  displayed number maps 1:1 to the same pre-existing API field; `entitlements.calc.ts` and
  `employees.service.ts` untouched. 2 files (+253/−131; 0 added, 2 modified:
  `frontend/src/pages/EmployeeEntitlementsCenter.tsx`, `frontend/src/pages/EmployeeEntitlementsCenter.css`).
  Zero backend files touched. Frontend `tsc --noEmit` and build both clean, verified pre-merge and on the
  merged `production` HEAD; backend `tsc --noEmit` and build also verified clean on merged HEAD (untouched by
  this feature). Gemini final review: APPROVED.
- **Invoice Confirmation Dialog Layering Fix v1** (2026-07-20, `stable-invoice-confirmation-dialog-layering-fix-v1`) —
  bug fix for the invoice save-confirmation dialog (introduced by Invoice Creation Reliability & Confirmation
  Pack v1) rendering behind the Create Invoice window instead of above it. **Root cause:** the confirmation
  dialog (ExplorerKit `Dialog`, z-index 410) and the Create Invoice window (legacy `Modal`, z-index 500) are
  both non-portaled `position: fixed` overlays in the same stacking context; the app's documented z-index
  ladder deliberately puts the legacy `Modal` *above* ExplorerKit `Dialog`/`Drawer` for the reverse case (a
  Modal-style confirmation over an ExplorerKit-hosted form), so a Dialog confirming on top of a Modal had no
  supported tier — no portal or stacking-context trap was involved. A related defect was also fixed: `Modal`
  and `Dialog` each register an independent `document`-level Escape listener, so a single Escape press with
  the confirmation open previously closed both layers at once. **Fix:** added an opt-in `elevated` prop to
  ExplorerKit's `Dialog`, backed by a new centralized `--z-dialog-elevated: 510` token in the existing
  documented z-index ladder (500 Modal → 510 elevated Dialog → 550 Popover → 600 Tooltip → 9999 toasts) — no
  arbitrary z-index, every other `Dialog` usage across the app is unaffected (prop defaults to `false`);
  `CreateInvoice.tsx`'s confirmation dialog now passes `elevated`, and the underlying `Modal`'s `onClose` is
  guarded to a no-op while the confirmation is open. **No change to business logic, accounting/GL logic, or
  database schema** — focus trap, Tab-cycling, Escape (now correctly scoped to the top-most dialog), and RTL
  are all unchanged, still driven by the shared `useFocusTrap` hook. 4 files (+25/−2; 0 added, 4 modified).
  Zero backend files touched. Frontend `tsc --noEmit` and build both clean, verified pre-merge and on the
  merged `production` HEAD. Gemini final review: APPROVED.
- **Invoice Creation Reliability & Confirmation Pack v1** (2026-07-20, `stable-invoice-creation-reliability-confirmation-pack-v1`) —
  two reliability/UX guarantees for invoice creation. **Future-date prevention:** one shared
  `isNotFutureIssueDate` Zod refine (`invoices.schema.ts`) applied to both `createInvoiceSchema` and
  `updateInvoiceSchema` — `issueDate <= endOfDay(now)` — enforced by the existing `validate` middleware ahead
  of every create/update route, so no entry point (standard form, edit form, fast-entry dialog, or a direct
  API call) can bypass it; mirrored client-side with a `max`-bounded date picker and an early pre-save check
  (clear Arabic message) across `CreateInvoice.tsx`, `EditInvoice.tsx`, and `invoiceFastEntry.validateInvoiceRow()`.
  Live-verified: future date rejected on create and update, today/past dates still accepted. **Save
  confirmation dialog:** `CreateInvoice.tsx`'s save flow now stages the payload and opens an ExplorerKit
  `Dialog` (RTL, focus-trapped, Escape/backdrop-cancel) summarizing invoice number, party, issue date, item
  count, and total — `POST /invoices` fires only after explicit confirmation; cancelling returns to the
  still-editable form with nothing sent. Scoped to the standard create flow only — the fast-entry accelerator
  keeps its no-confirmation rapid-entry design by intent, gaining only the future-date guard. **Prior test-data
  cleanup:** the test invoice used to investigate an earlier "audit log without visible invoice" case
  (`MN-INV-2026-0221`, id 49) and every artifact it produced were permanently deleted ahead of this release
  with zero orphans and zero impact on any other record — a separate one-off data operation, not part of this
  release's commit. **No change to business logic, accounting/GL/posting logic, inventory logic, taxes, or
  database schema.** 6 files (+97/−21; 0 added, 6 modified). Backend `tsc --noEmit`, frontend `tsc --noEmit`,
  and frontend build all clean; backend vitest invoices module 160/160 tests pass, zero regressions. Manual
  visual review: APPROVED. Gemini final review: APPROVED.
- **Global Smart Overflow Tooltip Pack v1** (2026-07-20, `stable-global-smart-overflow-tooltip-pack-v1`) —
  replaces the app's ad-hoc, per-component reliance on the native `title=` attribute for truncated text with
  a single reusable global tooltip system, mounted once, requiring zero page-level integration. One provider,
  `components/tooltip/GlobalOverflowTooltip.tsx`, mounted in `main.tsx`, attaches a single delegated
  `pointerover`/`pointerout`/`focusin`/`focusout`/`keydown` listener set on `document` (plus `scroll`/`resize`
  on `window`) — no per-element listeners, no `ResizeObserver`, no polling, no upfront DOM scan. Detection
  (`overflowDetection.ts`) walks up to 5 ancestors from the hovered/focused element on demand, matching the
  nearest one whose `scrollWidth/scrollHeight` exceeds its `clientWidth/clientHeight` while computed
  `overflow` is `hidden`/`clip` (excludes intentionally-scrollable containers like virtualized lists, which
  use `auto`/`scroll`) and whose own height is under a 160px cap (excludes large scroll-locked containers like
  open Drawers/Dialogs). Text priority: `data-tooltip-text` override → the element's own `title` →
  `textContent`; opt-out via `data-tooltip-disable`. An existing `title` attribute is stashed and removed
  while the custom tooltip is shown, then restored on hide, so there is never a double tooltip and the app's
  pre-existing `title`-based fallback (64+ usages, e.g. DataTable's `.dt-truncate` cells) keeps working
  unmodified with zero code change. Styling is ExplorerKit-consistent (white surface, thin border, soft
  shadow, 8px radius, dark-mode-aware via existing theme tokens, RTL/LTR-aware alignment, `prefers-reduced-
  motion`-safe fade-in, `pointer-events: none`, viewport-clamped auto-flip positioning, hidden under
  `@media print`); new `--z-tooltip: 600` token added to `theme.css`. **No change to any business logic,
  backend, API, database, calculation, or workflow — pure frontend UX/presentation addition.** 5 files
  (+308/−1; 3 added, 2 modified: `main.tsx`, `app/theme.css`). Zero backend files touched. Frontend
  `tsc --noEmit` and build both clean, verified both pre-merge and on the merged `production` HEAD. Manual
  visual review: APPROVED.
- **Employee Entitlements Executive Redesign v1** (2026-07-19, `stable-employee-entitlements-executive-redesign-v1`) —
  visual-only redesign of the Employee Entitlements Center page from an approved HTML mockup, to Microsoft
  Dynamics 365 / SAP Fiori / Oracle Fusion Cloud quality, built entirely on the existing ExplorerKit design
  system (no new components, no parallel UI system). The same 8 KPI `MetricCard`s (unchanged props) were
  regrouped into 4 larger primary tiles and 4 denser secondary tiles; the leave-settlement reconciliation
  flow got chained circular connector badges; the advance-payment settlement got a dashed-divider mini-flow
  with a highlighted total; the historical ledger table got a journal-style header tint; the timeline, empty
  states, and collapsible sections (تفاصيل إضافية والاحتساب / سجل الإجازات / سجل الدفعات المقدَّمة) got
  density/icon/hover/fade-in polish. Every CSS rule is scoped to the page or to classes verified exclusive to
  it (no shared/global ExplorerKit `.xpl-*` rule was touched), so no other page's appearance changed; the
  `.ent-kpis` grid shared with the employee-drawer summary tab is untouched. **No change to Rule 2, Rule 5,
  EOS, Leave Settlement, Historical Ledger, database schema, existing API contracts, permissions, or business
  logic/workflow — same values, same labels, same section order, same terminology throughout.** 3 files
  (+202/−30). Zero backend files touched. Frontend `tsc --noEmit` and build both clean; negligible bundle
  impact (+4.02 kB / 1.22 kB gzip CSS, no new JS logic). Manual visual review: APPROVED.
- **Al-Ojairi Integration Pack v1** (2026-07-19, `stable-al-ojairi-integration-pack-v1`) — completes the Kuwait
  Hijri holiday generation pipeline that Kuwait Holiday Intelligence Pack v1 left as an architecture-only stub
  (`HijriHolidayService` previously always returned `[]`). **Data source:** a real, deterministic, fully offline
  Hijri↔Gregorian conversion (`holidays/hijriCalendarConversion.ts`) — the tabular/civil Islamic calendar
  ("Kuwaiti algorithm": fixed epoch Julian Day 1948440 + the standard 11-leap-years-per-30-year cycle + standard
  Julian-Day↔Gregorian conversion), verified against the public epoch correspondence (1 Muharram 1 AH = 19 July
  622 CE) and structural invariants; no network call, no hardcoded or guessed future Gregorian date — only fixed
  Hijri month/day facts are constants. **Hijri Provider:** `HijriHolidayService.generateExpectedHijriHolidays()`
  covers Islamic New Year, Prophet's Birthday, Eid Al-Fitr, Arafat Day, Eid Al-Adha; every candidate is always
  `EXPECTED_ALOJAIRI`, never auto-promoted to `OFFICIAL`; `HolidaySourceProvider.generateForYear()` now returns
  `{candidates, warnings}` so unsupported years/provider failures fail safely instead of throwing. **Holiday
  Engine evolution:** new static `HolidayEngine.generateCandidates(year, providers?)` is now the single
  system-wide consumer of holiday providers — `HolidayGenerationPlanner` no longer calls providers directly;
  every pre-existing calendar-math method is unchanged. **Supported range:** Gregorian 2020–2050 (one constant to
  widen). **Extension mechanism:** a future provider needs only a `HolidaySourceProvider` implementation + one
  `DEFAULT_HOLIDAY_PROVIDERS` entry — no change to `HolidayEngine`, the planner/executor, or the comparison
  algorithm. **Status persistence:** `classifyHoliday()` parses an existing `[ORIGIN:STATUS]` tag already written
  into the `notes` column, so generated status survives read-back — **no schema change**. **No change to Rule 2,
  Rule 5, EOS, Leave Settlement, Historical Ledger, database schema, existing API contracts, or permissions.**
  Backend **132 files / 1845 tests pass** (23 new, zero regressions). 22 files (+771/−95).
- **Kuwait Holiday Intelligence Pack v1** (2026-07-19, `stable-kuwait-holiday-intelligence-pack-v1`) —
  extends the Employee Entitlements Foundation with a complete Kuwait Holiday generation and planning system, built
  entirely on the Foundation's `HolidayEngine`/`HolidayService`. **Providers:** `HolidaySourceProvider` interface +
  `FixedHolidayProvider` (the 3 fixed Kuwait holidays) + `HijriHolidayProvider` (wraps `HijriHolidayService`, still
  returns `[]` — no future Hijri dates hardcoded or guessed); `DEFAULT_HOLIDAY_PROVIDERS` is the single list the
  planner consumes, so a future source is one array entry. **Comparison/conflict:** one algorithm
  (`compareHolidayYear()`) classifies every generated candidate as `NEW`/`EXISTING`/`CHANGED`/`SKIPPED`/`CONFLICT`
  against the DB; `HolidayConflictService` derives its view from this result rather than re-detecting. **Services:**
  `HolidayValidationService`, `HolidayGenerationPlanner` (read-only preview — nothing written during planning),
  `HolidayGenerationExecutor` (re-plans server-side, creates only the `NEW` bucket, idempotent "safe regeneration").
  **API:** two new additive routes on the existing `/api/holidays` router — `POST /generate/preview`
  (`employees.read`, no write) and `POST /generate/apply` (`employees.update`, writes only after explicit UI
  confirmation); the 3 pre-existing routes are unchanged, `GET /` gained only additive `origin`/`status` fields.
  **Frontend:** Settings → "العطل الرسمية" gained a year selector + "توليد العطل" button opening
  `GenerateHolidaysDialog` (preview → conflict summary → explicit confirm → generation report), built entirely
  from existing ExplorerKit components. **No legal-calculation, Rule 2/5, Leave Settlement, Historical Ledger, EOS,
  database schema, or existing API contract change.** Backend **130 files / 1822 tests pass** (27 new, zero
  regressions). **Gemini review: APPROVED.**
- **Employee Entitlements Intelligence Suite v1 (Foundation)** (2026-07-19, `stable-employee-entitlements-intelligence-suite-foundation-v1`) —
  establishes Employee Entitlements as an independent backend domain (`backend/src/modules/employee-entitlements/`)
  without changing any legal calculation, business rule, database schema, API contract, or permission — architecture
  only, nothing wired into any existing calculation path or HTTP route. New domain: `models/` (clean public
  interfaces — `EmployeeProfile`, `Holiday`, `LeavePeriod`, `LeaveAdvance`, `Settlement`, `EntitlementSummary` as a
  type alias over the existing `EntitlementResult`, `TimelineEvent`); `holidays/` (fixed Kuwait holiday definitions,
  a documented Hijri architecture stub with no hardcoded future dates, `classifyHoliday()` for read-time
  origin/status derivation, a first-cut generation workflow); `engines/HolidayEngine.ts` (holiday/weekend/working-day
  detection and counting, its leave-exclusion method delegating 100% to the unmodified
  `computeEffectiveAnnualLeaveDays()`); `services/` (`HolidayService`, `WorkingDaysService`, `HijriHolidayService`);
  `calculators/legalEntitlementCalculator.ts` (re-export surface over `entitlements.calc.ts` — the original file was
  not relocated); `timeline/buildEntitlementTimeline.ts`. Dependency audit confirmed zero imports from Accounting,
  Transactions, Invoices, Contracts, Inventory, Equipment, Banks, Cash, Expenses, Purchases, Suppliers, or Customers.
  Backend **123 files / 1795 tests pass** (29 new, zero regressions); no frontend files touched. **Gemini review:
  APPROVED.**
- **Employee Entitlements Experience Refactor v1** (2026-07-19, `stable-employee-entitlements-experience-refactor-v1`) —
  presentation/navigation-only split of the Employee Entitlements experience into two layers. The employee drawer tab
  (`EmployeeEntitlementsTab.tsx`, 484 → ~110 lines) is now a lightweight summary: 4 KPI cards (current leave balance,
  total legal entitlement, leave used, settlement summary) + one mini-summary line + a "فتح مركز المستحقات" action that
  **navigates** (not a dialog, not a drawer expansion) to a new page. The full experience — Executive KPI grid,
  collapsible calculation/EOS detail, Smart Warnings, Leave Reconciliation, Leave Advance Reconciliation, Settlement
  Summary, Historical Activity Timeline, Historical Ledger, and collapsible detailed tables — moved to a new
  lazy-loaded route `/employees/:id/entitlements` (`pages/EmployeeEntitlementsCenter.tsx`), added inside the existing
  `Layout`-wrapped route group (sidebar/topbar preserved). Collapsible sections use native `<details>`/`<summary>`
  styled to match `xpl-card` — no new design language. A new shared module
  (`components/employee/entitlementsShared.tsx`) centralizes every type/label-map/helper previously duplicated inline
  in the old tab (`buildWarnings`, `buildTimeline`, formatting helpers) — single source for both surfaces, logic moved
  verbatim, not rewritten. Both surfaces call the identical unmodified `GET /employees/:id/entitlements` endpoint.
  Includes one additive backend prerequisite (`employees.service.ts`) the Center page depends on to render: a
  `leaveExclusionBreakdown` field exposing a presentation-only holiday/sick breakdown — the legal `netUsedLeaveDays`
  is still derived exclusively via the **unchanged** `computeEffectiveAnnualLeaveDays()` calculation-engine call
  (mathematically guaranteed consistent by construction). **No calculation-engine, Rule 2/5, Leave Settlement,
  Historical Ledger semantics, EOS/gratuity, DB schema, or permission changes.** Backend **116 files / 1766 tests
  pass**, unaffected. **Gemini review: APPROVED.**
- **Kuwait Labour Law Compliance Pack v2 — Employee Entitlements** (2026-07-19, `stable-kuwait-labour-law-compliance-pack-v2`) —
  implements the two remaining confirmed items from the independent Kuwait Labour Law Compliance Audit (Rules 2
  and 5); Rules 4/6/18 stay out of scope pending formal legal interpretation. **Rule 2 (Art. 70, first-year
  eligibility):** a single `isFirstYearEligible()` gate on `calculateEntitlements()` forces `accruedLeaveDays`/
  `remainingLeaveDays`/`leaveAllowanceDays`/`leaveAllowanceValue` to explicit `0` before 9 completed calendar
  months of service; the existing proportional accrual formula resumes automatically and unchanged once
  eligible — no parallel formula. **Rule 5 (Art. 70, holiday/sick exclusion):** new pure
  `computeEffectiveAnnualLeaveDays()` excludes official holidays and approved sick-leave days falling inside
  each approved annual-leave interval, using day-index `Set` deduplication so a day matching both is only
  excluded once; `employees.service.ts` now sums this per leave record instead of the previous raw
  `Leave.days` aggregate. **New minimum holiday infrastructure:** additive `Holiday` table (hand-authored
  surgical migration) + 4-file `backend/src/modules/holidays` module (`/api/holidays`, reusing existing
  `employees.read`/`employees.update` permissions — no new permission keys) + a genuine management UI (list/
  add/delete) added to `Settings.tsx`. **No changes** to EOS/gratuity, wage-base composition, resignation
  scenarios, the ÷26 divisor, Leave Settlement architecture, or the Historical Ledger; no accounting/payroll/
  bank changes. Tests: `entitlements.calc.test.ts` 19 → 29 (10 new: 4 Rule 2 boundary/EOS-unaffected cases, 6
  Rule 5 exclusion/dedup cases). Backend **116 files / 1766 tests pass**, zero regressions. backend/frontend/
  electron `tsc --noEmit`, `prisma validate`, and frontend build all green. **Gemini Final Review: APPROVED.**
- **Kuwait Labour Law Compliance Pack v1 — Employee Entitlements** (2026-07-19, `stable-kuwait-labour-law-compliance-pack-v1`) —
  legal remediation of the Employee Entitlements calculation engine addressing 4 findings from the Kuwait
  Labour Law Compliance Audit (Rules 10, 13, 16, 17). **Rule 13:** daily-wage divisor centralized to the
  project-adopted legal baseline of **26** (was 30), via one constant (`DAILY_WAGE_DIVISOR`) with a single
  shared raw intermediate value (no duplicated division); Art. 51 tier-2 ("one month's wage/year beyond 5
  years") now multiplies the wage base directly, staying exactly one month independent of the divisor.
  **Rule 16:** entitlement wage base centralized to `Employee.salary + Σ(active recurring EmployeeAllowance
  amounts within their date window)` (Art. 55/62), resolved once (`resolveWageBase`) and consumed by every
  calculation path via a new `computeCurrentEntitlements()` (also removed prior duplication between the read
  path and the ledger snapshot path). **Rule 17:** `computeGratuity()` now always returns both the full Art.
  51 (employer-termination) amount and the Art. 53 resignation-reduced amount (0 / ½ / ⅔ / 1 by service-year
  band), with no implicit default scenario; frontend adds an explicit Employer-Termination/Resignation toggle
  and a **permanent** (no longer conditional) legal-basis notice. **Rule 10:** `LeaveSettlement` redesigned
  per Art. 73/74 (no waiver of annual leave, paid or unpaid, during service) — it no longer resets or narrows
  the leave-accrual baseline; `leaveBaselineDate`/`resolveLeaveBaseline` removed entirely from the pure
  calculator (no settlement-shaped input exists anymore, so settlements structurally cannot affect any
  calculation); existing `LeaveSettlement` rows are preserved unchanged (schema doc-comment redesign only —
  verified via `prisma migrate diff` to introduce zero structural drift, no migration). **No accounting /
  payroll / bank changes; no database migration.** Tests rewritten (19 cases: divisor/no-duplication proof, 5
  Art. 53 boundary tests, 3 tests proving the calculator has no settlement/ledger input). Backend **116 files
  / 1756 tests pass**; frontend suite unchanged from baseline (1 pre-existing, unrelated failure in
  `routerFutureFlags.test.tsx` — stale `lazy()` count on the untouched `App.tsx`, outside this release's
  scope). Independent architectural review + **Gemini Final Review: APPROVED**.
- **Historical Ledger Pack v1 — Employee Entitlements** (2026-07-19, `stable-historical-ledger-pack-v1`) —
  extends the Employee Entitlements drawer with two **independent** manual concepts + a review polish (17
  files, +904/−33; two new tables + one nullable column, all additive). **(A) Leave Settlement Baseline**
  (`LeaveSettlement` table + pure `resolveLeaveBaseline`): leave accrual now runs from the **latest settlement
  date** (else hire date) — drives leave accrual **only**, never gratuity or service duration (both stay
  anchored to hire date). **(B) Employee Entitlement Ledger** (`EmployeeEntitlementLedger` table; types Leave
  Allowance / End of Service / Other): **historical audit only** — never feeds any calculation, never creates
  a journal/bank/cheque/cash-voucher/payroll record. **(C) Polish:** a **write-once** informational
  `leaveBalanceSnapshot` (captured server-side at creation for Leave Allowance rows, never used in any calc,
  no update path) + a **display-only** "مرتبط بتسوية الإجازة" badge derived at render from same-day settlement
  matching (no FK, no coupling, no synchronization). New endpoints `GET/POST /employees/:id/leave-settlements`
  and `GET/POST /employees/:id/entitlement-ledger` all reuse the existing `employees.read` / `employees.update`
  permissions (no new keys); the entitlements response gained read-only `settlements[]`, `leaveBaseline`, and
  `ledger[]`. Frontend reuses ExplorerKit dialogs/tables (RTL, dark mode, responsive). The pure calculator is
  unit-tested to prove the ledger/snapshot/badge can **never** change calculations. Backend **1756 tests
  pass**; backend/frontend/electron `tsc`, `prisma validate`, and frontend build all green. Code review +
  manual visual review complete. **Known pre-existing, unrelated:** `routerFutureFlags.test.tsx` asserts a
  stale `lazy()` count (48 vs actual 46 in the untouched `App.tsx`) — already red on the prior production HEAD,
  outside this pack's scope.
- **Employee Entitlements Drawer Tab v1** (2026-07-19, `stable-employee-entitlements-drawer-v1`) —
  new read-only "الاستحقاقات" tab in the Employee drawer (8 files, +782/−2; no DB/schema change). Shows
  service duration, annual-leave balance/used/remaining, leave cash allowance, and end-of-service gratuity
  calculated as of today per **Kuwait Private Sector Labour Law No. 6 of 2010** (Art. 70 annual leave 30
  days/yr; Art. 51 monthly-paid gratuity — 15 days'/yr for first 5 years + one month's/yr thereafter, capped
  at 18 months). Fixed statutory formulas in a pure, stateless, unit-tested calculator (`entitlements.calc.ts`,
  10 tests) — no config, no rules engine, no editable formulas. New read-only endpoint
  `GET /api/employees/:id/entitlements` (reuses the existing `employees.read` permission); used annual-leave
  days summed from stored `Leave.days` (single source of truth). Frontend reuses ExplorerKit (lazy-mounted,
  keyed by employee id; RTL, dark-mode, responsive); missing data shows per-card "بيانات غير مكتملة" with the
  exact missing field (no estimation); legal disclaimer shown **only** when required data is missing. Gemini
  review: APPROVED (no critical/medium/minor). No Business Logic regression.
- **Cash Transactions Table Alignment & Layout Polish Pack v1** (2026-07-19, `stable-cash-transactions-table-alignment-layout-polish-pack-v1`) —
  frontend-only, presentation-only (2 files: `BankAccountExplorer.tsx`, `BankAccountExplorer.css`). Centers
  every column header of the Cash Transactions (Bank Account Explorer) timeline table; collapses the
  Description cell from a two-line stacked layout to a single non-wrapping ellipsis-truncated line (full
  text still available via the project's existing `title`-tooltip pattern); rebalances column widths
  (date/type/amount/balance/description) for a more consistent layout. No Business Logic / API / handler /
  data / column-order / DataTable / ExplorerKit-token changes.
- **User Management Header Cleanup Pack v1** (2026-07-19, `stable-user-management-header-cleanup-pack-v1`) —
  frontend-only, presentation-only (1 file, `Users.tsx`, −1 line). Removed the duplicate "مستخدم جديد"
  (new user) button rendered in the Users page `ExecutiveHeader` `aside` slot, leaving the toolbar button
  above the table as the single add action on the page. No Business Logic / API / permission / handler /
  layout change.
- **Date Boundary Consistency Pack v1** (2026-07-18, `stable-date-boundary-consistency-pack-v1`) —
  backend-only, no UI changes. Standardized `toDate`/`asOfDate` end-of-period handling to the canonical
  `endOfDay()` helper across every financial report that previously used a bare `new Date(toDate)` (UTC
  midnight), which silently excluded records posted later on the final day of a period: Trial Balance
  (as-of + period), GL Report, GL Statement, Customer/Supplier Statement, Journal Book, Accounting
  Payments list, Expenses list/stats, and Bank Salary Analytics. Also removed the last independent
  reimplementation of this logic — a duplicate local `endOfDay(string)` in `reports.service.ts` — in
  favor of the shared `dateWindows.ts` implementation. No accounting, posting, journal, permission,
  schema, or API-contract change. Backend suite 115 files / 1737 tests pass; visual review gate waived
  by explicit Product Owner confirmation (nothing to render).
- **Bank Account Explorer Active Tabs Visual Polish v2** (2026-07-18, `stable-bank-account-explorer-active-tabs-visual-polish-v2`) —
  Dark Mode active-tab fix found by a UI consistency audit: the primary nav tabs and drawer info-hub sub-tabs
  relied only on a 2px underline (no background fill), blending into the page in Dark Mode. Fixed with a
  solid ExplorerKit indigo/purple fill (#6366f1) + white text/icon, matching Inventory & Purchasing's active-
  tab standard. CSS-only, Dark Mode only, one file (`BankAccountExplorer.css`), no markup/React/shared-
  component changes. Financial Center, Dashboard, and Data Import have the same underlying underline-only
  pattern — explicitly out of scope for this pack, flagged as open findings for a future release.
- **Production Readiness & Accounting Integrity Consolidation Pack v2** (2026-07-17, `stable-production-readiness-accounting-integrity-pack-v2`) —
  fixed the packaged production build (npm-workspaces dependency-hoisting gap left `backend/node_modules`
  almost empty → `MODULE_NOT_FOUND` on every launch), added automatic Prisma migrations on production
  startup, added backend crash resilience (uncaughtException/unhandledRejection/EADDRINUSE handlers, SQLite
  `busy_timeout`), fixed a date-boundary bug so all financial-summary period queries agree, wired the
  Accounting Dashboard to the active period, and **removed automatic payroll GL posting entirely** —
  payroll is operational-only going forward, salary expense is recorded exclusively through the Expenses
  module. Dashboard, Executive Decision Center, Accounting Dashboard, Financial Center, the P&L Report, and
  the Expenses page now report an identical expense total for any given period. Historical cleanup (231
  payroll journals) already executed against dev; production run is a documented follow-up.
- **Accounting Integrity & Financial Accuracy Pack v1** (2026-07-17, `stable-accounting-integrity-financial-accuracy-pack-v1`) —
  single GL source of truth for every financial report (Dashboard/P&L/financialSummary), immutable posted
  journals (revision-based reverse+repost, never `deleteMany`), driver salary disbursements now posted to
  the GL, legacy `Transaction`-table auto-writes retired, 24/24 cross-validation checks pass with zero
  discrepancy. Backend only, no UI change.
- **Project Cleanup & Architecture Remediation Pack v1** (2026-07-17, `stable-cleanup-architecture-remediation-pack-v1`) —
  implemented all 11 approved findings from the prior Zero-Risk Cleanup Audit series: centralized GL
  entry-number retry, fixed report money/date formatting drift, normalized Tafqeet rounding, consolidated
  focus-trap/pagination/toast duplication, added canonical `isSystemAdmin()`, gave `attachments` a proper
  controller + shared permission dispatch, documented the manual-journal-entry exception, introduced
  `PROJECT_STATE.md`'s rotation policy. No feature/UI changes.
- **Financial Center & Banking UX Fix Pack v2** (2026-07-16) —
  header alignment CSS fix, expense-breakdown chart fix, full Banking Center embed into Data Import.
- **Financial Center & Banking UX Consolidation Pack v1** (2026-07-16) — report header alignment, collapsible
  dashboard financial KPI section, standardized date placeholder, Banking Center nav cards, expense chart
  label fix, Price Agreements usage-report endpoint fix.
- **Dashboard Retry Loader Button v1** (2026-07-16) — visual-only header retry control replacement.

---

## Current Pending Work

- **GL auto-posting policy conflict** — Bank Reconciliation only produces suggestions today; extending it
  to auto-post is on the Medium-priority roadmap but requires resolving the conflict with the standing
  "never auto-post" policy first.
- **Historical payroll-GL cleanup — production not yet run.** `scripts/remove-payroll-gl-journals-v1.ts
  --apply` (idempotent, dry-run by default) removed 231 legacy `SALARY_PAYMENT` journals from the dev
  database as part of the 2026-07-17 v2 release; the same script needs to be run against the production
  database before production's own P&L/Expenses figures reconcile the same way dev's now does.
- **`routerFutureFlags.test.tsx` stale assertion** — hardcodes an expected lazy-route count (48) that a
  2026-07-16 commit made stale (actual count is 46); trivial one-line fix, not yet applied — flagged by the
  2026-07-16 audit, deliberately left out of scope of every pack since.
- **`transactions.service.ts` `/transactions/profit-loss` still GL-based** — intentionally deferred by the
  2026-07-22 Operational Reporting Migration v1 (see Active Foundations); duplicates the Accounting
  Summary panel exactly (same GL call). A future cleanup pack should retire or consolidate it.
- **Inventory posts to the legacy single-sided `Transaction` table (RI-5, flagged by the 2026-07-23
  Financial Integrity Audit)** — `inventory.service.ts` material receipt/issue write debit-only rows via
  `transactionsService.postEntry` (no debit==credit guard), a different model from the balanced GL
  `JournalEntry`. Verified isolated: no official report (`operational.reporting.ts`, `gl.reporting.ts`,
  Dashboard, Executive, Reports) reads this table for any figure — only the Transactions list view and
  the already-deferred legacy P&L endpoint above. Intentionally excluded from the Consistency Pack;
  candidate for a future cleanup pack alongside the `/transactions/profit-loss` retirement.
- **Invoice stats aggregate rounding nit (RI-7, flagged by the 2026-07-23 Financial Integrity Audit)** —
  `invoices.service.ts`'s list-stats `totalRemaining` (`totalSales − totalCollected`) is not wrapped in
  `roundMoney`, unlike every decision-path calculation in the same file (`remainingDue`, `newPaid`,
  overpayment guard). Display-only, re-rounded at render; deferred as cosmetic.
- No other release is mid-flight; `production` is fully released and validated as of 2026-07-23.

---

## Permanent Project Decisions

- **Monetary representation stays `Float` + SQLite + KWD 3dp** — reviewed and confirmed correct (SQLite
  `DECIMAL` has NUMERIC affinity and behaves identically to `REAL`; 0 unbalanced entries observed out of
  113; integer-fils storage judged unjustified). Do not propose a Decimal/BigInt migration unless
  concrete reproducible inaccuracies appear.
- **No cloud backup / Google Drive connector** — explicitly removed; do not restore.
- **No cryptographically signed PDF export.**
- **AI stays deterministic — no local LLM, RAG, OCR/Document AI, or free SQL layer.** Removed from UI and
  roadmap.
- **No Mobile Companion app.**
- **Print system is closed** — do not open a sixth printing generation.
- **JWT revocation/invalidation** — not an active priority for a single-user local app.
- **Enterprise security hardening** (Electron CSP + `sandbox:true`, bcrypt cost increase, etc.) — not
  active roadmap work; same single-user/offline reasoning.
- **Local backup encryption** — optional future consideration only, not a committed priority.
- **Bank Reconciliation never auto-posts** — manual confirmation required for every posting suggestion.
- **Styling architecture**: Vanilla CSS is the app-wide default; Tailwind is scoped exclusively to the
  shadcn/ui integration subtree — officially approved, not to be re-flagged as a violation.
- **Release governance**: CLAUDE.md is canonical on any conflict with AGENTS.md regarding release
  automation.

---

## AI Quick Start

**Status:** manarERP is a mature, production-complete offline Electron ERP for a single road-construction
company. 304 stable releases shipped since 2026-06-07. All core modules (accounting/GL, invoices,
payroll, cheques, banking, printing, RBAC) are feature-complete; current work is polish packs and a short
list of explicitly deferred/optional items. The latest 2026-07-17 release made the packaged production
build actually start reliably, added automatic migrations and crash resilience, and completed the
accounting single-source-of-truth work — every expense-reporting surface now agrees, and payroll no longer
posts to the GL at all (salary expense is Expenses-module-only, by permanent business decision). See Active
Foundations for what's now single-sourced.

**Current priorities:** Token Efficiency above all else; consolidated implementation packs; no
unsolicited redesigns or architecture rewrites.

**Current workflow:** ChatGPT plans → Claude implements silently → Claude Code Review to clean →
mandatory User Visual Review → merge/tag/push/update-state. No Gemini/security gate by default.

**Current architecture:** Electron + React (HashRouter) + Express + Prisma + SQLite, ExplorerKit design
system, double-entry GL, deterministic offline AI layer, closed print engine.

**Next planned work:** Print Designer 7B (PDF import), Bank Explorer period opening/closing balance;
several items are explicitly *not* to be scheduled (see Permanent Project Decisions).

**Critical warnings:**
- Never modify `production` directly; never force-push/rebase/reset --hard without explicit approval.
- Never claim visual verification — that is the user's job alone.
- Don't re-propose the declined/removed roadmap items above — their absence is a decision, not a gap.
- Don't schedule GL auto-posting from Bank Reconciliation without first resolving the never-auto-post
  policy conflict.

**Things that must never change:** offline/local-first architecture, SQLite, KWD 3-decimal currency
formatting, Arabic-first UI with English codebase, the Float monetary representation, the closed print
system, the deterministic (non-LLM) AI layer.

---

## Maintenance Policy (permanent)

This file exists **only** for ChatGPT continuity across new conversations. Claude Code does **not** use
it as implementation context and must keep maintaining it regardless of whether a given session mentions
it. Claude updates this file automatically, without waiting to be asked, whenever any of the following
happens: a production release, a completed Feature/Fix/Architecture/Major-UI pack, or a permanent change
to workflow, architecture, user preference, or project decision. Every update keeps only current truth —
replacing, not accumulating: no changelog, no release archive, no duplicated or conflicting information.
A production release is not complete until `PROJECT_STATE.md` **and** this file are both updated.
