import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { financialApi } from '../api/financial';
import type { FinancialResponse, StatementRow } from '../types/financial.types';
import { useAuth } from '../stores/authStore';
import { FinancialTabs } from '../components/financial/FinancialTabs';
import { FilterBar } from '../components/financial/FilterBar';
import { SummaryCards } from '../components/financial/SummaryCards';
import { ExportBar } from '../components/financial/ExportBar';
import { StatementTable } from '../components/financial/StatementTable';
import { GroupedTable } from '../components/financial/GroupedTable';
import { ReturnToReportButton } from '../components/financial/ReturnToReportButton';
import type { FinancialDrillDownState } from '../components/financial/DrillDownLink';

interface EntityOption { id: number; name: string; code: string; }

const FINANCIAL_TABS = [
  { key: 'statement', label: 'كشف الحساب',      permission: 'statements.read'       },
  { key: 'ar-aging',  label: 'مديونيات العملاء', permission: 'aging.read'             },
  { key: 'ap-aging',  label: 'مديونيات الموردين', permission: 'aging.read'            },
  { key: 'gl',        label: 'دفتر الأستاذ',     permission: 'gl.read'                },
  { key: 'finreport', label: 'التقارير المالية',  permission: 'finreports.read'        },
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

  function setParam(key: string, value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }

  // ── Entity list ──────────────────────────────────────────────────────────────
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

  // ── View options ─────────────────────────────────────────────────────────────
  const [viewMode,     setViewMode]     = useState<'flat' | 'grouped'>('flat');
  const [hideSettled,  setHideSettled]  = useState(false);

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

  // Clear result when entity changes
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

  // ── DrillDown state for current view ─────────────────────────────────────────
  const drillDownState: FinancialDrillDownState = {
    returnTo:    '/financial',
    reportLabel: 'كشف الحساب',
    tab:         activeTab,
    entityType,
    entityId:    entityId ?? undefined,
    fromDate:    fromDate || undefined,
    toDate:      toDate   || undefined,
  };

  // ── Computed rows ─────────────────────────────────────────────────────────────
  const allRows     = result?.rows ?? [];
  const displayRows = hideSettled
    ? allRows.filter(r => r.status !== 'PAID' && r.status !== 'CANCELLED')
    : allRows;

  const summary = result?.summary;

  return (
    <div className="financial-center" dir="rtl">
      {/* Return button (shown when returning from drilldown) */}
      <ReturnToReportButton />

      {/* Page header */}
      <div className="fc-header">
        <span className="material-symbols-outlined fc-header-icon">account_balance</span>
        <h1 className="fc-title">المركز المالي</h1>
      </div>

      {/* Tab bar */}
      <FinancialTabs
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={key => setParam('tab', key)}
      />

      {/* ── Statement tab ─────────────────────────────────────────────────── */}
      {activeTab === 'statement' && (
        <div className="fc-tab-content">
          {/* Entity type toggle */}
          <div className="fc-entity-type-toggle">
            <button
              className={`entity-type-btn ${entityType === 'customer' ? 'active' : ''}`}
              onClick={() => {
                setParam('entityType', 'customer');
                setParam('entityId', '');
              }}
            >
              عملاء
            </button>
            <button
              className={`entity-type-btn ${entityType === 'supplier' ? 'active' : ''}`}
              onClick={() => {
                setParam('entityType', 'supplier');
                setParam('entityId', '');
              }}
            >
              موردون
            </button>
          </div>

          {/* Entity selector */}
          <div className="fc-entity-selector">
            <label>{entityType === 'customer' ? 'العميل' : 'المورد'}</label>
            <select
              value={entityId ?? ''}
              onChange={e => setParam('entityId', e.target.value)}
            >
              <option value="">— اختر —</option>
              {entities.map(e => (
                <option key={e.id} value={e.id}>
                  {e.code} — {e.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filters */}
          <FilterBar
            fromDate={fromDate}
            toDate={toDate}
            search={search}
            onFromDate={v => setParam('fromDate', v)}
            onToDate={v   => setParam('toDate',   v)}
            onSearch={v   => setParam('search',   v)}
          />

          {/* Action bar */}
          <div className="fc-action-bar">
            <button className="fc-load-btn" onClick={loadStatement} disabled={!entityId || loading}>
              {loading ? 'جارٍ التحميل...' : 'تحميل'}
            </button>

            <div className="fc-view-toggles">
              <button
                className={`view-mode-btn ${viewMode === 'flat' ? 'active' : ''}`}
                onClick={() => setViewMode('flat')}
              >
                مسطّح
              </button>
              <button
                className={`view-mode-btn ${viewMode === 'grouped' ? 'active' : ''}`}
                onClick={() => setViewMode('grouped')}
              >
                مجمّع
              </button>
            </div>

            <label className="fc-hide-settled">
              <input
                type="checkbox"
                checked={hideSettled}
                onChange={e => setHideSettled(e.target.checked)}
              />
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

          {/* Error */}
          {error && <p className="fc-error">{error}</p>}

          {/* Summary cards */}
          {summary && (
            <SummaryCards cards={[
              { label: 'رصيد افتتاحي',  value: summary.openingBalance,  variant: 'neutral' },
              { label: 'إجمالي المدين',  value: summary.totalDebit,      variant: 'blue'    },
              { label: 'إجمالي الدائن',  value: summary.totalCredit,     variant: 'green'   },
              { label: 'رصيد ختامي',     value: summary.closingBalance,
                variant: (summary.closingBalance ?? 0) < 0 ? 'red' : 'neutral' },
            ]} />
          )}

          {/* Table */}
          {result && displayRows.length > 0 && (
            viewMode === 'grouped'
              ? <GroupedTable rows={displayRows} currentState={drillDownState} />
              : <StatementTable rows={displayRows} currentState={drillDownState} />
          )}
          {result && displayRows.length === 0 && !loading && (
            <p className="fc-empty">لا توجد حركات بالمعايير المحددة.</p>
          )}
          {!entityId && !result && (
            <p className="fc-hint">اختر {entityType === 'customer' ? 'عميلاً' : 'موردًا'} ثم اضغط «تحميل».</p>
          )}
        </div>
      )}

      {/* ── Placeholder tabs (Parts 3–5) ─────────────────────────────────── */}
      {activeTab !== 'statement' && (
        <div className="fc-tab-content fc-coming-soon">
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#9ca3af' }}>
            construction
          </span>
          <p>قريباً — سيتم إتاحة هذا التقرير في التحديث القادم.</p>
        </div>
      )}
    </div>
  );
}
