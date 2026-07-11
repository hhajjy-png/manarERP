import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import { downloadBlob } from '../utils/exportUtils';
import { exportReportAsPdf } from '../utils/pdfExport';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { useAuth } from '../stores/authStore';
import { useFinancialPeriod } from '../context/FinancialPeriodContext';
import PeriodControl from '../components/period/PeriodControl';
import { useT } from '../lib/i18n';
import { ARABIC_MONTHS } from '../utils/dateUtils';
import { formatReportCell } from '../lib/format';
import { currentCurrencyLanguage } from '../stores/settingsStore';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  StatusChip,
  FilterChip,
  SearchBox,
  SectionCard,
  EmptyState,
  Drawer,
  DrawerSection,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Reports.css';

// ─── Types ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = { title: string; subtitle?: string; columns: { header: string; key: string; format?: 'currency' }[]; rows: any[]; totalsRow?: any };
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

const CONTRACT_UNITS = ['طن', 'درب', 'معالجات', 'يومية', 'مقطوعية'];

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
  { key: 'favorites', label: 'المفضلة', group: undefined },
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

type StatusTone = 'green' | 'orange' | 'blue';
function statusMeta(type: ReportType['statusType']): { tone: StatusTone; label: string; icon: string } {
  if (type === 'needs-filter') return { tone: 'orange', label: 'يحتاج فلاتر', icon: 'tune' };
  if (type === 'live')         return { tone: 'blue',   label: 'تقرير مباشر', icon: 'bolt' };
  return                              { tone: 'green',  label: 'جاهز', icon: 'check_circle' };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Reports() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { t } = useT();
  const { period } = useFinancialPeriod();
  const canView   = hasPermission('reports.read');
  const canExport = hasPermission('reports.export');

  // Filter state — preserved exactly
  const [selected, setSelected]       = useState<string>('invoices');
  // تبدأ من الفترة العالمية (السنة حتى اليوم افتراضيًا) بدل all-time الصامت.
  const [from, setFrom]               = useState(period.fromDate ?? '');
  const [to, setTo]                   = useState(period.toDate ?? '');
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

  // إعادة الفلاتر عند تغيّر نوع التقرير أو الفترة العالمية — from/to يتبعان الفترة
  // (السنة حتى اليوم افتراضيًا) بدل إفراغهما إلى all-time.
  useEffect(() => {
    setFrom(period.fromDate ?? ''); setTo(period.toDate ?? '');
    setCustomerId(''); setEmployeeId('');
    setStatus(''); setDirection('');
    setBillingMonth(''); setBillingYear('');
    setCompany(''); setWorkType('');
    setPreview(null); setError('');
  }, [selected, period.fromDate, period.toDate, period.isAllPeriods]);

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

  // وسم الفترة لاسم الملف: نطاق from/to، أو «كل الفترات» عند غيابهما.
  const exportPeriod = { from: from || undefined, to: to || undefined, allPeriods: !from && !to };

  async function downloadExcel() {
    if (!canExport) return;
    setExcelBusy(true);
    setExportOpen(false);
    try {
      const res = await api.get(`/reports/${selected}/export`, {
        params: { ...buildParams(), format: 'excel' },
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, generateExportFileName({ reportName: ReportName.Report, identifier: selected, period: exportPeriod, extension: 'xlsx' }));
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
        generateExportFileName({ reportName: ReportName.Report, identifier: selected, period: exportPeriod, extension: 'pdf' }),
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

  // Per-chip counts for filter chips
  const chipCounts = useMemo(() => {
    const map: Record<string, number> = { all: REPORT_TYPES.length, favorites: favorites.length };
    CHIP_GROUPS.forEach((c) => {
      if (c.group) map[c.key] = REPORT_TYPES.filter((r) => r.group === c.group).length;
    });
    return map;
  }, [favorites]);

  const hasAnyFilter = !!(from || to || customerId || employeeId || status || direction || billingMonth || billingYear || company || workType);
  const f = currentType.filters;
  const curStatus = statusMeta(currentType.statusType);

  // ─── Filter fields (rendered inside the report drawer) ────────────────────

  function renderFilterFields() {
    return (
      <div className="rcx-drawer-filters">
        {f.includes('date') && (
          <>
            <div className="rcx-filter-field">
              <label>{t('filter.date_from')}</label>
              <DateInput ariaLabel={t('filter.date_from')} value={from} onChange={setFrom} />
            </div>
            <div className="rcx-filter-field">
              <label>{t('filter.date_to')}</label>
              <DateInput ariaLabel={t('filter.date_to')} value={to} onChange={setTo} />
            </div>
          </>
        )}
        {f.includes('customer') && customers.length > 0 && (
          <div className="rcx-filter-field">
            <label>{t('filter.customer')}</label>
            <select aria-label={t('filter.customer')} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {f.includes('employee') && employees.length > 0 && (
          <div className="rcx-filter-field">
            <label>{t('filter.employee')}</label>
            <select aria-label={t('filter.employee')} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>
        )}
        {f.includes('direction') && (
          <div className="rcx-filter-field">
            <label>{t('filter.direction')}</label>
            <select aria-label={t('filter.direction')} value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              <option value="SALES">{t('opt.direction.sales')}</option>
              <option value="PURCHASE">{t('opt.direction.purchase')}</option>
            </select>
          </div>
        )}
        {f.includes('status') && currentType.statuses && (
          <div className="rcx-filter-field">
            <label>{t(currentType.statusLabel ?? 'filter.status')}</label>
            <select aria-label={t(currentType.statusLabel ?? 'filter.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {currentType.statuses.map(([val, lbl]) => <option key={val} value={val}>{t(lbl)}</option>)}
            </select>
          </div>
        )}
        {f.includes('billingMonth') && (
          <div className="rcx-filter-field">
            <label>شهر الحساب</label>
            <select aria-label="شهر الحساب" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)}>
              <option value="">الكل</option>
              {ARABIC_MONTHS.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
            </select>
          </div>
        )}
        {f.includes('billingYear') && (
          <div className="rcx-filter-field">
            <label>السنة</label>
            <select aria-label="السنة" value={billingYear} onChange={(e) => setBillingYear(e.target.value)}>
              <option value="">الكل</option>
              {[new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        )}
        {f.includes('company') && (
          <div className="rcx-filter-field">
            <label>الشركة / المسؤول</label>
            <select aria-label="الشركة / المسؤول" value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">الكل</option>
              {COMPANY_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
        )}
        {f.includes('workType') && (
          <div className="rcx-filter-field">
            <label>نوع العمل</label>
            <select aria-label="نوع العمل" value={workType} onChange={(e) => setWorkType(e.target.value)}>
              <option value="">الكل</option>
              {CONTRACT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
      </div>
    );
  }

  function openReport(key: string) {
    selectReport(key);
    setPanelOpen(true);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="xpl-scope xpl-page" dir="rtl">

      {/* ── Report Preview / Config Drawer ── */}
      {panelOpen && (
        <Drawer
          title={t(currentType.label)}
          onClose={() => setPanelOpen(false)}
          hero={
            <div className="xpl-drawer-hero">
              <div className="xpl-drawer-hero-icon" style={{ fontSize: 24 }}>{currentType.icon}</div>
              <div className="xpl-drawer-hero-body">
                <span className="xpl-drawer-hero-title">{t(currentType.label)}</span>
                <span className="xpl-drawer-hero-sub">{currentType.groupAr}</span>
                <div style={{ marginTop: 4 }}>
                  <StatusChip tone={curStatus.tone} icon={curStatus.icon}>{curStatus.label}</StatusChip>
                </div>
              </div>
            </div>
          }
          footer={
            <>
              {canView && (
                <Button variant="primary" icon="play_arrow" busy={loading} onClick={loadPreview}>
                  تشغيل التقرير
                </Button>
              )}
              {hasAnyFilter && (
                <Button variant="ghost" icon="restart_alt" onClick={resetFilters}>مسح الفلاتر</Button>
              )}
            </>
          }
        >
          {currentType.descAr && (
            <DrawerSection title="وصف التقرير">
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--xpl-text)' }}>{currentType.descAr}</p>
            </DrawerSection>
          )}

          <DrawerSection title="معلومات التقرير">
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">الفئة</span>
              <span className="xpl-drawer-field-value">{currentType.groupAr}</span>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">الحالة</span>
              <span className="xpl-drawer-field-value">
                <StatusChip tone={curStatus.tone} icon={curStatus.icon}>{curStatus.label}</StatusChip>
              </span>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">عدد النتائج</span>
              <span className="xpl-drawer-field-value">
                {preview ? `${preview.rows.length} سجل` : '— شغّل التقرير لعرض النتائج'}
              </span>
            </div>
            {generatedAt && preview && (
              <div className="xpl-drawer-field">
                <span className="xpl-drawer-field-label">آخر تشغيل</span>
                <span className="xpl-drawer-field-value">{generatedAt.toLocaleTimeString('ar')}</span>
              </div>
            )}
          </DrawerSection>

          {f.length > 0 && (
            <DrawerSection title="الفلاتر المطلوبة">
              {renderFilterFields()}
            </DrawerSection>
          )}

          {canExport && (
            <DrawerSection title="التصدير والطباعة">
              {preview ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button variant="secondary" icon="table_view" busy={excelBusy} onClick={downloadExcel} block>تصدير Excel</Button>
                  {window.manar?.exportPdfFromHtml && (
                    <Button variant="secondary" icon="picture_as_pdf" busy={pdfBusy} onClick={downloadPdf} block>تصدير PDF</Button>
                  )}
                  <Button variant="ghost" icon="print" onClick={openPrint} block>طباعة</Button>
                </div>
              ) : (
                <p className="rcx-note" style={{ margin: 0 }}>
                  <span className="material-symbols-outlined">info</span>
                  شغّل التقرير أولاً لتفعيل خيارات التصدير والطباعة.
                </p>
              )}
            </DrawerSection>
          )}

          <DrawerSection title="ملاحظات">
            <p className="rcx-note" style={{ margin: 0 }}>
              <span className="material-symbols-outlined">lightbulb</span>
              {currentType.statusType === 'needs-filter'
                ? 'هذا التقرير يحتاج تحديد فترة أو فلاتر للحصول على نتائج دقيقة.'
                : currentType.statusType === 'live'
                  ? 'تقرير مباشر يُحسب لحظياً من البيانات الحالية في النظام.'
                  : 'تقرير جاهز للتشغيل مباشرة دون الحاجة لفلاتر إلزامية.'}
            </p>
          </DrawerSection>
        </Drawer>
      )}

      {/* ── Executive Header ── */}
      <ExecutiveHeader
        icon="assessment"
        title="مركز التقارير"
        subtitle="استعرض وصدّر تقارير الأعمال والمالية والموارد البشرية والعمليات"
        chips={
          <>
            <IdChip icon="summarize" tone="indigo">{kpi.total} تقرير</IdChip>
            <IdChip icon="check_circle" tone="green">{kpi.ready} جاهز</IdChip>
            <IdChip icon="tune" tone="orange">{kpi.needsFilter} يحتاج فلاتر</IdChip>
            <IdChip icon="bolt" tone="indigo">{kpi.live} مباشر</IdChip>
            {favorites.length > 0 && <IdChip icon="star" tone="orange">{favorites.length} مفضل</IdChip>}
          </>
        }
        aside={<PeriodControl />}
      />

      {/* تنبيه قائمة الدخل عند كل الفترات: يجب ألا تعمل P&L على all-time بصمت. */}
      {selected === 'profit-loss' && (!from || !to) && (
        <div className="alert" role="note" style={{
          display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0',
          padding: '10px 14px', borderRadius: 12,
          background: 'var(--amber-light)', color: 'var(--amber)', fontWeight: 600, fontSize: 13,
        }}>
          <span className="material-symbols-outlined" aria-hidden>warning</span>
          قائمة الدخل ستشمل كل السنوات — اختر فترة محددة من محدّد الفترة للحصول على نتيجة دقيقة.
        </div>
      )}

      {/* ── Summary hero + report statistics ── */}
      <div className="rcx-metrics">
        <HeroMetric
          icon="analytics"
          label="إجمالي التقارير المتاحة"
          value={kpi.total}
          sub={<><span className="material-symbols-outlined">category</span>{`${CHIP_GROUPS.length - 2} فئات رئيسية`}</>}
        />
        <div className="rcx-metrics-secondary">
          <MetricCard icon="payments" tone="green" label="التقارير المالية" value={kpi.financial} />
          <MetricCard icon="groups" tone="blue" label="الموارد البشرية" value={kpi.hr} />
          <MetricCard icon="construction" tone="orange" label="العمليات" value={kpi.ops} />
          <MetricCard icon="request_quote" tone="indigo" label="المستحقات" value={kpi.recv} />
          <MetricCard icon="check_circle" tone="green" label="جاهز للتشغيل" value={kpi.ready} />
          <MetricCard icon="star" tone="orange" label="المفضلة" value={favorites.length} />
        </div>
      </div>

      {/* ── Sticky toolbar: search + recent + filter chips ── */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={setSearch} placeholder="البحث في التقارير..." ariaLabel="البحث في التقارير" />
          {recentReports.length > 0 && (
            <div className="rcx-recent">
              <span className="rcx-recent-label"><span className="material-symbols-outlined">history</span>الأخيرة:</span>
              {recentReports.map((r) => (
                <button type="button" key={r.key} className="rcx-recent-btn" onClick={() => selectReport(r.key)}>
                  <span>{r.icon}</span>{t(r.label)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="xpl-toolbar-row">
          {CHIP_GROUPS.map((chip) => (
            <FilterChip
              key={chip.key}
              active={activeChip === chip.key}
              onClick={() => setActiveChip(chip.key)}
              icon={chip.key === 'favorites' ? 'star' : undefined}
              count={chipCounts[chip.key]}
            >
              {chip.label}
            </FilterChip>
          ))}
        </div>
        <div className="xpl-active-row">
          <span className="xpl-result-count">
            يعرض <strong style={{ color: 'var(--xpl-text)' }}>{filteredReports.length}</strong> تقرير
            {search && <> · نتائج "{search}"</>}
          </span>
        </div>
      </div>

      {/* ── Report cards grid ── */}
      {filteredReports.length === 0 ? (
        <EmptyState
          icon="search_off"
          tone="neutral"
          title="لا توجد تقارير مطابقة"
          message="جرّب تعديل كلمة البحث أو اختيار فئة مختلفة من الأعلى."
          action={<Button variant="secondary" icon="restart_alt" onClick={() => { setSearch(''); setActiveChip('all'); }}>إعادة التعيين</Button>}
        />
      ) : (
        <div className="rcx-card-grid">
          {filteredReports.map((rt) => {
            const meta  = statusMeta(rt.statusType);
            const isFav = favorites.includes(rt.key);
            const isSel = selected === rt.key;
            return (
              <div
                key={rt.key}
                className={`rcx-card${isSel ? ' selected' : ''}`}
                onClick={() => openReport(rt.key)}
              >
                <div className="rcx-card-top">
                  <div className="rcx-card-emoji">{rt.icon}</div>
                  <button
                    type="button"
                    className={`rcx-fav-btn${isFav ? ' active' : ''}`}
                    title={isFav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                    aria-label={isFav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                    aria-pressed={isFav ? 'true' : 'false'}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(rt.key); }}
                  >
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: isFav ? "'FILL' 1" : undefined }}>star</span>
                  </button>
                </div>
                <div className="rcx-card-body">
                  <div className="rcx-card-name">{t(rt.label)}</div>
                  {rt.descAr && <div className="rcx-card-desc">{rt.descAr}</div>}
                </div>
                <div className="rcx-card-meta">
                  <StatusChip tone={meta.tone} icon={meta.icon}>{meta.label}</StatusChip>
                  <StatusChip tone="neutral">{rt.groupAr}</StatusChip>
                </div>
                <div className="rcx-card-actions">
                  {canView && (
                    <Button
                      variant="primary"
                      icon="play_arrow"
                      small
                      onClick={(e) => { e.stopPropagation(); selectReport(rt.key); setTimeout(loadPreview, 0); }}
                    >
                      تشغيل
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    icon="tune"
                    small
                    onClick={(e) => { e.stopPropagation(); openReport(rt.key); }}
                  >
                    تهيئة
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Selected report run / preview section ── */}
      <SectionCard
        title={t(currentType.label)}
        icon="play_circle"
        padded={false}
        actions={
          <>
            <Button variant="secondary" icon="tune" small onClick={() => setPanelOpen(true)}>الفلاتر</Button>
            {canView && (
              <Button variant="primary" icon="play_arrow" small busy={loading} onClick={loadPreview}>
                {t('page.reports.view')}
              </Button>
            )}
            {hasAnyFilter && (
              <Button variant="ghost" icon="restart_alt" small onClick={resetFilters}>{t('action.reset_filters')}</Button>
            )}
            {canExport && preview && (
              <div className="rcx-export-wrap" ref={exportRef}>
                <Button variant="secondary" icon="ios_share" small onClick={() => setExportOpen((o) => !o)} disabled={excelBusy || pdfBusy}>
                  تصدير
                  <span className="material-symbols-outlined" aria-hidden="true">expand_more</span>
                </Button>
                {exportOpen && (
                  <div className="rcx-export-menu rcx-export-menu--down">
                    <button type="button" className="rcx-export-item" onClick={downloadExcel} disabled={excelBusy}>
                      <span className="material-symbols-outlined">table_view</span>{excelBusy ? 'جاري...' : 'تصدير Excel'}
                    </button>
                    {window.manar?.exportPdfFromHtml && (
                      <button type="button" className="rcx-export-item" onClick={downloadPdf} disabled={pdfBusy}>
                        <span className="material-symbols-outlined">picture_as_pdf</span>{pdfBusy ? 'جاري...' : 'تصدير PDF'}
                      </button>
                    )}
                    <button type="button" className="rcx-export-item" onClick={openPrint}>
                      <span className="material-symbols-outlined">print</span>طباعة
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        }
      >
        <div className="xpl-card--pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {currentType.descAr && <p style={{ margin: 0, fontSize: 13, color: 'var(--xpl-muted)', lineHeight: 1.6 }}>{currentType.descAr}</p>}

          {/* Hints */}
          {['invoices', 'expenses', 'payroll'].includes(selected) && !from && !to && (
            <div className="rcx-hint"><span className="material-symbols-outlined">info</span>{t('page.reports.date_range_hint')}</div>
          )}
          {selected === 'customer-statement' && !customerId && (
            <div className="rcx-hint warn"><span className="material-symbols-outlined">warning</span>يجب اختيار عميل لعرض كشف الحساب</div>
          )}
          {error && <div className="xpl-error-banner"><span className="material-symbols-outlined">error</span><span>{error}</span></div>}

          {/* Loading skeleton */}
          {loading && (
            <div className="xpl-skeleton">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="xpl-skeleton-row" key={i}>
                  <div className="xpl-skeleton-cell xpl-sk-lg" />
                  <div className="xpl-skeleton-cell xpl-sk-md" />
                  <div className="xpl-skeleton-cell xpl-sk-sm" />
                </div>
              ))}
            </div>
          )}

          {/* Results bar */}
          {!loading && preview && (
            <div className="rcx-results-bar">
              <span><strong>{preview.rows.length}</strong> {t('page.reports.results_count')}</span>
              {generatedAt && <span>آخر تحديث: {generatedAt.toLocaleTimeString('ar')}</span>}
            </div>
          )}

          {/* Empty state */}
          {!loading && !preview && !error && (
            <EmptyState
              icon="bar_chart"
              title={t(currentType.label)}
              message={t('page.reports.empty')}
              action={canView ? <Button variant="primary" icon="play_arrow" onClick={loadPreview}>{t('page.reports.view')}</Button> : undefined}
            />
          )}

          {/* Preview table */}
          {!loading && preview && (
            <div>
              {preview.subtitle && <div className="rcx-preview-subtitle">{preview.subtitle}</div>}
              <div className="xpl-table-wrap rcx-table-scroll">
                <table className="xpl-table">
                  <thead>
                    <tr>{preview.columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.rows.length === 0 ? (
                      <tr><td colSpan={preview.columns.length} style={{ textAlign: 'center', color: 'var(--xpl-muted)', padding: 28 }}>{t('page.reports.no_data')}</td></tr>
                    ) : (
                      preview.rows.map((row, i) => (
                        <tr key={i}>{preview.columns.map((c) => <td key={c.key}>{formatReportCell(row[c.key], c, { language: currentCurrencyLanguage() })}</td>)}</tr>
                      ))
                    )}
                    {preview.totalsRow && (
                      <tr className="rcx-totals-row">
                        {preview.columns.map((c) => <td key={c.key}>{formatReportCell(preview.totalsRow[c.key], c, { language: currentCurrencyLanguage() })}</td>)}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

    </div>
  );
}
