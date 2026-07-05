import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { financialApi } from '../api/financial';
import { exportReportAsPdf } from '../utils/pdfExport';
import { formatCurrency } from '../lib/format';
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

interface EntityOption { id: number; name: string; code: string; }

const FINANCIAL_TABS = [
  { key: 'statement', label: 'كشف الحساب',      permission: 'statements.read'   },
  { key: 'aging',     label: 'أعمار الذمم',     permission: 'aging.read'         },
  { key: 'gl',        label: 'دفتر الأستاذ',    permission: 'gl.read'            },
  { key: 'trial',     label: 'ميزان المراجعة',  permission: 'trialbalance.read'  },
  { key: 'journal',   label: 'دفتر اليومية',    permission: 'journal.read'       },
  { key: 'finreport', label: 'التقارير المالية', permission: 'finreports.read'   },
];

const AGING_BUCKETS: AgingBucketData[] = [
  { key: 'current',  label: 'جاري',       amount: 0 },
  { key: '0_30',     label: '0–30 يوم',   amount: 0 },
  { key: '31_60',    label: '31–60 يوم',  amount: 0 },
  { key: '61_90',    label: '61–90 يوم',  amount: 0 },
  { key: '91_120',   label: '91–120 يوم', amount: 0 },
  { key: 'over_120', label: '+120 يوم',   amount: 0 },
];

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtKwd(n?: number) {
  if (n === undefined || n === null) return '';
  return formatCurrency(n);
}

export default function FinancialCenter() {
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
      setError('تعذّر تحميل كشف الحساب');
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
      if (format === 'pdf') {
        await exportReportAsPdf(
          `/financial/statements/${entityType}/${entityId}/export`,
          { fromDate: fromDate || undefined, toDate: toDate || undefined, search: search || undefined },
          `statement-${entity?.code ?? entityId}`,
        );
      } else {
        const blob = await financialApi.exportStatement(entityType, entityId, {
          fromDate: fromDate || undefined,
          toDate:   toDate   || undefined,
          search:   search   || undefined,
          format,
        });
        saveBlob(blob, `statement-${entity?.code ?? entityId}.xlsx`);
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
      setAgingError('تعذّر تحميل أعمار الذمم');
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
      setGlError('تعذّر تحميل كشف الأستاذ');
    } finally {
      setGlLoading(false);
    }
  }, [glAccountId, glFrom, glTo, glSearch]);

  // ── GL Report data ─────────────────────────────────────────────────────────
  const [glReportData,     setGlReportData]     = useState<GlReportResponse | null>(null);
  const [glReportLoading,  setGlReportLoading]  = useState(false);
  const [glReportError,    setGlReportError]    = useState<string | null>(null);
  const [glReportExporting, setGlReportExporting] = useState(false);

  const loadGlReport = useCallback(async () => {
    setGlReportLoading(true);
    setGlReportError(null);
    try {
      const data = await financialApi.getGlReport({
        fromDate: glFrom || undefined,
        toDate:   glTo   || undefined,
        page:     glPage,
        pageSize: 20,
      });
      setGlReportData(data);
    } catch {
      setGlReportError('تعذّر تحميل دفتر الأستاذ العام');
    } finally {
      setGlReportLoading(false);
    }
  }, [glFrom, glTo, glPage]);

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
      setTrialError('تعذّر تحميل ميزان المراجعة');
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
      setJournalError('تعذّر تحميل دفتر اليومية');
    } finally {
      setJournalLoading(false);
    }
  }, [jFrom, jTo, jStatus, jSearch, jPage]);

  useEffect(() => { if (tab === 'journal') loadJournalBook(); }, [tab, loadJournalBook]);

  // ── RBAC ───────────────────────────────────────────────────────────────────
  const visibleTabs = FINANCIAL_TABS.filter(t => hasPermission(t.permission));
  if (visibleTabs.length === 0) {
    return (
      <div className="financial-center" dir="rtl">
        <p className="fc-no-permission">لا توجد صلاحيات لعرض هذا القسم.</p>
      </div>
    );
  }

  const activeTab = visibleTabs.find(t => t.key === tab) ? tab : visibleTabs[0].key;

  // ── DrillDown states ────────────────────────────────────────────────────────
  const statementDrillDown: FinancialDrillDownState = {
    returnTo: '/financial', reportLabel: 'كشف الحساب',
    tab: 'statement', entityType, entityId: entityId ?? undefined,
    fromDate: fromDate || undefined, toDate: toDate || undefined,
  };

  const agingDrillDown: FinancialDrillDownState = {
    returnTo: '/financial', reportLabel: 'أعمار الذمم',
    tab: 'aging', subTab: agingSubTab,
    fromDate: agingAsOfDate || undefined,
  };

  const glStatDrillDown: FinancialDrillDownState = {
    returnTo: '/financial', reportLabel: 'كشف الأستاذ',
    tab: 'gl', subTab: 'statement',
    accountId: glAccountId ?? undefined,
    fromDate: glFrom || undefined, toDate: glTo || undefined,
  };

  const journalDrillDown: FinancialDrillDownState = {
    returnTo: '/financial', reportLabel: 'دفتر اليومية',
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
    ...b,
    amount: activeAgingData
      ? activeAgingData.rows.reduce((s, r) => s + ((r as Record<string, number>)[b.key] ?? 0), 0)
      : 0,
  }));

  // ── Trial Balance metadata ──────────────────────────────────────────────────
  const trialIsBalanced = trialData?.metadata?.isBalanced as boolean | undefined;
  const trialDifference = trialData?.metadata?.difference as number | undefined;

  return (
    <div className="financial-center" dir="rtl">
      <ReturnToReportButton />

      <div className="fc-header">
        <span className="material-symbols-outlined fc-header-icon">account_balance</span>
        <h1 className="fc-title">المركز المالي</h1>
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
              onClick={() => { setParam('entityType', 'customer'); setParam('entityId', ''); }}>عملاء</button>
            <button type="button" className={`entity-type-btn ${entityType === 'supplier' ? 'active' : ''}`}
              onClick={() => { setParam('entityType', 'supplier'); setParam('entityId', ''); }}>موردون</button>
          </div>

          <div className="fc-entity-selector">
            <label htmlFor="fc-entity-select">{entityType === 'customer' ? 'العميل' : 'المورد'}</label>
            <select id="fc-entity-select" value={entityId ?? ''} onChange={e => setParam('entityId', e.target.value)}
              aria-label={entityType === 'customer' ? 'اختر العميل' : 'اختر المورد'}>
              <option value="">— اختر —</option>
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
              {loading ? 'جارٍ التحميل...' : 'تحميل'}
            </button>
            <div className="fc-view-toggles">
              <button type="button" className={`view-mode-btn ${viewMode === 'flat'    ? 'active' : ''}`} onClick={() => setViewMode('flat')}>مسطّح</button>
              <button type="button" className={`view-mode-btn ${viewMode === 'grouped' ? 'active' : ''}`} onClick={() => setViewMode('grouped')}>مجمّع</button>
            </div>
            <label className="fc-hide-settled">
              <input type="checkbox" checked={hideSettled} onChange={e => setHideSettled(e.target.checked)} />
              إخفاء المسددة
            </label>
            {result && <ExportBar onExcelExport={() => doExport('excel')} onPdfExport={() => doExport('pdf')} loading={exporting} />}
          </div>

          {error && <p className="fc-error">{error}</p>}

          {result?.summary && (
            <SummaryCards cards={[
              { label: 'رصيد افتتاحي',  value: result.summary.openingBalance, variant: 'neutral' },
              { label: 'إجمالي المدين', value: result.summary.totalDebit,    variant: 'blue'    },
              { label: 'إجمالي الدائن', value: result.summary.totalCredit,   variant: 'green'   },
              { label: 'رصيد ختامي',    value: result.summary.closingBalance,
                variant: (result.summary.closingBalance ?? 0) < 0 ? 'red' : 'neutral' },
            ]} />
          )}

          {result && displayRows.length > 0 && (
            viewMode === 'grouped'
              ? <GroupedTable rows={displayRows} currentState={statementDrillDown} />
              : <StatementTable rows={displayRows} currentState={statementDrillDown} />
          )}
          {result && displayRows.length === 0 && !loading && (
            <p className="fc-empty">لا توجد حركات بالمعايير المحددة.</p>
          )}
          {!entityId && !result && (
            <p className="fc-hint">اختر {entityType === 'customer' ? 'عميلاً' : 'موردًا'} ثم اضغط «تحميل».</p>
          )}
        </div>
      )}

      {/* ── Aging tab ────────────────────────────────────────────────────── */}
      {activeTab === 'aging' && (
        <div className="fc-tab-content">
          <div className="aging-subtabs">
            <button type="button" className={`subtab-btn ${agingSubTab === 'ar' ? 'active' : ''}`}
              onClick={() => setParam('subTab', 'ar')}>ذمم العملاء</button>
            <button type="button" className={`subtab-btn ${agingSubTab === 'ap' ? 'active' : ''}`}
              onClick={() => setParam('subTab', 'ap')}>ذمم الموردين</button>
          </div>

          <FilterBar search={agingSearch} onSearch={v => setParam('agingSearch', v)}>
            <div className="filter-field">
              <label htmlFor="aging-as-of-date">حتى تاريخ</label>
              <input id="aging-as-of-date" type="date" title="تاريخ التقرير"
                value={agingAsOfDate} onChange={e => setParam('asOfDate', e.target.value)} />
            </div>
            <label className="filter-field fc-hide-settled">
              <input type="checkbox" checked={agingHideZero}
                onChange={e => setParam('hideZero', String(e.target.checked))} />
              إخفاء الصفرية
            </label>
          </FilterBar>

          <div className="fc-action-bar">
            <button type="button" className="fc-load-btn" onClick={loadAging} disabled={agingLoading}>
              {agingLoading ? 'جارٍ التحميل...' : 'تحديث'}
            </button>
            {activeAgingData && (
              <ExportBar
                onExcelExport={async () => {
                  setAgingExporting(true);
                  try {
                    const blob = agingSubTab === 'ar'
                      ? await financialApi.exportArAging({ asOfDate: agingAsOfDate || undefined, format: 'excel' })
                      : await financialApi.exportApAging({ asOfDate: agingAsOfDate || undefined, format: 'excel' });
                    saveBlob(blob, `${agingSubTab}-aging.xlsx`);
                  } finally { setAgingExporting(false); }
                }}
                onPdfExport={async () => {
                  setAgingExporting(true);
                  try {
                    await exportReportAsPdf(
                      `/financial/${agingSubTab}-aging/export`,
                      { asOfDate: agingAsOfDate || undefined },
                      `${agingSubTab}-aging`,
                    );
                  } finally { setAgingExporting(false); }
                }}
                loading={agingExporting}
              />
            )}
          </div>

          {agingError && <p className="fc-error">{agingError}</p>}
          {activeAgingData && (
            <>
              <AgingSummaryCards summary={activeAgingData.summary} type={agingSubTab} />
              <AgingChart data={agingChartData} />
              <AgingTable rows={activeAgingData.rows} type={agingSubTab} currentState={agingDrillDown} />
            </>
          )}
          {agingLoading && !activeAgingData && <p className="fc-hint">جارٍ تحميل أعمار الذمم...</p>}
          {!agingLoading && !activeAgingData && !agingError && (
            <p className="fc-hint">اضغط «تحديث» لتحميل أعمار الذمم.</p>
          )}
        </div>
      )}

      {/* ── GL tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'gl' && (
        <div className="fc-tab-content">
          <div className="aging-subtabs">
            <button type="button" className={`subtab-btn ${glSubTab === 'statement' ? 'active' : ''}`}
              onClick={() => setParam('glSubTab', 'statement')}>كشف الأستاذ</button>
            <button type="button" className={`subtab-btn ${glSubTab === 'report' ? 'active' : ''}`}
              onClick={() => setParam('glSubTab', 'report')}>دفتر الأستاذ العام</button>
          </div>

          {/* GL Statement sub-tab */}
          {glSubTab === 'statement' && (
            <>
              <div className="fc-section-hint">اختر الحساب ثم حدد الفترة وانقر «تحميل».</div>
              <AccountSelector value={glAccountId ?? undefined} onChange={id => setParam('accountId', id)} />

              <FilterBar
                fromDate={glFrom} toDate={glTo} search={glSearch}
                onFromDate={v => setParam('glFrom',   v)}
                onToDate={v   => setParam('glTo',     v)}
                onSearch={v   => setParam('glSearch', v)}
              />

              <div className="fc-action-bar">
                <button type="button" className="fc-load-btn" onClick={loadGlStatement} disabled={!glAccountId || glLoading}>
                  {glLoading ? 'جارٍ التحميل...' : 'تحميل'}
                </button>
                {glStatData && (
                  <ExportBar
                    onExcelExport={async () => {
                      if (!glAccountId) return;
                      setGlExporting(true);
                      try {
                        const blob = await financialApi.exportGlStatement(glAccountId, { fromDate: glFrom || undefined, toDate: glTo || undefined, format: 'excel' });
                        saveBlob(blob, `gl-statement-${glAccountId}.xlsx`);
                      } finally { setGlExporting(false); }
                    }}
                    onPdfExport={async () => {
                      if (!glAccountId) return;
                      setGlExporting(true);
                      try {
                        await exportReportAsPdf(
                          `/financial/gl-statement/${glAccountId}/export`,
                          { fromDate: glFrom || undefined, toDate: glTo || undefined },
                          `gl-statement-${glAccountId}`,
                        );
                      } finally { setGlExporting(false); }
                    }}
                    loading={glExporting}
                  />
                )}
              </div>

              {glError && <p className="fc-error">{glError}</p>}

              {glStatData?.summary && (
                <SummaryCards cards={[
                  { label: 'رصيد افتتاحي',  formattedValue: <BalanceDisplay value={glStatData.summary.openingBalance ?? 0} />, variant: 'neutral' },
                  { label: 'إجمالي المدين', value: glStatData.summary.totalDebit,  variant: 'blue'  },
                  { label: 'إجمالي الدائن', value: glStatData.summary.totalCredit, variant: 'green' },
                  { label: 'رصيد ختامي',    formattedValue: <BalanceDisplay value={glStatData.summary.closingBalance ?? 0} />,
                    variant: (glStatData.summary.closingBalance ?? 0) < 0 ? 'red' : 'neutral' },
                ]} />
              )}

              {glStatData && glStatData.rows.length > 0 && (
                <div className="table-responsive">
                  <table className="financial-table statement-table" dir="rtl">
                    <thead>
                      <tr>
                        <th>التاريخ</th><th>رقم القيد</th><th>النوع</th>
                        <th>البيان</th><th className="num">مدين</th>
                        <th className="num">دائن</th><th className="num">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {glStatData.rows.map(row => (
                        <tr key={row.id} id={`row-${row.id}`}>
                          <td>{row.date.slice(0, 10)}</td>
                          <td>
                            <DrillDownLink drillDown={row.drillDown} currentState={glStatDrillDown}>
                              {row.journalNumber}
                            </DrillDownLink>
                          </td>
                          <td>{row.referenceType}</td>
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
                <p className="fc-empty">لا توجد حركات بالمعايير المحددة.</p>
              )}
              {!glAccountId && !glStatData && (
                <p className="fc-hint">اختر حسابًا من القائمة أعلاه.</p>
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
                  {glReportLoading ? 'جارٍ التحميل...' : 'تحميل'}
                </button>
                {glReportData && (
                  <ExportBar
                    onExcelExport={async () => {
                      setGlReportExporting(true);
                      try {
                        const blob = await financialApi.exportGlReport({ fromDate: glFrom || undefined, toDate: glTo || undefined, format: 'excel' });
                        saveBlob(blob, 'gl-report.xlsx');
                      } finally { setGlReportExporting(false); }
                    }}
                    onPdfExport={async () => {
                      setGlReportExporting(true);
                      try {
                        await exportReportAsPdf(
                          '/financial/gl-report/export',
                          { fromDate: glFrom || undefined, toDate: glTo || undefined },
                          'gl-report',
                        );
                      } finally { setGlReportExporting(false); }
                    }}
                    loading={glReportExporting}
                  />
                )}
              </div>

              {glReportError && <p className="fc-error">{glReportError}</p>}

              {glReportData && (
                <>
                  <div className="table-responsive">
                    <table className="financial-table gl-report-table" dir="rtl">
                      <thead>
                        <tr>
                          <th>الكود</th><th>اسم الحساب</th><th>النوع</th>
                          <th className="num">رصيد الافتتاح</th>
                          <th className="num">إجمالي مدين</th>
                          <th className="num">إجمالي دائن</th>
                          <th className="num">رصيد الإقفال</th>
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
                            <td>{acc.accountType}</td>
                            <td className="num"><BalanceDisplay value={acc.openingBalance} /></td>
                            <td className="num">{fmtKwd(acc.totalDebit)}</td>
                            <td className="num">{fmtKwd(acc.totalCredit)}</td>
                            <td className="num"><BalanceDisplay value={acc.closingBalance} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {glReportData.pagination.totalPages > 1 && (
                    <div className="fc-pagination">
                      <button type="button" disabled={glPage <= 1} onClick={() => setParam('glPage', glPage - 1)}>
                        السابق
                      </button>
                      <span>{glPage} / {glReportData.pagination.totalPages}</span>
                      <button type="button" disabled={glPage >= glReportData.pagination.totalPages}
                        onClick={() => setParam('glPage', glPage + 1)}>
                        التالي
                      </button>
                    </div>
                  )}
                </>
              )}
              {!glReportLoading && !glReportData && !glReportError && (
                <p className="fc-hint">اضغط «تحميل» لعرض دفتر الأستاذ العام.</p>
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
                <label htmlFor="trial-as-of">حتى تاريخ</label>
                <input id="trial-as-of" type="date" title="حتى تاريخ"
                  value={trialAsOf} onChange={e => setParam('trialAsOf', e.target.value)} />
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
              {trialLoading ? 'جارٍ التحميل...' : 'تحميل'}
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
                    saveBlob(blob, 'trial-balance.xlsx');
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
                      'trial-balance',
                    );
                  } finally { setTrialExporting(false); }
                }}
                loading={trialExporting}
              />
            )}
          </div>

          {trialError && <p className="fc-error">{trialError}</p>}

          <ImbalanceAlert isBalanced={trialIsBalanced} difference={trialDifference} />

          {trialData?.summary && (
            <SummaryCards cards={[
              { label: 'إجمالي المدين', value: trialData.summary.totalDebit,  variant: 'blue'  },
              { label: 'إجمالي الدائن', value: trialData.summary.totalCredit, variant: 'green' },
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
            <p className="fc-empty">لا توجد بيانات بالمعايير المحددة.</p>
          )}
          {!trialLoading && !trialData && !trialError && (
            <p className="fc-hint">اضغط «تحميل» لعرض ميزان المراجعة.</p>
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
              <label htmlFor="j-status">الحالة</label>
              <select
                id="j-status"
                title="حالة القيد"
                value={jStatus}
                onChange={e => { setParam('jStatus', e.target.value); setParam('jPage', '1'); }}
              >
                <option value="">الكل</option>
                <option value="POSTED">مرحّل</option>
                <option value="DRAFT">مسودة</option>
              </select>
            </div>
          </FilterBar>

          <div className="fc-action-bar">
            <button type="button" className="fc-load-btn" onClick={loadJournalBook} disabled={journalLoading}>
              {journalLoading ? 'جارٍ التحميل...' : 'تحميل'}
            </button>
            {journalData && (
              <ExportBar
                onExcelExport={async () => {
                  setJournalExporting(true);
                  try {
                    const blob = await financialApi.exportJournalBook({ fromDate: jFrom || undefined, toDate: jTo || undefined, status: jStatus || undefined, search: jSearch || undefined, format: 'excel' });
                    saveBlob(blob, 'journal-book.xlsx');
                  } finally { setJournalExporting(false); }
                }}
                onPdfExport={async () => {
                  setJournalExporting(true);
                  try {
                    await exportReportAsPdf(
                      '/financial/journal-book/export',
                      { fromDate: jFrom || undefined, toDate: jTo || undefined, status: jStatus || undefined, search: jSearch || undefined },
                      'journal-book',
                    );
                  } finally { setJournalExporting(false); }
                }}
                loading={journalExporting}
              />
            )}
          </div>

          {journalError && <p className="fc-error">{journalError}</p>}

          {journalData?.summary && (
            <SummaryCards cards={[
              { label: 'إجمالي المدين',    value: journalData.summary.totalDebit,       variant: 'blue'    },
              { label: 'إجمالي الدائن',    value: journalData.summary.totalCredit,      variant: 'green'   },
              { label: 'عدد القيود',       value: journalData.summary.transactionCount, variant: 'neutral' },
            ]} />
          )}

          {journalData && journalData.rows.length > 0 && (
            <JournalBookTable rows={journalData.rows} currentState={journalDrillDown} />
          )}
          {journalData && journalData.rows.length === 0 && !journalLoading && (
            <p className="fc-empty">لا توجد قيود بالمعايير المحددة.</p>
          )}

          {journalData?.pagination && journalData.pagination.totalPages > 1 && (
            <div className="fc-pagination">
              <button type="button" disabled={jPage <= 1}
                onClick={() => setParam('jPage', jPage - 1)}>السابق</button>
              <span>{jPage} / {journalData.pagination.totalPages}</span>
              <button type="button" disabled={jPage >= journalData.pagination.totalPages}
                onClick={() => setParam('jPage', jPage + 1)}>التالي</button>
            </div>
          )}

          {!journalLoading && !journalData && !journalError && (
            <p className="fc-hint">اضغط «تحميل» لعرض دفتر اليومية.</p>
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
