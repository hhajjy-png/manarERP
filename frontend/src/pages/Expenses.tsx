import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useHighlight } from '../hooks/useHighlight';
import { ReturnToReportButton } from '../components/financial/ReturnToReportButton';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import { PageMeta } from '../components/DataTable';
import ConfirmModal from '../components/ConfirmModal';
import { money, dateText } from '../config/modules';
import { usePersistedState } from '../hooks/usePersistedState';
import { downloadBlob } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { ARABIC_MONTHS, billingYearOptions } from '../utils/dateUtils';
import AttachmentsPanel from '../components/AttachmentsPanel';
import ForceDeleteExpenseModal from '../components/ForceDeleteExpenseModal';
import FastMonthlyExpenseDialog from '../components/FastMonthlyExpenseDialog';
import SearchableSelect, { SearchableOption } from '../components/SearchableSelect';
import {
  EXPENSE_CATEGORY_SELECT_OPTIONS,
  expenseCategoryLabel,
  expenseCategoryIcon,
} from '../config/expenseCategories';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
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
  Dialog,
  DialogSection,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Expenses.css';

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

// خيارات القائمة القابلة للبحث — من المصدر الموحّد (تُشارَك مع حوار الإدخال الشهري السريع).
const CATEGORY_OPTIONS: SearchableOption[] = EXPENSE_CATEGORY_SELECT_OPTIONS;

const STATUS_META: Record<string, { key: string; tone: Tone; icon: string }> = {
  PENDING:   { key: 'exp.status.pending',   tone: 'orange',  icon: 'schedule' },
  APPROVED:  { key: 'exp.status.approved',  tone: 'green',   icon: 'check_circle' },
  REJECTED:  { key: 'exp.status.rejected',  tone: 'red',     icon: 'cancel' },
  REVERSED:  { key: 'exp.status.reversed',  tone: 'neutral', icon: 'undo' },
  CANCELLED: { key: 'exp.status.cancelled', tone: 'neutral', icon: 'block' },
};

export default function Expenses() {
  const { hasPermission, user } = useAuth();
  const isSystemAdmin = user?.role.name === 'SYSTEM_ADMIN';
  const { t } = useT();
  const toast = useToast();
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
  const [forceDeleteId, setForceDeleteId] = useState<number | null>(null);

  const isFiltered = !!(search || statusFilter || categoryFilter || supplierFilter || monthFilter || yearFilter);

  const filterParams = {
    search: search || undefined,
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    supplierId: supplierFilter || undefined,
    billingMonth: monthFilter || undefined,
    billingYear: yearFilter || undefined,
  };

  function resetFilters() {
    setSearch(''); setStatusFilter(''); setCategoryFilter('');
    setSupplierFilter(''); setMonthFilter(''); setYearFilter('');
    setPage(1);
  }

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const res = await api.get('/expenses', { params: { page, pageSize: 15, ...filterParams } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } catch (e) { setLoadError(errorMessage(e)); }
    finally { setLoading(false); }

    api.get('/expenses/stats', { params: filterParams })
      .then((r) => setStats(r.data.data ?? null))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, categoryFilter, supplierFilter, monthFilter, yearFilter]);

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
      if (action === 'approve') { await api.patch(`/expenses/${id}/approve`); toast.ok('تمت الموافقة بنجاح'); }
      else if (action === 'reject') { await api.patch(`/expenses/${id}/reject`); toast.ok('تم الرفض'); }
      else { await api.delete(`/expenses/${id}`); toast.ok('تم الحذف بنجاح'); }
      setViewing(null);
      load();
    } catch (e) { setError(errorMessage(e)); } finally { setActionBusy(false); }
  }

  async function exportExcel() {
    setExportingExcel(true);
    try {
      const res = await api.get('/reports/expenses/export', {
        params: { format: 'excel', ...filterParams },
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, generateExportFileName({ reportName: ReportName.Expenses, extension: 'xlsx' }));
    } catch (e) { setError(errorMessage(e)); }
    finally { setExportingExcel(false); }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function billingText(r: any): string {
    return r.billingMonth && r.billingYear
      ? `${ARABIC_MONTHS[Number(r.billingMonth) - 1]} ${r.billingYear}`
      : dateText(r.date);
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
    <div className="xpl-scope xpl-page" dir="rtl">
      <ReturnToReportButton />

      <ExecutiveHeader
        icon="receipt_long"
        title={t('mod.expenses.title')}
        subtitle={t('mod.expenses.subtitle')}
        chips={stats ? (
          <>
            {/* الإجمالي معروض في البطاقة الرئيسية أدناه — نتجنّب تكراره كشريحة في الترويسة. */}
            <IdChip icon="tag" tone="indigo">{stats.count} مصروف</IdChip>
            {stats.pendingCount > 0 && <IdChip icon="schedule" tone="orange">{money(stats.pendingTotal)} معلّق</IdChip>}
          </>
        ) : undefined}
        aside={canCreate ? (
          <>
            <Button variant="secondary" icon="calendar_month" onClick={() => setFastEntry(true)}>تسجيل مصروفات شهرية</Button>
            <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('mod.expenses.create')}</Button>
          </>
        ) : undefined}
      />

      {/* ── KPI hero + secondary ── */}
      {stats && (
        <div className="expx-metrics">
          <HeroMetric
            icon="account_balance_wallet"
            label="إجمالي المصروفات"
            value={money(stats.total)}
            sub={<><span className="material-symbols-outlined">receipt_long</span>{`${stats.count} مصروف`}</>}
          />
          <div className="xpl-kpi-grid">
            <MetricCard icon="tag" tone="indigo" label="عدد المصروفات" value={stats.count} />
            {stats.pendingCount > 0 && <MetricCard icon="schedule" tone="orange" label="بانتظار الاعتماد" value={money(stats.pendingTotal)} sub={`${stats.pendingCount} مصروف`} />}
            {stats.periods?.currentMonth && <MetricCard icon="calendar_month" tone="blue" label={`${ARABIC_MONTHS[(stats.periods.currentMonth.month as number) - 1]} ${stats.periods.currentMonth.year}`} value={money(stats.periods.currentMonth.total)} sub={`${stats.periods.currentMonth.count} مصروف`} />}
            {stats.periods?.currentYear && <MetricCard icon="event" tone="green" label={`سنة ${stats.periods.currentYear.year}`} value={money(stats.periods.currentYear.total)} sub={`${stats.periods.currentYear.count} مصروف`} />}
          </div>
        </div>
      )}

      {/* ── Breakdown: categories + company groups + top suppliers ── */}
      {stats && (!categoryFilter && stats.byCategory || stats.byCompanyGroup || stats.bySupplier) && (
        <SectionCard title="التحليل حسب التصنيف والمورد" icon="insights">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stats.byCompanyGroup && Object.keys(stats.byCompanyGroup as Record<string, number>).length > 0 && (
              <div className="expx-breakdown">
                {Object.entries(stats.byCompanyGroup as Record<string, number>).map(([grp, amt]) => (
                  <span key={grp} className="expx-break-chip"><span className="k">{grp}</span><span className="v">{money(amt)}</span></span>
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
                      <span className="k">{expenseCategoryLabel(cat)}</span><span className="v">{money(amt as number)}</span>
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
                      <span className="k">{name}</span><span className="v">{money(amt)}</span>
                    </span>
                  ))}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {loadError && <ErrorBanner>{loadError} <button type="button" className="xpl-clear-link" onClick={load} disabled={loading}>تحديث</button></ErrorBanner>}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* ── Sticky filters ── */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="بحث في الوصف…" ariaLabel="بحث في المصروفات" />
          <div className="xpl-field" style={{ minWidth: 190 }}>
            <span className="xpl-field-label">التصنيف</span>
            <SearchableSelect
              options={CATEGORY_OPTIONS}
              value={categoryFilter}
              onChange={(v) => { setCategoryFilter(v); setPage(1); }}
              emptyLabel="كل التصنيفات"
              ariaLabel="التصنيف"
              searchPlaceholder="ابحث في التصنيفات…"
            />
          </div>
          <div className="xpl-field" style={{ minWidth: 190 }}>
            <span className="xpl-field-label">المورد</span>
            <SearchableSelect
              options={supplierOptions}
              value={supplierFilter}
              onChange={(v) => { setSupplierFilter(v); setPage(1); }}
              emptyLabel="كل الموردين"
              ariaLabel="المورد"
              searchPlaceholder="ابحث في الموردين…"
            />
          </div>
          <div className="xpl-field" style={{ minWidth: 120 }}>
            <span className="xpl-field-label">الشهر</span>
            <select className="xpl-select" aria-label="الشهر" value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }}>
              <option value="">الكل</option>
              {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <div className="xpl-field" style={{ minWidth: 100 }}>
            <span className="xpl-field-label">السنة</span>
            <select className="xpl-select" aria-label="السنة" value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1); }}>
              <option value="">الكل</option>
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {hasPermission('reports.export') && (
            <Button variant="secondary" icon="table_view" busy={exportingExcel} onClick={exportExcel}>تصدير Excel</Button>
          )}
        </div>
        <div className="xpl-toolbar-row">
          <FilterChip active={statusFilter === ''} onClick={() => { setStatusFilter(''); setPage(1); }}>كل الحالات</FilterChip>
          {(['PENDING', 'APPROVED', 'REJECTED', 'REVERSED', 'CANCELLED'] as const).map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => { setStatusFilter(s); setPage(1); }} icon={STATUS_META[s].icon}>{t(STATUS_META[s].key)}</FilterChip>
          ))}
          {isFiltered && <button type="button" className="xpl-clear-link" onClick={resetFilters}>{t('action.reset_filters')}</button>}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{meta?.total ?? rows.length} نتيجة</span>
        </div>
      </div>

      {/* ── Table ── */}
      <section className="xpl-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon="receipt_long" tone="neutral" title={t('empty.expenses')}
            message={isFiltered ? 'لا توجد مصروفات مطابقة للفلاتر.' : 'لم تتم إضافة أي مصروف بعد.'}
            action={isFiltered ? <Button variant="secondary" icon="restart_alt" onClick={resetFilters}>{t('action.reset_filters')}</Button>
              : canCreate ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('mod.expenses.create')}</Button> : undefined} />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table">
                <thead>
                  <tr>
                    <th>{t('col.code')}</th>
                    <th>{t('col.category')}</th>
                    <th>{t('col.description')}</th>
                    <th>{t('field.supplier')}</th>
                    <th>{t('lbl.inv.billing_period')}</th>
                    <th>{t('col.amount')}</th>
                    <th>{t('col.status')}</th>
                    <th aria-label="فتح" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const sm = STATUS_META[r.status] ?? { key: '—', tone: 'neutral' as Tone, icon: 'help' };
                    return (
                      <tr key={r.id} id={`row-${r.id}`} className="xpl-row--click" tabIndex={0} role="button"
                        aria-label={`تفاصيل المصروف ${r.code}`}
                        onClick={() => setViewing(r)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                        <td><span className="expx-code">{r.code}</span></td>
                        <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 17, color: 'var(--xpl-primary)' }}>{expenseCategoryIcon(r.category)}</span>{expenseCategoryLabel(r.category)}</span></td>
                        <td><strong>{r.description}</strong></td>
                        <td>{r.supplier?.name ?? r.supplierName ?? '—'}</td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{billingText(r)}</td>
                        <td><span className="expx-amount">{money(r.amount)}</span></td>
                        <td><StatusChip tone={sm.tone} icon={sm.icon}>{t(sm.key)}</StatusChip></td>
                        <td className="xpl-col-chevron"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></td>
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

      {/* ── Detail drawer ── */}
      {viewing && (() => {
        const sm = STATUS_META[viewing.status] ?? { key: '—', tone: 'neutral' as Tone, icon: 'help' };
        const canEdit = hasPermission('expenses.update') && viewing.status !== 'APPROVED';
        const canApprove = hasPermission('expenses.approve') && viewing.status === 'PENDING';
        const canDelete = hasPermission('expenses.delete') && viewing.status !== 'APPROVED';
        return (
          <Drawer
            title={`مصروف ${viewing.code}`}
            onClose={() => setViewing(null)}
            hero={
              <div className="xpl-drawer-hero">
                <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">{expenseCategoryIcon(viewing.category)}</span></div>
                <div className="xpl-drawer-hero-body">
                  <span className="expx-drawer-amount">{money(viewing.amount)}</span>
                  <span className="xpl-drawer-hero-sub">{viewing.description}</span>
                  <div style={{ marginTop: 4 }}><StatusChip tone={sm.tone} icon={sm.icon}>{t(sm.key)}</StatusChip></div>
                </div>
              </div>
            }
            footer={
              <>
                {canEdit && <Button variant="primary" icon="edit" onClick={() => { setEditing(viewing); setViewing(null); }}>{t('action.edit')}</Button>}
                {canApprove && <Button variant="secondary" icon="check" busy={actionBusy} onClick={() => approve(viewing.id)}>{t('action.approve')}</Button>}
                {canApprove && <Button variant="ghost" icon="close" busy={actionBusy} onClick={() => reject(viewing.id)}>{t('action.reject')}</Button>}
                {canDelete && <Button variant="danger" icon="delete" busy={actionBusy} onClick={() => remove(viewing.id)}>{t('action.delete')}</Button>}
                {isSystemAdmin && <Button variant="danger" icon="delete_forever" onClick={() => { setForceDeleteId(viewing.id); setViewing(null); }}>حذف نهائي</Button>}
              </>
            }
          >
            <DrawerSection title="تفاصيل المصروف">
              <DrawerField label={t('col.code')} value={viewing.code} mono />
              <DrawerField label={t('col.category')} value={expenseCategoryLabel(viewing.category)} />
              <DrawerField label={t('col.description')} value={viewing.description} />
              <DrawerField label={t('col.amount')} value={money(viewing.amount)} />
            </DrawerSection>
            <DrawerSection title="الدفع والمورد">
              <DrawerField label="طريقة الدفع" value={viewing.paymentMethod === 'BANK' ? 'تحويل بنكي' : viewing.paymentMethod === 'ACCOUNTS_PAYABLE' ? 'ذمم الموردين' : 'نقداً'} />
              <DrawerField label={t('field.supplier')} value={viewing.supplier?.name ?? viewing.supplierName ?? '—'} />
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
      {creating && <ExpenseForm onClose={() => setCreating(false)} onSaved={() => { toast.ok('تم حفظ المصروف بنجاح'); load(); }} suppliers={suppliers} />}
      {editing && <ExpenseForm expense={editing} onClose={() => setEditing(null)} onSaved={() => { toast.ok('تم حفظ المصروف بنجاح'); load(); }} suppliers={suppliers} />}
      {expenseConfirm && (
        <ConfirmModal
          title={expenseConfirm.action === 'approve' ? 'تأكيد الموافقة' : expenseConfirm.action === 'reject' ? 'تأكيد الرفض' : 'تأكيد الحذف'}
          message={expenseConfirm.action === 'approve' ? t('msg.confirm_approve') : expenseConfirm.action === 'reject' ? t('msg.confirm_reject') : 'هل أنت متأكد من حذف هذا المصروف؟'}
          confirmLabel={expenseConfirm.action === 'approve' ? 'موافقة' : expenseConfirm.action === 'reject' ? 'رفض' : 'حذف'}
          variant={expenseConfirm.action === 'delete' ? 'danger' : 'warning'}
          onConfirm={() => executeExpenseAction(expenseConfirm.id, expenseConfirm.action)}
          onCancel={() => setExpenseConfirm(null)}
        />
      )}
      {forceDeleteId != null && (
        <ForceDeleteExpenseModal
          expenseId={forceDeleteId}
          onClose={() => setForceDeleteId(null)}
          onDeleted={() => { setForceDeleteId(null); toast.ok('تم الحذف النهائي بنجاح'); load(); }}
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

  const [category, setCategory] = useState<string>(String(expense?.category ?? 'FUEL'));
  const [description, setDescription] = useState<string>(String(expense?.description ?? ''));
  const [amount, setAmount] = useState<string>(expense?.amount ? String(expense.amount) : '');
  const [date, setDate] = useState<string>(
    expense?.date ? String(expense.date).slice(0, 10) : now.toISOString().slice(0, 10)
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
    if (!description.trim()) { setError('الوصف مطلوب'); return; }
    const amountNum = Number(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) { setError('المبلغ يجب أن يكون موجبًا'); return; }

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
      title={isEdit ? 'تعديل المصروف' : 'مصروف جديد'}
      subtitle={isEdit ? String(expense?.code ?? '') : 'تسجيل مصروف جديد'}
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

      <DialogSection title="المعلومات الأساسية" icon="info">
        <div className="xpl-field">
          <label>التصنيف <span className="req">*</span></label>
          <SearchableSelect
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={setCategory}
            ariaLabel="التصنيف"
            placeholder="اختر التصنيف…"
            searchPlaceholder="ابحث في التصنيفات…"
          />
        </div>
        <div className="xpl-field">
          <label>المبلغ (د.ك) <span className="req">*</span></label>
          <input className="xpl-input" type="number" min="0.001" step="0.001" placeholder="0.000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ direction: 'ltr' }} aria-label="المبلغ" />
        </div>
        <div className="xpl-field xpl-field--full">
          <label>الوصف <span className="req">*</span></label>
          <input className="xpl-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف المصروف" aria-label="الوصف" />
        </div>
      </DialogSection>

      <DialogSection title="الدفع والتاريخ" icon="payments">
        <div className="xpl-field">
          <label>طريقة الدفع</label>
          <select className="xpl-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label="طريقة الدفع">
            <option value="CASH">نقداً</option>
            <option value="BANK">تحويل بنكي</option>
            <option value="ACCOUNTS_PAYABLE">ذمم الموردين</option>
          </select>
        </div>
        <div className="xpl-field">
          <label>التاريخ</label>
          <input className="xpl-input" type="date" value={date} onChange={(e) => {
            const v = e.target.value;
            setDate(v);
            if (v) { const d = new Date(v); setBillingMonth(d.getMonth() + 1); setBillingYear(d.getFullYear()); }
          }} aria-label="التاريخ" />
        </div>
      </DialogSection>

      <DialogSection title="المورد" icon="storefront">
        <div className="xpl-field">
          <label>{t('field.supplier')}</label>
          <select className="xpl-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label={t('field.supplier')}>
            <option value="">— بدون مورد —</option>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(suppliers as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="OTHER">مورد آخر (غير مسجّل)…</option>
          </select>
        </div>
        {supplierId === 'OTHER' && (
          <div className="xpl-field">
            <label>اسم المورد</label>
            <input className="xpl-input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="اكتب اسم المورد" aria-label="اسم المورد" />
          </div>
        )}
      </DialogSection>

      <DialogSection title="الفترة المحاسبية" icon="calendar_month">
        <div className="xpl-field">
          <label>شهر الحساب</label>
          <select className="xpl-select" value={billingMonth} onChange={(e) => setBillingMonth(Number(e.target.value))} aria-label="شهر الحساب">
            {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
          </select>
        </div>
        <div className="xpl-field">
          <label>سنة الحساب</label>
          <select className="xpl-select" value={billingYear} onChange={(e) => setBillingYear(Number(e.target.value))} aria-label="سنة الحساب">
            {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </DialogSection>

      <DialogSection title={t('field.notes')} icon="sticky_note_2">
        <div className="xpl-field xpl-field--full">
          <label>{t('field.notes')}</label>
          <textarea className="xpl-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="ملاحظات (اختياري)" aria-label={t('field.notes')} />
        </div>
      </DialogSection>

      {isEdit && expense?.id != null && (
        <section className="xpl-dialog-section">
          <div className="xpl-dialog-section-title"><span className="material-symbols-outlined">attach_file</span>المرفقات</div>
          <AttachmentsPanel entityType="EXPENSE" entityId={Number(expense.id as number)} />
        </section>
      )}
    </Dialog>
  );
}
