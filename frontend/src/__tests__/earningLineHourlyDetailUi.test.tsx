// @vitest-environment jsdom
/**
 * تفصيل الساعة على بنود الاستحقاقات — ما يراه المستخدم.
 *
 * ═══ الالتباس الذي وُلد منه هذا الملف ═══
 * السجلات التاريخية تحمل بنودًا بعناوين قانونية الاسم («إضافي عادي»، «راحة أسبوعية»،
 * «عطلة رسمية») وبساعاتٍ في تفصيلها — لكنها **بنود مالية بلا تواريخ**، لا أيام عمل
 * مسجّلة. لو ظهرت فوقها شارة «✓ ضمن الحدود» الخضراء لقرأها المستخدم تصديقًا قانونيًا
 * على تلك الساعات، وهي لم تُفحص ولا يمكن أن تُفحص. الاختبارات أدناه تحرس الأمرين معًا:
 * أن الساعة والسعر يظهران في عمودين واضحين، وأن الشارة الخضراء لا تظهر بلا سجل يومي.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import DetailedReportTemplate from '../employee-compensation/DetailedReportTemplate';
import StatementTemplate from '../employee-compensation/StatementTemplate';
import { ComplianceBar } from '../employee-compensation/OvertimeDailyLedger';
import type { DetailedReportData, OvertimeCompliance, StatementData } from '../employee-compensation/types';

const EMPLOYEE = { code: 'E-001', fullName: 'موظف', jobTitle: null, department: null, nationality: null, civilId: null };

/**
 * `money()` تُغلّف الرقم بمعزولات bidi وتُلحق به «د.ك». التأكيدات هنا تُقارن **الرقم**
 * لا التغليف: حارسٌ يكسر عند تغيير محرف اتجاهي غير مرئي يحرس التنسيق لا المعنى.
 */
const plain = (s: string | null | undefined) => (s ?? '').replace(/[⁦-⁩‎‏]/g, '').replace(/\s*(د\.ك|KD)\s*/g, ' ').trim();

/** بنود الدفعة التاريخية كما هي: ثلاثة بساعات واثنان ماليان بحتان. */
const EARNINGS = [
  { label: 'إضافي عادي', amount: 28, hours: 7, rate: 4 },
  { label: 'راحة أسبوعية', amount: 24, hours: 4, rate: 6 },
  { label: 'عطلة رسمية', amount: 32, hours: 4, rate: 8 },
  { label: 'مصروفات', amount: 42, hours: null, rate: null },
  { label: 'مكافأة', amount: 20, hours: null, rate: null },
];

const STATEMENT: StatementData = {
  id: 1,
  year: 2026,
  month: 6,
  status: 'DRAFT',
  approvedAt: null,
  approvedByName: null,
  preparedByName: null,
  employee: EMPLOYEE,
  basicSalary: 150,
  overtime: [],
  earnings: EARNINGS.map((e) => ({ ...e, type: 'CUSTOM' as const })),
  deductions: [],
  totals: {
    totalOvertimeAmount: 0,
    totalOtherEarnings: 146,
    grossEntitlements: 296,
    totalDeductions: 0,
    netAmount: 296,
  },
  notes: null,
};

const DETAILED: DetailedReportData = {
  ...STATEMENT,
  createdAt: '2026-06-30T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
  legalRulesVersion: 'KW-LL-6/2010-v2',
  hourlyRate: 0.721,
  hourlyRateBasis: { daysDivisor: 26, hoursPerDay: 8, monthlyHours: 208 },
  companyOvertimeBaseRate: null,
  companyOvertimePolicyVersion: null,
  overtimeLines: [],
  earnings: EARNINGS.map((e) => ({
    ...e, type: 'CUSTOM' as const, entryDate: null, reason: null, notes: null, recurring: false,
  })),
  deductions: [],
  warnings: [],
  overtimeDays: [],
  compliance: {
    compliant: true,
    hasDailyDetail: false,
    verification: 'FULL' as const,
    legacyMonths: [],
    regular: { monthHours: 0, monthDays: 0, yearHours: 0, yearHoursFromLegacy: 0, yearDays: 0, annualHoursLimit: 180, annualDaysLimit: 90 },
    weeklyRest: { hours: 0, days: 0, compensatoryPending: 0 },
    officialHoliday: { hours: 0, days: 0, compensatoryPending: 0 },
    violations: [],
    warnings: [],
  },
  debtRepayments: [],
} as DetailedReportData;

describe('التقرير التفصيلي — عمودا الساعات وسعر الساعة', () => {
  it('يعرض عمودَي «الساعات» و«سعر الساعة» في جدول الاستحقاقات', () => {
    const text = render(<DetailedReportTemplate data={DETAILED} />).container.textContent ?? '';
    expect(text).toContain('الساعات');
    expect(text).toContain('سعر الساعة');
  });

  it('يعرض ساعة البند وسعره ومبلغه كما وصلت — بلا إعادة حساب', () => {
    const rows = render(<DetailedReportTemplate data={DETAILED} />).container.querySelectorAll('tbody tr');
    const cells = (i: number) => Array.from(rows[i].querySelectorAll('td')).map((c) => plain(c.textContent));
    // النوع · البند · الساعات · سعر الساعة · سبب الصرف · المبلغ
    expect(cells(0)).toEqual(expect.arrayContaining(['إضافي عادي', '7', '4.000', '28.000']));
    expect(cells(1)).toEqual(expect.arrayContaining(['راحة أسبوعية', '4', '6.000', '24.000']));
    expect(cells(2)).toEqual(expect.arrayContaining(['عطلة رسمية', '4', '8.000', '32.000']));
  });

  it('يعرض «—» للبنود المالية البحتة لا صفرًا يُقرأ قياسًا', () => {
    const rows = render(<DetailedReportTemplate data={DETAILED} />).container.querySelectorAll('tbody tr');
    const expense = Array.from(rows[3].querySelectorAll('td')).map((c) => plain(c.textContent));
    expect(expense).toContain('مصروفات');
    // عمودا الساعة والسعر كلاهما «—» — لا صفر ولا فراغ.
    expect(expense.filter((c) => c === '—')).toHaveLength(3); // الساعات · السعر · سبب الصرف
    expect(expense).not.toContain('0');
    expect(expense).toContain('42.000');
  });

  it('يبقي مجموع الاستحقاقات الأخرى على قيمته بعد إضافة العمودين', () => {
    const text = plain(render(<DetailedReportTemplate data={DETAILED} />).container.textContent);
    expect(text).toContain('146.000');
  });
});

describe('الكشف المختصر — تفصيل الساعة سطرًا لا عمودين', () => {
  it('يُلحق «٧ ساعة × ٤٫٠٠٠» باسم البند ويبقي المبلغ في عموده', () => {
    const text = plain(render(<StatementTemplate data={STATEMENT} />).container.textContent);
    expect(text).toMatch(/إضافي عادي — 7 hour × 4\.000/);
    expect(text).toMatch(/راحة أسبوعية — 4 hour × 6\.000/);
    expect(text).toMatch(/عطلة رسمية — 4 hour × 8\.000/);
    expect(text).toContain('28.000');
  });

  it('لا يُلحق شيئًا بالبنود المالية البحتة', () => {
    const text = plain(render(<StatementTemplate data={STATEMENT} />).container.textContent);
    // «مصروفات» يليها مبلغها مباشرةً بلا شرطة ولا علامة ضرب.
    expect(text).toMatch(/مصروفات\s*42\.000/);
    expect(text).toMatch(/مكافأة\s*20\.000/);
  });

  it('يبقى بعمودين — لا يُضاف عمود ثالث إلى الكشف الموقَّع', () => {
    const { container } = render(<StatementTemplate data={STATEMENT} />);
    const widest = Math.max(...Array.from(container.querySelectorAll('tr')).map((r) => r.querySelectorAll('td,th').length));
    expect(widest).toBe(2);
  });
});

// ─── شريط الالتزام: حالة «لا ساعات مسجّلة» ────────────────────────────────────

const ZERO_COMPLIANCE: OvertimeCompliance = DETAILED.compliance;

describe('ComplianceBar — شهر بلا أي عمل إضافي مسجَّل', () => {
  it('لا يعرض شارة «ضمن الحدود» الخضراء', () => {
    const { container } = render(<ComplianceBar compliance={ZERO_COMPLIANCE} hasAnyOvertime={false} />);
    expect(container.textContent).not.toContain('ضمن الحدود');
    expect(container.querySelector('.ecmp-cmp-ok')).toBeNull();
  });

  it('لا يعرض تحذيرًا أحمر ولا شارة مخالفة', () => {
    const { container } = render(<ComplianceBar compliance={ZERO_COMPLIANCE} hasAnyOvertime={false} />);
    expect(container.querySelector('.ecmp-cmp-bad')).toBeNull();
    expect(container.querySelector('.ecmp-cmp-warn')).toBeNull();
    expect(container.querySelector('.ecmp-cmp-badge')).toBeNull();
  });

  it('يعرض النصّ المحايد بدلًا منها', () => {
    const { container } = render(<ComplianceBar compliance={ZERO_COMPLIANCE} hasAnyOvertime={false} />);
    expect(container.textContent).toContain('لا توجد ساعات إضافية يومية مسجلة للتحقق');
  });

  it('يعود إلى الشريط الطبيعي حين توجد ساعات فعلية', () => {
    const withHours: OvertimeCompliance = {
      ...ZERO_COMPLIANCE,
      hasDailyDetail: true,
      regular: { ...ZERO_COMPLIANCE.regular, monthHours: 4, monthDays: 2, yearHours: 4, yearDays: 2 },
    };
    const { container } = render(<ComplianceBar compliance={withHours} hasAnyOvertime />);
    expect(container.textContent).toContain('ضمن الحدود');
    expect(container.textContent).not.toContain('لا توجد ساعات إضافية يومية مسجلة');
  });

  it('يحافظ على سلوكه السابق حين لا تُمرَّر الخاصية أصلًا', () => {
    const { container } = render(<ComplianceBar compliance={ZERO_COMPLIANCE} />);
    expect(container.querySelector('.ecmp-cmp-badge')).not.toBeNull();
  });
});

// ─── حراسة بنيوية على شاشة الشهر ──────────────────────────────────────────────

describe('شاشة الشهر — الأعمدة والربط', () => {
  const page = readFileSync('src/pages/EmployeeCompensationMonth.tsx', 'utf8');

  it('ترويسة جدول الاستحقاقات تحمل الساعات وسعر الساعة', () => {
    expect(page).toContain("t('ecmp.col.hours')");
    expect(page).toContain("t('ecmp.col.hourly_rate')");
  });

  it('الخانة الفارغة تُرسَل `null` لا صفرًا', () => {
    expect(page).toMatch(/hours:\s*r\.hours\.trim\(\)\s*\?\s*toNumber\(r\.hours\)\s*:\s*null/);
    expect(page).toMatch(/rate:\s*r\.rate\.trim\(\)\s*\?\s*toNumber\(r\.rate\)\s*:\s*null/);
  });

  it('ساعات بنود الاستحقاقات لا تُغذّي شريط الالتزام', () => {
    // الشرط يقرأ `overtimeDays` و`overtime` وحدهما — لا `earnings`.
    const call = page.slice(page.indexOf('<ComplianceBar'), page.indexOf('<ComplianceBar') + 400);
    expect(call).toContain('overtimeDays.length > 0');
    expect(call).not.toContain('earnings');
  });
});
