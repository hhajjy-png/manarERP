import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { PrintOutcome } from '../utils/print';
import FormLayout from '../forms/shared/FormLayout';
import { useLegacyFormPreview, isLegacyFormsPreviewEnabled, PRINT_PREVIEW_LEGACY_FORMS_FINANCE, useAccurateFormPreview, isFlagEnabled, UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 } from '../printing';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PaymentVoucherTemplate from '../forms/PaymentVoucherTemplate';
import { useT } from '../lib/i18n';

interface ChequeData {
  id: number;
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: number;
  bankName: string;
  description: string | null;
  paymentVoucherNumber: string | null;
  status: string;
}

/** Full batch list passed via router state by Cheques.tsx's "طباعة سندات الصرف
 *  المحددة" action — each entry is a complete cheque record Cheques.tsx already
 *  had in memory (no per-item API fetch needed to render). Absent for every
 *  other navigation to this page — the page's default single-voucher behavior
 *  (manual print button, no batch bar) is completely unaffected when this
 *  field is not present.
 *
 * Batch Preview Navigator (same pattern as ChequeTemplatePrintPage): the WHOLE
 * list is read once on mount; Previous/Next only change a local `activeIndex`
 * — there is no route-to-route navigation between batch items. */
interface PvBatchState {
  pvBatchItems?: ChequeData[];
}

/** Per-item print result — persists as the user browses away and back, so a
 *  previously printed voucher still shows its status. 'idle' = not printed yet. */
interface ItemPrintState {
  outcome: 'idle' | PrintOutcome;
  failureReason?: string;
}

function freshItemPrintState(): ItemPrintState {
  return { outcome: 'idle' };
}

/** Compact status label per the four requested states. */
function itemStatusLabel(s: ItemPrintState): string {
  if (s.outcome === 'idle') return 'غير مطبوع';
  if (s.outcome === 'success') return 'تمت الطباعة';
  if (s.outcome === 'cancelled') return 'ألغيت';
  return 'فشل';
}

export default function PaymentVoucher() {
  const { chequeId } = useParams<{ chequeId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useT();
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');

  const batchState = (location.state ?? {}) as PvBatchState;
  const batchItems = batchState.pvBatchItems ?? [];
  const hasBatch = batchItems.length > 0;
  // Previous/Next only make sense with more than one item; the batch bar itself
  // (print button + per-item status) still shows for a single batch-sourced item
  // so it keeps a trustworthy tracked print status — unlike the plain single-
  // voucher path below, which relies on FormLayout's own untracked print button.
  const showPreviousNext = batchItems.length > 1;

  // Single-item (non-batch) path — unchanged: fetch the one cheque by route param.
  const [singleCheque, setSingleCheque] = useState<ChequeData | null>(null);
  useEffect(() => {
    if (hasBatch) return;
    if (!chequeId) return;
    api
      .get(`/cheques/${chequeId}`)
      .then((res) => setSingleCheque(res.data.data as ChequeData))
      .catch((e) => setError(errorMessage(e)));
  }, [chequeId, hasBatch]);

  // Batch path — local mutable copies (so a lazily-assigned voucher number
  // updates in place) + an in-page active index. Previous/Next only ever
  // change `activeIndex`; they never print, never assign, never navigate.
  const [items, setItems] = useState<ChequeData[]>(batchItems);
  const [activeIndex, setActiveIndex] = useState(0);
  const [itemPrintStates, setItemPrintStates] = useState<ItemPrintState[]>(() => batchItems.map(freshItemPrintState));
  // Voucher-NUMBER allocation (lazy, per item) — kept separate from print state
  // below so a print failure/success message never gets confused with "the
  // voucher number itself failed to allocate", and vice versa.
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState('');
  // Printing the current item.
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState('');

  const activeItem = hasBatch ? items[activeIndex] : null;
  const cheque = hasBatch ? activeItem : singleCheque;
  const currentPrintState = itemPrintStates[activeIndex] ?? freshItemPrintState();

  // Lazily allocate the voucher number for whichever batch item becomes active,
  // the FIRST time it lacks one — same endpoint and semantics the single-item
  // "طباعة سند الصرف" button already uses (Cheques.tsx's goToPaymentVoucher).
  // Re-runs only when the active item's id or its own paymentVoucherNumber
  // changes, so it can never allocate a second number for an item that already
  // has one (including right after this same call just set it).
  useEffect(() => {
    if (!hasBatch || !activeItem || activeItem.paymentVoucherNumber) return;
    let cancelled = false;
    setAssignBusy(true);
    setAssignError('');
    api.post(`/cheques/${activeItem.id}/payment-voucher-number`)
      .then((res) => {
        if (cancelled) return;
        const { voucherNumber } = res.data.data as { voucherNumber: string };
        setItems((prev) => prev.map((it, i) => (i === activeIndex ? { ...it, paymentVoucherNumber: voucherNumber } : it)));
      })
      .catch((e) => { if (!cancelled) setAssignError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setAssignBusy(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBatch, activeIndex, activeItem?.id, activeItem?.paymentVoucherNumber]);

  // ── Navigation — pure browsing, never prints, never allocates, never implies
  // print success. Resets only the transient "print attempt in flight" error,
  // not the persisted per-item print status. ──────────────────────────────────
  function goPrevious() {
    setPrintError('');
    setActiveIndex((i) => Math.max(0, i - 1));
  }
  function goNext() {
    setPrintError('');
    setActiveIndex((i) => Math.min(items.length - 1, i + 1));
  }

  /** Print THIS voucher via the exact same path the manual "Print" toolbar button
   *  uses (`printApiRef.current.print()` → FormLayout's `doPrint`), and read its
   *  real result instead of assuming success. Affects the CURRENT item only. */
  async function handleBatchPrint() {
    if (printBusy || !printApiRef.current) return;
    setPrintBusy(true);
    setPrintError('');
    try {
      const result = await printApiRef.current.print();
      setItemPrintStates((prev) => prev.map((s, i) => (i === activeIndex ? { outcome: result.outcome, failureReason: result.failureReason } : s)));
      if (result.outcome !== 'success') {
        setPrintError(result.failureReason ?? t('error.cheque.batch_print_not_confirmed'));
      }
    } finally {
      setPrintBusy(false);
    }
  }

  /* معاينة قبل الطباعة — طبقة عرض فوق مسار FormLayout القديم. العلم مطفأ ⇒ لا اعتراض
     ولا حوار، فيبقى زر الطباعة على onClick={doPrint} كما هو. */
  const preview = useLegacyFormPreview({
    enabled: isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_FINANCE),
    title: lang === 'en' ? 'Payment Voucher' : 'سند صرف',
    documentLabel: t('voucher.payment.document_label', { number: cheque?.paymentVoucherNumber ?? '' }),
    lang,
  });

  /**
   * المعاينة الدقيقة (True Chromium WYSIWYG) — **إضافية بحتة**.
   *
   * تستهلك **نفس** العقدة المطبوعة (`.form-page`) و**نفس** دالة الطباعة القديمة
   * (`FormLayout.doPrint`) اللتين ينشرهما `onPrintApiReady`. لا قالب بديل، ولا HTML
   * مختلف، ولا محرّك طباعة جديد. المعاينة القديمة وزر الطباعة ومسارهما: كما هي.
   *
   * العلم مطفأ ⇒ لا زر ولا حوار إطلاقًا.
   */
  const printApiRef = useRef<{ getNode: () => HTMLElement | null; print: () => Promise<{ outcome: PrintOutcome; failureReason?: string }> } | null>(null);
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => printApiRef.current?.getNode() ?? null,
    onPrint: () => printApiRef.current?.print(),
    title: lang === 'en' ? 'Payment Voucher' : 'سند صرف',
    documentLabel: t('voucher.payment.document_label', { number: cheque?.paymentVoucherNumber ?? '' }),
  });


  if (error) return <div className="center-msg">{t('msg.error')}: {error}</div>;
  if (!cheque || (hasBatch && assignBusy && !cheque.paymentVoucherNumber))
    return (
      <div className="center-msg">
        <div className="spinner" />
        {t('msg.loading')}
      </div>
    );
  if (!cheque.paymentVoucherNumber)
    return (
      <div
        className="center-msg"
        style={{ direction: 'rtl', color: '#b91c1c', maxWidth: 480, margin: '80px auto', textAlign: 'center', lineHeight: 1.7 }}
      >
        {assignError || t('msg.payment.number_not_issued')}
        <br />
        {t('msg.payment.go_back_notice')}
      </div>
    );

  return (
    <>
    {hasBatch && (
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 16px', background: 'var(--surface, #fff)', borderBottom: '1px solid var(--border, #e2e8f0)', fontSize: 13.5, fontWeight: 600 }}>
        {showPreviousNext && <button type="button" className="btn secondary" disabled={activeIndex === 0} onClick={goPrevious}>السابق</button>}
        {showPreviousNext && <span>سند الصرف {activeIndex + 1} من {items.length}</span>}
        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: 'var(--surface-2, #f1f5f9)', color: 'var(--text-muted, #64748b)' }}>
          {itemStatusLabel(currentPrintState)}
        </span>
        {/* Prints the CURRENTLY displayed voucher only, via the real print-result
            mechanism (printApiRef.current.print()) so its status above is
            trustworthy. Not gated on printApiRef.current directly — refs don't
            trigger a re-render when FormLayout's onPrintApiReady effect sets it. */}
        <button type="button" className="btn" disabled={printBusy} onClick={handleBatchPrint}>{t('page.cheques.print')}</button>
        {printError && <span style={{ color: '#b91c1c' }}>{printError}</span>}
        {showPreviousNext && <button type="button" className="btn secondary" disabled={activeIndex === items.length - 1} onClick={goNext} style={{ marginInlineStart: 'auto' }}>التالي</button>}
      </div>
    )}
    {preview.dialog}
    {accurate.dialog}
    <FormLayout
      formType="payment-voucher"
      lang={lang}
      printIntercept={preview.printIntercept}
      onPrintApiReady={(api) => { printApiRef.current = api; }}
      ready={false}
      formNumber={cheque.paymentVoucherNumber}
      title=""
      profile="payment-voucher"
      hideApprovalSection
      compactTopMargin
      useLogoHeader
      contentTopOffset="2cm"
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
        {accurate.button}
        </>
      }
      qrData={{
        formType: 'payment-voucher',
        formNumber: cheque.paymentVoucherNumber,
        entityName: cheque.beneficiaryName,
      }}
    >
      <PaymentVoucherTemplate
        voucherNumber={cheque.paymentVoucherNumber}
        beneficiaryName={cheque.beneficiaryName}
        amount={cheque.amount}
        chequeDate={cheque.chequeDate}
        description={cheque.description}
        bankName={cheque.bankName}
        chequeNumber={cheque.chequeNumber}
        lang={lang}
      />
    </FormLayout>
    </>
  );
}
