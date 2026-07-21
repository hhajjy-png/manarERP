import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';
import DateInput from '../components/DateInput';
import { todayDateOnly } from '../lib/date';
import { PageMeta } from '../components/DataTable';
import { money, dateText, MoneyText, MoneyCell } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { usePersistedState } from '../hooks/usePersistedState';
import { useTableSort } from '../hooks/useTableSort';
import SortableHeader from '../components/SortableHeader';
import { useToast } from '../stores/toastStore';
import { ReturnToReportButton } from '../components/financial/ReturnToReportButton';
import {
  ExecutiveHeader,
  Tabs,
  HeroMetric,
  MetricCard,
  SectionCard,
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
import './Accounting.css';
import HistoricalDateNotice from '../components/period/HistoricalDateNotice';
import PeriodControl from '../components/period/PeriodControl';
import { useFinancialPeriod } from '../context/FinancialPeriodContext';
import { periodToReportParams } from '../lib/financialPeriod';
import { fcMoneyHeader } from '../components/financial/financialLabels';

type Tab = 'summary' | 'accounts' | 'journal' | 'payments';
type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

const accountTypeKey: Record<string, string> = {
  ASSET: 'acc.type.asset', LIABILITY: 'acc.type.liability', EQUITY: 'acc.type.equity',
  REVENUE: 'acc.type.revenue', EXPENSE: 'acc.type.expense',
};
const ACC_TYPE_TONE: Record<string, Tone> = {
  ASSET: 'blue', LIABILITY: 'orange', EQUITY: 'indigo', REVENUE: 'green', EXPENSE: 'red',
};
const ACC_TYPE_ICON: Record<string, string> = {
  ASSET: 'account_balance_wallet', LIABILITY: 'credit_card', EQUITY: 'savings',
  REVENUE: 'trending_up', EXPENSE: 'trending_down',
};
const normalBalanceKey: Record<string, string> = { DEBIT: 'acc.balance.debit', CREDIT: 'acc.balance.credit' };
const journalStatusMeta: Record<string, { key: string; tone: Tone; icon: string }> = {
  POSTED:    { key: 'acc.journal.posted',    tone: 'green',   icon: 'check_circle' },
  DRAFT:     { key: 'acc.journal.draft',     tone: 'orange',  icon: 'edit_note' },
  CANCELLED: { key: 'acc.journal.cancelled', tone: 'neutral', icon: 'block' },
};
const paymentMethodKey: Record<string, string> = {
  CASH: 'opt.payment.cash', BANK: 'opt.payment.bank', CHEQUE: 'opt.payment.cheque', TRANSFER: 'opt.payment.transfer',
};

export default function Accounting() {
  const [tab, setTab] = usePersistedState<Tab>('acc:tab', 'summary');
  const { hasPermission } = useAuth();
  const { t } = useT();
  const canCreate = hasPermission('transactions.create');

  return (
    <div className="xpl-scope xpl-page" dir="rtl">
      <ReturnToReportButton />
      <ExecutiveHeader
        icon="account_balance"
        title={t('page.accounting.title')}
        subtitle={t('page.accounting.subtitle')}
      />

      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'summary', label: t('tab.accounting.summary'), icon: 'monitoring' },
          { key: 'accounts', label: t('tab.accounting.accounts'), icon: 'account_tree' },
          { key: 'journal', label: t('tab.accounting.journal'), icon: 'menu_book' },
          { key: 'payments', label: t('tab.accounting.payments'), icon: 'payments' },
        ]}
      />

      {tab === 'summary' && <SummaryTab />}
      {tab === 'accounts' && <AccountsTab canCreate={canCreate} />}
      {tab === 'journal' && <JournalTab canCreate={canCreate} />}
      {tab === 'payments' && <PaymentsTab />}
    </div>
  );
}

// ─── Summary Tab ─────────────────────────────────────────────────────────────

function SummaryTab() {
  const { t } = useT();
  const { period } = useFinancialPeriod();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pl, setPl] = useState<{ totalRevenue: number; totalExpense: number; netProfit: number } | null>(null);

  // يتبع الفترة المالية النشطة (نفس سياق لوحة القيادة/مركز المالية) — فلا يعرض
  // أرقام «كل الفترات» بينما تُظهر الشاشات الأخرى فترة مختارة.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = periodToReportParams(period);
    (async () => {
      try {
        const [s, p] = await Promise.all([
          api.get('/accounting/summary', { params }),
          api.get('/transactions/profit-loss', { params }),
        ]);
        if (cancelled) return;
        setSummary(s.data.data);
        setPl(p.data.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period.fromDate, period.toDate, period.isAllPeriods]);

  if (loading) return (<><PeriodControl /><SkeletonRows rows={4} /></>);

  const net = Number(summary?.netProfit ?? 0);

  return (
    <>
      <PeriodControl />
      <div className="accx-metrics">
        <HeroMetric
          icon="savings"
          label={t('stat.acc.net_profit')}
          value={<MoneyText value={summary?.netProfit} />}
          sub={<><span className="material-symbols-outlined">{net >= 0 ? 'trending_up' : 'trending_down'}</span>{net >= 0 ? t('acc.summary.positive_profit') : t('acc.summary.net_loss')}</>}
        />
        <div className="xpl-kpi-grid">
          <MetricCard icon="trending_up" tone="green" label={t('stat.acc.total_revenue')} value={<MoneyText value={summary?.totalRevenue} />} />
          <MetricCard icon="task_alt" tone="green" label={t('stat.acc.total_collected')} value={<MoneyText value={summary?.totalCollected} />} />
          <MetricCard icon="trending_down" tone="red" label={t('stat.acc.total_expenses')} value={<MoneyText value={summary?.totalExpenses} />} />
          <MetricCard icon="menu_book" tone="indigo" label={t('col.acc.journal_count')} value={summary?.journalEntryCount ?? 0} />
        </div>
      </div>

      <div className="accx-panels">
        <SectionCard title={t('section.acc.journal_summary')} icon="menu_book">
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--xpl-muted)' }}>{t('section.acc.journal_from')}</p>
          <div className="accx-kv">
            <div className="accx-kv-row"><span className="accx-kv-label">{t('col.acc.journal_count')}</span><span className="accx-kv-val">{summary?.journalEntryCount ?? 0}</span></div>
            <div className="accx-kv-row"><span className="accx-kv-label">{t('col.acc.total_debit_lbl')}</span><span className="accx-kv-val red">{<MoneyText value={summary?.totalJournalDebit} />}</span></div>
            <div className="accx-kv-row"><span className="accx-kv-label">{t('col.acc.total_credit_lbl')}</span><span className="accx-kv-val green">{<MoneyText value={summary?.totalJournalCredit} />}</span></div>
          </div>
        </SectionCard>

        <SectionCard title={t('section.acc.pl')} icon="assessment">
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--xpl-muted)' }}>{t('section.acc.pl_from')}</p>
          <div className="accx-kv">
            <div className="accx-kv-row"><span className="accx-kv-label">{t('col.acc.revenue_lbl')}</span><span className="accx-kv-val green">{<MoneyText value={pl?.totalRevenue} />}</span></div>
            <div className="accx-kv-row"><span className="accx-kv-label">{t('col.acc.expense_lbl')}</span><span className="accx-kv-val red">{<MoneyText value={pl?.totalExpense} />}</span></div>
            <div className="accx-kv-row total"><span className="accx-kv-label">{t('col.acc.net_profit_lbl')}</span><span className={`accx-kv-val ${(pl?.netProfit ?? 0) >= 0 ? 'green' : 'red'}`}>{<MoneyText value={pl?.netProfit} />}</span></div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

// ─── Chart of Accounts Tab ───────────────────────────────────────────────────

function AccountsTab({ canCreate }: { canCreate: boolean }) {
  const { t } = useT();
  const toast = useToast();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [creating, setCreating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewing, setViewing] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  // فرز خادمي — تغيير الفرز استعلام جديد فيعود للصفحة الأولى.
  const sort = useTableSort('accounting-accounts', () => setPage(1));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/accounting/accounts', {
        params: {
          page,
          pageSize: 20,
          search: search || undefined,
          type: typeFilter || undefined,
          ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}),
        },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, sort.sortBy, sort.sortDir]);
  useEffect(() => { load(); }, [load]);

  function deleteAccount(id: number) { setDeleteConfirmId(id); }

  async function executeDeleteAccount(id: number) {
    setDeleteConfirmId(null);
    if (busy) return;
    setBusy(true);
    try { await api.delete(`/accounting/accounts/${id}`); toast.ok(t('acc.msg.account_deleted')); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  const isFiltered = !!(search || typeFilter);

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('ph.acc.search_account')} ariaLabel={t('ph.acc.search_account')} />
          {canCreate && <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('btn.acc.new_account')}</Button>}
        </div>
        <div className="xpl-toolbar-row">
          <FilterChip active={typeFilter === ''} onClick={() => { setTypeFilter(''); setPage(1); }}>{t('opt.acc.all_types')}</FilterChip>
          {Object.entries(accountTypeKey).map(([v, k]) => (
            <FilterChip key={v} active={typeFilter === v} onClick={() => { setTypeFilter(v); setPage(1); }} icon={ACC_TYPE_ICON[v]}>{t(k)}</FilterChip>
          ))}
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <section className="xpl-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon="account_tree" tone="neutral" title={t('acc.empty.accounts_title')}
            message={isFiltered ? t('acc.empty.accounts_filtered') : t('acc.empty.accounts_none')}
            action={canCreate ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('btn.acc.new_account')}</Button> : undefined} />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table">
                <thead>
                  <tr>
                    <SortableHeader label={t('col.acc.code')} title={t('col.acc.code')} state={sort.getState('code')} onToggle={() => sort.toggle('code')} />
                    <SortableHeader label={t('col.acc.name')} title={t('col.acc.name')} state={sort.getState('name')} onToggle={() => sort.toggle('name')} />
                    <SortableHeader label={t('col.acc.type')} title={t('col.acc.type')} state={sort.getState('type')} onToggle={() => sort.toggle('type')} />
                    <SortableHeader label={t('col.acc.normal_balance')} title={t('col.acc.normal_balance')} state={sort.getState('normalBalance')} onToggle={() => sort.toggle('normalBalance')} />
                    {/* الحساب الأب علاقة متداخلة — غير قابل للفرز */}
                    <th>{t('col.acc.parent')}</th>
                    <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('isActive')} onToggle={() => sort.toggle('isActive')} />
                    <th aria-label={t('acc.aria.open')} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="xpl-row--click" tabIndex={0} role="button"
                      aria-label={t('acc.aria.account_details', { code: r.code, name: r.name })}
                      onClick={() => setViewing(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                      <td><span className="accx-code">{String(r.code)}</span></td>
                      <td><strong>{String(r.name)}</strong></td>
                      <td><StatusChip tone={ACC_TYPE_TONE[String(r.type)] ?? 'neutral'} icon={ACC_TYPE_ICON[String(r.type)]}>{t(accountTypeKey[String(r.type)] ?? 'acc.type.asset')}</StatusChip></td>
                      <td>{t(normalBalanceKey[String(r.normalBalance)] ?? 'acc.balance.debit')}</td>
                      <td>{r.parent ? `${r.parent.code} - ${r.parent.name}` : '—'}</td>
                      <td><StatusChip tone={r.isActive ? 'green' : 'neutral'}>{r.isActive ? t('status.active') : t('status.suspended')}</StatusChip></td>
                      <td className="xpl-col-chevron"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </section>

      {viewing && (
        <Drawer
          title={`${t('col.acc.code')}: ${viewing.code}`}
          onClose={() => setViewing(null)}
          hero={
            <div className="xpl-drawer-hero">
              <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">{ACC_TYPE_ICON[String(viewing.type)] ?? 'account_tree'}</span></div>
              <div className="xpl-drawer-hero-body">
                <span className="xpl-drawer-hero-title">{viewing.name}</span>
                <span className="xpl-drawer-hero-sub">{viewing.code}</span>
                <div style={{ marginTop: 4 }}>
                  <StatusChip tone={ACC_TYPE_TONE[String(viewing.type)] ?? 'neutral'} icon={ACC_TYPE_ICON[String(viewing.type)]}>{t(accountTypeKey[String(viewing.type)] ?? 'acc.type.asset')}</StatusChip>
                </div>
              </div>
            </div>
          }
          footer={
            <>
              <Button variant="primary" icon="edit" onClick={() => { setEditing(viewing); setViewing(null); }}>{t('action.edit')}</Button>
              <Button variant="danger" icon="delete" busy={busy} onClick={() => deleteAccount(viewing.id)}>{t('action.delete')}</Button>
            </>
          }
        >
          <DrawerSection title={t('acc.section.account_data')}>
            <DrawerField label={t('col.acc.code')} value={viewing.code} mono />
            <DrawerField label={t('col.acc.name')} value={viewing.name} />
            <DrawerField label={t('col.acc.type')} value={t(accountTypeKey[String(viewing.type)] ?? 'acc.type.asset')} />
            <DrawerField label={t('col.acc.normal_balance')} value={t(normalBalanceKey[String(viewing.normalBalance)] ?? 'acc.balance.debit')} />
            <DrawerField label={t('col.acc.parent')} value={viewing.parent ? `${viewing.parent.code} - ${viewing.parent.name}` : '—'} />
            <DrawerField label={t('col.status')} value={<StatusChip tone={viewing.isActive ? 'green' : 'neutral'}>{viewing.isActive ? t('status.active') : t('status.suspended')}</StatusChip>} />
          </DrawerSection>
          {viewing.notes && (
            <DrawerSection title={t('field.notes')}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--xpl-text)' }}>{viewing.notes}</p>
            </DrawerSection>
          )}
        </Drawer>
      )}

      {creating && <AccountForm onClose={() => setCreating(false)} onSaved={() => { toast.ok(t('acc.msg.account_saved')); load(); }} />}
      {editing && <AccountForm account={editing} onClose={() => setEditing(null)} onSaved={() => { toast.ok(t('acc.msg.account_saved')); load(); }} />}
      {deleteConfirmId !== null && (
        <ConfirmModal
          title={t('acc.confirm.delete_account_title')}
          message={t('confirm.delete_account')}
          confirmLabel={t('action.delete')}
          variant="danger"
          onConfirm={() => executeDeleteAccount(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AccountForm({ account, onClose, onSaved }: { account?: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const isEdit = !!account;
  const [code, setCode] = useState(account?.code ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState(account?.type ?? 'ASSET');
  const [normalBalance, setNormalBalance] = useState(account?.normalBalance ?? 'DEBIT');
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [notes, setNotes] = useState(account?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!code.trim()) { setError(t('error.acc.code_required')); return; }
    if (!name.trim()) { setError(t('error.acc.name_required')); return; }
    setSaving(true);
    try {
      const payload = { code: code.trim(), name: name.trim(), type, normalBalance, isActive, notes: notes || undefined };
      if (isEdit) await api.patch(`/accounting/accounts/${account.id}`, payload);
      else await api.post('/accounting/accounts', payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      icon="account_tree"
      title={isEdit ? t('modal.acc.edit_account') : t('modal.acc.new_account')}
      subtitle={isEdit ? account.code : t('acc.account_form.subtitle')}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" icon="save" busy={saving} onClick={submit}>{t('action.save')}</Button>
          <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
        </>
      }
    >
      {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <DialogSection title={t('acc.section.account_data')} icon="badge">
        <div className="xpl-field">
          <label>{t('field.acc.code')} <span className="req">*</span></label>
          <input className="xpl-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="1100" style={{ direction: 'ltr' }} autoFocus aria-label={t('field.acc.code')} />
        </div>
        <div className="xpl-field">
          <label>{t('field.acc.name')} <span className="req">*</span></label>
          <input className="xpl-input" value={name} onChange={(e) => setName(e.target.value)} aria-label={t('field.acc.name')} />
        </div>
        <div className="xpl-field">
          <label>{t('field.acc.type')}</label>
          <select className="xpl-select" value={type} onChange={(e) => setType(e.target.value)} aria-label={t('field.acc.type')}>
            {Object.entries(accountTypeKey).map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
          </select>
        </div>
        <div className="xpl-field">
          <label>{t('field.acc.normal_balance')}</label>
          <select className="xpl-select" value={normalBalance} onChange={(e) => setNormalBalance(e.target.value)} aria-label={t('field.acc.normal_balance')}>
            <option value="DEBIT">{t('acc.balance.debit')}</option>
            <option value="CREDIT">{t('acc.balance.credit')}</option>
          </select>
        </div>
        <div className="xpl-field">
          <label>{t('field.acc.active_status')}</label>
          <select className="xpl-select" value={String(isActive)} onChange={(e) => setIsActive(e.target.value === 'true')} aria-label={t('field.acc.active_status')}>
            <option value="true">{t('status.active')}</option>
            <option value="false">{t('status.suspended')}</option>
          </select>
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.notes')}</label>
          <input className="xpl-input" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label={t('field.notes')} />
        </div>
      </DialogSection>
    </Dialog>
  );
}

// ─── Journal Entries Tab ──────────────────────────────────────────────────────

function JournalTab({ canCreate }: { canCreate: boolean }) {
  const { t } = useT();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get('highlight');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [expanded, setExpanded] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<number | null>(null);
  // فرز خادمي — تغيير الفرز استعلام جديد فيعود للصفحة الأولى.
  const sort = useTableSort('accounting-journal', () => setPage(1));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/accounting/journal', {
        params: {
          page,
          pageSize: 15,
          search: search || undefined,
          ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}),
        },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search, sort.sortBy, sort.sortDir]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!highlight || loading) return;
    const el = document.getElementById(`row-${highlight}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-row');
    }
  }, [highlight, loading, rows]);

  function cancelEntry(id: number) { setCancelConfirmId(id); }

  async function executeCancelEntry(id: number) {
    setCancelConfirmId(null);
    if (busy) return;
    setBusy(true);
    try { await api.patch(`/accounting/journal/${id}/cancel`); toast.ok(t('acc.msg.entry_cancelled')); setExpanded(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entryTotal = (r: any) => (r.lines ?? []).reduce((s: number, l: { debit: number }) => s + l.debit, 0);

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('ph.acc.search_journal')} ariaLabel={t('ph.acc.search_journal')} />
          {canCreate && <Button variant="primary" icon="post_add" onClick={() => setCreating(true)}>{t('btn.acc.new_entry')}</Button>}
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <section className="xpl-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon="menu_book" tone="neutral" title={t('acc.empty.journal_title')} message={t('acc.empty.journal_message')}
            action={canCreate ? <Button variant="primary" icon="post_add" onClick={() => setCreating(true)}>{t('btn.acc.new_entry')}</Button> : undefined} />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table">
                <thead>
                  <tr>
                    <SortableHeader label={t('col.acc.entry_number')} title={t('col.acc.entry_number')} state={sort.getState('entryNumber')} onToggle={() => sort.toggle('entryNumber')} />
                    <SortableHeader label={t('col.date')} title={t('col.date')} state={sort.getState('date')} onToggle={() => sort.toggle('date')} />
                    <SortableHeader label={t('col.acc.description')} title={t('col.acc.description')} state={sort.getState('description')} onToggle={() => sort.toggle('description')} />
                    {/* إجمالي المدين محسوب من بنود القيد — غير قابل للفرز */}
                    <th>{fcMoneyHeader(t('col.acc.total_debit_lbl'))}</th>
                    <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('status')} onToggle={() => sort.toggle('status')} />
                    <th aria-label={t('acc.aria.open')} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const sm = journalStatusMeta[String(r.status)] ?? journalStatusMeta.DRAFT;
                    return (
                      <tr key={r.id} id={`row-${r.id}`} className="xpl-row--click" tabIndex={0} role="button"
                        aria-label={t('acc.aria.entry_details', { number: r.entryNumber })}
                        onClick={() => setExpanded(r)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(r); } }}>
                        <td><span className="accx-code">{String(r.entryNumber)}</span></td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.date)}</td>
                        <td>{String(r.description)}</td>
                        <td style={{ fontWeight: 700 }}>{<MoneyCell value={entryTotal(r)} />}</td>
                        <td><StatusChip tone={sm.tone} icon={sm.icon}>{t(sm.key)}</StatusChip></td>
                        <td className="xpl-col-chevron"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </section>

      {creating && <JournalEntryForm onClose={() => setCreating(false)} onSaved={() => { toast.ok(t('acc.msg.entry_posted')); load(); }} />}
      {expanded && (
        <JournalEntryDrawer
          entry={expanded}
          onClose={() => setExpanded(null)}
          onCancelEntry={expanded.status === 'POSTED' && expanded.referenceType === 'MANUAL' ? () => cancelEntry(expanded.id) : undefined}
          busy={busy}
        />
      )}
      {cancelConfirmId !== null && (
        <ConfirmModal
          title={t('acc.confirm.cancel_entry_title')}
          message={t('confirm.cancel_entry')}
          confirmLabel={t('acc.confirm.cancel_entry_label')}
          variant="danger"
          onConfirm={() => executeCancelEntry(cancelConfirmId)}
          onCancel={() => setCancelConfirmId(null)}
        />
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function JournalEntryDrawer({ entry, onClose, onCancelEntry, busy }: { entry: any; onClose: () => void; onCancelEntry?: () => void; busy: boolean }) {
  const { t } = useT();
  const totalDebit = (entry.lines ?? []).reduce((s: number, l: { debit: number }) => s + l.debit, 0);
  const totalCredit = (entry.lines ?? []).reduce((s: number, l: { credit: number }) => s + l.credit, 0);
  const sm = journalStatusMeta[String(entry.status)] ?? journalStatusMeta.DRAFT;
  return (
    <Drawer
      title={`${t('col.acc.entry_number')}: ${entry.entryNumber}`}
      onClose={onClose}
      hero={
        <div className="xpl-drawer-hero">
          <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">menu_book</span></div>
          <div className="xpl-drawer-hero-body">
            <span className="xpl-drawer-hero-title">{entry.entryNumber}</span>
            <span className="xpl-drawer-hero-sub">{dateText(entry.date)}</span>
            <div style={{ marginTop: 4 }}><StatusChip tone={sm.tone} icon={sm.icon}>{t(sm.key)}</StatusChip></div>
          </div>
        </div>
      }
      footer={onCancelEntry ? <Button variant="danger" icon="block" busy={busy} onClick={onCancelEntry}>{t('action.cancel')}</Button> : <Button variant="ghost" icon="close" onClick={onClose}>{t('action.close')}</Button>}
    >
      <DrawerSection title={t('acc.section.entry_details')}>
        <DrawerField label={t('col.acc.description')} value={entry.description} />
        <DrawerField label={t('col.date')} value={dateText(entry.date)} />
      </DrawerSection>
      <DrawerSection title={t('acc.section.entry_lines')}>
        <table className="accx-detail-table">
          <thead><tr><th>{t('col.acc.account')}</th><th>{fcMoneyHeader(t('col.acc.debit'))}</th><th>{fcMoneyHeader(t('col.acc.credit'))}</th></tr></thead>
          <tbody>
            {(entry.lines ?? []).map((l: { id: number; account?: { code: string; name: string }; description?: string; debit: number; credit: number }) => (
              <tr key={l.id}>
                <td>{l.account ? `${l.account.code} - ${l.account.name}` : '—'}{l.description ? <div style={{ fontSize: 11, color: 'var(--xpl-muted)' }}>{l.description}</div> : null}</td>
                <td className="accx-debit">{l.debit > 0 ? <MoneyCell value={l.debit} /> : '—'}</td>
                <td className="accx-credit">{l.credit > 0 ? <MoneyCell value={l.credit} /> : '—'}</td>
              </tr>
            ))}
            <tr className="total">
              <td>{t('lbl.acc.total_debit')}</td>
              <td className="accx-debit">{<MoneyCell value={totalDebit} />}</td>
              <td className="accx-credit">{<MoneyCell value={totalCredit} />}</td>
            </tr>
          </tbody>
        </table>
      </DrawerSection>
    </Drawer>
  );
}

interface JournalLine { accountId: string; description: string; debit: string; credit: string; }

function JournalEntryForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayDateOnly());
  const [lines, setLines] = useState<JournalLine[]>([
    { accountId: '', description: '', debit: '', credit: '' },
    { accountId: '', description: '', debit: '', credit: '' },
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [accounts, setAccounts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/accounting/accounts', { params: { pageSize: 500, isActive: 'true' } })
      .then((r) => setAccounts(r.data.data.data ?? []))
      .catch(() => {});
  }, []);

  function setLine(i: number, key: keyof JournalLine, value: string) {
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, [key]: value } : l));
  }

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001;

  async function submit() {
    setError('');
    if (!description.trim()) { setError(t('error.acc.desc_required')); return; }
    if (lines.some((l) => !l.accountId)) { setError(t('error.acc.select_account')); return; }
    if (!balanced) { setError(t('error.acc.unbalanced')); return; }
    setSaving(true);
    try {
      await api.post('/accounting/journal', {
        description: description.trim(),
        date: new Date(date),
        lines: lines.map((l) => ({ accountId: Number(l.accountId), description: l.description || undefined, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      icon="post_add"
      title={t('modal.acc.new_entry')}
      subtitle={t('acc.entry_form.subtitle')}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" icon="check_circle" busy={saving} disabled={!balanced} onClick={submit}>{t('btn.acc.post_entry')}</Button>
          <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
        </>
      }
    >
      {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <DialogSection title={t('acc.section.entry_info')} icon="description">
        <div className="xpl-field xpl-field--full">
          <label>{t('field.acc.desc')} <span className="req">*</span></label>
          <input className="xpl-input" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus aria-label={t('field.acc.desc')} />
        </div>
        <div className="xpl-field">
          <label>{t('col.date')}</label>
          <DateInput className="xpl-input" value={date} onChange={setDate} ariaLabel={t('col.date')} />
          <HistoricalDateNotice date={date} />
        </div>
      </DialogSection>

      <section className="xpl-dialog-section">
        <div className="xpl-dialog-section-title"><span className="material-symbols-outlined">table_rows</span>{t('acc.section.entry_lines')}</div>
        <div className="accx-jline-head">
          <span>{t('col.acc.account')}</span>
          <span>{t('col.acc.desc_opt')}</span>
          <span>{t('col.acc.debit')}</span>
          <span>{t('col.acc.credit')}</span>
          <span />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="accx-jline">
            <select className="xpl-select" value={l.accountId} onChange={(e) => setLine(i, 'accountId', e.target.value)} aria-label={t('col.acc.account')}>
              <option value="">{t('msg.select_placeholder')}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </select>
            <input className="xpl-input" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder={t('ph.acc.line_desc')} aria-label={t('col.acc.desc_opt')} />
            <input className="xpl-input" type="number" min="0" step="0.001" value={l.debit} onChange={(e) => setLine(i, 'debit', e.target.value)} style={{ direction: 'ltr' }} placeholder="0" aria-label={`${t('col.acc.debit')} ${i + 1}`} />
            <input className="xpl-input" type="number" min="0" step="0.001" value={l.credit} onChange={(e) => setLine(i, 'credit', e.target.value)} style={{ direction: 'ltr' }} placeholder="0" aria-label={`${t('col.acc.credit')} ${i + 1}`} />
            {lines.length > 2
              ? <button type="button" className="accx-jline-remove" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} aria-label={t('acc.aria.remove_line')}><span className="material-symbols-outlined">close</span></button>
              : <span />}
          </div>
        ))}
        <Button variant="ghost" icon="add" small onClick={() => setLines((p) => [...p, { accountId: '', description: '', debit: '', credit: '' }])}>{t('btn.acc.add_line')}</Button>

        <div className="accx-balance-bar">
          <span><span className="lbl">{t('lbl.acc.total_debit')}: </span><span className="v-debit">{<MoneyText value={totalDebit} />}</span></span>
          <span><span className="lbl">{t('lbl.acc.total_credit')}: </span><span className="v-credit">{<MoneyText value={totalCredit} />}</span></span>
          {!balanced && totalDebit + totalCredit > 0 && <span className="accx-balance-state bad"><span className="material-symbols-outlined">error</span>{t('lbl.acc.unbalanced')}</span>}
          {balanced && totalDebit > 0 && <span className="accx-balance-state ok"><span className="material-symbols-outlined">check_circle</span>{t('lbl.acc.balanced')}</span>}
        </div>
      </section>
    </Dialog>
  );
}

// ─── Payments Tab ─────────────────────────────────────────────────────────────

function PaymentsTab() {
  const { t } = useT();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [methodFilter, setMethodFilter] = useState('');
  // فرز خادمي — تغيير الفرز استعلام جديد فيعود للصفحة الأولى.
  const sort = useTableSort('accounting-payments', () => setPage(1));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/accounting/payments', {
        params: {
          page,
          pageSize: 20,
          method: methodFilter || undefined,
          ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}),
        },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, methodFilter, sort.sortBy, sort.sortDir]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <FilterChip active={methodFilter === ''} onClick={() => { setMethodFilter(''); setPage(1); }}>{t('opt.acc.all_methods')}</FilterChip>
          {Object.entries(paymentMethodKey).map(([v, k]) => (
            <FilterChip key={v} active={methodFilter === v} onClick={() => { setMethodFilter(v); setPage(1); }}>{t(k)}</FilterChip>
          ))}
        </div>
      </div>

      <section className="xpl-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon="payments" tone="neutral" title={t('acc.empty.payments_title')} message={t('acc.empty.payments_message')} />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table">
                <thead>
                  <tr>
                    <SortableHeader label={t('col.acc.invoice_no')} title={t('col.acc.invoice_no')} state={sort.getState('invoice')} onToggle={() => sort.toggle('invoice')} />
                    <th>{t('col.inv.direction')}</th>
                    <SortableHeader label={fcMoneyHeader(t('col.amount'))} title={t('col.amount')} state={sort.getState('amount')} onToggle={() => sort.toggle('amount')} />
                    <SortableHeader label={t('col.acc.method')} title={t('col.acc.method')} state={sort.getState('method')} onToggle={() => sort.toggle('method')} />
                    <SortableHeader label={t('col.date')} title={t('col.date')} state={sort.getState('date')} onToggle={() => sort.toggle('date')} />
                    <SortableHeader label={t('col.acc.reference')} title={t('col.acc.reference')} state={sort.getState('reference')} onToggle={() => sort.toggle('reference')} />
                    {/* الملاحظات نص حر — غير قابلة للفرز */}
                    <th>{t('field.notes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td><span className="accx-code">{r.invoice?.invoiceNumber ?? '—'}</span></td>
                      <td>{r.invoice?.direction === 'SALES' ? t('opt.direction.sales') : r.invoice?.direction === 'PURCHASE' ? t('opt.direction.purchase') : '—'}</td>
                      <td><strong style={{ color: 'var(--xpl-green)' }}>{<MoneyCell value={r.amount} />}</strong></td>
                      <td>{t(paymentMethodKey[String(r.method)] ?? 'opt.payment.cash')}</td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.date)}</td>
                      <td className="xpl-mono">{r.reference ? String(r.reference) : '—'}</td>
                      <td>{r.notes ? String(r.notes) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </section>
    </>
  );
}
