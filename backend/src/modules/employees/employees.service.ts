import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { BaseRepository } from '../../shared/repositories/BaseRepository';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { buildOrderBy, sortRowsInMemory, SortWhitelist, RowValueGetter } from '../../core/utils/sort';
import {
  AdjustmentInput,
  AttendanceInput,
  CreateEmployeeInput,
  CreateLeaveSettlementInput,
  LeaveInput,
  UpdateAttendanceInput,
  UpdateEmployeeInput,
} from './employees.schema';
import { buildDocumentAlerts } from './employees.alertBuilder';
import { aggregateAttendanceStats, AttendanceFilters, buildAttendanceWhere } from './attendance.filters';
import { entitlementsService } from '../employee-entitlements/entitlements.service';
import { RecordEntitlementPaymentInput, UpdateEntitlementPaymentInput } from '../employee-entitlements/entitlements.schema';
import { finalSettlementService } from '../employee-entitlements/finalSettlement.service';
import {
  CancelFinalSettlementInput,
  RecordSettlementPaymentInput,
  UpsertFinalSettlementInput,
} from '../employee-entitlements/finalSettlement.schema';

class EmployeesRepository extends BaseRepository<{ id: number }> {
  protected readonly model = 'employee';
  findFull(id: number) {
    return prisma.employee.findUnique({
      where: { id },
      include: {
        _count: { select: { attendance: true, leaves: true, payrolls: true } },
        deductions: { orderBy: { date: 'desc' }, take: 10 },
        bonuses: { orderBy: { date: 'desc' }, take: 10 },
      },
    });
  }
}
const repo = new EmployeesRepository();

// القائمة البيضاء للفرز — المفاتيح مطابقة لمفاتيح أعمدة الواجهة (modules.tsx).
// تواريخ الوثائق كلها اختيارية → nulls: 'last' كي لا تتصدّر الخلايا الفارغة.
//
// «code» (الرقم الوظيفي) غائب عمدًا: إنه سلسلة أرقام، وفرز TEXT في SQLite معجميّ
// (1, 10, 11, 2). فيُفرز عدديًا في الذاكرة عبر المسار المخصّص أدناه (CODE_SORTABLE)
// — مصدر واحد لفرز هذا العمود، لا فرز قاعدة بيانات معجميّ موازٍ.
const SORTABLE: SortWhitelist = {
  fullName: 'fullName',
  fullNameEn: { field: 'fullNameEn', nullable: true },
  civilId: { field: 'civilId', nullable: true },
  jobTitle: { field: 'jobTitle', nullable: true },
  nationality: { field: 'nationality', nullable: true },
  salary: 'salary',
  status: 'status',
  hireDate: { field: 'hireDate', nullable: true },
  residencyExpiry: { field: 'residencyExpiry', nullable: true },
  passportExpiry: { field: 'passportExpiry', nullable: true },
  licenseExpiry: { field: 'licenseExpiry', nullable: true },
  vehicleLicenseExpiry: { field: 'vehicleLicenseExpiry', nullable: true },
};
const DEFAULT_ORDER = [{ id: 'desc' as const }];

// فرز الرقم الوظيفي عدديًا (المقارن العددي الموحّد numeric:true يرتّب «1 < 2 < 10»).
// نفس نمط شبكة الرواتب: يُفرز فوق المجموعة الكاملة **قبل** اقتطاع الصفحة، وإلا رتّب
// فرزُ الصفحة الواحدة 15 صفًا فقط فأضلّل. لا منطق فرز مكرّر — يُعاد استخدام sortRowsInMemory.
const CODE_SORTABLE: Record<string, RowValueGetter<{ code: string }>> = {
  code: (e) => e.code,
};

// القائمة البيضاء لجدول الحضور — «الموظف» عمود علاقة (فرز على الاسم الكامل).
const ATTENDANCE_SORTABLE: SortWhitelist = {
  employee: (dir) => ({ employee: { fullName: dir } }),
  date: 'date',
  checkIn: { field: 'checkIn', nullable: true },
  checkOut: { field: 'checkOut', nullable: true },
  workHours: { field: 'workHours', nullable: true },
  status: 'status',
};
const ATTENDANCE_DEFAULT_ORDER = [{ date: 'desc' as const }];

function diffHours(checkIn?: Date, checkOut?: Date): number | null {
  if (!checkIn || !checkOut) return null;
  const h = (checkOut.getTime() - checkIn.getTime()) / 36e5;
  return Math.max(0, Math.round(h * 100) / 100);
}

function diffDays(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 864e5) + 1);
}

export class EmployeesService {
  // ===== الموظفون =====
  async list(query: PaginationQuery & { department?: string; status?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.EmployeeWhereInput = {};
    if (query.department) where.department = query.department;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search } },
        { fullNameEn: { contains: query.search } },
        { code: { contains: query.search } },
        { civilId: { contains: query.search } },
        { passportNumber: { contains: query.search } },
        { jobTitle: { contains: query.search } },
      ];
    }
    // الرقم الوظيفي وحده يُفرز عدديًا في الذاكرة (SQLite يرتّب TEXT معجميًا): نجلب
    // المجموعة الكاملة المطابقة للفلاتر، نفرزها بالمقارن العددي، ثم نقتطع الصفحة.
    // بقية الأعمدة تبقى على فرز قاعدة البيانات كما هي تمامًا.
    if (query.sortBy === 'code') {
      const { data, total } = await repo.findMany({ where });
      const rows = data as Array<{ id: number; code: string }>;
      const sorted = sortRowsInMemory(rows, query, CODE_SORTABLE);
      const pageRows = sorted.slice(pagination.skip, pagination.skip + pagination.take);
      return buildPaginatedResult(pageRows, total, pagination);
    }

    const orderBy = buildOrderBy(query, SORTABLE, DEFAULT_ORDER);
    const { data, total } = await repo.findMany({ where, pagination, orderBy });
    return buildPaginatedResult(data, total, pagination);
  }

  /**
   * المستندات الرسمية التي تنتهي خلال عدد أيام (افتراضيًا 30) أو منتهية:
   * الإقامة + جواز السفر + رخصة القيادة. للتنبيه في الواجهة.
   * ملاحظة: رخصة المركبة (vehicleLicenseExpiry) مُستثناة عمدًا —
   * انتهاء تسجيل المركبة يُتابَع من وحدة المعدات (equipment.registrationExpiry).
   */
  async expiringDocuments(days = 30) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    const employees = await prisma.employee.findMany({
      where: {
        status: { not: 'TERMINATED' },
        OR: [
          { residencyExpiry: { not: null, lte: until } },
          { passportExpiry: { not: null, lte: until } },
          { licenseExpiry: { not: null, lte: until } },
        ],
      },
      select: {
        id: true,
        code: true,
        fullName: true,
        fullNameEn: true,
        residencyExpiry: true,
        passportExpiry: true,
        licenseExpiry: true,
      },
    });

    return employees.map((e) => ({
      id: e.id,
      code: e.code,
      fullName: e.fullName,
      fullNameEn: e.fullNameEn,
      alerts: buildDocumentAlerts(e, days),
    }));
  }

  async getById(id: number) {
    const employee = await repo.findFull(id);
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    return employee;
  }

  // ===== مستحقات الموظف — تفويض كامل لنطاق الاستحقاقات المستقل =====
  //
  // كل منطق الاحتساب وقواعد الدفع يعيش في وحدة واحدة
  // (modules/employee-entitlements/entitlements.service.ts) فوق محرّك احتساب وحيد
  // (employees/entitlements.calc.ts). هذه الطبقة تُبقي مسارات الـAPI القائمة كما هي فقط،
  // ولا تحتوي أي حقيقة استحقاق خاصة بها — فلا يمكن أن ينشأ مصدر حقيقة ثانٍ.

  /** كشف «تفاصيل مستحقات الموظف» عند تاريخ احتساب صريح (أو اليوم افتراضيًا). */
  async getEntitlements(id: number, asOf?: Date) {
    return entitlementsService.getStatement(id, asOf);
  }

  /** حركات دفع المستحقات المسجَّلة للموظف (وقائع تاريخية). */
  async listEntitlementPayments(employeeId: number) {
    return entitlementsService.listPayments(employeeId);
  }

  /** تسجيل دفعة مستحق فعلية — التحقق والاشتقاق كلّه في نطاق الاستحقاقات. */
  async recordEntitlementPayment(employeeId: number, input: RecordEntitlementPaymentInput, req: Request) {
    return entitlementsService.recordPayment(employeeId, input, req);
  }

  /** تصحيح دفعة مسجَّلة (المبلغ/التاريخ/الطريقة/المرجع/الملاحظة فقط). */
  async updateEntitlementPayment(employeeId: number, paymentId: number, input: UpdateEntitlementPaymentInput, req: Request) {
    return entitlementsService.updatePayment(employeeId, paymentId, input, req);
  }

  /** حذف دفعة مسجَّلة — الإجماليات تُعاد اشتقاقها تلقائيًا. */
  async deleteEntitlementPayment(employeeId: number, paymentId: number, req: Request) {
    return entitlementsService.deletePayment(employeeId, paymentId, req);
  }

  // ===== التصفية النهائية — تفويض كامل لنطاق الاستحقاقات =====
  async createFinalSettlement(employeeId: number, input: UpsertFinalSettlementInput, req: Request) {
    return finalSettlementService.createDraft(employeeId, input, req);
  }
  async updateFinalSettlement(employeeId: number, input: UpsertFinalSettlementInput, req: Request) {
    return finalSettlementService.updateDraft(employeeId, input, req);
  }
  async approveFinalSettlement(employeeId: number, req: Request) {
    return finalSettlementService.approve(employeeId, req);
  }
  async recordFinalSettlementPayment(employeeId: number, input: RecordSettlementPaymentInput, req: Request) {
    return finalSettlementService.recordPayment(employeeId, input, req);
  }
  async updateFinalSettlementPayment(employeeId: number, paymentId: number, input: RecordSettlementPaymentInput, req: Request) {
    return finalSettlementService.updatePayment(employeeId, paymentId, input, req);
  }
  async deleteFinalSettlementPayment(employeeId: number, paymentId: number, req: Request) {
    return finalSettlementService.deletePayment(employeeId, paymentId, req);
  }
  async cancelFinalSettlement(employeeId: number, input: CancelFinalSettlementInput, req: Request) {
    return finalSettlementService.cancel(employeeId, input, req);
  }
  async deleteFinalSettlementDraft(employeeId: number, req: Request) {
    return finalSettlementService.deleteDraft(employeeId, req);
  }

  // ===== دفعات مقدَّمة على رصيد الإجازة (LeaveSettlement — تسجيل يدوي/تاريخي فقط) =====
  //
  // إعادة تصميم قانوني (المادتان 73/74): لا يجوز للعامل التنازل عن إجازته السنوية
  // بمقابل أو بدونه (المادة 74)، والصرف النقدي لرصيد الإجازة يكون فقط عند انتهاء العقد
  // (المادة 73). لذلك لم يعد هذا السجل يُنشئ أو يُزيح أي «خط أساس» لاحتساب رصيد الإجازة
  // — رصيد الإجازة يتراكم دومًا من تاريخ التعيين بلا انقطاع (انظر entitlements.calc.ts).
  // هذا السجل الآن توثيق تاريخي لدفعة مقدَّمة (Advance) فقط، ولا يُسقط ولا يُنقص الاستحقاق
  // القانوني المحتسَب. البيانات التاريخية المُدخلة سابقًا محفوظة كما هي دون أي تعديل أو
  // حذف — هذا تغيير في طريقة الاستخدام الحسابي فقط، وليس ترحيلاً للبيانات.
  async listLeaveSettlements(employeeId: number) {
    return prisma.leaveSettlement.findMany({
      where: { employeeId },
      orderBy: { settlementDate: 'desc' },
    });
  }

  /**
   * يسجّل دفعة مقدَّمة يدوية على رصيد الإجازة (توثيق تاريخي فقط). لا ينشئ أي قيد محاسبي
   * أو حركة بنكية أو شيك أو سند صرف أو راتب. لا يُغيّر رصيد الإجازة المحتسَب ولا يُزيح
   * خط أساس تراكمه — الاستحقاق القانوني لا يُسقَط بمقابل أثناء الخدمة (المادتان 73/74).
   */
  async createLeaveSettlement(employeeId: number, input: CreateLeaveSettlementInput, req: Request) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');

    const settlement = await prisma.leaveSettlement.create({
      data: {
        employeeId,
        settlementDate: input.settlementDate,
        leaveDaysSettled: input.leaveDaysSettled,
        settlementAmount: input.settlementAmount,
        paymentMethod: input.paymentMethod,
        notes: input.notes ?? null,
        createdBy: req.user?.userId ?? null,
      },
    });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'employees',
      entityId: settlement.id,
      newValue: { leaveSettlement: settlement.leaveDaysSettled, amount: settlement.settlementAmount },
    });
    return settlement;
  }

  async create(input: CreateEmployeeInput, req: Request) {
    const conflictEmployee = await prisma.employee.findUnique({ where: { code: input.code }, select: { fullName: true } });
    if (conflictEmployee) throw AppError.conflict(`الرقم الوظيفي «${input.code}» مستخدم بالفعل للموظف: ${conflictEmployee.fullName}`);
    const employee = await repo.create({ ...input, email: input.email || null });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'employees',
      entityId: employee.id,
      newValue: { code: input.code },
    });
    return employee;
  }

  async update(id: number, input: UpdateEmployeeInput, req: Request) {
    const current = await repo.findById(id);
    if (!current) throw AppError.notFound('الموظف غير موجود');
    const data = { ...input } as Record<string, unknown>;
    if (input.email !== undefined) data.email = input.email || null;
    const employee = await repo.update(id, data);
    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'employees',
      entityId: id,
      oldValue: current,
      newValue: input,
    });
    return employee;
  }

  async remove(id: number, req: Request) {
    if (!(await repo.findById(id))) throw AppError.notFound('الموظف غير موجود');
    // تعطيل بدل الحذف للحفاظ على سجلات الحضور والرواتب
    const employee = await repo.update(id, { status: 'TERMINATED' });
    await recordAudit({ req, action: 'DELETE', module: 'employees', entityId: id });
    return employee;
  }

  // ===== الحضور والانصراف =====
  async listAttendance(query: PaginationQuery & AttendanceFilters) {
    const pagination = getPagination(query);
    const where = buildAttendanceWhere(query);
    const include = { employee: { select: { id: true, code: true, fullName: true } } };
    const orderBy = buildOrderBy(query, ATTENDANCE_SORTABLE, ATTENDANCE_DEFAULT_ORDER, [{ id: 'desc' }]) as Prisma.AttendanceOrderByWithRelationInput[];

    const [data, statusCounts] = await Promise.all([
      prisma.attendance.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy, include }),
      prisma.attendance.groupBy({ by: ['status'], where, _count: { status: true } }),
    ]);
    const total = statusCounts.reduce((sum, r) => sum + r._count.status, 0);

    return {
      ...buildPaginatedResult(data, total, pagination),
      stats: aggregateAttendanceStats(statusCounts, total),
    };
  }

  /** تسجيل/تحديث حضور يوم (Upsert على employeeId+date). */
  async recordAttendance(input: AttendanceInput, req: Request) {
    const workHours = diffHours(input.checkIn, input.checkOut);

    // تطبيع التاريخ إلى منتصف الليل UTC لضمان استقرار المفتاح الفريد employeeId_date
    const normalizedDate = new Date(input.date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    const att = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: input.employeeId, date: normalizedDate } },
      update: {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        status: input.status,
        workHours,
        notes: input.notes,
      },
      create: { ...input, date: normalizedDate, workHours },
    });
    await recordAudit({ req, action: 'CREATE', module: 'attendance', entityId: att.id });
    return att;
  }

  async updateAttendance(id: number, input: UpdateAttendanceInput, req: Request) {
    const old = await prisma.attendance.findUnique({ where: { id } });
    if (!old) throw AppError.notFound('سجل الحضور غير موجود');
    const workHours = diffHours(
      input.checkIn ?? old.checkIn ?? undefined,
      input.checkOut ?? old.checkOut ?? undefined,
    );
    const record = await prisma.attendance.update({ where: { id }, data: { ...input, workHours } });
    await recordAudit({ req, action: 'UPDATE', module: 'attendance', entityId: id, oldValue: old, newValue: input });
    return record;
  }

  async deleteAttendance(id: number, req: Request) {
    const old = await prisma.attendance.findUnique({ where: { id } });
    if (!old) throw AppError.notFound('سجل الحضور غير موجود');
    await prisma.attendance.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'attendance', entityId: id, oldValue: old });
    return { deleted: true };
  }

  // ===== الإجازات =====
  async listLeaves(employeeId?: number, status?: string) {
    return prisma.leave.findMany({
      where: { employeeId: employeeId ?? undefined, status: status ?? undefined },
      orderBy: { startDate: 'desc' },
      include: { employee: { select: { code: true, fullName: true } } },
    });
  }

  async requestLeave(input: LeaveInput, req: Request) {
    const days = diffDays(input.startDate, input.endDate);
    const leave = await prisma.leave.create({ data: { ...input, days, status: 'PENDING' } });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'employees',
      entityId: leave.id,
      newValue: { leave: input.type, days },
    });
    return leave;
  }

  async setLeaveStatus(id: number, status: 'APPROVED' | 'REJECTED', req: Request) {
    const leave = await prisma.leave.findUnique({ where: { id } });
    if (!leave) throw AppError.notFound('طلب الإجازة غير موجود');
    const updated = await prisma.leave.update({ where: { id }, data: { status } });
    await recordAudit({
      req,
      action: status === 'APPROVED' ? 'APPROVE' : 'REJECT',
      module: 'employees',
      entityId: id,
    });
    return updated;
  }

  // ===== الخصومات والمكافآت =====
  async addDeduction(input: AdjustmentInput, req: Request) {
    const d = await prisma.deduction.create({ data: { ...input, date: input.date ?? new Date() } });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'employees',
      entityId: d.id,
      newValue: { deduction: input.amount },
    });
    return d;
  }

  async addBonus(input: AdjustmentInput, req: Request) {
    const b = await prisma.bonus.create({ data: { ...input, date: input.date ?? new Date() } });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'employees',
      entityId: b.id,
      newValue: { bonus: input.amount },
    });
    return b;
  }
}

export const employeesService = new EmployeesService();
