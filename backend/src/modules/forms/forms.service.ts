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

  /**
   * إقرار دين موظف — بيانات الموظف وحدها.
   *
   * لا جدول جديد ولا حقل جديد: النموذج مستند طباعة (نموذج + معاينة + طباعة) على نمط
   * بقية النماذج الإدارية، وبياناته المالية والقانونية تُدخل يدويًا في الشاشة نفسها.
   * ما يحتاجه الخادم هو سجل الموظف فقط، لملء بيانات المدين تلقائيًا.
   */
  async getEmployeeDebtAcknowledgmentData(employeeId: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    return { employee };
  }

  async getEmploymentContractData(employeeId: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    return { employee };
  }

  /**
   * Generates a receipt voucher sequence number (RCV-000001) and persists it
   * in the Settings counter. The number is consumed the moment this method is
   * called — even if the user cancels the browser print dialog afterward.
   */
  async generateReceiptVoucherNumber(): Promise<string> {
    const SETTINGS_KEY = 'finance.receiptVoucher.lastSequence';
    return prisma.$transaction(async (tx) => {
      const setting = await tx.setting.findUnique({ where: { key: SETTINGS_KEY } });
      const lastSeq = setting ? parseInt(setting.value, 10) : 0;
      const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
      const number = `RCV-${String(nextSeq).padStart(6, '0')}`;
      await tx.setting.upsert({
        where: { key: SETTINGS_KEY },
        update: { value: String(nextSeq) },
        create: { key: SETTINGS_KEY, value: String(nextSeq), group: 'finance' },
      });
      return number;
    });
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
