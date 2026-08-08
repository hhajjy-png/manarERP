import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useUI } from '../stores/uiStore';
import { resolveName } from '../lib/resolveName';
import { useToast } from '../stores/toastStore';
import { persistPreference } from '../lib/syncedPreferences';
import { formatDate, formatDisplayDate } from '../lib/date';
import { PageMeta } from '../components/DataTable';
import DateInput from '../components/DateInput';
import { money, MoneyText, MoneyCell } from '../config/modules';
import ForceDeleteProjectPriceModal from '../components/ForceDeleteProjectPriceModal';
import ConfirmModal from '../components/ConfirmModal';
import { downloadBlob } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import {
  ExecutiveHeader,
  IdChip,
  MetricCard,
  SectionCard,
  SearchBox,
  FilterChip,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Pagination,
  Drawer,
  DrawerSection,
  DrawerField,
  Dialog,
  DialogSection,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Prices.css';
import { useTableSort } from '../hooks/useTableSort';
import SortableHeader from '../components/SortableHeader';
import { fcMoneyHeader } from '../components/financial/financialLabels';

const contractUnits = ['طن', 'درب', 'معالجات', 'يومية', 'مقطوعية'] as const;

// ── تفضيل عرض «لوحة الاتفاقيات» ───────────────────────────────────────────────
// تفضيل واجهة فقط (لا بيانات ولا منطق) يُحفظ محليًا بنفس أسلوب وضع القائمة
// الجانبية في uiStore. قيمة غائبة أو غير صالحة ⇒ اللوحة ظاهرة كما كانت دائمًا.
const AGREEMENTS_BOARD_KEY = 'manarERP.prices.agreementsBoard';
const AGREEMENTS_BOARD_ID = 'prices-agreements-board';

function readBoardVisible(): boolean {
  try {
    return localStorage.getItem(AGREEMENTS_BOARD_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

function writeBoardVisible(visible: boolean) {
  try {
    // Zero Data Loss Certification Pack v1 — يُحفظ في قاعدة البيانات أيضًا فينتقل مع الجهاز.
    persistPreference(AGREEMENTS_BOARD_KEY, visible ? 'shown' : 'hidden');
  } catch {
    /* التخزين غير متاح — الجلسة الحالية تعمل، والاستعادة وحدها ما يضيع */
  }
}

interface PricesStats { count: number; customerCount: number; lastUpdatedAt: string | null; }
interface UsageRow { id: number; asphaltPlant: string; companyName: string; contractLocation: string; contractUnit: string; unitPrice: number; customer: { id: number; name: string } | null; usageCount: number; totalQuantity: number; totalAmount: number; }
interface UsageReport { report: UsageRow[]; hasDirectTracking: boolean; note: string; }
interface CompanyUsageRow { companyName: string; agreementCount: number; usageCount: number; totalQuantity: number; totalAmount: number; }
interface AgreementRow { id: number; asphaltPlant: string; companyName: string; contractLocation: string; contractUnit: string; unitPrice: number; validUntil: string | null; customer: { id: number; name: string } | null; usageCount: number; totalQuantity: number; totalAmount: number; }
interface AgreementsDashboard { totalAgreements: number; unusedCount: number; expiringCount: number; unused: AgreementRow[]; expiring: AgreementRow[]; top5: AgreementRow[]; least5: AgreementRow[]; }

export default function Prices() {
  const { hasPermission, isSystemAdmin: getIsSystemAdmin } = useAuth();
  const isSystemAdmin = getIsSystemAdmin();
  const { t } = useT();
  const lang = useUI((s) => s.lang);
  const toast = useToast();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterPlant, setFilterPlant] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  // فرز الأعمدة الموحّد (خادمي — القائمة الرئيسية فقط) — فرز جديد يعيد إلى الصفحة الأولى.
  const sort = useTableSort('prices', () => setPage(1));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [customers, setCustomers] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewing, setViewing] = useState<any | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [forceDeleteCandidate, setForceDeleteCandidate] = useState<{ id: number; asphaltPlant: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [archiveConfirmId, setArchiveConfirmId] = useState<number | null>(null);

  const [stats, setStats] = useState<PricesStats | null>(null);
  const [usageReport, setUsageReport] = useState<UsageReport | null>(null);
  const [showUsage, setShowUsage] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [companyUsage, setCompanyUsage] = useState<CompanyUsageRow[]>([]);
  const [companyUsageLoading, setCompanyUsageLoading] = useState(false);
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [agreementsDashboard, setAgreementsDashboard] = useState<AgreementsDashboard | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'unused' | 'expiring' | 'top5' | 'least5'>('unused');
  const [boardVisible, setBoardVisible] = useState(readBoardVisible);

  function toggleBoard() {
    const next = !boardVisible;
    writeBoardVisible(next);
    setBoardVisible(next);
  }

  useEffect(() => {
    api.get('/customers', { params: { pageSize: 200 } }).then((res) => setCustomers(res.data.data.data ?? [])).catch(() => {});
  }, []);

  const loadStats = useCallback(() => {
    api.get('/prices/stats').then((res) => setStats(res.data.data)).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    api.get('/prices/agreements-dashboard').then((res) => setAgreementsDashboard(res.data.data ?? null)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/prices', {
        params: { page, pageSize: 20, search: search || undefined, asphaltPlant: filterPlant || undefined, companyName: filterCompany || undefined, contractUnit: filterUnit || undefined, customerId: filterCustomer || undefined, ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}) },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterPlant, filterCompany, filterUnit, filterCustomer, sort.sortBy, sort.sortDir]);
  useEffect(() => { load(); }, [load]);

  async function loadUsageReport() {
    setUsageLoading(true);
    try {
      const res = await api.get('/prices/usage-report');
      setUsageReport(res.data.data);
      setShowUsage(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUsageLoading(false);
    }
  }

  const loadCompanyUsage = useCallback(async () => {
    setCompanyUsageLoading(true);
    try {
      const res = await api.get('/prices/usage/by-company');
      setCompanyUsage(res.data.data ?? []);
    } catch { /* silent */ } finally {
      setCompanyUsageLoading(false);
    }
  }, []);

  async function exportExcel() {
    if (!hasPermission('reports.export')) return;
    setExportBusy(true);
    try {
      const res = await api.get('/reports/prices/export', { params: { format: 'excel' }, responseType: 'blob' });
      downloadBlob(res.data as Blob, generateExportFileName({ reportName: ReportName.PriceAgreements, extension: 'xlsx' }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExportBusy(false);
    }
  }

  function archiveRow(id: number) { setArchiveConfirmId(id); }
  async function executeArchive(id: number) {
    setArchiveConfirmId(null);
    if (busy) return; setBusy(true);
    try { await api.delete(`/prices/${id}`); toast.ok(t('msg.price.archived')); setViewing(null); load(); loadStats(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  function resetFilters() {
    setSearch(''); setFilterPlant(''); setFilterCompany(''); setFilterUnit(''); setFilterCustomer(''); setPage(1);
    sort.reset();
  }
  const hasFilters = !!(search || filterPlant || filterCompany || filterUnit || filterCustomer);

  const dashTabs = useMemo(() => ([
    { key: 'unused' as const, label: `${t('lbl.prices.dash_unused')}${agreementsDashboard ? ` (${agreementsDashboard.unusedCount})` : ''}` },
    { key: 'expiring' as const, label: `${t('lbl.prices.dash_expiring')}${agreementsDashboard ? ` (${agreementsDashboard.expiringCount})` : ''}` },
    { key: 'top5' as const, label: t('lbl.prices.dash_top5') },
    { key: 'least5' as const, label: t('lbl.prices.dash_least5') },
  ]), [agreementsDashboard, t]);

  return (
    <div className="xpl-scope xpl-page">
      <ExecutiveHeader
        icon="sell"
        title={t('page.prices.title')}
        subtitle={t('page.prices.subtitle')}
        chips={stats ? (
          <>
            <IdChip icon="handshake" tone="indigo">{stats.count} {t('unit.agreement')}</IdChip>
            <IdChip icon="groups" tone="green">{stats.customerCount} {t('unit.customer')}</IdChip>
          </>
        ) : undefined}
        aside={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {hasPermission('prices.create') && <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('page.prices.create')}</Button>}
            <Button variant="secondary" icon="insights" busy={usageLoading} onClick={loadUsageReport}>{t('agreements.usage.title')}</Button>
          </div>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {stats && (
        <div className="xpl-kpi-grid">
          <MetricCard icon="handshake" tone="indigo" label={t('agreements.stats.count')} value={stats.count} />
          <MetricCard icon="groups" tone="green" label={t('agreements.stats.customers')} value={stats.customerCount} />
          {/* التاريخ أطول من رقم مجرّد؛ فيُعرض بخط أهدأ (−20%) دون مسّ البطاقتين المجاورتين. */}
          <MetricCard icon="update" tone="blue" label={t('agreements.stats.last_updated')} value={<span className="prx-kpi-date">{stats.lastUpdatedAt ? formatDate(stats.lastUpdatedAt) : '—'}</span>} />
        </div>
      )}

      {/* Agreements dashboard */}
      {agreementsDashboard && (
        <SectionCard
          title={t('sec.prices.agreements_board')}
          icon="dashboard"
          padded={boardVisible}
          actions={
            <Button
              variant="ghost"
              small
              icon={boardVisible ? 'visibility_off' : 'visibility'}
              onClick={toggleBoard}
              aria-expanded={boardVisible}
              aria-controls={AGREEMENTS_BOARD_ID}
            >
              {boardVisible ? t('action.hide') : t('action.show')}
            </Button>
          }
        >
          <div id={AGREEMENTS_BOARD_ID} hidden={!boardVisible}>
            <div className="xpl-toolbar-row" style={{ marginBottom: 12 }}>
              {dashTabs.map((tb) => (
                <FilterChip key={tb.key} active={dashboardTab === tb.key} onClick={() => setDashboardTab(tb.key)}>{tb.label}</FilterChip>
              ))}
            </div>
            <AgreementMiniTable rows={agreementsDashboard[dashboardTab]} t={t} />
          </div>
        </SectionCard>
      )}

      {/* Sticky filters */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('page.prices.search')} ariaLabel={t('page.prices.search')} />
          <div className="xpl-field" style={{ minWidth: 170 }}>
            <span className="xpl-field-label">{t('col.customer')}</span>
            <select className="xpl-select" aria-label={t('col.customer')} value={filterCustomer} onChange={(e) => { setFilterCustomer(e.target.value); setPage(1); }}>
              <option value="">{t('opt.all_customers')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{resolveName(c, lang)}</option>)}
            </select>
          </div>
          <div className="xpl-field" style={{ minWidth: 150 }}>
            <span className="xpl-field-label">{t('filter.prices.plant')}</span>
            <input className="xpl-input" aria-label={t('filter.prices.plant')} value={filterPlant} onChange={(e) => { setFilterPlant(e.target.value); setPage(1); }} />
          </div>
          <div className="xpl-field" style={{ minWidth: 150 }}>
            <span className="xpl-field-label">{t('filter.prices.company')}</span>
            <input className="xpl-input" aria-label={t('filter.prices.company')} value={filterCompany} onChange={(e) => { setFilterCompany(e.target.value); setPage(1); }} />
          </div>
          {hasPermission('reports.export') && (
            <Button
              variant="secondary"
              icon="table_view"
              busy={exportBusy}
              onClick={exportExcel}
              style={exportBusy ? undefined : { color: '#217346' }}
            >
              Excel
            </Button>
          )}
        </div>
        <div className="xpl-toolbar-row">
          <FilterChip active={filterUnit === ''} onClick={() => { setFilterUnit(''); setPage(1); }}>{t('opt.all')}</FilterChip>
          {contractUnits.map((u) => <FilterChip key={u} active={filterUnit === u} onClick={() => { setFilterUnit(u); setPage(1); }}>{u}</FilterChip>)}
          {hasFilters && <button type="button" className="xpl-clear-link" onClick={resetFilters}>{t('action.reset_filters')}</button>}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{meta?.total ?? rows.length} {t('unit.result')}</span>
        </div>
      </div>

      {/* Table */}
      <section className="xpl-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon="sell" tone="neutral" title={t('empty.prices')}
            message={hasFilters ? t('empty.prices.no_match_filters') : undefined}
            action={hasFilters ? <Button variant="secondary" icon="restart_alt" onClick={resetFilters}>{t('action.reset_filters')}</Button>
              : hasPermission('prices.create') ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('page.prices.create')}</Button> : undefined} />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table">
                <thead>
                  <tr>
                    <SortableHeader label={t('col.customer')} title={t('col.customer')} state={sort.getState('customer')} onToggle={() => sort.toggle('customer')} />
                    <SortableHeader label={t('col.prices.plant')} title={t('col.prices.plant')} state={sort.getState('asphaltPlant')} onToggle={() => sort.toggle('asphaltPlant')} />
                    <SortableHeader label={t('col.prices.company')} title={t('col.prices.company')} state={sort.getState('companyName')} onToggle={() => sort.toggle('companyName')} />
                    <SortableHeader label={t('col.prices.location')} title={t('col.prices.location')} state={sort.getState('contractLocation')} onToggle={() => sort.toggle('contractLocation')} />
                    <SortableHeader label={t('col.prices.unit')} title={t('col.prices.unit')} state={sort.getState('contractUnit')} onToggle={() => sort.toggle('contractUnit')} />
                    <SortableHeader label={fcMoneyHeader(t('col.prices.unit_price'))} title={t('col.prices.unit_price')} state={sort.getState('unitPrice')} onToggle={() => sort.toggle('unitPrice')} />
                    {/* غير قابل للفرز عمدًا: الفرز يمرّ بقائمة بيضاء في الخادم
                        (PRICES_SORTABLE)، وإضافة مفتاح إليها تغيير في سلوك الـ API
                        وهذه الحزمة إضافة حقل لا توسيع للواجهة البرمجية. */}
                    <th title={t('col.prices.owner_price')}>{fcMoneyHeader(t('col.prices.owner_price'))}</th>
                    <th aria-label={t('a11y.open_row')} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="xpl-row--click" tabIndex={0} role="button"
                      aria-label={t('a11y.price_details', { plant: r.asphaltPlant })}
                      onClick={() => setViewing(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                      <td>{r.customer ? resolveName(r.customer, lang) : <span style={{ color: 'var(--xpl-muted)' }}>—</span>}</td>
                      <td><strong>{r.asphaltPlant}</strong></td>
                      <td>{r.companyName}</td>
                      <td>{r.contractLocation}</td>
                      <td>{r.contractUnit}</td>
                      <td style={{ fontWeight: 700 }}>{<MoneyCell value={r.unitPrice} />}</td>
                      {/* اتفاقية لم يُسجَّل لها سعر صاحب معدة تُعرض «—» لا «0.000»:
                          الصفر رقم يوهم بأن العمل بلا تكلفة، والشرطة تقول «غير مسجَّل». */}
                      <td>{r.equipmentOwnerPrice ? <MoneyCell value={r.equipmentOwnerPrice} /> : <span style={{ color: 'var(--xpl-muted)' }}>—</span>}</td>
                      <td className="decx-col-chevron" style={{ width: 32, textAlign: 'center' }}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, color: 'var(--xpl-muted)' }}>chevron_left</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </section>

      {/* Price drawer */}
      {viewing && (
        <Drawer
          title={viewing.asphaltPlant}
          onClose={() => setViewing(null)}
          hero={
            <div className="xpl-drawer-hero">
              <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">sell</span></div>
              <div className="xpl-drawer-hero-body">
                <span className="xpl-drawer-hero-title">{<MoneyText value={viewing.unitPrice} />} / {viewing.contractUnit}</span>
                <span className="xpl-drawer-hero-sub">{viewing.asphaltPlant} · {viewing.companyName}</span>
              </div>
            </div>
          }
          footer={
            <>
              {hasPermission('prices.update') && <Button variant="primary" icon="edit" onClick={() => { setEditing(viewing); setViewing(null); }}>{t('action.edit')}</Button>}
              {hasPermission('prices.delete') && <Button variant="secondary" icon="archive" busy={busy} onClick={() => archiveRow(viewing.id)}>{t('action.delete')}</Button>}
              {isSystemAdmin && <Button variant="danger" icon="delete_forever" onClick={() => setForceDeleteCandidate({ id: viewing.id, asphaltPlant: viewing.asphaltPlant })}>{t('action.force_delete')}</Button>}
            </>
          }
        >
          <DrawerSection title={t('sec.prices.project_customer')}>
            <DrawerField label={t('col.prices.plant')} value={viewing.asphaltPlant} />
            <DrawerField label={t('col.customer')} value={viewing.customer ? resolveName(viewing.customer, lang) : '—'} />
            <DrawerField label={t('col.prices.company')} value={viewing.companyName} />
            <DrawerField label={t('col.prices.location')} value={viewing.contractLocation} />
          </DrawerSection>
          <DrawerSection title={t('sec.pricing')}>
            <DrawerField label={t('col.prices.unit')} value={viewing.contractUnit} />
            <DrawerField label={t('col.prices.unit_price')} value={<MoneyText value={viewing.unitPrice} />} />
            <DrawerField
              label={t('col.prices.owner_price')}
              value={viewing.equipmentOwnerPrice ? <MoneyText value={viewing.equipmentOwnerPrice} /> : '—'}
            />
            {viewing.validUntil && <DrawerField label={t('field.valid_until')} value={<span className="prx-valid">{formatDisplayDate(viewing.validUntil)}</span>} />}
          </DrawerSection>
        </Drawer>
      )}

      {creating && <PriceForm customers={customers} onClose={() => setCreating(false)} onSaved={() => { toast.ok(t('msg.price.saved')); load(); loadStats(); }} />}
      {editing && <PriceForm customers={customers} price={editing} onClose={() => setEditing(null)} onSaved={() => { toast.ok(t('msg.price.saved')); load(); loadStats(); }} />}

      {forceDeleteCandidate && (
        <ForceDeleteProjectPriceModal
          priceId={forceDeleteCandidate.id}
          onClose={() => setForceDeleteCandidate(null)}
          onDeleted={() => { setForceDeleteCandidate(null); setViewing(null); load(); loadStats(); }}
        />
      )}

      {/* Usage report dialog */}
      {showUsage && usageReport && (
        <Dialog
          icon="insights"
          title={t('agreements.usage.title')}
          size="xl"
          onClose={() => { setShowUsage(false); setGroupByCompany(false); }}
          footer={<Button variant="ghost" icon="close" onClick={() => { setShowUsage(false); setGroupByCompany(false); }}>{t('action.close')}</Button>}
        >
          <div className="prx-note">
            <span className="material-symbols-outlined">info</span>
            <div>
              {t('agreements.usage.note')}
              {usageReport.hasDirectTracking && <div className="prx-note-ok">{t('hint.prices.direct_tracking')}</div>}
            </div>
          </div>

          <div className="xpl-toolbar-row">
            <FilterChip active={!groupByCompany} onClick={() => setGroupByCompany(false)}>{t('lbl.prices.detail_view')}</FilterChip>
            <FilterChip active={groupByCompany} onClick={() => { setGroupByCompany(true); loadCompanyUsage(); }}>{t('lbl.prices.group_by_company')}</FilterChip>
          </div>

          {!groupByCompany ? (
            <div className="xpl-table-wrap" style={{ maxHeight: '52vh' }}>
              <table className="prx-mini">
                <thead>
                  <tr>
                    <th>{t('agreements.usage.col.agreement')}</th>
                    <th>{t('agreements.usage.col.customer')}</th>
                    <th>{t('agreements.usage.col.unit')}</th>
                    <th>{fcMoneyHeader(t('agreements.usage.col.price'))}</th>
                    <th className="prx-center">{t('agreements.usage.col.count')}</th>
                    <th className="prx-center">{t('agreements.usage.col.qty')}</th>
                    <th>{fcMoneyHeader(t('agreements.usage.col.amount'))}</th>
                  </tr>
                </thead>
                <tbody>
                  {usageReport.report.map((row) => (
                    <tr key={row.id}>
                      <td><div style={{ fontWeight: 700 }}>{row.asphaltPlant}</div><div className="prx-mini-sub">{row.contractLocation}</div></td>
                      <td>{row.customer ? resolveName(row.customer, lang) : '—'}</td>
                      <td>{row.contractUnit}</td>
                      <td>{<MoneyCell value={row.unitPrice} />}</td>
                      <td className="prx-center"><span className={`prx-usage-badge${row.usageCount > 0 ? ' active' : ''}`}>{row.usageCount}</span></td>
                      <td className="prx-center">{row.usageCount > 0 ? row.totalQuantity.toLocaleString() : '—'}</td>
                      <td>{row.usageCount > 0 ? <MoneyCell value={row.totalAmount} /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : companyUsageLoading ? (
            <div style={{ padding: 16 }}><SkeletonRows rows={4} withAvatar={false} /></div>
          ) : (
            <div className="xpl-table-wrap" style={{ maxHeight: '52vh' }}>
              <table className="prx-mini">
                <thead>
                  <tr>
                    <th>{t('field.company')}</th>
                    <th className="prx-center">{t('col.prices.agreement_count')}</th>
                    <th className="prx-center">{t('col.prices.usage_count')}</th>
                    <th className="prx-center">{t('col.prices.total_qty')}</th>
                    <th>{fcMoneyHeader(t('col.prices.total_revenue'))}</th>
                  </tr>
                </thead>
                <tbody>
                  {companyUsage.map((row) => (
                    <tr key={row.companyName}>
                      <td style={{ fontWeight: 700 }}>{row.companyName}</td>
                      <td className="prx-center">{row.agreementCount}</td>
                      <td className="prx-center"><span className={`prx-usage-badge${row.usageCount > 0 ? ' active' : ''}`}>{row.usageCount}</span></td>
                      <td className="prx-center">{row.totalQuantity > 0 ? row.totalQuantity.toLocaleString() : '—'}</td>
                      <td>{row.totalAmount > 0 ? <MoneyCell value={row.totalAmount} /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Dialog>
      )}

      {archiveConfirmId !== null && (
        <ConfirmModal title={t('confirm.archive_price_title')} message={t('confirm.archive_price')} confirmLabel={t('action.archive')} variant="warning" onConfirm={() => executeArchive(archiveConfirmId)} onCancel={() => setArchiveConfirmId(null)} />
      )}
    </div>
  );
}

// ── Agreements mini table ──────────────────────────────────────────────────────
function AgreementMiniTable({ rows, t }: { rows: AgreementRow[]; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const lang = useUI((s) => s.lang);
  if (!rows.length) return <div style={{ fontSize: 13, color: 'var(--xpl-muted)', padding: '8px 0' }}>{t('empty.no_data')}</div>;
  return (
    <div className="xpl-table-wrap" style={{ maxHeight: 320 }}>
      <table className="prx-mini">
        <thead>
          <tr>
            <th>{t('col.prices.plant_short')}</th>
            <th>{t('field.company')}</th>
            <th>{t('col.customer')}</th>
            <th>{fcMoneyHeader(t('col.price'))}</th>
            <th className="prx-center">{t('col.prices.usage')}</th>
            <th>{fcMoneyHeader(t('col.prices.invoice_total'))}</th>
            <th>{t('field.valid_until')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.asphaltPlant}</strong></td>
              <td>{r.companyName}</td>
              <td>{r.customer ? resolveName(r.customer, lang) : '—'}</td>
              <td>{<MoneyCell value={r.unitPrice} />}</td>
              <td className="prx-center"><span className={`prx-usage-badge${r.usageCount > 0 ? ' active' : ''}`}>{r.usageCount}</span></td>
              <td>{r.totalAmount > 0 ? <MoneyCell value={r.totalAmount} /> : '—'}</td>
              <td>{r.validUntil ? <span className="prx-valid">{formatDisplayDate(r.validUntil)}</span> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Price create / edit dialog ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PriceForm({ price, customers, onClose, onSaved }: { price?: any; customers: any[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const lang = useUI((s) => s.lang);
  const isEdit = !!price;

  const [asphaltPlant, setAsphaltPlant] = useState(price?.asphaltPlant ?? '');
  const [companyName, setCompanyName] = useState(price?.companyName ?? '');
  const [contractLocation, setContractLocation] = useState(price?.contractLocation ?? '');
  const [contractUnit, setContractUnit] = useState<(typeof contractUnits)[number]>((price?.contractUnit ?? 'درب') as (typeof contractUnits)[number]);
  const [unitPrice, setUnitPrice] = useState<number>(price?.unitPrice ?? 0);
  const [equipmentOwnerPrice, setEquipmentOwnerPrice] = useState<number>(price?.equipmentOwnerPrice ?? 0);
  const [customerId, setCustomerId] = useState<number | ''>(price?.customerId ?? '');
  const [validUntil, setValidUntil] = useState<string>(price?.validUntil ? String(price.validUntil).slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!asphaltPlant.trim()) { setError(t('error.prices.plant_required')); return; }
    if (!companyName.trim()) { setError(t('error.prices.company_required')); return; }
    if (!contractLocation.trim()) { setError(t('error.prices.location_required')); return; }
    if (unitPrice < 0) { setError(t('error.price_negative')); return; }
    if (equipmentOwnerPrice < 0) { setError(t('error.prices.owner_price_negative')); return; }
    if (!isEdit && !customerId) { setError(t('error.prices.customer_required')); return; }

    setSaving(true);
    try {
      const payload = {
        asphaltPlant: asphaltPlant.trim(),
        companyName: companyName.trim(),
        contractLocation: contractLocation.trim(),
        contractUnit,
        unitPrice,
        equipmentOwnerPrice,
        validUntil: validUntil || null,
        ...(customerId !== '' ? { customerId: Number(customerId) } : {}),
      };
      if (isEdit) await api.patch(`/prices/${price.id}`, payload);
      else await api.post('/prices', payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      icon="sell"
      title={isEdit ? t('modal.edit_price') : t('modal.new_price')}
      subtitle={isEdit ? asphaltPlant : t('page.prices.new_subtitle')}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" icon="save" busy={saving} onClick={submit}>{t('action.save')}</Button>
          <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
        </>
      }
    >
      {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}

      <DialogSection title={t('sec.prices.project')} icon="factory">
        <div className="xpl-field xpl-field--full">
          <label>{t('col.prices.plant')} <span className="req">*</span></label>
          <input className="xpl-input" value={asphaltPlant} onChange={(e) => setAsphaltPlant(e.target.value)} placeholder={t('ph.prices.plant')} autoFocus aria-label={t('col.prices.plant')} />
        </div>
      </DialogSection>

      <DialogSection title={t('sec.prices.company_customer')} icon="apartment">
        <div className="xpl-field">
          <label>{t('col.customer')} {!isEdit ? <span className="req">*</span> : null}</label>
          <select className="xpl-select" value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')} aria-label={t('col.customer')}>
            <option value="">{t('opt.select_customer')}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{resolveName(c, lang)}</option>)}
          </select>
        </div>
        <div className="xpl-field">
          <label>{t('col.prices.company')} <span className="req">*</span></label>
          <input className="xpl-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t('ph.prices.company')} aria-label={t('col.prices.company')} />
        </div>
      </DialogSection>

      <DialogSection title={t('sec.location')} icon="location_on">
        <div className="xpl-field xpl-field--full">
          <label>{t('col.prices.location')} <span className="req">*</span></label>
          <input className="xpl-input" value={contractLocation} onChange={(e) => setContractLocation(e.target.value)} placeholder={t('ph.prices.location')} aria-label={t('col.prices.location')} />
        </div>
      </DialogSection>

      <DialogSection title={t('sec.pricing')} icon="payments">
        <div className="xpl-field">
          <label>{t('col.prices.unit')}</label>
          <select className="xpl-select" value={contractUnit} onChange={(e) => setContractUnit(e.target.value as (typeof contractUnits)[number])} aria-label={t('col.prices.unit')}>
            {contractUnits.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="xpl-field">
          <label>{t('col.prices.unit_price')} <span className="req">*</span></label>
          <input className="xpl-input" type="number" min="0" step="0.001" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} placeholder="0.000" style={{ direction: 'ltr' }} aria-label={t('col.prices.unit_price')} />
        </div>
        {/* بجوار سعر العميل مباشرةً — الرقمان يُقرآن معًا لأن الفرق بينهما هو
            العمولة. اختياري: صفر يعني «لم يُسجَّل بعد» لا «مجاني». */}
        <div className="xpl-field">
          <label>{t('col.prices.owner_price')}</label>
          <input
            className="xpl-input"
            type="number"
            min="0"
            step="0.001"
            value={equipmentOwnerPrice}
            onChange={(e) => setEquipmentOwnerPrice(Number(e.target.value))}
            placeholder="0.000"
            style={{ direction: 'ltr' }}
            aria-label={t('col.prices.owner_price')}
          />
          {/* نفس رموز الطقم المستعملة في `.xpl-field-err` — لا صنف جديد يُخترع
              لسطر تلميح واحد. */}
          <small style={{ fontSize: 11.5, color: 'var(--xpl-muted)', marginTop: 1 }}>
            {t('hint.prices.owner_price')}
          </small>
        </div>
      </DialogSection>

      <DialogSection title={t('sec.additional_info')} icon="event">
        <div className="xpl-field">
          <label>{t('field.valid_until_full')}</label>
          <DateInput className="xpl-input" value={validUntil} onChange={setValidUntil} ariaLabel={t('a11y.agreement_expiry_date')} />
        </div>
      </DialogSection>
    </Dialog>
  );
}
