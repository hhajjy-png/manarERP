/* ════════════════════════════════════════════════════════════════════════════
   Financial Analysis Engine — طبقة الحساب **النقيّة**.

   لا Prisma، لا I/O، لا `new Date()` ضمنيّ: تدخل `AnalysisDataset` وتخرج
   `FinancialAnalysisReport`. لذلك تُختبر مباشرةً بلا قاعدة بيانات.

   ثلاث قواعد تحكم هذا الملف، وهي جوهر مواصفة «مركز التحليل المالي»:

   1) **مصدر واحد**: كل قسم يُشتقّ من `AnalysisDataset` وحدها. لا استعلام ثانٍ ولا
      إعادة حساب لمنطق الإيراد أو المصروف — القواعد نفسها مطبَّقة مرّة واحدة في
      طبقة البيانات.

      §1–§4 و§6 تقرأ **حركة الفترة** (`invoices`/`expenses`/`payments`). §5 وحده
      يقرأ `ledger` (كل فاتورة ودفعة حتى نهاية الفترة) لأنه رصيدٌ **كما في تاريخ**
      لا فرقُ حركة: بدونه يسقط كل مدين لا فاتورة له داخل الفترة، وتُطرح دفعاتُ
      الفواتير الأقدم من فواتير الفترة فتُخفي دينًا قائمًا. المصفوفتان تأتيان من
      نفس الاستعلامَين — لا استعلام أُضيف.

   2) **بطاقات KPI تُشتقّ من صفوف جدولها**: `sectionKpis` في كل قسم تُحسب من
      `rows` الخاصة به حرفيًا (لا من الحقائق الخام)، فلا يمكن أن تختلف بطاقة عن
      مجموع العمود تحتها. الاختبارات تؤكّد هذا الثبات.

   3) **لا تكرار لمؤشر**: أي مؤشر ظهر كبطاقة KPI في قسم لا يظهر مجددًا في جدول
      «المؤشرات المالية» (§7) — لذلك يستثني §7 هامش الربح ونسبة التحصيل.
   ════════════════════════════════════════════════════════════════════════════ */

import { roundMoney } from '../../shared/utils/money';
import { toLocalDateString } from '../../core/utils/dateWindows';
import { apportionPercents, buildMonthAxis, monthKey } from '../reports/analysisKit';
import type {
  AnalysisDataset,
  AnalysisStatus,
  CollectionCustomerRow,
  CollectionsSection,
  ExpenseCategoryRow,
  ExpenseSection,
  FinancialAnalysisReport,
  IndicatorRow,
  IndicatorsSection,
  MonthlyPerformanceRow,
  MonthlyPerformanceSection,
  ProfitabilityRow,
  ProfitabilitySection,
  ReceivableCustomerRow,
  ReceivablesSection,
  RevenueMonthRow,
  RevenueSection,
  TopListsSection,
} from './financialAnalysis.types';

/** عدد العناصر في جداول «أعلى القوائم» (§6). */
export const TOP_LIST_SIZE = 5;

/** اسم العميل البديل حين لا ترتبط الفاتورة/الدفعة بعميل مسجَّل. */
export const UNASSIGNED_CUSTOMER = 'غير محدّد';

/* ── أدوات رقمية مشتركة ─────────────────────────────────────────────────── */

/** نسبة مئوية بمنزلتين. `null` عند مقام غير موجب — لا صفر مضلِّل. */
export function percentOf(part: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.round((part / total) * 10000) / 100;
}

/** متوسط نقدي آمن — مقام صفري ⇒ صفر (لا NaN يتسرّب إلى الواجهة). */
function safeAverage(total: number, count: number): number {
  return count > 0 ? roundMoney(total / count) : 0;
}

/**
 * `YYYY-MM-DD` → تاريخ محلي (منتصف الليل)، أو `null` لأي نص غير صالح.
 *
 * أداة مشتركة لا خاصة بقسم: §4 يستعملها لفصل ما قبل الفترة (الرصيد الافتتاحي)
 * عن حركتها، و§5 لتاريخ الاحتساب.
 */
function parseLocalDate(iso: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** التغيّر % بين قيمتين. `null` حين لا أساس للمقارنة (فترة سابقة صفرية). */
export function changePercent(current: number, previous: number): number | null {
  if (!(Math.abs(previous) > 0)) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100;
}

/* ── مقاييس الحالة — عتبات مسمّاة، لا أرقام سحرية ────────────────────────── */

/** عتبات مقياس «الأعلى أفضل» (هامش الربح، التغطية…). */
const HIGHER_IS_BETTER_BANDS = { excellent: 25, good: 15, acceptable: 5 };
/** عتبات «الأقل أفضل» لنسبة المصروفات إلى الإيرادات (%). */
const EXPENSE_RATIO_BANDS = { excellent: 75, good: 85, acceptable: 95 };
/** عتبات «الأقل أفضل» لمتوسط فترة التحصيل (يوم). */
const DSO_BANDS = { excellent: 30, good: 45, acceptable: 60 };
/** عتبات تغطية المصروفات بالتحصيل (%). */
const COVERAGE_BANDS = { excellent: 100, good: 90, acceptable: 75 };

function bandHigher(value: number | null, bands: { excellent: number; good: number; acceptable: number }): AnalysisStatus {
  if (value == null || !Number.isFinite(value)) return 'none';
  if (value >= bands.excellent) return 'excellent';
  if (value >= bands.good) return 'good';
  if (value >= bands.acceptable) return 'acceptable';
  return 'weak';
}

function bandLower(value: number | null, bands: { excellent: number; good: number; acceptable: number }): AnalysisStatus {
  if (value == null || !Number.isFinite(value)) return 'none';
  if (value <= bands.excellent) return 'excellent';
  if (value <= bands.good) return 'good';
  if (value <= bands.acceptable) return 'acceptable';
  return 'weak';
}

/** حالة اتجاه النمو: صعود ⇒ ممتاز، ثبات ⇒ جيد، هبوط ⇒ ضعيف. */
function bandGrowth(change: number | null): AnalysisStatus {
  if (change == null || !Number.isFinite(change)) return 'none';
  if (change > 0) return 'excellent';
  if (change === 0) return 'good';
  return 'weak';
}

/* ── 1. تحليل الربحية ────────────────────────────────────────────────────── */

function buildProfitability(d: AnalysisDataset): ProfitabilitySection {
  const revenue = roundMoney(d.invoices.reduce((s, i) => s + i.total, 0));
  const expenses = roundMoney(d.expenses.reduce((s, e) => s + e.amount, 0));
  const profit = roundMoney(revenue - expenses);

  const expenseRatio = percentOf(expenses, revenue);
  const profitMargin = percentOf(profit, revenue);
  const revenueChange = changePercent(revenue, d.previous.revenue);

  const rows: ProfitabilityRow[] = [
    {
      key: 'revenue',
      amount: revenue,
      percentOfRevenue: revenue > 0 ? 100 : null,
      changePercent: revenueChange,
      status: bandGrowth(revenueChange),
    },
    {
      key: 'expenses',
      amount: expenses,
      percentOfRevenue: expenseRatio,
      changePercent: changePercent(expenses, d.previous.expenses),
      status: bandLower(expenseRatio, EXPENSE_RATIO_BANDS),
    },
    {
      key: 'profit',
      amount: profit,
      percentOfRevenue: profitMargin,
      changePercent: changePercent(profit, d.previous.profit),
      status: bandHigher(profitMargin, HIGHER_IS_BETTER_BANDS),
    },
  ];

  // البطاقات مُشتقّة من الصفوف نفسها — لا إعادة جمع من الحقائق الخام.
  const byKey = (k: ProfitabilityRow['key']) => rows.find((r) => r.key === k)!.amount;
  return {
    kpis: {
      revenue: byKey('revenue'),
      expenses: byKey('expenses'),
      profit: byKey('profit'),
      profitMargin: rows.find((r) => r.key === 'profit')!.percentOfRevenue,
    },
    rows,
  };
}

/* ── محور الأشهر ─────────────────────────────────────────────────────────── */

/**
 * محور الأشهر المشترك بين §2 و§5 و§6 — يُبنى مرّة واحدة بأداة `analysisKit`
 * نفسها التي تستخدمها التقارير التحليلية القائمة (إطار تحليلي واحد لا إطاران).
 */
function buildAxis(d: AnalysisDataset): { keys: string[]; truncated: boolean } {
  const dates = [
    ...d.invoices.map((i) => i.issueDate),
    ...d.expenses.map((e) => e.date),
    ...d.payments.map((p) => p.date),
  ];
  return buildMonthAxis(dates);
}

/* ── 2. تحليل الإيرادات ──────────────────────────────────────────────────── */

function buildRevenue(d: AnalysisDataset, axis: string[]): RevenueSection {
  const totals = new Map<string, { revenue: number; count: number }>();
  for (const key of axis) totals.set(key, { revenue: 0, count: 0 });
  for (const inv of d.invoices) {
    const key = monthKey(inv.issueDate);
    const bucket = totals.get(key) ?? { revenue: 0, count: 0 };
    bucket.revenue += inv.total;
    bucket.count += 1;
    totals.set(key, bucket);
  }

  const rows: RevenueMonthRow[] = Array.from(totals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, b]) => ({
      month,
      revenue: roundMoney(b.revenue),
      invoiceCount: b.count,
      averageInvoice: safeAverage(b.revenue, b.count),
    }));

  const totalRevenue = roundMoney(rows.reduce((s, r) => s + r.revenue, 0));
  const invoiceCount = rows.reduce((s, r) => s + r.invoiceCount, 0);
  const top = rows.reduce<RevenueMonthRow | null>(
    (best, r) => (best == null || r.revenue > best.revenue ? r : best),
    null,
  );

  return {
    kpis: {
      totalRevenue,
      invoiceCount,
      averageInvoice: safeAverage(totalRevenue, invoiceCount),
      topMonth: top && top.revenue > 0 ? top.month : null,
      topMonthRevenue: top && top.revenue > 0 ? top.revenue : 0,
    },
    rows,
  };
}

/* ── 3. تحليل المصروفات ──────────────────────────────────────────────────── */

function buildExpenses(d: AnalysisDataset): ExpenseSection {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const e of d.expenses) {
    const bucket = totals.get(e.category) ?? { amount: 0, count: 0 };
    bucket.amount += e.amount;
    bucket.count += 1;
    totals.set(e.category, bucket);
  }

  const ordered = Array.from(totals.entries()).sort((a, b) => b[1].amount - a[1].amount);
  const totalExpenses = roundMoney(ordered.reduce((s, [, b]) => s + b.amount, 0));
  // توزيع «أكبر البواقي» — مجموع عمود النسبة = 100.0% بالضبط (أداة analysisKit).
  const percents = apportionPercents(ordered.map(([, b]) => b.amount), totalExpenses);

  const rows: ExpenseCategoryRow[] = ordered.map(([category, b], i) => ({
    category,
    amount: roundMoney(b.amount),
    percent: percents[i] ?? 0,
    count: b.count,
  }));

  const expenseCount = rows.reduce((s, r) => s + r.count, 0);
  const top = rows[0] ?? null;

  return {
    kpis: {
      totalExpenses: roundMoney(rows.reduce((s, r) => s + r.amount, 0)),
      expenseCount,
      averageExpense: safeAverage(totalExpenses, expenseCount),
      topCategory: top ? top.category : null,
      topCategoryAmount: top ? top.amount : 0,
    },
    rows,
  };
}

/* ── 4. تحليل التحصيل ────────────────────────────────────────────────────── */

/**
 * تحليل التحصيل — **مؤشّر فاعلية التحصيل (CEI)** لا نسبة حركة إلى حركة.
 *
 * النسبة تُقاس إلى ما كان **قابلًا للتحصيل** فعلًا خلال الفترة:
 *
 *   القابل للتحصيل = رصيد أول المدة + مبيعات الفترة
 *   نسبة التحصيل   = المحصَّل ÷ القابل للتحصيل
 *   رصيد آخر المدة = رصيد أول المدة + مبيعات الفترة − المحصَّل
 *
 * الصيغة السابقة (`المحصَّل ÷ فواتير الفترة`) كانت تخلط نطاقين: البسط يشمل دفعات
 * تخصّ فواتير **سابقة** للفترة، والمقام لا يشملها. فكانت النسبة تتجاوز 100%
 * (900% في حالة فوترةٍ صغيرة داخل الفترة مع سدادِ دينٍ قديم كبير)، وكان «المتبقي»
 * يخرج سالبًا لأنه فرقُ حركتين لا رصيد. لا حدّ أعلى مفروض هنا ولا قصّ للقيمة:
 * المقام هو ما صُحِّح، والنسبة تبقى ناتج قسمةٍ صريح.
 *
 * رصيد أول المدة يُشتقّ من `ledger` (كل حركة قبل `period.from`) — **بلا استعلام
 * إضافي**: المصفوفتان محمَّلتان أصلًا لأجل §5.
 */
/** القابل للتحصيل لصفٍّ — مقام النسبة نفسه، وأساس ترتيب الجدول. */
const collectibleOf = (r: CollectionCustomerRow): number => r.openingAr + r.invoiced;

function buildCollections(d: AnalysisDataset): CollectionsSection {
  /** مفتاح موحّد للعميل — `c:<id>` للمسجَّل، و`unassigned` لغير المرتبط. */
  const keyOf = (id: number | null) => (id == null ? 'unassigned' : `c:${id}`);
  const buckets = new Map<
    string,
    { id: number | null; name: string; openingAr: number; invoiced: number; collected: number }
  >();

  const touch = (id: number | null, name: string | null) => {
    const k = keyOf(id);
    let b = buckets.get(k);
    if (!b) {
      b = { id, name: name ?? UNASSIGNED_CUSTOMER, openingAr: 0, invoiced: 0, collected: 0 };
      buckets.set(k, b);
    } else if (b.name === UNASSIGNED_CUSTOMER && name) {
      b.name = name;
    }
    return b;
  };

  // ① رصيد أول المدة — كل ما وقع **قبل** بداية الفترة. بداية مفتوحة ⇒ لا سابق
  //    بحكم التعريف، فيبقى الرصيد صفرًا وتُختزل الصيغة إلى المحصَّل ÷ المبيعات.
  const periodStart = parseLocalDate(d.period.from);
  if (periodStart) {
    for (const inv of d.ledger.invoices) {
      if (inv.issueDate < periodStart) touch(inv.customerId, inv.customerName).openingAr += inv.total;
    }
    for (const pay of d.ledger.payments) {
      if (pay.date < periodStart) touch(pay.customerId, pay.customerName).openingAr -= pay.amount;
    }
  }

  // ② حركة الفترة وحدها — الإيراد والتحصيل يبقيان مقصورين عليها كما كانا.
  for (const inv of d.invoices) touch(inv.customerId, inv.customerName).invoiced += inv.total;
  for (const pay of d.payments) touch(pay.customerId, pay.customerName).collected += pay.amount;

  const rows: CollectionCustomerRow[] = Array.from(buckets.values())
    .map((b) => {
      const openingAr = roundMoney(b.openingAr);
      const invoiced = roundMoney(b.invoiced);
      const collected = roundMoney(b.collected);
      const collectible = roundMoney(openingAr + invoiced);
      return {
        customerId: b.id,
        customerName: b.name,
        openingAr,
        invoiced,
        collected,
        outstanding: roundMoney(collectible - collected),
        collectionRate: percentOf(collected, collectible),
      };
    })
    // عميلٌ سُوّي حسابه قبل الفترة ولا حركة له فيها لا يضيف شيئًا لأي مجموع —
    // إدراجه يُطيل الجدول بصفوف أصفار. حذفه لا يمسّ أي بطاقة بحكم كونه أصفارًا.
    .filter((r) => r.openingAr !== 0 || r.invoiced !== 0 || r.collected !== 0)
    /* الترتيب على **القابل للتحصيل** لا على فواتير الفترة وحدها.
       كل بطاقات القسم صارت تُقاس إلى هذا الأساس، فترتيبٌ على أساسٍ آخر كان يُنزل
       عميلًا يحمل رصيدًا افتتاحيًا كبيرًا بلا فوترة جديدة إلى ذيل الجدول — أي خارج
       الصفوف الستّة المعروضة قبل «عرض الكل» — رغم أنه الأكبر أثرًا في النسبة. */
    .sort((a, b) => collectibleOf(b) - collectibleOf(a) || b.collected - a.collected);

  const collected = roundMoney(rows.reduce((s, r) => s + r.collected, 0));
  const collectible = roundMoney(rows.reduce((s, r) => s + r.openingAr + r.invoiced, 0));

  return {
    kpis: {
      openingAr: roundMoney(rows.reduce((s, r) => s + r.openingAr, 0)),
      collected,
      outstanding: roundMoney(rows.reduce((s, r) => s + r.outstanding, 0)),
      collectionRate: percentOf(collected, collectible),
      averageCollection: safeAverage(collected, d.payments.length),
    },
    rows,
  };
}

/* ── 5. تحليل الذمم المدينة ──────────────────────────────────────────────── */

/** عتبات عمر الدين بالأيام — الأصغر أفضل. */
const AGE_BANDS = { excellent: 30, good: 60, acceptable: 90, weak: 180 };

/** الدرجات التي تُعدّ مخاطرة تحصيلٍ فعلية. */
const HIGH_RISK: AnalysisStatus[] = ['weak', 'critical'];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** منتصف ليل محلي — يُلغي أثر ساعة اليوم على فروق الأيام. */
function localMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((localMidnight(to) - localMidnight(from)) / MS_PER_DAY));
}

function bandAge(days: number | null): AnalysisStatus {
  if (days == null) return 'excellent'; // لا دين قائم ⇒ لا عمر
  if (days <= AGE_BANDS.excellent) return 'excellent';
  if (days <= AGE_BANDS.good) return 'good';
  if (days <= AGE_BANDS.acceptable) return 'acceptable';
  if (days <= AGE_BANDS.weak) return 'weak';
  return 'critical';
}

/**
 * تاريخ الاحتساب: نهاية الفترة المختارة، أو أحدث حركة في البيانات عند المدى
 * المفتوح. **لا `new Date()` هنا**: الطبقة نقيّة، ونفس المدخل يعطي نفس المخرج.
 */
function resolveAsOf(d: AnalysisDataset): Date | null {
  const explicit = parseLocalDate(d.period.to);
  if (explicit) return explicit;

  let latest: Date | null = null;
  const consider = (date: Date) => {
    if (latest == null || date > latest) latest = date;
  };
  for (const i of d.ledger.invoices) consider(i.issueDate);
  for (const p of d.ledger.payments) consider(p.date);
  for (const e of d.expenses) consider(e.date);
  return latest;
}

/**
 * تحليل الذمم المدينة — **رصيد كما في `asOf`، لا صافي حركة الفترة**.
 *
 * يقرأ `d.ledger` (كل فاتورة ودفعة حتى نهاية الفترة) لا `d.invoices`/`d.payments`
 * (حركة الفترة وحدها). هذا هو الفرق بين رصيد ومجرّد فرق:
 *
 *   • عميل فوتِر قبل الفترة ولم يسدّد **يظهر مدينًا**؛ كان يسقط من الجدول تمامًا
 *     لأن فواتيره خارج الفترة، فيُنقص «إجمالي الذمم» بمقدار دينه كاملًا.
 *   • دفعة داخل الفترة عن فاتورة أقدم **تُطفئ تلك الفاتورة**، لا فواتير الفترة؛
 *     كانت تُطرح من مفوتَر الفترة فتُظهر رصيدًا سالبًا يُستبعد الصفّ بسببه ويختفي
 *     دينٌ قائم فعلًا.
 *
 * وهو نفسه تعريف الذمم المعتمد في `operational.reporting.getAccountsReceivable`
 * (Σ فواتير ≤ التاريخ − Σ دفعات ≤ التاريخ)، فلا يبقى تعريفان للذمم في المشروع.
 *
 * `invoiced`/`collected` في الصفّ تراكميّان حتى `asOf` تبعًا لذلك — وهو ما يبقي
 * `outstanding = invoiced − collected` صحيحًا أمام القارئ داخل الصفّ نفسه، ويجعل
 * نسبة التحصيل تراكمية لا تتجاوز 100% أبدًا.
 *
 * أقدم فاتورة مستحقة تُحدَّد بتوزيع «الأقدم أولًا» (FIFO) على **كامل** سجلّ العميل،
 * فيصبح عمر الدين عمر أقدم فاتورة مفتوحة حقًّا لا أقدم فاتورة داخل الفترة. هذا
 * عرف تحليل الأعمار المعتمد محاسبيًا، وحتميّ لا يعتمد على أي ربط مخزَّن بين
 * الدفعة والفاتورة خارج ما تحمله البيانات.
 *
 * الصفوف مقصورة على **المدينين** (رصيد موجب): جدول ذمم يعرض من لا دين عليه
 * ضجيج، وبقية الأقسام تغطّي الصورة الكاملة للعملاء أصلًا.
 */
function buildReceivables(d: AnalysisDataset): ReceivablesSection {
  const asOf = resolveAsOf(d);
  const asOfIso = asOf ? toLocalDateString(asOf) : null;

  const keyOf = (id: number | null) => (id == null ? 'unassigned' : `c:${id}`);
  interface Bucket {
    id: number | null;
    name: string;
    invoices: { date: Date; total: number; number: string }[];
    collected: number;
    lastPayment: Date | null;
  }
  const buckets = new Map<string, Bucket>();

  const touch = (id: number | null, name: string | null): Bucket => {
    const k = keyOf(id);
    let b = buckets.get(k);
    if (!b) {
      b = { id, name: name ?? UNASSIGNED_CUSTOMER, invoices: [], collected: 0, lastPayment: null };
      buckets.set(k, b);
    } else if (b.name === UNASSIGNED_CUSTOMER && name) {
      b.name = name;
    }
    return b;
  };

  for (const inv of d.ledger.invoices) {
    touch(inv.customerId, inv.customerName).invoices.push({
      date: inv.issueDate,
      total: inv.total,
      number: inv.invoiceNumber,
    });
  }
  for (const pay of d.ledger.payments) {
    const b = touch(pay.customerId, pay.customerName);
    b.collected += pay.amount;
    if (b.lastPayment == null || pay.date > b.lastPayment) b.lastPayment = pay.date;
  }

  const rows: ReceivableCustomerRow[] = [];
  for (const b of buckets.values()) {
    const invoiced = roundMoney(b.invoices.reduce((s, i) => s + i.total, 0));
    const collected = roundMoney(b.collected);
    const outstanding = roundMoney(invoiced - collected);
    if (!(outstanding > 0)) continue; // ليس مدينًا

    // FIFO: أول فاتورة لا تغطّيها الدفعات المتراكمة.
    const ordered = [...b.invoices].sort((x, y) => x.date.getTime() - y.date.getTime());
    let remaining = collected;
    let open: Bucket['invoices'][number] | null = null;
    for (const inv of ordered) {
      if (remaining >= inv.total) {
        remaining -= inv.total;
        continue;
      }
      open = inv;
      break;
    }

    const debtAgeDays = open && asOf ? daysBetween(open.date, asOf) : null;
    rows.push({
      customerId: b.id,
      customerName: b.name,
      invoiced,
      collected,
      outstanding,
      collectionRate: percentOf(collected, invoiced),
      lastPaymentDate: b.lastPayment ? toLocalDateString(b.lastPayment) : null,
      oldestOpenInvoiceDate: open ? toLocalDateString(open.date) : null,
      oldestOpenInvoiceNumber: open ? open.number : null,
      debtAgeDays,
      status: bandAge(debtAgeDays),
    });
  }

  rows.sort((a, b) => b.outstanding - a.outstanding || a.customerName.localeCompare(b.customerName));

  const totalOutstanding = roundMoney(rows.reduce((s, r) => s + r.outstanding, 0));
  const aged = rows.filter((r) => r.debtAgeDays != null);
  const agedWeight = aged.reduce((s, r) => s + r.outstanding, 0);

  return {
    asOf: asOfIso,
    kpis: {
      totalOutstanding,
      debtorCount: rows.length,
      averagePerDebtor: safeAverage(totalOutstanding, rows.length),
      averageAgeDays:
        agedWeight > 0
          ? Math.round(aged.reduce((s, r) => s + r.debtAgeDays! * r.outstanding, 0) / agedWeight)
          : null,
      oldestAgeDays: aged.length > 0 ? Math.max(...aged.map((r) => r.debtAgeDays!)) : null,
      highRiskOutstanding: roundMoney(
        rows.filter((r) => HIGH_RISK.includes(r.status)).reduce((s, r) => s + r.outstanding, 0),
      ),
    },
    rows,
  };
}

/* ── 6. الأداء الشهري ────────────────────────────────────────────────────── */

function buildMonthlyPerformance(d: AnalysisDataset, axis: string[]): MonthlyPerformanceSection {
  const blank = () => ({ revenue: 0, expenses: 0, collections: 0 });
  const buckets = new Map<string, ReturnType<typeof blank>>();
  for (const key of axis) buckets.set(key, blank());

  const bucketFor = (date: Date) => {
    const k = monthKey(date);
    let b = buckets.get(k);
    if (!b) {
      b = blank();
      buckets.set(k, b);
    }
    return b;
  };

  for (const inv of d.invoices) bucketFor(inv.issueDate).revenue += inv.total;
  for (const exp of d.expenses) bucketFor(exp.date).expenses += exp.amount;
  for (const pay of d.payments) bucketFor(pay.date).collections += pay.amount;

  const rows: MonthlyPerformanceRow[] = Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, b]) => {
      const revenue = roundMoney(b.revenue);
      const expenses = roundMoney(b.expenses);
      const profit = roundMoney(revenue - expenses);
      return {
        month,
        revenue,
        expenses,
        profit,
        collections: roundMoney(b.collections),
        profitMargin: percentOf(profit, revenue),
      };
    });

  const sum = (pick: (r: MonthlyPerformanceRow) => number) => roundMoney(rows.reduce((s, r) => s + pick(r), 0));
  const revenue = sum((r) => r.revenue);
  const profit = sum((r) => r.profit);

  return {
    rows,
    totals: {
      revenue,
      expenses: sum((r) => r.expenses),
      profit,
      collections: sum((r) => r.collections),
      profitMargin: percentOf(profit, revenue),
    },
  };
}

/* ── 7. أعلى القوائم ─────────────────────────────────────────────────────── */

function buildTopLists(collections: CollectionsSection, expenses: ExpenseSection, monthly: MonthlyPerformanceSection): TopListsSection {
  return {
    // مُشتقّة من صفوف §4 نفسها (لا تجميع ثانٍ للعملاء) — الترتيب هنا بالإيراد.
    topCustomers: [...collections.rows]
      .sort((a, b) => b.invoiced - a.invoiced)
      .slice(0, TOP_LIST_SIZE)
      .map((r) => ({ customerId: r.customerId, customerName: r.customerName, revenue: r.invoiced })),
    // §3 مرتّبة تنازليًا أصلًا.
    topExpenseCategories: expenses.rows
      .slice(0, TOP_LIST_SIZE)
      .map((r) => ({ category: r.category, amount: r.amount })),
    topProfitMonths: [...monthly.rows]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, TOP_LIST_SIZE)
      .map((r) => ({ month: r.month, profit: r.profit })),
  };
}

/* ── 8. المؤشرات المالية ─────────────────────────────────────────────────── */

/**
 * مؤشرات **لا تتكرّر** في أي بطاقة KPI أعلاه.
 *
 * لذلك يغيب عنها عمدًا «هامش الربح» (بطاقة §1) و«نسبة التحصيل» (بطاقة §4):
 * قاعدة عدم التكرار في المواصفة أعلى من محاكاة الصورة المرجعية.
 */
function buildIndicators(
  profitability: ProfitabilitySection,
  collections: CollectionsSection,
  receivables: ReceivablesSection,
  monthly: MonthlyPerformanceSection,
  periodDays: number | null,
): IndicatorsSection {
  const { revenue, expenses, profit } = profitability.kpis;
  const expenseRatio = percentOf(expenses, revenue);

  /**
   * متوسط فترة التحصيل — `(رصيد الذمم ÷ الإيراد) × أيام الفترة`.
   *
   * البسط هو رصيد §5 (`totalOutstanding`) لا صافي §4 (`outstanding`). الأخير فرقُ
   * حركةٍ **مُوقَّع**: حين تفوق دفعاتُ الفترة عن فواتير أقدم ما فُوتر فيها يصبح
   * سالبًا، فيخرج «متوسط فترة تحصيل» بالسالب — رقم لا معنى له عُرض للمستخدم.
   * ومع وجود رصيد ذمم صحيح في §5 لم يعد هناك سبب لاستعمال رقم ثانٍ مختلف عنه
   * لنفس المفهوم على الصفحة ذاتها.
   */
  const dso =
    periodDays != null && revenue > 0
      ? Math.round((receivables.kpis.totalOutstanding / revenue) * periodDays)
      : null;

  const monthCount = monthly.rows.length;

  const rows: IndicatorRow[] = [
    { key: 'expenseRatio', value: expenseRatio, format: 'percent', status: bandLower(expenseRatio, EXPENSE_RATIO_BANDS) },
    { key: 'daysSalesOutstanding', value: dso, format: 'days', status: bandLower(dso, DSO_BANDS) },
    {
      key: 'returnPerRevenueDinar',
      value: revenue > 0 ? roundMoney(profit / revenue) : null,
      format: 'money',
      status: bandHigher(percentOf(profit, revenue), HIGHER_IS_BETTER_BANDS),
    },
    {
      key: 'expenseCoverageByCollections',
      value: percentOf(collections.kpis.collected, expenses),
      format: 'percent',
      status: bandHigher(percentOf(collections.kpis.collected, expenses), COVERAGE_BANDS),
    },
    {
      key: 'averageMonthlyProfit',
      value: monthCount > 0 ? roundMoney(profit / monthCount) : null,
      format: 'money',
      status: 'none',
    },
  ];

  return { rows };
}

/* ── المُجمِّع ───────────────────────────────────────────────────────────── */

/**
 * يبني التقرير الكامل من مجموعة بيانات واحدة. **نقيّ**: نفس المدخل ⇒ نفس المخرج.
 */
export function computeFinancialAnalysis(dataset: AnalysisDataset): FinancialAnalysisReport {
  const axis = buildAxis(dataset);
  const profitability = buildProfitability(dataset);
  const revenue = buildRevenue(dataset, axis.keys);
  const expenses = buildExpenses(dataset);
  const collections = buildCollections(dataset);
  const receivables = buildReceivables(dataset);
  const monthlyPerformance = buildMonthlyPerformance(dataset, axis.keys);

  return {
    period: dataset.period,
    profitability,
    revenue,
    expenses,
    collections,
    receivables,
    monthlyPerformance,
    topLists: buildTopLists(collections, expenses, monthlyPerformance),
    indicators: buildIndicators(profitability, collections, receivables, monthlyPerformance, dataset.period.days),
    monthAxisTruncated: axis.truncated,
  };
}
