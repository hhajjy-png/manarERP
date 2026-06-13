import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';

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
}

export const formsService = new FormsService();
