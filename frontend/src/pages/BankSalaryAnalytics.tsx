import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useUI } from '../stores/uiStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

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

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt3 = (n: number) => n.toLocaleString('ar-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-KW') : '—');

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

function getActiveChips(f: Filters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.payrollYear) chips.push({ key: 'payrollYear', label: `السنة: ${f.payrollYear}` });
  if (f.payrollMonth) chips.push({ key: 'payrollMonth', label: `الشهر: ${MONTHS_AR[(f.payrollMonth ?? 1) - 1]}` });
  if (f.employeeId && f.employeeName) chips.push({ key: 'employeeId', label: `الموظف: ${f.employeeName}` });
  if (f.dateFrom) chips.push({ key: 'dateFrom', label: `من: ${f.dateFrom}` });
  if (f.dateTo) chips.push({ key: 'dateTo', label: `إلى: ${f.dateTo}` });
  if (f.amountFrom) chips.push({ key: 'amountFrom', label: `م.من: ${f.amountFrom}` });
  if (f.amountTo) chips.push({ key: 'amountTo', label: `م.إلى: ${f.amountTo}` });
  if (f.transactionId) chips.push({ key: 'transactionId', label: `معاملة: ${f.transactionId}` });
  if (f.civilId) chips.push({ key: 'civilId', label: `م.مدني: ${f.civilId}` });
  if (f.bankAccount) chips.push({ key: 'bankAccount', label: `حساب: ${f.bankAccount}` });
  if (f.status) chips.push({ key: 'status', label: `الحالة: ${f.status}` });
  if (f.search) chips.push({ key: 'search', label: `بحث: ${f.search}` });
  return chips;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const Skeleton = ({ w, h }: { w?: string; h?: string }) => (
  <div className={`bg-neutral-200 dark:bg-neutral-700 animate-pulse rounded ${w ?? 'w-full'} ${h ?? 'h-4'}`} />
);

function SortTh({ field, label, sortBy, sortDir, onSort, cls = '' }: {
  field: string; label: string; sortBy: string; sortDir: 'asc' | 'desc';
  onSort: (f: string) => void; cls?: string;
}) {
  const active = sortBy === field;
  return (
    <th
      className={`text-start pb-2 font-medium text-neutral-500 text-xs uppercase tracking-wide cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors ${cls}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <span className="material-symbols-outlined text-xs leading-none" style={{ fontSize: 12 }}>
          {active ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
        </span>
      </span>
    </th>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BankSalaryAnalytics() {
  const { lang } = useUI();
  const isRtl = lang === 'ar';
  const navigate = useNavigate();

  const emptyFilters: Filters = {};
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [analytics, setAnalytics] = useState<GlobalAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [empQuery, setEmpQuery] = useState('');
  const [empSuggestions, setEmpSuggestions] = useState<EmployeeOption[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [empDetail, setEmpDetail] = useState<EmployeeDetail | null>(null);
  const [empDetailLoading, setEmpDetailLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const insightCardRef = useRef<HTMLDivElement>(null);

  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState<number>(25);
  const [txSortBy, setTxSortBy] = useState('paymentDate');
  const [txSortDir, setTxSortDir] = useState<'asc' | 'desc'>('desc');
  const [txData, setTxData] = useState<PaginatedResult<TransactionRow> | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  const [monthQuickFilter, setMonthQuickFilter] = useState<'all' | '3m' | '6m' | 'year'>('all');

  // ── Outside click for autocomplete ─────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setEmpSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadAnalytics = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/salaries/bank-payments/analytics', { params: buildParams(f) });
      setAnalytics(res.data.data);
    } catch {
      setError('فشل تحميل بيانات التحليلات');
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (emp) {
      loadEmployeeDetail(emp, newFilters);
      setTimeout(() => insightCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    } else {
      setEmpDetail(null);
    }
  }, [appliedFilters, loadEmployeeDetail]);

  // ── Filters ────────────────────────────────────────────────────────────────

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
    setMonthQuickFilter('all');
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
    setMonthQuickFilter('all');
  };

  const handleMonthQuickFilter = (mode: 'all' | '3m' | '6m' | 'year') => {
    setMonthQuickFilter(mode);
    const now = new Date();
    const newF: Filters = { ...appliedFilters };
    delete newF.dateFrom;
    delete newF.dateTo;
    delete newF.payrollYear;
    delete newF.payrollMonth;

    if (mode === '3m') {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      newF.dateFrom = from.toISOString().split('T')[0];
      newF.dateTo = now.toISOString().split('T')[0];
    } else if (mode === '6m') {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 6);
      newF.dateFrom = from.toISOString().split('T')[0];
      newF.dateTo = now.toISOString().split('T')[0];
    } else if (mode === 'year') {
      newF.payrollYear = now.getFullYear();
    }

    setDraftFilters(newF);
    setAppliedFilters(newF);
  };

  // ── Sort ───────────────────────────────────────────────────────────────────

  const handleSort = (field: string) => {
    if (txSortBy === field) {
      setTxSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setTxSortBy(field);
      setTxSortDir('desc');
    }
    setTxPage(1);
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async (empId?: number) => {
    try {
      const params = buildParams(appliedFilters);
      if (empId) params.employeeId = String(empId);
      const res = await api.get('/salaries/bank-payments/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = empId ? `bank-analytics-employee-${empId}.xlsx` : 'bank-analytics.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('فشل التصدير'); }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const card = 'bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border border-neutral-200 dark:border-neutral-700';
  const inputCls = 'border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full';
  const thCls = 'text-start pb-2 font-medium text-neutral-500 text-xs uppercase tracking-wide';
  const varCls = (v: number | null) => v === null ? 'text-neutral-400' : v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
  const varLabel = (v: number | null) => v === null ? '—' : (v >= 0 ? '+' : '') + fmt3(v);

  const activeChips = getActiveChips(appliedFilters);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-800 dark:text-white">تحليلات الرواتب البنكية</h1>
          <p className="text-sm text-neutral-500 mt-0.5">تحليل تحويلات الرواتب المستوردة من البنك</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/payroll/bank-import')}
            className="flex items-center gap-2 px-4 py-2 border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 text-sm font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-base">upload_file</span>
            استيراد ملف جديد
          </button>
          <button
            type="button"
            onClick={() => handleExport()}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-base">download</span>
            تصدير Excel
          </button>
        </div>
      </div>

      {/* Filters panel toggle */}
      <div className={card}>
        <div className="flex items-center justify-between mb-0">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <span className="material-symbols-outlined text-base">tune</span>
            {filtersOpen ? 'إخفاء الفلاتر' : 'إظهار الفلاتر'}
            <span className="material-symbols-outlined text-base transition-transform" style={{ transform: filtersOpen ? 'rotate(180deg)' : 'none' }}>expand_more</span>
          </button>
          {activeChips.length > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">filter_alt_off</span>
              مسح الكل
            </button>
          )}
        </div>

        {/* Collapsible filter fields */}
        {filtersOpen && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

            {/* Employee autocomplete */}
            <div ref={autocompleteRef} className="relative sm:col-span-2">
              <label className="text-xs text-neutral-500 font-medium mb-1 block">الموظف</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="بحث باسم أو رقم مدني أو كود…"
                  value={empQuery}
                  onChange={(e) => { setEmpQuery(e.target.value); searchEmployees(e.target.value); }}
                  className={inputCls}
                />
                {selectedEmployee && (
                  <button
                    type="button"
                    onClick={() => selectEmployee(null)}
                    className="absolute top-1/2 -translate-y-1/2 end-2 text-neutral-400 hover:text-red-500 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base leading-none">close</span>
                  </button>
                )}
              </div>
              {empSuggestions.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                  {empSuggestions.map((e) => (
                    <button
                      type="button"
                      key={e.id}
                      onMouseDown={(ev) => { ev.preventDefault(); selectEmployee(e); setFiltersOpen(false); }}
                      className="w-full text-start px-3 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-600 border-b border-neutral-100 dark:border-neutral-600 last:border-0 transition-colors"
                    >
                      <div className="font-medium dark:text-white">{e.fullName}</div>
                      <div className="text-xs text-neutral-400 mt-0.5">{e.code} · {e.fullNameEn ?? ''} · {e.civilId ?? '—'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Year */}
            <div>
              <label className="text-xs text-neutral-500 font-medium mb-1 block">السنة</label>
              <select
                className={inputCls}
                title="السنة"
                value={draftFilters.payrollYear ?? ''}
                onChange={(e) => setDraftFilters((f) => ({ ...f, payrollYear: e.target.value ? Number(e.target.value) : undefined, payrollMonth: undefined }))}
              >
                <option value="">كل السنوات</option>
                {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Month */}
            <div>
              <label className="text-xs text-neutral-500 font-medium mb-1 block">الشهر</label>
              <select
                className={inputCls}
                title="الشهر"
                value={draftFilters.payrollMonth ?? ''}
                disabled={!draftFilters.payrollYear}
                onChange={(e) => setDraftFilters((f) => ({ ...f, payrollMonth: e.target.value ? Number(e.target.value) : undefined }))}
              >
                <option value="">كل الأشهر</option>
                {MONTHS_AR.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>

            {/* Date From */}
            <div>
              <label className="text-xs text-neutral-500 font-medium mb-1 block">تاريخ من</label>
              <input
                type="date"
                title="تاريخ من"
                className={inputCls}
                value={draftFilters.dateFrom ?? ''}
                onChange={(e) => setDraftFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
              />
            </div>

            {/* Date To */}
            <div>
              <label className="text-xs text-neutral-500 font-medium mb-1 block">تاريخ إلى</label>
              <input
                type="date"
                title="تاريخ إلى"
                className={inputCls}
                value={draftFilters.dateTo ?? ''}
                onChange={(e) => setDraftFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))}
              />
            </div>

            {/* Amount From */}
            <div>
              <label className="text-xs text-neutral-500 font-medium mb-1 block">المبلغ من (د.ك)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                className={inputCls}
                placeholder="0.000"
                value={draftFilters.amountFrom ?? ''}
                onChange={(e) => setDraftFilters((f) => ({ ...f, amountFrom: e.target.value || undefined }))}
              />
            </div>

            {/* Amount To */}
            <div>
              <label className="text-xs text-neutral-500 font-medium mb-1 block">المبلغ إلى (د.ك)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                className={inputCls}
                placeholder="0.000"
                value={draftFilters.amountTo ?? ''}
                onChange={(e) => setDraftFilters((f) => ({ ...f, amountTo: e.target.value || undefined }))}
              />
            </div>

            {/* Transaction ID */}
            <div>
              <label className="text-xs text-neutral-500 font-medium mb-1 block">رقم المعاملة</label>
              <input
                type="text"
                className={inputCls}
                placeholder="TXN…"
                value={draftFilters.transactionId ?? ''}
                onChange={(e) => setDraftFilters((f) => ({ ...f, transactionId: e.target.value || undefined }))}
              />
            </div>

            {/* Civil ID */}
            <div>
              <label className="text-xs text-neutral-500 font-medium mb-1 block">الرقم المدني</label>
              <input
                type="text"
                className={inputCls}
                placeholder="بحث في الرقم المدني"
                value={draftFilters.civilId ?? ''}
                onChange={(e) => setDraftFilters((f) => ({ ...f, civilId: e.target.value || undefined }))}
              />
            </div>

            {/* Bank Account */}
            <div>
              <label className="text-xs text-neutral-500 font-medium mb-1 block">رقم الحساب</label>
              <input
                type="text"
                className={inputCls}
                placeholder="بحث في رقم الحساب"
                value={draftFilters.bankAccount ?? ''}
                onChange={(e) => setDraftFilters((f) => ({ ...f, bankAccount: e.target.value || undefined }))}
              />
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-neutral-500 font-medium mb-1 block">الحالة</label>
              <select
                className={inputCls}
                title="الحالة"
                value={draftFilters.status ?? ''}
                onChange={(e) => setDraftFilters((f) => ({ ...f, status: e.target.value || undefined }))}
              >
                <option value="">كل الحالات</option>
                <option value="PROCESSED">PROCESSED</option>
                <option value="PENDING">PENDING</option>
                <option value="FAILED">FAILED</option>
              </select>
            </div>

            {/* Search text */}
            <div className="sm:col-span-2">
              <label className="text-xs text-neutral-500 font-medium mb-1 block">بحث نصي</label>
              <input
                type="text"
                className={inputCls}
                placeholder="بحث في اسم المستفيد أو رقم المعاملة أو الرقم المدني…"
                value={draftFilters.search ?? ''}
                onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value || undefined }))}
              />
            </div>

            {/* Action buttons */}
            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4 flex items-center gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-700">
              <button
                type="button"
                onClick={applyFilters}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                <span className="material-symbols-outlined text-base">search</span>
                تطبيق الفلاتر
              </button>
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-4 py-2 text-sm text-neutral-500 hover:text-red-500 border border-neutral-300 dark:border-neutral-600 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-base">filter_alt_off</span>
                مسح الفلاتر
              </button>
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className={`flex flex-wrap gap-2 ${filtersOpen ? 'mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-700' : 'mt-3'}`}>
            {activeChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={() => removeChip(chip.key)}
                  className="hover:text-red-500 transition-colors leading-none"
                  aria-label={`إزالة فلتر ${chip.label}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl p-4 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      {/* Loading skeleton for KPIs */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={card}>
              <Skeleton w="w-8" h="h-8" />
              <div className="mt-2 space-y-1">
                <Skeleton h="h-3" />
                <Skeleton w="w-2/3" h="h-6" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Analytics content */}
      {!loading && analytics && (
        <>
          {/* KPI cards — 6 cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              {
                label: 'إجمالي المبالغ',
                value: `${fmt3(analytics.totalAmount)} د.ك`,
                icon: 'payments',
                color: 'text-blue-500',
              },
              {
                label: 'عدد المعاملات',
                value: analytics.totalPayments.toLocaleString('ar-KW'),
                icon: 'receipt_long',
                color: 'text-purple-500',
              },
              {
                label: 'الموظفون الفريدون',
                value: analytics.uniqueEmployees.toLocaleString('ar-KW'),
                icon: 'group',
                color: 'text-green-500',
              },
              {
                label: 'عدد الأشهر',
                value: analytics.months.length.toLocaleString('ar-KW'),
                icon: 'calendar_month',
                color: 'text-orange-500',
              },
              {
                label: 'متوسط التحويل',
                value: analytics.totalPayments > 0
                  ? `${fmt3(analytics.totalAmount / analytics.totalPayments)} د.ك`
                  : '—',
                icon: 'avg_pace',
                color: 'text-teal-500',
              },
              {
                label: 'آخر استيراد',
                value: analytics.latestImport ? fmtDate(analytics.latestImport.importedAt) : '—',
                sub: analytics.latestImport ? `${analytics.latestImport.batchCount.toLocaleString('ar-KW')} سجل` : undefined,
                icon: 'cloud_done',
                color: 'text-emerald-500',
              },
            ].map((c) => (
              <div key={c.label} className={card}>
                <span className={`material-symbols-outlined text-2xl ${c.color}`}>{c.icon}</span>
                <div className="mt-1">
                  <div className="text-xs text-neutral-500 leading-snug">{c.label}</div>
                  <div className="text-base font-bold dark:text-white mt-0.5 tabular-nums leading-tight">{c.value}</div>
                  {c.sub && <div className="text-xs text-neutral-400 mt-0.5">{c.sub}</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Monthly bar chart */}
          {analytics.months.length > 0 && (
            <div className={card}>
              <h2 className="text-base font-semibold mb-4 dark:text-white">الرواتب الشهرية</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.months} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="sourceMonth" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div style={{ background: '#1a2535', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '10px 14px', fontFamily: 'Cairo, sans-serif', direction: 'rtl' }}>
                          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>{label}</p>
                          <p style={{ color: '#60A5FA', fontSize: 13, fontWeight: 700 }}>{fmt3(Number(payload[0].value))} د.ك</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="totalAmount" name="المبلغ الإجمالي (د.ك)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly summary table */}
          {analytics.months.length > 0 && (
            <div className={card}>
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <h2 className="text-base font-semibold dark:text-white">ملخص شهري</h2>
                <div className="flex items-center gap-1">
                  {(['all', '3m', '6m', 'year'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleMonthQuickFilter(mode)}
                      className={`px-3 py-1 text-xs rounded-lg border transition-colors ${monthQuickFilter === mode ? 'bg-blue-600 border-blue-600 text-white' : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'}`}
                    >
                      {mode === 'all' ? 'الكل' : mode === '3m' ? 'آخر 3 أشهر' : mode === '6m' ? 'آخر 6 أشهر' : 'هذه السنة'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className={thCls}>الشهر</th>
                      <th className={`${thCls} text-end`}>المبلغ (د.ك)</th>
                      <th className={`${thCls} text-end`}>المعاملات</th>
                      <th className={`${thCls} text-end`}>الموظفون</th>
                      <th className={`${thCls} text-end`}>المتوسط</th>
                      <th className={`${thCls} text-end`}>الأعلى</th>
                      <th className={`${thCls} text-end`}>الأدنى</th>
                      <th className={`${thCls} text-end`}>الفرق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.months.map((m) => (
                      <tr key={m.sourceMonth} className="border-b border-neutral-100 dark:border-neutral-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                        <td className="py-2.5 dark:text-white font-medium">{m.sourceMonth}</td>
                        <td className="py-2.5 text-end font-mono dark:text-white tabular-nums">{fmt3(m.totalAmount)}</td>
                        <td className="py-2.5 text-end dark:text-white">{m.count.toLocaleString('ar-KW')}</td>
                        <td className="py-2.5 text-end text-neutral-500">{m.employeeCount?.toLocaleString('ar-KW') ?? '—'}</td>
                        <td className="py-2.5 text-end font-mono text-neutral-500 tabular-nums">{m.avg != null ? fmt3(m.avg) : '—'}</td>
                        <td className="py-2.5 text-end font-mono text-green-600 dark:text-green-400 tabular-nums">{m.highest != null ? fmt3(m.highest) : '—'}</td>
                        <td className="py-2.5 text-end font-mono text-red-500 dark:text-red-400 tabular-nums">{m.lowest != null ? fmt3(m.lowest) : '—'}</td>
                        <td className={`py-2.5 text-end font-mono tabular-nums ${varCls(m.varianceFromPrev)}`}>
                          {varLabel(m.varianceFromPrev)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Employee Insight Card */}
          {selectedEmployee && (
            <div ref={insightCardRef} className={card}>
              {empDetailLoading ? (
                <div className="space-y-4">
                  <Skeleton h="h-6" w="w-48" />
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h="h-14" />)}
                  </div>
                </div>
              ) : empDetail ? (
                <div className="space-y-5">
                  {/* Profile header */}
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <h2 className="text-base font-semibold dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-500">person</span>
                        {empDetail.employee.fullName}
                        {empDetail.employee.status !== 'active' && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-full">غير نشط</span>
                        )}
                      </h2>
                      {empDetail.employee.fullNameEn && (
                        <div className="text-sm text-neutral-400 mt-0.5 ms-7">{empDetail.employee.fullNameEn}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate('/employees')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                        عرض الموظف
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport(empDetail.employee.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">download</span>
                        تصدير سجله
                      </button>
                    </div>
                  </div>

                  {/* Profile info grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                    {[
                      ['الكود', empDetail.employee.code],
                      ['الرقم المدني', empDetail.employee.civilId ?? '—'],
                      ['رقم الحساب', empDetail.employee.bankAccount ?? '—'],
                      ['المسمى الوظيفي', empDetail.employee.jobTitle ?? '—'],
                      ['القسم', empDetail.employee.department ?? '—'],
                      ['الحالة', empDetail.employee.status === 'active' ? 'نشط' : 'غير نشط'],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-neutral-50 dark:bg-neutral-700/50 rounded-lg p-3">
                        <div className="text-xs text-neutral-500">{k}</div>
                        <div className="font-medium dark:text-white mt-0.5 truncate" title={v}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {[
                      { label: 'إجمالي التحويلات', value: empDetail.stats.totalPayments.toLocaleString('ar-KW') },
                      { label: 'إجمالي المبالغ (د.ك)', value: fmt3(empDetail.stats.totalAmount) },
                      { label: 'الأشهر المميزة', value: empDetail.stats.distinctMonths.toLocaleString('ar-KW') },
                      { label: 'متوسط شهري (د.ك)', value: fmt3(empDetail.stats.avgMonthlyAmount) },
                      { label: 'أعلى تحويل (د.ك)', value: fmt3(empDetail.stats.highestPayment), cls: 'text-green-600 dark:text-green-400' },
                      { label: 'أدنى تحويل (د.ك)', value: fmt3(empDetail.stats.lowestPayment), cls: 'text-red-500 dark:text-red-400' },
                    ].map((s) => (
                      <div key={s.label} className={`${card} text-center !p-3`}>
                        <div className="text-xs text-neutral-500 leading-snug">{s.label}</div>
                        <div className={`text-base font-bold mt-1 tabular-nums ${s.cls ?? 'dark:text-white'}`}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Salary change indicator */}
                  {empDetail.stats.distinctMonths > 1 && (
                    <div className="flex items-center gap-3 text-sm p-3 bg-neutral-50 dark:bg-neutral-700/40 rounded-lg">
                      <span className={`material-symbols-outlined text-xl ${empDetail.stats.salaryChangeAmount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {empDetail.stats.salaryChangeAmount >= 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <div>
                        <span className="text-neutral-500">تغيير الراتب (أول ← آخر):</span>{' '}
                        <span className={`font-semibold ${empDetail.stats.salaryChangeAmount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {empDetail.stats.salaryChangeAmount >= 0 ? '+' : ''}{fmt3(empDetail.stats.salaryChangeAmount)} د.ك
                          {' '}({empDetail.stats.salaryChangePercent >= 0 ? '+' : ''}{empDetail.stats.salaryChangePercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="ms-auto text-neutral-400 text-xs">
                        {empDetail.stats.salaryChangeCount} تغيير في {empDetail.stats.distinctMonths} شهر
                      </div>
                    </div>
                  )}

                  {/* Monthly salary timeline */}
                  {empDetail.monthlyHistory.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 dark:text-white">الجدول الزمني للرواتب</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-neutral-200 dark:border-neutral-700">
                              <th className={thCls}>الشهر</th>
                              <th className={`${thCls} text-end`}>المبلغ (د.ك)</th>
                              <th className={`${thCls} text-end`}>المعاملات</th>
                              <th className={`${thCls} text-end`}>الفرق</th>
                              <th className={thCls} aria-label="الاتجاه"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {empDetail.monthlyHistory.map((m) => (
                              <tr key={m.sourceMonth} className="border-b border-neutral-100 dark:border-neutral-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                                <td className="py-2.5 dark:text-white font-medium">{m.sourceMonth}</td>
                                <td className="py-2.5 text-end font-mono dark:text-white tabular-nums">{fmt3(m.totalAmount)}</td>
                                <td className="py-2.5 text-end dark:text-white">{m.count}</td>
                                <td className={`py-2.5 text-end font-mono tabular-nums ${varCls(m.varianceFromPrev)}`}>
                                  {varLabel(m.varianceFromPrev)}
                                </td>
                                <td className="py-2.5">
                                  {m.varianceFromPrev !== null && m.varianceFromPrev !== 0 && (
                                    <span className={`material-symbols-outlined text-base leading-none ${m.varianceFromPrev > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                      {m.varianceFromPrev > 0 ? 'trending_up' : 'trending_down'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-neutral-400 text-sm py-6 text-center">لا توجد مدفوعات لهذا الموظف في النطاق المحدد</div>
              )}
            </div>
          )}

          {/* Top employees */}
          {!appliedFilters.employeeId && analytics.topEmployees.length > 0 && (
            <div className={card}>
              <h2 className="text-base font-semibold mb-3 dark:text-white">أعلى الموظفين مدفوعاتٍ</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className={thCls}>#</th>
                      <th className={thCls}>المستفيد</th>
                      <th className={thCls}>الرقم المدني</th>
                      <th className={`${thCls} text-end`}>إجمالي (د.ك)</th>
                      <th className={`${thCls} text-end`}>المعاملات</th>
                      <th className={`${thCls} text-end`}>متوسط (د.ك)</th>
                      <th className={thCls}>آخر دفعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topEmployees.map((e, i) => (
                      <tr
                        key={i}
                        onClick={() => {
                          if (e.employeeId) {
                            const empOpt: EmployeeOption = {
                              id: e.employeeId,
                              code: '',
                              fullName: e.beneficiaryName,
                              fullNameEn: null,
                              civilId: e.civilId,
                              bankAccount: null,
                            };
                            selectEmployee(empOpt);
                          }
                        }}
                        className={`border-b border-neutral-100 dark:border-neutral-700/50 transition-colors ${e.employeeId ? 'hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/30'}`}
                      >
                        <td className="py-2.5 text-neutral-400 font-mono text-center">{i + 1}</td>
                        <td className="py-2.5 dark:text-white font-medium">
                          <div className="flex items-center gap-1">
                            {e.beneficiaryName}
                            {e.employeeId && (
                              <span className="material-symbols-outlined text-xs text-blue-400 leading-none" title="انقر للتفاصيل">person_search</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-neutral-500 font-mono text-xs">{e.civilId ?? '—'}</td>
                        <td className="py-2.5 text-end font-mono dark:text-white tabular-nums">{fmt3(e.totalAmount)}</td>
                        <td className="py-2.5 text-end dark:text-white">{e.count.toLocaleString('ar-KW')}</td>
                        <td className="py-2.5 text-end font-mono text-neutral-500 tabular-nums">{fmt3(e.avgAmount)}</td>
                        <td className="py-2.5 text-neutral-500 whitespace-nowrap">{fmtDate(e.latestPaymentDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transactions table */}
          <div className={card}>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <h2 className="text-base font-semibold dark:text-white">
                المعاملات
                {txData && <span className="text-neutral-400 font-normal text-sm ms-2">({txData.meta.total.toLocaleString('ar-KW')})</span>}
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-xs text-neutral-500">الصفوف:</label>
                <select
                  className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-neutral-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  title="حجم الصفحة"
                  value={txPageSize}
                  onChange={(e) => { setTxPageSize(Number(e.target.value)); setTxPage(1); }}
                >
                  {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {txLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h="h-10" />)}
              </div>
            ) : txData ? (
              <>
                {txData.data.length === 0 ? (
                  <div className="text-center py-12 text-neutral-400">
                    <span className="material-symbols-outlined text-4xl mb-2 block">receipt_long</span>
                    <div className="text-sm">لا توجد معاملات في النطاق المحدد</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-200 dark:border-neutral-700">
                          <th className={thCls}>رقم المعاملة</th>
                          <SortTh field="sourceMonth" label="الشهر" sortBy={txSortBy} sortDir={txSortDir} onSort={handleSort} />
                          <SortTh field="paymentDate" label="تاريخ الدفع" sortBy={txSortBy} sortDir={txSortDir} onSort={handleSort} />
                          <SortTh field="beneficiaryName" label="المستفيد" sortBy={txSortBy} sortDir={txSortDir} onSort={handleSort} />
                          <SortTh field="amount" label="المبلغ (د.ك)" sortBy={txSortBy} sortDir={txSortDir} onSort={handleSort} cls="text-end" />
                          <th className={thCls}>الرقم المدني</th>
                          {appliedFilters.employeeId && <th className={thCls}>مطابقة بـ</th>}
                          <th className={thCls}>الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txData.data.map((row) => (
                          <tr key={row.id} className="border-b border-neutral-100 dark:border-neutral-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                            <td className="py-2.5 font-mono text-xs text-neutral-500 dark:text-neutral-400 max-w-32 truncate" title={row.transactionId}>{row.transactionId}</td>
                            <td className="py-2.5 dark:text-white">{row.sourceMonth ?? '—'}</td>
                            <td className="py-2.5 dark:text-white whitespace-nowrap">{fmtDate(row.paymentDate)}</td>
                            <td className="py-2.5 dark:text-white">{row.beneficiaryName}</td>
                            <td className="py-2.5 text-end font-mono dark:text-white tabular-nums">{fmt3(row.amount)}</td>
                            <td className="py-2.5 text-neutral-500 font-mono text-xs">{row.civilId ?? '—'}</td>
                            {appliedFilters.employeeId && (
                              <td className="py-2.5">
                                {row.matchedBy ? (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 whitespace-nowrap">
                                    {row.matchedBy}
                                  </span>
                                ) : <span className="text-neutral-300">—</span>}
                              </td>
                            )}
                            <td className="py-2.5">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${row.status === 'PROCESSED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500'}`}>
                                {row.status ?? '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                {txData.meta.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm">
                    <span className="text-neutral-500">{txData.meta.total.toLocaleString('ar-KW')} معاملة</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={txPage <= 1}
                        onClick={() => setTxPage((p) => p - 1)}
                        className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600 disabled:opacity-40 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors dark:text-white"
                      >
                        السابق
                      </button>
                      <span className="px-3 py-1.5 text-neutral-600 dark:text-neutral-300">{txPage} / {txData.meta.totalPages}</span>
                      <button
                        type="button"
                        disabled={txPage >= txData.meta.totalPages}
                        onClick={() => setTxPage((p) => p + 1)}
                        className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600 disabled:opacity-40 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors dark:text-white"
                      >
                        التالي
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
