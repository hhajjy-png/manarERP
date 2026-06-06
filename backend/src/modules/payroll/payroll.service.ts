import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { transactionsService } from '../transactions/transactions.service';
import { GeneratePayrollInput } from './payroll.schema';

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** نطاق شهر معيّن [البداية، نهاية الشهر]. */
function monthRange(month: number, year: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  return { start, end };
}

export class PayrollService {
  async list(query: PaginationQuery & { month?: string; year?: string; status?: string; employeeId?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.PayrollWhereInput = {};
    if (query.month) where.month = Number(query.month);
    if (query.year) where.year = Number(query.year);
    if (query.status) where.status = query.status;
    if (query.employeeId) where.employeeId = Number(query.employeeId);

    const [data, total] = await Promise.all([
      prisma.payroll.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        include: { employee: { select: { code: true, fullName: true, department: true } } },
      }),
      prisma.payroll.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  /** احتساب راتب موظف واحد لشهر/سنة (Upsert على employeeId+month+year). */
  private async computeForEmployee(employeeId: number, month: number, year: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');

    const { start, end } = monthRange(month, year);
    const [bonusAgg, dedAgg] = await Promise.all([
      prisma.bonus.aggregate({ where: { employeeId, date: { gte: start, lte: end } }, _sum: { amount: true } }),
      prisma.deduction.aggregate({ where: { employeeId, date: { gte: start, lte: end } }, _sum: { amount: true } }),
    ]);
    const totalBonus = round2(bonusAgg._sum.amount ?? 0);
    const totalDeduction = round2(dedAgg._sum.amount ?? 0);
    const baseSalary = employee.salary;
    const netSalary = round2(baseSalary + totalBonus - totalDeduction);

    return prisma.payroll.upsert({
      where: { employeeId_month_year: { employeeId, month, year } },
      update: { baseSalary, totalBonus, totalDeduction, netSalary, status: 'DRAFT' },
      create: { employeeId, month, year, baseSalary, totalBonus, totalDeduction, netSalary, status: 'DRAFT' },
    });
  }

  /** توليد كشف الرواتب لموظف أو لكل النشطين. */
  async generate(input: GeneratePayrollInput, req: Request) {
    let results;
    if (input.employeeId) {
      results = [await this.computeForEmployee(input.employeeId, input.month, input.year)];
    } else {
      const actives = await prisma.employee.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
      results = [];
      for (const e of actives) results.push(await this.computeForEmployee(e.id, input.month, input.year));
    }
    await recordAudit({ req, action: 'CREATE', module: 'payroll', newValue: { month: input.month, year: input.year, count: results.length } });
    return { generated: results.length, items: results };
  }

  async approve(id: number, req: Request) {
    const payroll = await prisma.payroll.findUnique({ where: { id } });
    if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');
    if (payroll.status === 'PAID') throw AppError.badRequest('الكشف مدفوع بالفعل');
    const updated = await prisma.payroll.update({ where: { id }, data: { status: 'APPROVED' } });
    await recordAudit({ req, action: 'APPROVE', module: 'payroll', entityId: id });
    return updated;
  }

  /** صرف الراتب + ترحيل قيد مصروف رواتب. */
  async markPaid(id: number, req: Request) {
    const payroll = await prisma.payroll.findUnique({ where: { id }, include: { employee: { select: { fullName: true } } } });
    if (!payroll) throw AppError.notFound('كشف الراتب غير موجود');
    if (payroll.status === 'PAID') throw AppError.badRequest('الكشف مدفوع بالفعل');

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.payroll.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } });
      await transactionsService.postEntry(
        {
          date: new Date(),
          description: `راتب ${payroll.employee.fullName} — ${payroll.month}/${payroll.year}`,
          type: 'EXPENSE',
          debit: payroll.netSalary,
          account: 'مصروفات - رواتب',
          referenceType: 'PAYROLL',
          referenceId: id,
        },
        tx,
      );
      return p;
    });
    await recordAudit({ req, action: 'PAYMENT', module: 'payroll', entityId: id, newValue: { net: payroll.netSalary } });
    return updated;
  }
}

export const payrollService = new PayrollService();
