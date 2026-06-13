import { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';

export class FormsService {
  async getSalaryCertificateData(employeeId: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    const latestPayroll = await prisma.payroll.findFirst({
      where: { employeeId, status: { in: ['APPROVED', 'PAID'] } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { month: true, year: true, netSalary: true, snapshotBaseSalary: true, status: true },
    });
    return { employee, latestPayroll };
  }

  async getToWhomItMayConcernData(employeeId: number) {
    return this.getSalaryCertificateData(employeeId);
  }

  async getLeaveRequestData(employeeId: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    const latestLeave = await prisma.leave.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
    return { employee, latestLeave };
  }

  async getReturnToWorkData(employeeId: number) {
    return this.getLeaveRequestData(employeeId);
  }

  async getSalaryAdvanceData(employeeId: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    const latestAdvance = await prisma.payrollAdvance.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
    return { employee, latestAdvance };
  }

  async getResignationData(employeeId: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    return { employee };
  }

  async getWarningData(employeeId: number) {
    return this.getResignationData(employeeId);
  }

  async getPerformanceEvaluationData(employeeId: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    const latestReview = await prisma.performanceReview.findFirst({
      where: { employeeId },
      orderBy: { date: 'desc' },
    });
    return { employee, latestReview };
  }

  async logFormPrint(
    req: Request,
    data: {
      formType: string;
      formNumber: string;
      employeeId: number;
      employeeName: string;
      issueDate: string;
      printMode: string;
    },
  ) {
    await recordAudit({
      req,
      action: 'PRINT',
      module: 'forms',
      entityId: data.employeeId,
      oldValue: data,
    });
  }
}

export const formsService = new FormsService();
