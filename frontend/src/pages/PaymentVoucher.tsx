import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import FormLayout from '../forms/shared/FormLayout';
import { useLegacyFormPreview, isLegacyFormsPreviewEnabled, PRINT_PREVIEW_LEGACY_FORMS_FINANCE } from '../printing';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PaymentVoucherTemplate from '../forms/PaymentVoucherTemplate';

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

export default function PaymentVoucher() {
  const { chequeId } = useParams<{ chequeId: string }>();
  const [cheque, setCheque] = useState<ChequeData | null>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');

  useEffect(() => {
    if (!chequeId) return;
    api
      .get(`/cheques/${chequeId}`)
      .then((res) => setCheque(res.data.data as ChequeData))
      .catch((e) => setError(errorMessage(e)));
  }, [chequeId]);

  /* معاينة قبل الطباعة — طبقة عرض فوق مسار FormLayout القديم. العلم مطفأ ⇒ لا اعتراض
     ولا حوار، فيبقى زر الطباعة على onClick={doPrint} كما هو. */
  const preview = useLegacyFormPreview({
    enabled: isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_FINANCE),
    title: lang === 'en' ? 'Payment Voucher' : 'سند صرف',
    documentLabel: `سند صرف · ${cheque?.paymentVoucherNumber ?? ''}`,
    lang,
  });

  if (error) return <div className="center-msg">خطأ: {error}</div>;
  if (!cheque)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );
  if (!cheque.paymentVoucherNumber)
    return (
      <div
        className="center-msg"
        style={{ direction: 'rtl', color: '#b91c1c', maxWidth: 480, margin: '80px auto', textAlign: 'center', lineHeight: 1.7 }}
      >
        لم يتم إصدار رقم سند الصرف بعد.
        <br />
        يرجى العودة إلى صفحة الشيكات والضغط على «طباعة سند الصرف».
      </div>
    );

  return (
    <>
    {preview.dialog}
    <FormLayout
      formType="payment-voucher"
      lang={lang}
      printIntercept={preview.printIntercept}
      ready={false}
      formNumber={cheque.paymentVoucherNumber}
      title=""
      profile="payment-voucher"
      toolbarExtra={<LanguageToggle lang={lang} onChange={setLang} />}
      qrData={{
        formType: 'payment-voucher',
        formNumber: cheque.paymentVoucherNumber,
        employeeId: 0,
        employeeName: cheque.beneficiaryName,
        issueDate: new Date().toISOString(),
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
