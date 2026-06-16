import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import ForceDeleteInvoiceModal from '../components/ForceDeleteInvoiceModal';
import { money, dateText } from '../config/modules';
import { usePersistedState } from '../hooks/usePersistedState';
import { searchLocations } from '../constants/kuwaitLocations';
import { WORK_TYPES, DEFAULT_WORK_TYPE, composeDescription, parseDescription } from '../utils/invoiceDescription';

const statusPill: Record<string, [string, string]> = {
  UNPAID: ['inv.status.unpaid', 'red'], PARTIAL: ['inv.status.partial', 'amber'], PAID: ['inv.status.paid', 'green'],
  OVERDUE: ['inv.status.overdue', 'red'], CANCELLED: ['inv.status.cancelled', 'gray'],
};

const invoiceTypes = ['نقل اسفلت', 'يومية عمل مالينج', 'يومية نقل اسفلت', 'أخرى'] as const;
const STANDARD_UNITS = ['طن', 'درب', 'معالجات', 'يومية', 'مقطوعية'] as const;
type StandardUnit = (typeof STANDARD_UNITS)[number];
const UNIT_OTHER = 'أخرى';

function unitSelectValue(unit: string): string {
  return (STANDARD_UNITS as readonly string[]).includes(unit) ? unit : UNIT_OTHER;
}
function isCustomUnit(unit: string): boolean {
  return !(STANDARD_UNITS as readonly string[]).includes(unit);
}
const INVOICE_YEAR_OPTIONS = [2024, 2025, 2026, 2027, 2028] as const;
const DEFAULT_INVOICE_YEAR = String(new Date().getFullYear());

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

function billingYearOptions(): number[] {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1, y + 2];
}

function parseInvoiceNumber(invNum: string): { year: string; suffix: string } {
  const match = invNum.match(/^MN-INV-(\d{4})-(.+)$/);
  if (match) return { year: match[1], suffix: match[2] };
  return { year: DEFAULT_INVOICE_YEAR, suffix: invNum };
}

interface Item { description: string; quantity: number; unit: string; unitPrice: number; priceTouched?: boolean; workType?: string; location?: string; }

interface InvStats { total: number; unpaid: number; unpaidAmount: number; }

type PriceOption = {
  id: number;
  asphaltPlant?: string | null;
  companyName?: string | null;
  contractLocation?: string | null;
  contractUnit: string;
  unitPrice: number;
};

export default function Invoices() {
  const { hasPermission, user } = useAuth();
  const isSystemAdmin = user?.role.name === 'SYSTEM_ADMIN';
  const { t } = useT();
  const navigate = useNavigate();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [paying, setPaying] = useState<any | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  const [forceDeleteId, setForceDeleteId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState<InvStats | null>(null);

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
    try {
      const res = await api.get('/invoices', {
        params: {
          page,
          pageSize: 15,
          search: search || undefined,
          status: statusFilter || undefined,
          direction: directionFilter || undefined,
          customerId: customerFilter || undefined,
          billingMonth: monthFilter || undefined,
          billingYear: yearFilter || undefined,
        },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, directionFilter, customerFilter, monthFilter, yearFilter]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/dashboard/executive').then((res) => {
      const inv = res.data?.data?.kpis?.invoices;
      if (inv) setStats({ total: inv.total ?? 0, unpaid: inv.unpaid ?? 0, unpaidAmount: inv.unpaidAmount ?? 0 });
    }).catch(() => { /* stats are non-critical */ });
  }, []);

  useEffect(() => {
    api.get('/customers', { params: { pageSize: 300 } })
      .then((r) => setCustomers(r.data?.data?.data ?? []))
      .catch(() => {});
  }, []);

  async function cancel(id: number) {
    if (!confirm(t('confirm.cancel_invoice'))) return;
    try { await api.patch(`/invoices/${id}/cancel`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'invoiceNumber', label: 'col.inv.number', render: (r: Record<string, unknown>) => <strong style={{ fontFamily: 'monospace' }}>{String(r.invoiceNumber ?? r.number)}</strong> },
    { key: 'invoiceType', label: 'col.inv.type', render: (r: Record<string, unknown>) => String(r.invoiceType ?? '—') },
    { key: 'direction', label: 'col.inv.direction', render: (r: Record<string, unknown>) => {
      if (r.direction === 'SALES') return t('opt.direction.sales');
      if (r.direction === 'PURCHASE') return t('opt.direction.purchase');
      return String(r.direction ?? '—');
    } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: 'party', label: 'col.inv.party', render: (r: any) => r.customer?.name ?? r.supplier?.name ?? '—' },
    { key: 'issueDate', label: 'col.date', render: (r: Record<string, unknown>) => dateText(r.issueDate) },
    { key: 'total', label: 'col.inv.total', render: (r: Record<string, unknown>) => money(r.total) },
    { key: 'paidAmount', label: 'col.inv.paid', render: (r: Record<string, unknown>) => money(r.paidAmount) },
    { key: 'status', label: 'col.status', render: (r: Record<string, unknown>) => { const [key, c] = statusPill[String(r.status)] ?? ['—', 'gray']; return <span className={`pill ${c}`}>{t(key)}</span>; } },
  ];

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.invoices.title')}</h2><p>{t('page.invoices.subtitle')}</p></div>
        {hasPermission('invoices.create') && <button className="btn" onClick={() => setCreating(true)}>＋ {t('page.invoices.create')}</button>}
      </div>

      {stats && (
        <div className="inv-stats-strip">
          <div className="inv-stat-chip">
            <span className="inv-stat-icon">📄</span>
            <span className="inv-stat-label">{t('inv.stats.total')}</span>
            <span className="inv-stat-value">{stats.total}</span>
          </div>
          <div className="inv-stat-chip red">
            <span className="inv-stat-icon">🔴</span>
            <span className="inv-stat-label">{t('inv.stats.unpaid')}</span>
            <span className="inv-stat-value">{stats.unpaid}</span>
          </div>
          <div className="inv-stat-chip amber">
            <span className="inv-stat-icon">💰</span>
            <span className="inv-stat-label">{t('inv.stats.unpaid_amount')}</span>
            <span className="inv-stat-value">{money(stats.unpaidAmount)}</span>
          </div>
        </div>
      )}

      {loadError && (
        <div className="alert error" role="alert" aria-live="assertive" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>⚠️ {loadError}</span>
          <button type="button" className="btn secondary sm" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
        </div>
      )}
      <form className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }} onSubmit={(e) => e.preventDefault()}>
        <input
          placeholder={t('page.invoices.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inp, maxWidth: 280 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          title={t('filter.status')}
          style={{ ...inp, maxWidth: 180 }}
        >
          <option value="">{t('opt.all')}</option>
          <option value="UNPAID">{t('inv.status.unpaid')}</option>
          <option value="PARTIAL">{t('inv.status.partial')}</option>
          <option value="PAID">{t('inv.status.paid')}</option>
          <option value="OVERDUE">{t('inv.status.overdue')}</option>
          <option value="CANCELLED">{t('inv.status.cancelled')}</option>
        </select>
        <select
          value={directionFilter}
          onChange={(e) => { setDirectionFilter(e.target.value); setPage(1); }}
          title={t('filter.direction')}
          style={{ ...inp, maxWidth: 180 }}
        >
          <option value="">{t('opt.all')}</option>
          <option value="SALES">{t('opt.direction.sales')}</option>
          <option value="PURCHASE">{t('opt.direction.purchase')}</option>
        </select>
        <select
          value={customerFilter}
          onChange={(e) => { setCustomerFilter(e.target.value); setPage(1); }}
          title="الجهة"
          style={{ ...inp, maxWidth: 200 }}
        >
          <option value="">الجهة — الكل</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={monthFilter}
          onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }}
          title="شهر الفوترة"
          style={{ ...inp, maxWidth: 140 }}
        >
          <option value="">الشهر — الكل</option>
          {ARABIC_MONTHS.map((name, idx) => <option key={idx + 1} value={idx + 1}>{name}</option>)}
        </select>
        <select
          value={yearFilter}
          onChange={(e) => { setYearFilter(e.target.value); setPage(1); }}
          title="سنة الفوترة"
          style={{ ...inp, maxWidth: 100 }}
        >
          <option value="">السنة — الكل</option>
          {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {isFiltered && (
          <button type="button" className="btn secondary sm" onClick={resetFilters}>
            {t('action.reset_filters')}
          </button>
        )}
        <button type="button" className="btn secondary" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        emptyText={t('empty.invoices')}
        isFiltered={isFiltered}
        onResetFilters={resetFilters}
        emptyAction={hasPermission('invoices.create') ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t('page.invoices.create')}</button>
        ) : undefined}
        actions={(row) => (
          <>
            {hasPermission('invoices.read') && (
              <button type="button" className="btn secondary sm" onClick={() => navigate(`/invoices/${row.id}/preview?print=1`)}>{t('btn.inv.print_invoice')}</button>
            )}{' '}
            {hasPermission('invoices.update') && (row.status === 'UNPAID' || (row.status === 'OVERDUE' && Number(row.paidAmount) === 0)) && (
              <button type="button" className="btn secondary sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>
            )}{' '}
            {hasPermission('invoices.update') && row.status !== 'PAID' && row.status !== 'CANCELLED' && (
              <button className="btn sm" onClick={() => setPaying(row)}>{t('page.invoices.collect')}</button>
            )}{' '}
            {hasPermission('invoices.update') && row.status !== 'CANCELLED' && Number(row.paidAmount) === 0 && (
              <button className="btn secondary sm" onClick={() => cancel(row.id)}>{t('page.invoices.cancel_inv')}</button>
            )}{' '}
            {isSystemAdmin && (
              <button type="button" className="btn danger sm" title="حذف نهائي" style={{ padding: '4px 8px', lineHeight: 1 }} onClick={() => setForceDeleteId(row.id as number)}>🗑️</button>
            )}
          </>
        )}
      />

      {creating && <CreateInvoice onClose={() => setCreating(false)} onSaved={load} />}
      {editing && <EditInvoice invoice={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {paying && <AddPayment invoice={paying} onClose={() => setPaying(null)} onSaved={load} />}
      {forceDeleteId !== null && (
        <ForceDeleteInvoiceModal
          invoiceId={forceDeleteId}
          onClose={() => setForceDeleteId(null)}
          onDeleted={() => { setForceDeleteId(null); load(); }}
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
  const [items, setItems] = useState<Item[]>([{ description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' }]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState<PriceOption[]>([]);
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null);
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
      setItems((prev) => prev.map((it) => it.priceTouched ? { ...it, unitPrice: 0, priceTouched: false } : it));
    }
    prevPartyIdRef.current = partyId;

    if (effectivePartySource !== 'SALES' || !partyId) {
      setPrices([]);
      return;
    }
    api.get('/prices', { params: { pageSize: 200, customerId: partyId } })
      .then((res) => setPrices(res.data?.data?.data ?? []))
      .catch((e) => { console.warn('[CreateInvoice] prices fetch failed:', e); });
  }, [partyId, effectivePartySource]);

  useEffect(() => {
    if (openPickerIdx === null) return;
    function handleOutsideClick() { setOpenPickerIdx(null); }
    function handleEscape(e: KeyboardEvent) { if (e.key === 'Escape') setOpenPickerIdx(null); }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openPickerIdx]);

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
        setItems((prev) =>
          prev.map((it, idx) => {
            if (idx !== i) return it;
            return { ...it, unit: isCustomUnit(it.unit) ? it.unit : '' };
          })
        );
        return;
      }
      setItems((prev) =>
        prev.map((it, idx) => {
          if (idx !== i) return it;
          const base = { ...it, unit: newUnit };
          if (!it.priceTouched) {
            const matches = prices.filter((p) => p.contractUnit === newUnit);
            if (matches.length === 1) return { ...base, unitPrice: matches[0].unitPrice };
          }
          return base;
        })
      );
      return;
    }
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        const priceTouched = key === 'unitPrice' ? true : it.priceTouched;
        return { ...it, [key]: key === 'description' ? String(value) : Number(value), priceTouched };
      })
    );
  }

  function applyPrice(i: number, price: PriceOption) {
    setItems((p) => p.map((it, idx) => idx === i ? { ...it, unitPrice: price.unitPrice, unit: price.contractUnit, priceTouched: true } : it));
    setOpenPickerIdx(null);
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
        items: items.map((it) => ({ description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice })),
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
    <Modal title={t('modal.new_invoice')} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('btn.save_invoice')}</button>
        <button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
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
              style={{ ...inp, borderRadius: '10px 0 0 10px', borderInlineEnd: 0, background: 'var(--surface-2)', whiteSpace: 'nowrap' }}
            >
              {INVOICE_YEAR_OPTIONS.map((y) => (
                <option key={y} value={String(y)}>MN-INV-{y}</option>
              ))}
            </select>
            <input
              value={invoiceNumberSuffix}
              onChange={(e) => setInvoiceNumberSuffix(e.target.value)}
              placeholder="001"
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
            style={inp}
          />
        </div>
        <div className="field">
          <label>تاريخ التسليم</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            title="تاريخ تسليم الفاتورة"
            style={inp}
          />
        </div>
        <div className="field">
          <label>حساب شهر</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={billingMonth}
              onChange={(e) => setBillingMonth(Number(e.target.value))}
              title="شهر الحساب"
              style={{ ...inp, flex: 1 }}
            >
              {ARABIC_MONTHS.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>
            <select
              value={billingYear}
              onChange={(e) => setBillingYear(Number(e.target.value))}
              title="سنة الحساب"
              style={{ ...inp, width: 90 }}
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
              style={inp}
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
                style={inp}
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
      </div>

      <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>{t('lbl.items')}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 4, padding: '0 2px' }}>
        {['البنود', 'الكمية', 'الوحدة', 'السعر', 'الإجمالي'].map((h) => (
          <div key={h} style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{h}</div>
        ))}
        <div />
      </div>
      {effectivePartySource === 'SALES' && partyId && prices.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', fontStyle: 'italic' }}>
          لا توجد أسعار معرفة لهذا العميل
        </p>
      )}
      {items.map((it, i) => (
        <div key={i} className="invoice-item-row" style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'start', width: '100%' }}>
          <div className="invoice-cell description-cell" style={{ minWidth: 0, overflow: 'visible' }}>
            <select
              value={it.workType ?? DEFAULT_WORK_TYPE}
              onChange={(e) => setItem(i, 'workType', e.target.value)}
              title="نوع العمل"
              style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box', marginBottom: 4 }}
            >
              {(WORK_TYPES as readonly string[]).map((wt) => <option key={wt} value={wt}>{wt}</option>)}
            </select>
            <LocationAutocomplete value={it.location ?? ''} onChange={(v) => setItem(i, 'location', v)} />
          </div>
          <div className="invoice-cell quantity-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <input type="number" min="0.001" step="0.001" placeholder={t('ph.qty')} value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
          </div>
          <div className="invoice-cell unit-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <select
              value={unitSelectValue(it.unit)}
              onChange={(e) => setItem(i, 'unit', e.target.value)}
              title="الوحدة"
              style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
            >
              {(STANDARD_UNITS as readonly string[]).map((u) => <option key={u} value={u}>{u}</option>)}
              <option value={UNIT_OTHER}>{UNIT_OTHER}</option>
            </select>
            {unitSelectValue(it.unit) === UNIT_OTHER && (
              <input
                value={it.unit}
                onChange={(e) => setItem(i, 'unit', e.target.value)}
                placeholder="اكتب الوحدة"
                style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box', marginTop: 4 }}
              />
            )}
          </div>
          <div className="invoice-cell price-cell" style={{ minWidth: 0, overflow: 'visible', position: 'relative' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="number" min="0" step="0.001" placeholder={t('ph.unit_price')} value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} style={{ ...inp, flex: 1, minWidth: 0, boxSizing: 'border-box' }} />
              {(() => { const unitPrices = prices.filter((p) => p.contractUnit === it.unit); return unitPrices.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="btn secondary sm"
                    style={{ flexShrink: 0, padding: '0 8px', fontSize: 14 }}
                    title={t('ph.prices.picker_btn')}
                    aria-label={t('ph.prices.picker_btn')}
                    aria-haspopup="listbox"
                    aria-expanded={openPickerIdx === i ? 'true' : 'false'}
                    onClick={(e) => { e.stopPropagation(); setOpenPickerIdx(openPickerIdx === i ? null : i); }}
                  >
                    📋
                  </button>
                  {openPickerIdx === i && (
                    <div
                      role="listbox"
                      aria-label={t('ph.prices.picker_list')}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ position: 'absolute', top: '100%', insetInlineStart: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 200, minWidth: 300, maxHeight: 260, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,.18)', marginTop: 2 }}
                    >
                      <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontWeight: 700, userSelect: 'none' }}>
                        {t('ph.prices.picker_unit')}: {it.unit}
                      </div>
                      {unitPrices.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected="false"
                          style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', lineHeight: 1.5 }}
                          onClick={() => applyPrice(i, p)}
                        >
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
            <div style={{ ...inp, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default', width: '100%', boxSizing: 'border-box' }}>{money(lineTotal(it))}</div>
          </div>
          <div className="invoice-cell delete-cell" style={{ minWidth: 0 }}>
            {items.length > 1 && (
              <button
                className="btn secondary sm"
                type="button"
                onClick={() => { if (openPickerIdx === i) setOpenPickerIdx(null); setItems((p) => p.filter((_, idx) => idx !== i)); }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
      <button className="btn secondary sm" type="button" onClick={() => setItems((p) => [...p, { description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' }])}>{t('btn.inv.add_material')}</button>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label>{t('field.inv.discount_kd')}</label><input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
        <div className="field"><label>{t('col.inv.total')}</label><div style={{ ...inp, display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default' }}>{money(total)}</div></div>
      </div>
    </Modal>
  );
}

const inp: React.CSSProperties = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, outline: 'none' };

// ===== Creatable autocomplete للمنطقة / الموقع =====
// يقبل نصاً حراً أو اختياراً من القائمة — القيمة المُدخلة تبقى دائماً.
function LocationAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<{ name: string }[]>([]);
  const [open, setOpen] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    const found = searchLocations(v);
    setSuggestions(found);
    setOpen(found.length > 0);
  }

  function pick(name: string) {
    onChange(name);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        placeholder="المنطقة / الموقع"
        value={value}
        onChange={handleChange}
        onFocus={() => { if (value.trim().length >= 2 && suggestions.length > 0) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', insetInlineEnd: 0, insetInlineStart: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 300, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,.18)' }}>
          {suggestions.map((loc) => (
            <button
              key={loc.name}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(loc.name); }}
              style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)' }}
            >
              {loc.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

  const [items, setItems] = useState<Item[]>([{ description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' }]);
  const [deliveryDate, setDeliveryDate] = useState<string>(
    invoice.deliveryDate ? String(invoice.deliveryDate).slice(0, 10) : ''
  );
  const [discount, setDiscount] = useState<number>(Number(invoice.discount) || 0);
  const [notes, setNotes] = useState<string>(invoice.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState<PriceOption[]>([]);
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const submittingRef = useRef(false);
  const [loadError, setLoadError] = useState('');

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
        return { description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice, workType, location };
      }));
      setDiscount(Number(inv.discount));
      setNotes(inv.notes ?? '');
      if (inv.issueDate) setIssueDate(String(inv.issueDate).slice(0, 10));
      if (inv.billingMonth) setBillingMonth(Number(inv.billingMonth));
      if (inv.billingYear) setBillingYear(Number(inv.billingYear));
      if (inv.deliveryDate) setDeliveryDate(String(inv.deliveryDate).slice(0, 10));
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
      setItems((prev) => prev.map((it) => it.priceTouched ? { ...it, unitPrice: 0, priceTouched: false } : it));
    }
    prevPartyIdRef.current = partyId;

    if (effectivePartySource !== 'SALES' || !partyId) {
      setPrices([]);
      return;
    }
    api.get('/prices', { params: { pageSize: 200, customerId: partyId } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res: any) => setPrices(res.data?.data?.data ?? []))
      .catch((e: unknown) => { console.warn('[EditInvoice] prices fetch failed:', e); });
  }, [partyId, effectivePartySource]);

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
          const matches = prices.filter((p) => p.contractUnit === newUnit);
          if (matches.length === 1) return { ...base, unitPrice: matches[0].unitPrice };
        }
        return base;
      }));
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
        items: items.map((it) => ({ description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice })),
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
    <Modal title={t('modal.edit_invoice')} onClose={onClose} footer={<button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>}>
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{t('msg.loading')}</div>
    </Modal>
  );

  if (loadError) return (
    <Modal title={t('modal.edit_invoice')} onClose={onClose} footer={<button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>}>
      <div className="alert error">⚠️ {loadError}</div>
    </Modal>
  );

  return (
    <Modal title={`${t('modal.edit_invoice')} — ${String(invoice.invoiceNumber ?? invoice.number)}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
        <button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
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
              style={{ ...inp, borderRadius: '10px 0 0 10px', borderInlineEnd: 0, background: 'var(--surface-2)', whiteSpace: 'nowrap' }}
            >
              {INVOICE_YEAR_OPTIONS.map((y) => (
                <option key={y} value={String(y)}>MN-INV-{y}</option>
              ))}
            </select>
            <input
              value={invoiceNumberSuffix}
              onChange={(e) => setInvoiceNumberSuffix(e.target.value)}
              placeholder="001"
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
          }} title="تاريخ الفاتورة" style={inp} />
        </div>
        <div className="field">
          <label>تاريخ التسليم</label>
          <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} title="تاريخ تسليم الفاتورة" style={inp} />
        </div>
        <div className="field">
          <label>حساب شهر</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={billingMonth} onChange={(e) => setBillingMonth(Number(e.target.value))} title="شهر الحساب" style={{ ...inp, flex: 1 }}>
              {ARABIC_MONTHS.map((name, idx) => <option key={idx + 1} value={idx + 1}>{name}</option>)}
            </select>
            <select value={billingYear} onChange={(e) => setBillingYear(Number(e.target.value))} title="سنة الحساب" style={{ ...inp, width: 90 }}>
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
            <input value={customInvoiceType} onChange={(e) => setCustomInvoiceType(e.target.value)} placeholder={t('ph.inv.custom_type')} style={inp} />
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
              <input value={customDirection} onChange={(e) => setCustomDirection(e.target.value)} placeholder={t('ph.inv.custom_direction')} style={inp} />
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
      </div>

      <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>{t('lbl.items')}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 4, padding: '0 2px' }}>
        {['البنود', 'الكمية', 'الوحدة', 'السعر', 'الإجمالي'].map((h) => (
          <div key={h} style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{h}</div>
        ))}
        <div />
      </div>
      {effectivePartySource === 'SALES' && partyId && prices.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', fontStyle: 'italic' }}>
          لا توجد أسعار معرفة لهذا العميل
        </p>
      )}
      {items.map((it, i) => (
        <div key={i} className="invoice-item-row" style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'start', width: '100%' }}>
          <div className="invoice-cell description-cell" style={{ minWidth: 0, overflow: 'visible' }}>
            <select
              value={it.workType ?? DEFAULT_WORK_TYPE}
              onChange={(e) => setItem(i, 'workType', e.target.value)}
              title="نوع العمل"
              style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box', marginBottom: 4 }}
            >
              {(WORK_TYPES as readonly string[]).map((wt) => <option key={wt} value={wt}>{wt}</option>)}
            </select>
            <LocationAutocomplete value={it.location ?? ''} onChange={(v) => setItem(i, 'location', v)} />
          </div>
          <div className="invoice-cell quantity-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <input type="number" min="0.001" step="0.001" placeholder={t('ph.qty')} value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
          </div>
          <div className="invoice-cell unit-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <select value={unitSelectValue(it.unit)} onChange={(e) => setItem(i, 'unit', e.target.value)} title="الوحدة" style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
              {(STANDARD_UNITS as readonly string[]).map((u) => <option key={u} value={u}>{u}</option>)}
              <option value={UNIT_OTHER}>{UNIT_OTHER}</option>
            </select>
            {unitSelectValue(it.unit) === UNIT_OTHER && (
              <input value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} placeholder="اكتب الوحدة" style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box', marginTop: 4 }} />
            )}
          </div>
          <div className="invoice-cell price-cell" style={{ minWidth: 0, overflow: 'visible', position: 'relative' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="number" min="0" step="0.001" placeholder={t('ph.unit_price')} value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} style={{ ...inp, flex: 1, minWidth: 0, boxSizing: 'border-box' }} />
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
            <div style={{ ...inp, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default', width: '100%', boxSizing: 'border-box' }}>{money(lineTotal(it))}</div>
          </div>
          <div className="invoice-cell delete-cell" style={{ minWidth: 0 }}>
            {items.length > 1 && (
              <button className="btn secondary sm" type="button" onClick={() => { if (openPickerIdx === i) setOpenPickerIdx(null); setItems((p) => p.filter((_, idx) => idx !== i)); }}>✕</button>
            )}
          </div>
        </div>
      ))}
      <button className="btn secondary sm" type="button" onClick={() => setItems((p) => [...p, { description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' }])}>{t('btn.inv.add_material')}</button>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label>{t('field.inv.discount_kd')}</label><input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
        <div className="field"><label>{t('col.inv.total')}</label><div style={{ ...inp, display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default' }}>{money(total)}</div></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>{t('field.notes')}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inp, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} placeholder={t('field.notes')} />
        </div>
      </div>
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

  async function submit() {
    setError('');
    setSaving(true);
    try {
      await api.post(`/invoices/${invoice.id}/payments`, { amount: Number(amount), method });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${t('modal.collect_payment')} — ${invoice.invoiceNumber ?? invoice.number}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('btn.record_payment')}</button>
        <button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontWeight: 600 }}>{t('lbl.remaining')} {money(remaining)}</p>
      <div className="form-grid">
        <div className="field"><label>{t('field.amount_kd')}</label><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <div className="field">
          <label>{t('field.payment_method')}</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">{t('opt.payment.cash')}</option>
            <option value="BANK">{t('opt.payment.bank')}</option>
            <option value="CHEQUE">{t('opt.payment.cheque')}</option>
            <option value="TRANSFER">{t('opt.payment.transfer')}</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
