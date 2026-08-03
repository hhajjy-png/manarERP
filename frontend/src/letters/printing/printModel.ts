/**
 * Letter Engine — the printable document model.
 *
 * A PROJECTION of the layout the editor already produced, never a second computation
 * of it. Everything here is derived from the paginator's `PaginationResult` and the
 * Geometry Registry: this module decides nothing about where content goes, because
 * that decision was made once, on screen, and printing must reproduce it exactly.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NOTHING IS PAGINATED, MEASURED OR LAID OUT HERE.
 * ══════════════════════════════════════════════════════════════════════════
 * If this file ever grows a page-break decision, printing and the screen have become
 * two documents that merely resemble each other — which is the exact failure the
 * one-renderer rule exists to prevent.
 *
 * ── PAGE REGIONS ARE DESCRIBED, NOT FILLED ───────────────────────────────
 * Each page carries its header and footer REGIONS — where they are, in millimetres,
 * for that page index. No content is placed in either: page headers and footers have
 * no editing and no dynamic numbering in this pack. Describing the regions now is what
 * lets a later pack put something in them without reshaping the model.
 */

import {
  type PageGeometry,
  type PrintProfileId,
  contentTopForPageMm,
  pageSizeOf,
  reservedZonesMm,
  sideMarginMm,
  textBandBottomMm,
  usableBandMm,
} from '../registry/geometryRegistry';
import { type LayoutVersion } from '../versioning/versions';
import { type PaginationResult } from '../pagination/paginate';

/**
 * A reserved region on one page.
 *
 * Both offsets are millimetres from the top edge, taken from the registry for THIS
 * page — so a continuation sheet reports its own header band rather than the first
 * page's.
 */
export interface PrintPageRegion {
  readonly startMm: number;
  readonly endMm: number;
  readonly heightMm: number;
}

/** One sheet, exactly as the editor laid it out. */
export interface PrintablePage {
  readonly pageIndex: number;
  /** `true` for page 0 only — the page-aware distinction, from the registry. */
  readonly isFirstPage: boolean;
  /** The flow items on this page, in the paginator's own order. */
  readonly itemIds: readonly string[];

  readonly pageWidthMm: number;
  readonly pageHeightMm: number;

  /** Reserved header region. Described; nothing is rendered into it in this pack. */
  readonly header: PrintPageRegion;
  /** Reserved footer region. Described; nothing is rendered into it in this pack. */
  readonly footer: PrintPageRegion;

  /** The writable band: where the content actually sits. */
  readonly contentTopMm: number;
  readonly contentBottomMm: number;
  readonly contentWidthMm: number;
  readonly sideMarginMm: number;

  /** Millimetres consumed and available, carried through from the layout. */
  readonly usedMm: number;
  readonly availableMm: number;
}

export interface PrintableDocument {
  readonly profileId: PrintProfileId;
  readonly layoutVersion: LayoutVersion;
  readonly pageCount: number;
  readonly pages: readonly PrintablePage[];
}

/**
 * Project a pagination result into printable pages.
 *
 * PURE. Same layout in, same pages out — no DOM, no measurement, no clock. That is
 * what makes the print path testable without rendering anything, and what guarantees
 * it cannot disagree with the screen.
 */
export function buildPrintableDocument(
  pagination: PaginationResult,
  geometry: PageGeometry,
  profileId: PrintProfileId,
  layoutVersion: LayoutVersion,
): PrintableDocument {
  const sheet = pageSizeOf(geometry);

  const pages: PrintablePage[] = pagination.pages.map((page) => {
    const bandBottom = textBandBottomMm(geometry);

    // The SAME bands the on-screen overlay draws and the validator enforces — read
    // from the registry rather than recomputed here, so what prints and what was
    // checked cannot drift apart.
    const zones = reservedZonesMm(geometry, page.pageIndex);
    const header = zones.find((z) => z.zone === 'header')!;
    const footer = zones.find((z) => z.zone === 'footer')!;

    return {
      pageIndex: page.pageIndex,
      isFirstPage: page.pageIndex === 0,
      // Carried through verbatim: the paginator decided this, and printing obeys it.
      itemIds: page.itemIds,

      pageWidthMm: sheet.widthMm,
      pageHeightMm: sheet.heightMm,

      header: { startMm: header.startMm, endMm: header.endMm, heightMm: header.endMm - header.startMm },
      footer: { startMm: footer.startMm, endMm: footer.endMm, heightMm: footer.endMm - footer.startMm },

      contentTopMm: contentTopForPageMm(geometry, page.pageIndex),
      contentBottomMm: bandBottom,
      contentWidthMm: geometry.contentWidthMm,
      sideMarginMm: sideMarginMm(geometry),

      usedMm: page.usedMm,
      availableMm: usableBandMm(geometry, page.pageIndex),
    };
  });

  return { profileId, layoutVersion, pageCount: pages.length, pages };
}

/**
 * Does a printable document describe the same layout the paginator produced?
 *
 * A guard against the one way this projection could rot: if a later change made the
 * print model reorder, merge or drop items, printing would quietly emit a different
 * document from the one on screen. Comparing item-by-item makes that impossible to
 * miss.
 */
export function matchesPagination(printable: PrintableDocument, pagination: PaginationResult): boolean {
  if (printable.pageCount !== pagination.pageCount) return false;
  return printable.pages.every((page, index) => {
    const source = pagination.pages[index];
    return (
      page.pageIndex === source.pageIndex &&
      page.itemIds.length === source.itemIds.length &&
      page.itemIds.every((id, i) => id === source.itemIds[i])
    );
  });
}
