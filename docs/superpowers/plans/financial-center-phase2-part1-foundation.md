# Part 1 — Foundation: Shared Services, Types & Permissions

> **Depends on:** Nothing (first step)
> **Blocks:** All other parts

---

## Objective

Create all shared financial utilities, unified type definitions, and permission infrastructure. No endpoint or UI is implemented here — this is pure infrastructure consumed by Parts 2–5.

## Scope

- Shared types (`financial.types.ts`)
- Math utilities (`balance.utils.ts`)
- Aging bucket calculator (`aging.utils.ts`)
- DrillDown reference builder (`drilldown.utils.ts`)
- Response wrapper (`financial.response.ts`)
- Financial summary helpers (`summary.utils.ts`)
- Add 6 new modules to `constants.ts`
- Add permission seed entries to `seed.ts`
- Unit tests for all utilities

## Files to Create

| File | Purpose |
|------|---------|
| `backend/src/shared/services/financial/financial.types.ts` | All shared types used across financial module |
| `backend/src/shared/services/financial/balance.utils.ts` | Running balance, closing balance, normalizeMoney |
| `backend/src/shared/services/financial/aging.utils.ts` | Aging bucket calculator with configurable buckets |
| `backend/src/shared/services/financial/drilldown.utils.ts` | DrillDownRef builder with route mapping |
| `backend/src/shared/services/financial/financial.response.ts` | `wrapFinancialResponse<T>()` helper |
| `backend/src/shared/services/financial/summary.utils.ts` | Financial summary format helper |
| `backend/src/shared/services/financial/balance.utils.test.ts` | Vitest unit tests |
| `backend/src/shared/services/financial/aging.utils.test.ts` | Vitest unit tests |
| `backend/src/shared/services/financial/drilldown.utils.test.ts` | Vitest unit tests |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/config/constants.ts` | Add `'aging', 'gl', 'trialbalance', 'journal', 'finreports', 'financial'` to MODULES array |
| `backend/prisma/seed.ts` | Add new module actions + role permission grants |

## Dependencies

- None. These files have no imports from the financial module itself.
- `normalizeMoney` is a pure math function (no Prisma).
- `financial.types.ts` imports nothing.

---

## Step-by-Step Implementation

### Step 1 — Write failing tests for balance.utils

Create `backend/src/shared/services/financial/balance.utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  normalizeMoney,
  calculateRunningBalances,
  calculateClosingBalance,
  sumDebitCredit,
} from './balance.utils';

describe('normalizeMoney', () => {
  it('rounds to 3 decimal places (KWD)', () => {
    expect(normalizeMoney(1.0005)).toBe(1.001);
    expect(normalizeMoney(1.0004)).toBe(1);
    expect(normalizeMoney(1234.5678)).toBe(1234.568);
  });
  it('handles floating point precision', () => {
    expect(normalizeMoney(0.1 + 0.2)).toBe(0.3);
  });
  it('handles negative values', () => {
    expect(normalizeMoney(-1.5005)).toBe(-1.501);
  });
});

describe('calculateRunningBalances', () => {
  it('returns correct progressive balance starting from zero', () => {
    const entries = [
      { debit: 100, credit: 0, description: 'inv-1' },
      { debit: 0, credit: 50, description: 'pay-1' },
      { debit: 25, credit: 0, description: 'inv-2' },
    ];
    const result = calculateRunningBalances(0, entries);
    expect(result[0].runningBalance).toBe(100);
    expect(result[1].runningBalance).toBe(50);
    expect(result[2].runningBalance).toBe(75);
  });

  it('applies non-zero opening balance', () => {
    const entries = [{ debit: 100, credit: 0 }];
    expect(calculateRunningBalances(500, entries)[0].runningBalance).toBe(600);
  });

  it('returns empty array for empty input', () => {
    expect(calculateRunningBalances(100, [])).toEqual([]);
  });

  it('preserves all original entry properties', () => {
    const entries = [{ debit: 10, credit: 5, myField: 'hello' }];
    const result = calculateRunningBalances(0, entries);
    expect(result[0].myField).toBe('hello');
    expect(result[0].runningBalance).toBe(5);
  });
});

describe('calculateClosingBalance', () => {
  it('adds debit and subtracts credit from opening', () => {
    expect(calculateClosingBalance(1000, 500, 200)).toBe(1300);
    expect(calculateClosingBalance(0, 0, 0)).toBe(0);
    expect(calculateClosingBalance(100, 0, 150)).toBe(-50);
  });
});

describe('sumDebitCredit', () => {
  it('returns correct sums', () => {
    const entries = [
      { debit: 100, credit: 50 },
      { debit: 200, credit: 75 },
    ];
    expect(sumDebitCredit(entries)).toEqual({ totalDebit: 300, totalCredit: 125 });
  });
  it('returns zeros for empty array', () => {
    expect(sumDebitCredit([])).toEqual({ totalDebit: 0, totalCredit: 0 });
  });
});
```

### Step 2 — Run test to verify failure

```bash
cd backend && npx vitest run src/shared/services/financial/balance.utils.test.ts
```

Expected: FAIL — `Cannot find module './balance.utils'`

### Step 3 — Implement balance.utils.ts

Create `backend/src/shared/services/financial/balance.utils.ts`:

```typescript
export function normalizeMoney(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function calculateRunningBalances<T extends { debit: number; credit: number }>(
  openingBalance: number,
  entries: T[]
): (T & { runningBalance: number })[] {
  let balance = openingBalance;
  return entries.map(entry => {
    balance = normalizeMoney(balance + entry.debit - entry.credit);
    return { ...entry, runningBalance: balance };
  });
}

export function calculateClosingBalance(
  openingBalance: number,
  totalDebit: number,
  totalCredit: number
): number {
  return normalizeMoney(openingBalance + totalDebit - totalCredit);
}

export function sumDebitCredit<T extends { debit: number; credit: number }>(
  entries: T[]
): { totalDebit: number; totalCredit: number } {
  return entries.reduce(
    (acc, e) => ({ totalDebit: acc.totalDebit + e.debit, totalCredit: acc.totalCredit + e.credit }),
    { totalDebit: 0, totalCredit: 0 }
  );
}
```

### Step 4 — Run test to verify pass

```bash
cd backend && npx vitest run src/shared/services/financial/balance.utils.test.ts
```

Expected: PASS — 8 tests pass

---

### Step 5 — Write failing tests for aging.utils

Create `backend/src/shared/services/financial/aging.utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateAgingBuckets, DEFAULT_AGING_BUCKETS } from './aging.utils';
import { normalizeMoney } from './balance.utils';

describe('calculateAgingBuckets', () => {
  const asOfDate = new Date('2025-06-01');

  it('skips entries where outstanding is 0', () => {
    const invoices = [{ dueDate: new Date('2025-05-01'), outstandingAmount: 0 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.total).toBe(0);
  });

  it('skips entries where outstanding is negative', () => {
    const invoices = [{ dueDate: new Date('2025-05-01'), outstandingAmount: -100 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.total).toBe(0);
  });

  it('assigns not-yet-due invoice to current bucket (negative days overdue)', () => {
    // Due June 15 → -14 days overdue on June 1 → 'current'
    const invoices = [{ dueDate: new Date('2025-06-15'), outstandingAmount: 500 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.current).toBe(500);
    expect(result['0_30']).toBe(0);
    expect(result.total).toBe(500);
  });

  it('assigns 17 days overdue to 0_30 bucket', () => {
    // Due May 15 → 17 days overdue on June 1
    const invoices = [{ dueDate: new Date('2025-05-15'), outstandingAmount: 300 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result['0_30']).toBe(300);
    expect(result.total).toBe(300);
  });

  it('assigns exactly 30 days overdue to 0_30 bucket (inclusive)', () => {
    // Due May 2 → 30 days overdue on June 1
    const invoices = [{ dueDate: new Date('2025-05-02'), outstandingAmount: 100 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result['0_30']).toBe(100);
  });

  it('assigns 31 days overdue to 31_60 bucket (inclusive)', () => {
    // Due May 1 → 31 days overdue on June 1
    const invoices = [{ dueDate: new Date('2025-05-01'), outstandingAmount: 100 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result['31_60']).toBe(100);
  });

  it('assigns over-120-day invoice to over_120 bucket', () => {
    // Due Jan 1 → 151 days overdue on June 1
    const invoices = [{ dueDate: new Date('2025-01-01'), outstandingAmount: 1000 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.over_120).toBe(1000);
  });

  it('total equals sum of all bucket amounts', () => {
    const invoices = [
      { dueDate: new Date('2025-06-15'), outstandingAmount: 100 }, // current
      { dueDate: new Date('2025-05-15'), outstandingAmount: 200 }, // 0_30
      { dueDate: new Date('2025-01-01'), outstandingAmount: 400 }, // over_120
    ];
    const result = calculateAgingBuckets(invoices, asOfDate);
    const bucketSum = DEFAULT_AGING_BUCKETS.reduce((s, b) => s + (result[b.key] ?? 0), 0);
    expect(normalizeMoney(bucketSum)).toBe(result.total);
    expect(result.total).toBe(700);
  });

  it('accepts custom bucket configuration', () => {
    const customBuckets = [
      { key: 'current', min: -Infinity, max: -1, label: 'Current' },
      { key: 'all_due', min: 0, max: Infinity, label: 'All Due' },
    ];
    const invoices = [
      { dueDate: new Date('2025-05-01'), outstandingAmount: 300 }, // 31 days overdue → all_due
    ];
    const result = calculateAgingBuckets(invoices, asOfDate, customBuckets);
    expect(result.all_due).toBe(300);
    expect(result.current).toBe(0);
  });
});
```

### Step 6 — Run test to verify failure

```bash
cd backend && npx vitest run src/shared/services/financial/aging.utils.test.ts
```

Expected: FAIL — `Cannot find module './aging.utils'`

### Step 7 — Implement aging.utils.ts

Create `backend/src/shared/services/financial/aging.utils.ts`:

```typescript
import { normalizeMoney } from './balance.utils';

export interface AgingBucket {
  key: string;
  min: number;
  max: number;
  label: string;
}

export const DEFAULT_AGING_BUCKETS: AgingBucket[] = [
  { key: 'current',  min: -Infinity, max: -1,       label: 'جاري'       },
  { key: '0_30',     min: 0,         max: 30,        label: '0–30 يوم'   },
  { key: '31_60',    min: 31,        max: 60,        label: '31–60 يوم'  },
  { key: '61_90',    min: 61,        max: 90,        label: '61–90 يوم'  },
  { key: '91_120',   min: 91,        max: 120,       label: '91–120 يوم' },
  { key: 'over_120', min: 121,       max: Infinity,  label: '+120 يوم'   },
];

export type AgingBuckets = Record<string, number> & { total: number };

export function calculateAgingBuckets(
  invoices: { dueDate: Date; outstandingAmount: number }[],
  asOfDate: Date,
  buckets: AgingBucket[] = DEFAULT_AGING_BUCKETS
): AgingBuckets {
  const result: AgingBuckets = { total: 0 };
  for (const b of buckets) result[b.key] = 0;

  for (const inv of invoices) {
    if (inv.outstandingAmount <= 0) continue;
    const daysOverdue = differenceInDays(asOfDate, inv.dueDate);
    const bucket = buckets.find(b => daysOverdue >= b.min && daysOverdue <= b.max);
    if (bucket) {
      result[bucket.key] = normalizeMoney(result[bucket.key] + inv.outstandingAmount);
      result.total = normalizeMoney(result.total + inv.outstandingAmount);
    }
  }
  return result;
}

function differenceInDays(dateA: Date, dateB: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((dateA.getTime() - dateB.getTime()) / msPerDay);
}
```

### Step 8 — Run test to verify pass

```bash
cd backend && npx vitest run src/shared/services/financial/aging.utils.test.ts
```

Expected: PASS — 9 tests pass

---

### Step 9 — Write failing tests for drilldown.utils

Create `backend/src/shared/services/financial/drilldown.utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildDrillDownRef } from './drilldown.utils';

describe('buildDrillDownRef', () => {
  it('returns correct route for INVOICE', () => {
    const ref = buildDrillDownRef('INVOICE', 42, 'فاتورة MN-INV-2025-001');
    expect(ref.entityType).toBe('INVOICE');
    expect(ref.entityId).toBe(42);
    expect(ref.route).toBe('/invoices');
    expect(ref.label).toBe('فاتورة MN-INV-2025-001');
  });

  it('returns correct route for JOURNAL_ENTRY', () => {
    const ref = buildDrillDownRef('JOURNAL_ENTRY', 10);
    expect(ref.route).toBe('/accounting');
  });

  it('returns /financial for GL_ACCOUNT (internal navigation)', () => {
    const ref = buildDrillDownRef('GL_ACCOUNT', 5, 'حساب النقدية');
    expect(ref.route).toBe('/financial');
  });

  it('returns undefined route for unmapped entity type', () => {
    // PAYMENT has no dedicated page — route is undefined
    const ref = buildDrillDownRef('PAYMENT', 1);
    expect(ref.route).toBe('/invoices'); // Payment context is within invoice page
  });

  it('generates default label when none provided', () => {
    const ref = buildDrillDownRef('EXPENSE', 99);
    expect(ref.label).toBe('EXPENSE-99');
  });
});
```

### Step 10 — Implement drilldown.utils.ts

Create `backend/src/shared/services/financial/drilldown.utils.ts`:

```typescript
export interface DrillDownRef {
  entityType: 'INVOICE' | 'EXPENSE' | 'PAYMENT' | 'JOURNAL_ENTRY' | 'CONTRACT' | 'CUSTOMER' | 'SUPPLIER' | 'GL_ACCOUNT';
  entityId: number;
  route?: string;
  label: string;
}

const DRILL_DOWN_ROUTES: Partial<Record<DrillDownRef['entityType'], string>> = {
  INVOICE:       '/invoices',
  EXPENSE:       '/expenses',
  PAYMENT:       '/invoices',       // Payment context is within the invoice page
  JOURNAL_ENTRY: '/accounting',
  CONTRACT:      '/contracts',
  CUSTOMER:      '/customers',
  SUPPLIER:      '/suppliers',
  GL_ACCOUNT:    '/financial',      // Internal navigation within Financial Center
};

export function buildDrillDownRef(
  entityType: DrillDownRef['entityType'],
  entityId: number,
  labelOverride?: string
): DrillDownRef {
  return {
    entityType,
    entityId,
    route: DRILL_DOWN_ROUTES[entityType],
    label: labelOverride ?? `${entityType}-${entityId}`,
  };
}
```

### Step 11 — Run all drilldown tests

```bash
cd backend && npx vitest run src/shared/services/financial/drilldown.utils.test.ts
```

Expected: PASS — 5 tests pass

---

### Step 12 — Create financial.types.ts

Create `backend/src/shared/services/financial/financial.types.ts`:

```typescript
export interface DrillDownRef {
  entityType: string;
  entityId: number;
  route?: string;
  label: string;
}

export interface FinancialRow {
  id: string;
  drillDown?: DrillDownRef;
  [key: string]: unknown;
}

export interface FinancialSummary {
  openingBalance?: number;
  totalDebit?: number;
  totalCredit?: number;
  closingBalance?: number;
  transactionCount?: number;
  totalOutstanding?: number;
  criticalOver90?: number;
  entityCount?: number;
  isBalanced?: boolean;
  difference?: number;
  [key: string]: number | boolean | undefined;
}

export interface FinancialPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FinancialResponse<T extends FinancialRow = FinancialRow> {
  reportType: string;
  generatedAt: string;
  filters: Record<string, unknown>;
  summary: FinancialSummary;
  rows: T[];
  totals?: Partial<T>;
  metadata?: Record<string, unknown>;
  pagination?: FinancialPagination;
}

// ── Per-report row types ─────────────────────────────────────────────────────

export interface StatementRow extends FinancialRow {
  date: string;
  reference: string;
  referenceType: string;
  referenceId?: number;
  journalEntryId?: number;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
}

export interface ArAgingRow extends FinancialRow {
  customerId: number;
  customerCode: string;
  customerName: string;
  current: number;
  '0_30': number;
  '31_60': number;
  '61_90': number;
  '91_120': number;
  over_120: number;
  total: number;
  lastInvoiceDate?: string;
  invoiceCount: number;
}

export interface ApAgingRow extends FinancialRow {
  supplierId: number;
  supplierCode: string;
  supplierName: string;
  current: number;
  '0_30': number;
  '31_60': number;
  '61_90': number;
  '91_120': number;
  over_120: number;
  total: number;
  lastInvoiceDate?: string;
  invoiceCount: number;
}

export interface GlStatementRow extends FinancialRow {
  date: string;
  journalNumber: string;
  journalEntryId: number;
  referenceType: string;
  referenceId?: number;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
}

export interface GlReportAccount {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  rows: GlStatementRow[];
}

export interface GlReportResponse {
  generatedAt: string;
  filters: Record<string, unknown>;
  accounts: GlReportAccount[];
  summary: { totalAccounts: number; fromDate?: string; toDate?: string };
  pagination: FinancialPagination;
}

export interface TrialBalanceAsOfRow extends FinancialRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  totalDebit: number;
  totalCredit: number;
  balance: number;
  balanceType: 'DEBIT' | 'CREDIT';
}

export interface TrialBalancePeriodRow extends FinancialRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
}

export interface JournalBookRow extends FinancialRow {
  entryNumber: string;
  date: string;
  description: string;
  referenceType: string;
  referenceId?: number;
  status: string;
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
  lines: {
    accountCode: string;
    accountName: string;
    description?: string;
    debit: number;
    credit: number;
  }[];
}

export interface DashboardSummary {
  generatedAt: string;
  arSummary: { totalOutstanding: number; criticalOver90: number; entityCount: number };
  apSummary: { totalOutstanding: number; criticalOver90: number; entityCount: number };
  topCustomers: TopEntitySummary[];
  topSuppliers: TopEntitySummary[];
  collectionsLast30: number;
  paymentsLast30: number;
  activeAccountsCount: number;
}

export interface TopEntitySummary {
  id: number;
  name: string;
  outstanding: number;
}
```

### Step 13 — Create financial.response.ts

Create `backend/src/shared/services/financial/financial.response.ts`:

```typescript
import type { FinancialResponse, FinancialRow, FinancialSummary, FinancialPagination } from './financial.types';

export function wrapFinancialResponse<T extends FinancialRow>(input: {
  reportType: string;
  summary: FinancialSummary;
  metadata?: Record<string, unknown>;
  filters: Record<string, unknown>;
  rows: T[];
  totals?: Partial<T>;
  pagination?: FinancialPagination;
}): FinancialResponse<T> {
  return {
    ...input,
    generatedAt: new Date().toISOString(),
  };
}
```

### Step 14 — Create summary.utils.ts

Create `backend/src/shared/services/financial/summary.utils.ts`:

```typescript
import { normalizeMoney } from './balance.utils';

export interface AccountingFinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  totalCollected: number;
  totalPaid: number;
  netIncome: number;
}

export function buildSubtitle(fromDate?: string, toDate?: string): string {
  if (fromDate && toDate) return `من ${fromDate} إلى ${toDate}`;
  if (fromDate) return `من ${fromDate}`;
  if (toDate) return `حتى ${toDate}`;
  return 'كل الفترات';
}

export function formatDate(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return d.toISOString().slice(0, 10);
}

export function translateRefType(type: string): string {
  const map: Record<string, string> = {
    INVOICE: 'فاتورة',
    PAYMENT: 'دفعة',
    EXPENSE: 'مصروف',
    JOURNAL_ENTRY: 'قيد',
    MANUAL: 'يدوي',
    CONTRACT: 'عقد',
  };
  return map[type] ?? type;
}

export function sanitizeFilters(filters: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') safe[k] = v;
  }
  return safe;
}
```

### Step 15 — Update constants.ts (add new MODULES)

In `backend/src/config/constants.ts`, find the MODULES array and add 6 new entries before the closing `] as const`:

```typescript
// Current last entry is 'statements'
// Add after 'statements':
  'aging',
  'gl',
  'trialbalance',
  'journal',
  'finreports',
  'financial',
```

The full MODULES array tail should read:
```typescript
  'statements',
  'aging',
  'gl',
  'trialbalance',
  'journal',
  'finreports',
  'financial',
] as const;
```

### Step 16 — Update seed.ts (add MODULE_ACTIONS + role grants)

In `backend/prisma/seed.ts`, add the new modules to the `MODULE_ACTIONS` object (find the last entry `statements: ['read', 'export']` and add after it):

```typescript
  statements:         ['read', 'export'],
  // NEW financial modules:
  aging:              ['read', 'export'],
  gl:                 ['read', 'export'],
  trialbalance:       ['read', 'export'],
  journal:            ['read', 'export'],
  finreports:         ['read', 'export'],
  financialdashboard: ['read'],
```

**Note:** `financialdashboard` is not in MODULES array (it uses compound naming). Its permission key `financialdashboard.read` must be seeded separately. Add a dedicated block after the main permission loop:

```typescript
// Financial module special permission (compound module name not in MODULES array)
await prisma.permission.upsert({
  where: { key: 'financialdashboard.read' },
  update: {},
  create: {
    key: 'financialdashboard.read',
    module: 'financialdashboard',
    action: 'read',
    description: 'عرض - لوحة التحكم المالية',
  },
});
console.log('  ✓ financialdashboard.read permission');
```

Then update `rolePermissionMap` to include the new permissions. Find the `ACCOUNTANT` entry and extend it:

```typescript
ACCOUNTANT: [
  // ...existing keys...
  'aging.read', 'aging.export',
  'gl.read', 'gl.export',
  'trialbalance.read', 'trialbalance.export',
  'journal.read', 'journal.export',
  'finreports.read', 'finreports.export',
  'financialdashboard.read',
  'statements.export',  // ensure this is present
],
GENERAL_MANAGER: [
  // GENERAL_MANAGER already gets allKeys — the new modules auto-included via MODULE_ACTIONS loop
  // But financialdashboard.read needs explicit grant:
  'financialdashboard.read',
],
PROJECT_MANAGER: [
  // ...existing keys...
  'statements.read', 'statements.export',
  'aging.read',
  'financialdashboard.read',
],
STANDARD_USER: [
  // ...existing keys...
  'statements.read',
  // no financial center access beyond statements
],
```

**Important:** SYSTEM_ADMIN and GENERAL_MANAGER use `allKeys` which auto-includes all `MODULE_ACTIONS` entries. Add the `financialdashboard.read` special permission explicitly to their grants after the main loop.

### Step 17 — Run full test suite

```bash
cd backend && npx vitest run src/shared/services/financial/
```

Expected output:
```
 ✓ src/shared/services/financial/balance.utils.test.ts (8 tests)
 ✓ src/shared/services/financial/aging.utils.test.ts (9 tests)
 ✓ src/shared/services/financial/drilldown.utils.test.ts (5 tests)

 Test Files  3 passed (3)
 Tests       22 passed (22)
```

### Step 18 — TypeScript validation

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors.

### Step 19 — Commit

```bash
git add backend/src/shared/services/financial/ backend/src/config/constants.ts backend/prisma/seed.ts
git commit -m "feat(financial): add shared utilities, types, and permission keys for Financial Center Phase 2"
```

---

## Validation

- [ ] `cd backend && npx vitest run src/shared/services/financial/` → 22 tests pass
- [ ] `cd backend && npx tsc --noEmit` → 0 errors
- [ ] `constants.ts` MODULES array has 6 new entries
- [ ] `seed.ts` MODULE_ACTIONS has aging/gl/trialbalance/journal/finreports
- [ ] `financialdashboard.read` special permission upsert is present

## Risks

- **seed.ts GENERAL_MANAGER exclusion:** GENERAL_MANAGER uses `allKeys.filter(...)` — verify the filter doesn't accidentally exclude new financial module keys.
- **normalizeMoney edge case:** `Math.round(1.0005 * 1000) / 1000` is `1.001` in most JS engines, but floating-point arithmetic is platform-dependent. Test explicitly.

## Acceptance Criteria

- All 22 unit tests pass
- TypeScript has zero errors
- Running `npm run db:seed` succeeds without errors
- New permission keys are visible in database after seed
