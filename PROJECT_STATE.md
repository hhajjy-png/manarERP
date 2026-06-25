# PROJECT_STATE.md — manarERP

> Live state document. Update at the end of every session.
> Read at session start after AGENTS.md and CLAUDE.md.

---

## Current Production Baseline

| Field | Value |
|-------|-------|
| **Branch** | `production` |
| **HEAD** | `f5dcfc5` — Merge Print Designer Phase 7A DOCX import into production |
| **Merge Commit** | `f5dcfc5` — Merge Print Designer Phase 7A DOCX import into production |
| **Latest stable tag** | `stable-print-designer-phase7a-docx-import-v1` |
| **Remote sync** | `origin/production` — up to date (post push) |
| **DB path (dev)** | `backend/data/manar.db` |
| **DB path (prod)** | `userData/data/manar.db` |
| **UI font** | `"IBM Plex Sans Arabic"` (WOFF2, local) → `"Cairo"` → `"Tajawal"` → Arial |
| **Print/form font** | `"Cairo", Arial, sans-serif` (all printed documents) |
| **Font CDN** | None — all fonts are local assets |
| **Backend port** | `127.0.0.1:48211` |
| **Last DB reset** | 2026-06-13 — full operational reset; system config and COA preserved |

---

## Completed Features

| Feature | Stable Tag | Summary |
|---------|-----------|---------|
| **Print Designer Phase 7A — DOCX Template Import** | `stable-print-designer-phase7a-docx-import-v1` | Adds DOCX-to-TemplateStudio import to the existing Template Studio editor. **Architecture:** Frontend-only module at `frontend/src/print-templates/studio/docxImport/`. No backend changes, no Prisma schema changes, no IPC channels, no migrations. **New dependencies:** `mammoth@1.9.0` (DOCX→HTML conversion, browser-compatible, exact pinned version) + `jszip@3.10.1` (secondary pass reading `word/document.xml` for margin/header detection). **New files (5):** `docxTypes.ts` (constants, warning types, `DocxImportOptions`, `DocxParseResult`, `WizardInternalState`), `docxMappings.ts` (font-size pt→token, alignment CSS→token with RTL flip, hex→`StudioTextColor` nearest-match, Arabic normalization, `KEYWORD_SETS` for line-items detection), `docxParser.ts` (`tryDynamicField`, `docxHtmlToElements` flow-layout engine, `parseDocx`, `buildImportedTemplate`), `DocxImportWizard.tsx` (4-step modal: file select/drop → doc type → parse+review+preview → name+confirm), `__tests__/docxParser.test.ts` (31 unit tests). **Modified files (2):** `frontend/package.json` (added mammoth + jszip), `TemplateStudioEditor.tsx` (import DocxImportWizard, `docxWizardOpen` state, "استيراد DOCX" button, wizard mount with `updateTemplates` callback). **Flow-layout positioning:** `cursorY` starts at `pageMarginMm`; `getY(h)` returns `cursorY * scaleY`; `advance(h)` increments `cursorY += h / scaleY + DOCX_ELEMENT_GAP_MM (1.5mm)`; non-A4 scaling: `scaleX = 210/docWidthMm`, `scaleY = 297/docHeightMm`. **Arabic normalization:** `أ/إ/آ→ا`, `ة→ه` for table header keyword matching via `KEYWORD_SETS`. **Dynamic field detection:** `/^\{\{([\w.]+)\}\}$/` regex — entire trimmed paragraph must match; validated against per-docType allowlists via `isAllowedField`. **Safety limits:** 10 MB input cap, 200-element cap, 5 MB template JSON hard block, 2 MB soft warning. **Deferred explicitly:** PDF Import, Image/OCR Import. **Tests: 830/830 backend (48 files, unchanged) + 588/588 frontend (28 files, +31 new docxParser tests). Gemini APPROVED ✅.** |
| **Print Polish Batch 1 — Targeted Print Localization + Advanced Backend Report Profiles + Invoice QR Verification Foundation** | `stable-print-polish-batch1-v1` | Three-part print infrastructure improvement. **Part 1 — Targeted Print Localization:** `printI18n.ts` centralized Arabic translation utility (frontend-only; 6 functions: `translateInvoiceStatus`, `translatePaymentMethod`, `translateInvoiceDirection`, `translateRefType`, `translateDocumentState`, `formatArabicDate`; 12-status map, KW locale dates). Fixed `'Total :'` English placeholder → `'الإجمالي:'` in `InvoiceDesign1.tsx` and `InvoiceDesign1Blank.tsx`. **Part 2 — Backend Report Engine Print Profiles:** `ProfileConfig` exported from `printProfiles.ts` + 5 new optional fields (`headerHeight`, `footerHeight`, `logoSize: 'small'|'medium'|'large'`, `logoAlignment: 'start'|'center'|'end'`, `tableDensity: 'compact'|'normal'|'comfortable'`). 3 new helper functions in `styles.template.ts`: `resolveTablePadding(density)`, `resolveLogoWidth(size)`, `resolveLogoJustify(align)`. CSS rules appended to `buildStyles()`: `table td/th { padding: resolveTablePadding }`, `.branding-logo-wrap { justify-content: resolveLogoJustify }`, `.branding-logo { width: resolveLogoWidth }`. `branding.template.ts` accepts `Pick<ProfileConfig, 'headerHeight'|'logoSize'|'logoAlignment'>` for config-driven logo sizing and alignment. `html.service.ts` wires `PRINT_PROFILES[profile]` into `buildBrandingHeader` call. **Part 3 — Invoice QR Verification Foundation:** Prisma migration adds nullable unique `verificationUuid TEXT` column to `invoices` table (backfills existing rows with `lower(hex(randomblob(16)))`). Backend `verification` module: `GET /api/verify/:uuid` (requires auth) returns `{ found, documentType, documentNumber, status, statusAr, issueDate, updatedAt, isCancelled, isApproved }` — never exposes amount/customer/supplier PII. `arabicLabels.ts` (backend-only) provides `translateInvoiceStatusAr()`. `invoices.service.ts` stamps `verificationUuid: randomUUID()` on every new invoice. `'verification'` added to MODULES in `constants.ts`. Frontend `DocumentVerificationQR.tsx` renders SVG QR code via `qrcode.toString(uuid, { type: 'svg' })` encoded as data URL; returns `null` when uuid is falsy. `InvoicePreview.tsx` wires QR at bottom-right of engine mode view when `data.verificationUuid` is present. jsdom + `@testing-library/react` + `@testing-library/jest-dom` added as frontend dev deps; vitest `globals: true` + `setupFiles` in `vite.config.ts`. **Tests: 830/830 backend (48 files, +11 new) + 557/557 frontend (27 files, +4 new .tsx test). No Electron IPC changes. No frontend routing changes. Gemini APPROVED ✅. 27 files changed, 1330 insertions.** |
| **Unified Report Engine Phase 3 — HTML Template System, Branding Engine, Print Profiles, Watermarks, Legacy Reports Migration** | `stable-unified-report-engine-phase3-v1` | Decomposes the monolithic `html.service.ts` into a modular template architecture and migrates all backend report flows to the HTML→Chromium PDF pipeline. **Architecture:** `buildReportHtml(input, options?)` public facade delegates to 7 pure template functions (styles, branding, header, footer, table, watermark, summary). Fully backward-compatible — callers that omit `ReportOptions` receive A4-landscape output identical to the previous behavior. **New type system (`reportTypes.ts`):** `PrintProfile` (6 profiles: a4-landscape/a4-portrait/statement/journal/receipt/letter), `WatermarkType` (7 types: draft/copy/original/cancelled/approved/rejected/confidential), `ReportBranding` (9 company fields), `ReportOptions` (profile + branding + watermark + generatedBy + dateRange + notes + showSignatureArea + showPageNumbers). **Branding engine (`brandingLoader.ts`):** `loadReportBranding()` reads 9 Settings keys in a single `findMany` — company name AR/EN, address, phone, email, website, commercialReg, primaryColor, footer. All with graceful fallbacks. **Print profiles (`printProfiles.ts`):** `PRINT_PROFILES` map drives `@page` CSS — page size (A4/A5), orientation, margin, body and table font sizes. **Styles (`styles.template.ts`):** `buildStyles()` — full CSS including `@page @bottom-center { content: "صفحة " counter(page) " من " counter(pages); }` CSS counters for page numbers (Chromium-native), RTL, dynamic primary/secondary colors from branding, watermark, signature area, summary cards, notes. **Shared utilities (`htmlUtils.ts`):** `esc()` XSS-safe escaper (escapes `&`, `<`, `>`, `"`), `fmtCell()` display formatter — used by all templates. **Legacy reports migration:** `reports.routes.ts` — added `format=html` case (Chromium pipeline) alongside retained `format=pdf` (PDFKit — kept for backward compat per Gemini confirmation). `Reports.tsx` — new PDF download button using `exportReportAsPdf`. **Financial Center branding:** all 8 `buildReportHtml(input)` calls in `financial.service.ts` now pass `{ profile: 'a4-landscape', branding, showPageNumbers: true }` via private `htmlBuf()` helper. **Test suite:** 73 new tests across 10 describe blocks in `reportEngine.test.ts` (buildReportHtml, buildStyles, buildBrandingHeader, buildReportHeader, buildTable, buildWatermark, buildSummaryCards, esc, fmtCell, migration-compatibility). **No Prisma schema changes. No migrations. No Electron IPC changes. No new npm packages.** 12 files created, 4 files modified. 801/801 backend (47 files) + 516/516 frontend (25 files). Gemini APPROVED WITH MINOR NOTES ✅. **Known minor notes (non-blocking):** hex color validation for `primaryColor` deferred; `company.logo` Settings key mapping deferred; PDFKit retained at `format=pdf` for API-level compatibility. |
| **Arabic PDF Chromium Fix — Financial Center + Financial Reports Chromium HTML→PDF pipeline** | `stable-arabic-pdf-chromium-fix-v1` | Replaces broken PDFKit Arabic rendering with a Chromium HTML→PDF pipeline for all Financial Center PDF exports and the Financial Reports tab. **Root cause:** PDFKit uses `Helvetica` with `WinAnsiEncoding` (codepoints 32–255, Latin-only). Arabic Unicode starts at U+0600 — entirely outside the range — producing garbled Latin output. PDFKit also has no Arabic reshaper or BiDi algorithm. **Solution:** Backend generates a self-contained HTML report (Cairo font embedded as base64 `@font-face`, RTL, A4 landscape `@page`) → sends to Electron via `pdf:exportHtml` IPC → hidden `BrowserWindow` loads the HTML from a temp file → 400ms settle → `printToPDF({ preferCSSPageSize: true, printBackground: true })` → Chromium handles HarfBuzz shaping, BiDi, RTL natively → PDF written to user-chosen path. **Arabic text is now selectable, searchable, correctly shaped, and RTL.** **New files:** `backend/src/shared/services/reportEngine/html.service.ts` (`buildReportHtml(input)`, Cairo font cached as module-level `cachedFontBase64`, `esc()` XSS guard, `fmtCell()` number formatting, `display: table-header-group/footer-group` for print pagination); `backend/src/shared/services/reportEngine/html.service.test.ts` (10 Vitest tests); `backend/assets/fonts/Cairo-Regular.ttf` (94,480 bytes, copied from frontend); `frontend/src/utils/pdfExport.ts` (`exportReportAsPdf(endpoint, params, filename)` — fetches `format=html` with `responseType: 'text'`, invokes `window.manar.exportPdfFromHtml`). **Modified files:** `backend/src/modules/financial/financial.schema.ts` — `'html'` added to 7 format enums; `backend/src/modules/financial/financial.service.ts` — all 8 export methods return `Buffer.from(buildReportHtml(input), 'utf-8')` for `format === 'html'`; `backend/src/modules/financial/financial.controller.ts` — `sendFile()` helper handles `'html'` (`Content-Type: text/html; charset=utf-8`, `inline`); `electron/ipc/pdf.ipc.ts` — new `pdf:exportHtml` IPC handler (save dialog → temp HTML → hidden BrowserWindow → printToPDF → cleanup); `electron/preload.ts` — `exportPdfFromHtml` added to contextBridge; `electron-builder.yml` — `backend/assets` added to extraResources; `frontend/src/api/client.ts` — `exportPdfFromHtml` added to `Window.manar` type declaration; `frontend/src/pages/FinancialCenter.tsx` — all 6 PDF export calls replaced with `exportReportAsPdf()`; `frontend/src/components/financial/FinancialReportsTab.tsx` — PDF export uses `exportReportAsPdf()`; `frontend/src/pages/ReportPrint.tsx` — PDF button uses `pdf:export` IPC (legacy Reports Center, unchanged). **PDF export architecture split:** Financial Center + FinancialReportsTab → Chromium HTML→PDF (`pdf:exportHtml`). Legacy Reports Center (`ReportPrint.tsx`) + Invoice/Quotation PDF + Executive Decision Center PDF → remain on `pdf:export` (DOM capture). `pdf.service.ts` (PDFKit) **NOT removed** — still used by legacy Reports Center. **Tests: 728/728 backend (46 files — +10 from html.service.test.ts) + 516/516 frontend (25 files, unchanged). Gemini APPROVED WITH MINOR NOTES ✅. 10 files modified, 4 files created.** |
| **Financial Center Phase 2 — GL Report, Trial Balance, Aging, Journal Book, Financial Reports, Financial Dashboard** | `stable-financial-center-phase2-v1` | Full financial intelligence layer added to the existing Financial Center (`FinancialCenter.tsx`). **Architecture: Orchestrator pattern** — `financial.service.ts` delegates all queries to `accountingService` and shared utilities; never reimplements query logic. **No Prisma schema changes. No migrations. No Electron IPC.** **Part 1 — GL Report:** `GET /api/financial/gl-report` + `/gl-report/export`; `GlReportSchema` (accountId/fromDate/toDate/page/pageSize/format); `getGLReport()` service method fetching `JournalEntryLine` rows joined to `Account` + `JournalEntry`; M9 balance display via `BalanceDisplay.tsx` + `formatBalance()` (absolute value + مدين/دائن indicator, EPSILON guard for near-zero); `GlReportTab.tsx` component (account picker, date range, paginated table with debit/credit/running balance in KWD 3dp, Excel/PDF export). `scrollY` restoration on pagination. N+1 eliminated (single Prisma query with select instead of chained findMany). **Part 2 — Trial Balance:** `GET /api/financial/trial-balance` + `/trial-balance/export`; aggregates debit/credit per account for date range; `TrialBalanceTab.tsx` (date range filter, account-level totals, grand total row). **Part 3 — Aging Report:** `GET /api/financial/aging-report` + `/aging-report/export`; customer/supplier aging buckets (0–30/31–60/61–90/90+ days) computed from unpaid/partial invoices; `AgingReportTab.tsx` (AR/AP tabs, entity search, color-coded buckets). **Part 4 — Journal Book:** `GET /api/financial/journal-book` + `/journal-book/export`; paginated journal entries with line-level debit/credit; `JournalBookTab.tsx` (date range, entry-level table with expand-to-lines). **Part 5 — Financial Reports + Financial Dashboard + Dashboard مالي tab + Migration banner.** `backend/src/shared/services/financial/dashboard-summary.service.ts`: 45s TTL module-level cache (`let cache`); 9 parallel Prisma queries (AR aggregate, AP aggregate, top-5 customers/suppliers via `$queryRaw` tagged template literals, 30-day collections/payments, account count, 90-day critical AR/AP). `backend/src/shared/services/financial/export/summary.export.adapter.ts`: `toSummaryReportInput()` converts `FinancialResponse<FinancialRow>` to `ReportInput` for Excel/PDF. Three new service methods on `FinancialService`: `getFinancialSummary(filters)` (delegates to `accountingService.financialSummary(from,to)` — positional params), `exportFinancialSummary(filters,format)`, `getDashboardSummary()`. Three new routes: `GET /api/financial/summary` (`finreports.read`), `GET /api/financial/summary/export` (`finreports.export`), `GET /api/financial/dashboard-summary` (`financialdashboard.read`). `constants.ts`: `'financialdashboard'` added to MODULES array. **Frontend — FinancialReportsTab.tsx:** 4 summary KPI cards (إيرادات/مصاريف/صافي/تحصيلات), M10 disclaimer (operational tables not GL), ExportBar, 4 "قريباً" placeholder cards. **Frontend — FinancialDashboardTab.tsx:** AR/AP outstanding cards with حرج +90 يوم sub-line + navigation links; 30-day collections/payments cards; top-5 customers/suppliers tables (clickable rows → `/financial?tab=statement`); `آخر تحديث` from `data.generatedAt`; `X-Cache-Age` response header. **Frontend — Dashboard.tsx:** `GeneralDashboardContent` (renamed existing function, no export), new thin `export default function Dashboard()` adds `.db-tab-bar` + `db-tab-btn` tabs (عام/مالي) with `localStorage.getItem('dashboard.tab')` persistence; مالي tab gated by `financialdashboard.read`; wrapper uses plain `<div>` (not `.db-page`) to avoid dark-theme double-nesting. **Frontend — Statements.tsx:** dismissible migration banner with `localStorage.setItem('statements.bannerDismissed','1')` guard; "فتح الإصدار الجديد" button navigates to `/financial?tab=statement`. **Frontend — FinancialCenter.tsx:** finreport tab wired to `<FinancialReportsTab>` with `frFrom`/`frTo` URL params (scoped to avoid collision with glFrom/glTo and fromDate/toDate). **CSS:** financial.css appended Part 5 styles; dashboard.css added `.db-tab-bar` / `.db-tab-btn` / `.db-tab-btn.active`. **New permission key:** `financialdashboard.read` (added to MODULES; `financialdashboard` module). **Tests: 718/718 backend (45 files) + 516/516 frontend (25 files). Gemini APPROVED ✅. 64 files changed, 6292 insertions, 11 deletions.** |
| **Statement Center Phase 1 — Customer & Supplier Statements** | `stable-statement-center-phase1-v1` | Shared Statement Engine for real-time customer and supplier account statements. **Backend — Types (`statement.types.ts`):** `StatementEntityType` (`'CUSTOMER' \| 'SUPPLIER'`), `StatementReferenceType` (`'INVOICE' \| 'PAYMENT' \| 'EXPENSE'`), `StatementFilters`, `StatementEntry` (id/date/reference/referenceType/referenceId/description/debit/credit/runningBalance/status/entityName/entityCode), `StatementSummary` (openingBalance/totalDebit/totalCredit/closingBalance/transactionCount), `StatementResult`, `StatementInput`. **Backend — Engine (`statement.service.ts`):** `buildStatement()` dispatcher → `buildCustomerStatement` (AR: invoices=debit, payments=credit, formula `balance + debit - credit`) or `buildSupplierStatement` (AP: invoices=credit, expenses=credit, payments=debit, formula `balance - debit + credit`); opening balance computed from all movements before `fromDate`; `assembleResult()` applies entity-type-specific running balance and closing balance formulas (`isSupplier` branch); chronological sort; filters by referenceType / status / search; customer opening balance: `Σinvoices − Σpayments`; supplier opening balance: `Σinvoices + Σexpenses − Σpayments`. **Backend — Module (`statements`):** 4 routes — `GET /api/statements/customers/:id` (requires `statements.read`), `GET /api/statements/suppliers/:id` (requires `statements.read`), `GET /api/statements/customers/:id/export` (requires `statements.export`), `GET /api/statements/suppliers/:id/export` (requires `statements.export`); registered in `app.ts`. **Backend — Controller:** NaN/invalid entityId guard (`parseEntityId` → HTTP 400 with Arabic message) on all 4 handlers; Excel export via `buildExcel()` (8-column sheet: التاريخ/المرجع/النوع/البيان/مدين/دائن/الرصيد/الحالة); `refTypeAr()` helper; KWD 3-decimal formatting; `ok()` response utility. **Backend — Constants:** `'statements'` added to `MODULES` array; `statements.read` and `statements.export` permission keys. **Backend — Seed:** `statements: ['read', 'export']` in MODULE_ACTIONS; ACCOUNTANT role → both permissions; PROJECT_MANAGER → `statements.read`. **Backend — Tests (11 tests):** Customer Statement — empty statement, sales invoices as debit + payments as credit, running balance across entries, opening balance from pre-fromDate transactions, date range exclusion (Prisma filter delegate), referenceType filter, summary totals (totalDebit/totalCredit/closingBalance/transactionCount). Supplier Statement — invoices+expenses as credit + payments as debit, opening balance (Σinvoices+Σexpenses−Σpayments=900), running balance decreases with payments. Error handling — unsupported entity type throws. **Frontend — API (`statements.ts`):** `import { api }` named export; `cleanFilters()` strips undefined/empty strings; `statementsApi` with `getCustomerStatement`, `getSupplierStatement`, `exportCustomer` (triggers file download via `downloadBlob`), `exportSupplier`; all types re-exported. **Frontend — Page (`Statements.tsx`, 591 lines):** RTL page with two tabs (customers/suppliers, fully independent state via `TabPanel` sub-component); entity picker (fetches 500 entities from `/customers` or `/suppliers`); filter bar: entity dropdown, fromDate, toDate, referenceType select (الكل/فاتورة/دفعة/مصروف), search input, عرض button, Excel export button; 5 summary cards: رصيد افتتاحي, مجموع مدين (green), مجموع دائن (red), رصيد ختامي (bold, red if negative), عدد الحركات; plain `<table>` with sticky header, color-coded debit (green if >0) / credit (red if >0) / running balance (red if negative); invoice references clickable → navigate to `/invoices/:id/preview`; empty states for no entity selected / no results; `cancelRef` cancellation guard on entity switch; export error message surfaced on failure (replaces silent catch). **Frontend — Routing:** `<Route path="/statements" element={<Statements />} />` added to `App.tsx`. **Frontend — Navigation:** `{ key: 'statements', label: 'nav.statements', icon: 'account_balance_wallet', permission: 'statements.read' }` in financial group in `modules.tsx`. **Frontend — i18n:** `'nav.statements': 'كشف الحساب'` in both AR and EN. **Accounting sign convention (AP/AR standard):** Customer (AR) — debit increases receivable, credit reduces it, positive balance = customer owes us. Supplier (AP) — credit increases liability, debit reduces it, positive balance = we owe supplier. Opening balance formula identical for both: `Σinvoices + Σexpenses − Σpayments`. **14 files changed** (8 new: `statement.types.ts`, `statement.service.ts`, `statement.service.test.ts`, `statements.controller.ts`, `statements.routes.ts`, `statements.schema.ts`, `statements.ts` API client, `Statements.tsx`; 6 modified: `app.ts`, `constants.ts`, `seed.ts`, `App.tsx`, `modules.tsx`, `i18n.ts`). 1611 insertions. No Prisma schema changes. No migrations. No Electron IPC changes. No new npm packages. **Tests: 628/628 backend (36 files — +11 tests, 1 new test file) + 507/507 frontend (24 files, unchanged). Gemini APPROVED ✅.** |
| **Approval Workflow Pack v1 — Phase A (Universal Approval Engine Foundation)** | `stable-approval-workflow-pack-v1-phase-a` | Foundation-only: reusable approval infrastructure. **No module integration in Phase A** — zero changes to existing Expenses, Payroll, or Invoice workflows. **Backend — Schema:** `ApprovalHistory` table (polymorphic: `entityType` + `entityId`, 3 indexes — `[entityType,entityId]`, `[userId]`, `[createdAt]`). **Backend — Types (`approval.types.ts`):** 9 TypeScript interfaces/types — `ApprovalModuleConfig<TEntity>` (with optional `historyPermission?: string`), `ApprovalTransition`, `ApprovalMeta`, `ApprovalSideEffect<TEntity>`, `TransitionInput`, `ApprovalHistoryEntry`, `TransitionResult<TEntity>`, `ApprovalTransitionEvent`, `ApprovalTransitionListener`. **Backend — Engine (`approval.service.ts`):** `ApprovalEngine` class exported as `approvalEngine` singleton. Registry/composition pattern: `register(config)` stores `ApprovalModuleConfig`; `transition(input, tx?)` validates entity/action/fromStatus, checks permissions (`assertPermission` — SYSTEM_ADMIN bypasses), runs status update + `ApprovalHistory` write + `AuditLog` fire-and-forget in ONE `prisma.$transaction`; side-effect hooks run inside same transaction and propagate errors for rollback; `getHistory(entityType, entityId)` → `ApprovalHistoryEntry[]`; `onTransition(listener)` → notification array (zero listeners in Phase A); `hasModule(entityType): boolean` + `getHistoryPermission(entityType): string | undefined` (minimal exposure, no full config leaked). **Backend — Endpoint:** `GET /api/approval-history/:entityType/:entityId` — `authenticate` only; controller validates params, rejects unregistered `entityType` with HTTP 400 + `نوع الكيان غير معروف`, enforces `config.historyPermission` (if set) with HTTP 403, SYSTEM_ADMIN bypasses. Since zero modules register in Phase A, all calls return 400 — no history data exposed. **Backend — Tests:** 26 unit tests for `ApprovalEngine` (17 core: unknown module, unknown action, invalid fromStatus, missing permission, SYSTEM_ADMIN bypass, happy path, side-effect propagation, getHistory; + 4 new: hasModule/getHistoryPermission coverage) + 5 controller tests (unregistered→400, registered no permission→allow, registered with permission user lacks→403, registered with permission user has→allow, SYSTEM_ADMIN bypass→allow). **Backend — constants.ts:** added `'submit'` and `'reopen'` to ACTIONS array; `ActionName` union updated. **Frontend — API:** `approvalHistoryApi.getHistory(entityType, entityId)` → `GET /api/approval-history/:entityType/:entityId`. **Frontend — Components (4, all standalone, not wired to any page):** `ApprovalBadge` — status chip, 11 Arabic status labels (DRAFT/PENDING/SUBMITTED/APPROVED/REJECTED/CANCELLED/REVERSED/PAID/UNPAID/PARTIAL/OVERDUE), custom `statusMap` prop; `ApprovalTimeline` — timeline list of `ApprovalHistoryEntry[]`, colored action icons, relative timestamps in Arabic; `ApprovalActions` — two-stage button group (click → confirm dialog with optional comment textarea → execute), supports `requireComment`; `ApprovalHistoryPanel` — composite: fetches history, renders Timeline + optional Actions panel, cancellation guard on initial fetch, refresh-after-action. **Frontend — Barrel:** `frontend/src/components/approval/index.ts` exports all 4 components + `ApprovalTransitionDef` + `ApprovalHistoryEntry`. **Security hardening:** IDOR vulnerability closed — `hasModule()` guard + optional `historyPermission` field on `ApprovalModuleConfig`. Phase B integration point: set `historyPermission: 'module.view'` in `register(config)` to enforce per-module permission on history access. 16 files changed (7 new backend files, 3 modified backend files, 6 new frontend files). 1322 insertions. No frontend pages modified. No Electron IPC changes. No new npm packages. **Tests: 617/617 backend (35 files — +26 tests across 2 new test files) + 507/507 frontend (24 files, unchanged).** |
| **Invoice & Expenses Operations Pack** | `stable-invoice-expenses-operations-pack-v1` | Full-stack invoice and expenses operations hardening. **Backend — Smart FK Conflict Guards:** `customers.remove` — throws rich 409 with the contract code list when linked contracts exist (e.g. "مرتبط بـ 3 عقود: EQ-2024-001، …"); `suppliers.remove` — throws rich 409 with last invoice number + linked expense code (e.g. "مرتبط بـ 2 فاتورة، آخرها MN-INV-2024-001، و1 مصروف EXP-2024-00001"); `equipment.remove` — throws rich 409 with per-category record counts (maintenance / breakdown / fuel / spare parts). **Backend — Expenses Stats Extension:** `stats()` now runs 3 parallel Prisma aggregates for `currentMonth`, `previousMonth`, and `currentYear` based on `billingMonth + billingYear` fields; returned as `periods` sub-object. **Backend — Reports:** billing period column (`شهر الحساب`) added to expenses Excel export. **Frontend — Smart Price Picker:** `ContractOption` type + `contracts`/`contractId`/`pickerSearch` state added to both CreateInvoice and EditInvoice; `partyId` effect fetches contracts + resets `contractId` on customer switch; `filterAsphaltPlant`/`displayPrices` derived values filter prices by active contract's plant; contract selector dropdown renders when SALES + customer + contracts exist; price banner shows active filter badge; picker button and dropdown use `displayPrices` filtered by unit; search input inside picker (sticky top) filters by مصنع/موقع/شركة with Arabic empty state "لا توجد اتفاقيات أسعار مطابقة لهذا العميل / العقد / المصنع". **Frontend — Invoice Item UX:** column header row gets `borderBottom` separator. **Frontend — Expenses Stats Display:** period cards (currentMonth/previousMonth/currentYear) rendered as colored cards below KPI strip; top-6 suppliers by total shown compactly. **Frontend — Billing Period Polish:** `شهر الفوترة` → `شهر الحساب` in DataTable column label, select title, and both form labels (CreateInvoice + EditInvoice); i18n value for `lbl.inv.billing_period` corrected (`حساب شهر` → `شهر الحساب`). **Frontend — i18n Cleanup:** DataTable column labels wired to `lbl.inv.billing_period` and `lbl.inv.remaining_amount`; form labels use `t()`. **Frontend — Conflict Message UI:** `archiveCandidate` state extended with `conflictMessage`; ResourcePage archive modal now shows rich backend conflict message instead of generic fallback. **No Prisma schema changes. No migrations. No new npm packages. No Electron IPC changes.** 12 files changed: 5 modified + 3 new backend test files + 4 modified frontend files. 421 backend insertions + 205 frontend insertions. **Tests:** 591/591 backend (33 files — +20 tests across 3 new test files: `customers.service.test.ts`, `suppliers.service.test.ts`, `equipment.service.test.ts`) + 507/507 frontend (24 files, unchanged). |
| **Accounting Completeness H1 — Purchase Invoice GL Posting** | `stable-accounting-completeness-h1-v1` | Closes the GL gap for purchase-direction invoices and supplier payments. **Purchase Invoice GL (`postPurchaseInvoiceToGL`):** already existed (Phase D); now exposed via an explicit `PATCH /invoices/:id/approve` endpoint secured by `invoices.approve` permission. **Purchase Payment GL (`postPurchasePaymentToGL`):** NEW — Dr ACCOUNTS_PAYABLE (2000), Cr CASH (1000) or BANK (1010) depending on `payment.method` (BANK/TRANSFER → BANK account; CASH/CHEQUE/other → CASH account). Called automatically from `addPayment()` when `invoice.direction === 'PURCHASE'`. Idempotent double-posting guard (`journalEntry.findFirst` on `PURCHASE_PAYMENT` + `referenceId`). Skips SALES invoices and zero-amount payments. KWD 3 decimal precision via `round3()`. **AP Settlement flow:** invoice creation creates liability (Dr PURCHASES 5000, Cr AP 2000); payment creation settles it (Dr AP 2000, Cr Cash/Bank) — net AP = 0 when paid in full. **Reversal (`reversePurchasePaymentGL`):** NEW — creates `PURCHASE_PAYMENT_REVERSAL` journal via `reverseGL()` (debit↔credit swap); never deletes original; no-op if no original GL entry; no-op if reversal already exists. **Approve endpoint:** `PATCH /invoices/:id/approve` → 3-attempt retry on `entryNumber` P2002 collision (`isEntryNumberCollision`); guards: PURCHASE direction required, CANCELLED invoices rejected; records `APPROVE` audit entry. **`clearGLForInvoice()` extended:** now includes `PURCHASE_PAYMENT` and `PURCHASE_PAYMENT_REVERSAL` in referenceType deleteMany for force-delete cleanup. **GL_REFERENCE_TYPES extended:** added `PURCHASE_PAYMENT` and `PURCHASE_PAYMENT_REVERSAL` to `gl.service.ts`. **No Prisma schema changes. No migrations. No frontend changes. No Electron IPC changes. No new npm packages.** 7 files changed (5 modified + 2 new test files), 851 insertions, 4 deletions. **Tests:** 571/571 backend (31 files — +45 new tests across 2 new test files: `invoices.purchase-payment.test.ts` 19 tests + `invoices.approve.test.ts` 26 tests) + 507/507 frontend (24 files). |
| **UX Polish Pack v4** | `stable-ux-polish-pack-v4` | Global UX hardening — frontend-only release. **ConfirmModal system:** `ConfirmModal.tsx` async confirmation modal replaces all `window.confirm()` calls across Inventory.tsx (9 calls / 5 sub-tabs), Cheques.tsx (2), TemplateStudioEditor.tsx (1), Attendance.tsx (2), and 10 print-form pages (ToWhomItMayConcern, LeaveRequest, SalaryCertificate, EmployeeWarning, Resignation, PerformanceEvaluation, SalaryAdvance, ReturnToWork, Quotation, PurchaseRequest). **Toast notification system:** `toastStore.ts` (Zustand) + `Toast.tsx` (fixed-position container, mounted in Layout.tsx). `useToast()` provides `toast.ok/error/warn()` with 4-second auto-dismiss. Replaced all `const [msg, setMsg]` inline alert patterns across: Users.tsx, Prices.tsx, Attendance.tsx, Expenses.tsx, Invoices.tsx, Accounting.tsx (2 tabs), Inventory.tsx (5 tabs), Backup.tsx (3-variant showMsg pattern), Settings.tsx. **Modal hardening:** `Modal.tsx` — added `size?: 'sm'|'md'|'lg'|'xl'` prop, focus trap, scroll lock, Escape key handler, focus restoration on close. **Modal sizes standardized** across Invoices (xl/lg), Inventory (xl/lg), Accounting (xl/lg), Attendance (lg), Maintenance (lg), Expenses (lg), Cheques (lg), Prices (xl/lg), Users (lg). **DataTable a11y:** `aria-busy={!!loading}` on table, `aria-live="polite"` on tbody, `className="th-actions"`/`"td-actions"` with `position:sticky; inset-inline-end:0` for sticky action column. **Button hardening:** `type="button"` on all non-submit buttons in form contexts; `:focus-visible` focus rings; `.btn.loading` class; `.btn:hover:not(:disabled)` guard. **CSS/RTL improvements:** `.user-info { text-align: start }`, `.field label.required::after`, `alert-close-btn`, `.skip-to-content`, `.spinner-sm`, dark-mode modal overlay. **Scope:** 32 files changed (29 modified + 3 new), 787 insertions, 364 deletions. No Prisma schema changes. No migrations. No backend API changes. No Electron IPC changes. No new npm packages. |
| **Print Designer — Phase 6.1C (Template Studio Polish & Quotation Totals Consistency)** | `stable-print-designer-phase6-1c-v1` | Enriches quotation data flow and hardens totals rendering. **Data map (`Quotation.tsx`):** now passes all four totals fields explicitly — `subtotal: qtTotal`, `discount: '0.000'`, `tax: '0.000'`, `grandTotal: qtTotal` — making the renderer fully deterministic and removing reliance on fallback alone. **`resolveQuotationDocumentTotals` fix (`lineItemsResolver.ts`):** changed `??` to `||` for `subtotal` and `grandTotal` fields so that empty-string values also fall back to `data.total` (not just `null`/`undefined`). `resolveInvoiceDocumentTotals` is unchanged. **Studio UX (`TemplateStudioEditor.tsx`):** context note added at top of line items table props panel ("البنود تُعبأ من الوثيقة عند الطباعة"); quotation-specific inline hint added after totals checkboxes ("ملاحظة: الخصم والضريبة في عروض الأسعار دائماً 0.000") shown only when `activeDocType === 'quotation'`. **Test suite:** 17 new tests in `templateStudio.test.ts` (groups 46–53, total 507): quotation enriched data map verification; subtotal fallback (missing key and empty string both fall back to total); discount/tax fallback (absent, empty string, '0.000' all return '0.000'); grandTotal fallback; no-blank-cells regression (both resolvers always return non-empty strings); backward compat (old quotation data with only `total` key resolves correctly); invoice totals unaffected. **Backward compatibility:** all Phase 6.1B tests (groups 33–45) continue passing. No Prisma schema changes. No migrations. No backend routes. No Electron IPC. No new npm packages. |
| **Print Designer — Phase 6.1B (Advanced Line Items & Totals)** | `stable-print-designer-phase6-1b-v1` | Extends the `lineItemsTable` element type with document-level totals binding, zero-column auto-hiding, row striping, and configurable alignment. **Architecture:** Purely frontend, no Prisma, no backend routes, no Electron IPC, no new npm packages. **Type changes (`templateStudioTypes.ts`):** `LineItemsTableElement` extended with `autoHideZeroColumns?: boolean`, `rowStriping?: boolean`; `totals` object extended with `labelAlign?: 'start'|'center'|'end'` and `valueAlign?: 'start'|'center'|'end'`. **New document totals infrastructure (`lineItemsResolver.ts`):** `DocumentTotals` interface (`subtotal/discount/tax/grandTotal: string`); `safeFmtStr(val)` — strips commas, parses float, returns `'0.000'` for NaN/Infinity/missing; `resolveInvoiceDocumentTotals(data)` reads `data.subtotal/discount/tax/grandTotal` directly; `resolveQuotationDocumentTotals(data)` falls back `subtotal → data.subtotal ?? data.total`, `grandTotal → data.grandTotal ?? data.total`. **Renderer (`TemplateStudioRenderer.tsx`):** `REQUIRED_LINE_ITEM_FIELDS = new Set(['description', 'total'])` — these two columns are never auto-hidden; `isAllZeroOrEmpty(rows, field)` checks all rows return `''`, `'0'`, or `'0.000'`; `renderLineItemsTableEl` now takes 4 params `(el, lineItems, docType, data)` — resolves `docTotals` from `docType === 'invoice' ? resolveInvoiceDocumentTotals(data) : resolveQuotationDocumentTotals(data)`; filters visible columns with `autoHideZeroColumns`; RTL cell align `'start' → right`, `'end' → left`, `'center' → center`; row striping on odd rows (0-indexed) `COLOR_TOKEN_MAP.light` (`#f3f4f6`) with `printColorAdjust: 'exact'`; print-safe CSS: `thead { display: table-header-group }`, `tfoot { display: table-footer-group }`, `tr { pageBreakInside: 'avoid' }`; footer Arabic labels: الإجمالي قبل الخصم / الخصم / الضريبة / الإجمالي النهائي; `totals.labelAlign` (default `'end'`) and `totals.valueAlign` (default `'end'`). **Editor (`TemplateStudioEditor.tsx`):** 8 new controls in "خيارات العرض" section: `autoHideZeroColumns` checkbox, `rowStriping` checkbox; `labelAlign` select (start/center/end → يمين/وسط/يسار); `valueAlign` select; all totals checkboxes with `aria-label`. **Validation (`templateStudioUtils.ts`):** `autoHideZeroColumns` non-boolean rejected; `rowStriping` non-boolean rejected; `totals.labelAlign`/`valueAlign` must be `'start'|'center'|'end'` or undefined (invalid values rejected with error "محاذاة إجمالي غير صالحة"). **Backward compatibility:** All 6.1B fields are optional (`?`) — existing Phase 6.1A templates pass validation unchanged. **Test suite:** 23 new test groups (tests 33–45) in `templateStudio.test.ts`: `resolveInvoiceDocumentTotals` formatting, `resolveQuotationDocumentTotals` fallback, missing data fallbacks (both → `0.000`), NaN/Infinity blocked, `autoHideZeroColumns` validation, `rowStriping` validation, `totals.labelAlign`/`valueAlign` validation, Phase 6.1A backward compatibility, required columns always kept, `autoHideZeroColumns` with all-zero column, complete 6.1B totals object, pre-formatted KWD round-trip, quotation explicit subtotal preferred. **Frontend tests: 490 total (24 files).** No Prisma schema changes. No migrations. No backend routes. No Electron IPC. No new npm packages. |
| **Print Designer — Phase 6.1A (Dynamic Line Items Table)** | `stable-print-designer-phase6-1a-v1` | Adds a new `lineItemsTable` discriminated union element type to the Template Studio WYSIWYG editor. **Architecture:** Purely frontend, no Prisma schema changes, no backend routes, no Electron IPC, no new npm packages. **New discriminated union member `LineItemsTableElement`:** extends `BaseElement` with `columns: LineItemsColumn[]`, `headerStyle: TableHeaderStyle`, `rowStyle: TableRowStyle`, `borderStyle: TableBorderStyle`, `totals?: { showSubtotal? showDiscount? showTax? showGrandTotal? }`. **Column type (`LineItemsColumn`):** `{ id, field: AllowedLineItemField, label, width, align: 'start'|'center'|'end', visible }`. **Allowlists:** `INVOICE_LINE_ITEM_FIELDS` (7 fields: `index, description, quantity, unit, unitPrice, discount, total`); `QUOTATION_LINE_ITEM_FIELDS` (6 fields: no `discount`). **Data resolvers (new file `lineItemsResolver.ts`):** `resolveInvoiceLineItems` maps `FullInvoice.items` → `NormalizedLineRow[]`; `resolveQuotationLineItems` maps `QuotationItem[]` → `NormalizedLineRow[]` (computes total as qty×unitPrice); `fmtNum` formats KWD to 3 decimal places via `toLocaleString('en-US', {minimumFractionDigits:3, maximumFractionDigits:3})`; `normalizeColumnWidths` distributes 100% across visible columns only; `getDefaultInvoiceColumns()` returns 7 columns (`discount` hidden, width 0); `getDefaultQuotationColumns()` returns 6 columns. **Renderer (`TemplateStudioRenderer.tsx` extended):** `NormalizedLineRow[]` passed as optional `lineItems` prop (backward-compatible, defaults to `[]`); `tableCellAlign(align)` maps RTL-aware alignment (`'start'` → `right`, `'end'` → `left`, `'center'` → `center`); `renderLineItemsTableEl` renders `<table>/<thead>/<tbody>/<tfoot>` using token-only styles; table element uses `overflow: visible` (not `hidden`) for print. **Editor (`TemplateStudioEditor.tsx` extended):** "جدول بنود" toolbar button; default element at x:20, y:80, w:170, h:70; property panel with column visibility/label/width/align/reorder controls, header/row/border style selectors, totals toggles; accessible labels on all form elements. **Validation extended (`templateStudioUtils.ts`):** `validateElement` `lineItemsTable` branch — rejects empty columns, duplicate IDs, disallowed field names (error "حقل جدول غير مسموح"), unsafe labels (error "تسمية عمود غير آمنة"), invalid align values, negative widths, non-boolean totals flags. **Page integration:** `InvoicePreview.tsx` passes `resolveInvoiceLineItems(data.items)` to `TemplateStudioRenderer`; `Quotation.tsx` passes `resolveQuotationLineItems(printFields.items)`. **Test suite:** 17 new test groups (tests 18–32) added to `templateStudio.test.ts` covering: `getDefaultInvoiceColumns` / `getDefaultQuotationColumns` structure and visibility, `resolveInvoiceLineItems` (empty items, single item, KWD formatting), `resolveQuotationLineItems` (empty items, total computation, no discount field), `normalizeColumnWidths` (single visible, all visible, visible-only normalized, zero visible), `validateElement lineItemsTable` (empty columns, duplicate IDs, disallowed field, unsafe label, negative width, invalid align, non-boolean totals), `lineItemsTable` roundtrip (import/export preserves columns), `ALLOWED_ELEMENT_TYPES` includes `lineItemsTable`. **Deferred (not in this phase):** document-level discount/tax computed from line items (totals section shows placeholders only). No Prisma schema changes. No migrations. No backend routes. No Electron IPC. No new npm packages. |
| **Print Designer — Phase 6.0 (Universal WYSIWYG Template Studio)** | `stable-print-designer-phase6-v1` | Additive WYSIWYG canvas-based template authoring layer for invoice and quotation documents. **Optional mode only** — existing React templates remain the default; studio is toggled per-preview session (default OFF) and never replaces Phase 1–5D.2. **Architecture:** Purely frontend, settings-only storage, no Prisma schema changes, no migrations, no backend routes, no Electron IPC, no new npm packages. **Storage:** Three Settings API keys — `print.templateStudio.templates` (JSON blob: `TemplateStudioSettings v1`), `print.templateStudio.active.invoice`, `print.templateStudio.active.quotation` (template IDs). **8 element types** (discriminated union on `type`): `text` (static label), `dynamicField` (allowlisted data binding), `qr` (QR code via existing `qrcode@1.5.4`), `barcode` (CSS bar placeholder), `image` (data URL only, 1 MB limit), `line` (H/V separator), `rect` (filled rectangle), `circle` (filled circle). **Dynamic field allowlists:** `INVOICE_ALLOWED_FIELDS` (10 fields: `invoice.number/date/customerName/customerAddress/total/subtotal/discount/tax/grandTotal/notes`) and `QUOTATION_ALLOWED_FIELDS` (6 fields: `quotation.number/date/customerName/customerAddress/total/notes`) — no arbitrary paths, no SQL, no eval, no prototype access. **Type system:** `StudioFontSize` / `StudioFontWeight` / `StudioTextColor` / `StudioTextAlign` / `StudioColorToken` token enums; all style values map to hardcoded CSS via lookup tables in the renderer — no arbitrary CSS accepted. **A4 renderer:** `TemplateStudioRenderer.tsx` — 794×1123 px canvas (`PX_PER_MM = 794/210`); all element positions stored in mm; CSS `transform: scale(scale)` for optional downscaling; no `dangerouslySetInnerHTML` anywhere. **Editor canvas:** `TemplateStudioEditor.tsx` — 560×793 px editor canvas (`EDITOR_PX_MM = 560/210`); full-screen dark overlay (`zIndex: 9000`); three-panel RTL layout (left panel 200px / canvas flex:1 / right panel 220px); `setPointerCapture` drag on canvas elements; arrow-key movement; Delete/Backspace to remove selected element (skips INPUT/TEXTAREA targets). **Template CRUD:** create blank, duplicate, rename (sanitized, max 60 chars), delete, set-as-active per doc type. **Import/Export JSON:** `importTemplate()` validates version + full template shape + element allowlists before accepting; `exportTemplate()` produces `{ version: 1, template }` JSON blob; `URL.createObjectURL` for download. **Security:** `sanitizeTemplateName` strips `<>"';&`; image src enforced to `data:image/` prefix; `isDataUrlWithinLimit` rejects images >1 MB; `resolveDynamicField` returns `''` for any field not in allowlist; import rejects unknown element types; no prototype pollution paths. **New hook:** `useTemplateStudio(docType)` — calls `GET /settings`, parses studio keys, returns `{ activeTemplate, loading }`; silently degrades on error (null = use existing template). **Settings integration:** `Settings.tsx` — "Template Studio" row in print card with "فتح Template Studio" button; `<TemplateStudioEditor onClose>` rendered when open. **Invoice integration:** `InvoicePreview.tsx` — `useTemplateStudio('invoice')` + `useState(false)` toggle; studio checkbox only shown when `studioTemplate !== null && previewMode === 'engine'`; `<TemplateStudioRenderer>` overlays when toggled. **Quotation integration:** `Quotation.tsx` — same pattern; IIFE for total computation (no `money` import in Quotation). **Test suite:** 42 tests across 17 describe blocks in `templateStudio.test.ts` covering: `sanitizeTemplateName` (XSS stripping, length), `generateElementId` (format, uniqueness), `resolveDynamicField` (allowlist enforcement, prefix stripping, empty on unknown), `isAllowedField` (both doc types), `parseTemplateStudioSettings` (valid, wrong version, non-array templates, malformed JSON, null), `validateElement` (text/dynamicField/image/line/rect/circle, bad field, oversized image, proto pollution attempt), `validateTemplate` (missing id/name, too-long name, unknown docType, bad page size, element passthrough), `importTemplate` (invalid JSON, wrong version, missing template, bad element, valid roundtrip), `exportTemplate` (structure), `estimateDataUrlBytes` / `isDataUrlWithinLimit` (1 MB boundary), `cloneTemplate` (new id, name suffix), `createBlankTemplate` (both doc types), `getActiveTemplate` (matching, wrong doc type, no active id), injection attempt rejected. No Prisma schema changes. No migrations. No backend routes. No Electron IPC. No new npm packages. |
| **Print Designer — Phase 5D.2 (Universal Layout Designer)** | `stable-print-designer-phase5d2-v1` | Transforms the Print Designer into a true Universal Layout Designer supporting drag, resize, rotation, z-index, alignment, multi-selection (Ctrl+Click / Shift+Click), smart guides (SVG, mm-calibrated), rulers (H+V, mm), lock/unlock, hide/show, copy/paste/duplicate, arrow-key movement (Shift=10px, Alt=0.5px fine), and Import/Export Layout JSON. **Architecture:** CSS-transform injection via `<style>` tag (`LayoutOverrideStyles`) targeting `[data-designer-id]` — applies identically during interactive view and `window.print()`. **New settings key:** `print.layoutOverrides` (JSON) stored via existing `PUT /settings`. **New types:** `layoutOverrideTypes.ts` — `LayoutElementOverride` (`x/y/rotation/scaleX/scaleY/zIndex/opacity/hidden/locked`), `AllLayoutOverrides` (`{ invoice: DocumentLayoutOverrides; quotation: DocumentLayoutOverrides }`), `LAYOUT_ELEMENT_IDS`, `LAYOUT_ELEMENT_LABELS` (Arabic). **New utilities:** `layoutOverrideUtils.ts` — `clampLayoutElement`, `buildLayoutStyleSheet`, `layoutElementToCSS`, `parseAllLayouts`, `patchDocumentLayout`, `serializeAllLayouts`, `getLayoutElement`. `designerUtils.ts` extended — `PX_PER_MM = 794/210`, `mmToPx`, `pxToMm`, `computeSmartGuides`, `GuideLine`, `ElementRect`. **New hook:** `useLayoutDesigner.ts` — `LayoutDesignerHandle` interface (activate/deactivate, selectedIds Set, drag/resize/rotation state machines via Pointer Events API, 30-entry history, clipboard, zoom/grid/snap, export via `URL.createObjectURL`, import via `FileReader`, `save()` to settings). **New components:** `LayoutOverrideStyles.tsx` (injects `<style>` tag), `SmartGuides.tsx` (SVG guide lines, `#3b82f6`, dashed, axis-correct), `UniversalDesignerOverlay.tsx` (547 lines: 24px ruler with mm marks, drag handles, 8 resize handles, rotation handle at top:-24, keyboard handler, status bar), `LayoutDesignerPanel.tsx` (260 lines: RTL panel, sliders for X/Y/rotation/scaleX/scaleY/opacity/zIndex, 6 alignment buttons, lock/hide/copy/paste/duplicate/reset, grid controls, import/export). **Template instrumentation:** `InvoiceDesign1.tsx` + `InvoiceDesign1Blank.tsx` footer `<div>` gets `data-designer-id="invoice.footerBlock"`. **Integration:** `useCompanyBranding.ts` extended to load `print.layoutOverrides` alongside existing keys; `InvoicePreview.tsx` and `Quotation.tsx` wire `useLayoutDesigner` + `UniversalDesignerOverlay` + `LayoutDesignerPanel` with `🔲 تخطيط` toolbar button (engine mode). **Test fix:** `designerUniversal.test.ts` updated from Phase 5C assertion (`DESIGNER_CAPABILITIES.*=false`) to Phase 5D.2 (`*=true`). **36 new unit tests** (11 `layoutOverride.test.ts`, 5 `smartGuides.test.ts`, 20 `useLayoutDesigner.test.ts`). No Prisma schema changes. No migrations. No backend routes. No Electron IPC changes. No new npm packages. |
| **Print Designer — Phase 5D.1 (Editable Static Text)** | `stable-print-designer-phase5d1-v1` | Double-click inline editing for static text labels in invoice and quotation print templates. 4 editable fields per doc type: `titleAr`, `titleEn`, `footerAccountant`, `footerManager`. **Architecture:** `staticTextTypes.ts` — `StaticTextKey` union (8 keys across invoice/quotation), `StaticTextOverrides` record, `DEFAULT_STATIC_TEXT`, `STATIC_TEXT_LIMITS` (per-key char limits). `staticTextUtils.ts` — `getStaticText()` (override → designDefault → DEFAULT_STATIC_TEXT), `validateStaticText()`, `escapeStaticText()`, `parseStaticTextOverrides()` (safe parse + key validation, strips unknowns + non-strings), `serializeStaticTextOverrides()`. `useStaticTextDesigner.ts` — manages overrides state, `startEdit/updateDraft/commitEdit/cancelEdit`, `save()` (PUT `print.staticTextOverrides`), `useEffect` sync for async branding load. `InlineTextEditor.tsx` — floating positioned textarea; Enter commits, Shift+Enter inserts newline, Escape cancels; animated pulse ring on active element. **Template integration:** all 10 `InvoiceDesign*.tsx` + `QuotationBase.tsx` carry `data-designer-editable="true"` + `data-designer-key="…"` on static text spans; `getStaticText(staticText, key, designDefault)` for fallback chain. **Overlay wiring:** `BrandingDesignerOverlay` `handleDocDblClick` finds `closest('[data-designer-editable]')`, computes position relative to `docRef`, calls `staticTextDesigner.startEdit()`, renders `InlineTextEditor`; `onSave` prop threads through to `BrandingDesignerToolbar` so toolbar save button fires `Promise.all([designer.save(), textDesigner.save(), staticTextDesigner.save()])`. **Bug fixes (found in smoke test):** EngineComponent moved inside overlay so dblclick fires; toolbar `onSave` wired to all-3-saves (was calling only `designer.save()`); `useEffect` in `useStaticTextDesigner` syncs from server on async branding load (useState initializer ran before API response). **18 new unit tests** in `staticTextDesigner.test.ts`: `getStaticText` fallback chain, `validateStaticText` (empty, over-limit, at-limit), `escapeStaticText` HTML safety, `parseStaticTextOverrides` (valid JSON, unknown keys stripped, non-string stripped, malformed, non-object), `serializeStaticTextOverrides` round-trip, `DEFAULT_STATIC_TEXT` completeness, dynamic-field lock (source-level guard). Settings key: `print.staticTextOverrides` (JSON, existing Settings table). No Prisma schema changes. No migrations. No backend routes. No IPC. No new npm packages. |
| **Print Designer — Phase 5C (Universal Designer Foundation)** | `stable-print-designer-phase5c-v1` | Architecture foundation introducing `DesignerElement` as the shared abstraction unifying branding and text selection. **New types (`designerTypes.ts`):** `DesignerElementKind` = `'branding' \| 'text' \| 'image' \| 'shape' \| 'qr' \| 'barcode'` (image/shape/qr/barcode are type-only placeholders — no UI); `DesignerElement` (`id`, `kind`, `documentType`, `label`); `DesignerSelection`; `DesignerCommand` = `'copy' \| 'paste' \| 'duplicate' \| 'lock' \| 'hide' \| 'rotate'`; `DesignerMode` = `'branding' \| 'text' \| 'idle'`; `DesignerCapabilities` (all false in Phase 5C); `DESIGNER_CAPABILITIES` constant; `isBrandingElement()` / `isTextElement()` type guards. **New hook (`useDesignerSelection.ts`):** `selectedElement: DesignerElement \| null`, `selectElement()`, `clearSelection()`, `isSelected(id)`, `getPrimarySelection()`, `isBrandingSelection()`, `isTextSelection()` — standalone, ready to be wired into parent pages in Phase 5D. **New DOM utility (`designerDom.ts`):** `getDesignerElementFromTarget(target: HTMLElement)` — reads universal `data-designer-type/id/doc/label` attributes via `closest()`; validates kind against `VALID_KINDS` Set; returns `null` for unknown kinds or no match. **Panel update (`BrandingDesignerPanel.tsx`):** optional `selection?: DesignerElement \| null` prop; when provided, drives mode switching via `isBrandingElement`/`isTextElement` instead of `textStyleDesigner.selectedArea` (backward-compat: `undefined` falls back to legacy path); empty state view when `selection === null`; disabled rotation placeholder (`title="الدوران — قريباً"`, opacity 0.45). **Overlay update (`BrandingDesignerOverlay.tsx`):** `handleDocClick` now uses `getDesignerElementFromTarget` instead of manual `.closest('[data-designer-type="text"]')` — single DOM detection entry point; added Ctrl+C / Ctrl+V / Ctrl+D no-op keyboard handlers (reserved for Phase 5D). **Toolbar update (`BrandingDesignerToolbar.tsx`):** 5 disabled placeholder buttons added between Snap and Save: نسخ (Ctrl+C), لصق (Ctrl+V), تكرار (Ctrl+D), قفل, إخفاء — all with `disabled` prop + "قريباً" tooltip. **14 new tests** in `designerUniversal.test.ts` covering all type guards, `DESIGNER_CAPABILITIES`, and `getDesignerElementFromTarget` (null ancestor, invalid kind, text kind full attributes, branding kind, missing label fallback, missing doc fallback). No Prisma schema changes. No migrations. No backend routes. No IPC. No new npm packages. All callers backward-compatible. |
| **Print Designer — Phase 5B (Text Styling Controls)** | `stable-print-designer-phase5b-v1` | Token-based text styling inside the existing Designer Mode. Clicking any text zone in the document switches the side panel from branding controls to text-style controls for that area. **Architecture:** `textStyleTypes.ts` — finite token unions (fontSize: tiny/small/normal/large/xlarge, fontFamily: cairo/ibmPlexArabic/tajawal/arial, fontWeight: normal/bold/extrabold, color: default/dark/primary/secondary/muted/white, align: inherit/right/center/left, lineHeight: tight/normal/relaxed/loose, letterSpacing: tight/normal/wide, tableBgColor: default/light/primary, tableBorderColor: default/light/medium/dark/none) with `*_LABELS` record maps for the panel UI. `textStyleOverrides.ts` — token→CSS maps, `applyTextElementStyle(style, context)` (context='title': 12–18pt range, context='cell': 9–12pt range), `applyTableHeaderStyle`, `applyTableBorderStyle` (returns `--designer-table-border` CSS property on table element), `parseTextStyleSettings`, `serializeTextStyleSettings`, `normalizeTextStyleSettings`, all `isValid*` validators. `useTextStyleDesigner.ts` hook — `selectedArea`, `updateArea`, `resetArea`, `resetDocType`, `isDirty`, `save` (persists to `print.textStyleOverrides` settings key). **Settings key:** `print.textStyleOverrides` (JSON string, existing Settings table, no migration). **Supported areas (per doc type, independently stored):** `title`, `customerBlock`, `metadataLabels`, `sectionTitle`, `introText`, `tableHeader`, `lineItem`, `totals`, `tableBorder`, `terms`. **Designer integration:** `BrandingDesignerOverlay` detects clicks on `[data-designer-type="text"]` elements and routes to `textStyleDesigner.setSelectedArea`; amber highlight rect tracks selected area via `querySelector`. `BrandingDesignerPanel` context-switches to `TextAreaControls` when `selectedArea` is set; `onSave` prop saves both branding + text style concurrently via `Promise.all`. **Template coverage:** All 10 `InvoiceDesign*.tsx` + `QuotationBase.tsx` carry `data-designer-type/id` attrs + `applyTextElementStyle` spreads on all text zones; `applyTableBorderStyle` on `<table>`; `applyTableHeaderStyle` on `<th>`. **CSS variable integration (Phase 5B Polish):** All 6 CSS modules (`InvoiceDesign1–5.module.css`, `QuotationShared.module.css`) consume `var(--designer-table-border, <original>)` on `thead th`, `tbody td`, `tfoot td` — fallback preserves exact original appearance when no override set. tpl1/tpl3 theme overrides in QuotationShared also wired. **46 new tests** in `textStyleOverrides.test.ts` (14 groups: parse valid JSON, parse invalid, unknown tokens stripped, 'default' produces no CSS, font-size mapping, font-family, color, alignment RTL-safe, table header bgColor, table border, invoice/quotation independence, serialize round-trip, CSS injection blocked, token validators). No Prisma schema changes. No migrations. No backend routes. No IPC channels. No new npm packages. |
| **Print Designer — Phase 5A.1 (Professional UX Polish)** | `stable-print-designer-phase5a1-v1` | 14 UX improvements on the inline WYSIWYG branding designer. **Blue Ink Rendering** — CSS filter (Original / Blue Ink / Black) applied to signature and stamp images via `inkMode`, persisted in localStorage, flows through `CompanyPrintData.inkMode` to InvoicePreview legacy view and all quotation templates via QuotationBase; `inkFilter.ts` utility (`sepia/saturate/hue-rotate` for blue-ink, `grayscale/brightness/contrast` for black). **Real Image Handles** — transparent full-size overlay boxes replace old ✥ circle icons; grab/grabbing cursors; dashed blue hover on unselected; `ElemRect` tracks full bounding box. **Horizontal Toolbar** — `BrandingDesignerToolbar.tsx` (new file): Undo, Redo, Zoom select with Fit Width / Fit Page, Grid toggle, Snap toggle, Save, Exit. **Better Panel** — collapsible (▶/◀), 6 grouped sections: Element / Position+Size / Appearance / Alignment / Reset / Shortcuts; ink mode selector in Appearance. **Better Zoom** — `fit-width` and `fit-page` via ResizeObserver measuring container; `setFitWidthZoom` / `setFitPageZoom` callbacks from overlay to hook. **Better Grid** — Fine (2) / Medium (5) / Coarse (10) labelled GRID_PRESETS. **Better Selection** — blue 2px border + 4 corner handles (8px squares) + center dot on selected element. **Better Keyboard** — Esc=exit designer, Delete=reset selected element, Ctrl+0=fit-page, Ctrl+S=save. **Icon Alignment** — ↔ ↕ ⬆ ⬇ Unicode icon buttons. **Status Bar** — bottom strip: element name, X, Y, Scale, Zoom, Snap indicator. **Empty State** — warning notice when no sig/stamp uploaded, with link to Settings. **Cursor** — `grab` on hover, `grabbing` while dragging. **Professional Styling** — section headers, compact spacing, consistent shadows throughout. No Prisma, no migrations, no backend routes, no IPC, no npm packages. |
| **Print Designer — Phase 5A (Inline WYSIWYG Branding Designer)** | `stable-print-designer-phase5a-v1` | In-document WYSIWYG designer mode directly inside `InvoicePreview.tsx` (legacy view) and `Quotation.tsx` (engine mode). "🔧 وضع التصميم" toolbar button activates a live editing session on the real rendered document with real data and real images. Shared designer engine: `useBrandingDesigner` hook (layout ref + history ref + drag ref + zoom/grid/snap/save), `BrandingDesignerOverlay` (rulers, SVG grid, `getBoundingClientRect` drag handles via `[data-bd-type]` query), `BrandingDesignerPanel` (floating RTL panel — X/Y/scale/opacity/zIndex sliders, alignment, undo/redo, reset, save). Pure-function utilities in `designerUtils.ts` (snapToGrid, formatUnit, keyboardMove, historyPush/Undo/Redo — max 30 entries). Keyboard: arrow keys (1 unit), Shift+arrow (10 units), Ctrl+Z/Ctrl+Shift+Z undo/redo. Zoom 50/75/100/150/200/Fit. Snap-to-grid. `data-bd-type="signature/stamp"` added to `QuotationBase.tsx` (covers all 10 quotation designs). Post-save layout sync via `onSaved` callback + `savedBrandingLayout` state (no page refresh). `printData` useMemo in InvoicePreview uses `effectiveBrandingLayout`. `onPointerCancel` + `releasePointerCapture` on drag handles for safe gesture termination. 25 new unit tests (`designerUtils.test.ts`). No schema changes, no migrations, no backend routes, no IPC, no new dependencies. |
| **Print & Document Suite — Phase 4** | `stable-print-document-suite-phase4-v1` | Visual Signature & Stamp Position Designer. `BrandingLayoutDesigner` modal with live preview, drag-and-drop, per-element sliders (X/Y offset ±80/60 px, scale 0.4–2.5, opacity 0.2–1, z-index). Per-document-type independence (invoice vs quotation stored separately). Applied to all 10 invoice templates + `QuotationBase.tsx` + legacy `InvoicePreview`. Stored in `print.brandingLayout` Settings key via existing `PUT /settings`. Fail-safe JSON parse with `DEFAULT_BRANDING_LAYOUT` fallback. 16 new unit tests (`brandingLayout.test.ts`). No schema changes, no migrations, no new IPC, no new dependencies. Phase 1/2/3 compatibility fully preserved. |
| **Executive Decision Center — Phase 1** | `stable-executive-decision-center-phase1-v1` | مركز القرار التنفيذي — 7 integrated features: Financial Summary (8 KPI cards, top debtors, this/last month comparison), Decision Cards (8 intelligent insight cards by priority), Executive Alerts V3 (9 alert types, HIGH/MEDIUM/LOW, deduplicated, sorted), KPI Timeline (1m/3m/6m/12m Recharts area charts), Company Health Score (0–100, 6 weighted components, EXCELLENT/GOOD/WATCH/RISK), Executive Recommendations V2 (rule-based, max 10), PDF export via existing `printToPDF` Electron IPC. New `/api/executive` module reusing `dashboard.read` permission. 30 new Vitest tests. No schema changes, no migrations, no new packages. |
| **Print & Document Suite — Phase 3** | `stable-print-document-suite-phase3-v1` | Native PDF export via Electron `webContents.printToPDF`. New `pdf:export` IPC channel. `⬇️ PDF` button in InvoicePreview toolbar (both modes) and Quotation engine toolbar. `pdfFilename.ts` utility with Windows-safe sanitization. 10 new tests. No migration, no backend, no schema changes. |
| **Print & Document Suite — Phase 2** | `stable-print-document-suite-phase2-v1` | Per-print signature/stamp controls in InvoicePreview + Quotation engine toolbar. Session-only overrides; Settings never modified. `brandingHelpers.ts` utility. 15 new tests. No migration, no IPC, no schema changes. |
| **Print & Document Suite — Phase 1** | `stable-print-document-suite-phase1-v1` | Digital manager signature + company stamp. Base64 storage in Settings table. `useCompanyBranding` hook. InvoicePreview (engine + legacy) + Quotation engine + all 10 invoice templates + QuotationBase. Canvas resize (never upscale). 300 KB output guard. 15 new tests. No migration, no IPC, no schema changes. |
| **Executive Intelligence Bundle — Phase 2** | `stable-executive-intelligence-bundle-phase2-v1` | `ExecutiveIntelligenceV2Panel`: KPI comparison, monthly revenue trend, contract health tracker, smart recommendations engine, forecast chart, alerts panel. Dashboard flicker fix. |
| **Executive Intelligence Bundle — Phase 1** | `stable-executive-intelligence-bundle-phase1-v1` | Executive KPI cards, alerts, financial forecast, dashboard foundation for Phase 2. |
| **Contract Profitability Dashboard — Phase 1** | `stable-contract-profitability-phase1-v1` | Contract Financial Summary — per-contract revenue, expense, and profitability analysis. |
| **Financial Receivables Center — Phase 1** | `stable-financial-receivables-phase1-v1` | Customer Statement, Receivables Aging, Customer Balances, Collections Summary reports. Gemini-hardened. |
| **Stabilization Audit Sprint 1** | `stable-stabilization-audit-sprint1-v1` | 20 critical/high/medium production fixes across multiple modules. |
| **Critical Hardening Sprint 1** | `stable-critical-hardening-sprint1-v1` | Security hardening, stability fixes, print and reports improvements. |
| **Print Template Engine — Phase 2B (Quotation)** | `stable-print-engine-quotation-phase2b-v1.1` | 10 new quotation templates (Designs 1–5 + blank variants). `QuotationBase.tsx` shared renderer. `adaptFormToQuotationPrintData` adapter. `sanitizePrintText` utility. 61 new tests. Registry total: **30 templates**. |
| **Print Template Engine — Phase 1** | `stable-print-template-engine-phase1-v1` | React print template engine foundation. 26 reference templates (invoice ×10, quotation ×6, PO ×4, RFQ ×6). Registry, storage, service, builder, and hooks layers. 53 tests. |
| **Forms & Operations Polish Pack v3** | `stable-forms-operations-polish-v3` | Quotation standalone form (`Quotation.tsx`). Purchase Request standalone form. Draft/restore/clear for all 10 form pages. Print Log search. `generateFormNumber` extended. |
| **UI Typography Refresh v1** | `stable-ui-typography-refresh-v1` | IBM Plex Sans Arabic as primary UI font. Tajawal as second fallback. Local WOFF2 assets, no CDN. Print/form pages retain Cairo. |
| **Forms Polish Pack v2** | `stable-forms-polish-pack-v2` | Print Draft store (session-only Zustand). Print Log store + `PrintLogPanel`. Translate Selection buttons for contract fields. `lang="en"` on all number/date inputs. |
| **Forms Completion Pack — Phase 1** | `stable-forms-completion-pack-phase1-v1` | Employment Contract EN fields. Salary Advance print fields. Leave Request auto-calc days. Return To Work fields. Performance Evaluation period/grade/override. Employee Warning date field. |
| **Print Profiles + HR Forms Completion** | `stable-print-profiles-forms-completion-v1` | `PrintProfile` registry (`plain-a4`, `letterhead`). `PrintProfileToggle` component. `FormLayout` profile-aware `@page` margins. All 8 HR form pages migrated. Employment Contract two-page TypeScript fixes. |
| **Employment Contract — Two-Page Layout Fix** | `stable-employment-contract-two-page-layout-v1` | Replaced flowing wrapper with two explicit sibling page containers. Chromium print fragmentation fix. |
| **Employment Contract Form** | `stable-employment-contract-form-v1` | Kuwait Public Authority for Manpower bilingual form. 16 articles, 2-page A4. Backend read-only GET (`forms.read`). No migration. |
| **Ultimate Professional UX Pack** | `stable-ultimate-professional-ux-pack-v1` | Employment Contract column layout fix. 5 HR form template field additions. ResourcePage sort/filter/pagination. Cheques `tafqeet` integration. `BankSalaryAnalytics` page. Dashboard stabilization. |
| **Auto Backup — Phase 1** | `stable-auto-backup-phase1-v1` | Daily node-cron scheduler in Electron main. WAL-safe copy. Retention policy (default 30 AUTO). Startup catch-up. `LastAutoBackupCard` dashboard widget. Settings controls. |
| **Page-Level Improvements — Phase 1** | *(merged)* | Persisted search/filter/page state across ResourcePage instances. Refresh actions. |
| **Payroll System** | *(stable)* | Full payroll management + approval workflow + payslip print layout. |
| **Accounting Module** | *(stable)* | Chart of Accounts, journal entries, transaction ledger, P&L. |
| **Inventory Module** | *(stable)* | Material tracking, issue management. |
| **Data Import** | *(stable)* | 7 entities: employees, customers, equipment, suppliers, project prices, contracts, expenses. FK code resolution. |
| **Audit Log** | *(stable)* | Server-side paginated `GET /api/audit`. Filter bar. Details drawer. |
| **Reports & Export Center** | *(stable)* | Excel/PDF export. Attendance, payroll, financial reports. |
| **Roles & Permissions (RBAC)** | *(stable)* | Role-based access. Permission keys format `<module>.<action>`. `SYSTEM_ADMIN` bypasses. |
| **Backup & Restore** | *(stable)* | Manual backup/restore via Electron IPC. Auto-backup via node-cron. |
| **Authentication** | *(stable)* | JWT (12h). bcrypt passwords. `authenticate` + `requirePermission` middleware. |

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
| `payroll` / `salaries` | Complete |
| `equipment` / `maintenance` | Complete |
| `transactions` / `accounting` | Complete |
| `reports` | Complete — Financial Receivables Center, Customer Statement, Aging, Balances, Collections |
| `dashboard` | Complete — Executive Intelligence V2, Financial Intelligence |
| `inventory` | Complete |
| `cheques` | Complete |
| `import` | Complete — 7 entities |
| `settings` | Complete — includes `print.*` branding keys (`print.signatureImage`, `print.stampImage`, `print.showSignature`, `print.showStamp`, `print.brandingLayout`, `print.textStyleOverrides`, `print.staticTextOverrides`, `print.layoutOverrides`, `print.templateStudio.templates`, `print.templateStudio.active.invoice`, `print.templateStudio.active.quotation`) |
| `backups` | Complete — manual + auto |
| `audit` | Complete |
| `forms` | Complete — 8 HR print endpoints |
| `prices` | Complete |
| `executive` | Complete — `/api/executive/decision-center` + `/api/executive/kpi-timeline`; reuses `dashboard.read` permission |
| `approval` | **Phase A complete** — `GET /api/approval-history/:entityType/:entityId`; `authenticate` only; IDOR guard via `hasModule()` + optional `historyPermission`; `ApprovalEngine` singleton at `@shared/services/approval.service`; Phase B: call `approvalEngine.register(config)` to activate |
| `statements` | **Complete** — `GET /api/statements/customers/:id` + `GET /api/statements/suppliers/:id` (`statements.read`); `GET /api/statements/customers/:id/export` + `GET /api/statements/suppliers/:id/export` (`statements.export`); shared `buildStatement()` engine in `@shared/services/statement.service` |
| `financial` | **Complete** — GL Report, Trial Balance, Aging Report, Journal Book, Financial Summary, Financial Dashboard. All endpoints orchestrate via `accountingService` and shared utilities. 11 routes: `GET /api/financial/gl-report[/export]`, `trial-balance[/export]`, `aging-report[/export]`, `journal-book[/export]`, `summary[/export]`, `dashboard-summary`. Permission modules: `gl`, `trialbalance`, `aging`, `journal`, `finreports`, `financialdashboard`. `@shared/services/financial/dashboard-summary.service.ts` (45s TTL cache). `@shared/services/financial/export/summary.export.adapter.ts`. |
| `verification` | **Complete — Print Polish Batch 1** — `GET /api/verify/:uuid` (requires `authenticate`). Looks up invoice by `verificationUuid`; returns `{ found, documentType, documentNumber, status, statusAr, issueDate, updatedAt, isCancelled, isApproved }`. Never exposes PII (no amount/customer/supplier fields). `arabicLabels.ts` (backend-only) provides `translateInvoiceStatusAr()`. 11 Vitest tests. |

### Frontend (`frontend/src/pages/`)

| Page | Status |
|------|--------|
| `Dashboard.tsx` | Complete — dual-tab shell (عام/مالي) with `localStorage.getItem('dashboard.tab')` persistence; مالي tab gated by `financialdashboard.read`; General tab = `GeneralDashboardContent` (Executive Intelligence V2, Financial Intel, KPI cards, charts); Financial tab = `FinancialDashboardTab` |
| `FinancialCenter.tsx` | **Complete** — 5 tabs: statement (Customer/Supplier Statement), gl (GL Report), trialbalance (Trial Balance), journal (Journal Book), finreport (Financial Reports). URL-scoped date params per tab (fromDate/toDate, glFrom/glTo, frFrom/frTo). Dismissible migration banner on Statements.tsx |
| `Invoices.tsx` / `InvoicePreview.tsx` | Complete — InvoicePreview: engine + legacy + per-print branding + PDF export + **Phase 5A inline designer mode** + **Phase 5B text styling** + **Phase 5D.1 editable static text** + **Phase 5D.2 Universal Layout Designer** + **Phase 6.0 Template Studio (optional, default OFF)** + **Phase 6.1A — passes `resolveInvoiceLineItems(data.items)` to TemplateStudioRenderer for lineItemsTable elements** + **Print Polish Batch 1 — `verificationUuid` in `FullInvoice` type; `DocumentVerificationQR` rendered bottom-right of engine mode when uuid present** |
| `Quotation.tsx` | Complete — legacy form mode + engine template mode + per-print branding + PDF export (engine) + **Phase 5A inline designer mode (engine)** + **Phase 5B text styling** + **Phase 5D.1 editable static text** + **Phase 5D.2 Universal Layout Designer (engine mode)** + **Phase 6.0 Template Studio (optional, default OFF)** + **Phase 6.1A — passes `resolveQuotationLineItems(printFields.items)` to TemplateStudioRenderer for lineItemsTable elements** + **Phase 6.1C — passes explicit `subtotal/discount/tax/grandTotal` in studio renderer data map** |
| `Salaries.tsx` / `PayrollPayslip.tsx` | Complete |
| `Accounting.tsx` | Complete |
| `Reports.tsx` / `ReportPrint.tsx` | Complete |
| `Expenses.tsx` | Complete |
| `Maintenance.tsx` | Complete |
| `Inventory.tsx` | Complete |
| `Cheques.tsx` | Complete |
| `BankSalaryAnalytics.tsx` | Complete |
| `DataImport.tsx` | Complete |
| `AuditLog.tsx` | Complete |
| `Backup.tsx` | Complete |
| `Settings.tsx` | Complete — includes Document Branding section + **Phase 6.0 Template Studio button** |
| `Users.tsx` | Complete |
| `Forms.tsx` + 12 print pages | Complete — 8 HR forms + EmploymentContract + Quotation + PurchaseRequest |
| `Prices.tsx` | Complete |
| `ResourcePage.tsx` | Complete — generic CRUD with persisted state |
| `ExecutiveDecisionCenter.tsx` | Complete — 6-tab layout: Financial Summary, Decision Cards, Alerts V3, KPI Timeline, Health Score, Recommendations; PDF export via `window.manar.exportPdf()` |
| `Statements.tsx` | **Complete** — customer/supplier statement page; two tabs; entity picker; filter bar (fromDate/toDate/referenceType/search); 5 summary cards; color-coded transaction table with running balance; Excel export; export error feedback; invoice reference navigation |

---

## Print Engine

### Architecture

```
frontend/src/print-templates/
├── engine/          # Types, registry, template definitions, textStyleTypes.ts
├── adapters/        # companyData (createCompanyPrintData), apiTypes
├── builders/        # invoicePrintDataBuilder, quotationPrintDataBuilder
├── hooks/           # usePrintTemplate, useCompanyBranding (extended Phase 5D.2),
│                    # useBrandingDesigner, useLayoutDesigner.ts (Phase 5D.2)
├── components/      # PrintTemplateSelector, BrandingLayoutDesigner,
│                    # BrandingDesignerOverlay, BrandingDesignerPanel, BrandingDesignerToolbar,
│                    # UniversalDesignerOverlay.tsx (Phase 5D.2)
│                    # LayoutDesignerPanel.tsx (Phase 5D.2)
│                    # LayoutOverrideStyles.tsx (Phase 5D.2)
│                    # SmartGuides.tsx (Phase 5D.2)
│                    # DocumentVerificationQR.tsx (Print Polish Batch 1 — SVG QR via qrcode.toString())
├── designer/        # useTextStyleDesigner.ts (Phase 5B)
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
├── utils/           # brandingHelpers, brandingLayout, designerUtils (extended Phase 5D.2),
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
| Backend (Vitest) | 48 | 830 | All passing |
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

## Future Roadmap

### High Priority
- Quotation Legacy PDF export (deferred from Phase 3)
- **Approval Workflow — Phase B: integrate Expenses, Payroll, Invoices with `approvalEngine.register(config)`** ← Phase A foundation is live
- Signed PDF export with embedded digital signature

### Medium Priority
- Audit Log Viewer UI enhancements (export, advanced filters)
- Per-document signature policies (different signer per document type)
- Advanced print profiles (custom margins, watermarks)
- **Print Designer Phase 7B — PDF Template Import** (deferred from Phase 7A; requires Chromium/pdf.js parsing strategy)
- **Print Designer Phase 7C — Image/OCR Template Import** (deferred from Phase 7A; requires OCR backend or Tesseract.js integration)

### Low Priority
- Payroll → GL double-entry wiring (`PAYROLL_EXPENSE 5100` account exists, unused)
- Mobile Companion app
- Data Import Phase 4 — grouped-row engine (PurchaseOrders, GoodsReceipts, MaterialIssues)
- Integrations Center

---

## Deferred Accounting Notes

*(Do not implement until explicitly requested)*

1. **Double-counting audit** — Dashboard KPIs and report totals may double-count when both `Transaction` (legacy) and `JournalEntry` (GL) tables are summed.

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

*Last updated: 2026-06-25 — Print Designer Phase 7A released. HEAD `f5dcfc5` (merge commit). Tag `stable-print-designer-phase7a-docx-import-v1`. 830 backend tests (48 files) / 588 frontend tests (28 files). Phase 7A: DOCX Template Import — frontend-only module `docxImport/` (5 new files: `docxTypes.ts`, `docxMappings.ts`, `docxParser.ts`, `DocxImportWizard.tsx`, `__tests__/docxParser.test.ts`). New deps: `mammoth@1.9.0` + `jszip@3.10.1`. Flow-layout engine + Arabic normalization + 4-step wizard + 31 unit tests. `TemplateStudioEditor.tsx` wired with "استيراد DOCX" button. No backend changes. No Prisma schema changes. No IPC changes. Gemini APPROVED ✅.*
