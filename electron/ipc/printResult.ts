/**
 * Pure mapping from Electron's `webContents.print()` callback (`success`,
 * `failureReason`) to the result `app:print` resolves with (Cheque Multi-Selection
 * & Batch Printing Pack v1 — Provider Parity & Print Result Correctness).
 *
 * No `electron` import — testable without an Electron runtime, per the project's
 * own convention for main-process unit tests (see vitest.electron.config.ts).
 */

export interface AppPrintResult {
  success: boolean;
  failureReason?: string;
}

/** `win.webContents.print(options, callback)` invokes its callback with
 *  `(success, failureReason)`. Electron's documented `failureReason` values
 *  include "Invalid printer settings", "Print job canceled", "Print job failed" —
 *  we do not depend on the exact string here; the caller (utils/print.ts on the
 *  frontend) is the single place that classifies 'cancelled' vs 'error'. */
export function mapPrintCallback(success: boolean, failureReason: string): AppPrintResult {
  return { success, failureReason: success ? undefined : failureReason };
}

/** Result when there is no focused window to print from. */
export const NO_FOCUSED_WINDOW_RESULT: AppPrintResult = { success: false, failureReason: 'No focused window' };
