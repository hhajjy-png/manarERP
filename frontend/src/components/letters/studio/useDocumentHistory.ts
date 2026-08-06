/**
 * Document Studio — undo and redo.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  HISTORY IS A STACK OF DOCUMENTS, BECAUSE THE COMMANDS ARE PURE.
 * ══════════════════════════════════════════════════════════════════════════
 * Every command in `blockCommands` returns a NEW document and mutates nothing, so a
 * past state is just a value that is still lying around. No inverse operations, no
 * patch log, no command objects to keep in sync with the commands themselves — the
 * payoff for keeping the editing layer pure, and the reason undo needed no machinery
 * when it was first built.
 *
 * This hook extracts that stack out of the composer unchanged in behaviour. What it
 * ADDS is coalescing.
 *
 * ── WHY KEYSTROKES COALESCE INSTEAD OF EACH PUSHING A STEP ───────────────
 * One undo step per character makes undo useless — the author presses Ctrl+Z eight
 * times to remove a word. The previous implementation solved this by not pushing at
 * all for text changes, which has the opposite failure: typing a whole paragraph and
 * pressing undo threw away everything back to the last structural edit.
 *
 * So a text change opens a COALESCING WINDOW. Consecutive text changes to the same
 * block inside the window fold into the step already on the stack; a change to a
 * different block, a structural edit, or a pause longer than the window starts a new
 * step. That is what every word processor does, and it is why undo there removes a
 * word or a sentence rather than a letter or a page.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { type BlockDocument } from '../../../letters/model/blockTypes';

/** Undo depth. Deep enough for a working session, bounded so history is not a leak. */
export const HISTORY_LIMIT = 60;

/**
 * How long consecutive edits to one block keep folding into a single undo step.
 *
 * 600 ms is above a fast typist's inter-key interval (~120 ms) and below the pause that
 * signals the end of a thought, so a step ends up being roughly a phrase.
 */
export const COALESCE_WINDOW_MS = 600;

/** Why a change is being recorded. Decides whether it can fold into the step before it. */
export type HistoryReason =
  /** A keystroke. Folds into the previous step when it is recent and same-block. */
  | 'typing'
  /** Formatting, structure, replace, paste. Always its own step. */
  | 'command'
  /** Not recorded at all — used when replaying history itself. */
  | 'silent';

export interface DocumentHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Steps currently on the undo stack — shown in the status bar's tooltip. */
  readonly depth: number;
  /**
   * Record a new document state.
   *
   * `blockId` matters only for `typing`: it is what distinguishes "still editing the
   * same paragraph" from "moved to another one and started a new thought".
   */
  readonly record: (
    previous: BlockDocument,
    reason: HistoryReason,
    blockId?: string | null,
  ) => void;
  /** Returns the document to restore, or `null` when there is nothing to undo. */
  readonly undo: (current: BlockDocument) => BlockDocument | null;
  readonly redo: (current: BlockDocument) => BlockDocument | null;
  /** Drop everything — called when a different letter is loaded. */
  readonly reset: () => void;
}

export function useDocumentHistory(): DocumentHistory {
  const [past, setPast] = useState<BlockDocument[]>([]);
  const [future, setFuture] = useState<BlockDocument[]>([]);

  /**
   * When the newest step was opened, and for which block.
   *
   * A ref rather than state: it is read and written inside `record`, and putting it in
   * state would make every keystroke a render of its own before the coalescing decision
   * had even been taken.
   */
  const openStep = useRef<{ at: number; blockId: string | null } | null>(null);

  const record = useCallback((previous: BlockDocument, reason: HistoryReason, blockId: string | null = null) => {
    if (reason === 'silent') return;

    if (reason === 'typing') {
      const open = openStep.current;
      const now = Date.now();
      const foldsIn =
        open !== null && open.blockId === blockId && now - open.at <= COALESCE_WINDOW_MS && past.length > 0;

      // Folding means the step already on the stack keeps its ORIGINAL "before" state —
      // which is exactly right: undoing the step must return to before the phrase, not
      // to before the last character of it.
      openStep.current = { at: foldsIn ? open.at : now, blockId };
      if (foldsIn) {
        setFuture([]);
        return;
      }
    } else {
      openStep.current = null;
    }

    setPast((stack) => [...stack.slice(-(HISTORY_LIMIT - 1)), previous]);
    setFuture([]);
  }, [past.length]);

  const undo = useCallback((current: BlockDocument): BlockDocument | null => {
    if (past.length === 0) return null;
    const restored = past[past.length - 1];
    // An undo always closes the open coalescing step: the next keystroke after undoing
    // must not fold into the step that was just taken off the stack.
    openStep.current = null;
    setPast((stack) => stack.slice(0, -1));
    setFuture((stack) => [current, ...stack].slice(0, HISTORY_LIMIT));
    return restored;
  }, [past]);

  const redo = useCallback((current: BlockDocument): BlockDocument | null => {
    if (future.length === 0) return null;
    const restored = future[0];
    openStep.current = null;
    setFuture((stack) => stack.slice(1));
    setPast((stack) => [...stack.slice(-(HISTORY_LIMIT - 1)), current]);
    return restored;
  }, [future]);

  const reset = useCallback(() => {
    openStep.current = null;
    setPast([]);
    setFuture([]);
  }, []);

  // Memoised because the composer's editing callbacks take this object as a dependency.
  // A fresh object every render would make `apply`, the paragraph handlers and the
  // shortcut map all unstable, which re-creates the whole handler tree on every
  // keystroke — the exact cost this hook was extracted to remove.
  return useMemo(
    () => ({
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      depth: past.length,
      record,
      undo,
      redo,
      reset,
    }),
    [past.length, future.length, record, undo, redo, reset],
  );
}
