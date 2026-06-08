import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import { money, dateText } from '../config/modules';

const statusPill: Record<string, [string, string]> = {
  UNPAID: ['غير مدفوعة', 'red'], PARTIAL: ['جزئية', 'amber'], PAID: ['مدفوعة', 'green'],
  OVERDUE: ['متأخرة', 'red'], CANCELLED: ['ملغاة', 'gray'],
};

const invoiceTypes = ['نقل اسفلت', 'يومية عمل مالينج', 'يومية نقل اسفلت'] as const;
const units = ['طن', 'درب', 'يومية'] as const;
const invoicePrefix = 'MN-INV-2026-';

interface Item { description: string; quantity: number; unit: string; unitPrice: number; }

export default function Invoices() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [paying, setPaying] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/invoices', { params: { page, pageSize: 15, search: search || undefined } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search]);
  useEffect(() => { load(); }, [load]);

  async function cancel(id: number) {
    if (!confirm('إلغاء هذه الفاتورة؟')) return;
    try { await api.patch(`/invoices/${id}/cancel`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'invoiceNumber', label: 'col.inv.number', render: (r: Record<string, unknown>) => <strong style={{ fontFamily: 'monospace' }}>{String(r.invoiceNumber ?? r.number)}</strong> },
    { key: 'invoiceType', label: 'col.inv.type', render: (r: Record<string, unknown>) => String(r.invoiceType ?? '—') },
    { key: 'direction', label: 'col.inv.direction', render: (r: Record<string, unknown>) => (r.direction === 'SALES' ? 'مبيعات' : 'مشتريات') },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: 'party', label: 'col.inv.party', render: (r: any) => r.customer?.name ?? r.supplier?.name ?? '—' },
    { key: 'issueDate', label: 'col.date', render: (r: Record<string, unknown>) => dateText(r.issueDate) },
    { key: 'total', label: 'col.inv.total', render: (r: Record<string, unknown>) => money(r.total) },
    { key: 'paidAmount', label: 'col.inv.paid', render: (r: Record<string, unknown>) => money(r.paidAmount) },
    { key: 'status', label: 'col.status', render: (r: Record<string, unknown>) => { const [l, c] = statusPill[String(r.status)] ?? ['—', 'gray']; return <span className={`pill ${c}`}>{l}</span>; } },
  ];

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.invoices.title')}</h2><p>{t('page.invoices.subtitle')}</p></div>
        {hasPermission('invoices.create') && <button className="btn" onClick={() => setCreating(true)}>＋ {t('page.invoices.create')}</button>}
      </div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input
          placeholder={t('page.invoices.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inp, maxWidth: 280 }}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        actions={(row) => (
          <>
            {hasPermission('invoices.update') && row.status !== 'PAID' && row.status !== 'CANCELLED' && (
              <button className="btn sm" onClick={() => setPaying(row)}>{t('page.invoices.collect')}</button>
            )}{' '}
            {hasPermission('invoices.update') && row.status !== 'CANCELLED' && Number(row.paidAmount) === 0 && (
              <button className="btn secondary sm" onClick={() => cancel(row.id)}>{t('page.invoices.cancel_inv')}</button>
            )}
          </>
        )}
      />

      {creating && <CreateInvoice onClose={() => setCreating(false)} onSaved={load} />}
      {paying && <AddPayment invoice={paying} onClose={() => setPaying(null)} onSaved={load} />}
    </div>
  );
}

// ===== إنشاء فاتورة =====
function CreateInvoice({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [invoiceNumberSuffix, setInvoiceNumberSuffix] = useState('');
  const [direction, setDirection] = useState('SALES');
  const [invoiceType, setInvoiceType] = useState<(typeof invoiceTypes)[number]>('نقل اسفلت');
  const [partyId, setPartyId] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parties, setParties] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([{ description: '', quantity: 1, unit: 'طن', unitPrice: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const ep = direction === 'SALES' ? '/customers' : '/suppliers';
      const res = await api.get(ep, { params: { pageSize: 200 } });
      setParties(res.data.data.data ?? []);
      setPartyId('');
    })();
  }, [direction]);

  const lineTotal = (it: Item) => Number(it.quantity) * Number(it.unitPrice);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const total = Math.max(0, subtotal - Number(discount));

  function setItem(i: number, key: keyof Item, value: string) {
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [key]: key === 'description' || key === 'unit' ? value : Number(value) } : it)));
  }

  async function submit() {
    setError('');
    const invoiceNumber = `${invoicePrefix}${invoiceNumberSuffix.trim()}`;
    if (!invoiceNumberSuffix.trim()) { setError('رقم الفاتورة مطلوب'); return; }
    if (!partyId) { setError(direction === 'SALES' ? 'اختر العميل' : 'اختر المورّد'); return; }
    if (items.some((it) => !it.description)) { setError('أكمل وصف كل البنود'); return; }
    if (items.some((it) => !it.unit)) { setError('اختر وحدة لكل بند'); return; }
    if (items.some((it) => Number(it.quantity) <= 0)) { setError('الكمية يجب أن تكون أكبر من صفر'); return; }
    if (items.some((it) => Number(it.unitPrice) < 0)) { setError('سعر الوحدة يجب ألا يكون سالبًا'); return; }
    setSaving(true);
    try {
      await api.post('/invoices', {
        invoiceNumber,
        direction,
        invoiceType,
        customerId: direction === 'SALES' ? Number(partyId) : undefined,
        supplierId: direction === 'PURCHASE' ? Number(partyId) : undefined,
        discount: Number(discount),
        items,
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
    <Modal title="فاتورة جديدة" onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ الفاتورة'}</button>
        <button className="btn secondary" onClick={onClose}>إلغاء</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>رقم الفاتورة *</label>
          <div style={{ display: 'flex', alignItems: 'center', direction: 'ltr' }}>
            <span style={{ ...inp, borderRadius: '10px 0 0 10px', borderInlineEnd: 0, background: 'var(--surface-2)', whiteSpace: 'nowrap' }}>{invoicePrefix}</span>
            <input
              value={invoiceNumberSuffix}
              onChange={(e) => setInvoiceNumberSuffix(e.target.value)}
              placeholder="001"
              style={{ borderRadius: '0 10px 10px 0', direction: 'ltr' }}
            />
          </div>
        </div>
        <div className="field">
          <label>نوع الفاتورة</label>
          <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as (typeof invoiceTypes)[number])}>
            {invoiceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div className="field">
          <label>الاتجاه</label>
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="SALES">مبيعات (عميل)</option>
            <option value="PURCHASE">مشتريات (مورّد)</option>
          </select>
        </div>
        <div className="field">
          <label>{direction === 'SALES' ? 'العميل' : 'المورّد'} *</label>
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">— اختر —</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>البنود</label>
      {items.map((it, i) => (
        <div key={i} className="invoice-item-row" style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center', width: '100%', overflow: 'hidden' }}>
          <div className="invoice-cell description-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <input placeholder="الوصف" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
          </div>
          <div className="invoice-cell quantity-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <input type="number" min="0.001" step="0.001" placeholder="الكمية" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
          </div>
          <div className="invoice-cell unit-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <select value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
              {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </div>
          <div className="invoice-cell price-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <input type="number" min="0" step="0.001" placeholder="سعر الوحدة" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
          </div>
          <div className="invoice-cell total-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ ...inp, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default', width: '100%', boxSizing: 'border-box' }}>{money(lineTotal(it))}</div>
          </div>
          <div className="invoice-cell delete-cell" style={{ minWidth: 0 }}>
            {items.length > 1 && (
              <button
                className="btn secondary sm"
                type="button"
                onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
              >
                x
              </button>
            )}
          </div>
        </div>
      ))}
      <button className="btn secondary sm" type="button" onClick={() => setItems((p) => [...p, { description: '', quantity: 1, unit: 'طن', unitPrice: 0 }])}>＋ إضافة بند</button>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label>الخصم (د.ك)</label><input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
        <div className="field"><label>الإجمالي</label><div style={{ ...inp, display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default' }}>{money(total)}</div></div>
      </div>
    </Modal>
  );
}

const inp: React.CSSProperties = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, outline: 'none' };

// ===== تسجيل دفعة =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AddPayment({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: () => void }) {
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
    <Modal title={`تحصيل — ${invoice.invoiceNumber ?? invoice.number}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? 'جارٍ…' : 'تسجيل الدفعة'}</button>
        <button className="btn secondary" onClick={onClose}>إلغاء</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontWeight: 600 }}>المتبقي: {money(remaining)}</p>
      <div className="form-grid">
        <div className="field"><label>المبلغ (د.ك)</label><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <div className="field">
          <label>طريقة الدفع</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">نقدًا</option><option value="BANK">بنك</option><option value="CHEQUE">شيك</option><option value="TRANSFER">تحويل</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
