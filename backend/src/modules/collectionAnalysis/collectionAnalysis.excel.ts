/* ════════════════════════════════════════════════════════════════════════════
   تحليل التحصيلات — تحويل التقرير إلى أوراق Excel.

   **وحدة نقيّة**: تقرير داخل ⇒ `ReportInput[]` خارج. لا Prisma ولا I/O ولا بناء
   ملف — التوليد نفسه يتولّاه `buildExcelWorkbook` من محرّك التقارير المشترك،
   بنفس ترويسة الشركة وتنسيق RTL وصيغة الدينار المعتمدة في كل تصدير في النظام.
   لا آلية تصدير جديدة هنا إطلاقًا.
   ════════════════════════════════════════════════════════════════════════════ */

import type { ReportColumn, ReportInput } from '../../shared/services/reportEngine/excel.service';
import type {
  CollectionAnalysisReport,
  PerformanceRow,
  SettlementStatus,
} from './collectionAnalysis.types';

/** صيغة الدينار الكويتي — ثلاث منازل، نفس ما تعتمده كل تقارير النظام. */
const KWD: Pick<ReportColumn, 'numFmt' | 'type' | 'align'> = {
  numFmt: '#,##0.000',
  type: 'currency',
  align: 'right',
};
const NUM: Pick<ReportColumn, 'numFmt' | 'type' | 'align'> = { numFmt: '#,##0', type: 'number', align: 'right' };
const PCT: Pick<ReportColumn, 'numFmt' | 'type' | 'align'> = { numFmt: '#,##0.00', type: 'number', align: 'right' };

export const SETTLEMENT_AR: Record<SettlementStatus, string> = {
  PAID: 'مسدَّدة',
  PARTIAL: 'مسدَّدة جزئيًا',
  UNPAID: 'غير مسدَّدة',
};

/** أسماء أوراق العمل — عربية، قصيرة، وثابت واحد يشاركه البناء والاختبارات. */
export const COLLECTION_SHEET_NAMES = {
  summary: 'الملخص',
  byYear: 'ملخص التحصيل',
  transfer: 'ترحيل التحصيل',
  matrix: 'مصفوفة التحصيل',
  outstanding: 'الأرصدة القائمة',
  customers: 'أداء العملاء',
  contracts: 'أداء العقود',
  projects: 'أداء المشاريع',
} as const;

/** خليّة رقمية فارغة بدل صفر مضلِّل حين لا أساس للنسبة. */
const orDash = (v: number | null): number | string => (v == null || !Number.isFinite(v) ? '—' : v);

export interface CollectionExportContext {
  username: string;
  /** لحظة التوليد — تُمرَّر من طبقة الطلب فتبقى هذه الوحدة نقيّة وقابلة للاختبار. */
  generatedAt: Date;
}

/** `YYYY-MM-DD HH:mm` بمكوّنات محلية — أرقام غربية، بلا اعتماد على اللغة. */
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function rangeLabel(from: string | null, to: string | null): string {
  if (from && to) return `${from} — ${to}`;
  if (from) return `من ${from}`;
  if (to) return `حتى ${to}`;
  return 'كل الفترات';
}

function subtitleOf(report: CollectionAnalysisReport): string {
  const invoice = rangeLabel(report.period.invoiceFrom, report.period.invoiceTo);
  const collection = rangeLabel(report.period.collectionFrom, report.period.collectionTo);
  return `فواتير: ${invoice} · تحصيل: ${collection}`;
}

/** أعمدة جداول الأداء الثلاثة متطابقة — تُبنى مرّة وتُعاد لثلاثتها. */
function performanceSheet(
  title: string,
  sheetName: string,
  subtitle: string,
  headerLabel: string,
  rows: PerformanceRow[],
): ReportInput {
  return {
    title,
    sheetName,
    subtitle,
    columns: [
      { header: headerLabel, key: 'name', width: 34 },
      { header: 'عدد الفواتير', key: 'invoiceCount', width: 14, ...NUM },
      { header: 'قيمة الفواتير', key: 'invoiced', width: 20, format: 'currency', ...KWD },
      { header: 'المحصَّل', key: 'collected', width: 20, format: 'currency', ...KWD },
      { header: 'الرصيد القائم', key: 'outstanding', width: 20, format: 'currency', ...KWD },
      { header: 'نسبة التحصيل %', key: 'rate', width: 16, ...PCT },
      { header: 'متوسط أيام التحصيل', key: 'days', width: 20, ...NUM },
    ],
    rows: rows.map((r) => ({
      name: r.name,
      invoiceCount: r.invoiceCount,
      invoiced: r.invoiced,
      collected: r.collected,
      outstanding: r.outstanding,
      rate: orDash(r.collectionRate),
      days: orDash(r.averageDays),
    })),
    totalsRow: {
      name: 'الإجمالي',
      invoiceCount: rows.reduce((s, r) => s + r.invoiceCount, 0),
      invoiced: rows.reduce((s, r) => s + r.invoiced, 0),
      collected: rows.reduce((s, r) => s + r.collected, 0),
      outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
    },
  };
}

/**
 * ورقة المصفوفة — **أعمدة ديناميكية**: عمود لكل سنة تحصيل ظاهرة في البيانات،
 * بلا أي سنة مكتوبة في الكود ولا حدّ أعلى لعددها.
 */
function matrixSheet(report: CollectionAnalysisReport, subtitle: string): ReportInput {
  const { invoiceYears, collectionYears, cells, rowTotals, columnTotals, rowInvoiceValue, rowOutstanding, grandTotal } =
    report.matrix;

  const columns: ReportColumn[] = [
    { header: 'سنة الفاتورة', key: 'invoiceYear', width: 14, align: 'center' },
    { header: 'قيمة الفواتير', key: 'invoiceValue', width: 20, format: 'currency', ...KWD },
    ...collectionYears.map<ReportColumn>((year) => ({
      header: `تحصيل ${year}`,
      key: `y${year}`,
      width: 18,
      format: 'currency',
      ...KWD,
    })),
    { header: 'إجمالي المحصَّل', key: 'rowTotal', width: 20, format: 'currency', ...KWD },
    { header: 'الرصيد القائم', key: 'rowOutstanding', width: 20, format: 'currency', ...KWD },
  ];

  const rows = invoiceYears.map((year, r) => {
    const row: Record<string, unknown> = {
      invoiceYear: year,
      invoiceValue: rowInvoiceValue[r],
      rowTotal: rowTotals[r],
      rowOutstanding: rowOutstanding[r],
    };
    collectionYears.forEach((collectionYear, c) => {
      row[`y${collectionYear}`] = cells[r][c];
    });
    return row;
  });

  const totalsRow: Record<string, unknown> = {
    invoiceYear: 'الإجمالي',
    invoiceValue: rowInvoiceValue.reduce((s, v) => s + v, 0),
    rowTotal: grandTotal,
    rowOutstanding: rowOutstanding.reduce((s, v) => s + v, 0),
  };
  collectionYears.forEach((collectionYear, c) => {
    totalsRow[`y${collectionYear}`] = columnTotals[c];
  });

  return {
    title: 'مصفوفة انتقال التحصيل',
    sheetName: COLLECTION_SHEET_NAMES.matrix,
    subtitle: `${subtitle} — الصفوف: سنة إصدار الفاتورة · الأعمدة: سنة التحصيل`,
    columns,
    rows,
    totalsRow,
  };
}

function summarySheet(
  report: CollectionAnalysisReport,
  ctx: CollectionExportContext,
  tableCount: number,
): ReportInput {
  const k = report.kpis;
  return {
    title: 'ملخص تحليل التحصيلات',
    sheetName: COLLECTION_SHEET_NAMES.summary,
    subtitle: subtitleOf(report),
    columns: [
      { header: 'البند', key: 'item', width: 38 },
      { header: 'القيمة', key: 'value', width: 30, numFmt: '#,##0.000', align: 'right' },
    ],
    rows: [
      { item: 'نطاق تاريخ الفواتير', value: rangeLabel(report.period.invoiceFrom, report.period.invoiceTo) },
      { item: 'نطاق تاريخ التحصيل', value: rangeLabel(report.period.collectionFrom, report.period.collectionTo) },
      { item: 'تاريخ إنشاء التقرير', value: stamp(ctx.generatedAt) },
      { item: 'المستخدم الذي قام بالتصدير', value: ctx.username },
      { item: 'إجمالي قيمة الفواتير (KWD)', value: k.totalInvoiceValue },
      { item: 'إجمالي المحصَّل (KWD)', value: k.totalCollected },
      { item: 'نسبة التحصيل (%)', value: k.collectionRate == null ? '—' : `${k.collectionRate.toFixed(2)}%` },
      { item: 'المحصَّل داخل سنة الفاتورة (KWD)', value: k.collectedSameYear },
      { item: 'المحصَّل في سنوات أخرى (KWD)', value: k.collectedOtherYears },
      { item: 'الأرصدة القائمة (KWD)', value: k.outstanding },
      { item: 'متوسط فترة التحصيل (يوم)', value: k.averageCollectionDays == null ? '—' : String(k.averageCollectionDays) },
      {
        item: 'أكبر سنة استقبلت تحصيلات مُرحَّلة',
        value: k.largestDeferredYear == null ? '—' : String(k.largestDeferredYear),
      },
      { item: 'عدد الفواتير', value: String(k.invoiceCount) },
      { item: 'عدد الدفعات', value: String(k.collectionCount) },
      { item: 'عدد الجداول المصدَّرة', value: String(tableCount) },
    ],
    autoFilter: false,
  };
}

/** ورقة عمل لكل جدول في الصفحة، بنفس ترتيبه وأعمدته، مسبوقةً بورقة «الملخص». */
export function buildCollectionAnalysisSheets(
  report: CollectionAnalysisReport,
  ctx: CollectionExportContext,
): ReportInput[] {
  const subtitle = subtitleOf(report);

  const tables: ReportInput[] = [
    {
      title: 'ملخص التحصيل حسب سنة الفاتورة',
      sheetName: COLLECTION_SHEET_NAMES.byYear,
      subtitle,
      columns: [
        { header: 'سنة الفاتورة', key: 'year', width: 14, align: 'center' },
        { header: 'قيمة الفواتير', key: 'invoiceValue', width: 20, format: 'currency', ...KWD },
        { header: 'المحصَّل داخل السنة', key: 'sameYear', width: 20, format: 'currency', ...KWD },
        { header: 'المحصَّل في سنوات أخرى', key: 'otherYears', width: 22, format: 'currency', ...KWD },
        { header: 'الرصيد القائم', key: 'outstanding', width: 20, format: 'currency', ...KWD },
        { header: 'نسبة التحصيل %', key: 'rate', width: 16, ...PCT },
        { header: 'متوسط الأيام', key: 'days', width: 14, ...NUM },
        { header: 'المؤجَّل عن سنته', key: 'variance', width: 20, format: 'currency', ...KWD },
        { header: 'عدد الفواتير', key: 'count', width: 14, ...NUM },
      ],
      rows: report.summary.rows.map((r) => ({
        year: r.invoiceYear,
        invoiceValue: r.invoiceValue,
        sameYear: r.collectedSameYear,
        otherYears: r.collectedOtherYears,
        outstanding: r.outstanding,
        rate: orDash(r.collectionRate),
        days: orDash(r.averageDays),
        variance: r.variance,
        count: r.invoiceCount,
      })),
      totalsRow: {
        year: 'الإجمالي',
        invoiceValue: report.summary.totals.invoiceValue,
        sameYear: report.summary.totals.collectedSameYear,
        otherYears: report.summary.totals.collectedOtherYears,
        outstanding: report.summary.totals.outstanding,
        rate: orDash(report.summary.totals.collectionRate),
        days: orDash(report.summary.totals.averageDays),
        variance: report.summary.totals.variance,
        count: report.summary.totals.invoiceCount,
      },
    },

    {
      title: 'ترحيل التحصيل بين السنوات',
      sheetName: COLLECTION_SHEET_NAMES.transfer,
      subtitle,
      columns: [
        { header: 'سنة الفاتورة', key: 'invoiceYear', width: 14, align: 'center' },
        { header: 'سنة التحصيل', key: 'collectionYear', width: 14, align: 'center' },
        { header: 'المبلغ', key: 'amount', width: 20, format: 'currency', ...KWD },
        { header: 'النسبة %', key: 'percent', width: 14, ...PCT },
        { header: 'عدد الفواتير', key: 'invoiceCount', width: 14, ...NUM },
        { header: 'عدد الدفعات', key: 'paymentCount', width: 14, ...NUM },
      ],
      rows: report.transfer.map((r) => ({
        invoiceYear: r.invoiceYear,
        collectionYear: r.collectionYear,
        amount: r.amount,
        percent: orDash(r.percent),
        invoiceCount: r.invoiceCount,
        paymentCount: r.paymentCount,
      })),
      totalsRow: {
        invoiceYear: 'الإجمالي',
        amount: report.matrix.grandTotal,
        paymentCount: report.transfer.reduce((s, r) => s + r.paymentCount, 0),
      },
    },

    matrixSheet(report, subtitle),

    {
      title: 'تحليل الأرصدة القائمة',
      sheetName: COLLECTION_SHEET_NAMES.outstanding,
      subtitle: report.period.asOf ? `${subtitle} — الأعمار كما في ${report.period.asOf}` : subtitle,
      columns: [
        { header: 'سنة الفاتورة', key: 'year', width: 14, align: 'center' },
        { header: 'الرصيد القائم', key: 'outstanding', width: 20, format: 'currency', ...KWD },
        { header: 'النسبة %', key: 'percent', width: 14, ...PCT },
        { header: 'عدد الفواتير', key: 'count', width: 14, ...NUM },
        { header: 'أقدم رصيد', key: 'oldest', width: 24, align: 'center' },
        { header: 'متوسط العمر (يوم)', key: 'age', width: 18, ...NUM },
      ],
      rows: report.outstanding.rows.map((r) => ({
        year: r.invoiceYear,
        outstanding: r.outstanding,
        percent: orDash(r.percent),
        count: r.invoiceCount,
        oldest: r.oldestOutstandingNumber
          ? `${r.oldestOutstandingNumber} (${r.oldestOutstandingDate})`
          : r.oldestOutstandingDate ?? '—',
        age: orDash(r.averageAgeDays),
      })),
      totalsRow: {
        year: 'الإجمالي',
        outstanding: report.outstanding.totals.outstanding,
        count: report.outstanding.totals.invoiceCount,
        age: orDash(report.outstanding.totals.averageAgeDays),
      },
    },

    performanceSheet('أداء التحصيل حسب العميل', COLLECTION_SHEET_NAMES.customers, subtitle, 'العميل', report.performance.customer),
    performanceSheet('أداء التحصيل حسب العقد', COLLECTION_SHEET_NAMES.contracts, subtitle, 'العقد', report.performance.contract),
    performanceSheet('أداء التحصيل حسب المشروع', COLLECTION_SHEET_NAMES.projects, subtitle, 'المشروع', report.performance.project),
  ];

  return [summarySheet(report, ctx, tables.length), ...tables];
}
