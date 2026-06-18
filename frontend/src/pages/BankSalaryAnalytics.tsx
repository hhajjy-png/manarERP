import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useUI } from '../stores/uiStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MonthRow {
  sourceMonth: string;
  year: number;
  month: number;
  totalAmount: number;
  count: number;
  varianceFromPrev: number | null;
}

interface LatestImport {
  importedAt: string;
  batchCount: number;
  totalAmount: number;
}

interface GlobalAnalytics {
  totalAmount: number;
  totalPayments: number;
  uniqueEmployees: number;
  months: MonthRow[];
  topEmployees: { civilId: string | null; beneficiaryName: string; totalAmount: number; count: number }[];
  latestImport: LatestImport | null;
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
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt3 = (n: number) => n.toLocaleString('ar-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-KW') : '—');

function buildParams(filters: Filters, extra: Record<string, unknown> = {}): Record<string, string> {
  const p: Record<string, string> = {};
  if (filters.payrollYear) p.payrollYear = String(filters.payrollYear);
  if (filters.payrollMonth) p.payrollMonth = String(filters.payrollMonth);
  if (filters.employeeId) p.employeeId = String(filters.employeeId);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p[k] = String(v);
  return p;
}

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);

// ── Component ──────────────────────────────────────────────────────────────────

export default function BankSalaryAnalytics() {
  const { lang } = useUI();
  const isRtl = lang === 'ar';

  const [filters, setFilters] = useState<Filters>({});
  const [analytics, setAnalytics] = useState<GlobalAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Employee autocomplete
  const [empQuery, setEmpQuery] = useState('');
  const [empSuggestions, setEmpSuggestions] = useState<EmployeeOption[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [empDetail, setEmpDetail] = useState<EmployeeDetail | null>(null);
  const [empDetailLoading, setEmpDetailLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Transactions
  const [txPage, setTxPage] = useState(1);
  const [txData, setTxData] = useState<PaginatedResult<TransactionRow> | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  // Close autocomplete on outside click
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

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/salaries/bank-payments/analytics', { params: buildParams(filters) });
      setAnalytics(res.data.data);
    } catch {
      setError('فشل تحميل بيانات التحليلات');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const loadTransactions = useCallback(async (page: number) => {
    setTxLoading(true);
    try {
      const res = await api.get('/salaries/bank-payments/transactions', {
        params: buildParams(filters, { page, pageSize: 20 }),
      });
      setTxData(res.data.data);
    } catch { /* intentional */ } finally {
      setTxLoading(false);
    }
  }, [filters]);

  useEffect(() => { setTxPage(1); loadTransactions(1); }, [loadTransactions]);

  const handleTxPage = (p: number) => { setTxPage(p); loadTransactions(p); };

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

  const loadEmployeeDetail = useCallback(async (emp: EmployeeOption, currentFilters: Filters) => {
    setEmpDetailLoading(true);
    try {
      const res = await api.get(`/salaries/bank-payments/employee/${emp.id}`, { params: buildParams(currentFilters) });
      setEmpDetail(res.data.data);
    } catch { setEmpDetail(null); } finally {
      setEmpDetailLoading(false);
    }
  }, []);

  const selectEmployee = (emp: EmployeeOption | null) => {
    setSelectedEmployee(emp);
    setEmpSuggestions([]);
    setEmpQuery(emp ? emp.fullName : '');
    const newFilters = { ...filters, employeeId: emp?.id };
    setFilters(newFilters);
    if (emp) loadEmployeeDetail(emp, newFilters);
    else setEmpDetail(null);
  };

  const clearFilters = () => {
    setFilters({});
    setEmpQuery('');
    setSelectedEmployee(null);
    setEmpDetail(null);
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const res = await api.get('/salaries/bank-payments/export', {
        params: buildParams(filters),
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bank-analytics.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('فشل التصدير'); }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const card = 'bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border border-neutral-200 dark:border-neutral-700';
  const selectCls = 'border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
  const thCls = 'text-start pb-2 font-medium text-neutral-500 text-xs uppercase tracking-wide';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-neutral-800 dark:text-white">تحليلات الرواتب البنكية</h1>
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-base">download</span>
          تصدير Excel
        </button>
      </div>

      {/* Filters */}
      <div className={`${card} flex flex-wrap gap-4 items-end`}>
        {/* Year */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500 font-medium">السنة</label>
          <select
            className={selectCls}
            title="السنة"
            value={filters.payrollYear ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, payrollYear: e.target.value ? Number(e.target.value) : undefined, payrollMonth: undefined }))}
          >
            <option value="">كل السنوات</option>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Month — shown only when year is selected */}
        {filters.payrollYear && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500 font-medium">الشهر</label>
            <select
              className={selectCls}
              title="الشهر"
              value={filters.payrollMonth ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, payrollMonth: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">كل الأشهر</option>
              {MONTHS_AR.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}

        {/* Employee autocomplete */}
        <div ref={autocompleteRef} className="flex flex-col gap-1 relative min-w-72">
          <label className="text-xs text-neutral-500 font-medium">الموظف</label>
          <div className="relative">
            <input
              type="text"
              placeholder="بحث باسم أو رقم مدني أو كود…"
              value={empQuery}
              onChange={(e) => { setEmpQuery(e.target.value); searchEmployees(e.target.value); }}
              className={`${selectCls} w-full ps-3 pe-8`}
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
            <div className="absolute top-full mt-1 w-full bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
              {empSuggestions.map((e) => (
                <button
                  type="button"
                  key={e.id}
                  onMouseDown={(ev) => { ev.preventDefault(); selectEmployee(e); }}
                  className="w-full text-start px-3 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-600 border-b border-neutral-100 dark:border-neutral-600 last:border-0 transition-colors"
                >
                  <div className="font-medium dark:text-white">{e.fullName}</div>
                  <div className="text-xs text-neutral-400 mt-0.5">{e.code} · {e.civilId ?? '—'}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear filters */}
        {(filters.payrollYear || filters.employeeId) && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-neutral-500 hover:text-red-500 border border-neutral-300 dark:border-neutral-600 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-base">filter_alt_off</span>
            مسح الفلاتر
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl p-4 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="text-center py-16 text-neutral-400">
          <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
          <div className="mt-2 text-sm">جارٍ التحميل…</div>
        </div>
      )}

      {/* Analytics content */}
      {!loading && analytics && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'إجمالي المبالغ (د.ك)', value: fmt3(analytics.totalAmount), icon: 'payments', color: 'text-blue-500' },
              { label: 'عدد المعاملات', value: analytics.totalPayments.toLocaleString('ar-KW'), icon: 'receipt_long', color: 'text-purple-500' },
              { label: 'الموظفون الفريدون', value: analytics.uniqueEmployees.toLocaleString('ar-KW'), icon: 'group', color: 'text-green-500' },
              { label: 'عدد الأشهر', value: analytics.months.length.toLocaleString('ar-KW'), icon: 'calendar_month', color: 'text-orange-500' },
            ].map((c) => (
              <div key={c.label} className={card}>
                <div className="flex items-start gap-3">
                  <span className={`material-symbols-outlined text-2xl ${c.color}`}>{c.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-500 leading-snug">{c.label}</div>
                    <div className="text-xl font-bold dark:text-white mt-0.5 tabular-nums">{c.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Latest import card */}
          {analytics.latestImport && (
            <div className={`${card} flex items-center gap-4`}>
              <span className="material-symbols-outlined text-green-500 text-3xl">cloud_done</span>
              <div>
                <div className="text-xs text-neutral-500 font-medium">آخر استيراد</div>
                <div className="font-semibold dark:text-white">{fmtDate(analytics.latestImport.importedAt)}</div>
                <div className="text-sm text-neutral-500 mt-0.5">
                  {analytics.latestImport.batchCount.toLocaleString('ar-KW')} سجل · {fmt3(analytics.latestImport.totalAmount)} د.ك
                </div>
              </div>
            </div>
          )}

          {/* Monthly bar chart */}
          {analytics.months.length > 0 && (
            <div className={card}>
              <h2 className="text-base font-semibold mb-4 dark:text-white">الرواتب الشهرية</h2>
              <ResponsiveContainer width="100%" height={240}>
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
                  <Legend />
                  <Bar dataKey="totalAmount" name="المبلغ الإجمالي (د.ك)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly summary table */}
          {analytics.months.length > 0 && (
            <div className={card}>
              <h2 className="text-base font-semibold mb-3 dark:text-white">ملخص شهري</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className={thCls}>الشهر</th>
                      <th className={`${thCls} text-end`}>المبلغ (د.ك)</th>
                      <th className={`${thCls} text-end`}>المعاملات</th>
                      <th className={`${thCls} text-end`}>الفرق عن السابق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.months.map((m) => (
                      <tr key={m.sourceMonth} className="border-b border-neutral-100 dark:border-neutral-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                        <td className="py-2.5 dark:text-white font-medium">{m.sourceMonth}</td>
                        <td className="py-2.5 text-end font-mono dark:text-white tabular-nums">{fmt3(m.totalAmount)}</td>
                        <td className="py-2.5 text-end dark:text-white">{m.count.toLocaleString('ar-KW')}</td>
                        <td className={`py-2.5 text-end font-mono tabular-nums ${m.varianceFromPrev === null ? 'text-neutral-400' : m.varianceFromPrev >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {m.varianceFromPrev === null ? '—' : (m.varianceFromPrev >= 0 ? '+' : '') + fmt3(m.varianceFromPrev)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Employee detail */}
          {selectedEmployee && (
            <div className={card}>
              {empDetailLoading ? (
                <div className="text-center py-8 text-neutral-400">
                  <span className="material-symbols-outlined text-2xl animate-spin">progress_activity</span>
                  <div className="mt-1 text-sm">جارٍ تحميل بيانات الموظف…</div>
                </div>
              ) : empDetail ? (
                <div className="space-y-5">
                  <h2 className="text-base font-semibold dark:text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-500">person</span>
                    {empDetail.employee.fullName}
                    {empDetail.employee.status !== 'active' && (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-full">غير نشط</span>
                    )}
                  </h2>

                  {/* Profile grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {[
                      ['الكود', empDetail.employee.code],
                      ['الرقم المدني', empDetail.employee.civilId ?? '—'],
                      ['رقم الحساب', empDetail.employee.bankAccount ?? '—'],
                      ['المسمى الوظيفي', empDetail.employee.jobTitle ?? '—'],
                      ['القسم', empDetail.employee.department ?? '—'],
                      ['أول دفعة', fmtDate(empDetail.stats.firstPayment)],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-neutral-50 dark:bg-neutral-700/50 rounded-lg p-3">
                        <div className="text-xs text-neutral-500">{k}</div>
                        <div className="font-medium dark:text-white mt-0.5 truncate" title={v}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Stats cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {[
                      { label: 'إجمالي المدفوعات', value: empDetail.stats.totalPayments.toLocaleString('ar-KW') },
                      { label: 'إجمالي المبالغ (د.ك)', value: fmt3(empDetail.stats.totalAmount) },
                      { label: 'متوسط شهري (د.ك)', value: fmt3(empDetail.stats.avgMonthlyAmount) },
                      { label: 'تغييرات الراتب', value: empDetail.stats.salaryChangeCount.toLocaleString('ar-KW') },
                    ].map((s) => (
                      <div key={s.label} className={`${card} text-center !p-3`}>
                        <div className="text-xs text-neutral-500 leading-snug">{s.label}</div>
                        <div className="text-lg font-bold dark:text-white mt-1 tabular-nums">{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Monthly history */}
                  {empDetail.monthlyHistory.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 dark:text-white">السجل الشهري</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-neutral-200 dark:border-neutral-700">
                              <th className={thCls}>الشهر</th>
                              <th className={`${thCls} text-end`}>المبلغ (د.ك)</th>
                              <th className={`${thCls} text-end`}>المعاملات</th>
                              <th className={`${thCls} text-end`}>الفرق</th>
                            </tr>
                          </thead>
                          <tbody>
                            {empDetail.monthlyHistory.map((m) => (
                              <tr key={m.sourceMonth} className="border-b border-neutral-100 dark:border-neutral-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                                <td className="py-2.5 dark:text-white font-medium">{m.sourceMonth}</td>
                                <td className="py-2.5 text-end font-mono dark:text-white tabular-nums">{fmt3(m.totalAmount)}</td>
                                <td className="py-2.5 text-end dark:text-white">{m.count}</td>
                                <td className={`py-2.5 text-end font-mono tabular-nums ${m.varianceFromPrev === null ? 'text-neutral-400' : m.varianceFromPrev >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                  {m.varianceFromPrev === null ? '—' : (m.varianceFromPrev >= 0 ? '+' : '') + fmt3(m.varianceFromPrev)}
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
                <div className="text-neutral-400 text-sm py-4 text-center">لا توجد مدفوعات لهذا الموظف في النطاق المحدد</div>
              )}
            </div>
          )}

          {/* Top employees (hidden when filtered by employee) */}
          {!filters.employeeId && analytics.topEmployees.length > 0 && (
            <div className={card}>
              <h2 className="text-base font-semibold mb-3 dark:text-white">أعلى الموظفين مدفوعاتٍ</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className={thCls}>#</th>
                      <th className={thCls}>المستفيد</th>
                      <th className={thCls}>الرقم المدني</th>
                      <th className={`${thCls} text-end`}>المبلغ (د.ك)</th>
                      <th className={`${thCls} text-end`}>المعاملات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topEmployees.map((e, i) => (
                      <tr key={i} className="border-b border-neutral-100 dark:border-neutral-700/50 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors">
                        <td className="py-2.5 text-neutral-400 font-mono">{i + 1}</td>
                        <td className="py-2.5 dark:text-white font-medium">{e.beneficiaryName}</td>
                        <td className="py-2.5 text-neutral-500 font-mono text-xs">{e.civilId ?? '—'}</td>
                        <td className="py-2.5 text-end font-mono dark:text-white tabular-nums">{fmt3(e.totalAmount)}</td>
                        <td className="py-2.5 text-end dark:text-white">{e.count.toLocaleString('ar-KW')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transactions table */}
          <div className={card}>
            <h2 className="text-base font-semibold mb-3 dark:text-white">المعاملات</h2>
            {txLoading ? (
              <div className="text-center py-8 text-neutral-400 text-sm">جارٍ التحميل…</div>
            ) : txData ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-neutral-700">
                        <th className={thCls}>رقم المعاملة</th>
                        <th className={thCls}>الشهر</th>
                        <th className={thCls}>تاريخ الدفع</th>
                        <th className={thCls}>المستفيد</th>
                        <th className={`${thCls} text-end`}>المبلغ (د.ك)</th>
                        <th className={thCls}>الرقم المدني</th>
                        {filters.employeeId && <th className={thCls}>مطابقة بـ</th>}
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
                          {filters.employeeId && (
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

                {/* Pagination */}
                {txData.meta.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm">
                    <span className="text-neutral-500">{txData.meta.total.toLocaleString('ar-KW')} معاملة</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={txPage <= 1}
                        onClick={() => handleTxPage(txPage - 1)}
                        className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600 disabled:opacity-40 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors dark:text-white"
                      >
                        السابق
                      </button>
                      <span className="px-3 py-1.5 text-neutral-600 dark:text-neutral-300">{txPage} / {txData.meta.totalPages}</span>
                      <button
                        type="button"
                        disabled={txPage >= txData.meta.totalPages}
                        onClick={() => handleTxPage(txPage + 1)}
                        className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600 disabled:opacity-40 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors dark:text-white"
                      >
                        التالي
                      </button>
                    </div>
                  </div>
                )}

                {txData.data.length === 0 && (
                  <div className="text-center py-8 text-neutral-400 text-sm">لا توجد معاملات في النطاق المحدد</div>
                )}
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
