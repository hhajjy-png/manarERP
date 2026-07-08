import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useHighlight } from '../hooks/useHighlight';
import { ReturnToReportButton } from '../components/financial/ReturnToReportButton';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import ForceDeleteInvoiceModal from '../components/ForceDeleteInvoiceModal';
import InvoiceFastEntryDialog from '../components/InvoiceFastEntryDialog';
import ConfirmModal from '../components/ConfirmModal';
import { money, dateText } from '../config/modules';
import { formatFileDate } from '../lib/date';
import { usePersistedState } from '../hooks/usePersistedState';
import { WORK_TYPES, DEFAULT_WORK_TYPE, composeDescription, parseDescription } from '../utils/invoiceDescription';
import { toInvoiceItemPayload } from '../utils/invoicePayload';
import {
  InvoiceLineItemsEditor,
  LocationAutocomplete,
  STANDARD_UNITS,
  UNIT_OTHER,
  unitSelectValue,
  isCustomUnit,
  type Item,
  type PriceOption,
} from '../components/invoices/InvoiceLineItemsEditor';
import ExportExcelButton from '../components/ExportExcelButton';
import { downloadXlsx } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { ARABIC_MONTHS, billingYearOptions } from '../utils/dateUtils';
import AttachmentsPanel from '../components/AttachmentsPanel';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
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
  DrawerActionBar,
  Button,
  type DrawerKpi,
  type QuickAction,
  type RelatedItem,
  type ActivityItem,
  type ActionBtn,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Invoices.css';

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
function directionLabel(d: string, t: (k: string) => string): string {
  if (d === 'SALES') return t('opt.direction.sales');
  if (d === 'PURCHASE') return t('opt.direction.purchase');
  return d || '—';
}

const invoiceTypes = ['نقل اسفلت', 'يومية عمل مالينج', 'يومية نقل اسفلت', 'أخرى'] as const;
const INVOICE_YEAR_OPTIONS = [2024, 2025, 2026, 2027, 2028] as const;
const DEFAULT_INVOICE_YEAR = String(new Date().getFullYear());

function parseInvoiceNumber(invNum: string): { year: string; suffix: string } {
  const match = invNum.match(/^MN-INV-(\d{4})-(.+)$/);
  if (match) return { year: match[1], suffix: match[2] };
  return { year: DEFAULT_INVOICE_YEAR, suffix: invNum };
}

interface InvStats { count: number; totalSales: number; totalCollected: number; totalRemaining: number; average: number; }
interface MonthlyRow { year: number | null; month: number | null; count: number; totalSales: number; totalCollected: number; totalRemaining: number; }

type ContractOption = {
  id: number;
  code: string;
  asphaltPlant?: string | null;
  companyName?: string | null;
  status: string;
};

export default function Invoices() {
  const { hasPermission, user } = useAuth();
  const isSystemAdmin = user?.role.name === 'SYSTEM_ADMIN';
  const { t } = useT();
  const navigate = useNavigate();
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

  const isFiltered = !!(search || statusFilter || directionFilter || customerFilter || monthFilter || yearFilter);

  function resetFilters() {
    setSearch('');
    setStatusFilter('');
    setDirectionFilter('');
    setCustomerFilter('');
    setMonthFilter('');
    setYearFilter('');
    setPage(1);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const filterParams = {
      search: search || undefined,
      status: statusFilter || undefined,
      direction: directionFilter || undefined,
      customerId: customerFilter || undefined,
      billingMonth: monthFilter || undefined,
      billingYear: yearFilter || undefined,
    };
    try {
      const res = await api.get('/invoices', { params: { page, pageSize: 15, ...filterParams } });
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
  }, [page, search, statusFilter, directionFilter, customerFilter, monthFilter, yearFilter]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/customers', { params: { pageSize: 300 } })
      .then((r) => setCustomers(r.data?.data?.data ?? []))
      .catch(() => {});
  }, []);

  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelCandidate, setCancelCandidate] = useState<number | null>(null);

  function cancel(id: number) { setCancelCandidate(id); }

  async function executeCancel(id: number) {
    setCancelCandidate(null);
    if (cancelBusy) return;
    setCancelBusy(true);
    try { await api.patch(`/invoices/${id}/cancel`); toast.ok('تم إلغاء الفاتورة بنجاح'); load(); } catch (e) { setLoadError(errorMessage(e)); } finally { setCancelBusy(false); }
  }

  async function exportExcel() {
    setExportingExcel(true);
    try {
      const res = await api.get('/invoices', {
        params: {
          pageSize: 9999, page: 1,
          search: search || undefined,
          status: statusFilter || undefined,
          direction: directionFilter || undefined,
          customerId: customerFilter || undefined,
          billingMonth: monthFilter || undefined,
          billingYear: yearFilter || undefined,
        },
      });
      const all = res.data.data.data ?? [];
      const dirLabel = (d: string) => d === 'SALES' ? 'نقليات عميل' : d === 'PURCHASE' ? 'مشتريات مورد' : d;
      const statusAr: Record<string, string> = {
        UNPAID: 'غير مسدد', PARTIAL: 'مسدد جزئياً', PAID: 'مسدد',
        OVERDUE: 'متأخر', CANCELLED: 'ملغي',
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wsData = all.map((r: any) => ({
        'رقم الفاتورة': r.invoiceNumber ?? r.number,
        'نوع الفاتورة': r.invoiceType ?? '',
        'الاتجاه': dirLabel(r.direction ?? ''),
        'الطرف': r.customer?.name ?? r.supplier?.name ?? '',
        'تاريخ الإصدار': r.issueDate ? dateText(r.issueDate) : '',
        'شهر الحساب': r.billingMonth && r.billingYear ? `${ARABIC_MONTHS[Number(r.billingMonth) - 1]} ${r.billingYear}` : '',
        'الإجمالي': Number(r.total),
        'المسدد': Number(r.paidAmount),
        'المتبقي': Number(r.total) - Number(r.paidAmount),
        'الحالة': statusAr[r.status] ?? r.status,
        'ملاحظات': r.notes ?? '',
      }));
      downloadXlsx(wsData, 'الفواتير', generateExportFileName({ reportName: ReportName.InvoicesList, extension: 'xlsx' }));
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setExportingExcel(false);
    }
  }

  // Row-action eligibility (mirrors the prior table actions exactly — UI gating only).
  const canEditRow = (r: { status?: string; paidAmount?: number }) =>
    hasPermission('invoices.update') && (r.status === 'UNPAID' || (r.status === 'OVERDUE' && Number(r.paidAmount) === 0));
  const canCollectRow = (r: { status?: string }) =>
    hasPermission('invoices.update') && r.status !== 'PAID' && r.status !== 'CANCELLED';
  const canCancelRow = (r: { status?: string; paidAmount?: number }) =>
    hasPermission('invoices.update') && r.status !== 'CANCELLED' && Number(r.paidAmount) === 0;

  return (
    <div className="xpl-scope xpl-page" dir="rtl">
      <ReturnToReportButton />
      <ExecutiveHeader
        icon="receipt_long"
        title={t('page.invoices.title')}
        subtitle={t('page.invoices.subtitle')}
        chips={stats ? (
          <>
            <IdChip icon="receipt_long" tone="indigo">{stats.count} {t('inv.stats.count')}</IdChip>
            <IdChip icon="payments" tone="green">{money(stats.totalCollected)}</IdChip>
            {stats.totalRemaining > 0 && <IdChip icon="pending_actions" tone="orange">{money(stats.totalRemaining)}</IdChip>}
          </>
        ) : undefined}
        aside={hasPermission('invoices.create')
          ? (
            <>
              <Button variant="secondary" icon="bolt" onClick={() => setFastEntry(true)}>إدخال فواتير سريع</Button>
              <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('page.invoices.create')}</Button>
            </>
          )
          : undefined}
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
            value={money(stats.totalSales)}
            sub={<><span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>{`${stats.count} ${t('inv.stats.count')}`}</>}
          />
          <div className="xpl-kpi-grid">
            <MetricCard icon="description" tone="blue" label={t('inv.stats.count')} value={stats.count} />
            <MetricCard icon="task_alt" tone="green" label={t('inv.stats.collected')} value={money(stats.totalCollected)} />
            <MetricCard icon="pending_actions" tone="red" label={t('inv.stats.remaining')} value={money(stats.totalRemaining)} />
            <MetricCard icon="functions" tone="indigo" label={t('inv.stats.average')} value={money(stats.average)} />
          </div>
        </div>
      )}

      {customerFilter && stats && (() => {
        const customer = customers.find((c) => String(c.id) === customerFilter);
        return customer ? (
          <div className="invcx-customer-strip">
            <span className="name"><span className="material-symbols-outlined" aria-hidden="true">badge</span>{customer.name}</span>
            <span>{stats.count} فاتورة</span>
            <span>إجمالي: <strong>{money(stats.totalSales)}</strong></span>
            <span>محصل: <strong className="invcx-paid">{money(stats.totalCollected)}</strong></span>
            <span>متبقي: <strong className={stats.totalRemaining > 0 ? 'invcx-remaining' : 'invcx-remaining--zero'}>{money(stats.totalRemaining)}</strong></span>
          </div>
        ) : null;
      })()}

      {/* Sticky filters */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('page.invoices.search')} ariaLabel={t('page.invoices.search')} />
          <select className="xpl-select" value={customerFilter} onChange={(e) => { setCustomerFilter(e.target.value); setPage(1); }} aria-label="الجهة">
            <option value="">الجهة — الكل</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="xpl-select" value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }} aria-label="شهر الحساب">
            <option value="">الشهر — الكل</option>
            {ARABIC_MONTHS.map((name, idx) => <option key={idx + 1} value={idx + 1}>{name}</option>)}
          </select>
          <select className="xpl-select" value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1); }} aria-label="سنة الفوترة">
            <option value="">السنة — الكل</option>
            {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {isFiltered && <button type="button" className="xpl-clear-link" onClick={resetFilters}>{t('action.reset_filters')}</button>}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{(meta?.total ?? rows.length)} فاتورة</span>
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
            <ExportExcelButton onExport={exportExcel} busy={exportingExcel} />
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
            message={isFiltered ? 'لا توجد فواتير مطابقة للفلاتر.' : undefined}
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
                    <th>{t('col.inv.number')}</th>
                    <th>{t('col.inv.party')}</th>
                    <th>{t('col.inv.type')}</th>
                    <th>{t('col.inv.direction')}</th>
                    <th>{t('col.date')}</th>
                    <th>{t('col.inv.total')}</th>
                    <th>{t('col.inv.paid')}</th>
                    <th>{t('lbl.inv.remaining_amount')}</th>
                    <th>{t('col.status')}</th>
                    <th aria-label="فتح" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const remaining = Math.max(0, Number(r.total) - Number(r.paidAmount ?? 0));
                    return (
                      <tr key={r.id} className="xpl-row--click" tabIndex={0} role="button"
                        aria-label={`تفاصيل الفاتورة ${r.invoiceNumber ?? r.number}`}
                        onClick={() => setViewing(r)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                        <td><span className="invcx-mono"><strong>{r.invoiceNumber ?? r.number}</strong></span></td>
                        <td><strong>{r.customer?.name ?? r.supplier?.name ?? '—'}</strong></td>
                        <td>{r.invoiceType ?? '—'}</td>
                        <td>{directionLabel(r.direction ?? '', t)}</td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.issueDate)}</td>
                        <td><span className="invcx-amount">{money(r.total)}</span></td>
                        <td><span className="invcx-paid">{money(r.paidAmount)}</span></td>
                        <td><span className={remaining > 0 ? 'invcx-remaining' : 'invcx-remaining--zero'}>{money(remaining)}</span></td>
                        <td>{invStatusChip(String(r.status), t)}</td>
                        <td style={{ width: 32, textAlign: 'center' }}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, color: 'var(--xpl-muted)' }}>chevron_left</span></td>
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

        const kpis: DrawerKpi[] = [
          { label: t('col.inv.total'), value: money(viewing.total) },
          { label: t('col.inv.paid'), value: money(viewing.paidAmount), tone: 'green' },
          { label: t('lbl.inv.remaining_amount'), value: money(remaining), tone: 'red' },
          { label: 'العمر', value: ageDays != null ? `${ageDays} يوم` : '—' },
        ];

        const quickActions: QuickAction[] = [];
        if (canCollect) quickActions.push({ key: 'collect', icon: 'payments', label: t('page.invoices.collect'), onClick: openCollect });
        if (hasPermission('invoices.read')) quickActions.push({ key: 'print', icon: 'print', label: t('btn.inv.print_invoice'), onClick: goPrint });
        if (hasPermission('invoices.read')) quickActions.push({ key: 'pdf', icon: 'picture_as_pdf', label: 'PDF', onClick: goPdf });
        if (canEdit) quickActions.push({ key: 'edit', icon: 'edit', label: t('action.edit'), tone: 'primary', onClick: openEdit });
        if (canCancel) quickActions.push({ key: 'cancel', icon: 'block', label: t('page.invoices.cancel_inv'), onClick: runCancel });
        if (isSystemAdmin) quickActions.push({ key: 'delete', icon: 'delete_forever', label: 'حذف نهائي', tone: 'danger', onClick: runDelete });

        const relatedPayments: RelatedItem[] = payments.map((p, idx) => ({
          key: String(p.id ?? idx),
          icon: 'payments',
          primary: money(p.amount),
          secondary: `${dateText(p.date)}${p.method ? ' · ' + p.method : ''}`,
        }));

        const activityItems: ActivityItem[] = [];
        if (viewing.issueDate) activityItems.push({ key: 'created', icon: 'receipt_long', tone: 'blue', title: 'أُنشئت الفاتورة', timestamp: dateText(viewing.issueDate) });
        payments.forEach((p, idx) => {
          activityItems.push({ key: `pmt-${p.id ?? idx}`, icon: 'payments', tone: 'green', title: `دفعة ${money(p.amount)}`, timestamp: dateText(p.date) });
        });
        if (String(viewing.status) === 'CANCELLED') activityItems.push({ key: 'cancelled', icon: 'block', tone: 'neutral', title: 'أُلغيت الفاتورة' });

        const primaryAction: ActionBtn | undefined = canCollect
          ? { key: 'collect', label: t('page.invoices.collect'), icon: 'payments', onClick: openCollect }
          : canEdit
            ? { key: 'edit', label: t('action.edit'), icon: 'edit', onClick: openEdit }
            : undefined;

        const secondaryActions: ActionBtn[] = [];
        if (hasPermission('invoices.read')) secondaryActions.push({ key: 'print', label: t('btn.inv.print_invoice'), icon: 'print', onClick: goPrint });
        if (canEdit && primaryAction?.key !== 'edit') secondaryActions.push({ key: 'edit', label: t('action.edit'), icon: 'edit', onClick: openEdit });

        const dangerActions: ActionBtn[] = [];
        if (canCancel) dangerActions.push({ key: 'cancel', label: t('page.invoices.cancel_inv'), icon: 'block', busy: cancelBusy, onClick: runCancel });
        if (isSystemAdmin) dangerActions.push({ key: 'delete', label: 'حذف نهائي', icon: 'delete_forever', onClick: runDelete });

        return (
          <Drawer
            title={`${t('col.inv.number')} ${viewing.invoiceNumber ?? viewing.number}`}
            onClose={() => setViewing(null)}
            hero={
              <>
                <DrawerHeaderCard
                  icon="receipt_long"
                  title={viewing.invoiceNumber ?? viewing.number}
                  subtitle={viewing.customer?.name ?? viewing.supplier?.name ?? '—'}
                  status={{ tone: statusMeta.tone, icon: statusMeta.icon, label: t(statusMeta.key) }}
                  kpis={kpis}
                />
                <DrawerQuickActions actions={quickActions} />
              </>
            }
            footer={
              <DrawerActionBar primary={primaryAction} secondary={secondaryActions} danger={dangerActions} />
            }
          >
            <DrawerSection title="المعلومات الأساسية">
              <DrawerField label={t('col.inv.number')} value={viewing.invoiceNumber ?? viewing.number} mono />
              <DrawerField label={t('col.inv.party')} value={viewing.customer?.name ?? viewing.supplier?.name ?? '—'} />
              <DrawerField label={t('col.date')} value={dateText(viewing.issueDate)} />
              <DrawerField label={t('col.inv.type')} value={viewing.invoiceType ?? '—'} />
              <DrawerField label={t('col.inv.direction')} value={directionLabel(viewing.direction ?? '', t)} />
              <DrawerField label="فترة الحساب" value={viewing.billingMonth && viewing.billingYear ? `${ARABIC_MONTHS[Number(viewing.billingMonth) - 1]} ${viewing.billingYear}` : '—'} />
            </DrawerSection>

            <DrawerSection title="الملخص المالي">
              <div className="invcx-fin">
                {viewing.subtotal != null && <div className="invcx-fin-row"><span className="invcx-fin-label">الإجمالي الفرعي</span><span className="invcx-fin-val">{money(viewing.subtotal)}</span></div>}
                {Number(viewing.discount) > 0 && <div className="invcx-fin-row"><span className="invcx-fin-label">الخصم</span><span className="invcx-fin-val">{money(viewing.discount)}</span></div>}
                {Number(viewing.taxAmount) > 0 && <div className="invcx-fin-row"><span className="invcx-fin-label">الضريبة</span><span className="invcx-fin-val">{money(viewing.taxAmount)}</span></div>}
                <div className="invcx-fin-row total"><span className="invcx-fin-label">الإجمالي</span><span className="invcx-fin-val">{money(viewing.total)}</span></div>
                <div className="invcx-fin-row"><span className="invcx-fin-label">{t('col.inv.paid')}</span><span className="invcx-fin-val invcx-paid">{money(viewing.paidAmount)}</span></div>
                <div className="invcx-fin-row"><span className="invcx-fin-label">{t('lbl.inv.remaining_amount')}</span><span className={`invcx-fin-val ${remaining > 0 ? 'invcx-remaining' : 'invcx-remaining--zero'}`}>{money(remaining)}</span></div>
              </div>
            </DrawerSection>

            {items.length > 0 && (
              <DrawerSection title="بنود الفاتورة">
                <table className="invcx-detail-table">
                  <thead>
                    <tr><th>الوصف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={it.id ?? idx}>
                        <td>{it.description ?? it.workType ?? '—'}</td>
                        <td>{it.quantity ?? '—'}</td>
                        <td>{it.unitPrice != null ? money(it.unitPrice) : '—'}</td>
                        <td><strong>{it.total != null ? money(it.total) : (it.quantity != null && it.unitPrice != null ? money(Number(it.quantity) * Number(it.unitPrice)) : '—')}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DrawerSection>
            )}

            {viewing.notes && (
              <DrawerSection title="ملاحظات">
                <DrawerField label="ملاحظات" value={viewing.notes} />
              </DrawerSection>
            )}

            <DrawerRelated title="الدفعات" items={relatedPayments} />
            <DrawerActivity items={activityItems} />

            <DrawerSection title="بيانات تقنية">
              <DrawerField label="المعرّف الداخلي" value={`#${viewing.id}`} mono />
            </DrawerSection>
          </Drawer>
        );
      })()}

      {fastEntry && <InvoiceFastEntryDialog onClose={() => setFastEntry(false)} onSaved={load} />}
      {creating && <CreateInvoice onClose={() => setCreating(false)} onSaved={() => { toast.ok('تم حفظ الفاتورة بنجاح'); load(); }} />}
      {editing && <EditInvoice invoice={editing} onClose={() => setEditing(null)} onSaved={() => { toast.ok('تم حفظ الفاتورة بنجاح'); load(); }} />}
      {paying && <AddPayment invoice={paying} onClose={() => setPaying(null)} onSaved={() => { toast.ok('تم تسجيل الدفعة بنجاح'); load(); }} />}
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
          title="تأكيد إلغاء الفاتورة"
          message={t('confirm.cancel_invoice')}
          confirmLabel="إلغاء الفاتورة"
          variant="danger"
          onConfirm={() => executeCancel(cancelCandidate)}
          onCancel={() => setCancelCandidate(null)}
        />
      )}
    </div>
  );
}

// ===== إنشاء فاتورة =====
function CreateInvoice({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [invoiceYear, setInvoiceYear] = useState<string>(DEFAULT_INVOICE_YEAR);
  const [invoiceNumberSuffix, setInvoiceNumberSuffix] = useState('');
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [billingMonth, setBillingMonth] = useState<number>(new Date().getMonth() + 1);
  const [billingYear, setBillingYear] = useState<number>(new Date().getFullYear());
  const [directionChoice, setDirectionChoice] = useState('SALES'); // SALES | PURCHASE | OTHER
  const [customDirection, setCustomDirection] = useState('');
  const [invoiceTypeChoice, setInvoiceTypeChoice] = useState<(typeof invoiceTypes)[number]>('نقل اسفلت');
  const [customInvoiceType, setCustomInvoiceType] = useState('');
  // for custom direction: which party type to link
  const [customPartyType, setCustomPartyType] = useState<'SALES' | 'PURCHASE'>('SALES');
  const [partyId, setPartyId] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parties, setParties] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([{ uid: crypto.randomUUID(), description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' }]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState<PriceOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [contractId, setContractId] = useState('');
  const prevPartyIdRef = useRef('');
  const submittingRef = useRef(false);

  // resolve the effective party source for fetching the list
  const effectivePartySource = directionChoice === 'OTHER' ? customPartyType : directionChoice;

  useEffect(() => {
    (async () => {
      const ep = effectivePartySource === 'SALES' ? '/customers' : '/suppliers';
      const res = await api.get(ep, { params: { pageSize: 200 } });
      setParties(res.data.data.data ?? []);
      setPartyId('');
    })();
  }, [effectivePartySource]);

  // reset party when switching party type inside OTHER
  useEffect(() => {
    if (directionChoice === 'OTHER') setPartyId('');
  }, [customPartyType, directionChoice]);

  useEffect(() => {
    if (partyId && partyId !== prevPartyIdRef.current && prevPartyIdRef.current !== '') {
      // Reset all unit prices — not just picker-selected (priceTouched) ones.
      // Auto-filled prices (single-unit match) also have priceTouched=false but are
      // customer-specific and must be cleared when the customer changes.
      setItems((prev) => prev.map((it) => ({ ...it, unitPrice: 0, priceTouched: false })));
      setContractId('');
    }
    prevPartyIdRef.current = partyId;

    if (effectivePartySource !== 'SALES' || !partyId) {
      setPrices([]);
      setContracts([]);
      return;
    }
    api.get('/prices/for-invoice', { params: { customerId: partyId } })
      .then((res) => setPrices(res.data?.data ?? []))
      .catch(() => {});
    api.get('/contracts', { params: { customerId: partyId, pageSize: 100 } })
      .then((res) => setContracts(res.data?.data?.data ?? []))
      .catch(() => {});
  }, [partyId, effectivePartySource]);

  const activeContract = contracts.find((c) => String(c.id) === contractId);
  const filterAsphaltPlant = activeContract?.asphaltPlant ?? null;
  const displayPrices = filterAsphaltPlant
    ? prices.filter((p) => p.asphaltPlant === filterAsphaltPlant)
    : prices;

  const lineTotal = (it: Item) => Number(it.quantity) * Number(it.unitPrice);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const total = Math.max(0, subtotal - Number(discount));

  async function submit() {
    if (submittingRef.current) return; // حارس مزامن ضد النقر المزدوج قبل إعادة رسم React
    submittingRef.current = true;
    setError('');
    const invoiceNumber = `MN-INV-${invoiceYear}-${invoiceNumberSuffix.trim()}`;
    if (!invoiceNumberSuffix.trim()) { submittingRef.current = false; setError(t('error.inv_number_required')); return; }

    const resolvedDirection = directionChoice === 'OTHER' ? customDirection.trim() : directionChoice;
    if (directionChoice === 'OTHER' && !customDirection.trim()) { submittingRef.current = false; setError(t('error.custom_direction_required')); return; }

    const resolvedInvoiceType = invoiceTypeChoice === 'أخرى' ? customInvoiceType.trim() : invoiceTypeChoice;
    if (invoiceTypeChoice === 'أخرى' && !customInvoiceType.trim()) { submittingRef.current = false; setError(t('error.custom_invoice_type_required')); return; }

    if (!partyId) { submittingRef.current = false; setError(effectivePartySource === 'SALES' ? t('error.select_customer') : t('error.select_supplier')); return; }
    if (items.some((it) => !it.description)) { submittingRef.current = false; setError(t('error.item_desc_required')); return; }
    if (items.some((it) => !it.unit)) { submittingRef.current = false; setError(t('error.select_unit')); return; }
    if (items.some((it) => Number(it.quantity) <= 0)) { submittingRef.current = false; setError(t('error.qty_positive')); return; }
    if (items.some((it) => Number(it.unitPrice) < 0)) { submittingRef.current = false; setError(t('error.price_negative')); return; }

    setSaving(true);
    try {
      await api.post('/invoices', {
        invoiceNumber,
        direction: resolvedDirection,
        invoiceType: resolvedInvoiceType,
        customerId: effectivePartySource === 'SALES' ? Number(partyId) : undefined,
        supplierId: effectivePartySource === 'PURCHASE' ? Number(partyId) : undefined,
        issueDate: issueDate || undefined,
        deliveryDate: deliveryDate || null,
        billingMonth,
        billingYear,
        discount: Number(discount),
        items: items.map(toInvoiceItemPayload),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal title={t('modal.new_invoice')} size="xl" onClose={onClose} footer={
      <>
        <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('btn.save_invoice')}</button>
        <button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>{t('col.inv.number')} *</label>
          <div style={{ display: 'flex', alignItems: 'center', direction: 'ltr' }}>
            <select
              value={invoiceYear}
              onChange={(e) => setInvoiceYear(e.target.value)}
              title={t('col.inv.number')}
              className="line-input"
              style={{ borderRadius: '10px 0 0 10px', borderInlineEnd: 0, background: 'var(--surface-2)', whiteSpace: 'nowrap' }}
            >
              {INVOICE_YEAR_OPTIONS.map((y) => (
                <option key={y} value={String(y)}>MN-INV-{y}</option>
              ))}
            </select>
            <input
              value={invoiceNumberSuffix}
              onChange={(e) => setInvoiceNumberSuffix(e.target.value)}
              placeholder="001"
              className="line-input"
              style={{ borderRadius: '0 10px 10px 0', direction: 'ltr' }}
            />
          </div>
        </div>
        <div className="field">
          <label>تاريخ الفاتورة</label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => {
              const v = e.target.value;
              setIssueDate(v);
              if (v) {
                const d = new Date(v);
                setBillingMonth(d.getMonth() + 1);
                setBillingYear(d.getFullYear());
              }
            }}
            title="تاريخ الفاتورة"
          />
        </div>
        <div className="field">
          <label>تاريخ التسليم</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            title="تاريخ تسليم الفاتورة"
          />
        </div>
        <div className="field">
          <label>{t('lbl.inv.billing_period')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={billingMonth}
              onChange={(e) => setBillingMonth(Number(e.target.value))}
              title="شهر الحساب"
              style={{ flex: 1 }}
            >
              {ARABIC_MONTHS.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>
            <select
              value={billingYear}
              onChange={(e) => setBillingYear(Number(e.target.value))}
              title="سنة الحساب"
              style={{ width: 90 }}
            >
              {billingYearOptions().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>{t('col.inv.type')}</label>
          <select value={invoiceTypeChoice} onChange={(e) => setInvoiceTypeChoice(e.target.value as (typeof invoiceTypes)[number])}>
            {invoiceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        {invoiceTypeChoice === 'أخرى' && (
          <div className="field">
            <label>{t('field.inv.custom_type')} *</label>
            <input
              value={customInvoiceType}
              onChange={(e) => setCustomInvoiceType(e.target.value)}
              placeholder={t('ph.inv.custom_type')}
            />
          </div>
        )}
        <div className="field">
          <label>{t('col.inv.direction')}</label>
          <select value={directionChoice} onChange={(e) => { setDirectionChoice(e.target.value); setPartyId(''); }}>
            <option value="SALES">{t('opt.direction.sales_full')}</option>
            <option value="PURCHASE">{t('opt.direction.purchase_full')}</option>
            <option value="OTHER">{t('opt.direction.other')}</option>
          </select>
        </div>
        {directionChoice === 'OTHER' && (
          <>
            <div className="field">
              <label>{t('field.inv.custom_direction')} *</label>
              <input
                value={customDirection}
                onChange={(e) => setCustomDirection(e.target.value)}
                placeholder={t('ph.inv.custom_direction')}
              />
            </div>
            <div className="field">
              <label>{t('field.inv.party_type')}</label>
              <select value={customPartyType} onChange={(e) => setCustomPartyType(e.target.value as 'SALES' | 'PURCHASE')} title={t('field.inv.party_type')}>
                <option value="SALES">{t('opt.direction.sales_full')}</option>
                <option value="PURCHASE">{t('opt.direction.purchase_full')}</option>
              </select>
            </div>
          </>
        )}
        <div className="field">
          <label>{effectivePartySource === 'SALES' ? t('col.customer') : t('col.supplier')} *</label>
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">{t('msg.select_placeholder')}</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {effectivePartySource === 'SALES' && partyId && contracts.length > 0 && (
          <div className="field">
            <label>العقد / المصنع (لتضييق الأسعار)</label>
            <select aria-label="اختر العقد" value={contractId} onChange={(e) => setContractId(e.target.value)}>
              <option value="">كل العقود</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}{c.asphaltPlant ? ` — ${c.asphaltPlant}` : ''}{c.companyName ? ` (${c.companyName})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <InvoiceLineItemsEditor
        items={items}
        setItems={setItems}
        displayPrices={displayPrices}
        prices={prices}
        effectivePartySource={effectivePartySource}
        partyId={partyId}
        filterAsphaltPlant={filterAsphaltPlant}
      />

      {/* Financial Summary */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'end' }}>
        <div className="field">
          <label>{t('field.inv.discount_kd')}</label>
          <input type="number" title={t('field.inv.discount_kd')} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
        </div>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('lbl.inv.subtotal')}</span>
            <span style={{ fontWeight: 600 }}>{money(subtotal)}</span>
          </div>
          {Number(discount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('field.inv.discount_kd')}</span>
              <span style={{ fontWeight: 600, color: '#dc2626' }}>−{money(discount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, color: 'var(--accent)' }}>
            <span>{t('lbl.inv.grand_total')}</span>
            <span>{money(total)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}


// ===== Creatable autocomplete للمنطقة / الموقع =====
// يقبل نصاً حراً أو اختياراً من القائمة — القيمة المُدخلة تبقى دائماً.
// يعرض "آخر المواقع استخداماً" أعلى القائمة، ثم نتائج الكتالوج مصنّفة.
// ===== تعديل فاتورة =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EditInvoice({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const parsed = parseInvoiceNumber(invoice.invoiceNumber ?? '');
  const [invoiceYear, setInvoiceYear] = useState<string>(parsed.year);
  const [invoiceNumberSuffix, setInvoiceNumberSuffix] = useState(parsed.suffix);
  const [issueDate, setIssueDate] = useState<string>(
    invoice.issueDate ? String(invoice.issueDate).slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [billingMonth, setBillingMonth] = useState<number>(Number(invoice.billingMonth) || (new Date().getMonth() + 1));
  const [billingYear, setBillingYear] = useState<number>(Number(invoice.billingYear) || new Date().getFullYear());

  const [directionChoice, setDirectionChoice] = useState<string>(
    invoice.direction === 'SALES' || invoice.direction === 'PURCHASE' ? invoice.direction : 'OTHER'
  );
  const [customDirection, setCustomDirection] = useState<string>(
    invoice.direction !== 'SALES' && invoice.direction !== 'PURCHASE' ? (invoice.direction ?? '') : ''
  );

  const standardInvTypes = invoiceTypes.slice(0, -1) as readonly string[];
  const isStandardType = standardInvTypes.includes(invoice.invoiceType ?? '');
  const [invoiceTypeChoice, setInvoiceTypeChoice] = useState<(typeof invoiceTypes)[number]>(
    isStandardType ? (invoice.invoiceType as (typeof invoiceTypes)[number]) : 'أخرى'
  );
  const [customInvoiceType, setCustomInvoiceType] = useState<string>(isStandardType ? '' : (invoice.invoiceType ?? ''));

  const [customPartyType, setCustomPartyType] = useState<'SALES' | 'PURCHASE'>(
    invoice.supplierId ? 'PURCHASE' : 'SALES'
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [partyId, setPartyId] = useState<string>(String((invoice as any).customerId ?? (invoice as any).supplierId ?? ''));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parties, setParties] = useState<any[]>([]);

  const [items, setItems] = useState<Item[]>([{ uid: crypto.randomUUID(), description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' }]);
  const [deliveryDate, setDeliveryDate] = useState<string>(
    invoice.deliveryDate ? String(invoice.deliveryDate).slice(0, 10) : ''
  );
  const [discount, setDiscount] = useState<number>(Number(invoice.discount) || 0);
  const [notes, setNotes] = useState<string>(invoice.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState<PriceOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [contractId, setContractId] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const submittingRef = useRef(false);
  const [loadError, setLoadError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [payments, setPayments] = useState<any[]>([]);

  const effectivePartySource = directionChoice === 'OTHER' ? customPartyType : directionChoice;
  const firstPartyLoad = useRef(true);
  const firstPartyTypeCheck = useRef(true);
  const prevPartyIdRef = useRef(partyId); // initialized to current partyId to avoid reset on mount

  // Load full invoice data (items, notes)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get(`/invoices/${invoice.id as number}`).then((res: any) => {
      const inv = res.data.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setItems(inv.items.map((it: any) => {
        const { workType, location } = parseDescription(it.description ?? '');
        return { uid: crypto.randomUUID(), description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice, workType, location };
      }));
      setDiscount(Number(inv.discount));
      setNotes(inv.notes ?? '');
      if (inv.issueDate) setIssueDate(String(inv.issueDate).slice(0, 10));
      if (inv.billingMonth) setBillingMonth(Number(inv.billingMonth));
      if (inv.billingYear) setBillingYear(Number(inv.billingYear));
      if (inv.deliveryDate) setDeliveryDate(String(inv.deliveryDate).slice(0, 10));
      if (Array.isArray(inv.payments)) setPayments(inv.payments);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).catch((e: any) => { setLoadError(errorMessage(e)); }).finally(() => { setLoadingData(false); });
  }, [invoice.id]);

  // Load party list; skip party reset on first load
  useEffect(() => {
    (async () => {
      const ep = effectivePartySource === 'SALES' ? '/customers' : '/suppliers';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.get(ep, { params: { pageSize: 200 } }) as any;
      setParties(res.data.data.data ?? []);
      if (!firstPartyLoad.current) setPartyId('');
      firstPartyLoad.current = false;
    })();
  }, [effectivePartySource]);

  // Reset party when switching party type inside OTHER (skip on initial render)
  useEffect(() => {
    if (firstPartyTypeCheck.current) { firstPartyTypeCheck.current = false; return; }
    if (directionChoice === 'OTHER') setPartyId('');
  }, [customPartyType, directionChoice]);

  // Price picker outside-click handler
  useEffect(() => {
    if (openPickerIdx === null) return;
    function handleOutsideClick() { setOpenPickerIdx(null); }
    function handleEscape(e: KeyboardEvent) { if (e.key === 'Escape') setOpenPickerIdx(null); }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => { document.removeEventListener('mousedown', handleOutsideClick); document.removeEventListener('keydown', handleEscape); };
  }, [openPickerIdx]);

  useEffect(() => {
    if (partyId && partyId !== prevPartyIdRef.current) {
      setItems((prev) => prev.map((it) => ({ ...it, unitPrice: 0, priceTouched: false })));
      setContractId('');
    }
    prevPartyIdRef.current = partyId;

    if (effectivePartySource !== 'SALES' || !partyId) {
      setPrices([]);
      setContracts([]);
      return;
    }
    api.get('/prices/for-invoice', { params: { customerId: partyId } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res: any) => setPrices(res.data?.data ?? []))
      .catch(() => {});
    api.get('/contracts', { params: { customerId: partyId, pageSize: 100 } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res: any) => setContracts(res.data?.data?.data ?? []))
      .catch(() => {});
  }, [partyId, effectivePartySource]);

  const activeContract = contracts.find((c) => String(c.id) === contractId);
  const filterAsphaltPlant = activeContract?.asphaltPlant ?? null;
  const displayPrices = filterAsphaltPlant
    ? prices.filter((p) => p.asphaltPlant === filterAsphaltPlant)
    : prices;

  const lineTotal = (it: Item) => Number(it.quantity) * Number(it.unitPrice);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const total = Math.max(0, subtotal - Number(discount));

  function setItem(i: number, key: keyof Item | 'workType' | 'location', value: string | number) {
    if (key === 'workType' || key === 'location') {
      setItems((prev) => prev.map((it, idx) => {
        if (idx !== i) return it;
        const newWorkType = key === 'workType' ? String(value) : (it.workType ?? DEFAULT_WORK_TYPE);
        const newLocation = key === 'location' ? String(value) : (it.location ?? '');
        return { ...it, workType: newWorkType, location: newLocation, description: composeDescription(newWorkType, newLocation) };
      }));
      return;
    }
    if (key === 'unit') {
      const newUnit = String(value);
      setOpenPickerIdx(null);
      if (newUnit === UNIT_OTHER) {
        setItems((prev) => prev.map((it, idx) => idx !== i ? it : { ...it, unit: isCustomUnit(it.unit) ? it.unit : '' }));
        return;
      }
      setItems((prev) => prev.map((it, idx) => {
        if (idx !== i) return it;
        const base = { ...it, unit: newUnit };
        if (!it.priceTouched) {
          const matches = displayPrices.filter((p) => p.contractUnit === newUnit);
          if (matches.length === 1) return { ...base, unitPrice: matches[0].unitPrice };
        }
        return base;
      }));
      setPickerSearch('');
      return;
    }
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it;
      const priceTouched = key === 'unitPrice' ? true : it.priceTouched;
      return { ...it, [key]: key === 'description' ? String(value) : Number(value), priceTouched };
    }));
  }

  function applyPrice(i: number, price: PriceOption) {
    setItems((p) => p.map((it, idx) => idx === i ? { ...it, unitPrice: price.unitPrice, unit: price.contractUnit, priceTouched: true } : it));
    setOpenPickerIdx(null);
    setPickerSearch('');
  }

  async function submit() {
    if (submittingRef.current) return; // حارس مزامن ضد النقر المزدوج قبل إعادة رسم React
    submittingRef.current = true;
    setError('');
    const invoiceNumber = `MN-INV-${invoiceYear}-${invoiceNumberSuffix.trim()}`;
    if (!invoiceNumberSuffix.trim()) { submittingRef.current = false; setError(t('error.inv_number_required')); return; }
    const resolvedDirection = directionChoice === 'OTHER' ? customDirection.trim() : directionChoice;
    if (directionChoice === 'OTHER' && !customDirection.trim()) { submittingRef.current = false; setError(t('error.custom_direction_required')); return; }
    const resolvedInvoiceType = invoiceTypeChoice === 'أخرى' ? customInvoiceType.trim() : invoiceTypeChoice;
    if (invoiceTypeChoice === 'أخرى' && !customInvoiceType.trim()) { submittingRef.current = false; setError(t('error.custom_invoice_type_required')); return; }
    if (!partyId) { submittingRef.current = false; setError(effectivePartySource === 'SALES' ? t('error.select_customer') : t('error.select_supplier')); return; }
    if (items.some((it) => !it.description)) { submittingRef.current = false; setError(t('error.item_desc_required')); return; }
    if (items.some((it) => !it.unit)) { submittingRef.current = false; setError(t('error.select_unit')); return; }
    if (items.some((it) => Number(it.quantity) <= 0)) { submittingRef.current = false; setError(t('error.qty_positive')); return; }
    if (items.some((it) => Number(it.unitPrice) < 0)) { submittingRef.current = false; setError(t('error.price_negative')); return; }
    setSaving(true);
    try {
      await api.put(`/invoices/${invoice.id as number}`, {
        invoiceNumber,
        direction: resolvedDirection,
        invoiceType: resolvedInvoiceType,
        customerId: effectivePartySource === 'SALES' ? Number(partyId) : null,
        supplierId: effectivePartySource === 'PURCHASE' ? Number(partyId) : null,
        issueDate: issueDate || undefined,
        deliveryDate: deliveryDate || null,
        billingMonth,
        billingYear,
        discount: Number(discount),
        notes: notes.trim() || undefined,
        items: items.map(toInvoiceItemPayload),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  if (loadingData) return (
    <Modal title={t('modal.edit_invoice')} size="xl" onClose={onClose} footer={<button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>}>
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{t('msg.loading')}</div>
    </Modal>
  );

  if (loadError) return (
    <Modal title={t('modal.edit_invoice')} size="xl" onClose={onClose} footer={<button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>}>
      <div className="alert error">⚠️ {loadError}</div>
    </Modal>
  );

  return (
    <Modal title={`${t('modal.edit_invoice')} — ${String(invoice.invoiceNumber ?? invoice.number)}`} size="xl" onClose={onClose} footer={
      <>
        <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
        <button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>{t('col.inv.number')} *</label>
          <div style={{ display: 'flex', alignItems: 'center', direction: 'ltr' }}>
            <select
              value={invoiceYear}
              onChange={(e) => setInvoiceYear(e.target.value)}
              title={t('col.inv.number')}
              className="line-input"
              style={{ borderRadius: '10px 0 0 10px', borderInlineEnd: 0, background: 'var(--surface-2)', whiteSpace: 'nowrap' }}
            >
              {INVOICE_YEAR_OPTIONS.map((y) => (
                <option key={y} value={String(y)}>MN-INV-{y}</option>
              ))}
            </select>
            <input
              value={invoiceNumberSuffix}
              onChange={(e) => setInvoiceNumberSuffix(e.target.value)}
              placeholder="001"
              className="line-input"
              style={{ borderRadius: '0 10px 10px 0', direction: 'ltr' }}
            />
          </div>
        </div>
        <div className="field">
          <label>تاريخ الفاتورة</label>
          <input type="date" value={issueDate} onChange={(e) => {
            const v = e.target.value;
            setIssueDate(v);
            if (v) {
              const d = new Date(v);
              setBillingMonth(d.getMonth() + 1);
              setBillingYear(d.getFullYear());
            }
          }} title="تاريخ الفاتورة" />
        </div>
        <div className="field">
          <label>تاريخ التسليم</label>
          <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} title="تاريخ تسليم الفاتورة" />
        </div>
        <div className="field">
          <label>{t('lbl.inv.billing_period')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={billingMonth} onChange={(e) => setBillingMonth(Number(e.target.value))} title="شهر الحساب" style={{ flex: 1 }}>
              {ARABIC_MONTHS.map((name, idx) => <option key={idx + 1} value={idx + 1}>{name}</option>)}
            </select>
            <select value={billingYear} onChange={(e) => setBillingYear(Number(e.target.value))} title="سنة الحساب" style={{ width: 90 }}>
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>{t('col.inv.type')}</label>
          <select value={invoiceTypeChoice} onChange={(e) => setInvoiceTypeChoice(e.target.value as (typeof invoiceTypes)[number])}>
            {invoiceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        {invoiceTypeChoice === 'أخرى' && (
          <div className="field">
            <label>{t('field.inv.custom_type')} *</label>
            <input value={customInvoiceType} onChange={(e) => setCustomInvoiceType(e.target.value)} placeholder={t('ph.inv.custom_type')} />
          </div>
        )}
        <div className="field">
          <label>{t('col.inv.direction')}</label>
          <select value={directionChoice} onChange={(e) => setDirectionChoice(e.target.value)}>
            <option value="SALES">{t('opt.direction.sales_full')}</option>
            <option value="PURCHASE">{t('opt.direction.purchase_full')}</option>
            <option value="OTHER">{t('opt.direction.other')}</option>
          </select>
        </div>
        {directionChoice === 'OTHER' && (
          <>
            <div className="field">
              <label>{t('field.inv.custom_direction')} *</label>
              <input value={customDirection} onChange={(e) => setCustomDirection(e.target.value)} placeholder={t('ph.inv.custom_direction')} />
            </div>
            <div className="field">
              <label>{t('field.inv.party_type')}</label>
              <select value={customPartyType} onChange={(e) => setCustomPartyType(e.target.value as 'SALES' | 'PURCHASE')} title={t('field.inv.party_type')}>
                <option value="SALES">{t('opt.direction.sales_full')}</option>
                <option value="PURCHASE">{t('opt.direction.purchase_full')}</option>
              </select>
            </div>
          </>
        )}
        <div className="field">
          <label>{effectivePartySource === 'SALES' ? t('col.customer') : t('col.supplier')} *</label>
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">{t('msg.select_placeholder')}</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {effectivePartySource === 'SALES' && partyId && contracts.length > 0 && (
          <div className="field">
            <label>العقد / المصنع (لتضييق الأسعار)</label>
            <select aria-label="اختر العقد" value={contractId} onChange={(e) => setContractId(e.target.value)}>
              <option value="">كل العقود</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}{c.asphaltPlant ? ` — ${c.asphaltPlant}` : ''}{c.companyName ? ` (${c.companyName})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>{t('lbl.items')}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 4, padding: '0 2px', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
        {['البنود', 'الكمية', 'الوحدة', 'السعر', 'الإجمالي'].map((h) => (
          <div key={h} style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{h}</div>
        ))}
        <div />
      </div>
      {effectivePartySource === 'SALES' && !partyId && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px', fontStyle: 'italic' }}>
          اختر العميل أولاً لعرض اتفاقيات أسعاره
        </p>
      )}
      {effectivePartySource === 'SALES' && partyId && prices.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px', fontStyle: 'italic' }}>
          لا توجد اتفاقيات أسعار مسجّلة لهذا العميل
        </p>
      )}
      {effectivePartySource === 'SALES' && partyId && displayPrices.length === 0 && prices.length > 0 && (
        <p style={{ fontSize: 12, color: '#b45309', margin: '4px 0 8px', fontStyle: 'italic' }}>
          لا توجد اتفاقيات أسعار مطابقة لهذا العميل / العقد / المصنع
        </p>
      )}
      {effectivePartySource === 'SALES' && partyId && displayPrices.length > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 13 }}>
          <div style={{ fontWeight: 800, color: '#1e40af', marginBottom: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            📋 اتفاقيات الأسعار
            {filterAsphaltPlant && (
              <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 6, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
                مصفّى: {filterAsphaltPlant}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {displayPrices.map(p => (
              <span key={p.id} style={{ fontSize: 12, color: '#1e3a5f' }}>
                <strong>{p.contractUnit}</strong>: {money(p.unitPrice)}
                {p.asphaltPlant ? ` — ${p.asphaltPlant}` : ''}
                {p.contractLocation ? ` (${p.contractLocation})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      {items.map((it, i) => (
        <div key={it.uid} className="invoice-item-row" style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'start', width: '100%' }}>
          <div className="invoice-cell description-cell" style={{ minWidth: 0, overflow: 'visible' }}>
            <select
              value={it.workType ?? DEFAULT_WORK_TYPE}
              onChange={(e) => setItem(i, 'workType', e.target.value)}
              title="نوع العمل"
              className="line-input"
              style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', marginBottom: 4 }}
            >
              {(WORK_TYPES as readonly string[]).map((wt) => <option key={wt} value={wt}>{wt}</option>)}
            </select>
            <LocationAutocomplete value={it.location ?? ''} onChange={(v) => setItem(i, 'location', v)} />
          </div>
          <div className="invoice-cell quantity-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <input type="number" min="0.001" step="0.001" placeholder={t('ph.qty')} value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} className="line-input" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
          </div>
          <div className="invoice-cell unit-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <select value={unitSelectValue(it.unit)} onChange={(e) => setItem(i, 'unit', e.target.value)} title="الوحدة" className="line-input" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
              {(STANDARD_UNITS as readonly string[]).map((u) => <option key={u} value={u}>{u}</option>)}
              <option value={UNIT_OTHER}>{UNIT_OTHER}</option>
            </select>
            {unitSelectValue(it.unit) === UNIT_OTHER && (
              <input value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} placeholder="اكتب الوحدة" className="line-input" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', marginTop: 4 }} />
            )}
          </div>
          <div className="invoice-cell price-cell" style={{ minWidth: 0, overflow: 'visible', position: 'relative' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="number" min="0" step="0.001" placeholder={t('ph.unit_price')} value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} className="line-input" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }} />
              {(() => { const unitPrices = prices.filter((p) => p.contractUnit === it.unit); return unitPrices.length > 0 ? (
                <>
                  <button type="button" className="btn secondary sm" style={{ flexShrink: 0, padding: '0 8px', fontSize: 14 }} title={t('ph.prices.picker_btn')} aria-label={t('ph.prices.picker_btn')} aria-haspopup="listbox" aria-expanded={openPickerIdx === i ? 'true' : 'false'} onClick={(e) => { e.stopPropagation(); setOpenPickerIdx(openPickerIdx === i ? null : i); }}>📋</button>
                  {openPickerIdx === i && (
                    <div role="listbox" aria-label={t('ph.prices.picker_list')} onMouseDown={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '100%', insetInlineStart: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 200, minWidth: 300, maxHeight: 260, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,.18)', marginTop: 2 }}>
                      <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontWeight: 700, userSelect: 'none' }}>{t('ph.prices.picker_unit')}: {it.unit}</div>
                      {unitPrices.map((p) => (
                        <button key={p.id} type="button" role="option" aria-selected="false" style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', lineHeight: 1.5 }} onClick={() => applyPrice(i, p)}>
                          <strong>{p.asphaltPlant ?? '—'}</strong>{p.companyName ? ` — ${p.companyName}` : ''}{p.contractLocation ? ` — ${p.contractLocation}` : ''} — <strong>{money(p.unitPrice)}</strong>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : null; })()}
            </div>
          </div>
          <div className="invoice-cell total-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div className="line-input" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default', width: '100%', boxSizing: 'border-box' }}>{money(lineTotal(it))}</div>
          </div>
          <div className="invoice-cell delete-cell" style={{ minWidth: 0 }}>
            {items.length > 1 && (
              <button className="btn secondary sm" type="button" onClick={() => { if (openPickerIdx === i) setOpenPickerIdx(null); setItems((p) => p.filter((_, idx) => idx !== i)); }}>✕</button>
            )}
          </div>
        </div>
      ))}
      <button className="btn secondary sm" type="button" onClick={() => setItems((p) => [...p, { uid: crypto.randomUUID(), description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' }])}>{t('btn.inv.add_material')}</button>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label>{t('field.inv.discount_kd')}</label><input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
        <div className="field"><label>{t('col.inv.total')}</label><div className="line-input" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default' }}>{money(total)}</div></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>{t('field.notes')}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder={t('field.notes')} />
        </div>
      </div>

      {/* Collection Summary */}
      {Number(invoice.total ?? 0) > 0 && (() => {
        const paid = Number(invoice.paidAmount ?? 0);
        const invTotal = Number(invoice.total ?? 0);
        const remaining = invTotal - paid;
        const pct = invTotal > 0 ? Math.round((paid / invTotal) * 100) : 0;
        const latestPmt = payments[0] ?? null;
        const statusLabel: Record<string, string> = { PENDING: 'معلقة', PARTIAL: 'مدفوعة جزئياً', PAID: 'مدفوعة بالكامل', CANCELLED: 'ملغاة' };
        return (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>تحصيل الفاتورة</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              <div style={{ textAlign: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>إجمالي الفاتورة</div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{money(invTotal)}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>المحصّل</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#065f46' }}>{money(paid)}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>المتبقي</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: remaining > 0 ? '#dc2626' : '#065f46' }}>{money(remaining)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: payments.length > 0 ? 8 : 0 }}>
              <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? '#065f46' : pct >= 50 ? '#d97706' : '#dc2626', borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 36, textAlign: 'end' }}>{pct}%</span>
              {invoice.status && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{statusLabel[invoice.status as string] ?? invoice.status}</span>}
            </div>
            {payments.length > 0 && (
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span>عدد الدفعات: <strong style={{ color: 'var(--text)' }}>{payments.length}</strong></span>
                {latestPmt && <span>آخر دفعة: <strong style={{ color: 'var(--text)' }}>{money(latestPmt.amount)}</strong></span>}
                {latestPmt?.date && <span>تاريخ آخر دفعة: <strong style={{ color: 'var(--text)' }}>{dateText(latestPmt.date)}</strong></span>}
              </div>
            )}
          </div>
        );
      })()}

      <AttachmentsPanel entityType="INVOICE" entityId={invoice.id as number} />
    </Modal>
  );
}

// ===== التقرير الشهري =====
function MonthlyReportModal({
  filters,
  onClose,
}: {
  filters: { direction?: string; status?: string; customerId?: string; billingYear?: string };
  onClose: () => void;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/invoices/monthly-report', { params: filters })
      .then((res) => setRows(res.data.data ?? []))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exportMonthlyExcel() {
    const wsData = rows.map((r) => ({
      'الفترة': r.month && r.year ? `${ARABIC_MONTHS[r.month - 1]} ${r.year}` : '—',
      'عدد الفواتير': r.count,
      'إجمالي المبالغ': r.totalSales,
      'إجمالي المحصل': r.totalCollected,
      'إجمالي المتبقي': r.totalRemaining,
    }));
    downloadXlsx(wsData, 'التقرير الشهري', generateExportFileName({ reportName: ReportName.MonthlyReport, extension: 'xlsx' }));
  }

  const thStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '2px solid var(--border)', textAlign: 'start', background: 'var(--surface-2)', fontWeight: 700, fontSize: 13 };
  const tdStyle: React.CSSProperties = { padding: '7px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 };

  return (
    <Modal title={t('inv.monthly_report')} size="xl" onClose={onClose} footer={
      <>
        {rows.length > 0 && <ExportExcelButton onExport={exportMonthlyExcel} busy={false} />}
        <button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {loading && <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>{t('msg.loading')}</div>}
      {error && <div className="alert error">⚠️ {error}</div>}
      {!loading && !error && rows.length === 0 && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>{t('msg.empty')}</p>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>{t('inv.monthly_report.period')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>عدد</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>إجمالي</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>محصل</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>متبقي</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {r.month && r.year ? `${ARABIC_MONTHS[r.month - 1]} ${r.year}` : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'end' }}>{r.count}</td>
                  <td style={{ ...tdStyle, textAlign: 'end', fontWeight: 700 }}>{money(r.totalSales)}</td>
                  <td style={{ ...tdStyle, textAlign: 'end', color: '#16a34a', fontWeight: 700 }}>{money(r.totalCollected)}</td>
                  <td style={{ ...tdStyle, textAlign: 'end', color: r.totalRemaining > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{money(r.totalRemaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ===== تسجيل دفعة =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AddPayment({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const remaining = Number(invoice.total) - Number(invoice.paidAmount);
  const [amount, setAmount] = useState(remaining);
  const [method, setMethod] = useState('CASH');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [transferNumber, setTransferNumber] = useState('');
  // تاريخ التحصيل — official collection date, defaults to today (shared local, timezone-safe formatter).
  const [collectionDate, setCollectionDate] = useState(() => formatFileDate());

  function handleMethodChange(newMethod: string) {
    setMethod(newMethod);
    setChequeNumber('');
    setRecipientName('');
    setTransferNumber('');
  }

  async function submit() {
    setError('');
    if (Number(amount) <= 0) { setError('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (Number(amount) > remaining) { setError('المبلغ المدخل أكبر من المتبقي للفاتورة'); return; }
    if (method === 'CHEQUE' && !chequeNumber.trim()) { setError('رقم الشيك مطلوب'); return; }
    if (method === 'CASH' && !recipientName.trim()) { setError('اسم المستلم مطلوب'); return; }
    if (method === 'TRANSFER' && !transferNumber.trim()) { setError('رقم التحويل مطلوب'); return; }
    if (!collectionDate) { setError('تاريخ التحصيل مطلوب'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await api.post(`/invoices/${invoice.id}/payments`, {
        amount: Number(amount),
        method,
        date: collectionDate,
        ...(method === 'CHEQUE'   && { reference: chequeNumber }),
        ...(method === 'CASH'     && { notes: recipientName }),
        ...(method === 'TRANSFER' && { reference: transferNumber }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${t('modal.collect_payment')} — ${invoice.invoiceNumber ?? invoice.number}`} size="lg" onClose={onClose} footer={
      <>
        <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('btn.record_payment')}</button>
        <button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontWeight: 600 }}>{t('lbl.remaining')} {money(remaining)}</p>
      <div className="form-grid">
        <div className="field"><label>{t('field.amount_kd')}</label><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <div className="field">
          <label>{t('field.payment_method')}</label>
          <select value={method} onChange={(e) => handleMethodChange(e.target.value)}>
            <option value="CASH">{t('opt.payment.cash')}</option>
            <option value="BANK">{t('opt.payment.bank')}</option>
            <option value="CHEQUE">{t('opt.payment.cheque')}</option>
            <option value="TRANSFER">{t('opt.payment.transfer')}</option>
          </select>
        </div>
        <div className="field">
          <label>{t('field.collection_date')} *</label>
          <input type="date" value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)} aria-label={t('field.collection_date')} />
        </div>
      </div>
      {method === 'CHEQUE' && (
        <div className="field">
          <label>رقم الشيك *</label>
          <input className="line-input" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} autoFocus={false} />
        </div>
      )}
      {method === 'CASH' && (
        <div className="field">
          <label>اسم المستلم *</label>
          <input className="line-input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
        </div>
      )}
      {method === 'TRANSFER' && (
        <div className="field">
          <label>رقم التحويل *</label>
          <input className="line-input" value={transferNumber} onChange={(e) => setTransferNumber(e.target.value)} />
        </div>
      )}
    </Modal>
  );
}
