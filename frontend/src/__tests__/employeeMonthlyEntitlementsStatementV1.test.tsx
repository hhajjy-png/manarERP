// @vitest-environment jsdom
/**
 * حارس دائم — **كشف مستحقات الموظف الشهرية** (Bilingual One-Page Statement Pack v1).
 *
 * يغطّي أربعة عقود لا يجوز أن تنكسر بصمت:
 *  ١. التسمية الجديدة (عربي/English) في مفاتيح الواجهة وعنوان المستند.
 *  ٢. ثنائية اللغة على مستوى **القيم** — الاسم، المسمى، الفترة — من مصدر معتمد وحده،
 *     وبلا اختراع ترجمة حين يغيب المصدر.
 *  ٣. بنية الكشف: خمسة حقول تعريف، عمودان لا ثالث لهما، قسم اعتماد واحد أفقي،
 *     ولا أثر لتاريخ إعداد الكشف ولا لقسمَي الاعتماد القديمين.
 *  ٤. محتوى رمز التحقق: ثلاثة عناصر حصرًا، مشتقّة من سجل الحسبة نفسه، وبقية
 *     المستندات لم يتغيّر محتوى رموزها.
 *
 * ما **لا** يثبته هذا الملف: أن الكشف يُطبع فعلًا في صفحة A4 واحدة. ذلك قياس بصري
 * على مُصيِّر حقيقي، لا يقاس في jsdom. المُثبَت هنا هو أسبابه البنيوية فقط.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import StatementTemplate, { APPROVAL_RECEIPT_TESTID } from '../employee-compensation/StatementTemplate';
import { buildStatementQrLines, netEntitlementQrValue } from '../employee-compensation/statementBilingual';
import { formatQrText, type QRData } from '../forms/shared/FormQRCode';
import { applyTranslationOverrides } from '../forms/shared/contractTranslations';
import { PRINT_PROFILES } from '../forms/shared/printProfiles';
import type { StatementData } from '../employee-compensation/types';
import { t } from '../lib/i18n';

const STATEMENT_SRC = readFileSync('src/employee-compensation/StatementTemplate.tsx', 'utf8');
const PAGE_SRC = readFileSync('src/pages/EmployeeCompensationStatement.tsx', 'utf8');

/** موظف بمصدر إنجليزي معتمد لاسمه ومسماه الوظيفي («سائق شاحنة» في جدول الترجمات). */
const DATA: StatementData = {
  id: 7,
  year: 2026,
  month: 8,
  status: 'APPROVED',
  approvedAt: '2026-09-01T00:00:00.000Z',
  approvedByName: 'مدير الموارد البشرية',
  preparedByName: 'موظف الحسابات',
  employee: {
    code: 'E-014',
    fullName: 'السيد جوان السيد عبدالله',
    fullNameEn: 'Juan Al Sayed Abdullah',
    jobTitle: 'سائق شاحنة',
    department: 'العمليات',
    nationality: 'هندي',
    civilId: '290010100001',
  },
  basicSalary: 300,
  overtime: [{ overtimeType: 'REGULAR', hours: 11, amount: 27.5 }],
  earnings: [{ label: 'مكافأة أداء', type: 'BONUS', amount: 50, hours: null, rate: null }],
  deductions: [{ label: 'سلفة', type: 'ADVANCE', amount: 27.5 }],
  totals: {
    totalOvertimeAmount: 27.5,
    totalOtherEarnings: 50,
    grossEntitlements: 377.5,
    totalDeductions: 27.5,
    netAmount: 350,
  },
  notes: null,
};

/** موظف بلا أي مصدر إنجليزي معتمد — لا لاسمه ولا لمسماه. */
const DATA_NO_EN: StatementData = {
  ...DATA,
  employee: {
    ...DATA.employee,
    fullNameEn: null,
    jobTitle: 'مسمى وظيفي بلا ترجمة معتمدة',
  },
};

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** هل يوجد **عنصر واحد** نصّه بالضبط هذا؟ إثبات أن الشقّين على نفس السطر لا سطرين. */
function hasSingleElementWithText(container: HTMLElement, expected: string): boolean {
  return Array.from(container.querySelectorAll('*')).some((el) => textOf(el) === expected);
}

describe('١ · التسمية الجديدة', () => {
  it('اسم الوحدة العربي صار «مستحقات الموظف الشهرية»', () => {
    expect(t('nav.employee_compensation', 'ar')).toBe('مستحقات الموظف الشهرية');
    expect(t('ecmp.title', 'ar')).toBe('مستحقات الموظف الشهرية');
  });

  it('اسم الوحدة الإنجليزي صار «Monthly Employee Entitlements»', () => {
    expect(t('nav.employee_compensation', 'en')).toBe('Monthly Employee Entitlements');
    expect(t('ecmp.title', 'en')).toBe('Monthly Employee Entitlements');
  });

  it('عنوان الكشف ثنائي اللغة في سطر واحد، وهو نفسه في اللغتين', () => {
    const expected = 'كشف مستحقات الموظف الشهرية / Monthly Employee Entitlements Statement';
    expect(t('ecmp.doc.statement_title', 'ar')).toBe(expected);
    expect(t('ecmp.doc.statement_title', 'en')).toBe(expected);
  });
});

describe('٢ · قيم ثنائية اللغة من مصدر معتمد', () => {
  it('اسم الموظف يظهر عربيًا وإنجليزيًا في نفس السطر حين يتوفّر الاسم المخزَّن', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    expect(hasSingleElementWithText(container, 'السيد جوان السيد عبدالله / Juan Al Sayed Abdullah')).toBe(true);
  });

  it('المسمى الوظيفي يظهر عربيًا وإنجليزيًا في نفس السطر من الترجمة المعتمدة', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    expect(hasSingleElementWithText(container, 'سائق شاحنة / HEAVY DRIVER')).toBe(true);
  });

  it('الشهر/الفترة ثنائي اللغة، مشتقّ من سنة وشهر السجل لا من تاريخ اليوم', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    expect(hasSingleElementWithText(container, 'أغسطس 2026 / August 2026')).toBe(true);
    // نفس السجل بشهر آخر ⇒ فترة أخرى: الاشتقاق من البيانات لا من الساعة.
    const other = render(<StatementTemplate data={{ ...DATA, month: 1, year: 2025 }} />);
    expect(hasSingleElementWithText(other.container, 'يناير 2025 / January 2025')).toBe(true);
  });

  it('تجاوز الترجمة من الإعدادات هو المصدر المعتمد الأول للمسمى', () => {
    applyTranslationOverrides({}, { 'سائق شاحنة': 'TRUCK DRIVER' });
    const { container } = render(<StatementTemplate data={DATA} />);
    expect(hasSingleElementWithText(container, 'سائق شاحنة / TRUCK DRIVER')).toBe(true);
    applyTranslationOverrides({}, {});
  });

  it('بلا مصدر إنجليزي: يُعرض العربي وحده — لا ترجمة مخترعة ولا تكرار للعربي', () => {
    const { container } = render(<StatementTemplate data={DATA_NO_EN} />);
    expect(hasSingleElementWithText(container, 'السيد جوان السيد عبدالله')).toBe(true);
    expect(hasSingleElementWithText(container, 'مسمى وظيفي بلا ترجمة معتمدة')).toBe(true);
    const text = textOf(container);
    expect(text).not.toContain('السيد جوان السيد عبدالله / السيد جوان السيد عبدالله');
    expect(text).not.toContain('مسمى وظيفي بلا ترجمة معتمدة / مسمى وظيفي بلا ترجمة معتمدة');
    // ولا شرطة فاصلة معلّقة بلا شقّ ثانٍ.
    expect(text).not.toContain('السيد جوان السيد عبدالله /');
  });
});

describe('٣ · بنية الكشف', () => {
  it('قسم بيانات الموظف والفترة: خمسة حقول فقط، بتسميات ثنائية اللغة', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const section = container.firstElementChild as HTMLElement;
    // ترويسة القسم + خمسة صفوف = ستة أبناء، لا سابع.
    expect(section.children).toHaveLength(6);
    expect(textOf(section.children[0])).toBe('بيانات الموظف والفترة / Employee & Period Information');
    const labels = Array.from(section.children).slice(1).map((r) => textOf(r.children[0]));
    expect(labels).toEqual([
      'اسم الموظف / Employee Name',
      'الرقم الوظيفي / Employee No.',
      'المسمى الوظيفي / Job Title',
      'الرقم المدني / Civil ID',
      'الشهر / الفترة / Month / Period',
    ]);
  });

  it('تاريخ إعداد الكشف اختفى من الكشف ومن مصدره', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    expect(textOf(container)).not.toContain('تاريخ إعداد الكشف');
    const code = STATEMENT_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('issueDateStr');
    // ولا أي تاريخ يُشتقّ من ساعة الجهاز داخل مستند تاريخي.
    expect(code).not.toContain('new Date(');
  });

  it('جدول المستحقات ما زال بعمودين فقط — لا Paid/Balance/Remaining', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const headers = Array.from(container.querySelectorAll('thead th'));
    expect(headers).toHaveLength(2);
    expect(headers.map(textOf)).toEqual(['البند / Description', 'المبلغ (KD) / Amount (KD)']);
    for (const tr of Array.from(container.querySelectorAll('tbody tr'))) {
      expect(tr.querySelectorAll('td')).toHaveLength(2);
    }
    for (const invented of ['Paid', 'Balance', 'Remaining', 'المدفوع', 'المتبقي', 'الرصيد']) {
      expect(textOf(container)).not.toContain(invented);
    }
  });

  it('التسميات العربية والإنجليزية تظهر في الكشف نفسه — لا نسختان منفصلتان', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const text = textOf(container);
    for (const label of [
      'الراتب الأساسي / Basic Salary',
      'إجمالي المستحقات الإضافية / Total Additional Entitlements',
      'إجمالي الاستقطاعات / Total Deductions',
      'صافي المستحق نقدًا / Net Cash Entitlement',
    ]) {
      expect(text, `التسمية الثنائية «${label}» غائبة`).toContain(label);
    }
  });

  it('قسما الاعتماد القديمان أُزيلا بالكامل', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const text = textOf(container);
    for (const removed of [
      'الإقرار والاستلام',
      'أُعدّ بواسطة',
      'اعتماد المسؤول',
      'غير معتمد',
      'اعتماد المدير المباشر',
      'الختم الرسمي',
      'التاريخ:',
    ]) {
      expect(text, `القسم القديم «${removed}» ما زال في الكشف`).not.toContain(removed);
    }
    // والقسم الذي يعيشُ في تذييل الغلاف (اعتماد المدير المباشر) مُلغى لهذه الصفحة.
    expect(PAGE_SRC).toContain('hideApprovalSection');
  });

  it('قسم «الاعتماد والاستلام» الجديد: بندان في حاوية أفقية واحدة', () => {
    const { container, getByTestId } = render(<StatementTemplate data={DATA} />);
    expect(textOf(container)).toContain('الاعتماد والاستلام / Approval & Receipt');

    const box = getByTestId(APPROVAL_RECEIPT_TESTID);
    expect(box.style.display).toBe('flex');
    expect(box.style.flexDirection).toBe('row');
    expect(box.children).toHaveLength(2);
    expect(textOf(box.children[0])).toBe('توقيع الموظف بالاستلام / Employee Receipt Signature');
    expect(textOf(box.children[1])).toBe('اعتماد المدير / Manager Approval');
  });
});

describe('٤ · محتوى رمز التحقق', () => {
  it('ثلاثة أسطر حصرًا: الاسم · صافي المستحق · الفترة', () => {
    expect(buildStatementQrLines(DATA)).toEqual([
      'اسم الموظف / Employee Name: السيد جوان السيد عبدالله / Juan Al Sayed Abdullah',
      'صافي المستحق نقدًا / Net Cash Entitlement: 50.000 KD',
      'الشهر / الفترة / Month / Period: أغسطس 2026 / August 2026',
    ]);
  });

  it('لا بيانات أخرى تتسرّب إلى الرمز', () => {
    const payload = buildStatementQrLines(DATA).join('\n');
    for (const forbidden of [
      DATA.employee.code,
      DATA.employee.civilId!,
      DATA.employee.jobTitle!,
      'ECS-',
      'الراتب الأساسي',
      'مكافأة أداء',
      'سلفة',
      'إجمالي',
      'تاريخ',
      'معتمد',
      DATA.preparedByName!,
      'المنار',
      String(DATA.id),
    ]) {
      expect(payload, `تسرّب «${forbidden}» إلى محتوى الرمز`).not.toContain(forbidden);
    }
  });

  it('صافي المستحق داخل الرمز = صافي المستحق المعروض في الكشف', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const shownNet = textOf(container.querySelector('tbody tr:last-child td:last-child'));
    // نفس الرقم بنفس الدقة — الرمز لا يعيد الحساب ولا يعيد التقريب.
    // الرقم النقدي: 350.000 − 300.000 أساسي = 50.000.
    expect(shownNet).toContain('50.000');
    expect(netEntitlementQrValue(50)).toBe('50.000 KD');
    const shownNumber = shownNet.match(/[\d,]+\.\d{3}/)?.[0];
    expect(shownNumber).toBeDefined();
    expect(buildStatementQrLines(DATA)[1]).toContain(shownNumber!);
  });

  it('الفترة داخل الرمز تأتي من سجل الحسبة لا من تاريخ اليوم', () => {
    expect(buildStatementQrLines({ ...DATA, year: 2024, month: 3 })[2]).toBe(
      'الشهر / الفترة / Month / Period: مارس 2024 / March 2024',
    );
    const code = readFileSync('src/employee-compensation/statementBilingual.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('new Date(');
  });

  it('اسم الموظف داخل الرمز يستخدم اللغتين حين تتوفّران، والعربي وحده حين لا تتوفّران', () => {
    expect(buildStatementQrLines(DATA)[0]).toContain('السيد جوان السيد عبدالله / Juan Al Sayed Abdullah');
    expect(buildStatementQrLines(DATA_NO_EN)[0]).toBe(
      'اسم الموظف / Employee Name: السيد جوان السيد عبدالله',
    );
  });

  it('محتوى رموز بقية المستندات لم يتغيّر', () => {
    const legacy: QRData = {
      formType: 'salary-certificate',
      formNumber: 'SC-2026-001',
      entityName: 'موظف تجريبي',
      entityId: 42,
    };
    expect(formatQrText(legacy)).toBe(
      ['شهادة راتب', 'رقم المستند: SC-2026-001', 'الاسم: موظف تجريبي', 'الرقم المرجعي: 42'].join('\n'),
    );
    // والمحتوى الصريح يحلّ محلّ كل ذلك — لهذا الكشف وحده.
    expect(formatQrText({ ...legacy, payloadLines: ['أ', 'ب'] })).toBe('أ\nب');
  });
});

describe('٥ · عقود ثابتة: الأرقام والتخطيط', () => {
  it('كل مبلغ يُعرض بثلاث خانات عشرية', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const amounts = Array.from(container.querySelectorAll('tbody tr td:last-child')).map(textOf);
    expect(amounts.length).toBeGreaterThan(0);
    for (const a of amounts) {
      expect(a, `مبلغ بلا ثلاث خانات عشرية: ${a}`).toMatch(/\d+\.\d{3}/);
    }
  });

  it('القالب يعرض الأرقام الواصلة كما هي — لا حساب ولا إعادة تجميع', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const text = textOf(container);
    // الإجماليات المعروضة هي حرفيًا حقول `totals` الواصلة من المحرّك.
    // الأرقام المعروضة مشتقّة في دالة واحدة خارج القالب — والقالب لا يحسب شيئًا.
    expect(text).toContain('300.000'); // basicSalary — للمعلومية
    expect(text).toContain('77.500'); // gross 377.500 − basic 300.000
    expect(text).toContain('27.500'); // totalDeductions
    expect(text).toContain('50.000'); // net 350.000 − basic 300.000
    const code = STATEMENT_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const arithmetic of ['grossEntitlements -', 'netAmount -', 'reduce(', '.toFixed(']) {
      expect(code, `القالب يحسب: ${arithmetic}`).not.toContain(arithmetic);
    }
  });

  /**
   * ملاحظة صريحة: `tableWrapper` المشترك يحمل `overflow: hidden` منذ الأصل — لأجل
   * نصف قطر الحواف، على صندوق ارتفاعه تلقائي. لا يقصّ محتوى ولا هو حيلة صفحة واحدة،
   * ولذلك ليس في قائمة الممنوعات أدناه. الممنوع هو ما يُخفي فيضًا فعليًا: سقف ارتفاع،
   * تمرير، تصغير للصفحة كلها، أو قصّ هندسي.
   */
  it('الصفحة الواحدة مبنيّة تخطيطًا — لا سقف ارتفاع ولا تمرير ولا تصغير للصفحة', () => {
    for (const src of [STATEMENT_SRC, PAGE_SRC]) {
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\/.*$/gm, '');
      for (const banned of ['maxHeight', 'overflowY', 'overflowX', "transform: 'scale", 'clipPath', 'zoom:']) {
        expect(code, `حلّ ممنوع للصفحة الواحدة: ${banned}`).not.toContain(banned);
      }
    }
  });

  it('لا صندوق في الكشف بارتفاع ثابت يمكن أن يبتلع محتوى فائضًا', () => {
    const { container, getByTestId } = render(<StatementTemplate data={DATA} />);
    // مساحات التوقيع وحدها لها ارتفاع مقصود (خطّ التوقيع)، وهي فارغة بطبيعتها.
    const signatureRules = getByTestId(APPROVAL_RECEIPT_TESTID).querySelectorAll('div[style*="height"]');
    expect(signatureRules).toHaveLength(2);
    const others = Array.from(container.querySelectorAll('*')).filter(
      (el) => el instanceof HTMLElement && el.style.height && !getByTestId(APPROVAL_RECEIPT_TESTID).contains(el),
    );
    expect(others, 'صندوق بارتفاع ثابت خارج مساحات التوقيع').toHaveLength(0);
  });

  /**
   * `app/theme.css` يحمل `tbody tr:nth-child(even) td { background: … }` و
   * `tbody tr:hover td { background: … }` بلا نطاق، فكانتا تظلّلان أسطر بنودٍ
   * بعينها داخل مستند مطبوع لا تظليل متناوب فيه. الحارس على النتيجة: كل خلايا
   * البنود بخلفية واحدة، وصفوف الإجماليات وحدها هي المميَّزة.
   */
  it('كل أسطر البنود بتنسيق واحد — لا تظليل متناوب يتسرّب من الأنماط العامة', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const isTotalRow = (tr: Element) =>
      ['إجمالي المستحقات', 'إجمالي الاستقطاعات', 'صافي المستحق'].some((k) =>
        textOf(tr).includes(k),
      );

    const itemCells = rows
      .filter((tr) => !isTotalRow(tr))
      .flatMap((tr) => Array.from(tr.querySelectorAll('td')));
    expect(itemCells.length).toBeGreaterThan(2);
    for (const cellEl of itemCells) {
      // خلفية سطرية صريحة ⇒ لا قاعدة عامّة تستطيع تظليل هذا السطر دون غيره.
      expect(cellEl.style.background, `خلية بند بخلفية غير محايدة: ${textOf(cellEl)}`).toBe('transparent');
      expect(cellEl.style.borderBottom).toBe('1px solid rgb(226, 232, 240)');
    }
    // ووزن الخط واحد في كل خلايا الوصف — لا سطر بارز عن أخيه.
    const descriptionWeights = new Set(
      rows.filter((tr) => !isTotalRow(tr)).map((tr) => (tr.querySelector('td') as HTMLElement).style.fontWeight),
    );
    expect(descriptionWeights.size).toBe(1);
  });

  it('صفوف الإجماليات وحدها تحتفظ بتمييزها', () => {
    const { container } = render(<StatementTemplate data={DATA} />);
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const totals = rows.filter((tr) =>
      ['إجمالي المستحقات', 'إجمالي الاستقطاعات', 'صافي المستحق'].some((k) => textOf(tr).includes(k)),
    );
    expect(totals).toHaveLength(3);
    for (const tr of totals) {
      const first = tr.querySelector('td') as HTMLElement;
      expect(first.style.fontWeight).toBe('800');
      expect(['rgb(248, 250, 252)', 'rgb(238, 242, 255)']).toContain(first.style.background);
    }
  });

  it('محتوى الكشف مُزاح ٢ سم للأسفل داخل نفس العقدة المطبوعة، بلا إزاحة أفقية', () => {
    const code = PAGE_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(code).toContain('contentTopOffset="20mm"');
    // الإزاحة رأسية بحتة: لا هامش/حشو أفقي مضاف على هذه الصفحة.
    for (const horizontal of ['marginLeft', 'marginRight', 'paddingLeft', 'paddingRight', 'marginInline']) {
      expect(code, `إزاحة أفقية مضافة: ${horizontal}`).not.toContain(horizontal);
    }
  });

  it('الورق ما زال A4 عموديًا على كل قالب طباعة يمكن للكشف استخدامه', () => {
    for (const profile of Object.values(PRINT_PROFILES)) {
      expect(profile.page.size).toBe('A4');
      expect(profile.page.orientation).toBe('portrait');
    }
  });
});
