import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { money, dateText, MoneyText, MoneyCell } from '../config/modules';
import { usePersistedState } from '../hooks/usePersistedState';
import { useTableSort } from '../hooks/useTableSort';
import { sortRowsClient } from '../lib/clientSort';
import SortableHeader from '../components/SortableHeader';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  Tabs,
  StatusChip,
  SearchBox,
  FilterChip,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Drawer,
  DrawerSection,
  DrawerField,
  Dialog,
  DialogSection,
  Button,
} from '../components/explorer/ExplorerKit';
import DateInput from '../components/DateInput';
import '../components/explorer/explorer-kit.css';
import './Maintenance.css';
import { fcMoneyHeader } from '../components/financial/financialLabels';

// ── Domain Types ──────────────────────────────────────────────────────────────

interface Equipment { id: number; code: string; name?: string; type?: string; plateNumber?: string; }
interface MaintenanceRecord { id: number; equipmentId: number; equipment?: { id: number; code: string; name?: string }; type: string; description: string; cost?: number | null; performedBy?: string | null; date: string; nextDueDate?: string | null; status: string; createdAt: string; }
interface FuelLog { id: number; equipmentId: number; equipment?: { id: number; code: string }; liters: number; cost: number; odometer?: number | null; date: string; notes?: string | null; }
interface Breakdown { id: number; equipmentId: number; equipment?: { id: number; code: string }; description: string; reportedAt: string; resolvedAt?: string | null; severity: string; status: string; }
interface SparePart { id: number; equipmentId: number; equipment?: { id: number; code: string }; partName: string; quantity: number; unitCost: number; totalCost: number; date: string; }

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

const maintStatus: Record<string, { label: string; tone: Tone; icon: string }> = {
  SCHEDULED: { label: 'مجدولة', tone: 'orange', icon: 'event' },
  IN_PROGRESS: { label: 'قيد التنفيذ', tone: 'blue', icon: 'autorenew' },
  COMPLETED: { label: 'مكتملة', tone: 'green', icon: 'check_circle' },
  CANCELLED: { label: 'ملغاة', tone: 'neutral', icon: 'block' },
};
const maintType: Record<string, string> = { PREVENTIVE: 'وقائية', CORRECTIVE: 'تصحيحية' };
const severity: Record<string, { label: string; tone: Tone; icon: string }> = {
  LOW: { label: 'منخفضة', tone: 'neutral', icon: 'low_priority' },
  MEDIUM: { label: 'متوسطة', tone: 'orange', icon: 'remove' },
  HIGH: { label: 'عالية', tone: 'red', icon: 'priority_high' },
  CRITICAL: { label: 'حرجة', tone: 'red', icon: 'warning' },
};
const bdStatus: Record<string, { label: string; tone: Tone; icon: string }> = {
  OPEN: { label: 'مفتوح', tone: 'red', icon: 'error' },
  RESOLVED: { label: 'محلول', tone: 'green', icon: 'check_circle' },
};
function smchip(map: Record<string, { label: string; tone: Tone; icon: string }>, val: string) {
  const m = map[val] ?? { label: val, tone: 'neutral' as Tone, icon: 'help' };
  return <StatusChip tone={m.tone} icon={m.icon}>{m.label}</StatusChip>;
}

type Tab = 'records' | 'fuel' | 'breakdowns' | 'spare-parts';

// ── Reusable bits ──────────────────────────────────────────────────────────────

function clickRow(handler: () => void) {
  return {
    className: 'xpl-row--click', tabIndex: 0, role: 'button' as const, onClick: handler,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } },
  };
}
const Chevron = () => <td className="decx-col-chevron" style={{ width: 32, textAlign: 'center' }}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, color: 'var(--xpl-muted)' }}>chevron_left</span></td>;
function TableShell({ loading, empty, children }: { loading: boolean; empty: React.ReactNode; children: React.ReactNode }) {
  return <section className="xpl-card" style={{ overflow: 'hidden' }}>{loading ? <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div> : empty ? empty : children}</section>;
}
// مستخرج قيمة الفرز المشترك لجداول الصيانة — عمود «المعدة» يُفرز برمزها المتداخل
function maintSortValue<T extends { equipment?: { code: string } }>(row: T, key: string): unknown {
  return key === 'equipment' ? row.equipment?.code ?? '' : (row as unknown as Record<string, unknown>)[key];
}

// ── Summary KPIs ──────────────────────────────────────────────────────────────

function SummaryKPIs() {
  const { t } = useT();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([]);
  const [due, setDue] = useState<MaintenanceRecord[]>([]);

  useEffect(() => {
    Promise.all([
      api.get('/maintenance/records', { params: { pageSize: 500 } }),
      api.get('/maintenance/breakdowns', { params: { pageSize: 500 } }),
      api.get('/maintenance/due'),
    ]).then(([rRes, bRes, dRes]) => {
      setRecords(rRes.data.data ?? []);
      setBreakdowns(bRes.data.data ?? []);
      setDue(dRes.data.data ?? []);
    }).catch(() => {});
  }, []);

  const totalRecords = records.length;
  const openBreakdowns = breakdowns.filter((b) => b.status === 'OPEN').length;
  const completed = records.filter((r) => r.status === 'COMPLETED').length;
  const dueSoon = due.length;

  return (
    <div className="mntx-metrics">
      <HeroMetric icon="build" label={t('stat.maint.total')} value={totalRecords} sub={<><span className="material-symbols-outlined">check_circle</span>{`${completed} مكتملة`}</>} />
      <div className="xpl-kpi-grid">
        <MetricCard icon="check_circle" tone="green" label={t('stat.maint.completed')} value={completed} />
        <MetricCard icon="error" tone={openBreakdowns > 0 ? 'red' : 'green'} label={t('stat.maint.open')} value={openBreakdowns} sub={openBreakdowns > 0 ? t('stat.maint.needs_attention') : undefined} />
        <MetricCard icon="event_upcoming" tone={dueSoon > 0 ? 'orange' : 'green'} label={t('stat.maint.due_soon')} value={dueSoon} sub={dueSoon > 0 ? t('stat.maint.within_30_days') : undefined} />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Maintenance() {
  const [tab, setTab] = usePersistedState<Tab>('maint:tab', 'records');
  const { t } = useT();
  return (
    <div className="xpl-scope xpl-page" dir="rtl">
      <ExecutiveHeader icon="build" title={t('page.maint.title')} subtitle={t('page.maint.subtitle')} />
      <SummaryKPIs />
      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'records', label: t('tab.maint.records'), icon: 'build' },
          { key: 'fuel', label: t('tab.maint.fuel'), icon: 'local_gas_station' },
          { key: 'breakdowns', label: t('tab.maint.breakdowns'), icon: 'report' },
          { key: 'spare-parts', label: t('tab.maint.spare_parts'), icon: 'settings' },
        ]}
      />
      {tab === 'records' && <RecordsTab />}
      {tab === 'fuel' && <FuelTab />}
      {tab === 'breakdowns' && <BreakdownsTab />}
      {tab === 'spare-parts' && <SparePartsTab />}
    </div>
  );
}

// ── Equipment select (shared) ──────────────────────────────────────────────────

function EquipmentSelect({ value, onChange, equipmentList, plate }: { value: string; onChange: (id: string, plate: string) => void; equipmentList: Equipment[]; plate: string }) {
  const { t } = useT();
  return (
    <DialogSection title={t('field.equipment')} icon="construction">
      <div className="xpl-field xpl-field--full">
        <label>{t('field.equipment')} <span className="req">*</span></label>
        <select className="xpl-select" required value={value} onChange={(e) => { const eq = equipmentList.find((x) => String(x.id) === e.target.value); onChange(e.target.value, eq?.plateNumber ?? ''); }} aria-label={t('field.equipment')}>
          <option value="">{t('field.select_equipment')}</option>
          {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.name ? ` — ${eq.name}` : eq.type ? ` — ${eq.type}` : ''}</option>)}
        </select>
      </div>
      <div className="xpl-field xpl-field--full">
        <label>{t('field.plate_number')}</label>
        <div className="mntx-readonly">{plate || '—'}</div>
      </div>
    </DialogSection>
  );
}

// ── سجلات الصيانة ─────────────────────────────────────────────────────────────

const EMPTY_FORM = { equipmentId: '', plateNumber: '', type: 'PREVENTIVE', description: '', cost: '', performedBy: '', date: '', nextDueDate: '', status: 'COMPLETED' };

function RecordFormBody({ form, setForm, equipmentList, isEdit }: { form: typeof EMPTY_FORM; setForm: (f: typeof EMPTY_FORM) => void; equipmentList: Equipment[]; isEdit: boolean }) {
  const { t } = useT();
  return (
    <>
      {!isEdit && <EquipmentSelect value={form.equipmentId} plate={form.plateNumber} equipmentList={equipmentList} onChange={(id, plate) => setForm({ ...form, equipmentId: id, plateNumber: plate })} />}
      <DialogSection title="تفاصيل الصيانة" icon="build">
        <div className="xpl-field">
          <label>{t('field.maint.type')} <span className="req">*</span></label>
          <select className="xpl-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label={t('field.maint.type')}>
            <option value="PREVENTIVE">{t('opt.maint.preventive')}</option>
            <option value="CORRECTIVE">{t('opt.maint.corrective')}</option>
          </select>
        </div>
        <div className="xpl-field">
          <label>{t('field.status')}</label>
          <select className="xpl-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label={t('field.status')}>
            <option value="SCHEDULED">{t('opt.maint.scheduled')}</option>
            <option value="IN_PROGRESS">{t('opt.maint.in_progress')}</option>
            <option value="COMPLETED">{t('opt.maint.completed')}</option>
            <option value="CANCELLED">{t('opt.maint.cancelled')}</option>
          </select>
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.description')} <span className="req">*</span></label>
          <textarea className="xpl-textarea" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label={t('field.description')} />
        </div>
      </DialogSection>
      <DialogSection title="التكلفة والتنفيذ" icon="payments">
        <div className="xpl-field"><label>{t('field.amount_kd')}</label><input className="xpl-input" type="number" min="0" step="0.001" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} style={{ direction: 'ltr' }} aria-label={t('field.amount_kd')} /></div>
        <div className="xpl-field"><label>{t('field.maint.performed_by')}</label><input className="xpl-input" value={form.performedBy} onChange={(e) => setForm({ ...form, performedBy: e.target.value })} aria-label={t('field.maint.performed_by')} /></div>
      </DialogSection>
      <DialogSection title="الجدولة" icon="event">
        <div className="xpl-field"><label>{t('field.date')}</label><DateInput className="xpl-input" value={form.date} onChange={(v) => setForm({ ...form, date: v })} ariaLabel={t('field.date')} /></div>
        <div className="xpl-field"><label>{t('field.maint.next_due')}</label><DateInput className="xpl-input" value={form.nextDueDate} onChange={(v) => setForm({ ...form, nextDueDate: v })} ariaLabel={t('field.maint.next_due')} /></div>
      </DialogSection>
    </>
  );
}

function RecordsTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<MaintenanceRecord[]>([]);
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = usePersistedState('maint:records:search', '');
  const [filterEquip, setFilterEquip] = usePersistedState('maint:records:equip', '');
  const [filterStatus, setFilterStatus] = usePersistedState('maint:records:status', '');
  const [filterType, setFilterType] = usePersistedState('maint:records:type', '');
  const [filterDateFrom, setFilterDateFrom] = usePersistedState('maint:records:from', '');
  const [filterDateTo, setFilterDateTo] = usePersistedState('maint:records:to', '');
  // فرز محلي موحّد (Enterprise Data Grid Foundation v1) — المجموعة محمّلة بكاملها
  const sort = useTableSort('maintenance-records');

  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState<MaintenanceRecord | null>(null);
  const [editRecord, setEditRecord] = useState<MaintenanceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MaintenanceRecord | null>(null);

  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (filterEquip) params.equipmentId = filterEquip;
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.type = filterType;
      if (filterDateFrom) params.dateFrom = filterDateFrom;
      if (filterDateTo) params.dateTo = filterDateTo;
      const res = await api.get('/maintenance/records', { params });
      setRows(res.data.data ?? []);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [filterEquip, filterStatus, filterType, filterDateFrom, filterDateTo]);

  useEffect(() => {
    load();
    api.get('/equipment', { params: { pageSize: 500 } }).then((r) => setEquipmentList(r.data.data.data ?? [])).catch(() => {});
  }, [load]);

  const visible = search.trim()
    ? rows.filter((r) => {
        const q = search.trim().toLowerCase();
        return (r.equipment?.code ?? '').toLowerCase().includes(q) || (r.equipment?.name ?? '').toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || (r.performedBy ?? '').toLowerCase().includes(q);
      })
    : rows;

  // الفرز المحلي يُطبَّق بعد فلترة البحث الموجودة
  const sorted = useMemo(() => sortRowsClient(visible, sort.sortBy, sort.sortDir, maintSortValue), [visible, sort.sortBy, sort.sortDir]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = { equipmentId: Number(createForm.equipmentId), type: createForm.type, description: createForm.description, status: createForm.status };
      if (createForm.cost) body.cost = Number(createForm.cost);
      if (createForm.performedBy) body.performedBy = createForm.performedBy;
      if (createForm.date) body.date = new Date(createForm.date).toISOString();
      if (createForm.nextDueDate) body.nextDueDate = new Date(createForm.nextDueDate).toISOString();
      await api.post('/maintenance/records', body);
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      load();
    } catch (e) { setFormError(errorMessage(e)); } finally { setSaving(false); }
  }

  function openEdit(r: MaintenanceRecord) {
    setEditRecord(r);
    setEditForm({ equipmentId: String(r.equipmentId), plateNumber: '', type: r.type, description: r.description, cost: r.cost != null ? String(r.cost) : '', performedBy: r.performedBy ?? '', date: r.date ? r.date.slice(0, 10) : '', nextDueDate: r.nextDueDate ? r.nextDueDate.slice(0, 10) : '', status: r.status });
    setFormError('');
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRecord) return;
    setSaving(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = { type: editForm.type, description: editForm.description, status: editForm.status };
      if (editForm.cost) body.cost = Number(editForm.cost);
      if (editForm.performedBy) body.performedBy = editForm.performedBy;
      if (editForm.date) body.date = new Date(editForm.date).toISOString();
      body.nextDueDate = editForm.nextDueDate ? new Date(editForm.nextDueDate).toISOString() : null;
      await api.patch(`/maintenance/records/${editRecord.id}`, body);
      setEditRecord(null);
      load();
    } catch (e) { setFormError(errorMessage(e)); } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await api.delete(`/maintenance/records/${deleteTarget.id}`); setDeleteTarget(null); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); setDeleteTarget(null); } finally { setDeleting(false); }
  }

  const TYPE_CHIPS = [['', t('filter.all_types')], ['PREVENTIVE', t('opt.maint.preventive')], ['CORRECTIVE', t('opt.maint.corrective')]];
  const STATUS_CHIPS = [['', t('filter.all_statuses')], ['SCHEDULED', t('opt.maint.scheduled')], ['IN_PROGRESS', t('opt.maint.in_progress')], ['COMPLETED', t('opt.maint.completed')], ['CANCELLED', t('opt.maint.cancelled')]];

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={setSearch} placeholder={t('search.placeholder')} ariaLabel={t('search.placeholder')} />
          <div className="xpl-field" style={{ minWidth: 170 }}>
            <span className="xpl-field-label">{t('filter.all_equipment')}</span>
            <select className="xpl-select" aria-label={t('filter.all_equipment')} value={filterEquip} onChange={(e) => setFilterEquip(e.target.value)}>
              <option value="">{t('filter.all_equipment')}</option>
              {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.name ? ` — ${eq.name}` : eq.type ? ` — ${eq.type}` : ''}</option>)}
            </select>
          </div>
          <div className="xpl-field" style={{ minWidth: 140 }}><span className="xpl-field-label">{t('filter.date_from')}</span><DateInput className="xpl-input" ariaLabel={t('filter.date_from')} value={filterDateFrom} onChange={setFilterDateFrom} /></div>
          <div className="xpl-field" style={{ minWidth: 140 }}><span className="xpl-field-label">{t('filter.date_to')}</span><DateInput className="xpl-input" ariaLabel={t('filter.date_to')} value={filterDateTo} onChange={setFilterDateTo} /></div>
          <Button variant="ghost" icon="refresh" busy={loading} onClick={load}>{t('action.refresh')}</Button>
          {hasPermission('maintenance.create') && <Button variant="primary" icon="add" onClick={() => { setCreateForm(EMPTY_FORM); setFormError(''); setShowCreate(true); }}>{t('action.maint.add_record')}</Button>}
        </div>
        <div className="xpl-toolbar-row">
          {TYPE_CHIPS.map(([v, l]) => <FilterChip key={`t${v}`} active={filterType === v} onClick={() => setFilterType(v)}>{l}</FilterChip>)}
          <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--xpl-border)' }} />
          {STATUS_CHIPS.map(([v, l]) => <FilterChip key={`s${v}`} active={filterStatus === v} onClick={() => setFilterStatus(v)}>{l}</FilterChip>)}
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <TableShell loading={loading} empty={!loading && visible.length === 0 && <EmptyState icon="build" tone="neutral" title={t('empty.maint.records')} action={hasPermission('maintenance.create') ? <Button variant="primary" icon="add" onClick={() => { setCreateForm(EMPTY_FORM); setShowCreate(true); }}>{t('action.maint.add_record')}</Button> : undefined} />}>
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead><tr>
              <SortableHeader label={t('col.equipment_no')} title={t('col.equipment_no')} state={sort.getState('equipment')} onToggle={() => sort.toggle('equipment')} />
              <SortableHeader label={t('col.maint.type')} title={t('col.maint.type')} state={sort.getState('type')} onToggle={() => sort.toggle('type')} />
              <SortableHeader label={t('col.description')} title={t('col.description')} state={sort.getState('description')} onToggle={() => sort.toggle('description')} />
              <SortableHeader label={fcMoneyHeader(t('col.amount'))} title={t('col.amount')} state={sort.getState('cost')} onToggle={() => sort.toggle('cost')} />
              <SortableHeader label={t('col.maint.performed_by')} title={t('col.maint.performed_by')} state={sort.getState('performedBy')} onToggle={() => sort.toggle('performedBy')} />
              <SortableHeader label={t('col.date')} title={t('col.date')} state={sort.getState('date')} onToggle={() => sort.toggle('date')} />
              <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('status')} onToggle={() => sort.toggle('status')} />
              <th aria-label="فتح" />
            </tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} {...clickRow(() => setViewing(r))} aria-label={`تفاصيل صيانة ${r.equipment?.code ?? r.equipmentId}`}>
                  <td><span className="mntx-code">{r.equipment?.code ?? r.equipmentId}</span>{r.equipment?.name ? <span style={{ color: 'var(--xpl-muted)', fontSize: 12, marginInlineStart: 6 }}>{r.equipment.name}</span> : null}</td>
                  <td>{maintType[r.type] ?? r.type}</td>
                  <td><span className="mntx-desc">{r.description}</span></td>
                  <td>{r.cost != null ? <MoneyCell value={r.cost} /> : '—'}</td>
                  <td>{r.performedBy ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.date)}</td>
                  <td>{smchip(maintStatus, r.status)}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      {viewing && (
        <Drawer
          title={`${maintType[viewing.type] ?? viewing.type} — ${viewing.equipment?.code ?? viewing.equipmentId}`}
          onClose={() => setViewing(null)}
          hero={<div className="xpl-drawer-hero"><div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">build</span></div><div className="xpl-drawer-hero-body"><span className="xpl-drawer-hero-title">{viewing.equipment?.code ?? viewing.equipmentId}</span><span className="xpl-drawer-hero-sub">{viewing.equipment?.name ?? ''} · {maintType[viewing.type] ?? viewing.type}</span><div style={{ marginTop: 4 }}>{smchip(maintStatus, viewing.status)}</div></div></div>}
          footer={<>
            {hasPermission('maintenance.update') && <Button variant="primary" icon="edit" onClick={() => { openEdit(viewing); setViewing(null); }}>{t('action.maint.edit')}</Button>}
            {hasPermission('maintenance.delete') && <Button variant="danger" icon="delete" busy={deleting} onClick={() => setDeleteTarget(viewing)}>{t('action.maint.delete')}</Button>}
          </>}
        >
          <DrawerSection title="المعدة والتفاصيل">
            <DrawerField label={t('field.equipment')} value={viewing.equipment ? `${viewing.equipment.code}${viewing.equipment.name ? ' — ' + viewing.equipment.name : ''}` : String(viewing.equipmentId)} />
            <DrawerField label={t('field.maint.type')} value={maintType[viewing.type] ?? viewing.type} />
            <DrawerField label={t('field.status')} value={smchip(maintStatus, viewing.status)} />
          </DrawerSection>
          <DrawerSection title="التكلفة والتنفيذ">
            <DrawerField label={t('col.amount')} value={viewing.cost != null ? <MoneyText value={viewing.cost} /> : '—'} />
            <DrawerField label={t('field.maint.performed_by')} value={viewing.performedBy ?? '—'} />
          </DrawerSection>
          <DrawerSection title="الجدولة">
            <DrawerField label={t('field.date')} value={dateText(viewing.date)} />
            <DrawerField label={t('field.maint.next_due')} value={viewing.nextDueDate ? dateText(viewing.nextDueDate) : '—'} />
            <DrawerField label={t('col.created_at')} value={dateText(viewing.createdAt)} />
          </DrawerSection>
          <DrawerSection title={t('field.description')}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--xpl-text)' }}>{viewing.description}</p>
          </DrawerSection>
        </Drawer>
      )}

      {showCreate && (
        <Dialog icon="add_task" title={t('action.maint.add_record')} size="lg" onClose={() => setShowCreate(false)}
          footer={<><Button variant="primary" icon="save" type="submit" form="maint-record-create" busy={saving}>{t('action.save')}</Button><Button variant="ghost" onClick={() => setShowCreate(false)}>{t('action.cancel')}</Button></>}>
          {formError && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{formError}</div>}
          <form id="maint-record-create" onSubmit={handleCreate}><RecordFormBody form={createForm} setForm={setCreateForm} equipmentList={equipmentList} isEdit={false} /><input type="submit" hidden disabled={saving} /></form>
        </Dialog>
      )}
      {editRecord && (
        <Dialog icon="edit" title={t('action.maint.edit')} size="lg" onClose={() => setEditRecord(null)}
          footer={<><Button variant="primary" icon="save" type="submit" form="maint-record-edit" busy={saving}>{t('action.save')}</Button><Button variant="ghost" onClick={() => setEditRecord(null)}>{t('action.cancel')}</Button></>}>
          {formError && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{formError}</div>}
          <form id="maint-record-edit" onSubmit={handleEdit}><RecordFormBody form={editForm} setForm={setEditForm} equipmentList={equipmentList} isEdit /><input type="submit" hidden disabled={saving} /></form>
        </Dialog>
      )}
      {deleteTarget && (
        <Dialog icon="delete" title={t('action.maint.delete')} size="sm" onClose={() => setDeleteTarget(null)}
          footer={<><Button variant="danger" icon="delete" busy={deleting} onClick={handleDelete}>{t('action.maint.delete')}</Button><Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t('action.cancel')}</Button></>}>
          <p style={{ margin: 0 }}>{t('action.maint.confirm_delete')}</p>
          <p style={{ margin: '8px 0 0', fontWeight: 700, color: 'var(--xpl-muted)', fontSize: 13 }}>{deleteTarget.equipment?.code ?? deleteTarget.equipmentId} — {maintType[deleteTarget.type] ?? deleteTarget.type} — {dateText(deleteTarget.date)}</p>
        </Dialog>
      )}
    </>
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
  // فرز محلي موحّد (Enterprise Data Grid Foundation v1) — المجموعة محمّلة بكاملها
  const sort = useTableSort('maintenance-fuel');
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState<FuelLog | null>(null);
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
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [filterEquip]);

  useEffect(() => { load(); api.get('/equipment', { params: { pageSize: 500 } }).then((r) => setEquipmentList(r.data.data.data ?? [])).catch(() => {}); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { equipmentId: Number(form.equipmentId), liters: Number(form.liters), cost: Number(form.cost) };
      if (form.odometer) body.odometer = Number(form.odometer);
      if (form.date) body.date = new Date(form.date).toISOString();
      if (form.notes) body.notes = form.notes;
      await api.post('/maintenance/fuel', body);
      setShowCreate(false);
      setForm({ equipmentId: '', plateNumber: '', liters: '', cost: '', odometer: '', date: '', notes: '' });
      load();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }

  const sorted = useMemo(() => sortRowsClient(rows, sort.sortBy, sort.sortDir, maintSortValue), [rows, sort.sortBy, sort.sortDir]);

  const totalLiters = rows.reduce((s, r) => s + r.liters, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);

  return (
    <>
      <div className="xpl-kpi-grid">
        <MetricCard icon="local_gas_station" tone="blue" label={t('stat.maint.total_liters')} value={`${totalLiters.toLocaleString()} L`} />
        <MetricCard icon="payments" tone="green" label={t('stat.maint.fuel_cost')} value={<MoneyText value={totalCost} />} />
      </div>

      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <div className="xpl-field" style={{ minWidth: 180 }}>
            <span className="xpl-field-label">{t('filter.all_equipment')}</span>
            <select className="xpl-select" aria-label={t('filter.all_equipment')} value={filterEquip} onChange={(e) => setFilterEquip(e.target.value)}>
              <option value="">{t('filter.all_equipment')}</option>
              {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
            </select>
          </div>
          <Button variant="ghost" icon="refresh" busy={loading} onClick={load} style={{ marginInlineStart: 'auto' }}>{t('action.refresh')}</Button>
          {hasPermission('maintenance.create') && <Button variant="primary" icon="add" onClick={() => setShowCreate(true)}>{t('action.maint.add_fuel')}</Button>}
        </div>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <TableShell loading={loading} empty={!loading && rows.length === 0 && <EmptyState icon="local_gas_station" tone="neutral" title={t('empty.maint.fuel')} action={hasPermission('maintenance.create') ? <Button variant="primary" icon="add" onClick={() => setShowCreate(true)}>{t('action.maint.add_fuel')}</Button> : undefined} />}>
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead><tr>
              <SortableHeader label={t('col.equipment_no')} title={t('col.equipment_no')} state={sort.getState('equipment')} onToggle={() => sort.toggle('equipment')} />
              <SortableHeader label={t('col.maint.liters')} title={t('col.maint.liters')} state={sort.getState('liters')} onToggle={() => sort.toggle('liters')} />
              <SortableHeader label={fcMoneyHeader(t('col.amount'))} title={t('col.amount')} state={sort.getState('cost')} onToggle={() => sort.toggle('cost')} />
              <SortableHeader label={t('col.maint.odometer')} title={t('col.maint.odometer')} state={sort.getState('odometer')} onToggle={() => sort.toggle('odometer')} />
              <SortableHeader label={t('col.date')} title={t('col.date')} state={sort.getState('date')} onToggle={() => sort.toggle('date')} />
              <th>{t('col.notes')}</th>
              <th aria-label="فتح" />
            </tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} {...clickRow(() => setViewing(r))} aria-label={`تفاصيل وقود ${r.equipment?.code ?? r.equipmentId}`}>
                  <td><span className="mntx-code">{r.equipment?.code ?? r.equipmentId}</span></td>
                  <td>{r.liters.toLocaleString()} L</td>
                  <td>{<MoneyCell value={r.cost} />}</td>
                  <td>{r.odometer != null ? `${r.odometer.toLocaleString()} km` : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.date)}</td>
                  <td>{r.notes ?? '—'}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      {viewing && (
        <Drawer title={`${t('tab.maint.fuel')} — ${viewing.equipment?.code ?? viewing.equipmentId}`} onClose={() => setViewing(null)}
          hero={<div className="xpl-drawer-hero"><div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">local_gas_station</span></div><div className="xpl-drawer-hero-body"><span className="xpl-drawer-hero-title">{viewing.liters.toLocaleString()} L</span><span className="xpl-drawer-hero-sub">{viewing.equipment?.code ?? viewing.equipmentId} · {<MoneyText value={viewing.cost} />}</span></div></div>}>
          <DrawerSection title="التفاصيل">
            <DrawerField label={t('col.equipment_no')} value={viewing.equipment?.code ?? viewing.equipmentId} mono />
            <DrawerField label={t('col.maint.liters')} value={`${viewing.liters.toLocaleString()} L`} />
            <DrawerField label={t('col.amount')} value={<MoneyText value={viewing.cost} />} />
            <DrawerField label={t('col.maint.odometer')} value={viewing.odometer != null ? `${viewing.odometer.toLocaleString()} km` : '—'} />
            <DrawerField label={t('col.date')} value={dateText(viewing.date)} />
          </DrawerSection>
          {viewing.notes && <DrawerSection title={t('field.notes')}><p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{viewing.notes}</p></DrawerSection>}
        </Drawer>
      )}

      {showCreate && (
        <Dialog icon="local_gas_station" title={t('action.maint.add_fuel')} size="lg" onClose={() => setShowCreate(false)}
          footer={<><Button variant="primary" icon="save" type="submit" form="maint-fuel-form" busy={saving}>{t('action.save')}</Button><Button variant="ghost" onClick={() => setShowCreate(false)}>{t('action.cancel')}</Button></>}>
          <form id="maint-fuel-form" onSubmit={handleCreate}>
            <EquipmentSelect value={form.equipmentId} plate={form.plateNumber} equipmentList={equipmentList} onChange={(id, plate) => setForm({ ...form, equipmentId: id, plateNumber: plate })} />
            <DialogSection title="بيانات الوقود" icon="local_gas_station">
              <div className="xpl-field"><label>{t('field.maint.liters')} <span className="req">*</span></label><input className="xpl-input" type="number" min="0.001" step="0.001" required value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} style={{ direction: 'ltr' }} aria-label={t('field.maint.liters')} /></div>
              <div className="xpl-field"><label>{t('field.amount_kd')} <span className="req">*</span></label><input className="xpl-input" type="number" min="0" step="0.001" required value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} style={{ direction: 'ltr' }} aria-label={t('field.amount_kd')} /></div>
              <div className="xpl-field"><label>{t('field.maint.odometer')}</label><input className="xpl-input" type="number" min="0" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} style={{ direction: 'ltr' }} aria-label={t('field.maint.odometer')} /></div>
              <div className="xpl-field"><label>{t('field.date')}</label><DateInput className="xpl-input" value={form.date} onChange={(v) => setForm({ ...form, date: v })} ariaLabel={t('field.date')} /></div>
              <div className="xpl-field xpl-field--full"><label>{t('field.notes')}</label><textarea className="xpl-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} aria-label={t('field.notes')} /></div>
            </DialogSection>
            <input type="submit" hidden disabled={saving} />
          </form>
        </Dialog>
      )}
    </>
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
  // فرز محلي موحّد (Enterprise Data Grid Foundation v1) — المجموعة محمّلة بكاملها
  const sort = useTableSort('maintenance-breakdowns');
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState<Breakdown | null>(null);
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
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [filterEquip, filterStatus]);

  useEffect(() => { load(); api.get('/equipment', { params: { pageSize: 500 } }).then((r) => setEquipmentList(r.data.data.data ?? [])).catch(() => {}); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/maintenance/breakdowns', { equipmentId: Number(form.equipmentId), description: form.description, severity: form.severity });
      setShowCreate(false);
      setForm({ equipmentId: '', plateNumber: '', description: '', severity: 'MEDIUM' });
      load();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }

  async function handleResolve(id: number) {
    setResolving(id);
    try { await api.patch(`/maintenance/breakdowns/${id}/resolve`); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setResolving(null); }
  }

  const sorted = useMemo(() => sortRowsClient(rows, sort.sortBy, sort.sortDir, maintSortValue), [rows, sort.sortBy, sort.sortDir]);

  const openCount = rows.filter((r) => r.status === 'OPEN').length;
  const resolvedCount = rows.filter((r) => r.status === 'RESOLVED').length;
  const STATUS_CHIPS = [['', t('filter.all_statuses')], ['OPEN', t('opt.maint.breakdown_open')], ['RESOLVED', t('opt.maint.breakdown_resolved')]];

  return (
    <>
      <div className="xpl-kpi-grid">
        <MetricCard icon="error" tone="red" label={t('stat.maint.open_breakdowns')} value={openCount} />
        <MetricCard icon="check_circle" tone="green" label={t('stat.maint.resolved_breakdowns')} value={resolvedCount} />
      </div>

      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <div className="xpl-field" style={{ minWidth: 180 }}>
            <span className="xpl-field-label">{t('filter.all_equipment')}</span>
            <select className="xpl-select" aria-label={t('filter.all_equipment')} value={filterEquip} onChange={(e) => setFilterEquip(e.target.value)}>
              <option value="">{t('filter.all_equipment')}</option>
              {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
            </select>
          </div>
          <Button variant="ghost" icon="refresh" busy={loading} onClick={load} style={{ marginInlineStart: 'auto' }}>{t('action.refresh')}</Button>
          {hasPermission('maintenance.create') && <Button variant="primary" icon="add" onClick={() => setShowCreate(true)}>{t('action.maint.report_breakdown')}</Button>}
        </div>
        <div className="xpl-toolbar-row">
          {STATUS_CHIPS.map(([v, l]) => <FilterChip key={v} active={filterStatus === v} onClick={() => setFilterStatus(v)}>{l}</FilterChip>)}
        </div>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <TableShell loading={loading} empty={!loading && rows.length === 0 && <EmptyState icon="report" tone="neutral" title={t('empty.maint.breakdowns')} action={hasPermission('maintenance.create') ? <Button variant="primary" icon="add" onClick={() => setShowCreate(true)}>{t('action.maint.report_breakdown')}</Button> : undefined} />}>
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead><tr>
              <SortableHeader label={t('col.equipment_no')} title={t('col.equipment_no')} state={sort.getState('equipment')} onToggle={() => sort.toggle('equipment')} />
              <SortableHeader label={t('col.description')} title={t('col.description')} state={sort.getState('description')} onToggle={() => sort.toggle('description')} />
              <SortableHeader label={t('col.maint.severity')} title={t('col.maint.severity')} state={sort.getState('severity')} onToggle={() => sort.toggle('severity')} />
              <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('status')} onToggle={() => sort.toggle('status')} />
              <SortableHeader label={t('col.maint.reported_at')} title={t('col.maint.reported_at')} state={sort.getState('reportedAt')} onToggle={() => sort.toggle('reportedAt')} />
              <SortableHeader label={t('col.maint.resolved_at')} title={t('col.maint.resolved_at')} state={sort.getState('resolvedAt')} onToggle={() => sort.toggle('resolvedAt')} />
              <th aria-label="فتح" />
            </tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} {...clickRow(() => setViewing(r))} aria-label={`تفاصيل عطل ${r.equipment?.code ?? r.equipmentId}`}>
                  <td><span className="mntx-code">{r.equipment?.code ?? r.equipmentId}</span></td>
                  <td><span className="mntx-desc">{r.description}</span></td>
                  <td>{smchip(severity, r.severity)}</td>
                  <td>{smchip(bdStatus, r.status)}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.reportedAt)}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{r.resolvedAt ? dateText(r.resolvedAt) : '—'}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      {viewing && (
        <Drawer title={`${t('tab.maint.breakdowns')} — ${viewing.equipment?.code ?? viewing.equipmentId}`} onClose={() => setViewing(null)}
          hero={<div className="xpl-drawer-hero"><div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">report</span></div><div className="xpl-drawer-hero-body"><span className="xpl-drawer-hero-title">{viewing.equipment?.code ?? viewing.equipmentId}</span><div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{smchip(severity, viewing.severity)}{smchip(bdStatus, viewing.status)}</div></div></div>}
          footer={viewing.status === 'OPEN' && hasPermission('maintenance.create') ? <Button variant="primary" icon="task_alt" busy={resolving === viewing.id} onClick={() => handleResolve(viewing.id)}>{t('action.maint.resolve')}</Button> : undefined}>
          <DrawerSection title="التفاصيل">
            <DrawerField label={t('col.equipment_no')} value={viewing.equipment?.code ?? viewing.equipmentId} mono />
            <DrawerField label={t('col.maint.severity')} value={smchip(severity, viewing.severity)} />
            <DrawerField label={t('col.status')} value={smchip(bdStatus, viewing.status)} />
            <DrawerField label={t('col.maint.reported_at')} value={dateText(viewing.reportedAt)} />
            <DrawerField label={t('col.maint.resolved_at')} value={viewing.resolvedAt ? dateText(viewing.resolvedAt) : '—'} />
          </DrawerSection>
          <DrawerSection title={t('field.description')}><p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{viewing.description}</p></DrawerSection>
        </Drawer>
      )}

      {showCreate && (
        <Dialog icon="report" title={t('action.maint.report_breakdown')} size="lg" onClose={() => setShowCreate(false)}
          footer={<><Button variant="primary" icon="save" type="submit" form="maint-breakdown-form" busy={saving}>{t('action.save')}</Button><Button variant="ghost" onClick={() => setShowCreate(false)}>{t('action.cancel')}</Button></>}>
          <form id="maint-breakdown-form" onSubmit={handleCreate}>
            <EquipmentSelect value={form.equipmentId} plate={form.plateNumber} equipmentList={equipmentList} onChange={(id, plate) => setForm({ ...form, equipmentId: id, plateNumber: plate })} />
            <DialogSection title="تفاصيل العطل" icon="report">
              <div className="xpl-field xpl-field--full"><label>{t('field.description')} <span className="req">*</span></label><textarea className="xpl-textarea" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label={t('field.description')} /></div>
              <div className="xpl-field xpl-field--full">
                <label>{t('field.maint.severity')}</label>
                <select className="xpl-select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} aria-label={t('field.maint.severity')}>
                  <option value="LOW">{t('opt.maint.sev_low')}</option>
                  <option value="MEDIUM">{t('opt.maint.sev_medium')}</option>
                  <option value="HIGH">{t('opt.maint.sev_high')}</option>
                  <option value="CRITICAL">{t('opt.maint.sev_critical')}</option>
                </select>
              </div>
            </DialogSection>
            <input type="submit" hidden disabled={saving} />
          </form>
        </Dialog>
      )}
    </>
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
  // فرز محلي موحّد (Enterprise Data Grid Foundation v1) — المجموعة محمّلة بكاملها
  const sort = useTableSort('maintenance-spares');
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState<SparePart | null>(null);
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
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [filterEquip]);

  useEffect(() => { load(); api.get('/equipment', { params: { pageSize: 500 } }).then((r) => setEquipmentList(r.data.data.data ?? [])).catch(() => {}); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { equipmentId: Number(form.equipmentId), partName: form.partName, quantity: Number(form.quantity), unitCost: Number(form.unitCost) };
      if (form.date) body.date = new Date(form.date).toISOString();
      await api.post('/maintenance/spare-parts', body);
      setShowCreate(false);
      setForm({ equipmentId: '', plateNumber: '', partName: '', quantity: '', unitCost: '', date: '' });
      load();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }

  const sorted = useMemo(() => sortRowsClient(rows, sort.sortBy, sort.sortDir, maintSortValue), [rows, sort.sortBy, sort.sortDir]);

  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);

  return (
    <>
      <div className="xpl-kpi-grid">
        <MetricCard icon="settings" tone="indigo" label={t('stat.maint.spare_parts_count')} value={rows.length} />
        <MetricCard icon="payments" tone="green" label={t('stat.maint.spare_parts_cost')} value={<MoneyText value={totalCost} />} />
      </div>

      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <div className="xpl-field" style={{ minWidth: 180 }}>
            <span className="xpl-field-label">{t('filter.all_equipment')}</span>
            <select className="xpl-select" aria-label={t('filter.all_equipment')} value={filterEquip} onChange={(e) => setFilterEquip(e.target.value)}>
              <option value="">{t('filter.all_equipment')}</option>
              {equipmentList.map((eq) => <option key={eq.id} value={eq.id}>{eq.code}{eq.type ? ` — ${eq.type}` : ''}</option>)}
            </select>
          </div>
          <Button variant="ghost" icon="refresh" busy={loading} onClick={load} style={{ marginInlineStart: 'auto' }}>{t('action.refresh')}</Button>
          {hasPermission('maintenance.create') && <Button variant="primary" icon="add" onClick={() => setShowCreate(true)}>{t('action.maint.add_spare_part')}</Button>}
        </div>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <TableShell loading={loading} empty={!loading && rows.length === 0 && <EmptyState icon="settings" tone="neutral" title={t('empty.maint.spare_parts')} action={hasPermission('maintenance.create') ? <Button variant="primary" icon="add" onClick={() => setShowCreate(true)}>{t('action.maint.add_spare_part')}</Button> : undefined} />}>
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead><tr>
              <SortableHeader label={t('col.equipment_no')} title={t('col.equipment_no')} state={sort.getState('equipment')} onToggle={() => sort.toggle('equipment')} />
              <SortableHeader label={t('col.maint.part_name')} title={t('col.maint.part_name')} state={sort.getState('partName')} onToggle={() => sort.toggle('partName')} />
              <SortableHeader label={t('col.maint.quantity')} title={t('col.maint.quantity')} state={sort.getState('quantity')} onToggle={() => sort.toggle('quantity')} />
              <SortableHeader label={fcMoneyHeader(t('col.maint.unit_cost'))} title={t('col.maint.unit_cost')} state={sort.getState('unitCost')} onToggle={() => sort.toggle('unitCost')} />
              <SortableHeader label={fcMoneyHeader(t('col.maint.total_cost'))} title={t('col.maint.total_cost')} state={sort.getState('totalCost')} onToggle={() => sort.toggle('totalCost')} />
              <SortableHeader label={t('col.date')} title={t('col.date')} state={sort.getState('date')} onToggle={() => sort.toggle('date')} />
              <th aria-label="فتح" />
            </tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} {...clickRow(() => setViewing(r))} aria-label={`تفاصيل قطعة ${r.partName}`}>
                  <td><span className="mntx-code">{r.equipment?.code ?? r.equipmentId}</span></td>
                  <td><strong>{r.partName}</strong></td>
                  <td>{r.quantity}</td>
                  <td>{<MoneyCell value={r.unitCost} />}</td>
                  <td style={{ fontWeight: 700 }}>{<MoneyCell value={r.totalCost} />}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.date)}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      {viewing && (
        <Drawer title={`${viewing.partName}`} onClose={() => setViewing(null)}
          hero={<div className="xpl-drawer-hero"><div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">settings</span></div><div className="xpl-drawer-hero-body"><span className="xpl-drawer-hero-title">{viewing.partName}</span><span className="xpl-drawer-hero-sub">{viewing.equipment?.code ?? viewing.equipmentId} · {<MoneyText value={viewing.totalCost} />}</span></div></div>}>
          <DrawerSection title="التفاصيل">
            <DrawerField label={t('col.equipment_no')} value={viewing.equipment?.code ?? viewing.equipmentId} mono />
            <DrawerField label={t('col.maint.part_name')} value={viewing.partName} />
            <DrawerField label={t('col.maint.quantity')} value={viewing.quantity} />
            <DrawerField label={t('col.maint.unit_cost')} value={<MoneyText value={viewing.unitCost} />} />
            <DrawerField label={t('col.maint.total_cost')} value={<MoneyText value={viewing.totalCost} />} />
            <DrawerField label={t('col.date')} value={dateText(viewing.date)} />
          </DrawerSection>
        </Drawer>
      )}

      {showCreate && (
        <Dialog icon="settings" title={t('action.maint.add_spare_part')} size="lg" onClose={() => setShowCreate(false)}
          footer={<><Button variant="primary" icon="save" type="submit" form="maint-spare-form" busy={saving}>{t('action.save')}</Button><Button variant="ghost" onClick={() => setShowCreate(false)}>{t('action.cancel')}</Button></>}>
          <form id="maint-spare-form" onSubmit={handleCreate}>
            <EquipmentSelect value={form.equipmentId} plate={form.plateNumber} equipmentList={equipmentList} onChange={(id, plate) => setForm({ ...form, equipmentId: id, plateNumber: plate })} />
            <DialogSection title="بيانات القطعة" icon="settings">
              <div className="xpl-field xpl-field--full"><label>{t('field.maint.part_name')} <span className="req">*</span></label><input className="xpl-input" required value={form.partName} onChange={(e) => setForm({ ...form, partName: e.target.value })} aria-label={t('field.maint.part_name')} /></div>
              <div className="xpl-field"><label>{t('field.maint.quantity')} <span className="req">*</span></label><input className="xpl-input" type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={{ direction: 'ltr' }} aria-label={t('field.maint.quantity')} /></div>
              <div className="xpl-field"><label>{t('field.maint.unit_cost')} <span className="req">*</span></label><input className="xpl-input" type="number" min="0" step="0.001" required value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} style={{ direction: 'ltr' }} aria-label={t('field.maint.unit_cost')} /></div>
              <div className="xpl-field xpl-field--full"><label>{t('field.date')}</label><DateInput className="xpl-input" value={form.date} onChange={(v) => setForm({ ...form, date: v })} ariaLabel={t('field.date')} /></div>
            </DialogSection>
            <input type="submit" hidden disabled={saving} />
          </form>
        </Dialog>
      )}
    </>
  );
}
