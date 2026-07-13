/**
 * True Chromium WYSIWYG Preview POC — pure policy layer.
 *
 * Everything in this file is a PURE function: no Electron imports, no filesystem, no
 * BrowserWindow. That is the point — the risky decisions of the POC (worker ownership
 * across a timeout, payload admission, request blocking, page counting) are exactly the
 * parts that were previously untestable inside the IPC handler, and exactly the parts
 * that produced the H-1 race. They are extracted here so they can be unit-tested
 * directly, without an Electron runtime.
 *
 * `wysiwygPoc.ipc.ts` keeps the side effects (windows, files, IPC) and delegates every
 * decision to this module.
 */

// ── Payload admission ────────────────────────────────────────────────────────────

/** Mirrors MAX_COMPOSED_HTML_BYTES in frontend/src/printing/composeDocument.ts. */
export const MAX_HTML_BYTES = 12 * 1024 * 1024;

export type PayloadDecision =
  | { ok: true; html: string }
  | { ok: false; error: string };

/**
 * Admit a preview payload, or reject it with a user-facing Arabic reason.
 *
 * Called BEFORE any filesystem write, worker creation, navigation or printToPDF — a
 * rejected payload must never reach a side effect. Whitespace-only is rejected: it is
 * not a document, and composing one would produce a blank "preview" that looks real.
 */
export function validateWysiwygPayload(raw: unknown, maxBytes: number = MAX_HTML_BYTES): PayloadDecision {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, error: 'مستند المعاينة غير صالح' };
  }
  // Byte length, not string length: Arabic is multi-byte, so `.length` would let a
  // document through that is far over the cap on the wire.
  if (Buffer.byteLength(raw, 'utf-8') > maxBytes) {
    return { ok: false, error: 'مستند المعاينة أكبر من الحد المسموح' };
  }
  return { ok: true, html: raw };
}

// ── Worker ownership (the H-1 fix) ───────────────────────────────────────────────
//
// A job may only ever touch ITS OWN window. The original code cleaned up through the
// MODULE-LEVEL `worker` reference, so a job that had already lost its race (timeout)
// could navigate — or reset — the worker belonging to a LATER job, silently blanking
// that job's preview. Ownership is therefore an explicit, tested predicate.

/**
 * May this finishing job navigate its window back to `about:blank` (the step that
 * releases the Windows file lock on the temp document)?
 *
 * Only when the window it ran on is STILL the active worker and is still alive. A
 * superseded job (its worker was destroyed and replaced) must keep its hands off.
 */
export function shouldReleaseWorker<W>(jobWin: W, activeWorker: W | null, isDestroyed: (w: W) => boolean): boolean {
  if (activeWorker === null || jobWin !== activeWorker) return false;
  return !isDestroyed(jobWin);
}

/**
 * May this failed/timed-out job destroy the worker and clear the module slot, so the
 * next request starts from a clean window?
 *
 * Only if its own window is still the active worker. If the slot already moved on, the
 * failure belongs to a window nobody is using any more — destroying the CURRENT worker
 * on its behalf is precisely the H-1 bug.
 */
export function shouldResetActiveWorker<W>(jobWin: W, activeWorker: W | null): boolean {
  return activeWorker !== null && jobWin === activeWorker;
}

// ── Worker request policy (real network isolation) ───────────────────────────────

/** Schemes the composed print document legitimately needs. Everything else is blocked. */
const ALLOWED_SCHEMES = new Set(['file:', 'data:', 'blob:', 'about:']);

/**
 * Is this request allowed to leave the WYSIWYG worker?
 *
 * The composed document is self-contained by construction (Cairo is inlined as a base64
 * `@font-face`; the logo is a `data:` URI), so in PRODUCTION it needs nothing but
 * `file:`/`data:`/`blob:`/`about:` — every external scheme is blocked.
 *
 * DEV EXCEPTION, documented deliberately: `composeStyledFromNode` injects
 * `<base href="${document.baseURI}">`, and under `npm run dev` that base is the Vite
 * origin (`http://localhost:5173`). Any relative URL surviving in the captured CSS
 * therefore resolves to the dev server. We allow EXACTLY that origin — and only when it
 * is supplied (i.e. dev) — rather than allowing `http:` as a scheme. In a packaged app
 * `devOrigin` is null and nothing over the network is reachable.
 */
export function isAllowedWorkerRequestUrl(url: string, devOrigin: string | null = null): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false; // unparseable → not allowed
  }
  if (ALLOWED_SCHEMES.has(parsed.protocol)) return true;

  if (devOrigin) {
    let dev: URL;
    try {
      dev = new URL(devOrigin);
    } catch {
      return false;
    }
    // Origin-bounded, not prefix-bounded: `http://localhost:5173.evil.com` must NOT pass.
    if (parsed.origin === dev.origin) return true;
  }
  return false;
}

// ── Page count (metadata display only) ───────────────────────────────────────────

/**
 * Count pages in a Chromium-generated PDF.
 *
 * THIS IS A HEURISTIC, and it is used ONLY to display a number next to the preview.
 * It does not paginate anything — pagination is Chromium's, inside the PDF itself.
 * If the heuristic cannot answer confidently it returns `null`, and the UI shows no
 * count at all rather than asserting a false "0 pages".
 *
 * How: Chromium/Skia emits one uncompressed `/Type /Page` object per page. `/Type
 * /Pages` (the page-tree node) is excluded by the negative lookahead, as is any longer
 * key such as `/PageLabels`. A `%PDF-` header is required, so arbitrary bytes that
 * merely contain the token cannot be mistaken for a page count.
 */
export function countPdfPages(bytes: Uint8Array | null | undefined): number | null {
  if (!bytes || bytes.length === 0) return null;

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  // Must actually be a PDF. Guards against counting tokens in unrelated bytes.
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return null;

  const matches = buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g);
  if (!matches || matches.length === 0) return null; // unparsed → unknown, never 0
  return matches.length;
}
