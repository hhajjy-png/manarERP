import { CSSProperties } from 'react';

interface Props {
  lang?: 'ar' | 'en';
  title?: string;
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

export default function ApprovalSection({ lang = 'ar', title }: Props) {
  const L = LABELS[lang];
  const dir = lang === 'en' ? 'ltr' : 'rtl';

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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ minWidth: 80, fontWeight: 600 }}>{L.signature}</span>
          <span style={line} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ minWidth: 80, fontWeight: 600 }}>{L.date}</span>
          <span>____ / ____ / ______</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: '#374151' }}>
          {L.stamp}
        </div>
      </div>
    </div>
  );
}
