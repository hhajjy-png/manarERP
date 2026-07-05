# Global Monetary Formatting Standardization Pack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish ONE project-wide visual standard for displaying monetary values (`144,922.400 KWD`) across the entire manarERP frontend and backend, driven by a single centralized currency config per project.

**Architecture:** Two mirrored module pairs (frontend `lib/format/`, backend `shared/config` + `shared/utils`) each expose `formatCurrency` / `formatNumber` / `formatInteger` / `formatPercent`, reading locale + currency code from a `currencyConfig` module. All scattered `money()`/`fmt()`/`toLocaleString`/`toFixed` presentation helpers are retired in favour of these. Presentation layer only — no calculation, precision, API, DB, or Prisma changes.

**Tech Stack:** React 18 + TS (frontend), Express + TS (backend), Vitest (both), `Intl.NumberFormat`.

## Global Constraints

- Full format = `formatCurrency(v)` → `"144,922.400 KWD"`. Numeric-only = `formatNumber(v)` → `"144,922.400"`.
- Locale `en-US`, exactly 3 decimal places, thousands separator, never scientific notation, never trailing-zero trimming.
- Currency code `KWD`, uppercase, English only this release (never `د.ك`), even when UI is Arabic.
- Locale/currency code live ONLY in `currencyConfig`. No locale/currency string literals anywhere else.
- Formatter `Intl.NumberFormat` instances created ONCE at module load and reused (never per-call).
- `null` / `undefined` / `NaN` / `''` → `0` (`0.000` / `0.000 KWD`). Negatives keep sign.
- Pixel-designed print/PDF templates (Invoice, RFQ, Quotation, Purchase Order, Cheques) get **numeric-only** — never append `KWD` inside them.
- **Do NOT touch:** calculations, rounding, stored values, precision, Zod, `Number()`/`parseFloat()` used for math, `splitKWD`, `tafqeet`, Excel/CSV raw-numeric cells, DB, Prisma, migrations, APIs, business logic, existing workflows.
- No Zustand / runtime state in this pass. Future Company-Settings language switch must require changing ONLY `currencyConfig`.
- Presentation-only. After each domain: `tsc --noEmit` (relevant project) + existing tests pass + no business-logic change.
- **Do NOT commit** until the user explicitly approves the completed implementation. Steps below include `git add`/`commit` guidance for the executor to run **only after that approval** (or to stage-and-hold per user preference). Never push, never merge.

---

## File Structure

**Created:**
- `frontend/src/lib/format/currencyConfig.ts` — single source of truth (locale, code) for frontend.
- `frontend/src/lib/format/currency.ts` — `formatCurrency`/`formatNumber`/`formatInteger`/`formatPercent`.
- `frontend/src/lib/format/index.ts` — barrel re-export.
- `frontend/src/lib/format/__tests__/currency.test.ts` — unit tests.
- `backend/src/shared/config/currencyConfig.ts` — single source of truth for backend.
- `backend/src/shared/utils/currency.ts` — same four functions.
- `backend/src/shared/utils/__tests__/currency.test.ts` — unit tests.

**Modified (retire local helpers → shared util):** `frontend/src/config/modules.tsx`, `frontend/src/forms/shared/formStyles.ts`, `frontend/src/components/PrivateAmount.tsx`, `frontend/src/print-templates/utils/formatKWD.ts`, `backend/src/shared/services/reportEngine/htmlUtils.ts`, plus the domain files listed per task.

---

## Migration Recipe (applies to every domain task 4–16)

For each file in a domain task, the executor:

1. Add import at top: `import { formatCurrency, formatNumber, formatInteger, formatPercent } from '<relative-path>/lib/format';` (frontend) or from `@shared/utils/currency` (backend). Import only the functions used.
2. Apply these transformations to **presentation** sites only:

| Existing pattern (presentation) | Replace with |
|---|---|
| `n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' د.ك'` | `formatCurrency(n)` |
| `n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' KWD'` | `formatCurrency(n)` |
| `n.toLocaleString('ar-KW', { minimumFractionDigits: 3, ... })` (number display) | `formatNumber(n)` (or `formatCurrency` if a currency label is intended) |
| `n.toLocaleString(...)` bare number for a chart axis/tooltip/label | `formatNumber(n)` |
| `n.toFixed(3)` used for display | `formatNumber(n)` |
| `n.toFixed(0)` / integer count display | `formatInteger(n)` |
| local `money()` / `fmt()` / `fmt3` / `moneyEn()` definitions | delete definition; call shared function directly |
| percentage display via `toFixed`/`toLocaleString` | `formatPercent(n, digits)` |

3. **Leave untouched:** any `Number()`, `parseFloat()`, arithmetic, `.toFixed()` feeding a calculation or a numeric input `value`, Excel/CSV cell values, `splitKWD`, `tafqeet`, and the Arabic debit/credit indicator words (`مدين`/`دائن`) — only the numeric portion they wrap changes.
4. Print/PDF designed templates: use `formatNumber` (bare) — never `formatCurrency`.

Per-domain validation gate (run after each task): `cd frontend && npx tsc --noEmit` (and/or `cd backend && npx tsc --noEmit`), `npm test` on the touched project, and a grep to confirm no stray `' د.ك'` / `'ar-KW'` presentation formatting remains in the touched files.

---

### Task 1: Frontend shared currency config + formatter utilities

**Files:**
- Create: `frontend/src/lib/format/currencyConfig.ts`
- Create: `frontend/src/lib/format/currency.ts`
- Create: `frontend/src/lib/format/index.ts`
- Test: `frontend/src/lib/format/__tests__/currency.test.ts`

**Interfaces:**
- Produces: `currencyConfig: { readonly locale: string; readonly code: string }`; `formatCurrency(value: unknown): string`; `formatNumber(value: unknown): string`; `formatInteger(value: unknown): string`; `formatPercent(value: unknown, fractionDigits?: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/format/__tests__/currency.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, formatInteger, formatPercent } from '../currency';
import { currencyConfig } from '../currencyConfig';

describe('currencyConfig', () => {
  it('defaults to en-US / KWD', () => {
    expect(currencyConfig.locale).toBe('en-US');
    expect(currencyConfig.code).toBe('KWD');
  });
});

describe('formatCurrency', () => {
  it.each([
    [0, '0.000 KWD'],
    [1, '1.000 KWD'],
    [15.25, '15.250 KWD'],
    [125.5, '125.500 KWD'],
    [1250.75, '1,250.750 KWD'],
    [12500, '12,500.000 KWD'],
    [125900.125, '125,900.125 KWD'],
    [2450000, '2,450,000.000 KWD'],
    [144922.4, '144,922.400 KWD'],
  ])('formats %d as %s', (input, expected) => {
    expect(formatCurrency(input)).toBe(expected);
  });

  it('nullish/NaN/empty → 0.000 KWD', () => {
    expect(formatCurrency(null)).toBe('0.000 KWD');
    expect(formatCurrency(undefined)).toBe('0.000 KWD');
    expect(formatCurrency(NaN)).toBe('0.000 KWD');
    expect(formatCurrency('')).toBe('0.000 KWD');
  });

  it('parses numeric strings', () => {
    expect(formatCurrency('1250.75')).toBe('1,250.750 KWD');
  });

  it('keeps negative sign', () => {
    expect(formatCurrency(-15.25)).toBe('-15.250 KWD');
  });

  it('rounds to 3 decimals, no scientific notation', () => {
    expect(formatCurrency(10.5556)).toBe('10.556 KWD');
    expect(formatCurrency(0.0000001)).toBe('0.000 KWD');
  });
});

describe('formatNumber', () => {
  it('bare number, no currency code', () => {
    expect(formatNumber(144922.4)).toBe('144,922.400');
    expect(formatNumber(0)).toBe('0.000');
  });
});

describe('formatInteger', () => {
  it('no decimals, thousands separator', () => {
    expect(formatInteger(144922.4)).toBe('144,922');
    expect(formatInteger(1000)).toBe('1,000');
  });
});

describe('formatPercent', () => {
  it('default 1 fraction digit', () => {
    expect(formatPercent(12.5)).toBe('12.5%');
  });
  it('custom precision', () => {
    expect(formatPercent(33.3333, 2)).toBe('33.33%');
    expect(formatPercent(50, 0)).toBe('50%');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/format/__tests__/currency.test.ts`
Expected: FAIL — cannot resolve `../currency` / `../currencyConfig`.

- [ ] **Step 3: Write the config module**

```ts
// frontend/src/lib/format/currencyConfig.ts
/**
 * Single source of truth for monetary display formatting (frontend).
 *
 * FUTURE (Company Settings → Currency Display Language): only this module changes.
 * English: 144,922.400 KWD   Arabic: 144,922.400 د.ك
 * The formatter API and all callers stay unchanged.
 *
 * NOTE: kept in sync (by value) with backend/src/shared/config/currencyConfig.ts.
 * The two TS projects build independently, so the config is intentionally mirrored.
 */
export const currencyConfig = {
  locale: 'en-US',
  code: 'KWD',
} as const;
```

- [ ] **Step 4: Write the formatter module**

```ts
// frontend/src/lib/format/currency.ts
import { currencyConfig } from './currencyConfig';

// Formatter instances created ONCE at module load and reused (performance requirement).
const numberFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const integerFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Bare number: "144,922.400" — designed print templates & chart axes/labels. */
export function formatNumber(value: unknown): string {
  return numberFormatter.format(toNumber(value));
}

/** Full monetary format: "144,922.400 KWD" — all app UI, HTML reports, non-designed PDF. */
export function formatCurrency(value: unknown): string {
  return `${numberFormatter.format(toNumber(value))} ${currencyConfig.code}`;
}

/** Whole number, no decimals: "144,922" — counts. */
export function formatInteger(value: unknown): string {
  return integerFormatter.format(Math.round(toNumber(value)));
}

/** Percentage: "12.5%" (default 1 fraction digit). */
export function formatPercent(value: unknown, fractionDigits = 1): string {
  const formatter = new Intl.NumberFormat(currencyConfig.locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${formatter.format(toNumber(value))}%`;
}
```

- [ ] **Step 5: Write the barrel**

```ts
// frontend/src/lib/format/index.ts
export { currencyConfig } from './currencyConfig';
export { formatCurrency, formatNumber, formatInteger, formatPercent } from './currency';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/format/__tests__/currency.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Stage (commit only after user approval)**

```bash
git add frontend/src/lib/format
# commit later, on user approval:
# git commit -m "feat(format): add frontend shared currency formatting utilities"
```

---

### Task 2: Backend shared currency config + formatter utilities

**Files:**
- Create: `backend/src/shared/config/currencyConfig.ts`
- Create: `backend/src/shared/utils/currency.ts`
- Test: `backend/src/shared/utils/__tests__/currency.test.ts`

**Interfaces:**
- Produces: identical API to Task 1, importable via `@shared/utils/currency` (alias `@shared/*` → `backend/src/shared/*`).

- [ ] **Step 1: Write the failing test** (mirror of Task 1)

```ts
// backend/src/shared/utils/__tests__/currency.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, formatInteger, formatPercent } from '../currency';
import { currencyConfig } from '../../config/currencyConfig';

describe('backend currencyConfig', () => {
  it('defaults to en-US / KWD', () => {
    expect(currencyConfig.locale).toBe('en-US');
    expect(currencyConfig.code).toBe('KWD');
  });
});

describe('backend formatCurrency', () => {
  it.each([
    [0, '0.000 KWD'],
    [1250.75, '1,250.750 KWD'],
    [144922.4, '144,922.400 KWD'],
    [2450000, '2,450,000.000 KWD'],
  ])('formats %d as %s', (input, expected) => {
    expect(formatCurrency(input)).toBe(expected);
  });
  it('nullish → 0.000 KWD', () => {
    expect(formatCurrency(null)).toBe('0.000 KWD');
    expect(formatCurrency(undefined)).toBe('0.000 KWD');
    expect(formatCurrency(NaN)).toBe('0.000 KWD');
  });
  it('keeps negative sign', () => {
    expect(formatCurrency(-15.25)).toBe('-15.250 KWD');
  });
});

describe('backend formatNumber / formatInteger / formatPercent', () => {
  it('formatNumber is bare', () => {
    expect(formatNumber(144922.4)).toBe('144,922.400');
  });
  it('formatInteger has no decimals', () => {
    expect(formatInteger(144922.4)).toBe('144,922');
  });
  it('formatPercent default 1 digit', () => {
    expect(formatPercent(12.5)).toBe('12.5%');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/shared/utils/__tests__/currency.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the config module**

```ts
// backend/src/shared/config/currencyConfig.ts
/**
 * Single source of truth for monetary display formatting (backend).
 * Mirrors frontend/src/lib/format/currencyConfig.ts by value — keep in sync.
 * FUTURE Company Settings language switch changes ONLY this module.
 */
export const currencyConfig = {
  locale: 'en-US',
  code: 'KWD',
} as const;
```

- [ ] **Step 4: Write the formatter module** (identical body to Task 1 Step 4, importing `../config/currencyConfig`)

```ts
// backend/src/shared/utils/currency.ts
import { currencyConfig } from '../config/currencyConfig';

const numberFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const integerFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Bare number: "144,922.400". */
export function formatNumber(value: unknown): string {
  return numberFormatter.format(toNumber(value));
}

/** Full monetary format: "144,922.400 KWD". */
export function formatCurrency(value: unknown): string {
  return `${numberFormatter.format(toNumber(value))} ${currencyConfig.code}`;
}

/** Whole number: "144,922". */
export function formatInteger(value: unknown): string {
  return integerFormatter.format(Math.round(toNumber(value)));
}

/** Percentage: "12.5%". */
export function formatPercent(value: unknown, fractionDigits = 1): string {
  const formatter = new Intl.NumberFormat(currencyConfig.locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${formatter.format(toNumber(value))}%`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run src/shared/utils/__tests__/currency.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Stage (commit after approval)**

```bash
git add backend/src/shared/config/currencyConfig.ts backend/src/shared/utils/currency.ts backend/src/shared/utils/__tests__/currency.test.ts
```

---

### Task 3: Invoice reference verification + retire central table helper (`modules.tsx`)

Confirms the util matches the Invoice module standard, then routes the app-wide generic-table `money()` through it (fixes `د.ك`→`KWD` for every ResourcePage table at once).

**Files:**
- Modify: `frontend/src/config/modules.tsx:7-10` (`money()`)
- Modify: `frontend/src/pages/Invoices.tsx` (its local `money` helper — see grep line refs)
- Test: `frontend/src/lib/format/__tests__/currency.test.ts` (already covers the standard — add an explicit "invoice reference" assertion)

**Interfaces:**
- Consumes: `formatCurrency` from Task 1.

- [ ] **Step 1: Add an invoice-reference assertion to the util test**

```ts
// append to frontend/src/lib/format/__tests__/currency.test.ts
describe('Invoice module reference standard', () => {
  it('a representative invoice total renders identically to the global standard', () => {
    // Invoice line: total 2,540,125.500 must read the same everywhere.
    expect(formatCurrency(2540125.5)).toBe('2,540,125.500 KWD');
  });
});
```

- [ ] **Step 2: Run it (passes — util already conforms)**

Run: `cd frontend && npx vitest run src/lib/format/__tests__/currency.test.ts`
Expected: PASS.

- [ ] **Step 3: Route `modules.tsx` `money()` through the shared util**

Replace the body at `frontend/src/config/modules.tsx:7-10`:

```ts
import { formatCurrency } from '../lib/format';

// ===== أدوات عرض =====
export function money(v: unknown): string {
  return formatCurrency(v);
}
```

- [ ] **Step 4: Migrate the Invoice page money helper**

In `frontend/src/pages/Invoices.tsx`, find its local `money` definition and replace with `import { formatCurrency } from '../lib/format';` then `const money = formatCurrency;` (or call `formatCurrency` directly). Apply the Migration Recipe to any remaining `toLocaleString`/`toFixed` presentation sites in the file.

- [ ] **Step 5: Type-check + tests + build**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: no type errors; tests pass. Fix any test asserting the old `د.ك` invoice/table output to expect `KWD`.

- [ ] **Step 6: Manual UI verify**

Load Invoices page and any ResourcePage table (e.g. Contracts, Expenses); confirm amounts read `1,250.750 KWD`.

- [ ] **Step 7: Stage (commit after approval)**

```bash
git add frontend/src/config/modules.tsx frontend/src/pages/Invoices.tsx frontend/src/lib/format/__tests__/currency.test.ts
```

---

### Task 4: Dashboard & Executive Dashboard

**Files (modify):** `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/ExecutiveDecisionCenter.tsx` (local `money` at :50), `frontend/src/pages/FinancialOperationsDashboard.tsx` (local `money` at :46, tick formatter at :178), `frontend/src/components/dashboard/*` (RevenueChart, KPITimeline, FinancialIntelPanel, ExecutiveIntelligenceV2Panel, ExecutiveAlertsV3, command/RevenueDistributionSection, command/PerformanceChartSection).

- [ ] **Step 1:** Apply the Migration Recipe to each file. Delete local `money()` defs; import from `../lib/format` / `../../lib/format`. Chart tick/tooltip formatters use `formatNumber` (axes) or `formatCurrency` (tooltips/data labels) per your standard.
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit`
- [ ] **Step 3:** `cd frontend && npx vitest run` (fix `commandData.test.ts` expectations if they assert old formatting).
- [ ] **Step 4:** Grep the touched files for `' د.ك'` / `'ar-KW'` / stray `toFixed`/`toLocaleString` presentation — expect none.
- [ ] **Step 5:** Manual: open Dashboard + Executive Decision Center; verify KPI cards, charts, tooltips all read `… KWD`.
- [ ] **Step 6:** Stage the touched files (commit after approval).

---

### Task 5: Accounting / Financial

**Files (modify):** `frontend/src/pages/Accounting.tsx`, `frontend/src/pages/FinancialCenter.tsx`, `frontend/src/components/financial/*` — `BalanceDisplay.tsx` (:18,:42 `ar-KW`), `ImbalanceAlert.tsx` (:5 `ar-KW`), `TrialBalanceTable.tsx`, `StatementTable.tsx`, `JournalBookTable.tsx`, `FinancialReportsTab.tsx`, `GroupedTable.tsx`, `FinancialDashboardTab.tsx`, `AgingTable.tsx`, `AgingSummaryCards.tsx`, `AgingChart.tsx`. **Test:** `frontend/src/__tests__/formatBalance.test.ts`.

- [ ] **Step 1:** In `BalanceDisplay.tsx`, keep the `مدين`/`دائن` indicator words and the sign logic; replace only the numeric `abs.toLocaleString('ar-KW', …)` with `formatNumber(abs)`. Same for `ImbalanceAlert.tsx`. Apply the recipe to the rest.
- [ ] **Step 2:** Update `frontend/src/__tests__/formatBalance.test.ts` — change its local `fmt` to `(n) => formatNumber(Math.abs(n))` importing from `../lib/format`, so assertions track the new en-US output.
- [ ] **Step 3:** `cd frontend && npx tsc --noEmit`
- [ ] **Step 4:** `cd frontend && npx vitest run`
- [ ] **Step 5:** Grep touched files for `'ar-KW'` — expect none in presentation.
- [ ] **Step 6:** Manual: Accounting ledger / trial balance / aging — verify numbers read en-US 3-dec and indicators intact.
- [ ] **Step 7:** Stage (commit after approval).

---

### Task 6: Customers & Suppliers

**Files (modify):** `frontend/src/components/ContractFinancialSummaryModal.tsx` and any customer/supplier balance/report views (grep `toLocaleString|toFixed|money` under customer/supplier pages & components). Customer/supplier tables driven by `modules.tsx` are already fixed by Task 3 — verify only.

- [ ] **Step 1:** Apply recipe to customer/supplier balance & report presentation sites.
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit`
- [ ] **Step 3:** `cd frontend && npx vitest run`
- [ ] **Step 4:** Grep touched files — no stray presentation formatting.
- [ ] **Step 5:** Manual: customer & supplier balance views read `… KWD`.
- [ ] **Step 6:** Stage (commit after approval).

---

### Task 7: Contracts

**Files (modify):** `frontend/src/pages/Prices.tsx` (contract prices), contract value/remaining/total displays (grep contracts pages/components for `toLocaleString|toFixed`), and any `… د.ك` option labels in `modules.tsx:109` (contract picker) — decide: option labels are UI, convert to `formatCurrency`.

- [ ] **Step 1:** Apply recipe; convert `${x.unitPrice} د.ك` option label to `${formatNumber(x.unitPrice)}` or `${formatCurrency(x.unitPrice)}`.
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit`
- [ ] **Step 3:** `cd frontend && npx vitest run`
- [ ] **Step 4:** Grep touched files — clean.
- [ ] **Step 5:** Manual: contract values, remaining balances, totals read standard.
- [ ] **Step 6:** Stage (commit after approval).

---

### Task 8: Payroll & Payroll Analytics

**Files (modify):** `frontend/src/pages/Salaries.tsx`, `frontend/src/pages/SalaryAdvance.tsx`, `frontend/src/pages/BankSalaryAnalytics.tsx` (`fmt3` at :142 `ar-KW`), `frontend/src/pages/PayrollBankImport.tsx`, `frontend/src/pages/BankImport.tsx`, `frontend/src/ai/skills/payroll.ts`. **Print/pixel templates** `SalaryAdvanceTemplate.tsx`, `SalaryCertificateTemplate.tsx`, `PayrollPayslip` → numeric-only (`formatNumber`) where they own their currency label.

- [ ] **Step 1:** Apply recipe. `BankSalaryAnalytics` `fmt3` → `formatNumber`. Salary cards/stats → `formatCurrency`. Payslip/advance/certificate designed layouts → `formatNumber` only.
- [ ] **Step 2:** `cd frontend && npx tsc --noEmit`
- [ ] **Step 3:** `cd frontend && npx vitest run`
- [ ] **Step 4:** Grep touched files — clean.
- [ ] **Step 5:** Manual: payroll list, analytics charts, a payslip print preview (label placement intact, number en-US).
- [ ] **Step 6:** Stage (commit after approval).

---

### Task 9: Inventory & Equipment

**Files (modify):** `frontend/src/pages/Maintenance.tsx`, equipment fuel/maintenance cost displays, inventory value / material / purchase / weighted-avg cost presentation sites (grep inventory & equipment pages/components). Equipment table via `modules.tsx` already fixed — verify.

- [ ] **Step 1:** Apply recipe to cost/value presentation.
- [ ] **Step 2–4:** `tsc --noEmit`, `vitest run`, grep clean.
- [ ] **Step 5:** Manual: equipment fuel/maintenance cost, inventory value read standard.
- [ ] **Step 6:** Stage (commit after approval).

---

### Task 10: Expenses

**Files (modify):** `frontend/src/pages/Expenses.tsx`, `frontend/src/ai/skills/expenses.ts`, expense report views. Expenses table amount via `modules.tsx:335` already fixed — verify.

- [ ] **Step 1:** Apply recipe.
- [ ] **Step 2–4:** `tsc --noEmit`, `vitest run`, grep clean.
- [ ] **Step 5:** Manual: expense pages & reports read standard.
- [ ] **Step 6:** Stage (commit after approval).

---

### Task 11: Explorer pages

**Files (modify):** `frontend/src/pages/BankAccountExplorer.tsx`, `frontend/src/pages/BankAccounts.tsx`, `frontend/src/pages/BankReconciliation.tsx`, `frontend/src/pages/BankStatementImport.tsx`, `frontend/src/pages/Cheques.tsx`, `frontend/src/components/ForceDeleteChequeModal.tsx`, `frontend/src/utils/chequeTemplate.ts`, other explorer tables (grep). Cheque **print** template → numeric-only.

- [ ] **Step 1:** Apply recipe; cheque printed layout uses `formatNumber`.
- [ ] **Step 2–4:** `tsc --noEmit`, `vitest run` (fix `forceDeleteChequeModal.test.tsx` / `bankTimelineTab.test.tsx` if they assert old formatting), grep clean.
- [ ] **Step 5:** Manual: explorer tables & cheque views read standard.
- [ ] **Step 6:** Stage (commit after approval).

---

### Task 12: Reports Center

**Files (modify):** `frontend/src/pages/Reports.tsx`, `frontend/src/pages/ReportPrint.tsx`, `frontend/src/components/financial/FinancialReportsTab.tsx` (if not done in Task 5), report-specific presentation. `ReportPrint` printed layout → numeric-only where it owns the label; on-screen report tables → `formatCurrency`.

- [ ] **Step 1:** Apply recipe.
- [ ] **Step 2–4:** `tsc --noEmit`, `vitest run`, grep clean.
- [ ] **Step 5:** Manual: generate a report + its print preview; verify.
- [ ] **Step 6:** Stage (commit after approval).

---

### Task 13: Charts (sweep)

**Files (modify):** any remaining Recharts/Chart.js formatters not caught earlier — `components/dashboard/RevenueChart.tsx`, `KPITimeline.tsx`, `AgingChart.tsx`, and grep for `tickFormatter|tooltip|labelFormatter|formatter:` across `frontend/src`.

- [ ] **Step 1:** Route every axis label → `formatNumber`; tooltip/legend/hover/data label → `formatCurrency` (per your chart requirement: `2,500,000.000 KWD` in tooltips, `2,500,000.000` acceptable on dense axes).
- [ ] **Step 2–4:** `tsc --noEmit`, `vitest run`, grep clean.
- [ ] **Step 5:** Manual: hover charts across dashboards; tooltips read `… KWD`.
- [ ] **Step 6:** Stage (commit after approval).

---

### Task 14: Print Preview & HTML reports (frontend) + designed templates

**Files (modify):** `frontend/src/print-templates/utils/formatKWD.ts` (route `formatKWD` to re-export `formatNumber`; keep `splitKWD`, keep `formatKWDAr` as-is for any Arabic layout that still wants it), `frontend/src/print-templates/reference/**` (Invoice/RFQ/Quotation/PurchaseOrder designs — verify they stay **numeric-only**, no `formatCurrency`), `frontend/src/print-templates/adapters/invoiceAdapter.ts`, `frontend/src/print-templates/studio/lineItemsResolver.ts`, `frontend/src/forms/**Template.tsx`, `frontend/src/utils/print.ts`, `frontend/src/utils/pdfExport.ts`. **Test:** `frontend/src/__tests__/printTemplates/formatKWD.test.ts`.

- [ ] **Step 1:** Make `formatKWD(n)` delegate to `formatNumber(n)`:

```ts
// frontend/src/print-templates/utils/formatKWD.ts (formatKWD only)
import { formatNumber } from '../../lib/format';
export function formatKWD(total: number): string {
  return formatNumber(Math.abs(total));
}
```
Keep `splitKWD`, `KWDParts`, and `formatKWDAr` unchanged (Arabic-word/print domain).

- [ ] **Step 2:** Confirm designed templates never append `KWD`; leave their own currency label in the layout.
- [ ] **Step 3:** `cd frontend && npx tsc --noEmit`
- [ ] **Step 4:** `cd frontend && npx vitest run` — `formatKWD.test.ts` should still pass (output identical: `1,234.500`). Fix only if a test asserted `Math.abs` edge differently.
- [ ] **Step 5:** Manual: print-preview one invoice + one quotation; confirm alignment/labels unchanged, numbers standard.
- [ ] **Step 6:** Stage (commit after approval).

---

### Task 15: Backend Report Engine & PDFKit services

**Files (modify):** `backend/src/shared/services/reportEngine/htmlUtils.ts` (`fmtCell` :11-17), `html.service.ts`, `pdf.service.ts`, `table.template.ts`, `summary.template.ts`, `footer.template.ts`, and backend report builders using presentation formatting (`modules/reports/reports.service.ts`, `modules/dashboard/dashboard.service.ts`, `modules/executive/executive.service.ts`, `modules/statements/statements.controller.ts`, `modules/payrollBankImport/reportBuilder.ts`, `modules/bankStatementImport/reportBuilder.ts`, `modules/salaries/salaries.bankAnalytics.service.ts`). **Test:** `backend/src/shared/services/reportEngine/__tests__/reportEngine.test.ts`, `html.service.test.ts`.

- [ ] **Step 1:** Decide per call site: money cells in generated **reports** (presentation) → `formatCurrency`; bare numeric grid cells that mimic designed layout → `formatNumber`. Replace `fmtCell`'s inline `toLocaleString('en-US', {min:0,max:3})` with a `formatNumber`-based path for money columns while leaving non-money cells (`esc`) intact. **Do NOT** touch Excel export numeric cell values in `excel.service.ts` (raw numeric).
- [ ] **Step 2:** `cd backend && npx tsc --noEmit`
- [ ] **Step 3:** `cd backend && npx vitest run` — update `reportEngine.test.ts` / `html.service.test.ts` expectations to the new formatted strings (e.g. `1,500.500` → `1,500.500 KWD` where a money column now carries the label, or bare where numeric-only).
- [ ] **Step 4:** Grep backend touched files for stray presentation `toLocaleString`/`toFixed` — none outside the shared util.
- [ ] **Step 5:** Manual/integration: generate one backend PDF and one HTML report; verify money reads standard, Excel still opens with numeric cells.
- [ ] **Step 6:** `cd backend && npm run build:back` — confirm alias rewrite OK.
- [ ] **Step 7:** Stage (commit after approval).

---

### Task 16: Export modules & final sweep

**Files (modify):** `frontend/src/utils/exportUtils.ts`, `frontend/src/utils/pdfExport.ts`, `backend/src/shared/services/financial/export/summary.export.adapter.ts`, and any remaining grep hits.

- [ ] **Step 1:** Presentation-only export strings (PDF/HTML/printable) → `formatCurrency`. **Excel/CSV numeric cells stay raw numeric** — do not convert to formatted text (preserve sorting/filtering/formulas).
- [ ] **Step 2:** Final repo-wide grep (both projects):

Run (frontend): search `toLocaleString\('ar-KW'|\+ ' د\.ك'|minimumFractionDigits: 3` across `frontend/src` excluding `lib/format`, `print-templates/utils/formatKWD.ts` (formatKWDAr), and `i18n.ts` field labels.
Run (backend): same across `backend/src` excluding `shared/utils/currency.ts`.
Expected: no presentation-formatting hits remain outside the shared util & intentional Arabic-label exclusions.

- [ ] **Step 3:** Full validation:
```
cd frontend && npx tsc --noEmit && npm run build:front && npx vitest run
cd backend  && npx tsc --noEmit && npm run build:back  && npx vitest run
```
Expected: all green.

- [ ] **Step 4:** CLAUDE.md review gate: `/simplify` → `/code-review` → `/security-review`, then Gemini review. Fix findings.
- [ ] **Step 5:** Produce the final implementation report (spec §6 deliverables 1–11), incl. confirmation the Invoice module is now the single global monetary formatting standard.
- [ ] **Step 6:** Present to user for explicit approval, THEN (on approval) commit all staged work on the feature branch and update PROJECT_STATE. Do not push/merge without instruction.

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task — utilities (T1–T2), Invoice reference (T3), dashboards (T4), accounting (T5), customers/suppliers (T6), contracts (T7), payroll (T8), inventory/equipment (T9), expenses (T10), explorer (T11), reports (T12), charts (T13), print/HTML (T14), backend engine/PDFKit (T15), exports + Excel-raw exclusion + final sweep (T16).
- **Print-template safety:** T14 keeps designed templates numeric-only; `formatKWD`→`formatNumber` preserves exact existing output (`1,234.500`), so `formatKWD.test.ts` stays green.
- **Type consistency:** function names `formatCurrency`/`formatNumber`/`formatInteger`/`formatPercent` and `currencyConfig.{locale,code}` are identical across frontend and backend and used verbatim in every task.
- **No business logic:** every task limits edits to presentation strings; `splitKWD`, `tafqeet`, Excel numeric cells, and all math are explicitly excluded.
