import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import { dateText } from '../config/modules';
import { usePersistedState } from '../hooks/usePersistedState';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Employee {
  id: number;
  code: string;
  fullName: string;
}

interface AttendanceRecord {
  id: number;
  employeeId: number;
  employee?: { id: number; code: string; fullName: string };
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workHours?: number | null;
  status: string;
  notes?: string | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type PillCls = 'green' | 'amber' | 'red' | 'blue' | 'gray';
function pill(label: string, cls: PillCls) {
  return <span className={`pill ${cls}`}>{label}</span>;
}

const statusMap: Record<string, [string, PillCls]> = {
  PRESENT: ['حاضر',   'green'],
  ABSENT:  ['غائب',   'red'],
  LATE:    ['متأخر',  'amber'],
  LEAVE:   ['إجازة',  'blue'],
};

function statusBadge(val: string) {
  const [label, cls] = statusMap[val] ?? [val, 'gray'];
  return pill(label, cls);
}

function timeText(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function calcWorkHours(checkIn?: string | null, checkOut?: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const h = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 36e5;
  return Math.max(0, Math.round(h * 100) / 100);
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

// ── KPI strip ─────────────────────────────────────────────────────────────────

interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
}

const DEFAULT_STATS: AttendanceStats = { total: 0, present: 0, absent: 0, late: 0, leave: 0 };

function SummaryKPIs({ stats }: { stats: AttendanceStats }) {
  const { t } = useT();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
      <StatCard label={t('stat.att.total')}   value={stats.total}   icon="📋" color="#3b82f6" bg="#dbeafe" />
      <StatCard label={t('stat.att.present')} value={stats.present} icon="✅" color="#10b981" bg="#d1fae5" />
      <StatCard label={t('stat.att.absent')}  value={stats.absent}  icon="❌" color="#ef4444" bg="#fee2e2" />
      <StatCard label={t('stat.att.late')}    value={stats.late}    icon="⏰" color="#f59e0b" bg="#fef3c7" />
    </div>
  );
}

// ── Attendance Form ───────────────────────────────────────────────────────────

type FormData = {
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: string;
  notes: string;
};

const EMPTY_FORM: FormData = {
  employeeId: '',
  date: new Date().toISOString().slice(0, 10),
  checkIn: '',
  checkOut: '',
  status: 'PRESENT',
  notes: '',
};
const EMPTY_FORM_JSON = JSON.stringify(EMPTY_FORM);

function AttendanceForm({
  id,
  form,
  setForm,
  onSubmit,
  saving,
  employeeList,
  isEdit,
}: {
  id: string;
  form: FormData;
  setForm: (f: FormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  employeeList: Employee[];
  isEdit: boolean;
}) {
  const { t } = useT();

  const computedHours = calcWorkHours(
    form.checkIn ? `${form.date}T${form.checkIn}` : null,
    form.checkOut ? `${form.date}T${form.checkOut}` : null,
  );

  return (
    <form id={id} onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {!isEdit && (
        <div style={{ gridColumn: '1/-1' }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>
            {t('field.att.employee')} *
          </label>
          <select style={inp} required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
            <option value="">{t('ph.att.select_employee')}</option>
            {employeeList.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.code})</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>
          {t('field.date')} *
        </label>
        <input style={inp} type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} disabled={isEdit} />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>
          {t('field.status')}
        </label>
        <select style={inp} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="PRESENT">{t('opt.att.present')}</option>
          <option value="ABSENT">{t('opt.att.absent')}</option>
          <option value="LATE">{t('opt.att.late')}</option>
          <option value="LEAVE">{t('opt.att.leave')}</option>
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>
          {t('field.att.check_in')}
        </label>
        <input style={inp} type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>
          {t('field.att.check_out')}
        </label>
        <input style={inp} type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} />
      </div>

      {(form.checkIn && form.checkOut) && (
        <div style={{ gridColumn: '1/-1' }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>
            {t('field.att.work_hours')}
          </label>
          <div style={{ ...inp, background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'default' }}>
            {computedHours != null ? `${computedHours} ساعة` : '—'}
          </div>
        </div>
      )}

      <div style={{ gridColumn: '1/-1' }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>
          {t('field.notes')}
        </label>
        <textarea
          style={{ ...inp, minHeight: 64, resize: 'vertical' }}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <input type="submit" hidden disabled={saving} />
    </form>
  );
}

// ── Details Modal ─────────────────────────────────────────────────────────────

function DetailsModal({ record, onClose }: { record: AttendanceRecord; onClose: () => void }) {
  const { t } = useT();
  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
  return (
    <Modal title={t('modal.att.details_title')} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {row(t('col.att.employee'),  record.employee ? `${record.employee.fullName} (${record.employee.code})` : record.employeeId)}
        {row(t('field.date'),        dateText(record.date))}
        {row(t('field.status'),      statusBadge(record.status))}
        {row(t('col.att.check_in'),  timeText(record.checkIn))}
        {row(t('col.att.check_out'), timeText(record.checkOut))}
        {row(t('col.att.work_hours'), record.workHours != null ? `${record.workHours} ساعة` : '—')}
        {row(t('col.created_at'),    dateText(record.createdAt))}
        {record.notes && (
          <div style={{ gridColumn: '1/-1' }}>
            {row(t('field.notes'), record.notes)}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Attendance() {
  const { t } = useT();
  const { hasPermission } = useAuth();

  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [stats, setStats] = useState<AttendanceStats>(DEFAULT_STATS);
  const [employeeList, setEmployeeList] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters — persisted across navigation
  const [page, setPage] = usePersistedState<number>('att:page', 1);
  const [search, setSearch] = usePersistedState('att:search', '');
  const [filterEmployee, setFilterEmployee] = usePersistedState('att:employee', '');
  const [filterStatus, setFilterStatus] = usePersistedState('att:status', '');
  const [filterDateFrom, setFilterDateFrom] = usePersistedState('att:from', '');
  const [filterDateTo, setFilterDateTo] = usePersistedState('att:to', '');

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null);
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecord | null>(null);

  // Form state
  const [createForm, setCreateForm] = useState<FormData>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<FormData>(EMPTY_FORM);
  const editInitialRef = useRef<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = { page, pageSize: 20 };
      if (search)         params.search     = search;
      if (filterEmployee) params.employeeId = filterEmployee;
      if (filterStatus)   params.status     = filterStatus;
      if (filterDateFrom) params.from       = filterDateFrom;
      if (filterDateTo)   params.to         = filterDateTo;
      const res = await api.get('/employees/attendance', { params });
      const result = res.data.data;
      setRows(result.data ?? []);
      setMeta(result.meta ?? null);
      setStats(result.stats ?? DEFAULT_STATS);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, search, filterEmployee, filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/employees', { params: { pageSize: 500, status: 'ACTIVE' } })
      .then((r) => setEmployeeList(r.data.data?.data ?? []))
      .catch(() => {});
  }, []);


  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const checkIn  = createForm.checkIn  ? new Date(`${createForm.date}T${createForm.checkIn}`)  : undefined;
      const checkOut = createForm.checkOut ? new Date(`${createForm.date}T${createForm.checkOut}`) : undefined;
      await api.post('/employees/attendance', {
        employeeId: Number(createForm.employeeId),
        date: createForm.date,
        checkIn,
        checkOut,
        status: createForm.status,
        notes: createForm.notes || undefined,
      });
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      load();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(record: AttendanceRecord) {
    const dateStr = record.date ? new Date(record.date).toISOString().slice(0, 10) : '';
    const initialForm: FormData = {
      employeeId: String(record.employeeId),
      date: dateStr,
      checkIn:  record.checkIn  ? new Date(record.checkIn).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      checkOut: record.checkOut ? new Date(record.checkOut).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      status: record.status,
      notes: record.notes ?? '',
    };
    editInitialRef.current = initialForm;
    setEditForm(initialForm);
    setEditRecord(record);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRecord) return;
    setSaving(true);
    setFormError('');
    try {
      const dateStr = editRecord.date ? new Date(editRecord.date).toISOString().slice(0, 10) : editForm.date;
      const checkIn  = editForm.checkIn  ? new Date(`${dateStr}T${editForm.checkIn}`)  : undefined;
      const checkOut = editForm.checkOut ? new Date(`${dateStr}T${editForm.checkOut}`) : undefined;
      await api.patch(`/employees/attendance/${editRecord.id}`, {
        checkIn,
        checkOut,
        status: editForm.status,
        notes: editForm.notes || undefined,
      });
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
      await api.delete(`/employees/attendance/${deleteTarget.id}`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    {
      key: 'employee',
      label: t('col.att.employee'),
      render: (r: AttendanceRecord) => (
        <strong>{r.employee ? `${r.employee.fullName}` : r.employeeId}</strong>
      ),
    },
    { key: 'date', label: t('field.date'), render: (r: AttendanceRecord) => dateText(r.date) },
    { key: 'checkIn',  label: t('col.att.check_in'),   render: (r: AttendanceRecord) => timeText(r.checkIn) },
    { key: 'checkOut', label: t('col.att.check_out'),  render: (r: AttendanceRecord) => timeText(r.checkOut) },
    {
      key: 'workHours',
      label: t('col.att.work_hours'),
      render: (r: AttendanceRecord) => r.workHours != null ? `${r.workHours} ساعة` : '—',
    },
    { key: 'status', label: t('field.status'), render: (r: AttendanceRecord) => statusBadge(r.status) },
    { key: 'notes', label: t('field.notes'), render: (r: AttendanceRecord) => r.notes ?? '—' },
    {
      key: '_actions',
      label: '',
      render: (r: AttendanceRecord) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn secondary sm" onClick={() => setDetailRecord(r)}>{t('action.att.view_details')}</button>
          {hasPermission('attendance.update') && (
            <button className="btn secondary sm" onClick={() => openEdit(r)}>{t('action.att.edit')}</button>
          )}
          {hasPermission('attendance.delete') && (
            <button className="btn secondary sm" style={{ color: 'var(--red)' }} onClick={() => setDeleteTarget(r)}>
              {t('action.att.delete')}
            </button>
          )}
        </div>
      ),
    },
  ];

  function createGuardClose() {
    if (JSON.stringify(createForm) !== EMPTY_FORM_JSON && !confirm(t('msg.unsaved_changes'))) return;
    setShowCreate(false);
    setCreateForm(EMPTY_FORM);
    setFormError('');
  }

  function editGuardClose() {
    if (JSON.stringify(editForm) !== JSON.stringify(editInitialRef.current) && !confirm(t('msg.unsaved_changes'))) return;
    setEditRecord(null);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{t('page.att.title')}</h2>
          <p>{t('page.att.subtitle')}</p>
        </div>
        {hasPermission('attendance.create') && (
          <button className="btn" onClick={() => { setShowCreate(true); setCreateForm(EMPTY_FORM); setFormError(''); }}>
            {t('action.att.create')}
          </button>
        )}
      </div>

      <SummaryKPIs stats={stats} />

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <input
          style={{ ...inp, width: 240 }}
          placeholder={t('ph.att.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select style={{ ...inp, width: 200 }} value={filterEmployee} onChange={(e) => { setFilterEmployee(e.target.value); setPage(1); }}>
          <option value="">{t('ph.att.select_employee')}</option>
          {employeeList.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.code})</option>
          ))}
        </select>
        <select style={{ ...inp, width: 160 }} value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">{t('opt.att.all_statuses')}</option>
          <option value="PRESENT">{t('opt.att.present')}</option>
          <option value="ABSENT">{t('opt.att.absent')}</option>
          <option value="LATE">{t('opt.att.late')}</option>
          <option value="LEAVE">{t('opt.att.leave')}</option>
        </select>
        <input style={{ ...inp, width: 150 }} type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }} title={t('filter.date_from')} />
        <input style={{ ...inp, width: 150 }} type="date" value={filterDateTo}   onChange={(e) => { setFilterDateTo(e.target.value);   setPage(1); }} title={t('filter.date_to')} />
        {(search || filterEmployee || filterStatus || filterDateFrom || filterDateTo) && (
          <button className="btn secondary sm" onClick={() => { setSearch(''); setFilterEmployee(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(1); }}>
            {t('action.cancel')} ✕
          </button>
        )}
        <button type="button" className="btn secondary" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
      </div>

      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        emptyText={t('empty.att.records')}
      />

      {/* Create Modal */}
      {showCreate && (
        <Modal
          title={t('modal.att.create_title')}
          onClose={createGuardClose}
          footer={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {formError && <span style={{ color: 'var(--red)', fontSize: 13, flex: 1 }}>{formError}</span>}
              <button className="btn secondary" onClick={createGuardClose}>{t('action.cancel')}</button>
              <button className="btn" form="att-create-form" type="submit" disabled={saving}>{t('action.save')}</button>
            </div>
          }
        >
          <AttendanceForm
            id="att-create-form"
            form={createForm}
            setForm={setCreateForm}
            onSubmit={handleCreate}
            saving={saving}
            employeeList={employeeList}
            isEdit={false}
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {editRecord && (
        <Modal
          title={t('modal.att.edit_title')}
          onClose={editGuardClose}
          footer={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {formError && <span style={{ color: 'var(--red)', fontSize: 13, flex: 1 }}>{formError}</span>}
              <button className="btn secondary" onClick={editGuardClose}>{t('action.cancel')}</button>
              <button className="btn" form="att-edit-form" type="submit" disabled={saving}>{t('action.save')}</button>
            </div>
          }
        >
          <AttendanceForm
            id="att-edit-form"
            form={editForm}
            setForm={setEditForm}
            onSubmit={handleEdit}
            saving={saving}
            employeeList={employeeList}
            isEdit={true}
          />
        </Modal>
      )}

      {/* Details Modal */}
      {detailRecord && <DetailsModal record={detailRecord} onClose={() => setDetailRecord(null)} />}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <Modal
          title={t('action.att.delete')}
          onClose={() => setDeleteTarget(null)}
          footer={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={() => setDeleteTarget(null)}>{t('action.cancel')}</button>
              <button className="btn" style={{ background: 'var(--red)' }} onClick={handleDelete} disabled={deleting}>
                {t('action.att.delete')}
              </button>
            </div>
          }
        >
          <p style={{ margin: 0 }}>{t('action.att.confirm_delete')}</p>
          <p style={{ margin: '8px 0 0', fontWeight: 600 }}>
            {deleteTarget.employee?.fullName ?? deleteTarget.employeeId} — {dateText(deleteTarget.date)}
          </p>
        </Modal>
      )}
    </div>
  );
}
