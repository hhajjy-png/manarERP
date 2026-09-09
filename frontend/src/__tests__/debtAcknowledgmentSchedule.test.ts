/**
 * إقرار دين موظف — حاسبة الأقساط وجدول السداد.
 *
 * ═══ الثابت الذي يحرسه هذا الملف ═══
 * **مجموع الأقساط = أصل الدين بالضبط**، بعد التقريب إلى ثلاث خانات. فلسٌ يضيع أو
 * يُخترع في مستند دَين موقَّع ليس تفصيلًا عرضيًا: هو فرقٌ بين ما أقرّ به المدين وما
 * تجمعه أقساطه، ويظهر في أول مطالبة.
 *
 * وحرس ثانٍ للتواريخ: يوم الاستحقاق المفضَّل **لا يعلق** على آخر يوم في شهر قصير.
 * من بدأ في 31 يناير يستحق قسطه في 31 مارس لا في 28 مارس.
 */
import { describe, it, expect } from 'vitest';
import {
  annexPageCount,
  buildInstallmentDates,
  buildInstallmentSchedule,
  calculateInstallmentAmounts,
  paginateInstallmentSchedule,
  recalculateBalances,
  scheduleTotal,
  validateSchedule,
} from '../forms/debtAcknowledgment/debtAcknowledgmentSchedule';
import { MAX_INSTALLMENTS, ROWS_PER_ANNEX_PAGE } from '../forms/debtAcknowledgment/constants';
import { sumMoney } from '../lib/money';
import { DEBT_ACK_CONTENT_AR } from '../forms/debtAcknowledgment/content.ar';
import { DEBT_ACK_CONTENT_EN } from '../forms/debtAcknowledgment/content.en';
import { DEBT_ACK_CONTENT_HI } from '../forms/debtAcknowledgment/content.hi';

describe('قيم الأقساط', () => {
  it('1000 ÷ 5 ⇒ خمسة أقساط متساوية 200.000', () => {
    expect(calculateInstallmentAmounts(1000, 5)).toEqual([200, 200, 200, 200, 200]);
  });

  it('1000 ÷ 3 ⇒ 333.333 · 333.333 · 333.334، والمجموع 1000.000 بالضبط', () => {
    const amounts = calculateInstallmentAmounts(1000, 3);
    expect(amounts).toEqual([333.333, 333.333, 333.334]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 9);
  });

  it('فارق التقريب يقع على القسط الأخير وحده', () => {
    const amounts = calculateInstallmentAmounts(1000, 3);
    expect(new Set(amounts.slice(0, -1)).size).toBe(1);
    expect(amounts[amounts.length - 1]).not.toBe(amounts[0]);
  });

  it('قسط واحد ⇒ المبلغ كاملًا', () => {
    expect(calculateInstallmentAmounts(1000, 1)).toEqual([1000]);
  });

  it('اثنا عشر قسطًا ⇒ المجموع يساوي الأصل بالضبط', () => {
    const amounts = calculateInstallmentAmounts(1000, 12);
    expect(amounts).toHaveLength(12);
    expect(amounts.reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 9);
  });

  it.each([
    [1000, 3],
    [1000, 7],
    [999.999, 12],
    [0.003, 3],
    [1234.567, 11],
    [50, 12],
  ])('المجموع يساوي الأصل مهما كان القسمة غير منتظمة (%s ÷ %s)', (amount, count) => {
    const amounts = calculateInstallmentAmounts(amount, count);
    expect(amounts).toHaveLength(count);
    expect(scheduleTotal(amounts.map((a, i) => ({ no: i + 1, dueDate: '', amount: a, remainingBalance: 0 })))).toBe(
      amount,
    );
  });

  it('مدخلات غير صالحة ⇒ لا أقساط (لا تخمين ولا نصف جدول)', () => {
    expect(calculateInstallmentAmounts(1000, 0)).toEqual([]);
    expect(calculateInstallmentAmounts(1000, -3)).toEqual([]);
    expect(calculateInstallmentAmounts(1000, 2.5)).toEqual([]);
    expect(calculateInstallmentAmounts(Number.NaN, 5)).toEqual([]);
  });
});

describe('تواريخ الأقساط الشهرية', () => {
  it('من 15/10/2026 على خمسة أقساط ⇒ نفس اليوم من كل شهر', () => {
    expect(buildInstallmentDates('2026-10-15', 5)).toEqual([
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
      '2027-01-15',
      '2027-02-15',
    ]);
  });

  it('يوم 31 لا يعلق على آخر يوم في شهر قصير — يعود إلى الأصل', () => {
    expect(buildInstallmentDates('2027-01-31', 5)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
    ]);
  });

  it('سنة كبيسة: فبراير 2028 يعطي 29 ثم يعود مارس إلى 31', () => {
    expect(buildInstallmentDates('2028-01-31', 3)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });

  it('يوم 30 في فبراير غير الكبيس يعطي 28 ثم يعود 30', () => {
    expect(buildInstallmentDates('2027-01-30', 4)).toEqual([
      '2027-01-30',
      '2027-02-28',
      '2027-03-30',
      '2027-04-30',
    ]);
  });

  it('يعبر حدّ السنة بلا انزياح', () => {
    expect(buildInstallmentDates('2026-11-15', 4)).toEqual([
      '2026-11-15',
      '2026-12-15',
      '2027-01-15',
      '2027-02-15',
    ]);
  });

  it('تاريخ ناقص أو غير صالح ⇒ تواريخ فارغة، لا تواريخ مخترعة', () => {
    expect(buildInstallmentDates('', 3)).toEqual(['', '', '']);
    expect(buildInstallmentDates('2027-02-31', 2)).toEqual(['', '']);
    expect(buildInstallmentDates('15/10/2026', 2)).toEqual(['', '']);
  });
});

describe('جدول السداد الكامل', () => {
  const schedule = buildInstallmentSchedule({ debtAmount: 1000, count: 5, firstDate: '2026-10-15' });

  it('مثال مالك المنتج حرفيًا: 1000 على 5 أقساط من 15/10/2026', () => {
    expect(schedule).toEqual([
      { no: 1, dueDate: '2026-10-15', amount: 200, remainingBalance: 800 },
      { no: 2, dueDate: '2026-11-15', amount: 200, remainingBalance: 600 },
      { no: 3, dueDate: '2026-12-15', amount: 200, remainingBalance: 400 },
      { no: 4, dueDate: '2027-01-15', amount: 200, remainingBalance: 200 },
      { no: 5, dueDate: '2027-02-15', amount: 200, remainingBalance: 0 },
    ]);
  });

  it('الرصيد ينتهي عند صفر بالضبط', () => {
    expect(schedule[schedule.length - 1].remainingBalance).toBe(0);
  });

  it('الرصيد ينتهي عند صفر حتى مع فارق تقريب', () => {
    const rows = buildInstallmentSchedule({ debtAmount: 1000, count: 3, firstDate: '2026-10-15' });
    expect(rows.map((r) => r.amount)).toEqual([333.333, 333.333, 333.334]);
    expect(rows[2].remainingBalance).toBe(0);
  });

  it('الرصيد مشتقّ لا مُدخَل: كل صفّ = الرصيد السابق ناقص القسط', () => {
    let running = 1000;
    for (const row of schedule) {
      running = Math.round((running - row.amount) * 1000) / 1000;
      expect(row.remainingBalance).toBe(running);
    }
  });

  it('التعديل اليدوي يعيد حساب الأرصدة ولا يترك المستخدم يكتبها', () => {
    const edited = schedule.map((r, i) => (i === 0 ? { ...r, amount: 300 } : r));
    const recalculated = recalculateBalances(edited, 1000);
    expect(recalculated[0].remainingBalance).toBe(700);
    expect(recalculated[1].remainingBalance).toBe(500);
    // المجموع صار 1100 ≠ 1000، والرصيد الأخير سالب — وهو ما يرصده التحقق أدناه.
    expect(recalculated[recalculated.length - 1].remainingBalance).toBe(-100);
  });
});

describe('التحقق من الجدول', () => {
  const base = { debtAmount: 1000, count: 5, firstDate: '2026-10-15', maxInstallments: MAX_INSTALLMENTS };
  const rows = buildInstallmentSchedule(base);

  it('جدول سليم ⇒ لا أخلال', () => {
    expect(validateSchedule({ ...base, rows })).toEqual([]);
  });

  it('مبلغ صفر أو سالب مرفوض', () => {
    expect(validateSchedule({ ...base, debtAmount: 0, rows: [] })).toContain('amountNotPositive');
    expect(validateSchedule({ ...base, debtAmount: -5, rows: [] })).toContain('amountNotPositive');
  });

  it('عدد أقساط صفر أو سالب أو كسري مرفوض', () => {
    expect(validateSchedule({ ...base, count: 0, rows: [] })).toContain('countNotPositive');
    expect(validateSchedule({ ...base, count: -2, rows: [] })).toContain('countNotPositive');
    expect(validateSchedule({ ...base, count: 3.5, rows: [] })).toContain('countNotInteger');
  });

  it('تجاوز سعة ملحق السداد مرفوض', () => {
    expect(validateSchedule({ ...base, count: MAX_INSTALLMENTS + 1, rows: [] })).toContain('countAboveMax');
    expect(validateSchedule({ ...base, count: MAX_INSTALLMENTS, rows: [] })).not.toContain('countAboveMax');
  });

  it('تاريخ أول قسط مفقود أو غير صالح مرفوض', () => {
    expect(validateSchedule({ ...base, firstDate: '', rows: [] })).toContain('missingFirstDate');
    expect(validateSchedule({ ...base, firstDate: '2027-02-31', rows: [] })).toContain('invalidFirstDate');
  });

  it('مجموع الأقساط المخالف لأصل الدين مرصود — ولا يُصحَّح في الخفاء', () => {
    const tampered = rows.map((r, i) => (i === 0 ? { ...r, amount: 300 } : r));
    const issues = validateSchedule({ ...base, rows: recalculateBalances(tampered, 1000) });
    expect(issues).toContain('totalMismatch');
    expect(issues).toContain('negativeBalance');
  });
});

describe('سعة صفحة الملحق مشتقّة من ملفات Word لا مكتوبة', () => {
  it('عدد صفوف الصفحة الواحدة يساوي عدد صفوف الملحق في الحزم الثلاث', () => {
    expect(ROWS_PER_ANNEX_PAGE).toBe(12);
    expect(DEBT_ACK_CONTENT_AR.annexRowCount).toBe(ROWS_PER_ANNEX_PAGE);
    expect(DEBT_ACK_CONTENT_EN.annexRowCount).toBe(ROWS_PER_ANNEX_PAGE);
    expect(DEBT_ACK_CONTENT_HI.annexRowCount).toBe(ROWS_PER_ANNEX_PAGE);
  });

  /**
   * الفصل الذي طلبه مالك المنتج: عدد صفوف **الصفحة** لا يحدّ عدد **الأقساط**.
   *
   * كان `MAX_INSTALLMENTS` يساوي `annexRowCount` حرفيًا، فصار قيدُ تخطيطِ ورقةٍ قيدَ
   * عمل: من أراد ثلاثة عشر قسطًا مُنع لأن الورقة تتّسع لاثني عشر صفًّا. صارا رقمين
   * مستقلَّين، وهذا الاختبار يمنع عودتهما إلى الالتصاق.
   */
  it('الحدّ الأقصى للأقساط **منفصل** عن سعة الصفحة ولا يساويها', () => {
    expect(MAX_INSTALLMENTS).not.toBe(ROWS_PER_ANNEX_PAGE);
    expect(MAX_INSTALLMENTS).toBeGreaterThan(ROWS_PER_ANNEX_PAGE);
    // سياجٌ تقنيّ حول رقمٍ يُدخله إنسان: عشر سنوات من الأقساط الشهرية.
    expect(MAX_INSTALLMENTS).toBe(120);
  });

  it('والتحقّق يقبل ما فوق سعة الصفحة ويرفض ما فوق الحدّ وحده', () => {
    const base = { debtAmount: 1000, firstDate: '2026-10-15', maxInstallments: MAX_INSTALLMENTS };
    const issuesFor = (count: number) =>
      validateSchedule({
        ...base,
        count,
        rows: buildInstallmentSchedule({ debtAmount: 1000, count, firstDate: '2026-10-15' }),
      });
    expect(issuesFor(13)).not.toContain('countAboveMax');
    expect(issuesFor(36)).not.toContain('countAboveMax');
    expect(issuesFor(MAX_INSTALLMENTS)).not.toContain('countAboveMax');
    expect(issuesFor(MAX_INSTALLMENTS + 1)).toContain('countAboveMax');
  });
});

// ══ لا فشل صامت في المدخلات ══════════════════════════════════════════════════
describe('المدخلات غير الصالحة تُعلَن ولا تُبتلع', () => {
  const base = { debtAmount: 1000, firstDate: '2026-10-15', rows: [], maxInstallments: MAX_INSTALLMENTS };

  it.each([
    [0, 'countNotPositive'],
    [-5, 'countNotPositive'],
    [2.5, 'countNotInteger'],
    [13.0001, 'countNotInteger'],
    [MAX_INSTALLMENTS + 1, 'countAboveMax'],
    [999999, 'countAboveMax'],
  ])('عدد %p ⇒ %s', (count, issue) => {
    expect(validateSchedule({ ...base, count })).toContain(issue);
  });

  it('والحاسبة نفسها لا تخترع صفوفًا من عدد غير صالح', () => {
    for (const count of [0, -1, 2.5, Number.NaN]) {
      expect(calculateInstallmentAmounts(1000, count)).toEqual([]);
      expect(buildInstallmentSchedule({ debtAmount: 1000, count, firstDate: '2026-10-15' })).toEqual([]);
    }
  });
});

// ══ أعداد الأقساط فوق سعة الصفحة الواحدة ═════════════════════════════════════
//
// كان `MAX_INSTALLMENTS` يساوي عدد صفوف صفحة الملحق، فصار قيدُ **تخطيط صفحة** قيدَ
// **عمل**: أربعة عشر قسطًا مرفوضة لأن الورقة تتّسع لاثني عشر صفًّا. فُصلا، وهذه
// الاختبارات تحرس أن الحاسبة تعمل لأي عدد وأن التقسيم يتبعه لا يحدّه.
describe('أعداد الأقساط فوق الاثني عشر', () => {
  const AMOUNT = 1000;
  const FIRST = '2026-10-15';
  const COUNTS = [1, 12, 13, 24, 25, 36];

  it.each(COUNTS)('%i قسطاً يولّد %i صفًّا بالضبط — لا جدولًا فارغًا', (count) => {
    const rows = buildInstallmentSchedule({ debtAmount: AMOUNT, count, firstDate: FIRST });
    expect(rows).toHaveLength(count);
    expect(rows.map((r) => r.no)).toEqual(Array.from({ length: count }, (_u, i) => i + 1));
  });

  it.each(COUNTS)('%i قسطاً: المجموع يساوي أصل الدين بالضبط', (count) => {
    const rows = buildInstallmentSchedule({ debtAmount: AMOUNT, count, firstDate: FIRST });
    expect(scheduleTotal(rows)).toBe(AMOUNT);
  });

  it.each(COUNTS)('%i قسطاً: فارق التقريب على الأخير وحده', (count) => {
    const amounts = calculateInstallmentAmounts(AMOUNT, count);
    const head = amounts.slice(0, -1);
    // كل ما قبل الأخير متساوٍ تمامًا؛ والأخير وحده يحمل الفارق.
    expect(new Set(head).size).toBeLessThanOrEqual(1);
    expect(sumMoney(amounts)).toBe(AMOUNT);
  });

  it.each(COUNTS)('%i قسطاً: الرصيد ينتهي عند صفر', (count) => {
    const rows = buildInstallmentSchedule({ debtAmount: AMOUNT, count, firstDate: FIRST });
    expect(rows[rows.length - 1].remainingBalance).toBe(0);
    // ولا رصيد سالب في أي صفّ.
    expect(rows.every((r) => r.remainingBalance >= 0)).toBe(true);
  });

  it.each(COUNTS)('%i قسطاً: التواريخ شهرية متّصلة عبر كل الصفحات', (count) => {
    const rows = buildInstallmentSchedule({ debtAmount: AMOUNT, count, firstDate: FIRST });
    rows.forEach((row, i) => {
      const monthsFromStart = 9 + i; // أكتوبر = الشهر 10 ⇒ الفهرس 9
      const year = 2026 + Math.floor(monthsFromStart / 12);
      const month = (monthsFromStart % 12) + 1;
      expect(row.dueDate).toBe(`${year}-${String(month).padStart(2, '0')}-15`);
    });
  });

  it('ثلاثة عشر قسطاً على ألف دينار: القيم المتوقَّعة بالضبط', () => {
    const rows = buildInstallmentSchedule({ debtAmount: 1000, count: 13, firstDate: FIRST });
    expect(rows).toHaveLength(13);
    expect(rows[0].amount).toBe(76.923);
    expect(rows[11].amount).toBe(76.923);
    expect(rows[12].amount).toBe(76.924);
    expect(rows[12].dueDate).toBe('2027-10-15');
    expect(rows[12].remainingBalance).toBe(0);
    expect(scheduleTotal(rows)).toBe(1000);
  });
});

// ══ تقسيم الجدول على صفحات الملحق ════════════════════════════════════════════
describe('تقسيم جدول السداد على صفحات الملحق', () => {
  const ROWS = 12;
  const make = (count: number) =>
    buildInstallmentSchedule({ debtAmount: 1000, count, firstDate: '2026-10-15' });

  it.each([
    [12, 1],
    [13, 2],
    [24, 2],
    [25, 3],
    [36, 3],
    [1, 1],
  ])('%i قسطاً ⇒ %i صفحة ملحق لكل نسخة', (count, expected) => {
    expect(paginateInstallmentSchedule(make(count), ROWS)).toHaveLength(expected);
    expect(annexPageCount(count, ROWS)).toBe(expected);
  });

  it('25 قسطاً تُقسَّم 12 · 12 · 1 بالترتيب وبلا إعادة ترقيم', () => {
    const pages = paginateInstallmentSchedule(make(25), ROWS);
    expect(pages.map((p) => p.length)).toEqual([12, 12, 1]);
    expect(pages[0][0].no).toBe(1);
    expect(pages[1][0].no).toBe(13);
    expect(pages[2][0].no).toBe(25);
  });

  it('لا صفّ يضيع ولا يتكرّر: تجميع الصفحات يعيد الجدول نفسه', () => {
    for (const count of [1, 12, 13, 24, 25, 36]) {
      const rows = make(count);
      expect(paginateInstallmentSchedule(rows, ROWS).flat()).toEqual(rows);
    }
  });

  it('جدول فارغ يعطي صفحة ملحق واحدة فارغة — لا صفر صفحات', () => {
    // المستند يحمل صفحة ملحق دائمًا، حتى قبل إدخال أي قسط: صفحةً بصفوفها الفارغة
    // كما في ملف Word قبل أن يُملأ.
    expect(paginateInstallmentSchedule([], ROWS)).toEqual([[]]);
    expect(annexPageCount(0, ROWS)).toBe(1);
  });

  it('لا تحسب ولا تعدّل: القطع هي نفس الكائنات بترتيبها', () => {
    const rows = make(13);
    const pages = paginateInstallmentSchedule(rows, ROWS);
    expect(pages[0][0]).toBe(rows[0]);
    expect(pages[1][0]).toBe(rows[12]);
  });
});
