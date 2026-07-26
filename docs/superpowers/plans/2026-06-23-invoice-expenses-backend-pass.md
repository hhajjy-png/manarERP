# Invoice & Expenses Operations Pack — Backend Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the backend half of the Invoice & Expenses Operations Pack: rich FK conflict messages for 4 key entities, expenses stats period cards (currentMonth/previousMonth/currentYear), and verified billing-period coverage in reports/exports.

**Architecture:** Backend-first pass on an isolated feature branch. Three service files get surgical edits; no new routes, no new models, no migrations. Tests are added inline per task using Vitest + vi.mock() — the pattern already established in the repo.

**Tech Stack:** Express, Prisma (SQLite), TypeScript, Vitest, AppError utility

## Global Constraints

- NO Prisma migrations
- NO schema changes
- NO new npm packages
- NO IPC changes
- NO frontend work in this pass
- Backward compatible — all existing API contracts preserved
- Follow existing coding style (Arabic error messages, AppError.conflict/notFound, recordAudit)
- Currency: Kuwaiti Dinar (د.ك), 3 decimal places (not relevant here but noted)
- Backend port: 127.0.0.1:48211 (no change)
- Run every validation command at end; stop if anything fails

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `backend/src/modules/customers/customers.service.ts` | Modify | `remove()` — rich conflict message using already-loaded `customer.contracts[0]` |
| `backend/src/modules/customers/__tests__/customers.service.test.ts` | Modify | Add tests for new conflict messages |
| `backend/src/modules/suppliers/suppliers.service.ts` | Modify | `remove()` — fetch first invoice + first expense, rich message |
| `backend/src/modules/suppliers/__tests__/suppliers.service.test.ts` | Create | New test file for delete guard |
| `backend/src/modules/equipment/equipment.service.ts` | Modify | `remove()` — fetch first MaintenanceRecord.id, rich message |
| `backend/src/modules/equipment/__tests__/equipment.service.test.ts` | Create | New test file for delete guard |
| `backend/src/modules/expenses/expenses.service.ts` | Modify | `stats()` — add currentMonth/previousMonth/currentYear period cards |
| `backend/src/modules/expenses/__tests__/expenses.service.test.ts` | Modify | Add tests for period cards |

---

## Task 1: Git Setup — Checkpoint Tag + Feature Branch

**Files:** none (git operations only)

- [ ] **Step 1: Verify you are on production at HEAD 8792a06**

```bash
git log --oneline -3
```

Expected: first line shows `8792a06` (or later if hotfixes landed — confirm with team).

- [ ] **Step 2: Create checkpoint tag**

```bash
git tag pre-invoice-expenses-operations-pack
```

Expected: silent success (no output).

- [ ] **Step 3: Create and switch to feature branch**

```bash
git checkout -b feature/invoice-expenses-operations-pack
```

Expected: `Switched to a new branch 'feature/invoice-expenses-operations-pack'`

- [ ] **Step 4: Verify branch**

```bash
git branch --show-current
```

Expected: `feature/invoice-expenses-operations-pack`

---

## Task 2: Customer Delete Guard — Rich Conflict Message

**Files:**
- Modify: `backend/src/modules/customers/customers.service.ts` (lines 88–98 — the `remove()` method)
- Modify: `backend/src/modules/customers/__tests__/customers.service.test.ts`

**Context:** `findWithRelations()` already returns `contracts: [{ id, code, asphaltPlant, status, monthlyTransportValue }]` and `_count: { contracts, invoices }`. No extra DB query needed — `customer.contracts[0]?.code` gives the first contract code.

**Interfaces:**
- Produces: `AppError.conflict(message)` where `message` mentions the first contract code and counts

- [ ] **Step 1: Write the failing test**

Append to `backend/src/modules/customers/__tests__/customers.service.test.ts`:

```typescript
// ---------- remove() delete guard tests ----------

vi.mock('../customers.repository', () => ({
  customersRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findWithRelations: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Re-import after mock update (add to existing imports at top if not already there)
// import { customersRepository } from '../customers.repository';

describe('CustomersService.remove — rich conflict messages', () => {
  let service: CustomersService;

  beforeEach(() => {
    service = new CustomersService();
    vi.clearAllMocks();
  });

  it('throws notFound when customer does not exist', async () => {
    (customersRepository.findWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.remove(999, fakeReq)).rejects.toThrow('العميل غير موجود');
  });

  it('mentions single contract code when exactly one contract', async () => {
    (customersRepository.findWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      contracts: [{ id: 10, code: 'KW-2025-001', asphaltPlant: 'مصنع أ', status: 'ACTIVE', monthlyTransportValue: 0 }],
      _count: { contracts: 1, invoices: 0 },
    });
    await expect(service.remove(1, fakeReq))
      .rejects.toThrow('العقد KW-2025-001');
  });

  it('mentions first contract + remaining count when multiple contracts', async () => {
    (customersRepository.findWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      contracts: [{ id: 10, code: 'KW-2025-001', asphaltPlant: 'مصنع أ', status: 'ACTIVE', monthlyTransportValue: 0 }],
      _count: { contracts: 3, invoices: 2 },
    });
    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('KW-2025-001');
    expect((err as Error).message).toContain('2 عقود أخرى');
    expect((err as Error).message).toContain('2 فواتير');
  });

  it('mentions only invoices when no contracts', async () => {
    (customersRepository.findWithRelations as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      contracts: [],
      _count: { contracts: 0, invoices: 5 },
    });
    await expect(service.remove(1, fakeReq))
      .rejects.toThrow('5 فواتير');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/modules/customers/__tests__/customers.service.test.ts
```

Expected: FAIL — the existing `remove()` message does not match the new assertions.

- [ ] **Step 3: Replace `remove()` in customers.service.ts**

Replace the entire `remove()` method (lines 88–98):

```typescript
/** حذف نهائي — يُمنع إذا كان للعميل مشاريع أو فواتير. */
async remove(id: number, req: Request) {
  const customer = await customersRepository.findWithRelations(id);
  if (!customer) throw AppError.notFound('العميل غير موجود');

  const contractCount = customer._count.contracts;
  const invoiceCount = customer._count.invoices;

  if (contractCount > 0 || invoiceCount > 0) {
    const firstCode = customer.contracts[0]?.code ?? null;
    const parts: string[] = [];

    if (contractCount === 1 && firstCode) {
      parts.push(`العقد ${firstCode}`);
    } else if (contractCount > 1 && firstCode) {
      parts.push(`العقد ${firstCode}، و${contractCount - 1} عقود أخرى`);
    } else if (contractCount > 0) {
      parts.push(`${contractCount} عقد`);
    }

    if (invoiceCount === 1) {
      parts.push('فاتورة واحدة');
    } else if (invoiceCount > 1) {
      parts.push(`${invoiceCount} فواتير`);
    }

    throw AppError.conflict(
      `لا يمكن حذف هذا العميل لأنه مستخدم في ${parts.join('، و')} — يمكنك أرشفته بدلاً من ذلك`,
    );
  }

  await customersRepository.delete(id);
  await recordAudit({ req, action: 'DELETE', module: 'customers', entityId: id, oldValue: customer });
  return { deleted: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/modules/customers/__tests__/customers.service.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/customers/customers.service.ts backend/src/modules/customers/__tests__/customers.service.test.ts
git commit -m "feat(customers): rich conflict message on delete with contract code and counts"
```

---

## Task 3: Supplier Delete Guard — Rich Conflict Message

**Files:**
- Modify: `backend/src/modules/suppliers/suppliers.service.ts` (lines 77–86 — the `remove()` method)
- Create: `backend/src/modules/suppliers/__tests__/suppliers.service.test.ts`

**Context:** `repo.findWithCounts(id)` returns `_count: { invoices, expenses }`. Two additional `findFirst` queries fetch the first invoice's `invoiceNumber` and the first expense's `code`. Both are run in `Promise.all` only when counts > 0 to avoid unnecessary queries.

**Interfaces:**
- Consumes: `prisma.invoice.findFirst`, `prisma.expense.findFirst`
- Produces: `AppError.conflict(message)` mentioning first document references

- [ ] **Step 1: Create test file**

Create `backend/src/modules/suppliers/__tests__/suppliers.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../core/errors/AppError';

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { findFirst: vi.fn() },
    expense: { findFirst: vi.fn() },
    supplier: { findUnique: vi.fn(), delete: vi.fn() },
    purchaseOrder: { count: vi.fn(), deleteMany: vi.fn() },
    goodsReceipt: { count: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('../../../shared/repositories/BaseRepository');
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { SuppliersService } from '../suppliers.service';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  invoice: { findFirst: ReturnType<typeof vi.fn> };
  expense: { findFirst: ReturnType<typeof vi.fn> };
};

const fakeReq = {} as import('express').Request;

describe('SuppliersService.remove — rich conflict messages', () => {
  let service: SuppliersService;

  beforeEach(() => {
    service = new SuppliersService();
    vi.clearAllMocks();
  });

  it('mentions invoice number when supplier has invoices', async () => {
    // Mock findWithCounts via the repo's method
    const { SuppliersService: SS } = await import('../suppliers.service');
    const svc = new SS();
    // Stub the internal repo call by spying on the prototype
    vi.spyOn(svc as unknown as { remove: (id: number, req: unknown) => Promise<unknown> }, 'remove');

    // Direct unit: mock the private repo and prisma calls
    mockPrisma.invoice.findFirst.mockResolvedValue({ invoiceNumber: 'PINV-2025-00001' });
    mockPrisma.expense.findFirst.mockResolvedValue(null);

    // We test by calling remove() through a service where findWithCounts is patched
    // Since repo is module-level private, test via integration-style mock
    expect(mockPrisma.invoice.findFirst).toBeDefined(); // verify mock in place
  });
});
```

> **Note:** Because `SuppliersService.remove` uses a private `repo` (a module-level singleton), and it calls `repo.findWithCounts` which wraps `prisma.supplier.findUnique`, the easiest unit test approach is to mock `prisma.supplier.findUnique` to return a fake with `_count`, then mock `prisma.invoice.findFirst` and `prisma.expense.findFirst`.

Replace the test file above with this correct version:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../core/errors/AppError';

vi.mock('../../../config/database', () => ({
  prisma: {
    supplier: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    invoice: { findFirst: vi.fn() },
    expense: { findFirst: vi.fn() },
    purchaseOrder: { count: vi.fn() },
    goodsReceipt: { count: vi.fn() },
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { SuppliersService } from '../suppliers.service';
import { prisma } from '../../../config/database';

type MockPrisma = {
  supplier: { findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  invoice: { findFirst: ReturnType<typeof vi.fn> };
  expense: { findFirst: ReturnType<typeof vi.fn> };
  purchaseOrder: { count: ReturnType<typeof vi.fn> };
  goodsReceipt: { count: ReturnType<typeof vi.fn> };
};

const mock = prisma as unknown as MockPrisma;
const fakeReq = {} as import('express').Request;

describe('SuppliersService.remove — rich conflict messages', () => {
  let service: SuppliersService;

  beforeEach(() => {
    service = new SuppliersService();
    vi.clearAllMocks();
    // Default: no purchase orders, no goods receipts
    mock.purchaseOrder.count.mockResolvedValue(0);
    mock.goodsReceipt.count.mockResolvedValue(0);
  });

  it('throws notFound when supplier does not exist', async () => {
    mock.supplier.findUnique.mockResolvedValue(null);
    await expect(service.remove(999, fakeReq)).rejects.toThrow('المورّد غير موجود');
  });

  it('mentions invoice number when supplier has invoices', async () => {
    mock.supplier.findUnique.mockResolvedValue({
      id: 1, name: 'مورد', code: 'S-001',
      _count: { invoices: 2, expenses: 0 },
    });
    mock.invoice.findFirst.mockResolvedValue({ invoiceNumber: 'PINV-2025-00001' });
    mock.expense.findFirst.mockResolvedValue(null);

    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('PINV-2025-00001');
    expect((err as Error).message).toContain('فاتورة أخرى');
  });

  it('mentions expense code when supplier has expenses but no invoices', async () => {
    mock.supplier.findUnique.mockResolvedValue({
      id: 1, name: 'مورد', code: 'S-001',
      _count: { invoices: 0, expenses: 1 },
    });
    mock.invoice.findFirst.mockResolvedValue(null);
    mock.expense.findFirst.mockResolvedValue({ code: 'EXP-2025-00001' });

    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('EXP-2025-00001');
  });

  it('allows deletion when supplier has no linked records', async () => {
    mock.supplier.findUnique.mockResolvedValue({
      id: 1, name: 'مورد', code: 'S-001',
      _count: { invoices: 0, expenses: 0 },
    });
    mock.supplier.delete.mockResolvedValue({ id: 1 });

    const result = await service.remove(1, fakeReq);
    expect(result).toEqual({ deleted: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/modules/suppliers/__tests__/suppliers.service.test.ts
```

Expected: FAIL — existing `remove()` message does not contain invoice numbers.

- [ ] **Step 3: Replace `remove()` in suppliers.service.ts**

Replace lines 77–86:

```typescript
async remove(id: number, req: Request) {
  const supplier = await repo.findWithCounts(id);
  if (!supplier) throw AppError.notFound('المورّد غير موجود');

  const invoiceCount = supplier._count.invoices;
  const expenseCount = supplier._count.expenses;

  if (invoiceCount > 0 || expenseCount > 0) {
    const [firstInvoice, firstExpense] = await Promise.all([
      invoiceCount > 0
        ? prisma.invoice.findFirst({ where: { supplierId: id }, select: { invoiceNumber: true } })
        : Promise.resolve(null),
      expenseCount > 0
        ? prisma.expense.findFirst({ where: { supplierId: id }, select: { code: true } })
        : Promise.resolve(null),
    ]);

    const parts: string[] = [];

    if (invoiceCount === 1 && firstInvoice) {
      parts.push(`الفاتورة ${firstInvoice.invoiceNumber}`);
    } else if (invoiceCount > 1 && firstInvoice) {
      parts.push(`الفاتورة ${firstInvoice.invoiceNumber}، و${invoiceCount - 1} فاتورة أخرى`);
    } else if (invoiceCount > 0) {
      parts.push(`${invoiceCount} فاتورة`);
    }

    if (expenseCount === 1 && firstExpense) {
      parts.push(`المصروف ${firstExpense.code}`);
    } else if (expenseCount > 1 && firstExpense) {
      parts.push(`المصروف ${firstExpense.code}، و${expenseCount - 1} مصروف آخر`);
    } else if (expenseCount > 0) {
      parts.push(`${expenseCount} مصروف`);
    }

    throw AppError.conflict(
      `لا يمكن حذف هذا المورّد لأنه مستخدم في ${parts.join('، و')} — يمكنك أرشفته`,
    );
  }

  await repo.delete(id);
  await recordAudit({ req, action: 'DELETE', module: 'suppliers', entityId: id });
  return { deleted: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/modules/suppliers/__tests__/suppliers.service.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/suppliers/suppliers.service.ts backend/src/modules/suppliers/__tests__/suppliers.service.test.ts
git commit -m "feat(suppliers): rich conflict message on delete with invoice and expense references"
```

---

## Task 4: Equipment Delete Guard — Rich Conflict Message

**Files:**
- Modify: `backend/src/modules/equipment/equipment.service.ts` (lines 133–141 — the `remove()` method)
- Create: `backend/src/modules/equipment/__tests__/equipment.service.test.ts`

**Context:** `getChildCounts()` returns `{ maintenanceRecords, fuelLogs, breakdowns, spareParts }`. `MaintenanceRecord` has no `code` field — only `id`, `type`, `description`, `date`, `status`. Use `id` as the reference number. Fetch `prisma.maintenanceRecord.findFirst` only when `counts.maintenanceRecords > 0`.

**Interfaces:**
- Consumes: `prisma.maintenanceRecord.findFirst({ where: { equipmentId }, select: { id: true }, orderBy: { date: 'desc' } })`
- Produces: `AppError.conflict(message)` listing maintenance, fuel, breakdown, spare-part counts

- [ ] **Step 1: Create test file**

Create `backend/src/modules/equipment/__tests__/equipment.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    equipment: { findUnique: vi.fn(), delete: vi.fn() },
    maintenanceRecord: { count: vi.fn(), findFirst: vi.fn() },
    fuelLog: { count: vi.fn() },
    breakdown: { count: vi.fn() },
    sparePartUsage: { count: vi.fn() },
  },
}));

vi.mock('../../../shared/repositories/BaseRepository');
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { EquipmentService } from '../equipment.service';
import { prisma } from '../../../config/database';

type MockPrisma = {
  equipment: { findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  maintenanceRecord: { count: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  fuelLog: { count: ReturnType<typeof vi.fn> };
  breakdown: { count: ReturnType<typeof vi.fn> };
  sparePartUsage: { count: ReturnType<typeof vi.fn> };
};

const mock = prisma as unknown as MockPrisma;
const fakeReq = {} as import('express').Request;

describe('EquipmentService.remove — rich conflict messages', () => {
  let service: EquipmentService;

  beforeEach(() => {
    service = new EquipmentService();
    vi.clearAllMocks();
    // Default: equipment exists, no child records
    mock.equipment.findUnique.mockResolvedValue({ id: 1, code: 'EQ-001', name: 'شاحنة' });
    mock.maintenanceRecord.count.mockResolvedValue(0);
    mock.maintenanceRecord.findFirst.mockResolvedValue(null);
    mock.fuelLog.count.mockResolvedValue(0);
    mock.breakdown.count.mockResolvedValue(0);
    mock.sparePartUsage.count.mockResolvedValue(0);
  });

  it('throws notFound when equipment does not exist', async () => {
    mock.equipment.findUnique.mockResolvedValue(null);
    await expect(service.remove(999, fakeReq)).rejects.toThrow('المعدة غير موجودة');
  });

  it('mentions maintenance record id when equipment has maintenance records', async () => {
    mock.maintenanceRecord.count.mockResolvedValue(3);
    mock.maintenanceRecord.findFirst.mockResolvedValue({ id: 42 });

    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('42');
    expect((err as Error).message).toContain('سجلات صيانة أخرى');
  });

  it('mentions fuel logs when only fuel logs present', async () => {
    mock.fuelLog.count.mockResolvedValue(5);

    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('5 سجل وقود');
  });

  it('allows deletion when equipment has no child records', async () => {
    mock.equipment.delete.mockResolvedValue({ id: 1 });

    const result = await service.remove(1, fakeReq);
    expect(result).toEqual({ deleted: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/modules/equipment/__tests__/equipment.service.test.ts
```

Expected: FAIL — existing message doesn't mention record ids or specific counts.

- [ ] **Step 3: Replace `remove()` in equipment.service.ts**

Replace lines 133–141:

```typescript
async remove(id: number, req: Request) {
  if (!(await repo.findById(id))) throw AppError.notFound('المعدة غير موجودة');
  const counts = await this.getChildCounts(id);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total > 0) {
    const firstMaintenance = counts.maintenanceRecords > 0
      ? await prisma.maintenanceRecord.findFirst({
          where: { equipmentId: id },
          select: { id: true },
          orderBy: { date: 'desc' },
        })
      : null;

    const parts: string[] = [];

    if (counts.maintenanceRecords > 0) {
      const others = counts.maintenanceRecords - 1;
      if (firstMaintenance && others > 0) {
        parts.push(`صيانة رقم ${firstMaintenance.id}، و${others} سجلات صيانة أخرى`);
      } else if (firstMaintenance) {
        parts.push(`صيانة رقم ${firstMaintenance.id}`);
      } else {
        parts.push(`${counts.maintenanceRecords} سجل صيانة`);
      }
    }

    if (counts.fuelLogs > 0) parts.push(`${counts.fuelLogs} سجل وقود`);
    if (counts.breakdowns > 0) parts.push(`${counts.breakdowns} سجل أعطال`);
    if (counts.spareParts > 0) parts.push(`${counts.spareParts} استخدام قطع غيار`);

    throw AppError.conflict(
      `لا يمكن حذف هذه المعدة لأنها مستخدمة في ${parts.join('، و')}. استخدم الحذف الإجباري.`,
    );
  }

  await repo.delete(id);
  await recordAudit({ req, action: 'DELETE', module: 'equipment', entityId: id });
  return { deleted: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/modules/equipment/__tests__/equipment.service.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/equipment/equipment.service.ts backend/src/modules/equipment/__tests__/equipment.service.test.ts
git commit -m "feat(equipment): rich conflict message on delete with maintenance record id and counts"
```

---

## Task 5: Expenses Stats — Period Cards (currentMonth / previousMonth / currentYear)

**Files:**
- Modify: `backend/src/modules/expenses/expenses.service.ts` (the `stats()` method, lines 229–279)
- Modify: `backend/src/modules/expenses/__tests__/expenses.service.test.ts`

**Context:** Use `billingMonth` + `billingYear` (not `date`) as the primary period dimension, because business billing periods are what matter. The three period queries build their own `periodsBaseWhere` that includes `category`, `status`, `supplierId` filters but strips all date/billing period filters — period cards always show absolute calendar windows.

**Current response shape:**
```typescript
{ count, total, pendingCount, pendingTotal, byCategory, byCompanyGroup, bySupplier }
```

**New response shape (additive — existing fields unchanged):**
```typescript
{
  count, total, pendingCount, pendingTotal, byCategory, byCompanyGroup, bySupplier,
  currentMonth: { count: number; total: number },
  previousMonth: { count: number; total: number },
  currentYear: { count: number; total: number },
}
```

**Interfaces:**
- Produces: three new keys appended to existing stats return value
- `periodsBaseWhere` respects: `category`, `status`, `supplierId`; ignores: `billingMonth`, `billingYear`, `from`, `to`

- [ ] **Step 1: Write failing tests**

Append to `backend/src/modules/expenses/__tests__/expenses.service.test.ts`:

```typescript
// ---------- stats() period cards ----------

describe('ExpensesService.stats — period cards', () => {
  let service: ExpensesService;

  beforeEach(() => {
    service = new ExpensesService();
    vi.clearAllMocks();
  });

  it('returns currentMonth, previousMonth, currentYear keys', async () => {
    // Main query returns empty
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await service.stats({});

    expect(result).toHaveProperty('currentMonth');
    expect(result).toHaveProperty('previousMonth');
    expect(result).toHaveProperty('currentYear');
    expect(result.currentMonth).toHaveProperty('count');
    expect(result.currentMonth).toHaveProperty('total');
  });

  it('currentMonth total reflects billingMonth+billingYear filtered rows', async () => {
    const now = new Date();
    const cm = now.getMonth() + 1;
    const cy = now.getFullYear();

    // Main rows: empty. Period rows: mocked per call order.
    mockPrisma.expense.findMany
      .mockResolvedValueOnce([]) // main query
      .mockResolvedValueOnce([{ amount: 500 }, { amount: 300 }]) // currentMonth
      .mockResolvedValueOnce([]) // previousMonth
      .mockResolvedValueOnce([{ amount: 1000 }]); // currentYear

    const result = await service.stats({});

    expect(result.currentMonth.count).toBe(2);
    expect(result.currentMonth.total).toBeCloseTo(800);
    expect(result.currentYear.total).toBeCloseTo(1000);
  });

  it('period queries use billingYear/billingMonth, not createdAt', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([]);

    await service.stats({});

    // The 2nd, 3rd, 4th calls should include billingYear/billingMonth in their where
    const calls = mockPrisma.expense.findMany.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(4);

    const currentMonthCall = calls[1][0] as { where: Record<string, unknown> };
    expect(currentMonthCall.where).toHaveProperty('billingYear');
    expect(currentMonthCall.where).toHaveProperty('billingMonth');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/modules/expenses/__tests__/expenses.service.test.ts
```

Expected: FAIL — `result` lacks `currentMonth`, `previousMonth`, `currentYear` keys.

- [ ] **Step 3: Extend `stats()` in expenses.service.ts**

Replace the `return` statement at the end of `stats()` (currently line 278) with:

```typescript
    // ── Period cards (absolute calendar windows, respect category/status/supplier filters) ──
    const now = new Date();
    const currentM = now.getMonth() + 1; // 1-12
    const currentY = now.getFullYear();
    const prevM = currentM === 1 ? 12 : currentM - 1;
    const prevY = currentM === 1 ? currentY - 1 : currentY;

    // Base filter for period cards — strip all date/billing-period query params
    const periodsBaseWhere: Prisma.ExpenseWhereInput = {};
    if (query.category) periodsBaseWhere.category = query.category;
    if (query.status) periodsBaseWhere.status = query.status;
    if (query.supplierId) periodsBaseWhere.supplierId = Number(query.supplierId);

    const [currentMonthRows, prevMonthRows, currentYearRows] = await Promise.all([
      prisma.expense.findMany({
        where: { ...periodsBaseWhere, billingYear: currentY, billingMonth: currentM },
        select: { amount: true },
      }),
      prisma.expense.findMany({
        where: { ...periodsBaseWhere, billingYear: prevY, billingMonth: prevM },
        select: { amount: true },
      }),
      prisma.expense.findMany({
        where: { ...periodsBaseWhere, billingYear: currentY },
        select: { amount: true },
      }),
    ]);

    const sumAmount = (rows: { amount: number | string }[]) =>
      rows.reduce((s, r) => s + Number(r.amount), 0);

    return {
      count,
      total,
      pendingCount,
      pendingTotal,
      byCategory,
      byCompanyGroup,
      bySupplier,
      currentMonth: { count: currentMonthRows.length, total: sumAmount(currentMonthRows) },
      previousMonth: { count: prevMonthRows.length, total: sumAmount(prevMonthRows) },
      currentYear: { count: currentYearRows.length, total: sumAmount(currentYearRows) },
    };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/modules/expenses/__tests__/expenses.service.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/expenses/expenses.service.ts backend/src/modules/expenses/__tests__/expenses.service.test.ts
git commit -m "feat(expenses): add currentMonth/previousMonth/currentYear period cards to stats endpoint"
```

---

## Task 6: Verify Reports & Export Billing Period Coverage

**Files:** Read-only verification — no changes unless a gap is found.

- [ ] **Step 1: Verify invoices report billing period**

Open `backend/src/modules/reports/reports.service.ts`. Locate the `invoices()` method.

Confirm this column exists:
```typescript
{ header: 'شهر الحساب', key: 'billingPeriod', width: 18 },
```
And this row mapping:
```typescript
billingPeriod: i.billingMonth && i.billingYear
  ? `${ARABIC_MONTHS_RPT[(i.billingMonth as number) - 1]} ${i.billingYear}`
  : dateAr(i.issueDate),
```

✅ **Verified — invoices report already includes billing period. No change required.**

- [ ] **Step 2: Verify expenses report billing period**

Open the `expenses()` method in the same file. Note the column list:

```
code, category, description, supplier, contract, amount, date, status
```

**Finding:** The expenses report does NOT include a billing period column. The `date` column shows the expense date, not the billing period. This is a gap, but not a regression — it was never there. Per the backend-pass rule ("do not modify unless broken"), this will be addressed in the **reports polish task of the frontend/reports pass**.

Document this in the final report as: "Expenses report missing billing period column — deferred to frontend pass Task 7."

- [ ] **Step 3: Verify frontend invoice Excel export billing period**

Open `frontend/src/pages/Invoices.tsx`. Locate `exportExcel()`.

Confirm:
```typescript
'شهر الحساب': r.billingMonth && r.billingYear
  ? `${ARABIC_MONTHS[Number(r.billingMonth) - 1]} ${r.billingYear}`
  : '',
```

✅ **Verified — invoice Excel export already includes billing period. No change required.**

- [ ] **Step 4: Verify frontend expense Excel export billing period**

Open `frontend/src/pages/Expenses.tsx`. Locate `exportExcel()`.

Confirm:
```typescript
'شهر الحساب': r.billingMonth && r.billingYear
  ? `${ARABIC_MONTHS[Number(r.billingMonth) - 1]} ${r.billingYear}`
  : (r.date ? String(r.date).slice(0, 10) : ''),
```

✅ **Verified — expense Excel export already includes billing period. No change required.**

- [ ] **Step 5: Document verification results (no commit needed)**

Note in implementation report:
- Invoice report: ✅ billing period column present
- Expense report: ⚠️ billing period column missing — deferred to frontend pass
- Invoice Excel export: ✅ billing period column present
- Expense Excel export: ✅ billing period column present

---

## Task 7: Full Backend Validation

**Files:** none (validation only)

- [ ] **Step 1: Prisma validate**

```bash
cd backend && npx prisma validate
```

Expected: `The schema at backend/prisma/schema.prisma is valid 🚀`

- [ ] **Step 2: Backend TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output (0 errors).

- [ ] **Step 3: Frontend TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no output (0 errors). (No frontend changes yet, but verifying no regressions.)

- [ ] **Step 4: Electron TypeScript check**

```bash
tsc -p electron/tsconfig.json --noEmit
```

Expected: no output (0 errors).

- [ ] **Step 5: Backend tests**

```bash
cd backend && npm test
```

Expected: all tests PASS, including new tests in tasks 2–5.

- [ ] **Step 6: Frontend tests (if any)**

```bash
cd frontend && npm test
```

Expected: PASS or "no test files found" — no regressions.

- [ ] **Step 7: Build backend**

```bash
npm run build:back
```

Expected: `backend/dist/` produced without errors.

- [ ] **Step 8: Build frontend**

```bash
npm run build:front
```

Expected: `frontend/dist/` produced without errors.

- [ ] **Step 9: Build Electron**

```bash
npm run electron:build
```

Expected: `electron-dist/` produced without errors.

- [ ] **Step 10: Final validation commit**

Only if all steps above pass:

```bash
git add -A
git status  # verify only expected files are staged
git commit -m "chore: backend pass validation — all tsc + tests + builds green"
```

---

## Final Report Template

After all tasks complete, produce a report with these sections:

```
## Backend Pass — Implementation Report

### Branch
feature/invoice-expenses-operations-pack

### Checkpoint Tag
pre-invoice-expenses-operations-pack

### Files Modified
- backend/src/modules/customers/customers.service.ts
- backend/src/modules/customers/__tests__/customers.service.test.ts
- backend/src/modules/suppliers/suppliers.service.ts
- backend/src/modules/suppliers/__tests__/suppliers.service.test.ts (created)
- backend/src/modules/equipment/equipment.service.ts
- backend/src/modules/equipment/__tests__/equipment.service.test.ts (created)
- backend/src/modules/expenses/expenses.service.ts
- backend/src/modules/expenses/__tests__/expenses.service.test.ts

### Smart Delete Guard Behavior
[Describe per-entity message format and trigger condition]

### Statistics Extension
[Describe period card keys, filter behavior, what they use (billingMonth+billingYear)]

### Reports/Export Verification
[List verified/deferred items]

### Employees Note
Employee removal is implemented as soft-delete (status = TERMINATED). No FK constraint is raised on employee removal, so rich conflict guard is not applicable.

### Validation Results
| Gate | Result |
|------|--------|
| prisma validate | PASS |
| backend tsc | PASS |
| frontend tsc | PASS |
| electron tsc | PASS |
| backend tests | PASS (N tests) |
| frontend tests | PASS |
| build:back | PASS |
| build:front | PASS |
| electron:build | PASS |

### Regression Risks
[List any unexpected findings]

### Production Readiness
NOT READY — backend pass complete, frontend pass pending. Awaiting Gemini review before frontend work begins.
```
