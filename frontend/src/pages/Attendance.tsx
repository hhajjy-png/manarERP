import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import { PageMeta } from '../components/DataTable';
import DateInput from '../components/DateInput';
import ConfirmModal from '../components/ConfirmModal';
import { dateText } from '../config/modules';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  StatusChip,
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
import './Attendance.css';

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

interface Employee { id: number; code: string; fullName: string; }
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

const STATUS_META: Record<string, { key: string; tone: Tone; icon: string }> = {
  PRESENT: { key: 'att.present', tone: 'green', icon: 'check_circle' },
  ABSENT:  { key: 'att.absent', tone: 'red', icon: 'cancel' },
  LATE:    { key: 'att.late', tone: 'orange', icon: 'schedule' },
  LEAVE:   { key: 'att.leave', tone: 'blue', icon: 'beach_access' },
};

function statusChip(val: string, t: (k: string) => string) {
  const m = STATUS_META[val] ?? { key: val, tone: 'neutral' as Tone, icon: 'help' };
  return <StatusChip tone={m.tone} icon={m.icon}>{t(m.key)}</StatusChip>;
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

interface AttendanceStats { total: number; present: number; absent: number; late: number; leave: number; }
const DEFAULT_STATS: AttendanceStats = { total: 0, present: 0, absent: 0, late: 0, leave: 0 };

type FormData = { employeeId: string; date: string; checkIn: string; checkOut: string; status: string; notes: string; };
const EMPTY_FORM: FormData = { employeeId: '', date: new Date().toISOString().slice(0, 10), checkIn: '', checkOut: '', status: 'PRESENT', notes: '' };
const EMPTY_FORM_JSON = JSON.stringify(EMPTY_FORM);

// ── Sectioned attendance form (shared by create + edit dialogs) ────────────────
function AttendanceFormBody({ form, setForm, employeeList, isEdit }: {
  form: FormData; setForm: (f: FormData) => void; employeeList: Employee[]; isEdit: boolean;
}) {
  const { t } = useT();
  const computedHours = calcWorkHours(
    form.checkIn ? `${form.date}T${form.checkIn}` : null,
    form.checkOut ? `${form.date}T${form.checkOut}` : null,
  );
  return (
    <>
      {!isEdit && (
        <DialogSection title={t('field.att.employee')} icon="badge">
          <div className="xpl-field xpl-field--full">
            <label>{t('field.att.employee')} <span className="req">*</span></label>
            <select className="xpl-select" required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} aria-label={t('field.att.employee')}>
              <option value="">{t('ph.att.select_employee')}</option>
              {employeeList.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.code})</option>)}
            </select>
          </div>
        </DialogSection>
      )}

      <DialogSection title="الحضور" icon="event">
        <div className="xpl-field">
          <label>{t('field.date')} <span className="req">*</span></label>
          <DateInput className="xpl-input" required value={form.date} onChange={(v) => setForm({ ...form, date: v })} disabled={isEdit} autoFocus={!isEdit} ariaLabel={t('field.date')} />
        </div>
        <div className="xpl-field">
          <label>{t('field.status')}</label>
          <select className="xpl-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label={t('field.status')}>
            <option value="PRESENT">{t('opt.att.present')}</option>
            <option value="ABSENT">{t('opt.att.absent')}</option>
            <option value="LATE">{t('opt.att.late')}</option>
            <option value="LEAVE">{t('opt.att.leave')}</option>
          </select>
        </div>
      </DialogSection>

      <DialogSection title="ساعات العمل" icon="schedule">
        <div className="xpl-field">
          <label>{t('field.att.check_in')}</label>
          <input className="xpl-input" type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} aria-label={t('field.att.check_in')} />
        </div>
        <div className="xpl-field">
          <label>{t('field.att.check_out')}</label>
          <input className="xpl-input" type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} aria-label={t('field.att.check_out')} />
        </div>
        {form.checkIn && form.checkOut && (
          <div className="xpl-field xpl-field--full">
            <label>{t('field.att.work_hours')}</label>
            <div className="attx-computed"><span className="material-symbols-outlined">timer</span>{computedHours != null ? `${computedHours} ساعة` : '—'}</div>
          </div>
        )}
      </DialogSection>

      <DialogSection title={t('field.notes')} icon="sticky_note_2">
        <div className="xpl-field xpl-field--full">
          <label>{t('field.notes')}</label>
          <textarea className="xpl-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} aria-label={t('field.notes')} />
        </div>
      </DialogSection>
    </>
  );
}

export default function Attendance() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [stats, setStats] = useState<AttendanceStats>(DEFAULT_STATS);
  const [employeeList, setEmployeeList] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [page, setPage] = usePersistedState<number>('att:page', 1);
  const [search, setSearch] = usePersistedState('att:search', '');
  const [filterEmployee, setFilterEmployee] = usePersistedState('att:employee', '');
  const [filterStatus, setFilterStatus] = usePersistedState('att:status', '');
  const [filterDateFrom, setFilterDateFrom] = usePersistedState('att:from', '');
  const [filterDateTo, setFilterDateTo] = usePersistedState('att:to', '');

  const [showCreate, setShowCreate] = useState(false);
  const [showCreateUnsaved, setShowCreateUnsaved] = useState(false);
  const [showEditUnsaved, setShowEditUnsaved] = useState(false);
  const [viewing, setViewing] = useState<AttendanceRecord | null>(null);
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecord | null>(null);

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
      if (search) params.search = search;
      if (filterEmployee) params.employeeId = filterEmployee;
      if (filterStatus) params.status = filterStatus;
      if (filterDateFrom) params.from = filterDateFrom;
      if (filterDateTo) params.to = filterDateTo;
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
      const checkIn = createForm.checkIn ? new Date(`${createForm.date}T${createForm.checkIn}`) : undefined;
      const checkOut = createForm.checkOut ? new Date(`${createForm.date}T${createForm.checkOut}`) : undefined;
      await api.post('/employees/attendance', {
        employeeId: Number(createForm.employeeId),
        date: createForm.date,
        checkIn, checkOut,
        status: createForm.status,
        notes: createForm.notes || undefined,
      });
      setShowCreate(false);
      setCreateForm(EMPTY_FORM);
      toast.ok('تم التسجيل بنجاح');
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
      checkIn: record.checkIn ? new Date(record.checkIn).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
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
      const checkIn = editForm.checkIn ? new Date(`${dateStr}T${editForm.checkIn}`) : undefined;
      const checkOut = editForm.checkOut ? new Date(`${dateStr}T${editForm.checkOut}`) : undefined;
      await api.patch(`/employees/attendance/${editRecord.id}`, {
        checkIn, checkOut,
        status: editForm.status,
        notes: editForm.notes || undefined,
      });
      setEditRecord(null);
      toast.ok('تم الحفظ بنجاح');
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
      setViewing(null);
      toast.ok('تم الحذف بنجاح');
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  function createGuardClose() {
    if (JSON.stringify(createForm) !== EMPTY_FORM_JSON) { setShowCreateUnsaved(true); return; }
    setShowCreate(false); setCreateForm(EMPTY_FORM); setFormError('');
  }
  function executeCreateClose() { setShowCreateUnsaved(false); setShowCreate(false); setCreateForm(EMPTY_FORM); setFormError(''); }
  function editGuardClose() {
    if (JSON.stringify(editForm) !== JSON.stringify(editInitialRef.current)) { setShowEditUnsaved(true); return; }
    setEditRecord(null);
  }
  function executeEditClose() { setShowEditUnsaved(false); setEditRecord(null); }

  const hasFilters = !!(search || filterEmployee || filterStatus || filterDateFrom || filterDateTo);

  const STATUS_CHIPS: { value: string; label: string }[] = [
    { value: '', label: t('opt.att.all_statuses') },
    { value: 'PRESENT', label: t('opt.att.present') },
    { value: 'ABSENT', label: t('opt.att.absent') },
    { value: 'LATE', label: t('opt.att.late') },
    { value: 'LEAVE', label: t('opt.att.leave') },
  ];

  return (
    <div className="xpl-scope xpl-page" dir="rtl">
      <ExecutiveHeader
        icon="fact_check"
        title={t('page.att.title')}
        subtitle={t('page.att.subtitle')}
        chips={
          <>
            <IdChip icon="event_available" tone="indigo">{stats.total} سجل</IdChip>
            <IdChip icon="check_circle" tone="green">{stats.present} حاضر</IdChip>
            {stats.absent > 0 && <IdChip icon="cancel" tone="red">{stats.absent} غائب</IdChip>}
          </>
        }
        aside={hasPermission('attendance.create') ? <Button variant="primary" icon="add" onClick={() => { setShowCreate(true); setCreateForm(EMPTY_FORM); setFormError(''); }}>{t('action.att.create')}</Button> : undefined}
      />

      <div className="attx-metrics">
        <HeroMetric icon="fact_check" label={t('stat.att.total')} value={stats.total} sub={<><span className="material-symbols-outlined">check_circle</span>{`${stats.present} حاضر`}</>} />
        <div className="xpl-kpi-grid">
          <MetricCard icon="check_circle" tone="green" label={t('stat.att.present')} value={stats.present} />
          <MetricCard icon="cancel" tone="red" label={t('stat.att.absent')} value={stats.absent} />
          <MetricCard icon="schedule" tone="orange" label={t('stat.att.late')} value={stats.late} />
          <MetricCard icon="beach_access" tone="blue" label={t('att.leave')} value={stats.leave} />
        </div>
      </div>

      {/* Sticky toolbar */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('ph.att.search')} ariaLabel={t('ph.att.search')} />
          <div className="xpl-field" style={{ minWidth: 170 }}>
            <span className="xpl-field-label">{t('field.att.employee')}</span>
            <select className="xpl-select" aria-label={t('field.att.employee')} value={filterEmployee} onChange={(e) => { setFilterEmployee(e.target.value); setPage(1); }}>
              <option value="">{t('ph.att.select_employee')}</option>
              {employeeList.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.code})</option>)}
            </select>
          </div>
          <div className="xpl-field" style={{ minWidth: 140 }}>
            <span className="xpl-field-label">{t('filter.date_from')}</span>
            <DateInput className="xpl-input" ariaLabel={t('filter.date_from')} value={filterDateFrom} onChange={(v) => { setFilterDateFrom(v); setPage(1); }} />
          </div>
          <div className="xpl-field" style={{ minWidth: 140 }}>
            <span className="xpl-field-label">{t('filter.date_to')}</span>
            <DateInput className="xpl-input" ariaLabel={t('filter.date_to')} value={filterDateTo} onChange={(v) => { setFilterDateTo(v); setPage(1); }} />
          </div>
          <Button variant="ghost" icon="refresh" busy={loading} onClick={load}>{t('action.refresh')}</Button>
        </div>
        <div className="xpl-toolbar-row">
          {STATUS_CHIPS.map((s) => (
            <FilterChip key={s.value} active={filterStatus === s.value} onClick={() => { setFilterStatus(s.value); setPage(1); }}>{s.label}</FilterChip>
          ))}
          {hasFilters && <button type="button" className="xpl-clear-link" onClick={() => { setSearch(''); setFilterEmployee(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(1); }}>{t('action.reset_filters')}</button>}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{meta?.total ?? rows.length} نتيجة</span>
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Table */}
      <section className="xpl-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon="event_busy" tone="neutral" title={t('empty.att.records')}
            message={hasFilters ? 'لا توجد سجلات مطابقة للفلاتر.' : undefined}
            action={hasPermission('attendance.create') ? <Button variant="primary" icon="add" onClick={() => { setShowCreate(true); setCreateForm(EMPTY_FORM); setFormError(''); }}>{t('action.att.create')}</Button> : undefined} />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table">
                <thead>
                  <tr>
                    <th>{t('col.att.employee')}</th>
                    <th>{t('field.date')}</th>
                    <th>{t('col.att.check_in')}</th>
                    <th>{t('col.att.check_out')}</th>
                    <th>{t('col.att.work_hours')}</th>
                    <th>{t('field.status')}</th>
                    <th aria-label="فتح" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="xpl-row--click" tabIndex={0} role="button"
                      aria-label={`تفاصيل حضور ${r.employee?.fullName ?? r.employeeId}`}
                      onClick={() => setViewing(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                      <td><strong>{r.employee ? r.employee.fullName : r.employeeId}</strong></td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.date)}</td>
                      <td className="attx-time">{timeText(r.checkIn)}</td>
                      <td className="attx-time">{timeText(r.checkOut)}</td>
                      <td>{r.workHours != null ? `${r.workHours} ساعة` : '—'}</td>
                      <td>{statusChip(r.status, t)}</td>
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

      {/* Detail drawer */}
      {viewing && (
        <Drawer
          title={`${viewing.employee?.fullName ?? viewing.employeeId}`}
          onClose={() => setViewing(null)}
          hero={
            <div className="xpl-drawer-hero">
              <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">fact_check</span></div>
              <div className="xpl-drawer-hero-body">
                <span className="xpl-drawer-hero-title">{viewing.employee?.fullName ?? viewing.employeeId}</span>
                <span className="xpl-drawer-hero-sub">{dateText(viewing.date)}</span>
                <div style={{ marginTop: 4 }}>{statusChip(viewing.status, t)}</div>
              </div>
            </div>
          }
          footer={
            <>
              {hasPermission('attendance.update') && <Button variant="primary" icon="edit" onClick={() => { openEdit(viewing); setViewing(null); }}>{t('action.att.edit')}</Button>}
              {hasPermission('attendance.delete') && <Button variant="danger" icon="delete" busy={deleting} onClick={() => setDeleteTarget(viewing)}>{t('action.att.delete')}</Button>}
            </>
          }
        >
          <DrawerSection title="بيانات الموظف">
            <DrawerField label={t('col.att.employee')} value={viewing.employee ? `${viewing.employee.fullName} (${viewing.employee.code})` : viewing.employeeId} />
            <DrawerField label={t('field.date')} value={dateText(viewing.date)} />
            <DrawerField label={t('field.status')} value={statusChip(viewing.status, t)} />
          </DrawerSection>
          <DrawerSection title="ساعات العمل">
            <DrawerField label={t('col.att.check_in')} value={timeText(viewing.checkIn)} />
            <DrawerField label={t('col.att.check_out')} value={timeText(viewing.checkOut)} />
            <DrawerField label={t('col.att.work_hours')} value={viewing.workHours != null ? `${viewing.workHours} ساعة` : '—'} />
          </DrawerSection>
          <DrawerSection title="معلومات إضافية">
            <DrawerField label={t('col.created_at')} value={dateText(viewing.createdAt)} />
            {viewing.notes && <DrawerField label={t('field.notes')} value={viewing.notes} />}
          </DrawerSection>
        </Drawer>
      )}

      {/* Create dialog */}
      {showCreate && (
        <Dialog
          icon="add_task"
          title={t('modal.att.create_title')}
          subtitle="تسجيل حضور جديد"
          size="lg"
          onClose={createGuardClose}
          footer={
            <>
              <Button variant="primary" icon="save" busy={saving} onClick={() => { const f = document.getElementById('att-create-form') as HTMLFormElement | null; f?.requestSubmit(); }}>{t('action.save')}</Button>
              <Button variant="ghost" onClick={createGuardClose}>{t('action.cancel')}</Button>
            </>
          }
        >
          {formError && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{formError}</div>}
          <form id="att-create-form" onSubmit={handleCreate}>
            <AttendanceFormBody form={createForm} setForm={setCreateForm} employeeList={employeeList} isEdit={false} />
            <input type="submit" hidden disabled={saving} />
          </form>
        </Dialog>
      )}

      {/* Edit dialog */}
      {editRecord && (
        <Dialog
          icon="edit_calendar"
          title={t('modal.att.edit_title')}
          subtitle={`${editRecord.employee?.fullName ?? editRecord.employeeId} · ${dateText(editRecord.date)}`}
          size="lg"
          onClose={editGuardClose}
          footer={
            <>
              <Button variant="primary" icon="save" busy={saving} onClick={() => { const f = document.getElementById('att-edit-form') as HTMLFormElement | null; f?.requestSubmit(); }}>{t('action.save')}</Button>
              <Button variant="ghost" onClick={editGuardClose}>{t('action.cancel')}</Button>
            </>
          }
        >
          {formError && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{formError}</div>}
          <form id="att-edit-form" onSubmit={handleEdit}>
            <AttendanceFormBody form={editForm} setForm={setEditForm} employeeList={employeeList} isEdit={true} />
            <input type="submit" hidden disabled={saving} />
          </form>
        </Dialog>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmModal
          title={t('action.att.delete')}
          message={`${t('action.att.confirm_delete')}\n${deleteTarget.employee?.fullName ?? deleteTarget.employeeId} — ${dateText(deleteTarget.date)}`}
          confirmLabel={t('action.att.delete')}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {showCreateUnsaved && (
        <ConfirmModal title="تغييرات غير محفوظة" message={t('msg.unsaved_changes')} confirmLabel="تجاهل" variant="warning" onConfirm={executeCreateClose} onCancel={() => setShowCreateUnsaved(false)} />
      )}
      {showEditUnsaved && (
        <ConfirmModal title="تغييرات غير محفوظة" message={t('msg.unsaved_changes')} confirmLabel="تجاهل" variant="warning" onConfirm={executeEditClose} onCancel={() => setShowEditUnsaved(false)} />
      )}
    </div>
  );
}
