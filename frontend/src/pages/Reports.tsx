import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';

// ─── Types ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = { title: string; subtitle?: string; columns: { header: string; key: string }[]; rows: any[]; totalsRow?: any };
type CustomerItem = { id: number; name: string };
type EmployeeItem = { id: number; fullName: string };

// ─── Report Definitions ───────────────────────────────────────────────────────

type FilterKey = 'date' | 'customer' | 'employee' | 'status' | 'direction';

interface ReportType {
  key: string;
  label: string;
  icon: string;
  group: string;
  filters: FilterKey[];
  statuses?: [string, string][];
}

const REPORT_TYPES: ReportType[] = [
  {
    key: 'invoices', label: 'تقرير الفواتير', icon: '🧾', group: 'المالية',
    filters: ['date', 'customer', 'direction', 'status'],
    statuses: [['UNPAID', 'غير مسدّدة'], ['PARTIAL', 'مدفوعة جزئيًا'], ['PAID', 'مسدّدة'], ['OVERDUE', 'متأخرة'], ['CANCELLED', 'ملغاة']],
  },
  {
    key: 'expenses', label: 'تقرير المصروفات', icon: '💸', group: 'المالية',
    filters: ['date', 'status'],
    statuses: [['PENDING', 'معلّقة'], ['APPROVED', 'معتمدة'], ['REJECTED', 'مرفوضة']],
  },
  {
    key: 'profit-loss', label: 'الأرباح والخسائر', icon: '📈', group: 'المالية',
    filters: ['date'],
  },
  {
    key: 'contracts', label: 'تقرير العقود', icon: '📄', group: 'الأعمال',
    filters: ['customer', 'status'],
    statuses: [['ACTIVE', 'ساري'], ['EXPIRED', 'منتهٍ'], ['RENEWING', 'قيد التجديد'], ['SUSPENDED', 'موقوف']],
  },
  {
    key: 'customers', label: 'تقرير العملاء', icon: '👥', group: 'الأعمال',
    filters: ['status'],
    statuses: [['GOVERNMENT', 'حكومي'], ['PRIVATE', 'خاص']],
  },
  {
    key: 'employees', label: 'تقرير الموظفين', icon: '👷', group: 'الموارد البشرية',
    filters: ['status'],
    statuses: [['ACTIVE', 'نشط'], ['ON_LEAVE', 'إجازة'], ['TERMINATED', 'منتهي الخدمة']],
  },
  {
    key: 'payroll', label: 'تقرير الرواتب', icon: '💵', group: 'الموارد البشرية',
    filters: ['date', 'employee'],
  },
  {
    key: 'attendance', label: 'تقرير الحضور', icon: '📅', group: 'الموارد البشرية',
    filters: ['date', 'employee', 'status'],
    statuses: [['PRESENT', 'حاضر'], ['ABSENT', 'غائب'], ['LATE', 'متأخر'], ['LEAVE', 'إجازة']],
  },
  {
    key: 'equipment', label: 'تقرير المعدّات', icon: '🚜', group: 'التشغيل',
    filters: ['status'],
    statuses: [['WORKING', 'تعمل'], ['NOT_WORKING', 'لا تعمل']],
  },
];

const GROUPS = ['المالية', 'الأعمال', 'الموارد البشرية', 'التشغيل'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return String(v);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Reports() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canView = hasPermission('reports.read');
  const canExport = hasPermission('reports.export');

  const [selected, setSelected] = useState<string>('invoices');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');

  const [preview, setPreview] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [excelBusy, setExcelBusy] = useState(false);

  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);

  const currentType = REPORT_TYPES.find((t) => t.key === selected)!;

  // Load dropdowns once
  useEffect(() => {
    api.get('/customers', { params: { pageSize: 500 } })
      .then((r) => setCustomers(r.data.data.data ?? []))
      .catch(() => {});
    api.get('/employees', { params: { pageSize: 500 } })
      .then((r) => setEmployees(r.data.data.data ?? []))
      .catch(() => {});
  }, []);

  // Reset filters when type changes
  useEffect(() => {
    setFrom(''); setTo('');
    setCustomerId(''); setEmployeeId('');
    setStatus(''); setDirection('');
    setPreview(null); setError('');
  }, [selected]);

  function buildParams(): Record<string, string> {
    const p: Record<string, string> = {};
    if (from) p.from = from;
    if (to) p.to = to;
    if (customerId) p.customerId = customerId;
    if (employeeId) p.employeeId = employeeId;
    if (status) p.status = status;
    if (direction) p.direction = direction;
    return p;
  }

  const loadPreview = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const res = await api.get(`/reports/${selected}/preview`, { params: buildParams() });
      setPreview(res.data.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, from, to, customerId, employeeId, status, direction, canView]);

  async function downloadExcel() {
    if (!canExport) return;
    setExcelBusy(true);
    try {
      const res = await api.get(`/reports/${selected}/export`, {
        params: { ...buildParams(), format: 'excel' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${selected}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExcelBusy(false);
    }
  }

  function openPrint() {
    const params = new URLSearchParams(buildParams());
    const qs = params.toString();
    navigate(`/print/${selected}${qs ? `?${qs}` : ''}`);
  }

  // ─── Sidebar: Type List ───────────────────────────────────────────────────

  const sidebar = (
    <div className="card" style={{ width: 210, flexShrink: 0, padding: 0, overflow: 'hidden' }}>
      {GROUPS.map((group) => {
        const types = REPORT_TYPES.filter((t) => t.group === group);
        return (
          <div key={group}>
            <div style={{ padding: '10px 14px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {group}
            </div>
            {types.map((t) => (
              <button
                key={t.key}
                onClick={() => setSelected(t.key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', border: 'none', cursor: 'pointer', textAlign: 'right',
                  fontSize: 13, fontWeight: selected === t.key ? 700 : 400,
                  background: selected === t.key ? 'var(--primary)' : 'transparent',
                  color: selected === t.key ? '#fff' : 'var(--text)',
                  borderLeft: selected === t.key ? '3px solid var(--primary-dark, #1d4e6f)' : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );

  // ─── Filter Bar ───────────────────────────────────────────────────────────

  const f = currentType.filters;
  const filterBar = (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>

        {f.includes('date') && (
          <>
            <div className="field" style={{ margin: 0, minWidth: 140 }}>
              <label style={{ fontSize: 12 }}>من تاريخ</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 140 }}>
              <label style={{ fontSize: 12 }}>إلى تاريخ</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} />
            </div>
          </>
        )}

        {f.includes('customer') && customers.length > 0 && (
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label style={{ fontSize: 12 }}>العميل</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }}>
              <option value="">— الكل —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {f.includes('employee') && employees.length > 0 && (
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label style={{ fontSize: 12 }}>الموظف</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }}>
              <option value="">— الكل —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>
        )}

        {f.includes('direction') && (
          <div className="field" style={{ margin: 0, minWidth: 140 }}>
            <label style={{ fontSize: 12 }}>الاتجاه</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }}>
              <option value="">— الكل —</option>
              <option value="SALES">مبيعات</option>
              <option value="PURCHASE">مشتريات</option>
            </select>
          </div>
        )}

        {f.includes('status') && currentType.statuses && (
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label style={{ fontSize: 12 }}>الحالة</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }}>
              <option value="">— الكل —</option>
              {currentType.statuses.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginRight: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          {canView && (
            <button className="btn" onClick={loadPreview} disabled={loading} style={{ padding: '8px 18px' }}>
              {loading ? '⏳ جارٍ التحميل…' : '🔍 عرض التقرير'}
            </button>
          )}
          {canExport && preview && (
            <>
              <button className="btn secondary" onClick={downloadExcel} disabled={excelBusy} style={{ padding: '8px 16px' }}>
                {excelBusy ? '⏳' : '⤓ Excel'}
              </button>
              <button className="btn secondary" onClick={openPrint} style={{ padding: '8px 16px' }}>
                🖨️ PDF / طباعة
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Preview Table ────────────────────────────────────────────────────────

  const previewTable = preview && (
    <div className="card" style={{ padding: 0 }}>
      {preview.subtitle && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
          {preview.subtitle}
        </div>
      )}
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              {preview.columns.map((c) => <th key={c.key}>{c.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {preview.rows.length === 0 ? (
              <tr><td colSpan={preview.columns.length}><div className="center-msg">لا توجد بيانات</div></td></tr>
            ) : (
              preview.rows.map((row, i) => (
                <tr key={i}>
                  {preview.columns.map((c) => <td key={c.key}>{fmt(row[c.key])}</td>)}
                </tr>
              ))
            )}
            {preview.totalsRow && (
              <tr style={{ fontWeight: 800, background: 'var(--surface-2)' }}>
                {preview.columns.map((c) => <td key={c.key}>{fmt(preview.totalsRow[c.key])}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>مركز التقارير والتصدير</h2>
          <p>معاينة وتصدير التقارير المالية والإدارية (Excel / PDF بعربية سليمة)</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {sidebar}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{currentType.icon} {currentType.label}</span>
          </div>

          {filterBar}

          {error && <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>}

          {loading && (
            <div className="card" style={{ padding: 40 }}>
              <div className="center-msg"><div className="spinner" />جارٍ تجهيز التقرير…</div>
            </div>
          )}

          {!loading && !preview && !error && (
            <div className="card" style={{ padding: 40 }}>
              <div className="center-msg" style={{ color: 'var(--text-muted)' }}>
                اضبط الفلاتر المطلوبة ثم انقر <strong>عرض التقرير</strong>
              </div>
            </div>
          )}

          {!loading && previewTable}
        </div>
      </div>
    </div>
  );
}
