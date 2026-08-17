// @vitest-environment jsdom
/**
 * حارس دائم — سلامة واجهة وحدة مستحقات الموظف الشهرية.
 *
 * ═══ العيب الذي وُلد منه هذا الملف ═══
 * ظهرت أزرار الوحدة **فارغة**: نصّ أبيض على خلفية بيضاء. السبب لم يكن زرًّا بعينه ولا
 * لونًا مكتوبًا يدويًا، بل أن جذور الصفحات الثلاث كتبت `xpl-page` **بلا** `xpl-scope`.
 * توكينات ExplorerKit (`--xpl-primary` وأخواتها) مُعرَّفة على `.xpl-scope` وحدها، فبقيت
 * غير معرَّفة: `background: var(--xpl-primary)` صار شفافًا بينما `color: #fff` بقي كما هو.
 *
 * الاختبار الأول أدناه يمنع تكرار ذلك بنيويًا — لا بمراجعة بصرية تُنسى.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import DetailedReportTemplate from '../employee-compensation/DetailedReportTemplate';
import { OVERTIME_LABEL_LONG_AR } from '../employee-compensation/labels';
import type { DetailedReportData } from '../employee-compensation/types';

const PAGES = [
  'src/pages/EmployeeCompensation.tsx',
  'src/pages/EmployeeCompensationFile.tsx',
  'src/pages/EmployeeCompensationMonth.tsx',
  'src/pages/EmployeeCompensationDebts.tsx',
  'src/pages/EmployeeCompensationDebtDetail.tsx',
];

const read = (p: string) => readFileSync(p, 'utf8');

describe('تباين الأزرار — السبب المركزي محروس', () => {
  it('كل جذر صفحة يحمل `xpl-scope` مع `xpl-page` — وإلا فقدت التوكينات', () => {
    for (const page of PAGES) {
      const roots = [...read(page).matchAll(/className="([^"]*\bxpl-page\b[^"]*)"/g)].map((m) => m[1]);
      expect(roots.length, `${page}: لا جذر صفحة`).toBeGreaterThan(0);
      for (const cls of roots) {
        expect(cls, `${page}: جذر بلا xpl-scope ⇒ أزرار بيضاء على أبيض — «${cls}»`).toContain('xpl-scope');
      }
    }
  });

  it('لا لون مكتوب يدويًا في CSS الوحدة — التوكينات وحدها', () => {
    const css = read('src/pages/EmployeeCompensation.css').replace(/\/\*[\s\S]*?\*\//g, '');
    // ألوان hex أو rgb حرفية تلتفّ على السمة وتكسر الوضع الداكن.
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    const rgb = css.match(/\brgba?\(/g) ?? [];
    expect(hex, `ألوان hex حرفية في CSS الوحدة: ${hex.join(', ')}`).toEqual([]);
    expect(rgb, 'ألوان rgb حرفية في CSS الوحدة').toEqual([]);
  });

  it('كل تجاوز لفئة ExplorerKit مقيَّد بـ`.ecmp-page` فلا يتسرّب إلى صفحة أخرى', () => {
    const css = read('src/pages/EmployeeCompensation.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const leaked = [...css.matchAll(/^\s*(\.xpl-[\w-]+[^{]*)\{/gm)]
      .map((m) => m[1].trim())
      .filter((sel) => !sel.includes('.ecmp-'));
    expect(leaked, `محدّدات ExplorerKit عالمية:\n${leaked.join('\n')}`).toEqual([]);
  });

  it('لا زر أساسي مكتوب بـ`variant="ghost"` في موضع الإجراء الرئيسي', () => {
    // «فتح الملف» و«حفظ» إجراءان أساسيان — لو صارا ghost بدَوَا معطَّلَين.
    const list = read('src/pages/EmployeeCompensation.tsx');
    expect(list).toMatch(/variant="primary"[\s\S]{0,120}icon="folder_open"/);
    const month = read('src/pages/EmployeeCompensationMonth.tsx');
    expect(month).toMatch(/variant="primary"\s+icon="save"/);
  });
});

describe('كثافة الشاشة', () => {
  it('شبكة الأشهر أربعة أعمدة ثابتة على سطح المكتب — ١٢ شهرًا في ٣ صفوف مكتملة', () => {
    const css = read('src/pages/EmployeeCompensation.css');
    expect(css).toMatch(/\.ecmp-month-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/);
  });

  it('مساحة العمل محدودة العرض فلا تتباعد التسمية عن قيمتها', () => {
    const css = read('src/pages/EmployeeCompensation.css');
    const match = css.match(/\.ecmp-page\s*\{[^}]*max-width:\s*(\d+)px/);
    expect(match, 'لا max-width على .ecmp-page').toBeTruthy();
    const width = Number(match?.[1]);
    expect(width).toBeGreaterThanOrEqual(1180);
    expect(width).toBeLessThanOrEqual(1320);
  });

  it('«الحسبة العكسية» تعيش داخل ترويسة بطاقة العمل الإضافي لا في شريط بعيد', () => {
    const src = read('src/pages/EmployeeCompensationMonth.tsx');
    const cardStart = src.indexOf("title={t('ecmp.section.overtime')}");
    const cardEnd = src.indexOf("padded={false}", cardStart);
    expect(cardStart).toBeGreaterThan(-1);
    expect(src.slice(cardStart, cardEnd)).toContain("t('ecmp.action.reverse')");
  });

  it('الإجراءات الثانوية داخل قائمة لا سبعة أزرار متساوية', () => {
    const src = read('src/pages/EmployeeCompensationMonth.tsx');
    expect(src).toContain('<ActionMenu');
    for (const secondary of ['ecmp.action.preview_detailed', 'ecmp.action.print_detailed', 'ecmp.action.copy_previous', 'ecmp.action.delete']) {
      const idx = src.indexOf(secondary);
      const menuIdx = src.indexOf('<ActionMenu');
      expect(idx, `${secondary} خارج القائمة الثانوية`).toBeGreaterThan(menuIdx);
    }
  });
});

// ─── التقرير التفصيلي — المواد الصحيحة ────────────────────────────────────────

const DETAILED: DetailedReportData = {
  id: 1,
  year: 2026,
  month: 6,
  status: 'APPROVED',
  approvedAt: null,
  approvedByName: null,
  preparedByName: null,
  createdAt: '2026-06-30T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
  legalRulesVersion: 'KW-LL-6/2010-v2',
  employee: { code: 'E-001', fullName: 'موظف', jobTitle: null, department: null, nationality: null, civilId: null },
  basicSalary: 416,
  hourlyRate: 2,
  hourlyRateBasis: { daysDivisor: 26, hoursPerDay: 8, monthlyHours: 208 },
  // سعر شركة أساسي ٤٫٠٠٠ يغلب الحد القانوني في الأنواع الثلاثة: ٤ · ٦ · ٨.
  companyOvertimeBaseRate: 4,
  companyOvertimePolicyVersion: 'MANAR-COP-v1',
  overtimeLines: [
    { overtimeType: 'REGULAR', hours: 4, hourlyRate: 2, multiplier: 1.25, statutoryMinimumRate: 2.5, companyBaseRate: 4, companyDerivedRate: 4, effectiveRate: 4, rateSource: 'COMPANY_POLICY', amount: 16, calculationMethod: 'MANUAL_HOURS', reverseTargetAmount: null, rawHoursBeforeCeiling: null, roundingDifference: null, legalReference: 'قانون العمل الكويتي رقم ٦ لسنة ٢٠١٠ — المادة ٦٦ (الأجر العادي للساعة + ٢٥٪ على الأقل)', notes: null },
    { overtimeType: 'WEEKLY_REST', hours: 4, hourlyRate: 2, multiplier: 1.5, statutoryMinimumRate: 3, companyBaseRate: 4, companyDerivedRate: 6, effectiveRate: 6, rateSource: 'COMPANY_POLICY', amount: 24, calculationMethod: 'MANUAL_HOURS', reverseTargetAmount: null, rawHoursBeforeCeiling: null, roundingDifference: null, legalReference: 'قانون العمل الكويتي رقم ٦ لسنة ٢٠١٠ — المادة ٦٧ (الأجر العادي + ٥٠٪ على الأقل + يوم راحة بديل)', notes: null },
    { overtimeType: 'OFFICIAL_HOLIDAY', hours: 4, hourlyRate: 2, multiplier: 2, statutoryMinimumRate: 4, companyBaseRate: 4, companyDerivedRate: 8, effectiveRate: 8, rateSource: 'COMPANY_POLICY', amount: 32, calculationMethod: 'MANUAL_HOURS', reverseTargetAmount: null, rawHoursBeforeCeiling: null, roundingDifference: null, legalReference: 'قانون العمل الكويتي رقم ٦ لسنة ٢٠١٠ — المادة ٦٨ (أجر مضاعف + يوم راحة بديل)', notes: null },
  ],
  earnings: [],
  deductions: [],
  totals: { totalOvertimeAmount: 72, totalOtherEarnings: 0, grossEntitlements: 488, totalDeductions: 0, netAmount: 488 },
  warnings: [],
  // سجل شهري قديم: بلا تفاصيل يومية — يبقى قابلًا للفتح والطباعة بنفس قيمه.
  overtimeDays: [],
  compliance: {
    compliant: true,
    hasDailyDetail: false,
    // شهر مجمّع: ساعاته معروفة ودخلت الرصيد، وأيامه مجهولة فالتحقّق ناقص.
    verification: 'PARTIAL' as const,
    legacyMonths: [6],
    regular: { monthHours: 4, monthDays: 0, yearHours: 4, yearHoursFromLegacy: 4, yearDays: 0, annualHoursLimit: 180, annualDaysLimit: 90 },
    weeklyRest: { hours: 4, days: 0, compensatoryPending: 0 },
    officialHoliday: { hours: 4, days: 0, compensatoryPending: 0 },
    violations: [],
    warnings: [],
  },
  debtRepayments: [],
  notes: null,
};

describe('التقرير التفصيلي — المواد ٦٦ / ٦٧ / ٦٨', () => {
  it('يعرض مرجع كل نوع كما وصل من المحرّك، بلا خلط', () => {
    const { container } = render(<DetailedReportTemplate data={DETAILED} />);
    const text = container.textContent ?? '';
    expect(text).toContain('المادة ٦٦');
    expect(text).toContain('المادة ٦٧');
    expect(text).toContain('المادة ٦٨');
  });

  it('لا ينسب الأنواع الثلاثة إلى مادة واحدة (عيب v1)', () => {
    const { container } = render(<DetailedReportTemplate data={DETAILED} />);
    const occurrences = (container.textContent ?? '').match(/المادة ٦٦/g) ?? [];
    // مرّة واحدة فقط: سطر الإضافي العادي. وسمُ النوع في القائمة يستخدم «م ٦٦» المختصرة.
    expect(occurrences.length).toBe(1);
  });

  it('أساس أجر الساعة يأتي من البيانات لا مكتوبًا في القالب', () => {
    render(<DetailedReportTemplate data={DETAILED} />);
    expect(screen.getByText(/26 يومًا/)).toBeTruthy();
    expect(screen.getByText(/208 hour شهريًا/)).toBeTruthy();

    const src = read('src/employee-compensation/DetailedReportTemplate.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(src, 'قاسم مكتوب نصًّا داخل القالب').not.toContain('٢٤٠ ساعة');
    expect(src).not.toContain('٣٠ يومًا');
  });

  it('تسميات الأنواع تحمل المادة الصحيحة لكل نوع', () => {
    expect(OVERTIME_LABEL_LONG_AR.REGULAR).toContain('٦٦');
    expect(OVERTIME_LABEL_LONG_AR.WEEKLY_REST).toContain('٦٧');
    expect(OVERTIME_LABEL_LONG_AR.OFFICIAL_HOLIDAY).toContain('٦٨');
  });
});

// ─── سجل المديونيات والسلف ────────────────────────────────────────────────────

describe('سجل المديونيات — الرصيد مشتقّ لا محسوب في الواجهة', () => {
  const DEBT_FILES = [
    'src/pages/EmployeeCompensationDebts.tsx',
    'src/pages/EmployeeCompensationDebtDetail.tsx',
    'src/pages/EmployeeCompensationMonth.tsx',
  ];

  it('لا صفحة تطرح الأصل من المسدَّد بنفسها — الرصيد يصل من الخادم', () => {
    for (const file of DEBT_FILES) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${file}: يحسب الرصيد محليًا`).not.toMatch(/originalAmount\s*-\s*paidAmount/);
      expect(code, `${file}: يحسب الرصيد محليًا`).not.toMatch(/originalAmount\s*-\s*\w*[Pp]aid/);
    }
  });

  it('لا صفحة تستدعي مسار رواتب أو محاسبة', () => {
    for (const file of DEBT_FILES) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const forbidden of ['/payroll', '/salaries', '/accounting', '/transactions', '/expenses']) {
        expect(code, `${file} يستدعي ${forbidden}`).not.toContain(`'${forbidden}`);
      }
    }
  });

  it('كل نداءات السجل تمرّ بـ`compensationApi` لا بـ`api` مباشرةً', () => {
    for (const file of ['src/pages/EmployeeCompensationDebts.tsx', 'src/pages/EmployeeCompensationDebtDetail.tsx']) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${file} ينادي api.* مباشرةً`).not.toMatch(/api\.(get|post|put|delete)\(/);
    }
  });

  it('حركات «حسبة شهرية» لا تُعدَّل ولا تُحذف من شاشة السجل', () => {
    const src = read('src/pages/EmployeeCompensationDebtDetail.tsx');
    // زرّا التعديل والحذف داخل الفرع غير الشهري وحده (`monthly ? … : …`).
    const branch = src.slice(src.indexOf('{monthly && p.calculationPeriod ?'));
    expect(branch).toContain('ecmp.debt.open_calculation');
    expect(branch.indexOf('updateManualPayment') === -1 || branch.indexOf(': (') < branch.indexOf('icon="edit"')).toBe(true);
  });
});

describe('محرّر الشهر — تكامل المديونية', () => {
  const src = read('src/pages/EmployeeCompensationMonth.tsx');

  it('زر «استقطاع من مديونية» داخل بطاقة الاستقطاعات', () => {
    const cardStart = src.indexOf("title={t('ecmp.section.deductions')}");
    const cardEnd = src.indexOf('padded={false}', cardStart);
    expect(cardStart).toBeGreaterThan(-1);
    expect(src.slice(cardStart, cardEnd)).toContain("t('ecmp.debt.deduct_action')");
  });

  it('الرصيد القائم سطر معلومات مضغوط لا لافتة', () => {
    expect(src).toContain('ecmp-inline-info');
    expect(src).toContain("t('ecmp.debt.outstanding_row'");
  });

  it('نوع سطر سداد المديونية غير قابل للتبديل من القائمة', () => {
    // `SELECTABLE_DEDUCTION_TYPES` تستثني `DEBT_REPAYMENT` بنيويًا.
    expect(src).toContain('SELECTABLE_DEDUCTION_TYPES');
    expect(src).not.toMatch(/Object\.keys\(DEDUCTION_LABEL_AR\)/);
  });

  it('سطر السداد يحمل `debtId` صراحةً لا استدلالًا من النصّ', () => {
    expect(src).toMatch(/type:\s*'DEBT_REPAYMENT'[\s\S]{0,200}debtId:\s*debt\.id/);
  });
});

// ─── سعر ساعة الإضافي المعتمد من الشركة ───────────────────────────────────────

describe('سعر الشركة — الواجهة لا تملك السياسة', () => {
  const RATE_FILES = [
    'src/pages/EmployeeCompensationMonth.tsx',
    'src/employee-compensation/CompanyOvertimeRateDialog.tsx',
  ];

  it('لا ملف واجهة يشتقّ سعر نوع بضربه في معامل — الأسعار تصل من الخادم', () => {
    for (const file of RATE_FILES) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      // ضربٌ في ١٫٥ أو ٢ أو ١٫٢٥ داخل React = نسخة ثانية من السياسة تتباعد عن `policy/`.
      expect(code, `${file}: معامل سياسة مضروب في الواجهة`).not.toMatch(/\*\s*1\.5\b/);
      expect(code, `${file}: معامل سياسة مضروب في الواجهة`).not.toMatch(/\*\s*1\.25\b/);
      expect(code, `${file}: معامل قانوني مضروب في الواجهة`).not.toMatch(/hourlyRate\s*\*/);
    }
  });

  it('لا ملف واجهة يقارن سعر الشركة بالقانون بنفسه — الأرضية تُفرض في المحرّك', () => {
    for (const file of RATE_FILES) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${file}: Math.max على الأسعار`).not.toMatch(/Math\.max\([^)]*[Rr]ate/);
      expect(code, `${file}: مقارنة سعرين محليًا`).not.toMatch(/statutoryMinimumRate\s*[<>]/);
    }
  });

  it('شريط السعر يعيش داخل بطاقة العمل الإضافي حيث يُستعمل', () => {
    const src = read('src/pages/EmployeeCompensationMonth.tsx');
    const cardStart = src.indexOf("title={t('ecmp.section.overtime')}");
    const cardEnd = src.indexOf('{overtime.length === 0', cardStart);
    expect(cardStart).toBeGreaterThan(-1);
    expect(src.slice(cardStart, cardEnd)).toContain('<OvertimeRateBar');
  });

  it('المحرّر يرسل سعر الشهر صراحةً في كل حفظ — لا إغفال يُفسَّر «أبقِ المحفوظ»', () => {
    const src = read('src/pages/EmployeeCompensationMonth.tsx');
    expect(src).toMatch(/companyOvertimeBaseRate:\s*appliedRate/);
  });

  it('الحسبة العكسية تُمرَّر سعر الشهر لا الافتراضي العام', () => {
    const src = read('src/pages/EmployeeCompensationMonth.tsx');
    expect(src).toMatch(/companyOvertimeBaseRate=\{appliedRate\}/);
  });
});

describe('التقرير التفصيلي — الأسعار الثلاثة ظاهرة', () => {
  it('يعرض الحد القانوني وسعر الشركة والمستخدم فعليًا معًا', () => {
    const { container } = render(<DetailedReportTemplate data={DETAILED} />);
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('الحد القانوني للساعة');
    expect(text).toContain('سعر الشركة للنوع');
    expect(text).toContain('المستخدم فعليًا');
    // سعر الشركة الأساسي وإصدار سياسته — منفصلان عن إصدار القانون.
    expect(text).toContain('سعر ساعة الإضافي المعتمد من الشركة');
    expect(text).toContain('MANAR-COP-v1');
    expect(text).toContain('KW-LL-6/2010-v2');
  });

  it('شهر بلا سياسة شركة يُقال عنه ذلك صراحةً ولا يُخترع له سعر', () => {
    const legacy: DetailedReportData = {
      ...DETAILED,
      companyOvertimeBaseRate: null,
      companyOvertimePolicyVersion: null,
      overtimeLines: DETAILED.overtimeLines.map((l) => ({
        ...l,
        statutoryMinimumRate: null,
        companyBaseRate: null,
        companyDerivedRate: null,
        effectiveRate: null,
        rateSource: null,
      })),
    };
    const { container } = render(<DetailedReportTemplate data={legacy} />);
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('لا سياسة سعر شركة لهذا الشهر');
  });
});
