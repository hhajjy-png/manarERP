/**
 * Letter Engine — the paginator.
 *
 * PURE. It takes measured item heights in millimetres plus the page geometry, and
 * returns which items land on which page. No DOM, no React, no measurement of its own —
 * that separation is what lets the whole flow algorithm be tested exhaustively without
 * rendering a thing.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY MILLIMETRE COMES FROM THE GEOMETRY REGISTRY.
 * ══════════════════════════════════════════════════════════════════════════
 * The band available on page *n* is `usableBandMm(geometry, n)`, which already accounts
 * for the reserved header (first page or continuation), the reserved footer, and the
 * in-band page-footer strip. This module never adds, subtracts or assumes a dimension
 * of its own — it only compares heights against what the registry reports.
 *
 * ── PARAGRAPHS ARE ATOMIC IN THIS PACK ───────────────────────────────────
 * An item that does not fit the remaining space moves WHOLE to the next page. A
 * paragraph is never split across a page boundary.
 *
 * That is a real limitation and worth stating plainly: true typesetting breaks a
 * paragraph mid-way and continues it overleaf. Doing that in an editable document
 * requires line-level measurement and a split rendering path for a single logical
 * paragraph, which is a substantially larger piece of work. Block-level flow is
 * correct, predictable, and adequate for official correspondence, where paragraphs are
 * short — and it is honest about what it does rather than approximating what it does
 * not. Line-level splitting is the natural next step.
 *
 * ── AN ITEM TALLER THAN A WHOLE BAND ─────────────────────────────────────
 * It cannot fit anywhere, so refusing to place it would loop forever. It is placed on
 * a page of its own and reported in `overflowingItemIds`. Reporting rather than
 * silently truncating is the point: a later pack decides what to do about it, and
 * nothing here blocks or hides it.
 */

import {
  type PageGeometry,
  usableBandMm,
} from '../registry/geometryRegistry';

/** What a section contributes to the flow. */
export type PaginationItemKind = 'content' | 'signature' | 'barcode';

export interface PaginationItem {
  readonly id: string;
  readonly kind: PaginationItemKind;
  /** Rendered height in millimetres, measured at the content band's width. */
  readonly heightMm: number;
  /**
   * Keep this item on the same page as the next one.
   *
   * Used to hold the signature and the barcode together: they authorise the document
   * jointly and splitting them across a page boundary would be meaningless.
   */
  readonly keepWithNext?: boolean;
}

export interface PaginatedPage {
  readonly pageIndex: number;
  readonly itemIds: readonly string[];
  /** Millimetres consumed on this page. */
  readonly usedMm: number;
  /** Millimetres the registry allows on this page. */
  readonly availableMm: number;
}

export interface PaginationResult {
  readonly pages: readonly PaginatedPage[];
  readonly pageCount: number;
  /** Items taller than an entire band. Placed anyway; reported, never hidden. */
  readonly overflowingItemIds: readonly string[];
}

/** Which page an item ended up on. */
export function pageIndexOfItem(result: PaginationResult, itemId: string): number {
  return result.pages.findIndex((page) => page.itemIds.includes(itemId));
}

/**
 * Group items that must travel together.
 *
 * A run of `keepWithNext` items plus the item that terminates the run forms one
 * indivisible group. Grouping happens before placement so a group is measured and
 * moved as a unit rather than being placed and then regretted.
 */
function groupItems(items: readonly PaginationItem[]): PaginationItem[][] {
  const groups: PaginationItem[][] = [];
  let current: PaginationItem[] = [];

  for (const item of items) {
    current.push(item);
    if (!item.keepWithNext) {
      groups.push(current);
      current = [];
    }
  }
  // A trailing `keepWithNext` has nothing to keep with; it still has to be placed.
  if (current.length > 0) groups.push(current);
  return groups;
}

function heightOf(group: readonly PaginationItem[]): number {
  return group.reduce((sum, item) => sum + item.heightMm, 0);
}

/**
 * Flow items onto pages.
 *
 * Always returns at least one page, even for an empty document — a letter with nothing
 * in it is still a sheet of paper, and the composer needs something to render.
 */
export function paginate(
  items: readonly PaginationItem[],
  geometry: PageGeometry,
): PaginationResult {
  const pages: { pageIndex: number; itemIds: string[]; usedMm: number; availableMm: number }[] = [];
  const overflowingItemIds: string[] = [];

  let pageIndex = 0;
  let available = usableBandMm(geometry, 0);
  let used = 0;
  let currentIds: string[] = [];

  const commitPage = () => {
    pages.push({ pageIndex, itemIds: currentIds, usedMm: used, availableMm: available });
  };

  const startNewPage = () => {
    commitPage();
    pageIndex += 1;
    available = usableBandMm(geometry, pageIndex);
    used = 0;
    currentIds = [];
  };

  for (const group of groupItems(items)) {
    const groupHeight = heightOf(group);

    // Taller than any band: it can never fit, so give it its own page rather than
    // looping. Reported so a later pack can act on it.
    if (groupHeight > available && used === 0) {
      overflowingItemIds.push(...group.map((i) => i.id));
      currentIds.push(...group.map((i) => i.id));
      used += groupHeight;
      continue;
    }

    if (used + groupHeight > available) startNewPage();

    // After moving to a fresh page the group may STILL be too tall — same case as
    // above, now on an empty page.
    if (groupHeight > available) overflowingItemIds.push(...group.map((i) => i.id));

    currentIds.push(...group.map((i) => i.id));
    used += groupHeight;
  }

  commitPage();

  return { pages, pageCount: pages.length, overflowingItemIds };
}

/**
 * Does this result differ from another in a way the UI must react to?
 *
 * Compared structurally rather than by reference so a re-measure that produces the
 * same layout does not trigger a re-render — which is what stops the
 * measure → paginate → render → measure loop from oscillating.
 */
export function samePagination(a: PaginationResult | null, b: PaginationResult | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.pages.length !== b.pages.length) return false;
  return a.pages.every((page, index) => {
    const other = b.pages[index];
    return (
      page.itemIds.length === other.itemIds.length &&
      page.itemIds.every((id, i) => id === other.itemIds[i])
    );
  });
}
