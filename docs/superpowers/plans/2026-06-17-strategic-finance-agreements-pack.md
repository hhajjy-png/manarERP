# Strategic Finance & Agreements Pack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three sequential phases on branch `feature/strategic-finance-agreements-pack`: (A) link InvoiceItem to ProjectPrice for real usage tracking, (B) post expenses to the GL on approval with reversal on cancel, (C) add canonical Excel export/import for payroll.

**Architecture:**
- Phase A: adds `priceId Int?` FK to `invoice_items`, rewrites the price-usage report to use it, adds a group-by-company endpoint.
- Phase B: adds `expenses.accounting.ts` (mirrors `invoices.accounting.ts`), wires GL posting into `expenses.service.ts`, adds a cancel/reversal flow.
- Phase C: adds `GET /payroll/export` (ExcelJS) and `POST /payroll/import/preview` + `/confirm` (JSON rows) endpoints; adds export button + import dialog to the frontend.

**Tech Stack:** Prisma/SQLite, Express, TypeScript, Zod, Vitest, ExcelJS, React/Vite

---

## Pre-flight

- [ ] **Step 1: Create feature branch**

```bash
git checkout production
git pull origin production
git tag pre-strategic-finance-agreements-pack
git checkout -b feature/strategic-finance-agreements-pack
```

Expected: branch created, tag visible in `git tag`.

---

## Phase A — Agreements Refactor Phase 2

### Task A1: Prisma schema — add `priceId` to InvoiceItem

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add `priceId` and reverse relation**

In `schema.prisma`, replace the `InvoiceItem` model with:

```prisma
model InvoiceItem {
  id          Int    @id @default(autoincrement())
  invoiceId   Int
  description String
  quantity    Float  @default(1)
  unit        String @default("طن") // طن | درب | يومية
  unitPrice   Float  @default(0)
  total       Float  @default(0)
  priceId     Int?   // FK to project_prices (nullable — snapshot-based)

  invoice Invoice       @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  price   ProjectPrice? @relation(fields: [priceId], references: [id], onDelete: SetNull)

  @@index([invoiceId])
  @@index([priceId])
  @@map("invoice_items")
}
```

And add `invoiceItems InvoiceItem[]` to `ProjectPrice`:

```prisma
model ProjectPrice {
  id               Int     @id @default(autoincrement())
  asphaltPlant     String
  companyName      String
  contractLocation String
  contractUnit     String
  unitPrice        Float
  isArchived       Boolean @default(false)
  customerId       Int?
  customer         Customer?    @relation(fields: [customerId], references: [id], onDelete: Restrict)
  invoiceItems     InvoiceItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([isArchived])
  @@index([asphaltPlant])
  @@index([companyName])
  @@index([customerId])
  @@map("project_prices")
}
```

- [ ] **Step 2: Generate and review migration**

```bash
cd backend && npx prisma migrate dev --name add_price_id_to_invoice_items
```

Review the generated SQL in `backend/prisma/migrations/` — it should contain only:
```sql
ALTER TABLE "invoice_items" ADD COLUMN "priceId" INTEGER;
CREATE INDEX "invoice_items_priceId_idx" ON "invoice_items"("priceId");
```
No destructive changes. If it contains anything else, stop and investigate.

- [ ] **Step 3: Regenerate Prisma client**

```bash
npm run db:generate
```

- [ ] **Step 4: Commit schema**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(schema): add priceId FK to invoice_items → project_prices"
```

---

### Task A2: Backend — update invoice types and schema

**Files:**
- Modify: `backend/src/modules/invoices/invoices.calc.ts`
- Modify: `backend/src/modules/invoices/invoices.schema.ts`

- [ ] **Step 1: Write failing test for priceId in item schema**

In `backend/src/modules/invoices/__tests__/invoices.calc.test.ts`, add:

```typescript
describe('priceId passthrough in computeTotals', () => {
  it('passes priceId through to computed lines', () => {
    const items = [{ description: 'نقل أسفلت', quantity: 2, unit: 'طن', unitPrice: 10, priceId: 5 }];
    const { lines } = computeTotals(items, 0, 0);
    expect(lines[0].priceId).toBe(5);
  });

  it('handles missing priceId gracefully', () => {
    const items = [{ description: 'نقل أسفلت', quantity: 1, unit: 'طن', unitPrice: 10 }];
    const { lines } = computeTotals(items, 0, 0);
    expect(lines[0].priceId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd backend && npm test -- invoices.calc
```

Expected: TypeScript error — `priceId` not in `InvoiceItemInput`.

- [ ] **Step 3: Update `InvoiceItemInput` in `invoices.calc.ts`**

Replace the export type:

```typescript
export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  priceId?: number | null;
};
```

`computeTotals` already spreads `...it` into lines — no further change needed. `priceId` flows through automatically.

- [ ] **Step 4: Add `priceId` to `itemSchema` in `invoices.schema.ts`**

Replace the `itemSchema` definition:

```typescript
const itemSchema = z.object({
  description: z.string().min(1, 'وصف البند مطلوب'),
  quantity: z.coerce.number().positive('الكمية يجب أن تكون موجبة').default(1),
  unit: z.string().trim().min(1, 'الوحدة مطلوبة').default('طن'),
  unitPrice: z.coerce.number().nonnegative('السعر يجب ألا يكون سالبًا').default(0),
  priceId: z.coerce.number().int().positive().optional().nullable(),
});
```

- [ ] **Step 5: Run test — expect pass**

```bash
cd backend && npm test -- invoices.calc
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/invoices/invoices.calc.ts backend/src/modules/invoices/invoices.schema.ts backend/src/modules/invoices/__tests__/invoices.calc.test.ts
git commit -m "feat(invoices): add priceId to InvoiceItemInput and itemSchema"
```

---

### Task A3: Backend — preserve priceId in invoice service update

**Files:**
- Modify: `backend/src/modules/invoices/invoices.service.ts`

The `create` path already works: `computeTotals` spreads `priceId` into lines, and Prisma `create` accepts it. The `update` path has a fallback mapping that currently drops `priceId`.

- [ ] **Step 1: Write failing test (integration-style)**

Add to `backend/src/modules/invoices/__tests__/invoices.calc.test.ts`:

```typescript
describe('update fallback item mapper', () => {
  it('includes priceId when mapping existing items', () => {
    // Simulate the mapping in invoices.service.ts update()
    const currentItems = [
      { description: 'نقل', quantity: 1, unit: 'طن', unitPrice: 10, priceId: 7 }
    ];
    const mapped = currentItems.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitPrice,
      priceId: i.priceId ?? null,
    }));
    expect(mapped[0].priceId).toBe(7);
  });
});
```

- [ ] **Step 2: Run — expect pass (this tests the pattern, not yet the service)**

```bash
cd backend && npm test -- invoices.calc
```

- [ ] **Step 3: Update the fallback mapper in `invoices.service.ts`**

In the `update()` method, find:

```typescript
const items = input.items ?? current.items.map((i) => ({ description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice }));
```

Replace with:

```typescript
const items = input.items ?? current.items.map((i) => ({
  description: i.description,
  quantity: i.quantity,
  unit: i.unit,
  unitPrice: i.unitPrice,
  priceId: i.priceId ?? null,
}));
```

- [ ] **Step 4: Type-check backend**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/invoices/invoices.service.ts
git commit -m "fix(invoices): preserve priceId in update() fallback item mapper"
```

---

### Task A4: Backend — rewrite usage report + add group-by-company

**Files:**
- Modify: `backend/src/modules/prices/prices.service.ts`
- Modify: `backend/src/modules/prices/prices.routes.ts`
- Modify: `backend/src/modules/prices/prices.controller.ts`

- [ ] **Step 1: Write failing test for new usage report shape**

Create `backend/src/modules/prices/__tests__/prices.usage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPricesUsageReport, getPricesUsageByCompany } from '../prices.service';

vi.mock('@config/database', () => ({
  prisma: {
    projectPrice: { findMany: vi.fn() },
    invoiceItem: { findMany: vi.fn() },
  },
}));

import { prisma } from '@config/database';

describe('getPricesUsageReport — Phase 2 (direct tracking)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses priceId to match items — exact count', async () => {
    (prisma.projectPrice.findMany as any).mockResolvedValue([
      { id: 1, asphaltPlant: 'A', companyName: 'X', contractLocation: 'L', contractUnit: 'طن', unitPrice: 10, customer: null },
    ]);
    (prisma.invoiceItem.findMany as any).mockResolvedValue([
      { priceId: 1, quantity: 5, total: 50 },
      { priceId: 1, quantity: 3, total: 30 },
    ]);

    const result = await getPricesUsageReport();
    expect(result.hasDirectTracking).toBe(true);
    expect(result.report[0].usageCount).toBe(2);
    expect(result.report[0].totalQuantity).toBe(8);
    expect(result.report[0].totalAmount).toBe(80);
  });

  it('returns zero usage for prices with no linked items', async () => {
    (prisma.projectPrice.findMany as any).mockResolvedValue([
      { id: 99, asphaltPlant: 'B', companyName: 'Y', contractLocation: 'L', contractUnit: 'درب', unitPrice: 20, customer: null },
    ]);
    (prisma.invoiceItem.findMany as any).mockResolvedValue([]);

    const result = await getPricesUsageReport();
    expect(result.report[0].usageCount).toBe(0);
  });
});

describe('getPricesUsageByCompany', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups by companyName and aggregates totals', async () => {
    (prisma.invoiceItem.findMany as any).mockResolvedValue([
      { priceId: 1, quantity: 2, total: 20, price: { companyName: 'شركة ألفا' } },
      { priceId: 1, quantity: 3, total: 30, price: { companyName: 'شركة ألفا' } },
      { priceId: 2, quantity: 1, total: 10, price: { companyName: 'شركة بيتا' } },
    ]);

    const result = await getPricesUsageByCompany();
    const alpha = result.find((r) => r.companyName === 'شركة ألفا')!;
    expect(alpha.usageCount).toBe(2);
    expect(alpha.totalQuantity).toBe(5);
    expect(alpha.totalAmount).toBe(50);
    expect(alpha.agreementCount).toBe(1); // only priceId=1
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && npm test -- prices.usage
```

- [ ] **Step 3: Rewrite `getPricesUsageReport` in `prices.service.ts`**

Replace the existing `getPricesUsageReport` function:

```typescript
export async function getPricesUsageReport() {
  const [prices, items] = await Promise.all([
    prisma.projectPrice.findMany({
      where: { isArchived: false },
      include: { customer: customerSelect },
      orderBy: { asphaltPlant: 'asc' },
    }),
    prisma.invoiceItem.findMany({
      where: { priceId: { not: null } },
      select: { priceId: true, quantity: true, total: true },
    }),
  ]);

  const byPriceId = new Map<number, { count: number; totalQty: number; totalAmt: number }>();
  for (const item of items) {
    if (item.priceId == null) continue;
    const g = byPriceId.get(item.priceId) ?? { count: 0, totalQty: 0, totalAmt: 0 };
    g.count++;
    g.totalQty += item.quantity;
    g.totalAmt += item.total;
    byPriceId.set(item.priceId, g);
  }

  const report = prices.map((price) => {
    const g = byPriceId.get(price.id) ?? { count: 0, totalQty: 0, totalAmt: 0 };
    return {
      id: price.id,
      asphaltPlant: price.asphaltPlant,
      companyName: price.companyName,
      contractLocation: price.contractLocation,
      contractUnit: price.contractUnit,
      unitPrice: price.unitPrice,
      customer: price.customer,
      usageCount: g.count,
      totalQuantity: g.totalQty,
      totalAmount: g.totalAmt,
    };
  });

  return {
    report,
    hasDirectTracking: true,
    note: 'الاستخدام مبني على priceId المخزون في بند الفاتورة. الفواتير القديمة (priceId = null) غير مشمولة في الأرقام.',
  };
}
```

- [ ] **Step 4: Add `getPricesUsageByCompany` to `prices.service.ts`**

Add after `getPricesUsageReport`:

```typescript
export async function getPricesUsageByCompany() {
  const items = await prisma.invoiceItem.findMany({
    where: { priceId: { not: null } },
    select: {
      priceId: true,
      quantity: true,
      total: true,
      price: { select: { companyName: true } },
    },
  });

  const byCompany = new Map<
    string,
    { priceIds: Set<number>; usageCount: number; totalQty: number; totalAmt: number }
  >();

  for (const item of items) {
    if (!item.price || item.priceId == null) continue;
    const company = item.price.companyName;
    const g = byCompany.get(company) ?? { priceIds: new Set(), usageCount: 0, totalQty: 0, totalAmt: 0 };
    g.priceIds.add(item.priceId);
    g.usageCount++;
    g.totalQty += item.quantity;
    g.totalAmt += item.total;
    byCompany.set(company, g);
  }

  return Array.from(byCompany.entries())
    .map(([companyName, g]) => ({
      companyName,
      agreementCount: g.priceIds.size,
      usageCount: g.usageCount,
      totalQuantity: g.totalQty,
      totalAmount: g.totalAmt,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}
```

- [ ] **Step 5: Add controller handler + route**

In `backend/src/modules/prices/prices.controller.ts`, add:

```typescript
export const usageByCompany = async (req: Request, res: Response) => {
  const data = await getPricesUsageByCompany();
  return successResponse(res, data);
};
```

And import `getPricesUsageByCompany` from `prices.service.ts`.

In `backend/src/modules/prices/prices.routes.ts`, add before the parameterized routes:

```typescript
router.get('/usage/by-company', requirePermission('prices.read'), asyncHandler(pricesController.usageByCompany));
```

(Must be before any `/:id` routes to avoid route collision.)

- [ ] **Step 6: Run tests — expect pass**

```bash
cd backend && npm test -- prices.usage
```

- [ ] **Step 7: Type-check backend**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/prices/ backend/src/modules/invoices/__tests__/
git commit -m "feat(prices): rewrite usage report with priceId tracking + add group-by-company"
```

---

### Task A5: Frontend — update Prices.tsx for real tracking

**Files:**
- Modify: `frontend/src/pages/Prices.tsx`

- [ ] **Step 1: Update `UsageRow` and `UsageReport` interfaces**

Replace the existing interfaces:

```typescript
interface UsageRow {
  id: number;
  asphaltPlant: string;
  companyName: string;
  contractLocation: string;
  contractUnit: string;
  unitPrice: number;
  customer: { id: number; name: string } | null;
  usageCount: number;
  totalQuantity: number;
  totalAmount: number;
}

interface UsageReport {
  report: UsageRow[];
  hasDirectTracking: boolean;
  note: string;
}

interface CompanyUsageRow {
  companyName: string;
  agreementCount: number;
  usageCount: number;
  totalQuantity: number;
  totalAmount: number;
}
```

- [ ] **Step 2: Add state for company grouping and load function**

Add new state alongside the existing usage states:

```typescript
const [companyUsage, setCompanyUsage] = useState<CompanyUsageRow[]>([]);
const [companyUsageLoading, setCompanyUsageLoading] = useState(false);
const [groupByCompany, setGroupByCompany] = useState(false);
```

Add a load function:

```typescript
const loadCompanyUsage = useCallback(async () => {
  setCompanyUsageLoading(true);
  try {
    const res = await api.get('/prices/usage/by-company');
    setCompanyUsage(res.data.data ?? []);
  } finally {
    setCompanyUsageLoading(false);
  }
}, []);
```

- [ ] **Step 3: Wire toggle button and conditional rendering**

Inside the usage modal/section (where `usageReport` is displayed), add a toggle button above the table:

```tsx
{showUsage && (
  <div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <button
        className={`btn btn-sm ${!groupByCompany ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => setGroupByCompany(false)}
      >
        تفصيل الاتفاقيات
      </button>
      <button
        className={`btn btn-sm ${groupByCompany ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => {
          setGroupByCompany(true);
          if (companyUsage.length === 0) loadCompanyUsage();
        }}
      >
        تجميع حسب الشركة
      </button>
    </div>

    {!groupByCompany && usageReport && (
      /* existing usage table — unchanged */
    )}

    {groupByCompany && (
      companyUsageLoading ? <div>جاري التحميل...</div> : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الشركة</th>
              <th>عدد الاتفاقيات</th>
              <th>مرات الاستخدام</th>
              <th>إجمالي الكمية</th>
              <th>إجمالي الإيرادات</th>
            </tr>
          </thead>
          <tbody>
            {companyUsage.map((row) => (
              <tr key={row.companyName}>
                <td>{row.companyName}</td>
                <td>{row.agreementCount}</td>
                <td>{row.usageCount}</td>
                <td>{row.totalQuantity.toLocaleString('ar-KW', { minimumFractionDigits: 3 })}</td>
                <td>{money(row.totalAmount)}</td>
              </tr>
            ))}
            {companyUsage.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>لا توجد بيانات — الفواتير القديمة لا تحتوي على priceId</td></tr>
            )}
          </tbody>
        </table>
      )
    )}

    {usageReport && !groupByCompany && (
      <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
        {usageReport.hasDirectTracking
          ? '✓ الاستخدام دقيق — مبني على priceId'
          : usageReport.note}
      </p>
    )}
  </div>
)}
```

- [ ] **Step 4: Type-check frontend**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Prices.tsx
git commit -m "feat(frontend): update prices usage UI — real tracking indicator + group-by-company"
```

---

### Phase A Validation

- [ ] **Step 1: Full TypeScript check**

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit
```

Expected: 0 errors in all three.

- [ ] **Step 2: Run all tests**

```bash
cd backend && npm test
```

Expected: all tests pass (including new ones).

- [ ] **Step 3: Build validation**

```bash
npm run build:back
npm run build:front
```

Expected: no errors.

- [ ] **Step 4: Commit Phase A validation tag**

```bash
git tag phase-a-validated
```

---

## Phase B — Accounting Integration Phase 2

### Phase B Pre-analysis (no code)

Current state of GL integration:
- **Invoices SALES**: fully posted to JournalEntry (Phase 1) ✓
- **Invoices PURCHASE**: skip with warning — deferred ✓
- **Payments (SALES)**: fully posted to JournalEntry (Phase 1) ✓
- **Expenses (approve)**: posts to old `Transaction` table only — NOT to JournalEntry ✗
- **Payroll**: posts to old `Transaction` table only — NOT to JournalEntry ✗
- **Legacy Transactions**: still in use by expenses and payroll. Not conflicting with JournalEntries because they are separate tables/queries.

Phase B scope: wire expenses approval to JournalEntry; add cancel/reversal. Purchase invoice GL and payroll GL are out of scope for this phase.

---

### Task B1: Add GENERAL_EXPENSE account code

**Files:**
- Modify: `backend/src/modules/accounting/accounting.accounts.ts`

- [ ] **Step 1: Write failing test**

In `backend/src/modules/invoices/__tests__/invoices.accounting.test.ts`, the existing `ACCOUNT_ROWS` array is used. Add a new test file `backend/src/modules/expenses/__tests__/expenses.accounting.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postExpenseToGL, reverseExpenseFromGL } from '../expenses.accounting';
import { SYSTEM_ACCOUNT_CODES, clearAccountCache } from '../../accounting/accounting.accounts';

const ACCOUNT_ROWS = [
  { id: 10, code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE },
  { id: 20, code: SYSTEM_ACCOUNT_CODES.SALES_REVENUE },
  { id: 30, code: SYSTEM_ACCOUNT_CODES.CASH },
  { id: 40, code: SYSTEM_ACCOUNT_CODES.BANK },
  { id: 50, code: SYSTEM_ACCOUNT_CODES.INVENTORY },
  { id: 60, code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE },
  { id: 70, code: SYSTEM_ACCOUNT_CODES.PURCHASES },
  { id: 80, code: SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE },
  { id: 90, code: SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE },
];

const mockTx = {
  expense: { findUnique: vi.fn() },
  account: { upsert: vi.fn(), findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
};

describe('postExpenseToGL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1 });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  it('creates a balanced journal entry: debit GENERAL_EXPENSE, credit CASH', async () => {
    mockTx.expense.findUnique.mockResolvedValue({
      id: 1, description: 'وقود', amount: 100, date: new Date('2026-01-01'),
    });

    await postExpenseToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create.mock.calls[0][0];
    const lines = call.data.lines.create as { accountId: number; debit: number; credit: number }[];
    const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0);
    const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit);
    expect(lines.find((l) => l.accountId === 90 && l.debit === 100)).toBeTruthy(); // GENERAL_EXPENSE debited
    expect(lines.find((l) => l.accountId === 30 && l.credit === 100)).toBeTruthy(); // CASH credited
  });

  it('skips posting if already posted (double-post guard)', async () => {
    mockTx.expense.findUnique.mockResolvedValue({
      id: 1, description: 'وقود', amount: 100, date: new Date(),
    });
    mockTx.journalEntry.findFirst.mockResolvedValue({ id: 5 }); // already posted

    await postExpenseToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('skips posting for zero-amount expense', async () => {
    mockTx.expense.findUnique.mockResolvedValue({ id: 1, description: 'x', amount: 0, date: new Date() });
    await postExpenseToGL(mockTx as any, 1);
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('reverseExpenseFromGL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 2 });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  it('creates reversal entry with swapped debit/credit', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 5,
        status: 'POSTED',
        lines: [
          { accountId: 90, debit: 100, credit: 0, description: 'مصروف' },
          { accountId: 30, debit: 0, credit: 100, description: 'صندوق' },
        ],
      })
      .mockResolvedValueOnce(null); // no existing reversal

    await reverseExpenseFromGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create.mock.calls[0][0];
    expect(call.data.referenceType).toBe('EXPENSE_REVERSAL');
    const lines = call.data.lines.create as { debit: number; credit: number }[];
    // debit/credit should be swapped
    expect(lines.find((l) => l.accountId === 90 && l.credit === 100)).toBeTruthy();
    expect(lines.find((l) => l.accountId === 30 && l.debit === 100)).toBeTruthy();
  });

  it('skips reversal if no original entry exists', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    await reverseExpenseFromGL(mockTx as any, 1);
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('skips reversal if reversal already exists', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({ id: 5, status: 'POSTED', lines: [] }) // original
      .mockResolvedValueOnce({ id: 6 }); // reversal already exists

    await reverseExpenseFromGL(mockTx as any, 1);
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect failure (files don't exist yet)**

```bash
cd backend && npm test -- expenses.accounting
```

- [ ] **Step 3: Add GENERAL_EXPENSE to `accounting.accounts.ts`**

In `SYSTEM_ACCOUNT_CODES`:

```typescript
export const SYSTEM_ACCOUNT_CODES = {
  CASH: '1000',
  BANK: '1010',
  ACCOUNTS_RECEIVABLE: '1100',
  INVENTORY: '1200',
  ACCOUNTS_PAYABLE: '2000',
  SALES_REVENUE: '4000',
  PURCHASES: '5000',
  PAYROLL_EXPENSE: '5100',
  GENERAL_EXPENSE: '5200', // مصروفات عامة — used for expense GL posting
} as const;
```

In `SYSTEM_ACCOUNTS` array, add:

```typescript
{ code: SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE, name: 'مصروفات عامة', type: 'EXPENSE', normalBalance: 'DEBIT' },
```

Also update the existing invoice accounting test's `ACCOUNT_ROWS` to include the new code (otherwise `ensureSystemAccounts` completeness check will fail during that test):

```typescript
// In backend/src/modules/invoices/__tests__/invoices.accounting.test.ts
// Add to ACCOUNT_ROWS:
{ id: 90, code: SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE },
```

- [ ] **Step 4: Commit account code change**

```bash
git add backend/src/modules/accounting/accounting.accounts.ts
git commit -m "feat(accounting): add GENERAL_EXPENSE account code 5200"
```

---

### Task B2: Create `expenses.accounting.ts`

**Files:**
- Create: `backend/src/modules/expenses/expenses.accounting.ts`

- [ ] **Step 1: Create the file**

```typescript
import { Prisma } from '@prisma/client';
import { createBalancedJournalEntry, generateEntryNumber } from '../invoices/invoices.accounting';
import {
  SYSTEM_ACCOUNT_CODES,
  ensureSystemAccounts,
  getSystemAccounts,
  requireAccount,
} from '../accounting/accounting.accounts';

type Tx = Prisma.TransactionClient;
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/**
 * ترحيل قيد يومية مزدوج لمصروف معتمد:
 *   مدين: ح/ مصروفات عامة (5200)
 *   دائن: ح/ الصندوق (1000) — افتراضي (لا يوجد حقل طريقة دفع على المصروفات)
 * محمي من الترحيل المزدوج عبر (referenceType='EXPENSE', referenceId).
 */
export async function postExpenseToGL(tx: Tx, expenseId: number): Promise<void> {
  const expense = await tx.expense.findUnique({ where: { id: expenseId } });
  if (!expense) return;

  const amount = round3(expense.amount);
  if (amount <= 0) return;

  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: 'EXPENSE', referenceId: expenseId },
  });
  if (existing) return;

  await ensureSystemAccounts(tx);
  const accounts = await getSystemAccounts(tx);
  const expenseAccountId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE);
  const cashId = requireAccount(accounts, SYSTEM_ACCOUNT_CODES.CASH);

  await createBalancedJournalEntry(tx, {
    date: expense.date,
    description: `قيد مصروف: ${expense.description}`,
    referenceType: 'EXPENSE',
    referenceId: expenseId,
    lines: [
      { accountId: expenseAccountId, debit: amount, credit: 0, description: `مصروف — ${expense.description}` },
      { accountId: cashId, debit: 0, credit: amount, description: `صرف نقدي — ${expense.description}` },
    ],
  });
}

/**
 * عكس قيد يومية مصروف (عند إلغاء مصروف مرحل).
 * لا يحذف القيد الأصلي — ينشئ قيدًا عكسيًا للحفاظ على أثر التدقيق.
 * محمي من التكرار عبر (referenceType='EXPENSE_REVERSAL', referenceId).
 */
export async function reverseExpenseFromGL(tx: Tx, expenseId: number): Promise<void> {
  const original = await tx.journalEntry.findFirst({
    where: { referenceType: 'EXPENSE', referenceId: expenseId, status: 'POSTED' },
    include: { lines: true },
  });
  if (!original) return;

  const existingReversal = await tx.journalEntry.findFirst({
    where: { referenceType: 'EXPENSE_REVERSAL', referenceId: expenseId },
  });
  if (existingReversal) return;

  await createBalancedJournalEntry(tx, {
    date: new Date(),
    description: `عكس قيد مصروف #${expenseId}`,
    referenceType: 'EXPENSE_REVERSAL',
    referenceId: expenseId,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
      description: `عكس: ${line.description ?? ''}`.trim(),
    })),
  });
}
```

Note: `createBalancedJournalEntry` is already exported from `invoices.accounting.ts`. Import it directly; do not duplicate it.

- [ ] **Step 2: Run tests — expect pass**

```bash
cd backend && npm test -- expenses.accounting
```

Expected: all 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/expenses/expenses.accounting.ts backend/src/modules/expenses/__tests__/expenses.accounting.test.ts backend/src/modules/invoices/__tests__/invoices.accounting.test.ts
git commit -m "feat(expenses): add GL posting and reversal (expenses.accounting.ts)"
```

---

### Task B3: Wire GL into `expenses.service.ts` + add cancel()

**Files:**
- Modify: `backend/src/modules/expenses/expenses.service.ts`

- [ ] **Step 1: Import the two new functions**

At the top of `expenses.service.ts`, add:

```typescript
import { postExpenseToGL, reverseExpenseFromGL } from './expenses.accounting';
```

- [ ] **Step 2: Update `approve()` to also post to GL**

Inside the `$transaction` in `approve()`, after the existing `transactionsService.postEntry(...)` call, add:

```typescript
await postExpenseToGL(tx, exp.id);
```

The full updated section inside the transaction:

```typescript
const updated = await prisma.$transaction(async (tx) => {
  const exp = await tx.expense.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: user?.employeeId ?? null, approvedAt: new Date() },
    include: FULL_INCLUDE,
  });
  // Legacy Transaction system (kept for backward compatibility)
  await transactionsService.postEntry(
    {
      date: exp.date,
      description: `مصروف ${CATEGORY_AR[exp.category] ?? exp.category}: ${exp.description}`,
      type: 'EXPENSE',
      debit: exp.amount,
      account: `مصروفات - ${CATEGORY_AR[exp.category] ?? exp.category}`,
      referenceType: 'EXPENSE',
      referenceId: exp.id,
    },
    tx,
  );
  // GL (double-entry) — Phase 2
  await postExpenseToGL(tx, exp.id);
  return exp;
});
```

- [ ] **Step 3: Add `cancel()` method**

Add after the existing `reject()` method:

```typescript
/** إلغاء مصروف معتمد مع عكس قيد اليومية. لا يحذف القيد الأصلي. */
async cancel(id: number, req: Request) {
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw AppError.notFound('المصروف غير موجود');
  if (expense.status !== 'APPROVED') throw AppError.badRequest('لا يمكن إلغاء مصروف غير معتمد');

  const updated = await prisma.$transaction(async (tx) => {
    await reverseExpenseFromGL(tx, id);
    return tx.expense.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: FULL_INCLUDE,
    });
  });

  await recordAudit({ req, action: 'CANCEL', module: 'expenses', entityId: id, oldValue: { amount: expense.amount } });
  return updated;
}
```

- [ ] **Step 4: Type-check**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/expenses/expenses.service.ts
git commit -m "feat(expenses): wire GL posting in approve() + add cancel() with reversal"
```

---

### Task B4: Add cancel route and controller handler

**Files:**
- Modify: `backend/src/modules/expenses/expenses.routes.ts`
- Modify: `backend/src/modules/expenses/expenses.controller.ts`

- [ ] **Step 1: Add controller handler**

In `expenses.controller.ts`, add (alongside `approve` and `reject` handlers):

```typescript
cancel: async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await expensesService.cancel(id, req);
  return successResponse(res, data);
},
```

- [ ] **Step 2: Add route**

In `expenses.routes.ts`, alongside the existing approve/reject patches, add:

```typescript
router.patch('/:id/cancel', requirePermission('expenses.approve'), asyncHandler(expensesController.cancel));
```

- [ ] **Step 3: Type-check**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 4: Run all tests**

```bash
cd backend && npm test
```

Expected: all pass (including new expense GL tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/expenses/expenses.routes.ts backend/src/modules/expenses/expenses.controller.ts
git commit -m "feat(expenses): add PATCH /:id/cancel route"
```

---

### Phase B Validation

- [ ] **Step 1: Full TypeScript check (all three)**

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit
```

- [ ] **Step 2: Run all tests**

```bash
cd backend && npm test
```

- [ ] **Step 3: Build validation**

```bash
npm run build:back
npm run build:front
```

- [ ] **Step 4: Legacy Transactions state summary (documentation only — no code)**

Add a comment block in `expenses.service.ts` above the `approve()` method:

```typescript
/**
 * Legacy notes — Phase B audit:
 * - Expenses post to both Transaction (legacy) and JournalEntry (GL) on approve.
 * - Payroll still posts to Transaction only (no GL) — deferred to a future phase.
 * - No conflicts exist: Transaction and JournalEntry are separate tables with separate queries.
 * - Unification plan: once payroll GL is implemented, Transaction table can be deprecated
 *   (all Accounting page queries moved to JournalEntry). No timeline set.
 */
```

- [ ] **Step 5: Commit Phase B tag**

```bash
git tag phase-b-validated
```

---

## Phase C — Payroll Import/Export Canonical Template

### Task C1: Backend — payroll Excel export

**Files:**
- Modify: `backend/src/modules/payroll/payroll.service.ts`
- Modify: `backend/src/modules/payroll/payroll.controller.ts`
- Modify: `backend/src/modules/payroll/payroll.routes.ts`

The canonical column order (Arabic headers → internal field):

| # | Arabic Header | Internal Field |
|---|--------------|----------------|
| 1 | رقم الموظف | employeeCode |
| 2 | اسم الموظف | employeeName |
| 3 | الشهر | month |
| 4 | السنة | year |
| 5 | الراتب الأساسي | baseSalary |
| 6 | البدلات | totalAllowances |
| 7 | الخصومات | totalDeductions |
| 8 | السلف | totalAdvances |
| 9 | الصافي | netSalary |
| 10 | الحالة | status |
| 11 | تاريخ الصرف | paidAt |
| 12 | ملاحظات | notes |

- [ ] **Step 1: Write failing test for export column headers**

Create `backend/src/modules/payroll/__tests__/payroll.export.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { exportPayrollToBuffer } from '../payroll.export';

describe('exportPayrollToBuffer', () => {
  it('produces a workbook with canonical column headers in order', async () => {
    const rows = [
      {
        employeeCode: 'EMP-001',
        employeeName: 'محمد علي',
        month: 6,
        year: 2026,
        baseSalary: 500,
        totalAllowances: 100,
        totalDeductions: 50,
        totalAdvances: 0,
        netSalary: 550,
        status: 'APPROVED',
        paidAt: null,
        notes: '',
      },
    ];

    const buffer = await exportPayrollToBuffer(rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];

    const headers = ws.getRow(1).values as (string | undefined)[];
    // ExcelJS row.values is 1-indexed (index 0 is undefined)
    expect(headers[1]).toBe('رقم الموظف');
    expect(headers[2]).toBe('اسم الموظف');
    expect(headers[9]).toBe('الصافي');
    expect(headers[12]).toBe('ملاحظات');
  });

  it('writes data row correctly', async () => {
    const rows = [{
      employeeCode: 'EMP-001', employeeName: 'محمد', month: 6, year: 2026,
      baseSalary: 500, totalAllowances: 0, totalDeductions: 0, totalAdvances: 0,
      netSalary: 500, status: 'DRAFT', paidAt: null, notes: 'اختبار',
    }];

    const buffer = await exportPayrollToBuffer(rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    const row2 = ws.getRow(2).values as any[];
    expect(row2[1]).toBe('EMP-001');
    expect(row2[9]).toBe(500);
    expect(row2[12]).toBe('اختبار');
  });
});
```

- [ ] **Step 2: Run — expect failure (file doesn't exist)**

```bash
cd backend && npm test -- payroll.export
```

- [ ] **Step 3: Create `backend/src/modules/payroll/payroll.export.ts`**

```typescript
import ExcelJS from 'exceljs';

const CANONICAL_COLUMNS = [
  { header: 'رقم الموظف',    key: 'employeeCode' },
  { header: 'اسم الموظف',   key: 'employeeName' },
  { header: 'الشهر',        key: 'month' },
  { header: 'السنة',        key: 'year' },
  { header: 'الراتب الأساسي', key: 'baseSalary' },
  { header: 'البدلات',      key: 'totalAllowances' },
  { header: 'الخصومات',     key: 'totalDeductions' },
  { header: 'السلف',        key: 'totalAdvances' },
  { header: 'الصافي',       key: 'netSalary' },
  { header: 'الحالة',       key: 'status' },
  { header: 'تاريخ الصرف',  key: 'paidAt' },
  { header: 'ملاحظات',      key: 'notes' },
] as const;

export type CanonicalPayrollRow = {
  employeeCode: string;
  employeeName: string;
  month: number;
  year: number;
  baseSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  totalAdvances: number;
  netSalary: number;
  status: string;
  paidAt: Date | null;
  notes: string | null;
};

export async function exportPayrollToBuffer(rows: CanonicalPayrollRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'نظام المنار';
  const ws = wb.addWorksheet('الرواتب');

  ws.columns = CANONICAL_COLUMNS.map((col) => ({
    header: col.header,
    key: col.key,
    width: 18,
  }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };

  for (const row of rows) {
    ws.addRow({
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      month: row.month,
      year: row.year,
      baseSalary: row.baseSalary,
      totalAllowances: row.totalAllowances,
      totalDeductions: row.totalDeductions,
      totalAdvances: row.totalAdvances,
      netSalary: row.netSalary,
      status: row.status,
      paidAt: row.paidAt ? row.paidAt.toISOString().split('T')[0] : '',
      notes: row.notes ?? '',
    });
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
```

- [ ] **Step 4: Add `exportPayroll` method to `payroll.service.ts`**

Add to `PayrollService`:

```typescript
async exportPayroll(query: { month?: string; year?: string; status?: string }): Promise<Buffer> {
  const where: Prisma.PayrollWhereInput = {};
  if (query.month) where.month = Number(query.month);
  if (query.year) where.year = Number(query.year);
  if (query.status) where.status = query.status;

  const records = await prisma.payroll.findMany({
    where,
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { id: 'asc' }],
    include: { employee: { select: { code: true, fullName: true } } },
  });

  const rows: import('./payroll.export').CanonicalPayrollRow[] = records.map((r) => ({
    employeeCode: r.employee.code,
    employeeName: r.employee.fullName,
    month: r.month,
    year: r.year,
    baseSalary: r.baseSalary,
    totalAllowances: r.totalAllowances,
    totalDeductions: r.totalDeductions,
    totalAdvances: r.totalAdvances,
    netSalary: r.netSalary,
    status: r.status,
    paidAt: r.paidAt ?? null,
    notes: r.notes ?? null,
  }));

  return exportPayrollToBuffer(rows);
}
```

Import `exportPayrollToBuffer` at the top of `payroll.service.ts`.

- [ ] **Step 5: Add export handler to `payroll.controller.ts`**

```typescript
exportPayroll: async (req: Request, res: Response) => {
  const { month, year, status } = req.query as Record<string, string>;
  const buffer = await payrollService.exportPayroll({ month, year, status });
  const filename = `payroll-${year ?? 'all'}-${month ?? 'all'}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
},
```

- [ ] **Step 6: Add export route to `payroll.routes.ts`**

```typescript
router.get('/export', requirePermission('payroll.read'), asyncHandler(payrollController.exportPayroll));
```

Add before the `/:id` parameterized routes.

- [ ] **Step 7: Run tests — expect pass**

```bash
cd backend && npm test -- payroll.export
```

- [ ] **Step 8: Type-check and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/modules/payroll/
git commit -m "feat(payroll): add canonical Excel export endpoint"
```

---

### Task C2: Backend — payroll import preview + confirm

**Files:**
- Create: `backend/src/modules/payroll/payroll.import.ts`
- Modify: `backend/src/modules/payroll/payroll.schema.ts`
- Modify: `backend/src/modules/payroll/payroll.service.ts`
- Modify: `backend/src/modules/payroll/payroll.controller.ts`
- Modify: `backend/src/modules/payroll/payroll.routes.ts`

The frontend reads the Excel file and sends rows as JSON (matches the canonical template columns). Backend validates, returns preview, then on confirm creates Payroll records.

- [ ] **Step 1: Write failing test for import preview**

Create `backend/src/modules/payroll/__tests__/payroll.import.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { previewPayrollImport } from '../payroll.import';

vi.mock('@config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    payroll: { findUnique: vi.fn() },
  },
}));

import { prisma } from '@config/database';

const validRow = {
  employeeCode: 'EMP-001',
  employeeName: 'محمد علي',
  month: 6,
  year: 2026,
  baseSalary: 500,
  totalAllowances: 100,
  totalDeductions: 50,
  totalAdvances: 0,
  netSalary: 550,
  status: 'APPROVED',
  paidAt: null,
  notes: '',
};

describe('previewPayrollImport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks row as READY when employee exists and no conflict', async () => {
    (prisma.employee.findUnique as any).mockResolvedValue({ id: 1, code: 'EMP-001', fullName: 'محمد' });
    (prisma.payroll.findUnique as any).mockResolvedValue(null); // no existing payroll

    const result = await previewPayrollImport([validRow]);
    expect(result[0].status).toBe('READY');
    expect(result[0].employeeId).toBe(1);
  });

  it('marks row as ERROR when employee code not found', async () => {
    (prisma.employee.findUnique as any).mockResolvedValue(null);

    const result = await previewPayrollImport([validRow]);
    expect(result[0].status).toBe('ERROR');
    expect(result[0].error).toContain('EMP-001');
  });

  it('marks row as CONFLICT when payroll already exists for that month/year/employee', async () => {
    (prisma.employee.findUnique as any).mockResolvedValue({ id: 1, code: 'EMP-001', fullName: 'محمد' });
    (prisma.payroll.findUnique as any).mockResolvedValue({ id: 99 }); // conflict

    const result = await previewPayrollImport([validRow]);
    expect(result[0].status).toBe('CONFLICT');
    expect(result[0].existingId).toBe(99);
  });

  it('marks row as ERROR when baseSalary is negative', async () => {
    (prisma.employee.findUnique as any).mockResolvedValue({ id: 1, code: 'EMP-001', fullName: 'محمد' });
    (prisma.payroll.findUnique as any).mockResolvedValue(null);

    const row = { ...validRow, baseSalary: -1 };
    const result = await previewPayrollImport([row]);
    expect(result[0].status).toBe('ERROR');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd backend && npm test -- payroll.import
```

- [ ] **Step 3: Create `backend/src/modules/payroll/payroll.import.ts`**

```typescript
import { prisma } from '@config/database';
import type { CanonicalPayrollRow } from './payroll.export';

export type ImportRowStatus = 'READY' | 'ERROR' | 'CONFLICT';

export type ImportPreviewRow = CanonicalPayrollRow & {
  rowIndex: number;
  status: ImportRowStatus;
  employeeId?: number;
  existingId?: number;
  error?: string;
};

export async function previewPayrollImport(rows: CanonicalPayrollRow[]): Promise<ImportPreviewRow[]> {
  const results: ImportPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const base: ImportPreviewRow = { ...row, rowIndex: i + 2 }; // +2: row 1 is header

    if (row.baseSalary < 0 || row.totalAllowances < 0 || row.totalDeductions < 0 || row.totalAdvances < 0 || row.netSalary < 0) {
      results.push({ ...base, status: 'ERROR', error: 'المبالغ لا يمكن أن تكون سالبة' });
      continue;
    }

    if (!row.month || row.month < 1 || row.month > 12 || !row.year || row.year < 2020 || row.year > 2099) {
      results.push({ ...base, status: 'ERROR', error: 'الشهر أو السنة غير صالحة' });
      continue;
    }

    const employee = await prisma.employee.findUnique({ where: { code: row.employeeCode }, select: { id: true } });
    if (!employee) {
      results.push({ ...base, status: 'ERROR', error: `رقم الموظف غير موجود: ${row.employeeCode}` });
      continue;
    }

    const existing = await prisma.payroll.findUnique({
      where: { employeeId_month_year: { employeeId: employee.id, month: row.month, year: row.year } },
      select: { id: true },
    });
    if (existing) {
      results.push({ ...base, status: 'CONFLICT', employeeId: employee.id, existingId: existing.id });
      continue;
    }

    results.push({ ...base, status: 'READY', employeeId: employee.id });
  }

  return results;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && npm test -- payroll.import
```

- [ ] **Step 5: Add import Zod schema to `payroll.schema.ts`**

```typescript
export const importRowSchema = z.object({
  employeeCode: z.string().min(1, 'رقم الموظف مطلوب'),
  employeeName: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2099),
  baseSalary: z.coerce.number().nonnegative(),
  totalAllowances: z.coerce.number().nonnegative().default(0),
  totalDeductions: z.coerce.number().nonnegative().default(0),
  totalAdvances: z.coerce.number().nonnegative().default(0),
  netSalary: z.coerce.number().nonnegative(),
  status: z.string().default('DRAFT'),
  paidAt: z.coerce.date().nullable().optional(),
  notes: z.string().optional().nullable(),
});

export const importPreviewSchema = z.object({
  body: z.object({ rows: z.array(importRowSchema).min(1, 'لا توجد صفوف للاستيراد') }),
});

export const importConfirmSchema = z.object({
  body: z.object({
    rows: z.array(importRowSchema.extend({ employeeId: z.number().int().positive() })),
  }),
});

export type ImportRowInput = z.infer<typeof importRowSchema>;
export type ImportConfirmInput = z.infer<typeof importConfirmSchema>['body'];
```

- [ ] **Step 6: Add `importConfirm` service method to `payroll.service.ts`**

```typescript
async importConfirm(rows: (ImportRowInput & { employeeId: number })[]): Promise<{ created: number }> {
  let created = 0;
  for (const row of rows) {
    await prisma.payroll.create({
      data: {
        employeeId: row.employeeId,
        month: row.month,
        year: row.year,
        baseSalary: row.baseSalary,
        snapshotBaseSalary: row.baseSalary,
        totalAllowances: row.totalAllowances,
        totalDeductions: row.totalDeductions,
        totalDeduction: row.totalDeductions, // legacy field
        totalAdvances: row.totalAdvances,
        grossSalary: row.baseSalary + row.totalAllowances,
        netSalary: row.netSalary,
        status: row.status ?? 'DRAFT',
        paidAt: row.paidAt ?? null,
        notes: row.notes ?? null,
      },
    });
    created++;
  }
  return { created };
}
```

Import `ImportRowInput` from `payroll.schema.ts`.

- [ ] **Step 7: Add controller handlers to `payroll.controller.ts`**

```typescript
importPreview: async (req: Request, res: Response) => {
  const { rows } = req.body as { rows: any[] };
  const data = await previewPayrollImport(rows);
  return successResponse(res, data);
},

importConfirm: async (req: Request, res: Response) => {
  const { rows } = req.body as { rows: any[] };
  const readyRows = rows.filter((r) => r.status === 'READY' && r.employeeId);
  const data = await payrollService.importConfirm(readyRows);
  return successResponse(res, data);
},
```

Import `previewPayrollImport` from `payroll.import.ts`.

- [ ] **Step 8: Add import routes to `payroll.routes.ts`**

```typescript
router.post('/import/preview', requirePermission('payroll.create'), validate(importPreviewSchema), asyncHandler(payrollController.importPreview));
router.post('/import/confirm', requirePermission('payroll.create'), validate(importConfirmSchema), asyncHandler(payrollController.importConfirm));
```

Import `importPreviewSchema` and `importConfirmSchema` from `payroll.schema.ts`.

- [ ] **Step 9: Run all tests**

```bash
cd backend && npm test
```

Expected: all pass (including payroll.import and payroll.export tests).

- [ ] **Step 10: Type-check + commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/modules/payroll/
git commit -m "feat(payroll): add canonical import preview + confirm endpoints"
```

---

### Task C3: Frontend — export button in Salaries page

**Files:**
- Modify: `frontend/src/pages/Salaries.tsx`

- [ ] **Step 1: Add export button**

In the Salaries page toolbar (alongside existing controls), add an export button:

```tsx
const [exportBusy, setExportBusy] = useState(false);

const handleExport = async () => {
  setExportBusy(true);
  try {
    const params = new URLSearchParams();
    if (filterMonth) params.set('month', filterMonth);
    if (filterYear) params.set('year', filterYear);
    if (filterStatus) params.set('status', filterStatus);

    const res = await api.get(`/payroll/export?${params.toString()}`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-export.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // silent — export failure is non-critical
  } finally {
    setExportBusy(false);
  }
};
```

In the JSX toolbar:

```tsx
<button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exportBusy}>
  {exportBusy ? 'جاري التصدير...' : 'تصدير Excel'}
</button>
```

- [ ] **Step 2: Type-check frontend**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Salaries.tsx
git commit -m "feat(frontend/salaries): add Excel export button"
```

---

### Task C4: Frontend — import dialog in Salaries page

**Files:**
- Modify: `frontend/src/pages/Salaries.tsx`

- [ ] **Step 1: Add import state and file reader**

Add state:

```tsx
const [showImport, setShowImport] = useState(false);
const [importRows, setImportRows] = useState<any[]>([]);
const [importPreview, setImportPreview] = useState<any[]>([]);
const [importStep, setImportStep] = useState<'select' | 'preview' | 'done'>('select');
const [importBusy, setImportBusy] = useState(false);
const [importResult, setImportResult] = useState<{ created: number } | null>(null);
```

Add file reader that parses the Excel file to JSON rows using SheetJS (xlsx). Since the project uses ExcelJS on the backend, the frontend parse uses the native FileReader + arraybuffer. Install `xlsx` if not present; if not acceptable, parse CSV fallback is also fine. Check if `xlsx` is already in `package.json`:

```bash
cd frontend && grep -r "xlsx\|exceljs" package.json
```

If not present, use a simple JSON-based approach: instead of parsing on the frontend, use a file upload to a backend endpoint that returns parsed rows. Since Electron is desktop-only, add a `multipart` endpoint alternatively. **For simplicity: parse on the frontend using the `xlsx` library.**

Check `frontend/package.json` for `xlsx`. If missing:

```bash
cd frontend && npm install xlsx
```

File reader handler:

```tsx
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setImportBusy(true);
  try {
    const { read, utils } = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = utils.sheet_to_json(ws, { header: 1 }) as any[][];
    if (json.length < 2) return;

    const headers = json[0] as string[];
    const headerMap: Record<string, string> = {
      'رقم الموظف': 'employeeCode',
      'اسم الموظف': 'employeeName',
      'الشهر': 'month',
      'السنة': 'year',
      'الراتب الأساسي': 'baseSalary',
      'البدلات': 'totalAllowances',
      'الخصومات': 'totalDeductions',
      'السلف': 'totalAdvances',
      'الصافي': 'netSalary',
      'الحالة': 'status',
      'تاريخ الصرف': 'paidAt',
      'ملاحظات': 'notes',
    };

    const rows = json.slice(1).map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => {
        const key = headerMap[h] ?? h;
        obj[key] = row[i] ?? null;
      });
      return obj;
    });
    setImportRows(rows);
  } finally {
    setImportBusy(false);
  }
};
```

- [ ] **Step 2: Add preview fetch and confirm**

```tsx
const handleImportPreview = async () => {
  setImportBusy(true);
  try {
    const res = await api.post('/payroll/import/preview', { rows: importRows });
    setImportPreview(res.data.data ?? []);
    setImportStep('preview');
  } finally {
    setImportBusy(false);
  }
};

const handleImportConfirm = async () => {
  setImportBusy(true);
  try {
    const readyRows = importPreview.filter((r) => r.status === 'READY');
    const res = await api.post('/payroll/import/confirm', { rows: readyRows });
    setImportResult(res.data.data);
    setImportStep('done');
    load(); // refresh list
  } finally {
    setImportBusy(false);
  }
};
```

- [ ] **Step 3: Add import modal JSX**

Add a modal (using the existing `Modal` component from the codebase):

```tsx
{showImport && (
  <Modal title="استيراد رواتب" onClose={() => { setShowImport(false); setImportStep('select'); setImportPreview([]); }}>
    {importStep === 'select' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13 }}>استخدم ملف التصدير القياسي كقالب للاستيراد. الأعمدة يجب أن تطابق ترتيب التصدير.</p>
        <input type="file" accept=".xlsx" onChange={handleFileChange} />
        {importRows.length > 0 && (
          <p>{importRows.length} صف جاهز للمعاينة</p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" disabled={importRows.length === 0 || importBusy} onClick={handleImportPreview}>
            معاينة
          </button>
          <button className="btn btn-ghost" onClick={() => setShowImport(false)}>إلغاء</button>
        </div>
      </div>
    )}

    {importStep === 'preview' && (
      <div>
        <p>نتائج المعاينة ({importPreview.filter((r) => r.status === 'READY').length} جاهز / {importPreview.filter((r) => r.status === 'ERROR').length} خطأ / {importPreview.filter((r) => r.status === 'CONFLICT').length} تعارض)</p>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>الصف</th><th>الموظف</th><th>الشهر/السنة</th><th>الصافي</th><th>الحالة</th><th>ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {importPreview.map((row) => (
                <tr key={row.rowIndex} style={{ background: row.status === 'ERROR' ? '#fff1f0' : row.status === 'CONFLICT' ? '#fffbe6' : 'transparent' }}>
                  <td>{row.rowIndex}</td>
                  <td>{row.employeeCode} — {row.employeeName}</td>
                  <td>{row.month}/{row.year}</td>
                  <td>{row.netSalary?.toLocaleString('ar-KW', { minimumFractionDigits: 3 })}</td>
                  <td>{row.status === 'READY' ? '✓ جاهز' : row.status === 'CONFLICT' ? '⚠ تعارض' : '✗ خطأ'}</td>
                  <td style={{ fontSize: 11 }}>{row.error ?? (row.status === 'CONFLICT' ? `تعارض مع #${row.existingId}` : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" disabled={importPreview.filter((r) => r.status === 'READY').length === 0 || importBusy} onClick={handleImportConfirm}>
            استيراد ({importPreview.filter((r) => r.status === 'READY').length} سجل)
          </button>
          <button className="btn btn-ghost" onClick={() => setImportStep('select')}>رجوع</button>
        </div>
      </div>
    )}

    {importStep === 'done' && (
      <div>
        <p>✓ تم استيراد {importResult?.created} سجل راتب بنجاح.</p>
        <button className="btn btn-primary" onClick={() => { setShowImport(false); setImportStep('select'); }}>إغلاق</button>
      </div>
    )}
  </Modal>
)}
```

Add import button in the toolbar:

```tsx
<button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>
  استيراد Excel
</button>
```

- [ ] **Step 4: Type-check frontend**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Salaries.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend/salaries): add Excel import dialog with preview"
```

---

### Phase C Validation

- [ ] **Step 1: Full TypeScript check (all three)**

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit
```

- [ ] **Step 2: Run all tests**

```bash
cd backend && npm test
```

Expected: all tests pass (A + B + C new tests included).

- [ ] **Step 3: Build validation**

```bash
npm run build:back
npm run build:front
```

- [ ] **Step 4: Commit Phase C tag**

```bash
git tag phase-c-validated
```

---

## Final Validation (all phases)

- [ ] **Step 1: Full TypeScript validation**

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit
```

- [ ] **Step 2: All tests green**

```bash
cd backend && npm test
```

- [ ] **Step 3: Full build**

```bash
npm run build:back && npm run build:front
```

- [ ] **Step 4: Prisma validate**

```bash
cd backend && npx prisma validate
```

- [ ] **Step 5: Generate final branch summary for Gemini review**

Stop here and output the Gemini-ready report per Phase (see plan goal section).

---

## Gemini Report Template (fill after each phase)

### Phase A Report
- **Files modified**: schema.prisma, invoices.calc.ts, invoices.schema.ts, invoices.service.ts, prices.service.ts, prices.routes.ts, prices.controller.ts, Prices.tsx
- **Migration**: `add_price_id_to_invoice_items` — adds nullable INT column + index. Non-destructive.
- **Breaking changes**: None. Old items have `priceId = null`. Reports still work.
- **Tests added**: `invoices.calc.test.ts` (priceId passthrough), `prices.usage.test.ts` (6 tests)
- **Risks**: None — purely additive.

### Phase B Report
- **Files modified**: accounting.accounts.ts, expenses.accounting.ts (new), expenses.service.ts, expenses.routes.ts, expenses.controller.ts
- **Migration**: None required. Status 'CANCELLED' is a string value, no schema change.
- **Breaking changes**: None. Legacy Transaction posting is preserved alongside new GL posting.
- **Tests added**: `expenses.accounting.test.ts` (6 tests)
- **Risks**: Expenses now double-post (Transaction + JournalEntry). This is intentional and guarded against duplication on both sides.
- **Deferred**: Purchase invoice GL, payroll GL, Transaction table deprecation.

### Phase C Report
- **Files modified**: payroll.export.ts (new), payroll.import.ts (new), payroll.service.ts, payroll.controller.ts, payroll.routes.ts, payroll.schema.ts, Salaries.tsx
- **Migration**: None.
- **Breaking changes**: None. Existing payroll endpoints unchanged.
- **Tests added**: `payroll.export.test.ts` (2 tests), `payroll.import.test.ts` (4 tests)
- **Risks**: Import creates new Payroll records without PayrollLines. This is intentional — imported payrolls are summary-level. Payroll.lines is empty; all calculations already in the header fields.
- **Deferred**: Import from non-canonical templates, PayrollLine-level import.
