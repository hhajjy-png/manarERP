import { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { roundMoney } from '../../shared/utils/money';
import {
  calculateEntitlements,
  computeEffectiveAnnualLeaveDays,
  DateInterval,
  EntitlementResult,
  WageBaseComposition,
  toCalendarDayUtc,
} from '../employees/entitlements.calc';
import { RecordEntitlementPaymentInput, UpdateEntitlementPaymentInput } from './entitlements.schema';
import { finalSettlementService } from './finalSettlement.service';

/**
 * نطاق «مستحقات الموظف» — وحدة مستقلة داخل النظام (Bounded Module).
 *
 * ═══ حدود الوحدة ═══
 * تقرأ فقط ما تحتاجه فعلًا من حقائق النظام: الموظف (المعرّف/الاسم/الحالة/تاريخ التعيين/
 * `Employee.salary`)، سجلات الإجازات المعتمدة، والعطلات الرسمية. ولا تكتب إلا في سجلّها
 * الخاص (`EmployeeEntitlementLedger`).
 *
 * لا تُنشئ ولا تُعدّل: قيود اليومية، الحسابات، الالتزامات المحاسبية، الرواتب، لقطات
 * الرواتب، `SalaryPayment`، تصدير البنك، ولا سجلات الإجازة نفسها. صرف مبلغ نقدي هنا
 * **حركة مالية داخل نطاق المستحقات فقط** ولا يستهلك أيام إجازة ولا يُحوَّل إليها.
 *
 * ═══ المفاهيم الأربعة (لا تُدمج في رقم واحد) ═══
 *  أ) الاستحقاق المحتسَب الحيّ  — يُحسب من الحقائق المصدرية عند `asOf`، ولا يُخزَّن.
 *  ب) الدفعة المسجَّلة        — واقعة تاريخية يُدخلها المستخدم، ثابتة بعد التسجيل.
 *  ج) الرصيد المتبقي          — مُشتقّ من (أ) و(ب)، لا يُخزَّن ولا يُحرَّر يدويًا.
 *  د) مكافأة نهاية الخدمة التقديرية — إخبارية فقط أثناء استمرار الخدمة، خارج المستحق للدفع.
 */

const MS_PER_DAY = 86_400_000;

/** فئات المستحق التي لها أساس احتساب في المحرّك — لا يعني ذلك أنها قابلة للصرف. */
export const ENTITLEMENT_CATEGORIES = ['LEAVE_ALLOWANCE', 'END_OF_SERVICE'] as const;
export type EntitlementCategory = (typeof ENTITLEMENT_CATEGORIES)[number];

/**
 * الفئات القابلة للصرف فعليًا في هذه الحزمة — بدل الإجازة وحده.
 *
 * مكافأة نهاية الخدمة **تقديرية دائمًا** هنا: قيمة إخبارية تُعرض للاسترشاد ولا تدخل أي
 * إجمالي قابل للدفع ولا تقبل تسجيل دفعة. تغيير `Employee.status` لا يُفعّلها — حالة الموظف
 * **ليست** اعتماد تسوية نهائية، وخلطهما يجعل تعديل حقل حالة إداري يُنشئ التزامًا ماليًا
 * قابلًا للصرف بلا أي قرار صريح. تفعيلها كاستحقاق فعلي هو دور مسار «التسوية النهائية»
 * المستقبلي (تجميد لقطة معتمدة ثم صرف)، وهو غير مُنفَّذ في هذه الحزمة.
 */
export const PAYABLE_CATEGORIES = ['LEAVE_ALLOWANCE'] as const;
export type PayableCategory = (typeof PAYABLE_CATEGORIES)[number];

/** الآلية الوحيدة التي يمكنها مستقبلًا تحويل التقدير إلى استحقاق قابل للصرف. */
const EOS_ACTIVATION_MECHANISM = 'FINAL_SETTLEMENT' as const;

/**
 * تفصيل استهلاك رصيد الإجازة السنوية لأغراض العرض فقط. netUsedLeaveDays مُشتقّة رياضيًا
 * من نفس منطق الاستثناء المركزي (computeEffectiveAnnualLeaveDays) فتساوي دائمًا الأيام
 * المستخدمة الفعلية — لا يمكن لعرض التسوية أن ينحرف عن الرصيد القانوني.
 */
export interface LeaveExclusionBreakdown {
  grossAnnualLeaveDays: number;
  holidaysExcludedDays: number;
  sickExcludedDays: number;
  netUsedLeaveDays: number;
  holidaysConfiguredCount: number;
}

/** حركة دفع مسجَّلة — واقعة تاريخية ثابتة. */
export interface EntitlementPaymentRow {
  id: number;
  category: string;
  paymentDate: Date;
  amount: number;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  createdAt: Date;
}

/** موقف فئة واحدة: محتسَب − مدفوع = متبقٍّ. الثلاثة مُشتقّة، لا شيء منها مُخزَّن. */
export interface CategoryBalance {
  entitlement: number | null; // المحتسَب حاليًا (null = بيانات غير مكتملة)
  paid: number; // مجموع الدفعات المسجَّلة لهذه الفئة
  remaining: number | null; // المتبقي للدفع = max(0, entitlement − paid)
  payable: boolean; // هل الفئة قابلة للصرف الآن؟ (نهاية الخدمة: لا أثناء استمرار الخدمة)
}

const isEntitlementCategory = (value: string): value is EntitlementCategory =>
  (ENTITLEMENT_CATEGORIES as readonly string[]).includes(value);

const isPayableCategory = (value: string): value is PayableCategory =>
  (PAYABLE_CATEGORIES as readonly string[]).includes(value);

/**
 * «اليوم» كتاريخ تقويمي محلي، مُعبَّرًا عنه بمنتصف ليل UTC — نفس الشكل الذي تُخزَّن به
 * كل تواريخ النظام. يُقرأ التقويم المحلي (التطبيق سطح مكتب يعمل بتوقيت المستخدم) ثم
 * يُثبَّت كيومٍ تقويمي، فلا يحمل وقتًا يمكن أن يُزحلق العدّ.
 */
function todayCalendarDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function assertValidDate(value: Date | null | undefined, message: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw AppError.badRequest(message);
  return value;
}

/** يتحقق من صلاحية التاريخ ثم يُثبّته على يومه التقويمي — نقطة تطبيع واحدة للمدخلات. */
function assertCalendarDay(value: Date | null | undefined, message: string): Date {
  return toCalendarDayUtc(assertValidDate(value, message));
}

class EntitlementsService {
  /**
   * الأجر المعتمد للاستحقاقات — `Employee.salary` وحده. لا بدلات، ولا
   * `Payroll.snapshotBaseSalary`، ولا أي احتياطي صامت (قرار عمل نهائي). دالة صريحة
   * قصيرة عمدًا: وجودها يمنع تسرّب أي مصدر أجر آخر إلى الاحتساب لاحقًا.
   */
  private resolveWageBase(salary: number): WageBaseComposition {
    const baseSalary = roundMoney(salary || 0);
    return { baseSalary, total: baseSalary, source: 'EMPLOYEE_SALARY' };
  }

  /**
   * نقطة الاحتساب المركزية الوحيدة — كل مسار (الكشف، التحقق من الدفع) يمرّ من هنا،
   * فلا يوجد مسار ثانٍ يمكن أن يُنتج «حقيقة استحقاق» مختلفة.
   */
  private async computeAt(
    employeeId: number,
    employee: { hireDate: Date | null; salary: number },
    asOf: Date,
  ): Promise<{ result: EntitlementResult; wageBase: WageBaseComposition; leaveExclusionBreakdown: LeaveExclusionBreakdown }> {
    const wageBase = this.resolveWageBase(employee.salary);
    const leaveExclusionBreakdown = await this.computeLeaveExclusionBreakdown(employeeId, employee.hireDate);

    const result = calculateEntitlements({
      hireDate: employee.hireDate,
      monthlyWageBase: wageBase.total,
      asOf,
      usedAnnualLeaveDays: leaveExclusionBreakdown.netUsedLeaveDays,
    });

    return { result, wageBase, leaveExclusionBreakdown };
  }

  /**
   * تفصيل استهلاك رصيد الإجازة السنوية. الرقم القانوني الفعلي (netUsedLeaveDays) يُحتسب
   * حصريًا عبر الدالة النقيّة المركزية (computeEffectiveAnnualLeaveDays) — لا تكرار
   * للقاعدة. التفكيك «خام/عطلات مستثناة/مرضي مستثنى» تصنيف عرضي إضافي فقط.
   */
  private async computeLeaveExclusionBreakdown(
    employeeId: number,
    hireDate: Date | null,
  ): Promise<LeaveExclusionBreakdown> {
    const [annualLeaves, holidays, sickLeaves] = await Promise.all([
      prisma.leave.findMany({
        where: {
          employeeId,
          type: 'ANNUAL',
          status: 'APPROVED',
          ...(hireDate ? { startDate: { gte: hireDate } } : {}),
        },
        select: { startDate: true, endDate: true },
      }),
      prisma.holiday.findMany({ select: { date: true } }),
      prisma.leave.findMany({
        where: { employeeId, type: 'SICK', status: 'APPROVED' },
        select: { startDate: true, endDate: true },
      }),
    ]);

    const holidayDates = holidays.map((h) => h.date);
    const sickIntervals: DateInterval[] = sickLeaves.map((s) => ({ start: s.startDate, end: s.endDate }));

    const dayIndex = (d: Date) => Math.floor(toCalendarDayUtc(d).getTime() / MS_PER_DAY);
    const holidaySet = new Set(holidayDates.map(dayIndex));
    const sickRanges = sickIntervals.map((s) => {
      const a = dayIndex(s.start);
      const b = dayIndex(s.end);
      return { lo: Math.min(a, b), hi: Math.max(a, b) };
    });
    const isSickDay = (day: number) => sickRanges.some((r) => day >= r.lo && day <= r.hi);

    let grossAnnualLeaveDays = 0;
    let holidaysExcludedDays = 0;
    let sickExcludedDays = 0;
    let netUsedLeaveDays = 0;

    for (const leave of annualLeaves) {
      netUsedLeaveDays += computeEffectiveAnnualLeaveDays(
        { start: leave.startDate, end: leave.endDate },
        holidayDates,
        sickIntervals,
      );

      const a = dayIndex(leave.startDate);
      const b = dayIndex(leave.endDate);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      grossAnnualLeaveDays += hi - lo + 1;
      for (let day = lo; day <= hi; day++) {
        if (holidaySet.has(day)) holidaysExcludedDays += 1;
        else if (isSickDay(day)) sickExcludedDays += 1;
      }
    }

    return {
      grossAnnualLeaveDays,
      holidaysExcludedDays,
      sickExcludedDays,
      netUsedLeaveDays,
      holidaysConfiguredCount: holidays.length,
    };
  }

  /** مجموع الدفعات المسجَّلة لكل فئة — المصدر الوحيد لأي «مدفوع». */
  private async sumPaymentsByCategory(employeeId: number): Promise<Record<string, number>> {
    const grouped = await prisma.employeeEntitlementLedger.groupBy({
      by: ['entryType'],
      where: { employeeId },
      _sum: { amount: true },
    });
    const totals: Record<string, number> = {};
    for (const row of grouped) totals[row.entryType] = roundMoney(row._sum.amount ?? 0);
    return totals;
  }

  /**
   * موقف فئة واحدة. قابلية الصرف تُقرَّر من قائمة PAYABLE_CATEGORIES وحدها — لا من حالة
   * الموظف. مكافأة نهاية الخدمة تُعرض بقيمتها المحتسَبة (للاسترشاد) لكنها غير قابلة للصرف
   * في هذه الحزمة، فلا «متبقٍّ للدفع» لها إطلاقًا.
   */
  private categoryBalance(
    category: EntitlementCategory,
    result: EntitlementResult,
    paidTotals: Record<string, number>,
  ): CategoryBalance {
    const paid = paidTotals[category] ?? 0;
    const payable = isPayableCategory(category);

    const entitlement =
      category === 'LEAVE_ALLOWANCE'
        ? result.leaveAllowanceValue
        : result.gratuity
          ? result.gratuity.total
          : null;

    if (!payable) return { entitlement, paid, remaining: null, payable: false };
    return {
      entitlement,
      paid,
      remaining: entitlement === null ? null : roundMoney(Math.max(0, entitlement - paid)),
      payable: true,
    };
  }

  /**
   * احتساب استحقاقات موظف عند تاريخ تقويمي محدَّد — نقطة الدخول العامة الوحيدة التي
   * تستخدمها النطاقات المجاورة (التصفية النهائية). وجودها يضمن أن أي «حقيقة استحقاق»
   * في النظام تمرّ من نفس المحرّك ونفس منطق الأيام التقويمية، فلا يظهر حاسب ثانٍ.
   */
  async computeAtDate(employeeId: number, at: Date) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, code: true, fullName: true, salary: true, hireDate: true, status: true },
    });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    const asOf = assertCalendarDay(at, 'تاريخ الاحتساب غير صالح');
    const computed = await this.computeAt(employeeId, employee, asOf);
    return { employee, asOf, ...computed };
  }

  /**
   * مجموع دفعات بدل الإجازة المسجَّلة **حتى تاريخ معيّن شاملًا** — الأساس الوحيد لتحديد
   * ما سبق دفعه قبل التصفية، فلا يُدفع مكوّن الإجازة مرتين. لا يُنسخ أي صف إلى التصفية:
   * سجل الدفعات يبقى المصدر التاريخي الوحيد.
   */
  async sumLeavePaymentsUpTo(employeeId: number, upTo: Date): Promise<number> {
    const agg = await prisma.employeeEntitlementLedger.aggregate({
      where: { employeeId, entryType: 'LEAVE_ALLOWANCE', entryDate: { lte: toCalendarDayUtc(upTo) } },
      _sum: { amount: true },
    });
    return roundMoney(agg._sum.amount ?? 0);
  }

  /**
   * كشف «تفاصيل مستحقات الموظف» — نموذج القراءة الموحَّد الوحيد للواجهة. تجمع الواجهة
   * كل ما تحتاجه من هنا فقط، فلا تُعيد بناء أي حقيقة استحقاق من نقاط متفرقة.
   */
  async getStatement(employeeId: number, asOfInput?: Date) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, code: true, fullName: true, salary: true, hireDate: true, status: true },
    });
    if (!employee) throw AppError.notFound('الموظف غير موجود');

    const asOf = asOfInput ? assertCalendarDay(asOfInput, 'تاريخ الاحتساب غير صالح') : todayCalendarDay();
    const { result, wageBase, leaveExclusionBreakdown } = await this.computeAt(employeeId, employee, asOf);

    const [paidTotals, payments, leaveHistory, finalSettlement, cancelledSettlements] = await Promise.all([
      this.sumPaymentsByCategory(employeeId),
      this.listPayments(employeeId),
      prisma.leave.findMany({
        where: { employeeId },
        orderBy: { startDate: 'desc' },
        select: { id: true, type: true, startDate: true, endDate: true, days: true, status: true },
      }),
      // التصفية النهائية تُقرأ ضمن نفس نموذج القراءة الموحَّد — لا نقطة قراءة ثانية للواجهة.
      finalSettlementService.getSettlement(employeeId),
      // التصفيات الملغاة — تاريخ للعرض فقط، لا يدخل أي احتساب ولا يحجب تصفية جديدة.
      finalSettlementService.listCancelled(employeeId),
    ]);

    const leaveAllowance = this.categoryBalance('LEAVE_ALLOWANCE', result, paidTotals);
    const endOfService = this.categoryBalance('END_OF_SERVICE', result, paidTotals);

    // الإجماليات القابلة للدفع تشمل الفئات القابلة للصرف فقط — مكافأة نهاية الخدمة
    // مستبعَدة دائمًا في هذه الحزمة، بمعزل تامّ عن حالة الموظف.
    const payableCategories = [leaveAllowance, endOfService].filter((c) => c.payable);
    const anyIncomplete = payableCategories.some((c) => c.entitlement === null);
    const totalPayable = anyIncomplete
      ? null
      : roundMoney(payableCategories.reduce((sum, c) => sum + (c.entitlement ?? 0), 0));
    const totalPaid = roundMoney(payableCategories.reduce((sum, c) => sum + c.paid, 0));
    const totalRemaining = totalPayable === null ? null : roundMoney(Math.max(0, totalPayable - totalPaid));

    return {
      employee,
      asOf,
      result,
      wageBase,
      leaveExclusionBreakdown,
      leaveHistory,
      payments: {
        entries: payments,
        totalsByCategory: paidTotals,
        totalRecorded: roundMoney(payments.reduce((sum, p) => sum + p.amount, 0)),
      },
      balances: {
        leaveAllowance,
        endOfService,
        totalPayable,
        totalPaid,
        totalRemaining,
        /** الفئات القابلة للصرف فعلًا — يقرؤها العميل بدل استنتاج القابلية من حالة الموظف. */
        payableCategories: [...PAYABLE_CATEGORIES],
      },
      /**
       * مكافأة نهاية الخدمة التقديرية — إخبارية بحتة **دائمًا** في هذه الحزمة.
       *
       * `isEstimate` ثابتة على true ولا تتأثر بحالة الموظف: إنهاء الخدمة إجراء إداري،
       * واعتماد التسوية قرار مالي منفصل. السيناريوهان (إنهاء من صاحب العمل / استقالة)
       * فرضيّان للاسترشاد ولا يمثّلان اعتمادًا لأيٍّ منهما ولا التزامًا قابلًا للدفع.
       */
      /**
       * التصفية النهائية (إن وُجدت) — null قبل إنشائها. حين تكون معتمدة تصبح هي النتيجة
       * التاريخية الموثوقة، ويبقى تقدير نهاية الخدمة أدناه سياقًا حسابيًا حيًّا لا أكثر.
       */
      finalSettlement,
      cancelledSettlements,
      estimatedEndOfService: {
        isEstimate: true,
        asOf,
        terminationAmount: result.gratuity ? result.gratuity.total : null,
        resignationAmount: result.gratuity ? result.gratuity.resignationAmount : null,
        includedInPayable: false,
        payableNow: false,
        /** ما الذي يلزم مستقبلًا لتحويلها إلى استحقاق فعلي — وليس تغيير حالة الموظف. */
        activationRequires: EOS_ACTIVATION_MECHANISM,
        scenariosAreHypothetical: true,
      },
    };
  }

  /** حركات الدفع المسجَّلة (الأحدث أولًا) — وقائع تاريخية، لا تُعاد كتابتها أبدًا. */
  async listPayments(employeeId: number): Promise<EntitlementPaymentRow[]> {
    const rows = await prisma.employeeEntitlementLedger.findMany({
      where: { employeeId },
      orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      category: r.entryType,
      paymentDate: r.entryDate,
      amount: r.amount,
      paymentMethod: r.paymentMethod,
      reference: r.description,
      notes: r.notes,
      createdAt: r.createdAt,
    }));
  }

  /**
   * حارس عدم التجاوز — نقطة واحدة يستدعيها الإنشاء والتعديل معًا.
   *
   * `excludePaymentId` هو جوهر التعديل: عند تحرير دفعة قائمة تُستبعد **هي نفسها** من مجموع
   * المدفوع، وإلا لصادمت الدفعةُ نفسَها ولاستحال رفع قيمتها. المتاح للدفعة المحرَّرة =
   * الاستحقاق − باقي الدفعات فقط.
   *
   * يعمل داخل نطاق المعاملة الممرَّرة (tx) لا خارجه، فتبقى القراءة والكتابة ذرّيتين معًا.
   */
  private async assertWithinRemaining(
    tx: Pick<typeof prisma, 'employeeEntitlementLedger'>,
    params: { employeeId: number; category: PayableCategory; entitlement: number; amount: number; excludePaymentId?: number },
  ): Promise<void> {
    const agg = await tx.employeeEntitlementLedger.aggregate({
      where: {
        employeeId: params.employeeId,
        entryType: params.category,
        ...(params.excludePaymentId ? { id: { not: params.excludePaymentId } } : {}),
      },
      _sum: { amount: true },
    });
    const otherPayments = roundMoney(agg._sum.amount ?? 0);
    const available = roundMoney(Math.max(0, params.entitlement - otherPayments));
    if (params.amount > available) {
      throw AppError.badRequest(
        `المبلغ يتجاوز المتبقي القابل للصرف (${available.toFixed(3)} د.ك) — لا يمكن صرف أكثر من الاستحقاق`,
      );
    }
  }

  /**
   * يجلب دفعة ويتحقق أنها تخصّ هذا الموظف فعلًا — حارس ملكية صريح.
   *
   * البحث بالمعرّف وحده ثم مقارنة `employeeId` لاحقًا يُسرّب وجود سجلات موظفين آخرين عبر
   * رسالة خطأ مختلفة؛ لذلك يُقيَّد الاستعلام بالطرفين معًا وتُعاد «غير موجودة» في الحالتين.
   */
  private async findOwnedPayment(employeeId: number, paymentId: number) {
    const payment = await prisma.employeeEntitlementLedger.findFirst({
      where: { id: paymentId, employeeId },
    });
    if (!payment) throw AppError.notFound('الدفعة غير موجودة لهذا الموظف');
    return payment;
  }

  /**
   * تسجيل دفعة مستحق فعلية. المستخدم يُدخل المبلغ والتاريخ (ومرجعًا اختياريًا) فقط —
   * كل الأرقام المحتسَبة (الاستحقاق، المدفوع، المتبقي) يشتقّها الخادم.
   *
   * التحقق سلطة الخادم وحده، ويرفض صراحةً بلا أي «قصّ صامت»:
   *  • مبلغ ≤ صفر · تاريخ غير صالح أو مستقبلي · موظف غير موجود
   *  • فئة غير مدعومة (بلا أساس محتسَب)
   *  • مكافأة نهاية الخدمة — مرفوضة **دائمًا** هنا، أيًّا كانت حالة الموظف، حتى يوجد
   *    مسار «التسوية النهائية» الذي يُفعّلها بقرار صريح
   *  • تجاوز المتبقي القابل للدفع عند تاريخ الدفعة
   *
   * يُنفَّذ داخل معاملة واحدة: يُعاد قراءة مجموع المدفوع ثم يُنشأ الصف في النطاق نفسه،
   * فلا يمكن لطلبين متزامنين تجاوز الاستحقاق معًا.
   */
  async recordPayment(employeeId: number, input: RecordEntitlementPaymentInput, req: Request) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, hireDate: true, salary: true, status: true },
    });
    if (!employee) throw AppError.notFound('الموظف غير موجود');

    if (!isEntitlementCategory(input.category)) {
      throw AppError.badRequest('نوع المستحق غير مدعوم للصرف — لا يوجد له استحقاق محتسَب');
    }
    // قابلية الصرف من القائمة المعتمدة وحدها — لا تُشتق من حالة الموظف إطلاقًا. تغيير
    // `Employee.status` إجراء إداري ولا يُنشئ التزامًا ماليًا قابلًا للصرف.
    if (!isPayableCategory(input.category)) {
      throw AppError.badRequest(
        'مكافأة نهاية الخدمة قيمة تقديرية للاسترشاد فقط — لا تُصرف إلا عبر مسار التسوية النهائية المعتمد (غير متاح بعد)',
      );
    }
    const category: PayableCategory = input.category;

    // مقارنة تقويمية بحتة: دفعة بتاريخ اليوم مقبولة في أي ساعة، وأي يوم لاحق مرفوض.
    const paymentDate = assertCalendarDay(input.paymentDate, 'تاريخ الدفعة غير صالح');
    if (paymentDate.getTime() > todayCalendarDay().getTime()) {
      throw AppError.badRequest('لا يمكن تسجيل دفعة بتاريخ مستقبلي');
    }

    const amount = roundMoney(input.amount);
    if (!(amount > 0)) throw AppError.badRequest('مبلغ الدفعة يجب أن يكون أكبر من صفر');

    // الاستحقاق يُحتسب عند **تاريخ الدفعة** لا عند «اليوم» — فتبقى الدفعة قابلة لإعادة
    // التحقق لاحقًا بنفس النتيجة مهما تقدّم الزمن.
    const { result } = await this.computeAt(employeeId, employee, paymentDate);
    const entitlement = result.leaveAllowanceValue;
    if (entitlement === null) {
      throw AppError.badRequest('تعذّر احتساب الاستحقاق — بيانات الموظف غير مكتملة (تاريخ التعيين أو الراتب)');
    }

    const entry = await prisma.$transaction(async (tx) => {
      await this.assertWithinRemaining(tx, { employeeId, category, entitlement, amount });

      return tx.employeeEntitlementLedger.create({
        data: {
          employeeId,
          entryType: category,
          entryDate: paymentDate,
          description: input.reference?.trim() || null,
          // لا تحويل للمبلغ إلى أيام إجازة، ولا استهلاك لأي رصيد إجازة بسبب الدفع.
          leaveDays: null,
          // لقطة رصيد الإجازة لحظة الدفع — توثيق تاريخي جامد، لا تدخل أي احتساب لاحق.
          leaveBalanceSnapshot: result.remainingLeaveDays,
          amount,
          paymentMethod: input.paymentMethod,
          notes: input.notes?.trim() || null,
          createdBy: req.user?.userId ?? null,
        },
      });
    });

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'employees',
      entityId: entry.id,
      newValue: { entitlementPayment: entry.entryType, amount: entry.amount },
    });
    return entry;
  }

  /**
   * تصحيح دفعة مسجَّلة — تعديل الحقول التي أدخلها المستخدم وحدها.
   *
   * ما لا يتغيّر أبدًا: الموظف، وفئة المستحق (تغييرها يُبدّل معنى الحركة الأصلية بدل
   * تصحيحها)، وأي قيمة محتسَبة. المستخدم لا يُدخل «مدفوعًا» ولا «متبقيًا» — يُعاد اشتقاقهما.
   *
   * التحقق نفسه المطبَّق على الإنشاء، عدا أن الدفعة المحرَّرة تُستبعد من مجموع المدفوع
   * (assertWithinRemaining.excludePaymentId) فتُقاس مقابل «الاستحقاق − باقي الدفعات».
   */
  async updatePayment(employeeId: number, paymentId: number, input: UpdateEntitlementPaymentInput, req: Request) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, hireDate: true, salary: true, status: true },
    });
    if (!employee) throw AppError.notFound('الموظف غير موجود');

    const existing = await this.findOwnedPayment(employeeId, paymentId);

    // الفئة تُقرأ من الصف القائم ولا تُؤخذ من المدخلات إطلاقًا (ثابتة بالتصميم).
    if (!isPayableCategory(existing.entryType)) {
      throw AppError.badRequest('هذه الحركة ليست دفعة مستحق قابلة للتعديل');
    }
    const category: PayableCategory = existing.entryType;

    const paymentDate = assertCalendarDay(input.paymentDate, 'تاريخ الدفعة غير صالح');
    if (paymentDate.getTime() > todayCalendarDay().getTime()) {
      throw AppError.badRequest('لا يمكن تسجيل دفعة بتاريخ مستقبلي');
    }

    const amount = roundMoney(input.amount);
    if (!(amount > 0)) throw AppError.badRequest('مبلغ الدفعة يجب أن يكون أكبر من صفر');

    const { result } = await this.computeAt(employeeId, employee, paymentDate);
    const entitlement = result.leaveAllowanceValue;
    if (entitlement === null) {
      throw AppError.badRequest('تعذّر احتساب الاستحقاق — بيانات الموظف غير مكتملة (تاريخ التعيين أو الراتب)');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await this.assertWithinRemaining(tx, { employeeId, category, entitlement, amount, excludePaymentId: paymentId });

      return tx.employeeEntitlementLedger.update({
        where: { id: paymentId },
        data: {
          entryDate: paymentDate,
          amount,
          paymentMethod: input.paymentMethod,
          description: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });
    });

    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'employees',
      entityId: paymentId,
      oldValue: { entitlementPayment: existing.entryType, amount: existing.amount, entryDate: existing.entryDate },
      newValue: { entitlementPayment: updated.entryType, amount: updated.amount, entryDate: updated.entryDate },
    });
    return updated;
  }

  /**
   * حذف دفعة مسجَّلة — تصحيح لسجل الدفعات فقط.
   *
   * لا أثر خارج النطاق: لا رصيد أيام إجازة يتغيّر، ولا سجل إجازة، ولا راتب، ولا قيد
   * محاسبي، ولا تقدير نهاية الخدمة. الإجماليات مُشتقّة أصلًا فتُعاد بعد الحذف تلقائيًا
   * بلا أي تعديل يدوي لرصيد.
   */
  async deletePayment(employeeId: number, paymentId: number, req: Request) {
    const existing = await this.findOwnedPayment(employeeId, paymentId);

    await prisma.employeeEntitlementLedger.delete({ where: { id: paymentId } });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'employees',
      entityId: paymentId,
      oldValue: { entitlementPayment: existing.entryType, amount: existing.amount, entryDate: existing.entryDate },
    });
    return { id: paymentId };
  }
}

export const entitlementsService = new EntitlementsService();
