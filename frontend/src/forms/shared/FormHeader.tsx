import { CSSProperties } from 'react';

const COMPANY_NAME_AR =
  'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م';

const COMPANY_NAME_EN =
  'ALAMANAR ALDAWLIYA FOR STREET CONSTRUCTION & MAINTENANCE CO., W.L.L.';

// Same navy/purple brand identity color as PaymentVoucherTemplate.tsx's BRAND
// constant (#2b2e83) — reused here (not a new/guessed color) to recolor the
// logohead.png mark + wordmark for on-screen and print legibility.
const LOGO_TINT_FILTER_ID = 'form-header-logo-tint';
// #2b2e83 channel components normalized to 0-1, as required by the
// feColorMatrix constant-offset (5th) column below.
const LOGO_TINT_R = 43 / 255;
const LOGO_TINT_G = 46 / 255;
const LOGO_TINT_B = 131 / 255;

// logohead.png (930×268) has a large blank margin baked into the source file
// around the mark+wordmark — measured by scanning the PNG's pixels: visible
// content spans x=[56,863], i.e. ~56px left / ~66px right out of 930px. The
// <img> element itself already renders at the same width as the form's
// content below (confirmed); the gap users see is this internal margin, not
// a CSS layout gap. Scaling the whole image up by 930/830 (uniform, aspect
// ratio preserved) shrinks that margin to a small safety cushion on the
// tighter (left) side, verified empirically to not clip the wordmark on
// either side — so the visible logo edges land close to the content bounds
// without ever cropping the mark or the text, on screen or at print.
const LOGO_WIDTH_PCT = (930 / 830) * 100;

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
        <>
          {/* Hidden filter def (not display:none, or the url() reference below
              won't resolve). Recolors every non-transparent logo pixel — mark
              and wordmark alike — to the exact brand navy/purple, preserving
              the source alpha silhouette (shape, antialiasing, proportions)
              untouched. */}
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
            <filter id={LOGO_TINT_FILTER_ID} colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values={`0 0 0 0 ${LOGO_TINT_R} 0 0 0 0 ${LOGO_TINT_G} 0 0 0 0 ${LOGO_TINT_B} 0 0 0 1 0`}
              />
            </filter>
          </svg>
          {/* overflow:hidden + flex centering (not margin:auto — a wider-than-
              container block with margin:'0 auto' does NOT center symmetrically
              in Chromium; it left-aligns and pushes all the overflow to one
              side) crops away only the image's own blank margin equally on
              both sides, never the logo mark or wordmark. flex:'none' stops
              the flex container from shrinking the image back down. */}
          <div style={{ overflow: 'hidden', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <img
              src={logoSrc}
              alt={lang === 'en' ? COMPANY_NAME_EN : COMPANY_NAME_AR}
              style={{
                display: 'block',
                flex: 'none',
                width: `${LOGO_WIDTH_PCT}%`,
                height: 'auto',
                // Recolors the logo (mark + text) to the brand navy/purple for
                // on-screen and print legibility, without touching the source
                // file — the image itself and its design are untouched; only
                // the rendered display (color + width, both CSS-only) is
                // adjusted.
                filter: `url(#${LOGO_TINT_FILTER_ID})`,
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            />
          </div>
        </>
      ) : (
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4e6f', lineHeight: 1.7 }}>
          {lang === 'en' ? COMPANY_NAME_EN : COMPANY_NAME_AR}
        </div>
      )}
    </div>
  );
}
