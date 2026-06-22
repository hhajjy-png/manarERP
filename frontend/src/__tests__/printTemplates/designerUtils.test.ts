import { describe, it, expect } from 'vitest';
import {
  snapToGrid, formatUnit, keyboardMove,
  historyPush, historyUndo, historyRedo,
} from '../../print-templates/utils/designerUtils';

describe('snapToGrid', () => {
  it('snaps down to nearest multiple', () => expect(snapToGrid(7, 5, true)).toBe(5));
  it('snaps up to nearest multiple', () => expect(snapToGrid(8, 5, true)).toBe(10));
  it('no-op when already on grid', () => expect(snapToGrid(10, 5, true)).toBe(10));
  it('returns value unchanged when disabled', () => expect(snapToGrid(7, 5, false)).toBe(7));
  it('handles negative values snap down', () => expect(snapToGrid(-7, 5, true)).toBe(-5));
  it('handles negative values snap up', () => expect(snapToGrid(-8, 5, true)).toBe(-10));
  it('returns value unchanged for gridSize <= 0', () => expect(snapToGrid(7, 0, true)).toBe(7));
});

describe('formatUnit', () => {
  it('formats whole number without decimal', () => expect(formatUnit(10)).toBe('10'));
  it('formats negative whole number', () => expect(formatUnit(-5)).toBe('-5'));
  it('formats 1 decimal place', () => expect(formatUnit(10.5)).toBe('10.5'));
  it('rounds to 1 decimal', () => expect(formatUnit(10.123)).toBe('10.1'));
  it('rounds up at .15', () => expect(formatUnit(10.156)).toBe('10.2'));
  it('no trailing zero for .0', () => expect(formatUnit(10.0)).toBe('10'));
});

describe('keyboardMove', () => {
  const pos = { x: 0, y: 0 };
  it('right increases x', () => expect(keyboardMove(pos, 'right', 1)).toEqual({ x: 1, y: 0 }));
  it('left decreases x', () => expect(keyboardMove(pos, 'left', 10)).toEqual({ x: -10, y: 0 }));
  it('up decreases y', () => expect(keyboardMove(pos, 'up', 1)).toEqual({ x: 0, y: -1 }));
  it('down increases y', () => expect(keyboardMove(pos, 'down', 1)).toEqual({ x: 0, y: 1 }));
  it('does not mutate original', () => {
    const original = { x: 5, y: 5 };
    keyboardMove(original, 'right', 3);
    expect(original).toEqual({ x: 5, y: 5 });
  });
});

describe('historyPush', () => {
  it('appends new state', () => {
    const r = historyPush([{ x: 0 }], 0, { x: 1 }, 30);
    expect(r).toEqual({ history: [{ x: 0 }, { x: 1 }], cursor: 1 });
  });
  it('truncates forward history on branch', () => {
    const r = historyPush([{ x: 0 }, { x: 1 }, { x: 2 }], 1, { x: 5 }, 30);
    expect(r).toEqual({ history: [{ x: 0 }, { x: 1 }, { x: 5 }], cursor: 2 });
  });
  it('drops oldest when at max', () => {
    const r = historyPush([{ x: 0 }, { x: 1 }, { x: 2 }], 2, { x: 3 }, 3);
    expect(r.history).toHaveLength(3);
    expect(r.history[0]).toEqual({ x: 1 });
    expect(r.cursor).toBe(2);
  });
});

describe('historyUndo', () => {
  it('returns previous state', () => {
    expect(historyUndo([{ x: 0 }, { x: 1 }], 1)).toEqual({ state: { x: 0 }, cursor: 0 });
  });
  it('returns null at start', () => expect(historyUndo([{ x: 0 }], 0)).toBeNull());
});

describe('historyRedo', () => {
  it('returns next state', () => {
    expect(historyRedo([{ x: 0 }, { x: 1 }], 0)).toEqual({ state: { x: 1 }, cursor: 1 });
  });
  it('returns null at end', () => expect(historyRedo([{ x: 0 }, { x: 1 }], 1)).toBeNull());
});
