import {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { useAuth } from '../stores/authStore';
import { errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import PrivateAmount from '../components/PrivateAmount';
import ErrorBoundary from '../components/ErrorBoundary';
import { useFocusTrap, Pagination } from '../components/explorer/ExplorerKit';
import {
  getTimeline, listImports,
  type TimelineTransaction, type TimelineResult, type ImportListItem,
  type TimelineFilterType, type TimelineFilters,
} from '../api/bankStatementImport';
import {
  getBankAccountDashboard,
  type BankAccountDashboard, type MonthlyEntry,
} from '../api/bankAccounts';
import {
  quickRangeToDates, QUICK_RANGE_LABELS, TYPE_LABELS, timelineTotalLabel, safeAmount, safeNum,
  type QuickRange,
} from './bankTimelineFilters';
import {
  presentTransaction, CONFIDENCE_LABELS,
  type PresentationConfidence,
} from './bankTransactionPresentation';
import {
  buildTransactionIntelligence, channelLabel,
} from './bankTransactionIntelligence';
import { formatCurrency, formatNumber } from '../lib/format';
import { formatDate, formatMonthLabel } from '../lib/date';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import './BankAccountExplorer.css';
import { moneyParts, MoneyText, money } from '../config/modules';
import { fcMoneyHeader } from '../components/financial/financialLabels';
import { useT } from '../lib/i18n';

// ── Constants (mirrors BankReconciliation patterns) ────────────────────────────

// Local translate-fn type (mirrors bankTransactionPresentation's `TranslateFn`) —
// lets module-level helpers (outside the React tree) accept the caller's `t()`.
type TranslateFn = (key: string) => string;

const CAT_LABELS: Record<string, string> = {
  BANK_TRANSFER:   'تحويل بنكي',
  CHEQUE_PAYMENT:  'شيك',
  CASH_WITHDRAWAL: 'سحب نقدي',
  TRANSFER_FEE:    'عمولة تحويل',
  MONTHLY_FEE:     'رسوم شهرية',
  INTEREST:        'فوائد',
  CHARGE:          'رسوم بنكية',
  ATM_FEE:         'رسوم ATM',
  CHEQUEBOOK_FEE:  'رسوم دفتر شيكات',
  OTHER_FEE:       'رسوم أخرى',
};

// Maps each CAT_LABELS code to its i18n key. Used only when a `translate`
// callback is supplied (e.g. CSV export triggered from within a component);
// falls back to the Arabic literal above when omitted.
const CAT_LABEL_KEYS: Record<string, string> = {
  BANK_TRANSFER:   'opt.sal.payment.bank_transfer', // reused: DICT.ar exact match 'تحويل بنكي'
  CHEQUE_PAYMENT:  'opt.payment.cheque',            // reused: DICT.ar exact match 'شيك'
  CASH_WITHDRAWAL: 'bank.explorer.cat.cash_withdrawal',
  TRANSFER_FEE:    'bank.explorer.cat.transfer_fee',
  MONTHLY_FEE:     'bank.explorer.cat.monthly_fee',
  INTEREST:        'bank.explorer.cat.interest',
  CHARGE:          'bank.explorer.cat.bank_charge',
  ATM_FEE:         'bank.explorer.cat.atm_fee',
  CHEQUEBOOK_FEE:  'bank.explorer.cat.chequebook_fee',
  OTHER_FEE:       'bank.explorer.cat.other_fee',
};

// Confidence level → i18n key. `CONFIDENCE_LABELS` (bankTransactionPresentation.ts)
// is pinned Arabic-only by an existing test, so this page maps to its own,
// already-registered keys instead ('opt.maint.sev_high/_medium/_low' — verified
// exact byte-match for the same three Arabic words).
const CONFIDENCE_KEYS: Record<PresentationConfidence, string> = {
  high:   'opt.maint.sev_high',
  medium: 'opt.maint.sev_medium',
  low:    'opt.maint.sev_low',
};

function confidenceLabel(level: PresentationConfidence, translate?: TranslateFn): string {
  return trFallback(CONFIDENCE_KEYS[level], CONFIDENCE_LABELS[level], translate);
}

function catLabel(code: string, translate?: TranslateFn): string {
  const fallback = CAT_LABELS[code] ?? code;
  const key = CAT_LABEL_KEYS[code];
  return translate && key ? translate(key) : fallback;
}

// Translate-with-fallback: identical pattern to bankTransactionPresentation's
// `tr()` — when `translate` is omitted, returns the original Arabic literal
// unchanged (module-level helpers here run outside the React tree, so a
// caller-supplied `t()` is threaded through explicitly rather than via hook).
function trFallback(key: string, fallback: string, translate?: TranslateFn): string {
  return translate ? translate(key) : fallback;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(v: number | null | undefined): string {
  if (v == null) return '—';
  return formatNumber(v);
}

/**
 * قيمة بطاقة مالية: الرقم و**رمز العملة الذي يختاره الإعداد** (KWD / د.ك) — لا رمزًا
 * مثبَّتًا في الشيفرة. القيمة غير المنطبقة تعرض «—» **بلا وحدة**: «— KWD» بلا معنى.
 */
function amountCard(v: number | null | undefined): { value: string; unit?: string } {
  if (v == null) return { value: '—' };
  const parts = moneyParts(v);
  return { value: parts.number, unit: parts.currency };
}

// Canonical DD/MM/YYYY (English digits) via the shared formatter.
function fmtDate(iso: string | null | undefined): string {
  return formatDate(iso);
}

function fmtMonth(ym: string): string {
  // 'ar-KW' كان يُخرج سنة بأرقام عربية شرقية (٢٠٢٦). المعيار المعتمد: أرقام غربية
  // دائمًا. `formatMonthLabel` يقرأ 'YYYY-MM' نصًّا — بلا Date وبلا منطقة زمنية.
  return formatMonthLabel(ym);
}

function exportTimelineCsv(
  transactions: TimelineTransaction[],
  bankName: string,
  accountKey: string,
  translate?: TranslateFn,
): void {
  const headers = [
    trFallback('col.date', 'التاريخ', translate),
    trFallback('col.description', 'الوصف', translate),
    trFallback('col.acc.reference', 'المرجع', translate),
    trFallback('col.acc.debit', 'مدين', translate),
    trFallback('col.acc.credit', 'دائن', translate),
    trFallback('bank.explorer.col_balance', 'الرصيد', translate),
    trFallback('col.type', 'النوع', translate),
    trFallback('bank.explorer.col_batch', 'الدفعة', translate),
  ];
  const rows = transactions.map((t) => [
    t.statementDate ?? '',
    `"${t.description.replace(/"/g, '""')}"`,
    t.reference ?? '',
    t.debit  > 0 ? t.debit.toFixed(3)  : '',
    t.credit > 0 ? t.credit.toFixed(3) : '',
    t.balance != null ? t.balance.toFixed(3) : '',
    t.bankFeeType ? catLabel(t.bankFeeType, translate) : '',
    `"${t.importBatchLabel.replace(/"/g, '""')}"`,
  ]);
  const csv  = '﻿' + [headers, ...rows].map((r) => r.join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const slug = bankName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = generateExportFileName({ reportName: ReportName.BankAccountLedger, identifier: slug, extension: 'csv' });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ── Transaction type badge ────────────────────────────────────────────────────

type TxBadgeKind = 'deposit' | 'withdrawal' | 'fee' | 'cheque' | 'transfer';

interface TxBadge { kind: TxBadgeKind; label: string; }

// Derive a semantic transaction-type badge from the already-available flags.
// Display-only — no reconciliation/accounting logic.
function txTypeBadge(t: TimelineTransaction, translate?: TranslateFn): TxBadge {
  if (t.bankFeeType === 'BANK_TRANSFER') {
    return { kind: 'transfer', label: trFallback('opt.payment.transfer', 'تحويل', translate) };
  }
  if (t.chequeNumber || t.bankFeeType === 'CHEQUE_PAYMENT') {
    return { kind: 'cheque', label: trFallback('opt.payment.cheque', 'شيك', translate) };
  }
  if (t.isBankFee) return { kind: 'fee', label: trFallback('bank.explorer.badge_fee', 'رسوم', translate) };
  if (safeNum(t.credit) > 0) return { kind: 'deposit', label: trFallback('bank.explorer.badge_deposit', 'إيداع', translate) };
  return { kind: 'withdrawal', label: trFallback('bank.explorer.badge_withdrawal', 'سحب', translate) };
}

// Semantic icon per transaction kind (display-only).
const TX_ICONS: Record<TxBadgeKind, string> = {
  deposit:    'south_west',
  withdrawal: 'north_east',
  fee:        'percent',
  cheque:     'description',
  transfer:   'swap_horiz',
};

// ── Copy-to-clipboard button (with transient confirmation) ─────────────────────

function CopyButton({
  value, label, className,
}: {
  value:      string;
  label:      string;
  className?: string;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onCopy = useCallback(() => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    }).catch(() => { /* clipboard unavailable — silent, non-critical */ });
  }, [value]);

  return (
    <button type="button" className={`btn secondary bae-copy-btn${className ? ` ${className}` : ''}`} onClick={onCopy}>
      <span className="material-symbols-outlined">{copied ? 'check' : 'content_copy'}</span>
      {copied ? t('bank.explorer.copied') : label}
    </button>
  );
}

// ── Collapsible long description (banking-app style) ───────────────────────────

function CollapsibleDescription({ text }: { text: string }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 90;
  return (
    <div className="bae-collapsible-desc">
      <span className={expanded || !isLong ? '' : 'bae-desc-clamp'}>{text}</span>
      {isLong && (
        <button type="button" className="bae-desc-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? t('bank.explorer.show_less') : t('bank.explorer.show_more')}
        </button>
      )}
    </div>
  );
}

// ── Recharts tooltip (same pattern as BankReconciliation) ─────────────────────

interface ChartEntry { name?: string; value?: number; fill?: string; }

function ChartTooltip({ active, payload }: { active?: boolean; payload?: readonly unknown[] }) {
  if (!active || !payload?.length) return null;
  const p = (payload as readonly ChartEntry[])[0];
  return (
    <div className="bae-chart-tooltip">
      <p style={{ color: p.fill ?? 'var(--text)' }}>
        {p.name}: {typeof p.value === 'number'
          ? money(p.value)
          : p.value}
      </p>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, unit, icon, colorVariant, sub,
}: {
  label:         string;
  value:         string;
  unit?:         string;
  icon:          string;
  colorVariant?: 'green' | 'red' | 'blue' | 'orange' | 'indigo';
  sub?:          string;
}) {
  const cls = [
    'bae-kpi-card',
    colorVariant ? `bae-kpi-card--${colorVariant}` : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="bae-kpi-head">
        <span className="bae-kpi-label">{label}</span>
        <span className="bae-kpi-icon">
          <span className="material-symbols-outlined">{icon}</span>
        </span>
      </div>
      <span className="bae-kpi-value">
        {value}{unit && <span className="bae-kpi-unit">{unit}</span>}
      </span>
      {sub && <span className="bae-kpi-sub">{sub}</span>}
    </div>
  );
}

// ── Account Health Card ───────────────────────────────────────────────────────

function AccountHealthCard({ dashboard }: { dashboard: BankAccountDashboard }) {
  const { t } = useT();
  const monthCount = useMemo(() => {
    if (!dashboard.coverageStart || !dashboard.coverageEnd) return 0;
    const s = new Date(dashboard.coverageStart);
    const e = new Date(dashboard.coverageEnd);
    return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  }, [dashboard.coverageStart, dashboard.coverageEnd]);

  const daysSinceLast = useMemo(() => {
    if (!dashboard.coverageEnd) return null;
    return Math.floor((Date.now() - new Date(dashboard.coverageEnd).getTime()) / 86_400_000);
  }, [dashboard.coverageEnd]);

  const freshnessClass =
    daysSinceLast == null ? '' :
    daysSinceLast < 30   ? 'good' :
    daysSinceLast < 90   ? 'warn' : 'bad';

  const freshnessLabel =
    daysSinceLast == null ? '—' :
    daysSinceLast < 7    ? t('bank.explorer.freshness_updated') :
    daysSinceLast < 30   ? t('bank.explorer.freshness_days', { days: daysSinceLast }) :
    t('bank.explorer.freshness_months', { months: Math.floor(daysSinceLast / 30) });

  const avgMonthlyTx = monthCount > 0
    ? Math.round(dashboard.transactionCount / monthCount)
    : dashboard.transactionCount;

  return (
    <div className="bae-health-card">
      <h4 className="bae-health-title">
        <span className="material-symbols-outlined">monitor_heart</span>
        {t('bank.explorer.health_title')}
      </h4>
      <div className="bae-health-grid">
        <div className="bae-health-item">
          <span className="bae-health-label">{t('bank.explorer.coverage_span')}</span>
          <span className="bae-health-value">{monthCount > 0 ? t('bank.explorer.months_count', { months: monthCount }) : '—'}</span>
        </div>
        <div className="bae-health-item">
          <span className="bae-health-label">{t('bank.explorer.import_batches')}</span>
          <span className="bae-health-value">{dashboard.importCount}</span>
        </div>
        <div className="bae-health-item">
          <span className="bae-health-label">{t('bank.explorer.avg_tx_per_month')}</span>
          <span className="bae-health-value">{avgMonthlyTx.toLocaleString()}</span>
        </div>
        <div className="bae-health-item">
          <span className="bae-health-label">{t('bank.explorer.deposit_count')}</span>
          <span className="bae-health-value good">{dashboard.depositCount.toLocaleString()}</span>
        </div>
        <div className="bae-health-item">
          <span className="bae-health-label">{t('bank.explorer.withdrawal_count')}</span>
          <span className="bae-health-value">{dashboard.withdrawalCount.toLocaleString()}</span>
        </div>
        <div className="bae-health-item">
          <span className="bae-health-label">{t('bank.explorer.data_freshness')}</span>
          <span className={`bae-health-value ${freshnessClass}`}>{freshnessLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ── Executive Header ──────────────────────────────────────────────────────────

// Derive a labelled account identifier from the stable accountKey. The dashboard
// API returns no separate IBAN / account number, so we surface only what the key
// encodes (IBAN / ACCT / BANK) under the correct label — never inventing data.
function accountIdInfo(accountKey: string, translate?: TranslateFn): { label: string; value: string } | null {
  if (accountKey.startsWith('IBAN:')) return { label: 'IBAN', value: accountKey.slice(5) };
  if (accountKey.startsWith('ACCT:')) {
    return {
      label: trFallback('bank.explorer.account_number', 'رقم الحساب', translate),
      value: accountKey.slice(5).replace(/:/g, ' · '),
    };
  }
  if (accountKey.startsWith('BANK:')) {
    return { label: trFallback('col.acc.account', 'الحساب', translate), value: accountKey.slice(5) };
  }
  return accountKey ? { label: trFallback('col.acc.account', 'الحساب', translate), value: accountKey } : null;
}

function ExecutiveHeader({
  dashboard,
  accountKey,
  onBack,
  onAddStatement,
}: {
  dashboard:      BankAccountDashboard;
  accountKey:     string;
  onBack:         () => void;
  onAddStatement: () => void;
}) {
  const { t } = useT();
  const d = dashboard;
  const idInfo = accountIdInfo(accountKey, t);

  return (
    <div className="bae-exec-header">
      <button type="button" className="bae-back-btn" onClick={onBack} aria-label={t('btn.inv.back')}>
        <span className="material-symbols-outlined">arrow_forward_ios</span>
      </button>

      {/* Bank logo */}
      <div className="bae-bank-logo" aria-hidden="true">
        <span className="material-symbols-outlined">account_balance</span>
      </div>

      {/* Identity + meta strip */}
      <div className="bae-exec-main">
        <h1 className="bae-exec-name">{d.bankName || accountKey}</h1>

        <div className="bae-exec-meta-strip">
          {idInfo && (
            <div className="bae-exec-meta-cell">
              <span className="bae-exec-meta-k">{idInfo.label}</span>
              <span className="bae-exec-meta-v-row">
                <span className="bae-exec-meta-v mono">{idInfo.value}</span>
                <CopyButton value={idInfo.value} label="" className="bae-copy-mini" />
              </span>
            </div>
          )}
          <div className="bae-exec-meta-cell">
            <span className="bae-exec-meta-k">{t('field.cheque.currency')}</span>
            <span className="bae-exec-meta-v">KWD</span>
          </div>
          <div className="bae-exec-meta-cell">
            <span className="bae-exec-meta-k">{t('field.status')}</span>
            <span className="bae-exec-status">
              <span className="bae-status-dot" />
              {t('status.active')}
            </span>
          </div>
          {d.coverageEnd && (
            <div className="bae-exec-meta-cell">
              <span className="bae-exec-meta-k">{t('bank.explorer.last_import')}</span>
              <span className="bae-exec-meta-v">{fmtDate(d.coverageEnd)}</span>
            </div>
          )}
          <div className="bae-exec-meta-cell">
            <span className="bae-exec-meta-k">{t('bank.explorer.statement_count')}</span>
            <span className="bae-exec-meta-v">{d.importCount.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bae-exec-actions">
        <button type="button" className="btn bae-exec-add" onClick={onAddStatement}>
          <span className="material-symbols-outlined">upload_file</span>
          {t('bank.explorer.add_statement')}
        </button>
      </div>
    </div>
  );
}

// ── KPI Row (executive metrics) ───────────────────────────────────────────────

// Current Balance is the dominant KPI (Phase E); the rest are secondary.
// The dashboard API exposes no fee aggregate, so "total transactions" is shown
// instead of fees (no API change, no fabricated data).
function KpiRow({ dashboard }: { dashboard: BankAccountDashboard }) {
  const { t } = useT();
  const d = dashboard;
  const netVariant: 'green' | 'red' = safeNum(d.netCashFlow) >= 0 ? 'green' : 'red';
  return (
    <div className="bae-kpi-exec">
      {/* Dominant: compact premium balance card */}
      <div className="bae-balance-hero">
        <div className="bae-balance-hero-icon">
          <span className="material-symbols-outlined">account_balance_wallet</span>
        </div>
        <div className="bae-balance-hero-body">
          <span className="bae-balance-hero-label">{t('bank.explorer.current_balance')}</span>
          <div className="bae-balance-hero-value">
            <PrivateAmount value={d.currentBalance ?? 0} />
          </div>
          <span className={`bae-balance-hero-pill bae-balance-hero-pill--${netVariant}`}>
            <span className="material-symbols-outlined">
              {netVariant === 'green' ? 'trending_up' : 'trending_down'}
            </span>
            {safeNum(d.netCashFlow) >= 0 ? '+' : ''}{<MoneyText value={d.netCashFlow} />} · {t('bank.explorer.net_flow')}
          </span>
        </div>
      </div>

      {/* Movement + activity metrics — stat tiles */}
      <div className="bae-kpi-grid bae-kpi-grid--secondary">
        <KpiCard
          label={t('bank.explorer.total_deposits')}
          {...amountCard(d.totalDeposits)}
          icon="south_west"
          colorVariant="green"
          sub={t('bank.explorer.tx_count_suffix', { count: d.depositCount.toLocaleString() })}
        />
        <KpiCard
          label={t('bank.explorer.total_withdrawals')}
          {...amountCard(d.totalWithdrawals)}
          icon="north_east"
          colorVariant="red"
          sub={t('bank.explorer.tx_count_suffix', { count: d.withdrawalCount.toLocaleString() })}
        />
        <KpiCard
          label={t('bank.explorer.net_movement')}
          {...amountCard(d.netCashFlow)}
          icon="insights"
          colorVariant={netVariant}
          sub={t('bank.explorer.net_cash_flow')}
        />
        <KpiCard
          label={t('bank.explorer.tx_count')}
          value={d.transactionCount.toLocaleString()}
          icon="receipt_long"
          colorVariant="indigo"
          sub={t('bank.explorer.tx_unit')}
        />
        <KpiCard
          label={t('bank.explorer.statement_count')}
          value={d.importCount.toLocaleString()}
          icon="description"
          colorVariant="orange"
          sub={t('bank.explorer.statements_imported')}
        />
      </div>
    </div>
  );
}

// ── Transaction Drawer ────────────────────────────────────────────────────────

const RECONCILE_LABELS: Record<string, string> = {
  UNMATCHED: 'غير مطابقة',
  MATCHED:   'مطابقة',
  IGNORED:   'متجاهلة',
  DUPLICATE: 'مكررة',
  REVIEW:    'قيد المراجعة',
};

// i18n keys for the reconcile-status labels above (new — not yet in DICT).
const RECONCILE_LABEL_KEYS: Record<string, string> = {
  UNMATCHED: 'bank.explorer.reconcile_unmatched',
  MATCHED:   'bank.explorer.reconcile_matched',
  IGNORED:   'bank.explorer.reconcile_ignored',
  DUPLICATE: 'bank.explorer.reconcile_duplicate',
  REVIEW:    'bank.explorer.reconcile_review',
};

function reconcileLabel(status: string, translate?: TranslateFn): string {
  const fallback = RECONCILE_LABELS[status] ?? status;
  const key = RECONCILE_LABEL_KEYS[status];
  return translate && key ? translate(key) : fallback;
}

const DRAWER_TITLE_ID = 'bae-drawer-title';

// Information-Hub tabs (Phase v2). Each surfaces only the data that exists on the
// transaction — unavailable fields are hidden, never faked (graceful degradation).
type DrawerTab = 'basic' | 'financial' | 'import' | 'audit' | 'attachments';

// `labelKey` is reused (report.group.financial / perm.module.import) where an
// exact DICT.ar match exists; otherwise a new bank.explorer.tab_* key.
const DRAWER_TABS: { key: DrawerTab; labelKey: string; icon: string }[] = [
  { key: 'basic',       labelKey: 'bank.explorer.tab_basic', icon: 'article' },
  { key: 'financial',   labelKey: 'report.group.financial',  icon: 'account_balance' },
  { key: 'import',      labelKey: 'perm.module.import',      icon: 'upload_file' },
  { key: 'audit',       labelKey: 'bank.explorer.tab_audit', icon: 'verified' },
  { key: 'attachments', labelKey: 'bank.explorer.tab_attachments', icon: 'attach_file' },
];

function TransactionDrawer({
  tx,
  onClose,
}: {
  tx:      TimelineTransaction;
  onClose: () => void;
}) {
  // Escape-to-close, focus-into-drawer on open, focus-return on close, scroll lock,
  // and a Tab focus trap that keeps keyboard focus inside the dialog (Phase E a11y) —
  // shared with ExplorerKit's Drawer/Dialog rather than a separate copy, so a future
  // a11y fix to the trap applies here too.
  const { t } = useT();
  const panelRef = useFocusTrap(onClose);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('basic');

  const badge      = txTypeBadge(tx, t);
  const isIncoming = safeNum(tx.credit) > 0;
  const heroAmount = isIncoming ? safeNum(tx.credit) : safeNum(tx.debit);
  const reconcileClass = tx.reconcileStatus === 'MATCHED' ? 'good'
    : tx.reconcileStatus === 'UNMATCHED' ? 'warn' : 'neutral';

  // ── Financial derivations (display-only, no accounting logic) ──
  const debit   = safeNum(tx.debit);
  const credit  = safeNum(tx.credit);
  const impact  = credit - debit;                         // signed net effect
  const hasBalance    = tx.balance != null;
  const afterBalance  = safeNum(tx.balance);
  // Reverse the movement to recover the pre-transaction balance.
  const beforeBalance = afterBalance - credit + debit;
  const impactClass   = impact >= 0 ? 'bae-credit' : 'bae-debit';

  // Smart presentation (display-only): structured category + safe detail, plus
  // provenance for the Audit tab.
  const pres = presentTransaction(tx, t);

  // Intelligence view model (display-only): structured, optional fields built on
  // top of `pres` — channel, counterparty, cheque/branch/account/reference/device
  // identifiers. Never fabricated; every value is a literal substring of the
  // source. Powers the redesigned "structured info" block below.
  const intel = buildTransactionIntelligence(tx, t);
  const structuredFieldValues = [
    intel.chequeNumber, intel.branch, intel.referenceNumber,
    intel.atmId, intel.terminalId, intel.sourceAccount, intel.destinationAccount,
  ].filter((v): v is string => Boolean(v));
  // The old single "detail" line is still shown, but only when it isn't already
  // covered by one of the structured rows above (avoids showing the same value twice).
  const extraDetail = intel.subtitle && !structuredFieldValues.some((v) => intel.subtitle!.includes(v))
    ? intel.subtitle
    : undefined;

  return (
    <>
      <div className="bae-drawer-overlay" onClick={onClose} />
      <div
        className="bae-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={DRAWER_TITLE_ID}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="bae-drawer-header">
          <div className="bae-drawer-header-id">
            <h3 className="bae-drawer-title" id={DRAWER_TITLE_ID}>{t('bank.explorer.tx_details_title')}</h3>
            <div className="bae-drawer-header-sub">
              <span className="bae-drawer-txid mono">{t('bank.explorer.tx_id_prefix')} #{tx.id}</span>
              <span className={`bae-tx-badge bae-tx-badge--${badge.kind}`}>{badge.label}</span>
            </div>
          </div>
          <button type="button" className="bae-drawer-close" onClick={onClose} aria-label={t('action.close')}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="bae-drawer-body">
          {/* ── Hero (always visible above the hub) ── */}
          <div className="bae-drawer-hero">
            <div className={`bae-drawer-hero-icon ${isIncoming ? 'in' : 'out'}`}>
              <span className="material-symbols-outlined">
                {isIncoming ? 'south_west' : 'north_east'}
              </span>
            </div>
            <div className="bae-drawer-hero-body">
              <span className={`bae-tx-badge bae-tx-badge--${badge.kind}`}>{badge.label}</span>
              {/* الرقم والرمز كانا عنصرين منفصلين برمز مثبَّت — داخل واجهة RTL ينقلب
                  ترتيبهما بصريًا («KWD 255.000»). `money-cell` تعزل القيمة في اتجاه LTR
                  بلا التفاف، والرمز يأتي من إعداد العملة. */}
              <div className={`bae-drawer-hero-amount money-cell ${isIncoming ? 'bae-credit' : 'bae-debit'}`}>
                {isIncoming ? '+' : '−'}{moneyParts(heroAmount).number} <span className="bae-drawer-hero-cur">{moneyParts(heroAmount).currency}</span>
              </div>
              {hasBalance && (
                <div className="bae-drawer-hero-balance">
                  {t('bank.explorer.balance_after')} <strong>{<MoneyText value={afterBalance} />}</strong>
                </div>
              )}
            </div>
          </div>

          {/* ── Information-Hub tab bar ── */}
          <div className="bae-drawer-tabs" role="tablist" aria-label={t('bank.explorer.tx_sections_label')}>
            {DRAWER_TABS.map((dt) => (
              <button
                key={dt.key}
                type="button"
                role="tab"
                aria-selected={drawerTab === dt.key ? 'true' : 'false'}
                className={`bae-drawer-tab${drawerTab === dt.key ? ' active' : ''}`}
                onClick={() => setDrawerTab(dt.key)}
              >
                <span className="material-symbols-outlined">{dt.icon}</span>
                <span className="bae-drawer-tab-label">{t(dt.labelKey)}</span>
              </button>
            ))}
          </div>

          {/* ── Tab panels ── */}
          <div className="bae-drawer-panel" role="tabpanel">
            {/* Basic */}
            {drawerTab === 'basic' && (
              <>
                <section className="bae-drawer-section">
                  <div className="bae-drawer-section-title">{t('bank.explorer.tx_info')}</div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">{t('col.date')}</span>
                    <span className="bae-drawer-field-value">{fmtDate(tx.statementDate)}</span>
                  </div>
                  {tx.postingDate && tx.postingDate !== tx.statementDate && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.posting_date')}</span>
                      <span className="bae-drawer-field-value">{fmtDate(tx.postingDate)}</span>
                    </div>
                  )}
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">{t('field.cheque.currency')}</span>
                    <span className="bae-drawer-field-value">{tx.currency}</span>
                  </div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">{t('field.status')}</span>
                    <span className={`bae-status-badge bae-status-badge--${reconcileClass}`}>
                      {reconcileLabel(tx.reconcileStatus, t)}
                    </span>
                  </div>
                </section>

                <section className="bae-drawer-section">
                  <div className="bae-drawer-section-title">{t('col.description')}</div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">{t('bank.explorer.tx_type')}</span>
                    <span className="bae-drawer-field-value">{intel.title}</span>
                  </div>
                  {intel.channel && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.tx_channel')}</span>
                      <span className="bae-drawer-field-value">{channelLabel(intel.channel, t)}</span>
                    </div>
                  )}
                  {intel.counterparty && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.counterparty')}</span>
                      <span className="bae-drawer-field-value">{intel.counterparty}</span>
                    </div>
                  )}
                  {intel.sourceAccount && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.source_account')}</span>
                      <span className="bae-drawer-field-value mono">{intel.sourceAccount}</span>
                    </div>
                  )}
                  {intel.destinationAccount && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.destination_account')}</span>
                      <span className="bae-drawer-field-value mono">{intel.destinationAccount}</span>
                    </div>
                  )}
                  {intel.chequeNumber && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('field.cheque.number')}</span>
                      <span className="bae-drawer-field-value mono">{intel.chequeNumber}</span>
                    </div>
                  )}
                  {intel.branch && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.branch')}</span>
                      <span className="bae-drawer-field-value mono">{intel.branch}</span>
                    </div>
                  )}
                  {intel.referenceNumber && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.reference_number')}</span>
                      <span className="bae-drawer-field-value mono">{intel.referenceNumber}</span>
                    </div>
                  )}
                  {(intel.atmId || intel.terminalId) && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.device_number')}</span>
                      <span className="bae-drawer-field-value mono">{intel.atmId ?? intel.terminalId}</span>
                    </div>
                  )}
                  {extraDetail && (
                    <div className="bae-drawer-field bae-drawer-field--col">
                      <span className="bae-drawer-field-label">{t('bank.explorer.additional_detail')}</span>
                      <span className="bae-drawer-field-value">{extraDetail}</span>
                    </div>
                  )}
                  <div className="bae-drawer-desc-raw">
                    <span className="bae-drawer-desc-raw-label">{t('bank.explorer.original_text')}</span>
                    <CollapsibleDescription text={tx.description} />
                  </div>
                </section>
              </>
            )}

            {/* Financial */}
            {drawerTab === 'financial' && (
              <section className="bae-drawer-section">
                <div className="bae-drawer-section-title">{t('bank.explorer.cash_flow')}</div>
                {credit > 0 && (
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">{t('bank.explorer.credit_deposit')}</span>
                    <span className="bae-drawer-field-value bae-credit">+{formatNumber(credit)}</span>
                  </div>
                )}
                {debit > 0 && (
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">{t('bank.explorer.debit_withdrawal')}</span>
                    <span className="bae-drawer-field-value bae-debit">−{formatNumber(debit)}</span>
                  </div>
                )}
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">{t('bank.explorer.balance_impact')}</span>
                  <span className={`bae-drawer-field-value ${impactClass}`}>
                    {impact >= 0 ? '+' : '−'}{formatNumber(Math.abs(impact))}
                  </span>
                </div>
                {hasBalance && (
                  <>
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.balance_before')}</span>
                      <span className="bae-drawer-field-value">{formatNumber(beforeBalance)}</span>
                    </div>
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.balance_after')}</span>
                      <span className="bae-drawer-field-value bae-drawer-primary">{formatNumber(afterBalance)}</span>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Import */}
            {drawerTab === 'import' && (
              <section className="bae-drawer-section">
                <div className="bae-drawer-section-title">{t('bank.explorer.import_data')}</div>
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">{t('bank.explorer.col_batch')}</span>
                  <span className="bae-drawer-field-value">{tx.importBatchLabel}</span>
                </div>
                <div className="bae-drawer-field bae-drawer-field--col">
                  <span className="bae-drawer-field-label">{t('bank.explorer.file_name')}</span>
                  <span className="bae-drawer-field-value mono">{tx.fileName}</span>
                </div>
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">{t('bank.explorer.statement_date')}</span>
                  <span className="bae-drawer-field-value">{fmtDate(tx.statementDate)}</span>
                </div>
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">{t('bank.explorer.import_date')}</span>
                  <span className="bae-drawer-field-value">{fmtDate(tx.importedAt)}</span>
                </div>
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">{t('col.sal.bank')}</span>
                  <span className="bae-drawer-field-value">{tx.bankName}</span>
                </div>
                {(tx.isDuplicate || tx.isBankFee) && (
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">{t('field.notes')}</span>
                    <span className="bae-drawer-flags">
                      {tx.isDuplicate && <span className="bae-status-badge bae-status-badge--warn">{t('bank.explorer.possible_duplicate')}</span>}
                      {tx.isBankFee   && <span className="bae-status-badge bae-status-badge--neutral">{catLabel('CHARGE', t)}</span>}
                    </span>
                  </div>
                )}
              </section>
            )}

            {/* Audit */}
            {drawerTab === 'audit' && (
              <>
                <section className="bae-drawer-section">
                  <div className="bae-drawer-section-title">{t('bank.explorer.audit_source')}</div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">{t('bank.explorer.entry_date')}</span>
                    <span className="bae-drawer-field-value">{fmtDate(tx.importedAt)}</span>
                  </div>
                  <div className="bae-drawer-field bae-drawer-field--col">
                    <span className="bae-drawer-field-label">{t('bank.explorer.source')}</span>
                    <span className="bae-drawer-field-value mono">{tx.fileName}</span>
                  </div>
                  {tx.accountKey && (
                    <div className="bae-drawer-field bae-drawer-field--col">
                      <span className="bae-drawer-field-label">{t('bank.explorer.account_key')}</span>
                      <span className="bae-drawer-field-value mono">{tx.accountKey}</span>
                    </div>
                  )}
                  {tx.transactionFingerprint && (
                    <div className="bae-drawer-field bae-drawer-field--col">
                      <span className="bae-drawer-field-label">{t('bank.explorer.fingerprint_label')}</span>
                      <span className="bae-drawer-field-value mono bae-drawer-fingerprint">
                        {tx.transactionFingerprint}
                      </span>
                    </div>
                  )}
                </section>

                {/* Smart-presentation provenance (how the display label was derived) */}
                <section className="bae-drawer-section">
                  <div className="bae-drawer-section-title">{t('bank.explorer.smart_classification')}</div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">{t('col.category')}</span>
                    <span className="bae-drawer-field-value">{pres.category.label}</span>
                  </div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">{t('bank.explorer.confidence_level')}</span>
                    <span className="bae-drawer-field-value">{confidenceLabel(pres.category.confidence, t)}</span>
                  </div>
                  <div className="bae-drawer-field bae-drawer-field--col">
                    <span className="bae-drawer-field-label">{t('bank.explorer.applied_rule')}</span>
                    <span className="bae-drawer-field-value mono">{pres.provenance.rule}</span>
                  </div>
                  {pres.provenance.matchedOn && (
                    <div className="bae-drawer-field bae-drawer-field--col">
                      <span className="bae-drawer-field-label">{t('bank.explorer.matched_source')}</span>
                      <span className="bae-drawer-field-value mono">{pres.provenance.matchedOn}</span>
                    </div>
                  )}
                  {pres.detail && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">{t('bank.explorer.displayed_detail')}</span>
                      <span className="bae-drawer-field-value">
                        {pres.detail.text}
                        <span className="bae-drawer-txid"> · {confidenceLabel(pres.detail.confidence, t)}</span>
                      </span>
                    </div>
                  )}
                  {pres.raw && (
                    <div className="bae-drawer-field bae-drawer-field--col">
                      <span className="bae-drawer-field-label">{t('bank.explorer.original_text_from_bank')}</span>
                      <span className="bae-drawer-field-value mono">{pres.raw}</span>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Attachments — feature not supported: elegant empty state */}
            {drawerTab === 'attachments' && (
              <div className="bae-drawer-empty">
                <div className="bae-drawer-empty-illus">
                  <span className="material-symbols-outlined">attach_file</span>
                </div>
                <p className="bae-drawer-empty-title">{t('bank.explorer.no_attachments')}</p>
                <p className="bae-drawer-empty-msg">{t('bank.explorer.no_attachments_msg')}</p>
              </div>
            )}
          </div>

          {/* ── Quick balance-flow summary (before → amount → after) ── */}
          {hasBalance && (
            <div className="bae-drawer-summary">
              <div className="bae-drawer-summary-title">{t('bank.explorer.quick_summary')}</div>
              <div className="bae-drawer-summary-flow">
                <div className="bae-drawer-summary-cell">
                  <span className="bae-drawer-summary-label">{t('bank.explorer.balance_before')}</span>
                  <span className="bae-drawer-summary-value money-cell">{moneyParts(beforeBalance).number}<span className="bae-drawer-summary-cur">{moneyParts(beforeBalance).currency}</span></span>
                </div>
                <span className="bae-drawer-summary-arrow material-symbols-outlined" aria-hidden="true">arrow_back</span>
                <div className="bae-drawer-summary-cell">
                  <span className="bae-drawer-summary-label">{t('col.amount')}</span>
                  <span className={`bae-drawer-summary-value money-cell ${isIncoming ? 'bae-credit' : 'bae-debit'}`}>
                    {isIncoming ? '+' : '−'}{moneyParts(heroAmount).number}<span className="bae-drawer-summary-cur">{moneyParts(heroAmount).currency}</span>
                  </span>
                </div>
                <span className="bae-drawer-summary-arrow material-symbols-outlined" aria-hidden="true">arrow_back</span>
                <div className="bae-drawer-summary-cell">
                  <span className="bae-drawer-summary-label">{t('bank.explorer.balance_after')}</span>
                  <span className="bae-drawer-summary-value bae-drawer-primary money-cell">{moneyParts(afterBalance).number}<span className="bae-drawer-summary-cur">{moneyParts(afterBalance).currency}</span></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="bae-drawer-footer">
          {tx.reference && <CopyButton value={tx.reference} label={t('bank.explorer.copy_reference')} />}
          {tx.transactionFingerprint && <CopyButton value={tx.transactionFingerprint} label={t('bank.explorer.copy_fingerprint')} />}
          <button type="button" className="btn bae-drawer-close-btn" onClick={onClose}>{t('action.close')}</button>
        </div>
      </div>
    </>
  );
}

// ── Tab: Timeline ─────────────────────────────────────────────────────────────

const QUICK_RANGES: QuickRange[] = ['today', 'week', 'month', 'last30', 'last90', 'all'];
const TYPE_OPTIONS: TimelineFilterType[] = ['all', 'deposits', 'withdrawals', 'fees', 'cheques', 'transfers'];

interface FilterChip { key: string; label: string; onRemove: () => void; }

export function TimelineTab({
  accountKey,
  bankName,
}: {
  accountKey: string;
  bankName:   string;
}) {
  const { t } = useT();
  const PAGE_SIZE = 50;

  const [result, setResult]   = useState<TimelineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [page, setPage]       = useState(1);
  const [drawerTx, setDrawerTx] = useState<TimelineTransaction | null>(null);

  // Committed filters drive the query; raw inputs feed them (debounced where noisy).
  const [filters, setFilters]       = useState<TimelineFilters>({ type: 'all' });
  const [searchInput, setSearchInput] = useState('');
  const [minInput, setMinInput]     = useState('');
  const [maxInput, setMaxInput]     = useState('');
  const [quick, setQuick]           = useState<QuickRange | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single source of truth: reload whenever account, page, or committed filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTimeline(accountKey, page, PAGE_SIZE, filters)
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e) => { if (!cancelled) setError(errorMessage(e) || t('bank.explorer.load_tx_failed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accountKey, page, filters]);

  const patchFilters = useCallback((patch: Partial<TimelineFilters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch }));
  }, []);

  const onSearchInput = useCallback((q: string) => {
    setSearchInput(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => patchFilters({ search: q.trim() || undefined }), 350);
  }, [patchFilters]);

  const onAmountInput = useCallback((which: 'min' | 'max', v: string) => {
    if (which === 'min') setMinInput(v); else setMaxInput(v);
    if (amountTimer.current) clearTimeout(amountTimer.current);
    amountTimer.current = setTimeout(() => {
      const n = v.trim() ? Number(v) : undefined;
      const valid = n != null && Number.isFinite(n) && n >= 0 ? n : undefined;
      patchFilters(which === 'min' ? { minAmount: valid } : { maxAmount: valid });
    }, 400);
  }, [patchFilters]);

  const applyQuick = useCallback((r: QuickRange) => {
    setQuick(r);
    const { fromDate, toDate } = quickRangeToDates(r);
    patchFilters({ fromDate: fromDate || undefined, toDate: toDate || undefined });
  }, [patchFilters]);

  const onDateChange = useCallback((which: 'from' | 'to', v: string) => {
    setQuick(null); // manual date selection overrides a quick range
    patchFilters(which === 'from' ? { fromDate: v || undefined } : { toDate: v || undefined });
  }, [patchFilters]);

  const clearAllFilters = useCallback(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (amountTimer.current) clearTimeout(amountTimer.current);
    setSearchInput(''); setMinInput(''); setMaxInput(''); setQuick(null);
    setPage(1);
    setFilters({ type: 'all' });
  }, []);

  const refresh = useCallback(() => {
    setFilters((f) => ({ ...f })); // new identity → effect re-runs the same query
  }, []);

  const total      = result?.totalCount ?? 0;
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const shown       = result?.transactions.length ?? 0;

  const hasActiveFilters = !!(
    filters.search || filters.fromDate || filters.toDate ||
    (filters.type && filters.type !== 'all') ||
    filters.minAmount != null || filters.maxAmount != null
  );

  // Active filter chips.
  const chips: FilterChip[] = [];
  if (filters.search) {
    chips.push({ key: 'search', label: t('bank.explorer.search_chip', { query: filters.search }), onRemove: () => onSearchInput('') });
  }
  if (filters.fromDate || filters.toDate) {
    const label = quick
      ? QUICK_RANGE_LABELS[quick]
      : `${filters.fromDate ?? '…'} — ${filters.toDate ?? '…'}`;
    chips.push({ key: 'date', label, onRemove: () => { setQuick(null); patchFilters({ fromDate: undefined, toDate: undefined }); } });
  }
  if (filters.type && filters.type !== 'all') {
    chips.push({ key: 'type', label: TYPE_LABELS[filters.type], onRemove: () => patchFilters({ type: 'all' }) });
  }
  if (filters.minAmount != null) {
    chips.push({ key: 'min', label: t('bank.explorer.min_amount_chip', { amount: filters.minAmount }), onRemove: () => { setMinInput(''); patchFilters({ minAmount: undefined }); } });
  }
  if (filters.maxAmount != null) {
    chips.push({ key: 'max', label: t('bank.explorer.max_amount_chip', { amount: filters.maxAmount }), onRemove: () => { setMaxInput(''); patchFilters({ maxAmount: undefined }); } });
  }

  const openDrawer = (tx: TimelineTransaction) => setDrawerTx(tx);

  return (
    <div className="bae-tab-content">
      {/* ── Filter workspace ── */}
      <div className="bae-filterbar">
        {/* Search + actions */}
        <div className="bae-filter-topline">
          <div className="bae-search-wrap">
            <span className="material-symbols-outlined bae-filter-icon">search</span>
            <input
              className="bae-filter-input"
              placeholder={t('bank.explorer.search_placeholder')}
              value={searchInput}
              onChange={(e) => onSearchInput(e.target.value)}
            />
            {searchInput && (
              <button type="button" className="bae-clear-btn" onClick={() => onSearchInput('')} aria-label={t('bank.explorer.clear_search')}>
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
          </div>
          <div className="bae-filter-actions">
            {hasActiveFilters && (
              <button type="button" className="btn secondary bae-clear-filters-inline" onClick={clearAllFilters} title={t('bank.explorer.clear_all_filters')}>
                <span className="material-symbols-outlined">filter_alt_off</span>
                {t('page.warning.clear_confirm_btn')}
              </button>
            )}
            <button type="button" className="btn secondary bae-icon-btn" onClick={refresh} title={t('action.refresh')} aria-label={t('action.refresh')}>
              <span className="material-symbols-outlined">refresh</span>
            </button>
            <button
              type="button"
              className="btn secondary bae-export-btn"
              onClick={() => shown > 0 && result && exportTimelineCsv(result.transactions, bankName, accountKey, t)}
              disabled={shown === 0}
              title={t('bank.explorer.export_current_page')}
            >
              <span className="material-symbols-outlined">download</span>
              {t('bank.explorer.export_csv')}
            </button>
          </div>
        </div>

        {/* Grouped controls: Type · Period · Amount (RTL: right → left) */}
        <div className="bae-filter-groups">
          <div className="bae-filter-group">
            <span className="bae-filter-group-label">
              <span className="material-symbols-outlined">category</span>
              {t('bank.explorer.tx_type_filter')}
            </span>
            <div className="bae-type-group" role="group" aria-label={t('bank.explorer.tx_type_filter')}>
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`bae-chip-btn${(filters.type ?? 'all') === opt ? ' active' : ''}`}
                  onClick={() => patchFilters({ type: opt })}
                >
                  {TYPE_LABELS[opt]}
                </button>
              ))}
            </div>
          </div>

          <div className="bae-filter-group">
            <span className="bae-filter-group-label">
              <span className="material-symbols-outlined">calendar_month</span>
              {t('col.sal.period')}
            </span>
            <div className="bae-quick-ranges">
              {QUICK_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`bae-chip-btn${quick === r ? ' active' : ''}`}
                  onClick={() => applyQuick(r)}
                >
                  {QUICK_RANGE_LABELS[r]}
                </button>
              ))}
            </div>
            <div className="bae-date-range">
              <DateInput
                className="bae-date-input"
                value={filters.fromDate ?? ''}
                onChange={(v) => onDateChange('from', v)}
                title={t('filter.date_from')}
                ariaLabel={t('filter.date_from')}
              />
              <span className="bae-range-sep" aria-hidden="true">—</span>
              <DateInput
                className="bae-date-input"
                value={filters.toDate ?? ''}
                onChange={(v) => onDateChange('to', v)}
                title={t('filter.date_to')}
                ariaLabel={t('filter.date_to')}
              />
            </div>
          </div>

          <div className="bae-filter-group">
            <span className="bae-filter-group-label">
              <span className="material-symbols-outlined">payments</span>
              {t('bank.explorer.amount_range_kwd')}
            </span>
            <div className="bae-amount-range">
              <input
                className="bae-amount-input"
                type="number"
                min="0"
                step="0.001"
                placeholder={t('bank.explorer.min_amount_ph')}
                value={minInput}
                onChange={(e) => onAmountInput('min', e.target.value)}
                aria-label={t('bank.explorer.min_amount_ph')}
              />
              <span className="bae-range-sep" aria-hidden="true">—</span>
              <input
                className="bae-amount-input"
                type="number"
                min="0"
                step="0.001"
                placeholder={t('bank.explorer.max_amount_ph')}
                value={maxInput}
                onChange={(e) => onAmountInput('max', e.target.value)}
                aria-label={t('bank.explorer.max_amount_ph')}
              />
            </div>
          </div>
        </div>

        {/* Active chips + result count + clear */}
        {(chips.length > 0 || result) && (
          <div className="bae-filter-status">
            <div className="bae-active-chips">
              {chips.map((c) => (
                <span key={c.key} className="bae-active-chip">
                  {c.label}
                  <button type="button" onClick={c.onRemove} aria-label={t('bank.explorer.remove_chip', { label: c.label })}>
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </span>
              ))}
              {chips.length > 0 && (
                <button type="button" className="bae-clear-all-link" onClick={clearAllFilters}>
                  {t('bank.explorer.clear_all')}
                </button>
              )}
            </div>
            {result && (
              <span className="bae-result-count">
                {t('bank.explorer.result_count', { count: total.toLocaleString() })}
                {result.fromDate && <> · {fmtDate(result.fromDate)} — {fmtDate(result.toDate)}</>}
                {' · '}
                <span className="bae-result-total">
                  {timelineTotalLabel(filters.type)}: {<MoneyText value={result.filteredTotal} />}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="bae-skeleton-table" aria-busy="true" aria-label={t('bank.explorer.loading_aria')}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bae-skeleton-row">
              <span className="bae-skeleton-cell bae-sk-sm" />
              <span className="bae-skeleton-cell bae-sk-md" />
              <span className="bae-skeleton-cell bae-sk-sm" />
              <span className="bae-skeleton-cell bae-sk-lg" />
              <span className="bae-skeleton-cell bae-sk-sm" />
            </div>
          ))}
        </div>
      )}
      {!loading && error && (
        <div className="bae-error">
          <span>{error}</span>
          <button type="button" className="btn secondary" onClick={refresh}>{t('page.dashboard.retry')}</button>
        </div>
      )}

      {/* Filtered empty state */}
      {!loading && !error && result && shown === 0 && hasActiveFilters && (
        <div className="bae-empty-state">
          <div className="bae-empty-illus bae-empty-illus--lg"><span className="material-symbols-outlined">filter_alt_off</span></div>
          <h3>{t('bank.explorer.no_matching_tx')}</h3>
          <p className="bae-empty-msg">{t('bank.explorer.no_matching_tx_msg')}</p>
          <button type="button" className="btn bae-clear-filters-btn" onClick={clearAllFilters}>
            <span className="material-symbols-outlined">filter_alt_off</span>
            {t('bank.explorer.clear_all_filters')}
          </button>
        </div>
      )}

      {/* Unfiltered empty state */}
      {!loading && !error && result && shown === 0 && !hasActiveFilters && (
        <div className="bae-empty-state">
          <div className="bae-empty-illus bae-empty-illus--lg"><span className="material-symbols-outlined">receipt_long</span></div>
          <h3>{t('bank.explorer.no_tx_in_account')}</h3>
          <p className="bae-empty-msg">{t('bank.explorer.no_tx_in_account_msg')}</p>
          <button type="button" className="btn secondary" onClick={refresh}>
            <span className="material-symbols-outlined">refresh</span>
            {t('action.refresh')}
          </button>
        </div>
      )}

      {/* Transaction Drawer */}
      {drawerTx && <TransactionDrawer tx={drawerTx} onClose={() => setDrawerTx(null)} />}

      {/* Table */}
      {!loading && !error && result && shown > 0 && (
        <>
          <div className="bae-table-wrap">
            <table className="bae-timeline-table bae-timeline-table--exec">
              <thead>
                <tr>
                  <th className="bae-col-op">{t('bank.explorer.col_operation')}</th>
                  <th className="bae-col-date">{t('col.date')}</th>
                  <th className="bae-col-type">{t('col.type')}</th>
                  <th className="bae-col-desc-main">{t('col.description')}</th>
                  <th className="bae-col-amount">{fcMoneyHeader(t('col.amount'))}</th>
                  <th className="bae-col-balance">{fcMoneyHeader(t('bank.explorer.balance_after'))}</th>
                  <th className="bae-col-chevron" aria-label={t('bank.explorer.open_action')} />
                </tr>
              </thead>
              <tbody>
                {result.transactions.map((tx) => {
                  const isDeposit  = safeNum(tx.credit) > 0;
                  const isSelected = drawerTx?.id === tx.id;
                  const badge      = txTypeBadge(tx, t);
                  const pres       = presentTransaction(tx, t);
                  const amount     = isDeposit ? safeNum(tx.credit) : safeNum(tx.debit);
                  const statusClass = tx.reconcileStatus === 'MATCHED' ? 'good'
                    : tx.reconcileStatus === 'UNMATCHED' ? 'warn' : 'neutral';
                  const rowClass = [
                    tx.isBankFee ? 'bae-row-fee' : '',
                    isSelected ? 'bae-row-selected' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <tr
                      key={tx.id}
                      className={rowClass}
                      onClick={() => openDrawer(tx)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(tx); }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={t('bank.explorer.tx_details_aria', { description: tx.description })}
                    >
                      {/* Operation: type icon + reconcile status dot */}
                      <td className="bae-col-op">
                        <span className="bae-op-cell">
                          <span className={`bae-tx-icon bae-tx-icon--${badge.kind}`}>
                            <span className="material-symbols-outlined">{TX_ICONS[badge.kind]}</span>
                          </span>
                          <span
                            className={`bae-status-dot-cell bae-status-dot-cell--${statusClass}`}
                            title={reconcileLabel(tx.reconcileStatus, t)}
                          />
                        </span>
                      </td>
                      <td className="bae-col-date">{fmtDate(tx.statementDate)}</td>
                      <td className="bae-col-type">
                        <span className={`bae-tx-badge bae-tx-badge--${badge.kind}`}>{badge.label}</span>
                      </td>
                      {/* Description: single-line, ellipsis-truncated; full text via title tooltip */}
                      <td className="bae-col-desc-main">
                        <span className="bae-tx-desc" title={tx.description}>
                          {pres.detail ? `${pres.category.label} — ${pres.detail.text}` : pres.category.label}
                        </span>
                      </td>
                      <td className="bae-col-amount">
                        <span className={isDeposit ? 'bae-credit' : 'bae-debit'}>
                          {isDeposit ? '+' : '−'}{formatNumber(amount)}
                        </span>
                      </td>
                      <td className="bae-col-balance">
                        {tx.balance != null ? formatNumber(safeNum(tx.balance)) : '—'}
                      </td>
                      <td className="bae-col-chevron">
                        <span className="material-symbols-outlined">chevron_left</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination — shared ExplorerKit component, not a bespoke reimplementation */}
          <Pagination
            meta={{ page, pageSize: PAGE_SIZE, total, totalPages }}
            onPage={(p) => setPage(p)}
            disabled={loading}
          />
        </>
      )}
    </div>
  );
}

// ── Tab: Analytics ────────────────────────────────────────────────────────────

// Defensive cap: never feed more than this many points to a chart, regardless of
// what the backend returns. Protects the renderer from pathological data.
const MAX_CHART_POINTS = 120;

const ARABIC_FONT = 'IBM Plex Sans Arabic, Cairo, sans-serif';

function monthLabel(m: MonthlyEntry): string {
  return typeof m.month === 'string' ? m.month.slice(0, 7) : '';
}

export function AnalyticsTab({ dashboard }: { dashboard: BankAccountDashboard }) {
  const { t } = useT();
  // Every array/number that reaches Recharts is sanitised here. Bad data renders
  // an empty state, never throws.
  const monthly = useMemo(
    () => (Array.isArray(dashboard.monthly) ? dashboard.monthly.slice(-MAX_CHART_POINTS) : []),
    [dashboard.monthly],
  );

  const topDeposits    = Array.isArray(dashboard.topDeposits)    ? dashboard.topDeposits    : [];
  const topWithdrawals = Array.isArray(dashboard.topWithdrawals) ? dashboard.topWithdrawals : [];

  // Monthly deposits vs withdrawals.
  const flowData = useMemo(() => monthly.map((m) => ({
    name:    monthLabel(m),
    إيداعات: safeAmount(m.totalDeposits),
    سحوبات:  safeAmount(m.totalWithdrawals),
  })), [monthly]);

  // Cumulative running balance (opening balance + Σ net flow).
  const balanceData = useMemo(() => {
    let running = safeNum(dashboard.openingBalance);
    return monthly.map((m) => {
      running += safeNum(m.netFlow);
      return { name: monthLabel(m), الرصيد: parseFloat(running.toFixed(3)) };
    });
  }, [monthly, dashboard.openingBalance]);

  // Transaction frequency per month.
  const freqData = useMemo(() => monthly.map((m) => ({
    name:   monthLabel(m),
    عمليات: Math.max(0, Math.round(safeNum(m.txCount))),
  })), [monthly]);

  // Cash-flow distribution pie (drop zero slices so the chart never renders empty wedges).
  const pieData = useMemo(() => [
    { name: t('bank.explorer.total_deposits'), value: safeAmount(dashboard.totalDeposits) },
    { name: t('bank.explorer.total_withdrawals'), value: safeAmount(dashboard.totalWithdrawals) },
  ].filter((d) => d.value > 0), [dashboard.totalDeposits, dashboard.totalWithdrawals, t]);

  if (monthly.length === 0) {
    return (
      <div className="bae-tab-content bae-empty-state">
        <div className="bae-empty-illus"><span className="material-symbols-outlined">bar_chart</span></div>
        <h3>{t('bank.explorer.no_analytics_data')}</h3>
        <p>{t('bank.explorer.no_analytics_data_msg')}</p>
      </div>
    );
  }

  const xAxis = (
    <XAxis
      dataKey="name"
      tickFormatter={fmtMonth}
      angle={-35}
      textAnchor="end"
      height={70}
      interval="preserveStartEnd"
      tick={{ fontSize: 10, fill: 'var(--muted)', fontFamily: ARABIC_FONT }}
    />
  );

  return (
    <div className="bae-tab-content">
      {/* Account health (relocated from the former Overview tab) */}
      {dashboard.transactionCount > 0 && <AccountHealthCard dashboard={dashboard} />}

      {/* Running balance */}
      <div className="bae-chart-section">
        <h4 className="bae-section-title">
          <span className="material-symbols-outlined">account_balance</span>
          {t('bank.explorer.chart_running_balance')}
        </h4>
        <div className="bae-chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={balanceData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              {xAxis}
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="الرصيد" name={t('bank.explorer.balance_series')} stroke="#6366f1" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Deposits vs withdrawals */}
      <div className="bae-chart-section">
        <h4 className="bae-section-title">
          <span className="material-symbols-outlined">bar_chart</span>
          {t('bank.explorer.chart_monthly_flow')}
        </h4>
        <div className="bae-chart-wrap">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={flowData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              {xAxis}
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontFamily: ARABIC_FONT, fontSize: 12, direction: 'rtl' }} />
              <Bar dataKey="إيداعات" name={t('bank.explorer.deposits_series')} fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="سحوبات"  name={t('bank.explorer.withdrawals_series')} fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two-up: frequency + distribution */}
      <div className="bae-chart-duo">
        <div className="bae-chart-section">
          <h4 className="bae-section-title">
            <span className="material-symbols-outlined">insights</span>
            {t('bank.explorer.chart_monthly_tx_count')}
          </h4>
          <div className="bae-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={freqData} margin={{ top: 5, right: 16, left: 6, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                {xAxis}
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="عمليات" name={t('bank.explorer.tx_count_series')} fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {pieData.length > 0 && (
          <div className="bae-chart-section">
            <h4 className="bae-section-title">
              <span className="material-symbols-outlined">donut_large</span>
              {t('bank.explorer.chart_cash_flow_distribution')}
            </h4>
            <div className="bae-chart-wrap bae-chart-pie-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    outerRadius={95}
                    dataKey="value"
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name ?? ''} ${((percent ?? 0) * 100).toFixed(1)}%`}
                    labelLine
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={entry.name} fill={i === 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Top deposits / withdrawals */}
      <div className="bae-chart-duo">
        {topDeposits.length > 0 && (
          <div className="bae-top-section">
            <h4 className="bae-section-title">
              <span className="material-symbols-outlined">arrow_upward</span>
              {t('bank.explorer.top_deposits')}
            </h4>
            <table className="bae-top-table">
              <thead><tr><th>{t('col.date')}</th><th>{t('col.description')}</th><th>{fcMoneyHeader(t('col.amount'))}</th></tr></thead>
              <tbody>
                {topDeposits.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtDate(row.statementDate)}</td>
                    <td className="bae-desc-cell" title={row.description}>{row.description}</td>
                    <td className="bae-amount-green">{fmtAmount(safeNum(row.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {topWithdrawals.length > 0 && (
          <div className="bae-top-section">
            <h4 className="bae-section-title">
              <span className="material-symbols-outlined">arrow_downward</span>
              {t('bank.explorer.top_withdrawals')}
            </h4>
            <table className="bae-top-table">
              <thead><tr><th>{t('col.date')}</th><th>{t('col.description')}</th><th>{fcMoneyHeader(t('col.amount'))}</th></tr></thead>
              <tbody>
                {topWithdrawals.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtDate(row.statementDate)}</td>
                    <td className="bae-desc-cell" title={row.description}>{row.description}</td>
                    <td className="bae-amount-red">{fmtAmount(safeNum(row.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Monthly details table */}
      <div className="bae-chart-section">
        <h4 className="bae-section-title">
          <span className="material-symbols-outlined">table_chart</span>
          {t('bank.explorer.monthly_details')}
        </h4>
        <div className="bae-monthly-scroll">
          <table className="bae-top-table">
            <thead>
              <tr>
                <th>{t('bank.explorer.col_month')}</th><th>{t('bank.explorer.deposits_series')}</th><th>{t('bank.explorer.largest_deposit')}</th>
                <th>{t('bank.explorer.withdrawals_series')}</th><th>{t('bank.explorer.largest_withdrawal')}</th><th>{t('bank.explorer.net')}</th><th>{t('bank.explorer.tx_count_series')}</th>
              </tr>
            </thead>
            <tbody>
              {[...monthly].reverse().map((m) => (
                <tr key={m.month}>
                  <td>{fmtMonth(m.month)}</td>
                  <td className="bae-amount-green">{fmtAmount(safeNum(m.totalDeposits))}</td>
                  <td className="bae-amount-green">{fmtAmount(safeNum(m.largestDeposit))}</td>
                  <td className="bae-amount-red">{fmtAmount(safeNum(m.totalWithdrawals))}</td>
                  <td className="bae-amount-red">{fmtAmount(safeNum(m.largestWithdrawal))}</td>
                  <td className={safeNum(m.netFlow) >= 0 ? 'bae-amount-green' : 'bae-amount-red'}>
                    {fmtAmount(safeNum(m.netFlow))}
                  </td>
                  <td>{Math.max(0, Math.round(safeNum(m.txCount)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Imports ──────────────────────────────────────────────────────────────

function ImportsTab({ accountKey }: { accountKey: string }) {
  const { t } = useT();
  const [imports, setImports]   = useState<ImportListItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // `t` is a new reference every render (useT() is unmemoized) — including it in this
  // effect's deps would refire the fetch on every render. tRef gives the catch handler
  // the latest translator without making the effect reactive to it.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    setLoading(true);
    listImports(1, 200)
      .then((r) => {
        // Filter to this account
        const filtered = r.items.filter((i) => i.accountKey === accountKey);
        setImports(filtered);
      })
      .catch((e) => setError(errorMessage(e) || tRef.current('bank.explorer.load_batches_failed')))
      .finally(() => setLoading(false));
  }, [accountKey]);

  return (
    <div className="bae-tab-content">
      {loading && <div className="bae-loading"><span className="spinner" /> {t('msg.loading')}</div>}
      {!loading && error && <div className="bae-error">{error}</div>}
      {!loading && !error && imports.length === 0 && (
        <div className="bae-empty-state">
          <span className="material-symbols-outlined">upload_file</span>
          <p>{t('bank.explorer.no_import_batches')}</p>
        </div>
      )}
      {!loading && !error && imports.length > 0 && (
        <>
          <p className="bae-imports-count">{t('bank.explorer.batch_count', { count: imports.length })}</p>
          <div className="bae-table-wrap">
            <table className="bae-timeline-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('col.backup.file')}</th>
                  <th>{t('filter.date_from')}</th>
                  <th>{t('filter.date_to')}</th>
                  <th>{t('bank.explorer.rows')}</th>
                  <th>{t('bank.explorer.deposits_series')}</th>
                  <th>{t('bank.explorer.withdrawals_series')}</th>
                  <th>{t('bank.explorer.imported_by')}</th>
                  <th>{t('bank.explorer.import_date')}</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id}>
                    <td>{imp.id}</td>
                    <td className="bae-col-desc" title={imp.fileName}>{imp.fileName}</td>
                    <td>{fmtDate(imp.fromDate)}</td>
                    <td>{fmtDate(imp.toDate)}</td>
                    <td>{imp.totalRows}</td>
                    <td className="bae-amount-green">{fmtAmount(imp.totalCredits)}</td>
                    <td className="bae-amount-red">{fmtAmount(imp.totalDebits)}</td>
                    <td>{imp.importedBy}</td>
                    <td>{fmtDate(imp.importedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Export ───────────────────────────────────────────────────────────────

function ExportTab({
  accountKey,
  bankName,
  dashboard,
}: {
  accountKey: string;
  bankName:   string;
  dashboard:  BankAccountDashboard;
}) {
  const { t } = useT();
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleExportAll = useCallback(async () => {
    setLoading(true);
    setDone(false);
    setError(null);
    try {
      const total = dashboard.transactionCount;
      const PAGE  = 500;
      const pages = Math.max(1, Math.ceil(total / PAGE));
      const all: TimelineTransaction[] = [];
      for (let p = 1; p <= pages; p++) {
        const r = await getTimeline(accountKey, p, PAGE);
        all.push(...r.transactions);
      }
      exportTimelineCsv(all, bankName, accountKey, t);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e) || t('bank.explorer.export_failed'));
    } finally {
      setLoading(false);
    }
  }, [accountKey, bankName, dashboard.transactionCount, t]);

  return (
    <div className="bae-tab-content bae-export-tab">
      <div className="bae-export-card">
        <span className="material-symbols-outlined bae-export-icon">download</span>
        <h3>{t('bank.explorer.export_account_data')}</h3>
        <p>
          {t('bank.explorer.export_intro', { count: dashboard.transactionCount.toLocaleString() })}{' '}
          <strong>{bankName}</strong> {t('bank.explorer.export_suffix')}
        </p>
        {dashboard.coverageStart && (
          <p className="bae-export-range">
            {t('col.sal.period')}: {fmtDate(dashboard.coverageStart)} — {fmtDate(dashboard.coverageEnd)}
          </p>
        )}
        <button
          type="button"
          className="btn bae-export-btn-main"
          onClick={handleExportAll}
          disabled={loading || dashboard.transactionCount === 0}
        >
          {loading
            ? <><span className="spinner bae-btn-spinner" />  {t('bank.explorer.exporting')}</>
            : <><span className="material-symbols-outlined">download</span> {t('bank.explorer.export_csv')}</>}
        </button>
        {done && (
          <p className="bae-export-done">
            <span className="material-symbols-outlined">check_circle</span>
            {t('bank.explorer.export_success')}
          </p>
        )}
        {error && <p className="bae-export-error">{error}</p>}
      </div>
    </div>
  );
}

// ── BankAccountExplorer ───────────────────────────────────────────────────────

type Tab = 'timeline' | 'analytics' | 'imports' | 'export';

// Secondary slim tabs — the executive header + KPI row + timeline form the
// primary landing experience; Analytics / Imports / Export remain accessible
// here so no existing functionality is lost.
// `labelKey` reuses 'perm.action.export' and 'bank.explorer.import_batches'
// where an exact DICT.ar match exists; otherwise a new bank.explorer.* key.
const TABS: { key: Tab; labelKey: string; icon: string }[] = [
  { key: 'timeline',   labelKey: 'bank.explorer.tab_timeline',   icon: 'receipt_long' },
  { key: 'analytics',  labelKey: 'bank.explorer.tab_analytics',  icon: 'bar_chart' },
  { key: 'imports',    labelKey: 'bank.explorer.import_batches', icon: 'upload_file' },
  { key: 'export',     labelKey: 'perm.action.export',           icon: 'download' },
];

export default function BankAccountExplorer() {
  const { t } = useT();
  const { accountKey: rawKey } = useParams<{ accountKey: string }>();
  const navigate               = useNavigate();
  const { hasPermission }      = useAuth();

  const accountKey = rawKey ? decodeURIComponent(rawKey) : '';

  const [tab, setTab]             = useState<Tab>('timeline');
  const [dashboard, setDashboard] = useState<BankAccountDashboard | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const canView = hasPermission('bankStatementImport.read');

  // `t` from useT() is a new reference every render (unmemoized) — closing over it
  // directly here would recreate `loadDashboard` every render and infinitely re-fire
  // the fetch effect below. A ref hands the callback the latest translator without
  // making it a reactive dependency.
  const tRef = useRef(t);
  tRef.current = t;

  const loadDashboard = useCallback(() => {
    if (!accountKey || !canView) return;
    setLoading(true);
    setError(null);
    getBankAccountDashboard(accountKey)
      .then(setDashboard)
      .catch((e) => setError(errorMessage(e) || tRef.current('bank.explorer.load_account_failed')))
      .finally(() => setLoading(false));
  }, [accountKey, canView]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (!canView) {
    return (
      <div className="bae-permission-error">
        <span className="material-symbols-outlined">lock</span>
        <p>{t('bank.explorer.no_permission')}</p>
      </div>
    );
  }

  return (
    <div className="bae-root">
      {/* ── Page title + breadcrumb ── */}
      <div className="bae-page-head">
        <nav className="bae-breadcrumb" aria-label={t('bank.explorer.breadcrumb_nav')}>
          <button type="button" onClick={() => navigate('/')}>{t('bank.explorer.home')}</button>
          <span className="bae-breadcrumb-sep" aria-hidden="true">/</span>
          <button type="button" onClick={() => navigate('/bank-accounts')}>{t('nav.bank_reconciliation')}</button>
          <span className="bae-breadcrumb-sep" aria-hidden="true">/</span>
          <span className="bae-breadcrumb-current" aria-current="page">{t('nav.bank_accounts')}</span>
        </nav>
        <h1 className="bae-page-title">
          <span className="material-symbols-outlined">account_balance</span>
          {t('bank.explorer.page_title')}
        </h1>
      </div>

      {/* ── Loading skeleton for the whole shell ── */}
      {loading && (
        <div className="bae-loading-center">
          <span className="spinner" />
          <span>{t('bank.explorer.loading_account')}</span>
        </div>
      )}

      {!loading && error && (
        <div className="bae-error-center">
          <span className="material-symbols-outlined">error_outline</span>
          <p>{error}</p>
          <button type="button" className="btn secondary" onClick={loadDashboard}>{t('page.dashboard.retry')}</button>
        </div>
      )}

      {!loading && !error && dashboard && (
        <>
          {/* ── Executive header ── */}
          <ExecutiveHeader
            dashboard={dashboard}
            accountKey={accountKey}
            onBack={() => navigate('/bank-accounts')}
            onAddStatement={() => navigate('/bank-statement-import')}
          />

          {/* ── KPI row ── */}
          <KpiRow dashboard={dashboard} />

          {/* ── Primary navigation tabs ── */}
          <div className="bae-tab-bar bae-tab-bar--nav" role="tablist">
            {TABS.map((tabItem) => (
              <button
                type="button"
                key={tabItem.key}
                role="tab"
                aria-selected={tab === tabItem.key ? 'true' : 'false'}
                className={`bae-tab-btn${tab === tabItem.key ? ' active' : ''}`}
                onClick={() => setTab(tabItem.key)}
              >
                <span className="material-symbols-outlined bae-tab-icon">{tabItem.icon}</span>
                {t(tabItem.labelKey)}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          <ErrorBoundary
            resetKey={tab}
            onReset={() => setTab('timeline')}
            resetLabel={t('bank.explorer.back_to_timeline')}
          >
            {tab === 'timeline'  && <TimelineTab  accountKey={accountKey} bankName={dashboard.bankName} />}
            {tab === 'analytics' && <AnalyticsTab dashboard={dashboard} />}
            {tab === 'imports'   && <ImportsTab   accountKey={accountKey} />}
            {tab === 'export'    && <ExportTab    accountKey={accountKey} bankName={dashboard.bankName} dashboard={dashboard} />}
          </ErrorBoundary>
        </>
      )}
    </div>
  );
}
