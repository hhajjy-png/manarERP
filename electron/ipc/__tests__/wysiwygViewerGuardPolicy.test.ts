import { describe, it, expect } from 'vitest';
import {
  activateSession,
  clearSessions,
  deactivateSession,
  initialViewerSessionState,
  isGuardedShortcut,
  isViewerActive,
} from '../wysiwygViewerGuardPolicy';

const input = (over: Partial<Parameters<typeof isGuardedShortcut>[0]> = {}) => ({
  key: 'p',
  control: false,
  meta: false,
  alt: false,
  ...over,
});

describe('isGuardedShortcut — exactly the PDFium print/save exits, nothing else', () => {
  it('blocks Ctrl+P and Ctrl+S', () => {
    expect(isGuardedShortcut(input({ key: 'p', control: true }))).toBe(true);
    expect(isGuardedShortcut(input({ key: 's', control: true }))).toBe(true);
  });

  it('blocks Cmd+P and Cmd+S (macOS modifier)', () => {
    expect(isGuardedShortcut(input({ key: 'p', meta: true }))).toBe(true);
    expect(isGuardedShortcut(input({ key: 's', meta: true }))).toBe(true);
  });

  it('matches the key case-insensitively (Shift/layout may upper-case it)', () => {
    expect(isGuardedShortcut(input({ key: 'P', control: true }))).toBe(true);
    expect(isGuardedShortcut(input({ key: 'S', meta: true }))).toBe(true);
  });

  it('does NOT block plain p / plain s — ordinary typing is untouched', () => {
    expect(isGuardedShortcut(input({ key: 'p' }))).toBe(false);
    expect(isGuardedShortcut(input({ key: 's' }))).toBe(false);
    expect(isGuardedShortcut(input({ key: 'P' }))).toBe(false);
  });

  it.each([
    ['Ctrl+C', { key: 'c', control: true }],
    ['Ctrl+V', { key: 'v', control: true }],
    ['Ctrl+A', { key: 'a', control: true }],
    ['Ctrl+F', { key: 'f', control: true }],
    ['Escape', { key: 'Escape' }],
    ['PageDown', { key: 'PageDown' }],
    ['ArrowDown', { key: 'ArrowDown' }],
    ['Ctrl+= (zoom in)', { key: '=', control: true }],
    ['Ctrl+- (zoom out)', { key: '-', control: true }],
  ])('does NOT block %s — no broad keyboard suppression', (_label, over) => {
    expect(isGuardedShortcut(input(over))).toBe(false);
  });

  /**
   * AltGr on Windows is reported as Ctrl+Alt. An Arabic keyboard uses AltGr to type real
   * characters, so a guard that matched `control` while ignoring `alt` would swallow
   * legitimate input. Requiring alt === false is a correctness requirement, not polish.
   */
  it('does NOT block AltGr combinations (Windows reports AltGr as Ctrl+Alt)', () => {
    expect(isGuardedShortcut(input({ key: 'p', control: true, alt: true }))).toBe(false);
    expect(isGuardedShortcut(input({ key: 's', control: true, alt: true }))).toBe(false);
  });

  it('does not block a bare modifier press', () => {
    expect(isGuardedShortcut(input({ key: 'Control', control: true }))).toBe(false);
  });
});

describe('viewer session ownership', () => {
  it('starts inactive — the app behaves exactly as before any viewer opens', () => {
    expect(isViewerActive(initialViewerSessionState())).toBe(false);
  });

  it('activate arms the guard and returns a token', () => {
    const { state, token } = activateSession(initialViewerSessionState());
    expect(isViewerActive(state)).toBe(true);
    expect(Number.isInteger(token)).toBe(true);
  });

  it('deactivate with the owning token disarms it — normal behaviour restored', () => {
    const a = activateSession(initialViewerSessionState());
    const after = deactivateSession(a.state, a.token);
    expect(isViewerActive(after)).toBe(false);
  });

  it('tokens are monotonic and never reused', () => {
    const a = activateSession(initialViewerSessionState());
    const b = activateSession(deactivateSession(a.state, a.token));
    expect(b.token).toBeGreaterThan(a.token);
  });

  it('repeated activation supersedes rather than stacking (no listener duplication)', () => {
    const a = activateSession(initialViewerSessionState());
    const b = activateSession(a.state); // second dialog opens without the first closing
    expect(isViewerActive(b.state)).toBe(true);
    // A single deactivate by the CURRENT owner fully disarms — no refcount to unwind.
    expect(isViewerActive(deactivateSession(b.state, b.token))).toBe(false);
  });

  /**
   * THE STALE-CLOSE RACE. An older dialog unmounts *after* a newer one has opened. Its
   * deactivate carries an old token and must be ignored — otherwise it would silently
   * disarm the live viewer's guard and re-open the Ctrl+P / Ctrl+S bypass.
   */
  it('a STALE deactivate cannot disarm a NEWER active session', () => {
    const older = activateSession(initialViewerSessionState());
    const newer = activateSession(older.state);

    const after = deactivateSession(newer.state, older.token); // stale close arrives late
    expect(isViewerActive(after)).toBe(true); // newer session still guarded
    expect(after.activeToken).toBe(newer.token);

    // …and the newer session can still close itself normally.
    expect(isViewerActive(deactivateSession(after, newer.token))).toBe(false);
  });

  it('an unknown/forged token cannot disarm an active session', () => {
    const a = activateSession(initialViewerSessionState());
    expect(isViewerActive(deactivateSession(a.state, 9999))).toBe(true);
    expect(isViewerActive(deactivateSession(a.state, -1))).toBe(true);
  });

  it('deactivating when nothing is active is a no-op', () => {
    const s = initialViewerSessionState();
    expect(isViewerActive(deactivateSession(s, 1))).toBe(false);
  });

  it('clearSessions drops the guard (renderer crash / window closed)', () => {
    const a = activateSession(initialViewerSessionState());
    expect(isViewerActive(clearSessions(a.state))).toBe(false);
  });

  it('after a crash-clear, a fresh session still gets a NEW token', () => {
    const a = activateSession(initialViewerSessionState());
    const cleared = clearSessions(a.state);
    const b = activateSession(cleared);
    expect(b.token).toBeGreaterThan(a.token);
    expect(isViewerActive(b.state)).toBe(true);
  });
});
