import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { formatDate } from '../lib/date';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import { money } from '../config/modules';
import ForceDeleteProjectPriceModal from '../components/ForceDeleteProjectPriceModal';
import ExportExcelButton from '../components/ExportExcelButton';
import { downloadBlob } from '../utils/exportUtils';

const contractUnits = ['طن', 'درب', 'يومية', 'مقطوعية'] as const;

interface PricesStats {
  count: number;
  customerCount: number;
  lastUpdatedAt: string | null;
}

interface UsageRow {
  id: number;
  asphaltPlant: string;
  companyName: string;
  contractLocation: string;
  contractUnit: string;
  unitPrice: number;
  customer: { id: number; name: string } | null;
  usageCount: number;
  totalQuantity: number;
  totalAmount: number;
}

interface UsageReport {
  report: UsageRow[];
  hasDirectTracking: boolean;
  note: string;
}

interface CompanyUsageRow {
  companyName: string;
  agreementCount: number;
  usageCount: number;
  totalQuantity: number;
  totalAmount: number;
}

interface AgreementsDashboard {
  totalAgreements: number;
  unusedCount: number;
  expiringCount: number;
  unused: AgreementRow[];
  expiring: AgreementRow[];
  top5: AgreementRow[];
  least5: AgreementRow[];
}

interface AgreementRow {
  id: number;
  asphaltPlant: string;
  companyName: string;
  contractLocation: string;
  contractUnit: string;
  unitPrice: number;
  validUntil: string | null;
  customer: { id: number; name: string } | null;
  usageCount: number;
  totalQuantity: number;
  totalAmount: number;
}

export default function Prices() {
  const { hasPermission, user } = useAuth();
  const isSystemAdmin = user?.role.name === 'SYSTEM_ADMIN';
  const { t } = useT();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [customers, setCustomers] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [forceDeleteCandidate, setForceDeleteCandidate] = useState<{ id: number; asphaltPlant: string } | null>(null);

  const [stats, setStats] = useState<PricesStats | null>(null);
  const [usageReport, setUsageReport] = useState<UsageReport | null>(null);
  const [showUsage, setShowUsage] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [companyUsage, setCompanyUsage] = useState<CompanyUsageRow[]>([]);
  const [companyUsageLoading, setCompanyUsageLoading] = useState(false);
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [agreementsDashboard, setAgreementsDashboard] = useState<AgreementsDashboard | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'unused' | 'expiring' | 'top5' | 'least5'>('unused');

  useEffect(() => {
    api.get('/customers', { params: { pageSize: 200 } })
      .then((res) => setCustomers(res.data.data.data ?? []))
      .catch(() => {});
  }, []);

  const loadStats = useCallback(() => {
    api.get('/prices/stats')
      .then((res) => setStats(res.data.data))
      .catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    api.get('/prices/agreements-dashboard')
      .then((res) => setAgreementsDashboard(res.data.data ?? null))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/prices', {
        params: {
          page,
          pageSize: 20,
          search: search || undefined,
          asphaltPlant: filterPlant || undefined,
          companyName: filterCompany || undefined,
          contractUnit: filterUnit || undefined,
          customerId: filterCustomer || undefined,
        },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterPlant, filterCompany, filterUnit, filterCustomer]);

  useEffect(() => { load(); }, [load]);

  async function loadUsageReport() {
    setUsageLoading(true);
    try {
      const res = await api.get('/prices/usage');
      setUsageReport(res.data.data);
      setShowUsage(true);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setUsageLoading(false);
    }
  }

  const loadCompanyUsage = useCallback(async () => {
    setCompanyUsageLoading(true);
    try {
      const res = await api.get('/prices/usage/by-company');
      setCompanyUsage(res.data.data ?? []);
    } catch {
      // silent
    } finally {
      setCompanyUsageLoading(false);
    }
  }, []);

  async function exportExcel() {
    if (!hasPermission('reports.export')) return;
    setExportBusy(true);
    try {
      const res = await api.get('/reports/prices/export', {
        params: { format: 'excel' },
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, 'agreements-export.xlsx');
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setExportBusy(false);
    }
  }

  async function archiveRow(id: number) {
    if (!confirm(t('confirm.archive_price'))) return;
    try { await api.delete(`/prices/${id}`); load(); loadStats(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'customer', label: 'العميل', render: (r: Record<string, unknown>) => {
      const c = r.customer as { name: string } | null | undefined;
      return c?.name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>;
    }},
    { key: 'asphaltPlant', label: 'col.prices.plant', render: (r: Record<string, unknown>) => <strong>{String(r.asphaltPlant)}</strong> },
    { key: 'companyName', label: 'col.prices.company' },
    { key: 'contractLocation', label: 'col.prices.location' },
    { key: 'contractUnit', label: 'col.prices.unit' },
    { key: 'unitPrice', label: 'col.prices.unit_price', render: (r: Record<string, unknown>) => money(r.unitPrice) },
  ];

  function resetFilters() {
    setSearch(''); setFilterPlant(''); setFilterCompany(''); setFilterUnit(''); setFilterCustomer(''); setPage(1);
  }

  const hasFilters = search || filterPlant || filterCompany || filterUnit || filterCustomer;

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.prices.title')}</h2><p>{t('page.prices.subtitle')}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hasPermission('prices.create') && (
            <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t('page.prices.create')}</button>
          )}
          {hasPermission('reports.export') && <ExportExcelButton onExport={exportExcel} busy={exportBusy} />}
          <button type="button" className="btn secondary" onClick={loadUsageReport} disabled={usageLoading}>
            {usageLoading ? 'جاري...' : t('agreements.usage.title')}
          </button>
        </div>
      </div>

      {/* ── Stats Dashboard ─────────────────────────────────────────────────── */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label={t('agreements.stats.count')} value={stats.count} color="var(--accent)" />
          <StatCard label={t('agreements.stats.customers')} value={stats.customerCount} color="var(--green)" />
          <StatCard
            label={t('agreements.stats.last_updated')}
            value={stats.lastUpdatedAt ? formatDate(stats.lastUpdatedAt) : '—'}
            color="var(--amber)"
          />
        </div>
      )}

      {/* ── Agreements Dashboard Panel ──────────────────────────────────────── */}
      {agreementsDashboard && (
        <div style={{ marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14, marginLeft: 8 }}>لوحة الاتفاقيات</span>
            {(['unused', 'expiring', 'top5', 'least5'] as const).map((tab) => {
              const labels: Record<string, string> = {
                unused: `غير مستخدمة (${agreementsDashboard.unusedCount})`,
                expiring: `تنتهي قريبًا (${agreementsDashboard.expiringCount})`,
                top5: 'الأعلى استخدامًا',
                least5: 'الأقل استخدامًا',
              };
              return (
                <button
                  key={tab}
                  type="button"
                  className={dashboardTab === tab ? 'btn sm' : 'btn secondary sm'}
                  onClick={() => setDashboardTab(tab)}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>
          <AgreementMiniTable rows={agreementsDashboard[dashboardTab]} />
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <input
          placeholder={t('page.prices.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          value={filterCustomer}
          onChange={(e) => { setFilterCustomer(e.target.value); setPage(1); }}
          title="العميل"
          style={{ maxWidth: 200 }}
        >
          <option value="">كل العملاء</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          placeholder={t('filter.prices.plant')}
          value={filterPlant}
          onChange={(e) => { setFilterPlant(e.target.value); setPage(1); }}
          style={{ maxWidth: 200 }}
        />
        <input
          placeholder={t('filter.prices.company')}
          value={filterCompany}
          onChange={(e) => { setFilterCompany(e.target.value); setPage(1); }}
          style={{ maxWidth: 200 }}
        />
        <select
          value={filterUnit}
          onChange={(e) => { setFilterUnit(e.target.value); setPage(1); }}
          title={t('filter.prices.unit')}
          style={{ maxWidth: 150 }}
        >
          <option value="">{t('opt.all')}</option>
          {contractUnits.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        {hasFilters && (
          <button type="button" className="btn secondary sm" onClick={resetFilters}>
            {t('action.reset_filters')}
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        emptyText={t('empty.prices')}
        isFiltered={!!hasFilters}
        onResetFilters={resetFilters}
        actions={(row) => (
          <>
            {hasPermission('prices.update') && (
              <button className="btn sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>
            )}{' '}
            {hasPermission('prices.delete') && (
              <button className="btn secondary sm" onClick={() => archiveRow(row.id)}>{t('action.delete')}</button>
            )}{' '}
            {isSystemAdmin && (
              <button type="button" className="btn danger sm" onClick={() => setForceDeleteCandidate({ id: row.id, asphaltPlant: row.asphaltPlant })}>حذف نهائي</button>
            )}
          </>
        )}
      />

      {creating && <PriceForm customers={customers} onClose={() => setCreating(false)} onSaved={() => { load(); loadStats(); }} />}
      {editing && <PriceForm customers={customers} price={editing} onClose={() => setEditing(null)} onSaved={() => { load(); loadStats(); }} />}

      {forceDeleteCandidate && (
        <ForceDeleteProjectPriceModal
          priceId={forceDeleteCandidate.id}
          onClose={() => setForceDeleteCandidate(null)}
          onDeleted={() => { setForceDeleteCandidate(null); load(); loadStats(); }}
        />
      )}

      {/* ── Usage Report Modal ──────────────────────────────────────────────── */}
      {showUsage && usageReport && (
        <Modal
          title={t('agreements.usage.title')}
          onClose={() => { setShowUsage(false); setGroupByCompany(false); }}
          footer={<button className="btn secondary" onClick={() => { setShowUsage(false); setGroupByCompany(false); }}>{t('action.close')}</button>}
        >
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <div>⚠️ {t('agreements.usage.note')}</div>
            {usageReport.hasDirectTracking && (
              <div style={{ marginTop: 6, color: 'var(--green)', fontWeight: 600 }}>يعتمد هذا التقرير على الفواتير المنشأة بعد تفعيل تتبع اتفاقيات الأسعار.</div>
            )}
          </div>

          {/* ── View Toggle ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              className={groupByCompany ? 'btn secondary sm' : 'btn sm'}
              onClick={() => setGroupByCompany(false)}
            >
              تفصيل الاتفاقيات
            </button>
            <button
              type="button"
              className={groupByCompany ? 'btn sm' : 'btn secondary sm'}
              onClick={() => { setGroupByCompany(true); loadCompanyUsage(); }}
            >
              تجميع حسب الشركة
            </button>
          </div>

          {/* ── Detail View ─────────────────────────────────────────────────── */}
          {!groupByCompany && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'right' }}>
                  <th style={th}>{t('agreements.usage.col.agreement')}</th>
                  <th style={th}>{t('agreements.usage.col.customer')}</th>
                  <th style={th}>{t('agreements.usage.col.unit')}</th>
                  <th style={th}>{t('agreements.usage.col.price')}</th>
                  <th style={{ ...th, textAlign: 'center' }}>{t('agreements.usage.col.count')}</th>
                  <th style={{ ...th, textAlign: 'center' }}>{t('agreements.usage.col.qty')}</th>
                  <th style={th}>{t('agreements.usage.col.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {usageReport.report.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{row.asphaltPlant}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.contractLocation}</div>
                    </td>
                    <td style={td}>{row.customer?.name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={td}>{row.contractUnit}</td>
                    <td style={td}>{money(row.unitPrice)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', minWidth: 28, textAlign: 'center',
                        background: row.usageCount > 0 ? 'var(--accent)' : 'var(--surface-2)',
                        color: row.usageCount > 0 ? '#fff' : 'var(--text-muted)',
                        borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 12,
                      }}>
                        {row.usageCount}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{row.usageCount > 0 ? row.totalQuantity.toLocaleString() : '—'}</td>
                    <td style={td}>{row.usageCount > 0 ? money(row.totalAmount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Company Group View ──────────────────────────────────────────── */}
          {groupByCompany && (
            companyUsageLoading
              ? <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>...</div>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'right' }}>
                      <th style={th}>الشركة</th>
                      <th style={{ ...th, textAlign: 'center' }}>عدد الاتفاقيات</th>
                      <th style={{ ...th, textAlign: 'center' }}>مرات الاستخدام</th>
                      <th style={{ ...th, textAlign: 'center' }}>إجمالي الكمية</th>
                      <th style={th}>إجمالي الإيرادات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companyUsage.map((row) => (
                      <tr key={row.companyName} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...td, fontWeight: 600 }}>{row.companyName}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{row.agreementCount}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', minWidth: 28, textAlign: 'center',
                            background: row.usageCount > 0 ? 'var(--accent)' : 'var(--surface-2)',
                            color: row.usageCount > 0 ? '#fff' : 'var(--text-muted)',
                            borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 12,
                          }}>
                            {row.usageCount}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>{row.totalQuantity > 0 ? row.totalQuantity.toLocaleString() : '—'}</td>
                        <td style={td}>{row.totalAmount > 0 ? money(row.totalAmount) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
          )}
        </Modal>
      )}
    </div>
  );
}

// ── Stats Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      flex: '1 1 160px', minWidth: 140,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

// ── نموذج إنشاء / تعديل اتفاقية ────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PriceForm({ price, customers, onClose, onSaved }: { price?: any; customers: any[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const isEdit = !!price;

  const [asphaltPlant, setAsphaltPlant] = useState(price?.asphaltPlant ?? '');
  const [companyName, setCompanyName] = useState(price?.companyName ?? '');
  const [contractLocation, setContractLocation] = useState(price?.contractLocation ?? '');
  const [contractUnit, setContractUnit] = useState<(typeof contractUnits)[number]>((price?.contractUnit ?? 'درب') as (typeof contractUnits)[number]);
  const [unitPrice, setUnitPrice] = useState<number>(price?.unitPrice ?? 0);
  const [customerId, setCustomerId] = useState<number | ''>(price?.customerId ?? '');
  const [validUntil, setValidUntil] = useState<string>(
    price?.validUntil ? String(price.validUntil).slice(0, 10) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!asphaltPlant.trim()) { setError(t('error.prices.plant_required')); return; }
    if (!companyName.trim()) { setError(t('error.prices.company_required')); return; }
    if (!contractLocation.trim()) { setError(t('error.prices.location_required')); return; }
    if (unitPrice < 0) { setError(t('error.price_negative')); return; }
    if (!isEdit && !customerId) { setError('يجب اختيار عميل'); return; }

    setSaving(true);
    try {
      const payload = {
        asphaltPlant: asphaltPlant.trim(),
        companyName: companyName.trim(),
        contractLocation: contractLocation.trim(),
        contractUnit,
        unitPrice,
        validUntil: validUntil || null,
        ...(customerId !== '' ? { customerId: Number(customerId) } : {}),
      };
      if (isEdit) {
        await api.patch(`/prices/${price.id}`, payload);
      } else {
        await api.post('/prices', payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? t('modal.edit_price') : t('modal.new_price')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
          <button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
        </>
      }
    >
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>العميل {!isEdit ? ' *' : ''}</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
            title="العميل"
          >
            <option value="">— اختر عميل —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>{t('col.prices.plant')} *</label>
          <input value={asphaltPlant} onChange={(e) => setAsphaltPlant(e.target.value)} placeholder={t('ph.prices.plant')} />
        </div>
        <div className="field">
          <label>{t('col.prices.company')} *</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t('ph.prices.company')} />
        </div>
        <div className="field">
          <label>{t('col.prices.location')} *</label>
          <input value={contractLocation} onChange={(e) => setContractLocation(e.target.value)} placeholder={t('ph.prices.location')} />
        </div>
        <div className="field">
          <label>{t('col.prices.unit')}</label>
          <select value={contractUnit} onChange={(e) => setContractUnit(e.target.value as (typeof contractUnits)[number])} title={t('col.prices.unit')}>
            {contractUnits.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field">
          <label>{t('col.prices.unit_price')} *</label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            placeholder="0.000"
          />
        </div>
        <div className="field">
          <label>صالح حتى (تاريخ انتهاء الاتفاقية)</label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            title="تاريخ انتهاء الاتفاقية"
          />
        </div>
      </div>
    </Modal>
  );
}

// ── Mini table for agreements dashboard panel ───────────────────────────────
function AgreementMiniTable({ rows }: { rows: AgreementRow[] }) {
  if (!rows.length) return <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>لا توجد بيانات</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
          <th style={th}>المصنع</th>
          <th style={th}>الشركة</th>
          <th style={th}>العميل</th>
          <th style={th}>السعر</th>
          <th style={{ ...th, textAlign: 'center' }}>الاستخدام</th>
          <th style={th}>إجمالي الفاتورة</th>
          <th style={th}>صالح حتى</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={td}><strong>{r.asphaltPlant}</strong></td>
            <td style={td}>{r.companyName}</td>
            <td style={td}>{r.customer?.name ?? '—'}</td>
            <td style={td}>{money(r.unitPrice)}</td>
            <td style={{ ...td, textAlign: 'center' }}>{r.usageCount}</td>
            <td style={td}>{r.totalAmount > 0 ? money(r.totalAmount) : '—'}</td>
            <td style={td}>
              {r.validUntil
                ? <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{String(r.validUntil).slice(0, 10)}</span>
                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)' };
const td: React.CSSProperties = { padding: '10px 10px', verticalAlign: 'top' };
