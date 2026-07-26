import { CSSProperties } from 'react';

const COMPANY_NAME_AR =
  'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م';

const COMPANY_NAME_EN =
  'ALAMANAR ALDAWLIYA FOR STREET CONSTRUCTION & MAINTENANCE CO., W.L.L.';

interface Props {
  isLetterhead: boolean;
  lang?: 'ar' | 'en';
  /**
   * Opt-in: replace the plain-text company name with this official logo image
   * (shown at its natural aspect ratio, scaled to the form's width). Off by
   * default (undefined) — every existing form keeps the plain-text header
   * unchanged.
   */
  logoSrc?: string;
}

export default function FormHeader({ isLetterhead, lang = 'ar', logoSrc }: Props) {
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
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={lang === 'en' ? COMPANY_NAME_EN : COMPANY_NAME_AR}
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            margin: '0 auto',
            // Darkens/sharpens the logo's text for on-screen and print legibility
            // without touching the source file — the image itself, its design,
            // colors and dimensions are untouched; only the rendered display is
            // adjusted.
            filter: 'contrast(1.3) brightness(0.94)',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        />
      ) : (
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4e6f', lineHeight: 1.7 }}>
          {lang === 'en' ? COMPANY_NAME_EN : COMPANY_NAME_AR}
        </div>
      )}
    </div>
  );
}
