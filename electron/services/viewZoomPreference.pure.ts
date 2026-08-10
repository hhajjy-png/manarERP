import fs from 'fs';
import path from 'path';
import { writeFileAtomicSync } from './atomicFile';

/**
 * View Zoom Manual Save Pack v1 (supersedes Persist View Zoom Level v1's
 * auto-save design — the on-disk format is unchanged, so an existing
 * `view-zoom.json` from the old pack still reads correctly).
 *
 * The View menu's "تكبير"/"تصغير" (zoomIn/zoomOut) items in `main.ts` are
 * Electron's built-in `role: 'zoomIn' | 'zoomOut'` — unchanged by this file, same
 * accelerators, same labels. Chromium's `webContents.zoomLevel` is process-memory
 * only and always resets to 0 (100%) on relaunch; this module is the persistence
 * layer around it, so the app reopens at whatever zoom was last explicitly saved.
 *
 * Saving is explicit only now, from a single View-menu item ("💾 حفظ مستوى
 * التكبير الحالي كافتراضي" in `main.ts`) that calls `saveZoomLevel` directly and
 * synchronously with the live zoom level read at click time. There is
 * deliberately no automatic save path any more: the previous design listened
 * for Electron's `zoom-changed` event and debounced a write, but `zoom-changed`
 * is documented — and was confirmed live, via a runtime investigation of this
 * exact pack — to fire only for mouse-wheel zoom, never for the `zoomIn`/
 * `zoomOut` roles this menu actually uses. The auto-save path silently never
 * captured the only zoom change a user could make here, and a later same-page
 * navigation would resync Chromium's live zoom back to its last-known origin
 * value — which looked like the zoom level reverting on its own. Manual save
 * removes the dependency on that event entirely: nothing needs to detect a
 * zoom change, so nothing can miss one.
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
