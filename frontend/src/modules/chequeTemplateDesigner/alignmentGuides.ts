import { ALIGNMENT_SNAP_THRESHOLD_PERCENT } from './designerEngine.constants';

/**
 * Smart alignment guides + snapping. Pure functions, DOM-free. Extracted
 * verbatim (behaviour-preserving) from the Professional module's
 * alignmentGuides.ts — it never depended on any business type.
 */

export interface AlignmentGuide {
  orientation: 'vertical' | 'horizontal';
  /** Position along the design surface, as a percentage. */
  position: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Snap a single edge/center value against candidate positions. Returns the candidate if within threshold, else the original value. */
export function snapValue(value: number, candidates: number[]): { value: number; guide: number | null } {
  let snapped = value;
  let bestDistance = ALIGNMENT_SNAP_THRESHOLD_PERCENT;
  let guide: number | null = null;

  for (const candidate of candidates) {
    const distance = Math.abs(value - candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      snapped = candidate;
      guide = candidate;
    }
  }

  return { value: snapped, guide };
}

/**
 * Smart guides for dragging: snaps the moving box's left/center/right edge
 * (and top/center/bottom edge) against the surface's own edges/center and
 * every other visible field's edges/center, shifting the whole box by the
 * smallest matching delta. Resize snaps a single edge instead, via `snapValue`.
 */
export function computeDragSnap(moving: Box, others: Box[]): { x: number; y: number; guides: AlignmentGuide[] } {
  const candidatesX = [0, 50, 100, ...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width])];
  const candidatesY = [0, 50, 100, ...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height])];

  const edgesX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const edgesY = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];

  let bestDeltaX = 0;
  let bestDistanceX = ALIGNMENT_SNAP_THRESHOLD_PERCENT;
  let guideX: number | null = null;
  edgesX.forEach((edge) => {
    const { guide } = snapValue(edge, candidatesX);
    if (guide === null) return;
    const distance = Math.abs(edge - guide);
    if (distance < bestDistanceX) {
      bestDistanceX = distance;
      bestDeltaX = guide - edge;
      guideX = guide;
    }
  });

  let bestDeltaY = 0;
  let bestDistanceY = ALIGNMENT_SNAP_THRESHOLD_PERCENT;
  let guideY: number | null = null;
  edgesY.forEach((edge) => {
    const { guide } = snapValue(edge, candidatesY);
    if (guide === null) return;
    const distance = Math.abs(edge - guide);
    if (distance < bestDistanceY) {
      bestDistanceY = distance;
      bestDeltaY = guide - edge;
      guideY = guide;
    }
  });

  const guides: AlignmentGuide[] = [];
  if (guideX !== null) guides.push({ orientation: 'vertical', position: guideX });
  if (guideY !== null) guides.push({ orientation: 'horizontal', position: guideY });

  return { x: moving.x + bestDeltaX, y: moving.y + bestDeltaY, guides };
}
