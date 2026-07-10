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
export function printCurrentView(): Promise<void> {
  const p = window.manar?.printPage?.();
  if (p) return p.catch(() => { window.print(); });
  window.print();
  return Promise.resolve();
}