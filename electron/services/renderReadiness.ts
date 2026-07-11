/**
 * Print Center — main-process render readiness.
 *
 * Replaces `await new Promise(r => setTimeout(r, 400))` in the hidden-window PDF
 * pipeline (electron/ipc/pdf.ipc.ts). That sleep was an assumption, not a signal:
 * on a cold font cache, a slow disk, or a large report the `printToPDF` snapshot
 * could be taken before the embedded Cairo font had loaded — which silently breaks
 * ARABIC SHAPING — or before a long table had finished laying out.
 *
 * We now ask the document itself, inside the hidden window:
 *   • `document.fonts.ready`   — the signal that actually protects Arabic
 *   • every <img> complete     — logos, QR codes (data: URIs decode asynchronously)
 *   • no `[data-print-ready="false"]` element left
 *   • two animation frames      — the layout has been painted
 *
 * Bounded by a hard timeout: readiness NEVER hangs a job. On timeout we proceed and
 * report it, which is precisely what the old sleep did unconditionally — so the
 * fallback is a strict improvement and can never be a regression.
 */

import type { BrowserWindow } from 'electron';

export const DEFAULT_RENDER_READY_TIMEOUT_MS = 5000;

/** Evaluated INSIDE the hidden window. Self-contained: no imports, no closures. */
const READINESS_SCRIPT = `
new Promise((resolve) => {
  const settleImages = () => {
    const imgs = Array.from(document.images).filter((i) => !i.complete);
    if (imgs.length === 0) return Promise.resolve();
    return Promise.all(imgs.map((img) => new Promise((done) => {
      const fin = () => { img.removeEventListener('load', fin); img.removeEventListener('error', fin); done(); };
      img.addEventListener('load', fin);
      img.addEventListener('error', fin);
    })));
  };

  const settleHooks = () => {
    if (!document.querySelector('[data-print-ready="false"]')) return Promise.resolve();
    return new Promise((done) => {
      const obs = new MutationObserver(() => {
        if (!document.querySelector('[data-print-ready="false"]')) { obs.disconnect(); done(); }
      });
      obs.observe(document.documentElement, { subtree: true, attributes: true, childList: true });
    });
  };

  Promise.all([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    settleImages(),
    settleHooks(),
  ])
    .then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    .then(() => resolve(true))
    .catch(() => resolve(false));
})
`;

export interface RenderReadyResult {
  ready: boolean;
  timedOut: boolean;
  waitedMs: number;
}

/**
 * Wait until `win`'s document is genuinely ready to be captured.
 * Never rejects; never hangs longer than `timeoutMs`.
 */
export async function waitForRenderReady(
  win: BrowserWindow,
  timeoutMs: number = DEFAULT_RENDER_READY_TIMEOUT_MS,
): Promise<RenderReadyResult> {
  const started = Date.now();

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  const signals = win.webContents
    .executeJavaScript(READINESS_SCRIPT, true)
    .then(() => 'ready' as const)
    // A destroyed window or a CSP/eval failure must not break the export — fall
    // back to "proceed", matching the old sleep's unconditional behaviour.
    .catch(() => 'ready' as const);

  const outcome = await Promise.race([signals, timeout]);
  if (timer !== undefined) clearTimeout(timer);

  if (outcome === 'timeout') {
    // eslint-disable-next-line no-console
    console.warn(`[printing] render readiness timed out after ${timeoutMs}ms — capturing anyway`);
  }

  return {
    ready: outcome === 'ready',
    timedOut: outcome === 'timeout',
    waitedMs: Date.now() - started,
  };
}
