import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import DateInput from '../components/DateInput';
import { useUI } from '../stores/uiStore';
import { useT } from '../lib/i18n';
import { formatDateTime, formatDateTimeWithSeconds } from '../lib/date';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditRow {
  id: number;
  module: string;
  action: string;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { username: string; fullName: string | null } | null;
}

interface Meta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface UserOption {
  id: number;
  username: string;
  fullName: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIT_MODULES = [
  'customers', 'employees', 'payroll', 'equipment', 'maintenance',
  'contracts', 'invoices', 'suppliers', 'expenses', 'transactions',
  'accounting', 'reports', 'users', 'roles', 'backups', 'settings',
  'inventory', 'cheques', 'import', 'auth',
];

const AUDIT_ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'CANCEL', 'PRINT',
  'EXPORT', 'LOGIN', 'LOGOUT', 'RESTORE',
];

type PillCls = 'green' | 'amber' | 'red' | 'blue' | 'gray';

const ACTION_PILL: Record<string, PillCls> = {
  CREATE: 'green', UPDATE: 'amber', DELETE: 'red',
  APPROVE: 'green', CANCEL: 'gray', PRINT: 'blue',
  EXPORT: 'blue', LOGIN: 'blue', LOGOUT: 'gray', RESTORE: 'amber',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string): string {
  return formatDateTime(iso);
}

function fmtDatetimeFull(iso: string): string {
  return formatDateTimeWithSeconds(iso);
}

function formatJson(raw: string | null): string {
  if (!raw) return '';
  try { return JSON.stringify(JSON.parse(raw), null, 2); }
  catch { return raw; }
}

function buildSummary(row: AuditRow): { ar: string; en: string } {
  if (row.action === 'UPDATE' && row.oldValue && row.newValue) {
    try {
      const oldObj = JSON.parse(row.oldValue) as Record<string, unknown>;
      const newObj = JSON.parse(row.newValue) as Record<string, unknown>;
      const changed = Object.keys({ ...oldObj, ...newObj }).filter(
        (k) => JSON.stringify(oldObj[k]) !== JSON.stringify(newObj[k]),
      );
      const n = changed.length;
      return { ar: `تعديل ${n} حقل${n !== 1 ? '' : ''}`, en: `${n} field${n !== 1 ? 's' : ''} changed` };
    } catch { /* fall through */ }
  }
  if (row.action === 'CREATE' && row.newValue) {
    try {
      const obj = JSON.parse(row.newValue) as Record<string, unknown>;
      const name = (obj.name ?? obj.fullName ?? obj.code ?? obj.username) as string | undefined;
      if (name) return { ar: `إنشاء: ${name}`, en: `Created: ${name}` };
    } catch { /* fall through */ }
    return { ar: 'سجل جديد', en: 'Record created' };
  }
  const fixed: Record<string, { ar: string; en: string }> = {
    DELETE:  { ar: 'حذف السجل',      en: 'Record deleted' },
    LOGIN:   { ar: 'تسجيل دخول',      en: 'User logged in' },
    LOGOUT:  { ar: 'تسجيل خروج',      en: 'User logged out' },
    RESTORE: { ar: 'استعادة نسخة',    en: 'Backup restored' },
    APPROVE: { ar: 'اعتماد',           en: 'Approved' },
    CANCEL:  { ar: 'إلغاء',            en: 'Cancelled' },
    PRINT:   { ar: 'طباعة',            en: 'Printed' },
    EXPORT:  { ar: 'تصدير',            en: 'Exported' },
  };
  return fixed[row.action] ?? { ar: '—', en: '—' };
}

// ─── Details Drawer ──────────────────────────────────────────────────────────

interface DrawerProps {
  row: AuditRow;
  onClose: () => void;
}

function DetailsDrawer({ row, onClose }: DrawerProps) {
  const { t } = useT();
  const [copiedOld, setCopiedOld] = useState(false);
  const [copiedNew, setCopiedNew] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy(text: string, which: 'old' | 'new') {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'old') {
        setCopiedOld(true);
        setTimeout(() => setCopiedOld(false), 1500);
      } else {
        setCopiedNew(true);
        setTimeout(() => setCopiedNew(false), 1500);
      }
    } catch { /* clipboard unavailable */ }
  }

  const oldJson = formatJson(row.oldValue);
  const newJson = formatJson(row.newValue);
  const pillCls = ACTION_PILL[row.action] ?? 'gray';
  const userName = row.user?.fullName || row.user?.username || '—';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(15,23,42,.45)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        style={{
          width: 480, maxWidth: '95vw',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
          boxShadow: '-4px 0 24px rgba(0,0,0,.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>history</span>
            <strong style={{ fontSize: 15 }}>{t('audit.drawer.title')}</strong>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title={t('action.close')}
            style={{ fontSize: 18, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Drawer body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Meta section */}
          <section>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <DrawerField label={t('col.audit.datetime')} value={fmtDatetimeFull(row.createdAt)} mono />
              <DrawerField label={t('col.audit.user')} value={userName} />
              {row.user?.username && <DrawerField label={t('audit.drawer.username')} value={row.user.username} mono />}
              {row.ipAddress && <DrawerField label={t('audit.drawer.ip')} value={row.ipAddress} mono />}
              <DrawerField label={t('col.audit.module')} value={t(`perm.module.${row.module}`) || row.module} />
              <DrawerField label={t('col.audit.entity')} value={row.entityId ?? '—'} mono />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                  {t('col.audit.action')}
                </span>
                <span className={`pill ${pillCls}`} style={{ alignSelf: 'flex-start' }}>
                  {t(`audit.action.${row.action}`) || row.action}
                </span>
              </div>
            </div>
          </section>

          {/* Old value */}
          {oldJson && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                  {t('audit.drawer.old_value')}
                </span>
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => copy(oldJson, 'old')}
                  style={{ fontSize: 11, padding: '2px 10px' }}
                >
                  {copiedOld ? t('audit.drawer.copied') : t('audit.drawer.copy')}
                </button>
              </div>
              <pre style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 11,
                fontFamily: 'monospace',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'var(--text-muted)',
                margin: 0,
              }}>{oldJson}</pre>
            </section>
          )}

          {/* New value */}
          {newJson && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                  {t('audit.drawer.new_value')}
                </span>
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => copy(newJson, 'new')}
                  style={{ fontSize: 11, padding: '2px 10px' }}
                >
                  {copiedNew ? t('audit.drawer.copied') : t('audit.drawer.copy')}
                </button>
              </div>
              <pre style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 11,
                fontFamily: 'monospace',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'var(--text)',
                margin: 0,
              }}>{newJson}</pre>
            </section>
          )}

          {!oldJson && !newJson && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
              {t('audit.drawer.no_payload')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface DrawerFieldProps {
  label: string;
  value: string;
  mono?: boolean;
}
function DrawerField({ label, value, mono }: DrawerFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AuditLog() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  const { lang } = useUI();

  // Search: separate input state from debounced API state
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  // Debounce search input → search param (350ms)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch users for dropdown (graceful degradation if forbidden)
  useEffect(() => {
    api.get('/users', { params: { pageSize: 100 } })
      .then((res) => {
        const payload = res.data?.data ?? res.data;
        const list = payload?.data ?? payload ?? [];
        setUsers(Array.isArray(list) ? list : []);
      })
      .catch(() => { /* silently omit user filter if no permission */ });
  }, []);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(p), pageSize: '25' };
      if (search) params.search = search;
      if (filterModule) params.module = filterModule;
      if (filterAction) params.action = filterAction;
      if (filterUser) params.userId = filterUser;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo + 'T23:59:59';
      const res = await api.get('/audit', { params });
      const body = res.data.data ?? res.data;
      setRows(body.data ?? []);
      setMeta(body.meta ?? { page: p, pageSize: 25, total: 0, totalPages: 1 });
    } catch (err) {
      setError(errorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterModule, filterAction, filterUser, filterFrom, filterTo]);

  useEffect(() => { setPage(1); }, [search, filterModule, filterAction, filterUser, filterFrom, filterTo]);
  useEffect(() => { load(page); }, [load, page]);

  if (!hasPermission('audit.read')) {
    return (
      <div className="center-msg" style={{ marginTop: 80 }}>
        <p style={{ color: 'var(--text-muted)' }}>{t('audit.no_permission')}</p>
      </div>
    );
  }

  const isFiltered = !!(searchInput || filterModule || filterAction || filterUser || filterFrom || filterTo);

  function resetFilters() {
    setSearchInput('');
    setSearch('');
    setFilterModule('');
    setFilterAction('');
    setFilterUser('');
    setFilterFrom('');
    setFilterTo('');
  }

  return (
    <div>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="page-head">
        <div>
          <h2>{t('page.audit.title')}</h2>
          <p>{t('page.audit.subtitle')}</p>
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="card panel" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          {/* Global search */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px', minWidth: 180 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('audit.filter.search')}</label>
            <input
              type="search"
              className="input"
              value={searchInput}
              placeholder={t('audit.filter.search_ph')}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>

          {/* Module filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('col.audit.module')}</label>
            <select
              className="input"
              value={filterModule}
              title={t('col.audit.module')}
              onChange={(e) => setFilterModule(e.target.value)}
              style={{ fontSize: 13 }}
            >
              <option value="">{t('lbl.audit.all_modules')}</option>
              {AUDIT_MODULES.map((m) => (
                <option key={m} value={m}>{t(`perm.module.${m}`)}</option>
              ))}
            </select>
          </div>

          {/* Action filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('col.audit.action')}</label>
            <select
              className="input"
              value={filterAction}
              title={t('col.audit.action')}
              onChange={(e) => setFilterAction(e.target.value)}
              style={{ fontSize: 13 }}
            >
              <option value="">{t('lbl.audit.all_actions')}</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>{t(`audit.action.${a}`)}</option>
              ))}
            </select>
          </div>

          {/* User filter (only shown when users list is available) */}
          {users.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('audit.filter.user')}</label>
              <select
                className="input"
                value={filterUser}
                title={t('audit.filter.user')}
                onChange={(e) => setFilterUser(e.target.value)}
                style={{ fontSize: 13 }}
              >
                <option value="">{t('audit.filter.all_users')}</option>
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.fullName ?? u.username}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date from */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('lbl.audit.filter_from')}</label>
            <DateInput
              className="input"
              value={filterFrom}
              title={t('lbl.audit.filter_from')}
              ariaLabel={t('lbl.audit.filter_from')}
              onChange={setFilterFrom}
              style={{ fontSize: 13, minWidth: 140 }}
            />
          </div>

          {/* Date to */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('lbl.audit.filter_to')}</label>
            <DateInput
              className="input"
              value={filterTo}
              title={t('lbl.audit.filter_to')}
              ariaLabel={t('lbl.audit.filter_to')}
              onChange={setFilterTo}
              style={{ fontSize: 13, minWidth: 140 }}
            />
          </div>

          {/* Reset */}
          {isFiltered && (
            <button
              type="button"
              className="btn secondary"
              style={{ alignSelf: 'flex-end', fontSize: 13 }}
              onClick={resetFilters}
            >
              {t('action.reset_filters')}
            </button>
          )}
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="card panel" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>{t('col.audit.datetime')}</th>
                <th>{t('col.audit.module')}</th>
                <th>{t('col.audit.action')}</th>
                <th>{t('col.audit.entity')}</th>
                <th>{t('col.audit.summary')}</th>
                <th>{t('col.audit.user')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="center-msg"><div className="spinner" />{t('msg.loading')}</div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="center-msg" style={{ flexDirection: 'column', gap: 12 }}>
                      <span>{isFiltered ? t('msg.empty_filtered') : t('msg.audit.no_records')}</span>
                      {isFiltered && (
                        <button type="button" className="btn secondary sm" onClick={resetFilters}>
                          {t('action.reset_filters_inline')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : rows.map((row) => {
                const pillCls = ACTION_PILL[row.action] ?? 'gray';
                const actionLabel = t(`audit.action.${row.action}`) || row.action;
                const moduleName = t(`perm.module.${row.module}`) || row.module;
                const userName = row.user?.fullName || row.user?.username || '—';
                const summary = buildSummary(row);
                return (
                  <tr
                    key={row.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(row)}
                    title={t('audit.row.click_hint')}
                  >
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13, color: 'var(--text-muted)' }}>
                      {fmtDatetime(row.createdAt)}
                    </td>
                    <td style={{ fontSize: 13 }}>{moduleName}</td>
                    <td><span className={`pill ${pillCls}`}>{actionLabel}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                      {row.entityId ?? '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200 }}>
                      {lang === 'ar' ? summary.ar : summary.en}
                    </td>
                    <td style={{ fontSize: 13 }}>{userName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ──────────────────────────────────────────────── */}
        {meta.totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderTop: '1px solid var(--border)',
            fontSize: 13, color: 'var(--text-muted)',
          }}>
            <span>
              {t('msg.page')} {meta.page} {t('msg.of')} {meta.totalPages} — {t('msg.total')} {meta.total}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn secondary sm"
                disabled={meta.page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('action.prev')}
              </button>
              <button
                type="button"
                className="btn secondary sm"
                disabled={meta.page >= meta.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('action.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Details Drawer ──────────────────────────────────────────────── */}
      {selected && <DetailsDrawer row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
