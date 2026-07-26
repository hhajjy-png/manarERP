# manarERP — Architecture & Engineering Review

**Reviewer perspective:** Principal Software Architect / Enterprise ERP Consultant / Security Auditor / Performance Engineer / UX Reviewer
**Date:** 2026-06-26
**Scope:** Full repository — backend (~33.8k LOC), frontend (~56.5k LOC), Electron (~1.1k LOC), Prisma schema (1,196 lines, 50 models), 51 test files.
**Constraint respected:** This review preserves the Offline-First Desktop philosophy. No SaaS, microservices, containers, message brokers, or cloud dependencies are recommended. Every recommendation fits Electron + React + Express + Prisma + SQLite.

> Tone note: This is a deliberately critical review. The project is strong, so the value is in the gaps, not the praise. Read sections 7, 14, and the Top 25 first if short on time.

---

## 1. Executive Summary

| Dimension | Assessment |
|---|---|
| Project maturity | **~85%** — production-grade structure, real test coverage, disciplined module pattern |
| Architecture quality | **Very good** — clean layering, consistent conventions, low accidental complexity |
| Production readiness | **Ready** for a 20–50 user single-site contracting company, with caveats below |
| **Overall score** | **84 / 100** |

**Top strengths**

1. **Consistent module pattern** (routes → controller → service → schema) applied across ~30 domains with almost no drift. This is the single biggest reason the codebase is maintainable at 90k LOC.
2. **Disciplined data integrity** — DB-level `@@unique([referenceType, referenceId])` to block double-posting of journal entries, 126 `@@index` declarations, deliberate `onDelete: Cascade/Restrict` choices, and `$transaction` used in every multi-write service.
3. **Security fundamentals done right** — `helmet`, strict CORS allow-list (no wildcard), env-validated `JWT_SECRET` (≥32 chars enforced at boot), bcrypt hashing, login rate-limiting, centralized RBAC with `SYSTEM_ADMIN` bypass, Electron `contextIsolation: true` + `nodeIntegration: false` + a narrow `contextBridge` surface.
4. **Server-side pagination** with a capped `MAX_PAGE_SIZE` (200) — the system will not melt when a table reaches 50k rows.
5. **Real test suite** — 51 test files concentrated on the dangerous areas (accounting, payroll, invoices, bank import, approvals), including floating-point precision and double-posting tests.

**Top weaknesses**

1. **All monetary values are stored as `Float`** (74 fields; zero `Decimal`). Mitigated in code with `round3()` + 0.001 tolerance, but this is a band-aid over an IEEE-754 foundation in a system that handles payroll, journal entries, and KWD (3 dp). This is the #1 architectural risk.
2. **API error contract drift** — `CLAUDE.md` documents `{ success, error }`, the rate limiter returns `error`, but `errorHandler` returns `{ success, message }`. The frontend reads `message`. Real inconsistency that will bite a future integrator.
3. **No JWT revocation** — logout is client-side only; a stolen/leaked 12h token stays valid until expiry. Acceptable offline, weak if the workstation is shared.
4. **Backups are unencrypted plaintext `.db` files** — payroll, salaries, and bank data exportable by anyone with file access. No encryption-at-rest option.
5. **Monolithic hotspots** — `i18n.ts` (2,450 lines), `Invoices.tsx` (1,755), `executive.service.ts` (941). These are maintenance and merge-conflict magnets.
6. **Security observability gaps** — failed logins are not audited (only successful `LOGIN`), and there is no audit-log retention/rotation strategy.

---

## 2. Architecture Review

**Folder organization — Excellent.** The `electron / frontend / backend` split is clean, and the backend's `config / core / modules / shared` layering is textbook. One folder per business domain with a fixed 4-file shape makes the system navigable by anyone.

**Module separation — Excellent.** ~30 modules, each self-contained. `app.ts` is a flat, readable router registry. Cross-module coupling happens through Prisma + shared services, not through tangled imports.

**Dependency quality — Good.** Dependencies are mainstream, current, and minimal. No "kitchen-sink" libraries. Path aliases (`@core`, `@modules`, etc.) are compiled to relative paths for production — a sensible choice that avoids a runtime resolver.

**Coupling / cohesion — Good, with two smells:**

- **Service-to-service calls are implicit.** Invoices post journal entries; payroll posts journal entries. The accounting "posting" logic is invoked from multiple modules. This is fine, but the posting contract lives partly in each caller. A single `postingService` (a `shared/services` facade) would centralize the GL-routing rules that are currently spread across invoices/expenses/payroll.
- **`executive` + `financial` + `dashboard` overlap.** Three large services (941 / 761 / 846 lines) all aggregate the same underlying tables for analytics. There is likely duplicated aggregation SQL. Worth a shared `analytics/aggregations.ts`.

**Layering — Correct.** Controllers are thin, services hold logic, schemas validate. No business logic leaking into routes or controllers from the samples reviewed.

**Refactoring opportunities (preserve architecture):** extract a posting facade; consolidate analytics aggregations; split the three largest services by sub-domain (e.g., `reports.service.ts` → `reports.receivables.ts`, `reports.tax.ts`).

---

## 3. Backend Review

**API design — Good.** RESTful, consistent `/api/<module>` prefixes, predictable verbs. `successResponse/errorResponse` helpers standardize the happy path.

**Controllers / services / validation — Strong.** Zod schemas validate every mutating route via a `validate` middleware. `asyncHandler` wraps handlers so async rejections reach the central error handler. This is the correct pattern and it's applied uniformly.

**Error handling — Good but contract-inconsistent.** `errorHandler` is genuinely well thought out: it maps Zod errors, Prisma `P2002/P2025/P2003`, and decorates duplicate-invoice / duplicate-journal conflicts with machine-readable `code` fields the frontend keys off. **The defect:** the response shape is `{ success: false, message, details }`, while the documented contract and the login rate-limiter emit `{ success: false, error }`. Pick one (`message`) and fix the rate limiter + docs.

**Prisma usage — Strong.** `$transaction` appears in every service that does multi-row writes (inventory 8×, invoices 7×, payroll 6×, maintenance 4×). Raw SQL is used in exactly three safe places (PRAGMA literals + tagged-template `$queryRaw`), with an explicit code comment forbidding string concatenation. No injection surface found.

**Transactions — Good, one gap.** Interactive `$transaction` callbacks are used correctly. SQLite default isolation is acceptable for a single-process backend, but high-frequency writers (bank import, payroll runs) should set a `timeout`/`maxWait` and confirm `PRAGMA busy_timeout` is set on the connection to avoid `SQLITE_BUSY` under the WAL checkpoint that runs during backups.

**Audit log — Good design, two gaps.** `recordAudit` correctly never throws (logging failure can't break the business op), captures old/new JSON + IP. **Gaps:** (1) only *successful* logins are recorded — failed-login attempts, permission denials, and lockouts are invisible; (2) no retention/rotation — `audit_logs` grows unbounded in a file DB.

**Security — see §7.** **Performance — see §8.** **Code quality — see §11.**

---

## 4. Frontend Review

**UI / UX consistency — Good.** A small, reusable kit (`DataTable`, `FormDialog`, `Modal`, `ConfirmModal`, `StatCard`, `Toast`) is used broadly, which is why 43 pages feel coherent. RTL/LTR and dark mode are evidenced in UAT screenshots.

**Reusable components — Good, with a duplication smell.** There are **six** near-identical `ForceDelete*Modal` components (Contract, Customer, Equipment, Invoice, ProjectPrice, Supplier). These almost certainly differ only in entity name, dependency list, and endpoint. Collapse into one `ForceDeleteModal` driven by a config object — this is exactly the data-driven pattern the project already uses for `ResourcePage`.

**Page quality — Mixed.** Generic CRUD pages driven by `config/modules.tsx` are excellent. But the hand-rolled pages are oversized: `Invoices.tsx` (1,755), `Inventory.tsx` (1,097), `Maintenance.tsx` (1,027), `Cheques.tsx` (947). These mix data fetching, form state, validation, and print logic in one file. Extract hooks (`useInvoiceForm`, `useInvoiceTotals`) and sub-components.

**State management — Appropriate.** Zustand for auth/UI, local state per page. No over-engineering. **But:** only 32 files use `useMemo/useCallback/React.memo` across ~90 components/pages. The 1,000+ line pages will re-render expensive subtrees (line-item tables, live totals) on every keystroke. Targeted memoization is warranted in the invoice/payroll editors specifically.

**Accessibility — Likely weak (not deeply audited).** Arabic-first is handled, but verify focus management in modals, keyboard navigation of `DataTable`, and `aria-*` on icon-only buttons. ERP power users live on the keyboard; this is real productivity, not box-ticking.

**Offline behavior — Correct by construction.** Everything talks to `127.0.0.1:48211`; no external calls observed. The 20s Axios timeout and 401→login redirect interceptor are sensible.

---

## 5. Electron Review

**IPC — Clean.** Channels are purpose-named (`backup:*`, `dialog:*`, `pdf:*`, `session:*`), invoked via `ipcRenderer.invoke` (promise-based), and **only a curated API is exposed** through `contextBridge` — `ipcRenderer` itself is never leaked. This is the correct, secure pattern.

**Context isolation / preload — Correct.** `contextIsolation: true`, `nodeIntegration: false`, dedicated `preload.js`. `setWindowOpenHandler` is present (verify it denies/`shell.openExternal`-gates all new windows).

**Hardening gaps:**

- **Main `BrowserWindow` does not set `sandbox: true`.** The PDF window does (`pdf.ipc.ts`), so the team knows the flag — apply it to the main window too. With your narrow preload, this is low-risk to enable.
- **No explicit `Content-Security-Policy`.** Even offline with `file://`, a CSP (`default-src 'self'`) is cheap defense-in-depth against an accidental remote `<img>`/`<script>` or an XSS payload stored in DB-rendered content (e.g., a malicious customer name).

**Printing / PDF — Strong choice.** Rendering Arabic via Chromium `exportPdfFromHtml` (rather than PDFKit text layout) is the right call for RTL/ligatures — PDFKit struggles with Arabic shaping. Keep both: PDFKit for tabular reports, Chromium HTML for anything Arabic-heavy.

**Offline robustness — Good.** Graceful shutdown with a 5s forced-exit timer prevents `EADDRINUSE`; WAL checkpoint before backup is correct.

---

## 6. Database Review

**Schema quality — Very good.** 50 well-named models, consistent `@@map` to snake_case tables, sensible nullability, status enums-as-strings (pragmatic for SQLite). Immutable price snapshots on invoice items (`priceId` + `onDelete: Restrict`) show real domain maturity.

**Indexes — Excellent.** 126 `@@index`/composite indexes including FK columns and query hot-paths (`issueDate`, `status`, `direction`, composite `[referenceType, referenceId]`). Only `Role` lacks one, which is fine (tiny table).

**Relations / constraints — Strong.** Deliberate cascade vs. restrict. The double-posting guard at the DB level is the standout — most ERPs only enforce this in app code.

**The one serious problem — `Float` for money (repeated from §1).** SQLite + Prisma support `Decimal`. Storing `salary`, `total`, `debit`, `credit`, `netSalary`, etc. as `Float` means every aggregation accumulates binary-rounding error. Your `round3()`/tolerance mitigations work *today* at small scale, but they are compensating controls, not a fix. Over thousands of payroll lines and journal entries, sums can drift by fractions of a fil and fail reconciliation. **Recommendation:** migrate monetary columns to `Decimal` with a data migration; keep `round3` only at presentation. (Detailed risk + effort in §14/Top 25.)

**No DB-level CHECK constraints.** Debit/credit balancing, non-negative amounts, and quantity≥0 are enforced only in the app layer. Prisma can't emit `CHECK`, but you can add them via a raw SQL step in a migration (`ALTER TABLE ... ADD CONSTRAINT`/SQLite table rebuild). Worth it for `debit*credit=0` and `amount>=0` on financial tables.

**Migration quality — Good and honest.** 30 incremental, descriptively-named migrations with no destructive rewrites. The history reads like a real product evolving. Naming is consistent (`YYYYMMDD..._verb_noun`).

---

## 7. Security Review

| Area | Status | Notes |
|---|---|---|
| Authentication | ✅ Solid | bcrypt, rate-limited login, active-user re-check on every request in `authenticate` |
| Authorization / RBAC | ✅ Solid | `requirePermission` (OR semantics), `requireRole`, `SYSTEM_ADMIN` bypass, permissions reloaded per request |
| Input validation | ✅ Solid | Zod on all mutations |
| SQL injection | ✅ None found | Prisma + tagged templates only |
| XSS | ⚠️ Verify | React escapes by default; audit any `dangerouslySetInnerHTML` in print templates / report HTML |
| CSRF | ✅ N/A | Bearer token in header, localhost-only, not cookie-based |
| Secrets | ✅ Good | `JWT_SECRET` enforced ≥32; **but** ensure `.env` is gitignored and the production secret isn't the dev default |
| Session revocation | ❌ Missing | No JWT blacklist; logout is client-only |
| bcrypt cost | ⚠️ Low | 10 rounds; bump to 12 |
| Audit trail | ⚠️ Partial | No failed-login / denied-permission events; no retention |
| Backup security | ❌ Plaintext | Unencrypted `.db`; sensitive HR/payroll data |

**Concrete actions, highest first:**

1. **Encrypt backups** (or offer an opt-in passphrase) — payroll/salary data in a portable plaintext file is the biggest real-world exposure for a contracting company. AES-256 with a user passphrase, decrypt-on-restore. Pure Node `crypto`, no new infra.
2. **Audit failed logins + permission denials** — add `LOGIN_FAILED` and `ACCESS_DENIED` events. Essential for "who tried to get into payroll" on a shared workstation.
3. **Token revocation** — a small `revokedTokens`/`tokenVersion` column checked in `authenticate` gives real logout and "force logout user". Cheap, offline-friendly.
4. **bcrypt 10 → 12**, and verify the production `JWT_SECRET` is generated per-install, not shipped.
5. **Audit-log retention** — scheduled prune (e.g., keep 24 months) to bound DB growth.

---

## 8. Performance Review

**Backend — Good.** Server-side pagination with capped size + heavy indexing means list endpoints scale to tens of thousands of rows. Risk areas are the analytics services (`executive`, `dashboard`, `financial`) that aggregate across many tables — confirm they use indexed `groupBy`/`$queryRaw` aggregation, not in-memory `reduce` over full table reads. The `accounting.service` snippet shows `_sum` aggregation (good) but also `reduce` over fetched journal lines (loads rows into memory — fine at small scale, watch it).

**Database — Good.** WAL mode + checkpoint-before-backup is correct. Set `PRAGMA busy_timeout` and consider `PRAGMA synchronous=NORMAL` (safe with WAL) for faster writes during bulk imports.

**Frontend — Mixed.** The 1,000–1,755 line editor pages with live totals and few memoization guards will feel laggy on slower office PCs once invoices have many line items. Targeted `useMemo` on derived totals and `React.memo` on line-item rows is the fix. Consider virtualizing very long tables (e.g., bank-import previews, `PayrollBankImport.tsx` 1,024 lines).

**Import / report / print engines.** Imports use `$transaction` (atomic — good) but verify large CSV imports are chunked, not one 10k-row transaction that holds a write lock and risks `SQLITE_BUSY`. Chromium PDF export spins a hidden window per export — fine interactively, but batch exports should reuse/queue windows.

**Memory.** Electron main + forked backend + Chromium PDF windows is reasonable. Ensure PDF export windows are reliably `destroy()`-ed (a leak here accumulates over a workday of printing).

---

## 9. Offline-First Compliance

Every recommendation in this report was checked against the offline constraint. Summary:

- ✅ Backup encryption — pure Node `crypto`, local file. **Offline-safe.**
- ✅ Decimal money migration — schema + data migration, local SQLite. **Offline-safe.**
- ✅ Token revocation via DB column — local. **Offline-safe.**
- ✅ Failed-login auditing, retention pruning — local. **Offline-safe.**
- ✅ CSP, sandbox, CHECK constraints, memoization, file splitting — all local/build-time. **Offline-safe.**
- ✅ Suggested features in §13 (recurring invoices, document attachments, dashboard, Excel templates) — all local.

**Rejected as offline-violating (not recommended):** any cloud sync, e-signature SaaS, online payment gateways, telemetry, remote license checks. None appear in this report.

---

## 10. UX Review

**Navigation / layout — Good.** Sidebar + topbar shell, RTL-correct, dark mode. UAT screenshots show a clean, professional, consistent product — better than most in-house ERPs.

**Forms — Functional, dense.** The large editors pack a lot in. Two practical wins: (1) inline field-level validation feedback (Zod errors surfaced per-field, not just a top toast); (2) keyboard-first flows (Enter to add line item, shortcuts for save/print) — power users will feel this daily.

**Tables — Good.** `DataTable` with search/sort/paginate is consistent. Add column visibility toggles and "export current view to Excel" (you already have `ExportExcelButton`).

**Dialogs — Consistent.** The six `ForceDelete*` modals are a UX inconsistency risk as much as a code one — unify so the "this record has dependencies" experience is identical everywhere.

**Printing / import UX — Strong.** Dedicated calibrators (`ChequeCalibrator`, template studio) show unusual care for the print-heavy reality of a contracting business. Keep investing here; it's a differentiator.

**Professional appearance — High.** This does not look like a hobby project.

---

## 11. Code Quality Review

**Naming — Excellent.** English code, Arabic UI/comments, consistent throughout. Domain terms are precise.

**Comments — Good, occasionally excellent.** The CORS block, double-posting constraint, and "never concatenate SQL" comments are exactly the high-value comments that explain *why*. Don't lose these in refactors.

**Duplication — Moderate.** Three sources: (1) six ForceDelete modals; (2) analytics aggregation across executive/dashboard/financial; (3) GL-posting logic across invoices/expenses/payroll. All three are consolidatable without architectural change.

**Complexity — Concentrated in a few files.** The 900–2,450 line files are the complexity debt. Everything else is well-sized.

**Readability / maintainability — High** for the module pattern, **medium** for the hotspot files.

**Potential bugs / risks:**

- Float accumulation in long aggregations (§6).
- Error-contract mismatch could cause a future client to read `error` and get `undefined` (§3).
- `@@unique([referenceType, referenceId])` with nullable fields: SQLite treats `NULL` as distinct, so `MANUAL` entries with `referenceId = null` are *not* deduped — intended per the comment, but means manual double-entries aren't DB-guarded. Confirm that's acceptable.

**Dead code / cleanup:** root contains many `uat-*.png`, `cheak*.png`, `*letterhead*.png`, a `prototype/` dir, and a committed `manarERP-production-*.zip` (867 KB build artifact). Move screenshots to `docs/uat/`, drop the zip from git, and `.gitignore` build artifacts. This is hygiene, not architecture.

---

## 12. Module-by-Module Review

Quality = current state; Priority = how urgently to act; Impact = business value of acting.

| Module | Quality | Key problems | Suggestions | Priority | Impact |
|---|---|---|---|---|---|
| **auth** | High | No failed-login audit; no revocation; bcrypt 10 | Add `LOGIN_FAILED`, token version, bcrypt 12 | High | High |
| **users / roles** | High | — | Add "force logout user" once revocation exists | Low | Med |
| **accounting** | High | Float; app-only balance check | Decimal; DB CHECK on debit/credit | High | High |
| **invoices** | High (logic), Med (UI) | 1,755-line page; Float | Extract hooks/components; Decimal | Med | High |
| **payroll / salaries** | High | Float across many fields; large bank-analytics file | Decimal first here (most accumulation) | High | High |
| **expenses** | High | Float; GL routing duplicated | Posting facade | Med | Med |
| **inventory** | High | 726-line service, 8 transactions; costing in Float | Decimal on `unitCost/totalCost`; verify costing method documented | Med | Med |
| **contracts** | Good | — | Link contract → invoices → receivables view | Low | Med |
| **cheques** | Good | 947-line page + 996-line calibrator | Strong feature; just split files | Low | Med |
| **bankStatementImport / payrollBankImport** | High | Large; lock-contention risk on big files | Chunk imports; busy_timeout | Med | Med |
| **reports / executive / dashboard / financial** | Good | Overlapping aggregation, 3 huge services | Shared aggregations module | Med | Med |
| **import** | Good | Verify chunking + per-row error reporting | Partial-success report to user | Med | Med |
| **backups** | Good (mechanism) | Plaintext output | Encrypt-at-rest | High | High |
| **audit** | Good | No retention; partial coverage | Prune job; more event types | Med | Med |
| **settings** | Good | KV store — validate critical keys on read | Typed settings accessors | Low | Low |
| **verification / forms / integrations / statements** | Good | Smaller, clean | Keep as-is | Low | Low |
| **equipment / maintenance** | Good | 1,027-line Maintenance page | Split UI | Low | Low |

---

## 13. Missing Features (realistic for a small contracting company)

Only features that fit an offline desktop ERP and earn their complexity:

1. **Recurring / templated invoices** — contracting firms bill the same clients monthly (asphalt transport, dailies). One-click "repeat last month" saves real time. *Value: high, daily.*
2. **Document attachments** — attach the scanned signed contract, delivery note, or supplier invoice PDF to the record (stored in `userData`, path in DB). Contracting runs on paper trails. *Value: high.*
3. **Accounts-receivable aging + reminders panel** — "who owes us, how overdue" is the lifeblood metric. You have the data (invoices, payments); surface a 30/60/90 aging view. *Value: very high.*
4. **Contract → invoice → payment profitability view** — per-project margin (contract value vs. invoiced vs. expenses tagged to it). The core question an owner asks. *Value: very high.*
5. **VAT/return-ready tax report** — even at Kuwait's current regime, a clean tax-period export future-proofs you. *Value: medium, rising.*
6. **Configurable approval thresholds** — you have approval history; add "invoices > X KWD require manager approval". *Value: medium.*
7. **Per-employee payroll history / end-of-service (indemnity) accrual** — Kuwait labor law indemnity is a real liability contracting firms must track. *Value: high, region-specific.*
8. **Saved report presets + scheduled local "month-end pack"** — generate the standard PDF bundle in one action. *Value: medium.*

Deliberately **excluded** as over-engineering for this context: multi-currency, multi-company consolidation, workflow engine, plugin marketplace, real-time collaboration.

---

## 14. Technical Debt (by severity)

**High**

1. **Float monetary storage** (74 fields). Root financial-accuracy risk. Effort: 2–4 days (schema + data migration + regression). Risk of migration: medium — test heavily.
2. **Unencrypted backups** of HR/payroll data. Effort: 1–2 days.
3. **API error contract drift** (`message` vs `error`). Effort: 2 hours. Trivial fix, real correctness.

**Medium**

4. No JWT revocation / partial auth auditing. Effort: 1–2 days.
5. Monolithic files (`i18n.ts`, `Invoices.tsx`, big services). Effort: incremental, 0.5 day each.
6. Duplicated ForceDelete modals + GL-posting + analytics aggregation. Effort: 1–3 days total.
7. No DB CHECK constraints on financial tables. Effort: 1 day.
8. Audit-log unbounded growth. Effort: 0.5 day.

**Low**

9. Repo hygiene: committed build zip, loose PNGs, `prototype/`. Effort: 1 hour.
10. Sparse frontend memoization. Effort: targeted, 0.5 day on hot pages.
11. Electron main window missing `sandbox: true` + no CSP. Effort: 0.5 day (test print/PDF after).

---

## 15. UI Polish Opportunities (polish only — no redesign)

1. Per-field inline validation errors (not just top-of-form toast).
2. Keyboard shortcuts: Enter = add line item, Ctrl+S = save, Ctrl+P = print.
3. Sticky table headers + sticky totals row on long invoice/payroll editors.
4. Loading skeletons on dashboard cards instead of layout shift.
5. Column visibility toggle + "export current view" on `DataTable`.
6. Consistent empty-states ("no invoices yet — create one") across pages.
7. Number formatting helper that always renders KWD to 3 dp with thousands separators, applied uniformly.
8. Toast for long operations (backup, import, PDF) with progress, not just success/fail.

---

## 16. Future Roadmap

Each item: Business value · Technical complexity · Effort · Risk · Priority.

**Immediate (this sprint)**

- Fix error-contract drift. *Value med · Complexity low · 2h · Risk low · P1.*
- Encrypt backups. *Value high · Complexity low-med · 1–2d · Risk low · P1.*
- bcrypt 12 + audit failed logins. *Value high · Complexity low · 1d · Risk low · P1.*
- Repo hygiene (drop zip, move assets). *Value low · Complexity low · 1h · Risk none · P2.*

**Next release**

- **Migrate money to `Decimal`.** *Value very high · Complexity med-high · 2–4d · Risk med · P1.*
- AR aging panel. *Value very high · Complexity med · 2–3d · Risk low · P1.*
- JWT revocation + force-logout. *Value med · Complexity low-med · 1–2d · Risk low · P2.*
- DB CHECK constraints on financial tables. *Value med · Complexity med · 1d · Risk med · P2.*

**Medium term**

- Per-project profitability view. *Value very high · Complexity med · 3d · Risk low · P1.*
- Recurring invoices + document attachments. *Value high · Complexity med · 3–4d · Risk low · P2.*
- Split monolithic files; posting facade; shared analytics. *Value med (maintainability) · Complexity med · ongoing · Risk low · P2.*
- End-of-service indemnity accrual. *Value high · Complexity med · 2–3d · Risk low · P2.*

**Long term**

- Audit retention + security event dashboard. *Value med · Complexity low-med · 1–2d · Risk low · P3.*
- Frontend performance pass (memoization + virtualization). *Value med · Complexity med · 2d · Risk low · P3.*
- CSP + sandbox hardening, accessibility audit. *Value med · Complexity low-med · 1–2d · Risk low · P3.*

---

## TOP 25 Recommendations — ordered by ROI (highest first)

| # | Recommendation | Why | Expected benefit | Complexity | Risk | Priority | Est. time |
|---|---|---|---|---|---|---|---|
| 1 | Fix API error-contract drift (`message` vs `error`) | Documented contract, rate limiter, and handler disagree | Prevents silent client bugs; one true shape | Low | Low | P1 | 2h |
| 2 | Encrypt backups at rest (AES-256 passphrase) | Plaintext payroll/HR `.db` is the biggest real exposure | Confidentiality of sensitive data | Low-Med | Low | P1 | 1–2d |
| 3 | Audit failed logins + permission denials | Security blind spot on shared workstations | Real incident traceability | Low | Low | P1 | 0.5–1d |
| 4 | bcrypt 10→12 + verify per-install JWT secret | Cheap auth hardening | Stronger credential security | Low | Low | P1 | 2h |
| 5 | Repo hygiene: remove committed build zip, gitignore artifacts, move PNGs to docs | Cleaner history, smaller clones | Maintainability | Low | None | P2 | 1h |
| 6 | Migrate monetary columns `Float`→`Decimal` | IEEE-754 in an accounting system; tolerances are band-aids | Exact money math, reconcilable books | Med-High | Med | P1 | 2–4d |
| 7 | AR aging panel (30/60/90) | Cash flow is survival for contractors | Faster collections, owner visibility | Med | Low | P1 | 2–3d |
| 8 | Per-project (contract) profitability view | The core question owners ask | Better bidding & cost control | Med | Low | P1 | 3d |
| 9 | JWT revocation (tokenVersion column) | Logout currently doesn't invalidate token | Real logout + force-logout | Low-Med | Low | P2 | 1–2d |
| 10 | Unify six `ForceDelete*` modals into one config-driven component | Duplication + UX inconsistency | Less code, consistent UX | Low-Med | Low | P2 | 1d |
| 11 | DB CHECK constraints (debit/credit balance, amount≥0) | Integrity enforced only in app today | Defense against bad writes | Med | Med | P2 | 1d |
| 12 | Audit-log retention/prune job | Unbounded growth in a file DB | Bounded DB size, performance | Low | Low | P2 | 0.5d |
| 13 | Recurring/templated invoices | Same monthly billing patterns | Daily time savings | Med | Low | P2 | 3–4d |
| 14 | Document attachments on records | Contracting = paper trail | Fewer lost documents | Med | Low | P2 | 3d |
| 15 | Split `Invoices.tsx`/`Inventory.tsx`/`Maintenance.tsx` into hooks+components | 1k–1.75k line pages | Maintainability, fewer regressions | Med | Low | P2 | 0.5d each |
| 16 | Centralize GL posting into a `postingService` facade | Logic spread across 3 modules | Single source of truth for accounting | Med | Med | P2 | 2d |
| 17 | Shared analytics aggregation module | executive/dashboard/financial overlap | Less duplication, faster | Med | Low | P2 | 2d |
| 18 | Targeted memoization on invoice/payroll editors | Few memo guards on huge pages | Snappier UI on office PCs | Med | Low | P3 | 0.5d |
| 19 | End-of-service indemnity accrual tracking | Kuwait labor-law liability | Accurate liabilities | Med | Low | P2 | 2–3d |
| 20 | Chunk large CSV imports + set `PRAGMA busy_timeout` | Lock contention on big files | Reliable imports under load | Med | Low | P3 | 1d |
| 21 | Electron `sandbox: true` on main window + CSP | Hardening (flag already used for PDF) | Smaller attack surface | Low-Med | Low | P3 | 0.5d |
| 22 | Per-field inline validation + keyboard shortcuts | Power-user friction | Faster data entry | Med | Low | P3 | 1–2d |
| 23 | Unified KWD number-formatting helper (3dp) | Consistent money display | Polish + correctness | Low | Low | P3 | 0.5d |
| 24 | Virtualize long preview tables (bank/payroll import) | 1k-row previews | Smooth scrolling | Med | Low | P3 | 1d |
| 25 | Accessibility pass (focus, aria, keyboard nav) | ERP is keyboard-heavy | Productivity + inclusivity | Med | Low | P3 | 1–2d |

---

### Closing assessment

manarERP is an unusually disciplined in-house ERP: the module pattern, indexing, transactional integrity, double-posting guard, and test coverage put it ahead of most comparable systems. It is production-appropriate for its target today.

The work that matters is not rebuilding — it's tightening. The `Float` money foundation, plaintext backups, and the small auth/observability gaps are the items that separate "works for us now" from "trustworthy financial system of record." Everything recommended here fits inside the existing Electron + React + Express + Prisma + SQLite architecture and preserves the offline-first philosophy without exception.
