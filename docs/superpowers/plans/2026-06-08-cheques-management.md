# Cheques Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full Cheques Management module (إدارة الشيكات) to manarERP — covering backend CRUD + status transitions, RBAC permissions, i18n, and a dedicated frontend page with live cheque preview and browser print support.

**Architecture:** Follows the existing 4-file backend module pattern (routes → controller → service → schema), adds a `Cheque` Prisma model with a new migration, and uses a custom React page (like `Inventory.tsx`) since the layout is too specific for the generic `ResourcePage`. Printing uses `window.print()` with `@media print` CSS to isolate the cheque preview div.

**Tech Stack:** Express + Prisma + SQLite (backend), React 18 + TypeScript + Axios (frontend), Zod validation, existing `DataTable`, `StatCard`, `Modal` components, `useT` i18n hook.

---

## File Map

### Created
| File | Purpose |
|------|---------|
| `backend/src/modules/cheques/cheques.schema.ts` | Zod input validation schemas |
| `backend/src/modules/cheques/cheques.service.ts` | Business logic + Prisma queries |
| `backend/src/modules/cheques/cheques.controller.ts` | Thin Express handlers |
| `backend/src/modules/cheques/cheques.routes.ts` | Express router with auth + permission guards |
| `frontend/src/pages/Cheques.tsx` | Full-featured cheques page |

### Modified
| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add `Cheque` model |
| `backend/src/config/constants.ts` | Add `'cheques'` to MODULES, `'print'` to ACTIONS, `chequeStatus` to ENUMS |
| `backend/src/app.ts` | Register `/api/cheques` router |
| `backend/prisma/seed.ts` | Add cheques permissions + role assignments |
| `frontend/src/App.tsx` | Add `/cheques` route |
| `frontend/src/config/modules.tsx` | Add cheques entry to `NAV` array |
| `frontend/src/lib/i18n.ts` | Add Arabic + English cheques translations |

---

## Task 1: Git Setup

**Files:** none

- [ ] **Step 1: Verify clean state on production**

```bash
git checkout production
git pull origin production
git status
```

Expected: `On branch production`, no staged changes (one untracked file `frontend/src/pages/index.html` is OK).

- [ ] **Step 2: Create safety checkpoint tag**

```bash
git tag pre-cheques-management
git push origin pre-cheques-management
```

Expected: Tag pushed without error.

- [ ] **Step 3: Create feature branch**

```bash
git checkout -b feature/cheques-management
```

Expected: `Switched to a new branch 'feature/cheques-management'`.

---

## Task 2: Prisma Schema — Add Cheque Model

**Files:**
- Modify: `backend/prisma/schema.prisma` (end of file)

- [ ] **Step 1: Add Cheque model to schema.prisma**

Append the following block at the end of `backend/prisma/schema.prisma` (after the last `@@map("material_issue_items")` closing brace):

```prisma
// ─────────────────────────────────────────────────────────────────────────
//  الشيكات (Cheques)
// ─────────────────────────────────────────────────────────────────────────

model Cheque {
  id              Int       @id @default(autoincrement())
  chequeNumber    String    @unique
  chequeDate      DateTime
  beneficiaryName String
  amount          Float
  currency        String    @default("KWD")
  description     String?
  bankName        String
  templateName    String?
  status          String    @default("DRAFT") // DRAFT | PRINTED | CANCELLED
  printedAt       DateTime?
  cancelledAt     DateTime?
  notes           String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([chequeDate])
  @@index([beneficiaryName])
  @@map("cheques")
}
```

- [ ] **Step 2: Run Prisma migration**

```bash
cd backend && npx prisma migrate dev --name add_cheques_table
```

Expected output includes:
```
✔ Generated Prisma Client
The following migration(s) have been applied:
  migrations/YYYYMMDDHHMMSS_add_cheques_table/migration.sql
```

- [ ] **Step 3: Regenerate Prisma Client**

```bash
npm run db:generate
```

Expected: `Generated Prisma Client` in output. The `prisma.cheque.*` methods are now available.

- [ ] **Step 4: Verify Prisma validate**

```bash
cd backend && npx prisma validate
```

Expected: `The schema at ... is valid 🚀`

---

## Task 3: Update Backend Constants

**Files:**
- Modify: `backend/src/config/constants.ts`

- [ ] **Step 1: Add 'cheques' to MODULES and 'print' to ACTIONS and chequeStatus to ENUMS**

Replace the current MODULES, ACTIONS, and ENUMS blocks in `backend/src/config/constants.ts` with:

```typescript
/** وحدات النظام (تُستخدم في مفاتيح الصلاحيات والـ Audit). */
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
] as const;

export type ModuleName = (typeof MODULES)[number];

/** الإجراءات الذرّية للصلاحيات. */
export const ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'approve',
  'export',
  'pay',
  'generate',
  'payslip',
  'adjust',
  'cancel',
  'print',
] as const;
export type ActionName = (typeof ACTIONS)[number];

/** القيم المسموحة للحقول النصية (تُفرض في طبقة Zod). */
export const ENUMS = {
  customerType: ['GOVERNMENT', 'PRIVATE'] as const,
  employeeStatus: ['ACTIVE', 'ON_LEAVE', 'TERMINATED'] as const,
  equipmentStatus: ['WORKING', 'NOT_WORKING'] as const,
  contractStatus: ['ACTIVE', 'EXPIRED', 'RENEWING', 'SUSPENDED'] as const,
  invoiceDirection: ['SALES', 'PURCHASE'] as const,
  invoiceType: ['نقل اسفلت', 'يومية عمل مالينج', 'يومية نقل اسفلت'] as const,
  invoiceUnit: ['طن', 'درب', 'يومية'] as const,
  invoiceStatus: ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'] as const,
  expenseCategory: [
    'FUEL',
    'SALARIES',
    'MAINTENANCE',
    'RENT',
    'PURCHASES',
    'EQUIPMENT',
    'SERVICES',
    'OTHER',
  ] as const,
  expenseStatus: ['PENDING', 'APPROVED', 'REJECTED'] as const,
  transactionType: ['REVENUE', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT'] as const,
  payrollStatus: ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'] as const,
  paymentMethod: ['CASH', 'BANK', 'CHEQUE', 'TRANSFER'] as const,
  maintenanceType: ['PREVENTIVE', 'CORRECTIVE'] as const,
  backupType: ['MANUAL', 'AUTO', 'SCHEDULED'] as const,
  materialUnit: ['طن', 'كيلو', 'لتر', 'قطعة', 'متر', 'كيس', 'برميل', 'صندوق'] as const,
  purchaseOrderStatus: ['DRAFT', 'SUBMITTED', 'RECEIVED', 'CANCELLED'] as const,
  goodsReceiptStatus: ['DRAFT', 'POSTED'] as const,
  materialIssueStatus: ['DRAFT', 'POSTED', 'CANCELLED'] as const,
  chequeStatus: ['DRAFT', 'PRINTED', 'CANCELLED'] as const,
} as const;
```

---

## Task 4: Create Backend Module Files

**Files:**
- Create: `backend/src/modules/cheques/cheques.schema.ts`
- Create: `backend/src/modules/cheques/cheques.service.ts`
- Create: `backend/src/modules/cheques/cheques.controller.ts`
- Create: `backend/src/modules/cheques/cheques.routes.ts`

- [ ] **Step 1: Create cheques.schema.ts**

Create `backend/src/modules/cheques/cheques.schema.ts`:

```typescript
import { z } from 'zod';
import { ENUMS } from '../../config/constants';

export const createChequeSchema = z.object({
  body: z.object({
    chequeNumber: z.string().min(1, 'رقم الشيك مطلوب'),
    chequeDate: z.coerce.date(),
    beneficiaryName: z.string().min(1, 'اسم المستفيد مطلوب'),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون موجبًا'),
    currency: z.string().min(1).default('KWD'),
    description: z.string().optional(),
    bankName: z.string().min(1, 'اسم البنك مطلوب'),
    templateName: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const updateChequeSchema = z.object({
  body: z.object({
    chequeNumber: z.string().min(1).optional(),
    chequeDate: z.coerce.date().optional(),
    beneficiaryName: z.string().min(1).optional(),
    amount: z.coerce.number().positive().optional(),
    currency: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    bankName: z.string().min(1).optional(),
    templateName: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    status: z.enum(ENUMS.chequeStatus).optional(),
  }),
});

export type CreateChequeInput = z.infer<typeof createChequeSchema>['body'];
export type UpdateChequeInput = z.infer<typeof updateChequeSchema>['body'];
```

- [ ] **Step 2: Create cheques.service.ts**

Create `backend/src/modules/cheques/cheques.service.ts`:

```typescript
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { CreateChequeInput, UpdateChequeInput } from './cheques.schema';

export class ChequesService {
  async stats() {
    const [total, draft, printed, cancelled] = await Promise.all([
      prisma.cheque.count(),
      prisma.cheque.count({ where: { status: 'DRAFT' } }),
      prisma.cheque.count({ where: { status: 'PRINTED' } }),
      prisma.cheque.count({ where: { status: 'CANCELLED' } }),
    ]);
    return { total, draft, printed, cancelled };
  }

  async list(query: PaginationQuery & { status?: string; from?: string; to?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.ChequeWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.chequeDate = {};
      if (query.from) where.chequeDate.gte = new Date(query.from);
      if (query.to) where.chequeDate.lte = new Date(query.to);
    }
    if (query.search) {
      where.OR = [
        { beneficiaryName: { contains: query.search } },
        { chequeNumber: { contains: query.search } },
        { bankName: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.cheque.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.cheque.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const cheque = await prisma.cheque.findUnique({ where: { id } });
    if (!cheque) throw AppError.notFound('الشيك غير موجود');
    return cheque;
  }

  async create(input: CreateChequeInput, req: Request) {
    const existing = await prisma.cheque.findUnique({ where: { chequeNumber: input.chequeNumber } });
    if (existing) throw AppError.conflict('رقم الشيك مستخدم بالفعل');

    const cheque = await prisma.cheque.create({
      data: {
        chequeNumber: input.chequeNumber,
        chequeDate: input.chequeDate,
        beneficiaryName: input.beneficiaryName,
        amount: input.amount,
        currency: input.currency ?? 'KWD',
        description: input.description ?? null,
        bankName: input.bankName,
        templateName: input.templateName ?? null,
        notes: input.notes ?? null,
        status: 'DRAFT',
      },
    });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'cheques',
      entityId: cheque.id,
      newValue: { chequeNumber: cheque.chequeNumber, amount: cheque.amount },
    });
    return cheque;
  }

  async update(id: number, input: UpdateChequeInput, req: Request) {
    const current = await prisma.cheque.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('الشيك غير موجود');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن تعديل شيك ملغي');
    if (current.status === 'PRINTED') throw AppError.badRequest('لا يمكن تعديل شيك مطبوع');

    if (input.chequeNumber && input.chequeNumber !== current.chequeNumber) {
      const dup = await prisma.cheque.findUnique({ where: { chequeNumber: input.chequeNumber } });
      if (dup) throw AppError.conflict('رقم الشيك مستخدم بالفعل');
    }

    const cheque = await prisma.cheque.update({
      where: { id },
      data: {
        chequeNumber: input.chequeNumber ?? current.chequeNumber,
        chequeDate: input.chequeDate ?? current.chequeDate,
        beneficiaryName: input.beneficiaryName ?? current.beneficiaryName,
        amount: input.amount ?? current.amount,
        currency: input.currency ?? current.currency,
        description: input.description === undefined ? current.description : (input.description ?? null),
        bankName: input.bankName ?? current.bankName,
        templateName: input.templateName === undefined ? current.templateName : (input.templateName ?? null),
        notes: input.notes === undefined ? current.notes : (input.notes ?? null),
      },
    });
    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'cheques',
      entityId: id,
      oldValue: current,
      newValue: input,
    });
    return cheque;
  }

  async markPrinted(id: number, req: Request) {
    const current = await prisma.cheque.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('الشيك غير موجود');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن طباعة شيك ملغي');
    if (current.status === 'PRINTED') throw AppError.badRequest('الشيك مطبوع بالفعل');

    const cheque = await prisma.cheque.update({
      where: { id },
      data: { status: 'PRINTED', printedAt: new Date() },
    });
    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'cheques',
      entityId: id,
      newValue: { status: 'PRINTED' },
    });
    return cheque;
  }

  async cancel(id: number, req: Request) {
    const current = await prisma.cheque.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('الشيك غير موجود');
    if (current.status === 'CANCELLED') throw AppError.badRequest('الشيك ملغي بالفعل');

    const cheque = await prisma.cheque.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await recordAudit({
      req,
      action: 'CANCEL',
      module: 'cheques',
      entityId: id,
      newValue: { status: 'CANCELLED' },
    });
    return cheque;
  }
}

export const chequesService = new ChequesService();
```

- [ ] **Step 3: Create cheques.controller.ts**

Create `backend/src/modules/cheques/cheques.controller.ts`:

```typescript
import { Request, Response } from 'express';
import { chequesService } from './cheques.service';
import { ok, created } from '../../core/utils/response';

export const chequesController = {
  async stats(req: Request, res: Response) {
    ok(res, await chequesService.stats());
  },
  async list(req: Request, res: Response) {
    ok(res, await chequesService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await chequesService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await chequesService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await chequesService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async markPrinted(req: Request, res: Response) {
    ok(res, await chequesService.markPrinted(Number(req.params.id), req), 'تم تسجيل الطباعة');
  },
  async cancel(req: Request, res: Response) {
    ok(res, await chequesService.cancel(Number(req.params.id), req), 'تم إلغاء الشيك');
  },
};
```

- [ ] **Step 4: Create cheques.routes.ts**

Create `backend/src/modules/cheques/cheques.routes.ts`:

```typescript
import { Router } from 'express';
import { chequesController } from './cheques.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { createChequeSchema, updateChequeSchema } from './cheques.schema';

const router = Router();
router.use(authenticate);

// /stats must be before /:id to avoid Express matching 'stats' as an id param
router.get('/stats', requirePermission('cheques.read'), asyncHandler(chequesController.stats));
router.get('/', requirePermission('cheques.read'), asyncHandler(chequesController.list));
router.get('/:id', requirePermission('cheques.read'), asyncHandler(chequesController.getById));
router.post('/', requirePermission('cheques.create'), validate(createChequeSchema), asyncHandler(chequesController.create));
router.put('/:id', requirePermission('cheques.update'), validate(updateChequeSchema), asyncHandler(chequesController.update));
router.post('/:id/mark-printed', requirePermission('cheques.print'), asyncHandler(chequesController.markPrinted));
router.post('/:id/cancel', requirePermission('cheques.cancel'), asyncHandler(chequesController.cancel));

export default router;
```

---

## Task 5: Register Router in app.ts

**Files:**
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Add cheques router import**

In `backend/src/app.ts`, add after the `inventoryRoutes` import line:

```typescript
import chequesRoutes from './modules/cheques/cheques.routes';
```

- [ ] **Step 2: Register cheques route**

In `backend/src/app.ts`, add after `app.use('/api/inventory', inventoryRoutes);`:

```typescript
app.use('/api/cheques', chequesRoutes);
```

---

## Task 6: Update Seed (Permissions + Role Assignments)

**Files:**
- Modify: `backend/prisma/seed.ts`

- [ ] **Step 1: Add cheques to MODULE_ACTIONS**

In `backend/prisma/seed.ts`, in the `MODULE_ACTIONS` object, add after the `inventory` line:

```javascript
cheques: ['read', 'create', 'update', 'print', 'cancel'],
```

The `MODULE_ACTIONS` should now include this entry.

- [ ] **Step 2: Add 'print' to ACTION_AR**

In `backend/prisma/seed.ts`, in the `ACTION_AR` object, add after `cancel`:

```javascript
print: 'طباعة',
```

- [ ] **Step 3: Add cheques to ACCOUNTANT role permissions**

In `backend/prisma/seed.ts`, update the `ACCOUNTANT` entry in `rolePermissionMap` to include `'cheques'`:

```javascript
ACCOUNTANT: [
  ...keysForModules(['invoices', 'expenses', 'transactions', 'suppliers', 'reports', 'customers', 'cheques']),
  ...readOnly(['dashboard', 'contracts', 'employees', 'equipment', 'payroll', 'audit']),
  'payroll.export',
  'payroll.pay',
  'payroll.payslip',
  'inventory.read',
  'inventory.export',
],
```

Note: `SYSTEM_ADMIN` and `GENERAL_MANAGER` automatically receive all permissions including cheques (they use `allKeys`). No changes needed for them.

- [ ] **Step 4: Run seed to apply new permissions**

```bash
cd backend && npx ts-node --project tsconfig.json -e "require('./prisma/seed')" 2>/dev/null || npx tsx prisma/seed.ts
```

Or using npm script if available:
```bash
npm run db:seed
```

Expected: Output shows new cheques permissions being upserted.

---

## Task 7: i18n Translations

**Files:**
- Modify: `frontend/src/lib/i18n.ts`

- [ ] **Step 1: Add Arabic cheques translations**

In `frontend/src/lib/i18n.ts`, inside the `ar` block, add the following block after the `'opt.sal.payment.bank_transfer'` entry (the last ar entry before the closing brace):

```typescript
    // ── Cheques ───────────────────────────────────────────────────────────────
    'nav.cheques': 'إدارة الشيكات',
    'page.cheques.title': 'إدارة الشيكات',
    'page.cheques.subtitle': 'إصدار الشيكات ومتابعة حالتها',
    'page.cheques.new': 'شيك جديد',
    'page.cheques.reset': 'مسح النموذج',
    'page.cheques.save': 'حفظ الشيك',
    'page.cheques.print': 'طباعة الشيك',
    'page.cheques.mark_printed': 'تأكيد الطباعة',
    'page.cheques.cancel_cheque': 'إلغاء الشيك',
    'page.cheques.edit': 'تعديل',
    'page.cheques.history': 'سجل الشيكات',
    'page.cheques.preview': 'معاينة الشيك',
    'page.cheques.form': 'بيانات الشيك',
    'page.cheques.confirm_cancel': 'هل تريد إلغاء هذا الشيك؟',
    'page.cheques.confirm_printed': 'هل تم طباعة الشيك بنجاح؟ سيتم تسجيله كـ"مطبوع".',
    'stat.cheques.total': 'إجمالي الشيكات',
    'stat.cheques.draft': 'مسودة',
    'stat.cheques.printed': 'مطبوع',
    'stat.cheques.cancelled': 'ملغي',
    'field.cheque.number': 'رقم الشيك',
    'field.cheque.date': 'تاريخ الشيك',
    'field.cheque.beneficiary': 'اسم المستفيد',
    'field.cheque.amount': 'المبلغ',
    'field.cheque.currency': 'العملة',
    'field.cheque.description': 'وذلك لقاء',
    'field.cheque.bank': 'اسم البنك',
    'field.cheque.template': 'النموذج / القالب',
    'field.cheque.notes': 'ملاحظات',
    'col.cheque.number': 'رقم الشيك',
    'col.cheque.date': 'التاريخ',
    'col.cheque.beneficiary': 'المستفيد',
    'col.cheque.amount': 'المبلغ',
    'col.cheque.currency': 'العملة',
    'col.cheque.bank': 'البنك',
    'col.cheque.status': 'الحالة',
    'cheque.status.draft': 'مسودة',
    'cheque.status.printed': 'مطبوع',
    'cheque.status.cancelled': 'ملغي',
    'error.cheque.number_required': 'رقم الشيك مطلوب',
    'error.cheque.date_required': 'تاريخ الشيك مطلوب',
    'error.cheque.beneficiary_required': 'اسم المستفيد مطلوب',
    'error.cheque.amount_required': 'المبلغ مطلوب وأكبر من صفر',
    'error.cheque.bank_required': 'اسم البنك مطلوب',
    'error.cheque.currency_required': 'العملة مطلوبة',
    'msg.cheque.saved': 'تم حفظ الشيك بنجاح',
    'msg.cheque.printed': 'تم تسجيل الطباعة بنجاح',
    'msg.cheque.cancelled': 'تم إلغاء الشيك',
    'msg.cheque.updated': 'تم تحديث الشيك بنجاح',
    'ph.cheque.beneficiary': 'اسم الشخص أو الجهة المستفيدة',
    'ph.cheque.description': 'سبب أو بيان الشيك',
    'ph.cheque.bank': 'مثال: بنك الكويت الوطني',
    'ph.cheque.number': 'مثال: 123456',
    'empty.cheques': 'لا توجد شيكات',
    'lbl.cheque.company': 'شركة المنار الدولية',
    'lbl.cheque.pay_to': 'ادفعوا بموجب هذا الشيك لأمر السيد/ة',
    'lbl.cheque.amount_label': 'مبلغ وقدره',
    'lbl.cheque.for': 'وذلك لقاء',
    'lbl.cheque.signature': 'التوقيع المفوّض',
    'btn.cheque.select': 'تحديد للعرض',
```

- [ ] **Step 2: Add English cheques translations**

In `frontend/src/lib/i18n.ts`, inside the `en` block, add the following block after the last en entry (find the en block's last entry before its closing brace):

```typescript
    // ── Cheques ───────────────────────────────────────────────────────────────
    'nav.cheques': 'Cheques',
    'page.cheques.title': 'Cheques Management',
    'page.cheques.subtitle': 'Issue and track cheques',
    'page.cheques.new': 'New Cheque',
    'page.cheques.reset': 'Reset Form',
    'page.cheques.save': 'Save Cheque',
    'page.cheques.print': 'Print Cheque',
    'page.cheques.mark_printed': 'Confirm Printed',
    'page.cheques.cancel_cheque': 'Cancel Cheque',
    'page.cheques.edit': 'Edit',
    'page.cheques.history': 'Cheques History',
    'page.cheques.preview': 'Cheque Preview',
    'page.cheques.form': 'Cheque Details',
    'page.cheques.confirm_cancel': 'Cancel this cheque?',
    'page.cheques.confirm_printed': 'Was the cheque printed successfully? It will be marked as "Printed".',
    'stat.cheques.total': 'Total Cheques',
    'stat.cheques.draft': 'Draft',
    'stat.cheques.printed': 'Printed',
    'stat.cheques.cancelled': 'Cancelled',
    'field.cheque.number': 'Cheque No.',
    'field.cheque.date': 'Cheque Date',
    'field.cheque.beneficiary': 'Beneficiary Name',
    'field.cheque.amount': 'Amount',
    'field.cheque.currency': 'Currency',
    'field.cheque.description': 'Description / For',
    'field.cheque.bank': 'Bank Name',
    'field.cheque.template': 'Template / Layout',
    'field.cheque.notes': 'Notes',
    'col.cheque.number': 'Cheque No.',
    'col.cheque.date': 'Date',
    'col.cheque.beneficiary': 'Beneficiary',
    'col.cheque.amount': 'Amount',
    'col.cheque.currency': 'Currency',
    'col.cheque.bank': 'Bank',
    'col.cheque.status': 'Status',
    'cheque.status.draft': 'Draft',
    'cheque.status.printed': 'Printed',
    'cheque.status.cancelled': 'Cancelled',
    'error.cheque.number_required': 'Cheque number is required',
    'error.cheque.date_required': 'Cheque date is required',
    'error.cheque.beneficiary_required': 'Beneficiary name is required',
    'error.cheque.amount_required': 'Amount must be greater than zero',
    'error.cheque.bank_required': 'Bank name is required',
    'error.cheque.currency_required': 'Currency is required',
    'msg.cheque.saved': 'Cheque saved successfully',
    'msg.cheque.printed': 'Cheque marked as printed',
    'msg.cheque.cancelled': 'Cheque cancelled',
    'msg.cheque.updated': 'Cheque updated successfully',
    'ph.cheque.beneficiary': 'Person or entity name',
    'ph.cheque.description': 'Reason or description for cheque',
    'ph.cheque.bank': 'e.g. National Bank of Kuwait',
    'ph.cheque.number': 'e.g. 123456',
    'empty.cheques': 'No cheques found',
    'lbl.cheque.company': 'Al-Manar International Company',
    'lbl.cheque.pay_to': 'Pay to the order of',
    'lbl.cheque.amount_label': 'Amount',
    'lbl.cheque.for': 'For',
    'lbl.cheque.signature': 'Authorized Signature',
    'btn.cheque.select': 'Select to View',
```

---

## Task 8: Add NAV Entry in modules.tsx

**Files:**
- Modify: `frontend/src/config/modules.tsx`

- [ ] **Step 1: Add cheques to the Financial nav group**

In `frontend/src/config/modules.tsx`, inside the `NAV` array, find the `'nav.group.financial'` section and add the cheques entry. The financial group currently has: invoices, expenses, salaries, suppliers, accounting.

Replace the financial group items array with:

```typescript
  { group: 'nav.group.financial', items: [
    { key: 'invoices', label: 'nav.invoices', icon: '🧾', permission: 'invoices.read' },
    { key: 'expenses', label: 'nav.expenses', icon: '💸', permission: 'expenses.read' },
    { key: 'cheques', label: 'nav.cheques', icon: '🖊️', permission: 'cheques.read' },
    { key: 'salaries', label: 'nav.salaries', icon: '💵', permission: 'payroll.read' },
    { key: 'suppliers', label: 'nav.suppliers', icon: '📦', permission: 'suppliers.read' },
    { key: 'accounting', label: 'nav.accounting', icon: '📒', permission: 'transactions.read' },
  ] },
```

---

## Task 9: Add Route in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Import Cheques page**

In `frontend/src/App.tsx`, add after the `Inventory` import:

```typescript
import Cheques from './pages/Cheques';
```

- [ ] **Step 2: Add /cheques route**

In `frontend/src/App.tsx`, inside the protected `<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>` block, add after the `/inventory` route:

```tsx
<Route path="/cheques" element={<Cheques />} />
```

---

## Task 10: Create the Cheques Page

**Files:**
- Create: `frontend/src/pages/Cheques.tsx`

- [ ] **Step 1: Create Cheques.tsx**

Create `frontend/src/pages/Cheques.tsx` with the full implementation:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import StatCard from '../components/StatCard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Cheque {
  id: number;
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
  description: string | null;
  bankName: string;
  templateName: string | null;
  status: string;
  printedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface ChequeStats {
  total: number;
  draft: number;
  printed: number;
  cancelled: number;
}

interface FormState {
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: string;
  currency: string;
  description: string;
  bankName: string;
  templateName: string;
  notes: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultForm(): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    chequeNumber: '',
    chequeDate: today,
    beneficiaryName: '',
    amount: '',
    currency: 'KWD',
    description: '',
    bankName: '',
    templateName: '',
    notes: '',
  };
}

function statusPill(status: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    DRAFT: 'amber',
    PRINTED: 'green',
    CANCELLED: 'red',
  };
  const keyMap: Record<string, string> = {
    DRAFT: 'cheque.status.draft',
    PRINTED: 'cheque.status.printed',
    CANCELLED: 'cheque.status.cancelled',
  };
  const cls = map[status] ?? 'gray';
  return <span className={`pill ${cls}`}>{t(keyMap[status] ?? status)}</span>;
}

function fmtAmount(v: number | string, currency = 'KWD') {
  const n = Number(v ?? 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' ' + currency;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  return new Date(v).toISOString().slice(0, 10);
}

// ── ChequePreview ─────────────────────────────────────────────────────────────
// Renders a cheque-like visual card. Used both in the page and in print area.

interface PreviewData {
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: string | number;
  currency: string;
  description: string | null;
  bankName: string;
}

function ChequePreview({ data, t }: { data: PreviewData; t: (k: string) => string }) {
  const amount = Number(data.amount ?? 0);

  return (
    <div
      style={{
        border: '2px solid #1d4e6f',
        borderRadius: 8,
        padding: '24px 28px',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e8f4f8 100%)',
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
        direction: 'rtl',
        minHeight: 200,
        position: 'relative',
      }}
    >
      {/* Header row: bank + cheque number */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1d4e6f' }}>
          {data.bankName || '—'}
        </div>
        <div style={{ fontSize: 13, color: '#475569', fontFamily: 'monospace', letterSpacing: 1 }}>
          {t('col.cheque.number')}: <strong>{data.chequeNumber || '—'}</strong>
        </div>
      </div>

      {/* Company name */}
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
        {t('lbl.cheque.company')}
      </div>

      {/* Date row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, fontSize: 13, color: '#334155' }}>
        <span>{t('col.cheque.date')}: <strong>{fmtDate(data.chequeDate)}</strong></span>
      </div>

      {/* Beneficiary row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          paddingBottom: 8,
          borderBottom: '1px dashed #94a3b8',
        }}
      >
        <span style={{ whiteSpace: 'nowrap', fontSize: 13, color: '#475569' }}>{t('lbl.cheque.pay_to')}:</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', flex: 1 }}>
          {data.beneficiaryName || '—'}
        </span>
      </div>

      {/* Amount row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 14,
          padding: '10px 14px',
          background: 'rgba(29, 78, 111, 0.07)',
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 13, color: '#475569', whiteSpace: 'nowrap' }}>{t('lbl.cheque.amount_label')}:</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#1d4e6f', letterSpacing: 0.5, fontFamily: 'monospace' }}>
          {amount > 0 ? amount.toLocaleString('en-US', { minimumFractionDigits: 3 }) : '0.000'}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1d4e6f' }}>{data.currency}</span>
      </div>

      {/* Description */}
      {data.description && (
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 14 }}>
          <span>{t('lbl.cheque.for')}: </span>
          <span style={{ color: '#0f172a' }}>{data.description}</span>
        </div>
      )}

      {/* Signature line */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 160, borderBottom: '1px solid #334155', marginBottom: 4 }} />
          <div style={{ fontSize: 11, color: '#64748b' }}>{t('lbl.cheque.signature')}</div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Cheques() {
  const { hasPermission } = useAuth();
  const { t } = useT();

  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [stats, setStats] = useState<ChequeStats>({ total: 0, draft: 0, printed: 0, cancelled: 0 });
  const [form, setForm] = useState<FormState>(defaultForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [printTarget, setPrintTarget] = useState<Cheque | null>(null);
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  const canCreate = hasPermission('cheques.create');
  const canUpdate = hasPermission('cheques.update');
  const canPrint = hasPermission('cheques.print');
  const canCancel = hasPermission('cheques.cancel');

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get('/cheques', { params: { page: p, pageSize: 20 } }),
        api.get('/cheques/stats'),
      ]);
      setCheques(listRes.data.data.data ?? []);
      setMeta(listRes.data.data.meta ?? null);
      setStats(statsRes.data.data ?? { total: 0, draft: 0, printed: 0, cancelled: 0 });
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(1); }, [loadData]);

  // ── Form handlers ────────────────────────────────────────────────────────────

  function field(name: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function resetForm() {
    setForm(defaultForm());
    setEditId(null);
    setPrintTarget(null);
    setFormError('');
    setSuccess('');
  }

  function loadChequeIntoForm(cheque: Cheque) {
    setForm({
      chequeNumber: cheque.chequeNumber,
      chequeDate: fmtDate(cheque.chequeDate),
      beneficiaryName: cheque.beneficiaryName,
      amount: String(cheque.amount),
      currency: cheque.currency,
      description: cheque.description ?? '',
      bankName: cheque.bankName,
      templateName: cheque.templateName ?? '',
      notes: cheque.notes ?? '',
    });
    setEditId(cheque.id);
    setPrintTarget(cheque);
    setFormError('');
    setSuccess('');
  }

  function validateForm(): string {
    if (!form.chequeNumber.trim()) return t('error.cheque.number_required');
    if (!form.chequeDate) return t('error.cheque.date_required');
    if (!form.beneficiaryName.trim()) return t('error.cheque.beneficiary_required');
    if (!form.amount || Number(form.amount) <= 0) return t('error.cheque.amount_required');
    if (!form.bankName.trim()) return t('error.cheque.bank_required');
    if (!form.currency.trim()) return t('error.cheque.currency_required');
    return '';
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const err = validateForm();
    if (err) { setFormError(err); return; }
    setFormError('');
    setSaving(true);
    try {
      const payload = {
        chequeNumber: form.chequeNumber.trim(),
        chequeDate: form.chequeDate,
        beneficiaryName: form.beneficiaryName.trim(),
        amount: Number(form.amount),
        currency: form.currency.trim(),
        description: form.description.trim() || null,
        bankName: form.bankName.trim(),
        templateName: form.templateName.trim() || null,
        notes: form.notes.trim() || null,
      };

      let saved: Cheque;
      if (editId) {
        const res = await api.put(`/cheques/${editId}`, payload);
        saved = res.data.data;
        setSuccess(t('msg.cheque.updated'));
      } else {
        const res = await api.post('/cheques', payload);
        saved = res.data.data;
        setSuccess(t('msg.cheque.saved'));
      }
      setEditId(saved.id);
      setPrintTarget(saved);
      await loadData(page);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Print ─────────────────────────────────────────────────────────────────────

  function handlePrint() {
    // The print target is either the saved cheque or a preview from the form
    window.print();
    setShowPrintConfirm(true);
  }

  async function handleMarkPrinted() {
    if (!printTarget) return;
    try {
      await api.post(`/cheques/${printTarget.id}/mark-printed`);
      setSuccess(t('msg.cheque.printed'));
      setShowPrintConfirm(false);
      await loadData(page);
      // Refresh the printTarget status
      const res = await api.get(`/cheques/${printTarget.id}`);
      setPrintTarget(res.data.data);
    } catch (e) {
      setFormError(errorMessage(e));
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────────

  async function handleCancel(cheque: Cheque) {
    if (!window.confirm(t('page.cheques.confirm_cancel'))) return;
    try {
      await api.post(`/cheques/${cheque.id}/cancel`);
      setSuccess(t('msg.cheque.cancelled'));
      if (printTarget?.id === cheque.id) {
        const res = await api.get(`/cheques/${cheque.id}`);
        setPrintTarget(res.data.data);
      }
      await loadData(page);
    } catch (e) {
      setFormError(errorMessage(e));
    }
  }

  // ── Preview data (form → preview, or saved cheque) ────────────────────────

  const previewData: PreviewData = printTarget
    ? {
        chequeNumber: printTarget.chequeNumber,
        chequeDate: printTarget.chequeDate,
        beneficiaryName: printTarget.beneficiaryName,
        amount: printTarget.amount,
        currency: printTarget.currency,
        description: printTarget.description,
        bankName: printTarget.bankName,
      }
    : {
        chequeNumber: form.chequeNumber,
        chequeDate: form.chequeDate,
        beneficiaryName: form.beneficiaryName,
        amount: form.amount,
        currency: form.currency,
        description: form.description,
        bankName: form.bankName,
      };

  // ── Table columns ─────────────────────────────────────────────────────────

  const columns = [
    { key: 'chequeDate', label: 'col.cheque.date', render: (r: Cheque) => fmtDate(r.chequeDate) },
    { key: 'chequeNumber', label: 'col.cheque.number', render: (r: Cheque) => <strong style={{ fontFamily: 'monospace' }}>{r.chequeNumber}</strong> },
    { key: 'beneficiaryName', label: 'col.cheque.beneficiary', render: (r: Cheque) => <strong>{r.beneficiaryName}</strong> },
    { key: 'amount', label: 'col.cheque.amount', render: (r: Cheque) => fmtAmount(r.amount, r.currency) },
    { key: 'bankName', label: 'col.cheque.bank' },
    { key: 'status', label: 'col.cheque.status', render: (r: Cheque) => statusPill(r.status, t) },
  ];

  const tableActions = (row: Cheque) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
      <button className="btn sm secondary" onClick={() => loadChequeIntoForm(row)}>
        {t('btn.cheque.select')}
      </button>
      {canCancel && row.status === 'DRAFT' && (
        <button className="btn sm danger" onClick={() => handleCancel(row)}>
          {t('page.cheques.cancel_cheque')}
        </button>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      {/* Print-only area: shown only during window.print() */}
      <div
        ref={printAreaRef}
        className="cheque-print-only"
        style={{ display: 'none' }}
      >
        <div style={{ padding: 32, maxWidth: 700, margin: '0 auto' }}>
          <ChequePreview data={previewData} t={t} />
        </div>
      </div>

      {/* Print CSS injected inline */}
      <style>{`
        @media print {
          body > * { visibility: hidden !important; }
          .cheque-print-only { display: block !important; visibility: visible !important; }
          .cheque-print-only * { visibility: visible !important; }
          .cheque-print-only { position: fixed; inset: 0; background: white; z-index: 9999; }
        }
      `}</style>

      {/* Page header */}
      <div className="page-header no-print">
        <div>
          <h1>{t('page.cheques.title')}</h1>
          <p>{t('page.cheques.subtitle')}</p>
        </div>
        {canCreate && (
          <button className="btn" onClick={resetForm}>
            {t('page.cheques.new')}
          </button>
        )}
      </div>

      {/* Status messages */}
      {formError && (
        <div className="alert error no-print" style={{ marginBottom: 12 }}>
          {formError}
          <button onClick={() => setFormError('')} style={{ marginInlineStart: 12, cursor: 'pointer' }}>✕</button>
        </div>
      )}
      {success && (
        <div className="alert success no-print" style={{ marginBottom: 12 }}>
          {success}
          <button onClick={() => setSuccess('')} style={{ marginInlineStart: 12, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Print confirm dialog */}
      {showPrintConfirm && printTarget && (
        <div className="modal-overlay no-print" onMouseDown={() => setShowPrintConfirm(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{t('page.cheques.mark_printed')}</h3>
              <button className="icon-btn" onClick={() => setShowPrintConfirm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p>{t('page.cheques.confirm_printed')}</p>
            </div>
            <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={() => setShowPrintConfirm(false)}>
                {t('action.cancel')}
              </button>
              {canPrint && (
                <button className="btn" onClick={handleMarkPrinted}>
                  {t('page.cheques.mark_printed')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="stats-row no-print" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label={t('stat.cheques.total')} value={stats.total} icon="🖊️" color="#1d4e6f" bg="#e8f4f8" />
        <StatCard label={t('stat.cheques.draft')} value={stats.draft} icon="📝" color="#92400e" bg="#fef3c7" />
        <StatCard label={t('stat.cheques.printed')} value={stats.printed} icon="✅" color="#065f46" bg="#d1fae5" />
        <StatCard label={t('stat.cheques.cancelled')} value={stats.cancelled} icon="❌" color="#991b1b" bg="#fee2e2" />
      </div>

      {/* Main layout: preview left + form right */}
      <div
        className="no-print"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 420px',
          gap: 20,
          marginBottom: 24,
          alignItems: 'start',
        }}
      >
        {/* Left: Preview + Print button */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 14 }}>
            {t('page.cheques.preview')}
            {printTarget && (
              <span style={{ marginInlineStart: 10 }}>
                {statusPill(printTarget.status, t)}
              </span>
            )}
          </div>

          <ChequePreview data={previewData} t={t} />

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              style={{ flex: 1, fontSize: 15, padding: '10px 0' }}
              onClick={handlePrint}
              disabled={!printTarget && !form.beneficiaryName}
            >
              🖨️ {t('page.cheques.print')}
            </button>
            {printTarget && printTarget.status === 'DRAFT' && canCancel && (
              <button className="btn danger" onClick={() => handleCancel(printTarget)}>
                {t('page.cheques.cancel_cheque')}
              </button>
            )}
          </div>
        </div>

        {/* Right: Form */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 14 }}>
            {t('page.cheques.form')}
            {editId && <span style={{ marginInlineStart: 8, color: 'var(--accent)' }}>#{editId}</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-row">
              <label className="form-label">{t('field.cheque.bank')} *</label>
              <input
                className="form-input"
                value={form.bankName}
                onChange={(e) => field('bankName', e.target.value)}
                placeholder={t('ph.cheque.bank')}
                disabled={!canCreate && !canUpdate}
              />
            </div>

            <div className="form-row">
              <label className="form-label">{t('field.cheque.number')} *</label>
              <input
                className="form-input"
                value={form.chequeNumber}
                onChange={(e) => field('chequeNumber', e.target.value)}
                placeholder={t('ph.cheque.number')}
                style={{ fontFamily: 'monospace' }}
                disabled={!canCreate && !canUpdate}
              />
            </div>

            <div className="form-row">
              <label className="form-label">{t('field.cheque.date')} *</label>
              <input
                className="form-input"
                type="date"
                value={form.chequeDate}
                onChange={(e) => field('chequeDate', e.target.value)}
                disabled={!canCreate && !canUpdate}
              />
            </div>

            <div className="form-row">
              <label className="form-label">{t('field.cheque.beneficiary')} *</label>
              <input
                className="form-input"
                value={form.beneficiaryName}
                onChange={(e) => field('beneficiaryName', e.target.value)}
                placeholder={t('ph.cheque.beneficiary')}
                disabled={!canCreate && !canUpdate}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <div className="form-row">
                <label className="form-label">{t('field.cheque.amount')} *</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.amount}
                  onChange={(e) => field('amount', e.target.value)}
                  style={{ fontFamily: 'monospace' }}
                  disabled={!canCreate && !canUpdate}
                />
              </div>
              <div className="form-row">
                <label className="form-label">{t('field.cheque.currency')} *</label>
                <select
                  className="form-input"
                  value={form.currency}
                  onChange={(e) => field('currency', e.target.value)}
                  disabled={!canCreate && !canUpdate}
                >
                  <option value="KWD">KWD</option>
                  <option value="USD">USD</option>
                  <option value="SAR">SAR</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <label className="form-label">{t('field.cheque.description')}</label>
              <input
                className="form-input"
                value={form.description}
                onChange={(e) => field('description', e.target.value)}
                placeholder={t('ph.cheque.description')}
                disabled={!canCreate && !canUpdate}
              />
            </div>

            <div className="form-row">
              <label className="form-label">{t('field.cheque.template')}</label>
              <input
                className="form-input"
                value={form.templateName}
                onChange={(e) => field('templateName', e.target.value)}
                disabled={!canCreate && !canUpdate}
              />
            </div>

            <div className="form-row">
              <label className="form-label">{t('field.cheque.notes')}</label>
              <textarea
                className="form-input"
                rows={2}
                value={form.notes}
                onChange={(e) => field('notes', e.target.value)}
                disabled={!canCreate && !canUpdate}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {(canCreate || (editId && canUpdate)) && (
                <button className="btn" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                  {saving ? t('msg.saving') : t('page.cheques.save')}
                </button>
              )}
              <button className="btn secondary" onClick={resetForm}>
                {t('page.cheques.reset')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="card no-print" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
          {t('page.cheques.history')}
        </div>
        <DataTable
          columns={columns}
          rows={cheques}
          loading={loading}
          meta={meta}
          onPage={(p) => { setPage(p); loadData(p); }}
          actions={tableActions}
          emptyText={t('empty.cheques')}
        />
      </div>
    </div>
  );
}
```

---

## Task 11: TypeScript Validation

**Files:** none (validation only)

- [ ] **Step 1: Type-check backend**

```bash
cd backend && npx tsc --noEmit
```

Expected: No errors. If errors appear, fix them before proceeding.

- [ ] **Step 2: Type-check frontend**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors. If errors appear, fix them before proceeding.

- [ ] **Step 3: Type-check electron**

```bash
tsc -p electron/tsconfig.json --noEmit
```

Expected: No errors (electron files were not changed, but verify nothing broke).

---

## Task 12: Build Validation

**Files:** none (build only)

- [ ] **Step 1: Build backend**

```bash
npm run build:back
```

Expected: Compiles `backend/src/**` to `backend/dist/` without errors.

- [ ] **Step 2: Build frontend**

```bash
npm run build:front
```

Expected: Vite build succeeds with output in `frontend/dist/`.

- [ ] **Step 3: Verify Prisma migration status**

```bash
cd backend && npx prisma migrate status
```

Expected: Shows `add_cheques_table` as applied. No unapplied migrations.

---

## Self-Review Checklist

### Spec coverage check

| Requirement | Task |
|-------------|------|
| Cheque model with all fields | Task 2 |
| GET /cheques | Task 4, routes |
| GET /cheques/:id | Task 4, routes |
| POST /cheques | Task 4, routes |
| PUT /cheques/:id | Task 4, routes |
| POST /cheques/:id/mark-printed | Task 4, routes |
| POST /cheques/:id/cancel | Task 4, routes |
| Permissions: cheques.read/create/update/print/cancel | Tasks 3, 6 |
| Seed role assignments | Task 6 |
| Frontend page at /cheques | Tasks 9, 10 |
| NAV entry | Task 8 |
| i18n Arabic + English | Task 7 |
| Stats bar (4 cards) | Task 10 (Cheques.tsx) |
| Cheque preview card | Task 10 (ChequePreview component) |
| Form with all fields | Task 10 (Cheques.tsx form) |
| Print button + @media print | Task 10 (window.print + style block) |
| Mark as printed after print | Task 10 (showPrintConfirm dialog) |
| Cheques history table | Task 10 (DataTable) |
| RBAC checks on frontend | Task 10 (canCreate/canUpdate/canPrint/canCancel) |
| Duplicate cheque number prevention | Task 4 (service.create + service.update) |
| Audit logging | Task 4 (service: recordAudit on all mutations) |
| TypeScript validation | Task 11 |
| Build validation | Task 12 |

### No gaps identified.

---

## Deliverables Summary

**After implementation, report:**

1. **Files changed:** 13 files (5 created, 8 modified)
2. **Migration name:** `add_cheques_table` (in `backend/prisma/migrations/<timestamp>_add_cheques_table/`)
3. **Permissions added:** `cheques.read`, `cheques.create`, `cheques.update`, `cheques.print`, `cheques.cancel`
4. **New action added:** `print` (in ACTIONS constant)
5. **Roles with cheques access:** SYSTEM_ADMIN, GENERAL_MANAGER (all), ACCOUNTANT (full cheques access)
6. **Route:** `/cheques` under Financial Management nav group
7. **Do NOT commit until Gemini review is approved**

**Recommended Gemini review prompt:**
```
Review a new "Cheques Management" feature added to manarERP (Electron + Express + React + Prisma + SQLite).

Changed files:
- backend/prisma/schema.prisma (new Cheque model)
- backend/src/config/constants.ts (new module 'cheques', new action 'print')
- backend/src/modules/cheques/*.ts (4 new files: schema, service, controller, routes)
- backend/src/app.ts (router registration)
- backend/prisma/seed.ts (new permissions + role assignments)
- frontend/src/pages/Cheques.tsx (full new page)
- frontend/src/App.tsx (new route)
- frontend/src/config/modules.tsx (NAV entry)
- frontend/src/lib/i18n.ts (AR + EN translations)

Please review for:
1. Security: auth/RBAC middleware applied correctly on all routes?
2. Logic: status transitions (DRAFT→PRINTED, DRAFT→CANCELLED) correct and guarded?
3. Correctness: duplicate cheque number check on create AND on update?
4. Frontend: permission checks before showing buttons (canCreate, canUpdate, canPrint, canCancel)?
5. Print: window.print() + @media print approach correct for Electron?
6. i18n: all visible labels use t() calls, no hardcoded Arabic/English?
7. TypeScript: any type safety issues?
8. Patterns: does the implementation follow existing manarERP conventions?
```
