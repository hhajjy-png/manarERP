import { CSSProperties } from 'react';
import { PrintMode } from './printMode';
import almanarLogo from '../../assets/almanar-logo.png';

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
        marginBottom: 28,
        borderBottom: '3px solid #1d4e6f',
        paddingBottom: 18,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        ...style,
      }}
    >
      <img
        src={almanarLogo}
        alt="شركة المنار"
        style={{
          height: 64,
          marginBottom: 8,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      />
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4e6f', lineHeight: 1.7 }}>
        {COMPANY_NAME}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
        دولة الكويت — الكويت العاصمة
      </div>
    </div>
  );
}
