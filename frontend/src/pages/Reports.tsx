import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import ExportExcelButton from '../components/ExportExcelButton';
import { downloadBlob } from '../utils/exportUtils';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { ARABIC_MONTHS } from '../utils/dateUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = { title: string; subtitle?: string; columns: { header: string; key: string }[]; rows: any[]; totalsRow?: any };
type CustomerItem = { id: number; name: string };
type EmployeeItem = { id: number; fullName: string };

// ─── Report Definitions ───────────────────────────────────────────────────────

type FilterKey = 'date' | 'customer' | 'employee' | 'status' | 'direction' | 'billingMonth' | 'billingYear' | 'company' | 'workType';

interface ReportType {
  key: string;
  label: string;
  icon: string;
  group: string;
  filters: FilterKey[];
  statuses?: [string, string][];
  statusLabel?: string;
}

const REPORT_TYPES: ReportType[] = [
  {
    key: 'invoices', label: 'report.type.invoices', icon: '🧾', group: 'report.group.financial',
    filters: ['date', 'customer', 'direction', 'status'],
    statuses: [['UNPAID', 'inv.status.unpaid'], ['PARTIAL', 'inv.status.partial'], ['PAID', 'inv.status.paid'], ['OVERDUE', 'inv.status.overdue'], ['CANCELLED', 'inv.status.cancelled']],
  },
  {
    key: 'expenses', label: 'report.type.expenses', icon: '💸', group: 'report.group.financial',
    filters: ['date', 'status'],
    statuses: [['PENDING', 'status.pending'], ['APPROVED', 'status.approved'], ['REJECTED', 'status.rejected']],
  },
  {
    key: 'profit-loss', label: 'report.type.profit_loss', icon: '📈', group: 'report.group.financial',
    filters: ['date'],
  },
  {
    key: 'contracts', label: 'report.type.contracts', icon: '📄', group: 'report.group.business',
    filters: ['customer', 'status'],
    statuses: [['ACTIVE', 'opt.contract.active'], ['EXPIRED', 'opt.contract.expired'], ['RENEWING', 'opt.contract.renewing'], ['SUSPENDED', 'opt.contract.suspended']],
  },
  {
    key: 'customers', label: 'report.type.customers', icon: '👥', group: 'report.group.business',
    filters: ['status'],
    statuses: [['GOVERNMENT', 'opt.customer.government'], ['PRIVATE', 'opt.customer.private']],
    statusLabel: 'filter.customer_type',
  },
  {
    key: 'employees', label: 'report.type.employees', icon: '👷', group: 'report.group.hr',
    filters: ['status'],
    statuses: [['ACTIVE', 'opt.emp.active'], ['ON_LEAVE', 'opt.emp.on_leave'], ['TERMINATED', 'opt.emp.terminated']],
  },
  {
    key: 'payroll', label: 'report.type.payroll', icon: '💵', group: 'report.group.hr',
    filters: ['date', 'employee', 'status'],
    statuses: [['DRAFT', 'payroll.status.draft'], ['APPROVED', 'payroll.status.approved'], ['PAID', 'payroll.status.paid'], ['CANCELLED', 'payroll.status.cancelled']],
  },
  {
    key: 'attendance', label: 'report.type.attendance', icon: '📅', group: 'report.group.hr',
    filters: ['date', 'employee', 'status'],
    statuses: [['PRESENT', 'att.present'], ['ABSENT', 'att.absent'], ['LATE', 'att.late'], ['LEAVE', 'att.leave']],
  },
  {
    key: 'equipment', label: 'report.type.equipment', icon: '🚜', group: 'report.group.operations',
    filters: ['status'],
    statuses: [['WORKING', 'opt.eq.working'], ['NOT_WORKING', 'opt.eq.not_working']],
  },
  {
    key: 'expenses-by-company', label: 'تقرير المصروفات حسب الشركة', icon: '🏗️', group: 'report.group.operational',
    filters: ['date', 'billingMonth', 'billingYear', 'company', 'status'],
    statuses: [['PENDING', 'status.pending'], ['APPROVED', 'status.approved'], ['REJECTED', 'status.rejected']],
  },
  {
    key: 'invoices-by-customer', label: 'تقرير الفواتير حسب العميل', icon: '📊', group: 'report.group.operational',
    filters: ['date', 'billingMonth', 'billingYear', 'customer', 'direction', 'status'],
    statuses: [['UNPAID', 'inv.status.unpaid'], ['PARTIAL', 'inv.status.partial'], ['PAID', 'inv.status.paid'], ['OVERDUE', 'inv.status.overdue']],
  },
  {
    key: 'prices-usage', label: 'تقرير استخدام الاتفاقيات', icon: '🤝', group: 'report.group.operational',
    filters: ['customer', 'company', 'workType'],
  },
];

const GROUPS = ['report.group.financial', 'report.group.business', 'report.group.hr', 'report.group.operations', 'report.group.operational'];

const CONTRACT_UNITS = ['طن', 'درب', 'يومية', 'مقطوعية'];

const COMPANY_GROUPS = [
  { value: 'HASSAN', label: 'مصروف عن طريق حسن' },
  { value: 'GHANEM', label: 'مصروف عن طريق غانم' },
  { value: 'NATHEER', label: 'مصروف عن طريق نظير' },
  { value: 'HAROON', label: 'مصروف عن طريق هارون' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return String(v);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Reports() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { t } = useT();
  const canView = hasPermission('reports.read');
  const canExport = hasPermission('reports.export');

  const [selected, setSelected] = useState<string>('invoices');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [billingMonth, setBillingMonth] = useState('');
  const [billingYear, setBillingYear] = useState('');
  const [company, setCompany] = useState('');
  const [workType, setWorkType] = useState('');

  const [preview, setPreview] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [excelBusy, setExcelBusy] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);

  const currentType = REPORT_TYPES.find((rt) => rt.key === selected)!;

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
    setBillingMonth(''); setBillingYear('');
    setCompany(''); setWorkType('');
    setPreview(null); setError('');
  }, [selected]);

  function resetFilters() {
    setFrom(''); setTo('');
    setCustomerId(''); setEmployeeId('');
    setStatus(''); setDirection('');
    setBillingMonth(''); setBillingYear('');
    setCompany(''); setWorkType('');
    setPreview(null); setError('');
  }

  function buildParams(): Record<string, string> {
    const p: Record<string, string> = {};
    if (from) p.from = from;
    if (to) p.to = to;
    if (customerId) p.customerId = customerId;
    if (employeeId) p.employeeId = employeeId;
    if (status) p.status = status;
    if (direction) p.direction = direction;
    if (billingMonth) p.billingMonth = billingMonth;
    if (billingYear) p.billingYear = billingYear;
    if (company) p.company = company;
    if (workType) p.workType = workType;
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
      setGeneratedAt(new Date());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, from, to, customerId, employeeId, status, direction, billingMonth, billingYear, company, workType, canView]);

  async function downloadExcel() {
    if (!canExport) return;
    setExcelBusy(true);
    try {
      const res = await api.get(`/reports/${selected}/export`, {
        params: { ...buildParams(), format: 'excel' },
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, `report-${selected}.xlsx`);
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
        const types = REPORT_TYPES.filter((rt) => rt.group === group);
        return (
          <div key={group}>
            <div style={{ padding: '10px 14px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {t(group)}
            </div>
            {types.map((rt) => (
              <button
                key={rt.key}
                onClick={() => setSelected(rt.key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', border: 'none', cursor: 'pointer', textAlign: 'right',
                  fontSize: 13, fontWeight: selected === rt.key ? 700 : 400,
                  background: selected === rt.key ? 'var(--primary)' : 'transparent',
                  color: selected === rt.key ? '#fff' : 'var(--text)',
                  borderLeft: selected === rt.key ? '3px solid var(--primary-dark, #1d4e6f)' : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{rt.icon}</span>
                <span>{t(rt.label)}</span>
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
              <label>{t('filter.date_from')}</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0, minWidth: 140 }}>
              <label>{t('filter.date_to')}</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}

        {f.includes('customer') && customers.length > 0 && (
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label>{t('filter.customer')}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {f.includes('employee') && employees.length > 0 && (
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label>{t('filter.employee')}</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>
        )}

        {f.includes('direction') && (
          <div className="field" style={{ margin: 0, minWidth: 140 }}>
            <label>{t('filter.direction')}</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              <option value="SALES">{t('opt.direction.sales')}</option>
              <option value="PURCHASE">{t('opt.direction.purchase')}</option>
            </select>
          </div>
        )}

        {f.includes('status') && currentType.statuses && (
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label>{t(currentType.statusLabel ?? 'filter.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {currentType.statuses.map(([val, lbl]) => <option key={val} value={val}>{t(lbl)}</option>)}
            </select>
          </div>
        )}

        {f.includes('billingMonth') && (
          <div className="field" style={{ margin: 0, minWidth: 130 }}>
            <label>شهر الحساب</label>
            <select value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)}>
              <option value="">الكل</option>
              {ARABIC_MONTHS.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
            </select>
          </div>
        )}

        {f.includes('billingYear') && (
          <div className="field" style={{ margin: 0, minWidth: 100 }}>
            <label>السنة</label>
            <select value={billingYear} onChange={(e) => setBillingYear(e.target.value)}>
              <option value="">الكل</option>
              {[new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        )}

        {f.includes('company') && (
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label>الشركة / المسؤول</label>
            <select value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">الكل</option>
              {COMPANY_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
        )}

        {f.includes('workType') && (
          <div className="field" style={{ margin: 0, minWidth: 140 }}>
            <label>نوع العمل</label>
            <select value={workType} onChange={(e) => setWorkType(e.target.value)}>
              <option value="">الكل</option>
              {CONTRACT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginRight: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          {canView && (
            <button type="button" className="btn" onClick={loadPreview} disabled={loading}>
              {loading ? t('page.reports.loading') : t('page.reports.view')}
            </button>
          )}
          {(from || to || customerId || employeeId || status || direction || billingMonth || billingYear || company || workType) && (
            <button type="button" className="btn secondary" onClick={resetFilters}>
              {t('action.reset_filters')}
            </button>
          )}
          {canExport && preview && (
            <>
              <ExportExcelButton onExport={downloadExcel} busy={excelBusy} />
              <button type="button" className="btn secondary" onClick={openPrint}>
                🖨️ {t('btn.reports.print')}
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
              <tr><td colSpan={preview.columns.length}><div className="center-msg">{t('page.reports.no_data')}</div></td></tr>
            ) : (
              preview.rows.map((row, i) => (
                <tr key={i}>
                  {preview.columns.map((c) => <td key={c.key}>{fmt(row[c.key])}</td>)}
                </tr>
              ))
            )}
            {preview.totalsRow && (
              <tr style={{ fontWeight: 800, background: '#e8f0f7', borderTop: '2px solid #1d4e6f', color: '#1d4e6f' }}>
                {preview.columns.map((c) => <td key={c.key} style={{ padding: '9px 14px', fontSize: 13 }}>{fmt(preview.totalsRow[c.key])}</td>)}
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
          <h2>{t('page.reports.title')}</h2>
          <p>{t('page.reports.subtitle')}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {sidebar}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{currentType.icon} {t(currentType.label)}</span>
          </div>

          {filterBar}

          {['invoices', 'expenses', 'payroll'].includes(selected) && !from && !to && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 8, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
              ℹ️ {t('page.reports.date_range_hint')}
            </div>
          )}

          {error && <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>}

          {loading && (
            <div className="card" style={{ padding: 40 }}>
              <div className="center-msg"><div className="spinner" />{t('page.reports.preparing')}</div>
            </div>
          )}

          {!loading && !preview && !error && (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{currentType.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{t(currentType.label)}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('page.reports.empty')}</div>
            </div>
          )}

          {!loading && preview && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
                {preview.rows.length} {t('page.reports.results_count')}
              </span>
              {generatedAt && (
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  آخر تحديث: {generatedAt.toLocaleTimeString('ar')}
                </span>
              )}
            </div>
          )}
          {!loading && previewTable}
        </div>
      </div>
    </div>
  );
}
