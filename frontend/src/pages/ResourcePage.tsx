import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { MODULES } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import FormDialog from '../components/FormDialog';

export default function ResourcePage({ moduleKey }: { moduleKey: string }) {
  const cfg = MODULES[moduleKey];
  const { hasPermission } = useAuth();
  const { t } = useT();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
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
      const res = await api.get(cfg.endpoint, { params: { page, search: query, pageSize: 15 } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [cfg.endpoint, page, query]);

  useEffect(() => { load(); }, [load]);

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
        <div><h2>{cfg.title}</h2><p>{cfg.subtitle}</p></div>
        {canCreate && <button className="btn" onClick={() => setCreating(true)}>＋ {cfg.createLabel}</button>}
      </div>

      {alerts.length > 0 && (
        <div className="alert warn">
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>{t('msg.alert_prefix', { count: alerts.length })} {alerts.slice(0, 8).join('  ·  ')}{alerts.length > 8 ? ' …' : ''}</div>
        </div>
      )}
      {error && <div className="alert error">⚠️ {error}</div>}

      <form className="toolbar" onSubmit={onSearch}>
        <input placeholder={t('action.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
        <button className="btn secondary" type="submit">{t('action.search')}</button>
      </form>

      <DataTable
        columns={cfg.columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
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
          title={cfg.createLabel}
          fields={cfg.fields}
          endpoint={cfg.endpoint}
          onClose={() => setCreating(false)}
          onSaved={load}
        />
      )}
      {editing && (
        <FormDialog
          title={`${t('action.edit')} — ${cfg.title}`}
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
