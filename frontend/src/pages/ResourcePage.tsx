import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { MODULES } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import FormDialog from '../components/FormDialog';
import { usePersistedState } from '../hooks/usePersistedState';

export default function ResourcePage({ moduleKey }: { moduleKey: string }) {
  const cfg = MODULES[moduleKey];
  const { hasPermission } = useAuth();
  const { t } = useT();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = usePersistedState(`rp:${cfg.key}:page`, 1);
  const [search, setSearch] = usePersistedState(`rp:${cfg.key}:search`, '');
  const [query, setQuery] = usePersistedState(`rp:${cfg.key}:query`, '');
  const [filterValue, setFilterValue] = usePersistedState(`rp:${cfg.key}:filter`, '');
  const [error, setError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [alerts, setAlerts] = useState<string[]>([]);

  const canCreate = hasPermission(`${cfg.key}.create`);
  const canUpdate = hasPermission(`${cfg.key}.update`);
  const canDelete = hasPermission(`${cfg.key}.delete`);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(cfg.endpoint, {
        params: {
          page,
          search: query,
          pageSize: 15,
          ...(cfg.statusFilter && filterValue ? { [cfg.statusFilter.param]: filterValue } : {}),
        },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [cfg.endpoint, page, query, filterValue, cfg.statusFilter]);

  useEffect(() => { load(); }, [load]);

  // State resets on module change are handled by usePersistedState key switching.

  // تنبيهات خاصة: دفاتر المركبات / مستندات الموظفين
  useEffect(() => {
    (async () => {
      try {
        if (cfg.key === 'equipment') {
          const res = await api.get('/equipment/expiring', { params: { days: 30 } });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const list = (res.data.data ?? []) as any[];
          setAlerts(list.map((e) => `${e.code} — ${e.registration?.remainingText ?? ''}`));
        } else if (cfg.key === 'employees') {
          const res = await api.get('/employees/expiring-documents', { params: { days: 30 } });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const list = (res.data.data ?? []) as any[];
          const msgs: string[] = [];
          list.forEach((e) => e.alerts?.forEach((a: { document: string; remainingDays: number }) =>
            msgs.push(`${e.fullName} — ${a.document}: ${a.remainingDays < 0 ? 'منتهٍ' : a.remainingDays + ' يوم'}`)));
          setAlerts(msgs);
        }
      } catch {
        // نتجاهل
      }
    })();
  }, [cfg.key]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQuery(search);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onDelete(row: any) {
    if (!confirm(t('msg.confirm_delete', { id: row.code ?? row.name ?? row.username ?? row.id }))) return;
    try {
      await api.delete(`${cfg.endpoint}/${row.id}`);
      load();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  async function onApprove(id: number, action: 'approve' | 'reject') {
    try {
      await api.patch(`${cfg.endpoint}/${id}/${action}`);
      load();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-head">
        <div><h2>{t(cfg.title)}</h2><p>{t(cfg.subtitle)}</p></div>
        {canCreate && <button className="btn" onClick={() => setCreating(true)}>＋ {t(cfg.createLabel)}</button>}
      </div>

      {alerts.length > 0 && (
        <div className="alert warn">
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>{t('msg.alert_prefix', { count: alerts.length })} {alerts.slice(0, 8).join('  ·  ')}{alerts.length > 8 ? ' …' : ''}</div>
        </div>
      )}
      {error && (
        <div className="alert error" role="alert" aria-live="assertive" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>⚠️ {error}</span>
          <button type="button" className="btn secondary sm" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
        </div>
      )}

      <form className="toolbar" onSubmit={onSearch}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 240 }}>
          <input
            placeholder={t('action.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, paddingInlineEnd: search ? 32 : undefined }}
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setQuery(''); setPage(1); }}
              style={{ position: 'absolute', insetInlineEnd: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1 }}
              title={t('action.reset_filters')}
            >
              ✕
            </button>
          )}
        </div>
        <button className="btn secondary" type="submit">{t('action.search')}</button>
        {cfg.statusFilter && (
          <select
            value={filterValue}
            onChange={(e) => { setFilterValue(e.target.value); setPage(1); }}
            title={t('filter.status')}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 14, cursor: 'pointer' }}
          >
            <option value="">{t('opt.all')}</option>
            {cfg.statusFilter.options.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        )}
        <button className="btn secondary" type="button" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
      </form>

      <DataTable
        columns={cfg.columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        emptyText={cfg.emptyText ? t(cfg.emptyText) : undefined}
        actions={(row) => (
          <>
            {cfg.canApprove && row.status === 'PENDING' && hasPermission('expenses.approve') && (
              <>
                <button className="btn sm" onClick={() => onApprove(row.id, 'approve')}>{t('action.approve')}</button>{' '}
                <button className="btn secondary sm" onClick={() => onApprove(row.id, 'reject')}>{t('action.reject')}</button>{' '}
              </>
            )}
            {canUpdate && <button className="btn secondary sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>}{' '}
            {canDelete && <button className="btn danger sm" onClick={() => onDelete(row)}>{t('action.delete')}</button>}
          </>
        )}
      />

      {creating && (
        <FormDialog
          title={t(cfg.createLabel)}
          fields={cfg.fields}
          endpoint={cfg.endpoint}
          onClose={() => setCreating(false)}
          onSaved={load}
        />
      )}
      {editing && (
        <FormDialog
          title={`${t('action.edit')} — ${t(cfg.title)}`}
          fields={cfg.fields}
          endpoint={cfg.endpoint}
          id={editing.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
