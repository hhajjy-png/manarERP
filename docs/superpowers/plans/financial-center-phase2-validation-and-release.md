# Financial Center Phase 2 — Validation & Release Plan

> Run after all 5 implementation parts are committed (Part 1 → Part 5, in order).

---

## Objective

Verify the complete Financial Center Phase 2 implementation: TypeScript type safety, backend and frontend build integrity, unit test suite, manual UI verification, and structured release per CLAUDE.md workflow.

## Dependencies

- Parts 1–5 all committed to the feature branch
- All TypeScript types defined (Part 1 `financial.types.ts`)
- All exports registered (Part 1 `constants.ts`, `seed.ts`)
- Backend module registered in `app.ts` (Part 2)
- Frontend route registered in `App.tsx` (Part 2)

---

## Step-by-Step Validation

### Phase A — TypeScript Validation (3 contexts)

#### A1 — Backend TypeScript

```bash
cd backend && npx tsc --noEmit
```

Expected output: no output (0 errors). Any error must be resolved before continuing.

Common errors and fixes:
- `Cannot find module '@shared/services/financial/...'` → check path alias in `backend/tsconfig.json` (should map `@shared/*` to `src/shared/*`)
- `Property 'X' does not exist on type 'Y'` → `accountingService.financialSummary()` return shape mismatch — read actual method, update mapping in `financial.service.ts`
- `Object literal may only specify known properties` → extra field in `wrapFinancialResponse` call; remove it
- `Type 'X' is not assignable to type 'FinancialResponse<never>'` → `getFinancialSummary()` returns rows as `never[]`, which is correct

#### A2 — Frontend TypeScript

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

Common errors and fixes:
- `Cannot find module '../../types/financial.types'` → if Vite path alias `@shared/*` fails at compile time, copy `financial.types.ts` to `frontend/src/types/financial.types.ts` and update all imports
- `Property 'anyPermission' does not exist on type 'ProtectedRouteProps'` → check `ProtectedRoute.tsx` interface; if prop not supported, use `permission` with `statements.read` or wrap with `hasPermission` check in `App.tsx` instead
- `Parameter 'e' implicitly has 'any' type` → add `: Error` annotation
- React import errors → ensure all used hooks are imported

#### A3 — Electron TypeScript

```bash
tsc -p electron/tsconfig.json --noEmit
```

Expected: 0 errors. Financial Center has no IPC changes; this is a regression guard only.

---

### Phase B — Unit Tests

```bash
cd backend && npm test
```

Expected output:
```
✓ src/shared/services/financial/balance.utils.test.ts (8 tests)
✓ src/shared/services/financial/aging.utils.test.ts (9 tests)
✓ src/shared/services/financial/drilldown.utils.test.ts (5 tests)
[all other existing tests pass]
```

All 22 new tests from Part 1 must pass. No regressions in existing test files.

---

### Phase C — Build Validation

#### C1 — Backend build

```bash
npm run build:back
```

Expected: exits 0. Output `backend/dist/` must contain all compiled `.js` files.

Verify key files exist after build:
```
backend/dist/modules/financial/financial.routes.js
backend/dist/modules/financial/financial.service.js
backend/dist/modules/financial/financial.controller.js
backend/dist/shared/services/financial/balance.utils.js
backend/dist/shared/services/financial/aging.utils.js
backend/dist/shared/services/financial/drilldown.utils.js
backend/dist/shared/services/financial/dashboard-summary.service.js
```

If path alias errors appear in `dist/` (`Cannot find module '@config/...'` at runtime), re-run `npm run build:back` — the build step rewrites all aliases to relative paths.

#### C2 — Frontend build

```bash
npm run build:front
```

Expected: exits 0. Output `frontend/dist/` must be produced without errors.

---

### Phase D — Database / Seed Validation

After Part 1 seed changes are committed, run seed in development:

```bash
cd backend && npx prisma db seed
```

Then verify with Prisma Studio:

```bash
cd backend && npx prisma studio
```

Check `Permission` table — these keys must exist:
```
aging.read, aging.export
gl.read, gl.export
trialbalance.read, trialbalance.export
journal.read, journal.export
finreports.read, finreports.export
financial.read, financial.export
financialdashboard.read
```

Check `RolePermission` table — ACCOUNTANT must have all of the above. STANDARD_USER must NOT have `financialdashboard.read`.

---

### Phase E — Manual UI Verification Checklist

Start the app:
```bash
npm run dev
```

Login as ACCOUNTANT. Run through this checklist in order.

#### E1 — Navigation and Access

- [ ] Sidebar shows "المحاسبة المالية" item under المالية group
- [ ] Clicking it navigates to `/financial`
- [ ] URL changes to `/#/financial` (HashRouter)
- [ ] Tab bar visible: كشف الحساب | تقادم الذمم | حساب عام | تقرير الحسابات | ميزان المراجعة | دفتر اليومية | التقارير المالية
- [ ] Default tab is كشف الحساب
- [ ] Login as STANDARD_USER → sidebar item NOT visible (permission: statements.read required)

#### E2 — كشف الحساب (Statement Tab)

- [ ] EntityType dropdown shows "عميل" and "مورد"
- [ ] After selecting EntityType = عميل, EntityId dropdown loads customer list
- [ ] After selecting a customer, statement loads with entries
- [ ] Running balance column present and mathematically correct (opening + debit - credit = closing)
- [ ] Grouped view toggle (by year/month) works
- [ ] Flat view shows all entries in chronological order
- [ ] Smart default (grouped) applies only on first load when no localStorage preference
- [ ] Switching to flat → refresh → flat persists (localStorage `financial.statement.viewMode`)
- [ ] "إخفاء الذمم المسوية" toggle filters out settled items
- [ ] Warning banner appears when hide-settled is ON
- [ ] Export to Excel produces valid `.xlsx`
- [ ] Export to PDF produces valid `.pdf`
- [ ] DrillDown: clicking invoice ref navigates to `/invoices?highlight=<id>`
- [ ] ReturnToReportButton visible on `/invoices` page after DrillDown
- [ ] Clicking ReturnToReportButton returns to Financial Center with correct tab/customer/dates restored
- [ ] Refresh on `/invoices?highlight=<id>` → ReturnToReportButton still works (sessionStorage, not location.state)
- [ ] Statement with Supplier entityType also works

#### E3 — تقادم الذمم (Aging Tab)

- [ ] Sub-tabs: AR (ذمم العملاء) and AP (ذمم الموردين)
- [ ] AR aging loads table with customers who have outstanding balances
- [ ] Customers with outstanding = 0 NOT shown in table (filter applied)
- [ ] Buckets: current, 0–30, 31–60, 61–90, 91–120, +120
- [ ] Bar chart visible with color-coded buckets (Recharts BarChart)
- [ ] Summary cards show totals per bucket
- [ ] "إخفاء الصفري" toggle (hide zero rows) works
- [ ] Clicking a row's invoice amount navigates to `/invoices?highlight=<id>`
- [ ] Clicking a customer name navigates within Financial Center to Statement tab with that customer
- [ ] AP tab loads supplier aging
- [ ] AP disclaimer note visible: "يشمل فواتير الشراء فقط (ليس مصروفات المباشرة)"
- [ ] Export to Excel produces valid `.xlsx`
- [ ] asOfDate filter applied correctly (overdue days computed relative to asOf)

#### E4 — حساب عام (GL Statement Tab)

- [ ] AccountSelector dropdown loads chart of accounts
- [ ] Selecting an account and date range loads GL statement with opening balance
- [ ] Running balance column correct
- [ ] Normal balance indicator (D/C) shows per entry based on `metadata.normalBalance`
- [ ] MANUAL entries DrillDown → `/accounting?highlight=<id>`
- [ ] Source-referenced entries DrillDown → source document route
- [ ] ReturnToReportButton works from `/accounting`
- [ ] Export works

#### E5 — تقرير الحسابات (GL Report Tab)

- [ ] Loads account list with totals (debit/credit/net)
- [ ] Expanding an account (chevron or click) → triggers separate GL Statement call for that account
- [ ] Performance: page load does NOT fetch all individual account lines at once
- [ ] Pagination works (if account list > 1 page)
- [ ] Date range filter works

#### E6 — ميزان المراجعة (Trial Balance Tab)

- [ ] Mode toggle: "لحظي" (as-of) and "بالفترة" (period)
- [ ] As-of mode: single asOfDate filter, shows closing balance per account
- [ ] Period mode: fromDate + toDate, shows opening + debit + credit + closing columns
- [ ] Imbalance alert banner shows when `Math.abs(totalDebit - totalCredit) >= 0.001`
- [ ] Clicking account name navigates to GL Statement tab for that account
- [ ] Export (both modes) produces correct column sets

#### E7 — دفتر اليومية (Journal Book Tab)

- [ ] Loads paginated journal entries
- [ ] Expanding entry shows debit/credit line sub-table
- [ ] Expand all / Collapse all buttons work
- [ ] Status filter (DRAFT / POSTED / CANCELLED) works
- [ ] Description search works
- [ ] Date range filter works
- [ ] Clicking entry navigates to `/accounting?highlight=<id>`
- [ ] Export includes flattened lines

#### E8 — التقارير المالية (Financial Reports Tab)

- [ ] 4 KPI cards: إيرادات / تحصيلات / مصاريف / صافي الدخل
- [ ] M10 disclaimer text visible below cards
- [ ] 4 grayed-out "قريباً" future report placeholders visible
- [ ] Export to Excel / PDF works
- [ ] Date range filter changes the KPI values

#### E9 — Dashboard "مالي" Tab

- [ ] Dashboard shows "عام" tab active by default
- [ ] Login as ACCOUNTANT → "مالي" tab button visible
- [ ] Login as STANDARD_USER → "مالي" tab button NOT visible
- [ ] Clicking "مالي" → FinancialDashboardTab loads
- [ ] Shows AR/AP summary cards with criticalOver90
- [ ] Shows top 5 customers and top 5 suppliers tables
- [ ] "آخر تحديث" timestamp visible
- [ ] Clicking a customer row navigates to `/financial?tab=statement&entityType=customer&entityId=<id>`
- [ ] "عرض التفاصيل" button on AR card navigates to `/financial?tab=aging&subTab=ar`
- [ ] Refreshing page → "مالي" tab restores (localStorage `dashboard.tab`)
- [ ] Second load within 45s → same `generatedAt` timestamp (cache hit)
- [ ] Existing "عام" tab content completely unchanged

#### E10 — Statements.tsx Migration Banner

- [ ] Navigate to `/statements` (old Statement Center)
- [ ] Banner visible: "🆕 يتوفر الإصدار الجديد..."
- [ ] "فتح الإصدار الجديد" button → navigates to `/financial?tab=statement`
- [ ] "✕" dismiss button → banner disappears
- [ ] Refresh page → banner stays dismissed (localStorage `statements.bannerDismissed`)
- [ ] Clear localStorage → banner reappears

#### E11 — Invoices.tsx DrillDown Targets

- [ ] Navigate directly to `/invoices`
- [ ] No ReturnToReportButton visible (no sessionStorage entry)
- [ ] Come from DrillDown (via Financial Center) → ReturnToReportButton visible below page title
- [ ] Row with `id={`row-${invoice.id}`}` present in DOM (required for useHighlight hook)
- [ ] Highlighted row has CSS highlight class applied

#### E12 — Expenses.tsx DrillDown Targets (same as E11 but for expenses)

- [ ] `id={`row-${expense.id}`}` on expense rows
- [ ] useHighlight hook highlights on `?highlight=<id>`
- [ ] ReturnToReportButton visible when coming from DrillDown

#### E13 — Accounting.tsx DrillDown Targets

- [ ] `id={`row-${entry.id}`}` on journal entry rows
- [ ] useHighlight hook works
- [ ] ReturnToReportButton visible

#### E14 — Permission Isolation

- [ ] ACCOUNTANT: all 7 tabs visible
- [ ] Login as a user with only `statements.read` → only كشف الحساب tab visible; others hidden
- [ ] Login as a user with only `aging.read` → only تقادم الذمم tab visible
- [ ] User with no financial permissions at all → `/financial` redirects or shows empty state (ProtectedRoute handles this)

#### E15 — URL State Persistence

- [ ] Set filters on كشف الحساب (customer, dates, view mode) → copy URL → open in new tab → same filters applied
- [ ] Tab selection in URL `?tab=aging` → directly loads Aging tab
- [ ] SubTab `?subTab=ap` → loads AP Aging directly
- [ ] Refreshing any Financial Center URL → correct tab + filters restored

---

### Phase F — Integration Test Checklist

These test cross-module interactions (not unit-testable):

- [ ] `POST /api/invoices` (create SALES invoice) → `GET /api/financial/dashboard-summary` within 45s → same cached totals; wait >45s → new totals include the new invoice
- [ ] `POST /api/accounting/journal-entries` (create posted entry) → `GET /api/financial/gl-statement/:accountId` includes the new entry
- [ ] DrillDown from GL Statement on a SALES invoice entry → `/invoices?highlight=<id>` → correct row highlighted
- [ ] DrillDown from Aging table invoice cell → `/invoices?highlight=<id>` → correct invoice highlighted
- [ ] ReturnToReportButton after multi-level DrillDown (Statement → Invoice → back) restores exact state
- [ ] `GET /api/financial/dashboard-summary` without auth → 401
- [ ] `GET /api/financial/dashboard-summary` with STANDARD_USER token → 403

---

### Phase G — Release Steps

Per CLAUDE.md Feature workflow:

#### G1 — Checkpoint tag (before feature branch)

```bash
git tag checkpoint/pre-financial-center-phase2
git push origin checkpoint/pre-financial-center-phase2
```

> This was done at the START of the work (Part 1, Step 0). Confirm tag exists before merging.

```bash
git tag | grep checkpoint
```

Expected: `checkpoint/pre-financial-center-phase2` listed.

#### G2 — Confirm feature branch

```bash
git branch --show-current
```

Expected: `feature/financial-center-phase2` (or equivalent — NOT `production` or `main`).

#### G3 — Final pre-merge validation

Run all Phase A, B, C validations one final time on the feature branch tip:

```bash
cd backend && npx tsc --noEmit && npm test && npm run build:back
cd frontend && npx tsc --noEmit && npm run build:front
tsc -p electron/tsconfig.json --noEmit
```

All must exit 0 before requesting Gemini review.

#### G4 — Gemini Architecture Review

Prepare Gemini review report from `docs/superpowers/specs/2026-06-24-financial-center-phase2-spec.md` and the 7 plan files. Include:

1. Architecture decisions (Orchestrator pattern, no new libraries, DrillDown sessionStorage, TTL cache)
2. Security considerations (tagged template literals for `$queryRaw`, permission gates on all routes, audit logging)
3. Migration strategy (Phase X banner, /statements untouched)
4. New permission keys and role assignments
5. Spec issues found and fixed (M1–M10)

Per CLAUDE.md: Gemini architecture review AND Gemini security review are both required before commit on a Feature.

#### G5 — Fix Gemini findings (if any)

Address all HIGH and MEDIUM findings. Document LOW findings in `docs/` but do not block merge.

Re-run Phase A–C validation after fixes.

#### G6 — Merge (no-ff)

```bash
git checkout main
git merge --no-ff feature/financial-center-phase2 -m "feat(financial): Financial Center Phase 2 — Statement Center Phase 2, AR/AP Aging, GL, Trial Balance, Journal Book, Financial Dashboard"
```

**Do NOT merge until Gemini reviews are complete and all HIGH findings are fixed.**

#### G7 — Stable tag

```bash
git tag stable/financial-center-phase2
git push origin stable/financial-center-phase2
git push origin main
```

#### G8 — Update PROJECT_STATE.md

Add entry to `docs/PROJECT_STATE.md`:

```markdown
## Financial Center Phase 2 — [date]

**Tag:** stable/financial-center-phase2

**What shipped:**
- Statement Center Phase 2 (unified Financial Center with 7 tabs)
- AR/AP Aging with bucket analysis and Recharts chart
- GL Statement (running balance, DrillDown)
- GL Report (account totals, expand-on-demand)
- Trial Balance (as-of and period modes, imbalance alert)
- Journal Book (paginated, expandable lines)
- Financial Reports Tab (summary KPIs + future placeholders)
- Financial Dashboard Tab (cached 45s, top-5 AR/AP, criticalOver90)
- Dashboard "مالي" tab added
- DrillDown system (sessionStorage, 3-click max, ReturnToReportButton)
- Statements.tsx Phase X migration banner

**Permission keys added:**
aging.*, gl.*, trialbalance.*, journal.*, finreports.*, financial.*, financialdashboard.read

**Migration phase:** Phase X (banner live, /statements still works)
```

---

## Rollback Procedure

If a critical regression is found post-merge:

```bash
git revert --no-commit stable/financial-center-phase2..HEAD
git commit -m "revert: rollback Financial Center Phase 2 due to [reason]"
```

Or cherry-pick the checkpoint:

```bash
git checkout checkpoint/pre-financial-center-phase2 -- .
```

**The checkpoint tag makes full rollback safe.** `/statements` was never modified (only banner added) — removing the banner is the only Statements.tsx change needed.

---

## Acceptance Criteria (Release Gate)

All of the following must be true before merge:

- [ ] Phase A: `tsc --noEmit` exits 0 on backend, frontend, and electron
- [ ] Phase B: 22 utility tests pass, 0 regressions
- [ ] Phase C: Both build commands exit 0
- [ ] Phase D: All 7 new permission key groups present in DB seed
- [ ] Phase E: All 15 sections of the UI checklist checked (no blocking failures)
- [ ] Phase F: All integration test scenarios pass
- [ ] Phase G: Gemini architecture + security reviews complete with no open HIGH findings
- [ ] `/statements` page still works after migration banner (regression guard)
- [ ] `production` branch not touched
- [ ] No automatic commits, pushes, merges, or tags without user approval
