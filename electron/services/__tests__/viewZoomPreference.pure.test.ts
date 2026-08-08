import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  clampZoomLevel,
  readSavedZoomLevel,
  saveZoomLevel,
  createZoomPersistenceController,
  DEFAULT_SAVE_DEBOUNCE_MS,
} from '../viewZoomPreference.pure';

/**
 * UX Improvement — Persist View Zoom Level v1.
 *
 * The View menu's zoomIn/zoomOut items (`main.ts`) are Electron's own built-in
 * roles — this suite covers only what this pack ADDS around them: reading and
 * writing `view-zoom.json` under the app's data directory, and the debounce/flush
 * timing that decides when a zoom change actually reaches disk. `main.ts`'s
 * BrowserWindow wiring itself is untestable here (no Electron runtime — see
 * `vitest.electron.config.ts`) and is kept intentionally thin around this module.
 */

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-zoom-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── clampZoomLevel ────────────────────────────────────────────────────────────

describe('clampZoomLevel', () => {
  it('passes ordinary values through unchanged', () => {
    expect(clampZoomLevel(0)).toBe(0);
    expect(clampZoomLevel(2.5)).toBe(2.5);
    expect(clampZoomLevel(-3)).toBe(-3);
  });

  it('clamps a value above the maximum', () => {
    expect(clampZoomLevel(50)).toBe(8);
  });

  it('clamps a value below the minimum', () => {
    expect(clampZoomLevel(-50)).toBe(-8);
  });

  it('degrades NaN and Infinity to the default zoom rather than propagating them', () => {
    expect(clampZoomLevel(NaN)).toBe(0);
    expect(clampZoomLevel(Infinity)).toBe(0);
    expect(clampZoomLevel(-Infinity)).toBe(0);
  });
});

// ── readSavedZoomLevel / saveZoomLevel ───────────────────────────────────────

describe('readSavedZoomLevel', () => {
  it('returns null on first run — no file has ever been written', () => {
    expect(readSavedZoomLevel(dir)).toBeNull();
  });

  it('returns exactly what was saved', () => {
    saveZoomLevel(dir, 3);
    expect(readSavedZoomLevel(dir)).toBe(3);
  });

  it('returns null for a corrupt file instead of throwing — never blocks startup', () => {
    fs.writeFileSync(path.join(dir, 'view-zoom.json'), '{not json');
    expect(() => readSavedZoomLevel(dir)).not.toThrow();
    expect(readSavedZoomLevel(dir)).toBeNull();
  });

  it('returns null when the file is valid JSON but has no zoomLevel field', () => {
    fs.writeFileSync(path.join(dir, 'view-zoom.json'), JSON.stringify({ other: 'data' }));
    expect(readSavedZoomLevel(dir)).toBeNull();
  });

  it('returns null when zoomLevel is not a number', () => {
    fs.writeFileSync(path.join(dir, 'view-zoom.json'), JSON.stringify({ zoomLevel: 'big' }));
    expect(readSavedZoomLevel(dir)).toBeNull();
  });

  it('clamps an out-of-range value read back from a hand-edited file', () => {
    fs.writeFileSync(path.join(dir, 'view-zoom.json'), JSON.stringify({ zoomLevel: 999 }));
    expect(readSavedZoomLevel(dir)).toBe(8);
  });
});

describe('saveZoomLevel', () => {
  it('persists a value that a later read recovers', () => {
    saveZoomLevel(dir, -2);
    expect(readSavedZoomLevel(dir)).toBe(-2);
  });

  it('overwrites the previous value rather than appending', () => {
    saveZoomLevel(dir, 1);
    saveZoomLevel(dir, 4);
    expect(readSavedZoomLevel(dir)).toBe(4);
    expect(fs.readdirSync(dir).filter((f) => f.includes('view-zoom'))).toHaveLength(1);
  });

  it('clamps before writing', () => {
    saveZoomLevel(dir, 100);
    expect(readSavedZoomLevel(dir)).toBe(8);
  });

  it('creates the data directory if it does not exist yet', () => {
    const nested = path.join(dir, 'not-yet-created');
    expect(() => saveZoomLevel(nested, 1)).not.toThrow();
    expect(readSavedZoomLevel(nested)).toBe(1);
  });

  it('never throws even when the target cannot be written', () => {
    // A file where a directory is expected makes fs.mkdirSync fail underneath it.
    const blocker = path.join(dir, 'blocked');
    fs.writeFileSync(blocker, 'x');
    expect(() => saveZoomLevel(path.join(blocker, 'nested'), 1)).not.toThrow();
  });
});

// ── createZoomPersistenceController ──────────────────────────────────────────

describe('createZoomPersistenceController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('getInitialZoomLevel reflects whatever is already saved on disk', () => {
    saveZoomLevel(dir, 5);
    const controller = createZoomPersistenceController(dir);
    expect(controller.getInitialZoomLevel()).toBe(5);
  });

  it('getInitialZoomLevel is null on a fresh install', () => {
    const controller = createZoomPersistenceController(dir);
    expect(controller.getInitialZoomLevel()).toBeNull();
  });

  it('does NOT write to disk immediately on scheduleSave — it is debounced', () => {
    const controller = createZoomPersistenceController(dir);
    controller.scheduleSave(2);
    expect(readSavedZoomLevel(dir)).toBeNull();
  });

  it('writes to disk once the debounce window elapses', () => {
    const controller = createZoomPersistenceController(dir);
    controller.scheduleSave(2);
    vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS);
    expect(readSavedZoomLevel(dir)).toBe(2);
  });

  it('collapses rapid successive changes (holding Ctrl+=) into a single write of the LAST value', () => {
    const controller = createZoomPersistenceController(dir);
    controller.scheduleSave(1);
    vi.advanceTimersByTime(100);
    controller.scheduleSave(2);
    vi.advanceTimersByTime(100);
    controller.scheduleSave(3);
    vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS);

    expect(readSavedZoomLevel(dir)).toBe(3);
  });

  it('a custom debounce window is honoured', () => {
    const controller = createZoomPersistenceController(dir, 1000);
    controller.scheduleSave(2);
    vi.advanceTimersByTime(400); // the production default — must NOT have fired yet
    expect(readSavedZoomLevel(dir)).toBeNull();
    vi.advanceTimersByTime(600);
    expect(readSavedZoomLevel(dir)).toBe(2);
  });

  it('flush() writes a pending change immediately, before the debounce window elapses', () => {
    const controller = createZoomPersistenceController(dir);
    controller.scheduleSave(4);
    controller.flush();
    expect(readSavedZoomLevel(dir)).toBe(4);
  });

  it('flush() is a no-op when nothing is pending — never writes a phantom value', () => {
    const controller = createZoomPersistenceController(dir);
    controller.flush();
    expect(readSavedZoomLevel(dir)).toBeNull();
  });

  it('flush() cancels the pending timer — no double write and no crash if the timer would have fired later', () => {
    const controller = createZoomPersistenceController(dir);
    controller.scheduleSave(4);
    controller.flush();
    saveZoomLevel(dir, 7); // simulate something else writing in between
    vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS);
    expect(readSavedZoomLevel(dir)).toBe(7); // the (cancelled) debounced 4 never overwrote it
  });

  it('the quit-flush scenario: a zoom change right before quitting is not lost', () => {
    // Mirrors main.ts's before-quit handler: scheduleSave from zoom-changed,
    // then flush() before the process actually exits — no timers ever fire on
    // their own in this scenario.
    const controller = createZoomPersistenceController(dir);
    controller.scheduleSave(6);
    controller.flush(); // as if before-quit fired 50ms later, well inside the debounce window
    expect(readSavedZoomLevel(dir)).toBe(6);
  });

  it('two independent controllers over the same directory do not corrupt each other\'s write', () => {
    const a = createZoomPersistenceController(dir);
    const b = createZoomPersistenceController(dir);
    a.scheduleSave(1);
    vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS);
    b.scheduleSave(2);
    vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS);
    expect(readSavedZoomLevel(dir)).toBe(2);
  });
});

// ── End-to-end: relaunch simulation ──────────────────────────────────────────

describe('relaunch restores the last zoom level (end to end, no Electron)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a fresh install uses the default (null ⇒ caller keeps Electron\'s own 0)', () => {
    const firstLaunch = createZoomPersistenceController(dir);
    expect(firstLaunch.getInitialZoomLevel()).toBeNull();
  });

  it('a zoom change survives a simulated app close and relaunch', () => {
    const session1 = createZoomPersistenceController(dir);
    session1.scheduleSave(3);
    vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS); // "app closes" — write has landed

    const session2 = createZoomPersistenceController(dir); // "app relaunches"
    expect(session2.getInitialZoomLevel()).toBe(3);
  });

  it('several zoom-in/zoom-out steps across a session persist only the final level', () => {
    const session1 = createZoomPersistenceController(dir);
    for (const level of [1, 2, 3, 2, 1, 0, -1]) {
      session1.scheduleSave(level);
      vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS);
    }

    const session2 = createZoomPersistenceController(dir);
    expect(session2.getInitialZoomLevel()).toBe(-1);
  });
});
