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

// ── Vertical transparent-padding crop (overlay/ready-paper only) ─────────────
// The same pixel scan that produced the horizontal bounds above also measured
// the VERTICAL ones: in the 930×268 RGBA source, opaque artwork occupies rows
// 59..221 only. Rows 0..58 (59 rows) and 222..267 (46 rows) are fully
// transparent padding baked into the file — together 39.2% of the image's
// height, which at print scale is ~24mm of empty box above and below the
// artwork. That empty box is what forced the header to cover the top of the
// content area.
//
// The crop below removes ONLY those transparent bands, using negative margins
// against the existing `overflow: hidden` wrapper. The <img> keeps its exact
// `LOGO_WIDTH_PCT` width and `height: auto`, so the ARTWORK'S RENDERED SCALE IS
// BYTE-IDENTICAL — nothing is resized, only empty space is clipped away. The
// PNG file itself is untouched.
const LOGO_NATURAL_W = 930;
const LOGO_NATURAL_H = 268;
const LOGO_INK_FIRST_ROW = 59;
const LOGO_INK_LAST_ROW = 221;
const LOGO_BLANK_ROWS_BOTTOM = LOGO_NATURAL_H - 1 - LOGO_INK_LAST_ROW; // 46

// CSS resolves percentage margins/padding against the containing block's INLINE
// size (width), so expressing the crop as a percentage of the wrapper's width
// makes it scale with the page automatically — no mm/px constant to drift.
// One natural image pixel = (LOGO_WIDTH_PCT / 100 / 930) of the wrapper width.
const LOGO_PCT_PER_NATURAL_PX = LOGO_WIDTH_PCT / 100 / LOGO_NATURAL_W;
const LOGO_CROP_TOP_PCT = LOGO_INK_FIRST_ROW * LOGO_PCT_PER_NATURAL_PX * 100;
const LOGO_CROP_BOTTOM_PCT = LOGO_BLANK_ROWS_BOTTOM * LOGO_PCT_PER_NATURAL_PX * 100;

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
  /**
   * Ready Paper-only: render this header as an absolutely-positioned overlay
   * anchored to the TOP OF THE PAGE'S OWN CONTENT BOX (`.form-page`, which
   * FormLayout marks `position: relative`), instead of a normal in-flow box —
   * so its real height never pushes the rest of the form down (the cause of
   * Ready Paper's page-count regression). Off by default — Payment Voucher's
   * `useLogoHeader` (in-flow, unchanged design) never sets this.
   *
   * The offset is deliberately `0`, NOT a negative value. An earlier attempt
   * pinned it at `calc(-1 * margins.top)` to reach the physical sheet edge, but
   * that places the header OUTSIDE `.form-page`'s box, and every surface that
   * renders the document renders `.form-page` ALONE:
   *   • `composeStyledFromNode` (legacy preview, accurate preview) clones only
   *     the `.form-page` node into a bare `<body>` — measured on the real app,
   *     the header landed at `top: -150.2px` against a `255.4px` image, i.e.
   *     58.8% of the logo clipped above the document origin.
   *   • `formPdfDocument.ts` ("Save PDF") clones only `.form-page` too.
   *   • In paged print, content above the page area is not painted.
   * Anchoring at `0` keeps the whole header inside the page box, so it renders
   * identically in the workspace canvas, both preview dialogs, the PDF export
   * and the physical printout. No PRINT_PROFILES margin is read or changed.
   */
  overlay?: boolean;
  /**
   * Horizontal insets for the overlay, as CSS lengths (e.g. `'10mm'`).
   *
   * Required once `.form-page` models the whole A4 SHEET (page-level model): an
   * absolutely positioned child resolves against its containing block's PADDING
   * box, so `left/right: 0` would stretch the header across the full 210mm sheet
   * and scale the artwork up with it. Passing the profile's own horizontal
   * margins keeps the header exactly as wide as the content column (190mm), so
   * the artwork renders at precisely the same size as before. Default `'0'`.
   */
  overlayInsetLeft?: string;
  overlayInsetRight?: string;
  /**
   * Vertical offset of the overlay from the sheet's top edge (e.g. `'2mm'`).
   *
   * The crop boundary sits exactly on the artwork's first inked row (a pixel
   * scan shows rows 5..58 carry only alpha 1..10 — invisible noise — then row 59
   * jumps to alpha 166), so there is ZERO tolerance at the top: any sub-pixel
   * rounding, or a printer's non-printable edge band, shaves the top of the
   * artwork. A small positive offset buys that tolerance back out of the gap
   * that already exists between the artwork and the content start. Default `'0'`.
   */
  overlayTop?: string;
  /**
   * Opt-in, independent of `overlay`: apply the SAME vertical transparent-
   * padding crop as the ready-paper overlay (negative margins removing the
   * PNG's rows 0..58 / 222..267, `alignItems: 'flex-start'` so the shortened
   * flex line cannot stretch/distort the artwork) and suppress the divider —
   * but keep the header a normal IN-FLOW box (no `position: absolute`, no
   * page-level model, no print-only compensation). For headers that show the
   * logo inline within their own layout (e.g. Receipt Voucher) without
   * adopting ready-paper's page-as-sheet architecture. Off by default —
   * Payment Voucher's `useLogoHeader` never sets this, so its header is
   * untouched: full uncropped image, in flow, divider intact.
   */
  cropTransparentPadding?: boolean;
}

export default function FormHeader({
  isLetterhead,
  lang = 'ar',
  logoSrc,
  overlay = false,
  overlayInsetLeft = '0',
  overlayInsetRight = '0',
  overlayTop = '0',
  cropTransparentPadding = false,
}: Props) {
  // `overlay` (ready-paper) always implies the crop; `cropTransparentPadding` is
  // the same crop for an in-flow header (Receipt Voucher). Either source turns
  // it on — Payment Voucher sets neither, so it is completely unaffected.
  const applyCrop = overlay || cropTransparentPadding;
  // Letterhead's `@page { margin-top: 40mm }` (FormLayout) already clears the
  // physically pre-printed header. `visibility:hidden` would still keep this
  // banner's ~18–20mm box in flow — a redundant second clearance that spilled the
  // footer onto page 2 — so `display:none` collapses it entirely.
  const style: CSSProperties = isLetterhead ? { display: 'none' } : {};
  // Overlay mode takes the header out of document flow entirely (position:
  // absolute contributes zero flow height) and pins it to the page's own top
  // edge, so the content that follows lands exactly where it did with no header
  // at all — it does not "move up"; the header simply no longer pushes it down.
  const overlayStyle: CSSProperties = overlay
    ? { position: 'absolute', top: overlayTop, left: overlayInsetLeft, right: overlayInsetRight }
    : {};
  // The divider rule (and the padding that separates it from the artwork)
  // belongs to the plain-TEXT header. Any cropped logo — whether the ready-paper
  // page-level overlay or an in-flow one (`cropTransparentPadding`) — ends its
  // box exactly at the artwork's own bottom edge instead, so the line is
  // dropped for both. Nothing is added in its place and no content moves. The
  // UNCROPPED in-flow header (Payment Voucher, plain-a4 text) keeps it.
  const dividerStyle: CSSProperties = applyCrop
    ? { borderBottom: 'none', paddingBottom: 0 }
    : {};

  return (
    <div
      // Stable hook for the print-only safety compensation (see FormLayout's
      // `READY_PAPER_PRINT_SAFE_TOP`). Present only on the page-level overlay, so
      // no other header can ever be matched by that rule. Carries no styling.
      {...(overlay ? { 'data-page-logo-header': '' } : {})}
      style={{
        textAlign: 'center',
        marginBottom: 14,
        borderBottom: '3px solid #1d4e6f',
        paddingBottom: 10,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        ...style,
        ...dividerStyle,
        ...overlayStyle,
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
          <div
            style={{
              overflow: 'hidden',
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              // Cropped headers only: with the negative margins below, the flex
              // line becomes SHORTER than the image. The default
              // `align-items: stretch` would then shrink the image to match and
              // distort it, so pin the cross axis — the artwork keeps its exact
              // intrinsic scale and simply overflows into the clipped area.
              ...(applyCrop ? { alignItems: 'flex-start' } : {}),
            }}
          >
            <img
              src={logoSrc}
              alt={lang === 'en' ? COMPANY_NAME_EN : COMPANY_NAME_AR}
              style={{
                display: 'block',
                flex: 'none',
                width: `${LOGO_WIDTH_PCT}%`,
                height: 'auto',
                // Cropped headers only: pull the transparent top band above
                // the wrapper's top edge and the transparent bottom band below it,
                // so `overflow: hidden` clips both away. Width/height are NOT
                // touched, so the artwork's rendered scale is unchanged; the
                // wrapper's auto height collapses to exactly the artwork's height.
                ...(applyCrop
                  ? {
                      marginTop: `-${LOGO_CROP_TOP_PCT}%`,
                      marginBottom: `-${LOGO_CROP_BOTTOM_PCT}%`,
                    }
                  : {}),
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
