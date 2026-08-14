/**
 * خدمة مستحقات الموظف الشهرية.
 *
 * ═══ حدود الوحدة (المتطلبان ١ و٣١) ═══
 * تكتب **حصريًا** في الجداول الأربعة الخاصة بها. لا تستورد ولا تستدعي أي خدمة رواتب أو
 * محاسبة أو مصروفات أو شيكات أو بنوك أو نهاية خدمة، ولا تنشئ قيدًا ولا حركة ولا بندًا
 * في أي وحدة أخرى. `Employee` تُقرأ فقط — ولا يُكتب فيها حرف واحد، ولا في راتبها.
 *
 * الاستيرادات في هذا الملف هي البرهان العملي على ذلك: `prisma`، محرّك الحساب، أدوات
 * الإطار. لا شيء غيرها. أي استيراد جديد من `modules/payroll` أو `modules/accounting`
 * أو `modules/transactions` أو `modules/expenses` هنا يخرق عقد الوحدة.
 *
 * ═══ اللقطة التاريخية (المتطلب ٥) ═══
 * بيانات الموظف والراتب وأجر الساعة تُكتب مرة واحدة عند **الإنشاء**. كل تحديث لاحق
 * يُعيد الاحتساب من **اللقطة** لا من ملف الموظف الحيّ. فتغيير اسم الموظف أو راتبه غدًا
 * لا يغيّر كشف يونيو الماضي.
 *
 * ═══ الاعتماد حالة تنظيمية (المتطلب ١٧) ═══
 * `APPROVED` لا يقفل شيئًا: التعديل والحذف وإعادة الاعتماد كلها متاحة بعده. لا يوجد
 * «إعادة فتح» ولا صلاحية له — لأنه لا يوجد قفل يُفتح.
 */
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import {
  computeCompensation,
  computeHourlyRate,
  reverseOvertimeFromAmount,
  MONTHLY_WAGE_DAYS_DIVISOR,
  MONTHLY_WORK_HOURS,
  STANDARD_HOURS_PER_DAY,
  type CompensationResult,
  type OvertimeType,
} from './engine';
import type { CalculationBody } from './employeeCompensation.schema';
import { employeeCompensationDebtService as debtService } from './employeeCompensationDebt.service';

const AUDIT_MODULE = 'employeeCompensation';

/** الحقول التي تُقرأ من ملف الموظف — قراءة فقط، ولا شيء غيرها. */
const EMPLOYEE_SELECT = {
  id: true,
  code: true,
  fullName: true,
  jobTitle: true,
  department: true,
  nationality: true,
  civilId: true,
  salary: true,
  status: true,
} as const;

const CALCULATION_INCLUDE = {
  overtimeLines: { orderBy: { sortOrder: 'asc' } },
  earningLines: { orderBy: { sortOrder: 'asc' } },
  deductionLines: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.EmployeeCompensationCalculationInclude;

type CalculationWithLines = Prisma.EmployeeCompensationCalculationGetPayload<{
  include: typeof CALCULATION_INCLUDE;
}>;

/** اسم المستخدم المنفّذ — تسجيل فقط، بلا علاقة FK. */
function actor(req: Request): { id: number | null; name: string | null } {
  return { id: req.user?.userId ?? null, name: req.user?.username ?? null };
}

/**
 * مجموع ساعات الإضافي **العادي** في بقية أشهر السنة نفسها.
 * استعلام واحد؛ المحرّك نفسه لا يلمس قاعدة البيانات إطلاقًا.
 */
async function priorRegularOvertimeHours(
  employeeId: number,
  year: number,
  excludeCalculationId?: number,
): Promise<number> {
  const rows = await prisma.overtimeLine.findMany({
    where: {
      overtimeType: 'REGULAR',
      calculation: {
        employeeId,
        year,
        ...(excludeCalculationId ? { id: { not: excludeCalculationId } } : {}),
      },
    },
    select: { hours: true },
  });
  return rows.reduce((sum, r) => sum + r.hours, 0);
}

/** يبني مدخل المحرّك من جسم الطلب + اللقطة المحفوظة. */
function toEngineInput(
  body: CalculationBody,
  basicSalary: number,
  hourlyRateOverride: number | null,
  priorHours: number,
) {
  return {
    basicSalary,
    hourlyRateOverride,
    priorRegularOvertimeHoursThisYear: priorHours,
    overtime: body.overtime.map((l) => ({
      overtimeType: l.overtimeType as OvertimeType,
      hours: l.hours,
      calculationMethod: l.calculationMethod,
      reverseTargetAmount: l.reverseTargetAmount ?? null,
      rawHoursBeforeCeiling: l.rawHoursBeforeCeiling ?? null,
      notes: l.notes ?? null,
    })),
    earnings: body.earnings.map((e) => ({
      type: e.type,
      label: e.label,
      amount: e.amount,
      entryDate: e.entryDate ?? null,
      reason: e.reason ?? null,
      notes: e.notes ?? null,
      recurring: e.recurring ?? false,
    })),
    deductions: body.deductions.map((d) => ({
      type: d.type,
      label: d.label,
      amount: d.amount,
      notes: d.notes ?? null,
      debtId: d.debtId ?? null,
    })),
  };
}

/** يحوّل نتيجة المحرّك إلى صفوف الأبناء الجاهزة للكتابة. */
function toChildRows(result: CompensationResult) {
  return {
    overtimeLines: result.overtimeLines.map((l) => ({
      overtimeType: l.overtimeType,
      hours: l.hours,
      hourlyRate: l.hourlyRate,
      multiplier: l.multiplier,
      amount: l.amount,
      calculationMethod: l.calculationMethod,
      reverseTargetAmount: l.reverseTargetAmount,
      rawHoursBeforeCeiling: l.rawHoursBeforeCeiling,
      legalReference: l.legalReference,
      notes: l.notes,
      sortOrder: l.sortOrder,
    })),
    earningLines: result.earningLines.map((l) => ({
      type: l.type,
      label: l.label,
      amount: l.amount,
      entryDate: l.entryDate,
      reason: l.reason,
      notes: l.notes,
      recurring: l.recurring,
      sortOrder: l.sortOrder,
    })),
    deductionLines: result.deductionLines.map((l) => ({
      type: l.type,
      label: l.label,
      amount: l.amount,
      notes: l.notes,
      debtId: l.debtId,
      sortOrder: l.sortOrder,
    })),
  };
}

/** الإجماليات المشتقّة — تُكتب من نتيجة المحرّك وحدها، لا تُجمع هنا مرة ثانية. */
function toTotals(result: CompensationResult) {
  return {
    totalOvertimeAmount: result.totalOvertimeAmount,
    totalOtherEarnings: result.totalOtherEarnings,
    grossEntitlements: result.grossEntitlements,
    totalDeductions: result.totalDeductions,
    netAmount: result.netAmount,
  };
}

async function loadCalculation(id: number): Promise<CalculationWithLines> {
  const calc = await prisma.employeeCompensationCalculation.findUnique({
    where: { id },
    include: CALCULATION_INCLUDE,
  });
  if (!calc) throw AppError.notFound('حسبة المستحقات غير موجودة');
  return calc;
}

/** يعيد احتساب سجل محفوظ من لقطته — لإعادة إنتاج التحذيرات بلا كتابة. */
async function recomputeStored(calc: CalculationWithLines): Promise<CompensationResult> {
  const priorHours = await priorRegularOvertimeHours(calc.employeeId, calc.year, calc.id);
  return computeCompensation({
    basicSalary: calc.basicSalarySnapshot,
    hourlyRateOverride: calc.hourlyRateSnapshot,
    priorRegularOvertimeHoursThisYear: priorHours,
    overtime: calc.overtimeLines.map((l) => ({
      overtimeType: l.overtimeType as OvertimeType,
      hours: l.hours,
      calculationMethod: l.calculationMethod as 'MANUAL_HOURS' | 'REVERSE_FROM_AMOUNT',
      reverseTargetAmount: l.reverseTargetAmount,
      rawHoursBeforeCeiling: l.rawHoursBeforeCeiling,
      notes: l.notes,
    })),
    earnings: calc.earningLines.map((l) => ({
      type: l.type as never,
      label: l.label,
      amount: l.amount,
      entryDate: l.entryDate,
      reason: l.reason,
      notes: l.notes,
      recurring: l.recurring,
    })),
    deductions: calc.deductionLines.map((l) => ({
      type: l.type as never,
      label: l.label,
      amount: l.amount,
      notes: l.notes,
      debtId: l.debtId,
    })),
  });
}

/**
 * تاريخ حركة سداد الشهر = **آخر يوم في شهر الحسبة**، لا لحظة الحفظ.
 *
 * السداد يخصّ الشهر لا يوم إدخاله: حسبةُ يونيو تُحفظ في يوليو، وتاريخُ الحفظ كان
 * سيضع حركةً في يوليو على دفتر مديونية يقرؤه المحاسب زمنيًا. وهو كذلك حتمي: إعادة
 * الحفظ لا تُحرّك التاريخ.
 */
function monthEndDate(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0));
}

/** سطور سداد المديونية داخل نتيجة المحرّك. */
function debtLinesOf(result: CompensationResult) {
  return result.deductionLines
    .filter((l): l is typeof l & { debtId: number } => l.debtId != null)
    .map((l) => ({ debtId: l.debtId, amount: l.amount, label: l.label }));
}

/**
 * يزامن دفتر المديونيات مع سطور الحسبة المحفوظة — تُستدعى داخل المعاملة وحدها.
 *
 * تربط كل سطر سداد بمعرّف سطر الاستقطاع الحقيقي بعد كتابته، فيبقى المؤشّر صحيحًا في
 * التقرير التفصيلي. الهوية تبقى `(calculationId, debtId)`، فالمزامنة idempotent.
 */
async function syncDebtPayments(
  tx: Prisma.TransactionClient,
  calc: CalculationWithLines,
  debtLines: readonly { debtId: number; amount: number; label: string }[],
  who: { id: number | null; name: string | null },
): Promise<void> {
  const lineIdByDebt = new Map(
    calc.deductionLines.filter((l) => l.debtId != null).map((l) => [l.debtId as number, l.id]),
  );
  await debtService.syncDebtPaymentsForCalculation(tx, {
    calculationId: calc.id,
    paymentDate: monthEndDate(calc.year, calc.month),
    lines: debtLines.map((l) => ({ ...l, deductionLineId: lineIdByDebt.get(l.debtId) ?? null })),
    actorId: who.id,
    actorName: who.name,
  });
}

export const employeeCompensationService = {
  /**
   * قائمة الموظفين مع ملخّص سنتهم: عدد الأشهر المحتسَبة، آخر شهر، وإجمالي السنة.
   * الإجمالي هنا **خاص بهذه الوحدة** ولا يُرحَّل إلى أي وحدة مالية.
   */
  async listSummaries(params: { year: number; search?: string; status?: string }) {
    const { year, search, status } = params;

    const employees = await prisma.employee.findMany({
      where: {
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(search
          ? { OR: [{ fullName: { contains: search } }, { code: { contains: search } }] }
          : {}),
      },
      select: EMPLOYEE_SELECT,
      orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
    });

    const calcs = await prisma.employeeCompensationCalculation.findMany({
      where: { year, employeeId: { in: employees.map((e) => e.id) } },
      select: { employeeId: true, month: true, netAmount: true, status: true },
    });

    const byEmployee = new Map<number, typeof calcs>();
    for (const c of calcs) {
      const list = byEmployee.get(c.employeeId) ?? [];
      list.push(c);
      byEmployee.set(c.employeeId, list);
    }

    return {
      year,
      employees: employees.map((e) => {
        const rows = byEmployee.get(e.id) ?? [];
        const months = rows.map((r) => r.month).sort((a, b) => a - b);
        return {
          id: e.id,
          code: e.code,
          fullName: e.fullName,
          jobTitle: e.jobTitle,
          department: e.department,
          status: e.status,
          currentBasicSalary: e.salary,
          completedMonths: rows.length,
          approvedMonths: rows.filter((r) => r.status === 'APPROVED').length,
          lastCalculatedMonth: months.length ? months[months.length - 1] : null,
          // مجموع صافي الأشهر المحتسَبة لهذه السنة — عرضٌ داخل الوحدة لا رقم محاسبي.
          yearNetTotal: Number(rows.reduce((s, r) => s + r.netAmount, 0).toFixed(3)),
        };
      }),
    };
  },

  /** الملف السنوي: رأس الموظف + الاثنا عشر شهرًا + الملخّص السنوي. */
  async getAnnualFile(employeeId: number, year: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: EMPLOYEE_SELECT });
    if (!employee) throw AppError.notFound('الموظف غير موجود');

    const calcs = await prisma.employeeCompensationCalculation.findMany({
      where: { employeeId, year },
      include: CALCULATION_INCLUDE,
      orderBy: { month: 'asc' },
    });

    const byMonth = new Map(calcs.map((c) => [c.month, c]));
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const c = byMonth.get(month);
      if (!c) return { month, exists: false as const, status: 'NOT_CREATED' as const };
      return {
        month,
        exists: true as const,
        id: c.id,
        status: c.status,
        basicSalarySnapshot: c.basicSalarySnapshot,
        totalOvertimeAmount: c.totalOvertimeAmount,
        totalOtherEarnings: c.totalOtherEarnings,
        totalDeductions: c.totalDeductions,
        grossEntitlements: c.grossEntitlements,
        netAmount: c.netAmount,
        overtimeHours: Number(c.overtimeLines.reduce((s, l) => s + l.hours, 0).toFixed(3)),
        approvedAt: c.approvedAt,
        updatedAt: c.updatedAt,
      };
    });

    const sum = (pick: (c: (typeof calcs)[number]) => number) =>
      Number(calcs.reduce((s, c) => s + pick(c), 0).toFixed(3));

    return {
      employee: {
        id: employee.id,
        code: employee.code,
        fullName: employee.fullName,
        jobTitle: employee.jobTitle,
        department: employee.department,
        nationality: employee.nationality,
        civilId: employee.civilId,
        status: employee.status,
        /** الراتب الأساسي **الحالي** من ملف الموظف — للعرض في الرأس فقط. */
        currentBasicSalary: employee.salary,
      },
      year,
      months,
      // ملخّص سنوي خاص بهذه الوحدة وحدها (المتطلب ٤). لا يُرحَّل إلى أي وحدة مالية.
      yearSummary: {
        createdMonths: calcs.length,
        approvedMonths: calcs.filter((c) => c.status === 'APPROVED').length,
        totalBasic: sum((c) => c.basicSalarySnapshot),
        totalOvertime: sum((c) => c.totalOvertimeAmount),
        totalOtherEarnings: sum((c) => c.totalOtherEarnings),
        totalDeductions: sum((c) => c.totalDeductions),
        totalGross: sum((c) => c.grossEntitlements),
        totalNet: sum((c) => c.netAmount),
      },
    };
  },

  /** حسبة شهر بعينها، أو `null` إن لم تُنشأ بعد. */
  async getMonth(employeeId: number, year: number, month: number) {
    const calc = await prisma.employeeCompensationCalculation.findUnique({
      where: { employeeId_year_month: { employeeId, year, month } },
      include: CALCULATION_INCLUDE,
    });
    if (!calc) return null;
    const recomputed = await recomputeStored(calc);
    return { ...calc, warnings: recomputed.warnings };
  },

  async getById(id: number) {
    const calc = await loadCalculation(id);
    const recomputed = await recomputeStored(calc);
    return { ...calc, warnings: recomputed.warnings };
  },

  /**
   * إنشاء حسبة شهر — يكتب اللقطة التاريخية مرة واحدة.
   * القيد `employeeId + year + month` فريد؛ محاولة إنشاء ثانية تُرفض بـ٤٠٩ لا تُنشئ إصدارًا.
   */
  async create(employeeId: number, year: number, month: number, body: CalculationBody, req: Request) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: EMPLOYEE_SELECT });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    if (!(employee.salary > 0)) {
      throw AppError.badRequest('لا يمكن إنشاء الحسبة: الراتب الأساسي المسجَّل للموظف غير صالح (يجب أن يكون أكبر من صفر)');
    }

    const existing = await prisma.employeeCompensationCalculation.findUnique({
      where: { employeeId_year_month: { employeeId, year, month } },
      select: { id: true },
    });
    if (existing) {
      throw AppError.conflict('توجد حسبة محفوظة لهذا الموظف في هذا الشهر — افتحها وعدّلها بدل إنشاء نسخة ثانية');
    }

    const hourlyRate = computeHourlyRate(employee.salary);
    const priorHours = await priorRegularOvertimeHours(employeeId, year);
    const result = computeCompensation(toEngineInput(body, employee.salary, hourlyRate, priorHours));
    const children = toChildRows(result);
    const who = actor(req);

    // معاملة واحدة: التحقّق من أرصدة المديونيات ← إنشاء الحسبة وسطورها ← مزامنة الدفتر.
    // فشل أي خطوة يُرجع كل شيء — لا حسبة بلا حركة سداد، ولا حركة بلا حسبة.
    const created = await prisma.$transaction(async (tx) => {
      const debtLines = debtLinesOf(result);
      await debtService.assertDebtDeductionsValid(tx, { employeeId, calculationId: null, lines: debtLines });

      const row = await tx.employeeCompensationCalculation.create({
      data: {
        employeeId,
        year,
        month,
        status: 'DRAFT',
        // ── اللقطة: تُكتب هنا مرة واحدة ولا تُحدَّث بعدها أبدًا ──
        employeeNumberSnapshot: employee.code,
        employeeNameSnapshot: employee.fullName,
        jobTitleSnapshot: employee.jobTitle,
        departmentSnapshot: employee.department,
        nationalitySnapshot: employee.nationality,
        civilIdSnapshot: employee.civilId,
        basicSalarySnapshot: employee.salary,
        hourlyRateSnapshot: result.hourlyRate,
        legalRulesVersion: result.legalRulesVersion,
        ...toTotals(result),
        notes: body.notes ?? null,
        createdById: who.id,
        createdByName: who.name,
        overtimeLines: { create: children.overtimeLines },
        earningLines: { create: children.earningLines },
        deductionLines: { create: children.deductionLines },
      },
        include: CALCULATION_INCLUDE,
      });

      await syncDebtPayments(tx, row, debtLines, who);
      return row;
    });

    await recordAudit({
      req,
      action: 'CREATE',
      module: AUDIT_MODULE,
      entityId: created.id,
      newValue: { employeeId, year, month, netAmount: created.netAmount },
    });

    return { ...created, warnings: result.warnings };
  },

  /**
   * تحديث حسبة قائمة — **متاح حتى بعد الاعتماد** (المتطلب ١٧).
   * السطور تُستبدل بالكامل (حذف ثم إنشاء) داخل معاملة واحدة: لا سطور يتيمة، ولا حالة
   * وسطى يقرأها طلب متزامن.
   */
  async update(id: number, body: CalculationBody, req: Request) {
    const existing = await loadCalculation(id);
    const priorHours = await priorRegularOvertimeHours(existing.employeeId, existing.year, existing.id);

    // الاحتساب من **اللقطة** لا من ملف الموظف الحيّ — جوهر السلوك التاريخي.
    const result = computeCompensation(
      toEngineInput(body, existing.basicSalarySnapshot, existing.hourlyRateSnapshot, priorHours),
    );
    const children = toChildRows(result);

    const who = actor(req);
    const updated = await prisma.$transaction(async (tx) => {
      const debtLines = debtLinesOf(result);
      // التحقّق **قبل** أي كتابة، ومع استبعاد حركة هذا الشهر نفسها من الرصيد — وإلا
      // رُفض تعديل ٢٥ ← ٣٠ خطأً لأن الـ٢٥ القديمة ما زالت محسوبة ضمن المسدَّد.
      await debtService.assertDebtDeductionsValid(tx, { employeeId: existing.employeeId, calculationId: id, lines: debtLines });

      await tx.overtimeLine.deleteMany({ where: { calculationId: id } });
      await tx.compensationEarningLine.deleteMany({ where: { calculationId: id } });
      // حذف سطور الاستقطاع يُفرغ `deductionLineId` في حركات الدفتر (SET NULL) ولا
      // يحذفها — الحركة هويّتها (الحسبة، المديونية)، وتُعاد ربطها في المزامنة أدناه.
      await tx.compensationDeductionLine.deleteMany({ where: { calculationId: id } });

      const row = await tx.employeeCompensationCalculation.update({
        where: { id },
        data: {
          ...toTotals(result),
          notes: body.notes ?? null,
          overtimeLines: { create: children.overtimeLines },
          earningLines: { create: children.earningLines },
          deductionLines: { create: children.deductionLines },
        },
        include: CALCULATION_INCLUDE,
      });

      await syncDebtPayments(tx, row, debtLines, who);
      return row;
    });

    await recordAudit({
      req,
      action: 'UPDATE',
      module: AUDIT_MODULE,
      entityId: id,
      oldValue: { netAmount: existing.netAmount, status: existing.status },
      newValue: { netAmount: updated.netAmount, status: updated.status },
    });

    return { ...updated, warnings: result.warnings };
  },

  /**
   * الاعتماد — **حالة تنظيمية فقط**. لا يقفل السجل، ولا يمنع تعديلًا ولا حذفًا، ولا
   * يُنشئ أي أثر خارج هذا الجدول. إعادة اعتماد سجل معتمد مسموحة وتُحدّث الطابع الزمني.
   */
  async approve(id: number, req: Request) {
    const existing = await loadCalculation(id);

    // المتطلب ٢٨: لا تُعتمد حسبة فارغة — الاعتماد إقرار بمحتوى، لا بختم على ورقة بيضاء.
    const isEmpty =
      existing.overtimeLines.length === 0 &&
      existing.earningLines.length === 0 &&
      existing.deductionLines.length === 0;
    if (isEmpty) {
      throw AppError.badRequest('لا يمكن اعتماد حسبة بلا أي بند: أضف عملًا إضافيًا أو استحقاقًا أو استقطاعًا أولًا');
    }

    const who = actor(req);
    const updated = await prisma.employeeCompensationCalculation.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date(), approvedById: who.id, approvedByName: who.name },
      include: CALCULATION_INCLUDE,
    });

    await recordAudit({ req, action: 'APPROVE', module: AUDIT_MODULE, entityId: id, newValue: { netAmount: updated.netAmount } });
    return updated;
  },

  /**
   * حذف الحسبة بالكامل — **متاح حتى لو كانت معتمدة** (المتطلب ١٨).
   * الحذف يطال هذه الحسبة وسطورها وحدها (Cascade). لا يمسّ الموظف ولا أي وحدة أخرى.
   */
  async remove(id: number, req: Request) {
    const existing = await loadCalculation(id);
    await prisma.employeeCompensationCalculation.delete({ where: { id } });
    await recordAudit({
      req,
      action: 'DELETE',
      module: AUDIT_MODULE,
      entityId: id,
      oldValue: {
        employeeId: existing.employeeId,
        year: existing.year,
        month: existing.month,
        status: existing.status,
        netAmount: existing.netAmount,
      },
    });
    return { id, employeeId: existing.employeeId, year: existing.year, month: existing.month };
  },

  /**
   * نسخ بنود الشهر السابق (المتطلب ١٩).
   *
   * ينسخ **البنود** لا الهوية: سجل جديد بمعرّفات جديدة، حالته `DRAFT` دائمًا، ولقطته
   * تُؤخذ من ملف الموظف **الحالي** لا من الشهر المنسوخ — فالراتب المعتمد للشهر الجديد
   * هو راتب اليوم، وذلك ما تُظهره الاستجابة صراحةً في `copiedFrom`.
   */
  async copyPreviousMonth(employeeId: number, year: number, month: number, req: Request) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const source = await prisma.employeeCompensationCalculation.findUnique({
      where: { employeeId_year_month: { employeeId, year: prevYear, month: prevMonth } },
      include: CALCULATION_INCLUDE,
    });
    if (!source) throw AppError.notFound('لا توجد حسبة محفوظة للشهر السابق لنسخها');

    const body: CalculationBody = {
      overtime: source.overtimeLines.map((l) => ({
        overtimeType: l.overtimeType as OvertimeType,
        hours: l.hours,
        // الطريقة لا تُنسخ: الشهر الجديد ساعاته مدخلة، وأي مبلغ مستهدف قديم لا يخصّه.
        calculationMethod: 'MANUAL_HOURS' as const,
        reverseTargetAmount: null,
        rawHoursBeforeCeiling: null,
        notes: l.notes,
      })),
      earnings: source.earningLines.map((l) => ({
        type: l.type as never,
        label: l.label,
        amount: l.amount,
        // التاريخ لا يُنسخ: تاريخ بند من شهر مضى يضلّل في شهر جديد.
        entryDate: null,
        reason: l.reason,
        notes: l.notes,
        recurring: l.recurring,
      })),
      // سطور **سداد المديونيات لا تُنسخ** عمدًا: السداد حركة في دفتر مالي، لا بند
      // قالبٍ يتكرّر. نسخُه تلقائيًا كان يعني تحصيل قسط ثانٍ بضغطة زر — وقد يتجاوز
      // الرصيد المتبقي فيُفشل عملية النسخ كلها. المستخدم يضيفه صراحةً بعد أن يرى
      // الرصيد الحالي. عددُ ما أُسقط يُعاد في الاستجابة فلا يحدث ذلك بصمت.
      deductions: source.deductionLines
        .filter((l) => l.debtId == null)
        .map((l) => ({
          type: l.type as never,
          label: l.label,
          amount: l.amount,
          notes: l.notes,
        })),
      notes: source.notes,
    };

    const skippedDebtRepayments = source.deductionLines.filter((l) => l.debtId != null).length;
    const created = await this.create(employeeId, year, month, body, req);
    return {
      ...created,
      copiedFrom: {
        year: prevYear,
        month: prevMonth,
        basicSalarySnapshot: source.basicSalarySnapshot,
        /** لقطة راتب الشهر الجديد — قد تختلف عن المنسوخ منه، ويجب أن يراها المستخدم. */
        newBasicSalarySnapshot: created.basicSalarySnapshot,
        /** عدد سطور سداد المديونيات التي لم تُنسخ (انظر التعليل أعلاه). */
        skippedDebtRepayments,
      },
    };
  },

  /** معاينة حسبة بلا كتابة — نفس المحرّك، صفر أثر تخزيني. */
  preview(input: {
    basicSalary: number;
    hourlyRateOverride?: number | null;
    priorRegularOvertimeHoursThisYear?: number;
  } & CalculationBody) {
    return computeCompensation(
      toEngineInput(
        input,
        input.basicSalary,
        input.hourlyRateOverride ?? null,
        input.priorRegularOvertimeHoursThisYear ?? 0,
      ),
    );
  },

  /** الحسبة العكسية — أداة مساعدة، بلا أثر تخزيني. */
  reverseOvertime(input: {
    targetAmount: number;
    overtimeType: OvertimeType;
    basicSalary?: number;
    hourlyRate?: number;
  }) {
    const rate =
      input.hourlyRate && input.hourlyRate > 0
        ? input.hourlyRate
        : input.basicSalary
          ? computeHourlyRate(input.basicSalary)
          : null;
    if (!rate) throw AppError.badRequest('يلزم تمرير الراتب الأساسي أو أجر الساعة لتنفيذ الحسبة العكسية');
    return reverseOvertimeFromAmount({ targetAmount: input.targetAmount, overtimeType: input.overtimeType, hourlyRate: rate });
  },

  /**
   * بيانات **الكشف الرسمي المختصر** (المتطلبان ٢٠ و٢١).
   *
   * تُبنى من اللقطة، وتحوي البنود النهائية ومبالغها **فقط**. ما يلي غائب عمدًا ولا يجوز
   * إضافته: أجر الساعة، المعاملات القانونية، عدد الساعات لكل عملية، الحسبة العكسية،
   * المبلغ المستهدف، فرق التقريب، المراجع القانونية، أي بيانات تشخيص.
   *
   * سطور العمل الإضافي تُدمج **حسب النوع** في بند واحد لكل نوع: الكشف يعرض «عمل إضافي:
   * ١١ ساعة — XX.XXX د.ك»، وهو ما يقرؤه الموظف ويوقّع عليه.
   */
  async getStatementData(id: number) {
    const c = await loadCalculation(id);

    /**
     * الاسم الإنجليزي — **عرض فقط**، للكشف الثنائي اللغة.
     *
     * يُقرأ من ملف الموظف لا من اللقطة، لأن اللقطة لا تحمل حقلًا إنجليزيًا ولن
     * تحمله: إضافة عمود لقطة جديد تعني هجرة قاعدة بيانات لأجل سطر مطبوع. القراءة
     * وحدها (`findUnique`)، ولا يدخل هذا الحقل أي حساب ولا إجمالي ولا تدقيق —
     * فأرقام الكشف قبل هذه الإضافة وبعدها متطابقة. غيابه ⇒ `null`، ويعرض الكشف
     * الاسم العربي وحده بدل اختراع ترجمة.
     */
    const employeeRecord = await prisma.employee.findUnique({
      where: { id: c.employeeId },
      select: { fullNameEn: true },
    });

    const overtimeByType = new Map<string, { hours: number; amount: number }>();
    for (const l of c.overtimeLines) {
      const agg = overtimeByType.get(l.overtimeType) ?? { hours: 0, amount: 0 };
      agg.hours += l.hours;
      agg.amount += l.amount;
      overtimeByType.set(l.overtimeType, agg);
    }

    return {
      id: c.id,
      year: c.year,
      month: c.month,
      status: c.status,
      approvedAt: c.approvedAt,
      approvedByName: c.approvedByName,
      preparedByName: c.createdByName,
      employee: {
        code: c.employeeNumberSnapshot,
        fullName: c.employeeNameSnapshot,
        fullNameEn: employeeRecord?.fullNameEn ?? null,
        jobTitle: c.jobTitleSnapshot,
        department: c.departmentSnapshot,
        nationality: c.nationalitySnapshot,
        civilId: c.civilIdSnapshot,
      },
      basicSalary: c.basicSalarySnapshot,
      overtime: Array.from(overtimeByType.entries()).map(([overtimeType, agg]) => ({
        overtimeType,
        hours: Number(agg.hours.toFixed(3)),
        amount: Number(agg.amount.toFixed(3)),
      })),
      earnings: c.earningLines.map((l) => ({ label: l.label, type: l.type, amount: l.amount })),
      deductions: c.deductionLines.map((l) => ({ label: l.label, type: l.type, amount: l.amount })),
      totals: {
        totalOvertimeAmount: c.totalOvertimeAmount,
        totalOtherEarnings: c.totalOtherEarnings,
        grossEntitlements: c.grossEntitlements,
        totalDeductions: c.totalDeductions,
        netAmount: c.netAmount,
      },
      notes: c.notes,
    };
  },

  /**
   * بيانات **التقرير التفصيلي الداخلي** (المتطلب ٢٢).
   * هنا — وهنا وحدها — تظهر خطوات الحساب: أجر الساعة وقاعدة اشتقاقه، المعامل، المرجع
   * القانوني، طريقة الوصول إلى الساعات، المبلغ المستهدف، وفرق التقريب.
   */
  async getDetailedReportData(id: number) {
    const c = await loadCalculation(id);
    const result = await recomputeStored(c);

    return {
      id: c.id,
      year: c.year,
      month: c.month,
      status: c.status,
      approvedAt: c.approvedAt,
      approvedByName: c.approvedByName,
      preparedByName: c.createdByName,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      legalRulesVersion: c.legalRulesVersion,
      employee: {
        code: c.employeeNumberSnapshot,
        fullName: c.employeeNameSnapshot,
        jobTitle: c.jobTitleSnapshot,
        department: c.departmentSnapshot,
        nationality: c.nationalitySnapshot,
        civilId: c.civilIdSnapshot,
      },
      basicSalary: c.basicSalarySnapshot,
      hourlyRate: c.hourlyRateSnapshot,
      /**
       * أساس اشتقاق أجر الساعة — يُرسَل من المحرّك ولا يُكتب نصًّا في قالب الطباعة.
       * قالبٌ يكتب «÷ ٣٠ يومًا» بيده يصير كذبًا صامتًا في اليوم الذي يتغيّر فيه القاسم.
       */
      hourlyRateBasis: {
        daysDivisor: MONTHLY_WAGE_DAYS_DIVISOR,
        hoursPerDay: STANDARD_HOURS_PER_DAY,
        monthlyHours: MONTHLY_WORK_HOURS,
      },
      overtimeLines: c.overtimeLines.map((l) => ({
        overtimeType: l.overtimeType,
        hours: l.hours,
        hourlyRate: l.hourlyRate,
        multiplier: l.multiplier,
        amount: l.amount,
        calculationMethod: l.calculationMethod,
        reverseTargetAmount: l.reverseTargetAmount,
        rawHoursBeforeCeiling: l.rawHoursBeforeCeiling,
        roundingDifference:
          l.reverseTargetAmount != null ? Number((l.amount - l.reverseTargetAmount).toFixed(3)) : null,
        legalReference: l.legalReference,
        notes: l.notes,
      })),
      earnings: c.earningLines.map((l) => ({
        type: l.type,
        label: l.label,
        amount: l.amount,
        entryDate: l.entryDate,
        reason: l.reason,
        notes: l.notes,
        recurring: l.recurring,
      })),
      deductions: c.deductionLines.map((l) => ({ type: l.type, label: l.label, amount: l.amount, notes: l.notes })),
      /**
       * تفاصيل سداد المديونيات — **التقرير الداخلي وحده** (المتطلب ٢١).
       * الرصيد قبل السداد وبعده مُشتقّان من الدفتر لحظة القراءة، لا مخزَّنين.
       */
      debtRepayments: await debtService.repaymentBreakdownForCalculation(c.id),
      totals: {
        totalOvertimeAmount: c.totalOvertimeAmount,
        totalOtherEarnings: c.totalOtherEarnings,
        grossEntitlements: c.grossEntitlements,
        totalDeductions: c.totalDeductions,
        netAmount: c.netAmount,
      },
      warnings: result.warnings,
      notes: c.notes,
    };
  },
};
