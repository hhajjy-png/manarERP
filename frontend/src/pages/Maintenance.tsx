import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import { money, dateText } from '../config/modules';

// ── Domain Types ──────────────────────────────────────────────────────────────

interface Equipment {
  id: number;
  code: string;
  name?: string;
  type?: string;
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

const maintenanceStatus: Record<string, [string, PillCls]> = {
  SCHEDULED:   ['مجدولة',   'amber'],
  IN_PROGRESS: ['قيد التنفيذ', 'blue'],
  COMPLETED:   ['مكتملة',   'green'],
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
  const [tab, setTab] = useState<Tab>('records');
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

function RecordsTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<MaintenanceRecord[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterEquip, setFilterEquip] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ equipmentId: '', type: 'PREVENTIVE', description: '', cost: '', performedBy: '', date: '', nextDueDate: '', status: 'COMPLETED' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { pageSize: '500' };
      if (filterEquip) params.equipmentId = filterEquip;
      const res = await api.get('/maintenance/records', { params });
      let data: MaintenanceRecord[] = res.data.data ?? [];
      if (filterStatus) data = data.filter((r) => r.status === filterStatus);
      setRows(data);
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
      const body: Record<string, unknown> = {
        equipmentId: Number(form.equipmentId),
        type: form.type,
        description: form.description,
        status: form.status,
      };
      if (form.cost)        body.cost = Number(form.cost);
      if (form.performedBy) body.performedBy = form.performedBy;
      if (form.date)        body.date = new Date(form.date).toISOString();
      if (form.nextDueDate) body.nextDueDate = new Date(form.nextDueDate).toISOString();
      await api.post('/maintenance/records', body);
      setShowCreate(false);
      setForm({ equipmentId: '', type: 'PREVENTIVE', description: '', cost: '', performedBy: '', date: '', nextDueDate: '', status: 'COMPLETED' });
      load();
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { key: 'equipment', label: 'col.equipment_no',    render: (r: MaintenanceRecord) => <strong style={{ fontFamily: 'monospace' }}>{r.equipment?.code ?? r.equipmentId}</strong> },
    { key: 'type',      label: 'col.maint.type',      render: (r: MaintenanceRecord) => maintenanceType[r.type] ?? r.type },
    { key: 'description', label: 'col.description',   render: (r: MaintenanceRecord) => <span style={{ maxWidth: 220, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span> },
    { key: 'cost',      label: 'col.amount',           render: (r: MaintenanceRecord) => r.cost != null ? money(r.cost) : '—' },
    { key: 'performedBy', label: 'col.maint.performed_by', render: (r: MaintenanceRecord) => r.performedBy ?? '—' },
    { key: 'date',      label: 'col.date',             render: (r: MaintenanceRecord) => dateText(r.date) },
    { key: 'nextDueDate', label: 'col.maint.next_due', render: (r: MaintenanceRecord) => r.nextDueDate ? dateText(r.nextDueDate) : '—' },
    { key: 'status',    label: 'col.status',           render: (r: MaintenanceRecord) => statusBadge(maintenanceStatus, r.status) },
  ];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select style={{ ...inp, width: 200 }} value={filterEquip} onChange={(e) => setFilterEquip(e.target.value)}>
          <option value="">{t('filter.all_equipment')}</option>
          {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
        </select>
        <select style={{ ...inp, width: 180 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">{t('filter.all_statuses')}</option>
          <option value="SCHEDULED">{t('opt.maint.scheduled')}</option>
          <option value="IN_PROGRESS">{t('opt.maint.in_progress')}</option>
          <option value="COMPLETED">{t('opt.maint.completed')}</option>
        </select>
        <div style={{ flex: 1 }} />
        {hasPermission('maintenance.create') && (
          <button className="btn sm" onClick={() => setShowCreate(true)}>{t('action.maint.add_record')}</button>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}

      <DataTable columns={columns} rows={rows} loading={loading} emptyText={t('empty.maint.records')} />

      {showCreate && (
        <Modal title={t('action.maint.add_record')} onClose={() => setShowCreate(false)}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary sm" onClick={() => setShowCreate(false)}>{t('action.cancel')}</button>
              <button className="btn sm" form="maint-record-form" type="submit" disabled={saving}>{saving ? '…' : t('action.save')}</button>
            </div>
          }
        >
          <form id="maint-record-form" onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>{t('field.equipment')} *</label>
              <select style={inp} required value={form.equipmentId} onChange={(e) => setForm({ ...form, equipmentId: e.target.value })}>
                <option value="">{t('field.select_equipment')}</option>
                {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
              </select>
            </div>
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
                <option value="COMPLETED">{t('opt.maint.completed')}</option>
                <option value="IN_PROGRESS">{t('opt.maint.in_progress')}</option>
                <option value="SCHEDULED">{t('opt.maint.scheduled')}</option>
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
  const [filterEquip, setFilterEquip] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ equipmentId: '', liters: '', cost: '', odometer: '', date: '', notes: '' });

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
      setForm({ equipmentId: '', liters: '', cost: '', odometer: '', date: '', notes: '' });
      load();
    } catch (e) {
      alert(errorMessage(e));
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
              <select style={inp} required value={form.equipmentId} onChange={(e) => setForm({ ...form, equipmentId: e.target.value })}>
                <option value="">{t('field.select_equipment')}</option>
                {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
              </select>
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
  const [filterEquip, setFilterEquip] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);
  const [form, setForm] = useState({ equipmentId: '', description: '', severity: 'MEDIUM' });

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
      setForm({ equipmentId: '', description: '', severity: 'MEDIUM' });
      load();
    } catch (e) {
      alert(errorMessage(e));
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
      alert(errorMessage(e));
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
              <select style={inp} required value={form.equipmentId} onChange={(e) => setForm({ ...form, equipmentId: e.target.value })}>
                <option value="">{t('field.select_equipment')}</option>
                {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
              </select>
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
  const [filterEquip, setFilterEquip] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ equipmentId: '', partName: '', quantity: '', unitCost: '', date: '' });

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
      setForm({ equipmentId: '', partName: '', quantity: '', unitCost: '', date: '' });
      load();
    } catch (e) {
      alert(errorMessage(e));
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
              <select style={inp} required value={form.equipmentId} onChange={(e) => setForm({ ...form, equipmentId: e.target.value })}>
                <option value="">{t('field.select_equipment')}</option>
                {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
              </select>
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
