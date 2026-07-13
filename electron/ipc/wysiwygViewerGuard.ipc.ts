/**
 * WYSIWYG viewer guard — side effects (main process).
 *
 * Closes the two PDFium keyboard exits (Ctrl+P print, Ctrl+S save) that would bypass
 * manarERP's official print path, WITHOUT touching the legacy print implementation and
 * without any global keyboard blocking.
 *
 * Shape:
 *   • ONE `before-input-event` listener, installed once on the app window at bootstrap.
 *     It is never added or removed per dialog, so repeated open/close cannot leak or
 *     duplicate listeners. It only consults the session state.
 *   • `wysiwygViewer:activate` / `wysiwygViewer:deactivate` — a narrow, viewer-specific
 *     channel. It exposes NO generic keyboard control: a renderer can say "a WYSIWYG
 *     viewer is open" and nothing else. It cannot choose which keys are suppressed.
 *
 * Every decision (which keys; who owns the guard) lives in `wysiwygViewerGuardPolicy.ts`
 * as a pure, unit-tested function. This file owns only the wiring.
 */

import { BrowserWindow, ipcMain } from 'electron';
import {
  activateSession,
  clearSessions,
  deactivateSession,
  initialViewerSessionState,
  isGuardedShortcut,
  isViewerActive,
  type ViewerSessionState,
} from './wysiwygViewerGuardPolicy';

let state: ViewerSessionState = initialViewerSessionState();

/** Read-only view for the generation channel (see wysiwygPoc.ipc.ts). */
export function isWysiwygViewerActive(): boolean {
  return isViewerActive(state);
}

export function registerWysiwygViewerGuard(window: BrowserWindow): void {
  // Installed ONCE, for the window's lifetime. Not per dialog.
  window.webContents.on('before-input-event', (event, input) => {
    if (!isViewerActive(state)) return; // no viewer open ⇒ the app behaves exactly as before
    if (!isGuardedShortcut(input)) return; // anything else ⇒ untouched
    // Suppress silently: no print, no save, no error, no fallback action.
    event.preventDefault();
  });

  // Renderer gone (crash, reload, window closed) ⇒ the guard must not survive it.
  window.webContents.on('destroyed', () => {
    state = clearSessions(state);
  });
  window.on('closed', () => {
    state = clearSessions(state);
  });

  ipcMain.handle('wysiwygViewer:activate', (event): number | null => {
    // Sender validation: only a real app window may arm the guard.
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (!senderWin || senderWin !== window) return null;
    const next = activateSession(state);
    state = next.state;
    return next.token;
  });

  ipcMain.handle('wysiwygViewer:deactivate', (event, rawToken: unknown): boolean => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (!senderWin || senderWin !== window) return false;
    if (!Number.isInteger(rawToken)) return false;
    // A stale token (an older dialog unmounting after a newer one opened) is ignored —
    // it cannot disarm the live viewer's guard.
    state = deactivateSession(state, rawToken as number);
    return !isViewerActive(state);
  });
}

/** Test/bootstrap seam: reset module state (used by app teardown paths). */
export function resetWysiwygViewerGuardState(): void {
  state = initialViewerSessionState();
}
