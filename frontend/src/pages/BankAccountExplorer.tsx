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
  return v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ar-KW');
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
  const today = new Date().toISOString().substring(0, 10);
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `bank-account-${slug}-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
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
          ? p.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
          : p.value}
      </p>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon, colorVariant, sub, isPrimary,
}: {
  label:         string;
  value:         string;
  icon:          string;
  colorVariant?: 'green' | 'red' | 'blue';
  sub?:          string;
  isPrimary?:    boolean;
}) {
  const cls = [
    'bae-kpi-card',
    colorVariant ? `bae-kpi-card--${colorVariant}` : '',
    isPrimary    ? 'bae-kpi-card--primary'          : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="bae-kpi-icon">
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div className="bae-kpi-body">
        <span className="bae-kpi-label">{label}</span>
        <span className="bae-kpi-value">{value}</span>
        {sub && <span className="bae-kpi-sub">{sub}</span>}
      </div>
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

// ── Transaction Drawer ────────────────────────────────────────────────────────

const RECONCILE_LABELS: Record<string, string> = {
  UNMATCHED: 'غير مطابقة',
  MATCHED:   'مطابقة',
  IGNORED:   'متجاهلة',
  DUPLICATE: 'مكررة',
  REVIEW:    'قيد المراجعة',
};

const DRAWER_TITLE_ID = 'bae-drawer-title';

function TransactionDrawer({
  tx,
  onClose,
}: {
  tx:      TimelineTransaction;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape-to-close, focus-into-drawer on open, focus-return on close, scroll lock.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
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

  const hasDebit  = safeNum(tx.debit)  > 0;
  const hasCredit = safeNum(tx.credit) > 0;

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
          <h3 className="bae-drawer-title" id={DRAWER_TITLE_ID}>تفاصيل المعاملة</h3>
          <button type="button" className="bae-drawer-close" onClick={onClose} aria-label="إغلاق">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="bae-drawer-body">
          {/* Amounts */}
          <div className="bae-drawer-amounts">
            <div className="bae-drawer-amount-card">
              <div className="bae-drawer-amount-label">مدين</div>
              <div className={`bae-drawer-amount-value ${hasDebit ? 'bae-debit' : ''}`}>
                {hasDebit ? safeNum(tx.debit).toFixed(3) : '—'}
              </div>
            </div>
            <div className="bae-drawer-amount-card">
              <div className="bae-drawer-amount-label">دائن</div>
              <div className={`bae-drawer-amount-value ${hasCredit ? 'bae-credit' : ''}`}>
                {hasCredit ? safeNum(tx.credit).toFixed(3) : '—'}
              </div>
            </div>
          </div>

          {/* Balance */}
          {tx.balance != null && (
            <div className="bae-drawer-field">
              <span className="bae-drawer-field-label">الرصيد بعد العملية</span>
              <span className="bae-drawer-field-value">{safeNum(tx.balance).toFixed(3)} {tx.currency}</span>
            </div>
          )}

          <div className="bae-drawer-divider" />
          <div className="bae-drawer-section-title">بيانات المعاملة</div>

          <div className="bae-drawer-field">
            <span className="bae-drawer-field-label">تاريخ الكشف</span>
            <span className="bae-drawer-field-value">{fmtDate(tx.statementDate)}</span>
          </div>
          {tx.postingDate && tx.postingDate !== tx.statementDate && (
            <div className="bae-drawer-field">
              <span className="bae-drawer-field-label">تاريخ الترحيل</span>
              <span className="bae-drawer-field-value">{fmtDate(tx.postingDate)}</span>
            </div>
          )}
          <div className="bae-drawer-field">
            <span className="bae-drawer-field-label">الوصف</span>
            <span className="bae-drawer-field-value">{tx.description}</span>
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
          {tx.bankFeeType && (
            <div className="bae-drawer-field">
              <span className="bae-drawer-field-label">تصنيف الرسوم</span>
              <span className="bae-cat-badge">{CAT_LABELS[tx.bankFeeType] ?? tx.bankFeeType}</span>
            </div>
          )}

          <div className="bae-drawer-divider" />
          <div className="bae-drawer-section-title">جلسة الاستيراد</div>

          <div className="bae-drawer-field">
            <span className="bae-drawer-field-label">الدفعة</span>
            <span className="bae-drawer-field-value">{tx.importBatchLabel}</span>
          </div>
          <div className="bae-drawer-field">
            <span className="bae-drawer-field-label">الملف</span>
            <span className="bae-drawer-field-value mono">{tx.fileName}</span>
          </div>
          <div className="bae-drawer-field">
            <span className="bae-drawer-field-label">تاريخ الاستيراد</span>
            <span className="bae-drawer-field-value">{fmtDate(tx.importedAt)}</span>
          </div>
          <div className="bae-drawer-field">
            <span className="bae-drawer-field-label">رقم الدفعة</span>
            <span className="bae-drawer-field-value mono">#{tx.importId}</span>
          </div>

          {/* Metadata (display-only — no reconciliation workflow) */}
          <div className="bae-drawer-divider" />
          <div className="bae-drawer-section-title">بيانات إضافية</div>

          <div className="bae-drawer-field">
            <span className="bae-drawer-field-label">العملة</span>
            <span className="bae-drawer-field-value">{tx.currency}</span>
          </div>
          {tx.accountKey && (
            <div className="bae-drawer-field">
              <span className="bae-drawer-field-label">مفتاح الحساب</span>
              <span className="bae-drawer-field-value mono">{tx.accountKey}</span>
            </div>
          )}
          <div className="bae-drawer-field">
            <span className="bae-drawer-field-label">حالة المطابقة</span>
            <span className="bae-drawer-field-value">
              {RECONCILE_LABELS[tx.reconcileStatus] ?? tx.reconcileStatus}
            </span>
          </div>
          {tx.transactionFingerprint && (
            <div className="bae-drawer-field">
              <span className="bae-drawer-field-label">البصمة</span>
              <span className="bae-drawer-field-value mono bae-drawer-fingerprint">
                {tx.transactionFingerprint}
              </span>
            </div>
          )}

          {(tx.isDuplicate || tx.isBankFee) && (
            <>
              <div className="bae-drawer-divider" />
              {tx.isDuplicate && (
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">ملاحظة</span>
                  <span className="bae-drawer-field-value bae-drawer-warn">
                    معاملة مكررة محتملة
                  </span>
                </div>
              )}
              {tx.isBankFee && (
                <div className="bae-drawer-field">
                  <span className="bae-drawer-field-label">نوع الحركة</span>
                  <span className="bae-drawer-field-value bae-drawer-primary">
                    رسوم بنكية
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ dashboard }: { dashboard: BankAccountDashboard }) {
  const d = dashboard;

  const netVariant: 'green' | 'red' = d.netCashFlow >= 0 ? 'green' : 'red';

  return (
    <div className="bae-tab-content">
      {/* KPIs */}
      <div className="bae-kpi-grid">
        <KpiCard
          label="الرصيد الحالي"
          value={fmtAmount(d.currentBalance)}
          icon="account_balance_wallet"
          colorVariant="blue"
          isPrimary
        />
        <KpiCard
          label="إجمالي الإيداعات"
          value={fmtAmount(d.totalDeposits)}
          icon="trending_up"
          colorVariant="green"
          sub={`${d.depositCount} عملية — متوسط ${fmtAmount(d.avgDeposit)}`}
        />
        <KpiCard
          label="إجمالي السحوبات"
          value={fmtAmount(d.totalWithdrawals)}
          icon="trending_down"
          colorVariant="red"
          sub={`${d.withdrawalCount} عملية — متوسط ${fmtAmount(d.avgWithdrawal)}`}
        />
        <KpiCard
          label="صافي التدفق النقدي"
          value={fmtAmount(d.netCashFlow)}
          icon="swap_vert"
          colorVariant={netVariant}
        />
        <KpiCard
          label="أكبر إيداع"
          value={fmtAmount(d.largestDeposit)}
          icon="arrow_upward"
          colorVariant="green"
        />
        <KpiCard
          label="أكبر سحب"
          value={fmtAmount(d.largestWithdrawal)}
          icon="arrow_downward"
          colorVariant="red"
        />
        <KpiCard
          label="إجمالي المعاملات"
          value={d.transactionCount.toLocaleString()}
          icon="receipt_long"
        />
        <KpiCard
          label="دفعات الاستيراد"
          value={d.importCount.toString()}
          icon="upload_file"
        />
      </div>

      {/* Account Health */}
      {d.transactionCount > 0 && <AccountHealthCard dashboard={d} />}

      {/* Coverage strip */}
      {(d.coverageStart || d.coverageEnd) && (
        <div className="bae-coverage-strip">
          <span className="material-symbols-outlined bae-coverage-icon">
            date_range
          </span>
          <span>
            تغطية الكشف: <strong>{fmtDate(d.coverageStart)}</strong> — <strong>{fmtDate(d.coverageEnd)}</strong>
          </span>
          {d.openingBalance != null && (
            <span className="bae-coverage-bal">
              رصيد الافتتاح: <strong>{fmtAmount(d.openingBalance)}</strong>
            </span>
          )}
          {d.closingBalance != null && (
            <span className="bae-coverage-bal">
              رصيد الختام: <strong>{fmtAmount(d.closingBalance)}</strong>
            </span>
          )}
        </div>
      )}

      {/* Top deposits / withdrawals */}
      {d.topDeposits.length > 0 && (
        <div className="bae-top-section">
          <h4 className="bae-section-title">أعلى الإيداعات</h4>
          <table className="bae-top-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الوصف</th>
                <th>المرجع</th>
                <th>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {d.topDeposits.map((t) => (
                <tr key={t.id}>
                  <td>{fmtDate(t.statementDate)}</td>
                  <td className="bae-desc-cell" title={t.description}>{t.description}</td>
                  <td>{t.reference ?? '—'}</td>
                  <td className="bae-amount-green">{fmtAmount(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d.topWithdrawals.length > 0 && (
        <div className="bae-top-section">
          <h4 className="bae-section-title">أعلى السحوبات</h4>
          <table className="bae-top-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الوصف</th>
                <th>المرجع</th>
                <th>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {d.topWithdrawals.map((t) => (
                <tr key={t.id}>
                  <td>{fmtDate(t.statementDate)}</td>
                  <td className="bae-desc-cell" title={t.description}>{t.description}</td>
                  <td>{t.reference ?? '—'}</td>
                  <td className="bae-amount-red">{fmtAmount(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Monthly summary table */}
      {d.monthly.length > 0 && (
        <div className="bae-top-section">
          <h4 className="bae-section-title">الملخص الشهري</h4>
          <div className="bae-monthly-scroll">
            <table className="bae-top-table">
              <thead>
                <tr>
                  <th>الشهر</th>
                  <th>إيداعات</th>
                  <th>سحوبات</th>
                  <th>صافي</th>
                  <th>عدد العمليات</th>
                </tr>
              </thead>
              <tbody>
                {[...d.monthly].reverse().map((m: MonthlyEntry) => (
                  <tr key={m.month}>
                    <td>{fmtMonth(m.month)}</td>
                    <td className="bae-amount-green">{fmtAmount(m.totalDeposits)}</td>
                    <td className="bae-amount-red">{fmtAmount(m.totalWithdrawals)}</td>
                    <td className={m.netFlow >= 0 ? 'bae-amount-green' : 'bae-amount-red'}>
                      {fmtAmount(m.netFlow)}
                    </td>
                    <td>{m.txCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
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
      {/* ── Professional filter bar ── */}
      <div className="bae-filterbar">
        {/* Row 1: search + actions */}
        <div className="bae-filters-row">
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

        {/* Row 2: quick ranges */}
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

        {/* Row 3: type + dates + amount */}
        <div className="bae-filters-row bae-filters-row-wrap">
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
          <input
            className="bae-date-input"
            type="date"
            value={filters.fromDate ?? ''}
            onChange={(e) => onDateChange('from', e.target.value)}
            title="من تاريخ"
          />
          <input
            className="bae-date-input"
            type="date"
            value={filters.toDate ?? ''}
            onChange={(e) => onDateChange('to', e.target.value)}
            title="إلى تاريخ"
          />
          <input
            className="bae-amount-input"
            type="number"
            min="0"
            step="0.001"
            placeholder="من مبلغ"
            value={minInput}
            onChange={(e) => onAmountInput('min', e.target.value)}
          />
          <input
            className="bae-amount-input"
            type="number"
            min="0"
            step="0.001"
            placeholder="إلى مبلغ"
            value={maxInput}
            onChange={(e) => onAmountInput('max', e.target.value)}
          />
        </div>

        {/* Row 4: active chips + result count */}
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

      {/* Loading / error */}
      {loading && <div className="bae-loading"><span className="spinner" /> جارٍ التحميل…</div>}
      {!loading && error && (
        <div className="bae-error">
          <span>{error}</span>
          <button type="button" className="btn secondary" onClick={refresh}>إعادة المحاولة</button>
        </div>
      )}

      {/* Filtered empty state */}
      {!loading && !error && result && shown === 0 && hasActiveFilters && (
        <div className="bae-filtered-empty">
          <div className="bae-empty-illus"><span className="material-symbols-outlined">filter_alt_off</span></div>
          <h3>لا توجد معاملات مطابقة</h3>
          <p className="bae-filtered-empty-hint">جرّب توسيع نطاق التاريخ أو تغيير نوع المعاملة أو مسح الفلاتر.</p>
          <button type="button" className="btn bae-clear-filters-btn" onClick={clearAllFilters}>
            <span className="material-symbols-outlined">close</span>
            مسح جميع الفلاتر
          </button>
        </div>
      )}

      {/* Unfiltered empty state */}
      {!loading && !error && result && shown === 0 && !hasActiveFilters && (
        <div className="bae-filtered-empty">
          <div className="bae-empty-illus"><span className="material-symbols-outlined">receipt_long</span></div>
          <h3>لا توجد معاملات في هذا الحساب</h3>
        </div>
      )}

      {/* Transaction Drawer */}
      {drawerTx && <TransactionDrawer tx={drawerTx} onClose={() => setDrawerTx(null)} />}

      {/* Table */}
      {!loading && !error && result && shown > 0 && (
        <>
          <div className="bae-table-wrap">
            <table className="bae-timeline-table">
              <thead>
                <tr>
                  <th className="bae-col-dir" aria-label="الاتجاه" />
                  <th>التاريخ</th>
                  <th>الوصف</th>
                  <th>المرجع</th>
                  <th>مدين</th>
                  <th>دائن</th>
                  <th>الرصيد</th>
                  <th>النوع</th>
                  <th>الدفعة</th>
                </tr>
              </thead>
              <tbody>
                {result.transactions.map((t) => {
                  const isDeposit = safeNum(t.credit) > 0;
                  const isSelected = drawerTx?.id === t.id;
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
                      <td className="bae-col-dir">
                        <span className={`material-symbols-outlined bae-dir-icon ${isDeposit ? 'bae-dir-in' : 'bae-dir-out'}`}>
                          {isDeposit ? 'south_west' : 'north_east'}
                        </span>
                      </td>
                      <td className="bae-col-date">{fmtDate(t.statementDate)}</td>
                      <td className="bae-col-desc" title={t.description}>{t.description}</td>
                      <td className="bae-col-ref">{t.reference ?? '—'}</td>
                      <td className="bae-col-debit">
                        {safeNum(t.debit) > 0 ? <span className="bae-debit">{safeNum(t.debit).toFixed(3)}</span> : '—'}
                      </td>
                      <td className="bae-col-credit">
                        {safeNum(t.credit) > 0 ? <span className="bae-credit">{safeNum(t.credit).toFixed(3)}</span> : '—'}
                      </td>
                      <td className="bae-col-balance">
                        {t.balance != null ? safeNum(t.balance).toFixed(3) : '—'}
                      </td>
                      <td className="bae-col-type">
                        {t.bankFeeType ? (
                          <span className="bae-cat-badge" title={CAT_LABELS[t.bankFeeType] ?? t.bankFeeType}>
                            {CAT_LABELS[t.bankFeeType] ?? t.bankFeeType}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="bae-col-batch" title={t.fileName}>{t.importBatchLabel}</td>
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

type Tab = 'overview' | 'timeline' | 'analytics' | 'imports' | 'export';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview',   label: 'نظرة عامة',    icon: 'dashboard' },
  { key: 'timeline',   label: 'السجل الزمني', icon: 'receipt_long' },
  { key: 'analytics',  label: 'التحليلات',    icon: 'bar_chart' },
  { key: 'imports',    label: 'دفعات الاستيراد', icon: 'upload_file' },
  { key: 'export',     label: 'تصدير',        icon: 'download' },
];

export default function BankAccountExplorer() {
  const { accountKey: rawKey } = useParams<{ accountKey: string }>();
  const navigate               = useNavigate();
  const { hasPermission }      = useAuth();

  const accountKey = rawKey ? decodeURIComponent(rawKey) : '';

  const [tab, setTab]             = useState<Tab>('overview');
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
      {/* ── Header ── */}
      <div className="bae-header">
        <button type="button" className="bae-back-btn" onClick={() => navigate('/bank-accounts')}>
          <span className="material-symbols-outlined">arrow_forward_ios</span>
        </button>
        <div className="bae-header-text">
          <h1 className="bae-title">
            <span className="material-symbols-outlined bae-title-icon">account_balance</span>
            {loading ? 'جارٍ التحميل…' : (dashboard?.bankName ?? accountKey)}
          </h1>
          {dashboard && (
            <>
              <div className="bae-exec-balance">
                <PrivateAmount value={dashboard.currentBalance ?? 0} currency="د.ك" />
              </div>
              <div className="bae-meta-row">
                {dashboard.coverageStart && (
                  <span className="bae-meta-item">
                    <span className="material-symbols-outlined">calendar_today</span>
                    {fmtDate(dashboard.coverageStart)} — {fmtDate(dashboard.coverageEnd)}
                  </span>
                )}
                <span className="bae-meta-dot">·</span>
                <span className="bae-meta-item">
                  <span className="material-symbols-outlined">receipt_long</span>
                  {dashboard.transactionCount.toLocaleString()} معاملة
                </span>
                <span className="bae-meta-dot">·</span>
                <span className="bae-meta-item">
                  <span className="material-symbols-outlined">upload_file</span>
                  {dashboard.importCount} {dashboard.importCount === 1 ? 'دفعة' : 'دفعات'} استيراد
                </span>
              </div>
            </>
          )}
          {!dashboard && !loading && (
            <p className="bae-subtitle">{accountKey}</p>
          )}
        </div>
        <button
          type="button"
          className="btn secondary"
          onClick={() => navigate('/bank-statement-import')}
        >
          <span className="material-symbols-outlined">upload_file</span>
          إضافة كشف
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className="bae-tab-bar">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            className={`bae-tab-btn${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="material-symbols-outlined bae-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
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
        <ErrorBoundary
          resetKey={tab}
          onReset={() => setTab('overview')}
          resetLabel="العودة للنظرة العامة"
        >
          {tab === 'overview'  && <OverviewTab  dashboard={dashboard} />}
          {tab === 'timeline'  && <TimelineTab  accountKey={accountKey} bankName={dashboard.bankName} />}
          {tab === 'analytics' && <AnalyticsTab dashboard={dashboard} />}
          {tab === 'imports'   && <ImportsTab   accountKey={accountKey} />}
          {tab === 'export'    && <ExportTab    accountKey={accountKey} bankName={dashboard.bankName} dashboard={dashboard} />}
        </ErrorBoundary>
      )}
    </div>
  );
}
