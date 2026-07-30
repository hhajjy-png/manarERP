/**
 * Central print entry point for the app.
 *
 * In the Electron desktop app it routes through the native bridge
 * `window.manar.printPage()` (→ `app:print` → `webContents.print({ silent: false,
 * printBackground: true })`), which opens the operating-system print dialog with a
 * real preview. This avoids Chromium's in-app print preview, which Electron does not
 * ship and which renders the "This app doesn't support print preview" message when
 * `window.print()` is called directly.
 *
 * Outside Electron (web / dev browser, or if the bridge is unavailable) it falls
 * back to the standard `window.print()`.
 *
 * The PDF export flow (`window.manar.exportPdf` / `exportPdfFromHtml` → printToPDF)
 * is intentionally NOT touched by this helper.
 */
// Optional `options.landscape` is forwarded to the native Electron print so a
// caller (e.g. cheque-template printing) can force landscape orientation via
// Chromium instead of relying on @page CSS alone. Omitted → identical to before.
//
// Cheque Printing Deterministic Geometry & Unified Pipeline Pack v1 widens this
// to the FULL physical page contract (pageSize / marginType / scaleFactor), so a
// cheque print job can pin the paper instead of inheriting whatever the OS print
// dialog was last set to. Callers build these via
// `modules/chequePrint/physicalPage.ts` — never by hand. Everything stays
// optional: a caller that passes nothing, or only `landscape`, is unchanged.
//
// Existing callers of `printCurrentView` only care that the promise resolves —
// none inspect a return value — so its signature and behavior stay untouched
// even though the underlying bridge now resolves with a real result instead of
// firing-and-forgetting. `.then(() => undefined, ...)` discards that result
// deliberately, for backward compatibility; use `printCurrentViewWithResult`
// below for any NEW caller that needs to know what actually happened.
/**
 * Physical page options accepted by the native print bridge. Shapes mirror
 * Electron 31's `WebContentsPrintOptions` (`pageSize` object = MICRONS).
 */
export interface PrintPhysicalOptions {
  landscape?: boolean;
  pageSize?: string | { width: number; height: number };
  marginType?: 'default' | 'none' | 'printableArea' | 'custom';
  scaleFactor?: number;
}

export function printCurrentView(options?: PrintPhysicalOptions): Promise<void> {
  const p = window.manar?.printPage?.(options);
  if (p) return p.then(() => undefined, () => { window.print(); });
  window.print();
  return Promise.resolve();
}

/**
 * Real print outcome, per Electron's documented `webContents.print` callback
 * (`success`, `failureReason`) — see https://www.electronjs.org/docs/latest/api/web-contents.
 *
 *   - 'success'   — `success === true`.
 *   - 'cancelled' — `success === false` and `failureReason === 'Print job canceled'`
 *                   (Electron's documented string for a user-dismissed print dialog).
 *   - 'error'     — `success === false` with any other/unrecognized `failureReason`
 *                   (e.g. 'Invalid printer settings', 'Print job failed'), or the
 *                   IPC call itself rejected.
 *   - 'unknown'   — no Electron print bridge is present (browser/dev/test build).
 *                   `window.print()` has no completion signal at all; this is NOT
 *                   invented as 'success' — callers that gate tracking/batch
 *                   progression on the result MUST treat 'unknown' the same as
 *                   "not confirmed printed".
 */
export type PrintOutcome = 'success' | 'cancelled' | 'error' | 'unknown';
export interface PrintResult {
  outcome: PrintOutcome;
  failureReason?: string;
}

/** Same physical print as `printCurrentView`, but resolves with the real outcome
 *  instead of discarding it — for callers that must gate tracking/batch
 *  progression on whether printing actually succeeded. */
export function printCurrentViewWithResult(options?: PrintPhysicalOptions): Promise<PrintResult> {
  const bridge = window.manar?.printPage;
  if (!bridge) {
    window.print();
    return Promise.resolve({ outcome: 'unknown', failureReason: 'no-electron-print-bridge' });
  }
  return bridge(options).then(
    (r): PrintResult => ({
      outcome: r.success ? 'success' : r.failureReason === 'Print job canceled' ? 'cancelled' : 'error',
      failureReason: r.success ? undefined : r.failureReason,
    }),
    (e: unknown): PrintResult => ({ outcome: 'error', failureReason: e instanceof Error ? e.message : String(e) }),
  );
}