// @vitest-environment jsdom
/**
 * صافي المستحق **نقدًا** — ووحدات العرض في كشوف مستحقات الموظف الشهرية.
 *
 * ═══ ما تحرسه هذه الاختبارات ═══
 * السداد مساران: الأساسي إلى البنك، والإضافي نقدًا في اليد. الكشف الذي يوقّعه الموظف
 * بالاستلام يجب أن يحمل ما يستلمه فعلًا — لا رقمًا يشمل راتبًا وصل حسابه قبل أيام.
 * فالصيغة `cashNet = netAmount − basicSalarySnapshot` مثبَّتة هنا بأرقام حقيقية من
 * الدفعة التاريخية، ومعها أن **القيم المخزَّنة لا تتغيّر** وأن الوحدات المعروضة موحّدة.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import StatementTemplate from '../employee-compensation/StatementTemplate';
import DetailedReportTemplate from '../employee-compensation/DetailedReportTemplate';
import { deriveCashEntitlement } from '../employee-compensation/cashEntitlement';
import { buildStatementQrLines } from '../employee-compensation/statementBilingual';
import { HOUR_UNIT, KD, kd } from '../employee-compensation/units';
import type { DetailedReportData, StatementData } from '../employee-compensation/types';

const plain = (s: string | null | undefined) => (s ?? '').replace(/[⁦-⁩‎‏]/g, '').replace(/\s+/g, ' ').trim();

function statement(over: Partial<StatementData> = {}): StatementData {
  return {
    id: 1, year: 2026, month: 7, status: 'DRAFT',
    approvedAt: null, approvedByName: null, preparedByName: null,
    employee: { code: 'E-001', fullName: 'موظف', jobTitle: null, department: null, nationality: null, civilId: null },
    basicSalary: 150,
    overtime: [],
    earnings: [
      { label: 'إضافي عادي', type: 'CUSTOM', amount: 28, hours: 7, rate: 4 },
      { label: 'راحة أسبوعية', type: 'CUSTOM', amount: 24, hours: 4, rate: 6 },
      { label: 'مصروفات', type: 'CUSTOM', amount: 48, hours: null, rate: null },
    ],
    deductions: [],
    totals: { totalOvertimeAmount: 0, totalOtherEarnings: 100, grossEntitlements: 250, totalDeductions: 0, netAmount: 250 },
    notes: null,
    ...over,
  } as StatementData;
}

// ─── الصيغة ───────────────────────────────────────────────────────────────────

describe('cashNet = netAmount − basicSalarySnapshot', () => {
  const derive = (basicSalary: number, gross: number, deductions: number, net: number) =>
    deriveCashEntitlement({ basicSalary, totals: { grossEntitlements: gross, totalDeductions: deductions, netAmount: net } });

  it('مثال ١ — راتب 150 وإضافي 100 بلا خصم', () => {
    const c = derive(150, 250, 0, 250);
    expect(c.additionalEntitlements).toBe(100);
    expect(c.cashNet).toBe(100);
  });

  it('مثال سليمان — راتب 450 وإضافي 120', () => {
    const c = derive(450, 570, 0, 570);
    expect(c.additionalEntitlements).toBe(120);
    expect(c.cashNet).toBe(120);
  });

  it('مع خصم — الأساسي يُطرح مرة واحدة لا مرتين', () => {
    // 150 أساسي · 100 إضافي · 20 خصم ⇒ المخزَّن 230 ⇒ النقدي 80.
    const c = derive(150, 250, 20, 230);
    expect(c.additionalEntitlements).toBe(100);
    expect(c.totalDeductions).toBe(20);
    expect(c.cashNet).toBe(80);
  });

  it('صفر مستحقات إضافية — لا يُسلَّم شيء نقدًا', () => {
    const c = derive(150, 150, 0, 150);
    expect(c.additionalEntitlements).toBe(0);
    expect(c.cashNet).toBe(0);
  });

  it('خصم يتجاوز الإضافي — الناتج سالب ولا يُقصّ إلى صفر بصمت', () => {
    const c = derive(150, 250, 130, 120);
    expect(c.cashNet).toBe(-30);
  });

  it('يحافظ على دقّة الدينار الثلاثية بلا انحراف كسري', () => {
    const c = derive(150.125, 250.375, 0, 250.375);
    expect(c.additionalEntitlements).toBe(100.25);
    expect(c.cashNet).toBe(100.25);
    expect(kd(c.cashNet)).toContain('100.250');
  });

  it('لا يمسّ القيم المخزَّنة — الدالة خالصة', () => {
    const totals = { grossEntitlements: 250, totalDeductions: 0, netAmount: 250 };
    const snapshot = JSON.stringify(totals);
    deriveCashEntitlement({ basicSalary: 150, totals });
    expect(JSON.stringify(totals)).toBe(snapshot);
  });
});

// ─── الكشف ────────────────────────────────────────────────────────────────────

describe('الكشف الرسمي — مسار السداد والمبلغ النقدي', () => {
  it('يعرض الراتب الأساسي ومعه دلالة التحويل البنكي', () => {
    const text = plain(render(<StatementTemplate data={statement()} />).container.textContent);
    expect(text).toContain('الراتب الأساسي / Basic Salary');
    expect(text).toContain('تم تحويله إلى البنك / Transferred to Bank');
    expect(text).toContain(`150.000 ${KD}`);
  });

  it('السطر النهائي هو «صافي المستحق نقدًا» لا الصافي المخزَّن', () => {
    const { container } = render(<StatementTemplate data={statement()} />);
    const text = plain(container.textContent);
    expect(text).toContain('صافي المستحق نقدًا / Net Cash Entitlement');
    expect(text).not.toContain('صافي المستحق / Net Entitlement');
    const last = plain(container.querySelector('tbody tr:last-child td:last-child')?.textContent);
    expect(last).toBe(`100.000 ${KD}`);
  });

  it('«إجمالي المستحقات الإضافية» يستبعد الأساسي', () => {
    const text = plain(render(<StatementTemplate data={statement()} />).container.textContent);
    expect(text).toContain('إجمالي المستحقات الإضافية / Total Additional Entitlements');
    expect(text).toContain(`100.000 ${KD}`);
    // 250.000 هو الإجمالي المخزَّن شاملًا الأساسي — لا يظهر في الكشف الموقَّع.
    expect(text).not.toContain('250.000');
  });

  it('مثال سليمان — 450 أساسي و120 نقدًا', () => {
    const data = statement({
      basicSalary: 450,
      earnings: [
        { label: 'إضافي عادي', type: 'CUSTOM', amount: 36, hours: 9, rate: 4 },
        { label: 'عطلة رسمية', type: 'CUSTOM', amount: 32, hours: 4, rate: 8 },
        { label: 'مصروفات', type: 'CUSTOM', amount: 52, hours: null, rate: null },
      ],
      totals: { totalOvertimeAmount: 0, totalOtherEarnings: 120, grossEntitlements: 570, totalDeductions: 0, netAmount: 570 },
    });
    const text = plain(render(<StatementTemplate data={data} />).container.textContent);
    expect(text).toContain(`450.000 ${KD}`);
    expect(text).toContain(`120.000 ${KD}`);
    expect(text).not.toContain('570.000');
  });

  it('مع خصم — النقدي 80.000 والأساسي غير مطروح مرتين', () => {
    const data = statement({
      deductions: [{ label: 'سلفة', type: 'ADVANCE', amount: 20 }],
      totals: { totalOvertimeAmount: 0, totalOtherEarnings: 100, grossEntitlements: 250, totalDeductions: 20, netAmount: 230 },
    });
    const text = plain(render(<StatementTemplate data={data} />).container.textContent);
    expect(text).toContain(`100.000 ${KD}`); // الإضافية
    expect(text).toContain('(20.000'); // الاستقطاع بين قوسين
    expect(text).toContain(`80.000 ${KD}`); // النقدي
    expect(text).not.toContain('230.000');
  });

  it('رمز التحقق يحمل الرقم النقدي نفسه — لا المخزَّن', () => {
    const lines = buildStatementQrLines(statement());
    expect(lines[1]).toBe(`صافي المستحق نقدًا / Net Cash Entitlement: 100.000 ${KD}`);
    expect(lines[1]).not.toContain('250.000');
  });

  it('القالب لا يحسب بنفسه — الاشتقاق في وحدة واحدة خارجه', () => {
    const src = readFileSync('src/employee-compensation/StatementTemplate.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const arithmetic of ['grossEntitlements -', 'netAmount -', 'reduce(', '.toFixed(']) {
      expect(src, `القالب يحسب: ${arithmetic}`).not.toContain(arithmetic);
    }
  });
});

// ─── التقرير التفصيلي ─────────────────────────────────────────────────────────

function detailed(): DetailedReportData {
  return {
    ...statement(),
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
    legalRulesVersion: 'KW-LL-6/2010-v2',
    hourlyRate: 0.721,
    hourlyRateBasis: { daysDivisor: 26, hoursPerDay: 8, monthlyHours: 208 },
    companyOvertimeBaseRate: null,
    companyOvertimePolicyVersion: null,
    overtimeLines: [],
    earnings: [
      { label: 'إضافي عادي', type: 'CUSTOM', amount: 28, hours: 7, rate: 4, entryDate: null, reason: null, notes: null, recurring: false },
      { label: 'راحة أسبوعية', type: 'CUSTOM', amount: 24, hours: 4, rate: 6, entryDate: null, reason: null, notes: null, recurring: false },
      { label: 'مصروفات', type: 'CUSTOM', amount: 48, hours: null, rate: null, entryDate: null, reason: null, notes: null, recurring: false },
    ],
    deductions: [],
    warnings: [],
    overtimeDays: [],
    compliance: {
      compliant: true, hasDailyDetail: false, verification: 'FULL' as const, legacyMonths: [],
      regular: { monthHours: 0, monthDays: 0, yearHours: 0, yearHoursFromLegacy: 0, yearDays: 0, annualHoursLimit: 180, annualDaysLimit: 90 },
      weeklyRest: { hours: 0, days: 0, compensatoryPending: 0 },
      officialHoliday: { hours: 0, days: 0, compensatoryPending: 0 },
      violations: [], warnings: [],
    },
    debtRepayments: [],
  } as DetailedReportData;
}

describe('التقرير التفصيلي — نفس الاشتقاق مع إبقاء المرجع المخزَّن', () => {
  it('يعرض صافي المستحق نقدًا وإجمالي المستحقات الإضافية', () => {
    const text = plain(render(<DetailedReportTemplate data={detailed()} />).container.textContent);
    expect(text).toContain('صافي المستحق نقدًا');
    expect(text).toContain('إجمالي المستحقات الإضافية');
    expect(text).toContain('تم تحويله إلى البنك');
  });

  it('لا يعرض الإجمالي ولا الصافي المخزَّنين — لا رقم يشمل الأساسي', () => {
    const text = plain(render(<DetailedReportTemplate data={detailed()} />).container.textContent);
    expect(text).not.toContain('مرجع محفوظ');
    // 250.000 = gross/net المخزَّنان (شاملَي الأساسي) — لا يظهران في أي مستند للمستخدم.
    expect(text).not.toContain('250.000');
    expect(text).not.toContain('صافي محفوظ');
  });

  it('ملخّص الحسبة يعرض المسار النقدي وحده', () => {
    const text = plain(render(<DetailedReportTemplate data={detailed()} />).container.textContent);
    expect(text).toContain('الراتب الأساسي');
    expect(text).toContain('تم تحويله إلى البنك');
    expect(text).toContain('إجمالي المستحقات الإضافية');
    expect(text).toContain('إجمالي الاستقطاعات');
    expect(text).toContain('صافي المستحق نقدًا');
    // لا تسمية «صافي المستحق» مجرَّدة ولا «إجمالي المستحقات» بلا «الإضافية».
    expect(text).not.toMatch(/إجمالي المستحقات(?! الإضافية)/);
  });
});

// ─── وحدات العرض ──────────────────────────────────────────────────────────────

describe('وحدات العرض — KD و hour', () => {
  it('العملة المعروضة KD لا د.ك ولا KWD', () => {
    expect(KD).toBe('KD');
    expect(plain(kd(28))).toBe('28.000 KD');
    const text = plain(render(<StatementTemplate data={statement()} />).container.textContent);
    expect(text).not.toContain('د.ك');
    expect(text).not.toContain('KWD');
  });

  it('وحدة الزمن hour مفردة دائمًا', () => {
    expect(HOUR_UNIT).toBe('hour');
    const text = plain(render(<StatementTemplate data={statement()} />).container.textContent);
    expect(text).toMatch(/إضافي عادي — 7 hour × 4\.000 KD/);
    expect(text).toMatch(/راحة أسبوعية — 4 hour × 6\.000 KD/);
    expect(text).not.toMatch(/\d\s*ساعات?\b/);
    expect(text).not.toMatch(/\d\s*hours\b/);
  });

  it('التقرير التفصيلي بلا وحدات قديمة', () => {
    const text = plain(render(<DetailedReportTemplate data={detailed()} />).container.textContent);
    expect(text).not.toContain('د.ك');
    expect(text).not.toContain('KWD');
    expect(text).not.toMatch(/\d\s*ساعات?\b/);
    expect(text).toContain('(KD)');
  });

  it('لا يغيّر المُنسّق المشترك — بقية النظام تبقى على KWD/د.ك', async () => {
    // الحارس الحقيقي: `formStyles.money` تخدم أربعة عشر نموذجًا إداريًا آخر.
    const shared = readFileSync('src/forms/shared/formStyles.ts', 'utf8');
    expect(shared).toContain('د.ك');
    expect(shared).toContain('KWD');
  });
});
