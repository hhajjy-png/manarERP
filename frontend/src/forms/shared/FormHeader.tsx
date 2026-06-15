import { CSSProperties } from 'react';
import { PrintMode } from './printMode';

const COMPANY_NAME =
  'شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م';

export default function FormHeader({ printMode }: { printMode: PrintMode }) {
  const hidden = printMode === 'letterhead';
  // visibility:hidden preserves the physical space so letterhead content stays aligned
  const style: CSSProperties = hidden ? { visibility: 'hidden' } : {};

  return (
    <div
      style={{
        textAlign: 'center',
        marginBottom: 14,
        borderBottom: '3px solid #1d4e6f',
        paddingBottom: 10,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        ...style,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4e6f', lineHeight: 1.7 }}>
        {COMPANY_NAME}
      </div>
    </div>
  );
}
