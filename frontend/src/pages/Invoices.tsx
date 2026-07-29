import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useHighlight } from '../hooks/useHighlight';
import { ReturnToReportButton } from '../components/financial/ReturnToReportButton';
import { useAuth } from '../stores/authStore';
import { useFinancialPeriod } from '../context/FinancialPeriodContext';
import PeriodControl from '../components/period/PeriodControl';
import { periodToReportParams, buildLocalizedPeriodLabel } from '../lib/financialPeriod';
import { useT } from '../lib/i18n';
import { useUI } from '../stores/uiStore';
import { resolveName } from '../lib/resolveName';
import { useToast } from '../stores/toastStore';
import { PageMeta } from '../components/DataTable';
import ForceDeleteInvoiceModal from '../components/ForceDeleteInvoiceModal';
import InvoiceFastEntryDialog from '../components/InvoiceFastEntryDialog';
import ConfirmModal from '../components/ConfirmModal';
import { money, moneyParts, dateText, MoneyText, MoneyCell } from '../config/modules';
import { KpiStat, KpiStatGrid } from '../components/KpiStat';
import { usePersistedState } from '../hooks/usePersistedState';
import { useTableSort } from '../hooks/useTableSort';
import SortableHeader from '../components/SortableHeader';
import { canEditInvoice, collectionDateAction } from '../utils/invoiceGovernance';
import ExportExcelButton from '../components/ExportExcelButton';
import { fetchAllRows, downloadTableExcel } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { ARABIC_MONTHS, billingYearOptions } from '../utils/dateUtils';
import CreateInvoice from './CreateInvoice';
import EditInvoice from './EditInvoice';
import AddPayment from './AddPayment';
import MonthlyReportModal from './MonthlyReportModal';
import CorrectCollectionDate from './CorrectCollectionDate';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  StatusChip,
  SearchBox,
  FilterChip,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Pagination,
  Drawer,
  DrawerSection,
  DrawerField,
  DrawerHeaderCard,
  DrawerQuickActions,
  DrawerRelated,
  DrawerActivity,
  Button,
  type DrawerKpi,
  type QuickAction,
  type RelatedItem,
  type ActivityItem,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Invoices.css';
import { fcMoneyHeader } from '../components/financial/financialLabels';

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';
const STATUS_META: Record<string, { key: string; tone: Tone; icon: string }> = {
  UNPAID: { key: 'inv.status.unpaid', tone: 'red', icon: 'pending' },
  PARTIAL: { key: 'inv.status.partial', tone: 'orange', icon: 'incomplete_circle' },
  PAID: { key: 'inv.status.paid', tone: 'green', icon: 'check_circle' },
  OVERDUE: { key: 'inv.status.overdue', tone: 'red', icon: 'event_busy' },
  CANCELLED: { key: 'inv.status.cancelled', tone: 'neutral', icon: 'block' },
};
function invStatusChip(status: string, t: (k: string) => string) {
  const m = STATUS_META[status] ?? { key: status, tone: 'neutral' as Tone, icon: 'help' };
  return <StatusChip tone={m.tone} icon={m.icon}>{t(m.key)}</StatusChip>;
}
/** نص الحالة العادي (بلا شارة) — نفس مصدر invStatusChip (STATUS_META)، لتصدير Excel. */
function invStatusLabel(status: string, t: (k: string) => string): string {
  const m = STATUS_META[status] ?? { key: status };
  return t(m.key);
}
function directionLabel(d: string, t: (k: string) => string): string {
  if (d === 'SALES') return t('opt.direction.sales');
  if (d === 'PURCHASE') return t('opt.direction.purchase');
  return d || '—';
}

/** المتبقي: قيمة محسوبة (الإجمالي − المسدّد)، مصدر واحد يستعمله العرض والتصدير معًا. */
function remainingOf(r: { total?: number; paidAmount?: number }): number {
  return Math.max(0, Number(r.total ?? 0) - Number(r.paidAmount ?? 0));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface InvoiceColumn {
  /** مفتاح العمود — نفسه حقل الفرز الخادمي حين sortable=true (يطابق اتفاقية DataTable.tsx). */
  key: string;
  /** نص الترويسة المعروض فعليًا (مُحلّل سلفًا؛ قد يحمل رمز العملة عبر fcMoneyHeader). */
  header: string;
  /** نص title= الخام (بلا رمز عملة) — يطابق سلوك SortableHeader الحالي حرفيًا. */
  plainLabel: string;
  sortable?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: (r: any) => ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exportValue: (r: any) => string | number | null | undefined;
  /** خليّة Excel رقمية خام + numFmt الدينار — لا صلة بتنسيق الترويسة المرئية (انظر «المتبقي» أدناه). */
  money?: boolean;
}

/**
 * حزمة Table/Excel Column Unification v1 — **المصدر الوحيد** لأعمدة جدول الفواتير:
 * الجدول المرئي (`<thead>`/`<tbody>` أدناه، عبر `.map()`) وتصدير Excel (`exportExcel`)
 * كلاهما يُبنى من هذه المصفوفة نفسها. إضافة عمود أو حذفه أو إعادة ترتيبه هنا ينعكس
 * تلقائيًا على الاثنين معًا — لا تعريف مزدوج، ولا احتمال انحراف مستقبلي بينهما.
 */
function buildInvoiceColumns(
  t: (k: string, vars?: Record<string, string | number>) => string,
  lang: 'ar' | 'en',
): InvoiceColumn[] {
  return [
    {
      key: 'invoiceNumber',
      header: t('col.inv.number'),
      plainLabel: t('col.inv.number'),
      sortable: true,
      render: (r) => {
        const tone = (STATUS_META[String(r.status)] ?? { tone: 'neutral' as Tone }).tone;
        return <span className={`invcx-mono invcx-num--${tone}`}><strong>{r.invoiceNumber ?? r.number}</strong></span>;
      },
      exportValue: (r) => r.invoiceNumber ?? r.number ?? '',
    },
    // الجهة: علاقة مركّبة (عميل أو مورّد) بلا حقل خادمي واحد — غير قابلة للفرز.
    {
      key: 'party',
      header: t('col.inv.party'),
      plainLabel: t('col.inv.party'),
      render: (r) => <strong>{r.customer ? resolveName(r.customer, lang) : r.supplier ? resolveName(r.supplier, lang) : '—'}</strong>,
      exportValue: (r) => (r.customer ? resolveName(r.customer, lang) : r.supplier ? resolveName(r.supplier, lang) : '—'),
    },
    {
      key: 'invoiceType',
      header: t('col.inv.type'),
      plainLabel: t('col.inv.type'),
      sortable: true,
      render: (r) => r.invoiceType ?? '—',
      exportValue: (r) => r.invoiceType ?? '—',
    },
    {
      key: 'direction',
      header: t('col.inv.direction'),
      plainLabel: t('col.inv.direction'),
      sortable: true,
      render: (r) => directionLabel(r.direction ?? '', t),
      exportValue: (r) => directionLabel(r.direction ?? '', t),
    },
    {
      key: 'issueDate',
      header: t('col.date'),
      plainLabel: t('col.date'),
      sortable: true,
      render: (r) => <span style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.issueDate)}</span>,
      exportValue: (r) => dateText(r.issueDate),
    },
    {
      key: 'total',
      header: fcMoneyHeader(t('col.inv.total')),
      plainLabel: t('col.inv.total'),
      sortable: true,
      money: true,
      render: (r) => <span className="invcx-amount"><MoneyCell value={r.total} /></span>,
      exportValue: (r) => Number(r.total ?? 0),
    },
    {
      key: 'paidAmount',
      header: fcMoneyHeader(t('col.inv.paid')),
      plainLabel: t('col.inv.paid'),
      sortable: true,
      money: true,
      render: (r) => <span className="invcx-paid"><MoneyCell value={r.paidAmount} /></span>,
      exportValue: (r) => Number(r.paidAmount ?? 0),
    },
    // المتبقي: قيمة محسوبة بلا حقل خادمي — غير قابلة للفرز. الترويسة المرئية هنا
    // بلا رمز عملة (fcMoneyHeader) عمدًا — يطابق سلوك الجدول الحالي حرفيًا؛ money:true
    // يبقى مضبوطًا فقط لتنسيق خليّة Excel (رقم خام + numFmt)، لا لتنسيق الترويسة.
    {
      key: 'remaining',
      header: t('lbl.inv.remaining_amount'),
      plainLabel: t('lbl.inv.remaining_amount'),
      money: true,
      render: (r) => {
        const v = remainingOf(r);
        return <span className={v > 0 ? 'invcx-remaining' : 'invcx-remaining--zero'}><MoneyCell value={v} /></span>;
      },
      exportValue: (r) => remainingOf(r),
    },
    {
      key: 'status',
      header: t('col.status'),
      plainLabel: t('col.status'),
      sortable: true,
      render: (r) => invStatusChip(String(r.status), t),
      exportValue: (r) => invStatusLabel(String(r.status), t),
    },
  ];
}

/**
 * مبلغ مصغّر لبطاقات ملخّص Drawer الفاتورة: الرقم ورمز العملة في عنصرين منفصلين
 * (كما في `KpiStat`) بدل نصّ واحد، كي يصغّر حجم «KWD» عن الرقم دون أن ينزل سطرًا
 * جديدًا. عرضٌ محلي لهذا الـ Drawer فقط — لا يمسّ `MoneyText` المشتركة.
 */
function DrawerKpiMoney({ value }: { value: unknown }) {
  const { number, currency } = moneyParts(value);
  return (
    <span className="invcx-kpi-amt">
      <span className="invcx-kpi-amt-num">{number}</span>
      <span className="invcx-kpi-amt-cur">{currency}</span>
    </span>
  );
}

interface InvStats { count: number; totalSales: number; totalCollected: number; totalRemaining: number; average: number; }

export default function Invoices() {
  const { hasPermission, isSystemAdmin: getIsSystemAdmin } = useAuth();
  const isSystemAdmin = getIsSystemAdmin();
  const { t } = useT();
  const lang = useUI((s) => s.lang);
  const navigate = useNavigate();
  const { period } = useFinancialPeriod();
  const toast = useToast();
  useHighlight();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = usePersistedState('inv:page', 1);
  const [search, setSearch] = usePersistedState('inv:search', '');
  const [statusFilter, setStatusFilter] = usePersistedState('inv:status', '');
  const [directionFilter, setDirectionFilter] = usePersistedState('inv:direction', '');
  const [customerFilter, setCustomerFilter] = usePersistedState('inv:customer', '');
  const [monthFilter, setMonthFilter] = usePersistedState('inv:month', '');
  const [yearFilter, setYearFilter] = usePersistedState('inv:year', '');
  // فرز خادمي موحّد (Enterprise Data Grid Foundation) — تغيير الفرز استعلام جديد فيعود للصفحة الأولى.
  const sort = useTableSort('invoices', () => setPage(1));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [customers, setCustomers] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [fastEntry, setFastEntry] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [paying, setPaying] = useState<any | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  const [forceDeleteId, setForceDeleteId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState<InvStats | null>(null);
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewing, setViewing] = useState<any | null>(null);
  // تصحيح تاريخ التحصيل الرسمي لدفعة تاريخية — مدير النظام فقط.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [correcting, setCorrecting] = useState<any | null>(null);

  const isFiltered = !!(search || statusFilter || directionFilter || customerFilter || monthFilter || yearFilter);

  function resetFilters() {
    setSearch('');
    setStatusFilter('');
    setDirectionFilter('');
    setCustomerFilter('');
    setMonthFilter('');
    setYearFilter('');
    sort.reset();
    setPage(1);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    // الفترة العالمية على تاريخ الإصدار (from/to)؛ القائمة والإحصاء يتشاركانها.
    const periodRange = periodToReportParams(period);
    const filterParams = {
      search: search || undefined,
      status: statusFilter || undefined,
      direction: directionFilter || undefined,
      customerId: customerFilter || undefined,
      billingMonth: monthFilter || undefined,
      billingYear: yearFilter || undefined,
      from: periodRange.from,
      to: periodRange.to,
    };
    try {
      const res = await api.get('/invoices', { params: { page, pageSize: 15, ...filterParams, ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}) } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
    api.get('/invoices/stats', { params: filterParams })
      .then((r) => setStats(r.data.data ?? null))
      .catch(() => { /* stats are non-critical */ });
  }, [page, search, statusFilter, directionFilter, customerFilter, monthFilter, yearFilter, period.fromDate, period.toDate, period.isAllPeriods, sort.sortBy, sort.sortDir]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/customers', { params: { pageSize: 300 } })
      .then((r) => setCustomers(r.data?.data?.data ?? []))
      .catch(() => {});
  }, []);

  // Enrich the opened drawer row with full detail (line items + payment records) — the
  // list endpoint returns neither, and the payments are required for the per-payment
  // collection-date correction action on paid invoices. Fetched once per open (guarded
  // by the payments array already being present). Read-only enrichment; mutates nothing.
  useEffect(() => {
    const id = viewing?.id;
    if (id == null || Array.isArray(viewing?.payments)) return;
    let cancelled = false;
    api.get(`/invoices/${id}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res: any) => {
        const full = res?.data?.data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!cancelled && full) setViewing((cur: any) => (cur && cur.id === full.id ? { ...cur, ...full } : cur));
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing?.id]);

  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelCandidate, setCancelCandidate] = useState<number | null>(null);

  function cancel(id: number) { setCancelCandidate(id); }

  async function executeCancel(id: number) {
    setCancelCandidate(null);
    if (cancelBusy) return;
    setCancelBusy(true);
    try { await api.patch(`/invoices/${id}/cancel`); toast.ok(t('toast.inv.cancelled')); load(); } catch (e) { setLoadError(errorMessage(e)); } finally { setCancelBusy(false); }
  }

  // المصدر الوحيد لأعمدة الجدول — يُستهلَك أدناه (JSX الجدول) وفي exportExcel معًا.
  const invoiceColumns = buildInvoiceColumns(t, lang);

  /**
   * حزمة Table/Excel Column Unification v1 — مصدر واحد للأعمدة (invoiceColumns،
   * أعلاه) يُستهلَك هنا وفي الجدول المرئي أدناه معًا. بلا مرور عبر وحدة التقارير
   * المشتركة (`/reports/*`) التي يستخدمها أيضًا نوع تقرير «الفواتير» في شاشة
   * التقارير — فلا يتأثر ذلك التقرير بهذا التغيير. يجلب كل الفواتير المطابقة
   * للفلاتر الحالية عبر كل الصفحات (لا تصدير الصفحة الحالية فقط)، بنفس فلاتر
   * الشاشة تمامًا.
   */
  async function exportExcel() {
    setExportingExcel(true);
    try {
      const allRows = await fetchAllRows('/invoices', {
        search: search || undefined,
        status: statusFilter || undefined,
        direction: directionFilter || undefined,
        customerId: customerFilter || undefined,
        billingMonth: monthFilter || undefined,
        billingYear: yearFilter || undefined,
        ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}),
      });
      downloadTableExcel(
        allRows,
        invoiceColumns.map((c) => ({ header: c.header, value: c.exportValue, money: c.money })),
        generateExportFileName({ reportName: ReportName.InvoicesList, extension: 'xlsx' }),
      );
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setExportingExcel(false);
    }
  }

  // Row-action eligibility (mirrors the prior table actions exactly — UI gating only).
  // Edit eligibility is the shared governance predicate (paid/cancelled → read-only),
  // matching the server guard in invoices.service.update().
  const canEditRow = (r: { status?: string; paidAmount?: number }) =>
    hasPermission('invoices.update') && canEditInvoice(r.status, r.paidAmount);
  const canCollectRow = (r: { status?: string }) =>
    hasPermission('invoices.update') && r.status !== 'PAID' && r.status !== 'CANCELLED';
  const canCancelRow = (r: { status?: string; paidAmount?: number }) =>
    hasPermission('invoices.update') && r.status !== 'CANCELLED' && Number(r.paidAmount) === 0;

  return (
    <div className="xpl-scope xpl-page">
      <ReturnToReportButton />
      <ExecutiveHeader
        icon="receipt_long"
        title={t('page.invoices.title')}
        subtitle={t('page.invoices.subtitle')}
        chips={stats ? (
          <>
            <IdChip icon="receipt_long" tone="indigo">{stats.count} {t('inv.stats.count')}</IdChip>
            <IdChip icon="payments" tone="green"><MoneyText value={stats.totalCollected} /></IdChip>
            {stats.totalRemaining > 0 && <IdChip icon="pending_actions" tone="orange"><MoneyText value={stats.totalRemaining} /></IdChip>}
          </>
        ) : undefined}
        aside={(
          <>
            <PeriodControl hideLabelPrefix />
            {hasPermission('invoices.create') && <Button variant="secondary" icon="bolt" onClick={() => setFastEntry(true)}>{t('btn.inv.fast_entry')}</Button>}
            {hasPermission('invoices.create') && <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('page.invoices.create')}</Button>}
          </>
        )}
      />

      {loadError && (
        <ErrorBanner>
          {loadError}{' '}
          <button type="button" className="xpl-clear-link" onClick={load} disabled={loading}>{t('action.refresh')}</button>
        </ErrorBanner>
      )}

      {stats && (
        <div className="invcx-metrics">
          <HeroMetric
            icon="account_balance_wallet"
            label={t('inv.stats.total_sales')}
            value={<MoneyText value={stats.totalSales} />}
            sub={<><span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>{`${stats.count} ${t('inv.stats.count')}`}</>}
          />
          <KpiStatGrid>
            <KpiStat icon="description" tone="blue" label={t('inv.stats.count')} value={stats.count.toLocaleString()} />
            <KpiStat icon="task_alt" tone="green" label={t('inv.stats.collected')} value={moneyParts(stats.totalCollected).number} unit={moneyParts(stats.totalCollected).currency} />
            <KpiStat icon="pending_actions" tone="red" label={t('inv.stats.remaining')} value={moneyParts(stats.totalRemaining).number} unit={moneyParts(stats.totalRemaining).currency} />
            <KpiStat icon="functions" tone="indigo" label={t('inv.stats.average')} value={moneyParts(stats.average).number} unit={moneyParts(stats.average).currency} />
          </KpiStatGrid>
        </div>
      )}

      {customerFilter && stats && (() => {
        const customer = customers.find((c) => String(c.id) === customerFilter);
        return customer ? (
          <div className="invcx-customer-strip">
            <span className="name"><span className="material-symbols-outlined" aria-hidden="true">badge</span>{resolveName(customer, lang)}</span>
            <span>{stats.count} {t('page.dashboard.invoice_unit')}</span>
            <span>{t('lbl.inv.total_label')} <strong><MoneyText value={stats.totalSales} /></strong></span>
            <span>{t('lbl.inv.collected_label')} <strong className="invcx-paid">{<MoneyText value={stats.totalCollected} />}</strong></span>
            <span>{t('lbl.inv.remaining_label')} <strong className={stats.totalRemaining > 0 ? 'invcx-remaining' : 'invcx-remaining--zero'}>{<MoneyText value={stats.totalRemaining} />}</strong></span>
          </div>
        ) : null;
      })()}

      {/* Sticky filters */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('page.invoices.search')} ariaLabel={t('page.invoices.search')} />
          <select className="xpl-select" value={customerFilter} onChange={(e) => { setCustomerFilter(e.target.value); setPage(1); }} aria-label={t('col.inv.party')}>
            <option value="">{t('opt.party_all')}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{resolveName(c, lang)}</option>)}
          </select>
          <select className="xpl-select" value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }} aria-label={t('lbl.inv.billing_period')}>
            <option value="">{t('opt.month_all')}</option>
            {ARABIC_MONTHS.map((name, idx) => <option key={idx + 1} value={idx + 1}>{name}</option>)}
          </select>
          <select className="xpl-select" value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1); }} aria-label={t('field.inv.billing_year_filter')}>
            <option value="">{t('opt.year_all')}</option>
            {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {isFiltered && <button type="button" className="xpl-clear-link" onClick={resetFilters}>{t('action.reset_filters')}</button>}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{(meta?.total ?? rows.length)} {t('page.dashboard.invoice_unit')}</span>
        </div>
        <div className="xpl-toolbar-row">
          <FilterChip active={!statusFilter} onClick={() => { setStatusFilter(''); setPage(1); }}>{t('opt.all')}</FilterChip>
          <FilterChip active={statusFilter === 'UNPAID'} onClick={() => { setStatusFilter('UNPAID'); setPage(1); }}>{t('inv.status.unpaid')}</FilterChip>
          <FilterChip active={statusFilter === 'PARTIAL'} onClick={() => { setStatusFilter('PARTIAL'); setPage(1); }}>{t('inv.status.partial')}</FilterChip>
          <FilterChip active={statusFilter === 'PAID'} onClick={() => { setStatusFilter('PAID'); setPage(1); }}>{t('inv.status.paid')}</FilterChip>
          <FilterChip active={statusFilter === 'OVERDUE'} onClick={() => { setStatusFilter('OVERDUE'); setPage(1); }}>{t('inv.status.overdue')}</FilterChip>
          <FilterChip active={statusFilter === 'CANCELLED'} onClick={() => { setStatusFilter('CANCELLED'); setPage(1); }}>{t('inv.status.cancelled')}</FilterChip>
          <span className="invcx-chip-divider" aria-hidden="true" />
          <FilterChip active={!directionFilter} onClick={() => { setDirectionFilter(''); setPage(1); }}>{t('opt.all')}</FilterChip>
          <FilterChip active={directionFilter === 'SALES'} onClick={() => { setDirectionFilter('SALES'); setPage(1); }}>{t('opt.direction.sales')}</FilterChip>
          <FilterChip active={directionFilter === 'PURCHASE'} onClick={() => { setDirectionFilter('PURCHASE'); setPage(1); }}>{t('opt.direction.purchase')}</FilterChip>
          <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <Button variant="ghost" icon="refresh" small busy={loading} onClick={load}>{t('action.refresh')}</Button>
            {hasPermission('reports.export') && <ExportExcelButton onExport={exportExcel} busy={exportingExcel} />}
            <Button variant="ghost" icon="calendar_month" small onClick={() => setShowMonthlyReport(true)}>{t('inv.monthly_report')}</Button>
          </span>
        </div>
      </div>

      {/* Invoice table */}
      <section className="xpl-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={8} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            tone="neutral"
            title={t('empty.invoices')}
            message={
              !period.isAllPeriods
                ? t('msg.empty.invoices_in_period', { period: buildLocalizedPeriodLabel(period, t, true) })
                : isFiltered ? t('msg.empty.invoices_no_match') : undefined
            }
            action={isFiltered
              ? <Button variant="secondary" icon="restart_alt" onClick={resetFilters}>{t('action.reset_filters')}</Button>
              : hasPermission('invoices.create')
                ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('page.invoices.create')}</Button>
                : undefined}
          />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table">
                <thead>
                  <tr>
                    {invoiceColumns.map((c) => (
                      c.sortable ? (
                        <SortableHeader key={c.key} label={c.header} title={c.plainLabel} state={sort.getState(c.key)} onToggle={() => sort.toggle(c.key)} />
                      ) : (
                        <th key={c.key}>{c.header}</th>
                      )
                    ))}
                    <th aria-label={t('aria.open')} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="xpl-row--click" tabIndex={0} role="button"
                      aria-label={t('aria.invoice_details', { number: r.invoiceNumber ?? r.number })}
                      onClick={() => setViewing(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                      {invoiceColumns.map((c) => <td key={c.key}>{c.render(r)}</td>)}
                      <td style={{ width: 32, textAlign: 'center' }}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, color: 'var(--xpl-muted)' }}>chevron_left</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </section>

      {/* Invoice drawer (read-only detail) */}
      {viewing && (() => {
        const remaining = Math.max(0, Number(viewing.total) - Number(viewing.paidAmount ?? 0));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: any[] = Array.isArray(viewing.items) ? viewing.items : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payments: any[] = Array.isArray(viewing.payments) ? viewing.payments : [];
        const statusMeta = STATUS_META[String(viewing.status)] ?? { key: viewing.status, tone: 'neutral' as Tone, icon: 'help' };
        const ageDays = viewing.issueDate ? Math.floor((Date.now() - new Date(viewing.issueDate).getTime()) / 86_400_000) : null;

        const openCollect = () => { const row = viewing; setViewing(null); setPaying(row); };
        const openEdit = () => { const row = viewing; setViewing(null); setEditing(row); };
        const goPrint = () => navigate(`/invoices/${viewing.id}/preview?print=1`);
        const goPdf = () => navigate(`/invoices/${viewing.id}/preview`);
        const runCancel = () => { const id = viewing.id; setViewing(null); cancel(id); };
        const runDelete = () => { const id = viewing.id as number; setViewing(null); setForceDeleteId(id); };

        const canCollect = canCollectRow(viewing);
        const canEdit = canEditRow(viewing);
        const canCancel = canCancelRow(viewing);

        // Collection-date correction (safe workflow, NOT invoice edit): SYSTEM_ADMIN only,
        // per payment (needs a valid payment id). This is the paid-invoice date action —
        // it opens the correction dialog, never the invoice edit form.
        const correctAction = collectionDateAction(isSystemAdmin, payments);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const openCorrect = (p: any) => {
          const inv = viewing;
          setViewing(null);
          setCorrecting({ id: p.id, date: p.date, amount: p.amount, method: p.method, invoiceId: inv.id, invoiceNumber: inv.invoiceNumber ?? inv.number });
        };

        const kpis: DrawerKpi[] = [
          { label: t('lbl.age'), value: ageDays != null ? `${ageDays} ${t('unit.day')}` : '—' },
          { label: t('col.inv.paid'), value: <DrawerKpiMoney value={viewing.paidAmount} />, tone: 'green' },
          { label: t('lbl.inv.remaining_amount'), value: <DrawerKpiMoney value={remaining} />, tone: 'red' },
          { label: t('col.inv.total'), value: <DrawerKpiMoney value={viewing.total} /> },
        ];

        const quickActions: QuickAction[] = [];
        if (canCollect) quickActions.push({ key: 'collect', icon: 'payments', label: t('page.invoices.collect'), onClick: openCollect });
        if (hasPermission('invoices.read')) quickActions.push({ key: 'print', icon: 'print', label: t('btn.inv.print_invoice'), onClick: goPrint });
        if (hasPermission('invoices.read')) quickActions.push({ key: 'pdf', icon: 'picture_as_pdf', label: 'PDF', onClick: goPdf });
        if (canEdit) quickActions.push({ key: 'edit', icon: 'edit', label: t('action.edit'), tone: 'primary', onClick: openEdit });
        // Paid/collected invoice: dedicated safe action to change the official collection date.
        // Shown for the single-payment case (direct); multi-payment invoices use the per-payment
        // buttons in the payments list below (explicit selection — never guesses which payment).
        if (correctAction.singlePaymentId != null) {
          const single = payments.find((p) => Number(p.id) === correctAction.singlePaymentId);
          if (single) quickActions.push({ key: 'correct-date', icon: 'event_available', label: t('action.correct_collection_date'), onClick: () => openCorrect(single) });
        }
        if (canCancel) quickActions.push({ key: 'cancel', icon: 'block', label: t('page.invoices.cancel_inv'), onClick: runCancel });
        if (isSystemAdmin) quickActions.push({ key: 'delete', icon: 'delete_forever', label: t('action.force_delete'), tone: 'danger', onClick: runDelete });

        const relatedPayments: RelatedItem[] = payments.map((p, idx) => ({
          key: String(p.id ?? idx),
          icon: 'payments',
          primary: money(p.amount),
          secondary: `${dateText(p.date)}${p.method ? ' · ' + p.method : ''}`,
          // مدير النظام فقط: تعديل تاريخ التحصيل الرسمي لهذه الدفعة (يتطلب معرّف دفعة صالحًا).
          // يفتح مسار التصحيح الآمن — لا يفتح نموذج تعديل الفاتورة.
          trailing: isSystemAdmin && p.id != null ? (
            <button
              type="button"
              className="btn secondary invcx-pmt-correct"
              onClick={() => openCorrect(p)}
            >
              {t('action.correct_collection_date')}
            </button>
          ) : undefined,
        }));

        const activityItems: ActivityItem[] = [];
        if (viewing.issueDate) activityItems.push({ key: 'created', icon: 'receipt_long', tone: 'blue', title: t('activity.inv.created'), timestamp: dateText(viewing.issueDate) });
        payments.forEach((p, idx) => {
          activityItems.push({ key: `pmt-${p.id ?? idx}`, icon: 'payments', tone: 'green', title: t('activity.inv.payment', { amount: money(p.amount) }), timestamp: dateText(p.date) });
        });
        if (String(viewing.status) === 'CANCELLED') activityItems.push({ key: 'cancelled', icon: 'block', tone: 'neutral', title: t('activity.inv.cancelled') });

        return (
          <div className="invcx-detail-drawer">
            <Drawer
            title={`${t('col.inv.number')} ${viewing.invoiceNumber ?? viewing.number}`}
            onClose={() => setViewing(null)}
            hero={
              <>
                <DrawerHeaderCard
                  icon="receipt_long"
                  title={viewing.invoiceNumber ?? viewing.number}
                  subtitle={viewing.customer ? resolveName(viewing.customer, lang) : viewing.supplier ? resolveName(viewing.supplier, lang) : '—'}
                  status={{ tone: statusMeta.tone, icon: statusMeta.icon, label: t(statusMeta.key) }}
                  kpis={kpis}
                />
                <DrawerQuickActions actions={quickActions} />
              </>
            }
          >
            <DrawerSection title={t('drawer.inv.basic_info')}>
              <DrawerField label={t('col.inv.number')} value={viewing.invoiceNumber ?? viewing.number} mono />
              <DrawerField label={t('col.inv.party')} value={viewing.customer ? resolveName(viewing.customer, lang) : viewing.supplier ? resolveName(viewing.supplier, lang) : '—'} />
              <DrawerField label={t('col.date')} value={dateText(viewing.issueDate)} />
              <DrawerField label={t('col.inv.type')} value={viewing.invoiceType ?? '—'} />
              <DrawerField label={t('col.inv.direction')} value={directionLabel(viewing.direction ?? '', t)} />
              <DrawerField label={t('lbl.inv.billing_period')} value={viewing.billingMonth && viewing.billingYear ? `${ARABIC_MONTHS[Number(viewing.billingMonth) - 1]} ${viewing.billingYear}` : '—'} />
            </DrawerSection>

            <DrawerSection title={t('action.financial_summary')}>
              <div className="invcx-fin">
                {viewing.subtotal != null && <div className="invcx-fin-row"><span className="invcx-fin-label">{t('lbl.inv.subtotal')}</span><span className="invcx-fin-val">{<MoneyText value={viewing.subtotal} />}</span></div>}
                {Number(viewing.discount) > 0 && <div className="invcx-fin-row"><span className="invcx-fin-label">{t('lbl.inv.discount_plain')}</span><span className="invcx-fin-val">{<MoneyText value={viewing.discount} />}</span></div>}
                {Number(viewing.taxAmount) > 0 && <div className="invcx-fin-row"><span className="invcx-fin-label">{t('lbl.inv.tax')}</span><span className="invcx-fin-val">{<MoneyText value={viewing.taxAmount} />}</span></div>}
                <div className="invcx-fin-row total"><span className="invcx-fin-label">{t('col.inv.total')}</span><span className="invcx-fin-val">{<MoneyText value={viewing.total} />}</span></div>
                <div className="invcx-fin-row"><span className="invcx-fin-label">{t('col.inv.paid')}</span><span className="invcx-fin-val invcx-paid">{<MoneyText value={viewing.paidAmount} />}</span></div>
                <div className="invcx-fin-row"><span className="invcx-fin-label">{t('lbl.inv.remaining_amount')}</span><span className={`invcx-fin-val ${remaining > 0 ? 'invcx-remaining' : 'invcx-remaining--zero'}`}>{<MoneyText value={remaining} />}</span></div>
              </div>
            </DrawerSection>

            {items.length > 0 && (
              <DrawerSection title={t('lbl.inv.items_section')}>
                <table className="invcx-detail-table">
                  <thead>
                    <tr><th>{t('col.description')}</th><th>{t('ph.qty')}</th><th>{fcMoneyHeader(t('agreements.usage.col.price'))}</th><th>{fcMoneyHeader(t('col.inv.total'))}</th></tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={it.id ?? idx}>
                        <td>{it.description ?? it.workType ?? '—'}</td>
                        <td>{it.quantity ?? '—'}</td>
                        <td>{it.unitPrice != null ? <MoneyCell value={it.unitPrice} /> : '—'}</td>
                        <td><strong>{it.total != null ? <MoneyCell value={it.total} /> : (it.quantity != null && it.unitPrice != null ? <MoneyCell value={Number(it.quantity) * Number(it.unitPrice)} /> : '—')}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DrawerSection>
            )}

            {viewing.notes && (
              <DrawerSection title={t('field.notes')}>
                <DrawerField label={t('field.notes')} value={viewing.notes} />
              </DrawerSection>
            )}

            <DrawerRelated title={t('lbl.inv.payments_section')} items={relatedPayments} />
            <DrawerActivity items={activityItems} />

            <DrawerSection title={t('drawer.technical_info')}>
              <DrawerField label={t('lbl.internal_id')} value={`#${viewing.id}`} mono />
            </DrawerSection>
          </Drawer>
          </div>
        );
      })()}

      {fastEntry && <InvoiceFastEntryDialog onClose={() => setFastEntry(false)} onSaved={load} />}
      {creating && <CreateInvoice onClose={() => setCreating(false)} onSaved={() => { toast.ok(t('toast.inv.saved')); load(); }} />}
      {editing && <EditInvoice invoice={editing} onClose={() => setEditing(null)} onSaved={() => { toast.ok(t('toast.inv.saved')); load(); }} />}
      {paying && <AddPayment invoice={paying} onClose={() => setPaying(null)} onSaved={() => { toast.ok(t('toast.inv.payment_recorded')); load(); }} />}
      {correcting && <CorrectCollectionDate payment={correcting} onClose={() => setCorrecting(null)} onSaved={(msg) => { toast.ok(msg || t('toast.inv.collection_date_corrected')); load(); }} />}
      {showMonthlyReport && (
        <MonthlyReportModal
          filters={{
            direction: directionFilter || undefined,
            status: statusFilter || undefined,
            customerId: customerFilter || undefined,
            billingYear: yearFilter || undefined,
          }}
          onClose={() => setShowMonthlyReport(false)}
        />
      )}
      {forceDeleteId !== null && (
        <ForceDeleteInvoiceModal
          invoiceId={forceDeleteId}
          onClose={() => setForceDeleteId(null)}
          onDeleted={() => { setForceDeleteId(null); load(); }}
        />
      )}
      {cancelCandidate !== null && (
        <ConfirmModal
          title={t('dlg.cancel_invoice.title')}
          message={t('confirm.cancel_invoice')}
          confirmLabel={t('dlg.cancel_invoice.confirm_btn')}
          variant="danger"
          onConfirm={() => executeCancel(cancelCandidate)}
          onCancel={() => setCancelCandidate(null)}
        />
      )}
    </div>
  );
}
