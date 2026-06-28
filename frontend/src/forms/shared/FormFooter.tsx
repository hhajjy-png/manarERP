import { CSSProperties } from 'react';
import { PrintMode } from './printMode';

const COMPANY_NAME =
  'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م';

export default function FormFooter({ printMode }: { printMode: PrintMode }) {
  const hidden = printMode === 'letterhead';
  // visibility:hidden preserves the physical space — body content does not shift up
  const style: CSSProperties = hidden ? { visibility: 'hidden' } : {};

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '2px solid #1d4e6f',
        textAlign: 'center',
        fontSize: 11,
        color: '#64748b',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        ...style,
      }}
    >
      <div style={{ fontWeight: 600, color: '#1d4e6f' }}>{COMPANY_NAME}</div>
      <div style={{ marginTop: 4 }}>دولة الكويت</div>
    </div>
  );
}
