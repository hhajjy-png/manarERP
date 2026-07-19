# PROJECT_MASTER_STATUS.md — manarERP

> **Official master status reference, reconstructed from the Git repository.**
> Git history and repository contents are authoritative. Where PROJECT_STATE.md conflicts with Git, Git wins.
> Last refreshed: 2026-07-17 (previously 2026-07-01) · Read-only audit · No source code, Prisma, or PROJECT_STATE.md was modified.
> Method: `git for-each-ref`/`--merged` over all tags + four codebase surveys (Banking, Printing, AI, ExplorerKit) + direct module/schema reads.
> Evidence confidence is marked per section. Anything not confirmable from the repo is marked **UNKNOWN**.
>
> **Refresh cadence:** this file must be regenerated every time `PROJECT_STATE.md` is rotated (see that file's
> "Rotation & Archive Policy" section) — at minimum the "Current Production State" and "Repository Status" tables
> below. This 2026-07-17 pass refreshed those two quantitative tables only (re-derived directly from `git`); the
> deeper narrative surveys (Banking/Printing/AI/ExplorerKit sections further down) were last verified 2026-07-01
> and have not been re-audited in this pass — treat their specifics as of that date, not current-day.

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
| **Current HEAD** | `460e08c` — *docs: record Financial Center & Banking UX Fix Pack v2 release in PROJECT_STATE* | High |
| **Current stable tag** | `stable-financial-center-banking-ux-fix-pack-v2` (merge commit `cd7aac9`) | High |
| **Previous stable tag** | `stable-financial-center-banking-ux-consolidation-v1` (`d7ed0c6`) | High |
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

### Latest Release — `stable-stability-performance-pack-v1` (`d6ec309`, 2026-07-02)

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
Management, tafqeet (spelled amount), print output, Gulf Bank calibration, professional calibration pack, calibration UX phase 2. ExplorerKit-migrated + `ChequeCalibrator`. **100%** (per-bank template stubs for beneficiary master / printer prefs are future). Single-page print fix (collapse in-flow app shell in `@media print` so only the fixed cheque paginates) + **SYSTEM_ADMIN force delete** workflow (`GET/DELETE /cheques/:id/force`, exact cheque-number confirmation, transactional delete, bank-statement match rows un-matched not broken, audit `DELETE`+`forceDelete:true`, `ForceDeleteChequeModal`) — `stable-cheques-force-delete-print-fix-v1`.

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
8. **Leave Advance Reconciliation Pack v1** — Employee Entitlements currently shows the full legal leave
   entitlement (Section 3) and the historical advance-payment ledger (Section 7, `LeaveSettlement` — see
   `stable-kuwait-labour-law-compliance-pack-v1`) as two independent, unreconciled figures: no screen computes
   "legal entitlement − Σ advances paid = remaining net owed." Scope: display total legal entitlement, total
   leave-advance payments, and the remaining amount expected at final settlement. **Must NOT modify the legal
   calculation engine introduced in the Kuwait Labour Law Compliance Pack v1** (`entitlements.calc.ts`'s
   ÷26 divisor, wage-base composition, or dual gratuity scenarios) — display/reconciliation layer only. *(Medium)*
9. **Kuwait Labour Law Compliance — Rules 4, 6, 18** — the independent Kuwait Labour Law Compliance Audit
   flagged 3 remaining findings against the Employee Entitlements calculation engine that Pack v1 (Rules 10,
   13, 16, 17) and Pack v2 (Rules 2, 5 — see `stable-kuwait-labour-law-compliance-pack-v2`) deliberately did
   **not** implement, because each requires **formal legal interpretation** before any calculation change can
   be made safely. Do not implement without an explicit legal-confirmation instruction from the project owner.
   *(Medium — blocked on external input, not on engineering effort)*

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
