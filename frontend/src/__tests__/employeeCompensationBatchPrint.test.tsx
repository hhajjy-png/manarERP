// @vitest-environment jsdom
/**
 * الطباعة الجماعية — الترتيب، والاكتفاء بالموجود، والمطابقة مع الطباعة الفردية.
 *
 * ═══ ما تحرسه هذه الاختبارات ═══
 *  · **الترتيب**: كشف الشهر ثم سند صرفه، ثم الشهر الذي يليه — تصاعديًا مهما وصلت
 *    الكشوف مختلطة من الخادم. اختلال هذا الترتيب يعني ورقةَ استلامٍ تُوقَّع بجانب
 *    كشف شهر آخر.
 *  · **لا شهر مُختلَق**: تُطبع الأشهر الموجودة فعلًا وحدها، بلا إكمالٍ إلى اثني عشر.
 *  · **لا تكرار**: مستند واحد لكل كشف ولكل سند.
 *  · **الشهر بلا نقد**: كشفه يبقى، سنده لا يُنشأ، واسمه يُبلَّغ صراحةً — نفس شرط
 *    شاشة السند الفردية (`cashNet <= 0`)، لا شرط ثانٍ موازٍ له.
 *  · **ورق الشركة الرسمي للدفعة كلها**: كل صفحة — كشفًا كانت أو سندًا، وفي أي شهر —
 *    تُطبع على `letterhead` وحده. الدفعة تُسحب على رزمة واحدة من الورق المطبوع
 *    مسبقًا، فورقةٌ بهوامش أخرى داخلها تخرج مزاحة عن الرزمة.
 *  · **الهوامش**: الجوانب والأسفل تصل من `PRINT_PROFILES.letterhead` نفسها لا مكتوبةً
 *    في ملف الدفعة، فتعديل ملف التعريف يصل الدفعة تلقائيًا ولا تبقى نسخة ثانية من قيمه.
 *  · **بداية المحتوى لكل نوع**: الكشف ٥ سم والسند ٣ سم، مقيسةً من حافة الورقة العليا.
 *    مواصفةٌ خاصة بالدفعة وحدها ومطلقة (لا مشتقّة جمعًا من هامش ملف التعريف)، ولا أثر
 *    لها في الطباعة الفردية — يحرس ذلك فحصٌ على مصادر `FormLayout` و`FormPage`
 *    وصفحتَي الكشف والسند. وكل قيمة تخصّ نوعها وحده: لا تتسرّب إلى النوع الآخر.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

const yearStatements = vi.hoisted(() => vi.fn());
vi.mock('../employee-compensation/api', () => ({ compensationApi: { yearStatements } }));
import { readFileSync } from 'node:fs';
import BatchPrintPage, {
  BATCH_CONTENT_TOP,
  batchPrintCss,
  buildBatchDocuments,
  statementReference,
} from '../pages/EmployeeCompensationBatchPrint';
import { voucherReference } from '../pages/EmployeeCompensationVoucher';
import { PRINT_PROFILES } from '../forms/shared/printProfiles';
import type { StatementData } from '../employee-compensation/types';

function statement(over: Partial<StatementData> & { month: number; id: number }): StatementData {
  const { month, id, ...rest } = over;
  return {
    id,
    year: 2026,
    month,
    status: 'APPROVED',
    approvedAt: null,
    approvedByName: null,
    preparedByName: null,
    employee: {
      code: 'E-002',
      fullName: 'موظف تجريبي',
      jobTitle: 'سائق شاحنة',
      department: null,
      nationality: null,
      civilId: null,
    },
    basicSalary: 150,
    overtime: [],
    earnings: [],
    deductions: [],
    // صافي ٢٥٠ وأساسي ١٥٠ ⇒ نقدًا ١٠٠ ⇒ للشهر سند صرف.
    totals: {
      totalOvertimeAmount: 0,
      totalOtherEarnings: 100,
      grossEntitlements: 250,
      totalDeductions: 0,
      netAmount: 250,
    },
    notes: null,
    ...rest,
  } as StatementData;
}

/** شهر بلا مبلغ نقدي: الصافي = الأساسي، فالفرق صفر ⇒ لا سند صرف. */
function cashlessStatement(month: number, id: number): StatementData {
  return statement({
    month,
    id,
    totals: {
      totalOvertimeAmount: 0,
      totalOtherEarnings: 0,
      grossEntitlements: 150,
      totalDeductions: 0,
      netAmount: 150,
    },
  });
}

describe('buildBatchDocuments — الترتيب', () => {
  it('يرتّب الأشهر تصاعديًا ويُتبع كل كشف بسند صرفه', () => {
    // تصل مختلطة عمدًا: الترتيب مسؤولية الدفعة لا مسؤولية مصدر البيانات.
    const { docs } = buildBatchDocuments([
      statement({ month: 3, id: 33 }),
      statement({ month: 1, id: 11 }),
      statement({ month: 2, id: 22 }),
    ]);

    expect(docs.map((d) => `${d.month}:${d.kind}`)).toEqual([
      '1:statement',
      '1:voucher',
      '2:statement',
      '2:voucher',
      '3:statement',
      '3:voucher',
    ]);
  });

  it('لا يفترض اكتمال السنة — يطبع الموجود وحده بلا شهر مُختلَق', () => {
    const { docs } = buildBatchDocuments([
      statement({ month: 2, id: 2 }),
      statement({ month: 9, id: 9 }),
    ]);

    expect(docs).toHaveLength(4);
    expect(docs.map((d) => d.month)).toEqual([2, 2, 9, 9]);
  });

  it('لا مستند مكرّر: كشف واحد وسند واحد لكل حسبة', () => {
    const { docs } = buildBatchDocuments([
      statement({ month: 1, id: 11 }),
      statement({ month: 2, id: 22 }),
    ]);

    const keys = docs.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('قائمة فارغة ⇒ لا مستندات ولا تنبيهات', () => {
    expect(buildBatchDocuments([])).toEqual({ docs: [], monthsWithoutVoucher: [] });
  });
});

describe('buildBatchDocuments — الشهر الذي لا سند صرف له', () => {
  it('يُبقي الكشف، ولا يُنشئ سندًا، ويُبلّغ بالشهر صراحةً', () => {
    const { docs, monthsWithoutVoucher } = buildBatchDocuments([
      statement({ month: 1, id: 1 }),
      cashlessStatement(2, 2),
      statement({ month: 3, id: 3 }),
    ]);

    expect(monthsWithoutVoucher).toEqual([2]);
    expect(docs.map((d) => `${d.month}:${d.kind}`)).toEqual([
      '1:statement',
      '1:voucher',
      '2:statement',
      '3:statement',
      '3:voucher',
    ]);
  });

  it('المبلغ النقدي السالب يُعامَل معاملة الصفر — لا سند', () => {
    const negative = statement({
      month: 5,
      id: 5,
      totals: {
        totalOvertimeAmount: 0,
        totalOtherEarnings: 0,
        grossEntitlements: 150,
        totalDeductions: 20,
        netAmount: 130,
      },
    });
    const { docs, monthsWithoutVoucher } = buildBatchDocuments([negative]);

    expect(monthsWithoutVoucher).toEqual([5]);
    expect(docs.every((d) => d.kind === 'statement')).toBe(true);
  });
});

describe('المراجع — نفس مراجع الطباعة الفردية', () => {
  it('مرجع السند يأتي من `voucherReference` نفسها لا من صيغة ثانية', () => {
    const data = statement({ month: 7, id: 7 });
    const { docs } = buildBatchDocuments([data]);
    const voucher = docs.find((d) => d.kind === 'voucher');

    expect(voucher).toBeDefined();
    expect(voucher && 'reference' in voucher ? voucher.reference : '').toBe(voucherReference(data));
  });

  it('رقم مستند الكشف بنفس صيغة شاشة الكشف الفردية', () => {
    expect(statementReference(statement({ month: 7, id: 7 }))).toBe('ECS-2026-07-E-002');
  });
});

describe('قواعد طباعة الدفعة', () => {
  const css = batchPrintCss();
  const letterhead = PRINT_PROFILES['letterhead'].margins;

  it('الكشف يبدأ عند ٥ سم والسند عند ٣ سم — كلٌّ في قاعدته وحده', () => {
    expect(BATCH_CONTENT_TOP.statement).toBe('50mm');
    expect(BATCH_CONTENT_TOP.voucher).toBe('30mm');

    expect(css).toContain('.ecmp-batch-doc--statement .form-page { padding-top: 50mm !important; }');
    expect(css).toContain('.ecmp-batch-doc--voucher .form-page { padding-top: 30mm !important; }');
  });

  it('لا تتسرّب قيمة نوع إلى الآخر: قاعدة علوية واحدة لكل نوع', () => {
    const tops = css.match(/\.ecmp-batch-doc--(\w+) \.form-page \{ padding-top: (\d+mm)/g) ?? [];
    expect(tops).toHaveLength(2);
    // قاعدة الكشف لا تذكر ٣ سم، وقاعدة السند لا تذكر ٥ سم.
    const statementRule = tops.find((r) => r.includes('--statement')) ?? '';
    const voucherRule = tops.find((r) => r.includes('--voucher')) ?? '';
    expect(statementRule).toContain('50mm');
    expect(statementRule).not.toContain('30mm');
    expect(voucherRule).toContain('30mm');
    expect(voucherRule).not.toContain('50mm');
  });

  it('السند أعلى من الكشف بـ٢ سم بالضبط', () => {
    const mm = (v: string) => Number(v.replace('mm', ''));
    expect(mm(BATCH_CONTENT_TOP.statement) - mm(BATCH_CONTENT_TOP.voucher)).toBe(20);
  });

  it('تُصفّر هامش الصفحة وتُبقي بقية هوامش ملف التعريف مشتركةً بين النوعين', () => {
    expect(css).toContain('@page { size: A4; margin: 0; }');
    expect(css).toContain(`padding-right: ${letterhead.right} !important;`);
    expect(css).toContain(`padding-bottom: ${letterhead.bottom} !important;`);
    expect(css).toContain(`padding-left: ${letterhead.left} !important;`);
  });

  it('الخلوص العلوي مطلق لا مشتقّ من هامش ملف التعريف', () => {
    // القيم تقاس من حافة الورقة. لو صارت مجموعًا (هامش + فاصل) لانزلقت بصمت مع أي
    // تعديل على `letterhead`، فنُثبت أن أيًّا منها لا يساوي هامش الملف العلوي ولا
    // يُبنى منه — ولا حشو علوي مشترك يسبق قواعد النوعين.
    expect(Object.values(BATCH_CONTENT_TOP)).not.toContain(letterhead.top);
    expect(css).not.toContain(`padding-top: ${letterhead.top}`);
  });

  it('هندسة الورقة مشتركة: الحشو العلوي وحده يفترق بالنوع', () => {
    // كتلة مشتركة واحدة (بلا `--kind`) تحمل العرض والهوامش الجانبية والسفلية للجميع.
    const shared = css.match(/\.ecmp-batch-doc \.form-page \{[^}]*\}/g) ?? [];
    expect(shared).toHaveLength(1);
    expect(shared[0]).not.toContain('padding-top');
    // ولا قاعدة نوعٍ تعيد ضبط شيء غير الحشو العلوي.
    const kindRules = css.match(/\.ecmp-batch-doc--\w+ \.form-page \{[^}]*\}/g) ?? [];
    expect(kindRules).toHaveLength(2);
    for (const rule of kindRules) {
      expect(rule.match(/[a-z-]+:/g)).toEqual(['padding-top:']);
    }
  });

  it('لا أثر لهوامش أي ملف تعريف آخر — «A4 عادي» تحديدًا', () => {
    const plain = PRINT_PROFILES['plain-a4'].margins;
    expect(css).not.toContain(`padding: ${plain.top} ${plain.right} ${plain.bottom} ${plain.left}`);
  });

  it('تفصل المستندات بفاصل صفحة **قبل** كل مستند عدا الأول — فلا صفحة بيضاء زائدة', () => {
    expect(css).toContain('.ecmp-batch-doc + .ecmp-batch-doc');
    expect(css).toContain('break-before: page;');
    expect(css).not.toContain('break-after');
    expect(css).not.toContain('page-break-after');
  });
});

describe('حدود الميزة — لا أثر جانبي', () => {
  const source = readFileSync('src/pages/EmployeeCompensationBatchPrint.tsx', 'utf8');

  it('لا كتابة إلى الخادم من شاشة الطباعة الجماعية', () => {
    for (const method of ['api.post', 'api.put', 'api.delete', '.approve(', '.update(', '.create(']) {
      expect(source).not.toContain(method);
    }
  });

  it('لا تستدعي أي وحدة رواتب أو محاسبة', () => {
    expect(source).not.toMatch(/from '\.\.\/(payroll|accounting)/);
    expect(source).not.toContain('payrollApi');
    expect(source).not.toContain('accountingApi');
  });

  it('تقرأ ملف تعريف الطباعة من `PRINT_PROFILES` ولا تكرّر قيمه', () => {
    expect(source).toContain("const BATCH_PROFILE: ProfileId = 'letterhead';");
    expect(source).toContain('PRINT_PROFILES[BATCH_PROFILE].margins');
    expect(source).toContain('PRINT_PROFILES[BATCH_PROFILE].blankHeader');
    // القيمة الوحيدة المكتوبة بيدها هي بداية محتوى الدفعة — مواصفة خاصة بها لا نسخة
    // من هامش ملف تعريف. أما هوامش الملفات فلا يُكرَّر منها شيء.
    expect(source).toContain("statement: '50mm',");
    expect(source).toContain("voucher: '30mm',");
    for (const literal of ['40mm', '20mm', '10mm', '12mm']) {
      expect(source).not.toContain(`'${literal}'`);
    }
  });

  /**
   * الحارس الأهم لهذه المواصفة: الإزاحة **داخل الدفعة وحدها**.
   *
   * كل ملف تعبر منه الطباعة الفردية للكشف أو السند يجب أن يبقى خاليًا من `50mm` —
   * فلو تسرّبت يومًا إلى `FormLayout` أو `FormPage` (وهما مشتركان مع أربعة عشر نموذجًا
   * آخر) لتحرّك محتوى كل نموذج في النظام، لا الدفعة وحدها.
   */
  it('إزاحة ٥ سم لا تُطبَّق إلا في الطباعة الجماعية', () => {
    const untouched = [
      'src/forms/shared/FormLayout.tsx',
      'src/forms/shared/FormPage.tsx',
      'src/forms/shared/printProfiles.ts',
      'src/pages/EmployeeCompensationStatement.tsx',
      'src/pages/EmployeeCompensationVoucher.tsx',
    ];
    for (const file of untouched) {
      const other = readFileSync(file, 'utf8');
      expect(other).not.toContain('50mm');
      expect(other).not.toContain('30mm');
    }
  });

  it('الطباعة الفردية للكشف والسند بلا تعديل: كلٌّ يحتفظ بملف تعريفه وخلوصه', () => {
    // الكشف الفردي: `plain-a4` + فاصل ٢سم داخل الورقة، كما كان قبل هذه الحزمة.
    const individualStatement = readFileSync('src/pages/EmployeeCompensationStatement.tsx', 'utf8');
    expect(individualStatement).toContain('contentTopOffset="20mm"');
    expect(individualStatement).not.toContain('BATCH_CONTENT_TOP');

    // السند الفردي: `letterhead` بهوامشه، وبلا `contentTopOffset` أصلًا.
    const individualVoucher = readFileSync('src/pages/EmployeeCompensationVoucher.tsx', 'utf8');
    expect(individualVoucher).toContain("'letterhead'");
    // `contentTopOffset=` لا مجرّد ذكر الاسم: الملف يشرح في تعليقه لماذا أُغفل عمدًا.
    expect(individualVoucher).not.toContain('contentTopOffset=');
    expect(individualVoucher).not.toContain('BATCH_CONTENT_TOP');
  });

  it('لا ملف تعريف ثانٍ في الدفعة', () => {
    expect(source).not.toContain("'plain-a4'");
    expect(source).not.toContain("'ready-paper'");
    expect(source).not.toContain("'payment-voucher'");
    // الترويسة تتبع علَم الملف لا قرارًا محليًا: لا `isLetterhead` ثابتة في أي صفحة.
    expect(source).not.toContain('isLetterhead={false}');
    expect(source).not.toContain('<FormHeader isLetterhead lang');
  });

  it('تستعمل قالبَي المستندين القائمين لا نسخة منهما', () => {
    expect(source).toContain("from '../employee-compensation/StatementTemplate'");
    expect(source).toContain("from '../employee-compensation/CashPaymentVoucherTemplate'");
    expect(source).toContain("from '../forms/shared/FormPage'");
  });
});

/**
 * تصيير حقيقي للشاشة — الحارس الوحيد الذي يمسك انهيارًا وقت التشغيل في تركيبة
 * (`FormPage` + القالبان + مساحة الطباعة) لا تمسكه دوالٌّ نقية ولا فحص أنواع.
 *
 * لا طباعة تُشغَّل هنا: الشاشة تُفتح بعلامة «فُتح للعرض» (`?open=preview`) — وهي نفس
 * العلامة التي تُلغي الطباعة التلقائية في كل نموذج إداري.
 */
describe('تصيير الشاشة', () => {
  const renderPage = () =>
    render(
      <MemoryRouter
        initialEntries={['/employee-compensation/batch-print/5/2026?open=preview']}
        future={ROUTER_FUTURE}
      >
        <Routes>
          <Route path="/employee-compensation/batch-print/:employeeId/:year" element={<BatchPrintPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it('تُصيّر كشوف السنة وسنداتها بالترتيب الزمني، بلا طباعة تلقائية', async () => {
    // تصل مقلوبة من الخادم عمدًا — الترتيب يجب أن يظهر على الورق لا في المصفوفة فقط.
    yearStatements.mockResolvedValue({
      employeeId: 5,
      year: 2026,
      statements: [statement({ month: 2, id: 22 }), statement({ month: 1, id: 11 })],
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelectorAll('.ecmp-batch-doc').length).toBe(4));

    const docs = Array.from(container.querySelectorAll('.ecmp-batch-doc'));
    expect(
      docs.map((el) => (el.classList.contains('ecmp-batch-doc--statement') ? 'statement' : 'voucher')),
    ).toEqual(['statement', 'voucher', 'statement', 'voucher']);

    expect(
      docs.map((el) => (el.textContent ?? '').match(/EC[SV]-2026-\d{2}-E-002/)?.[0] ?? ''),
    ).toEqual(['ECS-2026-01-E-002', 'ECV-2026-01-E-002', 'ECS-2026-02-E-002', 'ECV-2026-02-E-002']);

    expect(yearStatements).toHaveBeenCalledWith(5, 2026);
    // لا تنبيه: كل شهر له سند صرف.
    expect(container.querySelector('.ecmp-batch-missing')).toBeNull();
  });

  it('الشهر بلا سند صرف: تنبيه صريح باسم الشهر، وزرّا الطباعة معطَّلان حتى الإقرار', async () => {
    yearStatements.mockResolvedValue({
      employeeId: 5,
      year: 2026,
      statements: [statement({ month: 1, id: 11 }), cashlessStatement(4, 44)],
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.ecmp-batch-missing')).not.toBeNull());

    const notice = container.querySelector('.ecmp-batch-missing');
    expect(notice?.textContent).toContain('أبريل');
    // التنبيه نفسه لا يصل الورق أبدًا.
    expect(notice?.classList.contains('no-print')).toBe(true);

    const printButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      (b.textContent ?? '').includes('طباعة الكل') || (b.textContent ?? '').includes('حفظ PDF'),
    );
    // غير فارغ عمدًا: تأكيدٌ على أن الحلقة تفحص شيئًا فعلًا لا أنها مرّت على لا شيء.
    expect(printButtons).toHaveLength(2);
    for (const button of printButtons) expect((button as HTMLButtonElement).disabled).toBe(true);

    // الكشف باقٍ رغم غياب سنده — ثلاثة مستندات لا أربعة.
    expect(container.querySelectorAll('.ecmp-batch-doc').length).toBe(3);
    expect(container.querySelectorAll('.ecmp-batch-doc--voucher').length).toBe(1);
  });

  it('كل صفحة في الدفعة على «ورق الشركة الرسمي»: لا ترويسة إلكترونية على أي منها', async () => {
    yearStatements.mockResolvedValue({
      employeeId: 5,
      year: 2026,
      statements: [statement({ month: 1, id: 11 }), statement({ month: 2, id: 22 })],
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelectorAll('.ecmp-batch-doc').length).toBe(4));

    // `isLetterhead` يُصيّر الترويسة `display:none` — الورقة تحملها مطبوعة. أربع صفحات
    // ⇒ أربع ترويسات مخفيّة، بلا استثناء واحد ظاهر.
    const headers = Array.from(container.querySelectorAll('.form-page > div[style]')).filter((el) =>
      (el.getAttribute('style') ?? '').includes('border-bottom: 3px solid'),
    );
    expect(headers).toHaveLength(4);
    for (const header of headers) {
      expect(header.getAttribute('style')).toContain('display: none');
    }
  });

  it('سنة بلا كشوف ⇒ حالة فارغة واضحة بلا أي مستند', async () => {
    yearStatements.mockResolvedValue({ employeeId: 5, year: 2026, statements: [] });

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.ecmp-batch-state')).not.toBeNull());

    expect(container.querySelectorAll('.ecmp-batch-doc').length).toBe(0);
  });
});
