import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import StatCard from '../components/StatCard';
import Modal from '../components/Modal';
import DataTable, { PageMeta } from '../components/DataTable';
import { money, dateText } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { usePersistedState } from '../hooks/usePersistedState';

type Tab = 'summary' | 'accounts' | 'journal' | 'payments';

const accountTypeKey: Record<string, string> = {
  ASSET: 'acc.type.asset', LIABILITY: 'acc.type.liability', EQUITY: 'acc.type.equity',
  REVENUE: 'acc.type.revenue', EXPENSE: 'acc.type.expense',
};
const normalBalanceKey: Record<string, string> = { DEBIT: 'acc.balance.debit', CREDIT: 'acc.balance.credit' };
const journalStatusKey: Record<string, [string, string]> = {
  POSTED: ['acc.journal.posted', 'green'], DRAFT: ['acc.journal.draft', 'amber'], CANCELLED: ['acc.journal.cancelled', 'gray'],
};
const paymentMethodKey: Record<string, string> = {
  CASH: 'opt.payment.cash', BANK: 'opt.payment.bank', CHEQUE: 'opt.payment.cheque', TRANSFER: 'opt.payment.transfer',
};

const inp: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
  background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, outline: 'none',
};

export default function Accounting() {
  const [tab, setTab] = usePersistedState<Tab>('acc:tab', 'summary');
  const { hasPermission } = useAuth();
  const { t } = useT();
  const canCreate = hasPermission('transactions.create');

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.accounting.title')}</h2><p>{t('page.accounting.subtitle')}</p></div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {([
          ['summary', '📊', 'tab.accounting.summary'],
          ['accounts', '🗂️', 'tab.accounting.accounts'],
          ['journal', '📒', 'tab.accounting.journal'],
          ['payments', '💳', 'tab.accounting.payments'],
        ] as [Tab, string, string][]).map(([key, icon, labelKey]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: tab === key ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === key ? '3px solid var(--primary)' : '3px solid transparent',
              marginBottom: -2, transition: 'all 0.15s',
            }}
          >
            {icon} {t(labelKey)}
          </button>
        ))}
      </div>

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pl, setPl] = useState<{ totalRevenue: number; totalExpense: number; netProfit: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, p] = await Promise.all([
          api.get('/accounting/summary'),
          api.get('/transactions/profit-loss'),
        ]);
        setSummary(s.data.data);
        setPl(p.data.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="center-msg"><div className="spinner" />{t('msg.loading')}</div>;

  return (
    <div>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        <StatCard label={t('stat.acc.total_revenue')} value={money(summary?.totalRevenue)} icon="📈" color="var(--green)" bg="var(--green-light)" />
        <StatCard label={t('stat.acc.total_collected')} value={money(summary?.totalCollected)} icon="✅" color="var(--green)" bg="var(--green-light)" />
        <StatCard label={t('stat.acc.total_expenses')} value={money(summary?.totalExpenses)} icon="📉" color="var(--red)" bg="var(--red-light)" />
        <StatCard label={t('stat.acc.net_profit')} value={money(summary?.netProfit)} icon="💰" color="var(--green)" bg="var(--green-light)" dir="up" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
        <div className="card panel">
          <h3>{t('section.acc.journal_summary')}</h3>
          <div className="ph-sub">{t('section.acc.journal_from')}</div>
          <table style={{ width: '100%', marginTop: 12 }}>
            <tbody>
              <tr><td style={{ padding: '6px 0', color: 'var(--text-muted)' }}>{t('col.acc.journal_count')}</td><td style={{ fontWeight: 700, textAlign: 'end' }}>{summary?.journalEntryCount ?? 0}</td></tr>
              <tr><td style={{ padding: '6px 0', color: 'var(--text-muted)' }}>{t('col.acc.total_debit_lbl')}</td><td style={{ fontWeight: 700, textAlign: 'end', color: 'var(--red)' }}>{money(summary?.totalJournalDebit)}</td></tr>
              <tr><td style={{ padding: '6px 0', color: 'var(--text-muted)' }}>{t('col.acc.total_credit_lbl')}</td><td style={{ fontWeight: 700, textAlign: 'end', color: 'var(--green)' }}>{money(summary?.totalJournalCredit)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card panel">
          <h3>{t('section.acc.pl')}</h3>
          <div className="ph-sub">{t('section.acc.pl_from')}</div>
          <table style={{ width: '100%', marginTop: 12 }}>
            <tbody>
              <tr><td style={{ padding: '6px 0', color: 'var(--text-muted)' }}>{t('col.acc.revenue_lbl')}</td><td style={{ fontWeight: 700, textAlign: 'end', color: 'var(--green)' }}>{money(pl?.totalRevenue)}</td></tr>
              <tr><td style={{ padding: '6px 0', color: 'var(--text-muted)' }}>{t('col.acc.expense_lbl')}</td><td style={{ fontWeight: 700, textAlign: 'end', color: 'var(--red)' }}>{money(pl?.totalExpense)}</td></tr>
              <tr><td style={{ padding: '6px 0', color: 'var(--text-muted)', fontWeight: 700 }}>{t('col.acc.net_profit_lbl')}</td><td style={{ fontWeight: 700, textAlign: 'end', color: (pl?.netProfit ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{money(pl?.netProfit)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Chart of Accounts Tab ───────────────────────────────────────────────────

function AccountsTab({ canCreate }: { canCreate: boolean }) {
  const { t } = useT();
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/accounting/accounts', {
        params: { page, pageSize: 20, search: search || undefined, type: typeFilter || undefined },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter]);
  useEffect(() => { load(); }, [load]);

  async function deleteAccount(id: number) {
    if (!confirm(t('confirm.delete_account'))) return;
    try { await api.delete(`/accounting/accounts/${id}`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'code', label: 'col.acc.code', render: (r: Record<string, unknown>) => <strong style={{ fontFamily: 'monospace' }}>{String(r.code)}</strong> },
    { key: 'name', label: 'col.acc.name', render: (r: Record<string, unknown>) => <strong>{String(r.name)}</strong> },
    { key: 'type', label: 'col.acc.type', render: (r: Record<string, unknown>) => <span className="pill blue">{t(accountTypeKey[String(r.type)] ?? 'acc.type.asset')}</span> },
    { key: 'normalBalance', label: 'col.acc.normal_balance', render: (r: Record<string, unknown>) => t(normalBalanceKey[String(r.normalBalance)] ?? 'acc.balance.debit') },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: 'parent', label: 'col.acc.parent', render: (r: any) => r.parent ? `${r.parent.code} - ${r.parent.name}` : '—' },
    { key: 'isActive', label: 'col.status', render: (r: Record<string, unknown>) => <span className={`pill ${r.isActive ? 'green' : 'gray'}`}>{r.isActive ? t('status.active') : t('status.suspended')}</span> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <input placeholder={t('ph.acc.search_account')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ ...inp, maxWidth: 240 }} />
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} style={{ ...inp }}>
          <option value="">{t('opt.acc.all_types')}</option>
          {Object.entries(accountTypeKey).map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
        </select>
        {canCreate && <button className="btn" style={{ marginInlineStart: 'auto' }} onClick={() => setCreating(true)}>{t('btn.acc.new_account')}</button>}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        actions={(row) => (
          <>
            <button className="btn sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>{' '}
            <button className="btn secondary sm" onClick={() => deleteAccount(row.id)}>{t('action.delete')}</button>
          </>
        )}
      />

      {creating && <AccountForm onClose={() => setCreating(false)} onSaved={load} />}
      {editing && <AccountForm account={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
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
    <Modal title={isEdit ? t('modal.acc.edit_account') : t('modal.acc.new_account')} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
        <button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field"><label>{t('field.acc.code')} *</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="1100" style={{ direction: 'ltr' }} /></div>
        <div className="field"><label>{t('field.acc.name')} *</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field">
          <label>{t('field.acc.type')}</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(accountTypeKey).map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>{t('field.acc.normal_balance')}</label>
          <select value={normalBalance} onChange={(e) => setNormalBalance(e.target.value)}>
            <option value="DEBIT">{t('acc.balance.debit')}</option>
            <option value="CREDIT">{t('acc.balance.credit')}</option>
          </select>
        </div>
        <div className="field">
          <label>{t('field.acc.active_status')}</label>
          <select value={String(isActive)} onChange={(e) => setIsActive(e.target.value === 'true')}>
            <option value="true">{t('status.active')}</option>
            <option value="false">{t('status.suspended')}</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>{t('field.notes')}</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

// ─── Journal Entries Tab ──────────────────────────────────────────────────────

function JournalTab({ canCreate }: { canCreate: boolean }) {
  const { t } = useT();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [expanded, setExpanded] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/accounting/journal', { params: { page, pageSize: 15, search: search || undefined } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search]);
  useEffect(() => { load(); }, [load]);

  async function cancelEntry(id: number) {
    if (!confirm(t('confirm.cancel_entry'))) return;
    try { await api.patch(`/accounting/journal/${id}/cancel`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'entryNumber', label: 'col.acc.entry_number', render: (r: Record<string, unknown>) => <strong style={{ fontFamily: 'monospace' }}>{String(r.entryNumber)}</strong> },
    { key: 'date', label: 'col.date', render: (r: Record<string, unknown>) => dateText(r.date) },
    { key: 'description', label: 'col.acc.description', render: (r: Record<string, unknown>) => String(r.description) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: 'total', label: 'col.acc.total_debit_lbl', render: (r: any) => money((r.lines ?? []).reduce((s: number, l: any) => s + l.debit, 0)) },
    { key: 'status', label: 'col.status', render: (r: Record<string, unknown>) => { const [k, c] = journalStatusKey[String(r.status)] ?? ['acc.journal.draft', 'gray']; return <span className={`pill ${c}`}>{t(k)}</span>; } },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input placeholder={t('ph.acc.search_journal')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ ...inp, maxWidth: 280 }} />
        {canCreate && <button className="btn" style={{ marginInlineStart: 'auto' }} onClick={() => setCreating(true)}>{t('btn.acc.new_entry')}</button>}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        actions={(row) => (
          <>
            <button className="btn sm" onClick={() => setExpanded(row)}>{t('action.view')}</button>{' '}
            {row.status === 'POSTED' && row.referenceType === 'MANUAL' && (
              <button className="btn secondary sm" onClick={() => cancelEntry(row.id)}>{t('action.cancel')}</button>
            )}
          </>
        )}
      />

      {creating && <JournalEntryForm onClose={() => setCreating(false)} onSaved={load} />}
      {expanded && <JournalEntryDetails entry={expanded} onClose={() => setExpanded(null)} />}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function JournalEntryDetails({ entry, onClose }: { entry: any; onClose: () => void }) {
  const { t } = useT();
  const totalDebit = (entry.lines ?? []).reduce((s: number, l: { debit: number }) => s + l.debit, 0);
  const totalCredit = (entry.lines ?? []).reduce((s: number, l: { credit: number }) => s + l.credit, 0);
  return (
    <Modal title={`${t('col.acc.entry_number')}: ${entry.entryNumber}`} onClose={onClose} footer={<button className="btn secondary" onClick={onClose}>{t('action.close')}</button>}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>{dateText(entry.date)} — {entry.description}</p>
      <div className="table-responsive">
        <table>
          <thead><tr><th>{t('col.acc.account')}</th><th>{t('col.acc.description')}</th><th>{t('col.acc.debit')}</th><th>{t('col.acc.credit')}</th></tr></thead>
          <tbody>
            {(entry.lines ?? []).map((l: { id: number; account?: { code: string; name: string }; description?: string; debit: number; credit: number }) => (
              <tr key={l.id}>
                <td>{l.account ? `${l.account.code} - ${l.account.name}` : '—'}</td>
                <td>{l.description ?? '—'}</td>
                <td style={{ color: 'var(--red)', fontWeight: 700 }}>{l.debit > 0 ? money(l.debit) : '—'}</td>
                <td style={{ color: 'var(--green)', fontWeight: 700 }}>{l.credit > 0 ? money(l.credit) : '—'}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
              <td colSpan={2}>{t('lbl.acc.total_debit')}</td>
              <td style={{ color: 'var(--red)' }}>{money(totalDebit)}</td>
              <td style={{ color: 'var(--green)' }}>{money(totalCredit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

interface JournalLine { accountId: string; description: string; debit: string; credit: string; }

function JournalEntryForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
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
    <Modal title={t('modal.acc.new_entry')} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving || !balanced}>{saving ? t('msg.saving') : t('btn.acc.post_entry')}</button>
        <button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field"><label>{t('field.acc.desc')} *</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="field"><label>{t('col.date')}</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{t('col.acc.account')}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{t('col.acc.desc_opt')}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{t('col.acc.debit')}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{t('col.acc.credit')}</span>
          <span />
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <select value={l.accountId} onChange={(e) => setLine(i, 'accountId', e.target.value)} style={{ ...inp, fontSize: 13 }}>
              <option value="">{t('msg.select_placeholder')}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </select>
            <input value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} style={{ ...inp, fontSize: 13 }} placeholder={t('ph.acc.line_desc')} />
            <input type="number" min="0" step="0.001" value={l.debit} onChange={(e) => setLine(i, 'debit', e.target.value)} style={{ ...inp, fontSize: 13, direction: 'ltr' }} placeholder="0" />
            <input type="number" min="0" step="0.001" value={l.credit} onChange={(e) => setLine(i, 'credit', e.target.value)} style={{ ...inp, fontSize: 13, direction: 'ltr' }} placeholder="0" />
            {lines.length > 2
              ? <button className="btn secondary sm" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>×</button>
              : <span />}
          </div>
        ))}
        <button className="btn secondary sm" style={{ marginTop: 4 }} onClick={() => setLines((p) => [...p, { accountId: '', description: '', debit: '', credit: '' }])}>{t('btn.acc.add_line')}</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 12, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('lbl.acc.total_debit')}: <strong style={{ color: 'var(--red)' }}>{money(totalDebit)}</strong></span>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('lbl.acc.total_credit')}: <strong style={{ color: 'var(--green)' }}>{money(totalCredit)}</strong></span>
        {!balanced && totalDebit + totalCredit > 0 && <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>⚠ {t('lbl.acc.unbalanced')}</span>}
        {balanced && totalDebit > 0 && <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>✓ {t('lbl.acc.balanced')}</span>}
      </div>
    </Modal>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/accounting/payments', {
        params: { page, pageSize: 20, method: methodFilter || undefined },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, methodFilter]);
  useEffect(() => { load(); }, [load]);

  const columns = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: 'invoice', label: 'col.acc.invoice_no', render: (r: any) => <strong style={{ fontFamily: 'monospace' }}>{r.invoice?.invoiceNumber ?? '—'}</strong> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: 'direction', label: 'col.inv.direction', render: (r: any) => r.invoice?.direction === 'SALES' ? t('opt.direction.sales') : r.invoice?.direction === 'PURCHASE' ? t('opt.direction.purchase') : '—' },
    { key: 'amount', label: 'col.amount', render: (r: Record<string, unknown>) => <strong style={{ color: 'var(--green)' }}>{money(r.amount)}</strong> },
    { key: 'method', label: 'col.acc.method', render: (r: Record<string, unknown>) => t(paymentMethodKey[String(r.method)] ?? 'opt.payment.cash') },
    { key: 'date', label: 'col.date', render: (r: Record<string, unknown>) => dateText(r.date) },
    { key: 'reference', label: 'col.acc.reference', render: (r: Record<string, unknown>) => r.reference ? String(r.reference) : '—' },
    { key: 'notes', label: 'field.notes', render: (r: Record<string, unknown>) => r.notes ? String(r.notes) : '—' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <select value={methodFilter} onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }} style={{ ...inp }}>
          <option value="">{t('opt.acc.all_methods')}</option>
          {Object.entries(paymentMethodKey).map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
        </select>
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} meta={meta} onPage={setPage} />
    </div>
  );
}
