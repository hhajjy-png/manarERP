import { CSSProperties, useEffect, useState } from 'react';
import { printCurrentView } from '../utils/print';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import { todayDateOnly } from '../lib/date';
import FormHeader from '../forms/shared/FormHeader';
import ApprovalSection from '../forms/shared/ApprovalSection';
import FormQRCode from '../forms/shared/FormQRCode';
import LanguageToggle from '../forms/shared/LanguageToggle';
import ReceiptVoucherTemplate, { PaymentMethod } from '../forms/ReceiptVoucherTemplate';

interface FormState {
  partyName: string;
  amount: string;
  date: string;
  reason: string;
  method: PaymentMethod;
  chequeBank: string;
}

function todayISO(): string {
  return todayDateOnly();
}

const INITIAL: FormState = {
  partyName: '',
  amount: '',
  date: todayISO(),
  reason: '',
  method: 'cash',
  chequeBank: '',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
};
const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 5,
  color: 'var(--text-muted)',
};

export default function ReceiptVoucher() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [rcvNumber, setRcvNumber] = useState('');
  const [printing, setPrinting] = useState(false);
  const [formError, setFormError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');

  // Trigger window.print() after React flushes the rcvNumber into the DOM.
  useEffect(() => {
    if (printing && rcvNumber) {
      printCurrentView();
      setPrinting(false);
    }
  }, [printing, rcvNumber]);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  }

  function validate(): string {
    if (!form.partyName.trim()) return 'اسم الجهة الدافعة مطلوب.';
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) return 'المبلغ مطلوب ويجب أن يكون أكبر من صفر.';
    if (!form.date) return 'التاريخ مطلوب.';
    if (!form.reason.trim()) return 'البيان / السبب مطلوب.';
    return '';
  }

  async function handlePrint() {
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError('');
    // Clear stale number BEFORE setting printing=true so the print effect
    // cannot fire with the previous session's RCV number on a second print.
    setRcvNumber('');
    setPrinting(true);
    try {
      const res = await api.post('/forms/receipt-voucher-number');
      const { rcvNumber: num } = res.data.data as { rcvNumber: string };
      // Set both flags together so React batches them into one render.
      // window.print() fires in the useEffect AFTER the DOM reflects the real number.
      // The number is consumed even if the user cancels the browser print dialog.
      setRcvNumber(num);
    } catch (e) {
      setPrinting(false);
      setFormError(errorMessage(e));
    }
  }

  const amountNum = parseFloat(form.amount) || 0;

  return (
    <>
      <style>{`
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          @page { size: A4; margin: 12mm 15mm; }
          .rcv-no-print { display: none !important; }
          .rcv-preview {
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* ── Input form panel (hidden on print) ── */}
      <div className="rcv-no-print page" style={{ paddingBottom: 0 }}>
        <div className="page-head" style={{ marginBottom: 20 }}>
          <div>
            <h2>سند قبض</h2>
            <p>أدخل بيانات السند ثم اضغط «طباعة» لإصدار الرقم وطباعة المستند.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <LanguageToggle lang={lang} onChange={setLang} />
            <button
              type="button"
              className="btn secondary"
              onClick={() => navigate(-1)}
            >
              {lang === 'en' ? 'Back' : 'رجوع'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={printing}
              onClick={handlePrint}
              style={{ minWidth: 120 }}
            >
              {printing ? (lang === 'en' ? 'Generating…' : 'جارٍ الإصدار…') : (lang === 'en' ? '🖨️ Print' : '🖨️ طباعة')}
            </button>
          </div>
        </div>

        {formError && (
          <div className="alert error" style={{ marginBottom: 16 }}>{formError}</div>
        )}

        <div
          className="card"
          style={{
            padding: 24,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
            marginBottom: 0,
          }}
        >
          {/* Party name */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>اسم الجهة الدافعة / المُسلِّم <span style={{ color: '#e11d48' }}>*</span></label>
            <input
              style={inputStyle}
              type="text"
              placeholder="استلمنا من السيد / السادة…"
              value={form.partyName}
              onChange={(e) => set('partyName', e.target.value)}
            />
          </div>

          {/* Amount */}
          <div>
            <label style={labelStyle}>المبلغ ( د.ك ) <span style={{ color: '#e11d48' }}>*</span></label>
            <input
              style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }}
              type="number"
              min="0"
              step="0.001"
              placeholder="0.000"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          </div>

          {/* Date */}
          <div>
            <label style={labelStyle}>التاريخ <span style={{ color: '#e11d48' }}>*</span></label>
            <DateInput
              style={{ ...inputStyle, direction: 'ltr' }}
              value={form.date}
              onChange={(v) => set('date', v)}
            />
          </div>

          {/* Reason */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>البيان / السبب <span style={{ color: '#e11d48' }}>*</span></label>
            <input
              style={inputStyle}
              type="text"
              placeholder="وذلك عن…"
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
            />
          </div>

          {/* Payment method */}
          <div>
            <label style={labelStyle}>طريقة القبض</label>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', paddingTop: 6 }}>
              {(['cash', 'cheque', 'transfer'] as PaymentMethod[]).map((m) => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="radio"
                    name="rcv-method"
                    value={m}
                    checked={form.method === m}
                    onChange={() => set('method', m)}
                  />
                  {m === 'cash' ? 'نقداً' : m === 'cheque' ? 'شيك' : 'تحويل'}
                </label>
              ))}
            </div>
          </div>

          {/* Cheque / bank reference */}
          <div>
            <label style={labelStyle}>رقم الشيك / البنك</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="اختياري…"
              value={form.chequeBank}
              onChange={(e) => set('chequeBank', e.target.value)}
            />
          </div>
        </div>

        <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          {rcvNumber ? (
            <span style={{ color: '#16a34a', fontWeight: 700 }}>
              تم إصدار الرقم: {rcvNumber} — يمكنك الطباعة مجدداً بالضغط على «طباعة».
            </span>
          ) : (
            'رقم السند يُصدر ويُثبّت فور الضغط على «طباعة» حتى في حال إلغاء نافذة الطباعة.'
          )}
        </div>
      </div>

      {/* ── Printable preview (always in DOM, hidden on screen via no-print toolbar) ── */}
      <div
        className="rcv-preview"
        style={{
          padding: '18px 32px',
          fontFamily: '"Cairo", Arial, sans-serif',
          maxWidth: 793,
          margin: '24px auto 0',
          color: '#0f172a',
          background: '#fff',
          direction: 'rtl',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
          borderRadius: 4,
        }}
      >
        <FormHeader isLetterhead={false} lang={lang} />

        {/* Form number reference */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, direction: 'ltr' }}>
            {rcvNumber || '---'}
          </div>
          <div
            style={{
              width: 60,
              height: 3,
              background: '#1d4e6f',
              margin: '0 auto',
              borderRadius: 2,
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
          />
        </div>

        <ReceiptVoucherTemplate
          voucherNumber={rcvNumber || '---'}
          partyName={form.partyName}
          amount={amountNum}
          date={form.date}
          reason={form.reason}
          method={form.method}
          chequeBank={form.chequeBank}
          lang={lang}
        />

        {/* Footer: ApprovalSection + QR */}
        <div
          style={{
            marginTop: 14,
            paddingTop: 10,
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 20,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <div style={{ flex: 1 }}>
            <ApprovalSection lang={lang} />
          </div>
          <div style={{ flexShrink: 0 }}>
            <FormQRCode
              data={{
                formType: 'receipt-voucher',
                formNumber: rcvNumber || '---',
                employeeId: 0,
                employeeName: form.partyName,
                issueDate: new Date().toISOString(),
              }}
              size={80}
            />
          </div>
        </div>
      </div>
    </>
  );
}
