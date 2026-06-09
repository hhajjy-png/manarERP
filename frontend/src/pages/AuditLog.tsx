import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditRow {
  id: number;
  module: string;
  action: string;
  entityId: string | null;
  createdAt: string;
  user: { username: string; fullName: string | null } | null;
}

interface Meta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-KW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AuditLog() {
  const { hasPermission } = useAuth();
  const { t } = useT();

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [meta, setMeta] = useState<Meta>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(p), pageSize: '25' };
      if (filterModule) params.module = filterModule;
      if (filterAction) params.action = filterAction;
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
  }, [filterModule, filterAction, filterFrom, filterTo]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [filterModule, filterAction, filterFrom, filterTo]);

  useEffect(() => { load(page); }, [load, page]);

  if (!hasPermission('audit.read')) {
    return (
      <div className="center-msg" style={{ marginTop: 80 }}>
        <p style={{ color: 'var(--text-muted)' }}>{t('audit.no_permission')}</p>
      </div>
    );
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('lbl.audit.filter_from')}</label>
            <input
              type="date"
              className="input"
              value={filterFrom}
              title={t('lbl.audit.filter_from')}
              aria-label={t('lbl.audit.filter_from')}
              onChange={(e) => setFilterFrom(e.target.value)}
              style={{ fontSize: 13, minWidth: 140 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('lbl.audit.filter_to')}</label>
            <input
              type="date"
              className="input"
              value={filterTo}
              title={t('lbl.audit.filter_to')}
              aria-label={t('lbl.audit.filter_to')}
              onChange={(e) => setFilterTo(e.target.value)}
              style={{ fontSize: 13, minWidth: 140 }}
            />
          </div>

          {(filterModule || filterAction || filterFrom || filterTo) && (
            <button
              type="button"
              className="btn secondary"
              style={{ alignSelf: 'flex-end', fontSize: 13 }}
              onClick={() => {
                setFilterModule('');
                setFilterAction('');
                setFilterFrom('');
                setFilterTo('');
              }}
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
                <th>{t('col.audit.user')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>
                    <div className="center-msg"><div className="spinner" />{t('msg.loading')}</div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="center-msg">{t('msg.audit.no_records')}</div>
                  </td>
                </tr>
              ) : rows.map((row) => {
                const pillCls = ACTION_PILL[row.action] ?? 'gray';
                const actionLabel = t(`audit.action.${row.action}`) || row.action;
                const moduleName = t(`perm.module.${row.module}`) || row.module;
                const userName = row.user?.fullName || row.user?.username || '—';
                return (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13, color: 'var(--text-muted)' }}>
                      {fmtDatetime(row.createdAt)}
                    </td>
                    <td style={{ fontSize: 13 }}>{moduleName}</td>
                    <td><span className={`pill ${pillCls}`}>{actionLabel}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                      {row.entityId ?? '—'}
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
    </div>
  );
}
