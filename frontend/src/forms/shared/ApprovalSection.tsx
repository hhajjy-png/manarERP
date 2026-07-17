import { CSSProperties } from 'react';

interface Props {
  lang?: 'ar' | 'en';
  title?: string;
  /** Opt-in: omit the date row under the signature. Off by default — every existing caller keeps the date. */
  hideDate?: boolean;
  /** Opt-in: render the stamp label on the same row as the signature instead of below it. Off by default. */
  stampInline?: boolean;
}

const line: CSSProperties = {
  borderBottom: '1px solid #64748b',
  display: 'inline-block',
  width: 200,
  marginBottom: 2,
};

const LABELS = {
  ar: {
    defaultTitle: 'اعتماد المدير المباشر',
    signature:    'التوقيع:',
    date:         'التاريخ:',
    stamp:        'الختم الرسمي',
  },
  en: {
    defaultTitle: 'Direct Manager Approval',
    signature:    'Signature:',
    date:         'Date:',
    stamp:        'Official Stamp',
  },
} as const;

export default function ApprovalSection({ lang = 'ar', title, hideDate = false, stampInline = false }: Props) {
  const L = LABELS[lang];
  const dir = lang === 'en' ? 'ltr' : 'rtl';

  const signature = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ minWidth: 80, fontWeight: 600 }}>{L.signature}</span>
      <span style={line} />
    </div>
  );

  // Toward the barcode/QR side of the footer row: ApprovalSection is always the first
  // flex child (QR is second), so the QR sits at the row's logical "end" — physically
  // left under RTL (ar), physically right under LTR (en). Shifting the centered anchor
  // ~2cm toward that end keeps the label correctly biased toward the QR in both langs.
  const stamp = (
    <div
      style={{
        marginTop: stampInline ? 0 : 8,
        fontSize: 13,
        fontWeight: 600,
        color: '#374151',
        ...(stampInline
          ? {
              position: 'absolute',
              left: `calc(50% ${dir === 'rtl' ? '-' : '+'} 2cm)`,
              transform: 'translateX(-50%)',
            }
          : {}),
      }}
    >
      {L.stamp}
    </div>
  );

  return (
    <div
      style={{
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        direction: dir,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4e6f', marginBottom: 16 }}>
        {title ?? L.defaultTitle}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: '#374151' }}>
        {stampInline ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, position: 'relative' }}>
            {signature}
            {stamp}
          </div>
        ) : (
          signature
        )}
        {!hideDate && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ minWidth: 80, fontWeight: 600 }}>{L.date}</span>
            <span>____ / ____ / ______</span>
          </div>
        )}
        {!stampInline && stamp}
      </div>
    </div>
  );
}
