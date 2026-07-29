// @vitest-environment jsdom
/**
 * EN + हिन्दी Template Pilot v1 — العقد الذي تحرسه هذه الاختبارات.
 *
 *   1. لا انحدار في «طلب الإجازة»: النسختان AR و EN تُصيَّران كما كانتا،
 *      وملف القالب القائم لم يُمَسّ (لا `en-hi` ولا ديفاناغارية داخله).
 *   2. النسخة الثنائية تعرض ديفاناغارية **حقيقية** (نقاط ترميز U+0900–U+097F)
 *      في التسميات وترويسات الأقسام وقيم التعداد وتسميات التواقيع.
 *   3. القيم المفردة تبقى مفردة: الاسم لاتيني، والأكواد والتواريخ والأرقام
 *      قيمة واحدة بلا نظير هندي.
 *   4. القيم الديناميكية تتبع سياسة السقوط المركزية: Hindi → English → العربية.
 *   5. عزل تام عن عقد العمل — لا استيراد ولا تقاطع مساحات مفاتيح.
 *   6. `Lang` لم يتوسّع إلى `'hi'`.
 *   7. الخط: `@font-face` للديفاناغارية معلَن محليًا، والسلسلة تضعه بعد Cairo،
 *      وقاعدة الخط تصل المستند المُركَّب (نفس مسار المعاينة الدقيقة و PDF).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import fs from 'node:fs';
import path from 'node:path';

import { useSettings } from '../stores/settingsStore';
import { parseBusinessTermDictionaries } from '../lib/businessTerms';
import {
  BUSINESS_TERM_HI_SETTING_KEYS,
  parseBusinessTermHiDictionaries,
  resolveBusinessTermHi,
  defaultBusinessTermHiDictionaries,
} from '../lib/businessTermsHi';
import { DOC_FONT_STACK, DOC_FONT_STACK_EN_HI, DEVANAGARI_FONT_FAMILY } from '../styles/fontRegistry';
import { FORM_DOC_VARIANTS, toLayoutLang } from '../forms/shared/formVariant';

import LeaveRequestTemplate from '../forms/LeaveRequestTemplate';
import LeaveRequestEnHiTemplate from '../forms/enhi/LeaveRequestEnHiTemplate';
import {
  LEAVE_REQUEST_LABELS_EN_HI,
  LEAVE_TYPES_EN_HI,
  APPROVAL_SECONDARY_LABELS_HI,
  joinEnHi,
  leaveRequestLabel,
} from '../forms/enhi/shared/enHiLabels';
import { EN_HI_SEPARATOR } from '../forms/enhi/shared/enHiStyles';
import ApprovalSection from '../forms/shared/ApprovalSection';

const SRC = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/**
 * الشيفرة وحدها بلا تعليقات.
 *
 * عقود العزل أدناه تتكلّم عن **ما يفعله الكود**، لا عمّا يشرحه. وملفات هذه
 * المرحلة توثّق قراراتها بالاسم عمدًا («لماذا لا نستورد `contractTranslations`»،
 * «القالب الثنائي English + हिन्दी») — فمطابقة نصية على الملف الخام كانت ستُفشل
 * التوثيق نفسه الذي يجعل القرار قابلًا للمراجعة. لذلك نُجرّد التعليقات أولًا.
 */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** نطاق الديفاناغارية في يونيكود. */
const DEVANAGARI_RE = /[ऀ-ॿ]/;

const EMPLOYEE = {
  id: 1,
  code: 'E-001',
  fullName: 'محمد أحمد',
  fullNameEn: 'MOHAMMED AHMED',
  civilId: '290010112345',
  jobTitle: 'سائق شاحنة',
  department: 'السائقين',
  salary: 350,
};

const LEAVE = {
  type: 'ANNUAL',
  startDate: '2026-03-01',
  endDate: '2026-03-10',
  days: 10,
  reason: 'Family matters',
};

/** قاموس مُهيّأ من «إعدادات الشركة»: إنجليزي لكليهما، هندي للمسمى الوظيفي وحده. */
const CONFIGURED = [
  { key: 'dict.forms.jobTitles', value: JSON.stringify({ 'سائق شاحنة': 'Truck Driver' }) },
  { key: 'dict.forms.departments', value: JSON.stringify({ 'السائقين': 'Drivers' }) },
  { key: BUSINESS_TERM_HI_SETTING_KEYS.jobTitle, value: JSON.stringify({ 'سائق شاحنة': 'ट्रक चालक' }) },
];

function loadDictionaries(rows: { key: string; value: string }[]) {
  useSettings.setState({
    businessTerms: parseBusinessTermDictionaries(rows),
    businessTermsHi: parseBusinessTermHiDictionaries(rows),
  });
}

beforeEach(() => loadDictionaries(CONFIGURED));
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────────────
describe('١) لا انحدار في القالب القائم', () => {
  it('النسخة العربية تُصيَّر بالعربية كما كانت', () => {
    render(<LeaveRequestTemplate employee={EMPLOYEE} latestLeave={LEAVE} lang="ar" />);
    expect(screen.getByText('بيانات الموظف')).toBeInTheDocument();
    expect(screen.getByText('تفاصيل طلب الإجازة')).toBeInTheDocument();
    expect(screen.getByText('إجازة سنوية')).toBeInTheDocument();
    expect(screen.getByText('محمد أحمد')).toBeInTheDocument();
  });

  it('النسخة الإنجليزية تُصيَّر بالإنجليزية كما كانت', () => {
    render(<LeaveRequestTemplate employee={EMPLOYEE} latestLeave={LEAVE} lang="en" />);
    expect(screen.getByText('Employee Information')).toBeInTheDocument();
    expect(screen.getByText('Leave Request Details')).toBeInTheDocument();
    expect(screen.getByText('Annual Leave')).toBeInTheDocument();
    expect(screen.getByText('Truck Driver')).toBeInTheDocument();
    expect(screen.getByText('Drivers')).toBeInTheDocument();
  });

  it('ملف القالب القائم لم يُمَسّ: لا `en-hi` ولا أي حرف ديفاناغاري فيه', () => {
    const src = read('forms/LeaveRequestTemplate.tsx');
    expect(src).not.toContain('en-hi');
    expect(src).not.toContain('EnHi');
    expect(DEVANAGARI_RE.test(src)).toBe(false);
    // الفرعان القائمان ما زالا على حالهما.
    expect(src).toContain("if (lang === 'en')");
  });

  it('القالب الثنائي ملف مستقل: القالب القائم لا يستورده ولا يعرفه', () => {
    const src = read('forms/LeaveRequestTemplate.tsx');
    expect(src).not.toContain('enhi');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('٢) النسخة الثنائية تعرض ديفاناغارية حقيقية', () => {
  it('ترويسات الأقسام تحمل الإنجليزية والهندية معًا', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Employee Information');
    expect(text).toContain('कर्मचारी विवरण');
    expect(text).toContain('Leave Request Details');
    expect(text).toContain('अवकाश अनुरोध विवरण');
  });

  it('التسميات إنجليزية أولًا ثم الفاصل ثم الهندية — في سطر واحد', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    for (const [en, hi] of [
      ['Name', 'नाम'],
      ['Employee ID', 'कर्मचारी संख्या'],
      ['Civil ID', 'सिविल आईडी'],
      ['Job Title', 'पद'],
      ['Department', 'विभाग'],
      ['Leave Type', 'अवकाश का प्रकार'],
      ['Start Date', 'प्रारंभ तिथि'],
      ['End Date', 'समाप्ति तिथि'],
      ['Days', 'दिनों की संख्या'],
      ['Reason', 'कारण'],
      ['Expected Return Date', 'अपेक्षित वापसी तिथि'],
    ]) {
      expect(text).toContain(en);
      expect(text).toContain(hi);
      // الإنجليزية قبل الهندية في ترتيب المستند.
      expect(text.indexOf(en)).toBeLessThan(text.indexOf(hi));
    }
  });

  it('قيمة التعداد (نوع الإجازة) ثنائية', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Annual Leave');
    expect(text).toContain('वार्षिक अवकाश');
  });

  it('تسمية توقيع الموظف ثنائية', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Employee Signature:');
    expect(text).toContain('कर्मचारी हस्ताक्षर:');
  });

  it('فقرة التعهد ثنائية', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('I hereby request the above-mentioned leave');
    expect(text).toContain('मैं एतद्द्वारा उपर्युक्त अवकाश का अनुरोध');
  });

  it('لا حرف عربي واحد في النسخة الثنائية', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    expect(/[؀-ۿ]/.test(container.textContent ?? '')).toBe(false);
  });

  it('لا نص هندي حرفي داخل القالب — كله من القاموس المركزي', () => {
    expect(DEVANAGARI_RE.test(code('forms/enhi/LeaveRequestEnHiTemplate.tsx'))).toBe(false);
    expect(read('forms/enhi/LeaveRequestEnHiTemplate.tsx')).toContain('enHiLabels');
  });

  it('كل نصوص القاموس الهندي تحمل ديفاناغارية فعلية لا لاتينية منقحرة', () => {
    for (const pair of Object.values(LEAVE_REQUEST_LABELS_EN_HI) as { en: string; hi: string }[]) {
      expect(DEVANAGARI_RE.test(pair.hi)).toBe(true);
      expect(DEVANAGARI_RE.test(pair.en)).toBe(false);
    }
    for (const pair of Object.values(LEAVE_TYPES_EN_HI) as { en: string; hi: string }[]) {
      expect(DEVANAGARI_RE.test(pair.hi)).toBe(true);
    }
    for (const hi of Object.values(APPROVAL_SECONDARY_LABELS_HI) as string[]) {
      expect(DEVANAGARI_RE.test(hi)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('٢-ب) سطر واحد أفقي — عقد الصفحة الواحدة', () => {
  /**
   * جذر عطل الصفحتين: كان كل زوج `EN/HI` يُصيَّر في عنصر `display: block` فيضيف
   * سطرًا ثانيًا لكل تسمية وكل عبارة. هذه المجموعة تحرس الشكل الأفقي مباشرةً.
   */

  it('كل زوج ثنائي يظهر مدموجًا بالفاصل الموحَّد في نفس النص', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    for (const key of [
      'sec.employeeInfo', 'sec.leaveDetails',
      'f.name', 'f.employeeId', 'f.civilId', 'f.jobTitle', 'f.department',
      'f.leaveType', 'f.startDate', 'f.endDate', 'f.days', 'f.reason',
      'f.expectedReturn', 'f.requestDate', 'sig.employee', 'p.declaration',
    ] as const) {
      expect(text).toContain(joinEnHi(leaveRequestLabel(key)));
    }
  });

  it('قيمة التعداد مدموجة أفقيًا كذلك', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    expect(container.textContent).toContain(`Annual Leave${EN_HI_SEPARATOR}वार्षिक अवकाश`);
  });

  it('لا عنصر هندي مُكدَّس: صفر `display: block` في أي جزء ثنائي', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    // كل عنصر يحمل ديفاناغارية يجب أن يكون سطريًا (لا block/flex/grid).
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('span, strong, p'))) {
      if (!DEVANAGARI_RE.test(el.textContent ?? '')) continue;
      expect(['', 'inline', 'inline-block']).toContain(el.style.display);
    }
  });

  it('لا فقرة `<p>` ثانية للترجمة — الفقرة الثنائية واحدة', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const paras = Array.from(container.querySelectorAll('p'));
    expect(paras).toHaveLength(1);
    expect(paras[0].textContent).toContain(leaveRequestLabel('p.declaration').en);
    expect(paras[0].textContent).toContain(leaveRequestLabel('p.declaration').hi);
  });

  it('عنوان المستند يُدمج في سطر واحد ويُسلَّم للـShell كنصّ واحد', () => {
    expect(joinEnHi(leaveRequestLabel('doc.title'))).toBe('Leave Request — अवकाश अनुरोध');
    // الصفحة تمرّره كما هو إلى `FormLayout.title` — لا سطر عنوان داخل القالب.
    const page = read('pages/LeaveRequest.tsx');
    expect(page).toContain('joinEnHi(leaveRequestLabel(\'doc.title\'))');
    expect(page).toContain('title={docTitle}');
  });

  it('كتلة الاعتماد الثنائية سطرية كذلك، والنسخة غير المُفعَّلة لم تتغيّر', () => {
    // مُفعَّلة ⇒ الطرفان في نفس السطر.
    const withHi = render(
      <ApprovalSection lang="en" secondaryLabels={APPROVAL_SECONDARY_LABELS_HI} stampInline hideDate />,
    );
    const hiText = withHi.container.textContent ?? '';
    expect(hiText).toContain('Direct Manager Approval — प्रत्यक्ष प्रबंधक अनुमोदन');
    expect(hiText).toContain('Signature: — हस्ताक्षर:');
    expect(hiText).toContain('Official Stamp — आधिकारिक मुहर');
    for (const el of Array.from(withHi.container.querySelectorAll<HTMLElement>('span'))) {
      if (!DEVANAGARI_RE.test(el.textContent ?? '')) continue;
      expect(['', 'inline', 'inline-block']).toContain(el.style.display);
    }
    cleanup();

    // غير مُفعَّلة (كل نموذج قائم) ⇒ لا ديفاناغارية ولا أي تغيير.
    const plain = render(<ApprovalSection lang="en" stampInline hideDate />);
    const plainText = plain.container.textContent ?? '';
    expect(DEVANAGARI_RE.test(plainText)).toBe(false);
    expect(plainText).toContain('Direct Manager Approval');
    expect(plainText).toContain('Official Stamp');
    expect(plainText).not.toContain('—');
  });

  /**
   * قياس ارتفاع فعلي: jsdom لا يخطّط النص، فارتفاع البكسل غير متاح. المتاح —
   * وهو ما يحدد الطول فعليًا — هو **عدد صناديق السطور** التي يولّدها القالب.
   * القالب الثنائي يجب ألا يزيد على الإنجليزي بأكثر من صفّ واحد؛ قبل الإصلاح
   * كان يضيف سطرًا لكل تسمية (11+) وهو ما أنتج الصفحة الثانية.
   */
  it('عدد الصفوف والعناصر الكتلية لا يزيد على القالب الإنجليزي', () => {
    const en = render(<LeaveRequestTemplate employee={EMPLOYEE} latestLeave={LEAVE} lang="en" />);
    const enBlocks = en.container.querySelectorAll('div, p').length;
    cleanup();

    const enHi = render(<LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />);
    const enHiBlocks = enHi.container.querySelectorAll('div, p').length;

    expect(enHiBlocks).toBeLessThanOrEqual(enBlocks);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('٣) القيم المفردة تبقى مفردة', () => {
  it('الاسم لاتيني فقط، بلا نظير هندي وبلا العربي المخزَّن', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('MOHAMMED AHMED');
    expect(text).not.toContain('محمد أحمد');
  });

  it('الكود والرقم المدني وعدد الأيام والتواريخ: قيمة واحدة', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    const text = container.textContent ?? '';
    for (const single of ['E-001', '290010112345', '10 day(s)', '01/03/2026', '10/03/2026']) {
      expect(text).toContain(single);
      expect(text.split(single).length - 1).toBe(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('٤) القيم الديناميكية — سياسة السقوط Hindi → English → Arabic', () => {
  it('توجد ترجمة هندية ⇒ تُعرض الهندية', () => {
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    expect(container.textContent).toContain('ट्रक चालक');
  });

  it('لا هندية وهناك إنجليزية ⇒ تُعرض الإنجليزية', () => {
    // القسم مُهيّأ بالإنجليزية فقط في `CONFIGURED`، وبذوره الهندية أُزيلت أدناه.
    useSettings.setState({
      businessTermsHi: { ...defaultBusinessTermHiDictionaries(), department: {} },
    });
    const { container } = render(
      <LeaveRequestEnHiTemplate employee={EMPLOYEE} latestLeave={LEAVE} />,
    );
    expect(container.textContent).toContain('Drivers');
  });

  it('لا هندية ولا إنجليزية ⇒ تُعرض العربية المخزَّنة كما هي', () => {
    useSettings.setState({
      businessTerms: parseBusinessTermDictionaries([]),
      businessTermsHi: { ...defaultBusinessTermHiDictionaries(), jobTitle: {}, department: {} },
    });
    const emp = { ...EMPLOYEE, jobTitle: 'وظيفة غير مترجمة', department: 'قسم غير مترجم' };
    const { container } = render(<LeaveRequestEnHiTemplate employee={emp} latestLeave={LEAVE} />);
    expect(container.textContent).toContain('وظيفة غير مترجمة');
    expect(container.textContent).toContain('قسم غير مترجم');
  });

  it('قيمة فارغة ⇒ الشرطة', () => {
    const dicts = defaultBusinessTermHiDictionaries();
    const en = parseBusinessTermDictionaries([]);
    expect(resolveBusinessTermHi(dicts, en, 'jobTitle', null)).toBe('—');
    expect(resolveBusinessTermHi(dicts, en, 'jobTitle', '   ')).toBe('—');
  });

  it('السقوط لا يخترع ترجمة لقيمة مجهولة', () => {
    const dicts = defaultBusinessTermHiDictionaries();
    const en = parseBusinessTermDictionaries([]);
    expect(resolveBusinessTermHi(dicts, en, 'jobTitle', 'قيمة لا وجود لها')).toBe('قيمة لا وجود لها');
  });

  it('قاموس المستخدم الهندي يُدمج فوق البذور ولا يمحوها', () => {
    const dicts = parseBusinessTermHiDictionaries([
      { key: BUSINESS_TERM_HI_SETTING_KEYS.jobTitle, value: JSON.stringify({ 'سائق': 'ड्राइवर' }) },
    ]);
    expect(dicts.jobTitle['سائق']).toBe('ड्राइवर');       // إعداد المستخدم فاز
    expect(dicts.jobTitle['مهندس']).toBe('अभियंता');       // البذرة باقية
  });

  it('إعداد تالف لا يُسقط الشاشة — نبقى على البذور', () => {
    const dicts = parseBusinessTermHiDictionaries([
      { key: BUSINESS_TERM_HI_SETTING_KEYS.jobTitle, value: '{ ليس JSON' },
    ]);
    expect(dicts.jobTitle['مهندس']).toBe('अभियंता');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('٥) عزل تام عن عقد العمل', () => {
  it('طبقة الهندية لا تستورد قاموس العقد ولا تلمس مفاتيحه', () => {
    const src = code('lib/businessTermsHi.ts');
    expect(src).not.toContain('contractTranslations');
    expect(src).not.toContain('dict.nationalities');
    expect(src).not.toContain('dict.jobTitles');
  });

  it('لا ملف من ملفات عقد العمل يعرف الطبقة الهندية أو القالب الثنائي', () => {
    for (const rel of ['forms/EmploymentContractTemplate.tsx', 'pages/EmploymentContract.tsx']) {
      const src = code(rel);
      expect(src).not.toContain('businessTermsHi');
      expect(src).not.toContain('enhi');
      expect(src).not.toContain('EnHi');
      expect(src).not.toContain('formVariant');
    }
  });

  it('مساحات المفاتيح الثلاث لا تتقاطع', () => {
    const hiKeys = Object.values(BUSINESS_TERM_HI_SETTING_KEYS);
    const contractKeys = ['dict.nationalities', 'dict.jobTitles'];
    for (const k of hiKeys) {
      expect(contractKeys).not.toContain(k);
      expect(k.startsWith('dict.forms.hi.')).toBe(true);
    }
    // ولا تتقاطع مع مساحة الإنجليزية `dict.forms.*` غير المسبوقة بـ`hi.`
    expect(new Set(hiKeys).size).toBe(hiKeys.length);
  });

  it('حفظ القاموس الهندي لا يغيّر القاموس الإنجليزي', () => {
    const rows = [
      { key: 'dict.forms.jobTitles', value: JSON.stringify({ 'سائق شاحنة': 'Truck Driver' }) },
      { key: BUSINESS_TERM_HI_SETTING_KEYS.jobTitle, value: JSON.stringify({ 'سائق شاحنة': 'ट्रक चालक' }) },
    ];
    expect(parseBusinessTermDictionaries(rows).jobTitle['سائق شاحنة']).toBe('Truck Driver');
    expect(parseBusinessTermHiDictionaries(rows).jobTitle['سائق شاحنة']).toBe('ट्रक चालक');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('٦) `Lang` لم يتوسّع', () => {
  it('نوع لغة الواجهة ما زال عضوين اثنين فقط', () => {
    const src = read('stores/uiStore.ts');
    expect(src).toContain("export type Lang = 'ar' | 'en';");
    expect(src).not.toContain("'hi'");
  });

  it('كل نسخة مستند تُصرَف إلى لغة Shell صالحة', () => {
    expect(FORM_DOC_VARIANTS).toEqual(['ar', 'en', 'en-hi']);
    expect(toLayoutLang('ar')).toBe('ar');
    expect(toLayoutLang('en')).toBe('en');
    expect(toLayoutLang('en-hi')).toBe('en');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('٧) الخط — محلي، مرتَّب بعد Cairo، ويصل المستند المُركَّب', () => {
  const FONTS_CSS = fs.readFileSync(path.join(SRC, 'styles/fonts.css'), 'utf8');

  it('ملفا الخط موجودان محليًا داخل المشروع (لا CDN ولا خط نظام)', () => {
    for (const f of ['NotoSansDevanagari-Regular.woff2', 'NotoSansDevanagari-SemiBold.woff2']) {
      expect(fs.existsSync(path.join(SRC, 'assets/fonts', f))).toBe(true);
    }
    // نسخة الترخيص OFL بجوارهما.
    expect(fs.existsSync(path.join(SRC, 'assets/fonts/NotoSansDevanagari-OFL.txt'))).toBe(true);
  });

  it('`@font-face` معلَنة للوزنين ومصدرها مسار محلي نسبي', () => {
    expect(FONTS_CSS).toContain(`font-family: "${DEVANAGARI_FONT_FAMILY}"`);
    expect(FONTS_CSS).toContain('../assets/fonts/NotoSansDevanagari-Regular.woff2');
    expect(FONTS_CSS).toContain('../assets/fonts/NotoSansDevanagari-SemiBold.woff2');
    expect(FONTS_CSS).not.toMatch(/https?:\/\//);
  });

  it('السلسلة الثنائية تضع Devanagari **بعد** Cairo فلا يتغيّر شكل اللاتيني', () => {
    expect(DOC_FONT_STACK_EN_HI.indexOf('Cairo')).toBeLessThan(
      DOC_FONT_STACK_EN_HI.indexOf(DEVANAGARI_FONT_FAMILY),
    );
    expect(DOC_FONT_STACK_EN_HI).toContain(DEVANAGARI_FONT_FAMILY);
  });

  it('سلسلة المستند القائمة لم تُمَسّ', () => {
    expect(DOC_FONT_STACK).toBe('"Cairo", Arial, sans-serif');
    expect(DOC_FONT_STACK).not.toContain(DEVANAGARI_FONT_FAMILY);
  });

  /**
   * الآلية التي تحمل ملف الخط إلى النافذة المخفية هي `absolutizeUrls` داخل
   * `capturePrintStyles`: تُحوّل `url()` النسبي في قاعدة `@font-face` إلى مسار
   * مطلق، لأن المستند المُركَّب يُكتب في مجلد مؤقت لا يستطيع حلّ المسار النسبي.
   * هذا هو الإصلاح الموثّق نفسه الذي جعل IBM Plex/Tajawal يُحمَّلان في مسار PDF.
   */
  it('`absolutizeUrls` تُحوّل مصدر خط الديفاناغارية إلى مسار مطلق', async () => {
    const { absolutizeUrls } = await import('../printing/styleCapture');
    const rule = `@font-face { font-family: "${DEVANAGARI_FONT_FAMILY}"; src: url("./NotoSansDevanagari-Regular.woff2") format("woff2"); }`;
    const out = absolutizeUrls(rule, 'file:///C:/app/assets/styles.css');
    expect(out).toContain('file:///C:/app/assets/NotoSansDevanagari-Regular.woff2');
    expect(out).not.toContain('url("./');
    // `data:` و`file:` الجاهزة تُترك كما هي — لا إفساد لقواعد قائمة.
    expect(absolutizeUrls('src: url(data:font/woff2;base64,AA)', 'file:///C:/app/x.css'))
      .toContain('data:font/woff2;base64,AA');
  });

  it('المستند المُركَّب يحمل سلسلة الخط الثنائية والنص الديفاناغاري', async () => {
    const { composeStyledFromNode } = await import('../printing/composeDocument');
    const { getPageSpec } = await import('../printing/pageSpec');

    const style = document.createElement('style');
    style.textContent = `.form-page { color: #0f172a }`;
    document.head.appendChild(style);

    const node = document.createElement('div');
    node.className = 'form-page';
    node.style.fontFamily = DOC_FONT_STACK_EN_HI;
    node.textContent = 'अवकाश अनुरोध';
    document.body.appendChild(node);

    try {
      const html = composeStyledFromNode({
        node,
        pageSpec: getPageSpec('a4-portrait'),
        title: 'Leave Request',
        lang: 'en',
        stripSelectors: ['.no-print'],
      });
      // سلسلة الخط سافرت مع العقدة ⇒ النافذة المخفية تطلب نفس العائلة.
      expect(html).toContain(DEVANAGARI_FONT_FAMILY);
      // والنص الديفاناغاري وصل سليمًا (لا فقدان محارف عبر التسلسل).
      expect(html).toContain('अवकाश अनुरोध');
      expect(DEVANAGARI_RE.test(html)).toBe(true);
      // لا خط من شبكة: المستند لا يشير إلى أي خدمة خطوط خارجية (offline).
      // (`<base href>` يعكس أصل الوثيقة المصدر ولا يجلب أي مورد بنفسه.)
      expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|use\.typekit|cdn\./i);
    } finally {
      document.head.removeChild(style);
      document.body.removeChild(node);
    }
  });

  /**
   * حدّ معروف: CSSOM في jsdom **يُسقط واصف `src`** من `@font-face` (يُعيد
   * `@font-face { font-family: "X"; }` فقط)، فلا يمكن لأي اختبار هنا أن يؤكد
   * دوران مسار ملف الخط عبر `capturePrintStyles` من طرف إلى طرف. الجزآن
   * المُختبَران أعلاه (تحويل المسار + وصول العائلة والنص) يغطيان ما يمكن
   * التحقق منه آليًا؛ **تطابق الخط فعليًا في «المعاينة الدقيقة» و«حفظ PDF» بند
   * مراجعة بصرية**، لا ادّعاء اختباري.
   */
  it('يوثّق حدّ jsdom كي لا يُقرأ نجاح ما سبق أكثر مما يعني', () => {
    const s = document.createElement('style');
    s.textContent = `@font-face { font-family: "probe"; src: url("./p.woff2") format("woff2"); }`;
    document.head.appendChild(s);
    try {
      const sheet = document.styleSheets[document.styleSheets.length - 1];
      const text = Array.from(sheet.cssRules).map((r) => r.cssText).join('');
      expect(text).toContain('probe');
      // لو بدأ jsdom يومًا بحفظ `src`، يسقط هذا التوقّع فنُرقّي الاختبار أعلاه
      // إلى تحقّق كامل من طرف إلى طرف بدل هذا التوثيق.
      expect(text).not.toContain('p.woff2');
    } finally {
      document.head.removeChild(s);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('٨) إعادة استخدام مسار الطباعة/المعاينة/PDF القائم', () => {
  it('لا مسار طباعة أو معاينة أو PDF جديد في ملفات المرحلة', () => {
    for (const rel of [
      'forms/enhi/LeaveRequestEnHiTemplate.tsx',
      'forms/enhi/shared/enHiText.tsx',
      'forms/enhi/shared/enHiStyles.ts',
      'forms/enhi/shared/enHiLabels.ts',
      'forms/shared/formVariant.ts',
      'forms/shared/FormVariantToggle.tsx',
    ]) {
      const src = code(rel);
      for (const forbidden of ['window.print', 'printCurrentView', 'composeStyledFromNode', 'composeFromNode', 'exportPdfFromHtml', 'submitPrintJob']) {
        expect(src).not.toContain(forbidden);
      }
    }
  });

  it('الصفحة ما زالت تمرّ بـ`FormLayout` وحده، وتختار القالب فيها', () => {
    const page = read('pages/LeaveRequest.tsx');
    expect(page).toContain('<FormLayout');
    expect(page).toContain('LeaveRequestEnHiTemplate');
    expect(page).toContain('LeaveRequestTemplate');
    expect(page).toContain('FormVariantToggle');
    // البروفايلات والتوقيع/الختم والنسخ كما هي.
    expect(page).toContain('approvalBranding');
    expect(page).toContain('PrintProfileToggle');
  });

  it('القالب الثنائي يستهلك نفس أوليّات `formStyles` القائمة', () => {
    const src = read('forms/enhi/LeaveRequestEnHiTemplate.tsx');
    expect(src).toContain("from '../shared/formStyles'");
    expect(src).toContain('tableWrapper');
    expect(src).toContain('fmtDateEn');
    expect(src).toContain('blankLine');
  });
});
