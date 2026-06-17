import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { transactionsService } from '../transactions/transactions.service';
import { postExpenseToGL, reverseExpenseFromGL } from './expenses.accounting';
import { CreateExpenseInput, UpdateExpenseInput } from './expenses.schema';

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

const FULL_INCLUDE = {
  contract: { select: { id: true, asphaltPlant: true } },
  supplier: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, fullName: true } },
};

export class ExpensesService {
  private async generateCode(client: Prisma.TransactionClient | typeof prisma = prisma) {
    const year = new Date().getFullYear();
    const prefix = `EXP-${year}-`;
    const count = await client.expense.count({ where: { code: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  async list(query: PaginationQuery & { category?: string; status?: string; contractId?: string; supplierId?: string; billingMonth?: string; billingYear?: string; from?: string; to?: string }) {
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
    if (query.search) {
      where.OR = [
        { description: { contains: query.search } },
        { code: { contains: query.search } },
        { supplierName: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.expense.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy: { date: 'desc' }, include: FULL_INCLUDE }),
      prisma.expense.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const expense = await prisma.expense.findUnique({ where: { id }, include: FULL_INCLUDE });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    return expense;
  }

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
        contractId: input.contractId ?? null,
        supplierId: input.supplierId ?? null,
        supplierName: input.supplierName ?? null,
        documentPath: input.documentPath ?? null,
        paymentMethod: input.paymentMethod ?? 'CASH',
        status: 'PENDING',
      },
      include: FULL_INCLUDE,
    });
    await recordAudit({ req, action: 'CREATE', module: 'expenses', entityId: expense.id, newValue: { code, amount: input.amount } });
    return expense;
  }

  async update(id: number, input: UpdateExpenseInput, req: Request) {
    const current = await prisma.expense.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('المصروف غير موجود');
    if (current.status === 'APPROVED') throw AppError.badRequest('لا يمكن تعديل مصروف معتمد');
    if (current.status === 'REVERSED') throw AppError.badRequest('لا يمكن تعديل مصروف معكوس');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن تعديل مصروف ملغى');

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
        contractId: input.contractId === undefined ? current.contractId : input.contractId,
        supplierId: input.supplierId === undefined ? current.supplierId : input.supplierId,
        supplierName: input.supplierName !== undefined ? (input.supplierName ?? null) : (current.supplierName ?? null),
        documentPath: input.documentPath ?? current.documentPath,
        paymentMethod: input.paymentMethod ?? current.paymentMethod,
      },
      include: FULL_INCLUDE,
    });
    await recordAudit({ req, action: 'UPDATE', module: 'expenses', entityId: id, oldValue: current, newValue: input });
    return expense;
  }

  /** اعتماد المصروف + ترحيل قيد محاسبي (EXPENSE). */
  async approve(id: number, req: Request) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    if (expense.status === 'APPROVED') throw AppError.badRequest('المصروف معتمد بالفعل');

    // ربط المعتمِد بالموظف المرتبط بحساب المستخدم (إن وُجد)
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { employeeId: true } });

    const updated = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: user?.employeeId ?? null, approvedAt: new Date() },
        include: FULL_INCLUDE,
      });
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
      // ترحيل قيد مزدوج إلى GL (Phase B) — بالتوازي مع Legacy Transaction
      await postExpenseToGL(tx, exp.id);
      return exp;
    });

    await recordAudit({ req, action: 'APPROVE', module: 'expenses', entityId: id, newValue: { amount: expense.amount } });
    return updated;
  }

  async reject(id: number, req: Request) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    if (expense.status === 'APPROVED') throw AppError.badRequest('لا يمكن رفض مصروف معتمد — استخدم إلغاء الاعتماد');

    const updated = await prisma.expense.update({ where: { id }, data: { status: 'REJECTED' }, include: FULL_INCLUDE });
    await recordAudit({ req, action: 'REJECT', module: 'expenses', entityId: id });
    return updated;
  }

  /** إلغاء اعتماد مصروف مُرحَّل: ينشئ قيد عكسي في GL ويُعيد الحالة إلى REVERSED. */
  async cancelApproval(id: number, req: Request) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    if (expense.status !== 'APPROVED') throw AppError.badRequest('لا يمكن إلغاء اعتماد مصروف غير معتمد');

    const updated = await prisma.$transaction(async (tx) => {
      await reverseExpenseFromGL(tx, id);
      return tx.expense.update({
        where: { id },
        data: { status: 'REVERSED' },
        include: FULL_INCLUDE,
      });
    });

    await recordAudit({
      req,
      action: 'CANCEL_APPROVAL',
      module: 'expenses',
      entityId: id,
      oldValue: { amount: expense.amount, status: 'APPROVED' },
      newValue: { status: 'REVERSED' },
    });
    return updated;
  }

  /** إلغاء إداري لمصروف معلّق (PENDING → CANCELLED) — بدون ترحيل GL. */
  async cancel(id: number, req: Request) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    if (expense.status !== 'PENDING') throw AppError.badRequest('يمكن إلغاء المصاريف المعلّقة فقط');

    const updated = await prisma.expense.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: FULL_INCLUDE,
    });
    await recordAudit({ req, action: 'CANCEL', module: 'expenses', entityId: id, newValue: { status: 'CANCELLED' } });
    return updated;
  }

  async remove(id: number, req: Request) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    if (expense.status === 'APPROVED') throw AppError.conflict('لا يمكن حذف مصروف معتمد — ارفض اعتماده أولًا');
    if (expense.status === 'REVERSED') throw AppError.conflict('لا يمكن حذف مصروف معكوس — يحتوي على قيد محاسبي');

    await prisma.expense.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'expenses', entityId: id });
    return { deleted: true };
  }

  async stats(query: { category?: string; status?: string; supplierId?: string; billingMonth?: string; billingYear?: string; from?: string; to?: string }) {
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
      select: {
        amount: true,
        category: true,
        supplier: { select: { name: true } },
        supplierName: true,
        status: true,
      },
    });

    const count = rows.length;
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const pendingRows = rows.filter((r) => r.status === 'PENDING');
    const pendingCount = pendingRows.length;
    const pendingTotal = pendingRows.reduce((s, r) => s + Number(r.amount), 0);

    const byCategory: Record<string, number> = {};
    for (const r of rows) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + Number(r.amount);
    }

    // Group by "person" (HASSAN/GHANEM/NATHEER/HAROON) vs "operations"
    const PERSON_CATS = new Set(['HASSAN', 'GHANEM', 'NATHEER', 'HAROON']);
    const byCompanyGroup: Record<string, number> = {};
    for (const r of rows) {
      const group = PERSON_CATS.has(r.category) ? CATEGORY_AR[r.category] ?? r.category : 'عمليات';
      byCompanyGroup[group] = (byCompanyGroup[group] ?? 0) + Number(r.amount);
    }

    const bySupplier: Record<string, number> = {};
    for (const r of rows) {
      const label = r.supplier?.name ?? (r as Record<string, unknown>)['supplierName'] as string | null ?? 'غير محدد';
      bySupplier[label] = (bySupplier[label] ?? 0) + Number(r.amount);
    }

    return { count, total, pendingCount, pendingTotal, byCategory, byCompanyGroup, bySupplier };
  }
}

export const expensesService = new ExpensesService();
