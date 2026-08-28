import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { sortRowsInMemory, RowValueGetter } from '../../core/utils/sort';
import type { UnifiedPayrollRow } from './payrollMonth.readModel';

// القائمة البيضاء لفرز شبكة الرواتب الموحّدة (Enterprise Data Grid Foundation).
// «الاستقطاعات» تُعرض مجموعَ استقطاعات وسلف — الفرز على المجموع نفسه؛ الصفوف
// المستوردة (قيم null) تسقط آخرًا تلقائيًا بسياسة الفراغات.
const PAYROLL_ROW_SORTABLE: Record<string, RowValueGetter<UnifiedPayrollRow>> = {
  employee: (r) => r.employeeName,
  period: (r) => r.year * 100 + r.month,
  base: (r) => r.snapshotBaseSalary ?? r.baseSalary,
  gross: (r) => r.grossSalary,
  deductions: (r) => (r.totalDeductions === null && r.totalAdvances === null ? null : (r.totalDeductions ?? 0) + (r.totalAdvances ?? 0)),
  net: (r) => r.netSalary,
  status: (r) => r.status,
};
import { resolvePayrollPostingDate } from './payroll.accounting';
import { recordHistoricalEntry } from '../../shared/services/historicalEntry.service';
import { approvalEngine } from '../../shared/services/approval.service';
import {
  ManualPayrollLineInput,
  PayPayrollInput,
  PayrollAdvanceInput,
  PayrollPeriodInput,
  RecurringAllowanceInput,
  UpdatePayrollInput,
} from './payroll.schema';
import {
  WORK_HOURS_PER_DAY,
  OVERTIME_MULTIPLIER,
  round3,
  monthRange,
  inPeriod,
  computeRegularHours,
  PayrollLineDraft,
} from './payroll.calc';
import { payrollEligibilityWhere } from './payroll.eligibility';
import {
  buildUnifiedMonthRows,
  findPayrollEligibilityGap,
  resolveImportedRowsForMonth,
  toUnifiedComputed,
} from './payrollMonth.readModel';

type Tx = Prisma.TransactionClient;

type PayrollSnapshot = {
  employeeId: number;
  month: number;
  year: number;
  baseSalary: number;
  snapshotBaseSalary: number;
  regularWorkDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  lateDays: number;
  regularHours: number;
  actualHours: number;
  overtimeHours: number;
  overtimeRate: number;
  overtimeAmount: number;
  totalBonus: number;
  totalAllowances: number;
  totalDeductions: number;
  totalAdvances: number;
  grossSalary: number;
  netSalary: number;
  status: string;
  notes?: string;
  lines: PayrollLineDraft[];
};

export class PayrollService {
  async list(query: PaginationQuery & { month?: string; year?: string; status?: string; employeeId?: string }) {
    const pagination = getPagination(query);
    const month = query.month ? Number(query.month) : undefined;
    const year = query.year ? Number(query.year) : undefined;

    // Unified month read model: computed payroll + imported salary-transfer register.
    // Engaged only when a specific month AND year are selected (the Payroll grid always
    // sends both). Other callers (e.g. the employee financial tab) query without a period
    // and keep the computed-only path below, unchanged.
    if (month && year) {
      const employeeId = query.employeeId ? Number(query.employeeId) : undefined;
      const rows = await buildUnifiedMonthRows(month, year, { employeeId, status: query.status });
      // الشبكة الموحّدة تُبنى في الذاكرة (محسوب + مستورد) فالفرز هنا يمرّ عبر
      // sortRowsInMemory من الأساس نفسه — قبل اقتطاع الصفحة كي يشمل الشهر كاملًا.
      const sorted = sortRowsInMemory(rows, query, PAYROLL_ROW_SORTABLE);
      const pageRows = sorted.slice(pagination.skip, pagination.skip + pagination.take);
      return buildPaginatedResult(pageRows, sorted.length, pagination);
    }

    const where: Prisma.PayrollWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.employeeId) where.employeeId = Number(query.employeeId);

    const [data, total] = await Promise.all([
      prisma.payroll.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { id: 'desc' }],
        include: {
          employee: { select: { id: true, code: true, fullName: true, department: true } },
          lines: { orderBy: { id: 'asc' } },
        },
      }),
      prisma.payroll.count({ where }),
    ]);
    return buildPaginatedResult(data.map(toUnifiedComputed), total, pagination);
  }

  /**
   * Period KPI totals for the Salaries page. Aggregates across the COMPLETE filtered
   * dataset (not one page). CANCELLED payrolls never count toward gross/net/count in the
   * default view; when an explicit `status` filter is supplied the totals honour it (so a
   * deliberate CANCELLED filter still shows its own sums). `paid` is the PAID count within
   * the same period/employee scope. No mutation, no accounting — read-only.
   */
  async stats(query: { month?: string; year?: string; status?: string; employeeId?: string }) {
    const where: Prisma.PayrollWhereInput = {};
    if (query.month) where.month = Number(query.month);
    if (query.year) where.year = Number(query.year);
    if (query.employeeId) where.employeeId = Number(query.employeeId);
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = { not: 'CANCELLED' };
    }

    // «مدفوع» عدّادٌ داخل **نفس مجموعة الشاشة**، لا مجموعة مستقلة. النشر السابق
    // (`{ ...where, status: 'PAID' }`) كان يكتب فوق فلتر الحالة الذي اختاره المستخدم،
    // فيعرض عدد المدفوعة الكامل للفترة بينما بقية البطاقات تعرض المسوّدات وحدها.
    // مع فلتر حالة صريح: العدّاد جزء من المجموعة المفلترة — أي كلّها إن كان PAID،
    // وصفر لأي حالة أخرى (لا تقاطع بينها وبين PAID).
    const paidQuery = query.status
      ? (query.status === 'PAID'
          ? prisma.payroll.count({ where })
          : Promise.resolve(0))
      : prisma.payroll.count({ where: { ...where, status: 'PAID' } });

    const [agg, paid] = await Promise.all([
      prisma.payroll.aggregate({
        where,
        _sum: { grossSalary: true, netSalary: true },
        _count: { _all: true },
      }),
      paidQuery,
    ]);

    const computedCount = agg._count._all;
    const computedGross = round3(agg._sum.grossSalary ?? 0);
    const computedNet = round3(agg._sum.netSalary ?? 0);

    // Imported salary-transfer contribution — mirrors exactly what the grid shows,
    // so the KPI totals always match the visible rows. Only for a specific selected
    // month with no workflow-status filter (imported transfers have no such status).
    let importedCount = 0;
    let importedNet = 0;
    if (query.month && query.year && !query.status) {
      const employeeId = query.employeeId ? Number(query.employeeId) : undefined;
      const imported = await resolveImportedRowsForMonth(Number(query.month), Number(query.year), { employeeId });
      importedCount = imported.length;
      importedNet = round3(imported.reduce((sum, r) => sum + r.netSalary, 0));
    }

    // Eligibility gap — ACTIVE employees this period does not represent at all.
    // Deliberately computed WITHOUT `query.status`: a workflow-status filter changes
    // which rows are displayed, not who the period is missing. Honouring it here would
    // let a stale persisted filter (`sal:status`) suppress the very warning that tells
    // the operator someone is absent — the failure mode this pack exists to end.
    // Requires a concrete period; without one there is nothing to reconcile against.
    const gap = query.month && query.year
      ? await findPayrollEligibilityGap(Number(query.month), Number(query.year), {
          employeeId: query.employeeId ? Number(query.employeeId) : undefined,
        })
      : { missingPayrollCount: 0, missingPayrollEmployees: [], eligibleCount: 0, representedCount: 0 };

    return {
      count: computedCount + importedCount,
      // Gross is computed-only — imported transfers are net amounts with no gross.
      gross: computedGross,
      net: round3(computedNet + importedNet),
      // Imported transfers are completed disbursements → counted as paid.
      paid: paid + importedCount,
      importedCount,
      importedNet,
      grossIsPartial: importedCount > 0,
      missingPayrollCount: gap.missingPayrollCount,
      missingPayrollEmployees: gap.missingPayrollEmployees,
    };
  }

  async getById(id: number) {
    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, code: true, fullName: true, civilId: true, jobTitle: true, department: true } },
        lines: { orderBy: { id: 'asc' } },
      },
    });
    if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');
    return payroll;
  }

  private async buildSnapshots(input: PayrollPeriodInput): Promise<PayrollSnapshot[]> {
    const { start, end, days } = monthRange(input.month, input.year);
    // ── Who this run targets ────────────────────────────────────────────────────
    //
    // BULK (no employeeId): THE shared eligibility rule (payroll.eligibility) — the very
    // same predicate the gap detector reads. What generation creates and what detection
    // reports missing can never drift apart. Do not inline a copy of the rule here.
    //
    // SINGLE EMPLOYEE (employeeId given): a deliberate operator override that targets
    // exactly that person WITHOUT consulting the eligibility rule.
    //
    //   ON_LEAVE — APPROVED BY THE PRODUCT OWNER (Employee ↔ Payroll Eligibility &
    //   Status Transition Integrity v1). An on-leave employee stays excluded from bulk
    //   generation, yet may still have a payslip issued one-by-one: paid annual leave,
    //   and any case where the operator decides to disburse. This is intended
    //   behaviour, not a defect — do not "fix" it back to a status check.
    //
    //   TERMINATED — BLOCKED BY THE PRODUCT OWNER (same package). Ending service ends
    //   the right to a NEW payslip, so the override stops here: see the explicit guard
    //   below. It is deliberately a single named status, NOT `payrollEligibilityWhere`,
    //   because applying the bulk rule to this path would also block ON_LEAVE and
    //   silently revoke the exception granted right above it.
    //
    // The override is explicit, audited, and scoped to one named employee. It is never a
    // silent bulk inclusion, and it must not be widened to any other selector.
    const employeeWhere: Prisma.EmployeeWhereInput = input.employeeId
      ? { id: input.employeeId }
      : payrollEligibilityWhere(input.month, input.year);

    const employees = await prisma.employee.findMany({ where: employeeWhere, orderBy: { code: 'asc' } });
    if (input.employeeId && employees.length === 0) throw AppError.notFound('الموظف غير موجود');

    // TERMINATED closes the manual override — a Product Owner ruling, narrow on purpose.
    //
    // Scope: the SINGLE-EMPLOYEE path only (`input.employeeId`), and one status only.
    // ON_LEAVE is untouched and still generatable here; the bulk rule is untouched too.
    //
    // This refuses to CREATE, and creating is all it can refuse: the throw happens while
    // still building snapshots, before the transaction opens, so no row is read, written,
    // recalculated or deleted. Every existing payslip of a terminated employee —
    // historical, APPROVED, PAID — stays exactly as it is, and keeps rendering in the
    // grid and in reports. Ending service ends the right to a NEW payslip, nothing else.
    if (input.employeeId && employees[0].status === 'TERMINATED') {
      throw AppError.badRequest('لا يمكن إنشاء راتب لموظف منتهي الخدمة.');
    }

    if (employees.length === 0) return [];

    const employeeIds = employees.map((e) => e.id);
    const [attendance, bonuses, deductions, allowances, recurringDeductions, advances] = await Promise.all([
      prisma.attendance.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: start, lte: end } } }),
      prisma.bonus.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: start, lte: end } } }),
      prisma.deduction.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: start, lte: end } } }),
      prisma.employeeAllowance.findMany({ where: { employeeId: { in: employeeIds }, isActive: true } }),
      prisma.employeeRecurringDeduction.findMany({ where: { employeeId: { in: employeeIds }, isActive: true } }),
      prisma.payrollAdvance.findMany({ where: { employeeId: { in: employeeIds }, status: 'OPEN', remainingAmount: { gt: 0 } } }),
    ]);

    const byEmployee = <T extends { employeeId: number }>(rows: T[]) => {
      const map = new Map<number, T[]>();
      for (const row of rows) {
        const list = map.get(row.employeeId) ?? [];
        list.push(row);
        map.set(row.employeeId, list);
      }
      return map;
    };

    const attendanceByEmployee = byEmployee(attendance);
    const bonusByEmployee = byEmployee(bonuses);
    const deductionByEmployee = byEmployee(deductions);
    const allowanceByEmployee = byEmployee(allowances.filter((a) => inPeriod(a, start, end)));
    const recurringDeductionByEmployee = byEmployee(recurringDeductions.filter((d) => inPeriod(d, start, end)));
    const advanceByEmployee = byEmployee(advances);

    // ── منع خصم السلفة مرتين عبر مسيّرات مفتوحة (خطأ C3) ─────────────────────────
    // remainingAmount في جدول السلف لا يُخفَّض إلا عند الدفع (markPaid)، لذا مسيّر DRAFT/APPROVED
    // غير مدفوع يكون قد "حجز" جزءًا من السلفة في سطوره دون أن ينعكس على remainingAmount.
    // نحسب المبلغ المحجوز فعليًا في المسيّرات المفتوحة الأخرى (باستثناء الفترة الحالية التي
    // يُعاد توليدها) ونطرحه من remainingAmount للحصول على الرصيد الفعّال القابل للخصم.
    const advanceIds = advances.map((a) => a.id);
    const openAdvanceLines = advanceIds.length
      ? await prisma.payrollLine.findMany({
          where: {
            sourceType: 'ADVANCE',
            sourceId: { in: advanceIds },
            payroll: {
              status: { in: ['DRAFT', 'APPROVED'] },
              NOT: { month: input.month, year: input.year },
            },
          },
          select: { sourceId: true, amount: true },
        })
      : [];
    const committedByAdvance = new Map<number, number>();
    for (const line of openAdvanceLines) {
      if (line.sourceId == null) continue;
      committedByAdvance.set(line.sourceId, round3((committedByAdvance.get(line.sourceId) ?? 0) + Math.abs(line.amount)));
    }

    return employees.map((employee) => {
      const lines: PayrollLineDraft[] = [];
      const baseSalary = round3(employee.salary);
      lines.push({ employeeId: employee.id, type: 'BASE', sourceType: 'EMPLOYEE', sourceId: employee.id, label: 'Base salary', amount: baseSalary });

      const empAttendance = attendanceByEmployee.get(employee.id) ?? [];
      const presentDays = empAttendance.filter((a) => a.status === 'PRESENT').length;
      const absentDays = empAttendance.filter((a) => a.status === 'ABSENT').length;
      const leaveDays = empAttendance.filter((a) => a.status === 'LEAVE').length;
      const lateDays = empAttendance.filter((a) => a.status === 'LATE').length;
      const actualHours = round3(empAttendance.reduce((sum, a) => sum + Number(a.workHours ?? 0), 0));
      const regularHours = computeRegularHours(presentDays, lateDays);
      const overtimeHours = round3(Math.max(0, actualHours - regularHours));
      const hourlyRate = days > 0 ? baseSalary / days / WORK_HOURS_PER_DAY : 0;
      const overtimeRate = round3(hourlyRate * OVERTIME_MULTIPLIER);
      const overtimeAmount = round3(overtimeHours * overtimeRate);
      if (overtimeAmount > 0) {
        lines.push({
          employeeId: employee.id,
          type: 'OVERTIME',
          sourceType: 'ATTENDANCE',
          label: 'Overtime',
          amount: overtimeAmount,
          quantity: overtimeHours,
          rate: overtimeRate,
        });
      }

      const absenceDeduction = round3((baseSalary / days) * absentDays);
      if (absenceDeduction > 0) {
        lines.push({
          employeeId: employee.id,
          type: 'ATTENDANCE',
          sourceType: 'ATTENDANCE',
          label: 'Absence deduction',
          amount: -absenceDeduction,
          quantity: absentDays,
          rate: round3(baseSalary / days),
        });
      }

      for (const allowance of allowanceByEmployee.get(employee.id) ?? []) {
        lines.push({
          employeeId: employee.id,
          type: 'ALLOWANCE',
          sourceType: 'RECURRING_ALLOWANCE',
          sourceId: allowance.id,
          label: allowance.name,
          amount: round3(allowance.amount),
          notes: allowance.notes ?? undefined,
        });
      }
      for (const bonus of bonusByEmployee.get(employee.id) ?? []) {
        lines.push({
          employeeId: employee.id,
          type: 'ALLOWANCE',
          sourceType: 'BONUS',
          sourceId: bonus.id,
          label: bonus.reason || 'Bonus',
          amount: round3(bonus.amount),
        });
      }
      for (const deduction of recurringDeductionByEmployee.get(employee.id) ?? []) {
        lines.push({
          employeeId: employee.id,
          type: 'DEDUCTION',
          sourceType: 'RECURRING_DEDUCTION',
          sourceId: deduction.id,
          label: deduction.name,
          amount: -round3(deduction.amount),
          notes: deduction.notes ?? undefined,
        });
      }
      for (const deduction of deductionByEmployee.get(employee.id) ?? []) {
        lines.push({
          employeeId: employee.id,
          type: 'DEDUCTION',
          sourceType: 'DEDUCTION',
          sourceId: deduction.id,
          label: deduction.reason || 'Deduction',
          amount: -round3(deduction.amount),
        });
      }

      let grossBeforeAdvances = round3(lines.reduce((sum, line) => sum + line.amount, 0));
      for (const advance of advanceByEmployee.get(employee.id) ?? []) {
        if (grossBeforeAdvances <= 0) break;
        // الرصيد الفعّال = المتبقي المسجَّل ناقص ما حُجز في مسيّرات مفتوحة أخرى (خطأ C3).
        const committed = committedByAdvance.get(advance.id) ?? 0;
        const effectiveRemaining = round3(Math.max(0, advance.remainingAmount - committed));
        if (effectiveRemaining <= 0) continue;
        const applied = round3(Math.min(effectiveRemaining, grossBeforeAdvances));
        if (applied <= 0) continue;
        lines.push({
          employeeId: employee.id,
          type: 'ADVANCE',
          sourceType: 'ADVANCE',
          sourceId: advance.id,
          label: 'Advance deduction',
          amount: -applied,
        });
        grossBeforeAdvances = round3(grossBeforeAdvances - applied);
      }

      const totalAllowances = round3(lines.filter((l) => l.type === 'ALLOWANCE').reduce((s, l) => s + l.amount, 0));
      const totalBonus = totalAllowances;
      const totalDeductions = round3(Math.abs(lines.filter((l) => l.type === 'DEDUCTION' || l.type === 'ATTENDANCE').reduce((s, l) => s + Math.min(0, l.amount), 0)));
      const totalAdvances = round3(Math.abs(lines.filter((l) => l.type === 'ADVANCE').reduce((s, l) => s + Math.min(0, l.amount), 0)));
      const grossSalary = round3(baseSalary + totalAllowances + overtimeAmount);
      const netSalary = round3(lines.reduce((sum, line) => sum + line.amount, 0));

      return {
        employeeId: employee.id,
        month: input.month,
        year: input.year,
        baseSalary,
        snapshotBaseSalary: baseSalary,
        regularWorkDays: days,
        presentDays,
        absentDays,
        leaveDays,
        lateDays,
        regularHours,
        actualHours,
        overtimeHours,
        overtimeRate,
        overtimeAmount,
        totalBonus,
        totalAllowances,
        totalDeductions,
        totalAdvances,
        grossSalary,
        netSalary,
        status: 'DRAFT',
        notes: input.notes,
        lines,
      };
    });
  }

  async preview(input: PayrollPeriodInput) {
    const items = await this.buildSnapshots(input);
    return { generated: items.length, items };
  }

  /**
   * Materialize payroll for a period — INCREMENTALLY.
   *
   * The lock used to be month-wide: one APPROVED payslip anywhere in the period aborted
   * the whole transaction, so an employee who became eligible after the month was
   * generated could not be added without first un-approving everyone else. That made the
   * only recovery path for a returning employee (re-generate) unusable in practice.
   *
   * Now the lock is per-employee. Each targeted employee is classified independently:
   *
   *   • no row yet          → CREATE  (this is how a returning ACTIVE employee reappears)
   *   • existing DRAFT      → UPDATE  (unchanged recalculation semantics)
   *   • APPROVED/PAID/other → SKIP    (never modified, never deleted, never recreated)
   *
   * Non-DRAFT rows are financially settled records: they are not read, not rewritten, and
   * their lines are not touched. `@@unique([employeeId, month, year])` plus `upsert` keep
   * this idempotent — re-running can never duplicate a row.
   *
   * If there is genuinely nothing to write and something WAS locked, the original error is
   * still raised: a deliberate re-generate of a fully-approved month is an operator mistake
   * worth reporting, not a silent no-op.
   */
  async generate(input: PayrollPeriodInput, req: Request) {
    const snapshots = await this.buildSnapshots(input);
    const result = await prisma.$transaction(async (tx) => {
      const employeeIds = snapshots.map((s) => s.employeeId);
      const existing = await tx.payroll.findMany({
        where: { employeeId: { in: employeeIds }, month: input.month, year: input.year },
        select: { employeeId: true, status: true },
      });
      const lockedEmployeeIds = new Set(existing.filter((p) => p.status !== 'DRAFT').map((p) => p.employeeId));
      const draftEmployeeIds = new Set(existing.filter((p) => p.status === 'DRAFT').map((p) => p.employeeId));

      const writable = snapshots.filter((s) => !lockedEmployeeIds.has(s.employeeId));
      const skippedLocked = snapshots.length - writable.length;
      if (writable.length === 0 && skippedLocked > 0) {
        throw AppError.badRequest('لا يمكن إعادة توليد كشف راتب معتمد أو مدفوع');
      }

      let created = 0;
      let updated = 0;
      const items = [];
      for (const snapshot of writable) {
        if (draftEmployeeIds.has(snapshot.employeeId)) updated += 1;
        else created += 1;
        const payrollData = {
          baseSalary: snapshot.baseSalary,
          snapshotBaseSalary: snapshot.snapshotBaseSalary,
          regularWorkDays: snapshot.regularWorkDays,
          presentDays: snapshot.presentDays,
          absentDays: snapshot.absentDays,
          leaveDays: snapshot.leaveDays,
          lateDays: snapshot.lateDays,
          regularHours: snapshot.regularHours,
          actualHours: snapshot.actualHours,
          overtimeHours: snapshot.overtimeHours,
          overtimeRate: snapshot.overtimeRate,
          overtimeAmount: snapshot.overtimeAmount,
          totalBonus: snapshot.totalBonus,
          totalAllowances: snapshot.totalAllowances,
          totalDeduction: snapshot.totalDeductions,
          totalDeductions: snapshot.totalDeductions,
          totalAdvances: snapshot.totalAdvances,
          grossSalary: snapshot.grossSalary,
          netSalary: snapshot.netSalary,
          status: 'DRAFT' as const,
          notes: snapshot.notes,
        };
        const payroll = await tx.payroll.upsert({
          where: { employeeId_month_year: { employeeId: snapshot.employeeId, month: snapshot.month, year: snapshot.year } },
          update: payrollData,
          create: { employeeId: snapshot.employeeId, month: snapshot.month, year: snapshot.year, ...payrollData },
        });
        await tx.payrollLine.deleteMany({ where: { payrollId: payroll.id } });
        await tx.payrollLine.createMany({
          data: snapshot.lines.map((line) => ({ ...line, payrollId: payroll.id })),
        });
        items.push(payroll);
      }
      return { items, created, updated, skippedLocked };
    });

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'payroll',
      newValue: {
        month: input.month,
        year: input.year,
        count: result.items.length,
        created: result.created,
        updated: result.updated,
        skippedLocked: result.skippedLocked,
      },
    });
    // `generated` is preserved as the count of rows actually written (created + updated)
    // so the existing client contract keeps working; the breakdown is additive.
    return {
      generated: result.items.length,
      created: result.created,
      updated: result.updated,
      skippedLocked: result.skippedLocked,
      items: result.items,
    };
  }

  async update(id: number, input: UpdatePayrollInput, req: Request) {
    const updated = await prisma.$transaction(async (tx) => {
      const payroll = await tx.payroll.findUnique({ where: { id } });
      if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');
      if (payroll.status !== 'DRAFT') throw AppError.badRequest('يمكن تعديل كشوف الرواتب في حالة المسودة فقط');
      return tx.payroll.update({ where: { id }, data: { notes: input.notes } });
    });
    await recordAudit({ req, action: 'UPDATE', module: 'payroll', entityId: id, newValue: input });
    return updated;
  }

  async addManualLine(id: number, input: ManualPayrollLineInput, req: Request) {
    const updated = await prisma.$transaction(async (tx) => {
      const payroll = await tx.payroll.findUnique({ where: { id }, include: { lines: true } });
      if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');
      if (payroll.status !== 'DRAFT') throw AppError.badRequest('يمكن تعديل بنود كشف الراتب في حالة المسودة فقط');
      await tx.payrollLine.create({
        data: {
          payrollId: id,
          employeeId: payroll.employeeId,
          type: input.type,
          sourceType: 'MANUAL',
          label: input.label,
          amount: input.type === 'DEDUCTION' ? -round3(input.amount) : round3(input.amount),
          notes: input.notes,
        },
      });
      return this.recalculatePayrollTotals(tx, id);
    });
    await recordAudit({ req, action: 'UPDATE', module: 'payroll', entityId: id, newValue: input });
    return updated;
  }

  private async recalculatePayrollTotals(tx: Tx, payrollId: number) {
    const payroll = await tx.payroll.findUnique({ where: { id: payrollId }, include: { lines: true } });
    if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');
    const totalAllowances = round3(payroll.lines.filter((l) => l.type === 'ALLOWANCE').reduce((s, l) => s + l.amount, 0));
    const overtimeAmount = round3(payroll.lines.filter((l) => l.type === 'OVERTIME').reduce((s, l) => s + l.amount, 0));
    const totalDeductions = round3(Math.abs(payroll.lines.filter((l) => l.type === 'DEDUCTION' || l.type === 'ATTENDANCE').reduce((s, l) => s + Math.min(0, l.amount), 0)));
    const totalAdvances = round3(Math.abs(payroll.lines.filter((l) => l.type === 'ADVANCE').reduce((s, l) => s + Math.min(0, l.amount), 0)));
    const grossSalary = round3(payroll.snapshotBaseSalary + totalAllowances + overtimeAmount);
    const netSalary = round3(payroll.lines.reduce((sum, line) => sum + line.amount, 0));
    return tx.payroll.update({
      where: { id: payrollId },
      data: {
        totalBonus: totalAllowances,
        totalAllowances,
        totalDeduction: totalDeductions,
        totalDeductions,
        totalAdvances,
        overtimeAmount,
        grossSalary,
        netSalary,
      },
    });
  }

  async approve(id: number, req: Request) {
    const userId = req.user?.userId;
    const updated = await prisma.$transaction(async (tx) => {
      const payroll = await tx.payroll.findUnique({ where: { id } });
      if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');
      if (payroll.status === 'APPROVED') throw AppError.badRequest('الكشف معتمد بالفعل');
      if (payroll.status === 'PAID') throw AppError.badRequest('الكشف مدفوع بالفعل');
      if (payroll.status === 'CANCELLED') throw AppError.badRequest('لا يمكن اعتماد كشف ملغى');
      const approved = await tx.payroll.update({
        where: { id },
        data: { status: 'APPROVED', approvedAt: new Date(), approvedById: userId },
      });
      // سجلّ الاعتماد — تسجيل فقط، على نفس المعاملة. لا ترحيل هنا (الترحيل عند الصرف).
      await approvalEngine.recordTransition(
        {
          entityType: 'payroll',
          entityId:   id,
          action:     'approve',
          fromStatus: payroll.status,
          toStatus:   'APPROVED',
          userId:     userId ?? null,
        },
        tx,
      );
      return approved;
    });
    await recordAudit({ req, action: 'APPROVE', module: 'payroll', entityId: id });
    return updated;
  }

  /** إلغاء اعتماد: يعيد كشفًا معتمَدًا إلى المسودة ليُعدَّل ويُعاد اعتماده. لا ترحيل
   *  محاسبي لعكسه — الاعتماد نفسه لا يُنشئ أي قيد (الترحيل الوحيد يقع عند الصرف). */
  async unapprove(id: number, req: Request) {
    const updated = await prisma.$transaction(async (tx) => {
      const payroll = await tx.payroll.findUnique({ where: { id } });
      if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');
      if (payroll.status === 'DRAFT') throw AppError.badRequest('الكشف في حالة المسودة بالفعل');
      if (payroll.status === 'PAID') throw AppError.badRequest('لا يمكن إلغاء اعتماد كشف مدفوع بالفعل');
      if (payroll.status === 'CANCELLED') throw AppError.badRequest('لا يمكن إلغاء اعتماد كشف ملغى');
      const reverted = await tx.payroll.update({
        where: { id },
        data: { status: 'DRAFT', approvedAt: null, approvedById: null },
      });
      await approvalEngine.recordTransition(
        {
          entityType: 'payroll',
          entityId:   id,
          action:     'reopen',
          fromStatus: payroll.status,
          toStatus:   'DRAFT',
          userId:     req.user?.userId ?? null,
        },
        tx,
      );
      return reverted;
    });
    await recordAudit({ req, action: 'UNAPPROVE', module: 'payroll', entityId: id });
    return updated;
  }

  async cancel(id: number, req: Request) {
    const updated = await prisma.$transaction(async (tx) => {
      const payroll = await tx.payroll.findUnique({ where: { id } });
      if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');
      if (payroll.status === 'PAID') throw AppError.badRequest('لا يمكن إلغاء كشف راتب مدفوع');
      if (!['DRAFT', 'APPROVED'].includes(payroll.status)) throw AppError.badRequest('لا يمكن إلغاء هذا الكشف');
      return tx.payroll.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
    await recordAudit({ req, action: 'CANCEL', module: 'payroll', entityId: id });
    return updated;
  }

  async markPaid(id: number, input: PayPayrollInput, req: Request) {
    const userId = req.user?.userId;
    const updated = await prisma.$transaction(async (tx) => {
      const payroll = await tx.payroll.findUnique({
        where: { id },
        include: { employee: { select: { fullName: true } }, lines: true },
      });
      if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');
      if (payroll.status !== 'APPROVED') throw AppError.badRequest('يجب اعتماد كشف الراتب قبل الصرف');
      if (payroll.accountingTransactionId) throw AppError.badRequest('تم ترحيل القيد المحاسبي لهذا الكشف مسبقا');

      for (const line of payroll.lines.filter((l) => l.type === 'ADVANCE' && l.sourceType === 'ADVANCE' && l.sourceId)) {
        const advance = await tx.payrollAdvance.findUnique({ where: { id: line.sourceId! } });
        if (!advance || advance.status !== 'OPEN') continue;
        const remainingAmount = round3(Math.max(0, advance.remainingAmount - Math.abs(line.amount)));
        await tx.payrollAdvance.update({
          where: { id: advance.id },
          data: { remainingAmount, status: remainingAmount <= 0 ? 'SETTLED' : 'OPEN' },
        });
      }

      const paidRecord = await tx.payroll.update({
        where: { id },
        data: {
          status: 'PAID',
          // ثلاثة تواريخ مختلفة عمدًا، ولا يجوز خلطها:
          //   paidAt              → متى صُرف الراتب فعلًا (تاريخ العملية).
          //   postingDate         → أي فترة محاسبية يخصّها (آخر يوم في شهر الراتب).
          //   accountingPostedAt  → متى أُدخل السجل في النظام (طابع تدقيق).
          paidAt: input.paymentDate ?? new Date(),
          paidById: userId,
          paymentMethod: input.paymentMethod,
          accountingPostedAt: new Date(),
        },
      });

      // قرار العمل النهائي: الرواتب وحدة تشغيلية فقط ولا تُنشئ أي قيد محاسبي إطلاقًا.
      // أُزيل ترحيل الأستاذ العام (postPayrollToGL — referenceType=PAYROLL) وربط
      // accountingTransactionId. مصروف الرواتب يُسجَّل يدويًا عبر وحدة المصروفات وحدها.

      // سجلّ الاعتماد — الصرف هو الانتقال الأخير في آلة الحالات. تسجيل فقط.
      await approvalEngine.recordTransition(
        {
          entityType: 'payroll',
          entityId:   id,
          action:     'pay',
          fromStatus: 'APPROVED',
          toStatus:   'PAID',
          userId:     userId ?? null,
          metadata:   { net: paidRecord.netSalary, paymentMethod: input.paymentMethod },
        },
        tx,
      );

      return paidRecord;
    });
    await recordAudit({ req, action: 'PAYMENT', module: 'payroll', entityId: id, newValue: { net: updated.netSalary } });
    await recordHistoricalEntry({
      req,
      module: 'payroll',
      recordType: 'كشف راتب',
      entityId: id,
      documentNumber: `${updated.month}/${updated.year}`,
      // التاريخ المحاسبي، لا وقت الإدخال — هو ما يحدّد أن السجل «تاريخي».
      transactionDate: resolvePayrollPostingDate(updated, input.paymentDate),
      lateEntryReason: input.lateEntryReason,
    });
    return updated;
  }

  async createAllowance(input: RecurringAllowanceInput, req: Request) {
    const item = await prisma.employeeAllowance.create({ data: input });
    await recordAudit({ req, action: 'CREATE', module: 'payroll', entityId: item.id, newValue: input });
    return item;
  }

  async createRecurringDeduction(input: RecurringAllowanceInput, req: Request) {
    const item = await prisma.employeeRecurringDeduction.create({ data: input });
    await recordAudit({ req, action: 'CREATE', module: 'payroll', entityId: item.id, newValue: input });
    return item;
  }

  async createAdvance(input: PayrollAdvanceInput, req: Request) {
    const amount = round3(input.amount);
    const item = await prisma.payrollAdvance.create({
      data: { ...input, amount, remainingAmount: amount, date: input.date ?? new Date() },
    });
    await recordAudit({ req, action: 'CREATE', module: 'payroll', entityId: item.id, newValue: input });
    return item;
  }

  async payslip(id: number) {
    return this.getById(id);
  }
}

export const payrollService = new PayrollService();
