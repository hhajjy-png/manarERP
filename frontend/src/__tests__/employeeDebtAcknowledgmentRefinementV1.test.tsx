// @vitest-environment jsdom
/**
 * Employee Debt Acknowledgment v1 — Functional Refinement · العقد الذي تحرسه هذه الاختبارات.
 *
 * (حاسبة الأقساط وحدها في `debtAcknowledgmentSchedule.test.ts`؛ وأمانة النصّ مقابل
 *  ملفات Word في `debtAcknowledgmentDocxFidelity.test.ts`.)
 *
 *  1. **عزل لغوي**: القالب العربي يعرض بيانات الموظف العربية؛ والقالبان الإنجليزي
 *     والهندي لا يعرضان حرفًا عربيًا واحدًا — ولا يسقطان إلى العربية عند غياب النظير.
 *  2. **بوابة فعلية**: المعاينة الدقيقة والطباعة وتصدير PDF كلها ممنوعة ما دامت قيمة
 *     عربية ستُطبع في قالب أجنبي. بوابةٌ على الطباعة وحدها ليست بوابة.
 *  3. **كاشف الحرف العربي**: يغطي كتل يونيكود العربية كلها، ولا يرفض الديفاناغارية
 *     ولا اللاتينية ولا الأرقام الغربية.
 *  4. **بيانات الشركة الثابتة**: السجل التجاري والرقم الموحّد يظهران في القوالب
 *     الثلاثة، ولا يعدّلهما المستخدم سهوًا، ويصمدان أمام تحميل مسودّة قديمة.
 *  5. **مساحة التوقيع**: كل خانة توقيع تحمل مساحة الكتابة الموسّعة، بلا فقدان تسمية
 *     ولا تغيير في عدد التواقيع أو ترتيبها.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import fs from 'node:fs';
import { withFormOpenIntent } from '../forms/shared/formOpenIntent';

import EmployeeDebtAcknowledgment from '../pages/EmployeeDebtAcknowledgment';
import { api } from '../api/client';
import { t as translate } from '../lib/i18n';
import { containsArabicScript, findArabicLeaks } from '../forms/debtAcknowledgment/arabicScript';
import {
  CREDITOR_COMMERCIAL_REGISTRATION_NO,
  CREDITOR_NAME_LATIN,
  CREDITOR_UNIFIED_NUMBER,
  MAX_INSTALLMENTS,
} from '../forms/debtAcknowledgment/constants';
import {
  applyAutofill,
  buildDebtAckAutofill,
  withFixedCreditorData,
} from '../forms/debtAcknowledgment/debtAcknowledgmentAutofill';
import { regenerateSchedule } from '../forms/debtAcknowledgment/debtAcknowledgmentDocument';
import { resolveDynamicValues, resolveFieldValue } from '../forms/debtAcknowledgment/debtAcknowledgmentValues';
import {
  EMPTY_DEBT_ACK_DATA,
  LOCALIZABLE_FIELD_IDS,
  latinTwinOf,
  type DebtAckData,
} from '../forms/debtAcknowledgment/debtAcknowledgmentModel';

const ROUTE = '/forms/employee-debt-acknowledgment/:employeeId';

const EMPLOYEE = {
  id: 42,
  code: 'EMP-042',
  fullName: 'راجيش كومار',
  fullNameEn: 'RAJESH KUMAR',
  civilId: '292010100123',
  jobTitle: 'عامل تشغيل وصيانة',
  nationality: 'الهند',
  passportNumber: 'Z1234567',
  phone: '+965 5000 0000',
  email: 'rajesh@example.invalid',
  address: 'الفروانية — قطعة 3',
};

beforeEach(() => {
  (window as unknown as { manar: unknown }).manar = {
    printSubmit: vi.fn(async () => ({ status: 'printed' as const })),
    printPage: vi.fn(async () => ({ success: true })),
  };
  vi.spyOn(api, 'get').mockImplementation((async (url: string) => {
    if (url.startsWith('/forms/employee-debt-acknowledgment/')) {
      return { data: { data: { employee: EMPLOYEE } } };
    }
    return { data: { data: null } };
  }) as never);
  vi.spyOn(api, 'post').mockImplementation((async () => ({ data: { data: {} } })) as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { manar?: unknown }).manar;
});

/**
 * تُفتح الشاشة كما تفتحها بطاقة «النماذج الإدارية» فعلًا: بعلامة «فُتح للعرض»
 * (`?open=preview`). بدونها يُشغّل `FormLayout` طباعتَه التلقائية عند التركيب — وهو
 * سلوك قائم لكل النماذج ولم تمسّه هذه الحزمة، لكنه يلوّث فحص «هل طُبع؟» بنداءٍ لم
 * يطلبه أحد في هذا الاختبار.
 */
async function renderForm() {
  const view = render(
    <MemoryRouter
      future={ROUTER_FUTURE}
      initialEntries={[withFormOpenIntent('/forms/employee-debt-acknowledgment/42')]}
    >
      <Routes>
        <Route path={ROUTE} element={<EmployeeDebtAcknowledgment />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector('.eda-root')?.textContent).toContain(EMPLOYEE.code));
  return view;
}

const printedRoot = () => document.querySelector('.form-page') as HTMLElement;
const docRoot = () => document.querySelector('.eda-root') as HTMLElement;
const switchTo = (aria: 'Arabic' | 'English' | 'Hindi') => fireEvent.click(screen.getByLabelText(aria));

/**
 * ما يُطبع فعلًا على الورق.
 *
 * ثلاثة أشياء تعيش في الشجرة ولا تُطبع، فتُسقَط قبل القراءة — وإلا صار الفحص كاذبًا:
 *   · `.no-print` — لوحة الإدخال، يُسقطها مُركِّب المستند نفسه قبل الطباعة.
 *   · `<style>` — نصّ CSS، وفيه تعليقات عربية (كلمة «الهندسة» مثلًا) تطابق أي بحث عن
 *     حرف عربي فتُوهم بتسرّب لا وجود له على الورق.
 *   · `display: none` — ترويسة الشركة التي يُخفيها ملف ورق الشركة (`FormHeader`
 *     يُصيَّر مخفيًا لا محذوفًا)، فهي في `textContent` وليست على الورق.
 */
function printedText(): string {
  const clone = printedRoot().cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print, style, [style*="display: none"]').forEach((el) => el.remove());
  return clone.textContent ?? '';
}

/** يكتب تاريخًا في حقل تاريخ: `DateInput` يثبّت القيمة عند مغادرة الحقل لا عند كل حرف. */
function setDate(label: string, display: string): HTMLElement {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value: display } });
  fireEvent.blur(field);
  return field;
}

/**
 * زر شريط الأدوات بأيقونته لا بنصّه: «معاينة دقيقة» يحمل في تلميحه كلمة «الطباعة»،
 * فالبحث بالنصّ يلتقط زرّين ويقع الاختيار على غير المقصود. الأيقونة تميّز كلًّا منهما.
 */
function toolbarButton(icon: string, label: RegExp): HTMLElement {
  const match = screen
    .getAllByRole('button')
    .find((b) => (b.textContent ?? '').includes(icon) && label.test(b.textContent ?? ''));
  if (!match) throw new Error(`toolbar button not found: ${icon}`);
  return match;
}

const printButton = () => toolbarButton('🖨️', /Print|طباعة/);
const savePdfButton = () => toolbarButton('📄', /Save PDF|حفظ PDF/);

// ── 1 · كاشف الحرف العربي ──────────────────────────────────────────────────────
describe('1 · كاشف الحرف العربي', () => {
  it.each([
    ['عربي أساسي', 'راجيش كومار'],
    ['حرف واحد وسط لاتيني', 'RAJESH ك KUMAR'],
    ['أشكال العرض (لصق من PDF)', 'ﺍﻟﻜﻮﻳﺖ'],
    ['ملحق عربي', 'ݐݑ'],
    ['امتداد عربي A', 'ࢠࢡ'],
    ['رموز رياضية عربية (فوق BMP)', String.fromCodePoint(0x1ee00)],
  ])('يرصد: %s', (_label, value) => {
    expect(containsArabicScript(value)).toBe(true);
  });

  it.each([
    ['لاتيني', 'RAJESH KUMAR'],
    ['أرقام غربية', '1000.000'],
    ['تاريخ', '15/10/2026'],
    ['IBAN', 'KW00XXXX0000000000000000000000'],
    ['ديفاناغارية — مطلوبة لا مرفوضة', 'कर्मचारी ऋण की प्राप्ति'],
    ['ديفاناغارية مع أرقام', 'एक हज़ार 1000.000'],
    ['فارغ', ''],
  ])('لا يرفض: %s', (_label, value) => {
    expect(containsArabicScript(value)).toBe(false);
  });

  it('الأرقام العربية-الهندية تُطبَّع إلى غربية قبل الفحص، فلا تُعدّ تسرّبًا', () => {
    expect(containsArabicScript('١٠٠٠')).toBe(false);
    expect(containsArabicScript('۱۲۳')).toBe(false);
  });

  it('يعيد الحقول المسرِّبة بأسمائها لا مجرد نعم/لا', () => {
    const leaks = findArabicLeaks({ a: 'RAJESH', b: 'راجيش', c: '1000.000', d: 'कर्मचारी' });
    expect(leaks.map((l) => l.field)).toEqual(['b']);
    expect(leaks[0].value).toBe('راجيش');
  });
});

// ── 2 · حلّ القيمة حسب لغة القالب ──────────────────────────────────────────────
describe('2 · القيمة المعروضة تتبع لغة القالب', () => {
  const data: DebtAckData = {
    ...EMPTY_DEBT_ACK_DATA,
    debtorFullName: 'راجيش كومار',
    debtorFullNameLatin: 'RAJESH KUMAR',
    debtorCivilId: '292010100123',
  };

  it('العربي يعرض القيمة العربية', () => {
    expect(resolveFieldValue(data, 'debtorFullName', 'ar')).toBe('راجيش كومار');
  });

  it('الإنجليزي والهندي يعرضان النظير اللاتيني', () => {
    expect(resolveFieldValue(data, 'debtorFullName', 'en')).toBe('RAJESH KUMAR');
    expect(resolveFieldValue(data, 'debtorFullName', 'hi')).toBe('RAJESH KUMAR');
  });

  it('نظير لاتيني فارغ ⇒ فراغ، **لا سقوط إلى العربية**', () => {
    const noTwin = { ...data, debtorFullNameLatin: '' };
    expect(resolveFieldValue(noTwin, 'debtorFullName', 'en')).toBe('');
    expect(resolveFieldValue(noTwin, 'debtorFullName', 'hi')).toBe('');
  });

  it('الحقول غير اللغوية قيمة واحدة في اللغات الثلاث', () => {
    for (const lang of ['ar', 'en', 'hi'] as const) {
      expect(resolveFieldValue(data, 'debtorCivilId', lang)).toBe('292010100123');
    }
  });

  it('لكل حقل لغوي نظير لاتيني معرَّف، ولغير اللغوي لا نظير', () => {
    for (const id of LOCALIZABLE_FIELD_IDS) expect(latinTwinOf(id)).toBe(`${id}Latin`);
    expect(latinTwinOf('debtorCivilId')).toBeNull();
    expect(latinTwinOf('amountFigures')).toBeNull();
  });

  it('الأرقام تخرج غربية دائمًا في القوالب الثلاثة', () => {
    const arabicDigits = { ...EMPTY_DEBT_ACK_DATA, amountFigures: '١٠٠٠.٠٠٠' };
    for (const lang of ['ar', 'en', 'hi'] as const) {
      expect(resolveFieldValue(arabicDigits, 'amountFigures', lang)).toBe('1000.000');
    }
  });
});

// ── 3 · العزل اللغوي في المستند المطبوع ────────────────────────────────────────
describe('3 · لا حرف عربي في القالبين الإنجليزي والهندي', () => {
  it('العربي يعرض بيانات الموظف العربية طبيعياً', async () => {
    await renderForm();
    expect(printedText()).toContain(EMPLOYEE.fullName);
  });

  it.each(['English', 'Hindi'] as const)('%s: لا اسم عربي ولا مهنة عربية في المطبوع', async (aria) => {
    await renderForm();
    switchTo(aria);
    await waitFor(() => expect(docRoot().getAttribute('lang')).toBe(aria === 'English' ? 'en' : 'hi'));
    const text = printedText();
    expect(text).not.toContain(EMPLOYEE.fullName);
    expect(text).not.toContain(EMPLOYEE.jobTitle);
    expect(text).not.toContain(EMPLOYEE.nationality);
    expect(text).toContain(EMPLOYEE.fullNameEn);
  });

  it('الهندي يحتفظ بنصّه الديفاناغاري مع بيانات لاتينية', async () => {
    await renderForm();
    switchTo('Hindi');
    await waitFor(() => expect(docRoot().getAttribute('lang')).toBe('hi'));
    expect(/[ऀ-ॿ]/u.test(printedText())).toBe(true);
    expect(printedText()).toContain(EMPLOYEE.fullNameEn);
  });

  it('`fullNameEn` يُملأ تلقائياً في النظير اللاتيني', () => {
    const map = buildDebtAckAutofill(EMPLOYEE);
    expect(map.debtorFullNameLatin).toBe('RAJESH KUMAR');
    expect(map.debtorSignatoryNameLatin).toBe('RAJESH KUMAR');
  });

  it('القيم العربية لا تُنسخ إلى النظائر اللاتينية — لا نقل ولا تحويل حرفي', () => {
    const map = buildDebtAckAutofill(EMPLOYEE);
    expect(map.debtorJobTitleLatin).toBe('');
    expect(map.debtorNationalityLatin).toBe('');
    expect(map.debtorAddressKuwaitLatin).toBe('');
  });

  it('القيم اللاتينية أصلاً (هاتف/بريد) تُنسخ — إعادة استخدام لا ترجمة', () => {
    const map = buildDebtAckAutofill(EMPLOYEE);
    expect(map.debtorContactLatin).toBe(`${EMPLOYEE.phone} / ${EMPLOYEE.email}`);
    expect(map.creditorNameLatin).toBe(CREDITOR_NAME_LATIN);
  });

  it('حقل يدوي يظهر لكل قيمة لغوية عند اختيار قالب أجنبي فقط', async () => {
    await renderForm();
    const label = translate('page.debtAck.f.debtor_job_title_latin', 'ar');
    expect(screen.queryByLabelText(label)).toBeNull();

    switchTo('English');
    await waitFor(() => expect(screen.getByLabelText(label)).toBeInTheDocument());
    expect(screen.getByText(translate('page.debtAck.foreign_note', 'ar'))).toBeInTheDocument();
    expect(screen.getAllByText(translate('page.debtAck.foreign_helper', 'ar')).length).toBe(
      LOCALIZABLE_FIELD_IDS.length,
    );
  });

  it('القيمة اليدوية تظهر في الإنجليزي **وفي الهندي** — تُدخَل مرة واحدة', async () => {
    await renderForm();
    switchTo('English');
    const label = translate('page.debtAck.f.debtor_job_title_latin', 'ar');
    await waitFor(() => expect(screen.getByLabelText(label)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'Maintenance Technician' } });

    await waitFor(() => expect(printedText()).toContain('Maintenance Technician'));
    switchTo('Hindi');
    await waitFor(() => expect(printedText()).toContain('Maintenance Technician'));
  });
});

// ── 4 · البوابة تمنع المعاينة والطباعة وتصدير PDF ─────────────────────────────
describe('4 · بوابة القالب الأجنبي', () => {
  /** يضع قيمة عربية في نظير لاتيني — وهو ما يجب أن يمنع الإخراج. */
  async function leakArabicIntoLatin() {
    switchTo('English');
    const label = translate('page.debtAck.f.debtor_job_title_latin', 'ar');
    await waitFor(() => expect(screen.getByLabelText(label)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'عامل صيانة' } });
    await waitFor(() => expect(printedText()).toContain('عامل صيانة'));
  }

  it('الطباعة ممنوعة، ولا تصل إلى بوابة الطباعة إطلاقاً', async () => {
    await renderForm();
    await leakArabicIntoLatin();
    fireEvent.click(printButton());

    await waitFor(() =>
      expect(
        screen.getAllByText(translate('page.debtAck.arabic_block_title', 'ar'), { exact: false }).length,
      ).toBeGreaterThan(0),
    );
    const bridge = (window as unknown as { manar: { printSubmit: ReturnType<typeof vi.fn> } }).manar;
    expect(bridge.printSubmit).not.toHaveBeenCalled();
  });

  it('تصدير PDF ممنوع كذلك — بوابة على الطباعة وحدها ليست بوابة', async () => {
    await renderForm();
    await leakArabicIntoLatin();
    fireEvent.click(savePdfButton());

    await waitFor(() =>
      expect(
        screen.getAllByText(translate('page.debtAck.arabic_block_title', 'ar'), { exact: false }).length,
      ).toBeGreaterThan(0),
    );
  });

  it('الحقول المسبِّبة تُعرض بأسمائها المقروءة', async () => {
    await renderForm();
    await leakArabicIntoLatin();
    const jobLabel = translate('page.debtAck.f.debtor_job_title', 'ar');
    await waitFor(() =>
      expect(screen.getByText(new RegExp(jobLabel), { selector: 'li' })).toBeInTheDocument(),
    );
  });

  it('القالب العربي لا يُمنع أبداً — لغته هي العربية', async () => {
    await renderForm();
    fireEvent.click(printButton());
    await waitFor(() => {
      const bridge = (window as unknown as { manar: { printSubmit: ReturnType<typeof vi.fn> } }).manar;
      expect(bridge.printSubmit).toHaveBeenCalled();
    });
  });

  it('بيانات نظيفة ⇒ لا منع في الإنجليزي', async () => {
    await renderForm();
    switchTo('English');
    await waitFor(() => expect(docRoot().getAttribute('lang')).toBe('en'));
    expect(findArabicLeaks(resolveDynamicValues({
      ...EMPTY_DEBT_ACK_DATA,
      ...(buildDebtAckAutofill(EMPLOYEE) as Partial<DebtAckData>),
    } as DebtAckData, 'en'))).toEqual([]);
  });

  it('البوابة نفسها تحرس المسارات الثلاثة — الشاشة تمرّرها لاعتراضَي الطباعة والتصدير', () => {
    const page = fs.readFileSync('src/pages/EmployeeDebtAcknowledgment.tsx', 'utf8');
    expect(page).toMatch(/printIntercept=\{gate\}/);
    expect(page).toMatch(/exportIntercept=\{gate\}/);
    // المعاينة الدقيقة تمرّ من نفس الفحص قبل التركيب.
    expect(page).toMatch(/if \(blockReason\) throw new Error\(blockReason\)/);
  });
});

// ── 5 · بيانات الشركة الثابتة ──────────────────────────────────────────────────
describe('5 · السجل التجاري والرقم الموحّد', () => {
  it('القيم معرَّفة مرة واحدة ولا تتكرر نصّاً في أي ملف آخر', () => {
    expect(CREDITOR_COMMERCIAL_REGISTRATION_NO).toBe('509001');
    expect(CREDITOR_UNIFIED_NUMBER).toBe('554731');

    const dir = 'src/forms/debtAcknowledgment';
    const offenders = fs
      .readdirSync(dir)
      .filter((f) => f !== 'constants.ts')
      .filter((f) => {
        const src = fs.readFileSync(`${dir}/${f}`, 'utf8');
        return src.includes('509001') || src.includes('554731');
      });
    expect(offenders).toEqual([]);
  });

  it('تُفرض على كل حالة — بعد المسح وبعد تحميل مسودّة قديمة لا تحملها', () => {
    const fresh = withFixedCreditorData(EMPTY_DEBT_ACK_DATA);
    expect(fresh.creditorCommercialReg).toBe(CREDITOR_COMMERCIAL_REGISTRATION_NO);
    expect(fresh.creditorCivilId).toBe(CREDITOR_UNIFIED_NUMBER);

    const staleDraft = { ...EMPTY_DEBT_ACK_DATA, creditorCommercialReg: '000000', creditorCivilId: '' };
    const repaired = withFixedCreditorData(staleDraft);
    expect(repaired.creditorCommercialReg).toBe(CREDITOR_COMMERCIAL_REGISTRATION_NO);
    expect(repaired.creditorCivilId).toBe(CREDITOR_UNIFIED_NUMBER);
  });

  it('الملء التلقائي لا يتركها فارغة ولا يدهسها بقيمة الموظف', () => {
    const filled = applyAutofill(EMPTY_DEBT_ACK_DATA, buildDebtAckAutofill(EMPLOYEE));
    expect(filled.creditorCommercialReg).toBe(CREDITOR_COMMERCIAL_REGISTRATION_NO);
    expect(filled.creditorCivilId).toBe(CREDITOR_UNIFIED_NUMBER);
  });

  it('تظهر في المستند المطبوع في القوالب الثلاثة', async () => {
    await renderForm();
    for (const aria of ['Arabic', 'English', 'Hindi'] as const) {
      switchTo(aria);
      await waitFor(() => {
        const text = printedText();
        expect(text).toContain(CREDITOR_COMMERCIAL_REGISTRATION_NO);
        expect(text).toContain(CREDITOR_UNIFIED_NUMBER);
      });
    }
  });

  it('للقراءة فقط في شاشة الإدخال — لا يعدّلها المستخدم سهواً', async () => {
    await renderForm();
    const cr = screen.getByLabelText(translate('page.debtAck.f.creditor_commercial_reg', 'ar'));
    const unified = screen.getByLabelText(translate('page.debtAck.f.creditor_civil_id', 'ar'));
    expect(cr).toHaveAttribute('readOnly');
    expect(unified).toHaveAttribute('readOnly');
    expect(cr).toHaveValue(CREDITOR_COMMERCIAL_REGISTRATION_NO);
    expect(unified).toHaveValue(CREDITOR_UNIFIED_NUMBER);
  });
});

// ── 6 · الأقساط داخل المستند ───────────────────────────────────────────────────
describe('6 · جدول السداد في المستند', () => {
  async function fillLoan() {
    fireEvent.change(screen.getByLabelText(translate('page.debtAck.f.amount_figures', 'ar')), {
      target: { value: '1000.000' },
    });
    fireEvent.change(screen.getByLabelText(translate('page.debtAck.f.installments_count', 'ar')), {
      target: { value: '5' },
    });
    setDate(translate('page.debtAck.f.first_installment_date', 'ar'), '15/10/2026');
    await waitFor(() => expect(printedText()).toContain('15/10/2026'));
  }

  it('يُولَّد تلقائياً ويظهر في الملحق بالقيم والتواريخ والأرصدة', async () => {
    await renderForm();
    await fillLoan();
    const text = printedText();
    expect((text.match(/200\.000/g) ?? []).length).toBeGreaterThanOrEqual(5);
    for (const date of ['15/10/2026', '15/11/2026', '15/12/2026', '15/01/2027', '15/02/2027']) {
      expect(text).toContain(date);
    }
    expect(text).toContain('800.000');
    expect(text).toContain('0.000');
  });

  it('حقول البند 4 محسوبة من الجدول لا مُدخَلة', async () => {
    await renderForm();
    await fillLoan();
    expect(screen.getByLabelText(translate('page.debtAck.f.installment_amount', 'ar'))).toHaveAttribute('readOnly');
    expect(screen.getByLabelText(translate('page.debtAck.f.final_installment_amount', 'ar'))).toHaveValue('200.000');
    expect(screen.getByLabelText(translate('page.debtAck.f.monthly_due_day', 'ar'))).toHaveValue('15');
  });

  it('نفس الجدول في القوالب الثلاثة — مصدر واحد لا ثلاثة حاسبات', async () => {
    await renderForm();
    await fillLoan();
    for (const aria of ['Arabic', 'English', 'Hindi'] as const) {
      switchTo(aria);
      await waitFor(() => {
        const text = printedText();
        expect(text).toContain('15/11/2026');
        expect((text.match(/200\.000/g) ?? []).length).toBeGreaterThanOrEqual(5);
      });
    }
  });

  it('لاحقة العملة من ملف Word لا من اللغة', async () => {
    await renderForm();
    await fillLoan();
    expect(printedText()).toContain('200.000 د.ك');
    switchTo('English');
    await waitFor(() => expect(printedText()).toContain('200.000 KWD'));
  });

  it('تجاوز سعة الملحق يظهر كخلل صريح ولا يولّد صفوفاً خارج التصميم', async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(translate('page.debtAck.f.amount_figures', 'ar')), {
      target: { value: '1000.000' },
    });
    fireEvent.change(screen.getByLabelText(translate('page.debtAck.f.installments_count', 'ar')), {
      target: { value: String(MAX_INSTALLMENTS + 1) },
    });
    await waitFor(() =>
      expect(screen.getByText(translate('page.debtAck.issue.countAboveMax', 'ar'))).toBeInTheDocument(),
    );
    // (12 صفًا + ترويسة) × نسختَي الملحق — النسخة الثانية مطابقة، فسعتها هي هي.
    expect(document.querySelectorAll('.eda-tbl--annex tr').length).toBe(2 * (MAX_INSTALLMENTS + 1));
  });

  it('تعديل يدوي ثم تغيير مُدخَل ⇒ سؤال قبل الاستبدال، لا مسح صامت', async () => {
    await renderForm();
    await fillLoan();

    const firstAmount = screen.getAllByTitle(`${translate('page.debtAck.schedule_col_amount', 'ar')} 1`)[0];
    fireEvent.change(firstAmount, { target: { value: '300' } });
    await waitFor(() =>
      expect(screen.getByText(translate('page.debtAck.schedule_manual_badge', 'ar'))).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(translate('page.debtAck.f.amount_figures', 'ar')), {
      target: { value: '900.000' },
    });
    await waitFor(() =>
      expect(screen.getByText(translate('page.debtAck.schedule_recalc_confirm', 'ar'))).toBeInTheDocument(),
    );

    // الإلغاء يُبقي التعديل اليدوي كما هو.
    // تسمية الإلغاء الافتراضية في `ConfirmModal`.
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    await waitFor(() => expect(firstAmount).toHaveValue(300));
  });

  it('الرصيد محسوب لا مُدخَل: لا حقل إدخال في عمود الرصيد', async () => {
    await renderForm();
    await fillLoan();
    // عنوان العمود نفسه موجود أيضًا في ملحق المستند، فيُبحث داخل لوحة الإدخال وحدها.
    const panel = document.querySelector('.no-print') as HTMLElement;
    const balanceHeader = Array.from(panel.querySelectorAll('th')).find(
      (th) => th.textContent === translate('page.debtAck.schedule_col_balance', 'ar'),
    )!;
    const table = balanceHeader.closest('table')!;
    const balanceCells = Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.children[3]);
    for (const cellEl of balanceCells) expect(cellEl.querySelector('input')).toBeNull();
  });
});

// ── 7 · مساحة التوقيع ─────────────────────────────────────────────────────────
describe('7 · مساحة التوقيع مضاعفة', () => {
  // صفحة الملحق تُطبع مرتين بقرار مالك المنتج، فسطرا توقيعها يظهران في كل نسخة —
  // وأسماء المناطق تحمل رقم النسخة كي يقيس مقياسُ الهندسة كلًّا منها على حدة.
  //
  // وعمودا التوقيع يتبادلان موضعهما في العربية: ترتيب DOM هناك معكوس ليخرج الشكل
  // مطابقًا لملف Word (الدائن يسارًا)، فيسبق «المدين» في الشجرة. الاسم يُشتقّ من
  // **الدور** لا من الموضع، فلا يحمل توقيعُ أحدهما اسمَ الآخر — وهذا ما يثبته هذا
  // الاختبار: نفس المجموعة في اللغات الثلاث، بترتيبٍ يتبع اتجاه القالب.
  const AREAS_LTR = [
    'creditor-signature',
    'debtor-signature',
    'witness-1',
    'witness-2',
    'interpreter',
    'annex1-signature-1',
    'annex1-signature-2',
    'annex2-signature-1',
    'annex2-signature-2',
  ];
  const AREAS_RTL = ['debtor-signature', 'creditor-signature', ...AREAS_LTR.slice(2)];
  const EXPECTED_AREAS = AREAS_LTR;

  it.each(['Arabic', 'English', 'Hindi'] as const)('%s: كل خانات التوقيع موجودة ومعلَّمة', async (aria) => {
    await renderForm();
    switchTo(aria);
    await waitFor(() => expect(document.querySelectorAll('[data-eda-sig]').length).toBe(EXPECTED_AREAS.length));
    const areas = Array.from(document.querySelectorAll('[data-eda-sig]')).map((el) =>
      el.getAttribute('data-eda-sig'),
    );
    expect(areas).toEqual(aria === 'Arabic' ? AREAS_RTL : AREAS_LTR);
  });

  it('كل خانة تحمل تسميتها ومساحة كتابة واحدة مخفيّة (المضاعف = 2)', async () => {
    await renderForm();
    for (const el of Array.from(document.querySelectorAll('[data-eda-sig]'))) {
      expect(el.querySelector('.eda-sig-label')).toBeTruthy();
      expect(el.querySelectorAll('.eda-sig-space').length).toBe(1);
      // المساحة المضافة نسخة **غير مرئية**: تحجز الارتفاع ولا تُطبع.
      expect(el.querySelector('.eda-sig-space')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('الحشو السفلي ثلاثة أمثال العلوي — فيتضاعف صندوق الكتابة بالضبط', async () => {
    await renderForm();
    for (const el of Array.from(document.querySelectorAll('[data-eda-sig]'))) {
      const cell = el.closest('td') as HTMLElement;
      const top = parseFloat(cell.style.paddingTop);
      const bottom = parseFloat(cell.style.paddingBottom);
      expect(bottom).toBeCloseTo(top * 3, 5);
    }
  });

  it('التسميات باقية ولم يُحذف نصّ توقيع', async () => {
    await renderForm();
    const text = printedText();
    for (const label of ['التوقيع والختم:', 'التوقيع:', 'شاهد أول:', 'شاهد ثانٍ:', 'المترجم - عند الحاجة:']) {
      expect(text).toContain(label);
    }
  });

  it('كتلة التوقيعات لا تُشطر بين صفحتين', async () => {
    await renderForm();
    expect(document.querySelectorAll('.eda-sig-block').length).toBe(2);
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
    expect(css).toMatch(/\.eda-sig-block\s*\{[^}]*break-inside:\s*avoid/);
  });

  it('عدد التواقيع وترتيبها كما كانا — لا زيادة ولا إعادة ترتيب', async () => {
    await renderForm();
    const rows = document.querySelectorAll('.eda-sig-block')[1].querySelectorAll('tbody tr');
    expect(rows.length).toBe(3); // شاهد أول · شاهد ثانٍ · مترجم
  });
});

// ── 8 · لا انحدار في محرك الطباعة ─────────────────────────────────────────────
describe('8 · محرك الطباعة وملف الطباعة كما هما', () => {
  it('`exportIntercept` إضافي واختياري — بقية النماذج لا تمرّره فلا يتغيّر سلوكها', () => {
    const layout = fs.readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(layout).toMatch(/exportIntercept\?:/);
    // بلا اعتراض: نفس النقرة تستدعي `doExportPdf` مباشرة، كما كانت.
    expect(layout).toMatch(/exportIntercept\s*\n?\s*\?\s*\(\)\s*=>\s*exportIntercept\(\{\s*proceed:\s*doExportPdf/);
    expect(layout).toMatch(/:\s*doExportPdf\s*\n?\s*\}/);

    const pages = fs.readdirSync('src/pages').filter((f) => f.endsWith('.tsx'));
    const users = pages.filter((f) => fs.readFileSync(`src/pages/${f}`, 'utf8').includes('exportIntercept'));
    expect(users).toEqual(['EmployeeDebtAcknowledgment.tsx']);
  });

  it('لم يُنشأ مسار طباعة أو تصدير جديد في هذه الحزمة', () => {
    // تُجرَّد التعليقات: التوثيق **يشرح** مسار الطباعة القائم، والحكم على الكود وحده.
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const dir = 'src/forms/debtAcknowledgment';
    for (const file of fs.readdirSync(dir)) {
      const code = stripComments(fs.readFileSync(`${dir}/${file}`, 'utf8'));
      expect(code, file).not.toMatch(/printToPDF|webContents|exportPdfFromHtml|window\.print/);
    }
  });

  it('هندسة ملف الطباعة لم تتغيّر بالحزمة', async () => {
    await renderForm();
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
    expect(css).toContain('@page { size: A4; margin: 40mm 16.5mm 20mm 16.5mm; }');
  });

  it('التوليد التلقائي دالّة مشتركة واحدة يستعملها الشاشة والمقياس', () => {
    const seeded = regenerateSchedule({
      ...EMPTY_DEBT_ACK_DATA,
      amountFigures: '1000.000',
      installmentsCount: '5',
      firstInstallmentDate: '2026-10-15',
    });
    expect(seeded.schedule).toHaveLength(5);
    expect(seeded.scheduleManual).toBe(false);
    expect(seeded.installmentAmount).toBe('200.000');
    expect(seeded.finalInstallmentDate).toBe('2027-02-15');
    expect(seeded.monthlyDueDay).toBe('15');
  });
});
