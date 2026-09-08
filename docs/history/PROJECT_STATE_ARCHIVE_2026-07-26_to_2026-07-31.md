# PROJECT_STATE.md — Release-Log Archive

**Archived from:** `PROJECT_STATE.md` (repo root), release-log section
**Rotated on:** 2026-09-08 — *PROJECT_STATE Documentation Rotation & Maintenance v1*
**Date range covered:** `2026-07-31` → `2026-07-26`  (newest first, exactly as it appeared in the live file)
**Release entries in this file:** 41
**First entry in file:** Previous Release — Project-Wide i18n Placeholder Integrity Pack v1
**Last entry in file:** Previous Release — Cheque Management Visual Polish Pack v1

> **Verbatim.** Every section below was MOVED, not rewritten: heading, tables, code blocks and prose
> are byte-identical to the live file before rotation. Nothing was summarised, reformatted or dropped.
> Two entries in this archive still carry a `## Latest Release —` heading; that is how they existed in
> `PROJECT_STATE.md` (they were never demoted to `## Previous Release` by the release that followed
> them). They were preserved exactly rather than silently corrected — see `ROTATION_MANIFEST_V1.md`.

See `docs/history/README.md` for the full archive index.

---
## Previous Release — Project-Wide i18n Placeholder Integrity Pack v1

| Field | Value |
|-------|-------|
| **Package** | Project-Wide i18n Placeholder Integrity Pack v1 (project-wide AST-based audit proving every `t()`/`translate()` call site supplies every placeholder its translation requires, and that AR/EN translations agree on the placeholder contract per key) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-31 |
| **Feature branch** | `feature/project-wide-i18n-placeholder-integrity-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `4d60b3d0` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's audit → implementation → verification → user-approved-release flow |
| **Feature commit** | `82ed45c` |
| **Production merge commit** | `873c3c0` |
| **Stable tag** | `stable-project-wide-i18n-placeholder-integrity-v1` → merge `873c3c0` (annotated) |
| **Reviews** | Full architecture trace of the i18n engine (`lib/i18n.ts`'s `DICT` + `t()`/`useT()`) before any edit → project-wide AST audit (not regex) of all 479 production frontend source files → IMPLEMENTATION → Product Owner manual review — **completed & approved**, release explicitly requested |
| **Validation** | New permanent guard `i18nPlaceholderIntegrity.test.ts` — 32/32 passing · focused affected suites — 99/99 passing · frontend `tsc --noEmit` ✅ |

**Root cause:** `t(key, lang, vars?)` in `lib/i18n.ts` interpolates by replacing `{name}` for every key in the supplied `vars` object, but never validates that the supplied names match the placeholders the translation string actually contains. A caller passing the wrong variable name causes the real placeholder to silently survive interpolation and leak as literal text (`{code}`, `{n}`, `{v}`) into the rendered UI — with no error, warning, or test failure anywhere in the existing suite.

**Audit method:** parsed `lib/i18n.ts`'s `DICT` object literal and every `t()`/`translate()` call site in `frontend/src` via the TypeScript AST (not regex, to correctly handle ES shorthand `{ from, to }`, multi-line calls, and both call signatures — `t(key, vars?)` and `t(key, lang, vars?)`). Of 5,854 calls found, 5,554 were statically resolvable to a literal key and a fully-known set of supplied variable names; 298 dynamic-key calls and 2 unresolved-vars calls were classified and logged, never treated as confirmed defects. AR and EN dictionaries were separately confirmed to hold the identical 4,273 keys with 0 placeholder-set mismatches between locales.

**10 confirmed defects fixed** (caller supplied the wrong variable name; translation text itself was correct and unchanged in every case):
- `api/client.ts` — 4 duplicate-invoice error detail lines: caller passed `value`, all 4 keys require `v`.
- `components/dashboard/command/RecentActivityFeed.tsx` — 3 relative-time labels (`time.minutes_ago`/`hours_ago`/`days_ago`): caller passed `min`/`hr`/`day`, all 3 keys require `n`. This one was user-visible beyond a leaked brace — the Recent Activity timestamps showed no number in either language before the fix.
- `pages/Maintenance.tsx` — 3 accessibility labels (`a11y.maint.record_details`/`fuel_details`/`breakdown_details`): caller passed `equip`, all 3 keys require `code`. Resolved in favor of `code` (not renaming the translations) because the value already being passed was the equipment code, and the sibling key `a11y.maint.spare_part_details` correctly uses `{name}` — proving `{code}` was the intended, correct contract all along.

**Permanent guard added:** `frontend/src/__tests__/helpers/i18nPlaceholderIntegrity.ts` (reusable AST analyzer) + `frontend/src/__tests__/i18nPlaceholderIntegrity.test.ts` (32 tests, one architecture rather than per-key duplication). Asserts AR/EN placeholder-set parity and that every statically-resolvable call site supplies every placeholder its translation requires; reports (never fails on) extra unused caller variables; pins the Maintenance and `lbl.year_prefix` (a previously-released fix) contracts as explicit regression cases. **Known limitation, stated plainly, not hidden:** the 298 dynamic-key call sites (lookup-table/config-driven keys such as `t(STATUS_LABEL[r.status])`) are classified and logged but are **not** statically contract-verified by this guard — this is a deliberate boundary of static analysis, not an oversight.

**Not changed:** the runtime i18n engine (`lib/i18n.ts` — `DICT`, `t()`, `useT()` are byte-identical to before this pack), all translation wording/text, backend (confirmed to have no placeholder-based i18n surface at all), Electron, Prisma/schema/migrations, Administrative Forms, the Document Expiry Excel button.

**Deferred, not caused by this pack:** `formsRegistryTranslationAudit.test.ts` (10 failures) and `currencyHeaderCompleteness.test.ts` (2 failures) were already failing on `production` HEAD before this release — proven by reverting the 3 touched files to their pristine HEAD versions and reproducing identical failures, then restoring. Neither touches i18n placeholder interpolation; both predate and are unrelated to this pack.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched. The approved implementation existed as uncommitted working-tree changes directly on `production` at release time; it was moved onto the feature branch via `git checkout -b` (which carries uncommitted changes when there is no conflict with the target ref) rather than reimplemented — byte-identical content confirmed via empty `git diff` both immediately after the branch switch and again immediately after the commit.

---

## Previous Release — Administrative Forms Preview UX Pack v1

| Field | Value |
|-------|-------|
| **Package** | Administrative Forms Preview UX Pack v1 (replaces the direct-print "طباعة" action on Administrative Forms cards with "فتح" (Open), which routes into the existing WYSIWYG preview architecture at an 80% initial zoom instead of triggering an immediate OS print dialog) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-31 |
| **Feature branch** | `feature/administrative-forms-preview-ux-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `822bb702` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's explicit architecture-trace → implementation → verification → user-approved-release flow |
| **Feature commit** | `ada2d56` |
| **Production merge commit** | `e645f303` |
| **Stable tag** | `stable-administrative-forms-preview-ux-v1` → merge `e645f303` (annotated) |
| **Reviews** | Full architecture trace (Forms.tsx card registry → FormLayout auto-print effect → PrintWorkspace zoom state) proving the exact existing preview/print pipeline before any edit → IMPLEMENTATION → Product Owner manual review — **completed & approved**, release explicitly requested |
| **Validation** | 19/19 new focused frontend tests passing · affected-suite sweep (15 files): 13 passing, 2 pre-existing failures unrelated to this pack deferred (see below) · frontend `tsc --noEmit` ✅ |

**Root cause of the direct-print behavior:** `FormLayout`'s auto-print `useEffect` fired `waitForPrintReady()` → `printCurrentView()` (the OS print dialog) as soon as `ready === true`. Navigating from an Administrative Forms card into a form page — not the card itself — was what triggered the immediate print, for the 8 of 14 registry forms that pass `ready` to `FormLayout`.

**Fix:** added a URL-only intent marker (`?open=preview`, `forms/shared/formOpenIntent.ts`) set exclusively by navigation originating from the Administrative Forms page (`Forms.tsx`'s card action, renamed `handleOpen`). `FormLayout` skips its auto-print effect when the marker is present. `PrintWorkspace` gained an additive, opt-in `initialZoom` prop that seeds the preview's starting zoom (80% via the marker) with no fit-mode override, one-shot only — user zoom actions own the value afterwards, and every fresh preview session (new form, or reopening the same one) starts at 80% again. 12 of the 14 registry forms render through `PrintWorkspace` and get the 80% initial zoom.

**Intentional exceptions — not unfinished work:** `employment-contract` and `receipt-voucher` use their own existing dedicated screens and do **not** render `PrintWorkspace`. For both: "فتح" behavior is correct (no automatic printing occurs, matching every other form), but no artificial 80% zoom or `PrintWorkspace` wrapper was introduced — that would require restructuring their dedicated screens, an architecture change out of this pack's scope.

**Not changed:** print pipeline (`doPrint`, `printCurrentView`, `submitPrintJob`, `webContents.print`), `@page` geometry, margins, paper size, PDF export, `WysiwygPreviewPocDialog` (the separate flag-gated "معاينة دقيقة" preview, unaffected), any non-Administrative-Forms caller of the same routes (e.g. the Cheques → payment-voucher flow, which carries no intent marker and keeps its previous auto-print/fit-to-page behavior), backend, Prisma/schema/migrations, Electron print implementation.

**Deferred, not caused by this pack:** `formsRegistryTranslationAudit.test.ts` and `universalPrintPreviewCorrective.test.ts` were already failing on `production` HEAD before this release (unrelated assertions on `Invoices.tsx` toolbar text and a `t()`-vs-`translate()` call-style expectation); repo-wide `npm run lint` is broken independent of this pack (ESLint 10 requires `eslint.config.js`, repo still has `.eslintrc.*`). None touched or repaired by this release.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Bank Statement Import Server Date Hardening Pack v1

| Field | Value |
|-------|-------|
| **Package** | Bank Statement Import Server Date Hardening Pack v1 (hardens the bank-statement-import server boundary so transaction dates are deterministic and validated before reaching business logic, closing a deferred risk from the Project-Wide Date Display, Export & Import Consistency Pack v1 audit) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-31 |
| **Feature branch** | `feature/bank-statement-import-server-date-hardening-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `bf6e10b2` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's explicit trace → implementation → verification → user-approved-release flow |
| **Feature commit** | `c47c3a7` |
| **Production merge commit** | `60c63a23` |
| **Stable tag** | `stable-bank-statement-import-server-date-hardening-v1` → merge `60c63a23` (annotated) |
| **Reviews** | Full runtime-path trace (uploaded file → frontend parser → request payload → schema → service → persistence) proving the exact client → server contract before any edit, confirming 4 live bare `new Date(str)` call sites sharing one unvalidated schema field → IMPLEMENTATION → Product Owner manual review — **completed & approved**, release explicitly requested |
| **Validation** | backend `tsc --noEmit` ✅ · `bankStatementImport` module suite 5 files/226 tests passing (211 pre-existing + 15 new) · mutation-tested: reverting the fix fails exactly the 8 tests designed to catch it · frontend untouched, no frontend `tsc` needed |

**Root cause:** `StatementTransactionSchema.statementDate`/`.postingDate` (and the request-level `fromDate`/`toDate`) were validated as `z.string().max(32).nullable()` — any string at all — and later reached bare `new Date(str)` at 4 sites: `service.ts` persistence insert and `fromDate`/`toDate` derivation, `validators.ts`'s `checkDate`, and `dedupDetector.ts`'s `fetchSnapshot` (via `classifyRows`, reachable from both preview and execute). A crafted request, future caller, or parser regression could let V8's non-standard `MM/DD/YYYY` heuristic silently misread a date. Traced first: the trusted frontend parser (`bankStatementParser.ts` `parseDateStr`) already normalizes every legitimate bank-file date shape into canonical `YYYY-MM-DD` (or `null`) before the request is built — proving the client → server contract was already canonical, so no frontend change was needed.

**Fix:** reused the released `dateOnlySchema` (API Date Hardening Pack v1) — no competing validator — composed with one extra `.transform()` back to a canonical string (`bankStatementDateOnly` in `schema.ts`), since every downstream consumer in this module (`previewBuilder.ts`, `dedupDetector.ts`, `fingerprint.ts`, `matcher.ts`, `reconciliationEngine.ts`) treats these dates as `YYYY-MM-DD` strings, not `Date` objects. Applied to `StatementTransactionSchema.statementDate`/`.postingDate` and to `PreviewRequestSchema`/`ExecuteImportSchema`'s `fromDate`/`toDate`. Once the schema guarantees the string is unambiguous, all 4 downstream `new Date(str)` calls become safe by construction — none of those 4 call sites needed to be touched.

**Not changed:** frontend (none touched — client already canonical), bank source-file date formats, historical imported records, the dead/test-only `parser.ts` mirror, AHLI_UNITED/UNKNOWN `dateFormats` findings, Generic Importer, Payroll Bank Import, Prisma schema/migrations, DB data.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Project-Wide Date Display, Export & Import Consistency Pack v1

| Field | Value |
|-------|-------|
| **Package** | Project-Wide Date Display, Export & Import Consistency Pack v1 (standardizes user-facing calendar-date rendering to `DD/MM/YYYY` across Excel/PDF report exports and frontend displays, fixes a silent date-drop in the employees/equipment import validators; corrective pass closed a live MM/DD misread + UTC day-shift in the payroll bank import parser) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-31 |
| **Feature branch** | `feature/project-wide-date-display-export-import-consistency-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `64cdaf21` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's explicit audit → implementation → corrective pass → verification → user-approved-release flow |
| **Feature commit** | `4b5dda7` |
| **Production merge commit** | `174883aa` |
| **Stable tag** | `stable-project-wide-date-display-export-import-consistency-v1` → merge `174883aa` (annotated) |
| **Reviews** | Full project-wide audit of date formatting/export/import sites classified A–F (display / export / import / internal-API / timestamp / filename) before any edit; a corrective pass added after the audit surfaced one unresolved live ambiguity (payroll bank import) → IMPLEMENTATION → Product Owner manual review — **completed & approved**, release explicitly requested |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · new/extended tests (dateDisplayConsistency 17, importDateValidation 11, date.test.ts +10, payrollBankImportParser +12) all passing · affected backend suites 36 files/754 tests passing · affected frontend suites passing · corrective-pass fix mutation-tested (reverting fails 7 of 12 new payroll-bank tests) |

**Root cause (display/export):** the canonical `formatDisplayDate`/`dateDisplay.ts` helpers already existed and were correctly used almost everywhere, but several sites bypassed them — raw `toISOString().slice(0,10)` (leaking the internal `YYYY-MM-DD` wire format to a user-facing cell or subtitle, and in `summary.utils.formatDate`'s case also reading the **UTC** day, shifting a locally-stored midnight date backward a day in Kuwait's UTC+3), and `toLocaleDateString('ar-KW')` (Arabic-Indic digits + embedded RTL marks, violating the project's Western-digit standard). `excelStyle.ts`'s `DATE_FORMAT` was literally `'yyyy-mm-dd'`, applied to every real Excel date cell and every `type:'date'` column.

**Root cause (import):** the employees/equipment import validators parsed dates via `parseImportDate(v) ?? undefined`, silently dropping an unparseable date and importing the row as **valid** with the date missing — while the sibling contracts/expenses/invoices validators already raised a row-level error for the identical condition.

**Root cause (corrective pass — payroll bank import):** `payrollBankImportParser.ts`'s `parseDateValue` was bare `new Date(String(v))`, carrying an MM/DD misread (proven day-first contract: the backend twin `excelParser.ts` parses the identical `paymentDate` column from the identical bank templates and was already fixed against this exact literal), a UTC-vs-local day shift on Excel date cells capable of misfiling an entire payroll batch into the wrong month, and no Excel-serial support.

**Fix:** routed every confirmed display/export site through the existing canonical helpers (`formatDisplayDate` backend/frontend, `dateAr` in `reports.service.ts`); changed `DATE_FORMAT` to `'dd/mm/yyyy'` (real date cells keep their type — sorting/calculation preserved); gave employees/equipment the same row-error mechanism their siblings already have; made `parseDateValue` delegate to `parseFlexibleDate`, which gained an explicit ISO branch and a calendar round-trip (`utcCalendarDate`) that rejects impossible dates instead of silently rolling them over.

**Not changed:** `dateOnlySchema`/API Date Hardening contract, Backend Date-Boundary semantics, `FinancialPeriod`/Month Selector, `DateInput`'s `YYYY-MM-DD` value contract, `ExpirationRecord.expiryDate` (frontend sorts on it — only its Excel export mapping changed), timestamps (`createdAt`/`updatedAt`, attendance `checkIn`/`checkOut`), filename dates, Prisma schema/migrations, DB data. Generic importer's ambiguous MM/DD compatibility gap, bank-statement server-side date trust, the inert backend `payrollBankImport/excelParser.ts` follow-up, `printI18n` dead code, and legacy salaries bank import were all explicitly identified and left deferred (logged, not fixed) per instruction.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — API Date Hardening Pack v1

| Field | Value |
|-------|-------|
| **Package** | API Date Hardening Pack v1 (hardens backend DATE-ONLY API fields to a canonical `YYYY-MM-DD` contract, replacing `z.coerce.date()` — which called `new Date(value)` and let ambiguous slash-formatted strings fall into the JS engine's non-standard heuristic date parser) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-31 |
| **Feature branch** | `feature/api-date-hardening-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `badfcf98` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's explicit audit → implementation → verification → user-approved-release flow |
| **Feature commit** | `1c2eb79` |
| **Production merge commit** | `d3a937b7` |
| **Stable tag** | `stable-api-date-hardening-pack-v1` → merge `d3a937b7` (annotated) |
| **Reviews** | Full backend audit of every `z.coerce.date()`/`z.date()` occurrence (16 files, 40 fields) classified against DATE-ONLY / DATE-RANGE / TRUE-TIMESTAMP / internal / import-parser buckets, plus a traced frontend-caller compatibility check per field, before any schema was touched → IMPLEMENTATION → Product Owner manual review — **completed & approved**, release explicitly requested |
| **Validation** | backend `tsc --noEmit` ✅ · 74 focused test files / 913 tests passing (0 failures) · `npm run build:back` not run (not materially needed) · frontend/electron untouched (backend-only pack) |

**Root cause:** `z.coerce.date()` passes the raw input straight to `new Date(value)`. A bare `YYYY-MM-DD` string is unambiguous per ECMA-262 (always parsed as UTC midnight), but any other shape — `DD/MM/YYYY`, `MM/DD/YYYY`, a 2-digit year — falls into the JS engine's implementation-defined heuristic parser (V8 assumes US `MM/DD/YYYY`), so "2 August" could silently become "8 February", or resolve to a silent `Invalid Date`. This was the exact mechanism behind the Printed Cheque Edit Date Integrity Fix that preceded this pack.

**Fix:** one shared validator, `backend/src/core/utils/dateOnly.ts` (`dateOnlySchema`) — canonical-prefix regex match (`/^(\d{4})-(\d{2})-(\d{2})/`, mirroring the existing `dateWindows.ts` `DATE_ONLY_PREFIX` precedent) → pure-arithmetic real-calendar-date check (leap year + days-in-month, no `Date` rollover) → `Date.UTC(y, m-1, d)` construction. Replaced `z.coerce.date()` with it on every confirmed DATE-ONLY business field across cheques, invoices, equipment, employees, employee-entitlements, holidays, payments, payroll, expenses, prices, maintenance, contracts, transactions and accounting (40 fields, preserving every field's exact `.optional()`/`.nullable()` contract). Every frontend caller for every field was traced first and confirmed to already send canonical `YYYY-MM-DD` or `new Date('YYYY-MM-DD').toISOString()` — both accepted unchanged; no caller required a compatibility exception.

**Not changed:** `attendanceSchema`/`updateAttendanceSchema`'s `checkIn`/`checkOut` — genuine `HH:MM` time-of-day, not date-only, left on `z.coerce.date()` intentionally. Date-range filters (`periodQuerySchema`/`resolvePeriod`, Backend Date-Boundary Unification Pack v1) are untouched. Cheque printing/templates/geometry, CSV import date handling, Excel/date-display helpers, DD/MM/YYYY UI, `FinancialPeriod`/Month Selector, Prisma schema/migrations, and any DB data are all untouched.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Financial Period Custom Range State Fix v1

| Field | Value |
|-------|-------|
| **Package** | Financial Period Custom Range State Fix v1 (fixes `PeriodControl`'s custom-range fields going stale: they were seeded only in a `useState` initializer at mount and never re-seeded while the control stayed mounted across shared-period changes) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-31 |
| **Feature branch** | `feature/financial-period-custom-range-state-fix-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `677fd18b` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's explicit investigation → implementation → verification → user-approved-release flow |
| **Feature commit** | `4e4f6ee` |
| **Production merge commit** | `bfcae728` |
| **Stable tag** | `stable-financial-period-custom-range-state-fix-v1` → merge `bfcae728` (annotated) |
| **Reviews** | Traced the stale-state path in `PeriodControl`/`FinancialPeriodContext` before touching code (proved the `useState`-initializer-only seed, no `useEffect` re-sync) → IMPLEMENTATION → Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | frontend `tsc --noEmit` ✅ · `PeriodControlMonth.test.tsx` 27/27 passing (21 pre-existing + 6 new) · mutation-tested: reverting the fix fails 3 of the 6 new tests · related suites (`financialPeriodSession`, `FinancialPeriodContext`, `financialPeriod`, `periodSingleSource` — 53 tests) unaffected · `npm run build:front` not run (not materially needed — no new imports/types) · backend/electron untouched (frontend-only fix) |

**Root cause:** `customFrom`/`customTo` were seeded with `useState(period.fromDate ?? '')` / `useState(period.toDate ?? '')` — initializers that run exactly once, at mount. `PeriodControl` is mounted at the top of long-lived pages (Dashboard, Invoices, Expenses, Accounting, Cheques, Reports, FinancialCenter, ExecutiveDecisionCenter) and stays mounted while the shared `FinancialPeriod` changes underneath it via presets, the month selector, or reset — none of which remount the component. `toggleOpen` already re-seeded `monthYear` on panel open; the custom-range fields were the one piece of local draft state left out of that re-seed, so they could silently hold a stale range from an earlier period and have it committed by Apply instead of the currently active one.

**Fix:** re-seed `customFrom`/`customTo` from `period.fromDate`/`period.toDate` at the exact point `monthYear` is already re-seeded — inside `toggleOpen`, only on the transition into `open`. No new state, no new hook, no `useEffect`. This preserves the existing "re-seed on open only" contract: an in-progress edit stays stable for the lifetime of one open session (verified by a test that forces both a local re-render via the year stepper and an external period change from outside the panel while it stays open — the draft survives both, which a naive continuous-sync fix would not), and each new open reflects whatever period was last actually committed.

**Not changed:** Month Selector behavior (buttons, year stepper, `preset:'month'`, historical years, immediate apply-and-close), any preset, backend date-boundary logic, Reports/Excel/API date handling, Prisma schema/migrations, Google Drive sync, or any other page/module.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Financial Period Month Selector Pack v1

| Field | Value |
|-------|-------|
| **Package** | Financial Period Month Selector Pack v1 (replaces the shared `PeriodControl`'s "سنة محددة" specific-year section with "شهر محدد" — 12 month buttons producing a complete calendar-month range, plus a compact year stepper preserving one-click historical-year reach) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-31 |
| **Feature branch** | `feature/financial-period-month-selector-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `162fceb0` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's explicit implementation → corrective pass → verification → user-approved-release flow |
| **Feature commit** | `45efbb5` |
| **Production merge commit** | `867a4889` |
| **Stable tag** | `stable-financial-period-month-selector-v1` → merge `867a4889` (annotated) |
| **Reviews** | Architecture inspection (confirmed `FinancialPeriodContext`/`PeriodControl`/session persistence unchanged since the prior audit) → user decision on year-source conflict (year stepper, not a silent current-year fallback) and Apply model (immediate, matching the buttons replaced) → IMPLEMENTATION → Product Owner manual visual review — found a defect, addressed in a CORRECTIVE PASS (below) → re-review — **completed & approved**, release explicitly requested |
| **Validation** | frontend `tsc --noEmit` ✅ · 6 affected period-related test files / 85 tests passing · full frontend suite matches documented baseline (25 pre-existing failures, unchanged set; +36 new tests, all passing) · `npm run build:front` ✅ · backend/electron untouched (frontend-only pack) |

**Architecture decision — year source:** removing "سنة محددة" would also have removed the only one-click path to a historical year (2020–2026), and the brief explicitly forbade silently pinning month selection to the system's current year. Presented the conflict to the user with three options (year stepper in the section header / read-only year label / keep both sections); user selected the **year stepper**. It seeds from the active period's year on each panel open (explicit selection → active range's end year → today), is clamped to `[2020, currentYear]` — the same reach the old year buttons had — and is re-seeded only on open (not on every re-render), so arrow-navigation within one open session isn't overwritten.

**Month semantics:** `preset:'month'` (`selectedMonth`, 0-based) added to the `FinancialPeriod` model. Bounds derive from the existing `firstOfMonth`/`lastOfMonth` helpers ("day zero of the next month") — no hardcoded month lengths; February resolves to 28 or 29 by the calendar itself, December stays inside its own year (month 12 normalizes to January of `y+1` then steps back one day). All bounds emitted as local `YYYY-MM-DD` strings via the existing `formatFileDate` — no UTC conversion. Selecting a month applies immediately and closes the panel, matching the interaction model of the buttons it replaces (and every other preset) — Apply continues to govern only the custom-range fields, unchanged.

**Shared state:** `setMonth(year, month)` added to `FinancialPeriodContext` alongside the existing `setYear`/`setPreset`/`setCustomRange`, going through the identical `apply()` → `computePeriod` → `setPeriod` → `writeStoredPeriod` path — no new state, no per-page month state. `'year'`/`setYear` deliberately kept intact (not removed) so a session saved before this pack still restores correctly instead of silently dropping to the current year. `sessionStorage` semantics, corruption fallback, and the 8 existing consumers (Dashboard, Invoices, Expenses, Cheques, Reports, Accounting, FinancialCenter, ExecutiveDecisionCenter) are unchanged.

**CORRECTIVE PASS (found during manual visual review):** the Expenses page's "year" summary card rendered the literal string `سنة {y}`. Root cause traced to `lbl.year_prefix`'s i18n string (`'سنة {y}'`) not matching the variable name the call site passed (`{ year: … }`) — a pre-existing defect unrelated to the Month Selector or the shared period state. Fixed the placeholder to `{year}` in both languages (2 lines). Confirmed via backend trace that this card intentionally reflects an absolute current-year window (`stats.periods.currentYear`, computed with the period filter stripped by existing backend design) rather than the newly-added month selection — so the fix is scoped to the literal-placeholder bug only, no behavior change to what the card reports. A parallel scan of every `t(key, {vars})` call site against its string's placeholders found one more instance of the same defect class (`a11y.maint.*_details` in `Maintenance.tsx`, an `aria-label` not visible UI) — logged only, different feature, out of scope per instruction.

**Not changed:** any backend file, `dateWindows`/`periodFilter` boundary logic (Backend Date-Boundary Unification Pack v1, released immediately prior), `DateInput`, Reports/Excel/API date handling, Prisma schema/migrations, cheque printing, payroll, Google Drive sync, PeriodControl's visual design language (colors, spacing, radii, shadows, dialog dimensions), presets, custom range, or the Apply button's governing logic.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Backend Date-Boundary Unification Pack v1

| Field | Value |
|-------|-------|
| **Package** | Backend Date-Boundary Unification Pack v1 (unifies date-range filtering semantics — the interpretation of a user-selected `from`/`to` into `{gte, lte}` — into one canonical local-calendar contract shared across the backend) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-31 |
| **Feature branch** | `feature/backend-date-boundary-unification-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `a39e14a5` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — proceeded directly per this pass's explicit implementation → verification → user-approved-release flow |
| **Feature commit** | `5b87728` |
| **Production merge commit** | `d7f8080a` |
| **Stable tag** | `stable-backend-date-boundary-unification-v1` → merge `d7f8080a` (annotated) |
| **Reviews** | Exhaustive backend sweep (classified all 29 date-range boundary occurrences as user-facing range / true-instant / import-semantics / unclear before touching any of them) → IMPLEMENTATION → regression proof via mutation testing (reverting the fix makes the new parity guards fail) → Product Owner manual review — **completed & approved**, release explicitly requested |
| **Validation** | backend `tsc --noEmit` ✅ · 149 test files / 2155 tests passing (baseline 144/2102, zero pre-existing failures) · `npm run build:back` ✅ · frontend untouched (backend-only pack) |

**Root cause:** every backend module parsed a user-selected `from`/`to` date-only range independently. Three incompatible conventions coexisted: `new Date('YYYY-MM-DD')` (UTC midnight — in Kuwait, UTC+3, this starts the range at 03:00 local, silently dropping the first 3 hours of day one), `endOfDay(new Date('YYYY-MM-DD'))` (correct only by accident — right on a non-negative UTC offset, wrong on a negative one), and a bare `new Date(to)` with no `endOfDay` at all (Transactions ledger/list, Audit log — truncating the entire final day at 03:00 local). The same PeriodControl-selected range could therefore return different rows depending on which endpoint answered it.

**Fix:** one canonical contract in `backend/src/core/utils/dateWindows.ts` — `startOfLocalDay()` / `endOfLocalDay()` / `localDateRange()` — built from explicit local calendar components (`new Date(y, m-1, d, …)`), so the result never depends on the engine's interpretation of a date-only ISO string as UTC. `resolvePeriod()` (`core/utils/periodFilter.ts`) now delegates to it, and every divergent site was routed through the same helper: Expenses (list/stats), Reports (generic `dateWhere` + profit-loss + receivables-aging + customer-balances), Accounting (journal/payments), Transactions (list/ledger), Audit log, Financial (statement/AR aging/AP aging/GL statement/GL report/trial balance — including making the opening-balance cutoff share one exact instant with the period query, a previously-unnoticed second bug that would have caused double-counted or dropped journal lines even after fixing only the `lte` half), Salaries bank analytics, Employee attendance, and Bank statement import/reconciliation filters. Cheques and Invoices were already correct; routed through the shared helper only to remove duplicate private builders — no behavior change (confirmed via their existing behavior-based tests, unmodified and still passing).

**Explicitly out of scope for this pack (per instruction) — logged for a future pack, not fixed:** `z.coerce.date()` API-boundary date hardening (~45 business-date schema fields, including `chequeDate`, remain silently invertible on ambiguous DD/MM input via a non-backend caller); Excel `DATE_FORMAT = 'yyyy-mm-dd'` and the forced-override on raw `Date` values; the four divergent ISO→display formatting helpers; remaining `toLocaleDateString('ar')`/`toLocaleDateString('ar-KW')` sites; the "سنة محددة" → "شهر محدد" Month Selector UI change; frontend, Prisma schema/migrations, and every other module untouched by the sweep.

**Timezone verification:** full backend suite green under this host's actual zone (Asia/Kuwait, UTC+03:00). A genuine negative-offset process run (e.g. `TZ=America/New_York`) could not be executed — Node ignores `TZ` on this Windows host, and no WSL/Docker Linux runtime is available. Compensated structurally: every new/updated assertion compares local calendar components only (never an absolute UTC instant — the flaw in the prior pack's tests, which asserted `getHours() === 23` without checking the day), and one test computes the host's own UTC offset and asserts that the legacy `endOfDay(new Date(s))` pattern matches the correct contract only when that offset is non-negative — a check that actively fails on a negative-offset host if the old pattern is ever reintroduced. Recommended follow-up: run `npm test` in `backend/` on a Linux CI runner or a negative-offset-zoned machine to close this gap empirically.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` (staged file-by-file, not `git add -A`) and confirmed still present, unstaged, and unmodified in the working tree after the merge. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Printed Cheque Edit Data & Date Integrity Fix v1

| Field | Value |
|-------|-------|
| **Package** | Printed Cheque Edit Data & Date Integrity Fix v1 (fixes `chequeDate` blanking/silent-corruption when opening an existing cheque — including a PRINTED one — for editing) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-31 |
| **Feature branch** | `feature/printed-cheque-edit-date-integrity-fix-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `5bd908d0` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — a focused, self-contained fix reviewed across its own root-cause → implementation → verification lifecycle instead of a separate checkpoint tag |
| **Feature commit** | `99168145` |
| **Production merge commit** | `ed63d9fd` |
| **Stable tag** | `stable-printed-cheque-edit-date-integrity-fix-v1` → merge `ed63d9fd` (annotated) |
| **Reviews** | ROOT CAUSE INVESTIGATION (traced DB → API → form → `DateInput` → save payload → backend coercion → DB → reprint end to end) → IMPLEMENTATION → regression proof via temporary revert (8/13 new tests fail against the reverted buggy code, exactly the affected paths) · Product Owner manual review — **completed & approved**, release explicitly requested |
| **Validation** | frontend `tsc --noEmit` ✅ · new suite `chequeEditDateIntegrity.test.tsx` 13/13 ✅ · full frontend vitest suite: 2540/2565 passing, 25 pre-existing unrelated failures (identical set to baseline, zero new regressions) · `npm run build:front` ✅ · backend untouched (the defect never reached it as anything other than an already-malformed input) |

**Scope — closes one root cause with two symptoms, 2 files:**

`loadChequeIntoForm()` (`frontend/src/pages/Cheques.tsx`) seeded `form.chequeDate` with a DD/MM/YYYY **display** string (`formatDisplayDate`/the file's local `fmtDate`), while `DateInput` and `handleSave`'s save payload both require the canonical `'YYYY-MM-DD'` ISO contract defined in `lib/dateInput.ts`. Two symptoms followed from that one mismatch: (1) `DateInput`'s internal `isoToDisplay(value)` returns `''` for anything not already ISO, so the date field rendered **blank** every time an existing cheque's edit form opened; (2) if the user left the (apparently blank) date field alone, `handleSave` forwarded the raw DD/MM/YYYY string to the API unconverted, and the backend's `z.coerce.date()` parsed the non-ISO slash-separated string via V8's ambiguous MM/DD/YYYY heuristic — silently rewriting, e.g., `02/08/2026` (2 August) to 8 February, on nothing more than an amount-only edit. `31/03/2025` (day > 12) instead produced an outright Invalid Date, failing the save.

**Fix:** `loadChequeIntoForm` now seeds `form.chequeDate` with `normalizeDateOnly(cheque.chequeDate)` — the project's existing pure-string ISO extractor, already used elsewhere for exactly this contract; no `Date` is built on the value path, so no timezone-driven day shift either. The now-dead `fmtDate` helper (its only caller was the bug) and the now-unused `formatDisplayDate` import were removed.

**Root cause proven, not assumed:** verified via a temporary revert of the fix — 8 of the 13 new regression tests failed against the reverted (buggy) code, precisely the "load an existing cheque, leave the date alone, save" paths; the other 5 (explicit user date-typing via `DateInput`'s own correct `onChange`, cheque creation, read-only viewing) were correctly unaffected, matching the root-cause analysis exactly.

**Not changed:** any backend file (the defect never reached the backend as anything other than an already-malformed input — `z.coerce.date()` behaves correctly given the proper ISO input every other date-bearing form in the app already sends it), the Cheque Printing Reliability Pack's pipeline/templates/calibration, the just-released Cheques Reporting & Excel Export Pack, any new business restriction on editing a printed cheque, Prisma schema/migrations, Accounting/GL/Payroll, Google Drive sync.

**Logged, not fixed (deferred to a future Project-Wide Date Format Consistency Audit):** the backend accepts ambiguous date strings with no format validation at the API boundary (`z.coerce.date()` alone); `lib/date.ts`'s `formatDisplayDate` uses a stricter exact-match ISO regex than `lib/dateInput.ts`'s prefix-matching helpers; `Cheques.tsx` had two parallel chequeDate-to-display implementations before this fix removed one.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` and confirmed still present, unstaged, and unmodified in the working tree after the merge and push completed. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Cheques Reporting & Excel Export Pack v1

| Field | Value |
|-------|-------|
| **Package** | Cheques Reporting & Excel Export Pack v1 (adds «تقرير الشيكات» to the Reports page + a full-filtered-dataset Excel export on the Cheques page) plus a corrective pass for the shared report engine's totals-row PDF pagination |
| **Release status** | RELEASED |
| **Release date** | 2026-07-31 |
| **Feature branch** | `feature/cheques-reporting-excel-export-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `cd929e23` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — implementation + its corrective pass reviewed as one package across their own lifecycle instead of a separate checkpoint tag |
| **Feature commit** | `7d31ab5e` |
| **Production merge commit** | `0223eaf3` |
| **Stable tag** | `stable-cheques-reporting-excel-export-pack-v1` → merge `0223eaf3` (annotated) |
| **Reviews** | IMPLEMENTATION (Cheques Report + Excel export, single-source-of-truth filter unification) → CORRECTIVE PASS (shared report-engine totals-row PDF pagination — `<tfoot>` repeated the grand total on every printed page; fixed generically for all reports) · Product Owner manual visual/functional review — **completed & approved** (implementation and corrective pass both), release explicitly requested |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · backend vitest: 144 files / 2102 tests — 2102/2102 ✅ · frontend vitest: 2527/2552 passing, 25 pre-existing unrelated failures (identical set to baseline, zero new regressions) · `npm run build:back` ✅ · `npm run build:front` ✅ |

**Scope — adds cheque reporting/export while keeping cheque data semantics identical across three surfaces, plus a general PDF pagination fix, 14 files:**

**(1) Cheques Report** (`backend/src/modules/reports/reports.service.ts`'s new `cheques()`, registered in `frontend/src/pages/Reports.tsx`) — «تقرير الشيكات» joins the Reports page using the existing report engine (no new report/PDF/print pipeline). Columns mirror the Cheques table exactly — number, beneficiary, bank, amount, cheque date, status, payment-voucher number — with no UI-only or internal columns. **Single source of truth:** `buildChequeFilterWhere()` was extracted from `ChequesService.list()` and is now the one function both the Cheques screen and the report call, closing a real divergence risk the reports module's generic `dateWhere()` would otherwise have introduced (it builds its lower bound at UTC midnight; the cheques module always built it at local midnight — a boundary-dated cheque could have appeared on one surface and not the other). `chequeDate` is the sole date source (never `createdAt`/`updatedAt`/`printedAt`), rendered `DD/MM/YYYY` as a pre-formatted string rather than a typed Excel date cell, so Excel's own date-serial reinterpretation can never shift a day. Status labels reuse the Cheques screen's own DRAFT/PRINTED/CANCELLED wording via a new `translateChequeStatusAr` (kept separate from the invoice status map, whose feminine Arabic grammar reads wrong on a masculine «شيك»). The total is `SUM(amount)` over the full unpaginated filtered result set.

**(2) Excel export on the Cheques page** — a new Excel button (`table_view` icon, secondary variant, Excel green) follows the exact pattern Expenses.tsx already established (Table/Excel Column Unification v1) — no new button design. `fetchAllRows()` walks every server page under the live filters (search/status/period/sort), so the file always contains the whole filtered dataset, never just the visible page. Same columns and `chequeDate`/status/amount semantics as the report; amount is exported as a raw calculable number with the dinar `numFmt`, never the `#…#` cheque-print form. `downloadTableExcel()` gained an optional trailing totals row (`TableExportTotals`) — additive, every existing caller unaffected.

**(3) Corrective pass — shared report-engine totals-row pagination** (`backend/src/shared/services/reportEngine/table.template.ts` + `styles.template.ts`) — manual review of the Cheques report's PDF found the grand total could appear on every printed page instead of once. Root cause: the totals row was emitted inside `<tfoot>`, and the print stylesheet declares `tfoot { display: table-footer-group }` — Chromium repeats a table-footer-group at the bottom of **every** page in paged media. The row also had no `break-inside` guard of its own, so it could be sliced across a page boundary. Fixed **generically, for every report** (not cheques-specific — the same `<tfoot>` was shared by every `ReportInput` with a `totalsRow`): the totals row is now always the last `<tbody>` row, appearing exactly once, immediately after the final data row — therefore on whichever page that row lands on, the last page whether the report is one page or many — with an explicit `page-break-inside: avoid; break-inside: avoid` so it moves whole to the next page rather than splitting. Zero change to any total's value or formatting.

**Not changed:** the Cheque Printing Reliability Pack's pipeline, print formatting, templates, calibration, or any printing-specific file; Prisma schema/migrations; Accounting/GL/Payroll; Google Drive sync.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` and confirmed still present, unstaged, and unmodified in the working tree after the merge and push completed. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Cheque Printing Reliability Pack v1

| Field | Value |
|-------|-------|
| **Package** | Cheque Printing Reliability Pack v1 — bundles three completed, independently audited/implemented cheque-printing packages: Data Integrity & Formatting Pack v1, Deterministic Geometry & Unified Pipeline Pack v1, and Printed Record Editing Fix v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-30 |
| **Feature branch** | `feature/cheque-printing-reliability-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `2e67064f` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — three packages each scoped and reviewed across their own audit → implementation → verification lifecycle, then bundled into a single release |
| **Feature commit** | `654fcbbd` |
| **Production merge commit** | `589f7847` |
| **Stable tag** | `stable-cheque-printing-reliability-pack-v1` → merge `589f7847` (annotated) |
| **Reviews** | AUDIT ONLY — Cheque 000002 forensic audit (amount `#1,370#` vs `#1,370.000#`, date `2026/07/24` vs `02/08/2026`) → IMPLEMENTATION (Data Integrity & Formatting Pack v1) → AUDIT ONLY — Cheque Template Selection, Batch Printing & Calibration Reliability Audit (H1–H7 physical-geometry root causes) → IMPLEMENTATION (Deterministic Geometry & Unified Pipeline Pack v1) → IMPLEMENTATION (Printed Record Editing Fix v1, backend-only) · Product Owner manual visual **and physical print** review — **completed & approved**, release explicitly requested |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · electron `tsc` + `electron:build` ✅ · backend vitest: 142 files / 2050 tests — 2050/2050 ✅ · electron vitest: 12 files / 210 tests — 210/210 ✅ · frontend vitest: 2509/2534 passing, 25 pre-existing unrelated failures (identical set to baseline, zero new regressions) · `npm run build:back` ✅ · `npm run build:front` ✅ |

**Scope — closes two confirmed cheque-print physical/data defects and one operational restriction, found and fixed across three sequential packages, 34 files:**

**(1) Data Integrity & Formatting Pack v1** — a forensic audit of cheque 000002 traced two independent defects end-to-end: the printed numeric amount silently dropped `.000` on whole-dinar cheques (`fmtChequeAmount()` had a zero-fils suppression branch, plus a `Math.floor`/`Math.round` rounding disagreement that could understate the amount by a whole dinar at a boundary), and the printed date showed a design-time sample (`24 / 07 / 2026`) instead of the real cheque date on every legacy stored template, because the date field's id (`'date'`) is not the canonical semantic key (`'chequeDate'`) and no template had an explicit `binding`. Closed by: a single canonical amount formatter (`frontend/src/utils/chequeTemplate.ts`); an explicit legacy id→key alias plus load-time template normalization (`frontend/src/modules/chequeTemplateRuntime/runtimeEngine.ts`, `frontend/src/components/chequeTemplateManager/chequeDesignerStore.ts`); RTL bidi isolation on date/amount/cheque-number fields so their logical character order survives the app's RTL print surfaces; a hardened `resolveChequeTemplateForPrint()` that never falls back to mock/sample data and blocks printing on an unresolved required binding (`UNRESOLVED_DATA_BINDING`); and a print-page state identity guard so one cheque's browsing/tracking state can no longer leak into another's.

**(2) Deterministic Geometry & Unified Pipeline Pack v1** — a follow-up audit, triggered by a real paper test showing inconsistent scale/position/overlap across cheques printed with the same template, found the physical print page was never pinned (no `pageSize`/`margins`/`scaleFactor` sent to Electron, so the OS print dialog's own defaults governed geometry), a print-time 8px padding and viewport-responsive `max-width:100%` that shrank/shifted every cheque, px-sized fonts inside percentage-sized boxes that could overflow into a neighbouring field, a `getDefaultTemplate() ?? listTemplates()[0]` fallback that could silently switch templates, a settings-load race that could print with the wrong provider/calibration, a Cheque Studio print button that diverged from production printing (own template, own paper mode, no tracking), and a Classic batch that resolved bank calibration from stale form state rather than the cheque being printed. Closed by: a new shared print contract (`frontend/src/modules/chequePrint/`) resolving one `ChequePrintJob` (template + runtime data + physical page + Electron options) for every entry point; an extended `app:print` IPC accepting explicit `pageSize`(microns)/`marginType`/`scaleFactor` (`electron/ipc/dialog.ipc.ts`, `electron/ipc/printPageOptions.ts`); removed print-time padding/responsive clamping and container-relative (`cqw`) typography with `FIELD_TEXT_OVERFLOW` detection that blocks rather than truncates; removal of the updatedAt-ordered template fallback in favour of an explicit block when no default is flagged; a `printConfigState` readiness gate; an explicit, clearly labelled Test Print button on the Cheque Studio that shares the same geometry but cannot record production tracking; and Classic batch resolving each item's bank calibration from the cheque actually being printed.

**(3) Printed Record Editing Fix v1** — the cheques module is an operational/reference register for printing, not an immutable ledger, so a single backend guard (`if (current.status === 'PRINTED') throw …`) that blocked editing any printed cheque was removed from `cheques.service.ts`'s `update()`. The CANCELLED guard is unchanged. The update still writes only the eight business fields (chequeNumber/chequeDate/beneficiaryName/amount/currency/description/bankName/notes) — never `status`/`printedAt`/`printCount`/`cancelledAt` — never touches `ChequePrintLog`, and remains fully audited via the existing `recordAudit()` call.

**Not changed:** cheque template coordinates/shapes for any of the 5 stored templates (all confirmed still resolving correctly after normalization), the Classic per-bank calibration values, the A4 sheet's fixed cheque slot, Prisma schema/migrations, Accounting/GL, Payroll, Invoices, tafqeet's derivation from the raw numeric amount (verified independent of the amount formatter), and the reprint justification/logging flow.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` and confirmed still present, unstaged, and unmodified in the working tree after the merge and push completed. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Payroll Eligibility Reconciliation Pack v1

| Field | Value |
|-------|-------|
| **Package** | Payroll Eligibility Reconciliation Pack v1 (RC-1 silent eligibility-gap detection + RC-2 per-employee incremental generation) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-30 |
| **Feature branch** | `feature/payroll-eligibility-reconciliation-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `ef03ffea` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — bundle scoped and reviewed as a single package across its own audit → implementation → verification lifecycle instead of a separate checkpoint tag |
| **Feature commit** | `59ed053e` |
| **Production merge commit** | `29e592e1` |
| **Stable tag** | `stable-payroll-eligibility-reconciliation-pack-v1` → merge `29e592e1` (annotated) |
| **Reviews** | AUDIT ONLY — Payroll Employee Eligibility & Missing Active Employees audit (traced employee 77 end-to-end; confirmed RC-1 + RC-2, ruled out stale leave records, caching, period-filter races, and duplicate eligibility predicates elsewhere in the codebase) → IMPLEMENTATION (this pack) · Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · full backend vitest suite: 141 files / 2037 tests — 2037/2037 ✅ (19 new across two new test files + 3 extended in `payroll.stats.test.ts`) · `npm run build:back` ✅ · `npm run build:front` ✅ |

**Scope — closes two confirmed root causes from the Payroll Employee Eligibility & Missing Active Employees audit, reproduced end-to-end via employee 77 (code 25, احمد رمضان احمد على): ON_LEAVE at July 2026 generation, later reactivated to ACTIVE, silently never reappeared in Payroll/Payslip/Reports/NBK export in two periods (2026-07, 2026-01), 7 files:**

**(1) RC-1 — No reconciliation between the frozen payroll snapshot and live employee eligibility** (`backend/src/modules/payroll/payrollMonth.readModel.ts`'s new `findPayrollEligibilityGap()`, surfaced via `payroll.service.ts`'s `stats()`) — `payroll` rows are a materialized snapshot: `generate()` samples `status = 'ACTIVE'` once, at the instant an operator clicks it, and freezes the result. An employee ON_LEAVE at that instant gets no row, and returning to ACTIVE afterwards creates nothing — the Payroll grid renders rows, not eligibility, so the omission was completely silent, with no count and no warning anywhere in the system. `findPayrollEligibilityGap()` is a strictly read-only reconciliation: it re-evaluates ACTIVE status against live employee data for the selected period and reports `missingPayrollCount`/`missingPayrollEmployees` (employeeId/code/name only). "Represented" deliberately means any payroll row including CANCELLED (a cancelled payslip is still visible and accounted for) and any resolved imported bank transfer (via the same civilId/bankAccount identity resolution the grid itself already uses), so neither produces a false gap. The gap is computed **ignoring** any workflow-status filter, so a persisted `sal:status` filter (the audit's §8 foot-gun) can never suppress the warning that tells the operator someone is absent. `frontend/src/pages/Salaries.tsx` renders it as a named amber banner — a warning only; no row is fabricated, and nothing is auto-generated or auto-approved.

**(2) RC-2 — Month-wide re-generation lock** (`payroll.service.ts`'s `generate()`) — the lock aborting a re-generate on any single non-DRAFT payslip anywhere in the period was month-wide, so the only recovery path for a returning employee (re-generate the month) required first un-approving every other payslip in that month — effectively unusable. The lock is now per-employee: each targeted employee is classified independently as CREATE (no row yet — this is how a returning ACTIVE employee reappears), UPDATE (existing DRAFT, unchanged recalculation semantics), or SKIP (APPROVED/PAID/other — never read, rewritten, or deleted). Duplicate protection is unchanged and structural (`@@unique([employeeId, month, year])` + `upsert`). A deliberate re-generate where every targeted row is locked still raises the original error rather than silently no-op-ing. `generate()`'s response gains additive `created`/`updated`/`skippedLocked` fields; the Salaries generate toast now reports a skipped-locked count instead of staying silent about a partial run.

**Verified against `CURRENT_DB`** (`backend/data/manar.db`, read-only): the new predicate detects employee 77 as missing in both affected periods, and a `generate(7, 2026)` run would create exactly his row while skipping all 23 currently-approved payslips — confirmed via raw read-only SQL replay of the new eligibility predicate, with no data written.

**Regression proof:** the Ahmed regression test (`payroll.generate.incremental.test.ts` — "F/J. Ahmed regression") was confirmed to **fail** against the prior month-wide lock via a temporary revert (3 tests failed, including this one, with the original month-wide error), then the revert was removed and the suite re-verified green.

**Not changed:** Employee/Payroll Prisma schema, GL/accounting posting (payroll still posts no GL entry by existing design), NBK export format, historical payroll data, employee 77's database record, any other module's eligibility predicate (audited and confirmed to read from the same `payroll` table with no divergent duplicate logic).

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` and confirmed still present, unstaged, and unmodified in the working tree after the merge and push completed. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Database & Google Drive Runtime Safety Pack v1

| Field | Value |
|-------|-------|
| **Package** | Database & Google Drive Runtime Safety Pack v1 (R1 split-brain lock + R2 orphan cleanup + R3 snapshot consistency + restore reliability + first-run bootstrap seed safety) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-30 |
| **Feature branch** | `feature/database-google-drive-runtime-safety-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `9b28bf98` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — electron-only Major-System-adjacent bundle scoped and reviewed as a single package across its own audit → implementation → corrective-pass → final-review lifecycle instead of a separate checkpoint tag |
| **Feature commit** | `86eb4114` |
| **Production merge commit** | `1e91f12a` |
| **Stable tag** | `stable-database-google-drive-runtime-safety-pack-v1` → merge `1e91f12a` (annotated) |
| **Reviews** | AUDIT ONLY — Database Source of Truth & Google Drive Sync Safety Audit v1 (identified R1/R2/R3) → IMPLEMENTATION (R1/R2/R3/restore) → IMPLEMENTATION (First-Run Packaged Database Bootstrap Safety) → FINAL REVIEW ONLY round 1 (`VERDICT: BLOCK` — HIGH-1, MEDIUM-1, MEDIUM-2) → Corrective Pass (all three fixed, each proven via temporary revert + failing-test confirmation, then restored) → FINAL REVIEW ONLY round 2 (`VERDICT: APPROVE`) · Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | electron `tsc --noEmit` ✅ · `npm run electron:build` ✅ · backend `tsc --noEmit` ✅ · electron vitest 11 files / 199 tests — 199/199 ✅ (72 new across the four new/extended test files) · frontend not touched, not re-run (electron/backend-only release) |

**Scope — closes three operational risks discovered in the Database Source of Truth & Google Drive Sync Safety Audit v1, ahead of manual entry of historical 2025 accounting data, 12 files:**

**(1) R1 — Dev/packaged split-brain lock** (`electron/services/runtimeLock.ts`, wired in `electron/main.ts`) — a cross-environment `~/.manarERP/runtime.lock` file, keyed on the user's home directory alone (not `userData`/`dataDir`, which differ between dev and packaged), blocks a second manarERP instance (dev or packaged) from starting while another is already running against a *different* local database and syncing the *same* Google Drive file. Root risk: `app.requestSingleInstanceLock()` alone only protects one environment against itself — dev and packaged have separate Electron single-instance locks and separate `dataDir`s, so nothing previously stopped both from running concurrently and racing to sync the same cloud file. `acquireRuntimeLock()` never throws — every failure path (mkdir failure, write failure, read failure on an existing lock, a live competing holder) returns a discriminated `{ok:false, reason:'HELD'|'UNAVAILABLE', ...}` result, and `guardAgainstSplitBrain()` in `main.ts` fails closed on both reasons (blocks startup with an explanatory bilingual dialog naming both environments) rather than continuing unprotected on an infrastructure error — this fail-closed behavior was itself a corrective-pass fix, see MEDIUM-2 below.

**(2) R2 — Orphan sync-temp cleanup** (`electron/services/syncTempCleanup.ts`) — sweeps stale `sync-tmp-snapshot-*`/`sync-tmp-download-*` files older than 2 hours from `dataDir` on every startup, so a crash or force-kill mid-sync no longer leaves orphaned temp files accumulating indefinitely.

**(3) R3 — Manual/shutdown snapshot consistency** (`electron/services/dbIntegrity.ts`'s new `snapshotDatabase()`, used by `syncEngine.service.ts`'s `performUpload()`) — uploads now snapshot the live database via SQLite `VACUUM INTO` for a transactionally-consistent copy instead of a raw `fs.copyFileSync`, eliminating the risk of uploading a file mid-write. Because a `VACUUM INTO` snapshot's bytes legitimately differ from the live `dbPath` file's own bytes, `SyncMetadata` gained a second field, `lastSyncedLocalHash`, tracking the live file's own hash separately from the uploaded snapshot's hash (`lastSyncedHash`) — without this, `decide()` would have compared the snapshot's hash against the live file's hash and seen a permanent false "local changed" on every subsequent check, causing repeated unnecessary uploads and false conflicts with other devices. This regression was self-caught and fixed before any user-facing report.

**(4) Restore reliability** (`electron/ipc/backup.ipc.ts`) — local database restore now stops the backend via `stopBackendForRestart()`, retries the file replace with `withRetry(..., {isRetryable: isFileLockError})` against Windows `EPERM`/`EBUSY` file-lock errors, and restarts the backend in a `finally` block — mirroring the Google Drive restore path's already-safe pattern instead of a bare unretried `fs.copyFileSync` against a file the running backend might still hold open.

**(5) First-run packaged database bootstrap safety** (`electron/services/dbBootstrapState.ts`, wired into `backendLauncher.ts` and both `isPristineSeed()` call sites in `syncEngine.service.ts`) — the template database copied into `userData/data/manar.db` on a packaged build's first run is proven a **pristine seed, not real user data**, via two independent proofs: an explicit `SEED`/`REAL` state tag written at copy time (`markSeeded()`), and — closing the atomicity gap between the copy and that tag-write — a direct sha256 fallback comparison against the shipped template file itself whenever the tag is missing, corrupt, or incomplete. Either proof alone is sufficient; the `REAL` state (written by `markBootstrapComplete()` after a successful download-bootstrap or the first genuine local write) always takes precedence and closes both paths permanently. `getSeedTemplatePath()` returns `null` in dev, where the "template" and `dbPath` are the same file, preventing a developer's real database from ever being misclassified as a seed. Root risk this closes: without it, first-run startup sync would see the freshly-copied template as an unexplained "local change" against an existing Google Drive database, produce a false `CONFLICT`, and a "keep local" resolution would upload a stale template over real cloud data.

**(6) Startup-abort lifecycle guard** (`electron/main.ts`) — a rejected split-brain check (or any other startup abort) now sets a module-level `startupAborted` flag *before* calling `app.quit()`, and the `before-quit` handler's very first line checks `if (quitConfirmed || startupAborted) return;` *before* `event.preventDefault()` — so a rejected/losing environment's forced quit can no longer fall through into the full shutdown sequence (including `performShutdownSync`, which would otherwise let a rejected environment upload to Google Drive). This was **HIGH-1** from the first Final Review round, fixed in the Corrective Pass.

**Corrective Pass findings (all closed, each proven via temporary revert + failing regression test, then restored):**
- **HIGH-1** — rejected/aborted startup could still reach `performShutdownSync` and upload to Drive → fixed via the `startupAborted` guard above.
- **MEDIUM-1** — atomicity gap between template copy and `markSeeded()`'s tag-write could leave a pristine seed untagged and misclassified as real data on next check → fixed via the template sha256 fallback proof above.
- **MEDIUM-2** — original `acquireRuntimeLock()` caught infrastructure errors (mkdir/write/read failure) and returned "continue without lock" (fail-open) → fixed by making it never throw and always return a discriminated `HELD`/`UNAVAILABLE` result, with `guardAgainstSplitBrain()` blocking startup on both (fail-closed).

**Deferred as non-blocking technical debt (explicitly accepted, not fixed in this release):**
- **M-A** — `runtimeLock.ts`'s initial lock-file write (`fs.writeFileSync(lockPath, payload, {flag:'wx'})`) is not fully atomic; a theoretical microsecond-scale race exists where a second process could read a competitor's not-yet-fully-written lock file as empty/unreadable and also acquire the lock. Impact judged minimal (the targeted threat — a developer opening dev then packaged — is separated by seconds, not microseconds) and the worst outcome is an explicit, visible conflict requiring resolution, not silent data loss.
- **`getUserDataPaths()` filesystem side effects before the runtime guard runs** — it can create directories and copy the seed template before `guardAgainstSplitBrain()` executes. Verified non-blocking: it never touches an existing database (copy is guarded by `!fs.existsSync(dbPath)`), performs no network/Drive operation, and any resulting seed-misclassification risk is independently closed by `isPristineSeed()`/`getSeedTemplatePath()` regardless of ordering.

**Not changed:** frontend, Prisma schema/migrations, accounting/GL, any API contract, invoice/expense creation or posting logic, historical data, visual design, or the in-progress Google Drive Deployment Pack v1 OAuth work.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`, `electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`, `electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from `git add` and confirmed still present, unstaged, and unmodified in the working tree after the merge and push completed. All 5 pre-existing git stashes (English Localization, Financial Number/Date Presentation phase-d WIP ×2, font-cleanup WIP, Cheques Tafqeet phase 2) confirmed untouched.

---

## Previous Release — Frontend Reliability Pack v1

| Field | Value |
|-------|-------|
| **Package** | Frontend Reliability Pack v1 (Scroll Lock + Period Source + Calendar Ref) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-30 |
| **Feature branch** | `feature/frontend-reliability-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `6eb6307d` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — Quick-Fix-scale UI-only bundle; no schema/IPC/backend surface touched |
| **Feature commit** | `060260b6` |
| **Production merge commit** | `f9f3cb86` |
| **Stable tag** | `stable-frontend-reliability-pack-v1` → merge `f9f3cb86` (annotated) |
| **Reviews** | Delivered as three separately-audited, user-reviewed fixes across prior sessions (AUDIT ONLY reports + IMPLEMENTATION passes, each stopped for visual review before proceeding) · Product Owner manual visual review — **completed & approved**, release explicitly requested |
| **Validation** | frontend `tsc --noEmit` ✅ · full vitest suite 151 files / 2415 tests — 143 passed files / 2390 passed tests, 8 pre-existing failing files / 25 pre-existing failing tests (confirmed unchanged vs. baseline via isolated HEAD-worktree run before starting; none of the 8 are in this release's 3 packages) + 63 new passing regression tests · `npm run build:front` ✅ (feature branch + re-verified on `production` immediately after merge, identical) · backend/electron/Prisma not touched, not re-run (frontend-only release) |

**Scope — bundles three independently audited fixes uncovered while preparing for historical 2025 data entry, 17 files:**

**(1) Scroll Lock Leak Fix** — a shared reference-counted `lockScroll()`/`unlockScroll()`
(`frontend/src/lib/scrollLock.ts`) replaces independent `document.body.style.overflow`
management previously duplicated in `Modal.tsx`, `useFocusTrap`/`Dialog` (`ExplorerKit.tsx`), and
`PrintPreviewDialog.tsx`. Root cause: when a `Dialog` (e.g. `CreateInvoice`'s save-confirmation
step) is stacked on top of an open `Modal` and both unmount in the same commit (a successful save
closes both at once), each surface's cleanup ran in DOM order rather than open/close order — the
`Dialog`'s `useFocusTrap` cleanup re-applied `'hidden'` *after* `Modal`'s cleanup had already
cleared it, permanently locking page scroll with no visible dialog left on screen. The counter
makes unlock order irrelevant: only the first `lockScroll()` captures the pre-lock value, and only
the last matching `unlockScroll()` restores it.

**(2) Historical Data Period Reliability Fix v1** — `PeriodControl` (the global financial-period
selector) is now the **single time-range source** for the Invoices and Expenses list screens. Root
cause: both screens also carried a local "billing month/year" table filter
(`billingMonth`/`billingYear`) that was ANDed server-side against `PeriodControl`'s
`issueDate`/`date` range on a **different column** — selecting a historical year in one control
while the other stayed on the current year silently produced zero rows, making real historical
invoices/expenses (e.g. `MN-INV-2025-0004`) appear "missing" even though they were present and
correctly stored. The local month/year filters are removed from these two screens only; backend
filtering capability, Prisma schema, and the expense-record `billingMonth`/`billingYear` fields
themselves are untouched (still written by the Expense create/edit form, still displayed in row
detail). `FinancialPeriodContext` now persists the selected period's *input* (preset/year/range) in
`sessionStorage` — surviving an in-session reload (including Vite HMR in dev) without silently
resetting to the current year — while still resetting to the safe default ("year to date") on a
fresh app launch (`localStorage` is never touched). Both screens' list-loading effects gained a
request-id race guard so a slow, stale response for an old period selection can no longer overwrite
a newer one already on screen. Excel export on both screens now shares the exact same filter
params object as the visible list (previously it silently omitted the period range).

**(3) CalendarDayButton Ref Compatibility Fix v1** — `frontend/src/components/ui/button.tsx` (a
vendored shadcn primitive) now forwards its ref via `React.forwardRef`. Root cause: the vendored
file was written for React 19's ref-as-a-regular-prop convention, while this project runs React
18.3.1, where a plain function component silently drops any `ref` passed to it. This was not
cosmetic — `react-day-picker`'s `CalendarDayButton` relies on that ref to call `.focus()` on the
active day during keyboard navigation, so arrow-key day-to-day focus movement inside the date
picker was silently broken (in addition to the visible React console warning). No visual change, no
date-semantic change (`DD/MM/YYYY` display/parsing untouched), no `Calendar`/`DateInput`/
`DateCalendarPicker` API change; `asChild` composition verified still correct.

**Not changed:** backend, database, Prisma schema/migrations, accounting/GL, any API contract,
invoice/expense creation or posting logic, historical data, Google Drive sync engine or its
in-progress Deployment Pack v1 work, visual design, or date display/parsing semantics.

**Scope discipline:** the working tree at release time also contained unrelated, unfinished Google
Drive Deployment Pack v1 work (`electron/services/googleDriveAuth.service.ts`,
`electron/services/googleDriveClientConfig.pure.ts` + its test, `electron/__tests__/`,
`electron/resources/`, plus the `.gitignore`/`electron-builder.yml` entries wiring its bundled
OAuth client resource). None of it belongs to this release; all of it was explicitly excluded from
`git add` and confirmed still present, unstaged, and unmodified in the working tree after the merge
and push completed.

---

## Previous Release — Customer Transport Terminology & UI Polish Pack v1

| Field | Value |
|-------|-------|
| **Package** | Customer Transport Terminology & UI Polish Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-30 |
| **Feature branch** | `feature/customer-transport-terminology-and-ui-polish-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `b722bd0c` (previous release's final documentation commit) |
| **Checkpoint tag** | `checkpoint/pre-customer-transport-terminology-and-ui-polish-pack-v1-b722bd0` (annotated — created because this bundles three separate changes spanning backend + frontend) |
| **Feature commit** | `b8a3d2b1` |
| **Production merge commit** | `a6024c8c` |
| **Stable tag** | `stable-customer-transport-terminology-and-ui-polish-pack-v1` → merge `a6024c8c` (annotated) |
| **Reviews** | Claude Code Review — **APPROVE** (zero CRITICAL/HIGH/MEDIUM across all 15 files) · Product Owner manual visual review — **completed & approved** for all three items |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · `npm run build:back` ✅ · `npm run build:front` ✅ (feature branch + re-verified on `production` immediately after merge, identical) · 211/211 targeted backend tests ✅ · 20/20 `referenceTypeScope.test.ts` ✅ · electron/Prisma not touched, not re-run (no schema/IPC change) |

**Scope — bundles three separately visually-approved changes, 15 files:**

**(1) Customer Transport Invoice Terminology Finalization v1** — unifies the customer-invoice
product term to **"فاتورة نقليات" / "Customer Transport Invoice"** and the direction term to
**"نقليات عميل" / "Customer Transport"** across every user-visible surface: statement screens
(`StatementTable.tsx`, `GroupedTable.tsx`, `FinancialCenter.tsx`), the Statement Center Excel
export, the reports module (`reports.service.ts`), the invoice-creation validation message
(`invoices.schema.ts`), and the full `i18n.ts` dictionary (AR + EN). Supplier statements keep
their own correct **"فاتورة مشتريات" / "Purchase Invoice"** label:

```diff
-function refTypeAr(type: string): string {
-  if (type === 'INVOICE') return 'فاتورة';
+function refTypeAr(type: string, entityType?: 'CUSTOMER' | 'SUPPLIER'): string {
+  if (type === 'INVOICE') {
+    if (entityType === 'CUSTOMER') return 'فاتورة نقليات';
+    if (entityType === 'SUPPLIER') return 'فاتورة مشتريات';
+    return 'فاتورة';
+  }
```

```diff
-export function referenceTypeLabel(type: string | null | undefined, t: Translator): string {
+export function referenceTypeLabel(type, t: Translator, scope?: 'customer' | 'supplier'): string {
   if (!type) return '';
+  if (type === 'INVOICE' && scope === 'supplier') return t('fc.ref.purchase_invoice');
```

Delivered via a display-only `scope`/`entityType` parameter threaded through the existing shared
`referenceType` label helper and statement Excel formatter — **no new i18n keys, no new technical
reference/movement type, and no change to the shared `referenceType: 'INVOICE'` value** used by
both customer and supplier statements (API contract and filtering unaffected). Locked in by a new
permanent regression test, `frontend/src/__tests__/referenceTypeScope.test.ts` (20 cases): all
four customer/supplier × AR/EN label combinations, the no-scope journal/GL path (unchanged), every
other reference type (unaffected by scope), and `_REVERSAL` inheritance. **Accounting/GL/Prisma/
`SALES` identifiers/account 4000/historical journal entries are entirely untouched by design** —
verified via `git diff --stat` showing zero changes in `invoices.accounting.ts`,
`backend/src/modules/accounting/`, `backend/prisma/`, `historicalEntry.service.ts`,
`summary.utils.ts`, and `backend/src/config/`.

**(2) Status-colored row identifiers** — continuing the pattern already shipped for Invoices
(`stable-invoice-number-status-color-v1`): the cheque number (`Cheques.tsx`/`.css`) and employee
name (`Salaries.tsx`/`.css`) now read their row's existing status tone — the exact same
`STATUS_META` / `STATUS_TONE` map that already drives each row's status chip — and apply it as
text color only, via new `.chqx-num--{tone}` / `.salx-name--{tone}` classes pointing at the same
shared `--xpl-*` variables the chips already use. No new color, no duplicated status logic, no
chip/table/business-logic change.

**(3) Expenses breakdown show/hide toggle** — adds a show/hide control for the "التحليل حسب
التصنيف والمورد" breakdown section on the Expenses page (`Expenses.tsx`), reusing the existing
`SectionCard` `actions` slot and the `Button`/i18n show-hide pattern already used elsewhere in the
app (`Prices.tsx`'s agreements board toggle). Preference persists via the existing
`usePersistedState` hook (`localStorage`), defaulting to visible. No new design, no data/API/
business-logic change.

**Not changed:** the status chips' own color/design, table layouts, business logic, exported data,
`referenceType` values, API contracts, Prisma schema, `SALES` identifiers, account 4000, or any
historical journal entry.

---

## Previous Release — Invoice Number Status Color v1

| Field | Value |
|-------|-------|
| **Package** | Invoice Number Status Color v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-29 |
| **Feature branch** | `feature/invoice-number-status-color-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `8034dd6c` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — a scoped, single-page text-color tweak, per Quick Fix mode |
| **Feature commit** | `aabf0083` |
| **Production merge commit** | `e5bb31df` |
| **Stable tag** | `stable-invoice-number-status-color-v1` → merge `e5bb31df` (annotated) |
| **Reviews** | Product Owner manual visual review — **completed & approved** |
| **Validation** | frontend `tsc --noEmit` ✅ (feature branch + re-verified on `production` immediately after merge, identical) · `npm run build:front` ✅ (feature branch, before merge) · backend/electron/Prisma not touched, not re-run (frontend-only CSS/render change) |

**Scope — two files, `frontend/src/pages/Invoices.tsx` + `frontend/src/pages/Invoices.css`:**

```diff
       render: (r) => <span className="invcx-mono"><strong>{r.invoiceNumber ?? r.number}</strong></span>,
+      render: (r) => {
+        const tone = (STATUS_META[String(r.status)] ?? { tone: 'neutral' as Tone }).tone;
+        return <span className={`invcx-mono invcx-num--${tone}`}><strong>{r.invoiceNumber ?? r.number}</strong></span>;
+      },
```

```diff
+.invcx-num--neutral { color: var(--xpl-muted); }
+.invcx-num--green   { color: var(--xpl-green); }
+.invcx-num--red     { color: var(--xpl-red); }
+.invcx-num--orange  { color: var(--xpl-orange); }
+.invcx-num--blue    { color: var(--xpl-blue); }
+.invcx-num--indigo  { color: var(--xpl-primary); }
```

The invoice-number column now reads its row's `tone` from `STATUS_META` — the exact same map `invStatusChip()` already uses to color the status chip — and applies it as the number's text color only, via new `.invcx-num--{tone}` classes that point at the identical `--xpl-*` CSS variables the chip itself uses (`.xpl-chip--{tone}` in `explorer-kit.css`). No new color was introduced, no status logic was duplicated, and both light/dark themes are inherited automatically since the underlying variables already support both.

**Not changed:** the status chip's own color/design, the invoices table layout, business logic, exported data, or any other column.

---

## Previous Release — Cloud Sync Progress Dialog Rewire v1

| Field | Value |
|-------|-------|
| **Package** | Cloud Sync Progress Dialog Rewire v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-29 |
| **Feature branch** | `fix/cloud-sync-progress-dialog-rewire` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `8fa1efb0` (previous release's final documentation commit) |
| **Checkpoint tag** | none created — a scoped, audit-approved single-file rewire executed directly on a fresh branch from `production`, per explicit user instruction |
| **Feature commit** | `a25bd7a3` |
| **Production merge commit** | `dacacd4a` |
| **Stable tag** | `stable-cloud-sync-progress-dialog-rewire-v1` → merge `dacacd4a` (annotated) |
| **Reviews** | Root-cause audit (full git history/branch sweep across all local branches — confirmed the `emitSyncProgress()` call site was never part of any commit merged onto `production`; it existed only in the working tree and was captured, unmerged, into `feature/cloud-sync-progress-dialog-wip` on 2026-07-26 during a repo-cleanup pass) · Product Owner manual visual review — **completed & approved** for both startup and shutdown sync |
| **Validation** | electron `tsc --noEmit` ✅ (feature branch + re-verified on `production` immediately after merge, identical) · `npm run electron:build` ✅ (production, post-merge) · `syncProgressBus.test.ts` 4/4 ✅ (feature branch only — not re-run post-merge per explicit scope instruction, since no logic in that file changed) · backend/frontend/Prisma not touched, not re-run (electron-only additive rewire, no schema/API/UI change) |

**Scope — one 2-line diff in one file, `electron/services/syncEngine.service.ts`:**

```diff
+import { emitSyncProgress } from './syncProgressBus';
...
 function setStatus(status: SyncStatus, message = ''): void {
   currentStatus = status;
   currentMessage = message;
+  emitSyncProgress(status, message);
 }
```

Reconnects the pre-existing Cloud Sync Progress Dialog — window (`syncProgressWindow.ts`), preload bridge, and event bus (`syncProgressBus.ts`) were already fully merged onto `production` via the window-lifecycle-foundation refactor (`1eaf2ce0`) and wired into `main.ts`'s startup/shutdown flows — to the sync engine's real events. `setStatus()` now republishes the exact status/message it already tracked internally; no new decision, retry, upload, download, or conflict-resolution behavior was introduced.

**Root cause, confirmed by audit:** the `emitSyncProgress()` call site never existed in any commit merged onto `production` or any merged branch. It lived only in an uncommitted working-tree edit, was captured "as-is" into the unmerged `feature/cloud-sync-progress-dialog-wip` branch (commit `56c9912f`, 2026-07-26, explicitly marked `[WIP] Not production-ready. Not merged, not released.`) during a repo-cleanup audit, and was thereby removed from the working tree without ever being merged — silently disconnecting the dialog from the engine while the dialog's own UI code and every other part of the sync system remained fully intact and functional throughout.

**Not changed:** `performStartupSync`/`performShutdownSync` and all download/upload/conflict/retry logic; `syncProgressWindow.ts` (window, embedded HTML/CSS/JS, counters, dwell timing); `main.ts`; `syncProgressWindow.preload.ts`; any Backend/Prisma/API code; Google Drive OAuth/Deployment WIP (`.gitignore`, `electron-builder.yml`, `electron/services/googleDriveAuth.service.ts`, and untracked `electron/__tests__/`, `electron/resources/`, `electron/services/__tests__/googleDriveClientConfig.pure.test.ts`, `electron/services/googleDriveClientConfig.pure.ts`) — confirmed still uncommitted after merge, byte-identical to the pre-release working tree; all 5 pre-existing unrelated git stashes — confirmed untouched.

---

## Previous Release — Customer Drawer / Prices Board / Equipment Data Pack v1

| Field | Value |
|-------|-------|
| **Package** | Customer Drawer EN-name fix + Prices Agreements Board toggle + Equipment Data Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-29 |
| **Feature branch** | `feature/customer-drawer-prices-board-equipment-data-pack-v1` (kept — not deleted per standing policy) |
| **Baseline** | `production` @ `e9a26ae4` (previous release's final documentation commit) |
| **Checkpoint tag** | `pre-customer-drawer-prices-board-equipment-data-pack-v1` → `e9a26ae4` |
| **Feature commit** | `09e2fa28` |
| **Production merge commit** | `8de53ed3` |
| **Stable tag** | `stable-customer-drawer-prices-board-equipment-data-pack-v1` → merge `8de53ed3` (annotated) |
| **Reviews** | Product Owner manual visual review — **completed & approved** for all three changes prior to this release request |
| **Validation** | backend + frontend `tsc --noEmit` ✅ · `build:back` + `build:front` ✅ — re-verified on `production` immediately after merge, identical results · `prisma migrate status` clean after applying `20260729160000_equipment_chassis_color` · targeted tests 89/89 ✅ — backend `equipment`+`import` (54: service/sort/validator/warnings suites) and frontend `explorerHubPrimitives`/`explorerHubs`/`equipmentTableDefaults`/`pricesAgreementsBoardToggle` (35), all re-run unchanged post-merge · full test suites and unrelated previously-verified checks intentionally not re-run this release, per explicit scope instruction |

**Scope — three independently-approved changes, bundled into one release:**

1. **Customer Drawer English-name fix.** "اسم العميل (بالإنجليزي)" was wrapping mid-word (`National` → `Nation`/`al`) inside a half-width cell of the drawer's two-column info grid. `DrawerInfoGrid`/`DrawerField` (`ExplorerKit.tsx`) gain an opt-in `ltr` flag: the value renders `dir="ltr"`, spans the drawer's full width (`grid-column: 1 / -1`), and wraps only between words (`word-break: normal`). `hubTypes.buildInfoItems` flags any `nameEn`/`*NameEn` field automatically — no per-module wiring. No other drawer field, module, or layout touched.

2. **Prices page — "لوحة الاتفاقيات" show/hide toggle.** A single button in the existing `SectionCard` header `actions` slot toggles the agreements-board mini-table's visibility; the choice persists in `localStorage['manarERP.prices.agreementsBoard']` across app restarts (default: shown). The mini-table's own columns, data, and tab set are untouched; every other part of the Prices page is unaffected.

3. **Equipment Data Pack v1.** Adds `chassisNumber` ("رقم القاعدة") and `color` ("اللون") as new optional `Equipment` columns (additive migration `20260729160000_equipment_chassis_color` — two nullable `TEXT` columns, no destructive change); surfaces the pre-existing but previously-hidden `manufacturer`/`manufactureYear` ("الصنع"/"سنة الصنع") in the table, create/edit dialog, and drawer; relabels the "type" column from "النوع" to "الشكل" (**display-only** — same `type` field, same index, same stored values). Import template and header-matching aliases updated for all four fields (old import files without them still validate — the fields are optional and header aliases for "نوع المعدة"/"شكل المعدة" both resolve to the same `type` key). Excel export report gains the four columns and the "الشكل" header. Separately, the equipment table now always opens on **page 1**, sorted by **"المدة الباقية" ascending**, on every fresh app run — implemented via a new `ModuleConfig.defaultSort` fallback in `useTableSort`, and a one-time per-run reset (`runStartUIState.ts`) that clears only the equipment page/sort `localStorage` keys, gated by a `sessionStorage` flag so mid-session user changes to page/sort are never touched and no other module's persisted UI state is affected. `regRemaining`'s sort maps to the same `registrationExpiry` field the remaining-days figure is itself computed from — no parallel calculation.

**Not changed:** employees table/drawer (a read-only audit was performed in the same review cycle per user request; zero employees code was modified as a result); any other Prices/Equipment/Customer business logic, permission, or route; Google Drive Deployment Pack in-progress working-tree edits (`.gitignore`, `electron-builder.yml`, `electron/services/googleDriveAuth.service.ts`, and untracked `electron/__tests__/`, `electron/resources/`, `electron/services/__tests__/googleDriveClientConfig.pure.test.ts`, `electron/services/googleDriveClientConfig.pure.ts`) — surgically excluded from every commit in this release, confirmed still uncommitted after merge; pre-existing unrelated git stashes — confirmed untouched.

---

## Previous Release — Ready-Paper Logo Tint Generalization v1

| Field | Value |
|-------|-------|
| **Package** | Ready-Paper Logo Tint Generalization v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-29 |
| **Feature branch** | `feature/ready-paper-logo-tint-generalization-v1` (kept — not deleted per explicit instruction) |
| **Baseline** | `production` @ `ae8430fb` (previous release's final documentation commit) |
| **Checkpoint tag** | `pre-ready-paper-logo-tint-generalization-v1` → `ae8430fb` |
| **Feature commit** | `fcd55daf` |
| **Production merge commit** | `8f8990de` |
| **Stable tag** | `stable-ready-paper-logo-tint-generalization-v1` → merge `8f8990de` (annotated) |
| **Reviews** | Diff-based independent review (structural audit of all `FormLayout`/`printProfiles` consumers, confirmed no guessed form list) · Product Owner manual visual review — **completed & approved** |
| **Validation** | frontend `tsc --noEmit` ✅ · `build:front` ✅ — re-verified on `production` immediately after merge, byte-identical chunk hashes · targeted `readyPaperGeneralization.test.tsx`, 19/19 ✅ (3 new: ready-paper tint matches `SECTION_HEADER_BG`, explicit `logoTintColor` override still wins, `payment-voucher` keeps its own unrelated default tint; 16 pre-existing profile-isolation tests unchanged) · backend/electron/Prisma not touched, not re-run (frontend-only release, no schema/backend/IPC change) · full frontend suite not re-run this release per explicit scope instruction (no shared code outside the reviewed delta changed) |

**Scope.** Originally implemented as a Salary-Certificate-only, `ready-paper`-only visual tweak (recolor the logo to match that form's own "بيانات الموظف"/"بيانات الراتب" section-header bars), this release generalizes the same mechanism to **every** form on the `ready-paper` print profile: ReturnToWork, SalaryAdvance, Resignation, EmployeeWarning, LeaveRequest, ToWhomItMayConcern, PerformanceEvaluation, PurchaseRequest, Quotation, and Salary Certificate itself — confirmed by an actual audit of every `<FormLayout` / `PrintProfileToggle` consumer under `frontend/src/pages/`, not a guessed list. PaymentVoucher and AdminPaymentVoucher are structurally excluded: both hardcode `profile="payment-voucher"` with no profile toggle, so they can never reach `ready-paper`.

**Mechanism, centralized.** `PRINT_PROFILES['ready-paper'].logoHeader` is `true` on exactly one profile (`printProfiles.ts`) and already drove whether `FormHeader`'s logo renders as the page-level overlay. `FormLayout` now derives `readyPaperLogoTintColor = activeProfile.logoHeader ? SECTION_HEADER_BG : undefined` from that same flag and passes it as `FormHeader`'s `tintColor` default — so any current or future form on `ready-paper` inherits the matching tint with zero per-page opt-in. The existing `logoTintColor` prop (introduced for the original Salary-Certificate-only pass) is preserved unchanged as an explicit override that still wins over the automatic default; no new prop, token, or code path was introduced. `SECTION_HEADER_BG` (`formStyles.ts`) is the same constant already backing the "بيانات الموظف"/"بيانات الراتب" bar color — extracted, not retyped, so the bar's own rendering is byte-unchanged.

**Salary Certificate's own explicit wiring was removed** (`logoTintColor={profile === 'ready-paper' ? SECTION_HEADER_BG : undefined}` in `SalaryCertificate.tsx`) since it is now redundant — `FormLayout` applies the identical value centrally. The page's diff against its prior (already-approved) state is therefore zero; behavior is confirmed unchanged.

**Not changed:** `plain-a4` and `letterhead` (`logoHeader: false` — never render the logo header at all, so the tint override is inert for them); `payment-voucher`/`receipt-voucher` (`logoHeader: false` — keep `FormHeader`'s original default tint, verified by a new test); logo size, position, crop, or margins on any profile; the section-header bar's own color or design; any other form's or the general system logo's color; Print Color Mode (explicitly out of scope, deferred); Google Drive Deployment Pack in-progress working-tree edits (`.gitignore`, `electron-builder.yml`, `electron/services/googleDriveAuth.service.ts`, and untracked `electron/__tests__/`, `electron/resources/`, `electron/services/__tests__/googleDriveClientConfig.pure.test.ts`, `electron/services/googleDriveClientConfig.pure.ts`) — surgically excluded from every commit in this release, confirmed still uncommitted after merge; pre-existing unrelated git stashes — confirmed untouched.

---

## Previous Release — Branding Designer Rotation v1

| Field | Value |
|-------|-------|
| **Package** | Branding Designer Rotation v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-29 |
| **Feature branch** | `feature/branding-designer-rotation-v1` (kept — not deleted per explicit instruction) |
| **Baseline** | `production` @ `b7678f09` (previous release's final documentation commit) |
| **Checkpoint tag** | `pre-branding-designer-rotation-v1` → `b7678f09` |
| **Feature commit** | `2285cdfa` |
| **Production merge commit** | `67afa7ac` |
| **Stable tag** | `stable-branding-designer-rotation-v1` → merge `67afa7ac` (annotated) |
| **Reviews** | Claude Code Review — clean, 0 CRITICAL/HIGH/MEDIUM (independent code-reviewer agent pass; rotation math, un-rotation resize matrix, and angle-normalization edge cases hand-verified) · Product Owner manual visual review — **completed & approved** |
| **Validation** | frontend `tsc --noEmit` ✅ · `build:front` ✅ — re-verified on `production` immediately after merge, byte-identical · 8 targeted branding test files, 220/220 ✅ (`brandingRotation.test.tsx` new — 57 tests; `formBrandingDesignMode.test.tsx`, `salaryCertificateWideBoundsExperiment.test.tsx`, `printTemplates/brandingLayout.test.ts`, `blankA4Print.test.tsx`, `inkColorSystem.test.tsx`, `approvalSectionBranding.test.tsx`, `pdfComposedDocumentPilotFidelity.test.ts`) · backend/electron/Prisma not touched, not re-run (frontend-only release, no schema/backend/IPC change) · full frontend suite not re-run this release per explicit scope instruction (no shared code outside the reviewed branding delta changed) |

**Scope.** Adds signature/stamp **rotation** to the Branding Designer, on top of the existing drag/resize/opacity/ink-color system: a new optional `rotation?: number` on `BrandingElementLayout`, normalized to `(-180, 180]` by wrapping (not clamping, so a continuous circular drag never sticks at the boundary). A drag handle rotates the element around its own visual center; **Shift snaps to 15° increments** (read live on every pointer move, not snapshotted at grab); **double-click resets to 0°**. Wired into both design surfaces — `DesignableBrandingImage` (administrative forms, Blank A4, receipt voucher) and `UniversalDesignerOverlay` (invoice/quotation) — plus a live rotation slider + 0° reset button in `BrandingDesignerPanel` (previously a disabled "coming soon" placeholder) and the Settings calibration dialog (`BrandingLayoutDesigner`).

**Backward compatibility is structural, not incidental.** `rotation` absent means "never rotated," and the two central transform emitters (`brandingElementTransform`, `applyBrandingElementStyle`) emit **no `rotate()` term at all** for such an element — not `rotate(0deg)`. A layout saved before this feature existed, or an element reset back to 0°, produces the exact same transform string as before this release (`translate(...) scale(...)`), verified byte-for-byte in tests. `clampBrandingElementLayout` drops the `rotation` key entirely at 0°, so a reset element's stored JSON is indistinguishable from one that was never rotated.

**Transform order (`translate → rotate → scale`) is fixed in exactly two functions** and never re-derived elsewhere, which is what keeps Screen / Accurate Preview / Print / Saved PDF in agreement without any of those paths knowing rotation exists — they all clone the same live DOM with the same inline `style.transform`. Order matters mechanically: `translate` must precede `rotate` so the offset is interpreted in the parent's unrotated coordinate space, otherwise pointer-delta drag tracking would drift off at an angle once the element is rotated.

**Resize gesture un-rotates the pointer delta** by the element's own angle before computing the grow/shrink travel — without this, "pull the handle outward" would read as shrink at certain rotation angles (e.g., 90°) because the visual diagonal no longer aligns with the screen axes the calculation averages over. Both rotation handles are DOM **siblings** of the image, never children, so neither inherits the image's own `rotate()`/`scale()` — a rotated ancestor would inflate `measureRenderScale`'s bounding-rect read to an axis-aligned box and corrupt both drag and resize math for every subsequent gesture.

**Not changed:** the `BrandingLayoutBounds` travel/scale envelope (rotation deliberately has no bounds entry — a full turn is a full turn on every document, unlike per-document position/scale limits); the `print.brandingLayout` settings key or its Save/Undo/Redo cycle (rotation is one more field on the same per-element object, so it inherits all four for free); Prisma schema, backend routes, IPC channels (frontend-only); Multi-Signature architecture (deferred, untouched); Google Drive Deployment Pack in-progress working-tree edits (`.gitignore`, `electron-builder.yml`, `electron/services/googleDriveAuth.service.ts`, and untracked `electron/__tests__/`, `electron/resources/`, `electron/services/__tests__/googleDriveClientConfig.pure.test.ts`, `electron/services/googleDriveClientConfig.pure.ts`) — surgically excluded from every commit in this release, confirmed still uncommitted after merge; pre-existing unrelated git stashes — confirmed untouched.

---

## Previous Release — EN+HI Administrative Forms v1

| Field | Value |
|-------|-------|
| **Package** | EN+HI Administrative Forms v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-29 |
| **Feature branch** | `feature/en-hi-administrative-forms-v1` (kept — not deleted per explicit instruction) |
| **Baseline** | `production` @ `19a65e4c` (previous release's final documentation commit) |
| **Feature commit** | `627fbfb` |
| **Production merge commit** | `7ec79643` |
| **Stable tag** | `stable-en-hi-administrative-forms-v1` → merge `7ec79643` (annotated) |
| **Reviews** | Product Owner manual visual review — **completed & approved**, in two passes: the Leave Request EN+HI pilot, then the four-form rollout (Return to Work / Salary Advance / Resignation / Employee Warning). |
| **Validation** | frontend `tsc --noEmit` ✅ · `build:front` ✅ — re-verified on `production` immediately after merge, byte-identical · `leaveRequestEnHiPilot.test.tsx` 44/44 ✅ · `administrativeFormsEnHiRollout.test.tsx` 49/49 ✅ · backend/electron/Prisma not touched, not re-run (frontend-only release) · full frontend suite last run at 2181 tests / 2156 passing / the same 25 pre-existing unrelated failures — unchanged since, not re-run for this release per explicit scope instruction |

**Scope.** Adds a third document variant — **English + हिन्दी**, one line per field (`English — हिन्दी`) — to five administrative forms: Leave Request, Return to Work, Salary Advance, Resignation, Employee Warning. Selected per form via a new three-way `FormVariantToggle` (Arabic / English / EN+HI). The existing Arabic and English templates for all five forms are **byte-unchanged** (verified file-by-file before every commit); the new variant lives entirely in new `forms/enhi/` template files, selected by the page — never a third branch inside an existing template. `FormDocVariant` (`'ar' | 'en' | 'en-hi'`) is a type independent of the UI's `Lang` (`'ar'|'en'`), resolved to `Lang` only at the shell boundary (`toLayoutLang`) — no widening of the app-wide i18n dictionary type, no new translation-completeness surface.

**Delivery sequence.** PHASE 1 built the pilot on Leave Request alone and, after visual review flagged a two-page overflow (stacked EN/HI sub-lines), corrected every label/section/paragraph/signature to render EN and HI **inline on one line** separated by a fixed ` — `, restoring one-page A4 output (measured +2.7mm vs. the English template in a real Chromium harness with the built fonts loaded, zero wrapped labels, zero overflow). PHASE 2 then rolled the approved architecture out to the remaining four forms **without touching any PHASE 1 shared file** (`FormLayout.tsx`'s opt-in `docFontStack`/`approvalSecondaryLabels` props, `ApprovalSection.tsx`'s opt-in secondary-label rendering, `enHiLabels.ts`, `enHiStyles.ts`, `enHiText.tsx`, `businessTermsHi.ts` — all byte-identical before and after PHASE 2, confirmed per-file) — each new form's dictionary lives in its own new `*EnHiLabels.ts` file to avoid re-touching approved code.

**Font.** Noto Sans Devanagari (SIL OFL 1.1) bundled locally as two woff2 weights (Regular/SemiBold, `devanagari` subset only) — no CDN, no reliance on a Windows system font. Layered **after** Cairo in a new `DOC_FONT_STACK_EN_HI` stack (`fontRegistry.ts`), so Latin text and digits resolve to Cairo exactly as the English template does, and Devanagari is reached only for codepoints Cairo/Arial don't cover. Reaches Accurate Preview and Save-PDF through the existing `capturePrintStyles`/`absolutizeUrls` mechanism (the same fix that already made IBM Plex/Tajawal load in the hidden PDF window) — no new preview/print/PDF path.

**Hindi dynamic terms.** New sibling module `lib/businessTermsHi.ts` (mirrors `businessTerms.ts`'s shape, does not modify it) resolves job title/department to Hindi via new `dict.forms.hi.*` Setting keys, falling back **Hindi → English → stored Arabic** (never inventing a translation). Company Settings gained two dictionary tabs (Job Titles (Hindi) / Departments (Hindi)) reusing the existing `DictTable` editor. No new term categories were needed — both rollout forms and the pilot use only the `jobTitle`/`department` categories already seeded in PHASE 1.

**Not changed:** the Arabic and English templates of all five forms; Employment Contract (template, page, or its `dict.nationalities`/`dict.jobTitles` dictionary — isolation re-verified); `Lang`, `lib/i18n.ts`'s dictionary shape, or any existing translation-completeness contract; `PRINT_PROFILES`, `FORM_BRANDING_DOC_KEYS`, Branding Designer, Ink Color System v2, `composeDocument`/`composeStyledFromNode`/`printCenter`; backend, Prisma schema, permissions; Google Drive Deployment Pack in-progress working-tree edits (`.gitignore`, `electron-builder.yml`, `electron/services/googleDriveAuth.service.ts`, and untracked `electron/__tests__/`, `electron/resources/`, `electron/services/__tests__/googleDriveClientConfig.pure.test.ts`, `electron/services/googleDriveClientConfig.pure.ts`) — surgically excluded from every commit in this release, confirmed still uncommitted after merge; the 5 pre-existing unrelated git stashes — confirmed untouched.

---

## Previous Release — Multi-Signature & Stamp Persistence Fix v1

| Field | Value |
|-------|-------|
| **Package** | Multi-Signature & Stamp Persistence Fix v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-29 |
| **Feature branch** | `feature/multi-signature-stamp-persistence-fix-v1` (kept — not deleted per explicit instruction) |
| **Baseline** | `production` @ `f45443ba` (previous release's final documentation commit) |
| **Feature commit** | `d67e2dc` |
| **Production merge commit** | `5d893805` |
| **Stable tag** | `stable-multi-signature-stamp-persistence-fix-v1` → merge `5d893805` (annotated) |
| **Reviews** | Product Owner manual visual review — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · Prisma `validate` ✅ · `build:front` ✅ · `build:back` ✅ · backend suite 138 files / 2009 tests ✅ (unaffected — no backend files touched) · frontend suite 2181 tests, 2156 passing, 25 pre-existing failures across the same 8 unrelated files as baseline (`wysiwygPreviewPoc` and 7 others) — identical file set and count, **zero new regressions** · 67 new/updated unit tests (list-mutation purity, id-collision resistance, save-path wiring, save→reload round-trips) all passing · 18-check end-to-end scenario against the real Express/Zod/Prisma/SQLite stack on a throwaway database copy (two signatures + two stamps → save → reload → edit name/default → reload → delete default → reload → delete all stamps → reload), all 18 passed, real dev database confirmed byte-identical afterward · re-verified on `production` immediately after merge (all three `tsc --noEmit`, `prisma validate`, both builds, both full suites) — byte-identical to pre-merge results |

**Scope.** An Audit-then-Fix pair against a reported defect: saving a second signature or stamp in Company Settings did not survive a reload. Root cause, proven against the real dev database: Multi-Signature & Stamp Management v1's Settings UI moved every list edit (add/upload/delete/set-default/show-hide) to local React state only, leaving the single top "حفظ" button as the sole writer — any edit not followed by an explicit top-level save was lost on reload, which is exactly what "the second signature won't save" looks like. The storage layer itself (`print.signatures`/`print.stamps`, legacy mirrors, `express.json({limit:'10mb'})`, unbounded `Setting.value`) was proven innocent by a direct round-trip test before any code changed.

**Fix.** Every asset-list mutation in `Settings.tsx` now persists itself: structural changes (add, upload, delete, set-default, show/hide) write immediately on a single deliberate click; free-text edits (name/job title) debounce 800ms so typing a name is one `PUT`, not one per keystroke. Writes are serialized through a promise chain (`assetSaveChain`) so two quick edits can never land out of order, and every write reads the newest snapshot from a ref (`assetsRef`) rather than a React-state closure — closing a real race where an edit made while an image upload's `await` was in flight would otherwise be silently dropped. A pending debounced edit flushes on page unmount. List-mutation logic (`appendBrandingAsset`/`removeBrandingAsset`/`setDefaultBrandingAsset`/`toggleBrandingAssetVisibility`/`updateBrandingAssetField`/`setBrandingAssetImage`) was extracted into pure, independently-tested functions in `brandingAssets.ts`; `Settings.tsx` now only wires them to persistence. Upload errors render inside the specific card that failed instead of below the whole section (previously invisible below the fold with 3+ assets). `Date.now()`-based asset ids replaced with `crypto.randomUUID()` (with a constant-collision fallback) — the old scheme could produce duplicate React keys from a fast double-click on "إضافة".

**Storage contract — zero change.** Same `print.signatures`/`print.stamps` Setting keys, same legacy single-image mirrors (`print.signatureImage`/`showSignature`, `print.stampImage`/`showStamp`), no Prisma migration, no new Setting key. `CompanyPrintData`, `BrandingLayout`, Branding Designer, Ink Color System v2, Accurate Preview, Print, and PDF export are byte-unchanged — this release touches only how the Settings page writes the two asset lists it already owned.

**Not changed:** any document's rendering, layout, or ink logic; multi-selection inside documents (still one signature + one stamp per document, unchanged by design — explicitly out of scope for this fix); backend, Prisma schema, permissions; Google Drive Deployment Pack in-progress working-tree edits (`.gitignore`, `electron-builder.yml`, `electron/services/googleDriveAuth.service.ts`, and untracked `electron/__tests__/`, `electron/resources/`, `electron/services/__tests__/googleDriveClientConfig.pure.test.ts`, `electron/services/googleDriveClientConfig.pure.ts`) — surgically excluded from every commit in this release, confirmed still uncommitted after merge; the 5 pre-existing unrelated git stashes — confirmed untouched.

---

## Previous Release — Administrative Forms English Translation Completion v1

| Field | Value |
|-------|-------|
| **Package** | Administrative Forms English Translation Completion v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-29 |
| **Feature branch** | `feature/administrative-forms-english-translation-completion-v1` (kept — not deleted per explicit instruction) |
| **Baseline** | `production` @ `42bc2873` (previous release's final documentation commit) |
| **Feature commit** | `a2ded11` |
| **Production merge commit** | `f59c5477` |
| **Stable tag** | `stable-administrative-forms-english-translation-completion-v1` → merge `f59c5477` (annotated) |
| **Reviews** | Product Owner manual visual review — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · Prisma `validate` ✅ · `build:front` ✅ · `build:back` ✅ · backend suite 138 files / 2009 tests ✅ · frontend suite 2146 tests, 25 pre-existing failures across 6 unrelated files (`chequePrintInkIsolation`, `currencyHeaderCompleteness`, `financialCenterTables`, `formsRegistryTranslationAudit`, `universalPrintPreviewCorrective`, `wysiwygPreviewPoc`) — identical file set and failure count to the pre-pack baseline, **zero new regressions** · 55 new tests for the resolver + form rendering + Employment Contract isolation, all passing · re-verified on `production` immediately after merge (both `tsc --noEmit`, `prisma validate`, both builds, both full suites) |

**Scope.** Closes the English-mode translation gap for administrative/HR print forms: switching a form to English previously translated static labels only, leaving dynamic business values (Job Title, Department, Nationality, Certificate Purpose) in Arabic — e.g. Job Title `سائق شاحنة` and Department `السائقين` stayed Arabic under English labels. A single centralized resolver (`frontend/src/lib/businessTerms.ts`, `resolveBusinessTerm()`) now serves all of them: Arabic mode always shows the stored value; English mode shows the configured translation from Company Settings; a translation gap falls back to the stored Arabic value verbatim — never invented at print time, never a per-form mapping. 9 forms migrated: Leave Request, Return to Work, Resignation, Salary Advance, Employee Warning, Performance Evaluation, Salary Certificate, To Whom It May Concern, Purchase Request (all via `useBusinessTerms()` from `stores/settingsStore.ts`).

**Dictionary architecture.** Extends the existing Company Settings dictionary mechanism (`Setting` table, JSON `{arabic: english}`) rather than building a second one, under 4 new additive keys: `dict.forms.nationalities`, `dict.forms.jobTitles`, `dict.forms.departments`, `dict.forms.certificatePurposes`. Company Settings' "قاموس الترجمة" section now shows **two clearly labeled, fully isolated groups** using the same shared `DictTable` editor: **Administrative Forms** (the 4 keys above, own seed dictionaries) and **Employment Contract** (`dict.nationalities` / `dict.jobTitles`, unchanged keys, unchanged seed values, unchanged behavior). No Prisma migration; no destructive change to any existing `Setting` row.

**Employment Contract isolation (data and code, both directions).** `businessTerms.ts` does not import `forms/shared/contractTranslations.ts` and owns its own seed tables (`BASE_FORM_JOB_TITLE_EN`, `BASE_FORM_NATIONALITY_EN`) distinct from the contract's `BASE_JOB_TITLE_EN`/`BASE_NATIONALITY_EN` (different casing convention by design — Title Case for forms vs. the contract's formal upper-case). `EmploymentContractTemplate.tsx` and `pages/EmploymentContract.tsx` are byte-for-byte unmodified. Guarded by `employmentContractExclusionGuard.test.ts` (11 tests): no pack symbol/import reaches the contract's render path; editing every administrative-forms dictionary with shocking values never changes `getJobTitleEn()`/`getNationalityEn()` output; editing the contract's dictionary never changes `resolveBusinessTerm()` output for any form; settings rows carrying only contract keys parse to the forms' default (seeded) dictionaries with no leakage in either direction.

**Not changed:** Employment Contract template/screen/dictionary/print/PDF path, Accurate Preview, Ink Color System, signatures/stamps, any backend module, Prisma schema, permissions; Google Drive Deployment Pack in-progress working-tree edits (`.gitignore`, `electron-builder.yml`, `electron/services/googleDriveAuth.service.ts`, and untracked `electron/__tests__/`, `electron/resources/`, `electron/services/__tests__/googleDriveClientConfig.pure.test.ts`, `electron/services/googleDriveClientConfig.pure.ts`) — surgically excluded from every commit in this release, confirmed still uncommitted after merge; the 5 pre-existing unrelated git stashes — confirmed untouched.

---

## Previous Release — Employee Entitlements Core, Statement & Final Settlement v1

| Field | Value |
|-------|-------|
| **Package** | Employee Entitlements Core, Statement & Final Settlement v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-29 |
| **Feature branch** | `feature/employee-entitlements-core-statement-v1` (kept — not deleted per explicit instruction) |
| **Baseline** | `production` @ `958b8a7b` (Font Foundation Pack v1's final documentation commit) |
| **Feature commit** | `d745600c` |
| **Production merge commit** | `7408fa05` |
| **Stable tag** | `stable-employee-entitlements-final-settlement-v1` → merge `7408fa05` (annotated) |
| **Reviews** | Product Owner manual visual/functional review — **completed & approved**. Gemini final independent review — **APPROVED, READY FOR RELEASE**, no BLOCKER/HIGH/MEDIUM/LOW findings. |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · Prisma `validate` ✅ · `build:front` ✅ · `build:back` ✅ · backend suite 138 files / 2009 tests ✅ (focused Employee Entitlements/Final Settlement suites plus full-repo regression, all passing) · Prisma `migrate status` up to date (48 migrations applied, including the two additive migrations this pack introduces) · re-verified on `production` immediately after merge (`tsc --noEmit` backend, `prisma validate`) |

**Scope.** A four-session build-out landing as one release: (1) **Entitlements Core** — a single canonical calculation engine (`backend/src/modules/employees/entitlements.calc.ts`) where the entitlement wage is `Employee.salary` **only** (no allowances, no `Payroll.snapshotBaseSalary`, no `PayrollAllowance`), annual leave accrues at 30 days/year gated by 6 completed months of service (accrual counted from the original hire date, not from the eligibility date), the daily-wage divisor is 26 (an approved manarERP calculation rule, not presented as verbatim statute), and all service-duration/date-boundary arithmetic is calendar-day-safe (normalized to UTC midnight) so the same `asOf` produces the same result at any hour. (2) **Employee Statement** — "تفاصيل مستحقات الموظف" (`frontend/src/pages/EmployeeEntitlementsCenter.tsx`), a progressive-disclosure statement replacing the older dense multi-card layout: financial-position hero, annual-leave summary, payment history, and collapsed-by-default calculation-details/EOS-estimate/historical-activity/leave-history sections. (3) **Entitlement payments** — create/edit/delete against `EmployeeEntitlementLedger`, with backend-authoritative overpayment rejection (never clamped) and edit validation that excludes the payment being edited from the "already paid" total. (4) **Final Settlement v1** — a new bounded sub-domain (`employee-entitlements/finalSettlement.service.ts`) with its own lifecycle `DRAFT → APPROVED (frozen snapshot) → PAID (derived from persisted settlement payments) → CANCELLED (terminal history state, snapshot and payments preserved, never deleted)`; settlement payment edit/delete with lifecycle re-derivation (e.g. lowering a payment on a `PAID` settlement automatically reopens it to `APPROVED`); and a SQLite **partial unique index** (`WHERE status <> 'CANCELLED'`) enforcing "at most one active settlement per employee, unlimited cancelled history" — expressed as raw SQL in the migration because Prisma's schema language has no partial-index syntax.

**Data model.** Two additive Prisma migrations, no destructive change to any existing table: `20260729120000_add_employee_final_settlement` (creates `employee_final_settlements` and `final_settlement_payments`) and `20260729140000_final_settlement_cancellation` (adds `cancelledAt`/`cancelledBy`/`cancellationReason`, replaces the original `UNIQUE(employeeId)` with the partial unique index described above). **The partial index is intentional and must be preserved** — it is invisible to `prisma migrate dev`'s drift detection (Prisma has no syntax to declare it), so a future `prisma migrate dev` run may propose dropping it; do not accept that suggestion.

**Retired:** the duplicate `employee-entitlements/calculators/legalEntitlementCalculator.ts` re-export shim (zero consumers, superseded by the single canonical engine) and the old settlement-adjacent UI (`EntitlementLedgerDialog.tsx`, `LeaveSettlementDialog.tsx`, `entitlementLedgerDisplay.ts` + its test) that predated this pack's payment/settlement model.

**Not changed:** Payroll calculation/approval/payment, `SalaryPayment`, the NBK bank export, any Accounting/GL posting, Leave record semantics, or `Employee.status` write paths — Final Settlement approval/payment/cancellation never mutates `Employee.status`, and `Employee.status` never gates or activates a settlement; Google Drive Deployment Pack in-progress working-tree edits (`.gitignore`, `electron-builder.yml`, `electron/services/googleDriveAuth.service.ts`, and untracked `electron/__tests__/`, `electron/resources/`, `electron/services/__tests__/googleDriveClientConfig.pure.test.ts`, `electron/services/googleDriveClientConfig.pure.ts`) — surgically excluded from every commit in this release, confirmed still uncommitted after merge; the 5 pre-existing unrelated git stashes — confirmed untouched.

---

## Previous Release — Font Foundation Pack v1

| Field | Value |
|-------|-------|
| **Package** | Font Foundation Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-29 |
| **Feature branch** | `feature/font-foundation-pack-v1` (kept — not deleted per explicit instruction) |
| **Baseline** | `production` @ `7942ce88` (documentation commit from the prior release) |
| **Feature commit** | `d645e34f` |
| **Production merge commit** | `60f358b6` |
| **Stable tag** | `stable-font-foundation-pack-v1` → merge `60f358b6` (annotated) |
| **Reviews** | Product Owner Manual Visual Review — **completed & approved** (Blank A4, Quotation, one administrative form, one payment voucher). |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · Prisma `validate` ✅ · `build:front` ✅ · `build:back` ✅ · new suites `pdfComposedDocumentPilotFidelity`/`pdfComposedDocumentPilotMigration`/`pdfComposedDocumentPilotScope` (composition fidelity, all 12 `FormLayout` consumers verified off the retired flag, repo-wide sweep for zero remaining references) ✅ · full frontend suite re-run pre- and post-merge (25 pre-existing baseline failures across 8 files, unchanged in file and count against `production` HEAD `7942ce88`) ✅ · backend suite 135 files/1902 tests ✅ (unaffected — no backend files touched) |

**Scope.** Two related problems solved together across a multi-phase migration (Phases 1 through 5D): scattered, literally-duplicated font-stack strings, and a real architectural gap where Saved PDF output could visually diverge from Accurate Preview because PDF export hand-rebuilt its own CSS instead of reusing the shared composition pipeline.
- **Font registry.** `frontend/src/styles/fontRegistry.ts` and `backend/src/shared/services/reportEngine/fonts.ts` (kept separate — no shared build boundary between the two TS programs) now hold the single source of truth for `UI_FONT_STACK`, `CHART_FONT_STACK`, `MONO_FONT_STACK`, `DOC_FONT_STACK`/`docFontStack()`, `EMBEDDED_DOC_FONT_FAMILY`, and `buildEmbeddedFontFaceCss()` — replacing roughly twenty duplicated literal font-stack strings across chart components, inline styles, and CSS files with three different quoting styles all producing the same computed value. Architectural only: every constant equals verbatim what was previously written at its site — no new weight, no dropped fallback, no surface's rendered font changed.
- **Unified PDF pipeline.** `FormLayout.doExportPdf` and `BlankA4Print.doExportPdf` now both call `composeStyledFromNode` — the same clone-and-capture composition function `useAccurateFormPreview` already used for the "Accurate Preview" dialog — instead of the retired `buildFormPdfDocument`, which hand-rebuilt CSS independently and could drift from what Preview showed. The transitional `pdfUseComposedDocument` opt-in prop (used across Phases 5A–5C to gate the migration form-by-form) is fully removed from `FormLayout`'s props — all 12 consumers use the unified path unconditionally, with no per-form branching left in the shared layer.
- **Retired dead code.** `frontend/src/forms/shared/formPdfDocument.ts` (`buildFormPdfDocument`, zero remaining production consumers after the FormLayout/Blank A4 migration) and `backend/src/shared/services/reportEngine/pdf.service.ts` (dead PDFKit-based builder, zero production consumers, referenced an Amiri-Regular.ttf font file that never existed in the repo) are both deleted.
- **Token rename.** `--font-ui` → `--app-font-ui` across `app/theme.css` and 8 dependent stylesheets/components, matching the existing `--app-font-mono` naming convention (chosen to avoid any future collision with Tailwind v4's own theme-layer tokens; confirmed via built-CSS inspection that today's rename has zero actual collision, unlike the proven `--font-mono` collision that motivated the `--app-` prefix originally).
- **Test architecture.** Multiple tests were rewritten from brittle raw-string assertions (`.toContain('buildFormPdfDocument')`, `.not.toContain('ruler')`) to `DOMParser`-based behavioral assertions on the actual exported DOM, after root-causing that `capturePrintStyles`'s wholesale stylesheet capture legitimately includes inert CSS selector text (e.g. `.blank-a4-ruler-top {...}`) even when no matching element exists in the composed document.

**Deferred (documented, not in scope):** IBM Plex Mono font loading (referenced in `MONO_FONT_STACK` but never actually loaded in the project — every use already falls back to system `monospace`, and that is today's approved appearance), Template Studio fallback chains, `print-templates/utils/textStyleOverrides.ts` (a user-facing designer choice, not an architectural constant), any new font weights or size/line-height changes, and the handful of pages (`BankAccounts.tsx`, `BankSalaryAnalytics.tsx`, `BankAccountExplorer.tsx`, `DateCalendarPicker.css`, `RootErrorBoundary.css`) whose font stacks are genuinely different from the unified constants — unifying those would be a visual decision independent of this architectural pack.

**Not changed:** the backend Prisma schema or any API endpoint; any document's rendered font, weight, or fallback chain (registry values are verbatim copies of prior literals); `print.brandingLayout` or any branding/ink-color system; Google Drive Deployment Pack in-progress working-tree edits (`.gitignore`, `electron-builder.yml`, `electron/services/googleDriveAuth.service.ts`, and untracked `electron/__tests__/`, `electron/resources/`, `electron/services/__tests__/googleDriveClientConfig.pure.test.ts`, `electron/services/googleDriveClientConfig.pure.ts`) — surgically excluded from every commit in this release, confirmed still uncommitted after merge; the 5 pre-existing unrelated git stashes — confirmed untouched.

---

## Previous Release — Ink Color System v2

| Field | Value |
|-------|-------|
| **Package** | Ink Color System v2 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-28 |
| **Feature branch** | `feature/ink-color-system-v2` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `4b2e2073` (documentation commit from the prior release) |
| **Feature commit** | `1d4652f` |
| **Production merge commit** | `5a220235` |
| **Stable tag** | `stable-ink-color-system-v2` → merge `5a220235` (annotated) |
| **Reviews** | Product Owner Manual Visual & Physical Print Review — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · Prisma `validate` ✅ · `build:front` ✅ · new `inkColorSystem` suite 26/26 (backward-compat fallback, SVG filter defs, signature/stamp independence, geometry untouched, storage round-trip, coverage across every branding-enabled document type, Undo/Redo) ✅ · `formBrandingDesignMode`/`salaryCertificateWideBoundsExperiment` re-run clean after the Reset-clears-color change ✅ · full frontend suite re-run pre- and post-merge (25 pre-existing baseline failures across 8 files, unchanged in file and count against `production` HEAD `4b2e2073`) ✅ · backend suite 135 files/1902 tests ✅ (unaffected — no backend files touched) |

**Scope.** Signature/stamp ink color moves from one GLOBAL `localStorage['manar.inkMode']` value — read once by every document's `useBrandingDesigner` instance, so a color picked while designing one document silently leaked into every other document opened afterward — to a per-element field on `BrandingElementLayout` (`inkMode?: InkMode`), the exact same object `x`/`y`/`scale`/`opacity`/`zIndex` already live on, inside the existing `print.brandingLayout` Setting. No second store: independence for signature vs stamp and independence per document both fall out of that one data-model change, and Save/Reset/Undo/Redo cover color for free (history already snapshots the whole layout object).
- **Colors.** `original`/`black` unchanged. Four new realistic ballpoint-blue shades — Dark (`#12276B`), Medium (`#1F3F94`), Royal (`#2A52BE`), Blue-Violet (`#3D3B8E`) — via SVG `feColorMatrix`, the SAME technique already shipped and print-verified in `FormHeader.tsx`'s logo recolor (Payment Voucher / Ready Paper). A constant-matrix recolor targets every non-transparent pixel to the exact ink RGB while leaving the ALPHA channel completely untouched, so antialiased edges and any density encoded via partial transparency (the normal encoding for a transparent-background signature/stamp PNG) survive exactly as before — verified by a test asserting the matrix's alpha row is `0 0 0 1 0` (passthrough, no offset). The source image file is never touched. Legacy `blue-ink` keeps its exact old CSS `sepia(100%) saturate(200%) hue-rotate(190deg)` filter, unreachable from the new picker but still resolvable for backward compatibility.
- **Backward compatibility.** An element with no saved `inkMode` (every pre-v2 document) resolves through `resolveInkMode()` to the legacy `localStorage['manar.inkMode']` default — now read-only, never written going forward — so no existing design's appearance changes silently. `resetElement`/`resetDoc` explicitly write `inkMode: undefined` (not a hardcoded color), restoring the exact "never customized" state. Two latent bugs were fixed while wiring this through: `clampBrandingElementLayout` reconstructed its return object from an explicit field list that would have silently dropped `inkMode` on every clamp (fixed by spreading `...el` first); `patchDoc`'s `{...current, ...patch}` merge does not clear a key ABSENT from `patch`, so Reset needed `inkMode: undefined` written explicitly rather than omitted.
- **Design Mode.** The shared `BrandingDesignerPanel` gained a per-element color-swatch picker — operating on `docLayout[selected].inkMode` via the same `updateElement(selected, {...})` call every other property (position, scale, opacity) already uses — with live preview, no parallel Design Mode or color engine. Because Invoice, Quotation, all ten administrative forms, and Blank A4 Free Print all render this same panel, every document type is covered by this one change.
- **Export fidelity.** Each colored image's SVG `<filter>` definition renders as a DOM SIBLING of that image (self-contained, one stable id per color), so PDF export and the accurate preview — which both clone the printable subtree, not the whole document — carry the filter definition with them; a `url(#id)` reference that resolved to nothing after cloning would have silently dropped the color.
- **Data model.** `CompanyPrintData.inkMode` (the single field this supersedes) removed cleanly from the type and both print-data builders (`invoicePrintDataBuilder.ts`/`quotationPrintDataBuilder.ts`); `InvoicePreview.tsx`/`QuotationBase.tsx` now read `brandingLayout.signature.inkMode`/`.stamp.inkMode` directly instead of a single shared field. `useBrandingDesigner`'s old global `inkMode`/`setInkMode` mechanism was removed entirely (superseded, not deprecated-in-place).

**Not changed:** the backend, Prisma schema, or `print.brandingLayout`'s Setting key (one new optional field, same key); any document's position/size/opacity/z-index behavior or movement bounds; Google Drive Deployment Pack in-progress working-tree edits — surgically excluded from every commit in this release, confirmed still uncommitted after merge.

---

## Previous Release — Blank A4 Free Print v1

| Field | Value |
|-------|-------|
| **Package** | Blank A4 Free Print v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-28 |
| **Feature branch** | `feature/blank-a4-free-print-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `cdf86d7d` (documentation commit from the prior release) |
| **Feature commit** | `bdb0fde5` |
| **Production merge commit** | `0861ee43` |
| **Stable tag** | `stable-blank-a4-free-print-v1` → merge `0861ee43` (annotated) |
| **Reviews** | Product Owner Manual Visual & Physical Print Review — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · Prisma `validate` ✅ · new `blankA4Print` suite 19/19 (incl. 8 dedicated regression tests, one per root cause found in manual review) ✅ · `salaryCertificateWideBoundsExperiment`/`brandingLayout`/`formBrandingDesignMode` re-run clean after the bounds-exception change ✅ · full frontend suite re-run pre- and post-merge (25 pre-existing baseline failures across 8 files, unchanged in file and count against `production` HEAD `cdf86d7d`) ✅ · backend suite 135 files/1902 tests ✅ (unaffected — no backend files touched) · `routerFutureFlags`'s pinned `lazy(` count updated 49→50 for the new lazy-loaded route (legitimate, not a regression) |

**Scope.** A new "blank A4 sheet" administrative form for stamping a company signature/stamp over an externally pre-printed page already loaded in the printer — developed across three review rounds (initial build, a post-visual-review geometry fix, and a movement/ruler follow-up) and released together.
- **Reuses the existing Multi-Signature & Stamp system verbatim** (`useCompanyBranding`/`useBrandingSelection`/`BrandingAssetPicker`) and the **existing Design Mode** (`useBrandingDesigner`/`BrandingDesignerPanel`/`DesignableBrandingImage`) — no parallel design engine. Deliberately bypasses `FormLayout`/`ApprovalSection`, which always render a title, form-number, QR code and approval label with no opt-out; the new page (`frontend/src/pages/BlankA4Print.tsx`) composes the same lower-level building blocks directly, so the sheet carries only the two branding images and nothing else.
- **One A4 coordinate system for all four consumers.** The sheet element (`.form-page.blank-a4-sheet`) IS the physical page — `210mm × 297mm`, `@page { size: A4; margin: 0 }`, `padding: 0` — so the coordinate origin is the sheet's true top-left corner and a 297mm-tall element fits the printable band exactly (no second page, the root cause of an earlier review-round defect where 10mm `@page` margins left only a 277mm band for a 297mm sheet). The print CSS *asserts* this geometry (`height: 297mm !important`) rather than relaxing it — a `height: auto` rule was the root cause of a second defect where the sheet's own box (whose children are all absolutely positioned) collapsed to zero height, pulling the signature/stamp into the header band in both physical print and the accurate preview (which captures the same live stylesheets via `capturePrintStyles`). The same inline mm geometry travels into the PDF export document (`marginsAsPagePadding: true` with zero margins), keeping Design Mode, accurate preview, PDF and physical print in agreement.
- **Movement envelope — one documented exception, not a widened default.** `blank-a4-print` is added to a new, closed per-document override table (`BOUNDS_BY_DOC` in `print-templates/utils/brandingLayout.ts`) rather than widening the shared `BRANDING_LAYOUT_BOUNDS` (±150px, unchanged for every other document — invoice, quotation, and all nine `ApprovalSection`-footer forms). The wider range (x ≈ ±537px, y ≈ −794…+329px) is *derived*, not picked: from the sheet's real 210×297mm dimensions and the two element anchors (signature 68mm/210mm, stamp 142mm/210mm from the sheet corner) — each anchor's centre can reach any point of the sheet. Scale stays 0.2–4×, unchanged. `clampBrandingElementLayout`/`brandingElementTransform`/`applyBrandingElementStyle` now take an optional `bounds` parameter (default: the central envelope — every pre-existing caller unaffected), and `useBrandingDesigner` resolves it once via `getBrandingLayoutBounds(docType)` so drag, the resize handle, the panel sliders, undo/redo, save, and the render-time display transform (`DesignableBrandingImage`) all clamp with the *same* range — a saved wide position is never silently pulled back on display.
- **Four screen-only cm rulers**, one per edge (top/bottom/left/right, 0→21cm horizontally, 0→29.7cm vertically), 1mm/5mm/1cm graduation matching the sheet's own coordinate origin. Structurally excluded from every export path: each ruler (`frontend/src/forms/shared/A4Ruler.tsx`) is a DOM **sibling** of the printable sheet, not a descendant, and print/PDF/accurate-preview all clone the sheet node alone — the rulers are absent regardless of CSS, additionally marked `.no-print` as a second, defense-in-depth layer.
- **Registration is additive-only**: `blank-a4-print` added to `FORM_BRANDING_DOC_KEYS` (the single point that makes design mode, bounds resolution, and layout parse/serialize all "just work" for a new document type) and to `FORM_CARDS` (`requiresEmployee: false`, category `ops`) — the Forms hub and route wiring (`/forms/blank-a4-print`) follow the same pattern as Purchase Request/Receipt Voucher. No new permission key (reuses the shared `forms` module; the page makes no backend calls of its own).

**Not changed:** the backend, Prisma schema, any `Setting`-table structure or API endpoint (reuses the existing `print.brandingLayout` Setting with one new optional entry key); `FormLayout`, `ApprovalSection`, or any of the ten existing branding-enabled documents' rendered output or movement range; the shared `BRANDING_LAYOUT_BOUNDS` central envelope; the ink-color filter system (`inkFilter.ts` — audited during this release cycle and explicitly deferred to an independent future pack, since it is a *global* setting shared by every document, not scoped to this feature); Google Drive Deployment Pack in-progress working-tree edits (`.gitignore`, `electron-builder.yml`, `electron/services/googleDriveAuth.service.ts`, and untracked `electron/__tests__/`, `electron/resources/`, `electron/services/__tests__/googleDriveClientConfig.pure.test.ts`, `electron/services/googleDriveClientConfig.pure.ts`) — surgically excluded from every commit in this release, confirmed still uncommitted in the working tree after merge.

---

## Previous Release — Multi-Signature & Stamp Management v1

| Field | Value |
|-------|-------|
| **Package** | Multi-Signature & Stamp Management v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-28 |
| **Feature branch** | `feature/multi-signature-stamp-management-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `763d0881` (documentation commit from the prior release) |
| **Feature commit** | `5f43d3cc` |
| **Production merge commit** | `a6d6822e` |
| **Stable tag** | `stable-multi-signature-stamp-management-v1` → merge `a6d6822e` (annotated) |
| **Reviews** | Product Owner Manual Visual Review — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · new suites (`approvalSectionBranding` 28, `formBrandingDesignMode` 32, `brandingAssets` 32, `salaryCertificateWideBoundsExperiment` 21 — repurposed to guard the adopted central bounds) ✅ · full frontend suite re-run pre- and post-merge (25 pre-existing baseline failures across 8 files, unchanged in file and count against `production` HEAD `763d0881`) ✅ · backend suite 135 files/1902 tests ✅ (unaffected) · `build:front` ✅ |

**Scope.** Central system for registering multiple signatures and multiple stamps, choosing which one (or none) prints on each document, and designing its position/size independently per document — developed across four incremental rounds and released together.
- **Assets & storage** (`frontend/src/print-templates/branding/brandingAssets.ts`) — a `BrandingAsset { id, name, title, imageUrl, show, isDefault }` list per kind, stored as JSON under `Setting` keys `print.signatures` (pre-existing, previously written but unused) / `print.stamps` (new) — same `Setting` key/value table, no Prisma migration. Legacy single-image keys (`print.signatureImage`/`showSignature`, `print.stampImage`/`showStamp`) are kept as mirrors of the default asset, so every pre-existing database and un-migrated reader keeps working unchanged.
- **Selection** (`useBrandingSelection` + `BrandingAssetPicker`) — per-document choice of which signature/stamp to print, independent of layout: swapping an asset never disturbs a saved position. Wired into `Quotation.tsx`, `InvoicePreview.tsx`, `ReceiptVoucher.tsx`, and — via one opt-in `FormLayout` prop (`approvalBranding`) — nine administrative forms that share the `ApprovalSection` footer (`SalaryCertificate`, `ToWhomItMayConcern`, `LeaveRequest`, `ReturnToWork`, `SalaryAdvance`, `Resignation`, `EmployeeWarning`, `PerformanceEvaluation`, `PurchaseRequest`). Payment Vouchers (`hideApprovalSection` — no company approval slot) and Employment Contract (approval block present only on its English page — an asymmetric footer, not a safe generalization target) are explicitly excluded and documented as such, not silently skipped.
- **Design Mode generalization** (`useBrandingDesigner` + `BrandingDesignerPanel` + new `DesignableBrandingImage`) — the pre-existing Quotation/Invoice drag/resize/slider designer now serves all ten document types through one `BrandingDocKey` union and an optional per-document entry in the existing `print.brandingLayout` Setting (`PrintBrandingLayoutSettings`: `invoice`/`quotation` stay required, form keys are `Partial` — an undesigned form has no entry and resolves to the identity transform, rendering exactly as before). `DesignableBrandingImage` composes the layout's `transform` onto whatever `baseStyle` the caller already had, so geometry is unchanged for every undesigned document. Resize is a single uniform `scale` end to end (never a width/height pair), so an image's aspect ratio cannot change regardless of how the handle is dragged.
- **Bounds — trialed, then adopted centrally.** An experimental wide envelope was first scoped to Salary Certificate alone (`x`/`y` ±150, `scale` 0.2–4) via a per-document override table, verified not to leak into any other document. After visual approval, it was adopted as the **one central envelope for every document** — `BRANDING_LAYOUT_BOUNDS` — applied through a single `clampBrandingElementLayout()` with no per-document parameter, so drag, the resize handle, the panel sliders, the Settings calibration dialog's sliders, alignment, undo/redo, and the render-time clamp all agree by construction. The superseded Phase-4 constants (`PRINT_TEMPLATE_BOUNDS`, `FORM_BRANDING_BOUNDS`, `EXPERIMENTAL_WIDE_BOUNDS`, `DOC_BOUNDS_OVERRIDES`, `boundsForDocument()`) were removed, along with the `bounds` prop threaded through `ApprovalSection`/`DesignableBrandingImage`/`FormLayout`/`ReceiptVoucher` to support them.
- **Design mode lives outside `PrintWorkspace`** — its zoom `transform` would turn the panel's `position: fixed` into `absolute` and make it drift/scale with the document; the panel is `.no-print`, stripped by the same PDF-export path as every other override panel. The accurate preview, print dialog, and PDF export all compose from the same DOM node the designer edits, so they cannot disagree with what was saved.
- **Reset** restores the identity layout (`x:0, y:0, scale:1, opacity:1, zIndex:1`) — the template's own original placement, verified byte-for-byte against pre-feature rendering for every touched document.

**Not changed:** the backend, Prisma schema, any new `Setting`-table structure or API endpoint (every persistence path reuses `PUT /settings`); any form's content, margins, or `PrintProfile`; Payment Vouchers, Employment Contract, or any document not listed above.

---

## Previous Release — Unified Accurate Preview v1

| Field | Value |
|-------|-------|
| **Package** | Unified Accurate Preview v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-28 |
| **Feature branch** | `feature/unified-accurate-preview-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `5e944ef` (documentation commit from the prior release) |
| **Feature commit** | `4d6d485` |
| **Production merge commit** | `c3ac6ed` |
| **Stable tag** | `stable-unified-accurate-preview-v1` → merge `c3ac6ed` (annotated) |
| **Reviews** | Product Owner Manual Visual Review — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · full frontend suite re-run pre- and post-merge (25 pre-existing baseline failures across 8 files, unchanged in file and count against `production` HEAD `5e944ef`) ✅ |

**Scope.** Removed the "regular" print-preview overlay from every form, leaving the accurate WYSIWYG preview (`useAccurateFormPreview` / `WysiwygPreviewPocDialog`) as the sole preview path.
- **Two removed implementations of the same overlay** — the `useLegacyFormPreview` hook + `printIntercept` wiring used by 13 `FormLayout`-based forms plus Employment Contract and Payroll Payslip's own print gate, and the direct `PrintPreviewDialog`/Print-Center-Phase-2 wiring (with its "🔍 معاينة قبل الطباعة" secondary button) used by Receipt Voucher, Quotation (both Legacy and Engine modes), and the Invoice.
- **Print button now calls the print path directly** — no intercept, no forced preview-before-print — exactly the "flag OFF" behavior every one of these forms already had verified and approved during the prior legacy-preview and Print-Center rollouts.
- **Accurate preview untouched** — its button, dialog, document composer, and delegation to each page's original print function are byte-for-byte the same across all 16 form pages, including Receipt Voucher and the Invoice (which keeps its own independent `TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC` flag, unaffected).
- **Out of scope, deliberately** — the Cheque Calibration test-print preview (`ChequeCalibrator.tsx`, `CHEQUE_CALIBRATION_TEST_PREVIEW_V1`): an independent physical-measurement tool, not a business form, with no accurate-preview equivalent to fall back to.
- **Dead code removed** — the `PRINT_PREVIEW_LEGACY_FORMS_V1/FINANCE/HR/SPECIAL` and `PRINT_CENTER_PHASE2`/`_RECEIPT_VOUCHER`/`_INVOICE`/`_QUOTATION` flags, `isLegacyFormsPreviewEnabled`/`isPhase2Enabled`, their barrel exports, and two orphaned `btn.preview_before_print` i18n keys (ar/en). `printing/useLegacyFormPreview.tsx` is now fully unreferenced but was **not** deleted — file-deletion tooling (`rm`/`Remove-Item`) was denied by a repo-level permission/hook on repeated attempts; left in place at the Product Owner's explicit direction pending a manual deletion or a settings fix outside Claude's access.
- **Tests** — 3 files deleted (entire premise was the removed overlay), 8 files trimmed (kept only assertions still describing current behavior; the surviving accurate-preview and `PrintPreviewDialog`-component test suites are untouched).

**Not changed:** printing, PDF export, print profiles, any form's business logic/data/calculations, and the Cheque Calibration preview.

---

## Previous Release — Administrative Payment Voucher v1

| Field | Value |
|-------|-------|
| **Package** | Administrative Payment Voucher v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-28 |
| **Feature branch** | `feature/administrative-payment-voucher-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `ec8a637` (documentation commit from the prior release) |
| **Feature commit** | `e76bb09` |
| **Production merge commit** | `5f3695c` |
| **Stable tag** | `stable-administrative-payment-voucher-v1` → merge `5f3695c` (annotated) |
| **Reviews** | Product Owner Manual Visual Review — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · new `adminPaymentVoucher` suite (5 tests) + new `paymentVoucherTemplateMethod` suite (3 tests) ✅ · full frontend suite re-run pre- and post-merge (27 pre-existing baseline failures across 8 files, unchanged in file and count against `production` HEAD `ec8a637`) ✅ |

**Scope.** New "سند صرف" (Payment Voucher) card on the Forms page (`frontend/src/forms/shared/formsRegistry.ts` — `ops` category, `requiresEmployee: false`), opening a new standalone page `frontend/src/pages/AdminPaymentVoucher.tsx` with manual fields for voucher number, date, beneficiary name, amount (KWD, 3 decimals), description, payment method (cash/cheque/transfer), bank, and cheque number.
- **Template reuse, not duplication** — renders through the exact same `frontend/src/forms/PaymentVoucherTemplate.tsx` and its dedicated, non-selectable `payment-voucher` `PRINT_PROFILES` entry (12mm/15mm margins, `useLogoHeader`, `compactTopMargin`) that the Cheques module's `pages/PaymentVoucher.tsx` already uses — same header, fields, formatting, and Arabic/English toggle.
- **Template extension (additive, no regression)** — `PaymentVoucherTemplate` gains an optional `paymentMethod?: 'cash' | 'cheque' | 'transfer'` prop, defaulting to `'cheque'`. The Cheques flow never passes it, so its rendering is byte-for-byte unchanged; only the new administrative page passes the manually selected method, so the checkbox row reflects it instead of always marking "Cheque".
- **`ready-paper` audited and rejected** — its 40mm top margin is reserved for an absolutely positioned letterhead overlay over pre-printed blank paper; Payment Voucher uses its own compact margins with an in-flow logo header. Mixing them would break the voucher's tuned layout, so the existing dedicated `payment-voucher` profile was kept as the only compatible one.
- **Client-side form numbering** — `generateFormNumber('payment-voucher')` (`frontend/src/forms/shared/formNumber.ts`, prefix `PV`), the same no-backend convention already used by Quotation and Purchase Request. No Prisma/migration/backend change — the administrative form is print-only, matching the existing mechanism for this class of form.
- **Independence from Cheque Management** — no cheque selection, no `/cheques` API calls, no `PrintedCheque`/`markVoucherPrinted` interaction, no cheque-side print-status record. Covered by a dedicated test asserting `api.get`/`api.post` are never called from the new page.
- **i18n** — new `voucher.payment.title`, `page.paymentVoucher.*`, and `field.paymentVoucher.*` keys added to both Arabic and English (`frontend/src/lib/i18n.ts`).

**Not changed:** the Cheques module's `pages/PaymentVoucher.tsx` (auto-fill from cheque data, voucher-number allocation, batch preview, print-status tracking — all untouched and covered by the pre-existing `paymentVoucherBatchSafety` suite, which continues to pass), Prisma schema, any backend endpoint, `ready-paper`, `letterhead`, or any other form's template/content.

---

## Previous Release — Ready Paper Print Template & Receipt Voucher Redesign v1

| Field | Value |
|-------|-------|
| **Package** | Ready Paper Print Template & Receipt Voucher Redesign v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-28 |
| **Feature branch** | `feature/ready-paper-template-and-receipt-voucher-redesign-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `80f937b` (documentation commit from the prior release) |
| **Feature commit** | `83dd348` |
| **Production merge commit** | `aaec4cd` |
| **Stable tag** | `stable-ready-paper-template-and-receipt-voucher-redesign-v1` → merge `aaec4cd` (annotated) |
| **Reviews** | Multi-round iterative visual/print-layout review directly against the real running app (Playwright driving the dev server) and against a physical paper print — not preview/PDF alone, since the defect chain (screen-canvas clipping, then a printer hardware non-printable-edge band) was only reproducible outside static rendering. Product Owner Manual Visual Review of Ready Paper on multiple forms and of the redesigned Receipt Voucher — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · `build:front` ✅ · `build:back` ✅ · new `readyPaperGeneralization` suite (16 tests) + expanded `printWorkspace`/`printProfileToggle`/`employeeSmartFormsHub` suites ✅ · full frontend suite re-run pre- and post-merge (27 pre-existing baseline failures across 8 files, unchanged in file and count against `production` HEAD `80f937b`) ✅ |

**Scope — Ready Paper ("ورق جاهز").** New selectable `PRINT_PROFILES` entry (`frontend/src/forms/shared/printProfiles.ts`): margins byte-identical to `letterhead` (`40mm 10mm 20mm 10mm`) but carrying its own `logoHeader` flag, which drives the official letterhead centrally through `FormLayout`/`FormHeader` (`frontend/src/forms/shared/FormLayout.tsx`, `FormHeader.tsx`) — no `profile === 'ready-paper'` conditional anywhere per-form, so any form that renders through `FormLayout`, current or future, inherits it automatically.
- **Page-level header model** — `@page` margin set to `0`, with the SAME margin values re-applied as `.form-page` padding, so `.form-page` models the physical A4 sheet rather than just the content box. The letterhead is an absolutely positioned overlay (zero document-flow height) anchored to the sheet's own top edge, so it can occupy the top band without ever pushing form content down or adding a page. This replaced an earlier attempt (content-box-relative negative offset + a screen-only spacer workaround) that was proven, on the real app, to clip in every surface that renders `.form-page` alone (`composeStyledFromNode`, `formPdfDocument.ts`) — that workaround has been fully removed, not left dead.
- **Logo artwork** — reuses the existing `logohead.png` / SVG tint-filter / horizontal-centering pipeline as-is. Adds a CSS-only vertical crop of the PNG's transparent top/bottom padding (pixel-scanned: opaque ink occupies rows 59–221 of 268) via negative margins on the `<img>`, so the header's box height matches the visible artwork instead of the file's blank internal margins. Width/height/aspect ratio are never touched — nothing is resized, only empty space is clipped.
- **Screen vs. print geometry** — preview offset `2.5mm` (measured to keep the artwork fully visible in the workspace canvas without clipping, given the crop boundary sits exactly on the first inked row). A separate **print-only** compensation rule (`top: 5mm`, uniform `scale(0.93)`, `transform-origin: top center`, applied only inside `@media print` via a `data-page-logo-header` hook) works around each printer driver's hardware non-printable edge band (typically 3–5mm on A4) — a hardware limit invisible in both the screen preview and the PDF export (`webContents.printToPDF` has no such band), so it was only caught by an actual paper print, and only that path carries the compensation.
- **Forms hub** — the print-template dropdowns in `frontend/src/pages/Forms.tsx` now derive their options from `SELECTABLE_PROFILE_IDS`/`PRINT_PROFILES` instead of a separate hardcoded `PrintMode` enum, so Ready Paper (and any future selectable profile) appears with no per-form wiring; the underlying `printMode` URL-param resolver was generalized the same way.
- **Employment Contract exemption** — `excludeIds={['ready-paper']}` on its `PrintProfileToggle`, and it never routes through `FormLayout` at all (it owns a fully separate print root), so it is doubly excluded.
- **Generalization guard** — `frontend/src/__tests__/readyPaperGeneralization.test.tsx` audits every page under `src/pages` for per-form ready-paper/experimental logic, confirms every page offering the profile toggle (except the exempt Employment Contract) routes through `FormLayout`, and pins the approved values (`2.5mm` / `5mm` / `0.93` / margins / no-divider / zero-flow-height) plus non-interference with `plain-a4`, `letterhead`, and Payment Voucher.
- **Forms it now covers**: Salary Certificate, To Whom It May Concern, Leave Request, Return to Work, Salary Advance, Resignation, Employee Warning, Performance Evaluation, Quotation, Purchase Request — every form that already exposed the print-profile switcher, automatically, via the shared `FormLayout` path.

**Scope — Receipt Voucher redesign (visual only, `frontend/src/pages/ReceiptVoucher.tsx` + `ReceiptVoucherTemplate.tsx`).** Does **not** adopt Ready Paper's architecture or `PrintProfile` — Receipt Voucher keeps its own `@page { margin: 12mm 15mm }` and in-flow layout throughout.
- Plain-text company-name header replaced with the same shared logo (`FormHeader`'s new, independent `cropTransparentPadding` prop — same crop as Ready Paper, but kept fully in-flow, no `position: absolute`, no page-level model), and the divider line beneath it removed.
- `ApprovalSection` now passes `hideDate` + `stampInline` — the exact combination Salary Certificate already uses — dropping the static `____ / ____ / ______` date placeholder and raising the stamp onto the signature row instead of below it.
- The separate "Accountant"/"Finance Manager" signature columns are removed from `ReceiptVoucherTemplate.tsx`'s three-column signature row, leaving only "Receiver".
- Confirmed via direct measurement on the real running app that the header stays in-flow (`position: static`), adds no overlap with the following content, and the voucher remains one page at the real print content width.

**Not changed:** voucher/form business logic, data, calculations, handlers, Prisma schema, any backend endpoint, the print job/audit pipeline, Payment Voucher, `letterhead`, `plain-a4`, or any other form's template/content.

---

## Previous Release — Sidebar Visibility Management v1

| Field | Value |
|-------|-------|
| **Package** | Sidebar Visibility Management v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-27 |
| **Feature branch** | `feature/sidebar-visibility-management-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `9053c01` (documentation commit from the prior release) |
| **Feature commit** | `c75299a` |
| **Production merge commit** | `7226882` |
| **Stable tag** | `stable-sidebar-visibility-management-v1` → merge `7226882` (annotated) |
| **Reviews** | Full audit-first pass (sidebar definition, permission model, existing UI-preference persistence) before design; implementation followed the discovered architecture with no refactor. Product Owner Manual Visual Review of the finished Settings section and live sidebar toggling — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · `build:front` ✅ · `build:back` ✅ · new `navVisibility`/`Layout` sidebar-visibility suites (21 tests) ✅ · full frontend suite re-run pre- and post-merge (27 pre-existing baseline failures, unchanged in file and count) ✅ |

**Scope.** New "Sidebar Management" section in Settings (`frontend/src/pages/Settings.tsx`) lets a user show/hide individual sidebar navigation entries. This is a **display preference only**:
- **Source of truth unchanged** — no second hardcoded nav list. A new pure filtering module (`frontend/src/config/navVisibility.ts`) derives both the Settings toggle list and the actual sidebar render from the single existing `NAV` array in `frontend/src/config/modules.tsx`. Any future addition to `NAV` automatically appears in both places with no manual duplication.
- **Stable identifiers** — preferences are keyed by each item's existing stable `key` (e.g. `invoices`, `cheques`, `payroll/bank-analytics`), never by translated label, index, or display order, so relabeling or reordering `NAV` never breaks a saved preference.
- **Permissions strictly outrank the preference** — `visible = (no permission required || user has it) && not hidden`. The Settings toggle list itself is pre-filtered by permission, so a user is never shown a switch for a page they cannot access, and hiding/showing a preference can never reveal a page a permission check would otherwise block.
- **Persistence** — reuses the exact mechanism already in place for the sidebar collapse/expand preference: a new `hiddenNavKeys` array in the existing `uiStore` Zustand store, backed by `localStorage` (`manarERP.sidebar.hiddenItems`). No new storage mechanism, no schema, no migration, no backend change. Untrusted/corrupt storage sanitizes to "nothing hidden" (today's behavior).
- **Default behavior** — every existing user sees 100% of today's sidebar unchanged after this release; nothing is hidden by default.
- **Protected item** — `settings` itself cannot be hidden (its switch is disabled with a "always visible" badge), since it is the only path back to this control; no new route or button was added to work around this.
- **Empty groups** — a sidebar group left with zero visible items renders no group heading or stray separator, in both the live sidebar and the Settings toggle list; group and item order is otherwise untouched.
- **"Show all pages"** — a single reset action in the section header restores the default (nothing hidden); disabled when there is nothing to reset.
- **Currently open page** — hiding the page a user is actively on removes only its sidebar entry; no forced redirect, no loss of in-page state.
- **i18n** — 8 new dictionary keys (Arabic + English) for the new section's labels; existing `nav.*` labels/icons are reused as-is for the toggle list rows.

**Not changed:** any route definition, any permission key or `requirePermission` guard, RBAC/`rbac.middleware.ts`, business logic in any module, the Prisma schema, any backend endpoint, `preload.ts`/IPC surface, or any other form/page.

---

## Previous Release — Payment Voucher Visual Polish & English Localization v1

| Field | Value |
|-------|-------|
| **Package** | Payment Voucher Visual Polish & English Localization v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-27 |
| **Feature branch** | `feature/payment-voucher-visual-polish-english-localization-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `91bcd26` (documentation commit from the prior release) |
| **Feature commit** | `f979a4a` |
| **Production merge commit** | `e2e29eb` |
| **Stable tag** | `stable-payment-voucher-visual-polish-english-localization-v1` → merge `e2e29eb` (annotated) |
| **Reviews** | Iterative visual refinement across the session (title box background, amount color, logo recolor/width, English localization), each step verified with `tsc --noEmit` and, for the logo width fix, a live Chrome DevTools measurement/screenshot pass before being applied. Product Owner Manual Visual Review of the finished Payment Voucher (both languages) — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend `paymentVoucherBatchSafety` test suite (8 tests) ✅ · `git diff --check` ✅ |

**Scope.** Four small, visual/presentation-only changes to the Payment Voucher form (`frontend/src/forms/PaymentVoucherTemplate.tsx`, `frontend/src/forms/shared/FormHeader.tsx`):
- **Title box background** — the "سند صرف / PAYMENT VOUCHER" title box now uses the exact same background shade as the "المستفيد" (Beneficiary) field label (`#eef0fb`), with its text recolored to the form's brand navy/purple (`#2b2e83`) for contrast.
- **Amount-in-figures color** — switched from red (`#b71c1c`) to the form's brand navy/purple (`#2b2e83`); formatting, currency suffix, background, size, weight, and alignment all unchanged.
- **Logo header** — `logohead.png` (mark + Arabic/English wordmark, one combined image) is recolored via an SVG `feColorMatrix` filter to the same brand navy/purple, and its display width is scaled up symmetrically (verified via a live Chrome DevTools measurement/screenshot pass, not guessed) so the visible artwork reaches the same left/right bounds as the form's content below — compensating for a large blank margin baked into the source PNG. The source file itself is untouched; only the CSS rendering changes. `useLogoHeader` (the prop that activates this branch of the shared `FormHeader.tsx`) has exactly one consumer project-wide — `PaymentVoucher.tsx` — confirmed by grep immediately before release, so no other form is visually affected.
- **English localization** — when `lang === 'en'`: `د.ك`→`KWD`, `نقداً`→`Cash`, `شيك`→`Cheque` (via existing `t('opt.payment.cheque', lang)`), `تحويل`→`Transfer` (via existing `t('opt.payment.transfer', lang)`), `البنك:`→`Bank:` (via existing `t('lbl.bank_colon', lang)`), `رقم الشيك:`→`Cheque No.:`, and the dynamic bank name (e.g. `بنك الخليج`→`Gulf Bank`) via the existing `bankLabel()` presentation-only lookup from `utils/chequeTemplate.ts` — the stored `bankName` value itself is never modified. The Arabic output is unchanged byte-for-byte (verified via direct Unicode comparison before reusing any existing i18n key; the three strings without an exact byte-identical existing key — `نقداً`, `رقم الشيك:`, `د.ك` — use an inline literal instead of risking a diacritic-order mismatch from the nearest dictionary entry).

**Not changed:** payment voucher business logic, calculations, save mechanics, approval workflow, or stored data; user permissions; API/backend; Prisma schema or migrations; accounting/GL; core print logic; any other form (only `PaymentVoucher.tsx`'s `useLogoHeader` branch of the shared `FormHeader.tsx` is exercised today).

---

## Previous Release — NBK Salary Export — Native XLS Generation v1

| Field | Value |
|-------|-------|
| **Package** | NBK Salary Export — Native XLS Generation v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-27 |
| **Feature branch** | `feature/nbk-salary-export-native-xls-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `fb1ecb1` (documentation commit from the prior release) |
| **Feature commit** | `e7992a8` |
| **Production merge commit** | `8ad5e6b` |
| **Stable tag** | `stable-nbk-salary-export-native-xls-v1` → merge `8ad5e6b` (annotated) |
| **Reviews** | Multi-round diagnostic investigation (A/B testing against a native-Excel-COM control file, then against the bank-provided original workbook) proved the root cause: SheetJS's BIFF8 writer produces a structurally non-conformant OLE2/CFB container that trips Microsoft Office File Validation, regardless of input quality — even when fed the pristine original NBK workbook. Product Owner manual visual/security review of the production-path test file in Microsoft Excel — **completed & approved**, Protected View confirmed absent. |
| **Validation** | backend/frontend/electron `tsc --noEmit` ✅ · electron NBK test suite (13 tests: payload mapping, serial-number preservation, variable row counts, fail-closed template validation, BOM-safe result parsing, every error code) ✅ · frontend NBK test suite (15 tests, incl. a dedicated safety test proving no silent fallback to SheetJS when the native bridge fails) ✅ · backend payroll/payrollBankExport suite (200 tests) ✅ |

**Scope.** Replaces SheetJS as the FINAL writer for the NBK bank salary export only (every other Excel export in the app — Reports, other bank profiles — is untouched) with native Microsoft Excel COM automation:
- `backend/assets/nbk-export/NBK_Salary_Native_Template.xls` — a canonical, PII-free template built from the bank-provided original (`Salary_File.xls`, held only in a local archive outside the repository) via Excel COM: all 17 historical employee rows removed, document metadata stripped. Verified column-by-column against the original before shipping: 0/17 name, 0/17 Civil Id, 0/17 account/IBAN leaks. Structure (2 sheets, order, 7 exact headers, column widths, Bank Codes' 26 rows) preserved byte-for-byte in shape.
- `backend/assets/nbk-export/generate-nbk-xls.ps1` — the Excel COM writer. Always creates its **own** `Excel.Application` instance (never attaches to or enumerates an existing/interactive Excel session by process name), validates the template's sheet names and all 7 headers **by name** before writing (fails closed with a typed error on any mismatch, writing nothing), and always `Quit()`s/releases the COM object via `try/finally` regardless of outcome.
- `electron/services/nbkXlsExport.{pure,service}.ts` — a pure, electron-independent payload/result-parsing layer (unit-tested under `vitest.electron.config.ts` without an Electron runtime) plus the orchestration layer: an isolated temp working directory per export, a 45s timeout that only ever terminates the spawned `powershell.exe` child (never Excel), and six typed error codes (`EXCEL_COM_UNAVAILABLE`, `TEMPLATE_MISSING`, `TEMPLATE_STRUCTURE_INVALID`, `GENERATION_FAILED`, `OUTPUT_INVALID`, `TIMEOUT`) each with a stable Arabic message.
- `electron/ipc/nbkExport.ipc.ts` — thin IPC handler gated on the existing `payroll.read` permission.
- `PayrollBankExport.tsx` calls the native bridge first; on failure it shows the error and never falls back to SheetJS. The old SheetJS path (`payrollBankExportXls.ts`, untouched) remains reachable only when `window.manar` is entirely absent — proven structurally impossible in the packaged app: `mainWindow.ts` attaches `preload.js` unconditionally for the single window that ever loads the React bundle (in both dev and packaged production), and `preload.ts` defines `generateNbkSalaryXls` unconditionally.

**Root cause (proven across three diagnostic rounds).** The Office File Validation Protected View warning was proven to originate in SheetJS's own BIFF8 writer (`xlsx` npm package, `write_biff8`), not in this project's integration code, the embedded template, file/MIME/extension handling, Blob/download mechanics, or Mark-of-the-Web/Windows trust metadata (no `Zone.Identifier` was ever present). A manual Excel A/B test with a native-Excel-COM control file (no warning) vs. the SheetJS output (warning) first isolated the writer as the cause; a second round proved patching the CFB root-entry name and CLSID alone was insufficient; a third round — feeding the pristine bank-provided original workbook itself through SheetJS — proved the warning persists even with perfect input, confirming the writer itself as the sole cause.

**Not changed:** payroll calculation, deductions, allowances, payment-method logic; approve/unapprove business rules; accounting/GL posting; any Prisma schema, migration, or permission-matrix seed data; any other Excel export in the app; Excel/Windows Trust Center, Protected View, Office File Validation, or Windows Attachment Manager settings (the fix works because the generated file is structurally valid, not because any security setting was weakened).

---

## Previous Release — Payroll Multi-Select Approval & Unapprove v1

| Field | Value |
|-------|-------|
| **Package** | Payroll Multi-Select Approval & Unapprove v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-27 |
| **Feature branch** | `feature/payroll-multi-select-approval-unapprove-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `135a961` (documentation commit from the prior release) |
| **Feature commit** | `1384939` |
| **Production merge commit** | `867b93f` |
| **Stable tag** | `stable-payroll-multi-select-approval-unapprove-v1` → merge `867b93f` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · backend payroll test suite (11 files, 200 tests) ✅ — all re-run twice (pre-merge on the feature branch, post-merge on `production`) |

**Scope.** Checkbox-based multi-select on the payroll table (`Salaries.tsx`): a header checkbox selects/deselects all eligible **visible** rows (current page only, mirrors the existing Cheques batch-selection pattern), row checkboxes are omitted for read-only `IMPORTED_TRANSFER` rows. A selection toolbar appears once at least one row is checked, driving the **same** per-record endpoints the drawer already used — one `PATCH /payroll/:id/approve` or `/unapprove` per selected id via `Promise.allSettled`, no new bulk endpoint. Selecting exactly one row behaves identically to the pre-existing single-record drawer button (same label, same call).

**Backend — new `unapprove` action.** `PATCH /payroll/:id/unapprove` reuses the existing `payroll.approve` permission (mirrors how `expenses.amend` reuses `expenses.approve` — whoever can approve can revert it) and reverts `APPROVED → DRAFT` only, rejecting `DRAFT` (already draft), `PAID`, and `CANCELLED` with explicit Arabic error messages. Runs inside a Prisma transaction: clears `approvedAt`/`approvedById`, calls `approvalEngine.recordTransition` (`action: 'reopen'`), and logs an audit entry (`action: 'UNAPPROVE'`, module `payroll`). No accounting/GL reversal is performed or needed — payroll approval itself never posts a journal entry (only `markPaid` does, and it stays untouched).

**Frontend — individual + bulk unapprove.** The payroll drawer gained an "إلغاء الاعتماد" button (icon `lock_open`, same visual pattern as Expenses' unapprove-and-edit action) shown only when `status === 'APPROVED'`, alongside the existing cancel button. The bulk toolbar bar shows the same "اعتماد"/"إلغاء الاعتماد" labels as the drawer buttons — clicking either filters the current selection down to the status-eligible subset (`DRAFT` for approve, `APPROVED` for unapprove) before sending any request; if nothing in the selection is eligible, no network call is made and a clear message explains why.

**Partial-failure handling.** Bulk results are never reported as a silent success if any item failed: a fully-successful batch shows the green success banner, anything else (partial or total failure) shows the red error banner with explicit success/failed counts. The table and KPI stats always refresh once after the batch (`loadPayroll` + `loadStats`), without a full page reload, and the selection is always cleared afterward. The bulk buttons share the page's existing `busy` state with every other payroll action, so repeated clicks during an in-flight batch are blocked the same way the single-record buttons already were.

**Not changed:** payroll calculation, amounts, deductions, allowances, or payment-method logic; the `markPaid` GL posting path; any Prisma schema, migration, or permission-matrix seed data (the release deliberately reuses the existing `payroll.approve` permission key instead of adding a new one); the Drawer/table visual design outside the new checkboxes and one new button.

---

## Previous Release — Repository Cleanup, Documentation & Tooling Pack v1

| Field | Value |
|-------|-------|
| **Package** | Repository Cleanup, Documentation & Tooling Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-27 |
| **Feature branch** | `feature/repo-cleanup-docs-tooling-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `f9d2525` (documentation commit from the prior release) |
| **Feature commits** | `dd15c94` (.gitignore) → `cc5af5a` (docs/superpowers/**) → `2258edb` (6 audit docs) → `b00dfcc` (official forms PDFs) → `6e4cfb2` (dev tooling scripts) → `8cf1413` (cheque backfill audit scripts) → `b6a9d51` (docs/html/ + generated-forms/) — 7 commits, insertions only |
| **Production merge commit** | `beb5760` |
| **Stable tag** | `stable-repository-cleanup-documentation-tooling-pack-v1` → merge `beb5760` (annotated) |
| **Reviews** | Full pre-release diff/scope audit (this session): confirmed the merge contains only insertions, zero deletions/modifications to any existing tracked file except `.gitignore`, and zero frontend/backend/electron/Prisma files. Product Owner explicitly authorized direct production release for this documentation/tooling-only pack — no UI surface exists to visually review. |
| **Validation** | `git diff --check production...HEAD` clean (no conflict markers) · full `--name-status` review, 125 files, 100% within approved scope |

**Scope.** A multi-phase working-tree audit and cleanup spanning several sessions, resolving working-tree clutter accumulated across the project's development history. This release commits only the material classified **KEEP & COMMIT**:
- `.gitignore` — review-artifact, debug-screenshot, and agent-tooling patterns (named patterns only, no wide wildcards)
- `docs/superpowers/plans|specs|reports/` (53 files) — real implementation plans/design specs/completion reports for already-shipped features, never previously committed
- 6 standalone audit/history documents: `ARCHITECTURE_REVIEW_2026-06.md`, `FORMS_INVENTORY_REPORT.md`, `PROJECT_HISTORY_FULL.md`, `PROJECT_PRICES_PHASE1_AUDIT.md`, `RELEASES_FULL_AUDIT_2026-07-16.md`, `translation-audit-report.md`
- `docs/AlManar_Official_Forms_v1.pdf` / `v2.pdf` — official company form references (v2 is the source input for `scripts/extract_forms_png.py`)
- `scripts/.smoke-electron.cjs`, `extract_forms_png.py`, `full-operational-reset.ts`, `translation-audit.mjs` — real, reusable dev/ops tooling (not yet wired into `package.json`)
- 5 historical cheque-backfill/verification scripts (`backend/__backfill_historical_cheques.ts` and 4 companions) — a one-time data operation already executed against production, kept as a reproducibility/audit record, not as an application feature
- `docs/html/` and `generated-forms/` — print-ready, directly-editable form templates, explicitly documented as real deliverables in the already-committed `FORMS_INVENTORY_REPORT.md`

**Preserved separately, not part of this release.** Genuine unreleased in-progress work found during the audit was branched off and committed as WIP on three dedicated branches (none merged, none touched by this release): `feature/dashboard-accessibility-polish-wip`, `feature/cloud-sync-progress-dialog-wip`, `feature/professional-forms-designer-wip`. All 5 pre-existing stashes were left untouched throughout.

**Archived outside the repository, not committed.** Files containing real historical financial data or personal data (civil ID numbers) were deliberately excluded from Git and archived outside the repository instead: the historical cheque-backfill source spreadsheet, an employee civil-ID list, and superseded design-reference files (`contractv2.xlsx`, `contract_image1.png`, `contract_image2.png`).

**Deferred to a later pass, deliberately not decided here.** `docs/exelform/`, `docs/invoice_templates/`, `docs/print-templates/`, and `docs/new q/` — superseded/incomplete design-exploration material (parallel prototypes predating or duplicating the shipped print-templates engine) — were archived outside the repository rather than committed, pending no further action needed in this pack.

**Not changed:** any file under `frontend/src`, `backend/src`, `electron/`, or `backend/prisma/schema.prisma` / `migrations/`; no database migration was run or modified as part of this release.

---

## Previous Release — UI Controls Consistency & Topbar Refresh Pack v1

| Field | Value |
|-------|-------|
| **Package** | UI Controls Consistency & Topbar Refresh Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-26 |
| **Feature branch** | `feature/ui-controls-consistency-topbar-refresh-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `044d6ec` (documentation commit from the prior release) |
| **Feature commit** | `15e1003` |
| **Production merge commit** | `54f2846` |
| **Stable tag** | `stable-ui-controls-consistency-topbar-refresh-pack-v1` → merge `54f2846` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ (frontend-only release; no schema/backend/electron changes) |

**Scope — PeriodControl label cleanup.** Removed the static "الفترة المعروضة:" prefix from the period-selector summary label across every page that renders the shared `PeriodControl` component (Invoices — the original reference implementation — Dashboard, Cheques, Expenses, Reports, Accounting ×2 render paths, FinancialCenter, ExecutiveDecisionCenter). Implemented as a new opt-in `hideLabelPrefix` prop on `PeriodControl` (default `false`, so any future consumer that omits it keeps today's behavior unchanged); internally it just passes the component's existing `short` parameter through to `buildLocalizedPeriodLabel`, reusing the already-existing bare-range i18n key (`fc.period.range_bare`) instead of `fc.period.label_range` — no new copy, no i18n key added. Date range, calendar icon, chevron, presets, and all selection/state logic are byte-for-byte unchanged.

**Scope — Excel export button branding.** Generalized the button design approved on the "اتفاقيات الأسعار" (Prices) page to every Excel-export button found in a full-codebase sweep: label text reduced to the literal word "Excel" (the shared "تصدير Excel" i18n key, `page.salaries.export_excel`, was left untouched — each call site now renders a literal string instead, so no other consumer of that key was affected), the existing icon kept as-is, both recolored to `#217346` only while idle (the busy/loading branch — including `Reports.tsx`'s and `BankSalaryAnalytics.tsx`'s own distinct busy-state icon/copy — was left exactly as it was). Touched directly: `Prices.tsx` (reference), `Reports.tsx` (drawer button + dropdown menu item), `Expenses.tsx`, `Salaries.tsx`, `ResourcePage.tsx` (explorer-skin button), `DocumentExpirationCenter.tsx`, `BankSalaryAnalytics.tsx`, `PayrollBankImport.tsx`, `BankReconciliation.tsx`. Fixed once at the shared-component level (propagating to all its consumers): `ExportExcelButton.tsx` (used by `Invoices.tsx`, `ResourcePage.tsx`'s legacy skin, and `MonthlyReportModal.tsx`) and `financial.css`'s `.export-btn.excel` rule (used by `ExportBar.tsx`, consumed by `FinancialCenter.tsx`'s six report tabs and `FinancialReportsTab.tsx`). Excluded after inspection — different function, not an Excel-export button despite containing the word: `DocumentExpirationCenter.tsx`'s "تصدير النتائج الحالية" action (no "Excel" in its own label), `GenericImporterView.tsx`'s blank-template download, `BankStatementImport.tsx`'s file-upload/import path, and `Integrations.tsx`'s descriptive format-list metadata.

**Scope — Topbar refresh icon relocation.** Moved the Dashboard's spinning refresh icon from beside `PeriodControl`/"آخر تحديث" in the page header to the app-wide topbar (`Layout.tsx`), immediately next to the privacy/lock toggle — recolored to the system's primary purple (`#6366f1`, the same value as `explorer-kit.css`'s `--xpl-primary`, hardcoded here since that CSS custom property is scoped to `.xpl-scope` and the global topbar sits outside it — same convention already used by `PrintCenter.css`). The exact same `refreshKey`/`refreshing`/`initialLoading` state and the same `.retry-loader` SVG/animation (`dashboard.css`, untouched) still drive it; only the trigger surface moved, via a new minimal `uiStore.ts` registration slice (`topbarRefreshHandler`, `topbarRefreshBusy`, `setTopbarRefresh()`) that `Dashboard.tsx` populates on mount/update and clears on unmount — so the icon still only appears while the Dashboard page is mounted, exactly as before, just rendered in a different component. `Layout.tsx`'s icon is deliberately kept borderless/transparent (matching its old look) rather than boxed like its sibling topbar buttons.

**Not changed:** any refresh/export handler, API call, filename or file-extension logic, permission check, business logic, background/border/size/variant of any touched button, or the order/design of any other topbar or page element. `DocumentExpirationCenter.tsx`'s Excel button uses `variant="primary"` (solid background) unlike every other now-green instance (`variant="secondary"`) — left as-is per instruction not to change variant; flagged to the Product Owner during visual review.

**Excluded from this release — pre-existing, unrelated working-tree changes.** The session's working tree also carried unrelated, already-in-progress edits predating this pack (`backend/prisma/schema.prisma`, `electron/services/syncEngine.service.ts`, `frontend/src/components/dashboard/AlertPanel.tsx`, `LatestInvoicesTable.tsx`, `Skeleton.tsx`, `dashboard.css`, plus a `Dashboard.tsx` accessibility pass — `div`→`h3` section headings and `aria-hidden` additions). These were surgically excluded from the feature commit (verified hunk-by-hunk against this pack's own diff) and left uncommitted in the working tree exactly as found, untouched by this release.

---

## Previous Release — Forms QR Human-Readable Formatting Fix v1

| Field | Value |
|-------|-------|
| **Package** | Forms QR Human-Readable Formatting Fix v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-26 |
| **Feature branch** | `feature/forms-qr-human-readable-formatting-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `c9840c2` (documentation commit from the prior release) |
| **Feature commit** | `e5e2ba3` |
| **Production merge commit** | `16bd9cd` |
| **Stable tag** | `stable-forms-qr-human-readable-formatting-fix-v1` → merge `16bd9cd` (annotated) |
| **Reviews** | Release executed manually by the Product Owner — phone-scan verification of the actual QR output **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ (frontend-only release) · new `frontend/src/__tests__/formQRCodeHumanReadable.test.tsx` — 18/18 tests ✅ · targeted regression run 6 files / 117 tests ✅ (`documentVerificationQR`, `employmentContractNewEmployee`, `legacyFormPreviewRolloutPhase1`, `legacyFormPreviewRolloutPhase2`, `printWorkspace`, plus the new suite) · 1 pre-existing/unrelated failing file (`formsRegistryTranslationAudit.test.ts`, 10/39 assertions) reconfirmed identical via `git stash` against the pre-change baseline — not introduced or worsened by this pack |

**Root cause.** `FormQRCode.tsx` encoded its `QRData` via `JSON.stringify(data)` — a phone camera/QR reader surfaced the raw `{"formType":"...","formNumber":"...","entityName":"...","entityId":...}` text verbatim instead of anything a human could read.

**Scope — formatting only, same approved data.** This pack changes only the formatting/encoding layer, never the data itself: the exact same four `QRData` fields established by the prior Barcode Payload Standardization Pack v1 (`formType`, `formNumber`, `entityName`, `entityId?`) are now rendered as labeled Arabic lines instead of JSON before being handed to the `qrcode` encoder. `formType`'s technical slug (e.g. `salary-certificate`) is displayed as the same Arabic title already shown on that exact form's own header — sourced verbatim from the existing `i18n.ts` `page.*.title`/`voucher.receipt.title` keys and `printProfiles.ts`'s `labelAr` for `payment-voucher`; no new wording was invented. `entityId`, when present, appears as a labeled "الرقم المرجعي" line, and is omitted — never invented — when absent, exactly matching prior behavior.

**Scope correction — 13 formTypes use `FormQRCode`, not 12.** The 12 forms registered in `formsRegistry.ts`'s `FORM_CARDS` (Salary Certificate, To Whom It May Concern, Leave Request, Return to Work, Salary Advance, Resignation, Employee Warning, Performance Evaluation, Employment Contract, Quotation, Purchase Request, Receipt Voucher) plus **Payment Voucher** — which calls `FormQRCode` via `FormLayout` but is reached from the Cheques module rather than the Forms hub, and is therefore not itself a `formsRegistry.ts` entry. (The pre-existing "12 official forms" figure elsewhere in this document refers specifically to the `formsRegistry.ts` `FORM_CARDS` count and is a different metric, unaffected by this correction.) The fix lives in one file (`FormQRCode.tsx`) and applies to all 13 automatically — none of the 13 call sites were touched.

**Not changed:** the `QRData` interface, any of the 13 forms' data/props/business logic, QR size/position/color/margin/error-correction, the `formNumber` caption below the QR image, or the Print/Preview/Exact Preview/PDF pipelines — all consume the same rendered `<img>`, confirmed by the 117-test regression run.

**Excluded — documented for a future pack, not fixed here.** Invoice's `DocumentVerificationQR` still encodes a bare `verificationUuid` string, which a phone also displays as unformatted technical text — the same class of complaint, but its fix is architecturally different: the public `GET /api/verify/:uuid` endpoint depends on receiving that exact raw UUID, so any human-readable reformatting there needs a hybrid payload design that keeps the UUID extractable — deliberately out of scope for this pack. Template Studio's per-template `qr`/`barcode` designer elements (a user-configurable single-field binding, not a fixed document payload) are also unaffected and out of scope.

---

## Previous Release — Bank Statement Order Preservation & Current Balance Fix v1

| Field | Value |
|-------|-------|
| **Package** | Bank Statement Order Preservation & Current Balance Fix v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-26 |
| **Feature branch** | `feature/bank-statement-order-preservation-current-balance-fix-v2` (kept — pushed, not deleted; supersedes the original, never-merged `...-v1` branch, which is also kept as historical record) |
| **Baseline** | `production` @ `de87070` (documentation commit from the prior release) |
| **Original fix commit** | `2322802` (2026-07-23, on the abandoned `-v1` branch — never merged) |
| **Restored feature commit** | `38d7c4c` (cherry-picked from `2322802` onto a fresh branch off current production — byte-identical diff, zero conflicts) |
| **Production merge commit** | `fff9d9f` |
| **Stable tag** | `stable-bank-statement-order-preservation-current-balance-fix-v1` → merge `fff9d9f` (annotated) |
| **Reviews** | Product Owner visual review of balance and Timeline — **completed & approved**. |
| **Validation** | backend `tsc --noEmit` ✅ · `prisma validate` ✅ · `prisma migrate status` clean (46/46) ✅ · backend bank-related `vitest` 7 files / 228 tests ✅ · full backend suite 135 files / 1902 tests ✅ · backend build ✅ · frontend `tsc --noEmit` ✅ (unaffected) · frontend Bank Account Explorer `vitest` 4 files / 39 tests ✅ |

**Background — a validated fix that never reached production.** A Regression & Release Integrity Audit (run before this release) traced a Bank Account Explorer balance regression the Product Owner had already flagged as previously fixed. The audit found commit `2322802` (2026-07-23) — the actual, complete, tested fix — sitting on `feature/bank-statement-order-preservation-current-balance-fix-v1`, pushed to origin, but **never merged**: `git merge-base --is-ancestor` confirmed it was not an ancestor of `production`, and no later commit had touched any of its files, meaning production had simply never received it, not that it had been reverted. This release restores that exact fix rather than re-implementing it.

**Business rule.** Official bank statement files are ordered newest → oldest. The first data row of the most recently imported statement is the true current/closing balance — it must not be re-derived from `statementDate`, because a file can contain repeated dates or a row order that doesn't strictly match chronological sequence.

**Scope — restoration process.** Reviewed `2322802` in full (schema, migration, import service, balance service, both test files) and re-verified it against current production before touching anything: zero production commits since the fix's original base had touched any of its six files. Cherry-picked the commit unchanged onto a fresh branch off current production — clean merge, zero conflicts, diff byte-identical to the original (176 insertions / 34 deletions across the same 6 files). Discovered and handled a subtlety: the local dev database had *already* had this exact migration applied from an earlier stray run (before the fix was reverted out of the tracked schema by branch switches) — 377/377 rows already correctly backfilled, 0 nulls. Restoring the *exact original, unrenamed* migration file (not a re-timestamped one) was therefore correct: its name and SQL matched the row `_prisma_migrations` already had recorded, so Prisma recognized it as already applied (checksum match, no re-execution, no "duplicate column" risk) — confirmed via `prisma migrate status` reporting a clean, up-to-date schema both before and after the merge. A genuinely fresh database (including the real end-user `userData/data/manar.db`) is unaffected by this coincidence and applies the migration normally in its correct chronological slot.

**Scope — the fix itself.** Adds `statementSequence` to `BankStatementTransaction` (1-based row position within its own import file, set at import time from the parser's own file-order index — nullable, backward compatible). Migration backfills existing rows per `importId` using insertion order (`id asc` — the original file order at insert time), additive and idempotent (`WHERE statementSequence IS NULL`), touching no financial column. `TIMELINE_ORDER_BY` now sorts by latest import (`importId desc`) then `statementSequence asc`, reproducing the bank's original file order exactly instead of sorting by date. `bankAccounts` current/closing balance (`listBankAccounts`, `getBankAccountDashboard`) now reads the first-sequence row of the latest import (`getLatestStatementRow()`) instead of the max-`statementDate` row; `openingBalance` (first transaction by date) is unaffected, matching the original fix's intent exactly.

**Proven against real data, not just in theory.** Queried the live dev dataset before merging: `BANK:GULF_BANK`'s latest import has multiple rows sharing the same `statementDate`. The old logic (max `statementDate`) picked a row with balance 45,290.42; the new logic (first `statementSequence` of the latest import) picks the true first row: balance 58,120.42 — a real, currently-manifesting instance of the bug, now corrected.

**Not changed:** Bank Account Explorer UI/design, any transaction amount, debit/credit, existing statement data, accounting entries, or any file outside the six the original fix touched.

---

## Previous Release — Forms i18n Completeness & Regression Protection Pack v1

| Field | Value |
|-------|-------|
| **Package** | Forms i18n Completeness & Regression Protection Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-26 |
| **Feature branch** | `feature/forms-i18n-completeness-regression-protection-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `4a62484` (documentation commit from the prior release) |
| **Feature commit** | `c7df34f` |
| **Production merge commit** | `becb6df` |
| **Stable tag** | `stable-forms-i18n-completeness-regression-protection-pack-v1` → merge `becb6df` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ (frontend-only release) · frontend `vitest` 116/124 files passing (was 115/123 before this pack — net +1, the new test); 8 pre-existing/unrelated failing files confirmed byte-identical against a stashed pre-change baseline · backend `tsc --noEmit` ✅ · backend `vitest` 135 files / 1899 tests ✅ · `prisma validate` ✅ (schema untouched) · frontend production build ✅ · manual audit: 0 missing AR / 0 missing EN across all 90 `t()`-used keys (incl. the `CRITERIA_KEYS` array) in the six affected forms |

**Background — a regression that had already been "fixed" twice.** A dedicated Regression & Release Integrity Audit (run before this pack) traced the root cause: commit `d226365` "English Localization Completion Pack v2" (2026-07-21) converted hardcoded strings across six forms to `t('...')` calls without adding the matching `DICT.ar`/`DICT.en` entries. Two later fixes — `699a63b` ("Leave Request Translation Fix v1") and `0850cc1` ("Employee Smart Forms Hub & Forms Localization Integrity Pack v1", which built `formsRegistry.ts` + `formsRegistryTranslationAudit.test.ts`) — each patched only that form's **title** key; neither touched the body content (field labels, placeholders, buttons, options) that `d226365` had also broken, because the audit test they shipped is scoped to `titleKey` only. The correct fix for all 69 affected keys had already been written at some point, but only as an **uncommitted edit** to `frontend/src/lib/i18n.ts` sitting in the working tree — never committed in this repository's history. That is the actual root cause of the recurrence: verified, working code that never reached a commit, so it silently vanished on every fresh checkout while the underlying bug shipped again and again.

**Scope — key recovery.** Recovered 69 translation keys (AR+EN): 64 confirmed by a static `t('...')` scan across the six forms, plus 5 more (`page.perfEval.criterion.*`) discovered while implementing — used dynamically via a `CRITERIA_KEYS.map((key, i) => t(key))` array in `PerformanceEvaluation.tsx`, invisible to a literal-string scan but genuinely missing from the dictionary. Forms covered: `SalaryCertificate` (14 keys), `PurchaseRequest` (15), `PerformanceEvaluation` (19), `LeaveRequest` (9), `SalaryAdvance` (7), `ReturnToWork` (5). Isolated strictly from unrelated content sharing the same dirty working-tree file: a separate, unrelated deletion of two dead `page.salary_cert.*` legacy keys was reverted to its original state, and two empty leftover comment-block insertions were dropped — final diff verified via `git diff --stat`: 138 insertions, 0 deletions, touching only these six forms' keys.

**Scope — regression protection.** New `frontend/src/__tests__/formsTranslationKeyCompleteness.test.ts`: a **general** test (unlike the existing title-only `formsRegistryTranslationAudit.test.ts`) that statically scans every literal `t('...')` call — plus `CONST_KEYS`-style literal arrays fed through `t(variable)`, covering the `CRITERIA_KEYS` case — across all 12 `formsRegistry`-registered form pages and every file under `frontend/src/forms/`, and asserts each key resolves in both `DICT.ar` and `DICT.en`. Any future form or key added without a matching translation now fails this test immediately instead of shipping a raw key to users. Verified the test actually catches regressions: temporarily removed one key, got a precise, actionable failure message naming the exact file and key, restored, confirmed green.

**Unrelated, pre-existing issue found (not fixed, out of scope).** `formsRegistryTranslationAudit.test.ts` was already failing 10/39 assertions before this pack (confirmed via a stashed baseline run) — 10 form pages now call `translate(key, lang)` (an explicit-language variant) instead of the bare `t(key)` pattern that test's string-match expects. Translation itself still resolves correctly at runtime; only the old test's literal pattern is stale. Flagged for a future pack, per instruction not to fix unrelated pre-existing failures during this release.

**Not changed:** any form's design, business logic, print/preview behavior, API contracts, or backend code (frontend-only pack).

---

## Previous Release — Cheque Management Visual Polish Pack v1

| Field | Value |
|-------|-------|
| **Package** | Cheque Management Visual Polish Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-26 |
| **Feature branch** | `feature/cheque-management-visual-polish-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `e0b40af` (documentation commit from the prior release) |
| **Feature commits** | `0394fc5` (Visual Polish), `7aad8ef` (KPI cards — printed total across pages + page value) |
| **Production merge commit** | `5ed59c0` |
| **Stable tag** | `stable-cheque-management-visual-polish-pack-v1` → merge `5ed59c0` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. |
| **Validation** | frontend/backend/electron `tsc --noEmit` ✅ · `prisma validate` ✅ (schema untouched) · backend `vitest` 135 files / 1899 tests ✅ (incl. 2 new `printedTotal` aggregate tests) · frontend targeted cheque/print/calibration `vitest` 16 files / 246 tests ✅ · 2 pre-existing/unrelated failing files (`chequePrintInkIsolation.test.tsx`, `universalPrintPreviewCorrective.test.tsx`) confirmed identical against the pre-pack baseline — neither touches this pack's files · frontend + backend production build ✅ |

**Scope — Visual/UX polish (Cheque Management page only).** Compacted the executive header (padding/logo/title/subtitle/chip spacing tightened for a ~15–20% shorter header, no content removed). Tightened KPI card padding, icon sizing and value typography. Grouped the print toolbar into a settings cluster (print method + "set as default") and a dimmed secondary/utility cluster (Calibrate Printing, Restore Default — now `small` ghost buttons, full opacity on hover/focus) while "طباعة الشيك" stays the one `primary` action. Reduced the search/filter bar's padding and row gap. Table rows given tighter padding for more visible rows on a 1080p screen; the cheque-number cell bumped to a slightly larger, letter-spaced identifier (still rendered as a plain string — no `Number()`/`parseInt()` anywhere, so leading zeros such as `000086` can never be lost); beneficiary name given a computed ~300px soft max-width with ellipsis + a native `title` tooltip carrying the full name (short/medium names are unaffected — the limit only bites on outliers, e.g. a long company name from the historical cheque backfill). Removed the green print-icon badge that duplicated the `PRINTED` status chip's own icon; kept it for any other status with `printedAt` set (e.g. a cancelled cheque that had been printed beforehand — the only remaining signal of that history). Every override lives in page-local wrapper classes inside `Cheques.css` (`.chqx-header`, `.chqx-metrics`, `.chqx-filterbar`, `.chqx-cheques-table`, …); the shared ExplorerKit components (`ExecutiveHeader`, `HeroMetric`, `MetricCard`, `SearchBox`, `FilterChip`, `Pagination`, `Button`) were not modified, so no other page using them is affected.

**Scope — KPI redefinition (approved as part of this pack).** The Hero card changed from "قيمة الشيكات في هذه الصفحة" (current-page sum only) to "إجمالي قيمة الشيكات المطبوعة" — the total value of every `PRINTED` cheque across **all** Pagination pages within the current period. Computed entirely in the database: `ChequesService.stats()` gained a `printedTotal` field via one `prisma.cheque.aggregate({ where: { ...dateWhere, status: 'PRINTED' }, _sum: { amount: true } })` call added to the existing `Promise.all` alongside the pre-existing counts (same period `dateWhere`, one extra DB round-trip, no frontend pagination loop, no per-page requests), rounded with the project's existing `roundMoney` (KWD, 3 decimals). The former "Highest Cheque (This Page)" secondary card is replaced in place by "قيمة الشيكات في هذه الصفحة" — the current-page sum, i.e. the hero's *former* calculation (`valueKpis.totalValue`), relocated rather than recomputed; the now-unused per-page "highest" calculation was removed. Draft/Printed/Cancelled counts and the average card are unchanged. `printedTotal` scoping follows the same period-only convention the existing draft/printed/cancelled counts already use (not the table's search/status filter) — flagged to the Product Owner during implementation as the interpretation used, and approved in the visual review.

**Not changed:** Cheque schema, cheque data, cheque statuses, Payment Voucher numbering, accounting entries/business logic, API contracts (beyond the additive `printedTotal` field), print/calibration/reprint/payment-voucher handlers, the historical-cheque backfill data, or any other page.

---
