import { CSSProperties } from 'react';

const line: CSSProperties = {
  borderBottom: '1px solid #64748b',
  display: 'inline-block',
  width: 200,
  marginBottom: 2,
};

export default function ApprovalSection() {
  return (
    <div
      style={{
        marginTop: 36,
        paddingTop: 20,
        borderTop: '1px solid #e2e8f0',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#1d4e6f',
          marginBottom: 16,
        }}
      >
        اعتماد المدير المباشر
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: '#374151' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ minWidth: 80, fontWeight: 600 }}>التوقيع:</span>
          <span style={line} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ minWidth: 80, fontWeight: 600 }}>التاريخ:</span>
          <span>____ / ____ / ______</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: '#374151' }}>
          الختم الرسمي
        </div>
      </div>
    </div>
  );
}
