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
| **Current Merge Commit** | `91d3f987` (merge of `feature/cheque-template-persistence-migration-v1` — **Cheque Template Persistence & Legacy Recovery Pack v1**. Closes a confirmed architectural defect: Cheque Designer templates (the layouts behind the Cheque Template Manager / "Cheque Studio" designer, including a template a real user actually lost) were the only user-created data in the whole system stored outside SQLite — in browser `localStorage` under `chequeDesigner.templates.v1` — so they were absent from local backup, restore and Google Drive sync, and were destroyed outright by events with nothing to do with cheques: Chromium partitions `localStorage` by BOTH the `userData` path and the page origin, so a `productName` rename, a reinstall, or simply moving between the dev server origin (`http://localhost:5173`) and the packaged `file://` origin silently produced a brand-new, empty store. Two sub-packs shipped together because neither had reached production before this release and the second is built entirely on the first's schema and service — splitting them was not possible in the uncommitted diff. **A. Cheque Template Persistence Migration Pack v1** — a new `cheque_designer_templates` table (migration `20260808120000_add_cheque_designer_templates`) becomes the single source of truth: identity/name/default-flag/surface-dimensions as indexed columns, the field layout as one Zod-validated JSON document with `.passthrough()` so a property this backend does not yet know about is carried through rather than silently stripped — the exact failure mode the old unvalidated `localStorage` blob had. A full backend module (`chequeDesignerTemplates.routes/controller/service/schema.ts`) on `/api/cheque-designer-templates` reuses the EXISTING `cheques.read` (read) / `settings.update` (write) permission keys — the same pair already gating the Cheque Studio overlay and Classic calibration — so no new permission key was added and no role gained or lost access. `chequeDesignerStore.ts`, the frontend storage layer, was rewritten end to end to be asynchronous and database-backed while keeping every prior semantic byte-for-byte: list order `updatedAt` descending, the first-ever template becomes default automatically, deleting the default promotes the most-recently-updated survivor, and setting a default deliberately does not bump `updatedAt` (managed explicitly rather than via Prisma's `@updatedAt`) so the Open dialog's list order never reorders itself. A one-time migration (`ensureLegacyImport`, memoised per page load and awaited by every read/write) moves whatever templates remain in the CURRENT browser profile's `localStorage` into the database exactly once, guarded by a durable marker row in `settings` PLUS an "the templates table is still empty" precondition re-checked server-side inside the importing transaction — so no client retry, relaunch or concurrent tab can import twice or overwrite a database that already has data. After a settled outcome the legacy key is deleted; failure (permission, offline backend) leaves the browser copy untouched for the next attempt. **B. Legacy Cheque Template Recovery Pack v1** — closes the one remaining gap the migration above cannot reach: templates created before `productName` was introduced live in an entirely different Chromium partition — a PREVIOUS `userData` folder, and usually a different page origin too — that the running application's own `localStorage` can never see, migration or not. A hand-written, dependency-free LevelDB reader (`legacyLevelDb.pure.ts`: raw Snappy block decompression, SSTable footer/index/data-block parsing, write-ahead-log record/batch parsing, and Chromium's `_<origin>\0\1<key>` LocalStorage key encoding) was written from scratch rather than pulling in a native `classic-level`/`leveldown` dependency, which would need rebuilding against every Electron ABI and shipping in the installer — an unacceptable packaging-risk trade for reading a few kilobytes once, ever. `legacyTemplateRecovery.ts` scans exactly three legacy `userData` folder names, each extracted from the project's OWN Git history rather than guessed: `manar-erp` (the original `package.json` `"name"`, used whenever no `productName` was set — every dev run and every pre-rename packaged build), `نظام المنار` (the `electron-builder.yml` `productName` in force from the initial commit until `0d88a50d`, i.e. every installed build before the rename), and `Electron` (Electron's own fallback folder name, observed on a real machine). The CURRENT folder is deliberately excluded — that case belongs to the migration above — and the scan is deliberately origin-blind, since the origin changing is itself one of the two things that hid these templates. Strictly read-only by construction: no LevelDB `LOCK` file is ever taken, nothing is written, nothing is deleted, verified by a test asserting the legacy folder's file bytes and directory listing are byte-for-byte identical before and after a scan. Recovery is gated on FOUR preconditions evaluated server-side (`legacyRecoveryStatus`) before the renderer opens a single file — empty database, no prior recovery, no prior migration, and (only if all three hold) an eligible client-side scan finding at least one template — with every precondition RE-CHECKED inside the same transaction the import runs in, so a client that ignored the status probe entirely still cannot import twice or overwrite existing data. Recovery carries its OWN durable marker (`chequeDesigner.legacyRecovery.v1`), deliberately separate from the migration's marker (`chequeDesigner.localStorageImport.v1`), because the two answer different questions — "did this database ever take templates from the CURRENT profile?" vs. "from an OLD one?" — and recovery is gated on BOTH being absent. Any failure anywhere in the chain — no Electron bridge (plain browser), a corrupt or unreadable legacy store, invalid JSON, a bridge that throws, an unreachable backend — is logged with its reason and the application continues exactly as if no legacy data existed; nothing in this pack can block startup, interrupt ordinary use, or destroy data. Verified against REAL data on the reporting machine, not just synthetic fixtures: the production scanner module was run directly against `%AppData%\manar-erp\Local Storage\leveldb` and recovered all 6 real stored templates — including the correct default (`تجربه نسخةتحت`) — with every field, coordinate, style property and original timestamp intact. No change to the Designer, the print engine, Calibration, or any user-facing screen; the user sees no difference beyond the templates simply being there again. 24 files (15 new, 9 modified); backend + frontend + electron. No new permission key. Schema impact: one new table, no change to any existing table. TypeScript zero errors on backend/frontend/electron; full `build:back`/`build:front`/`electron:build` all pass; backend 2840/2840, Electron+scripts 444/444, frontend 3739/3765 — the 26 failures across the same 8 pre-existing files, proven unrelated by re-running the affected suites on a clean stash before this pack's changes and finding the identical 4-failure/1-file split already present. Product Owner manual visual review: **completed**, confirmed explicitly before this release was merged)<br><br>_Previous release:_ `f12adf90` (merge of `feature/production-release-2026.2.0` — **Al Manar ERP 2026.2.0**, the first production release whose deliverable is a self-contained Windows installer rather than a branch. A release audit established that everything the Product Owner listed fell into two groups: already released and verified by tag and merge (Cloud Backup & Google Drive Sync v1, Administrative Forms Barcode Enhancement Pack v1 — which contains both the barcode settings and the barcode designer dialog — Ink Color System v2, Form Editor UX Rebuild Pack v2), or sitting complete-but-unreleased in the working tree, deliberately excluded by the previous release to protect its own scope. No unmerged branch and no stash held releasable work. Four packages shipped together. **Production Startup Pack v1** — a startup window created before any slow work, a staged progress bus, and startup failure that is *shown* rather than swallowed: a packaged Electron app has no terminal, so the old `catch { console.error(...); app.quit(); }` meant a failed launch produced nothing at all — no window, no error, no trace. The window now becomes a failure surface carrying the exit code, the captured stderr tail, the `error.log` tail and the log path, and waits for the user instead of quitting under them; a system dialog covers the case where the window itself could not be shown, so no silent failure path remains. Backend process death during startup rejects immediately rather than waiting out the full health timeout, which had been turning an obvious instant crash into a vague timeout tens of seconds later. Readiness logic lives in `backendReadiness.pure.ts` with no Electron imports, so it is unit-tested directly. `ATTACHMENTS_DIR` is now passed as an absolute path — the backend had resolved it relative to `process.cwd()`, which in production is the install directory, so attachments were written there (removed on uninstall, often unwritable) while Electron looked under `%AppData%`, and no attachment ever opened. Data-directory bootstrap moved behind a once-per-process guard; it had been re-running on every IPC call. **Production Deployment Pack v1** — `appId` `kw.almanar.erp`, `productName` "Al Manar ERP", per-user installation under `%AppData%` requiring no administrator rights, and `deleteAppDataOnUninstall: false` so user data survives uninstall. `analyze-runtime-deps.js` derives real runtime requirements by reading the PE import tables of every shipped binary rather than guessing — this release read 10 binaries and found **zero** external prerequisites, since Electron, the Prisma query engine and SQLite are all bundled — and `generate-nsis-prereqs.js` turns that manifest into the installer's prerequisite block (silent install of anything missing, plus a Windows-version guard), so the `.nsh` is generated and never hand-edited. Two real payload defects were fixed: 30 orphaned Prisma engine temp files (`.tmpNNNNN`, ≈537 MB) were being copied verbatim into every installer with no runtime function, and `backend/prisma/data/manar.db` — a stale *second* database left by a relative-path Prisma run, dirty (a `-journal` beside it) — was shipping inside the package, a genuine confusion hazard rather than mere weight. **Backend Startup Improvements** — `runPendingMigrations` had been launching the Prisma CLI as a full separate process on every production boot with no prior check, paying for tens of megabytes of CLI and schema-engine code, a network version check in an offline desktop app, and a cold read of thousands of files scanned by antivirus on first launch; measured on real hardware, first launch exceeded 15 seconds, overran `waitForHealth`, and the app closed before any window existed. The fault was never the migrations but paying their cost for no reason: it now compares `_prisma_migrations` against the migrations directory in one cheap query and launches nothing when nothing is pending, with the safety contract unchanged and explicitly fail-safe (pending ⇒ `migrate deploy`; state undeterminable, i.e. a new or corrupt database ⇒ `migrate deploy`; failure ⇒ stop the service rather than run on an inconsistent schema), and `rolled_back_at IS NULL` in the applied-set query since a rolled-back migration counted as applied would be skipped forever. **Form Editor UX Simplification v1** — the product reads «محرر النماذج» / "Form Editor"; the `page.officialLetter.title` **key**, the template and the `OL` reference prefix are deliberately unchanged, being permanent under INV-8 and INV-10, and a UI label may not move them. Installer `AlManarERP-Setup-2026.2.0.exe`, 132 MB, Windows 10/11 x64, zero external prerequisites. Exactly 40 files entered the release (23 modified, 12 added, 5 deleted), each staged by explicit path — no `git add -A`, no `git commit -a` — with 13 development artifacts left untracked by deliberate exclusion. No schema change, no migration, no new permission key, no route touched. Product Owner visual review **pending**: this release was delivered for review only, and Claude made no visual or functional verification claim)<br><br>_Previous release:_ `b5d7cc8a` (merge of `feature/form-editor-ux-simplification-v1` — **Form Editor UX Rebuild Pack v2**. Rebuilds the Official Letter page into a lightweight, generic Form Editor, on top of Form Editor UX Simplification Pack v1 (the earlier rename, blank-page default and Advanced Tools menu) carried on the same branch. **Version History and Comments removed completely** — backend: 9 routes, their handlers, schemas and `revisions.service.ts` deleted, the registration transaction's `PRE_REGISTER` snapshot call removed (the registration snapshot itself, what a reprint is reproduced from, is unaffected); frontend: `RevisionPanel`, `letterRevisionsApi`, `documentDiff.ts` and their tests deleted. **Validation rules cut from 25 to exactly 3** — `E4_reservedZoneOverlap`, `E16_objectInReservedZone`, `E13_impossibleGeometry` — deleted outright, not deselected; the editor now assists rather than refuses a missing subject, an empty body or an unregistered draft. **Letter assumptions removed** — date, recipient and subject stopped being fixed sections rendered on the sheet, in the pagination flow or in the outline (six sections → three: content, signature, barcode); they stay in the data model as metadata (barcode payload, registration snapshot, workspace list columns/search/sort unaffected). **Word (.docx) export** — real, via the `docx` package (new production dependency), mapping the Block Model directly into docx paragraphs/runs rather than rendering the page; a new `docx:export` Electron IPC channel opens the native save dialog; verified by unzipping the generated file and reading its real OOXML content. **Accurate preview** wired to the shared `useAccurateFormPreview`/`WysiwygPreviewPocDialog` infrastructure 16+ other forms already use, composing through the same `composeLetter` function HTML/PDF export use. **Header and toolbar merged** — `ExecutiveHeader`'s identity-card styling replaced by a slim `.lc-topbar` sharing one sticky shell with the formatting toolbar. **Layout rebuilt as three columns** — Insert promoted to a primary, default-open left rail (no longer an Advanced Tools destination); the Object Inspector ("خصائص العنصر")/Document Properties rail moved to a contextual right-hand slot, mode-exclusive by construction. The working tree also carried a large, unrelated, pre-existing uncommitted "Production Startup Pack"/deployment-version-bump workstream; every one of this release's 64 files was staged explicitly by path — for `electron/main.ts` and `package-lock.json`, entangled line-by-line with that workstream, by constructing the exact intended content directly (`git hash-object`/`git update-index`; a hand-filtered patch via `git apply --cached`) rather than staging the whole file — and that other workstream was left exactly as it stood. 64 files (46 modified, 12 deleted, 6 added); backend + frontend + Electron)<br><br>_Previous release:_ `9ec31d16` (merge of `feature/financial-position-analysis-audit-pdf-fix-pack-v1` — **Financial Position Analysis Audit & PDF Fix Pack v1**. Two independent fixes to the Financial Analysis Center (`#/financial-analysis`), scoped entirely to its PDF export path and its calculation engine — no page redesign, no workflow change. **PDF export:** `composeStyledFromNode` clones only the node it is handed into a bare `<body>`; the print root (`.fac-report`) is a descendant of `.xpl-scope .xpl-page .fac-page`, so every rule and CSS custom property scoped to those ancestors — the whole `--xpl-*` token set, `.fac-page .xpl-table-wrap { max-height: none; overflow: visible }` (without it the shared kit's own `max-height: 62vh` clipped every table and the remainder was unreachable on paper), cell un-truncation, repeated `<thead>`, `break-inside: avoid` on cards — silently stopped matching in the exported document; fixed by wrapping a detached clone of the print root in `.xpl-scope.xpl-page.fac-page` (`printShell()`) before composing. Separately, KPI cards could clip an amount with no ellipsis (deliberate: an ellipsised amount reads as a different number) because `useFitText`'s inline `font-size`, measured against the on-screen card width, survives unchanged into the static PDF with no JavaScript there to re-measure it at A4-landscape width; new `@media print` rules release the clip and override the inline size with `!important`. **Calculation audit — three engine defects:** `resolveAnalysisPeriod`'s day count was measured start-of-day to end-of-day (`23:59:59.999`), i.e. `n − ~0` days, then `+1` for inclusivity ⇒ `n+1` for every period (August → 32 days) — inflating DSO and, since the previous-period window is derived from this length, making it one day longer than the period it was compared against. Section 5 Receivables computed a period-movement delta, not an as-of balance: a debtor invoiced before the period but with no movement inside the window had no row at all, and an in-period payment settling an older invoice produced a negative/excluded balance instead of a lower one — fixed by adding `AnalysisDataset.ledger` (every active sales invoice and payment up to `period.to`, **zero added queries**: the two existing row queries lost their lower bound, and the in-period arrays Sections 1–4/6 still use are derived from it by one filter), matching the project's own AR definition in `operational.reporting.getAccountsReceivable`. Section 8's `daysSalesOutstanding` divided by Section 4's *signed* period-movement delta, which can go negative — repointed at Section 5's real `totalOutstanding`. **A follow-up correction to Section 4**, made after an explicit review question about its accounting basis, asked after the first two rounds had already shipped: `collectionRate` divided collected-in-period (which can include settlement of pre-period invoices) by invoiced-in-period only — two different scopes — producing rates over 900% and an "outstanding" figure that was a movement delta, not a balance (a −800 reading when +100 was actually owed). Replaced with the **Collection Effectiveness Index**: `collectionRate = collected ÷ (openingAr + invoiced)`, `outstanding = openingAr + invoiced − collected`, `openingAr` derived from the same `ledger` (entries dated before `period.from`) — again zero added queries. The default row sort moved from period-`invoiced` to total collectible (`openingAr + invoiced`), since every KPI on the section now measures against that basis. No change to Sections 1 Profitability, 2 Revenue, 3 Expenses, 6 Monthly Performance, page layout, or the import workflow; Sections 7/8 unaffected in substance beyond the DSO repoint. 11 files modified; backend + frontend)<br><br>_Previous release:_ `7d7b4f99` (merge of `feature/document-studio-ux-polish-pack-v1` — **Document Studio UX Polish Pack v1**. UX/UI polish for the Official Letter page's Document Studio — no new business feature, no document-model/print-engine/pagination/backend change. A single documented z-index ladder (`--lt-z-canvas` → `--lt-z-dialog`, `letter-tokens.css`) plus a shared `useFloatingPosition` hook portals every floating panel to `document.body`, fixing the reported "Font dropdown hidden behind other panels": the actual cause was `DocumentToolbar`'s own `overflow-x: auto` clipping FontPicker's dropdown before z-index was ever consulted, not stacking order — applied to FontPicker's dropdown, the toolbar's Spacing popover, and a new **floating selection toolbar** (Font, Size, Bold, Underline, Highlight, Alignment, Clear Formatting — no Italic, since that mark does not exist in the block model and this pack does not touch the model) that appears on an actual text selection and calls the exact same command handlers the docked toolbar already uses. **Resizable side rails** (nav/layers, Object Inspector, the insert/revisions/properties slot): a drag handle (`useResizableRail`), keyboard resizing via arrow keys on a WAI-ARIA `role="separator"`, and a session-persisted width. **Object Inspector** gained collapsible section cards via a CSS grid-rows-collapse animation, no JS height measurement. **Layers panel** gained a drop-target indicator during drag, a selected-state edge bar (colour plus an edge, not colour alone), and icon empty states. **Canvas** gained a per-object hover outline and resize/rotation-handle hover feedback, all on compositor-friendly `transform`/`opacity` properties so nothing costs anything during an active drag. Toolbar group spacing and divider refinement applied identically to both the Foundation toolbar and the Layout Designer's own, since the two are never on screen together and must read as one design. A shared panel entrance animation; trimmed outer chrome padding (the ruler-fitted 22px stage margin is untouched — it is exactly `A4_RULER_THICKNESS`, not spare room). **Two defects found and fixed during a live-browser pass** (Playwright against the running dev server), not by static review or the automated suite: the new resize handles on Object Inspector and Document Properties were positioned with a negative inset meant to straddle the panel's edge, and both panels set `overflow-y: auto` on that same root — which per the CSS spec also computes `overflow-x` away from `visible`, silently clipping the handle; `getBoundingClientRect()` still reported it present, only `document.elementFromPoint()` at the handle's actual screen position showed the panel itself was catching the click. Separately, every handle sat at `z-index: 1`, below each panel's own sticky header (`z-index: 30`), leaving a ~45px dead zone wherever the header overlapped it. Both fixed — handles now sit flush with the edge rather than protruding, and above the sticky header via `calc(var(--lt-z-panel-sticky) + 1)` — and re-verified with a real simulated mouse-drag before and after, not re-assumed from the code change alone. 33 files (6 new, 27 modified); frontend-only)<br><br>_Previous release:_ `c197e834` (merge of `feature/document-studio-v1` — **Document Studio v1**. Transforms the Official Letter page from a basic rich-text editor into a professional enterprise Document Studio, in three additive packs merged as one release. **Foundation v1** rebuilds the editor's architecture around a grouped toolbar and real rich text — paragraph/character styles, format painter, line/letter/paragraph spacing and indent on bounded ladders, find & replace, document stats, a mini navigator, zoom presets, keyboard shortcuts — with a hidden measurement mirror so pagination renders the same resolved values the screen shows. **Layout Designer v1** adds a free object layer over the flow document (drag/resize/rotate/lock/hide/duplicate/group, a layers panel, an object inspector, snapping, smart guides, distribution) rather than replacing it — a hybrid chosen explicitly over a full canvas rewrite; the letterhead's reserved bands stay a **blocking** validation rule (`E16`) regardless of object placement, so a locked letterhead cannot be silently overridden. **Professional Document Automation v1** adds an 18-variable engine (two of the eighteen, `Manager` and `Project`, are marked unavailable rather than shipped as silent traps, since the schema has no data source for either) resolved live on a DRAFT and frozen everywhere else via `resolveForStatus`, so a printed letter never silently re-resolves after issue; visual-only conditional content; asset/block/template/header-footer/signature/stamp libraries built on the existing `Setting` key/value table with zero schema change; document properties; **version history** with four kinds (`AUTO`, capped and pruned; `NAMED`, an author's marker, never pruned; `PRE_RESTORE` and `PRE_REGISTER`, lifecycle snapshots, never pruned or deletable — and, deliberately, never producible via the public API, only by the server code for that lifecycle event itself, inside its own transaction, since a client able to mint a lifecycle kind could plant an undeletable version); **track changes** (a pure `documentDiff.ts` module matching blocks by id, then a word-level LCS inside each — accept is a no-op by construction, only reject is a real operation, and a round-trip property test asserts that rejecting every reported change reproduces the baseline document exactly); threaded comments one level deep; auto-save; and Smart Export routed through the existing print engine's own compose/validation pipeline. Content model version 1→4, each step a purely additive re-stamp so stored drafts keep opening. Two new tables (`LetterVersion`, `LetterComment`) via a hand-written, dependency-reviewed migration; 9 new routes reuse the existing `letters.*` permission keys — no new key, no change to the print engine, preview pipeline, business logic or public APIs beyond the letters module, and no change to any page outside Official Letter. One defect was found and fixed during this release's own review: the pre-registration snapshot had been recorded client-side as `kind: 'AUTO'` — the pruned kind — which would have made the most consequential snapshot in a letter's life the first thing discarded past the 30-version cap; the fix moved it server-side, into `registerLetter`'s own transaction, so it lives or dies with the registration itself. The working tree also held a large, unrelated, pre-existing uncommitted Electron packaging/startup-window workstream; every one of this release's 100 files was verified and staged by explicit path, never `git add -A`/`git add .`/`git commit -a`, and that other workstream was left exactly as it stood. 100 files (66 new, 30 modified, 4 deleted); backend + frontend)<br><br>_Previous release:_ `3e684831` (merge of `feature/collection-analysis-page-v1` — **Collection Analysis Page v1**. A hidden analytical page answering one question: *how were invoices collected across fiscal years?* It is deliberately **not** an extension of the Financial Analysis Center and not a second Financial Position table — its subject is the relation between **two** fiscal years (the invoice's issue year and its collection year), not a figure inside one period, so it carries its own engine. **`CollectionAnalysisEngine`** is pure (dataset + filters in, report out — no Prisma, no I/O, no implicit `new Date()`), builds one *fact* per invoice in a single pass, then derives all five tables and eight KPI cards by indexed `Map` aggregation — no nested loops, so cost stays linear in invoices/payments no matter how many fiscal years exist. It does **not** re-implement business rules: `SALES_INVOICE_ACTIVE` and the Payment-date collection definition are imported from `shared/services/operational.reporting`, so its figures match the dashboard and the Financial Analysis Center *by definition*; `financialAnalysis` is not imported, touched, or modified, and the two engines share only numeric primitives (`percentOf` was added to the shared `reports/analysisKit` rather than copied). Fiscal year = calendar year here (no shifted fiscal year), per `historicalEntry.service.ts`. The data layer runs **four bounded queries** per request (invoices, payments, invoice items, price agreements) via Prisma relation filters — no `IN (…)` over thousands of ids, no query per table or per row. Two accounting decisions are load-bearing: **(1)** outstanding is computed from an invoice's **lifetime** payments, never from the collection-date window — the window scopes what counts as *collected in the period* and must not be able to invent a receivable on a fully-paid invoice; **(2)** "project" has no entity in this schema, and the nearest real identity, `ProjectPrice`, attaches to invoice **line items**, so invoice value and collections are apportioned across projects by line value and a project filter weights the invoice by its share — with the honest consequence that one invoice spanning two projects is counted in both, stated in the UI footnote and the Excel sheet rather than hidden. The page is **hidden from the sidebar** by design and reachable only from a new "تحليل التحصيلات" gateway section inside the Financial Analysis Center, which deliberately sits **outside** the print root because a navigation CTA is not report content. Its visual language is inherited wholesale — same `ExecutiveHeader`, filter bar, `AnalysisSection`/`AnalysisTable`/`MetricCard`, and the same `.fac-*` stylesheet; `CollectionAnalysis.css` adds only what has no equivalent there (the wide matrix with a sticky first column, the two-row filter bar, deferred-collection emphasis). Five professional tables, **no charts**: summary by invoice year — where *variance* is an identity rather than a coincidence (`invoice value − collected-in-year = collected-other-years + outstanding`); carry-over between years with the percentage computed **within** the issue year; the mandatory **transition matrix** whose row and column axes are derived entirely from the data (no year hard-coded, no upper bound); outstanding analysis; and performance across customer/contract/project. Row expansion is inline at both levels (year → invoices → collection transactions) with no dialogs: `AnalysisTable` gained an **optional** `expandable` prop rather than a second table component, and a guard test asserts that without it the table renders byte-identically, since that component backs every Financial Analysis Center table. Exports reuse the existing frameworks untouched (`buildExcelWorkbook`; `composeStyledFromNode` + the Chromium PDF bridge), and the drill-down reuses the ExplorerKit drawer and the existing `drilldownHandoff`. The backend search normalizer is a **literal mirror** of the frontend's `arabicSearch.ts`, with a permanent test diffing the two files' rules — a divergence would show a row in the table and an empty drill-down beneath it. Shipped in the same release: a **shared KPI-card overflow fix** reaching all 24 `MetricCard` consumers — `.xpl-metric` had no overflow guard and `.xpl-metric-value` no width constraint, so a currency figure (a single unbreakable token) rendered at natural width and painted outside the card, measured at **66px** of glyph spill for `999,999,999,999.999 KWD` in a 208px card. The card now clips, the body gets `flex: 1 1 auto` + `overflow: hidden` beside its existing `min-width: 0`, and labels/captions take ellipsis — but the money value **deliberately takes no `text-overflow`**, because an ellipsised amount is a *different number*, not a shortened one; instead `useFitText` measures `scrollWidth` against `clientWidth` and reduces the font until the value fits (floor 8px, derived from the worst specified case in the narrowest possible card), leaving values that already fit at exactly 19px so short values are visually unchanged. Its `ResizeObserver` reacts to **width only** — shrinking changes height, and reacting to that would loop forever. 38 files (27 new, 11 modified); no Prisma/schema/migration, no new permission key — guarded by `reports.read`/`reports.export` on the documented Financial Analysis Center precedent — no new export or drawer mechanism, no chart library)<br><br>_Previous release:_ `712dad62` (merge of `feature/administrative-forms-barcode-enhancement-pack-v1` — **Administrative Forms Barcode Enhancement Pack v1**. Adds a barcode as a THIRD element of the pre-existing Multi-Signature & Stamp branding system on the Blank A4 administrative form — no new engine, store, service, or renderer, per the brief's explicit constraint. `useBrandingDesigner`'s `ElementType` union gained a `'barcode'` member; every function that already operated per-element (`patchDoc`, drag, resize, rotate, align, reset, undo/redo, save) needed no branching to cover it — the union member was the whole extension point. `DesignableBrandingImage` gained an optional `children` prop so it can draw a composed QR code instead of an `<img src>`, while keeping the identical gesture handlers and `data-bd-type`/`data-designer-*` hooks the print/PDF/preview export paths already select by. A host document opts a third element in via `useBrandingDesigner`'s optional `elements` array; Blank A4 is the only caller today, so every other document's panel, reset buttons, and saved record shape are byte-identical to before. **Barcode Content Settings v1** adds a "⚙ إعدادات الباركود" dialog (built from existing ExplorerKit `Dialog`/`DialogSection`/`Button` primitives) where the operator authors a reference number, document subject, and free-text additional information — three fields appended to `FormQRCode.formatQrText`'s line-building logic, each skipped when blank; the thirteen pre-existing `FormQRCode` callers pass neither field, so their encoded QR text is byte-identical to before. The caption printed beneath the QR — previously a clock-derived `generateFormNumber()` value resolving to no real record — is now the operator's own reference verbatim, or nothing when the field is empty; no number is generated. Content persists through three plain-string `print.barcode.*` Settings rows via the exact `PUT /settings` call the branding designer's own `save()` already makes. A follow-up request added **reference-number memory**: `nextReferenceNumber()` is a pure function that increments a value's trailing digit run and pads back to its original width (`MN-2026-00125` → `MN-2026-00126`), returning non-numeric or absent input untouched rather than guessing; the dialog opens pre-seeded with this suggestion while the subject/details fields recall their last saved value verbatim. A fourth key, `print.barcode.lastReference`, holds the last NON-EMPTY reference independently of the printed one, so the dialog's **non-destructive Reset button** can clear its three fields (staged only, until Save) without erasing what the next suggestion counts from. A final follow-up, **Professional Ink Set v1**, appends 20 ballpoint-blue shades to the existing 4-color ink picker (`#0062D2` down to `#002650`) — appended after, never reordered among, the pre-existing four, so a previously-saved `inkMode` keeps resolving to the same color; every element that already supported ink color (signature, stamp, and now the barcode) gets all 24 shades automatically, with a build-time test enforcing every label stays distinct. 21 files (2 new, 19 modified); frontend-only, no Prisma/schema/backend/Electron change, no new permission key) |
| **Current Documentation Commit** | `PENDING_DOC_HASH` |
| **Current Stable Tag** | `stable-cheque-template-persistence-legacy-recovery-pack-v1` |
| **Current Release Date** | 2026-08-08 |
| **Application Version** | `2026.2.0` — calendar versioning, `package.json` `productName: "Al Manar ERP"`. Installer artifact `release/AlManarERP-Setup-2026.2.0.exe` (132 MB, Windows 10/11 x64, per-user install under `%AppData%`, user data preserved on uninstall). `2026.1.0` was authored but never released; the series jumped to `2026.2.0` at the Product Owner's request |
| **Total Stable Releases** | 415 (window 2026-06-07 → 2026-08-07) |
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
| Export | ExcelJS 4.4 for spreadsheets; Chromium HTML→PDF (`composeStyledFromNode`) for all documents/forms — PDFKit retired (Font Foundation Pack v1, 2026-07-29), zero remaining dependency |
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
- **Employee Entitlements domain** (current as of Employee Entitlements Core, Statement & Final Settlement
  v1, 2026-07-29) — self-contained bounded domain under `backend/src/modules/employee-entitlements/`, isolated
  from Payroll and Accounting (no GL entries, no `SalaryPayment`, no NBK export effect, no `Employee.status`
  writes). **One canonical calculation engine** (`backend/src/modules/employees/entitlements.calc.ts`,
  exposed via `entitlements.service.ts`'s `computeAtDate`/`sumLeavePaymentsUpTo`) — the duplicate
  `calculators/legalEntitlementCalculator.ts` re-export shim from the earlier Foundation pack is retired.
  **Superseded prior rules (do not use):** the old 9-month first-year eligibility gate is now **6 completed
  months**; the entitlement wage base is now **`Employee.salary` only** — allowances
  (`EmployeeAllowance`/`PayrollAllowance`) and `Payroll.snapshotBaseSalary` are explicitly excluded, not
  summed in. Daily wage = salary ÷ 26 (an approved manarERP calculation rule, not presented as verbatim
  statute). All service-duration/date-boundary math is calendar-day-safe (dates normalized to UTC midnight)
  so a given `asOf` is deterministic across the whole day. **Statement UI:** "تفاصيل مستحقات الموظف"
  (`frontend/src/pages/EmployeeEntitlementsCenter.tsx`, route `/employees/:id/entitlements`) — a
  progressive-disclosure page (financial-position hero, annual-leave summary, payment history all visible by
  default; calculation-details/EOS-estimate/historical-activity/leave-history collapsed by default). The
  employee-drawer tab (`EmployeeEntitlementsTab.tsx`) remains a lightweight summary linking into the full
  statement. **Entitlement payments** (`EmployeeEntitlementLedger`) support create/edit/delete with
  backend-authoritative, never-clamped overpayment rejection; the old `LeaveSettlementDialog`/
  `EntitlementLedgerDialog`/`entitlementLedgerDisplay` UI that predated this payment model is retired.
  **Final Settlement v1** (`finalSettlement.service.ts`, tables `employee_final_settlements` +
  `final_settlement_payments`) is a new sub-domain with lifecycle `DRAFT` (live-recalculated, not a
  snapshot) → `APPROVED` (frozen snapshot, written once) → `PAID` (derived live from persisted settlement
  payments vs. the frozen total — never a stored mutable balance) → `CANCELLED` (terminal history state;
  snapshot and payments preserved, never deleted or reused). Settlement payment edit/delete re-derives the
  lifecycle status transactionally (e.g. lowering a payment can reopen `PAID` back to `APPROVED`). At most
  one **active** (non-`CANCELLED`) settlement per employee is enforced by a SQLite **partial unique index**
  (`employee_final_settlements_active_employee_key`, `WHERE status <> 'CANCELLED'`, added in migration
  `20260729140000_final_settlement_cancellation`) — expressed as raw SQL because Prisma's schema language
  has no partial-index syntax; **this index is intentional and must be preserved** — `prisma migrate dev`
  cannot see it and may propose dropping it as drift; do not accept that suggestion. An employee may have
  unlimited historical `CANCELLED` settlements alongside their one active one.
- **Banking modules** — Bank Statement Import/Explorer, Bank Reconciliation (manual-confirm only, never
  auto-posts by policy), Bank Account Explorer, Payroll Bank Import/Analytics, NBK Salary XLS export —
  all production-complete.
- **Print Engine** — considered **closed**: single Chromium HTML→PDF pipeline (PDFKit fully retired as
  of Font Foundation Pack v1, 2026-07-29), 30 registered templates, 12 official forms, Template Studio
  (print designer), cheque printing + per-bank calibration, universal print preview across 15 supported
  document types. Do not open a new print-system generation.
- **Font Foundation Pack v1 (2026-07-29):** single-source font-stack registries —
  `frontend/src/styles/fontRegistry.ts` (`UI_FONT_STACK`/`CHART_FONT_STACK`/`MONO_FONT_STACK`/
  `DOC_FONT_STACK`/`docFontStack()`/`buildEmbeddedFontFaceCss()`) and
  `backend/src/shared/services/reportEngine/fonts.ts` (kept separate — no shared build boundary
  between the two TS programs) — replacing ~20 duplicated literal font-stack strings. Every constant is
  a verbatim copy of what was previously written at each site; no font, weight, or fallback changed.
  `--font-ui` renamed `--app-font-ui` across `theme.css` and 8 dependent stylesheets, matching the
  existing `--app-font-mono` convention (namespaced to avoid any future Tailwind v4 theme-token
  collision). Separately, PDF export (`FormLayout.doExportPdf`, `BlankA4Print.doExportPdf`) now composes
  through `composeStyledFromNode` — the same clone-and-capture function `useAccurateFormPreview` already
  used for Accurate Preview — closing a real gap where Saved PDF could visually diverge from Preview
  because the old `buildFormPdfDocument` hand-rebuilt its own CSS independently. Both
  `frontend/src/forms/shared/formPdfDocument.ts` and the dead PDFKit-based
  `backend/src/shared/services/reportEngine/pdf.service.ts` (zero production consumers, referenced a
  font file that never existed in the repo) are deleted; the transitional `pdfUseComposedDocument` opt-in
  prop is fully removed from `FormLayout` — all 12 consumers use the unified path unconditionally.
  Deferred, documented, not in scope: IBM Plex Mono font loading (referenced but never actually loaded —
  every use already falls back to system `monospace`, today's approved appearance), Template Studio
  fallback chains, `textStyleOverrides.ts` (a user-facing designer choice), any new weight/size/line-height,
  and a handful of pages whose font stacks are genuinely different from the unified constants
  (`BankAccounts.tsx`, `BankSalaryAnalytics.tsx`, `BankAccountExplorer.tsx`, `DateCalendarPicker.css`,
  `RootErrorBoundary.css`). No backend Prisma or API change.
- **Multi-Signature & Stamp Management v1 (as of Multi-Signature & Stamp Management v1, 2026-07-28):**
  a document can carry any registered signature and any registered stamp — or none — instead of one
  fixed pair. `frontend/src/print-templates/branding/brandingAssets.ts` stores each as a
  `BrandingAsset { id, name, title, imageUrl, show, isDefault }` list under the `Setting` keys
  `print.signatures`/`print.stamps` (same key/value table, no Prisma change); legacy single-image keys
  (`print.signatureImage`/`showSignature`, `print.stampImage`/`showStamp`) are kept as mirrors of the
  default asset for backward compatibility. `useBrandingSelection` + `BrandingAssetPicker` give the
  per-document choice, independent of layout — swapping an asset never moves a saved position. Wired
  into Quotation, Invoice, Receipt Voucher, and nine administrative forms sharing the `ApprovalSection`
  footer via `FormLayout`'s opt-in `approvalBranding` prop (SalaryCertificate, ToWhomItMayConcern,
  LeaveRequest, ReturnToWork, SalaryAdvance, Resignation, EmployeeWarning, PerformanceEvaluation,
  PurchaseRequest); Payment Vouchers and Employment Contract are excluded (no company approval slot /
  asymmetric footer). **Design Mode** — drag, a resize handle, and sliders — was generalized from the
  pre-existing Quotation/Invoice designer (`useBrandingDesigner`/`BrandingDesignerPanel`) to all ten
  document types via one `BrandingDocKey` union and an optional per-document entry in the existing
  `print.brandingLayout` Setting; an undesigned document has no entry and resolves to the identity
  transform (renders exactly as before). Resize is a single uniform `scale`, never width/height, so
  aspect ratio cannot change. Bounds are one central envelope, `BRANDING_LAYOUT_BOUNDS` (x/y `-150..150`,
  scale `0.2..4`), applied through one clamp function — adopted after a trial scoped to Salary Certificate
  alone. **As of Blank A4 Free Print v1 (2026-07-28)** this envelope has exactly one documented exception:
  a closed table (`BOUNDS_BY_DOC` in `brandingLayout.ts`, one key — `blank-a4-print`) resolved via
  `getBrandingLayoutBounds(docType)`, read by every control path (drag, resize, sliders, undo/redo, save,
  and the render-time display transform) so a saved wide position is never clamped differently than it
  was edited. Every other document still resolves to the central envelope unchanged. The panel lives
  outside `PrintWorkspace` (its zoom transform breaks `position: fixed`) and is `.no-print`; the accurate
  preview, print dialog, and PDF export all compose from the same DOM node the designer edits.
- **Blank A4 Free Print v1 (2026-07-28):** a blank A4 administrative form (`frontend/src/pages/
  BlankA4Print.tsx`, route `/forms/blank-a4-print`) for stamping a signature/stamp over an externally
  pre-printed page already loaded in the printer. Reuses the Multi-Signature & Stamp system and Design
  Mode above verbatim; deliberately bypasses `FormLayout`/`ApprovalSection` (both always render a title,
  form-number, QR and approval label with no opt-out) and composes the same lower-level hooks/components
  directly, so the sheet carries only the two branding images. The sheet element IS the physical page —
  `210mm × 297mm`, `@page margin: 0`, `padding: 0` — so Design Mode, the accurate preview, PDF export, and
  physical print all share one coordinate system with the origin at the sheet's true corner; the print CSS
  asserts this geometry rather than relaxing it (a `height: auto` rule was the root cause of an earlier
  review-round defect where the box collapsed and the images landed in the header band). Four screen-only
  cm rulers (`frontend/src/forms/shared/A4Ruler.tsx`, one per edge, 1mm/5mm/1cm graduation) are DOM
  siblings of the sheet, not descendants, so they are structurally absent from every export path. No
  backend, Prisma, or `FormLayout`/`ApprovalSection` change.
- **Ink Color System v2 (2026-07-28):** signature/stamp ink color is now PER-ELEMENT
  (`BrandingElementLayout.inkMode`, `frontend/src/print-templates/engine/types.ts`) — independent for
  signature vs stamp and independent per document — inside the same `print.brandingLayout` Setting
  position/size already live in, sharing Save/Reset/Undo/Redo with no second store. Replaces v1's ONE
  global `localStorage['manar.inkMode']` value (read once by every document's `useBrandingDesigner`,
  so a color picked while designing one document leaked into every other document opened afterward).
  `original`/`black` unchanged; four new ballpoint-blue shades (Dark `#12276B`, Medium `#1F3F94`, Royal
  `#2A52BE`, Blue-Violet `#3D3B8E`) render via SVG `feColorMatrix` — the same technique already
  shipped for `FormHeader.tsx`'s logo recolor — targeting a constant ink RGB while leaving the ALPHA
  channel untouched, so antialiased edges and transparency-encoded density survive unchanged; the
  source image is never modified. Legacy `blue-ink` keeps its exact old CSS `sepia`/`hue-rotate` filter
  for backward compatibility, no longer offered in the picker. An element with no saved `inkMode`
  resolves through `resolveInkMode()` to the legacy localStorage default (read-only now), so no
  pre-v2 design's appearance changes silently; Reset writes `inkMode: undefined` explicitly (a merge
  patch cannot clear a key it never mentions). The shared `BrandingDesignerPanel` gained a per-element
  color-swatch picker with live preview — no parallel Design Mode — covering Invoice, Quotation, all
  ten administrative forms, and Blank A4 Free Print through that one panel. Each colored image's SVG
  `<filter>` definition renders as a DOM sibling of the image, so PDF export and the accurate preview
  (both clone the printable subtree) carry the color with them. No backend or Prisma change.
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
- Audit Log Viewer enhancements (export, advanced filters).
- Additional print profiles (custom margins, extra watermarks).

**Low priority**
- Historical Import Batch Review & Posting (`ImportBatch`/`ImportBatchItem` — designed, no models yet).
- Recurring invoices, VAT/tax report, end-of-service indemnity accrual — none exist in code.
- AuditLog retention/purge path — maintenance consideration only; revisit only if DB growth becomes
  measurable.

---

## Latest Completed Releases

- **Form Editor UX Rebuild Pack v2** (2026-08-07,
  `stable-form-editor-ux-rebuild-pack-v2`) — rebuilds the Official Letter page into a
  lightweight, generic Form Editor, on top of Form Editor UX Simplification Pack v1
  carried on the same branch. Version History and Comments removed completely
  (backend + frontend). Validation rules cut from 25 to exactly 3
  (`E4_reservedZoneOverlap`, `E16_objectInReservedZone`, `E13_impossibleGeometry`) —
  deleted, not deselected. Date/recipient/subject stopped being fixed sections on the
  sheet, kept only as metadata (barcode payload, registration snapshot, workspace
  columns/search/sort unaffected). Real Word (.docx) export via the `docx` package,
  mapping the Block Model directly rather than the rendered page, with a native save
  dialog through a new Electron IPC channel — verified by unzipping the generated file
  and reading its real OOXML content. Accurate preview wired to the shared
  `useAccurateFormPreview` infrastructure 16+ other forms already use.
  `ExecutiveHeader`'s identity-card styling replaced by a slim merged toolbar shell.
  Insert promoted to a primary, default-open left rail; the Object Inspector/Document
  Properties rail moved to a contextual right-hand slot. 64 files (46 modified, 12
  deleted, 6 added); backend + frontend + Electron; no Prisma/schema/permission-key
  change.

- **Financial Position Analysis Audit & PDF Fix Pack v1** (2026-08-07,
  `stable-financial-position-analysis-audit-pdf-fix-pack-v1`) — a PDF export fix and a
  full calculation audit for the Financial Analysis Center (`#/financial-analysis`), no
  page redesign, no workflow change. **PDF export:** `composeStyledFromNode` cloned only
  the print root, losing its `.xpl-scope`/`.xpl-page`/`.fac-page` ancestors and every
  rule/token scoped to them — the whole `--xpl-*` custom-property set, and the table-wrap
  override that keeps the shared kit's `max-height: 62vh` from clipping every table on
  paper — fixed by composing a detached clone wrapped in that same ancestor chain. KPI
  cards separately could clip an amount with no ellipsis because `useFitText`'s inline
  font-size, measured against the on-screen card width, survives unchanged into the
  static document; new `@media print` rules release the clip and override the inline
  size. **Calculation audit — three engine defects:** a period day-count off-by-one
  (measured start-of-day to end-of-day then `+1`) inflating DSO and mis-sizing the
  previous-period comparison window; Section 5 Receivables computed as a period-movement
  delta instead of an as-of balance, fixed via a new `AnalysisDataset.ledger` (every
  invoice/payment up to `period.to`, **zero added queries**) matching the project's own
  AR definition in `operational.reporting.getAccountsReceivable`; Section 8 DSO reading
  Section 4's signed movement delta (could go negative) instead of Section 5's real
  balance. **A follow-up correction to Section 4**, made after an explicit review
  question about its accounting basis: the old `collectionRate` divided
  collected-in-period against invoiced-in-period only — two different scopes — producing
  rates over 900% and a movement-delta "outstanding" reading −800 when +100 was actually
  owed; replaced with the Collection Effectiveness Index (`collected ÷ (openingAr +
  invoiced)`, `openingAr` from the same ledger), with the default row sort moved to total
  collectible accordingly. 11 files modified; backend + frontend; no Prisma/schema/
  migration/permission-key/Electron change.

- **Document Studio UX Polish Pack v1** (2026-08-07,
  `stable-document-studio-ux-polish-pack-v1`) — UX/UI polish for the Official Letter
  page's Document Studio: no new business feature, no document-model/print-engine/
  pagination/backend change. A single documented z-index ladder (`--lt-z-canvas` →
  `--lt-z-dialog`) plus a shared `useFloatingPosition` hook that portals every floating
  panel to `document.body` fixes the reported "Font dropdown hidden behind other
  panels" at its real cause — `DocumentToolbar`'s own `overflow-x: auto` clipping the
  dropdown before z-index was ever consulted, not stacking order — applied to
  FontPicker's dropdown, the toolbar's Spacing popover, and a new **floating selection
  toolbar** (Font, Size, Bold, Underline, Highlight, Alignment, Clear Formatting — no
  Italic, since that mark does not exist in the block model) that appears on an actual
  text selection and reuses the docked toolbar's own command handlers. **Resizable side
  rails** (nav/layers, Object Inspector, insert/revisions/properties slot) with a drag
  handle, keyboard resizing, and session-persisted width. Collapsible Object Inspector
  cards; a Layers panel drop-target indicator and selected-state edge bar; per-object
  canvas hover outline and handle hover feedback, all on compositor-friendly properties.
  **Two defects found and fixed during a live-browser pass**, not by static review or
  the automated suite: the new resize handles on two panels were positioned with a
  negative inset that a `overflow-y: auto` on that same panel root silently clipped
  (`getBoundingClientRect()` still reported it present; only
  `document.elementFromPoint()` showed the panel itself was catching the click), and
  every handle had a dead zone under its panel's own sticky header from an
  insufficient z-index. Both fixed and re-verified with a real simulated drag before
  merge. 33 files (6 new, 27 modified); frontend-only.

- **Document Studio v1** (2026-08-06, `stable-document-studio-v1`) — the Official Letter
  page, transformed from a basic rich-text editor into a professional enterprise Document
  Studio, across three additive packs merged as one release. **Foundation v1:** grouped
  toolbar, real rich text (paragraph/character styles, format painter, line/letter/
  paragraph spacing and indent on bounded ladders), find & replace, document stats, mini
  navigator, zoom, keyboard shortcuts — with a hidden measurement mirror so pagination
  renders the same resolved values the screen shows. **Layout Designer v1:** a free object
  layer (drag/resize/rotate/lock/hide/duplicate/group, layers panel, object inspector,
  snapping, smart guides, distribution) layered over the flow document rather than
  replacing it; the letterhead's reserved bands stay a **blocking** rule (`E16`) regardless
  of object placement. **Professional Document Automation v1:** an 18-variable engine
  (two variables marked unavailable rather than shipped as silent traps, since the schema
  has no data source for either) resolved live on a DRAFT and frozen everywhere else;
  visual-only conditional content; asset/block/template/header-footer/signature/stamp
  libraries on the existing `Setting` table with zero schema change; document properties;
  **version history** with four kinds — `AUTO` (capped, pruned), `NAMED` (never pruned),
  and two lifecycle snapshots `PRE_RESTORE`/`PRE_REGISTER` (never pruned or deletable, and
  producible only by the server code for that lifecycle event, inside its own transaction —
  never via the public API, since a client able to mint a lifecycle kind could plant an
  undeletable version); **track changes** (word-level diff, blocks matched by id, accept a
  no-op by construction, only reject a real operation — a round-trip property test asserts
  rejecting every change reproduces the baseline document exactly); threaded comments;
  auto-save; and Smart Export through the existing print engine's compose/validation
  pipeline. Content model 1→4, each step a purely additive re-stamp. Two new tables
  (`LetterVersion`, `LetterComment`); 9 new routes reuse the existing `letters.*`
  permission keys — no new key, no print-engine or business-logic change, no change to any
  page outside Official Letter. **One defect found and fixed during this release's own
  review:** the pre-registration snapshot was recorded client-side as `kind: 'AUTO'` — the
  pruned kind — which would have made the single most consequential snapshot in a letter's
  life the first thing discarded past the 30-version cap; the fix moved it server-side,
  into `registerLetter`'s own transaction, so it lives or dies with the registration.
  100 files (66 new, 30 modified, 4 deleted); backend + frontend; every file verified and
  staged by explicit path, never `git add -A`/`git add .`/`git commit -a` — a large,
  unrelated, pre-existing uncommitted Electron packaging/startup-window workstream sharing
  the same working tree was left exactly as it stood.

- **Collection Analysis Page v1** (2026-08-06,
  `stable-collection-analysis-page-v1`) — a hidden analytical page answering one
  question: how were invoices collected across fiscal years? Not an extension of the
  Financial Analysis Center and not a second Financial Position table — its subject is
  the relation between **two** fiscal years, so it carries its own engine.
  **`CollectionAnalysisEngine`:** pure (dataset + filters in, report out; no Prisma, no
  I/O, no implicit `new Date()`), one fact per invoice built in a single pass, then all
  five tables and eight KPI cards derived by indexed `Map` aggregation — no nested loops,
  so cost is linear in invoices/payments regardless of how many fiscal years exist. It
  does not re-implement business rules: `SALES_INVOICE_ACTIVE` and the Payment-date
  collection definition come from `shared/services/operational.reporting`, so figures
  match the dashboard and the Financial Analysis Center by definition;
  `financialAnalysis` is not imported or modified, and only numeric primitives are shared
  (`percentOf` was added to `reports/analysisKit`, not copied). Fiscal year = calendar
  year here. Four bounded queries per request via relation filters — no `IN (…)` over
  thousands of ids. **Two accounting decisions:** outstanding is computed from an
  invoice's lifetime payments, never from the collection-date window (the window scopes
  what counts as collected in the period; it must not invent a receivable on a fully-paid
  invoice); and "project" has no entity in this schema — the nearest identity,
  `ProjectPrice`, attaches to invoice line items, so value and collections are
  apportioned by line value and a project filter weights the invoice by its share, with
  the honest consequence that an invoice spanning two projects is counted in both, stated
  in the UI and the Excel sheet rather than hidden. **Presentation:** hidden from the
  sidebar, reachable only from a new "تحليل التحصيلات" gateway section in the Financial
  Analysis Center that sits outside the print root (a navigation CTA is not report
  content). Visual language inherited wholesale — same header, filter bar,
  `AnalysisSection`/`AnalysisTable`/`MetricCard`, same `.fac-*` stylesheet; the new CSS
  adds only the wide matrix, the two-row filter bar, and deferred-collection emphasis.
  Five tables, no charts: summary by invoice year (where variance is an identity —
  invoice value − collected-in-year = collected-other-years + outstanding), carry-over
  between years, the mandatory transition matrix with fully data-derived axes (no year
  hard-coded, no upper bound), outstanding analysis, and performance across
  customer/contract/project. Row expansion is inline at both levels with no dialogs:
  `AnalysisTable` gained an **optional** `expandable` prop rather than a second table
  component, and a guard test asserts the table renders byte-identically without it,
  since that component backs every Financial Analysis Center table. Exports and the
  drill-down drawer reuse the existing frameworks untouched. The backend search
  normalizer is a literal mirror of the frontend's `arabicSearch.ts`, with a permanent
  test diffing both files' rules — divergence would show a row in the table and an empty
  drill-down beneath it. **Shared KPI-card overflow fix** (all 24 `MetricCard`
  consumers): `.xpl-metric` had no overflow guard and `.xpl-metric-value` no width
  constraint, so a currency figure — a single unbreakable token — painted outside the
  card, measured at 66px of spill for `999,999,999,999.999 KWD` in a 208px card. The card
  now clips, the body gets `flex: 1 1 auto` + `overflow: hidden`, labels and captions
  take ellipsis — but the money value deliberately takes none, because an ellipsised
  amount is a different number, not a shortened one; `useFitText` measures `scrollWidth`
  against `clientWidth` and reduces the font until it fits (floor 8px, derived from the
  worst specified case in the narrowest card), leaving already-fitting values at exactly
  19px. Its `ResizeObserver` reacts to width only — shrinking changes height, and
  reacting to that would loop forever. 38 files (27 new, 11 modified); no
  Prisma/schema/migration, no new permission key, no chart library.

- **Administrative Forms Barcode Enhancement Pack v1** (2026-08-05,
  `stable-administrative-forms-barcode-enhancement-pack-v1`) — a barcode as a THIRD
  element of the existing Multi-Signature & Stamp branding system on the Blank A4
  administrative form, plus three follow-up requests delivered in the same package.
  **Barcode as a branding element:** `useBrandingDesigner`'s `ElementType` gained a
  `'barcode'` member — every function that already operated per-element (drag, resize,
  rotate, align, reset, undo/redo, save) needed no branching to cover it, and
  `DesignableBrandingImage` gained an optional `children` prop so it draws a composed QR
  code instead of an `<img src>` while keeping the identical gesture handlers and export
  hooks. No `Barcode Engine`/`Service`/`Store`/`Manager`/`Context`/`Hook` was created, per
  the brief's explicit constraint; a host document opts the element in via an `elements`
  array, so every document besides Blank A4 is untouched. **Barcode Content Settings v1:**
  a "⚙ إعدادات الباركود" dialog (built from existing ExplorerKit primitives) lets the
  operator author reference number, subject, and free-text details, extending
  `FormQRCode.formatQrText` additively — the thirteen pre-existing QR consumers encode
  byte-identical text. The printed caption was previously a clock-derived
  `generateFormNumber()` value with no real record behind it; this release removes that
  generation — the caption is the operator's own reference or nothing. Content persists
  through three plain `print.barcode.*` settings rows via the same `PUT /settings` the
  branding designer already calls. **Reference memory & non-destructive Reset:**
  `nextReferenceNumber()` purely increments a value's trailing digit run, preserving width
  and leaving non-numeric input untouched; a fourth `print.barcode.lastReference` key
  remembers the last non-empty reference independently of the printed one, so Reset can
  clear the dialog's three fields without erasing what the next suggestion counts from.
  **Professional Ink Set v1:** 20 ballpoint-blue shades appended after the 4 pre-existing
  ones in the shared ink-color picker, so a saved color choice never resolves differently;
  every ink-capable element (signature, stamp, barcode) gets the extended picker
  automatically, with a build-time test guarding every label stays distinct. 21 files (2
  new, 19 modified), frontend-only. No Prisma/schema/backend/Electron change, no new
  permission key. Feature commit `b8095c58`, merge `712dad62`. Validation: frontend
  `tsc --noEmit` ✅ (feature branch and post-merge) · `build:front` ✅ (feature branch and
  post-merge) · full suite 3552 tests, 3525 passing, 26 failures identical in count and
  identity to the pre-existing baseline (confirmed via `git stash` against clean HEAD) ·
  190 new/extended tests. Product Owner manual visual review: approved, release explicitly
  requested.

- **Cloud Backup & Google Drive Sync v1** (2026-08-05, `stable-cloud-backup-google-drive-sync-v1`) — four packs
  merged as one feature, turning an existing but production-unsafe Drive sync engine into a
  supportable one. **Grant recovery:** `invalid_grant` / `unauthorized_client` / `access_denied`
  are now a distinct `GRANT_DEAD` state — the dead token is deleted, the reason survives restarts,
  and one click runs disconnect → relink → verify-with-a-real-Drive-query. Previously
  `isAuthenticated()` only checked that a string existed on disk, so the UI claimed a healthy
  connection forever while every sync failed. **Lost-update protection:** uploads check the remote
  against both the snapshot the decision was built on and a re-read taken immediately before
  writing; any change becomes a user-resolved conflict instead of a silent overwrite. **Real
  timeouts:** every Drive call runs under an `AbortController` (30s metadata / 180s transfer).
  **Decision-engine coverage:** the rules deciding which copy of the database lives moved to a pure
  module and are covered for all ten specified scenarios. Also: OAuth client binding on stored
  tokens, one central Arabic error-translation layer (no raw Google text reaches the screen), a
  sync mutex over all seven entry points, atomic temp→fsync→rename state writes, 403 rate-limit
  handling with `Retry-After`, the OAuth Desktop client bundled into the installer, and an
  unconditional local-backup guarantee after any cloud failure. The backup page became a **cloud
  diagnostics centre** — 16 status items, a 0-100 health score with history, an operation log with
  durations and a details drawer, one-click self repair, engine information, and PDF/Excel exports —
  built entirely from existing ExplorerKit primitives with zero new CSS, read passively with zero
  network calls, and structurally incapable of leaking a token because the snapshot type has no
  field for one. 33 files (18 new, 15 modified); no Prisma/schema/migration, no new permission key.
  **Operational prerequisite (not code):** the Google Cloud OAuth consent screen must be set to
  *In production* — while it stays in *Testing*, Google expires refresh tokens after 7 days, which
  is the most likely origin of the incident that opened this work. This release makes that failure
  visible and recoverable in one click; it does not prevent it from recurring.

- **Financial Analysis Center v1** (2026-08-04, `stable-financial-analysis-center-v1`) — a new read-only
  executive page at `#/financial-analysis` (sidebar: المالية → مركز التحليل المالي), guarded by
  `reports.read`. Eight numbered, **table-only** sections (no charts, per spec): profitability, revenue,
  expenses, collections, **receivables**, monthly performance, top lists, financial indicators — all driven
  by one shared filter that rides the global `FinancialPeriodContext`, and all loaded by **one request**.
  Backend `modules/financialAnalysis/` is split into a shared type contract, a single Prisma `dataset` layer,
  a **pure** `compute` layer (no Prisma/I/O/`new Date()`, unit-tested directly) and thin
  service/controller/routes. **No business rule was redefined:** revenue, expenses, collections and P&L are
  taken from `shared/services/operational.reporting`, so the page agrees with the dashboard and the P&L
  report by construction. Each section's KPI cards are computed from that section's own table rows, so a
  card cannot disagree with the column beneath it. Receivables ageing uses FIFO payment application over the
  already-loaded arrays — no extra query, no new field — and reports positive balances only (deliberately a
  different figure from net collections). Exports reuse existing engines only: 11-worksheet Excel via
  `buildExcelWorkbook` and a landscape multi-page PDF via `composeStyledFromNode` + Electron
  `exportPdfFromHtml`, with a structural print root that excludes filters and buttons by DOM boundary.
  Three root causes fixed along the way: header/body misalignment from CSS specificity in the shared kit;
  PDF ignoring any requested page spec because `theme.css`'s document-wide `@page` made the composer's
  fallback unreachable (fixed by an opt-in `forcePageSpec` whose default is byte-identical for all existing
  callers); and an unbounded render/fetch loop from `useT()`'s unstable identity (119 commits/79 requests →
  4 commits/1 request, guarded by a Profiler test). 32 files; **no Prisma/schema/migration, no new
  permission key, no Electron change.** 100 new tests.

- **Administrative Forms Preview UX Pack v1** (2026-07-31,
  `stable-administrative-forms-preview-ux-v1`) — frontend-only, no backend/schema changes.
  Replaces the direct-print "طباعة" action on Administrative Forms cards with "فتح" (Open),
  which routes into the existing WYSIWYG preview architecture (`PrintWorkspace`) instead of
  triggering an immediate OS print dialog. **Root cause:** `FormLayout`'s auto-print
  `useEffect` fired `printCurrentView()` as soon as `ready === true` — navigating from a card
  into the form page (not the click itself) triggered the print, for the 8 of 14 registry
  forms that pass `ready` to `FormLayout`. **Fix:** a URL-only intent marker
  (`?open=preview`, `forms/shared/formOpenIntent.ts`) set exclusively by navigation from the
  Administrative Forms page; `FormLayout` skips auto-print when present. `PrintWorkspace`
  gained an additive, opt-in `initialZoom` prop that seeds (never locks) the preview's
  starting zoom at 80% via the marker — every fresh preview session (new form, or reopening
  the same one) starts at 80% again, but user zoom actions own the value from the first
  interaction on. 12 of the 14 registry forms render through `PrintWorkspace` and get the 80%
  initial zoom. **Intentional exceptions:** `employment-contract` and `receipt-voucher` use
  their own dedicated screens (no `PrintWorkspace`) — "فتح" is correct on both (no
  auto-print), but no 80% zoom applies since there is no shared preview surface to seed; this
  is an architecture-preserving exception, not unfinished work. **Not changed:** print
  pipeline (`doPrint`, `printCurrentView`, `submitPrintJob`, `webContents.print`), `@page`
  geometry, margins, paper size, PDF export, the separate flag-gated "معاينة دقيقة" WYSIWYG
  POC dialog, any non-Administrative-Forms caller of the same routes (e.g. Cheques →
  payment-voucher, which carries no marker and keeps its previous auto-print/fit-to-page
  behavior), backend, Prisma/schema/migrations, Electron print implementation. Feature commit
  `ada2d56`, merge `e645f303`. Validation: 19/19 new focused frontend tests passing ·
  affected-suite sweep (15 files) 13 passing, 2 pre-existing failures unrelated to this pack
  deferred (`formsRegistryTranslationAudit.test.ts`, `universalPrintPreviewCorrective.test.ts`)
  · frontend `tsc --noEmit` ✅. Product Owner manual review: approved, release explicitly
  requested.

- **Bank Statement Import Server Date Hardening Pack v1** (2026-07-31,
  `stable-bank-statement-import-server-date-hardening-v1`) — backend-only, no frontend/schema
  changes. Hardens the bank-statement-import server boundary so transaction dates are
  deterministic and validated before reaching business logic, closing a risk explicitly
  deferred by the preceding Project-Wide Date Display, Export & Import Consistency Pack v1
  audit. **Traced first:** the trusted frontend parser (`bankStatementParser.ts`
  `parseDateStr`) already normalizes every legitimate bank-file date shape (Excel serial, ISO,
  `DD/MM/YYYY`, `DD-MM-YYYY`, verbose month) into canonical `YYYY-MM-DD` (or `null`) before the
  request is built and sent verbatim — proving the client → server contract was already
  canonical, so **no frontend change was required or made**. **Root cause:** the backend
  schema accepted `statementDate`/`postingDate`/`fromDate`/`toDate` as
  `z.string().max(32).nullable()` — any string at all — which later reached bare
  `new Date(str)` at 4 live sites (`service.ts` persistence insert and `fromDate`/`toDate`
  derivation, `validators.ts`'s `checkDate`, `dedupDetector.ts`'s `fetchSnapshot`). **Fix:**
  reused the released `dateOnlySchema` (API Date Hardening Pack v1) — no competing validator —
  composed with an extra `.transform()` back to a canonical string (`bankStatementDateOnly`),
  since every downstream consumer in this module treats these dates as `YYYY-MM-DD` strings,
  not `Date` objects. Once the schema guarantees the string is unambiguous, all 4 downstream
  `new Date(str)` calls become safe by construction — none needed to be touched. **Not
  changed:** bank source-file date formats, historical imported records, the dead/test-only
  `parser.ts` mirror, AHLI_UNITED/UNKNOWN `dateFormats` findings, Generic Importer, Payroll
  Bank Import, Prisma schema/migrations. Feature commit `c47c3a7`, merge `60c63a23`.
  Validation: backend `tsc --noEmit` ✅ · `bankStatementImport` module suite 5 files/226 tests
  passing (211 pre-existing + 15 new) · mutation-tested: reverting the fix fails exactly the 8
  tests designed to catch it. Product Owner manual review: approved, release explicitly
  requested.

- **Project-Wide Date Display, Export & Import Consistency Pack v1** (2026-07-31,
  `stable-project-wide-date-display-export-import-consistency-v1`) — frontend + backend,
  no schema changes. Standardizes user-facing calendar-date rendering to `DD/MM/YYYY` across
  Excel/PDF report exports and frontend displays; the canonical internal/API `YYYY-MM-DD`
  contract, timestamps, and machine-readable filename dates are unchanged. **Root cause
  (display/export):** the canonical `formatDisplayDate` helpers already existed but several
  sites bypassed them — raw `toISOString().slice(0,10)` (leaking the wire format to a
  user-facing cell/subtitle, and in one case reading the UTC day instead of local, shifting a
  stored midnight date backward in Kuwait's UTC+3) and `toLocaleDateString('ar-KW')`
  (Arabic-Indic digits + RTL marks). `excelStyle.ts`'s `DATE_FORMAT` was literally
  `'yyyy-mm-dd'`, applied to every real Excel date cell. **Root cause (import):** the
  employees/equipment import validators silently dropped an unparseable date and imported the
  row as valid with the date missing, while sibling validators already raised a row error for
  the identical condition. **Corrective pass (payroll bank import):** `parseDateValue` was
  bare `new Date(String(v))` — a proven MM/DD misread (the backend twin parses the identical
  column from the identical bank templates and was already fixed against this exact literal),
  a UTC-vs-local day shift able to misfile a payroll batch's month, and no Excel-serial
  support; now delegates to the existing `parseFlexibleDate`, hardened with an explicit ISO
  branch and impossible-date rejection. **Explicitly deferred (logged only):** generic
  importer's ambiguous MM/DD compatibility gap, bank-statement server-side date trust, the
  inert backend `payrollBankImport/excelParser.ts` follow-up, `printI18n` dead code, legacy
  salaries bank import. Feature commit `4b5dda7`, merge `174883aa`. Validation: backend
  `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · new/extended tests (dateDisplayConsistency
  17, importDateValidation 11, date.test.ts +10, payrollBankImportParser +12,
  mutation-tested) all passing · affected backend suites 36 files/754 tests passing ·
  affected frontend suites passing. Product Owner manual review: approved, release
  explicitly requested.

- **API Date Hardening Pack v1** (2026-07-31, `stable-api-date-hardening-pack-v1`) —
  backend-only, no schema/frontend changes. Hardens DATE-ONLY API fields to a canonical
  `YYYY-MM-DD` contract. **Root cause:** `z.coerce.date()` passed raw input straight to
  `new Date(value)` — a bare `YYYY-MM-DD` string is unambiguous per ECMA-262, but
  `DD/MM/YYYY`/`MM/DD/YYYY`/a 2-digit year fell into the JS engine's non-standard heuristic
  parser (V8 assumes US `MM/DD/YYYY`), so "2 August" could silently become "8 February" or
  resolve to a silent `Invalid Date` — the same mechanism behind the preceding Printed Cheque
  Edit Date Integrity Fix. **Fix:** one shared validator, `core/utils/dateOnly.ts`
  (`dateOnlySchema`) — canonical-prefix regex match → pure-arithmetic real-calendar-date check
  (no `Date` rollover) → `Date.UTC` construction — applied to 40 DATE-ONLY fields across cheques,
  invoices, equipment, employees, employee-entitlements, holidays, payments, payroll, expenses,
  prices, maintenance, contracts, transactions and accounting, preserving every field's exact
  required/optional/nullable contract. Every frontend caller was traced first and confirmed
  already canonical; no compatibility exception needed. **Intentionally excluded:** attendance
  `checkIn`/`checkOut` (genuine time-of-day, not date-only) and date-range filters (already
  governed by the Backend Date-Boundary Unification Pack v1). Feature commit `1c2eb79`, merge
  `d3a937b7`. Validation: backend `tsc --noEmit` ✅ · 74 test files / 913 tests passing, 0
  failures, across all 16 touched modules + `core/utils` · a static guard confirms no hardened
  schema still uses raw `z.coerce.date()` outside the documented exception · `npm run build:back`
  not run (not materially needed). Product Owner manual review: approved, release explicitly
  requested.

- **Financial Period Custom Range State Fix v1** (2026-07-31,
  `stable-financial-period-custom-range-state-fix-v1`) — frontend-only, no schema/backend changes.
  Fixes `PeriodControl`'s custom-range fields (`customFrom`/`customTo`) going stale: they were seeded
  only in a `useState` initializer, which runs once at mount, while the control stays mounted for a
  page's whole lifetime as the shared `FinancialPeriod` changes underneath it via presets, the month
  selector, or reset. Opening "نطاق مخصص" could show a range left over from an earlier period, with
  Apply silently committing it instead of the currently active one. **Fix:** re-seed
  `customFrom`/`customTo` from `period.fromDate`/`period.toDate` at the same point `monthYear` was
  already being re-seeded — inside `toggleOpen`, only on the transition into `open`; no new state, no
  new hook, no `useEffect`. Preserves the existing "re-seed on open only" contract, so an in-progress
  edit stays stable for the life of one open session. **Verification:** a regression test forces both
  a local re-render (year stepper) and an external period change from outside the panel while it
  stays open — the draft survives both, which a naive `useEffect`-on-`period` fix would not. Feature
  commit `4e4f6ee`, merge `bfcae728`. Validation: frontend `tsc --noEmit` ✅ ·
  `PeriodControlMonth.test.tsx` 27/27 passing (21 pre-existing + 6 new) · reverting the fix fails 3 of
  the 6 new tests · related suites (`financialPeriodSession`, `FinancialPeriodContext`,
  `financialPeriod`, `periodSingleSource` — 53 tests) unaffected · `npm run build:front` not run (no
  new imports/types). Product Owner manual visual review: approved, release explicitly requested.

- **Financial Period Month Selector Pack v1** (2026-07-31,
  `stable-financial-period-month-selector-v1`) — frontend-only, no schema/backend changes. Replaces
  the shared `PeriodControl`'s "سنة محددة" (specific year) section with "شهر محدد" (specific month) —
  12 month buttons producing a complete calendar-month range — plus a compact year stepper in the
  section header. The stepper exists because removing the year buttons would otherwise have removed
  the only one-click path to a historical year (2020–2026), which the brief explicitly forbade
  solving by silently pinning month selection to the system's current year; user chose the stepper
  over a read-only year label or keeping both sections. It seeds from the active period's year on
  each panel open and is clamped to `[2020, currentYear]` — the same reach the old year buttons had.
  **Model:** new `preset:'month'` + `selectedMonth` (0-based) in `lib/financialPeriod.ts`; bounds
  derive from the existing `firstOfMonth`/`lastOfMonth` helpers (no hardcoded month lengths — Feb
  leap-year and Dec year-boundary correctness come from the calendar itself), emitted as local
  `YYYY-MM-DD` strings, no UTC conversion. **Context:** `setMonth(year, month)` added to
  `FinancialPeriodContext`, routed through the same `apply()` path as every other setter — no new
  state, no per-page month state; `'year'`/`setYear` deliberately kept so a session saved before this
  pack still restores. **UI:** month grid replaces the year-button grid, applies immediately and
  closes the panel (matching the buttons it replaces); presets, custom range, Apply, and the CSS
  design language unchanged. **Corrective pass** (found during manual visual review): the Expenses
  page's "year" summary card rendered the literal string `سنة {y}` — an i18n placeholder/variable-
  name mismatch in `lbl.year_prefix` (`{y}` in the string vs. `{ year: … }` passed at the call site),
  predating this pack and unrelated to it. Fixed in both languages. Confirmed the card intentionally
  reflects an absolute current-year window the backend computes with the period filter stripped —
  not the active month selection — so the fix changes only the literal placeholder, not what the
  card reports. A scripted scan of every `t(key, {vars})` call site against its string's placeholders
  found one more instance of the same defect class (`a11y.maint.*_details` in `Maintenance.tsx`, an
  `aria-label`, not visible UI) — logged only, out of scope. Feature commit `45efbb5`, merge
  `867a4889`. Validation: frontend `tsc --noEmit` ✅ · 6 affected period-related test files/85 tests
  passing · full frontend suite matches the documented baseline (25 pre-existing failures, unchanged
  set; +36 new tests, all passing) · `npm run build:front` ✅ · new tests mutation-tested (reverting
  the corrective placeholder fix fails 9/11 new assertions). Product Owner manual visual review:
  approved, release explicitly requested.

- **Backend Date-Boundary Unification Pack v1** (2026-07-31,
  `stable-backend-date-boundary-unification-v1`) — backend-only, no UI/schema changes. Root cause: every
  backend module parsed a user-selected `from`/`to` date-range independently, with three incompatible
  conventions coexisting — `new Date('YYYY-MM-DD')` (UTC midnight, dropping the first 3 hours of the
  range in Kuwait's UTC+3), `endOfDay(new Date(...))` (correct only by accident, on a non-negative UTC
  offset), and a bare `new Date(to)` with **no** `endOfDay` at all (Transactions ledger/list, Audit log —
  truncating the entire final day). The same PeriodControl-selected range could return different rows
  depending on which endpoint answered it. Fixed with one canonical contract —
  `startOfLocalDay()`/`endOfLocalDay()`/`localDateRange()` in `core/utils/dateWindows.ts`, built from
  explicit local calendar components, never dependent on UTC-interpretation of a date-only ISO string —
  and routed every divergent site through it: Expenses, Reports (generic `dateWhere` + 4 sites),
  Accounting, Transactions, Audit, Financial (7 sites, including a previously-unnoticed second bug where
  the GL trial-balance opening-cutoff and period-start were derived independently and could double-count
  or drop journal lines at the boundary), Salaries bank analytics, Employee attendance, Bank statement
  import/reconciliation; Cheques/Invoices routed through the same helper to remove duplicate private
  builders (no behavior change). This is a continuation of the 2026-07-18 Date Boundary Consistency Pack
  v1 (which fixed the `endOfDay`-missing case for financial reports) — this pack closes the remaining
  UTC-vs-local `gte` divergence and the modules that pack didn't reach (Transactions, Audit, Attendance,
  Bank Import). Explicitly deferred (logged, not fixed): `z.coerce.date()` API-boundary hardening, Excel
  `DATE_FORMAT` display cleanup, display-helper consolidation, the "شهر محدد" Month Selector UI change.
  Feature commit `5b87728`, merge `d7f8080a`. Validation: backend `tsc --noEmit` ✅ · backend vitest 149
  files/2155 tests (baseline 144/2102, zero pre-existing failures) · `npm run build:back` ✅ · new
  cross-module parity guards mutation-tested (reverting the fix fails 4/5 new assertions). TZ note: full
  suite verified under this host's actual zone (Asia/Kuwait); a genuine negative-UTC-offset run could not
  be executed (Node ignores `TZ` on this Windows host, no WSL/Docker available) — compensated by writing
  every new assertion against local calendar components rather than absolute UTC instants, plus one test
  that explicitly asserts the pre-pack pattern diverges from the correct contract on any negative-offset
  host. Product Owner manual review: approved, release explicitly requested.

- **Payroll Eligibility Reconciliation Pack v1** (2026-07-30,
  `stable-payroll-eligibility-reconciliation-pack-v1`) — closes two confirmed root causes from the
  Payroll Employee Eligibility & Missing Active Employees audit, reproduced end-to-end via employee
  77 (code 25, احمد رمضان احمد على): ON_LEAVE at July 2026 generation, later reactivated to ACTIVE,
  silently never reappeared in Payroll/Payslip/Reports/NBK export across two periods (2026-07,
  2026-01). **(1) RC-1 — no reconciliation between the frozen payroll snapshot and live employee
  eligibility:** `payroll` rows are materialized once at `generate()` time from `status='ACTIVE'`; an
  employee ON_LEAVE at that instant gets no row, and returning to ACTIVE afterwards creates
  nothing — the grid renders rows, not eligibility, so the omission was completely silent. Fixed via
  `findPayrollEligibilityGap()` (`payrollMonth.readModel.ts`), a strictly read-only reconciliation
  that re-evaluates ACTIVE status against live employee data for the selected period and reports who
  the period's payroll rows do not represent — any status including CANCELLED, and imported bank
  transfers via the same identity resolution the grid already uses, both count as represented.
  Surfaced through `payroll.service.ts`'s `stats()` as additive `missingPayrollCount`/
  `missingPayrollEmployees` fields, deliberately computed ignoring any workflow-status filter so a
  persisted `sal:status` filter can never suppress the warning. `Salaries.tsx` renders it as a named
  amber banner — a warning only; no row is fabricated and nothing is auto-generated or
  auto-approved. **(2) RC-2 — month-wide re-generation lock:** `generate()`'s lock aborted the
  entire transaction on a single non-DRAFT payslip anywhere in the period, so the only recovery path
  for a returning employee (re-generate) required first un-approving every other payslip in the
  month. Fixed by making the lock per-employee: each targeted employee is classified independently
  as CREATE (no row yet), UPDATE (existing DRAFT, unchanged recalculation semantics), or SKIP
  (APPROVED/PAID/other — never read, rewritten, or deleted). Duplicate protection unchanged and
  structural (`@@unique([employeeId, month, year])` + `upsert`); a deliberate re-generate where every
  targeted row is locked still raises the original error rather than silently no-op-ing. Verified
  read-only against `CURRENT_DB` that the fix detects employee 77 as missing in both affected periods
  and would create exactly his row while skipping all 23 currently-approved July payslips. The Ahmed
  regression test was confirmed to fail against the prior month-wide lock via temporary revert, then
  restored passing. **Not changed:** Employee/Payroll Prisma schema, GL/accounting posting (payroll
  still posts no GL entry by existing design), NBK export format, historical payroll data, or
  employee 77's database record. Feature commit `59ed053e`, merge `29e592e1`. Validation: backend
  `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · full backend vitest suite 141 files/2037 tests —
  2037/2037 (19 new + 3 extended) · `npm run build:back` ✅ · `npm run build:front` ✅. Product Owner
  manual visual review: approved, release explicitly requested.

- **Database & Google Drive Runtime Safety Pack v1** (2026-07-30,
  `stable-database-google-drive-runtime-safety-pack-v1`) — closes three operational risks found by
  the Database Source of Truth & Google Drive Sync Safety Audit v1, ahead of manual entry of
  historical 2025 accounting data. **(1) R1 — dev/packaged split-brain lock:**
  `electron/services/runtimeLock.ts`, a cross-environment `~/.manarERP/runtime.lock` keyed on the
  home directory alone (not `dataDir`, which differs between dev and packaged), blocks a second
  manarERP instance from running against a different local database while syncing the same Google
  Drive file — `app.requestSingleInstanceLock()` alone doesn't cover this since dev and packaged have
  separate single-instance locks. `acquireRuntimeLock()` never throws; every failure path returns a
  discriminated `{ok:false, reason:'HELD'|'UNAVAILABLE'}`, and `guardAgainstSplitBrain()` fails
  closed on both (blocks startup) rather than continuing unprotected. **(2) R2 — orphan sync-temp
  cleanup:** `syncTempCleanup.ts` sweeps stale `sync-tmp-snapshot-*`/`sync-tmp-download-*` files
  older than 2h on startup. **(3) R3 — manual/shutdown snapshot consistency:** uploads now snapshot
  via SQLite `VACUUM INTO` (`dbIntegrity.ts`'s `snapshotDatabase()`) instead of a raw file copy;
  `SyncMetadata` gained `lastSyncedLocalHash` to track the live file's own hash separately from the
  snapshot's hash, since the two legitimately differ — without this, `decide()` would see a
  permanent false "local changed" after every upload (self-caught and fixed before any user report).
  **(4) Restore reliability:** local restore (`backup.ipc.ts`) now stops the backend, retries the
  file replace against Windows file-lock errors, and restarts the backend — mirroring the Drive
  restore path. **(5) First-run packaged database bootstrap safety:** `dbBootstrapState.ts` proves
  the template database copied on first run is a pristine seed (not real user data) via two
  independent proofs — an explicit `SEED`/`REAL` state tag, and a template-sha256 fallback closing
  the atomicity gap between the copy and the tag-write — either alone is sufficient, and `REAL`
  always wins permanently. Prevents a false startup-sync `CONFLICT` from uploading a stale template
  over real Google Drive data. **(6) Startup-abort lifecycle guard:** a rejected split-brain check
  now sets `startupAborted` before `app.quit()`, checked in `before-quit` before
  `event.preventDefault()`, so a rejected environment can no longer fall through to
  `performShutdownSync` and upload to Drive. This package went through two rounds of independent
  FINAL REVIEW ONLY audits: round 1 returned `VERDICT: BLOCK` (HIGH-1 — rejected startup could still
  upload; MEDIUM-1 — seed-marking atomicity gap; MEDIUM-2 — runtime-lock fail-open on I/O errors),
  all three fixed in a Corrective Pass with before/after regression proof (each fix was temporarily
  reverted, the new test confirmed it failed, then restored); round 2 returned `VERDICT: APPROVE`,
  with one non-blocking MEDIUM explicitly deferred (M-A — runtime-lock's initial write is not fully
  atomic; a theoretical microsecond-scale simultaneous-start race whose worst outcome is an explicit
  conflict, not silent data loss) alongside a documented non-blocking observation that
  `getUserDataPaths()` has filesystem side effects before the runtime guard runs (verified harmless:
  no existing DB touched, no Drive operation, seed-misclassification risk independently closed by
  `isPristineSeed()`). **Not changed:** frontend, Prisma schema/migrations, accounting/GL, any API
  contract, historical data, or the in-progress Google Drive Deployment Pack v1 OAuth work (present
  in the working tree but explicitly excluded from this release). Feature commit `86eb4114`, merge
  `1e91f12a`. Validation: electron `tsc --noEmit` ✅ · `npm run electron:build` ✅ · backend
  `tsc --noEmit` ✅ · electron vitest 11 files/199 tests — 199/199 (72 new) · frontend untouched
  (electron/backend-only release). Product Owner manual visual review: approved, release explicitly
  requested.

- **Frontend Reliability Pack v1** (2026-07-30, `stable-frontend-reliability-pack-v1`) — bundles
  three independently audited and reviewed fixes uncovered while preparing the system for historical
  2025 data entry. **(1) Scroll Lock Leak Fix:** a shared reference-counted `lockScroll()`/
  `unlockScroll()` (`frontend/src/lib/scrollLock.ts`) replaces independent `body.style.overflow`
  management in `Modal`, `useFocusTrap`/`Dialog` (`ExplorerKit`), and `PrintPreviewDialog`. Root
  cause: when a `Dialog` stacked on an open `Modal` (e.g. `CreateInvoice`'s save-confirmation step)
  closed both surfaces in the same commit, cleanup ran in DOM order rather than open/close order —
  the `Dialog`'s cleanup re-applied `'hidden'` after `Modal`'s had already cleared it, permanently
  locking page scroll. The counter makes unlock order irrelevant. **(2) Historical Data Period
  Reliability Fix v1:** `PeriodControl` is now the single time-range source for Invoices/Expenses;
  removed the local `billingMonth`/`billingYear` table filters that silently ANDed against
  `PeriodControl`'s `issueDate`/`date` range on a different column, making real historical records
  (e.g. `MN-INV-2025-0004`) appear "missing." `FinancialPeriodContext` now persists the selected
  period in `sessionStorage` (survives an in-session reload/HMR without resetting to the current
  year; never `localStorage`, still resets to the safe default on a fresh app launch). Both screens'
  list loads gained a request-id race guard; Excel export now shares the exact filter params as the
  screen. Backend filtering capability, Prisma schema, and the Expense record's own
  `billingMonth`/`billingYear` fields are untouched. **(3) CalendarDayButton Ref Compatibility Fix
  v1:** `ui/button.tsx` (vendored shadcn primitive) now forwards its ref via `React.forwardRef` for
  React 18 compatibility (the vendored file targeted React 19's ref-as-prop convention) — restoring
  `react-day-picker`'s keyboard day-to-day focus navigation inside the date picker, silently broken
  until now. No visual change, no date-semantic change (`DD/MM/YYYY` untouched), no
  `Calendar`/`DateInput`/`DateCalendarPicker` API change. **Not changed anywhere in this release:**
  backend, database, Prisma schema/migrations, accounting/GL, any API contract, invoice/expense
  creation or posting logic, historical data, or the Google Drive sync engine (whose in-progress
  Deployment Pack v1 work was present in the working tree but explicitly excluded from this release).
  Feature commit `060260b6`, merge `f9f3cb86`. Validation: frontend `tsc --noEmit` ✅ · full vitest
  suite 151 files/2415 tests — 143 passed files/2390 passed tests, 8 pre-existing failing
  files/25 pre-existing failing tests (confirmed unchanged vs. baseline via an isolated HEAD-worktree
  comparison, none in this release) + 63 new passing regression tests · `build:front` ✅ (re-verified
  on `production` post-merge, identical) · backend/electron/Prisma untouched (frontend-only release).
  Delivered as three separately AUDIT-ONLY-then-IMPLEMENTATION passes across prior sessions, each
  stopped for visual review before proceeding; Product Owner manual visual review: approved, release
  explicitly requested.

- **Customer Transport Terminology & UI Polish Pack v1** (2026-07-30,
  `stable-customer-transport-terminology-and-ui-polish-pack-v1`) — bundles three separately
  visually-approved changes into one release. **(1) Customer Transport Invoice Terminology
  Finalization v1:** unifies the customer-invoice product term to "فاتورة نقليات" / "Customer
  Transport Invoice" and the direction term to "نقليات عميل" / "Customer Transport" across every
  user-visible surface (statement screens, statement Excel export, reports module, invoice
  validation message, `i18n.ts`). Supplier statements keep "فاتورة مشتريات" / "Purchase Invoice" via
  a display-only entity-scope parameter on the shared `referenceTypeLabel` helper — no new i18n
  keys, no new technical reference type, no change to the shared `referenceType: 'INVOICE'` value
  (API contract/filtering unaffected). Locked in by a new permanent regression test,
  `referenceTypeScope.test.ts` (20 cases). Accounting/GL/Prisma/`SALES`/account 4000/historical
  journal entries entirely untouched by design. **(2) Status-colored row identifiers:** continuing
  the Invoice Number Status Color v1 pattern, the cheque number and employee name (Cheques/Salaries
  tables) now read their row's existing status tone (same `STATUS_META`/`STATUS_TONE` source as
  each row's status chip) and apply it as text color only — no new color, no duplicated status
  logic. **(3) Expenses breakdown show/hide toggle:** reuses the existing `SectionCard` actions slot
  and show/hide pattern (already used on `Prices.tsx`); preference persists via the existing
  `usePersistedState` hook, defaulting to visible. No new design, no data/API/business-logic change
  anywhere in this release. Feature commit `b8a3d2b1`, merge `a6024c8c`. Validation: backend
  `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · `build:back` ✅ · `build:front` ✅ (all re-verified
  on `production` post-merge, identical) · 211/211 targeted backend tests ✅ · 20/20
  `referenceTypeScope.test.ts` ✅ · Claude Code Review: APPROVE (zero CRITICAL/HIGH/MEDIUM) ·
  electron/Prisma untouched (no schema/IPC change). Product Owner manual visual review: approved
  for all three items.

- **Invoice Number Status Color v1** (2026-07-29, `stable-invoice-number-status-color-v1`) — colors
  the Invoices table's invoice-number text with the same tone as its row's status chip. The
  invoice-number column reads its row's `tone` from `STATUS_META` — the same map `invStatusChip()`
  already uses for the chip itself — and applies it via new `.invcx-num--{tone}` classes that point
  at the identical `--xpl-*` CSS variables the chip's own `.xpl-chip--{tone}` rules use. No new color
  introduced, no status logic duplicated; both themes inherit automatically since the underlying
  variables already support both. **Not changed:** the chip's own color/design, table layout,
  business logic, or exported data. Feature commit `aabf0083`, merge `e5bb31df`. Validation: frontend
  `tsc --noEmit` ✅ · `build:front` ✅, both re-verified on `production` post-merge · backend/electron/
  Prisma untouched (frontend-only). Product Owner manual visual review: approved.

- **Customer Drawer / Prices Board / Equipment Data Pack v1** (2026-07-29,
  `stable-customer-drawer-prices-board-equipment-data-pack-v1`) — bundles three separately
  visually-approved changes into one release. **(1) Customer Drawer:** fixes "اسم العميل
  (بالإنجليزي)" wrapping mid-word (`National` → `Nation`/`al`) inside the drawer's two-column info
  grid — `DrawerInfoGrid`/`DrawerField` gain an opt-in `ltr` flag (LTR direction, full drawer width,
  word-only wrapping), auto-applied by `hubTypes.buildInfoItems` to any `nameEn`/`*NameEn` field; no
  other field or module affected. **(2) Prices page:** adds a show/hide toggle for the "لوحة
  الاتفاقيات" table only, via the existing `SectionCard` actions slot — no new component; the
  choice persists in `localStorage['manarERP.prices.agreementsBoard']` across app restarts; the
  mini-table's own data/columns/tabs are untouched. **(3) Equipment Data Pack v1:** adds
  `chassisNumber`/`color` ("رقم القاعدة"/"اللون") as new optional `Equipment` fields (additive
  migration `20260729160000_equipment_chassis_color`); surfaces the pre-existing but previously
  hidden `manufacturer`/`manufactureYear` ("الصنع"/"سنة الصنع") end-to-end; relabels "النوع" to
  "الشكل" (display-only — same `type` field/index/values); updates the import template, header-
  matching aliases, and Excel export for all four fields, with old import files (missing the new
  optional columns) still validating unchanged. Separately, the equipment table now always opens on
  **page 1**, sorted by **"المدة الباقية" ascending**, on every fresh app run — a new
  `ModuleConfig.defaultSort` fallback in `useTableSort` plus a one-time per-run `localStorage` reset
  (`runStartUIState.ts`) gated by a `sessionStorage` flag, so mid-session user page/sort changes and
  every other module's persisted UI state are untouched; `regRemaining` sorts on the very
  `registrationExpiry` field the remaining-days figure is computed from — no parallel calculation.
  An employees table/drawer field audit performed in the same review cycle was read-only; zero
  employees code changed. Feature commit `09e2fa28`, merge `8de53ed3`. Validation: backend +
  frontend `tsc --noEmit` ✅ · `build:back` + `build:front` ✅, both re-verified on `production`
  post-merge with identical results · `prisma migrate status` clean · targeted tests 89/89 passing
  (backend equipment+import 54, frontend explorerHub/prices-toggle/equipment-defaults 35) · Product
  Owner manual visual review: approved for all three changes.

- **Ready-Paper Logo Tint Generalization v1** (2026-07-29,
  `stable-ready-paper-logo-tint-generalization-v1`) — generalizes a prior Salary-Certificate-only
  visual tweak (recolor the ready-paper logo to match the form's own section-header bar color) to
  **every** form on the `ready-paper` print profile: ReturnToWork, SalaryAdvance, Resignation,
  EmployeeWarning, LeaveRequest, ToWhomItMayConcern, PerformanceEvaluation, PurchaseRequest,
  Quotation, and Salary Certificate — confirmed by an actual audit of every `<FormLayout` /
  `PrintProfileToggle` consumer, not a guessed list. PaymentVoucher/AdminPaymentVoucher are
  structurally excluded (hardcoded to the `payment-voucher` profile, no toggle). **Centralized in
  `FormLayout`:** `PRINT_PROFILES['ready-paper'].logoHeader` is `true` on exactly one profile, and
  `FormLayout` now derives `readyPaperLogoTintColor = activeProfile.logoHeader ? SECTION_HEADER_BG :
  undefined` from that same flag, passing it as `FormHeader`'s default `tintColor` — so any current
  or future ready-paper form inherits the tint automatically, no per-page opt-in. The existing
  `logoTintColor` prop (from the original pass) is unchanged and still overrides the default when
  passed explicitly; no new prop or token was introduced. `SECTION_HEADER_BG` (`formStyles.ts`) is
  the same constant already backing the "بيانات الموظف"/"بيانات الراتب" bar color — extracted, not
  retyped, so that bar's own rendering is byte-unchanged. Salary Certificate's own now-redundant
  explicit wiring was removed; its diff against the prior approved state is zero. **Not changed:**
  `plain-a4`/`letterhead` (never render the logo header), `payment-voucher`/`receipt-voucher`
  (`logoHeader: false`, keep the original default tint), logo size/position/crop/margins on any
  profile, the section-header bar's own design, any other form's or the general system logo's color,
  Print Color Mode (explicitly out of scope, deferred). Feature commit `fcd55daf`, merge `8f8990de`.
  Validation: frontend `tsc --noEmit` ✅ · `build:front` ✅, both re-verified on `production`
  post-merge, byte-identical chunk hashes · targeted `readyPaperGeneralization.test.tsx`, 19/19
  passing (3 new tint tests + 16 pre-existing profile-isolation tests) · Product Owner manual visual
  review: approved.

- **Branding Designer Rotation v1** (2026-07-29, `stable-branding-designer-rotation-v1`) — adds
  signature/stamp **rotation** to the Branding Designer, alongside the existing drag/resize/opacity/
  ink-color controls: a new optional `rotation?: number` on `BrandingElementLayout`, normalized to
  `(-180, 180]` by wrapping (not clamping — a continuous circular drag never sticks at the
  boundary). Drag rotates around the element's own center; **Shift snaps to 15°** (read live on
  every pointer move); **double-click resets to 0°**. Wired into both design surfaces
  (`DesignableBrandingImage` for forms/Blank A4/receipt voucher, `UniversalDesignerOverlay` for
  invoice/quotation) plus a rotation slider + 0° reset in `BrandingDesignerPanel` (previously a
  disabled placeholder) and the Settings calibration dialog. **Backward compatibility is
  structural:** `rotation` absent means "never rotated," and the two central transform emitters
  (`brandingElementTransform`, `applyBrandingElementStyle`) emit no `rotate()` term at all for such
  an element — not `rotate(0deg)` — so a pre-existing layout, or one reset back to 0°, produces the
  exact same transform string as before this release, verified byte-for-byte. Transform order is
  fixed at `translate → rotate → scale` in exactly those two functions and nowhere else, which is
  what keeps Screen/Accurate Preview/Print/Saved PDF in agreement without any of those paths
  knowing rotation exists — they all clone the same live DOM. The resize gesture un-rotates the
  pointer delta by the element's own angle so "pull outward" still means grow at any rotation angle.
  Both rotation handles are DOM siblings of the image, never children, so neither inherits the
  image's own transform and `measureRenderScale`'s bounding-rect read stays accurate. **Not
  changed:** the `BrandingLayoutBounds` travel/scale envelope (rotation has no bounds entry — a full
  turn is a full turn on every document), the `print.brandingLayout` settings key or its
  Save/Undo/Redo cycle, Prisma schema, backend routes, IPC channels (frontend-only release),
  Multi-Signature architecture (deferred, untouched). Feature commit `2285cdfa`, merge `67afa7ac`.
  Validation: frontend `tsc --noEmit` ✅ (frontend-only) · `build:front` ✅, both re-verified on
  `production` post-merge, byte-identical · 8 targeted branding test files, 220/220 passing
  (`brandingRotation.test.tsx` new, 57 tests) · Claude Code Review clean (0 CRITICAL/HIGH/MEDIUM,
  independent agent pass) · Product Owner manual visual review: approved.

- **EN+HI Administrative Forms v1** (2026-07-29, `stable-en-hi-administrative-forms-v1`) — adds a
  third document variant — **English + हिन्दी**, one line per field (`English — हिन्दी`) — to five
  administrative forms: Leave Request, Return to Work, Salary Advance, Resignation, Employee
  Warning. Selected per form via a new three-way `FormVariantToggle` (Arabic / English / EN+HI).
  The Arabic and English templates for all five forms are **byte-unchanged**; the new variant lives
  entirely in new `forms/enhi/` template files, chosen by the page — never a third branch inside an
  existing template. `FormDocVariant` (`'ar'|'en'|'en-hi'`) is a type independent of the UI's `Lang`
  (`'ar'|'en'`), resolved to `Lang` only at the shell boundary — no widening of the app-wide i18n
  dictionary type. Built in two reviewed phases: a Leave Request pilot first (corrected after visual
  review from stacked EN/HI sub-lines, which pushed the form to a second page, to **inline single-line**
  pairs separated by a fixed ` — `, restoring one-page A4 output), then rolled out to the remaining
  four forms without touching any pilot-approved shared file (`FormLayout.tsx`'s opt-in
  `docFontStack`/`approvalSecondaryLabels` props, `ApprovalSection.tsx`'s opt-in secondary-label
  rendering, the shared `enhi/shared/` primitives) — each new form's Hindi dictionary lives in its
  own file. **Font:** Noto Sans Devanagari (SIL OFL 1.1) bundled locally as two woff2 weights, no
  CDN, no Windows system-font dependency — layered *after* Cairo in a new `DOC_FONT_STACK_EN_HI`
  stack so Latin/digits stay on Cairo and only Devanagari codepoints fall through; reaches Accurate
  Preview and Save-PDF through the existing `capturePrintStyles`/`absolutizeUrls` mechanism, no new
  preview/print/PDF path. **Hindi dynamic terms:** new sibling module `lib/businessTermsHi.ts`
  (mirrors, does not modify, `businessTerms.ts`) resolves job title/department via new
  `dict.forms.hi.*` Setting keys, falling back Hindi → English → stored Arabic; Company Settings
  gained two dictionary tabs reusing the existing editor. **Not changed:** any Arabic/English form
  template, Employment Contract (isolation re-verified), `Lang`/`lib/i18n.ts`'s dictionary shape,
  `PRINT_PROFILES`, Branding Designer, Ink Color System v2, the composed-document/print-center
  pipeline, backend, Prisma schema. Feature commit `627fbfb`, merge `7ec79643`. Validation: frontend
  `tsc --noEmit` ✅ (frontend-only release) · `build:front` ✅, both re-verified on `production`
  post-merge · 2 targeted test files, 93/93 passing (`leaveRequestEnHiPilot.test.tsx` 44,
  `administrativeFormsEnHiRollout.test.tsx` 49) · full frontend suite last measured at 2156/2181
  passing (same 25 pre-existing unrelated failures), unchanged since and not re-run this release.
  Product Owner manual visual review: approved, in two passes (pilot, then rollout).

- **Multi-Signature & Stamp Persistence Fix v1** (2026-07-29,
  `stable-multi-signature-stamp-persistence-fix-v1`) — fixes a reported defect: saving a second
  signature or stamp in Company Settings did not survive a reload. Root cause, proven against the
  real dev database before any code changed: Multi-Signature & Stamp Management v1's Settings UI
  moved every list edit (add/upload/delete/set-default/show-hide) to local React state only,
  leaving the single top "حفظ" button as the sole writer — any edit not followed by an explicit
  top-level save was silently lost on reload. Every asset-list mutation in `Settings.tsx` now
  persists itself: structural changes write immediately, free-text name/title edits debounce
  800ms (one `PUT` per pause, not per keystroke), writes are queued so two quick edits can never
  land out of order, and every write reads the newest snapshot from a ref rather than a React-state
  closure — closing a race where an edit made during an in-flight image upload could be dropped. A
  pending debounced edit flushes on unmount. List-mutation logic was extracted into pure,
  independently-tested functions in `brandingAssets.ts`; upload errors now render inside the
  specific card that failed; `Date.now()` asset ids replaced with `crypto.randomUUID()`. **Storage
  contract unchanged:** same `print.signatures`/`print.stamps` keys and legacy single-image
  mirrors, no Prisma migration, no change to `CompanyPrintData`/`BrandingLayout`/Branding
  Designer/Ink Color System v2/Preview/Print/PDF — this release touches only how Settings writes
  the two lists it already owned. No multi-selection inside documents (still one signature + one
  stamp per document — unchanged by design, explicitly out of scope). Frontend `tsc --noEmit` ✅
  (frontend-only release); 67 new/updated unit tests plus an 18-check end-to-end scenario against
  the real Express/Zod/Prisma/SQLite stack on a throwaway database copy, all passing; full frontend
  suite 2156/2181 passing, the same 25 pre-existing failures across the same 8 files as baseline
  (zero new regressions); backend suite 138 files/2009 tests unaffected. Product Owner manual
  visual review: approved.

- **Administrative Forms English Translation Completion v1** (2026-07-29,
  `stable-administrative-forms-english-translation-completion-v1`) — closes a real gap: switching an
  administrative/HR print form to English translated static labels only, leaving dynamic business
  values (Job Title, Department, Nationality, Certificate Purpose) displayed in Arabic — e.g. Job
  Title `سائق شاحنة` / Department `السائقين` stayed Arabic under English labels. A single centralized
  resolver (`frontend/src/lib/businessTerms.ts`, `resolveBusinessTerm()`, consumed via
  `useBusinessTerms()` from `stores/settingsStore.ts`) now serves all of them: Arabic mode always
  shows the stored value; English mode resolves the configured translation from Company Settings;
  a missing translation falls back to the stored Arabic value verbatim — never invented at print
  time, no per-form translation map. 9 forms migrated: Leave Request, Return to Work, Resignation,
  Salary Advance, Employee Warning, Performance Evaluation, Salary Certificate, To Whom It May
  Concern, Purchase Request. **Dictionary architecture:** extends the existing Company Settings
  dictionary mechanism (`Setting` table, JSON `{arabic: english}`) under 4 new additive keys
  (`dict.forms.nationalities`/`jobTitles`/`departments`/`certificatePurposes`) — no Prisma migration,
  no destructive change to any existing row. **Employment Contract isolation (data and code, both
  directions):** `businessTerms.ts` does not import `contractTranslations.ts` and owns its own seed
  dictionaries, distinct from the contract's `BASE_JOB_TITLE_EN`/`BASE_NATIONALITY_EN` (different
  casing convention by design). `EmploymentContractTemplate.tsx` and `EmploymentContract.tsx` are
  byte-for-byte unmodified; its dictionary keys (`dict.nationalities`/`dict.jobTitles`) and
  `applyTranslationOverrides()` load-on-mount behavior are untouched. Company Settings' "قاموس
  الترجمة" section now shows two clearly labeled, fully isolated groups on the same shared
  `DictTable` editor — Administrative Forms and Employment Contract — editing one never affects the
  other, guarded by `employmentContractExclusionGuard.test.ts` (11 tests, including explicit
  bidirectional-isolation cases) plus 44 more tests across the resolver and form-rendering suites,
  all new and passing. Feature commit `a2ded11`, merge `f59c5477`. Validation:
  frontend/backend/electron `tsc --noEmit`, Prisma `validate`, `build:front`/`build:back`, backend
  suite 138 files/2009 tests, frontend suite 2146 tests (25 pre-existing failures across 6 unrelated
  files — identical to the pre-pack baseline, zero new regressions), all re-verified on `production`
  immediately after merge. Product Owner manual visual review: **APPROVED**.

- **Employee Entitlements Core, Statement & Final Settlement v1** (2026-07-29,
  `stable-employee-entitlements-final-settlement-v1`) — a four-session build-out landing as one
  release, replacing an older, inconsistent entitlements architecture with a single self-contained
  domain. See the "Employee Entitlements domain" bullet under Active Foundations above for the
  current architecture; this entry records the release event. **(1) Entitlements Core:** one
  canonical calculation engine — `Employee.salary`-only wage base (no allowances, no
  `Payroll.snapshotBaseSalary`), 30 days/year annual leave gated by a 6-month eligibility rule
  (replacing the earlier 9-month rule), accrual counted from the original hire date once eligible
  (not from the eligibility date), daily-wage divisor 26 (an approved manarERP rule, not presented
  as verbatim statute), and calendar-day-safe (UTC-midnight-normalized) date arithmetic so results
  are stable across a whole day. **(2) Statement UI:** "تفاصيل مستحقات الموظف"
  (`EmployeeEntitlementsCenter.tsx`) redesigned into progressive disclosure — financial-position
  hero, annual-leave summary, and payment history visible by default; calculation
  details/EOS-estimate/history collapsed. **(3) Entitlement payments:** create/edit/delete on
  `EmployeeEntitlementLedger` with backend-authoritative, never-clamped overpayment rejection; edit
  validation excludes the payment being edited from the "already paid" total. **(4) Final Settlement
  v1:** new bounded sub-domain (`employee-entitlements/finalSettlement.service.ts`,
  `employee_final_settlements` + `final_settlement_payments` tables) with lifecycle `DRAFT →
  APPROVED (frozen snapshot) → PAID (derived from persisted payments) → CANCELLED (terminal,
  preserved history)`; settlement payment correction re-derives lifecycle status transactionally; a
  SQLite partial unique index (`WHERE status <> 'CANCELLED'`) enforces one active settlement per
  employee while allowing unlimited cancelled history — expressed as raw SQL in migration
  `20260729140000_final_settlement_cancellation` since Prisma's schema language has no partial-index
  syntax (**must be preserved** — invisible to `prisma migrate dev` drift detection). Two additive
  Prisma migrations total, no destructive change to any existing table. **Retired:** the duplicate
  `calculators/legalEntitlementCalculator.ts` re-export shim and the pre-payment-model UI
  (`EntitlementLedgerDialog.tsx`, `LeaveSettlementDialog.tsx`, `entitlementLedgerDisplay.ts`).
  **Not changed:** Payroll, `SalaryPayment`, the NBK export, any Accounting/GL posting, Leave record
  semantics, or `Employee.status` (never written by, and never gates, Final Settlement). Feature
  commit `d745600c`, merge `7408fa05`. Validation: frontend/backend/electron `tsc --noEmit`, Prisma
  `validate`, `build:front`/`build:back`, backend suite 138 files/2009 tests, all passing; Prisma
  `migrate status` up to date post-merge. Product Owner manual visual/functional review: **APPROVED**.
  Gemini final independent review: **APPROVED, READY FOR RELEASE**, no BLOCKER/HIGH/MEDIUM/LOW
  findings.

- **Font Foundation Pack v1** (2026-07-29, `stable-font-foundation-pack-v1`) — two related
  problems solved together across a multi-phase migration: scattered, literally-duplicated
  font-stack strings, and a real architectural gap where Saved PDF output could visually
  diverge from Accurate Preview because PDF export hand-rebuilt its own CSS instead of
  reusing the shared composition pipeline. `frontend/src/styles/fontRegistry.ts` and
  `backend/src/shared/services/reportEngine/fonts.ts` (kept separate — no shared build
  boundary between the two TS programs) now hold the single source of truth for
  `UI_FONT_STACK`/`CHART_FONT_STACK`/`MONO_FONT_STACK`/`DOC_FONT_STACK`/`docFontStack()`/
  `EMBEDDED_DOC_FONT_FAMILY`/`buildEmbeddedFontFaceCss()` — replacing roughly twenty
  duplicated literal font-stack strings across chart components, inline styles, and CSS
  files (three different quoting styles, one computed value). Architectural only: every
  constant equals verbatim what was previously written at its site — no new weight, no
  dropped fallback, no surface's rendered font changed. `FormLayout.doExportPdf` and
  `BlankA4Print.doExportPdf` now both call `composeStyledFromNode` — the same
  clone-and-capture function `useAccurateFormPreview` already used for the Accurate Preview
  dialog — instead of the retired `buildFormPdfDocument`, which hand-rebuilt CSS
  independently and could drift from what Preview showed. The transitional
  `pdfUseComposedDocument` opt-in prop (used across the migration's intermediate phases to
  gate the change form-by-form) is fully removed from `FormLayout`'s props — all 12
  consumers use the unified path unconditionally, no per-form branching left in the shared
  layer. `frontend/src/forms/shared/formPdfDocument.ts` (`buildFormPdfDocument`, zero
  remaining production consumers) and `backend/src/shared/services/reportEngine/pdf.service.ts`
  (dead PDFKit-based builder, zero production consumers, referenced an Amiri-Regular.ttf
  font file that never existed in the repo) are both deleted — PDFKit is fully retired,
  dropped from `backend/package.json`. `--font-ui` renamed `--app-font-ui` across
  `app/theme.css` and 8 dependent stylesheets, matching the existing `--app-font-mono`
  naming convention (namespaced to avoid any future collision with Tailwind v4's own
  theme-layer tokens; confirmed via built-CSS inspection that today's rename has zero
  actual collision, unlike the proven `--font-mono` collision that motivated the `--app-`
  prefix originally). Several tests were rewritten from brittle raw-string assertions to
  `DOMParser`-based behavioral assertions on the actual exported DOM, after root-causing
  that `capturePrintStyles`'s wholesale stylesheet capture legitimately includes inert CSS
  selector text even when no matching element exists in the composed document. Deferred,
  documented, not in scope: IBM Plex Mono font loading (referenced but never actually
  loaded — every use already falls back to system `monospace`, today's approved
  appearance), Template Studio fallback chains, `textStyleOverrides.ts` (a user-facing
  designer choice, not an architectural constant), any new font weight or size/line-height
  change, and a handful of pages whose font stacks are genuinely different from the unified
  constants (`BankAccounts.tsx`, `BankSalaryAnalytics.tsx`, `BankAccountExplorer.tsx`,
  `DateCalendarPicker.css`, `RootErrorBoundary.css`) — unifying those would be a visual
  decision independent of this architectural pack.

  Frontend, backend, and electron `tsc --noEmit`, Prisma `validate`, `build:front`, and
  `build:back` all passed pre- and post-merge. New suites
  `pdfComposedDocumentPilotFidelity`/`pdfComposedDocumentPilotMigration`/
  `pdfComposedDocumentPilotScope` (composition fidelity, all 12 `FormLayout` consumers
  verified off the retired flag, repo-wide sweep for zero remaining references to
  `pdfUseComposedDocument`/`buildFormPdfDocument`). Full frontend suite: 2069/2094 passing
  pre- and post-merge (identical); the 25 failures across 8 files are the pre-existing
  baseline, confirmed unchanged in file and count against `production` HEAD `7942ce88`
  before this branch. Backend suite 135 files/1902 tests unaffected (no backend logic
  touched — only the dead `pdf.service.ts` deletion and the new `fonts.ts` registry).
  Scope review confirmed only the 73 intended files entered the release (2 already-staged
  deletions carried over from earlier phases + 71 added/modified), with unrelated
  pre-existing uncommitted Google Drive Deployment Pack working-tree edits surgically
  excluded. Product Owner Manual Visual Review — completed & approved (Blank A4,
  Quotation, one administrative form, one payment voucher).

- **Ink Color System v2** (2026-07-28, `stable-ink-color-system-v2`) — signature/stamp ink
  color moves from one GLOBAL `localStorage['manar.inkMode']` value (read once by every
  document's `useBrandingDesigner`, so a color picked while designing one document leaked
  into every other document opened afterward) to a PER-ELEMENT field
  (`BrandingElementLayout.inkMode`) inside the existing `print.brandingLayout` Setting —
  the same object `x`/`y`/`scale`/`opacity`/`zIndex` already live on. No second store:
  independence for signature vs stamp and independence per document both fall out of that
  one data-model change, and Save/Reset/Undo/Redo cover color for free (history already
  snapshots the whole layout object). `original`/`black` unchanged. Four new realistic
  ballpoint-blue shades — Dark (`#12276B`), Medium (`#1F3F94`), Royal (`#2A52BE`),
  Blue-Violet (`#3D3B8E`) — render via SVG `feColorMatrix`, the SAME technique already
  shipped and print-verified in `FormHeader.tsx`'s logo recolor: a constant-matrix recolor
  targets every non-transparent pixel to the exact ink RGB while leaving the ALPHA channel
  completely untouched, so antialiased edges and transparency-encoded density survive
  exactly as before (verified by a test asserting the matrix's alpha row is a pure
  passthrough). The source image file is never touched. Legacy `blue-ink` keeps its exact
  old CSS `sepia(100%) saturate(200%) hue-rotate(190deg)` filter, unreachable from the new
  picker but still resolvable for backward compatibility. An element with no saved
  `inkMode` (every pre-v2 document) resolves through `resolveInkMode()` to the legacy
  `localStorage` default — now read-only, never written going forward — so no existing
  design's appearance changes silently; `resetElement`/`resetDoc` explicitly write
  `inkMode: undefined` (not a hardcoded color), fixing two latent bugs surfaced while
  wiring this through: `clampBrandingElementLayout` reconstructed its return object from
  an explicit field list that would have silently dropped `inkMode` on every clamp, and a
  merge-patch reset cannot clear a key it never mentions. The shared `BrandingDesignerPanel`
  gained a per-element color-swatch picker — operating on `docLayout[selected].inkMode` via
  the same `updateElement` call every other property already uses — with live preview, no
  parallel Design Mode or color engine; because Invoice, Quotation, all ten administrative
  forms, and Blank A4 Free Print all render this same panel, every document type is covered
  by this one change. Each colored image's SVG `<filter>` definition renders as a DOM
  sibling of that image, so PDF export and the accurate preview (both clone the printable
  subtree, not the whole document) carry the color with them. `CompanyPrintData.inkMode`
  (the single field this supersedes) was removed cleanly from the type and both print-data
  builders. No backend, Prisma, or `print.brandingLayout` Setting-key change.

  Frontend, backend, and electron `tsc --noEmit` and `build:front` passed pre- and
  post-merge. New `inkColorSystem` suite: 26/26 (backward-compat fallback resolution, SVG
  filter defs, signature/stamp independence, geometry untouched, storage round-trip,
  coverage across every branding-enabled document type, Undo/Redo). Full frontend suite:
  2019/2044 passing pre- and post-merge (identical); the 25 failures across 8 files are
  the pre-existing baseline, confirmed unchanged in file and count against `production`
  HEAD `4b2e2073` before this branch. Backend suite 135 files/1902 tests unaffected (no
  backend files touched). Scope review confirmed only the 15 intended files (all under
  `frontend/src`) entered the release, with unrelated pre-existing uncommitted Google
  Drive Deployment Pack working-tree edits surgically excluded. Product Owner Manual
  Visual & Physical Print Review — completed & approved.

- **Blank A4 Free Print v1** (2026-07-28, `stable-blank-a4-free-print-v1`) — a blank A4
  administrative form for stamping a company signature/stamp over an externally
  pre-printed page loaded in the printer. Reuses the Multi-Signature & Stamp
  system and Design Mode verbatim (`useCompanyBranding`/`useBrandingSelection`/
  `BrandingAssetPicker`/`useBrandingDesigner`/`BrandingDesignerPanel`/
  `DesignableBrandingImage`) — no parallel design engine. Deliberately bypasses
  `FormLayout`/`ApprovalSection`, which always render a title, form-number, QR
  and approval label with no opt-out; the new page composes the same
  lower-level building blocks directly, so the sheet carries only the
  signature/stamp. The sheet element IS the physical page — `210mm × 297mm`,
  `@page margin: 0`, `padding: 0` — giving Design Mode, the accurate preview,
  PDF export, and physical print one shared coordinate system; the print CSS
  asserts this geometry (`height: 297mm !important`) rather than relaxing it,
  fixing a review-round defect where a relaxed height collapsed the sheet's box
  (all children absolutely positioned) and pulled the signature/stamp into the
  header band across physical print and the accurate preview alike, and a
  second defect where 10mm `@page` margins left only a 277mm printable band
  for a 297mm sheet, producing a spurious second page in both physical print
  and PDF. Movement is widened for this document only, via one documented,
  closed per-document exception (`BOUNDS_BY_DOC` → `blank-a4-print`) resolved
  through `getBrandingLayoutBounds(docType)` — derived from the sheet's real
  210×297mm dimensions and the two element anchors (not picked numbers), read
  by every control path (drag, resize, sliders, undo/redo, save, and the
  render-time display transform) so a saved position is never clamped
  differently than it was edited. The shared central envelope
  (`BRANDING_LAYOUT_BOUNDS`, ±150px/0.2–4×) is unchanged for every other
  document. Four screen-only cm rulers (one per edge, 1mm/5mm/1cm graduation,
  matching the sheet's own coordinate origin) are DOM siblings of the
  printable sheet, not descendants, so they are structurally absent from
  every export path regardless of CSS. No backend, Prisma, `FormLayout`, or
  `ApprovalSection` change; the ink-color filter system was audited during
  this release cycle and explicitly deferred to an independent future pack
  (it is a global setting shared by every document, not scoped to this
  feature).

  Frontend, backend, and electron `tsc --noEmit` passed pre- and post-merge.
  Full frontend suite: 1993/2018 passing pre- and post-merge (identical); the
  25 failures across 8 files are the pre-existing baseline, confirmed
  unchanged in file and count against `production` HEAD `cdf86d7d` before
  this branch. Backend suite 135 files/1902 tests unaffected (no backend
  files touched). Scope review confirmed only the 13 intended files (all
  under `frontend/src`) entered the release, with unrelated pre-existing
  uncommitted Google Drive Deployment Pack working-tree edits surgically
  excluded. Product Owner Manual Visual & Physical Print Review — completed
  & approved.

- **Multi-Signature & Stamp Management v1** (2026-07-28,
  `stable-multi-signature-stamp-management-v1`) — central system for registering
  multiple signatures and multiple stamps, choosing which one (or none) prints on
  each document, and designing its position/size independently per document.
  Assets (`BrandingAsset` lists) live under `Setting` keys `print.signatures`/
  `print.stamps` — same key/value table, no Prisma change; legacy single-image
  keys are kept as mirrors of the default asset for backward compatibility.
  `useBrandingSelection`/`BrandingAssetPicker` give the per-document choice
  (independent of layout); wired into Quotation, Invoice, Receipt Voucher, and
  nine administrative forms via `FormLayout`'s opt-in `approvalBranding` prop.
  Design Mode was generalized from the pre-existing Quotation/Invoice designer
  to all ten document types via one `BrandingDocKey` union and an optional
  per-document entry in the existing `print.brandingLayout` Setting — an
  undesigned document has no entry and renders exactly as before. Resize is a
  single uniform `scale`, so aspect ratio cannot change. Bounds were trialed on
  Salary Certificate alone, then adopted as one central envelope
  (`BRANDING_LAYOUT_BOUNDS`: x/y ±150, scale 0.2–4) for every document, with the
  superseded Phase-4 bound constants removed. Payment Vouchers and Employment
  Contract are explicitly excluded (no company approval slot / asymmetric
  footer). No backend, Prisma, or API change. **As of Multi-Signature & Stamp
  Persistence Fix v1 (2026-07-29):** every Settings list edit (add/upload/
  delete/set-default/show-hide) writes immediately instead of waiting for the
  page's top-level save — see that release entry above for the fix itself.

  Frontend, backend, and electron `tsc --noEmit` passed pre- and post-merge.
  Full frontend suite: 1971/1996 passing pre- and post-merge (identical); the
  25 failures across 8 files are the pre-existing baseline, confirmed unchanged
  in file and count against `production` HEAD `763d0881` before this branch.
  Backend suite 135 files/1902 tests unaffected. Scope review confirmed only
  the 33 intended files (all under `frontend/src`) entered the release, with
  unrelated pre-existing uncommitted Google Drive Sync/electron-builder edits
  surgically excluded. Product Owner Manual Visual Review — completed &
  approved.

- **Unified Accurate Preview v1** (2026-07-28, `stable-unified-accurate-preview-v1`) —
  removed the "regular" print-preview overlay (the `useLegacyFormPreview` hook and the
  direct `PrintPreviewDialog`/Print-Center-Phase-2 wiring in Receipt Voucher, Quotation,
  and the Invoice) from every form; the accurate WYSIWYG preview
  (`useAccurateFormPreview` / `WysiwygPreviewPocDialog`) is now the sole preview path
  across all 16 form pages. The Print button now calls each page's print function
  directly — the same "flag OFF" behavior already verified for every form in the prior
  rollout. Printing, PDF export, print profiles, and form content are byte-for-byte
  unchanged. Cheque calibration test-print preview (an independent physical-measurement
  tool) is untouched, out of scope. Cleaned up the now-dead `PRINT_PREVIEW_LEGACY_FORMS_*`
  / `PRINT_CENTER_PHASE2*` flags, their barrel exports, orphaned i18n keys, and
  tests whose entire premise was the removed overlay (3 files deleted, 8 trimmed).

  Frontend and backend `tsc --noEmit` passed pre- and post-merge. Full frontend suite:
  1857/1882 passing pre- and post-merge (identical); the 25 failures across 8 files are
  the pre-existing baseline (calibration-ink-isolation, financial-table, and
  translation-key-audit tests unrelated to printing, plus two already-stale literal-text
  assertions from an earlier i18n key-extraction pass) — confirmed unchanged in file and
  count against `production` HEAD `5e944ef` before this branch. Product Owner Manual
  Visual Review — completed & approved.

- **Administrative Payment Voucher v1** (2026-07-28,
  `stable-administrative-payment-voucher-v1`) — new manual-entry "سند صرف" (Payment
  Voucher) card on the Forms page, fully independent of Cheque Management.

  Reuses `PaymentVoucherTemplate` and its dedicated, non-selectable `payment-voucher`
  print profile verbatim (same header, fields, formatting, Arabic/English toggle) —
  no duplicate design. `ready-paper` was audited and rejected as a fit: its 40mm top
  margin is reserved for an overlay letterhead over pre-printed paper, while Payment
  Voucher uses its own compact 12mm/15mm margins with an in-flow logo header, so mixing
  them would break the voucher's tuned layout. The template gained one additive prop,
  `paymentMethod?: 'cash' | 'cheque' | 'transfer'` (default `'cheque'`), so the checkbox
  row can reflect a manually chosen method — the Cheques flow never passes it, so its
  render is byte-for-byte unchanged. Client-side form numbering via
  `generateFormNumber('payment-voucher')` (prefix `PV`), the same no-backend convention
  Quotation and Purchase Request already use — no Prisma/migration/backend change. The
  new page makes no `/cheques` API calls and touches no `PrintedCheque`/
  `markVoucherPrinted` state; a dedicated test asserts this.

  Frontend and backend `tsc --noEmit` and the full frontend suite (1989/2016 passing;
  the 27 failures across 8 files are the pre-existing baseline, confirmed identical
  file-for-file and count-for-count against `production` HEAD `ec8a637` before this
  branch) passed pre- and post-merge. Product Owner Manual Visual Review — completed
  & approved.

- **Ready Paper Print Template & Receipt Voucher Redesign v1** (2026-07-28,
  `stable-ready-paper-template-and-receipt-voucher-redesign-v1`) — two related, visual/
  print-layout packages, developed and approved together in one review round.

  **Ready Paper ("ورق جاهز").** New selectable `PRINT_PROFILES` entry: margins byte-identical
  to `letterhead` (`40mm 10mm 20mm 10mm`) but with its own `logoHeader` flag driving the
  official letterhead centrally through `FormLayout`/`FormHeader` — no
  `profile === 'ready-paper'` checks scattered per form, so any current or future form that
  renders through `FormLayout` inherits it automatically. Uses a page-level header model
  (`@page` margin `0`, the same margin values re-applied as `.form-page` padding) so
  `.form-page` models the physical A4 sheet and the letterhead — an absolutely positioned
  overlay contributing zero flow height — can occupy the sheet's top band without ever
  pushing form content down or adding a page. Reuses the existing `logohead.png`/tint-filter/
  centering pipeline as-is, adding only a CSS-only vertical crop of the PNG's transparent
  top/bottom padding (measured: ink occupies rows 59–221 of 268) so the header's box matches
  the visible artwork — no resize, same aspect ratio, same file. Preview offset `2.5mm`;
  print-only compensation (`top: 5mm`, uniform `scale(0.93)`, `transform-origin: top center`)
  works around printer-driver hardware non-printable edge bands — confirmed against a real
  paper print, not just preview/PDF. The Forms hub's print-template dropdowns
  (`frontend/src/pages/Forms.tsx`) now derive their options from
  `SELECTABLE_PROFILE_IDS`/`PRINT_PROFILES` instead of a separate hardcoded `PrintMode` enum,
  so Ready Paper appears automatically with no per-form wiring. Employment Contract stays
  fully exempt (`excludeIds=['ready-paper']` on its toggle; it never routes through
  `FormLayout`). A new generalization-guard test suite
  (`frontend/src/__tests__/readyPaperGeneralization.test.tsx`) audits every page's source for
  per-form ready-paper logic and pins the approved geometry values and exemptions.

  **Receipt Voucher redesign (visual only).** Plain-text company-name header replaced with
  the same shared logo treatment (`FormHeader`'s new `cropTransparentPadding` prop — the same
  transparent-padding crop as Ready Paper, but kept fully in-flow with no page-level model,
  so `PrintProfile` is untouched), divider line under it removed. `ApprovalSection` now uses
  `hideDate` + `stampInline`, the same combination Salary Certificate uses, dropping the
  static `____ / ____ / ______` date placeholder and raising the stamp onto the signature
  row. The separate "Accountant"/"Finance Manager" signature columns in
  `ReceiptVoucherTemplate.tsx` are removed, keeping only "Receiver". No business logic,
  voucher data, calculations, print pipeline, or backend change.

  Frontend and backend `tsc --noEmit`, both production builds, and the full frontend suite
  (1976/2003 passing; the 27 failures across 8 files are the pre-existing baseline, confirmed
  identical file-for-file and count-for-count against `production` HEAD `80f937b` before this
  branch) all passed pre- and post-merge. Verified end-to-end on the real running app
  (Playwright against the dev server) across four forms plus one physical paper print of
  Salary Certificate. Product Owner Manual Visual Review — completed & approved.

- **Sidebar Visibility Management v1** (2026-07-27,
  `stable-sidebar-visibility-management-v1`) — new "Sidebar Management" section in Settings
  (`frontend/src/pages/Settings.tsx`) lets a user show/hide individual sidebar navigation
  entries. Display preference only: a new pure filtering module
  (`frontend/src/config/navVisibility.ts`) derives both the Settings toggle list and the
  sidebar's own render from the single existing `NAV` array in
  `frontend/src/config/modules.tsx` — no second hardcoded nav list. Preferences key off each
  item's existing stable `key` (never label/index/order), so relabeling or reordering `NAV`
  never breaks a saved preference. Permissions strictly outrank the preference
  (`visible = permission-allowed && not hidden`; the toggle list itself is pre-filtered by
  permission, so a switch is never shown for a page the user cannot access). Persisted via a
  new `hiddenNavKeys` array on the existing `uiStore` Zustand store, backed by `localStorage`
  — the same mechanism already used for the sidebar collapse/expand preference; no new storage
  mechanism, schema, migration, or backend change. Every existing user sees 100% of today's
  sidebar unchanged by default. `settings` itself cannot be hidden (it is the only path back to
  this control). A sidebar group left with zero visible items renders no heading; a "Show all
  pages" action resets to default. No route, permission key, RBAC, business-logic, schema, or
  backend change of any kind. Frontend and backend `tsc --noEmit`, both production builds, the
  new 21-test sidebar-visibility suite, and the full frontend suite (pre-existing 27-test
  baseline unchanged) all passed pre- and post-merge. Product Owner Manual Visual Review —
  completed & approved.

- **Payment Voucher Visual Polish & English Localization v1** (2026-07-27,
  `stable-payment-voucher-visual-polish-english-localization-v1`) — four small, visual/
  presentation-only changes to the Payment Voucher form only
  (`frontend/src/forms/PaymentVoucherTemplate.tsx`,
  `frontend/src/forms/shared/FormHeader.tsx`): the title box background now matches the
  "Beneficiary" field's shade (`#eef0fb`); the amount-in-figures color switched from red to
  the brand navy/purple (`#2b2e83`); the `logohead.png` logo header is recolored to the same
  brand navy/purple via an SVG `feColorMatrix` filter and widened symmetrically (measured and
  verified live via Chrome DevTools, not guessed) so the visible mark+wordmark reach the same
  bounds as the form's content, without touching the source file or cropping any text; and
  English localization (`lang === 'en'`) for Cash/Cheque/Transfer/Bank/Cheque No./KWD labels
  plus the dynamic bank name (presentation-only, via the existing `t()`/`bankLabel()`
  mechanism — stored `bankName` never modified), with the Arabic output unchanged
  byte-for-byte. `useLogoHeader` (the shared `FormHeader.tsx` branch this touches) has exactly
  one consumer project-wide — `PaymentVoucher.tsx` — confirmed by grep before release, so no
  other form is affected. No business logic, calculations, saved data, approval workflow,
  permissions, API/backend, Prisma/schema/migration, or accounting/GL changes. Frontend
  `tsc --noEmit` and the `paymentVoucherBatchSafety` test suite (8 tests) passed on both the
  feature branch and the merged `production` branch. Product Owner Manual Visual Review —
  completed & approved.

- **NBK Salary Export — Native XLS Generation v1** (2026-07-27,
  `stable-nbk-salary-export-native-xls-v1`) — replaces SheetJS as the final writer for the
  NBK bank salary export ONLY (every other Excel export untouched) with native Microsoft
  Excel COM automation, fixing an Office File Validation Protected View warning that every
  SheetJS-generated NBK `.xls` triggered regardless of input quality — proven across three
  diagnostic rounds: a native-Excel-COM control file opened clean while the SheetJS output
  didn't; patching the CFB root-entry name/CLSID alone was insufficient; feeding the
  pristine bank-provided original workbook through SheetJS still triggered the warning,
  isolating SheetJS's `write_biff8` itself as the sole cause. New canonical, PII-free
  template (`backend/assets/nbk-export/NBK_Salary_Native_Template.xls`, built from the
  archived original via Excel COM with all 17 historical rows removed and doc metadata
  stripped — verified 0/17 name/Civil-Id/account leaks before shipping) plus a PowerShell
  COM writer (`generate-nbk-xls.ps1`) that always creates its own Excel instance (never
  attaches to or kills an existing/interactive Excel process by name), validates the
  template's sheets/headers by name and fails closed on any mismatch, and always
  `Quit()`s/releases COM via `try/finally`. `PayrollBankExport.tsx` calls the native bridge
  first and never falls back to SheetJS on failure — the old SheetJS path stays reachable
  only when `window.manar` is entirely absent, proven structurally impossible in the
  packaged app (the preload script that defines it is attached unconditionally to the only
  window that ever loads the React bundle). No payroll/accounting/GL/Prisma changes.
  Backend/frontend/electron `tsc --noEmit`, electron NBK tests (13), frontend NBK tests
  (15, including a dedicated no-silent-fallback safety test), and the full backend
  payroll/payrollBankExport suite (200 tests) all passed. Product Owner manual
  visual/security review in Microsoft Excel — completed & approved, Protected View
  confirmed absent.

- **Payroll Multi-Select Approval & Unapprove v1** (2026-07-27,
  `stable-payroll-multi-select-approval-unapprove-v1`) — checkbox multi-select on the payroll table
  (`Salaries.tsx`): header checkbox selects all eligible **visible** rows, imported/read-only rows are
  never selectable. A selection toolbar drives the SAME per-record `/approve` endpoint for bulk approval
  (one PATCH per id via `Promise.allSettled`, no new bulk endpoint) — selecting one row behaves exactly
  like the pre-existing single-record button. New backend action `PATCH /payroll/:id/unapprove` reuses the
  `payroll.approve` permission (mirrors `expenses.amend`/`expenses.approve`) and reverts APPROVED → DRAFT
  only (rejects DRAFT/PAID/CANCELLED), clearing `approvedAt`/`approvedById` in a transaction with
  `approvalEngine.recordTransition` + an audit log entry — no GL reversal needed since payroll approval
  itself never posts a journal entry. Frontend adds an individual drawer "إلغاء الاعتماد" button plus the
  bulk bar (same labels/icons as existing actions). Bulk results never report silent partial success — full
  success shows green, anything else shows a red banner with success/failed counts; table/stats always
  refresh once, selection always clears, and the existing page-wide `busy` flag blocks repeated clicks. No
  Prisma schema/migration/permission-matrix changes. Backend `tsc --noEmit`, frontend `tsc --noEmit`, and
  the full payroll test suite (200 tests) passed both pre-merge and post-merge. Product Owner visual review
  — completed & approved.

- **Repository Cleanup, Documentation & Tooling Pack v1** (2026-07-27,
  `stable-repository-cleanup-documentation-tooling-pack-v1`) — docs/tooling-only release, zero business
  logic/API/schema/runtime changes, closing out a multi-phase working-tree cleanup. Commits 125 files
  (insertions only): `docs/superpowers/plans|specs|reports/` history (53 files) for already-shipped
  features that were never committed; six standalone audit documents (architecture review, forms
  inventory, project history, pricing audit, full releases audit, i18n audit); official AlManar company
  forms reference PDFs; four dev tooling scripts (`smoke-electron`, `extract_forms_png`,
  `full-operational-reset`, `translation-audit`); five historical cheque-backfill/verification scripts
  kept as a reproducibility record for a one-time data operation already executed against production; and
  `docs/html/` + `generated-forms/` print-ready form templates, already documented as real deliverables in
  the committed `FORMS_INVENTORY_REPORT.md`. Genuine unreleased in-progress work found during the audit
  (dashboard accessibility polish, cloud sync progress dialog wiring, an incomplete Professional Forms
  Designer schema) was preserved on three separate WIP branches, none merged. Files containing real
  financial/personal data (a cheque-backfill source spreadsheet, an employee civil-ID list) were archived
  outside the repository rather than committed. A handful of superseded/incomplete print-template design
  prototypes were also archived outside the repository, deliberately deferred rather than decided in this
  pack. `git diff --check` clean; full name-status review confirmed zero frontend/backend/electron/Prisma
  files in scope. Product Owner explicitly authorized direct production release for this non-visual pack.

- **UI Controls Consistency & Topbar Refresh Pack v1** (2026-07-26,
  `stable-ui-controls-consistency-topbar-refresh-pack-v1`) — three Product-Owner-approved UI polish
  changes bundled together, no business logic/API/refresh-mechanism changes. **(1) PeriodControl:**
  removed the static "الفترة المعروضة:" prefix from the period-selector label across every page using the
  shared `PeriodControl` (Invoices — the original reference — Dashboard, Cheques, Expenses, Reports,
  Accounting ×2, FinancialCenter, ExecutiveDecisionCenter), via a new opt-in `hideLabelPrefix` prop
  (default `false`, so any consumer that omits it is unaffected) that reuses the component's existing
  bare-range i18n key (`fc.period.range_bare`) — date range/calendar icon/chevron/state logic unchanged.
  **(2) Excel export buttons:** generalized the Prices.tsx-approved design (label reduced to the literal
  word "Excel", existing icon kept, icon+text recolored `#217346` only while idle — busy/loading states
  untouched) to every genuine Excel-export button found in a full-codebase sweep — `Reports.tsx` (both its
  drawer button and dropdown item), `Expenses.tsx`, `Salaries.tsx`, `ResourcePage.tsx`,
  `DocumentExpirationCenter.tsx`, `BankSalaryAnalytics.tsx`, `PayrollBankImport.tsx`,
  `BankReconciliation.tsx`, plus the shared `ExportExcelButton.tsx` component (covers `Invoices.tsx`,
  `ResourcePage.tsx`'s legacy skin, `MonthlyReportModal.tsx`) and `financial.css`'s `.export-btn.excel`
  rule (covers `ExportBar.tsx`, consumed by `FinancialCenter.tsx` and `FinancialReportsTab.tsx`).
  Excluded after inspection as not actually Excel-export buttons: `DocumentExpirationCenter.tsx`'s generic
  "export current results" action, `GenericImporterView.tsx`'s blank-template download,
  `BankStatementImport.tsx`'s import path, `Integrations.tsx`'s descriptive metadata.
  **(3) Topbar refresh:** relocated the Dashboard's spinning refresh icon from beside
  `PeriodControl`/"آخر تحديث" to the main topbar next to the privacy/lock toggle, recolored to the
  system's primary purple (`#6366f1`, same value as `--xpl-primary`, hardcoded since that CSS variable is
  scoped to `.xpl-scope` and unavailable in the global topbar). Same `refreshKey`/`refreshing`/
  `initialLoading` state and the same `.retry-loader` animation still drive it — only the trigger surface
  moved, via a new minimal `uiStore.ts` registration slice (`topbarRefreshHandler`/`topbarRefreshBusy`/
  `setTopbarRefresh()`) that `Dashboard.tsx` populates on mount and clears on unmount, so the icon still
  only shows while Dashboard is mounted. Unrelated, pre-existing uncommitted working-tree edits (a
  `Dashboard.tsx` accessibility pass, plus `AlertPanel.tsx`/`LatestInvoicesTable.tsx`/`Skeleton.tsx`/
  `dashboard.css`/`schema.prisma`/`syncEngine.service.ts`) were surgically excluded from this release's
  commit and left untouched in the working tree. Frontend `tsc --noEmit` ✅ (frontend-only release; no
  schema/backend/electron changes). Product Owner visual review: **approved**.

- **Forms QR Human-Readable Formatting Fix v1** (2026-07-26,
  `stable-forms-qr-human-readable-formatting-fix-v1`) — fixes phones displaying raw JSON when scanning a
  printed form's QR code. Root cause: `FormQRCode.tsx` encoded `QRData` via `JSON.stringify(data)`, so a
  phone camera/QR reader surfaced `{"formType":"...","formNumber":"...","entityName":"...","entityId":...}`
  verbatim instead of anything human-readable. **Formatting only, same approved data:** the exact same four
  `QRData` fields the prior Barcode Payload Standardization Pack v1 established (`formType`, `formNumber`,
  `entityName`, `entityId?`) are now rendered as labeled Arabic lines instead of JSON before being handed to
  the `qrcode` encoder; `formType`'s technical slug (e.g. `salary-certificate`) displays as the same Arabic
  title already shown on that exact form's own header (sourced verbatim from the existing `i18n.ts`
  `page.*.title`/`voucher.receipt.title` keys and `printProfiles.ts`'s `labelAr` for `payment-voucher` — no
  new wording invented); `entityId` appears as a labeled "الرقم المرجعي" line when present and is omitted,
  never invented, when absent. **Scope correction: 13 formTypes use `FormQRCode`**, not 12 — the 12 forms
  registered in `formsRegistry.ts`'s `FORM_CARDS` plus **Payment Voucher**, which calls `FormQRCode` via
  `FormLayout` but is reached from the Cheques module rather than the Forms hub and so is not itself a
  `formsRegistry.ts` entry (the pre-existing "12 official forms" figure elsewhere in this document is the
  unrelated `formsRegistry.ts` count, unaffected by this correction). The fix lives in one file
  (`FormQRCode.tsx`) and applies to all 13 automatically — none of the 13 call sites were touched. **Not
  changed:** the `QRData` interface, any of the 13 forms' data/props/business logic, QR size/position/
  color/margin/error-correction, the `formNumber` caption below the QR image, or the Print/Preview/Exact
  Preview/PDF pipelines (all consume the same rendered `<img>`). **Excluded — documented for a future pack:**
  Invoice's `DocumentVerificationQR` still encodes a bare `verificationUuid` (same class of complaint), but
  its fix needs a hybrid payload design that keeps the UUID extractable for the real, public
  `GET /api/verify/:uuid` endpoint — deliberately out of scope here; Template Studio's per-template
  `qr`/`barcode` designer elements (user-configurable single-field binding, not a fixed document payload)
  are also unaffected and out of scope. Frontend `tsc --noEmit` clean (frontend-only release); new
  `formQRCodeHumanReadable.test.tsx` 18/18 tests passing; targeted regression run 6 files / 117 tests
  passing (`documentVerificationQR`, `employmentContractNewEmployee`, `legacyFormPreviewRolloutPhase1/2`,
  `printWorkspace`, plus the new suite); 1 pre-existing/unrelated failing file
  (`formsRegistryTranslationAudit.test.ts`, 10/39 assertions) reconfirmed identical via `git stash` against
  the pre-change baseline. Release executed manually by the Product Owner — phone-scan verification of the
  actual QR output: **approved**.

- **Bank Statement Order Preservation & Current Balance Fix v1** (2026-07-26,
  `stable-bank-statement-order-preservation-current-balance-fix-v1`) — restores a previously-completed,
  previously-validated fix (original commit `2322802`, 2026-07-23) that was found — during a Regression &
  Release Integrity Audit — to have been committed and pushed to its own feature branch but **never
  merged into production**, so the bug it fixed had silently kept shipping. Business rule: official bank
  statement files are ordered newest → oldest, so the first data row of the most recently imported
  statement is the true current/closing balance — not whichever row happens to have the max
  `statementDate`, since a file can contain repeated dates or a row order that doesn't match chronological
  sequence. Adds `statementSequence` to `BankStatementTransaction` (1-based row position within its own
  import file, set at import time from the parser's own file-order index); a migration backfills existing
  rows per `importId` using insertion order (`id asc` — the original file order at insert time), additive
  and idempotent (`WHERE statementSequence IS NULL`), touching no financial column. `TIMELINE_ORDER_BY`
  now sorts by latest import then `statementSequence asc`, reproducing the bank's original file order
  exactly instead of sorting by date. `bankAccounts` current/closing balance now reads the first-sequence
  row of the latest import instead of the max-`statementDate` row. Re-verified before this release: zero
  drift against current production in every touched file (cherry-picked the original commit onto a fresh
  branch off current production — clean, zero conflicts, byte-identical diff); the dev database had
  coincidentally already had this exact migration applied from an earlier stray run, confirmed via
  `prisma migrate status` (clean, in sync) rather than assumed; and — proven against real data, not just
  in theory — one account's latest import genuinely has multiple rows sharing the same `statementDate`,
  where the old logic and new logic pick different rows with different balances (45,290.42 vs the correct
  58,120.42). No UI, business logic, or financial data changed — frontend Bank Account Explorer untouched.
  Backend `tsc --noEmit` ✅, `prisma validate` ✅, `prisma migrate status` clean ✅, bank-related `vitest`
  7 files / 228 tests ✅, full backend suite 135 files / 1902 tests ✅, backend build ✅; frontend
  `tsc --noEmit` ✅ and Bank Account Explorer–related `vitest` 4 files / 39 tests ✅ (unaffected, as
  required). Product Owner visual review of balance and Timeline: **approved**.

- **Forms i18n Completeness & Regression Protection Pack v1** (2026-07-26,
  `stable-forms-i18n-completeness-regression-protection-pack-v1`) — closes a raw-i18n-key regression that
  had already been patched twice before and kept coming back. Root cause (found via a dedicated
  Regression & Release Integrity Audit): commit `d226365` "English Localization Completion Pack v2"
  (2026-07-21) converted hardcoded strings in six forms to `t('...')` calls without adding the matching
  `DICT.ar`/`DICT.en` entries; two later fixes (`699a63b`, `0850cc1`) each patched only that form's
  *title* key, never the body content (field labels, placeholders, buttons, options) — so the same class
  of bug kept resurfacing. The correct fix for all 69 affected keys had already been written, but only as
  an **uncommitted edit** sitting in the working tree, never committed in this repository's history — the
  actual root cause of the recurrence: verified work that never reached a commit. This pack: recovers 69
  translation keys (AR+EN) — 64 found by a static `t('...')` scan plus 5 more (`page.perfEval.criterion.*`)
  used dynamically via a `CRITERIA_KEYS` array in `PerformanceEvaluation.tsx`, invisible to a literal-string
  scan — across `SalaryCertificate`, `PurchaseRequest`, `PerformanceEvaluation`, `LeaveRequest`,
  `SalaryAdvance`, `ReturnToWork`. Isolated strictly from unrelated dirty working-tree content sharing the
  same file (verified `git diff --stat`: 138 insertions, 0 deletions, touching only these six forms' keys).
  Adds `frontend/src/__tests__/formsTranslationKeyCompleteness.test.ts` — a **general** regression test
  (unlike the existing title-only `formsRegistryTranslationAudit.test.ts`) that statically scans every
  literal `t('...')` call plus `CONST_KEYS`-array indirection across all 12 `formsRegistry`-registered form
  pages and every file under `frontend/src/forms/`, asserting each key resolves in both `DICT.ar` and
  `DICT.en` — so any future form or key introduced without a matching translation fails CI immediately
  instead of shipping silently. Verified the test actually catches regressions (temporarily removed a key,
  confirmed a precise failure, restored, confirmed green). No design, business logic, or print/preview
  behavior changed. Frontend `tsc --noEmit` ✅; full frontend `vitest` 116/124 files passing (was 115/123
  before this pack — net +1, the new test); the 8 pre-existing failing files are byte-identical to a
  stashed pre-change baseline run, confirmed unrelated — including a newly-discovered, separate,
  unrelated issue in `formsRegistryTranslationAudit.test.ts` (10 assertions fail because those form pages
  now call `translate(key, lang)` instead of the `t(key)` pattern the test string-matches; translation
  still resolves correctly at runtime, only the test's literal pattern is stale — flagged, not fixed, out
  of scope for this pack). Backend unaffected (frontend-only change) — backend `tsc --noEmit` and
  `vitest` (135 files / 1899 tests) both clean, `prisma validate` clean (schema untouched). Manual proof:
  all `t()`-used keys across the six forms (90 distinct, incl. the `CRITERIA_KEYS` array) now resolve
  against the rebuilt dictionary (4101=4101 AR/EN parity) — **0 missing in AR, 0 missing in EN**. Product
  Owner visual review: **approved**.

- **Cheque Management Visual Polish Pack v1** (2026-07-26,
  `stable-cheque-management-visual-polish-pack-v1`) — UI/UX density pass on the Cheque Management page
  only: compacted the executive header (~15–20% shorter), tightened KPI card padding/typography, quieted
  the secondary/utility print controls (Calibrate/Restore Default, now smaller and dimmed until hover),
  reduced the search/filter bar's height, and denser table rows with a more prominent cheque-number
  identifier (still a plain string — leading zeros like `000086` are never lost) plus computed
  beneficiary-name truncation (native `title` tooltip, only kicks in past ~300px, short/medium names
  unaffected). Removed the print-icon badge duplicating the PRINTED status chip's own icon (kept for a
  cancelled cheque that had been printed beforehand — the only remaining signal of that history). All
  overrides are scoped to page-local wrapper classes in `Cheques.css`; the shared ExplorerKit components
  (`ExecutiveHeader`, `HeroMetric`, `MetricCard`, `SearchBox`, `Pagination`, `Button`) are unmodified, so
  no other page is affected. **KPI redefinition (approved as part of this pack):** the Hero card now
  reads "إجمالي قيمة الشيكات المطبوعة" — the total value of every `PRINTED` cheque across *all*
  Pagination pages within the current period, computed in the database via one new
  `ChequesService.stats()` field (`printedTotal`, a single Prisma `aggregate` SUM added alongside the
  existing counts — no frontend pagination loop, no per-page requests). The former "Highest Cheque (This
  Page)" secondary card is replaced in place by "قيمة الشيكات في هذه الصفحة" (current-page sum, the
  hero's old calculation, relocated); the now-unused "highest" calculation was removed. Draft/Printed/
  Cancelled counts, the average card, pagination, search/filter behavior, accounting-period wiring, and
  every print/calibration/reprint/payment-voucher handler are unchanged. No schema change, no new API
  contract shape beyond the additive `printedTotal` field. Backend/frontend/electron `tsc --noEmit`
  clean; `prisma validate` clean (schema untouched); backend `vitest` 135 files / 1899 tests passing
  (incl. 2 new tests for the `printedTotal` aggregate); frontend targeted cheque/print/calibration suite
  16 files / 246 tests passing; 2 pre-existing/unrelated failing files (`chequePrintInkIsolation.test.tsx`,
  `universalPrintPreviewCorrective.test.tsx`) confirmed identical against the pre-pack baseline — neither
  touches this pack's files. Frontend and backend production builds both clean. Product Owner manual
  visual review: **approved**.

- **Payment Voucher Official Letterhead & Exact Preview Page-Cascade Fix Pack v1** (2026-07-26,
  `stable-payment-voucher-letterhead-exact-preview-cascade-fix-pack-v1`) — two related changes, scoped and
  validated separately. **(1) Payment Voucher:** removed the Direct Manager Approval section (signature/
  date/official-stamp block) entirely; replaced the plain-text company header with the official
  `logohead.png` letterhead image at its natural aspect ratio (opt-in `useLogoHeader`, source file
  untouched), sharpened its legibility with a display-only CSS filter; compacted the payment-voucher
  profile's top `@page` margin (12mm → 5mm, opt-in `compactTopMargin`, every other form/profile
  unaffected) and shifted the whole content block down 2cm as one unit (`contentTopOffset`, a real spacer
  element — survives the print/PDF `padding: 0 !important` reset that a CSS-padding-based offset would
  not). Verified single-page A4 in both Print and PDF. **(2) Exact Preview `@page` cascade fix (shared
  engine, all forms benefit):** `composeStyledFromNode` picked the FIRST captured `@page` rule
  (`document.styleSheets` order), so `app/theme.css`'s generic app-startup fallback
  (`@page { margin: 1cm; }`) silently won over a form's own, later-mounted, more specific rule —
  Exact Preview then paginated differently from the real Print/PDF paths. New `mergePageRules()`
  (`printing/styleCapture.ts`) reconciles captured `@page` rules **property-by-property in cascade
  order** (later value wins per property — matching real browser `@page` cascade resolution, never
  silently dropping a property only an earlier rule declared) instead of naive first/last-rule selection.
  Benefits every form on the default `useAccurateFormPreview`/`composeStyledFromNode` path (12 forms) plus
  Quotation (own `compose` wrapper, same underlying composer); Receipt Voucher is unaffected (different
  composer entirely). New regression suite: `exactPreviewPageCascade.test.ts` (8 tests). **Deferred, out
  of scope:** `PayrollPayslip` has no form-specific `@page` rule at all, so its preview still falls back to
  `theme.css`'s incomplete rule (`margin` only, no `size`) — an independent, pre-existing defect found
  during root-cause analysis, deferred per explicit product-owner instruction. **No changes** to any other
  form's design/content, `theme.css` itself, other forms' print margins, A4 sizing/scaling, QR codes,
  business logic, or the physical Print/PDF pipelines. Frontend `tsc --noEmit` clean (frontend-only
  release); frontend production build clean; targeted `vitest` — 12 files / 251 tests passing. Product
  Owner visual review: **APPROVED**.

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
