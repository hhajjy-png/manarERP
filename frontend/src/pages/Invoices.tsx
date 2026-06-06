import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import { money, dateText } from '../config/modules';

const statusPill: Record<string, [string, string]> = {
  UNPAID: ['غير مدفوعة', 'red'], PARTIAL: ['جزئية', 'amber'], PAID: ['مدفوعة', 'green'],
  OVERDUE: ['متأخرة', 'red'], CANCELLED: ['ملغاة', 'gray'],
};

interface Item { description: string; quantity: number; unitPrice: number; }

export default function Invoices() {
  const { hasPermission } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [paying, setPaying] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/invoices', { params: { page, pageSize: 15 } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => { load(); }, [load]);

  async function cancel(id: number) {
    if (!confirm('إلغاء هذه الفاتورة؟')) return;
    try { await api.patch(`/invoices/${id}/cancel`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'number', label: 'رقم الفاتورة', render: (r: Record<string, unknown>) => <strong style={{ fontFamily: 'monospace' }}>{String(r.number)}</strong> },
    { key: 'direction', label: 'النوع', render: (r: Record<string, unknown>) => (r.direction === 'SALES' ? 'مبيعات' : 'مشتريات') },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: 'party', label: 'الجهة', render: (r: any) => r.customer?.name ?? r.supplier?.name ?? '—' },
    { key: 'issueDate', label: 'التاريخ', render: (r: Record<string, unknown>) => dateText(r.issueDate) },
    { key: 'total', label: 'الإجمالي', render: (r: Record<string, unknown>) => money(r.total) },
    { key: 'paidAmount', label: 'المسدّد', render: (r: Record<string, unknown>) => money(r.paidAmount) },
    { key: 'status', label: 'الحالة', render: (r: Record<string, unknown>) => { const [l, c] = statusPill[String(r.status)] ?? ['—', 'gray']; return <span className={`pill ${c}`}>{l}</span>; } },
  ];

  return (
    <div>
      <div className="page-head">
        <div><h2>الفواتير والمطالبات</h2><p>إصدار الفواتير ومتابعة التحصيل</p></div>
        {hasPermission('invoices.create') && <button className="btn" onClick={() => setCreating(true)}>＋ فاتورة جديدة</button>}
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
              <button className="btn sm" onClick={() => setPaying(row)}>تحصيل</button>
            )}{' '}
            {hasPermission('invoices.update') && row.status !== 'CANCELLED' && Number(row.paidAmount) === 0 && (
              <button className="btn secondary sm" onClick={() => cancel(row.id)}>إلغاء</button>
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
  const [direction, setDirection] = useState('SALES');
  const [partyId, setPartyId] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parties, setParties] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
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

  const subtotal = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0);
  const total = Math.max(0, subtotal - Number(discount));

  function setItem(i: number, key: keyof Item, value: string) {
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [key]: key === 'description' ? value : Number(value) } : it)));
  }

  async function submit() {
    setError('');
    if (!partyId) { setError(direction === 'SALES' ? 'اختر العميل' : 'اختر المورّد'); return; }
    if (items.some((it) => !it.description)) { setError('أكمل وصف كل البنود'); return; }
    setSaving(true);
    try {
      await api.post('/invoices', {
        direction,
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
          <label>نوع الفاتورة</label>
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
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
          <input placeholder="الوصف" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} style={inp} />
          <input type="number" placeholder="الكمية" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} style={inp} />
          <input type="number" placeholder="سعر الوحدة" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} style={inp} />
          <button className="btn secondary sm" type="button" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} disabled={items.length === 1}>✕</button>
        </div>
      ))}
      <button className="btn secondary sm" type="button" onClick={() => setItems((p) => [...p, { description: '', quantity: 1, unitPrice: 0 }])}>＋ إضافة بند</button>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label>الخصم (د.ك)</label><input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
        <div className="field"><label>الإجمالي</label><input value={money(total)} disabled /></div>
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
    <Modal title={`تحصيل — ${invoice.number}`} onClose={onClose} footer={
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
