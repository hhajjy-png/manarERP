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
| **Current Merge Commit** | `ea62520` (merge of `feature/employee-entitlements-drawer-v1`) |
| **Current Documentation Commit** | `28b31b0` — "docs: record Employee Entitlements Drawer Tab v1 release in PROJECT_STATE / AI_CONTEXT" |
| **Current Stable Tag** | `stable-employee-entitlements-drawer-v1` |
| **Current Release Date** | 2026-07-19 |
| **Total Stable Releases** | 313 (window 2026-06-07 → 2026-07-19) |
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
- **Single accounting source of truth (as of Accounting Integrity & Financial Accuracy Pack v1,
  2026-07-17):** `shared/services/gl.reporting.ts` (`glProfitAndLoss`/`glMonthlyProfitAndLoss`/
  `glAccountFlow`) is the one engine every financial surface reads from — Dashboard, Reports P&L, and
  `accounting.service.financialSummary` all derive revenue/expense/net profit from it (accrual basis).
  24/24 independent cross-validation checks confirm zero discrepancy across GL, Trial Balance,
  `financialSummary`, Dashboard, AR aging, and customer statements.
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
- No other release is mid-flight; `production` is fully released and validated as of 2026-07-17.

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
