# PROJECT_STATE.md — manarERP

> Live state document. Update at the end of every session.
> Read at session start after AGENTS.md and CLAUDE.md.

---

## Rotation & Archive Policy

> Introduced 2026-07-17 as part of the Cleanup & Architecture Remediation Pack v1, in response to a gap-analysis
> finding: this file is append-only by convention and had grown to ~2,600 lines / ~640 KB — unbounded growth that
> degrades both human skimming and LLM session-start context budget, with no rotation mechanism previously defined.

**Trigger:** when this file's release-log content (everything from `## Latest Release` through the last
`## Previous Release — …` section, i.e. excluding the always-current reference sections below it — Module
Inventory, Print Engine, Architecture, Security, Feature Status Snapshot, Future Roadmap, etc.) exceeds
**~15 dated release entries**, archive the oldest entries down to the most recent ~10.

**Archive destination:** `docs/history/PROJECT_STATE_ARCHIVE_<oldest-date>_to_<newest-date>.md` — one file per
archived batch, named by the date range it covers. See `docs/history/README.md` for the index and process.

**Process (manual, at the next release that crosses the trigger):**
1. Identify the oldest `## Previous Release — …` sections that push the count past the ~10-entries-to-keep line.
2. Move them verbatim (do not summarize or rewrite) into a new dated file under `docs/history/`.
3. Add one line to `docs/history/README.md` indexing the new archive file's date range.
4. Leave the always-current reference sections (Module Inventory, Print Engine, Architecture, Security, Seed
   Data State, Feature Status Snapshot, Future Roadmap, Deferred Accounting Notes, Validation Checklist) in
   place — they are not release-log entries and are never archived.
5. Regenerate `PROJECT_MASTER_STATUS.md`'s "Current Production State" and "Repository Status" tables at the
   same time (see that file's own refresh-cadence note) so the two documents never drift apart again.

**Not addressed by this pass:** the pre-existing large narrative block embedded inside the "Current Production
Baseline" table's "Latest validation" cell (a multi-release history compressed into one table cell, predating
this policy) is a known structural quirk left untouched here — restructuring it risks losing or corrupting
reference content and was judged out of scope for this policy-introduction pass. A future dedicated pass should
extract it into `## Previous Release —` sections (or directly into the archive) rather than leave it compressed
in a table cell.

### Rotation history

| Rotated on | Package | Entries archived | Retained in this file | Destination |
|---|---|---:|---:|---|
| 2026-09-08 | PROJECT_STATE Documentation Rotation & Maintenance v1 | 172 | current release + 15 `## Previous Release` | 4 files in [`docs/history/`](docs/history/README.md) |
| 2026-09-10 | Employee Debt Acknowledgment Administrative Form v1 | 1433 | current release + 10 `## Previous Release` | 5 files in [`docs/history/`](docs/history/README.md) |

**Where the older history went:** everything before *Production Release 2026.5.7* (2026-08-25) was moved
**verbatim** into `docs/history/PROJECT_STATE_ARCHIVE_*.md` — nothing was summarised or deleted. Start at
[`docs/history/README.md`](docs/history/README.md) for the index and search tips; the full accounting,
count invariant and per-entry SHA-256 verification are in
[`docs/history/ROTATION_MANIFEST_V1.md`](docs/history/ROTATION_MANIFEST_V1.md).

**Note on step 5 above:** the 2026-09-08 rotation did **not** refresh `PROJECT_MASTER_STATUS.md` — that was
outside its declared scope and is recorded as an open finding in the rotation manifest.

---

## Current Production Baseline

| Field | Value |
|-------|-------|
| **Branch** | `production` |
| **Production HEAD** | **`814116b4`** (merge) + توثيق الإصدار `291e1a20` وcommit إغلاق الهاش فوقه — **Employee Debt Acknowledgment Administrative Form v1** (feature release), merge `814116b4` (أبواه `a3c5b18e` و`618f00b0`), tag `stable-employee-debt-acknowledgment-form-v1` → **commit الدمج نفسه**, توثيق الإصدار في `291e1a20` يعلوه commit إغلاق الهاش. **أول إصدار يحمل كودًا منذ Production Release 2026.5.9**: ما سبقه على `production` كان توثيقًا خالصًا. نسخة سطح المكتب تبقى **`2026.5.9`** — إصدار ميزة بلا مثبِّت ولا رفع نسخة. Product Owner Visual Review: **APPROVED** |
| **Production HEAD before that** | `f37c9c7f` — **Complete User Manual v1** (documentation release), merge `57e2c8a1`, tag `stable-complete-user-manual-v1`, docs/final commit `f37c9c7f`. **The last code-bearing release is Production Release 2026.5.9** (release commit `ab9480d9`, tag `stable-production-release-2026.5.9`); everything merged onto `production` after it is **documentation only** — mechanically verified: `git diff --name-only ab9480d9 f37c9c7f` touches 98 files, all under `docs/` plus `PROJECT_STATE.md` and `AI_CONTEXT.md`, with zero files under `backend/`, `frontend/`, `electron/`, `scripts/`, `prisma/` and no `package.json` change. The older HEAD chain continues in the rows below; the full entry for each of those releases lives in the release log or in `docs/history/` |
| **Production HEAD before that** | `95f67a9c` — release `stable-production-release-2026.5.5` (**Production Release 2026.5.5** — merge of `feature/production-release-2026.5.5`. Packages into a new self-contained Windows installer every Feature Release merged onto `production` since the 2026.5.4 installer: **Employee Compensation — Batch Printing v1** (`78cbab4b`, merge `876f0ff8`), **Migration History Reconciliation v1** (`99b89c68`, merge `bd15959f`), **XBRL Readiness Foundation v1** (`2d221663`, merge `66f03cf7`) and **Vehicle Insurance Management v1** (`b80b8c4b`, merge `581ad7ee`) — each already merged, tagged and documented individually. `package.json` `version` `2026.5.4` → `2026.5.5` is the only tracked-file change the release itself introduces; no new feature work, no schema change, no migration, no new permission key, no new dependency. **The recurring Prisma packaging defect recurred again and was neutralised before packaging:** the repo-root `node_modules/.prisma` client was stale at **75 models** against the schema’s **85** — `scripts/prepare-backend-deps.js` overlays the *root* client into the package while `prisma generate` writes to `backend/node_modules/.prisma`, so the root copy silently stops tracking the schema. `npm run db:generate` was run and the fresh `backend/node_modules/.prisma` + `@prisma/client` were copied over their root counterparts before `npm run dist`; the shipped client was then verified to carry **all 85 models with a model set identical to `backend/prisma/schema.prisma` — zero missing, zero extra** — both in `win-unpacked` and by extraction from inside `Setup.exe`. Had the workaround been skipped, the installer would have shipped a client missing 10 models and failed at runtime on Vehicle Insurance and XBRL Readiness. The underlying `prepare-backend-deps.js` weakness is **still not fixed at source** and remains required follow-up work. Validation: Backend/Frontend/Electron `tsc --noEmit` clean · `prisma validate` clean · `migrate status` 69/69 applied (latest `20260819120000_add_xbrl_readiness_foundation`) · Backend 212 files/**3418** tests (2 intentionally-skipped diagnostic probe stubs, pre-existing) · Frontend 223 files/**4088** tests · Electron 26 files/**499** tests — all green, and the Electron suite re-run after the version bump so the packaging version contract is enforced against `2026.5.5`. Packaging audit: all **4,108** entries of `Setup.exe` enumerated via `7za l -slt` plus all **686** `app.asar` entries listed directly — zero source maps, zero `__tests__`, zero `*.test.*`/`*.spec.*`, zero `.ts`/`.tsx`/`.d.ts`, zero `.pem`/`.key`/`.pfx`/`.crt`, zero SQLite journals (`-wal`/`-shm`/`-journal`), zero `.bak`, zero non-Windows native Prisma engines, and zero build-machine state files (`gdrive-token.dat`/`device-identity.json`/`sync-metadata.json`/`gdrive-account.json`/`security.json`). Exactly **one** `.db` ships (`resources\backend\data\manar.db`). One `.env`-pattern hit inspected and confirmed a false positive — `@dabh/diagnostics/adapters/process.env.js`, a normal JS module of a winston dependency. Present and confirmed: `app.asar`, `backend\dist\server.js`, `electron-dist\main.js` and `frontend\dist\index.html` (both inside `app.asar`), `preload.js`, `schema.prisma`, 69 migration folders, `gdrive-oauth-client.json`, `runtime-requirements.json` (reporting zero external prerequisites), `seed-data/golden-manifest.json`, and 69 bundled font files (49 in `app.asar` + 20 in `extraResources`). Golden Database SHA-256 `f62a08a874f40baf7a600732605ea4e276a1a8621472b400f27c2a13e52e041c` (3,866,624 bytes · `integrity_check = ok` · 0 foreign-key violations · 86 tables · 69 applied migrations) verified byte-identical in **four** places: source `backend/data/manar.db` · `release/win-unpacked/resources/backend/data/manar.db` · extracted directly from inside `Setup.exe` via `7za` (`cmp` exit 0) · and `seed-data/golden-manifest.json`, which records the identical hash and size. No hot journal existed beside the source at packaging time, and the source hash was unchanged after the full build. Integrity was checked on a byte-identical copy so the shipped file was never opened by a writer. Installer `AlManarERP-Setup-2026.5.5.exe`, 138,437,006 bytes (132.02 MiB), SHA-256 `706e79e7e3ac239f336e3aebf3b3c5c1ad34b4b4932179ba7c22876bed636a2c`; `win-unpacked` 3,376 files / 470,061,262 bytes (448.3 MiB). GUI-only install/first-run flow not driven interactively — no desktop session available in this environment — covered by the Product Owner’s completed manual visual and functional review, confirmed prior to this release) |
| **Production HEAD before that** | `581ad7ee` — release `stable-vehicle-insurance-management-v1` (**Vehicle Insurance Management v1** — merge of `feature/vehicle-insurance-recovery-v1`, feature commit `b80b8c4b`, 24 files. وحدة تشغيلية مستقلة لإدارة وثائق تأمين المعدات وحوادثها، تعيش في جدولين جديدين فقط بمفتاح أجنبي إلى `equipment`: **لا قيود محاسبية ولا مصروفات ولا صيانة ولا تعويضات**، و`equipment.insuranceExpiry` الذي يقرأه «مركز انتهاء الوثائق» لم يُمسّ. التجديد يُنشئ وثيقة جديدة ولا يعدّل القديمة، والحوادث سجل تاريخي دائم — فلا مسار حذف ولا مفتاح `delete`. أربعة مفاتيح صلاحيات (`vehicleInsurance.read`/`create`/`update`/`export`) مستقلة عن `equipment.*` و`maintenance.*`. **استعادة لا تنفيذ جديد**: الحزمة نُفِّذت في `353e71d0` ولم تصل production لأن `rebase --onto production` أسقطها عند إصدار الطباعة الجماعية؛ أُعيدت من الفرع الأصلي كمصدر وحيد، والملفات الاثنا عشر المملوكة للحزمة مطابقة بايتًا له. **لا ترحيل جديد** — `20260818120000_add_vehicle_insurance` مطبَّق مسبقًا وموجود على production منذ حزمة المواءمة، والنموذجان كانا معلنَين بنيويًا فلم يُكرَّرا. Source-only release — لا installer، والنسخة تبقى `2026.5.4`. Validation: `prisma generate`/`validate`/`migrate status` 69/69 ✅ · Backend/Frontend/Electron `tsc` ✅ · `build:back`/`build:front` ✅ · Backend 212/3418 ✅ · Frontend 223/4088 ✅ · Electron 25/488 ✅ · صفر انحدار. Product Owner manual visual & functional review: **completed and approved**) |
| **Production HEAD before that** | `66f03cf7` — release `stable-xbrl-readiness-foundation-v1` (**XBRL Readiness Foundation v1** — merge of `feature/xbrl-readiness-foundation-v1`, one feature commit `2d221663`, 43 files, on top of merge `bd15959f` (**Migration History Reconciliation v1**, commit `99b89c68`, 5 files). طبقة تحضيرية مستقلة فوق النظام المحاسبي تجعل النظام **XBRL-ready**. **النظام ليس QAYD-certified**: لا Taxonomy كويتية رسمية مثبَّتة، ولا API حكومي مفترض، ولا تصدير XBRL رسمي، ولا ادّعاء توافق مع QAYD أو وزارة التجارة والصناعة — أقصى حالة معروضة `READY_PENDING_TAXONOMY`، ولا وجود لحالة `QAYD_READY`. Migration `20260819120000_add_xbrl_readiness_foundation` إضافي بحت: ستة جداول `xbrl_*`، بلا `ALTER` واحد على جدول قائم وبلا سطر بيانات يُقرأ أو يُعدَّل؛ `Account` يكتسب علاقة عكسية فقط. ثلاثة مفاتيح صلاحيات فقط (`xbrl.read`/`manage`/`snapshot`) مستقلة عن `transactions.*` و`finreports.*`. صفر أثر على GL/Posting/Payroll/Employee Compensation/Cheques/Inventory — تكتب حصرًا في `xbrl_*` وتقرأ الأرصدة من `financialService.getTrialBalance` القائم، ويحرس ذلك اختبار ثابت يفحص شفرة الوحدة كلها. Source-only release — لا installer، وتبقى النسخة `2026.5.4`. Validation: Backend/Frontend `tsc --noEmit` ✅ · `prisma validate` ✅ · `migrate status` 69/69 «Database schema is up to date» ✅ · migration drift = صفر في الاتجاهين ✅ · XBRL + migration + accounting المستهدفة 12 ملفًا/153 اختبارًا ✅ · واجهة XBRL 18 اختبارًا ✅. Product Owner manual visual review: **completed and approved** للتبويبات الخمسة، بلا ملاحظات حاجبة) |
| **Production HEAD before that** | `876f0ff8` — release `stable-employee-compensation-batch-printing-v1` (**Employee Compensation — Batch Printing v1** — merge of `feature/employee-compensation-batch-printing-v1`, one commit `78cbab4b`, 18 files. Batch printing of a full year of monthly entitlement statements, each followed immediately by its own cash payment voucher, in one print job. Aggregation and ordering of existing documents only: no calculation re-run, no approval or snapshot touched, no payroll/accounting/GL row created or read, and the individual print path of every document unchanged. Both new backend routes are read-only under the module's existing `employeeCompensation.print` — no new permission key, no schema change, no migration. Includes the `FormPage` extraction from `FormLayout`, which makes the printable `.form-page` node a single component shared by batch and individual printing (verbatim move; the fourteen administrative forms render identically). Batch pages all use the `letterhead` profile with content starting 50mm (statement) / 30mm (voucher) from the sheet edge, applied as page padding with `@page` zeroed. Source-only release — no installer build, application version stays `2026.5.4`. **Scope deliberately narrowed**: the work was rebased `--onto production` so Vehicle Insurance Management v1 (`353e71d0`, `4e4e26a5`), which was sitting unreleased between production and this work, is **not** part of this release. Validation: Backend/Frontend `tsc --noEmit` ✅ · `build:back`/`build:front` ✅ · Frontend 221 files/4058 tests ✅ · Backend employee-compensation 11 files/282 tests ✅, all re-run on the rebased tree. Product Owner manual visual review: **completed** prior to release authorization) |
| **Production HEAD before that** | `d73dcd25` — release `stable-production-release-2026.5.4` (**Production Release 2026.5.4** — Comprehensive Reports — Monthly Employee Entitlements Report Pack v1, packaged into a new self-contained Windows installer; see the release log below. `d73dcd25` is that release's hash-closure documentation commit on top of merge `b875f9eb`) |
| **Production HEAD before that** | `74a946c2` — release `stable-production-release-2026.5.2` (**Production Release 2026.5.2** — merge of `feature/full-pre-production-audit-polish-v1`, the Full Pre-Production Audit & Polish v1 work, packaged into a new self-contained Windows installer; `package.json` `version` `2026.5.1` → `2026.5.2`. Three fix commits. **Backend** (`506bd582`): `invoices.addPayment` read the invoice and computed its over-payment guard **before** opening the transaction and then wrote `paidAmount` as an absolute value derived from that stale read — two concurrent payment submissions both read the same balance, both created a payment row and a journal entry, and one single total was written, leaving a permanent divergence between `Σ payments.amount` and `invoice.paidAmount`; the read and the validation now happen inside the transaction. The cheque-number conflict message rendered an English weekday with no year (`String(Date).slice(0, 10)` applied to a DateTime column) and now uses `toLocalDateString`. The forms print-log stored the request body verbatim in the audit log with no schema at all; a strict Zod schema now clips the payload to known fields and bounds their lengths. **Electron** (`aadf4b15`): `app:restart` called `app.exit(0)` directly, bypassing `before-quit` entirely so the backend child was never stopped — and on Windows the parent's exit does not kill the child, so port 48211 stayed held and the relaunched instance failed with `EADDRINUSE`, on the backup-restore path that invokes this channel every time; the backend is now stopped with its exit awaited and the runtime lock released before `relaunch`. `before-quit` calls `preventDefault`, and its only exit was at the end of an unguarded chain, so any throw while creating the progress window or in `finish()` left the app open forever with no dialog and no log; the whole sequence is now in try/finally with the exit in `finally`. An `uncaughtException`/`unhandledRejection` safety net was added to the main process (it previously existed only in the backend). `backupScheduler.postToInternal` resolved on any response **and** on network error, so it never rejected and its `catch` was dead code — a 500, a 401, or a backend that was not listening were all logged as "automatic backup completed"; the status code and `data.status === 'FAILED'` are now checked and a failure is logged as a failure. **Frontend** (`f6cc574e`): the invoice screens (create/edit/fast-entry) computed totals with a second formula that disagreed with the server in two places — no per-line rounding, and no tax cap at all — so three lines of 3 × 0.3335 displayed 3.002 while the server stored 3.003, and any invoice with tax > 0 (created by import or API) showed a total in the edit screen that contradicted the stored value and every report, on an invoice the user never touched; a new `computeInvoiceTotals` mirrors `invoices.calc.ts` and is used by all three, and `invoiceLineTotal` now rounds. The payslip printed the raw enum value (`DRAFT`) inside a formal Arabic document despite `payroll.status.*` keys existing. Three AI-assistant navigation targets pointed at `/dashboard`, an undefined route (the dashboard is at `/`), surviving only by accident through the catch-all. Global Search guarded «المركز المالي» with `financial.read`, a key present neither in `constants.ts` nor in the seed, so the entry never appeared for any user — the route's real key is `statements.read`, as in the sidebar. 10 new regression tests (3 backend concurrency, 7 frontend totals). No schema change, no migration, no new permission key. **Packaging defect found and fixed during this release, pre-existing:** the generated Prisma client shipped inside the installer was stale — `scripts/prepare-backend-deps.js` overlays the **repo-root** `node_modules/.prisma` into the package, but once `backend/node_modules` exists (itself created by a previous `npm run dist`) `prisma generate` resolves to *that* copy and the root one is never refreshed, so the packaged client had not been regenerated since before migration `20260814120000`. Proven pre-existing by extracting `resources\backend\node_modules\.prisma\client\schema.prisma` from the already-shipped `AlManarERP-Setup-2026.5.1.exe`: byte-length 104,359, missing `EntitlementsBankStatement`, `expectedReturnDate` and `companyOvertimeBaseRateSnapshot` — meaning the 2026.5.1 installer would have failed at runtime on the Monthly Entitlements Bank Statement, the leave expected-return-date field, and the company overtime rate. The root client was regenerated and the installer rebuilt; the shipped client is now 111,539 bytes with **74 models, matching `backend/prisma/schema.prisma` exactly**, verified both in `win-unpacked` and by extraction from inside `Setup.exe`. The underlying `prepare-backend-deps.js` weakness was **not** changed in this release — it is a source fix outside the reviewed scope and is recorded as required follow-up work. Validation: Backend/Frontend/Electron `tsc --noEmit` clean · `prisma validate` clean · `migrate status` 62/62 applied · Backend 198 files/3132 tests (2 intentionally-skipped leftover diagnostic stubs, pre-existing) · Frontend 216 files/3959 tests · Electron 26 files/499 tests — all green, re-verified on `production` after the merge and after the client refresh. Packaging audit: `app.asar` (676 entries) and `extraResources` (3,272 files) inspected directly, plus all 4,062 entries of `Setup.exe` itself — zero source maps, zero `__tests__`, zero `*.test.*`/`*.spec.*`, zero `.ts`/`.d.ts`, zero `.env`/secret/key files, zero SQLite journals, zero stray `.db`, zero non-Windows Prisma engines; 62 migrations, `schema.prisma`, `electron-dist/main.js`, `preload.js`, `frontend/dist/index.html`, 49 bundled font files, `backend/assets`, `gdrive-oauth-client.json` and `runtime-requirements.json` all present. Golden Database SHA-256 `77a9243ab3ecef3f157739eb94247c4b1d23b9cb50569a3cb4a0601af1967b73` (3,321,856 bytes · `integrity_check = ok` · 0 foreign-key violations · 78 tables · 62 applied migrations) verified byte-identical in **four** places: source `backend/data/manar.db` · `release/win-unpacked/resources/backend/data/manar.db` · extracted directly from inside `Setup.exe` via `7za` · and recorded identically in `seed-data/golden-manifest.json`. Installer `AlManarERP-Setup-2026.5.2.exe`, 138,258,420 bytes (131.85 MiB), SHA-256 `8590e7ed356064d5ee701cfcbb6bc4e8168c329e95b761bfa83ff047835c9ed1`; `win-unpacked` 3,344 files / 468,823,768 bytes (447.1 MiB). GUI-only install/first-run flow not driven interactively — no desktop session available in this environment — covered by the Product Owner's completed manual visual and functional review, confirmed prior to this release) |
| **Production HEAD before that** | `e8fea376` — release `stable-production-release-2026.5.1` (**Production Release 2026.5.1** — merge of `feature/production-release-2026.5.1`. Packages a new self-contained Windows installer including everything merged onto `production` since the 2026.5.0 installer: Employee Entitlements Bilingual One-Page Statement Pack v1, Monthly Entitlements Bank Statement Pack v1 (additive migration `20260814120000_add_entitlements_bank_statement`), Employee Entitlements Leave Management Pack v1 (additive migration `20260815090000_add_leave_expected_return_date`), and Privacy Toggle Tier A v1 — all four already merged, tagged, and documented individually. `package.json` `version` `2026.5.0` → `2026.5.1` is the only additional tracked-file change. Full validation before packaging: Backend/Frontend/Electron `tsc --noEmit` clean · `prisma validate` clean · `prisma migrate status` 61/61 applied · Backend 196 files/3087 tests (2 intentionally-skipped leftover diagnostic stubs, pre-existing and unrelated) · Frontend 215 files/3943 tests · Electron 26 files/499 tests — all green. Packaging audit: `app.asar` and `extraResources` content inspected directly for leaked dev/test/source-map files (none found, matches `electron-builder.yml`'s exclusion filters); 61 Prisma migrations present; no `.env`/secret files bundled. Golden Database SHA-256 `da769b8c70f372c0ab56cc2d5670e3316f27af6781c48bbd65074005b7bfdf24` (3,358,720 bytes) verified byte-identical in three places: source `backend/data/manar.db` · `win-unpacked/resources/backend/data/manar.db` · extracted directly from inside `Setup.exe` via `7za`. Installer `AlManarERP-Setup-2026.5.1.exe`, 138,282,665 bytes (131.87 MiB), SHA-256 `e95021e4735572f9bb493c7b87e09d7edbd9a94bea481eb55a40e0ab5d831931`. GUI-only install/first-run flow not driven interactively — no desktop session available in this environment — covered by the Product Owner's completed manual visual and functional review, confirmed prior to this release. TypeScript zero errors on all three surfaces) |
| **Production HEAD before that** | `6ae6536b` — release `stable-production-release-2026.5.0` (**Production Release 2026.5.0** — merge of `audit/full-project-audit-2026-08-13`. Packages the **Full Project Engineering Audit**, **Prisma Schema & Migration Reconciliation Pack v1** and **Invoice Items Foreign Key Reconciliation Pack v1** into a new self-contained Windows installer; `package.json` `version` `2026.4.0` → `2026.5.0`. The audit was a six-agent parallel review (backend core · business modules · React frontend · Electron/IPC security · build/packaging/schema · hygiene). **RBAC-01 (CRITICAL)**: a demoted `SYSTEM_ADMIN` kept full privileges for up to 12 hours — `authenticate` set `req.user` from the raw JWT payload and refreshed only `req.permissions` from the database, while `requirePermission`/`requireRole` short-circuit on `req.user.roleName === SYSTEM_ADMIN`, a value baked into the token at login and never re-derived; changing a role via `PATCH /api/users/:id` invalidates no session anywhere, so the bypass survived the demotion until token expiry. `roleId`/`roleName` are now overwritten from the live database row on every request, at no extra query cost. **RACE-01**: stale list responses overwrote fresher ones in `ResourcePage.load` (every generic CRUD module), the three `Salaries` loaders and the three `Accounting` tab loaders — the `reqIdRef` guard already proven in `Invoices.tsx` is now applied to all seven. **A11Y-01**: the only topbar logout affordance was a `<div onClick>` unreachable by keyboard — now `role="button"`, focusable, Enter/Space activated, with no visual change. **SEC-01**: public `GET /api/verify/:uuid` gained a 60-request/15-minute limiter against UUID enumeration. **SEC-02**: the internal backup secret is now compared with `crypto.timingSafeEqual`. **MONEY-01**: `salaries.service.summary()` accumulated KWD with raw floating-point `+` and now routes through `roundMoney`/`sumMoney`. **MSG-01**: `markPaid` claimed a journal posting that payroll explicitly never performs. **TEST-01**: 26 frontend tests across 8 files had been failing on `production` itself — proven pre-existing by running them against the stashed tree — from three "test lagged behind the code" causes (UI text moved to i18n keys while assertions grepped the old Arabic literals; a `useUI` mock returning `false` while `useT()` destructures `{ lang }`; two files on the node environment whose import chain reaches `uiStore`, which touches `localStorage` at load). Only the tests were changed; frontend is now **3837/3837**, retiring a baseline carried across two releases. Reconciliation: `migrate diff` had proposed rebuilding three tables on every run. Official tooling only (`migrate status`, `validate`, `migrate diff` in three directions, `db pull`) proved that replaying the migration history reproduces the live database exactly, so `schema.prisma` was the drifted side — hand-written migration `20260625100000` created both `updatedAt` columns with `DEFAULT CURRENT_TIMESTAMP` which the schema never declared, now fixed with `@default(now())` and zero database change. The last drifted table was `invoice_items`: the schema has declared `price ProjectPrice? @relation(..., onDelete: Restrict)` since the relation was added, but migration `20260617130000` used `ALTER TABLE ADD COLUMN` and SQLite cannot attach a foreign key that way — the column and index existed, the constraint never did, so the database enforced no referential integrity between invoice line items and price agreements. Migration `20260814010000_add_invoice_items_price_fk`, generated verbatim by `migrate diff --script` and applied with `migrate deploy` (not `migrate dev`, which reads the two pre-existing orphan tables as drift and offers a reset), adds `invoice_items.priceId → project_prices.id ON DELETE RESTRICT ON UPDATE CASCADE`. Verified before the write: 159 rows all with `priceId IS NULL`, zero orphan `priceId`/`invoiceId`, `integrity_check = ok`, `foreign_key_check` empty, no referencing table, no triggers/views, exactly two indexes both recreated, and a SHA-256-verified byte-identical backup. Verified after: the SHA-256 of all 159 rows unchanged (`6c88d27a41585b18380259fea51aff36cbfabcdcc0a5c122ab79230b75158149`), id range 12–218 and `sqlite_sequence` 218 preserved, and the constraint **enforced at runtime** — a dangling-`priceId` insert is rejected, probed inside an always-rolled-back transaction. `migrate diff --from-migrations --to-schema-datamodel`, the comparison `migrate dev` itself uses, now reports an empty migration. 24 files (23 modified, 1 new migration). Backend 193 files/3018 tests ✅ · Frontend 209 files/3837 tests ✅ · Electron 26 files/499 tests ✅ · TypeScript zero errors on all three surfaces. Product Owner manual visual review: **completed** prior to release authorization) |
| **Production HEAD before that** | `f8f7a581` — release `stable-production-release-2026.4.0` (**Production Release 2026.4.0** — merge of `feature/gdrive-data-safety-pack-v2`. Packages **Google Drive Data Safety Pack v2** and **Test Isolation Pack v1** into a new self-contained Windows installer; `package.json` `version` `2026.3.2` → `2026.4.0`. Data Safety Pack v2 closes the five critical findings of the Google Drive data-flow audit. **F-01**: «رفع الآن» bypassed the decision engine entirely — `performUpload` called `uploadInternal` directly with no `decide()` and no baseline snapshot, and the optimistic-concurrency guard was conditional on `expectedRemote !== undefined`, so the manual upload path silently overwrote a newer cloud copy with no conflict dialog; the path is now decision-driven (UPLOAD executes · CONFLICT surfaces · DOWNLOAD is refused · NONE reports up-to-date) and `expectedRemote` became a REQUIRED field of `UploadOptions`, making the bypass a compile error rather than a review item. **F-02**: `withTimeout` used `Promise.race`, which never cancels the losing promise — a timeout stopped the waiting, not the work, so the sync mutex and the runtime lock were released while an operation was still running, and a late-finishing startup download could stop the backend `main` had just started and swap `manar.db` under a working user; replaced by `withDeadline`, which awaits real settlement and threads an `AbortSignal` into every Drive call (merged with each request's own timeout via `AbortSignal.any`), with `throwIfAborted` before every mutating step and the signal deliberately ignored past the point of no return; `withRetry` now preserves the original error via `cause` so an abort in a later attempt is still recognised as one. **F-03**: decision rule (4) downloaded over a pristine seed with no recency comparison at all — correct for an empty template, wrong for a Golden Database carrying the latest production snapshot, which was therefore replaced by an OLDER cloud copy; `prepare-seed-data.js` now emits `golden-manifest.json` (sha256 · sizeBytes · `dataModifiedAt` frozen at packaging time) and the rule consults it, yielding CONFLICT instead of an automatic DOWNLOAD when the manifest matches the local database by hash AND is newer than the remote, with a missing/corrupt/non-matching manifest falling back to the previous behaviour exactly. **F-04**: the installer shipped `sync-metadata.json` and `gdrive-account.json` from the BUILD machine — the former granted a new device a sync history it never earned, turning a safe CONFLICT into a silent UPLOAD over Drive, the latter leaked the developer's Google account address; state-file seeding is removed entirely and `seed-data` now carries the golden manifest and a README only. **F-05**: restore left sync state untouched, so the next decision saw «local changed, remote unchanged» ⇒ UPLOAD and shutdown sync pushed a weeks-old restored database over the current cloud copy with no dialog; both restore paths now write `sync-pending-review.json`, which blocks BOTH automatic directions until an explicit user operation clears it — a standalone marker file was chosen over a field inside `sync-metadata.json` because `loadMetadata` swallows corruption and returns defaults, so a field would vanish exactly when it matters while file EXISTENCE survives a torn write. Test Isolation Pack v1 closes a defect found during the Development Database Recovery audit: `backup.verify.test.ts` used the real Prisma singleton, whose `DATABASE_URL` comes from `.env`, and executed INSERT + DELETE against the developer's own database — row counts stayed identical so nothing ever surfaced, but the SQLite file changed on every `npm test`; the root cause was the absence of any test-environment isolation, not that one test, so `vitest.setup.ts` now redirects DATABASE_URL/BACKUP_DIR/ATTACHMENTS_DIR/DATA_DIR to a per-worker sandbox before any application module loads (dotenv never overrides an existing variable, so `.env` cannot win) and asserts the redirection before every single test case, while `vitest.globalSetup.ts` hashes the development database before the first test and after the last and fails the run if it changed with no live backend to explain it — no existing test was edited. Also fixes a stale assertion in `electronBuilderPackaging.test.ts` that pinned the version to `2026.2.` literally and had therefore been failing since 2026.3.0, leaving the calendar-versioning contract unenforced across two releases; it now guards the shape, not one release. 27 files (19 modified, 8 new); Electron main process + backend + frontend + build pipeline. No Prisma/schema/migration change, no new permission key, no UI layout change. Golden Database: `backend/data/manar.db`, 3,289,088 bytes, SHA-256 `6b35cf750eeeb170505344e761670bf6588ff1fdb22fa030707bde6df93c821a`, `integrity_check = ok`, 61 applied migrations, 75 tables — verified byte-identical in three places (source · `win-unpacked/resources` · extracted from inside `Setup.exe`). Installer `AlManarERP-Setup-2026.4.0.exe`, 138,240,953 bytes (131.83 MiB), SHA-256 `83c298e3790b8df60b0632ed9f3db92a6e09ba1c5b0a1a09ad0fcf5f1de6b8c9`. Backend 193 files / 3018 tests ✅ · Electron 26 files / 499 tests ✅ (the long-standing single failure resolved by the versioning fix) · Frontend 3787/3813 with the pre-existing 26-test/8-file i18n baseline unchanged in count and identity. TypeScript zero errors on all three surfaces. Product Owner manual visual review: **completed** prior to release authorization) |
| **Production HEAD before that** | `a24cc25b` — release `stable-production-release-2026.3.2` (**Production Installer Release 2026.3.2** — merge of `feature/production-release-2026.3.2`. Packages a new self-contained Windows installer including everything merged onto `production` since the 2026.3.1 installer: Production Resource Integrity Audit & Fix Pack v1 (Employment Contract's Public Authority for Manpower emblem asset fix, already merged, tagged, documented). `package.json` `version` (`2026.3.1` → `2026.3.2`) is the only additional tracked-file change. Packaging audit: `app.asar` inspected directly — `package.json`, `electron-dist/main.js`, `frontend/dist/index.html` present; zero real test/debug/instrumentation traces (only the `debug` npm library and a `TemplateStudio` filename false-positive); 56 migrations, `schema.prisma`, seed DB, seed-data, and runtime-requirements manifest all present in `extraResources`. A pre-existing, unrelated 15.7 KB orphaned `frontend/public/contract_emblem.png` (superseded by the fix pack's `frontend/src/assets/` copy but never deleted, predating this release) was observed and flagged, not touched — out of this release's scope. Runtime audit: packaged backend launched standalone against a copy of the real seeded database — `/api/health` OK, admin login succeeded with the full permission set, `/api/cheque-designer-templates` responded correctly, all 56 migrations applied with zero errors. GUI-only surfaces were not driven by Claude — no interactive desktop session available — covered instead by the Product Owner's completed visual review, with no source changed beyond the already-reviewed fix pack. Installer `AlManarERP-Setup-2026.3.2.exe`, 138,155,203 bytes (131.76 MiB), SHA-256 `b4ad8c73cb1aa81251f5e68292f890fb9323ca068a987ec0af6bc0b30ea91476`; `win-unpacked` 468,078,832 bytes (446.4 MiB). TypeScript zero errors on backend/frontend/electron; `build:back`/`build:front`/`electron:build`/`npm run dist` all pass. Product Owner manual visual review: **completed** prior to release authorization) |
| **Previous production HEAD** | `d94dfe26` — release `stable-production-resource-integrity-audit-fix-pack-v1` (**Production Resource Integrity Audit & Fix Pack v1** — merge of `feature/production-resource-integrity-audit-fix-pack-v1`. Fixes the Employment Contract's Public Authority for Manpower emblem not rendering in the packaged production build: `EmploymentContractTemplate.tsx` loaded it via a hardcoded root-absolute `public/` path instead of a bundled ES module import, which resolves fine under Vite's dev server but breaks under `file://` packaging (`base: './'`) since a root-absolute path resolves against the filesystem root, not `frontend/dist/`. Fixed by moving the asset into `frontend/src/assets/` and importing it as an ES module, matching every other bundled image in the project. Audited every other resource-loading path (backend font/DB/attachments/backup resolution, print/PDF `<base href>` composition, branding/signature/stamp data-URL assets, QR/barcode generation, `electron-builder.yml` packaging config) — no other instance of this bug class found. 2 files (1 modified, 1 new); frontend-only. No schema/permission/route change. TypeScript zero errors on backend/frontend/electron; frontend build verified (asset emitted as a correctly hashed, relative path); 105 targeted frontend tests + full backend suite (186 files/2874 tests) green. Product Owner manual visual review: **completed** prior to release authorization) |
| **Production HEAD before that** | `0712c905` — release `stable-production-release-2026.3.1` (**View Zoom Manual Save Pack v1** — merge of `feature/view-zoom-manual-save-pack-v1`. Replaces View Zoom Persistence Pack v1's auto-save design (`zoom-changed` listener + 400ms debounce) with an explicit manual save. Root cause, found via a live runtime investigation (temporary file-based logging instrumentation on `did-finish-load`/`zoom-changed`/navigation/focus/blur events built into a real production installer, run by the Product Owner, then fully reverted — zero trace confirmed via `git diff`): `zoom-changed` fires ONLY for mouse-wheel zoom, per Electron's own docs and confirmed live down to sub-second timestamps — never for the `role: 'zoomIn'`/`'zoomOut'` items the View menu actually uses. The auto-save path had never captured a single menu-driven zoom change; Chromium's own per-origin zoom resync on the next same-page navigation (`did-navigate-in-page`) then reapplied the stale disk value to the live window — captured in the log as a revert exactly once, within 249ms of the first navigation after a menu zoom change, never again for the rest of the session. `viewZoomPreference.pure.ts` lost `createZoomPersistenceController`/`ZoomPersistenceController`/`DEFAULT_SAVE_DEBOUNCE_MS`; `readSavedZoomLevel`/`saveZoomLevel`/`clampZoomLevel` and the on-disk format are unchanged. `main.ts` keeps the same one-time `.once('did-finish-load', …)` restore (never reapplied mid-session) and adds one View-menu item, "💾 حفظ مستوى التكبير الحالي كافتراضي", reading the live zoom via `getZoomLevel()` and writing it synchronously via `saveZoomLevel` — no debounce, no listener — then showing a native `Notification`. 3 files (2 modified, 1 test file rewritten: 13 obsolete tests removed, 10 new); electron only. TypeScript zero errors; `electron:build` passes pre- and post-merge; Electron+scripts 463/464 (one pre-existing unrelated failure, confirmed via `git stash` to already fail on unmodified `production`). No schema/permission/route change. Product Owner manual visual review: **completed** prior to release authorization)
| **Official reference** | **`PROJECT_MASTER_STATUS.md`** — single source of truth reconstructed from Git; this file (PROJECT_STATE.md) is the working summary · **Release history:** the current release plus the 15 most recent are in the release log below; everything older is archived verbatim in [`docs/history/`](docs/history/README.md) |
| **Latest stable tag** | `stable-complete-user-manual-v1` (2026-09-08) → merge `57e2c8a1` · checkpoint `checkpoint-complete-user-manual-v1` → `00ef23c8`. Documentation release — no installer, no version bump |
| **Previous stable tag** | `stable-production-release-2026.5.9` (2026-09-07) → release commit `ab9480d9` — **the current Desktop installer release**. Earlier tags are listed in the release log below and, for older ones, in `docs/history/` |
| **Application version** | **`2026.5.9`** — read from `package.json`. Set by **Production Release 2026.5.9** (installer `AlManarERP-Setup-2026.5.9.exe`). **Unchanged by the two documentation releases that followed it**, neither of which touched `package.json` |
| **Total stable releases** | 462 (all merged onto `production`; window 2026-06-07 → 2026-09-08) — `git tag -l "stable-*"` count |
| **Latest validation** | The last full code validation is the one recorded in the **Production Release 2026.5.9** entry in the release log below (backend/frontend/electron `tsc --noEmit`, `prisma validate`, `migrate status` 71/71, packaging audit, and both backend and GUI smoke tests — all green). **No code has been merged since**, so no newer code validation exists: the two releases after it (Complete User Manual v1 and this rotation package) are documentation-only and were validated as documentation — PDF/QA and archive-integrity checks respectively |
| **Remote sync** | `production` == `origin/production` (verified with `git rev-parse`; 0 ahead / 0 behind) — رأسه commit إغلاق الهاش فوق توثيق الإصدار `291e1a20`، والمرساة المعتمدة للإصدار هي merge `814116b4`. Tag `stable-employee-debt-acknowledgment-form-v1` (→ merge `814116b4`) is pushed, and `checkpoint/pre-employee-debt-acknowledgment-v1` (→ `a3c5b18e`) was already present from before the package |
| **Currency display** | Company setting `finance.currencyDisplayLanguage` (english default / arabic) — **selects the symbol only, never the digits**: English `1,250.000 KWD`, Arabic `1,250.000 د.ك`. **Digits are always Western** and money always carries **3 fixed decimals** (`0` → `0.000`; not-applicable → `—`). Standalone values (cards, drawers) put the **number before the symbol**; table and report cells carry the **bare number**, with the symbol appearing **once in the column header** (`المبلغ (KWD)`). Standardized on screen, in print, in the Chromium PDF and in the backend HTML reports by `stable-financial-number-date-presentation-standardization-v1`. Excel stays numeric (`#,##0.000`); CSV and the NBK salary file are unchanged. |
| **DB path (dev)** | `backend/data/manar.db` |
| **DB path (prod)** | `userData/data/manar.db` |
| **UI font** | `"IBM Plex Sans Arabic"` (WOFF2, local) → `"Cairo"` → `"Tajawal"` → Arial |
| **Print/form font** | `"Cairo", Arial, sans-serif` (all printed documents) — the new EN+HI administrative-form variant alone uses `"Cairo", "Noto Sans Devanagari", Arial, sans-serif` (`fontRegistry.ts`'s `DOC_FONT_STACK_EN_HI`), so Latin/digits still render as Cairo and only Devanagari codepoints fall through to the new face; every Arabic and English document keeps the unchanged stack |
| **Font CDN** | None — all fonts are local assets, including the two new Noto Sans Devanagari woff2 weights (OFL 1.1) |
| **Backend port** | `127.0.0.1:48211` |
| **Last DB reset** | 2026-06-13 — full operational reset; system config and COA preserved |

---

## Latest Release — Employee Debt Acknowledgment Administrative Form v1

| Field | Value |
|-------|-------|
| **Package** | نموذج إداري جديد «إقرار دين موظف» بثلاثة قوالب رسمية مستقلة (العربية / English / हिन्दी)، شاشة إدخال واحدة، وهندسة طباعة مخصّصة لورق الشركة المطبوع مسبقًا |
| **Release status** | **`RELEASED / COMPLETED`** — Feature Release |
| **Product Owner Visual Review** | **APPROVED** — «تمت المراجعة البصرية واعتماد المخرجات النهائية» |
| **Release date** | 2026-09-10 |
| **Desktop version** | **`2026.5.9`** — **لم يتغيّر**: إصدار ميزة لا إصدار سطح مكتب. لا رفع نسخة، ولا مثبِّت، ولا وسم سطح مكتب جديد |
| **Branch / commits** | `feature/employee-debt-acknowledgment-form-v1` · `4842aaf9` (التنفيذ) · `bdb1689e` (التوثيق) · `975402e4` (نوع في اختبار) · `07efbf52` (التحسينات الوظيفية) · `58594cf3` (مساحة التوقيع) · `e57b0e92` (التحسينات النهائية: أربع صفحات وملحق مزدوج) · `35e31961` (اتجاه كل الجداول العربية) · `9e2f0b2e` (دعم أكثر من 12 قسطاً) · `61d6d5f1` (تسمية عمود الرصيد · الرصيد عند التوقيع · قيم افتراضية وآيبان ثابت) · `a1f44846` (أقساط بدنانير صحيحة) · `dafc3e17` (**صيغة القسط الواحد في البند 4**) |
| **Base production HEAD** | `a3c5b18e` |
| **Checkpoint tag** | `checkpoint/pre-employee-debt-acknowledgment-v1` → `a3c5b18e` (كان موجودًا؛ لم يُعَد إنشاؤه) |
| **Final feature HEAD** | `618f00b0` — سبعة عشر commit فوق `a3c5b18e` |
| **Merge commit** | `814116b4` — merge `--no-ff`، أبواه `a3c5b18e` (production) و`618f00b0` (feature). لا squash ولا rebase ولا fast-forward |
| **Stable tag** | `stable-employee-debt-acknowledgment-form-v1` → **`814116b4`** (يشير إلى **commit الدمج** نفسه، لا إلى commit التوثيق الذي يليه) |
| **Desktop version** | `2026.5.9` — **لم يتغيّر** |
| **Schema / migrations** | **لا شيء** — نموذج + معاينة + طباعة كنمط النماذج الإدارية؛ المسوّدات على `usePrintDraftStore` القائم |
| **Permission** | `forms.read` + `forms.print` القائمتان — **لا مفتاح صلاحية جديد** |
| **Print profile** | `employee-debt-acknowledgment-letterhead` — جديد، `selectable: false`، هوامش 40mm/16.5mm/20mm/16.5mm. **لم يُمَسّ أي ملف طباعة قائم** ولا قائمة القابلة للاختيار |
| **Print engine** | إعادة استخدام كاملة: `FormLayout`/`FormPage`، مركز الطباعة، «المعاينة الدقيقة» (`composeStyledFromNode` → `printToPDF`). لا محرّك طباعة/PDF/Word جديد، ولا اعتماد على Office |
| **النصّ** | ثلاث حزم منقولة **حرفيًا** من ملفات Word في `docs/` (مُلتزَمة الآن)؛ لا ترجمة وقت التشغيل ولا اشتقاق لغة من أخرى. يحرسه اختبار يعيد بناء كل فقرة ويطابقها داخل DOCX الأصلي |
| **الهندسة — مقيسة** | `printToPDF` بنفس خيارات الإنتاج ثم قياس حبر كل صفحة: **pass للغات الثلاث** — A4 (209.89×297.01mm)، أقل حزام علوي **40.32mm**، أقل حزام سفلي **23.30mm**، بلا قصّ ولا حبر خارج الصفحة ولا ترويسة/تذييل/QR |
| **عدد الصفحات** | **`2 + 2 × ceil(الأقساط ÷ 12)`** — أي **4 صفحات حتى 12 قسطاً** (كما اعتُمد: صفحتا المستند + نسختا ملحق)، و**6** حتى 24، و**8** حتى 36. صفحة «التعليمات» لم تعد صفحةً في المستند (انتقلت إلى حوار على الشاشة، ونصّها باقٍ كاملًا في حزم المحتوى) |
| **Tests** | **+336** (41 أمانة نصّ مقابل DOCX · 29 واجهة/هندسة · 98 حاسبة الأقساط والتقسيم والدنانير الصحيحة · 60 عزل لغوي وبوابة وبيانات ثابتة ومساحة توقيع · 104 صفحات المستند والملحق واتجاه الجداول والرصيد والقيم الافتراضية وصيغة القسط الواحد · 5 خادم) — كلها ناجحة. الحزمة الأمامية كاملةً: **4540/4543** |
| **Validation** | `tsc --noEmit` أمامي وخلفي نظيف · `build:back` و`build:front` ناجحان · الحزمة الكاملة: أمامي 4263/4266، خلفي 3668/3673، Electron 502/502 |
| **إخفاقات قائمة قبل الحزمة** | 3 أمامية (`employeeCompensationBatchPrint` ×1، `entitlementsBankExport` ×2) و5 خلفية (`chequeDesignerTemplates`) — **مُثبَت أنها تفشل بنفس الصورة على `a3c5b18e` قبل هذه الحزمة**، فليست انحدارًا منها |
| **Golden DB** | **لم تُلمَس** — لا مسار في هذه الحزمة يفتح قاعدة بيانات؛ المقياس يعمل بـ Electron وحده على HTML مُولَّد ببيانات مُصطنعة |
| **التحسينات الوظيفية** | (1) **حساب الأقساط تلقائيًا** بوحدة تقريب المشروع (`roundMoney`/`sumMoney`)، وفارق التقريب على القسط الأخير وحده بثابت `sum(installments) === debtAmount` بالضبط. (2) **توليد جدول السداد شهريًا** مع الاحتفاظ باليوم المفضَّل (31/01 ⇒ 28/02 ⇒ **31**/03؛ وكبيسة 29/02)، والرصيد محسوب لا مُدخَل وينتهي عند `0.000`، وسعة **12 قسطًا** مشتقّة من `annexRowCount` لا مكتوبة، وتعديل يدوي مسموح بسؤالٍ قبل الاستبدال. (3) **بيانات شركة ثابتة**: سجل تجاري `509001` ورقم موحّد `554731` من `constants.ts` وحده، للقراءة فقط، مفروضة على كل حالة — **بلا إعدادات شركة عامة جديدة**. (4) **صفر عربية في القالبين الإنجليزي والهندي**: نظائر لاتينية لخمسة عشر حقلًا بلا سقوط إلى العربية، وقسم إدخال يظهر للقالب الأجنبي وحده، وحارس يغطي كتل يونيكود العربية كلها ويقبل الديفاناغارية، ويمنع **المعاينة والطباعة وتصدير PDF** معًا. (5) **مضاعفة مساحة التوقيع** في الخانات السبع × ثلاث لغات |
| **قياس ما بعد التحسينات** | **pass** — عدد الصفحات لم يتغيّر (5 لكل لغة)، والأحزمة كما هي (علوي ≥ 40.32mm · سفلي ≥ 23.30mm). نسبة مساحة التوقيع المقيسة من الشجرة المُصيَّرة: **2.00** في 21 حالة. مسح الرموز المرسومة من خرائط `/ToUnicode` في الـPDF: **صفر رمز عربي في EN و HI** (81 و130 نقطة ترميز مقروءة)، وديفاناغارية سليمة في HI |
| **التغيير الوحيد على ملف مشترك** | `FormLayout.exportIntercept` — شقيقة `printIntercept` بنفس عقدها، **اختيارية**: بلا اعتراض يستدعي الزرُّ `doExportPdf` مباشرةً كما كان، ولا نموذج آخر يمرّرها (يحرسه اختبار). أُضيفت لأن طباعةً ممنوعة و«حفظ PDF» مفتوحٌ بجانبها ليست بوابة |
| **التحسينات النهائية** | (1) **ملحق (أ) العربي يقرأ من اليمين**: «رقم القسط» أقصى اليمين ثم تاريخ الاستحقاق فالمبلغ فالرصيد و«ملاحظات/رقم الإيصال» أقصى اليسار — بإعادة ترتيب أعمدة **حقيقية** (`annexColumns` مع `annexCellRoles` في القفلة نفسها)، **بلا `transform` ولا نصّ معكوس**. قِيس قبل/بعد من الشجرة المُصيَّرة: «رقم القسط» انتقل من x=140 إلى x=707. الإنجليزي والهندي لم يُمسّا. (2) **التعليمات خرجت من المطبوع ولم يُحذف منها حرف**: ثمانية صفوف وخمسة مصادر وتنبيه باقية كاملةً في الحزم الثلاث، وتُعرض في حوار `Modal` **خارج `FormLayout`** — أي خارج `.form-page`، فلا تبلغ ورقًا ولا PDF ولا معاينةً ولو كانت مفتوحة، ولغتها لغة القالب لا لغة الواجهة. (3) **الملحق يُطبع مرتين** من مكوّن واحد و`data.schedule` واحد، والثانية آخر المستند، بلا وسم «نسخة» ولا علامة مائية. (4) **أربع صفحات بالضبط**: الضغط على الصفحة 2 وحدها وبأقلّ درجة تكفي — الفراغ الرأسي للغات الثلاث، وارتفاع السطر وحجم الخط **للإنجليزية وحدها** لأنها اللغة الوحيدة التي لم يكفها ما دونه. العربية والهندية بخطّهما وتباعدهما الأصليين |
| **قياس الأربع صفحات** | **pass** — 4 صفحات في اللغات الثلاث، مقيسة من `printToPDF` لا مُعلَنة. الحزام العلوي 40mm محفوظ على الصفحات الأربع. و**الصفحة 2 لم تستهلك إعفاءها** من حزام 20mm السفلي: أدنى قيمة فيها 23.70mm (الإنجليزية) — فبقيت الهندسة المعتمدة كاملةً، **ولم يُغيَّر ملف الطباعة العام** ولا أُضيفت `@page` مسمّاة. نسختا الملحق متطابقتان ببصمة الحبر **المرئي** (تُبنى بعد القصّ، فلا يخدعها ما يفيض بين الصفحتين). مساحة التوقيع ما زالت **2.00** في 27 حالة |
| **اتجاه كل الجداول العربية** | إغلاق `F-14`. **لا جدول** من الجداول السبعة في أيٍّ من ملفات DOCX الثلاثة يحمل `w:bidiVisual`، فكلّها تُصفّ من اليسار — ولذلك كتب مؤلّف الملف العربي شبكاته **معكوسة** (`6900,2460` مقابل `2460,6900`) ليخرج شكله صحيحًا. وجذرُ مستندنا `rtl` يرسم الخلية الأولى في DOM يمينًا، فترتيب DOM العربي يجب أن يكون **عكس** ترتيب الشبكة. صُحِّحت الجداول الثمانية كلها: بيانات الدائن · بيانات المدين · التوقيعات (§6) · الشهود (عمود واحد) · ملحق السداد ×2 · توقيعات الملحق ×2. قِيس بالبكسل: «الاسم/اسم المنشأة» انتقل من x=140 إلى x=633، و«المدين» من x=140 إلى x=473. **بلا `transform` ولا `scale` ولا اتجاه مقلوب ولا نصّ معكوس** — و`direction` يظهر مرة واحدة في المستند كلّه على `.eda-val--ltr` (عزل رقم/تاريخ داخل فقرة عربية). وكل قيمة مربوطة بعمودها بدورٍ صريح (`annexCellRoles` · `signatureColumnRoles` الجديد) لا بموضعها، فاسم منطقة التوقيع صار يُشتقّ من الدور بدل الفهرس |
| **الإنجليزية والهندية: صفر تأثّر — مُثبَتًا** | بصمة الحبر المرئي لصفحاتهما الأربع **متطابقة حرفًا بحرف** قبل التغيير وبعده. العربية وحدها تغيّرت |
| **الثوابت بعد إصلاح الجداول** | **pass** — 4 صفحات لكل لغة · نفس الهندسة بالضبط (AR: 40.32/44.47 · 40.50/49.89 · 40.43/138.79 ×2) · نسختا الملحق متطابقتا البصمة · مساحة التوقيع **2.00** في 27 حالة · صفر حرف عربي في EN و HI · لا صفحة بيضاء ولا قصّ. وأُضيف إلى المقياس فحصٌ بصريّ لكل جدول: تُرتَّب خلايا كل صفّ بإحداثي حافتها اليسرى بعد التصيير وتُقارَن بالصورة المطلوبة، ترويسةً وجسمًا |
| **صفر تغيير على المحرّك المشترك في هذه الجولة** | لم يُمَسّ `FormLayout` ولا `composeDocument` ولا `styleCapture` ولا `printProfiles`. التغييرات كلها داخل حزمة النموذج ومقياسها |
| **دعم أكثر من 12 قسطاً** | **الخلل**: `MAX_INSTALLMENTS` كان يساوي `annexRowCount` حرفيًا، فصار عددُ صفوفِ **ورقةٍ** حدًّا لعدد **الأقساط** — أي عدد فوق 12 يُرفض في التحقّق ويخرج جدولًا فارغًا. **الفصل**: `ROWS_PER_ANNEX_PAGE = 12` (مشتقّ من ملفات DOCX، تصميمُ صفحة) و`MAX_INSTALLMENTS = 120` (رقم مستقلّ: عشر سنوات من الأقساط الشهرية، سياجٌ تقنيّ لا حدّ قانوني، ويحرس اختبارٌ ألّا يتساويا). **التقسيم**: دالّة خالصة `paginateInstallmentSchedule` تقطع الجدول الواحد للعرض وحده — **جدول واحد في المستند**، يُحرَّر في الشاشة ويُقسَّم للطباعة. كل صفحة ملحق تبقى **12 صفًّا**، وما زاد عن الأقساط يبقى فراغات الأصل، **والترقيم يتّصل** (الصفحة الثانية 13–24 لا 1–12). **النسختان**: مجموعة كاملة ثم مجموعة كاملة `(A1 A2 A3)(A1 A2 A3)` — لا صفحةً صفحةً — وآخر الورق آخر صفحة من الثانية |
| **قياس التقسيم** | **pass** — تسعة مستندات: 3 سيناريوهات (5 · 13 · 25 قسطاً) × 3 لغات. عدد الصفحات المقيس من الـPDF طابق الصيغة في التسعة: **4 · 6 · 8**. و13 قسطاً تولّد **13 صفًّا** لا جدولًا فارغًا. الأحزمة لم تتغيّر بتغيّر العدد (علوي ≥ 40.32mm · سفلي ≥ 23.70mm)، وصفحات الملحق كلها `40.43/138.79`. مساحة التوقيع **2.00** في كل خانة (9 · 13 · 17 خانة). صفر صفحة تعليمات، صفر صفحة بيضاء، صفر حرف عربي في EN/HI |
| **توافق خلفي** | سيناريو الخمسة أقساط يطابق الهندسة المعتمدة **رقمًا برقم** (`40.32/44.47 · 40.50/49.89 · 40.43/138.79 ×2` للعربية) — فالمسوّدات القائمة (≤ 12) تُطبع كما كانت |
| **تسمية عمود الرصيد** | «الرصيد بعد السداد» ⇐ **«الرصيد المتبقي بعد القسط»**، و«Remaining balance after instalment»، و«किस्त के बाद शेष राशि». **الاسم وحده**: الحساب وموضع العمود وترتيب RTL وعدد الصفوف والتقسيم لم يُمسّ شيء منها. الجدول `table-layout: auto` فأعاد التوزيع (142 ⇐ 189px للعمود) وبقيت الصفحات والأحزمة كما هي في السيناريوهات التسعة — لا قصّ ولا فيض. وهو الانحراف المقصود الوحيد عن نصّ DOCX، بقائمة استثناء مغلقة في اختبار أمانة النصّ تتحقّق أيضًا أن الاسم القديم ما زال في ملف Word |
| **الرصيد عند التوقيع** | جدول الأقساط يُبنى عليه لا على أصل الدين (إغلاق `F-10`). يتبع أصل الدين تلقائيًا ما دام لم يُمسّ؛ وحين يُكتب بيد يصير `balanceManual` فلا يدهسه تغييرُ أصل الدين، وتظهر ملاحظة بذلك مع زرّ إعادة مزامنة. العلم **جزء من بيانات المستند** فيُحفظ في المسودّة ويعود معها. مثال: أصل 1000 ورصيد 750 و3 أقساط ⇒ `250.000 × 3` والرصيد ينتهي `0.000`. ورصيد فارغ يعود إلى أصل الدين فلا يتعطّل مستند لم يُملأ |
| **قيم افتراضية خاصة بالمستند** | الممثل القانوني `حسن فلاح نايف-مدير` (ونظيره اللاتيني `HASSAN FALAH NAYEF - MANAGER` مكتوبًا لا منقولًا)، ووسيلة الاتصال `tel:94404401`، ووسيلة التسليم **نقدًا**. تُملأ في الحقل الفارغ وحده عبر `applyAutofill` التي لا تدهس إدخالًا قائمًا — document-local لا master data، والتعديل يبقى ولا يمحوه تغييرُ الموظف، ويُحفظ في المسودّة |
| **آيبان الشركة** | `KW78NBOK0000000000002039042550` — ثابت **بمصدر واحد** (`CREDITOR_IBAN`)، يُفرض في `withFixedCreditorData` مع السجل التجاري والرقم الموحّد، فلا يتبع الموظف ولا اللغة ولا تستطيع مسودّة قديمة تغييره. ويُعرض في الإدخال **للقراءة فقط** |
| **أقساط بدنانير صحيحة** | القسط العادي `round(الرصيد ÷ العدد)` **دينارًا صحيحًا**، والقسط الأخير يستوعب الفارق كلّه. `500 ÷ 12 ⇒ 42.000 × 11 ثم 38.000`، و`1000 ÷ 12 ⇒ 83.000 × 11 ثم 87.000`، و`1000 ÷ 13 ⇒ 77.000 × 12 ثم 76.000`. وفلوس الرصيد كلها على الأخير (`500.500 ÷ 12 ⇒ 42.000 × 11 ثم 38.500`). الثوابت: المجموع = الرصيد بالضبط · الرصيد الأخير `0.000` · لا قسط صفر ولا سالب — يحرسها اختبار على كل رصيد من 1 إلى 60 × ثمانية أعداد أقساط |
| **حواف التقريب** | التقريب إلى أقرب دينار قد يبتلع الأخير (`22 ÷ 12` يعطي عاديًّا 2 و`2 × 11 = 22`) ⇒ ينزل العادي إلى **الدينار الأدنى** فيبقى للأخير موجب (`1 × 11` ثم `11`). وحدٌّ لا حيلة فيه: **رصيد أصغر من عدد الأقساط** (10 د.ك على 12 قسطًا) — استحالة حسابية لا خلل تنفيذ، فيُقسَّم بثلاث خانات (السلوك السابق) حفظًا للمجموع ولمنع الصفر والسالب |
| **البند 4** | إدراجان اثنان لا أكثر: تقييد «قيمة كل قسط» بما عدا الأخير، وتسمية الأخير بأنه المبلغ المتبقّي (`each except the last` · `the final, balancing instalment` · `अंतिम को छोड़कर` · `शेष राशि के रूप में`). ولا يُستثنى البند من فحص الأمانة: يُعكس الإدراجان ثم يُطابَق الناتج حرفيًا بملف Word، فأي تغيير آخر يسقط الاختبار |
| **أثر جانبي عولج** | البند 4 الإنجليزي طال سطرًا، والصفحة الأولى الإنجليزية لم يكن فيها إلا 4.36mm فائضًا ⇒ صارت خمس صفحات. العلاج بالمسار المعتمد: بندٌ أقلّ على الصفحة الأولى (`en: 3 ⇐ 2`) وعبؤه إلى **الصفحة 2 وحدها**، بأقلّ تضييق أعاد الصفحات: سطر 1.20 ⇐ 1.15، وخط 10 ⇐ 9.5pt (وهو حجم خط خلايا الجداول نفسه، وفوق أرضية المقياس 9pt)، وهوامش 2 ⇐ 1pt — **للإنجليزية وحدها**. وصار حزام صفحتها الثانية **34.02mm** بدل 23.70mm، أي أبعد عن الحافة لا أقرب. والعربية والهندية لم تُمسّا |
| **قياس ما بعد التغيير** | **pass** — الصفحات كما هي: **4 · 6 · 8** لـ5 و13 و25 قسطاً في اللغات الثلاث. الأحزمة سليمة، ونسختا الملحق متطابقتان، ومساحة التوقيع **2.00** في كل خانة، وصفر حرف عربي في EN/HI، وصفر صفحة تعليمات وصفر صفحة بيضاء |
| **صيغة القسط الواحد** | إغلاق `F-20`. الصيغة المعتمدة تصف أقساطًا «عادية» وقسطًا «أخيرًا» يحمل المتبقّي — وهي لغوٌ حين لا يوجد إلا قسط واحد. فصار للبند 4 صيغتان: «أسدد الدين على **قسط واحد** بقيمة (…)، يستحق في (…)» · «in **a single instalment** of KWD (…), due on (…)» · «KWD (…) की **एक ही किस्त** में … को देय होगी». تُختار من **الجدول المطبوع نفسه** (`schedule.length === 1`) لا من حقلٍ قد يخالفه، وقسطان فأكثر ⇒ الصيغة المعتمدة بلا تغيير. وهي **استثناء ثالث مسجَّل** في أمانة النصّ (لا مقابل لها في DOCX): يُفحص أن افتتاحها وختامها حرفيّان من ملف Word، وأن لا أثر فيها لوصف الحالة المتعدّدة، وأن حقليها هما القيمة والتاريخ |
| **قياس القسط الواحد** | **pass** — أُضيف سيناريو `i01` إلى المراجعة البصرية فصارت **اثني عشر مستندًا** (4 سيناريوهات × 3 لغات). قياسه: **4 صفحات** في اللغات الثلاث، وصفحتا ملحق باثني عشر صفًّا أحدها مملوء، ومساحة التوقيع 2.00 في تسع خانات، وصفر حرف عربي في EN/HI. وسيناريوهات 5 و13 و25 لم تتغيّر بمليمتر. **ولا تغيير في الخوارزمية**: `count === 1` كانت وما زالت تُرجع الرصيد كلّه |
| **بوابات الإصدار** | كلها مرّت قبل الدمج: الفرع والـHEAD مطابقان للمتوقَّع (`618f00b0`) · شجرة عمل نظيفة بلا تغييرات ولا stash · `production` == `origin/production` == `a3c5b18e` (0/0) · الفرع 17 أمام وصفر خلف · لا تعارض في الوسوم · ملفات DOCX الثلاثة أُدخلت مرة واحدة في `4842aaf9` ولم تُعدَّل بعدها |
| **القياس النهائي** | **اثنا عشر مستندًا** (1 · 5 · 13 · 25 قسطًا × ثلاث لغات) مقيسة عبر `printToPDF` نفسه: الصفحات **4 · 4 · 6 · 8** في اللغات الثلاث، والحزام العلوي ≥ 39.95mm والسفلي ≥ 34.02mm، ومجموعتا الملحق متطابقتان صفحةً بصفحة ببصمة الحبر المرئي، ومساحة التوقيع **2.00** في كل خانة، وصفر رمز عربي في PDF الإنجليزي والهندي، وصفر عقدة تعليمات، وصفر صفحة بيضاء، ولا قصّ ولا فيض. وأُعيد توليد المخرجات عند HEAD النهائي فخرجت **مطابقة** لما هو محفوظ (عدا ختم الوقت) |
| **الاختبارات عند الإصدار** | أمامي **4540/4543** · خلفي **3668/3673** — والإخفاقات الثمانية هي المعروفة سابقًا وغير المتعلقة بالحزمة (`employeeCompensationBatchPrint` ×1 · `entitlementsBankExport` ×2 · `chequeDesignerTemplates` ×5)، ثابتة قبل الدمج وبعده. `tsc --noEmit` نظيف، و`build:front` و`build:back` ناجحان |
| **Golden DB** | **لم تُلمَس** — لا مسار في هذه الحزمة يفتح قاعدة بيانات؛ المقياس يعمل بـElectron وحده على HTML مُولَّد ببيانات مُصطنعة. حجم `backend/data/manar.db` وتاريخ تعديله لم يتغيّرا عبر كل عمليات القياس |
| **التقرير الكامل** | [`docs/EMPLOYEE_DEBT_ACKNOWLEDGMENT_V1.md`](docs/EMPLOYEE_DEBT_ACKNOWLEDGMENT_V1.md) — خريطة الحقول الكاملة، أدلّة القياس، و20 Finding (`F-10` و`F-14` و`F-20` مُغلقة؛ و`F-17`–`F-19` تنتظر قرارًا). وتقرير القياس نفسه محفوظ في `docs/employee-debt-acknowledgment-v1.geometry.json` ويقرؤه اختبار آليّ |

---

## Previous Release — Completed Features Documentation Compaction & Archive v1

| Field | Value |
|-------|-------|
| **Package** | فصل «ما يفعله النظام اليوم» عن «كيف نُفِّذ تاريخيًا» داخل قسم Completed Features — **Documentation Maintenance Release**: لا كود، لا مخطَّط، لا هجرة، لا بناء |
| **Release status** | **RELEASED** — Documentation Maintenance |
| **Release date** | 2026-09-08 |
| **Desktop version** | **`2026.5.9`** — لم يتغيّر بهذه الحزمة |
| **Branch / commit** | `docs/completed-features-compaction-v1` · `d2f2096f` |
| **Merge commit** | `2bdc3d8b` — merge `--no-ff`، أبواه `4702f90a` و`d2f2096f` |
| **Checkpoint tag** | `checkpoint-completed-features-compaction-v1` → `4702f90a` |
| **Stable tag** | `stable-completed-features-compaction-v1` → **`2bdc3d8b`** (على merge commit) |
| **Product Owner review** | **تمّت واعتُمدت** |
| **النتيجة** | القسم: 315,536 → **16,027 بايت** (−94.9٪) · **56 صفًا** في **11 مجموعة مجالات** · `PROJECT_STATE.md` إجمالًا: 590,449 → **290,940 بايت** (−50.7٪) |
| **الأرشيف** | [`docs/history/completed-features/`](docs/history/completed-features/README.md) — **126 مدخلًا منقولة حرفيًا** في 4 ملفات حسب المجال (339,645 بايت) + فهرس + [`COMPACTION_MANIFEST_V1.md`](docs/history/completed-features/COMPACTION_MANIFEST_V1.md) |
| **التصنيف** | بحسب الصلة الحالية لا العمر: A=9 · B=7 · C=29 · D=22 · E=31 · F=28 = **126**. لا فئة تُحذف؛ التصنيف يحدّد حضورها في المرجع النشط فقط |
| **الثابت** | `original_entries = archived_entries` → **`126 = 126`** ✅ — والمرجع النشط مؤشّرات لا نسخ، فلا يُجمع إليه |
| **حفظ المحتوى** | تطابق تامّ لمجموعة بصمات SHA-256 مقابل المصدر المقروء من Git: صفر مفقود · صفر دخيل/معدَّل · صفر تكرار · صفر مدخل في ملفين · صفر مبتور · صفر صفّ تاريخي بقي في القسم النشط |
| **المستبدَلة** | **31** مدخلًا تحمل مؤشّر «استُبدل بـ» في فهارس الأرشيف — **دون تعديل أي نصّ تاريخي**. المرجع النشط يعلن أنه الحاكم عند التعارض |
| **تحقّق السلوك الحالي** | كل عبارة في المرجع النشط فُحصت مقابل المستودع لا نُقلت عن النصّ القديم. **تصحيح معتمد: Data Import = 9 كيانات** (النصّ القديم قال 7) — والصفّ الأصلي محفوظ حرفيًا في الأرشيف |
| **تأكيدات عدم التغيير** | تدوير `## Previous Release` لم يُمسّ (1 Latest + 16 Previous + 4 ملفات أرشيف) · `PROJECT_MASTER_STATUS.md` لم يُمسّ · صفر تغيير في `backend/` · `frontend/` · `electron/` · `scripts/` · Prisma · هجرات · `package.json` · `.gitignore` · Golden DB · installer · `docs/user-manual/` · لا بناء ولا `npm run dist` |

---

## Previous Release — PROJECT_STATE Documentation Rotation & Maintenance v1

| Field | Value |
|-------|-------|
| **Package** | تدوير سجل إصدارات هذا الملف إلى أرشيف مُتتبَّع في Git، ومزامنة بيانات الحالة الحالية — **Documentation Maintenance Release**: لا كود، لا مخطَّط، لا هجرة، لا بناء |
| **Release status** | **RELEASED** — Documentation Maintenance |
| **Release date** | 2026-09-08 |
| **Desktop version** | **`2026.5.9`** — لم يتغيّر بهذه الحزمة |
| **Branch** | `docs/project-state-rotation-v1` |
| **Commits** | `7e9536a2` (التدوير) · `27f54b6f` (مزامنة الحالة الحالية) |
| **Merge commit** | `448aa78e` — merge `--no-ff`، أبواه `f37c9c7f` و`27f54b6f` |
| **Checkpoint tag** | `checkpoint-project-state-rotation-v1` → `f37c9c7f` |
| **Stable tag** | `stable-project-state-rotation-v1` → **`448aa78e`** (على merge commit) |
| **Product Owner review** | **تمّت واعتُمدت** |
| **النتيجة** | `PROJECT_STATE.md`: 1,520,435 → **586,890 بايت** (−61.4٪) · 7,963 → **1,545 سطرًا** (−80.6٪) · `## Previous Release`: 185 → **15 نشطة + 170 مؤرشفة** |
| **الثابت التاريخي** | `185 = 15 + 170` ✅ · إجمالي أقسام السجل `188 = 16 نشطة + 172 مؤرشفة` ✅ |
| **الأرشيف** | [`docs/history/`](docs/history/README.md) — 4 ملفات · 172 قسمًا · ~939,135 بايت · فهرس في `README.md` · الحصر الكامل في [`ROTATION_MANIFEST_V1.md`](docs/history/ROTATION_MANIFEST_V1.md) |
| **حفظ المحتوى** | نقل حرفي بلا إعادة صياغة: بصمة SHA-256 لكل قسم قبل وبعد ⇒ صفر مفقود · صفر دخيل · صفر تكرار · صفر بتر · code fences متوازنة · روابط الأرشيف صالحة. الفرق على هذا الملف كان **صفر إضافات / 6,433 حذفًا** — إزالة خالصة |
| **مزامنة الحالة الحالية** | صُحِّحت في هذا الملف: Production HEAD (`95f67a9c` → `f37c9c7f`) · Latest/Previous stable tag · Application version (`2026.5.5` → **`2026.5.9`**) · Total stable releases (443 → **462**) · Remote sync · Latest validation. القيمة القديمة لـProduction HEAD **لم تُحذف** — نُزِّلت حرفيًا إلى صفّ «before that». وفي `PROJECT_MASTER_STATUS.md` مزامنة الحدّ الأدنى (**+14/−9 سطرًا**) بلا إعادة تصميم و**بلا نسخ أي إصدار مؤرشف إليه** (صفر `## Previous Release` فيه) |
| **مؤجَّل عمدًا** | **`## Completed Features` لم يُمسّ** (315,536 بايت — 54٪ من الملف المتبقي). أُثبت ميكانيكيًا: hunks التعديل عند السطرين 61 و74 فقط، والقسم يبدأ عند السطر 546. مؤجَّل إلى حزمة مستقلة: **Completed Features Documentation Compaction & Archive v1** |
| **تأكيدات عدم التغيير** | 9 ملفات فقط (`PROJECT_STATE.md` · `AI_CONTEXT.md` · `PROJECT_MASTER_STATUS.md` · `docs/history/**`). صفر تغيير في `backend/` · `frontend/` · `electron/` · `scripts/` · Prisma · هجرات · `package.json` · `.gitignore` · Golden DB · installer · `docs/user-manual/` (بصمة PDF الدليل مُتحقَّقة بعد الدمج وما زالت `1ad57ee9…`). لا بناء ولا `npm run dist` |

---

## Previous Release — Complete User Manual v1

| Field | Value |
|-------|-------|
| **Package** | **دليل استخدام شامل ومصوَّر لنظام manarERP** — **Documentation Release فقط**: لا كود، لا مخطَّط، لا هجرة، لا بناء مكتبي |
| **Release status** | **RELEASED** — Documentation |
| **Release date** | 2026-09-08 |
| **Documented desktop version** | **`2026.5.9`** — الإصدار المكتبي **لم يتغيّر بهذه الحزمة**؛ الدليل يوثّقه ولا يصدره |
| **Feature/docs branch** | `docs/complete-user-manual-v1` |
| **Documentation commit** | `267679dc` — `docs: add complete illustrated user manual v1` (96 ملفًا، كلها تحت `docs/user-manual/`) |
| **Merge commit** | `57e2c8a1` — merge `--no-ff` إلى `production`. الأبوان: `00ef23c8` (production السابق) و`267679dc` |
| **Checkpoint tag** | `checkpoint-complete-user-manual-v1` → `00ef23c8` (production HEAD مباشرةً قبل الدمج) |
| **Stable tag** | `stable-complete-user-manual-v1` → **`57e2c8a1`** — على **merge commit** نفسه، لا على commit الوثائق اللاحق |
| **Product Owner visual review** | **COMPLETED AND APPROVED** ✅ — المراجعة البصرية النهائية تمّت واعتُمدت قبل الإصدار |
| **Artifact — PDF (version-controlled)** | `docs/user-manual/build/AlManarERP-User-Manual-2026.5.9-AR.pdf` — **14,537,933 بايت (13.86 ميغابايت)** · SHA-256 `1ad57ee9d0f7fc526498881b955059caf426a761fc9bd1f764eba8c414fa7de0` · A4 عمودي · RTL · خط Cairo مضمَّن. بصمة الـblob المخزَّن في Git مُتحقَّقة ومطابقة للبصمة المعتمدة |
| **Delivery copy (غير مُودع)** | `release/docs/AlManarERP-User-Manual-Latest-AR.pdf` — نسخة تسليم محلية فقط. `release/` مُدرج بالكامل في `.gitignore`، فلم تُضَف بـ`git add -f` ولم يُعدَّل `.gitignore` |
| **الحجم والبنية** | **128 صفحة** (غلاف غير مرقَّم + 127 صفحة محتوى) · **31 فصلًا** في ٦ أبواب · **75 شكلًا** |
| **التغطية** | **77/77** مسارًا في `App.tsx` مصنَّفة · **36/36** عنصرًا في الشريط الجانبي · **52** صفحة user-facing موثّقة · **4** مستبعدة عمدًا بأسباب موثّقة (`/xbrl-readiness` أداة داخلية لا تدّعي توافقًا رسميًا · `/statements` إعادة توجيه · `/verify/:uuid` صفحة QR عامة · إعادتا التوجيه البنكية) · **صفر** صفحة غير مصنَّفة |
| **الفئات المستهدفة** | المدير · المحاسب · المستخدم الإداري |
| **الوحدات المغطّاة** | Employees · Payroll · Leave Requests (بما فيها **Editable Leave Request Date**) · Employee Entitlements · Payment Voucher (Normal + Company Letterhead) · Receipt Voucher (Normal + Company Letterhead) · Cheques · Cheque Calibration · Banks · Bank Accounts · Bank Statement Import · Bank Salary Analytics · Accounting / Payments / Invoices · Equipment · Insurance · Expiration Center · Administrative Forms · Reports · Printing · Backup / Sync · Permissions / Roles · Manager workflows · Accountant workflows · Quick Reference · Troubleshooting · Best Practices · Glossary |
| **المصدر القابل للتحديث** | `docs/user-manual/parts/*.html` (٨ أجزاء) + `assets/manual.css` + `build-manual.cjs`. البناء: تجميع ← فصل الغلاف ← تصيير ← ربط الفهرس من نصّ PDF نفسه عبر علامات لاتينية غير مرئية ← دمج ← نشر. الفهرس يفشل البناء عمدًا لو تعذّر تحديد موضع أي فصل |
| **الخطوط** | Cairo مُعاد استخدامه من `docs/invoice-templates/source/fonts/` داخل المستودع — **صفر ملفات خطوط جديدة** |
| **QA — آلي** | لا صفحات فارغة · لا صفحات شبه فارغة · لا تجاوز أفقي أو رأسي لأي عنصر نصّي · مقاس A4 ثابت على كل الصفحات · 31/31 فصلًا محدَّد الموضع في الفهرس · 106,531 محرفًا · 76 صورة مدمجة |
| **QA — بصري** | فُحصت الصفحات 1 · 2 · 3 · 5 · 11 · 26 · 49 · 71 · 96 · 121 · 128 بتصييرها إلى صور: الغلاف والفهرس وبدايات فصول وصفحات كثيفة الصور وأخرى كثيفة الجداول والصفحة الأخيرة. العربية متّصلة والاتجاه RTL سليم، والأرقام اللاتينية معزولة صحيحة الاتجاه، ورؤوس الجداول تتكرّر، والصور لا تنفصل عن تعليقاتها |
| **QA — الصور** | 75 شكلًا بعرض 1700 بكسل (≈ 248 نقطة/بوصة على A4) · PNG بلا فقد · صفر أدوات مطوّر · صفر نوافذ طرفية · صفر كلمات مرور أو رموز · صفر مسارات داخلية · صفر بيانات شخصية حقيقية |
| **سلامة البيانات — Golden DB** | **`backend/data/manar.db` لم تُمسّ إطلاقًا**: SHA-256 `2fa6f514dae39d9f750d1d8fece9b78b9b910040876f5ccb0317a1a6968f0808` **متطابقة قبل العمل وبعده**، وزمن التعديل لم يتغيّر، وبلا أي ملف `-wal`/`-shm` متخلّف. هذا تطبيق مباشر للقاعدة الدائمة المسجَّلة مع 2026.5.9: **لا تشغيل حيّ على قاعدة الإنتاج** |
| **سلامة البيانات — النسخة المعزولة** | كل التشغيل والتقاط اللقطات تمّ على نسخة معزولة **خارج المستودع**، بخدمة خلفية مستقلة وسرّ توقيع مستقل ومجلد نسخ مستقل. النسخة **مجهَّلة بالكامل**: 33 موظفًا · 17 عميلًا · 3 مستخدمين · 58 شيكًا، إضافة إلى **6,532 خلية نصّية** على ثلاث مراحل عبر 9 جداول (أوصاف كشوف البنك، السجلات المصوَّرة، سجل التدقيق). فحص تحقّق آلي أكّد **صفر بقايا أسماء أصلية** في أي عمود نصّي. النسخة غير المجهَّلة المؤقتة حُذفت بعد الانتهاء |
| **تأكيدات عدم التغيير** | صفر تغيير في `backend/` · صفر تغيير في سلوك `frontend/` · صفر تغيير في الصلاحيات أو منطق الأعمال أو التكاملات · صفر تغيير في Prisma · صفر هجرات جديدة (تبقى 71) · صفر تغيير في `.gitignore` · لم يُبنَ مثبِّت ولم يُشغَّل `npm run dist` · `package.json` لم يُمسّ و**الإصدار يبقى `2026.5.9`** · `release/AlManarERP-Setup-2026.5.9.exe` لم يُحذف ولم يُعدَّل. تحقُّق مباشر: `git diff --name-only 00ef23c8 57e2c8a1` = 96 ملفًا، **كلها تحت `docs/user-manual/`** |
| **Findings (سُجّلت ولم تُصلَح)** | ٦ ملاحظات جودة في `docs/user-manual/FINDINGS.md`: تصنيفات مصروفات تحمل أسماء أشخاص مضمَّنة في الكود · `audit.export` صلاحية بلا زرّ في الواجهة · `PUT /roles/:id/permissions` بلا واجهة استدعاء · زرّ «تشغيل التكامل» يعيد دائمًا «لم يتم تفعيله بعد» · الضغط على اسم المستخدم يسجّل الخروج بلا تأكيد · مفتاح i18n لا يطابق المسمّى المعروض لمحرر النماذج. **لم يُصلَح أي منها ضمن هذه الحزمة عمدًا** |
| **دَين صيانة مرصود (خارج نطاق هذه الحزمة)** | `PROJECT_STATE.md` بلغ **184 مدخل `## Previous Release`** و**1.51 ميغابايت / 7,929 سطرًا** — أي أنه تجاوز بفارق كبير عتبة سياسة التدوير المعلنة في هذا الملف نفسه (~15 مدخلًا). التدوير عملية إعادة هيكلة كبيرة ومستقلة، ولم تُنفَّذ ضمن إصدار توثيقي؛ **تُرصد هنا للتنفيذ في تمريرة صيانة مخصّصة** |

---

## Previous Release — Production Release 2026.5.9 (Desktop Installer)

| Field | Value |
|-------|-------|
| **Package** | مثبِّت Windows جديد مكتفٍ ذاتيًا يجمع كل ما دُمج على `production` منذ مثبِّت 2026.5.8 — **إصدار تغليف، بلا عمل ميزات جديد** |
| **Release status** | **RELEASED** — Desktop/Installer |
| **Version** | `2026.5.8` → **`2026.5.9`** — `package.json` هو الملف الوحيد المتغيّر في commit الإصدار (سطر واحد) |
| **Release date** | 2026-09-07 |
| **Production source HEAD** | `9c72e717` — بُنيت من هذا الـHEAD وحده. قبل البناء: شجرة نظيفة، `git stash list` فارغة، صفر ملفات غير مُتتبَّعة، و`production == origin/production` |
| **Release commit** | `ab9480d9` — `chore(release): Production Release 2026.5.9` |
| **Docs / final HEAD** | commit الوثائق فوق `ab9480d9` |
| **Tag** | `stable-production-release-2026.5.9` → `ab9480d9` (على commit الإصدار، لا على commit الوثائق) |
| **الحزم المشمولة (٣)** | **Leave Request Editable Request Date v1** (`8090ed9d`، merge `9a01a724`) · **Payment Voucher Print Fix & Letterhead Template v1** (`55931008`، merge `342723c3`) · **Receipt Voucher Company Letterhead Template v1** (`6b37930c`، merge `695f63b7`). استُخرجت بالمقارنة الفعلية `stable-production-release-2026.5.8..production` — لا قائمة مفترضة |
| **Product Owner visual review** | **تمت واعتُمدت لكل حزمة في مرحلتها** قبل دمجها إلى `production`؛ هذا الإصدار تغليف لما اعتُمد سابقًا |
| **الترحيلات** | **70 → 71** — ترحيل واحد مضاف: `20260907120000_add_leave_request_date` (إضافي بحت). العدد الفعلي مقروء من المصدر ومن الحزمة ومن نسخة القاعدة المشحونة: **71** في الثلاثة |
| **عميل Prisma المُعبَّأ** | **87 نموذجًا**، مجموعة النماذج مطابقة لـ`backend/prisma/schema.prisma`، و`Leave.requestDate` حاضر في العميل المُولَّد وفي المُعبَّأ. `npm run db:generate` نُفِّذ قبل التغليف وأنتج **صفر تغييرات في المصدر المُتتبَّع** |
| **Artifact — Installer** | `release/AlManarERP-Setup-2026.5.9.exe` — **138,517,894 بايت (132.10 ميغابايت)** · SHA-256 `30743922f57559ab37127bbe443336225c0f80b37207e6ba84219787ff65069e` · NSIS · Windows 10/11 x64 · صفر متطلبات تشغيل خارجية |
| **Artifact — التطبيق** | `release/win-unpacked/Al Manar ERP.exe` — 180,192,256 بايت · FileVersion **2026.5.9** · ProductVersion **2026.5.9.0** · `win-unpacked` **3,404 ملفًا / 470,519,253 بايت** · `app.asar` **688 مدخلًا** |
| **قاعدة البيانات الذهبية** | SHA-256 `b3c38fe70b5c27eede3e7dc92df37362f802fceca0e4fbcabcd0930f0f1d1e52` · **4,145,152 بايت** · مُتحقَّق أنها **متطابقة بايتًا ببايت** بين المصدر و`win-unpacked` وبيان `seed-data/golden-manifest.json` · قاعدة واحدة فقط داخل الحزمة (`resources/backend/data/manar.db`) · بلا أي ملف journal جانبي |
| **Golden DB Cleanup Audit** | القاعدة تغيّرت مشروعًا منذ 2026.5.8 (`dda5d450…`، 4,075,520 بايت): طُبّق الترحيل الـ71، وسُجّلت معاملات عمل حقيقية جديدة. قبل أي تنظيف أُخذت نسخة كاملة: `backend/data/backups/pre-cleanup-2026.5.9-20260907T160411Z.db` · 4,145,152 بايت · SHA-256 `d5c0fc08d7bca6ae50c763fbc50b36ac1a2c67bcca8db9aa0af469e5e584da39`. **حُذف صفّ واحد فقط**: `audit_logs #4078` (`CREATE`/`employees`/entity=1/`{"leave":"SICK","days":5}`/04:14:43.926Z) — سجل تدقيق لإجازة اختبارية أنشأها التحقق الآلي ثم حُذفت (جدول `leaves` = 0)، والحذف تمّ داخل transaction بحارس فشل-مغلق يطابق البصمة حرفًا بحرف. `PRAGMA integrity_check` = **ok**. **صفر معاملات عمل حُذفت**: 3 × `PAYMENT invoices` (43/44/8) و`CREATE bankStatementImport` (40، بـ22 حركة) و`CREATE employees` (LEAVE_ALLOWANCE) و`UPDATE employees` (59) وكل سجلات الطباعة البشرية — كلها سليمة ومُتحقَّق منها بعد الحذف. **أُبقيت 6 سجلات `LOGIN` ملتبسة عمدًا** لتعذّر إثبات مصدرها (كلها `127.0.0.1` و`user=null` بلا user-agent) — القاعدة: ما لا يُثبَت لا يُحذف |
| **تدقيق نظافة الحزمة (فشل-مغلق)** | صفر `__livetest__` · صفر `__probe__` · صفر `.bak` · صفر خرائط مصدر · صفر `.ts`/`.d.ts` · صفر `.env` · صفر ملفات journal · صفر آثار قياس/مؤقتة · قاعدة بيانات واحدة فقط. وفحص شامل داخل القاعدة نفسها: صفر `__livetest__`/`__probe__` في أي عمود نصّي |
| **Sanity checks** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · `npm run dist` ✅ (exit 0) · صفر متطلبات تشغيل خارجية · نُظِّفت مخرجات البناء المُولَّدة قبل البناء ولم يُمسّ أي مصدر مُتتبَّع |
| **تحقق المحتوى المُعبَّأ** | استُخرج `app.asar` (438 ملف JS) وفُحص نصًّا: `requestDate` ✅ · `page.leaveReq.field.request_date` ✅ · `payment-voucher-letterhead` + `45mm` + `page.paymentVoucher.sheet` ✅ · `receipt-voucher-letterhead` + `50mm` + `page.receipt.sheet` ✅ · `contentOnly` ✅. والترحيل الجديد حاضر في `resources/backend/prisma/migrations` |
| **Smoke test — الخدمة الخلفية (نجح)** | شُغِّلت **من مخرجات الحزمة نفسها** (`resources/backend/dist/server.js` عبر ثنائي Electron المشحون بوضع `ELECTRON_RUN_AS_NODE`) على **نسخة معزولة** من القاعدة المشحونة (لم تُستعمل قاعدة الإنتاج الحقيقية): تستمع على `127.0.0.1:48211` ✅ · `/api/health` = `{"success":true,"status":"ok"}` ✅ · `prisma migrate status` على النسخة = 71 ترحيلًا والمخطط محدَّث ✅ · عمود `leaves.requestDate` موجود ✅ · مسار Prisma حيّ: رفض دخول خاطئ برسالة عربية من القاعدة، ودخول صحيح ثم قراءة موظفين حقيقيين ✅ · `error.log` المشحون فارغ (0 بايت) ✅ |
| **Smoke test — الواجهة الرسومية (نجح)** | **النسخة المعبّأة تعمل رسوميًا على جهاز البناء**: 5 عمليات حيّة، نافذة رئيسية بمقبض صالح وعنوان، الخدمة الخلفية تبدأ داخلها وتستمع، `/api/health` ناجح، ومسار قاعدة البيانات ينتقل صحيحًا إلى `userData` (بيئة التشغيل: إنتاج). ثنائي Electron سليم: `31.0.0` / Node `20.14.0` / Chromium `126.0.6478.36` |
| **تصحيح قيد بيئي سابق** | «تعذّر تشغيل الواجهة على جهاز البناء» المسجَّل في 2026.5.8 **لم يكن عيبًا في الجهاز**: سببه أن متغيّر البيئة `ELECTRON_RUN_AS_NODE=1` كان مضبوطًا في صدفة التشغيل، فيجعل ثنائي Electron يعمل كـNode فيخرج صامتًا ويرفض أعلام Chromium بـ«bad option». بإلغاء المتغيّر (`env -u ELECTRON_RUN_AS_NODE`) تفتح النافذة فورًا. **لم يُضَف أي flag دائم ولم يُغيَّر أي إعداد Electron** |
| **قاعدة عزل الاختبارات (جديدة، دائمة)** | أي اختبار أو قياس يحتاج تشغيل التطبيق فعليًا — Chromium/`printToPDF`، live-test، probe — **ممنوع أن يستعمل `backend/data/manar.db` مباشرةً**، لأنها القاعدة التي تدخل مثبِّت الإنتاج. يجب تشغيله على قاعدة معزولة مؤقتة أو نسخة قابلة للإتلاف من القاعدة الذهبية. هذا الإصدار طبّق القاعدة فعليًا في smoke test الخدمة المعبّأة |
| **لم يُنفَّذ** | لا ميزة جديدة، ولا refactor، ولا تغيير تصميم، ولا تعديل على أبعاد سند الصرف (45/20) أو سند القبض (50/20)، ولا ترحيل جديد، ولا ترقية اعتماديات، ولا تغيير Electron/Print Engine/Universal Print Preview/PDF IPC |

---

## Previous Release — Receipt Voucher Company Letterhead Template v1

| Field | Value |
|-------|-------|
| **Feature** | Receipt Voucher — Company Letterhead Template v1 |
| **Release status** | **RELEASED** |
| **Release date** | 2026-09-07 |
| **Feature branch** | `feature/receipt-voucher-letterhead-template-v1` |
| **Feature commit** | `6b37930c` — *feat(forms): add company-letterhead template for receipt voucher* |
| **Production merge commit** | `695f63b7` — `--no-ff`، والدان: `82afbed4` + `6b37930c`. الحزمة دخلت كاملةً: فرق الـmerge عن الـfeature commit = **صفر ملف** |
| **Checkpoint tag** | `checkpoint-receipt-voucher-letterhead-template-v1` → `82afbed4` (production HEAD الفعلي وقت الوسم، مقروءًا من `git rev-parse` لا من قيمة محفوظة) |
| **Stable tag** | `stable-receipt-voucher-letterhead-template-v1` → merge `695f63b7` (annotated؛ ليس على commit الوثائق) |
| **Product Owner visual review** | **COMPLETED AND APPROVED** — روجع القالبان بصريًا واعتُمدا قبل الإصدار |
| **الإضافة** | قالب طباعة جديد ومستقل في «النماذج الإدارية ← سند القبض»، للطباعة على ورق الشركة الرسمي المطبوع مسبقًا. مبدّل «عادي \| ورق الشركة» في شريط الأدوات، **والافتراضي يبقى «عادي»** فيفتح المستند القائم حرفيًا كما كان — **إضافة لا استبدال** |
| **ما يُسقطه قالب ورق الشركة** | أثاث الورقة وحده: ترويسة النموذج (الشعار واسم الشركة)، وكتلة رقم السند المرجعية وخطّها، والتذييل كاملًا (كتلة الاعتماد + رمز QR + خطّه العلوي) |
| **ما يبقى** | محتوى السند كاملًا: عنوان **«سند قبض / RECEIPT VOUCHER»**، وكل الحقول والمبالغ وطريقة الدفع والبيان، وتوقيع **المُستلِم** — فذاك جزء من السند نفسه داخل `ReceiptVoucherTemplate` لا من تذييل الورقة |
| **الأبعاد المعتمدة** | يفرضها صندوق الصفحة نفسه: `@page { size: A4; margin: 50mm 15mm 20mm 15mm; }` — **Top 50mm · Bottom 20mm · Left/Right 15mm**. الجانبيان هما قيمة سند القبض القائمة نفسها (قاعدته الحالية `@page { size: A4; margin: 12mm 15mm }`) — **فُحصت ولم تُفترض** |
| **منطقة المحتوى** | **180mm × 227mm** (297−50−20 · 210−15−15) |
| **إثبات الأبعاد بالقياس** | `@page` المحقون مقروءًا من الصفحة الحيّة = `margin: 50mm 15mm 20mm 15mm` ✅ · حشو الجذر المطبوع عند الطباعة `0px` ⇒ لا إزاحة إضافية ✅ · **أول عنصر مطبوع عند 0mm من مبدأ صندوق الصفحة** ⇒ المحتوى يبدأ عند 50mm بالضبط، بلا spacer ولا blank div ولا هامش وهمي ✅ · ارتفاع المحتوى **156.63mm** ⇒ يترك **70.37mm** فوق حدّ الـ20mm السفلي ✅ · داخل الورقة: `صور = 0` (لا شعار ولا QR) و`كتلة اعتماد = غائبة`، بينما `عنوان السند = موجود` و`توقيع المُستلِم = موجود` ✅ |
| **ترقيم Chromium الحيّ** | الحالات الأربع **صفحة A4 واحدة**: عادي عربي (240.92mm / 273mm متاحة) ✅ · عادي إنجليزي (240.92mm) ✅ · ورق الشركة عربي (156.63mm / 227mm) ✅ · ورق الشركة إنجليزي (156.63mm) ✅. لم يُصغَّر أي خط أو محتوى |
| **ملف التعريف** | `receipt-voucher-letterhead` — مدخل **جديد فقط** (`selectable: false`، `blankHeader: true`، `logoHeader: false`) في نقطة التوسعة التي يعلنها `printProfiles.ts` نفسه. **صفر سطر محذوف أو معدَّل** في الملف (أُثبت بـ`git diff`) ⇒ لا ملف تعريف قائم تغيّر. يحرسه اختبار انحدار يثبّت هوامش الستة جميعًا وقائمة القابل للاختيار |
| **حماية سند الصرف** | **محصَّن بنيويًا لا بالوعد**: `ReceiptVoucher` صفحة مستقلة لا تُصيّر `FormPage`/`FormLayout` أصلًا (جذرها `.rcv-preview` وقاعدة `@page` سطرية عندها)، فلم يُلمس `FormPage.tsx` ولا `FormLayout.tsx` ولا `contentOnly` ولا أي ملف من ملفات سند الصرف. `payment-voucher-letterhead` كما هو: **45mm أعلى / 20mm أسفل / 15mm جانبيًا** — مثبَّت باختبار، مع اختبار ثانٍ يثبت أن `contentOnly` ما تزال مطفأة افتراضيًا |
| **إعادة استخدام النمط لا نسخه** | اتُّبع معمار *Payment Voucher Print Fix & Letterhead Template v1* (ملف تعريف مستقل يقود `@page` + مبدّل ورقة + إسقاط أثاث الورقة) **بلا مسار طباعة موازٍ**: نفس `printCurrentView` ونفس الجذر المطبوع ونفس مسار PDF. `contentOnly` لم تُستعمل ولم تُعدَّل — غير قابلة للتمرير إلى صفحة لا تُصيّر `FormPage`. و`RECEIPT_VOUCHER_PAGE_SPEC` المشترك لم يُمَسّ: وضع ورق الشركة يمرّر نسخة محلية بهوامشه فتتطابق المعاينة الدقيقة و PDF مع الورق، والوضع العادي يمرّر الثابت كما هو |
| **حماية القالب العادي** | قاعدة `@page` للوضع العادي بقيت السلسلة النصية القائمة **حرفيًا** (`12mm 15mm`) بدل اشتقاقها، فيستحيل أن يزيحها هذا التعديل ولو بجزء من المليمتر. التصميم والترويسة والتذييل والخطوط والإحداثيات وترتيب الحقول والألوان والحدود والهوامش والمسافات: بلا تغيير |
| **لا Backend ولا migration** | صفر ملفات تحت `backend/`، صفر prisma، صفر migrations، ولا تغيير قاعدة بيانات. إجمالي الترحيلات يبقى **71**. منطق سند القبض المالي وبياناته لم يُمسّا · ولا Universal Print Preview ولا Print Engine ولا PDF IPC ولا CSS ولا أي نموذج إداري آخر |
| **الملفات** | 4 ملفات (+407 / −23): `pages/ReceiptVoucher.tsx` (المبدّل + `@page` لكل وضع + إسقاط الترويسة/التذييل + مزامنة مواصفة المعاينة) · `forms/shared/printProfiles.ts` (مدخل جديد فقط) · `lib/i18n.ts` (5 مفاتيح `page.receipt.sheet.*` ar/en) · `__tests__/receiptVoucherLetterheadSheetV1.test.tsx` (جديد) |
| **التحقق** | `receiptVoucherLetterheadSheetV1` **21/21** ✅ · انحدار سند الصرف والطباعة (7 ملفات) **114/114** ✅ · frontend `tsc --noEmit` ✅ · `npm run build` (الواجهة) ✅ |
| **Sanity checks عند الإصدار** | `git status` نظيفة ✅ · `git stash list` فارغة ✅ · صفر ملفات غير مُتتبَّعة ✅ · صفر ملفات مؤقتة أو غير مرتبطة في الحزمة ✅ · `printProfiles.ts` إضافة خالصة ✅ · حارسا القيم 36/36 و`tsc` نظيف قبل الـcommit ✅ · `production == origin/production` ✅ |
| **أدوات القياس** | مقياس الطباعة (سكربت Electron يحمّل التطبيق الحيّ ويستدعي `printToPDF`) عاش في مجلد العمل المؤقت خارج المستودع وحُذف بعد الاستعمال — **لا أثر له في الحزمة** |
| **لم يُنفَّذ (بقرار صريح)** | لم يُبنَ `manar.exe` ولا مثبِّت سطح المكتب. الإصدار المشحون يبقى **2026.5.8**. لم تُعَد الـfull test suite بعد الاعتماد، ولم يُلمس أي إخفاق سابق غير مرتبط |

---

## Previous Release — Payment Voucher Print Fix & Letterhead Template v1

| Field | Value |
|-------|-------|
| **Feature** | Payment Voucher — Print Fix + Letterhead Template v1 |
| **Release status** | **RELEASED** |
| **Release date** | 2026-09-07 |
| **Feature branch** | `feature/payment-voucher-print-fix-and-letterhead-template-v1` |
| **Feature commit** | `55931008` — *fix(forms): payment voucher prints on one A4 page + add company-letterhead sheet* |
| **Production merge commit** | `342723c3` — `--no-ff`، والدان: `9e8f4d66` + `55931008` |
| **Checkpoint tag** | `checkpoint-payment-voucher-print-fix-and-letterhead-template-v1` → `9e8f4d66` |
| **Stable tag** | `stable-payment-voucher-print-fix-and-letterhead-template-v1` → merge `342723c3` (annotated؛ ليس على commit الوثائق) |
| **Product Owner visual review** | **COMPLETED AND APPROVED** — روجع القالبان بصريًا واعتُمدا قبل الإصدار |
| **العلّة (١) — الصفحتان** | سند الصرف الإنجليزي كان يطبع على صفحتين. **السبب قيس فعليًا لا تخمينًا**: حُمّل التطبيق الحيّ في نافذة Chromium غير مرئية، ورُقّمت الصفحات بـ`printToPDF` على A4 بهوامش ملف التعريف، وقيست الكتل تحت وسيط الطباعة بعرض عمود الطباعة الحقيقي (180mm). سببان معًا: (أ) النموذج بلا أي هامش أمان — العربية 278.91mm مقابل 280mm متاحة، تنجو بـ**1.09mm** فقط؛ (ب) صف «طريقة الدفع» يلتفّ سطرًا إضافيًا بالإنجليزية — **16.40mm ← 21.43mm (+5.03mm)** لأن `Cash/Cheque/Bank Transfer/Bank:/Cheque No.:` أطول من مقابلاتها العربية داخل خلية بعرض 66% مع `flexWrap: 'wrap'`. كل صفٍّ آخر متطابق بالمليمتر. المحصّلة **283.94mm ⇒ فيضان 3.94mm ⇒ صفحة ثانية** |
| **الحل (١)** | `contentTopOffset` في `AdminPaymentVoucher` من `2cm` إلى `1cm` — **مسافة بيضاء علوية لا محتوى**. لا خط ولا حجم ولا هامش جانبي ولا ترتيب حقل ولا لون تغيّر، ولم يُصغَّر أي محتوى. بعده: عربي **268.91mm** (هامش 11.09mm) · إنجليزي **273.93mm** (هامش 6.07mm) |
| **الإضافة (٢) — قالب ورق الشركة** | مبدّل جديد في شريط أدوات السند: «عادي \| ورق الشركة». **الافتراضي يبقى العادي**، فيفتح المستند القائم حرفيًا كما كان — القالب الجديد **إضافة لا استبدال**. قالب ورق الشركة: بلا ترويسة، بلا تذييل (اعتماد + QR + خطّه)، محتوى السند وحده |
| **نطاق المحتوى على A4** | يفرضه صندوق الصفحة نفسه: `@page { size: A4; margin: 45mm 15mm 20mm 15mm; }`. بداية المحتوى **45mm** من أعلى الورقة، والحد السفلي يترك **20mm**، والهامشان الجانبيان **15mm** كما هما في السند القائم. المتصفح لا يستطيع الرسم خارج هذا الصندوق، فلا عنصر يدخل منطقة الترويسة أو التذييل المطبوعتين على الورق |
| **إثبات النطاق بالقياس** | `@page` المحقون مقروءًا من الصفحة الحيّة = `margin: 45mm 15mm 20mm 15mm` ✅ · النطاق الناتج **180 × 232mm** (297−45−20) ✅ · حشو `.form-page` عند الطباعة `0px` ⇒ لا إزاحة إضافية ✅ · أول عنصر مطبوع (صندوق عنوان السند) عند **0mm** من مبدأ صندوق الصفحة ⇒ المحتوى يبدأ عند 45mm بالضبط ✅ · الارتفاع 148.43mm عربي / 153.46mm إنجليزي ⇒ ينتهي ~84mm فوق حدّ الـ20mm ✅ · الترويسة `display:none` عبر `blankHeader` والتذييل غير مُصيَّر أصلًا ✅ |
| **ترقيم Chromium الحيّ** | التركيبات الأربع **صفحة واحدة**: عادي عربي ✅ · عادي إنجليزي ✅ · ورق الشركة عربي ✅ · ورق الشركة إنجليزي ✅ |
| **لا Print Profile قائم تغيّر** | `payment-voucher-letterhead` **مدخل جديد** (`selectable: false`) في نقطة التوسعة التي يعلنها `printProfiles.ts` نفسه — **صفر سطر محذوف أو معدَّل** في الملف (أُثبت بـ`git diff`). يحرسه اختبار انحدار يثبّت هوامش الخمسة جميعًا (`plain-a4`، `letterhead`، `ready-paper`، `payment-voucher`، `receipt-voucher`) وقائمة القابل للاختيار |
| **لا محرك طباعة ولا Universal Print Preview** | صفر ملفات CSS/SCSS، ولا `utils/print`، ولا مجلد `printing/`، ولا `FormHeader`. `contentOnly` في `FormPage`/`FormLayout` **مطفأة افتراضيًا** ⇒ كل نموذج قائم يُصيَّر حرفيًا كما كان، ولا نموذج إداري آخر تغيّر |
| **لا migration ولا مخطط** | صفر ملفات في `backend/` وصفر ملفات prisma/migrations. بيانات سند الصرف ومنطقه المالي لم يُمسّا — الحزمة عرض وطباعة بحت. إجمالي الترحيلات يبقى **71** |
| **الملفات** | 6 ملفات (+337 / −6): `pages/AdminPaymentVoucher.tsx` (الإصلاح + المبدّل) · `forms/shared/printProfiles.ts` (مدخل جديد فقط) · `forms/shared/FormPage.tsx` (`contentOnly`) · `forms/shared/FormLayout.tsx` (تمرير `contentOnly` فقط) · `lib/i18n.ts` (5 مفاتيح ar/en) · `__tests__/paymentVoucherLetterheadSheetV1.test.tsx` (جديد) |
| **التحقق** | `paymentVoucherLetterheadSheetV1` **15/15** ✅ · اختبارات السندات والطباعة القائمة (5 ملفات) **83/83** ✅ · الحزمة الأمامية **4178/4180** ✅ · frontend `tsc --noEmit` ✅ |
| **Sanity checks** | `git status` نظيفة ✅ · `git stash list` فارغة ✅ · صفر ملفات غير مُتتبَّعة ✅ · صفر ملفات prisma/backend/CSS/محرك طباعة في الحزمة ✅ · `printProfiles.ts` إضافة خالصة ✅ · `production == origin/production` ✅ |
| **أدوات القياس** | مقياس الطباعة (سكربت Electron يحمّل التطبيق الحيّ ويستدعي `printToPDF`) عاش في مجلد العمل المؤقت خارج المستودع وحُذف بعد الاستعمال — **لا أثر له في الحزمة** |
| **لم يُنفَّذ في هذه المهمة (بقرار صريح)** | لم يُبنَ `manar.exe` ولا مثبِّت سطح المكتب. الإصدار المشحون يبقى **2026.5.8**. لم تُعَد الـfull test suite بعد الاعتماد؛ الإخفاقان المعروفان (`entitlementsBankExport`) سابقان لهذه الحزمة وغير مرتبطين بها ولم يُلمسا |

---

## Previous Release — Leave Request Editable Request Date v1

| Field | Value |
|-------|-------|
| **Feature** | Leave Request Editable Request Date v1 |
| **Release status** | **RELEASED** |
| **Release date** | 2026-09-07 |
| **Feature branch** | `feature/leave-request-editable-request-date-v1` |
| **Feature commit** | `8090ed9d` — *feat(leave): make the leave-request submission date user-editable and persisted* |
| **Production merge commit** | `9a01a724` — *Merge feature/leave-request-editable-request-date-v1* (`--no-ff`، والدان: `e757bcee` + `8090ed9d`) |
| **Checkpoint tag** | `checkpoint-leave-request-editable-request-date-v1` → `e757bcee` (production HEAD قبل الدمج مباشرة) |
| **Stable tag** | `stable-leave-request-editable-request-date-v1` → merge `9a01a724` (annotated؛ ليس على commit الوثائق) |
| **Product Owner visual review** | **COMPLETED AND APPROVED** — روجِعت النسخة المطبوعة بصريًا واعتُمدت قبل الإصدار |
| **العلّة** | «تاريخ تقديم الطلب» في نموذج طلب الإجازة المطبوع كان يُكتب بتاريخ **يوم الطباعة** دائمًا (`issueDateStr()` / `issueDateStrEn()`) ولا يُخزَّن إطلاقًا. فإعادة طباعة طلب قديم كانت تُظهر تاريخًا لم يُقدَّم فيه الطلب أصلًا، ولا سبيل لتصحيحه: الحقل لم يكن قابلًا للتحرير ولا موجودًا في المخطط |
| **الحل** | حقل يملكه المستخدم ويُحفظ مع سجل الإجازة — على نفس نمط `expectedReturnDate` القائم سلفًا (عمود اختياري + مكوّن `DateInput` المعتمد)، بلا نظام تاريخ جديد. طلب جديد يبدأ بتاريخ اليوم (افتراض لا فرض، عبر `newLeaveRequestFields()` — دالة لا ثابت كي لا تعلق جلسة مفتوحة عبر منتصف الليل على تاريخ الأمس)؛ الطلب المحفوظ يعرض `requestDate` المخزَّن عند إعادة فتحه (سواء عبر اختصار «طباعة نموذج الإجازة» أو عبر `latestLeave` من الخادم، بحارس `requestDateManuallyEdited` يجعل تعديل المستخدم يفوز على التبنّي التلقائي)؛ والطباعة تستعمل التاريخ المختار |
| **التوافق مع السجلّات القديمة** | `requestDate = NULL` ⇒ المستند يسقط إلى تاريخ اليوم — **السلوك السابق حرفيًا**. لا سجل قديم تغيّر ولا احتاج ترحيل بيانات |
| **الترحيل** | `20260907120000_add_leave_request_date` — **إضافي بحت**: سطر `ALTER TABLE "leaves" ADD COLUMN "requestDate" DATETIME;` واحد. صفر `DROP`/`DELETE`/`UPDATE`. في SQLite عملية بيانات-وصفية خالصة: لا إعادة بناء جدول، لا نسخ بيانات، لا تغيير فهرس أو قيد؛ كل صفّ قائم يبقى NULL. التراجع = إسقاط هذا العمود وحده. **إجمالي الترحيلات: 70 → 71** |
| **المخطط** | `Leave.requestDate DateTime?` — حقل واحد. لا نموذج Prisma جديد، ولا مفتاح صلاحية جديد، ولا اعتمادية جديدة، ولا قناة IPC جديدة |
| **نظام الطباعة — بلا أي تغيير بصري** | التغيير الوحيد داخل القوالب هو **قيمة** سطر تاريخ التقديم: `<strong>…:</strong> {issueDateStr()}` صارت نفس الوسم ونفس المسافة الواحدة مع قيمة مختارة تسقط إلى تاريخ اليوم عند الفراغ. **صفر ملفات CSS/تخطيط/محرك طباعة في الحزمة** — أُثبت آليًا بفحص قائمة الملفات المعدَّلة ضد `\.css$`، `FormLayout`، `formStyles`، `printProfiles`، `/printing/`، `fontRegistry`، `pdf.ipc`، `html.service`. لا مقاسات ولا هوامش ولا خطوط ولا أحجام ولا إحداثيات ولا مواضع حقول. حقل الإدخال الجديد يعيش في لوحة التحرير الشاشية (`no-print`) وحدها، بنفس هيئة الحقل الذي يليه (`field` + `maxWidth: 280`) وبلا إعادة تخطيط أي حقل قائم |
| **خارج النطاق عمدًا** | `startDate` و`endDate` و`days` وكل احتساب للإجازات — بلا تغيير. `days` يبقى مشتقًّا في الخادم عبر `diffDays`، و`status` مفروضًا `PENDING`. `requestDate` لا يُقيَّد بتاريخي الإجازة (الطلب قد يُقدَّم قبلها أو بعدها) ولا يدخل محرّك المستحقات: يُقرأ في `select` العرض وحده، وقراءتا الاحتساب تنتقيان التاريخين فقط — مثبَّت باختبار |
| **الملفات** | 16 ملفًا (+495 / −17): الخادم — `schema.prisma`، الترحيل، `employees.schema.ts`، `entitlements.service.ts`. الواجهة — `leaveRequestFields.ts`، `AddLeaveDialog.tsx`، `LeaveRequest.tsx`، `LeaveRequestTemplate.tsx`، `LeaveRequestEnHiTemplate.tsx`، `entitlementsShared.tsx`، `EmployeeEntitlementsCenter.tsx`، `i18n.ts` (مفتاح `page.leaveReq.field.request_date` ar/en). اختبارات — `leaveRequestDate.test.ts` (جديد)، `leaveRequestEditableDateV1.test.tsx` (جديد)، وتحديث `entitlements.service.test.ts` و`employeeEntitlementsLeaveManagementV1.test.tsx`. `requestLeave` لم يُعدَّل: يمرّر `...input` فيُحفظ الحقل تلقائيًا |
| **التحقق** | backend `leaveRequestDate` 7/7 ✅ · frontend `leaveRequestEditableDateV1` 11/11 ✅ · `entitlements.service` 57/57 ✅ · `employeeEntitlementsLeaveManagementV1` 33/33 ✅ · backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · `npm run build:back` ✅ · `npm run build:front` ✅ |
| **اختبار حيّ (خادم فعلي، لا محاكاة)** | على `127.0.0.1:48211` بقاعدة التطوير بعد تطبيق الترحيل: `POST /api/employees/leaves` بـ `requestDate: 2026-05-02` حُفظ حرفيًا و`createdAt` = 2026-09-07 ⇒ لا استبدال بتاريخ اليوم، و`days: 5` و`status: PENDING` بقيا مشتقَّين ✅ · `GET /api/forms/leave-request/84` أعاد `requestDate: 2026-05-02T00:00:00.000Z` ✅ · نموذج قراءة المستحقات (مصدر اختصار الطباعة) يحمل الحقل ✅ · الصفحة والقالب الحقيقيان مغذَّيان بحمولة الخادم الحيّة أنتجا سطر المستند `تاريخ تقديم الطلب: 02/05/2026` وتاريخ اليوم `07/09/2026` لا يظهر في المستند إطلاقًا ✅. **حدّ التحقق:** البند الأخير على مستوى نصّ المستند لا بالعين — التطابق البصري غطّته مراجعة Product Owner |
| **نظافة الإصدار** | آثار الاختبار أُزيلت قبل الـcommit: الملفان المؤقّتان `__tmpLivePayloadCheck.test.tsx` و`__livepayload.json` حُذفا، وسجل الإجازة التجريبي (id=1، الموظف 84) حُذف بعد مطابقة كل حقوله بحارس يتوقف عند أي اختلاف — عاد الجدول إلى **0 سجل** كما كان. تطبيق التطوير أُغلق قبل عمليات Git |
| **Sanity checks** | `git status` نظيفة ✅ · `git stash list` فارغة ✅ · صفر ملفات غير مُتتبَّعة ✅ · `prisma migrate status` = 71 ترحيلًا مطبَّقًا بلا معلّق ✅ · صفر ملفات طباعة/تنسيق في الحزمة ✅ · الترحيل إضافي بحت (صفر DROP/DELETE/UPDATE) ✅ · `production == origin/production` ✅ |
| **لم يُنفَّذ في هذه المهمة (بقرار صريح)** | لم يُبنَ `manar.exe` ولا Production Desktop Installer. الإصدار المشحون يبقى **2026.5.8** (يحمل 70 ترحيلًا)؛ هذه الحزمة تعيش على `production` وستدخل في مثبِّت لاحق. لم تُعَد الـfull test suites — الإخفاقات المعروفة فيها سابقة لهذه الحزمة وغير مرتبطة بها (`chequeTemplateManager` غير موجودة في المستودع، و`entitlementsBankExport` تفشل على الشجرة النظيفة أيضًا) ولم تُلمَس |

---

## Previous Release — Production Release 2026.5.8 (Desktop Installer)

| Field | Value |
|-------|-------|
| **Package** | مثبِّت Windows جديد مكتفٍ ذاتيًا يجمع كل ما دُمج على `production` منذ مثبِّت 2026.5.7 — إصدار تغليف، بلا عمل ميزات جديد |
| **Release status** | **RELEASED** — Desktop/Installer |
| **Version** | `2026.5.7` → **`2026.5.8`** — `package.json` هو الملف الوحيد المتغيّر في commit الإصدار |
| **Release date** | 2026-08-31 |
| **Production source HEAD** | `ef1674e4` — النسخة مبنيّة من هذا الـHEAD وحده، بلا feature branch ولا cherry-pick ولا stash ولا ملفات غير مُتتبَّعة (`git status` نظيفة، `git stash list` فارغة، `production == origin/production` قبل البناء) |
| **Release commit** | `38414d42` — `chore(release): Production Release 2026.5.8` |
| **Tag** | `stable-production-release-2026.5.8` |
| **الحزم المشمولة** | كل ما على `production` حتى `ef1674e4`، ومنها الأربع المدموجة منذ مثبِّت 2026.5.7: **Bank Salary Analytics — Western Digits Consistency v1** (`f6da081d`، merge `efade9e7`) · **Expiration Center — Single Source of Truth & Data Integrity v1** (`f919b65c`، merge `d64b1902`) · **Remove Employee Vehicle License Expiry v1** (`3fa1cf61`، merge `e1c5e051`) · **Employee ↔ Payroll Eligibility & Status Transition Integrity v1** (`722097f7`، merge `24ea42ec`) |
| **Product Owner visual review** | **تمت واعتُمدت لكل حزمة في مرحلتها** قبل دمجها إلى `production`؛ هذا الإصدار تغليف لما اعتُمد سابقًا ولا يضيف عملًا يحتاج مراجعة بصرية جديدة |
| **Artifact — Installer** | `release/AlManarERP-Setup-2026.5.8.exe` — **138,492,514 بايت (132.07 ميغابايت)** · SHA-256 `ddeea3c66f7849c9f0a32543add0b17a8beadeed2360be6bba449d59f15b3a10` · NSIS · Windows 10/11 x64 · صفر متطلبات تشغيل خارجية |
| **Artifact — التطبيق** | `release/win-unpacked/Al Manar ERP.exe` — 180,192,256 بايت · FileVersion `2026.5.8` · ProductVersion `2026.5.8.0` · `win-unpacked` 3,384 ملفًا / 470,406,179 بايت · `app.asar` 688 مدخلًا · محتوى المثبِّت 3,384 ملفًا / 732 مجلدًا / 470,406,179 بايت غير مضغوطة |
| **الترحيلات** | **70 ترحيلًا** مشحونًا ومطبَّقًا — بلا ترحيل جديد في هذا الإصدار (كما في 2026.5.7)، ولا تغيير مخطط، ولا مفتاح صلاحية جديد، ولا اعتمادية جديدة |
| **عميل Prisma المُعبَّأ** | **87 نموذجًا**، مجموعة النماذج مطابقة حرفيًا لـ`backend/prisma/schema.prisma` — أكّدها حارس فشل-مغلق في `prepare-backend-deps.js` أثناء البناء، وأُعيد التحقق منها باستخراج العميل من داخل `Setup.exe` (87) |
| **قاعدة البيانات الذهبية** | SHA-256 `dda5d4503ee05b286bbb80ed80cfba292e2f5bc8ab31b72f442a330505edb215` · 4,075,520 بايت · مُتحقَّق منها **متطابقة بايتًا ببايت في أربعة مواضع**: المصدر `backend/data/manar.db` · `win-unpacked` · داخل `Setup.exe` · بيان `seed-data/golden-manifest.json` — بلا أي ملف journal جانبي، ولم تُشحن أي بيانات حالة من جهاز البناء (Data Safety Pack v2 — F-04) |
| **تدقيق نظافة الحزمة** | صفر `__livetest__`/`__probe__` · صفر `.ts`/`.d.ts` · صفر خرائط مصدر · صفر `.env` أو `.bak` حقيقية · صفر ملفات اختبار خاصة بالمشروع · قاعدة بيانات واحدة فقط (`resources/backend/data/manar.db`). مطابقتان اسميّتان فُحصتا وثبت أنهما ملفّا مكتبتين خارجيتين مشروعان لا علاقة لهما بالمشروع: `@dabh/diagnostics/adapters/process.env.js` و`buffer-equal-constant-time/test.js` |
| **Sanity checks** | git integrity (`production == origin/production`، شجرة نظيفة، `git stash list` فارغة، صفر ملفات غير مُتتبَّعة) ✅ · `prisma migrate status` = 70 ترحيلًا مطبَّقًا بلا معلّق ✅ · `npm run db:generate` ثم تطابق العميل المُولَّد مع المخطط (87/87) ✅ · backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · `npm run dist` ✅ · صفر متطلبات تشغيل خارجية في `runtime-requirements.json` ✅. نُظِّفت مخرجات البناء المُولَّدة (`backend/dist`، `frontend/dist`، `electron-dist`، `release/win-unpacked`، `build/seed-data`) قبل البناء؛ لم يُمسّ أي مصدر مُتتبَّع |
| **Smoke test — الخدمة الخلفية (نجح)** | شُغِّلت الخدمة الخلفية **من مخرجات الحزمة نفسها** (`resources/backend/dist/server.js` عبر ثنائي Electron المشحون بوضع `ELECTRON_RUN_AS_NODE`) على نسخة طازجة من القاعدة الذهبية المشحونة: الخدمة تستمع على `127.0.0.1:48211` ✅ · `/api/health` يعيد `{"success":true,"status":"ok"}` ✅ · القاعدة تُفتح و`prisma migrate status` عليها = «70 ترحيلًا، المخطط محدَّث» ✅ · مسار استعلام Prisma حيّ فعليًا: `POST /api/auth/login` ببيانات خاطئة يعيد رفضًا عربيًا صحيحًا من القاعدة ✅ · `error.log` فارغ ✅ · ثنائي Electron المشحون سليم (`31.0.0` / Node `20.14.0`) ✅ |
| **Smoke test — الواجهة الرسومية (لم يكتمل — مانع بيئي)** | **تعذّر تشغيل واجهة أي نسخة مُعبَّأة على جهاز البناء.** يخرج التطبيق فورًا وبصمت (بلا نافذة، بلا سطر في `error.log`، بلا مخرجات على stdout/stderr) رغم أنه يصل إلى مرحلة قفل التشغيل ويحرّره نظيفًا. فشلت كل محاولات الالتفاف: تشغيل عادي، `--disable-gpu`، `--no-sandbox --disable-gpu`، و`--disable-gpu --disable-software-rasterizer --in-process-gpu`. **الفحص الفارق حاسم: النسخة المثبَّتة سابقًا 2026.5.6 — التي أُجري لها Smoke test ناجح كامل عند إصدارها — تفشل الآن بالسلوك نفسه بالضبط على الجهاز نفسه.** إذن السبب بيئي على جهاز البناء ولا يدلّ على عيب في 2026.5.8. **لم يُتحقَّق بصريًا من: ظهور النافذة الرئيسية، ولا ظهور رقم النسخة داخل التطبيق قيد التشغيل** — ويجب إجراء هذا التحقق على جهاز مستخدم نهائي قبل التوزيع الفعلي |
| **ملاحظة بيئة البناء (تدهور عن 2026.5.7)** | في إصدار 2026.5.7 كان `--disable-gpu` كافيًا لإتمام الـSmoke test الرسومي؛ الآن لم يعد أي وسم يُجدي. التدهور بيئي بحت على جهاز البناء (يطال نسخة 2026.5.6 المثبَّتة أيضًا)، **ولم يُضَف أي flag دائم إلى التطبيق** — ذلك يحتاج قرارًا منفصلًا |
| **متطلب متابعة (لم يُنفَّذ في هذا الإصدار — كما في 2026.5.7)** | `scripts/prepare-backend-deps.js` يُفضّل `backend/node_modules/.prisma` مصدرًا للعميل، لكنه يعيد كتابة `backend/node_modules` في نهاية كل تغليف — فيصير مصدرُ البناء التالي مخرَجَ التغليف السابق. عولج هذا الإصدار وقائيًا بتشغيل `npm run db:generate` قبل التغليف والتحقق من 87/87 في المصدرين، ومرّ الحارس بلا تدخّل. **إصلاح السكربت نفسه ما زال متابعة مطلوبة ولم يُغيَّر داخل هذا الإصدار** |

---

## Previous Release — Employee ↔ Payroll Eligibility & Status Transition Integrity v1

| Field | Value |
|-------|-------|
| **Package** | توحيد **Payroll Eligibility** في مصدر مشترك واحد، ومصالحة حالة الموظف مع مسيّر الرواتب: `إجازة → نشط` يُكتشف فورًا ويظهر ضمن الناقصين، مع زرّ «إنشاء» داخل التحذير نفسه |
| **Release status** | **RELEASED** — **Payroll Eligibility & Status Transition Integrity = RELEASED** · **`LEAVE → ACTIVE` reconciliation = RELEASED** · **ON_LEAVE manual generation exception = APPROVED** · **TERMINATED manual generation = BLOCKED** |
| **Product Owner visual review** | **completed and approved** — المراجعة البصرية اليدوية تمت واعتُمدت قبل الدمج؛ لا ملاحظات بصرية مانعة |
| **Release date** | 2026-08-29 |
| **Feature commit** | `722097f7` |
| **Merge** | `24ea42ec` — `--no-ff` merge of `feature/payroll-eligibility-status-transition-integrity-v1` |
| **Tags** | `stable-payroll-eligibility-status-transition-integrity-v1` → `24ea42ec` · `checkpoint-payroll-eligibility-status-transition-integrity-v1` → `71135b70` (production HEAD قبل الدمج مباشرةً) |
| **السبب الجذري** | صفوف `payroll` **Snapshot مادي**: `buildSnapshots` يعاين `status = 'ACTIVE'` مرة واحدة عند الضغط على «إنشاء» ثم يجمّد النتيجة. من كان `ON_LEAVE` في تلك اللحظة لا يُنشأ له صف، وعودته إلى `ACTIVE` **لا تُنشئ شيئًا** — والشبكة تقرأ **صفوفًا لا استحقاقًا**، فيختفي الموظف بلا تفسير. لا علاقة للمشكلة بـcache ولا restart ولا فلترة في الواجهة |
| **مصدر الاستحقاق الواحد** | `backend/src/modules/payroll/payroll.eligibility.ts` (جديد): `status = 'ACTIVE' AND (hireDate IS NULL OR hireDate <= نهاية الفترة)`. `hireDate = NULL` **لا يُقصي أحدًا** — غياب البيانات ليس دليل عدم استحقاق. تقرؤه **جهتان**: التوليد الجماعي (`buildSnapshots`) وكاشف النقص (`findPayrollEligibilityGap`)، فلا يمكن أن ينفصل ما يُنشَأ عمّا يُبلَّغ عنه (مُثبَّت باختبار يقارن الـpredicate حرفيًا) |
| **مصفوفة الحالات** | `ACTIVE`: Bulk ✅ / Manual ✅ — `ON_LEAVE`: Bulk ❌ / **Manual ✅** استثناء مقصود ومعتمد من مالك المنتج (إجازة مدفوعة) — `TERMINATED`: Bulk ❌ / **Manual ❌** برسالة `لا يمكن إنشاء راتب لموظف منتهي الخدمة.` |
| **لماذا حارس مسمّى لا القاعدة الجماعية** | حجب `TERMINATED` بإعادة تطبيق `payrollEligibilityWhere()` على المسار الفردي كان سيحجب `ON_LEAVE` أيضًا و**يُلغي استثناءه ضمنًا**. الحارس يسمّي الحالة الواحدة صراحةً، ويُرفع **قبل فتح المعاملة**: لا قراءة ولا كتابة ولا حذف — كل كشف تاريخي أو معتمد أو مدفوع يبقى حرفيًا كما هو |
| **تحذيرات كاذبة أُزيلت** | الكشف صار يحترم `hireDate`، ويصمت عن أي فترة **لم تبدأ** دون أن يلمس قاعدة البيانات. قياس على قاعدة التطوير: 2026-01 من 1 → **0** · 2026-09 و2026-12 من 25 → **0** · 2025-01 من 25 → **11** (حقيقية، ما قبل اعتماد النظام) · **2026-08 يبقى 3 — الإشارة الحقيقية بلا ضجيج حولها** |
| **الواجهة** | زر «إنشاء» انتقل إلى **داخل تحذير الناقصين** — العلاج مع التشخيص بدل جملة تطلب من المشغّل البحث عن زرّ آخر. النطاق مطابق للتحذير (نفس الفترة ونفس فلتر الموظف)، والمعتمد والمدفوع يُتخطّيان في الخلفية |
| **حماية التاريخ المالي** | قفل **لكل موظف** لا للشهر: `APPROVED`/`PAID` لا تُقرأ ولا تُكتب ولا تُحذف سطورها · `upsert` على `@@unique([employeeId, month, year])` يمنع التكرار بنيويًا · **فتح الصفحة (GET) لا يُنشئ سجلًا ماليًا** — التوليد يبقى إجراء مشغّل صريح |
| **تحقّق على قاعدة التطوير** | أُعيد إنتاج الحالة المُبلَّغ عنها حرفيًا (3 موظفين `ACTIVE` بلا صف في 2026-08 من أصل 25 صفًا كلها `APPROVED`)، ثم شُغِّل التوليد على **نسخة** من القاعدة: أُنشئت 3 مسودات، `skippedLocked = 22`، و**`PRE-EXISTING ROWS MUTATED: 0`**. صفر صفوف يتيمة وصفر تكرار `(employeeId + period)` |
| **قاعدة البيانات** | **لا migration ولا schema change ولا backfill**. الأحدث يبقى `20260821120000_multi_bank_cheques_foundation_v1` |
| **خارج النطاق — بلا مساس** | معادلات الرواتب · overtime · نهاية الخدمة (EOS) · القيود المحاسبية / GL · bank exports · الصلاحيات · الرواتب التاريخية المعتمدة |
| **13 اختبارًا جديدًا** | موزّعة على **المجموعتين القائمتين** بلا suite موازية: `LEAVE→ACTIVE` يُكتشف فورًا بلا regeneration ولا restart · استبعاد المعيَّنين بعد الفترة · فترة لم تبدأ **لا تلمس القاعدة أصلًا** · التوليد والكشف يقرآن **نفس** الـpredicate · `ON_LEAVE` خارج الجماعي وداخل اليدوي · `TERMINATED` مرفوض بصفر `upsert`/`deleteMany`/`createMany` وبلا قراءة لجدول الرواتب · الرفض بحالة مسمّاة لا بالقاعدة الجماعية (`where === { id }`) · لا تكرار عند إعادة التشغيل · المعتمد لا يُعاد توليده |
| **Sanity checks** | Payroll targeted **242/242** ✅ (14 ملفًا) · backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · `npm run build:back` ✅ · `npm run build:front` ✅ (لم تُعَد المجموعة الكاملة) |
| **الإصدار** | لا تغيير في `package.json` — **بلا إعادة بناء مثبّت**. `manar.exe` لم يُبنَ في هذه المهمة |

---

## Previous Release — Remove Employee Vehicle License Expiry v1

| Field | Value |
|-------|-------|
| **Package** | إيقاف استخدام `employee.vehicleLicenseExpiry` من **واجهة الموظفين**، وإزالة النوع `EMPLOYEE_VEHICLE_LICENSE` بالكامل من **مركز انتهاء الوثائق** |
| **Release status** | **RELEASED** — **Remove Employee Vehicle License Expiry = RELEASED** · **`EMPLOYEE_VEHICLE_LICENSE` removed from Expiration Center** · **DB field retained as deprecated compatibility field** |
| **Product Owner visual review** | **completed and approved** — المراجعة البصرية اليدوية تمت واعتُمدت قبل الدمج؛ لا ملاحظات بصرية مانعة |
| **Release date** | 2026-08-28 |
| **Feature commit** | `3fa1cf61` |
| **Merge** | `e1c5e051` — `--no-ff` merge of `feature/remove-employee-vehicle-license-expiry-v1` |
| **Tags** | `stable-remove-employee-vehicle-license-expiry-v1` → `e1c5e051` · `checkpoint-remove-employee-vehicle-license-expiry-v1` → `b19ad39f` (production HEAD قبل الدمج مباشرةً) |
| **السبب** | انتهاء رخصة/دفتر المركبة كان مسجَّلًا على **الموظف** بينما مالك المعلومة سجل المعدة (`equipment.registrationExpiry`) — كيانان يتابعان الوثيقة الواقعية نفسها، وهو مصدر ازدواج عدّ في المركز |
| **حُذف من الواجهة** | عمود جدول الموظفين (ومعه `exportValue` للتصدير) · حقل نموذج الإضافة/التعديل · لوحة التفاصيل (تُبنى من `cfg.columns`/`cfg.fields` في `ResourcePage` فاختفى تلقائيًا) · عمود قالب الاستيراد · 6 مفاتيح i18n يتيمة (ar+en). **`vehiclePlate` بقي** — بيانات موظف، خارج النطاق |
| **حُذف من المركز** | اتحاد `DocCategory` · مفتاح `CANONICAL_SOURCE` (صارت **6** مفاتيح) · `vehicleLicenseExpiry` من `select` جدول الموظفين · سطر بناء الصف · التسمية والأيقونة وخيار الفلتر |
| **المصدر الوحيد** | `EQUIPMENT_REGISTRATION` هو التصنيف الوحيد الذي `sourceModule === 'equipment'` — معدة وموظف ينتهيان في اليوم نفسه يُنتجان **صفًا واحدًا لا صفّين** (مُثبَّت باختبار) |
| **باقٍ deprecated** | `employee.vehicleLicenseExpiry` **ببياناته كاملة (23 موظفًا يحملون قيمة)**، موسوم في **ستة مواضع** بـ«Deprecated — vehicle expiry is owned by Equipment/Vehicle registration»: مخطط Prisma · مخطط Zod للإنشاء/التعديل · قائمة الفرز البيضاء · مطبِّع الاستيراد · تحذير الاستيراد · باني تنبيهات الموظفين. عقد الـAPI سليم فلا ينكسر مستهلك قديم، ولا مستهلك فعلي من الواجهة ولا من المركز |
| **قاعدة البيانات** | **لا migration ولا backfill ولا حذف بيانات** — تغيير `schema.prisma` تعليقات `///` فقط. الأحدث يبقى `20260821120000_multi_bank_cheques_foundation_v1` |
| **أثر على المركز** | 23 صفًا خرجت (منتهية −1 · 30 يومًا −1 · 90 يومًا −1 · سارية −20). بعد الإزالة: **الإجمالي 114** · منتهية 1 · ≤7 أيام 1 · ≤30 يومًا 3 · ≤60 يومًا 4 · ≤90 يومًا 2 · سارية 103 · `actionable` 11. التوزيع: إقامة 32 · جواز 30 · رخصة قيادة 27 · تسجيل معدة 25 |
| **تحذير تشغيلي** | قيم الـ23 موظفًا **لم تعد تظهر في أي شاشة**؛ محفوظة في القاعدة حتى قرار مالك المنتج بحذفها أو نقلها |
| **اختباران جديدان** | `employeeVehicleLicenseRemoved.test.ts` خلفيًا (16 اختبارًا) وأماميًا (9 اختبارات) — غياب البند من إعداد الجدول والنموذج وقالب الاستيراد ومفاتيح الترجمة · المركز لا يقرأ الحقل ولا يطلبه من قاعدة البيانات · لا ازدواج بين المعدة والموظف · الإنشاء/التعديل لا يعتمدان عليه بينما يظل مقبولًا للتوافق · العمود ما يزال في المخطط بلا migration يُسقطه. `expirations.sourceOfTruth` حُدِّث من 7 أنواع إلى 6 |
| **إثبات عدم كونها اختبارات فارغة** | بإعادة النوع مؤقتًا إلى الخدمة سقط **13 اختبارًا خلفيًا**، وبإعادة الحقل إلى النموذج سقط **اختباران أماميان**؛ أُعيد التعديلان فورًا وعادت الحزمة خضراء |
| **Sanity checks** | backend targeted **177/177** ✅ (expirations + employees + import) · frontend targeted **9/9** ✅ · backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend `npm run build` ✅ (لم تُعَد أي مجموعة ضخمة ناجحة سابقًا) |
| **الإصدار** | لا تغيير في `package.json` — **بلا إعادة بناء مثبّت**. `manar.exe` لم يُبنَ في هذه المهمة |

---

## Completed Features — Active Reference

> **What this section is:** a short, current-only map of what the system does today, grouped by domain.
> Each line states **current behaviour**, not the history of how it got there.
>
> **What it is not:** a changelog. The 126 detailed historical feature entries that used to live here were
> moved **verbatim** on 2026-09-08 into [`docs/history/completed-features/`](docs/history/completed-features/README.md)
> (*Completed Features Documentation Compaction & Archive v1*) — nothing was deleted or reworded.
>
> **Reading rule for anyone — human or AI — working on this repo:** if this section and an archived entry
> disagree, **this section wins**. The archive deliberately preserves superseded behaviour, so an old entry
> may describe a design that no longer exists. Never implement against an archived entry without checking
> here (and against the code) first.
>
> Detailed release history: `## Latest Release` / `## Previous Release` below and `docs/history/`.
> End-user documentation: **Complete User Manual v1 — RELEASED** (`docs/user-manual/`).

### Employees & HR

| Feature | Current behaviour |
|---|---|
| **Employee records** | Master record for identity, job, salary and documents. Only **two required fields**: employee code and Arabic name. Statuses: `ACTIVE` · `ON_LEAVE` · `TERMINATED`. Sole source of residency/passport/driving-licence expiry — deliberately **not** vehicle-registration expiry, which belongs to Equipment. Native Excel export; Excel import via the shared importer. |
| **Attendance** | Attendance/absence/overtime records feed payroll generation. A month with no attendance rows still generates payroll from base salary, allowances and deductions. |
| **Employment contract** | Bilingual Kuwait Public Authority for Manpower form, two explicit A4 page containers. Printable for an existing employee **or** by manual entry, which is print-only and creates no employee record. |

### Payroll & Entitlements

| Feature | Current behaviour |
|---|---|
| **Payroll run** | Statuses `DRAFT → APPROVED → PAID`, plus `CANCELLED`. **`PAID` is terminal** — there is no un-pay path. Regenerating a period recomputes DRAFT rows, skips APPROVED/PAID untouched, and creates rows for new employees. |
| **Payroll eligibility** | One shared predicate for both generation and gap detection: `status = ACTIVE` **and** (`hireDate` null **or** ≤ period end). Bulk generation therefore excludes `ON_LEAVE`; generating for a **single named employee deliberately bypasses** the rule so `ON_LEAVE` can be paid, while `TERMINATED` is refused outright. |
| **Missing-employee detection** | An amber banner on the Salaries page names every eligible employee with no payslip for the period and offers Generate inline. It ignores the status filter (a stale filter cannot hide it) and stays silent for a period that has not started. |
| **Payroll editability** | Amounts are computed server-side; nothing is typed into the grid. Manual allowance/deduction lines and note edits are **DRAFT-only** — correcting an approved run means Unapprove → edit → Approve. |
| **Payroll ↔ accounting** | Paying payroll **creates no journal entry by design**. Payroll expense is recorded manually through the Expenses module. |
| **Bank salary export** | Read-only generation of the bank transfer file from an **APPROVED** run (NBK Salary XLS profile, template-preserving). Refuses to export a draft run. |
| **Employee monthly entitlements** | Separate module from payroll with its own permission keys. `basic + overtime + other earnings − deductions = net`. Approval here is **organisational only and does not lock the record** — unlike payroll. Its debts/advances ledger is year-independent and derives balances from movements; it creates no payroll advance, journal entry or expense. |
| **Entitlements bank statement** | Its own approve-then-export flow on the Salaries page; approving **freezes** the exported amounts. Transfer amount = monthly net − base salary. |

### Leave

| Feature | Current behaviour |
|---|---|
| **Leave request form** | Print-oriented HR form. Days are computed inclusively from the two dates and can be overridden by hand. **The request-submission date is user-editable** (defaults to today), so a back-dated request prints its real submission date. Drafts are session-only and are not persisted to the database. |
| **Leave records** | Persisted leave rows carry `requestDate`; rows predating that column fall back to today's date for display, so no historical row changed. |

### Payments, Vouchers & Forms

| Feature | Current behaviour |
|---|---|
| **Administrative forms** | 16 print-ready forms behind one shared employee picker; 10 HR + 6 operations. Each employee-based card exposes a print-mode selector — except the Employee Debt Acknowledgment, whose letterhead geometry is fixed by its own non-selectable profile. |
| **Employee debt acknowledgment** | Three independent official templates (Arabic RTL / English / Hindi, both LTR) for one legal text, filled from a single data-entry screen and printed on the pre-printed company sheet (40 mm top / 20 mm bottom band, measured). Amount-in-words is per template and always hand-editable. **Status: implemented, awaiting Product Owner visual review — not merged.** |
| **Payment voucher** | Two distinct pages: a **standalone** one typed by hand (number editable, no side effects, no accounting entry) and a **cheque-bound** one whose fields are read-only and whose number is issued by the server. |
| **Receipt voucher** | Four required fields with real validation. **The voucher number is allocated and burned the moment Print is pressed — even if the print dialog is cancelled.** Carries a single `المُستلِم / Receiver` signature line that is part of the voucher body. |
| **Company-letterhead sheets** | Payment and receipt vouchers each have a second, non-selectable print profile that drops header/footer furniture and starts the content below the pre-printed letterhead band (45 mm and 50 mm respectively). Selected via the «عادي / ورق الشركة» switch; standard sheet remains the default. |
| **Letter engine** | Draft → **Register** (issues a permanent reference number and freezes content) → print/export as PDF, HTML or Word, all behind one validation gate. Reached only from the Administrative Forms card. **No version history, no comments and no track-changes** exist. |

### Customers, Contracts & Pricing

| Feature | Current behaviour |
|---|---|
| **Customers & suppliers** | Registers for government and private counterparties. Both support **archiving rather than deletion**, so an inactive party disappears from pickers while its invoices and statements stay intact. |
| **Contracts** | Monthly asphalt-transport contracts with plants. Statuses `ACTIVE` · `RENEWING` · `SUSPENDED` · `EXPIRED`. Active and renewing contracts with an end date feed the Expiration Center. |
| **Price agreements** | Per-project agreed prices, used as the reference for invoicing, the work/commission analysis and the agreement-usage report. |
| **Work & commission analysis** | Computes commission and margin **before** invoicing by comparing customer price against equipment-owner price per line. Statuses `DRAFT` · `COMPLETED` · `ARCHIVED`, where `COMPLETED` means "the user finished it", **not** "posted to accounting". Carries a permanent «تحليل داخلي — ليس فاتورة» badge and has **no accounting effect**; revenue is realised only by issuing an invoice. |

### Invoices, Expenses & Accounting

| Feature | Current behaviour |
|---|---|
| **Invoices** | Sales and purchase directions with line items and payments. Statuses `UNPAID` · `PARTIAL` · `PAID` · `OVERDUE` · `CANCELLED`; cancelled invoices are excluded from outstanding totals. Per-line rounding and the tax cap are shared with the server so screen and stored totals agree. |
| **Expenses** | Approval workflow `PENDING → APPROVED / REJECTED`, plus reversal and cancellation. The headline total **includes unapproved rows** and says so; filter by status for the approved figure. |
| **Accounting / GL** | Chart of accounts, journal entries and the transaction ledger. Corrections are made by **reversing** a posting, never by deleting it — a separate permission. Posting date is the document date, not the entry date. |
| **Financial Center** | Six permission-gated tabs: statement of account, receivables ageing, general ledger, trial balance, journal book and financial reports, each with Excel and PDF export. Balance sheet, cash-flow and budget comparison are shown as **«قريباً» and are not implemented**. |
| **Period lock** | Enforced at the central GL write layer; overriding it needs a dedicated permission granted to no role by default, and every override is audited. |

### Banking

| Feature | Current behaviour |
|---|---|
| **Banks & accounts** | `Bank → BankAccount → Cheque` structure; this registry is the source of a cheque's bank identity. Cheque-number uniqueness is **per bank account**, not global. Disabling a bank blocks new cheques without touching existing ones. |
| **Bank statement import** | Incremental import with duplicate detection, data-quality warnings and per-batch management. Import batches can be deleted, which removes their transactions irreversibly. |
| **Bank Account Explorer** | Per-account timeline, analytics, import batches and export. Exports honour the active filters rather than the visible page. |
| **Bank salary analytics** | Analyses imported salary transfers with its own data-quality centre; used to reconcile what the bank actually paid against the approved payroll run. |

### Cheques & Calibration

| Feature | Current behaviour |
|---|---|
| **Cheques** | Statuses `DRAFT` · `PRINTED` · `CANCELLED`; **`CANCELLED` is terminal**. Cheque numbers are always typed by hand from the physical book — no auto-numbering. The amount-in-words (tafqeet) is computed and read-only. A `PRINTED` cheque stays editable; a cancelled one does not. |
| **Cheque printing** | Template is resolved from the cheque's own bank — there is no template picker. The preview shows a cheque image behind the fields, and that image can never reach the printed output. Reprinting is allowed but always logged with a reason. Batch printing refuses to mix banks and is all-or-nothing. |
| **Bank template status** | `APPROVED` prints; `PROVISIONAL` and uncalibrated templates are **blocked from production printing** with an explicit message. Currently Gulf Bank is APPROVED; KFH and NBK are PROVISIONAL. No bank ever borrows another bank's geometry or image. |
| **Calibration** | Three fixed printer profiles — `office` · `home` · `other` — chosen manually, never auto-detected. Calibration identity is the pair **bank template + profile**, stored one settings row per pair. A test print is available and never records a cheque print or changes cheque status. |

### Printing & Documents

| Feature | Current behaviour |
|---|---|
| **Print profiles** | Seven registered profiles, **three user-selectable**: `plain-a4` (app draws the header), `letterhead` (header suppressed for pre-printed stock) and `ready-paper` (app draws the official image header). The remaining four are the voucher/letterhead pairs, selected by their own page switch. Margins come from the profile only — there is no user margin or scale control. |
| **Accurate preview** | Paginates through the same engine that prints, so page count and breaks match the printer exactly. Desktop-only; screen zoom never reaches the print pipeline. |
| **PDF export** | Composed from the live printed node and written by the desktop PDF pipeline, with the OS print dialog as fallback. Copies (1–10) are remembered per form type. |
| **Template Studio** | WYSIWYG designer behind Settings for print templates, including DOCX import. Independent of the cheque calibration studio. |

### Equipment & Expiration

| Feature | Current behaviour |
|---|---|
| **Equipment** | Fleet register; statuses `WORKING` / `NOT_WORKING`; default sort is soonest-registration-expiry first. Sole source of **registration** expiry. |
| **Maintenance** | Maintenance records, fuel logs, breakdowns and spare parts, with a next-service date driving a due-soon card. Not tracked by the Expiration Center. |
| **Vehicle insurance** | Insurance status is **derived from the end date, never stored**. Renewal **creates a new policy** and archives the previous one; the correction action is for typos only. Policies and accidents cannot be deleted. Sole source of **insurance** expiry. |
| **Expiration Center** | Read-only aggregation of six document types (employee residency, passport, licence; equipment registration; equipment insurance; contract end) with bands expired / 7 / 30 / 60 / 90 days. **Nothing is editable here** — each row names its owning screen, and the date must be corrected there. A record with no date does not appear at all. |

### Platform, Reporting & Operations

| Feature | Current behaviour |
|---|---|
| **RBAC** | One role per user, seven roles, permission keys `<module>.<action>` across 44 module namespaces. `SYSTEM_ADMIN` bypasses every check, and a stale token cannot retain that bypass after a downgrade. The roles screen is **read-only** — role→permission grants are not editable from the UI. |
| **Authentication & audit** | JWT sessions (12 h) with bcrypt passwords. Every create/update/delete/approve/print/export/login is written to the audit log with actor, IP and before/after values. The audit screen has no export button. |
| **Data import** | Excel import for **nine entities**: employees, customers, equipment, suppliers, project prices, contracts, expenses, invoices and payroll runs — plus the two banking importers. Downloadable templates, saveable column mappings, preview classification (valid / warning / invalid / duplicate) and then execute. There is no undo. |
| **Reports** | 18 pre-built reports across finance, business, HR, operations and receivables, with Excel export everywhere, PDF on the desktop build, favourites and recents. |
| **Executive & analysis centres** | Executive Decision Center (six tabs; four of them show current status and deliberately ignore the period selector), Financial Operations dashboard (no filters, no export by design) and the Financial Analysis Center (nine sections). Collection Analysis is reachable only from the Financial Analysis Center. |
| **ExplorerKit / unified UI** | Shared explorer shell — header, KPI cards, filter chips, sortable table, detail drawer — applied across the CRUD and operational modules. New screens follow it rather than inventing layout. |
| **Cross-cutting presentation rules** | One money layer mirroring the backend rounding policy; one date-presentation standard; one export file-naming standard; Western digits in numeric contexts. These are project-wide rules, not per-screen choices. |
| **Approval engine** | Generic approval foundation registering entity types centrally; used by the modules that expose approve/unapprove actions. |
| **Backup & sync** | Local backup with manual, automatic, scheduled and rescue types, verification and restore-with-restart. Google Drive sync is a **working desktop-only feature** — link, upload, download, sync-now, conflict resolution with device identity, re-auth recovery, and an automatic rescue backup after any failed cloud operation. It is intentionally absent from the sidebar and from the Integrations catalogue. |
| **Integrations Center** | A **directory, not an execution engine**: three cards navigate to real import screens; the «تشغيل التكامل» button always returns "not enabled yet" and touches no data. |
| **AI assistant** | Deterministic Arabic keyword router over local skills — **read-only, no external network call, no LLM**. Marked experimental; five skills ready, one pending. |
| **Inventory** | Materials, purchase orders, goods receipts and issues. Balances move only on **posting**; drafts do not affect stock, and inventory movements create no journal entries in this release. |
| **Documentation** | **Complete User Manual v1 — RELEASED** (128 pages, Arabic, documents Desktop Production 2026.5.9) — see `docs/user-manual/`. Release history lives in this file plus `docs/history/`. |

---

## Module Inventory

### Backend (`backend/src/modules/`)

| Module | Status |
|--------|--------|
| `auth` | Complete |
| `users` | Complete |
| `roles` | Complete |
| `customers` | Complete |
| `suppliers` | Complete |
| `contracts` | Complete — includes Contract Profitability endpoint |
| `invoices` | Complete |
| `expenses` | Complete |
| `employees` | Complete |
| `payroll` / `salaries` | Complete — **automatic GL double-entry posting on payment** is live: `markPaid()` calls `postPayrollToGL()` (Dr `PAYROLL_EXPENSE 5100` / Cr `CASH 1000` · `BANK 1010` · `SALARIES_PAYABLE 2100` routed by `paymentMethod`), idempotent via `@@unique([referenceType, referenceId])`, reversible via `reversePayrollGL()`, with a dedicated Vitest suite (`payroll.accounting.test.ts`). Note: `payroll` = payroll-generation engine; `salaries` = distinct module (salary-payment records + bank analytics/import) — not a rename. |
| `equipment` / `maintenance` | Complete |
| `transactions` / `accounting` | Complete |
| `reports` | Complete — Financial Receivables Center, Customer Statement, Aging, Balances, Collections |
| `dashboard` | Complete — Executive Intelligence V2, Financial Intelligence |
| `inventory` | Complete |
| `cheques` | Complete |
| `import` | Complete — 7 entities |
| `settings` | Complete — includes `print.*` branding keys (`print.signatureImage`, `print.stampImage`, `print.showSignature`, `print.showStamp`, `print.brandingLayout`, `print.textStyleOverrides`, `print.staticTextOverrides`, `print.layoutOverrides`, `print.templateStudio.templates`, `print.templateStudio.active.invoice`, `print.templateStudio.active.quotation`) + **Operational Polish Suite Phase 4 Package B:** `print.signatures` (JSON array of `SigSlot[]`) — written by `saveSignatures()` in Settings.tsx; backward-compat sync to `print.signatureImage`/`print.showSignature` |
| `backups` | Complete — manual + auto + SHA-256 verification. `POST /api/backups/:id/verify` (`backups.read`): SHA-256 checksum + SQLite header integrity check; 4 nullable fields on `Backup` model (`checksumSha256`, `verifiedAt`, `verificationStatus`, `verificationNote`) + migration `add_backup_verification_fields`; `computeChecksum()` + `verify()` in `backup.service.ts`; verification status badges + Verify button in `Backup.tsx`; `BackupRecord` typed interface (12 fields); 3 backend tests. |
| `audit` | Complete |
| `forms` | Complete — 8 HR print endpoints |
| `prices` | Complete |
| `executive` | Complete — `/api/executive/decision-center` + `/api/executive/kpi-timeline` (both require `dashboard.read`) + `/api/executive/contract-profitability`, `/api/executive/expense-breakdown`, `/api/executive/customer-analytics` (all require `financialdashboard.read`). The 3 financial routes added in Ops Suite Phase D via `financial-exec.service.ts` with parallel `Promise.all` Prisma queries; Recharts BarChart in expense tab; margin % color-coded; 12 backend tests. |
| `approval` | **Phase A complete** — `GET /api/approval-history/:entityType/:entityId`; `authenticate` only; IDOR guard via `hasModule()` + optional `historyPermission`; `ApprovalEngine` singleton at `@shared/services/approval.service`; Phase B: call `approvalEngine.register(config)` to activate |
| `statements` | **Complete** — `GET /api/statements/customers/:id` + `GET /api/statements/suppliers/:id` (`statements.read`); `GET /api/statements/customers/:id/export` + `GET /api/statements/suppliers/:id/export` (`statements.export`); shared `buildStatement()` engine in `@shared/services/statement.service` |
| `financial` | **Complete** — GL Report, Trial Balance, Aging Report, Journal Book, Financial Summary, Financial Dashboard. All endpoints orchestrate via `accountingService` and shared utilities. 11 routes: `GET /api/financial/gl-report[/export]`, `trial-balance[/export]`, `aging-report[/export]`, `journal-book[/export]`, `summary[/export]`, `dashboard-summary`. Permission modules: `gl`, `trialbalance`, `aging`, `journal`, `finreports`, `financialdashboard`. `@shared/services/financial/dashboard-summary.service.ts` (45s TTL cache). `@shared/services/financial/export/summary.export.adapter.ts`. |
| `verification` | **Complete — Print Polish Batch 1 + Final Polish Phase 2 Package E** — `GET /api/verify/:uuid` — **public route (no `authenticate` middleware)** since Final Polish Suite Phase 2 Package E. Looks up invoice by `verificationUuid`; returns `{ found, documentType, documentNumber, status, statusAr, issueDate, updatedAt, isCancelled, isApproved }`. Never exposes PII (no amount/customer/supplier fields). UUID-based, no sequential enumeration risk. `arabicLabels.ts` (backend-only) provides `translateInvoiceStatusAr()`. `DocumentVerify.tsx` calls this endpoint without JWT. 11 Vitest tests. |
| `payrollBankImport` | **Complete — Phase 1** — 4 REST endpoints: `POST /api/payroll-bank-import/preview` (`payrollBankImport.read`), `POST /api/payroll-bank-import/execute` (`payrollBankImport.create`), `POST /api/payroll-bank-import/report/excel` (`payrollBankImport.export`), `POST /api/payroll-bank-import/report/pdf` (`payrollBankImport.export`). **Supported banks:** Gulf Bank, Ahli United, KFH, Warba, Boubyan, NBK (priority-ordered detection via `BANK_CONFIGS`). **Matching engine:** 4 confidence levels — `CODE_100` (employee code exact), `CIVIL_ID_100` (civil ID exact), `BANK_ACCOUNT_90` (IBAN suffix / bank account), `MANUAL` (beneficiary name). **Preview:** `buildPreview()` returns `PreviewSummary` with `canExecute = invalid === 0 && unmatched === 0`. **Execute:** `prisma.$transaction` atomic write to existing `SalaryPayment` table; deduplicates by `employeeId+payrollMonth+payrollYear`; TERMINATED employees blocked. **Validation:** 9 rules (amount, month/year range, currency, date format, duplicate, TERMINATED status, field type, beneficiary name). **Report exports:** `buildImportReportExcel` (ExcelJS, summary + details sheets) + `buildImportReportHtml` (report engine, A4-landscape branding). **Security:** formula injection guard on Excel cells; strict `ImportReportSchema` Zod validation on all export endpoints; `Content-Disposition: attachment` + `Content-Security-Policy: sandbox; default-src 'none'` on PDF handler; HTML escaping via `fmtCell()→esc()`. **Tests: 67 unit tests (5 groups).** |
| `bankStatementImport` | **Complete — Phase 1 + headerless XML fix** — 8 REST endpoints: `POST /api/bank-statement-import/preview` (`bankStatementImport.create`), `POST /api/bank-statement-import/execute` (`bankStatementImport.create`), `GET /api/bank-statement-import` (`bankStatementImport.read`), `GET /api/bank-statement-import/:importId/workspace` (`bankStatementImport.read`), `PATCH /api/bank-statement-import/:importId/transactions/:transactionId/status` (`bankStatementImport.reconcile`), `POST /api/bank-statement-import/:importId/bulk-status` (`bankStatementImport.reconcile`), `GET /api/bank-statement-import/:importId/transactions/:transactionId/suggestions` (`bankStatementImport.read`), `GET /api/bank-statement-import/:importId/export` (`bankStatementImport.export`). **Supported banks (7):** NBK, KFH, Gulf Bank, Boubyan, Warba, Ahli United, UNKNOWN. **Matching engine:** 8 strategies, 4 confidence levels (100/90/75/0), 7 data sources (invoices, payments, expenses, journalEntries, cheques, payrolls). **Reconcile statuses:** `UNMATCHED → MATCHED → IGNORED`, `UNMATCHED → DUPLICATE`, `MATCHED → REVIEW`, `any → REVIEW`. **Atomic import:** `prisma.$transaction` with chunk-500 `createMany`. **Never auto-post.** **Headerless XML Spreadsheet fix (2026-06-28, commit `322f39f`, Gemini APPROVED):** Excel 2003 XML Spreadsheet files have no header row — `isLikelyHeaderless()` detects this by checking whether `row[0][0]` parses as a date; `parseExcelRowsPositional()` then reads columns by fixed position (`DATE=0, DESC=1, DEBIT=3, CREDIT=4, BALANCE=6` — columns 2+5 are currency, ignored); `parseDateString` extended to handle `"DD MMM YYYY"` verbose month format (e.g. `"29 May 2026"`); fallback wired into both backend `parseExcelRows` and frontend `parseExcelRowsClient`; mirrored in `bankStatementParser.ts` (client-side). Exported: `isLikelyHeaderless`, `parseExcelRowsPositional`, `POSITIONAL_COL` (backend); `isLikelyHeaderless`, `parseExcelRowsPositionalClient` (frontend). No API changes, no schema changes, no UI changes. **1085/1085 backend tests (57 files, +17 new tests).** **Preamble header-row detection fix (2026-06-28, commit `ef1e3e8`, Gemini APPROVED):** Statement files where the real transaction table is preceded by metadata rows (e.g. Date, Customer Name, Account Number preamble) were returning 0 results because `parseExcelRows` always read the header from row 0. Fix: `findTransactionHeaderRow(sheetData, maxRows=30)` scans the first 30 rows and returns the index of the first row that matches ALL four keyword groups — date (`date` / `التاريخ`), description (`description` / `البيان`), money (`debit` / `credit` / `مدين` / `دائن`), balance (`balance` / `الرصيد`) — using case-insensitive substring matching. If found at row N, `parseExcelRows` uses row N as the effective header and row N+1 as data start; preamble rows above are silently skipped. Also adds first-occurrence deduplication for duplicate column names (e.g. Currency…Currency columns). Mirrored in frontend `parseExcelRowsClient`. Existing paths unchanged: headerless positional fallback, normal header-at-row-0, CSV parsing. Exported: `findTransactionHeaderRow` (backend + frontend). +10 tests → **1095/1095 backend tests (57 files).** |
| `integrations` | **Complete — Phase 1 Foundation** — 4 REST endpoints: `GET /api/integrations` (`integrations.read`), `GET /api/integrations/:id` (`integrations.read`), `PUT /api/integrations/:id/settings` (`integrations.configure`), `POST /api/integrations/:id/run` (`integrations.run`). Static registry of 6 integrations. Settings stored in existing `Setting` table (key pattern `integrations.<id>.<field>`). Run endpoint always returns `not_implemented` in Phase 1 + writes AuditLog. `payroll-bank-import` card: `targetRoute: '/payroll/bank-import'` — clicking تشغيل navigates to the dedicated import wizard. `bank-statement-import` card: **now `available/stable`**, `targetRoute: '/bank-statement-import'` — clicking تشغيل navigates to the import wizard (Phase 1 live). 21 Vitest tests. |
| `expirations` | **Complete — Ops Suite Phase B** — New module. `GET /api/expirations` + `GET /api/expirations/summary` + `GET /api/expirations/export` (Excel). 7 document expiry categories; urgency classification (expired <0d, critical 0–7d, soon-30 8–30d, soon-60 31–60d, soon-90 61–90d, ok >90d). Prisma field `Equipment.insuranceExpiry DateTime? @@index` + migration `add_equipment_insurance_expiry`. Permissions: `expirations.read` + `expirations.export` (SYSTEM_ADMIN + ACCOUNTANT + PROJECT_MANAGER). 4 backend tests. |
| `attachments` | **Complete — Ops Suite Phase E** — New module. multer diskStorage (`<uuid>-<safeOriginalName>` filenames); `ATTACHMENTS_DIR` env var; `ALLOWED` entity type set (`CUSTOMER/CONTRACT/INVOICE/EMPLOYEE/SUPPLIER/EXPENSE/EQUIPMENT`); `path.resolve` boundary validation. `Attachment` Prisma model + migration `add_attachment`. Entity-module permission checks on GET/POST/DELETE (POST cleans temp file on 403). 2 new Electron IPC channels: `attachments:openFileDialog` + `attachments:openPath` (validates path within `ATTACHMENTS_DIR`, allowed extension, regular-file check). Preload: `window.manar.openFileDialog()` + `window.manar.openAttachment(path)`. Reusable `AttachmentsPanel.tsx` embedded in `Invoices.tsx` + `Expenses.tsx`. New npm dep: `multer@^2.2.0` + `@types/multer`. |

### Frontend (`frontend/src/pages/`)

| Page | Status |
|------|--------|
| `Dashboard.tsx` | Complete — dual-tab shell (عام/مالي) with `localStorage.getItem('dashboard.tab')` persistence; مالي tab gated by `financialdashboard.read`; General tab = `GeneralDashboardContent` (Executive Intelligence V2, Financial Intel, KPI cards, charts, **`ExpirationWidget` — document expiration summary widget from Ops Suite Phase B**); Financial tab = `FinancialDashboardTab` |
| `FinancialCenter.tsx` | **Complete** — 5 tabs: statement (Customer/Supplier Statement), gl (GL Report), trialbalance (Trial Balance), journal (Journal Book), finreport (Financial Reports). URL-scoped date params per tab (fromDate/toDate, glFrom/glTo, frFrom/frTo). Dismissible migration banner on Statements.tsx |
| `Invoices.tsx` / `InvoicePreview.tsx` | Complete — InvoicePreview: engine + legacy + per-print branding + PDF export + **Phase 5A inline designer mode** + **Phase 5B text styling** + **Phase 5D.1 editable static text** + **Phase 5D.2 Universal Layout Designer** + **Phase 6.0 Template Studio (optional, default OFF)** + **Phase 6.1A — passes `resolveInvoiceLineItems(data.items)` to TemplateStudioRenderer for lineItemsTable elements** + **Print Polish Batch 1 — `verificationUuid` in `FullInvoice` type; `DocumentVerificationQR` rendered bottom-right of engine mode when uuid present** + **Ops Suite Phase E — `AttachmentsPanel` embedded (multer file upload, Electron IPC `openAttachment`)** |
| `Quotation.tsx` | Complete — legacy form mode + engine template mode + per-print branding + PDF export (engine) + **Phase 5A inline designer mode (engine)** + **Phase 5B text styling** + **Phase 5D.1 editable static text** + **Phase 5D.2 Universal Layout Designer (engine mode)** + **Phase 6.0 Template Studio (optional, default OFF)** + **Phase 6.1A — passes `resolveQuotationLineItems(printFields.items)` to TemplateStudioRenderer for lineItemsTable elements** + **Phase 6.1C — passes explicit `subtotal/discount/tax/grandTotal` in studio renderer data map** |
| `Salaries.tsx` / `PayrollPayslip.tsx` | Complete |
| `Accounting.tsx` | Complete |
| `Reports.tsx` / `ReportPrint.tsx` | Complete |
| `Expenses.tsx` | Complete — **Ops Suite Phase E: `AttachmentsPanel` embedded** (multer file upload, Electron IPC `openAttachment`) |
| `Maintenance.tsx` | Complete |
| `Inventory.tsx` | Complete |
| `Cheques.tsx` | Complete |
| `BankSalaryAnalytics.tsx` | Complete — **Operational Polish Suite Phase 4 Package F:** 3 KPI summary cards with PrivateAmount; grouped filter panel (4 sections + quick period chips); chart panels in `.card.panel`; sticky-thead tables with empty state; full Tailwind-to-project-css migration |
| `DataImport.tsx` | Complete |
| `AuditLog.tsx` | Complete |
| `Backup.tsx` | Complete |
| `Settings.tsx` | Complete — includes Document Branding section + **Phase 6.0 Template Studio button** + **Operational Polish Suite Phase 4 Package B: multiple signature support** (`SigSlot[]` state, add/remove/default/show/upload per slot, `saveSignatures()` writes `print.signatures` JSON + syncs legacy `print.signatureImage`/`print.showSignature` keys) + **قاموس الترجمة section — Administrative Forms English Translation Completion v1:** the shared `DictTable` editor now serves **two fully isolated groups**, each its own AR→EN dictionary: **Administrative Forms** (nationalities/job titles/departments/certificate purposes → `dict.forms.*` keys, resolved at render time by `lib/businessTerms.ts` via `useBusinessTerms()`) and **Employment Contract** (nationalities/job titles → unchanged `dict.nationalities`/`dict.jobTitles` keys, unchanged `applyTranslationOverrides()` load-on-mount in `EmploymentContract.tsx`) — editing one group never affects the other (regression-guarded) |
| `Users.tsx` | Complete |
| `Forms.tsx` + 12 print pages | Complete — 8 HR forms + EmploymentContract + Quotation + PurchaseRequest |
| `Prices.tsx` | Complete |
| `ResourcePage.tsx` | Complete — generic CRUD with persisted state |
| `ExecutiveDecisionCenter.tsx` | Complete — 6-tab layout: Financial Summary, Decision Cards, Alerts V3, KPI Timeline, Health Score, Recommendations; PDF export via `window.manar.exportPdf()` |
| `Statements.tsx` | **Complete** — customer/supplier statement page; two tabs; entity picker; filter bar (fromDate/toDate/referenceType/search); 5 summary cards; color-coded transaction table with running balance; Excel export; export error feedback; invoice reference navigation |
| `PayrollBankImport.tsx` | **Complete — Phase 1** — 5-step bank payroll import wizard. Route: `/payroll/bank-import`. RBAC: `.read` (view/preview), `.create` (execute), `.export` (PDF/Excel export buttons). **Step 1 — Upload:** Drag-drop + file input; MIME/size/extension validation (XLSX/XLS only, 10 MB cap); `XLSX.read(data, { type: 'array', cellDates: true })`. **Step 2 — Template detect:** Client-side `BANK_CONFIGS` mirrors backend; sheet detection order (monthly sheets → All_Transactions → first sheet fallback); `sheetHeaders(ws)` + `sheetRows(ws)` helpers. **Step 3 — Preview:** `POST /api/payroll-bank-import/preview` with parsed rows; 8 KPI cards (total/matched/unmatched/valid/warnings/invalid/duplicates/amount); full row table with `MatchBadge` (confidence level chip) + `StatusPill` (status color); "show all 50+" toggle. **Step 4 — Confirm:** Readonly summary + warning paragraph + explicit checkbox gate. **Step 5 — Done:** Success banner + final KPIs + PDF/Excel export buttons (disabled without `.export` permission) + detail table. `StepIndicator` visual progress bar across 5 visual steps. |
| `BankStatementImport.tsx` | **Complete — Phase 1 + Operational Polish Suite Phase 4 Package D** — 5-step bank statement import wizard. Route: `/bank-statement-import`. RBAC: `bankStatementImport.create`. **Step 1 — Upload:** Drag-drop + file input; MIME/size/extension validation (XLSX/XLS/CSV only, 10 MB cap). **Step 2 — Detect:** Client-side bank template detection from column headers. **Step 3 — Preview:** Sends parsed rows to `POST /api/bank-statement-import/preview`; shows up to 500 rows with summary cards (total/matched/unmatched/duplicate/bankFees/errors); match confidence badges. **Step 4 — Confirm:** Summary + explicit confirmation gate. **Step 5 — Done:** Success banner with import ID + navigate-to-reconciliation button (fixed from `<a href>` → `useNavigate` to prevent HashRouter full-reload in Electron). **Package D polish:** all 5 steps redesigned using project CSS vars, all Tailwind classes removed. |
| `BankReconciliation.tsx` | **Complete — Phase 1** — Bank reconciliation workspace. Route: `/bank-reconciliation` + `/bank-reconciliation/:importId`. RBAC: `bankStatementImport.read`. **ImportSelector:** shown when no importId; lists all past imports. **Status summary cards:** UNMATCHED / MATCHED / IGNORED / DUPLICATE / REVIEW (clickable filters). **Filter bar:** search, isBankFee checkbox, isDuplicate checkbox. **Bulk action toolbar:** bulk MATCHED / IGNORED / REVIEW with transition validation. **Transaction table:** per-row status update, confidence badge, bank fee badge, duplicate badge, match type chip. **PostingSuggestionsPanel:** modal showing INVOICE_PAYMENT / EXPENSE_LINK / JOURNAL_ENTRY / IGNORE suggestions — never auto-posts, explicit confirmation required. **Export:** Excel + PDF report via `GET /api/bank-statement-import/:importId/export`. |
| `DocumentExpirationCenter.tsx` | **Complete — Ops Suite Phase B** — Document Expiration Center. Summary cards (expired/critical/soon-30/soon-60/soon-90/ok counts), filter bar (urgency/category), sortable table, Excel export button. Route: `/document-expirations`. Permission: `expirations.read`. `ExpirationWidget.tsx` provides the dashboard summary widget embedded in `Dashboard.tsx` General tab. |
| `FinancialOperationsDashboard.tsx` | **Complete — Ops Suite Phase D** — Financial Operations Dashboard. 4 tabs: ربحية العقود (contract profitability) / تحليل المصروفات (expense breakdown, Recharts BarChart) / تحليل العملاء (customer analytics) / الاتجاهات (trends). Feeds from 3 new `/api/executive/*` routes (`financialdashboard.read`). Route: `/financial-operations`. |
| `DocumentVerify.tsx` | **Complete — Final Polish Suite Phase 2 Package E** — Public QR verification page. Calls `GET /api/verify/:uuid` without JWT (public endpoint). Displays document type, number, status, dates; never shows financial amounts or customer/supplier data. Route: `/verify/:uuid`. |
| `Integrations.tsx` | **Complete — Phase 1 Foundation** — مركز التكاملات page. Cards grouped by category (bank/import/backup/automation/future). Per-card: name, status badge (متاح/قريباً/قادم), maturity badge, enabled/configured badges, capabilities list, health indicator, action buttons. `SettingsPanel` inline modal: enabled toggle + notes textarea, RBAC-aware (read-only when no `integrations.configure`). `RunResultDialog`: displays Arabic `messageAr` from run endpoint. Planned integrations show disabled `قريباً` button. RBAC: `إعدادات` requires `configure`, `تشغيل` requires `run`. **Phase 1 + Payroll Bank Import wiring:** `handleRun` navigates to `card.targetRoute` when set — `payroll-bank-import` card navigates to `/payroll/bank-import`. Route: `/integrations`. Nav: `hub` icon, `integrations.read` permission, `nav.group.system` group. |

---

## Print Engine

### Architecture

```
frontend/src/print-templates/
├── engine/          # Types, registry, template definitions, textStyleTypes.ts
│                    # BrandingDocKey/FORM_BRANDING_DOC_KEYS (Multi-Signature & Stamp v1)
├── branding/        # brandingAssets.ts — BrandingAsset list model, print.signatures/
│                    # print.stamps parse/serialize, legacy-key mirrors (Multi-Signature & Stamp v1)
├── adapters/        # companyData (createCompanyPrintData), apiTypes
├── builders/        # invoicePrintDataBuilder, quotationPrintDataBuilder
├── hooks/           # usePrintTemplate, useCompanyBranding (extended Phase 5D.2, now also
│                    # reads print.signatures/print.stamps — Multi-Signature & Stamp v1),
│                    # useBrandingSelection.ts (Multi-Signature & Stamp v1 — per-document asset choice),
│                    # useBrandingDesigner (generalized to all BrandingDocKey docs — Multi-Signature
│                    # & Stamp v1), useLayoutDesigner.ts (Phase 5D.2)
├── components/      # PrintTemplateSelector, BrandingLayoutDesigner,
│                    # BrandingAssetPicker.tsx (Multi-Signature & Stamp v1 — asset dropdown + show toggle),
│                    # BrandingDesignerOverlay, BrandingDesignerPanel (bounds now read from
│                    # designer.bounds — Multi-Signature & Stamp v1), BrandingDesignerToolbar,
│                    # UniversalDesignerOverlay.tsx (Phase 5D.2)
│                    # LayoutDesignerPanel.tsx (Phase 5D.2)
│                    # LayoutOverrideStyles.tsx (Phase 5D.2)
│                    # SmartGuides.tsx (Phase 5D.2)
│                    # DocumentVerificationQR.tsx (Print Polish Batch 1 — SVG QR via qrcode.toString())
├── designer/        # useTextStyleDesigner.ts (Phase 5B)
│                    # DesignableBrandingImage.tsx (Multi-Signature & Stamp v1 — drag/resize-handle
│                    # image shared by every ApprovalSection-based form's signature/stamp)
│                    # designerTypes.ts (Phase 5C, updated 5D.2: all capabilities true)
│                    # useDesignerSelection.ts, designerDom.ts (Phase 5C)
│                    # layoutOverrideTypes.ts (Phase 5D.2)
│                    # layoutOverrideUtils.ts (Phase 5D.2)
├── studio/          # ── Phase 6.0 Template Studio + Phase 6.1A Line Items + Phase 7A DOCX Import ───
│   ├── docxImport/  # Phase 7A — DOCX→TemplateStudio import module
│   │                # docxTypes.ts    — constants (10MB cap, 200-elem cap, 5MB JSON limit,
│   │                #                   1.5mm gap, 285mm clamp, 15s timeout), DocxWarning,
│   │                #                   DocxImportOptions, DocxParseResult, WizardInternalState
│   │                # docxMappings.ts — mapFontSizePt, parseFontSizePt, mapAlignment (RTL),
│   │                #                   parseTextAlign, mapTextColor (hex→StudioTextColor nearest),
│   │                #                   normalizeArabic, KEYWORD_SETS (7 line-item column patterns),
│   │                #                   DEFAULT_COLUMN_WIDTHS
│   │                # docxParser.ts   — tryDynamicField (whole-para match + allowlist),
│   │                #                   docxHtmlToElements (DOMParser, flow layout, 200-elem cap,
│   │                #                   heading→xlarge/bold, HR→LineElement, table→LineItemsTable),
│   │                #                   parseDocx (mammoth + jszip secondary pass for margins),
│   │                #                   buildImportedTemplate (TemplateStudioTemplate factory)
│   │                # DocxImportWizard.tsx — 4-step modal (file select, doc type, parse+preview,
│   │                #                   name+confirm); inline styles; StepPips; 10MB validation;
│   │                #                   TemplateStudioRenderer preview at DOCX_PREVIEW_SCALE 0.45
│   │                # __tests__/docxParser.test.ts — 31 unit tests (jsdom env):
│   │                #                   empty doc, paragraph mapping, empty-para filtering,
│   │                #                   h1/h2→xlarge+bold, h3→large+medium, inline styles
│   │                #                   (bold, italic/underline once-only warnings), alignment
│   │                #                   (center/right/left/justify/default), flow layout
│   │                #                   (strictly increasing y, first y≥marginMm), font size
│   │                #                   (7pt→small, 20pt→xlarge, default→normal),
│   │                #                   tryDynamicField (valid, mixed, unknown, cross-type),
│   │                #                   dynamic field elements, HR→LineElement, Arabic table
│   │                #                   detection, 200-elem cap, page breaks, BaseElement fields
│                    # templateStudioTypes.ts      — all type definitions (9 element types incl.
│                    #                               lineItemsTable, allowlists, NormalizedLineRow,
│                    #                               LineItemsColumn, TableHeaderStyle, TableRowStyle,
│                    #                               TableBorderStyle, INVOICE/QUOTATION_LINE_ITEM_FIELDS,
│                    #                               TemplateStudioTemplate, TemplateStudioSettings v1)
│                    # templateStudioUtils.ts      — generateElementId, sanitizeTemplateName,
│                    #                               resolveDynamicField, parseTemplateStudioSettings,
│                    #                               validateElement (incl. lineItemsTable branch),
│                    #                               validateTemplate, importTemplate, exportTemplate,
│                    #                               isDataUrlWithinLimit, createBlankTemplate,
│                    #                               cloneTemplate, getActiveTemplate
│                    # TemplateStudioRenderer.tsx  — A4 794×1123 px canvas renderer;
│                    #                               PX_PER_MM = 794/210; token→CSS maps;
│                    #                               QrRenderer (qrcode package), BarcodePlaceholder,
│                    #                               ElementShell; no dangerouslySetInnerHTML;
│                    #                               Phase 6.1A: renderLineItemsTableEl, tableCellAlign,
│                    #                               getCellValue, lineItems?: NormalizedLineRow[] prop;
│                    #                               Phase 6.1B: 4-param renderLineItemsTableEl (el, lineItems,
│                    #                               docType, data); isAllZeroOrEmpty; REQUIRED_LINE_ITEM_FIELDS;
│                    #                               row striping, print-safe thead/tfoot/tr CSS,
│                    #                               resolveInvoice/QuotationDocumentTotals integration
│                    # TemplateStudioEditor.tsx    — full-screen WYSIWYG editor;
│                    #                               560×793 px editor canvas, EDITOR_PX_MM = 560/210;
│                    #                               three-panel RTL layout; pointer-capture drag;
│                    #                               keyboard handler; template CRUD; import/export;
│                    #                               Phase 6.1A: "جدول بنود" toolbar button,
│                    #                               column visibility/label/width/align/reorder panel,
│                    #                               header/row/border style, totals toggles;
│                    #                               Phase 6.1B: autoHideZeroColumns checkbox, rowStriping
│                    #                               checkbox, labelAlign select, valueAlign select,
│                    #                               aria-labels on all totals controls, "خيارات العرض" section;
│                    #                               Phase 6.1C: context note "البنود تُعبأ من الوثيقة عند الطباعة"
│                    #                               + quotation-only discount/tax hint in totals section;
│                    #                               Phase 7A: `docxWizardOpen` state + "استيراد DOCX" button
│                    #                               + `<DocxImportWizard>` mount with updateTemplates callback
│                    # lineItemsResolver.ts        — Phase 6.1A: resolveInvoiceLineItems,
│                    #                               resolveQuotationLineItems, normalizeColumnWidths,
│                    #                               getDefaultInvoiceColumns, getDefaultQuotationColumns,
│                    #                               getDefaultLineItemsColumns, fmtNum;
│                    #                               Phase 6.1B: DocumentTotals interface, safeFmtStr,
│                    #                               resolveInvoiceDocumentTotals,
│                    #                               resolveQuotationDocumentTotals (subtotal/grandTotal fallback);
│                    #                               Phase 6.1C: resolveQuotationDocumentTotals uses || (not ??)
│                    #                               so empty-string subtotal/grandTotal also fall back to data.total
│                    # useTemplateStudio.ts        — hook: GET /settings → activeTemplate | null;
│                    #                               silently degrades; no coupling to useCompanyBranding
├── integration/     # invoicePreviewIntegration, quotationPreviewIntegration
├── service/         # printTemplateService
├── storage/         # printProfileStorage (localStorage)
├── utils/           # brandingHelpers, brandingLayout (BRANDING_LAYOUT_BOUNDS — one central
│                    # x/y ±150 / scale 0.2–4 envelope for every document, Multi-Signature &
│                    # Stamp v1; superseded PRINT_TEMPLATE_BOUNDS/FORM_BRANDING_BOUNDS removed),
│                    # designerUtils (extended Phase 5D.2),
│                    # formatKWD, tafqeet, sanitizePrintText, formatDate,
│                    # textStyleOverrides.ts (Phase 5B), inkFilter.ts (Phase 5A.1)
│                    # printI18n.ts (Print Polish Batch 1 — 6 Arabic translation functions, frontend-only)
└── reference/       # 30 React template components
    ├── invoices/    # InvoiceDesign1–5 + Blank variants (10 files + 5 CSS modules)
    │                # InvoiceDesign1+Blank: footer div gets data-designer-id (Phase 5D.2)
    ├── quotations/  # QuotationBase + QuotationDesign1–5 + Blank variants (11 files + 1 CSS module)
    ├── purchase-orders/
    └── rfq/
```

### Template Registry — 30 Total

| Category | Count | Designs |
|----------|-------|---------|
| Invoice | 10 | Design 1–5 (original + blank-letterhead) |
| Quotation | 10 | Design 1–5 (original + blank-letterhead) via `QuotationBase.tsx` shared renderer |
| Purchase Order | 6 | Design 1–3 (original + blank) |
| RFQ | 4 | Design 1–2 (original + blank) |

### Print Settings Keys (Settings Table)

| Key | Type | Phase | Purpose |
|-----|------|-------|---------|
| `print.signatureImage` | Base64 string | Phase 1 | Manager signature image |
| `print.stampImage` | Base64 string | Phase 1 | Company stamp image |
| `print.showSignature` | `'true'`/`'false'` | Phase 1 | Global signature visibility default |
| `print.showStamp` | `'true'`/`'false'` | Phase 1 | Global stamp visibility default |
| `print.brandingLayout` | JSON string | Phase 4 | Signature/stamp position per doc type |
| `print.textStyleOverrides` | JSON string | Phase 5B | Text area style tokens per doc type |
| `print.staticTextOverrides` | JSON string | Phase 5D.1 | Editable static text labels per doc type |
| `print.layoutOverrides` | JSON string | **Phase 5D.2** | **Element CSS transforms per doc type — `AllLayoutOverrides` shape** |
| `print.templateStudio.templates` | JSON string | **Phase 6.0** | **`TemplateStudioSettings` blob — `{ version: 1, templates: TemplateStudioTemplate[] }`** |
| `print.templateStudio.active.invoice` | string | **Phase 6.0** | **ID of the active studio template for invoices (empty = none)** |
| `print.templateStudio.active.quotation` | string | **Phase 6.0** | **ID of the active studio template for quotations (empty = none)** |

### Phase 5B — Text Style Token System

**Settings key:** `print.textStyleOverrides`

**Data shape:**
```typescript
PrintTextStyleSettings = {
  invoice?: InvoiceTextAreas;   // per-area style objects
  quotation?: QuotationTextAreas;
}

// Each area (e.g. title, customerBlock, tableHeader, etc.) contains:
TextElementStyle = {
  fontSize?: TextFontSize;           // tiny/small/normal/large/xlarge
  fontFamily?: TextFontFamily;       // cairo/ibmPlexArabic/tajawal/arial
  fontWeight?: TextFontWeight;       // normal/bold/extrabold
  color?: TextColor;                 // default/dark/primary/secondary/muted/white
  align?: TextAlign;                 // inherit/right/center/left
  lineHeight?: TextLineHeight;       // tight/normal/relaxed/loose
  letterSpacing?: TextLetterSpacing; // tight/normal/wide
}
TableHeaderStyle = TextElementStyle & { bgColor?: TableBgColor }  // default/light/primary
TableBorderStyle = { color?: TableBorderColor }  // default/light/medium/dark/none
```

**CSS variable for table borders:** `--designer-table-border` — set on `<table>` element inline style; consumed by CSS module rules on `th`, `td`, `tfoot td`. Fallback is original hardcoded color. All 6 CSS modules updated (InvoiceDesign1–5.module.css + QuotationShared.module.css).

**apply functions:**
- `applyTextElementStyle(style, context?)` — context='title' → 12–18pt; context='cell' → 9–12pt
- `applyTableHeaderStyle(style)` — returns merged text + bgColor CSS
- `applyTableBorderStyle(style)` — returns `{ '--designer-table-border': color }` or `{}`

### Print & Document Suite — Phase 5A (Inline WYSIWYG Branding Designer)

**UX flow:** Open invoice/quotation → click "🔧 وضع التصميم" → real document becomes editable → drag signature/stamp directly → save. No Settings modal required for primary editing.

**Shared designer engine (new files):**
- `utils/designerUtils.ts` — 6 pure helpers: `snapToGrid`, `formatUnit`, `keyboardMove`, `historyPush`, `historyUndo`, `historyRedo`
- `hooks/useBrandingDesigner.ts` — all designer state: `localLayout` (with `layoutRef` mirror for synchronous drag reads), history via `histRef` (max 30 entries), drag via `dragStartRef`, zoom (50/75/100/150/200/Fit), grid, snap, save
- `components/BrandingDesignerOverlay.tsx` — wraps document; adds H+V rulers (tick every 50 scaled px), SVG grid overlay, drag handles positioned via `getBoundingClientRect` on `[data-bd-type]` elements; keyboard listener (Arrow, Shift+Arrow, Ctrl+Z/Ctrl+Shift+Z); `onPointerCancel` + `releasePointerCapture` for safe gesture termination. **Phase 5B:** also detects `[data-designer-type="text"]` clicks for text area selection; amber highlight rect overlaid on selected text area.
- `components/BrandingDesignerPanel.tsx` — floating RTL properties panel; context-switches between branding controls and `TextAreaControls` based on `textStyleDesigner.selectedArea`. Combined save via `onSave` prop. **Phase 5B:** `TokenButtons<T>` generic component for token selection UI.

**Page integration:**
- `InvoicePreview.tsx` — designer in legacy view mode; `effectiveBrandingLayout` drives both sig/stamp rendering and `printData` useMemo; `data-bd-type` attrs on imgs when designer active; **Phase 5B:** `useTextStyleDesigner` hook wired, `data-designer-type/id` on all text zones, `onSave` saves both branding + text style
- `Quotation.tsx` — designer in engine mode; **Phase 5B:** same wiring
- `QuotationBase.tsx` — `data-bd-type="signature/stamp"` (Phase 5A) + `data-designer-type/id` on all text zones (Phase 5B)

**Storage:** `print.brandingLayout` for branding, `print.textStyleOverrides` for text styles. Both via `PUT /settings`. Zoom/grid/snap are local-only (not persisted).

**No migration. No backend changes. No new IPC. No new npm packages.**

---

### Print & Document Suite — Phase 4 (Visual Signature & Stamp Position Designer)

**Storage:** `print.brandingLayout` key in existing `Settings` table (JSON string). No migration, no schema change, no IPC, no new dependencies.

**Data shape:**
```typescript
PrintBrandingLayoutSettings = Record<'invoice' | 'quotation', {
  signature: BrandingElementLayout;  // { x, y, scale, opacity, zIndex }
  stamp:     BrandingElementLayout;
}>
```
Clamp bounds: x ±80 px, y ±60 px, scale 0.4–2.5, opacity 0.2–1, zIndex 1|2.

**Key files:**
- `engine/types.ts` — `BrandingElementLayout`, `BrandingLayout`, `PrintBrandingLayoutSettings`, `PrintDocumentType`
- `utils/brandingLayout.ts` — `parseBrandingLayout` (fail-safe), `serializeBrandingLayout`, `clampBrandingElementLayout`, `getBrandingLayoutForDocument`, `applyBrandingElementStyle` (returns `CSSProperties`)
- `components/BrandingLayoutDesigner.tsx` — modal with live preview area (380×240 px), drag-and-drop via native pointer events (`setPointerCapture`), `Slider` sub-component, per-document-type tabs, RTL
- `hooks/useCompanyBranding.ts` — loads `print.brandingLayout` and `print.textStyleOverrides`; exposes both parsed or `undefined`
- `adapters/companyData.ts` — `createCompanyPrintData()` filter now passes `brandingLayout` and `textStyleOverrides` objects
- `Settings.tsx` — "معايرة التوقيع والختم" button opens designer; `handleDesignerSave` calls `PUT /settings`; success message shown

**Template integration:** All 10 invoice templates call `getBrandingLayoutForDocument(data?.company?.brandingLayout, 'invoice')` and spread `applyBrandingElementStyle(brandingLayout.signature/stamp)` onto each image. `QuotationBase.tsx` does the same with `'quotation'` doc type.

**Phase compatibility:** `showSignature`/`showStamp` toggles (Phase 2) take precedence — layout only affects position/scale/opacity of already-visible elements. PDF export (Phase 3) captures DOM as-is, so layout is embedded in exported PDFs automatically.

### PDF Export Architecture (Two Pipelines)

**Pipeline A — DOM Capture (`pdf:export`):** Electron `webContents.printToPDF()` captures current page DOM in print media mode. Used by: Invoice/Quotation documents, Executive Decision Center, legacy ReportPrint.

**Pipeline B — Chromium HTML→PDF (`pdf:exportHtml`):** Backend generates self-contained HTML (Cairo font embedded as base64, RTL `dir="rtl"`, A4 landscape `@page`) → frontend fetches it via `format=html` → Electron opens hidden `BrowserWindow`, loads HTML from temp file, 400ms settle, `printToPDF({ preferCSSPageSize: true, printBackground: true })` → Chromium handles HarfBuzz shaping, BiDi, RTL → Arabic text is selectable and searchable. Used by: Financial Center (all 6 PDF export types) + Financial Reports tab + Reports Center (new PDF button, Phase 3).

**Report Engine (Phase 3):** `buildReportHtml(input, options?)` — facade over 7 template modules. `ReportOptions` adds `PrintProfile` (6 profiles), `WatermarkType` (7 types), `ReportBranding` (loaded from Settings via `loadReportBranding()`), page-number CSS counters, notes, signature area. All Financial Center and Reports Center PDF exports use this engine.

**PDFKit (`pdf.service.ts`):** Retained for legacy compatibility at `format=pdf`. NOT removed.

---

### Print & Document Suite — Phase 3 (Native PDF Export)

**Mechanism:** Electron `webContents.printToPDF()` — captures current page DOM in print media mode. (Pipeline A)

**IPC channel:** `pdf:export` (registered in `electron/ipc/pdf.ipc.ts`)
- Uses `BrowserWindow.fromWebContents(event.sender)` — not `getFocusedWindow()`
- Opens native Windows save dialog with suggested filename
- Calls `printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })`
- Writes Buffer via `fs.promises.writeFile`

**Preload:** `window.manar.exportPdf(suggestedName)` → `Promise<{ success, canceled?, path?, sizeBytes?, error? }>`

**Filename utility:** `frontend/src/utils/pdfFilename.ts`
- `sanitizePdfFilename` — strips Windows-forbidden chars (`\ / : * ? " < > |`)
- `buildInvoicePdfName` → `INV-{number}-{YYYY-MM-DD}`
- `buildQuotationPdfName` → `QT-{number}-{YYYY-MM-DD}`

**PDF respects Phase 2 overrides** — captures DOM as-is; signature/stamp visibility is already reflected in DOM from `printShowSignature`/`printShowStamp` state.

**Scope:**
- `InvoicePreview.tsx` — both engine and legacy modes export current view
- `Quotation.tsx` — engine mode only (legacy deferred)

**No migration. No backend. No schema changes. No new dependencies.**

---

## Electron IPC Registry

| Channel | File | Purpose |
|---------|------|---------|
| `dialog:save` | `dialog.ipc.ts` | Save file path dialog |
| `dialog:openBackup` | `dialog.ipc.ts` | Open backup file dialog |
| `app:restart` | `dialog.ipc.ts` | Relaunch app |
| `app:print` | `dialog.ipc.ts` | System print dialog (unchanged) |
| `app:info` | `dialog.ipc.ts` | App version/platform |
| `backup:create` | `backup.ipc.ts` | Create DB backup |
| `backup:restore` | `backup.ipc.ts` | Restore DB from backup |
| `backup:getDatabasePath` | `backup.ipc.ts` | DB path info |
| `backup:reconfigure` | `backup.ipc.ts` | Reload auto-backup schedule |
| `session:setToken` | `session.ipc.ts` | Sync JWT to main process |
| **`pdf:export`** | **`pdf.ipc.ts`** | **Native PDF export — Phase 3; used by Invoice/Quotation, Executive Decision Center, legacy ReportPrint** |
| **`pdf:exportHtml`** | **`pdf.ipc.ts`** | **Arabic-safe report PDF — Chromium HTML→PDF pipeline; Financial Center + FinancialReportsTab** |

---

## Dashboard

| Component | Status |
|-----------|--------|
| `KPICard` — revenue, expenses, profit, active contracts | Complete |
| `FinancialIntelPanel` — receivables, overdue aging, top customers | Complete |
| `ExecutiveIntelligenceV2Panel` — KPI comparison, monthly trends, contract health, smart recommendations, forecast, alerts | Complete |
| `ContractProgressCard` | Complete |
| `ContractStatusChart` | Complete |
| `RevenueChart` | Complete |
| `LastAutoBackupCard` | Complete |
| `LatestInvoicesTable` / `LatestExpensesTable` | Complete |
| **Executive Decision Center components** | Complete — `CompanyHealthScore`, `ExecutiveAlertsV3`, `ExecutiveDecisionCards`, `ExecutiveRecommendationsPanel`, `KPITimeline` |

---

## Reports

| Report | Endpoint | Notes |
|--------|----------|-------|
| Financial Receivables Center | `GET /api/reports/receivables` | Aggregate receivables summary |
| Customer Statement | `GET /api/reports/customer-statement` | Per-customer invoice history |
| Receivables Aging | `GET /api/reports/aging` | 30/60/90/90+ day buckets |
| Customer Balances | `GET /api/reports/customer-balances` | Outstanding balance per customer |
| Collections Summary | `GET /api/reports/collections` | Payment collection analytics |
| Contract Financial Summary | `GET /api/contracts/:id/financial-summary` | Per-contract profitability |
| General Reports (Excel/PDF) | `GET /api/reports/*` | Attendance, payroll, invoices, expenses |
| **Executive Decision Center** | **`GET /api/executive/decision-center`** | **Financial summary, decision cards, alerts V3, health score, recommendations — all in one parallel batch** |
| **KPI Timeline** | **`GET /api/executive/kpi-timeline?period=`** | **1m/3m/6m/12m monthly breakdowns of revenue/expenses/collections/profit/outstanding** |
| **Customer Statement** | **`GET /api/statements/customers/:id`** | **AR statement: opening balance, debit/credit entries with running balance, date/type/search filters** |
| **Supplier Statement** | **`GET /api/statements/suppliers/:id`** | **AP statement: opening balance, invoices+expenses (credit), payments (debit), running balance, filters** |
| **Statement Excel Export** | **`GET /api/statements/customers/:id/export`** / **`GET /api/statements/suppliers/:id/export`** | **8-column Excel export of filtered statement entries** |
| **GL Report** | **`GET /api/financial/gl-report`** / **`GET /api/financial/gl-report/export`** | **Paginated GL ledger by account with debit/credit/running balance. M9 formatBalance (absolute + مدين/دائن). N+1 eliminated.** |
| **Trial Balance** | **`GET /api/financial/trial-balance`** / **`GET /api/financial/trial-balance/export`** | **Account-level debit/credit aggregates for date range. Grand total row.** |
| **Aging Report** | **`GET /api/financial/aging-report`** / **`GET /api/financial/aging-report/export`** | **AR/AP aging buckets: 0–30/31–60/61–90/90+ days from unpaid/partial invoices.** |
| **Journal Book** | **`GET /api/financial/journal-book`** / **`GET /api/financial/journal-book/export`** | **Paginated journal entries with line-level debit/credit expansion.** |
| **Financial Summary** | **`GET /api/financial/summary`** / **`GET /api/financial/summary/export`** | **Operational financial summary: totalRevenue, totalExpenses, netIncome, totalCollected, totalPaid. Delegates to `accountingService.financialSummary()`. M10 disclaimer included.** |
| **Financial Dashboard Summary** | **`GET /api/financial/dashboard-summary`** | **45s TTL cached dashboard aggregates: AR/AP outstanding, top-5 customers/suppliers, 30-day collections/payments, 90-day critical aging. `X-Cache-Age` response header.** |

---

## Testing Summary

| Layer | Files | Tests | Status |
|-------|-------|-------|--------|
| Backend (Vitest) | 50 | 919 | All passing |
| Frontend (Vitest) | 28 | 588 | All passing |

### Frontend test files (`frontend/src/__tests__/`)

```
invoiceDescription.test.ts
invoicePayload.test.ts
kuwaitLocations.test.ts
recentLocations.test.ts
pdfFilename.test.ts              # Phase 3 — 10 tests
printTemplates/
  brandingLayout.test.ts         # Phase 4 — 16 tests: parseBrandingLayout, clamp, serialize/roundtrip, getForDoc, applyStyle
  designerUtils.test.ts          # Phase 5A — 25 tests: snapToGrid, formatUnit, keyboardMove, historyPush/Undo/Redo
  textStyleOverrides.test.ts     # Phase 5B — 46 tests: parse/serialize, token maps, CSS injection prevention, area independence
  designerUniversal.test.ts     # Phase 5C/5D.2 — 14 tests: isBrandingElement, isTextElement, DESIGNER_CAPABILITIES (all true), getDesignerElementFromTarget
  layoutOverride.test.ts         # Phase 5D.2 — 11 tests: clamp, buildLayoutStyleSheet, layoutElementToCSS, parseAllLayouts, patchDocumentLayout
  smartGuides.test.ts            # Phase 5D.2 — 5 tests: computeSmartGuides edge/center alignment, no-snap default
  useLayoutDesigner.test.ts      # Phase 5D.2 — 20 tests: pure utility coverage of hook logic (activate/deactivate, selection, updateElement, drag/resize/rotate deltas, align, lock/hide, copy/paste/duplicate, undo/redo, export/import)
  staticTextDesigner.test.ts     # Phase 5D.1 — 18 tests
  templateStudio.test.ts         # Phase 6.0 + 6.1A + 6.1B + 6.1C — 99 tests (53 groups): sanitizeTemplateName, generateElementId, resolveDynamicField, isAllowedField, parseTemplateStudioSettings, validateElement (all types + security), validateTemplate, importTemplate, exportTemplate, isDataUrlWithinLimit, cloneTemplate, createBlankTemplate, getActiveTemplate, injection rejection, getDefaultInvoiceColumns, getDefaultQuotationColumns, resolveInvoiceLineItems, resolveQuotationLineItems, normalizeColumnWidths, validateElement lineItemsTable (7 cases), lineItemsTable roundtrip, ALLOWED_ELEMENT_TYPES includes lineItemsTable; Phase 6.1B: resolveInvoiceDocumentTotals (groups 33–34), resolveQuotationDocumentTotals fallback, missing data → 0.000, NaN/Infinity blocked, autoHideZeroColumns validation, rowStriping validation, totals.labelAlign/valueAlign validation, Phase 6.1A backward compat, required columns guard, all-zero column, complete 6.1B totals, KWD round-trip, quotation explicit subtotal preference; Phase 6.1C (groups 46–53): quotation enriched data map, subtotal fallback (missing + empty string), discount fallback, tax fallback, grandTotal fallback, no-blank-totals cells, backward compat (total-only shape), invoice unaffected
  studio/docxImport/__tests__/
    docxParser.test.ts           # Phase 7A — 31 tests (jsdom env): empty doc, paragraph→TextElement, empty-para filtering, h1/h2→xlarge+bold, h3→large+medium, bold/italic/underline (once-only warnings), alignment (center/right→start/left→end/justify→start/default→start), flow layout (strictly increasing y, first y≥pageMarginMm), font size (7pt→small, 20pt→xlarge, default→normal), tryDynamicField (valid, mixed content, unknown field, cross-type), DynamicFieldElement detection, mixed content stays TextElement, standalone unknown→warning, HR→LineElement (horizontal, خط فاصل, dark), Arabic table detection (الوصف/الكمية/الإجمالي → LineItemsTableElement), 200-elem cap+warning, page breaks skip+warning, BaseElement required fields (id/label/x/y/w>0/h>0/rotation=0)
  builders.test.ts               # builder branding passthrough (9 tests)
  companyBranding.test.ts        # createCompanyPrintData boolean fields (6 tests)
  formatKWD.test.ts
  invoiceAdapter.test.ts
  printOverrides.test.ts         # mergeEffectiveBranding + shouldShow* (15 tests)
  quotationAdapter.test.ts
  quotationHardening.test.ts
  quotationRegistry.test.ts
  registry.test.ts
  tafqeet.test.ts
  printI18n.test.ts               # Print Polish Batch 1 — 34 tests: 6 translation functions (translateInvoiceStatus/PaymentMethod/InvoiceDirection/RefType/DocumentState/formatArabicDate), known values, unknown fallback, date edge cases
  documentVerificationQR.test.tsx # Print Polish Batch 1 — 4 tests (jsdom): null uuid, undefined uuid, img renders with Arabic alt, SVG data URL format
```

### Backend test files (Payroll Bank Import Phase 1)

```
backend/src/modules/payrollBankImport/__tests__/payrollBankImport.test.ts  # 67 tests
  — BANK_CONFIGS: all 6 banks have nameAr/nameEn/sheets, correct column mappings for each
  — validators: 9 rules (amount>0, month 1–12, year 2000–2200, currency allowlist,
      date format, duplicate detection, TERMINATED blocked, type guards, beneficiary present)
  — matcher: CODE_100 (exact code match), CIVIL_ID_100 (civil ID exact),
      BANK_ACCOUNT_90 (IBAN suffix + bank account), MANUAL (name fallback), no-match case
  — previewBuilder: canExecute=true when 0 invalid + 0 unmatched; canExecute=false with any invalid;
      canExecute=false with unmatched; TERMINATED employee adds extra error;
      duplicate rows counted correctly; payload tx count deduplicates
  — formula injection guard: isSafeValue rejects = + - @ \t \r prefixes
```

### Backend test files (Print Polish Batch 1)

```
backend/src/modules/verification/__tests__/verification.service.test.ts  # 11 tests
  — found: false for unknown UUID
  — found: true with all required fields
  — documentType always 'invoice'
  — documentNumber matches invoiceNumber
  — statusAr maps PAID → مسددة
  — statusAr maps UNPAID → غير مسددة
  — statusAr maps CANCELLED → ملغاة
  — isCancelled true when CANCELLED, false when PAID
  — isApproved false when DRAFT
  — response does not include total/paidAmount/customerId/supplierId/customerName/supplierName
```

### Backend test files (Unified Report Engine Phase 3)

```
backend/src/shared/services/reportEngine/__tests__/reportEngine.test.ts   # 73 tests
  — buildReportHtml: backward compat (no options), with options (profile/branding/watermark/notes/signatureArea/pageNumbers), all profiles, full HTML structure
  — buildStyles: default profile, A4 portrait, landscape, page counter CSS
  — buildBrandingHeader: logo placeholder, company name AR/EN, contact line, commercialReg
  — buildReportHeader: title, subtitle, dateRange, generatedBy/At
  — buildTable: thead/tfoot/tbody, totals row, empty state, zebra classes
  — buildWatermark: all 7 types mapped to Arabic labels, no watermark returns ''
  — buildSummaryCards: card rendering, color variants
  — esc: escapes & < > ", safe passthrough for plain text
  — fmtCell: null→'', number→locale, string→esc passthrough
  — Migration compatibility: 5 tests confirming all pre-Phase-3 callers work unchanged
```

### Backend test files (Arabic PDF Chromium Fix)

```
backend/src/shared/services/reportEngine/html.service.test.ts   # 10 tests
  — non-empty output, Arabic title, subtitle, RTL direction, all column headers, row data, totals row, A4 landscape CSS, @font-face Cairo, XSS escaping
```

### Backend test files (Executive Decision Center Phase 1)

```
backend/src/modules/executive/__tests__/executive.service.test.ts   # 30 tests
  — decisionCenter(): financials, health score, alerts, decision cards, recommendations
  — kpiTimeline(): point count, field presence, profit formula, non-negative outstanding
```

### TypeScript validation (Payroll Bank Import Phase 1 — clean run)

```
cd backend && npx prisma validate          ✅ valid
cd backend && npx tsc --noEmit             ✅ 0 errors
cd frontend && npx tsc --noEmit            ✅ 0 errors
npx tsc -p electron/tsconfig.json --noEmit ✅ 0 errors
cd backend && npm test                     ✅ 919/919 (50 files, +67 from payrollBankImport.test.ts)
cd frontend && npx vitest run              ✅ 588/588 (28 files, unchanged)
npm run build:front                        ✅ clean (pre-existing chunk size warning only)
npm run build:back                         ✅ clean
npm run electron:build                     ✅ clean
```

### TypeScript validation (Integrations Center Phase 1 — clean run)

```
cd backend && npx prisma validate          ✅ valid
cd backend && npx tsc --noEmit             ✅ 0 errors
cd frontend && npx tsc --noEmit            ✅ 0 errors
npx tsc -p electron/tsconfig.json --noEmit ✅ 0 errors
cd backend && npm test                     ✅ 852/852 (49 files, +21 from integrations.service.test.ts)
cd frontend && npx vitest run              ✅ 588/588 (28 files, unchanged)
npm run build:front                        ✅ clean (pre-existing chunk size warning only)
npm run build:back                         ✅ clean
npm run electron:build                     ✅ clean
```

### TypeScript validation (Print Designer Phase 7A — DOCX Import — clean run)

```
cd backend && npx prisma validate          ✅ valid
cd backend && npx tsc --noEmit             ✅ 0 errors
cd frontend && npx tsc --noEmit            ✅ 0 errors
npx tsc -p electron/tsconfig.json --noEmit ✅ 0 errors
cd backend && npm test                     ✅ 830/830 (48 files, unchanged)
cd frontend && npx vitest run              ✅ 588/588 (28 files, +31 from docxParser.test.ts)
npm run build:front                        ✅ clean (pre-existing chunk size warning only)
npm run build:back                         ✅ clean
npm run electron:build                     ✅ clean
```

### TypeScript validation (Print Polish Batch 1 — clean run)

```
cd backend && npx prisma validate          ✅ valid
cd backend && npx tsc --noEmit             ✅ 0 errors
cd frontend && npx tsc --noEmit            ✅ 0 errors
npx tsc -p electron/tsconfig.json --noEmit ✅ 0 errors
cd backend && npm test                     ✅ 830/830 (48 files, +11 from verification.service.test.ts)
cd frontend && npx vitest run              ✅ 557/557 (27 files, +4 from documentVerificationQR.test.tsx + 34 from printI18n.test.ts)
npm run build:back                         ✅ clean
npm run build:front                        ✅ clean (pre-existing chunk size warning only)
npm run electron:build                     ✅ clean
```

### TypeScript validation (Unified Report Engine Phase 3 — clean run)

```
cd backend && npx prisma validate          ✅ valid
cd backend && npx tsc --noEmit             ✅ 0 errors
cd frontend && npx tsc --noEmit            ✅ 0 errors
npx tsc -p electron/tsconfig.json --noEmit ✅ 0 errors
cd backend && npm test                     ✅ 801/801 (47 files, +73 from reportEngine.test.ts)
cd frontend && npx vitest run              ✅ 516/516 (25 files)
npm run build:back                         ✅ clean
npm run build:front                        ✅ clean (pre-existing chunk size warning only)
npm run electron:build                     ✅ clean
```

---

## Architecture

```
manarERP/
├── electron/          # Main process: IPC, backend launcher, auto-backup scheduler
├── frontend/          # React 18 + Vite 5 renderer (HashRouter, file:// compatible)
├── backend/           # Express REST API, localhost:48211
└── backend/prisma/    # SQLite schema + migrations
```

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 31 |
| Frontend | React 18.3, TypeScript 5.5, Vite 5.3 |
| Routing | React Router 6 (HashRouter — mandatory for file://) |
| State | Zustand 4.5 |
| HTTP client | Axios 1.7 (JWT interceptor) |
| Charts | Recharts 3.8 + Chart.js 4.4 |
| Backend | Express 4.19, TypeScript 5.5 |
| ORM | Prisma 5.18 |
| Database | SQLite (local file, offline-first) |
| Auth | JWT 12h + bcrypt |
| Validation | Zod 3.23 |
| Security | Helmet 7.1 |
| Export | ExcelJS 4.4 + PDFKit 0.15 |
| Scheduling | node-cron (Electron main process) |
| Testing | Vitest 2.0 |
| Build | electron-builder 24 (NSIS, Windows) |

**Data flow:** Electron forks backend → React calls `http://127.0.0.1:48211/api` → Prisma → SQLite

**IPC bridge:** `electron/preload.ts` exposes `window.manar.*` via contextBridge

---

## Security

| Concern | Implementation |
|---------|---------------|
| Authentication | JWT (12h), `authenticate` middleware on all protected routes |
| Authorization | `requirePermission('<module>.<action>')` guard; `SYSTEM_ADMIN` bypasses |
| Password storage | bcrypt via `password.ts` utility |
| Transport | localhost-only (`127.0.0.1`); Helmet security headers |
| Electron | Context isolation enabled; contextBridge only; no `nodeIntegration` |
| Audit logging | `AuditLog` table — all mutating operations logged |
| Sensitive data | No plain passwords or tokens in DB or logs |
| Settings images | Base64 in Settings table; 1 MB upload limit; 300 KB output limit |
| **Text style tokens** | **Finite token sets validated via `Set.has()` — arbitrary CSS strings never reach the DOM** |
| **DesignerElement kind validation** | **`getDesignerElementFromTarget` checks `data-designer-type` against `VALID_KINDS` Set — invalid/injected kind values return `null` and never reach designer logic** |
| **Studio element type allowlist** | **`ALLOWED_ELEMENT_TYPES` ReadonlySet (now 9 types incl. `lineItemsTable`) — `importTemplate` rejects any element whose `type` is not in the set; unknown types cannot reach the renderer** |
| **Studio dynamic field allowlist** | **`INVOICE_ALLOWED_FIELDS` / `QUOTATION_ALLOWED_FIELDS` as const arrays — `resolveDynamicField` returns `''` for any field not in the list; prototype pollution paths (`__proto__`, `constructor`) are rejected at field lookup** |
| **Studio image security** | **`element.src` enforced to `data:image/` prefix — external URLs never accepted; `isDataUrlWithinLimit` rejects images >1 MB via base64 byte estimation** |
| **Studio template name sanitization** | **`sanitizeTemplateName` strips `<>"';&` before storage; max 60 chars; empty input falls back to `'قالب جديد'`** |
| **Studio renderer XSS safety** | **`TemplateStudioRenderer` renders text content as JSX text nodes only — no `dangerouslySetInnerHTML`, no `eval`, no script injection path** |
| **Studio style token enforcement** | **All style values in renderer go through `FONT_SIZE_MAP`, `FONT_WEIGHT_MAP`, `TEXT_COLOR_MAP`, `COLOR_TOKEN_MAP` lookup tables — arbitrary CSS strings cannot reach the DOM** |
| **Approval history IDOR hardening** | **`GET /api/approval-history/:entityType/:entityId` — `approvalEngine.hasModule(entityType)` rejects unknown entity types with HTTP 400 before any DB query; optional `historyPermission` field on `ApprovalModuleConfig` enforces per-module permission (or SYSTEM_ADMIN bypass) with HTTP 403; Phase A: zero modules registered → all calls return 400, no data exposed** |
| **DOCX import sandboxing** | **Phase 7A: mammoth parses DOCX entirely in the renderer process (no backend, no IPC, no file-system write); 10 MB input cap (`DOCX_MAX_FILE_BYTES`) enforced before `file.arrayBuffer()`; 200-element hard cap post-parse; 5 MB template-JSON hard block, 2 MB soft warning; dynamic field text validated via `isAllowedField` allowlist before emitting `DynamicFieldElement` — arbitrary `{{…}}` patterns that don't match are kept as `TextElement` (no silent execution); DOMParser used to parse mammoth HTML output, not `dangerouslySetInnerHTML`; all produced element styles go through the existing Studio token lookup tables** |
| **Payroll Bank Import — formula injection guard** | **`isSafeValue(v)` rejects any cell value whose string form starts with `=`, `+`, `-`, `@`, `\t`, or `\r` before writing to Excel via ExcelJS — closes CSV/formula injection risk on the report export path** |
| **Payroll Bank Import — report export schema** | **`ReportExportSchema.report` is a strict `ImportReportSchema` (bounded string lengths, numeric ranges 1–12/2000–2100, enum constraints) — `z.any()` removed; both `reportExcelHandler` and `reportPdfHandler` call `ReportExportSchema.safeParse(req.body)` before use** |
| **Payroll Bank Import — PDF report serving** | **`reportPdfHandler` sends `Content-Disposition: attachment; filename="payroll-import-report.html"` (prevents inline browser rendering) + `Content-Security-Policy: sandbox; default-src 'none'` (iframe/script execution blocked even if browser ignores attachment)** |

---

## Seed Data State

After 2026-06-13 full operational reset:

| Table | Rows | Content |
|-------|------|---------|
| users | 2 | `admin` / `Admin@123` + secondary |
| roles | 7 | SYSTEM_ADMIN, GENERAL_MANAGER, ACCOUNTANT, PROJECT_MANAGER, EQUIPMENT_MANAGER, HR_MANAGER, STANDARD_USER |
| permissions | ~100 | All `module.action` keys |
| settings | ~11 | Company info, backup config, tax rate |

> **Default credentials:** `admin` / `Admin@123` — change on first login.

---

## Feature Status Snapshot

> Synced with `PROJECT_MASTER_STATUS.md` (official source of truth). Everything below is **implemented and on `production`** unless explicitly marked "remaining".

### ExplorerKit — rollout effectively complete
Unified `.xpl-`-namespaced design system (`frontend/src/components/explorer/ExplorerKit.tsx`). **Migrated:** Accounting, Attendance, Cheques, DataImport, DocumentExpirationCenter, Expenses, Forms, Inventory, Invoices, Maintenance, Prices, Reports, Salaries, Settings, Users **+ ResourcePage** (customers, suppliers, contracts, equipment, employees). Phases **1 → 3E + Settings Center refresh are done**. **Remaining:** none required — the unmigrated pages (dashboards, print/form pages, and the bank explorers with their own bespoke design) are intentional. Optional future consistency candidates only: Statements, AuditLog, BankAccounts.

### Banking — Production (Completed)
**Bank Statement Import** · **Bank Statement Explorer** (Reconciliation workspace `BankReconciliation.tsx`) · **Bank Reconciliation** (manual-confirm; **non-auto-posting** by policy) · **Unified Timeline** (ADR-001) · **Bank Account Explorer** (phases B–E) · **Incremental Import v2** (SHA-256 fingerprint dedup) · **Validation Polish** (9 rules + headerless/preamble parse fixes) · **Payroll Bank Import** · **Payroll Bank Analytics**. Backend modules: `bankStatementImport` (21 files), `bankAccounts` (7), `payrollBankImport` (11). **Remaining (future):** GL auto-posting from the reconciliation workspace (explicit user confirmation only).

### Printing — Production (Completed)
**Print Engine** (dual pipeline: PDFKit + Chromium HTML→PDF for Arabic) · **Template Studio / Print Designer** (Phase 6/6.1A/7A, 9 element types) · **Registry** (30 templates: 10 invoice + 10 quotation + 4 PO + 6 RFQ) · **12 Official Forms** · **Cheque Printing** · **Cheque Calibration** (per-bank) · **Signature Designer** · **Stamp Designer** · **DOCX Import** (7A) · **PDF Export** (Electron `pdf:exportHtml`) · **Report Printing** · **Payroll Payslip** · **6 Print Profiles**. **Remaining (future):** Print Designer 7B (PDF import), 7C (Image/OCR import).

### AI — Deterministic / Offline (Completed for current scope)
The AI layer is **fully deterministic, offline, and rule-based — there is NO LLM anywhere** (repo-wide search for `openai`/`anthropic`/`gpt`/`gemini`/`langchain` returns 0 hits). **Implemented:** **AI Assistant** (`frontend/src/ai/`, keyword router), **Skills Engine** (6 skills), **Quality Engine** (`qualityEngine.ts`), **Executive Intelligence** (deterministic analytics + company health score), **Integrations Center** (3 real integrations + 3 planned registry stubs). **Remaining (future/optional):** Document AI, OCR, optional LLM integration (Ollama local / user-supplied cloud key — deterministic stays the built-in fallback), Executive AI narrative, advanced analytics. All AI phases remain read-only until a separately-approved write phase.

---

## Future Roadmap

### Employee Compensation → Payroll / Accounting Integration Pack — deferred, not part of Employee Compensation v1

Employee Compensation v1 shipped **deliberately isolated**: it writes only to its own six tables and
posts nothing to payroll, the general ledger, expenses, or end-of-service. That isolation is enforced
by a source-scanning test, not by convention.

Wiring it into the financial cycle is a **separate future pack** and is explicitly out of scope for
v1. When it is requested, the reuse surface is `backend/src/modules/employee-compensation/engine/` —
pure, deterministic, free of Prisma/Express/React, and unaware of its caller. Nothing in the current
release should be treated as a partial or in-progress integration.

### Pre-existing roadmap items


> Reconciled against the **code** on 2026-07-12 by the *Master Release Audit* and the *Core Runtime
> Completion* pack — not against older documentation. Items that the audit proved already shipped were
> deleted from this list; items removed from the roadmap by decision were deleted too (they are recorded
> under *Removed from the roadmap* below so nobody re-adds them). Only genuinely unbuilt, still-wanted
> work remains.

> **Deployment model drives priority.** manarERP is a **small local Electron application, used by the owner
> on his own machine** — not an internet-facing, cloud, or broad multi-user deployment. Work that would be
> mandatory for a hosted multi-tenant system is **not** automatically a priority here, and several such items
> have already been reviewed and deliberately declined (see *Reviewed & declined* below). Do not re-add them
> from a generic best-practice checklist.

### High Priority
- **Print Designer Phase 7B — PDF Template Import** (deferred from 7A; needs a pdf.js parsing strategy first).
- **Bank Explorer — period opening/closing balance** (fully designed in `docs/BANK_EXPLORER_HISTORICAL_READINESS.md`).

### Medium Priority
- **Data Import Phase 4 — grouped-row engine** (PurchaseOrders / GoodsReceipts / MaterialIssues). The seven
  Prisma models already exist — this is import validators, not domain design.
- **GL auto-posting from the bank reconciliation workspace** — the workspace produces *suggestions* only
  today. NOTE: this conflicts with the standing "never auto-post" policy — **settle the policy before
  scheduling the work.**
- **Per-document-type signer selection** — storage + positioning exist; mapping a doc type to a stored
  signature at print time does not. (Image overlays, not cryptographic signatures.)
- Audit Log Viewer UI enhancements (export, advanced filters).
- Advanced print profiles (custom margins, additional watermarks).
- **English Tafqeet Foundation v1** — a shared, canonical English amount-in-words (Tafqeet) helper, used
  consistently across all English print templates (Salary Certificate, vouchers, contracts, etc.), instead of
  a template-specific one-off. Deferred from *Salary Certificate Print – Final Polish Addendum v1*
  (2026-07-18): only Arabic Tafqeet implementations (`tafqeetKWD`, `tafqeet`) exist anywhere in the codebase
  today; the Salary Certificate's English "Currency" row was intentionally left unchanged pending this.

### Low Priority
- Historical Import Batch Review & Posting (`ImportBatch` / `ImportBatchItem`) — designed, no models yet.
- Recurring invoices · VAT/tax report · end-of-service indemnity accrual — none exist in code.
- **AuditLog retention** — *maintenance consideration only, not a risk and not near-term work.* The table has
  no purge path. For a single-user local deployment this is harmless; revisit **only if database growth
  becomes measurable**.

### Reviewed & declined (do not re-add, do not "recommend as next")

These were examined and **decided against**. They are recorded here so an audit does not resurface them as
"gaps": the absence is a decision, not an oversight.

- **Float → Decimal monetary migration — Reviewed; current monetary representation retained by explicit
  project decision.** Reviewed by both Claude and ChatGPT. It is **not** an active technical-debt priority
  and must **not** be scheduled or recommended. Reopen only if **concrete, reproducible accounting
  inaccuracies** appear, or the owner explicitly asks to reconsider.
  **Now also settled on evidence (Monetary Precision Migration Audit, 2026-07-12):** on SQLite a `DECIMAL`
  column has NUMERIC affinity and stores fractions as `REAL` — `SUM(0.1 + 0.2)` in a `DECIMAL` column returns
  `0.30000000000000004`, identical to `REAL`. Since every aggregate (trial balance, aging, statements,
  dashboard) is computed inside SQLite, `Decimal` would change the client-side type and **nothing about the
  arithmetic**. The real data is clean: **0 values with more than 3 effective decimals, 0 unbalanced entries
  out of 113.** Integer-fils storage would be exact but is unjustified for a single-user local ERP with no
  observed drift. The correctness work was done instead in
  **Money Rounding Consolidation & Invariant Hardening v1** (one canonical rounding policy, a journal-balance
  invariant that no longer tolerates a full fils, and normalization at every persistence boundary).
  **`Float` + SQLite + KWD-3dp is the approved architecture.**
- **JWT invalidation / revocation** — not an active priority for a single-user local application. Reconsider
  only if the deployment model changes or the owner requests it.
- **Enterprise security hardening** (Electron CSP + `sandbox: true`, bcrypt cost increase, and similar) —
  same reasoning; **not** active roadmap work.
- **Local backup encryption** — *optional future consideration only*, contingent on the deployment or threat
  model changing. **Not** a committed priority and **not** a recommended next task.

### Removed from the roadmap (do not re-add)
- **Cloud backup / Google Drive connector** — explicitly removed. No code; the abandoned
  `feature/google-drive-backup-phase1` branch was never merged; its Integrations card has been **deleted**.
  Do not restore it anywhere.
- **Cryptographically signed PDF export.**
- **AI: local LLM · RAG · OCR / Document AI · free SQL layer** (former phases AI-3…AI-6). The assistant
  stays deterministic. Their cards, quick-actions and roadmap rows have been **removed from the UI**.
- **Mobile Companion app.**
- **A sixth generation of printing** — the print system is complete.

> **Print system: closed.** 74 releases, preview ON by default for all 15 supported documents, all three
> live-window PDF exports migrated to the document path, PDFKit retired from the report route. Do not open
> a new printing generation.

---

## Deferred Accounting Notes

*(Do not implement until explicitly requested)*

1. **Double-counting audit / Accounting Architecture Audit** — The legacy single-entry `Transaction` table and the double-entry `JournalEntry` (GL) remain **two parallel accounting systems**. The Financial Bug Fix Pack C1–C4 (`stable-critical-financial-bugs-c1-c4-v1`) closed the specific double-counts it surfaced (expense reversal now clears the legacy transaction; goods receipts post as `TRANSFER` not `EXPENSE`), but the underlying dual-bookkeeping is unchanged and Dashboard KPIs / report totals can still double-count where both tables are summed. A dedicated **Accounting Architecture Audit** to consolidate the two systems is deferred (not a hotfix — do not implement until explicitly requested).

2. **Expense reversal status** — `cancelApproval()` currently sets status back to `REJECTED`. A dedicated `REVERSED` status would be more precise.

3. **paymentMethod on GL credit** — Currently always credits CASH (1000). When `paymentMethod` field exists, route to BANK (1010) or ACCOUNTS_PAYABLE (2000) accordingly.

4. **Purchase Invoice GL** — ~~Deferred~~ **IMPLEMENTED in H1** — `postPurchaseInvoiceToGL` (Dr PURCHASES/Cr AP) + `postPurchasePaymentToGL` (Dr AP/Cr Cash/Bank) + `reversePurchasePaymentGL` + `PATCH /invoices/:id/approve` endpoint. The `PURCHASE_INVOICE_GL_POSTING_SKIPPED` log path is gone; posting happens automatically on payment or explicitly via approve.

---

## Validation Checklist (Before Every Commit)

```
[ ] cd backend && npx tsc --noEmit          → 0 errors
[ ] cd frontend && npx tsc --noEmit         → 0 errors
[ ] tsc -p electron/tsconfig.json --noEmit  → 0 errors
[ ] npm run build:back                      → clean compile
[ ] npm run build:front                     → clean build
[ ] cd backend && npx prisma validate       → schema valid
[ ] cd backend && npm test                  → all passing
[ ] cd frontend && npm test -- --run        → all passing
[ ] New permission keys added to constants.ts
[ ] New routes protected by authenticate + requirePermission
[ ] Mutating operations write to AuditLog
[ ] No plain passwords or tokens in DB or logs
[ ] DB migration SQL reviewed before apply (if schema changed)
```

---

## Release History

| Date | Tag | HEAD | Feature |
|------|-----|------|---------|
| 2026-07-19 | `stable-employee-entitlements-executive-redesign-v1` | `56f18d4` (merge) | **Employee Entitlements Executive Redesign v1.** Visual-only re-skin of the Employee Entitlements Center page to Dynamics 365/Fiori/Oracle Fusion quality, from an approved HTML mockup, built entirely on the existing ExplorerKit design system: executive header accent wash + refined meta strip, 8 KPI cards regrouped into 4 primary/4 secondary tiers, leave-settlement reconciliation flow with chained connector badges, advance-payment mini-flow with a highlighted total, journal-style historical ledger table, refined timeline/empty-state density, polished collapsible sections. Every CSS change scoped to the page or to classes exclusive to it — no shared/global ExplorerKit rule touched, so no other page changed appearance. 3 files (+202/−30). Feature `cf2f3be`, merge `56f18d4`. Validation: frontend tsc ✅, frontend build ✅ (negligible bundle impact). No Business Logic, API, Database, backend, calculation, or workflow change. Manual visual review: APPROVED. |
| 2026-07-19 | `stable-al-ojairi-integration-pack-v1` | `70fa096` (merge) | **Al-Ojairi Integration Pack v1.** Completes the Kuwait Hijri holiday generation pipeline left as an architecture-only stub by Kuwait Holiday Intelligence Pack v1: real, offline, deterministic Hijri↔Gregorian conversion (tabular Islamic/"Kuwaiti algorithm", no network dependency, no hardcoded or guessed future dates); `HijriHolidayService`/`HijriHolidayProvider` generate real candidates for all 5 required Kuwait Hijri holidays, always `EXPECTED_ALOJAIRI`, never auto-promoted to `OFFICIAL`; provider contract extended to `{candidates, warnings}` so unsupported years/provider failures fail safely instead of throwing; `HolidayEngine.generateCandidates()` is now the single system-wide consumer of holiday providers; `classifyHoliday()` parses an existing `[ORIGIN:STATUS]` notes tag so generated status survives read-back, with no schema change; `GenerateHolidaysDialog` gained a source/provider column + validation-warnings section. 22 files (+771/−95). Feature `43cd699`, merge `70fa096`. Validation: backend tsc ✅, frontend tsc ✅, backend vitest 132 files/1845 tests ✅, frontend build ✅. No change to Rule 2, Rule 5, EOS, Leave Settlement, Historical Ledger, Prisma schema, API contracts, or permissions. |
| 2026-07-04 | `stable-smart-import-assistant-phase2-v1` | `4116105` (merge) | **Smart Import Assistant — Phase 2 (2A + 2B).** Header intelligence + auto-mapping (frictionless when matched), import quality score, more cross-field warnings, in-file smart-duplicate detection, import analytics, and localStorage saved mapping profiles. All preview-only, non-blocking, additive; deterministic (no AI/cloud). **No Backend endpoint / Prisma / migration / schema / permission changes; Bank Statement Import untouched.** 12 files (+1003/−29). Feature `4b4a656`, merge `4116105`, checkpoint `pre-smart-import-assistant-phase2` @ `bc55adc`. Gates: prisma ✅, backend tsc ✅, frontend tsc ✅, backend vitest 1262/1262 ✅, frontend vitest 663/665 (+14 util tests), build:back ✅, build:front ✅. Security review: no findings. Known unrelated: 2 pre-existing printWorkspace tests. |
| 2026-07-04 | `stable-smart-import-validation-phase1-v1` | `f50b776` (merge) | **Smart Import Validation — Phase 1.** Additive, non-blocking advisory warnings in the generic Data Import preview (identical dates, expired/expiring docs, dueDate<issueDate, zero amounts, negative net salary, duplicate secondary keys, identical rows, defaulted enums, missing optionals). Warnings never change valid/invalid/duplicate status and never block import; execute path byte-identical. New isolated `import/warnings/*` subsystem + frontend summary card/filter chips/row badges/confirm-before-execute. **No Backend endpoint / Prisma / migration / permission changes; Bank Statement Import untouched.** 8 files (+697/−18). Feature `2fc8b69`, merge `f50b776`, checkpoint `pre-smart-import-validation-phase1` @ `b2a29d4`. Gates: prisma ✅, backend tsc ✅, frontend tsc ✅, backend vitest 1241/1241 ✅, build:back ✅, build:front ✅. Security review: no findings. Known unrelated: 2 pre-existing printWorkspace tests. |
| 2026-07-04 | `stable-executive-command-center-dashboard-v1` | `15d33a7` (merge) | **Executive Command Center Dashboard Redesign.** Frontend-only redesign of the General dashboard into a content-driven, registry-based Executive Command Center (health gauge · KPI row · combo chart + revenue donut · action center · quick actions · recent activity · smart recommendations), with all existing rich panels retained below and the old Hero/KPI/quick-actions duplication removed (refresh moved to the title bar). Real data only from existing endpoints — **no Backend / Prisma / APIs / financial-calculation / permission changes.** 17 files (3 modified + 14 new under `command/`), +2432/−175. Feature `bbfcf3f`, merge `15d33a7`. Quality gates: frontend tsc ✅, electron tsc ✅, command vitest 8/8 ✅, build:front ✅ — all green. **Gemini review APPROVED ✅.** Known: 2 `printWorkspace.test.tsx` failures pre-existing & out of scope. |
| 2026-07-04 | `stable-critical-financial-bugs-c1-c4-v1` | `7ae1239` (merge) | **Financial Bug Fix Pack C1–C4 — finally accepted.** Backend-only fix pack for four critical runtime financial bugs. **C1:** CASH/BANK purchase invoices settled at creation (`paidAmount=total`/`PAID`), second settling payment blocked → no double Cash credit / negative AP. **C2:** LATE attendance days counted as regular hours → no phantom 1.25× overtime. **C3:** advances subtract amounts committed in other open (DRAFT/APPROVED) payrolls → no double deduction across months. **C4:** expense reversal clears the legacy transaction (not just GL); goods receipts post as `TRANSFER` not `EXPENSE` → inventory not counted as expense twice. **No schema / frontend changes.** 11 files (6 source + 5 regression tests), +457/−9. Feature `5b61f4e`, merge `7ae1239`. Validation: prisma ✅, backend tsc ✅, frontend tsc ✅, electron tsc ✅, backend vitest 1225/1225 (67 files) ✅, build:back ✅, build:front ✅. **Claude post-merge verification APPROVED ✅. Gemini review APPROVED ✅. No hotfix required.** Future note: legacy `Transaction` + GL still parallel → Accounting Architecture Audit deferred (Deferred Accounting Notes #1). |
| 2026-07-01 | `stable-executive-dashboard-polish-phase1-v1` | `2bc337c` (merge) | **Executive Dashboard Polish Pack — Phase 1.** Frontend-only executive dashboard polish. New "Today's Summary" (ملخص اليوم) daily-briefing band derived from **existing dashboard state only — no new fetches**: unpaid/overdue invoices, contracts expiring soon, document-expiry alerts, pending operations, as color-coded chips (`ok`/`warn`/`crit`) with an "all clear" state; `role="status"` + `aria-label`; 8 new bilingual i18n keys (AR + EN); 73 lines `dashboard.css`; nav fix (draft-payroll alert → `/salaries`). **No backend / API / DB / permission / print / financial changes.** 3 files (`Dashboard.tsx`, `i18n.ts`, `dashboard.css`), +143/−1. Validation: prisma ✅, backend tsc ✅, frontend tsc ✅, electron tsc ✅, backend vitest 1190/1190 ✅, frontend vitest 610/610 ✅, build:back ✅, build:front ✅, electron:build ✅. Gemini APPROVED ✅. |
| 2026-07-01 | `stable-settings-center-refresh-v1` | `2543101` | **Settings Center — ExplorerKit refresh.** Company Settings modernized to the `.xpl-` ExplorerKit design system (executive header, KPI cards, sections). Frontend-only. |
| 2026-06-30 | `stable-unified-explorer-ui-phase3e-v1` | `c41abdd` | **Unified Explorer UI — Phase 3E (Invoices).** Invoices module migrated to ExplorerKit. |
| 2026-06-30 | `stable-unified-explorer-ui-phase3a…3d-v1` | `5514ebb…ece7b55` | **Unified Explorer UI — Phases 3A–3D.** Contracts/Users/Forms (3A) · Salaries/Prices/Attendance (3B) · Inventory/Maintenance (3C) · Cheques (3D). |
| 2026-06-30 | `stable-unified-explorer-ui-bundle-phase1-v1`, `…phase2-v1` | `d312d5c`, `55d667a` | **Unified Explorer UI — Phases 1 & 2.** Reports/Expiry/DataImport (1) + 6 core operational modules (2). |
| 2026-06-30 | `stable-bank-account-explorer-phase-b…e-v1` (+ `…polish-phase1`) | `541b2d5…2c60b5e` | **Bank Account Explorer — Phases B–E + polish.** Per-account timeline dashboard with charts. |
| 2026-06-29 | `stable-bank-unified-timeline-architecture-v1` | `2f21b11` | **Unified Bank Account Timeline** (ADR-001) — account-centric timeline across imports. |
| 2026-06-29 | `stable-bank-statement-incremental-import-v2` | `da9ba25` | **Incremental Import v2** — SHA-256 transaction-fingerprint dedup across import batches. |
| 2026-06-29 | `stable-bank-statement-import-phase-a-v1` | `96efefc` | **Bank Statement Import — Phase A** engine refinement. |
| 2026-06-28→29 | `stable-ai-assistant-phase-ai-1.5-v1` → `…-phase-ai-2-v1` → `…-phase-ai-2.1-v1` → `…-business-skills-v1` | `67a087f`→`f7f7823` | **AI Assistant — deterministic/offline** (AI-1.5 → AI-2 → AI-2.1 → business-skills / "AI-2.5"). Rule-based skills engine + quality engine; **no LLM**. *(These tags cover the granular AI-\* commit rows listed below.)* |
| 2026-06-28 | `stable-bank-statement-explorer-phase5c-v1` | `f6d1e2a` | **Bank Statement Explorer / Reconciliation workspace** (`BankReconciliation.tsx`). |
| 2026-06-28 | `stable-bank-import-validation-polish-v1` (+ `…headerless-fix`, `…preamble-fix`) | `f689ae7` | **Validation Polish** — 9 validation rules; headerless + preamble parse fixes. |
| 2026-06-28 | `stable-payroll-analytics-explorer-phase6-v1` | `0ac9e75` | **Payroll Bank Analytics explorer** (Phase 6). |
| 2026-06-28 | `stable-reports-center-phase7-v1`, `stable-integrations-center-phase2-v1` | `4c7669c`, `fb26600` | **Reports Center Phase 7** + **Integrations Center Phase 2** (UI modernization). |
| 2026-06-25 | `stable-payroll-bank-import-phase1-v1`, `stable-bank-statement-import-phase1-v1` | `bb56a83`, `e2abc8f` | **Payroll Bank Import** + **Bank Statement Import** — Phase 1 (canonical). |
| 2026-06-29 | *(pending tag)* | `55c7b7d` | **AI Assistant Phase AI-2.5 — Professional Business Skills Expansion.** Frontend-only enrichment layer. No backend changes, no new APIs, no DB migrations, no permission changes, no SQL, no LLM, no RAG, no OCR. New `qualityEngine.ts` (shared `computeQuality()` pure function). Extended `types.ts` with 9 optional `SkillResult` fields + blocked router decision. Router: `BLOCKED_PATTERNS` intercept reconciliation/matching terms with informational message; ~35 rules total. ResultCard rewrite (16 sections, 7 sub-components, CSS custom properties for progress fills). Six enriched skills — bankStatement (removed reconciliation terminology, 2 new intents), payroll (department+status intents), dashboard (equipment+customers intents), expenses (supplier intent), contracts (customer intent), reports (Discovery Skill with live+fallback). localStorage compact serialization strips 9 large arrays. Blocked prompt: informational blue card. Roadmap updated to AI-2.5 current. 13 files changed, 2188 insertions(+), 169 deletions(−). frontend tsc ✅ backend tsc ✅ electron tsc ✅ 1120/1120 tests ✅ builds ✅. Gemini APPROVED ✅. |
| 2026-06-29 | *(pending tag)* | `6284fde` | **AI-2 Hotfix — Bank Statement Skill pageSize.** `frontend/src/ai/skills/bankStatement.ts`: workspace request changed from `pageSize: 200` → `pageSize: 100`. Root cause: `WorkspaceQuerySchema` enforces `.max(100)` on pageSize; requesting 200 caused HTTP 400 ("Number must be less than or equal to 100") for all bank statement intents (summary, withdrawals, deposits, fees, warnings). Backend validation unchanged. Frontend-only fix, 1 file, 1 line. frontend tsc ✅ backend tsc ✅ electron tsc ✅ 1120/1120 tests ✅ builds ✅. Commit `6284fde`. |
| 2026-06-29 | *(pending tag)* | `9b727c1` | AI Assistant Phase AI-2 — Safe Intelligence Engine. Frontend-only deterministic skill engine. No backend AI module, no new backend routes, no DB migrations, no permission changes, no LLM, no SQL, no RAG, no OCR. New `frontend/src/ai/` module (11 files): `types.ts` (SkillResult, RouterDecision, ValueKind, WarningSeverity), `router.ts` (deterministic keyword router — 27 rules, 6 skills, weight 3/2/1 scoring), `registry.ts` (memoized SkillExecutor Map, `executeSkill()` dispatcher), `ResultCard.tsx` + `ResultCard.css` (3-state renderer; `.ai-rc-*` scoped; DEV dev panel), 6 skill files (bankStatement, payroll, expenses, contracts, dashboard, reports — all read-only via existing Axios client). `sendMessage()` async via `route()` → `executeSkill()`; localStorage strips `highlights`/`cards` arrays for compact snapshots; `buildNoSkillResult()` for unmatched prompts; hero badge AI-2; roadmap updated. frontend tsc ✅ backend tsc ✅ electron tsc ✅ 1120/1120 tests ✅ builds ✅. Gemini APPROVED ✅. |
| 2026-06-28 | *(pending tag)* | `3338492` | AI Assistant Phase AI-1.5 — Smart Workspace Polish. localStorage-only layer on Phase AI-1. **Package A** Local conversation history: `localStorage` key `ai_assistant_history_v1`, schema `{ id, title, createdAt, updatedAt, messages: SerializedMsg[] }`, auto-save after every assistant reply, full CRUD (new/load/rename/delete/clear-all), safe JSON parse recovery. **Package B** Pinned prompts: `localStorage` key `ai_assistant_pinned_prompts_v1`, star toggle on every prompt chip, pinned panel, toast feedback. **Package C** Quick actions grid: 10 cards (5-col), 5 auto-send prompts, 3 internal `useNavigate` routes, 2 قريباً stubs — zero backend calls. **Package D** Copy/Export: copy text + copy Markdown per message, export conversation as `.txt` with UTF-8 BOM (Arabic Excel-safe), all via client-side Blob/Clipboard. **Package E** Recent activity row: 4 KPI cards (messages, last skill, last question, saved conversations), derived via `useMemo`. **Package F** What's New panel: المتاح الآن (8 items) + قريباً (6 items). **Package G** Better empty state: icon + description + 3 prompt chips + safety badge. **Package H** Micro-interactions: 380ms thinking-dots animation, toast slide-in (2.2s), hover lift on cards, `hourglass_top` icon while sending. **Package I** Safety: amber warning banner + lock footer. **Package J** UI consistency: `.ai-*` scoped CSS, RTL, dark-mode, responsive breakpoints. **Package K** No backend: zero `api.*`/`fetch`/`axios`/IPC calls. 2 files rewritten: `AIAssistant.tsx` (~560 lines), `AIAssistant.css` (~740 lines). frontend tsc ✅ backend tsc ✅ electron tsc ✅ 1120/1120 tests ✅ builds ✅. Gemini APPROVED ✅. |
| 2026-06-28 | *(pending tag)* | `9be4b26` | AI Assistant Phase AI-1 — UI Shell & Workspace Foundation. New sidebar group (الذكاء الاصطناعي, icon `psychology`), route `/ai-assistant`, 7-section page with hero, capability cards, suggested prompts, chat workspace (deterministic placeholders only), Safety Center, Architecture/Roadmap/Source panels, 8 skill cards. New `AIAssistant.css` (`.ai-*` scoped, 350 lines). Architecture doc `AI_ASSISTANT_ARCHITECTURE.md`. No LLM, no SQL, no RAG, no backend AI module, no migration. 6 files changed, 2257 insertions. frontend tsc ✅ backend tsc ✅ electron tsc ✅ 1120/1120 tests ✅ builds ✅. Gemini APPROVED ✅. |
| 2026-06-28 | *(pending tag)* | `f669b74` | Bank Statement Explorer Phase 5C — 8-package enhancement (Packages X–AE). **X** Authenticated blob export (PDF/Excel) via Axios `responseType:'blob'` — fixes JWT bypass on `<a href>` links. Client-side CSV export with UTF-8 BOM. Export dropdown (PDF / Excel / CSV / Print). **Y** Professional import cards: bank icon, smart-truncated filename, date-range chip, duration chip, color-coded stats. **Z** 5 new KPI cards: أعلى سحب, أعلى إيداع, متوسط, أول/آخر عملية, مدة الكشف. **AA** Row color tinting by transaction type (BANK_TRANSFER=green, CHEQUE_PAYMENT=blue, CASH_WITHDRAWAL=amber, bank fee=purple). **AB** Clickable warning tags → `warningCode` client filter. **AC** Multi-select ImportSelector (per-card checkboxes, select-all indeterminate, aggregate stats bar). **AD** Delete single/bulk — backend `DELETE /:importId` + `POST /bulk-delete`, `bankStatementImport.delete` permission, `ConfirmModal`, cascade-safe, AuditLog. **AE** Skeleton loading cards, hover-reveal delete, full-click cards. 8 files changed, +3116/-403. No schema changes. No migrations. backend tsc ✅ frontend tsc ✅ 1120/1120 tests ✅ builds ✅. Gemini APPROVED ✅. |
| 2026-06-27 | `stable-dashboard-financial-fix-v1` | `b27e489` (merge) | Dashboard Financial Fix + Manus Audit — Bug-fix release. **Root cause:** `$queryRaw` in `dashboard-summary.service.ts` used Prisma model names (`Invoice`, `Customer`, `Supplier`) instead of SQLite `@@map` names (`invoices`, `customers`, `suppliers`) → `P2010` → HTTP 400 on Dashboard مالي tab. **Fix:** 4 table-name corrections in `dashboard-summary.service.ts`. **Regression tests:** 7 tests added (`financial.dashboard.test.ts`): valid `DashboardSummary` shape, ISO `generatedAt`, `topCustomers`/`topSuppliers` row mapping, `$queryRaw` call count, SQL regex guards blocking singular model names. **Manus Audit (Part B):** `contractId` (createInvoiceSchema line 26 + invoices.service.ts line 245) and `priceId` (itemSchema line 14 + computeTotals spread) confirmed present in schema, service, and Zod schemas — no code changes required. 2 files changed, 107 insertions (+4 deletions in service fix). Backend 1050/1050 (56 files, +7 tests in 1 new test file). TypeScript 0 errors (backend + frontend + electron). Builds clean. Gemini APPROVED ✅. |
| 2026-06-26 | `stable-final-polish-suite-phase2-v1` | `a5eaab9` (merge) | Final Professional Polish Suite Phase 2 — 9-package UX, print, navigation, and quality audit release. **A** Privacy Mode (`PrivateAmount.tsx` + `usePrivacy()` Zustand store + topbar toggle + CSS `privacy.css` blur classes; print-safe masking, not export). **B** Inline Text Editing in Template Studio (`TemplateStudioEditor.tsx`). **C** English Administrative Forms Completion (`useT()`/`t()` across `Forms.tsx` + `EmployeeWarning.tsx`; `page.forms.*`/`page.warning.*`/`msg.error` i18n keys). **D** Print Engine Final Polish (`usePrintProfileMemory` localStorage hook; copies control `[− N نسخة +]`; `@page` CSS via profile margins; maxWidth 793px; 10 form pages updated). **E** QR Verification public route — `authenticate` middleware removed from `/api/verify/:uuid`; `DocumentVerify.tsx` calls backend without JWT. **F** Statement Navigation Cleanup (duplicate sidebar removed; `/statements` redirects to `/financial?tab=statement`; `nav.financial` i18n key). **G** DataTable Final Polish (`truncate`/`multiline`/`width` column props; `expandRow`/`onRowClick` props; `SkeletonRows` shimmer animation; expand toggle; empty states). **H** Validation & Error UX (Arabic network/HTTP error messages in `errorMessage()`; inline dismissible `InlineError` in `AttachmentsPanel.tsx`). **I** Contract Translation Dictionary (`BASE_NATIONALITY_EN` + `BASE_JOB_TITLE_EN`; `applyTranslationOverrides()`; Settings قاموس الترجمة tabbed editor saving to `dict.nationalities`/`dict.jobTitles` keys; `EmploymentContract.tsx` loads overrides on mount). **J** Technical Audit (`contracts.repository.ts` `financials()` CANCELLED expense exclusion fix — `status: { notIn: ['REJECTED', 'CANCELLED'] }`; 6 regression tests). Security: QR endpoint reviewed (no PII, UUID-based). 42 files changed, 1415 insertions, 836 deletions. Backend 1043/1043 (55 files, +6 tests). TypeScript 0 errors. Builds clean. Gemini APPROVED ✅. |
| 2026-06-26 | `stable-ops-management-suite-phase1-v1` | `9631a87` (merge) | Operations & Management Suite Phase 1 — Six-phase release (Print Polish, UI Polish, Document Expiration Center, Backup Verification, Attachments Center, Financial Operations Dashboard). New modules: `expirations` + `attachments`. New Electron IPC: `attachments:openPath` (hardened), `attachments:openFileDialog`. New pages: `DocumentExpirationCenter.tsx`, `FinancialOperationsDashboard.tsx`. New components: `AttachmentsPanel.tsx`, `ExpirationWidget.tsx`, `TruncatedText.tsx`. New utility: `useShortcut`. Prisma migrations: `add_equipment_insurance_expiry`, `add_backup_verification_fields`, `add_attachment`. New dep: `multer@^2.2.0`. 4 security fixes applied. 49 files changed, 2782 insertions. Backend 1037/1037 (54 files, +19 tests) + TypeScript/builds clean. Gemini APPROVED ✅. |
| 2026-06-25 | `stable-bank-statement-import-phase1-v1` | `e2abc8f` (merge) | Bank Statement Import & Smart Reconciliation Phase 1. New Prisma models `BankStatementImport` + `BankStatementTransaction` (cascade delete, migration applied). New backend module `bankStatementImport/` (16 files): 7-bank `STATEMENT_CONFIGS` registry (NBK/KFH/Gulf Bank/Boubyan/Warba/Ahli United/UNKNOWN); 9-rule row validator + 5-pattern duplicate detector; smart matcher (8 strategies, confidence 100/90/75/0, 7 data sources); `detectBankTemplate` + `parseDateString` (ISO/DD-MM-YYYY/Excel serial) + `parseCsvDelimiter`; `bankFeeDetector` (6 fee types, Arabic+English regex); `buildPreview()` single-pass orchestration; reconciliation engine with `ALLOWED_TRANSITIONS` guard (`UNMATCHED→MATCHED→IGNORED`, `UNMATCHED→DUPLICATE`, `MATCHED→REVIEW`); `generatePostingSuggestions` (4 types); `buildReconciliationReportExcel` (ExcelJS, 3 sheets) + `buildReconciliationReportHtml` (Unified Report Engine); atomic `execute()` via `prisma.$transaction` with chunk-500 `createMany`; `AuditLog` on all mutating operations; strict Zod schemas (10,000-row cap, bounded fields). 4 permissions: `bankStatementImport.read/create/export/reconcile` (SYSTEM_ADMIN+ACCOUNTANT; read also PROJECT_MANAGER). Frontend: `api/bankStatementImport.ts` typed client; `utils/bankStatementParser.ts` client-side parser (mirrors backend); `pages/BankStatementImport.tsx` 5-step wizard (Upload→Detect→Preview→Confirm→Done, 10MB cap, drag-and-drop, 500-row preview); `pages/BankReconciliation.tsx` workspace (ImportSelector, status cards, filter bar, bulk actions, transaction table, PostingSuggestionsPanel modal — never auto-posts). Integrations registry: `bank-statement-import` promoted to `available/stable`, `targetRoute: '/bank-statement-import'`. Security: file size cap, string bounds, formula rejection, `esc()` XSS guard, CSP sandbox on export, attachment-only serving, AuditLog. 29 files changed, 4760 insertions. **Tests: 1018/1018 backend (51 files, +100+ tests) + 588/588 frontend (28 files, unchanged). Gemini APPROVED WITH MINOR NOTES ✅.** |
| 2026-06-25 | `stable-payroll-bank-import-phase1-v1` | `bb56a83` (merge) | Payroll Bank Import Phase 1 — Enterprise Package. New backend module `payrollBankImport/` (11 files): `BANK_CONFIGS` registry (6 banks: Gulf Bank, Ahli United, KFH, Warba, Boubyan, NBK, priority-ordered detection), 4-level matching engine (`CODE_100`→`CIVIL_ID_100`→`BANK_ACCOUNT_90`→`MANUAL`), 9 validators, `buildPreview()` + atomic `execute()` via `prisma.$transaction` (reuses existing `SalaryPayment` table), ExcelJS summary+details report, HTML report via report engine. Permissions: `payrollBankImport.read/create/export` (SYSTEM_ADMIN + ACCOUNTANT). Frontend: `api/payrollBankImport.ts` typed client + `PayrollBankImport.tsx` 5-step wizard (Upload→Template detect→Preview→Confirm→Done; client-side XLSX parsing; 8 KPI cards; MatchBadge + StatusPill; explicit checkbox gate; PDF/Excel export buttons). Integrations Center wired: `handleRun` navigates to `targetRoute` — payroll-bank-import card opens `/payroll/bank-import`. Security: formula injection guard (`isSafeValue()`), strict `ImportReportSchema` (replaces `z.any()`), `safeParse()` on all export handlers, `Content-Disposition: attachment` + `Content-Security-Policy: sandbox; default-src 'none'` on PDF handler. 18 files changed (13 new backend + 2 new frontend + 3 modified), 2769 insertions. No Prisma schema changes. No migrations. No Electron IPC changes. 919/919 backend (50 files, +67 tests from `payrollBankImport.test.ts`) + 588/588 frontend (28 files, unchanged). Gemini APPROVED WITH MINOR NOTES ✅. Security fixes applied post-review. |
| 2026-06-25 | `stable-integrations-center-phase1-v1` | `eca1e91` (merge) | Integrations Center Phase 1 — Foundation. New backend module `integrations/` (7 files): static `INTEGRATION_REGISTRY` (6 entries), settings overlay via existing `Setting` table (key pattern `integrations.<id>.<field>`), 4 REST endpoints (`GET /api/integrations`, `GET /api/integrations/:id`, `PUT /api/integrations/:id/settings`, `POST /api/integrations/:id/run`). Run endpoint Phase 1 always returns `{ success: false, status: 'not_implemented', messageAr: 'هذا التكامل لم يتم تفعيله بعد' }` + AuditLog. 3 permissions: `integrations.read` (SYSTEM_ADMIN/GENERAL_MANAGER/ACCOUNTANT/PROJECT_MANAGER), `integrations.configure` (SYSTEM_ADMIN), `integrations.run` (SYSTEM_ADMIN/ACCOUNTANT). Frontend: `integrations.ts` API client + `Integrations.tsx` page (cards by category, status/maturity badges, health indicator, SettingsPanel modal, RunResultDialog, RBAC-gated buttons). Nav: `مركز التكاملات`, `hub` icon, `integrations.read` guard. No new Prisma models. No migrations. No Electron IPC. No external API connections. 15 files changed (9 new, 6 modified), 1281 insertions. 852/852 backend (49 files, +21 tests) + 588/588 frontend (28 files, unchanged). Gemini APPROVED ✅. |
| 2026-06-25 | `stable-print-designer-phase7a-docx-import-v1` | `f5dcfc5` (merge) | Print Designer Phase 7A — DOCX Template Import. Frontend-only module `docxImport/` (5 new files). New deps: `mammoth@1.9.0` + `jszip@3.10.1` (exact, no caret). 4-step import wizard (`DocxImportWizard.tsx`): file select/drop → document type → parse+preview → name+confirm. Flow-layout engine (`docxParser.ts`): DOMParser, heading/paragraph/HR/table/dynamic-field detection, Arabic normalization for table header keyword matching, RTL alignment flip, 200-element cap, 10 MB input cap. 31 new frontend tests (`docxParser.test.ts`, jsdom env). `TemplateStudioEditor.tsx`: "استيراد DOCX" button wired to wizard. Explicitly deferred: PDF Import, Image/OCR Import. 5 files created, 2 files modified. No backend changes. No Prisma schema changes. No migrations. No IPC changes. Backend 830/830 (48 files, unchanged). Frontend 588/588 (28 files, +31 new tests). Gemini APPROVED ✅. |
| 2026-06-25 | `stable-print-polish-batch1-v1` | `4c58c8d` (merge) | Print Polish Batch 1 — Part 1: `printI18n.ts` (6 Arabic translation functions, 34 tests). Fixed `'Total :'` → `'الإجمالي:'` in InvoiceDesign1/InvoiceDesign1Blank. Part 2: `ProfileConfig` exported + 5 new optional fields; 3 helper functions (`resolveTablePadding/Width/Justify`); CSS padding/logo rules in `buildStyles()`; `branding.template.ts` config-driven logo; `html.service.ts` wires profileConfig. Part 3: Prisma migration adds `verificationUuid` to invoices (nullable unique, backfilled); `arabicLabels.ts` (backend-only); `verification` module `GET /api/verify/:uuid` (never exposes PII/financial); `invoices.service` stamps UUID on create; `DocumentVerificationQR.tsx` (SVG QR); `InvoicePreview.tsx` wires QR in engine mode; jsdom + @testing-library/react added as dev deps. 27 files changed, 1330 insertions. Backend 830/830 (48 files, +11 tests). Frontend 557/557 (27 files, +4 tests incl. first .tsx test). Gemini APPROVED ✅. |
| 2026-06-25 | `stable-unified-report-engine-phase3-v1` | `a6029e3` (merge) | Unified Report Engine Phase 3 — Decomposes monolithic `html.service.ts` into 7 pure template modules (styles, branding, header, footer, table, watermark, summary). New type system: `PrintProfile` (6 profiles), `WatermarkType` (7 types), `ReportBranding`, `ReportOptions`. Branding engine reads 9 Settings keys via `loadReportBranding()`. CSS @page counters for pagination. Legacy Reports migration: `format=html` added to `reports.routes.ts` + PDF button in `Reports.tsx`. All 8 Financial Center exports now receive branding. Fully backward-compatible. 12 files created, 4 files modified. 73 new tests (reportEngine.test.ts). 801/801 backend (47 files) + 516/516 frontend (25 files). No schema changes. No migrations. No IPC changes. No new packages. Gemini APPROVED WITH MINOR NOTES ✅. Known notes: hex color validation deferred; company.logo Settings mapping deferred; PDFKit retained at format=pdf. |
| 2026-06-25 | `stable-arabic-pdf-chromium-fix-v1` | `90dccc8` (merge) | Arabic PDF Chromium Fix — Replaces PDFKit Arabic rendering (WinAnsiEncoding, no BiDi, no reshaper → garbled Latin) with Chromium HTML→PDF pipeline for all Financial Center PDF exports. New `pdf:exportHtml` IPC: backend generates self-contained HTML (Cairo base64 @font-face, RTL, A4 landscape) → Electron hidden BrowserWindow → printToPDF → selectable/searchable/RTL Arabic. 10 files modified, 4 files created. pdf.service.ts retained (legacy Reports Center). 728/728 backend (46 files) + 516/516 frontend (25 files). Gemini APPROVED WITH MINOR NOTES ✅. |
| 2026-06-24 | `stable-financial-center-phase2-v1` | `c65da20` (merge) | Financial Center Phase 2 — GL Report, Trial Balance, Aging Report, Journal Book, Financial Reports (FinancialReportsTab), Financial Dashboard (FinancialDashboardTab + Dashboard مالي tab). 5 parts implemented. Backend: `financial` module (11 routes), `dashboard-summary.service.ts` (45s TTL cache, 9 parallel Prisma queries, `$queryRaw` for top-5), `summary.export.adapter.ts`. Frontend: `FinancialReportsTab.tsx`, `FinancialDashboardTab.tsx`, Dashboard dual-tab shell (localStorage persistence, `financialdashboard.read` guard), Statements migration banner. New permission module: `financialdashboard`. BalanceDisplay M9 (formatBalance absolute + مدين/دائن). N+1 GL query fix. 64 files changed, 6292 insertions, 11 deletions. No migration, no IPC, no new npm packages. 718/718 backend (45 files) + 516/516 frontend (25 files). Gemini APPROVED ✅. |
| 2026-06-24 | `stable-statement-center-phase1-v1` | `4ab4cac` (merge) | Statement Center Phase 1 — Customer & Supplier Statements. Shared Statement Engine (`buildStatement()`) with entity-type-specific AR/AP sign conventions. Customer (AR): invoices=debit, payments=credit, formula `balance + debit - credit`. Supplier (AP): invoices=credit, expenses=credit, payments=debit, formula `balance - debit + credit`. 4 REST endpoints under `/api/statements/` (read + export per entity type). NaN entityId guard. Excel export (8 columns, KWD 3dp). Frontend: `Statements.tsx` (2-tab page, entity picker, filter bar, 5 summary cards, color-coded table, running balance, invoice navigation, export error feedback). Navigation: `كشف الحساب`. Permissions: `statements.read` + `statements.export` (ACCOUNTANT both; PROJECT_MANAGER read). 14 files changed, 1611 insertions. No migration, no IPC, no new npm packages. 628/628 backend (36 files) + 507/507 frontend (24 files). Gemini APPROVED ✅. |
| 2026-06-24 | `stable-approval-workflow-pack-v1-phase-a` | `970b944` (merge) | Approval Workflow Pack v1 Phase A — Universal Approval Engine Foundation. Backend: `ApprovalHistory` Prisma model + migration; `approval.types.ts` (9 interfaces); `ApprovalEngine` singleton (registry/composition, `$transaction` atomicity, SYSTEM_ADMIN bypass, fire-and-forget AuditLog); `GET /api/approval-history/:entityType/:entityId` with `hasModule()` IDOR guard + `historyPermission` enforcement; 2 new test files (26 tests). Frontend: `approvalHistoryApi`; 4 reusable components (ApprovalBadge, ApprovalTimeline, ApprovalActions, ApprovalHistoryPanel) + barrel export; all standalone, not wired to any page in Phase A. Security: history endpoint returns 400 for all unregistered entityTypes; no approval data exposed in Phase A. constants.ts: added `'submit'` and `'reopen'` to ACTIONS. 16 files changed, 1322 insertions. No existing workflows changed. No Electron IPC. No new npm packages. 617/617 backend tests (35 files) + 507/507 frontend tests (24 files). Gemini-approved. |
| 2026-06-23 | `stable-invoice-expenses-operations-pack-v1` | `b98bcdd` | Invoice & Expenses Operations Pack — full-stack operations hardening. Backend: rich FK conflict guards for customers/suppliers/equipment; expenses stats period cards (currentMonth/previousMonth/currentYear); billing period column in expenses report. Frontend: Smart Price Picker with contract filter + search; expenses period cards + supplier totals; billing period label standardization (`شهر الحساب`); i18n cleanup; ResourcePage archive modal shows rich conflict messages. 12 files changed. No migration. No IPC. 591/591 backend tests (33 files) + 507/507 frontend tests (24 files). |
| 2026-06-23 | `stable-accounting-completeness-h1-v1` | `2c00c6b` | Accounting Completeness H1 — Purchase Invoice GL Posting. `postPurchasePaymentToGL` (Dr AP 2000 / Cr Cash 1000 or Bank 1010), `reversePurchasePaymentGL`, `PATCH /invoices/:id/approve` endpoint, `clearGLForInvoice` extended, `GL_REFERENCE_TYPES` extended. 7 files changed, 851 insertions, 4 deletions. Backend-only. No migration. No frontend changes. No IPC. 571/571 backend tests (31 files) + 507/507 frontend tests (24 files). |
| 2026-06-23 | `stable-ux-polish-pack-v4` | `57b3fc3` | UX Polish Pack v4 — ConfirmModal system, global Toast notifications (toastStore + Toast.tsx), Modal size standardization (sm/md/lg/xl + focus trap), DataTable a11y (aria-busy, aria-live, sticky actions), Button hardening (type=, focus rings, loading state), CSS/RTL foundation. 32 files changed. Frontend-only. 526 backend tests + 507 frontend tests, all passing. |
| 2026-06-23 | `stable-print-designer-phase6-1c-v1` | `bf58714` | Print Designer Phase 6.1C — Template Studio Polish & Quotation Totals Consistency (enriched quotation data map, || vs ?? fix in resolveQuotationDocumentTotals, studio context note + quotation hint, 17 new tests, 507 frontend tests total) |
| 2026-06-23 | `stable-print-designer-phase6-1b-v1` | `b8fc3a0` | Print Designer Phase 6.1B — Advanced Line Items & Totals (document totals binding, autoHideZeroColumns, rowStriping, labelAlign/valueAlign, print-safe thead/tfoot/tr CSS, safeFmtStr, resolveInvoice/QuotationDocumentTotals, 23 new test groups, 490 frontend tests total) |
| 2026-06-23 | `stable-print-designer-phase6-1a-v1` | `cba932f` | Print Designer Phase 6.1A — Dynamic Line Items Table (new `lineItemsTable` element type, data resolvers for invoice/quotation, column visibility/label/width/align controls, RTL-safe cell alignment, token-only styles, totals section, 17 new test groups, 467 frontend tests total) |
| 2026-06-23 | `stable-print-designer-phase6-v1` | `23f12c9` | Print Designer Phase 6.0 — Universal WYSIWYG Template Studio (canvas editor, 8 element types, dynamic field allowlists, QR, barcode placeholder, images, shapes, import/export JSON, security restrictions, optional mode, offline-first) |
| 2026-06-23 | `stable-print-designer-phase5d2-v1` | `4c87b5b` | Print Designer Phase 5D.2 — Universal Layout Designer (drag/resize/rotation/multi-select/smart guides/rulers/lock/hide/copy/paste/import-export) |
| 2026-06-23 | `stable-print-designer-phase5d1-v1` | `5e6c097` | Print Designer Phase 5D.1 — Editable Static Text |
| 2026-06-22 | `stable-print-designer-phase5c-v1` | `cbcb101` | Print Designer Phase 5C — Universal Designer Foundation |
| 2026-06-22 | `stable-print-designer-phase5b-v1` | `a2e6cdd` | Print Designer Phase 5B — Text Styling Controls |
| 2026-06-22 | `stable-print-designer-phase5a1-v1` | `4a2203e` | Print Designer Phase 5A.1 — Professional UX Polish |
| 2026-06-21 | `stable-print-designer-phase5a-v1` | `88ba3dc` | Print Designer Phase 5A — Inline WYSIWYG Branding Designer |
| 2026-06-20 | `stable-print-document-suite-phase4-v1` | *(earlier)* | Phase 4 — Visual Position Designer |
| 2026-06-19 | `stable-executive-decision-center-phase1-v1` | *(earlier)* | Executive Decision Center |
| 2026-06-18 | `stable-print-document-suite-phase3-v1` | *(earlier)* | Phase 3 — Native PDF Export |

---

*Last updated: 2026-07-01 — **Documentation-only sync with `PROJECT_MASTER_STATUS.md`** (the new official single source of truth, reconstructed from Git: 220 stable tags, all on `production`, HEAD `e38f65e`). Changes: refreshed Current Production baseline; corrected stale "*(pending tag)*" / "awaiting review" entries in Completed Features & Release History to their real stable tags; added a **Feature Status Snapshot** (ExplorerKit / Banking / Printing / AI); **cleaned Future Roadmap** — removed all completed banking & integrations items, **Payroll→GL wiring** (now live via `postPayrollToGL` on `markPaid`), and **legacy Quotation PDF export** (superseded by engine-mode PDF), and consolidated the duplicate GL-auto-posting entries; added the late-June ExplorerKit / Banking / AI releases and **Settings Center Refresh** to Release History. Prior release: **Executive Dashboard Polish Pack — Phase 1** (`stable-executive-dashboard-polish-phase1-v1`, merge `2bc337c`, feature `031dd1a`), validation all green, Gemini APPROVED, pushed to `origin`.*
