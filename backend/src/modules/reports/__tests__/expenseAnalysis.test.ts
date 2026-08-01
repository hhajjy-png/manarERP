/**
 * Expense Analysis Report Enhancement Pack v1 — إثبات التطابق الحسابي.
 *
 * الفرضية التي تحرسها هذه الاختبارات: **كل** رقم معروض في أي قسم تحليلي يعود إلى
 * إجمالي التقرير نفسه — مصفوفة التصنيفات، التحليل الشهري، ترتيب التصنيفات، وتحليل
 * النسب. أي انحراف فلسي واحد يُسقط الاختبار.
 */
import { describe, it, expect } from 'vitest';
import { buildExpenseAnalysis, apportionPercents, ExpenseAnalysisRow } from '../expenseAnalysis';
import { roundMoney } from '../../../shared/utils/money';

const row = (dateIso: string, categoryLabel: string, amount: number, code = 'EXP-1'): ExpenseAnalysisRow => ({
  date: new Date(dateIso),
  categoryLabel,
  amount,
  code,
  description: `مصروف ${code}`,
});

/** عيّنة تمتد على ثلاثة أشهر وأربعة تصنيفات، بمبالغ ذات كسور فلسية. */
const SAMPLE: ExpenseAnalysisRow[] = [
  row('2025-01-05T10:00:00', 'وقود', 1200.125, 'EXP-01'),
  row('2025-01-18T10:00:00', 'صيانة', 340.5, 'EXP-02'),
  row('2025-01-31T23:30:00', 'وقود', 99.875, 'EXP-03'),
  row('2025-02-02T08:00:00', 'إيجارات', 5000, 'EXP-04'),
  row('2025-02-14T08:00:00', 'صيانة', 12.333, 'EXP-05'),
  row('2025-03-09T08:00:00', 'وقود', 777.777, 'EXP-06'),
  row('2025-03-21T08:00:00', 'مشتريات', 63.39, 'EXP-07'),
];

const GRAND_TOTAL = roundMoney(SAMPLE.reduce((s, r) => s + r.amount, 0));

const sectionByTitle = (analysis: ReturnType<typeof buildExpenseAnalysis>, needle: string) => {
  const s = analysis.sections.find((x) => x.title.includes(needle));
  if (!s) throw new Error(`قسم غير موجود: ${needle}`);
  return s;
};

const numeric = (v: unknown): number => (typeof v === 'number' ? v : 0);

describe('buildExpenseAnalysis — التطابق الحسابي', () => {
  const analysis = buildExpenseAnalysis(SAMPLE, GRAND_TOTAL);

  it('يُصدر مؤشر إجمالي المصروفات مطابقًا لإجمالي التقرير', () => {
    const kpi = analysis.kpis.find((k) => k.label === 'إجمالي المصروفات');
    expect(kpi?.value).toBe(GRAND_TOTAL);
  });

  it('يحسب عدد الحركات وعدد التصنيفات والمتوسط من نفس المجموعة', () => {
    expect(analysis.kpis.find((k) => k.label === 'عدد حركات الصرف')?.value).toBe(SAMPLE.length);
    expect(analysis.kpis.find((k) => k.label === 'عدد التصنيفات')?.value).toBe(4);
    expect(analysis.kpis.find((k) => k.label === 'متوسط قيمة المصروف')?.value).toBe(
      roundMoney(GRAND_TOTAL / SAMPLE.length),
    );
  });

  it('مجموع صفوف المصفوفة أفقيًا = إجمالي كل تصنيف، ومجموعها الكلي = إجمالي التقرير', () => {
    const matrix = sectionByTitle(analysis, 'مصفوفة');
    const monthCols = matrix.columns.filter((c) => c.key.startsWith('m_'));

    let sumOfRowTotals = 0;
    for (const r of matrix.rows) {
      const across = roundMoney(monthCols.reduce((s, c) => s + numeric(r[c.key]), 0));
      expect(across).toBe(r.total);          // مجموع الأشهر = إجمالي التصنيف
      sumOfRowTotals += numeric(r.total);
    }
    expect(roundMoney(sumOfRowTotals)).toBe(GRAND_TOTAL);
    expect(matrix.totalsRow?.total).toBe(GRAND_TOTAL);
  });

  it('صفّ مجاميع المصفوفة = مجموع عمود كل شهر، ومجموعه = إجمالي التقرير', () => {
    const matrix = sectionByTitle(analysis, 'مصفوفة');
    const monthCols = matrix.columns.filter((c) => c.key.startsWith('m_'));

    let sumOfMonthTotals = 0;
    for (const c of monthCols) {
      const down = roundMoney(matrix.rows.reduce((s, r) => s + numeric(r[c.key]), 0));
      expect(down).toBe(matrix.totalsRow?.[c.key]);
      sumOfMonthTotals += numeric(matrix.totalsRow?.[c.key]);
    }
    expect(roundMoney(sumOfMonthTotals)).toBe(GRAND_TOTAL);
  });

  it('التحليل الشهري: مجموع الأشهر = الإجمالي، ومجموع العدّادات = عدد الحركات', () => {
    const monthly = sectionByTitle(analysis, 'التحليل الشهري');
    const total = roundMoney(monthly.rows.reduce((s, r) => s + numeric(r.total), 0));
    const count = monthly.rows.reduce((s, r) => s + numeric(r.count), 0);
    expect(total).toBe(GRAND_TOTAL);
    expect(count).toBe(SAMPLE.length);
    expect(monthly.totalsRow?.total).toBe(GRAND_TOTAL);
    expect(monthly.totalsRow?.count).toBe(SAMPLE.length);
  });

  it('أعلى التصنيفات: مرتَّب تنازليًا، ومجموعه = الإجمالي، ونسبه = 100.0% بالضبط', () => {
    const top = sectionByTitle(analysis, 'أعلى التصنيفات');
    const totals = top.rows.map((r) => numeric(r.total));
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(roundMoney(totals.reduce((s, v) => s + v, 0))).toBe(GRAND_TOTAL);
    expect(top.totalsRow?.percent).toBe('100.0%');
    expect(top.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('تحليل النسب: نفس التصنيفات والمجاميع، ونسبه تجمع إلى 100.0% بالضبط', () => {
    const pct = sectionByTitle(analysis, 'تحليل النسب');
    expect(roundMoney(pct.rows.reduce((s, r) => s + numeric(r.total), 0))).toBe(GRAND_TOTAL);
    expect(pct.totalsRow?.total).toBe(GRAND_TOTAL);
    expect(pct.totalsRow?.percent).toBe('100.0%');
    expect(pct.totalsRow?.count).toBe(SAMPLE.length);

    // النسب مشتقة من مصدر واحد — القسمان لا يختلفان لتصنيف واحد.
    const top = sectionByTitle(analysis, 'أعلى التصنيفات');
    for (const r of pct.rows) {
      const match = top.rows.find((t) => t.category === r.category);
      expect(match?.percent).toBe(r.percent);
    }
  });

  it('أكبر المصروفات: مرتَّبة تنازليًا بالمبلغ ومحدودة بعشرين حركة', () => {
    const many = Array.from({ length: 25 }, (_, i) => row('2025-01-05T10:00:00', 'وقود', i + 1, `EXP-${i}`));
    const big = buildExpenseAnalysis(many, roundMoney(many.reduce((s, r) => s + r.amount, 0)));
    const top = sectionByTitle(big, 'أكبر المصروفات');
    expect(top.rows).toHaveLength(20);
    expect(top.rows[0].amount).toBe(25);
    expect(top.note).toContain('25');
    expect(top.totalsRow).toBeUndefined(); // عيّنة لا إجمالي — لا صفّ مجاميع مضلِّل
  });

  it('مقارنة الأشهر: الفرق = الأعلى − الأدنى', () => {
    const cmp = sectionByTitle(analysis, 'مقارنة الأشهر');
    const [high, low, diff] = cmp.rows;
    expect(numeric(diff.amount)).toBe(roundMoney(numeric(high.amount) - numeric(low.amount)));
    expect(numeric(high.amount)).toBeGreaterThanOrEqual(numeric(low.amount));
  });
});

describe('buildExpenseAnalysis — حالات الحدود', () => {
  it('شهر واحد فقط ⇒ عمود واحد في المصفوفة بلا أسماء سنوات', () => {
    const single = [row('2025-06-01T00:00:00', 'وقود', 10), row('2025-06-20T00:00:00', 'صيانة', 5)];
    const a = buildExpenseAnalysis(single, 15);
    const matrix = sectionByTitle(a, 'مصفوفة');
    const monthCols = matrix.columns.filter((c) => c.key.startsWith('m_'));
    expect(monthCols).toHaveLength(1);
    expect(monthCols[0].header).toBe('يونيو');
  });

  it('أكثر من سنة ⇒ رؤوس الأشهر تحمل السنة، والمجاميع تبقى متطابقة', () => {
    const spread = [row('2024-11-10T00:00:00', 'وقود', 100), row('2025-02-10T00:00:00', 'وقود', 50)];
    const a = buildExpenseAnalysis(spread, 150);
    const matrix = sectionByTitle(a, 'مصفوفة');
    const monthCols = matrix.columns.filter((c) => c.key.startsWith('m_'));
    // نوفمبر 2024 → فبراير 2025 = أربعة أشهر متّصلة، الفارغ منها صفر لا فجوة.
    expect(monthCols).toHaveLength(4);
    expect(monthCols[0].header).toBe('نوفمبر 2024');
    expect(monthCols[3].header).toBe('فبراير 2025');
    expect(matrix.totalsRow?.total).toBe(150);
    expect(roundMoney(monthCols.reduce((s, c) => s + numeric(matrix.totalsRow?.[c.key]), 0))).toBe(150);
  });

  it('حركة واحدة ⇒ كل الأقسام متّسقة والنسبة 100.0%', () => {
    const one = [row('2025-04-04T00:00:00', 'إيجارات', 250.75)];
    const a = buildExpenseAnalysis(one, 250.75);
    expect(sectionByTitle(a, 'أعلى التصنيفات').rows[0].percent).toBe('100.0%');
    expect(sectionByTitle(a, 'التحليل الشهري').totalsRow?.total).toBe(250.75);
    expect(sectionByTitle(a, 'مقارنة الأشهر').rows[2].amount).toBe(0);
  });
});

describe('apportionPercents — التوزيع بأكبر البواقي', () => {
  it('ثلاثة أثلاث متساوية تجمع إلى 100.0 بالضبط', () => {
    const p = apportionPercents([1, 1, 1], 3);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    expect(p).toEqual([33.4, 33.3, 33.3]);
  });

  it('سبعة أسباع متساوية تجمع إلى 100.0 بالضبط', () => {
    const p = apportionPercents(Array(7).fill(1), 7);
    expect(Number(p.reduce((a, b) => a + b, 0).toFixed(1))).toBe(100);
  });

  it('إجمالي صفري ⇒ أصفار، ولا تُفرض 100%', () => {
    expect(apportionPercents([0, 0], 0)).toEqual([0, 0]);
  });

  it('قائمة فارغة ⇒ قائمة فارغة', () => {
    expect(apportionPercents([], 100)).toEqual([]);
  });
});
