/**
 * Document Studio — what the author currently has focused and selected.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SELECTION STATE IS DELIBERATELY SEPARATE FROM DOCUMENT STATE.
 * ══════════════════════════════════════════════════════════════════════════
 * A caret moving is not a document changing. Keeping the two in one state object was
 * the single largest source of avoidable re-renders in the previous composer: every
 * arrow-key press re-ran the pagination signature, the validation context and the
 * toolbar's derived state, none of which can be affected by where the caret is.
 *
 * Here the caret lives in its own hook, and the expensive derivations subscribe to the
 * DOCUMENT. The status bar subscribes to this. Moving the caret therefore re-renders
 * the status bar and nothing else.
 *
 * ── THE CARET READING IS THROTTLED TO A FRAME ────────────────────────────
 * `onSelect` fires continuously while a selection is dragged. Storing every event would
 * be a state update per mouse-move; storing at most one per animation frame is
 * indistinguishable to the reader and bounded by the display's refresh rate.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type CaretStats, EMPTY_CARET_STATS, caretStats } from '../../../letters/editor/documentStats';

/** Which document region the author is working in. Drives section highlighting. */
export type ActiveSection = 'content' | 'signature' | 'barcode';

export interface DocumentSelection {
  /** The focused content block, or `null` when focus is elsewhere. */
  readonly activeBlockId: string | null;
  readonly activeSection: ActiveSection | null;
  /** Caret line/column and selection size within the active block. */
  readonly caret: CaretStats;
  readonly setActiveBlock: (blockId: string | null) => void;
  readonly setActiveSection: (section: ActiveSection | null) => void;
  /** Report a caret or selection change from a paragraph control. */
  readonly reportSelection: (blockId: string, text: string, start: number, end: number) => void;
  readonly clearCaret: () => void;
}

export function useDocumentSelection(): DocumentSelection {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeSection, setActiveSectionState] = useState<ActiveSection | null>(null);
  const [caret, setCaret] = useState<CaretStats>(EMPTY_CARET_STATS);

  /** Pending frame, so a drag produces at most one state update per repaint. */
  const frame = useRef<number | null>(null);
  const pending = useRef<CaretStats | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const reportSelection = useCallback((blockId: string, text: string, start: number, end: number) => {
    setActiveBlockId((current) => (current === blockId ? current : blockId));
    pending.current = caretStats(text, start, end);

    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const next = pending.current;
      pending.current = null;
      if (!next) return;
      // Same guard the pagination hook uses: an identical reading must not re-render.
      setCaret((previous) =>
        previous.line === next.line &&
        previous.column === next.column &&
        previous.selectedCharacters === next.selectedCharacters &&
        previous.selectedWords === next.selectedWords
          ? previous
          : next,
      );
    });
  }, []);

  const setActiveBlock = useCallback((blockId: string | null) => {
    setActiveBlockId((current) => (current === blockId ? current : blockId));
  }, []);

  const setActiveSection = useCallback((section: ActiveSection | null) => {
    setActiveSectionState((current) => (current === section ? current : section));
  }, []);

  const clearCaret = useCallback(() => setCaret(EMPTY_CARET_STATS), []);

  // Memoised for the same reason `useDocumentHistory`'s result is: the composer's
  // paragraph handlers depend on this object, and a fresh identity every render would
  // rebuild them on every caret movement.
  return useMemo(
    () => ({
      activeBlockId,
      activeSection,
      caret,
      setActiveBlock,
      setActiveSection,
      reportSelection,
      clearCaret,
    }),
    [activeBlockId, activeSection, caret, setActiveBlock, setActiveSection, reportSelection, clearCaret],
  );
}
