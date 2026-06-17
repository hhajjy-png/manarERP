import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import { money, dateText } from '../config/modules';
import { usePersistedState } from '../hooks/usePersistedState';
import ExportExcelButton from '../components/ExportExcelButton';
import { downloadXlsx } from '../utils/exportUtils';

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'FUEL', label: 'وقود' },
  { value: 'SALARIES', label: 'رواتب' },
  { value: 'MAINTENANCE', label: 'صيانة' },
  { value: 'RENT', label: 'إيجارات' },
  { value: 'PURCHASES', label: 'مشتريات' },
  { value: 'EQUIPMENT', label: 'معدات' },
  { value: 'SERVICES', label: 'خدمات' },
  { value: 'EQUIPMENT_RENT', label: 'إيجار معدات' },
  { value: 'TRUCK_RENT', label: 'إيجار شاحنات' },
  { value: 'HASSAN', label: 'مصروف عن طريق حسن' },
  { value: 'GHANEM', label: 'مصروف عن طريق غانم' },
  { value: 'NATHEER', label: 'مصروف عن طريق نظير' },
  { value: 'HAROON', label: 'مصروف عن طريق هارون' },
  { value: 'OTHER', label: 'أخرى' },
];

const CAT_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));

function billingYearOptions(): number[] {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1, y + 2];
}

const STATUS_PILL: Record<string, [string, string]> = {
  PENDING:  ['exp.status.pending',   'amber'],
  APPROVED: ['exp.status.approved',  'green'],
  REJECTED: ['exp.status.rejected',  'red'],
  REVERSED: ['exp.status.reversed',  'gray'],
  CANCELLED:['exp.status.cancelled', 'gray'],
};
const STATUS_AR: Record<string, string> = {
  PENDING: 'معلّق', APPROVED: 'معتمد', REJECTED: 'مرفوض', REVERSED: 'مُلغى الاعتماد', CANCELLED: 'ملغى',
};


export default function Expenses() {
  const { hasPermission } = useAuth();
  const { t } = useT();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [creating, setCreating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

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

  async function approve(id: number) {
    if (!confirm(t('msg.confirm_approve'))) return;
    if (actionBusy) return;
    setActionBusy(true);
    try { await api.patch(`/expenses/${id}/approve`); load(); } catch (e) { setError(errorMessage(e)); } finally { setActionBusy(false); }
  }

  async function reject(id: number) {
    if (!confirm(t('msg.confirm_reject'))) return;
    if (actionBusy) return;
    setActionBusy(true);
    try { await api.patch(`/expenses/${id}/reject`); load(); } catch (e) { setError(errorMessage(e)); } finally { setActionBusy(false); }
  }

  async function remove(id: number) {
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;
    if (actionBusy) return;
    setActionBusy(true);
    try { await api.delete(`/expenses/${id}`); load(); } catch (e) { setError(errorMessage(e)); } finally { setActionBusy(false); }
  }

  async function exportExcel() {
    setExportingExcel(true);
    try {
      const res = await api.get('/expenses', { params: { pageSize: 9999, page: 1, ...filterParams } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = res.data.data.data ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wsData = all.map((r: any) => ({
        'الرقم': r.code,
        'التصنيف': CAT_LABEL[r.category] ?? r.category,
        'الوصف': r.description,
        'المورد': r.supplier?.name ?? r.supplierName ?? '',
        'شهر الحساب': r.billingMonth && r.billingYear ? `${ARABIC_MONTHS[Number(r.billingMonth) - 1]} ${r.billingYear}` : (r.date ? String(r.date).slice(0, 10) : ''),
        'المبلغ (د.ك)': Number(r.amount),
        'الحالة': STATUS_AR[r.status] ?? r.status,
        'ملاحظات': r.notes ?? '',
      }));
      downloadXlsx(wsData, 'المصروفات', `expenses_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { setError(errorMessage(e)); }
    finally { setExportingExcel(false); }
  }

  const columns = [
    {
      key: 'code', label: 'col.code',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: (r: any) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span>,
    },
    {
      key: 'category', label: 'col.category',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: (r: any) => CAT_LABEL[r.category] ?? r.category,
    },
    {
      key: 'description', label: 'col.description',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: (r: any) => <strong>{r.description}</strong>,
    },
    {
      key: 'supplier', label: 'field.supplier',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: (r: any) => r.supplier?.name ?? r.supplierName ?? '—',
    },
    {
      key: 'billing', label: 'lbl.inv.billing_period',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: (r: any) => r.billingMonth && r.billingYear
        ? `${ARABIC_MONTHS[Number(r.billingMonth) - 1]} ${r.billingYear}`
        : dateText(r.date),
    },
    {
      key: 'amount', label: 'col.amount',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: (r: any) => money(r.amount),
    },
    {
      key: 'status', label: 'col.status',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      render: (r: any) => {
        const [key, c] = STATUS_PILL[r.status as string] ?? ['—', 'gray'];
        return <span className={`pill ${c}`}>{t(key)}</span>;
      },
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{t('mod.expenses.title')}</h2>
          <p>{t('mod.expenses.subtitle')}</p>
        </div>
        {hasPermission('expenses.create') && (
          <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t('mod.expenses.create')}</button>
        )}
      </div>

      {/* ── KPI Strip ── */}
      {stats && (
        <div className="inv-stats-strip">
          <div className="inv-stat-chip">
            <span className="inv-stat-label">عدد المصروفات</span>
            <span className="inv-stat-value">{stats.count}</span>
          </div>
          <div className="inv-stat-chip blue">
            <span className="inv-stat-label">إجمالي المصروفات</span>
            <span className="inv-stat-value">{money(stats.total)}</span>
          </div>
          {stats.pendingCount > 0 && (
            <div className="inv-stat-chip amber">
              <span className="inv-stat-label">معلّق</span>
              <span className="inv-stat-value">{money(stats.pendingTotal)}</span>
            </div>
          )}
          {stats.byCompanyGroup && Object.entries(stats.byCompanyGroup as Record<string, number>).map(([grp, amt]) => (
            <div key={grp} className="inv-stat-chip">
              <span className="inv-stat-label">{grp}</span>
              <span className="inv-stat-value">{money(amt)}</span>
            </div>
          ))}
        </div>
      )}

      {loadError && (
        <div className="alert error" role="alert">
          <span>⚠️ {loadError}</span>
          <button type="button" className="btn secondary sm" onClick={load} disabled={loading}>↻ تحديث</button>
        </div>
      )}
      {error && <div className="alert error">⚠️ {error}</div>}

      {/* ── Filters ── */}
      <form className="toolbar" onSubmit={(e) => e.preventDefault()}>
        <input
          placeholder="بحث في الوصف…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 240 }}
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ maxWidth: 180 }}>
          <option value="">الحالة — الكل</option>
          <option value="PENDING">{t('exp.status.pending')}</option>
          <option value="APPROVED">{t('exp.status.approved')}</option>
          <option value="REJECTED">{t('exp.status.rejected')}</option>
          <option value="REVERSED">{t('exp.status.reversed')}</option>
          <option value="CANCELLED">{t('exp.status.cancelled')}</option>
        </select>
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} style={{ maxWidth: 220 }}>
          <option value="">التصنيف — الكل</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={supplierFilter} onChange={(e) => { setSupplierFilter(e.target.value); setPage(1); }} style={{ maxWidth: 180 }}>
          <option value="">المورد — الكل</option>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }} style={{ maxWidth: 130 }}>
          <option value="">الشهر — الكل</option>
          {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
        </select>
        <select value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1); }} style={{ maxWidth: 100 }}>
          <option value="">السنة — الكل</option>
          {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {isFiltered && (
          <button type="button" className="btn secondary sm" onClick={resetFilters}>{t('action.reset_filters')}</button>
        )}
        <button type="button" className="btn secondary" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
        <ExportExcelButton onExport={exportExcel} busy={exportingExcel} />
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        emptyText={t('empty.expenses')}
        isFiltered={isFiltered}
        onResetFilters={resetFilters}
        emptyAction={hasPermission('expenses.create') ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t('mod.expenses.create')}</button>
        ) : undefined}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actions={(row: any) => (
          <>
            {hasPermission('expenses.update') && row.status !== 'APPROVED' && (
              <button type="button" className="btn secondary sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>
            )}{' '}
            {hasPermission('expenses.approve') && row.status === 'PENDING' && (
              <button type="button" className="btn sm" onClick={() => approve(row.id)} disabled={actionBusy}>{t('action.approve')}</button>
            )}{' '}
            {hasPermission('expenses.approve') && row.status === 'PENDING' && (
              <button type="button" className="btn secondary sm" onClick={() => reject(row.id)} disabled={actionBusy}>{t('action.reject')}</button>
            )}{' '}
            {hasPermission('expenses.delete') && row.status !== 'APPROVED' && (
              <button type="button" className="btn danger sm" onClick={() => remove(row.id)} disabled={actionBusy}>{t('action.delete')}</button>
            )}
          </>
        )}
      />

      {creating && <ExpenseForm onClose={() => setCreating(false)} onSaved={load} suppliers={suppliers} />}
      {editing && <ExpenseForm expense={editing} onClose={() => setEditing(null)} onSaved={load} suppliers={suppliers} />}
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
    <Modal
      title={isEdit ? 'تعديل المصروف' : 'مصروف جديد'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
          <button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
        </>
      }
    >
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>التصنيف *</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>الوصف *</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف المصروف"
          />
        </div>
        <div className="field">
          <label>المبلغ (د.ك) *</label>
          <input
            type="number"
            min="0.001"
            step="0.001"
            placeholder="0.000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label>التاريخ</label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const v = e.target.value;
              setDate(v);
              if (v) {
                const d = new Date(v);
                setBillingMonth(d.getMonth() + 1);
                setBillingYear(d.getFullYear());
              }
            }}
          />
        </div>
        <div className="field">
          <label>شهر الحساب</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={billingMonth} onChange={(e) => setBillingMonth(Number(e.target.value))} style={{ flex: 1 }}>
              {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
            <select value={billingYear} onChange={(e) => setBillingYear(Number(e.target.value))} style={{ width: 90 }}>
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>{t('field.supplier')}</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— بدون مورد —</option>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(suppliers as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="OTHER">مورد آخر (غير مسجّل)…</option>
          </select>
        </div>
        {supplierId === 'OTHER' && (
          <div className="field">
            <label>اسم المورد</label>
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="اكتب اسم المورد"
            />
          </div>
        )}
        <div className="field">
          <label>طريقة الدفع</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} title="طريقة الدفع">
            <option value="CASH">نقداً</option>
            <option value="BANK">تحويل بنكي</option>
            <option value="ACCOUNTS_PAYABLE">ذمم الموردين</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>{t('field.notes')}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ resize: 'vertical' }}
            placeholder="ملاحظات (اختياري)"
          />
        </div>
      </div>
    </Modal>
  );
}
