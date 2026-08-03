/**
 * Letter Engine — P6 visual-verification pack: the six required documents.
 *
 * The pack asks for six specific letters to be checked. This file builds each one and
 * runs it through the REAL engine — the real paginator, the real Geometry Registry,
 * the real validation rules and the real print model — then asserts what the printed
 * result must be.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS FILE CAN AND CANNOT ESTABLISH.
 * ══════════════════════════════════════════════════════════════════════════
 * It establishes the MEASURABLE half of the visual checklist: paper size, A4
 * proportions, the reserved header and footer bands, side margins, where each page
 * breaks, how many pages there are, and that the print projection reproduces all of it
 * exactly. Those are numbers, and numbers can be checked.
 *
 * It establishes NOTHING about rendering: glyph shaping, font fallback, line spacing as
 * it actually paints, caret behaviour, or how the sheet looks in a PDF. No test in this
 * repository can — that requires eyes on real output, and it remains the Product
 * Owner's review.
 *
 * Heights below are stated in millimetres as FIXTURES — the real editor measures them
 * in the DOM. That is the one substitution made here, and it is the reason this is a
 * verification of the flow and the geometry rather than of the typography.
 */

import { describe, expect, it } from 'vitest';

import {
  type PageGeometry,
  contentBottomLimitMm,
  contentTopForPageMm,
  getPageGeometry,
  pageSizeOf,
  reservedTopForPageMm,
  sideMarginMm,
  textBandBottomMm,
  usableBandMm,
} from '../../letters/registry/geometryRegistry';
import { LAYOUT_VERSION_LATEST } from '../../letters/versioning/versions';
import { type PaginationItem, paginate, pageIndexOfItem } from '../../letters/pagination/paginate';
import { buildPrintableDocument, matchesPagination } from '../../letters/printing/printModel';

const PROFILE = 'companyLetterhead' as const;
const G: PageGeometry = getPageGeometry(PROFILE, LAYOUT_VERSION_LATEST);
const SHEET = pageSizeOf(G);

/** Band heights differ between the first sheet and a continuation sheet. */
const BAND_FIRST = usableBandMm(G, 0);
const BAND_CONT = usableBandMm(G, 1);

function item(id: string, kind: PaginationItem['kind'], heightMm: number, keepWithNext = false): PaginationItem {
  return { id, kind, heightMm, keepWithNext };
}

/** The heading block every official letter opens with. */
function heading(): PaginationItem[] {
  return [item('date', 'date', 8), item('recipient', 'recipient', 14), item('subject', 'subject', 10)];
}

function body(count: number, heightMm: number): PaginationItem[] {
  return Array.from({ length: count }, (_, i) => item(`p${i + 1}`, 'content', heightMm));
}

function run(items: PaginationItem[]) {
  const pagination = paginate(items, G);
  const printable = buildPrintableDocument(pagination, G, PROFILE, LAYOUT_VERSION_LATEST);
  return { pagination, printable };
}

/** Total height of the heading block, so body fixtures can be sized against the band. */
const HEADING_MM = heading().reduce((sum, i) => sum + i.heightMm, 0);

/* ══ The sheet itself ═════════════════════════════════════════════════════ */

describe('the sheet — paper size, proportions and reserved bands', () => {
  it('is A4 portrait at the ISO 216 proportion', () => {
    expect(SHEET.widthMm).toBe(210);
    expect(SHEET.heightMm).toBe(297);
    // ISO 216: every A-size is √2 : 1. Tolerance covers the mm rounding of the standard.
    expect(SHEET.heightMm / SHEET.widthMm).toBeCloseTo(Math.SQRT2, 2);
  });

  it('reserves the header for the pre-printed letterhead, and more of it on page one', () => {
    const first = reservedTopForPageMm(G, 0);
    const cont = reservedTopForPageMm(G, 1);
    expect(first).toBeGreaterThan(0);
    expect(cont).toBeGreaterThan(0);
    // Content starts BELOW the reserved band on both, never inside it (INV-2).
    expect(contentTopForPageMm(G, 0)).toBeGreaterThanOrEqual(first);
    expect(contentTopForPageMm(G, 1)).toBeGreaterThanOrEqual(cont);
  });

  it('reserves the footer, and keeps the text band clear of it', () => {
    expect(G.reservedBottomMm).toBeGreaterThan(0);
    expect(contentBottomLimitMm(G)).toBe(SHEET.heightMm - G.reservedBottomMm);
    // The in-band page-footer strip sits INSIDE the content band, so the text band
    // ends above the reserved zone rather than at it.
    expect(textBandBottomMm(G)).toBeLessThan(contentBottomLimitMm(G));
  });

  it('has equal side margins that leave exactly the content width', () => {
    const margin = sideMarginMm(G);
    expect(margin * 2 + G.contentWidthMm).toBe(SHEET.widthMm);
  });

  it('gives a continuation sheet MORE usable band than page one', () => {
    // Page one loses height to the taller letterhead reservation. A test that assumed
    // the bands were equal would mispredict every page break after the first.
    expect(BAND_CONT).toBeGreaterThan(BAND_FIRST);
  });
});

/* ══ The six required documents ═══════════════════════════════════════════ */

describe('document 1 — a short one-page letter', () => {
  const { pagination, printable } = run([...heading(), ...body(2, 20)]);

  it('fits on a single sheet', () => {
    expect(pagination.pageCount).toBe(1);
    expect(printable.pageCount).toBe(1);
    expect(pagination.overflowingItemIds).toEqual([]);
  });

  it('leaves the rest of the band empty rather than stretching to fill it', () => {
    const page = printable.pages[0];
    expect(page.usedMm).toBe(HEADING_MM + 40);
    expect(page.usedMm).toBeLessThan(page.availableMm);
  });
});

describe('document 2 — a two-page letter', () => {
  // Overfill page one by a single paragraph.
  const paraMm = 30;
  const perPage = Math.floor((BAND_FIRST - HEADING_MM) / paraMm);
  const { pagination, printable } = run([...heading(), ...body(perPage + 1, paraMm)]);

  it('flows onto a second sheet', () => {
    expect(pagination.pageCount).toBe(2);
    expect(printable.pageCount).toBe(2);
  });

  it('moves the paragraph that did not fit WHOLE to page two', () => {
    // Atomic paragraphs: nothing is split across the boundary.
    const last = `p${perPage + 1}`;
    expect(pageIndexOfItem(pagination, last)).toBe(1);
    expect(printable.pages[0].itemIds).not.toContain(last);
    expect(printable.pages[1].itemIds).toEqual([last]);
  });

  it('keeps every page within its own band — no page overflows', () => {
    for (const page of printable.pages) {
      expect(page.usedMm).toBeLessThanOrEqual(page.availableMm);
    }
  });

  it('lays page two out with continuation geometry, not page one’s', () => {
    expect(printable.pages[1].contentTopMm).toBe(contentTopForPageMm(G, 1));
    expect(printable.pages[1].header.heightMm).toBe(reservedTopForPageMm(G, 1));
    expect(printable.pages[1].availableMm).toBe(BAND_CONT);
  });
});

describe('document 3 — a three-page letter', () => {
  const paraMm = 25;
  const total = Math.ceil((BAND_FIRST + BAND_CONT) / paraMm) + 2;
  const { pagination, printable } = run([...heading(), ...body(total, paraMm)]);

  it('produces exactly three sheets', () => {
    expect(pagination.pageCount).toBe(3);
    expect(printable.pageCount).toBe(3);
  });

  it('numbers pages consecutively from zero with no gap', () => {
    expect(printable.pages.map((p) => p.pageIndex)).toEqual([0, 1, 2]);
  });

  it('marks only the first sheet as the first page', () => {
    expect(printable.pages.map((p) => p.isFirstPage)).toEqual([true, false, false]);
  });

  it('places every item exactly once, losing and duplicating none', () => {
    const placed = printable.pages.flatMap((p) => p.itemIds);
    expect(placed).toHaveLength(heading().length + total);
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('gives sheets two and three the same continuation band', () => {
    expect(printable.pages[1].availableMm).toBe(BAND_CONT);
    expect(printable.pages[2].availableMm).toBe(BAND_CONT);
  });
});

describe('document 4 — content ending exactly at the bottom margin', () => {
  // Fill page one to the millimetre: the tightest case the flow has.
  const remaining = BAND_FIRST - HEADING_MM;
  const { pagination, printable } = run([...heading(), item('fill', 'content', remaining)]);

  it('stays on one sheet — an exact fit is a fit', () => {
    // An off-by-one here would spill a full page for nothing.
    expect(pagination.pageCount).toBe(1);
  });

  it('consumes the band exactly, with nothing left and nothing over', () => {
    const page = printable.pages[0];
    expect(page.usedMm).toBe(page.availableMm);
  });

  it('still ends ABOVE the reserved footer', () => {
    const page = printable.pages[0];
    expect(page.contentTopMm + page.usedMm).toBeLessThanOrEqual(page.contentBottomMm);
    expect(page.contentBottomMm).toBeLessThanOrEqual(page.footer.startMm);
  });

  it('spills to a second sheet at one millimetre more', () => {
    // The boundary is real and sits exactly where the registry says.
    const over = paginate([...heading(), item('fill', 'content', remaining + 1)], G);
    expect(over.pageCount).toBe(2);
  });
});

describe('document 5 — a very long paragraph', () => {
  // Taller than ANY band, so it can fit nowhere.
  const giant = Math.max(BAND_FIRST, BAND_CONT) + 50;
  const { pagination, printable } = run([...heading(), item('giant', 'content', giant)]);

  it('reports the paragraph as overflowing rather than silently truncating it', () => {
    expect(pagination.overflowingItemIds).toContain('giant');
  });

  it('places it anyway, on a sheet of its own', () => {
    const page = pageIndexOfItem(pagination, 'giant');
    expect(page).toBeGreaterThanOrEqual(0);
    expect(printable.pages[page].itemIds).toEqual(['giant']);
  });

  it('never splits it across sheets — paragraphs are atomic', () => {
    const appearances = printable.pages.filter((p) => p.itemIds.includes('giant'));
    expect(appearances).toHaveLength(1);
  });

  it('terminates — an unplaceable item must not loop the paginator', () => {
    expect(pagination.pageCount).toBeGreaterThan(0);
    expect(Number.isFinite(pagination.pageCount)).toBe(true);
  });
});

describe('document 6 — every available section', () => {
  const all: PaginationItem[] = [
    item('date', 'date', 8),
    item('recipient', 'recipient', 14),
    item('subject', 'subject', 10),
    item('body-1', 'content', 45),
    item('body-2', 'content', 38),
    item('signature', 'signature', 30, true), // held with the barcode
    item('barcode', 'barcode', 22),
  ];
  const { pagination, printable } = run(all);

  it('renders every section kind', () => {
    const placed = printable.pages.flatMap((p) => p.itemIds);
    expect(placed).toEqual(all.map((i) => i.id));
  });

  it('keeps the signature and the barcode on the same sheet', () => {
    // They authorise the document jointly; splitting them would be meaningless.
    expect(pageIndexOfItem(pagination, 'signature')).toBe(pageIndexOfItem(pagination, 'barcode'));
  });

  it('holds them together even when that forces a page break', () => {
    // Leave just enough room for the signature but not for both.
    const tight: PaginationItem[] = [
      item('filler', 'content', BAND_FIRST - 40),
      item('signature', 'signature', 30, true),
      item('barcode', 'barcode', 22),
    ];
    const result = paginate(tight, G);
    expect(pageIndexOfItem(result, 'signature')).toBe(pageIndexOfItem(result, 'barcode'));
    expect(result.pageCount).toBe(2);
  });
});

/* ══ Screen and print describe the same document ══════════════════════════ */

describe('the printed projection reproduces the on-screen layout exactly', () => {
  const documents = {
    'one page': [...heading(), ...body(2, 20)],
    'two pages': [...heading(), ...body(Math.floor((BAND_FIRST - HEADING_MM) / 30) + 1, 30)],
    'three pages': [...heading(), ...body(Math.ceil((BAND_FIRST + BAND_CONT) / 25) + 2, 25)],
    'exact fit': [...heading(), item('fill', 'content', BAND_FIRST - HEADING_MM)],
    'oversized paragraph': [...heading(), item('giant', 'content', Math.max(BAND_FIRST, BAND_CONT) + 50)],
  };

  for (const [name, items] of Object.entries(documents)) {
    it(`matches item-for-item — ${name}`, () => {
      const { pagination, printable } = run(items);
      expect(matchesPagination(printable, pagination)).toBe(true);
      expect(printable.pages.map((p) => p.itemIds)).toEqual(pagination.pages.map((p) => p.itemIds));
    });

    it(`keeps every sheet inside the paper — ${name}`, () => {
      const { printable } = run(items);
      for (const page of printable.pages) {
        expect(page.header.startMm).toBe(0);
        expect(page.contentTopMm).toBeGreaterThanOrEqual(page.header.endMm);
        expect(page.contentBottomMm).toBeLessThanOrEqual(page.footer.startMm);
        expect(page.footer.endMm).toBe(page.pageHeightMm);
        expect(page.sideMarginMm * 2 + page.contentWidthMm).toBe(page.pageWidthMm);
      }
    });
  }
});
