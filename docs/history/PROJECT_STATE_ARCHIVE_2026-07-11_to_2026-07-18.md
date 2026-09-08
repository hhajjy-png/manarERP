# PROJECT_STATE.md — Release-Log Archive

**Archived from:** `PROJECT_STATE.md` (repo root), release-log section
**Rotated on:** 2026-09-08 — *PROJECT_STATE Documentation Rotation & Maintenance v1*
**Date range covered:** `2026-07-18` → `2026-07-11`  (newest first, exactly as it appeared in the live file)
**Release entries in this file:** 39
**First entry in file:** Previous Release — Enterprise Data Grid Foundation v1
**Last entry in file:** Latest Release — Historical Salary Transfer Register Integration v1

> **Verbatim.** Every section below was MOVED, not rewritten: heading, tables, code blocks and prose
> are byte-identical to the live file before rotation. Nothing was summarised, reformatted or dropped.
> Two entries in this archive still carry a `## Latest Release —` heading; that is how they existed in
> `PROJECT_STATE.md` (they were never demoted to `## Previous Release` by the release that followed
> them). They were preserved exactly rather than silently corrected — see `ROTATION_MANIFEST_V1.md`.

See `docs/history/README.md` for the full archive index.

---
## Previous Release — Enterprise Data Grid Foundation v1

| Field | Value |
|-------|-------|
| **Package** | Enterprise Data Grid Foundation v1 |
| **Goal** | Replace the ERP's fragmented, inconsistent table sorting (two divergent ad-hoc implementations — `BankSalaryAnalytics`'s bespoke `SortTh`, `AgingTable`'s private client sort — and no sorting at all on most tables) with one unified, reusable server-side sorting foundation, then apply it across every applicable user-visible table in the ERP. Delivered across three phases: Phase 1 architecture audit, Phase 2 architecture blueprint, Phase 3 initial implementation (ResourcePage — 7 modules), then a coverage-completion pass extending the same foundation to every remaining table family (Finance, Payroll, HR, Equipment, Inventory, Accounting) with no parallel implementation introduced anywhere. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-18 |
| **Feature branch** | `feature/enterprise-data-grid-foundation-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `6ad480a` |
| **Feature commit** | `c357cef` |
| **Production merge commit** | `4593db0` |
| **Stable tag** | `stable-enterprise-data-grid-foundation-v1` → merge `4593db0` (annotated) |
| **Release scope** | **59 files** (+2359/−296). Backend: new shared `buildOrderBy` whitelist-validated sort builder (`backend/src/core/utils/sort.ts`) + `sortRowsInMemory` (for read models built outside Prisma — the payroll unified grid, GL report), wired into 18 module list endpoints (customers, suppliers, employees, equipment, expenses, contracts, users, invoices, cheques, salaries, attendance, inventory ×4, accounting ×3, prices, audit, payroll unified grid, GL report) — every module's historical default ordering preserved, existing security boundaries unchanged. Frontend: new shared `useTableSort` hook (three-state cycle, per-module persistence at `rp:<module>:sort`, independent of search/filter/pagination/drawer state), `SortableHeader` component (unified icon language, `aria-sort`, keyboard support), `sortRowsClient` (for tables fully loaded client-side), and a `Column.rowNumber` sequential-`#` standard (applied to Equipment, replacing an unnecessary business identifier) — integrated into `ResourcePage` (both skins) plus 16 dedicated pages/components; the two pre-existing ad-hoc sorters (`BankSalaryAnalytics`, `AgingTable`) were unified onto the same foundation, not left as a third pattern. Documented, unchanged by design: fixed-order business documents (invoice/journal lines), running-balance statements, ranked/"latest N" dashboard widgets, and other cases where reordering would violate business meaning — see the Phase-2/coverage-completion conversation record for the full exception list. **No Business Logic / API-breaking / financial-calculation / printing / report-generation / DB schema changes** (API surface grew only by two optional query params, `sortBy`/`sortDir`, on existing list endpoints). |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · backend build ✅ · frontend build ✅ · backend vitest — full suite **112 files / 1724 tests pass** (41 new: whitelist validation, nulls-last, relation sort, in-memory read-model sort) · frontend vitest — full suite **1772/1773 tests pass** (22 new: three-state cycle, per-module persistence isolation, indicators, accessibility, backward compatibility, row numbering; the 1 failure is the pre-existing, unrelated `routerFutureFlags.test.tsx` count mismatch — confirmed present independent of this release) · manual visual review: **APPROVED** by the project owner. |
| **Note for future work** | This release is the official baseline for all table/data-grid functionality. Any future enhancement to sorting, filtering, column management, or personalization must extend this Foundation (`useTableSort`, `SortableHeader`, `buildOrderBy`, `sortRowsInMemory`, `sortRowsClient`) rather than introduce a parallel implementation. |

## Previous Release — HR Print Templates Visual Consistency & Print Preview Initial View Pack v1

| Field | Value |
|-------|-------|
| **Package** | HR Print Templates Visual Consistency & Print Preview Initial View Pack v1 (**visual/UX-only**) |
| **Goal** | Extend the Salary Certificate's already-approved signature-section visual polish (no printed date under "اعتماد المدير المباشر", certificate/form number hidden above the title with the reserved space preserved, company stamp on the signature row centered and shifted ~2cm toward the QR/barcode side) plus its Arabic Tafqeet salary-in-words row onto a shared, opt-in `FormLayout`/`ApprovalSection` mechanism, then apply the shared parts to 6 more HR document types; and set sensible initial zoom defaults ("Fit to Page" / 75%) for the two print preview surfaces. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-18 |
| **Feature branch** | `feature/hr-print-templates-visual-consistency-print-preview-initial-view-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `bf9cb04` |
| **Checkpoint tag** | `pre-hr-print-templates-visual-consistency-print-preview-initial-view-v1` |
| **Feature commit** | `7b4fc77` |
| **Production merge commit** | `4617fb4` |
| **Stable tag** | `stable-hr-print-templates-visual-consistency-print-preview-initial-view-v1` → merge `4617fb4` (annotated) |
| **Release scope** | **15 files** (+168/−48) — see "What changed" below. No page dimensions / margins / paper size / pagination / fonts / print-engine / business-logic changes; no print template outside the ones listed was touched. |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend vitest — full suite **1747 pass** (1 pre-existing, unrelated `routerFutureFlags.test.tsx` failure confirmed present on `production` **before** this branch existed — a stale lazy-import count check in `App.tsx` — excluded from this release) · manual visual review: **APPROVED** by the project owner. |

**What changed**

- **Salary Certificate** (`SalaryCertificateTemplate.tsx`, `SalaryCertificate.tsx`) — removed the date under "اعتماد المدير المباشر"; replaced the "العملة"/"دينار كويتي (KWD)" row with "الراتب كتابة" + `tafqeetKWD(baseSalary)` (existing canonical helper from `frontend/src/lib/tafqeet.ts` — no new Tafqeet engine written); hid the certificate number above the title (the reserved line/margin stays in place so the title never shifts); stamp moved onto the signature row, centered within it, then shifted ~2cm toward the QR/barcode side (direction-aware so it's correct in both the Arabic and English renders). **English Tafqeet intentionally not implemented** — deferred as a new roadmap item, **English Tafqeet Foundation v1** (Future Roadmap → Medium Priority below).
- **Shared infrastructure** (`ApprovalSection.tsx`, `FormLayout.tsx`) — three new opt-in props: `hideDate`/`stampInline` on `ApprovalSection`, `approvalHideDate`/`approvalStampInline`/`hideFormNumber` on `FormLayout` (threaded through). All default `false`/off, so every existing caller that doesn't set them renders byte-identical to before — verified by grepping every prop consumer before merge. A pre-merge Claude Code Review pass caught and fixed one regression before release: naively hiding the form number (`{!hideFormNumber && formNumber}`) collapsed the wrapper `<div>` to 0 height, shifting the title up ~13px on every opted-in form — fixed by keeping the text node always present and toggling `visibility: hidden` instead, so the reserved space is guaranteed identical either way.
- **6 HR templates** — To Whom It May Concern, Leave Request, Return to Work Notice, Salary Advance Request, Employee Warning, Employee Performance Evaluation — each now sets the three opt-in `FormLayout` props (a 5-line additive diff per page; zero new component code, zero duplicated implementation). No Tafqeet changes in these six.
- **Print Preview initial view** — Standard preview (`PrintWorkspace.tsx`) now opens in "Fit to Page" mode (`fitMode='page'`) instead of a fixed 75% scale. Accurate/True-WYSIWYG preview (`WysiwygPreviewPocDialog.tsx`) now opens at a new `INITIAL_VIEWER_ZOOM = 75`% instead of 100%; `DEFAULT_VIEWER_ZOOM = 100` (the "Reset to 100%" button, `stepZoom`'s fit-mode base) is deliberately untouched. Existing zoom controls (+/−, Ctrl/⌘+wheel, Fit width/page, Reset) behave exactly as before in both surfaces; only the state at first-open changed. Both affected test suites (`printWorkspace.test.tsx`, `wysiwygPreviewPoc.test.tsx`) updated to match the new intentional defaults.

> **Rotation note:** this release brings the dated release-log entries below to 16, past this file's own ~15-entry archive-rotation trigger (see "Rotation & Archive Policy" above). Not acted on in this release's docs commit — flagged here as a recommended follow-up for the next session (archive the oldest `## Previous Release` entries into `docs/history/`, per that policy's own process).

---

## Previous Release — Bank Account Explorer Active Tabs Visual Polish v2

| Field | Value |
|-------|-------|
| **Package** | Bank Account Explorer Active Tabs Visual Polish v2 (**presentation-only, Dark Mode only, one page**) |
| **Goal** | Fix a Dark Mode visual-consistency defect found by a UI audit: Bank Account Explorer's active tab (primary nav + drawer info-hub sub-tabs) relied only on a 2px underline + text-color change, with no background fill, blending into the surrounding container in Dark Mode. Brought up to the Inventory & Purchasing active-tab visual standard — refined per explicit design direction from a neutral filled background (v1) to a solid ExplorerKit indigo/purple fill (v2). |
| **Release status** | RELEASED |
| **Release date** | 2026-07-18 |
| **Feature branch** | `feature/bank-account-explorer-active-tabs-visual-polish-v2` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `75772ed` |
| **Checkpoint tag** | none — branch created directly from `production` HEAD |
| **Feature commit** | `8da4564` |
| **Production merge commit** | `90d3640` |
| **Stable tag** | `stable-bank-account-explorer-active-tabs-visual-polish-v2` → merge `90d3640` (annotated) |
| **Release scope** | **1 file** (+27/−1): `frontend/src/pages/BankAccountExplorer.css` only — no markup, no React changes, no shared `Tabs`/ExplorerKit component changes, Light Mode fully unchanged, no other page touched (verified via full-repo `git status`/diff audit before merge). |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend `vite build` ✅ (clean production bundle) · manual visual review: **APPROVED** · independent Gemini review: **APPROVED**. |

> Findings from the preceding UI-only audit (no code changed at that stage): only 4 tab-bar instances across the
> entire app deviate from the shared `Tabs`/`.xpl-tab` component's consistent, dark-mode-safe styling — Bank
> Account Explorer (2 instances, fixed here), Financial Center, Dashboard, and Data Import (different pattern).
> This release fixes Bank Account Explorer only, per explicit scope; the other three remain open findings for a
> future, separately-approved pack — not fixed here.

**What changed**

- **Primary navigation tabs** (`.bae-tab-bar--nav .bae-tab-btn.active`, Dark Mode only) — solid
  `background: var(--xpl-primary, #6366f1)` fill + `color: #fff` text/icon + soft indigo glow shadow, replacing
  the underline-only treatment. Border-bottom no longer carries the active signal (neutralized to transparent;
  the reserved 2px space is kept so tab height never shifts). `--xpl-primary` is scoped to `.xpl-scope`
  (`explorer-kit.css`) and this page doesn't carry that wrapper, so the literal hex is supplied as the `var()`
  fallback — the same defensive pattern already used one rule above by this file's own `--primary-faint`
  fallback.
- **Transaction-drawer info-hub sub-tabs** (`.bae-drawer-tab.active`, Dark Mode only) — identical fill/text/shadow
  treatment for consistency across both tab bars on the same page.
- Existing `color`/`border-color` transitions on both tab classes extended to also animate `background`/
  `box-shadow` smoothly (inert in Light Mode — nothing there changes those properties, so this addition has zero
  Light Mode visual effect).
- Light Mode, layout, padding, sizing, icons, scrolling, permissions, and the shared `Tabs` component are all
  byte-for-byte unchanged.

---

## Previous Release — Production Readiness & Accounting Integrity Consolidation Pack v2

| Field | Value |
|-------|-------|
| **Package** | Production Readiness & Accounting Integrity Consolidation Pack v2 (**consolidation — production packaging, DB migrations, backend resilience, accounting single-source-of-truth**) |
| **Goal** | Consolidate seven independently-implemented, verified, and reviewed fixes into one release: make the packaged production app actually start (build/dependency packaging), make it survive real-world crash/lock/port conditions diagnosably, apply schema upgrades automatically for existing installs, and finish the accounting single-source-of-truth work by giving every expense-reporting surface (Dashboard, Executive Decision Center, Accounting Dashboard, Financial Center, P&L Report) an identical number for any given period — closing the "two salary channels" risk flagged as unresolved in the prior release. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-17 |
| **Feature branch** | `feature/production-readiness-and-accounting-integrity-pack-v2` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `3d9d426` |
| **Checkpoint tag** | none — branch created directly from `production` HEAD |
| **Feature commit** | `ebd2cf0` |
| **Production merge commit** | `db4f9ab` |
| **Stable tag** | `stable-production-readiness-accounting-integrity-pack-v2` → merge `db4f9ab` (annotated) |
| **Release scope** | **21 files** (+833/−759): 16 modified, 3 added (`backend/src/core/utils/migrate.ts`, `backend/scripts/remove-payroll-gl-journals-v1.ts`, `scripts/prepare-backend-deps.js`), 2 deleted (`payrollBankImport/salaryPayment.accounting.ts` + its test), 1 test file deleted (`payroll/__tests__/payroll.accounting.test.ts`). Backend + build/packaging pipeline + one frontend page (`Accounting.tsx`, period-control wiring only) — no schema change, no journal-posting/expense-posting/payroll-calculation business-logic change, no chart-of-accounts change. |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · backend vitest **1661/1661 pass** ✅ (102 files) · frontend vitest **1746 pass** (1 pre-existing unrelated failure, `routerFutureFlags.test.tsx`, predates this branch) · production-packaged app launch verified from a directory outside the repo (real `MODULE_NOT_FOUND` reproduced pre-fix, resolved post-fix) · migration runner verified against a genuine 39→40-migration upgrade fixture with pre-existing data, confirming both the pending-migration and no-op paths · crash-handler verification via real injected `uncaughtException`/`unhandledRejection`/`EADDRINUSE` against the compiled server · 5-screen (now 6-screen incl. Expenses page) expense-total identity re-verified against real data post-cleanup: **176,527.000 KWD on all six** · historical payroll-GL cleanup executed against the dev database: 231 `SALARY_PAYMENT` journals / 462 lines removed, idempotency-verified (second run deletes 0), trial balance still balances (624,578.700 = 624,578.700), all 231 `salary_payments` + 53 `payroll` operational rows preserved. |

> **Consolidation of prior work, no new implementation performed during the release itself.** Each of the
> seven packs below was independently implemented and verified in its own pass earlier in the same working
> session; this release collects them onto one branch, isolated from ~187 unrelated pre-existing uncommitted
> changes already sitting in the working tree (untouched, left exactly as found).

**What changed**

- **Production packaging, fixed.** The packaged app's backend shipped with an almost-empty `node_modules`
  (npm workspaces hoists shared deps to the repo root, which `electron-builder` never packages) — every
  production launch crashed with `MODULE_NOT_FOUND` before the Express server could even import `express`.
  New `scripts/prepare-backend-deps.js` runs an isolated `npm install --omit=dev` in an OS-temp staging
  directory (immune to workspace hoisting) and overlays the already-generated Prisma client, wired into
  `npm run dist` before `electron-builder`. Also fixed `backend/dist`'s TS path-alias (`@config/*` etc.)
  resolution via `tsc-alias`, the first-layer crash this masked.
- **Automatic migrations on production startup.** New `core/utils/migrate.ts` runs `prisma migrate deploy`
  before the server starts listening, production-only (gated on `isProd`, zero effect on `npm run dev`).
  Previously the packaged app relied solely on a schema-frozen bundled template DB — any future release with
  new migrations would have left every existing installation permanently on stale schema.
- **Backend crash resilience.** `server.ts` gained process-level `uncaughtException`/`unhandledRejection`
  handlers, a `server.on('error')` handler distinguishing `EADDRINUSE` from other listen failures, and
  bounded-timeout cleanup on every fatal path — replacing silent, undiagnosable crashes (stdout/stderr in a
  packaged app reach no console) with a clean shutdown logged to `error.log`. `config/database.ts` gained
  `PRAGMA busy_timeout` so a transient SQLite lock retries instead of failing immediately.
- **Accounting single source of truth, completed.** Fixed a date-boundary bug in
  `accounting.service.financialSummary()` / `transactions.service.profitAndLoss()` (bare `new Date(to)`
  parsed as UTC midnight, silently dropping the period's last day) by routing both through the same
  `resolvePeriod()` local-midnight + `endOfDay()` logic already used elsewhere. Wired the Accounting
  Dashboard to the active financial period (previously always all-time, ignoring any selected range).
  Replaced `executive.service.decisionCenter()`'s raw `Expense`-table aggregation with the canonical
  `glProfitAndLoss()` GL source — this was the one remaining non-GL expense surface, feeding both the
  Executive Decision Center **and** the main Dashboard's "إجمالي المصروفات" KPI (same endpoint).
- **Payroll automatic GL posting removed — permanent business decision.** A forensic audit (evidence-based,
  no assumptions) traced the entire Dashboard-vs-P&L expense discrepancy to exactly one cause: 231 payroll
  bank-transfer journals (`referenceType='SALARY_PAYMENT'`, 77,450 KWD) auto-posted by
  `salaryPayment.accounting.ts`, on top of the Expenses module's own 176,527 KWD — both real, both correct,
  measuring different things. Business decision: **Payroll is operational-only; salary expense is recorded
  exclusively through the Expenses module.** `postSalaryPaymentToGL`/`reverseSalaryPaymentGL`
  (`payrollBankImport/salaryPayment.accounting.ts`, deleted entirely) and `postPayrollToGL`/`reversePayrollGL`
  (`payroll/payroll.accounting.ts`, stripped to just the still-needed `resolvePayrollPostingDate`) are gone
  from every call site; the payroll-backfill script's salary-posting step was removed so it can never
  silently undo the cleanup. New idempotent `scripts/remove-payroll-gl-journals-v1.ts` (dry-run by default)
  — **already executed against the dev database**: 231 journals / 462 lines removed, re-run confirmed 0
  remaining, all payroll operational data (salary_payments, payroll, payroll_lines) untouched. **This directly
  closes the "two salary channels... could double-count" item flagged as unresolved in the prior release.**
  Payroll UI, salary calculations, bank export, payslips, and approval workflow are unchanged — verified via
  the full payroll test suite (195 tests, unaffected).
- **Release policy.** `CLAUDE.md`'s blanket "never push/merge/modify production automatically" was replaced
  with a conditional **Production Release Policy**: Claude may execute the full release workflow only when
  (1) the Product Owner has completed manual visual review and (2) the user explicitly requests the official
  release — both confirmed, in a separate turn from the policy edit itself, before this release proceeded.

**Known, disclosed, not-fixed-in-this-pack:**
- Two leftover throwaway verification scripts (`backend/__verify_consolidation.ts`,
  `backend/__verify_payroll_removal.ts`) remain in the working tree, neutralized to inert stubs — file
  deletion was blocked by this session's destructive-operation guard (`rm`/`Remove-Item`/`git clean` all
  denied); flagged for manual deletion, they are untracked and affect nothing.
- The historical payroll-GL cleanup script has **not yet been run against the production database** — only
  against dev. Running `npx tsx scripts/remove-payroll-gl-journals-v1.ts --apply` against production data is
  a required follow-up before production's own P&L/Expenses figures reconcile the same way dev's now does.
- A pre-existing, unrelated pending change to root `package.json` (a `cross-env` devDependency removal) was
  reverted in the working tree to cleanly isolate this release's own one-line addition — if that removal was
  intentional, it needs to be redone separately; it was never committed either before or after.

---

## Previous Release — Accounting Integrity & Financial Accuracy Pack v1

| Field | Value |
|-------|-------|
| **Package** | Accounting Integrity & Financial Accuracy Pack v1 (**Major System — accounting engine correctness, backend only**) |
| **Goal** | Resolve the accounting-integrity findings from the prior read-only Accounting Production Readiness Audit: eliminate the dual-ledger divergence, make posted journals immutable, book driver salary disbursements to the GL, and prove zero discrepancy across every financial surface via cross-validation against real company data. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-17 |
| **Feature branch** | `feature/accounting-integrity-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `5d95148` |
| **Checkpoint tag** | `checkpoint/pre-accounting-integrity-v1` |
| **Feature commit** | `94ef854` |
| **Production merge commit** | `4503d8e` |
| **Stable tag** | `stable-accounting-integrity-financial-accuracy-pack-v1` → merge `4503d8e` (annotated) |
| **Release scope** | **26 files** (+1166/−553): 20 modified, 6 added (`gl.reporting.ts`, `salaryPayment.accounting.ts` + its test, `backfill-accounting-integrity-v1.ts`, `cross-validate-accounting-v1.ts`, migration `20260717000000_immutable_journal_revision`), 0 deleted. Backend only — no frontend/UI change. One data-safe schema migration. |
| **Validation** | backend `tsc --noEmit` ✅ · `build:back` ✅ · backend vitest **1686/1686 pass** ✅ (104 files) · `prisma migrate status`: up to date · idempotent backfill script (2nd run posts 0) · **Financial Cross-Validation: 24/24 checks pass, 0 discrepancies** across GL engine / Trial Balance / financialSummary / Dashboard (overview + executive) / AR aging / customer statements, run against real company data (unified accrual net profit **55,434.600 KWD**) · Gemini Release Gate: **APPROVED** (explicit project-owner in-conversation statement, per the documented Gemini Approval Override policy) · Manual Visual Review: **APPROVED**. |

> **Backend accounting-engine correctness pack.** No UI redesign, no new business workflow, no scope beyond
> the audit's confirmed findings (Balance Sheet / Cash Flow / retained earnings / fiscal-year close / VAT /
> depreciation / multi-company / cost centers were explicitly out of scope and untouched).

**What changed**

- **Single accounting source of truth.** New `shared/services/gl.reporting.ts` (`glProfitAndLoss` /
  `glMonthlyProfitAndLoss` / `glAccountFlow`) is now the one accounting engine. Dashboard
  (`overview`/`monthlyTrend`/`executive`), Reports P&L, and `accounting.service.financialSummary` all read
  from it (accrual basis: revenue recognized at invoice issue, expense at approval). The legacy single-entry
  `Transaction` table's auto-writes were retired from invoices, expenses, and payroll — it is frozen
  historical data now, read by nothing.
- **Immutable posted ledger.** `journal_entries` gained a `revision` column
  (`@@unique[referenceType, referenceId, revision]`, migration `20260717000000_immutable_journal_revision`,
  data-safe — all 115 pre-existing entries backfilled to revision 1). New
  `supersedeBalancedJournal`/`currentRevision` primitives in `gl.service.ts` reverse the live revision and
  post a new one instead of `deleteMany`. Every invoice/expense edit, cancel, and force-delete path that
  previously hard-deleted posted `JournalEntry` rows now reverses them instead — original + reversal +
  correction all remain in the ledger, audit trail intact. Added `PAYMENT_REVERSAL` for sales-payment
  entries (parity with the existing `PURCHASE_PAYMENT_REVERSAL`).
- **Driver salary posting.** New `payrollBankImport/salaryPayment.accounting.ts` posts each bank-import
  salary disbursement (`Dr Payroll Expense 5100 / Cr Bank 1010`) to the GL — previously the company's
  largest real cost (231 processed driver payments, 77,450 KWD) appeared in **no** financial report.
- **Backfill.** `scripts/backfill-accounting-integrity-v1.ts` (idempotent, reuses the real production
  posting functions) posted the 2 sales invoices that pre-dated GL wiring and all 231 historical salary
  payments.
- **Cross-validation.** `scripts/cross-validate-accounting-v1.ts` — 24 independent-path checks (GL engine
  vs. Trial Balance groupBy vs. `financialSummary` vs. Dashboard vs. AR aging vs. Σ customer statements,
  across multiple periods) — **24/24 pass, 0 discrepancies**, run against the real company dataset.
- **Tests.** 8 existing test files updated from asserting the retired dual-ledger/delete-based invariants
  to the corrected single-source/immutable ones; added `salaryPayment.accounting.test.ts`.

**Confirmed false positives from the audit (no fix applied, verified against real data):** inventory/COGS
double-counting — the inventory module has zero usage (`goods_receipts`/`material_issues`/`materials` all 0
rows); purchase-invoice/supplier accounting — 0 suppliers, all 36 invoices are SALES; Trial Balance
correctness — already sound, used as the independent cross-validation reference.

**Out of scope (explicit, unchanged):** Balance Sheet, Cash Flow Statement, retained earnings, fiscal-year
closing, VAT/corporate tax, multi-company, cost centers, budgeting, asset depreciation.

**Known, disclosed, not-fixed-in-this-pack:**
- Two salary channels exist (the bank-import `salary_payments` path — now booked — and the separate
  DRAFT-only `payroll` module, which posts on `markPaid`); if both are ever used for the same month, salary
  could double-count — flagged for a future pack.
- Cash/bank accounts can show negative balances because no opening-balance mechanism exists yet (out of
  scope; a future Balance Sheet would need it).
- The legacy `transactions` module's code remains (dead, unreachable from the UI, no new writes) — safe to
  remove in a future cleanup pack.

---

## Previous Release — Project Cleanup & Architecture Remediation Pack v1

| Field | Value |
|-------|-------|
| **Package** | Project Cleanup & Architecture Remediation Pack v1 (**architecture consolidation, no feature/UI change**) |
| **Goal** | Implement all 11 approved HIGH-confidence findings from the prior Zero-Risk Cleanup Audit series (file/dead-code audit → repo hygiene audit → final architecture gap analysis) in the safest possible order, preserving 100% existing business behaviour. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-17 |
| **Feature branch** | `feature/cleanup-architecture-remediation-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `460e08c` |
| **Checkpoint tag** | `pre-cleanup-architecture-remediation-pack-v1` |
| **Feature commits** | 6, one per phase: `eb2eb95` (Phase 1-2: GL retry + reports + Tafqeet), `2cd8b3f` (Phase 3: focus-trap/pagination/toast), `54ec36e` (Phase 4: isSystemAdmin), `1c2b235` (Phase 5.9: attachments controller), `d817f8e` (Phase 5.10: manual-journal-entry docs), `f1d416b` (Phase 6: PROJECT_STATE rotation policy) |
| **Production merge commit** | `ac14a59` |
| **Stable tag** | `stable-cleanup-architecture-remediation-pack-v1` → merge `ac14a59` (annotated) |
| **Release scope** | **36 files** (+901/−543): 30 modified, 6 added (`attachments.controller.ts` + its test, `gl.entryNumberRetry.test.ts`, `frontend/src/lib/money.ts` + its test, `docs/history/README.md`), 0 deleted. Backend + frontend; no schema/migration. |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · `build:back`/`build:front`/`electron:build` ✅ · backend vitest **1682/1682 pass** ✅ (103 files) · frontend vitest **1746/1747 pass** (106/107 files — the 1 failure, `routerFutureFlags.test.tsx`'s stale lazy-route count, is a **pre-existing issue from before this pack**, already documented in the prior audit, not caused by this work) · electron vitest **71/71 pass** ✅ (2 files) · independent code review: **APPROVE**, 0 CRITICAL/HIGH/MEDIUM findings (1 LOW informational note, no fix required) · Gemini Release Gate: **APPROVED** (explicit project-owner in-conversation statement, per the documented Gemini Approval Override policy) · Manual Visual Review: **completed, no issues found**. |

> **Architecture consolidation only.** No feature changes, no UI redesign, no business-logic changes beyond
> the approved architectural fixes. Every phase preserved exact prior output/behavior except where a fix's
> entire point was to correct wrong output to correct output (report date/money formatting, tafqeet rounding).

**What changed, by phase**

- **Phase 1 — Safety & Correctness:** the GL `entryNumber` P2002 collision retry-on-conflict loop moved from
  two duplicated call sites in `invoices.service.ts` into `gl.service.ts`'s `createBalancedJournal()` itself
  (verified safe on SQLite via a live probe against the dev DB before implementing: a failed unique-constraint
  insert does not poison the surrounding transaction, unlike Postgres) — `payroll`/`expenses` postings, which
  previously had **zero** protection against this race, now inherit it automatically. `reports.service.ts`'s
  locally-reimplemented, uncorrected `round3()` and `toLocaleDateString('ar')` date formatter (Eastern
  Arabic-Indic digits) replaced with the canonical `roundMoney`/`formatDisplayDate`, preserving the existing
  null-handling contract.
- **Phase 2 — Financial Consistency:** all three Tafqeet (Arabic amount-in-words) implementations
  (`backend/core/utils/tafqeet.ts`, `frontend/lib/tafqeet.ts`, `frontend/print-templates/utils/tafqeet.ts`) now
  round through the canonical EPSILON-corrected `roundMoney` before splitting into dinars/fils, closing a
  fils-level disagreement risk between a cheque's printed numeral and its spelled-out words at rounding
  boundaries. Their distinct wording/grammar was deliberately preserved — full consolidation to one
  implementation was rejected as a real behavior change, not a safe cleanup. New `frontend/src/lib/money.ts`
  mirrors backend's `roundMoney` (separate workspaces, no shared package boundary).
- **Phase 3 — Architecture Cleanup:** `BankAccountExplorer.tsx`'s inlined focus-trap replaced with
  ExplorerKit's exported `useFocusTrap`; 4 independent pagination reimplementations (`BankAccountExplorer`,
  `BankSalaryAnalytics`, `FinancialCenter` ×2) replaced with ExplorerKit's `Pagination` (gained an additive
  optional `disabled` prop); 3 page-local single-slot toasts (`BankReconciliation`, `BankSalaryAnalytics`,
  `AIAssistant`) and 2 blocking `window.alert()` calls (`TemplateStudioEditor`) replaced with the centralized
  `toastStore`/`Toast.tsx` already used by 12 other pages. Orphaned per-page toast CSS removed alongside.
- **Phase 4 — Frontend Consistency:** `authStore.ts` gained `isSystemAdmin()`, replacing 5 identical
  `user?.role.name === 'SYSTEM_ADMIN'` string checks (Cheques/Expenses/Invoices/Prices/ResourcePage) gating
  force-delete UI only — the real backend routes already enforce this correctly, so this was a
  maintainability fix, not a security one.
- **Phase 5 — Backend Architecture:** the `attachments` module — previously the only backend module with no
  `controller.ts`, doing direct Prisma writes and hand-rolled entity-permission dispatch in `routes.ts` — now
  matches every other module's routes→controller→service→schema layering; new `attachments.controller.ts` +
  service methods (`assertReadPermission`/`assertWritePermission`/`findEntityType`/`create`). New shared
  `hasRolePermission()` in `rbac.middleware.ts`, used by both the new attachments controller and
  `approval.controller.ts` (which had a near-identical, separately-reimplemented dispatch). Doc-comments-only
  (no logic change) added to `gl.service.ts`/`accounting.service.ts` explaining the pre-existing, intentional
  manual-journal-entry exception to `createBalancedJournal`/`reverseGL`.
- **Phase 6 — Repository Documentation:** introduced a "Rotation & Archive Policy" for this file (trigger,
  archive destination `docs/history/`, process) in response to its unbounded ~2,600-line/~640 KB growth; no
  rotation performed yet in this pass (policy introduction only). Refreshed `PROJECT_MASTER_STATUS.md`'s
  previously-stale (2026-07-01) "Current Production State"/"Repository Status" tables directly from `git`.

**Independent review:** code-reviewer subagent — **APPROVE**, 0 CRITICAL/HIGH/MEDIUM (1 LOW: `round3`'s
canonical replacement now throws on non-finite input instead of silently returning `NaN`; no current call site
can trigger this, noted as a fail-loud improvement, not a regression). **Gemini Release Gate: APPROVED**
(project-owner in-conversation statement, per the documented Gemini Approval Override policy). **Manual
Visual Review: completed successfully, no issues found.**

**Known, disclosed, not-fixed-in-this-pack:**
- `routerFutureFlags.test.tsx` — pre-existing stale hardcoded lazy-route count (48 vs. actual 46), flagged by
  the prior audit but not one of this pack's 11 named items; left untouched rather than silently expanding
  scope.
- `accounting.service.ts`'s manual-journal-entry path (`createJournalEntry`/`reverseJournalEntry`) still
  writes via `tx.journalEntry.create` directly and does not inherit Phase 1's entry-number retry (it isn't a
  `createBalancedJournal` caller) — verified low-risk: `assertPeriodOpen`/`validateJournalBalance` still fully
  apply, and a collision would cleanly fail the transaction (no corruption), not silently double-post. Manual
  entries are single, human-paced form submissions, not a bulk/concurrent path like payroll/expense posting.

---

## Previous Release — Dashboard Retry Loader Button v1

| Field | Value |
|-------|-------|
| **Package** | Dashboard Retry Loader Button v1 (**visual-only**) |
| **Goal** | Replace the always-visible Dashboard header "retry" button with a clickable SVG loader, without changing the retry behavior, Business Logic, or API. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-16 |
| **Feature branch** | `feature/dashboard-retry-loader-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `1e609e2` |
| **Feature commit** | `e7268ab` — `feat(dashboard): replace header retry button with SVG loader` |
| **Production merge commit** | `27c27e9` |
| **Stable tag** | `stable-dashboard-retry-loader-v1` → merge `27c27e9` (annotated) |
| **Release scope** | **2 files** — both modified, 0 added, 0 deleted. `frontend/src/pages/Dashboard.tsx`, `frontend/src/components/dashboard/dashboard.css`. |
| **Validation** | frontend `tsc --noEmit` ✅ (clean, no errors) · manual static inspection of the diff · independent review: **Gemini APPROVED** (explicit project-owner in-conversation statement — "Gemini has already approved this implementation" — per the documented Gemini Approval Override policy; not independently re-run by Claude). |

> **Visual-only.** No API, backend, routing, permission, or data-flow change. The error-alert retry
> button (`db-retry-btn`, shown only when `error` is set) was intentionally left unchanged — only the
> always-visible header retry button was replaced, per explicit scope decision.

**What changed**

- **Header retry button → SVG loader** — the `<Button icon="refresh">إعادة المحاولة</Button>` in
  `.db-exec-head-actions` was replaced with a plain `<button className="db-refresh-loader-btn">`
  containing the requested `.retry-loader` SVG (rotating circle, `stroke-dasharray` chase animation).
  Same position, same clickability, no visible text (icon-only; `aria-label` for screen readers only).
- **Sized ~20% smaller** — `width: 2.6em` → `2.08em` on `.retry-loader`.
- **Same retry handler** — `onClick={() => setRefreshKey((k) => k + 1)}`, byte-identical to the removed
  button's handler.
- **Same repeat-click guard** — `disabled={initialLoading || refreshing}`, reusing the exact same
  existing state that previously drove the old button's `busy` prop.
- **New CSS** — `.db-refresh-loader-btn` (unstyled button reset, hover/disabled states matching the kit's
  existing secondary-button conventions) plus `.retry-loader` / `circle` / `@keyframes rotate4` /
  `@keyframes dash4` in `dashboard.css`, scoped to this button only.

**No API / DB / routing / permission / business-logic change.** Verified via frontend `tsc --noEmit`
(clean) and manual diff inspection; the only two files touched are `Dashboard.tsx` and `dashboard.css`.

---

## Previous Release — Invoice Editor Consolidation & Maintainability Pack v1

| Field | Value |
|-------|-------|
| **Package** | Invoice Editor Consolidation & Maintainability Pack v1 (**pure internal refactor**) |
| **Goal** | Improve maintainability of the Invoices module — split the oversized `Invoices.tsx` into dedicated components and remove the duplicated invoice line-item editing implementation — without changing any business logic, database behavior, API contract, permission, accounting behavior, workflow, or visible UX. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-16 |
| **Feature branch** | `feature/invoice-editor-consolidation-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `e10a630` |
| **Feature commit** | `8369131` — `refactor(invoices): split Invoices.tsx into dedicated components; unify line-item editor` |
| **Production merge commit** | `845100a` |
| **Stable tag** | `stable-invoice-editor-consolidation-v1` → merge `845100a` (annotated) |
| **Release scope** | **8 files** — 1 modified, 7 added, 0 deleted (+1027/−1103). `frontend/src/pages/Invoices.tsx` (modified); `frontend/src/pages/{CreateInvoice,EditInvoice,AddPayment,MonthlyReportModal,CorrectCollectionDate}.tsx`, `frontend/src/hooks/useInvoicePartyPricing.ts`, `frontend/src/utils/invoiceFormConstants.ts` (added). |
| **Validation** | frontend `tsc --noEmit` OK (pre-merge and re-verified post-merge on `production`) · frontend `npm run build` OK (pre-merge and re-verified post-merge) · frontend vitest **1737/1737 pass** (106 files, pre- and post-merge), including `currencyHeaderCompleteness.test.ts` and `universalPrintPreviewCorrective.test.tsx`, which statically read `pages/Invoices.tsx` by path · Claude implementation review: **APPROVED** · independent Gemini regression audit: **APPROVED FOR PRODUCTION**. |

> **Pure internal refactor.** No business logic, calculation, API, permission, database, accounting,
> print, report, or visible UX change. Existing tests untouched and all still pass.

**What changed**

- **`Invoices.tsx` split** (1694 → 597 lines) into `CreateInvoice.tsx`, `EditInvoice.tsx`,
  `AddPayment.tsx`, `MonthlyReportModal.tsx`, `CorrectCollectionDate.tsx`; `Invoices.tsx` itself is now
  orchestration-only — filters, data loading, table, drawer, dialog state.
- **One canonical line-item editor** — `EditInvoice` previously carried its own hand-rolled duplicate
  of the item-editing UI (unit/price picker, delete row, add-material button) alongside the shared
  `InvoiceLineItemsEditor` component already used by `CreateInvoice`. `EditInvoice` now reuses that same
  component. One incidental, expected consequence of consolidating to a single implementation: Edit's
  line-price picker previously listed prices unfiltered by the selected contract/asphalt-plant and had
  no search box (a pre-existing inconsistency vs. Create) — it now inherits Create's contract-filtered,
  searchable picker.
- **New `useInvoicePartyPricing` hook** (`frontend/src/hooks/`) — replaces the near-identical
  customer/supplier + prices + contracts loading effects previously maintained separately in Create and
  Edit. The reset-guard logic (`partyId !== prevPartyIdRef.current && prevPartyIdRef.current !== ''`)
  was verified to reproduce both branches' original behavior exactly: Create's empty-initial-`partyId`
  case (no reset on first party selection) and Edit's pre-filled-`partyId` case (the guard's extra
  condition is always true there, matching Edit's original two-condition check).
- **New `invoiceFormConstants.ts`** — `invoiceTypes` / `INVOICE_YEAR_OPTIONS` / `DEFAULT_INVOICE_YEAR`,
  previously duplicated module-level constants in `Invoices.tsx`, now shared by both dialogs.

**No API / DB / permission / accounting / print / report / test change.** Verified via full frontend
`tsc --noEmit`, full frontend build, and the full frontend vitest suite (106 files / 1737 tests) both
before and after the merge, including the two tests that statically audit `pages/Invoices.tsx` source
text (money-header table-cell completeness, and the print-preview action-bar corrective suite).

---

## Previous Release — AGENTS.md Governance Alignment v1

| Field | Value |
|-------|-------|
| **Package** | AGENTS.md Governance Alignment v1 (**docs-only**) |
| **Goal** | Document the officially approved shadcn/Tailwind styling boundary, and align AGENTS.md's release-automation rules with CLAUDE.md's Git Release Policy so the two governing docs no longer conflict. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-15 |
| **Branch** | `docs/agents-styling-architecture-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `5922890` |
| **Commits** | `983220a` (Styling Architecture section + Tech Stack rows), `9a7e2bd` (Release Policy alignment), `9270fd1` (Gemini Approval Override) — 3 commits, no squash |
| **Production merge commit** | `7404872` |
| **Stable tag** | `stable-agents-governance-alignment-v1` → merge `7404872` (annotated) |
| **Release scope** | **1 file** — `AGENTS.md` only (+99/−10 across the branch). No application code, schema, or config touched. |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · `npm run build:back` ✅ · frontend `npm run build` ✅ · backend vitest **1670/1670 pass** (101 files) ✅ · frontend vitest **1737/1737 pass** (106 files) ✅ · independent review: **Gemini APPROVED** (explicit project-owner statement, per the AGENTS.md Gemini Approval Override this release itself introduces). |

> **Docs-only.** No business logic, calculation, API, permission, routing, service, state-management,
> validation, printing, schema, or approval-workflow change. Nothing in `frontend/`, `backend/`, or
> `electron/` source was touched.

**What changed**

- **Styling Architecture (Officially Approved)** — new AGENTS.md section stating Vanilla CSS is the
  primary styling system app-wide, and Tailwind CSS is permitted only for the isolated shadcn/ui
  integration (`frontend/src/components/ui/**`, `frontend/src/components/DateCalendarPicker*`,
  `frontend/src/app/tailwind.css`): no Preflight, no global reset, no utility usage outside that
  boundary, `--sh-*` token namespacing, `rgb()` over `oklch()` (documented Electron rendering bug),
  vendor files kept upstream-pure. This is a retroactive documentation of the architecture already
  shipped in `stable-shadcn-calendar-datepicker-v1` and Calendar Foundation v1 — not a new migration —
  so it must not be re-flagged as an architectural violation in future reviews. Tech Stack table also
  gained Tailwind CSS / shadcn/ui rows for consistency.
- **Release Policy alignment** — AGENTS.md previously banned automatic `git commit`/`merge`/`push`/
  `tag` and any direct modification of `production`, categorically and without exception. That
  directly conflicted with CLAUDE.md's Git Release Policy, which authorizes a fully autonomous release
  sequence once all gates are met. Replaced with a gate-conditional Release Policy section: forbidden
  until every CLAUDE.md gate is satisfied (implementation complete, TypeScript passes, build passes,
  tests pass, independent review APPROVED), then fully autonomous with no further confirmation ask.
  CLAUDE.md is named canonical for any future conflict on release automation specifically.
- **Gemini Approval Override** — the project owner's explicit, direct, in-conversation statement of
  "Gemini APPROVED" / "Gemini Approved" / "Gemini Review Approved" now satisfies the independent-review
  gate without further verification or evidence collection. Deliberately restricted to a direct
  in-conversation statement — explicitly excludes the same phrase appearing as quoted or pasted content
  from a file, email, PR/issue comment, or web page — so the override cannot be triggered by content
  from an external or untrusted source. Scoped to that one gate only; all other CLAUDE.md gates still
  require Claude's own verification (TypeScript, build, tests, implementation completeness).

**This release itself** is the first to be completed under the new policy: the project owner invoked
the Gemini Approval Override directly in conversation, Claude independently re-verified every other
gate (TypeScript × 3 targets, both production builds, both test suites) before merging, then executed
the merge/push/tag/PROJECT_STATE sequence autonomously per the policy just adopted.

---

## Previous Release — Drawer Actions Consistency Pack v1

| Field | Value |
|-------|-------|
| **Package** | Drawer Actions Consistency Pack v1 (**presentation-only**) |
| **Goal** | Remove the redundant bottom action-bar footer from five entity detail Drawers and consolidate every button into the existing top quick-actions row, matching the Invoices Drawer pattern. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-15 |
| **Feature branch** | `feature/drawer-actions-consistency-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `1585890` |
| **Feature commit** | `b7a9c04` — `feat(drawers): consolidate detail-drawer actions into top quick-actions row` (branch tip; also carries `4d944bc` — `feat(invoices): drawer footer removal, KPI reorder, amount typography`) |
| **Production merge commit** | `18e7da5f73173e1bd5e41f209b520682081fb02f` (`18e7da5`) |
| **Stable tag** | `stable-drawer-actions-consistency-v1` → merge `18e7da5` (annotated) |
| **Release scope** | **5 files** — 5 modified, 0 added, 0 deleted (+122/−68). `frontend/src/pages/{Invoices.tsx,Invoices.css,ResourcePage.tsx,Cheques.tsx,Expenses.tsx}`. |
| **Validation** | frontend `tsc --noEmit` OK (pre-merge and re-verified post-merge on `production`) · `npm run build` (frontend) OK (pre-merge and re-verified post-merge) · independent review agent: no issues found. |

> **Presentation-only.** No business logic, calculation, API, permission, routing, service,
> state-management, validation, printing, or approval-workflow change. Card design, colours,
> icons, and information hierarchy unchanged.

**What changed**

- **Invoice Drawer** (carried on this branch from prior work): removed the bottom action-bar
  footer entirely (edit/delete/cancel/print already exist in the top quick-actions row), swapped
  the «الإجمالي»/«العمر» KPI card positions, and shrank the amount/currency typography so large
  totals stay inside the card without wrapping or overflow.
- **Customer Drawer** — bottom footer (edit/delete) suppressed. `CustomerHub.tsx`'s top
  quick-actions already carried edit/delete from prior work, so no duplicate existed once the
  footer was removed.
- **Equipment Drawer** — same: footer suppressed; `EquipmentHub.tsx`'s existing top quick-actions
  already carried edit/delete.
- **Employee Drawer** — footer suppressed; a **new** top quick-actions row (edit + delete) was
  added, since employees had no hub/top-actions row before.
- **Cheque Management Drawer** — the footer actually held **4** buttons (preview & print, edit,
  cancel [DRAFT-only], force-delete) rather than the 3 originally assumed; all 4 were moved to a
  new top quick-actions row and the footer removed, so no working functionality (cheque
  cancellation) was silently dropped.
- **Expenses Drawer** — the footer actually held **6** buttons (edit, amend/«إلغاء الاعتماد
  والتعديل», approve, reject, delete, force-delete) rather than the 2 originally assumed; all 6
  were moved to a new top quick-actions row and the footer removed.

**Shared-file scoping:** Customer/Equipment/Employee Drawers all render through the generic
`ResourcePage.tsx`, which also serves Suppliers, Contracts, and Salaries — out of scope for this
pack. The footer suppression and the new employee quick-actions row are both guarded by
`cfg.key`, so Suppliers/Contracts/Salaries keep their exact original footer, unchanged; verified
by an independent review pass specifically checking for scope leakage.

**Every relocated button reuses its exact original icon, handler, permission guard, and relative
execution order** — this was a pure relocation, not a redesign.

---

## Previous Release — KPI Cards Typography & Overflow Pack v1

| Field | Value |
|-------|-------|
| **Package** | Final Design Polish — KPI Cards Typography & Overflow Pack v1 (**presentation-only**) |
| **Goal** | Calm the KPI money values down to a balanced size and stop them spilling out of their cards. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-14 |
| **Feature branch** | `feature/kpi-cards-typography-overflow-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `812b2bd` |
| **Feature commit** | `da4e7a7` — `style(ui): balance KPI card typography and contain money overflow` |
| **Production merge commit** | `11362d4bc3e9b50b181ff12fb143d4414043da94` (`11362d4`) |
| **Stable tag** | `stable-kpi-cards-typography-overflow-v1` → merge `11362d4` (annotated) |
| **Release scope** | **3 files** — 3 modified, 0 added, 0 deleted (+29/−1). Frontend CSS + one JSX wrapper. |
| **Validation** | frontend/backend/electron `tsc` OK · **frontend vitest 1726/1726** · **backend vitest 1669/1669** · **electron vitest 71/71** · `build:front` + `build:back` + `electron:build` OK · `git diff --check` clean. |

> **Presentation-only.** No business logic, no calculation, no query, no field rename, no
> API, no Prisma / database / migration. Card design, colours and brand identity unchanged.

**What changed**

- **The five money hero cards are one component.** «إجمالي المبلغ» (Invoices), «إجمالي
  المصروفات» (Expenses), «قيمة الشيكات» (Cheques), «الصافي الكلي» (Payroll) and «صافي الربح»
  (Journal Entries) are all `HeroMetric` at **30px** — a size calibrated for a short count,
  not for a full money string like `293,980.600 KWD`. Reduced to **22px (−25%)** by a single
  rule scoped to the five financial page containers. The **other seven** pages that use the
  same component (Attendance, Inventory, Maintenance, Reports, Forms, Document Expiration,
  ResourcePage) keep the 30px baseline and are untouched.
- **«آخر تحديث» (Price Agreements)** shows a date, not a number → **19px → 15px (−20%)** via a
  class on that card's value only; the count and customers cards are unchanged.
- **The overflow was never in the hero card, and shrinking the font could not have fixed it.**
  Measured live: in the **small** `MetricCard`s (Cheques, Payroll, Journal Entries) the money
  text needs **159px** while its box gives it **101px**, and the number is `nowrap` (because
  `.money-cell` stops BiDi from splitting the number from its symbol) so it cannot wrap.
  Fitting 159px into 101px by font size alone would mean a **~12px** value — mangling, not a
  fix. Root cause: the grid column `minmax(180px, 1fr)` was calibrated for counts. Widened to
  **240px** on the three pages that actually carry money. Card design, padding, alignment and
  the 19px value are unchanged — there is simply one fewer card per row on a narrow window.

**Verified by measurement, not assertion:** zero elements overflow their card across all six
pages, in **both light and dark**, and at Electron's **narrowest window (1024×680)** — with no
horizontal scrollbar.

**Known flaky test (pre-existing, not a regression):** the first full frontend run dropped one
test in `universalPrintPreviewFullEnablement` (double-click inside the print preview). It
passes alone three times — **including with this pack's changes reverted** — and the re-run was
green 1726/1726. It is a timing-fragile test under parallelism and deserves its own follow-up.

---

## Previous Release — Financial Number & Date Presentation Standardization Pack v1

| Field | Value |
|-------|-------|
| **Package** | Financial Number & Date Presentation Standardization Pack v1 (**presentation-only**) |
| **Goal** | One canonical way to render every monetary value and every date — on screen, in print, in the PDF, and in the backend reports — instead of a dozen local formatters that disagreed. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-14 |
| **Feature branch** | `feature/financial-number-date-presentation-standardization-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `57db70f` |
| **Feature commits** | `9e92779` Phase B (canonical formatters) · `281dc08` Phase C (summary cards) · `dc5daed` Phase C visual completion · `e5d67ad` runtime hardening (`TextWithMoney`) · `7ac781c` recommendation content fallback · `22c8187` Phase D (on-screen tables + chart tooltips) · `4d3f7e7` Phase E (print, PDF, backend reports) · `91574fc` PDF fixed-decimal completion · `6d812d6` H-1 currency-header completion · `d14dec4` financial-center currency consistency |
| **Production merge commit** | `141b759a9e1ad585d9a1a740b2114e73678a7832` (`141b759`) |
| **Final production HEAD** | `141b759` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-financial-number-date-presentation-standardization-v1` → merge `141b759` (annotated) |
| **Release scope** | **77 files** — 66 modified, **11 added**, 0 deleted (+1932/−417). Frontend, backend report engine, printed forms. |
| **Validation** | frontend/backend/electron `tsc` OK · **frontend vitest 1726/1726** (103 files) · **backend vitest 1669/1669** (101 files) · **electron vitest 71/71** · `build:front` + `build:back` + `electron:build` OK · `git diff --check` clean · 0 console errors · 0 React warnings. |

> **Presentation-only.** No business logic, no calculation, no rounding-policy change, no
> Prisma / database / migration, no API contract change, no permission or routing change,
> no print-engine or page-geometry change. Excel stays numeric (`#,##0.000`); CSV and the
> NBK salary file are byte-for-byte unchanged.

**The canonical standard**

| Context | Rendering |
|---------|-----------|
| Standalone value (card, drawer, sentence) | `12,455.000 KWD` / `12,455.000 د.ك` — **number first** |
| Table or report cell | `12,455.000` — bare number; the symbol appears **once in the header**: `المبلغ (KWD)` |
| Zero | `0.000` — a real zero is a value, never blank |
| Not applicable | `—` — and `null` is **never** turned into zero |
| Negative | `-1,250.000` |
| Date | `31/01/2026` |
| Date-time | `31/01/2026 14:35` (24-hour) |
| Range | `من 01/01/2026 إلى 31/01/2026` |
| Month heading | `يناير 2026` |
| Digits | **Always Western**, in both currency languages |

**What was actually fixed (not just tidied)**

- **The `KWD 255.000` reversal** — the root cause was never the formatter: a plain
  `"255.000 KWD"` string inside an RTL container is **visually reordered by BiDi** (measured
  in the running app: symbol at x=25, number at x=40). Fixed with `.money-cell`
  (`direction: ltr; unicode-bidi: isolate`) on the **value only**, plus Unicode isolates in
  the printed-form strings. Reading the DOM text was not enough to see it — only pixel
  measurement was.
- **PDF silently dropped trailing zeros** (`15,876` instead of `15,876.000`; `2,055.9`
  instead of `2,055.900`). Root cause: monetary columns declared `numFmt` but **not**
  `format: 'currency'`. Excel reads `numFmt` so it looked correct, while HTML/PDF read
  `format` and fell through to a generic numeric formatter. Fixed in the **26 column
  definitions**, not in the renderer; pinned by a guard test.
- **Dashboard runtime crash** (`Cannot read properties of undefined (reading 'split')`) —
  the `RecommendationV2` type promised a `message` field the API never sends. Fixed the
  **contract**, then filled the empty cards from the fields the API actually returns
  (`message → reason → suggestedAction → expectedImpact`) — no invented text.
- **Hidden zeros in the Financial Center** — `n ? fmt(n) : ''` rendered a **real zero as an
  empty cell** in the statement, the grouped view and the journal lines. Now `0.000`. The
  fix is measurable: 9 zeros appeared in the statement, 16 in the grouped view, 40+ in the
  journal book — all previously invisible.
- **Structural guard** — `currencyHeaderCompleteness.test.ts` scans the financial-table
  folder, reads `<MoneyCell>`, `fcMoneyCell` **and locally-defined cell helpers**, and binds
  every cell to the `<thead>` of **its own table**, so a correct header elsewhere in the
  same file cannot cover for a missing one. It earned its keep immediately: it caught two
  defects nobody had reported (the journal-lines sub-table and the trial-balance
  period-mode headers).

**Deferred — non-blocking, documented**

1. The guard's synthetic self-test asserts on a hand-built snippet instead of passing it
   through `auditTableCells`; it proves nothing about the guard. (The guard's real detection
   ability is proven — it caught two live defects.)
2. `AgingTable` still hides a real zero (`n ? fcCurrency(n) : ''`). Its currency handling is
   internally consistent (symbol in the cell, period headers), so it was left alone.
3. AI `ResultCard` / skills monetary formatting predates this pack and needs its own package.
4. **Found during release smoke, pre-existing:** the financial-center **HTML/PDF export**
   prints row dates as raw ISO (`2026-01-31`) instead of `31/01/2026` — `fmtCell` has never
   had a date branch (verified identical at `57db70f`, before this pack). The report **header**
   date is correct. Out of this pack's date scope (`reports.service`, `header.template`,
   `pdf.service`); needs a follow-up.

---

## Previous Release — Collapsible Sidebar Workspace Pack v1

| Field | Value |
|-------|-------|
| **Package** | Collapsible Sidebar Workspace Pack v1 (**UI / UX only**) |
| **Goal** | Give dense table screens more horizontal room: the main sidebar collapses to an icon rail and expands back, and the choice is remembered. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-14 |
| **Feature branch** | `feature/collapsible-sidebar-workspace-pack-v1` (kept — not deleted) |
| **Baseline** | `production` @ `7063cc1` |
| **Feature commits** | `8b8f6824202e0892cf0db6bb2948b54e243df671` (`8b8f682`) — the pack · `900ffc183bdb1ba54bb75690464b66ef8a6c6479` (`900ffc1`) — calm the collapsed active item |
| **Production merge commit** | `49ef2df53c4f4fe2993bf9cf725012b27b62f27f` (`49ef2df`) |
| **Final production HEAD** | `49ef2df` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-collapsible-sidebar-workspace-pack-v1` → merge `49ef2df` (annotated) |
| **Release scope** | **6 files** — 4 modified, **2 added**, 0 deleted (+605/−6). **Frontend only.** |
| **Validation** | frontend/backend/electron `tsc` OK · **frontend vitest 1575/1575** (97 files) · **electron vitest 71/71** · `build:front` + `electron:build` OK · `git diff --check` clean · no console errors, no new React warnings. |

> **Presentation / UX only.** No business logic, backend, Prisma, database, permission,
> routing, printing or report change; no new dependency and no new state library.

**Files changed**
- `frontend/src/stores/uiStore.ts` — sidebar mode + persistence; writes `data-sidebar`
  on `<html>` **before the first paint**.
- `frontend/src/app/theme.css` — **3 lines**: declares `--sidebar-width` and makes the
  sidebar and the content read it instead of two hard-coded 260px values.
- `frontend/src/components/sidebar-collapse.css` — **new**; the whole collapse layer.
- `frontend/src/components/Layout.tsx` — the toggle button and the rail tooltip.
  **Navigation and permission filtering are untouched.**
- `frontend/src/lib/i18n.ts` — two keys (ar + en).
- `frontend/src/__tests__/sidebarCollapse.test.tsx` — **new**; 15 tests.

**What was improved**
- **Collapse / expand** — 248px ⇆ 72px. Measured in the running app: the content area
  gains the width (1443px → 1619px), with no horizontal scrollbar.
- **One source of width** — `--sidebar-width`; the sidebar and the content read the same
  variable, so there are no per-page offsets and **no layout jump at startup** (the
  attribute is set at module load, not in an effect).
- **Persistence** — `manarERP.sidebar.mode`; anything that is not exactly `'collapsed'`
  falls back to `'expanded'`, so a corrupted value cannot break the shell.
- **Narrow windows** — ≤1200px collapses the rail **for the session only**, never
  overwriting the saved preference; below 900px the pre-existing drawer takes over and
  always opens expanded.
- **Collapsed rail** — icons centred, active item still marked, and each label stays in
  the DOM (visually hidden, not removed) so screen readers keep it. A tooltip shows the
  name on hover and on keyboard focus; it renders outside `.nav` (which scrolls and
  would clip it), points into the content area in both directions, sits above tables and
  drawers, and never intercepts a click.
- **Active item (refinement commit)** — the shell's
  `html[data-theme="dark"] … .nav a.active` forces a saturated blue fill plus a large
  shadow; at 72px that read as a CTA square competing with the collapse button. In the
  rail it is now a low-intensity indigo surface (44×44, radius 11px, **no gradient, no
  glow, no shadow**) with a 3px indicator on the edge facing the content
  (`inset-inline-end` — left in Arabic, right in English). The expanded sidebar is
  unchanged.
- **Logo** — no new asset: the emblem's bounds were measured on both logo files (it ends
  at 25.5% of the width; the company name starts at 29.6%), so the rail shows a 27.5%
  window of the *existing* file — full emblem, no cropped letters, aspect ratio kept.
- **Accessibility** — a real `<button>` with `aria-expanded` and a label that switches
  between «طي القائمة الجانبية» and «توسيع القائمة الجانبية» (both languages), decorative
  icons `aria-hidden`, a visible focus ring, and motion limited to 180ms width/margin
  with `prefers-reduced-motion` respected.

**Explicitly unchanged:** navigation logic, `NAV` and its permission filtering, routes,
active-route detection, print rules (the sidebar is still hidden in print), backend,
Prisma, the database, and every other screen.

**Known limitation (pre-existing, not introduced here).** The <900px drawer uses
`transform: translateX(100%)`, which is not direction-aware and may slide in from the
wrong side in **LTR**. It predates this package and was left alone.

**Deliberately not built.** No sub-menu flyout: `NAV` is flat groups of links with no
sub-items, so there is no sub-menu to fly out — inventing one would be new navigation,
not a collapse feature. Group headers become a quiet separator in the rail.

---

## Previous Release — Company Settings Final Visual Polish v1

| Field | Value |
|-------|-------|
| **Package** | Company Settings Final Visual Polish v1 (**presentation-only**) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-13 |
| **Feature branch** | `feature/company-settings-final-visual-polish-v1` (kept — not deleted) |
| **Baseline** | `production` @ `38e76e5` |
| **Feature commit** | `5ff3e654e296e8b58ebba3ed42c945a203ef4be6` (`5ff3e65`) |
| **Production merge commit** | `7ec29c4530fa20357e03076b3550370846a838a7` (`7ec29c4`) |
| **Final production HEAD** | `7ec29c4` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-company-settings-final-visual-polish-v1` → merge `7ec29c4` (annotated) |
| **Release scope** | **2 files** — `frontend/src/pages/Settings.tsx` + `Settings.css` (+408/−103). **Frontend only.** No backend, Electron, Prisma, schema, migration, API, route, state, feature-flag, printing or dependency change. |
| **Validation** | frontend/backend/electron `tsc` OK · **frontend vitest 1560/1560** · **electron vitest 71/71** · `build:front` + `electron:build` OK · `git diff --check` clean. |

> **Visual polish only.** No section was moved, merged or removed; no handler, data
> flow or business rule changed. Every CSS rule is **scoped to `.settings-center`**,
> so nothing in this release can reach another screen.

**What changed**
- **Density** — the page rhythm is ~12% tighter at every level (page gap and padding,
  card padding, card head, field padding, label spacing). Line height and hit areas
  are untouched, so nothing became harder to read or to click.
- **Header** — the title leads (21px/800, tighter tracking); the subtitle steps back;
  the save action aligns with the title.
- **Summary cards** — one height, one padding, value-first weight. Tones, order and
  data unchanged; no card added.
- **Section tabs** — shorter bar, tighter pills, clearer hover/focus. Same items,
  same order, same scroll behaviour.
- **Cards, fields, buttons unified** — one radius/border/shadow/padding for every
  card; fields get clearer borders, a token-based focus ring and a tighter label
  rhythm (no type, validation or placeholder change); buttons get one size per level.
- **Button-hierarchy defect fixed** — the signature, stamp and calibration buttons
  asked for `btn-secondary` / `btn-danger`, **classes that exist in no stylesheet**,
  so every one of them rendered as full primary blue («تغيير الختم» and «حذف الختم»
  looked identical). They now use the classes that do exist (`secondary` / `danger`),
  restoring primary / secondary / destructive. No handler, label or order changed.
- **Signatures & stamp** — the heavy inner frame and blue fill are replaced by a light
  border (the default signature is marked with a thin indigo ring), and each gets a
  real preview stage (≥104px / ≥112px). `object-fit: contain` scales only what is
  displayed — **the stored file and its real dimensions are untouched**, as are
  upload, delete, show-in-documents and save.
- **Template Studio** — the decorative gradient is replaced by a light tint of the
  **existing** indigo token. Link, text and behaviour unchanged.
- **Translation dictionary** — same component, same rows, same handlers, now rendered
  as an enterprise data grid: clear sticky header, row hover, fixed-width action
  column with an icon delete button (instead of a bare red `×`), cell inputs with a
  hover border and an indigo focus ring, and an "add row" that reads as an action
  rather than a dashed placeholder. Search, filter, edit, delete, add, columns, data
  and pagination behaviour are unchanged.
- **Accessibility** — the dictionary delete button carries `aria-label="حذف الصف"`
  alongside its `title`, so each row's delete action is announced with what it deletes.

**Deliberately NOT done.** The reference mock showed a status column, a per-row edit
button and pagination in the dictionary. None exist in the component (`{ar, en}` rows,
in-cell editing, no paging), so adding them would be **new functionality** — out of
scope for a polish package. The sidebar was not touched either: its active item already
matched the mock, and it is a global component shared by every screen.

**Known non-blocking note.** The independent review asked for `aria-label="حذف"` on the
dictionary delete button on the assumption it had none. It already had
`aria-label="حذف الصف"` — a strictly more informative label — so it was kept as-is and
no accessibility commit was made.

---

## Previous Release — Additive Universal True Chromium WYSIWYG Preview v1

| Field | Value |
|-------|-------|
| **Package** | Additive Universal True Chromium WYSIWYG Preview v1 (**the Accurate Preview now covers 14 forms beyond the invoice, ENABLED BY DEFAULT**) |
| **Release status** | RELEASED — feature ON by default |
| **Release date** | 2026-07-13 |
| **Feature branch** | `feature/additive-universal-true-chromium-preview-v1` (kept — not deleted) |
| **Baseline** | `production` @ `b7fd05f` |
| **Feature commit** | `6ee5e6a61edd5a0fab0cf15e60694560d500f21c` (`6ee5e6a`) |
| **Default-enablement commit** | `01c9cd7275d8dd1d16b12333b72514bd490fdfa1` (`01c9cd7`) |
| **Production merge commit** | `9fe94c824d4b710cb44cd7709527785bea42528a` (`9fe94c8`) |
| **Final production HEAD** | `9fe94c8` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-additive-universal-true-chromium-preview-v1` → merge `9fe94c8` (annotated) |
| **Release scope** | **20 files** — 18 modified, **2 added**, 0 deleted (+886/−33). **Frontend only.** No Electron, backend, Prisma, schema, migration, API, permission or dependency change. |
| **Feature flags** | **`UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 = true`** (the 14 forms) and **`TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC = true`** (the invoice) — **independent**; localStorage overrides remain supported for both. |
| **Emergency rollback** | `localStorage.setItem('manar:flag:UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1', 'off')` — instant, no release required; the invoice is unaffected. |
| **Validation** | frontend/electron/backend `tsc` OK · **electron vitest 71/71** · **frontend vitest 1560/1560** (96 files) · `build:front` + `electron:build` OK · `git diff --check` clean. Lint **NOT RUN** (eslint not installed — pre-existing gap). |

> **Additive only.** No existing preview was replaced, no print path changed, no legacy
> code deleted, and no second print engine introduced. Each form gained **one extra
> button** next to the ones it already had.

**Released behaviour**
- Each of the 14 forms exposes **«معاينة دقيقة»** (Accurate Preview) **beside** — never
  instead of — its existing print button and its existing preview.
- The preview shows **Chromium's real paginated document** (its own page breaks) via
  `webContents.printToPDF`, displayed by Chromium's own PDF viewer with **`#toolbar=0`**,
  plus the manarERP-owned zoom toolbar. No PDF.js, no custom viewer, no second print engine.
- **The same document source the print path already uses** is composed — not a copy of it:
  the ten FormLayout forms compose from `.form-page` and delegate to `FormLayout.doPrint`;
  Payslip and Employment Contract use their own `printRootRef` and print function; Quotation
  and Receipt Voucher keep their **own** composers and page specs (`composeQuotationPreview`;
  `composeFromNode` + `RECEIPT_VOUCHER_PAGE_SPEC`).
- Printing from inside the dialog closes it and calls the form's **existing** print function
  by reference — exactly once. **Preview failure never blocks printing.**

**Models covered (14):** طلب إجازة · طلب شراء · سند صرف · إنذار موظف · استقالة ·
مباشرة عمل · سلفة راتب · شهادة راتب · إلى من يهمه الأمر · تقييم أداء · قسيمة راتب ·
عقد عمل · عرض سعر (**both Engine and Legacy modes**) · سند قبض.

**Exclusions (documented, untouched):** cheques · cheque calibration studio · calibration
test sheet · bank reconciliation · bank salary analytics · Excel/spreadsheet outputs ·
anything tied to millimetre printer offsets.

**Implementation.** One new shared hook (`useAccurateFormPreview`) returning only a button and
a dialog, and **one optional prop** on `FormLayout` (`onPrintApiReady`) that publishes references
to the printed node and to `doPrint` — **`doPrint` itself is unmodified** (read through a ref, so
its timing, call count and behaviour are unchanged). The dialog is the invoice's own
`WysiwygPreviewPocDialog`, not a fork; its only change is that `onFallback` became optional, so a
form without a continuous preview no longer renders a fallback button promising a path that does
not exist. **Flag off ⇒ no button, no dialog, no listener** — the forms are byte-for-byte what
they were.

**Verification.** 50 new tests (frontend 1560/1560) assert that the composed document carries the
form's **current** data from the printed node, that a form's own composer wins when it has one,
that the dialog's Print delegates to the legacy function exactly once, that closing changes no form
data, and that a generation failure — or a missing Electron bridge entirely — never blocks
printing. **Smoke-tested in the running app over CDP:** with no localStorage override, the button
appears on Leave Request, Employment Contract, Payslip, Quotation and Receipt Voucher; opening it
produced a real PDF (`blob:…#toolbar=0&zoom=100`) and Close dismissed it; `override = 'off'`
removed the button while the legacy print button stayed and the invoice's own preview remained
visible — proving the two flags are independent.

**Explicitly unchanged:** the legacy print path (`FormLayout.doPrint`, `printCurrentView`,
`printService.ts`, `dialog.ipc.ts`, `pdf.ipc.ts`, `utils/print.ts`, `PrintPreviewDialog.tsx`,
`composeDocument.ts`), `webContents.print`, `print:submit`, HTML/CSS print templates, margins,
paper sizes, page breaks, PDF export and its filenames, form data, calculations, business logic,
API, DB, permissions — and the invoice, which keeps its own flag.

**Accepted limitations.** Escape does not close the dialog once focus enters PDFium — the
**Close button remains the official means**. Zoom returns the document to page 1. Keyboard zoom is
not guaranteed. **`#toolbar=0` must be re-verified on every Electron upgrade** — print containment
rests on it. ESLint remains a pre-existing tooling gap.

**Future note (non-blocking, low priority).** The shared dialog could later separate `title` from
`documentLabel`. Not a functional defect; deliberately **not** done in this release.

---

## Previous Release — Controlled Invoice WYSIWYG Enablement & Zoom Controls v1

| Field | Value |
|-------|-------|
| **Package** | Controlled Invoice WYSIWYG Enablement & Zoom Controls v1 (**the invoice Accurate Preview is now ENABLED BY DEFAULT**) |
| **Release status** | RELEASED — feature ON by default |
| **Release date** | 2026-07-13 |
| **Feature branch** | `feature/wysiwyg-invoice-enablement-zoom-v1` (kept — not deleted) |
| **Baseline** | `production` @ `a10c7e2` |
| **Feature commit** | `6cf6f7e50343cf26a00c66963f3b578bb8825c46` (`6cf6f7e`) |
| **Production merge commit** | `7c793abe0ff308a01612d1ce2642ed53de667ce7` (`7c793ab`) |
| **Final production HEAD** | `7c793ab` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-invoice-wysiwyg-enablement-zoom-v1` → merge `7c793ab` (annotated) |
| **Release scope** | **5 files** — 5 modified, 0 added, 0 deleted (+467/−51). **Frontend only.** No Electron, backend, Prisma, schema, migration, API or dependency change. |
| **Feature flag** | **`TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC = true`** — the shipped default. Per-machine `localStorage` overrides remain supported. |
| **Emergency rollback** | `localStorage.setItem('manar:flag:TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC', 'off')` — instant, no release required. |
| **Validation** | frontend/electron/backend `tsc` ✅ · **electron vitest 71/71** ✅ · **frontend vitest 1509/1509** (95 files) ✅ · `build:front` + `electron:build` ✅ · `git diff --check` clean. Lint **NOT RUN** (eslint not installed — pre-existing gap). |

> **This release completes the invoice WYSIWYG preview rollout.** The invoice
> **Accurate Preview** («📄 معاينة دقيقة») is officially enabled by default. **The old
> print path is unchanged**, and a local `off` override remains available as an
> emergency rollback.

**Released behaviour**
- The invoice screen exposes **«📄 معاينة دقيقة»** (Accurate Preview). No experimental
  wording remains anywhere in the interface: no `🧪`, no `تجريبي`, no `WYSIWYG`, no
  `Chromium` in any user-visible string.
- The preview shows **Chromium's real paginated document** — its own page breaks —
  generated from the same composed invoice via `webContents.printToPDF` and displayed
  by Chromium's own PDF viewer. No PDF.js, no custom viewer, no second print engine.
- **PDFium's native toolbar stays hidden** (`#toolbar=0`), so its Print and Download
  buttons — which bypass the official print path — remain unreachable.
- The **manarERP-owned toolbar** provides: **Print · Zoom Out · current percentage ·
  Zoom In · Fit · Reset · Close**, in ExplorerKit styling, light and dark.
- **Zoom levels: 50% · 75% · 100% · 125% · 150% · 175% · 200%** (default **100%**,
  clamped at both ends). **Fit uses `view=FitH`.** Reset returns to 100%.
- **Zoom remounts only the iframe.** No PDF regeneration, no new Blob, no additional
  IPC, no new viewer token, no mid-zoom revoke. **Printed output is unchanged.**

**Runtime corrective included in this release.** The zoom buttons initially did
nothing: **PDFium reads the URL fragment only when a browsing context LOADS**, so
mutating the live iframe's `src` was ignored — the rendered page measured **713px wide
at 100%, 125% AND 175%**, and parameter order made no difference. The iframe now
carries a `key` tied to the derived viewer URL so React genuinely remounts it. Verified
by pixel measurement: **50% → 356px · 100% → 713px · 200% → 983px · Fit → fits width.**
The old tests asserted the fragment *string* and passed against the broken build; they
now assert real DOM replacement and were proven to fail if the `key` is removed.

**Also fixed (presentation-only).** The print dialogs rendered **transparent** outside
`.xpl-scope` — `--xpl-*` tokens were undefined on the invoice route, so
`background: var(--xpl-surface)` collapsed and the invoice bled through the toolbar in
**both themes** (measured: dialog/toolbar/statusbar all `rgba(0,0,0,0)`). Surfaces are
now opaque via the kit's own mapping sourced from the global theme tokens. This repairs
the **existing continuous preview** too, which shared the defect through `.pc-*`.

**Explicitly unchanged:** the legacy print path (`printCurrentView`, `printService.ts`,
`dialog.ipc.ts`, `pdf.ipc.ts`, `utils/print.ts`, `FormLayout.tsx`,
`PrintPreviewDialog.tsx`, `composeDocument.ts`), Chromium `printToPDF` generation,
invoice calculations, invoice business logic, the invoice print template, backend,
Prisma, the database schema, and the PDF-viewer dependency set (**no PDF.js**).

**Manual verification.** Zoom visually confirmed at **50% / 100% / 200% / Fit**;
**real** Ctrl+P and Ctrl+S with focus **proven inside the PDF plugin** produced **no
print and no save dialog**; **right-click exposed no menu**; official Print delegates
exactly once; Arabic/Cairo rendering intact; scrolling works; close/reopen and a second
invoice verified.

**Accepted limitations.** Escape does not close the dialog once focus enters PDFium —
the **Close button remains reliable**. Zoom remount returns the document to **page 1**
(PDFium cannot report the current page position). Keyboard zoom is not guaranteed.
**`#toolbar=0` and the fragment behaviour must be re-verified on every Electron
upgrade** — this is the load-bearing assumption of print containment. The two duplicated
indigo literals in `PrintCenter.css` may later move to a global token. ESLint remains a
pre-existing tooling gap.

---

## Previous Release — PDFium Viewer Hardening v1

| Field | Value |
|-------|-------|
| **Package** | PDFium Viewer Hardening v1 (hardening for the WYSIWYG POC — **feature still DISABLED BY DEFAULT**) |
| **Release status** | RELEASED (WYSIWYG flag remains OFF — this is not enablement) |
| **Release date** | 2026-07-13 |
| **Feature branch** | `feature/pdfium-viewer-hardening-v1` (kept — not deleted) |
| **Baseline** | `production` @ `d5a578c` |
| **Feature commit** | `3de7e904237fe69c9e6c9315a1eb7dd07238fa4f` (`3de7e90`) |
| **Production merge commit** | `777219f21568574e20334e2f53f400d5f7cf7657` (`777219f`) |
| **Final production HEAD** | `777219f` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-pdfium-viewer-hardening-v1` → merge `777219f` (annotated) |
| **Release scope** | **9 files** — 6 modified, 3 added, 0 deleted (+568/−11). Electron + frontend. **No backend, Prisma, schema, migration, API or dependency change.** |
| **Feature flag** | `TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC` — **still `false` (OFF)**. Unchanged by this release. |
| **Reviews** | Architecture audit **KEEP PDFIUM WITH SMALL CHANGES** · implementation **READY FOR INDEPENDENT REVIEW** · independent review **APPROVE FOR COMMIT** · **Gemini: APPROVE MERGE WITH DOCUMENTED LIMITATIONS** |
| **Validation** | frontend/electron/backend `tsc` ✅ · **electron vitest 71/71** ✅ · **frontend vitest 1489/1489** (95 files) ✅ · `build:front` + `electron:build` ✅ · `git diff --check` clean. Lint **NOT RUN** (eslint not installed — pre-existing gap). |
| **Human verification** | **Right-click inside the PDF viewer: PASSED — no context menu appeared.** |

> **The WYSIWYG feature remains DISABLED BY DEFAULT in released source
> (`TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC = false`). This release hardens the viewer; it
> does NOT enable the feature.** A developer machine may carry a per-machine
> `localStorage` override set to `'on'` — that is runtime state and does **not** change
> the shipped default.

**What it closes.** The blocker was never PDF generation — it was the viewer UI. Chromium's
PDFium toolbar carries its own **Print** and **Download** buttons, and PDFium answers
**Ctrl+P / Ctrl+S** itself. All three exits bypassed manarERP's official print path and its
auditing / PrintJob semantics.

**Released scope**
1. **PDFium native toolbar hidden** via the `#toolbar=0` open parameter — print, download,
   page, zoom and thumbnail-sidebar controls all removed. **Not an overlay and not a crop:**
   nothing depends on a toolbar height.
2. **Raw Blob URL cleanup preserved.** The raw `blob:` URL is kept **separate** from the
   viewer URL, because `URL.revokeObjectURL` must receive the *original* blob URL — a
   fragment-appended string is a different URL and would silently fail to revoke, leaking
   the invoice PDF in memory. Tests assert no `#`-bearing URL is ever revoked.
3. **Ctrl/Cmd+P and Ctrl/Cmd+S suppressed** in the **main process**
   (`before-input-event` — a renderer listener cannot stop PDFium), and **only while a
   WYSIWYG viewer session is active**. Not a global keyboard blocker. **Alt is deliberately
   excluded: Windows reports AltGr as Ctrl+Alt, and an Arabic keyboard types real characters
   with it.**
4. **Viewer-session token ownership** — monotonic tokens; a **stale close cannot disarm a
   newer viewer's guard**; **closing during activation releases the granted token** (without
   it the guard would stay armed forever with no dialog open, killing Ctrl+P app-wide);
   **renderer crash / window close clear the state**.
5. **WYSIWYG generation flow gating** — `wysiwygPoc:generate` answers only while a viewer
   session is active, so the channel is no longer casually reachable while the UI flag is OFF.
   **This is flow-gating, not an authorisation boundary** (a compromised renderer could
   self-activate) — the code states this rather than claiming protection it does not provide.
6. **Regression coverage** — 25 Electron guard tests (71 Electron total) + 12 new renderer
   tests (32 in the POC suite).

**Explicitly unchanged.** The legacy print path (`printService.ts`, `dialog.ipc.ts`,
`pdf.ipc.ts`, `utils/print.ts`, `FormLayout.tsx`, `PrintPreviewDialog.tsx`,
`composeDocument.ts`, `contextMenu.ipc.ts`, `InvoicePreview.tsx`), Chromium `printToPDF`,
invoice composition and layout, business/accounting logic, backend/database, the PDF viewer
dependency set (**no PDF.js, no custom viewer**), and the default feature-flag state.

**Remaining pre-pilot human checks (do not block this release):** Ctrl+P and Ctrl+S inside
the focused PDF (automation cannot observe the native dialog); Escape; Ctrl+plus/minus;
scroll / Page Up / Page Down. **Re-verify `#toolbar=0` on every Electron upgrade.** The macOS
`app.on('activate')` window-recreation gap is irrelevant to the Windows-only target (and is
fail-safe). The pre-existing transparent preview-toolbar design-token defect remains a
separate ticket.

---

## Previous Release — True Chromium WYSIWYG Preview POC v1

| Field | Value |
|-------|-------|
| **Package** | True Chromium WYSIWYG Preview POC v1 (**experimental — DISABLED BY DEFAULT**) |
| **Release status** | RELEASED (flag OFF — inert in production) |
| **Release date** | 2026-07-13 |
| **Feature branch** | `feature/true-chromium-wysiwyg-preview-poc-v1` (kept — not deleted) |
| **Baseline** | `production` @ `b7a810c` |
| **Feature commit** | `c8f6fb3` |
| **Production merge commit** | `aba9b9e` |
| **Final production HEAD** | `aba9b9e` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-true-chromium-wysiwyg-preview-poc-v1` → merge `aba9b9e` (annotated) |
| **Release scope** | **15 files** — 9 modified, 6 added, 0 deleted. Electron + frontend. **No backend, Prisma, schema, migration or API change. No new dependency** (`package.json` gained exactly one script line). |
| **Feature flag** | `TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC` — **default `false` (OFF)**. Enable per machine only: `localStorage['manar:flag:TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC'] = 'on'`. |
| **Validation** | frontend `tsc` ✅ · electron `tsc` ✅ · backend `tsc` ✅ · **electron vitest 46/46** (new `npm run test:electron`) ✅ · frontend vitest **1477/1477** (95 files) ✅ · `build:front` + `electron:build` ✅ — re-run on `production` after the merge. Lint **NOT RUN** (eslint not installed — pre-existing gap). |

> **This release adds an experimental Chromium-based WYSIWYG Preview POC that is completely
> disabled by default. No production behaviour changes occur until the feature flag is enabled.**

**What it is.** A proof of concept that shows the operator Chromium's **real paginated output** —
its own page breaks — instead of the current continuous preview's honest-but-estimated pagination.
The SAME composed invoice document the existing Universal Print Preview already renders
(`composeStyledFromNode` — one authoritative source) is handed to an isolated hidden Chromium
worker, which returns its own paginated PDF via `webContents.printToPDF`; Chromium's built-in PDF
viewer displays it in a `blob:` iframe. **No DOM measurement, no assumed A4 height, no simulated
page breaks, no PDF.js, no second print engine, no duplicated invoice template.**

**Proven, not asserted.** Page counts matched an independent control (`printToPDF` of the live app
page) on **6/6** real invoice cases — 1, 2, 2, 4, 2, 2 pages — including a long table and a row
sitting on a page break.

**The print path is unchanged.** The preview's «طباعة» closes the dialog and calls
`printCurrentView()` — the same expression the legacy button uses. `printService.ts`, `pdf.ipc.ts`,
`dialog.ipc.ts`, `utils/print.ts`, `PrintPreviewDialog.tsx`, `composeDocument.ts` and
`FormLayout.tsx` are **byte-for-byte untouched**. Opening or generating a preview never prints; a
failure offers an explicit fallback to the existing continuous preview.

**Architecture.** Every risky *decision* lives in `electron/ipc/wysiwygPocPolicy.ts` as a pure,
unit-tested function; `wysiwygPoc.ipc.ts` owns only the side effects. Hardening from the independent
review: the **worker-ownership race (H-1)** — where a timed-out job could navigate a *later* job's
worker to `about:blank` and silently blank its preview — is closed and regression-tested; **real
network isolation** via a dedicated in-memory session (the dev exception for the Vite origin is
**measured and required**: Vite serves Cairo as a URL in dev, so blocking it produced a PDF with no
Cairo embedded and Arabic fell back to a system font); the **page count is honest metadata** that
returns *unknown* rather than a false «0»; payload admitted before any side effect (12 MB cap
measured in **bytes** — Arabic is multi-byte); PDF bytes **copied**, not shared.

**Known blockers before the flag may EVER be enabled in production:**
1. **PDFium toolbar** — Chromium's PDF viewer exposes native **print/download** controls that
   **bypass the official manarERP print path** (its copies, audit and `PrintJob` semantics).
   Decide: accept / mask / replace the viewer.
2. **IPC registration follow-up** — `wysiwygPoc:generate` is registered even while the UI flag is
   OFF; the flag gates the **UI**, not the capability. Bounded (12 MB, single-flight, cannot print)
   and reachable only from our own renderer. Gate registration behind a main-process flag first.

**Also known:** no behavioural `InvoicePreview` render test (20+ hooks — page wiring is guarded at
source by a *strengthened* guard that now enumerates every `printCurrentView` call site); the
pre-existing transparent preview-toolbar defect (`--xpl-*` tokens unset on the invoice route)
affects the **released** preview identically and is deliberately **out of scope** — separate ticket.

---

## Previous Release — Cheque Calibration Test Sheet Preview Overlay v1

| Field | Value |
|-------|-------|
| **Package** | Cheque Calibration Test Sheet Preview Overlay v1 (frontend only) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-13 |
| **Feature branch** | `feature/cheque-calibration-test-preview-v1` (kept — not deleted) |
| **Checkpoint tag** | `checkpoint-pre-cheque-calib-preview-v1` |
| **Baseline** | `production` @ `f03c234` |
| **Feature commit** | `d461367` |
| **Production merge commit** | `d9d7d7e` |
| **Final production HEAD** | `d9d7d7e` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-cheque-calibration-test-preview-overlay-v1` → merge `d9d7d7e` (annotated) |
| **Release scope** | **8 files** — 6 modified, 2 added, 0 deleted. Frontend only. **No backend, Electron, Prisma, schema, migration, or API change.** |
| **Feature flag** | `CHEQUE_CALIBRATION_TEST_PREVIEW_V1` — default **ON**. Deliberately **independent** of `PRINT_PREVIEW_LEGACY_FORMS_V1` / `PRINT_CENTER_PHASE2`. Rollback without a release: `localStorage['manar:flag:CHEQUE_CALIBRATION_TEST_PREVIEW_V1'] = 'off'` → the button prints directly, exactly as before, and no dialog renders. |
| **Manual visual review** | **APPROVED** by the project owner — including physical print verification of the paper sheet. |
| **Validation** | frontend `tsc` ✅ · backend `tsc` ✅ · electron `tsc` ✅ · frontend vitest **1454 pass** (94 files, 0 failures) ✅ · `build:front` + `build:back` + `electron:build` ✅ · lint **NOT RUN** (eslint is not installed in this repo — pre-existing gap, identical on the pre-merge baseline) |

**What changed.** The «اختبار المعايرة» action in the Cheque Calibration Studio no longer prints on click.
It opens an in-app preview of the calibration test sheet; the operator inspects and zooms it, and only the
preview's «طباعة» button prints.

**The print path is unchanged — that is the whole point of the design.** The preview is an *additive
presentation layer*, following the same rule already established for the legacy forms:

> Preview is presentation only. Actual printing stays on the existing legacy print path.

**Single source of truth.** The sheet is rendered **once** by `CalibrationTestSheet` into the hidden
`.chq-calib-testprint` layer. `composeCalibrationTestDocument()` serialises *that very node* for the preview,
and `printCurrentView()` prints *that very node*. There is no second document generator, no duplicated SVG,
no preview-only geometry, and no looser preview-side validation — the existing `isCalibrationGeometry`
response guard still rejects malformed geometry at the response boundary and both surfaces inherit the same
safe fallback.

**Why no style capture was needed.** The test sheet has **zero CSS dependency**: every stroke, fill, font and
coordinate is an SVG presentation attribute inside a millimetre `viewBox`, and its classes
(`chq-test-sheet`, `chq-ruler*`, `chq-test-*`) match no CSS rule anywhere in the repo. The serialised node is
therefore already a complete document. Injecting app stylesheets into a physical measuring instrument would
have imported dark-mode variables and global `svg` rules for no benefit — so it is deliberately not done.

**Print isolation.** The preview cannot reach paper: `PrintPreviewDialog` closes *before* delegating, and
`.pc-scrim` already carries `display: none !important` inside `@media print`. The previously-fixed black-frame
regression cannot return — the composed document carries no border, shadow, or frame; that chrome lives on
`.pc-sheet` in the host page, outside the document.

**Page-box fidelity.** `PrintPreviewDialog` gained optional `pageWidthMm` / `pageHeightMm` / `title` props.
The defaults preserve the existing A4 derivation, so every current caller (invoice, quotation, forms,
vouchers) is byte-for-byte unaffected. The calibration sheet passes the **saved geometry**, so a SYSTEM_ADMIN
paper-size change moves the preview box and the `@page` rule together and they can never disagree. The
composed document also carries `data-print-root`, so page count is measured from the sheet element rather
than the iframe's viewport floor — the old phantom-second-page defect cannot recur.

**Tests.** New `chequeCalibrationTestPreview.test.tsx` (14 behaviour-focused tests): opening without printing,
canonical-document identity, page box following custom geometry, single page (no phantom second page, no
misleading «عرض متصل» note), print delegating exactly once to the legacy path, zoom altering neither the
printed sheet nor the print arguments, close/Escape not printing, focus restoration to the trigger, flag-off
restoring the exact legacy behaviour, `@page` unchanged, and explicit-failure composition. Three existing
tests that asserted *immediate* printing were updated to route through the preview — that behaviour change is
the feature.

**Unchanged:** cheque geometry, calibration mathematics, calibration persistence, template versioning,
restore-defaults, cheque print logs, reprint rules, real cheque printing, the cheque-management list preview,
and the invoice / quotation / HR / payroll preview surfaces.

**Known limitation (deliberate).** The Calibration **Wizard**'s own print steps still print directly, without
the preview. The scope was the named «اختبار المعايرة» toolbar action only; the wizard is a separate modal
with its own stacking context. Extending the preview to it is a candidate follow-up.

---

## Previous Release — Money Rounding Consolidation & Invariant Hardening v1

| Field | Value |
|-------|-------|
| **Package** | Money Rounding Consolidation & Invariant Hardening v1 (backend only) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-13 |
| **Feature branch** | `feature/money-rounding-invariant-hardening-v1` (kept — not deleted) |
| **Baseline** | `production` @ `f461e3f` (unchanged during the package) |
| **Feature commit** | `e845205` |
| **Production merge commit** | `141a7f5` |
| **Final production HEAD** | `141a7f5` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-money-rounding-invariant-hardening-v1` → merge `141a7f5` (annotated) |
| **Release scope** | **29 files** — 24 modified, 5 added, 0 deleted. Backend only. **No schema change, no Prisma migration, no historical-data rewrite, no API/frontend money-type change.** |
| **Gemini review** | **APPROVED** — no blocking findings. |
| **Manual UAT** | **APPROVED** — invoice `12.5 × 3.750 = 46.875` posted balanced; payment `100.1235` **stored as `100.124`** (remaining `49.876`); manual journal `100.000 / 99.999` **rejected**, `100.000 / 100.000` posted; cheque `25.1235` **stored, displayed, previewed and spelled as `25.124`**; Trial Balance, AR/AP Aging, Customer Statement and bank matching all verified. |
| **Validation** | backend vitest **1653 pass** (100 files) ✅ · frontend vitest **1440 pass** (93 files) ✅ · backend/frontend/electron `tsc` ✅ · `build:back` + `build:front` ✅ · `prisma validate` ✅ — identical before and after the merge |

**The architecture is unchanged and that is the decision, not an omission: `Float` + SQLite + KWD at
3 decimals stays.** The preceding *Monetary Precision Migration Audit* proved empirically that a Prisma
`Decimal` migration **buys nothing on SQLite**: a `DECIMAL`-declared column has NUMERIC affinity, so SQLite
stores fractional values as `REAL` (IEEE-754) — `typeof()` returns `'real'`, and `SUM(0.1 + 0.2)` in a
`DECIMAL` column returns `0.30000000000000004`, exactly as in a `REAL` column. Every aggregate the system
depends on (trial balance, aging, statements, dashboard) is computed **inside SQLite**, so it would keep
using float64 regardless. Meanwhile the real data is clean: **0 stored values with more than 3 effective
decimals, 0 unbalanced journal entries out of 113.** Float→Decimal and integer-fils are **rejected** — see
the roadmap's *Reviewed & declined* section.

**What was actually wrong — and is now fixed.** There were **14 independent rounding helpers in three
contradictory families**: EPSILON (used by the *writers*: GL posting, invoices, payroll), sign-symmetric
(used by the *readers*: trial balance, aging), and `toFixed` (statements, exports). An entry was **written
with one rule and read back with another** — `toFixed(1.2345)` gives `1.234` while the ledger writes `1.235`.

**Canonical policy** — `backend/src/shared/utils/money.ts`: **3 decimals, sign-symmetric, half away from
zero**, with binary-noise correction; `-0` normalized to `0`; `NaN`/`Infinity` **rejected** instead of
silently rounding to zero. Exports: `roundMoney` · `normalizeMoney` · `roundMoneyOrNull` · `moneyEquals` ·
`moneyDifference` · `sumMoney` · `MONEY_EPSILON` (1e-6). **Compatibility was proved, not assumed:** the new
policy is **byte-identical to the old ledger rounding on every positive value** (400,000 checked, zero
mismatches). The only divergence is on **negatives**, where the old rule was asymmetric (biased toward +∞) —
and the database contains **no negative monetary value at all**, so no historical row changes.

**Journal-balance invariant — before → after.** Before: `Math.abs(debit - credit) > 0.001`, i.e. a tolerance
**equal to one fils — the smallest unit the currency has**. A journal off by a full fils passed silently into
the ledger, and the manual-journal guard did not even round before comparing. After: `moneyEquals` — round
both sides canonically, then compare with an **implementation** tolerance (1e-6) that absorbs binary noise
only. `0.001` **fails**; `0.1 + 0.2 vs 0.3` **passes**; rejection happens **before** any write. Both the
central GL path and the manual-journal path now use the same rule.

**Persistence-boundary normalization** — four paths were storing money **raw**: `Payment.amount` (while
`invoice.paidAmount` was stored rounded — two sources of different precision for the same fact, one read by
aging/statements and the other by the invoice; the audit record now also states the amount **as stored**),
manual journal `debit`/`credit`, `Cheque.amount` (printed on a bank instrument), and inventory-derived GL
amounts.

**Inventory precision policy.** Quantities are **never** rounded. Unit cost (WAC) **keeps 6 decimals** —
rounding it to the fils on every receipt accumulates valuation drift. Only amounts **entering the GL** are
normalized to 3 decimals, **at the posting boundary alone**, so there is no double rounding.

**Bank tolerance policy — no value changed.** Three distinct meanings had been collapsed into one number:
accounting equality (now resolved by `moneyEquals`), statement running-balance continuity (an external
data-quality check), and fuzzy transaction matching (an inference, not a posting). They are now named and
documented in `bankStatementImport/tolerances.ts`; the approved **`0.005`** matching and continuity behaviour
is **unchanged**, and duplicate detection (exact, fingerprint-based, no tolerance) is untouched. The comment
that claimed `0.001` while the code used `0.005` was removed.

**Known unrelated issues (untouched).** (1) The frontend build emits `Unexpected "*" [css-syntax-error]` —
pre-existing, out of scope. (2) `backend/src/modules/backups/__tests__/backup.verify.test.ts` inserts and
deletes a real row in the **development database**, so the SQLite file hash and rowid counters change on every
full test run even though financial aggregates stay identical (verified: all totals unchanged). This is a
**pre-existing test-isolation issue**, deliberately **not** fixed here; it is worth a small dedicated pack.

---

## Previous Release — Core Runtime Completion & Roadmap Reconciliation v1

| Field | Value |
|-------|-------|
| **Package** | Core Runtime Completion & Roadmap Reconciliation v1 (six coordinated workstreams) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/core-runtime-completion-roadmap-reconciliation-v1` (kept — not deleted) |
| **Baseline** | `production` @ `eada4dd` (unchanged during the package — no drift, no conflicts) |
| **Feature commit** | `d0f3f59` |
| **Production merge commit** | `79f2032` |
| **Final production HEAD** | `79f2032` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-core-runtime-completion-roadmap-reconciliation-v1` → merge `79f2032` (annotated) |
| **Release scope** | **34 files** — approval engine registration + `ApprovalHistory` (5) · global search (6, incl. 3 new) · "coming soon" reconciliation (5) · period-lock guards (4) · PDF export cleanup (6) · docs (2) · updated guard tests (4). No unrelated file entered the release. |
| **Gemini review** | **APPROVED** — no blocking findings, no non-blocking findings. |
| **Manual UAT** | **APPROVED** — global search · approval history + runtime registration · existing expense/invoice/payroll approval flows · Profit & Loss · period lock · PDF export from Executive Decision Center / Quotation / Report Print. **No duplicate accounting posting. No duplicate `ApprovalHistory` or `AuditLog` entry. No black PDF frame.** Arabic PDF output and layouts approved; permissions and state transitions preserved. |
| **Validation** | backend vitest **1591 pass** (97 files) ✅ · frontend vitest **1440 pass** (93 files) ✅ · backend/frontend/electron `tsc` ✅ · `build:back` + `build:front` ✅ · known console warnings **0** ✅ · **no schema change, no Prisma migration** — identical before and after the merge |
| **Known unrelated warning** | `Unexpected "*" [css-syntax-error]` during the frontend build — **pre-existing**, out of scope, deliberately untouched. |
| **PDFKit** | `pdf.service.ts` and the `pdfkit` dependency are **untouched** in this release. A repo-wide audit proved both unreferenced (0 source imports; the only mentions are two test assertions that the report route no longer calls `buildPdf`); deletion is deferred to an explicit decision. |

**1 — Approval engine: activated, without becoming a second approval system.** `approvalEngine.register()`
was never called in production code, so `hasModule()` was false for every entity and
`GET /api/approval-history/:type/:id` answered **400 to every request** — a finished, unit-tested feature that
was unreachable. It is now registered for `expense` · `invoice` · `payroll` (`approval.registry.ts`), and the
three domain services report what they did through a new `approvalEngine.recordTransition()`, which writes
**one `ApprovalHistory` row and nothing else** — on the caller's transaction client.

Routing approvals *through* the engine was rejected on evidence, not taste: the engine writes its own
`AuditLog` row while every domain method writes one via `recordAudit` (⇒ **double audit**); every domain
method opens its own `$transaction` and SQLite is single-writer (⇒ **deadlock**); and `invoices.approve()`
has **no status transition at all** — it posts to the GL idempotently — so a state machine would have meant
inventing a status, i.e. a schema and behaviour change. Each registration's `updateStatus` therefore
**throws on purpose**: anyone who later routes an approval through `transition()` gets a loud error instead
of a silent second status write. Approval rules, permissions, statuses and GL posting are **unchanged**.

**2 — Global Search: from decoration to feature.** The top-bar input had no `value`, no `onChange` and no
handler — typing in it did nothing. `GET /api/search?q=` now searches customers · invoices · employees ·
equipment · expenses · cheques, plus the app's own pages. **Permissions are enforced at query time, not at
render time**: an entity the user cannot read is never queried. Display/navigation fields only (no civil ID,
phone, salary — guarded by a test), 5 hits per entity, 2-character minimum. The UI debounces 250 ms,
**aborts the previous request** so a stale result can never overtake a fresh one, and supports `Ctrl+K` ·
arrows · Enter · Escape.

**3 — "Coming soon" reconciliation.** **Profit & Loss was already implemented** (`reports.service.profitLoss`
+ its preview/export routes) while the Financial Center advertised it as *coming soon* — the card now opens
the existing report (`/reports?type=profit-loss&from&to`), with **no second implementation**. The
**Contracts AI skill** was likewise labelled *coming soon* although it is live in `ai/registry.ts`. Cards for
work **removed from the roadmap** — cloud backup, Document AI/OCR, RAG, local LLM, free SQL — were deleted.
Balance sheet, cash flow, budget comparison, customers and executive-insight skills remain honestly labelled.

**4 — Period-lock coverage: three guards, not twelve.** The audit found most "gaps" were already covered
**transitively** through `createBalancedJournal` / `postEntry` (invoice create/update/delete/approve,
`addPayment`, payroll `markPaid`, journal entries, expenses), and bank-statement import posts nothing at all.
The one real hole was **`payments.correctCollectionDate`** — the only path that rewrites the date of an
**already-posted** journal entry (`updateMany`), bypassing the central guard; it even carried a `TODO` saying
"there is no period-lock system", which had become false. It is now guarded on **both** dates: pulling a
payment *out of* a locked period violates the lock exactly as pushing one *into* it. `invoices.forceRemove`
and `expenses.forceRemove` are guarded too — they are SYSTEM_ADMIN-only so they still pass, but a deletion
from a locked period now leaves a **`PERIOD_LOCK_OVERRIDE`** audit trail instead of no trace.

**5 — Print architecture: closed.** The last three screens on `window.manar.exportPdf` (live-window capture,
which Electron renders **ignoring `@media print`** — the "black frame") now export from the **document**:
`Quotation` (reusing its existing composer), `ReportPrint`, and `ExecutiveDecisionCenter`. The dashboard is a
deliberately dark token subtree, so its print rules now **remap the `--db-*` tokens to white paper inside
`@media print` only** — zero effect on screen, `dashboard.css` untouched. The legacy capture survives solely
as a fallback for a bridge-less environment. **PDFKit retired from the report route**: it never shaped
Arabic, its `Amiri` font is **not in the repository at all**, and no UI caller ever requested `format=pdf`;
the route now answers with an explicit error instead of emitting a broken document. `pdf.service.ts` and the
`pdfkit` dependency are **deliberately left in place** this release (proven unreferenced; deletion deferred
to an explicit decision).

**6 — Documentation reconciled with the code** (this section + the roadmap below). Corrected: Payroll → GL is
**implemented** (posts on `markPaid`, not on approve) and was wrongly marked *UNKNOWN*; **attachments**
exist and were listed as missing; **AP aging** exists and was listed as future; **Profit & Loss** is
implemented; **Smart Transaction Presentation Engine v1** and **Dark Mode Company Logo Replacement v1** are
released.

**Unchanged:** accounting model · approval rules · permissions · audit behaviour · print output · Prisma
schema (no migration) · cheques · ExplorerKit · Electron IPC.

---

## Previous Release — Dark Mode Company Logo Replacement v1

| Field | Value |
|-------|-------|
| **Package** | Dark Mode Company Logo Replacement v1 (branding asset — presentation only) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/dark-mode-company-logo-v1` (kept — not deleted) |
| **Baseline** | `production` @ `3798299` (unchanged during the package — no drift, no conflicts) |
| **Feature commit** | `46440cf` |
| **Production merge commit** | `5f368b4` |
| **Final production HEAD** | `5f368b4` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-dark-mode-company-logo-v1` → merge `5f368b4` (annotated) |
| **Manual visual approval** | **APPROVED** — reviewed in the running app; dark-mode logo appearance accepted as-is |
| **Validation** | frontend `tsc` ✅ · electron `tsc` ✅ · `npm run build` ✅ (both logo assets bundled) · frontend vitest **1416 pass / 0 fail** (91 files) ✅ |

**Release scope — exactly two files.** `frontend/src/components/Layout.tsx` (modified) and `frontend/src/assets/almanar-logo-dark.png` (added). Nothing else.

**The defect.** The existing sidebar logo is a PNG **without an alpha channel** (`colorType 2`), so its solid white background painted a white rectangle over the dark sidebar.

**The fix.** A transparent RGBA copy of the same logo is shown **in dark mode only**; light mode keeps the existing asset, byte for byte. The conditional reuses the theme state already read from `useUI()` in `Layout` (it was already there for the theme toggle) — **no new theme infrastructure, no duplicated branding logic**. The asset was brightened once in the HSV **value** channel (+30%: mean luminance 49.6 → 64.5; dominant `#2E3190` → `#3C40BB`; contrast vs the `#020617` sidebar 1.88:1 → 2.54:1) with **hue and saturation numerically untouched**, so the indigo identity is preserved and no pixel is white (max channel 222/255); alpha was carried over unchanged for all 205,773 fully-transparent and 14,292 anti-aliased edge pixels.

**No layout shift.** Sizing is governed solely by the `.brand-logo` class (untouched); the aspect ratio is 2.393 vs 2.396, a sub-pixel difference at the 190 px render width. Pixel dimensions preserved (773 × 323).

**Unchanged:** all CSS · the sidebar background · `.brand-logo` dimensions / spacing / padding / margins / alignment · the light-mode logo · navigation · layout · typography · ExplorerKit · printing · business logic · Backend / Database / Electron.

**Known unrelated issue (untouched).** The build emits `Unexpected "*" [css-syntax-error]`. It was **independently verified as pre-existing** (the build was re-run with this change stashed and the warning still appeared). It is outside this release scope and was deliberately **not** fixed.

---

## Previous Release — Universal Print Preview Full Controlled Enablement v1

| Field | Value |
|-------|-------|
| **Package** | Universal Print Preview Full Controlled Enablement v1 (feature-flag enablement pack) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/universal-print-preview-full-controlled-enablement-v1` (kept — not deleted) |
| **Baseline** | `production` @ `9472afe` (unchanged during the package — no drift, no conflicts) |
| **Feature commit** | `d70242f` |
| **Production merge commit** | `b51c98e` |
| **Final production HEAD** | `b51c98e` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-universal-print-preview-full-controlled-enablement-v1` → merge `b51c98e` (annotated) |
| **Gemini review** | **APPROVED** — no blocking findings. |
| **Manual verification** | **PASSED** — see below. |
| **Validation** | frontend vitest **1416 pass / 0 fail** (91 files) ✅ · targeted print/preview/cheque suites **391 pass** (20 files) ✅ · new pack file **47/47** ✅ · all known console warnings **0** ✅ · frontend `tsc` ✅ · electron `tsc` ✅ · build ✅ — identical before and after the merge |

**What changed — three booleans.** The three flags left OFF after Phase A are now **ON by default**, each after its own manual gate passed: `PRINT_PREVIEW_LEGACY_FORMS_HR` (Phase B — the eight HR forms), `PRINT_PREVIEW_LEGACY_FORMS_FINANCE` (Phase C — payment voucher · purchase request), `PRINT_CENTER_PHASE2_RECEIPT_VOUCHER` (Phase D — receipt voucher, on its own print path). Phase A stays enabled exactly as it was.

**All nine flags are now ON by default:** `PRINT_CENTER_FOUNDATION_V1` · `PRINT_CENTER_PHASE2` · `PRINT_CENTER_PHASE2_INVOICE` · `PRINT_CENTER_PHASE2_QUOTATION` · `PRINT_CENTER_PHASE2_RECEIPT_VOUCHER` · `PRINT_PREVIEW_LEGACY_FORMS_V1` · `PRINT_PREVIEW_LEGACY_FORMS_SPECIAL` · `PRINT_PREVIEW_LEGACY_FORMS_HR` · `PRINT_PREVIEW_LEGACY_FORMS_FINANCE`. The preview therefore works **on every machine with no local setup** — nothing has to be typed into the console any more.

**The 15 documents now covered:** Invoice · Quotation · Receipt Voucher · Employment Contract · Payroll Payslip · Warning · Leave Request · Performance Evaluation · Resignation · Return to Work · Salary Advance · Salary Certificate · To Whom It May Concern · Payment Voucher · Purchase Request. (Count derived from the code, not estimated.)

**Enabling changes no printing.** The preview stays an **Additive Preview Overlay**: a display layer that delegates to **the very same legacy print function** (`printCurrentView` / `doPrint` / `handlePrint` — same function reference, no copy, no wrapper). The direct Print button stays available at all times. **Kill switches stay active:** `isFlagEnabled = readOverride(name) ?? DEFAULTS[name]`, so `localStorage['manar:flag:PRINT_CENTER_PHASE2'] = 'off'` or `…PRINT_PREVIEW_LEGACY_FORMS_V1 = 'off'` overrides the ON default and disables the whole group instantly — and any single sub-flag can still be turned off on its own. Invalid stored values are ignored and fall back to the default without throwing.

**Receipt Voucher — once only.** The voucher number is issued **once** per print action (`receipt-voucher-number` = a single call) and exactly **one** print job is submitted with that same number — verified for print-from-preview, double-click, and close-without-print (which submits nothing).

**Tests.** OFF coverage was **not** removed: the legacy-path tests now force `off` **explicitly** instead of leaning on the old default. New file `universalPrintPreviewFullEnablement.test.tsx` adds **47 integration tests against the real components** (Salary Certificate · Employee Warning · Leave Request · Payment Voucher · Purchase Request · Receipt Voucher — not a harness): preview opens by default, printing runs **once** with the same settings and identity, double-click does not duplicate, close does not print, direct print stays available, and turning any flag off restores the legacy behaviour verbatim.

**Manual verification — PASSED.** HR form · Payment Voucher · Purchase Request · Receipt Voucher · Invoice (regression) · Employment Contract (regression). Direct print · preview · close without printing · print from preview · double-click protection · Zoom / Fit Width / Fit Page · **printed paper matches the legacy output** — all passed. Receipt Voucher number generated once only; one print job only; master kill switches work; all localStorage overrides removed after testing.

**Unchanged:** `PrintPreviewDialog` · `useLegacyFormPreview` · the composers · print CSS · PDF paths · `printCurrentView` / `doPrint` / `handlePrint` / `submitPrintJob` · Electron IPC · Backend · Database · Prisma · Router · Recharts · Business Logic · document templates. **Cheques and Reports remain outside scope and untouched.** The production change is confined to `DEFAULTS` in `printing/flags.ts` (three values).

**Non-blocking note.** A stale comment in the ten form pages still reads «العلم مطفأ ⇒ لا اعتراض», which is no longer true. Correcting it would touch ten production files and was deliberately left out of this pack — a comment-only follow-up.

---

## Previous Release — Universal Print Preview Controlled Enablement, Phase A v1

| Field | Value |
|-------|-------|
| **Package** | Universal Print Preview Controlled Enablement — Phase A v1 (feature-flag enablement pack) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/universal-print-preview-controlled-enablement-phase-a-v1` |
| **Baseline** | `production` @ `91a3ea7` (unchanged during the package — no drift, no conflicts) |
| **Feature commit** | `11b931e` |
| **Production merge commit** | `0e6ae2e` |
| **Final production HEAD** | `0e6ae2e` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-universal-print-preview-controlled-enablement-phase-a-v1` → merge `0e6ae2e` (annotated) |
| **Gemini review** | **APPROVED** — no blocking findings. |
| **Manual verification** | **PASSED** — see below. |
| **Validation** | frontend vitest **1368 pass / 0 fail** (90 files) ✅ · all known console warnings **0** ✅ · frontend `tsc` ✅ · electron `tsc` ✅ · build ✅ — identical before and after the merge |

**What changed — four booleans.** The print preview is now **ON by default** for the four documents whose side-by-side manual gate passed (legacy vs preview vs the physical page): **Invoice · Quotation · Employment Contract · Payroll Payslip**.

| Default **ON** | Default **OFF** (outside Phase A) |
|---|---|
| `PRINT_CENTER_FOUNDATION_V1` · `PRINT_CENTER_PHASE2` (unchanged) | `PRINT_CENTER_PHASE2_RECEIPT_VOUCHER` — its print path is different (`submitPrintJob` directly, not a delegation), so it earns its own phase and its own check |
| **`PRINT_CENTER_PHASE2_INVOICE`** · **`PRINT_CENTER_PHASE2_QUOTATION`** | `PRINT_PREVIEW_LEGACY_FORMS_HR` — the eight HR forms |
| **`PRINT_PREVIEW_LEGACY_FORMS_V1`** · **`PRINT_PREVIEW_LEGACY_FORMS_SPECIAL`** (contract + payslip) | `PRINT_PREVIEW_LEGACY_FORMS_FINANCE` — payment voucher · purchase request |

**Enabling changes no printing.** The preview remains an **Additive Preview Overlay**: it is a display layer that delegates to **the very same legacy print function** (`printCurrentView` / `doPrint` / `handlePrint` — the same function reference, no copy, no wrapper), and the direct Print button stays available at all times. What changed is that an **optional review step is now visible by default**.

**Kill switch, structurally guaranteed.** `isFlagEnabled = readOverride(name) ?? DEFAULTS[name]` — so `localStorage['manar:flag:PRINT_CENTER_PHASE2'] = 'off'` (or `PRINT_PREVIEW_LEGACY_FORMS_V1`) **overrides the ON default** and disables the whole group instantly, with no release and no rebuild. Without the flag the dialog is not even mounted, so no stray preview button can linger. Drafts and the print log are local and unaffected.

**Tests: OFF coverage was not lost.** Six files asserted "OFF by default" and were updated to the new policy — but the behavioural tests for the legacy path now force `off` **explicitly** (`setFlagOverride`) instead of leaning on the default, so the rollback guard stands. New coverage was added: `override='off'` beats an ON default · `override='on'` enables an OFF-by-default flag · the master still cuts the whole group even when a document's default is ON · the out-of-scope groups remain OFF.

**Manual verification — PASSED.** Invoice · Quotation · Employment Contract (existing employee **and** new-employee print-only) · Payslip. Direct print · print from preview · close without printing · double-click protection · multiple copies · Zoom / Fit Width / Fit Page · connected view · light/dark · PDF export — **all passed**. **No difference in the printed paper** versus the legacy output, no duplicate printing, no truncated document, no employee record created on the manual path. Both kill switches verified. Receipt Voucher, HR and Finance forms stayed OFF; cheques and reports unaffected.

**Unchanged:** `PrintPreviewDialog` · `useLegacyFormPreview` · the composers · print CSS · PDF paths · Electron IPC · Backend · Database · Prisma · Router · Recharts · Business Logic · document templates. The production change is confined to `DEFAULTS` in `printing/flags.ts`.

---

## Previous Release — React Router Start Transition Readiness v1

| Field | Value |
|-------|-------|
| **Package** | React Router Start Transition Readiness v1 — small runtime + tests compatibility pack |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/react-router-start-transition-readiness-v1` |
| **Baseline** | `production` @ `cabd182` (unchanged during the package — no drift, no conflicts) |
| **Feature commit** | `983e923` |
| **Production merge commit** | `f494353` |
| **Final production HEAD** | `f494353` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-react-router-start-transition-readiness-v1` → merge `f494353` (annotated) |
| **Environment** | `react-router-dom` **6.30.4** · `HashRouter` stays (required — Electron loads over `file://`) · React **StrictMode** untouched |
| **Gemini review** | **APPROVED** — no blocking findings. |
| **Manual verification** | **PASSED** — cold-start navigation across Dashboard, Invoices, Expenses, Financial Center, Reports, Payroll, Bank Account Explorer, Cheques and Forms; fast A→B navigation settles on B with no late A; back button, dynamic routes and `#/no-such-page` → `/` all correct; no white screen, no routing loop, no perceptible freeze. |
| **Validation** | frontend vitest **1361 pass / 0 fail** (90 files) ✅ · frontend `tsc` ✅ · electron `tsc` ✅ · build ✅ — identical before and after the merge |

**What the flag does.** `v7_startTransition` wraps router state updates in `React.startTransition`, making them **non-urgent**. The visible effect: when navigating to a lazy page that has not loaded yet, React keeps the **current** page on screen until the new one is ready instead of showing the `<Suspense fallback>` immediately — i.e. **less `PageLoader` flicker**. This is v7's coming behaviour and an **expected UX change, not a defect**; it was released only after an explicit visual check, never bundled into a warning-cleanup pack.

**The change is one effective production line:** `<HashRouter future={{ v7_relativeSplatPath: true }}>` → `<HashRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>`. The nine test files enable the same two flags through the shared `ROUTER_FUTURE` helper — a test running under different flags is testing a different application. A guard test asserts both flags in production **and** in the helper, that every `MemoryRouter` uses the helper, that `HashRouter` / `<Suspense fallback={<PageLoader />}>` / the **48 `lazy()` pages** / the splat route are unchanged, that **no manual `React.startTransition` exists anywhere** (it scans the source tree), and that an unknown route still redirects to `/` while a dynamic route still resolves its param.

**Milestone — the console is clean.** With this release the project's known warnings are **all at zero**: React Router future (**11 → 0**), Recharts `width(-1)` (0), React unique-key (0), `act()` (0), SVG NaN (0). The only remaining dev-console message is Electron's Insecure-CSP notice, which is out of scope for every package in this series.

**Unchanged:** routes and their order · `Navigate` targets · `HashRouter` · `lazy` imports · `Suspense` · `PageLoader` · `Layout`/`Outlet` · JournalBookTable · Recharts · CSS · printing · Backend · Database · Prisma · Electron · Business Logic. No manual `startTransition`, no deferred mounts, no console suppression.

---

## Previous Release — Recharts Initial Dimension Stabilization v1

| Field | Value |
|-------|-------|
| **Package** | Recharts Initial Dimension Stabilization v1 — small presentation stability fix |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/recharts-initial-dimension-stabilization-v1` |
| **Baseline** | `production` @ `ada05b6` (branch point) · merged onto `production` @ `552edad` — no drift, no conflicts |
| **Feature commit** | `7483e5c` |
| **Production merge commit** | `7d6c2b0` |
| **Final production HEAD** | `7d6c2b0` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-recharts-initial-dimension-stabilization-v1` → merge `7d6c2b0` (annotated) |
| **Environment** | recharts **3.8.1** · React **StrictMode** stays on (`main.tsx` untouched) |
| **Gemini review** | **APPROVED** — no blocking findings. |
| **Manual verification** | **PASSED** — charts render at the same size; no 1×1 flash, no layout shift, no empty or clipped charts; window resize, filters and tabs behave as before; Recharts warnings in the Electron console: **0**. |
| **Validation** | frontend vitest **1359 pass / 0 fail** (90 files) ✅ · frontend `tsc` ✅ · electron `tsc` ✅ · build ✅ |

**Root cause — a library sentinel, not a layout bug.** `ResponsiveContainer` initialises its state to `{ width: -1, height: -1 }` (`defaultResponsiveContainerProps.initialDimension`). On the **first render** — before `useEffect` runs and `ResizeObserver` measures — the chart dimensions are derived from that sentinel:

```
calculatedWidth  = isPercent(width)  ? containerWidth  : Number(width)    // -1
calculatedHeight = isPercent(height) ? containerHeight : Number(height)   // -1
warn(calculatedWidth > 0 || calculatedHeight > 0, 'The width(-1) and height(-1)…')
```

The guard is an **OR**, so it only fires when **both** dimensions are ≤ 0 — i.e. for containers passing `width="100%" height="100%"` and no others. That is exactly why the seven containers with a **numeric height never warned**, despite living on the same pages, inside the same flex/grid, under the same CSS. So it was **not** CSS, not DOM measurement, not a hidden tab, not `startTransition`.

**The fix — at the cause, not the symptom.** `initialDimension` — an **official prop** (`@default {"width":-1,"height":-1}`) — is now passed with a positive value to the **15 percent/percent containers only**. The value is `{ width: 1, height: 1 }`: purely initial, replaced by the real measurement as soon as the component mounts, and it never enters the container's own layout (the outer div keeps its percentage `width`/`height`) — so the smallest positive value is the least visually intrusive. A single shared constant (`lib/rechartsDefaults.ts`) replaces what would otherwise be the same literal repeated fifteen times.

**Census (guarded by a test):** **22 containers = 15 percent/percent + 7 numeric-height.** The seven were **not touched** — they never warned.

**Coverage.** Eight tests, including a **negative** one proving the warning *does* fire without `initialDimension` (so the assertion measures something real) and disappears with it, plus one asserting the container **remains percentage-sized** (no heights were moved from CSS into JSX). The `console.warn` spy is used to **assert, never to silence**, with an explicit `mockRestore`.

**Unchanged:** CSS · media queries · parent heights (no height moved into JSX) · chart data and types · axes, tooltips, legends, colours, formatting · filters · API calls · the seven numeric-height containers · `StrictMode` · Router · Suspense · PageLoader · JournalBookTable · printing · Backend · Database · Prisma · Electron · Business Logic. No `minHeight`, no `aspect`, no deferred mount, no console suppression.

---

## Previous Release — Journal Book Table Key Stability Fix v1

| Field | Value |
|-------|-------|
| **Package** | Journal Book Table Key Stability Fix v1 — small corrective fix (one production file + its test) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/journal-book-table-key-stability-fix-v1` |
| **Baseline** | `production` @ `ada05b6` (unchanged during the package — no drift, no conflicts) |
| **Feature commit** | `b244e9e` |
| **Production merge commit** | `af4898e` |
| **Final production HEAD** | `af4898e` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-journal-book-table-key-stability-fix-v1` → merge `af4898e` (annotated) |
| **Gemini review** | **APPROVED** — no blocking findings. |
| **Manual verification** | **PASSED** — Financial Center → journal book: all rows present, expand/collapse works, ordering and totals correct, the React warning is gone. |
| **Validation** | frontend vitest **1351 pass / 0 fail** (89 files) ✅ · frontend `tsc` ✅ · electron `tsc` ✅ · build ✅ — identical before and after the merge |

**Root cause — the key was on the wrong element.** `rows.map()` returned the **shorthand Fragment** `<>`, which **is** the list item — and a shorthand Fragment cannot take a key. The keys sat on the `<tr>` elements **inside** it, where React never looks, so every list item was effectively unkeyed and React warned: *Each child in a list should have a unique "key" prop*. This was neither a missing key nor a duplicate key nor an index key — it was a **keyless Fragment**, with compensating keys one level too deep.

**The fix — narrowest possible.** `<>` → **`<Fragment key={row.id}>`** (`row.id` is the server's official entry identifier `JE-<id>`: stable, unique, and unaffected by sorting, filtering or paging — it is the same key the component already uses for its expand/collapse state). The two inner `<tr>` keys, which had been compensating for the gap, were removed as they no longer serve a purpose (they are static JSX children, not a list). Journal lines carry **no id** in the API contract (only `accountCode` / name / description / debit / credit) and are rendered in server order with no client-side sort, filter or insert — so the index is stable there; it was nonetheless composed with the entry id (`${row.id}-line-${li}`) to stay unique table-wide and semantic.

**Coverage.** Seven tests, including one that renders an entry with **two identical lines** (any content-derived key would collide) and asserts both still render, plus a `console.error` spy — **used to assert, never to silence**, with an explicit `mockRestore`. The tests were verified to **fail** if `<>` is restored, so they measure the real warning rather than a string.

**Unchanged:** data queries · grouping · sorting · filters · pagination · totals · currency and date formatting · entry statuses · export · `FinancialCenter` · Router · Recharts · printing · Backend · Database · Prisma · Electron · Business Logic. The `Fragment` renders no DOM node, so the table markup is byte-for-byte what it was.

---

## Previous Release — React Router Relative Splat Readiness v1

| Field | Value |
|-------|-------|
| **Package** | React Router Relative Splat Readiness v1 — small runtime + tests compatibility pack |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/react-router-relative-splat-readiness-v1` |
| **Baseline** | `production` @ `b130c54` (unchanged during the package — no drift, no conflicts) |
| **Feature commit** | `f42f3d5` |
| **Production merge commit** | `6423422` |
| **Final production HEAD** | `6423422` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-react-router-relative-splat-readiness-v1` → merge `6423422` (annotated) |
| **Environment** | `react-router-dom` **6.30.4** (declared `^6.24.0`). **`HashRouter` stays** — it is required because Electron loads `index.html` over `file://`. |
| **Gemini review** | **APPROVED** — no blocking findings. |
| **Manual verification** | **PASSED** — navigation works, an unknown route redirects to `/`, dynamic routes work, no white screen, no routing loop, `PageLoader` unchanged. |
| **Validation** | frontend vitest **1344 pass / 0 fail** (88 files) ✅ · frontend `tsc` ✅ · electron `tsc` ✅ · build ✅ — identical before and after the merge |

**Why.** React Router v6 emits a `v7_relativeSplatPath` future warning from every router — the production `HashRouter` and the nine test `MemoryRouter`s alike — even though **this project has no relative navigation at all**. The audit proved it: the only splat route (`path="*"`) contains nothing but `<Navigate to="/" replace />` (absolute), and every `navigate(...)`/`Link` in the codebase starts with `/` (the DrillDown and `returnTo` targets come from a fixed table of absolute routes). So the flag's behavioural impact here is **zero**.

**What was done.**
- **One effective production line**: `<HashRouter>` → `<HashRouter future={{ v7_relativeSplatPath: true }}>`.
- **The nine test files** enable the same flag through a two-line helper (`ROUTER_FUTURE`), so tests run with the app's own router semantics — a test running under different flags is testing a different application.
- **A guard test** asserts the flag is on in production, that **`v7_startTransition` is NOT enabled** (in production or in tests), that the router, `<Suspense>`, the 48 `lazy()` pages and the splat route are untouched, that every `MemoryRouter` matches production's flags — and it **scans the whole source tree to prove no relative navigation exists**, which is the structural reason the flag is inert here.
- **Routing coverage**: an unknown route redirects to `/`, a dynamic route (`/forms/employment-contract/:employeeId`) still resolves its param, and there is no routing loop.

**`v7_startTransition` was deliberately NOT enabled.** It wraps router state updates in `React.startTransition`, which makes React **defer showing the `<Suspense fallback>`** when navigating to any of the 48 lazy pages — a **visible change to the loading experience**. That does not belong in a compatibility pack; it needs its own package and its own visual check. The guard prevents it from being switched on by accident.

**Result.** `v7_relativeSplatPath` warnings: **9 → 0**. Total React Router warnings: **18 → 10**. `act()` / Recharts / SVG NaN: **0 / 0 / 0**. The remaining ten `v7_startTransition` notices are **deliberate and measured** — the count rose from 9 to 10 only because the new guard file mounts its own `MemoryRouter` and therefore emits the same (intentionally retained) notice; it is not a regression.

**Unchanged:** route definitions and their order · `Navigate` targets · `Layout` / `Outlet` · sidebar navigation · `lazy` imports · `Suspense` · `PageLoader` · Print Preview · Backend · Electron · Prisma · Database · Business Logic.

---

## Previous Release — Cheque Calibration Geometry Response Hardening v1

| Field | Value |
|-------|-------|
| **Package** | Cheque Calibration Geometry Response Hardening v1 — small corrective fix (one production file + its test) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/cheque-calibration-geometry-response-hardening-v1` |
| **Baseline** | `production` @ `b867f35` (unchanged during the package — no drift, no conflicts) |
| **Feature commit** | `5d6ca22` |
| **Production merge commit** | `63d7f7d` |
| **Final production HEAD** | `63d7f7d` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-cheque-calibration-geometry-response-hardening-v1` → merge `63d7f7d` (annotated) |
| **Gemini review** | **APPROVED** — no blocking findings. |
| **Manual verification** | **PASSED** (product owner) — calibration test sheet renders the four edge rulers, the centre cross, the field crosshairs and boxes; printed output matches the baseline exactly. |
| **Validation** | frontend vitest **1336 pass / 0 fail** (87 files) ✅ · frontend `tsc` ✅ · electron `tsc` ✅ · build ✅ — identical before and after the merge |

**Root cause — a truthiness guard where a shape guard belonged.** `chequeCalibrationTestPrint.test.tsx` mocked `api.get` with a blanket `mockResolvedValue({ data: { data: [] } })`, so **every** GET — including `/cheques/calibration-geometry` — returned an empty array. In `ChequeCalibrator` the response was accepted by `if (g)`, and **`[]` is truthy**, so a "geometry" with no fields entered state. `chequeGeometry`'s equations then read `undefined` from it: `xMm = undefined + (cfg.left / 100) * undefined = NaN`, and that single bad coordinate leaked into **nine derived SVG attributes** (`x1 x2 y1 y2 cx cy x y width`) — which is why there were nine warnings, not nine defects. The server never produces this: every return path of `getCalibrationGeometry` yields a complete object.

**The fix — at the response-acceptance boundary, never at the drawing stage.**
- **`ChequeCalibrator.tsx`**: `if (g)` replaced by an explicit shape guard, `isCalibrationGeometry()`. It accepts only a non-null, non-array object whose **six official `CalibrationGeometry` fields** are present; the four dimensions (`pageWidthMm`, `pageHeightMm`, `chequeWidthMm`, `chequeHeightMm`) must be **finite and positive**, and the two offsets (`offsetXMm`, `offsetYMm`) **finite** (zero and negative are legitimate — an offset may point either way). It **rejects the object whole** — it never patches individual fields and never coerces strings to numbers — so a malformed response leaves `DEFAULT_GEOMETRY` in place, the same safe path the request-failure branch already took.
- **The test mock** now **routes by endpoint**, mirroring the real API contract: the version list for `/cheques/template-versions`, the official imported `DEFAULT_GEOMETRY` for `/cheques/calibration-geometry`, and an explicit failure for any unexpected GET.
- **Ten negative cases** (`[]`, `{}`, `null`, missing field, `NaN`, `Infinity`, string-for-number, zero dimension, negative dimension) prove: no crash · no `Received NaN` warning · **not one SVG attribute holds NaN** · the sheet still draws with the default geometry (matching `viewBox`) · no API write. They were verified to **fail** if the old guard is restored, so they measure something real. A positive case proves valid server geometry (320×220) is still applied.

**Result.** SVG `Received NaN`: **9 → 0**. `act()`: 0. Recharts: 0. React Router future notices: **18, unchanged — out of scope**.

**Unchanged:** the calibration equations (`chequeGeometry.ts` — `fieldMm` / `fieldBoxMm` / `overlayHeightMm`) · `CalibrationTestSheet` rendering · template coordinates · the print system and `printCurrentView` · `PrintPreviewDialog` · Backend · API contract · Database · Prisma · Electron · PDF · payroll · attendance. **No `Number.isFinite` at the drawing stage, no fallback inside `line`/`rect`/`circle`, no forced zeros, no console suppression.** Two files in the entire release.

---

## Previous Release — Test Console Hygiene v1

| Field | Value |
|-------|-------|
| **Package** | Test Console Hygiene v1 — **tests and test infrastructure only** |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/test-console-hygiene-v1` |
| **Baseline** | `production` @ `5aa78df` (unchanged during the package — no drift, no conflicts) |
| **Feature commit** | `c06eb5c` |
| **Production merge commit** | `b11c6d1` |
| **Final production HEAD** | `b11c6d1` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-test-console-hygiene-v1` → merge `b11c6d1` (annotated) |
| **Gemini review** | **APPROVED** — no blocking findings. |
| **Validation** | frontend vitest **1326 pass / 0 fail** (87 files) ✅ · frontend `tsc` ✅ · electron `tsc` ✅ · build ✅ — identical before and after the merge |

**Why.** The frontend suite emitted **46 React `act()` warnings**, and `bankAnalyticsTab.test.tsx` carried an old, never-restored `vi.spyOn(console, 'warn').mockImplementation(() => {})`. The `act()` warnings came from **genuinely correct asynchronous updates**: `<iframe srcDoc>` fires `load` **after** `render` (jsdom defers it) so `PrintPreviewDialog` updates its page count outside `act`; `requestAnimationFrame` inside `doPrint` closes the dialog and delegates on the next frame (an architectural necessity — otherwise the preview window itself would be printed); and `printCurrentView()` returns a promise whose resolution releases the cheque double-click guard.

**What was done.**
- **The `console.warn` suppression was removed outright.** Measurement then proved it was **dead code**: with recharts 3.8.1 the `width(-1)/height(-1)` warning **does not occur at all** — not even when a real chart is rendered with real data and `console.warn` live (**0 occurrences**). **No jsdom dimension shim was added**: it would have been machinery for a non-problem, and a global `clientWidth` override would have broken the preview tests that pin that value deliberately. The real damage was the suppression itself — with no `restore` it blinded the rest of that file to *every* React warning.
- **One small test helper** (`__tests__/helpers/flush.ts`) waits for **what the component actually waits for** — microtasks, then the next animation frame — inside `act()`. No fixed sleeps, no blanket `flushPromises`, no console mocking, nothing turned synchronous.
- **Eight test files** (the seven reported plus `chequeCalibrationTestPrint`, found during measurement) now await that flush at the points where the async update lands.
- **A permanent guard** (`testConsoleHygiene.test.tsx`) blocks the return of any blanket `console.warn`/`console.error` mock without `restore`, any `suppressConsole`, and any text-filtering of the Recharts warning; it also proves `console.warn` is live and that rendering a real chart emits no `width(-1)`.

**Result.** `act()`: **46 → 0**. Recharts: **0, with no suppression**. All changes are under `frontend/src/__tests__/` — **zero production files, zero runtime behaviour change**. `PrintPreviewDialog`, `ChequeCalibrator`, `FormQRCode`, `useLegacyFormPreview`, the print system, Recharts components, `ResponsiveContainer` and the Router were **not touched**.

**Remaining warnings — deliberately out of scope, documented not hidden:** React Router future-flag notices (**18**, unchanged — they affect real routing behaviour and deserve their own package) and `Received NaN for the x1 attribute` in `chequeCalibrationTestPrint.test.tsx` (**9**, unchanged — **present in the baseline**, a different class of defect worth its own audit of the calibration fixture).

---

## Previous Release — Employment Contract "New Employee" Print-Only Restoration v1

| Field | Value |
|-------|-------|
| **Feature** | Employment Contract — manual "new employee" entry restored (print-only) + employee-type step UX |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/employment-contract-new-employee-print-only-v1` |
| **Baseline** | `production` @ `c349625` (unchanged during the package — no drift, no conflicts) |
| **Feature commits** | `6985ffd` (reachability fix) · `c6b8abd` (employee-type step UX) |
| **Production merge commit** | `8a1fff2` |
| **Final production HEAD** | `8a1fff2` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-employment-contract-new-employee-print-only-v1` → merge `8a1fff2` (annotated) |
| **Gemini review** | **APPROVED** — no blocking findings. |
| **Manual verification** | **COMPLETED** — both entry paths, manual print, draft restore, light/dark, and confirmation that no employee record is created. |
| **Validation** | frontend `tsc` ✅ · electron `tsc` ✅ · frontend build ✅ · frontend vitest **1322 pass / 0 fail** (86 files) ✅ — identical before and after the merge |

**Root cause — the feature was never missing; it was unreachable.** `ModeSelector` and `NewEmployeeForm` were fully implemented (the manual employee is built locally with `id: 0` and **no API call**), but the Forms hub treated the employment-contract card as requiring an employee: the print button stayed **disabled** until one was selected, and it then navigated to `/forms/employment-contract/:employeeId`. The contract screen starts from `useState<Mode>(employeeId ? 'params' : 'selector')` — so an incoming id **skips the selector entirely**. There was no path to the option at all. The fix is three effective lines in the Forms hub (`employeeOptional: true`): the card is no longer disabled, and with no employee selected it opens the screen **without an id**, so the selector appears.

**Final behaviour.** `/forms/employment-contract` → the employee-type step (existing employee / new employee — manual entry). `/forms/employment-contract/:employeeId` → the selected employee's contract data **directly, with no selector** — byte-for-byte the previous path (same id, same `printMode`, same autofill, same drafts, printing and preview).

**Print-only, fully isolated.** The manual employee lives only in screen state, the **local** draft store and the **local** print log (which carries `employeeName`, never an id). **No employee record, no `POST`/`PUT`/`DELETE`, no `/employees` query on the manual path, no fabricated id, no schema change and no migration.** Tests assert this behaviourally (spies on `api.post`/`api.put` are never called while the manual form is filled).

**Employee-type step UX (`c6b8abd`).** Added the missing **«الرجوع إلى مركز النماذج»** button (navigates **explicitly** to `/forms` — not `navigate(-1)`, which could land the user anywhere after a deep link or refresh); a quiet header ("عقد العمل" / "اختر طريقة إدخال بيانات الموظف"); a centred `max-width: 860px` container with two equal-height cards, killing the excess empty space; each card is a full `<button>` (whole-card click, keyboard and focus-visible for free) with explicit hover/focus states on theme tokens (light + dark), no gradients or glassmorphism; and an explicit in-card notice: **«لن يتم إنشاء سجل موظف في النظام»**. Styles are scoped to this step (`.ecx-*` in a local `<style>`) — no global rules, and nothing reaches the printed document.

**Unchanged:** Backend (**zero files**) · Electron (**zero files**) · Prisma / migrations · payroll · attendance · the print system, PDF and preview · `useLegacyFormPreview` · the contract template · `handlePrint` · Phase 2 preview bridge · `NewEmployeeForm` and its `id: 0` · `ExistingEmployeeLookup`. Three frontend files in the whole release: `Forms.tsx`, `EmploymentContract.tsx` (the `ModeSelector` component only), and the new test file.

---

## Previous Release — Universal Legacy Print Preview Overlay Rollout, Phase 2 v1 (+ Continuous-View Corrective)

| Field | Value |
|-------|-------|
| **Feature** | Legacy Print Preview Overlay: Employment Contract · Payroll Payslip · continuous-view corrective |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/universal-legacy-print-preview-rollout-phase2-v1` |
| **Feature commits** | `4b4ba90` (Phase 2 sub-flag) · `417613f` (employment contract) · `fda38ef` (payslip: button + auto-print through one gate) · `dd86e25` (tests + receipt-voucher single-gate guard) · `16ad623` (page separation — **fully reverted**) · `dd2908d` (revert + continuous-view notice) |
| **Production merge commit** | `fa6e3a2` |
| **Final production HEAD** | `fa6e3a2` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-universal-legacy-print-preview-rollout-phase2-v1` → merge `fa6e3a2` (annotated) |
| **Gemini review** | Not run — released on the product owner's explicit approval after full manual verification. |
| **Manual verification** | **COMPLETED** — per form: flag OFF (old behaviour incl. payslip auto-print), flag ON (preview opens, no Electron dialog), print-from-preview, close/Esc, zoom, PDF, contract draft-restore (proves `handlePrint` ran in full). |
| **Feature flags** | `PRINT_PREVIEW_LEGACY_FORMS_SPECIAL` (contract + payslip) — **OFF**, gated by the master `PRINT_PREVIEW_LEGACY_FORMS_V1` (kill switch). All preview flags remain OFF. |
| **Validation** | frontend `tsc` ✅ · electron `tsc` ✅ · frontend build ✅ · frontend vitest **1300 pass / 0 fail** (85 files) ✅ |

**Scope — the two forms that do NOT use `FormLayout`.** Their legacy print function is not `doPrint`: the contract's is `handlePrint` (saves a draft, writes the print log, bumps the print counter, then `printCurrentView`), and the payslip's is `printCurrentView` (reached from both the button **and** the ready auto-print). A small adapter in each screen hands **that same function** to the shared `useLegacyFormPreview` as `proceed` — same reference, no copy, no wrapper — so the legacy path stays the sole executor of a physical print and `handlePrint`'s side-effects still fire at print time, not at preview-open time. The payslip's button and auto-print go through **one** gate (the Phase 1 lesson: never wire the button and leave the ready path beside it).

**Receipt Voucher was deliberately NOT bridged.** It already owns a complete preview path with its own flag (`PRINT_CENTER_PHASE2_RECEIPT_VOUCHER`), composer (`composeFromNode` + `RECEIPT_VOUCHER_PAGE_SPEC`) and dialog. Adding the new flag would have produced **two flags governing the same behaviour**. It is classified **B — Existing Independent Preview Path**, left untouched, and guarded by tests asserting its gate stays single.

**Continuous-view corrective.** A visual page separation (`16ad623`) was implemented and then **fully reverted** (`dd2908d`). It sliced at multiples of full A4 height (`translateY(pageH × i)`) while knowing nothing about where Chromium actually breaks pages: it ignored the `@page` margins (the printable band is 277mm on `plain-a4` and **237mm** on `letterhead`, not 297mm), the narrower print box (190mm vs 210mm — different wrapping, different height), and `page-break-before/after` + `break-inside: avoid` — which the employment-contract template declares explicitly. It therefore drew **confidently wrong** page boundaries, which is worse than drawing none. The preview is now a **continuous view** again, page count stays **estimated** (same formula, same `PAGE_EPSILON`), and a toolbar chip states it plainly when `pageCount > 1`: **«عرض متصل — التقسيم النهائي يحدده الطابع»** (UI only — never in `srcdoc`, print, PDF, or the measurement). **No page-break simulation was attempted in this release.**

**Deferred (unchanged):** الشيكات + شاشة المعايرة · `ReportPrint` · `BankReconciliation` · `BankSalaryAnalytics` · multi-page reports · a faithful page-break simulator (needs the real `@page` geometry + break rules; a separate package).

**Unchanged:** Electron (**zero files**) · Backend (**zero files**) · PDF Export · `composeDocument` · `composeStyledFromNode` · `PageSpec` · `@page` · `PAGE_EPSILON` · Business Logic · payroll calculations · KWD formatter · `FormLayout` · Quotation · Invoice · cheques · reports · print templates. No Prisma migration.

---

## Previous Release — Universal Legacy Print Preview Overlay Rollout, Phase 1 v1 (+ Auto-Print Corrective)

| Field | Value |
|-------|-------|
| **Feature** | Legacy Print Preview Overlay on 10 FormLayout forms · Auto-Print Corrective |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/universal-legacy-print-preview-rollout-phase1-v1` |
| **Feature commits** | `5e524ed` (shared bridge + flags) · `f462056` (10 forms wired) · `f813da2` (auto-print corrective) |
| **Production merge commit** | `757a4cb` |
| **Final production HEAD** | `757a4cb` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-universal-legacy-print-preview-rollout-phase1-v1` → merge `757a4cb` (annotated) |
| **Gemini review** | Not run — released on the product owner's explicit approval after full manual verification. |
| **Manual verification** | **COMPLETED** — per form: flag OFF (old behaviour incl. auto-print), flag ON (preview opens, no Electron dialog), print-from-preview, copies > 1, language, profile/letterhead, signature & stamp, Save PDF, zoom, close/Esc. |
| **Feature flags** | `PRINT_PREVIEW_LEGACY_FORMS_V1` (master / kill switch) · `_HR` · `_FINANCE` — **all OFF**. A form previews only when the master **and** its group are on. |
| **Validation** | frontend `tsc` ✅ · electron `tsc` ✅ · frontend build ✅ · frontend vitest **1260 pass / 0 fail** (83 files) ✅ |

**Scope — 10 forms, all `FormLayout` (Category A: direct bridge, no adapter).** HR: إنذار موظف · طلب إجازة · تقييم أداء · استقالة · العودة إلى العمل · سلفة راتب · شهادة راتب · إلى من يهمه الأمر. Finance: سند صرف · طلب شراء.

**Architecture — Additive Preview Overlay** (the pattern shipped in `stable-quotation-legacy-preview-bridge-v1`, extracted once into `useLegacyFormPreview` rather than copy-pasted ten times). The preview is a **display layer**: it never prints, never touches IPC or Electron, never builds a `PrintJob`, and does not know about copies. `FormLayout.doPrint` remains the **sole executor** of a physical print and **its body was not touched**. `printIntercept` was **reused, not duplicated** — no parallel gate. The document is composed from **the very node the legacy path prints** (`.form-page`) via `composeStyledFromNode`, so the preview shows the current on-screen state (language, profile, letterhead, data, notes, signature, stamp); it is never rebuilt from separate data, and there is **one shared composer**, not one per form.

**Legacy path — before:** `Form → FormLayout → Print button *or* auto-print on ready → printCurrentView / doPrint → native Electron dialog`.
**Legacy path — after (flags ON):** `Form → FormLayout → printIntercept({proceed: doPrint, node: .form-page}) → composeStyledFromNode(node) → PrintPreviewDialog → user reviews → Print → dialog closes → proceed() → doPrint → waitForPrintReady → createPrintJob → submitPrintJob → print:submit → printService → webContents.print`. **`proceed === doPrint`** — the same function reference, no copy and no wrapper. **Flags OFF → byte-for-byte the "before" path.**

**Auto-Print Corrective (included in this release).** Eight of these forms auto-print on open. Root cause: that path lives in `useEffect([ready])` and called **`printCurrentView()` directly** — it never went through `doPrint`, so the button's interceptor never saw it, and the native Electron dialog appeared **over** the preview. It was not bypassing the gate; it never met it. Fixed by routing the auto-print through **the same** `printIntercept`: with a gate present it opens the preview and prints nothing; with no gate (flags OFF, and every form outside Phase 1) the original line stands unchanged (`printCurrentView()` immediately). Auto-print was **not removed and not globally disabled**, and the effect still depends on `[ready]` alone (the interceptor is read from a ref, so its timing and run-count are unchanged). A synchronous `openRef` guard prevents a second preview from opening — so auto-print colliding with a manual click yields **one window and one print job**; close/Esc never prints, and a double-click executes once (the dialog's existing guard).

**Deferred to Phase 2 (untouched here):** عقد العمل · قسيمة الراتب (do not use `FormLayout`; they call `printCurrentView()` from their own screens) · سند القبض (already has its own Phase 2 path and flag — bridging it here would double-gate it) · الشيكات + شاشة المعايرة · `ReportPrint` · `BankReconciliation` · `BankSalaryAnalytics` (multi-page / custom paper — need their own page-count and preview handling).

**Unchanged:** Electron (**zero files**) · Backend (**zero files**) · Database · PDF Export · `composeDocument` · `PageSpec` · print templates · Business Logic · calculations · KWD formatter · copies · `PrintProfile` · language · official letterhead · signature & stamp · Invoice Preview · Quotation Preview · cheques · reports. No Prisma migration.

---

## Previous Release — Quotation Legacy Preview Bridge v1 (+ Signature/Seal Theme Contrast Corrective)

| Field | Value |
|-------|-------|
| **Feature** | Quotation Legacy Preview Bridge v1 · Signature/Seal Theme Contrast Corrective |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/quotation-legacy-preview-bridge-v1` |
| **Feature commits** | `9d4743a` (bridge) · `410b1db` (signature/seal contrast) |
| **Production merge commit** | `ca65497` |
| **Final production HEAD** | `ca65497` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-quotation-legacy-preview-bridge-v1` → merge `ca65497` (annotated) |
| **Gemini review** | Not run — released on the product owner's explicit approval after full manual verification. |
| **Manual verification** | **COMPLETED** — flag OFF (old behaviour), flag ON (preview opens, never prints), print-from-preview, copies, close, double-click, zoom, Save PDF, Engine Mode, other forms unaffected. |
| **Feature flags** | `PRINT_CENTER_PHASE2_QUOTATION` = **OFF** · `PRINT_CENTER_PHASE2_INVOICE` = **OFF** — nothing changes by default on upgrade. |
| **Validation** | frontend `tsc` ✅ · electron `tsc` ✅ · frontend build ✅ · frontend vitest **1232 pass / 0 fail** (82 files) ✅ |

**Root cause of the gap this closes.** The Quotation preview was already fully built (`PrintPreviewDialog` + `composeQuotationPreview` + its own flag) but was wired **only inside `previewMode === 'engine'`**, while the screen opens on `'legacy'` — and in legacy the Print button is owned by `FormLayout`, not by `Quotation`. So no path existed from the default Print button to the preview. **The components were not missing; the wiring was in the wrong place.**

**Architecture — Additive Preview Overlay.** The preview is a **display layer only**: it never prints. `FormLayout` gained one optional prop, `printIntercept({ proceed, node })`, which hands the page **its own print path as a value** and lets the caller decide **when** to run it — never **what** it does. `FormLayout.doPrint` remains the **sole executor** of a physical print and its body was not touched: `waitForPrintReady` → `createPrintJob` → `submitPrintJob` → `print:submit` → `printService` → `webContents.print`, with copies passed natively exactly as before. With the prop absent (every other form) the button calls `doPrint` directly — byte-for-byte the previous behaviour.

**Legacy path — before:** `Quotation → FormLayout → Print → doPrint() → waitForPrintReady → submitPrintJob → print:submit → printService → webContents.print`.
**Legacy path — after (flag ON):** `Quotation → FormLayout → Print → printIntercept({proceed: doPrint, node}) → composeQuotationPreview(node) → PrintPreviewDialog (display only) → Print inside the preview → dialog closes → proceed() → doPrint() → …the identical chain above.` **Flag OFF → identical to "before".**

`composeQuotationPreview` was generalised to accept the source node (Engine passes its own root; Legacy passes the `.form-page` handed over by the intercept — **the very node the legacy path prints**), so the preview shows the final document in its current state: language, print profile, paper, line items, notes, signature and stamp. **One composer, not two.** Double-print is prevented by the guards that already existed (the dialog's synchronous `printingRef` + the gateway's in-flight guard) — no new mechanism.

**Signature/Seal Theme Contrast Corrective.** In the print-template screen the options container pinned a light background (`#f8fafc`) while the label colour was left **inherited from the theme** — so in dark mode a light inherited colour landed on a frozen light background: white on white. Background and text were moved onto design-system tokens (`--surface-2` / `--text` / `--text-muted`), which move together with the theme, so contrast is correct in **both** light and dark. Checkbox values, the signature/stamp display logic, and template selection are unchanged.

**Unchanged:** Business Logic · Electron (**zero files**) · Backend (**zero files**) · PDF Export · `composeDocument` · `PageSpec` · copies and print settings · `printCurrentView` · the Invoice experience · every other form. No Prisma migration.

---

## Previous Release — Universal Print Preview v1 (+ Corrective, UX Polish, Final Corrective)

| Field | Value |
|-------|-------|
| **Feature** | Universal Print Preview v1 · Corrective & UI Polish v1 · UX Polish v1 · Final Corrective v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-12 |
| **Feature branch** | `feature/print-center-phase2b-invoice-quotation-v1` |
| **Feature commits** | `6010a13` (Phase 2B) · `01110e2` (PDF-artifact attempt — **fully reversed by the pivot below; its approach does not exist in the released tree**) · `1a3ffc1` (pivot to Universal Print Preview) · `657ecbe` (untrack 3 files) · `e21cef8` (corrective: print button, zoom contrast, KWD) · `1f775d7` (UX polish: zoom controller, canvas, action bar) · `c6c811b` (final corrective: page count + PDF frame) |
| **Production merge commit** | `d197510` |
| **Final production HEAD** | `d197510` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-universal-print-preview-v1` → merge `d197510` (annotated) |
| **Gemini review** | Not run for this package — released on the product owner's explicit approval after full manual verification. |
| **Manual verification** | **COMPLETED** — physical print, print-from-preview, PDF export, Arabic, KWD, single/multi-page all confirmed by the product owner. |
| **Feature flags** | `PRINT_CENTER_PHASE2_INVOICE` = **OFF** · `PRINT_CENTER_PHASE2_QUOTATION` = **OFF** (preview is opt-in; the release changes no default behaviour) |
| **Validation** | frontend `tsc` ✅ · electron `tsc` ✅ · frontend build ✅ · frontend vitest **1211 pass / 0 fail** (81 files) ✅ |

**Architectural decision — the full Print Center is deferred.** The scope is narrower and safer: *a unified preview window before printing, with each page's stable legacy print path kept exactly as it was.* **The preview displays only; it never prints.** Flow: `printable root → composeStyledFromNode → <iframe srcdoc> in the app's own origin → user reviews → Print closes the preview, then calls the page's own legacy print callback.` Explicitly **out of scope and removed**: Print Queue, Batch Printing, Archive, artifact-based physical printing, hidden BrowserWindow PDF printing, `plugins:true`, PDF.js (`pdfjs-dist` uninstalled). Cheques, Reports, Forms and PDFKit are untouched. See `docs/PRINT_DIRECTION.md`.

**Why the artifact path was abandoned** — manual testing proved two blocking defects: (1) **Arabic was corrupted in the preview** because it wrote the document to a temp file loaded over `file://` in a hidden window; the app's dev origin is `http://localhost`, so its fonts could not load cross-origin and Chromium fell back to a system font that cannot shape or join Arabic. (2) **Physical printing produced a blank page** via the `plugins:true` PDF window. The fix was not to patch fonts but to **never leave the app's origin**: `<iframe srcdoc>` in the same document, where the fonts are already loaded.

**Defects fixed after the pivot:**
- **The original «طباعة» button had been replaced** by the preview button. Restored: Print is always rendered, calls `printCurrentView()` directly, and is unaffected by the preview flag. «معاينة قبل الطباعة» is a separate, optional secondary button — preview is never mandatory.
- **Zoom options were unreadable** (white-on-white). Windows/Electron paint `<select>`/`<option>` with OS colours and do not inherit the container's `color`; explicit `color` + `background-color` are now set on both, for light and dark, and for `:checked` / `:hover` / `:disabled`.
- **`KWD 280.000` instead of `280.000 KWD`.** The shared formatter was innocent — `money()` emits the correct order. The cause was **bidi reordering** inside an RTL container. Fixed at the source with `direction: ltr; unicode-bidi: isolate` on the 11 monetary cells, so preview and legacy print agree. **No new formatter, no calculation change.**
- **Zoom was broken** (Fit Width ineffective; at 25% the sheet became a long white rectangle). Root cause: `transform: scale()` **does not change the layout box** — the sheet was given a scaled *width* while its *height* followed the unscaled iframe (1123px × page count). Fixed with a **measured sheet box in both dimensions** (A4 × scale) and an absolutely-positioned iframe that renders at true A4 and is only visually scaled. Fit Width and Fit Page now have independent formulas, recomputed on open / resize / orientation / page-count change; `scrollbar-gutter: stable` prevents width oscillation and horizontal scroll.
- **«الصفحات التقديرية: 2» for a one-page invoice, with a long white extension.** Root cause: page count read `documentElement.scrollHeight`, which **is never smaller than the viewport** — and the iframe's viewport is the height we set (`round(1122.52) = 1123px`), so `ceil(1123 / 1122.52) = 2`. The measurement was measuring the *frame*, not the *document*, and invited a self-referencing loop. Fixed: the sole measurement source is **`[data-print-root]`** inside the composed document (element-level `getBoundingClientRect` + `scrollHeight`; the iframe height never enters the calculation), with `PAGE_EPSILON = 8px` so a sub-pixel overshoot cannot invent a page. A genuine second page still counts as 2.
- **Black frame/bars in exported PDF.** The invoice was still on `pdf:export`, which captures the **live BrowserWindow** with `printToPDF({ printBackground: true })` — and **Electron ignores `@media print` there**, so the app shell's dark background was painted around the invoice. Physical printing was never affected (the print dialog applies `@media print`). Fixed by re-applying the principle established for Forms in `80a1ea3`: export a **standalone HTML document containing only the printable root** through the hidden window (`exportPdfFromHtml` → `pdf:exportHtml`), using **the same composer as the preview** — so what you see is what is saved. `exportPdf` remains only as a fallback. No white overlay, no crop hack, no colour changes.

**Invoice print-screen action bar (presentation-only).** «تحصيل» and «إلغاء» were removed **from this bar only** — neither belongs to the print context, and there is now no destructive action on the print screen. All collection and cancellation logic, permissions, confirmation dialogs, APIs, accounting reversal, status transitions and audit are untouched, and both remain available in the Invoices list (Quick + Danger actions), details, and Drawer. Final RTL order: **رجوع · طباعة · معاينة قبل الطباعة · PDF · وضع التصميم · تعديل · قالب الطباعة**; the secondary row now carries content options (signature, stamp) only. Compact Desktop-ERP sizing is scoped to `.invx-actions` — **no global button change**.

**Unchanged:** `printCurrentView`, `app:print`, Phase 1 gateway (`print:submit`, `print:listPrinters`), `composeDocument`, `PageSpec`, templates, calculations, the shared KWD formatter, Electron (no file changed), cheques, Reports, Forms, PDFKit, Quotation (flag OFF). No Prisma migration.

---

## Previous Release — Print Center Foundation v1 + Phase 2A Universal Preview + Native Copies Fix

| Field | Value |
|-------|-------|
| **Feature** | Print Center Foundation v1 · Print Center Phase 2A — PDF-backed Universal Preview Platform · Native Copies Corrective Fix |
| **Release status** | RELEASED |
| **Release date** | 2026-07-11 |
| **Feature branch** | `feature/print-center-phase2-universal-preview-v1` |
| **Checkpoint tag** | `pre-print-center-foundation-v1` (baseline `12d1e7c`) |
| **Feature commits** | `c6bbe0a` (Foundation v1) · `de97f1b` (pdfjs-dist dependency) · `15d68b0` (native copies fix) · `e52a72d` (Phase 2A implementation) · `c96a13d` (filename sanitizer fix) |
| **Production merge commit** | `0514c7b` |
| **Final production HEAD** | `0514c7b` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-print-center-phase2a-preview-v1` → merge `0514c7b` (annotated) |
| **Gemini review** | **COMPLETED — APPROVED, no blocking findings.** Three independent external reviews: **Foundation v1 — APPROVED** (no blocking findings) · **Phase 2A Universal Preview — APPROVED** (no blocking findings; final recommendation: production merge gated only on manual physical verification) · **Native Copies / FormLayout corrective fix — APPROVED** (no blocking findings, no non-blocking findings, no corrective prompt required). The reviews were conducted outside the repository, so their verdicts were not visible to the release tooling at merge time. **The Gemini gate was not waived.** |
| **Manual physical verification** | **COMPLETED** (reported by the product owner) — this remained the final release gate |

**Scope: an additive printing platform. No existing print path changed its transport, no renderer was rewritten, and cheque printing is untouched. No Prisma migration.**

**(1) Print Center Foundation v1** (`c6bbe0a`) — a typed, versioned `PrintJob` contract; a `PageSpec` registry (`a4-portrait`, `a4-landscape`, `a5-receipt`, `cheque-dynamic`) that is **defined but not yet enforced** (no existing `@page` rule was rewritten — migration is one document type per release); IPC `print:submit`, which delegates to *the same* `webContents.print({silent:false, printBackground:true})` call `app:print` always made, so physical output is unchanged; and `print:listPrinters`. `toPageCss()` **throws** for the dynamic cheque spec, whose geometry is operator-owned calibration data. **Real readiness replaced two arbitrary sleeps** — the 400 ms sleep in the hidden-window PDF pipeline and `PayrollPayslip`'s 500 ms auto-print timer — with `document.fonts.ready` (the signal that actually protects **Arabic shaping**), image decode, an optional `data-print-ready` hook and a painted frame, under a bounded timeout that proceeds rather than hangs. **Audit**: `POST /api/printing/events` writes `PRINT` / `PDF_EXPORT` to the existing `AuditLog` (free-string `action` column → no migration); identity comes from the JWT, **never** from the renderer; an audit failure can never block a print. The route is gated by `authenticate` only and carries **no dedicated permission key** — deliberately: a new `printing.*` key would not exist in any already-deployed database until reseeded, so every non-SYSTEM_ADMIN user would 403, the client would swallow it, and the trail would silently do nothing. **The act of printing remains governed where it always was** (`cheques.print`, `reports.export`, …); this route records an outcome, it does not authorize one.

**(2) Phase 2A — PDF-backed Universal Preview Platform** (`de97f1b`, `e52a72d`) — **THE PREVIEW IS THE ARTIFACT.** `print:preview` renders the composed HTML in a hidden, sandboxed `BrowserWindow` (real readiness → `printToPDF({printBackground:true, preferCSSPageSize:true})`) and **caches the exact PDF bytes**; `print:savePdf` writes *those* bytes, so the preview and the saved file **cannot drift** — there is no second render. `print:releasePreview` frees them. **Bounded by construction**: 12 MB HTML, 80 MB PDF, 4 artifacts / 160 MB LRU cache, 60 s render timeout. **Resource discipline**: hidden windows destroyed in a `finally` on *every* path including throw; temp files in a private `0700` directory, written `0600`, unlinked in a `finally`; everything released on `before-quit`; tokens are 24 random bytes, per-job; **no filesystem path is ever returned to the renderer**. `composeDocument.ts` **wraps an existing renderer** — it clones the printable node (the live DOM is never mutated) and emits **one** `@page` rule from the PageSpec with Cairo inlined; already-self-contained backend report HTML passes through **unwrapped** (avoiding a double `<html>`/`@page`). **Preview UI**: PDF.js, **bundled offline — verified: the worker builds to a local asset and the production bundle contains zero CDN references**. Chromium's built-in viewer was evaluated first and rejected: it exposes no API, so it cannot supply a page count, per-page paper surfaces, zoom presets, fit modes, or a scroll-driven page indicator. Zoom/fit/page navigation are **presentation-only and never regenerate the PDF**. Monotonic request ids mean a slow render **cannot overwrite a newer preview**, and a superseded artifact is released rather than leaked. ExplorerKit, Arabic-first RTL, light+dark shell — **the page itself is always white**, and its drop shadow exists only on screen, never in the PDF. **`PREVIEW_GENERATED` is a distinct audit action from `PRINT`**, so opening a preview can never inflate the print trail; **cancel is recorded as `canceled`, never as success**.

**(3) Native Copies Corrective Fix** (`15d68b0`) — **DEFECT: choosing 3 copies opened THREE separate OS print dialogs and spooled three jobs.** **Root cause was NOT the Print Center** (which already called `submitPrintJob` once and passed `copies` natively): it was the **legacy Forms copies loop** in `FormLayout.doPrint()`, which called `printCurrentView()` once per copy, 1.5 s apart, via *recursion + a timer* — which is why a "no `for` loop" grep would never have found it. Now: **one** `submitPrintJob` carrying `copies`, handed to the driver **natively in a single spool job**. `silent` stays **false** — the OS dialog is still shown; **no silent printing**. Two independent double-click barriers: a **module-level single-flight guard** in the gateway (a second submit while one is in flight is dropped *before it reaches Electron* and resolves as `canceled` — truthful, since nothing was sent; released in a `finally` so a failure cannot wedge it) and a **ref-based guard** in the dialog (component state is async and can be raced by a fast double-click or Ctrl+P). `normalizeCopies()`: integer, ≥ 1, ≤ 99; `undefined`/`NaN`/garbage → 1, applied inside `createPrintJob` so a bad value **cannot reach Electron**. Also fixed (same class, found while tracing): `FormLayout` auto-printed via `setTimeout(…, 600)` — an arbitrary sleep that could open the dialog over a half-laid-out form or before Cairo loaded; it now awaits real readiness. **The auto-print behaviour is unchanged; only the trigger is.**

**(4) Filename sanitizer fix** (`c96a13d`) — the sanitizer's character class contained **raw `0x00` / `0x1f` bytes** written as literals instead of escapes. It behaved correctly, but the raw bytes made Git classify `previewService.ts` and `printService.ts` as **binary**, so the diffs of the two most security-sensitive files in the release were unreviewable. Now explicit `\x00-\x1f` escapes; both files diff as text. It also **stripped hyphens**, which mangled the standard filename `manarERP_<Name>_<Id>_<YYYY-MM-DD>.pdf` (the date became `20260711`). Hyphens, underscores, spaces and dots are now kept; only path separators, Windows-reserved characters, wildcards and control bytes are removed, and a leading dot is stripped so a name can never become a dotfile.

**MIGRATION STATUS — Receipt Voucher is the ONLY Phase 2 migrated document**, behind `PRINT_CENTER_PHASE2_RECEIPT_VOUCHER`, which **ships OFF**. It uses its **existing renderer** and its **existing `@page` geometry** (A4, 12 mm / 15 mm). **Flag hierarchy**: `PRINT_CENTER_PHASE2` (master kill switch, ON — enables nothing by itself) **AND** the per-document flag must both be on. Default OFF means **no user's printing behaviour changed on upgrade**.

**DEFERRED — not implemented, and not claimed:**
- **Invoice, Quotation, Reports, Payroll Payslip and Executive Decision Center migrations.** Each requires its own physical print gate; shipping six unverifiable migrations at once would violate the strangler rule this repo follows.
- **PDFKit retirement — NOT DONE.** `GET /reports?format=pdf` still reaches `buildPdf()`, which produces **unshaped Arabic**. Retiring it safely requires the Reports migration first (so an HTML→Chromium equivalent exists for that route). **Do not treat PDFKit as retired.**
- **Page numbering** — investigated only. `ReportPrint.tsx:55` uses a CSS margin box (`@bottom-center { content: "صفحة " counter(page) … }`); **Chromium does not implement CSS margin boxes**, so this footer has almost certainly never printed. Left in place because it lives in an unmigrated path; it belongs to the deferred Reports package.
- Also **not** implemented: silent printing · batch printing / print queues · PDF archive-on-issue · a dedicated `print_logs` table · any Prisma migration · printer-profile Settings UI · per-bank printer profiles · **any cheque change** (transport, calibration, template versioning, print logs all untouched) · thermal/label printing · PDF encryption / PDF-A / digital signatures · network print queues · visual redesign outside the Print Center.

**Known limitations (disclosed):** `printerName` is carried in the job but **not applied** to the driver (applying it would change physical output — a later phase). There is **no printer-selector UI**. Preview requires Electron; without the preload bridge the Print Center shows an explicit "unavailable" state and the legacy path remains. The Print Center is **untested at scale** — only small documents were exercised; a several-hundred-page report is unverified and bounded only by the 60 s render timeout.

**Files:** 33 changed (+3,865 / −19), all print-related. New: `frontend/src/printing/**` (11 files incl. the shell components), `electron/services/{printService, previewService, renderReadiness}.ts`, `backend/src/modules/printing/**` (4 files), 3 test files (+54 tests). Modified: `electron/{main,preload}.ts`, `electron/ipc/pdf.ipc.ts`, `backend/src/{app,config/constants}.ts`, `frontend/src/api/client.ts`, `frontend/src/forms/shared/FormLayout.tsx`, `frontend/src/pages/{ReceiptVoucher,PayrollPayslip}.tsx`. New dependency: `pdfjs-dist@4.10.38`.

**Validation:** frontend tsc ✅ · backend tsc ✅ · electron tsc ✅ · `build:back` ✅ · `build:front` ✅ · `electron:build` ✅ · frontend vitest **77 files / 1105 pass** ✅ · backend vitest **94 files / 1565 pass** ✅ · PDF.js worker verified bundled locally, no CDN in `dist` ✅ · ESLint **not run** (binary absent in the workspace — pre-existing env gap, not a blocker).

**Rollback:** (1) instant, no rebuild — `localStorage['manar:flag:PRINT_CENTER_PHASE2'] = 'off'` (or `PRINT_CENTER_FOUNDATION_V1 = 'off'` to disable the gateway entirely, restoring the original `printCurrentView()` transport everywhere). (2) `git revert 0514c7b`. (3) Full — reset to `pre-print-center-foundation-v1` (`12d1e7c`). No migration, no schema change, no data change: nothing to unwind.

> **Record correction (2026-07-11).** This release was originally documented as having proceeded with the Gemini gate *waived*. **That was inaccurate.** Three independent Gemini reviews had in fact been completed externally — **Foundation v1: APPROVED**, **Phase 2A Universal Preview: APPROVED** (merge gated only on manual physical verification), **Native Copies / FormLayout corrective fix: APPROVED** (no blocking findings, no non-blocking findings, no corrective prompt required) — but they were conducted outside the repository, so their verdicts were not visible to the release tooling at merge time. **The gate was met, not waived.** This table has been corrected.
>
> Two artifacts created during the release are **immutable and still carry the original, inaccurate wording**, and are deliberately left untouched rather than rewritten:
> - the annotated tag `stable-print-center-phase2a-preview-v1` (object `08d0f32`), whose message reads *"Gemini review: NOT RUN — waived…"*. The tag is **not** being moved or recreated; it continues to point at merge commit `0514c7b`.
> - the docs commit `b30aa15`, whose message contains the same sentence. It is pushed history and is **not** being amended.
>
> **This PROJECT_STATE entry is the authoritative record.** Where it conflicts with the tag or `b30aa15` commit messages on the subject of the Gemini review, **this entry is correct and those messages are superseded.**

---

## Previous Release — Cheque Calibration Sheet: Four-Edge Ruler, Feed-Edge Anchor & Centre Cross v1

| Field | Value |
|-------|-------|
| **Feature** | Cheque Calibration Sheet — Four-Edge Ruler, Feed-Edge Anchor & Centre Cross v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-11 |
| **Feature branch** | `feature/cheque-calibration-edge-ruler-v1` |
| **Checkpoint tag** | `pre-cheque-calibration-edge-ruler-v1` |
| **Feature commit** | `b2e7aac` |
| **Production merge commit** | `caf7d4a` — *Merge Cheque Calibration Sheet — Four-Edge Ruler, Feed-Edge Anchor & Centre Cross v1* |
| **Final production HEAD** | `caf7d4a` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-cheque-calibration-edge-ruler-v1` → merge `caf7d4a` (annotated; not on the docs commit) |
| **Gemini review** | APPROVED — no findings, no release blockers |
| **Physical print UAT** | APPROVED — right-edge anchor matches the real cheque feed direction; four rulers measure accurately against a physical ruler; centre cross correctly centred; 10 cm reference measures exactly 10.0 cm; one page; real cheque prints unchanged with no ruler/cross/feed-arrow/reference |

**Scope: the printed cheque CALIBRATION TEST SHEET only.** Real cheque printing (`pages/Cheques.tsx`, `ChequePrintOutput`, `CHEQUE_PAGE_OFFSET_X_MM = 0`, `CHEQUE_PAGE_OFFSET_Y_MM = 40`), cheque preview, preview scale, stored calibration offsets, saved templates, template versions, database data, print logs and print-count behaviour are **UNCHANGED** — `pages/Cheques.tsx` is not in the diff. **No migration. No backend change.**

**(1) Four-edge physical ruler** — new `components/calibrator/CalibrationEdgeRuler.tsx`. Foreground SVG `<line>`/`<text>` ink in true millimetres (the sheet's `viewBox="0 0 W H"` on a `WmmxHmm` element means 1 user unit = 1 mm at 100% scale). Ticks every 1 mm with a 1/5/10 mm length + stroke hierarchy, generated programmatically (`buildTicks`), Western-digit centimetre numerals (`labelledCentimetres`) suppressed within 18 mm of either end so the four rulers never collide at the corners and **no zero label is printed twice — or at all** (a numeral at 0 mm sits in every printer's non-printable margin). Horizontal rulers measure from the **left** paper edge, vertical from the **top**; opposing rulers align. Corner cleanup insets the **baseline only** — no tick moves, the 0 mm origin and the physical scale are untouched. Memoised on page size so dragging fields in the calibrator does not re-render ~1,000 tick nodes.

**(2) Feed-edge anchor (root-cause fix)** — the physical cheque is fed from the **RIGHT** paper edge, but the sheet drew it hard against the **LEFT**. Root cause: **`offsetXMm` carried two meanings and the outline used the wrong one.** In `fieldMm()` it is the print engine's horizontal **translate offset** (mirroring `CHEQUE_PAGE_OFFSET_X_MM`) — that use is correct and untouched. The outline reused it as *the cheque paper's left edge*, a different physical quantity. New `chequePaperLeftMm(g, rightOffsetMm = CHEQUE_FEED_RIGHT_OFFSET_MM)` returns `pageWidth − chequeWidth − rightOffset` (**122 mm** on A4 landscape with a 175 mm cheque). `rightOffsetMm` is a **named constant, not a stored value** — stored data was deliberately *not* reinterpreted, since a non-zero `offsetXMm` would otherwise push field markers right while pulling the outline left. **No mirroring**: no `scaleX(-1)`, no negative scale, no reversed text or field order — asserted by a test that finds **zero `[transform]` attributes** in the SVG. Cheque-local coordinates, width, height and Y position are unchanged. A bilingual feed-edge indicator (`جهة إدخال الشيك · Cheque Feed Edge` + a `<polygon>` arrowhead, never a banned `<marker>`) marks the insertion side.

**(3) Exact full-page centre cross** — two light **solid** strokes (0.2 mm; solid rather than transparent because printers render opacity inconsistently) at `pageWidth/2` and `pageHeight/2`, running mathematically edge-to-edge and derived from the **active geometry** (`pageCentreMm` / `buildCentreAxes`) — on A4 landscape that resolves to **148.5 × 105 mm**, never hardcoded. Painted **first**, so it sits *behind* the rulers and can never obscure a tick or a numeral. A 1.4 mm circle marks the intersection; no "منتصف الورقة" caption, because on A4 landscape the exact centre falls **inside** the cheque area and a label there would clutter the region being read.

**(4) Scale reference & print contract** — the 10 cm reference stays exactly **100 mm** (end caps at exactly 0 and 100); caps are now **heavier than the line** (they are what gets measured), the block is inset clear of the left ruler lane, and instructions are bilingual (`مرجع قياس فعلي: 10 cm (100 mm)` / `اطبع بحجم 100% وألغِ Fit to Page` / `Print at 100% Actual Size — Disable Fit to Page`). **`@page` size now derives from the active geometry** (`size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0`) instead of a hardcoded `A4 landscape` — a fixed A4 would silently lie the moment a SYSTEM_ADMIN changed the page geometry, and Chromium would scale the sheet to fit, destroying every physical measurement on it. **Isolation:** this `<style>` lives inside `ChequeCalibrator`, which `Cheques.tsx` **unmounts** before any real cheque prints (`{!showCalibrator && …}`), so it cannot reach the cheque print path.

**(5) Consistency diagnostic — deliberately NOT printed** — `chequePaperBoundsMm()` / `fieldBoxMm()` / `fieldsOutsideCheque()` deterministically detect that some `DEFAULT_TEMPLATE` anchors fall outside `DEFAULT_GEOMETRY`'s cheque. **The right-edge anchor exposed this pre-existing contradiction; it did not create it** — the four default fields span ~228 mm (`tafqeet` 16.929 → `numeric` 244.728 mm) while `chequeWidthMm` is 175, which **no box can contain at any anchor**; under the *old* left anchor, `date` and `numeric` were already outside. Repository investigation confirmed the DB overrides nothing (no `cheque.calibration.geometry`, no `cheque.template.*` settings rows exist), so both sources fall back to the source-code defaults. The diagnostic is kept **in code and under test** but is **not rendered**: the operator calibrates visually against the real cheque, the finding does not block that workflow, and a printed warning would clutter a technical measuring instrument and read as if the new anchor were defective. Nothing is clamped, moved, auto-corrected or enlarged.

**(6) Regression guard — retargeted, not weakened** — an earlier ruler/grid attempt on this sheet was drawn with **CSS backgrounds** (`repeating-linear-gradient` + `print-color-adjust`) and repeatedly failed to print, because browsers and printers drop background ink; it was removed and banned wholesale. The failure was the **technique**, not the feature. The guard now bans `linear-gradient`, `repeating-linear-gradient`, `background-image`, `backgroundImage`, `print-color-adjust`, `.chq-diag-*` and `<marker>` (**stronger than before** — the original checked only two of these), while permitting foreground SVG ruler and centre-axis ink. The old blunt `lines.length === 9` assertion is replaced by **scoped** counts that still detect a reintroduced dense grid: exactly **2** centre-cross lines, and exactly **13** lines outside the rulers and the cross (8 crosshair arms + 3 scale-reference strokes + 1 feed arrow + 1 footer rule).

**Files (5):** `components/calibrator/CalibrationEdgeRuler.tsx` (new, 254 lines) · `components/calibrator/CalibrationTestSheet.tsx` · `utils/chequeGeometry.ts` · `components/ChequeCalibrator.tsx` · `__tests__/calibrationTestSheet.test.tsx`. **+1302 / −33.**

**Tests:** the calibration suite grew **12 → 66**, covering ruler geometry (1/5/10 mm spacing read from real SVG coordinates, ticks bounded within the page, Western digits, corner clearance, opposing-ruler alignment, non-A4 page sizes), feed-edge anchoring (formula, flush-right at zero offset, leftward movement as the offset grows, no mirror transform, `offsetXMm` still consumed by `fieldMm()`), centre-cross exactness and paint order, the 10 cm reference, the non-rendered diagnostic, and cheque-print isolation.

**Validation:** frontend tsc ✅ · backend tsc ✅ · electron tsc ✅ · frontend vitest **74 files / 1051 pass** ✅ · backend vitest **94 files / 1565 pass** ✅ · frontend build ✅ · ESLint not run (binary absent in workspace — pre-existing env gap, not a blocker).

**Known follow-up (not in this release):** the `DEFAULT_TEMPLATE` / `DEFAULT_GEOMETRY` contradiction remains. On a machine with real calibrated data the printed sheet will show every crosshair inside the outline; on default data two (`المستفيد`, `المبلغ كتابةً`) sit outside it. Resolving it requires the physical cheque width and the deployed template — both operator-owned values, deliberately out of scope here.

---

## Latest Release — Global Date Input Standardization Audit & Completion v1

| Field | Value |
|-------|-------|
| **Feature** | Global Date Input Standardization Audit & Completion v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-11 |
| **Feature branch** | `feature/global-date-input-standardization-audit-v1` |
| **Feature commits** | `9eafd5d` (component + migration), `48d02ef` (local-today defaults), `1d2d223` (RTL icon-overlap fix) |
| **Production merge commit** | `d981dab` — *Merge Global Date Input Standardization Audit & Completion v1* |
| **Final production HEAD** | `d981dab` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-global-date-input-standardization-v1` → merge `d981dab` (annotated; not on the docs commit) |
| **Gemini review** | APPROVED |
| **Manual visual UAT** | APPROVED (Add Invoice/Expense/Equipment, Edit Equipment/Employee, Contract, Cheque, report filter, dark-mode bank page, Arabic RTL + English LTR, calendar opens, no icon overlap, DD/MM/YYYY visible, save/reopen preserves date, no console/API errors) |

**Canonical interactive date standard:** visible **DD/MM/YYYY** · internal/API **YYYY-MM-DD** (date-only) · **Western digits** · formatting no longer depends on OS/browser locale.

**Scope summary:** Replaced every native `<input type="date">` (which rendered in the OS locale, causing MM/DD/YYYY) across ~30 forms/filters with a shared **`DateInput`** component — a masked DD/MM/YYYY text field plus a hidden native `<input type="date">` used only as the calendar picker. Config-driven forms fixed centrally via `FormDialog` (Equipment, Employee, Contract, Customer, Supplier). All conversions run through pure string helpers in `lib/dateInput.ts` (`isoToDisplay`/`displayToIso`/`normalizeDateOnly`/`isValidDisplayDate`/`isWithinRange`), so date-only business dates never shift a day (Kuwait UTC+3). Fixed the `FormDialog.toInputDate` UTC rehydration day-shift.

**Local-date-safe today defaults:** added `todayDateOnly`/`toLocalDateOnly` in `lib/date.ts` (local `getFullYear/getMonth/getDate`, never `toISOString`) and routed all new-record "today" defaults through them.

**RTL/LTR icon-overlap fix:** the `DateInput` wrapper is pinned `dir="ltr"` so the calendar icon, hidden picker, and the value's reserved padding resolve to the same physical side in both RTL and LTR — the icon trails the LTR value and never overlaps the digits. Surrounding Arabic forms stay RTL; date values stay LTR.

**Safety:** No Prisma migration. No backend change (all 42 files under `frontend/src/`). No GL/accounting change. No payroll formula change. No print/report redesign (only shared date-helper reuse). API date contract unchanged.

**Validation:** frontend tsc ✅ · backend tsc ✅ · focused date tests **54 pass** · frontend vitest **74 files / 997 pass** · backend vitest **1565 pass** · frontend build ✅ · backend build ✅ · ESLint not run (binary absent in workspace — pre-existing env gap, not a blocker).

**Static audit:** 0 visible native date inputs (only DateInput's hidden picker), 0 `MM/DD/YYYY`, 0 raw-ISO editable bindings, 0 UTC-derived local business-date defaults. Intentional remaining UTC uses: `bankStatementParser` (Excel serial built & read in UTC — correct by construction) and `Cheques.fmtDate` (a display formatter — follow-up below).

**Known follow-ups (not in this release):**
1. `Cheques.fmtDate` — review presentation-side timezone safety.
2. Explorer Detail Drawer Date Presentation Audit — ensure read-only drawers never expose raw ISO timestamps.
3. Optional test hardening — explicitly reject pasted `MM-DD-YYYY`.

---

## Latest Release — Historical Salary Transfer Register Integration v1

| Field | Value |
|-------|-------|
| **Feature** | Historical Salary Transfer Register Integration v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-11 |
| **Feature branch** | `feature/historical-salary-transfer-register-fix-v1` |
| **Feature commit** | `76efc77` |
| **Production merge commit** | `67e7d2e` — *Merge Historical Salary Transfer Register Integration v1* |
| **Final production HEAD** | `67e7d2e` (this PROJECT_STATE docs commit sits on top) |
| **Stable tag** | `stable-historical-salary-transfer-register-fix-v1` → merge `67e7d2e` (annotated; not on the docs commit) |
| **Gemini review** | APPROVED |

**Scope summary:** The Payroll month view now surfaces historical imported salary transfers alongside computed payroll. Selecting a past month (e.g. June 2025) lists every beneficiary whose transfer exists in `salary_payments` for that period, rendered structurally read-only (source badge `من سجل التحويل المستورد`, net-only, no fake zeros, no workflow actions).

**Architectural decision:** Two sources preserved by purpose — `payroll` remains the source of truth for in-system computed payroll; `salary_payments` remains the source of truth for historical imported transfers. Composition lives in a backend read model (`payrollMonth.readModel.ts`): non-cancelled computed rows take precedence (no duplicates); identity resolves by unique civilId → unique bank account → unmatched-but-visible (ambiguous identities never auto-merged); period maps via the existing `formatSourceMonth` (no second parser). Imported rows use `imported:<n>` string ids and every `/payroll/:id` mutation route is guarded by `parsePayrollRouteId`, so a synthetic historical row can never be approved, paid, edited, or deleted.

**Safety:** No Prisma migration. No GL/accounting posting change. No payroll formula change. No historical data copied into `payroll`. No current payroll workflow change.

**Validation:** backend tsc ✅ · frontend tsc ✅ · backend vitest **1565 pass** ✅ · frontend vitest **948 pass** ✅ · backend build ✅ · frontend build ✅ · Claude review ✅ · Gemini review APPROVED.

**Known follow-up:** *Historical Payroll UX Guard v1* — disable or clarify the **Generate** action for imported/closed historical periods (it currently remains available on past months; it already refuses to overwrite non-DRAFT rows).

---
