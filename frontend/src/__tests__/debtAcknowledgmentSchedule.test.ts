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
  buildInstallmentDates,
  buildInstallmentSchedule,
  calculateInstallmentAmounts,
  recalculateBalances,
  scheduleTotal,
  validateSchedule,
} from '../forms/debtAcknowledgment/debtAcknowledgmentSchedule';
import { MAX_INSTALLMENTS } from '../forms/debtAcknowledgment/constants';
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

describe('سعة ملحق السداد مشتقّة من ملفات Word لا مكتوبة', () => {
  it('الحدّ الأقصى يساوي عدد صفوف الملحق في الحزم الثلاث', () => {
    expect(MAX_INSTALLMENTS).toBe(12);
    expect(DEBT_ACK_CONTENT_AR.annexRowCount).toBe(MAX_INSTALLMENTS);
    expect(DEBT_ACK_CONTENT_EN.annexRowCount).toBe(MAX_INSTALLMENTS);
    expect(DEBT_ACK_CONTENT_HI.annexRowCount).toBe(MAX_INSTALLMENTS);
  });
});
