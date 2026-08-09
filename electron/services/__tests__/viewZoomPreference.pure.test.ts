import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { clampZoomLevel, readSavedZoomLevel, saveZoomLevel } from '../viewZoomPreference.pure';

/**
 * View Zoom Manual Save Pack v1.
 *
 * The View menu's zoomIn/zoomOut items (`main.ts`) are Electron's own built-in
 * roles — this suite covers what this pack ADDS around them: reading and writing
 * `view-zoom.json` under the app's data directory. Saving is explicit-only now
 * (the "حفظ مستوى التكبير الحالي كافتراضي" menu item calls `saveZoomLevel`
 * directly and synchronously) — there is no debounce, no scheduled write, and no
 * listener to test, since none exists any more. `main.ts`'s BrowserWindow wiring
 * itself is untestable here (no Electron runtime — see `vitest.electron.config.ts`)
 * and is kept intentionally thin around this module.
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

  it('writes synchronously — the value is on disk before saveZoomLevel returns, no timer involved', () => {
    // View Zoom Manual Save Pack v1's core guarantee: a manual save has no
    // debounce window to wait out. If this were still scheduled on a timer,
    // reading immediately afterward (no fake-timer advance anywhere in this
    // file any more) would see the PREVIOUS value, not this one.
    expect(readSavedZoomLevel(dir)).toBeNull();
    saveZoomLevel(dir, 2);
    expect(readSavedZoomLevel(dir)).toBe(2);
  });
});

// ── End-to-end: manual save survives a simulated relaunch ───────────────────

describe('a manually saved zoom level survives a simulated relaunch', () => {
  it('save now, "relaunch" (fresh read), and the level is still there', () => {
    saveZoomLevel(dir, 3);
    // Nothing else runs between save and "relaunch" — no controller, no
    // session object, no state to reconstruct; readSavedZoomLevel is the
    // entire restore path main.ts uses at startup.
    expect(readSavedZoomLevel(dir)).toBe(3);
  });

  it('a fresh install (never saved) still restores to null, letting the caller keep the default', () => {
    expect(readSavedZoomLevel(dir)).toBeNull();
  });

  it('only the LAST manual save before quitting is what a relaunch restores', () => {
    for (const level of [1, 2, 3, 2, 1, 0, -1]) {
      saveZoomLevel(dir, level);
    }
    expect(readSavedZoomLevel(dir)).toBe(-1);
  });
});

describe('legacy on-disk format compatibility', () => {
  it('reads a file written by the old auto-save pack unchanged — the format never changed', () => {
    // Simulates a user upgrading from View Zoom Persistence Pack v1 (the
    // auto-save design) straight into this pack: the file this pack reads is
    // byte-identical in shape to what the old `saveZoomLevel` call wrote.
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'view-zoom.json'), JSON.stringify({ zoomLevel: 5 }, null, 2));
    expect(readSavedZoomLevel(dir)).toBe(5);
  });
});
