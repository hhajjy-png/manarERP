export type ZoomLevel = 50 | 75 | 100 | 150 | 200 | 'fit';
export const ZOOM_PRESETS = [50, 75, 100, 150, 200] as const;
export const GRID_SIZES = [1, 2, 5, 10] as const;
export type GridSizeOption = typeof GRID_SIZES[number];

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
