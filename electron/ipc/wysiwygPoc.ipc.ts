/**
 * True Chromium WYSIWYG Print Preview — Proof of Concept (v1).
 *
 * ONE narrow IPC channel: `wysiwygPoc:generate` — takes the SAME composed HTML the
 * Universal Print Preview already renders in its iframe, loads it into an isolated
 * hidden BrowserWindow, and returns Chromium's OWN paginated output via
 * `webContents.printToPDF`. The pages the user sees are the pages Chromium composed —
 * no DOM measurement, no assumed A4 height, no simulated page breaks.
 *
 * WHAT THIS IS NOT:
 *   • Not a print engine. The Print button stays on the legacy path
 *     (`app:print` → `webContents.print`). This channel produces a PREVIEW ARTIFACT
 *     and nothing else — it cannot print, spool, or touch a printer.
 *   • Not a second document source. The HTML arrives from the same
 *     `composeStyledFromNode` output the existing preview consumes.
 *   • Not a generic HTML→PDF service. Input is size-capped, the worker runs in its own
 *     in-memory session whose requests are filtered, and the channel is refused while busy.
 *
 * Same machinery as the production-proven `pdf:exportHtml` (Forms PDF Standalone
 * Export): temp file → hidden window → waitForRenderReady → printToPDF. Two POC
 * differences, both deliberate:
 *   1. The PDF returns to the renderer as bytes (no save dialog, no persisted file).
 *   2. The hidden window is a REUSED singleton, navigated to about:blank between jobs.
 *
 * EVERY DECISION lives in `wysiwygPocPolicy.ts` as a pure, unit-tested function —
 * payload admission, worker ownership, request filtering, page counting. This file owns
 * only the side effects.
 */

import { app, BrowserWindow, ipcMain, session, type Session } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { waitForRenderReady } from '../services/renderReadiness';
import {
  countPdfPages,
  isAllowedWorkerRequestUrl,
  shouldReleaseWorker,
  shouldResetActiveWorker,
  validateWysiwygPayload,
} from './wysiwygPocPolicy';
import { isWysiwygViewerActive } from './wysiwygViewerGuard.ipc';

/** Whole-job watchdog — a preview may fail, it may never hang. */
const JOB_TIMEOUT_MS = 20_000;

/** In-memory (non-`persist:`) partition — nothing this worker touches is written to the
 *  app's session store, and the request filter below cannot affect the main window. */
const WORKER_PARTITION = 'manar-wysiwyg-poc';

export interface WysiwygPocResult {
  ok: boolean;
  /** Chromium-generated PDF bytes (renderer receives a Uint8Array). */
  pdf?: Uint8Array;
  /** Real page count, or `null` when it could not be parsed confidently (never 0). */
  pageCount?: number | null;
  /** Diagnostics: how long readiness (fonts/images) took inside the worker. */
  readyMs?: number;
  error?: string;
}

/** The single reused hidden worker. Recreated lazily if destroyed. */
let worker: BrowserWindow | null = null;
/** One generation at a time — a second request while busy is refused, not queued. */
let busy = false;
/** Guard so the request filter is installed exactly once per session. */
let filterInstalled = false;

/**
 * The dev origin whose assets the composed document may still reach.
 *
 * THIS EXCEPTION IS REQUIRED, AND IT WAS MEASURED — not assumed. `composeStyledFromNode`
 * injects `<base href="${document.baseURI}">`, which under `npm run dev` is the Vite
 * origin. Vite's `assetsInlineLimit` inlines Cairo as a base64 `@font-face` only in the
 * PRODUCTION build; in dev the font is served as a URL from the dev server. Blocking
 * localhost in dev was tried, and the generated PDF came back with **no Cairo embedded**
 * (and different bytes) — i.e. Arabic silently fell back to a system font.
 *
 * So: exactly the dev origin is allowed, and only while it exists. In a packaged build
 * `VITE_DEV_SERVER_URL` is unset → `null` → the worker has NO network reachability at
 * all, because the composed document is genuinely self-contained there.
 */
function devOrigin(): string | null {
  return process.env.VITE_DEV_SERVER_URL ?? null;
}

function workerSession(): Session {
  const ses = session.fromPartition(WORKER_PARTITION);
  if (!filterInstalled) {
    // REAL isolation, not a comment claiming it: every request the worker makes is
    // vetted. file:/data:/blob:/about: pass; http(s)/ws(s)/everything else is cancelled.
    ses.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !isAllowedWorkerRequestUrl(details.url, devOrigin()) });
    });
    filterInstalled = true;
  }
  return ses;
}

function getWorker(): BrowserWindow {
  if (worker && !worker.isDestroyed()) return worker;
  worker = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      session: workerSession(),
      // No preload: the document must not see any bridge at all.
    },
  });
  worker.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && url !== 'about:blank') e.preventDefault();
  });
  worker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return worker;
}

function tempDir(): string {
  const dir = path.join(app.getPath('temp'), 'manar-wysiwyg-poc');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const isDestroyed = (w: BrowserWindow) => w.isDestroyed();

/**
 * Run one job on a window the CALLER owns.
 *
 * H-1: cleanup touches `win` — never the module-level `worker`. A job that lost its
 * race (timeout) and whose window was already destroyed and replaced must not navigate
 * or reset the NEW job's worker. `shouldReleaseWorker` is that ownership check.
 */
async function generate(win: BrowserWindow, html: string): Promise<WysiwygPocResult> {
  const tmp = path.join(tempDir(), `${crypto.randomBytes(16).toString('hex')}.html`);
  try {
    await fs.promises.writeFile(tmp, html, 'utf-8');
    await win.loadURL(pathToFileURL(tmp).toString());
    const readiness = await waitForRenderReady(win); // fonts.ready + images + 2×rAF, bounded
    const pdf = await win.webContents.printToPDF({
      // The composed document's own @page rule is authoritative — identical policy
      // to the production pdf:exportHtml handler.
      printBackground: true,
      preferCSSPageSize: true,
    });
    return {
      ok: true,
      // COPY, not a view: a view would serialize its whole backing ArrayBuffer across
      // IPC, which for a pooled Buffer could carry unrelated memory with it.
      pdf: new Uint8Array(pdf),
      pageCount: countPdfPages(pdf),
      readyMs: readiness.waitedMs,
    };
  } finally {
    // Release the Windows file lock on the temp document before unlinking — but ONLY
    // on our own window, and only while it is still the active worker.
    if (shouldReleaseWorker(win, worker, isDestroyed)) {
      await win.loadURL('about:blank').catch(() => {});
    }
    await fs.promises.unlink(tmp).catch(() => {});
  }
}

export function registerWysiwygPocIpc(): void {
  ipcMain.handle('wysiwygPoc:generate', async (event, rawHtml: unknown): Promise<WysiwygPocResult> => {
    // Sender validation: a real app window, never the worker itself.
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (!senderWin || (worker && senderWin === worker)) {
      return { ok: false, error: 'مصدر الطلب غير مصرّح' };
    }

    // Session gating (IPC hardening). The channel answers ONLY while a WYSIWYG viewer
    // session is open — i.e. only through the dialog flow, which activates the guard
    // before it composes. A casual call (console, stray code) with no viewer open is
    // refused, so the generation channel is no longer freely reachable while the UI
    // feature flag is OFF.
    //
    // HONEST BOUND: this is flow-gating, not an authorisation boundary. A COMPROMISED
    // renderer could call `wysiwygViewer:activate` first. It removes casual reachability
    // — it does not pretend to defend against a hostile renderer, and it deliberately
    // avoids inventing a fragile cross-process mirror of the localStorage feature flag.
    if (!isWysiwygViewerActive()) {
      return { ok: false, error: 'لا توجد جلسة معاينة WYSIWYG نشطة' };
    }

    // Admission BEFORE any side effect: no file is written, no window is created, no
    // navigation and no printToPDF happens for a payload that fails here.
    const payload = validateWysiwygPayload(rawHtml);
    if (!payload.ok) return { ok: false, error: payload.error };

    if (busy) {
      // Refuse rather than queue: the dialog guards against double-fire, so a
      // concurrent request means a stale caller — its result would be discarded.
      return { ok: false, error: 'توليد معاينة آخر قيد التنفيذ' };
    }

    busy = true;
    // The handler owns the window for this job, so failure recovery can prove ownership.
    const win = getWorker();
    try {
      const result = await Promise.race([
        generate(win, payload.html),
        new Promise<WysiwygPocResult>((resolve) =>
          setTimeout(() => resolve({ ok: false, error: 'انتهت مهلة توليد المعاينة' }), JOB_TIMEOUT_MS),
        ),
      ]);

      // A timed-out worker may be wedged mid-load. Destroy it so the next request starts
      // clean — but only if THIS job's window is still the active one.
      if (!result.ok && shouldResetActiveWorker(win, worker)) {
        if (!win.isDestroyed()) win.destroy();
        worker = null;
      }
      return result;
    } catch (err) {
      if (shouldResetActiveWorker(win, worker)) {
        if (!win.isDestroyed()) win.destroy();
        worker = null;
      }
      return { ok: false, error: `فشل توليد المعاينة: ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      busy = false;
    }
  });

  // Housekeeping: the worker and any leftover temp files die with the app.
  app.on('before-quit', () => {
    if (worker && !worker.isDestroyed()) worker.destroy();
    worker = null;
    try {
      fs.rmSync(path.join(app.getPath('temp'), 'manar-wysiwyg-poc'), { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
}
