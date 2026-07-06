import { CSSProperties } from 'react';

const COMPANY_NAME_AR =
  'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م';

const COMPANY_NAME_EN =
  'ALAMANAR ALDAWLIYA FOR STREET CONSTRUCTION & MAINTENANCE CO., W.L.L.';

interface Props {
  isLetterhead: boolean;
  lang?: 'ar' | 'en';
}

export default function FormHeader({ isLetterhead, lang = 'ar' }: Props) {
  // Letterhead's `@page { margin-top: 40mm }` (FormLayout) already clears the
  // physically pre-printed header. `visibility:hidden` would still keep this
  // banner's ~18–20mm box in flow — a redundant second clearance that spilled the
  // footer onto page 2 — so `display:none` collapses it entirely.
  const style: CSSProperties = isLetterhead ? { display: 'none' } : {};

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
        {lang === 'en' ? COMPANY_NAME_EN : COMPANY_NAME_AR}
      </div>
    </div>
  );
}
