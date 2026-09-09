// @vitest-environment jsdom
/**
 * Employee Debt Acknowledgment v1 — التحسينات النهائية · العقد الذي تحرسه هذه الاختبارات.
 *
 *  1. **ملحق عربي يقرأ من اليمين**: «رقم القسط» أقصى اليمين و«ملاحظات/رقم الإيصال»
 *     أقصى اليسار — بإعادة ترتيب أعمدة حقيقية، لا بنصّ معكوس ولا بحيلة `transform`.
 *     والقيم المولَّدة تتبع أعمدتها. والقالبان الإنجليزي والهندي لم يُعكسا.
 *  2. **التعليمات خرجت من المستند ولم تُحذف**: نصّها كامل في حزم المحتوى الثلاث،
 *     ولا أثر له في المطبوع، ويُعرض في حوار خارج `.form-page` بلغة القالب.
 *  3. **الملحق مرتان**: نسختان من مكوّن واحد وبيانات واحدة، الثانية آخر المستند،
 *     بلا وسم «نسخة» ولا علامة مائية، ومصدر تحرير واحد للجدول.
 *  4. **أربع صفحات بالضبط**: الصفحة 2 وحدها مضغوطة، ومساحات التوقيع باقية الضعف،
 *     ولا `transform: scale` ولا `zoom` في أي مستوى.
 *  5. **القياس الفعلي**: تقرير الهندسة المولَّد من إخراج Chromium يثبت الأربع صفحات
 *     والأحزمة وتطابق نسختَي الملحق.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import fs from 'node:fs';
import path from 'node:path';
import { withFormOpenIntent } from '../forms/shared/formOpenIntent';

import EmployeeDebtAcknowledgment from '../pages/EmployeeDebtAcknowledgment';
import { api } from '../api/client';
import { DEBT_ACK_CONTENT, SIGNATURE_SPACE_MULTIPLIER } from '../forms/debtAcknowledgment/DebtAcknowledgmentTemplate';
import { PRINT_PROFILES } from '../forms/shared/printProfiles';
import {
  CREDITOR_IBAN,
  DEFAULT_CREDITOR_CONTACT,
  DEFAULT_CREDITOR_REPRESENTATIVE,
  DEFAULT_CREDITOR_REPRESENTATIVE_LATIN,
  MAX_INSTALLMENTS,
  ROWS_PER_ANNEX_PAGE,
} from '../forms/debtAcknowledgment/constants';
import { EMPTY_DEBT_ACK_DATA } from '../forms/debtAcknowledgment/debtAcknowledgmentModel';
import { applyAutofill, buildDebtAckAutofill, withFixedCreditorData } from '../forms/debtAcknowledgment/debtAcknowledgmentAutofill';
import { regenerateSchedule, scheduleBaseAmount } from '../forms/debtAcknowledgment/debtAcknowledgmentDocument';
import { scheduleTotal } from '../forms/debtAcknowledgment/debtAcknowledgmentSchedule';
import { t as translate } from '../lib/i18n';
import type { DebtAckLang } from '../forms/debtAcknowledgment/debtAcknowledgmentModel';

const ROUTE = '/forms/employee-debt-acknowledgment/:employeeId';
const LANGS: DebtAckLang[] = ['ar', 'en', 'hi'];

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

const TEMPLATE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../forms/debtAcknowledgment/DebtAcknowledgmentTemplate.tsx'),
  'utf-8',
);

/**
 * قواعد المستند وحدها: نصّ `TEMPLATE_CSS` بعد إسقاط تعليقاته.
 *
 * لماذا لا يُفحص الملف خامًا: تعليقاته تشرح ما هو **ممنوع** («لا transform: scale»)،
 * فبحثٌ نصّي في الخام يجد الممنوع في نهيه عنه ويسقط الاختبار على وصفٍ صحيح. ما يهمّ
 * هو ما يصل محرّك الأنماط.
 */
const TEMPLATE_CSS_TEXT = (() => {
  const start = TEMPLATE_SOURCE.indexOf('const TEMPLATE_CSS = `');
  const body = TEMPLATE_SOURCE.slice(start + 'const TEMPLATE_CSS = `'.length);
  return body.slice(0, body.indexOf('`;')).replace(/\/\*[\s\S]*?\*\//g, '');
})();

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
const pages = () => Array.from(docRoot().querySelectorAll('.eda-page'));

/** ما يُطبع فعلًا: بلا لوحة الإدخال، وبلا نصّ CSS، وبلا ما يُخفيه ورق الشركة. */
function printedText(): string {
  const clone = printedRoot().cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print, style, [style*="display: none"]').forEach((el) => el.remove());
  return clone.textContent ?? '';
}

/**
 * يملأ محرّكات الجدول الثلاثة ثم ينتظر ظهور آخر قسط في المطبوع.
 *
 * الانتظار على **آخر** قسط لا على أوّله عمدًا: الخلل الذي أُصلح هنا كان يُظهر الصفحة
 * الأولى صحيحةً ويسقط ما بعدها، فانتظارُ الصفّ الأول كان سيمرّ عليه.
 */
async function fillLoan(count: number, amount = '1000.000') {
  fireEvent.change(screen.getByLabelText(translate('page.debtAck.f.amount_figures', 'ar')), {
    target: { value: amount },
  });
  fireEvent.change(screen.getByLabelText(translate('page.debtAck.f.installments_count', 'ar')), {
    target: { value: String(count) },
  });
  const field = screen.getByLabelText(translate('page.debtAck.f.first_installment_date', 'ar'));
  fireEvent.change(field, { target: { value: '15/10/2026' } });
  fireEvent.blur(field);
  await waitFor(() => expect(annexSections().length).toBe(2 * Math.ceil(count / ROWS_PER_ANNEX_PAGE)));
}

const annexSections = () =>
  Array.from(docRoot().querySelectorAll('.eda-page--annex')) as HTMLElement[];

/** أرقام الصفوف المطبوعة في عمود «رقم القسط» لصفحة ملحق واحدة. */
const annexRowNumbers = (section: HTMLElement) =>
  Array.from(section.querySelectorAll('.eda-tbl--annex tr'))
    .slice(1)
    .map((tr) => (tr.querySelector('[data-eda-col=no]')?.textContent ?? '').trim());

function openInstructions() {
  const button = screen
    .getAllByRole('button')
    .find((b) => (b.textContent ?? '').includes('ℹ'));
  if (!button) throw new Error('instructions button not found');
  fireEvent.click(button);
  return button;
}

// ══ 1 · ملحق (أ) العربي يقرأ من اليمين ════════════════════════════════════════
describe('1 · ترتيب أعمدة ملحق السداد', () => {
  it('العربية: «رقم القسط» أول عمود في DOM — أي أقصى اليمين تحت dir=rtl', () => {
    expect(DEBT_ACK_CONTENT.ar.annexColumns[0]).toBe('رقم القسط');
  });

  it('العربية: «ملاحظات/رقم الإيصال» آخر عمود — أي أقصى اليسار', () => {
    const cols = DEBT_ACK_CONTENT.ar.annexColumns;
    expect(cols[cols.length - 1]).toBe('ملاحظات/رقم الإيصال');
  });

  it('العربية: الترتيب الكامل كما طلبه مالك المنتج، يمينًا إلى يسار', () => {
    expect(DEBT_ACK_CONTENT.ar.annexColumns).toEqual([
      'رقم القسط',
      'تاريخ الاستحقاق',
      'المبلغ المسدد',
      'الرصيد المتبقي بعد القسط',
      'ملاحظات/رقم الإيصال',
    ]);
  });

  it('أدوار الخلايا تتبع ترتيب الأعمدة في اللغات الثلاث — فلا تنفصل قيمة عن عمودها', () => {
    for (const lang of LANGS) {
      const c = DEBT_ACK_CONTENT[lang];
      expect(c.annexNumberFirst).toBe(true);
      expect(c.annexCellRoles).toEqual(['dueDate', 'amount', 'balance', 'notes']);
      // عمود الرقم أولًا، فبقية الأعمدة تساوي عدد الأدوار.
      expect(c.annexColumns.length).toBe(c.annexCellRoles.length + 1);
    }
  });

  it('لا حيلة عكس: الجدول يرث اتجاه المستند ولا يحمل اتجاهًا مقلوبًا ولا transform', () => {
    expect(TEMPLATE_CSS_TEXT).not.toMatch(/eda-tbl--annex[^}]*direction\s*:/);
    expect(TEMPLATE_CSS_TEXT).not.toMatch(/transform\s*:\s*scale/);
    expect(TEMPLATE_CSS_TEXT).not.toMatch(/scaleX\(\s*-1/);
  });

  it('الإنجليزية والهندية لم تُعكسا: رقم القسط أولًا والملاحظات أخيرًا كما في ملفيهما', () => {
    expect(DEBT_ACK_CONTENT.en.annexColumns[0]).toBe('Instalment No.');
    expect(DEBT_ACK_CONTENT.en.annexColumns.at(-1)).toBe('Notes / Receipt No.');
    expect(DEBT_ACK_CONTENT.hi.annexColumns[0]).toBe('किस्त नं.');
    expect(DEBT_ACK_CONTENT.hi.annexColumns.at(-1)).toBe('टिप्पणी / रसीद नं.');
  });

  it('الجدول المُصيَّر يبدأ فعلًا بعمود رقم القسط ثم تاريخ الاستحقاق', async () => {
    await renderForm();
    const annex = docRoot().querySelector('.eda-tbl--annex') as HTMLElement;
    const headers = Array.from(annex.querySelectorAll('tr')[0].children).map((td) =>
      (td.textContent ?? '').trim(),
    );
    expect(headers).toEqual(DEBT_ACK_CONTENT.ar.annexColumns);
    expect(docRoot().getAttribute('dir')).toBe('rtl');
  });
});

// ══ 1-ب · اتجاه **كل** جداول القالب العربي ═══════════════════════════════════
//
// القاعدة ومصدرها: لا جدول من الجداول السبعة في أيٍّ من ملفات DOCX الثلاثة يحمل
// `w:bidiVisual`، فكلّها تُصفّ من اليسار — الخلية الأولى في الشبكة هي اليسرى بصريًا
// مهما كان اتجاه المستند. ولذلك كتب مؤلّف الملف العربي شبكاته **معكوسة** مقابل
// الإنجليزي والهندي. وجذر مستندنا العربي `rtl`، وفيه تُرسم الخلية الأولى في DOM في
// أقصى اليمين — فترتيب DOM المطلوب في العربية هو **عكس** ترتيب الشبكة، وفي
// الإنجليزية والهندية **مطابقٌ** لها.
//
// ما يلي يفحص **ترتيب DOM** (jsdom بلا تخطيط، فلا إحداثيات فيه). والترتيب **البصري**
// بالبكسل يقيسه مقياسُ الهندسة في Chromium ويُفحص في القسم 5 أدناه.
describe('1-ب · جداول القالب العربي كلها', () => {
  const roleRow = (table: HTMLElement, attr: string, rowIndex: number) =>
    Array.from(Array.from(table.querySelectorAll('tr'))[rowIndex].children).map((td) =>
      td.getAttribute(attr),
    );

  const dataTables = () =>
    Array.from(docRoot().querySelectorAll('.eda-tbl')).filter(
      (t) => t.querySelector('[data-eda-cell]') !== null,
    ) as HTMLElement[];

  it('كل جداول البيانات الأربعة (الدائن · المدين · توقيعا الملحق ×2) تبدأ بخلية التسمية', async () => {
    await renderForm();
    const tables = dataTables();
    expect(tables.length).toBe(4);
    for (const table of tables) {
      for (let r = 0; r < table.querySelectorAll('tr').length; r += 1) {
        expect(roleRow(table, 'data-eda-cell', r)).toEqual(['label', 'value']);
      }
    }
  });

  it('جدول التوقيعات: «المدين» أولًا في DOM ⇒ يمينًا، و«الدائن» يسارًا كما في Word', async () => {
    await renderForm();
    const table = docRoot().querySelector('.eda-sig-block') as HTMLElement;
    expect(roleRow(table, 'data-eda-sigcol', 0)).toEqual(['debtor', 'creditor']);
    expect((table.querySelectorAll('tr')[0].children[0].textContent ?? '').trim()).toBe('المدين/الموظف');
  });

  it('وكل صفوف جدول التوقيعات تتبع ترويسته — فلا اسمٌ تحت عمود الطرف الآخر', async () => {
    await renderForm();
    const table = docRoot().querySelector('.eda-sig-block') as HTMLElement;
    const rows = table.querySelectorAll('tr').length;
    for (let r = 0; r < rows; r += 1) expect(roleRow(table, 'data-eda-sigcol', r)).toEqual(['debtor', 'creditor']);
  });

  it('بيانات الموظف تحت عمود المدين، وبيانات الشركة تحت عمود الدائن', async () => {
    await renderForm();
    const table = docRoot().querySelector('.eda-sig-block') as HTMLElement;
    const nameRow = table.querySelectorAll('tr')[1];
    expect(nameRow.children[0].textContent).toContain(EMPLOYEE.fullName);
    expect(nameRow.children[1].textContent).not.toContain(EMPLOYEE.fullName);
  });

  it('جدول الشهود عمود واحد — فلا ترتيب فيه يُفسد', async () => {
    await renderForm();
    const blocks = Array.from(docRoot().querySelectorAll('.eda-sig-block'));
    const witnesses = blocks[1] as HTMLElement;
    for (const tr of Array.from(witnesses.querySelectorAll('tr'))) expect(tr.children.length).toBe(1);
  });

  it('ملحق السداد: «رقم القسط» أول عمود في DOM و«الملاحظات» آخره — في النسختين', async () => {
    await renderForm();
    const annexes = Array.from(docRoot().querySelectorAll('.eda-tbl--annex')) as HTMLElement[];
    expect(annexes.length).toBe(2);
    for (const annex of annexes) {
      expect(roleRow(annex, 'data-eda-col', 0)).toEqual(['no', 'dueDate', 'amount', 'balance', 'notes']);
    }
  });

  it('وكل صفوف الملحق تتبع ترويسته — فلا قيمة مولَّدة تنزلق إلى عمود جارها', async () => {
    await renderForm();
    const annex = docRoot().querySelector('.eda-tbl--annex') as HTMLElement;
    const rows = annex.querySelectorAll('tr').length;
    for (let r = 0; r < rows; r += 1) {
      expect(roleRow(annex, 'data-eda-col', r)).toEqual(['no', 'dueDate', 'amount', 'balance', 'notes']);
    }
  });

  it('الإنجليزية والهندية لم تتأثّرا: ترتيب DOM فيهما هو نفسه ترتيب شبكة ملفَيهما', async () => {
    await renderForm();
    for (const aria of ['English', 'Hindi'] as const) {
      switchTo(aria);
      const sig = docRoot().querySelector('.eda-sig-block') as HTMLElement;
      expect(roleRow(sig, 'data-eda-sigcol', 0)).toEqual(['creditor', 'debtor']);
      const annex = docRoot().querySelector('.eda-tbl--annex') as HTMLElement;
      expect(roleRow(annex, 'data-eda-col', 0)).toEqual(['no', 'dueDate', 'amount', 'balance', 'notes']);
      const table = dataTables()[0];
      expect(roleRow(table, 'data-eda-cell', 0)).toEqual(['label', 'value']);
    }
  });

  it('ولا حيلة بصرية في أي جدول: لا اتجاه مقلوب ولا transform ولا scale', () => {
    expect(TEMPLATE_CSS_TEXT).not.toMatch(/transform\s*:/);
    expect(TEMPLATE_CSS_TEXT).not.toMatch(/scaleX|rotateY|zoom\s*:/);
    // `direction` يظهر في القواعد مرة واحدة فقط، وعلى `.eda-val--ltr` — وهي **عزل
    // اتجاهي لقيمة سطرية** (رقم أو تاريخ أو IBAN داخل فقرة عربية) لا اتجاه جدول:
    // بدونه يعيد محرّك bidi ترتيب `15/06/2026` أو `KW81…`. لا جدول يحمل اتجاهًا،
    // فكلّها ترث اتجاه جذر المستند، وترتيبها ترتيب خلايا حقيقي.
    const directionRules = TEMPLATE_CSS_TEXT.split('\n').filter((line) => /direction\s*:/.test(line));
    expect(directionRules).toHaveLength(1);
    expect(directionRules[0]).toContain('.eda-val--ltr');
    expect(TEMPLATE_CSS_TEXT).not.toMatch(/eda-tbl[^{]*\{[^}]*direction/);
  });
});

// ══ 1-ج · أكثر من اثني عشر قسطاً ═════════════════════════════════════════════
//
// كان عدد الأقساط مربوطًا بعدد صفوف صفحة الملحق، فكان أي عدد فوق الاثني عشر يُرفَض في
// التحقّق ويخرج جدولًا فارغًا. صار الجدولُ يُقسَّم على صفحات ملحق بنفس التصميم، و**تتكرّر
// المجموعة كاملةً** لا صفحةً صفحةً.
describe('1-ج · تقسيم الملحق على صفحات', () => {
  it.each([
    [1, 1],
    [12, 1],
    [13, 2],
    [24, 2],
    [25, 3],
    [36, 3],
  ])('%i قسطاً ⇒ %i صفحة ملحق لكل نسخة (ونسختان في المستند)', async (count, perCopy) => {
    await renderForm();
    await fillLoan(count);
    expect(annexSections()).toHaveLength(perCopy * 2);
    // صفحتا المستند ثم مجموعتا الملحق.
    expect(pages()).toHaveLength(2 + perCopy * 2);
  });

  it('ثلاثة عشر قسطاً: الصفحة الأولى 1–12 والثانية القسط 13 ثم أحد عشر صفًّا فارغًا', async () => {
    await renderForm();
    await fillLoan(13);
    const [first, second] = annexSections();
    expect(annexRowNumbers(first)).toEqual(['1','2','3','4','5','6','7','8','9','10','11','12']);
    expect(annexRowNumbers(second)).toEqual(['13','14','15','16','17','18','19','20','21','22','23','24']);
    // الصفّ الأول مملوء، وما بعده فراغات الأصل — بلا تغيّر في عدد الصفوف.
    const rows = Array.from(second.querySelectorAll('.eda-tbl--annex tr')).slice(1);
    expect(rows).toHaveLength(ROWS_PER_ANNEX_PAGE);
    expect(rows[0].textContent).toContain('15/10/2027');
    expect(rows[1].textContent).toContain('....../....../..........');
  });

  it('كل صفحة ملحق تحمل اثني عشر صفًّا مهما كان عدد الأقساط', async () => {
    await renderForm();
    for (const count of [1, 13, 25]) {
      await fillLoan(count);
      for (const section of annexSections()) {
        expect(Array.from(section.querySelectorAll('.eda-tbl--annex tr')).slice(1)).toHaveLength(
          ROWS_PER_ANNEX_PAGE,
        );
      }
    }
  });

  it('خمسة وعشرون قسطاً: الترقيم متّصل عبر الصفحات الثلاث', async () => {
    await renderForm();
    await fillLoan(25);
    const set = annexSections().slice(0, 3);
    expect(annexRowNumbers(set[0])[0]).toBe('1');
    expect(annexRowNumbers(set[1])[0]).toBe('13');
    expect(annexRowNumbers(set[2])[0]).toBe('25');
    expect(set[2].textContent).toContain('0.000');
  });

  it('المجموعة الأولى كاملةً ثم المجموعة الثانية — لا تبادل بينهما', async () => {
    await renderForm();
    await fillLoan(25);
    const copies = annexSections().map((el) => el.getAttribute('data-eda-annex-copy'));
    const numbers = annexSections().map((el) => el.getAttribute('data-eda-annex-page'));
    expect(copies).toEqual(['1', '1', '1', '2', '2', '2']);
    expect(numbers).toEqual(['1', '2', '3', '1', '2', '3']);
  });

  it('والنسخة الثانية مطابقة للأولى صفحةً بصفحة', async () => {
    await renderForm();
    await fillLoan(25);
    const set = annexSections();
    for (let i = 0; i < 3; i += 1) {
      expect(set[i + 3].textContent).toBe(set[i].textContent);
    }
  });

  it('وآخر صفحة في المستند هي آخر صفحة من المجموعة الثانية', async () => {
    await renderForm();
    await fillLoan(25);
    const last = pages().at(-1) as HTMLElement;
    expect(last.getAttribute('data-eda-annex-copy')).toBe('2');
    expect(last.getAttribute('data-eda-annex-page')).toBe('3');
  });

  it('حتى اثني عشر قسطاً يبقى المستند أربع صفحات كما اعتُمد', async () => {
    await renderForm();
    for (const count of [1, 5, 12]) {
      await fillLoan(count);
      expect(pages()).toHaveLength(4);
      expect(annexSections()).toHaveLength(2);
    }
  });

  it('ترتيب أعمدة الملحق العربي صحيح في **كل** صفحة من الصفحات الست', async () => {
    await renderForm();
    await fillLoan(25);
    for (const section of annexSections()) {
      const head = Array.from(section.querySelectorAll('.eda-tbl--annex tr')[0].children).map((td) =>
        td.getAttribute('data-eda-col'),
      );
      expect(head).toEqual(['no', 'dueDate', 'amount', 'balance', 'notes']);
    }
  });

  it('والإنجليزية والهندية تقسمان مثلها وبترتيب أعمدتهما', async () => {
    await renderForm();
    await fillLoan(25);
    for (const aria of ['English', 'Hindi'] as const) {
      switchTo(aria);
      expect(annexSections()).toHaveLength(6);
      for (const section of annexSections()) {
        const head = Array.from(section.querySelectorAll('.eda-tbl--annex tr')[0].children).map((td) =>
          td.getAttribute('data-eda-col'),
        );
        expect(head).toEqual(['no', 'dueDate', 'amount', 'balance', 'notes']);
      }
    }
  });

  it('مساحة التوقيع ما زالت الضعف على كل صفحة ملحق إضافية', async () => {
    await renderForm();
    await fillLoan(25);
    // خمس خانات في المستند + خانتان لكل صفحة ملحق × ستّ صفحات.
    const areas = Array.from(docRoot().querySelectorAll('[data-eda-sig]'));
    expect(areas).toHaveLength(5 + 2 * 6);
    for (const area of areas) {
      const td = area.closest('td') as HTMLElement;
      expect(parseFloat(td.style.paddingBottom)).toBeCloseTo(parseFloat(td.style.paddingTop) * 3, 5);
    }
  });

  it('ولا صفحة تعليمات واحدة مهما كثرت صفحات الملحق', async () => {
    await renderForm();
    await fillLoan(25);
    expect(printedText()).not.toContain(DEBT_ACK_CONTENT.ar.guidanceTitle);
    expect(document.querySelectorAll('[data-eda-instructions]')).toHaveLength(0);
  });

  it('عنوان الملحق يتكرّر مرة لكل صفحة ملحق، بلا «تابع» ولا ترقيم مُضاف', async () => {
    await renderForm();
    await fillLoan(25);
    const text = printedText();
    expect(text.split(DEBT_ACK_CONTENT.ar.annexTitle).length - 1).toBe(6);
    expect(text).not.toMatch(/تابع|Continued|صفحة \d+ من|\d+\s*\/\s*\d+\s*ملحق/);
  });

  it('كل الأقساط قابلة للتحرير في لوحة الإدخال — لا أوّل اثني عشر منها', async () => {
    await renderForm();
    await fillLoan(25);
    const panel = printedRoot().querySelector('.no-print') as HTMLElement;
    // بالعنوان الكامل `<التسمية> <رقم>` لا ببادئته: حقل «قيمة القسط» المحسوب في أعلى
    // القسم يحمل التسمية نفسها بلا رقم، فالبادئة وحدها كانت تلتقطه معها. ولا يُبنى من
    // التسمية تعبيرٌ نمطي: نصّها «قيمة القسط (د.ك)» يحمل قوسين، فيصيران مجموعةً في
    // التعبير ولا يُطابَقان حرفًا — وهو ما جعل الفحص يعدّ صفرًا.
    const label = translate('page.debtAck.schedule_col_amount', 'ar');
    const amountInputs = Array.from(panel.querySelectorAll('input')).filter((el) => {
      const title = el.getAttribute('title') ?? '';
      if (!title.startsWith(`${label} `)) return false;
      const suffix = title.slice(label.length + 1);
      return suffix.length > 0 && [...suffix].every((ch) => ch >= '0' && ch <= '9');
    });
    expect(amountInputs).toHaveLength(25);
    expect(panel.querySelector(`[title="${translate('page.debtAck.schedule_col_amount', 'ar')} 25"]`)).toBeTruthy();
  });

  it('وجدول واحد قابل للتحرير: لا نسخة منفصلة لكل صفحة ملحق', async () => {
    await renderForm();
    await fillLoan(13);
    const panel = printedRoot().querySelector('.no-print') as HTMLElement;
    // جدول تحرير واحد في اللوحة، ولا صفحة ملحق داخلها.
    expect(panel.querySelectorAll('[data-eda-annex-copy]')).toHaveLength(0);
    const editors = Array.from(panel.querySelectorAll('table')).filter((t) =>
      t.querySelector('input[type=number]'),
    );
    expect(editors).toHaveLength(1);
  });

  it('حقل العدد يقبل الحدّ الجديد لا اثني عشر', async () => {
    await renderForm();
    const field = screen.getByLabelText(translate('page.debtAck.f.installments_count', 'ar'));
    expect(field.getAttribute('max')).toBe(String(MAX_INSTALLMENTS));
    expect(MAX_INSTALLMENTS).toBeGreaterThan(ROWS_PER_ANNEX_PAGE);
  });

  it('عدد غير صالح يُعلَن ولا يُبتلع في جدول فارغ بلا تفسير', async () => {
    await renderForm();
    await fillLoan(13);
    fireEvent.change(screen.getByLabelText(translate('page.debtAck.f.installments_count', 'ar')), {
      target: { value: String(MAX_INSTALLMENTS + 1) },
    });
    await waitFor(() =>
      expect(screen.getByText(translate('page.debtAck.issue.countAboveMax', 'ar'))).toBeInTheDocument(),
    );
  });
});

// ══ 1-د · الرصيد عند التوقيع هو ما تُقسَّط عليه الأقساط ══════════════════════
//
// البند 1 يعلن المبلغ المستلَم، والبند 3 يعلن ما بقي في الذمّة **يوم التوقيع**. والمقسَّط
// هو الثاني: من استلم ألفًا وسدّد مئتين قبل التوقيع يوقّع على جدول مجموعه ثمانمئة.
// وفي السلفة الجديدة القيمتان متساويتان، فيبقى السلوك كما كان.
describe('1-د · الرصيد عند التوقيع', () => {
  const balanceField = () => screen.getByLabelText(translate('page.debtAck.f.balance_figures', 'ar'));
  const amountField = () => screen.getByLabelText(translate('page.debtAck.f.amount_figures', 'ar'));

  it('أصل الدين يملأ الرصيد تلقائياً ما دام لم يُمسّ', async () => {
    await renderForm();
    fireEvent.change(amountField(), { target: { value: '1000.000' } });
    await waitFor(() => expect(balanceField()).toHaveValue('1000.000'));
    fireEvent.change(amountField(), { target: { value: '1200.000' } });
    await waitFor(() => expect(balanceField()).toHaveValue('1200.000'));
  });

  it('أصل الدين 1000 والرصيد غير معدَّل ⇒ مجموع الجدول 1000.000', async () => {
    await renderForm();
    await fillLoan(4);
    const rows = Array.from(docRoot().querySelectorAll('.eda-tbl--annex tr')).slice(1, 5);
    expect(rows[0].textContent).toContain('250.000');
    expect(rows[3].textContent).toContain('0.000');
  });

  it('الرصيد معدَّل يدوياً إلى 750 ⇒ مجموع الجدول 750.000 وآخر رصيد 0.000', async () => {
    await renderForm();
    await fillLoan(3);
    fireEvent.change(balanceField(), { target: { value: '750.000' } });
    await waitFor(() => expect(printedText()).toContain('250.000'));
    const rows = Array.from(docRoot().querySelectorAll('.eda-tbl--annex tr')).slice(1, 4);
    // 750 ÷ 3 = 250.000 لكل قسط، والرصيد ينتهي عند الصفر.
    for (const row of rows) expect(row.textContent).toContain('250.000');
    expect(rows[2].textContent).toContain('0.000');
    // وأصل الدين لم يتغيّر: المستند يعلن ألفًا مستلَمة ورصيدًا قائمًا 750.
    expect(amountField()).toHaveValue('1000.000');
  });

  it('وبعد التعديل اليدوي لا يدهسه تغييرُ أصل الدين', async () => {
    await renderForm();
    await fillLoan(3);
    fireEvent.change(balanceField(), { target: { value: '750.000' } });
    await waitFor(() => expect(balanceField()).toHaveValue('750.000'));
    fireEvent.change(amountField(), { target: { value: '2000.000' } });
    await waitFor(() => expect(amountField()).toHaveValue('2000.000'));
    expect(balanceField()).toHaveValue('750.000');
  });

  it('والعلم يصمد عبر إعادة التصيير وحفظ المسودّة واستعادتها', () => {
    // `balanceManual` جزء من بيانات المستند لا من حالة عابرة في المكوّن، فيُحفظ في
    // المسودّة ويعود معها — وهو ما يمنع عودة الرصيد إلى أصل الدين بعد فتحٍ جديد.
    const manual = { ...EMPTY_DEBT_ACK_DATA, amountFigures: '1000.000', balanceFigures: '750.000', balanceManual: true };
    const roundTripped = withFixedCreditorData({ ...EMPTY_DEBT_ACK_DATA, ...JSON.parse(JSON.stringify(manual)) });
    expect(roundTripped.balanceManual).toBe(true);
    expect(roundTripped.balanceFigures).toBe('750.000');
    expect(scheduleBaseAmount(roundTripped)).toBe(750);
  });

  it('والحساب نفسه يُبنى على الرصيد لا على أصل الدين', () => {
    const data = regenerateSchedule({
      ...EMPTY_DEBT_ACK_DATA,
      amountFigures: '1000.000',
      balanceFigures: '750.000',
      balanceManual: true,
      installmentsCount: '3',
      firstInstallmentDate: '2026-10-15',
    });
    expect(data.schedule).toHaveLength(3);
    expect(scheduleTotal(data.schedule)).toBe(750);
    expect(data.schedule[2].remainingBalance).toBe(0);
  });

  it('ورصيد فارغ يعود إلى أصل الدين بدل أن يعطّل الجدول', () => {
    const data = regenerateSchedule({
      ...EMPTY_DEBT_ACK_DATA,
      amountFigures: '1000.000',
      installmentsCount: '4',
      firstInstallmentDate: '2026-10-15',
    });
    expect(scheduleTotal(data.schedule)).toBe(1000);
  });
});

// ══ 1-هـ · القيم الافتراضية الخاصة بالمستند ══════════════════════════════════
describe('1-هـ · القيم الافتراضية والآيبان الثابت', () => {
  it('نموذج جديد يحصل على الممثل القانوني ووسيلة الاتصال تلقائياً', async () => {
    await renderForm();
    expect(screen.getByLabelText(translate('page.debtAck.f.creditor_representative', 'ar'))).toHaveValue(
      DEFAULT_CREDITOR_REPRESENTATIVE,
    );
    expect(screen.getByLabelText(translate('page.debtAck.f.creditor_address', 'ar'))).toHaveValue(
      DEFAULT_CREDITOR_CONTACT,
    );
    expect(printedText()).toContain(DEFAULT_CREDITOR_REPRESENTATIVE);
    expect(printedText()).toContain(DEFAULT_CREDITOR_CONTACT);
  });

  it('والنظير اللاتيني مكتوب لا منقول — فلا حرف عربي في القالبين الأجنبيين', async () => {
    await renderForm();
    for (const aria of ['English', 'Hindi'] as const) {
      switchTo(aria);
      const text = printedText();
      expect(text).toContain(DEFAULT_CREDITOR_REPRESENTATIVE_LATIN);
      expect(text).not.toContain(DEFAULT_CREDITOR_REPRESENTATIVE);
      expect(text).toContain(DEFAULT_CREDITOR_CONTACT);
    }
  });

  it('التعديل اليدوي يبقى، ولا يمحوه ملءٌ لاحق ولا تغيير الموظف', () => {
    const edited = applyAutofill(
      { ...EMPTY_DEBT_ACK_DATA, creditorRepresentative: 'ممثل آخر', creditorAddress: 'tel:11111111' },
      buildDebtAckAutofill({ fullName: 'موظف ثانٍ', fullNameEn: 'SECOND EMPLOYEE' }),
    );
    expect(edited.creditorRepresentative).toBe('ممثل آخر');
    expect(edited.creditorAddress).toBe('tel:11111111');
  });

  it('والقيمة الافتراضية تُملأ في الحقل الفارغ وحده', () => {
    const fresh = applyAutofill(EMPTY_DEBT_ACK_DATA, buildDebtAckAutofill({ fullName: 'موظف' }));
    expect(fresh.creditorRepresentative).toBe(DEFAULT_CREDITOR_REPRESENTATIVE);
    expect(fresh.creditorAddress).toBe(DEFAULT_CREDITOR_CONTACT);
  });

  it('الآيبان ثابت بالضبط، ولا تغيّره مسودّة قديمة', () => {
    expect(CREDITOR_IBAN).toBe('KW78NBOK0000000000002039042550');
    const staleDraft = { ...EMPTY_DEBT_ACK_DATA, creditorIban: 'KW00OLD00000000000000000000000' };
    expect(withFixedCreditorData(staleDraft).creditorIban).toBe(CREDITOR_IBAN);
    expect(applyAutofill(staleDraft, buildDebtAckAutofill(null)).creditorIban).toBe(CREDITOR_IBAN);
  });

  it('ويُعرض للقراءة فقط، ولا يتغيّر بتغيّر اللغة', async () => {
    await renderForm();
    expect(screen.getByLabelText(translate('page.debtAck.f.iban', 'ar'))).toHaveAttribute('readonly');
    for (const aria of ['Arabic', 'English', 'Hindi'] as const) {
      switchTo(aria);
      expect(printedText()).toContain(CREDITOR_IBAN);
    }
  });

  it('وسيلة التسليم الافتراضية «نقداً»، وتعديلها يبقى', async () => {
    expect(EMPTY_DEBT_ACK_DATA.disbursementMethod).toBe('cash');
    await renderForm();
    // المربّع المؤشَّر في المطبوع هو مربّع النقد، والآخران فارغان.
    expect(printedText()).toContain('☑');
    const changed = { ...EMPTY_DEBT_ACK_DATA, disbursementMethod: 'cheque' as const };
    // لا شيء في مسار التحديث يعيد الوسيلة إلى الافتراضي.
    expect(withFixedCreditorData(changed).disbursementMethod).toBe('cheque');
    expect(applyAutofill(changed, buildDebtAckAutofill(null)).disbursementMethod).toBe('cheque');
  });
});

// ══ 1-و · الأقساط دنانير صحيحة، والبند 4 يطابق الملحق ═══════════════════════
describe('1-و · الأقساط الصحيحة في المستند', () => {
  const balanceField = () => screen.getByLabelText(translate('page.debtAck.f.balance_figures', 'ar'));

  /** قيم عمود «المبلغ المسدد» في صفحة ملحق واحدة، للصفوف المملوءة وحدها. */
  const annexAmounts = (section: HTMLElement) =>
    Array.from(section.querySelectorAll('.eda-tbl--annex tr'))
      .slice(1)
      .map((tr) => (tr.querySelector('[data-eda-col=amount]')?.textContent ?? '').trim())
      .filter((v) => !v.startsWith('.'));

  it('500 على 12 قسطاً ⇒ 42.000 × 11 ثم 38.000، والرصيد ينتهي 0.000', async () => {
    await renderForm();
    await fillLoan(12, '500.000');
    const [annex] = annexSections();
    const amounts = annexAmounts(annex);
    expect(amounts).toHaveLength(12);
    expect(amounts.slice(0, 11)).toEqual(Array.from({ length: 11 }, () => '42.000 د.ك'));
    expect(amounts[11]).toBe('38.000 د.ك');
    const lastRow = Array.from(annex.querySelectorAll('.eda-tbl--annex tr'))[12];
    expect(lastRow.querySelector('[data-eda-col=balance]')?.textContent).toContain('0.000');
  });

  it('1000 على 12 قسطاً ⇒ 83.000 × 11 ثم 87.000', async () => {
    await renderForm();
    await fillLoan(12);
    const amounts = annexAmounts(annexSections()[0]);
    expect(amounts.slice(0, 11)).toEqual(Array.from({ length: 11 }, () => '83.000 د.ك'));
    expect(amounts[11]).toBe('87.000 د.ك');
  });

  /**
   * البند 4 والملحق يقرأان **الجدول نفسه**: قيمة القسط العادي في البند هي قيمة الصفّ
   * الأول في الملحق، وقيمة القسط الأخير فيه هي قيمة الصفّ الأخير. فلا يمكن أن يعلن
   * المستند رقمًا ويطبع تحته آخر.
   */
  it('البند 4 يطابق الملحق حسابياً: العادي 42.000 والأخير 38.000', async () => {
    await renderForm();
    await fillLoan(12, '500.000');
    const clause = Array.from(docRoot().querySelectorAll('.eda-clause')).find((el) =>
      (el.textContent ?? '').startsWith(DEBT_ACK_CONTENT.ar.clauses4to7[0].lead),
    ) as HTMLElement;
    const text = clause.textContent ?? '';
    expect(text).toContain('42.000');
    expect(text).toContain('38.000');
    expect(text).toContain('12');
    // ولا يقول «قيمة كل قسط» على إطلاقها بينما الأخير مختلف.
    expect(text).toContain('عدا الأخير');
    expect(text).toContain('المبلغ المتبقي');
  });

  it('والقوالب الثلاثة تعرض الحساب نفسه', async () => {
    await renderForm();
    await fillLoan(12, '500.000');
    for (const aria of ['Arabic', 'English', 'Hindi'] as const) {
      switchTo(aria);
      const text = printedText();
      expect(text).toContain('42.000');
      expect(text).toContain('38.000');
    }
  });

  it('ويسري على الرصيد المعدَّل يدوياً: 750 على 12 ⇒ 63.000 × 11 ثم 57.000', async () => {
    await renderForm();
    await fillLoan(12);
    fireEvent.change(balanceField(), { target: { value: '750.000' } });
    await waitFor(() => expect(printedText()).toContain('63.000'));
    const amounts = annexAmounts(annexSections()[0]);
    // 750 ÷ 12 = 62.5 ⇒ أقرب دينار 63، و63 × 11 = 693، فالأخير 57.
    expect(amounts.slice(0, 11)).toEqual(Array.from({ length: 11 }, () => '63.000 د.ك'));
    expect(amounts[11]).toBe('57.000 د.ك');
  });

  it('والقيم نفسها في نسختَي الملحق', async () => {
    await renderForm();
    await fillLoan(12, '500.000');
    const [first, second] = annexSections();
    expect(annexAmounts(second)).toEqual(annexAmounts(first));
  });
});

// ══ 2 · التعليمات: خارج المستند وباقية كاملة ═════════════════════════════════
describe('2 · التعليمات على الشاشة وحدها', () => {
  it('نصّ التعليمات باقٍ كاملًا في حزم المحتوى الثلاث — لم يُحذف ولم يُختصر', () => {
    for (const lang of LANGS) {
      const c = DEBT_ACK_CONTENT[lang];
      expect(c.guidanceTitle.length).toBeGreaterThan(10);
      expect(c.guidanceRows.length).toBe(8);
      expect(c.sources.length).toBe(5);
      expect(c.disclaimer.length).toBeGreaterThan(20);
      for (const row of c.guidanceRows) expect(row.text.length).toBeGreaterThan(20);
    }
  });

  it('عنوان التعليمات لا يظهر في المطبوع بأي لغة', async () => {
    await renderForm();
    expect(printedText()).not.toContain(DEBT_ACK_CONTENT.ar.guidanceTitle);
    switchTo('English');
    expect(printedText()).not.toContain(DEBT_ACK_CONTENT.en.guidanceTitle);
    switchTo('Hindi');
    expect(printedText()).not.toContain(DEBT_ACK_CONTENT.hi.guidanceTitle);
  });

  it('ولا التنبيه ولا المصادر ولا أيّ سطر إرشاد', async () => {
    await renderForm();
    const text = printedText();
    const c = DEBT_ACK_CONTENT.ar;
    expect(text).not.toContain(c.disclaimer);
    expect(text).not.toContain(c.sourcesHeading);
    for (const source of c.sources) expect(text).not.toContain(source);
    for (const row of c.guidanceRows) expect(text).not.toContain(row.text);
  });

  it('ولا صفحة بديلة ولا عنوان فارغ مكانها: المستند ينتهي بالملحق', async () => {
    await renderForm();
    const last = pages().at(-1) as HTMLElement;
    expect(last.getAttribute('data-eda-annex-copy')).toBe('2');
    expect((last.textContent ?? '').trim().length).toBeGreaterThan(50);
  });

  it('الحوار يُفتح من شريط الأدوات ويعرض النصّ كاملًا', async () => {
    await renderForm();
    openInstructions();
    const dialog = document.querySelector('[data-eda-instructions]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain(DEBT_ACK_CONTENT.ar.guidanceRows[0].text);
    expect(dialog.textContent).toContain(DEBT_ACK_CONTENT.ar.disclaimer);
  });

  it('الحوار **خارج** `.form-page` — فلا يبلغ الورق ولا الـPDF ولو كان مفتوحًا', async () => {
    await renderForm();
    openInstructions();
    const dialog = document.querySelector('[data-eda-instructions]') as HTMLElement;
    expect(printedRoot().contains(dialog)).toBe(false);
    expect(printedText()).not.toContain(DEBT_ACK_CONTENT.ar.guidanceTitle);
  });

  it('الحوار يتبع لغة القالب لا لغة الواجهة، وبلا ترجمة وقت التشغيل', async () => {
    await renderForm();
    switchTo('Hindi');
    openInstructions();
    const dialog = document.querySelector('[data-eda-instructions]') as HTMLElement;
    expect(dialog.getAttribute('lang')).toBe('hi');
    expect(dialog.textContent).toContain(DEBT_ACK_CONTENT.hi.guidanceRows[0].text);
    expect(dialog.textContent).not.toContain(DEBT_ACK_CONTENT.ar.guidanceRows[0].text);
  });
});

// ══ 3 · الملحق مرتان ═════════════════════════════════════════════════════════
describe('3 · نسختا الملحق', () => {
  it('نسختان اثنتان، مرقّمتان 1 و2', async () => {
    await renderForm();
    const copies = Array.from(docRoot().querySelectorAll('[data-eda-annex-copy]'));
    expect(copies.map((el) => el.getAttribute('data-eda-annex-copy'))).toEqual(['1', '2']);
  });

  it('النسخة الثانية آخر صفحة في المستند في اللغات الثلاث', async () => {
    await renderForm();
    for (const aria of ['Arabic', 'English', 'Hindi'] as const) {
      switchTo(aria);
      expect((pages().at(-1) as HTMLElement).getAttribute('data-eda-annex-copy')).toBe('2');
    }
  });

  it('عنوان الملحق يظهر مرتين بالضبط في المطبوع، في كل لغة', async () => {
    await renderForm();
    const cases: Array<['Arabic' | 'English' | 'Hindi', DebtAckLang]> = [
      ['Arabic', 'ar'],
      ['English', 'en'],
      ['Hindi', 'hi'],
    ];
    for (const [aria, lang] of cases) {
      switchTo(aria);
      const title = DEBT_ACK_CONTENT[lang].annexTitle;
      expect(printedText().split(title).length - 1).toBe(2);
    }
  });

  it('النسختان متطابقتان نصًّا: نفس الصفوف ونفس القيم ونفس الفراغات', async () => {
    await renderForm();
    const [first, second] = Array.from(docRoot().querySelectorAll('[data-eda-annex-copy]'));
    expect(second.textContent).toBe(first.textContent);
    expect(second.querySelectorAll('tr').length).toBe(first.querySelectorAll('tr').length);
  });

  it('مصدر تحرير واحد: جدولٌ واحد قابل للتحرير في لوحة الإدخال', async () => {
    await renderForm();
    const entry = printedRoot().querySelector('.no-print') as HTMLElement;
    expect(entry.querySelectorAll('[data-eda-annex-copy]').length).toBe(0);
  });

  it('بلا وسم «نسخة» ولا علامة مائية على الورق', async () => {
    await renderForm();
    const text = printedText();
    expect(text).not.toMatch(/COPY|نسخة\s*[12]|الأصل|Duplicate/i);
    const copies = Array.from(docRoot().querySelectorAll('[data-eda-annex-copy]'));
    // السمة بنيوية للقياس، لا تُرسم: لا نصّ يحمل رقم النسخة.
    for (const el of copies) expect((el.textContent ?? '').includes('data-eda-annex-copy')).toBe(false);
  });

  it('النسخة الثانية تبدأ ورقة جديدة بفاصل الصفحات القائم نفسه', () => {
    expect(TEMPLATE_CSS_TEXT).toContain('.eda-page + .eda-page');
    expect(TEMPLATE_CSS_TEXT).toContain('break-before: page');
  });
});

// ══ 4 · بنية الأربع صفحات ════════════════════════════════════════════════════
describe('4 · بنية المستند', () => {
  it('أربعة أقسام بالضبط في اللغات الثلاث', async () => {
    await renderForm();
    for (const aria of ['Arabic', 'English', 'Hindi'] as const) {
      switchTo(aria);
      expect(pages().length).toBe(4);
    }
  });

  it('الصفحة 2 وحدها مضغوطة — لا الأولى ولا صفحتا الملحق', async () => {
    await renderForm();
    const list = pages();
    expect(list[0].classList.contains('eda-page--compact')).toBe(false);
    expect(list[1].classList.contains('eda-page--compact')).toBe(true);
    expect(list[2].classList.contains('eda-page--compact')).toBe(false);
    expect(list[3].classList.contains('eda-page--compact')).toBe(false);
  });

  it('لا صفحة فارغة: كل قسم يحمل نصًّا', async () => {
    await renderForm();
    for (const page of pages()) expect((page.textContent ?? '').trim().length).toBeGreaterThan(50);
  });

  it('قواعد الضغط كلها مقيّدة بالصفحة 2 — لا قاعدة عامة تغيّرت', () => {
    const css = TEMPLATE_SOURCE.slice(TEMPLATE_SOURCE.indexOf('const TEMPLATE_CSS'));
    for (const line of css.split('\n')) {
      if (!line.includes('eda-page--compact')) continue;
      expect(line.trimStart().startsWith('.eda-page--compact') || line.includes('.eda-root[lang=')).toBe(true);
    }
  });

  it('لا `transform: scale` ولا `zoom` في أي مستوى ضغط', () => {
    expect(TEMPLATE_CSS_TEXT).not.toMatch(/zoom\s*:/);
    expect(TEMPLATE_CSS_TEXT).not.toMatch(/transform\s*:\s*scale/);
  });

  it('مساحات التوقيع باقية الضعف: حشوها نمط سطري لا تبلغه قواعد الضغط', async () => {
    await renderForm();
    expect(SIGNATURE_SPACE_MULTIPLIER).toBe(2);
    const areas = Array.from(docRoot().querySelectorAll('[data-eda-sig]'));
    // خمس خانات في المستند + خانتان في كلٍّ من نسختَي الملحق.
    expect(areas.length).toBe(9);
    for (const area of areas) {
      const td = area.closest('td') as HTMLElement;
      const top = parseFloat(td.style.paddingTop);
      const bottom = parseFloat(td.style.paddingBottom);
      // الارتفاع = المحتوى×2 + top + bottom، فـ bottom = top × (2M − 1) = 3×top.
      expect(bottom).toBeCloseTo(top * 3, 5);
      expect(area.querySelectorAll('.eda-sig-space').length).toBe(SIGNATURE_SPACE_MULTIPLIER - 1);
      expect(area.querySelector('.eda-sig-label')).toBeTruthy();
    }
  });

  it('ملف الطباعة لم يتغيّر: 40mm علوي و20mm سفلي كما اعتُمد', () => {
    const profile = PRINT_PROFILES['employee-debt-acknowledgment-letterhead'];
    expect(profile.margins.top).toBe('40mm');
    expect(profile.margins.bottom).toBe('20mm');
  });
});

// ══ 5 · تقرير الهندسة المولَّد من إخراج Chromium ══════════════════════════════
describe('5 · القياس الفعلي', () => {
  // النسخة المحفوظة في المستودع من تقرير القياس — يكتبها `measure.cjs` بجانب نسخة
  // artifacts/ المستثناة من Git، فيقرأ الاختبارُ ما قِيس فعلًا لا ما توقّعه أحد.
  const reportPath = path.resolve(__dirname, '../../../docs/employee-debt-acknowledgment-v1.geometry.json');
  interface ReportPage {
    index: number;
    topClearMm: number;
    bottomClearMm: number;
    visibleInkSha: string;
    inkOps: number;
  }
  interface ReportDoc {
    scenario: string;
    installments: number;
    generatedRows: number;
    annexPagesPerCopy: number;
    expectedPages: number;
    lang: string;
    pageCount: number;
    pages: ReportPage[];
    structure: {
      sectionCount: number;
      annexCopies: string[];
      annexPageNumbers: string[];
      lastSectionAnnexCopy: string;
      lastSectionAnnexPage: string;
      instructionsNodes: number;
      tables: Array<{ index: number; kind: string; headVisualOrder: string[]; bodyVisualOrder: string[] }>;
    };
    page2: { minFontPt: number; clause: { fontPt: number; lineHeightRatio: number } };
    problems: string[];
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as {
    pass: boolean;
    requirement: { rowsPerAnnexPage: number; mainPages: number };
    documents: ReportDoc[];
  };

  it('القياس مرّ بلا مشكلة واحدة', () => {
    expect(report.pass).toBe(true);
    for (const doc of report.documents) expect(doc.problems).toEqual([]);
  });

  it('السيناريوهات الثلاثة × اللغات الثلاث قِيست فعلًا', () => {
    expect(report.documents).toHaveLength(9);
    expect([...new Set(report.documents.map((d) => d.scenario))].sort()).toEqual(['i05', 'i13', 'i25']);
    expect([...new Set(report.documents.map((d) => d.lang))].sort()).toEqual(['ar', 'en', 'hi']);
    expect(report.requirement.rowsPerAnnexPage).toBe(ROWS_PER_ANNEX_PAGE);
  });

  it('عدد الأقساط المطلوب هو عدد الصفوف المولَّد — 13 تعني 13 لا جدولًا فارغًا', () => {
    for (const doc of report.documents) expect(doc.generatedRows).toBe(doc.installments);
  });

  /**
   * الصيغة: `صفحتا المستند + 2 × ceil(الأقساط ÷ 12)`.
   *
   * وهي **متوقَّع يُقارَن بالمقيس** لا بديلٌ عنه: `pageCount` أدناه مقروء من الـPDF الذي
   * أخرجه Chromium، والصيغة تُحسب مستقلّةً عنه ثم تُطابَق به.
   */
  it.each([
    ['i05', 5, 1, 4],
    ['i13', 13, 2, 6],
    ['i25', 25, 3, 8],
  ])('%s: %i قسطاً ⇒ %i صفحة ملحق لكل نسخة ⇒ %i صفحات مقيسة', (scenario, installments, perCopy, total) => {
    const docs = report.documents.filter((d) => d.scenario === scenario);
    expect(docs).toHaveLength(3);
    for (const doc of docs) {
      expect(doc.installments).toBe(installments);
      expect(doc.annexPagesPerCopy).toBe(perCopy);
      expect(report.requirement.mainPages + 2 * perCopy).toBe(total);
      expect(doc.expectedPages).toBe(total);
      expect(doc.pageCount).toBe(total);
      expect(doc.structure.sectionCount).toBe(total);
    }
  });

  it('الحزام العلوي 40mm والسفلي 20mm محفوظان على **كل** صفحة في كل سيناريو', () => {
    for (const doc of report.documents) {
      for (const page of doc.pages) {
        expect(page.topClearMm).toBeGreaterThanOrEqual(39.5);
        expect(page.bottomClearMm).toBeGreaterThanOrEqual(19.5);
        // ولا صفحة بيضاء: كل صفحة تحمل حبرًا.
        expect(page.inkOps).toBeGreaterThan(0);
      }
    }
  });

  it('المجموعة الثانية مطابقة للأولى صفحةً بصفحة في كل سيناريو', () => {
    for (const doc of report.documents) {
      const n = doc.annexPagesPerCopy;
      for (let k = 0; k < n; k += 1) {
        const first = doc.pages[report.requirement.mainPages + k];
        const second = doc.pages[report.requirement.mainPages + n + k];
        expect(second.visibleInkSha).toBe(first.visibleInkSha);
        expect(second.inkOps).toBe(first.inkOps);
        expect(second.topClearMm).toBe(first.topClearMm);
        expect(second.bottomClearMm).toBe(first.bottomClearMm);
      }
    }
  });

  it('ترتيب المجموعتين: كل الأولى ثم كل الثانية، وآخر الورق آخر الثانية', () => {
    for (const doc of report.documents) {
      const n = doc.annexPagesPerCopy;
      expect(doc.structure.annexCopies).toEqual([
        ...Array.from({ length: n }, () => '1'),
        ...Array.from({ length: n }, () => '2'),
      ]);
      expect(doc.structure.annexPageNumbers).toEqual([
        ...Array.from({ length: n }, (_u, i) => String(i + 1)),
        ...Array.from({ length: n }, (_u, i) => String(i + 1)),
      ]);
      expect(doc.structure.lastSectionAnnexCopy).toBe('2');
      expect(doc.structure.lastSectionAnnexPage).toBe(String(n));
    }
  });

  it('لا عقدة تعليمات واحدة في أي مستند مُخرَج', () => {
    for (const doc of report.documents) expect(doc.structure.instructionsNodes).toBe(0);
  });

  /**
   * الترتيب **البصري** لأعمدة كل جدول، مقيسًا بالبكسل في Chromium.
   *
   * jsdom بلا محرّك تخطيط، فلا يعرف أين تقع الخلية على الورق — يعرف ترتيبها في DOM
   * وحده. هذه الأرقام تأتي من الشجرة المُصيَّرة فعلًا: تُرتَّب خلايا كل صفّ بإحداثي
   * حافتها اليسرى، فما يُفحص هو ما يراه القارئ.
   */
  const VISUAL = {
    ar: {
      data: ['value', 'label'],
      signature: ['creditor', 'debtor'],
      annex: ['notes', 'balance', 'amount', 'dueDate', 'no'],
    },
    ltr: {
      data: ['label', 'value'],
      signature: ['creditor', 'debtor'],
      annex: ['no', 'dueDate', 'amount', 'balance', 'notes'],
    },
  };

  it('كل جدول عربي يقع بصريًا كما يعرضه ملف Word — في كل صفحة ملحق وكل سيناريو', () => {
    for (const doc of report.documents) {
      const want = doc.lang === 'ar' ? VISUAL.ar : VISUAL.ltr;
      const measured = doc.structure.tables.filter((t) => t.kind !== 'plain');
      // جدولا بيانات + جدول توقيعات + (جدول ملحق وجدول توقيع ملحق) لكل صفحة ملحق.
      const annexSections = doc.annexPagesPerCopy * 2;
      expect(measured).toHaveLength(3 + annexSections * 2);
      for (const table of measured) {
        expect(table.headVisualOrder).toEqual(want[table.kind as keyof typeof want]);
        // الجسم يتبع الترويسة: لا قيمة مولَّدة تحت ترويسة غير ترويستها.
        expect(table.bodyVisualOrder).toEqual(table.headVisualOrder);
      }
    }
  });

  it('عدد الجداول يتبع عدد صفحات الملحق', () => {
    for (const doc of report.documents) {
      const annexSections = doc.annexPagesPerCopy * 2;
      const kinds = doc.structure.tables.map((t) => t.kind);
      expect(kinds.filter((k) => k === 'annex')).toHaveLength(annexSections);
      expect(kinds.filter((k) => k === 'signature')).toHaveLength(1);
      // جدولا الدائن والمدين + جدول توقيع لكل صفحة ملحق.
      expect(kinds.filter((k) => k === 'data')).toHaveLength(2 + annexSections);
    }
  });

  it('الصفحة 2: أصغر خط مرسوم ≥ 9pt، والعربية والهندية بخطّهما الأصلي 10.5pt', () => {
    for (const doc of report.documents) {
      expect(doc.page2.minFontPt).toBeGreaterThanOrEqual(9);
      if (doc.lang !== 'en') {
        expect(doc.page2.clause.fontPt).toBe(10.5);
        expect(doc.page2.clause.lineHeightRatio).toBeCloseTo(1.29, 2);
      } else {
        // الإنجليزية وحدها احتاجت المستويين 2 و3. وزيد التضييق بعد أن كبر البند 4
        // (صار يعلن أن القسط العادي دينار صحيح وأن الأخير هو المتبقّي): 10.5 ⇒ 9.5pt
        // وتباعد 1.15 — أقلّ قدرٍ أعاد الصفحات إلى 4 · 6 · 8، مقيسًا لا مقدَّرًا.
        expect(doc.page2.clause.fontPt).toBe(9.5);
        expect(doc.page2.clause.lineHeightRatio).toBeCloseTo(1.15, 2);
      }
    }
  });
});
