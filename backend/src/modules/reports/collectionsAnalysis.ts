/* ════════════════════════════════════════════════════════════════════════════
   Collections Analysis Report Enhancement Pack v1 — طبقة تحليلية نقيّة.

   يحوّل **نفس** صفوف «ملخص التحصيلات» المُحمَّلة مسبقًا (نتيجة استعلام واحد في
   `reports.service.ts#collectionsSummary`) إلى مؤشرات تنفيذية وأقسام تحليلية.

   ═══ لماذا لا استعلام ثانٍ ═══
   كل رقم هنا مشتق من المصفوفة التي بناها الاستعلام الأصلي بعد تطبيق كل الفلاتر
   (المدى الزمني على `Payment.date`، والعميل، واستبعاد الفواتير الملغاة، والاتجاه
   SALES). فالنتيجة:

     • لا استعلام إضافي، ولا N+1، ولا منطق تجميع مكرَّر.
     • استحالة تجاهُل فلتر نشط — لا يوجد مسار بيانات ثانٍ يمكن أن ينحرف.
     • الإجمالي الكلي في كل قسم هو **نفس** إجمالي التقرير المُمرَّر إلينا، فالتطابق
       بنيوي لا مصادفة.

   ═══ ما هو «صفّ» هنا ═══
   الصفّ = **دفعة تحصيل واحدة** (Payment)، وهي وحدة الجدول الرئيسي نفسها. لذلك
   تُجمع كل الأقسام المالية على مستوى الدفعة، ولا يظهر أي مبلغ مرّتين ولا يسقط أي
   مبلغ. الأقسام التي تَعُدّ **فواتير** (التحليل التاريخي، ومؤشرات السداد الكامل/
   الجزئي) تَعُدّ الفواتير المميَّزة داخل نفس المجموعة، وكل فاتورة تنتمي إلى سنة
   إصدار واحدة فقط — فالعدّ لا يتكرّر هو الآخر.

   الوحدة **نقيّة تمامًا** (لا Prisma، لا I/O) — لذلك تُختبر مباشرة.
   ════════════════════════════════════════════════════════════════════════════ */

import {
  TOTAL_LABEL,
  MAX_MATRIX_MONTHS,
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

/** الحقول التي يحتاجها التحليل من صفّ التحصيل — لا شيء غيرها. */
export interface CollectionAnalysisRow {
  /** تاريخ التحصيل — نفس الحقل الذي يفلتره التقرير زمنيًا (`Payment.date`). */
  date: Date;
  amount: number;
  /** اسم العميل كما يعرضه الجدول الرئيسي — هو مفتاح التجميع المعروض. */
  customerLabel: string;
  /** التسمية العربية لطريقة الدفع (نفس خريطة الجدول الرئيسي). */
  methodLabel: string;
  invoiceId: number;
  invoiceNumber: string;
  /** تاريخ **إصدار** الفاتورة — أساس التحليل التاريخي ومدة التحصيل (لا تاريخ الدفع). */
  invoiceIssueDate: Date;
  /** إجمالي الفاتورة ومجموع ما سُدِّد منها — أساس تصنيف السداد الكامل/الجزئي. */
  invoiceTotal: number;
  invoicePaidAmount: number;
}

export interface CollectionsAnalysis {
  kpis: ReportKpi[];
  sections: ReportSection[];
}

/** حدّ «أكبر التحصيلات» — محرّك التقارير بلا ترقيم صفحات، فالحدّ معلَن لا صامت. */
const TOP_COLLECTIONS_LIMIT = 20;

const NAME_COL_WIDTH = 26;
const MONTH_COL_WIDTH = 15;
const TOTAL_COL_WIDTH = 17;
const PERCENT_COL_WIDTH = 24;

const DAY_MS = 86_400_000;

/** فئات مدة التحصيل — الحدّ الأعلى شامل، والفئة الأخيرة مفتوحة. */
const DELAY_BUCKETS: { label: string; max: number }[] = [
  { label: '0 - 30 يوم', max: 30 },
  { label: '31 - 60 يوم', max: 60 },
  { label: '61 - 90 يوم', max: 90 },
  { label: '91 - 180 يوم', max: 180 },
  { label: '181 - 365 يوم', max: 365 },
  { label: 'أكثر من 365 يوم', max: Number.POSITIVE_INFINITY },
];

/**
 * فرق الأيام بين تاريخين على أساس **اليوم التقويمي المحلي**.
 *
 * تصفير الوقت قبل الطرح ضروري: فاتورة صادرة 10:00 ودفعة في اليوم التالي 09:00
 * فرقها 23 ساعة، وقسمتها الخام تعطي «صفر يوم» بينما هي يوم واحد فعليًا. كما يجعل
 * الحساب محصَّنًا ضد التوقيت الصيفي (ساعة زائدة/ناقصة لا تُزحزح النتيجة).
 */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / DAY_MS);
}

/** الوسيط — متوسط القيمتين الوسطيَّتين عند العدد الزوجي، بمنزلة عشرية واحدة. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(raw * 10) / 10;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

interface Agg { total: number; count: number }
interface DelayEntry { days: number; amount: number; row: CollectionAnalysisRow }

/**
 * يبني المؤشرات التنفيذية والأقسام التحليلية من صفوف التحصيل المفلترة.
 *
 * `grandTotal` يُمرَّر من المستدعي وهو **نفس** إجمالي التقرير المعروض، فلا يُعاد
 * احتسابه هنا بتعبير ثانٍ قد ينحرف عنه عند التقريب.
 */
export function buildCollectionsAnalysis(
  rows: CollectionAnalysisRow[],
  grandTotal: number,
): CollectionsAnalysis {
  // مجموعة فارغة ⇒ لا تحليل: التقرير يبقى كما كان قبل الحزمة حرفيًا، ولا قسم
  // يعرض قسمة على صفر أو «أعلى شهر» لا وجود له.
  if (rows.length === 0) return { kpis: [], sections: [] };

  const count = rows.length;
  const average = roundMoney(grandTotal / count);

  // ── تجميعة واحدة تمرّ على الصفوف مرّة واحدة ──────────────────────────────
  const monthAgg = new Map<string, Agg & { max: number }>();
  const customerAgg = new Map<string, Agg>();
  const methodAgg = new Map<string, Agg>();
  const matrix = new Map<string, Map<string, number>>();
  /** سنة إصدار الفاتورة → المبلغ المحصَّل + الفواتير المميَّزة في تلك السنة. */
  const yearAgg = new Map<number, { total: number; invoices: Set<number> }>();
  /** الفواتير المميَّزة المشمولة — تُعرَّف مرّة واحدة فلا تُحتسب قيمتها مرّتين. */
  const invoices = new Map<number, { total: number; paid: number }>();
  const delays: DelayEntry[] = [];

  let largest: CollectionAnalysisRow = rows[0];

  for (const r of rows) {
    const mk = monthKey(r.date);
    const customer = r.customerLabel || '—';
    const method = r.methodLabel || '—';

    const m = monthAgg.get(mk) ?? { total: 0, count: 0, max: 0 };
    m.total += r.amount;
    m.count += 1;
    if (r.amount > m.max) m.max = r.amount;
    monthAgg.set(mk, m);

    const c = customerAgg.get(customer) ?? { total: 0, count: 0 };
    c.total += r.amount;
    c.count += 1;
    customerAgg.set(customer, c);

    const p = methodAgg.get(method) ?? { total: 0, count: 0 };
    p.total += r.amount;
    p.count += 1;
    methodAgg.set(method, p);

    let byMonth = matrix.get(customer);
    if (!byMonth) { byMonth = new Map(); matrix.set(customer, byMonth); }
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + r.amount);

    const year = r.invoiceIssueDate.getFullYear();
    const y = yearAgg.get(year) ?? { total: 0, invoices: new Set<number>() };
    y.total += r.amount;
    y.invoices.add(r.invoiceId);
    yearAgg.set(year, y);

    if (!invoices.has(r.invoiceId)) {
      invoices.set(r.invoiceId, { total: r.invoiceTotal, paid: r.invoicePaidAmount });
    }

    delays.push({ days: daysBetween(r.invoiceIssueDate, r.date), amount: r.amount, row: r });

    if (r.amount > largest.amount) largest = r;
  }

  const { keys: monthKeys, truncated } = buildMonthAxis(rows.map((r) => r.date));
  const withYear = axisSpansYears(monthKeys);

  // العملاء وطرق الدفع مرتَّبة تنازليًا بالمبلغ — الأهمّ أولًا في كل قسم يذكرها.
  const customers = Array.from(customerAgg.entries())
    .map(([label, agg]) => ({ label, total: agg.total, count: agg.count }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'ar'));
  const methods = Array.from(methodAgg.entries())
    .map(([label, agg]) => ({ label, total: agg.total, count: agg.count }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'ar'));

  // مصدر واحد للنسب في كل قسم يذكر العميل/الطريقة — فلا يختلف رقمان لكيان واحد.
  const customerPercents = apportionPercents(customers.map((c) => c.total), grandTotal);
  const methodPercents = apportionPercents(methods.map((m) => m.total), grandTotal);

  const invoiceBase = roundMoney(
    Array.from(invoices.values()).reduce((s, i) => s + i.total, 0),
  );
  let fullyCollected = 0;
  for (const inv of invoices.values()) {
    if (roundMoney(inv.total - inv.paid) <= 0) fullyCollected += 1;
  }
  const partiallyCollected = invoices.size - fullyCollected;

  const delayDays = delays.map((d) => d.days);
  const avgDays = round1(delayDays.reduce((s, d) => s + d, 0) / delayDays.length);

  const kpis = buildKpis({
    grandTotal, count, average, largest,
    customerCount: customers.length,
    fullyCollected, partiallyCollected,
    invoiceBase, avgDays,
  });

  const sections: ReportSection[] = [
    buildMatrixSection(customers, matrix, monthKeys, withYear, grandTotal, truncated),
    buildMonthlySection(monthKeys, monthAgg, withYear, grandTotal, count, average, largest.amount),
    buildMethodSection(methods, methodPercents, grandTotal, count),
    buildMethodDistributionSection(methods, methodPercents, grandTotal, count),
    buildCustomerSection(customers, customerPercents, grandTotal, count),
    buildTopCollectionsSection(rows),
    buildTrendSection(monthKeys, monthAgg, withYear),
    buildHistoricalSection(yearAgg, grandTotal, invoices.size),
    buildDelaySection(delays, grandTotal, count),
    buildEfficiencySection(delays, avgDays),
    buildPercentageSection(customers, customerPercents, grandTotal),
  ];

  return { kpis, sections };
}

// ─── المؤشرات التنفيذية ───────────────────────────────────────────────────────

function buildKpis(args: {
  grandTotal: number;
  count: number;
  average: number;
  largest: CollectionAnalysisRow;
  customerCount: number;
  fullyCollected: number;
  partiallyCollected: number;
  invoiceBase: number;
  avgDays: number;
}): ReportKpi[] {
  const { grandTotal, count, average, largest, customerCount } = args;
  const { fullyCollected, partiallyCollected, invoiceBase, avgDays } = args;

  return [
    { label: 'إجمالي التحصيلات', value: grandTotal, format: 'currency', color: 'blue', icon: 'payments' },
    { label: 'عدد عمليات التحصيل', value: count, icon: 'receipt_long' },
    { label: 'متوسط قيمة التحصيل', value: average, format: 'currency', icon: 'calculate' },
    // البطاقة تحمل اسم العميل تحت المبلغ كي تُقرأ بلا رجوع إلى جدول «أكبر التحصيلات».
    {
      label: 'أكبر عملية تحصيل',
      value: roundMoney(largest.amount),
      format: 'currency',
      hint: largest.customerLabel,
      color: 'green',
      icon: 'trending_up',
    },
    { label: 'عدد العملاء المحصَّل منهم', value: customerCount, color: 'blue', icon: 'groups' },
    { label: 'فواتير محصَّلة بالكامل', value: fullyCollected, color: 'green', icon: 'task_alt' },
    { label: 'فواتير محصَّلة جزئيًا', value: partiallyCollected, color: 'red', icon: 'pending_actions' },
    // نسبة التحصيل = محصَّل الفترة ÷ القيمة الاسمية للفواتير المشمولة بها. الأساس
    // معروض في السطر الثانوي كي تكون النسبة مقروءة بلا تأويل.
    {
      label: 'نسبة التحصيل من قيمة الفواتير المشمولة',
      value: invoiceBase > 0 ? formatPercent((grandTotal / invoiceBase) * 100) : '—',
      hint: invoiceBase,
      hintFormat: 'currency',
      color: 'blue',
      icon: 'percent',
    },
    { label: 'متوسط أيام التحصيل', value: avgDays, color: 'red', icon: 'schedule' },
  ];
}

// ─── مصفوفة العملاء × الأشهر (Pivot) ──────────────────────────────────────────

function buildMatrixSection(
  customers: { label: string; total: number }[],
  matrix: Map<string, Map<string, number>>,
  monthKeys: string[],
  withYear: boolean,
  grandTotal: number,
  truncated: boolean,
): ReportSection {
  const monthColKey = (k: string) => `m_${k}`;

  const columns = [
    { header: 'العميل', key: 'customer', width: NAME_COL_WIDTH },
    ...monthKeys.map((k) => ({
      header: monthLabel(k, withYear),
      key: monthColKey(k),
      width: MONTH_COL_WIDTH,
      numFmt: '#,##0.000',
      format: 'currency' as const,
    })),
    { header: TOTAL_LABEL, key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' as const },
  ];

  const rows = customers.map((c) => {
    const byMonth = matrix.get(c.label);
    const row: Record<string, unknown> = { customer: c.label, total: roundMoney(c.total) };
    for (const k of monthKeys) row[monthColKey(k)] = roundMoney(byMonth?.get(k) ?? 0);
    return row;
  });

  // صفّ «الإجمالي»: كل خليّة مجموع عمودها الخام (لا مجموع خلايا مقرَّبة)، والخليّة
  // الأخيرة هي إجمالي التقرير نفسه — فلا يمكن أن تنفصل عنه.
  const totalsRow: Record<string, unknown> = { customer: TOTAL_LABEL, total: grandTotal };
  for (const k of monthKeys) {
    let sum = 0;
    for (const c of customers) sum += matrix.get(c.label)?.get(k) ?? 0;
    totalsRow[monthColKey(k)] = roundMoney(sum);
  }

  return {
    title: 'مصفوفة التحصيلات: العملاء × الأشهر',
    note: truncated
      ? `يمتد التقرير على أكثر من ${MAX_MATRIX_MONTHS} شهرًا — تُعرض الأشهر ذات التحصيلات فقط.`
      : undefined,
    sheetName: 'مصفوفة العملاء والأشهر',
    columns,
    rows,
    totalsRow,
  };
}

// ─── التحليل الشهري ───────────────────────────────────────────────────────────

function buildMonthlySection(
  monthKeys: string[],
  monthAgg: Map<string, { total: number; count: number; max: number }>,
  withYear: boolean,
  grandTotal: number,
  grandCount: number,
  grandAverage: number,
  grandLargest: number,
): ReportSection {
  return {
    title: 'التحليل الشهري للتحصيل',
    sheetName: 'التحليل الشهري',
    columns: [
      { header: 'الشهر', key: 'month', width: 20 },
      { header: 'عدد التحصيلات', key: 'count', width: 16, align: 'center', type: 'number' },
      { header: 'إجمالي التحصيلات', key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'متوسط التحصيل', key: 'average', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'أكبر تحصيل', key: 'largest', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
    ],
    rows: monthKeys.map((k) => {
      const agg = monthAgg.get(k) ?? { total: 0, count: 0, max: 0 };
      return {
        month: monthLabel(k, withYear),
        count: agg.count,
        total: roundMoney(agg.total),
        average: agg.count > 0 ? roundMoney(agg.total / agg.count) : 0,
        largest: roundMoney(agg.max),
      };
    }),
    totalsRow: {
      month: TOTAL_LABEL,
      count: grandCount,
      total: grandTotal,
      average: grandAverage,
      largest: roundMoney(grandLargest),
    },
  };
}

// ─── التحصيلات حسب طريقة الدفع ────────────────────────────────────────────────

function buildMethodSection(
  methods: { label: string; total: number; count: number }[],
  percents: number[],
  grandTotal: number,
  grandCount: number,
): ReportSection {
  return {
    title: 'التحصيلات حسب طريقة الدفع',
    sheetName: 'طرق الدفع',
    columns: [
      { header: 'طريقة الدفع', key: 'method', width: NAME_COL_WIDTH },
      { header: 'عدد العمليات', key: 'count', width: 16, align: 'center', type: 'number' },
      { header: 'إجمالي المبلغ', key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'متوسط التحصيل', key: 'average', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'النسبة من إجمالي التحصيلات', key: 'percent', width: PERCENT_COL_WIDTH, align: 'center' },
    ],
    rows: methods.map((m, i) => ({
      method: m.label,
      count: m.count,
      total: roundMoney(m.total),
      average: m.count > 0 ? roundMoney(m.total / m.count) : 0,
      percent: formatPercent(percents[i]),
    })),
    totalsRow: {
      method: TOTAL_LABEL,
      count: grandCount,
      total: grandTotal,
      average: grandCount > 0 ? roundMoney(grandTotal / grandCount) : 0,
      percent: formatPercent(percents.reduce((a, b) => a + b, 0)),
    },
  };
}

// ─── توزيع طرق الدفع ──────────────────────────────────────────────────────────

function buildMethodDistributionSection(
  methods: { label: string; total: number; count: number }[],
  percents: number[],
  grandTotal: number,
  grandCount: number,
): ReportSection {
  // نفس التجميعة ونفس النسب المُوزَّعة المستخدمة أعلاه — لا إعادة حساب، فلا احتمال
  // أن يعرض القسمان رقمين مختلفين لطريقة دفع واحدة.
  return {
    title: 'توزيع طرق الدفع',
    note: 'النسب موزَّعة بطريقة أكبر البواقي فتجمع إلى 100.0% بالضبط.',
    sheetName: 'توزيع طرق الدفع',
    columns: [
      { header: 'طريقة الدفع', key: 'method', width: NAME_COL_WIDTH },
      { header: 'الإجمالي', key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'النسبة', key: 'percent', width: 14, align: 'center' },
      { header: 'عدد العمليات', key: 'count', width: 16, align: 'center', type: 'number' },
    ],
    rows: methods.map((m, i) => ({
      method: m.label,
      total: roundMoney(m.total),
      percent: formatPercent(percents[i]),
      count: m.count,
    })),
    totalsRow: {
      method: TOTAL_LABEL,
      total: grandTotal,
      percent: formatPercent(percents.reduce((a, b) => a + b, 0)),
      count: grandCount,
    },
  };
}

// ─── التحصيلات حسب العميل ─────────────────────────────────────────────────────

function buildCustomerSection(
  customers: { label: string; total: number; count: number }[],
  percents: number[],
  grandTotal: number,
  grandCount: number,
): ReportSection {
  return {
    title: 'التحصيلات حسب العميل',
    sheetName: 'التحصيل حسب العميل',
    columns: [
      { header: 'العميل', key: 'customer', width: NAME_COL_WIDTH },
      { header: 'عدد التحصيلات', key: 'count', width: 16, align: 'center', type: 'number' },
      { header: 'المبلغ المحصَّل', key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'متوسط التحصيل', key: 'average', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'النسبة من الإجمالي', key: 'percent', width: PERCENT_COL_WIDTH, align: 'center' },
    ],
    rows: customers.map((c, i) => ({
      customer: c.label,
      count: c.count,
      total: roundMoney(c.total),
      average: c.count > 0 ? roundMoney(c.total / c.count) : 0,
      percent: formatPercent(percents[i]),
    })),
    totalsRow: {
      customer: TOTAL_LABEL,
      count: grandCount,
      total: grandTotal,
      average: grandCount > 0 ? roundMoney(grandTotal / grandCount) : 0,
      percent: formatPercent(percents.reduce((a, b) => a + b, 0)),
    },
  };
}

// ─── أكبر التحصيلات ───────────────────────────────────────────────────────────

function buildTopCollectionsSection(rows: CollectionAnalysisRow[]): ReportSection {
  const sorted = [...rows].sort(
    (a, b) =>
      b.amount - a.amount ||
      b.date.getTime() - a.date.getTime() ||
      a.invoiceNumber.localeCompare(b.invoiceNumber),
  );
  const top = sorted.slice(0, TOP_COLLECTIONS_LIMIT);

  return {
    title: `أكبر التحصيلات (أعلى ${TOP_COLLECTIONS_LIMIT})`,
    // حدّ معلَن صراحةً: هذا القسم عيّنة مرتَّبة، ومجموعه ليس إجمالي التقرير — ولذلك بلا صفّ مجاميع.
    note:
      rows.length > TOP_COLLECTIONS_LIMIT
        ? `يعرض هذا القسم أكبر ${TOP_COLLECTIONS_LIMIT} عملية من أصل ${rows.length} — وهو ترتيب لعيّنة لا إجمالي مالي.`
        : 'قسم ترتيبي — لا يمثّل إجمالي التقرير.',
    sheetName: 'أكبر التحصيلات',
    columns: [
      { header: 'التاريخ', key: 'date', width: 16, align: 'center' },
      { header: 'العميل', key: 'customer', width: NAME_COL_WIDTH },
      { header: 'رقم الفاتورة', key: 'invoiceNumber', width: 24 },
      { header: 'طريقة الدفع', key: 'method', width: 16 },
      { header: 'المبلغ', key: 'amount', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
    ],
    rows: top.map((r) => ({
      date: formatDisplayDate(r.date),
      customer: r.customerLabel,
      invoiceNumber: r.invoiceNumber,
      method: r.methodLabel,
      amount: roundMoney(r.amount),
    })),
  };
}

// ─── مقارنة أشهر التحصيل (تحليلية فقط) ────────────────────────────────────────

function buildTrendSection(
  monthKeys: string[],
  monthAgg: Map<string, { total: number; count: number; max: number }>,
  withYear: boolean,
): ReportSection {
  // الأشهر الفارغة داخل المحور المتّصل ليست «أدنى تحصيل» — المقارنة على أشهر الحركة.
  const active = monthKeys
    .filter((k) => monthAgg.has(k))
    .map((k) => ({ key: k, total: monthAgg.get(k)!.total }));

  const highest = active.reduce((a, b) => (b.total > a.total ? b : a), active[0]);
  const lowest = active.reduce((a, b) => (b.total < a.total ? b : a), active[0]);
  const difference = roundMoney(highest.total - lowest.total);
  const percentDiff = lowest.total > 0 ? formatPercent((difference / lowest.total) * 100) : '—';

  return {
    title: 'مقارنة أشهر التحصيل',
    note: 'قسم تحليلي — لا يدخل في مجاميع التقرير.',
    sheetName: 'مقارنة الأشهر',
    columns: [
      { header: 'البيان', key: 'metric', width: NAME_COL_WIDTH },
      { header: 'الشهر', key: 'month', width: 20, align: 'center' },
      { header: 'المبلغ', key: 'amount', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'النسبة', key: 'percent', width: 14, align: 'center' },
    ],
    rows: [
      { metric: 'أعلى شهر تحصيلًا', month: monthLabel(highest.key, withYear), amount: roundMoney(highest.total), percent: '' },
      { metric: 'أدنى شهر تحصيلًا', month: monthLabel(lowest.key, withYear), amount: roundMoney(lowest.total), percent: '' },
      { metric: 'الفرق بين الأعلى والأدنى', month: '', amount: difference, percent: percentDiff },
    ],
  };
}

// ─── التحليل التاريخي: التحصيل حسب سنة إصدار الفاتورة ─────────────────────────

function buildHistoricalSection(
  yearAgg: Map<number, { total: number; invoices: Set<number> }>,
  grandTotal: number,
  totalInvoices: number,
): ReportSection {
  // ترتيب تصاعدي بالسنة: القارئ يبحث عن «كم من نقد هذه الفترة يخصّ سنوات سابقة»،
  // وهو سؤال زمني لا ترتيبي.
  const years = Array.from(yearAgg.entries())
    .map(([year, agg]) => ({ year, total: agg.total, invoices: agg.invoices.size }))
    .sort((a, b) => a.year - b.year);

  const percents = apportionPercents(years.map((y) => y.total), grandTotal);

  return {
    title: 'التحليل التاريخي: التحصيل حسب سنة الفاتورة',
    // الأساس هنا **تاريخ إصدار الفاتورة** لا تاريخ الدفع — وهو جوهر القسم، فيُصرَّح به.
    note: 'التصنيف بحسب سنة **إصدار الفاتورة** لا تاريخ التحصيل — فيُظهر كم من نقد الفترة يخصّ سنوات مالية سابقة.',
    sheetName: 'التحليل التاريخي',
    columns: [
      { header: 'سنة الفاتورة', key: 'year', width: 16, align: 'center' },
      { header: 'عدد الفواتير المحصَّلة', key: 'invoices', width: 20, align: 'center', type: 'number' },
      { header: 'مبلغ التحصيل', key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'النسبة من إجمالي التحصيلات', key: 'percent', width: PERCENT_COL_WIDTH, align: 'center' },
    ],
    rows: years.map((y, i) => ({
      year: String(y.year),
      invoices: y.invoices,
      total: roundMoney(y.total),
      percent: formatPercent(percents[i]),
    })),
    // كل فاتورة تنتمي إلى سنة إصدار واحدة، فمجموع أعداد السنوات = عدد الفواتير المميَّزة.
    totalsRow: {
      year: TOTAL_LABEL,
      invoices: totalInvoices,
      total: grandTotal,
      percent: formatPercent(percents.reduce((a, b) => a + b, 0)),
    },
  };
}

// ─── تحليل مدة التحصيل ────────────────────────────────────────────────────────

function buildDelaySection(
  delays: DelayEntry[],
  grandTotal: number,
  grandCount: number,
): ReportSection {
  const buckets = DELAY_BUCKETS.map(() => ({ count: 0, total: 0, days: 0 }));
  for (const d of delays) {
    // الدفعة المقدَّمة (مدّة سالبة) تقع في الفئة الأولى: لا صفّ يسقط من التوزيع،
    // فمجموع الفئات يبقى مساويًا لإجمالي التقرير بالضبط.
    const idx = DELAY_BUCKETS.findIndex((b) => d.days <= b.max);
    const bucket = buckets[idx === -1 ? DELAY_BUCKETS.length - 1 : idx];
    bucket.count += 1;
    bucket.total += d.amount;
    bucket.days += d.days;
  }

  const percents = apportionPercents(buckets.map((b) => b.total), grandTotal);

  return {
    title: 'تحليل مدة التحصيل',
    note: 'المدة تُقاس من تاريخ إصدار الفاتورة إلى تاريخ كل دفعة على حدة؛ الدفعات المقدَّمة (قبل الإصدار) تُحتسب ضمن الفئة الأولى.',
    sheetName: 'مدة التحصيل',
    columns: [
      { header: 'مدة التحصيل', key: 'bucket', width: NAME_COL_WIDTH },
      { header: 'عدد الدفعات', key: 'count', width: 16, align: 'center', type: 'number' },
      { header: 'مبلغ التحصيل', key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'النسبة من إجمالي التحصيلات', key: 'percent', width: PERCENT_COL_WIDTH, align: 'center' },
      { header: 'متوسط الأيام', key: 'avgDays', width: 16, align: 'center' },
    ],
    rows: DELAY_BUCKETS.map((b, i) => ({
      bucket: b.label,
      count: buckets[i].count,
      total: roundMoney(buckets[i].total),
      percent: formatPercent(percents[i]),
      // فئة بلا دفعات ⇒ خانة فارغة لا صفر: الصفر يوم رقمٌ له معنى، والفراغ لا يدّعيه.
      avgDays: buckets[i].count > 0 ? round1(buckets[i].days / buckets[i].count) : '',
    })),
    totalsRow: {
      bucket: TOTAL_LABEL,
      count: grandCount,
      total: grandTotal,
      percent: formatPercent(percents.reduce((a, b) => a + b, 0)),
      avgDays: round1(delays.reduce((s, d) => s + d.days, 0) / delays.length),
    },
  };
}

// ─── كفاءة التحصيل ────────────────────────────────────────────────────────────

function buildEfficiencySection(delays: DelayEntry[], avgDays: number): ReportSection {
  const sorted = [...delays].sort((a, b) => a.days - b.days);
  const fastest = sorted[0];
  const slowest = sorted[sorted.length - 1];
  const detail = (d: DelayEntry) => `${d.row.invoiceNumber} — ${d.row.customerLabel}`;

  return {
    title: 'كفاءة التحصيل',
    note: 'قسم تحليلي — لا يدخل في مجاميع التقرير.',
    sheetName: 'كفاءة التحصيل',
    columns: [
      { header: 'المؤشر', key: 'metric', width: NAME_COL_WIDTH },
      { header: 'عدد الأيام', key: 'days', width: 16, align: 'center' },
      { header: 'التفصيل', key: 'detail', width: 40 },
    ],
    rows: [
      { metric: 'متوسط أيام التحصيل', days: avgDays, detail: '' },
      { metric: 'أسرع تحصيل', days: fastest.days, detail: detail(fastest) },
      { metric: 'أبطأ تحصيل', days: slowest.days, detail: detail(slowest) },
      { metric: 'وسيط مدة التحصيل', days: median(delays.map((d) => d.days)), detail: '' },
    ],
  };
}

// ─── تحليل النسب لكل عميل ─────────────────────────────────────────────────────

function buildPercentageSection(
  customers: { label: string; total: number }[],
  percents: number[],
  grandTotal: number,
): ReportSection {
  // نفس النسب المُوزَّعة المستخدمة في «التحصيلات حسب العميل» — مصدر واحد فلا يختلف
  // الرقمان؛ الترتيب هنا أبجدي لأنه جدول مراجعة لا جدول ترتيب.
  const byName = customers
    .map((c, i) => ({ ...c, percent: percents[i] }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ar'));

  return {
    title: 'تحليل النسب لكل عميل',
    sheetName: 'تحليل النسب',
    columns: [
      { header: 'العميل', key: 'customer', width: NAME_COL_WIDTH },
      { header: 'المبلغ المحصَّل', key: 'total', width: TOTAL_COL_WIDTH, numFmt: '#,##0.000', format: 'currency' },
      { header: 'النسبة من إجمالي التحصيلات', key: 'percent', width: PERCENT_COL_WIDTH, align: 'center' },
    ],
    rows: byName.map((c) => ({
      customer: c.label,
      total: roundMoney(c.total),
      percent: formatPercent(c.percent),
    })),
    totalsRow: {
      customer: TOTAL_LABEL,
      total: grandTotal,
      percent: formatPercent(percents.reduce((a, b) => a + b, 0)),
    },
  };
}
