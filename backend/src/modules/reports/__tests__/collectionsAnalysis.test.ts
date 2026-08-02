/**
 * Collections Analysis Report Enhancement Pack v1 — إثبات التطابق الحسابي.
 *
 * الفرضية التي تحرسها هذه الاختبارات: **كل** رقم معروض في أي قسم تحليلي يعود إلى
 * إجمالي التقرير نفسه — مصفوفة العملاء × الأشهر، والتحليل الشهري، وطرق الدفع
 * وتوزيعها، والتحصيل حسب العميل، والتحليل التاريخي بسنة الفاتورة، ومدّة التحصيل،
 * وتحليل النسب. أي انحراف فلسي واحد يُسقط الاختبار.
 */
import { describe, it, expect } from 'vitest';
import { buildCollectionsAnalysis, CollectionAnalysisRow } from '../collectionsAnalysis';
import { roundMoney } from '../../../shared/utils/money';

let seq = 0;
const row = (
  payIso: string,
  customerLabel: string,
  amount: number,
  methodLabel: string,
  issueIso: string,
  invoice?: { id?: number; number?: string; total?: number; paid?: number },
): CollectionAnalysisRow => {
  const id = invoice?.id ?? ++seq;
  return {
    date: new Date(payIso),
    amount,
    customerLabel,
    methodLabel,
    invoiceId: id,
    invoiceNumber: invoice?.number ?? `MN-INV-${String(id).padStart(3, '0')}`,
    invoiceIssueDate: new Date(issueIso),
    invoiceTotal: invoice?.total ?? amount,
    invoicePaidAmount: invoice?.paid ?? amount,
  };
};

/**
 * عيّنة تمتد على ثلاثة أشهر تحصيل، أربعة عملاء، ثلاث طرق دفع، وفواتير من ثلاث
 * سنوات إصدار مختلفة — بمبالغ ذات كسور فلسية، ودفعتان على فاتورة واحدة.
 */
const SAMPLE: CollectionAnalysisRow[] = [
  row('2026-01-10T10:00:00', 'بلدية الكويت', 1200.125, 'نقد',        '2025-11-01T00:00:00', { id: 1, total: 2000, paid: 1500.125 }),
  row('2026-01-25T10:00:00', 'بلدية الكويت',  300,     'تحويل بنكي', '2025-11-01T00:00:00', { id: 1, total: 2000, paid: 1500.125 }),
  row('2026-02-05T09:00:00', 'شركة الخليج',   5000,    'شيك',        '2024-06-15T00:00:00', { id: 2, total: 5000, paid: 5000 }),
  row('2026-02-18T09:00:00', 'مقاولات النور',   12.333, 'نقد',       '2026-02-01T00:00:00', { id: 3, total: 500, paid: 12.333 }),
  row('2026-03-09T08:00:00', 'شركة الخليج',   777.777, 'تحويل بنكي', '2026-03-08T00:00:00', { id: 4, total: 777.777, paid: 777.777 }),
  row('2026-03-21T08:00:00', 'وزارة الأشغال',  63.39,  'نقد',        '2025-03-21T00:00:00', { id: 5, total: 100, paid: 63.39 }),
];

const GRAND_TOTAL = roundMoney(SAMPLE.reduce((s, r) => s + r.amount, 0));

const analysis = buildCollectionsAnalysis(SAMPLE, GRAND_TOTAL);

const sectionByTitle = (a: ReturnType<typeof buildCollectionsAnalysis>, needle: string) => {
  const s = a.sections.find((x) => x.title.includes(needle));
  if (!s) throw new Error(`قسم غير موجود: ${needle}`);
  return s;
};
const kpi = (label: string) => analysis.kpis.find((k) => k.label === label)?.value;
const numeric = (v: unknown): number => (typeof v === 'number' ? v : 0);
const sumCol = (rows: Record<string, unknown>[], key: string) =>
  roundMoney(rows.reduce((s, r) => s + numeric(r[key]), 0));

describe('buildCollectionsAnalysis — المؤشرات التنفيذية', () => {
  it('إجمالي التحصيلات = إجمالي التقرير المُمرَّر حرفيًا', () => {
    expect(kpi('إجمالي التحصيلات')).toBe(GRAND_TOTAL);
  });

  it('العدد والمتوسط والعملاء وأكبر عملية من نفس المجموعة', () => {
    expect(kpi('عدد عمليات التحصيل')).toBe(SAMPLE.length);
    expect(kpi('متوسط قيمة التحصيل')).toBe(roundMoney(GRAND_TOTAL / SAMPLE.length));
    expect(kpi('عدد العملاء المحصَّل منهم')).toBe(4);
    expect(kpi('أكبر عملية تحصيل')).toBe(5000);
  });

  it('يصنّف الفواتير المميَّزة إلى مسدَّدة بالكامل وجزئيًا بلا تكرار', () => {
    // خمس فواتير مميَّزة (الفاتورة 1 لها دفعتان): 2 و4 مسدَّدتان بالكامل، والبقية جزئيًا.
    expect(kpi('فواتير محصَّلة بالكامل')).toBe(2);
    expect(kpi('فواتير محصَّلة جزئيًا')).toBe(3);
    expect(numeric(kpi('فواتير محصَّلة بالكامل')) + numeric(kpi('فواتير محصَّلة جزئيًا'))).toBe(5);
  });

  it('نسبة التحصيل = إجمالي التقرير ÷ قيمة الفواتير المشمولة', () => {
    const base = 2000 + 5000 + 500 + 777.777 + 100; // الفواتير المميَّزة، كلٌّ مرّة واحدة
    const rate = analysis.kpis.find((k) => k.label.startsWith('نسبة التحصيل'));
    expect(rate?.hint).toBe(roundMoney(base));
    expect(rate?.value).toBe(`${((GRAND_TOTAL / base) * 100).toFixed(1)}%`);
  });
});

describe('buildCollectionsAnalysis — التطابق الحسابي', () => {
  it('مصفوفة العملاء × الأشهر: الصفوف والأعمدة والمجموع الكلي = إجمالي التقرير', () => {
    const matrix = sectionByTitle(analysis, 'مصفوفة التحصيلات');
    const monthCols = matrix.columns.filter((c) => c.key.startsWith('m_'));

    for (const r of matrix.rows) {
      const across = roundMoney(monthCols.reduce((s, c) => s + numeric(r[c.key]), 0));
      expect(across).toBe(r.total); // مجموع الأشهر = إجمالي العميل
    }
    expect(sumCol(matrix.rows, 'total')).toBe(GRAND_TOTAL);
    expect(matrix.totalsRow?.total).toBe(GRAND_TOTAL);

    let sumOfMonthTotals = 0;
    for (const c of monthCols) {
      const down = roundMoney(matrix.rows.reduce((s, r) => s + numeric(r[c.key]), 0));
      expect(down).toBe(matrix.totalsRow?.[c.key]); // صفّ المجاميع = مجموع العمود
      sumOfMonthTotals += numeric(matrix.totalsRow?.[c.key]);
    }
    expect(roundMoney(sumOfMonthTotals)).toBe(GRAND_TOTAL);
  });

  it('التحليل الشهري: المجاميع والعدّادات وأكبر تحصيل متّسقة مع المجموعة', () => {
    const monthly = sectionByTitle(analysis, 'التحليل الشهري');
    expect(sumCol(monthly.rows, 'total')).toBe(GRAND_TOTAL);
    expect(monthly.rows.reduce((s, r) => s + numeric(r.count), 0)).toBe(SAMPLE.length);
    expect(monthly.totalsRow?.total).toBe(GRAND_TOTAL);
    expect(monthly.totalsRow?.count).toBe(SAMPLE.length);
    expect(monthly.totalsRow?.largest).toBe(5000);
    // أكبر تحصيل شهري لا يتجاوز إجمالي شهره أبدًا.
    for (const r of monthly.rows) expect(numeric(r.largest)).toBeLessThanOrEqual(numeric(r.total));
  });

  it('طرق الدفع: مرتَّبة تنازليًا، ومجموعها = الإجمالي، ونسبها 100.0% بالضبط', () => {
    const methods = sectionByTitle(analysis, 'التحصيلات حسب طريقة الدفع');
    const totals = methods.rows.map((r) => numeric(r.total));
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(sumCol(methods.rows, 'total')).toBe(GRAND_TOTAL);
    expect(methods.totalsRow?.total).toBe(GRAND_TOTAL);
    expect(methods.totalsRow?.percent).toBe('100.0%');
    expect(methods.rows.reduce((s, r) => s + numeric(r.count), 0)).toBe(SAMPLE.length);
  });

  it('توزيع طرق الدفع: نفس الأرقام والنسب المعروضة في قسم طرق الدفع', () => {
    const methods = sectionByTitle(analysis, 'التحصيلات حسب طريقة الدفع');
    const dist = sectionByTitle(analysis, 'توزيع طرق الدفع');
    expect(sumCol(dist.rows, 'total')).toBe(GRAND_TOTAL);
    expect(dist.totalsRow?.percent).toBe('100.0%');
    expect(dist.rows.reduce((s, r) => s + numeric(r.count), 0)).toBe(SAMPLE.length);
    for (const r of dist.rows) {
      const match = methods.rows.find((m) => m.method === r.method);
      expect(match?.total).toBe(r.total);
      expect(match?.percent).toBe(r.percent);
      expect(match?.count).toBe(r.count);
    }
  });

  it('التحصيل حسب العميل: مرتَّب تنازليًا، مجموعه = الإجمالي، ونسبه 100.0%', () => {
    const byCustomer = sectionByTitle(analysis, 'التحصيلات حسب العميل');
    const totals = byCustomer.rows.map((r) => numeric(r.total));
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(sumCol(byCustomer.rows, 'total')).toBe(GRAND_TOTAL);
    expect(byCustomer.totalsRow?.total).toBe(GRAND_TOTAL);
    expect(byCustomer.totalsRow?.percent).toBe('100.0%');
  });

  it('التحليل التاريخي: التصنيف بسنة إصدار الفاتورة لا بتاريخ الدفع', () => {
    const hist = sectionByTitle(analysis, 'التحليل التاريخي');
    const years = hist.rows.map((r) => r.year);
    // كل التحصيلات وقعت في 2026، لكن فواتيرها صادرة في 2024 و2025 و2026.
    expect(years).toEqual(['2024', '2025', '2026']);
    expect(numeric(hist.rows[0].total)).toBe(5000);                       // فاتورة 2024
    expect(numeric(hist.rows[1].total)).toBe(roundMoney(1200.125 + 300 + 63.39)); // فواتير 2025
    expect(sumCol(hist.rows, 'total')).toBe(GRAND_TOTAL);
    expect(hist.totalsRow?.total).toBe(GRAND_TOTAL);
    expect(hist.totalsRow?.percent).toBe('100.0%');
    // مجموع الفواتير عبر السنوات = عدد الفواتير المميَّزة (فاتورة واحدة لسنة واحدة).
    expect(hist.rows.reduce((s, r) => s + numeric(r.invoices), 0)).toBe(5);
    expect(hist.totalsRow?.invoices).toBe(5);
  });

  it('مدة التحصيل: كل الفئات معروضة، والمجموع = الإجمالي، والنسب 100.0%', () => {
    const delay = sectionByTitle(analysis, 'مدة التحصيل');
    expect(delay.rows).toHaveLength(6);
    expect(sumCol(delay.rows, 'total')).toBe(GRAND_TOTAL);
    expect(delay.rows.reduce((s, r) => s + numeric(r.count), 0)).toBe(SAMPLE.length);
    expect(delay.totalsRow?.total).toBe(GRAND_TOTAL);
    expect(delay.totalsRow?.count).toBe(SAMPLE.length);
    expect(delay.totalsRow?.percent).toBe('100.0%');
    // 09/03/2026 على فاتورة 08/03/2026 = يوم واحد ⇒ الفئة الأولى.
    expect(numeric(delay.rows[0].count)).toBeGreaterThan(0);
    // فئة بلا دفعات ⇒ خانة أيام فارغة لا صفر مضلِّل.
    for (const r of delay.rows) if (numeric(r.count) === 0) expect(r.avgDays).toBe('');
  });

  it('كفاءة التحصيل: الأسرع ≤ المتوسط والوسيط ≤ الأبطأ', () => {
    const eff = sectionByTitle(analysis, 'كفاءة التحصيل');
    const [avg, fastest, slowest, med] = eff.rows;
    expect(numeric(fastest.days)).toBeLessThanOrEqual(numeric(avg.days));
    expect(numeric(fastest.days)).toBeLessThanOrEqual(numeric(med.days));
    expect(numeric(slowest.days)).toBeGreaterThanOrEqual(numeric(med.days));
    expect(numeric(fastest.days)).toBe(1);   // 08/03 → 09/03
    expect(numeric(slowest.days)).toBe(600); // 15/06/2024 → 05/02/2026
    expect(avg.days).toBe(kpi('متوسط أيام التحصيل'));
    expect(eff.totalsRow).toBeUndefined();   // قسم تحليلي بلا مجاميع مالية
  });

  it('تحليل النسب: نفس نسب قسم العميل، ومجموعه = الإجمالي و100.0%', () => {
    const pct = sectionByTitle(analysis, 'تحليل النسب');
    const byCustomer = sectionByTitle(analysis, 'التحصيلات حسب العميل');
    expect(sumCol(pct.rows, 'total')).toBe(GRAND_TOTAL);
    expect(pct.totalsRow?.total).toBe(GRAND_TOTAL);
    expect(pct.totalsRow?.percent).toBe('100.0%');
    for (const r of pct.rows) {
      const match = byCustomer.rows.find((c) => c.customer === r.customer);
      expect(match?.percent).toBe(r.percent);
      expect(match?.total).toBe(r.total);
    }
  });

  it('أكبر التحصيلات: مرتَّبة تنازليًا، محدودة بعشرين، بلا صفّ مجاميع', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      row('2026-01-05T10:00:00', `عميل ${i}`, i + 1, 'نقد', '2026-01-01T00:00:00'),
    );
    const big = buildCollectionsAnalysis(many, roundMoney(many.reduce((s, r) => s + r.amount, 0)));
    const top = sectionByTitle(big, 'أكبر التحصيلات');
    expect(top.rows).toHaveLength(20);
    expect(top.rows[0].amount).toBe(25);
    expect(top.note).toContain('25');
    expect(top.totalsRow).toBeUndefined(); // عيّنة لا إجمالي — لا صفّ مجاميع مضلِّل
  });

  it('مقارنة الأشهر: الفرق = الأعلى − الأدنى', () => {
    const cmp = sectionByTitle(analysis, 'مقارنة أشهر التحصيل');
    const [high, low, diff] = cmp.rows;
    expect(numeric(diff.amount)).toBe(roundMoney(numeric(high.amount) - numeric(low.amount)));
    expect(numeric(high.amount)).toBeGreaterThanOrEqual(numeric(low.amount));
  });
});

describe('buildCollectionsAnalysis — حالات الحدود', () => {
  it('مجموعة فارغة ⇒ لا مؤشرات ولا أقسام (التقرير كما كان قبل الحزمة)', () => {
    const empty = buildCollectionsAnalysis([], 0);
    expect(empty.kpis).toEqual([]);
    expect(empty.sections).toEqual([]);
  });

  it('شهر واحد فقط ⇒ عمود واحد في المصفوفة بلا أسماء سنوات', () => {
    const single = [
      row('2026-06-01T00:00:00', 'عميل أ', 10, 'نقد', '2026-05-01T00:00:00'),
      row('2026-06-20T00:00:00', 'عميل ب', 5, 'شيك', '2026-05-01T00:00:00'),
    ];
    const a = buildCollectionsAnalysis(single, 15);
    const monthCols = sectionByTitle(a, 'مصفوفة التحصيلات').columns.filter((c) => c.key.startsWith('m_'));
    expect(monthCols).toHaveLength(1);
    expect(monthCols[0].header).toBe('يونيو');
  });

  it('أكثر من سنة تحصيل ⇒ رؤوس الأشهر تحمل السنة، والمجاميع تبقى متطابقة', () => {
    const spread = [
      row('2025-11-10T00:00:00', 'عميل أ', 100, 'نقد', '2025-01-01T00:00:00'),
      row('2026-02-10T00:00:00', 'عميل أ', 50, 'نقد', '2025-01-01T00:00:00'),
    ];
    const a = buildCollectionsAnalysis(spread, 150);
    const matrix = sectionByTitle(a, 'مصفوفة التحصيلات');
    const monthCols = matrix.columns.filter((c) => c.key.startsWith('m_'));
    expect(monthCols).toHaveLength(4); // نوفمبر 2025 → فبراير 2026 متّصلة
    expect(monthCols[0].header).toBe('نوفمبر 2025');
    expect(monthCols[3].header).toBe('فبراير 2026');
    expect(matrix.totalsRow?.total).toBe(150);
    expect(roundMoney(monthCols.reduce((s, c) => s + numeric(matrix.totalsRow?.[c.key]), 0))).toBe(150);
  });

  it('دفعة مقدَّمة (قبل تاريخ الفاتورة) تُحتسب في الفئة الأولى ولا تسقط من التوزيع', () => {
    const advance = [row('2026-01-01T00:00:00', 'عميل أ', 250.75, 'نقد', '2026-01-20T00:00:00')];
    const a = buildCollectionsAnalysis(advance, 250.75);
    const delay = sectionByTitle(a, 'مدة التحصيل');
    expect(numeric(delay.rows[0].count)).toBe(1);
    expect(delay.rows[0].percent).toBe('100.0%');
    expect(sumCol(delay.rows, 'total')).toBe(250.75);
    expect(numeric(sectionByTitle(a, 'كفاءة التحصيل').rows[1].days)).toBe(-19);
  });

  it('تحصيل واحد ⇒ كل الأقسام متّسقة والنسبة 100.0%', () => {
    const one = [row('2026-04-04T00:00:00', 'عميل أ', 250.75, 'شيك', '2026-01-04T00:00:00')];
    const a = buildCollectionsAnalysis(one, 250.75);
    expect(sectionByTitle(a, 'التحصيلات حسب العميل').rows[0].percent).toBe('100.0%');
    expect(sectionByTitle(a, 'التحليل التاريخي').totalsRow?.total).toBe(250.75);
    expect(sectionByTitle(a, 'التحليل الشهري').totalsRow?.total).toBe(250.75);
    expect(numeric(sectionByTitle(a, 'مقارنة أشهر التحصيل').rows[2].amount)).toBe(0);
  });
});
