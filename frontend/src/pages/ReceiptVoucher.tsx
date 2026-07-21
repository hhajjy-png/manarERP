import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { printCurrentView } from '../utils/print';
import {
  createPrintJob,
  composeFromNode,
  isFlagEnabled,
  isPhase2Enabled,
  submitPrintJob,
  PrintPreviewDialog,
  PRINT_CENTER_FOUNDATION_V1,
  PRINT_CENTER_PHASE2_RECEIPT_VOUCHER,
  RECEIPT_VOUCHER_PAGE_SPEC,
  useAccurateFormPreview,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
} from '../printing';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import { todayDateOnly } from '../lib/date';
import { useT } from '../lib/i18n';
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
  const { t } = useT();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [rcvNumber, setRcvNumber] = useState('');
  const [printing, setPrinting] = useState(false);
  const [formError, setFormError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');

  // Phase 2 — Print Center preview. The printable node is the SAME element the legacy
  // path prints; we serialize it, we never re-render the document.
  const previewRef = useRef<HTMLDivElement>(null);
  const [printCenterOpen, setPrintCenterOpen] = useState(false);
  const usePrintCenterPath = isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER);

  /**
   * Compose the self-contained document from the EXISTING printable element.
   * Same renderer, same `@page` geometry (RECEIPT_VOUCHER_PAGE_SPEC mirrors the page's
   * own `@page { size:A4; margin:12mm 15mm }`), so the PDF matches the physical print.
   */
  /** يبني مستند المعاينة من نفس عنصر الطباعة المعروض — لا إعادة رسم. */
  const composePreview = useCallback((): string => {
    const node = previewRef.current;
    if (!node) throw new Error(t('dlg.receipt.compose_failed'));
    return composeFromNode({
      node,
      pageSpec: RECEIPT_VOUCHER_PAGE_SPEC,
      title: `${t('voucher.receipt.title')} ${rcvNumber || '---'}`,
      lang,
    });
  }, [rcvNumber, lang, t]);

  /**
   * المعاينة الدقيقة (True Chromium WYSIWYG) — **إضافية بحتة**.
   *
   * تستهلك **نفس** مُركِّب السند (`composePreview`) — أي نفس العقدة (`previewRef`) ونفس
   * `RECEIPT_VOUCHER_PAGE_SPEC` — و**نفس** دالة الطباعة (`handlePrint`) التي تُصدر الرقم
   * وتطبع عبر مسار Phase 1 المعتمد. لا قالب بديل، ولا مقاس صفحة آخر، ولا محرّك جديد.
   *
   * العلم مطفأ ⇒ لا زر ولا حوار.
   */
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    compose: composePreview,
    onPrint: () => { void handlePrint(); },
    title: `${t('voucher.receipt.title')} ${rcvNumber || '---'}`,
    documentLabel: `${t('voucher.receipt.title')} · ${rcvNumber || '---'}`,
    lang,
  });

  /**
   * Print once React has flushed the issued rcvNumber into the DOM.
   *
   * PRINT CENTER FOUNDATION v1 — PILOT.
   * This is the only document type wired to the new gateway in this phase.
   *
   * • Flag ON  → submitPrintJob(): awaits real readiness (fonts + images + layout),
   *   sends a typed PrintJob over `print:submit`, and records a PRINT audit event.
   *   The transport underneath is the SAME webContents.print({ silent:false,
   *   printBackground:true }) call `printCurrentView()` has always made, and the
   *   page keeps its own `@page { size:A4; margin:12mm 15mm }` rule — so the
   *   PHYSICAL OUTPUT IS UNCHANGED. RECEIPT_VOUCHER_PAGE_SPEC mirrors that same
   *   geometry and travels with the job for the audit trail and for Phase 2, when
   *   the gateway starts emitting the @page rule itself.
   *
   * • Flag OFF → the original `printCurrentView()` line, byte for byte. That is the
   *   rollback lever: no revert needed, no rebuild.
   *
   * Either way `setPrinting(false)` runs, and a failed/canceled job never throws at
   * the user — cancelling the OS dialog is a normal outcome, exactly as before.
   */
  useEffect(() => {
    if (!printing || !rcvNumber) return;
    let canceled = false;

    // ── Phase 2 path — open the Print Center preview instead of printing blind ──
    // The user sees the actual PDF, then chooses Print or Save PDF. No print dialog
    // opens automatically. Audit for PRINT happens only when they press Print.
    if (usePrintCenterPath) {
      setPrintCenterOpen(true);
      setPrinting(false);
      return;
    }

    if (!isFlagEnabled(PRINT_CENTER_FOUNDATION_V1)) {
      // ── Legacy path — unchanged ──
      printCurrentView();
      setPrinting(false);
      return;
    }

    // ── Phase 1 path (reviewed & approved) ──
    void submitPrintJob(
      createPrintJob({
        docType: 'receipt-voucher',
        documentId: rcvNumber,
        destination: 'printer',
        pageSpecId: RECEIPT_VOUCHER_PAGE_SPEC.id,
        paper: RECEIPT_VOUCHER_PAGE_SPEC.paper,
        orientation: RECEIPT_VOUCHER_PAGE_SPEC.orientation,
        copies: 1,
        metadata: { lang },
      }),
    ).finally(() => {
      if (!canceled) setPrinting(false);
    });

    return () => {
      canceled = true;
    };
  }, [printing, rcvNumber, lang, usePrintCenterPath]);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  }

  function validate(): string {
    if (!form.partyName.trim()) return t('error.receipt.payer_required');
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) return t('error.receipt.amount_required');
    if (!form.date) return t('error.receipt.date_required');
    if (!form.reason.trim()) return t('error.receipt.reason_required');
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
            <h2>{t('voucher.receipt.title')}</h2>
            <p>{t('page.receipt.subtitle')}</p>
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
            {accurate.button}
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
            <label style={labelStyle}>{t('field.receipt.payer_name')} <span style={{ color: '#e11d48' }}>*</span></label>
            <input
              style={inputStyle}
              type="text"
              placeholder={t('field.receipt.payer_placeholder')}
              value={form.partyName}
              onChange={(e) => set('partyName', e.target.value)}
            />
          </div>

          {/* Amount */}
          <div>
            <label style={labelStyle}>{t('field.receipt.amount_kd')} <span style={{ color: '#e11d48' }}>*</span></label>
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
            <label style={labelStyle}>{t('field.date')} <span style={{ color: '#e11d48' }}>*</span></label>
            <DateInput
              style={{ ...inputStyle, direction: 'ltr' }}
              value={form.date}
              onChange={(v) => set('date', v)}
            />
          </div>

          {/* Reason */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>{t('field.receipt.reason')} <span style={{ color: '#e11d48' }}>*</span></label>
            <input
              style={inputStyle}
              type="text"
              placeholder={t('field.receipt.reason_placeholder')}
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
            />
          </div>

          {/* Payment method */}
          <div>
            <label style={labelStyle}>{t('field.receipt.method')}</label>
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
                  {m === 'cash' ? t('field.exp.payment_method.cash') : m === 'cheque' ? t('opt.payment.cheque') : t('opt.payment.transfer')}
                </label>
              ))}
            </div>
          </div>

          {/* Cheque / bank reference */}
          <div>
            <label style={labelStyle}>{t('field.receipt.cheque_bank')}</label>
            <input
              style={inputStyle}
              type="text"
              placeholder={t('field.receipt.optional_placeholder')}
              value={form.chequeBank}
              onChange={(e) => set('chequeBank', e.target.value)}
            />
          </div>
        </div>

        <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          {rcvNumber ? (
            <span style={{ color: '#16a34a', fontWeight: 700 }}>
              {t('msg.receipt.issued_notice', { number: rcvNumber })}
            </span>
          ) : (
            t('msg.receipt.number_note')
          )}
        </div>
      </div>

      {/* معاينة قبل الطباعة — الطباعة نفسها تبقى على مسار Phase 1 المعتمد. */}
      {usePrintCenterPath && (
        <PrintPreviewDialog
          open={printCenterOpen}
          onClose={() => setPrintCenterOpen(false)}
          compose={composePreview}
          onPrint={() => {
            void submitPrintJob(
              createPrintJob({
                docType: 'receipt-voucher',
                documentId: rcvNumber,
                destination: 'printer',
                pageSpecId: RECEIPT_VOUCHER_PAGE_SPEC.id,
                copies: 1,
              }),
            );
          }}
          documentLabel={`${t('voucher.receipt.title')} · ${rcvNumber || '---'}`}
          lang={lang}
        />
      )}
      {accurate.dialog}

      {/* ── Printable preview (always in DOM, hidden on screen via no-print toolbar) ── */}
      <div
        ref={previewRef}
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
