/**
 * Document Automation — auto-save and crash recovery.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO INDEPENDENT MECHANISMS. ONE IS THE SAVE; THE OTHER IS THE PARACHUTE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   · THE SAVE writes to the server. Debounced on a change, and forced after a longer
 *     ceiling so a continuous typist's work still reaches the database — a purely
 *     debounced save never fires while someone is typing steadily, which is exactly
 *     when they have the most to lose.
 *
 *   · THE RECOVERY DRAFT writes to localStorage on every change, synchronously and
 *     cheaply. It exists for the case the save cannot cover: the tab dies, the machine
 *     loses power, the backend is unreachable. It is never the source of truth — it is
 *     offered on next open and discarded the moment the author accepts or rejects it.
 *
 * Keeping them separate is the point. A single mechanism would have to choose between
 * "fast enough to survive a crash" and "infrequent enough not to hammer the server",
 * and there is no value that is both.
 *
 * ── THE RECOVERY DRAFT IS CLEARED ON A CONFIRMED SAVE ────────────────────
 * Not on a save ATTEMPT. If the request fails the draft must survive, because that is
 * precisely the moment it is the only copy of the author's work.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Quiet period after a change before the save fires. */
export const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Longest a change may go unsaved while the author keeps typing.
 *
 * Without this ceiling, a debounce alone means someone typing steadily for ten minutes
 * has saved nothing — the timer resets on every keystroke. Fifteen seconds bounds the
 * loss without making the save chatty.
 */
export const AUTOSAVE_MAX_WAIT_MS = 15_000;

/** localStorage key for one letter's recovery draft. */
function recoveryKey(letterId: number): string {
  return `manarERP.letters.recovery.${letterId}`;
}

/** What is parked for recovery. Deliberately small — no images, no layout blobs. */
export interface RecoveryDraft {
  readonly letterId: number;
  readonly contentJson: string;
  readonly subject: string;
  readonly issueDate: string;
  readonly recipientName: string;
  readonly recipientTitle: string;
  readonly recipientOrganisation: string;
  /** ISO timestamp of the last local write. Shown in the recovery prompt. */
  readonly at: string;
}

/** Read a parked draft, tolerating every storage failure. */
export function readRecoveryDraft(letterId: number): RecoveryDraft | null {
  try {
    const raw = window.localStorage.getItem(recoveryKey(letterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecoveryDraft;
    return parsed && parsed.letterId === letterId && typeof parsed.contentJson === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearRecoveryDraft(letterId: number): void {
  try {
    window.localStorage.removeItem(recoveryKey(letterId));
  } catch {
    // Nothing to do and nothing worth reporting: a draft that cannot be cleared is
    // offered once more and rejected, which is harmless.
  }
}

function writeRecoveryDraft(draft: RecoveryDraft): void {
  try {
    window.localStorage.setItem(recoveryKey(draft.letterId), JSON.stringify(draft));
  } catch {
    // Quota exceeded. The server save is still the primary path; losing the parachute
    // must never stop the aircraft.
  }
}

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

export interface AutoSave {
  readonly state: SaveState;
  readonly lastSavedAt: Date | null;
  readonly lastError: string | null;
  /** Save now, cancelling any pending timer. Ctrl+S and the Save button. */
  readonly saveNow: () => Promise<void>;
  /** Clear the parked draft — called once the author accepts or rejects recovery. */
  readonly discardRecovery: () => void;
}

export interface AutoSaveInput {
  readonly letterId: number;
  /** True when there is something to save. */
  readonly dirty: boolean;
  readonly enabled: boolean;
  /** The current document, for the recovery draft. */
  readonly draft: Omit<RecoveryDraft, 'letterId' | 'at'> | null;
  /** Performs the actual save. Rejects on failure. */
  readonly save: () => Promise<void>;
}

export function useAutoSave({ letterId, dirty, enabled, draft, save }: AutoSaveInput): AutoSave {
  const [state, setState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ceilingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The save function, in a ref so the timers never fire a stale closure. */
  const saveRef = useRef(save);
  saveRef.current = save;
  /** Guards against two saves overlapping — the second would race the first's result. */
  const inFlight = useRef(false);

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (ceilingTimer.current) clearTimeout(ceilingTimer.current);
    debounceTimer.current = null;
    ceilingTimer.current = null;
  }, []);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    clearTimers();
    inFlight.current = true;
    setState('saving');
    try {
      await saveRef.current();
      setState('saved');
      setLastSavedAt(new Date());
      setLastError(null);
      // Cleared only on a CONFIRMED save — see the file header.
      clearRecoveryDraft(letterId);
    } catch (error) {
      setState('failed');
      setLastError(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false;
    }
  }, [clearTimers, letterId]);

  /* ── The recovery draft — written on every change, synchronously ──────── */
  useEffect(() => {
    if (!enabled || !dirty || !draft) return;
    writeRecoveryDraft({ ...draft, letterId, at: new Date().toISOString() });
  }, [enabled, dirty, draft, letterId]);

  /* ── The debounce and its ceiling ────────────────────────────────────── */
  useEffect(() => {
    if (!enabled || !dirty) return;

    setState('pending');

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void run(), AUTOSAVE_DEBOUNCE_MS);

    // The ceiling is armed ONCE per dirty run rather than reset on every change —
    // resetting it would make it a second debounce and it would never fire either.
    if (!ceilingTimer.current) {
      ceilingTimer.current = setTimeout(() => void run(), AUTOSAVE_MAX_WAIT_MS);
    }

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    };
  }, [enabled, dirty, draft, run]);

  /* ── A clean document disarms everything ─────────────────────────────── */
  useEffect(() => {
    if (dirty) return;
    clearTimers();
    setState((current) => (current === 'saving' ? current : current === 'failed' ? current : 'idle'));
  }, [dirty, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  /* ── Leaving with unsaved work ───────────────────────────────────────────
     The browser's own confirmation. It cannot be styled and its wording cannot be
     chosen — but it is the only thing that fires before a tab closes, and the
     recovery draft is already written by the time it does. */
  useEffect(() => {
    if (!enabled || !dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [enabled, dirty]);

  return {
    state,
    lastSavedAt,
    lastError,
    saveNow: run,
    discardRecovery: useCallback(() => clearRecoveryDraft(letterId), [letterId]),
  };
}
