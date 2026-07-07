import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useToast } from '../stores/toastStore';
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
import ContractFinancialSummaryModal from '../components/ContractFinancialSummaryModal';
import ConfirmModal from '../components/ConfirmModal';
import { usePersistedState } from '../hooks/usePersistedState';
import ExportExcelButton from '../components/ExportExcelButton';
import { downloadBlob } from '../utils/exportUtils';
import { generateExportFileName } from '../utils/exportFilename';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  SearchBox,
  FilterChip,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Pagination,
  Tabs,
  Drawer,
  DrawerSection,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import EmployeeFinancialTab from '../components/employee/EmployeeFinancialTab';

type AlertItem = { id: number; code: string; label: string; severity: 'warn' | 'error' };
type ContractStats = { totalContracts: number; activeContracts: number; monthlyTransportTotal: number };
type EquipmentStats = { total: number; byStatus: { status: string; count: number }[] };
type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

export default function ResourcePage({ moduleKey }: { moduleKey: string }) {
  const cfg = MODULES[moduleKey];
  const { hasPermission, user } = useAuth();
  const isSystemAdmin = user?.role.name === 'SYSTEM_ADMIN';
  const { t } = useT();
  const toast = useToast();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewing, setViewing] = useState<any | null>(null);
  // Employee drawer only: which detail tab is active. Reset to 'basic' on every
  // employee change so payroll data is never fetched until the user opens مالية.
  const [drawerTab, setDrawerTab] = useState<'basic' | 'financial'>('basic');
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [contractStats, setContractStats] = useState<ContractStats | null>(null);
  const [equipmentStats, setEquipmentStats] = useState<EquipmentStats | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<{ id: number; label: string; conflictMessage?: string } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deleteCandidate, setDeleteCandidate] = useState<any | null>(null);
  const [approveCandidate, setApproveCandidate] = useState<{ id: number; action: 'approve' | 'reject' } | null>(null);
  const [forceDeleteCandidate, setForceDeleteCandidate] = useState<{ id: number; code: string } | null>(null);
  const [forceDeleteCustomerCandidate, setForceDeleteCustomerCandidate] = useState<{ id: number; code: string } | null>(null);
  const [forceDeleteSupplierCandidate, setForceDeleteSupplierCandidate] = useState<{ id: number; code: string } | null>(null);
  const [forceDeleteContractCandidate, setForceDeleteContractCandidate] = useState<{ id: number; code: string } | null>(null);
  const [financialSummaryContract, setFinancialSummaryContract] = useState<{ id: number; code: string } | null>(null);

  const explorer = !!cfg.explorer;
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

  // Reset the employee drawer to the basic tab whenever a different employee is
  // opened (or the drawer closes), so switching employees never shows stale
  // payroll data and مالية only fetches once the user actively selects it.
  useEffect(() => { setDrawerTab('basic'); }, [viewing?.id]);

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
      }).catch(() => {});
    } else if (cfg.key === 'equipment') {
      api.get('/equipment/summary').then((res) => {
        if (cancelled) return;
        const d = res.data?.data;
        if (d) setEquipmentStats({ total: d.total ?? 0, byStatus: d.byStatus ?? [] });
      }).catch(() => {});
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
      downloadBlob(res.data as Blob, generateExportFileName({ reportName: cfg.key, extension: 'xlsx' }));
    } catch (e) {
      setError(errorMessage(e));
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
  function onDelete(row: any) {
    setDeleteCandidate(row);
  }

  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function executeDelete(row: any) {
    setDeleteCandidate(null);
    if (busy) return;
    setBusy(true);
    try {
      await api.delete(`${cfg.endpoint}/${row.id}`);
      toast.ok('تم الحذف بنجاح');
      setViewing(null);
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
        setArchiveCandidate({ id: row.id, label: row.name ?? row.code ?? String(row.id), conflictMessage: errorMessage(err) });
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmArchive() {
    if (!archiveCandidate) return;
    if (busy) return;
    setBusy(true);
    try {
      await api.patch(`${cfg.endpoint}/${archiveCandidate.id}/archive`);
      setArchiveCandidate(null);
      toast.ok('تم الأرشفة بنجاح');
      load();
    } catch (err) {
      setError(errorMessage(err));
      setArchiveCandidate(null);
    } finally {
      setBusy(false);
    }
  }

  function onApprove(id: number, action: 'approve' | 'reject') {
    setApproveCandidate({ id, action });
  }

  async function executeApprove(id: number, action: 'approve' | 'reject') {
    setApproveCandidate(null);
    if (busy) return;
    setBusy(true);
    try {
      await api.patch(`${cfg.endpoint}/${id}/${action}`);
      toast.ok(action === 'approve' ? 'تمت الموافقة بنجاح' : 'تم الرفض');
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isFiltered = !!(query || filterValue);

  // ── Explorer KPI set (per module, from existing data only) ──────────────────
  function explorerKpis(): { icon: string; label: string; value: React.ReactNode; tone: Tone }[] {
    if (cfg.key === 'equipment' && equipmentStats) {
      const working = equipmentStats.byStatus.find((s) => s.status === 'WORKING')?.count ?? 0;
      const notWorking = equipmentStats.byStatus.find((s) => s.status === 'NOT_WORKING')?.count ?? 0;
      const uptime = equipmentStats.total > 0 ? Math.round((working / equipmentStats.total) * 100) : 0;
      return [
        { icon: 'construction', label: t('stat.rp.equipment.total'), value: equipmentStats.total, tone: 'indigo' },
        { icon: 'check_circle', label: t('stat.rp.equipment.working'), value: working, tone: 'green' },
        { icon: 'cancel', label: t('stat.rp.equipment.not_working'), value: notWorking, tone: 'red' },
        { icon: 'speed', label: t('stat.rp.equipment.uptime'), value: `${uptime}%`, tone: 'blue' },
      ];
    }
    const total = { icon: cfg.explorerIcon ?? 'category', label: 'الإجمالي', value: meta?.total ?? rows.length, tone: 'indigo' as Tone };
    if (cfg.key === 'employees') {
      return [total, { icon: 'event_busy', label: 'وثائق قاربت الانتهاء', value: alerts.length, tone: alerts.length ? 'orange' : 'green' }];
    }
    return [total];
  }

  // ── Shared create/edit dialog (skin depends on module) ──────────────────────
  const createDialog = creating && (
    <FormDialog
      title={t(cfg.createLabel)}
      fields={cfg.fields}
      endpoint={cfg.endpoint}
      onClose={() => setCreating(false)}
      onSaved={() => { toast.ok('تم الحفظ بنجاح'); load(); }}
      skin={explorer ? 'explorer' : 'legacy'}
      icon={cfg.explorerIcon}
      subtitle={explorer ? t(cfg.subtitle) : undefined}
      sections={cfg.formSections}
    />
  );
  const editDialog = editing && (
    <FormDialog
      title={`${t('action.edit')} — ${t(cfg.title)}`}
      fields={cfg.fields}
      endpoint={cfg.endpoint}
      id={editing.id}
      initial={editing}
      onClose={() => setEditing(null)}
      onSaved={() => { toast.ok('تم الحفظ بنجاح'); load(); }}
      skin={explorer ? 'explorer' : 'legacy'}
      icon={cfg.explorerIcon}
      subtitle={explorer ? t(cfg.subtitle) : undefined}
      sections={cfg.formSections}
    />
  );

  // ── Shared modals (identical for both skins) ────────────────────────────────
  const sharedModals = (
    <>
      {createDialog}
      {editDialog}
      {archiveCandidate && (
        <Modal
          title="لا يمكن الحذف"
          onClose={() => setArchiveCandidate(null)}
          footer={
            <>
              <button type="button" className="btn secondary" onClick={() => setArchiveCandidate(null)}>إلغاء</button>
              <button type="button" className="btn" onClick={onConfirmArchive} disabled={busy}>أرشفة</button>
            </>
          }
        >
          <p>{archiveCandidate.conflictMessage ?? 'لا يمكن حذف هذا السجل لأنه مرتبط ببيانات أخرى.'}</p>
          <p>يمكنك أرشفته بدلاً من حذفه — سيختفي من القوائم ويبقى في قاعدة البيانات.</p>
        </Modal>
      )}
      {forceDeleteCandidate && (
        <ForceDeleteEquipmentModal equipmentId={forceDeleteCandidate.id} onClose={() => setForceDeleteCandidate(null)} onDeleted={() => { setForceDeleteCandidate(null); load(); }} />
      )}
      {forceDeleteCustomerCandidate && (
        <ForceDeleteCustomerModal customerId={forceDeleteCustomerCandidate.id} onClose={() => setForceDeleteCustomerCandidate(null)} onDeleted={() => { setForceDeleteCustomerCandidate(null); load(); }} />
      )}
      {forceDeleteSupplierCandidate && (
        <ForceDeleteSupplierModal supplierId={forceDeleteSupplierCandidate.id} onClose={() => setForceDeleteSupplierCandidate(null)} onDeleted={() => { setForceDeleteSupplierCandidate(null); load(); }} />
      )}
      {forceDeleteContractCandidate && (
        <ForceDeleteContractModal contractId={forceDeleteContractCandidate.id} onClose={() => setForceDeleteContractCandidate(null)} onDeleted={() => { setForceDeleteContractCandidate(null); load(); }} />
      )}
      {financialSummaryContract && (
        <ContractFinancialSummaryModal contractId={financialSummaryContract.id} contractCode={financialSummaryContract.code} onClose={() => setFinancialSummaryContract(null)} />
      )}
      {deleteCandidate && (
        <ConfirmModal
          title="تأكيد الحذف"
          message={t('msg.confirm_delete', { id: deleteCandidate.code ?? deleteCandidate.name ?? deleteCandidate.username ?? deleteCandidate.id })}
          confirmLabel="حذف"
          variant="danger"
          onConfirm={() => executeDelete(deleteCandidate)}
          onCancel={() => setDeleteCandidate(null)}
        />
      )}
      {approveCandidate && (
        <ConfirmModal
          title={approveCandidate.action === 'approve' ? 'تأكيد الموافقة' : 'تأكيد الرفض'}
          message={t(approveCandidate.action === 'approve' ? 'msg.confirm_approve' : 'msg.confirm_reject')}
          confirmLabel={approveCandidate.action === 'approve' ? 'موافقة' : 'رفض'}
          variant={approveCandidate.action === 'approve' ? 'warning' : 'danger'}
          onConfirm={() => executeApprove(approveCandidate.id, approveCandidate.action)}
          onCancel={() => setApproveCandidate(null)}
        />
      )}
    </>
  );

  // ════════════════════════════════════════════════════════════════════════════
  //  Explorer skin
  // ════════════════════════════════════════════════════════════════════════════
  if (explorer) {
    const kpis = explorerKpis();
    const useHero = kpis.length >= 3;
    function resetAll() { setSearch(''); setQuery(''); setFilterValue(''); setPage(1); }

    // Shared "basic info" panel for the detail drawer — the default body for
    // every module, and the البيانات الأساسية tab for employees. Hoisted so the
    // two drawer branches below don't duplicate the field-rendering markup.
    const basicSection = viewing ? (
      <DrawerSection title={t(cfg.title)}>
        {cfg.columns.map((c) => (
          <div className="xpl-drawer-field" key={c.key}>
            <span className="xpl-drawer-field-label">{t(c.label)}</span>
            <span className="xpl-drawer-field-value">{c.render ? c.render(viewing) : (viewing[c.key] ?? '—')}</span>
          </div>
        ))}
      </DrawerSection>
    ) : null;

    return (
      <div className="xpl-scope xpl-page" dir="rtl">
        <ExecutiveHeader
          icon={cfg.explorerIcon ?? 'category'}
          title={t(cfg.title)}
          subtitle={t(cfg.subtitle)}
          chips={
            <>
              <IdChip icon={cfg.explorerIcon ?? 'category'} tone="indigo">{meta?.total ?? rows.length} سجل</IdChip>
              {alerts.length > 0 && <IdChip icon="warning" tone="orange">{alerts.length} تنبيه</IdChip>}
            </>
          }
          aside={canCreate ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t(cfg.createLabel)}</Button> : undefined}
        />

        {/* KPIs */}
        {kpis.length > 0 && (
          useHero ? (
            <div className="rcx-metrics" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 14, alignItems: 'stretch' }}>
              <HeroMetric icon={kpis[0].icon} label={kpis[0].label} value={kpis[0].value} />
              <div className="xpl-kpi-grid">
                {kpis.slice(1).map((k, i) => <MetricCard key={i} icon={k.icon} tone={k.tone} label={k.label} value={k.value} />)}
              </div>
            </div>
          ) : (
            <div className="xpl-kpi-grid">
              {kpis.map((k, i) => <MetricCard key={i} icon={k.icon} tone={k.tone} label={k.label} value={k.value} />)}
            </div>
          )
        )}

        {/* Alerts strip */}
        {alerts.length > 0 && (
          <div className="xpl-toolbar-row" role="alert" aria-live="polite">
            {alerts.slice(0, 12).map((a, i) => (
              <button key={i} type="button" className="xpl-filter-chip" title={a.label}
                onClick={() => { setSearch(a.code); setQuery(a.code); setPage(1); }}>
                <span className="material-symbols-outlined" style={{ color: a.severity === 'error' ? 'var(--xpl-red)' : 'var(--xpl-orange)' }}>{a.severity === 'error' ? 'error' : 'warning'}</span>
                {a.label}
              </button>
            ))}
          </div>
        )}

        {error && <ErrorBanner>{error} <button type="button" className="xpl-clear-link" onClick={load} disabled={loading}>{t('action.refresh')}</button></ErrorBanner>}

        {/* Sticky toolbar */}
        <form className="xpl-toolbar xpl-toolbar--sticky" onSubmit={onSearch}>
          <div className="xpl-toolbar-row">
            <SearchBox value={search} onChange={(v) => setSearch(v)} placeholder={t('action.search_placeholder')} ariaLabel={t('action.search')} />
            <Button variant="secondary" icon="search" onClick={() => { setPage(1); setQuery(search); }}>{t('action.search')}</Button>
            <Button variant="ghost" icon="refresh" busy={loading} onClick={load}>{t('action.refresh')}</Button>
            {canExport && <Button variant="secondary" icon="table_view" busy={exportBusy} onClick={exportExcel}>تصدير Excel</Button>}
          </div>
          {cfg.statusFilter && (
            <div className="xpl-toolbar-row">
              <FilterChip active={filterValue === ''} onClick={() => { setFilterValue(''); setPage(1); }}>{t('opt.all')}</FilterChip>
              {cfg.statusFilter.options.map((o) => (
                <FilterChip key={o.value} active={filterValue === o.value} onClick={() => { setFilterValue(o.value); setPage(1); }}>{t(o.labelKey)}</FilterChip>
              ))}
              {isFiltered && <button type="button" className="xpl-clear-link" onClick={resetAll}>{t('action.reset_filters')}</button>}
              <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{meta?.total ?? rows.length} نتيجة</span>
            </div>
          )}
        </form>

        {/* Table */}
        <section className="xpl-card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={cfg.explorerIcon ?? 'inbox'}
              tone="neutral"
              title={isFiltered ? t('msg.no_results') : (cfg.emptyText ? t(cfg.emptyText) : t('msg.empty'))}
              message={isFiltered ? 'جرّب تعديل البحث أو الفلاتر.' : undefined}
              action={isFiltered ? <Button variant="secondary" icon="restart_alt" onClick={resetAll}>{t('action.reset_filters')}</Button>
                : canCreate ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t(cfg.createLabel)}</Button> : undefined}
            />
          ) : (
            <>
              <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="xpl-table">
                  <thead>
                    <tr>
                      {cfg.columns.map((c) => <th key={c.key}>{t(c.label)}</th>)}
                      <th aria-label="فتح" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="xpl-row--click" tabIndex={0} role="button"
                        aria-label={`تفاصيل ${r.name ?? r.fullName ?? r.code ?? r.id}`}
                        onClick={() => setViewing(r)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                        {cfg.columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}
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
            title={String(viewing.name ?? viewing.fullName ?? viewing.code ?? t(cfg.title))}
            onClose={() => setViewing(null)}
            hero={
              <div className="xpl-drawer-hero">
                <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">{cfg.explorerIcon ?? 'category'}</span></div>
                <div className="xpl-drawer-hero-body">
                  <span className="xpl-drawer-hero-title">{String(viewing.name ?? viewing.fullName ?? viewing.code ?? '')}</span>
                  {viewing.code && <span className="xpl-drawer-hero-sub">{viewing.code}</span>}
                </div>
              </div>
            }
            footer={
              <>
                {cfg.key === 'contracts' && (
                  <Button variant="secondary" icon="bar_chart" onClick={() => setFinancialSummaryContract({ id: viewing.id, code: viewing.code })}>{t('action.financial_summary')}</Button>
                )}
                {canUpdate && <Button variant="primary" icon="edit" onClick={() => { setEditing(viewing); setViewing(null); }}>{t('action.edit')}</Button>}
                {canDelete && <Button variant="danger" icon="delete" busy={busy} onClick={() => onDelete(viewing)}>{t('action.delete')}</Button>}
              </>
            }
          >
            {cfg.key === 'employees' ? (
              <>
                <Tabs
                  tabs={[
                    { key: 'basic', label: 'البيانات الأساسية', icon: 'badge' },
                    { key: 'financial', label: 'المالية', icon: 'payments' },
                  ]}
                  active={drawerTab}
                  onChange={setDrawerTab}
                />
                {drawerTab === 'basic' ? basicSection : (
                  // Keyed by employee id → remounts per employee (no stale payroll);
                  // only mounts here, so payroll fetch is lazy to the مالية tab.
                  <EmployeeFinancialTab key={viewing.id} employee={viewing} />
                )}
              </>
            ) : basicSection}
          </Drawer>
        )}

        {sharedModals}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Legacy skin (unchanged — used by contracts and any non-explorer module)
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div>
      <div className="page-head">
        <div><h2>{t(cfg.title)}</h2><p>{t(cfg.subtitle)}</p></div>
        <>
          {canCreate && <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t(cfg.createLabel)}</button>}
          {canExport && <ExportExcelButton onExport={exportExcel} busy={exportBusy} />}
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
              className="toolbar-clear-btn"
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
        isFiltered={!!(query || filterValue)}
        onResetFilters={() => { setSearch(''); setQuery(''); setFilterValue(''); setPage(1); }}
        emptyAction={canCreate ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t(cfg.createLabel)}</button>
        ) : undefined}
        actions={(row) => (
          <>
            {cfg.canApprove && row.status === 'PENDING' && hasPermission('expenses.approve') && (
              <>
                <button type="button" className="btn sm" onClick={() => onApprove(row.id, 'approve')} disabled={busy}>{t('action.approve')}</button>{' '}
                <button type="button" className="btn secondary sm" onClick={() => onApprove(row.id, 'reject')} disabled={busy}>{t('action.reject')}</button>{' '}
              </>
            )}
            {cfg.key === 'contracts' && (
              <><button type="button" className="btn secondary sm" onClick={() => setFinancialSummaryContract({ id: row.id, code: row.code })}>📊 {t('action.financial_summary')}</button>{' '}</>
            )}
            {canUpdate && <button type="button" className="btn secondary sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>}{' '}
            {canDelete && <button type="button" className="btn danger sm" onClick={() => onDelete(row)}>{t('action.delete')}</button>}
          </>
        )}
      />

      {sharedModals}
    </div>
  );
}
