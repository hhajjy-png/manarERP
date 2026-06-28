import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useUI } from '../stores/uiStore';
import PrivateAmount from '../components/PrivateAmount';
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

const Skeleton = ({ w, h }: { w?: string; h?: string }) => {
  const widthMap: Record<string, string> = { 'w-full': '100%', 'w-2/3': '67%', 'w-48': '192px', 'w-8': '32px' };
  const heightMap: Record<string, string> = { 'h-4': '16px', 'h-6': '24px', 'h-8': '32px', 'h-10': '40px', 'h-14': '56px', 'h-3': '12px' };
  return (
    <div style={{
      background: 'var(--surface-2, #e5e7eb)',
      borderRadius: 6,
      animation: 'pulse 1.5s ease-in-out infinite',
      width: (w && widthMap[w]) ? widthMap[w] : '100%',
      height: (h && heightMap[h]) ? heightMap[h] : '16px',
    }} />
  );
};

function SortTh({ field, label, sortBy, sortDir, onSort, cls = '' }: {
  field: string; label: string; sortBy: string; sortDir: 'asc' | 'desc';
  onSort: (f: string) => void; cls?: string;
}) {
  const active = sortBy === field;
  return (
    <th
      style={{ textAlign: 'start', paddingBottom: 8, fontWeight: 500, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}
      className={cls}
      onClick={() => onSort(field)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {label}
        <span className="material-symbols-outlined text-xs leading-none" style={{ fontSize: 12 }}>
          {active ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
        </span>
      </span>
    </th>
  );
}

// ── Section label style ────────────────────────────────────────────────────────

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 10,
  marginTop: 0,
};

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

  const inputCls = 'border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full';
  const thCls: React.CSSProperties = { textAlign: 'start', paddingBottom: 8, fontWeight: 500, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' };
  const varCls = (v: number | null) => v === null ? 'text-neutral-400' : v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
  const varLabel = (v: number | null) => v === null ? '—' : (v >= 0 ? '+' : '') + fmt3(v);

  const activeChips = getActiveChips(appliedFilters);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ padding: '24px', maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>تحليلات الرواتب البنكية</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>تحليل تحويلات الرواتب المستوردة من البنك</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate('/payroll/bank-import')}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
            استيراد ملف جديد
          </button>
          <button
            type="button"
            onClick={() => handleExport()}
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#16a34a', borderColor: '#16a34a' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
            تصدير Excel
          </button>
        </div>
      </div>

      {/* F1 — KPI Cards (3 prominent cards) */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card panel" style={{ padding: '20px 24px' }}>
              <Skeleton w="w-8" h="h-8" />
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Skeleton h="h-3" />
                <Skeleton w="w-2/3" h="h-6" />
              </div>
            </div>
          ))}
        </div>
      ) : analytics ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          {[
            {
              label: 'إجمالي المبالغ المحوّلة',
              value: fmt3(analytics.totalAmount),
              unit: 'د.ك',
              icon: '💰',
              color: '#3B82F6',
            },
            {
              label: 'عدد عمليات التحويل',
              value: analytics.totalPayments.toLocaleString(),
              unit: 'عملية',
              icon: '📋',
              color: '#8B5CF6',
            },
            {
              label: 'الموظفون المدرجون',
              value: analytics.uniqueEmployees.toLocaleString(),
              unit: 'موظف',
              icon: '👥',
              color: '#10B981',
            },
          ].map(({ label, value, unit, icon, color }) => (
            <div key={label} className="card panel" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500, marginTop: 0 }}>{label}</p>
                  <p style={{ fontSize: 30, fontWeight: 800, color, margin: 0, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}><PrivateAmount value={value} /></p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, marginBottom: 0 }}>{unit}</p>
                </div>
                <span style={{ fontSize: 32 }}>{icon}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* F2 — Filter Panel */}
      <div className="card panel">
        {/* Toggle bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
            {filtersOpen ? 'إخفاء الفلاتر' : 'إظهار الفلاتر'}
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18, transition: 'transform 0.2s', transform: filtersOpen ? 'rotate(180deg)' : 'none' }}
            >
              expand_more
            </span>
          </button>
          {activeChips.length > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_alt_off</span>
              مسح الكل
            </button>
          )}
        </div>

        {/* Collapsible grouped filter fields */}
        {filtersOpen && (
          <div style={{ marginTop: 20 }}>

            {/* Group 1 — الموظف والفترة */}
            <div style={{ marginBottom: 20 }}>
              <p style={sectionLabelStyle}>الموظف والفترة</p>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>

                {/* Employee autocomplete */}
                <div ref={autocompleteRef} style={{ position: 'relative' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>الموظف</label>
                  <div style={{ position: 'relative' }}>
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
                        style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', insetInlineEnd: 8, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                      </button>
                    )}
                  </div>
                  {empSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', marginTop: 4, width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 50, maxHeight: 240, overflowY: 'auto' }}>
                      {empSuggestions.map((e) => (
                        <button
                          type="button"
                          key={e.id}
                          onMouseDown={(ev) => { ev.preventDefault(); selectEmployee(e); setFiltersOpen(false); }}
                          style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 12px', fontSize: 13, background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        >
                          <div style={{ fontWeight: 500 }}>{e.fullName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{e.code} · {e.fullNameEn ?? ''} · {e.civilId ?? '—'}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Year */}
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>السنة</label>
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
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>الشهر</label>
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
              </div>
            </div>

            {/* Group 2 — نطاق التاريخ */}
            <div style={{ marginBottom: 20 }}>
              <p style={sectionLabelStyle}>نطاق التاريخ</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>تاريخ من</label>
                  <input
                    type="date"
                    title="تاريخ من"
                    className={inputCls}
                    value={draftFilters.dateFrom ?? ''}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>تاريخ إلى</label>
                  <input
                    type="date"
                    title="تاريخ إلى"
                    className={inputCls}
                    value={draftFilters.dateTo ?? ''}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))}
                  />
                </div>
              </div>
            </div>

            {/* Group 3 — نطاق المبلغ */}
            <div style={{ marginBottom: 20 }}>
              <p style={sectionLabelStyle}>نطاق المبلغ (د.ك)</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>المبلغ من</label>
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
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>المبلغ إلى</label>
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
              </div>
            </div>

            {/* Group 4 — بحث متقدم (transaction id, civil id, bank account, status, text search) */}
            <div style={{ marginBottom: 20 }}>
              <p style={sectionLabelStyle}>بحث متقدم</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>رقم المعاملة</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="TXN…"
                    value={draftFilters.transactionId ?? ''}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, transactionId: e.target.value || undefined }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>الرقم المدني</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="بحث في الرقم المدني"
                    value={draftFilters.civilId ?? ''}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, civilId: e.target.value || undefined }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>رقم الحساب</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="بحث في رقم الحساب"
                    value={draftFilters.bankAccount ?? ''}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, bankAccount: e.target.value || undefined }))}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>الحالة</label>
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
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>بحث نصي</label>
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="بحث في اسم المستفيد أو رقم المعاملة أو الرقم المدني…"
                    value={draftFilters.search ?? ''}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value || undefined }))}
                  />
                </div>
              </div>
            </div>

            {/* Quick period chips */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>فترة سريعة:</span>
              {[
                { key: '3m' as const, label: 'آخر 3 أشهر' },
                { key: '6m' as const, label: 'آخر 6 أشهر' },
                { key: 'year' as const, label: 'هذه السنة' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleMonthQuickFilter(key)}
                  style={{
                    padding: '4px 14px',
                    borderRadius: 20,
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: 600,
                    border: monthQuickFilter === key ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: monthQuickFilter === key ? 'var(--primary)' : 'transparent',
                    color: monthQuickFilter === key ? '#fff' : 'var(--text)',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Apply / Reset buttons */}
            <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                className="btn"
                onClick={applyFilters}
                style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 130 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span>
                تطبيق الفلاتر
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearAllFilters}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_alt_off</span>
                إعادة تعيين
              </button>
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: filtersOpen ? 16 : 12, paddingTop: filtersOpen ? 16 : 0, borderTop: filtersOpen ? '1px solid var(--border)' : 'none' }}>
            {activeChips.map((chip) => (
              <span
                key={chip.key}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'rgba(59,130,246,0.1)', color: '#3B82F6', borderRadius: 20, fontSize: 12, fontWeight: 500 }}
              >
                {chip.label}
                <button
                  type="button"
                  onClick={() => removeChip(chip.key)}
                  style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                  aria-label={`إزالة فلتر ${chip.label}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* F6 — Error state */}
      {error && (
        <div className="card panel" style={{ padding: '16px 20px', border: '1px solid #fca5a5', background: 'rgba(254,226,226,0.5)', display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontSize: 13 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
          {error}
        </div>
      )}

      {/* Analytics content */}
      {!loading && analytics && (
        <>
          {/* F3 — Monthly bar chart */}
          {analytics.months.length > 0 && (
            <div className="card panel" style={{ padding: '20px 24px' }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px 0' }}>الرواتب الشهرية</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.months} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="sourceMonth" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div style={{ background: '#1a2535', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '10px 14px', fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif', direction: 'rtl' }}>
                          <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6, marginTop: 0 }}>{label}</p>
                          <p style={{ color: '#60A5FA', fontSize: 13, fontWeight: 700, margin: 0 }}>{fmt3(Number(payload[0].value))} د.ك</p>
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
            <div className="card panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>ملخص شهري</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {(['all', '3m', '6m', 'year'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleMonthQuickFilter(mode)}
                      style={{
                        padding: '4px 12px',
                        fontSize: 12,
                        borderRadius: 8,
                        border: monthQuickFilter === mode ? '1px solid var(--primary)' : '1px solid var(--border)',
                        background: monthQuickFilter === mode ? 'var(--primary)' : 'transparent',
                        color: monthQuickFilter === mode ? '#fff' : 'var(--text)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        fontWeight: 500,
                      }}
                    >
                      {mode === 'all' ? 'الكل' : mode === '3m' ? 'آخر 3 أشهر' : mode === '6m' ? 'آخر 6 أشهر' : 'هذه السنة'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ ...thCls, padding: '10px 16px' }}>الشهر</th>
                      <th style={{ ...thCls, padding: '10px 16px', textAlign: 'end' }}>المبلغ (د.ك)</th>
                      <th style={{ ...thCls, padding: '10px 16px', textAlign: 'end' }}>المعاملات</th>
                      <th style={{ ...thCls, padding: '10px 16px', textAlign: 'end' }}>الموظفون</th>
                      <th style={{ ...thCls, padding: '10px 16px', textAlign: 'end' }}>المتوسط</th>
                      <th style={{ ...thCls, padding: '10px 16px', textAlign: 'end' }}>الأعلى</th>
                      <th style={{ ...thCls, padding: '10px 16px', textAlign: 'end' }}>الأدنى</th>
                      <th style={{ ...thCls, padding: '10px 16px', textAlign: 'end' }}>الفرق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.months.map((m) => (
                      <tr key={m.sourceMonth} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 16px', fontWeight: 500 }}>{m.sourceMonth}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'end', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>{fmt3(m.totalAmount)}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'end' }}>{m.count.toLocaleString('ar-KW')}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'end', color: 'var(--text-muted)' }}>{m.employeeCount?.toLocaleString('ar-KW') ?? '—'}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'end', fontFamily: 'monospace', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{m.avg != null ? fmt3(m.avg) : '—'}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'end', fontFamily: 'monospace', color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{m.highest != null ? fmt3(m.highest) : '—'}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'end', fontFamily: 'monospace', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{m.lowest != null ? fmt3(m.lowest) : '—'}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'end', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }} className={varCls(m.varianceFromPrev)}>
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
            <div ref={insightCardRef} className="card panel" style={{ padding: '20px 24px' }}>
              {empDetailLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Skeleton h="h-6" w="w-48" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h="h-14" />)}
                  </div>
                </div>
              ) : empDetail ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Profile header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#3B82F6' }}>person</span>
                        {empDetail.employee.fullName}
                        {empDetail.employee.status !== 'active' && (
                          <span style={{ fontSize: 11, padding: '2px 8px', background: '#fee2e2', color: '#dc2626', borderRadius: 20 }}>غير نشط</span>
                        )}
                      </h2>
                      {empDetail.employee.fullNameEn && (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{empDetail.employee.fullNameEn}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => navigate('/employees')}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                        عرض الموظف
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport(empDetail.employee.id)}
                        className="btn"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#16a34a', borderColor: '#16a34a' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                        تصدير سجله
                      </button>
                    </div>
                  </div>

                  {/* Profile info grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, fontSize: 13 }}>
                    {[
                      ['الكود', empDetail.employee.code],
                      ['الرقم المدني', empDetail.employee.civilId ?? '—'],
                      ['رقم الحساب', empDetail.employee.bankAccount ?? '—'],
                      ['المسمى الوظيفي', empDetail.employee.jobTitle ?? '—'],
                      ['القسم', empDetail.employee.department ?? '—'],
                      ['الحالة', empDetail.employee.status === 'active' ? 'نشط' : 'غير نشط'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k}</div>
                        <div style={{ fontWeight: 500, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Stats grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'إجمالي التحويلات', value: empDetail.stats.totalPayments.toLocaleString('ar-KW'), cls: '' },
                      { label: 'إجمالي المبالغ (د.ك)', value: fmt3(empDetail.stats.totalAmount), cls: '' },
                      { label: 'الأشهر المميزة', value: empDetail.stats.distinctMonths.toLocaleString('ar-KW'), cls: '' },
                      { label: 'متوسط شهري (د.ك)', value: fmt3(empDetail.stats.avgMonthlyAmount), cls: '' },
                      { label: 'أعلى تحويل (د.ك)', value: fmt3(empDetail.stats.highestPayment), cls: 'text-green-600 dark:text-green-400' },
                      { label: 'أدنى تحويل (د.ك)', value: fmt3(empDetail.stats.lowestPayment), cls: 'text-red-500 dark:text-red-400' },
                    ].map((s) => (
                      <div key={s.label} className="card panel" style={{ textAlign: 'center', padding: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{s.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums', color: s.cls?.includes('green') ? '#16a34a' : s.cls?.includes('red') ? '#ef4444' : undefined }}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Salary change indicator */}
                  {empDetail.stats.distinctMonths > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 8 }}>
                      <span className={`material-symbols-outlined`} style={{ fontSize: 20, color: empDetail.stats.salaryChangeAmount >= 0 ? '#16a34a' : '#ef4444' }}>
                        {empDetail.stats.salaryChangeAmount >= 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>تغيير الراتب (أول ← آخر):</span>{' '}
                        <span style={{ fontWeight: 600, color: empDetail.stats.salaryChangeAmount >= 0 ? '#16a34a' : '#ef4444' }}>
                          {empDetail.stats.salaryChangeAmount >= 0 ? '+' : ''}{fmt3(empDetail.stats.salaryChangeAmount)} د.ك
                          {' '}({empDetail.stats.salaryChangePercent >= 0 ? '+' : ''}{empDetail.stats.salaryChangePercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div style={{ marginInlineStart: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>
                        {empDetail.stats.salaryChangeCount} تغيير في {empDetail.stats.distinctMonths} شهر
                      </div>
                    </div>
                  )}

                  {/* Monthly salary timeline */}
                  {empDetail.monthlyHistory.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px 0' }}>الجدول الزمني للرواتب</h3>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                              <th style={{ ...thCls, padding: '8px 12px' }}>الشهر</th>
                              <th style={{ ...thCls, padding: '8px 12px', textAlign: 'end' }}>المبلغ (د.ك)</th>
                              <th style={{ ...thCls, padding: '8px 12px', textAlign: 'end' }}>المعاملات</th>
                              <th style={{ ...thCls, padding: '8px 12px', textAlign: 'end' }}>الفرق</th>
                              <th style={{ ...thCls, padding: '8px 12px' }} aria-label="الاتجاه"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {empDetail.monthlyHistory.map((m) => (
                              <tr key={m.sourceMonth} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 12px', fontWeight: 500 }}>{m.sourceMonth}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'end', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{fmt3(m.totalAmount)}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'end' }}>{m.count}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'end', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }} className={varCls(m.varianceFromPrev)}>
                                  {varLabel(m.varianceFromPrev)}
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  {m.varianceFromPrev !== null && m.varianceFromPrev !== 0 && (
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: m.varianceFromPrev > 0 ? '#16a34a' : '#ef4444' }}>
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
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>لا توجد مدفوعات لهذا الموظف في النطاق المحدد</div>
              )}
            </div>
          )}

          {/* F3 — Top employees */}
          {!appliedFilters.employeeId && analytics.topEmployees.length > 0 && (
            <div className="card panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px' }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>أعلى الموظفين مدفوعاتٍ</h2>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ ...thCls, padding: '10px 16px' }}>#</th>
                      <th style={{ ...thCls, padding: '10px 16px' }}>المستفيد</th>
                      <th style={{ ...thCls, padding: '10px 16px' }}>الرقم المدني</th>
                      <th style={{ ...thCls, padding: '10px 16px', textAlign: 'end' }}>إجمالي (د.ك)</th>
                      <th style={{ ...thCls, padding: '10px 16px', textAlign: 'end' }}>المعاملات</th>
                      <th style={{ ...thCls, padding: '10px 16px', textAlign: 'end' }}>متوسط (د.ك)</th>
                      <th style={{ ...thCls, padding: '10px 16px' }}>آخر دفعة</th>
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
                        style={{ borderBottom: '1px solid var(--border)', cursor: e.employeeId ? 'pointer' : 'default', transition: 'background 0.15s' }}
                      >
                        <td style={{ padding: '8px 16px', color: 'var(--text-muted)', fontFamily: 'monospace', textAlign: 'center' }}>{i + 1}</td>
                        <td style={{ padding: '8px 16px', fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {e.beneficiaryName}
                            {e.employeeId && (
                              <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#60a5fa' }} title="انقر للتفاصيل">person_search</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '8px 16px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{e.civilId ?? '—'}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'end', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{fmt3(e.totalAmount)}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'end' }}>{e.count.toLocaleString('ar-KW')}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'end', fontFamily: 'monospace', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt3(e.avgAmount)}</td>
                        <td style={{ padding: '8px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(e.latestPaymentDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* F4 — Transactions table */}
          <div className="card panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
                المعاملات
                {txData && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 13, marginInlineStart: 8 }}>({txData.meta.total.toLocaleString('ar-KW')})</span>}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>الصفوف:</label>
                <select
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
                  title="حجم الصفحة"
                  value={txPageSize}
                  onChange={(e) => { setTxPageSize(Number(e.target.value)); setTxPage(1); }}
                >
                  {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {txLoading ? (
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h="h-10" />)}
              </div>
            ) : txData ? (
              <>
                {txData.data.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>receipt_long</span>
                    <div style={{ fontSize: 13 }}>لا توجد معاملات في النطاق المحدد</div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ ...thCls, padding: '10px 16px' }}>رقم المعاملة</th>
                          <SortTh field="sourceMonth" label="الشهر" sortBy={txSortBy} sortDir={txSortDir} onSort={handleSort} />
                          <SortTh field="paymentDate" label="تاريخ الدفع" sortBy={txSortBy} sortDir={txSortDir} onSort={handleSort} />
                          <SortTh field="beneficiaryName" label="المستفيد" sortBy={txSortBy} sortDir={txSortDir} onSort={handleSort} />
                          <SortTh field="amount" label="المبلغ (د.ك)" sortBy={txSortBy} sortDir={txSortDir} onSort={handleSort} cls="text-end" />
                          <th style={{ ...thCls, padding: '10px 16px' }}>الرقم المدني</th>
                          {appliedFilters.employeeId && <th style={{ ...thCls, padding: '10px 16px' }}>مطابقة بـ</th>}
                          <th style={{ ...thCls, padding: '10px 16px' }}>الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txData.data.map((row) => (
                          <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 16px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', maxWidth: 128, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.transactionId}>{row.transactionId}</td>
                            <td style={{ padding: '8px 16px' }}>{row.sourceMonth ?? '—'}</td>
                            <td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>{fmtDate(row.paymentDate)}</td>
                            <td style={{ padding: '8px 16px' }}>{row.beneficiaryName}</td>
                            <td style={{ padding: '8px 16px', textAlign: 'end', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{fmt3(row.amount)}</td>
                            <td style={{ padding: '8px 16px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{row.civilId ?? '—'}</td>
                            {appliedFilters.employeeId && (
                              <td style={{ padding: '8px 16px' }}>
                                {row.matchedBy ? (
                                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, background: 'rgba(59,130,246,0.1)', color: '#3B82F6', whiteSpace: 'nowrap' }}>
                                    {row.matchedBy}
                                  </span>
                                ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                              </td>
                            )}
                            <td style={{ padding: '8px 16px' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: 12,
                                fontSize: 11,
                                background: row.status === 'PROCESSED' ? 'rgba(22,163,74,0.1)' : row.status === 'FAILED' ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.06)',
                                color: row.status === 'PROCESSED' ? '#16a34a' : row.status === 'FAILED' ? '#ef4444' : 'var(--text-muted)',
                              }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{txData.meta.total.toLocaleString('ar-KW')} معاملة</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        disabled={txPage <= 1}
                        onClick={() => setTxPage((p) => p - 1)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 12px', fontSize: 12, opacity: txPage <= 1 ? 0.4 : 1 }}
                      >
                        السابق
                      </button>
                      <span style={{ padding: '4px 12px', color: 'var(--text-muted)' }}>{txPage} / {txData.meta.totalPages}</span>
                      <button
                        type="button"
                        disabled={txPage >= txData.meta.totalPages}
                        onClick={() => setTxPage((p) => p + 1)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 12px', fontSize: 12, opacity: txPage >= txData.meta.totalPages ? 0.4 : 1 }}
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
