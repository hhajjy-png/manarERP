import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { MODULES, money } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import FormDialog from '../components/FormDialog';
import Modal from '../components/Modal';
import ForceDeleteEquipmentModal from '../components/ForceDeleteEquipmentModal';
import ForceDeleteCustomerModal from '../components/ForceDeleteCustomerModal';
import ForceDeleteSupplierModal from '../components/ForceDeleteSupplierModal';
import ForceDeleteContractModal from '../components/ForceDeleteContractModal';
import { usePersistedState } from '../hooks/usePersistedState';
import ExportExcelButton from '../components/ExportExcelButton';
import { downloadBlob } from '../utils/exportUtils';

type AlertItem = { id: number; code: string; label: string; severity: 'warn' | 'error' };
type ContractStats = { totalContracts: number; activeContracts: number; monthlyTransportTotal: number };
type EquipmentStats = { total: number; byStatus: { status: string; count: number }[] };

export default function ResourcePage({ moduleKey }: { moduleKey: string }) {
  const cfg = MODULES[moduleKey];
  const { hasPermission, user } = useAuth();
  const isSystemAdmin = user?.role.name === 'SYSTEM_ADMIN';
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
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [contractStats, setContractStats] = useState<ContractStats | null>(null);
  const [equipmentStats, setEquipmentStats] = useState<EquipmentStats | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<{ id: number; label: string } | null>(null);
  const [forceDeleteCandidate, setForceDeleteCandidate] = useState<{ id: number; code: string } | null>(null);
  const [forceDeleteCustomerCandidate, setForceDeleteCustomerCandidate] = useState<{ id: number; code: string } | null>(null);
  const [forceDeleteSupplierCandidate, setForceDeleteSupplierCandidate] = useState<{ id: number; code: string } | null>(null);
  const [forceDeleteContractCandidate, setForceDeleteContractCandidate] = useState<{ id: number; code: string } | null>(null);

  const canCreate = hasPermission(`${cfg.key}.create`);
  const canUpdate = hasPermission(`${cfg.key}.update`);
  const canDelete = hasPermission(`${cfg.key}.delete`);
  const canExport = cfg.supportsExport && hasPermission('reports.export');
  const [exportBusy, setExportBusy] = useState(false);

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
      setAlerts([]);
      try {
        if (cfg.key === 'equipment') {
          const res = await api.get('/equipment/expiring', { params: { days: 30 } });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const list = (res.data.data ?? []) as any[];
          setAlerts(list.map((e): AlertItem => {
            const r = e.registration;
            const severity: 'warn' | 'error' = (r?.remainingDays ?? Infinity) <= 7 ? 'error' : 'warn';
            return { id: e.id, code: e.code, label: `${e.code} — ${r?.remainingText ?? ''}`, severity };
          }));
        } else if (cfg.key === 'employees') {
          const res = await api.get('/employees/expiring-documents', { params: { days: 30 } });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const list = (res.data.data ?? []) as any[];
          const items: AlertItem[] = [];
          list.forEach((e) => e.alerts?.forEach((a: { document: string; remainingDays: number }) => {
            const severity: 'warn' | 'error' = a.remainingDays <= 7 ? 'error' : 'warn';
            items.push({ id: e.id, code: e.code, label: `${e.fullName} — ${a.document}: ${a.remainingDays < 0 ? 'منتهٍ' : a.remainingDays + ' يوم'}`, severity });
          }));
          setAlerts(items);
        }
      } catch {
        // نتجاهل
      }
    })();
  }, [cfg.key]);

  useEffect(() => {
    let cancelled = false;
    setContractStats(null);
    setEquipmentStats(null);
    if (cfg.key === 'contracts') {
      api.get('/contracts/summary').then((res) => {
        if (cancelled) return;
        const d = res.data?.data;
        if (d) setContractStats({ totalContracts: d.totalContracts ?? 0, activeContracts: d.activeContracts ?? 0, monthlyTransportTotal: d.monthlyTransportTotal ?? 0 });
      }).catch((e) => { console.warn('[ResourcePage] contracts summary fetch failed:', e); });
    } else if (cfg.key === 'equipment') {
      api.get('/equipment/summary').then((res) => {
        if (cancelled) return;
        const d = res.data?.data;
        if (d) setEquipmentStats({ total: d.total ?? 0, byStatus: d.byStatus ?? [] });
      }).catch((e) => { console.warn('[ResourcePage] equipment summary fetch failed:', e); });
    }
    return () => { cancelled = true; };
  }, [cfg.key]);

  async function exportExcel() {
    if (!canExport) return;
    setExportBusy(true);
    try {
      const res = await api.get(`/reports/${cfg.key}/export`, {
        params: { format: 'excel' },
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, `${cfg.key}-export.xlsx`);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setExportBusy(false);
    }
  }

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (err as any)?.response?.status;
      if (status === 409 && cfg.key === 'equipment' && isSystemAdmin) {
        setForceDeleteCandidate({ id: row.id, code: row.code });
      } else if (status === 409 && cfg.key === 'customers' && isSystemAdmin) {
        setForceDeleteCustomerCandidate({ id: row.id, code: row.code });
      } else if (status === 409 && cfg.key === 'suppliers' && isSystemAdmin) {
        setForceDeleteSupplierCandidate({ id: row.id, code: row.code });
      } else if (status === 409 && cfg.key === 'contracts' && isSystemAdmin) {
        setForceDeleteContractCandidate({ id: row.id, code: row.code });
      } else if (status === 409 && cfg.supportsArchive && canUpdate) {
        setArchiveCandidate({ id: row.id, label: row.name ?? row.code ?? String(row.id) });
      } else {
        alert(errorMessage(err));
      }
    }
  }

  async function onConfirmArchive() {
    if (!archiveCandidate) return;
    try {
      await api.patch(`${cfg.endpoint}/${archiveCandidate.id}/archive`);
      setArchiveCandidate(null);
      load();
    } catch (err) {
      alert(errorMessage(err));
      setArchiveCandidate(null);
    }
  }

  async function onApprove(id: number, action: 'approve' | 'reject') {
    if (!confirm(t(action === 'approve' ? 'msg.confirm_approve' : 'msg.confirm_reject'))) return;
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
        <>
          {canExport && <ExportExcelButton onExport={exportExcel} busy={exportBusy} />}
          {canCreate && <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t(cfg.createLabel)}</button>}
        </>
      </div>

      {cfg.key === 'contracts' && contractStats && (
        <div className="inv-stats-strip">
          <div className="inv-stat-chip">
            <span className="inv-stat-icon">📄</span>
            <span className="inv-stat-label">{t('stat.rp.contracts.total')}</span>
            <span className="inv-stat-value">{contractStats.totalContracts}</span>
          </div>
          <div className="inv-stat-chip green">
            <span className="inv-stat-icon">✅</span>
            <span className="inv-stat-label">{t('stat.rp.contracts.active')}</span>
            <span className="inv-stat-value">{contractStats.activeContracts}</span>
          </div>
          <div className="inv-stat-chip blue">
            <span className="inv-stat-icon">💰</span>
            <span className="inv-stat-label">{t('stat.rp.contracts.monthly_value')}</span>
            <span className="inv-stat-value">{money(contractStats.monthlyTransportTotal)}</span>
          </div>
        </div>
      )}
      {cfg.key === 'equipment' && equipmentStats && (
        <div className="inv-stats-strip">
          <div className="inv-stat-chip">
            <span className="inv-stat-icon">🚜</span>
            <span className="inv-stat-label">{t('stat.rp.equipment.total')}</span>
            <span className="inv-stat-value">{equipmentStats.total}</span>
          </div>
          {equipmentStats.byStatus.map((s) => (
            <button
              key={s.status}
              type="button"
              className={`inv-stat-chip ${s.status === 'WORKING' ? 'green' : 'red'} clickable`}
              onClick={() => { setFilterValue(s.status); setPage(1); }}
              title={t(s.status === 'WORKING' ? 'stat.rp.equipment.show_working' : 'stat.rp.equipment.show_not_working')}
              aria-label={`${t('filter.status')}: ${t(s.status === 'WORKING' ? 'stat.rp.equipment.working' : 'stat.rp.equipment.not_working')} (${s.count})`}
            >
              <span className="inv-stat-icon" aria-hidden="true">{s.status === 'WORKING' ? '✅' : '🔴'}</span>
              <span className="inv-stat-label">{t(s.status === 'WORKING' ? 'stat.rp.equipment.working' : 'stat.rp.equipment.not_working')}</span>
              <span className="inv-stat-value">{s.count}</span>
            </button>
          ))}
          {equipmentStats.total > 0 && (
            <div className="inv-stat-chip blue">
              <span className="inv-stat-icon">📊</span>
              <span className="inv-stat-label">{t('stat.rp.equipment.uptime')}</span>
              <span className="inv-stat-value">
                {Math.round(((equipmentStats.byStatus.find((s) => s.status === 'WORKING')?.count ?? 0) / equipmentStats.total) * 100)}%
              </span>
            </div>
          )}
        </div>
      )}
      {alerts.length > 0 && (
        <div className="alert-chips-strip" role="alert" aria-live="polite">
          {alerts.map((item, i) => (
            <button
              key={i}
              type="button"
              className={`alert-chip ${item.severity}`}
              onClick={() => { setSearch(item.code); setQuery(item.code); setPage(1); }}
              title={item.label}
              aria-label={item.label}
            >
              <span aria-hidden="true">{item.severity === 'error' ? '🔴' : '⚠️'}</span>
              <span>{item.label}</span>
            </button>
          ))}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{t('filter.status')}:</span>
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
          </div>
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
        isFiltered={!!(query || filterValue)}
        onResetFilters={() => { setSearch(''); setQuery(''); setFilterValue(''); setPage(1); }}
        emptyAction={canCreate ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t(cfg.createLabel)}</button>
        ) : undefined}
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

      {archiveCandidate && (
        <Modal
          title="لا يمكن الحذف"
          onClose={() => setArchiveCandidate(null)}
          footer={
            <>
              <button type="button" className="btn secondary" onClick={() => setArchiveCandidate(null)}>إلغاء</button>
              <button type="button" className="btn" onClick={onConfirmArchive}>أرشفة</button>
            </>
          }
        >
          <p>لا يمكن حذف هذا السجل لأنه مرتبط ببيانات أخرى.</p>
          <p>يمكنك أرشفته بدلاً من حذفه — سيختفي من القوائم ويبقى في قاعدة البيانات.</p>
        </Modal>
      )}

      {forceDeleteCandidate && (
        <ForceDeleteEquipmentModal
          equipmentId={forceDeleteCandidate.id}
          onClose={() => setForceDeleteCandidate(null)}
          onDeleted={() => { setForceDeleteCandidate(null); load(); }}
        />
      )}

      {forceDeleteCustomerCandidate && (
        <ForceDeleteCustomerModal
          customerId={forceDeleteCustomerCandidate.id}
          onClose={() => setForceDeleteCustomerCandidate(null)}
          onDeleted={() => { setForceDeleteCustomerCandidate(null); load(); }}
        />
      )}

      {forceDeleteSupplierCandidate && (
        <ForceDeleteSupplierModal
          supplierId={forceDeleteSupplierCandidate.id}
          onClose={() => setForceDeleteSupplierCandidate(null)}
          onDeleted={() => { setForceDeleteSupplierCandidate(null); load(); }}
        />
      )}

      {forceDeleteContractCandidate && (
        <ForceDeleteContractModal
          contractId={forceDeleteContractCandidate.id}
          onClose={() => setForceDeleteContractCandidate(null)}
          onDeleted={() => { setForceDeleteContractCandidate(null); load(); }}
        />
      )}
    </div>
  );
}
