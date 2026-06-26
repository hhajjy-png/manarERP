import { CSSProperties } from 'react';

export const COMPANY_NAME =
  'شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م';

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

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v as string);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('ar-KW-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function issueDateStr(): string {
  return new Date().toLocaleDateString('ar-KW-u-nu-latn', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function money(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' د.ك';
}

export function fmtDateEn(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v as string);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function issueDateStrEn(): string {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function moneyEn(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' KWD';
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
