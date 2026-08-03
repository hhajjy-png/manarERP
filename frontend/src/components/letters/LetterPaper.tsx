/**
 * Letter Engine — one physical sheet.
 *
 * The single-page primitive the page stack composes. Renders an exact A4 sheet with
 * its rulers, optional grid, reserved bands and content band — all for a GIVEN PAGE
 * INDEX, so a continuation sheet is laid out with continuation geometry rather than
 * the first page's.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY DIMENSION COMES FROM THE GEOMETRY REGISTRY. NOT ONE IS WRITTEN HERE.
 * ══════════════════════════════════════════════════════════════════════════
 * INV-4: the registry is the single home of a millimetre. This component reads
 * `reservedZonesMm(geometry, pageIndex)`, `contentTopForPageMm`, `textBandBottomMm`
 * and `sideMarginMm` and states no number of its own.
 *
 * ── WHY THE SHEET IS SIZED IN REAL `mm` ──────────────────────────────────
 * CSS `mm` is a physical unit, so a 210 × 297 mm box IS an A4 sheet and a `pt` font
 * inside it is physically the size it claims. Zoom is applied by an ancestor as a
 * `transform: scale()`, which changes how large the sheet APPEARS without touching a
 * single dimension — the rulers therefore stay physically correct at any zoom.
 *
 * ── SCREEN ONLY ──────────────────────────────────────────────────────────
 * Rulers, grid, bands and the page caption are `.no-print`, and the rulers are
 * siblings of the sheet rather than children, so a future export path that clones the
 * sheet alone cannot pick them up regardless of how it strips elements.
 *
 * ── THE BANDS ARE DRAWN, NOT ENFORCED ────────────────────────────────────
 * Nothing here measures overlap and nothing blocks anything. Safe-zone validation is a
 * later pack; this surface is honest about where the letterhead is and has no opinion
 * about what sits near it.
 */

import { type ReactNode } from 'react';
import A4Ruler from '../../forms/shared/A4Ruler';
import {
  type PageGeometry,
  contentTopForPageMm,
  pageSizeOf,
  reservedZonesMm,
  sideMarginMm,
  textBandBottomMm,
} from '../../letters/registry/geometryRegistry';
import './letter-paper.css';

export interface LetterPageProps {
  geometry: PageGeometry;
  /** Zero-based. Drives which reserved-header and content-top values apply. */
  pageIndex: number;
  pageCount: number;
  showRulers: boolean;
  showGrid: boolean;
  showZones: boolean;
  isCurrent: boolean;
  elementRef: (el: HTMLElement | null) => void;
  /** The items placed on this page by the paginator. */
  children: ReactNode;
}

export default function LetterPage({
  geometry,
  pageIndex,
  pageCount,
  showRulers,
  showGrid,
  showZones,
  isCurrent,
  elementRef,
  children,
}: LetterPageProps) {
  const page = pageSizeOf(geometry);
  // Page-aware: a continuation sheet reserves whatever ITS stock reserves.
  const zones = reservedZonesMm(geometry, pageIndex);
  const contentTop = contentTopForPageMm(geometry, pageIndex);
  const bandBottom = textBandBottomMm(geometry);
  const sideMargin = sideMarginMm(geometry);

  return (
    <div
      className={`lp-page-slot${isCurrent ? ' is-current' : ''}`}
      ref={elementRef}
      data-page-index={pageIndex}
    >
      <div
        className={`lp-stage${showRulers ? ' lp-stage--ruled' : ''}`}
        style={{ width: `${page.widthMm}mm`, height: `${page.heightMm}mm` }}
      >
        {showRulers && (
          <>
            {/* Siblings of the sheet, anchored just outside each edge: they add no
                size to it and share its origin, so a reading is a true distance from
                the paper. */}
            <div className="no-print lp-ruler lp-ruler--top" style={{ bottom: '100%' }}>
              <A4Ruler edge="top" lengthMm={page.widthMm} />
            </div>
            <div className="no-print lp-ruler lp-ruler--bottom" style={{ top: '100%' }}>
              <A4Ruler edge="bottom" lengthMm={page.widthMm} />
            </div>
            <div className="no-print lp-ruler lp-ruler--start" style={{ right: '100%' }}>
              <A4Ruler edge="left" lengthMm={page.heightMm} />
            </div>
            <div className="no-print lp-ruler lp-ruler--end" style={{ left: '100%' }}>
              <A4Ruler edge="right" lengthMm={page.heightMm} />
            </div>
          </>
        )}

        <div className="lp-sheet" style={{ width: `${page.widthMm}mm`, height: `${page.heightMm}mm` }}>
          {showGrid && (
            <div
              className="no-print lp-grid"
              aria-hidden="true"
              // Minor every 5 mm, major every 10 mm — in mm, so the grid measures the
              // paper and scales with zoom exactly as the paper does.
              style={{ backgroundSize: '5mm 5mm, 5mm 5mm, 10mm 10mm, 10mm 10mm' }}
            />
          )}

          {showZones &&
            zones.map((zone) => (
              <div
                key={zone.zone}
                className={`no-print lp-zone lp-zone--${zone.zone}`}
                aria-hidden="true"
                style={{ top: `${zone.startMm}mm`, height: `${zone.endMm - zone.startMm}mm` }}
              >
                <span className="lp-zone-label">
                  {zone.zone === 'header' ? 'منطقة الترويسة المحجوزة' : 'منطقة التذييل المحجوزة'}
                  {' · '}
                  {zone.endMm - zone.startMm} مم
                </span>
              </div>
            ))}

          {/* The content band. No internal scrolling — overflow becomes a new page. */}
          <div
            className="lp-band"
            style={{
              top: `${contentTop}mm`,
              insetInlineStart: `${sideMargin}mm`,
              width: `${geometry.contentWidthMm}mm`,
              height: `${bandBottom - contentTop}mm`,
            }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* Page-break indicator: which sheet this is, and that another follows. */}
      <div className="no-print lp-page-caption" aria-hidden="true">
        <span>صفحة {pageIndex + 1} من {pageCount}</span>
        {pageIndex < pageCount - 1 && <span className="lp-break-hint">— فاصل صفحة تلقائي —</span>}
      </div>
    </div>
  );
}
