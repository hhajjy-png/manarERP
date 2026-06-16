# Business Alignment Pack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Items 1–7 from the business alignment spec (direction label audit, print layout, Excel export, customer UX, expenses UX + reporting, smart conflict messages) plus analysis for Items 8–9, without breaking existing data or features.

**Architecture:**
- **Pack A** (Items 1–4 labels/UX/print/reports/conflicts): Pure UI/backend label changes + smart error messages. No schema changes. Can be merged independently.
- **Pack B** (Items 5–7 expenses): DB migration (3 nullable columns only: billingMonth, billingYear, notes), backend service improvements, new dedicated `Expenses.tsx` page. Builds on Pack A.
- Items 8–9 are text analysis with no code changes. Item 8 includes actual DB statistics.
- customCategory and customSupplierName are **deferred** — not included in this migration. Add only if confirmed necessary after Pack B review.
- All schema changes add NULLABLE columns — zero destructive migrations.

**Tech Stack:** React 18, TypeScript 5.5, Express 4, Prisma 5 / SQLite, Zod, XLSX (client-side), ExcelJS (server-side)

---

## Pre-work

### Task 0: Create Feature Branch

**Files:** none

- [ ] **Step 0.1** — Create and switch to feature branch
```bash
git checkout production
git pull
git checkout -b feature/business-alignment-pack
```
- [ ] **Step 0.2** — Verify clean state
```bash
git status
```
Expected: nothing to commit

---

## Pack A — Labels, UX, Print, Reports, Conflict Messages

> Tasks T1, T5–T10: zero schema changes; can be branch-merged and Gemini-reviewed independently before Pack B starts.

---

## T1 — i18n: Direction Labels + Expense Category Labels

**Files:**
- Modify: `frontend/src/lib/i18n.ts`

**What:** Fix `opt.direction.sales_full` ('مبيعات (عميل)' → 'نقليات عميل') and `opt.direction.purchase_full` ('مشتريات (مورّد)' → 'مشتريات مورد'). Add Arabic labels for the 6 new expense categories.

- [ ] **Step 1.1** — Update direction labels in `frontend/src/lib/i18n.ts`

Find these two lines (around line 445–447):
```typescript
'opt.direction.sales_full': 'مبيعات (عميل)',
'opt.direction.purchase_full': 'مشتريات (مورّد)',
```
Replace with:
```typescript
'opt.direction.sales_full': 'نقليات عميل',
'opt.direction.purchase_full': 'مشتريات مورد',
```

- [ ] **Step 1.2** — Add new expense category i18n keys (after the existing `'cat.other': 'أخرى'` line, around line 264):
```typescript
'cat.equipment_rent': 'إيجار معدات',
'cat.truck_rent': 'إيجار شاحنات',
'cat.hassan': 'مصروف عن طريق حسن',
'cat.ghanem': 'مصروف عن طريق غانم',
'cat.natheer': 'مصروف عن طريق نظير',
'cat.haroon': 'مصروف عن طريق هارون',
```

- [ ] **Step 1.3** — Verify EN dict also has entries (check around line 1200+ for English section) and replicate if needed.

- [ ] **Step 1.4** — Commit
```bash
git add frontend/src/lib/i18n.ts
git commit -m "feat(i18n): fix direction labels + add new expense category labels"
```

---

## Pack B — Expenses UX, Reporting, Excel Export

> Tasks T2–T4, T11: requires DB migration. Implement after Pack A is merged (or in parallel on the same branch).
>
> **Scope constraint:** The migration in T3 adds ONLY `billingMonth`, `billingYear`, `notes`. `customCategory` and `customSupplierName` are deferred until after Pack B review.

---

## T2 — Backend: New Expense Categories in constants.ts

**Files:**
- Modify: `backend/src/config/constants.ts`

**What:** Extend `ENUMS.expenseCategory` with 6 new values. Internal keys are UPPERCASE_SNAKE.

- [ ] **Step 2.1** — Update `ENUMS.expenseCategory` in `backend/src/config/constants.ts`

Find the existing array (around line 86–95):
```typescript
expenseCategory: [
  'FUEL', 'SALARIES', 'MAINTENANCE', 'RENT', 'PURCHASES', 'EQUIPMENT', 'SERVICES', 'OTHER',
] as const,
```
Replace with:
```typescript
expenseCategory: [
  'FUEL',
  'SALARIES',
  'MAINTENANCE',
  'RENT',
  'PURCHASES',
  'EQUIPMENT',
  'SERVICES',
  'EQUIPMENT_RENT',
  'TRUCK_RENT',
  'HASSAN',
  'GHANEM',
  'NATHEER',
  'HAROON',
  'OTHER',
] as const,
```

- [ ] **Step 2.2** — Update the `CATEGORY_AR` map in `backend/src/modules/expenses/expenses.service.ts` (around line 10):
```typescript
const CATEGORY_AR: Record<string, string> = {
  FUEL: 'وقود',
  SALARIES: 'رواتب',
  MAINTENANCE: 'صيانة',
  RENT: 'إيجارات',
  PURCHASES: 'مشتريات',
  EQUIPMENT: 'معدات',
  SERVICES: 'خدمات',
  EQUIPMENT_RENT: 'إيجار معدات',
  TRUCK_RENT: 'إيجار شاحنات',
  HASSAN: 'مصروف عن طريق حسن',
  GHANEM: 'مصروف عن طريق غانم',
  NATHEER: 'مصروف عن طريق نظير',
  HAROON: 'مصروف عن طريق هارون',
  OTHER: 'أخرى',
};
```

- [ ] **Step 2.3** — Run type check to verify no compile errors
```bash
cd backend && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 2.4** — Commit
```bash
git add backend/src/config/constants.ts backend/src/modules/expenses/expenses.service.ts
git commit -m "feat(expenses): add 6 new expense categories to constants and CATEGORY_AR map"
```

---

## T3 — Backend: Expense DB Migration (New Nullable Fields)

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Generated: `backend/prisma/migrations/*/migration.sql` (auto-created by Prisma)

**What:** Add 3 nullable columns to the `expenses` table: `billingMonth`, `billingYear`, `notes`. All nullable → non-destructive migration. Existing rows get NULL for all new fields. `customCategory` and `customSupplierName` are deferred and NOT included in this migration.

- [ ] **Step 3.1** — Edit `backend/prisma/schema.prisma`. Find the `Expense` model (around line 649) and add 3 new fields before `createdAt`:
```prisma
model Expense {
  id           Int       @id @default(autoincrement())
  code         String    @unique
  category     String // FUEL | SALARIES | MAINTENANCE | RENT | PURCHASES | EQUIPMENT | SERVICES | EQUIPMENT_RENT | TRUCK_RENT | HASSAN | GHANEM | NATHEER | HAROON | OTHER
  description  String
  amount       Float
  date         DateTime  @default(now())
  billingMonth  Int?     // شهر الحساب (1-12)
  billingYear   Int?     // سنة الحساب
  notes         String?  // ملاحظات حرة
  contractId   Int?
  supplierId   Int?
  documentPath String?
  status       String    @default("PENDING")
  approvedById Int?
  approvedAt   DateTime?

  contract   Contract? @relation(fields: [contractId], references: [id])
  supplier   Supplier? @relation(fields: [supplierId], references: [id])
  approvedBy Employee? @relation("ExpenseApprover", fields: [approvedById], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([category])
  @@index([status])
  @@index([contractId])
  @@index([date])
  @@index([billingMonth, billingYear])
  @@index([supplierId])
  @@map("expenses")
}
```
> NOTE: `customCategory` and `customSupplierName` are NOT added here. Defer until after Pack B review.

- [ ] **Step 3.2** — Validate schema
```bash
cd backend && npx prisma validate
```
Expected: `The schema at .../schema.prisma is valid`

- [ ] **Step 3.3** — Review migration SQL before applying
```bash
cd backend && npx prisma migrate dev --create-only --name add_expense_new_fields
```
Open `backend/prisma/migrations/<timestamp>_add_expense_new_fields/migration.sql` and confirm only `ALTER TABLE "expenses" ADD COLUMN` statements — no DROP or destructive ops.

- [ ] **Step 3.4** — Apply migration
```bash
cd backend && npx prisma migrate dev
```
Expected: `All migrations have been successfully applied.`

- [ ] **Step 3.5** — Regenerate Prisma client
```bash
npm run db:generate
```

- [ ] **Step 3.6** — Commit
```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(expenses): add billingMonth/Year, notes, customCategory, customSupplierName columns"
```

---

## T4 — Backend: Expenses Schema + Service + Stats Endpoint

**Files:**
- Modify: `backend/src/modules/expenses/expenses.schema.ts`
- Modify: `backend/src/modules/expenses/expenses.service.ts`
- Modify: `backend/src/modules/expenses/expenses.controller.ts`
- Modify: `backend/src/modules/expenses/expenses.routes.ts`

### 4A — Update Zod Schema

- [ ] **Step 4.1** — Replace `backend/src/modules/expenses/expenses.schema.ts`:
```typescript
import { z } from 'zod';
import { ENUMS } from '../../config/constants';

export const createExpenseSchema = z.object({
  body: z.object({
    code: z.string().min(1).optional(),
    category: z.enum(ENUMS.expenseCategory),
    description: z.string().min(1, 'الوصف مطلوب'),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون موجبًا'),
    date: z.coerce.date().optional(),
    billingMonth: z.coerce.number().int().min(1).max(12).optional(),
    billingYear: z.coerce.number().int().min(2020).max(2100).optional(),
    notes: z.string().optional(),
    customCategory: z.string().optional(),
    customSupplierName: z.string().optional(),
    contractId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    documentPath: z.string().optional(),
  }),
});

export const updateExpenseSchema = z.object({
  body: createExpenseSchema.shape.body.partial(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>['body'];
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>['body'];
```

### 4B — Update Service (filtering + new fields)

- [ ] **Step 4.2** — Update the `list` method in `backend/src/modules/expenses/expenses.service.ts` to support new filters (replace the method):
```typescript
async list(query: PaginationQuery & {
  category?: string;
  status?: string;
  contractId?: string;
  supplierId?: string;
  billingMonth?: string;
  billingYear?: string;
  from?: string;
  to?: string;
}) {
  const pagination = getPagination(query);
  const where: Prisma.ExpenseWhereInput = {};
  if (query.category) where.category = query.category;
  if (query.status) where.status = query.status;
  if (query.contractId) where.contractId = Number(query.contractId);
  if (query.supplierId) where.supplierId = Number(query.supplierId);
  if (query.billingMonth) where.billingMonth = Number(query.billingMonth);
  if (query.billingYear) where.billingYear = Number(query.billingYear);
  if (query.from || query.to) {
    where.date = {};
    if (query.from) where.date.gte = new Date(query.from);
    if (query.to) where.date.lte = new Date(query.to);
  }
  if (query.search) where.description = { contains: query.search };

  const [data, total] = await Promise.all([
    prisma.expense.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy: { date: 'desc' }, include: FULL_INCLUDE }),
    prisma.expense.count({ where }),
  ]);
  return buildPaginatedResult(data, total, pagination);
}
```

- [ ] **Step 4.3** — Update `create` method to persist new fields:
```typescript
async create(input: CreateExpenseInput, req: Request) {
  const code = input.code ?? (await this.generateCode());
  const expense = await prisma.expense.create({
    data: {
      code,
      category: input.category,
      description: input.description,
      amount: input.amount,
      date: input.date ?? new Date(),
      billingMonth: input.billingMonth ?? null,
      billingYear: input.billingYear ?? null,
      notes: input.notes ?? null,
      customCategory: input.customCategory ?? null,
      customSupplierName: input.customSupplierName ?? null,
      contractId: input.contractId ?? null,
      supplierId: input.supplierId ?? null,
      documentPath: input.documentPath ?? null,
      status: 'PENDING',
    },
    include: FULL_INCLUDE,
  });
  await recordAudit({ req, action: 'CREATE', module: 'expenses', entityId: expense.id, newValue: { code, amount: input.amount } });
  return expense;
}
```

- [ ] **Step 4.4** — Update `update` method to include new fields:
```typescript
async update(id: number, input: UpdateExpenseInput, req: Request) {
  const current = await prisma.expense.findUnique({ where: { id } });
  if (!current) throw AppError.notFound('المصروف غير موجود');
  if (current.status === 'APPROVED') throw AppError.badRequest('لا يمكن تعديل مصروف معتمد');

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      category: input.category ?? current.category,
      description: input.description ?? current.description,
      amount: input.amount ?? current.amount,
      date: input.date ?? current.date,
      billingMonth: input.billingMonth !== undefined ? input.billingMonth : current.billingMonth,
      billingYear: input.billingYear !== undefined ? input.billingYear : current.billingYear,
      notes: input.notes !== undefined ? input.notes : current.notes,
      customCategory: input.customCategory !== undefined ? input.customCategory : current.customCategory,
      customSupplierName: input.customSupplierName !== undefined ? input.customSupplierName : current.customSupplierName,
      contractId: input.contractId === undefined ? current.contractId : input.contractId,
      supplierId: input.supplierId === undefined ? current.supplierId : input.supplierId,
      documentPath: input.documentPath ?? current.documentPath,
    },
    include: FULL_INCLUDE,
  });
  await recordAudit({ req, action: 'UPDATE', module: 'expenses', entityId: id, oldValue: current, newValue: input });
  return expense;
}
```

- [ ] **Step 4.5** — Add a `stats` method to `ExpensesService` (append before closing `}`):
```typescript
async stats(query: {
  category?: string;
  status?: string;
  supplierId?: string;
  billingMonth?: string;
  billingYear?: string;
  from?: string;
  to?: string;
}) {
  const where: Prisma.ExpenseWhereInput = {};
  if (query.category) where.category = query.category;
  if (query.status) where.status = query.status;
  if (query.supplierId) where.supplierId = Number(query.supplierId);
  if (query.billingMonth) where.billingMonth = Number(query.billingMonth);
  if (query.billingYear) where.billingYear = Number(query.billingYear);
  if (query.from || query.to) {
    where.date = {};
    if (query.from) (where.date as Record<string, Date>).gte = new Date(query.from);
    if (query.to) (where.date as Record<string, Date>).lte = new Date(query.to);
  }

  const rows = await prisma.expense.findMany({
    where,
    select: { amount: true, category: true, supplier: { select: { id: true, name: true } }, customSupplierName: true },
  });

  const count = rows.length;
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  // بحسب التصنيف
  const byCategory: Record<string, number> = {};
  for (const r of rows) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + Number(r.amount);
  }

  // بحسب المورد
  const bySupplier: Record<string, number> = {};
  for (const r of rows) {
    const label = r.supplier?.name ?? r.customSupplierName ?? 'غير محدد';
    bySupplier[label] = (bySupplier[label] ?? 0) + Number(r.amount);
  }

  return { count, total, byCategory, bySupplier };
}
```

### 4C — Controller + Routes

- [ ] **Step 4.6** — Add `stats` action to `expenses.controller.ts`:
```typescript
// Add inside expensesController object:
async stats(req: Request, res: Response) {
  ok(res, await expensesService.stats(req.query as Record<string, string>));
},
```

- [ ] **Step 4.7** — Register the stats route in `expenses.routes.ts`. Read the file first to find where GET routes are listed, then add before the `/:id` route:
```typescript
router.get('/stats', authenticate, requirePermission('expenses.read'), asyncHandler(expensesController.stats));
```

- [ ] **Step 4.8** — Type-check backend
```bash
cd backend && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4.9** — Commit
```bash
git add backend/src/modules/expenses/
git commit -m "feat(expenses): new fields in schema/service, supplier+month+year filters, stats endpoint"
```

---

## T5 — Backend: Customer Smart Conflict Message

**Files:**
- Modify: `backend/src/modules/customers/customers.service.ts`

**What:** When a duplicate customer code is detected, fetch the existing customer's name and include it in the error message.

- [ ] **Step 5.1** — Update `create` method in `customers.service.ts`:
```typescript
async create(input: CreateCustomerInput, req: Request) {
  const existing = await customersRepository.findOne({ where: { code: input.code } });
  if (existing) {
    throw AppError.conflict(
      `رقم العميل «${input.code}» مستخدم بالفعل للعميل: ${(existing as { name: string }).name}`
    );
  }
  // ... rest unchanged
}
```

Note: `customersRepository` may expose `findOne({ where })` — check the actual method name in `customers.repository.ts`. If only `exists({ code })` is available, use:
```typescript
const conflict = await prisma.customer.findUnique({ where: { code: input.code } });
if (conflict) {
  throw AppError.conflict(
    `رقم العميل «${input.code}» مستخدم بالفعل للعميل: ${conflict.name}`
  );
}
```

- [ ] **Step 5.2** — Update `update` method similarly:
```typescript
if (input.code && input.code !== (current as { code: string }).code) {
  const conflict = await prisma.customer.findUnique({ where: { code: input.code } });
  if (conflict) {
    throw AppError.conflict(
      `رقم العميل «${input.code}» مستخدم بالفعل للعميل: ${conflict.name}`
    );
  }
}
```

- [ ] **Step 5.3** — Backend type-check
```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 5.4** — Commit
```bash
git add backend/src/modules/customers/customers.service.ts
git commit -m "feat(customers): smart conflict message includes conflicting customer name"
```

---

## T6 — Backend: Smart Conflict Messages for Contracts, Employees, Equipment, Cheques

**Files:**
- Modify: `backend/src/modules/contracts/contracts.service.ts`
- Modify: `backend/src/modules/employees/employees.service.ts`
- Modify: `backend/src/modules/equipment/equipment.service.ts`
- Modify: `backend/src/modules/cheques/cheques.service.ts`

**What:** For each module, find the unique-field conflict check (usually on `code` or `chequeNumber`) and replace the generic error string with one that includes the conflicting record's identifying fields.

For each file:
1. Read it to locate the conflict check
2. Fetch the existing record before throwing
3. Include: field name, conflicting value, and the record name/identifier

**Pattern for contracts** (check `contracts.service.ts` — find where `code` uniqueness is checked):
```typescript
const conflict = await prisma.contract.findUnique({ where: { code: input.code } });
if (conflict) {
  throw AppError.conflict(
    `رقم العقد «${input.code}» مستخدم بالفعل (مصنع الأسفلت: ${conflict.asphaltPlant})`
  );
}
```

**Pattern for employees** (check `employees.service.ts` — find where `code` uniqueness is checked):
```typescript
const conflict = await prisma.employee.findUnique({ where: { code: input.code } });
if (conflict) {
  throw AppError.conflict(
    `الرقم الوظيفي «${input.code}» مستخدم بالفعل للموظف: ${conflict.fullName}`
  );
}
```

**Pattern for equipment** (check `equipment.service.ts`):
```typescript
const conflict = await prisma.equipment.findUnique({ where: { code: input.code } });
if (conflict) {
  throw AppError.conflict(
    `رقم المعدة «${input.code}» مستخدم بالفعل${conflict.plateNumber ? ` (لوحة: ${conflict.plateNumber})` : ''}`
  );
}
```

**Pattern for cheques** (check `cheques.service.ts`):
```typescript
const conflict = await prisma.cheque.findUnique({ where: { chequeNumber: input.chequeNumber } });
if (conflict) {
  throw AppError.conflict(
    `رقم الشيك «${input.chequeNumber}» مستخدم بالفعل (المستفيد: ${conflict.beneficiaryName}، التاريخ: ${String(conflict.chequeDate).slice(0, 10)})`
  );
}
```

- [ ] **Step 6.1** — Read `contracts.service.ts`, apply pattern above for create & update
- [ ] **Step 6.2** — Read `employees.service.ts`, apply pattern above for create & update
- [ ] **Step 6.3** — Read `equipment.service.ts`, apply pattern above for create & update
- [ ] **Step 6.4** — Read `cheques.service.ts`, apply pattern above for create & update

- [ ] **Step 6.5** — Backend type-check
```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 6.6** — Commit
```bash
git add backend/src/modules/contracts/ backend/src/modules/employees/ backend/src/modules/equipment/ backend/src/modules/cheques/
git commit -m "feat(conflict): smart conflict messages with field + record identifiers for contracts/employees/equipment/cheques"
```

---

## T7 — Backend: Reports Service — Invoice Method Update

**Files:**
- Modify: `backend/src/modules/reports/reports.service.ts`

**What:** In the `invoices` private method (line ~122):
1. Replace direction label 'مبيعات' → 'نقليات عميل', 'مشتريات' → 'مشتريات مورد'
2. Replace the 'التاريخ' column (issueDate) with 'شهر الحساب' (billingMonth+billingYear)
3. Remove 'الحالة' column, add 'المتبقي' column

- [ ] **Step 7.1** — Update the `invoices` method columns array in `reports.service.ts`:
```typescript
columns: [
  { header: 'رقم الفاتورة', key: 'invoiceNumber', width: 22 },
  { header: 'الاتجاه', key: 'direction', width: 16 },
  { header: 'الجهة', key: 'party', width: 28 },
  { header: 'شهر الحساب', key: 'billingPeriod', width: 18 },
  { header: 'الإجمالي', key: 'total', width: 16, numFmt: '#,##0.000' },
  { header: 'المسدّد', key: 'paid', width: 16, numFmt: '#,##0.000' },
  { header: 'المتبقي', key: 'remaining', width: 16, numFmt: '#,##0.000' },
],
```

- [ ] **Step 7.2** — Update the `rows` mapping (declare ARABIC_MONTHS const at top of method or near the class):

At the top of `reports.service.ts`, after imports, add:
```typescript
const ARABIC_MONTHS_RPT = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
```

Then update the rows map:
```typescript
rows: rows.map((i) => ({
  invoiceNumber: i.invoiceNumber,
  direction: i.direction === 'SALES' ? 'نقليات عميل' : i.direction === 'PURCHASE' ? 'مشتريات مورد' : i.direction,
  party: i.customer?.name ?? i.supplier?.name ?? '',
  billingPeriod: i.billingMonth && i.billingYear
    ? `${ARABIC_MONTHS_RPT[(i.billingMonth as number) - 1]} ${i.billingYear}`
    : dateAr(i.issueDate),
  total: num(i.total),
  paid: num(i.paidAmount),
  remaining: num(i.total) - num(i.paidAmount),
})),
totalsRow: { party: 'الإجمالي', total, paid, remaining: total - paid },
```

Also update `paid` and `total` variables — add `remaining` to the subtitle:
```typescript
const remaining = total - paid;
return {
  title: 'تقرير الفواتير',
  subtitle: `العدد: ${rows.length} — الإجمالي: ${total.toLocaleString('ar')} — المحصّل: ${paid.toLocaleString('ar')} — المتبقي: ${remaining.toLocaleString('ar')}`,
  // ...
};
```

- [ ] **Step 7.3** — Type-check backend
```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 7.4** — Commit
```bash
git add backend/src/modules/reports/reports.service.ts
git commit -m "feat(reports): invoice report uses billing period + remaining instead of date+status"
```

---

## T8 — Frontend: Invoice Excel Export Column Fix

**Files:**
- Modify: `frontend/src/pages/Invoices.tsx`

**What:** In the `exportExcel` function's `wsData` mapping, remove 'تاريخ الفاتورة' and 'الحالة'. These are now redundant (billingMonth/year already shown; status column removed per spec).

- [ ] **Step 8.1** — In `Invoices.tsx`, find the `wsData` map inside `exportExcel` (around line 163–175) and replace:
```typescript
const wsData = all.map((r: any) => ({
  'رقم الفاتورة': r.invoiceNumber ?? r.number,
  'نوع الفاتورة': r.invoiceType ?? '',
  'الاتجاه': dirLabel(r.direction ?? ''),
  'الطرف': r.customer?.name ?? r.supplier?.name ?? '',
  'شهر الحساب': r.billingMonth && r.billingYear ? `${ARABIC_MONTHS[Number(r.billingMonth) - 1]} ${r.billingYear}` : '',
  'الإجمالي': Number(r.total),
  'المسدد': Number(r.paidAmount),
  'المتبقي': Number(r.total) - Number(r.paidAmount),
  'ملاحظات': r.notes ?? '',
}));
```
(Removed: 'تاريخ الفاتورة' and 'الحالة')

- [ ] **Step 8.2** — Frontend type-check
```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 8.3** — Commit
```bash
git add frontend/src/pages/Invoices.tsx
git commit -m "feat(invoices): Excel export removes الحالة + تاريخ الفاتورة columns, keeps شهر الحساب"
```

---

## T9 — Frontend: Invoice Print Layout Enhancement

**Files:**
- Modify: `frontend/src/pages/InvoicePreview.tsx`

**What:**
1. Section "الجهة والعقد" → conditional: 'الجهة' when no contract, 'الجهة والعقد' when contract exists.
2. Reduce white space between financial summary and signature — `marginTop: 48` → `marginTop: 24`.

- [ ] **Step 9.1** — In `InvoicePreview.tsx`, find the Section 2 title (around line 248):
```tsx
<div style={secTitle}>{t('page.invoice_preview.section.party')}</div>
```
Replace with:
```tsx
<div style={secTitle}>{data.contract ? t('page.invoice_preview.section.party') : 'الجهة'}</div>
```

- [ ] **Step 9.2** — Find the signature block (around line 324) and reduce top margin:
```tsx
<div className="print-only" style={{ marginTop: 24, display: 'flex', justifyContent: 'space-around' }}>
```
(Changed `marginTop: 48` → `marginTop: 24`)

- [ ] **Step 9.3** — Frontend type-check
```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 9.4** — Commit
```bash
git add frontend/src/pages/InvoicePreview.tsx
git commit -m "feat(invoice-print): conditional section title party/contract + reduced signature spacing"
```

---

## T10 — Frontend: Customer Type Default = PRIVATE

**Files:**
- Modify: `frontend/src/config/modules.tsx`

**What:** The backend already defaults `type` to `'PRIVATE'` in the Zod schema. The frontend `ResourcePage` form via `FormDialog` needs a `defaultValue` on the type select field so it renders `خاص` pre-selected instead of `حكومي`.

- [ ] **Step 10.1** — Read `frontend/src/components/FormDialog.tsx` to check if it reads `field.defaultValue` for initial form state. If yes, add `defaultValue: 'PRIVATE'` to the customer type field in `modules.tsx`. If FormDialog doesn't support it, initialize the value in the ResourcePage or FormDialog's `useState`.

**If FormDialog uses `field.defaultValue`:**
In `modules.tsx`, find the customers type field (around line 146):
```tsx
{ name: 'type', label: 'field.type', type: 'select', options: [
  { value: 'GOVERNMENT', label: 'opt.customer.government' },
  { value: 'PRIVATE', label: 'opt.customer.private' }] },
```
Add `defaultValue`:
```tsx
{ name: 'type', label: 'field.type', type: 'select', defaultValue: 'PRIVATE', options: [
  { value: 'GOVERNMENT', label: 'opt.customer.government' },
  { value: 'PRIVATE', label: 'opt.customer.private' }] },
```

**If FormDialog doesn't support `defaultValue`:**
Read `FormDialog.tsx` and find the initial form state builder. Add logic:
```typescript
// In the useState that initializes form values:
const initial = fields.reduce((acc, f) => {
  acc[f.name] = f.defaultValue ?? '';
  return acc;
}, {} as Record<string, unknown>);
```

- [ ] **Step 10.2** — Frontend type-check
```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 10.3** — Commit
```bash
git add frontend/src/config/modules.tsx frontend/src/components/FormDialog.tsx
git commit -m "feat(customers): default type = PRIVATE in create form"
```

---

## T11 — Frontend: Custom Expenses Page (Replaces ResourcePage)

**Files:**
- Create: `frontend/src/pages/Expenses.tsx`
- Modify: `frontend/src/App.tsx`

**What:** Replace the generic `ResourcePage` for expenses with a dedicated page that matches the Invoices.tsx experience. Features:
- KPI strip: count, total, by-category breakdown, by-supplier breakdown
- Filters: status, category, supplier, billingMonth, billingYear, search
- Table with: code, category (Arabic label), description, supplier name, billing period, amount, status
- Excel export respecting active filters
- Create/Edit modal with:
  - category dropdown (all 14 categories) — no custom category field (deferred)
  - description text input
  - amount number input
  - date picker → auto-sets billingMonth/billingYear, both remain independently editable
  - billingMonth + billingYear selects (like invoices)
  - notes textarea
  - supplier dropdown (from existing suppliers list) — no "أخرى" free-text option (deferred)
  - **NO** contractId field (removed per spec)
  - documentPath hidden (existing backend feature, not shown in new UX)
> NOTE: customCategory and customSupplierName UI deferred. Form simplified accordingly.
- Approve / Reject buttons on each row (existing feature)
- Delete (for non-approved)

### Structure outline for `Expenses.tsx`

```typescript
// frontend/src/pages/Expenses.tsx

import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import { money, dateText } from '../config/modules';
import { usePersistedState } from '../hooks/usePersistedState';

const ARABIC_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'FUEL', label: 'وقود' },
  { value: 'SALARIES', label: 'رواتب' },
  { value: 'MAINTENANCE', label: 'صيانة' },
  { value: 'RENT', label: 'إيجارات' },
  { value: 'PURCHASES', label: 'مشتريات' },
  { value: 'EQUIPMENT', label: 'معدات' },
  { value: 'SERVICES', label: 'خدمات' },
  { value: 'EQUIPMENT_RENT', label: 'إيجار معدات' },
  { value: 'TRUCK_RENT', label: 'إيجار شاحنات' },
  { value: 'HASSAN', label: 'مصروف عن طريق حسن' },
  { value: 'GHANEM', label: 'مصروف عن طريق غانم' },
  { value: 'NATHEER', label: 'مصروف عن طريق نظير' },
  { value: 'HAROON', label: 'مصروف عن طريق هارون' },
  { value: 'OTHER', label: 'أخرى' },
];

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.label])
);

function billingYearOptions() {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1, y + 2];
}

const statusPill: Record<string, [string, string]> = {
  PENDING: ['معلّق', 'amber'],
  APPROVED: ['معتمد', 'green'],
  REJECTED: ['مرفوض', 'red'],
};

export default function Expenses() {
  const { hasPermission, user } = useAuth();
  const { t } = useT();
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = usePersistedState('exp:page', 1);
  const [search, setSearch] = usePersistedState('exp:search', '');
  const [statusFilter, setStatusFilter] = usePersistedState('exp:status', '');
  const [categoryFilter, setCategoryFilter] = usePersistedState('exp:category', '');
  const [supplierFilter, setSupplierFilter] = usePersistedState('exp:supplier', '');
  const [monthFilter, setMonthFilter] = usePersistedState('exp:month', '');
  const [yearFilter, setYearFilter] = usePersistedState('exp:year', '');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  const isFiltered = !!(search || statusFilter || categoryFilter || supplierFilter || monthFilter || yearFilter);

  const filterParams = {
    search: search || undefined,
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    supplierId: supplierFilter || undefined,
    billingMonth: monthFilter || undefined,
    billingYear: yearFilter || undefined,
  };

  function resetFilters() {
    setSearch(''); setStatusFilter(''); setCategoryFilter('');
    setSupplierFilter(''); setMonthFilter(''); setYearFilter('');
    setPage(1);
  }

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const res = await api.get('/expenses', { params: { page, pageSize: 15, ...filterParams } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } catch (e) { setLoadError(errorMessage(e)); }
    finally { setLoading(false); }

    api.get('/expenses/stats', { params: filterParams })
      .then((r) => setStats(r.data.data ?? null))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, categoryFilter, supplierFilter, monthFilter, yearFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/suppliers', { params: { pageSize: 300 } })
      .then((r) => setSuppliers(r.data?.data?.data ?? []))
      .catch(() => {});
  }, []);

  async function approve(id: number) {
    if (!confirm(t('msg.confirm_approve'))) return;
    try { await api.patch(`/expenses/${id}/approve`); load(); } catch (e) { alert(errorMessage(e)); }
  }
  async function reject(id: number) {
    if (!confirm(t('msg.confirm_reject'))) return;
    try { await api.patch(`/expenses/${id}/reject`); load(); } catch (e) { alert(errorMessage(e)); }
  }
  async function remove(id: number) {
    if (!confirm(t('msg.confirm_delete', { id }))) return;
    try { await api.delete(`/expenses/${id}`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  async function exportExcel() {
    setExportingExcel(true);
    try {
      const res = await api.get('/expenses', { params: { pageSize: 9999, page: 1, ...filterParams } });
      const all = res.data.data.data ?? [];
      const wsData = all.map((r: any) => ({
        'الرقم': r.code,
        'التصنيف': r.customCategory ? `أخرى — ${r.customCategory}` : (CAT_LABEL[r.category] ?? r.category),
        'الوصف': r.description,
        'المورد': r.supplier?.name ?? r.customSupplierName ?? '',
        'شهر الحساب': r.billingMonth && r.billingYear ? `${ARABIC_MONTHS[Number(r.billingMonth) - 1]} ${r.billingYear}` : (r.date ? String(r.date).slice(0, 10) : ''),
        'المبلغ (د.ك)': Number(r.amount),
        'الحالة': { PENDING: 'معلّق', APPROVED: 'معتمد', REJECTED: 'مرفوض' }[r.status as string] ?? r.status,
        'ملاحظات': r.notes ?? '',
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'المصروفات');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `expenses_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { alert(errorMessage(e)); }
    finally { setExportingExcel(false); }
  }

  const inp: React.CSSProperties = {
    padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: 14,
  };

  const columns = [
    { key: 'code', label: 'col.code', render: (r: any) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
    { key: 'category', label: 'col.category', render: (r: any) => r.customCategory ? `أخرى — ${r.customCategory}` : (CAT_LABEL[r.category] ?? r.category) },
    { key: 'description', label: 'col.description', render: (r: any) => <strong>{r.description}</strong> },
    { key: 'supplier', label: 'field.supplier', render: (r: any) => r.supplier?.name ?? r.customSupplierName ?? '—' },
    { key: 'billing', label: 'lbl.inv.billing_period', render: (r: any) => r.billingMonth && r.billingYear ? `${ARABIC_MONTHS[Number(r.billingMonth) - 1]} ${r.billingYear}` : dateText(r.date) },
    { key: 'amount', label: 'col.amount', render: (r: any) => money(r.amount) },
    { key: 'status', label: 'col.status', render: (r: any) => { const [lbl, c] = statusPill[r.status] ?? ['—', 'gray']; return <span className={`pill ${c}`}>{lbl}</span>; } },
  ];

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('mod.expenses.title')}</h2><p>{t('mod.expenses.subtitle')}</p></div>
        {hasPermission('expenses.create') && (
          <button className="btn" onClick={() => setCreating(true)}>＋ {t('mod.expenses.create')}</button>
        )}
      </div>

      {/* ── KPI Strip ── */}
      {stats && (
        <div className="inv-stats-strip">
          <div className="inv-stat-chip">
            <span className="inv-stat-label">عدد المصروفات</span>
            <span className="inv-stat-value">{stats.count}</span>
          </div>
          <div className="inv-stat-chip blue">
            <span className="inv-stat-label">إجمالي المصروفات</span>
            <span className="inv-stat-value">{money(stats.total)}</span>
          </div>
        </div>
      )}

      {loadError && (
        <div className="alert error" role="alert">
          <span>⚠️ {loadError}</span>
          <button type="button" className="btn secondary sm" onClick={load} disabled={loading}>↻ تحديث</button>
        </div>
      )}

      {/* ── Filters ── */}
      <form className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }} onSubmit={(e) => e.preventDefault()}>
        <input
          placeholder="بحث في الوصف…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inp, maxWidth: 240 }}
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ ...inp, maxWidth: 160 }}>
          <option value="">الحالة — الكل</option>
          <option value="PENDING">معلّق</option>
          <option value="APPROVED">معتمد</option>
          <option value="REJECTED">مرفوض</option>
        </select>
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} style={{ ...inp, maxWidth: 200 }}>
          <option value="">التصنيف — الكل</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={supplierFilter} onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }} style={{ ...inp, maxWidth: 180 }}>
          <option value="">المورد — الكل</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }} style={{ ...inp, maxWidth: 130 }}>
          <option value="">الشهر — الكل</option>
          {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
        </select>
        <select value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1); }} style={{ ...inp, maxWidth: 100 }}>
          <option value="">السنة — الكل</option>
          {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {isFiltered && <button type="button" className="btn secondary sm" onClick={resetFilters}>{t('action.reset_filters')}</button>}
        <button type="button" className="btn secondary" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
        <button type="button" className="btn secondary sm" onClick={exportExcel} disabled={exportingExcel}>
          {exportingExcel ? '⏳' : '⬇'} Excel
        </button>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        emptyText={t('empty.expenses')}
        isFiltered={isFiltered}
        onResetFilters={resetFilters}
        emptyAction={hasPermission('expenses.create') ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t('mod.expenses.create')}</button>
        ) : undefined}
        actions={(row: any) => (
          <>
            {hasPermission('expenses.update') && row.status !== 'APPROVED' && (
              <button type="button" className="btn secondary sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>
            )}{' '}
            {hasPermission('expenses.approve') && row.status === 'PENDING' && (
              <button type="button" className="btn sm" onClick={() => approve(row.id)}>{t('action.approve')}</button>
            )}{' '}
            {hasPermission('expenses.approve') && row.status === 'PENDING' && (
              <button type="button" className="btn secondary sm" onClick={() => reject(row.id)}>{t('action.reject')}</button>
            )}{' '}
            {hasPermission('expenses.delete') && row.status !== 'APPROVED' && (
              <button type="button" className="btn danger sm" onClick={() => remove(row.id)}>{t('action.delete')}</button>
            )}
          </>
        )}
      />

      {creating && <ExpenseForm onClose={() => setCreating(false)} onSaved={load} suppliers={suppliers} />}
      {editing && <ExpenseForm expense={editing} onClose={() => setEditing(null)} onSaved={load} suppliers={suppliers} />}
    </div>
  );
}

// ===== Expense Form (Create + Edit) =====
function ExpenseForm({
  expense,
  onClose,
  onSaved,
  suppliers,
}: {
  expense?: any;
  onClose: () => void;
  onSaved: () => void;
  suppliers: any[];
}) {
  const { t } = useT();
  const isEdit = !!expense;
  const now = new Date();

  const [category, setCategory] = useState<string>(expense?.category ?? 'FUEL');
  const [customCategory, setCustomCategory] = useState<string>(expense?.customCategory ?? '');
  const [description, setDescription] = useState<string>(expense?.description ?? '');
  const [amount, setAmount] = useState<number>(Number(expense?.amount) || 0);
  const [date, setDate] = useState<string>(expense?.date ? String(expense.date).slice(0, 10) : now.toISOString().slice(0, 10));
  const [billingMonth, setBillingMonth] = useState<number>(Number(expense?.billingMonth) || (now.getMonth() + 1));
  const [billingYear, setBillingYear] = useState<number>(Number(expense?.billingYear) || now.getFullYear());
  const [notes, setNotes] = useState<string>(expense?.notes ?? '');

  const SUPPLIER_OTHER = '__OTHER__';
  // Determine initial supplierId value
  const initialSupId = expense?.supplierId ? String(expense.supplierId) : (expense?.customSupplierName ? SUPPLIER_OTHER : '');
  const [supplierId, setSupplierId] = useState<string>(initialSupId);
  const [customSupplierName, setCustomSupplierName] = useState<string>(expense?.customSupplierName ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inp: React.CSSProperties = {
    padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, outline: 'none',
  };

  async function submit() {
    setError('');
    if (!description.trim()) { setError('الوصف مطلوب'); return; }
    if (!amount || amount <= 0) { setError('المبلغ يجب أن يكون موجبًا'); return; }
    if (category === 'OTHER' && !customCategory.trim()) { setError('تصنيف مخصص مطلوب عند اختيار أخرى'); return; }
    if (supplierId === SUPPLIER_OTHER && !customSupplierName.trim()) { setError('اسم المورد مطلوب عند اختيار أخرى'); return; }

    setSaving(true);
    const payload = {
      category,
      description: description.trim(),
      amount,
      date: date || undefined,
      billingMonth,
      billingYear,
      notes: notes.trim() || undefined,
      customCategory: category === 'OTHER' ? customCategory.trim() : undefined,
      supplierId: supplierId && supplierId !== SUPPLIER_OTHER ? Number(supplierId) : undefined,
      customSupplierName: supplierId === SUPPLIER_OTHER ? customSupplierName.trim() : undefined,
    };
    try {
      if (isEdit) {
        await api.put(`/expenses/${expense.id}`, payload);
      } else {
        await api.post('/expenses', payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? 'تعديل المصروف' : 'مصروف جديد'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
          <button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
        </>
      }
    >
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>التصنيف *</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inp}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        {category === 'OTHER' && (
          <div className="field">
            <label>تصنيف مخصص *</label>
            <input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="اكتب التصنيف" style={inp} />
          </div>
        )}
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>الوصف *</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف المصروف" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div className="field">
          <label>المبلغ (د.ك) *</label>
          <input type="number" min="0.001" step="0.001" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={inp} />
        </div>
        <div className="field">
          <label>التاريخ</label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const v = e.target.value;
              setDate(v);
              if (v) {
                const d = new Date(v);
                setBillingMonth(d.getMonth() + 1);
                setBillingYear(d.getFullYear());
              }
            }}
            style={inp}
          />
        </div>
        <div className="field">
          <label>شهر الحساب</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={billingMonth} onChange={(e) => setBillingMonth(Number(e.target.value))} style={{ ...inp, flex: 1 }}>
              {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
            <select value={billingYear} onChange={(e) => setBillingYear(Number(e.target.value))} style={{ ...inp, width: 90 }}>
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>المورد</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inp}>
            <option value="">— اختر مورداً —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value={SUPPLIER_OTHER}>أخرى (كتابة حرة)</option>
          </select>
        </div>
        {supplierId === SUPPLIER_OTHER && (
          <div className="field">
            <label>اسم المورد *</label>
            <input value={customSupplierName} onChange={(e) => setCustomSupplierName(e.target.value)} placeholder="اسم المورد" style={inp} />
          </div>
        )}
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>{t('field.notes')}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...inp, width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
            placeholder="ملاحظات (اختياري)"
          />
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 11.1** — Write the full `Expenses.tsx` file as shown above to `frontend/src/pages/Expenses.tsx`

- [ ] **Step 11.2** — Update `frontend/src/App.tsx`: replace the ResourcePage route for expenses with the new page. Find (around line 69):
```tsx
<Route path="/expenses" element={<ResourcePage moduleKey="expenses" />} />
```
Replace with:
```tsx
<Route path="/expenses" element={<Expenses />} />
```
And add the import at the top of App.tsx:
```tsx
import Expenses from './pages/Expenses';
```

- [ ] **Step 11.3** — Optional: Remove or comment the `expenses` entry from `modules.tsx` fields array (to avoid confusion) — leave the columns/statusFilter for any places that still reference it; or keep it as-is since it's no longer routed through ResourcePage.

- [ ] **Step 11.4** — Frontend type-check
```bash
cd frontend && npx tsc --noEmit
```
Fix any type errors before proceeding.

- [ ] **Step 11.5** — Commit
```bash
git add frontend/src/pages/Expenses.tsx frontend/src/App.tsx
git commit -m "feat(expenses): dedicated Expenses page with KPI strip, filters, new categories, billing month/year, custom supplier, notes, Excel export"
```

---

## T12 — Full Validation Suite

- [ ] **Step 12.1** — Prisma validate
```bash
cd backend && npx prisma validate
```

- [ ] **Step 12.2** — Backend type-check
```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 12.3** — Frontend type-check
```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 12.4** — Electron type-check
```bash
tsc -p electron/tsconfig.json --noEmit
```

- [ ] **Step 12.5** — Run tests
```bash
cd backend && npm test
```
Expected: All tests pass.

- [ ] **Step 12.6** — Build backend
```bash
npm run build:back
```

- [ ] **Step 12.7** — Build frontend
```bash
npm run build:front
```

- [ ] **Step 12.8** — Commit if all green (or fix failures first)
```bash
git add .
git commit -m "chore: validate all targets — business alignment pack T1-T11 complete"
```

---

## A1 — Analysis: Agreements Refactor (Item 8)

> No code changes. Run DB queries to gather live statistics, then write analysis.

### Step A1.0 — Gather Live DB Statistics

Run these SQL queries against `backend/data/manar.db` using Prisma Studio (`cd backend && npx prisma studio`) or directly via SQLite:

```sql
-- Total contracts
SELECT COUNT(*) AS total_contracts FROM contracts;

-- Contracts with at least one invoice
SELECT COUNT(DISTINCT contractId) AS contracts_with_invoices FROM invoices WHERE contractId IS NOT NULL;

-- Total invoices linked to a contract
SELECT COUNT(*) AS invoices_with_contract FROM invoices WHERE contractId IS NOT NULL;

-- Contracts with ZERO invoices (unused)
SELECT COUNT(*) AS unused_contracts
FROM contracts c
WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.contractId = c.id);

-- Customers that have at least one linked project price
SELECT COUNT(DISTINCT customerId) AS customers_with_prices FROM project_prices WHERE customerId IS NOT NULL;

-- Total project price entries
SELECT COUNT(*) AS total_price_entries FROM project_prices;

-- Breakdown: invoices by direction
SELECT direction, COUNT(*) FROM invoices GROUP BY direction;
```

**Live DB Results (queried 2026-06-17 against `backend/data/manar.db`):**

| Metric | Value |
|--------|-------|
| Total contracts | **0** |
| Contracts linked to invoices | **0** |
| Invoices linked to a contract | **0** |
| Total invoices (all) | **14** |
| Invoice directions | **14 × SALES, 0 × PURCHASE** |
| Unused contracts | **0** (no contracts exist at all) |
| Customers linked to project prices | **0** (no customerId set on any price entry) |
| Total project price entries | **18** |
| Active customers | **5** |

**Interpretation:**
- The system is in its operational early phase. All 14 invoices are SALES (نقليات عميل). No contracts have been entered yet.
- 18 project price entries exist but none are linked to a specific customer (customerId = NULL) — they appear to be general price templates, not per-customer agreements.
- The "Contracts" module is unused so far. This means a full Agreements refactor has **zero migration risk** — no data to preserve.

### Current State

| Area | Current Label | DB Field | UI Location |
|------|--------------|----------|-------------|
| Main price table | الأسعار الثابتة | `project_prices` | nav.prices → /prices |
| Price in invoice | أسعار (picker) | `project_prices` | CreateInvoice / EditInvoice |
| Contract | العقد المرتبط | `contracts.id` | Invoice form, Contract page |
| Customer | العميل | `customers.id` | Invoice, Contract |

### Target Flow
```
Customer → Price Agreement → Invoice → Collection
```

### Impact of Renaming "Project Prices" → "اتفاقيات الأسعار"

1. **DB layer**: `project_prices` table name — no change needed (internal key only).
2. **i18n keys affected**: `page.prices.title`, `page.prices.subtitle`, `nav.prices`, `modal.new_price`, `modal.edit_price`.
3. **Files to touch** (UI labels only):
   - `frontend/src/lib/i18n.ts` — update the 6 prices keys
   - `frontend/src/config/modules.tsx` — update `prices.label` group text
   - `frontend/src/components/Layout.tsx` — sidebar item label (already via i18n)
4. **No schema change required.**
5. **Risk**: LOW — pure string renames in i18n.

### Where Contracts Currently Appear

| Location | Purpose | Can reduce? |
|----------|---------|------------|
| Invoice form — `contractId` | Links invoice to a contract for reporting | YES — most invoices don't have contracts |
| Expenses form — `contractId` | Links expense to contract | YES — already removed in T11 |
| Contract page | CRUD for contracts | Keep as-is |
| Customer page | `_count.contracts` shown | Keep |
| Reports page | Contracts report | Keep |

### Phase 1 Recommendations (no code yet)

1. Rename "الأسعار الثابتة" → "اتفاقيات الأسعار" in i18n (i18n-only, zero risk).
2. Make `contractId` optional in Invoice form and collapse it behind an "إضافة عقد" toggle.
3. Add a "Price Agreement" link to Customer detail view (future phase).
4. Add `agreementId` FK on Invoice pointing to `project_prices` (future phase — requires migration).

### Estimated Phase 1 Scope (future work)

- 1 i18n file: ~8 string changes
- 1 modules.tsx: 1 label change
- 0 migrations required

---

## A2 — Analysis: Export = Canonical Template Audit (Item 9)

> No code changes. This section is the deliverable.

### Current Export Files

| Module | Export Method | Columns | Import Template | Match? |
|--------|-------------|---------|----------------|--------|
| Customers | `modules.tsx supportsExport` via ResourcePage | code, name, type, phone, contactName | `import/validators/customers.ts` | Partial |
| Equipment | ResourcePage export | code, type, ownerName, driverName, plateNumber | `import/validators/equipment.ts` | Partial |
| Employees | ResourcePage export | code, fullName, jobTitle, nationality, civilId | `import/validators/employees.ts` | Partial |
| Invoices | `Invoices.tsx exportExcel` | 9 columns (after T8) | No import | N/A |
| Expenses | `Expenses.tsx exportExcel` (new, T11) | 8 columns | `import/validators/expenses.ts` | Partial |
| Contracts | ResourcePage export | code, asphaltPlant, status, etc. | `import/validators/contracts.ts` | Partial |
| Prices | ResourcePage export | asphaltPlant, companyName, location, unit, unitPrice | `import/validators/prices.ts` | Partial |

### Key Gaps (Export → Edit → Import same file)

1. **Customers**: Export has `code, name, type, phone, contactName`. Import validator accepts the same fields → **near match**. Gap: export uses translated type labels ('حكومي'/'خاص') but import expects 'GOVERNMENT'/'PRIVATE'.
2. **Equipment**: Export has Arabic status ('تعمل') but import expects 'WORKING'. Same gap.
3. **Employees**: Export has no `status` column. Import requires it. Gap.
4. **Expenses**: No import template exists. Export-only.
5. **Invoices/Prices**: No import path exists for these.

### What's Required for "Export → Edit → Import same file"

| Module | Gap to fix | Effort |
|--------|-----------|--------|
| Customers | Use raw enum values in export OR add value mapping in import validator | Low |
| Equipment | Same as customers | Low |
| Employees | Add `status` column to export with raw enum | Low |
| Contracts | Review column name alignment | Low |
| Prices | No import validator — build one | Medium |
| Invoices | Complex (line items, payments) — not feasible as single flat file | High |
| Expenses | No import validator — build one if needed | Medium |

### Recommendation

Phase 1 (low effort):
- Fix enum value output in ResourcePage export (`GOVERNMENT` instead of `حكومي`) — 1 change in the generic export function
- Add `status` column to employees export
- This alone achieves round-trip for Customers, Equipment, Employees, Contracts

Phase 2 (medium effort):
- Build import validators for Prices and Expenses

Phase 3 (high effort / future):
- Invoice round-trip not recommended — invoices have line items and payments that don't flatten to a single-row-per-invoice format

---

## Post-Implementation Checklist

Before marking branch ready for Gemini review:

- [ ] All 7 tsc/validate/test/build checks pass (T12)
- [ ] `prisma validate` passes
- [ ] `npm test` — all backend tests green
- [ ] `build:back` succeeds
- [ ] `build:front` succeeds
- [ ] Direction labels updated in all invoice UI locations
- [ ] Invoice Excel export no longer has 'الحالة' / 'تاريخ الفاتورة'
- [ ] Invoice print shows 'الجهة' alone when no contract
- [ ] Expenses page replaces ResourcePage (route works)
- [ ] New expense categories selectable in form
- [ ] billingMonth/billingYear auto-set from date and independently editable
- [ ] 'أخرى' category shows custom field
- [ ] 'أخرى' supplier shows free-text field
- [ ] notes textarea visible in expense form
- [ ] No contractId field in expense form
- [ ] Excel export for expenses respects active filters
- [ ] Customer create conflict message names the conflicting customer
- [ ] Contracts/Employees/Equipment/Cheques conflict messages include record details
- [ ] Customer default type = PRIVATE in create form
- [ ] Analysis texts for Items 8 and 9 written in plan document

### Regression Risk Assessment

| Area | Risk | Why |
|------|------|-----|
| Existing invoices | LOW | Only label changes; DB values unchanged |
| Existing expenses data | LOW | All new columns nullable; old rows unaffected |
| Expense approve/reject | LOW | Logic unchanged; new page delegates to same API |
| Customer conflict | LOW | More information in error, not less |
| Reports invoice export | LOW | New columns added, old ones replaced by equivalent data |
| ResourcePage (other modules) | NONE | Expenses removed from it; others untouched |

### Readiness for Gemini Review

**YES** — provided T12 all-green. The branch is ready for architectural review when:
1. All type checks pass
2. All tests pass
3. Both builds succeed
4. Manual smoke test of expenses page (create, edit, filter, export)
