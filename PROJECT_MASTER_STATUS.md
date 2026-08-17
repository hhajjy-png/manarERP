# PROJECT_MASTER_STATUS.md — manarERP

> **Official master status reference, reconstructed from the Git repository.**
> Git history and repository contents are authoritative. Where PROJECT_STATE.md conflicts with Git, Git wins.
> Last refreshed: 2026-08-17 (previously 2026-08-17, 2026-08-16, 2026-08-16, 2026-08-16, 2026-08-15, 2026-08-15, 2026-08-15, 2026-08-14, 2026-08-11, 2026-08-10, 2026-08-10, 2026-08-10, 2026-08-09, 2026-08-08, 2026-08-08, 2026-08-08, 2026-08-07, 2026-08-07, 2026-08-07, 2026-08-06, 2026-08-06, 2026-08-05, 2026-08-05, 2026-08-04, 2026-08-04, 2026-08-04, 2026-08-04, 2026-08-04, 2026-08-03, 2026-08-03, 2026-08-02, 2026-08-02, 2026-08-01, 2026-08-01, 2026-08-01, 2026-08-01, 2026-08-01, 2026-07-31, 2026-07-31, 2026-07-31, 2026-07-31, 2026-07-31, 2026-07-31, 2026-07-31, 2026-07-31, 2026-07-30, 2026-07-30, 2026-07-30, 2026-07-25, 2026-07-25, 2026-07-24, 2026-07-24, 2026-07-23, 2026-07-23, 2026-07-23, 2026-07-20, 2026-07-20, 2026-07-20, 2026-07-20, 2026-07-20, 2026-07-19, 2026-07-17, 2026-07-01) · This refresh is a release-tracking update, not a read-only audit — it accompanies **Employee Compensation — Cash Payment Voucher v1**: a «طباعة سند صرف» button beside «طباعة الكشف» prints an A4 single-page cash receipt voucher on the official letterhead, fed entirely by the same monthly calculation; the amount is `netAmount − basicSalarySnapshot` via the shared derivation, with the basic salary shown only as `Transferred to Bank` and excluded from the cash paid; 40mm top and ≥20mm bottom safe areas, no electronic header or footer, the existing Arabic and English tafqeet reused for the cash amount alone, and a deterministic QR carrying no print date or time. Printing is read-only — no payment model, no DB write, no migration — and there are no Payroll/Accounting/GL side effects; the change set is frontend-only. Application version unchanged at `2026.5.2`. The prior refresh accompanied **Employee Compensation — Hourly Detail + Cash Entitlement Statement + KD/hour Display v1**: earning lines gain typed `hours`/`rate` columns whose product is verified against the amount and which never enter the legal compliance engine; ComplianceBar stops showing «✓ within limits» when no `OvertimeDayEntry` exists; the statement switches to `Net Cash Entitlement = netAmount − basicSalarySnapshot` with the basic salary shown for information only and marked `Transferred to Bank`; no stored gross/net is shown to the user anywhere; and display units inside this module alone become `KD` and `hour` — with no Payroll/Accounting/GL side effects and no change to any stored value. Additive migration `20260817150000_add_earning_line_hours_rate`; project currency remains `KWD`; application version unchanged at `2026.5.2`. The prior refresh accompanied **Employee Compensation — Daily Overtime Ledger & Legal Compliance Engine v1**: the Daily Overtime Ledger becomes the source of truth for new calculations, legacy months are preserved with no fabricated backfill, legacy REGULAR hours now count toward the annual 180-hour limit while their unknown days force an explicit `PARTIAL` verification state instead of a false "within limits", daily/weekly/annual Article 66 compliance is actually checked, same-day double classification is prevented, a weekly rest day coinciding with an official holiday stays a documented Legal Ambiguity that is never auto-summed, compensatory rest is tracked per day across the year, and the Reverse Calculator creates no fabricated dates or hours — with no Payroll/Accounting/GL integration. Additive migration `20260816120000_add_overtime_day_entry`; no legal number or multiplier changed; application version unchanged at `2026.5.2`. The prior refresh accompanied **Production Release 2026.5.2**: the Full Pre-Production Audit & Polish v1 work packaged into a new self-contained Windows installer (`2026.5.1` → `2026.5.2`). Three fix commits: a payment-concurrency defect in `invoices.addPayment` that let `invoice.paidAmount` diverge permanently from the sum of its payments, plus a cheque-message date format and an unvalidated forms print-log audit payload; an Electron runtime-lifecycle group — `app:restart` bypassing `before-quit` and leaking the backend child so the relaunched instance hit `EADDRINUSE` on the backup-restore path, an unguarded `before-quit` chain that could leave the app unquittable, a missing main-process `uncaughtException`/`unhandledRejection` net, and a `backupScheduler` that logged every outcome including failures as success; and a frontend group — invoice screens computing totals with a formula that diverged from the server (no per-line rounding, no tax cap), a payslip printing the raw `DRAFT` enum, three navigation targets pointing at the undefined `/dashboard` route, and Global Search guarding «المركز المالي» with the non-existent `financial.read` key so the entry never appeared for anyone. 10 new regression tests; no schema change, no migration, no new permission key. A pre-existing packaging defect was found and fixed during this release: the generated Prisma client shipped inside the installer had been stale since before migration `20260814120000` — proven by extracting it from the already-shipped 2026.5.1 installer — because `prepare-backend-deps.js` overlays the repo-root client, which `prisma generate` stops updating once `backend/node_modules` exists; the client was regenerated and the installer rebuilt, and the script itself is recorded as required follow-up rather than changed inside this release. The prior refresh accompanied **Employee Compensation — Configurable Company Overtime Rate Pack v1**: lets Employee Compensation choose the company overtime hourly rate from the system instead of it being fixed in code, while the Kuwait Labour Law engine stays the single source of legal minimums. New `Company Overtime Rate` concept kept strictly separate from the law, versioned independently as `COMPANY_OVERTIME_POLICY_VERSION = MANAR-COP-v1` (never touching `LEGAL_RULES_VERSION = KW-LL-6/2010-v2`); `effectiveRate = max(statutoryMinimumRate, companyDerivedRate)` is resolved in one place so no path can pay an employee below the legal floor, and a below-floor company choice is floored and surfaced as an explicit warning rather than silently cut or rejected. Company-wide default in the existing `Setting` table (key `employeeCompensation.companyOvertimeBaseRate`), per-month override editable even after approval, additive migration `20260816120000_add_company_overtime_rate` (7 nullable columns) — `NULL` means "no company policy" and reproduces the exact pre-pack formula, proven live so re-saving an old month never moves its amount. Reverse overtime now derives hours from the effective rate of the selected type; copying a previous month follows the current default, not the copied snapshot. Short statement still exposes no rate; the detailed report shows statutory/company/effective side by side. No Payroll/Accounting/GL/Expense write and no Employee mutation — enforced by the module's isolation test. Application version stays `2026.5.1` — backend/frontend feature pack, no installer rebuild. 27 files (22 modified, 5 new). The prior refresh accompanied Production Release 2026.5.1.
> Method: `git for-each-ref`/`--merged` over all tags + four codebase surveys (Banking, Printing, AI, ExplorerKit) + direct module/schema reads.
> Evidence confidence is marked per section. Anything not confirmable from the repo is marked **UNKNOWN**.
>
> **Refresh cadence:** this file must be regenerated every time `PROJECT_STATE.md` is rotated (see that file's
> "Rotation & Archive Policy" section) — at minimum the "Current Production State" and "Repository Status" tables
> below. This pass (Collection Analysis Page v1), like the Administrative Forms Barcode Enhancement Pack v1 pass
> and the ones before it, refreshed the "Current Production State" table only (re-derived directly from
> `git`) — the "Repository Status" quantitative table and the deeper narrative surveys (Banking/Printing/AI/
> ExplorerKit sections further down) were last verified 2026-07-17/2026-07-01 respectively and have not been
> re-audited in this pass — treat their specifics as of those dates, not current-day. This pass only repoints the
> table below at the current HEAD, consistent with every other table-only pass in this history. `PROJECT_STATE.md`'s
> release-log has grown well past its own ~15-entry rotation trigger (130 `## Previous Release` sections as of
> this pass) without ever being archived — pre-existing, not caused by this release, flagged here as a
> maintenance item for a future dedicated pass.

---

# Project Overview

**System:** نظام المنار لإدارة الأعمال (Al-Manar Business Management System)
**Company:** شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م
**Type:** Offline-first Electron desktop ERP (Windows), Arabic-first UI / English codebase
**Currency:** Kuwaiti Dinar (د.ك), 3 decimal places
**Nature:** Single-company internal ERP — no SaaS, no multi-tenant, no cloud dependency

The system covers accounting/finance, invoicing, procurement-adjacent flows, HR/payroll/attendance, equipment & maintenance, inventory, cheques, a full print/document engine, banking import & reconciliation, a deterministic offline "AI" assistant, and an executive analytics layer.

*Confidence: High (from CLAUDE.md + repository structure).*

---

# Current Production State

| Field | Value | Confidence |
|---|---|---|
| **Current branch** | `production` | High |
| **Current HEAD** | `bd9d5b47` — merge of `feature/ecmp-cash-payment-voucher-v1` (**Employee Compensation — Cash Payment Voucher v1**. Adds a «طباعة سند صرف» / Print Payment Voucher button beside «طباعة الكشف» on the monthly screen, producing a **cash receipt voucher** on the company's official letterhead whose every field comes from the same monthly calculation — no second data entry, no re-typing of employee, month, amounts or line items. **The voucher amount is cash, not the stored net**: `Voucher Cash Amount = netAmount − basicSalarySnapshot`, derived by the very same `deriveCashEntitlement` the statement, the detailed report and the QR payload use — the template contains no arithmetic of its own, guarded by a test that forbids any subtraction inside it. The basic salary is shown for information with `تم تحويله إلى البنك / Transferred to Bank` beside it and stays out of the paid amount: a sheet the employee signs for cash in hand must not carry a salary that reached his bank account days earlier. Worked examples are pinned by tests — 150 basic / 250 stored net ⇒ 100, Suliman 450 / 570 ⇒ 120, and with a 20 deduction ⇒ 80 (the basic subtracted once, since deductions already sit inside `netAmount`). **Cloned from the administrative Payment Voucher, which was not touched**: brand colour `#2b2e83`, title box, blue label cells, `1.2px #b9bccd` borders, the green amount box and the dotted rules were reused, but `forms/PaymentVoucherTemplate.tsx` itself is byte-identical — generalising it to serve two documents would have meant conditional flags altering a live printed document; three tests guard that it stayed unchanged. **A4 portrait, one page, 40mm top and ≥20mm bottom**: the letterhead profile's own margins are the specification, so no extra top spacer is used. Measured on the real print band — 236.9mm available, 227.9mm used, 9.0mm slack — a four-item month (the maximum in the data) stays on one page and a fifth item still fits within the 199.1mm budget; that was achieved by compressing empty space alone, with no field dropped and no type shrunk below readability. **No electronic header or footer** — the sheet already carries the company's printed letterhead and footer, so `blankHeader`, `hideFormNumber`, `hideApprovalSection` and a new opt-in `hideTitleRule` leave only the voucher body plus its verification code; no page number, no “generated by”, no URL. **The existing tafqeet is reused, applied to the cash amount alone**: `lib/tafqeet.amountToWordsKWD` in both Arabic and English — the same helper the administrative voucher and the cheques use, with no new amount-to-words system — and a test proves the stored net and the basic salary are never spelled out. **The QR is deterministic and carries no print date or time**: five fixed lines (voucher reference, employee name, employee code, period, net cash amount), so a reprint encodes the same bytes — a voucher whose code changes when reprinted is worthless as proof; a test rejects any date or time pattern and any `printDate`/`printedAt`/`timestamp`/`generatedAt`, and the template never reads the device clock. The signature block was simplified by owner decision to a centred «المستلم / Received By» above blank space for a handwritten signature, with **no fabricated receipt date** — there is no stored payment record to read one from. **Zero cash blocks the voucher structurally**: at `cashNet ≤ 0` the page refuses before `FormLayout` is even composed (not merely a hidden button) and states so in both languages, with the month-screen button disabled in the same case. **Printing is read-only**: it means neither APPROVED nor PAID nor received nor posted, changes no calculation, and adds **no payment table, status, cashier ledger, payment date field or receipt confirmation** — the signed paper becomes the proof of receipt. No Prisma model, no migration, no new permission key; `migrate status` stays 64/64. One additive shared-file change: an opt-in `hideTitleRule` flag on `FormLayout`, default `false`, so the administrative voucher — which also passes `title=""` but does not set it — prints exactly as before. **No Payroll/Accounting/GL/Expense/cheque/bank-export write and no DB write of any kind**; the merge touches **frontend files only**. Frontend `tsc --noEmit`, backend `tsc --noEmit`, `prisma validate`, `migrate status` 64/64, 28 new voucher tests, 10 affected files / 174 tests (including the administrative-voucher and completeness guards), full frontend 219 files / 4024 tests, backend 3230 tests, `build:front` — all green, re-verified on `production` post-merge. Application version stays `2026.5.2`; no installer rebuild. 9 files (6 modified, 3 new). Full detail: `PROJECT_STATE.md`'s release ledger.) · Previous HEAD `3f6d0132` — merge of `feature/ecmp-statement-cash-net-v1` (**Employee Compensation — Hourly Detail + Cash Entitlement Statement + KD/hour Display v1**: three things in one pack. **Earning lines carry hours and rate as typed columns** — two nullable columns on `CompensationEarningLine` (`hours Float?`, `rate Float?`), because «7 hours × 4.000» is two numbers and not a sentence: they get their own columns, are summed, and their product is verified. Storing them inside `notes` would have forced every reader — month screen, statement, detailed report, tests — to re-parse prose, and the first wording change would break all of them silently. `resolveHourlyDetail` in `engine/compensationTotals.ts` enforces three rules on every caller (UI, API, script): both or neither, both positive, and `roundMoney(hours × rate) === roundMoney(amount)` — rounding applied to both sides so `3 × 4.335` is not falsely rejected. A purely financial line (expense, bonus) stays `NULL`/`NULL` and never zero, since zero reads as a measurement. **These hours never enter the legal compliance engine**: the single source of truth for overtime hours remains `OvertimeDayEntry` with its dates, so a line carrying 200 hours raises no warning and does not touch the Article 66 limits (2 h/day · 3 days/week · 90 days/year · 180 h/year) — dateless numbers must not manufacture a compliance verdict, which is exactly what the daily ledger exists to prevent; guarded by engine tests plus a structural test asserting the month screen's ComplianceBar condition reads `overtimeDays` and `overtime` only, never `earnings`. **ComplianceBar stops claiming «✓ ضمن الحدود» over nothing** — with zero `OvertimeDayEntry` rows and zero aggregate overtime lines it now renders a neutral «لا توجد ساعات إضافية يومية مسجلة للتحقق» with no green badge and no alarm colour. The risk was concrete rather than theoretical: a month can carry a line labelled «إضافي عادي» whose detail says 7 hours, and a green badge above it reads as legal validation of hours that were never checked and cannot be, having no dates at all. With real hours present the normal bar returns unchanged, and omitting the new prop preserves the previous behaviour. **The statement now reflects how the company actually pays** — basic salary is transferred to the bank, additional entitlements are handed over in cash. A single derivation `deriveCashEntitlement`, called by the statement, the detailed report and the QR payload alike, yields `cashNet = netAmount − basicSalarySnapshot` and `additional = grossEntitlements − basicSalarySnapshot`. The basic is subtracted **once**: deductions are already inside `netAmount`, so subtracting them again would cut the cash figure twice. The basic-salary row carries `تم تحويله إلى البنك / Transferred to Bank` beneath it, small and grey, on the row itself rather than as a footnote, so the employee reads the amount together with its route when signing for receipt. Final labels are `إجمالي المستحقات الإضافية / Total Additional Entitlements` and `صافي المستحق نقدًا / Net Cash Entitlement`. **No stored gross or net is shown to the user anywhere** — not in the statement, not in the detailed report, not in print/PDF, not even in small type as a reference: a document carrying two large figures, one of which includes a salary already deposited in the bank, invites reading it as cash owed. The stored values stay in the database untouched and are read from there for audit; guarded by an explicit test. The QR payload follows the paper and now encodes the cash net — encoding the stored net would hand a scanner a larger number than the employee signed for, which is worse than having no code. **Display units inside this module only** became `KD` and `hour` (`28.000 د.ك` → `28.000 KD`, `150.000 KWD` → `150.000 KD`, `7 ساعة × 4.000 د.ك` → `7 hour × 4.000 KD`, `4 ساعات` → `4 hour`), implemented through a local `employee-compensation/units.ts` that wraps the shared formatter and swaps the suffix alone — `forms/shared/formStyles`, `lib/format` and `config/modules` are untouched, so invoices, cheques, accounting, payroll and the fourteen administrative forms still render `KWD`/`د.ك`, asserted by test. The project currency remains `KWD`: storage, 3-decimal precision, amounts, hours, rates, formulas, API payloads and field names (`hourlyRate`/`hours`/`amount`/`netAmount`) are unchanged. **Presentation and additive schema only** — zero change to `basicSalarySnapshot`, `netAmount`, `grossEntitlements`, line amounts, calculation status, `approvedAt`, `createdByName` or the employee master, and **no Payroll/Accounting/GL/Expense/cheque/bank-export write**, with the module's source-scanning isolation guard passing 14/14. Additive migration `20260817150000_add_earning_line_hours_rate` — two `ALTER TABLE … ADD COLUMN` statements only, no `DROP`/`DELETE`/`TRUNCATE`/`RENAME`/`UPDATE`/`NOT NULL`/`ALTER COLUMN`, no table rebuild, no backfill inside the migration, no new permission key; every existing row keeps `NULL` on both columns. Separately, as data rather than code, the historical `ONE_TIME_ECMP_IMPORT_2024_2026_V1` batch had `hours`/`rate` populated on 529 lines from the approved scenario source file (395 regular @4.000 · 97 weekly-rest @6.000 · 37 official-holiday @8.000) while 432 purely financial lines stayed `NULL`/`NULL`; the totals did not move — 395 calculations, 961 lines, extra `37,995.000`, gross `104,445.000`, net `104,445.000`, all DRAFT, `OvertimeLine`/`OvertimeDayEntry` = 0. Employee Compensation backend 10 files/276 tests · frontend compensation 5 files/101 tests · isolation guard 14/14 · `tsc --noEmit` ×2 · `prisma validate` · `migrate status` 64/64 · `build:back`/`build:front` — all green, re-verified on `production` post-merge. Application version stays `2026.5.2` — backend/frontend feature pack, no installer rebuild. 26 files, 20 modified and 6 new) · Previous HEAD `0a3fbd55` — merge of `feature/employee-compensation-daily-overtime-ledger-v1` (**Employee Compensation — Daily Overtime Ledger & Legal Compliance Engine v1**: moves overtime from dateless monthly aggregates to a dated **daily ledger** that is the source of truth for new calculations, so the four Article 66 limits are actually verified rather than merely disclosed. New `OvertimeDayEntry` table carries each overtime hour's date and legal type; `OvertimeLine` keeps the money and the rate snapshot but its hours are rewritten from `Σ` of its days **inside the same transaction**, so the total cannot drift from its detail. `date` is stored as `YYYY-MM-DD` text rather than `DateTime` deliberately — UTC conversion shifted a Kuwait (UTC+3) workday a full day at midnight, moving it across weeks and, at a month edge, across months, collapsing every weekly and annual check. Legacy months are preserved with **no fabricated backfill**: "legacy" is defined by the absence of daily rows, the migration is purely additive, and converting an old month is an explicit confirmed action with a reconciliation notice showing, per type, the gap between the stored hours and the entered days. **Legacy REGULAR hours now count toward the annual 180-hour limit** — the counter previously read dated rows only, so an employee with 170 legacy hours plus 20 daily hours was shown "20 / 180" and approved cleanly while the true balance was 190; a statutory breach passing because the system forgot what it already knew. Their days remain unknown and are never inferred, so a new `verification: FULL | PARTIAL` — deliberately **separate** from `compliant`, since one answers "was the data sufficient to check?" and the other "was a breach proven?" — marks such years `PARTIAL` with a disclosure naming the months and distinguishing what stayed verified (180 h/yr) from what did not (90 days/yr · 3 days/wk); the UI badge gains a third "تحقّق غير مكتمل" state instead of claiming "✓ within limits". A pure `engine/overtimeComplianceEngine.ts` (no Prisma, no system clock) checks 2 h/day · 3 days/week · 90 days/year · 180 hours/year, with the work week starting Sunday by reusing the repository's documented Kuwait convention from `HolidayEngine`; one query spanning `year-1-12-25 → year+1-01-07` lets weeks be evaluated whole across both month and year boundaries while the annual counters stay inside the calendar year. No legal number or multiplier changed. **Same-day double classification is now prevented** — the model previously accepted `REGULAR` + `WEEKLY_REST` + `OFFICIAL_HOLIDAY` on one date, i.e. two different multipliers over the same day's hours. **An official holiday falling on the weekly rest day remains a documented Legal Ambiguity**: Articles 67/68 and Ministerial Decision 188/2010 resolve neither precedence nor whether both premiums apply nor how many compensatory days are owed, so the system neither sums nor ranks them — it rejects the dual classification and flags it `legalAmbiguity` as a decision requiring a documented company position. Compensatory rest is tracked per day (`PENDING`/`SCHEDULED`/`TAKEN`), forced `NULL` on `REGULAR` because Article 66 creates no such entitlement, and counted **across the year** so March's entitlement does not vanish when April opens; **no time limit was invented** — the source text states none. The Reverse Calculator creates no fabricated dates or hours: hours derive from the days the user actually selected (a 13-hour suggestion with 4 hours of selected days saves **4**), and the distribution assistant only touches user-selected rows. Compliance is now evaluated during editing via a read-only `preview`, so a violation appears as it is typed rather than after saving. Draft always saves and a violation stays classified `STATUTORY` — never downgraded to a warning — while approval alone is blocked, listing its reasons with dates. **No Payroll/Accounting/GL integration**; the module's source-scanning isolation guard was extended to forbid `attendance`, `holiday` and `leave`, precisely the models a daily ledger would tempt a later edit to read. Additive migration `20260816120000_add_overtime_day_entry` — one `CREATE TABLE` plus 3 indexes, no `ALTER`/`DROP`/`DELETE`/`UPDATE`/`INSERT`, no backfill, no new permission key. Employee Compensation backend 9 files/263 tests · frontend compensation 2 files/37 tests · isolation guard 14/14 · `tsc --noEmit` ×2 · `prisma validate` · `migrate status` 63/63 — all green, re-verified on `production` post-merge. Application version stays `2026.5.2` — backend/frontend feature pack, no installer rebuild. 23 files, 17 modified and 6 new) · Previous HEAD `74a946c2` — merge of `feature/full-pre-production-audit-polish-v1` (**Production Release 2026.5.2**: Full Pre-Production Audit & Polish v1, packaged into a new self-contained Windows installer; `package.json` version `2026.5.1` → `2026.5.2`. Three fix commits. Backend `506bd582`: `invoices.addPayment` read the invoice and computed its over-payment guard before opening the transaction and wrote `paidAmount` as an absolute value derived from that stale read, so two concurrent submissions each created a payment row and a journal entry while one single total was written — a permanent divergence between `Σ payments.amount` and `invoice.paidAmount`; the read and validation now happen inside the transaction. The cheque-number conflict message rendered an English weekday with no year (`String(Date).slice(0, 10)` on a DateTime column), now `toLocalDateString`. The forms print-log stored the request body verbatim in the audit log with no schema; a strict Zod schema now clips it to known fields and bounds their lengths. Electron `aadf4b15`: `app:restart` called `app.exit(0)` directly, bypassing `before-quit` so the backend child was never stopped — and on Windows the parent's exit does not kill the child, so port 48211 stayed held and the relaunched instance failed with `EADDRINUSE`, on the backup-restore path that invokes this channel every time; the backend is now stopped with its exit awaited and the runtime lock released before `relaunch`. `before-quit` calls `preventDefault` and its only exit sat at the end of an unguarded chain, so any throw while creating the progress window or in `finish()` left the app unquittable with no dialog and no log — the sequence is now in try/finally with the exit in `finally`. An `uncaughtException`/`unhandledRejection` safety net was added to the main process. `backupScheduler.postToInternal` resolved on any response and on network error, so it never rejected and its `catch` was dead code: 500s, 401 rejections and a non-listening backend were all logged as successful automatic backups; the status code and `data.status === 'FAILED'` are now checked. Frontend `f6cc574e`: the create/edit/fast-entry invoice screens computed totals with a second formula diverging from the server in two places — no per-line rounding and no tax cap — so three lines of 3 × 0.3335 displayed 3.002 against a stored 3.003, and any invoice with tax > 0 showed an edit-screen total contradicting the stored value and every report; new `computeInvoiceTotals` mirrors `invoices.calc.ts` for all three screens and `invoiceLineTotal` now rounds. The payslip printed the raw `DRAFT` enum inside a formal Arabic document despite `payroll.status.*` keys existing; three AI-assistant nav targets pointed at the undefined route `/dashboard`; and Global Search guarded «المركز المالي» with `financial.read`, a key in neither `constants.ts` nor the seed, so the entry never appeared for any user — the real key is `statements.read`. 10 new regression tests, no schema change, no migration, no new permission key. **Packaging defect found and fixed during this release, pre-existing:** the generated Prisma client shipped inside the installer was stale — `scripts/prepare-backend-deps.js` overlays the repo-root `node_modules/.prisma`, but once `backend/node_modules` exists (created by a previous `npm run dist`) `prisma generate` resolves to that copy and the root is never refreshed. Proven pre-existing by extracting the client schema from the already-shipped `AlManarERP-Setup-2026.5.1.exe` — 104,359 bytes, missing `EntitlementsBankStatement`, `expectedReturnDate` and `companyOvertimeBaseRateSnapshot`, i.e. that installer would have failed at runtime on three shipped features. The root client was regenerated and the installer rebuilt; the shipped client now carries 74 models matching `schema.prisma` exactly, verified in `win-unpacked` and by extraction from inside `Setup.exe`. `prepare-backend-deps.js` itself was deliberately left unchanged — a source fix outside the reviewed scope, recorded as required follow-up. Backend 198 files/3132 tests · Frontend 216 files/3959 tests · Electron 26 files/499 tests · `tsc --noEmit` ×3 · `prisma validate`/`migrate status` 62/62 — all green, re-verified on `production` post-merge. Packaging audit over `app.asar` (676 entries), `extraResources` (3,272 files) and all 4,062 `Setup.exe` entries: zero source maps, tests, TypeScript, `.env`/secret files, SQLite journals, stray `.db` or non-Windows Prisma engines. Golden Database SHA-256 `77a9243ab3ecef3f157739eb94247c4b1d23b9cb50569a3cb4a0601af1967b73` (3,321,856 bytes · `integrity_check = ok` · 78 tables · 62 applied migrations) byte-identical in four places: source · `win-unpacked` · extracted from inside `Setup.exe` · `seed-data/golden-manifest.json`. Installer `AlManarERP-Setup-2026.5.2.exe`, 138,258,420 bytes (131.85 MiB), SHA-256 `8590e7ed356064d5ee701cfcbb6bc4e8168c329e95b761bfa83ff047835c9ed1`. 20 files, 17 modified and 3 new) · Previous HEAD `310fcaa7` — merge of `feature/employee-compensation-configurable-overtime-rate-v1` (**Employee Compensation — Configurable Company Overtime Rate Pack v1**: lets Employee Compensation choose the company overtime hourly rate from the system instead of it being fixed in code, while the Kuwait Labour Law engine stays the single source of legal minimums. New `Company Overtime Rate` concept, kept strictly separate from the law: `policy/companyOvertimePolicy.ts` derives per-type company rates (`REGULAR` ×1.00 · `WEEKLY_REST` ×1.50 · `OFFICIAL_HOLIDAY` ×2.00) from one base rate, versioned independently as `COMPANY_OVERTIME_POLICY_VERSION = MANAR-COP-v1` — never touching `LEGAL_RULES_VERSION = KW-LL-6/2010-v2`. `engine/effectiveOvertimeRate.ts` is the single point resolving `effectiveRate = max(statutoryMinimumRate, companyDerivedRate)`; no other path can pay below the legal floor, and a below-floor company choice is accepted, floored, and surfaced as an explicit `COMPANY_OVERTIME_RATE_BELOW_STATUTORY` warning rather than silently cut or rejected. Company-wide default lives in the existing `Setting` table (key `employeeCompensation.companyOvertimeBaseRate`, group `employeeCompensation`) — no new settings mechanism — editable from a compact dialog shared by the module list and the month editor, with 3.000/4.000/5.000 د.ك quick presets plus free entry; a per-month override is editable even after approval. Changing the default touches zero saved calculations — each month snapshots `companyOvertimeBaseRateSnapshot` + `companyOvertimePolicyVersion`, and every overtime line snapshots its statutory/company/effective rate and which one won. Additive migration `20260816120000_add_company_overtime_rate` (7 nullable columns, hand-written to avoid an unrelated `RedefineTables` rebuild); `NULL` means "no company policy" and reproduces the exact pre-pack formula (`hours × hourlyRate × multiplier`, one final rounding) byte-for-byte, proven live against a seeded pre-pack calculation so re-saving an old month never moves its amount. Reverse overtime now derives hours from the effective rate of the selected type. Copying a previous month follows the current default, not the copied snapshot, reporting the difference explicitly. The short official statement exposes no rate, source, or policy version (verified by a source-scanning frontend test); the internal detailed report shows statutory/company/effective side by side with the winning source labelled. No Payroll/Accounting/GL/Expense write and no Employee mutation — enforced by the module's pre-existing source-scanning isolation test, extended to require every `Setting` access to go through the new centralized key constant. Verified live end-to-end on an isolated database/backend copy (port 48299, scratch SQLite file): default configuration → month creation → global default change leaving the old month untouched → new month inheriting the new default → per-month override → approval → editing the rate of an approved month with recalculation → copy-previous-month using the current default → statutory floor on a high salary with a low company rate → input validation — every check passed, and the shared development database was confirmed untouched throughout. 36 new backend tests plus isolation/UI guard-test extensions. Backend 3129 tests/Frontend 3952 tests green pre-merge; `tsc --noEmit` (backend/frontend/electron) and `prisma validate`/`migrate status` re-verified clean post-merge. Application version stays `2026.5.1` — no installer rebuild. 27 files, 22 modified and 5 new) · Previous HEAD `e8fea376` — merge of `feature/production-release-2026.5.1` (**Production Release 2026.5.1**: packages a new self-contained Windows installer including everything merged onto `production` since the 2026.5.0 installer — Employee Entitlements Bilingual One-Page Statement Pack v1, Monthly Entitlements Bank Statement Pack v1 (additive migration `20260814120000_add_entitlements_bank_statement`), Employee Entitlements Leave Management Pack v1 (additive migration `20260815090000_add_leave_expected_return_date`), and Privacy Toggle Tier A v1 — all four already merged, tagged, and documented individually; `package.json` version `2026.5.0` → `2026.5.1` is the only additional tracked-file change. Full validation before packaging: Backend/Frontend/Electron `tsc --noEmit` clean · `prisma validate`/`migrate status` clean (61/61 applied) · Backend 196 files/3087 tests · Frontend 215 files/3943 tests · Electron 26 files/499 tests — all green. Packaging content directly audited (`app.asar` via `npx asar list` + `extraResources` filesystem walk): zero leaked dev/test/source-map/`.env`/secret files, matching `electron-builder.yml`'s declared exclusion filters; 61 Prisma migrations, `electron-dist/main.js`, `preload.js`, `frontend/dist/index.html`, and all bundled fonts/assets confirmed present. Golden Database SHA-256 `da769b8c70f372c0ab56cc2d5670e3316f27af6781c48bbd65074005b7bfdf24` (3,358,720 bytes, 61 applied migrations) verified byte-identical in three places: source `backend/data/manar.db` · `win-unpacked/resources/backend/data/manar.db` · extracted directly from inside `Setup.exe` via `7za`. Installer `AlManarERP-Setup-2026.5.1.exe`, 138,282,665 bytes (131.87 MiB), SHA-256 `e95021e4735572f9bb493c7b87e09d7edbd9a94bea481eb55a40e0ab5d831931`. GUI/install-flow not driven interactively — no desktop session available — covered by the Product Owner's completed manual visual and functional review. 1 file changed) · Previous HEAD `7cb1c738` — merge of `feature/privacy-toggle-tier-a-v1` (**Privacy Toggle Tier A v1**: audit + fix of the top-bar lock button's "hide/show financial numbers" feature. Root cause: the button was never broken — `togglePrivacy()` in `uiStore.ts` is a plain boolean flip with no stale closures, memoization, or localStorage desync, called directly on every click. The real defect was coverage — `privacyMode`/`usePrivacyMode()` was read in only 3 files (`Layout.tsx`, `uiStore.ts`, `PrivateAmount.tsx`) out of roughly 90 files displaying financial numbers; the rest went through `money()`, `MoneyText`, `MoneyCell`, `fcCurrency()`, chart tooltip/axis formatters and print templates that never consulted the privacy store, so real amounts stayed visible on most screens regardless of the lock's state. Fix: `MoneyText`/`MoneyCell` in `config/modules.tsx` now call `usePrivacyMode()` and render through `PrivateAmount`'s existing `pm-mask`/`pm-real` dual-span pattern, reusing its exported `buildLevel1Mask()` rather than duplicating the algorithm — one shared mechanism, no parallel system, and zero changes to the ~60 existing `<MoneyText>`/`<MoneyCell>` call sites across Accounting, Invoices, Salaries, FinancialCenter, BankAccountExplorer, Expenses, Inventory, Maintenance, Prices, and Collection Analysis. Print output is unaffected — `pm-real` is forced visible under `@media print` regardless of on-screen mask state, via the pre-existing `privacy.css` contract. `MoneyCell`'s not-applicable `—` placeholder is never masked. 13 new focused tests cover the button itself (default state, exactly one button, immediate toggle with no refresh), repeated Hide→Show→Hide→Show cycling, cross-page navigation, and the three money-display primitives. Deferred by design: Tier B — `money()`/`fcCurrency()` calls built outside JSX, Recharts tooltip/axis formatters, on-screen print-preview renders, and the AI `ResultCard` still bypass the mechanism and are documented explicitly as out of scope for this release, not a regression. Presentation only — zero calculation, permission, or schema change. Frontend 215 files/3943 tests ✅ (3930 pre-existing + 13 new) · `tsc --noEmit` clean · production build clean · merged tree byte-identical to the reviewed branch tree. 4 files, 2 modified and 2 new) · Previous HEAD `90868cb1` — merge of `feature/employee-entitlements-leave-management-ui-v1` (**Employee Entitlements Leave Management Pack v1**: bundles four packs. **Leave management UI** wires the pre-existing Leave CRUD backend — found via audit to have zero frontend callers — into the entitlements page: an «إضافة إجازة» dialog and per-row اعتماد/رفض actions calling the existing `POST /employees/leaves` / `PATCH .../approve` / `PATCH .../reject` unchanged, no new permission key (reuses `employees.create`/`.update`). **Print leave form shortcut**: an «طباعة نموذج الإجازة» action on `APPROVED` rows navigates to the existing `LeaveRequest` form via route state, prefilled from the **selected** leave record rather than the server's `latestLeave`, so an older approved leave prints correctly even when a newer one exists — no new template, no print-engine change, no database write from opening or editing the print page. **Full leave request data capture**: `reason` already existed on `Leave` and in `leaveSchema` with no UI; only `expectedReturnDate` needed a schema change — one additive nullable column, migration `20260815090000_add_leave_expected_return_date` — so a leave request can be reprinted later with its original data. **Legal leave balance & payments reconciliation** fixes a defect in this branch's own prior pack, which had removed leave-balance consumption entirely instead of fixing the real bug: an approved leave used to deduct its FULL duration on approval regardless of whether it had started, so a future 92-day leave could zero the balance before the employee took a day. New pure `clipLeaveIntervalToAsOf()` clips every approved `ANNUAL` leave to the portion elapsed as of the calculation date before counting it; holidays and approved `SICK` leave inside it remain excluded per Labour Law 6/2010 Art. 70. New `overusedLeaveDays` explains a zero balance from over-consumption instead of silently flooring it, never converted to a negative amount. The balance-detail UI separates day consumption from `LEAVE_ALLOWANCE` payments in the existing `EmployeeEntitlementLedger` — an `END_OF_SERVICE` payment does not touch the leave value. Final Settlement is unaffected in code, consuming the same canonical `computeAt()` engine. Weekly rest days remain undeducted — documented as a data-source gap, not a fabricated rule. Backend/Frontend `tsc` clean, `prisma validate`/`migrate status` clean, Final Settlement's 51 tests re-verified on `production` post-merge. 16 files, 11 modified and 5 new) · Previous HEAD `3b8e968d` — merge of `feature/monthly-entitlements-bank-statement-v1` (**Monthly Entitlements Bank Statement Pack v1**: adds a second, fully independent bank transfer statement («كشف المستحقات الشهرية» / Monthly Entitlements) alongside the existing Salary Bank Statement, on a new tab in the Salaries page. Transfer amount is always `roundMoney(netAmount − basicSalarySnapshot)`, both operands read from the same APPROVED `EmployeeCompensationCalculation` row for the selected year/month — never the live `Employee.salary` — and no other formula exists. Eligibility is server-enforced: an employee is exportable only with an APPROVED calculation for the exact period, passing bank-field validation, and a positive transfer amount; every ineligible employee stays visible with an explicit reason instead of being hidden. The NBK workbook builder (sheets, headers, column order/widths, Bank Codes reference list, validation, KWD 3-decimal rounding) was extracted verbatim from `payrollBankExport`'s salary profile into a new `shared/services/bankExport` engine, so both statements produce byte-identical output (asserted by test) and are told apart only by file name (`NBK_Entitlements_<year>_<MM>.xls` vs `NBK_Salary_<year>_<MM>.xls`). Approving a statement snapshots every bank-file value (net, basic, transfer amount, English name, civil ID, bank account) into two new additive tables — `entitlements_bank_statements` / `entitlements_bank_statement_lines` — so the bank file is built only from that frozen snapshot; a later edit to the source calculation cannot silently change an already-approved statement, proven by test (net 350→900 post-approval still exports 200.000). `@@unique([year, month])` allows one approved statement per month; unapproving is the only way to change it and is audited. Isolation proven by test: every path spies on Payroll/SalaryPayment/EmployeeCompensation/GL/Expense writes and asserts none occurs, and the pre-existing salary bank export's 23 tests pass unchanged on `production` post-merge. No new permission key — reuses `employeeCompensation.read`/`.approve`. Includes a UI Polish Pack (compressed spacing, compact alert, approve-then-export action order, LTR-isolated money cells via `MoneyText`/`MoneyCell`) and per-row/select-all checkbox selection with `indeterminate` state, scoped entirely to new `.ebx-*` classes — the existing Salary Bank Statement tab is unchanged. Additive Prisma migration `20260814120000_add_entitlements_bank_statement` only, zero existing table/column/index altered; no installer rebuild. Backend 196 files/3059 tests ✅ · Frontend 211 files/3875 tests ✅ · zero TypeScript errors · `prisma validate` ✅ · `migrate status` 60/60 applied ✅. 21 files, 5 modified and 16 new) · Previous HEAD `692644c2` — merge of `docs/master-status-backfill-v1` (**Docs Backfill Pack v1**: backfills three release narratives that were missing from this file's own release-history section — Production Release 2026.5.0, Production Release 2026.4.0, and Employee Compensation v1 — sourced only from `PROJECT_STATE.md` and `AI_CONTEXT.md`, matching the section's existing narrative style and separator convention, with nothing invented or reinterpreted; removes the temporary "Narrative backlog" note the gap had been flagged with. Docs-only: this file is the sole file touched, so no build or test suite was re-run. 1 file changed) · Previous HEAD `274eff82` — merge of `feature/employee-entitlements-bilingual-one-page-v1` (**Employee Entitlements Bilingual One-Page Statement Pack v1**: renames the monthly employee entitlements module to «مستحقات الموظف الشهرية» / «Monthly Employee Entitlements» and rebuilds its official statement as a single bilingual A4 page. Every row carries Arabic and English on one line, Arabic-first RTL with the English half isolated in `<bdi dir="ltr">`; the English half of a **value** comes only from an approved source — stored `Employee.fullNameEn`, the approved job-title translation table plus Settings overrides through a new strict `lookupJobTitleEn` that returns `null` rather than echoing the Arabic back as a pseudo-translation, and `MONTH_NAMES_EN` against the month already in the calculation record — with the Arabic printed alone when no approved source exists. The statement-date row and both former approval blocks are replaced by one horizontal `الاعتماد والاستلام / Approval & Receipt` section; compact styles stay local to this template so the other fourteen administrative forms remain byte-identical; the document sits 20mm lower via `FormLayout`'s existing `contentTopOffset`, which renders inside the single `.form-page` node that accurate preview, Save PDF and print all clone. The QR payload for this statement alone is employee name · net entitlement · period, short-circuited before the default lines are built so no future `QRData` field can leak in, leaving every other document's encoded text byte-identical. Also corrects an unscoped `tbody tr:nth-child(even) td` rule in `app/theme.css` that had been shading printed line items but never the totals rows, which already carry an inline background. Presentation only — zero calculation, business-rule, permission-key, Prisma-model or migration change; the single backend edit is a read-only lookup of an existing column for display. 14 files, 11 modified and 3 new) · Previous HEAD `6ae6536b` — merge of `audit/full-project-audit-2026-08-13` (**Production Release 2026.5.0**: Full Project Engineering Audit — a six-agent parallel review of the whole repository, closing a CRITICAL RBAC bypass in which a demoted `SYSTEM_ADMIN` kept full privileges until token expiry because the admin short-circuit read `roleName` from the JWT rather than the database, a stale-response race across seven list loaders, a keyboard-unreachable logout, a missing rate limit on the public verification route, a non-constant-time internal-secret comparison, raw floating-point KWD accumulation in the salaries summary, and a payroll message claiming a journal posting that never happens; plus 26 frontend tests that had been failing on `production` itself, all from tests lagging behind the code, now green with zero production-source change — **Prisma Schema & Migration Reconciliation Pack v1** aligning two `updatedAt` fields with what the hand-written migration actually created, with zero database change — **Invoice Items Foreign Key Reconciliation Pack v1** adding the `invoice_items.priceId → project_prices.id` constraint (`ON DELETE RESTRICT` / `ON UPDATE CASCADE`) that `schema.prisma` had declared but no migration ever created, since SQLite cannot attach a foreign key through `ALTER TABLE ADD COLUMN`; `migrate diff --from-migrations --to-schema-datamodel` now reports an empty migration) | High |
| **Current stable tag** | `stable-ecmp-cash-payment-voucher-v1` (merge commit `bd9d5b47`) · Previous `stable-ecmp-hourly-detail-cash-statement-v1` (merge commit `3f6d0132`) | High |
| **Previous stable tag** | `stable-employee-compensation-daily-overtime-ledger-v1` (merge commit `0a3fbd55`); last installer release: `stable-production-release-2026.5.2` (merge commit `74a946c2`) | High |
| **Application version** | `2026.5.2` — new installer build; installer `AlManarERP-Setup-2026.5.2.exe` (131.85 MiB, 138,258,420 bytes, SHA-256 `8590e7ed356064d5ee701cfcbb6bc4e8168c329e95b761bfa83ff047835c9ed1`, Windows 10/11 x64, per-user install under `%AppData%`); `release/win-unpacked` 3,344 files / 468,823,768 bytes (447.1 MiB). Golden Database SHA-256 `77a9243ab3ecef3f157739eb94247c4b1d23b9cb50569a3cb4a0601af1967b73` (3,321,856 bytes · 62 migration folders · `integrity_check = ok` · 78 tables) — the latest approved development database, verified byte-identical across source · `win-unpacked` · extracted from inside `Setup.exe`, and recorded identically in `seed-data/golden-manifest.json`. The generated Prisma client inside the package was regenerated for this build and carries all 74 models; the 2026.5.1 installer shipped a client stale since before `20260814120000` (see the Current HEAD narrative) | High |
| **DB path (dev)** | `backend/data/manar.db` | High |
| **DB path (prod)** | `userData/data/manar.db` | High |
| **Backend port** | `127.0.0.1:48211` (localhost only) | High |
| **Default credentials** | `admin` / `Admin@123` (change on first login) | High |

### Repository Status (statistics) — refreshed 2026-07-17

| Metric | Value (2026-07-01) | Value (2026-07-17) |
|---|---|---|
| Total tags | 340 | **454** |
| — Stable (`stable-*`) | 222 | **305** |
| — Pre-release (`pre-*`) | 115 | **127** |
| — Checkpoint (`checkpoint-*` dash-form) | 2 | **5** |
| — Other (`checkpoint/...` slash-form + `before-next-feature`) | 1 | **17** |
| Commits on `production` | 788 | **1122** |
| Backend modules | 36 | **40** |
| Frontend pages | ~49 | **56** |
| Prisma models | 49 | **52** |
| Prisma migrations | 37 | **39** |
| Release window | 2026-06-07 → 2026-07-01 | **2026-06-07 → 2026-07-16** |

> The "222/222 stable tags are all ancestors of production" integrity claim from the 2026-07-01 pass was **not
> re-verified** in this refresh (it requires walking all 305 current stable tags against `production`, out of
> scope for a quantitative-tables-only refresh) — do not cite that specific 100% figure as current. Re-verify
> it the next time this file gets a full re-audit rather than a table-only refresh like this one.

### Latest Release — `stable-employee-compensation-configurable-overtime-rate-v1` (`310fcaa7`, 2026-08-16)

**Employee Compensation — Configurable Company Overtime Rate Pack v1** — lets
Employee Compensation choose the company overtime hourly rate from the system
instead of it being fixed in code, while the Kuwait Labour Law engine stays
the single source of legal minimums, on
`feature/employee-compensation-configurable-overtime-rate-v1`. Feature commit
`4ec8803b` · merge `310fcaa7` · checkpoint tag
`checkpoint-employee-compensation-configurable-overtime-rate-v1` (on
production HEAD `33d582db`, pre-merge) · stable tag
`stable-employee-compensation-configurable-overtime-rate-v1` (`310fcaa7`).
27 files (22 modified, 5 new).

- **Two concepts, kept structurally separate.** `legal/kuwaitLabourLaw.ts`
  remains the sole source of legal multipliers (Art. 66/67/68 ×1.25/×1.50/×2.00,
  `LEGAL_RULES_VERSION = KW-LL-6/2010-v2`) and is untouched by this pack. A
  new `policy/companyOvertimePolicy.ts` derives per-type company rates
  (`REGULAR` ×1.00 · `WEEKLY_REST` ×1.50 · `OFFICIAL_HOLIDAY` ×2.00) from one
  administrative base rate, versioned independently as
  `COMPANY_OVERTIME_POLICY_VERSION = MANAR-COP-v1`. A dedicated isolation test
  asserts the law file contains no reference to the company concept and the
  policy file never redefines the legal multiplier or version.
- **Statutory floor protection is structural.**
  `engine/effectiveOvertimeRate.ts` is the single point that resolves
  `effectiveRate = max(statutoryMinimumRate, companyDerivedRate)` for every
  overtime type; no other code path can produce a lower rate. Swept across 30
  rate/type combinations by test. A below-floor company choice is accepted,
  floored, and surfaced as an explicit `COMPANY_OVERTIME_RATE_BELOW_STATUTORY`
  warning naming both figures — never a silent cut, never a rejected request.
- **Two levels of rate, one storage mechanism.** The company-wide **default**
  lives in the existing `Setting` table (key
  `employeeCompensation.companyOvertimeBaseRate`, group
  `employeeCompensation`) — no new settings table or mechanism — editable
  from a compact dialog shared by the module's employee list header and the
  month editor, with 3.000/4.000/5.000 د.ك quick presets alongside free entry.
  A per-**month override** is editable even after approval, matching every
  other field in this module (approval is an organisational status here, not
  a lock). Changing the default issues **zero** writes to any saved
  calculation — proven by test on the mocked Prisma client and live by
  inspecting `prisma.employeeCompensationCalculation.update` call counts.
- **Historical snapshot protection.** Each calculation snapshots
  `companyOvertimeBaseRateSnapshot` + `companyOvertimePolicyVersion` at save
  time; every overtime line snapshots `statutoryMinimumRate`,
  `companyBaseRate`, `companyDerivedRate`, `effectiveRate`, and `rateSource`.
  Additive migration `20260816120000_add_company_overtime_rate` adds these
  seven columns as nullable only (hand-written to avoid an unrelated
  `RedefineTables` rebuild of unrelated banking tables, the same approach the
  module's two prior migrations took). `NULL` means "saved before this pack"
  and is computed with the exact pre-pack formula
  (`hours × hourlyRate × multiplier`, one final rounding) byte-for-byte —
  proven live against a seeded pre-pack calculation (100 h × 2.163 × 1.25 =
  270.375 unchanged after re-save), not merely asserted by unit test.
- **Reverse overtime and copy-previous stay correct under the new rate.**
  Reverse overtime derives hours from the *effective* rate of the selected
  overtime type, so the amount it promises is the amount that gets stored —
  verified per type (REGULAR/WEEKLY_REST/OFFICIAL_HOLIDAY resolve to distinct
  divisors from the same base rate) and against the statutory floor.
  Copying a previous month follows the *current* default, not the copied
  month's snapshot — a deliberate choice since the rate is a live
  administrative decision, not a template field — and the response reports
  the difference explicitly when the two disagree, surfaced to the user.
- **Printing stays split exactly as before.** The short official statement
  exposes no rate, source, or policy version — verified both by the backend
  never sending those fields and by a new source-scanning frontend test
  asserting the template and the `StatementData` type itself carry none of
  them. The internal detailed report shows the statutory minimum, the
  company-derived rate, and the effective rate side by side for every
  overtime line, with the winning source labelled and both version fields
  (legal, company policy) shown separately.
- **Isolation unchanged.** No Payroll/Accounting/GL/Expense write and no
  Employee mutation — the module's pre-existing source-scanning isolation
  test now also requires every `prisma.setting` access to route through the
  new centralized `COMPANY_OVERTIME_RATE_SETTING_KEY` constant, so no future
  code path can read or write an unrelated settings key from inside this
  module.

Live verification: run end-to-end against an isolated database/backend copy
(port 48299, scratch SQLite file seeded from a snapshot of `manar.db`, a
throwaway test employee and credentials) — set default 4.000 → create a
month with no explicit rate (inherits 4.000) → change default to 5.000 →
confirm the existing month unchanged → create a new month (inherits 5.000)
→ override that month to 3.500 → approve it → edit the rate of the approved
month to 6.000 with recalculation → copy it into the next month (starts from
the *current* default 5.000, not the 6.000 snapshot) → statutory floor check
on a high salary with a 1.000 company rate → reject invalid rates (0, −1,
4000). Every check passed. Post-test, `payrollLines`/`payrollAdvances`/
`deductions`/`bonuses`/`employeeAllowances`/`journalEntries`/`transactions`/
`expenses`/`cheques` all counted 0 and the test employee's salary was
unchanged, confirming isolation on live data rather than mocks alone. The
isolated database copy and its backend instance were both discarded after
the run; the shared development database was never targeted by test traffic.

Validation: Backend `tsc --noEmit` ✅ · Frontend `tsc --noEmit` ✅ · Electron
`tsc --noEmit` ✅ · `prisma validate` ✅ · `migrate status` 62/62 applied ✅ ·
Backend 3129 tests ✅ (36 new) · Frontend 3952 tests ✅ · production builds
(`build:back`, `build:front`) ✅. Re-verified post-merge on `production`:
`tsc --noEmit` ×3, `prisma validate`/`migrate status`, and the module's own
178 backend + 37 frontend tests, all green. Application version stays
`2026.5.1` — backend/frontend feature pack, no installer rebuild. Product
Owner manual visual review: **completed** and explicitly approved prior to
release authorization.

### Previous Release — `stable-production-release-2026.5.1` (`e8fea376`, 2026-08-15)

**Production Release 2026.5.1** — packages a new self-contained Windows
installer including everything merged onto `production` since the
2026.5.0 installer, on `feature/production-release-2026.5.1`. Feature
commit `478cedf` · merge `e8fea376` · checkpoint tag
`checkpoint-production-release-2026.5.1` (`62dd982d`) · stable tag
`stable-production-release-2026.5.1` (`e8fea376`). 1 file changed
(`package.json` version bump only).

Bundles four packs, each already merged, tagged, and documented
individually:

- **Employee Entitlements Bilingual One-Page Statement Pack v1** —
  presentation-only bilingual statement rebuild, no schema/permission
  change.
- **Monthly Entitlements Bank Statement Pack v1** — second bank
  transfer statement, additive migration
  `20260814120000_add_entitlements_bank_statement`, two new tables,
  zero existing table/column altered.
- **Employee Entitlements Leave Management Pack v1** — wires the
  pre-existing Leave CRUD backend into the entitlements page,
  print-leave-form shortcut, `reason`/`expectedReturnDate` capture
  (additive migration `20260815090000_add_leave_expected_return_date`),
  and legally-correct `asOf`-clipped annual-leave balance consumption.
- **Privacy Toggle Tier A v1** — makes `MoneyText`/`MoneyCell`
  privacy-aware, closing the top-bar lock button's coverage gap on
  ~60 call sites, presentation-only.

Validation before packaging: Backend/Frontend/Electron
`tsc --noEmit` ✅ · `prisma validate` ✅ · `prisma migrate status`
61/61 applied ✅ · Backend 196 files/3087 tests ✅ (2 intentionally
skipped leftover diagnostic stubs, pre-existing) · Frontend 215
files/3943 tests ✅ · Electron 26 files/499 tests ✅. The merged tree
is byte-identical to the reviewed branch tree (`git diff
feature..production` empty).

Packaging verification: `app.asar` (`npx asar list`) and
`extraResources` (filesystem walk) inspected directly for leaked
dev/test/source-map/`.env`/secret files — none found, matching
`electron-builder.yml`'s declared exclusion filters exactly. 61
Prisma migrations present; `electron-dist/main.js`, `preload.js`,
`frontend/dist/index.html`, and all bundled fonts/assets confirmed
present.

Golden Database: SHA-256
`da769b8c70f372c0ab56cc2d5670e3316f27af6781c48bbd65074005b7bfdf24`,
3,358,720 bytes, 61 applied migrations — verified byte-identical in
three places: source `backend/data/manar.db` (computed before
packaging) · `release/win-unpacked/resources/backend/data/manar.db` ·
extracted directly from inside `AlManarERP-Setup-2026.5.1.exe` via
`7za` (`node_modules/7zip-bin`). `seed-data/golden-manifest.json`
records the identical hash, size, and packaging timestamp.

Installer: `AlManarERP-Setup-2026.5.1.exe` — 138,282,665 bytes
(131.87 MiB), SHA-256
`e95021e4735572f9bb493c7b87e09d7edbd9a94bea481eb55a40e0ab5d831931`,
Windows 10/11 x64, per-user install, zero external runtime
prerequisites (`runtime-requirements.json` reports none).

GUI/install-flow verification: not driven interactively — no desktop
session available in this environment. Covered by the Product
Owner's completed manual visual and functional review of the
underlying feature packs, confirmed prior to this release
authorization.

### Previous Release — `stable-privacy-toggle-tier-a-v1` (`7cb1c738`, 2026-08-15)

**Privacy Toggle Tier A v1** — audit + fix of the top-bar lock button's
"hide/show financial numbers" feature, on
`feature/privacy-toggle-tier-a-v1`. Feature commit `4d774537` · merge
`7cb1c738` · checkpoint tag `checkpoint-privacy-toggle-tier-a-v1`
(`d875be34`) · stable tag `stable-privacy-toggle-tier-a-v1`
(`7cb1c738`). 4 files (2 modified, 2 new).

- **Root cause.** The lock button was never the bug: `togglePrivacy()`
  in `uiStore.ts` is a plain boolean flip with no stale closures, no
  memoization, and no `localStorage` desync, called directly by the
  button on every click. Tracing Top Bar → `uiStore.privacyMode` →
  `usePrivacyMode()` → money-display consumers found the real defect
  was coverage: `privacyMode` was read in only 3 files (`Layout.tsx`,
  `uiStore.ts`, `PrivateAmount.tsx`) out of roughly 90 files that
  display financial numbers across the app. The rest went through
  separate helpers — `money()`, `moneyParts()`, `MoneyText`,
  `MoneyCell`, `fcCurrency()`, chart tooltip/axis formatters, print
  templates — that never consulted the privacy store, so real amounts
  stayed on screen regardless of the lock's state. This explains the
  "the button does nothing" symptom on most screens.
- **Fix — `MoneyText`/`MoneyCell` made privacy-aware.** Both
  components in `config/modules.tsx` now call `usePrivacyMode()` and
  render through the same `pm-mask`/`pm-real` dual-span pattern
  `PrivateAmount` already used, reusing its newly-exported
  `buildLevel1Mask()` instead of duplicating the masking algorithm —
  one shared mechanism, no parallel system. Fixes every existing
  `<MoneyText>`/`<MoneyCell>` call site (~60, across Accounting,
  Invoices, Salaries, FinancialCenter, BankAccountExplorer, Expenses,
  Inventory, Maintenance, Prices, and the Collection Analysis tables)
  with **zero call-site changes**.
- **Print output unaffected.** `pm-real` is forced visible under
  `@media print` regardless of the on-screen mask state, via the
  pre-existing `privacy.css` contract — financial documents print with
  real values exactly as before.
- **Edge case.** `MoneyCell`'s not-applicable `—` placeholder is not a
  financial figure and is never masked.
- **Deferred by design — Tier B.** The audit found the mechanism still
  bypassed by: `money()`/`moneyParts()`/`fcCurrency()`/`fcMoneyCell()`
  calls built outside JSX (KPI-array construction, pre-built message
  strings); Recharts tooltip/axis formatters in `RevenueChart`,
  `PerformanceChartSection`, `KPITimeline`, `AgingChart`,
  `BankSalaryAnalytics`; on-screen print-preview renders in
  `InvoicePreview`, `PayrollPayslip`, `forms/*`, and
  `print-templates/*` (the printed output itself is correctly always
  real; only the pre-print on-screen preview is unmasked); the AI
  panel's `ai/ResultCard.tsx`; and an unrelated same-named `MoneyCell`
  in `components/financialAnalysis/AnalysisTable.tsx`. Each builds a
  plain string outside a component's render subscription, so each
  needs its own call-site edit rather than a single shared-component
  fix — deferred to keep this release small and reviewable instead of
  a ~90-file sweep in one pass. Documented explicitly as out of scope,
  not a regression.

Tests added: `privacyMoneyComponents.test.tsx` (`PrivateAmount`/
`MoneyText`/`MoneyCell` — default masked, immediate unmask on store
toggle with no remount, repeated Hide→Show→Hide cycling, multiple
amounts on one screen sharing one toggle, the `—` edge case never
masked) and `privacyToggleLayout.test.tsx` (the lock button itself
inside the real `Layout` — default locked state, exactly one button
rendered, click toggles immediately with no refresh, a 4-click
Hide→Show→Hide→Show sequence, and state/rendering surviving a real
sidebar navigation between two pages).

Validation: `tsc --noEmit` ✅ · production build (`npm run build`) ✅ ·
Frontend 215 files/**3943/3943** tests ✅ (3930 pre-existing + 13 new).
The merged tree is byte-identical to the reviewed branch tree (`git
diff feature..production` empty), so these pre-merge results carry to
`production` verbatim; a post-merge `tsc --noEmit` re-check on
`production` also passed. Application version stays `2026.5.0` —
presentation-only frontend change, no installer rebuild. Product Owner
manual visual review: **completed** and explicitly approved prior to
release authorization.

### Previous Release — `stable-employee-entitlements-leave-management-ui-v1` (`90868cb1`, 2026-08-15)

**Employee Entitlements Leave Management Pack v1** — bundles four packs
built together on `feature/employee-entitlements-leave-management-ui-v1`.
Feature commit `8bb089b` · merge `90868cb1` · checkpoint tag
`checkpoint-employee-entitlements-leave-management-ui-v1` (`cdca4263`) ·
stable tag `stable-employee-entitlements-leave-management-ui-v1`
(`90868cb1`). 16 files (11 modified, 5 new).

- **Leave management UI.** An audit of the Leave CRUD backend found it
  complete, guarded, and audited (`POST /employees/leaves`,
  `PATCH .../approve`, `PATCH .../reject`) — but with **zero frontend
  callers**, so the `leaves` table could only ever be populated
  out-of-band. `EmployeeEntitlementsCenter`'s leave-history section now
  has an «إضافة إجازة» dialog and per-row اعتماد/رفض actions on
  `PENDING` rows, calling the existing endpoints unchanged. No new
  permission key — reuses `employees.create` / `employees.update`,
  matching the guards the backend already enforced.
- **Print leave form shortcut.** An «طباعة نموذج الإجازة» action on
  `APPROVED` rows opens the existing `LeaveRequest` print form via
  route `state`, prefilled from the **selected** leave record — not
  the server's `latestLeave` — so an older approved leave prints
  correctly even when a newer one exists. No new print template, no
  PDF/print-engine change; the shortcut writes nothing to the
  database, and edits made on the print page never write back to the
  `Leave` record.
- **Full leave request data capture.** Inventory of every field the
  existing print form fills manually found `reason` already on `Leave`
  and already accepted by `leaveSchema` with no UI ever collecting it;
  only `expectedReturnDate` needed a schema change. One additive
  nullable column, migration
  `20260815090000_add_leave_expected_return_date` — pure SQLite
  metadata `ALTER TABLE ADD COLUMN`, no rebuild. Both fields are
  captured at creation and returned to the print-form prefill, so a
  request can be reprinted with its original data at any later time.
- **Legal leave balance & payments reconciliation.** Corrects a defect
  introduced by this same branch's own prior "decouple leave history"
  pack, which had removed leave-balance consumption entirely instead
  of fixing the actual bug: an approved leave was deducted from the
  balance **in full on approval**, even for days that had not
  happened yet — an approved 92-day future leave could zero the leave
  allowance before the employee took a single day off. New pure
  `clipLeaveIntervalToAsOf()` in `entitlements.calc.ts` clips every
  approved `ANNUAL` leave to the portion **elapsed as of the
  calculation date** before it is counted; a leave that has not
  started yet contributes zero days. Official holidays and approved
  `SICK` leave falling inside an annual leave remain excluded per
  Labour Law 6/2010 Art. 70 — the same rule, now correctly applied to
  the clipped interval. New `overusedLeaveDays` on `EntitlementResult`
  so a balance floored at zero by over-consumption is explicitly named
  instead of being indistinguishable from exact consumption — never
  converted to a negative monetary amount, since the system has no
  leave-debt concept. The redesigned "تفاصيل رصيد الإجازة" section
  shows accrued / used / remaining / overused days alongside daily
  wage / gross value / paid / net remaining, sourced from the same
  `EmployeeEntitlementLedger` the payment flow already used
  (`entryType: 'LEAVE_ALLOWANCE'` only — an `END_OF_SERVICE` payment
  does not reduce the leave value). **Final Settlement is unaffected
  in code**: `finalSettlement.service.ts` consumes the same canonical
  `computeAt()` engine, so it automatically reflects the corrected
  balance with no formula duplicated. **Documented gap, not
  invented**: weekly rest days are **not** excluded from consumption —
  the system has no weekly-rest/work-pattern data source, and none was
  fabricated for this pack.

Validation: Backend/Frontend `tsc --noEmit` ✅ · `build:back` /
`build:front` ✅ · `prisma validate` ✅ · `migrate status` (61/61
applied) ✅ · Final Settlement's 51 tests re-verified directly on
`production` post-merge (unaffected) ✅. The merged tree is
byte-identical to the reviewed branch tree (`git diff feature..production`
empty), so pre-merge test results (backend entitlements+employees
273/274 with one intentionally-skipped leftover diagnostic stub;
frontend leave-related suites 169/169) carry to `production` verbatim.
Application version stays `2026.5.0` — additive migration only, no
installer rebuild. Product Owner manual visual **and functional**
review: **completed** and explicitly approved prior to release
authorization.

### Previous Release — `stable-monthly-entitlements-bank-statement-v1` (`3b8e968d`, 2026-08-14)

**Monthly Entitlements Bank Statement Pack v1** — a second, fully
independent bank transfer statement («كشف المستحقات الشهرية» / Monthly
Entitlements), alongside the existing Salary Bank Statement, on a new tab
in the Salaries page. Feature commit `af932e62` · merge `3b8e968d` ·
checkpoint tag `checkpoint-monthly-entitlements-bank-statement-v1`
(`2fb42ac4`) · stable tag `stable-monthly-entitlements-bank-statement-v1`
(`3b8e968d`). 21 files (5 modified, 16 new).

- **The only new financial rule:**
  `bankEntitlementAmount = roundMoney(netAmount − basicSalarySnapshot)`,
  both operands read from the same APPROVED
  `EmployeeCompensationCalculation` row for the selected year/month —
  never the live `Employee.salary`, never a recomputed overtime/bonus/
  deduction. No other formula exists anywhere in this pack.
- **Server-enforced eligibility, not UI-only:** an employee is exportable
  only with an APPROVED calculation for the exact period, bank fields
  passing the same validator the salary statement uses, and a positive
  transfer amount. Every ineligible employee stays visible with an
  explicit reason (`NO_CALCULATION` / `NOT_APPROVED` / `NO_AMOUNT` /
  `BANK_DATA_INCOMPLETE`) instead of being silently hidden.
- **Shared bank-export engine:** the NBK workbook builder — sheets,
  headers, column order/widths, the Bank Codes reference list, numeric
  cell types, English-name-only/civil-id/account validation, KWD
  3-decimal rounding — was extracted verbatim from
  `payrollBankExport/profiles/nbkSalaryXlsProfile.ts` into a new
  `shared/services/bankExport/` engine (`nbkTransferCore.ts` +
  `types.ts`). Both statements now call the same
  `buildNbkTransferResult()`; byte-for-byte identical output between the
  two profiles is asserted by test. They are told apart only by file
  name — `NBK_Entitlements_<year>_<MM>.xls` vs
  `NBK_Salary_<year>_<MM>.xls` — the sheet name stays `Salary Details` in
  both because that is the bank template's own required sheet name.
- **Approval / snapshot lifecycle:** approving writes a full frozen
  snapshot per employee (net amount, basic salary, transfer amount,
  English name, civil ID, bank account, source `calculationId`) into two
  new additive tables. The bank file is built only from that snapshot —
  proven by test: editing the source calculation after approval (net
  350→900) leaves the already-approved file reporting 200.000,
  unchanged. `@@unique([year, month])` allows exactly one approved
  statement per month; the only way to change one is an explicit,
  audited unapprove, which deletes the snapshot. No foreign keys to
  `Employee` or the calculation by design — an approved statement is a
  historical document that must survive deletion of either.
- **Isolation:** the module writes to exactly two tables —
  `entitlements_bank_statements` / `entitlements_bank_statement_lines` —
  plus `AuditLog`. Every read/approve/unapprove/export path is tested to
  spy on Payroll/SalaryPayment/EmployeeCompensation/GL/Expense writes and
  assert none occurs. The pre-existing Salary Bank Statement's 23 tests
  pass unchanged, re-run directly on `production` post-merge as a
  targeted regression check.
- **No new permission key:** read/preview/export gate on the existing
  `employeeCompensation.read`; approve/unapprove gate on the existing
  `employeeCompensation.approve` — reusing the same reasoning the
  original salary export used for `payroll.read`.
- **UI:** new tab reusing `ExplorerKit`/`.pbx-*` conventions, plus a UI
  Polish Pack scoped to new `.ebx-*` classes (compressed vertical
  spacing, one-line description with tooltip detail, fixed-width filter
  row, compact approval alert, approve-first/export-second action
  ordering, LTR-isolated money via `MoneyText`/`MoneyCell` with the
  currency in the column header, compact state column). Per-row and
  select-all checkboxes with `indeterminate` state select only READY
  employees; approval and export act on the selection, not the full
  month; selection clears on period change and on a failed reload. No
  existing rule or other Salaries tab was modified.
- **Prisma / migration:** two new additive tables only — migration
  `20260814120000_add_entitlements_bank_statement`. Zero existing table,
  column, or index altered. `prisma validate` ✅; `migrate status`
  reports all 60 migrations applied, schema up to date.
- **Known non-blocking item:** `npx prisma generate` fails on the dev
  machine with `EPERM` renaming the query-engine binary — some process
  holds a lock on the file (not force-killed, to avoid disrupting
  unrelated sessions). Verified non-blocking: the client's JS/DMMF layer
  regenerated correctly (confirmed via direct `require` —
  `prisma.entitlementsBankStatement.findMany`/`.count()` both execute
  against the live dev database), and the engine binary is unchanged
  since the last successful generate (no Prisma version bump).

Application version stays `2026.5.0` — additive migration only, no
installer rebuild. Validation: Backend/Frontend `tsc --noEmit` ✅ ·
`build:back` / `build:front` ✅ · `prisma validate` ✅ · `migrate status`
(60/60) ✅ · Backend 196 files/3059 tests ✅ · Frontend 211 files/3875
tests ✅. The merged tree is byte-identical to the reviewed branch tree
(`git diff feature..production` empty). Product Owner manual visual
review: **completed** and explicitly approved prior to release
authorization.

### Previous Release — `stable-docs-master-status-backfill-v1` (`692644c2`, 2026-08-14)

**Docs Backfill Pack v1** — backfills the three release narratives that had
been missing from this file's own release-history section: Production Release
2026.5.0, Production Release 2026.4.0, and Employee Compensation v1 (see the
three "Previous Release" entries immediately below). 1 file changed
(`PROJECT_MASTER_STATUS.md` only). No code, Prisma, schema, migration,
permission-key, or test file touched.

- Every added fact was sourced only from `PROJECT_STATE.md` and
  `AI_CONTEXT.md` — nothing invented, nothing reinterpreted.
- Entries match this section's existing style (bold lead-in paragraph with
  scope/file-count, bulleted facts, closing validation line) and existing
  separator convention (no rule between "Latest Release" and the first
  "Previous Release", `---` between subsequent entries).
- The temporary "Narrative backlog" note that the previous release's
  documentation commit had left to flag the gap is removed now that the gap is
  closed.

Docs-only pack: build and test suites were not re-run, since none of their
inputs changed. The merged tree is byte-identical to the reviewed branch tree.
Product Owner review **completed** and explicitly approved prior to release
authorization.

---
### Previous Release — `stable-employee-entitlements-bilingual-one-page-v1` (`274eff82`, 2026-08-14)

**Employee Entitlements Bilingual One-Page Statement Pack v1** — renames the
monthly employee entitlements module to «مستحقات الموظف الشهرية» / «Monthly
Employee Entitlements» and rebuilds its official statement as a single bilingual
A4 page. 14 files (11 modified, 3 new); backend + frontend. No schema, migration,
permission-key, route or Electron change. Released after the Product Owner's
manual visual review was completed and explicitly approved.

- **Bilingual, but never invented** — every label prints Arabic and English on one
  line, and so do the three values that have an English form. The English half of
  a value comes only from an approved source: the stored `Employee.fullNameEn`
  for the name, the approved translation table plus Settings overrides for the job
  title, and `MONTH_NAMES_EN` against the month already stored in the calculation
  record for the period. A new strict `lookupJobTitleEn` returns `null` where the
  long-standing `getJobTitleEn` falls back to the Arabic — that fallback is right
  for the English-only forms that depend on it, but on a bilingual line it would
  print «سائق شاحنة / سائق شاحنة» and pass Arabic off as a translation. With no
  approved source the Arabic prints alone, with no dangling separator.
  `statementBilingual.ts` derives all three once and feeds both the printed sheet
  and the QR, so the two cannot disagree.

- **The English-name trade-off, stated** — the historical snapshot has no English
  column, and adding one would mean a database migration for a printed line, so
  `getStatementData` performs one read-only `findUnique` on the employee record.
  The consequence is real and documented: correcting an employee's English name
  later changes a reprinted old statement's English half while the Arabic stays at
  its snapshot value. The pre-existing snapshot test was rewritten to prove the
  other six identity fields still come from the snapshot, and the module's
  source-scanning isolation test already forbids any write to `employee`.

- **One page, by layout not by clipping** — the statement-date row and both former
  approval blocks (`الإقرار والاستلام` in the template, `اعتماد المدير المباشر` in
  the `FormLayout` footer) give way to one horizontal `الاعتماد والاستلام /
  Approval & Receipt` section holding the employee receipt signature and the
  manager approval side by side. Padding, line height, section gaps and title size
  are tightened, and the compact styles are **local to this template** — the shared
  `formStyles` is untouched, so the other fourteen administrative forms are
  byte-identical. No `overflow`, no `transform: scale`, no clipping, no paper-size
  change. The 20mm downward offset uses `FormLayout`'s existing `contentTopOffset`,
  which renders inside the single `.form-page` node that accurate preview, Save PDF
  and print all clone; page padding is zeroed by `@media print` and a first-child
  `margin-top` collapses out of the parent once that padding is zero, so either
  alternative would have made the preview disagree with the sheet.

- **QR narrowed to three items** — employee name, net entitlement, period, and
  nothing else for this statement. The new optional `payloadLines` short-circuits
  `formatQrText` **before** the default lines are built, so neither a current nor a
  future `QRData` field can leak into a QR whose content was specified. It is
  absent on every other form, whose encoded text is byte-identical and guarded by
  test. The printed reference beneath the code remains the document number, which
  was never part of the payload.

- **A theme-CSS leak, found and contained** — `app/theme.css` carries unscoped
  `tbody tr:nth-child(even) td` and `tbody tr:hover td` background rules that reach
  every table in the application, printed documents included. They had been shading
  some statement line items but never the totals rows, which already carry an
  inline background that outranks a stylesheet — which is exactly why the shading
  looked like a property of those particular rows. Corrected with an explicit
  inline background on this template's item cell; `theme.css` and every other table
  in the system are untouched.

- **Validation** — backend and frontend `tsc --noEmit`, `prisma validate`,
  `build:back`, `build:front`, backend 3022/3022, frontend 3866/3866. The merged
  tree is byte-identical to the reviewed branch tree, so these results carry to
  `production` verbatim. 28 new frontend contract tests and 3 new backend tests
  guard the rename, the bilingual sources, the refusal to invent a translation, the
  two-column table, both removed sections, the new section's horizontal container,
  the three-line QR and its non-leakage, and other documents' QR immutability.

### Previous Release — `stable-production-release-2026.5.0` (`6ae6536b`, 2026-08-14)

**Production Release 2026.5.0** — releases three units together: a **Full Project
Engineering Audit** (six specialist review agents run in parallel over the whole
repository — backend core/security · business modules · React frontend ·
Electron/IPC security · build/packaging/Prisma schema · dead code & hygiene, every
finding re-verified against the actual source before any fix), the **Prisma
Schema & Migration Reconciliation Pack v1**, and the **Invoice Items Foreign Key
Reconciliation Pack v1**. Version `2026.4.0` → `2026.5.0`, new installer build.
24 files (23 modified, 1 new migration). Feature branch
`audit/full-project-audit-2026-08-13`, checkpoint tag
`checkpoint-production-release-2026.5.0` (`017f95e9`), feature commit `bf30f7d4`.
The packs named in the original release request — Google Drive Data Safety Pack
v2, Test Isolation Pack v1, Golden Database / Golden Manifest, Production
Resource Integrity Fix, View Zoom Manual Save — were verified against Git
history to already be released (inside `stable-production-release-2026.4.0` or
earlier, each with its own tag); this release carries only the three units
above, the sole unreleased approved work on the branch.

- **RBAC-01 (CRITICAL)** — a demoted `SYSTEM_ADMIN` retained full privileges for
  up to 12 h: `authenticate` set `req.user` from the raw JWT payload and
  refreshed only `req.permissions` from the database, while
  `requirePermission`/`requireRole` short-circuit on
  `req.user.roleName === SYSTEM_ADMIN` — baked into the token at login and never
  re-derived — and `PATCH /api/users/:id` invalidates no session anywhere, so the
  bypass outlived the demotion until token expiry. Fixed by overwriting
  `roleId`/`roleName` from the live DB row on every request, at zero extra query
  cost (the row was already fetched).
- **RACE-01** — stale list responses overwrote fresher ones across
  `ResourcePage.load` (every generic CRUD module), three `Salaries` loaders and
  three `Accounting` tab loaders; the `reqIdRef` guard already proven in
  `Invoices.tsx` is now applied to all seven.
- **Other audit fixes** — **A11Y-01** keyboard-reachable topbar logout ·
  **SEC-01** rate limit on the public `GET /api/verify/:uuid` · **SEC-02**
  `crypto.timingSafeEqual` on the internal backup secret · **MONEY-01** KWD
  rounding (`roundMoney`/`sumMoney`) in the salaries summary · **MSG-01** a
  payroll message claiming a journal posting that never happens · **HYGIENE**
  `vitest` declared at the workspace root, unused `cross-env` removed,
  `CLAUDE.md`'s PDF-engine entries corrected.
- **TEST-01** — 26 frontend tests across 8 files had been failing on
  `production` itself, proven pre-existing by running them against the stashed
  tree; all three root causes were tests lagging behind the code (i18n-key
  migration, a stale `useUI` mock, two files needing the jsdom environment). No
  production source changed; frontend is now 3837/3837, retiring a baseline
  carried across two releases.
- **Prisma reconciliation** — official tooling only (`migrate status`,
  `validate`, `migrate diff` in three directions, `db pull`) proved
  `schema.prisma`, not the database, was the drifted side: two `updatedAt`
  columns a hand-written migration had created with `DEFAULT CURRENT_TIMESTAMP`
  regained `@default(now())`, with zero database change.
- **Invoice Items FK** — `schema.prisma` had declared
  `price ProjectPrice? @relation(..., onDelete: Restrict)` since the relation
  was added, but the migration that added the column used
  `ALTER TABLE ADD COLUMN`, which SQLite cannot use to attach a constraint — so
  the database enforced no referential integrity between invoice line items and
  price agreements. Migration `20260814010000_add_invoice_items_price_fk`,
  generated verbatim by `migrate diff --script`, adds
  `invoice_items.priceId → project_prices.id ON DELETE RESTRICT ON UPDATE CASCADE`,
  verified with a SHA-256-checked backup beforehand and an unchanged
  row-content SHA-256 afterwards, with the constraint proven enforced at
  runtime. `migrate diff --from-migrations --to-schema-datamodel` now reports an
  empty migration.

Validation: backend/frontend/Electron `tsc --noEmit` ✅ · `build:back` /
`build:front` / `electron:build` / `npm run dist` ✅ · backend 193 files/3018
tests ✅ · frontend 209 files/3837 tests ✅ · Electron 26 files/499 tests ✅ ·
Prisma `validate` ✅ · `migrate status` clean (59 migrations) ✅. Product Owner
manual visual review **completed** and explicitly confirmed prior to release
authorization.

---
### Previous Release — `stable-production-release-2026.4.0` (`f8f7a581`, 2026-08-13)

**Production Release 2026.4.0** — packages **Google Drive Data Safety Pack v2**
and **Test Isolation Pack v1** into a new self-contained Windows installer.
Feature branch `feature/gdrive-data-safety-pack-v2`. Version `2026.3.2` →
`2026.4.0`. 27 files (19 modified, 8 new); Electron main process + backend +
frontend + build pipeline. No Prisma/schema/migration change, no new permission
key, no UI layout change.

- **F-01** — «رفع الآن» (manual upload) bypassed the decision engine entirely,
  calling `uploadInternal` directly with no `decide()` call and an
  optimistic-concurrency guard conditional on `expectedRemote !== undefined`, so
  it could silently overwrite a newer cloud copy with no conflict dialog. Now
  decision-driven, and `expectedRemote` became a REQUIRED field of
  `UploadOptions`, turning the bypass into a compile error.
- **F-02** — `withTimeout` used `Promise.race`, which never cancels the losing
  promise, so a timeout stopped the *waiting* but not the *work* — releasing the
  sync mutex and runtime lock while an operation was still running. Replaced by
  `withDeadline`, which awaits real settlement and threads a merged
  `AbortSignal` into every Drive call.
- **F-03** — the decision engine's rule (4) downloaded over a pristine seed with
  no recency comparison, which was correct for an empty template but wrong for a
  Golden Database carrying the latest production snapshot — replacing it with an
  older cloud copy. `prepare-seed-data.js` now emits a `golden-manifest.json`
  (sha256 · sizeBytes · `dataModifiedAt`) that the rule consults, yielding
  CONFLICT instead of an automatic DOWNLOAD when it matches.
- **F-04** — the installer shipped `sync-metadata.json` and
  `gdrive-account.json` from the *build machine*, granting a new device a sync
  history it never earned and leaking the developer's Google account address.
  State-file seeding is removed entirely.
- **F-05** — restore left sync state untouched, so the next decision saw «local
  changed, remote unchanged» and uploaded a weeks-old restored database over the
  current cloud copy with no dialog. Both restore paths now write
  `sync-pending-review.json`, blocking both automatic directions until an
  explicit user operation clears it.
- **Test Isolation Pack v1** — `backup.verify.test.ts` had been executing
  INSERT + DELETE against the developer's own database through the real Prisma
  singleton; `vitest.setup.ts` now redirects `DATABASE_URL`/`BACKUP_DIR`/
  `ATTACHMENTS_DIR`/`DATA_DIR` to a per-worker sandbox before any application
  module loads, and `vitest.globalSetup.ts` hashes the development database
  before and after the full run to fail loudly if anything still reaches it.
  Also fixed a stale `electronBuilderPackaging.test.ts` assertion pinned to the
  literal `2026.2.`, which had been failing since 2026.3.0.

Golden Database: `backend/data/manar.db`, 3,289,088 bytes, SHA-256
`6b35cf750eeeb170505344e761670bf6588ff1fdb22fa030707bde6df93c821a`,
`integrity_check = ok`, 61 applied migrations, 75 tables — verified
byte-identical in source, `win-unpacked/resources` and extracted from inside
`Setup.exe`. Installer `AlManarERP-Setup-2026.4.0.exe`, 138,240,953 bytes
(131.83 MiB), SHA-256
`83c298e3790b8df60b0632ed9f3db92a6e09ba1c5b0a1a09ad0fcf5f1de6b8c9`. Validation:
backend 193 files/3018 tests ✅ · Electron 26 files/499 tests ✅ (the
long-standing single failure resolved by the versioning fix) · frontend
3787/3813 with the pre-existing 26-test/8-file i18n baseline unchanged in count
and identity · TypeScript zero errors on all three surfaces. Product Owner
manual visual review **completed** prior to release authorization.

---
### Previous Release — `stable-employee-compensation-v1` (`cbe0734f`, 2026-08-12)

**Employee Compensation v1** — releases three interlocking packs as one unit:
Employee Monthly Compensation v1 · Legal/Accounting Validation + UI/UX
Corrective Pack · Employee Compensation Debt & Advances Ledger Pack v1. A new,
architecturally isolated module. Feature branch `feature/employee-compensation-v1`,
checkpoint tag `checkpoint-employee-compensation-v1` (`435ba6d0`), feature commit
`5561c2c3`. Two additive migrations
(`20260812120000_add_employee_monthly_compensation` — 4 tables;
`20260812180000_add_employee_compensation_debt_ledger` — 2 tables + one nullable
FK column), zero `DROP`, zero rebuild of any pre-existing table. New permission
key `employeeCompensation` (`read/create/update/delete/approve/print`), seeded
via `upsert` only — no existing grant removed.

- **Historical snapshot** — exactly one calculation per employee/year/month
  (unique constraint), with employee/salary data snapshotted once at creation so
  later edits to the employee record never alter a past statement.
- **Kuwait Labour Law overtime engine** — Art. 66 regular overtime (×1.25),
  Art. 67 weekly rest (×1.50 + compensatory day), Art. 68 official holiday
  (×2.00 + compensatory day). Hourly rate = basic ÷ 208 (26 × 8), the divisor
  imported from `DAILY_WAGE_DIVISOR` so it can never diverge from the project's
  documented daily-wage baseline. `LEGAL_RULES_VERSION = KW-LL-6/2010-v2`.
- **Limit handling** — the 180 h/year limit is genuinely verified against the
  database (`STATUTORY`); the 2 h/day, 3 days/week and 90 days/year limits are
  **disclosed as unverified** (`DISCLOSURE`, no daily timesheet exists) rather
  than silently implied, and a derived ~26 h monthly ceiling is labelled
  `DERIVED` and never blocks saving.
- **Reverse overtime** — turns a target amount into hours, rounding any
  part-hour up in the employee's favour, with no trace of the method on the
  signed statement. Approved records stay fully editable and deletable —
  approval is an organisational status, not a lock.
- **Debt & Advances Ledger** — stores no balance at all;
  `remaining = original − Σ(movements)` is always derived. Monthly repayments
  are keyed `(calculationId, debtId)` so editing a deduction updates the same
  movement instead of stacking a second one; deleting a month retracts its
  repayment and the balance rebounds; deleting a debt that carries movements is
  refused explicitly.
- **Isolation** — no Payroll/Accounting/GL/Expense writes and no Employee
  mutation, enforced by a source-scanning test that also forbids merely
  *reading* thirteen unrelated financial Prisma models. Measured before/after a
  live smoke test: `payroll_lines` 54, `transactions` 103, `journal_entries`
  460, `expenses` 240, `employees` 31 — all unchanged.

Validation: backend/frontend/Electron `tsc --noEmit` ✅ · `build:back` /
`build:front` ✅ · backend 3,006/3,006 across 192 files ✅ · frontend 3,787
passed with the known 26-failure baseline unchanged (zero new) ✅ · module
suites 132 backend + 96 frontend ✅. Release status: Claude Code self-verified
(typechecks ×3, full suites, both builds, live API smoke, browser UI smoke on
12 surfaces) — no separate Product Owner visual sign-off is recorded for this
release.

---
### Previous Release — `stable-view-zoom-persistence-pack-v1` (`e0467d62`, 2026-08-08)

**View Zoom Persistence Pack v1** — persists the last zoom level chosen from the
View menu's تكبير/تصغير items (Electron's built-in `zoomIn`/`zoomOut` roles,
unchanged — same accelerators, same labels) and restores it automatically on the
next launch. Chromium's `webContents.zoomLevel` lives in process memory only and
always resets to 0 (100%) on relaunch, so the app previously always reopened at
default zoom regardless of what the user had last set. 3 files (1 modified, 2
new); electron only. No schema change, no permission change, no route touched.

- **The mechanism** — `viewZoomPreference.pure.ts` (new, no `electron` import,
  runs directly under Vitest with no Electron runtime, matching the existing
  `.pure.ts` convention) reads/writes a small `view-zoom.json` file under the
  app's data directory, following the SAME local-JSON-under-dataDir convention
  already used for other main-process state (`device-identity.json`,
  `db-bootstrap-state.json`), written atomically via the existing
  `writeFileAtomicSync` — no new settings system, no backend call, no IPC
  channel, since a View-menu zoom action happens entirely in the main process
  before any renderer session or backend login necessarily exists. The saved
  level is clamped to Chromium's own safe zoom range (±8 zoom-level steps,
  roughly 25%–500%) so a corrupted preference file can never hand back an
  unusable value. `createZoomPersistenceController` debounces the disk write
  (400ms default) so holding Ctrl+= does not write on every keystroke, and
  exposes `flush()` — wired into the EXISTING `before-quit` handler — so a zoom
  change made just before quitting is never lost to the debounce window.
- **`main.ts`'s wiring** — a thin shim: the saved level is applied once, on the
  window's first `did-finish-load`, so a later manual «إعادة تحميل» (reload)
  keeps behaving exactly as before this pack — it is not treated as a relaunch.
  `zoom-changed` (fires only for the View menu's own actions, never for the
  restoring `setZoomLevel` call) schedules the save. No new keyboard shortcut,
  no new UI element, no new settings window, no change to any other behavior.

Verified with a real manual visual review on a live `npm run dev` Electron
window by the Product Owner — Claude has no tool capable of observing a native
window or clicking a native OS menu, so no visual claim was made without one:
zoom in/out from the View menu, full app close, relaunch, confirmed the same
zoom level restored automatically, confirmed no visual or functional side
effect elsewhere. Explicitly approved: **"اكتمل الفحص كل شي طبيعي وممتاز"**.

Validation: Electron `tsc --noEmit` clean · `electron:build` passes · Electron
+ scripts 473/473 (+29 new: clamp/read/save/debounce/flush tests, including a
relaunch simulation). Backend and frontend completely unaffected — no file in
either surface was read, modified, or created by this pack.

---
### Previous Release — `stable-cheque-template-persistence-legacy-recovery-pack-v1` (`91d3f987`, 2026-08-08)

**Cheque Template Persistence & Legacy Recovery Pack v1** — closes a confirmed
architectural defect traced by a forensic root-cause investigation into a real
reported bug (a lost cheque print calibration template): Cheque Designer
templates were the ONLY user-created data anywhere in the system stored outside
`manar.db`, in browser `localStorage` under `chequeDesigner.templates.v1`. Two
sub-packs shipped together, since the second is built entirely on the first's
schema/service and neither had reached production before this release. 24 files
(15 new, 9 modified); backend + frontend + electron. One new table, no new
permission key, no installer built (source-level release).

- **A. Cheque Template Persistence Migration Pack v1** — SQLite becomes the
  single source of truth. New `cheque_designer_templates` table (migration
  `20260808120000_add_cheque_designer_templates`): indexed id/name/default-flag/
  surface columns, the field layout as one Zod-validated JSON document with
  `.passthrough()` so a property this backend does not yet know about is never
  silently stripped — the exact failure mode the old unvalidated `localStorage`
  blob had. A full backend module on `/api/cheque-designer-templates` reuses the
  EXISTING `cheques.read`/`settings.update` permission keys, already gating the
  Cheque Studio overlay and Classic calibration — no new permission key.
  `chequeDesignerStore.ts` rewritten async/database-backed, preserving every
  prior semantic byte for byte (updatedAt-descending list order, first-template-
  becomes-default, delete-promotes-newest-survivor, and — critically — setting a
  default deliberately does NOT bump `updatedAt`, so the "Open" dialog's order
  never silently reorders). A one-time migration moves whatever remains in the
  CURRENT browser profile's `localStorage`, guarded by a durable `settings`
  marker plus an empty-database precondition RE-CHECKED server-side inside the
  importing transaction — no client retry can double-import or overwrite
  existing data.
- **B. Legacy Cheque Template Recovery Pack v1** — closes the remaining gap: a
  template created before `productName` was introduced lives in an entirely
  different Chromium partition (a PREVIOUS `userData` folder, usually a
  different page origin too) the ordinary migration can never see. A
  hand-written, dependency-free LevelDB reader (`legacyLevelDb.pure.ts` — raw
  Snappy decompression, SSTable/write-ahead-log parsing, Chromium's
  `_<origin>\0\1<key>` LocalStorage key encoding) was written from scratch
  rather than adding a native `classic-level`/`leveldown` dependency, which would
  need rebuilding against every Electron ABI and shipping in the installer.
  `legacyTemplateRecovery.ts` scans exactly three legacy `userData` folder names,
  each extracted from the project's OWN Git history: `manar-erp` (original
  `package.json` `"name"`), `نظام المنار` (`electron-builder.yml` `productName`
  before commit `0d88a50d`), and `Electron` (its own fallback folder, observed on
  a real machine) — deliberately origin-blind, since the origin changing is
  itself one of the two things that hid these templates. Strictly read-only (no
  LevelDB lock, no write, no delete — verified by a byte-for-byte before/after
  file comparison test); recovery is gated on FOUR server-checked preconditions
  (empty database, no prior recovery, no prior migration, a valid legacy store
  found), carries its OWN durable marker independent of the migration's, and
  lands atomically in one transaction. Any failure — missing bridge, corrupt
  store, unreachable backend — is logged and the app continues normally; nothing
  here can block startup or destroy data.

Verified against REAL data on the reporting machine, not only synthetic
fixtures: the production scanner module was run directly against
`%AppData%\manar-erp\Local Storage\leveldb` and recovered all 6 real stored
templates — including the correct default (`تجربه نسخةتحت`) — with every field,
coordinate, style property and original timestamp intact.

Validation: backend/frontend/Electron `tsc --noEmit` clean · `build:back`/
`build:front`/`electron:build` all pass · backend 2840/2840 (+50 new) · Electron
+ scripts 444/444 (+43 new) · frontend 3739/3765 — the same 26-failure/8-file
baseline documented at `f12adf90`, re-verified unrelated to this pack (none of
the 26 touches a file this pack added or modified). No installer built — this was
a source-level release, `npm run dist` not run. Product Owner manual visual
review **completed**.

---
### Previous Release — `stable-production-release-2026.2.0` (`f12adf90`, 2026-08-07)

**Al Manar ERP 2026.2.0** — the first production release whose deliverable is a
self-contained Windows installer rather than a branch. 40 files (23 modified,
12 added, 5 deleted), 3314 insertions / 552 deletions. No schema change, no new
permission key, no route touched.

Four packages that had been complete in the working tree but excluded from every
prior release (the previous release excluded them explicitly to protect its own
scope) shipped together:

- **Production Startup Pack v1** — a startup window created before any slow work,
  a staged progress bus, and startup failure that is shown rather than swallowed.
  In a packaged app `console.error` reaches no terminal, so the old handler meant
  a failed launch produced nothing at all — no window, no error, no trace. The
  window now becomes a failure surface carrying the exit code, stderr tail,
  `error.log` tail and log path, with a system dialog as last resort. Backend
  death during startup is terminal-and-immediate instead of waiting out the health
  timeout. `ATTACHMENTS_DIR` is now absolute — attachments had been written into
  the install directory while Electron read from `%AppData%`, so none ever opened.
- **Production Deployment Pack v1** — `appId` `kw.almanar.erp`, per-user install
  under `%AppData%` with no administrator rights, user data preserved on uninstall,
  and five packaging scripts. `analyze-runtime-deps.js` reads PE import tables of
  every shipped binary to derive real runtime requirements (this release: 10
  binaries, **zero** external prerequisites); `generate-nsis-prereqs.js` turns that
  into the installer's silent-install prerequisite block. Removed from the payload:
  30 orphaned Prisma engine temp files (≈537 MB) and a stale, dirty second database
  (`backend/prisma/data/manar.db`) that had been shipping inside the package.
- **Backend Startup Improvements** — `runPendingMigrations` had been launching the
  Prisma CLI on every production boot with no prior check; first launch after
  install exceeded 15 s, overran `waitForHealth`, and the app closed before any
  window existed. It now checks `_prisma_migrations` in one query and launches
  nothing when nothing is pending, keeping the fail-safe contract (pending ⇒
  deploy · undeterminable ⇒ deploy · failure ⇒ stop the service).
- **Form Editor UX Simplification v1** — product name «محرر النماذج» / "Form
  Editor"; the i18n key, template and `OL` prefix are permanent under INV-8/INV-10
  and deliberately unchanged.

Validation: backend/frontend/Electron `tsc --noEmit` clean · full `npm run dist`
green end to end producing `AlManarERP-Setup-2026.2.0.exe` (132 MB) · backend
2790/2790 · Electron + packaging scripts 401/401 · frontend unchanged at its
pre-existing 26-failure/8-file baseline, proven by re-running those eight files on
a clean worktree at the prior production HEAD `fbe898c5` and obtaining identical
counts. Product Owner visual review **pending** — delivered for review only.

---

### Previous Release — `stable-equipment-owner-default-price-v1` (`96a970a8`, 2026-08-02)

Price Agreements + Job & Commission Analysis (first release). 34 files
(11 modified, 23 added — 2 of the added files are test files), 3660
insertions / 11 deletions.

`ProjectPrice` gains a default `equipmentOwnerPrice` field beside the
existing customer `unitPrice`, surfaced in the Prices page (column,
drawer field, form input — unset renders "—", never "0.000") and in
`GET /prices/for-invoice`. The Job & Commission Analysis module — built
earlier in the same development effort, released here for the first
time since Equipment Owner Default Price has no meaning without it —
reads that default: selecting a price agreement line auto-fills both
Customer Price and Equipment Owner Price and immediately recomputes
commission per unit, customer/owner totals, commission total, and
margin %, via a pure calc library kept byte-fixture-identical between
frontend and backend. The owner price stays editable per-analysis only;
the analysis page issues no write call to `/prices` at all, so an
override can never propagate back to the agreement, and saved analyses
rehydrate from their own stored snapshot columns rather than re-querying
`/prices`, so editing an agreement afterward cannot change a historical
analysis. Two additive migrations (`work_analyses`/`work_analysis_lines`
creation; one `ALTER TABLE ADD COLUMN ... DEFAULT 0`) were applied via
`prisma migrate deploy`, hand-verified beforehand against Prisma's own
generated diff, with zero existing table/column/index touched. No new
API endpoints; `equipmentOwnerPrice` was grepped project-wide and
confirmed absent from every invoice/accounting/reports/transactions/
expenses module.

### Previous Release — `stable-collections-analysis-report-enhancement-pack-v1` (`9a4ae9b1`, 2026-08-02)

Comprehensive Reports module, Collections Summary Report. 6 files (4
modified, 2 added — 2 of the changed files are test files, one new one
updated), 1139 insertions / 67 deletions.

Adds executive KPI cards and eleven analytical sections (Customer × Month
Pivot Matrix, Monthly Analysis, Collections by Payment Method, Payment
Method Distribution, Collections by Customer, Top 20 Collections, Month
Comparison, Historical Analysis by invoice issue year, Collection Delay
buckets, Collection Efficiency, Percentage Analysis) to the Collections
Summary Report's preview, print, Excel, and HTML/PDF export — additive
only, nothing removed. Every figure is derived in-memory from the same
already-filtered `Payment` dataset the base report fetches, with four
extra scalar columns (`id`, `issueDate`, `total`, `paidAmount`) selected
on the invoice relation already being joined: zero new queries, and every
section's grand total equals the report's own total by construction (the
total is passed in, never recomputed independently). The historical
analysis classifies collected cash by the **invoice's issue year**, not
the payment date, so management can see how much of a period's cash
belongs to prior fiscal years. Percentages use largest-remainder
apportionment so they sum to exactly 100.0%.

**Shared analytical framework.** The month-axis/month-label/percentage-
apportionment helpers the Expense Analysis pack introduced were extracted
into a new `analysisKit.ts` — both the expense and collections analytics
modules now consume the same implementation instead of two copies that
could drift apart. `expenseAnalysis.ts` was refactored onto the shared kit
with zero behavioral change (its existing 16-test suite passes unmodified).

**No engine or frontend change.** The `kpis`/`sections` fields the Expense
Analysis pack added to the report engine's contract are reused completely
unchanged — `Reports.tsx`/`ReportPrint.tsx` already render whatever any
report sends generically, so this release touches zero frontend files.

Validation: backend + frontend `tsc --noEmit` clean on the feature branch
and post-merge; backend `vitest run` 157/157 files, 2281/2281 tests;
frontend 8/26 failures confirmed pre-existing (identical signature to the
prior release's documented baseline; this pack touches zero frontend
files). Excel export (13 worksheets) and HTML/PDF export generated from a
240-row synthetic payload and inspected directly — every section's
totals-row reconciles exactly to the report grand total, percentages sum
to exactly 100.0%. No Prisma schema/migration change, no new permission
key, no Electron/IPC change.

### Previous Release — `stable-expense-analysis-report-enhancement-pack-v1` (`0398d8c2`, 2026-08-01)

Comprehensive Reports module, Expenses Report. 13 files (8 modified, 5
added — 3 of the 5 are new regression tests), 1424 insertions / 65
deletions.

Adds executive KPI cards and six analytical sections (Category × Month
Pivot Matrix, Monthly Analysis, Top Expense Categories, Top 20 Expenses,
Month Comparison, Percentage Analysis) to the Expenses Report's preview,
print, Excel, and HTML/PDF export — additive only, nothing removed. Every
figure is derived in-memory from the same already-filtered `Expense`
dataset the base report fetches: zero new queries, and every section's
grand total equals the report's own total by construction (the total is
passed in, never recomputed independently). Percentages use
largest-remainder apportionment so they sum to exactly 100.0%. The report
engine's `kpis`/`sections` fields are additive-optional — the other 15
report types render byte-identical output, verified by tests.

**Runtime investigation, twice.** After implementation, the user reported
the report would not open. A first investigation (direct backend service
call against the dev DB, the live app's real HTTP API across all 16
report types × 3 formats, a React render test against the exact
live-captured payload, and a real Playwright browser session) found
everything working — the only anomaly, a burst of unhandled-error log
entries, turned out to be an unrelated pre-existing pattern recurring
since hours before this pack was written. The user correctly pointed out
that a browser is not Electron and asked for the investigation to
continue inside the actual app. A second pass launched the real Electron
dev topology and attached Chrome DevTools Protocol directly to the app's
own renderer (the first attempt had mistakenly attached to DevTools'
own window instead) — driving the exact click path found 6 KPI cards, 6
sections, 166 rows, and zero exceptions; Excel export, the print route,
and the HTML/PDF path were separately re-verified the same way. The most
likely explanation, given a stale runtime lock found holding the user's
own earlier session: the renderer was showing mid-edit Hot Module
Replacement state from when this pack's edits landed while that window
stayed open. No code changed as a result of either investigation.

Validation: backend + frontend `tsc --noEmit` clean on the feature branch
and post-merge; backend `vitest run` 156/156 files, 2261/2261 tests;
frontend 8/26 failures confirmed pre-existing (identical signature to the
prior release's documented baseline). No Prisma schema/migration change,
no new permission key, no Electron/IPC change.

### Previous Release — `stable-invoice-list-collection-date-column-v1` (`631b94c1`, 2026-08-01)

Invoice list presentation pass. 3 files, 34 insertions / 4 deletions: one
backend read-model extension, one page, one i18n pair.

The invoice list's `التاريخ` column became `تاريخ الفاتورة` (via a new
dedicated key, leaving the shared `col.date` untouched so no other module
shifted), and a new `تاريخ التحصيل` column was added immediately after it,
showing the invoice's most recent payment date — fully paid and partially paid
invoices alike, `—` when there are no payments.

A backend change was unavoidable and is the minimum that satisfies the
requirement:

- **The list read model had no payment data at all.** `InvoicesService.list()`
  returned invoice scalars plus `customer.name`/`supplier.name`; the invoice
  drawer had always lazily fetched `/invoices/:id` to get payments. The column
  could not be rendered from what the list already returned.
- **Extension shape.** The *existing* `payments` relation is loaded with
  `orderBy: { date: 'desc' }, take: 1` inside the *already-issued* `findMany`,
  then flattened to a scalar `lastPaymentDate` — one relation load per page,
  the same shape as the existing `customer`/`supplier` includes. No extra
  query, no per-row query, no full payment history per row. Nothing is
  calculated: `Payment.date` is the system's existing official collection
  date, already written by the payment and correction flows.
- **The truncated array is deliberately not returned.** `Invoices.tsx` treats
  the presence of a `payments` array as proof a row is fully detailed and
  skips its drawer enrichment on that basis, so a one-element array would have
  hidden every payment but the newest in the drawer.
- **API contract: additive only.** `GET /invoices` rows gain one nullable
  field. Nothing removed, renamed, or retyped; the endpoint's other consumer
  (`CustomerHub.tsx`) is unaffected.

The new column is **intentionally not sortable** — a limit, not an omission.
Latest collection date is a `MAX()` over a to-many relation, which Prisma
`orderBy` cannot express (only `_count`), and frontend-only sorting would sort
just the visible 15 rows, which `core/utils/sort.ts` explicitly forbids. It
follows the precedent of `الجهة` and `المتبقي`, both derived and both
non-sortable by design.

Excel export gains the same column automatically, because the visible table
and the export are built from one column array by design (Table/Excel Column
Unification v1); export logic itself was not touched. Invoice creation,
payments, GL posting, status transitions, governance, filters, stats,
`GET /invoices/:id`, and reports are unchanged. Electron and
Prisma/schema/migrations untouched — no migration was required, since the
feature reads an existing column through an existing relation.

Validation: backend + frontend `tsc --noEmit` clean on the feature branch and
post-merge; backend `vitest run` 2236/2236 across 154 files; the 26 frontend
test failures confirmed pre-existing by stash-and-rerun on the clean baseline.

### Previous Release — `stable-project-wide-ui-visual-polish-pack-v1` (`a84475f6`, 2026-08-01)

Project-wide visual consistency pass across button, chip, input and toolbar
geometry. CSS only — 4 files, 79 insertions / 6 deletions, no `.tsx`/`.ts`
changes, no backend/schema changes.

Two structural root causes accounted for nearly every provable inconsistency,
and the explorer kit (`.xpl-btn`) had already solved both — the legacy skin
never adopted them:

- **A — no baseline border reserved.** `.btn` declared `border: none` while
  `.secondary`/`.ghost` add `border: 1px solid`, so bordered variants rendered
  2px taller and wider than the `.btn`/`.danger` beside them. Flex *stretch*
  containers masked it; plain inline flow did not — worst case `.td-actions`,
  where the unequal borders also shifted the inline-flex baselines, offsetting
  Edit vs Delete on every row of every generic CRUD table. Same defect in
  `.xpl-chip` (of six tones only `--neutral` draws a border). Fixed by
  reserving `border: 1px solid transparent` on both bases.
- **B — Material Symbols icons never sized at button level.** The vendored
  `material-symbols/outlined.css` ships the icon class at `font-size: 24px;
  line-height: 1`, making the icon the tallest box in a button, so icon
  buttons rendered ~6px taller than text buttons. The repo already held 163
  rules re-declaring that size across 228 icon selectors, including two local
  patches on `.btn` itself — the duplication was the diagnosis. Normalized at
  the base (18px `.btn`, 16px `.btn.sm`, 18px `.export-btn`); both local
  overrides still win on specificity and injection order, so their denser
  scales are preserved.

- **Financial Center:** shared `min-height: 36px` for the Load button, view
  toggles and export buttons, which were each sized only by their own padding
  and font metrics and never landed on one value.
- **Bank Account Explorer:** filter bar normalized to values already
  established in the same file and the kit — 38px → 40px on the action row
  (matching `.bae-search-wrap` and `.bae-clear-filters-inline`), `.bae-icon-btn`
  squared to 40×40, `.bae-date-input` radius 8px → 10px. This page is the
  source the kit was extracted from, so its local `.bae-*` classes were never
  retro-fitted to the standard they produced.
- **Known partial coverage (accepted at review):** `.bae-reset-btn` is dead
  CSS so that edit is inert; `.bae-amount-input` follows its 38px sibling, not
  the 40px standard; `.bae-search-wrap` keeps its 8px radius.
- **Not changed:** colors, dark/light mode, design tokens, typography,
  business logic, routing, state, component architecture, print system,
  reports, PDF generation, backend, Electron, Prisma/schema/migrations.
- **Validation:** frontend `tsc --noEmit` clean (feature branch and
  post-merge) · `npm run build` succeeds both passes · `vitest` 8/26 failures
  confirmed pre-existing by stash-and-rerun against the clean baseline.

### Previous Release — `stable-visual-consistency-micro-polish-pack-v1` (`ab0128a4`, 2026-08-01)

Three previously approved, isolated visual-polish fixes across Payroll, Bank
Account Explorer, and the Employees drawer. Frontend-only, no backend/schema
changes.

- **Payroll (`Salaries.tsx`):** missing-payroll-employees alert card rendered
  each name as a `nowrap` chip with no wrap strategy, so many employees
  overflowed the card. Fixed with `flex-wrap` + `gap` on the container and an
  `overflow-wrap: anywhere` fallback. Alert logic/data untouched.
- **Bank Account Explorer (`BankAccountExplorer.css`):** the Transaction
  Details drawer's transaction-type badge (e.g. "شيك") was stretched to its
  sibling amount text's width by its flex-column parent's default `stretch`
  cross-axis alignment. Fixed with `align-items: flex-start` on the parent;
  the shared `.bae-tx-badge` rule was untouched, so its other two usages are
  unaffected.
- **Employee Financial Tab (`EmployeeFinancialTab.tsx`):** the bank account
  number was unconditionally masked to `**** **** **** <last4>`, unlike every
  other financial field in the component (which honors the privacy-mode
  toggle). `maskAccount()` renamed to `formatAccount()`, truncation removed —
  displays the stored value as-is. Read-only tab; no edit/save/validation
  logic to touch.
- **Not changed:** any layout, colors, typography, spacing, or hierarchy
  beyond the three fixes; business logic; backend; Electron;
  Prisma/schema/migrations.
- **Validation:** frontend `tsc --noEmit` clean (feature branch and
  post-merge) · `npm run build` succeeds both passes.

### Previous Release — `stable-dark-mode-color-consistency-pack-v1` (`9b3c437b`, 2026-08-01)

Project-wide audit and correction of dark-mode color contrast and theme-reactivity
across the app — text/background/icon/badge/table/dropdown/popover colors only.
Frontend-only, no backend/schema changes.

- **Audit method:** static analysis of all 73 stylesheets and every `.tsx` inline
  style, with WCAG relative-luminance contrast computed against the resolved
  dark-mode token values. `print-templates/`, `forms/`, and deliberate
  white-paper preview surfaces excluded as by-design.
- **6 systemic root causes fixed:** missing `color-scheme: dark` + unstyled
  placeholders; `--muted` undefined across ~90 call sites; shadcn `dark:`
  utilities following the OS preference instead of the app's own toggle
  (new Tailwind v4 `@custom-variant dark`); 3 files gated on
  `@media (prefers-color-scheme: dark)` instead of `data-theme`; `--text-muted`
  failing AA (4.07:1) on `--surface-2`, fixed by lightening the dark value only;
  15 further undefined tokens aliased to existing ones.
- **~50 leaf fixes** across AI Assistant, Data Import, Bank Reconciliation, Bank
  Salary Analytics, Bank Account Explorer, Financial Center, Integrations,
  Approval components, cheque template surfaces, print preview, and the
  date-calendar popover — dark text on translucent tints, opaque badges that
  never flipped, an OS-gated calendar hover, Recharts props missing dark fills.
- **New tokens:** `--violet`/`--violet-light`, `--teal`/`--teal-light` — required
  because the affected UI (transfer/fee badges, AI capability chips, PAID/PARTIAL
  approval statuses) was already violet/teal in the approved design.
- **Corrective follow-up:** a self-identified architecture gap — 4 colors used
  ~26 times as repeated literals across 6 files — centralized into
  `--blue-bright`/`--red-bright`/`--green-bright`/`--amber-bright`. Values
  unchanged; architecture only.
- **Not changed:** any color value beyond the above, layout, spacing,
  typography, component hierarchy, business logic, backend, Electron,
  Prisma/schema/migrations.
- **Deferred (self-disclosed, logged not fixed):** one further undocumented
  `var(--primary)`-on-dark instance in `ResultCard.css`, and the same
  light-island badge pattern recurring at additional un-cited lines in
  `BankStatementImport.tsx`/`AttachmentsPanel.tsx`.
- **Validation:** frontend `tsc --noEmit` clean (feature branch and post-merge)
  · `npm run build` succeeds both passes (only the pre-existing >500kB
  chunk-size warning, unrelated).

### Previous Release — `stable-project-wide-i18n-placeholder-integrity-v1` (`873c3c0`, 2026-07-31)

Project-wide AST-based audit of every `t()`/`translate()` call site in the frontend
against the AR/EN `lib/i18n.ts` dictionaries, proving each call supplies every
placeholder its translation requires. Fixes 10 confirmed caller/translation
placeholder-name mismatches and adds a permanent regression guard. Frontend-only,
no backend/schema changes.

- **Root cause:** `t()` interpolates `{name}` by exact name match against the
  supplied `vars` object with no validation — a caller passing the wrong
  variable name leaves the real placeholder unresolved, leaking literal text
  (`{code}`, `{n}`, `{v}`) into the UI silently.
- **Audit:** TypeScript AST parse (not regex) of `DICT` + all 5,854 production
  `t()`/`translate()` calls across 479 files. 5,554 statically resolvable;
  298 dynamic-key and 2 unresolved-vars calls classified/logged only. AR/EN
  key sets identical (4,273 each), 0 placeholder-set parity mismatches.
- **10 confirmed defects fixed:** 4 in `api/client.ts` (duplicate-invoice
  errors, wanted `v` got `value`), 3 in `RecentActivityFeed.tsx` (relative
  time, wanted `n` got `min`/`hr`/`day`), 3 in `Maintenance.tsx` (a11y labels,
  wanted `code` got `equip` — resolved in favor of `code`, the translations
  were correct).
- **Permanent guard added:** `i18nPlaceholderIntegrity.ts`/`.test.ts` (32
  tests) — AR/EN parity + static call-site placeholder coverage. Known,
  stated limitation: the 298 dynamic-key call sites are not statically
  contract-verified.
- **Not changed:** the i18n runtime engine itself (`lib/i18n.ts`), any
  translation wording, backend (confirmed no placeholder i18n surface),
  Electron, Prisma/schema/migrations.
- **Validation:** new guard 32/32 passing · focused affected suites 99/99
  passing · frontend `tsc --noEmit` clean · 2 pre-existing baseline failures
  (`formsRegistryTranslationAudit.test.ts`, `currencyHeaderCompleteness.test.ts`)
  proven unrelated and deliberately deferred.

### Previous Release — `stable-administrative-forms-preview-ux-v1` (`e645f303`, 2026-07-31)

Replaces the direct-print "طباعة" action on Administrative Forms cards with "فتح"
(Open), routing into the existing WYSIWYG preview architecture at an 80% initial
zoom instead of triggering an immediate OS print dialog. Frontend-only, no
backend/schema changes.

- **Root cause:** `FormLayout`'s auto-print `useEffect` fired as soon as
  `ready === true` — navigating from a card into the form page (not the card
  click itself) triggered the immediate print, for the 8 of 14 registry forms
  that pass `ready` to `FormLayout`.
- **Fix:** a URL-only intent marker (`?open=preview`) set exclusively by
  navigation from the Administrative Forms page. `FormLayout` skips auto-print
  when it is present; `PrintWorkspace` gained an additive, opt-in `initialZoom`
  prop (80% via the marker) that seeds — but does not lock — the preview's
  starting zoom. 12 of the 14 registry forms render through `PrintWorkspace` and
  get the 80% initial zoom.
- **Intentional exceptions:** `employment-contract` and `receipt-voucher` use
  their own dedicated screens (no `PrintWorkspace`) — "فتح" is correct on both
  (no auto-print), but no 80% zoom applies since there is no shared preview
  surface to seed.
- **Not changed:** print pipeline, `@page` geometry, margins, PDF export, the
  separate "معاينة دقيقة" WYSIWYG POC dialog, any non-Administrative-Forms
  caller of the same routes (e.g. Cheques → payment-voucher).
- **Validation:** 19/19 new focused frontend tests passing · affected-suite
  sweep (15 files): 13 passing, 2 pre-existing failures unrelated to this pack
  deferred · frontend `tsc --noEmit` clean.

### Previous Release — `stable-bank-statement-import-server-date-hardening-v1` (`60c63a23`, 2026-07-31)

Hardens the bank-statement-import server boundary so transaction dates are deterministic and
validated before reaching business logic — closing a risk explicitly deferred by the preceding
Project-Wide Date Display, Export & Import Consistency Pack v1 audit. Backend-only, no
frontend/schema changes.

- **Traced first:** the trusted frontend parser (`bankStatementParser.ts` `parseDateStr`)
  already normalizes every legitimate bank-file date shape (Excel serial, ISO, `DD/MM/YYYY`,
  `DD-MM-YYYY`, verbose month) into canonical `YYYY-MM-DD` (or `null`) before the request is
  built and sent verbatim — proving the client → server contract was already canonical, so no
  frontend change was required.
- **Root cause:** the backend schema accepted `statementDate`/`postingDate`/`fromDate`/`toDate`
  as `z.string().max(32).nullable()` — any string — which later reached bare `new Date(str)` at
  4 live sites: `service.ts` persistence insert and `fromDate`/`toDate` derivation,
  `validators.ts`'s `checkDate`, and `dedupDetector.ts`'s `fetchSnapshot`.
- **Fix:** reused the released `dateOnlySchema` (API Date Hardening Pack v1) composed with an
  extra `.transform()` back to a canonical string (`bankStatementDateOnly`), preserving the
  `YYYY-MM-DD`-string contract every downstream consumer in this module depends on. Once the
  schema guarantees the string is unambiguous, all 4 downstream `new Date(str)` calls become
  safe by construction — none needed to be touched.
- **Not changed:** bank source-file formats, historical imported records, the dead/test-only
  `parser.ts` mirror, Generic Importer, Payroll Bank Import, Prisma schema/migrations.
- **Validation:** backend `tsc --noEmit` clean · `bankStatementImport` module suite 5 files/226
  tests passing (211 pre-existing + 15 new) · mutation-tested: reverting the fix fails exactly
  the 8 tests designed to catch it.

### Previous Release — `stable-project-wide-date-display-export-import-consistency-v1` (`174883aa`, 2026-07-31)

Standardizes user-facing calendar-date rendering to `DD/MM/YYYY` across Excel/PDF report
exports and frontend displays. The canonical internal/API `YYYY-MM-DD` contract, timestamps,
and machine-readable filename dates are unchanged — this pack is display/export-only.

- **Excel/report fix:** `excelStyle.ts`'s `DATE_FORMAT` (`'yyyy-mm-dd'` → `'dd/mm/yyyy'`) —
  real Excel date cells keep their type, so sorting/calculation is preserved; only the visible
  format changed. Several export sites bypassed the existing canonical `formatDisplayDate`
  helper entirely — raw `toISOString().slice(0,10)` (leaking the wire format to a user-facing
  cell/subtitle; in `summary.utils.formatDate`'s case also reading the **UTC** day, shifting a
  locally-stored midnight date backward in Kuwait's UTC+3) and `toLocaleDateString('ar-KW')`
  (Arabic-Indic digits + embedded RTL marks). All now route through the existing helpers.
- **Import validation fix:** the employees/equipment import validators parsed dates via
  `parseImportDate(v) ?? undefined`, silently dropping an unparseable date and importing the
  row as valid with the date missing, while the sibling contracts/expenses/invoices validators
  already raised a row error for the identical condition. Now consistent.
- **Corrective pass — payroll bank import:** `payrollBankImportParser.ts`'s `parseDateValue`
  was bare `new Date(String(v))`, carrying a proven MM/DD misread (the backend twin
  `excelParser.ts` parses the identical column from the identical bank templates and was
  already fixed against this exact literal), a UTC-vs-local day shift able to misfile an entire
  payroll batch into the wrong month, and no Excel-serial support. Now delegates to the
  existing `parseFlexibleDate`, which gained an explicit ISO branch and a calendar round-trip
  rejecting impossible dates.
- **Explicitly deferred (logged, not fixed):** generic importer's ambiguous MM/DD
  compatibility gap, bank-statement server-side date trust, the inert backend
  `payrollBankImport/excelParser.ts` follow-up, `printI18n` dead code, legacy salaries bank
  import.
- **Validation:** backend `tsc --noEmit` clean · frontend `tsc --noEmit` clean · new/extended
  tests (`dateDisplayConsistency` 17, `importDateValidation` 11, `date.test.ts` +10,
  `payrollBankImportParser` +12, mutation-tested) all passing · affected backend suites 36
  files/754 tests passing · affected frontend suites passing.

### Previous Release — `stable-api-date-hardening-pack-v1` (`d3a937b7`, 2026-07-31)

Hardens backend DATE-ONLY API fields to a canonical `YYYY-MM-DD` contract. `z.coerce.date()`
passed raw input straight to `new Date(value)`: a bare `YYYY-MM-DD` string is unambiguous per
ECMA-262, but `DD/MM/YYYY`, `MM/DD/YYYY`, or a 2-digit year fell into the JS engine's
non-standard heuristic parser (V8 assumes US `MM/DD/YYYY`) — "2 August" could silently become
"8 February", or resolve to a silent `Invalid Date`. Backend-only, no schema/frontend changes.

- **Shared validator:** `backend/src/core/utils/dateOnly.ts` (`dateOnlySchema`) —
  canonical-prefix regex match → pure-arithmetic real-calendar-date check (no `Date` rollover) →
  `Date.UTC(y, m-1, d)`. One validator, reused everywhere; composes with `.optional()`/
  `.nullable()`/`.refine()` like any Zod type.
- **40 DATE-ONLY fields hardened** across 15 modules (cheques, invoices, equipment, employees,
  employee-entitlements, holidays, payments, payroll, expenses, prices, maintenance, contracts,
  transactions, accounting), preserving every field's exact required/optional/nullable contract.
- **Compatibility-first:** every frontend caller for every field was traced before hardening and
  confirmed to already send canonical `YYYY-MM-DD` or `new Date('YYYY-MM-DD').toISOString()` —
  both accepted unchanged. No caller required a compatibility exception.
- **Intentionally excluded:** `attendanceSchema`/`updateAttendanceSchema`'s `checkIn`/`checkOut`
  carry a genuine `HH:MM` time-of-day, not a date-only value — left on `z.coerce.date()`.
  Date-range filters (`periodQuerySchema`/`resolvePeriod`) are untouched.
- **Validation:** backend `tsc --noEmit` clean · 74 focused test files / 913 tests passing,
  0 failures, across all 16 touched modules + `core/utils` · new tests include a static guard
  confirming zero remaining raw `z.coerce.date()` outside the documented `checkIn`/`checkOut`
  exception. Frontend/electron untouched.

### Previous Release — `stable-financial-period-custom-range-state-fix-v1` (`bfcae728`, 2026-07-31)

Fixes `PeriodControl`'s custom-range fields (`customFrom`/`customTo`) going stale: they were seeded
only in a `useState` initializer, which runs once at mount, while the control itself stays mounted
for the life of a page as the shared `FinancialPeriod` changes underneath it (presets, month
selector, reset). Opening "نطاق مخصص" could show a range left over from an earlier period, and
Apply would silently commit it instead of the currently active one. Frontend-only, no
schema/backend changes.

- **Fix:** re-seed `customFrom`/`customTo` from `period.fromDate`/`period.toDate` at the same point
  `monthYear` was already being re-seeded — inside `toggleOpen`, only on the transition into `open`.
  No new state, no new hook, no `useEffect`. The existing "re-seed on open only" contract is
  preserved: an in-progress edit stays stable for the life of one open session.
- **Verification of no over-correction:** a regression test forces both a local re-render (year
  stepper click) and an external period change from outside the panel while it stays open — the
  draft survives both. This guards against a naive `useEffect`-on-`period` fix, which would pass the
  simpler stale-state tests but fail this one by overwriting the user's in-progress edit.
- **Validation:** frontend `tsc --noEmit` clean · `PeriodControlMonth.test.tsx` 27/27 passing (21
  pre-existing + 6 new) · reverting the fix fails 3 of the 6 new tests (proves they exercise the
  actual stale-state paths, not just the guard-against-over-correction ones) · related suites
  (`financialPeriodSession`, `FinancialPeriodContext`, `financialPeriod`, `periodSingleSource` — 53
  tests) unaffected · `npm run build:front` not run (no new imports/types). Backend/electron
  untouched.

### Previous Release — `stable-financial-period-month-selector-v1` (`867a4889`, 2026-07-31)

Replaces the shared `PeriodControl`'s "سنة محددة" (specific year) section with "شهر محدد" (specific
month) — 12 month buttons producing a complete calendar-month range — plus a compact year stepper
in the section header. The stepper exists because removing the year buttons would otherwise have
removed the only one-click path to a historical year (2020–2026); it seeds from the active period's
year on each panel open and is clamped to the same `[2020, currentYear]` range the old buttons
covered. Frontend-only, no schema/backend changes.

- **Model:** new `preset:'month'` + `selectedMonth` (0-based) in `lib/financialPeriod.ts`. Bounds
  derive from the existing `firstOfMonth`/`lastOfMonth` helpers — no hardcoded month lengths;
  February/leap-year and December-year-boundary correctness come from the calendar itself. All
  bounds are local `YYYY-MM-DD` strings, no UTC conversion.
- **Context:** `setMonth(year, month)` added to `FinancialPeriodContext`, routed through the same
  `apply()` path as every other setter — no new state, no per-page month state. `'year'`/`setYear`
  deliberately kept (not removed) so a session saved before this pack still restores correctly.
- **UI:** month grid replaces the year-button grid; selecting a month applies immediately and closes
  the panel, matching the interaction model of the buttons it replaces. Presets, custom range,
  Apply, and the existing CSS design language are unchanged.
- **Corrective pass** (found during manual visual review): the Expenses page's "year" summary card
  rendered the literal string `سنة {y}` — a pre-existing i18n placeholder/variable-name mismatch in
  `lbl.year_prefix` (`{y}` in the string vs. `{ year: … }` passed at the call site), unrelated to the
  Month Selector. Fixed in both languages (2 lines). Confirmed the card intentionally reflects an
  absolute current-year window computed by the backend with the period filter stripped — not the
  active month selection — so no behavior change beyond the literal-placeholder fix.
- **Validation:** frontend `tsc --noEmit` clean · 6 affected period-related test files / 85 tests
  passing · full frontend suite matches the documented pre-existing baseline (25 failures, unchanged
  set; +36 new tests, all passing) · `npm run build:front` clean · new tests mutation-tested
  (reverting the corrective placeholder fix fails 9 of 11 new assertions). Backend/electron
  untouched.

### Previous Release — `stable-backend-date-boundary-unification-v1` (`d7f8080a`, 2026-07-31)

Unifies backend date-range filtering semantics — the interpretation of a user-selected `from`/`to`
into `{gte, lte}` Prisma boundaries — into one canonical local-calendar contract. Previously each
module parsed the same PeriodControl-selected range independently: some via `new Date('YYYY-MM-DD')`
(UTC midnight, dropping the first 3 hours of the range in Kuwait's UTC+3), some via `endOfDay(new
Date(...))` (correct only by accident, on non-negative UTC offsets), and Transactions/Audit with no
`endOfDay` at all (truncating the entire final day). No database, schema, or frontend changes.

- **Canonical contract:** new `startOfLocalDay()` / `endOfLocalDay()` / `localDateRange()` in
  `backend/src/core/utils/dateWindows.ts`, built from explicit local calendar components — never
  dependent on the engine's UTC interpretation of a date-only ISO string. `resolvePeriod()`
  (`core/utils/periodFilter.ts`) now delegates to it.
- **13 modules unified:** Expenses, Reports (generic `dateWhere` + 4 further sites), Accounting,
  Transactions, Audit log, Financial (7 sites, including a previously-unnoticed second bug where the
  GL trial-balance opening-cutoff and period-start were derived independently and could double-count
  or drop journal lines at the boundary), Salaries bank analytics, Employee attendance, Bank statement
  import/reconciliation. Cheques/Invoices routed through the same helper to remove duplicate private
  builders — no behavior change.
- **Explicitly deferred:** `z.coerce.date()` API-boundary hardening, Excel `DATE_FORMAT` display
  cleanup, display-helper consolidation, and the "شهر محدد" Month Selector — all logged for future
  packs, none touched here.
- **Validation:** backend `tsc --noEmit` clean · backend vitest 149 files / 2155 tests passing
  (baseline 144/2102, zero pre-existing failures) · `npm run build:back` clean · new cross-module
  parity guards mutation-tested (reverting the fix fails 4 of 5 new assertions) · full suite verified
  under this host's actual zone (Asia/Kuwait); a genuine negative-UTC-offset process run could not be
  executed on this Windows host (no WSL/Docker, `TZ` env var ignored by Node here) — compensated by
  making every new assertion compare local calendar components rather than absolute UTC instants, plus
  one test that explicitly asserts the pre-pack pattern diverges from the correct contract on any
  negative-offset host. Frontend untouched.

### Previous Release — `stable-window-lifecycle-foundation-v1` (`e3bf6d4`, 2026-07-24)

Fixes a real production startup failure: the app would appear to launch, briefly show the Cloud Sync
Progress dialog, then exit cleanly (code 0) with the main window never opening. Root cause — Electron's
`window-all-closed` event fires whenever the tracked window count hits zero, with no concept of "startup
phase." The pre-existing handler treated the sync-progress dialog closing (before the main window ever
existed) as if the user had closed the app, and unconditionally called `app.quit()`. No database, backend,
or Google Drive Sync logic changes.

- **Generic lifecycle registry:** new `electron/windows/windowLifecycle.ts` — `registerUtilityWindow(win)`
  marks a transient window (self-cleans on close), `registerMainWindow(win)` sets a permanent one-way flag
  the first time the real app window is created (never reset, even after that window later closes), and
  `shouldQuitOnAllWindowsClosed()` answers whether the main window has ever existed. Not sync-dialog-specific
  — any future utility window (splash, update-check, migration, maintenance) opts in with one call.
- **`electron/main.ts`:** `window-all-closed` now calls `shouldQuitOnAllWindowsClosed()` before
  `app.quit()`, instead of quitting unconditionally; `registerMainWindow(mainWindow)` is called right after
  the main window is created. `before-quit`, startup/shutdown sync, `activate`, and `second-instance` are
  byte-for-byte unchanged.
- **`electron/windows/syncProgressWindow.ts`:** calls `registerUtilityWindow(win)` on the Cloud Sync
  Progress dialog — the first (and currently only) consumer of the new registry.
- **Validation:** electron `tsc --noEmit` clean · electron vitest (`vitest.electron.config.ts`, 3 files/75
  tests) passing · backend vitest (135 files/1897 tests) passing · frontend `tsc --noEmit` clean · frontend
  production build clean · frontend vitest shows the identical established baseline (7 failing files/17
  failing tests/1829 passing) — zero regressions across all three surfaces.

### Previous Release — `stable-google-drive-database-restore-reliability-pack-v1` (`9ff69d9`, 2026-07-23)

Fixes a real-world production restore failure: a Google Drive download completed successfully but the
atomic file replacement threw `EPERM: operation not permitted, rename temp.db -> manar.db`, because the
backend process still held the live SQLite file open (Windows exclusive-lock semantics). No database
schema changes, no business logic changes.

- **Detection & graceful stop:** new `isBackendRunning()`/`stopBackendForRestart()` in
  `electron/services/backendLauncher.ts` — detects whether the database is actually in use (a no-op during
  startup-sync, since the backend hasn't started yet at that point) and, when it is, kills the backend and
  awaits its real `'exit'` event (max 5s) rather than assuming the file lock is released after a fixed
  delay.
- **Retry on lock contention:** the atomic rename is wrapped in the existing generic `withRetry()` helper,
  retrying only `EPERM`/`EBUSY` (6 attempts, 500ms-4s backoff) — absorbs any final OS-level lock-release
  lag instead of failing on the first attempt.
- **Automatic backend restart:** the backend restarts itself and waits for `/api/health` before the
  operation is reported complete; a `finally` block guarantees the backend is restarted even if the replace
  ultimately fails after retries — the app is never left without a running backend.
- **Shared internal secret:** new `getInternalSecret()` caches `INTERNAL_SECRET` (used by
  `/api/internal/*` and the auto-backup scheduler) for the process lifetime instead of regenerating it in
  `main.ts` — a mid-session backend restart now reuses the exact secret the scheduler already holds.
- **Crash-dialog guard:** the pre-existing "unexpected exit → error dialog → `app.quit()`" handler is
  guarded with a `restartingBackend` flag so this deliberate, controlled restart is never mistaken for a
  crash.
- **Frontend reconnect:** `CloudSyncPanel.tsx` replaced `requiresRestart` → `window.manar.restartApp()`
  (full Electron relaunch) with `backendRestarted` → `window.location.reload()` (in-window reload) — the
  user is no longer asked to manually restart the app after a Drive restore.
- **Validation:** electron `tsc --noEmit` clean · frontend `tsc --noEmit` clean · frontend production
  build clean · full frontend suite shows the identical established baseline (8 failing files / 18 failing
  tests / 1808 passing) — zero regressions. No backend changes this release. Real-world runtime restore
  testing completed successfully per user's release note.

### Previous Release — `stable-google-drive-conflict-resolution-pack-v1` (`fdf3681`, 2026-07-23)

Professional conflict detection and resolution, built strictly as an extension of the Sync Engine
introduced by Google Drive Sync Foundation Pack v1 — no redesign of that architecture. No database schema
changes, no business logic changes.

- **Detection:** `decide()`'s existing SHA-256 comparison now returns a distinct `CONFLICT` action
  (previously silently fell through to `NONE`) when both the local and remote databases changed since the
  last successful sync — checked at the same point as always, immediately before every upload/download
  decision. Startup/shutdown conflicts are logged and left untouched; `CloudSyncPanel` proactively checks
  for one on mount via a new read-only `sync:getConflict` IPC call (unlogged, to avoid spamming history on
  every page visit) so the dialog can appear without a manual "Sync Now" click.
- **Resolution:** `resolveConflict('LOCAL' | 'REMOTE', ...)` is a thin wrapper around the existing,
  unmodified `performUpload`/`performDownload` — Keep Local/Keep Cloud inherit every Foundation Pack
  protection automatically (WAL checkpoint, double `PRAGMA integrity_check`, snapshot-before-upload,
  atomic rename, pre-sync backup, retry with backoff). Cancel is entirely client-side and never calls the
  backend — neither database changes.
- **`ConflictResolutionDialog.tsx`:** side-by-side Local vs. Cloud comparison (last modified, device,
  truncated SHA-256, size) with a non-binding "Newest" highlight; the system never auto-resolves. Gated by
  the existing `backups.update` permission — no new permission key.
- **Device identity & version metadata:** new `electron/services/deviceIdentity.service.ts` gives each
  machine a persistent UUID + hostname (stored locally, never synced as its own file — only its two
  values ride along as Drive `appProperties` on the database file). Drive `appProperties` gained
  `version`/`deviceId`/`deviceName` alongside the existing `sha256`. Every sync log entry is now tagged
  with the device that wrote it; conflict-resolving entries additionally carry
  `conflictResolved`/`resolutionSelected`. `CloudSyncPanel`'s history table gained a Device column and a
  resolution badge.
- **Validation:** electron `tsc --noEmit` clean · frontend `tsc --noEmit` clean · frontend production
  build clean · full frontend suite reproduces the same 8 pre-existing failing files against the
  unmodified checkpoint baseline (none touching Sync/Conflict Resolution code) — zero regressions. No
  backend changes this release.

### Previous Release — `stable-google-drive-sync-foundation-pack-v1` (`1cfeaa3`, 2026-07-23)

Professional Google Drive synchronization for the desktop database while preserving the Offline-First
architecture end to end: the app always operates against the local SQLite database directly; Google Drive
is used exclusively as a sync location between the user's own devices (hidden `appDataFolder`,
`drive.appdata` OAuth scope — never a visible/shared folder). No database schema changes, no business logic
changes.

- **Auth:** OAuth2 login via the system browser (loopback redirect on `127.0.0.1`), never an embedded
  WebView (Google blocks those for OAuth); tokens encrypted at rest via Electron `safeStorage` when
  available.
- **Sync engine** (`electron/services/syncEngine.service.ts`): persistent sync-metadata log, direction
  decision logic (upload/download/none/conflict), atomic download-replace (temp file → verify → pre-sync
  backup → `fs.renameSync`), bounded (8s/20s) startup/shutdown sync that never blocks app start or quit.
  Simultaneous local+remote changes are surfaced as a conflict and never auto-resolved — manual
  Upload/Download picks a side. Version history and automated conflict resolution are explicitly out of
  scope for v1.
- **Integrity:** real `PRAGMA integrity_check` via a short-lived `PrismaClient` pointed at the target file
  (reuses the backend's already-shipped, already-rebuilt query engine instead of adding a new native
  dependency like `better-sqlite3`) — run before every upload and immediately after every download.
- **Locking safety:** `PRAGMA wal_checkpoint(FULL)` against the live database, integrity-checked, then
  copied to a temp snapshot which is integrity-checked again before being hashed and uploaded — the live
  file is never read directly by the upload path, no downtime introduced.
- **Reliability:** exponential-backoff retry (`electron/services/retry.ts`) around every Drive network call,
  classifying transient failures (network/timeout/429/5xx) from permanent ones (401/403/400/404 — never
  retried); every retry attempt logged; retries re-run the whole idempotent operation, never partial steps,
  so no duplicate uploads. Known limitation: Google's occasional use of HTTP 403 for rate-limiting is not
  distinguished from a real permission failure — accepted as v1 scope.
- **UI:** Cloud Sync is a tab inside the existing Backup page (`CloudSyncPanel.tsx` embedded in
  `Backup.tsx`), not a dedicated Sidebar entry — judged an administrative feature, not a daily workflow.
- **IPC:** reuses the existing `backups.create`/`backups.update` permissions — no new permission key.
- **Validation:** electron `tsc --noEmit` clean · frontend `tsc --noEmit` clean · frontend production build
  clean · full frontend suite identical pre-existing 18 failures / 1808 passing (114 files) — zero
  regressions. No backend changes this release.

### Previous Release — `stable-employee-equipment-tables-visual-consistency-pack-v1` (`db6a8a1`, 2026-07-20)

Executive-grade visual polish for the Employees explorer table, a numeric sorting regression fix for Employee
Number, a frozen-cell background consistency fix, and migration of the Equipment table's Registration Remaining
column onto the same shared visual system as Employee's expiry cells. Presentation-only except the Employee
Number sort execution path — no API, Prisma, database, routing, filtering, or pagination change.

- **Employee table polish:** single-line, ellipsis + tooltip Arabic/English name cells; profession and
  nationality rendered as plain text (badges/flags/status labels — added in an earlier iteration — removed
  after explicit user feedback in favor of a calmer, label-free look); the four expiry columns share one
  `ExpiryCell` (soft pastel tint + thin colour accent, no badge/icon/label); frozen identity columns limited to
  Employee Number + Arabic Name (English Name unfrozen); rebalanced widths, denser rhythm, a stronger-but-quiet
  hover.
- **Employee Number numeric sort fix:** `code` is a digit string; SQLite/Prisma sorted it lexically
  (1, 10, 11, 2). Removed from the DB sort whitelist and routed through the **existing shared**
  `sortRowsInMemory` numeric collator (same pattern already used by payroll/financial) over the full filtered
  set before paging — no duplicate sort logic, no API/Prisma/DB change. 3 regression tests added.
- **Frozen cell background consistency fix:** the frozen cells' opaque hover/selected overlay used
  independently hand-tuned percentages (8%/12%) instead of the actual row-level tint values (7%/10%), causing
  visible drift from the non-frozen English Name cell. Both now derive from single-source
  `--emp-hover-pct`/`--emp-selected-pct` tokens so they cannot drift apart again. CSS-only.
- **Shared `ToneCell` + Equipment migration:** extracted the Employee expiry-tint system into a shared,
  reusable `ToneCell` component (`frontend/src/components/explorer/`) — the one green/amber/orange/red system
  for any explorer table's status/remaining-period cell, not a per-module copy. Employee's `ExpiryCell` now
  delegates to it (zero visual change, re-verified via full test suite + build). Equipment's Registration
  Remaining column migrated off the old loud `.pill` badge onto the same system (same
  `expired`/`expiringSoon` flags, no calculation change) — removes the saturated badge background and the
  warning-icon prefix. Equipment's WORKING/NOT_WORKING status column intentionally left on the classic pill
  (Employee's own status column also still uses it — keeps both tables internally consistent with the same
  reference).
- **Scope guarantee:** 11 files (+427/−31; 5 added, 6 modified: `employees.service.ts`,
  `employees.sort.test.ts`, `DataTable.tsx`, `SortableHeader.tsx`, `modules.tsx`, `ResourcePage.tsx` modified;
  `employeeCells.tsx`, `employee-table.css`, `equipmentCells.tsx`, `ToneCell.tsx`, `toneCell.css` added).
  Checkpoint tag `pre-employee-equipment-tables-visual-consistency-pack-v1`. Feature branch
  `feature/employee-equipment-tables-visual-consistency-pack-v1` (kept, pushed). Feature commit `f46d203`,
  merge commit `db6a8a1`.
- **Validation:** backend `tsc --noEmit` ✅ · backend build ✅ · backend vitest **1848/1848 pass** ✅ ·
  frontend `tsc --noEmit` ✅ · frontend build ✅ · frontend vitest **1775/1776 pass** (1 pre-existing, unrelated
  failure — a hardcoded `lazy()`-import counter in `routerFutureFlags.test.tsx` already stale against untouched
  `App.tsx`; confirmed to reproduce identically on vanilla `production`) — all validated both pre-merge (in an
  isolated git worktree with its own dependency install + Prisma client generation) and on the merged
  `production` HEAD. No business logic, accounting/GL logic, or database schema change beyond the Employee
  Number sort path described above. Product Owner manual visual review: **APPROVED**. Gemini final review:
  **APPROVED**.
  *Confidence: High (this pass's own git/build evidence).*

### Previous Release — `stable-employee-financial-position-dashboard-v1` (`9d0c6ff`, 2026-07-20)

Presentation-only redesign of the top of `EmployeeEntitlementsCenter.tsx` into an executive financial
dashboard. Legal engine, backend, API, and database are all untouched.

- **Financial Position card:** one `SectionCard` headline ("إجمالي الالتزام الحالي") plus two executive
  `MetricCard`s — Leave Allowance and End of Service — summed directly from the existing legal engine
  (`r.leaveAllowanceValue + eosAmount`, both already computed server-side). No ledger-derived or
  accounting-style figure is shown: a "Previously Paid"/"Remaining Expected Liability" pair (originally
  derived from `sum(ledger[].amount)`) was implemented and then deliberately removed in a follow-up
  correction, because the append-only historical entitlements ledger must never be presented as an actual
  paid/accounting balance.
- **Health Indicators panel:** compact grid reusing the existing `.ent-warning` styling, derived purely from
  existing response data (leave eligibility, data completeness, last-disbursement recency, high leave
  balance) merged with the existing `buildWarnings()` output — no new business rule, no warning dropped.
- **Service Analytics grid:** consolidates hire date, service duration, approved wage, legal accrual, leave
  balance/used, holidays/sick excluded, and advances count into one responsive `auto-fit` grid — same values
  as before, each now appearing exactly once (removes the prior duplication between the info strip and the
  KPI cards).
- **Scope guarantee:** 2 files (+253/−131; 0 added, 2 modified: `EmployeeEntitlementsCenter.tsx`,
  `EmployeeEntitlementsCenter.css`). Feature branch `feature/employee-financial-position-dashboard-v1` (kept,
  pushed). Feature commit `df8be37`, merge commit `9d0c6ff`.
- **Validation:** frontend `tsc --noEmit` ✅ · frontend `vite build` ✅ · backend `tsc --noEmit` ✅ · backend
  build ✅ (all four, both pre-merge and on merged HEAD) · zero backend files touched. No business logic,
  legal calculation, accounting/GL logic, or database schema change — every displayed number maps 1:1 to the
  same pre-existing `GET /employees/:id/entitlements` API field. Built entirely from ExplorerKit components
  and `--xpl-*` tokens, RTL, responsive. Gemini final review: **APPROVED**.
  *Confidence: High (this pass's own git/build evidence).*

### Previous Release — `stable-invoice-confirmation-dialog-layering-fix-v1` (`96651b3`, 2026-07-20)

Bug fix: the invoice save-confirmation dialog (introduced by Invoice Creation Reliability & Confirmation
Pack v1) rendered behind the Create Invoice window instead of above it, making it unusable.

- **Root cause:** the confirmation dialog (ExplorerKit `Dialog`, z-index 410) and the Create Invoice window
  (legacy `Modal`, z-index 500) are both non-portaled `position: fixed` overlays in the same stacking context.
  The app's documented z-index ladder deliberately puts the legacy `Modal` *above* ExplorerKit `Dialog`/`Drawer`
  (for the reverse case — a Modal-style confirmation over an ExplorerKit-hosted form); `CreateInvoice.tsx`
  needed the opposite relationship, which the hierarchy didn't yet support. No portal or stacking-context trap
  was involved — verified clean on every ancestor. A related defect was also found and fixed: `Modal` and
  `Dialog` each register an independent `document`-level Escape listener, so a single Escape press with the
  confirmation open closed both layers at once instead of just the top-most one.
- **Fix:** added an opt-in `elevated` prop to ExplorerKit's `Dialog`, backed by a new centralized
  `--z-dialog-elevated: 510` token in the existing documented z-index ladder (500 Modal → 510 elevated Dialog →
  550 Popover → 600 Tooltip → 9999 toasts) — no arbitrary z-index, every other `Dialog` usage across the app is
  unaffected. `CreateInvoice.tsx`'s confirmation dialog now passes `elevated`; the underlying `Modal`'s
  `onClose` is guarded to a no-op while the confirmation is open.
- **Scope guarantee:** 4 files (+25/−2; 0 added, 4 modified). Feature branch
  `feature/invoice-confirmation-dialog-layering-fix-v1` (kept, pushed). Feature commit `846491e`, merge
  commit `96651b3`.
- **Validation:** frontend `tsc --noEmit` ✅ · frontend build ✅ (both pre-merge and on merged HEAD) · zero
  backend files touched. No business logic, accounting/GL logic, or database schema change — focus trap,
  Tab-cycling, Escape (now correctly scoped), and RTL all unchanged. Gemini final review: **APPROVED**.
  *Confidence: High (this pass's own git/build evidence).*

### Previous Release — `stable-invoice-creation-reliability-confirmation-pack-v1` (`ac2b6bd`, 2026-07-20)

Two reliability/UX guarantees for invoice creation: an issue date can never be in the future (enforced at
every layer, not bypassable via direct API), and a save click can never silently create the wrong invoice
(mandatory confirmation summary before the record is actually created).

- **Future-date prevention:** one shared `isNotFutureIssueDate` Zod refine (`invoices.schema.ts`) applied to
  both `createInvoiceSchema` and `updateInvoiceSchema` — `issueDate <= endOfDay(now)`, reusing the same
  `endOfDay` helper already used by the invoices list-filter. Enforced by the existing `validate` middleware
  ahead of every create/update route, so no entry point — standard form, edit form, fast-entry dialog, or a
  direct API call — can bypass it. Mirrored client-side (UX only, not the real guarantee): `max` date bound
  on the issue-date picker plus an early pre-save check with a clear Arabic message, across `CreateInvoice.tsx`,
  `EditInvoice.tsx`, and `invoiceFastEntry.validateInvoiceRow()`. Live-verified accept/reject on both create
  and update; today and any past date remain accepted.
- **Save confirmation dialog:** `CreateInvoice.tsx`'s "حفظ" now validates and stages the payload instead of
  posting immediately, then opens an ExplorerKit `Dialog` (RTL, focus-trapped, Escape/backdrop-cancel — all
  pre-existing ExplorerKit behavior) summarizing invoice number, party, issue date, item count, and total.
  `POST /invoices` fires only from the dialog's explicit confirm button. Scoped to the standard create flow
  only — the fast-entry accelerator intentionally keeps its no-confirmation rapid-entry design (it only
  gained the future-date guard), since a per-row confirmation would defeat its purpose.
- **Prior test-data cleanup:** the test invoice used to investigate an earlier "audit log without visible
  invoice" case (`MN-INV-2026-0221`, id 49) and every artifact it produced were permanently deleted ahead of
  this release, verified to leave zero orphans and zero impact on any other record — a direct one-off data
  operation, not part of this release's commit.
- **Scope guarantee:** 6 files (+97/−21; 0 added, 6 modified). Feature branch
  `feature/invoice-creation-reliability-confirmation-pack-v1` (kept, pushed). Feature commit `b495628`,
  merge commit `ac2b6bd`.
- **Validation:** backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ (pre-merge and on merged HEAD) ·
  frontend build ✅ · backend vitest invoices module — **160/160 tests pass**, zero regressions · live
  Zod-schema verification of the future-date refine. No business logic, accounting/GL/posting logic, or
  database schema change. Manual visual review: **APPROVED** (Product Owner). Gemini final review:
  **APPROVED**. *Confidence: High (this pass's own git/build/test evidence).*

### Previous Release — `stable-global-smart-overflow-tooltip-pack-v1` (`ce106b4`, 2026-07-20)

Replaces the app's ad-hoc, per-component reliance on the native `title=` attribute for truncated text
with a single reusable global tooltip system built once and mounted once — zero page-level integration.

- **Architecture:** one provider, `frontend/src/components/tooltip/GlobalOverflowTooltip.tsx`, mounted
  exactly once in `main.tsx`. A single delegated `pointerover`/`pointerout`/`focusin`/`focusout`/`keydown`
  listener set on `document` (plus `scroll`/`resize` on `window`) — no per-element listeners, no
  `ResizeObserver`, no polling, no upfront DOM scan.
- **Detection:** `overflowDetection.ts` walks up to 5 ancestors from the hovered/focused element on-demand,
  matching the nearest one whose `scrollWidth/scrollHeight` exceeds its `clientWidth/clientHeight` while
  computed `overflow` is `hidden`/`clip` (excludes intentionally-scrollable containers such as virtualized
  lists, which use `auto`/`scroll`) and whose own height is under a 160px cap (excludes large scroll-locked
  containers like open Drawers/Dialogs). Text priority: `data-tooltip-text` override → the element's own
  `title` → `textContent`. Opt-out via `data-tooltip-disable`.
- **Native title interplay:** an existing `title` attribute is stashed and removed while the custom tooltip
  is shown, then restored on hide — no double tooltip, and the app's pre-existing `title`-based fallback
  (64+ usages, e.g. DataTable's `.dt-truncate` cells) still works unmodified without any code change,
  including if JavaScript were ever unavailable.
- **Design:** ExplorerKit-consistent — white surface, thin border, soft shadow, 8px radius, dark-mode-aware
  via existing theme tokens, RTL/LTR-aware alignment, 120ms fade-in respecting `prefers-reduced-motion`,
  `pointer-events: none`, viewport-clamped auto-flip positioning, hidden under `@media print`. New
  `--z-tooltip: 600` token added to `theme.css` (above Popover 550, below toasts 9999).
- **Scope guarantee:** 5 files (+308/−1; 3 added, 2 modified — `main.tsx` and `app/theme.css` only).
  Feature branch `feature/global-smart-overflow-tooltip-pack-v1` (kept, pushed). Feature commit `41f93cf`,
  merge commit `ce106b4`.
- **Validation:** frontend `tsc --noEmit` ✅ (pre-merge and on merged HEAD) · frontend build ✅ · zero
  backend files touched. No business logic, backend, API, database, calculation, or workflow change.
  Manual visual review: **APPROVED** (Product Owner). *Confidence: High (this pass's own git/build evidence).*

### Previous Release — `stable-employee-entitlements-executive-redesign-v1` (`56f18d4`, 2026-07-19)

Visual-only redesign of the Employee Entitlements Center page (`pages/EmployeeEntitlementsCenter.tsx`)
from an approved HTML mockup, to Microsoft Dynamics 365 / SAP Fiori / Oracle Fusion Cloud ERP quality.
Built entirely on the existing ExplorerKit design system — no new components, no parallel UI system.

- **Executive header:** subtle radial tonal accent wash + larger title; employee info strip restyled
  into a 3-field label-over-value layout with vertical dividers.
- **KPI hierarchy:** the same 8 `MetricCard`s (unchanged props) regrouped into 4 larger primary tiles
  (الاستحقاق القانوني الإجمالي، رصيد الإجازة الحالي، قيمة بدل الإجازة، مكافأة نهاية الخدمة) and 4 denser
  secondary tiles (عطل رسمية مستثناة، إجازة مرضية مستثناة، الإجازة المستخدمة، إجمالي الدفعات المقدَّمة).
  The shared `.ent-kpis` class used by the employee-drawer summary tab is untouched.
- **Leave balance settlement:** reconciliation connectors restyled as chained circular badges instead of
  floating arrows; the net-used subtotal row gets a weight-only emphasis (no new color).
- **Advance payment settlement:** dashed-divider mini-flow with the final balance highlighted.
- **Historical ledger:** journal-style header tint on the disbursed-entitlements table only.
- **Timeline, empty states, collapsible sections:** page-scoped density/icon-tile/hover/fade-in polish.
- **Scope guarantee:** every CSS rule is scoped under `.entc-page` or to classes verified exclusive to
  this page's own rendering — no shared/global `.xpl-*` ExplorerKit rule was modified, so no other page
  using the same components changed appearance. 3 files (+202/−30; 0 added, 3 modified). Feature branch
  `feature/employee-entitlements-executive-redesign-v1` (kept, pushed). Feature commit `cf2f3be`, merge
  commit `56f18d4`.
- **Validation:** frontend `tsc --noEmit` ✅ · frontend build ✅ (page CSS chunk +4.02 kB / 1.22 kB gzip,
  no new JS logic) · zero backend files touched. Manual visual review: **APPROVED** (Product Owner).
  *Confidence: High (this pass's own git/build evidence).*

### Previous Release — `stable-al-ojairi-integration-pack-v1` (`70fa096`, 2026-07-19)

Completes the Kuwait Hijri holiday generation pipeline that Kuwait Holiday Intelligence Pack v1 (2026-07-19,
`75ed8c3`) left as an architecture-only stub — `HijriHolidayService` previously always returned `[]`.

- **Data source (offline, deterministic):** `backend/src/modules/employee-entitlements/holidays/hijriCalendarConversion.ts`
  implements the tabular/civil Islamic calendar ("Kuwaiti algorithm") — fixed epoch (Julian Day 1948440) + the
  standard 11-leap-years-per-30-year cycle, composed with the standard Fliegel & Van Flandern Julian-Day↔Gregorian
  conversion. No network call, no bundled dataset — mathematically verified against the public epoch correspondence
  (1 Muharram 1 AH = 19 July 622 CE) and structural invariants (leap-year count, monotonicity, round-trip
  integrity). No future Gregorian date is hardcoded; only fixed Hijri month/day *facts* are constants
  (`kuwaitHijriHolidayDefinitions.ts`).
- **Hijri Provider:** `HijriHolidayService.generateExpectedHijriHolidays(year)` covers Islamic New Year, Prophet's
  Birthday, Eid Al-Fitr, Arafat Day, Eid Al-Adha; every candidate is `origin: 'HIJRI'`, `status: 'EXPECTED_ALOJAIRI'`
  by construction — never `OFFICIAL`. `HolidaySourceProvider.generateForYear()` now returns
  `{ candidates, warnings }` instead of a bare array, so unsupported years / provider failures surface as
  structured warnings instead of throwing.
- **Holiday Engine evolution:** new static `HolidayEngine.generateCandidates(year, providers?)` is the **only**
  place in the system that calls a provider's `generateForYear` — `HolidayGenerationPlanner` no longer iterates
  providers itself. Each provider call is individually try/caught, so one provider's failure never blocks another's
  output. Every pre-existing `HolidayEngine` calendar-math method is unchanged.
- **Supported range:** Gregorian 2020–2050 (`SUPPORTED_HIJRI_GENERATION_YEARS`) — a deliberate practical
  HR-planning window, not a mathematical limit; widen by editing one constant.
- **Extension mechanism:** a future holiday source needs only a `HolidaySourceProvider` implementation + one entry
  in `DEFAULT_HOLIDAY_PROVIDERS` — no change to `HolidayEngine`, the planner/executor, `compareHolidayYear`, or the
  frontend dialog.
- **Status persistence, no schema change:** `classifyHoliday()` now parses an optional `[ORIGIN:STATUS]` tag
  already written into the existing `notes` column by `HolidayGenerationExecutor`, so a generated Hijri holiday's
  `EXPECTED_ALOJAIRI` status survives read-back instead of falling back to the old date heuristic.
- **Scope guarantee:** 22 files (+771/−95; 4 added, 18 modified). No change to Rule 2, Rule 5, EOS, Leave
  Settlement, Historical Ledger, Prisma schema, API contracts (additive `warnings` response field only), or
  permissions. Feature branch `feature/al-ojairi-integration-pack-v1` (kept, pushed). Feature commit `43cd699`,
  merge commit `70fa096`.
- **Validation:** backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · backend vitest **132 files / 1845 tests**
  ✅ (23 new, zero regressions) · frontend build ✅. *Confidence: High (this pass's own git/test evidence).*

### Latest Release (previous audit pass) — `stable-stability-performance-pack-v1` (`d6ec309`, 2026-07-02)

Frontend-only release of two independently Gemini-APPROVED packages, merged `--no-ff`.

- **Stability & UX Safety Pack – Phase 1 (Error Boundaries):** new `RootErrorBoundary` (ExplorerKit fallback — Retry, Back-to-Home, Copy technical details, developer details, console logging, dark/light, a11y) wired at app root (`main.tsx`) and page level (`Layout.tsx` `<Outlet/>`, `resetKey={pathname}` → auto-recovery on navigation). Pre-existing scoped `ErrorBoundary` untouched.
- **Frontend Performance Pack – Phase 1 (route code-splitting):** all ~55 routes → `React.lazy` + `Suspense` (ExplorerKit `PageLoader`); Login/Layout/ProtectedRoute eager. Vite `manualChunks` (`vendor-react/charts/xlsx/docx/zip/qrcode`). **Initial startup JS 3.25 MB → ~356 KB raw (−89%; 846 KB → ~110 KB gzip); 81 chunks; ~1.32 MB of libraries deferred.**
- **Scope guarantee:** zero business-logic / DB / Prisma / backend / API / auth / RBAC / printing / Electron / dependency changes. **Files: 10** (+657/−121). Feature commit `f4aeff6`; checkpoint (rollback) tag `pre-stability-performance-pack-v1` @ `473c724`.
- **Validation:** frontend tsc ✅ · frontend vitest 638/638 ✅ · build:front ✅. Backend/electron untouched (not re-run).
- **Remote:** push of `d6ec309` + tags **pending** — finalized locally in an offline environment. *Confidence: High.*

### Workflow (as practiced, from CLAUDE.md + tag evidence)

Feature branch → checkpoint (`pre-*`) tag → implement → validate → Gemini review → merge `--no-ff` into `production` → `stable-*` tag → update PROJECT_STATE. The dense `pre-*`/`stable-*` pairing across every feature family confirms this discipline was followed consistently.

### Architecture

```
manarERP/
├── electron/    Main process: window, IPC bridge (window.manar.*), backend launcher, node-cron backup scheduler, PDF export IPC
├── frontend/    React + Vite renderer (HashRouter, file:// compatible), Zustand, Axios (JWT), Recharts/Chart.js
├── backend/     Express REST API on 127.0.0.1:48211 (child process), Zod validation, RBAC middleware, PDFKit/ExcelJS
├── backend/prisma/  SQLite schema + 37 migrations
└── docs/        Arabic documentation + ADRs + planning
```

Data flow: Electron forks backend → React calls `http://127.0.0.1:48211/api` → Prisma reads/writes SQLite.
Auth: JWT (12h) → localStorage → Axios `Authorization: Bearer` → `authenticate` → `requirePermission`.
IPC: `electron/preload.ts` exposes `window.manar.*` via contextBridge (context isolation on).

*Confidence: High (CLAUDE.md + confirmed module/IPC evidence).*

### Technology Stack (from CLAUDE.md — authoritative)

| Layer | Tech |
|---|---|
| Frontend | React 18.3.1, TypeScript 5.5, Vite 5.3, React Router 6.24 (HashRouter), Zustand 4.5, Axios 1.7, Recharts 3.8 / Chart.js 4.4 |
| Backend | Express 4.19, TypeScript 5.5, Prisma 5.18, SQLite, jsonwebtoken 9, bcryptjs 2.4, Zod 3.23, Helmet 7.1, ExcelJS 4.4, PDFKit 0.15, Vitest 2.0 |
| Desktop | Electron 31, electron-builder 24 (NSIS), node-cron |

---

# Completed Modules (by category)

Legend — **Status**: ✅ Production / 🟡 Partial / 🔵 Future-phase pending / ⬛ Superseded.
Completion % is an **evidence-based estimate** (from tag coverage + route/sidebar wiring + tests), not a measured metric.

## Accounting & Finance — ✅ Production
| Module | Status | ~% | Notes |
|---|---|---|---|
| `accounting` / `transactions` | ✅ Stable | 100% | GL journal entries, ledger, P&L |
| `financial` | ✅ Stable | 100% | GL Report, Trial Balance, Aging, Journal Book, Financial Summary/Dashboard (11 routes) |
| `statements` | ✅ Stable | 100% | Customer & Supplier statements, shared `buildStatement()` engine, exports |
| Contract profitability / receivables | ✅ Stable | 100% | `contract-profitability-phase1`, `financial-receivables-phase1` |
| Purchase-invoice GL (H1) | ✅ Stable | 100% | `postPurchaseInvoiceToGL` + payment posting + reversal + `/invoices/:id/approve` |
| Payroll → GL double-entry | ✅ Stable | 100% | **Verified in code (2026-07-12):** `payroll.service.markPaid()` → `postPayrollToGL()` → `createBalancedJournal()`. Posts on **PAID**, not on approve. The previous "UNKNOWN" verdict was wrong. |

## Invoices & Expenses — ✅ Production
`invoices` (edit/delete, force-delete, preview/print, UX phase 2, customer-price filter, cheque-image collection print), `expenses` (enhancement A, attachments, accounting integration). Both ExplorerKit-migrated. **100%.**

## Customers / Suppliers / Contracts / Prices — ✅ Production
ResourcePage-driven (ExplorerKit `explorer:true`): customers, suppliers, contracts ("Agreements" UI label), equipment, employees. Force-delete guards for all. Project Prices phases 1–3 + smart lookup. **100%.**

## HR: Payroll / Salaries / Attendance — ✅ Production
`payroll` (generation engine: preview/generate/payslip/allowances/deductions/advances/approve/pay), `salaries` (payment records + bank analytics + bank import services — **distinct module, not a rename**), `attendance` (UI completion + pagination). **100%** for shipped scope.

## Equipment / Maintenance / Inventory — ✅ Production
`equipment` (+plate integration, force-delete), `maintenance` (completion), `inventory` (phases A/B/C + system). ExplorerKit-migrated. **100%.**

## Cheques — ✅ Production
Management, tafqeet (spelled amount), print output, Gulf Bank calibration, professional calibration pack, calibration UX phase 2. ExplorerKit-migrated + `ChequeCalibrator`. **100%** (per-bank template stubs for beneficiary master / printer prefs are future).

**Default Cheque Print Provider v1** (`stable-default-cheque-print-provider-v1`, merge `83f2246`): the Cheques Management page now offers a permanent, Settings-backed choice of print provider. A `طريقة الطباعة` dropdown next to `طباعة الشيك` selects between the **Classic** provider (the original `ChequePrintOutput` pipeline, unchanged, still the default), **Cheque Template — Real 178×89mm**, and **Cheque Template — A4**; the two template options route through the Official Cheque Template System's existing Runtime Engine → `ChequeRenderSurface` pipeline (`/cheque-template/print`) — a lightweight selection layer, not a new print engine. A `تعيين كافتراضي` checkbox persists the choice via the existing Settings API (`cheques.defaultPrintProvider`, `PUT /settings`) — no schema change, no migration, included in DB backups — and it is restored automatically on page load; existing users see no behavior change (absent setting → Classic). The page's large decorative on-screen cheque-preview image was removed and the print/voucher/calibration actions consolidated into one toolbar, reclaiming vertical space for the cheque table (Workspace Refresh v1; columns/logic/sorting/filtering unchanged). Also introduces **A4 Surface Mode** for the Official Cheque Template System: a second presentation surface (`ChequeA4Sheet`) that places the identical cheque render surface, unresized and undraggable, at a fixed centered/right-anchored printer-safe position on an A4 landscape page — reusing the same model/engine/renderer as Real-Cheque mode. A companion fix corrected an invalid `@page` CSS declaration (explicit two-length size + `landscape` keyword, disallowed by the CSS Paged Media spec) that was causing Chromium/Windows to silently default to Portrait for A4 prints; A4 mode now uses the named `A4 landscape` page size. **Runtime Engine, `ResolvedRenderModel`, `ChequeRenderSurface`, `ChequePrintOutput`, Template Manager persistence, Semantic Data Binding, Classic Calibration and the Professional module are all unchanged.** Product Owner visual review + Gemini review approved. Single-page print fix (collapse in-flow app shell in `@media print` so only the fixed cheque paginates) + **SYSTEM_ADMIN force delete** workflow (`GET/DELETE /cheques/:id/force`, exact cheque-number confirmation, transactional delete, bank-statement match rows un-matched not broken, audit `DELETE`+`forceDelete:true`, `ForceDeleteChequeModal`) — `stable-cheques-force-delete-print-fix-v1`.

**Calibration test sheet — in-app preview overlay** (`stable-cheque-calibration-test-preview-overlay-v1`, merge `d9d7d7e`): the «اختبار المعايرة» action now opens an **additive preview overlay** of the calibration test sheet instead of printing immediately; the operator inspects and zooms it, and only the preview's «طباعة» button prints. **The print path is unchanged** — the preview closes and delegates to the same `printCurrentView()` call the button made before, reaching `webContents.print` through the untouched legacy path with the same geometry-derived `@page`, zero margin and 100% scale. **Single source of truth:** the sheet is rendered once into the hidden `.chq-calib-testprint` layer; `composeCalibrationTestDocument()` serialises *that very node* for the preview and `printCurrentView()` prints *that very node* — no second document generator, no duplicated SVG, no preview-only geometry, no looser preview-side validation. No style capture is needed because the sheet has **zero CSS dependency** (all SVG presentation attributes in a millimetre viewBox). The shared `PrintPreviewDialog` gained optional `pageWidthMm`/`pageHeightMm`/`title` props whose defaults preserve the A4 derivation for every existing caller, so a SYSTEM_ADMIN paper-size change moves the preview box and the `@page` rule together. Gated by the independent flag `CHEQUE_CALIBRATION_TEST_PREVIEW_V1` (default ON; off ⇒ the button prints directly as before). **Cheque geometry, calibration mathematics, calibration persistence, template versioning, restore-defaults, print logs, reprint rules and real cheque printing are all unchanged; frontend only; no schema change, no migration, no API change.** Known deliberate limitation: the Calibration **Wizard**'s own print steps still print directly. Manual visual review + **physical print UAT approved**.

**Calibration test sheet — four-edge ruler, feed-edge anchor & centre cross** (`stable-cheque-calibration-edge-ruler-v1`, merge `caf7d4a`): the printed calibration sheet gains four true-millimetre SVG centimetre rulers (1/5/10 mm ticks, Western digits, programmatically generated), an exact full-page centre cross derived from the active geometry (148.5 × 105 mm on A4 landscape) painted behind the rulers, a bilingual feed-edge indicator, and a polished 10 cm (100 mm) physical scale reference. **Root-cause fix:** the drawn cheque outline was anchored from the LEFT paper edge because it reused `offsetXMm` — which is the print engine's *translate offset* consumed by `fieldMm()`, not the cheque's position on paper. The outline is now anchored to the **RIGHT feed edge** via `chequePaperLeftMm()` = `pageWidth − chequeWidth − rightOffset`, with no mirroring and no change to cheque-local coordinates. `@page` size now derives from the active geometry so Chromium cannot silently scale the sheet. A deterministic consistency diagnostic (`fieldsOutsideCheque`) is kept in code and tests but deliberately **not rendered**. The regression guard against the previously-failed CSS-background ruler technique was **retargeted, not weakened**. **Real cheque printing, stored offsets, templates, DB data, print logs and print-count behaviour are unchanged; no migration.** Gemini APPROVED; physical print UAT approved.

## Reports — ✅ Production
Reports Center v1 → phase 7, export standardization, Unified Report Engine phase 3 (7 pure template modules). **100%.**

## Executive Dashboard & Intelligence — ✅ Production
General + Financial dashboard tabs, Executive Intelligence bundle 1/2, Executive Decision Center (health score, KPI timeline, alerts V3, recommendations), Financial Operations Dashboard, today's Executive Daily Summary polish. **100%** (all deterministic analytics — see AI section).

## Settings / i18n / Translation Dictionary — ✅ Production
Settings Center (ExplorerKit refresh), i18n phases 1–5 (AR/EN), Translation Dictionary editor (nationalities/job titles), print branding keys. **100%.**

## Security / RBAC / Backup / Audit — ✅ Production
Roles-permissions (7 roles, ~100 permission keys), JWT secret hardening, critical hardening + stabilization audit sprints, backup/restore + auto-backup + SHA-256 verification, audit log viewer. **100%.**

## Document Expiry / Data Import / Attachments — ✅ Production
Document Expiration Center + dashboard widget (Ops Suite B), Data Import (7 entities; phases 1/3/3c + expansion + xlsx hardening + dynamic tabs), Attachments (multer + Electron IPC, Ops Suite E). **100%** (Data Import Phase 4 grouped-row engine is future).

## Approval Workflow — 🟡 Partial
`approval` **Phase A** only: `ApprovalEngine` singleton + `ApprovalHistory` model + history endpoint. **Phase B (register Expenses/Payroll/Invoices) not implemented.** ~**50%.**

## Banking — ✅ Production (see Banking Status)
**Company Settings Final Visual Polish v1 — PRESENTATION-ONLY** (`stable-company-settings-final-visual-polish-v1`, merge `7ec29c4`; feature commit `5ff3e65`): polish pass over the Company Settings screen. **2 files only** (`frontend/src/pages/Settings.tsx` + `Settings.css`, +408/−103); every CSS rule is **scoped to `.settings-center`**, so nothing reaches another screen. Vertical rhythm ~12% tighter at every level (page, cards, fields, labels) with line height and hit areas untouched; header title leads and subtitle recedes; the five summary cards get one height/padding and a value-first weight (tones, order, data unchanged); section tabs sit in a shorter bar; cards, fields and buttons share one visual language. **Button-hierarchy defect fixed:** the signature/stamp/calibration buttons asked for `btn-secondary` / `btn-danger` — **classes that exist in no stylesheet** — so they all rendered as full primary blue («تغيير الختم» and «حذف الختم» were visually identical); they now use `secondary` / `danger`, restoring primary/secondary/destructive with **no handler, label or order change**. Signature and stamp get real preview stages (≥104px / ≥112px) with light borders instead of the heavy frame and 60px thumbnail — `object-fit: contain` scales the view only, so **the stored files and their real dimensions are untouched**, as are upload, delete, show-in-documents and save. Template Studio's decorative gradient becomes a light tint of the **existing** indigo token. The translation dictionary becomes an enterprise data grid (sticky header, row hover, fixed action column with an icon delete button, hover/focus cell inputs, a real "add row" action) with **the same component, rows, handlers, search, filter and columns**; its delete button carries `aria-label="حذف الصف"`. **Deliberately not added** (would be new functionality): the status column, per-row edit button and pagination shown in the reference mock. The sidebar was not touched (global component; its active item already matched). **No business logic, API, backend, Electron, Prisma, route, state, feature-flag, printing or dependency change.** Tests: frontend **1560/1560** · Electron **71/71**; three tsc gates and both builds pass. Manual visual review approved (1920×1080 and smaller, light and dark, RTL and LTR, all six sections).

**Collapsible Sidebar Workspace Pack v1 — UI/UX ONLY** (`stable-collapsible-sidebar-workspace-pack-v1`, merge `49ef2df`; feature commits `8b8f682` + `900ffc1`, released 2026-07-14): the main sidebar now collapses to a **72px icon rail** and expands back to **248px**, giving dense table screens the horizontal room they were missing (measured in the running app: content 1443px → 1619px, no horizontal scrollbar). **One source of width** — `uiStore` writes `data-sidebar` on `<html>` **before the first paint**, CSS flips `--sidebar-width`, and both the sidebar and the content read that same variable, so there are no per-page offsets and no layout jump at startup. **Persistence:** `manarERP.sidebar.mode`; any value that is not exactly `'collapsed'` falls back to `'expanded'`. A **narrow window (≤1200px)** collapses the rail for the session **without overwriting the saved preference**; below 900px the pre-existing drawer takes over and always opens expanded. **Collapsed rail:** icons centred, active item still marked, each label **stays in the DOM** (visually hidden, not removed) so screen readers keep it, and a tooltip shows the name on hover and on keyboard focus — rendered outside `.nav` (which scrolls and would clip it), pointing into the content area in both directions, above tables and drawers, never intercepting a click, and `aria-hidden` (a visual echo, not the only way to navigate). **Active item refined:** the `stitch-full` shell forces a saturated blue fill plus a large shadow in dark mode, which at 72px read as a CTA square competing with the collapse button; in the rail it is now a low-intensity indigo surface (44×44, radius 11px, **no gradient, no glow, no shadow**) with a 3px indicator on the content-facing edge (`inset-inline-end` — left in Arabic, right in English). **The expanded sidebar is unchanged.** **Logo:** no new asset — the emblem's bounds were measured on both logo files (ends at 25.5% of the width; the company name starts at 29.6%), so the rail shows a 27.5% window of the *existing* file: full emblem, no cropped letters, aspect ratio preserved. **Accessibility:** a real `<button>` with `aria-expanded` and a label that switches between «طي القائمة الجانبية» and «توسيع القائمة الجانبية» in both languages, decorative icons `aria-hidden`, visible focus ring, motion limited to 180ms width/margin with `prefers-reduced-motion` respected. **RTL/LTR** via logical properties (rail right in Arabic, left in English; the chevron derives from language AND state). **No sub-menu flyout, deliberately:** `NAV` is flat groups of links with no sub-items. **Unchanged:** navigation logic, `NAV` and its permission filtering, routes, active-route detection, print rules, backend, Prisma, the database, and every other screen. **No business logic, API, backend, Prisma, permission, routing, printing or dependency change.** Frontend only (6 files: 4 modified, 2 added; +605/−6). Tests: **frontend 1575/1575 · Electron 71/71**, incl. 15 new ones (default, toggle, persistence, restore, corrupted storage, label visibility vs accessible name, tooltip in collapsed only, unchanged links + permission filtering, active item, arrow direction per language, narrow window not overwriting the preference). **Known pre-existing limitation (not introduced here):** the <900px drawer uses `transform: translateX(100%)`, which is not direction-aware in LTR.

## Printing — ✅ Production (see Printing Status)

**Additive Universal True Chromium WYSIWYG Preview v1 — ACCURATE PREVIEW NOW COVERS 14 MORE FORMS, ENABLED BY DEFAULT** (`stable-additive-universal-true-chromium-preview-v1`, merge `9fe94c8`; feature commit `6ee5e6a`, default-enablement commit `01c9cd7`): extends the invoice's Accurate Preview to **طلب إجازة · طلب شراء · سند صرف · إنذار موظف · استقالة · مباشرة عمل · سلفة راتب · شهادة راتب · إلى من يهمه الأمر · تقييم أداء · قسيمة راتب · عقد عمل · عرض سعر (Engine + Legacy) · سند قبض**. **Additive only:** every form keeps its existing print button, its existing preview and its existing print path — nothing replaced, nothing deleted, no print system restructured. Each form composes **the same document source its print path already uses**, not a copy: the ten FormLayout forms use `.form-page` + `FormLayout.doPrint`; Payslip and Employment Contract use their own `printRootRef` + print function; Quotation and Receipt Voucher keep their **own** composers and page specs (`composeQuotationPreview`; `composeFromNode` + `RECEIPT_VOUCHER_PAGE_SPEC`). The preview is **Chromium's real paginated document** via `webContents.printToPDF`, shown in Chromium's own PDF viewer with **`#toolbar=0`** and the manarERP-owned zoom toolbar — **no PDF.js, no custom viewer, no second print engine, no `srcdoc` approximation, no manual page-break simulation**. Implementation is one shared hook (`useAccurateFormPreview` — returns only a button and a dialog) plus **one optional prop** on `FormLayout` (`onPrintApiReady`); **`doPrint` itself is unmodified** (read through a ref). The dialog is the invoice's own `WysiwygPreviewPocDialog`, not a fork — its only change: `onFallback` became optional. **Flags: `UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 = true`** (these 14 forms) and **`TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC = true`** (the invoice) — **independent**; flag off ⇒ no button, no dialog, no listener, and the forms are byte-for-byte what they were. **Excluded and documented:** cheques, the calibration studio and its test sheet (millimetre printer offsets), bank reconciliation, bank salary analytics, Excel/spreadsheet outputs. Frontend only (20 files: 18 modified, 2 added; +886/−33) — no Electron, backend, Prisma, schema, API, permission or dependency change. Tests: **frontend 1560/1560 · Electron 71/71**, incl. 50 new ones asserting the composed document carries the form's current data, that Print delegates to the legacy function exactly once, that closing changes no form data, and that a generation failure — or a missing Electron bridge — never blocks printing; **smoke-tested in the running app over CDP** (real `blob:…#toolbar=0&zoom=100` PDF; `override='off'` hid only the new button). **Emergency rollback without a release:** `localStorage.setItem('manar:flag:UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1', 'off')`. Accepted limitations: Escape does not close the dialog once focus enters PDFium (Close button always works); zoom returns the document to page 1; **`#toolbar=0` must be re-verified on every Electron upgrade**. Future note (non-blocking, low priority): the shared dialog could later separate `title` from `documentLabel` — not done in this release.

**Controlled Invoice WYSIWYG Enablement & Zoom Controls v1 — INVOICE ACCURATE PREVIEW NOW ENABLED BY DEFAULT** (`stable-invoice-wysiwyg-enablement-zoom-v1`, merge `7c793ab`): completes the invoice WYSIWYG rollout. **`TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC = true`** is now the shipped default; the invoice screen exposes **«📄 معاينة دقيقة»** (Accurate Preview), showing **Chromium's real paginated document** — its own page breaks — from the same composed invoice via `webContents.printToPDF`, displayed by Chromium's own PDF viewer. **PDFium's native toolbar stays hidden (`#toolbar=0`)**, so its Print/Download bypasses remain unreachable, and PDFium does not act on Ctrl+P/Ctrl+S once its UI is hidden (re-verified with **real OS key injection** and focus **proven inside the plugin**; right-click exposes no menu). The **manarERP-owned toolbar** adds **Print · − · % · + · Fit · Reset · Close** in ExplorerKit styling (light + dark), with zoom **50/75/100/125/150/175/200** (default 100, clamped) and **Fit = `view=FitH`**. **Runtime corrective:** PDFium reads the URL fragment **only when a browsing context loads**, so mutating a live iframe's `src` did nothing (measured: page stayed **713px** wide at 100%, 125% *and* 175%); the iframe now carries a `key` tied to the derived viewer URL so React genuinely remounts it (**50% → 356px · 200% → 983px · Fit → fits width**). Zoom is a viewer concern only — **no PDF regeneration, no new Blob, no extra IPC, no new viewer token, and printed output is unchanged**. Also repaired (presentation-only): the print dialogs rendered **transparent** outside `.xpl-scope` (the invoice bled through the toolbar in both themes); surfaces are now opaque via the kit's own token mapping sourced from the global theme — which **also fixes the existing continuous preview**. **Unchanged:** the entire legacy print path (`printCurrentView`, `printService`, `dialog.ipc`, `pdf.ipc`, `utils/print`, `FormLayout`, `PrintPreviewDialog`, `composeDocument`), Chromium `printToPDF`, invoice calculations/business logic/template, backend, Prisma, schema; **no PDF.js, no custom viewer, no new dependency**. Frontend only (5 files). Tests: **frontend 1509/1509 · Electron 71/71**. **Emergency rollback without a release:** `localStorage.setItem('manar:flag:TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC', 'off')`. Accepted limitations: Escape does not close the dialog once focus enters PDFium (Close button always works); zoom returns the document to page 1 (PDFium cannot report page position); **`#toolbar=0` must be re-verified on every Electron upgrade**.

**PDFium Viewer Hardening v1 — WYSIWYG feature STILL DISABLED BY DEFAULT** (`stable-pdfium-viewer-hardening-v1`, merge `777219f`): closes the three viewer bypasses that stood between the WYSIWYG Preview POC and a controlled invoice pilot. Chromium's PDFium toolbar carried its own **Print** and **Download** buttons, and PDFium answered **Ctrl+P / Ctrl+S** itself — all three bypassed manarERP's official print path and its auditing / PrintJob semantics. Fixed by (1) hiding the native toolbar with the `#toolbar=0` open parameter (**not** an overlay or crop — nothing depends on a toolbar height), keeping the **raw Blob URL separate** from the viewer URL so `revokeObjectURL` still receives the original URL (a fragment-appended string is a different URL and would leak the invoice PDF); (2) suppressing **only** Ctrl/Cmd+P and Ctrl/Cmd+S, in the **main process** (`before-input-event` — a renderer listener cannot stop PDFium), and **only while a viewer session is active** (Alt is deliberately excluded: Windows reports **AltGr as Ctrl+Alt**, and an Arabic keyboard types real characters with it); (3) **viewer-session token ownership** — a stale close cannot disarm a newer viewer's guard, closing during activation releases the granted token, and a renderer crash or window close clears the state; (4) **flow-gating** `wysiwygPoc:generate` on an active viewer session (**flow gating, not an authorisation boundary** — a compromised renderer could self-activate; the code says so). Every decision is a pure, unit-tested function in `wysiwygViewerGuardPolicy.ts`. **`TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC` remains `false` — this release hardens the viewer, it does NOT enable the feature.** Unchanged: the entire legacy print path, Chromium `printToPDF`, invoice composition/templates, business/accounting logic, backend/Prisma; **no PDF.js, no custom viewer, no new dependency**. Tests: 71 Electron + 1489 frontend, all green; **human right-click check PASSED (no context menu inside the PDF viewer)**. Pre-pilot human checks outstanding: Ctrl+P/Ctrl+S inside the focused PDF, Escape, Ctrl+±, scrolling; re-verify `#toolbar=0` on every Electron upgrade.

**True Chromium WYSIWYG Preview POC v1 — EXPERIMENTAL, DISABLED BY DEFAULT** (`stable-true-chromium-wysiwyg-preview-poc-v1`, merge `aba9b9e`): an invoice-only proof of concept that displays Chromium's **real paginated output** — its own page breaks — by handing the SAME composed invoice document the existing Universal Print Preview already renders (`composeStyledFromNode`) to an isolated hidden Chromium worker and returning its `webContents.printToPDF` result, shown in Chromium's built-in PDF viewer via a `blob:` iframe. **No DOM measurement, no simulated pagination, no PDF.js, no second print engine, no duplicated invoice template.** Page counts matched an independent control (`printToPDF` of the live app page) on **6/6** real invoice cases. **The print path is unchanged** — the preview delegates to the legacy `printCurrentView()`, and `printService`/`pdf.ipc`/`dialog.ipc`/`utils/print`/`PrintPreviewDialog`/`composeDocument`/`FormLayout` are byte-for-byte untouched. Every risky decision (worker ownership, payload admission, request filtering, page counting) is a **pure, unit-tested** function in `electron/ipc/wysiwygPocPolicy.ts`; the worker runs in a dedicated in-memory session whose requests are filtered to `file:`/`data:`/`blob:`/`about:` (the dev exception for the Vite origin is **measured and required** — Vite serves Cairo as a URL in dev). **Flag `TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC` ships `false`: with it OFF the button does not render and production behaviour is unchanged.** **Blockers before it may ever be enabled:** (1) the PDFium viewer toolbar exposes native print/download controls that bypass the official print path; (2) the IPC channel is registered even while the UI flag is OFF. Tests: 46 Electron policy tests (`npm run test:electron`) + 20 renderer tests; frontend vitest 1477/1477. No backend/schema/migration/API change; no new dependency.
## ExplorerKit — ✅ Rollout complete for CRUD scope (see ExplorerKit Status)
## AI / Integrations — ✅ Deterministic scope complete; LLM/OCR future (see AI Status)

---

# Stable Release History (grouped by module)

All 220 stable tags, `date | tag | commit`. All are on `production`. Within phased families, earlier phases are **superseded-cumulative** (functionally rolled up into the latest phase); the family is Completed at its newest tag.

### Platform / Foundation
```
2026-06-07 | stable-dashboard-electron               | 84aa72d   (superseded baseline)
2026-06-07 | stable-manarerp-v1                       | 5caaeb9   (superseded baseline)
2026-06-07 | stable-dev-backend-watch                 | 945cfdd
2026-06-10 | stable-test-coverage-foundation-v1       | 0e29150
2026-06-13 | stable-full-operational-reset-v1         | 4727d10
```

### Accounting & Finance
```
2026-06-07 | stable-accounting-v1                     | 985eee3   (superseded)
2026-06-07 | stable-accounting-v2-f7d8dda             | f7d8dda   (superseded)
2026-06-14 | stable-financial-safety-tests-phase1-v1  | a3f2797
2026-06-16 | stable-accounting-integration-phase1-v1  | 191f7d1
2026-06-17 | stable-accounting-integration-phase2-expenses-v1 | 66dd499
2026-06-17 | stable-financial-integrity-pack-v1       | d2535be
2026-06-17 | stable-unified-financial-completion-pack-v1 | 9bc72cf
2026-06-21 | stable-financial-receivables-phase1-v1   | 5fdb792
2026-06-21 | stable-contract-profitability-phase1-v1  | 0ea7f12
2026-06-23 | stable-accounting-completeness-h1-v1     | 2c00c6b
2026-06-24 | stable-statement-center-phase1-v1        | 4ab4cac
2026-06-24 | stable-financial-center-phase2-v1        | c65da20
2026-06-27 | stable-financial-workflow-suite-phase2-v1 | 49089eb
```

### Reports
```
2026-06-07 | stable-reports-center-v1                 | 1c6a1e3   (superseded by phase7)
2026-06-17 | stable-export-standardization-pack-v1    | f532347
2026-06-25 | stable-unified-report-engine-phase3-v1   | a6029e3
2026-06-28 | stable-reports-center-phase7-v1          | 4c7669c
```

### Dashboard / Executive
```
2026-06-07 | stable-executive-dashboard-v2            | 97f9a20   (⬛ superseded)
2026-06-12 | stable-executive-dashboard-v3a-lite-v1   | 04c9fb5   (⬛ superseded)
2026-06-21 | stable-dashboard-flicker-hotfix-v1       | 04b9289   (hotfix)
2026-06-21 | stable-executive-intelligence-bundle-phase1-v1 | 140d010
2026-06-21 | stable-executive-intelligence-bundle-phase2-v1 | 9f64c22
2026-06-22 | stable-executive-decision-center-phase1-v1 | d257db0
2026-06-27 | stable-dashboard-financial-fix-v1        | b27e489   (fix)
2026-07-01 | stable-executive-dashboard-polish-phase1-v1 | e38f65e
```

### Security / RBAC / Backup / Audit
```
2026-06-07 | stable-backup-restore-v1                 | 841d779
2026-06-07 | stable-roles-permissions-v1              | b8d55f7
2026-06-09 | stable-audit-log-viewer-v1               | 372e657   (superseded by phase1)
2026-06-14 | stable-auto-backup-phase1-v1             | 4c8783a
2026-06-14 | stable-auto-backup-enhancements-phase1-v1 | 76d60ee
2026-06-14 | stable-jwt-secret-hardening-v1           | b4b691e
2026-06-15 | stable-audit-log-viewer-phase1-v1        | 6d622c0
2026-06-21 | stable-critical-hardening-sprint1-v1     | b2dec35
2026-06-21 | stable-stabilization-audit-sprint1-v1    | 767e90b
```

### Payroll / Salaries / Attendance
```
2026-06-08 | stable-payroll-system-v1                 | fd873f8
2026-06-10 | stable-attendance-ui-completion-v1       | f55c65e
2026-06-11 | stable-attendance-pagination-v1          | 90cab98
```

### Equipment / Maintenance / Inventory
```
2026-06-08 | stable-inventory-phase-a-v1              | a462dd8   (superseded)
2026-06-08 | stable-inventory-phase-b-v1              | 5d17d1b   (superseded)
2026-06-08 | stable-inventory-phase-c-v1              | 971a818   (superseded)
2026-06-08 | stable-inventory-system-v1               | 1301dc3
2026-06-10 | stable-equipment-maintenance-ui-v1       | 80dc387
2026-06-10 | stable-maintenance-completion-v1         | 35d8f79
2026-06-12 | stable-equipment-plate-integration-phase1-v1 | 442e057
2026-06-13 | stable-equipment-force-delete-phase1a-v1 | 907301d
```

### Customers / Suppliers / Contracts / Prices
```
2026-06-10 | stable-contract-unit-price-company-v1    | 16c419c
2026-06-10 | stable-project-prices-phase1-v1          | 8875359
2026-06-11 | stable-project-prices-phase2a-v1         | 88ec446
2026-06-11 | stable-project-prices-phase2b-v1         | b3603ad
2026-06-12 | stable-project-prices-phase2c-v1         | 9076fab
2026-06-12 | stable-project-prices-phase3-v1          | f33de19
2026-06-12 | stable-prices-lookup-cleanup-v1          | cbadd1d
2026-06-12 | stable-contracts-price-binding-v1        | 82f361c
2026-06-12 | stable-archive-override-phase1a-v1       | 79baeb5
2026-06-13 | stable-customer-force-delete-phase1b-v1  | 9f8f3c0
2026-06-13 | stable-suppliers-force-delete-phase2a-v1 | 3f65fe8
2026-06-13 | stable-contracts-force-delete-phase2b-v1 | 3002ea4
2026-06-13 | stable-prices-force-delete-phase2c-v1    | 1d092d2
2026-06-16 | stable-agreements-refactor-phase1-v1     | d717451   (contracts UI relabel)
2026-06-17 | stable-agreements-refactor-phase2-v1     | 009e3c5
2026-06-17 | stable-customer-quality-pack-v1          | 0269c2e
```

### Invoices / Expenses
```
2026-06-15 | stable-invoice-unit-options-custom-v1    | 7112719
2026-06-15 | stable-invoice-date-billing-month-v1     | 545d2fe
2026-06-15 | stable-invoice-edit-delete-v1            | be10bf8
2026-06-15 | stable-invoice-preview-print-page-v1     | 3c31db5
2026-06-15 | stable-invoice-preview-print-hotfix-v1   | 406d87a   (hotfix)
2026-06-15 | stable-invoice-preview-cleanup-v1        | ec7997f
2026-06-15 | stable-invoice-force-delete-v1           | cc6c5a9
2026-06-16 | stable-invoice-ux-improvements-v1        | 0aa3c13
2026-06-16 | stable-invoice-conflict-hotfix-v1        | 681c4ac   (hotfix)
2026-06-16 | stable-invoice-journal-entry-collision-hotfix-v1 | 8a57410 (hotfix)
2026-06-16 | stable-legacy-transaction-entry-number-hotfix-v1 | a3b33bc (hotfix)
2026-06-16 | stable-invoice-ux-enhancement-phase2-v1  | 8400537
2026-06-16 | stable-kuwait-locations-recent-usage-v1  | d650e8d
2026-06-17 | stable-invoice-customer-price-filter-v1  | a1d1ed1
2026-06-17 | stable-expenses-enhancement-phase-a-v1   | 388795c
2026-06-18 | stable-invoice-collection-print-cheque-image-pack-v1 | 758e0e9
2026-06-23 | stable-invoice-expenses-operations-pack-v1 | b98bcdd
```

### Cheques
```
2026-06-08 | stable-cheques-management-v1             | d87cd22   (superseded)
2026-06-08 | stable-cheques-management-v1.1           | e032ee5
2026-06-09 | stable-cheques-enhancement-phase1-v1     | be229d3
2026-06-09 | stable-cheques-tafqeet-v1                | 68026f4
2026-06-09 | stable-cheques-improvements-v1           | c9d719e
2026-06-09 | stable-cheques-print-output-v1           | 6073785
2026-06-11 | stable-gulf-bank-cheque-calibration-v1   | 3fcd7c7
2026-06-18 | stable-cheques-professional-calibration-pack-v1 | 207f603
2026-06-18 | stable-cheques-calibration-ux-phase2-v1  | 66459b3
2026-07-02 | stable-cheques-force-delete-print-fix-v1 | 76bc928
```

### Forms / HR Documents
```
2026-06-13 | stable-forms-phase1a-salary-certificate-v1 | e90298e
2026-06-13 | stable-forms-phase1b-v1                  | 2f4ca49
2026-06-14 | stable-forms-print-layout-hotfix-v1      | e93e2d4   (hotfix)
2026-06-14 | stable-forms-single-page-print-hotfix-v1 | fc88685   (hotfix)
2026-06-15 | stable-forms-header-footer-cleanup-v1    | 3a766e5
2026-06-18 | stable-employment-contract-form-v1       | 5c004b6
2026-06-19 | stable-employment-contract-article7-print-fix-v1 | ccb7a8b (fix)
2026-06-19 | stable-employment-contract-two-page-layout-v1 | f483bcd
2026-06-19 | stable-print-profiles-forms-completion-v1 | 2c3c347
2026-06-19 | stable-forms-completion-pack-phase1-v1   | 18ce48b
2026-06-20 | stable-forms-polish-pack-v2              | d4fbf0f
2026-06-20 | stable-forms-operations-polish-v3        | 111f4e8
```

### Print Engine / Template Studio / Designer
```
2026-06-20 | stable-print-templates-cairo-font-v1     | 930f88b
2026-06-21 | stable-print-template-engine-phase1-v1   | 49110dc
2026-06-21 | stable-print-engine-invoice-phase2a-v1   | d886717
2026-06-21 | stable-print-engine-quotation-phase2b-v1 | 5d10012
2026-06-21 | stable-print-engine-quotation-phase2b-v1.1 | 6436572
2026-06-22 | stable-print-document-suite-phase1-v1    | 591501f
2026-06-22 | stable-print-document-suite-phase2-v1    | 928c91c
2026-06-22 | stable-print-document-suite-phase3-v1    | 6bf44f5
2026-06-22 | stable-print-document-suite-phase4-v1    | 1b547ee
2026-06-22 | stable-print-designer-phase5a-v1         | 88ba3dc
2026-06-22 | stable-print-designer-phase5a1-v1        | 4a2203e
2026-06-22 | stable-print-designer-phase5b-v1         | a2e6cdd
2026-06-22 | stable-print-designer-phase5c-v1         | cbcb101
2026-06-22 | stable-print-designer-phase5d1-v1        | 5e6c097
2026-06-23 | stable-print-designer-phase5d2-v1        | 4c87b5b
2026-06-23 | stable-print-designer-phase6-v1          | 23f12c9
2026-06-23 | stable-print-designer-phase6-1a-v1       | cba932f
2026-06-23 | stable-print-designer-phase6-1b-v1       | b8fc3a0
2026-06-23 | stable-print-designer-phase6-1c-v1       | bf58714
2026-06-25 | stable-arabic-pdf-chromium-fix-v1        | 90dccc8
2026-06-25 | stable-print-polish-batch1-v1            | 4c58c8d
2026-06-25 | stable-print-designer-phase7a-docx-import-v1 | f5dcfc5
2026-07-01 | stable-print-native-bridge-routing-v1     | d01e714   (Quick Fix — native print routing)
2026-07-01 | stable-print-profile-toggle-voucher-isolation-v1 | 5b8b8f6   (Quick Fix — hide voucher profiles from forms)
2026-07-02 | stable-print-templates-cleanup-phase1-v1 | b7a4988   (default 75% workspace zoom + de-duplicated HR/voucher approval blocks, bilingual)
```

### Data Import
```
2026-06-08 | stable-data-import-phase1-v1             | d196544
2026-06-08 | stable-employee-import-extended-fields-v1 | 7ac035a
2026-06-12 | stable-data-import-export-expansion-v1   | 1037132
2026-06-13 | stable-dynamic-import-tabs-phase1-v1     | 8fe073e
2026-06-14 | stable-data-import-phase3-contracts-expenses-v1 | 6701a9d
2026-06-14 | stable-xlsx-import-hardening-v1          | e4d07ae
2026-06-15 | stable-data-import-phase3c-invoices-v1   | 99e8bf0
```

### i18n / UI System / Cross-cutting UX
```
2026-06-08 | stable-i18n-phase1-v1 .. phase5-v1       | 3b6f1b1,2d981ec,c770364,dd2735d,82cb27a
2026-06-09 | stable-page-level-improvements-v1        | 08cc8e3
2026-06-09 | stable-ui-adoption-phase1-v1             | be46010   (⬛ superseded)
2026-06-10 | stable-ui-adoption-phase2-v1             | 5d2a0b9   (⬛ superseded)
2026-06-10 | stable-ui-adoption-phase3a-v1            | 4f6a906   (⬛ superseded)
2026-06-10 | stable-ui-adoption-phase3b-v1            | 69d931b   (⬛ superseded)
2026-06-10 | stable-stitch-full-ui-rewrite-v1         | 17779e8   (⬛ superseded by ExplorerKit)
2026-06-12 | stable-ui-datatables-enhancement-phase1-v1 | 65d0b15
2026-06-12 | stable-ui-page-headers-standardization-v1 | 72ceab2
2026-06-12 | stable-ui-datatable-sticky-gap-hotfix-v1 | b1f3ff3  (hotfix)
2026-06-12 | stable-global-copy-context-menu-v1       | 1d33811
2026-06-12 | stable-remove-datatable-sticky-header-v1 | 24de1b6
2026-06-17 | stable-ui-consistency-phase1-buttons-v1  | b50036c
2026-06-17 | stable-ui-consistency-phase2-tables-v1   | 98f616b
2026-06-18 | stable-ui-consistency-phase3-forms-v1    | c0fa2b8
2026-06-18 | stable-ui-consistency-phase4-micro-ux-v1 | 2b91433
2026-06-20 | stable-ui-typography-refresh-v1          | bf90fea
2026-06-23 | stable-ux-polish-pack-v4                 | 57b3fc3
2026-06-09 | stable-alerts-dedup-v1                   | daefb6b
```

### Operational Polish Packs (cross-cutting)
```
2026-06-11 | stable-operational-ux-phase1a .. phase2a(+cleanup) | cf05ae5,9028530,53f11ee,cc071e5,e141a58,777c8f5,16d8b56,3a14b70,ee47a9c
2026-06-12 | stable-operational-stabilization-phase1-v1 | 691a9c5
2026-06-12 | stable-operational-stabilization-phase2-v1 | d2cbcb6
2026-06-12 | stable-operational-polish-hotfix1-v1     | 10e1db9  (hotfix)
2026-06-12 | stable-operational-polish-phase1a-v1     | dd25ff1
2026-06-12 | stable-operational-polish-phase1b-v1     | 6ff01ea
2026-06-12 | stable-operational-feedback-phase1-v1    | 37bc2b5
2026-06-16 | stable-operational-improvements-pack-v1  | f5ae9aa
2026-06-16 | stable-business-alignment-pack-v1        | fcb8386
2026-06-16 | stable-ui-ux-operational-improvements-phase1-v1 | f032fd0
2026-06-17 | stable-operations-workflow-pack-v1       | 69630de
2026-06-19 | stable-operations-polish-pack-v1         | b966c62
2026-06-19 | stable-professional-polish-pack-phase2-v1 | cd4aeca
2026-06-19 | stable-ultimate-professional-ux-pack-v1  | 8310d3f
2026-06-19 | stable-final-professional-ux-forms-polish-v1 | 0edaa76
2026-06-19 | stable-final-remaining-ux-improvements-v1 | e79ecf9
2026-06-27 | stable-final-polish-suite-phase2-v1      | a5eaab9
2026-06-27 | stable-operational-polish-suite-phase3-v1 | a29f841
2026-06-28 | stable-operational-polish-suite-phase4-v1 | 97a627d
2026-06-26 | stable-ops-management-suite-phase1-v1    | 9631a87   (Doc Expiry + Attachments + Backup verify + Fin Ops)
```

### Approval Workflow
```
2026-06-24 | stable-approval-workflow-pack-v1-phase-a | 970b944   (🟡 Phase A only)
```

### Banking
```
2026-06-18 | stable-payroll-bank-import-v1            | 8d146f7   (superseded by phase1)
2026-06-18 | stable-payroll-bank-import-all-transactions-v1 | 468fa66
2026-06-18 | stable-payroll-bank-import-date-month-fix-v1 | 15fb086  (fix)
2026-06-18 | stable-payroll-bank-analytics-v1         | d86c991
2026-06-19 | stable-payroll-bank-analytics-ux-filters-v1 | 1211f86
2026-06-25 | stable-payroll-bank-import-phase1-v1     | bb56a83   (canonical Phase 1)
2026-06-25 | stable-bank-statement-import-phase1-v1   | e2abc8f
2026-06-28 | stable-bank-statement-headerless-fix-v1  | 5cf20b1   (fix)
2026-06-28 | stable-bank-statement-preamble-fix-v1    | 890821c   (fix)
2026-06-28 | stable-bank-import-validation-polish-v1  | f689ae7
2026-06-28 | stable-bank-statement-explorer-phase5c-v1 | f6d1e2a
2026-06-28 | stable-payroll-analytics-explorer-phase6-v1 | 0ac9e75
2026-06-29 | stable-bank-statement-incremental-import-v2 | da9ba25
2026-06-29 | stable-bank-unified-timeline-architecture-v1 | 2f21b11  (ADR-001)
2026-06-29 | stable-bank-statement-import-phase-a-v1  | 96efefc
2026-06-29 | stable-bank-account-explorer-phase-b-v1  | 541b2d5
2026-06-30 | stable-bank-account-explorer-polish-phase1-v1 | 932ef40
2026-06-30 | stable-bank-account-explorer-phase-c-v1  | 180e6b1
2026-06-30 | stable-bank-account-explorer-phase-d-v1  | f5af5b5
2026-06-30 | stable-bank-account-explorer-phase-e-v1  | 2c60b5e
```

### ExplorerKit (Unified Explorer UI) + Settings
```
2026-06-30 | stable-unified-explorer-ui-bundle-phase1-v1 | d312d5c
2026-06-30 | stable-unified-explorer-ui-phase2-v1     | 55d667a
2026-06-30 | stable-unified-explorer-ui-phase3a-v1    | 5514ebb
2026-06-30 | stable-unified-explorer-ui-phase3b-v1    | a3f471a
2026-06-30 | stable-unified-explorer-ui-phase3c-v1    | 430378e
2026-06-30 | stable-unified-explorer-ui-phase3d-v1    | ece7b55
2026-06-30 | stable-unified-explorer-ui-phase3e-v1    | c41abdd
2026-07-01 | stable-settings-center-refresh-v1        | 2543101
```

### Integrations
```
2026-06-25 | stable-integrations-center-phase1-v1     | eca1e91
2026-06-28 | stable-integrations-center-phase2-v1     | fb26600
```

### AI Assistant
```
2026-06-28 | stable-ai-assistant-phase-ai-1.5-v1      | 67a087f
2026-06-29 | stable-ai-assistant-phase-ai-2-v1        | 87fd370
2026-06-29 | stable-ai-assistant-phase-ai-2.1-v1      | 7a1366f
2026-06-29 | stable-ai-assistant-business-skills-v1   | f7f7823   (AI-2.5)
```

*Confidence: High (exact `git for-each-ref` output). "Superseded" markings are Medium — inferred from phased naming.*

---

# ExplorerKit Status

**Kit:** `frontend/src/components/explorer/ExplorerKit.tsx` + `explorer-kit.css` — fully `.xpl-`-namespaced (ExecutiveHeader, HeroMetric/MetricCard, FilterChip, SearchBox, Drawer, Dialog, Tabs, Pagination, EmptyState, ErrorBanner, SkeletonRows). Zero global CSS leakage; RTL + a11y (focus trap, ARIA). *Confidence: High.*

### Migrated pages by phase
| Phase / tag | Pages migrated |
|---|---|
| Bundle Phase 1 (`bundle-phase1`) | Reports, Document Expiry, Data Import |
| Phase 2 (`phase2`) | 6 core operational modules |
| Phase 3A (`phase3a`) | Contracts, Users, Forms Hub |
| Phase 3B (`phase3b`) | Salaries, Project Prices, Attendance |
| Phase 3C (`phase3c`) | Inventory, Maintenance |
| Phase 3D (`phase3d`) | Cheques |
| Phase 3E (`phase3e`) | Invoices |
| Settings Center refresh | Settings |

**Fully migrated (16 pages):** Accounting, Attendance, Cheques, DataImport, DocumentExpirationCenter, Expenses, Forms, Inventory, Invoices, Maintenance, Prices, Reports, Salaries, Settings, Users **+ ResourcePage** (dual-render; `explorer:true` for customers, suppliers, contracts, equipment, employees). *Confidence: High (verified `xpl-scope` imports).*

### Intentionally NOT migrated (~33) — with reasons
- **Own dedicated designs (deliberate):** BankAccountExplorer, BankReconciliation, BankSalaryAnalytics, BankStatementImport, PayrollBankImport, BankImport, BankAccounts — bespoke explorer/wizard UX with their own CSS.
- **Dashboards (own component libs):** Dashboard, ExecutiveDecisionCenter, FinancialCenter, FinancialOperationsDashboard.
- **Print / document / form pages (Modal-based, not list-explorers):** InvoicePreview, ReportPrint, PayrollPayslip, Quotation, EmploymentContract + ~10 HR form pages + vouchers.
- **System pages:** Login, Backup, AIAssistant, Integrations, DocumentVerify, AuditLog, Statements.

### Is rollout complete?
**Yes, for the list/CRUD scope it targets.** No page is in a partial/mixed ExplorerKit state — migrations are all-or-nothing. The unmigrated set is dominated by pages that don't fit the list-explorer pattern. *Optional* future consistency candidates: **Statements, AuditLog, BankAccounts** (product decision, not a gap). *Confidence: High for "complete for scope"; Medium for "which extras should migrate".*

---

# Banking Status

All wired (routes in `app.ts`, pages in `App.tsx`, sidebar under `import_center`). Backend: `bankStatementImport/` (21 files), `bankAccounts/` (7), `payrollBankImport/` (11). Models: `BankStatementImport`, `BankStatementTransaction`. ADR: `docs/ADR-001-unified-bank-account-timeline.md`. *Confidence: High.*

| Feature | Classification | Evidence |
|---|---|---|
| Bank Statement Import | **Implemented / Production** | 8 endpoints, 7-bank detection, headerless-XML + preamble fixes |
| Bank Statement Explorer | **Implemented / Production** (shipped as **Bank Reconciliation** workspace) | `BankReconciliation.tsx` + workspace/status endpoints |
| Bank Reconciliation | **Implemented / Production** (manual-confirm; **non-auto-posting by policy**) | status machine, 6-source matcher (invoice/payment/expense/journal/cheque/payroll), PostingSuggestionsPanel |
| Unified Timeline | **Implemented / Production** | ADR-001 accepted; `timeline/:accountKey` endpoint; `accountKey` on models |
| Bank Account Explorer | **Implemented / Production** | `BankAccountExplorer.tsx`, phases b–e + polish |
| Incremental Import (v2) | **Implemented / Production** | `fingerprint.ts` + `dedupDetector.ts` (SHA-256) |
| Validation Polish | **Implemented / Production** | `validators.ts` (9 rules), per-row errors/warnings |
| Payroll Bank Import | **Implemented / Production** | 4 endpoints, 6 banks, 4-level matching → `SalaryPayment` |
| Payroll Analytics | **Implemented / Production** | `BankSalaryAnalytics.tsx` (KPIs, 6 charts, exports) |
| **GL auto-posting after reconciliation** | **Future** (deferred by "never auto-post" policy) | suggestions shown; automatic GL write intentionally absent |

**Deprecated:** none. *Confidence: High.*

---

# Printing Status

Entire stack **Implemented / Production**. *Confidence: High.*

| Subsystem | Status | Evidence |
|---|---|---|
| Print Engine | ✅ | `shared/services/reportEngine/`; **dual pipeline** — PDFKit (backend tabular) + Chromium `printToPDF` for Arabic-correct HTML→PDF (`pdf:exportHtml` IPC) |
| Template Studio / Print Designer | ✅ | `print-templates/studio/`; Phase 6.0 + 6.1A + 7A; 9 element types; drag/resize; live A4 preview; token-only styles + security allowlists |
| Reference Templates | ✅ | React components + CSS Modules for all designs |
| Registry | ✅ **30 templates** | 10 invoice + 10 quotation + 4 PO + 6 RFQ (original + blank-letterhead) |
| Official Forms | ✅ **12 forms** | Salary Certificate, Employment Contract, Leave, Salary Advance, Employee Warning, Performance Eval, Return-to-Work, Resignation, To-Whom, Payment Voucher, Receipt Voucher, Purchase Request |
| Signature Designer | ✅ | `BrandingLayoutDesigner`; per-doc-type position/scale/opacity/z; multi-signature `SigSlot[]` |
| Stamp Designer | ✅ | unified with signature (same modal/storage) |
| Cheque Calibration | ✅ | `ChequeCalibrator` — 4 fields, per-bank templates |
| Cheque Printing | ✅ | Draft/Printed/Cancelled, tafqeet, amount formatting |
| DOCX Import | ✅ (Phase 7A) | `docxImport/` — mammoth+jszip, 4-step wizard, flow-layout, 31 tests |
| PDF Export | ✅ | Electron `pdf:exportHtml` + `pdf:export` IPC |
| Report Printing | ✅ | `ReportPrint.tsx` (RTL, totals) |
| Payroll Payslip | ✅ | `PayrollPayslip.tsx` |
| Print Profiles | ✅ | 6 profiles (A4-landscape/portrait, statement, journal, receipt, letter) + watermarks |
| **Print Designer 7B (PDF import)** | **Future** | requires pdf.js strategy |
| **Print Designer 7C (Image/OCR import)** | **Future** | requires OCR (Tesseract.js) |

**Deprecated:** none. Cheque stubs (`BeneficiaryMaster`, `BankTemplateProfile`, `ChequePrinterPreference`) are interfaces only → Future.

---

# AI Status

**Headline: the AI layer is 100% deterministic and offline. There is NO LLM anywhere.** Repo-wide search for `openai|anthropic|gpt|gemini|langchain|llamaindex` → **0 hits**. This matches the offline-only mandate. *Confidence: High.*

| Feature | Already implemented | Future roadmap |
|---|---|---|
| **AI Assistant** | ✅ `frontend/src/ai/` + `AIAssistant.tsx`; deterministic keyword router (`router.ts`), route `/ai-assistant`, sidebar `nav.group.ai` | live NLP/intent understanding |
| **Skills Engine** | ✅ 6 skills (bank-statement, payroll, reports, expenses, contracts, dashboard) — API-read + local aggregation | more skills; write-actions (AI-5) |
| **Quality Engine** | ✅ `qualityEngine.ts` — deterministic completeness/warning scoring | — |
| **Executive Intelligence** | ✅ `ExecutiveDecisionCenter` + intelligence bundle — hardcoded business logic, health score | — |
| **Integrations** | ✅ `integrations/` (3 real: payroll-bank-import, bank-statement-import, enhanced-excel-import) + 2 planned stubs | Reconciliation Assistant, Connector SDK. **Cloud Backup was deleted** — removed from the roadmap; a visible card with no code is a promise that cannot be kept. |
| **OCR** | ❌ none | **Removed from the roadmap** (2026-07-12) — its UI cards were deleted. |
| **Document AI** | ❌ none | **Removed from the roadmap** — card deleted. |
| **LLM Support** | ❌ none | **Removed from the roadmap** — the assistant stays deterministic by decision, not by omission. |
| **Offline AI** | ✅ this **is** the current model — deterministic, read-only, RBAC-aware, auditable | — |

**`AIQueryLog` — moot, not a gap.** The table belonged to the AI phases (AI-3…AI-6) that have since been **removed from the roadmap**. The deterministic assistant runs entirely in the frontend and issues no free-form queries; the underlying data operations are already audited through `AuditLog`. `docs/AI_ASSISTANT_ARCHITECTURE.md` describes an unfunded design — read it as history, not as a plan.

---

# Remaining Roadmap (genuinely open only)

Reconciled against the **code** on 2026-07-12 (Master Release Audit + Core Runtime Completion pack). Items
proven shipped, and items removed by decision, are listed in the two blocks below the roadmap so they are not
re-added. Each remaining item is unbuilt per repository evidence.

> **Deployment model drives priority.** This is a **small local Electron app used by its owner on his own
> machine** — not a hosted, internet-facing, or multi-tenant system. Enterprise-grade hardening items are
> **not** priorities here by decision, not by oversight; several were reviewed and declined (see below).

1. **Print Designer 7B (PDF import)** — needs a pdf.js strategy decision first. *(High)*
2. **Bank Explorer — period opening/closing balance** — fully designed, not built. *(High)*
3. **Data Import Phase 4 — grouped-row engine** (PurchaseOrders/GoodsReceipts/MaterialIssues). The 7 Prisma
   models already exist; this is import validators, not domain design. *(Medium)*
4. **GL auto-posting from the reconciliation workspace** — suggestions only today. **Conflicts with the
   standing "never auto-post" policy — settle the policy before scheduling.** *(Medium)*
5. **Per-document signer selection**; Audit Log advanced filters/export; advanced print profiles. *(Medium)*
6. Historical Import Batch Review (`ImportBatch`); recurring invoices; VAT report; end-of-service accrual. *(Low)*
7. **AuditLog retention** — *maintenance consideration only.* No purge path exists; harmless for a single-user
   local deployment. Revisit **only if database growth becomes measurable**. Not a risk, not near-term. *(Low)*
8. **Kuwait Labour Law Compliance — Rules 4, 6, 18** — the independent Kuwait Labour Law Compliance Audit
   flagged 3 remaining findings against the Employee Entitlements calculation engine that Pack v1 (Rules 10,
   13, 16, 17) and Pack v2 (Rules 2, 5 — see `stable-kuwait-labour-law-compliance-pack-v2`) deliberately did
   **not** implement, because each requires **formal legal interpretation** before any calculation change can
   be made safely. Do not implement without an explicit legal-confirmation instruction from the project owner.
   *(Medium — blocked on external input, not on engineering effort)*
9. **Real Hijri/Al-Ojairi holiday auto-generation** — `HijriHolidayProvider`/`HijriHolidayService`
   (`stable-employee-entitlements-intelligence-suite-foundation-v1`, extended by
   `stable-kuwait-holiday-intelligence-pack-v1`) are a complete, documented architectural stub —
   `getExpectedHijriHolidays()` always returns `[]`. Real Hijri↔Gregorian conversion requires a genuine
   Umm al-Qura or Al-Ojairi almanac data source/library not currently in the project; deliberately never
   hardcoded or guessed. Implementing this only requires filling in that one method — the provider,
   planner, executor, comparison, and UI already consume it correctly. *(Medium — blocked on sourcing a
   calendar data provider, not on architecture)*

### Reviewed & declined — do not re-add, do not recommend as "next"

- **Float → Decimal monetary migration — Reviewed; current monetary representation retained by explicit
  project decision** (Claude + ChatGPT). **Not** an active technical-debt priority; do **not** schedule or
  recommend a migration. Reopen only on **concrete, reproducible accounting inaccuracies** or an explicit
  owner request.
- **JWT invalidation / revocation** and **enterprise security hardening** (Electron CSP + `sandbox: true`,
  bcrypt cost increase) — **not** active priorities for a single-user local application. Reconsider only if
  the deployment model changes or the owner asks.
- **Local backup encryption** — *optional future consideration only*, contingent on a change in deployment or
  threat model. **Not** a committed priority and **not** a recommended next task.

### Proven shipped — removed from this roadmap (do not re-add)

- **Leave Advance Reconciliation Pack v1.** ✅ **Implemented** — shipped as the "Leave Advance Reconciliation"
  section of the Employee Entitlements Center (`stable-employee-entitlements-experience-refactor-v1`): total
  legal entitlement, total leave-advance days paid, and the remaining amount expected at final settlement, with
  an over-advance difference warning. Display/reconciliation layer only — the legal calculation engine
  (`entitlements.calc.ts`) was not modified.
- **Approval Workflow — Phase B.** The engine is now registered for expense/invoice/payroll and the domain
  services record `ApprovalHistory` via `approvalEngine.recordTransition()`. Approvals are **not** routed
  through `transition()` — doing so would double-audit and deadlock SQLite, and `invoices.approve()` has no
  status transition to model. See `approval.registry.ts`.
- **Payroll → GL double-entry.** ✅ **Implemented** — `payroll.service.markPaid()` → `postPayrollToGL()` →
  `createBalancedJournal()`. It posts on **PAID**, not on approve. The former "**UNKNOWN**" verdict was wrong.
- **Document attachments** (`model Attachment` + `/api/attachments` + `AttachmentsPanel`).
- **AP aging** (`/financial/ap-aging`) — was listed as a "Phase 3 extension".
- **Profit & Loss report** — implemented in `reports.service`; now reachable from the Financial Center too.
- **Smart Transaction Presentation Engine v1** (`stable-smart-transaction-presentation-engine-v1`).
- **Global search** — the top-bar field is now functional (`/api/search`), not decorative.
- **PDFKit** — retired from the report route (never shaped Arabic; its font was never in the repo; no UI
  caller). Chromium/HTML export covers the same reports.

### Removed from the roadmap by decision (do not re-add)

- Cloud backup / Google Drive connector · cryptographically signed PDF export · AI local LLM / RAG / OCR /
  Document AI / free SQL layer (former AI-3…AI-6) · **AIQueryLog** (belonged to the cancelled AI phases) ·
  Mobile Companion app · any sixth generation of printing.

---

# Future Vision

> **Superseded on 2026-07-12.** Most of what this section once described was **removed from the roadmap by
> decision** — it is not "unbuilt work waiting", it is work that will not be done unless the owner reopens it.
> Kept only as a record of what was considered and dropped.

**Removed by decision — do not restore anywhere:**
- **Document AI · OCR · optional LLM (Ollama / cloud provider) · free SQL layer** — the assistant stays
  deterministic. Their UI cards, quick-actions and roadmap rows have been deleted from the app.
- **Cloud Backup (OneDrive / Google Drive)** — explicitly removed; its Integrations card was deleted. No code
  ever existed; the `feature/google-drive-backup-phase1` branch was abandoned and never merged.
- **Mobile Companion** — no code, no mobile API, no sync design; not planned.

**Still conceivable, unscheduled:**
- **Executive AI** — deeper narrative insight over the existing deterministic analytics.
- **Integrations** — Reconciliation Assistant, Connector SDK.
- **Analytics** — expanded KPI timelines, trend intelligence.

The assistant remains **read-only, offline, and deterministic**. `docs/AI_ASSISTANT_ARCHITECTURE.md` describes
an unfunded design — read it as history, not as a plan.

---

# Development Workflow

```
ChatGPT
   ↓  (planning / prioritization / roadmap)
Planning
   ↓
Claude Code
   ↓  (implementation)
Implementation
   ↓
Gemini
   ↓  (architecture / security / regression / UX review)
Review
   ↓
Validation   (tsc x3 · prisma validate · vitest · builds x3)
   ↓
Merge (--no-ff)   into production
   ↓
Stable Tag   (stable-<feature>-vN)
   ↓
Production   (push origin production + tag)
```

Three practiced modes (from CLAUDE.md): **Quick Fix** (CSS/i18n/labels), **Feature** (checkpoint tag + branch + Gemini + `--no-ff` + stable tag), **Major System** (ChatGPT plan → Sonnet audit → optional Opus → Gemini architecture + security review). Model routing: Sonnet default, Opus for large/sensitive work, Gemini for review, ChatGPT for planning. *Confidence: High (CLAUDE.md) + High (tag evidence confirms checkpoint→stable discipline).*

---

# Official Project Principles

1. **Desktop only** — Electron (Windows); no web/mobile deployment.
2. **Offline first** — no mandatory network; all fonts/assets local.
3. **SQLite** — single local database file.
4. **Prisma** — ORM; migrations reviewed before apply; never `migrate` without reviewing SQL.
5. **Electron** — main process forks backend child; contextBridge IPC only.
6. **React** — Vite renderer, HashRouter (file:// compatible).
7. **Arabic First** — Arabic UI, English codebase; RTL throughout.
8. **KWD** — Kuwaiti Dinar, 3 decimals.
9. **No SaaS** — single-company, no multi-tenant, no cloud lock-in.
10. **No automatic financial posting** — bank reconciliation and imports never auto-post to the GL.
11. **Manual approval for accounting operations** — postings/approvals require explicit user confirmation.
12. **Security by default** — every route behind `authenticate` + `requirePermission`; bcrypt/JWT only; mutations audit-logged; no plain secrets.

*Confidence: High (CLAUDE.md + confirmed reconciliation "never auto-post" design).*

---

# Quality Check / Evidence Notes

- **High confidence:** all tag data, counts, HEAD/tag identity, "220/220 on production", module/page/model/migration counts, Banking/Printing/AI/ExplorerKit implementation status — all from direct git commands and file reads this session.
- **Medium confidence:** "superseded" markings (inferred from phased naming); which unmigrated pages *should* migrate; AIQueryLog gap.
- **UNKNOWN (must verify before acting):** per-document signer policies. *(Payroll→GL and Quotation PDF export were verified in code on 2026-07-12: Payroll→GL is **implemented** (posts on PAID); Quotation PDF now exports from the document via `exportPdfFromHtml`.)*
- **No features were invented.** Anything not confirmable from Git/repository is marked UNKNOWN above.

*End of PROJECT_MASTER_STATUS.md — reconstructed from repository evidence on 2026-07-01. Not committed.*
