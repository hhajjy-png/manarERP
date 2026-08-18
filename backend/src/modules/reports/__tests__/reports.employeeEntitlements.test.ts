import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * تقرير مستحقات الموظفين الشهرية — Comprehensive Reports Pack v1.
 *
 * يثبّت ثلاثة أشياء:
 *   (١) دلالات الأعمال: الأعمدة، التصنيف، المجاميع، والمعادلة المغلقة لكل صف.
 *   (٢) عقد المصدر: التقرير يقرأ **جدول وحدة المستحقات وحده** — لا `payroll` ولا
 *       قيدًا محاسبيًا ولا أي جدول آخر.
 *   (٣) الفلاتر: تُترجَم إلى شرط Prisma واحد صريح، وغيابها يعني «الكل» لا نطاقًا ضمنيًا.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    employeeCompensationCalculation: { findMany: vi.fn() },
    payroll: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { reportsService } from '../reports.service';
import { buildEmployeeEntitlementsReport, entitlementStatusAr, type EntitlementCalcRow } from '../employeeEntitlementsReport';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;
const TYPE = 'employee-entitlements-monthly';

function calc(over: Partial<EntitlementCalcRow> = {}): EntitlementCalcRow {
  return {
    employeeId: 53,
    year: 2026,
    month: 8,
    status: 'APPROVED',
    employeeNumberSnapshot: '053',
    employeeNameSnapshot: 'سليمان أحمد',
    jobTitleSnapshot: 'سائق',
    departmentSnapshot: 'السائقين',
    basicSalarySnapshot: 300,
    totalOvertimeAmount: 50.5,
    totalOtherEarnings: 40,
    totalDeductions: 25,
    netAmount: 365.5,
    approvedAt: new Date('2026-09-01T08:30:00.000Z'),
    earningLines: [
      { type: 'BONUS', amount: 10 },
      { type: 'ALLOWANCE', amount: 25 },
      { type: 'EXPENSE_REIMBURSEMENT', amount: 5 },
    ],
    deductionLines: [
      { type: 'ABSENCE', amount: 10 },
      { type: 'DEBT_REPAYMENT', amount: 15 },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.employeeCompensationCalculation.findMany.mockResolvedValue([]);
});

// ── هوية التقرير والأعمدة ────────────────────────────────────────────────────

describe('تقرير مستحقات الموظفين الشهرية — الهوية والأعمدة', () => {
  it('نوع تقرير معروف بعنوانه العربي', async () => {
    const r = await reportsService.build(TYPE, {});
    expect(r.title).toBe('تقرير مستحقات الموظفين الشهرية');
  });

  it('يعرض الأعمدة المطلوبة بالترتيب — بلا أعمدة تقنية داخلية', async () => {
    const r = await reportsService.build(TYPE, {});
    expect(r.columns.map((c) => c.key)).toEqual([
      'employeeNumber', 'employeeName', 'jobTitle', 'department', 'year', 'month',
      'basicSalary', 'overtime', 'bonuses', 'allowances', 'otherEarnings',
      'deductions', 'debtRepaid', 'netAmount', 'status', 'approvedAt',
    ]);
    for (const forbidden of ['id', 'employeeId', 'calculationId', 'hourlyRateSnapshot', 'legalRulesVersion', 'createdAt', 'updatedAt']) {
      expect(r.columns.map((c) => c.key), forbidden).not.toContain(forbidden);
    }
  });

  it('كل عمود نقدي بثلاث منازل عشرية', async () => {
    const r = await reportsService.build(TYPE, {});
    const monetary = ['basicSalary', 'overtime', 'bonuses', 'allowances', 'otherEarnings', 'deductions', 'debtRepaid', 'netAmount'];
    for (const key of monetary) {
      const col = r.columns.find((c) => c.key === key)!;
      expect(col.format, key).toBe('currency');
      expect(col.numFmt, key).toBe('#,##0.000');
    }
  });
});

// ── مصدر البيانات: وحدة المستحقات وحدها ──────────────────────────────────────

describe('مصدر البيانات', () => {
  it('يستعلم جدول حسبات المستحقات وحده — لا الرواتب ولا القيود', async () => {
    await reportsService.build(TYPE, { year: '2026', month: '8' });
    expect(mp.employeeCompensationCalculation.findMany).toHaveBeenCalledTimes(1);
    expect(mp.payroll.findMany).not.toHaveBeenCalled();
    expect(mp.journalEntry.findMany).not.toHaveBeenCalled();
  });

  it('يقرأ اللقطات والإجماليات المخزَّنة فقط — لا سطور تفصيلية غير التصنيف', async () => {
    await reportsService.build(TYPE, {});
    const args = mp.employeeCompensationCalculation.findMany.mock.calls[0][0];
    expect(args.select.basicSalarySnapshot).toBe(true);
    expect(args.select.netAmount).toBe(true);
    expect(args.select.earningLines).toEqual({ select: { type: true, amount: true } });
    expect(args.select.deductionLines).toEqual({ select: { type: true, amount: true } });
    // لا سطور العمل الإضافي ولا الأيام: التقرير يعرض الإجمالي المخزَّن لا التفصيل.
    expect(args.select.overtimeLines).toBeUndefined();
    expect(args.select.overtimeDayEntries).toBeUndefined();
  });
});

// ── الفلاتر ──────────────────────────────────────────────────────────────────

describe('الفلاتر', () => {
  it('بلا فلاتر: شرط فارغ — «كل الفترات» لا نطاق زمني ضمني', async () => {
    await reportsService.build(TYPE, {});
    expect(mp.employeeCompensationCalculation.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('السنة والشهر والموظف والقسم والحالة تُترجَم إلى شرط واحد', async () => {
    await reportsService.build(TYPE, {
      year: '2026', month: '8', employeeId: '53', department: 'السائقين', status: 'APPROVED',
    });
    expect(mp.employeeCompensationCalculation.findMany.mock.calls[0][0].where).toEqual({
      year: 2026,
      month: 8,
      employeeId: 53,
      status: 'APPROVED',
      departmentSnapshot: 'السائقين',
    });
  });

  it('القسم يُفلتَر على لقطة الكشف لا على ملف الموظف الحيّ', async () => {
    await reportsService.build(TYPE, { department: 'الورشة' });
    const where = mp.employeeCompensationCalculation.findMany.mock.calls[0][0].where;
    expect(where.departmentSnapshot).toBe('الورشة');
    expect(where.employee).toBeUndefined();
  });

  it('عند غياب السنة الصريحة تُشتقّ من بداية الفترة العالمية فقط', async () => {
    await reportsService.build(TYPE, { from: '2025-03-01' });
    expect(mp.employeeCompensationCalculation.findMany.mock.calls[0][0].where).toEqual({ year: 2025 });
  });

  it('السنة الصريحة تتقدّم على الفترة العالمية', async () => {
    await reportsService.build(TYPE, { from: '2025-03-01', year: '2026' });
    expect(mp.employeeCompensationCalculation.findMany.mock.calls[0][0].where).toEqual({ year: 2026 });
  });
});

// ── الصفوف والتصنيف ──────────────────────────────────────────────────────────

describe('صفوف التقرير', () => {
  it('يعرض لقطة الموظف لا بياناته الحالية', () => {
    const r = buildEmployeeEntitlementsReport([calc()]);
    expect(r.rows[0]).toMatchObject({
      employeeNumber: '053',
      employeeName: 'سليمان أحمد',
      jobTitle: 'سائق',
      department: 'السائقين',
      basicSalary: 300,
      year: 2026,
      month: 'أغسطس',
    });
  });

  it('يصنّف المكافآت والبدلات ويشتقّ «أخرى» طرحًا من الإجمالي المخزَّن', () => {
    const r = buildEmployeeEntitlementsReport([calc()]);
    expect(r.rows[0]).toMatchObject({ bonuses: 10, allowances: 25, otherEarnings: 5 });
  });

  it('نوع استحقاق غير معروف يظهر في «أخرى» بدل أن يسقط من الجدول', () => {
    const r = buildEmployeeEntitlementsReport([
      calc({ totalOtherEarnings: 60, earningLines: [{ type: 'FUTURE_TYPE', amount: 60 }] }),
    ]);
    expect(r.rows[0]).toMatchObject({ bonuses: 0, allowances: 0, otherEarnings: 60 });
  });

  it('المعادلة مغلقة في كل صف: أساسي + إضافي + استحقاقات − استقطاعات = الصافي', () => {
    const r = buildEmployeeEntitlementsReport([calc()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = r.rows[0] as any;
    const derived = row.basicSalary + row.overtime + row.bonuses + row.allowances + row.otherEarnings - row.deductions;
    expect(derived).toBeCloseTo(row.netAmount, 3);
  });

  it('«الديون المسددة» جزء من الاستقطاعات لا استقطاع إضافي', () => {
    const r = buildEmployeeEntitlementsReport([calc()]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = r.rows[0] as any;
    expect(row.debtRepaid).toBe(15);
    expect(row.debtRepaid).toBeLessThanOrEqual(row.deductions);
  });

  it('يترجم حالة الكشف ويعرض تاريخ الاعتماد بأرقام غربية', () => {
    const r = buildEmployeeEntitlementsReport([calc()]);
    expect(r.rows[0]).toMatchObject({ status: 'معتمد', approvedAt: '01/09/2026' });
    expect(entitlementStatusAr('DRAFT')).toBe('مسودة');
  });

  it('المسودة بلا تاريخ اعتماد تُترك فارغة لا «—»', () => {
    const r = buildEmployeeEntitlementsReport([calc({ status: 'DRAFT', approvedAt: null })]);
    expect(r.rows[0]).toMatchObject({ status: 'مسودة', approvedAt: '' });
  });
});

// ── المجاميع النهائية ────────────────────────────────────────────────────────

describe('المجاميع النهائية', () => {
  const rows = [
    calc(),
    calc({ employeeId: 54, employeeNumberSnapshot: '054', employeeNameSnapshot: 'حسن علي', departmentSnapshot: 'الورشة', status: 'DRAFT', approvedAt: null, basicSalarySnapshot: 200, totalOvertimeAmount: 20, totalOtherEarnings: 0, earningLines: [], deductionLines: [], totalDeductions: 0, netAmount: 220 }),
  ];

  it('صف المجاميع يحمل كل الإجماليات المطلوبة وعدد الموظفين', () => {
    const r = buildEmployeeEntitlementsReport(rows);
    expect(r.totalsRow).toMatchObject({
      employeeName: 'الإجمالي (2 موظف)',
      basicSalary: 500,
      overtime: 70.5,
      bonuses: 10,
      allowances: 25,
      otherEarnings: 5,
      deductions: 25,
      debtRepaid: 15,
      netAmount: 585.5,
    });
  });

  it('عدد الموظفين مميَّز لا عدد كشوف — موظف بشهرين يُعدّ مرة', () => {
    const r = buildEmployeeEntitlementsReport([calc({ month: 7 }), calc({ month: 8 })]);
    expect(r.rows).toHaveLength(2);
    expect(r.totalsRow).toMatchObject({ employeeName: 'الإجمالي (1 موظف)' });
  });

  it('بطاقات المؤشرات تحمل الصافي والاستقطاعات وعدّ المعتمد', () => {
    const r = buildEmployeeEntitlementsReport(rows);
    const byLabel = Object.fromEntries((r.kpis ?? []).map((k) => [k.label, k.value]));
    expect(byLabel['عدد الكشوف']).toBe(2);
    expect(byLabel['إجمالي صافي المستحقات']).toBe(585.5);
    expect(byLabel['إجمالي الاستقطاعات']).toBe(25);
    expect(byLabel['كشوف معتمدة']).toBe(1);
  });
});

// ── الأقسام التحليلية ────────────────────────────────────────────────────────

describe('الأقسام التحليلية', () => {
  it('ملخّص القسم يطابق مجموع الجدول الرئيسي بنيويًا', () => {
    const r = buildEmployeeEntitlementsReport([
      calc(),
      calc({ employeeId: 54, departmentSnapshot: 'الورشة', netAmount: 100, basicSalarySnapshot: 100, totalOvertimeAmount: 0, totalOtherEarnings: 0, totalDeductions: 0, earningLines: [], deductionLines: [] }),
    ]);
    const dept = r.sections!.find((s) => s.title === 'ملخّص المستحقات حسب القسم')!;
    expect(dept.rows).toHaveLength(2);
    expect(dept.totalsRow!.netAmount).toBe(r.totalsRow!.netAmount);
    expect(dept.totalsRow!.statements).toBe(r.rows.length);
  });

  it('ملخّص الحالة يفصل المعتمد عن المسودة بالمجاميع', () => {
    const r = buildEmployeeEntitlementsReport([
      calc(),
      calc({ employeeId: 54, status: 'DRAFT', approvedAt: null, netAmount: 100 }),
    ]);
    const st = r.sections!.find((s) => s.title === 'ملخّص المستحقات حسب حالة الكشف')!;
    expect(st.rows.map((x) => x.status).sort()).toEqual(['مسودة', 'معتمد']);
    expect(st.totalsRow!.netAmount).toBe(r.totalsRow!.netAmount);
  });

  it('بلا صفوف: لا أقسام تحليلية فارغة ولا مجاميع مضلِّلة', () => {
    const r = buildEmployeeEntitlementsReport([]);
    expect(r.rows).toHaveLength(0);
    expect(r.sections).toEqual([]);
    expect(r.totalsRow).toMatchObject({ netAmount: 0, employeeName: 'الإجمالي (0 موظف)' });
  });
});

// ── سطر الفترة ───────────────────────────────────────────────────────────────

describe('سطر الفترة تحت العنوان', () => {
  it('يقول «كل الفترات» صراحةً حين لا سنة ولا شهر', () => {
    const r = buildEmployeeEntitlementsReport([calc()]);
    expect(r.subtitle).toContain('كل الفترات');
  });

  it('يذكر الشهر والسنة والقسم والحالة حين تُطبَّق', () => {
    const r = buildEmployeeEntitlementsReport([calc()], {
      year: 2026, month: 8, department: 'السائقين', status: 'APPROVED',
    });
    expect(r.subtitle).toContain('أغسطس 2026');
    expect(r.subtitle).toContain('القسم: السائقين');
    expect(r.subtitle).toContain('الحالة: معتمد');
  });

  it('يحمل تاريخ ووقت الإصدار حين تُمرَّره الخدمة', () => {
    const r = buildEmployeeEntitlementsReport([calc()], { generatedAt: new Date(2026, 7, 18, 14, 5) });
    expect(r.subtitle).toContain('تاريخ ووقت الإصدار: 18/08/2026 14:05');
  });

  it('عدد الكشوف وعدد الموظفين معلنان في سطر الفترة', () => {
    const r = buildEmployeeEntitlementsReport([calc(), calc({ month: 7 })]);
    expect(r.subtitle).toContain('عدد الكشوف: 2');
    expect(r.subtitle).toContain('عدد الموظفين: 1');
  });
});
