import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useT } from '../lib/i18n';
import { PageMeta } from '../components/DataTable';
import { dateText, money, MoneyText, MoneyCell } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { useTableSort } from '../hooks/useTableSort';
import SortableHeader from '../components/SortableHeader';
import { downloadBlob } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import PrivateAmount from '../components/PrivateAmount';
import PayrollBankExport from '../components/salaries/PayrollBankExport';
import DateInput from '../components/DateInput';
import { toLocalDateOnly } from '../lib/date';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  Tabs,
  StatusChip,
  SearchBox,
  FilterChip,
  SectionCard,
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
import './Salaries.css';
import HistoricalDateNotice from '../components/period/HistoricalDateNotice';
import { fcMoneyHeader } from '../components/financial/financialLabels';

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';
type EmployeeOption = { id: number; fullName: string; code: string };
type PayrollLine = { id: number; type: string; label: string; amount: number };
type PayrollSource = 'COMPUTED' | 'IMPORTED_TRANSFER';
type PayrollRow = {
  // Number for computed rows; `imported:<id>` string for imported salary-transfer rows.
  id: number | string;
  source: PayrollSource;
  isReadOnly: boolean;
  breakdownAvailable: boolean;
  employee: { id: number | null; code: string | null; fullName: string; department?: string | null } | null;
  employeeName?: string;
  employeeCode?: string | null;
  month: number;
  year: number;
  // Breakdown fields are null on imported historical rows (unavailable, not zero).
  snapshotBaseSalary: number | null;
  baseSalary: number | null;
  grossSalary: number | null;
  netSalary: number;
  totalAllowances: number | null;
  totalDeductions: number | null;
  totalAdvances: number | null;
  overtimeHours: number | null;
  overtimeAmount: number | null;
  status: string;
  paidAt?: string | null;
  paymentDate?: string | null;
  bankName?: string | null;
  transactionId?: string | null;
  lines: PayrollLine[];
};
type SalaryPaymentRow = {
  id: number;
  paymentDate?: string | null;
  sourceMonth?: string | null;
  transactionId: string;
  beneficiaryName: string;
  bankName?: string | null;
  amount: number;
  civilId?: string | null;
  status?: string | null;
};

const STATUS_TONE: Record<string, Tone> = { PAID: 'green', APPROVED: 'blue', CANCELLED: 'neutral', DRAFT: 'orange' };
const STATUS_ICON: Record<string, string> = { PAID: 'task_alt', APPROVED: 'verified', CANCELLED: 'block', DRAFT: 'edit_note' };

const now = new Date();
const initialMonth = now.getMonth() + 1;
const initialYear = now.getFullYear();

export default function Salaries() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = usePersistedState<'payroll' | 'history' | 'bankExport'>('sal:tab', 'payroll');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  // A deep-linked employee (e.g. on-leave/terminated) may be absent from the
  // ACTIVE-only `employees` dropdown; keep it here so the filter shows the real
  // name instead of falling back to "all employees". Separate state so the async
  // employees fetch can't clobber it.
  const [pinnedEmployee, setPinnedEmployee] = useState<EmployeeOption | null>(null);
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  // Period KPI totals come from the backend /payroll/stats aggregate (full filtered
  // dataset, CANCELLED excluded) — never from the current page of `rows`.
  const [stats, setStats] = useState<{ count: number; gross: number; net: number; paid: number; importedCount?: number; grossIsPartial?: boolean } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [page, setPage] = useState(1);
  // فرز خادمي موحّد (Enterprise Data Grid Foundation) — لكل جدول حالته وصفحته الخاصة.
  const sort = useTableSort('payroll', () => setPage(1));
  const [month, setMonth] = usePersistedState<number>('sal:month', initialMonth);
  const [year, setYear] = usePersistedState<number>('sal:year', initialYear);
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = usePersistedState('sal:status', '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<PayrollRow | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [payMethod, setPayMethod] = useState('BANK');
  // تاريخ الصرف الاختياري — عند تركه فارغًا يرحّل الـ backend بآخر يوم في شهر الراتب.
  const [payDate, setPayDate] = useState('');

  const [adjustPayrollId, setAdjustPayrollId] = useState('');
  const [adjustType, setAdjustType] = useState<'ALLOWANCE' | 'DEDUCTION'>('ALLOWANCE');
  const [adjustLabel, setAdjustLabel] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');

  const [inputEmployeeId, setInputEmployeeId] = useState('');
  const [inputKind, setInputKind] = useState<'allowance' | 'deduction' | 'advance'>('allowance');
  const [inputName, setInputName] = useState('');
  const [inputAmount, setInputAmount] = useState('');

  const [historyRows, setHistoryRows] = useState<SalaryPaymentRow[]>([]);
  const [historyMeta, setHistoryMeta] = useState<PageMeta | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const historySort = useTableSort('salaries-history', () => setHistoryPage(1));
  const [historyQuery, setHistoryQuery] = useState('');

  const [excelBusy, setExcelBusy] = useState(false);

  const canGenerate = hasPermission('payroll.generate') || hasPermission('payroll.create');
  const canApprove = hasPermission('payroll.approve');
  const canPay = hasPermission('payroll.pay');
  const canAdjust = hasPermission('payroll.adjust');
  const canCancel = hasPermission('payroll.cancel');
  const canPayslip = hasPermission('payroll.payslip') || hasPermission('payroll.read');
  const canExport = hasPermission('reports.export') || hasPermission('payroll.read');
  const canImport = hasPermission('import.create');

  async function loadPayroll() {
    setLoading(true);
    try {
      const res = await api.get('/payroll', {
        params: { page, pageSize: 12, month, year, employeeId: employeeId || undefined, status: status || undefined, ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}) },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    setStatsError(false);
    try {
      const res = await api.get('/payroll/stats', {
        params: { month, year, employeeId: employeeId || undefined, status: status || undefined },
      });
      setStats(res.data.data ?? null);
    } catch {
      // On failure, surface a neutral fallback rather than misleading page-only totals.
      setStats(null);
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await api.get('/salaries', { params: { page: historyPage, pageSize: 12, search: historyQuery, ...(historySort.sortBy ? { sortBy: historySort.sortBy, sortDir: historySort.sortDir } : {}) } });
      setHistoryRows(res.data.data.data ?? []);
      setHistoryMeta(res.data.data.meta ?? null);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    api.get('/employees', { params: { pageSize: 500, status: 'ACTIVE' } })
      .then((res) => setEmployees(res.data.data.data ?? []))
      .catch(() => {});
  }, []);

  // Deep-link from the employee drawer's "عرض جميع الرواتب" button: preselect that
  // employee and land on the payroll tab. The payroll loader reacts to employeeId.
  useEffect(() => {
    const incoming = location.state as { employeeId?: number | string; employeeName?: string } | null;
    if (incoming?.employeeId != null && incoming.employeeId !== '') {
      setEmployeeId(String(incoming.employeeId));
      setTab('payroll');
      if (incoming.employeeName) {
        setPinnedEmployee({ id: Number(incoming.employeeId), fullName: incoming.employeeName, code: '' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    loadPayroll().catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, month, year, employeeId, status, sort.sortBy, sort.sortDir]);

  useEffect(() => {
    if (tab === 'history') loadHistory().catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, historyPage, historyQuery, historySort.sortBy, historySort.sortDir]);

  // KPI totals depend only on the filters, not the page — pagination must not move them.
  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, employeeId, status]);

  async function runAction(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      await Promise.all([loadPayroll(), loadStats()]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function generatePayroll() {
    await runAction(async () => {
      const res = await api.post('/payroll/generate', { month, year, employeeId: employeeId ? Number(employeeId) : undefined });
      setMessage(t('page.salaries.generated', { count: res.data.data.generated }));
    });
  }

  async function addPayrollInput() {
    if (!inputEmployeeId || !inputAmount || (inputKind !== 'advance' && !inputName.trim())) return;
    await runAction(async () => {
      const payload = { employeeId: Number(inputEmployeeId), name: inputName, amount: Number(inputAmount) };
      if (inputKind === 'allowance') await api.post('/payroll/allowances', payload);
      if (inputKind === 'deduction') await api.post('/payroll/recurring-deductions', payload);
      if (inputKind === 'advance') await api.post('/payroll/advances', { employeeId: Number(inputEmployeeId), amount: Number(inputAmount), notes: inputName });
      setInputName('');
      setInputAmount('');
      setMessage(t('page.salaries.input_saved'));
    });
  }

  async function addManualLine() {
    if (!adjustPayrollId || !adjustLabel.trim() || !adjustAmount) return;
    await runAction(async () => {
      await api.post(`/payroll/${adjustPayrollId}/lines`, { type: adjustType, label: adjustLabel, amount: Number(adjustAmount) });
      setAdjustLabel('');
      setAdjustAmount('');
      setMessage(t('page.salaries.line_added'));
    });
  }

  async function downloadPayrollExcel() {
    if (!canExport || excelBusy) return;
    setExcelBusy(true);
    setError('');
    try {
      const res = await api.get('/reports/payroll/export', {
        params: { month, year, employeeId: employeeId || undefined, status: status || undefined, format: 'excel' },
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, generateExportFileName({
        reportName: ReportName.PayrollReport,
        identifier: `${year}-${String(month).padStart(2, '0')}`,
        extension: 'xlsx',
      }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExcelBusy(false);
    }
  }

  const STATUS_CHIPS: { value: string; label: string }[] = [
    { value: '', label: t('page.salaries.all_statuses') },
    { value: 'DRAFT', label: t('payroll.status.draft') },
    { value: 'APPROVED', label: t('payroll.status.approved') },
    { value: 'PAID', label: t('payroll.status.paid') },
    { value: 'CANCELLED', label: t('payroll.status.cancelled') },
  ];

  function statusChip(s: string) {
    return <StatusChip tone={STATUS_TONE[s] ?? 'neutral'} icon={STATUS_ICON[s]}>{t('payroll.status.' + s.toLowerCase())}</StatusChip>;
  }

  return (
    <div className="xpl-scope xpl-page" dir="rtl">
      <ExecutiveHeader
        icon="payments"
        title={t('page.salaries.title')}
        subtitle={t('page.salaries.subtitle')}
        chips={
          <>
            <IdChip icon="badge" tone="indigo">{stats ? stats.count : (statsLoading ? '…' : '—')} {t('unit.payroll_run')}</IdChip>
            <IdChip icon="task_alt" tone="green">{stats ? stats.paid : (statsLoading ? '…' : '—')} {t('status.paid')}</IdChip>
          </>
        }
        aside={tab === 'payroll' && canGenerate ? <Button variant="primary" icon="bolt" busy={busy} onClick={generatePayroll}>{t('page.salaries.generate')}</Button> : undefined}
      />

      <Tabs<'payroll' | 'history' | 'bankExport'>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'payroll', label: t('page.salaries.tab_payroll'), icon: 'payments' },
          { key: 'history', label: t('page.salaries.tab_history'), icon: 'history' },
          ...(hasPermission('payroll.read')
            ? [{ key: 'bankExport' as const, label: t('page.salaries.tab_bank_export'), icon: 'account_balance' }]
            : []),
        ]}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {message && <div className="xpl-form-error" style={{ background: 'rgba(16,185,129,.07)', borderColor: 'rgba(16,185,129,.25)', color: 'var(--xpl-green)' }}><span className="material-symbols-outlined">check_circle</span>{message}</div>}

      {tab === 'bankExport' ? (
        <PayrollBankExport />
      ) : tab === 'payroll' ? (
        <>
          <div className="salx-metrics">
            {/* Fallback: '…' while loading, '—' on error — never page-only totals. */}
            <HeroMetric icon="account_balance_wallet" label={t('stat.net_total')}
              value={stats ? <PrivateAmount value={stats.net} /> : (statsLoading ? '…' : '—')}
              sub={<><span className="material-symbols-outlined">groups</span>{stats ? `${stats.count} ${t('label.payroll_runs')}` : (statsLoading ? '…' : '—')}</>} />
            <div className="xpl-kpi-grid">
              <MetricCard icon="receipt_long" tone="indigo" label={t('stat.payroll_records')} value={stats ? stats.count : (statsLoading ? '…' : '—')} />
              <MetricCard icon="payments" tone="blue" label={t('stat.gross_total') + (stats?.grossIsPartial ? ' ' + t('label.computed_only') : '')} value={stats ? <PrivateAmount value={stats.gross} /> : (statsLoading ? '…' : '—')} />
              <MetricCard icon="task_alt" tone="green" label={t('stat.paid_records')} value={stats ? stats.paid : (statsLoading ? '…' : '—')} />
            </div>
          </div>
          {statsError && <ErrorBanner>{t('page.salaries.stats_error')}</ErrorBanner>}

          <div className="xpl-toolbar xpl-toolbar--sticky">
            <div className="xpl-toolbar-row">
              <div className="xpl-field" style={{ width: 96 }}>
                <span className="xpl-field-label">{t('field.month')}</span>
                <input className="xpl-input salx-num" type="number" min={1} max={12} value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }} aria-label={t('field.month')} />
              </div>
              <div className="xpl-field" style={{ width: 110 }}>
                <span className="xpl-field-label">{t('field.year')}</span>
                <input className="xpl-input" type="number" min={2000} max={2100} value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }} aria-label={t('field.year')} />
              </div>
              <div className="xpl-field" style={{ minWidth: 180 }}>
                <span className="xpl-field-label">{t('page.salaries.all_employees')}</span>
                <select className="xpl-select" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setPage(1); }} aria-label={t('page.salaries.all_employees')}>
                  <option value="">{t('page.salaries.all_employees')}</option>
                  {(pinnedEmployee && !employees.some((e) => e.id === pinnedEmployee.id)
                    ? [pinnedEmployee, ...employees]
                    : employees
                  ).map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              {canExport && <Button variant="secondary" icon="table_view" busy={excelBusy} onClick={downloadPayrollExcel}>{t('page.salaries.export_excel')}</Button>}
              {canImport && <Button variant="ghost" icon="upload" onClick={() => navigate('/import')}>{t('page.salaries.import_excel')}</Button>}
              {canAdjust && <Button variant="ghost" icon="tune" onClick={() => setAdjustOpen(true)}>{t('page.salaries.adjustments')}</Button>}
            </div>
            <div className="xpl-toolbar-row">
              {STATUS_CHIPS.map((s) => (
                <FilterChip key={s.value} active={status === s.value} onClick={() => { setStatus(s.value); setPage(1); }}>{s.label}</FilterChip>
              ))}
              <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{meta?.total ?? rows.length} {t('page.reports.results_count')}</span>
            </div>
          </div>

          <section className="xpl-card" style={{ overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
            ) : rows.length === 0 ? (
              <EmptyState icon="payments" tone="neutral" title={t('empty.payroll.title')} message={t('empty.payroll.message')}
                action={canGenerate ? <Button variant="primary" icon="bolt" onClick={generatePayroll}>{t('page.salaries.generate')}</Button> : undefined} />
            ) : (
              <>
                <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="xpl-table">
                    <thead>
                      <tr>
                        <SortableHeader label={t('col.sal.employee')} title={t('col.sal.employee')} state={sort.getState('employee')} onToggle={() => sort.toggle('employee')} />
                        <SortableHeader label={t('col.sal.period')} title={t('col.sal.period')} state={sort.getState('period')} onToggle={() => sort.toggle('period')} />
                        <SortableHeader label={fcMoneyHeader(t('col.sal.base'))} title={t('col.sal.base')} state={sort.getState('base')} onToggle={() => sort.toggle('base')} />
                        <SortableHeader label={fcMoneyHeader(t('col.sal.gross'))} title={t('col.sal.gross')} state={sort.getState('gross')} onToggle={() => sort.toggle('gross')} />
                        <SortableHeader label={fcMoneyHeader(t('col.sal.deductions'))} title={t('col.sal.deductions')} state={sort.getState('deductions')} onToggle={() => sort.toggle('deductions')} />
                        <SortableHeader label={fcMoneyHeader(t('col.sal.net'))} title={t('col.sal.net')} state={sort.getState('net')} onToggle={() => sort.toggle('net')} />
                        <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('status')} onToggle={() => sort.toggle('status')} />
                        <th aria-label={t('action.open_row')} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const imported = r.source === 'IMPORTED_TRANSFER';
                        return (
                        <tr key={r.id} className="xpl-row--click" tabIndex={0} role="button"
                          aria-label={t('a11y.salary_details', { name: r.employee?.fullName ?? '' })}
                          onClick={() => setViewing(r)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                          <td>
                            <strong>{r.employee?.fullName}</strong>
                            {imported && <span style={{ marginInlineStart: 8, verticalAlign: 'middle' }}><StatusChip tone="indigo" icon="history">{t('status.imported_transfer')}</StatusChip></span>}
                          </td>
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{r.month}/{r.year}</td>
                          <td>{imported ? '—' : money(r.snapshotBaseSalary ?? r.baseSalary)}</td>
                          <td>{imported ? '—' : money(r.grossSalary)}</td>
                          <td>{imported ? '—' : money(Number(r.totalDeductions ?? 0) + Number(r.totalAdvances ?? 0))}</td>
                          <td><span className="salx-net">{<MoneyCell value={r.netSalary} />}</span></td>
                          <td>{imported ? <StatusChip tone="neutral" icon="lock">{t('status.read_only')}</StatusChip> : statusChip(r.status)}</td>
                          <td className="decx-col-chevron" style={{ width: 32, textAlign: 'center' }}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, color: 'var(--xpl-muted)' }}>chevron_left</span></td>
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
        </>
      ) : (
        <>
          <div className="xpl-toolbar xpl-toolbar--sticky">
            <div className="xpl-toolbar-row">
              <SearchBox value={historyQuery} onChange={(v) => { setHistoryQuery(v); setHistoryPage(1); }} placeholder={t('page.salaries.search_history')} ariaLabel={t('page.salaries.search_history')} />
            </div>
          </div>
          <section className="xpl-card" style={{ overflow: 'hidden' }}>
            {historyLoading ? (
              <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
            ) : historyRows.length === 0 ? (
              <EmptyState icon="history" tone="neutral" title={t('empty.salary_payments.title')} message={t('empty.salary_payments.message')} />
            ) : (
              <>
                <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="xpl-table">
                    <thead>
                      <tr>
                        <SortableHeader label={t('col.sal.payment_date')} title={t('col.sal.payment_date')} state={historySort.getState('paymentDate')} onToggle={() => historySort.toggle('paymentDate')} />
                        <SortableHeader label={t('col.sal.source_month')} title={t('col.sal.source_month')} state={historySort.getState('sourceMonth')} onToggle={() => historySort.toggle('sourceMonth')} />
                        <SortableHeader label={t('col.sal.transaction')} title={t('col.sal.transaction')} state={historySort.getState('transactionId')} onToggle={() => historySort.toggle('transactionId')} />
                        <SortableHeader label={t('col.sal.beneficiary')} title={t('col.sal.beneficiary')} state={historySort.getState('beneficiaryName')} onToggle={() => historySort.toggle('beneficiaryName')} />
                        <SortableHeader label={t('col.sal.bank')} title={t('col.sal.bank')} state={historySort.getState('bankName')} onToggle={() => historySort.toggle('bankName')} />
                        <SortableHeader label={fcMoneyHeader(t('col.amount'))} title={t('col.amount')} state={historySort.getState('amount')} onToggle={() => historySort.toggle('amount')} />
                        <SortableHeader label={t('col.civil_id')} title={t('col.civil_id')} state={historySort.getState('civilId')} onToggle={() => historySort.toggle('civilId')} />
                        <SortableHeader label={t('col.status')} title={t('col.status')} state={historySort.getState('status')} onToggle={() => historySort.toggle('status')} />
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((r) => (
                        <tr key={r.id}>
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.paymentDate)}</td>
                          <td>{r.sourceMonth ?? '—'}</td>
                          <td className="xpl-mono">{r.transactionId}</td>
                          <td><strong>{r.beneficiaryName}</strong></td>
                          <td>{r.bankName ?? '—'}</td>
                          <td className="salx-amount">{<MoneyCell value={r.amount} />}</td>
                          <td className="xpl-mono">{r.civilId ?? '—'}</td>
                          <td>{r.status ? <StatusChip tone="green">{t('payroll.status.' + r.status.toLowerCase())}</StatusChip> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination meta={historyMeta} onPage={setHistoryPage} />
              </>
            )}
          </section>
        </>
      )}

      {/* ── Salary drawer ── */}
      {viewing && (() => {
        const imported = viewing.source === 'IMPORTED_TRANSFER';
        const allowanceLines = (viewing.lines ?? []).filter((l) => l.type?.toUpperCase().includes('ALLOW'));
        const deductionLines = (viewing.lines ?? []).filter((l) => l.type?.toUpperCase().includes('DEDUC'));
        return (
          <Drawer
            title={`${viewing.employee?.fullName} — ${viewing.month}/${viewing.year}`}
            onClose={() => setViewing(null)}
            hero={
              <div className="xpl-drawer-hero">
                <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span></div>
                <div className="xpl-drawer-hero-body">
                  <span className="xpl-drawer-hero-title money-cell">{<MoneyText value={viewing.netSalary} />}</span>
                  <span className="xpl-drawer-hero-sub">{viewing.employee?.fullName} · {viewing.month}/{viewing.year}</span>
                  <div style={{ marginTop: 4 }}>{imported ? <StatusChip tone="indigo" icon="history">{t('status.imported_transfer')}</StatusChip> : statusChip(viewing.status)}</div>
                </div>
              </div>
            }
            footer={
              // Imported historical transfers are structurally read-only: no payroll
              // workflow actions (payslip needs an unavailable breakdown; approve/pay/
              // cancel would drive a synthetic id into a mutation).
              imported ? undefined : (
              <>
                {canPayslip && <Button variant="secondary" icon="receipt_long" onClick={() => navigate(`/payroll/${viewing.id}/payslip`)}>{t('page.salaries.payslip')}</Button>}
                {canApprove && viewing.status === 'DRAFT' && <Button variant="primary" icon="verified" busy={busy} onClick={() => { const id = viewing.id; setViewing(null); runAction(() => api.patch(`/payroll/${id}/approve`)); }}>{t('page.salaries.approve_btn')}</Button>}
                {canCancel && ['DRAFT', 'APPROVED'].includes(viewing.status) && <Button variant="danger" icon="block" busy={busy} onClick={() => { const id = viewing.id; setViewing(null); runAction(() => api.patch(`/payroll/${id}/cancel`)); }}>{t('page.salaries.cancel_btn')}</Button>}
              </>
              )
            }
          >
            <DrawerSection title={t('section.employee_data')}>
              <DrawerField label={t('col.sal.employee')} value={viewing.employee?.fullName} />
              <DrawerField label={t('col.code')} value={viewing.employee?.code} mono />
              {viewing.employee?.department && <DrawerField label={t('lbl.payslip.department')} value={viewing.employee.department} />}
              <DrawerField label={t('col.sal.period')} value={`${viewing.month}/${viewing.year}`} />
            </DrawerSection>

            {imported && (
              <DrawerSection title={t('section.imported_transfer')}>
                <DrawerField label={t('col.sal.net')} value={<span className="salx-net">{<MoneyText value={viewing.netSalary} />}</span>} />
                {viewing.bankName && <DrawerField label={t('col.sal.bank')} value={viewing.bankName} />}
                {viewing.paymentDate && <DrawerField label={t('col.sal.payment_date')} value={dateText(viewing.paymentDate)} />}
                {viewing.transactionId && <DrawerField label={t('col.sal.transaction')} value={viewing.transactionId} mono />}
                <div style={{ marginTop: 8, color: 'var(--xpl-muted)', fontSize: 13 }}>{t('note.salary_breakdown_unavailable')}</div>
              </DrawerSection>
            )}

            {!imported && (<>
            <DrawerSection title={t('section.salary')}>
              <DrawerField label={t('col.sal.base')} value={<MoneyText value={viewing.snapshotBaseSalary ?? viewing.baseSalary} />} />
              <DrawerField label={t('col.sal.gross')} value={<MoneyText value={viewing.grossSalary} />} />
              <DrawerField label={t('col.sal.overtime')} value={`${Number(viewing.overtimeHours ?? 0).toFixed(3)}h · ${money(viewing.overtimeAmount)}`} />
              <DrawerField label={t('col.sal.net')} value={<span className="salx-net">{<MoneyText value={viewing.netSalary} />}</span>} />
            </DrawerSection>

            <DrawerSection title={t('section.allowances')}>
              <DrawerField label={t('field.total_allowances')} value={<MoneyText value={viewing.totalAllowances} />} />
              {allowanceLines.length > 0 && (
                <div className="salx-lines">
                  {allowanceLines.map((l) => (
                    <div className="salx-line" key={l.id}><span className="salx-line-label">{l.label}</span><span className="salx-line-amount" style={{ color: 'var(--xpl-green)' }}>{<MoneyText value={l.amount} />}</span></div>
                  ))}
                </div>
              )}
            </DrawerSection>

            <DrawerSection title={t('section.deductions_advances')}>
              <DrawerField label={t('field.total_deductions')} value={<MoneyText value={viewing.totalDeductions} />} />
              <DrawerField label={t('field.total_advances')} value={<MoneyText value={viewing.totalAdvances} />} />
              {deductionLines.length > 0 && (
                <div className="salx-lines">
                  {deductionLines.map((l) => (
                    <div className="salx-line" key={l.id}><span className="salx-line-label">{l.label}</span><span className="salx-line-amount" style={{ color: 'var(--xpl-red)' }}>{<MoneyText value={l.amount} />}</span></div>
                  ))}
                </div>
              )}
            </DrawerSection>

            {canPay && viewing.status === 'APPROVED' && (
              <DrawerSection title={t('section.payment')}>
                <div className="salx-pay">
                  <div className="xpl-field">
                    <label>{t('field.payment_method')}</label>
                    <select className="xpl-select" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} aria-label={t('field.payment_method')}>
                      {/* Values must match backend ENUMS.glPaymentMethod (CASH | BANK | ACCOUNTS_PAYABLE);
                          CHEQUE/TRANSFER are rejected by payPayrollSchema and have no GL routing. */}
                      <option value="CASH">{t('opt.payment.cash')}</option>
                      <option value="BANK">{t('opt.payment.bank')}</option>
                      <option value="ACCOUNTS_PAYABLE">{t('opt.payment.accounts_payable')}</option>
                    </select>
                  </div>
                  <div className="xpl-field">
                    <label>{t('field.disbursement_date')} <span style={{ color: 'var(--xpl-muted)', fontWeight: 400 }}>{t('hint.disbursement_date_optional')}</span></label>
                    <DateInput className="xpl-input" value={payDate} onChange={setPayDate} ariaLabel={t('field.disbursement_date')} />
                    {/* يعرض التنبيه التاريخي لتاريخ الصرف الصريح، أو لآخر يوم في شهر/سنة الراتب. */}
                    <HistoricalDateNotice date={payDate || toLocalDateOnly(new Date(viewing.year, viewing.month, 0))} />
                  </div>
                  <Button variant="primary" icon="paid" block busy={busy} onClick={() => { const id = viewing.id; const m = payMethod; const pd = payDate || undefined; setViewing(null); runAction(() => api.patch(`/payroll/${id}/pay`, { paymentMethod: m, paymentDate: pd })); }}>
                    {t('page.salaries.pay_btn')}
                  </Button>
                </div>
              </DrawerSection>
            )}
            </>)}
          </Drawer>
        );
      })()}

      {/* ── Adjustments dialog ── */}
      {adjustOpen && canAdjust && (
        <Dialog
          icon="tune"
          title={t('page.salaries.adjustments')}
          subtitle={t('dialog.adjustments.subtitle')}
          size="lg"
          onClose={() => setAdjustOpen(false)}
          footer={<Button variant="ghost" icon="close" onClick={() => setAdjustOpen(false)}>{t('action.close')}</Button>}
        >
          <DialogSection title={t('section.recurring_inputs')} icon="repeat">
            <div className="xpl-field">
              <label>{t('page.salaries.select_employee')}</label>
              <select className="xpl-select" value={inputEmployeeId} onChange={(e) => setInputEmployeeId(e.target.value)} aria-label={t('page.salaries.select_employee')}>
                <option value="">{t('page.salaries.select_employee')}</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </div>
            <div className="xpl-field">
              <label>{t('field.type')}</label>
              <select className="xpl-select" value={inputKind} onChange={(e) => setInputKind(e.target.value as 'allowance' | 'deduction' | 'advance')} aria-label={t('field.type')}>
                <option value="allowance">{t('page.salaries.recurring_allowance')}</option>
                <option value="deduction">{t('page.salaries.recurring_deduction')}</option>
                <option value="advance">{t('page.salaries.advance')}</option>
              </select>
            </div>
            <div className="xpl-field">
              <label>{inputKind === 'advance' ? t('page.salaries.notes_ph') : t('page.salaries.name_ph')}</label>
              <input className="xpl-input" value={inputName} onChange={(e) => setInputName(e.target.value)} aria-label={t('page.salaries.name_ph')} />
            </div>
            <div className="xpl-field">
              <label>{t('page.salaries.amount_ph')}</label>
              <input className="xpl-input" type="number" step="0.001" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} style={{ direction: 'ltr' }} aria-label={t('page.salaries.amount_ph')} />
            </div>
            <div className="xpl-field xpl-field--full">
              <Button variant="secondary" icon="add" busy={busy} onClick={addPayrollInput}>{t('page.salaries.save_input')}</Button>
            </div>
          </DialogSection>

          <DialogSection title={t('section.manual_draft_line')} icon="edit_note">
            <div className="xpl-field">
              <label>{t('page.salaries.draft_payroll')}</label>
              <select className="xpl-select" value={adjustPayrollId} onChange={(e) => setAdjustPayrollId(e.target.value)} aria-label={t('page.salaries.draft_payroll')}>
                <option value="">{t('page.salaries.draft_payroll')}</option>
                {rows.filter((r) => r.status === 'DRAFT').map((r) => <option key={r.id} value={r.id}>{r.employee?.fullName} - {r.month}/{r.year}</option>)}
              </select>
            </div>
            <div className="xpl-field">
              <label>{t('field.type')}</label>
              <select className="xpl-select" value={adjustType} onChange={(e) => setAdjustType(e.target.value as 'ALLOWANCE' | 'DEDUCTION')} aria-label={t('field.type')}>
                <option value="ALLOWANCE">{t('page.salaries.manual_allowance')}</option>
                <option value="DEDUCTION">{t('page.salaries.manual_deduction')}</option>
              </select>
            </div>
            <div className="xpl-field">
              <label>{t('page.salaries.label_ph')}</label>
              <input className="xpl-input" value={adjustLabel} onChange={(e) => setAdjustLabel(e.target.value)} aria-label={t('page.salaries.label_ph')} />
            </div>
            <div className="xpl-field">
              <label>{t('page.salaries.amount_ph')}</label>
              <input className="xpl-input" type="number" step="0.001" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} style={{ direction: 'ltr' }} aria-label={t('page.salaries.amount_ph')} />
            </div>
            <div className="xpl-field xpl-field--full">
              <Button variant="secondary" icon="playlist_add" busy={busy} onClick={addManualLine}>{t('page.salaries.add_line')}</Button>
            </div>
          </DialogSection>
        </Dialog>
      )}
    </div>
  );
}
