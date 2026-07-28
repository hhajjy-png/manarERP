import { CSSProperties, useMemo } from 'react';
import { amountToWordsKWD } from '../lib/tafqeet';
import { formatNumber } from '../lib/format';

export type PaymentMethod = 'cash' | 'cheque' | 'transfer';

export interface ReceiptVoucherData {
  voucherNumber: string; // '---' when not yet generated
  partyName: string;
  amount: number;
  date: string; // YYYY-MM-DD
  reason: string;
  method: PaymentMethod;
  chequeBank: string;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${y}/${m}/${d}`;
}

const BRAND = '#2b2e83';
const AMOUNT_GREEN = '#1b5e20';

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

export default function ReceiptVoucherTemplate({
  voucherNumber,
  partyName,
  amount,
  date,
  reason,
  method,
  chequeBank,
  lang = 'ar',
}: ReceiptVoucherData & { lang?: 'ar' | 'en' }) {
  const amountWords = useMemo(() => (amount > 0 ? amountToWordsKWD(amount, lang) : ''), [amount, lang]);
  const amountDisplay = amount > 0 ? formatNumber(amount) : '';

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
    <div style={{ fontFamily: '"Cairo", Arial, sans-serif', direction: isEn ? 'ltr' : 'rtl' }}>
      {/* Blue title box with subtitle */}
      <div
        style={{
          background: BRAND,
          color: '#fff',
          textAlign: 'center',
          padding: '8px 12px',
          borderRadius: 7,
          fontWeight: 700,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        <div style={{ fontSize: 18 }}>سند قبض</div>
        <div style={{ fontSize: 10, fontWeight: 400, letterSpacing: '4px', opacity: 0.92, marginTop: 2 }}>
          RECEIPT VOUCHER
        </div>
      </div>

      {/* Meta row: voucher number + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, margin: '14px 0' }}>
        <div style={metaBox}>
          <b style={{ color: BRAND }}>رقم السند</b> / <small>No.</small> :{' '}
          <span style={{ ...dotLine, direction: 'ltr', minWidth: 80 }}>{voucherNumber}</span>
        </div>
        <div style={metaBox}>
          <b style={{ color: BRAND }}>التاريخ</b> / <small>Date</small> :{' '}
          <span style={{ ...dotLine, direction: 'ltr', minWidth: 80 }}>{formatDate(date)}</span>
        </div>
      </div>

      {/* Main data table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
        <tbody>
          <tr>
            <td style={tdLbl}>
              استلمنا من السيد / السادة
              <small style={{ display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 10 }}>Received from</small>
            </td>
            <td style={tdBase}>
              <span style={dotLine}>{partyName}</span>
            </td>
          </tr>
          <tr>
            <td style={tdLbl}>
              المبلغ ( رقماً )
              <small style={{ display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 10 }}>Amount in figures</small>
            </td>
            <td
              style={{
                ...tdBase,
                background: '#f6faf6',
                border: '1.7px solid #cdddcd',
                fontWeight: 700,
                fontSize: 15,
                textAlign: 'center',
                color: AMOUNT_GREEN,
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              {amountDisplay && `${amountDisplay} `}
              <span style={{ fontSize: 10, color: '#555' }}>د.ك</span>
            </td>
          </tr>
          <tr>
            <td style={tdLbl}>
              المبلغ ( كتابةً )
              <small style={{ display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 10 }}>Amount in words</small>
            </td>
            <td style={tdBase}>
              <span style={dotLine}>{amountWords}</span>
            </td>
          </tr>
          <tr>
            <td style={tdLbl}>
              وذلك عن
              <small style={{ display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 10 }}>Being received for</small>
            </td>
            <td style={tdBase}>
              <span style={dotLine}>{reason}</span>
            </td>
          </tr>
          <tr>
            <td style={tdLbl}>
              طريقة القبض
              <small style={{ display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 10 }}>Received by</small>
            </td>
            <td style={tdBase}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                <span><span style={checkbox(method === 'cash')} /> نقداً <small>Cash</small></span>
                <span style={method === 'cheque' ? { color: BRAND, fontWeight: 700 } : {}}>
                  <span style={checkbox(method === 'cheque')} /> شيك <small>Cheque</small>
                </span>
                <span><span style={checkbox(method === 'transfer')} /> تحويل <small>Transfer</small></span>
                <span style={{ color: BRAND, fontWeight: 700 }}>رقم الشيك / البنك:</span>
                <span style={{ ...dotLine, minWidth: 80 }}>{chequeBank}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Signature: Receiver only — Accountant/Finance Manager sections removed */}
      <div style={{ display: 'flex', gap: 24, marginTop: 38 }}>
        {[
          { ar: 'المُستلِم', en: 'Receiver' },
        ].map(({ ar, en }) => (
          <div key={ar} style={{ flex: 1, textAlign: 'center' }}>
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
              {ar}
              <small style={{ display: 'block', color: '#999', fontWeight: 400, fontSize: 10 }}>{en}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
