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
      'الرصيد بعد السداد',
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
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as {
    pass: boolean;
    documents: Array<{
      lang: string;
      pageCount: number;
      pages: Array<{ index: number; topClearMm: number; bottomClearMm: number; visibleInkSha: string }>;
      structure: {
        sectionCount: number;
        annexCopies: string[];
        lastSectionAnnexCopy: string;
        instructionsNodes: number;
        tables: Array<{ index: number; kind: string; headVisualOrder: string[]; bodyVisualOrder: string[] }>;
      };
      page2: { minFontPt: number; clause: { fontPt: number; lineHeightRatio: number } };
      problems: string[];
    }>;
  };

  it('القياس مرّ بلا مشكلة واحدة', () => {
    expect(report.pass).toBe(true);
    for (const doc of report.documents) expect(doc.problems).toEqual([]);
  });

  it('أربع صفحات في اللغات الثلاث — مقيسة من الـPDF لا مُعلَنة', () => {
    expect(report.documents.map((d) => d.lang).sort()).toEqual(['ar', 'en', 'hi']);
    for (const doc of report.documents) {
      expect(doc.pageCount).toBe(4);
      expect(doc.structure.sectionCount).toBe(4);
    }
  });

  it('الحزام العلوي 40mm محفوظ على الصفحات الأربع', () => {
    for (const doc of report.documents) {
      for (const page of doc.pages) expect(page.topClearMm).toBeGreaterThanOrEqual(39.5);
    }
  });

  it('الحزام السفلي 20mm محفوظ حتى على الصفحة 2 — فلم يُستهلك إعفاؤها', () => {
    for (const doc of report.documents) {
      for (const page of doc.pages) expect(page.bottomClearMm).toBeGreaterThanOrEqual(19.5);
    }
  });

  it('صفحتا الملحق تحملان الحبر نفسه في المواضع نفسها', () => {
    for (const doc of report.documents) {
      expect(doc.pages[2].visibleInkSha).toBe(doc.pages[3].visibleInkSha);
      expect(doc.structure.annexCopies).toEqual(['1', '2']);
      expect(doc.structure.lastSectionAnnexCopy).toBe('2');
    }
  });

  it('لا عقدة تعليمات واحدة في المستند المُخرَج', () => {
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

  it('كل جدول عربي يقع بصريًا كما يعرضه ملف Word — والإنجليزي والهندي كما هما', () => {
    for (const doc of report.documents) {
      const want = doc.lang === 'ar' ? VISUAL.ar : VISUAL.ltr;
      const measured = doc.structure.tables.filter((t) => t.kind !== 'plain');
      expect(measured.length).toBe(7);
      for (const table of measured) {
        expect(table.headVisualOrder).toEqual(want[table.kind as keyof typeof want]);
        // الجسم يتبع الترويسة: لا قيمة مولَّدة تحت ترويسة غير ترويستها.
        expect(table.bodyVisualOrder).toEqual(table.headVisualOrder);
      }
    }
  });

  it('الجداول كلها حاضرة: أربعة بيانات وواحد توقيعات وملحقان', () => {
    for (const doc of report.documents) {
      const kinds = doc.structure.tables.map((t) => t.kind);
      expect(kinds.filter((k) => k === 'data').length).toBe(4);
      expect(kinds.filter((k) => k === 'signature').length).toBe(1);
      expect(kinds.filter((k) => k === 'annex').length).toBe(2);
    }
  });

  it('نسختا الملحق ما زالتا متطابقتَي الترتيب البصري', () => {
    for (const doc of report.documents) {
      const annexes = doc.structure.tables.filter((t) => t.kind === 'annex');
      expect(annexes[1].headVisualOrder).toEqual(annexes[0].headVisualOrder);
      expect(annexes[1].bodyVisualOrder).toEqual(annexes[0].bodyVisualOrder);
    }
  });

  it('الصفحة 2: أصغر خط مرسوم ≥ 9pt، والعربية والهندية بخطّهما الأصلي 10.5pt', () => {
    for (const doc of report.documents) {
      expect(doc.page2.minFontPt).toBeGreaterThanOrEqual(9);
      if (doc.lang !== 'en') {
        expect(doc.page2.clause.fontPt).toBe(10.5);
        expect(doc.page2.clause.lineHeightRatio).toBeCloseTo(1.29, 2);
      } else {
        // الإنجليزية وحدها احتاجت المستويين 2 و3 — وبأقل قدر: 10.5 ⇒ 10pt.
        expect(doc.page2.clause.fontPt).toBe(10);
        expect(doc.page2.clause.lineHeightRatio).toBeCloseTo(1.2, 2);
      }
    }
  });
});
