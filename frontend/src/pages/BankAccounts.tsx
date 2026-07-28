import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/authStore';
import { listBankAccounts, type BankAccountSummary } from '../api/bankAccounts';
import { errorMessage } from '../api/client';
import PrivateAmount from '../components/PrivateAmount';
import { formatNumber } from '../lib/format';
import { formatDate } from '../lib/date';
import { useT } from '../lib/i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(v: number | null): string {
  if (v == null) return '—';
  return formatNumber(v);
}

function fmtDate(iso: string | null | undefined): string {
  return formatDate(iso);
}

function parseAccountKey(key: string): { bank: string; acct: string; type: string } {
  if (key.startsWith('IBAN:')) {
    return { type: 'IBAN', bank: '', acct: key.replace('IBAN:', '') };
  }
  if (key.startsWith('ACCT:')) {
    const parts = key.replace('ACCT:', '').split(':');
    return { type: 'ACCT', bank: parts[0] ?? '', acct: parts[1] ?? '' };
  }
  if (key.startsWith('BANK:')) {
    return { type: 'BANK', bank: key.replace('BANK:', ''), acct: '' };
  }
  return { type: 'OTHER', bank: key, acct: '' };
}

function flowBadgeClass(net: number): string {
  if (net > 0)  return 'bac-badge green';
  if (net < 0)  return 'bac-badge red';
  return 'bac-badge neutral';
}

// ── AccountCard ───────────────────────────────────────────────────────────────

function AccountCard({
  account,
  onClick,
}: {
  account: BankAccountSummary;
  onClick: () => void;
}) {
  const { t }   = useT();
  const parsed  = parseAccountKey(account.accountKey);
  const net     = (account.totalCredits ?? 0) - (account.totalDebits ?? 0);
  const hasData = account.transactionCount > 0;

  return (
    <div className="bac-card" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <div className="bac-card-header">
        <div className="bac-bank-icon">
          <span className="material-symbols-outlined">account_balance</span>
        </div>
        <div className="bac-card-title">
          <h3>{account.bankName}</h3>
          {account.iban && <span className="bac-iban">{account.iban}</span>}
          {!account.iban && account.accountNumber && (
            <span className="bac-iban">{account.accountNumber}</span>
          )}
          {!account.iban && !account.accountNumber && parsed.type !== 'BANK' && (
            <span className="bac-iban bac-iban-dim">{account.accountKey}</span>
          )}
        </div>
        <span className="bac-arrow material-symbols-outlined">chevron_left</span>
      </div>

      <div className="bac-balance-row">
        <span className="bac-balance-label">{t('bank.accounts.current_balance')}</span>
        <span className="bac-balance-value">
          <PrivateAmount
            value={account.currentBalance ?? 0}
          />
        </span>
      </div>

      <div className="bac-stats-row">
        <div className="bac-stat">
          <span className="bac-stat-label">{t('bank.accounts.deposits')}</span>
          <span className="bac-stat-value green">
            {hasData ? fmtAmount(account.totalCredits) : '—'}
          </span>
        </div>
        <div className="bac-stat">
          <span className="bac-stat-label">{t('bank.accounts.withdrawals')}</span>
          <span className="bac-stat-value red">
            {hasData ? fmtAmount(account.totalDebits) : '—'}
          </span>
        </div>
        <div className="bac-stat">
          <span className="bac-stat-label">{t('bank.accounts.net_flow')}</span>
          <span className={flowBadgeClass(net)}>
            {hasData ? fmtAmount(net) : '—'}
          </span>
        </div>
      </div>

      <div className="bac-footer">
        <span className="bac-footer-item">
          <span className="material-symbols-outlined bac-footer-icon">swap_horiz</span>
          {t('bank.accounts.transaction_count', { count: account.transactionCount.toLocaleString() })}
        </span>
        <span className="bac-footer-item">
          <span className="material-symbols-outlined bac-footer-icon">upload_file</span>
          {t('bank.recon.batch_count', { count: account.importCount })}
        </span>
        {account.firstTransactionDate && (
          <span className="bac-footer-item">
            <span className="material-symbols-outlined bac-footer-icon">calendar_today</span>
            {fmtDate(account.firstTransactionDate)} — {fmtDate(account.lastTransactionDate)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── BankAccounts page ─────────────────────────────────────────────────────────

export default function BankAccounts() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const navigate          = useNavigate();

  const [accounts, setAccounts] = useState<BankAccountSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');

  const canView = hasPermission('bankStatementImport.read');

  // `t` from useT() is a new reference every render (unmemoized) — closing over it
  // directly here would recreate `load` every render and infinitely re-fire the
  // fetch effect below. A ref hands the callback the latest translator without
  // making it a reactive dependency.
  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(() => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    listBankAccounts()
      .then((r) => setAccounts(r.accounts))
      .catch((e) => setError(errorMessage(e) || tRef.current('bank.accounts.load_failed')))
      .finally(() => setLoading(false));
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  const filtered = accounts.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.bankName.toLowerCase().includes(q) ||
      (a.iban?.toLowerCase().includes(q) ?? false) ||
      (a.accountNumber?.toLowerCase().includes(q) ?? false) ||
      a.accountKey.toLowerCase().includes(q)
    );
  });

  if (!canView) {
    return (
      <div className="page-error">
        <span className="material-symbols-outlined bac-lock-icon">lock</span>
        <p>{t('bank.accounts.no_permission')}</p>
      </div>
    );
  }

  return (
    <div className="bac-root">
      {/* ── Header ── */}
      <div className="bac-header">
        <div className="bac-header-text">
          <h1 className="bac-title">
            <span className="material-symbols-outlined bac-title-icon">account_balance</span>
            {t('nav.bank_reconciliation')}
          </h1>
          <p className="bac-subtitle">
            {loading ? t('msg.loading') : t('bank.accounts.subtitle', { count: accounts.length })}
          </p>
        </div>
        <div className="bac-header-actions">
          <button type="button" className="btn secondary" onClick={() => navigate('/bank-statement-import')}>
            <span className="material-symbols-outlined">upload_file</span>
            {t('bank.accounts.add_statement_short')}
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      {accounts.length > 1 && (
        <div className="bac-search-bar">
          <span className="material-symbols-outlined bac-search-icon">search</span>
          <input
            className="bac-search-input"
            type="text"
            placeholder={t('bank.accounts.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="bac-search-clear" onClick={() => setSearch('')}>
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>
      )}

      {/* ── States ── */}
      {loading && (
        <div className="bac-loading">
          <span className="spinner" />
          <span>{t('bank.accounts.loading_accounts')}</span>
        </div>
      )}

      {!loading && error && (
        <div className="bac-error">
          <span className="material-symbols-outlined">error_outline</span>
          <span>{error}</span>
          <button type="button" className="btn secondary" onClick={load}>{t('page.dashboard.retry')}</button>
        </div>
      )}

      {!loading && !error && accounts.length === 0 && (
        <div className="bac-empty">
          <div className="bac-empty-illus">
            <span className="material-symbols-outlined">account_balance</span>
          </div>
          <h3>{t('bank.accounts.empty_title')}</h3>
          <p>{t('bank.accounts.empty_sub')}</p>
          <button type="button" className="btn" onClick={() => navigate('/bank-statement-import')}>
            <span className="material-symbols-outlined">upload_file</span>
            {t('bank.recon.add_statement')}
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && accounts.length > 0 && (
        <div className="bac-empty">
          <div className="bac-empty-illus">
            <span className="material-symbols-outlined">search_off</span>
          </div>
          <h3>{t('bank.accounts.no_results_title')}</h3>
          <p>{t('bank.accounts.no_results_sub', { search })}</p>
          <button type="button" className="btn secondary" onClick={() => setSearch('')}>
            <span className="material-symbols-outlined">close</span>
            {t('bank.accounts.clear_search')}
          </button>
        </div>
      )}

      {/* ── Cards grid ── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="bac-grid">
          {filtered.map((account) => (
            <AccountCard
              key={account.accountKey}
              account={account}
              onClick={() => navigate(`/bank-accounts/${encodeURIComponent(account.accountKey)}`)}
            />
          ))}
        </div>
      )}

      {/* ── Inline CSS ── */}
      <style>{`
        .bac-root {
          padding: 28px 32px;
          max-width: 1400px;
          margin: 0 auto;
          font-family: var(--app-font-ui);
        }
        .bac-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .bac-header-text { flex: 1; }
        .bac-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 22px;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 6px;
        }
        .bac-title-icon { color: var(--primary); font-size: 24px !important; }
        .bac-subtitle { font-size: 14px; color: var(--muted); margin: 0; }
        .bac-header-actions { display: flex; gap: 10px; align-items: center; }

        .bac-search-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0 14px;
          margin-bottom: 24px;
          height: 44px;
        }
        .bac-search-icon { color: var(--muted); font-size: 18px !important; }
        .bac-search-input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          font-family: inherit;
          font-size: 14px;
          color: var(--text);
          direction: rtl;
        }
        .bac-search-clear {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--muted);
          display: flex;
          align-items: center;
          padding: 0;
        }
        .bac-search-clear:hover { color: var(--text); }
        .bac-search-clear .material-symbols-outlined { font-size: 18px !important; }

        .bac-loading, .bac-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 60px 0;
          color: var(--muted);
          font-size: 14px;
        }
        .bac-error { color: var(--red, #ef4444); }
        .bac-error .material-symbols-outlined { font-size: 40px !important; }

        .bac-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 80px 0;
          color: var(--muted);
          text-align: center;
        }
        .bac-empty-illus {
          width: 72px;
          height: 72px;
          border-radius: 20px;
          background: var(--primary-faint, rgba(99,102,241,.10));
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }
        .bac-empty-illus .material-symbols-outlined {
          font-size: 34px !important;
          color: var(--primary);
          opacity: .75;
        }
        .bac-empty h3 { font-size: 18px; color: var(--text); margin: 0; }
        .bac-empty p  { font-size: 14px; margin: 0; max-width: 340px; line-height: 1.6; }

        .bac-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 20px;
        }

        .bac-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px 22px;
          cursor: pointer;
          transition: box-shadow .15s, border-color .15s, transform .1s;
          outline: none;
        }
        .bac-card:hover {
          box-shadow: 0 6px 24px rgba(0,0,0,.10);
          border-color: var(--primary);
          transform: translateY(-2px);
        }
        .bac-card:focus-visible {
          box-shadow: 0 0 0 3px var(--primary-faint, rgba(99,102,241,.25));
          border-color: var(--primary);
        }

        .bac-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .bac-bank-icon {
          width: 40px; height: 40px;
          border-radius: 10px;
          background: var(--primary-faint, rgba(99,102,241,.12));
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .bac-bank-icon .material-symbols-outlined {
          color: var(--primary);
          font-size: 22px !important;
        }
        .bac-card-title {
          flex: 1;
          min-width: 0;
        }
        .bac-card-title h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bac-iban {
          display: block;
          font-size: 11px;
          color: var(--muted);
          margin-top: 2px;
          font-family: var(--app-font-mono);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bac-iban-dim { opacity: .6; }
        .bac-arrow {
          color: var(--muted);
          font-size: 20px !important;
          flex-shrink: 0;
        }

        .bac-balance-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg, var(--surface2, #f8f9fb));
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 14px;
        }
        .bac-balance-label { font-size: 12px; color: var(--muted); }
        .bac-balance-value { font-size: 17px; font-weight: 700; color: var(--text); }

        .bac-stats-row {
          display: flex;
          gap: 10px;
          margin-bottom: 14px;
        }
        .bac-stat {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
          align-items: center;
          background: var(--bg, var(--surface2, #f8f9fb));
          border-radius: 8px;
          padding: 8px 10px;
        }
        .bac-stat-label { font-size: 11px; color: var(--muted); }
        .bac-stat-value { font-size: 13px; font-weight: 600; color: var(--text); }
        .bac-stat-value.green { color: var(--green, #10b981); }
        .bac-stat-value.red   { color: var(--red, #ef4444); }

        .bac-badge {
          font-size: 13px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 6px;
        }
        .bac-badge.green   { color: var(--green, #10b981); background: rgba(16,185,129,.08); }
        .bac-badge.red     { color: var(--red, #ef4444);   background: rgba(239,68,68,.08); }
        .bac-badge.neutral { color: var(--muted); }

        .bac-footer {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          border-top: 1px solid var(--border);
          padding-top: 12px;
        }
        .bac-footer-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--muted);
        }
        .bac-footer-icon { font-size: 13px !important; }

        .bac-lock-icon { font-size: 48px !important; color: var(--muted); }

        .page-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 100px 0;
          color: var(--muted);
          font-size: 14px;
          font-family: "IBM Plex Sans Arabic","Cairo",Arial,sans-serif;
        }
      `}</style>
    </div>
  );
}
