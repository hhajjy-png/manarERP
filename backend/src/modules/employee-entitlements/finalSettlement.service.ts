import { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { roundMoney } from '../../shared/utils/money';
import { DAILY_WAGE_DIVISOR, toCalendarDayUtc } from '../employees/entitlements.calc';
import { entitlementsService } from './entitlements.service';
import {
  CancelFinalSettlementInput,
  RecordSettlementPaymentInput,
  UpsertFinalSettlementInput,
} from './finalSettlement.schema';

/**
 * التصفية النهائية للموظف (Employee Final Settlement v1).
 *
 * ═══ ما هي ═══
 * سجل تصفية مستقل داخل نطاق «مستحقات الموظف» يُنشأ عند انتهاء الخدمة. يتكوّن حصريًا من
 * مكوّنَين لا ثالث لهما:
 *   (١) متبقي القيمة النقدية لرصيد الإجازة عند يوم العمل الأخير، و
 *   (٢) مكافأة نهاية الخدمة وفق سبب انتهاء الخدمة المختار.
 * لا بدلات، ولا مكافآت، ولا منح، ولا بنود يدوية، ولا إضافات/خصومات حرّة.
 *
 * ═══ ما ليست ═══
 * ليست راتبًا ولا قيدًا محاسبيًا: لا تُنشئ ولا تُعدّل أي راتب، أو `SalaryPayment`، أو قيد
 * يومية، أو التزامًا محاسبيًا، أو حركة بنكية. ولا تُعدّل سجلات الإجازة ولا أيام الإجازة،
 * ولا تُغيّر `Employee.status`.
 *
 * ═══ دورة الحياة ═══
 *   DRAFT     — يُعاد احتسابه حيًّا من البيانات المرجعية عند كل قراءة. ليس لقطة، ولا يُدفع.
 *   APPROVED  — لقطة مجمَّدة تُكتب مرة واحدة. تغيّر الراتب أو أي بيان موظف بعدها لا يمسّها.
 *   PAID      — تُبلَغ حين يصل المتبقي إلى صفر.
 *   CANCELLED — حالة نهائية تاريخية: السجل واللقطة والدفعات كلها محفوظة، لكنها لم تعد
 *               التصفية النشطة ولا تقبل أي عملية.
 *
 * PAID و APPROVED **ليستا** حالتين ثابتتين بل مشتقّتين: بعد أي تصحيح على الدفعات تُعاد
 * الحالة من (الإجمالي المجمَّد − مجموع الدفعات الحالية)، فتصحيح دفعة يعيد فتح تصفية
 * مسدَّدة تلقائيًا. هذا تصحيح لسجل الدفع لا إلغاء للتصفية.
 *
 * القاعدة الثابتة: تصفية **نشطة** واحدة لكل موظف (DRAFT/APPROVED/PAID)، مع تصفيات ملغاة
 * تاريخية بلا حدّ — مفروضة بفهرس فريد جزئي في قاعدة البيانات (انظر ترحيل
 * 20260729140000_final_settlement_cancellation) لا بالواجهة وحدها.
 */

const STATUS = { DRAFT: 'DRAFT', APPROVED: 'APPROVED', PAID: 'PAID', CANCELLED: 'CANCELLED' } as const;
type SettlementStatus = (typeof STATUS)[keyof typeof STATUS];

/** الحالات التي تُعدّ «تصفية نشطة» — ما عداها تاريخ لا يحجب إنشاء تصفية جديدة. */
const ACTIVE_STATUSES: SettlementStatus[] = [STATUS.DRAFT, STATUS.APPROVED, STATUS.PAID];

/**
 * الحالة مشتقّة من المال لا مخزَّنة اعتباطًا: ما دام هناك متبقٍّ فالتصفية «معتمدة»، وحين
 * يُغطّى الإجمالي بالكامل تصبح «مسدَّدة». تُستدعى بعد كل تصحيح على الدفعات فتنضبط الحالة
 * في الاتجاهين (PAID ← APPROVED عند تخفيض دفعة، والعكس عند إكمالها).
 */
function deriveStatus(total: number, paid: number): SettlementStatus {
  return roundMoney(paid) >= roundMoney(total) ? STATUS.PAID : STATUS.APPROVED;
}

export type TerminationReason = 'RESIGNATION' | 'EMPLOYER_TERMINATION';

/**
 * مكوّنات التصفية كما تُعرض — بنفس الشكل سواء حُسبت حيًّا (مسودة) أو قُرئت من اللقطة
 * (معتمدة/مسدَّدة)، فلا تحتاج الواجهة إلى فرعين مختلفين للقراءة.
 */
export interface SettlementComputation {
  hireDate: Date | null;
  salaryUsed: number;
  dailyWage: number | null;
  wageDivisor: number;
  serviceDuration: { years: number; months: number; days: number; totalDays: number } | null;
  leaveDays: number | null;
  leaveValue: number | null;
  priorLeavePaid: number;
  leaveRemaining: number | null;
  eosScenario: TerminationReason;
  eosFullAmount: number | null;
  eosFraction: number | null;
  eosAmount: number | null;
  totalAmount: number | null;
}

function assertValidDate(value: Date | null | undefined, message: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw AppError.badRequest(message);
  return value;
}

/** يتحقق ثم يُثبّت التاريخ على يومه التقويمي — نفس دلالة التواريخ المعتمدة في النطاق. */
function assertCalendarDay(value: Date | null | undefined, message: string): Date {
  return toCalendarDayUtc(assertValidDate(value, message));
}

/** «اليوم» كتاريخ تقويمي محلي معبَّرًا عنه بمنتصف ليل UTC (نفس تخزين تواريخ النظام). */
function todayCalendarDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

class FinalSettlementService {
  /**
   * يحتسب مكوّني التصفية عند يوم العمل الأخير عبر المحرّك القانوني الوحيد.
   *
   * مكوّن الإجازة يخصم **دفعات بدل الإجازة السابقة حتى تاريخ التصفية** حتى لا يُدفع ما
   * سبق دفعه مرتين — ولا يُنسخ أي صف دفع إلى التصفية: سجل الدفعات يبقى المصدر التاريخي.
   * الخصم يمسّ المكوّن النقدي وحده: لا أيام إجازة تُستهلك، ولا مكافأة نهاية خدمة تُنقص.
   */
  private async computeComponents(employeeId: number, lastWorkingDay: Date, reason: TerminationReason): Promise<SettlementComputation> {
    const { employee, result, wageBase } = await entitlementsService.computeAtDate(employeeId, lastWorkingDay);
    const priorLeavePaid = await entitlementsService.sumLeavePaymentsUpTo(employeeId, lastWorkingDay);

    const leaveValue = result.leaveAllowanceValue;
    // لا يهبط مكوّن الإجازة تحت الصفر مهما بلغ المدفوع سابقًا.
    const leaveRemaining = leaveValue === null ? null : roundMoney(Math.max(0, leaveValue - priorLeavePaid));

    const g = result.gratuity;
    const eosAmount = g ? (reason === 'RESIGNATION' ? g.resignationAmount : g.total) : null;
    const totalAmount = leaveRemaining === null || eosAmount === null ? null : roundMoney(leaveRemaining + eosAmount);

    return {
      hireDate: employee.hireDate,
      salaryUsed: wageBase.total,
      dailyWage: result.dailyWage,
      wageDivisor: DAILY_WAGE_DIVISOR,
      serviceDuration: result.duration,
      leaveDays: result.remainingLeaveDays,
      leaveValue,
      priorLeavePaid,
      leaveRemaining,
      eosScenario: reason,
      eosFullAmount: g ? g.total : null,
      eosFraction: g ? (reason === 'RESIGNATION' ? g.resignationFraction : 1) : null,
      eosAmount,
      totalAmount,
    };
  }

  /** يقرأ مكوّنات تصفية معتمدة من لقطتها المجمَّدة — لا إعادة احتساب إطلاقًا. */
  private snapshotToComputation(row: {
    snapshotHireDate: Date | null;
    snapshotSalaryUsed: number | null;
    snapshotDailyWage: number | null;
    snapshotWageDivisor: number | null;
    snapshotServiceYears: number | null;
    snapshotServiceMonths: number | null;
    snapshotServiceDays: number | null;
    snapshotServiceTotalDays: number | null;
    snapshotLeaveDays: number | null;
    snapshotLeaveValue: number | null;
    snapshotPriorLeavePaid: number | null;
    snapshotLeaveRemaining: number | null;
    snapshotEosScenario: string | null;
    snapshotEosFullAmount: number | null;
    snapshotEosFraction: number | null;
    snapshotEosAmount: number | null;
    snapshotTotalAmount: number | null;
    terminationReason: string;
  }): SettlementComputation {
    return {
      hireDate: row.snapshotHireDate,
      salaryUsed: row.snapshotSalaryUsed ?? 0,
      dailyWage: row.snapshotDailyWage,
      wageDivisor: row.snapshotWageDivisor ?? DAILY_WAGE_DIVISOR,
      serviceDuration:
        row.snapshotServiceTotalDays === null
          ? null
          : {
              years: row.snapshotServiceYears ?? 0,
              months: row.snapshotServiceMonths ?? 0,
              days: row.snapshotServiceDays ?? 0,
              totalDays: row.snapshotServiceTotalDays,
            },
      leaveDays: row.snapshotLeaveDays,
      leaveValue: row.snapshotLeaveValue,
      priorLeavePaid: row.snapshotPriorLeavePaid ?? 0,
      leaveRemaining: row.snapshotLeaveRemaining,
      eosScenario: (row.snapshotEosScenario ?? row.terminationReason) as TerminationReason,
      eosFullAmount: row.snapshotEosFullAmount,
      eosFraction: row.snapshotEosFraction,
      eosAmount: row.snapshotEosAmount,
      totalAmount: row.snapshotTotalAmount,
    };
  }

  /** التصفية النشطة للموظف (غير الملغاة) — أساس كل عملية. */
  private findActive(employeeId: number) {
    return prisma.employeeFinalSettlement.findFirst({
      where: { employeeId, status: { in: ACTIVE_STATUSES } },
      include: { payments: { orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }] } },
    });
  }

  /**
   * يجلب التصفية النشطة ويتحقق أنها في إحدى الحالات المسموح بها للعملية المطلوبة.
   * رسائل الرفض صريحة: مسودة لم تُعتمد، أو تصفية ملغاة، لا تقبلان عمليات الدفع.
   */
  private async requireActive(employeeId: number, allowed: SettlementStatus[]) {
    const row = await this.findActive(employeeId);
    if (!row) throw AppError.notFound('لا توجد تصفية نهائية نشطة لهذا الموظف');
    if (!allowed.includes(row.status as SettlementStatus)) {
      if (row.status === STATUS.DRAFT) {
        throw AppError.badRequest('لا يمكن تنفيذ هذه العملية على مسودة — يجب اعتماد التصفية النهائية أولًا');
      }
      throw AppError.badRequest('لا يمكن تنفيذ هذه العملية على التصفية في حالتها الحالية');
    }
    return row;
  }

  /**
   * التصفيات الملغاة (تاريخ فقط) — تُقرأ للعرض ولا تدخل أي احتساب. دفعاتها تبقى مرتبطة
   * بها ولا تُرحَّل ولا تُخصم من أي تصفية جديدة.
   */
  async listCancelled(employeeId: number) {
    const rows = await prisma.employeeFinalSettlement.findMany({
      where: { employeeId, status: STATUS.CANCELLED },
      orderBy: [{ cancelledAt: 'desc' }, { id: 'desc' }],
      include: { payments: { orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }] } },
    });
    return rows.map((row) => ({
      id: row.id,
      status: STATUS.CANCELLED as SettlementStatus,
      lastWorkingDay: row.lastWorkingDay,
      terminationReason: row.terminationReason as TerminationReason,
      approvedAt: row.approvedAt,
      cancelledAt: row.cancelledAt,
      cancellationReason: row.cancellationReason,
      createdAt: row.createdAt,
      isSnapshot: true,
      computation: this.snapshotToComputation(row),
      payments: row.payments.map((p) => ({
        id: p.id,
        paymentDate: p.paymentDate,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        reference: p.reference,
        notes: p.notes,
        createdAt: p.createdAt,
      })),
      paid: roundMoney(row.payments.reduce((sum, p) => sum + p.amount, 0)),
      remaining: null,
    }));
  }

  /**
   * نموذج قراءة التصفية — يُدمج في كشف المستحقات. يُرجع null حين لا توجد تصفية نشطة.
   *
   * المسودة تُحتسب حيًّا عند كل قراءة (فتعكس أي تغيّر مرجعي قبل الاعتماد)، والمعتمدة
   * تُقرأ من لقطتها حرفيًا. المدفوع والمتبقي مُشتقّان دائمًا من صفوف الدفع مقابل إجمالي
   * اللقطة — لا رصيد متبقٍّ مخزَّن.
   */
  async getSettlement(employeeId: number) {
    const row = await this.findActive(employeeId);
    if (!row) return null;

    const isDraft = row.status === STATUS.DRAFT;
    const computation = isDraft
      ? await this.computeComponents(employeeId, row.lastWorkingDay, row.terminationReason as TerminationReason)
      : this.snapshotToComputation(row);

    const paid = roundMoney(row.payments.reduce((sum, p) => sum + p.amount, 0));
    const total = computation.totalAmount;
    const remaining = total === null ? null : roundMoney(Math.max(0, total - paid));

    return {
      id: row.id,
      status: row.status as SettlementStatus,
      lastWorkingDay: row.lastWorkingDay,
      terminationReason: row.terminationReason as TerminationReason,
      approvedAt: row.approvedAt,
      cancelledAt: row.cancelledAt,
      cancellationReason: row.cancellationReason,
      createdAt: row.createdAt,
      /** مسودة = محتسَبة حيًّا؛ معتمدة/مسدَّدة = مقروءة من لقطة مجمَّدة. */
      isSnapshot: !isDraft,
      computation,
      payments: row.payments.map((p) => ({
        id: p.id,
        paymentDate: p.paymentDate,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        reference: p.reference,
        notes: p.notes,
        createdAt: p.createdAt,
      })),
      paid,
      remaining,
    };
  }

  /** يتحقق من الموظف ومن صلاحية يوم العمل الأخير — البوابة الوحيدة لمدخلات المسودة. */
  private async validateInput(employeeId: number, input: UpsertFinalSettlementInput) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, hireDate: true, salary: true },
    });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    if (!employee.hireDate) {
      throw AppError.badRequest('لا يمكن إنشاء تصفية نهائية بدون تاريخ تعيين للموظف');
    }

    const lastWorkingDay = assertCalendarDay(input.lastWorkingDay, 'تاريخ آخر يوم عمل غير صالح');
    if (lastWorkingDay.getTime() < toCalendarDayUtc(employee.hireDate).getTime()) {
      throw AppError.badRequest('آخر يوم عمل لا يمكن أن يسبق تاريخ التعيين');
    }
    return { employee, lastWorkingDay };
  }

  /**
   * إنشاء مسودة تصفية. المستخدم يُدخل يوم العمل الأخير وسبب انتهاء الخدمة فقط؛ كل
   * المبالغ يشتقّها الخادم. الفهرس الفريد على `employeeId` يمنع تصفية ثانية على مستوى
   * قاعدة البيانات، فلا يكفي سباق طلبين لتجاوز القاعدة.
   */
  async createDraft(employeeId: number, input: UpsertFinalSettlementInput, req: Request) {
    const { lastWorkingDay } = await this.validateInput(employeeId, input);

    // التصفيات الملغاة تاريخ لا يحجب — الحاجب هو وجود تصفية **نشطة** فقط.
    const active = await this.findActive(employeeId);
    if (active) {
      throw AppError.badRequest('توجد تصفية نهائية نشطة لهذا الموظف — يجب إلغاؤها قبل إنشاء تصفية جديدة');
    }

    const row = await prisma.employeeFinalSettlement.create({
      data: {
        employeeId,
        status: STATUS.DRAFT,
        lastWorkingDay,
        terminationReason: input.terminationReason,
        createdBy: req.user?.userId ?? null,
      },
    });

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'employees',
      entityId: row.id,
      newValue: { finalSettlement: 'DRAFT', lastWorkingDay, terminationReason: row.terminationReason },
    });
    return this.getSettlement(employeeId);
  }

  /**
   * تعديل بيانات المسودة (يوم العمل الأخير/سبب انتهاء الخدمة) — يُعيد الاحتساب تلقائيًا
   * عند القراءة التالية. ممنوع بعد الاعتماد: اللقطة المعتمدة لا تُحرَّر ولا تُعاد صياغتها.
   */
  async updateDraft(employeeId: number, input: UpsertFinalSettlementInput, req: Request) {
    const existing = await this.findActive(employeeId);
    if (!existing) throw AppError.notFound('لا توجد تصفية نهائية نشطة لهذا الموظف');
    if (existing.status !== STATUS.DRAFT) {
      throw AppError.badRequest('لا يمكن تعديل تصفية معتمدة — التعديل متاح للمسودة فقط');
    }

    const { lastWorkingDay } = await this.validateInput(employeeId, input);

    await prisma.employeeFinalSettlement.update({
      where: { id: existing.id },
      data: { lastWorkingDay, terminationReason: input.terminationReason },
    });

    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'employees',
      entityId: existing.id,
      oldValue: { lastWorkingDay: existing.lastWorkingDay, terminationReason: existing.terminationReason },
      newValue: { lastWorkingDay, terminationReason: input.terminationReason },
    });
    return this.getSettlement(employeeId);
  }

  /**
   * اعتماد التصفية — تجميد النتيجة.
   *
   * يُحتسب المكوّنان مرة أخيرة من البيانات المرجعية الحالية ثم تُكتب اللقطة كاملةً في
   * نفس المعاملة. بعد هذه اللحظة لا يُعاد الاحتساب أبدًا: تغيّر `Employee.salary` أو أي
   * بيان موظف أو أي دفعة مستحقات جديدة لا يمسّ رقمًا واحدًا من اللقطة.
   */
  async approve(employeeId: number, req: Request) {
    const existing = await this.findActive(employeeId);
    if (!existing) throw AppError.notFound('لا توجد تصفية نهائية نشطة لهذا الموظف');
    if (existing.status !== STATUS.DRAFT) {
      throw AppError.badRequest('التصفية معتمدة بالفعل');
    }

    const c = await this.computeComponents(
      employeeId,
      existing.lastWorkingDay,
      existing.terminationReason as TerminationReason,
    );
    if (c.totalAmount === null) {
      throw AppError.badRequest('تعذّر احتساب التصفية — بيانات الموظف غير مكتملة (تاريخ التعيين أو الراتب)');
    }

    const approvedAt = new Date();
    await prisma.employeeFinalSettlement.update({
      where: { id: existing.id },
      data: {
        status: STATUS.APPROVED,
        approvedAt,
        approvedBy: req.user?.userId ?? null,
        snapshotHireDate: c.hireDate,
        snapshotSalaryUsed: c.salaryUsed,
        snapshotDailyWage: c.dailyWage,
        snapshotWageDivisor: c.wageDivisor,
        snapshotServiceYears: c.serviceDuration?.years ?? null,
        snapshotServiceMonths: c.serviceDuration?.months ?? null,
        snapshotServiceDays: c.serviceDuration?.days ?? null,
        snapshotServiceTotalDays: c.serviceDuration?.totalDays ?? null,
        snapshotLeaveDays: c.leaveDays,
        snapshotLeaveValue: c.leaveValue,
        snapshotPriorLeavePaid: c.priorLeavePaid,
        snapshotLeaveRemaining: c.leaveRemaining,
        snapshotEosScenario: c.eosScenario,
        snapshotEosFullAmount: c.eosFullAmount,
        snapshotEosFraction: c.eosFraction,
        snapshotEosAmount: c.eosAmount,
        snapshotTotalAmount: c.totalAmount,
      },
    });

    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'employees',
      entityId: existing.id,
      oldValue: { finalSettlement: 'DRAFT' },
      newValue: { finalSettlement: 'APPROVED', total: c.totalAmount, eosScenario: c.eosScenario },
    });
    return this.getSettlement(employeeId);
  }

  /**
   * تسجيل دفعة على تصفية معتمدة. المستخدم يُدخل المبلغ والتاريخ فقط؛ المدفوع والمتبقي
   * يشتقّهما الخادم من صفوف الدفع مقابل إجمالي اللقطة.
   *
   * يُرفض صراحةً بلا أي قصّ صامت: الدفع على مسودة، الدفع على تصفية مسدَّدة، مبلغ ≤ صفر،
   * تاريخ غير صالح أو مستقبلي، تاريخ سابق لاعتماد التصفية، ومبلغ يتجاوز المتبقي.
   * القراءة والكتابة داخل معاملة واحدة، فلا يتجاوز طلبان متزامنان الإجمالي معًا.
   */
  async recordPayment(employeeId: number, input: RecordSettlementPaymentInput, req: Request) {
    const settlement = await this.requireActive(employeeId, [STATUS.APPROVED]);
    const total = this.approvedTotal(settlement);
    const { paymentDate, amount } = this.validatePaymentFields(settlement, input);

    const entry = await prisma.$transaction(async (tx) => {
      await this.assertWithinAvailable(tx, settlement.id, total, amount);
      const created = await tx.finalSettlementPayment.create({
        data: {
          settlementId: settlement.id,
          paymentDate,
          amount,
          paymentMethod: input.paymentMethod,
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
          createdBy: req.user?.userId ?? null,
        },
      });
      await this.syncStatus(tx, settlement.id, total);
      return created;
    });

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'employees',
      entityId: entry.id,
      newValue: { finalSettlementPayment: settlement.id, amount: entry.amount },
    });
    return this.getSettlement(employeeId);
  }

  /** الإجمالي المجمَّد — الأساس الوحيد لكل حساب دفع/متبقٍّ. */
  private approvedTotal(settlement: { snapshotTotalAmount: number | null }): number {
    if (settlement.snapshotTotalAmount === null) {
      throw AppError.badRequest('التصفية المعتمدة بلا إجمالي محفوظ');
    }
    return settlement.snapshotTotalAmount;
  }

  /** تحقّق مشترك لحقول الدفعة — نفسه للتسجيل والتعديل، فلا تتباعد القاعدتان. */
  private validatePaymentFields(
    settlement: { approvedAt: Date | null },
    input: RecordSettlementPaymentInput,
  ): { paymentDate: Date; amount: number } {
    const paymentDate = assertCalendarDay(input.paymentDate, 'تاريخ الدفعة غير صالح');
    if (paymentDate.getTime() > todayCalendarDay().getTime()) {
      throw AppError.badRequest('لا يمكن تسجيل دفعة بتاريخ مستقبلي');
    }
    if (settlement.approvedAt && paymentDate.getTime() < toCalendarDayUtc(settlement.approvedAt).getTime()) {
      throw AppError.badRequest('لا يمكن تسجيل دفعة بتاريخ سابق لاعتماد التصفية');
    }
    const amount = roundMoney(input.amount);
    if (!(amount > 0)) throw AppError.badRequest('مبلغ الدفعة يجب أن يكون أكبر من صفر');
    return { paymentDate, amount };
  }

  /**
   * حارس عدم التجاوز — نقطة واحدة للتسجيل والتعديل.
   *
   * `excludePaymentId` هو جوهر التعديل: تُستبعد الدفعة المحرَّرة من المجموع، وإلا لصادمت
   * نفسها فبدت كل زيادة تجاوزًا. المتاح لها = الإجمالي المعتمد − **باقي** الدفعات.
   * يعمل داخل نطاق المعاملة الممرَّرة فتبقى القراءة والكتابة ذرّيتين معًا.
   */
  private async assertWithinAvailable(
    tx: Pick<typeof prisma, 'finalSettlementPayment'>,
    settlementId: number,
    total: number,
    amount: number,
    excludePaymentId?: number,
  ): Promise<void> {
    const agg = await tx.finalSettlementPayment.aggregate({
      where: { settlementId, ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}) },
      _sum: { amount: true },
    });
    const others = roundMoney(agg._sum.amount ?? 0);
    const available = roundMoney(Math.max(0, total - others));
    if (amount > available) {
      throw AppError.badRequest(
        `المبلغ يتجاوز المتبقي من التصفية (${available.toFixed(3)} د.ك) — لا يمكن دفع أكثر من الإجمالي المعتمد`,
      );
    }
  }

  /**
   * يعيد ضبط الحالة من واقع الدفعات بعد أي تغيير — داخل نفس المعاملة، فلا تُقرأ حالة
   * لا تطابق رصيدها. هنا يحدث انتقال PAID ← APPROVED تلقائيًا عند تخفيض/حذف دفعة.
   */
  private async syncStatus(
    tx: Pick<typeof prisma, 'finalSettlementPayment' | 'employeeFinalSettlement'>,
    settlementId: number,
    total: number,
  ): Promise<void> {
    const agg = await tx.finalSettlementPayment.aggregate({
      where: { settlementId },
      _sum: { amount: true },
    });
    const paid = roundMoney(agg._sum.amount ?? 0);
    await tx.employeeFinalSettlement.update({
      where: { id: settlementId },
      data: { status: deriveStatus(total, paid) },
    });
  }

  /** يجلب دفعة ويتحقق أنها تخصّ تصفية هذا الموظف — استعلام مقيَّد بالطرفين معًا. */
  private async findOwnedPayment(settlementId: number, paymentId: number) {
    const payment = await prisma.finalSettlementPayment.findFirst({ where: { id: paymentId, settlementId } });
    if (!payment) throw AppError.notFound('الدفعة غير موجودة لهذه التصفية');
    return payment;
  }

  /**
   * تصحيح دفعة تصفية مسجَّلة — الحقول التي أدخلها المستخدم وحدها.
   *
   * لا تمسّ اللقطة المجمَّدة ولا الإجمالي المعتمد ولا مكوّني التصفية إطلاقًا. بعد التعديل
   * تُشتق الحالة من جديد، فقد تعود تصفية «مسدَّدة» إلى «معتمدة» — وهذا تصحيح لسجل الدفع،
   * لا إلغاء للتصفية.
   */
  async updatePayment(employeeId: number, paymentId: number, input: RecordSettlementPaymentInput, req: Request) {
    const settlement = await this.requireActive(employeeId, [STATUS.APPROVED, STATUS.PAID]);
    const total = this.approvedTotal(settlement);
    const existing = await this.findOwnedPayment(settlement.id, paymentId);
    const { paymentDate, amount } = this.validatePaymentFields(settlement, input);

    const updated = await prisma.$transaction(async (tx) => {
      await this.assertWithinAvailable(tx, settlement.id, total, amount, paymentId);
      const row = await tx.finalSettlementPayment.update({
        where: { id: paymentId },
        data: {
          paymentDate,
          amount,
          paymentMethod: input.paymentMethod,
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });
      await this.syncStatus(tx, settlement.id, total);
      return row;
    });

    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'employees',
      entityId: paymentId,
      oldValue: { finalSettlementPayment: settlement.id, amount: existing.amount, paymentDate: existing.paymentDate },
      newValue: { finalSettlementPayment: settlement.id, amount: updated.amount, paymentDate: updated.paymentDate },
    });
    return this.getSettlement(employeeId);
  }

  /**
   * حذف دفعة تصفية — تصحيح لسجل الدفع وحده. اللقطة المجمَّدة لا تتغيّر، والحالة تُشتق
   * من جديد بعد الحذف (فتعود «معتمدة» إن ظهر متبقٍّ).
   */
  async deletePayment(employeeId: number, paymentId: number, req: Request) {
    const settlement = await this.requireActive(employeeId, [STATUS.APPROVED, STATUS.PAID]);
    const total = this.approvedTotal(settlement);
    const existing = await this.findOwnedPayment(settlement.id, paymentId);

    await prisma.$transaction(async (tx) => {
      await tx.finalSettlementPayment.delete({ where: { id: paymentId } });
      await this.syncStatus(tx, settlement.id, total);
    });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'employees',
      entityId: paymentId,
      oldValue: {
        finalSettlementPayment: settlement.id,
        amount: existing.amount,
        paymentDate: existing.paymentDate,
        paymentMethod: existing.paymentMethod,
      },
    });
    return this.getSettlement(employeeId);
  }

  /**
   * إلغاء تصفية معتمدة/مسدَّدة — حالة نهائية، **لا حذف**.
   *
   * يُحفظ كل شيء كما هو: اللقطة المجمَّدة، بيانات الاعتماد، وكل الدفعات المسجَّلة. ما
   * يتغيّر هو الحالة فقط، فتخرج التصفية من كونها «نشطة» ولا تقبل أي عملية بعدها، ويصبح
   * إنشاء تصفية جديدة ممكنًا. دفعات التصفية الملغاة تبقى مرتبطة بها ولا تُخصم من أي
   * تصفية لاحقة.
   */
  async cancel(employeeId: number, input: CancelFinalSettlementInput, req: Request) {
    const settlement = await this.requireActive(employeeId, [STATUS.APPROVED, STATUS.PAID]);
    const reason = input.cancellationReason.trim();
    if (!reason) throw AppError.badRequest('سبب الإلغاء مطلوب');

    await prisma.employeeFinalSettlement.update({
      where: { id: settlement.id },
      data: {
        status: STATUS.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: req.user?.userId ?? null,
        cancellationReason: reason,
      },
    });

    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'employees',
      entityId: settlement.id,
      oldValue: { finalSettlement: settlement.status, total: settlement.snapshotTotalAmount },
      newValue: { finalSettlement: STATUS.CANCELLED, cancellationReason: reason },
    });
    return this.getSettlement(employeeId);
  }

  /**
   * حذف مسودة لم تُعتمد قط — حذف فعلي مسموح هنا وحده: لا لقطة مجمَّدة، ولا دفعات ممكنة
   * (الدفع يتطلّب الاعتماد)، فلا تاريخ مالي يُفقد. المعتمدة/المسدَّدة تُلغى ولا تُحذف.
   */
  async deleteDraft(employeeId: number, req: Request) {
    const settlement = await this.requireActive(employeeId, [STATUS.DRAFT]);

    await prisma.employeeFinalSettlement.delete({ where: { id: settlement.id } });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'employees',
      entityId: settlement.id,
      oldValue: {
        finalSettlement: STATUS.DRAFT,
        lastWorkingDay: settlement.lastWorkingDay,
        terminationReason: settlement.terminationReason,
      },
    });
    return null;
  }
}

export const finalSettlementService = new FinalSettlementService();
