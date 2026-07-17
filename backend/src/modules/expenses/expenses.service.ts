import fs from 'fs';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { repostExpenseToGL, reverseExpenseFromGL } from './expenses.accounting';
import { CreateExpenseInput, UpdateExpenseInput } from './expenses.schema';
import { assertPeriodOpen } from '../../shared/services/periodLock.service';
import { recordHistoricalEntry } from '../../shared/services/historicalEntry.service';
import { approvalEngine } from '../../shared/services/approval.service';
// المصدر الموحّد لأسماء التصنيفات بالعربية (وسم القيود المحاسبية وتجميع الإحصائيات).
import { expenseCategoryAr } from '../../shared/utils/expenseLabels';

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

    // علامة عرض فقط: هل للمصروف قيود محاسبية مرتبطة؟ تُمكّن الواجهة من إخفاء زر الحذف
    // العادي حين يرفضه الخادم (مصروف فُتح للتعديل يحمل زوج قيد) وتوجيه المستخدم للحذف النهائي.
    // استعلام واحد لكامل الصفحة (لا N+1). لا يغيّر أي منطق حذف/محاسبة على الخادم.
    const ids = data.map((e) => e.id);
    const journalRefs = ids.length
      ? await prisma.journalEntry.findMany({
          where: { referenceType: { in: ['EXPENSE', 'EXPENSE_REVERSAL'] }, referenceId: { in: ids } },
          select: { referenceId: true },
        })
      : [];
    const withJournals = new Set(journalRefs.map((j) => j.referenceId));
    const rows = data.map((e) => ({ ...e, hasJournalEntries: withJournals.has(e.id) }));

    return buildPaginatedResult(rows, total, pagination);
  }

  async getById(id: number) {
    const expense = await prisma.expense.findUnique({ where: { id }, include: FULL_INCLUDE });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    return expense;
  }

  async create(input: CreateExpenseInput, req: Request) {
    const code = input.code ?? (await this.generateCode());
    const expenseDate = input.date ?? new Date();
    // المصروف يُنشأ بحالة PENDING فلا يمرّ بـ createBalancedJournal بعد؛ الحارس صريح هنا.
    await assertPeriodOpen(prisma, expenseDate, { operation: 'إنشاء مصروف', module: 'expenses' });
    const expense = await prisma.expense.create({
      data: {
        code,
        category: input.category,
        description: input.description,
        amount: input.amount,
        date: expenseDate,
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
    await recordHistoricalEntry({
      req,
      module: 'expenses',
      recordType: 'مصروف',
      entityId: expense.id,
      documentNumber: expense.code,
      transactionDate: expense.date,
      lateEntryReason: input.lateEntryReason,
    });
    return expense;
  }

  async update(id: number, input: UpdateExpenseInput, req: Request) {
    const current = await prisma.expense.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('المصروف غير موجود');
    if (current.status === 'APPROVED') throw AppError.badRequest('لا يمكن تعديل مصروف معتمد');
    if (current.status === 'REVERSED') throw AppError.badRequest('لا يمكن تعديل مصروف معكوس');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن تعديل مصروف ملغى');

    // كلا التاريخين محروس: نقل مصروف من فترة مقفلة أو إليها ممنوع بالتساوي.
    await assertPeriodOpen(prisma, current.date, { operation: 'تعديل مصروف', module: 'expenses', entityId: id });
    if (input.date && input.date.getTime() !== current.date.getTime()) {
      await assertPeriodOpen(prisma, input.date, { operation: 'نقل مصروف إلى فترة مقفلة', module: 'expenses', entityId: id });
    }

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
      // مصدر محاسبي واحد (GL): ترحيل غير حذفي عبر supersede — الاعتماد الأول يُرحّل النسخة 1،
      // وإعادة الاعتماد بعد التعديل الآمن تعكس النسخة الحالية وتُرحّل نسخة جديدة. أُلغي الترحيل
      // الموازي للدفتر القديم (Transaction) الذي كان يُنتج أرقامًا موازية للوحة القيادة.
      await repostExpenseToGL(tx, exp.id);
      // سجلّ الاعتماد — تسجيل ما جرى فقط، على نفس المعاملة. لا حالة ولا تدقيق ولا ترحيل.
      await approvalEngine.recordTransition(
        {
          entityType: 'expense',
          entityId:   exp.id,
          action:     'approve',
          fromStatus: 'PENDING',
          toStatus:   'APPROVED',
          userId:     req.user?.userId ?? null,
          metadata:   { amount: exp.amount },
        },
        tx,
      );
      return exp;
    });

    await recordAudit({ req, action: 'APPROVE', module: 'expenses', entityId: id, newValue: { amount: expense.amount } });
    return updated;
  }

  async reject(id: number, req: Request) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    if (expense.status === 'APPROVED') throw AppError.badRequest('لا يمكن رفض مصروف معتمد — استخدم إلغاء الاعتماد');

    // معاملة واحدة: الحالة وسجلّ الاعتماد يقعان معًا أو لا يقعان. لا تغيير في الحالة نفسها.
    const updated = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.update({ where: { id }, data: { status: 'REJECTED' }, include: FULL_INCLUDE });
      await approvalEngine.recordTransition(
        {
          entityType: 'expense',
          entityId:   id,
          action:     'reject',
          fromStatus: expense.status,
          toStatus:   'REJECTED',
          userId:     req.user?.userId ?? null,
        },
        tx,
      );
      return exp;
    });
    await recordAudit({ req, action: 'REJECT', module: 'expenses', entityId: id });
    return updated;
  }

  /** إلغاء اعتماد مصروف مُرحَّل: ينشئ قيد عكسي في GL ويُعيد الحالة إلى REVERSED. */
  async cancelApproval(id: number, req: Request) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    if (expense.status !== 'APPROVED') throw AppError.badRequest('لا يمكن إلغاء اعتماد مصروف غير معتمد');

    const updated = await prisma.$transaction(async (tx) => {
      // مصدر واحد (GL): عكس القيد المزدوج فقط — لا دفتر قديم لتنظيفه بعد الآن.
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

  /**
   * فتح مصروف معتمد للتعديل بأمان (Safe Amendment): APPROVED → PENDING.
   * لا يعدّل المصروف مباشرة — يعكس الأثر المحاسبي فقط ثم يعيده معلّقًا ليُعدَّل ويُعاد اعتماده.
   *
   * ضمن معاملة واحدة:
   *  1) يمسح القيد المفرد القديم (Legacy) حتى لا يبقى محسوبًا في لوحة القيادة.
   *  2) يُنشئ قيد عكس متوازن (EXPENSE_REVERSAL) — لا يحذف/يعدّل القيد الأصلي (حفظ الأثر).
   *  3) يُعيد الحالة إلى PENDING.
   * بعدها: يُعدّل المستخدم المصروف عبر update العادي (يسمح لـ PENDING) ثم يُعيد الاعتماد،
   * فيُعيد approve الترحيل بالقيمة الجديدة (repostExpenseToGL). يماثل دورة تعديل الفواتير.
   * الصلاحية: expenses.approve (سلطة عكس الترحيل) — إضافةً لصلاحية expenses.update للتعديل لاحقًا.
   */
  async amend(id: number, req: Request) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw AppError.notFound('المصروف غير موجود');
    if (expense.status !== 'APPROVED') {
      throw AppError.badRequest('يمكن فتح التعديل الآمن للمصاريف المعتمدة فقط');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // مصدر واحد (GL): عكس النسخة الحيّة فقط (يبقى الأصل + العكس في الدفتر). ثم يُعيد
      // approve الترحيل بنسخة جديدة عبر supersede. لا دفتر قديم.
      await reverseExpenseFromGL(tx, id);
      return tx.expense.update({
        where: { id },
        data: { status: 'PENDING', approvedById: null, approvedAt: null },
        include: FULL_INCLUDE,
      });
    });

    await recordAudit({
      req,
      action: 'AMEND_UNLOCK',
      module: 'expenses',
      entityId: id,
      oldValue: { status: 'APPROVED', amount: expense.amount },
      newValue: { status: 'PENDING' },
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

    // مصروف فُتح للتعديل الآمن (amend) يعود PENDING لكنه يحمل زوج قيد متعادلًا — حذفه العادي
    // يترك قيودًا يتيمة. امنع الحذف واطلب الحذف النهائي (يُنظّف القيود) لتفادي المراجع المعلّقة.
    const journalCount = await prisma.journalEntry.count({
      where: { referenceType: { in: ['EXPENSE', 'EXPENSE_REVERSAL'] }, referenceId: id },
    });
    if (journalCount > 0) {
      throw AppError.conflict('لا يمكن حذف مصروف له قيود محاسبية مرتبطة — استخدم الحذف النهائي');
    }

    await assertPeriodOpen(prisma, expense.date, { operation: 'حذف مصروف', module: 'expenses', entityId: id });

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
      // 0) قفل الفترة: الحذف النهائي يمحو القيود بـ deleteMany مباشرةً، فلا يمرّ بالحارس
      //    المركزي. المسار SYSTEM_ADMIN ⇒ يمرّ، لكنه يُسجَّل الآن كـ PERIOD_LOCK_OVERRIDE
      //    بدل أن يمحو قيدًا من فترة مقفلة بلا أثر. (الحذف العادي `remove` محروس أصلًا.)
      await assertPeriodOpen(tx, expense.date, {
        operation: 'حذف نهائي لمصروف',
        module: 'expenses',
        entityId: id,
      });

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

      // 2) عكس قيد الأستاذ العام (GL) بدلًا من حذفه — دفتر غير قابل للتغيير: يبقى الأصل + العكس
      //    (صافيهما صفر) حتى بعد حذف صفّ المصروف، فيُحفظ أثر التدقيق كاملًا. لا `deleteMany`.
      const liveJournals = await tx.journalEntry.count({
        where: { referenceType: 'EXPENSE', referenceId: id, status: 'POSTED' },
      });
      await reverseExpenseFromGL(tx, id);

      // 3) حذف سجلات المرفقات (Polymorphic — لا FK)
      const atts = await tx.attachment.deleteMany({ where: { entityType: 'EXPENSE', entityId: id } });

      // 4) حذف المصروف نفسه (قيوده تبقى معكوسة في الدفتر)
      await tx.expense.delete({ where: { id } });

      return {
        bankMatchesUnlinked: unlinked.count,
        journalEntriesReversed: liveJournals,
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

    // تجميع في قاعدة البيانات بدل جلب كل صفوف المصروفات ثم reduce/تصنيف في الذاكرة.
    // الإجماليات عبر aggregate، والتصنيفات عبر groupBy — بلا اقتطاع مهما كبر التاريخ.
    const [totalAgg, pendingAgg, byCatRows, bySupplierRows] = await Promise.all([
      prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.expense.aggregate({ where: { ...where, status: 'PENDING' }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.expense.groupBy({ by: ['category'], where, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['supplierId', 'supplierName'], where, _sum: { amount: true } }),
    ]);

    const count = totalAgg._count._all;
    const total = Number(totalAgg._sum.amount ?? 0);
    const pendingCount = pendingAgg._count._all;
    const pendingTotal = Number(pendingAgg._sum.amount ?? 0);

    const byCategory: Record<string, number> = {};
    for (const r of byCatRows) byCategory[r.category] = Number(r._sum.amount ?? 0);

    // "أشخاص" (HASSAN/GHANEM/NATHEER/HAROON) مقابل "عمليات" — مشتقّ من تجميع التصنيف
    // نفسه، لا من صفوف خام. نفس منطق التسمية السابق بالضبط.
    const PERSON_CATS = new Set(['HASSAN', 'GHANEM', 'NATHEER', 'HAROON']);
    const byCompanyGroup: Record<string, number> = {};
    for (const r of byCatRows) {
      const group = PERSON_CATS.has(r.category) ? expenseCategoryAr(r.category) : 'عمليات';
      byCompanyGroup[group] = (byCompanyGroup[group] ?? 0) + Number(r._sum.amount ?? 0);
    }

    // اسم المورد: مورد مُعرَّف → اسمه، وإلا مورد حر (نص)، وإلا "غير محدد" — نفس أولوية السابق.
    const supplierIds = [...new Set(bySupplierRows.map(r => r.supplierId).filter((x): x is number => x != null))];
    const suppliers = supplierIds.length
      ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } })
      : [];
    const supplierNameById = new Map(suppliers.map(s => [s.id, s.name]));
    const bySupplier: Record<string, number> = {};
    for (const r of bySupplierRows) {
      const label = (r.supplierId != null ? supplierNameById.get(r.supplierId) : null)
        ?? r.supplierName ?? 'غير محدد';
      bySupplier[label] = (bySupplier[label] ?? 0) + Number(r._sum.amount ?? 0);
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
