import fs from 'fs';
import path from 'path';
import { writeFileAtomicSync } from './atomicFile';

/**
 * UX Improvement — Persist View Zoom Level v1.
 *
 * The View menu's "تكبير"/"تصغير" (zoomIn/zoomOut) items in `main.ts` are
 * Electron's built-in `role: 'zoomIn' | 'zoomOut'` — unchanged by this file, same
 * accelerators, same labels. Chromium's `webContents.zoomLevel` is process-memory
 * only and always resets to 0 (100%) on relaunch; this module is the persistence
 * layer around it, so the app reopens at whatever zoom the user left it at.
 *
 * Storage follows the SAME convention already used for other main-process local
 * state (`device-identity.json`, `db-bootstrap-state.json`, …): one small JSON
 * file under the app's data directory, written atomically via
 * `writeFileAtomicSync` — no new settings system, no backend call, no IPC channel.
 * A zoom change from the View menu happens entirely in the main process, so
 * nothing here needs the renderer, the backend `/api/settings` table, or a
 * signed-in session — all of which may not exist yet when the user zooms.
 *
 * `viewZoomPreference.pure.ts` has no `electron` import, so it runs directly under
 * Vitest with no Electron runtime (see `vitest.electron.config.ts`) — the actual
 * `BrowserWindow`/`webContents` wiring in `main.ts` stays a thin, untested shim
 * around the logic here, matching every other `.pure.ts` module in this codebase.
 */

const FILE_NAME = 'view-zoom.json';

/**
 * Chromium clamps `zoomFactor` to roughly 0.25–5.0 internally (kMinimum/
 * MaximumZoomFactor), which is a `zoomLevel` of about −8.83 to +8.83 at the
 * default 1.2 step (`zoomFactor = 1.2^zoomLevel`). Clamped defensively on our
 * side too, so a hand-edited or corrupted preference file can never hand back a
 * level that renders the app unusable.
 */
const MIN_ZOOM_LEVEL = -8;
const MAX_ZOOM_LEVEL = 8;

/** Default debounce window between a zoom change and the disk write it causes. */
export const DEFAULT_SAVE_DEBOUNCE_MS = 400;

export function clampZoomLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, value));
}

function filePath(dataDir: string): string {
  return path.join(dataDir, FILE_NAME);
}

/**
 * The last saved zoom level, or `null` when nothing was ever saved (first run)
 * or the file is missing/corrupt. `null` means "use Electron's own default" —
 * the caller never has to special-case first launch.
 */
export function readSavedZoomLevel(dataDir: string): number | null {
  const file = filePath(dataDir);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { zoomLevel?: unknown };
    if (typeof raw.zoomLevel !== 'number') return null;
    return clampZoomLevel(raw.zoomLevel);
  } catch {
    return null; // ملف تالف — يُعامَل كأول تشغيل، لا يُعطَّل الإقلاع لأجله
  }
}

/**
 * Persist a zoom level. Best-effort, matching every sibling local-state writer
 * in this codebase (`dbBootstrapState.ts`'s `write()`, `deviceIdentity.service.ts`):
 * a full disk or a permissions error means the NEXT zoom change simply overwrites
 * the same content again — it must never surface to the user or interrupt zooming.
 */
export function saveZoomLevel(dataDir: string, zoomLevel: number): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    writeFileAtomicSync(filePath(dataDir), JSON.stringify({ zoomLevel: clampZoomLevel(zoomLevel) }, null, 2));
  } catch {
    /* أفضل جهد — انظر تعليق الدالة */
  }
}

export interface ZoomPersistenceController {
  /** The zoom level to restore at launch, or `null` for Electron's own default. */
  getInitialZoomLevel(): number | null;
  /** Call on every `zoom-changed` event; writes to disk after a short quiet period. */
  scheduleSave(zoomLevel: number): void;
  /** Write any pending scheduled save immediately and cancel its timer. Call before quit. */
  flush(): void;
}

/**
 * One controller per app launch, holding the debounce timer and the initial read.
 *
 * Debounced rather than written on every `zoom-changed` event because a user
 * holding Ctrl+= fires several events in quick succession — writing to disk on
 * each one is the kind of repeated-I/O-per-keystroke this codebase already
 * guards against elsewhere (see `getUserDataPaths()`'s once-per-process bootstrap
 * guard). `flush()` exists so a quit that lands inside the debounce window still
 * persists the user's last change — see the `before-quit` handler in `main.ts`.
 */
export function createZoomPersistenceController(
  dataDir: string,
  debounceMs: number = DEFAULT_SAVE_DEBOUNCE_MS,
): ZoomPersistenceController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingLevel: number | null = null;

  return {
    getInitialZoomLevel: () => readSavedZoomLevel(dataDir),

    scheduleSave(zoomLevel: number) {
      pendingLevel = zoomLevel;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const level = pendingLevel;
        pendingLevel = null;
        if (level !== null) saveZoomLevel(dataDir, level);
      }, debounceMs);
    },

    flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (pendingLevel !== null) {
        saveZoomLevel(dataDir, pendingLevel);
        pendingLevel = null;
      }
    },
  };
}
