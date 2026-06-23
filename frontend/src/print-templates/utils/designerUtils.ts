export type ZoomLevel = 50 | 75 | 100 | 150 | 200 | 'fit-width' | 'fit-page' | 'fit';
export const ZOOM_PRESETS = [50, 75, 100, 150, 200] as const;
export const GRID_SIZES = [1, 2, 5, 10] as const;
export type GridSizeOption = typeof GRID_SIZES[number];

export const GRID_PRESETS = [
  { value: 2 as GridSizeOption, label: 'ناعمة (2)' },
  { value: 5 as GridSizeOption, label: 'متوسطة (5)' },
  { value: 10 as GridSizeOption, label: 'خشنة (10)' },
] as const;

/** Snap value to nearest grid multiple. Returns original if disabled or gridSize ≤ 0. */
export function snapToGrid(value: number, gridSize: number, enabled: boolean): number {
  if (!enabled || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

/** Round to at most 1 decimal place, dropping trailing zeros. */
export function formatUnit(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** Move position by one keyboard step. 'up' decreases y (CSS coordinate direction). */
export function keyboardMove(
  pos: { x: number; y: number },
  direction: 'left' | 'right' | 'up' | 'down',
  step: number,
): { x: number; y: number } {
  switch (direction) {
    case 'left':  return { ...pos, x: pos.x - step };
    case 'right': return { ...pos, x: pos.x + step };
    case 'up':    return { ...pos, y: pos.y - step };
    case 'down':  return { ...pos, y: pos.y + step };
  }
}

/** Push new state. Truncates forward history if cursor is not at end. Drops oldest beyond max. */
export function historyPush<T>(
  history: T[],
  cursor: number,
  newState: T,
  maxEntries: number,
): { history: T[]; cursor: number } {
  const truncated = history.slice(0, cursor + 1);
  const next = [...truncated, newState];
  if (next.length > maxEntries) {
    return { history: next.slice(next.length - maxEntries), cursor: maxEntries - 1 };
  }
  return { history: next, cursor: next.length - 1 };
}

/** Undo: returns previous state or null if at start. */
export function historyUndo<T>(
  history: T[],
  cursor: number,
): { state: T; cursor: number } | null {
  if (cursor <= 0) return null;
  return { state: history[cursor - 1], cursor: cursor - 1 };
}

/** Redo: returns next state or null if at end. */
export function historyRedo<T>(
  history: T[],
  cursor: number,
): { state: T; cursor: number } | null {
  if (cursor >= history.length - 1) return null;
  return { state: history[cursor + 1], cursor: cursor + 1 };
}

// ── mm ↔ px conversion (A4: 794px = 210mm) ──────────────────────────────────

export const PX_PER_MM = 794 / 210; // ≈ 3.7795

export function mmToPx(mm: number): number { return mm * PX_PER_MM; }
export function pxToMm(px: number): number { return px / PX_PER_MM; }

// ── Smart guides ──────────────────────────────────────────────────────────────

export interface ElementRect { x: number; y: number; w: number; h: number; }

export interface GuideLine {
  axis: 'x' | 'y'; // x = vertical line, y = horizontal line
  position: number; // px coordinate on that axis
  from: number;     // perpendicular axis start (for rendering)
  to: number;       // perpendicular axis end
}

export interface GuideSnap {
  lines: GuideLine[];
  dx: number; // x correction to snap
  dy: number; // y correction to snap
}

function centerX(r: ElementRect) { return r.x + r.w / 2; }
function centerY(r: ElementRect) { return r.y + r.h / 2; }

export function computeSmartGuides(
  movingRects: ElementRect[],
  staticRects: ElementRect[],
  canvasW: number,
  canvasH: number,
  threshold = 6,
): GuideSnap {
  const lines: GuideLine[] = [];
  let dx = 0;
  let dy = 0;
  let bestDx = threshold + 1;
  let bestDy = threshold + 1;

  const canvasRect: ElementRect = { x: 0, y: 0, w: canvasW, h: canvasH };
  const allStatic = [...staticRects, canvasRect];

  // X-axis candidates: left edges, centers, right edges
  const xCandidates = allStatic.flatMap((r) => [r.x, centerX(r), r.x + r.w]);
  const yCandidates = allStatic.flatMap((r) => [r.y, centerY(r), r.y + r.h]);

  for (const moving of movingRects) {
    const mPoints = {
      left: moving.x, centerX: centerX(moving), right: moving.x + moving.w,
      top: moving.y, centerY: centerY(moving), bottom: moving.y + moving.h,
    };

    for (const candidate of xCandidates) {
      for (const mKey of ['left', 'centerX', 'right'] as const) {
        const diff = candidate - mPoints[mKey];
        if (Math.abs(diff) < threshold && Math.abs(diff) < Math.abs(bestDx)) {
          bestDx = diff;
          dx = diff;
          lines.push({ axis: 'x', position: candidate, from: 0, to: canvasH });
        }
      }
    }

    for (const candidate of yCandidates) {
      for (const mKey of ['top', 'centerY', 'bottom'] as const) {
        const diff = candidate - mPoints[mKey];
        if (Math.abs(diff) < threshold && Math.abs(diff) < Math.abs(bestDy)) {
          bestDy = diff;
          dy = diff;
          lines.push({ axis: 'y', position: candidate, from: 0, to: canvasW });
        }
      }
    }
  }

  // Deduplicate guide lines
  const seen = new Set<string>();
  const uniqueLines = lines.filter((g) => {
    const key = `${g.axis}:${g.position}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { lines: uniqueLines, dx: bestDx > threshold ? 0 : dx, dy: bestDy > threshold ? 0 : dy };
}
