import { CSSProperties, useMemo } from 'react';
import { tafqeetKWD } from '../lib/tafqeet';
import { formatNumber } from '../lib/format';

interface Props {
  voucherNumber: string;
  beneficiaryName: string;
  amount: number;
  chequeDate: string;
  description: string | null;
  bankName: string;
  chequeNumber: string;
  lang?: 'ar' | 'en';
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
}: Props) {
  const amountWords = useMemo(() => tafqeetKWD(amount), [amount]);
  const amountDisplay = formatNumber(amount);

  const metaBox: CSSProperties = {
    flex: 1,
    border: `1.5px solid ${BRAND}`,
    borderRadius: 7,
    padding: '8px 12px',
    fontSize: 12,
  };

  const checkbox: CSSProperties = {
    display: 'inline-block',
    width: 13,
    height: 13,
    border: `1.5px solid ${BRAND}`,
    borderRadius: 3,
    verticalAlign: 'middle',
    marginLeft: 5,
  };
  const checkboxChecked: CSSProperties = {
    ...checkbox,
    background: BRAND,
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  };

  const isEn = lang === 'en';

  return (
    <div style={{ fontFamily: '"Cairo", Arial, sans-serif', direction: isEn ? 'ltr' : 'rtl' }}>
      {/* Blue title box */}
      <div
        style={{
          background: BRAND,
          color: '#fff',
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
                color: AMOUNT_RED,
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              {amountDisplay} د.ك
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
                <span><span style={checkbox} /> نقداً</span>
                <span style={{ color: BRAND, fontWeight: 700 }}>
                  <span style={checkboxChecked} /> شيك
                </span>
                <span><span style={checkbox} /> تحويل</span>
                <span style={{ color: '#555' }}>
                  البنك: <span style={{ ...dotLine, minWidth: 60 }}>{bankName}</span>
                </span>
                <span style={{ color: '#555' }}>
                  رقم الشيك: <span style={{ ...dotLine, minWidth: 60 }}>{chequeNumber}</span>
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Receiver signature — Manager Approval + Official Stamp are provided by the
          shared ApprovalSection footer (FormLayout), so they are not repeated here. */}
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
