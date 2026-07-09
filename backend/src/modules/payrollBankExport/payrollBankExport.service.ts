import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { nbkSalaryXlsProfile } from './profiles/nbkSalaryXlsProfile';
import type {
  BankExportProfile,
  PayrollBankExportResult,
  PayrollExportSource,
} from './types';

// Profile registry. Adding a bank = registering another profile here — no other change.
const PROFILES: Record<string, BankExportProfile> = {
  [nbkSalaryXlsProfile.id]: nbkSalaryXlsProfile,
};

export function listExportProfiles() {
  return Object.values(PROFILES).map((p) => ({
    id: p.id,
    label: p.label,
    fileExtension: p.fileExtension,
    currency: p.currency,
  }));
}

export const payrollBankExportService = {
  /**
   * Build the export preview (sheets + validation + totals) for an APPROVED payroll month.
   * READ-ONLY: a single findMany over payroll+employee; never mutates payroll, employees,
   * approval state, or the ledger. The client serialises the returned sheets to legacy .xls.
   */
  async buildPreview(profileId: string, month: number, year: number): Promise<PayrollBankExportResult> {
    const profile = PROFILES[profileId];
    if (!profile) throw AppError.badRequest('ملف التصدير غير مدعوم');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw AppError.badRequest('الشهر غير صالح');
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw AppError.badRequest('السنة غير صالحة');

    const rows = await prisma.payroll.findMany({
      where: { month, year, status: 'APPROVED' },
      orderBy: [{ employee: { code: 'asc' } }, { id: 'asc' }],
      include: {
        employee: {
          select: { code: true, fullName: true, fullNameEn: true, civilId: true, bankAccount: true },
        },
      },
    });

    const sources: PayrollExportSource[] = rows.map((r) => ({
      employeeCode: r.employee.code,
      fullName: r.employee.fullName,
      fullNameEn: r.employee.fullNameEn,
      civilId: r.employee.civilId,
      bankAccount: r.employee.bankAccount,
      netSalary: Number(r.netSalary),
    }));

    return profile.build(sources, month, year);
  },
};
