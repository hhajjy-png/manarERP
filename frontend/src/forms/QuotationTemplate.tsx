import { CSSProperties } from 'react';
import {
  COMPANY_NAME,
  sectionHeader,
  tableWrapper,
  labelCell,
  valueCell,
  fmtDate,
  fmtDateEn,
  blankLine,
  longTextCell,
} from './shared/formStyles';
import { formatNumber } from '../lib/format';

// ─── Exported interfaces ──────────────────────────────────────────────────────
// Future integration notes:
//   customerName/contactPerson/phone → replace with customerId: number | null
//   project                         → replace with projectId: number | null
//   currency                        → replace with currencyId from settings
// Template and print layout do NOT need to change for these replacements.

export interface QuotationItem {
  id: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  // total is NOT stored — always computed from qty × unitPrice
}

export interface QuotationPrintFields {
  quotationNumber: string;
  date: string;
  validUntil: string;
  currency: string;
  subject: string;
  customerName: string;
  contactPerson: string;
  phone: string;
  project: string;
  items: QuotationItem[];
  notes: string;
  paymentTerms: string;
  lang?: 'ar' | 'en';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, { ar: string; en: string }> = {
  KWD: { ar: 'د.ك', en: 'KWD' },
  USD: { ar: 'دولار', en: 'USD' },
  SAR: { ar: 'ر.س', en: 'SAR' },
};

function currSym(currency: string, lang: 'ar' | 'en'): string {
  return (CURRENCY_SYMBOLS[currency] ?? { ar: currency, en: currency })[lang];
}

function itemTotal(item: QuotationItem): number {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  return Math.round(q * p * 1000) / 1000;
}

function grandTotal(items: QuotationItem[]): number {
  return Math.round(items.reduce((s, i) => s + itemTotal(i), 0) * 1000) / 1000;
}

function fmtAmt(v: number, currency: string, lang: 'ar' | 'en'): string {
  return `${formatNumber(v)} ${currSym(currency, lang)}`;
}

// ─── Table styles ─────────────────────────────────────────────────────────────

const th: CSSProperties = {
  background: '#1d4e6f',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  padding: '5px 8px',
  border: '1px solid #bfd6e3',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

const td: CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid #e2e8f0',
  verticalAlign: 'top',
};

// ─── InfoRow helper ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>{label}</div>
      <div style={valueCell}>
        {value.trim() ? value : <span style={blankLine} />}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const COMPANY_NAME_EN =
  'ALAMANAR ALDAWLIYA FOR STREET CONSTRUCTION & MAINTENANCE CO., W.L.L.';

interface Props {
  printFields: QuotationPrintFields;
  lang?: 'ar' | 'en';
}

export default function QuotationTemplate({ printFields: pf, lang = 'ar' }: Props) {
  const gt = grandTotal(pf.items);
  const isAr = lang !== 'en';

  // ── English render path ───────────────────────────────────────────────────
  if (!isAr) {
    return (
      <div style={{ direction: 'ltr' }}>
        <p style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
          <strong>{COMPANY_NAME_EN}</strong> hereby submits this quotation:
        </p>

        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Quotation Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <InfoRow label="Quotation No." value={pf.quotationNumber} />
            <InfoRow label="Date" value={fmtDateEn(pf.date)} />
            <InfoRow label="Valid Until" value={fmtDateEn(pf.validUntil)} />
            <InfoRow label="Currency" value={currSym(pf.currency, 'en')} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>Subject</div>
              <div style={valueCell}>{pf.subject.trim() ? pf.subject : <span style={blankLine} />}</div>
            </div>
          </div>
        </div>

        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Customer Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <InfoRow label="Customer Name" value={pf.customerName} />
            <InfoRow label="Contact Person" value={pf.contactPerson} />
            <InfoRow label="Phone" value={pf.phone} />
            <InfoRow label="Project" value={pf.project} />
          </div>
        </div>

        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Items</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 30 }}>#</th>
                <th style={th}>Description</th>
                <th style={{ ...th, width: 60, textAlign: 'center' }}>Qty</th>
                <th style={{ ...th, width: 70, textAlign: 'center' }}>Unit</th>
                <th style={{ ...th, width: 110, textAlign: 'end' }}>Unit Price</th>
                <th style={{ ...th, width: 110, textAlign: 'end' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {pf.items.map((item, i) => (
                <tr key={item.id}>
                  <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                  <td style={{ ...td, ...longTextCell }}>{item.description.trim() || <span style={blankLine} />}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.qty || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.unit || '—'}</td>
                  <td style={{ ...td, textAlign: 'end' }}>
                    {item.unitPrice ? fmtAmt(parseFloat(item.unitPrice) || 0, pf.currency, 'en') : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'end', fontWeight: 600 }}>
                    {item.qty && item.unitPrice ? fmtAmt(itemTotal(item), pf.currency, 'en') : '—'}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} style={{ ...td, textAlign: 'start', fontWeight: 700, color: '#1d4e6f', background: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                  Grand Total
                </td>
                <td style={{ ...td, fontWeight: 800, color: '#1d4e6f', fontSize: 13, background: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                  {fmtAmt(gt, pf.currency, 'en')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {(pf.notes.trim() || pf.paymentTerms.trim()) && (
          <div style={{ ...tableWrapper, marginBottom: 10 }}>
            <div style={sectionHeader}>Notes & Terms</div>
            {pf.notes.trim() && (
              <div style={{ padding: '6px 12px', fontSize: 12, borderBottom: '1px solid #e2e8f0', ...longTextCell }}>
                <strong>Notes: </strong>{pf.notes}
              </div>
            )}
            {pf.paymentTerms.trim() && (
              <div style={{ padding: '6px 12px', fontSize: 12 }}>
                <strong>Payment Terms: </strong>{pf.paymentTerms}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Arabic render path ────────────────────────────────────────────────────
  return (
    <div style={{ direction: 'rtl' }}>
      <p style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
        تتقدم <strong>{COMPANY_NAME}</strong> بعرض السعر التالي:
      </p>

      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>تفاصيل عرض السعر</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <InfoRow label="رقم العرض" value={pf.quotationNumber} />
          <InfoRow label="التاريخ" value={fmtDate(pf.date)} />
          <InfoRow label="صالح حتى" value={fmtDate(pf.validUntil)} />
          <InfoRow label="العملة" value={currSym(pf.currency, 'ar')} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>الموضوع</div>
            <div style={valueCell}>{pf.subject.trim() ? pf.subject : <span style={blankLine} />}</div>
          </div>
        </div>
      </div>

      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>بيانات العميل</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <InfoRow label="اسم العميل" value={pf.customerName} />
          <InfoRow label="جهة الاتصال" value={pf.contactPerson} />
          <InfoRow label="الهاتف" value={pf.phone} />
          <InfoRow label="المشروع" value={pf.project} />
        </div>
      </div>

      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>بنود العرض</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 30 }}>#</th>
              <th style={th}>الوصف</th>
              <th style={{ ...th, width: 60, textAlign: 'center' }}>الكمية</th>
              <th style={{ ...th, width: 70, textAlign: 'center' }}>الوحدة</th>
              <th style={{ ...th, width: 110, textAlign: 'end' }}>سعر الوحدة</th>
              <th style={{ ...th, width: 110, textAlign: 'end' }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {pf.items.map((item, i) => (
              <tr key={item.id}>
                <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                <td style={{ ...td, ...longTextCell }}>{item.description.trim() || <span style={blankLine} />}</td>
                <td style={{ ...td, textAlign: 'center' }}>{item.qty || '—'}</td>
                <td style={{ ...td, textAlign: 'center' }}>{item.unit || '—'}</td>
                <td style={{ ...td, textAlign: 'end' }}>
                  {item.unitPrice ? fmtAmt(parseFloat(item.unitPrice) || 0, pf.currency, 'ar') : '—'}
                </td>
                <td style={{ ...td, textAlign: 'end', fontWeight: 600 }}>
                  {item.qty && item.unitPrice ? fmtAmt(itemTotal(item), pf.currency, 'ar') : '—'}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} style={{ ...td, textAlign: 'start', fontWeight: 700, color: '#1d4e6f', background: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                الإجمالي الكلي
              </td>
              <td style={{ ...td, fontWeight: 800, color: '#1d4e6f', fontSize: 13, background: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                {fmtAmt(gt, pf.currency, 'ar')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {(pf.notes.trim() || pf.paymentTerms.trim()) && (
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>ملاحظات وشروط</div>
          {pf.notes.trim() && (
            <div style={{ padding: '6px 12px', fontSize: 12, borderBottom: '1px solid #e2e8f0', ...longTextCell }}>
              <strong>ملاحظات: </strong>{pf.notes}
            </div>
          )}
          {pf.paymentTerms.trim() && (
            <div style={{ padding: '6px 12px', fontSize: 12 }}>
              <strong>شروط الدفع: </strong>{pf.paymentTerms}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
