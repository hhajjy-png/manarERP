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
import PrivateAmount from '../components/PrivateAmount';
import ErrorBoundary from '../components/ErrorBoundary';
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
  quickRangeToDates, QUICK_RANGE_LABELS, TYPE_LABELS, safeAmount, safeNum,
  type QuickRange,
} from './bankTimelineFilters';
import { presentTransaction, CONFIDENCE_LABELS } from './bankTransactionPresentation';
import { formatCurrency, formatNumber } from '../lib/format';
import { formatDate } from '../lib/date';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import './BankAccountExplorer.css';

// ── Constants (mirrors BankReconciliation patterns) ────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(v: number | null | undefined): string {
  if (v == null) return '—';
  return formatNumber(v);
}

// Canonical DD/MM/YYYY (English digits) via the shared formatter.
function fmtDate(iso: string | null | undefined): string {
  return formatDate(iso);
}

function fmtMonth(ym: string): string {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return isNaN(d.getTime()) ? ym : d.toLocaleDateString('ar-KW', { year: 'numeric', month: 'long' });
}

function exportTimelineCsv(
  transactions: TimelineTransaction[],
  bankName: string,
  accountKey: string,
): void {
  const headers = ['التاريخ', 'الوصف', 'المرجع', 'مدين', 'دائن', 'الرصيد', 'النوع', 'الدفعة'];
  const rows = transactions.map((t) => [
    t.statementDate ?? '',
    `"${t.description.replace(/"/g, '""')}"`,
    t.reference ?? '',
    t.debit  > 0 ? t.debit.toFixed(3)  : '',
    t.credit > 0 ? t.credit.toFixed(3) : '',
    t.balance != null ? t.balance.toFixed(3) : '',
    t.bankFeeType ? (CAT_LABELS[t.bankFeeType] ?? t.bankFeeType) : '',
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
function txTypeBadge(t: TimelineTransaction): TxBadge {
  if (t.bankFeeType === 'BANK_TRANSFER') return { kind: 'transfer', label: 'تحويل' };
  if (t.chequeNumber || t.bankFeeType === 'CHEQUE_PAYMENT') return { kind: 'cheque', label: 'شيك' };
  if (t.isBankFee) return { kind: 'fee', label: 'رسوم' };
  if (safeNum(t.credit) > 0) return { kind: 'deposit', label: 'إيداع' };
  return { kind: 'withdrawal', label: 'سحب' };
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
      {copied ? 'تم النسخ' : label}
    </button>
  );
}

// ── Collapsible long description (banking-app style) ───────────────────────────

function CollapsibleDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 90;
  return (
    <div className="bae-collapsible-desc">
      <span className={expanded || !isLong ? '' : 'bae-desc-clamp'}>{text}</span>
      {isLong && (
        <button type="button" className="bae-desc-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'عرض أقل' : 'عرض المزيد'}
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
          ? formatCurrency(p.value)
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
    daysSinceLast < 7    ? 'محدّث' :
    daysSinceLast < 30   ? `${daysSinceLast} يوم` :
    `${Math.floor(daysSinceLast / 30)} أشهر`;

  const avgMonthlyTx = monthCount > 0
    ? Math.round(dashboard.transactionCount / monthCount)
    : dashboard.transactionCount;

  return (
    <div className="bae-health-card">
      <h4 className="bae-health-title">
        <span className="material-symbols-outlined">monitor_heart</span>
        صحة الحساب وتغطية البيانات
      </h4>
      <div className="bae-health-grid">
        <div className="bae-health-item">
          <span className="bae-health-label">مدة التغطية</span>
          <span className="bae-health-value">{monthCount > 0 ? `${monthCount} شهر` : '—'}</span>
        </div>
        <div className="bae-health-item">
          <span className="bae-health-label">دفعات الاستيراد</span>
          <span className="bae-health-value">{dashboard.importCount}</span>
        </div>
        <div className="bae-health-item">
          <span className="bae-health-label">متوسط العمليات / شهر</span>
          <span className="bae-health-value">{avgMonthlyTx.toLocaleString()}</span>
        </div>
        <div className="bae-health-item">
          <span className="bae-health-label">عمليات الإيداع</span>
          <span className="bae-health-value good">{dashboard.depositCount.toLocaleString()}</span>
        </div>
        <div className="bae-health-item">
          <span className="bae-health-label">عمليات السحب</span>
          <span className="bae-health-value">{dashboard.withdrawalCount.toLocaleString()}</span>
        </div>
        <div className="bae-health-item">
          <span className="bae-health-label">حداثة البيانات</span>
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
function accountIdInfo(accountKey: string): { label: string; value: string } | null {
  if (accountKey.startsWith('IBAN:')) return { label: 'IBAN', value: accountKey.slice(5) };
  if (accountKey.startsWith('ACCT:')) return { label: 'رقم الحساب', value: accountKey.slice(5).replace(/:/g, ' · ') };
  if (accountKey.startsWith('BANK:')) return { label: 'الحساب', value: accountKey.slice(5) };
  return accountKey ? { label: 'الحساب', value: accountKey } : null;
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
  const d = dashboard;
  const idInfo = accountIdInfo(accountKey);

  return (
    <div className="bae-exec-header">
      <button type="button" className="bae-back-btn" onClick={onBack} aria-label="رجوع">
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
            <span className="bae-exec-meta-k">العملة</span>
            <span className="bae-exec-meta-v">KWD</span>
          </div>
          <div className="bae-exec-meta-cell">
            <span className="bae-exec-meta-k">الحالة</span>
            <span className="bae-exec-status">
              <span className="bae-status-dot" />
              نشط
            </span>
          </div>
          {d.coverageEnd && (
            <div className="bae-exec-meta-cell">
              <span className="bae-exec-meta-k">آخر استيراد</span>
              <span className="bae-exec-meta-v">{fmtDate(d.coverageEnd)}</span>
            </div>
          )}
          <div className="bae-exec-meta-cell">
            <span className="bae-exec-meta-k">عدد الكشوف</span>
            <span className="bae-exec-meta-v">{d.importCount.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bae-exec-actions">
        <button type="button" className="btn bae-exec-add" onClick={onAddStatement}>
          <span className="material-symbols-outlined">upload_file</span>
          إضافة كشف
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
          <span className="bae-balance-hero-label">الرصيد الحالي</span>
          <div className="bae-balance-hero-value">
            <PrivateAmount value={d.currentBalance ?? 0} />
          </div>
          <span className={`bae-balance-hero-pill bae-balance-hero-pill--${netVariant}`}>
            <span className="material-symbols-outlined">
              {netVariant === 'green' ? 'trending_up' : 'trending_down'}
            </span>
            {safeNum(d.netCashFlow) >= 0 ? '+' : ''}{formatCurrency(d.netCashFlow)} · صافي التدفق
          </span>
        </div>
      </div>

      {/* Movement + activity metrics — stat tiles */}
      <div className="bae-kpi-grid bae-kpi-grid--secondary">
        <KpiCard
          label="إجمالي الإيداعات"
          value={fmtAmount(d.totalDeposits)}
          unit="KWD"
          icon="south_west"
          colorVariant="green"
          sub={`${d.depositCount.toLocaleString()} عملية`}
        />
        <KpiCard
          label="إجمالي السحوبات"
          value={fmtAmount(d.totalWithdrawals)}
          unit="KWD"
          icon="north_east"
          colorVariant="red"
          sub={`${d.withdrawalCount.toLocaleString()} عملية`}
        />
        <KpiCard
          label="صافي الحركة"
          value={fmtAmount(d.netCashFlow)}
          unit="KWD"
          icon="insights"
          colorVariant={netVariant}
          sub="صافي التدفق النقدي"
        />
        <KpiCard
          label="عدد العمليات"
          value={d.transactionCount.toLocaleString()}
          icon="receipt_long"
          colorVariant="indigo"
          sub="عملية"
        />
        <KpiCard
          label="عدد الكشوف"
          value={d.importCount.toLocaleString()}
          icon="description"
          colorVariant="orange"
          sub="كشوف مستوردة"
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

const DRAWER_TITLE_ID = 'bae-drawer-title';

// Information-Hub tabs (Phase v2). Each surfaces only the data that exists on the
// transaction — unavailable fields are hidden, never faked (graceful degradation).
type DrawerTab = 'basic' | 'financial' | 'import' | 'audit' | 'attachments';

const DRAWER_TABS: { key: DrawerTab; label: string; icon: string }[] = [
  { key: 'basic',       label: 'البيانات الأساسية', icon: 'article' },
  { key: 'financial',   label: 'المالية',           icon: 'account_balance' },
  { key: 'import',      label: 'الاستيراد',         icon: 'upload_file' },
  { key: 'audit',       label: 'التدقيق',           icon: 'verified' },
  { key: 'attachments', label: 'المرفقات',          icon: 'attach_file' },
];

function TransactionDrawer({
  tx,
  onClose,
}: {
  tx:      TimelineTransaction;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('basic');

  // Escape-to-close, focus-into-drawer on open, focus-return on close, scroll lock,
  // and a Tab focus trap that keeps keyboard focus inside the dialog (Phase E a11y).
  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel?.focus();

    const focusable = (): HTMLElement[] => Array.from(
      panel?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key === 'Tab') {
        const items = focusable();
        if (items.length === 0) { e.preventDefault(); panel?.focus(); return; }
        const first = items[0];
        const last  = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const badge      = txTypeBadge(tx);
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

  // Smart presentation (display-only): structured category + safe detail. The raw
  // bank text is still shown below when it carries more than the category label.
  const pres      = presentTransaction(tx);
  const rawIsExtra = pres.raw.length > 0 && pres.raw !== pres.category.label;

  return (
    <>
      <div className="bae-drawer-overlay" onClick={onClose} />
      <div
        className="bae-drawer"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={DRAWER_TITLE_ID}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="bae-drawer-header">
          <div className="bae-drawer-header-id">
            <h3 className="bae-drawer-title" id={DRAWER_TITLE_ID}>تفاصيل العملية</h3>
            <div className="bae-drawer-header-sub">
              <span className="bae-drawer-txid mono">رقم العملية #{tx.id}</span>
              <span className={`bae-tx-badge bae-tx-badge--${badge.kind}`}>{badge.label}</span>
            </div>
          </div>
          <button type="button" className="bae-drawer-close" onClick={onClose} aria-label="إغلاق">
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
              <div className={`bae-drawer-hero-amount ${isIncoming ? 'bae-credit' : 'bae-debit'}`}>
                {isIncoming ? '+' : '−'}{formatNumber(heroAmount)} <span className="bae-drawer-hero-cur">KWD</span>
              </div>
              {hasBalance && (
                <div className="bae-drawer-hero-balance">
                  الرصيد بعد العملية <strong>{formatCurrency(afterBalance)}</strong>
                </div>
              )}
            </div>
          </div>

          {/* ── Information-Hub tab bar ── */}
          <div className="bae-drawer-tabs" role="tablist" aria-label="أقسام تفاصيل العملية">
            {DRAWER_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={drawerTab === t.key ? 'true' : 'false'}
                className={`bae-drawer-tab${drawerTab === t.key ? ' active' : ''}`}
                onClick={() => setDrawerTab(t.key)}
              >
                <span className="material-symbols-outlined">{t.icon}</span>
                <span className="bae-drawer-tab-label">{t.label}</span>
              </button>
            ))}
          </div>

          {/* ── Tab panels ── */}
          <div className="bae-drawer-panel" role="tabpanel">
            {/* Basic */}
            {drawerTab === 'basic' && (
              <>
                <section className="bae-drawer-section">
                  <div className="bae-drawer-section-title">معلومات العملية</div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">التاريخ</span>
                    <span className="bae-drawer-field-value">{fmtDate(tx.statementDate)}</span>
                  </div>
                  {tx.postingDate && tx.postingDate !== tx.statementDate && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">تاريخ الترحيل</span>
                      <span className="bae-drawer-field-value">{fmtDate(tx.postingDate)}</span>
                    </div>
                  )}
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">نوع العملية</span>
                    <span className={`bae-tx-badge bae-tx-badge--${badge.kind}`}>{badge.label}</span>
                  </div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">العملة</span>
                    <span className="bae-drawer-field-value">{tx.currency}</span>
                  </div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">الحالة</span>
                    <span className={`bae-status-badge bae-status-badge--${reconcileClass}`}>
                      {RECONCILE_LABELS[tx.reconcileStatus] ?? tx.reconcileStatus}
                    </span>
                  </div>
                  {tx.reference && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">المرجع</span>
                      <span className="bae-drawer-field-value mono">{tx.reference}</span>
                    </div>
                  )}
                  {tx.chequeNumber && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">رقم الشيك</span>
                      <span className="bae-drawer-field-value mono">{tx.chequeNumber}</span>
                    </div>
                  )}
                </section>

                <section className="bae-drawer-section">
                  <div className="bae-drawer-section-title">الوصف</div>
                  <div className="bae-drawer-desc">
                    <span className="bae-drawer-desc-primary">{pres.category.label}</span>
                    {pres.detail && (
                      <span className="bae-drawer-desc-secondary">{pres.detail.text}</span>
                    )}
                  </div>
                  {rawIsExtra && (
                    <div className="bae-drawer-desc-raw">
                      <span className="bae-drawer-desc-raw-label">النص الأصلي</span>
                      <CollapsibleDescription text={tx.description} />
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Financial */}
            {drawerTab === 'financial' && (
              <section className="bae-drawer-section">
                <div className="bae-drawer-section-title">التدفق المالي</div>
                {credit > 0 && (
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">دائن (إيداع)</span>
                    <span className="bae-drawer-field-value bae-credit">+{formatNumber(credit)}</span>
                  </div>
                )}
                {debit > 0 && (
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">مدين (سحب)</span>
                    <span className="bae-drawer-field-value bae-debit">−{formatNumber(debit)}</span>
                  </div>
                )}
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">الأثر على الرصيد</span>
                  <span className={`bae-drawer-field-value ${impactClass}`}>
                    {impact >= 0 ? '+' : '−'}{formatNumber(Math.abs(impact))}
                  </span>
                </div>
                {hasBalance && (
                  <>
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">الرصيد قبل العملية</span>
                      <span className="bae-drawer-field-value">{formatNumber(beforeBalance)}</span>
                    </div>
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">الرصيد بعد العملية</span>
                      <span className="bae-drawer-field-value bae-drawer-primary">{formatNumber(afterBalance)}</span>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Import */}
            {drawerTab === 'import' && (
              <section className="bae-drawer-section">
                <div className="bae-drawer-section-title">بيانات الاستيراد</div>
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">الدفعة</span>
                  <span className="bae-drawer-field-value">{tx.importBatchLabel}</span>
                </div>
                <div className="bae-drawer-field bae-drawer-field--col">
                  <span className="bae-drawer-field-label">اسم الملف</span>
                  <span className="bae-drawer-field-value mono">{tx.fileName}</span>
                </div>
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">تاريخ الكشف</span>
                  <span className="bae-drawer-field-value">{fmtDate(tx.statementDate)}</span>
                </div>
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">تاريخ الاستيراد</span>
                  <span className="bae-drawer-field-value">{fmtDate(tx.importedAt)}</span>
                </div>
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">البنك</span>
                  <span className="bae-drawer-field-value">{tx.bankName}</span>
                </div>
                {(tx.isDuplicate || tx.isBankFee) && (
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">ملاحظات</span>
                    <span className="bae-drawer-flags">
                      {tx.isDuplicate && <span className="bae-status-badge bae-status-badge--warn">مكررة محتملة</span>}
                      {tx.isBankFee   && <span className="bae-status-badge bae-status-badge--neutral">رسوم بنكية</span>}
                    </span>
                  </div>
                )}
              </section>
            )}

            {/* Audit */}
            {drawerTab === 'audit' && (
              <>
                <section className="bae-drawer-section">
                  <div className="bae-drawer-section-title">التدقيق والمصدر</div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">تاريخ الإدخال</span>
                    <span className="bae-drawer-field-value">{fmtDate(tx.importedAt)}</span>
                  </div>
                  <div className="bae-drawer-field bae-drawer-field--col">
                    <span className="bae-drawer-field-label">المصدر</span>
                    <span className="bae-drawer-field-value mono">{tx.fileName}</span>
                  </div>
                  {tx.accountKey && (
                    <div className="bae-drawer-field bae-drawer-field--col">
                      <span className="bae-drawer-field-label">مفتاح الحساب</span>
                      <span className="bae-drawer-field-value mono">{tx.accountKey}</span>
                    </div>
                  )}
                  {tx.transactionFingerprint && (
                    <div className="bae-drawer-field bae-drawer-field--col">
                      <span className="bae-drawer-field-label">البصمة (Fingerprint · SHA-256)</span>
                      <span className="bae-drawer-field-value mono bae-drawer-fingerprint">
                        {tx.transactionFingerprint}
                      </span>
                    </div>
                  )}
                </section>

                {/* Smart-presentation provenance (how the display label was derived) */}
                <section className="bae-drawer-section">
                  <div className="bae-drawer-section-title">التصنيف الذكي (كيفية العرض)</div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">التصنيف</span>
                    <span className="bae-drawer-field-value">{pres.category.label}</span>
                  </div>
                  <div className="bae-drawer-field">
                    <span className="bae-drawer-field-label">مستوى الثقة</span>
                    <span className="bae-drawer-field-value">{CONFIDENCE_LABELS[pres.category.confidence]}</span>
                  </div>
                  <div className="bae-drawer-field bae-drawer-field--col">
                    <span className="bae-drawer-field-label">القاعدة المطبَّقة</span>
                    <span className="bae-drawer-field-value mono">{pres.provenance.rule}</span>
                  </div>
                  {pres.provenance.matchedOn && (
                    <div className="bae-drawer-field bae-drawer-field--col">
                      <span className="bae-drawer-field-label">المصدر المطابق</span>
                      <span className="bae-drawer-field-value mono">{pres.provenance.matchedOn}</span>
                    </div>
                  )}
                  {pres.detail && (
                    <div className="bae-drawer-field">
                      <span className="bae-drawer-field-label">التفصيل المعروض</span>
                      <span className="bae-drawer-field-value">
                        {pres.detail.text}
                        <span className="bae-drawer-txid"> · {CONFIDENCE_LABELS[pres.detail.confidence]}</span>
                      </span>
                    </div>
                  )}
                  {pres.raw && (
                    <div className="bae-drawer-field bae-drawer-field--col">
                      <span className="bae-drawer-field-label">النص الأصلي (كما ورد من البنك)</span>
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
                <p className="bae-drawer-empty-title">لا توجد مرفقات</p>
                <p className="bae-drawer-empty-msg">إرفاق المستندات بعمليات كشف الحساب غير مُفعّل حالياً.</p>
              </div>
            )}
          </div>

          {/* ── Quick balance-flow summary (before → amount → after) ── */}
          {hasBalance && (
            <div className="bae-drawer-summary">
              <div className="bae-drawer-summary-title">ملخص سريع</div>
              <div className="bae-drawer-summary-flow">
                <div className="bae-drawer-summary-cell">
                  <span className="bae-drawer-summary-label">الرصيد قبل العملية</span>
                  <span className="bae-drawer-summary-value">{formatNumber(beforeBalance)}<span className="bae-drawer-summary-cur">KWD</span></span>
                </div>
                <span className="bae-drawer-summary-arrow material-symbols-outlined" aria-hidden="true">arrow_back</span>
                <div className="bae-drawer-summary-cell">
                  <span className="bae-drawer-summary-label">المبلغ</span>
                  <span className={`bae-drawer-summary-value ${isIncoming ? 'bae-credit' : 'bae-debit'}`}>
                    {isIncoming ? '+' : '−'}{formatNumber(heroAmount)}<span className="bae-drawer-summary-cur">KWD</span>
                  </span>
                </div>
                <span className="bae-drawer-summary-arrow material-symbols-outlined" aria-hidden="true">arrow_back</span>
                <div className="bae-drawer-summary-cell">
                  <span className="bae-drawer-summary-label">الرصيد بعد العملية</span>
                  <span className="bae-drawer-summary-value bae-drawer-primary">{formatNumber(afterBalance)}<span className="bae-drawer-summary-cur">KWD</span></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="bae-drawer-footer">
          {tx.reference && <CopyButton value={tx.reference} label="نسخ المرجع" />}
          {tx.transactionFingerprint && <CopyButton value={tx.transactionFingerprint} label="نسخ البصمة" />}
          <button type="button" className="btn bae-drawer-close-btn" onClick={onClose}>إغلاق</button>
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
      .catch((e) => { if (!cancelled) setError(errorMessage(e) || 'فشل تحميل الحركات'); })
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
    chips.push({ key: 'search', label: `بحث: «${filters.search}»`, onRemove: () => onSearchInput('') });
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
    chips.push({ key: 'min', label: `من ${filters.minAmount}`, onRemove: () => { setMinInput(''); patchFilters({ minAmount: undefined }); } });
  }
  if (filters.maxAmount != null) {
    chips.push({ key: 'max', label: `إلى ${filters.maxAmount}`, onRemove: () => { setMaxInput(''); patchFilters({ maxAmount: undefined }); } });
  }

  const openDrawer = (t: TimelineTransaction) => setDrawerTx(t);

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
              placeholder="بحث في الوصف أو المرجع…"
              value={searchInput}
              onChange={(e) => onSearchInput(e.target.value)}
            />
            {searchInput && (
              <button type="button" className="bae-clear-btn" onClick={() => onSearchInput('')} aria-label="مسح البحث">
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
          </div>
          <div className="bae-filter-actions">
            {hasActiveFilters && (
              <button type="button" className="btn secondary bae-clear-filters-inline" onClick={clearAllFilters} title="مسح جميع الفلاتر">
                <span className="material-symbols-outlined">filter_alt_off</span>
                مسح
              </button>
            )}
            <button type="button" className="btn secondary bae-icon-btn" onClick={refresh} title="تحديث" aria-label="تحديث">
              <span className="material-symbols-outlined">refresh</span>
            </button>
            <button
              type="button"
              className="btn secondary bae-export-btn"
              onClick={() => shown > 0 && result && exportTimelineCsv(result.transactions, bankName, accountKey)}
              disabled={shown === 0}
              title="تصدير الصفحة الحالية"
            >
              <span className="material-symbols-outlined">download</span>
              تصدير CSV
            </button>
          </div>
        </div>

        {/* Grouped controls: Type · Period · Amount (RTL: right → left) */}
        <div className="bae-filter-groups">
          <div className="bae-filter-group">
            <span className="bae-filter-group-label">
              <span className="material-symbols-outlined">category</span>
              نوع المعاملة
            </span>
            <div className="bae-type-group" role="group" aria-label="نوع المعاملة">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`bae-chip-btn${(filters.type ?? 'all') === t ? ' active' : ''}`}
                  onClick={() => patchFilters({ type: t })}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="bae-filter-group">
            <span className="bae-filter-group-label">
              <span className="material-symbols-outlined">calendar_month</span>
              الفترة
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
              <input
                className="bae-date-input"
                type="date"
                value={filters.fromDate ?? ''}
                onChange={(e) => onDateChange('from', e.target.value)}
                title="من تاريخ"
                aria-label="من تاريخ"
              />
              <span className="bae-range-sep" aria-hidden="true">—</span>
              <input
                className="bae-date-input"
                type="date"
                value={filters.toDate ?? ''}
                onChange={(e) => onDateChange('to', e.target.value)}
                title="إلى تاريخ"
                aria-label="إلى تاريخ"
              />
            </div>
          </div>

          <div className="bae-filter-group">
            <span className="bae-filter-group-label">
              <span className="material-symbols-outlined">payments</span>
              نطاق المبلغ (KWD)
            </span>
            <div className="bae-amount-range">
              <input
                className="bae-amount-input"
                type="number"
                min="0"
                step="0.001"
                placeholder="من مبلغ"
                value={minInput}
                onChange={(e) => onAmountInput('min', e.target.value)}
                aria-label="من مبلغ"
              />
              <span className="bae-range-sep" aria-hidden="true">—</span>
              <input
                className="bae-amount-input"
                type="number"
                min="0"
                step="0.001"
                placeholder="إلى مبلغ"
                value={maxInput}
                onChange={(e) => onAmountInput('max', e.target.value)}
                aria-label="إلى مبلغ"
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
                  <button type="button" onClick={c.onRemove} aria-label={`إزالة ${c.label}`}>
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </span>
              ))}
              {chips.length > 0 && (
                <button type="button" className="bae-clear-all-link" onClick={clearAllFilters}>
                  مسح الكل
                </button>
              )}
            </div>
            {result && (
              <span className="bae-result-count">
                {total.toLocaleString()} نتيجة
                {result.fromDate && <> · {fmtDate(result.fromDate)} — {fmtDate(result.toDate)}</>}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="bae-skeleton-table" aria-busy="true" aria-label="جارٍ التحميل">
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
          <button type="button" className="btn secondary" onClick={refresh}>إعادة المحاولة</button>
        </div>
      )}

      {/* Filtered empty state */}
      {!loading && !error && result && shown === 0 && hasActiveFilters && (
        <div className="bae-empty-state">
          <div className="bae-empty-illus bae-empty-illus--lg"><span className="material-symbols-outlined">filter_alt_off</span></div>
          <h3>لا توجد معاملات مطابقة</h3>
          <p className="bae-empty-msg">لم نعثر على أي معاملة تطابق الفلاتر الحالية. جرّب توسيع نطاق التاريخ، أو تغيير نوع المعاملة، أو مسح الفلاتر النشطة.</p>
          <button type="button" className="btn bae-clear-filters-btn" onClick={clearAllFilters}>
            <span className="material-symbols-outlined">filter_alt_off</span>
            مسح جميع الفلاتر
          </button>
        </div>
      )}

      {/* Unfiltered empty state */}
      {!loading && !error && result && shown === 0 && !hasActiveFilters && (
        <div className="bae-empty-state">
          <div className="bae-empty-illus bae-empty-illus--lg"><span className="material-symbols-outlined">receipt_long</span></div>
          <h3>لا توجد معاملات في هذا الحساب</h3>
          <p className="bae-empty-msg">لم يتم استيراد أي معاملات لهذا الحساب بعد. أضف كشف حساب بنكي لبدء استعراض السجل الزمني للعمليات.</p>
          <button type="button" className="btn secondary" onClick={refresh}>
            <span className="material-symbols-outlined">refresh</span>
            تحديث
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
                  <th className="bae-col-op">العملية</th>
                  <th className="bae-col-date">التاريخ</th>
                  <th className="bae-col-type">النوع</th>
                  <th className="bae-col-desc-main">الوصف</th>
                  <th className="bae-col-amount">المبلغ (KWD)</th>
                  <th className="bae-col-balance">الرصيد بعد العملية</th>
                  <th className="bae-col-chevron" aria-label="فتح" />
                </tr>
              </thead>
              <tbody>
                {result.transactions.map((t) => {
                  const isDeposit  = safeNum(t.credit) > 0;
                  const isSelected = drawerTx?.id === t.id;
                  const badge      = txTypeBadge(t);
                  const pres       = presentTransaction(t);
                  const amount     = isDeposit ? safeNum(t.credit) : safeNum(t.debit);
                  const statusClass = t.reconcileStatus === 'MATCHED' ? 'good'
                    : t.reconcileStatus === 'UNMATCHED' ? 'warn' : 'neutral';
                  const rowClass = [
                    t.isBankFee ? 'bae-row-fee' : '',
                    isSelected ? 'bae-row-selected' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <tr
                      key={t.id}
                      className={rowClass}
                      onClick={() => openDrawer(t)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(t); }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`تفاصيل معاملة ${t.description}`}
                    >
                      {/* Operation: type icon + reconcile status dot */}
                      <td className="bae-col-op">
                        <span className="bae-op-cell">
                          <span className={`bae-tx-icon bae-tx-icon--${badge.kind}`}>
                            <span className="material-symbols-outlined">{TX_ICONS[badge.kind]}</span>
                          </span>
                          <span
                            className={`bae-status-dot-cell bae-status-dot-cell--${statusClass}`}
                            title={RECONCILE_LABELS[t.reconcileStatus] ?? t.reconcileStatus}
                          />
                        </span>
                      </td>
                      <td className="bae-col-date">{fmtDate(t.statementDate)}</td>
                      <td className="bae-col-type">
                        <span className={`bae-tx-badge bae-tx-badge--${badge.kind}`}>{badge.label}</span>
                      </td>
                      {/* Description: structured category (line 1) + safe detail (line 2) */}
                      <td className="bae-col-desc-main">
                        <span className="bae-tx-cell-text">
                          <span className="bae-tx-desc" title={t.description}>{pres.category.label}</span>
                          {pres.detail && (
                            <span className="bae-tx-sub" title={pres.detail.text}>{pres.detail.text}</span>
                          )}
                        </span>
                      </td>
                      <td className="bae-col-amount">
                        <span className={isDeposit ? 'bae-credit' : 'bae-debit'}>
                          {isDeposit ? '+' : '−'}{formatNumber(amount)}
                        </span>
                      </td>
                      <td className="bae-col-balance">
                        {t.balance != null ? formatNumber(safeNum(t.balance)) : '—'}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bae-pagination">
              <button
                type="button"
                className="btn secondary bae-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                السابق
              </button>
              <span className="bae-page-info">صفحة {page} من {totalPages}</span>
              <button
                type="button"
                className="btn secondary bae-page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                التالي
              </button>
            </div>
          )}
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
    { name: 'إجمالي الإيداعات', value: safeAmount(dashboard.totalDeposits) },
    { name: 'إجمالي السحوبات',  value: safeAmount(dashboard.totalWithdrawals) },
  ].filter((d) => d.value > 0), [dashboard.totalDeposits, dashboard.totalWithdrawals]);

  if (monthly.length === 0) {
    return (
      <div className="bae-tab-content bae-empty-state">
        <div className="bae-empty-illus"><span className="material-symbols-outlined">bar_chart</span></div>
        <h3>لا توجد بيانات كافية للتحليلات</h3>
        <p>أضف كشف حساب بنكي يحتوي على معاملات لعرض الرسوم البيانية والتحليلات.</p>
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
          الرصيد التراكمي عبر الزمن
        </h4>
        <div className="bae-chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={balanceData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              {xAxis}
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="الرصيد" stroke="#6366f1" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Deposits vs withdrawals */}
      <div className="bae-chart-section">
        <h4 className="bae-section-title">
          <span className="material-symbols-outlined">bar_chart</span>
          التدفق الشهري — إيداعات مقابل سحوبات
        </h4>
        <div className="bae-chart-wrap">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={flowData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              {xAxis}
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontFamily: ARABIC_FONT, fontSize: 12, direction: 'rtl' }} />
              <Bar dataKey="إيداعات" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="سحوبات"  fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two-up: frequency + distribution */}
      <div className="bae-chart-duo">
        <div className="bae-chart-section">
          <h4 className="bae-section-title">
            <span className="material-symbols-outlined">insights</span>
            عدد العمليات شهرياً
          </h4>
          <div className="bae-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={freqData} margin={{ top: 5, right: 16, left: 6, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                {xAxis}
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="عمليات" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {pieData.length > 0 && (
          <div className="bae-chart-section">
            <h4 className="bae-section-title">
              <span className="material-symbols-outlined">donut_large</span>
              توزيع التدفق النقدي
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
              أعلى الإيداعات
            </h4>
            <table className="bae-top-table">
              <thead><tr><th>التاريخ</th><th>الوصف</th><th>المبلغ</th></tr></thead>
              <tbody>
                {topDeposits.map((t) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.statementDate)}</td>
                    <td className="bae-desc-cell" title={t.description}>{t.description}</td>
                    <td className="bae-amount-green">{fmtAmount(safeNum(t.amount))}</td>
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
              أعلى السحوبات
            </h4>
            <table className="bae-top-table">
              <thead><tr><th>التاريخ</th><th>الوصف</th><th>المبلغ</th></tr></thead>
              <tbody>
                {topWithdrawals.map((t) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.statementDate)}</td>
                    <td className="bae-desc-cell" title={t.description}>{t.description}</td>
                    <td className="bae-amount-red">{fmtAmount(safeNum(t.amount))}</td>
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
          تفاصيل شهرية
        </h4>
        <div className="bae-monthly-scroll">
          <table className="bae-top-table">
            <thead>
              <tr>
                <th>الشهر</th><th>إيداعات</th><th>أكبر إيداع</th>
                <th>سحوبات</th><th>أكبر سحب</th><th>صافي</th><th>عمليات</th>
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
  const [imports, setImports]   = useState<ImportListItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listImports(1, 200)
      .then((r) => {
        // Filter to this account
        const filtered = r.items.filter((i) => i.accountKey === accountKey);
        setImports(filtered);
      })
      .catch((e) => setError(errorMessage(e) || 'فشل تحميل الدفعات'))
      .finally(() => setLoading(false));
  }, [accountKey]);

  return (
    <div className="bae-tab-content">
      {loading && <div className="bae-loading"><span className="spinner" /> جارٍ التحميل…</div>}
      {!loading && error && <div className="bae-error">{error}</div>}
      {!loading && !error && imports.length === 0 && (
        <div className="bae-empty-state">
          <span className="material-symbols-outlined">upload_file</span>
          <p>لا توجد دفعات استيراد لهذا الحساب.</p>
        </div>
      )}
      {!loading && !error && imports.length > 0 && (
        <>
          <p className="bae-imports-count">{imports.length} دفعة استيراد</p>
          <div className="bae-table-wrap">
            <table className="bae-timeline-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الملف</th>
                  <th>من تاريخ</th>
                  <th>إلى تاريخ</th>
                  <th>الصفوف</th>
                  <th>إيداعات</th>
                  <th>سحوبات</th>
                  <th>مستورد بواسطة</th>
                  <th>تاريخ الاستيراد</th>
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
      exportTimelineCsv(all, bankName, accountKey);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e) || 'فشل التصدير');
    } finally {
      setLoading(false);
    }
  }, [accountKey, bankName, dashboard.transactionCount]);

  return (
    <div className="bae-tab-content bae-export-tab">
      <div className="bae-export-card">
        <span className="material-symbols-outlined bae-export-icon">download</span>
        <h3>تصدير بيانات الحساب</h3>
        <p>
          تصدير {dashboard.transactionCount.toLocaleString()} معاملة لحساب{' '}
          <strong>{bankName}</strong> بصيغة CSV.
        </p>
        {dashboard.coverageStart && (
          <p className="bae-export-range">
            الفترة: {fmtDate(dashboard.coverageStart)} — {fmtDate(dashboard.coverageEnd)}
          </p>
        )}
        <button
          type="button"
          className="btn bae-export-btn-main"
          onClick={handleExportAll}
          disabled={loading || dashboard.transactionCount === 0}
        >
          {loading
            ? <><span className="spinner bae-btn-spinner" />  جارٍ التصدير…</>
            : <><span className="material-symbols-outlined">download</span> تصدير CSV</>}
        </button>
        {done && (
          <p className="bae-export-done">
            <span className="material-symbols-outlined">check_circle</span>
            تم تصدير الملف بنجاح
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
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'timeline',   label: 'السجل الزمني',    icon: 'receipt_long' },
  { key: 'analytics',  label: 'التحليلات',       icon: 'bar_chart' },
  { key: 'imports',    label: 'دفعات الاستيراد', icon: 'upload_file' },
  { key: 'export',     label: 'تصدير',           icon: 'download' },
];

export default function BankAccountExplorer() {
  const { accountKey: rawKey } = useParams<{ accountKey: string }>();
  const navigate               = useNavigate();
  const { hasPermission }      = useAuth();

  const accountKey = rawKey ? decodeURIComponent(rawKey) : '';

  const [tab, setTab]             = useState<Tab>('timeline');
  const [dashboard, setDashboard] = useState<BankAccountDashboard | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const canView = hasPermission('bankStatementImport.read');

  const loadDashboard = useCallback(() => {
    if (!accountKey || !canView) return;
    setLoading(true);
    setError(null);
    getBankAccountDashboard(accountKey)
      .then(setDashboard)
      .catch((e) => setError(errorMessage(e) || 'فشل تحميل بيانات الحساب'))
      .finally(() => setLoading(false));
  }, [accountKey, canView]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (!canView) {
    return (
      <div className="bae-permission-error" dir="rtl">
        <span className="material-symbols-outlined">lock</span>
        <p>ليس لديك صلاحية لعرض بيانات الحساب البنكي.</p>
      </div>
    );
  }

  return (
    <div className="bae-root" dir="rtl">
      {/* ── Page title + breadcrumb ── */}
      <div className="bae-page-head">
        <nav className="bae-breadcrumb" aria-label="مسار التنقل">
          <button type="button" onClick={() => navigate('/')}>الرئيسية</button>
          <span className="bae-breadcrumb-sep" aria-hidden="true">/</span>
          <button type="button" onClick={() => navigate('/bank-accounts')}>الحسابات البنكية</button>
          <span className="bae-breadcrumb-sep" aria-hidden="true">/</span>
          <span className="bae-breadcrumb-current" aria-current="page">مستعرض الحسابات</span>
        </nav>
        <h1 className="bae-page-title">
          <span className="material-symbols-outlined">account_balance</span>
          مستعرض الحسابات البنكية
        </h1>
      </div>

      {/* ── Loading skeleton for the whole shell ── */}
      {loading && (
        <div className="bae-loading-center">
          <span className="spinner" />
          <span>جارٍ تحميل بيانات الحساب…</span>
        </div>
      )}

      {!loading && error && (
        <div className="bae-error-center">
          <span className="material-symbols-outlined">error_outline</span>
          <p>{error}</p>
          <button type="button" className="btn secondary" onClick={loadDashboard}>إعادة المحاولة</button>
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
            {TABS.map((t) => (
              <button
                type="button"
                key={t.key}
                role="tab"
                aria-selected={tab === t.key ? 'true' : 'false'}
                className={`bae-tab-btn${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <span className="material-symbols-outlined bae-tab-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          <ErrorBoundary
            resetKey={tab}
            onReset={() => setTab('timeline')}
            resetLabel="العودة للسجل الزمني"
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
