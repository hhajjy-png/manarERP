// @vitest-environment jsdom
/**
 * Employee Debt Acknowledgment Administrative Form v1 — العقد الذي تحرسه هذه الاختبارات.
 *
 * (أمانةُ النصّ مقابل ملفات Word تُحرَس في ملف منفصل:
 *  `debtAcknowledgmentDocxFidelity.test.ts`.)
 *
 *  1. النموذج ظاهر في مركز النماذج الإدارية بعنوانه من i18n بكلتا اللغتين.
 *  2. الشاشة تقرأ الموظف من نقطة النهاية المخصّصة، وتملأ بيانات المدين تلقائيًا.
 *  3. تعديل المستخدم يخصّ المستند وحده: **لا استدعاء كتابة واحد** لوحدة الموظفين،
 *     والملء التلقائي لا يدهس ما كُتب بيد المستخدم.
 *  4. تبديل القالب (العربية / English / हिन्दी) يعرض نصّ اللغة المختارة، وتُحقن فيه
 *     **نفس** البيانات المُدخلة مرة واحدة.
 *  5. الهندسة: ملف طباعة مستقل بحزام 40mm علوي و20mm سفلي، و`FormLayout` يُصدر
 *     `@page` بهذه القيم بالذات — وهي القيم نفسها التي قاسها مقياس الطباعة الفعلي.
 *  6. لا تسرّب: لا ترويسة تطبيق، ولا رقم نموذج، ولا كتلة اعتماد، ولا رمز QR.
 *  7. لا انحدار: كل ملفات الطباعة القائمة وقائمة القابلة للاختيار كما هي حرفًا بحرف،
 *     وبقية بطاقات النماذج الإدارية لم تُمَسّ.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import fs from 'node:fs';

import EmployeeDebtAcknowledgment from '../pages/EmployeeDebtAcknowledgment';
import { FORM_CARDS } from '../forms/shared/formsRegistry';
import { PRINT_PROFILES, SELECTABLE_PROFILE_IDS, getPrintProfileStyle } from '../forms/shared/printProfiles';
import { t as translate } from '../lib/i18n';
import { api } from '../api/client';
import {
  applyAutofill,
  buildDebtAckAutofill,
} from '../forms/debtAcknowledgment/debtAcknowledgmentAutofill';
import { EMPTY_DEBT_ACK_DATA } from '../forms/debtAcknowledgment/debtAcknowledgmentModel';
import { DEBT_ACK_CONTENT } from '../forms/debtAcknowledgment/DebtAcknowledgmentTemplate';
import { integerToWords, amountToWordsKWD } from '../lib/tafqeet';

const PROFILE_ID = 'employee-debt-acknowledgment-letterhead';
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
  address: 'الفروانية — قطعة 3 — شارع 12',
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
  // كل مسارات الكتابة مُراقَبة — الادّعاء أن النموذج لا يمسّ سجل الموظف يُثبت بعدم
  // استدعائها، فلا بدّ أن تكون جواسيس لا دوالّ حقيقية.
  vi.spyOn(api, 'put').mockImplementation((async () => ({ data: { data: {} } })) as never);
  vi.spyOn(api, 'patch').mockImplementation((async () => ({ data: { data: {} } })) as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { manar?: unknown }).manar;
});

async function renderForm() {
  const view = render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/forms/employee-debt-acknowledgment/42']}>
      <Routes>
        <Route path={ROUTE} element={<EmployeeDebtAcknowledgment />} />
      </Routes>
    </MemoryRouter>,
  );
  // ننتظر **اكتمال الملء التلقائي** لا مجرد ظهور القالب: القالب يُصيَّر لحظة وصول
  // الموظف، ويجري الملء في التأثير التالي — فانتظار العقدة وحدها سباقٌ يظهر تحت الحمل.
  await waitFor(() => expect(document.querySelector('.eda-root')?.textContent).toContain(EMPLOYEE.code));
  return view;
}

const printedRoot = () => document.querySelector('.form-page') as HTMLElement;

// ── 1. التسجيل في مركز النماذج الإدارية ───────────────────────────────────────
describe('1 · النموذج في صفحة النماذج الإدارية', () => {
  const card = FORM_CARDS.find((c) => c.key === 'employee-debt-acknowledgment');

  it('البطاقة مسجّلة بنفس نمط البطاقات القائمة', () => {
    expect(card).toBeDefined();
    expect(card!.route).toBe('employee-debt-acknowledgment');
    expect(card!.category).toBe('hr');
    expect(card!.requiresEmployee).not.toBe(false); // نموذج مرتبط بموظف
    expect(card!.description.trim().length).toBeGreaterThan(10);
    expect(card!.descriptionEn.trim().length).toBeGreaterThan(10);
  });

  it('العنوان يُحلّ من i18n بالعربية والإنجليزية', () => {
    expect(translate(card!.titleKey, 'ar')).toBe('إقرار دين موظف');
    expect(translate(card!.titleKey, 'en')).toBe('Employee Debt Acknowledgment');
  });

  it('المسار مسجَّل في App.tsx خلف ProtectedRoute', () => {
    const app = fs.readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain('/forms/employee-debt-acknowledgment/:employeeId');
    const line = app.split('\n').find((l) => l.includes('/forms/employee-debt-acknowledgment/'))!;
    expect(line).toContain('<ProtectedRoute>');
  });

  it('لم تُمَسّ بقية بطاقات النماذج الإدارية', () => {
    const others = FORM_CARDS.filter((c) => c.key !== 'employee-debt-acknowledgment');
    expect(others.map((c) => c.key)).toEqual([
      'salary-certificate',
      'to-whom-it-may-concern',
      'leave-request',
      'return-to-work',
      'salary-advance',
      'resignation',
      'employee-warning',
      'performance-evaluation',
      'employment-contract',
      'quotation',
      'purchase-request',
      'receipt-voucher',
      'payment-voucher',
      'blank-a4-print',
      'official-letter',
    ]);
  });
});

// ── 2–3. اختيار الموظف، الملء التلقائي، وحرمة سجل الموظف ──────────────────────
describe('2 · اختيار الموظف والملء التلقائي', () => {
  it('الشاشة تقرأ الموظف من نقطة النهاية المخصّصة لهذا النموذج', async () => {
    await renderForm();
    expect(api.get).toHaveBeenCalledWith('/forms/employee-debt-acknowledgment/42');
  });

  it('بيانات المدين تُملأ تلقائيًا من سجل الموظف داخل المستند المطبوع', async () => {
    await renderForm();
    const text = printedRoot().textContent ?? '';
    for (const value of [
      EMPLOYEE.fullName,
      EMPLOYEE.civilId,
      EMPLOYEE.nationality,
      EMPLOYEE.passportNumber,
      EMPLOYEE.code,
      EMPLOYEE.jobTitle,
      EMPLOYEE.address,
    ]) {
      expect(text).toContain(value);
    }
    expect(text).toContain(`${EMPLOYEE.phone} / ${EMPLOYEE.email}`);
  });

  it('خريطة الملء تغطي حقول المدين وحدها زائد اسم الدائن — بلا حقل مخترَع', () => {
    const map = buildDebtAckAutofill(EMPLOYEE);
    expect(Object.keys(map).sort()).toEqual(
      [
        // القالب العربي
        'creditorName',
        'debtorAddressKuwait',
        'debtorCivilId',
        'debtorContact',
        'debtorEmployeeNo',
        'debtorFullName',
        'debtorJobTitle',
        'debtorNationality',
        'debtorPassportNo',
        'debtorSignatoryName',
        // النظائر اللاتينية للقالبين الإنجليزي والهندي — نفس الحقول، لا حقول جديدة
        'creditorNameLatin',
        'debtorAddressKuwaitLatin',
        'debtorContactLatin',
        'debtorFullNameLatin',
        'debtorJobTitleLatin',
        'debtorNationalityLatin',
        'debtorSignatoryNameLatin',
      ].sort(),
    );
  });
});

describe('3 · تعديل يدوي لا يمسّ سجل الموظف', () => {
  it('لا استدعاء كتابة (PUT/PATCH/POST) لوحدة الموظفين عند تعديل أي حقل', async () => {
    await renderForm();
    const jobTitle = screen.getByLabelText(translate('page.debtAck.f.debtor_job_title', 'ar'));
    fireEvent.change(jobTitle, { target: { value: 'مسمّى مُعدَّل لهذا المستند فقط' } });

    expect(api.put).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    const posts = (api.post as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    for (const [url] of posts) expect(String(url)).not.toMatch(/^\/employees/);
    expect(printedRoot().textContent).toContain('مسمّى مُعدَّل لهذا المستند فقط');
  });

  it('الملء التلقائي لا يدهس قيمة كتبها المستخدم', () => {
    const edited = { ...EMPTY_DEBT_ACK_DATA, debtorJobTitle: 'قيمة المستخدم' };
    const merged = applyAutofill(edited, buildDebtAckAutofill(EMPLOYEE));
    expect(merged.debtorJobTitle).toBe('قيمة المستخدم');
    expect(merged.debtorCivilId).toBe(EMPLOYEE.civilId); // الفارغ يُملأ
  });

  it('الملء التلقائي لا يعدّل الكائن الأصلي (بلا طفرة)', () => {
    const before = { ...EMPTY_DEBT_ACK_DATA };
    const merged = applyAutofill(before, buildDebtAckAutofill(EMPLOYEE));
    expect(before.debtorCivilId).toBe('');
    expect(merged).not.toBe(before);
  });
});

// ── 4. تبديل اللغة وبيانات واحدة لثلاثة قوالب ─────────────────────────────────
describe('4 · تبديل القالب وحقن نفس البيانات', () => {
  it('يبدأ بالعربية، ويعرض مبدّلًا بثلاث لغات', async () => {
    await renderForm();
    expect(document.querySelector('.eda-root')).toHaveAttribute('lang', 'ar');
    for (const label of ['Arabic', 'English', 'Hindi']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it.each([
    ['English', 'en', 'ltr'],
    ['Hindi', 'hi', 'ltr'],
    ['Arabic', 'ar', 'rtl'],
  ] as const)('اختيار %s يعرض نصّ ذلك القالب بالاتجاه الصحيح', async (aria, lang, dir) => {
    await renderForm();
    fireEvent.click(screen.getByLabelText(aria));
    await waitFor(() => {
      expect(document.querySelector('.eda-root')).toHaveAttribute('lang', lang);
    });
    const root = document.querySelector('.eda-root')!;
    expect(root).toHaveAttribute('dir', dir);
    const text = root.textContent ?? '';
    expect(text).toContain(DEBT_ACK_CONTENT[lang].title);
    expect(text).toContain(DEBT_ACK_CONTENT[lang].clauses8to14[6].lead); // البند 14
    // لا تسرّب نصّ من قالب آخر
    for (const other of (['ar', 'en', 'hi'] as const).filter((l) => l !== lang)) {
      expect(text).not.toContain(DEBT_ACK_CONTENT[other].preamble);
    }
  });

  it('البيانات المُدخلة مرة واحدة تظهر في القوالب الثلاثة بلا إعادة إدخال', async () => {
    await renderForm();
    const amount = screen.getByLabelText(translate('page.debtAck.f.amount_figures', 'ar'));
    fireEvent.change(amount, { target: { value: '750.000' } });
    const iban = screen.getByLabelText(translate('page.debtAck.f.iban', 'ar'));
    fireEvent.change(iban, { target: { value: 'KW11TEST0000000000000000000000' } });

    // القيم غير اللغوية (المبالغ، الـIBAN) واحدة في القوالب الثلاثة. أما اسم الموظف
    // فلغويّ: العربي في القالب العربي، ونظيره اللاتيني في القالبين الأجنبيين — وهو
    // بالضبط ما يمنع تسليم عامل مستندًا لا يقرؤه.
    const expectedName: Record<string, string> = {
      Arabic: EMPLOYEE.fullName,
      English: EMPLOYEE.fullNameEn,
      Hindi: EMPLOYEE.fullNameEn,
    };
    for (const aria of ['Arabic', 'English', 'Hindi']) {
      fireEvent.click(screen.getByLabelText(aria));
      await waitFor(() => {
        const text = document.querySelector('.eda-root')!.textContent ?? '';
        expect(text).toContain('750.000');
        expect(text).toContain('KW11TEST0000000000000000000000');
        expect(text).toContain(expectedName[aria]);
      });
      if (aria !== 'Arabic') {
        expect(document.querySelector('.eda-root')!.textContent).not.toContain(EMPLOYEE.fullName);
      }
    }
  });

  it('المبلغ بالحروف خانة لكل لغة — والاقتراح للعربية والإنجليزية فقط', async () => {
    await renderForm();
    for (const key of ['amount_words_ar', 'amount_words_en', 'amount_words_hi']) {
      expect(screen.getByLabelText(translate(`page.debtAck.f.${key}`, 'ar'))).toBeInTheDocument();
    }
    // خانتان هنديتان (المبلغ والرصيد) تحملان التنبيه نفسه — ولا تحمله أي خانة عربية/إنجليزية.
    expect(screen.getAllByText(translate('page.debtAck.words_manual_hi', 'ar'))).toHaveLength(2);
  });

  it('اقتراح التفقيط يعيد استخدام محرّك المشروع بلا ازدواج وحدة العملة', () => {
    // النصّ حول الفراغ في ملف Word يحمل «فقط … ديناراً كويتياً لا غير» أصلًا،
    // فالخانة تحتاج العدد وحده لا العبارة الكاملة.
    expect(integerToWords(500, 'ar')).toBe('خمسمائة');
    expect(integerToWords(500, 'en')).toBe('Five Hundred');
    expect(integerToWords(500.5, 'ar')).toBe(''); // كسور: لا اقتراح، إدخال يدوي
    expect(integerToWords(-1, 'ar')).toBe('');
    // المحرّك الكامل لم يتغيّر لأي مستهلك قائم.
    expect(amountToWordsKWD(500, 'ar')).toBe('فقط خمسمائة دينار كويتي لا غير');
  });
});

// ── 5. هندسة الطباعة ──────────────────────────────────────────────────────────
describe('5 · هندسة الطباعة (40mm أعلى / 20mm أسفل)', () => {
  const profile = PRINT_PROFILES[PROFILE_ID];

  it('ملف طباعة مستقل بالحزامين المطلوبين، وعلى ورق A4 عمودي', () => {
    expect(profile).toBeDefined();
    expect(profile.margins.top).toBe('40mm');
    expect(profile.margins.bottom).toBe('20mm');
    expect(profile.page).toEqual({ size: 'A4', orientation: 'portrait' });
    // الهامشان الأفقيان من ملف Word نفسه (`w:pgMar left/right = 935 twips`).
    expect(profile.margins.left).toBe('16.5mm');
    expect(profile.margins.right).toBe('16.5mm');
  });

  it('الملف مخصّص لهذا المستند: لا يظهر في مبدّل أي نموذج آخر، ولا يحمل ترويسة', () => {
    expect(profile.selectable).toBe(false);
    expect(SELECTABLE_PROFILE_IDS).not.toContain(PROFILE_ID);
    expect(profile.blankHeader).toBe(true); // الورقة الفيزيائية تحمل الترويسة
    expect(profile.logoHeader).toBe(false); // فلا يُرسم شعار فوقها
  });

  it('`FormLayout` يُصدر @page بنفس قيم الملف، و`.form-page` بلا حشو عند الطباعة', async () => {
    await renderForm();
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    expect(css).toContain('@page { size: A4; margin: 40mm 16.5mm 20mm 16.5mm; }');
    expect(css).toMatch(/\.form-page\s*\{[^}]*padding:\s*0\s*!important/);
    expect(getPrintProfileStyle(profile)).toBe('40mm 16.5mm 20mm 16.5mm');
  });

  it('القالب يحمل فواصل صفحات DOCX الثلاثة — أربعة أقسام، بلا فاصل مخترَع', async () => {
    await renderForm();
    expect(document.querySelectorAll('.eda-page')).toHaveLength(4);
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    expect(css).toMatch(/\.eda-page \+ \.eda-page\s*\{[^}]*break-before:\s*page/);
  });

  it('حزاما الترويسة والتذييل يظهران على الشاشة كدليلين، وسطر الطباعة لا يضيف حشوًا', async () => {
    await renderForm();
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    expect(css).toContain('padding: 40mm 16.5mm 20mm;'); // نموذج الشاشة
    expect(css).toMatch(/\.eda-page::before \{ top: 40mm; \}/);
    expect(css).toMatch(/\.eda-page::after \{ bottom: 20mm; \}/);
  });
});

// ── 6. لا تسرّب ترويسة/تذييل/QR ────────────────────────────────────────────────
describe('6 · لا تسرّب ترويسة تطبيق ولا تذييل ولا QR', () => {
  it('العقدة المطبوعة تخلو من رقم النموذج وكتلة الاعتماد ورمز QR', async () => {
    await renderForm();
    const root = printedRoot();
    expect(root.querySelector('canvas')).toBeNull(); // FormQRCode يرسم على canvas
    expect(root.querySelector('.form-page-footer')).toBeNull();
    expect(root.querySelector('h1.eda-title')).toBeTruthy(); // عنوان المستند نفسه فقط
    expect(root.textContent).not.toContain('EDA-'); // رقم النموذج لا يُطبع
  });

  it('لا ترويسة شركة مرسومة — الورقة الفيزيائية تحملها', async () => {
    await renderForm();
    const root = printedRoot();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).not.toContain('ALAMANAR ALDAWLIYA');
  });

  it('لوحة الإدخال `.no-print` — يُسقطها مُركِّب المستند قبل الطباعة و PDF', async () => {
    await renderForm();
    const entry = printedRoot().querySelector('.no-print');
    expect(entry).toBeTruthy();
    expect(entry!.textContent).toContain(translate('page.debtAck.entry_header', 'ar'));
  });
});

// ── 7. تطابق المعاينة والطباعة، وعدم الانحدار ─────────────────────────────────
describe('7 · المعاينة والطباعة من نفس المصدر، وبلا انحدار', () => {
  it('المستند عقدة `.form-page` واحدة — وهي مصدر الطباعة والمعاينة الدقيقة و PDF', async () => {
    await renderForm();
    expect(document.querySelectorAll('.form-page')).toHaveLength(1);
    expect(printedRoot().querySelector('.eda-root')).toBeTruthy();
  });

  it('ملفات الطباعة القائمة لم تتغيّر قيمها', () => {
    expect(PRINT_PROFILES['plain-a4'].margins).toEqual({ top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' });
    expect(PRINT_PROFILES['letterhead'].margins).toEqual({ top: '40mm', right: '10mm', bottom: '20mm', left: '10mm' });
    expect(PRINT_PROFILES['ready-paper'].margins).toEqual({ top: '40mm', right: '10mm', bottom: '20mm', left: '10mm' });
    expect(PRINT_PROFILES['payment-voucher'].margins).toEqual({ top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' });
    expect(PRINT_PROFILES['receipt-voucher'].margins).toEqual({ top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' });
    expect(PRINT_PROFILES['payment-voucher-letterhead'].margins.top).toBe('45mm');
    expect(PRINT_PROFILES['receipt-voucher-letterhead'].margins.top).toBe('50mm');
  });

  it('قائمة الملفات القابلة للاختيار لم تتوسّع', () => {
    expect(SELECTABLE_PROFILE_IDS).toEqual(['plain-a4', 'letterhead', 'ready-paper']);
  });

  it('التطبيق لا يقرأ ملفات DOCX وقت التشغيل — لا Word ولا Office', () => {
    // ملفات DOCX مصدر تصميم لا تبعية تشغيل: تُذكر في التعليقات التوثيقية فقط، فيُجرَّد
    // التعليق قبل الفحص ويبقى الحكم على **الكود** وحده.
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const files = [
      ...fs.readdirSync('src/forms/debtAcknowledgment').map((f) => `src/forms/debtAcknowledgment/${f}`),
      'src/pages/EmployeeDebtAcknowledgment.tsx',
    ];
    for (const file of files) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      expect(code, `${file}: مرجع DOCX في الكود`).not.toMatch(/\.docx/i);
      expect(code, `${file}: استيراد مكتبة Word`).not.toMatch(/\bmammoth\b|\bjszip\b/i);
      expect(code, `${file}: قراءة من نظام الملفات`).not.toMatch(/\bnode:fs\b/);
    }
  });
});
