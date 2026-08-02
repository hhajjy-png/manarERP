/* ════════════════════════════════════════════════════════════════════════════
   Expense Analysis Report Enhancement Pack v1 — pure analytical layer.

   يحوّل **نفس** صفوف تقرير المصروفات المُحمَّلة مسبقًا (نتيجة استعلام واحد في
   `reports.service.ts#expenses`) إلى مؤشرات تنفيذية وأقسام تحليلية.

   ═══ لماذا لا استعلام ثانٍ ═══
   كل رقم هنا مشتق من المصفوفة التي بناها الاستعلام الأصلي بعد تطبيق كل الفلاتر
   (المدى الزمني، الحالة، التصنيف، المورد، شهر/سنة الحساب، البحث). فالنتيجة:

     • لا استعلام إضافي، ولا N+1، ولا منطق تجميع مكرَّر.
     • استحالة تجاهُل فلتر نشط — لا يوجد مسار بيانات ثانٍ يمكن أن ينحرف.
     • الإجمالي الكلي في كل قسم هو **نفس** التعبير الحسابي الذي يبني إجمالي
       التقرير الأصلي، فالتطابق بنيوي لا مصادفة.

   الوحدة **نقيّة تمامًا** (لا Prisma، لا I/O) — لذلك تُختبر مباشرة.
   ════════════════════════════════════════════════════════════════════════════ */

import {
  MAX_MATRIX_MONTHS,
  TOTAL_LABEL,
  apportionPercents,
  axisSpansYears,
  buildMonthAxis,
  monthKey,
  monthLabel,
} from './analysisKit';
import { roundMoney } from '../../shared/utils/money';
import { formatPercent } from '../../shared/utils/currency';
import { formatDisplayDate } from '../../shared/utils/dateDisplay';
import type { ReportKpi, ReportSection } from '../../shared/services/reportEngine/excel.service';

/** الحقول التي يحتاجها التحليل من صفّ المصروف — لا شيء غيرها. */
export interface ExpenseAnalysisRow {
  /** تاريخ المصروف — نفس الحقل الذي يفلتره التقرير زمنيًا (`Expense.date`). */
  date: Date;
  /** التسمية العربية للتصنيف (ناتج `expenseCategoryAr`) — هي مفتاح التجميع المعروض. */
  categoryLabel: string;
  amount: number;
  code: string;
  description: string;
}

export interface ExpenseAnalysis {
  kpis: ReportKpi[];
  sections: ReportSection[];
}

/** حدّ «أكبر المصروفات» — محرّك التقارير بلا ترقيم صفحات، فالحدّ معلَن لا صامت. */
const TOP_EXPENSES_LIMIT = 20;

const CATEGORY_COL_WIDTH = 26;
const MONTH_COL_WIDTH = 15;
const TOTAL_COL_WIDTH = 17;

// محور الأشهر وتسمياته وتوزيع النسب مشتركة الآن مع باقي الحزم التحليلية
// (`analysisKit.ts`) — سلوكها هنا لم يتغيّر حرفًا واحدًا، لكنها لم تعد نسخة
// خاصّة بهذا التقرير يمكن أن تنحرف عن نظيرتها في تقرير آخر.
export { apportionPercents };

/**
 * يبني المؤشرات التنفيذية والأقسام التحليلية من صفوف التقرير المفلترة.
 *
 * `grandTotal` يُمرَّر من المستدعي وهو **نفس** إجمالي التقرير المعروض، فلا يُعاد
 * احتسابه هنا بتعبير ثانٍ قد ينحرف عنه عند التقريب.
 */
export function buildExpenseAnalysis(rows: ExpenseAnalysisRow[], grandTotal: number): ExpenseAnalysis {
  // مجموعة فارغة ⇒ لا تحليل: التقرير يبقى كما كان قبل الحزمة حرفيًا، ولا قسم
  // يعرض قسمة على صفر أو «أعلى شهر» لا وجود له.
  if (rows.length === 0) return { kpis: [], sections: [] };

  const count = rows.length;
  const average = count > 0 ? roundMoney(grandTotal / count) : 0;

  // ── تجميعة واحدة تمرّ على الصفوف مرّة واحدة ──────────────────────────────
  const monthAgg = new Map<string, { total: number; count: number }>();
  const categoryAgg = new Map<string, { total: number; count: number }>();
  const matrix = new Map<string, Map<string, number>>();

  for (const r of rows) {
    const mk = monthKey(r.date);
    const cat = r.categoryLabel || '—';

    const m = monthAgg.get(mk) ?? { total: 0, count: 0 };
    m.total += r.amount;
    m.count += 1;
    monthAgg.set(mk, m);

    const c = categoryAgg.get(cat) ?? { total: 0, count: 0 };
    c.total += r.amount;
    c.count += 1;
    categoryAgg.set(cat, c);

    let byMonth = matrix.get(cat);
    if (!byMonth) { byMonth = new Map(); matrix.set(cat, byMonth); }
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + r.amount);
  }

  const { keys: monthKeys, truncated } = buildMonthAxis(rows.map((r) => r.date));
  const withYear = axisSpansYears(monthKeys);

  // التصنيفات مرتَّبة تنازليًا بالإنفاق — الأهمّ أولًا في كل قسم يذكرها.
  const categories = Array.from(categoryAgg.entries())
    .map(([label, agg]) => ({ label, total: agg.total, count: agg.count }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'ar'));

  const percents = apportionPercents(categories.map((c) => c.total), grandTotal);

  const kpis = buildKpis({ grandTotal, count, average, monthAgg, categories, withYear });

  const sections: ReportSection[] = [
    buildMatrixSection(categories, matrix, monthKeys, withYear, grandTotal, truncated),
    buildMonthlySection(monthKeys, monthAgg, withYear, grandTotal, count, average),
    buildTopCategoriesSection(categories, percents, grandTotal),
    buildTopExpensesSection(rows),
    buildMonthComparisonSection(monthKeys, monthAgg, withYear),
    buildPercentageSection(categories, percents, grandTotal, count),
  ];

  return { kpis, sections };
}

// ─── المؤشرات التنفيذية ───────────────────────────────────────────────────────

function buildKpis(args: {
  grandTotal: number;
  count: number;
  average: number;
  monthAgg: Map<string, { total: number; count: number }>;
  categories: { label: string; total: number; count: number }[];
  withYear: boolean;
}): ReportKpi[] {
  const { grandTotal, count, average, monthAgg, categories } = args;

  let peakMonth: { key: string; total: number } | null = null;
  for (const [key, agg] of monthAgg) {
    if (!peakMonth || agg.total > peakMonth.total) peakMonth = { key, total: agg.total };
  }
  const topCategory = categories[0];

  return [
    { label: 'إجمالي المصروفات', value: grandTotal, format: 'currency', color: 'blue', icon: 'payments' },
    { label: 'عدد حركات الصرف', value: count, icon: 'receipt_long' },
    { label: 'متوسط قيمة المصروف', value: average, format: 'currency', icon: 'calculate' },
    // الشهر/التصنيف يحملان السنة والمبلغ معًا كي تُقرأ البطاقة بلا رجوع للجداول.
    {
      label: 'أعلى شهر إنفاقًا',
      value: peakMonth ? monthLabel(peakMonth.key, true) : '—',
      hint: peakMonth ? roundMoney(peakMonth.total) : undefined,
      hintFormat: 'currency',
      color: 'red',
      icon: 'calendar_month',
    },
    {
      label: 'أعلى تصنيف إنفاقًا',
      value: topCategory ? topCategory.label : '—',
      hint: topCategory ? roundMoney(topCategory.total) : undefined,
      hintFormat: 'currency',
      color: 'red',
      icon: 'trending_up',
    },
    { label: 'عدد التصنيفات', value: categories.length, color: 'green', icon: 'category' },
  ];
}

// ─── مصفوفة التصنيفات × الأشهر (Pivot) ────────────────────────────────────────

function buildMatrixSection(
  categories: { label: string; total: number }[],
  matrix: Map<string, Map<string, number>>,
  monthKeys: string[],
  withYear: boolean,
  grandTotal: number,
  truncated: boolean,
): ReportSection {
  const monthColKey = (k: string) => `m_${k}`;

  const columns = [
    { header: 'التصنيف', key: 'category', width: CATEGORY_COL_WIDTH },
    ...monthKeys.map((k) => ({
      header: monthLabel(k, withYear),
      key: monthColKey(k),
      width: MONTH_COL_WIDTH,
      numFmt: '#,##0.000',
      format: 'currency' as const,
    })),
    { header: TOTAL_LABEL, key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' as const },
  ];

  const rows = categories.map((c) => {
    const byMonth = matrix.get(c.label);
    const row: Record<string, unknown> = { category: c.label, total: roundMoney(c.total) };
    for (const k of monthKeys) row[monthColKey(k)] = roundMoney(byMonth?.get(k) ?? 0);
    return row;
  });

  // صفّ «الإجمالي»: كل خليّة مجموع عمودها الخام (لا مجموع خلايا مقرَّبة)، والخليّة
  // الأخيرة هي إجمالي التقرير نفسه — فلا يمكن أن تنفصل عنه.
  const totalsRow: Record<string, unknown> = { category: TOTAL_LABEL, total: grandTotal };
  for (const k of monthKeys) {
    let sum = 0;
    for (const c of categories) sum += matrix.get(c.label)?.get(k) ?? 0;
    totalsRow[monthColKey(k)] = roundMoney(sum);
  }

  return {
    title: 'مصفوفة المصروفات: التصنيفات × الأشهر',
    note: truncated
      ? `يمتد التقرير على أكثر من ${MAX_MATRIX_MONTHS} شهرًا — تُعرض الأشهر ذات الحركات فقط.`
      : undefined,
    sheetName: 'مصفوفة التصنيفات والأشهر',
    columns,
    rows,
    totalsRow,
  };
}

// ─── التحليل الشهري ───────────────────────────────────────────────────────────

function buildMonthlySection(
  monthKeys: string[],
  monthAgg: Map<string, { total: number; count: number }>,
  withYear: boolean,
  grandTotal: number,
  grandCount: number,
  grandAverage: number,
): ReportSection {
  return {
    title: 'التحليل الشهري',
    sheetName: 'التحليل الشهري',
    columns: [
      { header: 'الشهر', key: 'month', width: 20 },
      { header: 'عدد المصروفات', key: 'count', width: 16, align: 'center', type: 'number' },
      { header: 'إجمالي المصروفات', key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'متوسط المصروف', key: 'average', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
    ],
    rows: monthKeys.map((k) => {
      const agg = monthAgg.get(k) ?? { total: 0, count: 0 };
      return {
        month: monthLabel(k, withYear),
        count: agg.count,
        total: roundMoney(agg.total),
        average: agg.count > 0 ? roundMoney(agg.total / agg.count) : 0,
      };
    }),
    totalsRow: { month: TOTAL_LABEL, count: grandCount, total: grandTotal, average: grandAverage },
  };
}

// ─── أعلى التصنيفات إنفاقًا ───────────────────────────────────────────────────

function buildTopCategoriesSection(
  categories: { label: string; total: number }[],
  percents: number[],
  grandTotal: number,
): ReportSection {
  return {
    title: 'أعلى التصنيفات إنفاقًا',
    sheetName: 'أعلى التصنيفات',
    columns: [
      { header: 'الترتيب', key: 'rank', width: 10, align: 'center', type: 'number' },
      { header: 'التصنيف', key: 'category', width: CATEGORY_COL_WIDTH },
      { header: TOTAL_LABEL, key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'النسبة من إجمالي المصروفات', key: 'percent', width: 24, align: 'center' },
    ],
    rows: categories.map((c, i) => ({
      rank: i + 1,
      category: c.label,
      total: roundMoney(c.total),
      percent: formatPercent(percents[i]),
    })),
    totalsRow: {
      category: TOTAL_LABEL,
      total: grandTotal,
      percent: formatPercent(percents.reduce((a, b) => a + b, 0)),
    },
  };
}

// ─── أكبر المصروفات ───────────────────────────────────────────────────────────

function buildTopExpensesSection(rows: ExpenseAnalysisRow[]): ReportSection {
  const sorted = [...rows].sort(
    (a, b) => b.amount - a.amount || b.date.getTime() - a.date.getTime() || a.code.localeCompare(b.code),
  );
  const top = sorted.slice(0, TOP_EXPENSES_LIMIT);

  return {
    title: `أكبر المصروفات (أعلى ${TOP_EXPENSES_LIMIT})`,
    // حدّ معلَن صراحةً: هذا القسم عيّنة، ومجموعه ليس إجمالي التقرير — ولذلك بلا صفّ مجاميع.
    note:
      rows.length > TOP_EXPENSES_LIMIT
        ? `يعرض هذا القسم أكبر ${TOP_EXPENSES_LIMIT} حركة من أصل ${rows.length} — وهو عيّنة لا إجمالي.`
        : undefined,
    sheetName: 'أكبر المصروفات',
    columns: [
      { header: 'التاريخ', key: 'date', width: 16, align: 'center' },
      { header: 'الرقم', key: 'code', width: 16 },
      { header: 'الوصف', key: 'description', width: 36 },
      { header: 'التصنيف', key: 'category', width: CATEGORY_COL_WIDTH },
      { header: 'المبلغ', key: 'amount', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
    ],
    rows: top.map((r) => ({
      date: formatDisplayDate(r.date),
      code: r.code,
      description: r.description,
      category: r.categoryLabel,
      amount: roundMoney(r.amount),
    })),
  };
}

// ─── مقارنة الأشهر (تحليلية فقط) ──────────────────────────────────────────────

function buildMonthComparisonSection(
  monthKeys: string[],
  monthAgg: Map<string, { total: number; count: number }>,
  withYear: boolean,
): ReportSection {
  // الأشهر الفارغة داخل المحور المتّصل ليست «أدنى إنفاق» — المقارنة على أشهر الحركة.
  const active = monthKeys
    .map((k) => ({ key: k, total: monthAgg.get(k)?.total ?? 0 }))
    .filter((m) => monthAgg.has(m.key));

  const highest = active.reduce((a, b) => (b.total > a.total ? b : a), active[0]);
  const lowest = active.reduce((a, b) => (b.total < a.total ? b : a), active[0]);
  const difference = roundMoney(highest.total - lowest.total);
  const percentDiff = lowest.total > 0 ? formatPercent((difference / lowest.total) * 100) : '—';

  return {
    title: 'مقارنة الأشهر',
    note: 'قسم تحليلي — لا يدخل في مجاميع التقرير.',
    sheetName: 'مقارنة الأشهر',
    columns: [
      { header: 'البيان', key: 'metric', width: 26 },
      { header: 'الشهر', key: 'month', width: 20, align: 'center' },
      { header: 'المبلغ', key: 'amount', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'النسبة', key: 'percent', width: 14, align: 'center' },
    ],
    rows: [
      { metric: 'أعلى شهر إنفاقًا', month: monthLabel(highest.key, withYear), amount: roundMoney(highest.total), percent: '' },
      { metric: 'أدنى شهر إنفاقًا', month: monthLabel(lowest.key, withYear), amount: roundMoney(lowest.total), percent: '' },
      { metric: 'الفرق بين الأعلى والأدنى', month: '', amount: difference, percent: percentDiff },
    ],
  };
}

// ─── تحليل النسب ──────────────────────────────────────────────────────────────

function buildPercentageSection(
  categories: { label: string; total: number; count: number }[],
  percents: number[],
  grandTotal: number,
  grandCount: number,
): ReportSection {
  // نفس النسب المُوزَّعة المستخدمة في «أعلى التصنيفات» — مصدر واحد فلا يختلف الرقمان.
  const byName = categories
    .map((c, i) => ({ ...c, percent: percents[i] }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ar'));

  return {
    title: 'تحليل النسب لكل تصنيف',
    sheetName: 'تحليل النسب',
    columns: [
      { header: 'التصنيف', key: 'category', width: CATEGORY_COL_WIDTH },
      { header: 'عدد المصروفات', key: 'count', width: 16, align: 'center', type: 'number' },
      { header: 'إجمالي التصنيف', key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'النسبة من إجمالي المصروفات', key: 'percent', width: 24, align: 'center' },
    ],
    rows: byName.map((c) => ({
      category: c.label,
      count: c.count,
      total: roundMoney(c.total),
      percent: formatPercent(c.percent),
    })),
    totalsRow: {
      category: TOTAL_LABEL,
      count: grandCount,
      total: grandTotal,
      percent: formatPercent(percents.reduce((a, b) => a + b, 0)),
    },
  };
}
