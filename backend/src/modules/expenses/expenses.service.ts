import fs from 'fs';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { transactionsService } from '../transactions/transactions.service';
import { postExpenseToGL, reverseExpenseFromGL } from './expenses.accounting';
import { CreateExpenseInput, UpdateExpenseInput } from './expenses.schema';

// أسماء التصنيفات بالعربية — تُستخدم لوسم القيود المحاسبية وتجميع الإحصائيات.
// يجب أن تبقى المفاتيح متطابقة مع ENUMS.expenseCategory وملف الواجهة expenseCategories.ts.
const CATEGORY_AR: Record<string, string> = {
  // تشغيل عام
  FUEL: 'وقود',
  OILS: 'زيوت وتشحيم',
  PURCHASES: 'مشتريات',
  SERVICES: 'خدمات',
  RENT: 'إيجارات',
  EQUIPMENT: 'معدات',
  EQUIPMENT_RENT: 'إيجار معدات',
  TRUCK_RENT: 'إيجار شاحنات',
  SALARIES: 'رواتب',
  // مركبات
  MAINTENANCE: 'صيانة',
  TIRES: 'إطارات وتواير',
  BATTERY: 'شراء بطارية',
  VEHICLE_PAINT: 'صبغ سيارة',
  VEHICLE_BODYWORK: 'حدادة سيارة',
  VEHICLE_ELECTRICAL: 'كهرباء سيارة',
  TOW_TRUCK: 'كرين سحب',
  VEHICLE_INSURANCE: 'رسوم تأمين دفتر مركبة',
  VEHICLE_REGISTRATION: 'رسوم تجديد دفتر مركبة',
  // رسوم حكومية
  GOVERNMENT_FEES: 'رسوم شؤون',
  RESIDENCY: 'رسوم إقامة',
  LABOR_INSURANCE: 'رسوم تأمين عمالة',
  TOLL: 'رسوم مرور',
  TRAFFIC_VIOLATIONS: 'مخالفات مرورية',
  COURT_FEES: 'رسوم قضائية',
  // عن طريق أشخاص
  HASSAN: 'مصروف عن طريق حسن',
  GHANEM: 'مصروف عن طريق غانم',
  NATHEER: 'مصروف عن طريق نظير',
  HAROON: 'مصروف عن طريق هارون',
  BILLS_NAZEER: 'فواتير عن طريق نظير',
  DRIVER_EXPENSES: 'مصروف عن طريق سائق',
  DRIVER_MEALS: 'أكل للسواق',
  // أخرى
  CHARITY: 'صدقة شهرية',
  GIFTS: 'هدايا',
  MISC: 'مصروفات متفرقة',
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
    // استخدام أعلى تسلسل موجود (آخر سجل حسب id) بدلاً من COUNT لتجنّب التعارض
    // عند وجود فجوات في التسلسل (حذف مصروف وسطي أو استيراد) — يماثل transactions/accounting.
    const last = await client.expense.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { id: 'desc' },
      select: { code: true },
    });
    const lastSeq = last ? parseInt(last.code.slice(prefix.length), 10) : 0;
    const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
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
    if (expense.status !== 'PENDING') throw AppError.badRequest('يمكن اعتماد المصاريف المعلّقة فقط');

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
      // الاعتماد يُرحّل للنظامين (القيد المفرد القديم + GL المزدوج)، فالعكس يجب أن ينظّف الاثنين
      // وإلا بقي القيد القديم يُحتسب في لوحة القيادة رغم عكس المصروف (خطأ C4).
      // يماثل سلوك إلغاء الفاتورة (clearByReference + reverse GL).
      await transactionsService.clearByReference('EXPENSE', id, tx);
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

  /**
   * معاينة الحذف النهائي (SYSTEM_ADMIN فقط): لقطة عن المصروف + عدّ السجلات المرتبطة
   * التي ستُحذف/تُلغى مطابقتها، دون تنفيذ أي حذف. تُستخدم لعرض نافذة التأكيد.
   */
  async forceRemovePreview(id: number) {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { supplier: { select: { name: true } } },
    });
    if (!expense) throw AppError.notFound('المصروف غير موجود');

    const journalEntries = await prisma.journalEntry.findMany({
      where: { referenceType: { in: ['EXPENSE', 'EXPENSE_REVERSAL'] }, referenceId: id },
      select: { id: true },
    });
    const journalIds = journalEntries.map((j) => j.id);

    const [legacyTransactionsCount, attachmentsCount, bankMatchesCount] = await Promise.all([
      prisma.transaction.count({ where: { referenceType: 'EXPENSE', referenceId: id } }),
      prisma.attachment.count({ where: { entityType: 'EXPENSE', entityId: id } }),
      prisma.bankStatementTransaction.count({
        where: {
          OR: [
            { matchedType: 'expense', matchedId: id },
            ...(journalIds.length ? [{ matchedType: 'journal', matchedId: { in: journalIds } }] : []),
          ],
        },
      }),
    ]);

    const journalEntriesCount = journalEntries.length;

    const willBeDeleted: string[] = ['المصروف'];
    if (journalEntriesCount > 0) willBeDeleted.push(`${journalEntriesCount} قيد يومية محاسبي`);
    if (legacyTransactionsCount > 0) willBeDeleted.push(`${legacyTransactionsCount} قيد (سجل مفرد)`);
    if (attachmentsCount > 0) willBeDeleted.push(`${attachmentsCount} مرفق`);

    const warnings: string[] = [];
    if (expense.status === 'APPROVED') warnings.push('هذا المصروف معتمد ومُرحَّل محاسبيًا — سيُحذف قيده المحاسبي نهائيًا');
    if (expense.status === 'REVERSED') warnings.push('هذا المصروف معكوس — سيُحذف قيد العكس نهائيًا');
    if (bankMatchesCount > 0) warnings.push(`مرتبط بـ ${bankMatchesCount} عملية في كشوف البنك — ستُلغى المطابقة وتعود «غير مطابقة»`);
    if (journalEntriesCount === 0 && legacyTransactionsCount === 0) warnings.push('لا توجد قيود محاسبية مرتبطة بهذا المصروف');

    return {
      id: expense.id,
      code: expense.code,
      category: expense.category,
      amount: expense.amount,
      date: expense.date,
      status: expense.status,
      paymentMethod: expense.paymentMethod,
      supplierName: expense.supplier?.name ?? expense.supplierName ?? null,
      journalEntriesCount,
      legacyTransactionsCount,
      attachmentsCount,
      bankMatchesCount,
      willBeDeleted,
      warnings,
    };
  }

  /**
   * الحذف النهائي (SYSTEM_ADMIN فقط) لمصروف — بما فيها المعتمد/المُرحَّل.
   * يتطلب تأكيدًا نصيًا مطابقًا لرمز المصروف. يعمل داخل معاملة واحدة ولا يترك سجلات معلّقة:
   * يُلغي مطابقة كشوف البنك، ويحذف القيد المفرد القديم وقيود اليومية المزدوجة (البنود Cascade)
   * وسجلات المرفقات ثم المصروف. لا يغيّر منطق الترحيل/الاعتماد/التقارير — حذفٌ فقط.
   */
  async forceRemove(id: number, confirmation: string, req: Request) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    if (confirmation !== expense.code) {
      throw AppError.badRequest('يجب كتابة رمز المصروف بشكل مطابق للتأكيد');
    }

    // نجمع المرفقات (لحذف ملفاتها بعد نجاح المعاملة) وقيود اليومية (لإلغاء مطابقة البنك)
    const [attachments, journalEntries] = await Promise.all([
      prisma.attachment.findMany({ where: { entityType: 'EXPENSE', entityId: id }, select: { id: true, filePath: true } }),
      prisma.journalEntry.findMany({ where: { referenceType: { in: ['EXPENSE', 'EXPENSE_REVERSAL'] }, referenceId: id }, select: { id: true } }),
    ]);
    const journalIds = journalEntries.map((j) => j.id);

    const counts = await prisma.$transaction(async (tx) => {
      // 1) إلغاء أي مطابقة بنكية تشير إلى هذا المصروف أو قيوده (لا FK — منعًا للمراجع المعلّقة)
      const unlinked = await tx.bankStatementTransaction.updateMany({
        where: {
          OR: [
            { matchedType: 'expense', matchedId: id },
            ...(journalIds.length ? [{ matchedType: 'journal', matchedId: { in: journalIds } }] : []),
          ],
        },
        data: { reconcileStatus: 'UNMATCHED', matchedType: null, matchedId: null, matchedRef: null, matchConfidence: null },
      });

      // 2) حذف القيد المفرد القديم (Legacy Transaction)
      const legacy = await tx.transaction.deleteMany({ where: { referenceType: 'EXPENSE', referenceId: id } });

      // 3) حذف قيود اليومية المزدوجة (EXPENSE + EXPENSE_REVERSAL) — بنودها تُحذف تلقائيًا (Cascade)
      const journals = await tx.journalEntry.deleteMany({ where: { referenceType: { in: ['EXPENSE', 'EXPENSE_REVERSAL'] }, referenceId: id } });

      // 4) حذف سجلات المرفقات (Polymorphic — لا FK)
      const atts = await tx.attachment.deleteMany({ where: { entityType: 'EXPENSE', entityId: id } });

      // 5) حذف المصروف نفسه
      await tx.expense.delete({ where: { id } });

      return {
        bankMatchesUnlinked: unlinked.count,
        legacyTransactionsCleared: legacy.count,
        journalEntriesDeleted: journals.count,
        attachmentsDeleted: atts.count,
      };
    });

    // حذف ملفات المرفقات من القرص (أفضل جهد — خارج المعاملة، غير قاتل)
    for (const att of attachments) {
      try {
        if (att.filePath && fs.existsSync(att.filePath)) fs.unlinkSync(att.filePath);
      } catch {
        // تجاهل فشل حذف الملف — السجلات في قاعدة البيانات حُذفت بالفعل
      }
    }

    await recordAudit({
      req,
      action: 'FORCE_DELETE_EXPENSE',
      module: 'expenses',
      entityId: id,
      oldValue: { code: expense.code, category: expense.category, amount: expense.amount, status: expense.status, date: expense.date },
      newValue: {
        forceDelete: true,
        code: expense.code,
        category: expense.category,
        amount: expense.amount,
        status: expense.status,
        date: expense.date,
        ...counts,
      },
    });

    return { deleted: true, ...counts };
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

    // Period cards — use billing month/year only, strip date/period range filters so
    // they always reflect absolute calendar windows regardless of active filters.
    const periodsBaseWhere: Prisma.ExpenseWhereInput = {};
    if (query.category) periodsBaseWhere.category = query.category;
    if (query.status) periodsBaseWhere.status = query.status;
    if (query.supplierId) periodsBaseWhere.supplierId = Number(query.supplierId);

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const prevMonthYear = curMonth === 1 ? curYear - 1 : curYear;

    const [cmAgg, pmAgg, cyAgg] = await Promise.all([
      prisma.expense.aggregate({
        where: { ...periodsBaseWhere, billingMonth: curMonth, billingYear: curYear },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.expense.aggregate({
        where: { ...periodsBaseWhere, billingMonth: prevMonth, billingYear: prevMonthYear },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.expense.aggregate({
        where: { ...periodsBaseWhere, billingYear: curYear },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const periods = {
      currentMonth: { total: Number(cmAgg._sum.amount ?? 0), count: cmAgg._count._all, month: curMonth, year: curYear },
      previousMonth: { total: Number(pmAgg._sum.amount ?? 0), count: pmAgg._count._all, month: prevMonth, year: prevMonthYear },
      currentYear: { total: Number(cyAgg._sum.amount ?? 0), count: cyAgg._count._all, year: curYear },
    };

    return { count, total, pendingCount, pendingTotal, byCategory, byCompanyGroup, bySupplier, periods };
  }
}

export const expensesService = new ExpensesService();
