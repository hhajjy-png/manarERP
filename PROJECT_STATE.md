# PROJECT_STATE.md — manarERP

> Live state document. Update this file at the end of every session (Step 16 of the mandatory workflow).
> Read at session start AFTER AGENTS.md and CLAUDE.md.

---

## Current Production Baseline

| Field | Value |
|-------|-------|
| **Branch** | `production` |
| **HEAD** | `b4b691e` — Merge JWT secret hardening |
| **Stable tag** | `stable-jwt-secret-hardening-v1` |
| **Remote sync** | `origin/production` — up to date |
| **DB state** | Full operational reset completed 2026-06-13 — all business data cleared, system config and COA preserved |
| **DB path (dev)** | `backend/data/manar.db` |
| **DB path (prod)** | `userData/data/manar.db` |
| **DB backup (pre-reset)** | `backend/data/backups/manar_PRE_FULL_RESET_20260613_051931.db` |
| **DB backup (post-reset)** | `backend/data/backups/manar_POST_FULL_RESET_2026-06-13_02-22-38.db` |

---

## Completed Features (Newest First)

| Feature | Branch | Stable Tag | Notes |
|---------|--------|-----------|-------|
| JWT Secret Hardening | `feature/jwt-secret-hardening` | `stable-jwt-secret-hardening-v1` | Electron-only security hardening. **Problem:** `backendLauncher.ts` fell back to a static hardcoded secret (`'manar-local-secret-change-me'`) when `process.env.JWT_SECRET` was not set — all installations without an explicit env var shared the same JWT signing key. **Fix:** `getOrCreateJwtSecret(dataDir)` function added to `electron/services/backendLauncher.ts`. Priority: (1) `process.env.JWT_SECRET` if explicitly set (dev standalone, CI); (2) reuse persisted secret from `dataDir/security.json`; (3) generate `randomBytes(64).toString('hex')` (128 hex chars) on first run and write to `security.json`. **Validation:** `isValidJwtSecret` type guard enforces exactly 128 lowercase hex characters (`/^[a-f0-9]{128}$/i`) — corrupted/short/non-hex values regenerate a fresh secret. **Storage:** dev → `backend/data/security.json` (already gitignored by `data/` rule); prod → `userData/data/security.json` (outside repo). File written with `mode: 0o600`. **Gitignore:** `**/security.json` added to `.gitignore` as explicit belt-and-suspenders protection. **Secret never logged or exposed to renderer.** Backend receives secret via `fork()` env as before — no backend/auth/RBAC/token-expiry changes. **Session note:** existing sessions signed with the old static secret become invalid once after upgrade; users log in again (one-time). No schema changes. No migration. Gemini: APPROVED. Feature commit: `a1e12ae`. Merge commit: `b4b691e`. 158/158 tests ✓, frontend tsc ✓, backend tsc ✓, electron tsc ✓, build:front ✓, build:back ✓. |
| xlsx Dependency Review + Import Hardening | `feature/xlsx-dependency-review` | `stable-xlsx-import-hardening-v1` | Frontend-only. Security hardening for Excel file input in Data Import. **Scope:** xlsx@0.18.5 (SheetJS Community Edition) confirmed as frontend-only dependency in `DataImport.tsx`; backend uses ExcelJS exclusively. Decision: `KEEP_WITH_HARDENING` — replacing xlsx for browser-side parsing requires significant Node.js polyfilling (ExcelJS is Node-only), deferred to optional Phase 2. **Two guards added in `handleFileChange()` before `FileReader` reads the file:** (1) File size cap: rejects files >10MB with Arabic error message; (2) Extension + conditional MIME guard: rejects non-.xlsx/.xls files; MIME check is conditional on `file.type` being non-empty (some browsers do not populate MIME for `.xls` — avoids false rejections). Both guards clear the file input on rejection and return early — `XLSX.read()` is never called for rejected files. No backend changes. No schema changes. No import behavior changes for valid Excel files. No new permissions. Gemini: APPROVED. Feature commit: `0de1f50`. Merge commit: `e4d07ae`. 158/158 tests ✓, frontend tsc ✓, backend tsc ✓, electron tsc ✓, build:front ✓, build:back ✓. **Future:** Optional Phase 2 — move Excel parsing from frontend (xlsx) to backend (ExcelJS) via multipart upload endpoint to unify dependencies. |
| Auto Backup Enhancements Phase 1 | `feature/auto-backup-enhancements-phase1` | `stable-auto-backup-enhancements-phase1-v1` | Full-stack (Phase 1A + 1B). Extends the existing auto backup system (Phase 1 — WAL-safe scheduler, `internal.routes.ts`, `backupService.pruneAutoBackups`) with status persistence, a settings UI, and a live Electron reconfigure path. **Phase 1A — Status persistence:** `POST /api/internal/trigger-auto-backup` now wraps `backupService.create('AUTO')` in a try/catch. On success: upserts `backup.auto.lastRunAt`, `backup.auto.lastStatus='SUCCESS'`, `backup.auto.lastError=''` to the Setting table, writes `AUTO_BACKUP` AuditLog (`userId: null`, `module: system`, `entityId: backupId`, `newValue: {fileName, fileSize, retentionCount}`), calls `pruneAutoBackups(retention)`, conditionally writes `AUTO_BACKUP_CLEANUP` AuditLog. On failure: upserts `lastRunAt` + `lastStatus='FAILED'` + `lastError=<message>` (each with individual `.catch(() => {})` to prevent secondary failures from hiding the original error), writes failure `AUTO_BACKUP` AuditLog. Always responds HTTP 200 with explicit `{ status: 'SUCCESS'|'FAILED'|'SKIPPED', backup, pruned, error, lastRunAt }` — failure never hidden. Disabled guard: if `backup.auto.enabled === 'false'`, returns `{ status: 'SKIPPED', reason: 'disabled' }` immediately — no backup created, no status overwritten, no FAILED noise. `GET /backups/auto-status` (JWT, `backups.read`): reads 3 Setting keys + resolves `backupDir` from `env.BACKUP_DIR`. **Phase 1B — Settings UI:** `GET /backups/settings` (JWT, `backups.read`): returns `{ enabled: boolean, time: string, retentionCount: number }` with defaults (`true`, `'22:00'`, `30`). DB key `backup.auto.retention` preserved for scheduler compatibility; API field aliased `retentionCount`. `PUT /backups/settings` (JWT, `settings.update`): Zod validation (`enabled: z.boolean()`, `time: /^\d{2}:\d{2}$/`, `retentionCount: z.number().int().min(1).max(365)`); calls `settingsService.updateMany()` (existing `UPDATE/settings` audit); additionally writes `BACKUP_SETTINGS_UPDATE/backups` AuditLog for specificity. **Frontend — `Backup.tsx`:** `load()` fetches list + auto-status + settings in parallel. Status card: colored pill (green/red/gray), last run timestamp, error text (FAILED only), backup directory. Settings panel: enabled toggle, time picker, retention count input (1–365), Save button; on save calls `PUT /backups/settings` then `window.manar!.backupReconfigure()` to dynamically restart Electron scheduler — no app restart needed. Non-Electron note shown instead of reconfigure call. Permission guard: settings panel fields disabled without `settings.update`; read-only view available with `backups.read`. 14 new i18n key pairs (AR+EN). No DB schema changes. No migration. No cloud backup. No restore behavior changes. Gemini: APPROVED. Feature commit: `a7f7f41`. Merge commit: `76d60ee`. 158/158 tests ✓, frontend tsc ✓, backend tsc ✓, electron tsc ✓, build:front ✓, build:back ✓. |
| Forms Print Layout Hotfix | `feature/forms-print-layout-hotfix` | `stable-forms-print-layout-hotfix-v1` | Frontend-only. All 8 employee forms now print on a single A4 page. **Root cause:** `minHeight: '100vh'` in `FormLayout.tsx` forced the container to ≥1123px (full A4 height in print units) while the printable area with 15mm margins is only ~1009px — any content near the bottom (ApprovalSection + QR + Footer) overflowed to page 2. **5 shared files changed, 0 template files changed.** `FormLayout.tsx`: removed `minHeight: '100vh'`; `padding: 40` → `'18px 32px'`; `@page margin: 15mm` → `10mm`; title `marginBottom: 28` → `14`; QR `marginTop: 32` → `14`; removed global `* { page-break-inside: avoid }` rule (Gemini CHANGES_REQUIRED blocker — unsafe for nested elements on long forms). `FormHeader.tsx`: logo `height: 64` → `50`; `marginBottom: 28` → `14`; `paddingBottom: 18` → `10`. `FormFooter.tsx`: `marginTop: 32` → `10`; `paddingTop: 14` → `10`. `ApprovalSection.tsx`: `marginTop: 36` → `16`; `paddingTop: 20` → `10`; added `pageBreakInside: 'avoid'` (targeted — safe). `formStyles.ts`: `tableCell padding: '8px 14px'` → `'6px 14px'`; `lineHeight: 1.6` → `1.5`; `tableWrapper marginBottom: 20` → `12`; added `pageBreakInside: 'avoid'` on `tableWrapper` (targeted — safe). Gemini CHANGES_REQUIRED (global `*` selector) → fix applied → Gemini APPROVED. frontend tsc ✓, backend tsc ✓, electron tsc ✓, build:front ✓, build:back ✓. Feature commit: `546018a`. Merge commit: `e93e2d4`. |
| Data Import Phase 3A + 3B — Contracts & Expenses | `feature/data-import-phase3-contracts-expenses` | `stable-data-import-phase3-contracts-expenses-v1` | Backend + frontend-config. Flat-row Excel import for Contracts and Expenses. **Strict scope:** no PO/GR/MI, no grouped rows, no new permissions, no DB migration, `DataImport.tsx` untouched. **New backend files:** `validators/contracts.ts` — validates code (required), asphaltPlant (required), status enum (ACTIVE/EXPIRED/RENEWING/SUSPENDED, default ACTIVE), startDate/endDate (YYYY-MM-DD + endDate≥startDate), price/monthlyTransportValue (non-negative), customerCode (optional FK→customerId), managerCode (optional FK→managerId); `validators/expenses.ts` — validates code (required), category enum (FUEL/SALARIES/MAINTENANCE/RENT/PURCHASES/EQUIPMENT/SERVICES/OTHER, required), description (required), amount (positive KWD, required), date (optional YYYY-MM-DD), contractCode (optional FK→contractId), supplierCode (optional FK→supplierId); status hardcoded to `'PENDING'` (not from template); Expense model has no `notes` column — silently dropped. **Modified backend files:** `import.types.ts` — EntityType extended to include `'contracts' | 'expenses'`; `import.schema.ts` — entityTypeSchema enum updated; `import.service.ts` — `FKMaps` interface, `loadCodeToIdMap()` (customers: `isArchived:false`; suppliers: `isArchived:false`; employees: `status:ACTIVE`; contracts: no filter), `loadFKMaps(entityType)` (dispatches to contracts or expenses map loads; returns `{}` for existing 5 entities — zero overhead), `validateRow()` and `buildPreviewRows()` accept `fkMaps={}` default (existing call paths unchanged), `previewImport` + `executeImport` load FK maps via `Promise.all`. **Modified frontend config:** `importEntities.ts` — added contracts config (13 columns, English keys) and expenses config (8 columns, expenses notes labeled as non-saved warning). **FK resolution:** contracts resolve `customerCode→customerId` (non-archived customers) and `managerCode→managerId` (active employees); expenses resolve `contractCode→contractId` (all contracts) and `supplierCode→supplierId` (non-archived suppliers). Unresolved optional FK codes return `undefined` (not an error). **Regression confirmation:** all 5 existing import entities (employees, customers, equipment, suppliers, prices) behave identically — `loadFKMaps` returns `{}` immediately, `validateRow` dispatches to existing single-param validators unchanged. 158/158 tests ✓, backend tsc ✓, frontend tsc ✓, electron tsc ✓, build:back ✓, build:front ✓. Gemini APPROVED. Feature commit: `1bc4dec`. Merge commit: `6701a9d`. |
| Financial Safety Test Suite Phase 1 | `feature/financial-safety-tests-phase1` | `stable-financial-safety-tests-phase1-v1` | Backend-only. Pure-function extraction + Vitest coverage for KWD financial calculations. **`invoices.calc.ts` (new):** `round3` (KWD 3dp — `Math.round((n + Number.EPSILON) * 1000) / 1000`), `computeTotals` (per-line rounding, discount clamp, tax calculation), `nextStatus` (UNPAID/PARTIAL/PAID), `overpaymentExceeds` (0.001 KWD tolerance for floating-point drift). **`inventory.calc.ts` (new):** `roundCost` (6dp for WAC precision preservation), `calcWAC` (weighted average cost with negative stock guard `Math.max(0, currentStock)` + incomingQty=0 division-by-zero guard → returns `incomingUnitCost`), `sufficientStock`. **`invoices.service.ts` (modified):** removed inline `round2`/`computeTotals`/`nextStatus`; imports from `invoices.calc`; `newPaid = round3(...)`, `overpaymentExceeds(...)` replaces inline `> total + 0.001` check. **`inventory.service.ts` (modified):** removed inline `roundCost`; imports from `inventory.calc`; WAC calculation replaced with `calcWAC()`; stock check replaced with `sufficientStock()`. **Test files:** `invoices/__tests__/invoices.calc.test.ts` — 33 tests (round3 incl. KWD precision cases 5.750, 5.750×5%=0.288→6.038; computeTotals zero/discount/tax/normal/KWD; nextStatus; overpaymentExceeds); `inventory/__tests__/inventory.calc.test.ts` — 24 tests (roundCost 6dp; calcWAC fresh/same/weighted/negative-stock/precision-chain/incomingQty=0; sufficientStock boundary). **KWD precision fix (Gemini CHANGES_REQUIRED → APPROVED):** initial submission used `round2` (2dp); Gemini blocked merge — KWD requires 3dp; renamed to `round3`, multiplier 100→1000, all internal calls updated, 5 KWD precision tests added. `calcWAC incomingQty=0` guard explicitly approved by Gemini as safe bug-fix. Total backend tests: 158/158 ✓ (33 invoice + 24 inventory + 40 payroll + 25 tafqeet + 17 attendance + 11 accounting + 8 employee alerts). Backend tsc ✓, frontend tsc ✓, electron tsc ✓, build:back ✓, build:front ✓. Merge commit: `a3f2797`. |
| Auto Backup Enhancements Phase 1 | `feature/auto-backup-phase1` | `stable-auto-backup-phase1-v1` | Full-stack. Local automatic backup system with WAL-safe execution and settings-controlled schedule. **Architecture:** Electron generates a one-time `INTERNAL_SECRET` UUID at startup (`crypto.randomUUID()`), passes it to the backend child process via fork env. A dedicated Express router (`/api/internal/`) accepts this header in place of JWT — unreachable without the runtime secret. **Backend — `internal.routes.ts` (new):** `GET /backup-settings` — reads `backup.auto.enabled`, `backup.auto.time`, `backup.auto.retention` from the `Setting` table, returns `{enabled, time, retention, cronExpr}`. `GET /last-auto-time` — returns `createdAt` of the most recent `type=AUTO, status=SUCCESS` Backup record; used by Electron catch-up logic. `POST /trigger-auto-backup` — WAL-safe: calls `backupService.create('AUTO')` which performs `PRAGMA wal_checkpoint(FULL)` before `fs.copyFileSync`; reads retention setting; writes `AUTO_BACKUP` AuditLog (`userId: null`, `module: system`); calls `backupService.pruneAutoBackups(retention)`; conditionally writes `AUTO_BACKUP_CLEANUP` AuditLog. Returns `{backup, pruned}`. **Backend — `backup.service.ts`:** `pruneAutoBackups(keep)` added — queries `Backup` table for `type=AUTO` records newest-first; deletes records beyond `keep` from both disk and DB; never touches MANUAL or pre-restore backups. **Backend — `backups.routes.ts`:** `GET /backups/last-auto` — JWT-authenticated public route returning the last successful AUTO backup record; used by dashboard widget. **Electron — `backupScheduler.ts` (full rewrite):** Imports only `node-cron` + `http` (no `fs`, no `path`, no `getUserDataPaths`). `startBackupScheduler(secret)` — reads settings via `GET /api/internal/backup-settings`, starts `node-cron` with `Asia/Kuwait` timezone. `runAutoBackup()` — calls `POST /api/internal/trigger-auto-backup` (no physical file copy in Electron). `runCatchupIfNeeded(secret)` — queries `GET /api/internal/last-auto-time` from DB (not disk scan), compares against last scheduled wall-clock time; triggers one backup if missed. `reconfigureBackupScheduler()` — re-reads settings and replaces the running cron task. **Electron — `main.ts`:** generates `INTERNAL_SECRET` before bootstrap; passes to `startBackend(secret)` and `startBackupScheduler(secret)`; calls `runCatchupIfNeeded(secret)` non-blocking. **Electron — `backup.ipc.ts`:** `backup:reconfigure` IPC handler added — calls `reconfigureBackupScheduler()` on demand. **Electron — `preload.ts`:** `backupReconfigure()` exposed via `contextBridge`. **Frontend — `LastAutoBackupCard.tsx` (new):** Fetches `GET /api/backups/last-auto` on mount; shows Arabic locale date + time + human file size (KB/MB); shows "لا توجد نسخة احتياطية" when null; matches OpsCard `db-stat` CSS class; added as 7th card in Dashboard stats grid. **Frontend — `Settings.tsx`:** `DEFAULT_VALUES` map for `backup.auto.*` fields (true/02:00/30); three new FIELDS: `backup.auto.enabled` (checkbox), `backup.auto.time` (time input), `backup.auto.retention` (number 1–365); after save calls `window.manar?.backupReconfigure?.()` to apply new schedule immediately. **i18n:** 3 new AR+EN key pairs for backup settings fields. **Default schedule:** 02:00 KWT, retention 30 AUTO backups. **WAL safety:** every auto backup passes through `backupService.create()` which runs `PRAGMA wal_checkpoint(FULL)` before any file copy — Gemini CHANGES_REQUIRED resolved by eliminating direct `fs.copyFileSync` from Electron. **Gemini review:** initial CHANGES_REQUIRED (WAL blocker) → WAL fix submitted → APPROVED, no remaining blockers. 15 files changed, 410 insertions (+38 deletions). Feature commit: `d986c07`. Merge commit: `4c8783a`. 101/101 tests ✓, backend tsc ✓, frontend tsc ✓, electron tsc ✓, build:back ✓, build:front ✓. |
| Forms Phase 1B — Official Templates | `feature/forms-phase1b-official-templates` | `stable-forms-phase1b-v1` | Full-stack. 8 official company forms with dual print modes. **Backend:** Extended `modules/forms/` — 8 new `GET` endpoints (one per form type, all `requirePermission('forms.read')`): `salary-certificate`, `to-whom-it-may-concern`, `leave-request`, `return-to-work`, `salary-advance`, `resignation`, `employee-warning`, `performance-evaluation`. Each returns `{ employee, latestPayroll/latestLeave/latestAdvance/latestReview }` from existing tables — no new DB models, no migration. `POST /print-log` endpoint (`requirePermission('forms.print')`) — fire-and-forget audit trail via `recordAudit({ action: 'PRINT', module: 'forms' })`. **qrcode** npm dependency added (`^1.5.4`) — pure JS, offline-safe, hoisted to root `node_modules/`. **Frontend — shared template system:** `frontend/src/forms/shared/` — `printMode.ts` (`PrintMode` type + `getPrintMode(search)`), `formNumber.ts` (`generateFormNumber()` — `PREFIX-YYYY-NNNN` pseudo-sequential), `formStyles.ts` (shared `CSSProperties`, `fmtDate()`, `money()`), `FormHeader.tsx` (company logo + name; `visibility: hidden` in letterhead mode — preserves physical height so body doesn't shift), `FormFooter.tsx` (same `visibility: hidden` approach), `FormLayout.tsx` (A4 `@media print` style, no-print toolbar, auto-print via `useEffect([ready])`, `setTimeout 600ms`), `FormQRCode.tsx` (`QRCode.toDataURL` → `<img>`, branded color `#1d4e6f`, always visible in both modes), `ApprovalSection.tsx` (direct manager approval only — توقيع + تاريخ + ختم؛ no manager name, no HR/finance/GM blocks). **8 template files:** `SalaryCertificateTemplate`, `ToWhomItMayConcernTemplate`, `LeaveRequestTemplate`, `ReturnToWorkTemplate`, `SalaryAdvanceTemplate`, `ResignationTemplate`, `EmployeeWarningTemplate`, `PerformanceEvaluationTemplate`. **8 print pages** (each: `useMemo` stable form number, fetch data, fire-and-forget print-log POST, `FormLayout` + template): `SalaryCertificate.tsx` (rewritten), plus 7 new pages. **PrintMode:** `?printMode=letterhead` vs `?printMode=full-template` — read via `useLocation().search`. Letterhead: header/footer `visibility: hidden` (preserves space), body stays positioned exactly. Full-template: company branding visible. **Forms.tsx** (rewritten): 8 form cards, shared employee selector at top, per-card print mode `<select>`, print button navigates to print route. **App.tsx:** 7 new routes outside `<Layout>`. No schema changes. No new permission keys — uses existing `forms.read` + `forms.print`. 31 files changed, 2368 insertions. Feature commit: `55761e9`. Merge commit: `2f4ca49`. 101/101 tests ✓, backend tsc ✓, frontend tsc ✓, electron tsc ✓, build:back ✓, build:front ✓. Gemini: APPROVED. |
| Project Prices Force Delete Phase 2C | `feature/project-prices-force-delete-phase2c` | `stable-prices-force-delete-phase2c-v1` | Full-stack. SYSTEM_ADMIN only. No gates — ProjectPrice is a standalone reference table with zero FK dependencies; values are copied at contract/invoice creation time. **Backend:** `GET /prices/:id/force` — dry-run preview (always unblocked: `childCounts: {}`, `totalChildRecords: 0`, `willBeDeleted: ['projectPrice']`, `willBeNullified: []`). `DELETE /prices/:id/force` — executes `prisma.$transaction` with single `projectPrice.delete`; no nullification steps. Routes registered before `/:id` to prevent Express matching 'force' as `:id`. **Audit:** `action: DELETE`, `forceDelete: true`, `deletedEntity` (id, asphaltPlant, companyName, contractLocation, contractUnit, unitPrice, isArchived), `childCounts: {}`, `totalChildRecords: 0`, `willBeDeleted: ['projectPrice']`, `willBeNullified: []`. First operation in prices module to write an audit trail. **Frontend:** `ForceDeleteProjectPriceModal.tsx` — always-unblocked state (no blocked banner path); shows price details table (asphaltPlant, companyName, contractLocation, contractUnit, unitPrice via `money()`); informational note "هذا السعر لا يحتوي على سجلات مرتبطة"; confirmation requires typing exact `asphaltPlant` value (no unique code field on ProjectPrice); Enter key support. `Prices.tsx`: `isSystemAdmin` check (`user?.role.name === 'SYSTEM_ADMIN'`); "حذف نهائي" button in row actions (SYSTEM_ADMIN only, after archive button); existing archive behavior unchanged. No schema changes. No migration. No new permission keys. Feature commit: `56e01b1`. Merge commit: `1d092d2`. 101/101 tests ✓, backend tsc ✓, frontend tsc ✓, electron tsc ✓, build:back ✓, build:front ✓. Gemini: APPROVED — safe to merge: Yes. |
| Contracts Force Delete Phase 2B | `feature/contracts-force-delete-phase2b` | `stable-contracts-force-delete-phase2b-v1` | Full-stack. SYSTEM_ADMIN only. **Backend:** `getChildCounts()` queries 4 counters (invoices, expenses, materialIssues, contractDocuments). `GET /contracts/:id/force` — dry-run preview with `blockedReason?`, `childCounts`, `willBeDeleted`, `willBeNullified`. `DELETE /contracts/:id/force` — re-validates invoice gate server-side then executes Prisma `$transaction`. **Single-gate protection:** Invoice Gate: hard-blocked when `invoices > 0` — financial source documents inviolable; any contract with billing history is blocked. **Delete flow (transaction order):** `expenses.contractId → null` → `materialIssues.contractId → null` → `delete contract` (ContractDocuments cascade automatically via `onDelete: Cascade` in schema — no explicit step needed). **Audit:** `action: DELETE`, `forceDelete: true`, `deletedEntity` (`id`, `code`, `asphaltPlant`, `status`), `childCounts`, `totalChildRecords`, `willBeDeleted`, `willBeNullified`. **Frontend:** `ForceDeleteContractModal.tsx` mirrors `ForceDeleteCustomerModal` — dryRun preview on mount, blocked state shows hard-block banner (close only), unblocked state shows impact summary (`willBeDeleted` + `willBeNullified` lists) + contract code confirmation input + Enter key support. `ResourcePage.tsx`: new state `forceDeleteContractCandidate`, 409 handler branch for `cfg.key === 'contracts' && isSystemAdmin`, modal render. No schema changes. No migration. No new permission keys — routes use `requireRole(SYSTEM_ADMIN)`. Feature commit: `58ac38a`. Merge commit: `3002ea4`. 101/101 tests ✓, backend tsc ✓, frontend tsc ✓, electron tsc ✓, build:back ✓, build:front ✓. Gemini: APPROVED — safe to merge: Yes. |
| Suppliers Force Delete Phase 2A | `feature/suppliers-force-delete-phase2a` | `stable-suppliers-force-delete-phase2a-v1` | Full-stack. SYSTEM_ADMIN only. **Backend:** `getChildCounts()` queries 6 counters (invoices, expenses, purchaseOrdersActive, purchaseOrdersCancelled, goodsReceiptsPosted, goodsReceiptsDraft). `GET /suppliers/:id/force` — dry-run preview with `blockedReason?`, `childCounts`, `willBeDeleted`, `willBeNullified`. `DELETE /suppliers/:id/force` — re-validates all three gates server-side then executes Prisma `$transaction`. **Three-gate protection (block priority order):** (1) Invoice Gate: blocked when `invoices > 0` — financial records, same pattern as Customer FD; (2) Posted GoodsReceipt Gate: blocked when `goodsReceiptsPosted > 0` — these have `accountingPostedAt` + `accountingTransactionId` set, destroying them breaks accounting audit chain; (3) Active PurchaseOrder Gate: blocked when `purchaseOrdersActive > 0` (DRAFT/SUBMITTED/RECEIVED) — active procurement relationship. **Delete flow (transaction order):** `expenses.supplierId → null` → `delete CANCELLED purchaseOrders` (items cascade) → `delete DRAFT goodsReceipts` (items cascade) → `delete supplier`. **Audit:** `action: DELETE`, `forceDelete: true`, `deletedEntity`, `childCounts`, `totalChildRecords`, `willBeDeleted`, `willBeNullified`. **Frontend:** `ForceDeleteSupplierModal.tsx` (188 lines) mirrors `ForceDeleteCustomerModal` — dryRun preview on mount, blocked state shows hard-block banner (close only), unblocked state shows impact summary (`willBeDeleted` + `willBeNullified` lists) + supplier code confirmation input + Enter key support. `ResourcePage.tsx`: new state `forceDeleteSupplierCandidate`, 409 handler branch for `cfg.key === 'suppliers' && isSystemAdmin`, modal render. No schema changes. No migration. No new permission keys — routes use `requireRole(SYSTEM_ADMIN)`. Feature commit: `faa3244`. Merge commit: `3f65fe8`. 101/101 tests ✓, backend tsc ✓, frontend tsc ✓, electron tsc ✓, build:back ✓, build:front ✓. Gemini: APPROVED — safe to merge: Yes. |
| Full Operational Reset | `production` (script-based) | `stable-full-operational-reset-v1` | Database-only operation — no code changes, no schema changes, no migrations. Executed via `scripts/full-operational-reset.ts` (one-time script, left uncommitted). **Pre-reset backup:** `manar_PRE_FULL_RESET_20260613_051931.db` (820 KB). **Post-reset backup:** `manar_POST_FULL_RESET_2026-06-13_02-22-38.db` (820 KB). **Cleared (24 tables, all confirmed at 0 rows):** customers, contracts, contract_documents, invoices, invoice_items, payments, expenses, employees, attendance, leaves, deductions, bonuses, payroll, payroll_lines, employee_allowances, employee_recurring_deductions, payroll_advances, performance_reviews, salary_payments, equipment (+ maintenance_records, fuel_logs, breakdowns, spare_part_usage via CASCADE), suppliers, project_prices, cheques, materials, material_categories, purchase_orders, purchase_order_items, goods_receipts, goods_receipt_items, material_issues, material_issue_items, transactions, journal_entries, journal_entry_lines. **Preserved (8 tables):** users (2 rows), roles (7), permissions (100), role_permissions (320), settings (11), audit_logs, backups, accounts. **Pre-step:** `users.employeeId` nullified for all linked users before employee delete (FK safety — User.employeeId → Employee with no onDelete). **Audit log entry inserted:** `action: FULL_OPERATIONAL_RESET`, `module: system`, full scope + backup names + before/after counts. **Validation:** 101/101 tests ✓, backend tsc ✓, frontend tsc ✓, electron tsc ✓, build:back ✓, build:front ✓. |
| Forms Module Phase 1A — Salary Certificate | `production` (direct) | `stable-forms-phase1a-salary-certificate-v1` | Full-stack. Salary certificate print form only. **Backend:** New `modules/forms/` module — `forms.routes.ts`, `forms.controller.ts`, `forms.service.ts`. `GET /forms/salary-certificate/:employeeId` returns `{ employee, latestPayroll }` — two Prisma queries, no new models, reads from existing `Employee` + `Payroll` tables. Registered as `/api/forms` in `app.ts`. `'forms'` added to MODULES in `constants.ts`. **Permissions:** 3 new keys: `forms.read`, `forms.print`, `forms.create`. Seeded in `seed.ts` via `MODULE_ACTIONS`; HR_MANAGER gets all 3; ACCOUNTANT gets `forms.read` + `forms.print`; PROJECT_MANAGER + EQUIPMENT_MANAGER get `forms.read`; SYSTEM_ADMIN + GENERAL_MANAGER inherit all via `allKeys`. Total permissions: 97 → **100**. **Frontend:** `Forms.tsx` hub page — loads active employees via `GET /employees?pageSize=500&status=ACTIVE`, single "شهادة راتب" card with `<select>` + print button that navigates to `/forms/salary-certificate/:employeeId`. `SalaryCertificate.tsx` print page (239 lines) follows `PayrollPayslip.tsx` pattern exactly: `useParams`, fetch on mount, `setTimeout(() => window.print(), 500)` on data load, `.no-print` toolbar, RTL Arabic layout with company header ("م" badge + full legal name), "شـهـادة راتـب" title, opening certification paragraph, employee table (name AR/EN, code, civil ID, job title, department, nationality, hire date), salary table (monthly salary KWD 3dp in green bold, latest net salary with period label, currency), closing legal disclaimer, Arabic long-format issue date, 2-column signature block. Inline `CSSProperties` objects intentional for print isolation — same pattern as PayrollPayslip.tsx and ReportPrint.tsx. **Routing:** `SalaryCertificate` registered OUTSIDE `<Layout>` wrapper at `/forms/salary-certificate/:employeeId` for clean full-page print. **Navigation:** New "الشؤون الإدارية" sidebar group added (between core and financial groups) with `nav.forms` → `/forms`. **i18n:** 8 new key pairs (AR+EN) for nav group, forms page title/subtitle, loading/error states. **No schema changes. No migration.** Browser print chosen over PDFKit — `pdf.service.ts` has an existing comment warning about broken Arabic character joining (حروف متصلة); Chromium/Cairo renders Arabic natively. Feature commit: `e90298e`. db:seed: 100 permissions, all 7 roles. All TS ✓, build:back ✓, build:front ✓, Electron TS ✓. Gemini: APPROVED (minor typography fix applied: "شـهـادة رات ب" → "شـهـادة راتـب"). |
| Dynamic Import Tabs Phase 1 | `feature/dynamic-import-tabs-phase1` | `stable-dynamic-import-tabs-phase1-v1` | Frontend-only refactor. Created `frontend/src/config/importEntities.ts` — single source of truth for all import entity metadata. `IMPORT_ENTITIES` array holds one `ImportEntityConfig` object per entity: `key`, `labelAr`, `columns` (column guide + template headers), `useArabicTemplateHeaders` (true for employees only — preserves Arabic header round-trip through backend `ARABIC_HEADER_MAP`), `previewPrimaryHeader`, `previewSecondaryHeader`, `previewPrimary()`, `previewSecondary()`. `IMPORT_ENTITY_MAP` provides O(1) key lookup. `DataImport.tsx` reduced by 90 lines (485 → 395): `COLUMN_GUIDE` record, `ENTITY_LABELS` record, inline `EntityType` union, entity selector array literal, `downloadTemplate` employees branch, and preview table header + cell ternary chains all removed and replaced with config lookups. Added `if (!cfg) return null;` safety guard (Gemini recommendation). Behavior parity confirmed: all 5 entities (employees, customers, equipment, suppliers, prices) behave identically before and after. No backend changes, no API changes, no permission changes, no schema changes. Adding a future import entity now requires one config object in `importEntities.ts` — selector, column guide, template download, and preview table update automatically. Feature commit: `767d368`. Merge commit: `8fe073e`. Frontend tsc ✓, build:front ✓. Gemini: APPROVED. |
| Customer Force Delete Phase 1B | `feature/customer-force-delete-phase1b` | `stable-customer-force-delete-phase1b-v1` | Full-stack. Customers only. SYSTEM_ADMIN only. `GET /customers/:id/force` returns read-only impact preview: customer snapshot + child counts (contracts, directInvoices, contractInvoices, expenses, contractDocuments, materialIssues + totalChildRecords) + `blockedReason` when invoice gate is triggered (no mutation). `DELETE /customers/:id/force` executes force delete inside interactive `prisma.$transaction`. **Invoice Gate:** force delete blocked when `directInvoices > 0` OR `contractInvoices > 0` — financial records are inviolable; archive remains the recommended path. **Deletion flow (gate passed):** nullify `expenses.contractId`, nullify `materialIssues.contractId`, delete contracts (cascades `ContractDocuments` via `onDelete: Cascade`), delete customer. No `onDelete` action on customer's Invoice/Expense/MaterialIssue relations — gate prevents any FK violation. Frontend: `ForceDeleteCustomerModal` fetches preview on mount; shows child count breakdown, `willBeDeleted`/`willBeNullified` summary; renders `blockedReason` hard-block banner (no confirm input shown) when invoice gate fires; requires typing exact customer code to unlock confirm button; Enter-key shortcut when code matches. `ResourcePage.onDelete` 409 handler checks `customers + SYSTEM_ADMIN` before `supportsArchive` — non-admin users still get archive modal. Audit log: `action: 'DELETE'`, `oldValue: { forceDelete: true, deletedEntity: { id, code, name }, childCounts, totalChildRecords, willBeDeleted, willBeNullified }`. No schema changes. No new permissions. Explicitly deferred: Suppliers, Contracts standalone, Employees. Feature commit: `93099f3`. Merge commit: `9f8f3c0`. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Equipment Force Delete Phase 1A | `feature/equipment-force-delete-phase1a` | `stable-equipment-force-delete-phase1a-v1` | Full-stack. Equipment only. SYSTEM_ADMIN only. Normal `DELETE /equipment/:id` now guarded — returns HTTP 409 when child records exist (maintenance records, fuel logs, breakdowns, spare parts). Force delete via `DELETE /equipment/:id/force` (requires `requireRole(ROLES.SYSTEM_ADMIN)`). `GET /equipment/:id/force` returns read-only impact preview: equipment snapshot + per-table child counts + `totalChildRecords` (no mutation). Frontend: `ResourcePage.onDelete` catches 409 for equipment + SYSTEM_ADMIN → opens `ForceDeleteEquipmentModal`. Modal fetches dryRun preview on mount, displays non-zero child counts by table, requires typing exact equipment code to unlock delete button; Enter-key shortcut when code matches. Audit log uses standard `action: 'DELETE'` with `oldValue: { forceDelete: true, deletedEntity: { code, name }, childCounts, totalChildRecords }` — no new action constants, no new permissions. All 4 child tables have `onDelete: Cascade` confirmed in schema — no migration needed. No schema changes. No new permissions. Force delete intentionally excluded from: Customers, Contracts, Suppliers, Employees. Feature commit: `d23d684`. Merge commit: `907301d`. 101/101 tests, all TS + builds clean. Gemini: APPROVED (after route + audit + UI fixes). |
| Data Import / Export Expansion | `feature/data-import-export-expansion` | `stable-data-import-export-expansion-v1` | Full-stack. **Import:** Suppliers (code+name required; phone, email, address, contactName, notes optional; Arabic headers mapped; email validated; isArchived seeded false). Project Prices (all 5 fields required: asphaltPlant, companyName, contractLocation, contractUnit, unitPrice; unit enum طن/درب/يومية; positive float parser; 4-field composite dedup key `asphaltPlant\|companyName\|contractLocation\|contractUnit` per Gemini review). Import engine: generic `previewImport()` + `executeImport()`, backup-before-insert, atomic `$transaction`, max 1000 rows. `EntityType` extended to include `suppliers` and `prices`. ACCOUNTANT role now receives `import.read` + `import.create`. **Export:** `reports.service.ts` extended with `suppliers` (isArchived: false, order code asc, 7 columns) and `prices` (order asphaltPlant/companyName asc, 5 columns, KD numFmt). `supportsExport?: boolean` added to `ModuleConfig`. Export button "تصدير الكل Excel" added to ResourcePage (visible when `supportsExport && hasPermission('reports.export')`), enabled on Customers, Suppliers, Contracts, Equipment, Employees. Standalone export button added to `Prices.tsx`. Blob download pattern (`responseType: 'blob'`), no filter awareness (exports all records). No new endpoints, no new permissions, no schema changes. **Archive Override Phase 1a** (same release): When `DELETE` returns HTTP 409 (linked records), ResourcePage now shows a Modal offering Archive as alternative action. Calls `PATCH /:id/archive`. Gated on `cfg.supportsArchive && canUpdate`. Feature commits: `aa6ebe2` (suppliers import), `3b437f4` (prices import + Gemini composite key fix), `e7aa7d9` (excel export). Merge commit: `1037132`. 101/101 tests, all TS + builds clean. Archive Override merge: `79baeb5`. |
| Equipment Plate Integration Phase 1 | `feature/equipment-plate-integration-phase1` | `stable-equipment-plate-integration-phase1-v1` | Frontend-only. Read-only Plate Number field auto-populated in all four Maintenance forms (Maintenance Records, Fuel Logs, Breakdowns, Spare Parts) when equipment is selected. `Equipment` interface updated to declare `plateNumber?: string`. All four form states, `onChange` handlers, and post-submit reset calls updated. Plate display is `readOnly tabIndex={-1}` with muted styling — not editable, not submitted to backend. No backend/schema/permission changes. Equipment API already returned `plateNumber` — no endpoint changes needed. Feature commit: `cd8d8ce`. Merge commit: `442e057`. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Development Workflow v3.0 | `production` (direct commit) | — | Documentation only. No code changes. Three workflow modes (Quick Fix, Feature, Major System), model routing policy (Sonnet default, Opus escalation, Gemini mandatory review, ChatGPT PM), Implementation Reference appendix restored: pre-implementation checklist, `/simplify` + `/code-review` + `/security-review` quality gates, Gemini report template (10 sections), merge verification commands, commit message format, tag and push rules, rollback procedure. CLAUDE.md updated with v3.0 workflow section and appendix reference. HEAD: `5f71d5a`. |
| Contracts Price Binding | `feature/contracts-price-binding` | `stable-contracts-price-binding-v1` | Frontend-only. Linked Price selector added to Contracts page. Auto-fills `asphaltPlant`, `companyName`, `location`, `unitName`, `price` when user selects a price. Customer column added to Contracts DataTable. Existing field values remain editable after auto-fill. No backend/schema/permission changes. **Implementation detail:** `linkedPrice` selector sends the selected price record ID to the backend but is silently stripped by Zod (`contracts.schema.ts` does not declare `linkedPrice`). No `linkedPriceId` FK exists in `schema.prisma`. No migration required. Only the 5 auto-filled fields are actually persisted. |
| Remove DataTable Sticky Header | `hotfix/remove-datatable-sticky-header` | `stable-remove-datatable-sticky-header-v1` | Frontend-only. Sticky column headers removed from `theme.css` — eliminates the first-row overlap issue introduced in DataTable Enhancement Phase 1. Zebra row stripes and hover styling preserved. |
| Operational Feedback Phase 1 | `feature/operational-feedback-phase1` | `stable-operational-feedback-phase1-v1` | Frontend-only. Equipment registration expiry split into two columns: Expiry Date and Remaining Duration. Invoice price picker UX clarification. DataTable first-row visibility fixes. Miscellaneous operational feedback improvements. |
| Executive Dashboard V3A-Lite | `feature/executive-dashboard-v3-planning` | `stable-executive-dashboard-v3a-lite-v1` | Frontend-only. Dashboard sub-components are now fully i18n-compliant: AlertPanel, ContractProgressCard, ContractStatusChart, LatestExpensesTable, LatestInvoicesTable, RevenueChart. 25 hardcoded Arabic strings removed; 10 new i18n key pairs added (AR+EN). `STATUS_MAP`/`STATUS_PILL` tuples refactored to `STATUS_COLOR` maps — labels now via `t('contract.status.*')`, `t('inv.status.*')`, `t('exp.status.*')`. All-time label `منذ التأسيس / All time` added as `sub` prop to Revenue, Expenses, Net Profit KPI cards (excluded from Unpaid Invoices which shows current outstanding). Weekend attendance empty state: if `today.getDay() === 5 || 6` (Kuwait Friday/Saturday) and `att.total === 0`, shows 🏖️ + `t('att.weekend')` instead of generic empty state. No backend/API/schema/permission changes. KPI grid replacement deferred. Period filter deferred. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Page Headers Standardization | `feature/ui-page-headers-standardization` | `stable-ui-page-headers-standardization-v1` | Frontend-only. Standardized page header markup across 2 non-ResourcePage pages: `Cheques.tsx` (`page-header` → `page-head` class, `<h1>` → `<h2>`); `DataImport.tsx` (inline styles replaced with `page-head` class + standard `<h2>`/`<p>` structure). Consistent with ResourcePage and other page headers. No i18n, no backend changes. |
| DataTable Enhancement Phase 1 | `feature/ui-datatables-enhancement-phase1` | `stable-ui-datatables-enhancement-phase1-v1` | Frontend-only. `theme.css` global table improvements: sticky column headers (`position: sticky; top: 49px` — accounts for 49px topbar height); alternating row stripes (`tbody tr:nth-child(even) td { background: var(--surface-2) }`); hover highlight updated to rgba tokens (light: `rgba(59,130,246,0.06)`, dark: `rgba(255,255,255,0.07)`); row hover `transition: background 0.15s ease`; header border changed to `2px` with `background: var(--surface-2)`; pagination `border-top` separator added; tighter cell padding (12px top/bottom for headers, 14px for rows). No i18n, no backend changes. **Note:** sticky headers were removed in `stable-remove-datatable-sticky-header-v1` and are not present in current production. Zebra rows, rgba hover tokens, and pagination border-top separator remain. |
| Operational Polish Phase 1B | `feature/operational-polish-phase1b` | `stable-operational-polish-phase1b-v1` | Frontend-only. 5 UX consistency improvements: (1) DataTable row-range indicator in pagination — `عرض {from}–{to} من {total}` replaces total-only display on multi-page views; 2 new i18n key pairs (`msg.showing_range`, `page.reports.date_range_hint`). (2) Reports `fmt()` number formatting — added `minimumFractionDigits: 0` to match `money()` options exactly. (3) Reports date-range guidance — soft informational hint for invoices, expenses, payroll report types when no date range is set; non-blocking. (4) ResourcePage visible status filter label — bare `<select>` now shows `فلترة:` label instead of tooltip-only, consistent with toolbar conventions. (5) Dashboard "View All" links — Latest Invoices and Latest Expenses cards now have navigation buttons (→ `/invoices`, → `/expenses`), gated on `!loading && items.length > 0`, consistent with existing Contracts card. No backend/schema/permission changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Operational Polish Phase 1A | `feature/operational-polish-phase1a` | `stable-operational-polish-phase1a-v1` | Frontend-only. 6 UX quick wins from the Operational Polish Audit: (1) Dashboard quick action buttons gated by `hasPermission('<module>.create')` — users without create permissions no longer see inapplicable actions. (2) Expense `date` field marked `required: true` — expenses without accounting dates are blocked at form submit. (3) Expense contract selector now uses `optionLabel: 'code'` — contract codes (unique) prevent duplicate-label ambiguity vs. plant names. (4) ResourcePage contracts/equipment stats strip fully localized — 8 hardcoded Arabic strings replaced with `t('stat.rp.*')` calls; 9 new i18n key pairs (AR+EN). (5) Approve/reject expense actions now prompt `confirm()` before API call — prevents misclick approvals. (6) Customer report filter label changed from generic "status" to "نوع العميل" / "Customer Type" via optional `statusLabel` on `ReportType`; all other report types unaffected. 14 new i18n key pairs total. No backend/schema/permission changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Operational Polish Hotfix 1 | `feature/operational-polish-invoice-year-prefix` | `stable-operational-polish-hotfix1-v1` | Frontend-only. One-line fix: `const invoicePrefix = 'MN-INV-2026-'` → `` `MN-INV-${new Date().getFullYear()}-` ``. Invoice number prefix was hardcoded to year 2026 — would have produced wrong prefixes on every January 1st rollover indefinitely. Now derives year from runtime clock. No backend/schema changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Prices Lookup Cleanup | `feature/prices-lookup-cleanup` | `stable-prices-lookup-cleanup-v1` | Backend-only refactor. Removed unused `GET /prices/lookup` endpoint — route, controller handler (`lookup`), service function (`lookupPrice`), and `lookupPriceSchema`. Zero frontend callers, zero test coverage, `findFirst` semantics were misleading (no uniqueness guarantee). Phase 3 auto-fill uses local price data instead. 38 lines removed, no functionality lost. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Project Prices Phase 3 | `feature/project-prices-phase3-smart-lookup` | `stable-project-prices-phase3-v1` | Frontend-only. Auto-fills `unitPrice` when user selects a contract unit and exactly one price exists for that unit in the loaded prices. Uses `priceTouched` flag (client-only, stripped from API payload) to detect manual edits — never overwrites a price the user has typed or picked manually. Uses local `prices` array instead of calling `GET /prices/lookup` per unit change (endpoint uses `findFirst` and cannot confirm uniqueness without a count; local data is already in memory). Picker remains visible as fallback when multiple prices match. No backend/schema/permission changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Project Prices Phase 2C | `feature/project-prices-phase2c` | `stable-project-prices-phase2c-v1` | Frontend-only. Invoice price picker now filters by current row's contract unit — only matching prices shown. Picker button hidden when no prices exist for that unit. Picker closes automatically on unit change (prevents ghost state). `contractLocation` added to picker rows; redundant `contractUnit` column removed. Prices page: `emptyText`, `isFiltered`, `onResetFilters` added to DataTable. 4 new i18n keys (AR+EN): `empty.prices`, `ph.prices.picker_btn`, `ph.prices.picker_list`, `msg.no_prices_for_unit`. No backend/schema changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Operational Stabilization Phase 2 | `feature/operational-stabilization-phase2-i18n-audit` | `stable-operational-stabilization-phase2-v1` | Frontend-only. Hardcoded Arabic strings replaced with i18n keys across 4 pages: Settings field labels (7 labels → `t()` calls), Dashboard equipment/vehicle alert titles and expired/expiring text (3 keys with `{days}` interpolation), Dashboard invoice status subtitle (`{count}` interpolation), Reports print button label. 10 new i18n key pairs (AR+EN). No backend/schema changes. 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Operational Stabilization Phase 1 | `feature/operational-stabilization-phase1` | `stable-operational-stabilization-phase1-v1` | Frontend-only. Fixed missing i18n keys: `perm.module.inventory` and `perm.module.cheques` added to DICT. Fixed Attendance status badge rendering in EN mode (status values were Arabic-only, now resolved via t() keys). No backend/schema changes. Gemini: APPROVED. |
| Project Prices Phase 2B | `feature/project-prices-phase2b` | `stable-project-prices-phase2b-v1` | Backend-only. `GET /prices/lookup?asphaltPlant=&companyName=&contractUnit=&contractLocation=` — finds first matching price. All params optional. Route registered before `/:id` to avoid conflict. Endpoint exists and is ready; frontend auto-lookup not yet wired (deferred to Phase 3). 101/101 tests, all TS + builds clean. Gemini: APPROVED. |
| Project Prices Phase 2A | `feature/project-prices-phase2a` | `stable-project-prices-phase2a-v1` | Frontend-only. Price picker added to each invoice item row in `CreateInvoice`. Loads all prices via `GET /prices?pageSize=200`. `openPickerIdx` tracks which row's picker is open. `applyPrice(i, p)` copies `unitPrice` and `contractUnit` to item. Clipping fix: `overflow: visible` + `position: relative` on price cell. No backend/schema changes. Gemini: APPROVED. |
| Operational UX Phase 1B-A | `feature/operational-ux-phase1b-a` | `stable-operational-ux-phase1b-a-v1` | Frontend-only. Standardized empty states for all 9 surfaces: Contracts, Customers, Suppliers, Equipment, Employees, Expenses, Users (via `emptyText?` on `ModuleConfig`), Invoices, Attendance. Unsaved changes protection: `onBeforeClose?: () => boolean` guard on `Modal` shared component; `isDirty` + `canClose()` on `FormDialog` shared forms; `createGuardClose`/`editGuardClose` on Attendance create/edit modals (`useRef` snapshot, `EMPTY_FORM_JSON` hoisting). 9 i18n keys added (AR + EN). No backend/Prisma/RBAC changes. Frontend TS ✓, Backend TS ✓, Electron TS ✓, build:front ✓, build:back ✓, 101/101 tests. Gemini: APPROVED. |
| Attendance Pagination | `feature/attendance-pagination` | `stable-attendance-pagination-v1` | Server-side pagination for `GET /employees/attendance`: skip/take/meta response, `groupBy`-based KPI stats (total/present/absent/late/leave) on full filtered dataset, server-side search over notes/employee fullName/employee code, DataTable meta/onPage integration, employee list fetch decoupled from paginated load. 17 unit tests added — suite now 101/101. Prisma validate ✓, Backend TS ✓, Frontend TS ✓, Electron TS ✓, build:back ✓, build:front ✓. Gemini: APPROVED WITH MINOR NOTES (optional search debounce deferred). |
| Operational UX Phase 1A | `feature/operational-ux-phase1a` | `stable-operational-ux-phase1a-v1` | Frontend: new `usePersistedState` hook; persisted search, filter, page, and tab state across 11 modules (Customers, Suppliers, Contracts, Employees, Equipment, Expenses, Users, Invoices, Attendance, Maintenance, Inventory); refresh buttons on all affected pages; Arabic/English refresh translations. Security: `clearPersistedUIState()` called on logout to prevent cross-user filter/search leakage. Prisma validate ✓, Backend TS ✓, Frontend TS ✓, Electron TS ✓, build:back ✓, build:front ✓, 84/84 tests pass. Gemini: APPROVED. |
| Attendance UI Completion | `feature/attendance-ui-completion` | `stable-attendance-ui-completion-v1` | Backend: `PATCH /employees/attendance/:id`, `DELETE /employees/attendance/:id`, status filter in `listAttendance`, audit log integration, `updateAttendanceSchema`. Frontend: `Attendance.tsx` page with KPI cards (total/present/absent/late), DataTable (8 cols), employee+status+date-range filters (server-side), client-side search, create/edit/details/delete modals, work-hours auto-calc from checkIn/checkOut. Sidebar entry `event_available`. Full Arabic/English i18n. Gemini: APPROVED WITH MINOR NOTES (pagination and inactive-employee filter recommended post-release). No Prisma migration — schema and permissions pre-existed. |
| Maintenance Module Completion | `feature/maintenance-completion` | `stable-maintenance-completion-v1` | Backend: `PATCH /maintenance/records/:id`, `DELETE /maintenance/records/:id`, type/dateFrom/dateTo/status filters, `updateMaintenanceSchema`, CANCELLED status. Frontend: `Maintenance.tsx` rewritten with full CRUD modals (Create/Edit/Details/Delete), client-side search, equipment+type+status+date filters, equipment name shown alongside code. Replaced all `alert()` with inline errors. |
| Test Coverage Foundation | `feature/test-coverage-foundation` | `stable-test-coverage-foundation-v1` | RED→GREEN→REFACTOR TDD cycle for payroll and accounting. Fixed 2 wrong test assertions (`tafqeet.test.ts`: 1.005 fils fix; `payroll.calc.test.ts`: deductions arg position fix). REFACTOR: `payroll.service.ts` imports from `payroll.calc.ts`; `accounting.service.ts` uses `validateJournalBalance`. 84/84 tests pass. |
| Invoice Custom Type / Direction | `feature/prices-and-invoice-custom-fields` | `stable-project-prices-phase1-v1` | Custom free-text invoice types (نقل اسفلت / يومية / أخرى) and custom directions (SALES / PURCHASE / OTHER with free-text). i18n fix: direction column uses `t('opt.direction.sales')` / `t('opt.direction.purchase')` — hardcoded Arabic removed. |
| Project Prices Phase 1 | `feature/prices-and-invoice-custom-fields` | `stable-project-prices-phase1-v1` | New `ProjectPrice` model + migration `20260610140000_add-project-prices`. Full backend module (routes/controller/service/schema). Frontend `Prices.tsx` page with CRUD + soft delete (`isArchived`). RBAC: `prices.read`, `prices.create`, `prices.update`, `prices.delete`. |
| UI Adoption Phase 1 | `feature/ui-adoption-phase1` | `stable-ui-adoption-phase1-v1` | DESIGN.md created (814-line design system guide). Dashboard CSS: 5 `--db-*` color/radius vars migrated to global tokens (`var(--accent/green/amber/red/radius)`). ~35 hardcoded hex values replaced with `var(--db-*)` in pills, alerts, exec-chips, aw-widgets, kpi gradients. Topbar height corrected to 49px in dashboard. No schema or backend changes. |
| Page-Level Improvements Phase 1 | `feature/page-level-improvements-phase1` | `stable-page-level-improvements-v1` | Frontend UX improvements: status/type filters on Customers, Employees, Equipment, Expenses; status+direction filters on Invoices; search+status filter on Cheques history; reset-filters button and row count on Reports; labeled actions column header in DataTable. No schema or backend changes. |
| Cheques Print Output Phase | `feature/cheques-print-output-v1` | `stable-cheques-print-output-v1` | Gulf Bank cheque image background; 4 overlay fields (beneficiary, date, tafqeet, numeric amount); image hidden on print for real paper; pt font units; NaN-guarded tafqeet. Physical calibration deferred — blocked on real cheque paper dimensions. |
| Cheques Improvements Phase 1+2 | `feature/cheques-improvements-v1` | `stable-cheques-improvements-v1` | Schema validation (enum currency, date bounds, chequeNumber format), enriched audit log, bank select (10 Kuwaiti banks), form field reorder, notes placeholder, dead code removal |
| Alert Deduplication | `feature/alerts-dedup` | `stable-alerts-dedup-v1` | Remove vehicleLicenseExpiry from employee alerts; equipment.registrationExpiry is sole source |
| Audit Log Viewer | `feature/audit-log-viewer` | — | Frontend viewer for AuditLog table |
| Cheques Tafqeet Phase 2 | `feature/cheques-tafqeet-phase2` | `stable-cheques-tafqeet-v1` | Arabic amount-in-words (tafqeet) for KWD cheques |
| Cheques Enhancement Phase 1 | `feature/cheques-enhancement-phase1` | `stable-cheques-enhancement-phase1-v1` | Print guards, status-machine refinements, audit logging |
| Full Operational Data Reset | — (script-only) | — | 91 rows cleared, seed re-applied, 2026-06-09 |
| Employee Import — Extended Fields | `feature/employee-import-extended-fields` | `stable-employee-import-extended-fields-v1` | Arabic header support added |
| Data Import Phase 1 | `feature/data-import-phase1` | `stable-data-import-phase1-v1` | Base import infrastructure |
| Cheques Management | `feature/cheques-management` | `stable-cheques-management-v1.1` | Finance module |
| i18n Phase 5 | `feature/i18n-phase5-remaining-modules` | `stable-i18n-phase5-v1` | Full localization pass |
| i18n Phase 4 | `feature/i18n-phase4-ui-standardization` | `stable-i18n-phase4-v1` | UI standardization |
| i18n Phase 3 | `feature/i18n-phase3-business-pages` | — | Business pages |
| Reports & Export Center | `feature/reports-export-center` | `stable-reports-center-v1` | ExcelJS + PDFKit |
| Executive Dashboard v2 | `feature/executive-dashboard-v2` | `stable-executive-dashboard-v2` | KPIs + charts |
| Payroll System | `feature/payroll-system` | `stable-payroll-system-v1` | Full payroll workflow |
| Roles & Permissions | `feature/roles-permissions` | `stable-roles-permissions-v1` | RBAC system |
| Backup & Restore | `feature/backup-restore` | `stable-backup-restore-v1` | IPC-based backup |

---

## Operational Feedback Audit — 2026-06-12

Verified against production HEAD `5f71d5a`. Code evidence confirmed in `theme.css`, `modules.tsx`, `FormDialog.tsx`, `Invoices.tsx`, `Dashboard.tsx`, `Reports.tsx`, `DataTable.tsx`, `ResourcePage.tsx`.

| # | Observation | Status | Released In | Stable Tag |
|---|---|---|---|---|
| 1 | Equipment registration expiry split into Expiry Date + Remaining Duration | **IMPLEMENTED** | Operational Feedback Phase 1 | `stable-operational-feedback-phase1-v1` |
| 2 | Contract form auto-fill from Prices | **IMPLEMENTED** | Contracts Price Binding | `stable-contracts-price-binding-v1` |
| 3 | Customer visibility in Contracts table | **IMPLEMENTED** | Contracts Price Binding | `stable-contracts-price-binding-v1` |
| 4 | Invoice price picker UX clarification | **IMPLEMENTED** | Operational Feedback Phase 1 | `stable-operational-feedback-phase1-v1` |
| 5 | First-row hidden in tables | **IMPLEMENTED** | Remove DataTable Sticky Header | `stable-remove-datatable-sticky-header-v1` |
| 6 | White gap under table headers | **IMPLEMENTED** | Remove DataTable Sticky Header | `stable-remove-datatable-sticky-header-v1` |
| 7 | Equipment ↔ Plate Number linked selectors | **IMPLEMENTED** | Equipment Plate Integration Phase 1 | `stable-equipment-plate-integration-phase1-v1` |

**Audit status: 7/7 IMPLEMENTED. All observations closed as of 2026-06-12.** Equipment ↔ Plate Number: merged `442e057`, released in `stable-equipment-plate-integration-phase1-v1`.

**DataTable current state (confirmed):** No sticky headers. Zebra rows (`tbody tr:nth-child(even)`), rgba hover tokens, `box-shadow: inset 0 -2px` header border, and pagination `border-top` separator all present. Row-range indicator (`showing_range`) in pagination present. Filter label visible in ResourcePage toolbar.

---

## Next Recommended Tasks

### Immediate Priority: Re-Import Operational Data

The system is on a clean baseline. Re-enter production data in dependency order to avoid FK issues.

**Step 1 — Re-import Employees**
Use Data Import (`/import`) with the employees Excel template. Required fields: code, fullName, salary. Optional: civilId, jobTitle, department, nationality, hireDate, phone, email. Arabic header round-trip is supported.

**Step 2 — Re-import Suppliers**
Use Data Import (`/import`) with the suppliers Excel template. Required fields: code, name. Optional: phone, email, address, contactName, notes.

**Step 3 — Re-import Project Prices**
Use Data Import (`/import`) with the project prices Excel template. Required fields: asphaltPlant, companyName, contractLocation, contractUnit, unitPrice. Dedup key: 4-field composite (asphaltPlant|companyName|contractLocation|contractUnit).

**Step 4 — Re-import Customers**
Use Data Import (`/import`) with the customers Excel template. Required fields: code, name. Optional: type, phone, email, address.

**Step 5 — Re-import Equipment**
Use Data Import (`/import`) with the equipment Excel template. Required fields: code, type. Optional: name, plateNumber, ownerName, driverName, registrationExpiry, status.

**Step 6 — Create Contracts**
Enter contracts manually via the Contracts page. Link to customers and project prices as needed. Use the Contracts Price Binding feature (auto-fills asphaltPlant, companyName, location, unitName, price from the selected price record).

**Step 7 — Begin Production Data Entry**
With master data in place, begin normal operations: invoices, expenses, payroll cycles, attendance, maintenance records.

**Next recommended development tasks (ordered by priority):**

1. **Mobile Companion App** — Read-only dashboard + approval workflows; no confirmed need yet.
2. **Inventory Force Delete Phase 3A** — Audit and design pass for Materials, PurchaseOrders, GoodsReceipts; map FK relationships and safe delete order before any implementation.
3. **Inventory Force Delete Phase 3B** — Implementation of Inventory Force Delete based on Phase 3A audit findings.
4. **Data Import Phase 4 — Grouped Rows Engine** — PurchaseOrders, GoodsReceipts, MaterialIssues import; requires new header+items grouped-row paradigm; WAC ordering must be respected (GR post-order affects WAC calculations).

**Lower priority / deferred:**
- Export with active filters (currently exports all records regardless of filter state)
- Additional dashboard refinements (KPI grid layout, period filter on trend chart)

---

## Clean Operational Baseline — 2026-06-13

Full operational reset executed. The system is in a clean state ready for production data entry.

### System Configuration — Preserved

| Table | Rows | State |
|-------|------|-------|
| users | 2 | ✓ Preserved — admin + secondary user |
| roles | 7 | ✓ Preserved — all 7 roles intact |
| permissions | 100 | ✓ Preserved — all module.action keys |
| role_permissions | 320 | ✓ Preserved — full RBAC assignments |
| settings | 11 | ✓ Preserved — company name, currency, backup config |
| audit_logs | 64 | ✓ Preserved — history + reset event logged |
| backups | 2 | ✓ Preserved — backup event log intact |
| accounts | 0 | ✓ Preserved — chart of accounts (currently unpopulated) |

### Operational Records — Reset to Zero

| Module | Table | Rows After Reset |
|--------|-------|-----------------|
| Customers | customers | 0 |
| Contracts | contracts | 0 |
| Invoices | invoices | 0 |
| Expenses | expenses | 0 |
| Employees | employees | 0 |
| Equipment | equipment | 0 |
| Payroll | payroll | 0 |
| Cheques | cheques | 0 |
| Project Prices | project_prices | 0 |
| Suppliers | suppliers | 0 |
| All child/dependent tables | — | 0 |

All system features remain fully available. Forms module, import/export, reports, dashboard, and all RBAC functionality operate normally. The dashboard will show zeroed KPIs until operational data is re-entered.

---

## Open Operational Notes

No active operational feedback items at this time.

> All seven observations from the Operational Feedback Audit (2026-06-12) have been implemented and released to production. Full operational data reset completed 2026-06-13. The system is now in a clean production-ready state.

### Force Delete Scope (Phase 1A + 1B + 2A + 2B + 2C)

**Supported modules:**

| Module | Released In | Gate |
|--------|-------------|------|
| Equipment | Phase 1A — `stable-equipment-force-delete-phase1a-v1` | Child records (maintenance, fuel, breakdowns, spare parts) → cascade delete |
| Customers | Phase 1B — `stable-customer-force-delete-phase1b-v1` | Invoice Gate: blocked when `directInvoices > 0` OR `contractInvoices > 0`; otherwise nullifies expenses/materialIssues, deletes contracts (cascade removes ContractDocuments), deletes customer |
| Suppliers | Phase 2A — `stable-suppliers-force-delete-phase2a-v1` | Three-gate protection: (1) Invoice Gate — blocked when `invoices > 0`; (2) Posted GoodsReceipt Gate — blocked when `goodsReceiptsPosted > 0` (accounting integrity); (3) Active PurchaseOrder Gate — blocked when `purchaseOrdersActive > 0`. If all gates clear: nullifies `expenses.supplierId`, deletes CANCELLED POs + DRAFT GRs (cascade), deletes supplier. |
| Contracts | Phase 2B — `stable-contracts-force-delete-phase2b-v1` | Single Invoice Gate: blocked when `invoices > 0`. On clear: nullifies `expenses.contractId` + `materialIssues.contractId`; deletes contract (ContractDocuments cascade automatically via `onDelete: Cascade`). |
| Project Prices | Phase 2C — `stable-prices-force-delete-phase2c-v1` | No gates — standalone reference table (zero FK dependencies; values copied at contract/invoice creation time). Direct hard delete via `prisma.$transaction`. Admin-only "حذف نهائي" button (not 409-triggered — archive never returns 409). First audit log in prices module. |

**Deferred modules (must not receive force delete without confirmed operational need):**

- **Employees** — linked to payroll, attendance, and leave records; HR sensitivity; full relationship audit required before implementation
- **Inventory** — material movements affect stock levels; future audit required

Force delete expansion to additional modules is **deferred until real usage confirms the need**.

---

## Mandatory Development Workflow

Execute every step for every feature, bug fix, or enhancement. No exceptions.

```
Step 1:  git checkout production
Step 2:  git pull origin production         (verify clean tree)
Step 3:  git tag pre-<feature-slug>         (rollback checkpoint)
Step 4:  git checkout -b feature/<slug>
Step 5:  Implement (follow module pattern)
Step 6:  Run all validations:
           cd backend && npx tsc --noEmit
           cd frontend && npx tsc --noEmit
           tsc -p electron/tsconfig.json --noEmit
           npm run build:back
           npm run build:front
Step 7:  /simplify                          (Phase 4)
Step 8:  /code-review                       (Phase 5)
Step 9:  /security-review                   (Phase 6)
Step 10: Gemini review (architecture + security + production readiness)
Step 11: Fix all findings, re-run validations
Step 12: git commit (show diff + message draft, await approval)
Step 13: git checkout production
Step 14: git merge --no-ff feature/<slug>
Step 15: Verify: git log, tsc, builds
Step 16: git tag stable-<feature-slug>-v<n>
Step 17: git push origin production          (await approval)
Step 18: git push origin --tags              (await approval)
Step 19: Update this file (PROJECT_STATE.md)
Step 20: Confirm clean working tree
```

### Tag Naming Convention

```
Checkpoint (pre-feature):   pre-<feature-slug>
Stable release:             stable-<feature-slug>-v<n>

Examples:
  pre-cheques-enhancement
  stable-cheques-enhancement-v1
```

### Git Safety Rules

| Action | Policy |
|--------|--------|
| `git push` | Never automatic — always confirm with user |
| `git merge` | Always `--no-ff`, always confirm |
| `git tag` | Always confirm before pushing |
| `git reset --hard` | Never without explicit user request |
| `git clean -fd` | Never without explicit user request |
| Modify `production` directly | NEVER |

---

## Project Constraints

### What manarERP IS

- Local Electron desktop application (Windows)
- Offline-only — no internet required at runtime
- SQLite database — single file, easy backup
- Small internal ERP for one contracting company
- Arabic-first UI, English codebase
- Kuwaiti Dinar (د.ك), 3 decimal places

### What manarERP IS NOT

- SaaS — no multi-tenancy, no subscriptions
- Enterprise platform — no microservices, no Kubernetes
- Cloud-native — no cloud database, no hosted API
- Public product — no external users, no marketplace

### Design Principles

- Simplicity over cleverness
- Reliability over features
- Maintainability over abstraction
- Fast backup and recovery
- Minimal operational overhead
- Internal workflows only

### When Multiple Solutions Exist

**Always choose the simplest maintainable solution.**

### AI Model Routing Policy

| Task Type | Model |
|-----------|-------|
| Routine implementation (CRUD, UI, fixes, i18n, builds) | Claude Sonnet 4.6 (default) |
| Architecture decisions, large refactors, complex debugging | Claude Opus 4.8 (escalate only) |
| Log summaries, doc extraction, quick searches | Claude Haiku 4.5 (utility only) |
| Architecture / security audit | Gemini 3.1 Pro |
| Project management / workflow | ChatGPT |

Return to Sonnet 4.6 after any Opus escalation completes.

---

## Dev Port Policy

| Project | Port | URL |
|---------|------|-----|
| manarERP frontend (Vite) | **5173** | `http://localhost:5173` |
| manarERP backend (Express) | **48211** | `http://127.0.0.1:48211` (localhost only) |
| manar-ui-lab (prototype) | **5174** | `http://localhost:5174` |

### Port Rules

- Port `48211` is reserved for the manarERP backend. It must be free at Electron launch.
- Port `5173` is the manarERP Vite dev server.
- Port `5174` is reserved for `manar-ui-lab` prototypes — never run it on `5173` to avoid conflicts when both projects are open.
- `manar-ui-lab` is a **separate project** at `C:\Users\hhajj\Claude\Projects\manar-ui-lab`. Never modify production from there.

---

## Module Inventory

> **Current DB state (2026-06-13):** The platform is running with a clean operational dataset after a full reset. All modules are fully functional. All operational tables contain 0 rows. Re-import employees, suppliers, project prices, customers, and equipment to begin production data entry.

> **Backend test coverage (2026-06-14):** 158/158 tests ✓. Financial safety tests now cover invoices (KWD 3dp rounding, totals, payment status, overpayment), inventory WAC (roundCost 6dp, calcWAC weighted average, incomingQty=0 guard, sufficientStock), payroll calc, tafqeet, attendance filters, accounting utilities, and employee alerts.

| Module | Backend | Frontend Page | Status |
|--------|---------|--------------|--------|
| Auth | `modules/auth/` | Login | Complete |
| Dashboard | `modules/dashboard/` | `Dashboard.tsx` | Complete — RBAC-gated quick action buttons (invoices/contracts/customers/expenses create); "View All" navigation buttons on Latest Invoices and Latest Expenses cards; all 6 dashboard sub-components i18n-compliant (V3A-Lite); all-time label on Revenue/Expenses/NetProfit KPI cards; weekend attendance empty state (Friday/Saturday) |
| Customers | `modules/customers/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state. **Export:** "تصدير الكل Excel" button (`supportsExport: true`, requires `reports.export`). Archive Override: 409 on DELETE shows Archive modal (non-admin path). **Force Delete (SYSTEM_ADMIN only):** `GET /customers/:id/force` returns dry-run impact preview (contracts, directInvoices, contractInvoices, expenses, contractDocuments, materialIssues + totalChildRecords + willBeDeleted + willBeNullified); `DELETE /customers/:id/force` force-deletes via interactive transaction; **Invoice Gate** hard-blocks deletion when `directInvoices > 0` OR `contractInvoices > 0` (returns `blockedReason`, modal shows hard-block banner, archive remains recommended path); 409 on normal delete opens `ForceDeleteCustomerModal` for SYSTEM_ADMIN (before archive check); confirmation requires typing exact customer code; audit log on every force delete (`action: DELETE`, `forceDelete: true` + impact snapshot in oldValue). |
| Employees | `modules/employees/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state. **Export:** "تصدير الكل Excel" button (`supportsExport: true`, requires `reports.export`). |
| Attendance | `employees module` | `Attendance.tsx` | Production Ready + Server-side Pagination — paginated attendance listing, filter-scoped KPI stats via groupBy, server-side search (notes/employee name/code); persisted filter/search/page state; refresh action; unsaved changes protection (create + edit modals); standardized empty state |
| Payroll | `modules/payroll/` | `Salaries.tsx` | Complete |
| Equipment | `modules/equipment/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state; stats strip fully localized (i18n); separate Expiry Date and Remaining Duration columns. **Export:** "تصدير الكل Excel" button (`supportsExport: true`, requires `reports.export`). **Force Delete (SYSTEM_ADMIN only):** normal delete guarded when child records exist (returns 409); `GET /equipment/:id/force` returns dryRun impact preview (child counts: MaintenanceRecord, FuelLog, Breakdown, SparePartUsage + total); `DELETE /equipment/:id/force` force-deletes with cascade; 409 on normal delete auto-opens force delete modal for SYSTEM_ADMIN; confirmation requires typing exact equipment code; audit log on every force delete (`action: DELETE`, `forceDelete: true` in oldValue). |
| Maintenance | `modules/maintenance/` | `Maintenance.tsx` | Production Ready — full CRUD, search, filters, details modal; persisted filter/search/page state; refresh action; Equipment ↔ Plate Number auto-fill in all 4 forms (Records, Fuel, Breakdowns, Spare Parts) |
| Contracts | `modules/contracts/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state; stats strip fully localized (i18n); Customer column; Linked Price selector; auto-fill from Prices (asphaltPlant, companyName, location, unitName, price). **Export:** "تصدير الكل Excel" button (`supportsExport: true`, requires `reports.export`). **Force Delete (SYSTEM_ADMIN only):** `GET /contracts/:id/force` returns dry-run impact preview (`childCounts` for invoices, expenses, materialIssues, contractDocuments + `totalChildRecords` + `willBeDeleted` + `willBeNullified`); `DELETE /contracts/:id/force` validates invoice gate then executes transactional delete; **Invoice Gate** hard-blocks when `invoices > 0` (blocked modal shows hard-block banner, no archive path available); on clear: nullifies `expenses.contractId` + `materialIssues.contractId`, deletes contract (ContractDocuments cascade via schema); 409 on normal delete opens `ForceDeleteContractModal` for SYSTEM_ADMIN; confirmation requires typing exact contract code; audit log on every force delete (`action: DELETE`, `forceDelete: true` + impact snapshot in `oldValue`). No archive support (`isArchived` field does not exist on Contract model — status field only). |
| Invoices | `modules/invoices/` | `Invoices.tsx` | Complete — custom type/direction fields; persisted search, filter, tab, page state; refresh action; standardized empty state; dynamic year prefix on invoice number |
| Prices | `modules/prices/` | `Prices.tsx` | Complete — project unit prices with soft delete; invoice picker filters by contract unit; auto-fill on unit select when exactly one match (`priceTouched` guards manual edits); picker as fallback for multiple matches; `contractLocation` shown in picker; empty state + filter reset UX. Backend: CRUD only (`list`, `create`, `update`, `delete`) — lookup endpoint removed. **Export:** standalone "تصدير الكل Excel" button (requires `reports.export`). **Force Delete (SYSTEM_ADMIN only):** `GET /prices/:id/force` returns always-unblocked dry-run preview (`childCounts: {}`, `totalChildRecords: 0`, `willBeDeleted: ['projectPrice']`, `willBeNullified: []`); `DELETE /prices/:id/force` permanently hard-deletes record via `prisma.$transaction`; no gates required (standalone reference table — zero FK children); existing archive (`isArchived: true`) is the normal delete path and is preserved unchanged; audit log on every force delete (`action: DELETE`, `forceDelete: true` + full record snapshot in `oldValue`) — first audit trail written in prices module; SYSTEM_ADMIN-only "حذف نهائي" button in row actions (direct trigger, not 409-triggered); confirmation requires typing exact `asphaltPlant` value (`ForceDeleteProjectPriceModal.tsx`). |
| Suppliers | `modules/suppliers/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state. **Export:** "تصدير الكل Excel" button (`supportsExport: true`, requires `reports.export`). Archive Override: 409 on DELETE shows Archive modal (non-admin path). **Force Delete (SYSTEM_ADMIN only):** `GET /suppliers/:id/force` returns dry-run impact preview (`childCounts` for invoices, expenses, purchaseOrdersActive, purchaseOrdersCancelled, goodsReceiptsPosted, goodsReceiptsDraft + `totalChildRecords` + `willBeDeleted` + `willBeNullified`); `DELETE /suppliers/:id/force` executes three-gate validation then transactional delete; **Three-Gate Protection:** (1) Invoice Gate hard-blocks when `invoices > 0`; (2) Posted GoodsReceipt Gate hard-blocks when `goodsReceiptsPosted > 0`; (3) Active PurchaseOrder Gate hard-blocks when `purchaseOrdersActive > 0`; blocked modal shows hard-block banner, archive remains recommended; 409 on normal delete opens `ForceDeleteSupplierModal` for SYSTEM_ADMIN (before archive check); confirmation requires typing exact supplier code; audit log on every force delete (`action: DELETE`, `forceDelete: true` + impact snapshot in `oldValue`). |
| Expenses | `modules/expenses/` | `ResourcePage` | Complete — persisted search, filter, page state; refresh action; standardized empty state; date field required; contract selector uses code (not plant name); approve/reject require confirmation |
| Transactions | `modules/transactions/` | `Accounting.tsx` | Complete |
| Accounting | `modules/accounting/` | `Accounting.tsx` | Complete |
| Reports | `modules/reports/` | `Reports.tsx` | Complete — customer report filter correctly labeled as "نوع العميل" / "Customer Type" (not generic status); `fmt()` uses `minimumFractionDigits: 0` matching `money()` exactly; date-range hint shown for invoices/expenses/payroll when no date range is set |
| Users | `modules/users/` | `Users.tsx` | Complete — persisted search, filter, page state; refresh action; standardized empty state |
| Roles | `modules/roles/` | `Users.tsx` | Complete |
| Audit | `modules/audit/` | — | Backend complete — no frontend viewer yet |
| Backups | `modules/backups/` | `Backup.tsx` + `LastAutoBackupCard.tsx` | Complete — Manual backup/restore via Electron IPC unchanged. **Auto backup (Phase 1):** daily cron at 02:00 KWT (configurable); WAL-safe via `backupService.create('AUTO')` with `PRAGMA wal_checkpoint(FULL)` before copy; retention policy keeps last N AUTO backups only (default 30) — MANUAL and pre-restore backups never pruned; startup catch-up fires one backup if scheduled time was missed while app was closed; `AUTO_BACKUP` and `AUTO_BACKUP_CLEANUP` AuditLog entries with `userId: null`. **Dashboard widget:** `LastAutoBackupCard` — date, time, file size of last successful AUTO backup (or "لا توجد نسخة احتياطية"). **Settings controls:** enabled toggle (`backup.auto.enabled`), time picker (`backup.auto.time`), retention count (`backup.auto.retention`); changes take effect immediately via `backup:reconfigure` IPC → scheduler restart. **Internal API:** `/api/internal/` router protected by runtime `INTERNAL_SECRET` (not JWT); used exclusively by Electron scheduler. |
| Settings | `modules/settings/` | `Settings.tsx` | Complete |
| Cheques | `modules/cheques/` | `Cheques.tsx` | Complete — tafqeet integrated |
| Inventory | `modules/inventory/` | `Inventory.tsx` | Complete — persisted search, filter, page state; refresh action |
| Forms | `modules/forms/` | `Forms.tsx` + 8 print pages | Phase 1B complete + Print Layout Hotfix. 8 official company forms with dual print modes. **A4 single-page print (Hotfix):** all 8 forms guaranteed to print on one A4 page — root cause `minHeight: '100vh'` removed; `@page margin` reduced to 10mm; spacing tightened across `FormLayout`, `FormHeader`, `FormFooter`, `ApprovalSection`, `formStyles`; targeted `pageBreakInside: 'avoid'` on `tableWrapper` and `ApprovalSection` only (no global `*` selector). **Forms hub:** (`Forms.tsx`) shared employee selector + per-card print mode selector + 8 print cards. **8 official templates:** (1) Salary Certificate — employee table + salary table + closing + issue date; (2) To Whom It May Concern — same + "الغرض من الشهادة" blank line; (3) Leave Request — employee + leave details (from `latestLeave` or blank lines) + pledge; (4) Return To Work — employee + previous leave ref + return statement; (5) Salary Advance — employee + advance details + consent clause + employee signature; (6) Resignation — employee + resignation date + last working day + reason + pledge; (7) Employee Warning — employee + warning date + 3-level checkbox (شفهية/خطية/نهائية) + blank reason lines + acknowledgment; (8) Performance Evaluation — employee + eval period + 5-criteria grid (/20 each, total /100) + 5-level rating checkboxes + comments. **Shared template system:** `frontend/src/forms/shared/` — `PrintMode` type, `generateFormNumber()` (`PREFIX-YYYY-NNNN`), `formStyles.ts`, `FormHeader`, `FormFooter`, `FormLayout` (A4 print, auto-print), `FormQRCode` (offline QR via `qrcode` npm), `ApprovalSection` (direct manager only — توقيع + تاريخ + ختم). **Print modes:** `full-template` (company branding visible) + `letterhead` (`visibility: hidden` on header/footer — preserves physical space so body doesn't shift on pre-printed paper). **Audit:** `POST /forms/print-log` — fire-and-forget, `action: PRINT`, `module: forms`. **Backend:** 8 GET endpoints + 1 POST endpoint, all protected. **Permissions:** `forms.read`, `forms.print`, `forms.create` (existing keys — no new permissions added in Phase 1B). **No DB models, no migration, no new permission keys.** Registered outside `<Layout>` for clean full-page print. Navigation: "الشؤون الإدارية" sidebar group. Browser print (not PDFKit) — Chromium renders Arabic natively. |
| Data Import | `modules/import/` | `DataImport.tsx` | Complete — **7 supported entities:** employees, customers, equipment, suppliers, project prices, contracts, expenses. **Flat-row model:** one Excel row = one DB record; no parent-child grouping. All 7 entities follow this model. **FK code resolution (Phase 3A+3B):** `loadCodeToIdMap()` resolves human-readable codes to integer IDs before validation; contracts: `customerCode→customerId`, `managerCode→managerId`; expenses: `contractCode→contractId`, `supplierCode→supplierId`. Unresolved optional FK codes → `undefined` (not an error). FK maps loaded once per import via `Promise.all`; returns `{}` immediately for existing 5 entities (zero overhead). **Expenses specifics:** status hardcoded to `PENDING` on import — no accounting journal entries, no approval side effects; Expense model has no `notes` column (silently dropped from normalized output). **Contract specifics:** status defaults to `ACTIVE` when omitted; valid values: ACTIVE/EXPIRED/RENEWING/SUSPENDED; date fields: YYYY-MM-DD, endDate≥startDate enforced. **Existing imports unchanged:** employees, customers, equipment, suppliers, project prices unaffected by Phase 3 changes. **Config-driven UI:** entity metadata in `frontend/src/config/importEntities.ts` (`IMPORT_ENTITIES` array + `IMPORT_ENTITY_MAP`). Project Prices dedup uses 4-field composite key (asphaltPlant\|companyName\|contractLocation\|contractUnit). ACCOUNTANT role has import.read + import.create. **Deferred to Phase 4 (grouped-row engine):** PurchaseOrders, GoodsReceipts, MaterialIssues — header+items structure requires a new paradigm; GR post-order also affects WAC calculations. |

---

## Validation Checklist (Before Every Commit)

```
[ ] cd backend && npx tsc --noEmit          → 0 errors
[ ] cd frontend && npx tsc --noEmit         → 0 errors
[ ] tsc -p electron/tsconfig.json --noEmit  → 0 errors
[ ] npm run build:back                      → clean compile
[ ] npm run build:front                     → clean build
[ ] cd backend && npx prisma validate       → schema valid
[ ] New permission keys added to constants.ts
[ ] New routes protected by authenticate + requirePermission
[ ] Mutating operations write to AuditLog
[ ] No plain passwords or tokens in DB or logs
[ ] DB migration SQL reviewed before apply (if schema changed)
```

---

## Active Feature Branches (Open / Incomplete)

| Branch | Status | Notes |
|--------|--------|-------|
| *(none)* | — | All feature branches merged as of 2026-06-12 |

> Update this table when a new feature branch is opened.

---

## Seed Data (Post-Reset State)

After the 2026-06-13 full operational reset, the database contains only seed/config data:

| Table | Rows | Content |
|-------|------|---------|
| users | 2 | admin / Admin@123 + secondary user |
| roles | 7 | SYSTEM_ADMIN, GENERAL_MANAGER, ACCOUNTANT, PROJECT_MANAGER, EQUIPMENT_MANAGER, HR_MANAGER, STANDARD_USER |
| permissions | 100 | All module.action keys (97 base + forms.read, forms.print, forms.create) |
| role_permissions | 320 | Full RBAC assignments (307 base + Forms Phase 1A role assignments) |
| settings | 11 | Company name, tax rate, backup config, etc. |

> **Default credentials:** `admin` / `Admin@123` — change on first login.

---

## Plugin and Skill Quick Reference

| Task | Use |
|------|-----|
| Before any feature design | `superpowers:brainstorming` |
| Multi-step implementation plan | `superpowers:writing-plans` |
| Feature with codebase context | `feature-dev:feature-dev` |
| After implementation — simplify | `/simplify` |
| After simplify — review logic | `/code-review` |
| After code review — review security | `/security-review` |
| Before claiming done | `superpowers:verification-before-completion` |
| Before merge decision | `superpowers:finishing-a-development-branch` |
| Bug investigation | `superpowers:systematic-debugging` |
| Library API docs | `context7: resolve-library-id → query-docs` |
| UI debugging | `chrome-devtools-mcp:chrome-devtools` |
| Large codebase search | `Explore` agent |
| Parallel independent tasks | `superpowers:dispatching-parallel-agents` |

---

*Last updated: 2026-06-14 — Forms Print Layout Hotfix released. All 8 employee forms now print on a single A4 page. Root cause: `minHeight: '100vh'` removed from FormLayout; spacing reduced across 5 shared form components; targeted `pageBreakInside: 'avoid'` on tableWrapper and ApprovalSection only. Gemini CHANGES_REQUIRED (global `*` selector) → fix → Gemini APPROVED. Frontend-only, 0 templates changed. frontend tsc ✓, backend tsc ✓, electron tsc ✓, build:front ✓, build:back ✓. Feature commit: `546018a`. Merge commit: `e93e2d4`. Tag: `stable-forms-print-layout-hotfix-v1`.*
