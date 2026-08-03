/**
 * Letter Engine — the paginator.
 *
 * Pure functions, so this suite is the specification of page flow: what fits, what
 * moves to the next sheet, and how continuation geometry changes the answer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY EXPECTED HEIGHT IS DERIVED FROM THE GEOMETRY REGISTRY.
 * ══════════════════════════════════════════════════════════════════════════
 * Not one band height is typed into this file. The fixtures are built from
 * `usableBandMm(geometry, pageIndex)`, so a change to the registry moves the tests and
 * the paginator together instead of pinning the paginator to numbers that have drifted.
 */
import { describe, it, expect } from 'vitest';
import {
  type PageGeometry,
  getPageGeometry,
  usableBandMm,
} from '../../letters/registry/geometryRegistry';
import {
  type PaginationItem,
  pageIndexOfItem,
  paginate,
  samePagination,
} from '../../letters/pagination/paginate';

const GEOMETRY: PageGeometry = getPageGeometry('companyLetterhead', 1);
const FIRST_BAND = usableBandMm(GEOMETRY, 0);
const CONTINUATION_BAND = usableBandMm(GEOMETRY, 1);

function item(id: string, heightMm: number, keepWithNext = false): PaginationItem {
  return { id, kind: 'content', heightMm, keepWithNext };
}

/** Item ids per page — the shape most assertions care about. */
function layout(items: PaginationItem[]) {
  return paginate(items, GEOMETRY).pages.map((p) => p.itemIds);
}

describe('The registry supplies every band height', () => {
  it('reports a positive first-page band and a continuation band', () => {
    expect(FIRST_BAND).toBeGreaterThan(0);
    expect(CONTINUATION_BAND).toBeGreaterThan(0);
  });

  it('a continuation page is at least as tall as the first — it carries no date block', () => {
    expect(CONTINUATION_BAND).toBeGreaterThanOrEqual(FIRST_BAND);
  });
});

describe('Single page', () => {
  it('an empty document is still one sheet of paper', () => {
    const result = paginate([], GEOMETRY);
    expect(result.pageCount).toBe(1);
    expect(result.pages[0].itemIds).toEqual([]);
  });

  it('keeps everything on page one when it fits', () => {
    expect(layout([item('a', 10), item('b', 10), item('c', 10)])).toEqual([['a', 'b', 'c']]);
  });

  it('fills the band exactly without spilling', () => {
    // The boundary case: consuming the band precisely must NOT open a second page.
    expect(layout([item('a', FIRST_BAND)])).toEqual([['a']]);
  });

  it('reports what each page used and what it had available', () => {
    const result = paginate([item('a', 30), item('b', 20)], GEOMETRY);
    expect(result.pages[0].usedMm).toBe(50);
    expect(result.pages[0].availableMm).toBe(FIRST_BAND);
  });
});

describe('Overflow creates a new page', () => {
  it('moves the item that no longer fits onto page two', () => {
    // One millimetre past the band is enough — there is no tolerance to hide behind.
    expect(layout([item('a', FIRST_BAND), item('b', 1)])).toEqual([['a'], ['b']]);
  });

  it('flows across three pages', () => {
    const items = [
      item('a', FIRST_BAND),
      item('b', CONTINUATION_BAND),
      item('c', 10),
    ];
    expect(layout(items)).toEqual([['a'], ['b'], ['c']]);
  });

  it('uses the CONTINUATION band for pages after the first', () => {
    const result = paginate([item('a', FIRST_BAND), item('b', 5)], GEOMETRY);
    expect(result.pages[0].availableMm).toBe(FIRST_BAND);
    expect(result.pages[1].availableMm).toBe(CONTINUATION_BAND);
  });

  it('never splits an item across pages — a paragraph moves whole', () => {
    const items = [item('a', FIRST_BAND - 5), item('b', 20)];
    const result = paginate(items, GEOMETRY);
    // 'b' appears on exactly one page.
    const pagesHoldingB = result.pages.filter((p) => p.itemIds.includes('b'));
    expect(pagesHoldingB).toHaveLength(1);
    expect(pagesHoldingB[0].pageIndex).toBe(1);
  });

  it('packs as many items as fit before breaking', () => {
    const third = Math.floor(FIRST_BAND / 3);
    expect(layout([item('a', third), item('b', third), item('c', third), item('d', FIRST_BAND)]))
      .toEqual([['a', 'b', 'c'], ['d']]);
  });
});

describe('keepWithNext holds a group together', () => {
  it('moves a chained pair to the next page rather than splitting it', () => {
    // Signature and barcode authorise the document jointly; splitting them would be
    // meaningless.
    const items = [
      item('filler', FIRST_BAND - 10),
      item('signature', 8, true),
      item('barcode', 8),
    ];
    expect(layout(items)).toEqual([['filler'], ['signature', 'barcode']]);
  });

  it('keeps the group on page one when the whole group fits', () => {
    const items = [item('filler', 20), item('signature', 8, true), item('barcode', 8)];
    expect(layout(items)).toEqual([['filler', 'signature', 'barcode']]);
  });

  it('chains three items through consecutive keepWithNext flags', () => {
    const items = [
      item('filler', FIRST_BAND - 10),
      item('x', 5, true),
      item('y', 5, true),
      item('z', 5),
    ];
    expect(layout(items)).toEqual([['filler'], ['x', 'y', 'z']]);
  });

  it('still places a trailing keepWithNext that has nothing to pair with', () => {
    expect(layout([item('a', 10, true)])).toEqual([['a']]);
  });
});

describe('An item taller than a whole band', () => {
  it('is placed rather than dropped, and reported', () => {
    // Refusing to place it would loop forever; hiding it would be worse.
    const result = paginate([item('giant', CONTINUATION_BAND + 50)], GEOMETRY);
    expect(result.pages[0].itemIds).toEqual(['giant']);
    expect(result.overflowingItemIds).toEqual(['giant']);
  });

  it('gets its own page when something precedes it', () => {
    const result = paginate([item('a', 20), item('giant', CONTINUATION_BAND + 50)], GEOMETRY);
    expect(result.pages.map((p) => p.itemIds)).toEqual([['a'], ['giant']]);
    expect(result.overflowingItemIds).toEqual(['giant']);
  });

  it('does not stall the flow — later items still land', () => {
    const result = paginate(
      [item('giant', CONTINUATION_BAND + 50), item('after', 10)],
      GEOMETRY,
    );
    expect(result.pageCount).toBe(2);
    expect(pageIndexOfItem(result, 'after')).toBe(1);
  });

  it('reports nothing when everything fits', () => {
    expect(paginate([item('a', 10)], GEOMETRY).overflowingItemIds).toEqual([]);
  });
});

describe('pageIndexOfItem', () => {
  it('locates an item, and reports -1 for one that is not there', () => {
    const result = paginate([item('a', FIRST_BAND), item('b', 10)], GEOMETRY);
    expect(pageIndexOfItem(result, 'a')).toBe(0);
    expect(pageIndexOfItem(result, 'b')).toBe(1);
    expect(pageIndexOfItem(result, 'ghost')).toBe(-1);
  });
});

describe('samePagination guards against re-render loops', () => {
  it('treats identical layouts as equal', () => {
    const a = paginate([item('x', 10), item('y', 10)], GEOMETRY);
    const b = paginate([item('x', 10), item('y', 10)], GEOMETRY);
    // Different objects, same layout: the UI must not react.
    expect(a).not.toBe(b);
    expect(samePagination(a, b)).toBe(true);
  });

  it('detects a changed page count', () => {
    const a = paginate([item('x', 10)], GEOMETRY);
    const b = paginate([item('x', FIRST_BAND), item('y', 10)], GEOMETRY);
    expect(samePagination(a, b)).toBe(false);
  });

  it('detects the same items redistributed across pages', () => {
    const a = paginate([item('x', 10), item('y', 10)], GEOMETRY);
    const b = paginate([item('x', FIRST_BAND), item('y', 10)], GEOMETRY);
    expect(samePagination(a, b)).toBe(false);
  });

  it('ignores height changes that do not move anything', () => {
    // A re-measure that shifts a height by a fraction must not re-render.
    const a = paginate([item('x', 10)], GEOMETRY);
    const b = paginate([item('x', 10.4)], GEOMETRY);
    expect(samePagination(a, b)).toBe(true);
  });

  it('handles nulls', () => {
    const a = paginate([], GEOMETRY);
    expect(samePagination(null, null)).toBe(true);
    expect(samePagination(a, null)).toBe(false);
  });
});

describe('Purity', () => {
  it('does not mutate the items it is given', () => {
    const items = [item('a', 10), item('b', 20)];
    const snapshot = JSON.stringify(items);
    paginate(items, GEOMETRY);
    expect(JSON.stringify(items)).toBe(snapshot);
  });

  it('is deterministic', () => {
    const items = [item('a', 50), item('b', FIRST_BAND), item('c', 30)];
    expect(paginate(items, GEOMETRY)).toEqual(paginate(items, GEOMETRY));
  });
});
