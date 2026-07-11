/**
 * Print Center — real print readiness.
 *
 * Replaces the arbitrary sleeps that previously stood in for "the document has
 * finished rendering":
 *   • PayrollPayslip.tsx  — `setTimeout(() => printCurrentView(), 500)`
 *   • electron/ipc/pdf.ipc.ts — `await new Promise(r => setTimeout(r, 400))`
 *
 * A sleep is a race: on a slow machine, a large table, or a cold font cache the
 * document is still laying out when the print/PDF snapshot is taken, and content is
 * silently truncated or falls back to a system font (fatal for Arabic shaping).
 *
 * Readiness is instead the conjunction of three real signals:
 *   1. `document.fonts.ready`  — web fonts (Cairo / IBM Plex Sans Arabic) are loaded
 *      and usable. This is the one that actually matters for Arabic.
 *   2. every <img> inside the printable root has completed (QR codes, logos,
 *      signatures are <img> with data: URIs — decode is fast but not synchronous).
 *   3. an OPTIONAL explicit hook: any element carrying `data-print-ready="false"`
 *      inside the root blocks readiness until it flips to "true" (or disappears).
 *      Nothing uses it yet; it exists so a future async template can say "not yet"
 *      without inventing another sleep.
 *
 * Plus a bounded fallback: readiness NEVER hangs. If a signal never resolves we
 * proceed after `timeoutMs` and report it, because failing to print is worse than
 * printing slightly early — and this is exactly the behaviour the old sleeps had,
 * so the fallback path is a strict improvement, never a regression.
 */

export const DEFAULT_PRINT_READY_TIMEOUT_MS = 3000;

export interface PrintReadyResult {
  ready: boolean;
  /** True when the fallback timeout fired before all signals resolved. */
  timedOut: boolean;
  waitedMs: number;
}

/** Resolves when all <img> descendants have loaded (or errored — a broken image
 *  must not block a print forever). */
function imagesSettled(root: ParentNode): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  const pending = imgs.filter((img) => !img.complete);
  if (pending.length === 0) return Promise.resolve();
  return Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          const done = () => {
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
            resolve();
          };
          img.addEventListener('load', done);
          img.addEventListener('error', done);
        }),
    ),
  ).then(() => undefined);
}

/** Resolves when no `[data-print-ready="false"]` element remains under `root`. */
function explicitHooksSettled(root: ParentNode, signal: AbortSignal): Promise<void> {
  const blocked = () => root.querySelector('[data-print-ready="false"]') !== null;
  if (!blocked()) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const target = root instanceof Document ? root.documentElement : (root as Element);
    const observer = new MutationObserver(() => {
      if (!blocked()) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(target, { subtree: true, attributes: true, childList: true });
    signal.addEventListener('abort', () => {
      observer.disconnect();
      resolve();
    });
  });
}

/**
 * Wait until `root` is genuinely ready to be printed or captured to PDF.
 *
 * @param root      The printable subtree (defaults to the whole document).
 * @param timeoutMs Hard upper bound. On expiry we resolve with `timedOut: true`
 *                  rather than rejecting — the caller still prints.
 */
export async function waitForPrintReady(
  root: ParentNode = document,
  timeoutMs: number = DEFAULT_PRINT_READY_TIMEOUT_MS,
): Promise<PrintReadyResult> {
  const started = Date.now();
  const controller = new AbortController();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  const fonts: Promise<unknown> = document.fonts?.ready ?? Promise.resolve();

  const signals = Promise.all([
    fonts,
    imagesSettled(root),
    explicitHooksSettled(root, controller.signal),
  ]).then(() => 'ready' as const);

  const outcome = await Promise.race([signals, timeout]);

  if (timer !== undefined) clearTimeout(timer);
  controller.abort(); // tear down the MutationObserver on both paths

  // Yield one frame so the browser has painted the final layout before the snapshot.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  return {
    ready: outcome === 'ready',
    timedOut: outcome === 'timeout',
    waitedMs: Date.now() - started,
  };
}
