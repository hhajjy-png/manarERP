/**
 * WYSIWYG viewer guard — pure policy layer.
 *
 * Two decisions, both pure and unit-tested, so the IPC module below them owns only
 * side effects (window listeners, IPC handlers):
 *
 *   1. WHICH keystrokes are suppressed  → `isGuardedShortcut`
 *   2. WHETHER a viewer is currently active → the session-token state machine
 *
 * WHY THIS EXISTS. The WYSIWYG preview displays a Chromium-generated PDF in PDFium.
 * PDFium answers Ctrl+P (print) and Ctrl+S (save) ITSELF, inside the plugin — those
 * exits bypass manarERP's official print path and its auditing/PrintJob semantics.
 * A renderer-side `keydown` listener cannot stop them (the plugin is not our document),
 * so the suppression must happen in the MAIN process via `before-input-event`, which
 * does observe input destined for the plugin frame.
 *
 * The guard is NOT a global keyboard blocker: it suppresses exactly two combinations,
 * and only while a WYSIWYG viewer session is active.
 */

// ── 1. Shortcut policy ───────────────────────────────────────────────────────────

/** The shape we need from Electron's `Input`. Kept structural so it is testable. */
export interface GuardedInputLike {
  key: string;
  control: boolean;
  meta: boolean;
  alt: boolean;
}

/** The only keys we ever suppress: PDFium's print and save exits. */
const GUARDED_KEYS = new Set(['p', 's']);

/**
 * Should this keystroke be suppressed?
 *
 * `Ctrl+P` / `Ctrl+S` (and `Cmd+P` / `Cmd+S`, so the policy is already correct if the
 * app is ever built for macOS). Nothing else — plain `p`/`s` typing, scrolling keys,
 * Page Up/Down, Escape and zoom keys are untouched.
 *
 * ALT IS DELIBERATELY EXCLUDED, and this is not cosmetic: on Windows **AltGr is
 * reported as Ctrl+Alt**. An Arabic keyboard uses AltGr for real characters, so
 * matching `control` while ignoring `alt` would swallow legitimate typing. Requiring
 * `alt === false` keeps AltGr composition working.
 */
export function isGuardedShortcut(input: GuardedInputLike): boolean {
  if (!input.control && !input.meta) return false;
  if (input.alt) return false; // AltGr (Ctrl+Alt) must keep typing
  // Electron may report the key in different cases depending on Shift/layout.
  return GUARDED_KEYS.has(String(input.key ?? '').toLowerCase());
}

// ── 2. Viewer session ownership ──────────────────────────────────────────────────
//
// A monotonic token identifies each viewer session. Only the NEWEST session is active.
// This is what makes a stale close harmless: a dialog that was superseded (rapid
// close/reopen, or an unmount racing a new open) carries an old token, and its
// deactivate is ignored rather than disarming the live viewer's guard.

export interface ViewerSessionState {
  /** The token of the session currently guarding, or `null` when nothing is active. */
  activeToken: number | null;
  /** Next token to hand out. Monotonic — tokens are never reused. */
  nextToken: number;
}

export function initialViewerSessionState(): ViewerSessionState {
  return { activeToken: null, nextToken: 1 };
}

export function isViewerActive(state: ViewerSessionState): boolean {
  return state.activeToken !== null;
}

/**
 * Open a session. A second activation while one is live simply supersedes it (newer
 * wins) — it does not stack, and it does not add a listener: the `before-input-event`
 * hook is installed once, for the window's lifetime, and merely consults this state.
 */
export function activateSession(state: ViewerSessionState): { state: ViewerSessionState; token: number } {
  const token = state.nextToken;
  return { state: { activeToken: token, nextToken: token + 1 }, token };
}

/**
 * Close a session — but only the session that actually owns the guard.
 *
 * A stale token (an older dialog unmounting after a newer one opened) is IGNORED, so
 * it cannot disable the newer dialog's guard. An unknown token is ignored for the same
 * reason.
 */
export function deactivateSession(state: ViewerSessionState, token: number): ViewerSessionState {
  if (state.activeToken === null || state.activeToken !== token) return state;
  return { ...state, activeToken: null };
}

/** Renderer died / window closed: drop the guard whoever owned it. */
export function clearSessions(state: ViewerSessionState): ViewerSessionState {
  return { ...state, activeToken: null };
}
