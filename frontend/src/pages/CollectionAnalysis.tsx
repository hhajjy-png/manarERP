import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { composeStyledFromNode, getPageSpec } from '../printing';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { downloadBlob } from '../utils/exportUtils';
import { useToast } from '../stores/toastStore';
import { useT } from '../lib/i18n';
import {
  Button,
  EmptyState,
  ErrorBanner,
  ExecutiveHeader,
  IdChip,
  SkeletonRows,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './FinancialAnalysisCenter.css';
import './CollectionAnalysis.css';

import CollectionAnalysisFilters from '../components/collectionAnalysis/CollectionAnalysisFilters';
import CollectionAnalysisKpis from '../components/collectionAnalysis/CollectionAnalysisKpis';
import CollectionSummaryTable from '../components/collectionAnalysis/CollectionSummaryTable';
import CollectionTransferTable from '../components/collectionAnalysis/CollectionTransferTable';
import CollectionMatrixTable from '../components/collectionAnalysis/CollectionMatrixTable';
import OutstandingTable from '../components/collectionAnalysis/OutstandingTable';
import CollectionPerformanceTable from '../components/collectionAnalysis/CollectionPerformanceTable';
import CollectionDrawer from '../components/collectionAnalysis/CollectionDrawer';
import { toDrilldownParams } from '../components/collectionAnalysis/useCollectionDrilldown';
import type {
  CollectionAnalysisReport,
  CollectionDrilldownRequest,
  CollectionFilters,
} from '../components/collectionAnalysis/collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   تحليل التحصيلات — Collection Analysis Page v1.

   صفحة تنفيذية للقراءة فقط تجيب على سؤال واحد:
       **كيف حُصِّلت الفواتير عبر السنوات المالية؟**

   ليست امتدادًا لمركز التحليل المالي ولا نسخة ثانية من جدول المركز المالي:
   محرّكها مستقل (`CollectionAnalysisEngine`) وسؤالها علاقة بين سنتين — سنة
   إصدار الفاتورة وسنة تحصيلها — لا رقم داخل فترة واحدة.

   لا رسوم بيانية إطلاقًا — جداول مالية احترافية فقط، حسب المواصفة.

   الصفحة **مخفيّة عن الشريط الجانبي** عمدًا: تُفتح من داخل «مركز التحليل
   المالي» وحده (قسم «تحليل التحصيلات»)، تمامًا كما تُفتح الشاشات التحليلية
   الداخلية الأخرى في النظام.

   لغتها البصرية مستوردة بالكامل من مركز التحليل المالي: نفس `ExecutiveHeader`،
   نفس شريط الفلاتر، نفس `AnalysisSection`/`AnalysisTable`/`MetricCard`، ونفس
   ورقة أنماط `.fac-*`. ما يضيفه `CollectionAnalysis.css` هو تخطيط المصفوفة
   العريضة وحده — لا لون ولا ظلّ ولا حافّة جديدة.
   ════════════════════════════════════════════════════════════════════════════ */

/** الفلاتر تبدأ فارغة: «كل الفترات» هو المدخل الصحيح لسؤال عابر للسنوات. */
const EMPTY_FILTERS: CollectionFilters = {};

export default function CollectionAnalysis() {
  const { t } = useT();
  const navigate = useNavigate();
  const toast = useToast();

  const [filters, setFilters] = useState<CollectionFilters>(EMPTY_FILTERS);
  const [report, setReport] = useState<CollectionAnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  /** مفتاح رسالة الخطأ لا نصّها المترجَم — يُخرج `t` غير المستقرّة من التأثير. */
  const [errorKey, setErrorKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [drill, setDrill] = useState<CollectionDrilldownRequest | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  /** جذر تركيب مستند PDF — محتوى التقرير وحده، بلا فلاتر ولا أزرار. */
  const printRootRef = useRef<HTMLDivElement>(null);

  const params = useMemo(() => toDrilldownParams(filters, {}), [filters]);
  /**
   * مفتاح نصّي في مصفوفة الاعتماديات لا الكائن نفسه.
   *
   * `filters` كائن يُعاد إنشاؤه عند كل تعديل؛ وضعه مباشرةً في الاعتماديات مع
   * تأثير يضبط حالة يُشعل حلقة جلب لا تنتهي — العيب نفسه الذي وقع في مركز
   * التحليل المالي وعولج هناك بالمبدأ ذاته.
   */
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setErrorKey('');
    api
      .get<{ data: CollectionAnalysisReport }>('/collection-analysis', {
        signal: controller.signal,
        params: JSON.parse(paramsKey) as Record<string, string | number | boolean>,
      })
      .then((r) => setReport(r.data.data))
      .catch(() => {
        if (!controller.signal.aborted) setErrorKey('ca.err.load_failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [paramsKey, reloadToken]);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);
  const openDrill = useCallback((request: CollectionDrilldownRequest) => setDrill(request), []);
  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  /* ── التصدير — نفس آلية مركز التحليل المالي حرفيًا، بلا اختراع جديد ────── */

  async function handleExportExcel() {
    setExcelBusy(true);
    try {
      const res = await api.get('/collection-analysis/export', {
        params: JSON.parse(paramsKey) as Record<string, string | number | boolean>,
        responseType: 'blob',
      });
      downloadBlob(
        res.data as Blob,
        generateExportFileName({ reportName: ReportName.CollectionAnalysis, extension: 'xlsx' }),
      );
    } catch {
      toast.error(t('ca.err.excel_failed'));
    } finally {
      setExcelBusy(false);
    }
  }

  async function handleExportPdf() {
    const node = printRootRef.current;
    // `typeof` لا `&&`: الجسر مُعرَّف كحقل مطلوب في نوع الواجهة، فالفحص المنطقي
    // يراه صادقًا دائمًا حتى في بيئة قديمة بلا الدالّة.
    if (typeof window.manar?.exportPdfFromHtml !== 'function' || !node) {
      toast.error(t('ca.err.pdf_unavailable'));
      return;
    }
    setPdfBusy(true);
    try {
      const html = composeStyledFromNode({
        node,
        // أفقي: المصفوفة تتّسع بعمود لكل سنة تحصيل، والعمودي كان يضغطها.
        pageSpec: getPageSpec('a4-landscape'),
        // إلزامي: `app/theme.css` يعلن `@page { margin: 1cm }` على مستوى المستند،
        // والمُركِّب يفضّل قواعد `@page` الملتقطة على `pageSpec` بلا هذا العَلَم.
        forcePageSpec: true,
        title: t('ca.header.title'),
        lang: 'ar',
        stripSelectors: ['.no-print'],
      });
      const result = await window.manar.exportPdfFromHtml(
        html,
        generateExportFileName({ reportName: ReportName.CollectionAnalysis, extension: 'pdf' }),
      );
      if (result?.canceled) return;
      if (result?.success && result.path) toast.ok(`${t('ca.pdf.saved_prefix')}${result.path}`);
      else toast.error(result?.error ?? t('ca.err.pdf_failed'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('ca.err.pdf_failed'));
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="xpl-scope xpl-page fac-page ca-page">
      {drill && <CollectionDrawer request={drill} filters={filters} onClose={() => setDrill(null)} />}

      <ExecutiveHeader
        icon="account_balance"
        title={t('ca.header.title')}
        subtitle={t('ca.header.subtitle')}
        aside={
          <div className="fac-export no-print">
            <Button variant="ghost" icon="arrow_back" onClick={() => navigate('/financial-analysis')}>
              {t('ca.action.back')}
            </Button>
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
              <IdChip icon="receipt_long" tone="indigo">
                {t('ca.chip.invoices', { count: report.kpis.invoiceCount })}
              </IdChip>
              <IdChip icon="payments" tone="green">
                {t('ca.chip.payments', { count: report.kpis.collectionCount })}
              </IdChip>
              <IdChip icon="calendar_month" tone="orange">
                {t('ca.chip.years', { count: report.matrix.invoiceYears.length })}
              </IdChip>
            </>
          ) : undefined
        }
      />

      <CollectionAnalysisFilters
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
        onRefresh={refresh}
        facets={report?.facets ?? null}
        busy={loading}
      />

      {errorKey && <ErrorBanner>{t(errorKey)}</ErrorBanner>}
      {loading && !report && <SkeletonRows rows={8} withAvatar={false} />}

      {/* ── جذر الطباعة ────────────────────────────────────────────────────
          محتوى التقرير **وحده** يعيش هنا: شريط الفلاتر وأزرار التصدير والدرج
          خارجه بنيويًا، فاستبعادها من PDF مضمون بحدود الجذر لا بصنف `no-print`
          وحده — و`no-print` تبقى طبقة ثانية للطباعة المباشرة من المتصفح. */}
      {report && (
        <div className="fac-report" ref={printRootRef} data-print-report>
          <header className="fac-report-head">
            <div className="fac-report-title">{t('ca.header.title')}</div>
            <div className="fac-report-meta">
              <span>
                {t('ca.print.invoice_range')}: {report.period.invoiceFrom ?? '—'} — {report.period.invoiceTo ?? '—'}
              </span>
              <span>
                {t('ca.print.collection_range')}: {report.period.collectionFrom ?? '—'} —{' '}
                {report.period.collectionTo ?? '—'}
              </span>
              <span>{t('ca.print.generated')}: {new Date().toLocaleDateString('en-GB')}</span>
            </div>
          </header>

          <CollectionAnalysisKpis kpis={report.kpis} onDrill={openDrill} />

          <CollectionSummaryTable
            rows={report.summary.rows}
            totals={report.summary.totals}
            filters={filters}
            onDrill={openDrill}
          />

          <CollectionTransferTable
            rows={report.transfer}
            grandTotal={report.matrix.grandTotal}
            filters={filters}
            onDrill={openDrill}
          />

          <CollectionMatrixTable matrix={report.matrix} filters={filters} onDrill={openDrill} />

          <OutstandingTable
            rows={report.outstanding.rows}
            totals={report.outstanding.totals}
            asOf={report.period.asOf}
            filters={filters}
            onDrill={openDrill}
          />

          <CollectionPerformanceTable performance={report.performance} filters={filters} onDrill={openDrill} />
        </div>
      )}

      {!loading && !errorKey && report && report.kpis.invoiceCount === 0 && (
        <EmptyState icon="search_off" title={t('msg.empty')} message={t('ca.err.no_data')} />
      )}
    </div>
  );
}
