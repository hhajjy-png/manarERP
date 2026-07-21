import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { formatDate } from '../lib/date';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { downloadBlob } from '../utils/exportUtils';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  StatusChip,
  FilterChip,
  SearchBox,
  SectionCard,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Drawer,
  DrawerSection,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './DocumentExpirationCenter.css';
import { useTableSort } from '../hooks/useTableSort';
import { sortRowsClient } from '../lib/clientSort';
import SortableHeader from '../components/SortableHeader';
import { useT } from '../lib/i18n';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

type DocCategory =
  | 'EMPLOYEE_RESIDENCY'
  | 'EMPLOYEE_PASSPORT'
  | 'EMPLOYEE_DRIVING_LICENSE'
  | 'EMPLOYEE_VEHICLE_LICENSE'
  | 'EQUIPMENT_REGISTRATION'
  | 'EQUIPMENT_INSURANCE'
  | 'CONTRACT_EXPIRY';

type UrgencyBand = 'expired' | '7' | '30' | '60' | '90' | 'ok';

interface ExpirationRecord {
  id: string;
  category: DocCategory;
  entityId: number;
  entityName: string;
  entityCode: string;
  expiryDate: string;
  daysRemaining: number;
  urgency: UrgencyBand;
}

interface ExpirationSummary {
  expired: number;
  days7: number;
  days30: number;
  days60: number;
  days90: number;
  total: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Lookup tables
// ─────────────────────────────────────────────────────────────────────────────

type TFn = (key: string, vars?: Record<string, string | number>) => string;

const CATEGORY_KEY: Record<string, string> = {
  EMPLOYEE_RESIDENCY:       'decx.cat.employee_residency',
  EMPLOYEE_PASSPORT:        'decx.cat.employee_passport',
  EMPLOYEE_DRIVING_LICENSE: 'decx.cat.employee_driving_license',
  EMPLOYEE_VEHICLE_LICENSE: 'decx.cat.employee_vehicle_license',
  EQUIPMENT_REGISTRATION:   'decx.cat.equipment_registration',
  EQUIPMENT_INSURANCE:      'decx.cat.equipment_insurance',
  CONTRACT_EXPIRY:          'decx.cat.contract_expiry',
};

function categoryLabel(t: TFn, category: string): string {
  const key = CATEGORY_KEY[category];
  return key ? t(key) : category;
}

const CATEGORY_ICON: Record<string, string> = {
  EMPLOYEE_RESIDENCY:       'badge',
  EMPLOYEE_PASSPORT:        'travel_explore',
  EMPLOYEE_DRIVING_LICENSE: 'directions_car',
  EMPLOYEE_VEHICLE_LICENSE: 'local_shipping',
  EQUIPMENT_REGISTRATION:   'agriculture',
  EQUIPMENT_INSURANCE:      'verified_user',
  CONTRACT_EXPIRY:          'description',
};

const URGENCY_KEY: Record<string, string> = {
  expired: 'status.expired',
  '7':     'decx.urgency.7d',
  '30':    'page.dashboard.within_30',
  '60':    'decx.urgency.60d',
  '90':    'decx.urgency.90d',
  ok:      'decx.urgency.ok',
};

function urgencyLabel(t: TFn, urgency: string): string {
  const key = URGENCY_KEY[urgency];
  return key ? t(key) : urgency;
}

function categoryOptions(t: TFn) {
  return Object.entries(CATEGORY_KEY).map(([value, key]) => ({ value, label: t(key) }));
}

// رتبة شدّة الاستعجال للفرز — الأشد أولًا تصاعديًا (وليس ترتيبًا أبجديًا)
const URGENCY_RANK: Record<UrgencyBand, number> = { expired: 0, '7': 1, '30': 2, '60': 3, '90': 4, ok: 5 };

function urgencyOptions(t: TFn): { value: string; label: string }[] {
  return [
    { value: 'all',     label: t('decx.filter.all') },
    { value: 'expired', label: t('decx.filter.expired') },
    { value: '7',       label: t('decx.filter.within_7') },
    { value: '30',      label: t('decx.filter.within_30') },
    { value: '60',      label: t('decx.filter.within_60') },
    { value: '90',      label: t('decx.filter.within_90') },
    { value: 'ok',      label: t('decx.filter.ok') },
  ];
}

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

function urgencyTone(u: string): Tone {
  if (u === 'expired' || u === '7') return 'red';
  if (u === '30' || u === '60')     return 'orange';
  if (u === '90')                   return 'blue';
  return 'green';
}

function daysClass(u: string): string {
  if (u === 'expired' || u === '7') return 'decx-days--expired';
  if (u === '30' || u === '60' || u === '90') return 'decx-days--soon';
  return 'decx-days--ok';
}

// اللون مشتقّ من نفس سلّم الأولوية (urgencyTone) ورموز ExplorerKit (--xpl-*) —
// يتفادى سلّم ألوان مكرّرًا ويضمن اتساق الثيم بين الوضعين الفاتح والداكن.
function urgencyVar(u: string): string {
  return `var(--xpl-${urgencyTone(u)})`;
}

function daysLabel(t: TFn, d: number): string {
  return d < 0 ? t('decx.days_overdue', { days: Math.abs(d) }) : t('decx.days_remaining', { days: d });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main page component
// ─────────────────────────────────────────────────────────────────────────────

export default function DocumentExpirationCenter() {
  const { t } = useT();
  const [summary, setSummary] = useState<ExpirationSummary | null>(null);
  const [records, setRecords] = useState<ExpirationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Filters
  const [urgency, setUrgency] = useState('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

  // Drawer
  const [selected, setSelected] = useState<ExpirationRecord | null>(null);

  // فرز محلي موحّد (Enterprise Data Grid Foundation v1) — يُطبَّق بعد فلاتر الخادم؛
  // «نوع الوثيقة» يُفرز بالتسمية العربية المعروضة و«الحالة» برتبة الاستعجال لا أبجديًا.
  const sort = useTableSort('expirations');
  const sortedRecords = useMemo(
    () => sortRowsClient(records, sort.sortBy, sort.sortDir, (r, key) => {
      if (key === 'category') return categoryLabel(t, r.category);
      if (key === 'urgency') return URGENCY_RANK[r.urgency];
      return (r as unknown as Record<string, unknown>)[key];
    }),
    [records, sort.sortBy, sort.sortDir, t],
  );

  const loadSummary = useCallback(() => {
    api
      .get<{ data: ExpirationSummary }>('/expirations/summary')
      .then(r => setSummary(r.data.data))
      .catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    setLoading(true);
    setError('');
    const params: Record<string, string> = {};
    if (urgency)  params.urgency  = urgency;
    if (category) params.category = category;
    if (search)   params.search   = search;

    api
      .get<{ data: ExpirationRecord[] }>('/expirations', { params })
      .then(r => setRecords(r.data.data))
      .catch(() => setError(t('decx.err.load_failed')))
      .finally(() => setLoading(false));
  }, [urgency, category, search]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function handleExport() {
    setExporting(true);
    const params: Record<string, string> = {};
    if (urgency)  params.urgency  = urgency;
    if (category) params.category = category;
    if (search)   params.search   = search;

    try {
      const res = await api.get('/expirations/export', { params, responseType: 'blob' });
      downloadBlob(res.data as Blob, generateExportFileName({ reportName: ReportName.DocumentExpirations, extension: 'xlsx' }));
    } catch {
      setError(t('decx.err.export_failed'));
    } finally {
      setExporting(false);
    }
  }

  function resetFilters() {
    setUrgency('all');
    setCategory('');
    setSearch('');
  }

  const hasFilters = urgency !== 'all' || category !== '' || search !== '';

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (urgency !== 'all') chips.push({ key: 'u', label: urgencyLabel(t, urgency), clear: () => setUrgency('all') });
    if (category) chips.push({ key: 'c', label: categoryLabel(t, category), clear: () => setCategory('') });
    if (search) chips.push({ key: 's', label: `${t('decx.search_prefix')}${search}`, clear: () => setSearch('') });
    return chips;
  }, [urgency, category, search, t]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="xpl-scope xpl-page">

      {/* ── Document detail drawer ── */}
      {selected && (
        <Drawer
          title={t('decx.drawer.title')}
          onClose={() => setSelected(null)}
          hero={
            <div className="xpl-drawer-hero">
              <div className="xpl-drawer-hero-icon">
                <span className="material-symbols-outlined" aria-hidden="true">{CATEGORY_ICON[selected.category] ?? 'description'}</span>
              </div>
              <div className="xpl-drawer-hero-body">
                <span className="xpl-drawer-hero-title">{selected.entityName}</span>
                <span className="xpl-drawer-hero-sub">{categoryLabel(t, selected.category)}</span>
                <div style={{ marginTop: 4 }}>
                  <StatusChip tone={urgencyTone(selected.urgency)} icon={selected.daysRemaining < 0 ? 'event_busy' : 'schedule'}>
                    {urgencyLabel(t, selected.urgency)}
                  </StatusChip>
                </div>
              </div>
            </div>
          }
          footer={<Button variant="ghost" icon="close" onClick={() => setSelected(null)}>{t('action.close')}</Button>}
        >
          <DrawerSection title={t('decx.section.entity_data')}>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">{t('col.fullname')}</span>
              <span className="xpl-drawer-field-value">{selected.entityName}</span>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">{t('decx.col.entity_code')}</span>
              <span className="xpl-drawer-field-value mono">{selected.entityCode || '—'}</span>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">{t('decx.col.doc_type')}</span>
              <span className="xpl-drawer-field-value">{categoryLabel(t, selected.category)}</span>
            </div>
          </DrawerSection>

          <DrawerSection title={t('decx.section.validity')}>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">{t('decx.col.expiry_date')}</span>
              <span className="xpl-drawer-field-value">{formatDate(selected.expiryDate)}</span>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">{t('decx.col.days_remaining')}</span>
              <span className={`xpl-drawer-field-value ${daysClass(selected.urgency)}`} style={{ color: urgencyVar(selected.urgency) }}>
                {daysLabel(t, selected.daysRemaining)}
              </span>
            </div>
            <div className="xpl-drawer-field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <span className="xpl-drawer-field-label">{t('decx.timeline_indicator')}</span>
              <div className="decx-gauge">
                <div
                  className="decx-gauge-fill"
                  style={{
                    width: `${Math.max(4, Math.min(100, (selected.daysRemaining / 90) * 100))}%`,
                    background: urgencyVar(selected.urgency),
                  }}
                />
              </div>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">{t('col.status')}</span>
              <span className="xpl-drawer-field-value">
                <StatusChip tone={urgencyTone(selected.urgency)}>{urgencyLabel(t, selected.urgency)}</StatusChip>
              </span>
            </div>
          </DrawerSection>

          <DrawerSection title={t('section.quick_actions_panel')}>
            <div className="decx-drawer-actions">
              <Button variant="secondary" icon="filter_alt" block onClick={() => { setCategory(selected.category); setSelected(null); }}>
                {t('decx.filter_by_type')}
              </Button>
              <Button variant="ghost" icon="download" block busy={exporting} onClick={handleExport}>
                {t('decx.export_current_results')}
              </Button>
            </div>
          </DrawerSection>
        </Drawer>
      )}

      {/* ── Executive header ── */}
      <ExecutiveHeader
        icon="event_busy"
        title={t('decx.header.title')}
        subtitle={t('decx.header.subtitle')}
        chips={
          summary ? (
            <>
              <IdChip icon="inventory_2" tone="indigo">{t('decx.chip.tracked_docs', { count: summary.total })}</IdChip>
              <IdChip icon="event_busy" tone="red">{t('decx.chip.expired', { count: summary.expired })}</IdChip>
              <IdChip icon="warning" tone="orange">{t('decx.chip.expiring_soon', { count: summary.days7 + summary.days30 })}</IdChip>
            </>
          ) : undefined
        }
        aside={
          <Button variant="primary" icon="download" busy={exporting} onClick={handleExport}>
            {t('page.salaries.export_excel')}
          </Button>
        }
      />

      {/* ── KPI hero + clickable urgency grid ── */}
      {summary && (
        <div className="decx-metrics">
          <HeroMetric
            icon="fact_check"
            label={t('decx.metric.total_tracked')}
            value={summary.total}
            sub={<><span className="material-symbols-outlined">priority_high</span>{t('decx.metric.expired_urgent', { count: summary.expired })}</>}
          />
          <div className="decx-metrics-secondary">
            <MetricCard icon="event_busy" tone="red" label={t('decx.filter.expired')} value={summary.expired}
              onClick={() => setUrgency('expired')} active={urgency === 'expired'} ariaLabel={t('decx.aria.view_expired')} />
            <MetricCard icon="hourglass_bottom" tone="red" label={urgencyLabel(t, '7')} value={summary.days7}
              onClick={() => setUrgency('7')} active={urgency === '7'} ariaLabel={t('decx.aria.view_within', { days: 7 })} />
            <MetricCard icon="schedule" tone="orange" label={urgencyLabel(t, '30')} value={summary.days30}
              onClick={() => setUrgency('30')} active={urgency === '30'} ariaLabel={t('decx.aria.view_within', { days: 30 })} />
            <MetricCard icon="calendar_month" tone="orange" label={urgencyLabel(t, '60')} value={summary.days60}
              onClick={() => setUrgency('60')} active={urgency === '60'} ariaLabel={t('decx.aria.view_within', { days: 60 })} />
            <MetricCard icon="event_available" tone="blue" label={urgencyLabel(t, '90')} value={summary.days90}
              onClick={() => setUrgency('90')} active={urgency === '90'} ariaLabel={t('decx.aria.view_within', { days: 90 })} />
          </div>
        </div>
      )}

      {/* ── Sticky filter toolbar ── */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={setSearch} placeholder={t('decx.search.placeholder')} ariaLabel={t('decx.search.aria')} />
          <div className="xpl-field" style={{ minWidth: 190 }}>
            <span className="xpl-field-label">{t('decx.col.doc_type')}</span>
            <select className="xpl-select" aria-label={t('decx.col.doc_type')} value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">{t('decx.filter.all_types')}</option>
              {categoryOptions(t).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {hasFilters && (
            <Button variant="ghost" icon="restart_alt" onClick={resetFilters}>{t('decx.reset')}</Button>
          )}
        </div>
        <div className="xpl-toolbar-row">
          {urgencyOptions(t).map(o => (
            <FilterChip key={o.value} active={urgency === o.value} onClick={() => setUrgency(o.value)}>
              {o.label}
            </FilterChip>
          ))}
        </div>
        <div className="xpl-active-row">
          <div className="xpl-active-chips">
            {activeChips.length === 0 ? (
              <span className="xpl-result-count">{t('decx.no_filters_applied')}</span>
            ) : (
              activeChips.map(c => (
                <span key={c.key} className="xpl-active-chip">
                  {c.label}
                  <button type="button" onClick={c.clear} aria-label={t('decx.aria.remove_filter', { label: c.label })}>
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </span>
              ))
            )}
          </div>
          <span className="xpl-result-count">{t('decx.result_count', { count: records.length })}</span>
        </div>
      </div>

      {/* ── Error ── */}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* ── Timeline table ── */}
      <SectionCard title={t('decx.section.timeline')} icon="table_rows" padded={false}>
        {loading ? (
          <div className="xpl-card--pad"><SkeletonRows rows={6} /></div>
        ) : records.length === 0 ? (
          <EmptyState
            icon="event_available"
            tone="neutral"
            title={t('decx.empty.title')}
            message={t('decx.empty.message')}
            action={hasFilters ? <Button variant="secondary" icon="restart_alt" onClick={resetFilters}>{t('decx.reset_filters_btn')}</Button> : undefined}
          />
        ) : (
          <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table className="xpl-table">
              <thead>
                <tr>
                  <SortableHeader label={t('decx.col.doc_type')} title={t('decx.col.doc_type')} state={sort.getState('category')} onToggle={() => sort.toggle('category')} />
                  <SortableHeader label={t('decx.col.entity')} title={t('decx.col.entity')} state={sort.getState('entityName')} onToggle={() => sort.toggle('entityName')} />
                  <SortableHeader label={t('decx.col.expiry_date')} title={t('decx.col.expiry_date')} state={sort.getState('expiryDate')} onToggle={() => sort.toggle('expiryDate')} />
                  <SortableHeader label={t('decx.col.days_remaining')} title={t('decx.col.days_remaining')} state={sort.getState('daysRemaining')} onToggle={() => sort.toggle('daysRemaining')} />
                  <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('urgency')} onToggle={() => sort.toggle('urgency')} />
                  <th aria-label={t('decx.aria.open')} />
                </tr>
              </thead>
              <tbody>
                {sortedRecords.map(r => (
                  <tr
                    key={r.id}
                    className="xpl-row--click"
                    tabIndex={0}
                    role="button"
                    aria-label={t('decx.aria.row_details', { category: categoryLabel(t, r.category), entity: r.entityName })}
                    onClick={() => setSelected(r)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(r); } }}
                  >
                    <td>
                      <span className="decx-cat-cell">
                        <span className="decx-cat-icon">
                          <span className="material-symbols-outlined" aria-hidden="true">{CATEGORY_ICON[r.category] ?? 'description'}</span>
                        </span>
                        {categoryLabel(t, r.category)}
                      </span>
                    </td>
                    <td>
                      <span className="decx-entity">
                        <span className="decx-entity-name">{r.entityName}</span>
                        {r.entityCode && <span className="decx-entity-code">{r.entityCode}</span>}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.expiryDate)}</td>
                    <td><span className={`decx-days ${daysClass(r.urgency)}`}>{daysLabel(t, r.daysRemaining)}</span></td>
                    <td><StatusChip tone={urgencyTone(r.urgency)}>{urgencyLabel(t, r.urgency)}</StatusChip></td>
                    <td className="xpl-col-chevron"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && records.length > 0 && (
          <div className="xpl-card--pad" style={{ borderTop: '1px solid var(--xpl-border)', fontSize: 12.5, color: 'var(--xpl-muted)' }}>
            {t('decx.total_results_shown')}{records.length}
          </div>
        )}
      </SectionCard>

    </div>
  );
}
