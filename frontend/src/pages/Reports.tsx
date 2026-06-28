import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import ExportExcelButton from '../components/ExportExcelButton';
import { downloadBlob } from '../utils/exportUtils';
import { exportReportAsPdf } from '../utils/pdfExport';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { ARABIC_MONTHS } from '../utils/dateUtils';
import './Reports.css';

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
  groupAr: string;
  filters: FilterKey[];
  statuses?: [string, string][];
  statusLabel?: string;
  descAr?: string;
  statusType?: 'ready' | 'needs-filter' | 'live';
}

const REPORT_TYPES: ReportType[] = [
  {
    key: 'invoices', label: 'report.type.invoices', icon: '🧾', group: 'report.group.financial', groupAr: 'المالية',
    filters: ['date', 'customer', 'direction', 'status'],
    statuses: [['UNPAID', 'inv.status.unpaid'], ['PARTIAL', 'inv.status.partial'], ['PAID', 'inv.status.paid'], ['OVERDUE', 'inv.status.overdue'], ['CANCELLED', 'inv.status.cancelled']],
    descAr: 'تقرير شامل بجميع الفواتير المبيعات والمشتريات مع الحالات والمجاميع',
    statusType: 'needs-filter',
  },
  {
    key: 'expenses', label: 'report.type.expenses', icon: '💸', group: 'report.group.financial', groupAr: 'المالية',
    filters: ['date', 'status'],
    statuses: [['PENDING', 'status.pending'], ['APPROVED', 'status.approved'], ['REJECTED', 'status.rejected']],
    descAr: 'تقرير المصروفات المعتمدة والمعلقة للفترة المختارة',
    statusType: 'needs-filter',
  },
  {
    key: 'profit-loss', label: 'report.type.profit_loss', icon: '📈', group: 'report.group.financial', groupAr: 'المالية',
    filters: ['date'],
    descAr: 'تقرير الأرباح والخسائر للفترة المالية المحددة',
    statusType: 'ready',
  },
  {
    key: 'contracts', label: 'report.type.contracts', icon: '📄', group: 'report.group.business', groupAr: 'الأعمال',
    filters: ['customer', 'status'],
    statuses: [['ACTIVE', 'opt.contract.active'], ['EXPIRED', 'opt.contract.expired'], ['RENEWING', 'opt.contract.renewing'], ['SUSPENDED', 'opt.contract.suspended']],
    descAr: 'قائمة العقود مع العملاء وحالاتها',
    statusType: 'ready',
  },
  {
    key: 'customers', label: 'report.type.customers', icon: '👥', group: 'report.group.business', groupAr: 'الأعمال',
    filters: ['status'],
    statuses: [['GOVERNMENT', 'opt.customer.government'], ['PRIVATE', 'opt.customer.private']],
    statusLabel: 'filter.customer_type',
    descAr: 'قائمة جميع العملاء مصنفةً حسب النوع',
    statusType: 'ready',
  },
  {
    key: 'employees', label: 'report.type.employees', icon: '👷', group: 'report.group.hr', groupAr: 'الموارد البشرية',
    filters: ['status'],
    statuses: [['ACTIVE', 'opt.emp.active'], ['ON_LEAVE', 'opt.emp.on_leave'], ['TERMINATED', 'opt.emp.terminated']],
    descAr: 'قائمة الموظفين مع حالاتهم الوظيفية',
    statusType: 'ready',
  },
  {
    key: 'payroll', label: 'report.type.payroll', icon: '💵', group: 'report.group.hr', groupAr: 'الموارد البشرية',
    filters: ['date', 'employee', 'status'],
    statuses: [['DRAFT', 'payroll.status.draft'], ['APPROVED', 'payroll.status.approved'], ['PAID', 'payroll.status.paid'], ['CANCELLED', 'payroll.status.cancelled']],
    descAr: 'تقرير مسير الرواتب للموظفين',
    statusType: 'needs-filter',
  },
  {
    key: 'attendance', label: 'report.type.attendance', icon: '📅', group: 'report.group.hr', groupAr: 'الموارد البشرية',
    filters: ['date', 'employee', 'status'],
    statuses: [['PRESENT', 'att.present'], ['ABSENT', 'att.absent'], ['LATE', 'att.late'], ['LEAVE', 'att.leave']],
    descAr: 'سجل الحضور والغياب للموظفين',
    statusType: 'needs-filter',
  },
  {
    key: 'equipment', label: 'report.type.equipment', icon: '🚜', group: 'report.group.operations', groupAr: 'العمليات',
    filters: ['status'],
    statuses: [['WORKING', 'opt.eq.working'], ['NOT_WORKING', 'opt.eq.not_working']],
    descAr: 'حالة المعدات والآليات العاملة والمتوقفة',
    statusType: 'ready',
  },
  {
    key: 'expenses-by-company', label: 'تقرير المصروفات حسب الشركة', icon: '🏗️', group: 'report.group.operational', groupAr: 'العمليات التشغيلية',
    filters: ['date', 'billingMonth', 'billingYear', 'company', 'status'],
    statuses: [['PENDING', 'status.pending'], ['APPROVED', 'status.approved'], ['REJECTED', 'status.rejected']],
    descAr: 'تقرير المصروفات مصنفاً حسب الشركة أو المسؤول',
    statusType: 'needs-filter',
  },
  {
    key: 'invoices-by-customer', label: 'تقرير الفواتير حسب العميل', icon: '📊', group: 'report.group.operational', groupAr: 'العمليات التشغيلية',
    filters: ['date', 'billingMonth', 'billingYear', 'customer', 'direction', 'status'],
    statuses: [['UNPAID', 'inv.status.unpaid'], ['PARTIAL', 'inv.status.partial'], ['PAID', 'inv.status.paid'], ['OVERDUE', 'inv.status.overdue']],
    descAr: 'تقرير الفواتير مجمعاً ومصنفاً لكل عميل',
    statusType: 'needs-filter',
  },
  {
    key: 'prices-usage', label: 'تقرير استخدام الاتفاقيات', icon: '🤝', group: 'report.group.operational', groupAr: 'العمليات التشغيلية',
    filters: ['customer', 'company', 'workType'],
    descAr: 'تقرير استخدام اتفاقيات الأسعار حسب العميل ونوع العمل',
    statusType: 'ready',
  },
  {
    key: 'customer-statement', label: 'report.type.customer_statement', icon: '📋', group: 'report.group.receivables', groupAr: 'المستحقات',
    filters: ['customer', 'date'],
    descAr: 'كشف حساب تفصيلي لعميل محدد',
    statusType: 'needs-filter',
  },
  {
    key: 'receivables-aging', label: 'report.type.receivables_aging', icon: '⏳', group: 'report.group.receivables', groupAr: 'المستحقات',
    filters: ['date', 'customer'],
    descAr: 'تحليل عمر الذمم المدينة مصنفاً حسب الفترات الزمنية',
    statusType: 'live',
  },
  {
    key: 'customer-balances', label: 'report.type.customer_balances', icon: '⚖️', group: 'report.group.receivables', groupAr: 'المستحقات',
    filters: ['customer', 'date'],
    descAr: 'أرصدة العملاء الإجمالية والمستحقة',
    statusType: 'live',
  },
  {
    key: 'collections-summary', label: 'report.type.collections_summary', icon: '💰', group: 'report.group.receivables', groupAr: 'المستحقات',
    filters: ['date', 'customer'],
    descAr: 'ملخص تحصيلات الفترة المالية المختارة',
    statusType: 'live',
  },
];

const CONTRACT_UNITS = ['طن', 'درب', 'يومية', 'مقطوعية'];

const COMPANY_GROUPS = [
  { value: 'HASSAN', label: 'مصروف عن طريق حسن' },
  { value: 'GHANEM', label: 'مصروف عن طريق غانم' },
  { value: 'NATHEER', label: 'مصروف عن طريق نظير' },
  { value: 'HAROON', label: 'مصروف عن طريق هارون' },
];

const CHIP_GROUPS = [
  { key: 'all', label: 'الكل', group: undefined },
  { key: 'financial', label: 'المالية', group: 'report.group.financial' },
  { key: 'business', label: 'الأعمال', group: 'report.group.business' },
  { key: 'hr', label: 'الموارد البشرية', group: 'report.group.hr' },
  { key: 'operations', label: 'العمليات', group: 'report.group.operations' },
  { key: 'operational', label: 'التشغيلية', group: 'report.group.operational' },
  { key: 'receivables', label: 'المستحقات', group: 'report.group.receivables' },
  { key: 'favorites', label: '⭐ المفضلة', group: undefined },
];

const LS_FAVORITES = 'rc_favorites_v1';
const LS_RECENT    = 'rc_recent_v1';

function loadFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_FAVORITES) ?? '[]'); } catch { return []; }
}
function saveFavorites(ids: string[]) { localStorage.setItem(LS_FAVORITES, JSON.stringify(ids)); }
function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_RECENT) ?? '[]'); } catch { return []; }
}
function pushRecent(key: string) {
  const prev = loadRecent().filter((k) => k !== key);
  localStorage.setItem(LS_RECENT, JSON.stringify([key, ...prev].slice(0, 5)));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return String(v);
}

function getStatusBadge(type: ReportType['statusType']) {
  if (type === 'needs-filter') return { cls: 'needs-filter', label: '🟡 يحتاج فلاتر' };
  if (type === 'live')         return { cls: 'live',         label: '🔵 تقرير مباشر' };
  return                              { cls: 'ready',        label: '🟢 جاهز' };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Reports() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { t } = useT();
  const canView   = hasPermission('reports.read');
  const canExport = hasPermission('reports.export');

  // Filter state — preserved exactly
  const [selected, setSelected]       = useState<string>('invoices');
  const [from, setFrom]               = useState('');
  const [to, setTo]                   = useState('');
  const [customerId, setCustomerId]   = useState('');
  const [employeeId, setEmployeeId]   = useState('');
  const [status, setStatus]           = useState('');
  const [direction, setDirection]     = useState('');
  const [billingMonth, setBillingMonth] = useState('');
  const [billingYear, setBillingYear]   = useState('');
  const [company, setCompany]         = useState('');
  const [workType, setWorkType]       = useState('');

  // Preview state — preserved exactly
  const [preview, setPreview]         = useState<ReportData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [excelBusy, setExcelBusy]     = useState(false);
  const [pdfBusy,   setPdfBusy]       = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  // Dropdown data
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);

  // Explorer state
  const [search, setSearch]         = useState('');
  const [activeChip, setActiveChip] = useState('all');
  const [favorites, setFavorites]   = useState<string[]>(loadFavorites);
  const [panelOpen, setPanelOpen]   = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const currentType = useMemo(() => REPORT_TYPES.find((rt) => rt.key === selected)!, [selected]);

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

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    function onOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [exportOpen]);

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
    if (from)         p.from         = from;
    if (to)           p.to           = to;
    if (customerId)   p.customerId   = customerId;
    if (employeeId)   p.employeeId   = employeeId;
    if (status)       p.status       = status;
    if (direction)    p.direction    = direction;
    if (billingMonth) p.billingMonth = billingMonth;
    if (billingYear)  p.billingYear  = billingYear;
    if (company)      p.company      = company;
    if (workType)     p.workType     = workType;
    return p;
  }

  const loadPreview = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    setPreview(null);
    setPanelOpen(false);
    try {
      const res = await api.get(`/reports/${selected}/preview`, { params: buildParams() });
      setPreview(res.data.data);
      setGeneratedAt(new Date());
      pushRecent(selected);
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
    setExportOpen(false);
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

  async function downloadPdf() {
    if (!canExport) return;
    setPdfBusy(true);
    setExportOpen(false);
    try {
      await exportReportAsPdf(
        `/reports/${selected}/export`,
        { ...buildParams(), format: 'html' },
        `report-${selected}`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPdfBusy(false);
    }
  }

  function openPrint() {
    const params = new URLSearchParams(buildParams());
    const qs = params.toString();
    setExportOpen(false);
    navigate(`/print/${selected}${qs ? `?${qs}` : ''}`);
  }

  function toggleFavorite(key: string) {
    setFavorites((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      saveFavorites(next);
      return next;
    });
  }

  function selectReport(key: string) {
    setSelected(key);
    setPreview(null);
    setError('');
  }

  // Filtered report list
  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return REPORT_TYPES.filter((rt) => {
      if (activeChip === 'favorites') return favorites.includes(rt.key);
      if (activeChip !== 'all') {
        const chip = CHIP_GROUPS.find((c) => c.key === activeChip);
        if (chip?.group && rt.group !== chip.group) return false;
      }
      if (!q) return true;
      const label = t(rt.label).toLowerCase();
      const desc  = (rt.descAr ?? '').toLowerCase();
      const grp   = rt.groupAr.toLowerCase();
      return label.includes(q) || desc.includes(q) || grp.includes(q) || rt.key.includes(q);
    });
  }, [search, activeChip, favorites, t]);

  // KPI values
  const kpi = useMemo(() => ({
    total:       REPORT_TYPES.length,
    ready:       REPORT_TYPES.filter((r) => r.statusType === 'ready').length,
    needsFilter: REPORT_TYPES.filter((r) => r.statusType === 'needs-filter').length,
    live:        REPORT_TYPES.filter((r) => r.statusType === 'live').length,
    financial:   REPORT_TYPES.filter((r) => r.group === 'report.group.financial').length,
    hr:          REPORT_TYPES.filter((r) => r.group === 'report.group.hr').length,
    ops:         REPORT_TYPES.filter((r) => ['report.group.operations', 'report.group.operational'].includes(r.group)).length,
    recv:        REPORT_TYPES.filter((r) => r.group === 'report.group.receivables').length,
  }), []);

  // Recent reports (recalculates after each successful run)
  const recentReports = useMemo(() => {
    return loadRecent()
      .map((k) => REPORT_TYPES.find((r) => r.key === k))
      .filter(Boolean) as ReportType[];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedAt]);

  const groupCounts = useMemo(() => {
    const map: Record<string, number> = {};
    filteredReports.forEach((r) => { map[r.groupAr] = (map[r.groupAr] ?? 0) + 1; });
    return map;
  }, [filteredReports]);

  const hasAnyFilter = !!(from || to || customerId || employeeId || status || direction || billingMonth || billingYear || company || workType);
  const f = currentType.filters;

  // ─── Filter fields (reused in both panel and inline) ──────────────────────

  function renderFilterFields() {
    return (
      <>
        {f.includes('date') && (
          <>
            <div className="rc-panel-field">
              <label>{t('filter.date_from')}</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="rc-panel-field">
              <label>{t('filter.date_to')}</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
        {f.includes('customer') && customers.length > 0 && (
          <div className="rc-panel-field">
            <label>{t('filter.customer')}</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {f.includes('employee') && employees.length > 0 && (
          <div className="rc-panel-field">
            <label>{t('filter.employee')}</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>
        )}
        {f.includes('direction') && (
          <div className="rc-panel-field">
            <label>{t('filter.direction')}</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              <option value="SALES">{t('opt.direction.sales')}</option>
              <option value="PURCHASE">{t('opt.direction.purchase')}</option>
            </select>
          </div>
        )}
        {f.includes('status') && currentType.statuses && (
          <div className="rc-panel-field">
            <label>{t(currentType.statusLabel ?? 'filter.status')}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {currentType.statuses.map(([val, lbl]) => <option key={val} value={val}>{t(lbl)}</option>)}
            </select>
          </div>
        )}
        {f.includes('billingMonth') && (
          <div className="rc-panel-field">
            <label>شهر الحساب</label>
            <select value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)}>
              <option value="">الكل</option>
              {ARABIC_MONTHS.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
            </select>
          </div>
        )}
        {f.includes('billingYear') && (
          <div className="rc-panel-field">
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
          <div className="rc-panel-field">
            <label>الشركة / المسؤول</label>
            <select value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">الكل</option>
              {COMPANY_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
        )}
        {f.includes('workType') && (
          <div className="rc-panel-field">
            <label>نوع العمل</label>
            <select value={workType} onChange={(e) => setWorkType(e.target.value)}>
              <option value="">الكل</option>
              {CONTRACT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
      </>
    );
  }

  // ─── Skeleton loading ─────────────────────────────────────────────────────

  const skeleton = (
    <div className="rc-skeleton-grid">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rc-skeleton-card">
          <div className="rc-skeleton-line rc-skeleton-shimmer" style={{ width: 48, height: 48, borderRadius: 12 }} />
          <div className="rc-skeleton-line rc-skeleton-shimmer" style={{ height: 16, width: '70%', marginTop: 4 }} />
          <div className="rc-skeleton-line rc-skeleton-shimmer" style={{ height: 12, width: '90%' }} />
          <div className="rc-skeleton-line rc-skeleton-shimmer" style={{ height: 12, width: '60%' }} />
        </div>
      ))}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="rc-page">

      {/* Side panel overlay */}
      {panelOpen && (
        <>
          <div className="rc-overlay" onClick={() => setPanelOpen(false)} />
          <div className="rc-panel">
            <div className="rc-panel-header">
              <div className="rc-panel-title">
                <span>{currentType.icon}</span>
                <span>{t(currentType.label)}</span>
              </div>
              <button type="button" className="rc-panel-close" onClick={() => setPanelOpen(false)}>✕</button>
            </div>
            <div className="rc-panel-body">
              {currentType.descAr && (
                <div className="rc-panel-section">
                  <div className="rc-panel-section-title">وصف التقرير</div>
                  <div className="rc-panel-desc">{currentType.descAr}</div>
                </div>
              )}
              <div className="rc-panel-section">
                <div className="rc-panel-section-title">معلومات التقرير</div>
                <div className="rc-panel-row">
                  <span className="rc-panel-row-label">الفئة</span>
                  <span className="rc-panel-row-value">{currentType.groupAr}</span>
                </div>
                <div className="rc-panel-row">
                  <span className="rc-panel-row-label">الحالة</span>
                  <span className={`rc-status-badge ${getStatusBadge(currentType.statusType).cls}`}>
                    {getStatusBadge(currentType.statusType).label}
                  </span>
                </div>
              </div>
              {f.length > 0 && (
                <div className="rc-panel-section">
                  <div className="rc-panel-section-title">الفلاتر</div>
                  <div className="rc-panel-filters">
                    {renderFilterFields()}
                  </div>
                </div>
              )}
            </div>
            <div className="rc-panel-footer">
              {canView && (
                <button type="button" className="btn" onClick={() => { setPanelOpen(false); loadPreview(); }}>
                  ▶ تشغيل التقرير
                </button>
              )}
              {hasAnyFilter && (
                <button type="button" className="btn secondary" onClick={resetFilters}>مسح الفلاتر</button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Hero */}
      <div className="rc-hero">
        <div className="rc-hero-left">
          <div className="rc-hero-icon">📊</div>
          <h2 className="rc-hero-title">مركز التقارير</h2>
          <p className="rc-hero-subtitle">استعرض وصدّر تقارير الأعمال والمالية والموارد البشرية</p>
        </div>
        <div className="rc-hero-chips">
          <div className="rc-hero-chip">
            <span className="rc-hero-chip-dot" />
            <span>{kpi.total} تقرير</span>
          </div>
          <div className="rc-hero-chip green">
            <span className="rc-hero-chip-dot green" />
            <span>{kpi.ready} جاهز</span>
          </div>
          <div className="rc-hero-chip amber">
            <span className="rc-hero-chip-dot amber" />
            <span>{kpi.needsFilter} يحتاج فلاتر</span>
          </div>
          <div className="rc-hero-chip blue">
            <span className="rc-hero-chip-dot blue" />
            <span>{kpi.live} مباشر</span>
          </div>
          {favorites.length > 0 && (
            <div className="rc-hero-chip">
              <span>⭐</span>
              <span>{favorites.length} مفضل</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="rc-kpi-grid">
        <div className="rc-kpi-card">
          <div className="rc-kpi-icon blue">📊</div>
          <div className="rc-kpi-info"><div className="rc-kpi-value">{kpi.total}</div><div className="rc-kpi-label">إجمالي التقارير</div></div>
        </div>
        <div className="rc-kpi-card">
          <div className="rc-kpi-icon green">💰</div>
          <div className="rc-kpi-info"><div className="rc-kpi-value">{kpi.financial}</div><div className="rc-kpi-label">التقارير المالية</div></div>
        </div>
        <div className="rc-kpi-card">
          <div className="rc-kpi-icon amber">👷</div>
          <div className="rc-kpi-info"><div className="rc-kpi-value">{kpi.hr}</div><div className="rc-kpi-label">الموارد البشرية</div></div>
        </div>
        <div className="rc-kpi-card">
          <div className="rc-kpi-icon blue">🚜</div>
          <div className="rc-kpi-info"><div className="rc-kpi-value">{kpi.ops}</div><div className="rc-kpi-label">العمليات</div></div>
        </div>
        <div className="rc-kpi-card">
          <div className="rc-kpi-icon green">⚖️</div>
          <div className="rc-kpi-info"><div className="rc-kpi-value">{kpi.recv}</div><div className="rc-kpi-label">المستحقات</div></div>
        </div>
        <div className="rc-kpi-card">
          <div className="rc-kpi-icon green">🟢</div>
          <div className="rc-kpi-info"><div className="rc-kpi-value">{kpi.ready}</div><div className="rc-kpi-label">جاهز للتشغيل</div></div>
        </div>
        <div className="rc-kpi-card">
          <div className="rc-kpi-icon amber">🟡</div>
          <div className="rc-kpi-info"><div className="rc-kpi-value">{kpi.needsFilter}</div><div className="rc-kpi-label">يحتاج فلاتر</div></div>
        </div>
        <div className="rc-kpi-card">
          <div className="rc-kpi-icon blue">⭐</div>
          <div className="rc-kpi-info"><div className="rc-kpi-value">{favorites.length}</div><div className="rc-kpi-label">المفضلة</div></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rc-toolbar">
        <div className="rc-search-row">
          <div className="rc-search-wrap">
            <span className="rc-search-icon">🔍</span>
            <input
              className="rc-search-input"
              type="text"
              placeholder="البحث في التقارير..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="rc-search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
          {recentReports.length > 0 && (
            <div className="rc-summary-bar rc-recent-bar">
              <span>الأخيرة:</span>
              {recentReports.map((r) => (
                <button
                  type="button"
                  key={r.key}
                  className="rc-summary-badge rc-recent-btn"
                  onClick={() => selectReport(r.key)}
                >
                  {r.icon} {t(r.label)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rc-filter-chips">
          {CHIP_GROUPS.map((chip) => (
            <button
              type="button"
              key={chip.key}
              className={`rc-filter-chip${activeChip === chip.key ? ' active' : ''}`}
              onClick={() => setActiveChip(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div className="rc-summary-bar">
        <span>يعرض <strong>{filteredReports.length}</strong> تقرير{search && <> · نتائج "{search}"</>}</span>
        {Object.entries(groupCounts).map(([grp, cnt]) => (
          <span key={grp} className="rc-summary-badge">{grp} ({cnt})</span>
        ))}
        {favorites.length > 0 && <span className="rc-summary-badge">⭐ {favorites.length} مفضل</span>}
      </div>

      {/* Report cards grid */}
      <div className="rc-card-grid">
        {filteredReports.length === 0 ? (
          <div className="rc-empty">
            <div className="rc-empty-icon">🔍</div>
            <div className="rc-empty-title">لا توجد تقارير مطابقة</div>
            <div className="rc-empty-desc">جرّب تعديل كلمة البحث أو اختيار فئة مختلفة</div>
          </div>
        ) : (
          filteredReports.map((rt) => {
            const badge  = getStatusBadge(rt.statusType);
            const isFav  = favorites.includes(rt.key);
            const isSel  = selected === rt.key;
            return (
              <div key={rt.key} className={`rc-card${isSel ? ' selected' : ''}`} onClick={() => selectReport(rt.key)}>
                <div className="rc-card-top">
                  <div className="rc-card-icon-wrap">{rt.icon}</div>
                  <div className="rc-card-top-right">
                    <button
                      type="button"
                      className={`rc-fav-btn${isFav ? ' active' : ''}`}
                      title={isFav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(rt.key); }}
                    >
                      {isFav ? '⭐' : '☆'}
                    </button>
                  </div>
                </div>
                <div className="rc-card-body">
                  <div className="rc-card-name">{t(rt.label)}</div>
                  {rt.descAr && <div className="rc-card-desc">{rt.descAr}</div>}
                </div>
                <div className="rc-card-meta">
                  <span className={`rc-status-badge ${badge.cls}`}>{badge.label}</span>
                  <span className="rc-category-tag">{rt.groupAr}</span>
                </div>
                <div className="rc-card-actions">
                  {canView && (
                    <button
                      type="button"
                      className="rc-action-btn primary"
                      onClick={(e) => { e.stopPropagation(); selectReport(rt.key); setTimeout(loadPreview, 0); }}
                    >
                      ▶ تشغيل
                    </button>
                  )}
                  <button
                    type="button"
                    className="rc-action-btn"
                    onClick={(e) => { e.stopPropagation(); selectReport(rt.key); setPanelOpen(true); }}
                  >
                    ⚙ إعدادات
                  </button>
                  <button
                    type="button"
                    className="rc-action-btn"
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(rt.key); }}
                  >
                    {isFav ? '★ مفضل' : '☆ مفضلة'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Selected report run section */}
      <div className="rc-run-section">
        <div className="rc-run-header">
          <div className="rc-run-info">
            <span className="rc-run-icon">{currentType.icon}</span>
            <div>
              <div className="rc-run-name">{t(currentType.label)}</div>
              {currentType.descAr && <div className="rc-run-desc">{currentType.descAr}</div>}
            </div>
          </div>
          <div className="rc-run-actions">
            <button type="button" className="btn secondary" onClick={() => setPanelOpen(true)}>⚙ الفلاتر</button>
            {canView && (
              <button type="button" className="btn" onClick={loadPreview} disabled={loading}>
                {loading ? t('page.reports.loading') : '▶ ' + t('page.reports.view')}
              </button>
            )}
            {hasAnyFilter && (
              <button type="button" className="btn secondary" onClick={resetFilters}>{t('action.reset_filters')}</button>
            )}
            {/* Export dropdown */}
            {canExport && preview && (
              <div className="rc-export-wrap" ref={exportRef}>
                <button
                  type="button"
                  className="rc-export-btn"
                  onClick={() => setExportOpen((o) => !o)}
                  disabled={excelBusy || pdfBusy}
                >
                  <span>📤</span>
                  <span>تصدير</span>
                  <span className="rc-export-arrow">▾</span>
                </button>
                {exportOpen && (
                  <div className="rc-export-menu">
                    <ExportExcelButton onExport={downloadExcel} busy={excelBusy} />
                    {window.manar?.exportPdfFromHtml && (
                      <button type="button" className="rc-export-item" onClick={downloadPdf} disabled={pdfBusy}>
                        📄 {pdfBusy ? '...' : 'تصدير PDF'}
                      </button>
                    )}
                    <button type="button" className="rc-export-item" onClick={openPrint}>
                      🖨️ طباعة
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Hints */}
        {['invoices', 'expenses', 'payroll'].includes(selected) && !from && !to && (
          <div className="rc-hint">ℹ️ {t('page.reports.date_range_hint')}</div>
        )}
        {selected === 'customer-statement' && !customerId && (
          <div className="rc-hint warn">⚠️ يجب اختيار عميل لعرض كشف الحساب</div>
        )}
        {error && <div className="rc-hint error">⚠️ {error}</div>}

        {/* Loading skeleton */}
        {loading && skeleton}

        {/* Results bar */}
        {!loading && preview && (
          <div className="rc-results-bar">
            <span><strong>{preview.rows.length}</strong> {t('page.reports.results_count')}</span>
            {generatedAt && <span>آخر تحديث: {generatedAt.toLocaleTimeString('ar')}</span>}
          </div>
        )}

        {/* Empty state */}
        {!loading && !preview && !error && (
          <div className="rc-run-empty">
            <div className="rc-run-empty-icon">{currentType.icon}</div>
            <div className="rc-run-empty-title">{t(currentType.label)}</div>
            <div className="rc-run-empty-hint">{t('page.reports.empty')}</div>
          </div>
        )}

        {/* Preview table */}
        {!loading && preview && (
          <div className="rc-preview-card">
            {preview.subtitle && <div className="rc-preview-subtitle">{preview.subtitle}</div>}
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>{preview.columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.rows.length === 0 ? (
                    <tr><td colSpan={preview.columns.length}><div className="center-msg">{t('page.reports.no_data')}</div></td></tr>
                  ) : (
                    preview.rows.map((row, i) => (
                      <tr key={i}>{preview.columns.map((c) => <td key={c.key}>{fmt(row[c.key])}</td>)}</tr>
                    ))
                  )}
                  {preview.totalsRow && (
                    <tr className="rc-totals-row">
                      {preview.columns.map((c) => <td key={c.key}>{fmt(preview.totalsRow[c.key])}</td>)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
