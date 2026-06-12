import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import { money, dateText } from '../config/modules';
import { usePersistedState } from '../hooks/usePersistedState';

// ── Domain Types ──────────────────────────────────────────────────────────────

interface Equipment {
  id: number;
  code: string;
  name?: string;
  type?: string;
  plateNumber?: string;
}

interface MaintenanceRecord {
  id: number;
  equipmentId: number;
  equipment?: { id: number; code: string; name?: string };
  type: string;
  description: string;
  cost?: number | null;
  performedBy?: string | null;
  date: string;
  nextDueDate?: string | null;
  status: string;
  createdAt: string;
}

interface FuelLog {
  id: number;
  equipmentId: number;
  equipment?: { id: number; code: string };
  liters: number;
  cost: number;
  odometer?: number | null;
  date: string;
  notes?: string | null;
}

interface Breakdown {
  id: number;
  equipmentId: number;
  equipment?: { id: number; code: string };
  description: string;
  reportedAt: string;
  resolvedAt?: string | null;
  severity: string;
  status: string;
}

interface SparePart {
  id: number;
  equipmentId: number;
  equipment?: { id: number; code: string };
  partName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  date: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type PillCls = 'green' | 'amber' | 'red' | 'blue' | 'gray';
function pill(label: string, cls: PillCls) {
  return <span className={`pill ${cls}`}>{label}</span>;
}

const maintenanceStatusMap: Record<string, [string, PillCls]> = {
  SCHEDULED:   ['مجدولة',     'amber'],
  IN_PROGRESS: ['قيد التنفيذ', 'blue'],
  COMPLETED:   ['مكتملة',     'green'],
  CANCELLED:   ['ملغاة',      'gray'],
};

const maintenanceType: Record<string, string> = {
  PREVENTIVE: 'وقائية',
  CORRECTIVE: 'تصحيحية',
};

const severityMap: Record<string, [string, PillCls]> = {
  LOW:      ['منخفضة',   'gray'],
  MEDIUM:   ['متوسطة',   'amber'],
  HIGH:     ['عالية',    'red'],
  CRITICAL: ['حرجة',     'red'],
};

const breakdownStatusMap: Record<string, [string, PillCls]> = {
  OPEN:     ['مفتوح',    'red'],
  RESOLVED: ['محلول',    'green'],
};

function statusBadge(map: Record<string, [string, PillCls]>, val: string) {
  const [label, cls] = map[val] ?? [val, 'gray'];
  return pill(label, cls);
}

const inp: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontWeight: 600,
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

// ── Tab Types ─────────────────────────────────────────────────────────────────

type Tab = 'records' | 'fuel' | 'breakdowns' | 'spare-parts';

const TABS: { key: Tab; label: string }[] = [
  { key: 'records',     label: 'tab.maint.records' },
  { key: 'fuel',        label: 'tab.maint.fuel' },
  { key: 'breakdowns',  label: 'tab.maint.breakdowns' },
  { key: 'spare-parts', label: 'tab.maint.spare_parts' },
];

// ── Summary KPIs ──────────────────────────────────────────────────────────────

function SummaryKPIs() {
  const { t } = useT();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([]);
  const [due, setDue] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/maintenance/records', { params: { pageSize: 500 } }),
      api.get('/maintenance/breakdowns', { params: { pageSize: 500 } }),
      api.get('/maintenance/due'),
    ])
      .then(([rRes, bRes, dRes]) => {
        setRecords(rRes.data.data ?? []);
        setBreakdowns(bRes.data.data ?? []);
        setDue(dRes.data.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalRecords  = records.length;
  const openBreakdowns = breakdowns.filter((b) => b.status === 'OPEN').length;
  const completed     = records.filter((r) => r.status === 'COMPLETED').length;
  const dueSoon       = due.length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
      <StatCard label={t('stat.maint.total')}     value={loading ? '…' : totalRecords}   icon="🔧" color="#3b82f6" bg="#dbeafe" />
      <StatCard label={t('stat.maint.open')}       value={loading ? '…' : openBreakdowns} icon="⚠️" color="#ef4444" bg="#fee2e2"
        sub={openBreakdowns > 0 ? t('stat.maint.needs_attention') : undefined} dir={openBreakdowns > 0 ? 'down' : ''} />
      <StatCard label={t('stat.maint.completed')}  value={loading ? '…' : completed}      icon="✅" color="#10b981" bg="#d1fae5" />
      <StatCard label={t('stat.maint.due_soon')}   value={loading ? '…' : dueSoon}        icon="📅" color="#f59e0b" bg="#fef3c7"
        sub={dueSoon > 0 ? t('stat.maint.within_30_days') : undefined} dir={dueSoon > 0 ? 'down' : ''} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Maintenance() {
  const [tab, setTab] = usePersistedState<Tab>('maint:tab', 'records');
  const { t } = useT();

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{t('page.maint.title')}</h2>
          <p>{t('page.maint.subtitle')}</p>
        </div>
      </div>

      <SummaryKPIs />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {TABS.map((tabItem) => (
          <button
            key={tabItem.key}
            className={`btn${tab === tabItem.key ? '' : ' secondary'} sm`}
            onClick={() => setTab(tabItem.key)}
          >
            {t(tabItem.label)}
          </button>
        ))}
      </div>

      {tab === 'records'     && <RecordsTab />}
      {tab === 'fuel'        && <FuelTab />}
      {tab === 'breakdowns'  && <BreakdownsTab />}
      {tab === 'spare-parts' && <SparePartsTab />}
    </div>
  );
}

// ── سجلات الصيانة ─────────────────────────────────────────────────────────────

const EMPTY_FORM = { equipmentId: '', plateNumber: '', type: 'PREVENTIVE', description: '', cost: '', performedBy: '', date: '', nextDueDate: '', status: 'COMPLETED' };

function RecordForm({
  id,
  form,
  setForm,
  onSubmit,
  saving,
  equipmentList,
  isEdit,
}: {
  id: string;
  form: typeof EMPTY_FORM;
  setForm: (f: typeof EMPTY_FORM) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  equipmentList: Equipment[];
  isEdit: boolean;
}) {
  const { t } = useT();
  return (
    <form id={id} onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {!isEdit && (
        <>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.equipment')} *</label>
            <select style={inp} required value={form.equipmentId} onChange={(e) => {
              const eq = equipmentList.find((x) => String(x.id) === e.target.value);
              setForm({ ...form, equipmentId: e.target.value, plateNumber: eq?.plateNumber ?? '' });
            }}>
              <option value="">{t('field.select_equipment')}</option>
              {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.name ? ` — ${eq.name}` : eq.type ? ` — ${eq.type}` : ''}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.plate_number')}</label>
            <input style={{ ...inp, background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'default' }} readOnly tabIndex={-1} value={form.plateNumber || '—'} />
          </div>
        </>
      )}
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.maint.type')} *</label>
        <select style={inp} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="PREVENTIVE">{t('opt.maint.preventive')}</option>
          <option value="CORRECTIVE">{t('opt.maint.corrective')}</option>
        </select>
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.status')}</label>
        <select style={inp} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="SCHEDULED">{t('opt.maint.scheduled')}</option>
          <option value="IN_PROGRESS">{t('opt.maint.in_progress')}</option>
          <option value="COMPLETED">{t('opt.maint.completed')}</option>
          <option value="CANCELLED">{t('opt.maint.cancelled')}</option>
        </select>
      </div>
      <div style={{ gridColumn: '1/-1' }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.description')} *</label>
        <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.amount_kd')}</label>
        <input style={inp} type="number" min="0" step="0.001" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.maint.performed_by')}</label>
        <input style={inp} value={form.performedBy} onChange={(e) => setForm({ ...form, performedBy: e.target.value })} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.date')}</label>
        <input style={inp} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.maint.next_due')}</label>
        <input style={inp} type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} />
      </div>
    </form>
  );
}

function RecordsTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<MaintenanceRecord[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = usePersistedState('maint:records:search', '');
  const [filterEquip, setFilterEquip] = usePersistedState('maint:records:equip', '');
  const [filterStatus, setFilterStatus] = usePersistedState('maint:records:status', '');
  const [filterType, setFilterType] = usePersistedState('maint:records:type', '');
  const [filterDateFrom, setFilterDateFrom] = usePersistedState('maint:records:from', '');
  const [filterDateTo, setFilterDateTo] = usePersistedState('maint:records:to', '');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [detailRecord, setDetailRecord] = useState<MaintenanceRecord | null>(null);
  const [editRecord, setEditRecord] = useState<MaintenanceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceRecord | null>(null);

  // Form state
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm]     = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [formError, setFormError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (filterEquip)    params.equipmentId = filterEquip;
      if (filterStatus)   params.status      = filterStatus;
      if (filterType)     params.type        = filterType;
      if (filterDateFrom) params.dateFrom    = filterDateFrom;
      if (filterDateTo)   params.dateTo      = filterDateTo;
      const res = await api.get('/maintenance/records', { params });
      setRows(res.data.data ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filterEquip, filterStatus, filterType, filterDateFrom, filterDateTo]);

  useEffect(() => {
    load();
    api.get('/equipment', { params: { pageSize: 500 } })
      .then((r) => setEquipmentList(r.data.data.data ?? []))
      .catch(() => {});
  }, [load]);

  // Client-side text search (equipment code/name, description, performedBy)
  const visible = search.trim()
    ? rows.filter((r) => {
        const q = search.trim().toLowerCase();
        return (
          (r.equipment?.code ?? '').toLowerCase().includes(q) ||
          (r.equipment?.name ?? '').toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.performedBy ?? '').toLowerCase().includes(q)
        );
      })
    : rows;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = {
        equipmentId: Number(createForm.equipmentId),
        type: createForm.type,
        description: createForm.description,
        status: createForm.status,
      };
      if (createForm.cost)        body.cost = Number(createForm.cost);
      if (createForm.performedBy) body.performedBy = createForm.performedBy;
      if (createForm.date)        body.date = new Date(createForm.date).toISOString();
      if (createForm.nextDueDate) body.nextDueDate = new Date(createForm.nextDueDate).toISOString();
      await api.post('/maintenance/records', body);
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      load();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(r: MaintenanceRecord) {
    setEditRecord(r);
    setEditForm({
      equipmentId: String(r.equipmentId),
      plateNumber: '',
      type: r.type,
      description: r.description,
      cost: r.cost != null ? String(r.cost) : '',
      performedBy: r.performedBy ?? '',
      date: r.date ? r.date.slice(0, 10) : '',
      nextDueDate: r.nextDueDate ? r.nextDueDate.slice(0, 10) : '',
      status: r.status,
    });
    setFormError('');
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRecord) return;
    setSaving(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = {
        type: editForm.type,
        description: editForm.description,
        status: editForm.status,
      };
      if (editForm.cost)        body.cost = Number(editForm.cost);
      if (editForm.performedBy) body.performedBy = editForm.performedBy;
      if (editForm.date)        body.date = new Date(editForm.date).toISOString();
      body.nextDueDate = editForm.nextDueDate ? new Date(editForm.nextDueDate).toISOString() : null;
      await api.patch(`/maintenance/records/${editRecord.id}`, body);
      setEditRecord(null);
      load();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/maintenance/records/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(errorMessage(e));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    { key: 'equipment',   label: 'col.equipment_no',        render: (r: MaintenanceRecord) => (
        <span>
          <strong style={{ fontFamily: 'monospace' }}>{r.equipment?.code ?? r.equipmentId}</strong>
          {r.equipment?.name ? <span style={{ color: 'var(--text-muted)', fontSize: 12, marginInlineStart: 6 }}>{r.equipment.name}</span> : null}
        </span>
      ) },
    { key: 'type',        label: 'col.maint.type',           render: (r: MaintenanceRecord) => maintenanceType[r.type] ?? r.type },
    { key: 'description', label: 'col.description',          render: (r: MaintenanceRecord) => <span style={{ maxWidth: 200, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span> },
    { key: 'cost',        label: 'col.amount',               render: (r: MaintenanceRecord) => r.cost != null ? money(r.cost) : '—' },
    { key: 'performedBy', label: 'col.maint.performed_by',   render: (r: MaintenanceRecord) => r.performedBy ?? '—' },
    { key: 'date',        label: 'col.date',                 render: (r: MaintenanceRecord) => dateText(r.date) },
    { key: 'nextDueDate', label: 'col.maint.next_due',       render: (r: MaintenanceRecord) => r.nextDueDate ? dateText(r.nextDueDate) : '—' },
    { key: 'status',      label: 'col.status',               render: (r: MaintenanceRecord) => statusBadge(maintenanceStatusMap, r.status) },
    { key: 'actions',     label: 'col.actions',              render: (r: MaintenanceRecord) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn secondary sm" onClick={() => setDetailRecord(r)}>{t('action.maint.view_details')}</button>
          {hasPermission('maintenance.update') && (
            <button className="btn secondary sm" onClick={() => openEdit(r)}>{t('action.maint.edit')}</button>
          )}
          {hasPermission('maintenance.delete') && (
            <button className="btn sm" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => setDeleteTarget(r)}>{t('action.maint.delete')}</button>
          )}
        </div>
      ) },
  ];

  return (
    <div>
      {/* Filters + Search toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input
          style={{ ...inp, width: 200 }}
          placeholder={t('search.placeholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select style={{ ...inp, width: 190 }} value={filterEquip} onChange={(e) => setFilterEquip(e.target.value)}>
          <option value="">{t('filter.all_equipment')}</option>
          {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.name ? ` — ${eq.name}` : eq.type ? ` — ${eq.type}` : ''}</option>)}
        </select>
        <select style={{ ...inp, width: 150 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">{t('filter.all_types')}</option>
          <option value="PREVENTIVE">{t('opt.maint.preventive')}</option>
          <option value="CORRECTIVE">{t('opt.maint.corrective')}</option>
        </select>
        <select style={{ ...inp, width: 160 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">{t('filter.all_statuses')}</option>
          <option value="SCHEDULED">{t('opt.maint.scheduled')}</option>
          <option value="IN_PROGRESS">{t('opt.maint.in_progress')}</option>
          <option value="COMPLETED">{t('opt.maint.completed')}</option>
          <option value="CANCELLED">{t('opt.maint.cancelled')}</option>
        </select>
        <input style={{ ...inp, width: 150 }} type="date" title={t('filter.date_from')} value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
        <input style={{ ...inp, width: 150 }} type="date" title={t('filter.date_to')}   value={filterDateTo}   onChange={(e) => setFilterDateTo(e.target.value)} />
        <div style={{ flex: 1 }} />
        <button className="btn secondary sm" type="button" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
        {hasPermission('maintenance.create') && (
          <button className="btn sm" onClick={() => { setCreateForm(EMPTY_FORM); setFormError(''); setShowCreate(true); }}>{t('action.maint.add_record')}</button>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

      <DataTable columns={columns} rows={visible} loading={loading} emptyText={t('empty.maint.records')} />

      {/* ── Create Modal ── */}
      {showCreate && (
        <Modal title={t('action.maint.add_record')} onClose={() => setShowCreate(false)}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary sm" onClick={() => setShowCreate(false)}>{t('action.cancel')}</button>
              <button className="btn sm" form="maint-record-create" type="submit" disabled={saving}>{saving ? '…' : t('action.save')}</button>
            </div>
          }
        >
          {formError && <p style={{ color: 'var(--danger)', marginBottom: 10, fontSize: 13 }}>{formError}</p>}
          <RecordForm id="maint-record-create" form={createForm} setForm={setCreateForm} onSubmit={handleCreate} saving={saving} equipmentList={equipmentList} isEdit={false} />
        </Modal>
      )}

      {/* ── Edit Modal ── */}
      {editRecord && (
        <Modal title={t('action.maint.edit')} onClose={() => setEditRecord(null)}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary sm" onClick={() => setEditRecord(null)}>{t('action.cancel')}</button>
              <button className="btn sm" form="maint-record-edit" type="submit" disabled={saving}>{saving ? '…' : t('action.save')}</button>
            </div>
          }
        >
          {formError && <p style={{ color: 'var(--danger)', marginBottom: 10, fontSize: 13 }}>{formError}</p>}
          <RecordForm id="maint-record-edit" form={editForm} setForm={setEditForm} onSubmit={handleEdit} saving={saving} equipmentList={equipmentList} isEdit />
        </Modal>
      )}

      {/* ── Details Modal ── */}
      {detailRecord && (
        <Modal title={t('modal.maint.details_title')} onClose={() => setDetailRecord(null)}
          footer={<div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn secondary sm" onClick={() => setDetailRecord(null)}>{t('action.cancel')}</button></div>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: 14 }}>
            {[
              ['field.equipment',           detailRecord.equipment ? `${detailRecord.equipment.code}${detailRecord.equipment.name ? ' — ' + detailRecord.equipment.name : ''}` : String(detailRecord.equipmentId)],
              ['field.maint.type',          maintenanceType[detailRecord.type] ?? detailRecord.type],
              ['field.status',              statusBadge(maintenanceStatusMap, detailRecord.status)],
              ['col.amount',                money(detailRecord.cost ?? 0)],
              ['field.maint.performed_by',  detailRecord.performedBy ?? '—'],
              ['field.date',                dateText(detailRecord.date)],
              ['field.maint.next_due',      detailRecord.nextDueDate ? dateText(detailRecord.nextDueDate) : '—'],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{t(String(label))}</div>
                <div style={{ fontWeight: 600 }}>{value}</div>
              </div>
            ))}
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{t('field.description')}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{detailRecord.description}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{t('col.created_at')}</div>
              <div>{dateText(detailRecord.createdAt)}</div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <Modal title={t('action.maint.delete')} onClose={() => setDeleteTarget(null)}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary sm" onClick={() => setDeleteTarget(null)}>{t('action.cancel')}</button>
              <button className="btn sm" style={{ background: 'var(--danger)', color: '#fff' }} onClick={handleDelete} disabled={deleting}>
                {deleting ? '…' : t('action.maint.delete')}
              </button>
            </div>
          }
        >
          <p style={{ margin: 0 }}>{t('action.maint.confirm_delete')}</p>
          <p style={{ margin: '8px 0 0', fontWeight: 600, color: 'var(--text-muted)', fontSize: 13 }}>
            {deleteTarget.equipment?.code ?? deleteTarget.equipmentId} — {maintenanceType[deleteTarget.type] ?? deleteTarget.type} — {dateText(deleteTarget.date)}
          </p>
        </Modal>
      )}
    </div>
  );
}

// ── سجلات الوقود ──────────────────────────────────────────────────────────────

function FuelTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<FuelLog[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterEquip, setFilterEquip] = usePersistedState('maint:fuel:equip', '');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ equipmentId: '', plateNumber: '', liters: '', cost: '', odometer: '', date: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { pageSize: '500' };
      if (filterEquip) params.equipmentId = filterEquip;
      const res = await api.get('/maintenance/fuel', { params });
      setRows(res.data.data ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filterEquip]);

  useEffect(() => {
    load();
    api.get('/equipment', { params: { pageSize: 500 } })
      .then((r) => setEquipmentList(r.data.data.data ?? []))
      .catch(() => {});
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        equipmentId: Number(form.equipmentId),
        liters: Number(form.liters),
        cost: Number(form.cost),
      };
      if (form.odometer) body.odometer = Number(form.odometer);
      if (form.date)     body.date = new Date(form.date).toISOString();
      if (form.notes)    body.notes = form.notes;
      await api.post('/maintenance/fuel', body);
      setShowCreate(false);
      setForm({ equipmentId: '', plateNumber: '', liters: '', cost: '', odometer: '', date: '', notes: '' });
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const totalLiters = rows.reduce((s, r) => s + r.liters, 0);
  const totalCost   = rows.reduce((s, r) => s + r.cost, 0);

  const columns = [
    { key: 'equipment', label: 'col.equipment_no', render: (r: FuelLog) => <strong style={{ fontFamily: 'monospace' }}>{r.equipment?.code ?? r.equipmentId}</strong> },
    { key: 'liters',    label: 'col.maint.liters',  render: (r: FuelLog) => `${r.liters.toLocaleString()} L` },
    { key: 'cost',      label: 'col.amount',         render: (r: FuelLog) => money(r.cost) },
    { key: 'odometer',  label: 'col.maint.odometer', render: (r: FuelLog) => r.odometer != null ? `${r.odometer.toLocaleString()} km` : '—' },
    { key: 'date',      label: 'col.date',           render: (r: FuelLog) => dateText(r.date) },
    { key: 'notes',     label: 'col.notes',          render: (r: FuelLog) => r.notes ?? '—' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard label={t('stat.maint.total_liters')} value={`${totalLiters.toLocaleString()} L`} icon="⛽" color="#3b82f6" bg="#dbeafe" />
        <StatCard label={t('stat.maint.fuel_cost')}    value={money(totalCost)}                    icon="💰" color="#10b981" bg="#d1fae5" />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select style={{ ...inp, width: 200 }} value={filterEquip} onChange={(e) => setFilterEquip(e.target.value)}>
          <option value="">{t('filter.all_equipment')}</option>
          {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn secondary sm" type="button" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
        {hasPermission('maintenance.create') && (
          <button className="btn sm" onClick={() => setShowCreate(true)}>{t('action.maint.add_fuel')}</button>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

      <DataTable columns={columns} rows={rows} loading={loading} emptyText={t('empty.maint.fuel')} />

      {showCreate && (
        <Modal title={t('action.maint.add_fuel')} onClose={() => setShowCreate(false)}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary sm" onClick={() => setShowCreate(false)}>{t('action.cancel')}</button>
              <button className="btn sm" form="maint-fuel-form" type="submit" disabled={saving}>{saving ? '…' : t('action.save')}</button>
            </div>
          }
        >
          <form id="maint-fuel-form" onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.equipment')} *</label>
              <select style={inp} required value={form.equipmentId} onChange={(e) => {
                const eq = equipmentList.find((x) => String(x.id) === e.target.value);
                setForm({ ...form, equipmentId: e.target.value, plateNumber: eq?.plateNumber ?? '' });
              }}>
                <option value="">{t('field.select_equipment')}</option>
                {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.plate_number')}</label>
              <input style={{ ...inp, background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'default' }} readOnly tabIndex={-1} value={form.plateNumber || '—'} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.maint.liters')} *</label>
              <input style={inp} type="number" min="0.001" step="0.001" required value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.amount_kd')} *</label>
              <input style={inp} type="number" min="0" step="0.001" required value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.maint.odometer')}</label>
              <input style={inp} type="number" min="0" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.date')}</label>
              <input style={inp} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.notes')}</label>
              <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── الأعطال ───────────────────────────────────────────────────────────────────

function BreakdownsTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Breakdown[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterEquip, setFilterEquip] = usePersistedState('maint:bd:equip', '');
  const [filterStatus, setFilterStatus] = usePersistedState('maint:bd:status', '');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);
  const [form, setForm] = useState({ equipmentId: '', plateNumber: '', description: '', severity: 'MEDIUM' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { pageSize: '500' };
      if (filterEquip) params.equipmentId = filterEquip;
      if (filterStatus) params.status = filterStatus;
      const res = await api.get('/maintenance/breakdowns', { params });
      setRows(res.data.data ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filterEquip, filterStatus]);

  useEffect(() => {
    load();
    api.get('/equipment', { params: { pageSize: 500 } })
      .then((r) => setEquipmentList(r.data.data.data ?? []))
      .catch(() => {});
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/maintenance/breakdowns', {
        equipmentId: Number(form.equipmentId),
        description: form.description,
        severity: form.severity,
      });
      setShowCreate(false);
      setForm({ equipmentId: '', plateNumber: '', description: '', severity: 'MEDIUM' });
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleResolve(id: number) {
    setResolving(id);
    try {
      await api.patch(`/maintenance/breakdowns/${id}/resolve`);
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setResolving(null);
    }
  }

  const openCount     = rows.filter((r) => r.status === 'OPEN').length;
  const resolvedCount = rows.filter((r) => r.status === 'RESOLVED').length;

  const columns = [
    { key: 'equipment',   label: 'col.equipment_no',     render: (r: Breakdown) => <strong style={{ fontFamily: 'monospace' }}>{r.equipment?.code ?? r.equipmentId}</strong> },
    { key: 'description', label: 'col.description',      render: (r: Breakdown) => <span style={{ maxWidth: 240, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span> },
    { key: 'severity',    label: 'col.maint.severity',   render: (r: Breakdown) => statusBadge(severityMap, r.severity) },
    { key: 'status',      label: 'col.status',           render: (r: Breakdown) => statusBadge(breakdownStatusMap, r.status) },
    { key: 'reportedAt',  label: 'col.maint.reported_at', render: (r: Breakdown) => dateText(r.reportedAt) },
    { key: 'resolvedAt',  label: 'col.maint.resolved_at', render: (r: Breakdown) => r.resolvedAt ? dateText(r.resolvedAt) : '—' },
    {
      key: 'actions',
      label: 'col.actions',
      render: (r: Breakdown) => r.status === 'OPEN' && hasPermission('maintenance.create')
        ? (
          <button
            className="btn sm secondary"
            onClick={() => handleResolve(r.id)}
            disabled={resolving === r.id}
          >
            {resolving === r.id ? '…' : t('action.maint.resolve')}
          </button>
        )
        : null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard label={t('stat.maint.open_breakdowns')}    value={openCount}     icon="🔴" color="#ef4444" bg="#fee2e2" />
        <StatCard label={t('stat.maint.resolved_breakdowns')} value={resolvedCount} icon="✅" color="#10b981" bg="#d1fae5" />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select style={{ ...inp, width: 200 }} value={filterEquip} onChange={(e) => setFilterEquip(e.target.value)}>
          <option value="">{t('filter.all_equipment')}</option>
          {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
        </select>
        <select style={{ ...inp, width: 160 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">{t('filter.all_statuses')}</option>
          <option value="OPEN">{t('opt.maint.breakdown_open')}</option>
          <option value="RESOLVED">{t('opt.maint.breakdown_resolved')}</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn secondary sm" type="button" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
        {hasPermission('maintenance.create') && (
          <button className="btn sm" onClick={() => setShowCreate(true)}>{t('action.maint.report_breakdown')}</button>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

      <DataTable columns={columns} rows={rows} loading={loading} emptyText={t('empty.maint.breakdowns')} />

      {showCreate && (
        <Modal title={t('action.maint.report_breakdown')} onClose={() => setShowCreate(false)}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary sm" onClick={() => setShowCreate(false)}>{t('action.cancel')}</button>
              <button className="btn sm" form="maint-breakdown-form" type="submit" disabled={saving}>{saving ? '…' : t('action.save')}</button>
            </div>
          }
        >
          <form id="maint-breakdown-form" onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.equipment')} *</label>
              <select style={inp} required value={form.equipmentId} onChange={(e) => {
                const eq = equipmentList.find((x) => String(x.id) === e.target.value);
                setForm({ ...form, equipmentId: e.target.value, plateNumber: eq?.plateNumber ?? '' });
              }}>
                <option value="">{t('field.select_equipment')}</option>
                {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.plate_number')}</label>
              <input style={{ ...inp, background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'default' }} readOnly tabIndex={-1} value={form.plateNumber || '—'} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.description')} *</label>
              <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.maint.severity')}</label>
              <select style={inp} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option value="LOW">{t('opt.maint.sev_low')}</option>
                <option value="MEDIUM">{t('opt.maint.sev_medium')}</option>
                <option value="HIGH">{t('opt.maint.sev_high')}</option>
                <option value="CRITICAL">{t('opt.maint.sev_critical')}</option>
              </select>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── قطع الغيار ────────────────────────────────────────────────────────────────

function SparePartsTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<SparePart[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterEquip, setFilterEquip] = usePersistedState('maint:spare:equip', '');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ equipmentId: '', plateNumber: '', partName: '', quantity: '', unitCost: '', date: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { pageSize: '500' };
      if (filterEquip) params.equipmentId = filterEquip;
      const res = await api.get('/maintenance/spare-parts', { params });
      setRows(res.data.data ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filterEquip]);

  useEffect(() => {
    load();
    api.get('/equipment', { params: { pageSize: 500 } })
      .then((r) => setEquipmentList(r.data.data.data ?? []))
      .catch(() => {});
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        equipmentId: Number(form.equipmentId),
        partName: form.partName,
        quantity: Number(form.quantity),
        unitCost: Number(form.unitCost),
      };
      if (form.date) body.date = new Date(form.date).toISOString();
      await api.post('/maintenance/spare-parts', body);
      setShowCreate(false);
      setForm({ equipmentId: '', plateNumber: '', partName: '', quantity: '', unitCost: '', date: '' });
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);

  const columns = [
    { key: 'equipment', label: 'col.equipment_no',      render: (r: SparePart) => <strong style={{ fontFamily: 'monospace' }}>{r.equipment?.code ?? r.equipmentId}</strong> },
    { key: 'partName',  label: 'col.maint.part_name',   render: (r: SparePart) => <strong>{r.partName}</strong> },
    { key: 'quantity',  label: 'col.maint.quantity' },
    { key: 'unitCost',  label: 'col.maint.unit_cost',   render: (r: SparePart) => money(r.unitCost) },
    { key: 'totalCost', label: 'col.maint.total_cost',  render: (r: SparePart) => money(r.totalCost) },
    { key: 'date',      label: 'col.date',              render: (r: SparePart) => dateText(r.date) },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard label={t('stat.maint.spare_parts_count')} value={rows.length}       icon="🔩" color="#8b5cf6" bg="#ede9fe" />
        <StatCard label={t('stat.maint.spare_parts_cost')}  value={money(totalCost)} icon="💰" color="#10b981" bg="#d1fae5" />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select style={{ ...inp, width: 200 }} value={filterEquip} onChange={(e) => setFilterEquip(e.target.value)}>
          <option value="">{t('filter.all_equipment')}</option>
          {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn secondary sm" type="button" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
        {hasPermission('maintenance.create') && (
          <button className="btn sm" onClick={() => setShowCreate(true)}>{t('action.maint.add_spare_part')}</button>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

      <DataTable columns={columns} rows={rows} loading={loading} emptyText={t('empty.maint.spare_parts')} />

      {showCreate && (
        <Modal title={t('action.maint.add_spare_part')} onClose={() => setShowCreate(false)}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary sm" onClick={() => setShowCreate(false)}>{t('action.cancel')}</button>
              <button className="btn sm" form="maint-spare-form" type="submit" disabled={saving}>{saving ? '…' : t('action.save')}</button>
            </div>
          }
        >
          <form id="maint-spare-form" onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.equipment')} *</label>
              <select style={inp} required value={form.equipmentId} onChange={(e) => {
                const eq = equipmentList.find((x) => String(x.id) === e.target.value);
                setForm({ ...form, equipmentId: e.target.value, plateNumber: eq?.plateNumber ?? '' });
              }}>
                <option value="">{t('field.select_equipment')}</option>
                {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.plate_number')}</label>
              <input style={{ ...inp, background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'default' }} readOnly tabIndex={-1} value={form.plateNumber || '—'} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.maint.part_name')} *</label>
              <input style={inp} required value={form.partName} onChange={(e) => setForm({ ...form, partName: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.maint.quantity')} *</label>
              <input style={inp} type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.maint.unit_cost')} *</label>
              <input style={inp} type="number" min="0" step="0.001" required value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.date')}</label>
              <input style={inp} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
