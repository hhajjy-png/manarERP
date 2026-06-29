import {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../stores/authStore';
import { errorMessage } from '../api/client';
import PrivateAmount from '../components/PrivateAmount';
import {
  getTimeline, listImports,
  type TimelineTransaction, type TimelineResult, type ImportListItem,
} from '../api/bankStatementImport';
import {
  getBankAccountDashboard,
  type BankAccountDashboard, type MonthlyEntry,
} from '../api/bankAccounts';
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

const CAT_COLORS: Record<string, string> = {
  BANK_TRANSFER:   '#10b981',
  CHEQUE_PAYMENT:  '#3b82f6',
  CASH_WITHDRAWAL: '#f59e0b',
  TRANSFER_FEE:    '#7c3aed',
  MONTHLY_FEE:     '#7c3aed',
  INTEREST:        '#0e7490',
  CHARGE:          '#ef4444',
  ATM_FEE:         '#f97316',
  CHEQUEBOOK_FEE:  '#94a3b8',
  OTHER_FEE:       '#94a3b8',
};

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#7c3aed', '#0e7490', '#f97316'];

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
  label, value, icon, colorVariant, sub,
}: {
  label:        string;
  value:        string;
  icon:         string;
  colorVariant?: 'green' | 'red';
  sub?:         string;
}) {
  const cls = colorVariant ? ` bae-kpi-card--${colorVariant}` : '';
  return (
    <div className={`bae-kpi-card${cls}`}>
      <div className="bae-kpi-icon">
        <span className="material-icons-round">{icon}</span>
      </div>
      <div className="bae-kpi-body">
        <span className="bae-kpi-label">{label}</span>
        <span className="bae-kpi-value">{value}</span>
        {sub && <span className="bae-kpi-sub">{sub}</span>}
      </div>
    </div>
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

      {/* Coverage strip */}
      {(d.coverageStart || d.coverageEnd) && (
        <div className="bae-coverage-strip">
          <span className="material-icons-round bae-coverage-icon">
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

function TimelineTab({
  accountKey,
  bankName,
}: {
  accountKey: string;
  bankName:   string;
}) {
  const PAGE_SIZE = 50;

  const [result, setResult]     = useState<TimelineResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');
  const [error, setError]       = useState<string | null>(null);
  const searchTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((p: number, q: string, fd: string, td: string) => {
    setLoading(true);
    setError(null);
    getTimeline(
      accountKey, p, PAGE_SIZE,
      fd || undefined, td || undefined,
      q || undefined,
    )
      .then(setResult)
      .catch((e) => setError(errorMessage(e) || 'فشل تحميل الحركات'))
      .finally(() => setLoading(false));
  }, [accountKey]);

  useEffect(() => { load(1, '', '', ''); }, [load]);

  const handleSearch = useCallback((q: string) => {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      load(1, q, fromDate, toDate);
    }, 350);
  }, [load, fromDate, toDate]);

  const handleDateChange = useCallback((fd: string, td: string) => {
    setFromDate(fd);
    setToDate(td);
    setPage(1);
    load(1, search, fd, td);
  }, [load, search]);

  const handlePage = useCallback((p: number) => {
    setPage(p);
    load(p, search, fromDate, toDate);
  }, [load, search, fromDate, toDate]);

  const total          = result?.totalCount ?? 0;
  const totalPages     = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = !!(search || fromDate || toDate);

  const clearAllFilters = useCallback(() => {
    handleSearch('');
    handleDateChange('', '');
  }, [handleSearch, handleDateChange]);

  return (
    <div className="bae-tab-content">
      {/* Filters */}
      <div className="bae-filters-row">
        <div className="bae-search-wrap">
          <span className="material-icons-round bae-filter-icon">search</span>
          <input
            className="bae-filter-input"
            placeholder="بحث في الوصف أو المرجع…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="bae-clear-btn" onClick={() => handleSearch('')}>
              <span className="material-icons-round">close</span>
            </button>
          )}
        </div>
        <input
          className="bae-date-input"
          type="date"
          value={fromDate}
          onChange={(e) => handleDateChange(e.target.value, toDate)}
          title="من تاريخ"
        />
        <input
          className="bae-date-input"
          type="date"
          value={toDate}
          onChange={(e) => handleDateChange(fromDate, e.target.value)}
          title="إلى تاريخ"
        />
        {(fromDate || toDate) && (
          <button type="button" className="btn secondary bae-reset-btn"
            onClick={() => handleDateChange('', '')}>مسح التاريخ</button>
        )}
        {result && (
          <button
            type="button"
            className="btn secondary bae-export-btn"
            onClick={() => result.transactions.length > 0 && exportTimelineCsv(result.transactions, bankName, accountKey)}
            disabled={!result.transactions.length}
          >
            <span className="material-icons-round">download</span>
            تصدير CSV
          </button>
        )}
      </div>

      {/* Summary strip */}
      {result && (
        <div className="bae-timeline-summary">
          <span>{total.toLocaleString()} معاملة</span>
          {result.fromDate && <span>من {fmtDate(result.fromDate)} إلى {fmtDate(result.toDate)}</span>}
        </div>
      )}

      {/* Loading / error */}
      {loading && <div className="bae-loading"><span className="spinner" /> جارٍ التحميل…</div>}
      {!loading && error && <div className="bae-error">{error}</div>}

      {/* Filtered empty state */}
      {!loading && !error && result && result.transactions.length === 0 && hasActiveFilters && (
        <div className="bae-filtered-empty">
          <span className="material-icons-round">filter_alt_off</span>
          <p>لا توجد نتائج مطابقة للفلاتر المحددة</p>
          <p className="bae-filtered-empty-hint">
            {search && <span>البحث: «{search}»</span>}
            {(fromDate || toDate) && (
              <span>
                {fromDate && ` من ${fromDate}`}{toDate && ` إلى ${toDate}`}
              </span>
            )}
          </p>
          <button type="button" className="btn bae-clear-filters-btn" onClick={clearAllFilters}>
            <span className="material-icons-round">close</span>
            مسح جميع الفلاتر
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && result && result.transactions.length > 0 && (
        <>
          <div className="bae-table-wrap">
            <table className="bae-timeline-table">
              <thead>
                <tr>
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
                {result.transactions.map((t) => (
                  <tr key={t.id} className={t.isBankFee ? 'bae-row-fee' : ''}>
                    <td className="bae-col-date">{fmtDate(t.statementDate)}</td>
                    <td className="bae-col-desc" title={t.description}>{t.description}</td>
                    <td className="bae-col-ref">{t.reference ?? '—'}</td>
                    <td className="bae-col-debit">
                      {t.debit > 0 ? <span className="bae-debit">{t.debit.toFixed(3)}</span> : '—'}
                    </td>
                    <td className="bae-col-credit">
                      {t.credit > 0 ? <span className="bae-credit">{t.credit.toFixed(3)}</span> : '—'}
                    </td>
                    <td className="bae-col-balance">
                      {t.balance != null ? t.balance.toFixed(3) : '—'}
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
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bae-pagination">
              <button
                type="button"
                className="btn secondary bae-page-btn"
                onClick={() => handlePage(page - 1)}
                disabled={page <= 1 || loading}
              >
                السابق
              </button>
              <span className="bae-page-info">صفحة {page} من {totalPages}</span>
              <button
                type="button"
                className="btn secondary bae-page-btn"
                onClick={() => handlePage(page + 1)}
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

function AnalyticsTab({ dashboard }: { dashboard: BankAccountDashboard }) {
  const monthly = dashboard.monthly;

  // Category breakdown from top transactions
  const catData = useMemo(() => {
    const map: Record<string, number> = {};
    [...dashboard.topDeposits, ...dashboard.topWithdrawals].forEach((t) => {
      // We don't have category on top transactions — use a simple split
    });
    // Build monthly chart data
    return monthly.map((m) => ({
      name: m.month.slice(0, 7),
      إيداعات: parseFloat(m.totalDeposits.toFixed(3)),
      سحوبات:  parseFloat(m.totalWithdrawals.toFixed(3)),
    }));
  }, [monthly, dashboard.topDeposits, dashboard.topWithdrawals]);

  const pieData = useMemo(() => [
    { name: 'إجمالي الإيداعات',  value: parseFloat(dashboard.totalDeposits.toFixed(3)) },
    { name: 'إجمالي السحوبات',   value: parseFloat(dashboard.totalWithdrawals.toFixed(3)) },
  ], [dashboard]);

  if (monthly.length === 0) {
    return (
      <div className="bae-tab-content bae-empty-state">
        <span className="material-icons-round">bar_chart</span>
        <p>لا توجد بيانات كافية للرسوم البيانية.</p>
      </div>
    );
  }

  return (
    <div className="bae-tab-content">
      {/* Monthly bar chart */}
      <div className="bae-chart-section">
        <h4 className="bae-section-title">التدفق الشهري — إيداعات مقابل سحوبات</h4>
        <div className="bae-chart-wrap">
          <ResponsiveContainer width="100%" height={310}>
            <BarChart data={catData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tickFormatter={fmtMonth}
                angle={-35}
                textAnchor="end"
                height={70}
                interval="preserveStartEnd"
                tick={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'IBM Plex Sans Arabic, Cairo, sans-serif' }}
              />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontFamily: 'IBM Plex Sans Arabic, Cairo, sans-serif', fontSize: 12, direction: 'rtl' }} />
              <Bar dataKey="إيداعات" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="سحوبات"  fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie chart */}
      <div className="bae-chart-section">
        <h4 className="bae-section-title">توزيع التدفق النقدي</h4>
        <div className="bae-chart-wrap bae-chart-pie-wrap">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }: { name?: string; percent?: number }) =>
                  `${name ?? ''} ${((percent ?? 0) * 100).toFixed(1)}%`}
                labelLine
              >
                {pieData.map((_entry, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly stats table */}
      <div className="bae-chart-section">
        <h4 className="bae-section-title">تفاصيل شهرية</h4>
        <div className="bae-monthly-scroll">
          <table className="bae-top-table">
            <thead>
              <tr>
                <th>الشهر</th>
                <th>إيداعات</th>
                <th>أكبر إيداع</th>
                <th>سحوبات</th>
                <th>أكبر سحب</th>
                <th>صافي</th>
                <th>عمليات</th>
              </tr>
            </thead>
            <tbody>
              {[...monthly].reverse().map((m) => (
                <tr key={m.month}>
                  <td>{fmtMonth(m.month)}</td>
                  <td className="bae-amount-green">{fmtAmount(m.totalDeposits)}</td>
                  <td className="bae-amount-green">{fmtAmount(m.largestDeposit)}</td>
                  <td className="bae-amount-red">{fmtAmount(m.totalWithdrawals)}</td>
                  <td className="bae-amount-red">{fmtAmount(m.largestWithdrawal)}</td>
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
          <span className="material-icons-round">upload_file</span>
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
        <span className="material-icons-round bae-export-icon">download</span>
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
            : <><span className="material-icons-round">download</span> تصدير CSV</>}
        </button>
        {done && (
          <p className="bae-export-done">
            <span className="material-icons-round">check_circle</span>
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
        <span className="material-icons-round">lock</span>
        <p>ليس لديك صلاحية لعرض بيانات الحساب البنكي.</p>
      </div>
    );
  }

  return (
    <div className="bae-root" dir="rtl">
      {/* ── Header ── */}
      <div className="bae-header">
        <button type="button" className="bae-back-btn" onClick={() => navigate('/bank-accounts')}>
          <span className="material-icons-round">arrow_forward_ios</span>
        </button>
        <div className="bae-header-text">
          <h1 className="bae-title">
            <span className="material-icons-round bae-title-icon">account_balance</span>
            {loading ? 'جارٍ التحميل…' : (dashboard?.bankName ?? accountKey)}
          </h1>
          {dashboard && (
            <p className="bae-subtitle">
              <PrivateAmount value={dashboard.currentBalance ?? 0} currency="د.ك" />
              {' · '}
              {dashboard.transactionCount.toLocaleString()} معاملة
              {dashboard.coverageStart && (
                <> · {fmtDate(dashboard.coverageStart)} — {fmtDate(dashboard.coverageEnd)}</>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn secondary"
          onClick={() => navigate('/bank-statement-import')}
        >
          <span className="material-icons-round">upload_file</span>
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
            <span className="material-icons-round bae-tab-icon">{t.icon}</span>
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
          <span className="material-icons-round">error_outline</span>
          <p>{error}</p>
          <button type="button" className="btn secondary" onClick={loadDashboard}>إعادة المحاولة</button>
        </div>
      )}

      {!loading && !error && dashboard && (
        <>
          {tab === 'overview'  && <OverviewTab  dashboard={dashboard} />}
          {tab === 'timeline'  && <TimelineTab  accountKey={accountKey} bankName={dashboard.bankName} />}
          {tab === 'analytics' && <AnalyticsTab dashboard={dashboard} />}
          {tab === 'imports'   && <ImportsTab   accountKey={accountKey} />}
          {tab === 'export'    && <ExportTab    accountKey={accountKey} bankName={dashboard.bankName} dashboard={dashboard} />}
        </>
      )}
    </div>
  );
}
