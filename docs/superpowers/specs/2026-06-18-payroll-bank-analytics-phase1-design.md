# Payroll Bank Analytics — Phase 1 Design Spec

**Date:** 2026-06-18  
**Status:** Approved  
**Branch:** feature/payroll-bank-analytics-phase1  
**Scope:** Read-only analytics layer over imported `SalaryPayment` data. No schema changes. No import redesign. No migration.

---

## 1. Context & Constraints

- **Production state:** 214 salary payment rows, 71,900.000 KWD imported and working.
- **Schema is immutable:** `SalaryPayment` is a bank transaction history. No FK to Employee will be added. No new columns or indexes added.
- **No new dependencies:** Recharts already in use. `buildExcel` utility already in use. No new libraries.
- **Offline/Electron-first:** All computation on the local backend. No cloud calls.
- **Phase boundary:** Analytics, employee profile, timeline, monthly summary, transactions table, Excel export. No dashboards, predictive analytics, or advanced charts.

---

## 2. Data Model (read-only)

### SalaryPayment fields used

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int | |
| `transactionId` | String (unique) | |
| `sourceMonth` | String? | Format: `"Mar-25"` — encodes payroll month/year |
| `paymentDate` | DateTime? | Actual bank payment date |
| `beneficiaryAccount` | String? | Bank account number |
| `beneficiaryName` | String | Name as received from bank |
| `amount` | Float | KWD, 3 decimal places |
| `currency` | String | Always `"KWD"` in current data |
| `status` | String? | `"PROCESSED"` or other |
| `civilId` | String? | Primary join key to Employee |

### Employee fields used for enrichment

| Field | Type | Notes |
|-------|------|-------|
| `id` | Int | Used as route param |
| `code` | String | Employee code (unique) — autocomplete search |
| `fullName` | String | Arabic name — autocomplete search |
| `fullNameEn` | String? | English name — autocomplete search |
| `civilId` | String? | Primary match key |
| `bankAccount` | String? | Fallback match key |
| `jobTitle` | String? | Displayed in profile card |
| `department` | String? | Displayed in profile card |
| `status` | String | `ACTIVE \| ON_LEAVE \| TERMINATED` |

---

## 3. Backend Architecture

### 3.1 Files

| File | Action |
|------|--------|
| `backend/src/modules/salaries/salaries.routes.ts` | Add 4 new routes (modify existing file) |
| `backend/src/modules/salaries/salaries.bankAnalytics.service.ts` | New — all analytics logic |
| `backend/src/modules/salaries/__tests__/salaries.bankAnalytics.test.ts` | New — 12+ tests |

No new router file. Routes are added to the existing `salaries.routes.ts` for cohesion.

### 3.2 Routes

All routes use `authenticate` (already applied at router level) + `requirePermission('import.read')`.

```
GET /api/salaries/bank-payments/analytics
GET /api/salaries/bank-payments/analytics/export
GET /api/salaries/bank-payments/employee/:employeeId
GET /api/salaries/bank-payments/transactions
```

### 3.3 Employee Resolution (centralized helper)

```typescript
// Exported for reuse across all analytics endpoints
async function resolveEmployeePayments(employeeId: number): Promise<{
  employee: EmployeeProfile;
  payments: SalaryPayment[];
  matchedBy: 'civilId' | 'bankAccount' | 'none';
}>
```

**Resolution logic:**
1. `prisma.employee.findUnique({ where: { id: employeeId } })` — throws 404 if not found
2. Query `SalaryPayment` where `civilId = employee.civilId` (if civilId is set)
3. If result count = 0 AND `employee.bankAccount` exists → fallback: query where `beneficiaryAccount = employee.bankAccount`
4. Return `{ employee, payments, matchedBy }`

This function is called by both `/employee/:employeeId` and by the analytics endpoint when `employeeId` filter is present.

### 3.4 Month/Year Filter Conversion

`payrollMonth` (integer 1–12) + `payrollYear` (integer) are converted to `sourceMonth` string before querying:

```
month=3, year=2025 → sourceMonth = "Mar-25"
```

Conversion uses the same 3-letter month abbreviation table already defined in `salaries.bankImport.service.ts` (`formatSourceMonth`). Import that function — do not duplicate it.

### 3.5 Filter Set (all optional, all composable)

| Param | DB field | Notes |
|-------|----------|-------|
| `payrollMonth` + `payrollYear` | `sourceMonth` (exact) | Converted via `formatSourceMonth` |
| `dateFrom` | `paymentDate` ≥ | ISO string or date |
| `dateTo` | `paymentDate` ≤ | ISO string or date |
| `amountMin` | `amount` ≥ | Float |
| `amountMax` | `amount` ≤ | Float |
| `status` | `status` exact | String |
| `transactionId` | `transactionId` exact | String |
| `employeeId` | resolved → `civilId` or `beneficiaryAccount` | via `resolveEmployeePayments` |
| `civilId` | `civilId` exact | String |
| `bankAccount` | `beneficiaryAccount` exact | String |
| `search` | OR: `beneficiaryName`, `civilId`, `transactionId`, `beneficiaryAccount` | contains |

---

## 4. Analytics Endpoint Response Shape

`GET /api/salaries/bank-payments/analytics`

```typescript
{
  global: {
    totalTransactions: number;
    totalAmount: number;         // rounded to 3 dp
    uniqueEmployees: number;     // unique civilIds with a match in Employee table
    averagePayment: number;      // rounded to 3 dp
    minPayment: number;
    maxPayment: number;
    firstPaymentDate: string | null;   // ISO
    lastPaymentDate: string | null;    // ISO
  };

  monthly: Array<{
    payrollMonth: number;         // 1–12
    payrollYear: number;          // e.g. 2025
    sourceMonth: string;          // "Mar-25"
    transactionCount: number;
    employeeCount: number;        // unique civilIds
    totalAmount: number;
    averageAmount: number;
    minAmount: number;
    maxAmount: number;
    varianceFromPrev: number | null;  // null for first month
    variancePct: number | null;       // null for first month
  }>;

  employees: Array<{
    civilId: string | null;
    employeeId: number | null;    // null if no Employee record found
    employeeName: string;         // fullName from Employee, or beneficiaryName
    code: string | null;          // Employee.code
    transactionCount: number;
    totalAmount: number;
    averageAmount: number;
    minAmount: number;
    maxAmount: number;
    firstPaymentDate: string | null;
    lastPaymentDate: string | null;
    lastPaymentAmount: number | null;
  }>;

  topEmployeesByAmount: Array<{ civilId: string | null; employeeName: string; totalAmount: number; }>;  // top 5
  topEmployeesByCount:  Array<{ civilId: string | null; employeeName: string; transactionCount: number; }>; // top 5
  highestPayments:      Array<{ transactionId: string; beneficiaryName: string; amount: number; paymentDate: string | null; }>;  // top 5
  latestPayments:       Array<{ transactionId: string; beneficiaryName: string; amount: number; paymentDate: string | null; }>;  // latest 5
}
```

All aggregations computed in the service layer. Frontend receives pre-calculated values.

---

## 5. Employee Detail Endpoint Response Shape

`GET /api/salaries/bank-payments/employee/:employeeId`

```typescript
{
  employee: {
    id: number;
    code: string;
    fullName: string;
    fullNameEn: string | null;
    civilId: string | null;
    bankAccount: string | null;
    jobTitle: string | null;
    department: string | null;
    status: string;             // ACTIVE | ON_LEAVE | TERMINATED
  };

  matchedBy: 'civilId' | 'bankAccount' | 'none';

  stats: {
    transactionCount: number;
    totalAmount: number;
    averageAmount: number;
    minAmount: number;
    maxAmount: number;
    firstPaymentDate: string | null;
    lastPaymentDate: string | null;
    firstPaymentAmount: number | null;
    lastPaymentAmount: number | null;
    amountChange: number | null;          // lastAmount - firstAmount
    amountChangePct: number | null;       // ((last - first) / first) * 100, null if first = 0
    distinctPayrollMonths: number;        // count of unique sourceMonth values
  };

  timeline: Array<{
    sourceMonth: string;          // "Mar-25"
    payrollMonth: number;
    payrollYear: number;
    amount: number;               // sum of payments in that month for this employee
    transactionCount: number;
  }>;  // ordered chronologically

  history: Array<{
    id: number;
    sourceMonth: string | null;
    paymentDate: string | null;
    amount: number;
    currency: string;
    status: string | null;
    transactionId: string;
    beneficiaryAccount: string | null;
    beneficiaryName: string;
  }>;  // ordered by paymentDate desc
}
```

---

## 6. Transactions Endpoint Response Shape

`GET /api/salaries/bank-payments/transactions`

Paginated. Default page size: 50. Max: 200.

```typescript
{
  data: Array<{
    id: number;
    transactionId: string;
    sourceMonth: string | null;
    paymentDate: string | null;
    beneficiaryName: string;
    beneficiaryAccount: string | null;
    civilId: string | null;
    amount: number;
    currency: string;
    status: string | null;
    // Enriched from Employee table:
    employeeId: number | null;
    employeeCode: string | null;
    employeeName: string | null;       // fullName
    matchedBy: 'civilId' | 'bankAccount' | null;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

`matchedBy` is computed per row:
- `'civilId'` if `SalaryPayment.civilId` exists and maps to an Employee
- `'bankAccount'` if `SalaryPayment.beneficiaryAccount` maps to an Employee.bankAccount
- `null` if no match

---

## 7. Export Endpoint

`GET /api/salaries/bank-payments/analytics/export`

Query params: `type=transactions|employee|monthly` + all filter params + `employeeId` for employee export.

Returns `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with `Content-Disposition: attachment`.

Uses existing `buildExcel()` from `backend/src/shared/services/reportEngine/excel.service.ts`.

**Metadata sheet (added as first row block in every export):**

| Field | Value |
|-------|-------|
| Company | شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م |
| Report | تقرير تحليلات الرواتب البنكية |
| Generated at | ISO datetime |
| Generated by | `req.user.username` |
| Applied filters | Serialized filter summary (human-readable) |
| Record count | N records |

---

## 8. Frontend Architecture

### 8.1 Files

| File | Action |
|------|--------|
| `frontend/src/pages/BankSalaryAnalytics.tsx` | New — main page |
| `frontend/src/config/modules.tsx` (NAV array) | Add nav entry |
| `frontend/src/App.tsx` | Add route |
| `frontend/src/lib/i18n.ts` | Add `nav.bank_analytics` key (Arabic + English) |

The page is implemented as a single file with focused sub-components defined inline. No separate component files for Phase 1 — keeps the scope contained.

### 8.2 Nav Entry

Added immediately after `payroll/bank-import` in the financial group:

```typescript
{ key: 'payroll/bank-analytics', label: 'nav.bank_analytics', icon: 'bar_chart', permission: 'import.read' }
```

i18n keys:
- Arabic: `تحليلات الرواتب البنكية`
- English: `Bank Salary Analytics`

### 8.3 Page Sections (top to bottom)

#### Header
```
تحليلات الرواتب البنكية
تحليل تحويلات الرواتب المستوردة من البنك
```

#### Filters Panel
Collapsible. Filters applied only on "تطبيق" button click (not live). Fields:

| Label | Input type | Param |
|-------|-----------|-------|
| السنة | number input | `payrollYear` |
| الشهر | select 1–12 | `payrollMonth` |
| من تاريخ | date input | `dateFrom` |
| إلى تاريخ | date input | `dateTo` |
| مبلغ من | number input | `amountMin` |
| مبلغ إلى | number input | `amountMax` |
| رقم العملية | text input | `transactionId` |
| بحث (اسم / رقم مدني / حساب) | text input | `search` |

Buttons: `تطبيق` (primary) · `مسح الفلاتر` (secondary)

#### Summary Cards Row
6 cards in a flex row:

| Arabic label | Value source |
|---|---|
| إجمالي التحويلات | `global.totalTransactions` |
| إجمالي المبالغ (د.ك) | `global.totalAmount` formatted 3 dp |
| عدد الموظفين | `global.uniqueEmployees` |
| متوسط التحويل (د.ك) | `global.averagePayment` |
| أعلى تحويل (د.ك) | `global.maxPayment` |
| آخر تاريخ تحويل | `global.lastPaymentDate` formatted |

#### Monthly Chart
Recharts `BarChart` — monthly totals (د.ك). Reuses dark-tooltip pattern from `RevenueChart.tsx`. RTL layout. X-axis: `sourceMonth` labels. Y-axis: amount. Single bar series.

Export button: "تصدير Excel" → `type=monthly`.

#### Monthly Summary Table
Columns: الشهر | السنة | الموظفون | التحويلات | الإجمالي (د.ك) | المتوسط | الأعلى | الأقل | الفرق عن الشهر السابق

`varianceFromPrev`: shown with color (green = increase, red = decrease) and Δ prefix.

#### Employee Section

**Employee Autocomplete Search**
- Text input with dropdown list of matching employees
- Searches as user types (debounced 200ms, min 1 char)
- Searches Employee table fields: `code`, `fullName`, `fullNameEn`, `civilId`
- Dropdown shows: `[code] fullName / fullNameEn` with civilId below
- On select → loads employee detail from `/bank-payments/employee/:employeeId`
- "View Employee" link button → navigates to `/employees` (uses router, links to existing employee list)

**Employee Profile Card**
Displayed after selection:

| Field | Source |
|-------|--------|
| الرقم الوظيفي | `employee.code` |
| الاسم بالعربي | `employee.fullName` |
| الاسم بالإنجليزي | `employee.fullNameEn \|\| —` |
| الرقم المدني | `employee.civilId \|\| —` |
| رقم الحساب البنكي | `employee.bankAccount \|\| —` |
| القسم | `employee.department \|\| —` |
| المهنة | `employee.jobTitle \|\| —` |
| الحالة | pill: ACTIVE=green/نشط, ON_LEAVE=amber/إجازة, TERMINATED=gray/منتهي |
| تطابق الاستيراد | `matchedBy`: "الرقم المدني" or "رقم الحساب" |

**Employee Statistics Cards**
Row of cards:

| Label | Value |
|-------|-------|
| عدد التحويلات | `stats.transactionCount` |
| إجمالي المستلم (د.ك) | `stats.totalAmount` |
| متوسط الراتب (د.ك) | `stats.averageAmount` |
| أعلى مبلغ (د.ك) | `stats.maxAmount` |
| أقل مبلغ (د.ك) | `stats.minAmount` |
| أشهر الدفع | `stats.distinctPayrollMonths` |
| أول دفعة (د.ك) | `stats.firstPaymentAmount` |
| آخر دفعة (د.ك) | `stats.lastPaymentAmount` |
| التغيير | `stats.amountChange` with sign (+/-) and `stats.amountChangePct`% |

**Employee Payment Timeline**
Visual vertical list ordered chronologically. Each node:
```
[sourceMonth label]
[amount formatted 3 dp] د.ك
```
Arrow/connector between nodes. Color: neutral for stable amounts, green for increases, amber for decreases. Max visible: 12 months; "عرض المزيد" button for longer histories.

Export button: "تصدير السجل" → `type=employee&employeeId=X`.

**Employee History Table**
Columns: شهر الراتب | تاريخ الدفع | المبلغ (د.ك) | العملة | الحالة | رقم العملية | رقم الحساب | الاسم بالبنك

Ordered: `paymentDate` descending.

#### Transactions Table
Full paginated table of `SalaryPayment` records enriched with employee data.

Columns: الموظف | الرقم المدني | رقم الحساب | شهر الراتب | تاريخ الدفع | المبلغ (د.ك) | العملة | الحالة | رقم العملية | اسم المستفيد | رقم مستفيد | تطابق عبر

`تطابق عبر` (Matched By): pill — "رقم مدني" (blue) | "رقم الحساب" (gray) | `—` if null.

Features: loading state, error state, empty state, pagination controls (previous/next/page count).

Export button: "تصدير العمليات" → `type=transactions` + current filters.

---

## 9. Money Formatting Convention

All KWD amounts: `toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })` + ` د.ك`

Backend rounds to 3 decimal places in service layer before returning. Frontend does not recalculate.

---

## 10. Tests (salaries.bankAnalytics.test.ts)

12 test cases, all using Vitest + Prisma mock pattern matching existing tests:

1. `analytics()` — empty dataset → all zeros, no crash, monthly/employee arrays empty
2. `analytics()` — no filters → correct global totals, correct employee count
3. `analytics({ payrollMonth: 3, payrollYear: 2025 })` → only March 2025 rows returned
4. `analytics({ employeeId })` → only that employee's payments included
5. `transactions({ dateFrom, dateTo })` → date range filter returns correct rows
6. `transactions({ amountMin, amountMax })` → amount filter correct
7. `resolveEmployeePayments(id)` — civilId match → returns payments, `matchedBy: 'civilId'`
8. `resolveEmployeePayments(id)` — no civilId, bankAccount fallback → `matchedBy: 'bankAccount'`
9. `resolveEmployeePayments(id)` — non-existent id → throws AppError 404
10. Employee stats — `amountChange`, `amountChangePct`, `distinctPayrollMonths` correct
11. Monthly variance — `varianceFromPrev` null for first month, correct delta for subsequent
12. `matchedBy` computation — correct pill value for civilId-matched vs bankAccount-matched rows

---

## 11. Not In Scope (Phase 1)

- Predictive analytics / forecasting
- Push notifications / alerts
- Advanced charts beyond monthly bar chart
- Employee → Bank Payments tab on the employee page (noted as future, not built)
- PDF export
- Bulk actions on payments
- Any mutation of SalaryPayment records

---

## 12. Suggested Commit Message

```
feat(salaries): add Payroll Bank Analytics page (Phase 1)

Read-only analytics layer over SalaryPayment data. No schema changes.
Adds analytics/employee-detail/transactions endpoints with full filter
support, employee autocomplete with profile + payment timeline, monthly
variance table, Recharts bar chart, and Excel export with metadata.
```
