/**
 * Letter Engine — snapping and smart guides (Document Layout Designer v1).
 *
 * PURE. Millimetres in, a snapped delta and the guides to draw out.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SNAPPING ADJUSTS THE DRAG, NOT THE OBJECT.
 * ══════════════════════════════════════════════════════════════════════════
 * Every function here takes the delta the pointer produced and returns a CORRECTED
 * delta. Nothing writes to a layout, and nothing knows what is being dragged beyond
 * its rectangle. That is what lets one implementation serve dragging, arrow-key
 * movement, resizing and the Inspector's numeric fields alike — and why a snap can
 * never accidentally become a mutation.
 *
 * ── WHY THE THRESHOLD IS IN SCREEN PIXELS, NOT MILLIMETRES ───────────────
 * A snap is an INTERACTION affordance: it should feel the same distance under the
 * pointer whatever the zoom. A fixed millimetre threshold would be unusable at 25%
 * (where 2 mm is under two pixels and nothing ever snaps) and maddening at 200% (where
 * it is twenty pixels and everything does). So the caller converts the pixel threshold
 * to millimetres for the current zoom and passes that in — which keeps this file pure
 * while keeping the FEEL correct.
 *
 * ── CANDIDATES ARE COLLECTED, THEN THE NEAREST WINS ──────────────────────
 * Each axis is resolved independently and separately: an object may snap its left edge
 * to a neighbour horizontally while snapping its centre to the page vertically, which
 * is exactly what a designer expects and what a single combined "best snap" would make
 * impossible.
 */

import { type LayoutGuide, type LayoutObject } from '../model/layoutTypes';
import { ORIGIN_MM } from '../registry/geometryRegistry';
import {
  type RectMm,
  objectBounds,
  rectBottom,
  rectCentre,
  rectRight,
  roundMm,
} from './layoutGeometry';

/** No adjustment. Named so a millimetre field is never assigned a bare literal. */
const NO_CORRECTION_MM = ORIGIN_MM;

/** Snap distance in SCREEN pixels. The caller converts to mm for the current zoom. */
export const SNAP_THRESHOLD_PX = 6;

/** Grid pitch in millimetres, matching the 5 mm minor grid the sheet already draws. */
export const GRID_PITCH_MM = 5;

/** Which snap sources are active. Every one is independently switchable. */
export interface SnapSettings {
  readonly toGrid: boolean;
  readonly toObjects: boolean;
  readonly toMargins: boolean;
  readonly toCentre: boolean;
  readonly toGuides: boolean;
  /** Master switch — off means no candidate is even collected. */
  readonly enabled: boolean;
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  enabled: true,
  toGrid: true,
  toObjects: true,
  toMargins: true,
  toCentre: true,
  toGuides: true,
};

/** A line the canvas draws to explain a snap that happened. */
export interface SmartGuide {
  readonly axis: 'horizontal' | 'vertical';
  /** Millimetres along the perpendicular axis. */
  readonly positionMm: number;
  /** Why it appeared — drives the guide's colour and whether it is dashed. */
  readonly source: 'grid' | 'object' | 'margin' | 'centre' | 'guide';
  /** The span the line is drawn across, so it reaches the objects it relates. */
  readonly fromMm: number;
  readonly toMm: number;
}

/** The page's own reference lines, supplied by the caller from the Geometry Registry. */
export interface PageSnapContext {
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  /** The content band — where writing is allowed. */
  readonly bandLeftMm: number;
  readonly bandRightMm: number;
  readonly bandTopMm: number;
  readonly bandBottomMm: number;
}

/** One snappable coordinate, with what it means. */
interface Candidate {
  readonly positionMm: number;
  readonly source: SmartGuide['source'];
}

/* ── Candidate collection ───────────────────────────────────────────────── */

/** Vertical lines (constant x) worth snapping to. */
function verticalCandidates(
  page: PageSnapContext,
  others: readonly RectMm[],
  guides: readonly LayoutGuide[],
  settings: SnapSettings,
): Candidate[] {
  const candidates: Candidate[] = [];

  if (settings.toMargins) {
    candidates.push(
      { positionMm: page.bandLeftMm, source: 'margin' },
      { positionMm: page.bandRightMm, source: 'margin' },
    );
  }
  if (settings.toCentre) {
    candidates.push({ positionMm: page.pageWidthMm / 2, source: 'centre' });
  }
  if (settings.toGuides) {
    for (const guide of guides) {
      if (guide.axis === 'vertical') candidates.push({ positionMm: guide.positionMm, source: 'guide' });
    }
  }
  if (settings.toObjects) {
    for (const rect of others) {
      candidates.push(
        { positionMm: rect.xMm, source: 'object' },
        { positionMm: rectCentre(rect).xMm, source: 'object' },
        { positionMm: rectRight(rect), source: 'object' },
      );
    }
  }

  return candidates;
}

/** Horizontal lines (constant y) worth snapping to. */
function horizontalCandidates(
  page: PageSnapContext,
  others: readonly RectMm[],
  guides: readonly LayoutGuide[],
  settings: SnapSettings,
): Candidate[] {
  const candidates: Candidate[] = [];

  if (settings.toMargins) {
    candidates.push(
      { positionMm: page.bandTopMm, source: 'margin' },
      { positionMm: page.bandBottomMm, source: 'margin' },
    );
  }
  if (settings.toCentre) {
    candidates.push({ positionMm: page.pageHeightMm / 2, source: 'centre' });
  }
  if (settings.toGuides) {
    for (const guide of guides) {
      if (guide.axis === 'horizontal') candidates.push({ positionMm: guide.positionMm, source: 'guide' });
    }
  }
  if (settings.toObjects) {
    for (const rect of others) {
      candidates.push(
        { positionMm: rect.yMm, source: 'object' },
        { positionMm: rectCentre(rect).yMm, source: 'object' },
        { positionMm: rectBottom(rect), source: 'object' },
      );
    }
  }

  return candidates;
}

/**
 * Resolve one axis.
 *
 * The moving rectangle offers three edges (start, centre, end); each is tested against
 * every candidate and the SMALLEST correction wins. Testing all three rather than just
 * the leading edge is what makes centre-to-centre and right-to-right alignment work
 * without a separate mode.
 */
function resolveAxis(
  movingEdges: readonly number[],
  candidates: readonly Candidate[],
  thresholdMm: number,
  gridPitchMm: number | null,
): { correctionMm: number; hit: Candidate | null } {
  let best: { correctionMm: number; hit: Candidate } | null = null;

  for (const edge of movingEdges) {
    for (const candidate of candidates) {
      const correction = candidate.positionMm - edge;
      if (Math.abs(correction) > thresholdMm) continue;
      if (best === null || Math.abs(correction) < Math.abs(best.correctionMm)) {
        best = { correctionMm: correction, hit: candidate };
      }
    }
  }

  if (best) return best;

  // The grid is the FALLBACK, never a competitor: an object beside a neighbour should
  // align to the neighbour, not to whichever grid line happens to be marginally nearer.
  if (gridPitchMm !== null && movingEdges.length > 0) {
    const leading = movingEdges[0];
    const snapped = Math.round(leading / gridPitchMm) * gridPitchMm;
    const correction = snapped - leading;
    if (Math.abs(correction) <= thresholdMm) {
      return { correctionMm: correction, hit: { positionMm: snapped, source: 'grid' } };
    }
  }

  return { correctionMm: NO_CORRECTION_MM, hit: null };
}

export interface SnapResult {
  /** The corrected delta the caller should actually apply. */
  readonly dxMm: number;
  readonly dyMm: number;
  /** Lines to draw, explaining what happened. Empty when nothing snapped. */
  readonly guides: readonly SmartGuide[];
}

/**
 * Snap a drag.
 *
 * `moving` is the selection's bounds BEFORE the drag; `dxMm`/`dyMm` is the raw delta.
 * The result is the delta to apply, plus the guides to draw.
 */
export function snapDrag(input: {
  readonly moving: RectMm;
  readonly dxMm: number;
  readonly dyMm: number;
  readonly others: readonly RectMm[];
  readonly guides: readonly LayoutGuide[];
  readonly page: PageSnapContext;
  readonly settings: SnapSettings;
  readonly thresholdMm: number;
}): SnapResult {
  const { moving, dxMm, dyMm, others, guides, page, settings, thresholdMm } = input;

  if (!settings.enabled) return { dxMm: roundMm(dxMm), dyMm: roundMm(dyMm), guides: [] };

  const proposed: RectMm = { ...moving, xMm: moving.xMm + dxMm, yMm: moving.yMm + dyMm };
  const centre = rectCentre(proposed);

  const vertical = resolveAxis(
    [proposed.xMm, centre.xMm, rectRight(proposed)],
    verticalCandidates(page, others, guides, settings),
    thresholdMm,
    settings.toGrid ? GRID_PITCH_MM : null,
  );
  const horizontal = resolveAxis(
    [proposed.yMm, centre.yMm, rectBottom(proposed)],
    horizontalCandidates(page, others, guides, settings),
    thresholdMm,
    settings.toGrid ? GRID_PITCH_MM : null,
  );

  const drawn: SmartGuide[] = [];
  const snapped: RectMm = {
    ...proposed,
    xMm: proposed.xMm + vertical.correctionMm,
    yMm: proposed.yMm + horizontal.correctionMm,
  };

  if (vertical.hit) {
    drawn.push({
      axis: 'vertical',
      positionMm: vertical.hit.positionMm,
      source: vertical.hit.source,
      // Drawn across the union of the moving object and the page, so the line visibly
      // connects what snapped to what it snapped against.
      fromMm: Math.min(snapped.yMm, 0),
      toMm: Math.max(rectBottom(snapped), page.pageHeightMm),
    });
  }
  if (horizontal.hit) {
    drawn.push({
      axis: 'horizontal',
      positionMm: horizontal.hit.positionMm,
      source: horizontal.hit.source,
      fromMm: Math.min(snapped.xMm, 0),
      toMm: Math.max(rectRight(snapped), page.pageWidthMm),
    });
  }

  return {
    dxMm: roundMm(dxMm + vertical.correctionMm),
    dyMm: roundMm(dyMm + horizontal.correctionMm),
    guides: drawn,
  };
}

/**
 * Snap a resize.
 *
 * Only the edges the handle actually moves are offered as candidates. Snapping a fixed
 * edge would move it — which is not a resize, and is the classic way a resize handle
 * ends up dragging the whole object.
 */
export function snapResize(input: {
  readonly proposed: RectMm;
  readonly movesLeft: boolean;
  readonly movesRight: boolean;
  readonly movesTop: boolean;
  readonly movesBottom: boolean;
  readonly others: readonly RectMm[];
  readonly guides: readonly LayoutGuide[];
  readonly page: PageSnapContext;
  readonly settings: SnapSettings;
  readonly thresholdMm: number;
}): { rect: RectMm; guides: readonly SmartGuide[] } {
  const { proposed, others, guides, page, settings, thresholdMm } = input;
  if (!settings.enabled) return { rect: proposed, guides: [] };

  const verticals = verticalCandidates(page, others, guides, settings);
  const horizontals = horizontalCandidates(page, others, guides, settings);
  const grid = settings.toGrid ? GRID_PITCH_MM : null;

  let { xMm, yMm, widthMm, heightMm } = proposed;
  const drawn: SmartGuide[] = [];

  const apply = (
    moves: boolean,
    edge: number,
    candidates: readonly Candidate[],
    axis: SmartGuide['axis'],
  ): number => {
    if (!moves) return 0;
    const { correctionMm, hit } = resolveAxis([edge], candidates, thresholdMm, grid);
    if (hit) {
      drawn.push({
        axis,
        positionMm: hit.positionMm,
        source: hit.source,
        fromMm: ORIGIN_MM,
        toMm: axis === 'vertical' ? page.pageHeightMm : page.pageWidthMm,
      });
    }
    return correctionMm;
  };

  const left = apply(input.movesLeft, xMm, verticals, 'vertical');
  xMm += left;
  widthMm -= left;

  const right = apply(input.movesRight, xMm + widthMm, verticals, 'vertical');
  widthMm += right;

  const top = apply(input.movesTop, yMm, horizontals, 'horizontal');
  yMm += top;
  heightMm -= top;

  const bottom = apply(input.movesBottom, yMm + heightMm, horizontals, 'horizontal');
  heightMm += bottom;

  return {
    rect: { xMm: roundMm(xMm), yMm: roundMm(yMm), widthMm: roundMm(widthMm), heightMm: roundMm(heightMm) },
    guides: drawn,
  };
}

/**
 * Snap a rotation to a cardinal step.
 *
 * 15° is the step every design tool uses for shift-rotate, and rotating to exactly 90°
 * by hand is otherwise nearly impossible with a pointer.
 */
export const ROTATION_SNAP_DEG = 15;

export function snapRotation(degrees: number, enabled: boolean): number {
  if (!enabled) return degrees;
  return Math.round(degrees / ROTATION_SNAP_DEG) * ROTATION_SNAP_DEG;
}

/* ── Equal spacing ──────────────────────────────────────────────────────── */

/**
 * Detect that a dragged object is forming an equal-spacing run with two neighbours.
 *
 * The measurement Figma draws as a pair of matching arrows. Reported as a hint the
 * canvas can render; it does NOT alter the drag, because a spacing snap that moved the
 * object would fight the edge snaps above it.
 */
export interface SpacingHint {
  readonly axis: 'horizontal' | 'vertical';
  readonly gapMm: number;
  readonly betweenMm: readonly [number, number][];
}

export function equalSpacingHint(
  moving: RectMm,
  others: readonly RectMm[],
  axis: 'horizontal' | 'vertical',
  toleranceMm: number,
): SpacingHint | null {
  const start = (rect: RectMm) => (axis === 'horizontal' ? rect.xMm : rect.yMm);
  const end = (rect: RectMm) => (axis === 'horizontal' ? rectRight(rect) : rectBottom(rect));

  const line = [...others, moving].sort((a, b) => start(a) - start(b));
  if (line.length < 3) return null;

  const gaps: number[] = [];
  for (let i = 1; i < line.length; i += 1) gaps.push(start(line[i]) - end(line[i - 1]));

  const first = gaps[0];
  const equal = gaps.every((gap) => Math.abs(gap - first) <= toleranceMm);
  if (!equal || first <= 0) return null;

  return {
    axis,
    gapMm: roundMm(first),
    betweenMm: gaps.map((_, i) => [end(line[i]), start(line[i + 1])] as [number, number]),
  };
}

/* ── Convenience ────────────────────────────────────────────────────────── */

/** Other objects' bounds, excluding the ones being dragged. Hidden ones do not snap. */
export function snapTargets(
  objects: readonly LayoutObject[],
  excludeIds: readonly string[],
  pageIndex: number,
): RectMm[] {
  const excluded = new Set(excludeIds);
  return objects
    .filter((object) => object.pageIndex === pageIndex && !object.hidden && !excluded.has(object.id))
    .map(objectBounds);
}
