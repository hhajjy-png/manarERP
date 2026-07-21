import { useEffect, useState, useCallback, useRef } from 'react';
import { useFinancialPeriod } from '../context/FinancialPeriodContext';
import PeriodControl from '../components/period/PeriodControl';
import DateInput from '../components/DateInput';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { financialApi } from '../api/financial';
import { exportReportAsPdf } from '../utils/pdfExport';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { downloadBlob } from '../utils/exportUtils';
import { formatDate } from '../lib/date';
import { fcCurrency, referenceTypeLabel, accountTypeLabel, fcMoneyCell, fcMoneyHeader } from '../components/financial/financialLabels';
import { useT } from '../lib/i18n';
import type {
  FinancialResponse, StatementRow, ArAgingRow, ApAgingRow,
  GlStatementRow, GlReportResponse,
  TrialBalanceAsOfRow, TrialBalancePeriodRow, JournalBookRow,
} from '../types/financial.types';
import { useAuth } from '../stores/authStore';
import { FinancialTabs }        from '../components/financial/FinancialTabs';
import { FilterBar }            from '../components/financial/FilterBar';
import { SummaryCards }         from '../components/financial/SummaryCards';
import { ExportBar }            from '../components/financial/ExportBar';
import { StatementTable }       from '../components/financial/StatementTable';
import { GroupedTable }         from '../components/financial/GroupedTable';
import { ReturnToReportButton } from '../components/financial/ReturnToReportButton';
import type { FinancialDrillDownState } from '../components/financial/DrillDownLink';
import { DrillDownLink }        from '../components/financial/DrillDownLink';
import { AgingTable }           from '../components/financial/AgingTable';
import { AgingSummaryCards }    from '../components/financial/AgingSummaryCards';
import { AgingChart }           from '../components/financial/AgingChart';
import type { AgingBucketData } from '../components/financial/AgingChart';
import { AccountSelector }      from '../components/financial/AccountSelector';
import { ModeToggle }           from '../components/financial/ModeToggle';
import { ImbalanceAlert }       from '../components/financial/ImbalanceAlert';
import { TrialBalanceTable }    from '../components/financial/TrialBalanceTable';
import { JournalBookTable }     from '../components/financial/JournalBookTable';
import { BalanceDisplay }       from '../components/financial/BalanceDisplay';
import { FinancialReportsTab } from '../components/financial/FinancialReportsTab';
// ExplorerKit tokens/styles — the Financial Center root carries `xpl-scope` so its
// refreshed shell/tables/cards resolve `--xpl-*` tokens (cohesion with the Executive
// Dashboard). Presentation only; the kit CSS is already bundled app-wide.
import { Pagination } from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import { useTableSort } from '../hooks/useTableSort';
import SortableHeader from '../components/SortableHeader';

interface EntityOption { id: number; name: string; code: string; }

const FINANCIAL_TABS = [
  { key: 'statement', labelKey: 'nav.statements',   permission: 'statements.read'   },
  { key: 'aging',     labelKey: 'fc.tab.aging',     permission: 'aging.read'         },
  { key: 'gl',        labelKey: 'fc.tab.gl',        permission: 'gl.read'            },
  { key: 'trial',     labelKey: 'fc.tab.trial',     permission: 'trialbalance.read'  },
  { key: 'journal',   labelKey: 'fc.tab.journal',   permission: 'journal.read'       },
  { key: 'finreport', labelKey: 'fc.tab.finreport', permission: 'finreports.read'   },
];

const AGING_BUCKETS: { key: string; labelKey: string }[] = [
  { key: 'current',  labelKey: 'fc.aging.current' },
  { key: '0_30',     labelKey: 'fc.aging.f_0_30' },
  { key: '31_60',    labelKey: 'fc.aging.f_31_60' },
  { key: '61_90',    labelKey: 'fc.aging.f_61_90' },
  { key: '91_120',   labelKey: 'fc.aging.f_91_120' },
  { key: 'over_120', labelKey: 'fc.aging.over_120' },
];

// الرمز في **عنوان العمود** لا في كل خليّة؛ والخليّة رقم مجرّد («12,455.000»).
// الصفر قيمة، و«—» لغير المنطبق وحده — عبر المُنسّق المشترك.
function fmtKwd(n?: number) {
  return fcMoneyCell(n);
}

export default function FinancialCenter() {
  const { t } = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Restore scroll position when returning from a DrillDown
  useEffect(() => {
    const scrollY = (location.state as { scrollY?: number } | null)?.scrollY;
    if (scrollY) window.scrollTo({ top: scrollY, behavior: 'smooth' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Common URL helpers ─────────────────────────────────────────────────────
  const tab = searchParams.get('tab') ?? 'statement';

  function setParam(key: string, value: string | number) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const str  = String(value);
      if (str) next.set(key, str); else next.delete(key);
      return next;
    }, { replace: true });
  }

  // ── Statement URL params ───────────────────────────────────────────────────
  const entityType = (searchParams.get('entityType') ?? 'customer') as 'customer' | 'supplier';
  const entityId   = searchParams.get('entityId') ? Number(searchParams.get('entityId')) : null;
  const fromDate   = searchParams.get('fromDate') ?? '';
  const toDate     = searchParams.get('toDate')   ?? '';
  const search     = searchParams.get('search')   ?? '';

  // ── Aging URL params ───────────────────────────────────────────────────────
  const agingSubTab   = (searchParams.get('subTab')     ?? 'ar') as 'ar' | 'ap';
  const agingAsOfDate = searchParams.get('asOfDate')    ?? '';
  const agingSearch   = searchParams.get('agingSearch') ?? '';
  const agingHideZero = searchParams.get('hideZero')    === 'true';

  // ── GL URL params ──────────────────────────────────────────────────────────
  const glSubTab    = (searchParams.get('glSubTab') ?? 'statement') as 'statement' | 'report';
  const glAccountId = searchParams.get('accountId') ? Number(searchParams.get('accountId')) : null;
  const glFrom      = searchParams.get('glFrom')    ?? '';
  const glTo        = searchParams.get('glTo')      ?? '';
  const glSearch    = searchParams.get('glSearch')  ?? '';
  const glPage      = searchParams.get('glPage')    ? Number(searchParams.get('glPage')) : 1;

  // ── Trial Balance URL params ───────────────────────────────────────────────
  const trialMode = (searchParams.get('trialMode') ?? 'as-of') as 'as-of' | 'period';
  const trialAsOf = searchParams.get('trialAsOf') ?? '';
  const trialFrom = searchParams.get('trialFrom') ?? '';
  const trialTo   = searchParams.get('trialTo')   ?? '';

  // ── Journal Book URL params ────────────────────────────────────────────────
  const jFrom   = searchParams.get('jFrom')   ?? '';
  const jTo     = searchParams.get('jTo')     ?? '';
  const jStatus = searchParams.get('jStatus') ?? '';
  const jSearch = searchParams.get('jSearch') ?? '';
  const jPage   = searchParams.get('jPage')   ? Number(searchParams.get('jPage')) : 1;

  // ── Financial Reports URL params ───────────────────────────────────────────
  const frFrom  = searchParams.get('frFrom')  ?? '';
  const frTo    = searchParams.get('frTo')    ?? '';

  // ── مزامنة الفترة العالمية مع تبويبات المركز المالي ─────────────────────────
  // تبذر تواريخ التبويبات: من/إلى لتقارير الحركة (كشف/دفتر/أستاذ/تقارير)، و«كما في»
  // لتقارير الأرصدة (أعمار/ميزان).
  //   - عند أول تركيب: تملأ الحقول **الفارغة فقط** من الفترة، فتُطبَّق الفترة على تنقّل
  //     جديد إلى الصفحة، مع الحفاظ على روابط drill-down التي تصل بمعاملات محدّدة.
  //   - عند تغيير الفترة لاحقًا: تُعيد الكتابة على الكل (اختيار صريح للفترة).
  // آمن ضد الاستدعاء المزدوج في StrictMode عبر توقيع الفترة.
  const { period } = useFinancialPeriod();
  const firstRunRef = useRef(true);
  const prevSigRef = useRef('');
  useEffect(() => {
    const sig = `${period.fromDate ?? ''}|${period.toDate ?? ''}|${period.asOfDate ?? ''}`;
    const isFirst = firstRunRef.current;
    if (!isFirst && sig === prevSigRef.current) return; // لم تتغيّر الفترة بعد التركيب
    firstRunRef.current = false;
    prevSigRef.current = sig;
    const f = period.fromDate ?? '';
    const toD = period.toDate ?? '';
    const asOf = period.asOfDate ?? '';
    const overwrite = !isFirst; // على التركيب: لا تدهس القيم الموجودة (drill-down)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const put = (k: string, v: string) => {
        if (!overwrite && next.get(k)) return; // ملء الفارغ فقط عند التركيب
        if (v) next.set(k, v); else if (overwrite) next.delete(k);
      };
      put('fromDate', f); put('toDate', toD);
      put('glFrom', f);   put('glTo', toD);
      put('jFrom', f);    put('jTo', toD);
      put('frFrom', f);   put('frTo', toD);
      put('asOfDate', asOf);
      put('trialAsOf', asOf);
      return next;
    }, { replace: true });
  }, [period.fromDate, period.toDate, period.asOfDate, period.isAllPeriods, setSearchParams]);

  // ── Entity list (Statement tab) ────────────────────────────────────────────
  const [entities, setEntities] = useState<EntityOption[]>([]);
  useEffect(() => {
    const url = entityType === 'customer' ? '/customers' : '/suppliers';
    api.get(url, { params: { pageSize: 500, page: 1 } })
      .then(r => {
        const list: EntityOption[] = (r.data?.data?.data ?? []).map(
          (e: { id: number; name: string; code: string }) => ({ id: e.id, name: e.name, code: e.code })
        );
        setEntities(list);
      })
      .catch(() => {});
  }, [entityType]);

  // ── Statement data ─────────────────────────────────────────────────────────
  const [result,      setResult]      = useState<FinancialResponse<StatementRow> | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [exporting,   setExporting]   = useState(false);
  const [viewMode,    setViewMode]    = useState<'flat' | 'grouped'>('flat');
  const [hideSettled, setHideSettled] = useState(false);

  const loadStatement = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await financialApi.getStatement(entityType, entityId, {
        fromDate: fromDate || undefined,
        toDate:   toDate   || undefined,
        search:   search   || undefined,
      });
      setResult(data);
    } catch {
      setError(t('fc.err.statement'));
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, fromDate, toDate, search]);

  useEffect(() => { setResult(null); }, [entityId, entityType]);

  async function doExport(format: 'excel' | 'pdf') {
    if (!entityId) return;
    setExporting(true);
    try {
      const entity = entities.find(e => e.id === entityId);
      const statementReportName = entityType === 'supplier' ? ReportName.SupplierStatement : ReportName.CustomerStatement;
      if (format === 'pdf') {
        await exportReportAsPdf(
          `/financial/statements/${entityType}/${entityId}/export`,
          { fromDate: fromDate || undefined, toDate: toDate || undefined, search: search || undefined },
          generateExportFileName({ reportName: statementReportName, identifier: entity?.code ?? entity?.name ?? entityId, extension: 'pdf' }),
        );
      } else {
        const blob = await financialApi.exportStatement(entityType, entityId, {
          fromDate: fromDate || undefined,
          toDate:   toDate   || undefined,
          search:   search   || undefined,
          format,
        });
        downloadBlob(blob, generateExportFileName({ reportName: statementReportName, identifier: entity?.code ?? entity?.name ?? entityId, extension: 'xlsx' }));
      }
    } finally {
      setExporting(false);
    }
  }

  // ── Aging data ─────────────────────────────────────────────────────────────
  const [arData,         setArData]         = useState<FinancialResponse<ArAgingRow> | null>(null);
  const [apData,         setApData]         = useState<FinancialResponse<ApAgingRow> | null>(null);
  const [agingLoading,   setAgingLoading]   = useState(false);
  const [agingError,     setAgingError]     = useState<string | null>(null);
  const [agingExporting, setAgingExporting] = useState(false);

  const loadAging = useCallback(async () => {
    setAgingLoading(true);
    setAgingError(null);
    try {
      const filters = {
        asOfDate: agingAsOfDate || undefined,
        search:   agingSearch   || undefined,
        hideZero: agingHideZero,
      };
      if (agingSubTab === 'ar') {
        setArData(await financialApi.getArAging(filters));
      } else {
        setApData(await financialApi.getApAging(filters));
      }
    } catch {
      setAgingError(t('fc.err.aging'));
    } finally {
      setAgingLoading(false);
    }
  }, [agingSubTab, agingAsOfDate, agingSearch, agingHideZero]);

  useEffect(() => { if (tab === 'aging') loadAging(); }, [tab, loadAging]);

  // ── GL Statement data ──────────────────────────────────────────────────────
  const [glStatData,   setGlStatData]   = useState<FinancialResponse<GlStatementRow> | null>(null);
  const [glLoading,    setGlLoading]    = useState(false);
  const [glError,      setGlError]      = useState<string | null>(null);
  const [glExporting,  setGlExporting]  = useState(false);

  useEffect(() => { setGlStatData(null); }, [glAccountId]);

  const loadGlStatement = useCallback(async () => {
    if (!glAccountId) return;
    setGlLoading(true);
    setGlError(null);
    try {
      const data = await financialApi.getGlStatement(glAccountId, {
        fromDate: glFrom   || undefined,
        toDate:   glTo     || undefined,
        search:   glSearch || undefined,
      });
      setGlStatData(data);
    } catch {
      setGlError(t('fc.err.gl_statement'));
    } finally {
      setGlLoading(false);
    }
  }, [glAccountId, glFrom, glTo, glSearch]);

  // ── GL Report data ─────────────────────────────────────────────────────────
  const [glReportData,     setGlReportData]     = useState<GlReportResponse | null>(null);
  const [glReportLoading,  setGlReportLoading]  = useState(false);
  const [glReportError,    setGlReportError]    = useState<string | null>(null);
  const [glReportExporting, setGlReportExporting] = useState(false);

  // فرز خادمي لتقرير دفتر الأستاذ العام (rp:gl-report:sort) — تغيير الفرز
  // استعلام جديد فيعود للصفحة الأولى (الجدول مرقّم خادميًا).
  const glReportSort = useTableSort('gl-report', () => setParam('glPage', 1));

  const loadGlReport = useCallback(async () => {
    setGlReportLoading(true);
    setGlReportError(null);
    try {
      const data = await financialApi.getGlReport({
        fromDate: glFrom || undefined,
        toDate:   glTo   || undefined,
        page:     glPage,
        pageSize: 20,
        ...(glReportSort.sortBy ? { sortBy: glReportSort.sortBy, sortDir: glReportSort.sortDir } : {}),
      });
      setGlReportData(data);
    } catch {
      setGlReportError(t('fc.err.gl_report'));
    } finally {
      setGlReportLoading(false);
    }
  }, [glFrom, glTo, glPage, glReportSort.sortBy, glReportSort.sortDir]);

  // تفاعلات الشبكة (ترقيم/فرز) تعيد التحميل تلقائيًا بعد أول تحميل يدوي —
  // بدونها نقرة الترويسة أو الصفحة التالية تبقى بلا استجابة حتى ضغط «تحميل».
  // فلاتر التاريخ تبقى على نمط التطبيق اليدوي الصريح كما كانت.
  useEffect(() => {
    if (glReportData) loadGlReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glPage, glReportSort.sortBy, glReportSort.sortDir]);

  // ── Trial Balance data ─────────────────────────────────────────────────────
  const [trialData,     setTrialData]     = useState<FinancialResponse<TrialBalanceAsOfRow | TrialBalancePeriodRow> | null>(null);
  const [trialLoading,  setTrialLoading]  = useState(false);
  const [trialError,    setTrialError]    = useState<string | null>(null);
  const [trialExporting, setTrialExporting] = useState(false);

  const loadTrialBalance = useCallback(async () => {
    setTrialLoading(true);
    setTrialError(null);
    try {
      const data = await financialApi.getTrialBalance({
        mode:     trialMode,
        asOfDate: trialMode === 'as-of'  ? (trialAsOf || undefined) : undefined,
        fromDate: trialMode === 'period' ? (trialFrom  || undefined) : undefined,
        toDate:   trialMode === 'period' ? (trialTo    || undefined) : undefined,
      });
      setTrialData(data);
    } catch {
      setTrialError(t('fc.err.trial_balance'));
    } finally {
      setTrialLoading(false);
    }
  }, [trialMode, trialAsOf, trialFrom, trialTo]);

  useEffect(() => { if (tab === 'trial') loadTrialBalance(); }, [tab, loadTrialBalance]);

  // ── Journal Book data ──────────────────────────────────────────────────────
  const [journalData,     setJournalData]     = useState<FinancialResponse<JournalBookRow> | null>(null);
  const [journalLoading,  setJournalLoading]  = useState(false);
  const [journalError,    setJournalError]    = useState<string | null>(null);
  const [journalExporting, setJournalExporting] = useState(false);

  const loadJournalBook = useCallback(async () => {
    setJournalLoading(true);
    setJournalError(null);
    try {
      const data = await financialApi.getJournalBook({
        fromDate: jFrom   || undefined,
        toDate:   jTo     || undefined,
        status:   jStatus || undefined,
        search:   jSearch || undefined,
        page:     jPage,
        pageSize: 20,
      });
      setJournalData(data);
    } catch {
      setJournalError(t('fc.err.journal'));
    } finally {
      setJournalLoading(false);
    }
  }, [jFrom, jTo, jStatus, jSearch, jPage]);

  useEffect(() => { if (tab === 'journal') loadJournalBook(); }, [tab, loadJournalBook]);

  // ── RBAC ───────────────────────────────────────────────────────────────────
  const visibleTabs = FINANCIAL_TABS
    .filter(td => hasPermission(td.permission))
    .map(td => ({ ...td, label: t(td.labelKey) }));
  if (visibleTabs.length === 0) {
    return (
      <div className="financial-center xpl-scope">
        <p className="fc-no-permission">{t('fc.msg.no_permission')}</p>
      </div>
    );
  }

  const activeTab = visibleTabs.find(vt => vt.key === tab) ? tab : visibleTabs[0].key;

  // ── DrillDown states ────────────────────────────────────────────────────────
  const statementDrillDown: FinancialDrillDownState = {
    returnTo: '/financial', reportLabel: t('nav.statements'),
    tab: 'statement', entityType, entityId: entityId ?? undefined,
    fromDate: fromDate || undefined, toDate: toDate || undefined,
  };

  const agingDrillDown: FinancialDrillDownState = {
    returnTo: '/financial', reportLabel: t('fc.tab.aging'),
    tab: 'aging', subTab: agingSubTab,
    fromDate: agingAsOfDate || undefined,
  };

  const glStatDrillDown: FinancialDrillDownState = {
    returnTo: '/financial', reportLabel: t('fc.gl.statement_tab'),
    tab: 'gl', subTab: 'statement',
    accountId: glAccountId ?? undefined,
    fromDate: glFrom || undefined, toDate: glTo || undefined,
  };

  const journalDrillDown: FinancialDrillDownState = {
    returnTo: '/financial', reportLabel: t('fc.tab.journal'),
    tab: 'journal', page: jPage,
    fromDate: jFrom || undefined, toDate: jTo || undefined,
  };

  // ── Computed statement rows ─────────────────────────────────────────────────
  const allRows     = result?.rows ?? [];
  const displayRows = hideSettled
    ? allRows.filter(r => r.status !== 'PAID' && r.status !== 'CANCELLED')
    : allRows;

  // ── Aging chart data ────────────────────────────────────────────────────────
  const activeAgingData  = agingSubTab === 'ar' ? arData : apData;
  const agingChartData: AgingBucketData[] = AGING_BUCKETS.map(b => ({
    key: b.key,
    label: t(b.labelKey),
    amount: activeAgingData
      ? activeAgingData.rows.reduce((s, r) => s + ((r as Record<string, number>)[b.key] ?? 0), 0)
      : 0,
  }));

  // ── Trial Balance metadata ──────────────────────────────────────────────────
  const trialIsBalanced = trialData?.metadata?.isBalanced as boolean | undefined;
  const trialDifference = trialData?.metadata?.difference as number | undefined;

  return (
    <div className="financial-center xpl-scope">
      <ReturnToReportButton />

      <div className="fc-header">
        <span className="material-symbols-outlined fc-header-icon">account_balance</span>
        <div className="fc-header-text">
          <h1 className="fc-title">{t('fc.title')}</h1>
          <p className="fc-subtitle">{t('fc.subtitle')}</p>
        </div>
        <div style={{ marginInlineStart: 'auto' }}>
          <PeriodControl />
        </div>
      </div>

      <FinancialTabs
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={key => setParam('tab', key)}
      />

      {/* ── Statement tab ────────────────────────────────────────────────── */}
      {activeTab === 'statement' && (
        <div className="fc-tab-content">
          <div className="fc-entity-type-toggle">
            <button type="button" className={`entity-type-btn ${entityType === 'customer' ? 'active' : ''}`}
              onClick={() => { setParam('entityType', 'customer'); setParam('entityId', ''); }}>{t('fc.entity.customers_plural')}</button>
            <button type="button" className={`entity-type-btn ${entityType === 'supplier' ? 'active' : ''}`}
              onClick={() => { setParam('entityType', 'supplier'); setParam('entityId', ''); }}>{t('fc.entity.suppliers_plural')}</button>
          </div>

          <div className="fc-entity-selector">
            <label htmlFor="fc-entity-select">{entityType === 'customer' ? t('filter.customer') : t('fc.entity.supplier')}</label>
            <select id="fc-entity-select" value={entityId ?? ''} onChange={e => setParam('entityId', e.target.value)}
              aria-label={entityType === 'customer' ? t('error.select_customer') : t('fc.entity.select_supplier')}>
              <option value="">{t('msg.select_placeholder')}</option>
              {entities.map(e => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}
            </select>
          </div>

          <FilterBar
            fromDate={fromDate} toDate={toDate} search={search}
            onFromDate={v => setParam('fromDate', v)}
            onToDate={v   => setParam('toDate',   v)}
            onSearch={v   => setParam('search',   v)}
          />

          <div className="fc-action-bar">
            <button type="button" className="fc-load-btn" onClick={loadStatement} disabled={!entityId || loading}>
              {loading ? t('fc.loading_dots') : t('fc.btn.load')}
            </button>
            <div className="fc-view-toggles">
              <button type="button" className={`view-mode-btn ${viewMode === 'flat'    ? 'active' : ''}`} onClick={() => setViewMode('flat')}>{t('fc.view.flat')}</button>
              <button type="button" className={`view-mode-btn ${viewMode === 'grouped' ? 'active' : ''}`} onClick={() => setViewMode('grouped')}>{t('fc.view.grouped')}</button>
            </div>
            <label className="fc-hide-settled">
              <input type="checkbox" checked={hideSettled} onChange={e => setHideSettled(e.target.checked)} />
              {t('fc.hide_settled')}
            </label>
            {result && <ExportBar onExcelExport={() => doExport('excel')} onPdfExport={() => doExport('pdf')} loading={exporting} />}
          </div>

          {error && (
            <div className="fc-error" role="alert">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">error</span>
              {error}
            </div>
          )}

          {/* Statement context — selected entity + period (shown once loaded) */}
          {result && (
            <div className="fc-statement-context" aria-label={t('fc.aria.statement_context')}>
              <span className="fc-statement-context-entity">
                <span className="material-symbols-outlined" aria-hidden="true">{entityType === 'customer' ? 'person' : 'store'}</span>
                {t('fc.statement_of')} {entities.find(e => String(e.id) === String(entityId))?.name ?? (entityType === 'customer' ? t('filter.customer') : t('fc.entity.supplier'))}
              </span>
              <span className="fc-statement-context-period">
                <span className="material-symbols-outlined" aria-hidden="true">event</span>
                {fromDate ? formatDate(fromDate) : t('fc.period.from_start')} — {toDate ? formatDate(toDate) : t('fc.period.until_today')}
              </span>
            </div>
          )}

          {result?.summary && (
            <SummaryCards cards={[
              { label: t('fc.opening_balance'),      value: result.summary.openingBalance, variant: 'neutral' },
              { label: t('lbl.acc.total_debit'),  value: result.summary.totalDebit,    variant: 'blue'    },
              { label: t('lbl.acc.total_credit'), value: result.summary.totalCredit,   variant: 'green'   },
              { label: t('fc.closing_balance'),      value: result.summary.closingBalance,
                variant: (result.summary.closingBalance ?? 0) < 0 ? 'red' : 'neutral' },
            ]} />
          )}

          {result && displayRows.length > 0 && (
            viewMode === 'grouped'
              ? <GroupedTable rows={displayRows} currentState={statementDrillDown} />
              : <StatementTable rows={displayRows} currentState={statementDrillDown} />
          )}
          {result && displayRows.length === 0 && !loading && (
            <div className="fc-empty">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">search_off</span>
              {t('fc.msg.no_transactions')}
            </div>
          )}

          {/* Manual-load experience — never a bare empty area */}
          {!result && loading && (
            <div className="fc-hint">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">hourglass_top</span>
              {t('fc.msg.loading_statement')}
            </div>
          )}
          {!result && !loading && !entityId && (
            <div className="fc-empty">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">person_search</span>
              {t('fc.hint.select_entity', { type: entityType === 'customer' ? t('fc.entity.customer_acc') : t('fc.entity.supplier_acc') })}
            </div>
          )}
          {!result && !loading && entityId && (
            <div className="fc-load-card" role="region" aria-label={t('fc.aria.ready_load_statement')}>
              <span className="material-symbols-outlined fc-load-card-icon" aria-hidden="true">description</span>
              <div className="fc-load-card-body">
                <h3 className="fc-load-card-title">
                  {t('fc.statement_of')} {entities.find(e => String(e.id) === String(entityId))?.name ?? (entityType === 'customer' ? t('filter.customer') : t('fc.entity.supplier'))}
                </h3>
                <p className="fc-load-card-period">
                  {t('fc.period_label')}{fromDate ? formatDate(fromDate) : t('fc.period.from_start')} — {toDate ? formatDate(toDate) : t('fc.period.until_today')}
                  {search ? t('fc.search_suffix', { term: search }) : ''}
                </p>
                <p className="fc-load-card-hint">
                  {t('fc.hint.load_statement')}
                </p>
              </div>
              <button
                type="button"
                className="fc-load-btn fc-load-card-btn"
                onClick={loadStatement}
                disabled={loading}
                aria-label={t('fc.aria.load_statement')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">download</span>
                {t('fc.btn.load_statement_full')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Aging tab ────────────────────────────────────────────────────── */}
      {activeTab === 'aging' && (
        <div className="fc-tab-content">
          <div className="aging-subtabs">
            <button type="button" className={`subtab-btn ${agingSubTab === 'ar' ? 'active' : ''}`}
              onClick={() => setParam('subTab', 'ar')}>{t('fc.ar_receivables')}</button>
            <button type="button" className={`subtab-btn ${agingSubTab === 'ap' ? 'active' : ''}`}
              onClick={() => setParam('subTab', 'ap')}>{t('field.exp.payment_method.accounts_payable')}</button>
          </div>

          <FilterBar search={agingSearch} onSearch={v => setParam('agingSearch', v)}>
            <div className="filter-field">
              <label htmlFor="aging-as-of-date">{t('fc.until_date')}</label>
              <DateInput id="aging-as-of-date" title={t('fc.title.report_date')}
                value={agingAsOfDate} onChange={(v) => setParam('asOfDate', v)} />
            </div>
            <label className="filter-field fc-hide-settled">
              <input type="checkbox" checked={agingHideZero}
                onChange={e => setParam('hideZero', String(e.target.checked))} />
              {t('fc.hide_zero')}
            </label>
          </FilterBar>

          <div className="fc-action-bar">
            <button type="button" className="fc-load-btn" onClick={loadAging} disabled={agingLoading}>
              {agingLoading ? t('fc.loading_dots') : t('action.refresh')}
            </button>
            {activeAgingData && (
              <ExportBar
                onExcelExport={async () => {
                  setAgingExporting(true);
                  try {
                    const blob = agingSubTab === 'ar'
                      ? await financialApi.exportArAging({ asOfDate: agingAsOfDate || undefined, format: 'excel' })
                      : await financialApi.exportApAging({ asOfDate: agingAsOfDate || undefined, format: 'excel' });
                    downloadBlob(blob, generateExportFileName({ reportName: agingSubTab === 'ap' ? ReportName.APAging : ReportName.ARAging, extension: 'xlsx' }));
                  } finally { setAgingExporting(false); }
                }}
                onPdfExport={async () => {
                  setAgingExporting(true);
                  try {
                    await exportReportAsPdf(
                      `/financial/${agingSubTab}-aging/export`,
                      { asOfDate: agingAsOfDate || undefined },
                      generateExportFileName({ reportName: agingSubTab === 'ap' ? ReportName.APAging : ReportName.ARAging, extension: 'pdf' }),
                    );
                  } finally { setAgingExporting(false); }
                }}
                loading={agingExporting}
              />
            )}
          </div>

          {agingError && (
            <div className="fc-error" role="alert">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">error</span>
              {agingError}
            </div>
          )}
          {activeAgingData && (
            <>
              <div className="fc-statement-context" aria-label={t('fc.aria.aging_context')}>
                <span className="fc-statement-context-entity">
                  <span className="material-symbols-outlined" aria-hidden="true">{agingSubTab === 'ar' ? 'groups' : 'store'}</span>
                  {t('fc.aging_prefix')}{agingSubTab === 'ar' ? t('fc.ar_receivables') : t('field.exp.payment_method.accounts_payable')}
                </span>
                <span className="fc-statement-context-period">
                  <span className="material-symbols-outlined" aria-hidden="true">event</span>
                  {t('fc.until_prefix')}{agingAsOfDate ? formatDate(agingAsOfDate) : t('fc.today')}
                </span>
              </div>
              <AgingSummaryCards summary={activeAgingData.summary} type={agingSubTab} />
              <AgingChart data={agingChartData} />
              <AgingTable rows={activeAgingData.rows} type={agingSubTab} currentState={agingDrillDown} />
            </>
          )}
          {agingLoading && !activeAgingData && (
            <div className="fc-hint">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">hourglass_top</span>
              {t('fc.msg.loading_aging')}
            </div>
          )}
          {!agingLoading && !activeAgingData && !agingError && (
            <div className="fc-empty">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">hourglass_disabled</span>
              {t('fc.hint.load_aging')}
            </div>
          )}
        </div>
      )}

      {/* ── GL tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'gl' && (
        <div className="fc-tab-content">
          <div className="aging-subtabs">
            <button type="button" className={`subtab-btn ${glSubTab === 'statement' ? 'active' : ''}`}
              onClick={() => setParam('glSubTab', 'statement')}>{t('fc.gl.statement_tab')}</button>
            <button type="button" className={`subtab-btn ${glSubTab === 'report' ? 'active' : ''}`}
              onClick={() => setParam('glSubTab', 'report')}>{t('fc.gl.report_title')}</button>
          </div>

          {/* GL Statement sub-tab */}
          {glSubTab === 'statement' && (
            <>
              <div className="fc-section-hint">{t('fc.hint.select_account_period')}</div>
              <AccountSelector value={glAccountId ?? undefined} onChange={id => setParam('accountId', id)} />

              <FilterBar
                fromDate={glFrom} toDate={glTo} search={glSearch}
                onFromDate={v => setParam('glFrom',   v)}
                onToDate={v   => setParam('glTo',     v)}
                onSearch={v   => setParam('glSearch', v)}
              />

              <div className="fc-action-bar">
                <button type="button" className="fc-load-btn" onClick={loadGlStatement} disabled={!glAccountId || glLoading}>
                  {glLoading ? t('fc.loading_dots') : t('fc.btn.load')}
                </button>
                {glStatData && (
                  <ExportBar
                    onExcelExport={async () => {
                      if (!glAccountId) return;
                      setGlExporting(true);
                      try {
                        const blob = await financialApi.exportGlStatement(glAccountId, { fromDate: glFrom || undefined, toDate: glTo || undefined, format: 'excel' });
                        downloadBlob(blob, generateExportFileName({ reportName: ReportName.GeneralLedger, identifier: glAccountId, extension: 'xlsx' }));
                      } finally { setGlExporting(false); }
                    }}
                    onPdfExport={async () => {
                      if (!glAccountId) return;
                      setGlExporting(true);
                      try {
                        await exportReportAsPdf(
                          `/financial/gl-statement/${glAccountId}/export`,
                          { fromDate: glFrom || undefined, toDate: glTo || undefined },
                          generateExportFileName({ reportName: ReportName.GeneralLedger, identifier: glAccountId, extension: 'pdf' }),
                        );
                      } finally { setGlExporting(false); }
                    }}
                    loading={glExporting}
                  />
                )}
              </div>

              {glError && (
                <div className="fc-error" role="alert">
                  <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">error</span>
                  {glError}
                </div>
              )}

              {glStatData && (
                <div className="fc-statement-context" aria-label={t('fc.aria.gl_statement_context')}>
                  <span className="fc-statement-context-entity">
                    <span className="material-symbols-outlined" aria-hidden="true">account_tree</span>
                    {t('fc.gl.statement_title')}
                  </span>
                  <span className="fc-statement-context-period">
                    <span className="material-symbols-outlined" aria-hidden="true">event</span>
                    {glFrom ? formatDate(glFrom) : t('fc.period.from_start')} — {glTo ? formatDate(glTo) : t('fc.period.until_today')}
                  </span>
                </div>
              )}

              {glStatData?.summary && (
                <SummaryCards cards={[
                  { label: t('fc.opening_balance'),  formattedValue: <BalanceDisplay value={glStatData.summary.openingBalance ?? 0} />, variant: 'neutral' },
                  { label: t('lbl.acc.total_debit'), value: glStatData.summary.totalDebit,  variant: 'blue'  },
                  { label: t('lbl.acc.total_credit'), value: glStatData.summary.totalCredit, variant: 'green' },
                  { label: t('fc.closing_balance'),    formattedValue: <BalanceDisplay value={glStatData.summary.closingBalance ?? 0} />,
                    variant: (glStatData.summary.closingBalance ?? 0) < 0 ? 'red' : 'neutral' },
                ]} />
              )}

              {glStatData && glStatData.rows.length > 0 && (
                <div className="table-responsive">
                  <table className="financial-table statement-table">
                    <thead>
                      <tr>
                        <th>{t('col.date')}</th><th>{t('col.acc.entry_number')}</th><th>{t('col.acc.type')}</th>
                        <th>{t('col.acc.description')}</th><th className="num">{fcMoneyHeader(t('acc.balance.debit'))}</th>
                        <th className="num">{fcMoneyHeader(t('acc.balance.credit'))}</th><th className="num">{fcMoneyHeader(t('fc.col.balance'))}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {glStatData.rows.map(row => (
                        <tr key={row.id} id={`row-${row.id}`}>
                          <td>{formatDate(row.date)}</td>
                          <td>
                            <DrillDownLink drillDown={row.drillDown} currentState={glStatDrillDown}>
                              {row.journalNumber}
                            </DrillDownLink>
                          </td>
                          <td>{referenceTypeLabel(row.referenceType, t)}</td>
                          <td>{row.description}</td>
                          <td className="num">{fmtKwd(row.debit)}</td>
                          <td className="num">{fmtKwd(row.credit)}</td>
                          <td className="num">
                            <BalanceDisplay value={row.runningBalance} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {glStatData && glStatData.rows.length === 0 && !glLoading && (
                <div className="fc-empty">
                  <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">search_off</span>
                  {t('fc.msg.no_transactions')}
                </div>
              )}
              {!glStatData && glLoading && (
                <div className="fc-hint">
                  <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">hourglass_top</span>
                  {t('fc.msg.loading_gl_statement')}
                </div>
              )}
              {!glStatData && !glLoading && !glAccountId && (
                <div className="fc-empty">
                  <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">account_balance_wallet</span>
                  {t('fc.hint.select_account_gl')}
                </div>
              )}
              {!glStatData && !glLoading && glAccountId && (
                <div className="fc-load-card" role="region" aria-label={t('fc.aria.ready_load_gl_statement')}>
                  <span className="material-symbols-outlined fc-load-card-icon" aria-hidden="true">account_tree</span>
                  <div className="fc-load-card-body">
                    <h3 className="fc-load-card-title">{t('fc.gl.statement_title')}</h3>
                    <p className="fc-load-card-period">
                      {t('fc.period_label')}{glFrom ? formatDate(glFrom) : t('fc.period.from_start')} — {glTo ? formatDate(glTo) : t('fc.period.until_today')}
                      {glSearch ? t('fc.search_suffix', { term: glSearch }) : ''}
                    </p>
                    <p className="fc-load-card-hint">
                      {t('fc.hint.load_gl_statement')}
                    </p>
                  </div>
                  <button type="button" className="fc-load-btn fc-load-card-btn" onClick={loadGlStatement} disabled={glLoading} aria-label={t('fc.aria.load_gl_statement')}>
                    <span className="material-symbols-outlined" aria-hidden="true">download</span>
                    {t('fc.btn.load')}
                  </button>
                </div>
              )}
            </>
          )}

          {/* GL Report sub-tab */}
          {glSubTab === 'report' && (
            <>
              <FilterBar
                fromDate={glFrom} toDate={glTo}
                onFromDate={v => { setParam('glFrom', v); setParam('glPage', '1'); }}
                onToDate={v   => { setParam('glTo',   v); setParam('glPage', '1'); }}
              />

              <div className="fc-action-bar">
                <button type="button" className="fc-load-btn" onClick={loadGlReport} disabled={glReportLoading}>
                  {glReportLoading ? t('fc.loading_dots') : t('fc.btn.load')}
                </button>
                {glReportData && (
                  <ExportBar
                    onExcelExport={async () => {
                      setGlReportExporting(true);
                      try {
                        const blob = await financialApi.exportGlReport({ fromDate: glFrom || undefined, toDate: glTo || undefined, format: 'excel' });
                        downloadBlob(blob, generateExportFileName({ reportName: ReportName.GeneralLedgerReport, extension: 'xlsx' }));
                      } finally { setGlReportExporting(false); }
                    }}
                    onPdfExport={async () => {
                      setGlReportExporting(true);
                      try {
                        await exportReportAsPdf(
                          '/financial/gl-report/export',
                          { fromDate: glFrom || undefined, toDate: glTo || undefined },
                          generateExportFileName({ reportName: ReportName.GeneralLedgerReport, extension: 'pdf' }),
                        );
                      } finally { setGlReportExporting(false); }
                    }}
                    loading={glReportExporting}
                  />
                )}
              </div>

              {glReportError && (
                <div className="fc-error" role="alert">
                  <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">error</span>
                  {glReportError}
                </div>
              )}

              {glReportData && glReportData.accounts.length > 0 && (
                <>
                  <div className="table-responsive">
                    <table className="financial-table gl-report-table">
                      <thead>
                        <tr>
                          <SortableHeader label={t('col.acc.code')} title={t('col.acc.code')} state={glReportSort.getState('code')} onToggle={() => glReportSort.toggle('code')} />
                          <SortableHeader label={t('col.acc.name')} title={t('col.acc.name')} state={glReportSort.getState('name')} onToggle={() => glReportSort.toggle('name')} />
                          <SortableHeader label={t('col.acc.type')} title={t('col.acc.type')} state={glReportSort.getState('type')} onToggle={() => glReportSort.toggle('type')} />
                          {/* أعمدة الأرصدة الأربعة غير قابلة للفرز — تُحسب خادميًا لكل صفحة على حدة */}
                          <th className="num">{fcMoneyHeader(t('fc.tb.opening_balance'))}</th>
                          <th className="num">{fcMoneyHeader(t('fc.tb.total_debit'))}</th>
                          <th className="num">{fcMoneyHeader(t('fc.tb.total_credit'))}</th>
                          <th className="num">{fcMoneyHeader(t('fc.tb.closing_balance'))}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {glReportData.accounts.map(acc => (
                          <tr key={acc.accountId}>
                            <td>{acc.accountCode}</td>
                            <td>
                              <button
                                type="button"
                                className="account-link"
                                onClick={() => navigate(
                                  `/financial?tab=gl&glSubTab=statement&accountId=${acc.accountId}&glFrom=${glFrom}&glTo=${glTo}`
                                )}
                              >
                                {acc.accountName}
                              </button>
                            </td>
                            <td>{accountTypeLabel(acc.accountType, t)}</td>
                            <td className="num"><BalanceDisplay value={acc.openingBalance} /></td>
                            <td className="num">{fmtKwd(acc.totalDebit)}</td>
                            <td className="num">{fmtKwd(acc.totalCredit)}</td>
                            <td className="num"><BalanceDisplay value={acc.closingBalance} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination — shared ExplorerKit component, not a bespoke reimplementation */}
                  <Pagination meta={glReportData.pagination} onPage={(p) => setParam('glPage', p)} />
                </>
              )}
              {glReportData && glReportData.accounts.length === 0 && !glReportLoading && (
                <div className="fc-empty">
                  <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">search_off</span>
                  {t('fc.msg.no_accounts')}
                </div>
              )}
              {glReportLoading && !glReportData && (
                <div className="fc-hint">
                  <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">hourglass_top</span>
                  {t('fc.msg.loading_gl_report')}
                </div>
              )}
              {!glReportLoading && !glReportData && !glReportError && (
                <div className="fc-load-card" role="region" aria-label={t('fc.aria.ready_load_gl_report')}>
                  <span className="material-symbols-outlined fc-load-card-icon" aria-hidden="true">menu_book</span>
                  <div className="fc-load-card-body">
                    <h3 className="fc-load-card-title">{t('fc.gl.report_title')}</h3>
                    <p className="fc-load-card-period">
                      {t('fc.period_label')}{glFrom ? formatDate(glFrom) : t('fc.period.from_start')} — {glTo ? formatDate(glTo) : t('fc.period.until_today')}
                    </p>
                    <p className="fc-load-card-hint">
                      {t('fc.hint.load_gl_report')}
                    </p>
                  </div>
                  <button type="button" className="fc-load-btn fc-load-card-btn" onClick={loadGlReport} disabled={glReportLoading} aria-label={t('fc.aria.load_gl_report')}>
                    <span className="material-symbols-outlined" aria-hidden="true">download</span>
                    {t('fc.btn.load')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Trial Balance tab ────────────────────────────────────────────── */}
      {activeTab === 'trial' && (
        <div className="fc-tab-content">
          <ModeToggle mode={trialMode} onChange={m => { setParam('trialMode', m); setTrialData(null); }} />

          {trialMode === 'as-of' ? (
            <FilterBar>
              <div className="filter-field">
                <label htmlFor="trial-as-of">{t('fc.until_date')}</label>
                <DateInput id="trial-as-of" title={t('fc.until_date')}
                  value={trialAsOf} onChange={(v) => setParam('trialAsOf', v)} />
              </div>
            </FilterBar>
          ) : (
            <FilterBar
              fromDate={trialFrom} toDate={trialTo}
              onFromDate={v => setParam('trialFrom', v)}
              onToDate={v   => setParam('trialTo',   v)}
            />
          )}

          <div className="fc-action-bar">
            <button type="button" className="fc-load-btn" onClick={loadTrialBalance} disabled={trialLoading}>
              {trialLoading ? t('fc.loading_dots') : t('fc.btn.load')}
            </button>
            {trialData && (
              <ExportBar
                onExcelExport={async () => {
                  setTrialExporting(true);
                  try {
                    const blob = await financialApi.exportTrialBalance({
                      mode: trialMode,
                      asOfDate: trialMode === 'as-of'  ? (trialAsOf  || undefined) : undefined,
                      fromDate: trialMode === 'period' ? (trialFrom   || undefined) : undefined,
                      toDate:   trialMode === 'period' ? (trialTo     || undefined) : undefined,
                      format: 'excel',
                    });
                    downloadBlob(blob, generateExportFileName({ reportName: ReportName.TrialBalance, extension: 'xlsx' }));
                  } finally { setTrialExporting(false); }
                }}
                onPdfExport={async () => {
                  setTrialExporting(true);
                  try {
                    await exportReportAsPdf(
                      '/financial/trial-balance/export',
                      {
                        mode:     trialMode,
                        asOfDate: trialMode === 'as-of'  ? (trialAsOf || undefined) : undefined,
                        fromDate: trialMode === 'period' ? (trialFrom  || undefined) : undefined,
                        toDate:   trialMode === 'period' ? (trialTo    || undefined) : undefined,
                      },
                      generateExportFileName({ reportName: ReportName.TrialBalance, extension: 'pdf' }),
                    );
                  } finally { setTrialExporting(false); }
                }}
                loading={trialExporting}
              />
            )}
          </div>

          {trialError && (
            <div className="fc-error" role="alert">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">error</span>
              {trialError}
            </div>
          )}

          {trialData && (
            <div className="fc-statement-context" aria-label={t('fc.aria.trial_context')}>
              <span className="fc-statement-context-entity">
                <span className="material-symbols-outlined" aria-hidden="true">balance</span>
                {t('fc.tab.trial')}
              </span>
              <span className="fc-statement-context-period">
                <span className="material-symbols-outlined" aria-hidden="true">event</span>
                {trialMode === 'as-of'
                  ? `${t('fc.until_prefix')}${trialAsOf ? formatDate(trialAsOf) : t('fc.today')}`
                  : `${trialFrom ? formatDate(trialFrom) : t('fc.period.from_start')} — ${trialTo ? formatDate(trialTo) : t('fc.period.until_today')}`}
              </span>
              <span className={`fc-balance-chip ${trialIsBalanced ? 'ok' : 'bad'}`}>
                <span className="material-symbols-outlined" aria-hidden="true">{trialIsBalanced ? 'check_circle' : 'error'}</span>
                {trialIsBalanced ? t('lbl.acc.balanced') : t('lbl.acc.unbalanced')}
              </span>
            </div>
          )}

          <ImbalanceAlert isBalanced={trialIsBalanced} difference={trialDifference} />

          {trialData?.summary && (
            <SummaryCards cards={[
              { label: t('lbl.acc.total_debit'), value: trialData.summary.totalDebit,  variant: 'blue'  },
              { label: t('lbl.acc.total_credit'), value: trialData.summary.totalCredit, variant: 'green' },
            ]} />
          )}

          {trialData && trialData.rows.length > 0 && (
            <TrialBalanceTable
              rows={trialData.rows}
              mode={trialMode}
              totals={trialData.totals}
            />
          )}
          {trialData && trialData.rows.length === 0 && !trialLoading && (
            <div className="fc-empty">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">search_off</span>
              {t('fc.msg.no_data_criteria')}
            </div>
          )}
          {trialLoading && !trialData && (
            <div className="fc-hint">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">hourglass_top</span>
              {t('fc.msg.loading_trial_balance')}
            </div>
          )}
          {!trialLoading && !trialData && !trialError && (
            <div className="fc-load-card" role="region" aria-label={t('fc.aria.ready_load_trial_balance')}>
              <span className="material-symbols-outlined fc-load-card-icon" aria-hidden="true">balance</span>
              <div className="fc-load-card-body">
                <h3 className="fc-load-card-title">{t('fc.tab.trial')}</h3>
                <p className="fc-load-card-period">
                  {trialMode === 'as-of'
                    ? `${t('fc.until_date')}: ${trialAsOf ? formatDate(trialAsOf) : t('fc.today')}`
                    : `${t('fc.period_label')}${trialFrom ? formatDate(trialFrom) : t('fc.period.from_start')} — ${trialTo ? formatDate(trialTo) : t('fc.period.until_today')}`}
                </p>
                <p className="fc-load-card-hint">
                  {t('fc.hint.load_trial_balance')}
                </p>
              </div>
              <button type="button" className="fc-load-btn fc-load-card-btn" onClick={loadTrialBalance} disabled={trialLoading} aria-label={t('fc.aria.load_trial_balance')}>
                <span className="material-symbols-outlined" aria-hidden="true">download</span>
                {t('fc.btn.load')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Journal Book tab ─────────────────────────────────────────────── */}
      {activeTab === 'journal' && (
        <div className="fc-tab-content">
          <FilterBar
            fromDate={jFrom} toDate={jTo} search={jSearch}
            onFromDate={v => { setParam('jFrom',   v); setParam('jPage', '1'); }}
            onToDate={v   => { setParam('jTo',     v); setParam('jPage', '1'); }}
            onSearch={v   => { setParam('jSearch', v); setParam('jPage', '1'); }}
          >
            <div className="filter-field">
              <label htmlFor="j-status">{t('col.status')}</label>
              <select
                id="j-status"
                title={t('fc.journal.status_title')}
                value={jStatus}
                onChange={e => { setParam('jStatus', e.target.value); setParam('jPage', '1'); }}
              >
                <option value="">{t('opt.all_plain')}</option>
                <option value="POSTED">{t('acc.journal.posted')}</option>
                <option value="DRAFT">{t('acc.journal.draft')}</option>
              </select>
            </div>
          </FilterBar>

          <div className="fc-action-bar">
            <button type="button" className="fc-load-btn" onClick={loadJournalBook} disabled={journalLoading}>
              {journalLoading ? t('fc.loading_dots') : t('fc.btn.load')}
            </button>
            {journalData && (
              <ExportBar
                onExcelExport={async () => {
                  setJournalExporting(true);
                  try {
                    const blob = await financialApi.exportJournalBook({ fromDate: jFrom || undefined, toDate: jTo || undefined, status: jStatus || undefined, search: jSearch || undefined, format: 'excel' });
                    downloadBlob(blob, generateExportFileName({ reportName: ReportName.JournalBook, extension: 'xlsx' }));
                  } finally { setJournalExporting(false); }
                }}
                onPdfExport={async () => {
                  setJournalExporting(true);
                  try {
                    await exportReportAsPdf(
                      '/financial/journal-book/export',
                      { fromDate: jFrom || undefined, toDate: jTo || undefined, status: jStatus || undefined, search: jSearch || undefined },
                      generateExportFileName({ reportName: ReportName.JournalBook, extension: 'pdf' }),
                    );
                  } finally { setJournalExporting(false); }
                }}
                loading={journalExporting}
              />
            )}
          </div>

          {journalError && (
            <div className="fc-error" role="alert">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">error</span>
              {journalError}
            </div>
          )}

          {journalData && (
            <div className="fc-statement-context" aria-label={t('fc.aria.journal_context')}>
              <span className="fc-statement-context-entity">
                <span className="material-symbols-outlined" aria-hidden="true">menu_book</span>
                {t('fc.tab.journal')}
              </span>
              <span className="fc-statement-context-period">
                <span className="material-symbols-outlined" aria-hidden="true">event</span>
                {jFrom ? formatDate(jFrom) : t('fc.period.from_start')} — {jTo ? formatDate(jTo) : t('fc.period.until_today')}
                {jStatus ? ` · ${jStatus === 'POSTED' ? t('fc.journal.posted_plural') : t('fc.journal.draft_plural')}` : ''}
              </span>
            </div>
          )}

          {journalData?.summary && (
            <SummaryCards cards={[
              { label: t('lbl.acc.total_debit'),    value: journalData.summary.totalDebit,       variant: 'blue'    },
              { label: t('lbl.acc.total_credit'),    value: journalData.summary.totalCredit,      variant: 'green'   },
              { label: t('col.acc.journal_count'),       value: journalData.summary.transactionCount, variant: 'neutral' },
            ]} />
          )}

          {journalData && journalData.rows.length > 0 && (
            <JournalBookTable rows={journalData.rows} currentState={journalDrillDown} />
          )}
          {journalData && journalData.rows.length === 0 && !journalLoading && (
            <div className="fc-empty">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">search_off</span>
              {t('fc.msg.no_entries')}
            </div>
          )}

          {/* Pagination — shared ExplorerKit component, not a bespoke reimplementation */}
          <Pagination meta={journalData?.pagination} onPage={(p) => setParam('jPage', p)} />

          {journalLoading && !journalData && (
            <div className="fc-hint">
              <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">hourglass_top</span>
              {t('fc.msg.loading_journal')}
            </div>
          )}
          {!journalLoading && !journalData && !journalError && (
            <div className="fc-load-card" role="region" aria-label={t('fc.aria.ready_load_journal')}>
              <span className="material-symbols-outlined fc-load-card-icon" aria-hidden="true">menu_book</span>
              <div className="fc-load-card-body">
                <h3 className="fc-load-card-title">{t('fc.tab.journal')}</h3>
                <p className="fc-load-card-period">
                  {t('fc.period_label')}{jFrom ? formatDate(jFrom) : t('fc.period.from_start')} — {jTo ? formatDate(jTo) : t('fc.period.until_today')}
                  {jStatus ? ` · ${jStatus === 'POSTED' ? t('fc.journal.posted_plural') : t('fc.journal.draft_plural')}` : ''}
                  {jSearch ? t('fc.search_suffix', { term: jSearch }) : ''}
                </p>
                <p className="fc-load-card-hint">
                  {t('fc.hint.load_journal')}
                </p>
              </div>
              <button type="button" className="fc-load-btn fc-load-card-btn" onClick={loadJournalBook} disabled={journalLoading} aria-label={t('fc.aria.load_journal')}>
                <span className="material-symbols-outlined" aria-hidden="true">download</span>
                {t('fc.btn.load')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Financial Reports ─────────────────────────────────────────────── */}
      {activeTab === 'finreport' && (
        <FinancialReportsTab
          fromDate={frFrom}
          toDate={frTo}
          onFromDate={v => setParam('frFrom', v)}
          onToDate={v   => setParam('frTo',   v)}
        />
      )}
    </div>
  );
}
