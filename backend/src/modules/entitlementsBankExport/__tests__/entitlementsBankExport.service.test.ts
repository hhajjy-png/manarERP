import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ════════════════════════════════════════════════════════════════════════════
   عقد خدمة كشف المستحقات البنكي.

   ما تحرسه هذه الاختبارات، بالترتيب:
     • المعادلة: net − basic، من **لقطة** الحسبة لا من راتب الموظف الحيّ.
     • الأهلية: سبب صريح لكل موظف غير مؤهّل، ولا إخفاء صامت.
     • العزل: لا كتابة في Payroll ولا SalaryPayment ولا الحسبات ولا دفتر الأستاذ
       ولا المصروفات — الكتابة الوحيدة في جدولي الكشف وسجل التدقيق.
     • التجميد: الملف البنكي يُبنى من لقطة الكشف المعتمد، فتعديل الحسبة لاحقًا لا
       يغيّره بصمت.
   ════════════════════════════════════════════════════════════════════════════ */

const db = vi.hoisted(() => ({
  calcFindMany: vi.fn(),
  employeeFindMany: vi.fn(),
  stmtFindUnique: vi.fn(),
  stmtCreate: vi.fn(),
  stmtDelete: vi.fn(),
  auditCreate: vi.fn(),
  // مراقبات العزل — أي استدعاء لأيٍّ منها يعني تسرّبًا خارج نطاق الحزمة.
  payrollUpdate: vi.fn(),
  payrollUpdateMany: vi.fn(),
  payrollCreate: vi.fn(),
  salaryPaymentCreate: vi.fn(),
  calcUpdate: vi.fn(),
  employeeUpdate: vi.fn(),
  glCreate: vi.fn(),
  expenseCreate: vi.fn(),
}));

vi.mock('../../../config/database', () => ({
  prisma: {
    employeeCompensationCalculation: { findMany: db.calcFindMany, update: db.calcUpdate, updateMany: db.calcUpdate },
    employee: { findMany: db.employeeFindMany, update: db.employeeUpdate, updateMany: db.employeeUpdate },
    entitlementsBankStatement: { findUnique: db.stmtFindUnique, create: db.stmtCreate, delete: db.stmtDelete },
    auditLog: { create: db.auditCreate },
    payroll: { update: db.payrollUpdate, updateMany: db.payrollUpdateMany, create: db.payrollCreate },
    salaryPayment: { create: db.salaryPaymentCreate },
    journalEntry: { create: db.glCreate },
    expense: { create: db.expenseCreate },
  },
}));

import type { Request } from 'express';
import {
  entitlementsBankExportService as service,
  entitlementTransferAmount,
  listEntitlementsExportProfiles,
} from '../entitlementsBankExport.service';

const req = { user: { userId: 7, username: 'hr.manager' }, ip: '127.0.0.1' } as unknown as Request;

function employee(over: Record<string, unknown> = {}) {
  return {
    id: 1, code: 'EMP-1', fullName: 'محمد علي', fullNameEn: 'Mohammed Ali',
    civilId: '290010112345', bankAccount: '1234567890', status: 'ACTIVE', ...over,
  };
}
function calc(over: Record<string, unknown> = {}) {
  return { id: 100, employeeId: 1, status: 'APPROVED', netAmount: 350, basicSalarySnapshot: 150, ...over };
}

function noMutationsOutsideThisPack() {
  expect(db.payrollUpdate).not.toHaveBeenCalled();
  expect(db.payrollUpdateMany).not.toHaveBeenCalled();
  expect(db.payrollCreate).not.toHaveBeenCalled();
  expect(db.salaryPaymentCreate).not.toHaveBeenCalled();
  expect(db.calcUpdate).not.toHaveBeenCalled();
  expect(db.employeeUpdate).not.toHaveBeenCalled();
  expect(db.glCreate).not.toHaveBeenCalled();
  expect(db.expenseCreate).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  db.stmtFindUnique.mockResolvedValue(null);
  db.auditCreate.mockResolvedValue({});
});

// ── المعادلة ────────────────────────────────────────────────────────────────
describe('entitlementTransferAmount — the ONLY new financial formula', () => {
  it('350.000 − 150.000 = 200.000', () => {
    expect(entitlementTransferAmount(350, 150)).toBe(200);
  });

  it('keeps KWD 3-decimal precision and never leaks float noise', () => {
    expect(entitlementTransferAmount(0.3, 0.1)).toBe(0.2);
    expect(entitlementTransferAmount(1234.5675, 1000)).toBe(234.568);
    expect(entitlementTransferAmount(100.0004, 100)).toBe(0);
  });

  it('returns a non-positive value when the net does not exceed the basic salary', () => {
    expect(entitlementTransferAmount(150, 150)).toBe(0);
    expect(entitlementTransferAmount(120, 150)).toBe(-30);
  });
});

describe('listEntitlementsExportProfiles — its OWN registry, no salary profile in it', () => {
  it('exposes exactly the NBK entitlements profile', () => {
    const profiles = listEntitlementsExportProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id: 'nbk_entitlements_xls', fileExtension: 'xls', currency: 'KWD' });
  });
});

// ── قراءة الشهر والأهلية ────────────────────────────────────────────────────
describe('getMonth — reads compensation for the SELECTED period only', () => {
  it('queries the exact year/month, never today\'s date', async () => {
    db.calcFindMany.mockResolvedValue([calc()]);
    db.employeeFindMany.mockResolvedValue([employee()]);

    await service.getMonth(3, 2026);

    expect(db.calcFindMany).toHaveBeenCalledOnce();
    expect(db.calcFindMany.mock.calls[0][0].where).toEqual({ year: 2026, month: 3 });
    noMutationsOutsideThisPack();
  });

  it('rejects an invalid month/year', async () => {
    await expect(service.getMonth(13, 2026)).rejects.toThrow('الشهر');
    await expect(service.getMonth(5, 1999)).rejects.toThrow('السنة');
    expect(db.calcFindMany).not.toHaveBeenCalled();
  });

  it('computes the transfer as net − SNAPSHOT basic, not the live employee salary', async () => {
    // الراتب الحيّ في ملف الموظف 999 — لو استُخدم لخرج المبلغ خاطئًا.
    db.calcFindMany.mockResolvedValue([calc({ netAmount: 350, basicSalarySnapshot: 150 })]);
    db.employeeFindMany.mockResolvedValue([employee({ salary: 999 })]);

    const { rows } = await service.getMonth(8, 2026);

    expect(rows[0].netAmount).toBe(350);
    expect(rows[0].basicSalary).toBe(150);
    expect(rows[0].transferAmount).toBe(200);
    expect(rows[0].eligibility).toBe('READY');
    // The employee query never even selects the live salary field.
    expect(db.employeeFindMany.mock.calls[0][0].select).not.toHaveProperty('salary');
  });

  it('an employee with NO calculation is shown with a clear reason, not hidden', async () => {
    db.calcFindMany.mockResolvedValue([]);
    db.employeeFindMany.mockResolvedValue([employee()]);

    const { rows } = await service.getMonth(8, 2026);

    expect(rows).toHaveLength(1);
    expect(rows[0].eligibility).toBe('NO_CALCULATION');
    expect(rows[0].blockers).toEqual(['لا يوجد كشف مستحقات لهذا الشهر']);
    expect(rows[0].transferAmount).toBeNull();
  });

  it('a DRAFT calculation is reported as not approved', async () => {
    db.calcFindMany.mockResolvedValue([calc({ status: 'DRAFT' })]);
    db.employeeFindMany.mockResolvedValue([employee()]);

    const { rows } = await service.getMonth(8, 2026);
    expect(rows[0].eligibility).toBe('NOT_APPROVED');
    expect(rows[0].blockers).toEqual(['كشف المستحقات غير معتمد']);
  });

  it('a zero / negative entitlement is reported as having no transfer amount', async () => {
    db.calcFindMany.mockResolvedValue([
      calc({ id: 100, employeeId: 1, netAmount: 150, basicSalarySnapshot: 150 }),
      calc({ id: 101, employeeId: 2, netAmount: 100, basicSalarySnapshot: 150 }),
    ]);
    db.employeeFindMany.mockResolvedValue([employee(), employee({ id: 2, code: 'EMP-2' })]);

    const { rows } = await service.getMonth(8, 2026);
    expect(rows.map((r) => r.eligibility)).toEqual(['NO_AMOUNT', 'NO_AMOUNT']);
    expect(rows[0].blockers).toEqual(['لا يوجد مبلغ مستحق للتحويل']);
  });

  it('incomplete bank data is reported with the SAME messages the salary file uses', async () => {
    db.calcFindMany.mockResolvedValue([calc()]);
    db.employeeFindMany.mockResolvedValue([employee({ fullNameEn: null, civilId: null, bankAccount: null })]);

    const { rows } = await service.getMonth(8, 2026);
    expect(rows[0].eligibility).toBe('BANK_DATA_INCOMPLETE');
    expect(rows[0].blockers).toEqual([
      'الموظف EMP-1: اسم الموظف الإنجليزي مطلوب للتصدير البنكي NBK',
      'الموظف EMP-1: الرقم المدني مفقود',
      'الموظف EMP-1: رقم الحساب / IBAN مفقود',
    ]);
  });

  it('sorts by employee code, like the salary bank statement', async () => {
    db.calcFindMany.mockResolvedValue([calc({ id: 1, employeeId: 1 }), calc({ id: 2, employeeId: 2 })]);
    db.employeeFindMany.mockResolvedValue([employee({ id: 2, code: 'EMP-9' }), employee({ id: 1, code: 'EMP-1' })]);

    const { rows } = await service.getMonth(8, 2026);
    expect(rows.map((r) => r.employeeCode)).toEqual(['EMP-1', 'EMP-9']);
  });
});

// ── الاعتماد والتجميد ───────────────────────────────────────────────────────
describe('approve — freezes the statement and touches nothing else', () => {
  function approvedCreatedStatement(over: Record<string, unknown> = {}) {
    return {
      id: 5, year: 2026, month: 8, profileId: 'nbk_entitlements_xls', currency: 'KWD',
      status: 'APPROVED', employeeCount: 1, totalAmount: 200, approvedAt: new Date(),
      approvedByName: 'hr.manager', lines: [], ...over,
    };
  }

  it('snapshots net, basic and transfer per employee — and writes ONLY the statement', async () => {
    db.calcFindMany.mockResolvedValue([calc({ netAmount: 350, basicSalarySnapshot: 150 })]);
    db.employeeFindMany.mockResolvedValue([employee()]);
    db.stmtCreate.mockResolvedValue(approvedCreatedStatement());

    await service.approve({ month: 8, year: 2026, employeeIds: [1], profileId: 'nbk_entitlements_xls' }, req);

    const data = db.stmtCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ year: 2026, month: 8, employeeCount: 1, totalAmount: 200, status: 'APPROVED' });
    expect(data.lines.create[0]).toMatchObject({
      employeeId: 1,
      calculationId: 100,
      employeeCodeSnapshot: 'EMP-1',
      employeeNameEnSnapshot: 'Mohammed Ali',
      civilIdSnapshot: '290010112345',
      bankAccountSnapshot: '1234567890',
      netAmountSnapshot: 350,
      basicSalarySnapshot: 150,
      transferAmount: 200,
    });
    noMutationsOutsideThisPack();
  });

  it('totals several selected employees correctly', async () => {
    db.calcFindMany.mockResolvedValue([
      calc({ id: 100, employeeId: 1, netAmount: 350, basicSalarySnapshot: 150 }),
      calc({ id: 101, employeeId: 2, netAmount: 500.25, basicSalarySnapshot: 400 }),
    ]);
    db.employeeFindMany.mockResolvedValue([employee(), employee({ id: 2, code: 'EMP-2' })]);
    db.stmtCreate.mockResolvedValue(approvedCreatedStatement({ employeeCount: 2, totalAmount: 300.25 }));

    await service.approve({ month: 8, year: 2026, employeeIds: [1, 2], profileId: 'nbk_entitlements_xls' }, req);

    const data = db.stmtCreate.mock.calls[0][0].data;
    expect(data.employeeCount).toBe(2);
    expect(data.totalAmount).toBe(300.25);
    expect(data.lines.create.map((l: { transferAmount: number }) => l.transferAmount)).toEqual([200, 100.25]);
  });

  it('refuses an ineligible employee and names the reason — it is not silently dropped', async () => {
    db.calcFindMany.mockResolvedValue([calc({ status: 'DRAFT' })]);
    db.employeeFindMany.mockResolvedValue([employee()]);

    await expect(
      service.approve({ month: 8, year: 2026, employeeIds: [1], profileId: 'nbk_entitlements_xls' }, req),
    ).rejects.toThrow('غير مؤهّلين');
    expect(db.stmtCreate).not.toHaveBeenCalled();
  });

  it('refuses a zero / negative transfer', async () => {
    db.calcFindMany.mockResolvedValue([calc({ netAmount: 150, basicSalarySnapshot: 150 })]);
    db.employeeFindMany.mockResolvedValue([employee()]);

    await expect(
      service.approve({ month: 8, year: 2026, employeeIds: [1], profileId: 'nbk_entitlements_xls' }, req),
    ).rejects.toThrow('غير مؤهّلين');
    expect(db.stmtCreate).not.toHaveBeenCalled();
  });

  it('refuses a SECOND statement for the same month (duplicate transfer guard)', async () => {
    db.stmtFindUnique.mockResolvedValue({ id: 5, year: 2026, month: 8 });

    await expect(
      service.approve({ month: 8, year: 2026, employeeIds: [1], profileId: 'nbk_entitlements_xls' }, req),
    ).rejects.toThrow('معتمد لهذا الشهر بالفعل');
    expect(db.stmtCreate).not.toHaveBeenCalled();
  });

  it('de-duplicates a repeated employee id inside one request', async () => {
    db.calcFindMany.mockResolvedValue([calc()]);
    db.employeeFindMany.mockResolvedValue([employee()]);
    db.stmtCreate.mockResolvedValue(approvedCreatedStatement());

    await service.approve({ month: 8, year: 2026, employeeIds: [1, 1, 1], profileId: 'nbk_entitlements_xls' }, req);

    expect(db.stmtCreate.mock.calls[0][0].data.lines.create).toHaveLength(1);
  });

  it('rejects an empty selection and an unsupported profile', async () => {
    await expect(service.approve({ month: 8, year: 2026, employeeIds: [], profileId: 'nbk_entitlements_xls' }, req))
      .rejects.toThrow('موظفًا واحدًا على الأقل');
    await expect(service.approve({ month: 8, year: 2026, employeeIds: [1], profileId: 'gulf_bank_xls' }, req))
      .rejects.toThrow('ملف التصدير غير مدعوم');
    expect(db.stmtCreate).not.toHaveBeenCalled();
  });

  it('records an audit entry for the approval', async () => {
    db.calcFindMany.mockResolvedValue([calc()]);
    db.employeeFindMany.mockResolvedValue([employee()]);
    db.stmtCreate.mockResolvedValue(approvedCreatedStatement());

    await service.approve({ month: 8, year: 2026, employeeIds: [1], profileId: 'nbk_entitlements_xls' }, req);

    expect(db.auditCreate).toHaveBeenCalledOnce();
    expect(db.auditCreate.mock.calls[0][0].data).toMatchObject({ action: 'APPROVE', userId: 7 });
  });
});

describe('unapprove — the ONLY way an approved statement changes', () => {
  it('deletes the frozen statement and audits it', async () => {
    db.stmtFindUnique.mockResolvedValue({ id: 5, year: 2026, month: 8, employeeCount: 1, totalAmount: 200 });
    db.stmtDelete.mockResolvedValue({});

    await service.unapprove({ month: 8, year: 2026 }, req);

    expect(db.stmtDelete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(db.auditCreate.mock.calls[0][0].data).toMatchObject({ action: 'DELETE' });
    noMutationsOutsideThisPack();
  });

  it('fails clearly when there is no approved statement', async () => {
    db.stmtFindUnique.mockResolvedValue(null);
    await expect(service.unapprove({ month: 8, year: 2026 }, req)).rejects.toThrow('لا يوجد كشف مستحقات معتمد');
    expect(db.stmtDelete).not.toHaveBeenCalled();
  });
});

// ── الملف البنكي يُبنى من اللقطة وحدها ───────────────────────────────────────
describe('buildPreview — the bank file comes from the FROZEN snapshot', () => {
  it('refuses to build a file when the statement is not approved', async () => {
    db.stmtFindUnique.mockResolvedValue(null);
    await expect(service.buildPreview('nbk_entitlements_xls', 8, 2026))
      .rejects.toThrow('لا يوجد كشف مستحقات معتمد');
    expect(db.calcFindMany).not.toHaveBeenCalled();
  });

  it('uses the snapshot values — a LATER edit to the calculation cannot change the file', async () => {
    // الحسبة الحيّة تغيّرت بعد الاعتماد (الصافي صار 900)، واللقطة تقول 350/150.
    db.calcFindMany.mockResolvedValue([calc({ netAmount: 900, basicSalarySnapshot: 150 })]);
    db.stmtFindUnique.mockResolvedValue({
      id: 5, year: 2026, month: 8, profileId: 'nbk_entitlements_xls', currency: 'KWD',
      status: 'APPROVED', employeeCount: 1, totalAmount: 200, approvedAt: new Date(), approvedByName: 'hr',
      lines: [{
        employeeId: 1, calculationId: 100, employeeCodeSnapshot: 'EMP-1',
        employeeNameSnapshot: 'محمد علي', employeeNameEnSnapshot: 'Mohammed Ali',
        civilIdSnapshot: '290010112345', bankAccountSnapshot: '1234567890',
        netAmountSnapshot: 350, basicSalarySnapshot: 150, transferAmount: 200, sortOrder: 0,
      }],
    });

    const r = await service.buildPreview('nbk_entitlements_xls', 8, 2026);

    expect(r.profileId).toBe('nbk_entitlements_xls');
    expect(r.summary.totalAmount).toBe(200); // NOT 750
    expect(r.sheets[0].rows[0].amount).toBe(200);
    expect(r.valid).toBe(true);
    // The live calculation was never even read while building the file.
    expect(db.calcFindMany).not.toHaveBeenCalled();
    noMutationsOutsideThisPack();
  });

  it('rejects an unsupported profile before touching the database', async () => {
    await expect(service.buildPreview('gulf_bank_xls', 8, 2026)).rejects.toThrow('ملف التصدير غير مدعوم');
    expect(db.stmtFindUnique).not.toHaveBeenCalled();
  });
});
