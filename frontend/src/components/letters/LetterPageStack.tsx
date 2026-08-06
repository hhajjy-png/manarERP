/**
 * Letter Engine — the page stack.
 *
 * Renders the document as a sequence of physical sheets, each one a `LetterPage` laid
 * out with ITS OWN page index so continuation geometry applies from page two onward.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NOTHING SCROLLS INSIDE THE PAPER. SCROLLING MOVES BETWEEN PAGES.
 * ══════════════════════════════════════════════════════════════════════════
 * The content band has no scrollbar: content that exceeds a page is not hidden, it is
 * on the next sheet. What the user scrolls is the stack — which is what handling paper
 * feels like.
 *
 * ── ZOOM SCALES THE VIEWPORT, NEVER THE DOCUMENT ─────────────────────────
 * One `transform: scale()` wraps the whole stack. Every millimetre inside is untouched,
 * so the rulers stay physically correct at any zoom, and the paginator — which measures
 * outside this wrapper, in transform-immune layout pixels — cannot be influenced by it.
 */

import { type ReactNode, forwardRef } from 'react';
import LetterPage from './LetterPaper';
import {
  type PrintProfileId,
  getPageGeometry,
  pageSizeOf,
} from '../../letters/registry/geometryRegistry';
import { type LayoutVersion } from '../../letters/versioning/versions';
import './letter-paper.css';

export interface LetterPageStackProps {
  printProfileId: PrintProfileId;
  layoutVersion: LayoutVersion;
  pageCount: number;
  zoom: number;
  showRulers: boolean;
  showGrid: boolean;
  showZones: boolean;
  /** The items the paginator placed on a given page. */
  renderPage: (pageIndex: number) => ReactNode;
  /** The positioned layer for a given page — objects plus designer chrome. */
  renderLayoutLayer?: (pageIndex: number) => ReactNode;
  /** Registers each page element so the navigator can scroll to it. */
  pageRef: (pageIndex: number) => (el: HTMLElement | null) => void;
  currentPage: number;
}

const LetterPageStack = forwardRef<HTMLDivElement, LetterPageStackProps>(function LetterPageStack(
  { printProfileId, layoutVersion, pageCount, zoom, showRulers, showGrid, showZones, renderPage, renderLayoutLayer, pageRef, currentPage },
  viewportRef,
) {
  const geometry = getPageGeometry(printProfileId, layoutVersion);
  const page = pageSizeOf(geometry);

  return (
    <div className="lp-viewport" ref={viewportRef}>
      <div
        className="lp-scale"
        style={{
          transform: `scale(${zoom})`,
          // The scaled stack occupies its scaled width, so the scroll area matches
          // what is actually on screen rather than the unscaled sheet.
          width: `calc(${page.widthMm}mm * ${zoom})`,
        }}
      >
        <div className="lp-stack">
          {Array.from({ length: pageCount }, (_, pageIndex) => (
            <LetterPage
              key={pageIndex}
              geometry={geometry}
              pageIndex={pageIndex}
              pageCount={pageCount}
              showRulers={showRulers}
              showGrid={showGrid}
              showZones={showZones}
              isCurrent={pageIndex === currentPage}
              elementRef={pageRef(pageIndex)}
              layoutLayer={renderLayoutLayer?.(pageIndex)}
            >
              {renderPage(pageIndex)}
            </LetterPage>
          ))}
        </div>
      </div>
    </div>
  );
});

export default LetterPageStack;
