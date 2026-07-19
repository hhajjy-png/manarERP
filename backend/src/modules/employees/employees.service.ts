import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { BaseRepository } from '../../shared/repositories/BaseRepository';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { buildOrderBy, SortWhitelist } from '../../core/utils/sort';
import {
  AdjustmentInput,
  AttendanceInput,
  CreateEmployeeInput,
  LeaveInput,
  UpdateAttendanceInput,
  UpdateEmployeeInput,
} from './employees.schema';
import { buildDocumentAlerts } from './employees.alertBuilder';
import { aggregateAttendanceStats, AttendanceFilters, buildAttendanceWhere } from './attendance.filters';
import { calculateEntitlements } from './entitlements.calc';

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
const SORTABLE: SortWhitelist = {
  code: 'code',
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

  /**
   * استحقاقات الموظف (قراءة فقط) — مدة الخدمة، رصيد الإجازة، بدل الإجازة، ومكافأة
   * نهاية الخدمة محسوبة حتى اليوم وفق قانون العمل الكويتي 6/2010 (المادتان 70 و51).
   * الحساب يتم في دالة نقيّة (entitlements.calc.ts)؛ هنا فقط جمع المدخلات من مصادرها
   * الحالية دون تكرار منطق: أيام الإجازة المستخدمة تُجمَع من Leave.days المخزّن مباشرةً.
   */
  async getEntitlements(id: number) {
    const employee = await prisma.employee.findUnique({
      where: { id },
      select: { id: true, code: true, fullName: true, salary: true, hireDate: true, status: true },
    });
    if (!employee) throw AppError.notFound('الموظف غير موجود');

    // مصدر واحد للحقيقة: مجموع أيام الإجازات السنوية المعتمدة كما هي مخزّنة في Leave.days.
    const usedAgg = await prisma.leave.aggregate({
      where: { employeeId: id, type: 'ANNUAL', status: 'APPROVED' },
      _sum: { days: true },
    });

    const leaveHistory = await prisma.leave.findMany({
      where: { employeeId: id },
      orderBy: { startDate: 'desc' },
      select: { id: true, type: true, startDate: true, endDate: true, days: true, status: true },
    });

    const result = calculateEntitlements({
      hireDate: employee.hireDate,
      monthlySalary: employee.salary,
      asOf: new Date(),
      usedAnnualLeaveDays: usedAgg._sum.days ?? 0,
    });

    return {
      employee,
      result,
      leaveHistory,
      // لا يوجد مصدر بيانات لعمليات صرف بدل الإجازة السابقة في النظام الحالي — تُعرض فارغة
      // (لا يُضاف جدول ولا عمود غير مستخدَم في هذا الإصدار).
      settlements: [] as never[],
    };
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
