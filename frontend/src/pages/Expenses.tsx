import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../api/client';
import { useHighlight } from '../hooks/useHighlight';
import DateInput from '../components/DateInput';
import { todayDateOnly } from '../lib/date';
import { ReturnToReportButton } from '../components/financial/ReturnToReportButton';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useUI } from '../stores/uiStore';
import { resolveName } from '../lib/resolveName';
import { useToast } from '../stores/toastStore';
import { PageMeta } from '../components/DataTable';
import ConfirmModal from '../components/ConfirmModal';
import { money, moneyParts, dateText, MoneyText, MoneyCell } from '../config/modules';
import { KpiStat, KpiStatGrid } from '../components/KpiStat';
import { usePersistedState } from '../hooks/usePersistedState';
import { useTableSort } from '../hooks/useTableSort';
import SortableHeader from '../components/SortableHeader';
import { useFinancialPeriod } from '../context/FinancialPeriodContext';
import PeriodControl from '../components/period/PeriodControl';
import { periodToReportParams, buildLocalizedPeriodLabel } from '../lib/financialPeriod';
import HistoricalDateNotice from '../components/period/HistoricalDateNotice';
import { fetchAllRows, downloadTableExcel } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { ARABIC_MONTHS, billingYearOptions } from '../utils/dateUtils';
import AttachmentsPanel from '../components/AttachmentsPanel';
import ForceDeleteExpenseModal from '../components/ForceDeleteExpenseModal';
import FastMonthlyExpenseDialog from '../components/FastMonthlyExpenseDialog';
import SearchableSelect, { SearchableOption } from '../components/SearchableSelect';
import {
  expenseCategoryIcon,
  buildLocalizedCategorySelectOptions,
} from '../config/expenseCategories';
import {
  EXPENSE_STATUS_META as STATUS_META,
  expenseStatusMeta,
} from '../config/expensePresentation';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  SectionCard,
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
  DrawerQuickActions,
  Dialog,
  DialogSection,
  Button,
  type QuickAction,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Expenses.css';
import { fcMoneyHeader } from '../components/financial/financialLabels';

export default function Expenses() {
  const { hasPermission, isSystemAdmin: getIsSystemAdmin } = useAuth();
  const isSystemAdmin = getIsSystemAdmin();
  const { period } = useFinancialPeriod();
  const { t } = useT();
  const lang = useUI((s) => s.lang);
  const toast = useToast();
  const categoryOptions = useMemo(() => buildLocalizedCategorySelectOptions(t), [t]);
  useHighlight();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = usePersistedState('exp:page', 1);
  const [search, setSearch] = usePersistedState('exp:search', '');
  const [statusFilter, setStatusFilter] = usePersistedState('exp:status', '');
  const [categoryFilter, setCategoryFilter] = usePersistedState('exp:category', '');
  const [supplierFilter, setSupplierFilter] = usePersistedState('exp:supplier', '');
  const [monthFilter, setMonthFilter] = usePersistedState('exp:month', '');
  const [yearFilter, setYearFilter] = usePersistedState('exp:year', '');
  // فرز الأعمدة الموحّد (خادمي) — فرز جديد يعيد إلى الصفحة الأولى.
  const sort = useTableSort('expenses', () => setPage(1));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [suppliers, setSuppliers] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [fastEntry, setFastEntry] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewing, setViewing] = useState<any | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [expenseConfirm, setExpenseConfirm] = useState<{ id: number; action: 'approve' | 'reject' | 'delete' } | null>(null);
  const [amendConfirmOpen, setAmendConfirmOpen] = useState(false);
  const [forceDeleteId, setForceDeleteId] = useState<number | null>(null);

  const isFiltered = !!(search || statusFilter || categoryFilter || supplierFilter || monthFilter || yearFilter);

  // الفترة العالمية تُطبَّق على تاريخ المصروف (from/to). الفلاتر المحلية (شهر/سنة الفوترة)
  // تبقى بُعدًا مستقلًا يزيد التضييق. القائمة والإحصاء يتشاركان نفس المعاملات.
  const periodRange = periodToReportParams(period);
  const filterParams = {
    search: search || undefined,
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    supplierId: supplierFilter || undefined,
    billingMonth: monthFilter || undefined,
    billingYear: yearFilter || undefined,
    from: periodRange.from,
    to: periodRange.to,
  };

  function resetFilters() {
    setSearch(''); setStatusFilter(''); setCategoryFilter('');
    setSupplierFilter(''); setMonthFilter(''); setYearFilter('');
    setPage(1);
    sort.reset();
  }

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const res = await api.get('/expenses', { params: { page, pageSize: 15, ...filterParams, ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}) } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } catch (e) { setLoadError(errorMessage(e)); }
    finally { setLoading(false); }

    api.get('/expenses/stats', { params: filterParams })
      .then((r) => setStats(r.data.data ?? null))
      .catch(() => {});
  // الفترة العالمية ضمن التبعيات ليُعاد الجلب عند تغييرها.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, categoryFilter, supplierFilter, monthFilter, yearFilter, period.fromDate, period.toDate, period.isAllPeriods, sort.sortBy, sort.sortDir]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/suppliers', { params: { pageSize: 300 } })
      .then((r) => setSuppliers(r.data?.data?.data ?? []))
      .catch(() => {});
  }, []);

  function approve(id: number) { setExpenseConfirm({ id, action: 'approve' }); }
  function reject(id: number) { setExpenseConfirm({ id, action: 'reject' }); }
  function remove(id: number) { setExpenseConfirm({ id, action: 'delete' }); }

  async function executeExpenseAction(id: number, action: 'approve' | 'reject' | 'delete') {
    setExpenseConfirm(null);
    if (actionBusy) return;
    setActionBusy(true);
    try {
      if (action === 'approve') { await api.patch(`/expenses/${id}/approve`); toast.ok(t('msg.expense.approved')); }
      else if (action === 'reject') { await api.patch(`/expenses/${id}/reject`); toast.ok(t('msg.expense.rejected')); }
      else { await api.delete(`/expenses/${id}`); toast.ok(t('msg.deleted_success')); }
      setViewing(null);
      load();
    } catch (e) { setError(errorMessage(e)); } finally { setActionBusy(false); }
  }

  // التعديل الآمن لمصروف معتمد: إلغاء الاعتماد (عكس القيد) ثم فتح نموذج التعديل والمصروف معلّق.
  async function executeAmend() {
    setAmendConfirmOpen(false);
    const exp = viewing;
    if (!exp || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await api.patch(`/expenses/${exp.id}/amend`);
      toast.ok(t('msg.expense.unapproved_for_edit'));
      setViewing(null);
      const updated = res.data?.data ?? { ...exp, status: 'PENDING' };
      setEditing(updated);
      load();
    } catch (e) { setError(errorMessage(e)); } finally { setActionBusy(false); }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function billingText(r: any): string {
    return r.billingMonth && r.billingYear
      ? `${ARABIC_MONTHS[Number(r.billingMonth) - 1]} ${r.billingYear}`
      : dateText(r.date);
  }

  interface ExpenseColumn {
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
    /** خليّة Excel رقمية خام + numFmt الدينار. */
    money?: boolean;
  }

  /**
   * حزمة Table/Excel Column Unification v1 — **المصدر الوحيد** لأعمدة جدول المصروفات:
   * الجدول المرئي (`<thead>`/`<tbody>` أدناه، عبر `.map()`) وتصدير Excel (`exportExcel`)
   * كلاهما يُبنى من هذه المصفوفة نفسها. إضافة عمود أو حذفه أو إعادة ترتيبه هنا ينعكس
   * تلقائيًا على الاثنين معًا — لا تعريف مزدوج، ولا احتمال انحراف مستقبلي بينهما.
   */
  function buildExpenseColumns(): ExpenseColumn[] {
    return [
      {
        key: 'code',
        header: t('col.code'),
        plainLabel: t('col.code'),
        sortable: true,
        render: (r) => <span className="expx-code">{r.code}</span>,
        exportValue: (r) => r.code ?? '',
      },
      {
        key: 'category',
        header: t('col.category'),
        plainLabel: t('col.category'),
        sortable: true,
        render: (r) => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 17, color: 'var(--xpl-primary)' }}>{expenseCategoryIcon(r.category)}</span>
            {t(`cat.${String(r.category).toLowerCase()}`)}
          </span>
        ),
        exportValue: (r) => t(`cat.${String(r.category).toLowerCase()}`),
      },
      {
        key: 'description',
        header: t('col.description'),
        plainLabel: t('col.description'),
        sortable: true,
        render: (r) => <strong>{r.description}</strong>,
        exportValue: (r) => r.description ?? '',
      },
      // المورد غير قابل للفرز — مصدر مختلط (علاقة supplier.name أو الحقل النصي supplierName).
      {
        key: 'supplier',
        header: t('field.supplier'),
        plainLabel: t('field.supplier'),
        render: (r) => (r.supplier ? resolveName(r.supplier, lang) : r.supplierName ?? '—'),
        exportValue: (r) => (r.supplier ? resolveName(r.supplier, lang) : r.supplierName ?? '—'),
      },
      // فترة الفوترة غير قابلة للفرز — قيمة مركّبة (شهر/سنة الفوترة أو التاريخ).
      {
        key: 'billingPeriod',
        header: t('lbl.inv.billing_period'),
        plainLabel: t('lbl.inv.billing_period'),
        render: (r) => <span style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{billingText(r)}</span>,
        exportValue: (r) => billingText(r),
      },
      {
        key: 'amount',
        header: fcMoneyHeader(t('col.amount')),
        plainLabel: t('col.amount'),
        sortable: true,
        money: true,
        render: (r) => <span className="expx-amount"><MoneyCell value={r.amount} /></span>,
        exportValue: (r) => Number(r.amount ?? 0),
      },
      {
        key: 'status',
        header: t('col.status'),
        plainLabel: t('col.status'),
        sortable: true,
        render: (r) => {
          const sm = expenseStatusMeta(r.status);
          return <StatusChip tone={sm.tone} icon={sm.icon}>{t(sm.key)}</StatusChip>;
        },
        exportValue: (r) => t(expenseStatusMeta(r.status).key),
      },
    ];
  }

  // المصدر الوحيد لأعمدة الجدول — يُستهلَك أدناه (JSX الجدول) وفي exportExcel معًا.
  const expenseColumns = buildExpenseColumns();

  /**
   * حزمة Table/Excel Column Unification v1 — مصدر واحد للأعمدة (expenseColumns،
   * أعلاه) يُستهلَك هنا وفي الجدول المرئي أدناه معًا. بلا مرور عبر وحدة التقارير
   * المشتركة (`/reports/*`) التي يستخدمها أيضًا نوع تقرير «المصروفات» في شاشة
   * التقارير — فلا يتأثر ذلك التقرير بهذا التغيير. يجلب كل المصروفات المطابقة
   * للفلاتر الحالية عبر كل الصفحات، بنفس فلاتر الشاشة (filterParams) تمامًا.
   */
  async function exportExcel() {
    setExportingExcel(true);
    try {
      const allRows = await fetchAllRows('/expenses', {
        ...filterParams,
        ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}),
      });
      downloadTableExcel(
        allRows,
        expenseColumns.map((c) => ({ header: c.header, value: c.exportValue, money: c.money })),
        generateExportFileName({ reportName: ReportName.Expenses, extension: 'xlsx' }),
      );
    } catch (e) { setError(errorMessage(e)); }
    finally { setExportingExcel(false); }
  }

  const canCreate = hasPermission('expenses.create');

  // خيارات المورد بنفس نمط فلتر التصنيف (قائمة قابلة للبحث) — اتساق بصري.
  // هويّة ثابتة عبر useMemo حتى لا نُبطل الميمو الداخلي لـ SearchableSelect عند كل تحديث.
  const supplierOptions: SearchableOption[] = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => suppliers.map((s: any) => ({ value: String(s.id), label: String(s.name) })),
    [suppliers],
  );

  return (
    <div className="xpl-scope xpl-page">
      <ReturnToReportButton />

      <ExecutiveHeader
        icon="receipt_long"
        title={t('mod.expenses.title')}
        subtitle={t('mod.expenses.subtitle')}
        chips={stats ? (
          <>
            {/* الإجمالي معروض في البطاقة الرئيسية أدناه — نتجنّب تكراره كشريحة في الترويسة. */}
            <IdChip icon="tag" tone="indigo">{stats.count} {t('unit.expense')}</IdChip>
            {stats.pendingCount > 0 && <IdChip icon="schedule" tone="orange">{<MoneyText value={stats.pendingTotal} />} {t('lbl.pending_suffix')}</IdChip>}
          </>
        ) : undefined}
        aside={(
          <>
            <PeriodControl hideLabelPrefix />
            {canCreate && <Button variant="secondary" icon="calendar_month" onClick={() => setFastEntry(true)}>{t('action.expenses.monthly_entry')}</Button>}
            {canCreate && <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('mod.expenses.create')}</Button>}
          </>
        )}
      />

      {/* ── KPI hero + secondary ── */}
      {stats && (
        <div className="expx-metrics">
          <HeroMetric
            icon="account_balance_wallet"
            label={t('kpi.total_expenses')}
            value={<MoneyText value={stats.total} />}
            sub={<><span className="material-symbols-outlined">receipt_long</span>{`${stats.count} ${t('unit.expense')}`}</>}
          />
          <KpiStatGrid>
            <KpiStat icon="tag" tone="indigo" label={t('stat.expense_count')} value={stats.count.toLocaleString()} />
            {stats.pendingCount > 0 && <KpiStat icon="schedule" tone="orange" label={t('stat.pending_approval')} value={moneyParts(stats.pendingTotal).number} unit={moneyParts(stats.pendingTotal).currency} sub={`${stats.pendingCount} ${t('unit.expense')}`} />}
            {stats.periods?.currentMonth && <KpiStat icon="calendar_month" tone="blue" label={`${ARABIC_MONTHS[(stats.periods.currentMonth.month as number) - 1]} ${stats.periods.currentMonth.year}`} value={moneyParts(stats.periods.currentMonth.total).number} unit={moneyParts(stats.periods.currentMonth.total).currency} sub={`${stats.periods.currentMonth.count} ${t('unit.expense')}`} />}
            {stats.periods?.currentYear && <KpiStat icon="event" tone="green" label={t('lbl.year_prefix', { year: stats.periods.currentYear.year })} value={moneyParts(stats.periods.currentYear.total).number} unit={moneyParts(stats.periods.currentYear.total).currency} sub={`${stats.periods.currentYear.count} ${t('unit.expense')}`} />}
          </KpiStatGrid>
        </div>
      )}

      {/* ── Breakdown: categories + company groups + top suppliers ── */}
      {stats && (!categoryFilter && stats.byCategory || stats.byCompanyGroup || stats.bySupplier) && (
        <SectionCard title={t('sec.expenses.breakdown')} icon="insights">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stats.byCompanyGroup && Object.keys(stats.byCompanyGroup as Record<string, number>).length > 0 && (
              <div className="expx-breakdown">
                {Object.entries(stats.byCompanyGroup as Record<string, number>).map(([grp, amt]) => (
                  <span key={grp} className="expx-break-chip"><span className="k">{grp}</span><span className="v">{<MoneyText value={amt} />}</span></span>
                ))}
              </div>
            )}
            {!categoryFilter && stats.byCategory && (
              <div className="expx-breakdown">
                {Object.entries(stats.byCategory as Record<string, number>)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .slice(0, 8)
                  .map(([cat, amt]) => (
                    <span key={cat} className="expx-break-chip">
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, color: 'var(--xpl-primary)' }}>{expenseCategoryIcon(cat)}</span>
                      <span className="k">{t(`cat.${cat.toLowerCase()}`)}</span><span className="v">{<MoneyText value={amt as number} />}</span>
                    </span>
                  ))}
              </div>
            )}
            {stats.bySupplier && Object.keys(stats.bySupplier as Record<string, number>).length > 0 && (
              <div className="expx-breakdown">
                {Object.entries(stats.bySupplier as Record<string, number>)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 6)
                  .map(([name, amt]) => (
                    <span key={name} className="expx-break-chip">
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, color: 'var(--xpl-muted)' }}>storefront</span>
                      <span className="k">{name}</span><span className="v">{<MoneyText value={amt} />}</span>
                    </span>
                  ))}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {loadError && <ErrorBanner>{loadError} <button type="button" className="xpl-clear-link" onClick={load} disabled={loading}>{t('action.refresh')}</button></ErrorBanner>}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* ── Sticky filters ── */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('ph.search_expense_desc')} ariaLabel={t('a11y.search_expenses')} />
          <div className="xpl-field" style={{ minWidth: 190 }}>
            <span className="xpl-field-label">{t('field.category')}</span>
            <SearchableSelect
              options={categoryOptions}
              value={categoryFilter}
              onChange={(v) => { setCategoryFilter(v); setPage(1); }}
              emptyLabel={t('opt.all_categories')}
              ariaLabel={t('field.category')}
              searchPlaceholder={t('ph.search_categories')}
            />
          </div>
          <div className="xpl-field" style={{ minWidth: 190 }}>
            <span className="xpl-field-label">{t('field.supplier_plain')}</span>
            <SearchableSelect
              options={supplierOptions}
              value={supplierFilter}
              onChange={(v) => { setSupplierFilter(v); setPage(1); }}
              emptyLabel={t('opt.all_suppliers')}
              ariaLabel={t('field.supplier_plain')}
              searchPlaceholder={t('ph.search_suppliers')}
            />
          </div>
          <div className="xpl-field" style={{ minWidth: 120 }}>
            <span className="xpl-field-label">{t('field.month')}</span>
            <select className="xpl-select" aria-label={t('field.month')} value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }}>
              <option value="">{t('opt.all_short')}</option>
              {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <div className="xpl-field" style={{ minWidth: 100 }}>
            <span className="xpl-field-label">{t('field.year')}</span>
            <select className="xpl-select" aria-label={t('field.year')} value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1); }}>
              <option value="">{t('opt.all_short')}</option>
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {hasPermission('reports.export') && (
            <Button variant="secondary" icon="table_view" busy={exportingExcel} onClick={exportExcel} style={exportingExcel ? undefined : { color: '#217346' }}>Excel</Button>
          )}
        </div>
        <div className="xpl-toolbar-row">
          <FilterChip active={statusFilter === ''} onClick={() => { setStatusFilter(''); setPage(1); }}>{t('opt.all_statuses')}</FilterChip>
          {(['PENDING', 'APPROVED', 'REJECTED', 'REVERSED', 'CANCELLED'] as const).map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => { setStatusFilter(s); setPage(1); }} icon={STATUS_META[s].icon}>{t(STATUS_META[s].key)}</FilterChip>
          ))}
          {isFiltered && <button type="button" className="xpl-clear-link" onClick={resetFilters}>{t('action.reset_filters')}</button>}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{meta?.total ?? rows.length} {t('unit.result')}</span>
        </div>
      </div>

      {/* ── Table ── */}
      <section className="xpl-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon="receipt_long" tone="neutral" title={t('empty.expenses')}
            message={
              !period.isAllPeriods
                ? t('empty.expenses.in_period', { period: buildLocalizedPeriodLabel(period, t, true) })
                : isFiltered ? t('empty.expenses.no_match_filters') : t('empty.expenses.none_yet')
            }
            action={isFiltered ? <Button variant="secondary" icon="restart_alt" onClick={resetFilters}>{t('action.reset_filters')}</Button>
              : canCreate ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('mod.expenses.create')}</Button> : undefined} />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table">
                <thead>
                  <tr>
                    {expenseColumns.map((c) => (
                      c.sortable ? (
                        <SortableHeader key={c.key} label={c.header} title={c.plainLabel} state={sort.getState(c.key)} onToggle={() => sort.toggle(c.key)} />
                      ) : (
                        <th key={c.key}>{c.header}</th>
                      )
                    ))}
                    <th aria-label={t('a11y.open_row')} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} id={`row-${r.id}`} className="xpl-row--click" tabIndex={0} role="button"
                      aria-label={t('a11y.expense_details', { code: r.code })}
                      onClick={() => setViewing(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                      {expenseColumns.map((c) => <td key={c.key}>{c.render(r)}</td>)}
                      <td className="xpl-col-chevron"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPage={setPage} />
          </>
        )}
      </section>

      {/* ── Detail drawer ── */}
      {viewing && (() => {
        const sm = expenseStatusMeta(viewing.status);
        // التعديل المباشر مسموح فقط للحالات التي يقبلها الخادم (PENDING/REJECTED) — مواءمة
        // الواجهة مع الخادم حتى لا يظهر زر تعديل يفشل عند الحفظ.
        const canEdit = hasPermission('expenses.update')
          && (viewing.status === 'PENDING' || viewing.status === 'REJECTED');
        // مصروف معتمد: يُفتح للتعديل عبر مسار آمن (إلغاء الاعتماد + عكس القيد ثم يصبح معلّقًا).
        const canAmend = hasPermission('expenses.approve')
          && hasPermission('expenses.update')
          && viewing.status === 'APPROVED';
        const canApprove = hasPermission('expenses.approve') && viewing.status === 'PENDING';
        // يطابق حُرّاس الخادم في remove(): يُمنع حذف المعتمد والمعكوس، أو أي مصروف يحمل
        // قيودًا محاسبية (مصروف فُتح للتعديل) — عندها يوجَّه المستخدم إلى الحذف النهائي.
        const canDelete = hasPermission('expenses.delete')
          && viewing.status !== 'APPROVED' && viewing.status !== 'REVERSED'
          && !viewing.hasJournalEntries;

        // أزرار العمليات أعلى Drawer المصروف — كانت سابقًا شريط أزرار سفلي، تجمّعت هنا
        // بنفس الأيقونات/الوظائف/الصلاحيات/ترتيب التنفيذ (Drawer Actions Consistency Pack v1).
        const quickActions: QuickAction[] = [
          ...(canEdit ? [{ key: 'edit', icon: 'edit', label: t('action.edit'), tone: 'primary' as const, onClick: () => { setEditing(viewing); setViewing(null); } }] : []),
          ...(canAmend ? [{ key: 'amend', icon: 'lock_open', label: t('action.expense.unapprove_edit'), onClick: () => setAmendConfirmOpen(true), disabled: actionBusy }] : []),
          ...(canApprove ? [{ key: 'approve', icon: 'check', label: t('action.approve'), onClick: () => approve(viewing.id), disabled: actionBusy }] : []),
          ...(canApprove ? [{ key: 'reject', icon: 'close', label: t('action.reject'), onClick: () => reject(viewing.id), disabled: actionBusy }] : []),
          ...(canDelete ? [{ key: 'delete', icon: 'delete', label: t('action.delete'), tone: 'danger' as const, onClick: () => remove(viewing.id), disabled: actionBusy }] : []),
          ...(isSystemAdmin ? [{ key: 'force-delete', icon: 'delete_forever', label: t('action.force_delete'), tone: 'danger' as const, onClick: () => { setForceDeleteId(viewing.id); setViewing(null); } }] : []),
        ];

        return (
          <Drawer
            title={t('lbl.expense_code_title', { code: viewing.code })}
            onClose={() => setViewing(null)}
            hero={
              <>
                <div className="xpl-drawer-hero">
                  <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">{expenseCategoryIcon(viewing.category)}</span></div>
                  <div className="xpl-drawer-hero-body">
                    <span className="expx-drawer-amount money-cell">{<MoneyText value={viewing.amount} />}</span>
                    <span className="xpl-drawer-hero-sub">{viewing.description}</span>
                    <div style={{ marginTop: 4 }}><StatusChip tone={sm.tone} icon={sm.icon}>{t(sm.key)}</StatusChip></div>
                  </div>
                </div>
                <DrawerQuickActions actions={quickActions} />
              </>
            }
          >
            <DrawerSection title={t('sec.expense_details')}>
              <DrawerField label={t('col.code')} value={viewing.code} mono />
              <DrawerField label={t('col.category')} value={t(`cat.${String(viewing.category).toLowerCase()}`)} />
              <DrawerField label={t('col.description')} value={viewing.description} />
              <DrawerField label={t('col.amount')} value={<MoneyText value={viewing.amount} />} />
            </DrawerSection>
            <DrawerSection title={t('sec.payment_supplier')}>
              <DrawerField label={t('field.payment_method')} value={t(`field.exp.payment_method.${String(viewing.paymentMethod ?? 'CASH').toLowerCase()}`)} />
              <DrawerField label={t('field.supplier')} value={viewing.supplier ? resolveName(viewing.supplier, lang) : viewing.supplierName ?? '—'} />
              <DrawerField label={t('lbl.inv.billing_period')} value={billingText(viewing)} />
              {viewing.date && <DrawerField label={t('col.date')} value={dateText(viewing.date)} />}
            </DrawerSection>
            {viewing.notes && (
              <DrawerSection title={t('field.notes')}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--xpl-text)' }}>{viewing.notes}</p>
              </DrawerSection>
            )}
          </Drawer>
        );
      })()}

      {fastEntry && <FastMonthlyExpenseDialog onClose={() => setFastEntry(false)} onSaved={load} suppliers={suppliers as { id: number; name: string }[]} />}
      {creating && <ExpenseForm onClose={() => setCreating(false)} onSaved={() => { toast.ok(t('msg.expense.saved')); load(); }} suppliers={suppliers} />}
      {editing && <ExpenseForm expense={editing} onClose={() => setEditing(null)} onSaved={() => { toast.ok(t('msg.expense.saved')); load(); }} suppliers={suppliers} />}
      {expenseConfirm && (
        <ConfirmModal
          title={expenseConfirm.action === 'approve' ? t('confirm.approve_title') : expenseConfirm.action === 'reject' ? t('confirm.reject_title') : t('confirm.delete_title')}
          message={expenseConfirm.action === 'approve' ? t('msg.confirm_approve') : expenseConfirm.action === 'reject' ? t('msg.confirm_reject') : t('confirm.delete_expense_msg')}
          confirmLabel={expenseConfirm.action === 'approve' ? t('lbl.approve_plain') : expenseConfirm.action === 'reject' ? t('action.reject') : t('action.delete')}
          variant={expenseConfirm.action === 'delete' ? 'danger' : 'warning'}
          onConfirm={() => executeExpenseAction(expenseConfirm.id, expenseConfirm.action)}
          onCancel={() => setExpenseConfirm(null)}
        />
      )}
      {amendConfirmOpen && viewing && (
        <ConfirmModal
          title={t('confirm.amend_title')}
          message={t('confirm.amend_message')}
          confirmLabel={t('action.expense.unapprove_edit')}
          variant="warning"
          onConfirm={executeAmend}
          onCancel={() => setAmendConfirmOpen(false)}
        />
      )}
      {forceDeleteId != null && (
        <ForceDeleteExpenseModal
          expenseId={forceDeleteId}
          onClose={() => setForceDeleteId(null)}
          onDeleted={() => { setForceDeleteId(null); toast.ok(t('msg.force_deleted')); load(); }}
        />
      )}
    </div>
  );
}

// ===== ExpenseForm =====
function ExpenseForm({
  expense,
  onClose,
  onSaved,
  suppliers,
}: {
  expense?: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
  suppliers: unknown[];
}) {
  const { t } = useT();
  const isEdit = !!expense;
  const now = new Date();
  const categoryOptions = useMemo(() => buildLocalizedCategorySelectOptions(t), [t]);
  const paymentMethodOptions = useMemo(() => ([
    { value: 'CASH', label: t('field.exp.payment_method.cash') },
    { value: 'BANK', label: t('field.exp.payment_method.bank') },
    { value: 'ACCOUNTS_PAYABLE', label: t('field.exp.payment_method.accounts_payable') },
  ]), [t]);

  const [category, setCategory] = useState<string>(String(expense?.category ?? 'FUEL'));
  const [description, setDescription] = useState<string>(String(expense?.description ?? ''));
  const [amount, setAmount] = useState<string>(expense?.amount ? String(expense.amount) : '');
  const [date, setDate] = useState<string>(
    expense?.date ? String(expense.date).slice(0, 10) : todayDateOnly(now)
  );
  const [billingMonth, setBillingMonth] = useState<number>(Number(expense?.billingMonth) || (now.getMonth() + 1));
  const [billingYear, setBillingYear] = useState<number>(Number(expense?.billingYear) || now.getFullYear());
  const [notes, setNotes] = useState<string>(String(expense?.notes ?? ''));
  const [paymentMethod, setPaymentMethod] = useState<string>(String(expense?.paymentMethod ?? 'CASH'));
  const [supplierId, setSupplierId] = useState<string>(() => {
    if (expense?.supplierId) return String(expense.supplierId);
    if (expense?.supplierName) return 'OTHER';
    return '';
  });
  const [supplierName, setSupplierName] = useState<string>(String(expense?.supplierName ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!description.trim()) { setError(t('error.description_required')); return; }
    const amountNum = Number(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) { setError(t('error.amount_positive')); return; }

    setSaving(true);
    const payload: Record<string, unknown> = {
      category,
      description: description.trim(),
      amount: amountNum,
      date: date || undefined,
      billingMonth,
      billingYear,
      notes: notes.trim() || undefined,
      supplierId: supplierId && supplierId !== 'OTHER' ? Number(supplierId) : null,
      supplierName: supplierId === 'OTHER' ? supplierName.trim() || null : null,
      paymentMethod,
    };
    try {
      if (isEdit) {
        await api.put(`/expenses/${expense!.id}`, payload);
      } else {
        await api.post('/expenses', payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      icon="receipt_long"
      title={isEdit ? t('modal.edit_expense') : t('modal.new_expense')}
      subtitle={isEdit ? String(expense?.code ?? '') : t('page.expenses.new_subtitle')}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" icon="save" busy={saving} onClick={submit}>{t('action.save')}</Button>
          <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
        </>
      }
    >
      {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}

      <DialogSection title={t('sec.basic_info')} icon="info">
        <div className="xpl-field">
          <label>{t('field.category')} <span className="req">*</span></label>
          <SearchableSelect
            options={categoryOptions}
            value={category}
            onChange={setCategory}
            ariaLabel={t('field.category')}
            placeholder={t('ph.select_category')}
            searchPlaceholder={t('ph.search_categories')}
          />
        </div>
        <div className="xpl-field">
          <label>{t('field.amount_kd')} <span className="req">*</span></label>
          <input className="xpl-input" type="number" min="0.001" step="0.001" placeholder="0.000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ direction: 'ltr' }} aria-label={t('col.amount')} />
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.description')} <span className="req">*</span></label>
          <input className="xpl-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('ph.expense_description')} aria-label={t('field.description')} />
        </div>
      </DialogSection>

      <DialogSection title={t('sec.payment_date')} icon="payments">
        <div className="xpl-field">
          <label>{t('field.payment_method')}</label>
          <select className="xpl-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label={t('field.payment_method')}>
            {paymentMethodOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="xpl-field">
          <label>{t('field.date')}</label>
          <DateInput className="xpl-input" value={date} onChange={(v) => {
            setDate(v);
            // Derive billing month/year from the canonical YYYY-MM-DD string — no Date/UTC.
            if (v) { const [yy, mm] = v.split('-'); setBillingMonth(Number(mm)); setBillingYear(Number(yy)); }
          }} ariaLabel={t('field.date')} />
          <HistoricalDateNotice date={date} />
        </div>
      </DialogSection>

      <DialogSection title={t('field.supplier_plain')} icon="storefront">
        <div className="xpl-field">
          <label>{t('field.supplier')}</label>
          <select className="xpl-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label={t('field.supplier')}>
            <option value="">{t('opt.no_supplier')}</option>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(suppliers as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="OTHER">{t('opt.other_supplier')}</option>
          </select>
        </div>
        {supplierId === 'OTHER' && (
          <div className="xpl-field">
            <label>{t('field.supplier_name')}</label>
            <input className="xpl-input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder={t('ph.supplier_name')} aria-label={t('field.supplier_name')} />
          </div>
        )}
      </DialogSection>

      <DialogSection title={t('sec.billing_period')} icon="calendar_month">
        <div className="xpl-field">
          <label>{t('field.billing_month')}</label>
          <select className="xpl-select" value={billingMonth} onChange={(e) => setBillingMonth(Number(e.target.value))} aria-label={t('field.billing_month')}>
            {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
          </select>
        </div>
        <div className="xpl-field">
          <label>{t('field.billing_year')}</label>
          <select className="xpl-select" value={billingYear} onChange={(e) => setBillingYear(Number(e.target.value))} aria-label={t('field.billing_year')}>
            {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </DialogSection>

      <DialogSection title={t('field.notes')} icon="sticky_note_2">
        <div className="xpl-field xpl-field--full">
          <label>{t('field.notes')}</label>
          <textarea className="xpl-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={t('ph.notes_optional')} aria-label={t('field.notes')} />
        </div>
      </DialogSection>

      {isEdit && expense?.id != null && (
        <section className="xpl-dialog-section">
          <div className="xpl-dialog-section-title"><span className="material-symbols-outlined">attach_file</span>{t('sec.attachments')}</div>
          <AttachmentsPanel entityType="EXPENSE" entityId={Number(expense.id as number)} />
        </section>
      )}
    </Dialog>
  );
}
