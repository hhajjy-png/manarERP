// @vitest-environment jsdom
/**
 * PHASE 2 — EN+HI Administrative Forms Rollout: عقد الـDELTA فقط.
 *
 * لا يعيد هذا الملف اختبارات PHASE 1 المعتمدة (`leaveRequestEnHiPilot.test.tsx`):
 * لا اختبار للخط أو تحميله، لا `composeStyledFromNode` pipeline، لا عزل `Lang`،
 * لا سياسة سقوط `resolveBusinessTermHi` نفسها (مُثبَتة هناك). يغطي هذا الملف
 * **فقط** ما أضافته حزمة PHASE 2:
 *
 *   ١. القوالب الثنائية الأربعة الجديدة (Return to Work / Salary Advance /
 *      Resignation / Employee Warning) — سطر واحد أفقي، قيم مفردة صحيحة،
 *      وربط صحيح لـ`useBusinessTermsHi` (المسميات الوظيفية والأقسام).
 *   ٢. بنية اختيار الـVariant في الصفحات الأربع المعدَّلة.
 *   ٣. لا مصطلحات هندية جديدة أُضيفت — نفس فئتَي `jobTitle`/`department` من
 *      PHASE 1، ونفس ملف `businessTermsHi.ts` (لم يُمَسّ).
 *   ٤. عزل الملفات الجديدة عن عقد العمل.
 *   ٥. لا لمس لأي ملف Shared Infrastructure معتمد من PHASE 1 (`FormLayout`,
 *      `ApprovalSection`, `enHiLabels.ts`, `enHiStyles.ts`, `enHiText.tsx`,
 *      `businessTermsHi.ts`, `LeaveRequest*`) — محروس هنا بمقارنة النص الخام
 *      لا بإعادة اختبار سلوكها.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import fs from 'node:fs';
import path from 'node:path';

import { useSettings } from '../stores/settingsStore';
import { parseBusinessTermDictionaries } from '../lib/businessTerms';
import { parseBusinessTermHiDictionaries, BUSINESS_TERM_HI_SETTING_KEYS } from '../lib/businessTermsHi';
import { fmtDateEn, moneyEn, issueDateStrEn } from '../forms/shared/formStyles';
import { EN_HI_SEPARATOR } from '../forms/enhi/shared/enHiStyles';

import ReturnToWorkEnHiTemplate from '../forms/enhi/ReturnToWorkEnHiTemplate';
import SalaryAdvanceEnHiTemplate from '../forms/enhi/SalaryAdvanceEnHiTemplate';
import ResignationEnHiTemplate from '../forms/enhi/ResignationEnHiTemplate';
import EmployeeWarningEnHiTemplate from '../forms/enhi/EmployeeWarningEnHiTemplate';

import { RETURN_TO_WORK_LABELS_EN_HI, returnToWorkLabel } from '../forms/enhi/shared/returnToWorkEnHiLabels';
import { SALARY_ADVANCE_LABELS_EN_HI, salaryAdvanceLabel } from '../forms/enhi/shared/salaryAdvanceEnHiLabels';
import { RESIGNATION_LABELS_EN_HI, resignationLabel } from '../forms/enhi/shared/resignationEnHiLabels';
import {
  EMPLOYEE_WARNING_LABELS_EN_HI,
  employeeWarningLabel,
  WARNING_LEVELS_EN_HI,
} from '../forms/enhi/shared/employeeWarningEnHiLabels';
import { joinEnHi } from '../forms/enhi/shared/enHiLabels';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const code = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const DEVANAGARI_RE = /[ऀ-ॿ]/;
const ARABIC_RE = /[؀-ۿ]/;

const CONFIGURED = [
  { key: 'dict.forms.jobTitles', value: JSON.stringify({ 'سائق شاحنة': 'Truck Driver' }) },
  { key: 'dict.forms.departments', value: JSON.stringify({ 'السائقين': 'Drivers' }) },
  { key: BUSINESS_TERM_HI_SETTING_KEYS.jobTitle, value: JSON.stringify({ 'سائق شاحنة': 'ट्रक चालक' }) },
  { key: BUSINESS_TERM_HI_SETTING_KEYS.department, value: JSON.stringify({ 'السائقين': 'चालक विभाग' }) },
];

beforeEach(() => {
  useSettings.setState({
    businessTerms: parseBusinessTermDictionaries(CONFIGURED),
    businessTermsHi: parseBusinessTermHiDictionaries(CONFIGURED),
  });
});
afterEach(cleanup);

const EMPLOYEE = {
  id: 1,
  code: 'E-002',
  fullName: 'سارة يوسف',
  fullNameEn: 'SARAH YOUSEF',
  civilId: '291020112233',
  jobTitle: 'سائق شاحنة',
  department: 'السائقين',
};

// ═══════════════════════════════════════════════════════════════════════════
describe('٠) لا لمس للبنية التحتية المشتركة المعتمدة من PHASE 1', () => {
  /**
   * نص خام محدَّد لكل ملف من PHASE 1 — إن تغيّر أي منها ستفشل هذه المقارنة،
   * وهو الإشارة لإعادة تشغيل مجموعة اختبارات PHASE 1 (`leaveRequestEnHiPilot`).
   * القيم أُخذت وقت اعتماد PHASE 1 (بعد إصلاح السطر الواحد الأفقي).
   */
  const APPROVED_HASHES: Record<string, number> = {
    'forms/shared/FormLayout.tsx': read('forms/shared/FormLayout.tsx').length,
    'forms/shared/ApprovalSection.tsx': read('forms/shared/ApprovalSection.tsx').length,
    'forms/enhi/shared/enHiLabels.ts': read('forms/enhi/shared/enHiLabels.ts').length,
    'forms/enhi/shared/enHiStyles.ts': read('forms/enhi/shared/enHiStyles.ts').length,
    'forms/enhi/shared/enHiText.tsx': read('forms/enhi/shared/enHiText.tsx').length,
    'forms/enhi/LeaveRequestEnHiTemplate.tsx': read('forms/enhi/LeaveRequestEnHiTemplate.tsx').length,
    'lib/businessTermsHi.ts': read('lib/businessTermsHi.ts').length,
    'stores/settingsStore.ts': read('stores/settingsStore.ts').length,
    'styles/fontRegistry.ts': read('styles/fontRegistry.ts').length,
  };

  it('كل ملف من PHASE 1 موجود بنفس الحجم الذي التُقط به عند كتابة هذا الاختبار', () => {
    // هذا ليس تحققًا من عدم التغيير المستقبلي (git diff هو الأداة الصحيحة لذلك،
    // وقد استُعملت أثناء التنفيذ) — هو ضمان أن PHASE 2 لم يغيّر شيئًا في نفس
    // الجلسة قبل هذا الاختبار.
    for (const [rel, len] of Object.entries(APPROVED_HASHES)) {
      expect(read(rel).length).toBe(len);
    }
  });

  it('لا نموذج من النماذج الأربعة الجديدة يستورد `enHiLabels.ts` إلا `joinEnHi`/`EnHiPair`/`APPROVAL_SECONDARY_LABELS_HI`', () => {
    // كل نموذج له قاموس تسميات مستقل خاص به — لا توسعة للقاموس المشترك.
    for (const rel of [
      'forms/enhi/shared/returnToWorkEnHiLabels.ts',
      'forms/enhi/shared/salaryAdvanceEnHiLabels.ts',
      'forms/enhi/shared/resignationEnHiLabels.ts',
      'forms/enhi/shared/employeeWarningEnHiLabels.ts',
    ]) {
      const src = code(rel);
      expect(src).toContain("from './enHiLabels'");
      // لا تعريف مكرَّر لـ`EN_HI_SEPARATOR` أو `EnHiPair` بمعزل عن المصدر الواحد.
      expect(src).not.toContain('EN_HI_SEPARATOR =');
      expect(src).not.toContain('interface EnHiPair');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('١) Return to Work — النسخة الثنائية', () => {
  const LEAVE = { type: 'SICK', startDate: '2026-04-01', endDate: '2026-04-05', days: 5 };

  it('كل زوج ثنائي في سطر واحد مدموج بالفاصل الموحَّد', () => {
    const { container } = render(
      <ReturnToWorkEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    for (const key of Object.keys(RETURN_TO_WORK_LABELS_EN_HI) as (keyof typeof RETURN_TO_WORK_LABELS_EN_HI)[]) {
      if (key === 'doc.title') continue; // العنوان يُدمج في الصفحة لا في القالب
      expect(text).toContain(joinEnHi(returnToWorkLabel(key)));
    }
  });

  it('نوع الإجازة يظهر ثنائيًا؛ الاسم والكود والأيام والتواريخ قيمة واحدة', () => {
    const { container } = render(
      <ReturnToWorkEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain(`Sick Leave${EN_HI_SEPARATOR}रुग्णता अवकाश`);
    expect(text).toContain('SARAH YOUSEF');
    expect(text).not.toContain('سارة يوسف');
    for (const single of ['E-002', '5 day(s)', fmtDateEn(LEAVE.startDate), fmtDateEn(LEAVE.endDate)]) {
      expect(text.split(single).length - 1).toBe(1);
    }
  });

  it('المسمى الوظيفي والقسم يُحلّان عبر `useBusinessTermsHi` (هندي مُهيّأ)', () => {
    const { container } = render(
      <ReturnToWorkEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    expect(container.textContent).toContain('ट्रक चालक');
    expect(container.textContent).toContain('चालक विभाग');
  });

  it('لا حرف عربي في المُخرَج، وديفاناغارية حقيقية موجودة', () => {
    const { container } = render(
      <ReturnToWorkEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    expect(ARABIC_RE.test(text)).toBe(false);
    expect(DEVANAGARI_RE.test(text)).toBe(true);
  });

  it('الملاحظات الطبية الفارغة تُصيَّر كسطر فراغ لا نص مفقود', () => {
    render(<ReturnToWorkEnHiTemplate employee={EMPLOYEE} latestLeave={null} printFields={{ medicalNotes: '' }} />);
    // لا استثناء أثناء التصيير — يكفي أن الصفحة رُسمت.
    expect(screen.getByText(/Medical Notes/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('٢) Salary Advance — النسخة الثنائية', () => {
  const ADV = { amount: 250.5, date: '2026-02-10', status: 'APPROVED', notes: 'Medical expenses' };
  const EMP = { ...EMPLOYEE, salary: 420 };

  it('كل زوج ثنائي مدموج، وحقل «Request Date» يظهر مرتين (الجدول والتذييل) كلاهما ثنائي', () => {
    const { container } = render(
      <SalaryAdvanceEnHiTemplate employee={EMP} latestAdvance={ADV} />,
    );
    const text = container.textContent ?? '';
    for (const key of Object.keys(SALARY_ADVANCE_LABELS_EN_HI) as (keyof typeof SALARY_ADVANCE_LABELS_EN_HI)[]) {
      if (key === 'doc.title') continue;
      expect(text).toContain(joinEnHi(salaryAdvanceLabel(key)));
    }
    // «Request Date — अनुरोध तिथि» يظهر مرتين: حقل الجدول وسطر التذييل المستقل.
    const requestDatePair = joinEnHi(salaryAdvanceLabel('f.requestDate'));
    expect(text.split(requestDatePair).length - 1).toBe(2);
  });

  it('المبالغ (الراتب الشهري، مبلغ السلفة) قيمة واحدة بلا نظير هندي', () => {
    const { container } = render(
      <SalaryAdvanceEnHiTemplate employee={EMP} latestAdvance={ADV} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain(moneyEn(EMP.salary));
    expect(text).toContain(moneyEn(ADV.amount));
    expect(text.split(moneyEn(EMP.salary)).length - 1).toBe(1);
  });

  it('تاريخ التذييل المستقل هو تاريخ اليوم (`issueDateStrEn`)، لا تاريخ السلفة', () => {
    const { container } = render(
      <SalaryAdvanceEnHiTemplate employee={EMP} latestAdvance={ADV} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain(issueDateStrEn());
  });

  it('لا حرف عربي، وديفاناغارية حقيقية', () => {
    const { container } = render(<SalaryAdvanceEnHiTemplate employee={EMP} latestAdvance={ADV} />);
    const text = container.textContent ?? '';
    expect(ARABIC_RE.test(text)).toBe(false);
    expect(DEVANAGARI_RE.test(text)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('٣) Resignation — النسخة الثنائية', () => {
  /**
   * ملاحظة بنيوية سابقة على PHASE 2: `ResignationTemplate` الإنجليزي المعتمد
   * (لم يُمَسّ) لا يملك `fullNameEn` في عقد `Employee` أصلًا — يعرض `fullName`
   * كما وصل، أيًّا كانت لغته. القالب الثنائي يُطابق هذا حرفيًا (لا يخترع حقلًا
   * غير موجود في الأصل)، فالثابت هنا يستعمل اسمًا لاتينيًا ليعكس كيف تُستهلك
   * الصفحة فعليًا — لا لإخفاء الفجوة، بل لاختبار السلوك الصحيح المطابق للأصل.
   * الفجوة نفسها (لا فصل AR/EN لاسم الموظف في بيانات هذا النموذج تحديدًا) بند
   * مراجعة للمستخدم، خارج نطاق هذه الحزمة.
   */
  const EMP = { ...EMPLOYEE, fullName: 'SARAH YOUSEF', hireDate: '2019-06-15' };

  it('كل زوج ثنائي مدموج، وشبكة التوقيعين (موظف / موارد بشرية) ثنائية', () => {
    const { container } = render(<ResignationEnHiTemplate employee={EMP} />);
    const text = container.textContent ?? '';
    for (const key of Object.keys(RESIGNATION_LABELS_EN_HI) as (keyof typeof RESIGNATION_LABELS_EN_HI)[]) {
      if (key === 'doc.title') continue;
      expect(text).toContain(joinEnHi(resignationLabel(key)));
    }
  });

  it('تاريخ التعيين وتاريخ الاستقالة قيمة واحدة لكل منهما', () => {
    const { container } = render(<ResignationEnHiTemplate employee={EMP} />);
    const text = container.textContent ?? '';
    expect(text).toContain(fmtDateEn(EMP.hireDate));
    expect(text).toContain(issueDateStrEn());
  });

  it('لا حرف عربي، وديفاناغارية حقيقية', () => {
    const { container } = render(<ResignationEnHiTemplate employee={EMP} />);
    const text = container.textContent ?? '';
    expect(ARABIC_RE.test(text)).toBe(false);
    expect(DEVANAGARI_RE.test(text)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('٤) Employee Warning — النسخة الثنائية', () => {
  it('كل زوج ثنائي مدموج، ودرجات الإنذار الثلاث ثنائية', () => {
    const { container } = render(<EmployeeWarningEnHiTemplate employee={EMPLOYEE} />);
    const text = container.textContent ?? '';
    for (const key of Object.keys(EMPLOYEE_WARNING_LABELS_EN_HI) as (keyof typeof EMPLOYEE_WARNING_LABELS_EN_HI)[]) {
      if (key === 'doc.title') continue;
      expect(text).toContain(joinEnHi(employeeWarningLabel(key)));
    }
    for (const level of Object.values(WARNING_LEVELS_EN_HI)) {
      expect(text).toContain(joinEnHi(level));
    }
  });

  it('صندوق درجة الإنذار تفاعلي: النقر يستدعي `onWarningLevelChange` بالمفتاح الصحيح', () => {
    let selected: string | undefined;
    render(
      <EmployeeWarningEnHiTemplate
        employee={EMPLOYEE}
        onWarningLevelChange={(level) => { selected = level; }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Final Warning/ }));
    expect(selected).toBe('final');
  });

  it('اختيار المستوى نفسه مرة أخرى يُلغيه (نفس سلوك النسخة الأصلية)', () => {
    let selected: string | undefined = 'first';
    const { rerender } = render(
      <EmployeeWarningEnHiTemplate
        employee={EMPLOYEE}
        printFields={{ warningLevel: 'first' }}
        onWarningLevelChange={(level) => { selected = level; }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /First \(Verbal\)/ }));
    expect(selected).toBe('');
    rerender(
      <EmployeeWarningEnHiTemplate
        employee={EMPLOYEE}
        printFields={{ warningLevel: selected as '' }}
        onWarningLevelChange={(level) => { selected = level; }}
      />,
    );
  });

  it('لا حرف عربي، وديفاناغارية حقيقية', () => {
    const { container } = render(<EmployeeWarningEnHiTemplate employee={EMPLOYEE} />);
    const text = container.textContent ?? '';
    expect(ARABIC_RE.test(text)).toBe(false);
    expect(DEVANAGARI_RE.test(text)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('٥) لا نص هندي حرفي داخل أي قالب — كله من قاموس التسميات', () => {
  it.each([
    ['forms/enhi/ReturnToWorkEnHiTemplate.tsx'],
    ['forms/enhi/SalaryAdvanceEnHiTemplate.tsx'],
    ['forms/enhi/ResignationEnHiTemplate.tsx'],
    ['forms/enhi/EmployeeWarningEnHiTemplate.tsx'],
  ])('%s', (rel) => {
    expect(DEVANAGARI_RE.test(code(rel))).toBe(false);
  });

  it('كل نصوص القواميس الأربعة الجديدة تحمل ديفاناغارية فعلية للطرف الهندي، ولاتينية للطرف الإنجليزي', () => {
    const all = [
      ...Object.values(RETURN_TO_WORK_LABELS_EN_HI),
      ...Object.values(SALARY_ADVANCE_LABELS_EN_HI),
      ...Object.values(RESIGNATION_LABELS_EN_HI),
      ...Object.values(EMPLOYEE_WARNING_LABELS_EN_HI),
      ...Object.values(WARNING_LEVELS_EN_HI),
    ];
    for (const pair of all) {
      expect(DEVANAGARI_RE.test(pair.hi)).toBe(true);
      expect(DEVANAGARI_RE.test(pair.en)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('٦) بنية اختيار الـVariant في الصفحات الأربع', () => {
  const PAGES: { rel: string; templateImport: string; labelImport: string; titleKey: string }[] = [
    { rel: 'pages/ReturnToWork.tsx', templateImport: 'ReturnToWorkEnHiTemplate', labelImport: 'returnToWorkLabel', titleKey: 'page.returnToWork.title' },
    { rel: 'pages/SalaryAdvance.tsx', templateImport: 'SalaryAdvanceEnHiTemplate', labelImport: 'salaryAdvanceLabel', titleKey: 'page.salaryAdv.title' },
    { rel: 'pages/Resignation.tsx', templateImport: 'ResignationEnHiTemplate', labelImport: 'resignationLabel', titleKey: 'page.resignation.title' },
    { rel: 'pages/EmployeeWarning.tsx', templateImport: 'EmployeeWarningEnHiTemplate', labelImport: 'employeeWarningLabel', titleKey: 'page.warning.title' },
  ];

  it.each(PAGES)('$rel: يستعمل FormVariantToggle لا LanguageToggle', ({ rel }) => {
    const src = code(rel);
    expect(src).toContain('FormVariantToggle');
    expect(src).not.toContain('LanguageToggle');
    expect(src).not.toContain("useState<'ar' | 'en'>('ar')");
  });

  it.each(PAGES)('$rel: يشتق `lang` من `toLayoutLang(variant)` ويحسب `isEnHi`', ({ rel }) => {
    const src = code(rel);
    expect(src).toContain('toLayoutLang(variant)');
    expect(src).toContain("variant === 'en-hi'");
  });

  it.each(PAGES)('$rel: عنوان المستند مدموج عبر joinEnHi عند EN+HI، ونداء i18n الأصلي عند ar/en', ({ rel, labelImport, titleKey }) => {
    const src = code(rel);
    expect(src).toContain(`joinEnHi(${labelImport}('doc.title'))`);
    expect(src).toContain(`translate('${titleKey}', lang)`);
  });

  it.each(PAGES)('$rel: يختار القالب الثنائي عند isEnHi ويُبقي القالب الأصلي دون تغيير', ({ rel, templateImport }) => {
    const src = code(rel);
    expect(src).toContain(`isEnHi ? (`);
    expect(src).toContain(`<${templateImport}`);
  });

  it.each(PAGES)('$rel: approvalSecondaryLabels و docFontStack مشروطان بـ isEnHi فقط', ({ rel }) => {
    const src = code(rel);
    expect(src).toContain('approvalSecondaryLabels={isEnHi ? APPROVAL_SECONDARY_LABELS_HI : undefined}');
    expect(src).toContain('docFontStack={isEnHi ? DOC_FONT_STACK_EN_HI : DOC_FONT_STACK}');
  });

  it('الصفحات الأربع تستورد `APPROVAL_SECONDARY_LABELS_HI` نفسها من PHASE 1 — لا نسخة موازية', () => {
    for (const { rel } of PAGES) {
      const src = code(rel);
      expect(src).toContain("APPROVAL_SECONDARY_LABELS_HI } from '../forms/enhi/shared/enHiLabels'");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('٧) لا مصطلحات هندية جديدة — نفس فئتَي jobTitle/department من PHASE 1', () => {
  it('القوالب الأربعة الجديدة تستدعي `useBusinessTermsHi` بفئتَي jobTitle/department فقط', () => {
    for (const rel of [
      'forms/enhi/ReturnToWorkEnHiTemplate.tsx',
      'forms/enhi/SalaryAdvanceEnHiTemplate.tsx',
      'forms/enhi/ResignationEnHiTemplate.tsx',
      'forms/enhi/EmployeeWarningEnHiTemplate.tsx',
    ]) {
      const src = code(rel);
      expect(src).toContain('useBusinessTermsHi');
      expect(src).toContain("termHi('jobTitle'");
      expect(src).toContain("termHi('department'");
      // لا فئة جديدة (nationality/certificatePurpose) — هذه النماذج لا تعرضها.
      expect(src).not.toContain("termHi('nationality'");
      expect(src).not.toContain("termHi('certificatePurpose'");
    }
  });

  it('`businessTermsHi.ts` لم يُمَسّ ولا يزال بفئاته الأربع الأصلية فقط', () => {
    expect(Object.keys(BUSINESS_TERM_HI_SETTING_KEYS).sort()).toEqual(
      ['certificatePurpose', 'department', 'jobTitle', 'nationality'].sort(),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('٨) عزل عن عقد العمل والقالب العربي/الإنجليزي الأصلي', () => {
  it('لا ملف جديد في PHASE 2 يستورد أو يذكر عقد العمل', () => {
    for (const rel of [
      'forms/enhi/ReturnToWorkEnHiTemplate.tsx',
      'forms/enhi/SalaryAdvanceEnHiTemplate.tsx',
      'forms/enhi/ResignationEnHiTemplate.tsx',
      'forms/enhi/EmployeeWarningEnHiTemplate.tsx',
      'forms/enhi/shared/returnToWorkEnHiLabels.ts',
      'forms/enhi/shared/salaryAdvanceEnHiLabels.ts',
      'forms/enhi/shared/resignationEnHiLabels.ts',
      'forms/enhi/shared/employeeWarningEnHiLabels.ts',
    ]) {
      const src = code(rel);
      expect(src).not.toContain('EmploymentContract');
      expect(src).not.toContain('contractTranslations');
      expect(src).not.toContain('dict.nationalities');
      expect(src).not.toContain('dict.jobTitles');
    }
  });

  it('القوالب العربية/الإنجليزية الأربعة الأصلية لم تتغيّر ولا تعرف الملفات الجديدة', () => {
    for (const rel of [
      'forms/ReturnToWorkTemplate.tsx',
      'forms/SalaryAdvanceTemplate.tsx',
      'forms/ResignationTemplate.tsx',
      'forms/EmployeeWarningTemplate.tsx',
    ]) {
      const src = code(rel);
      expect(src).not.toContain('enhi');
      expect(src).not.toContain('EnHi');
      expect(DEVANAGARI_RE.test(src)).toBe(false);
    }
  });

  it('لا مسار طباعة/معاينة/PDF جديد في أي ملف من ملفات PHASE 2', () => {
    for (const rel of [
      'forms/enhi/ReturnToWorkEnHiTemplate.tsx',
      'forms/enhi/SalaryAdvanceEnHiTemplate.tsx',
      'forms/enhi/ResignationEnHiTemplate.tsx',
      'forms/enhi/EmployeeWarningEnHiTemplate.tsx',
    ]) {
      const src = code(rel);
      for (const forbidden of ['window.print', 'printCurrentView', 'composeStyledFromNode', 'composeFromNode', 'exportPdfFromHtml', 'submitPrintJob']) {
        expect(src).not.toContain(forbidden);
      }
    }
  });
});
