/**
 * Letter Engine — the pagination hook.
 *
 * Binds the pure paginator to the DOM: renders nothing itself, but owns the
 * measurement pass and turns it into a page layout.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE-WAY DATA FLOW: measure → paginate → render.
 * ══════════════════════════════════════════════════════════════════════════
 * Heights are taken from a hidden MEASUREMENT LAYER that renders every item once at
 * the content band's exact width — not from the visible pages. That direction matters:
 * measuring the visible pages would mean pagination depends on a layout that
 * pagination itself produced, and the loop can oscillate (an item moves to page 2,
 * page 1 gets shorter, the item fits again, and it moves back).
 *
 * The measurement layer is laid out but not shown, and it lives OUTSIDE the zoom
 * wrapper, so a zoom change cannot alter a measured height. Combined with
 * `offsetHeight` — layout pixels, transform-immune — zoom and geometry are fully
 * decoupled.
 *
 * `samePagination` guards the state update, so a re-measure that produces an identical
 * layout does not re-render. That is the second half of the anti-oscillation story.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type PageGeometry,
} from '../../letters/registry/geometryRegistry';
import {
  type PaginationItem,
  type PaginationResult,
  paginate,
  samePagination,
} from '../../letters/pagination/paginate';
import { measureHeightMm, pxPerMm, roundMm } from '../../letters/pagination/measure';

/** Width the probe is rendered at. Any known width works; wider measures more precisely. */
export const PROBE_WIDTH_MM = 100;

/** What the composer wants flowed, before heights are known. */
export interface MeasurableItem {
  readonly id: string;
  readonly kind: PaginationItem['kind'];
  readonly keepWithNext?: boolean;
}

export interface UseLetterPaginationResult {
  /** The current layout. Never null after the first measurement pass. */
  pagination: PaginationResult;
  /**
   * Measured heights in millimetres, keyed by item id.
   *
   * Exposed so validation can read the SAME measurements the layout was built from. A
   * rule that measured independently could disagree with the pages on screen.
   */
  itemHeightsMm: Readonly<Record<string, number>>;
  /** Attach to the probe element — a box of `PROBE_WIDTH_MM` width. */
  probeRef: (el: HTMLElement | null) => void;
  /** Attach to each measurement-layer item, keyed by item id. */
  measureRef: (itemId: string) => (el: HTMLElement | null) => void;
  /** Force a re-measure. Called after anything that can change a height. */
  remeasure: () => void;
  /** Pixels per millimetre as actually rendered — exposed for diagnostics. */
  factor: number;
}

/** A single empty page: what an unmeasured or empty document looks like. */
function initialPagination(geometry: PageGeometry): PaginationResult {
  return paginate([], geometry);
}

export function useLetterPagination(
  items: readonly MeasurableItem[],
  geometry: PageGeometry,
  /** Changes to this value trigger a re-measure — pass the document/state signature. */
  contentSignature: string,
): UseLetterPaginationResult {
  const probe = useRef<HTMLElement | null>(null);
  const elements = useRef(new Map<string, HTMLElement>());

  const [pagination, setPagination] = useState<PaginationResult>(() => initialPagination(geometry));
  const [itemHeightsMm, setItemHeightsMm] = useState<Readonly<Record<string, number>>>({});
  const [factor, setFactor] = useState(() => pxPerMm(null, PROBE_WIDTH_MM));

  const probeRef = useCallback((el: HTMLElement | null) => {
    probe.current = el;
  }, []);

  const measureRef = useCallback(
    (itemId: string) => (el: HTMLElement | null) => {
      if (el) elements.current.set(itemId, el);
      else elements.current.delete(itemId);
    },
    [],
  );

  const measureAndPaginate = useCallback(() => {
    const currentFactor = pxPerMm(probe.current, PROBE_WIDTH_MM);

    const measured: PaginationItem[] = items.map((item) => ({
      id: item.id,
      kind: item.kind,
      keepWithNext: item.keepWithNext,
      // Rounded so sub-micrometre jitter cannot re-trigger the flow forever.
      heightMm: roundMm(measureHeightMm(elements.current.get(item.id) ?? null, currentFactor)),
    }));

    const next = paginate(measured, geometry);
    const heights = Object.fromEntries(measured.map((item) => [item.id, item.heightMm]));

    setFactor((previous) => (previous === currentFactor ? previous : currentFactor));
    setPagination((previous) => (samePagination(previous, next) ? previous : next));
    // Same guard as the layout: an identical height map must not re-render, or the
    // validation pass downstream would re-run for nothing.
    setItemHeightsMm((previous) => {
      const keys = Object.keys(heights);
      const unchanged =
        keys.length === Object.keys(previous).length && keys.every((k) => previous[k] === heights[k]);
      return unchanged ? previous : heights;
    });
  }, [items, geometry]);

  // Layout effect: measure after the DOM is written but before the browser paints, so
  // the reader never sees a frame of content on the wrong page.
  useLayoutEffect(() => {
    measureAndPaginate();
  }, [measureAndPaginate, contentSignature]);

  // Fonts land after first paint and change every height. Without this the first
  // pagination is computed against fallback metrics and silently stays wrong.
  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts?.ready) return;
    let cancelled = false;
    void fonts.ready.then(() => {
      if (!cancelled) measureAndPaginate();
    });
    return () => {
      cancelled = true;
    };
  }, [measureAndPaginate]);

  return { pagination, itemHeightsMm, probeRef, measureRef, remeasure: measureAndPaginate, factor };
}
