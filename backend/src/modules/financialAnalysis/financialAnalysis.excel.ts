/* ════════════════════════════════════════════════════════════════════════════
   مركز التحليل المالي — تحويل التقرير إلى أوراق Excel.

   **وحدة نقيّة**: تقرير داخل ⇒ مصفوفة `ReportInput` خارج. لا Prisma ولا I/O ولا
   بناء ملف — التوليد نفسه يتولّاه `buildExcelWorkbook` من محرّك التقارير المشترك،
   بنفس ترويسة الشركة وتنسيق RTL وصيغة الدينار وتظليل الصفوف المعتمدة في كل تصدير
   Excel في النظام. لا آلية تصدير جديدة هنا.

   لا تُصدَّر بطاقات KPI ولا أي عنصر واجهة — بيانات الجداول وحدها، قابلة للتحليل.
   ════════════════════════════════════════════════════════════════════════════ */

import type { ReportInput, ReportColumn } from '../../shared/services/reportEngine/excel.service';
import { expenseCategoryAr } from '../../shared/utils/expenseLabels';
import { ARABIC_MONTHS } from '../../core/utils/arabicMonths';
import type { FinancialAnalysisReport, AnalysisStatus, IndicatorRow } from './financialAnalysis.types';

/** صيغة المبالغ بالدينار الكويتي — ثلاث منازل، نفس ما تعتمده كل تقارير النظام. */
const KWD: Pick<ReportColumn, 'numFmt' | 'type' | 'align'> = {
  numFmt: '#,##0.000',
  type: 'currency',
  align: 'right',
};
const NUM: Pick<ReportColumn, 'numFmt' | 'type' | 'align'> = { numFmt: '#,##0', type: 'number', align: 'right' };
const PCT: Pick<ReportColumn, 'numFmt' | 'type' | 'align'> = { numFmt: '#,##0.00', type: 'number', align: 'right' };

const STATUS_AR: Record<AnalysisStatus, string> = {
  excellent: 'ممتاز',
  good: 'جيد',
  acceptable: 'مقبول',
  weak: 'ضعيف',
  critical: 'عالي الخطورة',
  none: '—',
};

/** تسميات درجات الذمم — نفس المقياس بمفردات تحصيل بدل مفردات أداء. */
const RECEIVABLE_STATUS_AR: Record<AnalysisStatus, string> = {
  excellent: 'ممتاز',
  good: 'جيد',
  acceptable: 'يحتاج متابعة',
  weak: 'متأخر',
  critical: 'عالي الخطورة',
  none: '—',
};

const PROFITABILITY_AR: Record<string, string> = {
  revenue: 'الإيرادات',
  expenses: 'المصروفات',
  profit: 'الربح الإجمالي',
};

const INDICATOR_AR: Record<IndicatorRow['key'], string> = {
  expenseRatio: 'نسبة المصروفات إلى الإيرادات (%)',
  daysSalesOutstanding: 'متوسط فترة التحصيل (يوم)',
  returnPerRevenueDinar: 'العائد على كل دينار إيراد (KWD)',
  expenseCoverageByCollections: 'تغطية المصروفات بالتحصيل (%)',
  averageMonthlyProfit: 'متوسط الربح الشهري (KWD)',
};

/** `2026-01` → `يناير 2026` — أوضح من `01/2026` في ملف يُقرأ خارج التطبيق. */
function monthAr(month: string): string {
  const [y, m] = month.split('-');
  const name = ARABIC_MONTHS[Number(m) - 1];
  return name ? `${name} ${y}` : month;
}

/** خليّة رقمية فارغة بدل صفر مضلِّل حين لا أساس للنسبة. */
const orDash = (v: number | null): number | string => (v == null || !Number.isFinite(v) ? '—' : v);

function periodLabel(report: FinancialAnalysisReport): string {
  const { from, to } = report.period;
  return from && to ? `${from} — ${to}` : 'كل الفترات';
}

function periodSubtitle(report: FinancialAnalysisReport): string {
  const { from, to } = report.period;
  if (!from || !to) return 'كل الفترات';
  return `الفترة: ${from} — ${to}`;
}

/** سياق التصدير الذي لا يعرفه التقرير — يأتي من الطلب. */
export interface ExportContext {
  /** اسم المستخدم الذي طلب التصدير. */
  username: string;
  /** لحظة التوليد — تُمرَّر من المستدعي فتبقى هذه الوحدة نقيّة وقابلة للاختبار. */
  generatedAt: Date;
}

/** `YYYY-MM-DD HH:mm` بمكوّنات محلية — أرقام غربية، بلا اعتماد على اللغة. */
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * ورقة «الملخص» — أول ما يفتحه القارئ: هوية التقرير وأرقامه الأربعة الكبرى.
 *
 * القيم النقدية الثلاث تبقى **أرقامًا خامًا** بصيغة الدينار فتقبل الجمع والتحليل.
 * ما عداها بيانات وصفية تُكتب نصًّا (الفترة، التاريخ، المستخدم، النسبة، العدد):
 * عمود واحد لا يحمل صيغتين رقميتين، والوحدة مكتوبة في اسم البند.
 */
function buildSummarySheet(
  report: FinancialAnalysisReport,
  ctx: ExportContext,
  tableCount: number,
): ReportInput {
  const { revenue, expenses, profit, profitMargin } = report.profitability.kpis;

  return {
    title: 'ملخص التحليل المالي',
    sheetName: SHEET_NAMES.summary,
    subtitle: periodSubtitle(report),
    columns: [
      { header: 'البند', key: 'item', width: 34 },
      { header: 'القيمة', key: 'value', width: 30, numFmt: '#,##0.000', align: 'right' },
    ],
    rows: [
      { item: 'الفترة المختارة', value: periodLabel(report) },
      { item: 'تاريخ إنشاء التقرير', value: stamp(ctx.generatedAt) },
      { item: 'المستخدم الذي قام بالتصدير', value: ctx.username },
      { item: 'إجمالي الإيرادات (KWD)', value: revenue },
      { item: 'إجمالي المصروفات (KWD)', value: expenses },
      { item: 'صافي الربح (KWD)', value: profit },
      { item: 'هامش الربح (%)', value: profitMargin == null ? '—' : `${profitMargin.toFixed(2)}%` },
      { item: 'عدد الجداول المصدَّرة', value: String(tableCount) },
    ],
    // ورقة ملخّص لا جدول بيانات — لا فلترة تلقائية على صفّين من المفاتيح.
    autoFilter: false,
  };
}

/**
 * أسماء أوراق العمل — قصيرة ومهنية، **بالعربية** لأنها معيار النظام المعتمد
 * (`الملخص` / `المطابقة` / `التحليل الشهري` … في مستوردات البنك والتحصيلات).
 * ثابت واحد يشاركه البناء والاختبارات فلا ينحرف اسم عن آخر.
 */
export const SHEET_NAMES = {
  summary: 'الملخص',
  profitability: 'الربحية',
  revenue: 'الإيرادات',
  expenses: 'المصروفات',
  collections: 'التحصيل',
  receivables: 'الذمم',
  performance: 'الأداء الشهري',
  topCustomers: 'أعلى العملاء',
  topExpenses: 'أعلى المصروفات',
  topMonths: 'أعلى الأشهر',
  indicators: 'المؤشرات',
} as const;

/**
 * يبني ورقة عمل لكل جدول في الصفحة، بنفس ترتيب ظهورها ونفس أعمدتها،
 * مسبوقةً بورقة «الملخص».
 */
export function buildFinancialAnalysisSheets(
  report: FinancialAnalysisReport,
  ctx: ExportContext,
): ReportInput[] {
  const subtitle = periodSubtitle(report);

  const tables: ReportInput[] = [
    {
      title: 'تحليل الربحية',
      sheetName: SHEET_NAMES.profitability,
      subtitle,
      columns: [
        { header: 'البند', key: 'item', width: 26 },
        { header: 'القيمة', key: 'amount', width: 20, format: 'currency', ...KWD },
        { header: '% من الإيرادات', key: 'percent', width: 18, ...PCT },
        { header: 'مقارنة بالفترة السابقة %', key: 'change', width: 24, ...PCT },
        { header: 'الحالة', key: 'status', width: 14, align: 'center' },
      ],
      rows: report.profitability.rows.map((r) => ({
        item: PROFITABILITY_AR[r.key] ?? r.key,
        amount: r.amount,
        percent: orDash(r.percentOfRevenue),
        change: orDash(r.changePercent),
        status: STATUS_AR[r.status],
      })),
    },

    {
      title: 'تحليل الإيرادات',
      sheetName: SHEET_NAMES.revenue,
      subtitle,
      columns: [
        { header: 'الشهر', key: 'month', width: 18 },
        { header: 'الإيرادات', key: 'revenue', width: 20, format: 'currency', ...KWD },
        { header: 'عدد الفواتير', key: 'count', width: 14, ...NUM },
        { header: 'متوسط الفاتورة', key: 'avg', width: 20, format: 'currency', ...KWD },
      ],
      rows: report.revenue.rows.map((r) => ({
        month: monthAr(r.month),
        revenue: r.revenue,
        count: r.invoiceCount,
        avg: r.averageInvoice,
      })),
      totalsRow: {
        month: 'الإجمالي',
        revenue: report.revenue.kpis.totalRevenue,
        count: report.revenue.kpis.invoiceCount,
        avg: report.revenue.kpis.averageInvoice,
      },
    },

    {
      title: 'تحليل المصروفات',
      sheetName: SHEET_NAMES.expenses,
      subtitle,
      columns: [
        { header: 'تصنيف المصروف', key: 'category', width: 30 },
        { header: 'القيمة', key: 'amount', width: 20, format: 'currency', ...KWD },
        { header: 'النسبة %', key: 'percent', width: 14, ...PCT },
        { header: 'عدد العمليات', key: 'count', width: 14, ...NUM },
      ],
      rows: report.expenses.rows.map((r) => ({
        category: expenseCategoryAr(r.category),
        amount: r.amount,
        percent: r.percent,
        count: r.count,
      })),
      totalsRow: {
        category: 'الإجمالي',
        amount: report.expenses.kpis.totalExpenses,
        count: report.expenses.kpis.expenseCount,
      },
    },

    {
      title: 'تحليل التحصيل',
      sheetName: SHEET_NAMES.collections,
      subtitle,
      columns: [
        { header: 'العميل', key: 'customer', width: 34 },
        { header: 'الفواتير', key: 'invoiced', width: 20, format: 'currency', ...KWD },
        { header: 'المحصّل', key: 'collected', width: 20, format: 'currency', ...KWD },
        { header: 'المتبقي', key: 'outstanding', width: 20, format: 'currency', ...KWD },
        { header: 'نسبة التحصيل %', key: 'rate', width: 18, ...PCT },
      ],
      rows: report.collections.rows.map((r) => ({
        customer: r.customerName,
        invoiced: r.invoiced,
        collected: r.collected,
        outstanding: r.outstanding,
        rate: orDash(r.collectionRate),
      })),
      totalsRow: {
        customer: 'الإجمالي',
        collected: report.collections.kpis.collected,
        outstanding: report.collections.kpis.outstanding,
        rate: orDash(report.collections.kpis.collectionRate),
      },
    },

    {
      title: 'تحليل الذمم المدينة',
      sheetName: SHEET_NAMES.receivables,
      subtitle: report.receivables.asOf
        ? `${subtitle} — الأعمار كما في ${report.receivables.asOf}`
        : subtitle,
      columns: [
        { header: 'العميل', key: 'customer', width: 34 },
        { header: 'إجمالي الفواتير', key: 'invoiced', width: 20, format: 'currency', ...KWD },
        { header: 'المحصّل', key: 'collected', width: 20, format: 'currency', ...KWD },
        { header: 'المتبقي', key: 'outstanding', width: 20, format: 'currency', ...KWD },
        { header: 'نسبة التحصيل %', key: 'rate', width: 16, ...PCT },
        { header: 'آخر دفعة', key: 'lastPayment', width: 16, type: 'date', align: 'center' },
        { header: 'أقدم فاتورة مستحقة', key: 'oldestInvoice', width: 22, align: 'center' },
        { header: 'عمر الدين (يوم)', key: 'age', width: 16, ...NUM },
        { header: 'حالة الذمة', key: 'status', width: 18, align: 'center' },
      ],
      rows: report.receivables.rows.map((r) => ({
        customer: r.customerName,
        invoiced: r.invoiced,
        collected: r.collected,
        outstanding: r.outstanding,
        rate: orDash(r.collectionRate),
        lastPayment: r.lastPaymentDate ?? '—',
        oldestInvoice: r.oldestOpenInvoiceNumber
          ? `${r.oldestOpenInvoiceNumber} (${r.oldestOpenInvoiceDate})`
          : '—',
        age: orDash(r.debtAgeDays),
        status: RECEIVABLE_STATUS_AR[r.status],
      })),
      totalsRow: {
        customer: 'الإجمالي',
        outstanding: report.receivables.kpis.totalOutstanding,
        age: orDash(report.receivables.kpis.averageAgeDays),
      },
    },

    {
      title: 'الأداء الشهري',
      sheetName: SHEET_NAMES.performance,
      subtitle,
      columns: [
        { header: 'الشهر', key: 'month', width: 18 },
        { header: 'الإيرادات', key: 'revenue', width: 20, format: 'currency', ...KWD },
        { header: 'المصروفات', key: 'expenses', width: 20, format: 'currency', ...KWD },
        { header: 'الربح', key: 'profit', width: 20, format: 'currency', ...KWD },
        { header: 'التحصيل', key: 'collections', width: 20, format: 'currency', ...KWD },
        { header: 'هامش الربح %', key: 'margin', width: 16, ...PCT },
      ],
      rows: report.monthlyPerformance.rows.map((r) => ({
        month: monthAr(r.month),
        revenue: r.revenue,
        expenses: r.expenses,
        profit: r.profit,
        collections: r.collections,
        margin: orDash(r.profitMargin),
      })),
      totalsRow: {
        month: 'الإجمالي',
        revenue: report.monthlyPerformance.totals.revenue,
        expenses: report.monthlyPerformance.totals.expenses,
        profit: report.monthlyPerformance.totals.profit,
        collections: report.monthlyPerformance.totals.collections,
        margin: orDash(report.monthlyPerformance.totals.profitMargin),
      },
    },

    {
      title: 'أعلى العملاء إيرادًا',
      sheetName: SHEET_NAMES.topCustomers,
      subtitle,
      columns: [
        { header: 'العميل', key: 'customer', width: 34 },
        { header: 'الإيرادات', key: 'revenue', width: 20, format: 'currency', ...KWD },
      ],
      rows: report.topLists.topCustomers.map((r) => ({ customer: r.customerName, revenue: r.revenue })),
    },

    {
      title: 'أعلى المصروفات',
      sheetName: SHEET_NAMES.topExpenses,
      subtitle,
      columns: [
        { header: 'تصنيف المصروف', key: 'category', width: 30 },
        { header: 'القيمة', key: 'amount', width: 20, format: 'currency', ...KWD },
      ],
      rows: report.topLists.topExpenseCategories.map((r) => ({
        category: expenseCategoryAr(r.category),
        amount: r.amount,
      })),
    },

    {
      title: 'أعلى الأشهر ربحية',
      sheetName: SHEET_NAMES.topMonths,
      subtitle,
      columns: [
        { header: 'الشهر', key: 'month', width: 18 },
        { header: 'الربح', key: 'profit', width: 20, format: 'currency', ...KWD },
      ],
      rows: report.topLists.topProfitMonths.map((r) => ({ month: monthAr(r.month), profit: r.profit })),
    },

    {
      title: 'المؤشرات المالية',
      sheetName: SHEET_NAMES.indicators,
      subtitle,
      columns: [
        { header: 'المؤشر', key: 'indicator', width: 38 },
        { header: 'القيمة', key: 'value', width: 18, ...PCT },
        { header: 'الحالة', key: 'status', width: 14, align: 'center' },
      ],
      rows: report.indicators.rows.map((r) => ({
        indicator: INDICATOR_AR[r.key] ?? r.key,
        value: orDash(r.value),
        status: STATUS_AR[r.status],
      })),
    },
  ];

  // «عدد الجداول المصدَّرة» يُشتقّ من الطول الفعلي لا من رقم مكتوب يدويًا،
  // فإضافة جدول لاحقًا تُحدِّث الملخّص تلقائيًا.
  return [buildSummarySheet(report, ctx, tables.length), ...tables];
}
