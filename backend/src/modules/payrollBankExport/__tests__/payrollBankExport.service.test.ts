import { describe, it, expect, vi, beforeEach } from 'vitest';

// READ-ONLY export: mock prisma with ONLY a findMany + spies on mutating ops to prove
// the export never writes to payroll/employees/ledger.
const { update, create, deleteMany } = vi.hoisted(() => ({
  update: vi.fn(), create: vi.fn(), deleteMany: vi.fn(),
}));

vi.mock('../../../config/database', () => ({
  prisma: {
    payroll: { findMany: vi.fn(), update, create, delete: deleteMany, deleteMany, updateMany: update },
  },
}));

import { prisma } from '../../../config/database';
import { payrollBankExportService, listExportProfiles } from '../payrollBankExport.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const findMany = prisma.payroll.findMany as any;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1, netSalary: 300, month: 5, year: 2026, status: 'APPROVED',
    employee: { code: 'EMP-1', fullName: 'محمد', fullNameEn: 'Mohammed', civilId: '2900101', bankAccount: '123456' },
    ...over,
  };
}

describe('payrollBankExportService.buildPreview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries ONLY approved payroll for the month (read-only — no writes)', async () => {
    findMany.mockResolvedValue([row()]);
    await payrollBankExportService.buildPreview('nbk_salary_xls', 5, 2026);

    expect(findMany).toHaveBeenCalledOnce();
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ month: 5, year: 2026, status: 'APPROVED' });
    // No mutation of payroll/employees/ledger.
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('returns the NBK-built result (sheets + totals) from the approved rows', async () => {
    findMany.mockResolvedValue([row({ id: 1, netSalary: 300 }), row({ id: 2, netSalary: 200, employee: { code: 'EMP-2', fullName: 'علي', fullNameEn: 'Ali', civilId: '2900102', bankAccount: '654321' } })]);
    const r = await payrollBankExportService.buildPreview('nbk_salary_xls', 5, 2026);

    expect(r.profileId).toBe('nbk_salary_xls');
    expect(r.fileExtension).toBe('xls');
    expect(r.sheets.map((s) => s.name)).toEqual(['Salary Details', 'Bank Codes']);
    expect(r.summary.employeeCount).toBe(2);
    expect(r.summary.totalAmount).toBe(500);
    expect(r.valid).toBe(true);
  });

  it('rejects an unsupported profile', async () => {
    await expect(payrollBankExportService.buildPreview('gulf_bank_xls', 5, 2026))
      .rejects.toThrow('ملف التصدير غير مدعوم');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects an invalid month/year', async () => {
    await expect(payrollBankExportService.buildPreview('nbk_salary_xls', 13, 2026)).rejects.toThrow('الشهر');
    await expect(payrollBankExportService.buildPreview('nbk_salary_xls', 5, 1999)).rejects.toThrow('السنة');
  });

  it('an approved month with a bad row is returned as invalid (blocks the file)', async () => {
    findMany.mockResolvedValue([row({ employee: { code: 'EMP-9', fullName: 'x', fullNameEn: null, civilId: null, bankAccount: null } })]);
    const r = await payrollBankExportService.buildPreview('nbk_salary_xls', 5, 2026);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('listExportProfiles — v1 exposes only NBK', () => {
  it('returns exactly the NBK Salary XLS profile', () => {
    const profiles = listExportProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id: 'nbk_salary_xls', fileExtension: 'xls', currency: 'KWD' });
  });
});
