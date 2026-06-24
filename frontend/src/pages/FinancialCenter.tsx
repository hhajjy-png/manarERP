import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { financialApi } from '../api/financial';
import type {
  FinancialResponse, StatementRow, ArAgingRow, ApAgingRow,
} from '../types/financial.types';
import { useAuth } from '../stores/authStore';
import { FinancialTabs }    from '../components/financial/FinancialTabs';
import { FilterBar }        from '../components/financial/FilterBar';
import { SummaryCards }     from '../components/financial/SummaryCards';
import { ExportBar }        from '../components/financial/ExportBar';
import { StatementTable }   from '../components/financial/StatementTable';
import { GroupedTable }     from '../components/financial/GroupedTable';
import { ReturnToReportButton } from '../components/financial/ReturnToReportButton';
import type { FinancialDrillDownState } from '../components/financial/DrillDownLink';
import { AgingTable }        from '../components/financial/AgingTable';
import { AgingSummaryCards } from '../components/financial/AgingSummaryCards';
import { AgingChart }        from '../components/financial/AgingChart';
import type { AgingBucketData } from '../components/financial/AgingChart';

interface EntityOption { id: number; name: string; code: string; }

const FINANCIAL_TABS = [
  { key: 'statement', label: 'كشف الحساب',    permission: 'statements.read' },
  { key: 'aging',     label: 'أعمار الذمم',   permission: 'aging.read'      },
  { key: 'gl',        label: 'دفتر الأستاذ',  permission: 'gl.read'          },
  { key: 'finreport', label: 'التقارير المالية', permission: 'finreports.read' },
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
  a.href    = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FinancialCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission } = useAuth();

  // ── URL state ────────────────────────────────────────────────────────────────
  const tab        = searchParams.get('tab')        ?? 'statement';
  const entityType = (searchParams.get('entityType') ?? 'customer') as 'customer' | 'supplier';
  const entityId   = searchParams.get('entityId')   ? Number(searchParams.get('entityId')) : null;
  const fromDate   = searchParams.get('fromDate')   ?? '';
  const toDate     = searchParams.get('toDate')     ?? '';
  const search     = searchParams.get('search')     ?? '';

  // Aging-specific URL params
  const agingSubTab   = (searchParams.get('subTab')    ?? 'ar') as 'ar' | 'ap';
  const agingAsOfDate = searchParams.get('asOfDate')   ?? '';
  const agingSearch   = searchParams.get('agingSearch') ?? '';
  const agingHideZero = searchParams.get('hideZero')   === 'true';

  function setParam(key: string, value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }

  // ── Entity list (Statement tab) ───────────────────────────────────────────────
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

  // ── Statement data ───────────────────────────────────────────────────────────
  const [result,    setResult]    = useState<FinancialResponse<StatementRow> | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [viewMode,  setViewMode]  = useState<'flat' | 'grouped'>('flat');
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
      const blob = await financialApi.exportStatement(entityType, entityId, {
        fromDate: fromDate || undefined,
        toDate:   toDate   || undefined,
        search:   search   || undefined,
        format,
      });
      const entity = entities.find(e => e.id === entityId);
      const ext    = format === 'excel' ? 'xlsx' : 'pdf';
      saveBlob(blob, `statement-${entity?.code ?? entityId}.${ext}`);
    } finally {
      setExporting(false);
    }
  }

  // ── Aging data ────────────────────────────────────────────────────────────────
  const [arData,       setArData]       = useState<FinancialResponse<ArAgingRow> | null>(null);
  const [apData,       setApData]       = useState<FinancialResponse<ApAgingRow> | null>(null);
  const [agingLoading, setAgingLoading] = useState(false);
  const [agingError,   setAgingError]   = useState<string | null>(null);
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

  // Auto-load aging when its tab is active
  useEffect(() => {
    if (tab === 'aging') loadAging();
  }, [tab, loadAging]);

  // ── RBAC ─────────────────────────────────────────────────────────────────────
  const visibleTabs = FINANCIAL_TABS.filter(t => hasPermission(t.permission));
  if (visibleTabs.length === 0) {
    return (
      <div className="financial-center" dir="rtl">
        <p className="fc-no-permission">لا توجد صلاحيات لعرض هذا القسم.</p>
      </div>
    );
  }

  const activeTab = visibleTabs.find(t => t.key === tab) ? tab : visibleTabs[0].key;

  // ── DrillDown state ───────────────────────────────────────────────────────────
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

  // ── Computed statement rows ───────────────────────────────────────────────────
  const allRows     = result?.rows ?? [];
  const displayRows = hideSettled
    ? allRows.filter(r => r.status !== 'PAID' && r.status !== 'CANCELLED')
    : allRows;

  // ── Aging chart data ──────────────────────────────────────────────────────────
  const activeAgingData = agingSubTab === 'ar' ? arData : apData;
  const agingChartData: AgingBucketData[] = AGING_BUCKETS.map(b => ({
    ...b,
    amount: activeAgingData
      ? activeAgingData.rows.reduce((s, r) => s + ((r as Record<string, number>)[b.key] ?? 0), 0)
      : 0,
  }));

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

      {/* ── Statement tab ─────────────────────────────────────────────────── */}
      {activeTab === 'statement' && (
        <div className="fc-tab-content">
          <div className="fc-entity-type-toggle">
            <button
              type="button"
              className={`entity-type-btn ${entityType === 'customer' ? 'active' : ''}`}
              onClick={() => { setParam('entityType', 'customer'); setParam('entityId', ''); }}
            >عملاء</button>
            <button
              type="button"
              className={`entity-type-btn ${entityType === 'supplier' ? 'active' : ''}`}
              onClick={() => { setParam('entityType', 'supplier'); setParam('entityId', ''); }}
            >موردون</button>
          </div>

          <div className="fc-entity-selector">
            <label htmlFor="fc-entity-select">{entityType === 'customer' ? 'العميل' : 'المورد'}</label>
            <select id="fc-entity-select" value={entityId ?? ''} onChange={e => setParam('entityId', e.target.value)}
              aria-label={entityType === 'customer' ? 'اختر العميل' : 'اختر المورد'}>
              <option value="">— اختر —</option>
              {entities.map(e => (
                <option key={e.id} value={e.id}>{e.code} — {e.name}</option>
              ))}
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
            {result && (
              <ExportBar
                onExcelExport={() => doExport('excel')}
                onPdfExport={()  => doExport('pdf')}
                loading={exporting}
              />
            )}
          </div>

          {error && <p className="fc-error">{error}</p>}

          {result?.summary && (
            <SummaryCards cards={[
              { label: 'رصيد افتتاحي', value: result.summary.openingBalance, variant: 'neutral' },
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

      {/* ── Aging tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'aging' && (
        <div className="fc-tab-content">
          {/* Sub-tabs */}
          <div className="aging-subtabs">
            <button
              type="button"
              className={`subtab-btn ${agingSubTab === 'ar' ? 'active' : ''}`}
              onClick={() => setParam('subTab', 'ar')}
            >ذمم العملاء</button>
            <button
              type="button"
              className={`subtab-btn ${agingSubTab === 'ap' ? 'active' : ''}`}
              onClick={() => setParam('subTab', 'ap')}
            >ذمم الموردين</button>
          </div>

          {/* Filters */}
          <FilterBar
            search={agingSearch}
            onSearch={v => setParam('agingSearch', v)}
          >
            <div className="filter-field">
              <label htmlFor="aging-as-of-date">حتى تاريخ</label>
              <input
                id="aging-as-of-date"
                type="date"
                title="تاريخ التقرير"
                value={agingAsOfDate}
                onChange={e => setParam('asOfDate', e.target.value)}
              />
            </div>
            <label className="filter-field fc-hide-settled">
              <input
                type="checkbox"
                checked={agingHideZero}
                onChange={e => setParam('hideZero', String(e.target.checked))}
              />
              إخفاء الصفرية
            </label>
          </FilterBar>

          {/* Load button */}
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
                    const blob = agingSubTab === 'ar'
                      ? await financialApi.exportArAging({ asOfDate: agingAsOfDate || undefined, format: 'pdf' })
                      : await financialApi.exportApAging({ asOfDate: agingAsOfDate || undefined, format: 'pdf' });
                    saveBlob(blob, `${agingSubTab}-aging.pdf`);
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
              <AgingTable
                rows={activeAgingData.rows}
                type={agingSubTab}
                currentState={agingDrillDown}
              />
            </>
          )}

          {agingLoading && !activeAgingData && (
            <p className="fc-hint">جارٍ تحميل أعمار الذمم...</p>
          )}
          {!agingLoading && !activeAgingData && !agingError && (
            <p className="fc-hint">اضغط «تحديث» لتحميل أعمار الذمم.</p>
          )}
        </div>
      )}

      {/* ── Placeholder tabs (Parts 4–5) ─────────────────────────────────── */}
      {activeTab !== 'statement' && activeTab !== 'aging' && (
        <div className="fc-tab-content fc-coming-soon">
          <span className="material-symbols-outlined fc-coming-soon-icon">
            construction
          </span>
          <p>قريباً — سيتم إتاحة هذا التقرير في التحديث القادم.</p>
        </div>
      )}
    </div>
  );
}
