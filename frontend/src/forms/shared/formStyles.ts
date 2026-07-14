import { CSSProperties } from 'react';
import { formatNumber } from '../../lib/format';
import { formatDisplayDate, toLocalDateOnly } from '../../lib/date';

export const COMPANY_NAME =
  'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م';

export const tableRow: CSSProperties = {
  display: 'flex',
  gap: 0,
  borderBottom: '1px solid #e2e8f0',
};

export const tableCell: CSSProperties = {
  padding: '6px 14px',
  fontSize: 13,
  lineHeight: 1.5,
};

export const labelCell: CSSProperties = {
  ...tableCell,
  width: 180,
  fontWeight: 700,
  color: '#1d4e6f',
  background: '#f8fafc',
  borderInlineEnd: '1px solid #e2e8f0',
  flexShrink: 0,
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

export const valueCell: CSSProperties = {
  ...tableCell,
  flex: 1,
  color: '#0f172a',
};

export const sectionHeader: CSSProperties = {
  background: '#1d4e6f',
  color: '#fff',
  fontWeight: 800,
  fontSize: 13,
  padding: '8px 14px',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

export const tableWrapper: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  overflow: 'hidden',
  marginBottom: 12,
  pageBreakInside: 'avoid',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

// المعيار المعتمد لكل تاريخ يراه المستخدم — ومنه المطبوع: DD/MM/YYYY.
// كان «31 يناير 2026» (شهر مطوّل)، وهي صيغة غير معتمدة. المُنسّق المشترك string-safe:
// لا يبني Date على تاريخ فقط، فلا ينزاح اليوم بفعل المنطقة الزمنية.
export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '—';
  return formatDisplayDate(v instanceof Date ? v.toISOString() : v);
}

export function issueDateStr(): string {
  return formatDisplayDate(toLocalDateOnly(new Date()));
}

/**
 * مبلغ **مستقل** داخل نموذج مطبوع (لا عمود يحمل العملة) ⇒ الرقم ثم الرمز.
 *
 * المحرفان U+2066 (LRI) و U+2069 (PDI) يعزلان المبلغ اتجاهيًا **في النصّ نفسه**، لأن
 * القوالب تُصيَّر نصًّا داخل صفحة عربية فينقلب «12,455.000 د.ك» بصريًا إلى
 * «د.ك 12,455.000». المحرفان غير مرئيين ولا يُطبعان، وهذه القوالب لا تغذّي Excel ولا
 * CSV — فلا عقد آلي يتأثر.
 */
export function money(v: number): string {
  return `⁦${formatNumber(v)} د.ك⁩`;
}

// النسخة الإنجليزية تتبع المعيار نفسه: DD/MM/YYYY — لا «January 31, 2026».
export function fmtDateEn(v: string | Date | null | undefined): string {
  if (!v) return '—';
  return formatDisplayDate(v instanceof Date ? v.toISOString() : v);
}

export function issueDateStrEn(): string {
  return formatDisplayDate(toLocalDateOnly(new Date()));
}

export function moneyEn(v: number): string {
  return `⁦${formatNumber(v)} KWD⁩`;
}

export const blankLine: CSSProperties = {
  borderBottom: '1px solid #64748b',
  display: 'inline-block',
  minWidth: 160,
  height: 18,
  marginBottom: -4,
};

export const longTextCell: CSSProperties = {
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
  whiteSpace: 'pre-wrap',
  maxWidth: '100%',
};
