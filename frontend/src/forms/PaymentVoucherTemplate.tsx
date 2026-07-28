import { CSSProperties, useMemo } from 'react';
import { amountToWordsKWD } from '../lib/tafqeet';
import { formatNumber } from '../lib/format';
import { t } from '../lib/i18n';
import { bankLabel } from '../utils/chequeTemplate';
import { DOC_FONT_STACK } from '../styles/fontRegistry';

export type PaymentVoucherMethod = 'cash' | 'cheque' | 'transfer';

interface Props {
  voucherNumber: string;
  beneficiaryName: string;
  amount: number;
  chequeDate: string;
  description: string | null;
  bankName: string;
  chequeNumber: string;
  lang?: 'ar' | 'en';
  /**
   * Which payment method checkbox is marked. Optional and defaults to 'cheque' —
   * the Cheques module's Payment Voucher page never passes this prop, so its
   * rendered output is byte-for-byte unchanged. Only the Administrative Payment
   * Voucher form (manual entry, no cheque) passes 'cash' or 'transfer'.
   */
  paymentMethod?: PaymentVoucherMethod;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

const BRAND = '#2b2e83';
const AMOUNT_RED = '#b71c1c';

const tdBase: CSSProperties = {
  border: '1.2px solid #b9bccd',
  padding: '9px 12px',
  verticalAlign: 'middle',
  wordBreak: 'break-word',
};
const tdLbl: CSSProperties = {
  ...tdBase,
  background: '#eef0fb',
  color: BRAND,
  fontWeight: 700,
  width: '34%',
  fontSize: 13,
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};
const dotLine: CSSProperties = {
  display: 'inline-block',
  minWidth: 100,
  borderBottom: '1.4px dotted #9aa',
  minHeight: 18,
};

export default function PaymentVoucherTemplate({
  voucherNumber,
  beneficiaryName,
  amount,
  chequeDate,
  description,
  bankName,
  chequeNumber,
  lang = 'ar',
  paymentMethod = 'cheque',
}: Props) {
  const amountWords = useMemo(() => amountToWordsKWD(amount, lang), [amount, lang]);
  const amountDisplay = formatNumber(amount);

  const metaBox: CSSProperties = {
    flex: 1,
    border: `1.5px solid ${BRAND}`,
    borderRadius: 7,
    padding: '8px 12px',
    fontSize: 12,
  };

  const checkbox = (checked: boolean): CSSProperties => ({
    display: 'inline-block',
    width: 13,
    height: 13,
    border: `1.5px solid ${BRAND}`,
    borderRadius: 3,
    verticalAlign: 'middle',
    marginLeft: 5,
    ...(checked
      ? {
          background: BRAND,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }
      : {}),
  });

  const isEn = lang === 'en';

  return (
    <div style={{ fontFamily: DOC_FONT_STACK, direction: isEn ? 'ltr' : 'rtl' }}>
      {/* Title box */}
      <div
        style={{
          background: '#eef0fb',
          color: BRAND,
          textAlign: 'center',
          padding: '8px 12px',
          borderRadius: 7,
          fontSize: 18,
          fontWeight: 700,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        سند صرف / PAYMENT VOUCHER
      </div>

      {/* Meta row: voucher number + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, margin: '14px 0' }}>
        <div style={metaBox}>
          <b style={{ color: BRAND }}>رقم السند / No.:</b>{' '}
          <span style={{ ...dotLine, direction: 'ltr', minWidth: 80 }}>{voucherNumber}</span>
        </div>
        <div style={metaBox}>
          <b style={{ color: BRAND }}>التاريخ / Date:</b>{' '}
          <span style={{ ...dotLine, direction: 'ltr', minWidth: 80 }}>{formatDate(chequeDate)}</span>
        </div>
      </div>

      {/* Main data table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
        <tbody>
          <tr>
            <td style={tdLbl}>
              المستفيد
              <small style={{ display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 10 }}>Paid to</small>
            </td>
            <td style={tdBase}>
              <span style={dotLine}>{beneficiaryName}</span>
            </td>
          </tr>
          <tr>
            <td style={tdLbl}>
              المبلغ بالأرقام
              <small style={{ display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 10 }}>Amount in Figures</small>
            </td>
            <td
              style={{
                ...tdBase,
                background: '#f6faf6',
                border: '1.7px solid #cdddcd',
                fontWeight: 700,
                fontSize: 15,
                textAlign: 'center',
                color: BRAND,
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              {amountDisplay} {isEn ? 'KWD' : 'د.ك'}
            </td>
          </tr>
          <tr>
            <td style={tdLbl}>
              المبلغ بالكلمات
              <small style={{ display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 10 }}>Amount in Words</small>
            </td>
            <td style={tdBase}>
              <span style={dotLine}>{amountWords}</span>
            </td>
          </tr>
          <tr>
            <td style={tdLbl}>
              البيان / السبب
              <small style={{ display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 10 }}>Reason / Description</small>
            </td>
            <td style={tdBase}>
              <span style={dotLine}>{description ?? ''}</span>
            </td>
          </tr>
          <tr>
            <td style={tdLbl}>
              طريقة الدفع
              <small style={{ display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 10 }}>Payment Method</small>
            </td>
            <td style={tdBase}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                <span style={paymentMethod === 'cash' ? { color: BRAND, fontWeight: 700 } : undefined}>
                  <span style={checkbox(paymentMethod === 'cash')} /> {isEn ? 'Cash' : 'نقداً'}
                </span>
                <span style={paymentMethod === 'cheque' ? { color: BRAND, fontWeight: 700 } : undefined}>
                  <span style={checkbox(paymentMethod === 'cheque')} /> {t('opt.payment.cheque', lang)}
                </span>
                <span style={paymentMethod === 'transfer' ? { color: BRAND, fontWeight: 700 } : undefined}>
                  <span style={checkbox(paymentMethod === 'transfer')} /> {t('opt.payment.transfer', lang)}
                </span>
                <span style={{ color: '#555' }}>
                  {t('lbl.bank_colon', lang)} <span style={{ ...dotLine, minWidth: 60 }}>{bankLabel(bankName, (k) => t(k, lang))}</span>
                </span>
                <span style={{ color: '#555' }}>
                  {isEn ? 'Cheque No.:' : 'رقم الشيك:'} <span style={{ ...dotLine, minWidth: 60 }}>{chequeNumber}</span>
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Receiver signature — the shared ApprovalSection footer (Manager Approval,
          signature, date, official stamp) is hidden for this form via
          FormLayout's hideApprovalSection prop. */}
      <div style={{ display: 'flex', gap: 24, marginTop: 38 }}>
        <div style={{ width: '32%', textAlign: 'center' }}>
          <div
            style={{
              borderTop: '1.5px solid #555',
              marginTop: 44,
              paddingTop: 6,
              fontWeight: 700,
              color: BRAND,
              fontSize: 12,
            }}
          >
            المُستلِم
            <small style={{ display: 'block', color: '#999', fontWeight: 400, fontSize: 10 }}>Receiver</small>
          </div>
        </div>
      </div>
    </div>
  );
}
