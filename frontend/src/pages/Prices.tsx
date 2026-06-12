import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import { money } from '../config/modules';

const contractUnits = ['طن', 'درب', 'يومية'] as const;

export default function Prices() {
  const { hasPermission } = useAuth();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

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
        },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterPlant, filterCompany, filterUnit]);

  useEffect(() => { load(); }, [load]);

  async function exportExcel() {
    if (!hasPermission('reports.export')) return;
    setExportBusy(true);
    try {
      const res = await api.get('/reports/prices/export', {
        params: { format: 'excel' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'prices-export.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setExportBusy(false);
    }
  }

  async function archiveRow(id: number) {
    if (!confirm(t('confirm.archive_price'))) return;
    try { await api.delete(`/prices/${id}`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'asphaltPlant', label: 'col.prices.plant', render: (r: Record<string, unknown>) => <strong>{String(r.asphaltPlant)}</strong> },
    { key: 'companyName', label: 'col.prices.company' },
    { key: 'contractLocation', label: 'col.prices.location' },
    { key: 'contractUnit', label: 'col.prices.unit' },
    { key: 'unitPrice', label: 'col.prices.unit_price', render: (r: Record<string, unknown>) => money(r.unitPrice) },
  ];

  const hasFilters = search || filterPlant || filterCompany || filterUnit;

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.prices.title')}</h2><p>{t('page.prices.subtitle')}</p></div>
        <>
          {hasPermission('reports.export') && (
            <button type="button" className="btn secondary" onClick={exportExcel} disabled={exportBusy}>
              {exportBusy ? '...' : 'تصدير الكل Excel'}
            </button>
          )}
          {hasPermission('prices.create') && (
            <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t('page.prices.create')}</button>
          )}
        </>
      </div>

      <div className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <input
          placeholder={t('page.prices.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={inp}
        />
        <input
          placeholder={t('filter.prices.plant')}
          value={filterPlant}
          onChange={(e) => { setFilterPlant(e.target.value); setPage(1); }}
          style={{ ...inp, maxWidth: 200 }}
        />
        <input
          placeholder={t('filter.prices.company')}
          value={filterCompany}
          onChange={(e) => { setFilterCompany(e.target.value); setPage(1); }}
          style={{ ...inp, maxWidth: 200 }}
        />
        <select
          value={filterUnit}
          onChange={(e) => { setFilterUnit(e.target.value); setPage(1); }}
          title={t('filter.prices.unit')}
          style={{ ...inp, maxWidth: 150 }}
        >
          <option value="">{t('opt.all')}</option>
          {contractUnits.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        {hasFilters && (
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => { setSearch(''); setFilterPlant(''); setFilterCompany(''); setFilterUnit(''); setPage(1); }}
          >
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
        onResetFilters={() => { setSearch(''); setFilterPlant(''); setFilterCompany(''); setFilterUnit(''); setPage(1); }}
        actions={(row) => (
          <>
            {hasPermission('prices.update') && (
              <button className="btn sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>
            )}{' '}
            {hasPermission('prices.delete') && (
              <button className="btn secondary sm" onClick={() => archiveRow(row.id)}>{t('action.delete')}</button>
            )}
          </>
        )}
      />

      {creating && <PriceForm onClose={() => setCreating(false)} onSaved={load} />}
      {editing && <PriceForm price={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

// ===== نموذج إنشاء / تعديل سعر =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PriceForm({ price, onClose, onSaved }: { price?: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const isEdit = !!price;

  const [asphaltPlant, setAsphaltPlant] = useState(price?.asphaltPlant ?? '');
  const [companyName, setCompanyName] = useState(price?.companyName ?? '');
  const [contractLocation, setContractLocation] = useState(price?.contractLocation ?? '');
  const [contractUnit, setContractUnit] = useState<(typeof contractUnits)[number]>(price?.contractUnit ?? 'طن');
  const [unitPrice, setUnitPrice] = useState<number>(price?.unitPrice ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!asphaltPlant.trim()) { setError(t('error.prices.plant_required')); return; }
    if (!companyName.trim()) { setError(t('error.prices.company_required')); return; }
    if (!contractLocation.trim()) { setError(t('error.prices.location_required')); return; }
    if (unitPrice < 0) { setError(t('error.price_negative')); return; }

    setSaving(true);
    try {
      const payload = { asphaltPlant: asphaltPlant.trim(), companyName: companyName.trim(), contractLocation: contractLocation.trim(), contractUnit, unitPrice };
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
          <label>{t('col.prices.plant')} *</label>
          <input value={asphaltPlant} onChange={(e) => setAsphaltPlant(e.target.value)} placeholder={t('ph.prices.plant')} style={inp} />
        </div>
        <div className="field">
          <label>{t('col.prices.company')} *</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t('ph.prices.company')} style={inp} />
        </div>
        <div className="field">
          <label>{t('col.prices.location')} *</label>
          <input value={contractLocation} onChange={(e) => setContractLocation(e.target.value)} placeholder={t('ph.prices.location')} style={inp} />
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
            style={inp}
          />
        </div>
      </div>
    </Modal>
  );
}

const inp: React.CSSProperties = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, outline: 'none' };
