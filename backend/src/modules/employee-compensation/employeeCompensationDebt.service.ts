/**
 * خدمة سجل المديونيات والسلف.
 *
 * ═══ نفس عزل الوحدة حرفيًا ═══
 * تكتب حصريًا في `employee_compensation_debts` و`employee_compensation_debt_payments`.
 * «السلفة» هنا **ليست** `PayrollAdvance`: لا تُنشئها ولا تقرؤها ولا تتأثر بها، ولا
 * تُنشئ خصمًا في الرواتب ولا قيدًا محاسبيًا ولا مصروفًا. `Employee` قراءة فقط.
 *
 * ═══ الرصيد مشتقّ دائمًا ═══
 * لا عمود رصيد في القاعدة. كل قراءة تحسبه من الدفتر عبر `computeDebtBalance`. لذلك لا
 * يوجد في هذا الملف أي `update({ data: { remainingBalance … } })` — ولا يجوز أن يوجد.
 *
 * ═══ حركة الشهر: هوية ثابتة، تحديث لا تكديس ═══
 * حركة السداد الناشئة عن حسبة شهر هويّتها `(calculationId, debtId)` — فهرس فريد في
 * القاعدة. مزامنة الحسبة **تُحدِّث** الصف القائم أو تحذفه، ولا تُنشئ صفًّا ثانيًا فوقه.
 */
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import {
  assertOriginalCoversPayments,
  assertPaymentWithinBalance,
  computeDebtBalance,
  summarizeDebts,
  type DebtType,
} from './engine';

const AUDIT_MODULE = 'employeeCompensation';

/** أي عميل Prisma — العميل الجذر أو عميل معاملة. تُمرَّر المعاملة فتشترك الخطوات فيها. */
type Db = Prisma.TransactionClient | typeof prisma;

const DEBT_INCLUDE = {
  payments: { orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.EmployeeCompensationDebtInclude;

type DebtWithPayments = Prisma.EmployeeCompensationDebtGetPayload<{ include: typeof DEBT_INCLUDE }>;

function actor(req: Request): { id: number | null; name: string | null } {
  return { id: req.user?.userId ?? null, name: req.user?.username ?? null };
}

/** يحوّل رسائل المحرّك الخالص إلى أخطاء تشغيلية بالرمز المناسب. */
function asOperational(fn: () => number): number {
  try {
    return fn();
  } catch (e) {
    throw AppError.badRequest(e instanceof Error ? e.message : 'قيمة غير صالحة');
  }
}

/** يضمّ الرصيد المشتقّ إلى صف المديونية — نقطة العرض الوحيدة. */
function withBalance(debt: DebtWithPayments) {
  const balance = computeDebtBalance(debt.originalAmount, debt.payments);
  return {
    id: debt.id,
    employeeId: debt.employeeId,
    type: debt.type,
    label: debt.label,
    debtDate: debt.debtDate,
    notes: debt.notes,
    createdByName: debt.createdByName,
    createdAt: debt.createdAt,
    updatedAt: debt.updatedAt,
    // `balance` يحمل `originalAmount` مقرَّبًا — فلا يُكتب مرتين بقيمتين مختلفتين.
    ...balance,
    paymentsCount: debt.payments.length,
  };
}

async function loadDebt(id: number, db: Db = prisma): Promise<DebtWithPayments> {
  const debt = await db.employeeCompensationDebt.findUnique({ where: { id }, include: DEBT_INCLUDE });
  if (!debt) throw AppError.notFound('سجل المديونية غير موجود');
  return debt;
}

export const employeeCompensationDebtService = {
  /** سجل موظف كامل + ملخّصه. يُستعمل في شاشة السجل وفي ملف الموظف السنوي. */
  async listForEmployee(employeeId: number) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, code: true, fullName: true, jobTitle: true, status: true },
    });
    if (!employee) throw AppError.notFound('الموظف غير موجود');

    const debts = await prisma.employeeCompensationDebt.findMany({
      where: { employeeId },
      include: DEBT_INCLUDE,
      orderBy: [{ debtDate: 'desc' }, { id: 'desc' }],
    });

    const rows = debts.map(withBalance);
    return { employee, debts: rows, summary: summarizeDebts(rows) };
  },

  /**
   * ملخّص مختصر لملف الموظف السنوي.
   *
   * السجل **غير مرتبط بسنة**: مديونية بدأت في ٢٠٢٦ وبقي منها رصيد تظهر في ملف ٢٠٢٧
   * كما هي، بلا نسخ ولا ترحيل (المتطلب ٢٢). لذلك لا تأخذ هذه الدالة سنةً أصلًا.
   */
  async summaryForEmployee(employeeId: number) {
    const debts = await prisma.employeeCompensationDebt.findMany({
      where: { employeeId },
      include: DEBT_INCLUDE,
    });
    return summarizeDebts(debts.map((d) => computeDebtBalance(d.originalAmount, d.payments)));
  },

  /** المديونيات المفتوحة وحدها — لقائمة الاختيار داخل محرّر الشهر. */
  async listOpenForEmployee(employeeId: number) {
    const debts = await prisma.employeeCompensationDebt.findMany({
      where: { employeeId },
      include: DEBT_INCLUDE,
      orderBy: [{ debtDate: 'asc' }, { id: 'asc' }],
    });
    return debts.map(withBalance).filter((d) => d.status === 'OPEN');
  },

  /** تفاصيل مديونية + دفترها الزمني، مع تسمية مصدر كل حركة. */
  async getById(id: number) {
    const debt = await loadDebt(id);
    const employee = await prisma.employee.findUnique({
      where: { id: debt.employeeId },
      select: { id: true, code: true, fullName: true, jobTitle: true },
    });

    const calculationIds = debt.payments.map((p) => p.calculationId).filter((c): c is number => c != null);
    const calculations = calculationIds.length
      ? await prisma.employeeCompensationCalculation.findMany({
          where: { id: { in: calculationIds } },
          select: { id: true, year: true, month: true, status: true },
        })
      : [];
    const byCalc = new Map(calculations.map((c) => [c.id, c]));

    return {
      ...withBalance(debt),
      employee,
      payments: debt.payments.map((p) => {
        const calc = p.calculationId != null ? byCalc.get(p.calculationId) : undefined;
        return {
          id: p.id,
          amount: p.amount,
          paymentDate: p.paymentDate,
          sourceType: p.sourceType,
          calculationId: p.calculationId,
          /** الشهر/السنة المصدر — يمكّن الواجهة من زر «فتح الحسبة» بلا استعلام ثانٍ. */
          calculationPeriod: calc ? { year: calc.year, month: calc.month, status: calc.status } : null,
          notes: p.notes,
          createdByName: p.createdByName,
          createdAt: p.createdAt,
        };
      }),
    };
  },

  async create(
    employeeId: number,
    input: { type: DebtType; label: string; originalAmount: number; debtDate: string | Date; notes?: string | null },
    req: Request,
  ) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    if (!(input.originalAmount > 0)) throw AppError.badRequest('مبلغ المديونية يجب أن يكون أكبر من صفر');

    const who = actor(req);
    const debt = await prisma.employeeCompensationDebt.create({
      data: {
        employeeId,
        type: input.type,
        label: input.label.trim(),
        originalAmount: input.originalAmount,
        debtDate: new Date(input.debtDate),
        notes: input.notes ?? null,
        createdById: who.id,
        createdByName: who.name,
      },
      include: DEBT_INCLUDE,
    });

    await recordAudit({ req, action: 'CREATE', module: AUDIT_MODULE, entityId: `debt:${debt.id}`, newValue: { employeeId, label: debt.label, originalAmount: debt.originalAmount } });
    return withBalance(debt);
  },

  /**
   * تعديل مديونية — كل الحقول قابلة للتعديل، **عدا** خفض الأصل دون المسدَّد فعلًا.
   * الموظف المالك لا يتغيّر: نقل سجل مالي بين موظفين ليس تعديلًا بل إعادة كتابة تاريخ.
   */
  async update(
    id: number,
    input: { type?: DebtType; label?: string; originalAmount?: number; debtDate?: string | Date; notes?: string | null },
    req: Request,
  ) {
    const existing = await loadDebt(id);

    const originalAmount =
      input.originalAmount !== undefined
        ? asOperational(() => assertOriginalCoversPayments(input.originalAmount as number, existing.payments))
        : undefined;

    const updated = await prisma.employeeCompensationDebt.update({
      where: { id },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(originalAmount !== undefined ? { originalAmount } : {}),
        ...(input.debtDate !== undefined ? { debtDate: new Date(input.debtDate) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: DEBT_INCLUDE,
    });

    await recordAudit({
      req, action: 'UPDATE', module: AUDIT_MODULE, entityId: `debt:${id}`,
      oldValue: { label: existing.label, originalAmount: existing.originalAmount },
      newValue: { label: updated.label, originalAmount: updated.originalAmount },
    });
    return withBalance(updated);
  },

  /**
   * حذف مديونية — **يُرفض صراحةً** إن كانت تحمل أي حركة سداد أو أي سطر استقطاع محفوظ.
   *
   * لا Cascade هنا عمدًا: حذفٌ متتالٍ كان سيمحو تاريخًا ماليًا داخليًا كاملًا بضغطة
   * واحدة وبلا تنبيه (المتطلب ١١). الرسالة تقول للمستخدم ما يلزم فعله أولًا.
   */
  async remove(id: number, req: Request) {
    const debt = await loadDebt(id);

    if (debt.payments.length > 0) {
      const monthly = debt.payments.filter((p) => p.sourceType === 'MONTHLY_COMPENSATION').length;
      const manual = debt.payments.length - monthly;
      throw AppError.conflict(
        `لا يمكن حذف «${debt.label}»: عليها ${debt.payments.length} حركة سداد ` +
          `(${monthly} من حسبات شهرية، ${manual} يدوية). احذف تلك الحركات — أو الحسبات المرتبطة بها — أولًا.`,
      );
    }

    const linkedLines = await prisma.compensationDeductionLine.count({ where: { debtId: id } });
    if (linkedLines > 0) {
      throw AppError.conflict(
        `لا يمكن حذف «${debt.label}»: ما زال مرتبطًا بـ${linkedLines} سطر استقطاع في حسبات محفوظة.`,
      );
    }

    await prisma.employeeCompensationDebt.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: AUDIT_MODULE, entityId: `debt:${id}`, oldValue: { employeeId: debt.employeeId, label: debt.label, originalAmount: debt.originalAmount } });
    return { id, employeeId: debt.employeeId };
  },

  // ── سداد يدوي ─────────────────────────────────────────────────────────────

  /**
   * سداد سدّده الموظف خارج الحسبة الشهرية (نقدًا مثلًا).
   * يخفض الرصيد، ولا يُنشئ استقطاعًا شهريًا، ولا يمسّ الرواتب ولا المحاسبة.
   */
  async createManualPayment(
    debtId: number,
    input: { amount: number; paymentDate: string | Date; notes?: string | null },
    req: Request,
  ) {
    const debt = await loadDebt(debtId);
    const amount = asOperational(() =>
      assertPaymentWithinBalance(input.amount, { originalAmount: debt.originalAmount, movements: debt.payments, debtLabel: debt.label }),
    );

    const who = actor(req);
    const payment = await prisma.employeeCompensationDebtPayment.create({
      data: {
        debtId,
        amount,
        paymentDate: new Date(input.paymentDate),
        sourceType: 'MANUAL_PAYMENT',
        notes: input.notes ?? null,
        createdById: who.id,
        createdByName: who.name,
      },
    });

    await recordAudit({ req, action: 'CREATE', module: AUDIT_MODULE, entityId: `debtPayment:${payment.id}`, newValue: { debtId, amount, sourceType: 'MANUAL_PAYMENT' } });
    return this.getById(debtId);
  },

  /** تعديل سداد يدوي — يُقارَن بالرصيد **بعد استبعاد أثره هو**. */
  async updateManualPayment(
    paymentId: number,
    input: { amount?: number; paymentDate?: string | Date; notes?: string | null },
    req: Request,
  ) {
    const payment = await prisma.employeeCompensationDebtPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw AppError.notFound('حركة السداد غير موجودة');
    if (payment.sourceType !== 'MANUAL_PAYMENT') {
      throw AppError.badRequest('هذه الحركة ناتجة عن حسبة شهرية — عدّلها من داخل حسبة الشهر لا من هنا.');
    }

    const debt = await loadDebt(payment.debtId);
    const amount =
      input.amount !== undefined
        ? asOperational(() =>
            assertPaymentWithinBalance(input.amount as number, {
              originalAmount: debt.originalAmount,
              movements: debt.payments,
              excludeMovementId: paymentId,
              debtLabel: debt.label,
            }),
          )
        : undefined;

    await prisma.employeeCompensationDebtPayment.update({
      where: { id: paymentId },
      data: {
        ...(amount !== undefined ? { amount } : {}),
        ...(input.paymentDate !== undefined ? { paymentDate: new Date(input.paymentDate) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });

    await recordAudit({ req, action: 'UPDATE', module: AUDIT_MODULE, entityId: `debtPayment:${paymentId}`, oldValue: { amount: payment.amount }, newValue: { amount: amount ?? payment.amount } });
    return this.getById(payment.debtId);
  },

  /** حذف سداد يدوي — يرتدّ الرصيد تلقائيًا لأنه مشتقّ من الدفتر. */
  async deleteManualPayment(paymentId: number, req: Request) {
    const payment = await prisma.employeeCompensationDebtPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw AppError.notFound('حركة السداد غير موجودة');
    if (payment.sourceType !== 'MANUAL_PAYMENT') {
      throw AppError.badRequest('هذه الحركة ناتجة عن حسبة شهرية — احذفها بتعديل الحسبة أو حذفها، لا من هنا.');
    }

    await prisma.employeeCompensationDebtPayment.delete({ where: { id: paymentId } });
    await recordAudit({ req, action: 'DELETE', module: AUDIT_MODULE, entityId: `debtPayment:${paymentId}`, oldValue: { debtId: payment.debtId, amount: payment.amount } });
    return this.getById(payment.debtId);
  },

  // ── المزامنة مع حسبة الشهر ────────────────────────────────────────────────

  /**
   * يتحقّق من سطور سداد المديونية **قبل** الكتابة، داخل نفس المعاملة.
   *
   * يُستدعى من خدمة الحسبة الشهرية. يرمي عند: مديونية غير موجودة، أو تخصّ موظفًا آخر،
   * أو مبلغ يتجاوز الرصيد المتاح، أو تكرار المديونية نفسها مرتين في الشهر ذاته.
   */
  async assertDebtDeductionsValid(
    db: Db,
    params: { employeeId: number; calculationId: number | null; lines: readonly { debtId: number; amount: number; label: string }[] },
  ): Promise<void> {
    if (params.lines.length === 0) return;

    const seen = new Set<number>();
    for (const line of params.lines) {
      if (seen.has(line.debtId)) {
        throw AppError.badRequest('لا يمكن تسجيل سدادين لنفس المديونية في الشهر نفسه — ادمجهما في سطر واحد.');
      }
      seen.add(line.debtId);
    }

    const debts = await db.employeeCompensationDebt.findMany({
      where: { id: { in: [...seen] } },
      include: DEBT_INCLUDE,
    });
    const byId = new Map(debts.map((d) => [d.id, d]));

    for (const line of params.lines) {
      const debt = byId.get(line.debtId);
      if (!debt) throw AppError.notFound(`سجل المديونية المرتبط بسطر «${line.label}» غير موجود`);
      if (debt.employeeId !== params.employeeId) {
        throw AppError.badRequest(`سجل المديونية «${debt.label}» يخصّ موظفًا آخر`);
      }
      // استبعاد حركة هذا الشهر نفسها: تعديل ٢٥ ← ٣٠ يجب أن يُقارَن بالرصيد بدون الـ٢٥.
      const own = params.calculationId != null
        ? debt.payments.find((p) => p.calculationId === params.calculationId)
        : undefined;
      asOperational(() =>
        assertPaymentWithinBalance(line.amount, {
          originalAmount: debt.originalAmount,
          movements: debt.payments,
          excludeMovementId: own?.id ?? null,
          debtLabel: debt.label,
        }),
      );
    }
  },

  /**
   * يزامن حركات الدفتر مع سطور استقطاع الحسبة — **idempotent**.
   *
   * لكل مديونية في الحسبة: تحديث الحركة القائمة `(calculationId, debtId)` أو إنشاؤها.
   * وكل حركة شهرية لمديونية لم تعد في الحسبة: تُحذف. النتيجة أن إعادة الحفظ بنفس
   * المدخلات لا تغيّر شيئًا، وأن تعديل ٢٥ ← ١٥ يُحدِّث **نفس الصف** لا يضيف ثانيًا.
   */
  async syncDebtPaymentsForCalculation(
    db: Db,
    params: {
      calculationId: number;
      paymentDate: Date;
      lines: readonly { debtId: number; amount: number; deductionLineId: number | null; label: string }[];
      actorId: number | null;
      actorName: string | null;
    },
  ): Promise<void> {
    const existing = await db.employeeCompensationDebtPayment.findMany({
      where: { calculationId: params.calculationId, sourceType: 'MONTHLY_COMPENSATION' },
    });
    const existingByDebt = new Map(existing.map((p) => [p.debtId, p]));

    for (const line of params.lines) {
      const current = existingByDebt.get(line.debtId);
      if (current) {
        await db.employeeCompensationDebtPayment.update({
          where: { id: current.id },
          data: { amount: line.amount, paymentDate: params.paymentDate, deductionLineId: line.deductionLineId, notes: line.label },
        });
        existingByDebt.delete(line.debtId);
      } else {
        await db.employeeCompensationDebtPayment.create({
          data: {
            debtId: line.debtId,
            amount: line.amount,
            paymentDate: params.paymentDate,
            sourceType: 'MONTHLY_COMPENSATION',
            calculationId: params.calculationId,
            deductionLineId: line.deductionLineId,
            notes: line.label,
            createdById: params.actorId,
            createdByName: params.actorName,
          },
        });
      }
    }

    // ما تبقّى في الخريطة: مديونيات أُزيلت من الحسبة ⇒ حركاتها تُحذف فيرتدّ رصيدها.
    for (const orphan of existingByDebt.values()) {
      await db.employeeCompensationDebtPayment.delete({ where: { id: orphan.id } });
    }
  },

  /**
   * لقطة أرصدة المديونيات المرتبطة بحسبة — **قبل السداد وبعده** — للتقرير التفصيلي.
   * تُحسب من الدفتر لا تُخزَّن: أي إعادة تشغيل تعطي نفس الأرقام.
   */
  async repaymentBreakdownForCalculation(calculationId: number) {
    const payments = await prisma.employeeCompensationDebtPayment.findMany({
      where: { calculationId, sourceType: 'MONTHLY_COMPENSATION' },
      include: { debt: { include: DEBT_INCLUDE } },
      orderBy: { id: 'asc' },
    });

    return payments.map((p) => {
      const after = computeDebtBalance(p.debt.originalAmount, p.debt.payments);
      // «قبل» = الرصيد بعد استبعاد حركة هذا الشهر وحدها.
      const before = computeDebtBalance(
        p.debt.originalAmount,
        p.debt.payments.filter((m) => m.id !== p.id),
      );
      return {
        debtId: p.debt.id,
        debtLabel: p.debt.label,
        debtType: p.debt.type,
        debtDate: p.debt.debtDate,
        originalAmount: p.debt.originalAmount,
        balanceBefore: before.remainingAmount,
        paidNow: p.amount,
        balanceAfter: after.remainingAmount,
        status: after.status,
        paymentId: p.id,
      };
    });
  },
};
