import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useFinancialPeriod } from '../context/FinancialPeriodContext';
import { periodToReportParams } from '../lib/financialPeriod';
import { expenseCategoryLabel } from '../config/expenseCategories';
import { composeStyledFromNode, getPageSpec } from '../printing';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { downloadBlob } from '../utils/exportUtils';
import { useToast } from '../stores/toastStore';
import { useT } from '../lib/i18n';
import {
  ExecutiveHeader,
  IdChip,
  ErrorBanner,
  SkeletonRows,
  EmptyState,
  Button,
  Icon,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './FinancialAnalysisCenter.css';

import AnalysisFilterBar from '../components/financialAnalysis/AnalysisFilterBar';
import AnalysisSection, { type SectionKpi } from '../components/financialAnalysis/AnalysisSection';
import AnalysisTable, {
  ChangeCell,
  DateCell,
  MoneyCell,
  PercentCell,
  StatusCell,
  monthDisplay,
  type AnalysisColumn,
} from '../components/financialAnalysis/AnalysisTable';
import DrilldownDrawer from '../components/financialAnalysis/DrilldownDrawer';
import type {
  CollectionCustomerRow,
  DrilldownRequest,
  ExpenseCategoryRow,
  FinancialAnalysisReport,
  IndicatorRow,
  MonthlyPerformanceRow,
  ProfitabilityRow,
  ReceivableCustomerRow,
  RevenueMonthRow,
} from '../components/financialAnalysis/analysisTypes';

/* ════════════════════════════════════════════════════════════════════════════
   مركز التحليل المالي — Financial Analysis Center v1.

   مركز تنفيذي للقراءة فقط: ثمانية أقسام، كل قسم يجيب على سؤال مالي مختلف، جميعها
   محكومة بفلتر واحد أعلى الصفحة ومحمَّلة من طلب واحد (`GET /financial-analysis`).

   لا رسوم بيانية إطلاقًا — جداول احترافية فقط، حسب المواصفة.

   هذه الصفحة **ليست بديلًا** عن تقرير الأرباح والخسائر ولا عن مركز التقارير:
   أرقامها تأتي من المحرّك التشغيلي نفسه (`operational.reporting`) عبر محرّك
   التحليل، فتطابقها بالتعريف دون أن تعيد كتابة أي منطق.
   ════════════════════════════════════════════════════════════════════════════ */

const TOP_ROWS_COLLAPSED = 6;

export default function FinancialAnalysisCenter() {
  const { t } = useT();
  const { period } = useFinancialPeriod();
  const range = useMemo(() => periodToReportParams(period), [period]);

  const [report, setReport] = useState<FinancialAnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * **مفتاح** رسالة الخطأ لا نصّها المترجَم.
   *
   * تخزين النصّ كان يُجبر تأثير التحميل على الاعتماد على `t`، وهي اعتمادية غير
   * مستقرّة كانت تُشعل حلقة جلب لا تنتهي. حفظ المفتاح يُخرج `t` من التأثير
   * تمامًا، ويُصلح عيبًا ثانيًا بالمجّان: رسالة معروضة تُترجَم فورًا عند تبديل
   * اللغة بدل أن تبقى بلغة وقت وقوع الخطأ.
   */
  const [errorKey, setErrorKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [drill, setDrill] = useState<DrilldownRequest | null>(null);

  // جداول قابلة للتوسيع — حالة عرض بحتة، لا تمسّ البيانات ولا الفلتر.
  const [expandExpenses, setExpandExpenses] = useState(false);
  const [expandCustomers, setExpandCustomers] = useState(false);
  const [expandReceivables, setExpandReceivables] = useState(false);
  const [expandMonths, setExpandMonths] = useState(false);

  const [excelBusy, setExcelBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const toast = useToast();
  /** جذر تركيب مستند PDF — الصفحة كاملة، ويُستبعد منها ما وُسم `.no-print`. */
  const printRootRef = useRef<HTMLDivElement>(null);

  // اعتماديات التأثير قيمٌ أوّلية فقط (حدّا المدى + رمز إعادة التحميل اليدوي).
  // لا كائن ولا دالّة — فلا يمكن لإعادة رسم أن تُعيد تشغيل التحميل.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setErrorKey('');
    api
      .get<{ data: FinancialAnalysisReport }>('/financial-analysis', {
        signal: controller.signal,
        params: { from: range.from, to: range.to },
      })
      .then((r) => setReport(r.data.data))
      .catch(() => {
        if (!controller.signal.aborted) setErrorKey('fac.err.load_failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range.from, range.to, reloadToken]);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  const openDrill = useCallback((request: DrilldownRequest) => setDrill(request), []);

  /* ── التصدير ─────────────────────────────────────────────────────────────
     كلا المسارَين يعيدان استخدام آلية النظام القائمة بلا أي اختراع جديد:
       Excel → محرّك `buildExcelWorkbook` المشترك عبر نقطة `/export`، ثم `downloadBlob`.
       PDF   → `composeStyledFromNode` + `window.manar.exportPdfFromHtml` — نفس مسار
               «مركز القرار التنفيذي» حرفيًا (نافذة Chromium خفية تحترم `@media print`).
     ────────────────────────────────────────────────────────────────────────── */

  async function handleExportExcel() {
    setExcelBusy(true);
    try {
      const res = await api.get('/financial-analysis/export', {
        params: { from: range.from, to: range.to },
        responseType: 'blob',
      });
      downloadBlob(
        res.data as Blob,
        generateExportFileName({ reportName: ReportName.FinancialAnalysis, extension: 'xlsx' }),
      );
    } catch {
      toast.error(t('fac.err.excel_failed'));
    } finally {
      setExcelBusy(false);
    }
  }

  async function handleExportPdf() {
    const node = printRootRef.current;
    // `typeof` لا `&&`: الجسر مُعرَّف كحقل مطلوب في نوع الواجهة، فالفحص المنطقي
    // يراه صادقًا دائمًا حتى في بيئة قديمة بلا الدالّة.
    if (typeof window.manar?.exportPdfFromHtml !== 'function' || !node) {
      toast.error(t('fac.err.pdf_unavailable'));
      return;
    }
    setPdfBusy(true);
    try {
      const html = composeStyledFromNode({
        node,
        // أفقي: الصفحة تحمل جداول تصل إلى ستة أعمدة، والعمودي كان يضغطها.
        pageSpec: getPageSpec('a4-landscape'),
        /**
         * إلزامي هنا: `app/theme.css` يعلن `@page { margin: 1cm }` على مستوى
         * المستند، والمُركِّب يفضّل قواعد `@page` الملتقطة على `pageSpec` — فكان
         * الطلب الأفقي يُهمَل بصمت ويخرج الملف عموديًا. هذا العَلَم يجعل مواصفة
         * الصفحة تفوز في نفس عملية الدمج (خاصية `size` وهوامشها).
         */
        forcePageSpec: true,
        title: t('fac.header.title'),
        lang: 'ar',
        // الجذر لا يحوي الفلاتر ولا الأزرار أصلًا؛ هذه طبقة أمان ثانية لا أكثر.
        stripSelectors: ['.no-print'],
      });
      const result = await window.manar.exportPdfFromHtml(
        html,
        generateExportFileName({ reportName: ReportName.FinancialAnalysis, extension: 'pdf' }),
      );
      if (result?.canceled) return;
      if (result?.success && result.path) toast.ok(`${t('fac.pdf.saved_prefix')}${result.path}`);
      else toast.error(result?.error ?? t('fac.err.pdf_failed'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('fac.err.pdf_failed'));
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="xpl-scope xpl-page fac-page">
      {drill && <DrilldownDrawer request={drill} range={range} onClose={() => setDrill(null)} />}

      <ExecutiveHeader
        icon="query_stats"
        title={t('fac.header.title')}
        subtitle={t('fac.header.subtitle')}
        aside={
          <div className="fac-export no-print">
            <Button
              variant="secondary"
              icon="table_view"
              busy={excelBusy}
              disabled={!report}
              onClick={handleExportExcel}
            >
              Excel
            </Button>
            <Button
              variant="secondary"
              icon="picture_as_pdf"
              busy={pdfBusy}
              disabled={!report}
              onClick={handleExportPdf}
            >
              PDF
            </Button>
          </div>
        }
        chips={
          report ? (
            <>
              <IdChip icon="trending_up" tone="green">
                {t('fac.chip.months', { count: report.monthlyPerformance.rows.length })}
              </IdChip>
              <IdChip icon="receipt_long" tone="indigo">
                {t('fac.chip.invoices', { count: report.revenue.kpis.invoiceCount })}
              </IdChip>
              <IdChip icon="payments" tone="orange">
                {t('fac.chip.expenses', { count: report.expenses.kpis.expenseCount })}
              </IdChip>
            </>
          ) : undefined
        }
      />

      <AnalysisFilterBar onRefresh={refresh} busy={loading} />

      {errorKey && <ErrorBanner>{t(errorKey)}</ErrorBanner>}
      {loading && !report && <SkeletonRows rows={8} withAvatar={false} />}

      {/* ── جذر الطباعة ───────────────────────────────────────────────────────
          محتوى التقرير **وحده** يعيش هنا. شريط الفلاتر وأزرار التصدير ودرج
          التفصيل كلها خارج هذا الجذر بنيويًا، فاستبعادها من PDF ليس مرهونًا
          بصنف `no-print` بل بحدود الجذر نفسه — و`no-print` تبقى طبقة ثانية
          للطباعة المباشرة من المتصفح (Ctrl+P). */}
      {report && (
        <div className="fac-report" ref={printRootRef} data-print-report>
          {/* ترويسة المستند — للطباعة وحدها: العنوان على الشاشة يأتي من
              ExecutiveHeader الذي يبقى خارج الجذر مع أزراره. */}
          <header className="fac-report-head">
            <div className="fac-report-title">{t('fac.header.title')}</div>
            <div className="fac-report-meta">
              <span>{t('fac.print.period')}: {report.period.from ?? '—'} — {report.period.to ?? '—'}</span>
              <span>{t('fac.print.generated')}: {new Date().toLocaleDateString('en-GB')}</span>
            </div>
          </header>

          {report.monthAxisTruncated && <p className="fac-note">{t('fac.note.axis_truncated')}</p>}

          <ProfitabilitySectionView report={report} onDrill={openDrill} />

          <RevenueSectionView report={report} onDrill={openDrill} />

          <ExpenseSectionView
            report={report}
            onDrill={openDrill}
            expanded={expandExpenses}
            onToggle={() => setExpandExpenses((v) => !v)}
          />

          <CollectionsSectionView
            report={report}
            onDrill={openDrill}
            expanded={expandCustomers}
            onToggle={() => setExpandCustomers((v) => !v)}
          />

          {/* الذمم تلي التحصيل مباشرةً: كلاهما على محور العميل، والأولى تجيب
              «كم بقي ومنذ متى» بعد أن أجابت الثانية «كم حُصِّل». بعدهما تنتقل
              الصفحة إلى محور الزمن ثم الترتيب ثم النِّسب. */}
          <ReceivablesSectionView
            report={report}
            onDrill={openDrill}
            expanded={expandReceivables}
            onToggle={() => setExpandReceivables((v) => !v)}
          />

          <MonthlyPerformanceSectionView
            report={report}
            onDrill={openDrill}
            expanded={expandMonths}
            onToggle={() => setExpandMonths((v) => !v)}
          />

          <TopListsSectionView report={report} onDrill={openDrill} />

          <IndicatorsSectionView report={report} />
        </div>
      )}

      {/* قسم «تحليل التحصيلات» — بوّابة الصفحة التحليلية المستقلّة.
          خارج جذر الطباعة عمدًا: هو دعوة إلى إجراء لا محتوى تقرير، ولا معنى
          لزرّ تنقّل داخل ملف PDF. */}
      {report && <CollectionAnalysisEntrySection />}

      {!loading && !errorKey && !report && (
        <EmptyState icon="query_stats" title={t('msg.empty')} message={t('fac.err.no_data')} />
      )}
    </div>
  );
}

/* ── مشترَك ─────────────────────────────────────────────────────────────────── */

interface SectionProps {
  report: FinancialAnalysisReport;
  onDrill: (r: DrilldownRequest) => void;
}

interface ExpandableSectionProps extends SectionProps {
  expanded: boolean;
  onToggle: () => void;
}

/** نص التغيّر داخل بطاقة KPI — يعيد `undefined` حين لا أساس للمقارنة. */
function trendOf(change: number | null, invert = false): SectionKpi['trend'] {
  if (change == null || !Number.isFinite(change)) return undefined;
  return { dir: change >= 0 ? 'up' : 'down', text: `${Math.abs(change).toFixed(2)}%`, invert };
}

function percentText(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}%`;
}

/* ── 1. تحليل الربحية ───────────────────────────────────────────────────────── */

const PROFITABILITY_LABEL_KEY: Record<ProfitabilityRow['key'], string> = {
  revenue: 'fac.row.revenue',
  expenses: 'fac.row.expenses',
  profit: 'fac.row.profit',
};

function ProfitabilitySectionView({ report, onDrill }: SectionProps) {
  const { t } = useT();
  const { kpis, rows } = report.profitability;
  const row = (k: ProfitabilityRow['key']) => rows.find((r) => r.key === k);

  const kpiCards: SectionKpi[] = [
    {
      key: 'revenue',
      icon: 'trending_up',
      tone: 'blue',
      label: t('fac.kpi.revenue'),
      money: kpis.revenue,
      trend: trendOf(row('revenue')?.changePercent ?? null),
      onClick: () => onDrill({ kind: 'revenue', title: t('fac.kpi.revenue') }),
    },
    {
      key: 'expenses',
      icon: 'trending_down',
      tone: 'red',
      label: t('fac.kpi.expenses'),
      money: kpis.expenses,
      trend: trendOf(row('expenses')?.changePercent ?? null, true),
      onClick: () => onDrill({ kind: 'expenses', title: t('fac.kpi.expenses') }),
    },
    {
      key: 'profit',
      icon: 'savings',
      tone: kpis.profit >= 0 ? 'green' : 'red',
      label: t('fac.kpi.profit'),
      money: kpis.profit,
      trend: trendOf(row('profit')?.changePercent ?? null),
    },
    {
      key: 'margin',
      icon: 'percent',
      tone: 'indigo',
      label: t('fac.kpi.profit_margin'),
      text: percentText(kpis.profitMargin),
      sub: t('fac.kpi.of_revenue'),
    },
  ];

  const columns: AnalysisColumn<ProfitabilityRow>[] = [
    { key: 'item', label: t('fac.col.item'), render: (r) => t(PROFITABILITY_LABEL_KEY[r.key]) },
    {
      key: 'amount',
      label: t('fac.col.amount'),
      align: 'end',
      render: (r) => (
        <MoneyCell
          value={r.amount}
          onClick={
            r.key === 'profit'
              ? undefined
              : () => onDrill({ kind: r.key === 'revenue' ? 'revenue' : 'expenses', title: t(PROFITABILITY_LABEL_KEY[r.key]) })
          }
        />
      ),
    },
    {
      key: 'percent',
      label: t('fac.col.percent_of_revenue'),
      align: 'end',
      render: (r) => <PercentCell value={r.percentOfRevenue} />,
    },
    {
      key: 'change',
      label: t('fac.col.vs_previous'),
      align: 'end',
      render: (r) => <ChangeCell value={r.changePercent} invert={r.key === 'expenses'} />,
    },
    { key: 'status', label: t('fac.col.status'), align: 'center', render: (r) => <StatusCell status={r.status} /> },
  ];

  return (
    <AnalysisSection index={1} icon="pie_chart" title={t('fac.section.profitability')} kpis={kpiCards}>
      <AnalysisTable columns={columns} rows={rows} rowKey={(r) => r.key} />
      <p className="fac-note">{t('fac.note.previous_period')}</p>
    </AnalysisSection>
  );
}

/* ── 2. تحليل الإيرادات ─────────────────────────────────────────────────────── */

function RevenueSectionView({ report, onDrill }: SectionProps) {
  const { t } = useT();
  const { kpis, rows } = report.revenue;

  const kpiCards: SectionKpi[] = [
    {
      key: 'total',
      icon: 'receipt_long',
      tone: 'blue',
      label: t('fac.kpi.total_revenue'),
      money: kpis.totalRevenue,
      onClick: () => onDrill({ kind: 'revenue', title: t('fac.kpi.total_revenue') }),
    },
    { key: 'count', icon: 'tag', tone: 'indigo', label: t('fac.kpi.invoice_count'), text: String(kpis.invoiceCount) },
    { key: 'avg', icon: 'functions', tone: 'indigo', label: t('fac.kpi.average_invoice'), money: kpis.averageInvoice },
    {
      key: 'top',
      icon: 'military_tech',
      tone: 'green',
      label: t('fac.kpi.top_month'),
      text: kpis.topMonth ? monthDisplay(kpis.topMonth) : '—',
      sub: kpis.topMonth ? t('fac.kpi.top_month_sub') : undefined,
      onClick: kpis.topMonth
        ? () => onDrill({ kind: 'revenue', title: monthDisplay(kpis.topMonth!), month: kpis.topMonth! })
        : undefined,
    },
  ];

  const columns: AnalysisColumn<RevenueMonthRow>[] = [
    { key: 'month', label: t('fac.col.month'), render: (r) => <span className="fac-mono">{monthDisplay(r.month)}</span> },
    {
      key: 'revenue',
      label: t('fac.col.revenue'),
      align: 'end',
      render: (r) => (
        <MoneyCell value={r.revenue} onClick={() => onDrill({ kind: 'revenue', title: monthDisplay(r.month), month: r.month })} />
      ),
    },
    { key: 'count', label: t('fac.col.invoice_count'), align: 'end', render: (r) => <span className="fac-num">{r.invoiceCount}</span> },
    { key: 'avg', label: t('fac.col.average_invoice'), align: 'end', render: (r) => <MoneyCell value={r.averageInvoice} /> },
  ];

  return (
    <AnalysisSection index={2} icon="payments" title={t('fac.section.revenue')} kpis={kpiCards}>
      <AnalysisTable columns={columns} rows={rows} rowKey={(r) => r.month} emptyLabel={t('fac.empty.revenue')} />
    </AnalysisSection>
  );
}

/* ── 3. تحليل المصروفات ─────────────────────────────────────────────────────── */

function ExpenseSectionView({ report, onDrill, expanded, onToggle }: ExpandableSectionProps) {
  const { t } = useT();
  const { kpis, rows } = report.expenses;

  const kpiCards: SectionKpi[] = [
    {
      key: 'total',
      icon: 'account_balance_wallet',
      tone: 'red',
      label: t('fac.kpi.total_expenses'),
      money: kpis.totalExpenses,
      onClick: () => onDrill({ kind: 'expenses', title: t('fac.kpi.total_expenses') }),
    },
    { key: 'count', icon: 'tag', tone: 'indigo', label: t('fac.kpi.expense_count'), text: String(kpis.expenseCount) },
    { key: 'avg', icon: 'functions', tone: 'indigo', label: t('fac.kpi.average_expense'), money: kpis.averageExpense },
    {
      key: 'top',
      icon: 'label_important',
      tone: 'orange',
      label: t('fac.kpi.top_category'),
      text: kpis.topCategory ? expenseCategoryLabel(kpis.topCategory) : '—',
      sub: kpis.topCategory ? t('fac.kpi.top_category_sub') : undefined,
      onClick: kpis.topCategory
        ? () =>
            onDrill({
              kind: 'expenses',
              title: expenseCategoryLabel(kpis.topCategory!),
              category: kpis.topCategory!,
            })
        : undefined,
    },
  ];

  const columns: AnalysisColumn<ExpenseCategoryRow>[] = [
    {
      key: 'category',
      label: t('fac.col.category'),
      truncate: true,
      title: (r) => expenseCategoryLabel(r.category),
      render: (r) => expenseCategoryLabel(r.category),
    },
    {
      key: 'amount',
      label: t('fac.col.amount'),
      align: 'end',
      render: (r) => (
        <MoneyCell
          value={r.amount}
          onClick={() => onDrill({ kind: 'expenses', title: expenseCategoryLabel(r.category), category: r.category })}
        />
      ),
    },
    { key: 'percent', label: t('fac.col.percent'), align: 'end', render: (r) => <PercentCell value={r.percent} decimals={1} /> },
    { key: 'count', label: t('fac.col.operations'), align: 'end', render: (r) => <span className="fac-num">{r.count}</span> },
  ];

  return (
    <AnalysisSection index={3} icon="donut_small" title={t('fac.section.expenses')} kpis={kpiCards}>
      <AnalysisTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.category}
        maxRows={TOP_ROWS_COLLAPSED}
        expanded={expanded}
        onToggleExpand={onToggle}
        expandLabel={t('fac.expand.expenses')}
        emptyLabel={t('fac.empty.expenses')}
      />
    </AnalysisSection>
  );
}

/* ── 4. تحليل التحصيل ───────────────────────────────────────────────────────── */

function CollectionsSectionView({ report, onDrill, expanded, onToggle }: ExpandableSectionProps) {
  const { t } = useT();
  const { kpis, rows } = report.collections;

  const kpiCards: SectionKpi[] = [
    {
      key: 'collected',
      icon: 'task_alt',
      tone: 'green',
      label: t('fac.kpi.collected'),
      money: kpis.collected,
      onClick: () => onDrill({ kind: 'collections', title: t('fac.kpi.collected') }),
    },
    { key: 'outstanding', icon: 'pending_actions', tone: 'orange', label: t('fac.kpi.outstanding'), money: kpis.outstanding },
    { key: 'rate', icon: 'percent', tone: 'indigo', label: t('fac.kpi.collection_rate'), text: percentText(kpis.collectionRate) },
    { key: 'avg', icon: 'functions', tone: 'indigo', label: t('fac.kpi.average_collection'), money: kpis.averageCollection },
  ];

  const columns: AnalysisColumn<CollectionCustomerRow>[] = [
    {
      key: 'customer',
      label: t('fac.col.customer'),
      truncate: true,
      title: (r) => r.customerName,
      render: (r) => r.customerName,
    },
    {
      key: 'invoiced',
      label: t('fac.col.invoiced'),
      align: 'end',
      render: (r) => (
        <MoneyCell
          value={r.invoiced}
          onClick={() => onDrill({ kind: 'revenue', title: r.customerName, customerId: r.customerId ?? undefined })}
        />
      ),
    },
    {
      key: 'collected',
      label: t('fac.col.collected'),
      align: 'end',
      render: (r) => (
        <MoneyCell
          value={r.collected}
          onClick={() => onDrill({ kind: 'collections', title: r.customerName, customerId: r.customerId ?? undefined })}
        />
      ),
    },
    { key: 'outstanding', label: t('fac.col.outstanding'), align: 'end', render: (r) => <MoneyCell value={r.outstanding} /> },
    { key: 'rate', label: t('fac.col.collection_rate'), align: 'end', render: (r) => <PercentCell value={r.collectionRate} /> },
  ];

  return (
    <AnalysisSection index={4} icon="account_balance" title={t('fac.section.collections')} kpis={kpiCards}>
      <AnalysisTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.customerId ?? 'na'}-${i}`}
        maxRows={TOP_ROWS_COLLAPSED}
        expanded={expanded}
        onToggleExpand={onToggle}
        expandLabel={t('fac.expand.customers')}
        emptyLabel={t('fac.empty.collections')}
      />
      <p className="fac-note">{t('fac.note.collections')}</p>
    </AnalysisSection>
  );
}

/* ── 5. تحليل الذمم المدينة ─────────────────────────────────────────────────── */

function ReceivablesSectionView({ report, onDrill, expanded, onToggle }: ExpandableSectionProps) {
  const { t } = useT();
  const { kpis, rows, asOf } = report.receivables;
  const [search, setSearch] = useState('');

  /** تفصيل العميل: فواتيره داخل نفس الفترة — من حيث جاء رصيده. */
  const drillCustomer = (r: ReceivableCustomerRow) =>
    onDrill({ kind: 'revenue', title: r.customerName, customerId: r.customerId ?? undefined });

  const kpiCards: SectionKpi[] = [
    {
      key: 'outstanding',
      icon: 'account_balance_wallet',
      tone: 'orange',
      label: t('fac.kpi.total_receivables'),
      money: kpis.totalOutstanding,
      sub: asOf ? t('fac.rec.as_of', { date: asOf }) : undefined,
    },
    { key: 'debtors', icon: 'groups', tone: 'indigo', label: t('fac.kpi.debtor_count'), text: String(kpis.debtorCount) },
    { key: 'avg', icon: 'functions', tone: 'indigo', label: t('fac.kpi.average_per_debtor'), money: kpis.averagePerDebtor },
    {
      key: 'avgAge',
      icon: 'schedule',
      tone: 'blue',
      label: t('fac.kpi.average_age'),
      text: kpis.averageAgeDays == null ? '—' : t('fac.unit.days', { count: kpis.averageAgeDays }),
      sub: t('fac.rec.weighted'),
    },
    {
      key: 'oldest',
      icon: 'hourglass_bottom',
      tone: 'orange',
      label: t('fac.kpi.oldest_debt'),
      text: kpis.oldestAgeDays == null ? '—' : t('fac.unit.days', { count: kpis.oldestAgeDays }),
    },
    {
      key: 'risk',
      icon: 'priority_high',
      tone: 'red',
      label: t('fac.kpi.high_risk'),
      money: kpis.highRiskOutstanding,
      sub: t('fac.rec.high_risk_sub'),
    },
  ];

  const columns: AnalysisColumn<ReceivableCustomerRow>[] = [
    {
      key: 'customer',
      label: t('fac.col.customer'),
      truncate: true,
      title: (r) => r.customerName,
      sortValue: (r) => r.customerName,
      render: (r) => r.customerName,
    },
    {
      key: 'invoiced',
      label: t('fac.col.invoiced'),
      align: 'end',
      sortValue: (r) => r.invoiced,
      render: (r) => <MoneyCell value={r.invoiced} onClick={() => drillCustomer(r)} />,
    },
    {
      key: 'collected',
      label: t('fac.col.collected'),
      align: 'end',
      sortValue: (r) => r.collected,
      render: (r) => (
        <MoneyCell
          value={r.collected}
          onClick={() => onDrill({ kind: 'collections', title: r.customerName, customerId: r.customerId ?? undefined })}
        />
      ),
    },
    {
      key: 'outstanding',
      label: t('fac.col.outstanding'),
      align: 'end',
      sortValue: (r) => r.outstanding,
      render: (r) => <MoneyCell value={r.outstanding} />,
      total: <MoneyCell value={kpis.totalOutstanding} />,
    },
    {
      key: 'rate',
      label: t('fac.col.collection_rate'),
      align: 'end',
      sortValue: (r) => r.collectionRate,
      render: (r) => <PercentCell value={r.collectionRate} />,
    },
    {
      key: 'lastPayment',
      label: t('fac.col.last_payment'),
      align: 'center',
      sortValue: (r) => r.lastPaymentDate,
      render: (r) => <DateCell value={r.lastPaymentDate} />,
    },
    {
      key: 'oldestInvoice',
      label: t('fac.col.oldest_invoice'),
      align: 'center',
      sortValue: (r) => r.oldestOpenInvoiceDate,
      title: (r) => r.oldestOpenInvoiceNumber ?? '',
      render: (r) => <DateCell value={r.oldestOpenInvoiceDate} />,
    },
    {
      key: 'age',
      label: t('fac.col.debt_age'),
      align: 'end',
      sortValue: (r) => r.debtAgeDays,
      render: (r) =>
        r.debtAgeDays == null ? <span className="fac-muted">—</span> : <span className="fac-num">{r.debtAgeDays}</span>,
      total: (
        <span className="fac-num">
          {kpis.averageAgeDays == null ? '—' : kpis.averageAgeDays}
        </span>
      ),
    },
    {
      key: 'status',
      label: t('fac.col.receivable_status'),
      align: 'center',
      sortValue: (r) => r.debtAgeDays, // الفرز على العمر: ترتيب المخاطرة الحقيقي
      render: (r) => <StatusCell status={r.status} variant="receivable" />,
    },
  ];

  return (
    <AnalysisSection index={5} icon="request_quote" title={t('fac.section.receivables')} kpis={kpiCards}>
      <AnalysisTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.customerId ?? 'na'}-${i}`}
        sortKey="receivables"
        searchable
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('fac.rec.search')}
        onRowClick={drillCustomer}
        maxRows={TOP_ROWS_COLLAPSED}
        expanded={expanded}
        onToggleExpand={onToggle}
        expandLabel={t('fac.expand.debtors')}
        emptyLabel={t('fac.empty.receivables')}
        showTotals
      />
      <p className="fac-note">{t('fac.note.receivables')}</p>
    </AnalysisSection>
  );
}

/* ── 6. الأداء الشهري ───────────────────────────────────────────────────────── */

function MonthlyPerformanceSectionView({ report, onDrill, expanded, onToggle }: ExpandableSectionProps) {
  const { t } = useT();
  const { rows, totals } = report.monthlyPerformance;

  const columns: AnalysisColumn<MonthlyPerformanceRow>[] = [
    {
      key: 'month',
      label: t('fac.col.month'),
      render: (r) => <span className="fac-mono">{monthDisplay(r.month)}</span>,
    },
    {
      key: 'revenue',
      label: t('fac.col.revenue'),
      align: 'end',
      render: (r) => (
        <MoneyCell value={r.revenue} onClick={() => onDrill({ kind: 'revenue', title: monthDisplay(r.month), month: r.month })} />
      ),
      total: <MoneyCell value={totals.revenue} />,
    },
    {
      key: 'expenses',
      label: t('fac.col.expenses'),
      align: 'end',
      render: (r) => (
        <MoneyCell value={r.expenses} onClick={() => onDrill({ kind: 'expenses', title: monthDisplay(r.month), month: r.month })} />
      ),
      total: <MoneyCell value={totals.expenses} />,
    },
    { key: 'profit', label: t('fac.col.profit'), align: 'end', render: (r) => <MoneyCell value={r.profit} />, total: <MoneyCell value={totals.profit} /> },
    {
      key: 'collections',
      label: t('fac.col.collections'),
      align: 'end',
      render: (r) => (
        <MoneyCell
          value={r.collections}
          onClick={() => onDrill({ kind: 'collections', title: monthDisplay(r.month), month: r.month })}
        />
      ),
      total: <MoneyCell value={totals.collections} />,
    },
    {
      key: 'margin',
      label: t('fac.col.profit_margin'),
      align: 'end',
      render: (r) => <PercentCell value={r.profitMargin} />,
      total: <PercentCell value={totals.profitMargin} />,
    },
  ];

  return (
    <AnalysisSection index={6} icon="calendar_month" title={t('fac.section.monthly')}>
      <AnalysisTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.month}
        maxRows={TOP_ROWS_COLLAPSED * 2}
        expanded={expanded}
        onToggleExpand={onToggle}
        expandLabel={t('fac.expand.months')}
        emptyLabel={t('fac.empty.monthly')}
        showTotals
      />
    </AnalysisSection>
  );
}

/* ── 7. أعلى القوائم ────────────────────────────────────────────────────────── */

function TopListsSectionView({ report, onDrill }: SectionProps) {
  const { t } = useT();
  const { topCustomers, topExpenseCategories, topProfitMonths } = report.topLists;

  return (
    <AnalysisSection index={7} icon="emoji_events" title={t('fac.section.top_lists')}>
      <div className="fac-top-grid">
        <div className="fac-top-card">
          <span className="fac-top-card-title">
            <span className="material-symbols-outlined" aria-hidden="true">groups</span>
            {t('fac.top.customers')}
          </span>
          <AnalysisTable
            compact
            columns={[
              {
                key: 'name',
                label: t('fac.col.customer'),
                // العمود الوحيد المفتوح الطول في هذه البطاقة الضيّقة — يبتلع
                // المساحة المتبقية ويُختصر، فيبقى عمود الإيراد كاملًا بلا تمرير أفقي.
                truncate: true,
                title: (r: typeof topCustomers[number]) => r.customerName,
                render: (r: typeof topCustomers[number]) => r.customerName,
              },
              {
                key: 'revenue',
                label: t('fac.col.revenue'),
                align: 'end',
                render: (r: typeof topCustomers[number]) => (
                  <MoneyCell
                    value={r.revenue}
                    onClick={() => onDrill({ kind: 'revenue', title: r.customerName, customerId: r.customerId ?? undefined })}
                  />
                ),
              },
            ]}
            rows={topCustomers}
            rowKey={(r, i) => `${r.customerId ?? 'na'}-${i}`}
            emptyLabel={t('fac.empty.revenue')}
          />
        </div>

        <div className="fac-top-card">
          <span className="fac-top-card-title">
            <span className="material-symbols-outlined" aria-hidden="true">local_atm</span>
            {t('fac.top.expenses')}
          </span>
          <AnalysisTable
            compact
            columns={[
              {
                key: 'category',
                label: t('fac.col.category'),
                truncate: true,
                title: (r: typeof topExpenseCategories[number]) => expenseCategoryLabel(r.category),
                render: (r: typeof topExpenseCategories[number]) => expenseCategoryLabel(r.category),
              },
              {
                key: 'amount',
                label: t('fac.col.amount'),
                align: 'end',
                render: (r: typeof topExpenseCategories[number]) => (
                  <MoneyCell
                    value={r.amount}
                    onClick={() => onDrill({ kind: 'expenses', title: expenseCategoryLabel(r.category), category: r.category })}
                  />
                ),
              },
            ]}
            rows={topExpenseCategories}
            rowKey={(r) => r.category}
            emptyLabel={t('fac.empty.expenses')}
          />
        </div>

        <div className="fac-top-card">
          <span className="fac-top-card-title">
            <span className="material-symbols-outlined" aria-hidden="true">trending_up</span>
            {t('fac.top.months')}
          </span>
          <AnalysisTable
            compact
            columns={[
              {
                key: 'month',
                label: t('fac.col.month'),
                render: (r: typeof topProfitMonths[number]) => <span className="fac-mono">{monthDisplay(r.month)}</span>,
              },
              {
                key: 'profit',
                label: t('fac.col.profit'),
                align: 'end',
                render: (r: typeof topProfitMonths[number]) => <MoneyCell value={r.profit} />,
              },
            ]}
            rows={topProfitMonths}
            rowKey={(r) => r.month}
            emptyLabel={t('fac.empty.monthly')}
          />
        </div>
      </div>
    </AnalysisSection>
  );
}

/* ── 9. تحليل التحصيلات — بوّابة الصفحة المستقلّة ───────────────────────────── */

/**
 * القسم التاسع: مدخل «تحليل التحصيلات».
 *
 * لا يحسب شيئًا ولا يقرأ أي رقم من هذا التقرير — بوّابة بحتة. تحليل التحصيلات
 * صفحة مستقلّة بمحرّكها الخاص (`CollectionAnalysisEngine`)، وهي **مخفيّة عن
 * الشريط الجانبي** عمدًا فلا تُفتح إلا من هنا.
 *
 * `no-print` لأنه دعوة إلى إجراء لا محتوى تقرير — وهو خارج جذر الطباعة أصلًا،
 * والصنف طبقة ثانية للطباعة المباشرة من المتصفح.
 */
function CollectionAnalysisEntrySection() {
  const { t } = useT();
  const navigate = useNavigate();

  return (
    <section className="fac-section fac-gateway no-print" aria-label={t('fac.section.collection_analysis')}>
      <header className="fac-section-head">
        <span className="fac-section-index" aria-hidden="true">9</span>
        <h2 className="fac-section-title">
          <Icon name="account_balance" />
          {t('fac.section.collection_analysis')}
        </h2>
        <div className="fac-section-actions">
          <Button variant="primary" icon="open_in_new" onClick={() => navigate('/collection-analysis')}>
            {t('fac.action.open_collection_analysis')}
          </Button>
        </div>
      </header>
      <div className="fac-section-body">
        <p className="fac-gateway-text">{t('fac.gateway.collection_analysis')}</p>
      </div>
    </section>
  );
}

/* ── 8. المؤشرات المالية ────────────────────────────────────────────────────── */

const INDICATOR_LABEL_KEY: Record<IndicatorRow['key'], string> = {
  expenseRatio: 'fac.ind.expense_ratio',
  daysSalesOutstanding: 'fac.ind.dso',
  returnPerRevenueDinar: 'fac.ind.return_per_dinar',
  expenseCoverageByCollections: 'fac.ind.coverage',
  averageMonthlyProfit: 'fac.ind.avg_monthly_profit',
};

function IndicatorsSectionView({ report }: { report: FinancialAnalysisReport }) {
  const { t } = useT();

  const columns: AnalysisColumn<IndicatorRow>[] = [
    { key: 'name', label: t('fac.col.indicator'), render: (r) => t(INDICATOR_LABEL_KEY[r.key]) },
    {
      key: 'value',
      label: t('fac.col.value'),
      align: 'end',
      render: (r) => {
        if (r.value == null || !Number.isFinite(r.value)) return <span className="fac-muted">—</span>;
        if (r.format === 'money') return <MoneyCell value={r.value} />;
        if (r.format === 'days') return <span className="fac-num">{t('fac.unit.days', { count: r.value })}</span>;
        return <PercentCell value={r.value} />;
      },
    },
    { key: 'status', label: t('fac.col.status'), align: 'center', render: (r) => <StatusCell status={r.status} /> },
  ];

  return (
    <AnalysisSection index={8} icon="insights" title={t('fac.section.indicators')}>
      <AnalysisTable columns={columns} rows={report.indicators.rows} rowKey={(r) => r.key} />
      <p className="fac-note">{t('fac.note.indicators')}</p>
    </AnalysisSection>
  );
}
