# Statement Center Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Statement Engine for Customer Statements and Supplier Statements, forming the foundation for future GL/Bank/Employee statements.

**Architecture:** A shared `StatementService` class in the shared services layer accepts entity type + filters, computes opening balance from transactions before the fromDate, fetches and merges debit/credit entries within range, and returns a structured `StatementResult` DTO with running balance. The module layer exposes REST endpoints for customers and suppliers; the frontend provides a two-tab Statements page with filter bar, summary cards, and a transaction table.

**Tech Stack:** Express · TypeScript · Prisma (SQLite) · ExcelJS · React · Axios · `downloadXlsx` utility

## Global Constraints

- Backend port: `127.0.0.1:48211`
- Path aliases: `@core/*`, `@modules/*`, `@config/*`, `@shared/*`
- Currency: Kuwaiti Dinar, **3 decimal places** (format `0.000`)
- All user-facing strings: **Arabic**
- Permission format: `module.action` — new module is `statements`
- Response wrapper: `successResponse` / `errorResponse` from `@core/utils/response`
- Module pattern: routes → controller → service → schema (Zod)
- Do **NOT** merge, push, or tag production
- Do **NOT** modify unrelated modules
- Do **NOT** add new npm packages
- Running balance formula (both entity types): `balance = openingBalance + debit - credit`
  - Customer: debit = invoice total; credit = payment received
  - Supplier: debit = payment made; credit = purchase invoice total + expense amount
- Opening balance: sum of all movements **before** `fromDate`. If no `fromDate`, openingBalance = 0 and all transactions are included.
- Sort entries by `date ASC` for running balance computation; frontend controls display order.

---

### Task 1: Backend — Types + Constants + Seed

**Files:**
- Modify: `backend/src/config/constants.ts`
- Create: `backend/src/shared/services/statement.types.ts`
- Modify: `backend/prisma/seed.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `StatementEntityType`, `StatementFilters`, `StatementReferenceType`, `StatementEntry`, `StatementSummary`, `StatementResult`, `StatementInput` — all consumed by Tasks 2, 4, 5

- [ ] **Step 1: Add 'statements' to MODULES in `constants.ts`**

Open `backend/src/config/constants.ts`. Find the `MODULES` array (line ~31). Add `'statements'` after `'forms'`:

```typescript
export const MODULES = [
  'dashboard',
  'customers',
  'employees',
  'attendance',
  'payroll',
  'equipment',
  'maintenance',
  'contracts',
  'invoices',
  'suppliers',
  'expenses',
  'transactions',
  'reports',
  'users',
  'roles',
  'audit',
  'backups',
  'settings',
  'inventory',
  'cheques',
  'import',
  'prices',
  'forms',
  'statements',   // ← add this line
] as const;
```

- [ ] **Step 2: Create `statement.types.ts`**

Create `backend/src/shared/services/statement.types.ts`:

```typescript
export type StatementEntityType = 'CUSTOMER' | 'SUPPLIER';

export type StatementReferenceType = 'INVOICE' | 'PAYMENT' | 'EXPENSE';

export interface StatementFilters {
  fromDate?: Date;
  toDate?: Date;
  search?: string;
  status?: string;
  referenceType?: StatementReferenceType;
}

export interface StatementEntry {
  /** Unique identifier for this row: e.g. 'INVOICE-42', 'PAYMENT-7', 'EXPENSE-15' */
  id: string;
  date: Date;
  /** Human-readable reference: invoice number, expense code, or 'PMNT-{id}' */
  reference: string;
  referenceType: StatementReferenceType;
  referenceId: number;
  description: string;
  /** Amount that INCREASES the outstanding balance (Customer: invoice total; Supplier: payment made) */
  debit: number;
  /** Amount that DECREASES the outstanding balance (Customer: payment received; Supplier: invoice/expense) */
  credit: number;
  /** Computed: openingBalance + sum(debit) - sum(credit) up to and including this row */
  runningBalance: number;
  status: string;
  entityName: string;
  entityCode: string;
}

export interface StatementSummary {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  transactionCount: number;
}

export interface StatementResult {
  entityId: number;
  entityType: StatementEntityType;
  entityName: string;
  entityCode: string;
  fromDate?: Date;
  toDate?: Date;
  openingBalance: number;
  entries: StatementEntry[];
  summary: StatementSummary;
}

export interface StatementInput {
  entityType: StatementEntityType;
  entityId: number;
  filters: StatementFilters;
}
```

- [ ] **Step 3: Update `seed.ts` — add statements to MODULE_ACTIONS**

Open `backend/prisma/seed.ts`. Find the `MODULE_ACTIONS` object. Add `statements` after `forms`:

```typescript
const MODULE_ACTIONS: Record<string, string[]> = {
  // ... existing entries ...
  forms: ['read', 'create', 'print'],
  statements: ['read', 'export'],   // ← add this line
};
```

- [ ] **Step 4: Update `seed.ts` — add statements permissions to roles**

In the `rolePermissionMap`, add `statements` permissions to the relevant roles:

```typescript
const rolePermissionMap: Record<string, string[]> = {
  SYSTEM_ADMIN: allKeys,
  GENERAL_MANAGER: allKeys.filter(
    (k) => !k.startsWith('users.') && k !== 'settings.update',
  ),
  ACCOUNTANT: [
    ...keysForModules(['invoices', 'expenses', 'transactions', 'suppliers', 'reports', 'customers', 'cheques', 'statements']),
    // ... existing rest ...
  ],
  PROJECT_MANAGER: [
    ...keysForModules(['contracts', 'prices', 'reports']),
    'statements.read',   // ← add
    // ... existing rest ...
  ],
  // EQUIPMENT_MANAGER, HR_MANAGER, STANDARD_USER: no statements access
};
```

Find the ACCOUNTANT entry in the rolePermissionMap and add `'statements'` to the `keysForModules([...])` call. Find PROJECT_MANAGER and add `'statements.read'` to its array.

- [ ] **Step 5: TypeScript validation**

```bash
cd backend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/config/constants.ts \
        backend/src/shared/services/statement.types.ts \
        backend/prisma/seed.ts
git commit -m "feat(statements): add types, constants, and seed permissions"
```

---

### Task 2: Backend — Statement Engine Service

**Files:**
- Create: `backend/src/shared/services/statement.service.ts`

**Interfaces:**
- Consumes: `StatementInput`, `StatementResult`, `StatementEntry`, `StatementFilters` from `statement.types.ts` (Task 1); `prisma` from `@config/database`
- Produces: `buildStatement(input: StatementInput): Promise<StatementResult>` — consumed by Task 4 controller

- [ ] **Step 1: Create `statement.service.ts`**

Create `backend/src/shared/services/statement.service.ts`:

```typescript
import prisma from '@config/database';
import type {
  StatementInput,
  StatementResult,
  StatementEntry,
  StatementFilters,
  StatementEntityType,
} from './statement.types';

export async function buildStatement(input: StatementInput): Promise<StatementResult> {
  const { entityType, entityId, filters } = input;
  if (entityType === 'CUSTOMER') return buildCustomerStatement(entityId, filters);
  if (entityType === 'SUPPLIER') return buildSupplierStatement(entityId, filters);
  throw new Error(`Unsupported entity type: ${entityType}`);
}

// ─── Customer Statement ───────────────────────────────────────────────────────

async function buildCustomerStatement(
  entityId: number,
  filters: StatementFilters,
): Promise<StatementResult> {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: entityId },
    select: { name: true, code: true },
  });

  const openingBalance = filters.fromDate
    ? await calcCustomerOpeningBalance(entityId, filters.fromDate)
    : 0;

  const dateWhere = buildDateWhere(filters.fromDate, filters.toDate);

  // Sales invoices in range (debit — customer owes us)
  const invoices = await prisma.invoice.findMany({
    where: {
      customerId: entityId,
      direction: 'SALES',
      status: { not: 'CANCELLED' },
      issueDate: dateWhere,
    },
    orderBy: { issueDate: 'asc' },
  });

  // Payments on sales invoices in range (credit — customer paid us)
  const payments = await prisma.payment.findMany({
    where: {
      invoice: { customerId: entityId, direction: 'SALES' },
      date: dateWhere,
    },
    include: { invoice: { select: { invoiceNumber: true } } },
    orderBy: { date: 'asc' },
  });

  const rawEntries: Omit<StatementEntry, 'runningBalance'>[] = [
    ...invoices.map((inv) => ({
      id: `INVOICE-${inv.id}`,
      date: inv.issueDate,
      reference: inv.invoiceNumber,
      referenceType: 'INVOICE' as const,
      referenceId: inv.id,
      description: `فاتورة مبيعات${inv.notes ? ` — ${inv.notes}` : ''}`,
      debit: Number(inv.total),
      credit: 0,
      status: inv.status,
      entityName: customer.name,
      entityCode: customer.code,
    })),
    ...payments.map((pmt) => ({
      id: `PAYMENT-${pmt.id}`,
      date: pmt.date,
      reference: pmt.reference ?? `PMNT-${pmt.id}`,
      referenceType: 'PAYMENT' as const,
      referenceId: pmt.id,
      description: `دفعة على ${pmt.invoice.invoiceNumber}${pmt.notes ? ` — ${pmt.notes}` : ''}`,
      debit: 0,
      credit: Number(pmt.amount),
      status: 'PAID',
      entityName: customer.name,
      entityCode: customer.code,
    })),
  ];

  return assembleResult({
    entityId,
    entityType: 'CUSTOMER',
    entityName: customer.name,
    entityCode: customer.code,
    filters,
    openingBalance,
    rawEntries,
  });
}

async function calcCustomerOpeningBalance(entityId: number, before: Date): Promise<number> {
  const [invAgg, pmtAgg] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        customerId: entityId,
        direction: 'SALES',
        status: { not: 'CANCELLED' },
        issueDate: { lt: before },
      },
      _sum: { total: true },
    }),
    prisma.payment.aggregate({
      where: {
        invoice: { customerId: entityId, direction: 'SALES' },
        date: { lt: before },
      },
      _sum: { amount: true },
    }),
  ]);
  return Number(invAgg._sum.total ?? 0) - Number(pmtAgg._sum.amount ?? 0);
}

// ─── Supplier Statement ───────────────────────────────────────────────────────

async function buildSupplierStatement(
  entityId: number,
  filters: StatementFilters,
): Promise<StatementResult> {
  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { id: entityId },
    select: { name: true, code: true },
  });

  const openingBalance = filters.fromDate
    ? await calcSupplierOpeningBalance(entityId, filters.fromDate)
    : 0;

  const dateWhere = buildDateWhere(filters.fromDate, filters.toDate);

  // Purchase invoices in range (credit — we owe supplier)
  const purchaseInvoices = await prisma.invoice.findMany({
    where: {
      supplierId: entityId,
      direction: 'PURCHASE',
      status: { not: 'CANCELLED' },
      issueDate: dateWhere,
    },
    orderBy: { issueDate: 'asc' },
  });

  // Expenses for this supplier in range (credit — we owe supplier)
  const expenses = await prisma.expense.findMany({
    where: {
      supplierId: entityId,
      status: { notIn: ['CANCELLED', 'REVERSED'] },
      date: dateWhere,
    },
    orderBy: { date: 'asc' },
  });

  // Payments on purchase invoices in range (debit — we paid supplier)
  const payments = await prisma.payment.findMany({
    where: {
      invoice: { supplierId: entityId, direction: 'PURCHASE' },
      date: dateWhere,
    },
    include: { invoice: { select: { invoiceNumber: true } } },
    orderBy: { date: 'asc' },
  });

  const rawEntries: Omit<StatementEntry, 'runningBalance'>[] = [
    ...purchaseInvoices.map((inv) => ({
      id: `INVOICE-${inv.id}`,
      date: inv.issueDate,
      reference: inv.invoiceNumber,
      referenceType: 'INVOICE' as const,
      referenceId: inv.id,
      description: `فاتورة مشتريات${inv.notes ? ` — ${inv.notes}` : ''}`,
      debit: 0,
      credit: Number(inv.total),
      status: inv.status,
      entityName: supplier.name,
      entityCode: supplier.code,
    })),
    ...expenses.map((exp) => ({
      id: `EXPENSE-${exp.id}`,
      date: exp.date,
      reference: exp.code,
      referenceType: 'EXPENSE' as const,
      referenceId: exp.id,
      description: exp.description,
      debit: 0,
      credit: Number(exp.amount),
      status: exp.status,
      entityName: supplier.name,
      entityCode: supplier.code,
    })),
    ...payments.map((pmt) => ({
      id: `PAYMENT-${pmt.id}`,
      date: pmt.date,
      reference: pmt.reference ?? `PMNT-${pmt.id}`,
      referenceType: 'PAYMENT' as const,
      referenceId: pmt.id,
      description: `دفعة على ${pmt.invoice.invoiceNumber}${pmt.notes ? ` — ${pmt.notes}` : ''}`,
      debit: Number(pmt.amount),
      credit: 0,
      status: 'PAID',
      entityName: supplier.name,
      entityCode: supplier.code,
    })),
  ];

  return assembleResult({
    entityId,
    entityType: 'SUPPLIER',
    entityName: supplier.name,
    entityCode: supplier.code,
    filters,
    openingBalance,
    rawEntries,
  });
}

async function calcSupplierOpeningBalance(entityId: number, before: Date): Promise<number> {
  const [invAgg, expAgg, pmtAgg] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        supplierId: entityId,
        direction: 'PURCHASE',
        status: { not: 'CANCELLED' },
        issueDate: { lt: before },
      },
      _sum: { total: true },
    }),
    prisma.expense.aggregate({
      where: {
        supplierId: entityId,
        status: { notIn: ['CANCELLED', 'REVERSED'] },
        date: { lt: before },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        invoice: { supplierId: entityId, direction: 'PURCHASE' },
        date: { lt: before },
      },
      _sum: { amount: true },
    }),
  ]);
  return (
    Number(invAgg._sum.total ?? 0) +
    Number(expAgg._sum.amount ?? 0) -
    Number(pmtAgg._sum.amount ?? 0)
  );
}

// ─── Shared Assembly ──────────────────────────────────────────────────────────

interface AssembleInput {
  entityId: number;
  entityType: StatementEntityType;
  entityName: string;
  entityCode: string;
  filters: StatementFilters;
  openingBalance: number;
  rawEntries: Omit<StatementEntry, 'runningBalance'>[];
}

function assembleResult(input: AssembleInput): StatementResult {
  const { entityId, entityType, entityName, entityCode, filters, openingBalance, rawEntries } = input;

  // Sort chronologically for running balance
  const sorted = [...rawEntries].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Apply filters
  let filtered = sorted;
  if (filters.referenceType) {
    filtered = filtered.filter((e) => e.referenceType === filters.referenceType);
  }
  if (filters.status) {
    filtered = filtered.filter((e) => e.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.reference.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q),
    );
  }

  // Compute running balance
  let balance = openingBalance;
  const entries: StatementEntry[] = filtered.map((e) => {
    balance = balance + e.debit - e.credit;
    return { ...e, runningBalance: balance };
  });

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const closingBalance = openingBalance + totalDebit - totalCredit;

  return {
    entityId,
    entityType,
    entityName,
    entityCode,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    openingBalance,
    entries,
    summary: {
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance,
      transactionCount: entries.length,
    },
  };
}

function buildDateWhere(from?: Date, to?: Date): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const w: { gte?: Date; lte?: Date } = {};
  if (from) w.gte = from;
  if (to) w.lte = to;
  return w;
}
```

- [ ] **Step 2: TypeScript validation**

```bash
cd backend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/services/statement.service.ts
git commit -m "feat(statements): add Statement Engine service"
```

---

### Task 3: Backend — Unit Tests

**Files:**
- Create: `backend/src/shared/services/__tests__/statement.service.test.ts`

**Interfaces:**
- Consumes: `buildStatement` from `statement.service.ts` (Task 2); `StatementInput` from `statement.types.ts` (Task 1)
- Produces: test coverage for opening balance, running balance, customer/supplier logic, filtering, empty state, date filtering

- [ ] **Step 1: Write tests**

Create `backend/src/shared/services/__tests__/statement.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStatement } from '../statement.service';
import type { StatementInput } from '../statement.types';

vi.mock('@config/database', () => ({
  default: {
    customer: { findUniqueOrThrow: vi.fn() },
    supplier: { findUniqueOrThrow: vi.fn() },
    invoice: { findMany: vi.fn(), aggregate: vi.fn() },
    expense: { findMany: vi.fn(), aggregate: vi.fn() },
    payment: { findMany: vi.fn(), aggregate: vi.fn() },
  },
}));

import prisma from '@config/database';

const mockCustomer = { name: 'شركة الاختبار', code: 'CUST-001' };
const mockSupplier = { name: 'مورد الاختبار', code: 'SUPP-001' };

function makeDate(y: number, m: number, d: number) {
  return new Date(y, m - 1, d);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Customer Statement ────────────────────────────────────────────────────────

describe('Customer Statement', () => {
  it('returns empty statement when no transactions', async () => {
    (prisma.customer.findUniqueOrThrow as any).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as any).mockResolvedValue([]);
    (prisma.invoice.aggregate as any).mockResolvedValue({ _sum: { total: null } });
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (prisma.payment.aggregate as any).mockResolvedValue({ _sum: { amount: null } });

    const input: StatementInput = {
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: {},
    };
    const result = await buildStatement(input);

    expect(result.entries).toHaveLength(0);
    expect(result.openingBalance).toBe(0);
    expect(result.summary.closingBalance).toBe(0);
    expect(result.summary.transactionCount).toBe(0);
  });

  it('includes sales invoices as debit and payments as credit', async () => {
    (prisma.customer.findUniqueOrThrow as any).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as any).mockResolvedValue([
      {
        id: 1,
        invoiceNumber: 'MN-INV-2026-001',
        issueDate: makeDate(2026, 1, 10),
        total: 1000,
        status: 'UNPAID',
        notes: null,
      },
    ]);
    (prisma.payment.findMany as any).mockResolvedValue([
      {
        id: 1,
        date: makeDate(2026, 1, 20),
        amount: 400,
        reference: 'REC-001',
        notes: null,
        invoice: { invoiceNumber: 'MN-INV-2026-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: {},
    });

    expect(result.entries).toHaveLength(2);

    const invEntry = result.entries.find((e) => e.referenceType === 'INVOICE');
    expect(invEntry).toBeDefined();
    expect(invEntry!.debit).toBe(1000);
    expect(invEntry!.credit).toBe(0);

    const pmtEntry = result.entries.find((e) => e.referenceType === 'PAYMENT');
    expect(pmtEntry).toBeDefined();
    expect(pmtEntry!.debit).toBe(0);
    expect(pmtEntry!.credit).toBe(400);
  });

  it('computes running balance correctly', async () => {
    (prisma.customer.findUniqueOrThrow as any).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as any).mockResolvedValue([
      { id: 1, invoiceNumber: 'INV-001', issueDate: makeDate(2026, 1, 1), total: 500, status: 'PARTIAL', notes: null },
      { id: 2, invoiceNumber: 'INV-002', issueDate: makeDate(2026, 1, 5), total: 300, status: 'UNPAID', notes: null },
    ]);
    (prisma.payment.findMany as any).mockResolvedValue([
      {
        id: 1, date: makeDate(2026, 1, 3), amount: 200, reference: null, notes: null,
        invoice: { invoiceNumber: 'INV-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: {},
    });

    // Sorted by date: INV-001 (Jan 1), PMT (Jan 3), INV-002 (Jan 5)
    // Balance: 0 + 500 = 500, 500 - 200 = 300, 300 + 300 = 600
    expect(result.entries[0].runningBalance).toBe(500);
    expect(result.entries[1].runningBalance).toBe(300);
    expect(result.entries[2].runningBalance).toBe(600);
    expect(result.summary.closingBalance).toBe(600);
  });

  it('computes opening balance from transactions before fromDate', async () => {
    (prisma.customer.findUniqueOrThrow as any).mockResolvedValue(mockCustomer);
    // Before fromDate: 1000 invoice - 400 payment = 600 opening
    (prisma.invoice.aggregate as any).mockResolvedValue({ _sum: { total: 1000 } });
    (prisma.payment.aggregate as any).mockResolvedValue({ _sum: { amount: 400 } });
    // In range: one invoice
    (prisma.invoice.findMany as any).mockResolvedValue([
      { id: 2, invoiceNumber: 'INV-002', issueDate: makeDate(2026, 2, 5), total: 200, status: 'UNPAID', notes: null },
    ]);
    (prisma.payment.findMany as any).mockResolvedValue([]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: { fromDate: makeDate(2026, 2, 1) },
    });

    expect(result.openingBalance).toBe(600);
    expect(result.entries[0].runningBalance).toBe(800); // 600 + 200
    expect(result.summary.closingBalance).toBe(800);
  });

  it('excludes entries outside date range', async () => {
    (prisma.customer.findUniqueOrThrow as any).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as any).mockResolvedValue([]);
    (prisma.payment.findMany as any).mockResolvedValue([]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: { fromDate: makeDate(2026, 3, 1), toDate: makeDate(2026, 3, 31) },
    });

    expect(result.entries).toHaveLength(0);
  });

  it('filters by referenceType', async () => {
    (prisma.customer.findUniqueOrThrow as any).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as any).mockResolvedValue([
      { id: 1, invoiceNumber: 'INV-001', issueDate: makeDate(2026, 1, 1), total: 500, status: 'PARTIAL', notes: null },
    ]);
    (prisma.payment.findMany as any).mockResolvedValue([
      {
        id: 1, date: makeDate(2026, 1, 5), amount: 200, reference: null, notes: null,
        invoice: { invoiceNumber: 'INV-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: { referenceType: 'INVOICE' },
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].referenceType).toBe('INVOICE');
  });

  it('returns correct summary totals', async () => {
    (prisma.customer.findUniqueOrThrow as any).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as any).mockResolvedValue([
      { id: 1, invoiceNumber: 'INV-001', issueDate: makeDate(2026, 1, 1), total: 1000, status: 'PARTIAL', notes: null },
    ]);
    (prisma.payment.findMany as any).mockResolvedValue([
      {
        id: 1, date: makeDate(2026, 1, 5), amount: 300, reference: null, notes: null,
        invoice: { invoiceNumber: 'INV-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: {},
    });

    expect(result.summary.totalDebit).toBe(1000);
    expect(result.summary.totalCredit).toBe(300);
    expect(result.summary.closingBalance).toBe(700);
    expect(result.summary.transactionCount).toBe(2);
  });
});

// ─── Supplier Statement ────────────────────────────────────────────────────────

describe('Supplier Statement', () => {
  it('includes purchase invoices and expenses as credit, payments as debit', async () => {
    (prisma.supplier.findUniqueOrThrow as any).mockResolvedValue(mockSupplier);
    (prisma.invoice.findMany as any).mockResolvedValue([
      { id: 10, invoiceNumber: 'PO-001', issueDate: makeDate(2026, 1, 5), total: 800, status: 'UNPAID', notes: null },
    ]);
    (prisma.expense.findMany as any).mockResolvedValue([
      { id: 5, code: 'EXP-005', date: makeDate(2026, 1, 8), amount: 200, description: 'وقود', status: 'APPROVED' },
    ]);
    (prisma.payment.findMany as any).mockResolvedValue([
      {
        id: 3, date: makeDate(2026, 1, 15), amount: 500, reference: null, notes: null,
        invoice: { invoiceNumber: 'PO-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId: 1,
      filters: {},
    });

    const invEntry = result.entries.find((e) => e.referenceType === 'INVOICE');
    expect(invEntry!.debit).toBe(0);
    expect(invEntry!.credit).toBe(800);

    const expEntry = result.entries.find((e) => e.referenceType === 'EXPENSE');
    expect(expEntry!.debit).toBe(0);
    expect(expEntry!.credit).toBe(200);

    const pmtEntry = result.entries.find((e) => e.referenceType === 'PAYMENT');
    expect(pmtEntry!.debit).toBe(500);
    expect(pmtEntry!.credit).toBe(0);
  });

  it('computes supplier opening balance: invoices + expenses - payments before fromDate', async () => {
    (prisma.supplier.findUniqueOrThrow as any).mockResolvedValue(mockSupplier);
    // Before fromDate: 1000 invoice + 200 expense - 300 payment = 900 opening
    (prisma.invoice.aggregate as any).mockResolvedValue({ _sum: { total: 1000 } });
    (prisma.expense.aggregate as any).mockResolvedValue({ _sum: { amount: 200 } });
    (prisma.payment.aggregate as any).mockResolvedValue({ _sum: { amount: 300 } });
    (prisma.invoice.findMany as any).mockResolvedValue([]);
    (prisma.expense.findMany as any).mockResolvedValue([]);
    (prisma.payment.findMany as any).mockResolvedValue([]);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId: 1,
      filters: { fromDate: makeDate(2026, 3, 1) },
    });

    expect(result.openingBalance).toBe(900);
  });

  it('supplier running balance decreases with payments', async () => {
    (prisma.supplier.findUniqueOrThrow as any).mockResolvedValue(mockSupplier);
    (prisma.invoice.findMany as any).mockResolvedValue([
      { id: 1, invoiceNumber: 'PO-001', issueDate: makeDate(2026, 1, 1), total: 600, status: 'UNPAID', notes: null },
    ]);
    (prisma.expense.findMany as any).mockResolvedValue([]);
    (prisma.payment.findMany as any).mockResolvedValue([
      {
        id: 1, date: makeDate(2026, 1, 10), amount: 250, reference: null, notes: null,
        invoice: { invoiceNumber: 'PO-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId: 1,
      filters: {},
    });

    // Sorted: Invoice (Jan 1) credit 600 → balance 600; Payment (Jan 10) debit 250 → balance 350
    expect(result.entries[0].runningBalance).toBe(600); // after invoice (credit 600)
    expect(result.entries[1].runningBalance).toBe(350); // after payment (debit 250)
    expect(result.summary.closingBalance).toBe(350);
  });
});

// ─── Error Handling ────────────────────────────────────────────────────────────

describe('Error handling', () => {
  it('throws for unsupported entity type', async () => {
    await expect(
      buildStatement({ entityType: 'UNKNOWN' as any, entityId: 1, filters: {} }),
    ).rejects.toThrow('Unsupported entity type');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd backend && npm test -- --reporter=verbose src/shared/services/__tests__/statement.service.test.ts
```

Expected: All tests pass (approximately 11 tests).

- [ ] **Step 3: Run full backend test suite to check for regressions**

```bash
cd backend && npm test
```

Expected: All tests pass (617+ tests).

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/services/__tests__/statement.service.test.ts
git commit -m "test(statements): add unit tests for Statement Engine"
```

---

### Task 4: Backend — Controller + Routes + Schema + app.ts

**Files:**
- Create: `backend/src/modules/statements/statements.schema.ts`
- Create: `backend/src/modules/statements/statements.controller.ts`
- Create: `backend/src/modules/statements/statements.routes.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `buildStatement` from Task 2; Zod schemas for query validation; `buildExcel` from `@shared/services/reportEngine/excel.service`; `authenticate` from `@core/middleware/auth.middleware`; `requirePermission` from `@core/middleware/rbac.middleware`; `asyncHandler` from `@core/utils/asyncHandler`; `successResponse` / `errorResponse` from `@core/utils/response`
- Produces: REST endpoints `/api/statements/customers/:id`, `/api/statements/suppliers/:id`, `/api/statements/customers/:id/export`, `/api/statements/suppliers/:id/export`

- [ ] **Step 1: Create `statements.schema.ts`**

Create `backend/src/modules/statements/statements.schema.ts`:

```typescript
import { z } from 'zod';

export const StatementQuerySchema = z.object({
  fromDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  toDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  search: z.string().optional(),
  status: z.string().optional(),
  referenceType: z.enum(['INVOICE', 'PAYMENT', 'EXPENSE']).optional(),
});

export type StatementQuery = z.infer<typeof StatementQuerySchema>;

export function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}
```

- [ ] **Step 2: Create `statements.controller.ts`**

Create `backend/src/modules/statements/statements.controller.ts`:

```typescript
import type { Request, Response } from 'express';
import { buildStatement } from '@shared/services/statement.service';
import { buildExcel } from '@shared/services/reportEngine/excel.service';
import { successResponse } from '@core/utils/response';
import { StatementQuerySchema, parseDate } from './statements.schema';

const formatKwd = (n: number) => Number(n.toFixed(3));

export const statementsController = {
  async getCustomerStatement(req: Request, res: Response): Promise<void> {
    const entityId = Number(req.params.id);
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId,
      filters: {
        fromDate: parseDate(query.fromDate),
        toDate: parseDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    successResponse(res, result);
  },

  async getSupplierStatement(req: Request, res: Response): Promise<void> {
    const entityId = Number(req.params.id);
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId,
      filters: {
        fromDate: parseDate(query.fromDate),
        toDate: parseDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    successResponse(res, result);
  },

  async exportCustomerStatement(req: Request, res: Response): Promise<void> {
    const entityId = Number(req.params.id);
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId,
      filters: {
        fromDate: parseDate(query.fromDate),
        toDate: parseDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    const title = `كشف حساب العميل — ${result.entityName}`;
    const buf = await buildExcel({
      title,
      columns: [
        { header: 'التاريخ', key: 'date', width: 14 },
        { header: 'المرجع', key: 'reference', width: 20 },
        { header: 'النوع', key: 'referenceTypeAr', width: 14 },
        { header: 'البيان', key: 'description', width: 30 },
        { header: 'مدين', key: 'debit', width: 14, numFmt: '#,##0.000' },
        { header: 'دائن', key: 'credit', width: 14, numFmt: '#,##0.000' },
        { header: 'الرصيد', key: 'runningBalance', width: 14, numFmt: '#,##0.000' },
        { header: 'الحالة', key: 'status', width: 14 },
      ],
      rows: result.entries.map((e) => ({
        date: e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date),
        reference: e.reference,
        referenceTypeAr: refTypeAr(e.referenceType),
        description: e.description,
        debit: formatKwd(e.debit),
        credit: formatKwd(e.credit),
        runningBalance: formatKwd(e.runningBalance),
        status: e.status,
      })),
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="statement-customer-${entityId}.xlsx"`);
    res.end(buf);
  },

  async exportSupplierStatement(req: Request, res: Response): Promise<void> {
    const entityId = Number(req.params.id);
    const query = StatementQuerySchema.parse(req.query);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId,
      filters: {
        fromDate: parseDate(query.fromDate),
        toDate: parseDate(query.toDate),
        search: query.search,
        status: query.status,
        referenceType: query.referenceType,
      },
    });

    const title = `كشف حساب المورد — ${result.entityName}`;
    const buf = await buildExcel({
      title,
      columns: [
        { header: 'التاريخ', key: 'date', width: 14 },
        { header: 'المرجع', key: 'reference', width: 20 },
        { header: 'النوع', key: 'referenceTypeAr', width: 14 },
        { header: 'البيان', key: 'description', width: 30 },
        { header: 'مدين', key: 'debit', width: 14, numFmt: '#,##0.000' },
        { header: 'دائن', key: 'credit', width: 14, numFmt: '#,##0.000' },
        { header: 'الرصيد', key: 'runningBalance', width: 14, numFmt: '#,##0.000' },
        { header: 'الحالة', key: 'status', width: 14 },
      ],
      rows: result.entries.map((e) => ({
        date: e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date),
        reference: e.reference,
        referenceTypeAr: refTypeAr(e.referenceType),
        description: e.description,
        debit: formatKwd(e.debit),
        credit: formatKwd(e.credit),
        runningBalance: formatKwd(e.runningBalance),
        status: e.status,
      })),
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="statement-supplier-${entityId}.xlsx"`);
    res.end(buf);
  },
};

function refTypeAr(type: string): string {
  if (type === 'INVOICE') return 'فاتورة';
  if (type === 'PAYMENT') return 'دفعة';
  if (type === 'EXPENSE') return 'مصروف';
  return type;
}
```

- [ ] **Step 3: Create `statements.routes.ts`**

Create `backend/src/modules/statements/statements.routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { statementsController } from './statements.controller';

const router = Router();
router.use(authenticate);

router.get('/customers/:id', requirePermission('statements.read'), asyncHandler(statementsController.getCustomerStatement));
router.get('/suppliers/:id', requirePermission('statements.read'), asyncHandler(statementsController.getSupplierStatement));
router.get('/customers/:id/export', requirePermission('statements.export'), asyncHandler(statementsController.exportCustomerStatement));
router.get('/suppliers/:id/export', requirePermission('statements.export'), asyncHandler(statementsController.exportSupplierStatement));

export default router;
```

- [ ] **Step 4: Register in `app.ts`**

Open `backend/src/app.ts`. After the last import (near the approval-history import), add:

```typescript
import statementsRoutes from './modules/statements/statements.routes';
```

After the last `app.use(...)` registration, add:

```typescript
  app.use('/api/statements', statementsRoutes);
```

- [ ] **Step 5: TypeScript validation**

```bash
cd backend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 6: Build validation**

```bash
npm run build:back
```

Expected: Build succeeds.

- [ ] **Step 7: Run all backend tests**

```bash
cd backend && npm test
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/statements/statements.schema.ts \
        backend/src/modules/statements/statements.controller.ts \
        backend/src/modules/statements/statements.routes.ts \
        backend/src/app.ts
git commit -m "feat(statements): add REST API endpoints for customer/supplier statements"
```

---

### Task 5: Frontend — API Client

**Files:**
- Create: `frontend/src/api/statements.ts`

**Interfaces:**
- Consumes: `api` (axios instance) from `../api/client`
- Produces: `StatementEntry`, `StatementSummary`, `StatementResult`, `StatementFilters`, `statementsApi` — consumed by Task 6

- [ ] **Step 1: Create `frontend/src/api/statements.ts`**

Create `frontend/src/api/statements.ts`:

```typescript
import api from './client';
import { downloadBlob } from '../utils/exportUtils';

export type StatementReferenceType = 'INVOICE' | 'PAYMENT' | 'EXPENSE';

export interface StatementEntry {
  id: string;
  date: string;
  reference: string;
  referenceType: StatementReferenceType;
  referenceId: number;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
  entityName: string;
  entityCode: string;
}

export interface StatementSummary {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  transactionCount: number;
}

export interface StatementResult {
  entityId: number;
  entityType: 'CUSTOMER' | 'SUPPLIER';
  entityName: string;
  entityCode: string;
  fromDate?: string;
  toDate?: string;
  openingBalance: number;
  entries: StatementEntry[];
  summary: StatementSummary;
}

export interface StatementFilters {
  fromDate?: string;
  toDate?: string;
  search?: string;
  status?: string;
  referenceType?: StatementReferenceType;
}

export const statementsApi = {
  async getCustomerStatement(entityId: number, filters: StatementFilters = {}): Promise<StatementResult> {
    const res = await api.get(`/statements/customers/${entityId}`, { params: cleanFilters(filters) });
    return res.data.data as StatementResult;
  },

  async getSupplierStatement(entityId: number, filters: StatementFilters = {}): Promise<StatementResult> {
    const res = await api.get(`/statements/suppliers/${entityId}`, { params: cleanFilters(filters) });
    return res.data.data as StatementResult;
  },

  async exportCustomer(entityId: number, filters: StatementFilters = {}, entityName: string): Promise<void> {
    const res = await api.get(`/statements/customers/${entityId}/export`, {
      params: cleanFilters(filters),
      responseType: 'blob',
    });
    downloadBlob(
      new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `statement-${entityName}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  },

  async exportSupplier(entityId: number, filters: StatementFilters = {}, entityName: string): Promise<void> {
    const res = await api.get(`/statements/suppliers/${entityId}/export`, {
      params: cleanFilters(filters),
      responseType: 'blob',
    });
    downloadBlob(
      new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `statement-${entityName}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  },
};

function cleanFilters(filters: StatementFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
  ) as Record<string, string>;
}
```

- [ ] **Step 2: TypeScript validation**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/statements.ts
git commit -m "feat(statements): add frontend API client for statements"
```

---

### Task 6: Frontend — Statements Page + Routing + Navigation

**Files:**
- Create: `frontend/src/pages/Statements.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: `statementsApi`, `StatementResult`, `StatementEntry`, `StatementFilters` from Task 5; `/api/customers`, `/api/suppliers` for entity picker
- Produces: `/statements` route with two tabs (customers/suppliers), filter bar, summary cards, transaction table

- [ ] **Step 1: Create `frontend/src/pages/Statements.tsx`**

Create `frontend/src/pages/Statements.tsx`:

```tsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { statementsApi, type StatementResult, type StatementFilters, type StatementEntry } from '../api/statements';
import { downloadBlob } from '../utils/exportUtils';

// ─── Status translations ───────────────────────────────────────────────────────
const STATUS_AR: Record<string, string> = {
  UNPAID: 'غير مسدد',
  PARTIAL: 'مسدد جزئياً',
  PAID: 'مسدد',
  OVERDUE: 'متأخر',
  CANCELLED: 'ملغى',
  PENDING: 'قيد الانتظار',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  REVERSED: 'مسترجع',
};

const REF_TYPE_AR: Record<string, string> = {
  INVOICE: 'فاتورة',
  PAYMENT: 'دفعة',
  EXPENSE: 'مصروف',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const kwd = (n: number) =>
  n.toLocaleString('ar-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const dateText = (d: string | Date) => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('ar-KW', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface EntityOption { id: number; name: string; code: string; }

type TabKey = 'customers' | 'suppliers';

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Statements() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('customers');

  return (
    <div style={{ padding: '0 24px 24px', direction: 'rtl' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 20px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#1d4e6f' }}>
          account_balance_wallet
        </span>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1d4e6f' }}>
          مركز كشف الحساب
        </h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
        {(['customers', 'suppliers'] as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #1d4e6f' : '2px solid transparent',
              marginBottom: -2,
              background: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.95rem',
              fontWeight: activeTab === tab ? 700 : 400,
              color: activeTab === tab ? '#1d4e6f' : '#6b7280',
              transition: 'all 0.15s',
            }}
          >
            {tab === 'customers' ? 'كشف حساب العملاء' : 'كشف حساب الموردين'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'customers' && (
        <StatementTab
          entityType="customers"
          apiUrl="/customers"
          label="العميل"
          fetchStatement={(id, filters) => statementsApi.getCustomerStatement(id, filters)}
          exportStatement={(id, filters, name) => statementsApi.exportCustomer(id, filters, name)}
          onClickInvoice={(id) => navigate(`/invoices/${id}/preview`)}
          onClickExpense={() => {/* future */}}
        />
      )}
      {activeTab === 'suppliers' && (
        <StatementTab
          entityType="suppliers"
          apiUrl="/suppliers"
          label="المورد"
          fetchStatement={(id, filters) => statementsApi.getSupplierStatement(id, filters)}
          exportStatement={(id, filters, name) => statementsApi.exportSupplier(id, filters, name)}
          onClickInvoice={(id) => navigate(`/invoices/${id}/preview`)}
          onClickExpense={(id) => navigate(`/expenses?highlight=${id}`)}
        />
      )}
    </div>
  );
}

// ─── StatementTab ─────────────────────────────────────────────────────────────
interface StatementTabProps {
  entityType: 'customers' | 'suppliers';
  apiUrl: string;
  label: string;
  fetchStatement: (id: number, filters: StatementFilters) => Promise<StatementResult>;
  exportStatement: (id: number, filters: StatementFilters, name: string) => Promise<void>;
  onClickInvoice: (id: number) => void;
  onClickExpense: (id: number) => void;
}

function StatementTab({
  entityType,
  apiUrl,
  label,
  fetchStatement,
  exportStatement,
  onClickInvoice,
  onClickExpense,
}: StatementTabProps) {
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [refType, setRefType] = useState('');
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<StatementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const cancelRef = useRef(false);

  // Load entity list
  useEffect(() => {
    api.get(apiUrl, { params: { pageSize: 500, page: 1 } }).then((r) => {
      const list: EntityOption[] = (r.data.data.data ?? []).map((e: any) => ({
        id: e.id,
        name: e.name,
        code: e.code,
      }));
      setEntities(list);
    }).catch(() => {});
  }, [apiUrl]);

  const load = useCallback(async () => {
    if (!selectedId) return;
    cancelRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const filters: StatementFilters = {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: search || undefined,
        referenceType: (refType as StatementFilters['referenceType']) || undefined,
        status: status || undefined,
      };
      const data = await fetchStatement(selectedId, filters);
      if (!cancelRef.current) setResult(data);
    } catch {
      if (!cancelRef.current) setError('تعذّر تحميل كشف الحساب');
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [selectedId, fromDate, toDate, search, refType, status, fetchStatement]);

  useEffect(() => {
    cancelRef.current = true;
  }, [selectedId]);

  async function doExport() {
    if (!selectedId || !result) return;
    setExporting(true);
    try {
      const filters: StatementFilters = {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: search || undefined,
        referenceType: (refType as StatementFilters['referenceType']) || undefined,
        status: status || undefined,
      };
      await exportStatement(selectedId, filters, result.entityName);
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
  }

  const selectedEntity = entities.find((e) => e.id === selectedId) ?? null;

  return (
    <div>
      {/* Filter Bar */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
        }}
      >
        {/* Entity picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{label}</label>
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            style={{
              padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6,
              fontFamily: 'inherit', fontSize: '0.9rem', minWidth: 200, background: '#fff',
            }}
          >
            <option value="">— اختر {label} —</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        {/* Date From */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>من تاريخ</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
              fontFamily: 'inherit', fontSize: '0.9rem',
            }}
          />
        </div>

        {/* Date To */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>إلى تاريخ</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
              fontFamily: 'inherit', fontSize: '0.9rem',
            }}
          />
        </div>

        {/* Reference Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>النوع</label>
          <select
            value={refType}
            onChange={(e) => setRefType(e.target.value)}
            style={{
              padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
              fontFamily: 'inherit', fontSize: '0.9rem', minWidth: 130, background: '#fff',
            }}
          >
            <option value="">الكل</option>
            <option value="INVOICE">فاتورة</option>
            <option value="PAYMENT">دفعة</option>
            {entityType === 'suppliers' && <option value="EXPENSE">مصروف</option>}
          </select>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>بحث</label>
          <input
            type="text"
            placeholder="مرجع أو بيان..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            style={{
              padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
              fontFamily: 'inherit', fontSize: '0.9rem', width: 180,
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={load}
            disabled={!selectedId || loading}
            style={{
              padding: '8px 20px', background: '#1d4e6f', color: '#fff',
              border: 'none', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600,
              opacity: !selectedId || loading ? 0.6 : 1,
            }}
          >
            {loading ? 'جارٍ التحميل…' : 'عرض'}
          </button>

          <button
            onClick={doExport}
            disabled={!result || exporting}
            style={{
              padding: '8px 16px', background: '#059669', color: '#fff',
              border: 'none', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600,
              opacity: !result || exporting ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
            {exporting ? 'جارٍ التصدير…' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '12px 16px', color: '#b91c1c', marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Empty state — no entity selected */}
      {!selectedId && !loading && (
        <div style={{
          textAlign: 'center', padding: '60px 0', color: '#9ca3af',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, display: 'block', marginBottom: 12 }}>
            account_balance_wallet
          </span>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>اختر {label} لعرض كشف الحساب</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Entity header */}
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 2px', fontSize: '1.1rem', fontWeight: 700, color: '#1d4e6f' }}>
              {result.entityName}
            </h2>
            <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>{result.entityCode}</span>
            {result.fromDate && (
              <span style={{ fontSize: '0.82rem', color: '#6b7280', marginRight: 12 }}>
                {dateText(result.fromDate)} — {result.toDate ? dateText(result.toDate) : 'الآن'}
              </span>
            )}
          </div>

          {/* Summary Cards */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <SummaryCard
              label="الرصيد الافتتاحي"
              value={result.summary.openingBalance}
              color="#6b7280"
            />
            <SummaryCard
              label="إجمالي المدين"
              value={result.summary.totalDebit}
              color="#16a34a"
            />
            <SummaryCard
              label="إجمالي الدائن"
              value={result.summary.totalCredit}
              color="#dc2626"
            />
            <SummaryCard
              label="الرصيد الختامي"
              value={result.summary.closingBalance}
              color={result.summary.closingBalance < 0 ? '#dc2626' : '#1d4e6f'}
              highlight
            />
            <SummaryCard
              label="عدد الحركات"
              value={result.summary.transactionCount}
              color="#6b7280"
              isCount
            />
          </div>

          {/* Transaction Table */}
          {result.entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '0.9rem' }}>
              لا توجد حركات في هذه الفترة
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem',
                border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
              }}>
                <thead>
                  <tr style={{ background: '#1d4e6f', color: '#fff' }}>
                    {['التاريخ', 'المرجع', 'النوع', 'البيان', 'مدين', 'دائن', 'الرصيد', 'الحالة'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.entries.map((entry, i) => (
                    <StatementRow
                      key={entry.id}
                      entry={entry}
                      index={i}
                      onClickInvoice={onClickInvoice}
                      onClickExpense={onClickExpense}
                    />
                  ))}
                </tbody>
                {/* Footer totals */}
                <tfoot>
                  <tr style={{ background: '#f0f3f7', fontWeight: 700 }}>
                    <td colSpan={4} style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>
                      الإجمالي
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a' }}>
                      {kwd(result.summary.totalDebit)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>
                      {kwd(result.summary.totalCredit)}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px', textAlign: 'right', fontWeight: 700,
                        color: result.summary.closingBalance < 0 ? '#dc2626' : '#1d4e6f',
                      }}
                    >
                      {kwd(result.summary.closingBalance)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  color,
  highlight = false,
  isCount = false,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
  isCount?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight ? '#eff6ff' : '#fff',
        border: `1px solid ${highlight ? '#bfdbfe' : '#e5e7eb'}`,
        borderRadius: 10,
        padding: '14px 18px',
        minWidth: 160,
        flex: '1 1 160px',
      }}
    >
      <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>
        {isCount ? value.toLocaleString('ar') : kwd(value)}
        {!isCount && <span style={{ fontSize: '0.7rem', color: '#9ca3af', marginRight: 4 }}>د.ك</span>}
      </div>
    </div>
  );
}

// ─── Statement Row ────────────────────────────────────────────────────────────
function StatementRow({
  entry,
  index,
  onClickInvoice,
  onClickExpense,
}: {
  entry: StatementEntry;
  index: number;
  onClickInvoice: (id: number) => void;
  onClickExpense: (id: number) => void;
}) {
  const isEven = index % 2 === 0;

  function handleRefClick() {
    if (entry.referenceType === 'INVOICE') onClickInvoice(entry.referenceId);
    else if (entry.referenceType === 'EXPENSE') onClickExpense(entry.referenceId);
  }

  const isClickable = entry.referenceType === 'INVOICE' || entry.referenceType === 'EXPENSE';

  return (
    <tr
      style={{
        background: isEven ? '#fff' : '#f9fafb',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f6ff')}
      onMouseLeave={(e) => (e.currentTarget.style.background = isEven ? '#fff' : '#f9fafb')}
    >
      {/* Date */}
      <td style={{ padding: '9px 12px', color: '#374151', whiteSpace: 'nowrap' }}>
        {dateText(entry.date)}
      </td>

      {/* Reference — clickable */}
      <td style={{ padding: '9px 12px' }}>
        <span
          onClick={isClickable ? handleRefClick : undefined}
          style={{
            color: isClickable ? '#1d4e6f' : '#374151',
            fontWeight: isClickable ? 600 : 400,
            cursor: isClickable ? 'pointer' : 'default',
            textDecoration: isClickable ? 'underline' : 'none',
          }}
        >
          {entry.reference}
        </span>
      </td>

      {/* Type */}
      <td style={{ padding: '9px 12px', color: '#6b7280', fontSize: '0.82rem' }}>
        {REF_TYPE_AR[entry.referenceType] ?? entry.referenceType}
      </td>

      {/* Description */}
      <td style={{ padding: '9px 12px', color: '#4b5563', maxWidth: 280 }}>
        {entry.description}
      </td>

      {/* Debit — green */}
      <td style={{ padding: '9px 12px', textAlign: 'right', color: entry.debit > 0 ? '#16a34a' : '#d1d5db', fontWeight: entry.debit > 0 ? 600 : 400 }}>
        {entry.debit > 0 ? kwd(entry.debit) : '—'}
      </td>

      {/* Credit — red */}
      <td style={{ padding: '9px 12px', textAlign: 'right', color: entry.credit > 0 ? '#dc2626' : '#d1d5db', fontWeight: entry.credit > 0 ? 600 : 400 }}>
        {entry.credit > 0 ? kwd(entry.credit) : '—'}
      </td>

      {/* Running Balance */}
      <td
        style={{
          padding: '9px 12px', textAlign: 'right', fontWeight: 700,
          color: entry.runningBalance < 0 ? '#dc2626' : '#1d4e6f',
        }}
      >
        {kwd(entry.runningBalance)}
      </td>

      {/* Status */}
      <td style={{ padding: '9px 12px' }}>
        <span
          style={{
            padding: '3px 8px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600,
            background: statusBg(entry.status), color: statusColor(entry.status),
          }}
        >
          {STATUS_AR[entry.status] ?? entry.status}
        </span>
      </td>
    </tr>
  );
}

function statusBg(s: string) {
  if (s === 'PAID') return '#dcfce7';
  if (s === 'APPROVED') return '#dcfce7';
  if (s === 'UNPAID' || s === 'PENDING') return '#fef3c7';
  if (s === 'PARTIAL') return '#dbeafe';
  if (s === 'OVERDUE') return '#fee2e2';
  if (s === 'CANCELLED' || s === 'REVERSED' || s === 'REJECTED') return '#f3f4f6';
  return '#f3f4f6';
}

function statusColor(s: string) {
  if (s === 'PAID' || s === 'APPROVED') return '#16a34a';
  if (s === 'UNPAID' || s === 'PENDING') return '#b45309';
  if (s === 'PARTIAL') return '#1d4ed8';
  if (s === 'OVERDUE') return '#dc2626';
  return '#6b7280';
}
```

- [ ] **Step 2: Add import and route to `App.tsx`**

Open `frontend/src/App.tsx`. Add import after the last existing import:

```typescript
import Statements from './pages/Statements';
```

Inside the `<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>` block, add before the `<Route path="*"...>` line:

```tsx
<Route path="/statements" element={<Statements />} />
```

- [ ] **Step 3: Add navigation entry to `Layout.tsx`**

Open `frontend/src/components/Layout.tsx`. Find the NAV array (or where nav items are defined). Add `statements` to the financial group, after the `accounting` entry:

```typescript
{ key: 'statements', label: 'nav.statements', icon: 'account_balance_wallet', permission: 'statements.read' },
```

Also add the Arabic label string. Find where the label key is mapped to Arabic text (usually there's a translation map or the label is used directly). Add:

```typescript
'nav.statements': 'كشف الحساب',
```

If the Layout uses a translation function with an inline map, add `'nav.statements': 'كشف الحساب'` to that map.

- [ ] **Step 4: TypeScript validation**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 5: Build validation**

```bash
npm run build:front
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Statements.tsx \
        frontend/src/App.tsx \
        frontend/src/components/Layout.tsx
git commit -m "feat(statements): add Statement Center page with customer/supplier tabs"
```
