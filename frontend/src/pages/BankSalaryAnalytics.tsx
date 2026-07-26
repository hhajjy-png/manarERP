import { useState, useEffect, useCallback, useRef } from 'react';
import { printCurrentView } from '../utils/print';
import { useNavigate } from 'react-router-dom';
import DateInput from '../components/DateInput';
import { api } from '../api/client';
import { useUI } from '../stores/uiStore';
import { useToastStore } from '../stores/toastStore';
import PrivateAmount from '../components/PrivateAmount';
import { formatCurrency, formatNumber, formatPercent } from '../lib/format';
import { formatDate } from '../lib/date';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { downloadBlob } from '../utils/exportUtils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { CHART_INITIAL_DIMENSION } from '../lib/rechartsDefaults';
import { Pagination } from '../components/explorer/ExplorerKit';
import SortableHeader from '../components/SortableHeader';
import { usePersistedState } from '../hooks/usePersistedState';
import './BankSalaryAnalytics.css';
import { money, MoneyText } from '../config/modules';
import { fcMoneyHeader } from '../components/financial/financialLabels';
import { useT } from '../lib/i18n';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MonthRow {
  sourceMonth: string;
  year: number;
  month: number;
  totalAmount: number;
  count: number;
  varianceFromPrev: number | null;
  employeeCount?: number;
  avg?: number;
  highest?: number;
  lowest?: number;
}

interface GlobalAnalytics {
  totalAmount: number;
  totalPayments: number;
  uniqueEmployees: number;
  months: MonthRow[];
  topEmployees: {
    civilId: string | null;
    beneficiaryName: string;
    totalAmount: number;
    count: number;
    avgAmount: number;
    latestPaymentDate: string | null;
    employeeId: number | null;
  }[];
  latestImport: { importedAt: string; batchCount: number; totalAmount: number } | null;
}

interface EmployeeOption {
  id: number;
  code: string;
  fullName: string;
  fullNameEn: string | null;
  civilId: string | null;
  bankAccount: string | null;
}

interface EmployeeDetail {
  employee: {
    id: number;
    code: string;
    fullName: string;
    fullNameEn: string | null;
    civilId: string | null;
    bankAccount: string | null;
    jobTitle: string | null;
    department: string | null;
    status: string;
  };
  stats: {
    totalPayments: number;
    totalAmount: number;
    firstPayment: string | null;
    lastPayment: string | null;
    avgMonthlyAmount: number;
    salaryChangeCount: number;
    highestPayment: number;
    lowestPayment: number;
    distinctMonths: number;
    salaryChangeAmount: number;
    salaryChangePercent: number;
  };
  monthlyHistory: MonthRow[];
}

interface TransactionRow {
  id: number;
  transactionId: string;
  sourceMonth: string | null;
  paymentDate: string | null;
  beneficiaryAccount: string | null;
  beneficiaryName: string;
  amount: number;
  currency: string;
  status: string | null;
  civilId: string | null;
  matchedBy: string | null;
  createdAt: string;
}

interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

interface Filters {
  payrollYear?: number;
  payrollMonth?: number;
  employeeId?: number;
  employeeName?: string;
  dateFrom?: string;
  dateTo?: string;
  amountFrom?: string;
  amountTo?: string;
  transactionId?: string;
  civilId?: string;
  bankAccount?: string;
  status?: string;
  search?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

type QuickChip = 'all' | '1m' | '3m' | '6m' | 'year' | 'lastyear' | 'highest' | 'lowest' | 'newest' | 'oldest';

const QUICK_CHIPS: { key: QuickChip; labelKey: string }[] = [
  { key: 'all',      labelKey: 'bank.salary_analytics.chip_all' },
  { key: '1m',       labelKey: 'bank.salary_analytics.chip_last_month' },
  { key: '3m',       labelKey: 'bank.salary_analytics.chip_last_3_months' },
  { key: '6m',       labelKey: 'bank.salary_analytics.chip_last_6_months' },
  { key: 'year',     labelKey: 'bank.salary_analytics.chip_this_year' },
  { key: 'lastyear', labelKey: 'bank.salary_analytics.chip_last_year' },
  { key: 'highest',  labelKey: 'bank.salary_analytics.chip_highest_salaries' },
  { key: 'lowest',   labelKey: 'bank.salary_analytics.chip_lowest_salaries' },
  { key: 'newest',   labelKey: 'bank.salary_analytics.chip_newest_transfers' },
  { key: 'oldest',   labelKey: 'bank.salary_analytics.chip_oldest_transfers' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt3 = (n: number) => formatNumber(n);
const fmtDate = (iso: string | null) => formatDate(iso);

function buildParams(f: Filters, extra: Record<string, unknown> = {}): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.payrollYear) p.payrollYear = String(f.payrollYear);
  if (f.payrollMonth) p.payrollMonth = String(f.payrollMonth);
  if (f.employeeId) p.employeeId = String(f.employeeId);
  if (f.dateFrom) p.dateFrom = f.dateFrom;
  if (f.dateTo) p.dateTo = f.dateTo;
  if (f.amountFrom) p.amountFrom = f.amountFrom;
  if (f.amountTo) p.amountTo = f.amountTo;
  if (f.transactionId) p.transactionId = f.transactionId;
  if (f.civilId) p.civilId = f.civilId;
  if (f.bankAccount) p.bankAccount = f.bankAccount;
  if (f.status) p.status = f.status;
  if (f.search) p.search = f.search;
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== '' && v !== null) p[k] = String(v);
  }
  return p;
}

interface FilterChip { key: keyof Filters; label: string }

function getActiveChips(f: Filters, t: (key: string, vars?: Record<string, string | number>) => string): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.payrollYear) chips.push({ key: 'payrollYear', label: t('bank.salary_analytics.chip_year_value', { year: f.payrollYear }) });
  if (f.payrollMonth) chips.push({ key: 'payrollMonth', label: t('bank.salary_analytics.chip_month_value', { month: MONTHS_AR[(f.payrollMonth ?? 1) - 1] }) });
  if (f.employeeId && f.employeeName) chips.push({ key: 'employeeId', label: t('bank.salary_analytics.chip_employee_value', { name: f.employeeName }) });
  if (f.dateFrom) chips.push({ key: 'dateFrom', label: t('bank.salary_analytics.chip_from_value', { date: f.dateFrom }) });
  if (f.dateTo) chips.push({ key: 'dateTo', label: t('bank.salary_analytics.chip_to_value', { date: f.dateTo }) });
  if (f.amountFrom) chips.push({ key: 'amountFrom', label: t('bank.salary_analytics.chip_amount_from_value', { amount: f.amountFrom }) });
  if (f.amountTo) chips.push({ key: 'amountTo', label: t('bank.salary_analytics.chip_amount_to_value', { amount: f.amountTo }) });
  if (f.transactionId) chips.push({ key: 'transactionId', label: t('bank.salary_analytics.chip_transaction_value', { id: f.transactionId }) });
  if (f.civilId) chips.push({ key: 'civilId', label: t('bank.salary_analytics.chip_civil_id_value', { id: f.civilId }) });
  if (f.bankAccount) chips.push({ key: 'bankAccount', label: t('bank.salary_analytics.chip_account_value', { account: f.bankAccount }) });
  if (f.status) chips.push({ key: 'status', label: t('bank.salary_analytics.chip_status_value', { status: f.status }) });
  if (f.search) chips.push({ key: 'search', label: t('bank.salary_analytics.chip_search_value', { query: f.search }) });
  return chips;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1a2535', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '10px 14px', fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif', direction: 'rtl' }}>
      <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6, marginTop: 0 }}>{label}</p>
      <p style={{ color: '#60A5FA', fontSize: 13, fontWeight: 700, margin: 0 }}>{<MoneyText value={Number(payload[0].value)} />}</p>
    </div>
  );
};

function Skel({ w, h }: { w?: string; h?: number }) {
  return <div className="psa-skel" style={{ width: w ?? '100%', height: h ?? 13 }} />;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BankSalaryAnalytics() {
  const { lang } = useUI();
  const isRtl = lang === 'ar';
  const navigate = useNavigate();
  const { t } = useT();

  const emptyFilters: Filters = {};
  const [draftFilters, setDraftFilters]     = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen]       = useState(false);
  const [chartsOpen, setChartsOpen]         = useState(true);
  const [quickChip, setQuickChip]           = useState<QuickChip>('all');

  const [analytics, setAnalytics] = useState<GlobalAnalytics | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const [empQuery, setEmpQuery]               = useState('');
  const [empSuggestions, setEmpSuggestions]   = useState<EmployeeOption[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [empDetail, setEmpDetail]             = useState<EmployeeDetail | null>(null);
  const [empDetailLoading, setEmpDetailLoading] = useState(false);
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const [txPage, setTxPage]       = useState(1);
  const [txPageSize, setTxPageSize] = useState<number>(25);
  // فرز خادمي كان قائمًا هنا قبل الأساس الموحّد (السابقة المرجعية) — واجهته الآن
  // موحّدة (SortableHeader) ودورته قياسية (افتراضي→تصاعدي→تنازلي→افتراضي؛
  // الافتراضي = paymentDate تنازليًا) وحالته محفوظة كسائر الشبكات.
  const [txSortBy, setTxSortBy]   = usePersistedState('sal:bankTx:sortBy', 'paymentDate');
  const [txSortDir, setTxSortDir] = usePersistedState<'asc' | 'desc'>('sal:bankTx:sortDir', 'desc');
  const [txData, setTxData]       = useState<PaginatedResult<TransactionRow> | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // ── Outside click handlers ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setEmpSuggestions([]);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Toast helper ───────────────────────────────────────────────────────────
  // Shared toast mechanism (stores/toastStore.ts + Toast.tsx, mounted once in
  // Layout.tsx) instead of a page-local single-slot toast.
  const addToast = useToastStore((s) => s.add);
  const showToast = useCallback((msg: string, type: 'ok' | 'error' = 'ok') => {
    addToast(msg, type);
  }, [addToast]);

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadAnalytics = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/salaries/bank-payments/analytics', { params: buildParams(f) });
      setAnalytics(res.data.data);
    } catch {
      setError(t('bank.salary_analytics.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadTransactions = useCallback(async (f: Filters, page: number, pageSize: number, sortBy: string, sortDir: 'asc' | 'desc') => {
    setTxLoading(true);
    try {
      const res = await api.get('/salaries/bank-payments/transactions', {
        params: buildParams(f, { page, pageSize, sortBy, sortDir }),
      });
      setTxData(res.data.data);
    } catch { /* intentional */ } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics(appliedFilters);
    setTxPage(1);
    loadTransactions(appliedFilters, 1, txPageSize, txSortBy, txSortDir);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  useEffect(() => {
    loadTransactions(appliedFilters, txPage, txPageSize, txSortBy, txSortDir);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txPage, txPageSize, txSortBy, txSortDir]);

  const loadEmployeeDetail = useCallback(async (emp: EmployeeOption, f: Filters) => {
    setEmpDetailLoading(true);
    try {
      const res = await api.get(`/salaries/bank-payments/employee/${emp.id}`, { params: buildParams(f) });
      setEmpDetail(res.data.data);
    } catch { setEmpDetail(null); } finally {
      setEmpDetailLoading(false);
    }
  }, []);

  // ── Employee autocomplete ──────────────────────────────────────────────────

  const searchEmployees = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!q.trim()) { setEmpSuggestions([]); return; }
      try {
        const res = await api.get('/salaries/bank-payments/employees/search', { params: { q } });
        setEmpSuggestions(res.data.data ?? []);
      } catch { setEmpSuggestions([]); }
    }, 200);
  }, []);

  const selectEmployee = useCallback((emp: EmployeeOption | null, currentApplied?: Filters) => {
    const base = currentApplied ?? appliedFilters;
    setSelectedEmployee(emp);
    setEmpSuggestions([]);
    setEmpQuery(emp ? emp.fullName : '');
    const newFilters: Filters = { ...base, employeeId: emp?.id, employeeName: emp?.fullName };
    if (!emp) { delete newFilters.employeeId; delete newFilters.employeeName; }
    setDraftFilters(newFilters);
    setAppliedFilters(newFilters);
    if (emp) loadEmployeeDetail(emp, newFilters);
    else setEmpDetail(null);
  }, [appliedFilters, loadEmployeeDetail]);

  // ── Filter handlers ────────────────────────────────────────────────────────

  const applyFilters = () => {
    setAppliedFilters({ ...draftFilters });
    if (draftFilters.employeeId && selectedEmployee) {
      loadEmployeeDetail(selectedEmployee, draftFilters);
    }
  };

  const clearAllFilters = () => {
    setDraftFilters({});
    setAppliedFilters({});
    setEmpQuery('');
    setSelectedEmployee(null);
    setEmpDetail(null);
    setQuickChip('all');
  };

  const removeChip = (key: keyof Filters) => {
    const newFilters: Filters = { ...appliedFilters };
    delete newFilters[key];
    if (key === 'payrollYear') delete newFilters.payrollMonth;
    if (key === 'employeeId') {
      delete newFilters.employeeName;
      setSelectedEmployee(null);
      setEmpDetail(null);
      setEmpQuery('');
    }
    setDraftFilters(newFilters);
    setAppliedFilters(newFilters);
    setQuickChip('all');
  };

  const handleQuickChip = (chip: QuickChip) => {
    setQuickChip(chip);
    const now = new Date();
    const newF: Filters = { ...appliedFilters };
    delete newF.dateFrom;
    delete newF.dateTo;
    delete newF.payrollYear;
    delete newF.payrollMonth;
    delete newF.status;

    let newSortBy = txSortBy;
    let newSortDir: 'asc' | 'desc' = txSortDir;

    switch (chip) {
      case '1m': {
        const from = new Date(now); from.setMonth(from.getMonth() - 1);
        newF.dateFrom = from.toISOString().split('T')[0];
        newF.dateTo   = now.toISOString().split('T')[0];
        break;
      }
      case '3m': {
        const from = new Date(now); from.setMonth(from.getMonth() - 3);
        newF.dateFrom = from.toISOString().split('T')[0];
        newF.dateTo   = now.toISOString().split('T')[0];
        break;
      }
      case '6m': {
        const from = new Date(now); from.setMonth(from.getMonth() - 6);
        newF.dateFrom = from.toISOString().split('T')[0];
        newF.dateTo   = now.toISOString().split('T')[0];
        break;
      }
      case 'year':
        newF.payrollYear = now.getFullYear();
        break;
      case 'lastyear':
        newF.payrollYear = now.getFullYear() - 1;
        break;
      case 'highest':
        newSortBy  = 'amount';
        newSortDir = 'desc';
        break;
      case 'lowest':
        newSortBy  = 'amount';
        newSortDir = 'asc';
        break;
      case 'newest':
        newSortBy  = 'paymentDate';
        newSortDir = 'desc';
        break;
      case 'oldest':
        newSortBy  = 'paymentDate';
        newSortDir = 'asc';
        break;
    }

    setDraftFilters(newF);
    setAppliedFilters(newF);
    if (newSortBy !== txSortBy || newSortDir !== txSortDir) {
      setTxSortBy(newSortBy);
      setTxSortDir(newSortDir);
      setTxPage(1);
    }
  };

  // ── Sort ───────────────────────────────────────────────────────────────────

  const handleSort = (field: string) => {
    // الدورة القياسية للأساس الموحّد: عمود جديد → تصاعدي؛ تصاعدي → تنازلي؛
    // تنازلي → العودة للافتراضي (paymentDate تنازليًا).
    if (txSortBy !== field) {
      setTxSortBy(field);
      setTxSortDir('asc');
    } else if (txSortDir === 'asc') {
      setTxSortDir('desc');
    } else {
      setTxSortBy('paymentDate');
      setTxSortDir('desc');
    }
    setTxPage(1);
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async (empId?: number, format: 'excel' | 'print' | 'csv' = 'excel') => {
    setExportMenuOpen(false);
    if (format === 'print') { printCurrentView(); return; }
    if (format === 'csv') {
      if (!txData?.data.length) { showToast(t('bank.salary_analytics.no_export_data'), 'error'); return; }
      const headers = [
        t('bank.salary_analytics.transaction_no'),
        t('bank.salary_analytics.month'),
        t('col.sal.payment_date'),
        t('col.sal.beneficiary'),
        t('col.amount'),
        t('col.cheque.currency'),
        t('field.civil_id'),
        t('field.status'),
      ];
      const rows = txData.data.map((r) => [
        `"${r.transactionId}"`,
        r.sourceMonth ?? '',
        r.paymentDate ?? '',
        `"${r.beneficiaryName.replace(/"/g, '""')}"`,
        r.amount.toFixed(3),
        r.currency,
        r.civilId ?? '',
        r.status ?? '',
      ]);
      const csv  = '﻿' + [headers, ...rows].map((row) => row.join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = generateExportFileName({ reportName: ReportName.BankAnalytics, identifier: empId ?? null, extension: 'csv' });
      a.click();
      URL.revokeObjectURL(a.href);
      showToast(t('bank.salary_analytics.export_csv_success'));
      return;
    }
    try {
      const params = buildParams(appliedFilters);
      if (empId) params.employeeId = String(empId);
      const res = await api.get('/salaries/bank-payments/export', { params, responseType: 'blob' });
      downloadBlob(res.data as Blob, generateExportFileName({ reportName: ReportName.BankAnalytics, identifier: empId ?? null, extension: 'xlsx' }));
      showToast(t('bank.salary_analytics.export_excel_success'));
    } catch {
      showToast(t('bank.salary_analytics.export_failed'), 'error');
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeChips = getActiveChips(appliedFilters, t);
  const varCls  = (v: number | null) => v === null ? 'psa-var-nil' : v >= 0 ? 'psa-var-pos' : 'psa-var-neg';
  const varLabel = (v: number | null) => v === null ? '—' : (v >= 0 ? '+' : '') + fmt3(v);

  const maxMonthAmount = analytics ? Math.max(...analytics.months.map((m) => m.totalAmount), 0) : 0;
  const maxHighest     = analytics ? Math.max(...analytics.months.map((m) => m.highest ?? 0), 0) : 0;
  const minLowest      = analytics ? Math.min(...analytics.months.filter((m) => m.lowest != null).map((m) => m.lowest!), Infinity) : 0;
  const avgSalary      = (analytics && analytics.totalPayments > 0) ? analytics.totalPayments > 0 ? analytics.totalAmount / analytics.totalPayments : 0 : 0;
  const posMonths      = analytics ? analytics.months.filter((m) => m.varianceFromPrev !== null && m.varianceFromPrev > 0).length : 0;
  const avgEmpCount    = analytics && analytics.months.length > 0
    ? analytics.months.reduce((s, m) => s + (m.employeeCount ?? 0), 0) / analytics.months.filter((m) => m.employeeCount != null).length
    : 0;

  const cumulativeData = analytics
    ? analytics.months.reduce<{ sourceMonth: string; cumulative: number }[]>((acc, m) => {
        const prev = acc[acc.length - 1]?.cumulative ?? 0;
        acc.push({ sourceMonth: m.sourceMonth, cumulative: prev + m.totalAmount });
        return acc;
      }, [])
    : [];

  const varianceData = analytics
    ? analytics.months.filter((m) => m.varianceFromPrev !== null).map((m) => ({
        sourceMonth: m.sourceMonth,
        variance: m.varianceFromPrev,
        isPositive: (m.varianceFromPrev ?? 0) >= 0,
      }))
    : [];

  const qualityWarnings: { key: string; label: string }[] = [];
  if (analytics) {
    const unmatched = analytics.topEmployees.filter((e) => e.employeeId === null).length;
    if (unmatched > 0) qualityWarnings.push({ key: 'unmatched', label: t('bank.salary_analytics.warn_unmatched', { count: unmatched }) });
    const noEmpMonths = analytics.months.filter((m) => !m.employeeCount).length;
    if (noEmpMonths > 0) qualityWarnings.push({ key: 'noEmpMonths', label: t('bank.salary_analytics.warn_no_emp_months', { count: noEmpMonths }) });
    const bigDrop = analytics.months.filter((m) => m.varianceFromPrev !== null && m.varianceFromPrev < -5000).length;
    if (bigDrop > 0) qualityWarnings.push({ key: 'bigDrop', label: t('bank.salary_analytics.warn_big_drop', { count: bigDrop }) });
    if (analytics.months.length === 0 && analytics.totalPayments > 0) {
      qualityWarnings.push({ key: 'noMonths', label: t('bank.salary_analytics.warn_no_months') });
    }
  }

  // ── KPI card data ──────────────────────────────────────────────────────────

  const kpiCards = analytics ? [
    {
      label: t('bank.salary_analytics.kpi_total_amount_label'),
      // كان الرمز يُعرض كسطر «sub» **تحت** الرقم. صار بجواره في سطر واحد، ويتبع الإعداد.
      value: <PrivateAmount value={analytics.totalAmount} />,
      sub: '',
      icon: 'payments',
      bg: 'rgba(59,130,246,0.12)',
      color: '#3B82F6',
    },
    {
      label: t('bank.salary_analytics.kpi_total_transfers_label'),
      value: analytics.totalPayments.toLocaleString('ar-KW'),
      sub: t('bank.salary_analytics.unit_transfer'),
      icon: 'receipt_long',
      bg: 'rgba(139,92,246,0.12)',
      color: '#8B5CF6',
    },
    {
      label: t('bank.salary_analytics.kpi_listed_employees_label'),
      value: analytics.uniqueEmployees.toLocaleString('ar-KW'),
      sub: t('bank.salary_analytics.unit_unique_employee'),
      icon: 'group',
      bg: 'rgba(16,185,129,0.12)',
      color: '#10B981',
      clickable: true,
      onClick: () => { setFiltersOpen(true); },
    },
    {
      label: t('bank.salary_analytics.kpi_tracked_months_label'),
      value: analytics.months.length.toLocaleString('ar-KW'),
      sub: t('bank.salary_analytics.unit_data_month'),
      icon: 'calendar_month',
      bg: 'rgba(99,102,241,0.12)',
      color: '#6366F1',
    },
    {
      label: t('bank.salary_analytics.kpi_avg_salary_label'),
      value: <PrivateAmount value={fmt3(avgSalary)} />,
      sub: t('bank.salary_analytics.unit_kwd_per_transfer'),
      icon: 'calculate',
      bg: 'rgba(20,184,166,0.12)',
      color: '#14B8A6',
    },
    {
      label: t('bank.salary_analytics.kpi_highest_month_label'),
      value: <PrivateAmount value={fmt3(maxMonthAmount)} />,
      sub: t('bank.salary_analytics.unit_kwd_monthly_total'),
      icon: 'trending_up',
      bg: 'rgba(22,163,74,0.12)',
      color: '#16A34A',
    },
    {
      label: t('bank.salary_analytics.kpi_latest_import_label'),
      value: analytics.latestImport ? fmtDate(analytics.latestImport.importedAt) : '—',
      sub: analytics.latestImport ? t('bank.salary_analytics.batch_count', { count: analytics.latestImport.batchCount }) : t('bank.salary_analytics.none'),
      icon: 'upload_file',
      bg: 'var(--surface-2)',
      color: 'var(--text-muted)',
    },
    {
      label: t('bank.salary_analytics.kpi_increase_months_label'),
      value: posMonths.toLocaleString('ar-KW'),
      sub: t('bank.salary_analytics.of_months_count', { count: analytics.months.length }),
      icon: 'show_chart',
      bg: posMonths > 0 ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.08)',
      color: posMonths > 0 ? '#16A34A' : '#ef4444',
    },
  ] : [];

  // ── Insights data ──────────────────────────────────────────────────────────

  const insightCards = analytics ? [
    {
      icon: 'arrow_upward',
      iconColor: '#16A34A',
      label: t('bank.salary_analytics.insight_max_transfer_label'),
      // القيمة الغائبة تعرض «—» وحدها — لا «— KWD».
      value: maxHighest > 0 ? <PrivateAmount value={maxHighest} /> : <span>—</span>,
      sub: '',
    },
    {
      icon: 'arrow_downward',
      iconColor: '#ef4444',
      label: t('bank.salary_analytics.insight_min_transfer_label'),
      value: minLowest < Infinity && minLowest > 0 ? <PrivateAmount value={minLowest} /> : <span>—</span>,
      sub: '',
    },
    {
      icon: 'workspace_premium',
      iconColor: '#F59E0B',
      label: t('bank.salary_analytics.insight_top_paid_employee_label'),
      value: analytics.topEmployees[0]?.beneficiaryName ?? '—',
      sub: analytics.topEmployees[0] ? <MoneyText value={analytics.topEmployees[0].totalAmount} /> : '',
    },
    {
      icon: 'emoji_events',
      iconColor: '#8B5CF6',
      label: t('bank.salary_analytics.insight_most_transfers_employee_label'),
      value: [...analytics.topEmployees].sort((a, b) => b.count - a.count)[0]?.beneficiaryName ?? '—',
      sub: t('bank.salary_analytics.op_count', { count: [...analytics.topEmployees].sort((a, b) => b.count - a.count)[0]?.count ?? 0 }),
    },
    {
      icon: 'trending_up',
      iconColor: '#3B82F6',
      label: t('bank.salary_analytics.insight_positive_months_label'),
      value: `${posMonths} / ${analytics.months.length}`,
      sub: t('bank.salary_analytics.months_with_salary_increase'),
    },
    {
      icon: 'people',
      iconColor: '#6366F1',
      label: t('bank.salary_analytics.insight_avg_employees_monthly_label'),
      value: Number.isFinite(avgEmpCount) ? Math.round(avgEmpCount).toLocaleString('ar-KW') : '—',
      sub: t('bank.salary_analytics.unit_employee_per_month'),
    },
    {
      icon: 'schedule',
      iconColor: '#14B8A6',
      label: t('bank.salary_analytics.insight_latest_data_month_label'),
      value: analytics.months.length > 0 ? analytics.months[analytics.months.length - 1].sourceMonth : '—',
      sub: analytics.months.length > 0 ? <MoneyText value={analytics.months[analytics.months.length - 1].totalAmount} /> : '',
    },
    {
      icon: 'change_history',
      iconColor: posMonths >= analytics.months.length / 2 ? '#16A34A' : '#ef4444',
      label: t('bank.salary_analytics.insight_total_change_label'),
      value: analytics.months.length >= 2
        ? formatPercent((analytics.months[analytics.months.length - 1].totalAmount - analytics.months[0].totalAmount) / analytics.months[0].totalAmount * 100, 1)
        : '—',
      sub: analytics.months.length >= 2 ? `${analytics.months[0].sourceMonth} ← ${analytics.months[analytics.months.length - 1].sourceMonth}` : '',
    },
  ] : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="psa-ws" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* ── Package A: Professional Page Header ─────────────────────────── */}
      <div className="psa-header">
        <div className="psa-header-meta">
          <h1>{t('bank.salary_analytics.page_title')}</h1>
          <p>{t('bank.salary_analytics.page_subtitle')}</p>
          <div className="psa-header-chips">
            {analytics && (
              <>
                <span className="psa-header-tag blue">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>payments</span>
                  <PrivateAmount value={analytics.totalAmount} />
                </span>
                <span className="psa-header-tag green">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>group</span>
                  {t('bank.salary_analytics.employee_count', { count: analytics.uniqueEmployees })}
                </span>
                <span className="psa-header-tag gray">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>receipt_long</span>
                  {t('bank.salary_analytics.op_count', { count: analytics.totalPayments.toLocaleString('ar-KW') })}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="psa-header-actions">
          <button
            type="button"
            onClick={() => navigate('/payroll/bank-import')}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
            {t('bank.salary_analytics.import_file')}
          </button>
          {/* Package M: Export dropdown */}
          <div className="psa-export-wrap" ref={exportMenuRef}>
            <button
              type="button"
              className="btn"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#16a34a', borderColor: '#16a34a' }}
              onClick={() => setExportMenuOpen((o) => !o)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              {t('audit.action.EXPORT')}
              <span className="material-symbols-outlined" style={{ fontSize: 14, opacity: 0.8 }}>expand_more</span>
            </button>
            {exportMenuOpen && (
              <div className="psa-export-menu">
                <button className="psa-export-item" onClick={() => handleExport(undefined, 'excel')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#217346' }}>table_chart</span>
                  <span style={{ color: '#217346' }}>Excel</span>
                </button>
                <button className="psa-export-item" onClick={() => handleExport(undefined, 'csv')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366F1' }}>data_table</span>
                  {t('bank.salary_analytics.export_csv')}
                </button>
                <div className="psa-export-divider" />
                <button className="psa-export-item" onClick={() => handleExport(undefined, 'print')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>print</span>
                  {t('audit.action.PRINT')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Package B+L: KPI Dashboard (8 cards) ──────────────────────── */}
      <div className="psa-kpi-grid">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="psa-kpi-skel">
                <div className="psa-skel" style={{ width: 50, height: 50, borderRadius: 14, flex: 'none' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skel w="70%" h={11} />
                  <Skel w="55%" h={22} />
                  <Skel w="40%" h={10} />
                </div>
              </div>
            ))
          : kpiCards.map((kpi, i) => (
              kpi.clickable
                ? (
                  <button
                    key={i}
                    type="button"
                    className="psa-kpi clickable"
                    onClick={kpi.onClick}
                  >
                    <div className="psa-kpi-icon" style={{ background: kpi.bg }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 22, color: kpi.color }}>{kpi.icon}</span>
                    </div>
                    <div className="psa-kpi-body">
                      <div className="psa-kpi-label">{kpi.label}</div>
                      <div className="psa-kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
                      <div className="psa-kpi-sub">{kpi.sub}</div>
                    </div>
                  </button>
                ) : (
                  <div key={i} className="psa-kpi">
                    <div className="psa-kpi-icon" style={{ background: kpi.bg }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 22, color: kpi.color }}>{kpi.icon}</span>
                    </div>
                    <div className="psa-kpi-body">
                      <div className="psa-kpi-label">{kpi.label}</div>
                      <div className="psa-kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
                      <div className="psa-kpi-sub">{kpi.sub}</div>
                    </div>
                  </div>
                )
            ))}
      </div>

      {/* ── Package D: Quick Filter Chips (10 chips) ──────────────────── */}
      <div className="psa-chips">
        {QUICK_CHIPS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            className={`psa-chip${quickChip === key ? ' chip-active' : ''}`}
            onClick={() => handleQuickChip(key)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* ── Package C: Smart Collapsible Filter Panel ─────────────────── */}
      <div className="card panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            className="psa-filter-toggle"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
            {filtersOpen ? t('bank.salary_analytics.hide_filters') : t('bank.salary_analytics.show_filters')}
            <span className="material-symbols-outlined" style={{ fontSize: 18, transition: 'transform 0.2s', transform: filtersOpen ? 'rotate(180deg)' : 'none' }}>expand_more</span>
            {activeChips.length > 0 && (
              <span className="psa-chip-badge">{activeChips.length}</span>
            )}
          </button>
          {activeChips.length > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_alt_off</span>
              {t('bank.salary_analytics.clear_all')}
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="psa-filter-body">

            {/* Group 1 — الموظف والفترة */}
            <div className="psa-filter-section">
              <p className="psa-filter-section-title">{t('bank.salary_analytics.section_employee_and_period')}</p>
              <div className="psa-filter-row">
                <div className="psa-filter-field" style={{ flex: 2 }}>
                  <label>{t('filter.employee')}</label>
                  <div className="psa-autocomplete-wrap" ref={autocompleteRef}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder={t('bank.salary_analytics.employee_search_placeholder')}
                        value={empQuery}
                        onChange={(e) => { setEmpQuery(e.target.value); searchEmployees(e.target.value); }}
                      />
                      {selectedEmployee && (
                        <button
                          type="button"
                          onClick={() => selectEmployee(null)}
                          style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', insetInlineEnd: 8, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                        </button>
                      )}
                    </div>
                    {empSuggestions.length > 0 && (
                      <div className="psa-autocomplete-dropdown">
                        {empSuggestions.map((e) => (
                          <button
                            type="button"
                            key={e.id}
                            className="psa-autocomplete-item"
                            onMouseDown={(ev) => { ev.preventDefault(); selectEmployee(e); setFiltersOpen(false); }}
                          >
                            <div className="psa-autocomplete-item-name">{e.fullName}</div>
                            <div className="psa-autocomplete-item-meta">{e.code} · {e.fullNameEn ?? ''} · {e.civilId ?? '—'}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="psa-filter-field">
                  <label>{t('bank.salary_analytics.year')}</label>
                  <select
                    title={t('bank.salary_analytics.year')}
                    value={draftFilters.payrollYear ?? ''}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, payrollYear: e.target.value ? Number(e.target.value) : undefined, payrollMonth: undefined }))}
                  >
                    <option value="">{t('bank.salary_analytics.all_years')}</option>
                    {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="psa-filter-field">
                  <label>{t('bank.salary_analytics.month')}</label>
                  <select
                    title={t('bank.salary_analytics.month')}
                    value={draftFilters.payrollMonth ?? ''}
                    disabled={!draftFilters.payrollYear}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, payrollMonth: e.target.value ? Number(e.target.value) : undefined }))}
                  >
                    <option value="">{t('bank.salary_analytics.all_months')}</option>
                    {MONTHS_AR.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Group 2 — نطاق التاريخ */}
            <div className="psa-filter-section">
              <p className="psa-filter-section-title">{t('bank.salary_analytics.section_date_range')}</p>
              <div className="psa-filter-row">
                <div className="psa-filter-field">
                  <label>{t('bank.salary_analytics.date_from')}</label>
                  <DateInput title={t('bank.salary_analytics.date_from')} value={draftFilters.dateFrom ?? ''} onChange={(v) => setDraftFilters((f) => ({ ...f, dateFrom: v || undefined }))} />
                </div>
                <div className="psa-filter-field">
                  <label>{t('bank.salary_analytics.date_to')}</label>
                  <DateInput title={t('bank.salary_analytics.date_to')} value={draftFilters.dateTo ?? ''} onChange={(v) => setDraftFilters((f) => ({ ...f, dateTo: v || undefined }))} />
                </div>
              </div>
            </div>

            {/* Group 3 — نطاق المبلغ */}
            <div className="psa-filter-section">
              <p className="psa-filter-section-title">{t('bank.salary_analytics.section_amount_range')}</p>
              <div className="psa-filter-row">
                <div className="psa-filter-field">
                  <label>{t('bank.salary_analytics.amount_from')}</label>
                  <input type="number" min="0" step="0.001" placeholder="0.000" value={draftFilters.amountFrom ?? ''} onChange={(e) => setDraftFilters((f) => ({ ...f, amountFrom: e.target.value || undefined }))} />
                </div>
                <div className="psa-filter-field">
                  <label>{t('bank.salary_analytics.amount_to')}</label>
                  <input type="number" min="0" step="0.001" placeholder="0.000" value={draftFilters.amountTo ?? ''} onChange={(e) => setDraftFilters((f) => ({ ...f, amountTo: e.target.value || undefined }))} />
                </div>
              </div>
            </div>

            {/* Group 4 — بحث متقدم */}
            <div className="psa-filter-section">
              <p className="psa-filter-section-title">{t('bank.salary_analytics.section_advanced_search')}</p>
              <div className="psa-filter-row">
                <div className="psa-filter-field">
                  <label>{t('bank.salary_analytics.transaction_no')}</label>
                  <input type="text" placeholder="TXN…" value={draftFilters.transactionId ?? ''} onChange={(e) => setDraftFilters((f) => ({ ...f, transactionId: e.target.value || undefined }))} />
                </div>
                <div className="psa-filter-field">
                  <label>{t('field.civil_id')}</label>
                  <input type="text" placeholder={t('bank.salary_analytics.civil_id_search_placeholder')} value={draftFilters.civilId ?? ''} onChange={(e) => setDraftFilters((f) => ({ ...f, civilId: e.target.value || undefined }))} />
                </div>
                <div className="psa-filter-field">
                  <label>{t('bank.salary_analytics.account_no')}</label>
                  <input type="text" placeholder={t('bank.salary_analytics.account_search_placeholder')} value={draftFilters.bankAccount ?? ''} onChange={(e) => setDraftFilters((f) => ({ ...f, bankAccount: e.target.value || undefined }))} />
                </div>
              </div>
            </div>

            {/* Group 5 — الحالة والبحث النصي */}
            <div className="psa-filter-section">
              <p className="psa-filter-section-title">{t('bank.salary_analytics.section_status_and_search')}</p>
              <div className="psa-filter-row">
                <div className="psa-filter-field" style={{ maxWidth: 200 }}>
                  <label>{t('field.status')}</label>
                  <select title={t('field.status')} value={draftFilters.status ?? ''} onChange={(e) => setDraftFilters((f) => ({ ...f, status: e.target.value || undefined }))}>
                    <option value="">{t('opt.all_statuses')}</option>
                    <option value="PROCESSED">PROCESSED</option>
                    <option value="PENDING">PENDING</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                </div>
                <div className="psa-filter-field">
                  <label>{t('bank.salary_analytics.text_search')}</label>
                  <input type="text" placeholder={t('bank.salary_analytics.text_search_placeholder')} value={draftFilters.search ?? ''} onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value || undefined }))} />
                </div>
              </div>
            </div>

            <div className="psa-filter-actions">
              <button type="button" className="btn" onClick={applyFilters} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                {t('bank.salary_analytics.apply_filters')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={clearAllFilters} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_alt_off</span>
                {t('bank.salary_analytics.reset')}
              </button>
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="psa-active-chips">
            {activeChips.map((chip) => (
              <span key={chip.key} className="psa-active-chip">
                {chip.label}
                <button type="button" onClick={() => removeChip(chip.key)} aria-label={t('bank.salary_analytics.remove_chip_aria', { label: chip.label })}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Package E: Summary Bar ─────────────────────────────────────── */}
      {analytics && !loading && (
        <div className="psa-summary-bar">
          <div className="psa-summary-stat">
            <span className="psa-summary-label">{t('bank.salary_analytics.operations')}</span>
            <span className="psa-summary-value">{txData?.meta.total.toLocaleString('ar-KW') ?? '—'}</span>
          </div>
          <div className="psa-summary-divider" />
          <div className="psa-summary-stat">
            <span className="psa-summary-label">{t('search.group.employee')}</span>
            <span className="psa-summary-value">{analytics.uniqueEmployees.toLocaleString('ar-KW')}</span>
          </div>
          <div className="psa-summary-divider" />
          <div className="psa-summary-stat">
            <span className="psa-summary-label">{t('bank.salary_analytics.months')}</span>
            <span className="psa-summary-value">{analytics.months.length}</span>
          </div>
          <div className="psa-summary-divider" />
          <div className="psa-summary-stat">
            <span className="psa-summary-label">{t('bank.salary_analytics.kpi_avg_salary_label')}</span>
            <span className="psa-summary-value"><PrivateAmount value={avgSalary} /></span>
          </div>
          <div className="psa-summary-divider" />
          <div className="psa-summary-stat">
            <span className="psa-summary-label">{t('msg.total')}</span>
            <span className="psa-summary-value"><PrivateAmount value={analytics.totalAmount} /></span>
          </div>
          {activeChips.length > 0 && (
            <>
              <div className="psa-summary-divider" />
              <div className="psa-summary-stat">
                <span className="psa-summary-label">{t('bank.salary_analytics.active_filters')}</span>
                <span className="psa-summary-value" style={{ color: 'var(--accent)' }}>{activeChips.length}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="psa-error-banner">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
          {error}
        </div>
      )}

      {/* ── Package I: Smart Analytics Insights (8 cards) ─────────────── */}
      {!loading && analytics && insightCards.length > 0 && (
        <div className="psa-insights-grid">
          {insightCards.map((c, i) => (
            <div key={i} className="psa-insight-card">
              <div className="psa-insight-icon">
                <span className="material-symbols-outlined" style={{ color: c.iconColor }}>{c.icon}</span>
              </div>
              <div className="psa-insight-label">{c.label}</div>
              <div className="psa-insight-value">{c.value}</div>
              {c.sub && <div className="psa-insight-sub">{c.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Package J: Data Quality Center ───────────────────────────── */}
      {!loading && qualityWarnings.length > 0 && (
        <div className="psa-quality-panel">
          <span className="material-symbols-outlined psa-quality-icon">warning</span>
          <div className="psa-quality-body">
            <p className="psa-quality-title">{t('bank.salary_analytics.data_quality_center_title', { count: qualityWarnings.length })}</p>
            <div className="psa-quality-list">
              {qualityWarnings.map((w) => (
                <span key={w.key} className="psa-quality-tag">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>info</span>
                  {w.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Package F: 6 Collapsible Charts ──────────────────────────── */}
      {!loading && analytics && analytics.months.length > 0 && (
        <div className="card panel">
          <button type="button" className="psa-charts-toggle" onClick={() => setChartsOpen((o) => !o)}>
            <div className="psa-charts-toggle-left">
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>bar_chart</span>
              {t('bank.salary_analytics.charts')}
              <span className="psa-chip-badge">{t('bank.salary_analytics.month_count', { count: analytics.months.length })}</span>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: chartsOpen ? 'rotate(180deg)' : 'none' }}>expand_more</span>
          </button>
          {chartsOpen && (
            <div className="psa-charts-grid">
              {/* Chart 1: Monthly totals */}
              <div className="card panel psa-chart-card">
                <h3 className="psa-chart-title">{t('bank.salary_analytics.chart_monthly_salaries')}</h3>
                <div className="psa-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
                    <BarChart data={analytics.months} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="sourceMonth" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="totalAmount" name={t('bank.salary_analytics.series_total_amount')} fill="#3b82f6" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Employee count per month */}
              <div className="card panel psa-chart-card">
                <h3 className="psa-chart-title">{t('bank.salary_analytics.chart_employee_count_monthly')}</h3>
                <div className="psa-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
                    <BarChart data={analytics.months.filter((m) => m.employeeCount != null)} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="sourceMonth" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div style={{ background: '#1a2535', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', direction: 'rtl' }}>
                              <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6, marginTop: 0 }}>{label}</p>
                              <p style={{ color: '#10B981', fontSize: 13, fontWeight: 700, margin: 0 }}>{t('bank.salary_analytics.employee_count', { count: Number(payload[0].value).toLocaleString('ar-KW') })}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="employeeCount" name={t('search.group.employee')} fill="#10b981" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 3: Monthly variance (pos=green, neg=red) */}
              {varianceData.length > 0 && (
                <div className="card panel psa-chart-card">
                  <h3 className="psa-chart-title">{t('bank.salary_analytics.chart_monthly_variance')}</h3>
                  <div className="psa-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
                      <BarChart data={varianceData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="sourceMonth" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="variance" name={t('bank.salary_analytics.difference')} radius={[4,4,0,0]}>
                          {varianceData.map((d, i) => (
                            <Cell key={i} fill={d.isPositive ? '#16a34a' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Chart 4: Top 5 employees */}
              {analytics.topEmployees.length > 0 && (
                <div className="card panel psa-chart-card">
                  <h3 className="psa-chart-title">{t('bank.salary_analytics.chart_top_5_employees')}</h3>
                  <div className="psa-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
                      <BarChart data={analytics.topEmployees.slice(0, 5)} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="beneficiaryName" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="totalAmount" name={t('msg.total')} fill="#8b5cf6" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Chart 5: Highest/Average salary per month */}
              <div className="card panel psa-chart-card">
                <h3 className="psa-chart-title">{t('bank.salary_analytics.chart_monthly_salary_range')}</h3>
                <div className="psa-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
                    <BarChart data={analytics.months.filter((m) => m.highest != null && m.avg != null)} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="sourceMonth" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div style={{ background: '#1a2535', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', direction: 'rtl', fontFamily: '"IBM Plex Sans Arabic", Arial, sans-serif' }}>
                              <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6, marginTop: 0 }}>{label}</p>
                              {payload.map((p, i) => <p key={i} style={{ color: p.color as string, fontSize: 12, fontWeight: 700, margin: '2px 0' }}>{p.name}: {<MoneyText value={Number(p.value)} />}</p>)}
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="highest" name={t('bank.salary_analytics.highest')} fill="#16a34a" radius={[4,4,0,0]} />
                      <Bar dataKey="avg"     name={t('bank.salary_analytics.average')} fill="#3b82f6" radius={[4,4,0,0]} />
                      <Bar dataKey="lowest"  name={t('bank.salary_analytics.lowest')}  fill="#ef4444" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 6: Cumulative total */}
              {cumulativeData.length > 0 && (
                <div className="card panel psa-chart-card">
                  <h3 className="psa-chart-title">{t('bank.salary_analytics.chart_cumulative_total')}</h3>
                  <div className="psa-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
                      <BarChart data={cumulativeData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="sourceMonth" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="cumulative" name={t('bank.salary_analytics.chart_cumulative_total')} fill="#14b8a6" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Analytics content */}
      {!loading && analytics && (
        <>
          {/* Monthly summary table */}
          {analytics.months.length > 0 && (
            <div className="psa-section-card">
              <div className="psa-section-head">
                <h2>{t('bank.salary_analytics.monthly_summary_title')}</h2>
                <div className="psa-chips" style={{ margin: 0 }}>
                  {(['all', '3m', '6m', 'year'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`psa-chip${quickChip === k ? ' chip-active' : ''}`}
                      style={{ fontSize: 12, padding: '3px 10px' }}
                      onClick={() => handleQuickChip(k)}
                    >
                      {t(QUICK_CHIPS.find((c) => c.key === k)?.labelKey ?? 'bank.salary_analytics.chip_all')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="psa-table-wrap" style={{ borderRadius: 0, border: 'none', boxShadow: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('bank.salary_analytics.month')}</th>
                      <th style={{ textAlign: 'end' }}>{fcMoneyHeader(t('col.amount'))}</th>
                      <th style={{ textAlign: 'end' }}>{t('perm.module.transactions')}</th>
                      <th style={{ textAlign: 'end' }}>{t('search.group.employee')}</th>
                      <th style={{ textAlign: 'end' }}>{t('bank.salary_analytics.average')}</th>
                      <th style={{ textAlign: 'end' }}>{t('bank.salary_analytics.highest')}</th>
                      <th style={{ textAlign: 'end' }}>{t('bank.salary_analytics.lowest')}</th>
                      <th style={{ textAlign: 'end' }}>{t('bank.salary_analytics.difference')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.months.map((m) => (
                      <tr key={m.sourceMonth}>
                        <td style={{ fontWeight: 700 }}>{m.sourceMonth}</td>
                        <td style={{ textAlign: 'end', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                          <PrivateAmount value={fmt3(m.totalAmount)} />
                        </td>
                        <td style={{ textAlign: 'end' }}>{m.count.toLocaleString('ar-KW')}</td>
                        <td style={{ textAlign: 'end', color: 'var(--text-muted)' }}>{m.employeeCount?.toLocaleString('ar-KW') ?? '—'}</td>
                        <td style={{ textAlign: 'end', fontFamily: 'monospace', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{m.avg != null ? fmt3(m.avg) : '—'}</td>
                        <td style={{ textAlign: 'end', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }} className="psa-var-pos">{m.highest != null ? fmt3(m.highest) : '—'}</td>
                        <td style={{ textAlign: 'end', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }} className="psa-var-neg">{m.lowest != null ? fmt3(m.lowest) : '—'}</td>
                        <td style={{ textAlign: 'end' }} className={varCls(m.varianceFromPrev)}>{varLabel(m.varianceFromPrev)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top employees table */}
          {!appliedFilters.employeeId && analytics.topEmployees.length > 0 && (
            <div className="psa-section-card">
              <div className="psa-section-head">
                <h2>{t('bank.salary_analytics.top_paid_employees_title')}</h2>
              </div>
              <div className="psa-table-wrap" style={{ borderRadius: 0, border: 'none', boxShadow: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('col.sal.beneficiary')}</th>
                      <th>{t('field.civil_id')}</th>
                      <th style={{ textAlign: 'end' }}>{fcMoneyHeader(t('bank.salary_analytics.total_bare'))}</th>
                      <th style={{ textAlign: 'end' }}>{t('perm.module.transactions')}</th>
                      <th style={{ textAlign: 'end' }}>{t('bank.salary_analytics.average_kwd')}</th>
                      <th>{t('bank.salary_analytics.latest_payment')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topEmployees.map((e, i) => (
                      <tr
                        key={i}
                        className={e.employeeId ? 'row-clickable' : ''}
                        onClick={() => {
                          if (e.employeeId) {
                            selectEmployee({ id: e.employeeId, code: '', fullName: e.beneficiaryName, fullNameEn: null, civilId: e.civilId, bankAccount: null });
                          }
                        }}
                      >
                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', textAlign: 'center', fontWeight: 400 }}>{i + 1}</td>
                        <td style={{ fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {e.beneficiaryName}
                            {e.employeeId && <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--accent)' }}>person_search</span>}
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{e.civilId ?? '—'}</td>
                        <td style={{ textAlign: 'end', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                          <PrivateAmount value={fmt3(e.totalAmount)} />
                        </td>
                        <td style={{ textAlign: 'end' }}>{e.count.toLocaleString('ar-KW')}</td>
                        <td style={{ textAlign: 'end', fontFamily: 'monospace', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt3(e.avgAmount)}</td>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(e.latestPaymentDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Package G + H: Transactions + Employee Drawer ─────────── */}
          <div className="psa-main-layout">

            {/* Package G: Modern Transactions Table */}
            <div className="psa-table-section">
              <div className="psa-section-card">
                <div className="psa-table-header">
                  <h2 className="psa-table-title">
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>receipt_long</span>
                    {t('perm.module.transactions')}
                    {txData && <span className="psa-table-count">({txData.meta.total.toLocaleString('ar-KW')})</span>}
                  </h2>
                  <div className="psa-page-size-row">
                    <label>{t('bank.salary_analytics.rows_label')}</label>
                    <select
                      title={t('bank.salary_analytics.page_size')}
                      value={txPageSize}
                      onChange={(e) => { setTxPageSize(Number(e.target.value)); setTxPage(1); }}
                    >
                      {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {txLoading ? (
                  <div style={{ padding: '8px 0' }}>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="psa-skel-row">
                        <Skel w="10%" h={13} />
                        <Skel w="15%" h={13} />
                        <Skel w="20%" h={13} />
                        <Skel w="25%" h={13} />
                        <Skel w="12%" h={13} />
                        <Skel w="10%" h={13} />
                      </div>
                    ))}
                  </div>
                ) : txData ? (
                  <>
                    {txData.data.length === 0 ? (
                      /* Package K: Professional empty state */
                      <div className="psa-empty">
                        <span className="material-symbols-outlined psa-empty-icon">receipt_long</span>
                        <div className="psa-empty-title">{t('bank.salary_analytics.no_transactions')}</div>
                        <div className="psa-empty-sub">{t('bank.salary_analytics.no_transactions_match_filters')}</div>
                        <button type="button" className="btn btn-secondary" onClick={clearAllFilters} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_alt_off</span>
                          {t('action.reset_filters_inline')}
                        </button>
                      </div>
                    ) : (
                      <div className="psa-table-wrap" style={{ borderRadius: 0, border: 'none', boxShadow: 'none' }}>
                        <table>
                          <thead>
                            <tr>
                              <th>{t('bank.salary_analytics.transaction_no')}</th>
                              <SortableHeader label={t('bank.salary_analytics.month')} title={t('bank.salary_analytics.month')} state={txSortBy === 'sourceMonth' ? txSortDir : 'none'}     onToggle={() => handleSort('sourceMonth')} />
                              <SortableHeader label={t('col.sal.payment_date')} title={t('col.sal.payment_date')} state={txSortBy === 'paymentDate' ? txSortDir : 'none'}     onToggle={() => handleSort('paymentDate')} />
                              <SortableHeader label={t('col.sal.beneficiary')} title={t('col.sal.beneficiary')} state={txSortBy === 'beneficiaryName' ? txSortDir : 'none'} onToggle={() => handleSort('beneficiaryName')} />
                              <SortableHeader label={t('bank.salary_analytics.amount_kwd')} title={t('col.amount')} state={txSortBy === 'amount' ? txSortDir : 'none'}          onToggle={() => handleSort('amount')} />
                              <th>{t('field.civil_id')}</th>
                              {appliedFilters.employeeId && <th>{t('bank.salary_analytics.matched_by')}</th>}
                              <th>{t('field.status')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {txData.data.map((row) => (
                              <tr key={row.id}>
                                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.transactionId}>
                                  {row.transactionId}
                                </td>
                                <td>{row.sourceMonth ?? '—'}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.paymentDate)}</td>
                                <td style={{ fontWeight: 700 }}>{row.beneficiaryName}</td>
                                <td style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                                  <PrivateAmount value={fmt3(row.amount)} />
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{row.civilId ?? '—'}</td>
                                {appliedFilters.employeeId && (
                                  <td>
                                    {row.matchedBy
                                      ? <span className="psa-match-badge">{row.matchedBy}</span>
                                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                  </td>
                                )}
                                <td>
                                  <span className={`psa-status ${row.status ?? 'default'}`}>
                                    {row.status ?? '—'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Pagination — shared ExplorerKit component, not a bespoke reimplementation */}
                    <Pagination meta={txData.meta} onPage={(p) => setTxPage(p)} />
                  </>
                ) : null}
              </div>
            </div>

            {/* Package H: Employee Details Drawer */}
            {selectedEmployee && (
              <div className="psa-details-side">
                <div className="psa-details-head">
                  <h3>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)', verticalAlign: 'middle', marginInlineEnd: 5 }}>person</span>
                    {t('bank.salary_analytics.employee_details_title')}
                  </h3>
                  <button type="button" className="psa-close-btn" onClick={() => selectEmployee(null)} aria-label={t('action.close')}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                </div>

                {empDetailLoading ? (
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Skel h={20} w="70%" />
                    <Skel h={14} w="50%" />
                    {Array.from({ length: 4 }).map((_, i) => <Skel key={i} h={13} />)}
                  </div>
                ) : empDetail ? (
                  <>
                    {/* Profile section */}
                    <div className="psa-details-section">
                      <p className="psa-details-sec-title">{t('bank.salary_analytics.employee_data_title')}</p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{empDetail.employee.fullName}</div>
                          {empDetail.employee.fullNameEn && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{empDetail.employee.fullNameEn}</div>
                          )}
                          {empDetail.employee.status !== 'active' && (
                            <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, padding: '2px 8px', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 20 }}>{t('status.inactive')}</span>
                          )}
                        </div>
                      </div>
                      {[
                        [t('col.acc.code'), empDetail.employee.code],
                        [t('field.civil_id'), empDetail.employee.civilId ?? '—'],
                        [t('bank.salary_analytics.account_no'), empDetail.employee.bankAccount ?? '—'],
                        [t('lbl.payslip.job_title'), empDetail.employee.jobTitle ?? '—'],
                        [t('lbl.payslip.department'), empDetail.employee.department ?? '—'],
                      ].map(([k, v]) => (
                        <div key={k} className="psa-detail-row">
                          <span className="psa-detail-lbl">{k}</span>
                          <span className="psa-detail-val">{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Stats section */}
                    <div className="psa-details-section">
                      <p className="psa-details-sec-title">{t('bank.salary_analytics.payment_stats_title')}</p>
                      <div className="psa-emp-stat-grid">
                        <div className="psa-emp-stat">
                          <div className="psa-emp-stat-lbl">{t('bank.salary_analytics.total_transfers')}</div>
                          <div className="psa-emp-stat-val">{empDetail.stats.totalPayments.toLocaleString('ar-KW')}</div>
                        </div>
                        <div className="psa-emp-stat">
                          <div className="psa-emp-stat-lbl">{t('bank.salary_analytics.months')}</div>
                          <div className="psa-emp-stat-val">{empDetail.stats.distinctMonths.toLocaleString('ar-KW')}</div>
                        </div>
                        <div className="psa-emp-stat">
                          <div className="psa-emp-stat-lbl">{t('bank.salary_analytics.total_kwd')}</div>
                          <div className="psa-emp-stat-val" style={{ fontSize: 12 }}><PrivateAmount value={fmt3(empDetail.stats.totalAmount)} /></div>
                        </div>
                        <div className="psa-emp-stat">
                          <div className="psa-emp-stat-lbl">{t('bank.salary_analytics.stat_average_kwd')}</div>
                          <div className="psa-emp-stat-val" style={{ fontSize: 12 }}><PrivateAmount value={fmt3(empDetail.stats.avgMonthlyAmount)} /></div>
                        </div>
                        <div className="psa-emp-stat">
                          <div className="psa-emp-stat-lbl" style={{ color: '#16a34a' }}>{t('bank.salary_analytics.stat_highest_kwd')}</div>
                          <div className="psa-emp-stat-val psa-var-pos" style={{ fontSize: 12 }}><PrivateAmount value={fmt3(empDetail.stats.highestPayment)} /></div>
                        </div>
                        <div className="psa-emp-stat">
                          <div className="psa-emp-stat-lbl" style={{ color: '#ef4444' }}>{t('bank.salary_analytics.stat_lowest_kwd')}</div>
                          <div className="psa-emp-stat-val psa-var-neg" style={{ fontSize: 12 }}><PrivateAmount value={fmt3(empDetail.stats.lowestPayment)} /></div>
                        </div>
                      </div>
                    </div>

                    {/* Salary change indicator */}
                    {empDetail.stats.distinctMonths > 1 && (
                      <div className="psa-details-section">
                        <p className="psa-details-sec-title">{t('bank.salary_analytics.salary_change_title')}</p>
                        <div className="psa-salary-change">
                          <span className="material-symbols-outlined psa-salary-change-icon" style={{ color: empDetail.stats.salaryChangeAmount >= 0 ? '#16a34a' : '#ef4444' }}>
                            {empDetail.stats.salaryChangeAmount >= 0 ? 'trending_up' : 'trending_down'}
                          </span>
                          <div>
                            <div className={`psa-salary-change-val ${empDetail.stats.salaryChangeAmount >= 0 ? 'psa-var-pos' : 'psa-var-neg'}`}>
                              {empDetail.stats.salaryChangeAmount >= 0 ? '+' : ''}{<MoneyText value={empDetail.stats.salaryChangeAmount} />}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              {empDetail.stats.salaryChangePercent >= 0 ? '+' : ''}{formatPercent(empDetail.stats.salaryChangePercent, 1)} {t('bank.salary_analytics.over_months', { months: empDetail.stats.distinctMonths })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Monthly timeline */}
                    {empDetail.monthlyHistory.length > 0 && (
                      <div className="psa-details-section">
                        <p className="psa-details-sec-title">{t('bank.salary_analytics.timeline_title')}</p>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: 'var(--surface-2)' }}>
                                <th style={{ padding: '6px 8px', textAlign: 'start', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10.5, textTransform: 'uppercase' }}>{t('bank.salary_analytics.month')}</th>
                                <th style={{ padding: '6px 8px', textAlign: 'end',  fontWeight: 700, color: 'var(--text-muted)', fontSize: 10.5, textTransform: 'uppercase' }}>{t('col.amount')}</th>
                                <th style={{ padding: '6px 8px', textAlign: 'end',  fontWeight: 700, color: 'var(--text-muted)', fontSize: 10.5, textTransform: 'uppercase' }}>{t('bank.salary_analytics.difference')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {empDetail.monthlyHistory.map((m) => (
                                <tr key={m.sourceMonth} style={{ borderTop: '1px solid var(--border)' }}>
                                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{m.sourceMonth}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'end', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                                    <PrivateAmount value={fmt3(m.totalAmount)} />
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'end' }} className={varCls(m.varianceFromPrev)}>
                                    {varLabel(m.varianceFromPrev)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="psa-details-actions">
                      <button type="button" className="btn" onClick={() => handleExport(empDetail.employee.id, 'excel')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#16a34a', borderColor: '#16a34a', fontSize: 13 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>download</span>
                        {t('bank.salary_analytics.export_his_record')}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => navigate('/employees')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>open_in_new</span>
                        {t('bank.salary_analytics.view_employee_profile')}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="psa-empty" style={{ padding: '32px 20px' }}>
                    <span className="material-symbols-outlined psa-empty-icon" style={{ fontSize: 36 }}>person_off</span>
                    <div className="psa-empty-title" style={{ fontSize: 13 }}>{t('bank.salary_analytics.no_payments')}</div>
                    <div className="psa-empty-sub" style={{ fontSize: 12 }}>{t('bank.salary_analytics.no_payments_for_employee_in_range')}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty state when no analytics loaded yet */}
      {!loading && !analytics && !error && (
        <div className="card panel">
          <div className="psa-empty">
            <span className="material-symbols-outlined psa-empty-icon">analytics</span>
            <div className="psa-empty-title">{t('msg.empty')}</div>
            <div className="psa-empty-sub">{t('bank.salary_analytics.import_to_start_hint')}</div>
            <button type="button" className="btn" onClick={() => navigate('/payroll/bank-import')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
              {t('bank.salary_analytics.import_new_file')}
            </button>
          </div>
        </div>
      )}

      {/* Toast rendering is now handled globally by the shared Toast component
          (mounted once in Layout.tsx) — no page-local toast markup needed. */}
    </div>
  );
}
