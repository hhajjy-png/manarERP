/**
 * Letter Engine — the print binding.
 *
 * Connects the pure print pipeline to the platform and to the composer's view state.
 * It contains no page-break decision, no measurement and no validation rule: all three
 * arrive as arguments, already decided.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  PRINT MODE CHANGES THE VIEW, NEVER THE DOCUMENT.
 * ══════════════════════════════════════════════════════════════════════════
 * While printing, the page stack renders its READ-ONLY form — the same components,
 * same styles, same geometry, same pagination, with the editing affordances gone. That
 * is not a second renderer: it is the renderer the engine already has, in the mode the
 * measurement mirror has been using since pagination existed. Which is also why the
 * printed page is exactly what was measured.
 *
 * Nothing in the block model, the sections or any registry is touched. `printMode` is
 * view state and is deliberately kept OUT of the pagination signature, so entering it
 * cannot re-measure or re-paginate anything.
 */

import { useCallback, useState } from 'react';
import { printCurrentViewWithResult } from '../../utils/print';
import {
  type ComposedPrintJob,
  type PrintError,
  type PrintPlatform,
  type PrintSuccess,
  type RunPrintInput,
  runPrintPipeline,
} from '../../letters/printing/printPipeline';

/**
 * The platform adapter.
 *
 * Wraps the application's existing print bridge, which prints the LIVE view — no clone,
 * no second document, no re-render. That is precisely what the one-renderer rule
 * requires, and it is why no new print transport was written for this pack.
 */
export const livePlatform: PrintPlatform = {
  async print(_job: ComposedPrintJob) {
    const result = await printCurrentViewWithResult();
    return { outcome: result.outcome, failureReason: result.failureReason };
  },
};

export interface UseLetterPrintResult {
  /** True while the page stack is rendering its printable form. */
  printMode: boolean;
  /** True from the moment printing starts until the platform returns. */
  printing: boolean;
  /** The last failure, or `null`. Structured — never a bare message. */
  lastError: PrintError | null;
  /** Run the pipeline. Resolves to the outcome; never throws. */
  runPrint: (input: Omit<RunPrintInput, 'platform'>) => Promise<PrintSuccess | null>;
  clearError: () => void;
}

/**
 * Two frames of settle time before handing off to the platform.
 *
 * Entering print mode swaps the editable controls for their read-only equivalents;
 * printing in the same tick would capture the page mid-swap. Two animation frames is
 * the smallest reliable wait for "the browser has laid this out".
 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function useLetterPrint(platform: PrintPlatform | null = livePlatform): UseLetterPrintResult {
  const [printMode, setPrintMode] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [lastError, setLastError] = useState<PrintError | null>(null);

  const runPrint = useCallback(
    async (input: Omit<RunPrintInput, 'platform'>): Promise<PrintSuccess | null> => {
      setLastError(null);
      setPrinting(true);
      setPrintMode(true);
      try {
        await nextPaint();
        const outcome = await runPrintPipeline({ ...input, platform });
        if (!outcome.ok) {
          setLastError(outcome.error);
          return null;
        }
        return outcome.value;
      } finally {
        // Always restored, on every path: leaving the composer stuck in read-only
        // after a cancelled print would look like data loss.
        setPrintMode(false);
        setPrinting(false);
      }
    },
    [platform],
  );

  const clearError = useCallback(() => setLastError(null), []);

  return { printMode, printing, lastError, runPrint, clearError };
}
