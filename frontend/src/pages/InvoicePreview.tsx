import { CSSProperties, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { money, dateText } from '../config/modules';
import { useT } from '../lib/i18n';

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const PAY_METHOD_AR: Record<string, string> = {
  CASH: 'نقدًا', BANK: 'بنك', CHEQUE: 'شيك', TRANSFER: 'تحويل',
};

type InvItem = { id: number; description: string; quantity: number; unit: string; unitPrice: number; total: number; };
type Payment = { id: number; amount: number; method: string; date: string; reference?: string | null; };
type FullInvoice = {
  id: number;
  invoiceNumber: string;
  number: string;
  direction: string;
  invoiceType: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  billingMonth?: number | null;
  billingYear?: number | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  paidAmount: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: number; name: string } | null;
  supplier?: { id: number; name: string } | null;
  contract?: { id: number; asphaltPlant: string } | null;
  items: InvItem[];
  payments: Payment[];
};

const th: CSSProperties = {
  border: '1px solid #cbd5e1', padding: '8px 12px', background: '#1d4e6f', color: '#fff',
  textAlign: 'start', fontWeight: 700, fontSize: 13,
  WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
};
const td: CSSProperties = { border: '1px solid #e2e8f0', padding: '7px 12px', fontSize: 13 };
const secTitle: CSSProperties = {
  fontSize: 14, fontWeight: 800, color: '#1d4e6f',
  borderBottom: '2px solid #1d4e6f', paddingBottom: 6, marginBottom: 12, marginTop: 22,
};
const fRow: CSSProperties = { display: 'flex', gap: 8, marginBottom: 8, fontSize: 13 };
const fLbl: CSSProperties = { color: '#64748b', fontWeight: 600, minWidth: 130 };
const fVal: CSSProperties = { fontWeight: 700, color: '#0f172a' };

export default function InvoicePreview() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useT();
  const { hasPermission } = useAuth();

  const [data, setData] = useState<FullInvoice | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [paying, setPaying] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payError, setPayError] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  const autoPrint = searchParams.get('print') === '1';
  const printFiredRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    api.get(`/invoices/${id}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setLoadError(errorMessage(e)));
  }, [id]);

  useEffect(() => {
    if (data && autoPrint && !printFiredRef.current) {
      printFiredRef.current = true;
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [data, autoPrint]);

  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Cairo', sans-serif" }}>
        <p style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {loadError}</p>
        <button className="btn secondary" onClick={() => navigate('/invoices')} style={{ marginTop: 16 }}>
          ← {t('btn.inv.back')}
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: "'Cairo', sans-serif" }}>
        <div className="spinner" />
        <p style={{ marginTop: 12, color: '#64748b' }}>{t('msg.loading')}</p>
      </div>
    );
  }

  const remaining = Number(data.total) - Number(data.paidAmount);
  const canEdit = data.status === 'UNPAID' || (data.status === 'OVERDUE' && Number(data.paidAmount) === 0);
  const canCollect = data.status !== 'PAID' && data.status !== 'CANCELLED';
  const canCancel = data.status !== 'CANCELLED' && Number(data.paidAmount) === 0;

  const partyName = data.customer?.name ?? data.supplier?.name ?? '—';
  const billingPeriod = data.billingMonth && data.billingYear
    ? `${ARABIC_MONTHS[data.billingMonth - 1]} ${data.billingYear}`
    : '—';
  const directionLabel = data.direction === 'SALES'
    ? t('opt.direction.sales') : data.direction === 'PURCHASE'
    ? t('opt.direction.purchase') : data.direction;

  async function handleCancel() {
    if (!confirm(t('confirm.cancel_invoice'))) return;
    setActionError('');
    try {
      await api.patch(`/invoices/${data!.id}/cancel`);
      const res = await api.get(`/invoices/${data!.id}`);
      setData(res.data.data);
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function handleCollect() {
    setPayError('');
    setPaySaving(true);
    try {
      await api.post(`/invoices/${data!.id}/payments`, { amount: Number(payAmount), method: payMethod });
      const res = await api.get(`/invoices/${data!.id}`);
      setData(res.data.data);
      setPaying(false);
    } catch (e) {
      setPayError(errorMessage(e));
    } finally {
      setPaySaving(false);
    }
  }

  return (
    <>
      <style>{`
        @media screen { .inv-wrap { min-height: 100vh; } }
        @media print {
          @page { size: A4; margin: 10mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    <div className="inv-wrap" style={{
      padding: '24px 32px', fontFamily: "'Cairo', sans-serif",
      maxWidth: 900, margin: '0 auto', color: '#0f172a',
      background: '#fff', direction: 'rtl',
    }}>

      {/* ── Toolbar (hidden on print) ── */}
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn secondary" onClick={() => navigate('/invoices')}>
          ← {t('btn.inv.back')}
        </button>
        <button type="button" className="btn" onClick={() => window.print()}>
          {t('btn.inv.print_invoice')}
        </button>
        {hasPermission('invoices.update') && canEdit && (
          <button type="button" className="btn secondary" onClick={() => navigate('/invoices')}>
            {t('action.edit')}
          </button>
        )}
        {hasPermission('invoices.update') && canCollect && !paying && (
          <button type="button" className="btn" onClick={() => { setPayAmount(remaining); setPayError(''); setPaying(true); }}>
            {t('page.invoices.collect')}
          </button>
        )}
        {hasPermission('invoices.update') && canCancel && (
          <button type="button" className="btn secondary" onClick={handleCancel}>
            {t('page.invoices.cancel_inv')}
          </button>
        )}
        {actionError && <span style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>⚠️ {actionError}</span>}
      </div>

      {/* ── Inline payment form (hidden on print) ── */}
      {paying && (
        <div className="no-print" style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 16, marginBottom: 20, maxWidth: 440,
        }}>
          <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>
            {t('modal.collect_payment')} — {t('lbl.remaining')} {money(remaining)}
          </p>
          {payError && <div className="alert error" style={{ marginBottom: 8 }}>⚠️ {payError}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('field.amount_kd')}</label>
              <input
                type="number" step="0.001" value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, width: 130 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('field.payment_method')}</label>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
                <option value="CASH">{t('opt.payment.cash')}</option>
                <option value="BANK">{t('opt.payment.bank')}</option>
                <option value="CHEQUE">{t('opt.payment.cheque')}</option>
                <option value="TRANSFER">{t('opt.payment.transfer')}</option>
              </select>
            </div>
            <button type="button" className="btn" onClick={handleCollect} disabled={paySaving}>
              {paySaving ? t('msg.saving') : t('btn.record_payment')}
            </button>
            <button type="button" className="btn secondary" onClick={() => setPaying(false)}>{t('action.cancel')}</button>
          </div>
        </div>
      )}

      {/* ── Section 1: Invoice Details ── */}
      <div style={secTitle}>{t('page.invoice_preview.section.header')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
        <div style={fRow}><span style={fLbl}>{t('col.inv.number')}</span><span style={{ ...fVal, fontFamily: 'monospace' }}>{data.invoiceNumber ?? data.number}</span></div>
        <div style={fRow}><span style={fLbl}>{t('lbl.inv.issue_date')}</span><span style={fVal}>{dateText(data.issueDate)}</span></div>
        <div style={fRow}><span style={fLbl}>{t('col.inv.direction')}</span><span style={fVal}>{directionLabel}</span></div>
        <div style={fRow}><span style={fLbl}>{t('lbl.inv.billing_period')}</span><span style={fVal}>{billingPeriod}</span></div>
        <div style={fRow}><span style={fLbl}>{t('col.inv.type')}</span><span style={fVal}>{data.invoiceType}</span></div>
        {data.dueDate && (
          <div style={fRow}><span style={fLbl}>{t('lbl.inv.due_date')}</span><span style={fVal}>{dateText(data.dueDate)}</span></div>
        )}
      </div>

      {/* ── Section 2: Party & Contract ── */}
      <div style={secTitle}>{t('page.invoice_preview.section.party')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
        <div style={fRow}>
          <span style={fLbl}>{data.customer ? t('col.customer') : t('col.supplier')}</span>
          <span style={fVal}>{partyName}</span>
        </div>
        {data.contract && (
          <div style={fRow}>
            <span style={fLbl}>{t('field.linked_contract')}</span>
            <span style={fVal}>{data.contract.asphaltPlant}</span>
          </div>
        )}
      </div>

      {/* ── Section 3: Line Items ── */}
      <div style={secTitle}>{t('lbl.items')}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={th}>{t('col.description')}</th>
            <th style={{ ...th, width: 80, textAlign: 'center' }}>{t('ph.qty')}</th>
            <th style={{ ...th, width: 80, textAlign: 'center' }}>{t('col.inv.unit')}</th>
            <th style={{ ...th, width: 120, textAlign: 'end' }}>{t('lbl.inv.unit_price')}</th>
            <th style={{ ...th, width: 120, textAlign: 'end' }}>{t('col.inv.total')}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td style={td}>{item.description}</td>
              <td style={{ ...td, textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ ...td, textAlign: 'center' }}>{item.unit}</td>
              <td style={{ ...td, textAlign: 'end' }}>{money(item.unitPrice)}</td>
              <td style={{ ...td, textAlign: 'end', fontWeight: 700 }}>{money(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Section 4: Financial Summary ── */}
      <div style={secTitle}>{t('page.invoice_preview.section.financial')}</div>
      <div style={{ maxWidth: 360, marginInlineStart: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
          <span style={fLbl}>{t('lbl.inv.subtotal')}</span><span style={fVal}>{money(data.subtotal)}</span>
        </div>
        {Number(data.discount) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
            <span style={fLbl}>{t('field.inv.discount_kd')}</span>
            <span style={{ ...fVal, color: '#dc2626' }}>−{money(data.discount)}</span>
          </div>
        )}
        {Number(data.taxAmount) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
            <span style={fLbl}>{t('lbl.inv.tax')} ({data.taxRate}%)</span>
            <span style={fVal}>{money(data.taxAmount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '2px solid #1d4e6f', fontSize: 16, fontWeight: 800 }}>
          <span style={{ color: '#1d4e6f' }}>{t('lbl.inv.grand_total')}</span>
          <span style={{ color: '#1d4e6f' }}>{money(data.total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
          <span style={fLbl}>{t('col.inv.paid')}</span>
          <span style={{ ...fVal, color: '#16a34a' }}>{money(data.paidAmount)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 14, fontWeight: 800 }}>
          <span style={{ ...fLbl, fontSize: 14, color: remaining > 0 ? '#dc2626' : '#16a34a' }}>
            {t('lbl.inv.remaining_amount')}
          </span>
          <span style={{ fontWeight: 800, color: remaining > 0 ? '#dc2626' : '#16a34a' }}>{money(remaining)}</span>
        </div>
      </div>

      {/* ── Section 5: Payment History ── */}
      {data.payments.length > 0 && (
        <>
          <div style={secTitle}>{t('lbl.inv.payment_history')}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={th}>{t('col.date')}</th>
                <th style={{ ...th, width: 130, textAlign: 'end' }}>{t('col.amount')}</th>
                <th style={{ ...th, width: 110 }}>{t('field.payment_method')}</th>
                <th style={th}>{t('field.inv.reference')}</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{dateText(p.date)}</td>
                  <td style={{ ...td, fontWeight: 700, textAlign: 'end' }}>{money(p.amount)}</td>
                  <td style={td}>{PAY_METHOD_AR[p.method] ?? p.method}</td>
                  <td style={td}>{p.reference ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ── Notes ── */}
      {data.notes && (
        <>
          <div style={secTitle}>{t('field.notes')}</div>
          <p style={{ fontSize: 13, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, margin: 0 }}>
            {data.notes}
          </p>
        </>
      )}

    </div>
    </>
  );
}
