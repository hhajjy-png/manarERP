import { CSSProperties, useRef, useState } from 'react';
import DateInput from '../components/DateInput';
import { todayDateOnly } from '../lib/date';
import { t as translate, useT } from '../lib/i18n';
import FormLayout from '../forms/shared/FormLayout';
import { generateFormNumber } from '../forms/shared/formNumber';
import { useLegacyFormPreview, isLegacyFormsPreviewEnabled, PRINT_PREVIEW_LEGACY_FORMS_FINANCE, useAccurateFormPreview, isFlagEnabled, UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 } from '../printing';
import type { PrintOutcome } from '../utils/print';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PaymentVoucherTemplate, { type PaymentVoucherMethod } from '../forms/PaymentVoucherTemplate';

const FORM_KEY = 'payment-voucher';

interface FormState {
  voucherNumber: string;
  beneficiaryName: string;
  amount: string;
  date: string;
  description: string;
  method: PaymentVoucherMethod;
  bankName: string;
  chequeNumber: string;
}

function makeInitial(): FormState {
  return {
    voucherNumber: generateFormNumber(FORM_KEY),
    beneficiaryName: '',
    amount: '',
    date: todayDateOnly(),
    description: '',
    method: 'cheque',
    bankName: '',
    chequeNumber: '',
  };
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
  boxSizing: 'border-box',
};
const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 5,
  color: 'var(--text-muted)',
};

/**
 * Administrative Payment Voucher — manual-entry counterpart to the Cheque
 * Management payment voucher (`pages/PaymentVoucher.tsx`). Reuses the exact
 * same `PaymentVoucherTemplate` design and the dedicated `payment-voucher`
 * print profile; every field the template needs is typed in here instead of
 * fetched from a cheque record. No cheque selection, no `/cheques` calls, no
 * `markVoucherPrinted`/print-status side effects — those stay entirely with
 * the Cheque Management flow.
 */
export default function AdminPaymentVoucher() {
  const { t } = useT();
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [form, setForm] = useState<FormState>(makeInitial);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const amountNum = parseFloat(form.amount) || 0;

  /* معاينة قبل الطباعة — طبقة عرض فوق مسار FormLayout القديم. العلم مطفأ ⇒ لا اعتراض
     ولا حوار، فيبقى زر الطباعة على onClick={doPrint} كما هو. */
  const preview = useLegacyFormPreview({
    enabled: isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_FINANCE),
    title: translate('voucher.payment.title', lang),
    documentLabel: t('voucher.payment.document_label', { number: form.voucherNumber }),
    lang,
  });

  /**
   * المعاينة الدقيقة (True Chromium WYSIWYG) — **إضافية بحتة**. تستهلك **نفس**
   * العقدة المطبوعة و**نفس** دالة الطباعة القديمة اللتين ينشرهما `onPrintApiReady`.
   * لا قالب بديل، ولا محرّك طباعة جديد.
   */
  const printApiRef = useRef<{ getNode: () => HTMLElement | null; print: () => Promise<{ outcome: PrintOutcome; failureReason?: string }> } | null>(null);
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => printApiRef.current?.getNode() ?? null,
    onPrint: () => printApiRef.current?.print(),
    title: translate('voucher.payment.title', lang),
    documentLabel: t('voucher.payment.document_label', { number: form.voucherNumber }),
  });

  return (
    <>
      {preview.dialog}
      {accurate.dialog}
      <FormLayout
        formType={FORM_KEY}
        lang={lang}
        printIntercept={preview.printIntercept}
        onPrintApiReady={(api) => { printApiRef.current = api; }}
        ready={false}
        formNumber={form.voucherNumber}
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
          formType: FORM_KEY,
          formNumber: form.voucherNumber,
          entityName: form.beneficiaryName,
        }}
      >
        {/* لوحة الإدخال اليدوي — لا تُطبع */}
        <div
          className="no-print"
          style={{
            marginBottom: 16,
            padding: '14px 18px',
            background: 'var(--surface-2)',
            border: '1px dashed var(--border)',
            borderRadius: 10,
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>{t('voucher.payment.title')}</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>{t('page.paymentVoucher.subtitle')}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="pv-voucher-number">{t('field.paymentVoucher.voucher_number')}</label>
              <input
                id="pv-voucher-number"
                style={{ ...inputStyle, direction: 'ltr' }}
                value={form.voucherNumber}
                onChange={(e) => set('voucherNumber', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="pv-date">{t('field.date')}</label>
              <DateInput id="pv-date" style={{ ...inputStyle, direction: 'ltr' }} value={form.date} onChange={(v) => set('date', v)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="pv-beneficiary">{t('field.paymentVoucher.beneficiary_name')}</label>
              <input
                id="pv-beneficiary"
                style={inputStyle}
                placeholder={t('field.paymentVoucher.beneficiary_placeholder')}
                value={form.beneficiaryName}
                onChange={(e) => set('beneficiaryName', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="pv-amount">{t('field.paymentVoucher.amount_kd')}</label>
              <input
                id="pv-amount"
                style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }}
                type="number"
                min="0"
                step="0.001"
                placeholder="0.000"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle} htmlFor="pv-description">{t('field.paymentVoucher.description')}</label>
            <input
              id="pv-description"
              style={inputStyle}
              placeholder={t('field.paymentVoucher.description_placeholder')}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>{t('field.paymentVoucher.method')}</label>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 6 }}>
                {(['cash', 'cheque', 'transfer'] as PaymentVoucherMethod[]).map((m) => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="radio"
                      name="pv-method"
                      value={m}
                      checked={form.method === m}
                      onChange={() => set('method', m)}
                    />
                    {m === 'cash' ? t('opt.payment.cash') : m === 'cheque' ? t('opt.payment.cheque') : t('opt.payment.transfer')}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle} htmlFor="pv-bank">{t('field.paymentVoucher.bank')}</label>
              <input
                id="pv-bank"
                style={inputStyle}
                placeholder={t('field.paymentVoucher.optional_placeholder')}
                value={form.bankName}
                onChange={(e) => set('bankName', e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="pv-cheque-number">{t('field.paymentVoucher.cheque_number')}</label>
              <input
                id="pv-cheque-number"
                style={{ ...inputStyle, direction: 'ltr' }}
                placeholder={t('field.paymentVoucher.optional_placeholder')}
                value={form.chequeNumber}
                onChange={(e) => set('chequeNumber', e.target.value)}
              />
            </div>
          </div>
        </div>

        <PaymentVoucherTemplate
          voucherNumber={form.voucherNumber}
          beneficiaryName={form.beneficiaryName}
          amount={amountNum}
          chequeDate={form.date}
          description={form.description || null}
          bankName={form.bankName}
          chequeNumber={form.chequeNumber}
          paymentMethod={form.method}
          lang={lang}
        />
      </FormLayout>
    </>
  );
}
