# PROJECT_STATE.md — manarERP

> Live state document. Update at the end of every session.
> Read at session start after AGENTS.md and CLAUDE.md.

---

## Current Production Baseline

| Field | Value |
|-------|-------|
| **Branch** | `production` |
| **HEAD** | `4a2203e` — Merge Print Designer Phase 5A.1 Professional UX Polish into production |
| **Latest stable tag** | `stable-print-designer-phase5a1-v1` |
| **Remote sync** | `origin/production` — up to date |
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
| **Print Designer — Phase 5A.1 (Professional UX Polish)** | `stable-print-designer-phase5a1-v1` | 14 UX improvements on the inline WYSIWYG branding designer. **Blue Ink Rendering** — CSS filter (Original / Blue Ink / Black) applied to signature and stamp images via `inkMode`, persisted in localStorage, flows through `CompanyPrintData.inkMode` to InvoicePreview legacy view and all quotation templates via QuotationBase; `inkFilter.ts` utility (`sepia/saturate/hue-rotate` for blue-ink, `grayscale/brightness/contrast` for black). **Real Image Handles** — transparent full-size overlay boxes replace old ✥ circle icons; grab/grabbing cursors; dashed blue hover on unselected; `ElemRect` tracks full bounding box. **Horizontal Toolbar** — `BrandingDesignerToolbar.tsx` (new file): Undo, Redo, Zoom select with Fit Width / Fit Page, Grid toggle, Snap toggle, Save, Exit. **Better Panel** — collapsible (▶/◀), 6 grouped sections: Element / Position+Size / Appearance / Alignment / Reset / Shortcuts; ink mode selector in Appearance. **Better Zoom** — `fit-width` and `fit-page` via ResizeObserver measuring container; `setFitWidthZoom` / `setFitPageZoom` callbacks from overlay to hook. **Better Grid** — Fine (2) / Medium (5) / Coarse (10) labelled GRID_PRESETS. **Better Selection** — blue 2px border + 4 corner handles (8px squares) + center dot on selected element. **Better Keyboard** — Esc=exit designer, Delete=reset selected element, Ctrl+0=fit-page, Ctrl+S=save. **Icon Alignment** — ↔ ↕ ⬆ ⬇ Unicode icon buttons. **Status Bar** — bottom strip: element name, X, Y, Scale, Zoom, Snap indicator. **Empty State** — warning notice when no sig/stamp uploaded, with link to Settings. **Cursor** — `grab` on hover, `grabbing` while dragging. **Professional Styling** — section headers, compact spacing, consistent shadows throughout. **Regression** — TypeScript 0 errors (all 3 targets), Tests: 287 frontend (17 files) + 526 backend (29 files), all passing. No Prisma, no migrations, no backend routes, no IPC, no npm packages, no layout-JSON shape changes. |
| **Print Designer — Phase 5A (Inline WYSIWYG Branding Designer)** | `stable-print-designer-phase5a-v1` | In-document WYSIWYG designer mode directly inside `InvoicePreview.tsx` (legacy view) and `Quotation.tsx` (engine mode). "🔧 وضع التصميم" toolbar button activates a live editing session on the real rendered document with real data and real images. Shared designer engine: `useBrandingDesigner` hook (layout ref + history ref + drag ref + zoom/grid/snap/save), `BrandingDesignerOverlay` (rulers, SVG grid, `getBoundingClientRect` drag handles via `[data-bd-type]` query), `BrandingDesignerPanel` (floating RTL panel — X/Y/scale/opacity/zIndex sliders, alignment, undo/redo, reset, save). Pure-function utilities in `designerUtils.ts` (snapToGrid, formatUnit, keyboardMove, historyPush/Undo/Redo — max 30 entries). Keyboard: arrow keys (1 unit), Shift+arrow (10 units), Ctrl+Z/Ctrl+Shift+Z undo/redo. Zoom 50/75/100/150/200/Fit. Snap-to-grid. `data-bd-type="signature/stamp"` added to `QuotationBase.tsx` (covers all 10 quotation designs). Post-save layout sync via `onSaved` callback + `savedBrandingLayout` state (no page refresh). `printData` useMemo in InvoicePreview uses `effectiveBrandingLayout`. `onPointerCancel` + `releasePointerCapture` on drag handles for safe gesture termination. 25 new unit tests (`designerUtils.test.ts`). No schema changes, no migrations, no backend routes, no IPC, no new dependencies. Phases 1–4 fully preserved. Designer UI carries `.no-print` class — does not appear in print/PDF output. |
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
| **Roles & Permissions (RBAC)** | *(stable)* | Role-based access. Permission keys format `<module>.<action>`. `SYSTEM_ADMIN` bypass. |
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
| `settings` | Complete — includes `print.*` branding keys |
| `backups` | Complete — manual + auto |
| `audit` | Complete |
| `forms` | Complete — 8 HR print endpoints |
| `prices` | Complete |
| `executive` | Complete — `/api/executive/decision-center` + `/api/executive/kpi-timeline`; reuses `dashboard.read` permission |

### Frontend (`frontend/src/pages/`)

| Page | Status |
|------|--------|
| `Dashboard.tsx` | Complete — Executive Intelligence V2, Financial Intel, KPI cards, charts |
| `Invoices.tsx` / `InvoicePreview.tsx` | Complete — InvoicePreview: engine + legacy + per-print branding + PDF export + **Phase 5A inline designer mode** |
| `Quotation.tsx` | Complete — legacy form mode + engine template mode + per-print branding + PDF export (engine) + **Phase 5A inline designer mode (engine)** |
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
| `Settings.tsx` | Complete — includes Document Branding section |
| `Users.tsx` | Complete |
| `Forms.tsx` + 12 print pages | Complete — 8 HR forms + EmploymentContract + Quotation + PurchaseRequest |
| `Prices.tsx` | Complete |
| `ResourcePage.tsx` | Complete — generic CRUD with persisted state |
| `ExecutiveDecisionCenter.tsx` | Complete — 6-tab layout: Financial Summary, Decision Cards, Alerts V3, KPI Timeline, Health Score, Recommendations; PDF export via `window.manar.exportPdf()` |

---

## Print Engine

### Architecture

```
frontend/src/print-templates/
├── engine/          # Types, registry, template definitions
├── adapters/        # companyData (createCompanyPrintData), apiTypes
├── builders/        # invoicePrintDataBuilder, quotationPrintDataBuilder
├── hooks/           # usePrintTemplate, useCompanyBranding, index.ts
├── components/      # PrintTemplateSelector
├── integration/     # invoicePreviewIntegration, quotationPreviewIntegration
├── service/         # printTemplateService
├── storage/         # printProfileStorage (localStorage)
├── utils/           # brandingHelpers, brandingLayout, designerUtils, formatKWD, tafqeet, sanitizePrintText, formatDate
├── hooks/           # usePrintTemplate, useCompanyBranding, useBrandingDesigner
├── components/      # PrintTemplateSelector, BrandingLayoutDesigner, BrandingDesignerOverlay, BrandingDesignerPanel
└── reference/       # 30 React template components
    ├── invoices/    # InvoiceDesign1–5 + Blank variants (10 files)
    ├── quotations/  # QuotationBase + QuotationDesign1–5 + Blank variants (11 files)
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

### Print & Document Suite — Phase 1 (Digital Signature + Company Stamp)

**Storage:** Base64 strings in existing `Settings` table. No migration, no schema change, no IPC.
- `print.signatureImage` — manager signature, JPEG/PNG, max 500×250 px, max 300 KB output
- `print.stampImage` — company stamp, max 400×400 px, max 300 KB output
- `print.showSignature` / `print.showStamp` — global boolean defaults

**Key files:**
- `CompanyPrintData` in `engine/types.ts` — 4 optional fields: `signatureUrl?`, `stampUrl?`, `showSignature?`, `showStamp?`
- `createCompanyPrintData()` in `adapters/companyData.ts` — supports boolean overrides
- `useCompanyBranding` hook — fetches 4 keys from `GET /settings`; safe defaults on failure (`true` for booleans)
- `Settings.tsx` — Document Branding card: upload (Canvas resize, never upscale, 300 KB guard), preview, delete, toggle

**Template coverage:** All 10 invoice designs + blank variants, `QuotationBase.tsx`. Legacy `InvoicePreview` signature row.

### Print & Document Suite — Phase 2 (Per-Print Overrides)

**Principle:** Settings supply the default; the print screen allows session-only override. Settings are never modified by the toggles.

Session state seeded once from `useCompanyBranding` (via `printOptionsInitialized` flag). User changes stay local — never written back to Settings.

**Scope:**
- `InvoicePreview.tsx` — affects engine mode (`printData` useMemo) + legacy mode (signature area)
- `Quotation.tsx` — affects engine mode only (`brandedPrintData` useMemo)

**`brandingHelpers.ts`** — `mergeEffectiveBranding()`, `shouldShowSignature()`, `shouldShowStamp()`

### Print Designer — Phase 5A (Inline WYSIWYG Branding Designer)

**UX flow:** Open invoice/quotation → click "🔧 وضع التصميم" → real document becomes editable → drag signature/stamp directly → save. No Settings modal required for primary editing.

**Shared designer engine (new files):**
- `utils/designerUtils.ts` — 6 pure helpers: `snapToGrid`, `formatUnit`, `keyboardMove`, `historyPush`, `historyUndo`, `historyRedo`
- `hooks/useBrandingDesigner.ts` — all designer state: `localLayout` (with `layoutRef` mirror for synchronous drag reads), history via `histRef` (max 30 entries), drag via `dragStartRef`, zoom (50/75/100/150/200/Fit), grid, snap, save
- `components/BrandingDesignerOverlay.tsx` — wraps document; adds H+V rulers (tick every 50 scaled px), SVG grid overlay, drag handles positioned via `getBoundingClientRect` on `[data-bd-type]` elements; keyboard listener (Arrow, Shift+Arrow, Ctrl+Z/Ctrl+Shift+Z); `onPointerCancel` + `releasePointerCapture` for safe gesture termination
- `components/BrandingDesignerPanel.tsx` — floating RTL properties panel; X/Y/scale/opacity/zIndex controls, center H/V alignment, bring forward/backward, reset element/doc, zoom selector, grid/snap checkboxes, undo/redo buttons, keyboard hint, save/cancel

**Page integration:**
- `InvoicePreview.tsx` — designer in legacy view mode; `effectiveBrandingLayout` drives both sig/stamp rendering and `printData` useMemo; `data-bd-type` attrs on imgs when designer active
- `Quotation.tsx` — designer in engine mode; `brandedPrintData` memo uses `effectiveBrandingLayout`
- `QuotationBase.tsx` — `data-bd-type="signature"` and `data-bd-type="stamp"` on branding imgs (2-line change covers all 10 quotation designs)

**Storage:** Same `print.brandingLayout` key and JSON shape as Phase 4. Save calls `PUT /settings`. Zoom/grid/snap are local-only (not persisted).

**No migration. No backend changes. No new IPC. No new npm packages.**

**25 new unit tests** (`designerUtils.test.ts`) covering all 6 pure functions. Total frontend tests: **287** (17 files).

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
- `hooks/useCompanyBranding.ts` — loads `print.brandingLayout` and parses it; exposes `brandingLayout: PrintBrandingLayoutSettings | undefined`
- `adapters/companyData.ts` — `createCompanyPrintData()` filter now passes `brandingLayout` objects (changed `typeof value === 'string' || boolean` to `value !== undefined`)
- `Settings.tsx` — "معايرة التوقيع والختم" button opens designer; `handleDesignerSave` calls `PUT /settings`; success message shown

**Template integration:** All 10 invoice templates call `getBrandingLayoutForDocument(data?.company?.brandingLayout, 'invoice')` and spread `applyBrandingElementStyle(brandingLayout.signature/stamp)` onto each image. `QuotationBase.tsx` does the same with `'quotation'` doc type.

**Phase compatibility:** `showSignature`/`showStamp` toggles (Phase 2) take precedence — layout only affects position/scale/opacity of already-visible elements. PDF export (Phase 3) captures DOM as-is, so layout is embedded in exported PDFs automatically.

### Print & Document Suite — Phase 3 (Native PDF Export)

**Mechanism:** Electron `webContents.printToPDF()` — captures current page DOM in print media mode.

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
| **`pdf:export`** | **`pdf.ipc.ts`** | **Native PDF export — Phase 3; also used by Executive Decision Center PDF button** |

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

---

## Testing Summary

| Layer | Files | Tests | Status |
|-------|-------|-------|--------|
| Backend (Vitest) | 29 | 526 | All passing |
| Frontend (Vitest) | 17 | 287 | All passing |

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
```

### Backend test files (new — Executive Decision Center Phase 1)

```
backend/src/modules/executive/__tests__/executive.service.test.ts   # 30 tests
  — decisionCenter(): financials, health score, alerts, decision cards, recommendations
  — kpiTimeline(): point count, field presence, profit formula, non-negative outstanding
```

### TypeScript validation (last clean run — post Print Designer Phase 5A merge)

```
cd backend && npx tsc --noEmit        ✅ 0 errors
cd frontend && npx tsc --noEmit       ✅ 0 errors
tsc -p electron/tsconfig.json --noEmit  ✅ 0 errors
cd backend && npx prisma validate     ✅ valid
npm run build:back                    ✅ clean
npm run build:front                   ✅ clean
npm run electron:build                ✅ clean
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
- Approval Workflow — multi-step document sign-off
- Signed PDF export with embedded digital signature

### Medium Priority
- Audit Log Viewer UI enhancements (export, advanced filters)
- Per-document signature policies (different signer per document type)
- QR verification endpoint for printed documents
- Advanced print profiles (custom margins, watermarks)
- Purchase Invoice → GL integration (deferred — `PURCHASE_INVOICE_GL_POSTING_SKIPPED`)

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

4. **Purchase Invoice GL** — `invoices.accounting.ts` logs `PURCHASE_INVOICE_GL_POSTING_SKIPPED` for purchase-direction invoices. AP + Purchases posting deferred.

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

*Last updated: 2026-06-22 — Print Designer Phase 5A released. HEAD `88ba3dc`. Merge commit `88ba3dc`. Tag `stable-print-designer-phase5a-v1`. 526 backend tests / 287 frontend tests (17 files). No migration, no backend, no IPC, no new dependencies.*
