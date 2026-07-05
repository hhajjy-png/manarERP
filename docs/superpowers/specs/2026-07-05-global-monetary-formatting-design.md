# Global Monetary Formatting Standardization Pack — Design

**Date:** 2026-07-05
**Type:** Feature (cross-cutting, presentation layer only — frontend + backend)
**Scope:** Establish ONE project-wide visual standard for displaying monetary values. Presentation layer only. No business/accounting/payroll/inventory logic, no precision/rounding, no DB, no Prisma, no API, no calculation changes.

---

## 1. The Standard

Canonical full format (all application UI, HTML reports, non-designed PDF):

```
144,922.400 KWD
```

Rules:
- Locale `en-US`
- Thousands separator required
- Exactly 3 decimal places (never trim trailing zeros)
- Never scientific notation
- Currency code `KWD`, always uppercase, English only (never `د.ك` this release)
- Applies even when the app UI language is Arabic

Two rendering modes from one source of truth:

| Mode | Output | Where |
|------|--------|-------|
| **Full** | `144,922.400 KWD` | Screen UI, dashboards, tables, cards, charts, dialogs, analytics, explorer, standard reports, HTML reports, non-designed PDF |
| **Numeric-only** | `144,922.400` | Pixel-designed print/PDF templates (Invoice, RFQ, Quotation, Purchase Order, Cheques, and other designed layouts) that render their own currency label as part of the layout |

Numeric-only mode deliberately omits `KWD` so designed templates keep their own currency label — avoids layout shifts, duplicate labels, and preserves print alignment.

Examples (full mode):
```
0.000 KWD · 1.000 KWD · 15.250 KWD · 125.500 KWD · 1,250.750 KWD
12,500.000 KWD · 125,900.125 KWD · 2,450,000.000 KWD
```

---

## 2. Architecture — Centralized Config + Shared Utilities

manarERP is **two independent TypeScript projects** (`frontend/`, `backend/`) with separate builds and no shared package. Cross-project import would break both builds, so the standard is implemented as **two mirrored module pairs with identical logic**, each documented as requiring value-sync.

### Config module (single source of truth per project)
- `frontend/src/lib/format/currencyConfig.ts`
- `backend/src/shared/config/currencyConfig.ts`

```ts
// The ONLY place locale/currency-code live. Future Company Settings changes touch ONLY this module.
export const currencyConfig = {
  locale: 'en-US',   // en-US now; Arabic later via Company Settings
  code: 'KWD',       // 'KWD' now; 'د.ك' later
} as const;
```

No locale/currency literals are hardcoded anywhere else. When the future "Currency Display Language" setting lands, only this provider changes — the formatter API and every consumer keep working unmodified. No Zustand / runtime state introduced in this pass.

### Formatter module (reads config only)
- `frontend/src/lib/format/currency.ts`
- `backend/src/shared/utils/currency.ts`

```ts
import { currencyConfig } from './currencyConfig';

// Formatter instance created ONCE at module load and reused (performance requirement).
const numberFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 3, maximumFractionDigits: 3,
});
const integerFormatter = new Intl.NumberFormat(currencyConfig.locale, {
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

/** Full monetary format: "144,922.400 KWD" */
export function formatCurrency(value: unknown): string;
/** Bare number: "144,922.400" — for designed print templates & chart axes/data */
export function formatNumber(value: unknown): string;
/** Whole number, no decimals: "144,922" — counts */
export function formatInteger(value: unknown): string;
/** Percentage: "12.5%" (default 1 fraction digit) */
export function formatPercent(value: unknown, fractionDigits?: number): string;
```

Behavior:
- `null` / `undefined` / `NaN` / `''` → treated as `0` → `0.000` (`0.000 KWD` in full mode)
- Negatives keep their sign
- No scientific notation, no trailing-zero trimming
- `formatCurrency` = `formatNumber(v) + ' ' + currencyConfig.code`

### Re-use, not re-implement
Existing scattered helpers become thin wrappers / re-exports of the shared util so formatting is corrected at the source with minimal churn:
- `frontend/src/config/modules.tsx` `money()` → `formatCurrency` (fixes `د.ك`→`KWD` for ALL generic CRUD tables at once)
- `frontend/src/forms/shared/formStyles.ts` `money()` / `moneyEn()`
- `frontend/src/components/PrivateAmount.tsx` default currency
- `backend/src/shared/services/reportEngine/htmlUtils.ts` `fmtCell()`
- Local `money()` / `fmt()` / `fmt3` helpers in `BankSalaryAnalytics` (`ar-KW`), `components/financial/BalanceDisplay` & `ImbalanceAlert` (`ar-KW`), `ExecutiveDecisionCenter`, `FinancialOperationsDashboard`, and other domain files

---

## 3. Rollout — Util First, Then By Domain

Each domain is a self-contained, independently-reviewable migration. After **every** domain: `tsc --noEmit` (relevant project), run existing tests, verify UI consistency, confirm no business-logic change, confirm all monetary values follow the standard. Proceed only when the current domain is fully validated.

Order:
1. **Shared formatting utilities** (+ unit tests, verified against Invoice standard) — frontend & backend
2. **Invoice module** (reference implementation)
3. **Dashboard & Executive Dashboard**
4. **Accounting** (accounts, journal, ledger, trial balance, financial statements)
5. **Customers & Suppliers** (balances, reports, dashboards)
6. **Contracts** (values, remaining balances, totals)
7. **Payroll & Payroll Analytics** (payroll, analytics, bank import, salary cards/stats)
8. **Inventory & Equipment** (material/purchase/weighted-avg cost, inventory value, fuel/maintenance cost)
9. **Expenses** (pages, reports)
10. **Explorer pages** (every monetary column)
11. **Reports Center** (all reports)
12. **Charts** (axis labels, tooltips, legends, hover/data labels — via `formatNumber`/`formatCurrency`)
13. **Print Preview & HTML reports**
14. **Backend Report Engine & PDFKit services** (`html.service`, `pdf.service`, `table.template`, `summary.template`, `htmlUtils`)
15. **Export modules** (presentation-only export strings)

---

## 4. Explicit Exclusions (Safety — Not Touched)

- All calculations, rounding algorithms, stored values, float/decimal precision, Zod validation
- `Number()` / `parseFloat()` used for **math** (only presentation-formatting calls are replaced)
- **Excel/CSV numeric cells** stay raw-numeric (preserve sorting/filtering/formulas) — only presentation-only export strings get formatted
- Designed print templates keep their own currency label; only the numeric value is standardized
- `splitKWD` (dinars/fils split) and `tafqeet` (amount-in-words) — domain logic
- DB schema, Prisma models, migrations, APIs, services' business logic, existing workflows

---

## 5. Validation

- `cd frontend && npx tsc --noEmit` + `npm run build:front`
- `cd backend && npx tsc --noEmit` + `npm run build:back`
- `cd frontend && npm test` and `cd backend && npm test` — existing tests continue to pass
- New unit tests for both util modules covering every example row in the standard (full, numeric, integer, percent, null/negative/zero edge cases)
- Repo-wide grep confirms no stray presentation `toLocaleString('ar-KW', …)` / `+ ' د.ك'` remains outside intentional Arabic-domain use
- CLAUDE.md review gate before merge: `/simplify` → `/code-review` → `/security-review` → Gemini review; feature branch + `--no-ff` merge + stable tag

---

## 6. Deliverables (final report)

1. Files modified · 2. Shared utilities created/updated · 3. Components migrated · 4. Reports updated · 5. Charts updated · 6. Print engine updates · 7. Export updates · 8. Remaining manual formatting locations (if any) · 9. Performance considerations · 10. Validation summary · 11. Confirmation that the Invoice module is the single global monetary formatting standard across manarERP.
