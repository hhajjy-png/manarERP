/**
 * Print Center — preview artifact service (Phase 2).
 *
 * THE central guarantee of this phase: **the preview IS the artifact.**
 * `print:preview` renders the composed HTML in a hidden window and caches the exact
 * PDF bytes. `print:savePdf` writes THOSE bytes. No second render, so preview and the
 * saved file cannot drift.
 *
 * Extends the approved Phase 1 service (printService.ts) — it does not replace it.
 * `print:submit` and `print:listPrinters` stay exactly as reviewed.
 *
 * Resource discipline (the thing that breaks in naive implementations):
 *   • every hidden window is destroyed in a `finally`, on every path including throw
 *   • every temp file is unlinked in a `finally`
 *   • temp files live in a private per-run subdirectory, not the shared temp root
 *   • the artifact cache is BOUNDED (count + total bytes) with LRU eviction
 *   • `print:releasePreview` frees a token; app shutdown frees everything
 *   • a token is an unguessable random id, valid only for the job that created it
 */

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { randomUUID, randomBytes } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { waitForRenderReady } from './renderReadiness';

const SUPPORTED_CONTRACT = 'v1';

/** Bounds. A preview that exceeds these is a defect, not a business case. */
export const MAX_HTML_BYTES = 12 * 1024 * 1024; // 12 MB composed HTML
export const MAX_PDF_BYTES = 80 * 1024 * 1024; // 80 MB rendered PDF
export const MAX_CACHED_ARTIFACTS = 4;
export const MAX_CACHE_BYTES = 160 * 1024 * 1024;
export const RENDER_TIMEOUT_MS = 60_000; // large Arabic reports are slow, but bounded

interface Artifact {
  token: string;
  docType: string;
  documentId?: string;
  pdf: Buffer;
  pageCount: number;
  createdAt: number;
}

/** Insertion-ordered — Map iteration order gives us LRU eviction for free. */
const artifacts = new Map<string, Artifact>();

function cacheBytes(): number {
  let total = 0;
  for (const a of artifacts.values()) total += a.pdf.length;
  return total;
}

function evictIfNeeded(): void {
  while (artifacts.size > MAX_CACHED_ARTIFACTS || cacheBytes() > MAX_CACHE_BYTES) {
    const oldest = artifacts.keys().next();
    if (oldest.done) break;
    artifacts.delete(oldest.value);
  }
}

export function releaseArtifact(token: string): boolean {
  return artifacts.delete(token);
}

export function releaseAllArtifacts(): void {
  artifacts.clear();
}

/**
 * Page count, read from the PDF itself.
 *
 * Chromium emits an uncompressed page tree, so the authoritative `/Type /Page`
 * objects are countable in the raw bytes. We deliberately do NOT add a PDF parsing
 * dependency to the MAIN process for this. `/Type /Pages` (the tree nodes) is excluded
 * by requiring the token to not be followed by `s`.
 *
 * If the scan yields nothing (a future Chromium that compresses object streams), we
 * fall back to 1 rather than 0 — a wrong-but-sane count beats a broken UI, and the
 * renderer re-derives the real count from PDF.js anyway, which is authoritative.
 */
export function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return matches && matches.length > 0 ? matches.length : 1;
}

interface PreviewRequest {
  contractVersion: string;
  docType: string;
  documentId?: string;
  html: string;
  pageSpecId?: string;
  title?: string;
  renderSource?: string;
}

function validatePreview(raw: unknown): { ok: true; req: PreviewRequest } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'طلب معاينة غير صالح' };
  const r = raw as Partial<PreviewRequest>;
  if (r.contractVersion !== SUPPORTED_CONTRACT) {
    return { ok: false, error: `إصدار عقد الطباعة غير مدعوم: ${String(r.contractVersion)}` };
  }
  if (typeof r.docType !== 'string' || r.docType.length === 0 || r.docType.length > 64) {
    return { ok: false, error: 'نوع المستند غير صالح' };
  }
  if (typeof r.html !== 'string' || r.html.length === 0) {
    return { ok: false, error: 'محتوى المستند فارغ' };
  }
  if (Buffer.byteLength(r.html, 'utf8') > MAX_HTML_BYTES) {
    return { ok: false, error: 'المستند كبير جدًا للمعاينة' };
  }
  return { ok: true, req: r as PreviewRequest };
}

/** Private, per-run temp directory — not the world-readable shared temp root. */
let tempDir: string | null = null;
function getTempDir(): string {
  if (tempDir && fs.existsSync(tempDir)) return tempDir;
  tempDir = fs.mkdtempSync(path.join(app.getPath('temp'), 'manar-print-'));
  try {
    // Owner-only where the platform honours it (no-op on most Windows volumes).
    fs.chmodSync(tempDir, 0o700);
  } catch {
    /* best effort */
  }
  return tempDir;
}

export function cleanupTempDir(): void {
  if (!tempDir) return;
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  tempDir = null;
}

/**
 * Render composed HTML to PDF in a hidden, sandboxed window.
 * The window and the temp file are destroyed on EVERY path.
 */
async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const tmpPath = path.join(getTempDir(), `${randomUUID()}.html`);
  let win: BrowserWindow | null = null;

  try {
    await fs.promises.writeFile(tmpPath, html, { encoding: 'utf-8', mode: 0o600 });

    win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        // No preload, no remote content — the document is local and self-contained.
      },
    });

    await win.loadFile(tmpPath);
    // Real readiness: fonts (Arabic shaping!), images, layout — never an arbitrary sleep.
    await waitForRenderReady(win, RENDER_TIMEOUT_MS);

    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true, // the document's own @page (from PageSpec) wins
    });

    if (pdf.length > MAX_PDF_BYTES) {
      throw new Error('حجم ملف PDF الناتج يتجاوز الحد المسموح');
    }
    return pdf;
  } finally {
    // Destroy on every path — success, failure, or throw. No orphan windows.
    if (win && !win.isDestroyed()) win.destroy();
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}

/**
 * Sanitize a renderer-supplied filename. Never trust it.
 *
 * Removes path separators, Windows-reserved characters, wildcards and control bytes.
 * Deliberately KEEPS hyphens, underscores, spaces and dots: the project's filename
 * standard is `manarERP_<Name>_<Id>_<YYYY-MM-DD>.pdf`, so stripping hyphens would
 * mangle the date. Leading dots are removed so a name can never become a dotfile.
 */
function safePdfName(name: string | undefined, fallback: string): string {
  const cleaned = (name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\?%*:|"<>\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  const chosen = cleaned.length > 0 ? cleaned.slice(0, 120) : fallback;
  return chosen.toLowerCase().endsWith('.pdf') ? chosen : `${chosen}.pdf`;
}

export function registerPreviewIpc(): void {
  /** Render a preview and cache the exact bytes. */
  ipcMain.handle('print:preview', async (_event, raw: unknown) => {
    const parsed = validatePreview(raw);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const req = parsed.req;

    try {
      const pdf = await renderHtmlToPdf(req.html);
      const token = randomBytes(24).toString('hex'); // unguessable, per-job
      const artifact: Artifact = {
        token,
        docType: req.docType,
        documentId: req.documentId,
        pdf,
        pageCount: countPdfPages(pdf),
        createdAt: Date.now(),
      };
      artifacts.set(token, artifact);
      evictIfNeeded();

      return {
        ok: true,
        token,
        pageCount: artifact.pageCount,
        sizeBytes: pdf.length,
        data: pdf, // structured-clone → Uint8Array in the renderer
      };
    } catch (err) {
      // Never leak a stack trace or a filesystem path to the renderer.
      // eslint-disable-next-line no-console
      console.error('[printing] preview render failed:', err);
      return { ok: false, error: 'تعذّر توليد معاينة المستند.' };
    }
  });

  /**
   * Save the ALREADY-GENERATED artifact. The saved PDF is byte-identical to the one
   * the user previewed — there is no second render, so they cannot diverge.
   */
  ipcMain.handle('print:savePdf', async (event, raw: unknown) => {
    const r = (raw ?? {}) as { token?: string; suggestedFileName?: string };
    if (typeof r.token !== 'string') return { status: 'failed', error: 'رمز المعاينة غير صالح' };

    const artifact = artifacts.get(r.token);
    if (!artifact) return { status: 'failed', error: 'انتهت صلاحية المعاينة — أعد توليدها.' };

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { status: 'failed', error: 'تعذّر الوصول إلى نافذة التطبيق' };

    // The USER chooses the path through the OS dialog — the renderer never does.
    const save = await dialog.showSaveDialog(win, {
      title: 'حفظ PDF',
      defaultPath: safePdfName(r.suggestedFileName, artifact.docType),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (save.canceled || !save.filePath) return { status: 'canceled' };

    try {
      await fs.promises.writeFile(save.filePath, artifact.pdf);
      const { size } = await fs.promises.stat(save.filePath);
      return { status: 'exported', sizeBytes: size };
      // NOTE: filePath is deliberately NOT returned — no filesystem path reaches the UI.
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[printing] savePdf failed:', err);
      return { status: 'failed', error: 'تعذّر حفظ ملف PDF.' };
    }
  });

  /**
   * PRINT THE CACHED PREVIEW ARTIFACT.
   *
   * THE DEFECT THIS REPLACES: the Print Center's Print button went through the Phase 1
   * gateway (`print:submit`), which calls `webContents.print()` on the VISIBLE
   * application window. That prints the whole app — sidebar, toolbar, the Print Center
   * dialog itself — instead of the document. The legacy invoice path never had this
   * problem because the legacy page hides its chrome with `@media print`; the Print
   * Center has no such rules, so everything it showed went to paper.
   *
   * THE FIX: print the EXACT PDF BYTES the operator previewed. The same artifact is
   * previewed, saved and printed — there is no second render and no third source of
   * truth. The visible window is never printed.
   *
   * MECHANISM: the cached buffer is written to a private temp file and loaded into an
   * isolated hidden window with Chromium's PDF viewer enabled (`plugins: true` — this is
   * what makes a BrowserWindow able to display, and therefore print, a PDF).
   * `webContents.print()` on that window prints the PDF document itself.
   *
   * We do NOT rasterise the PDF, and we do NOT print the PDF.js canvas — PDF.js in the
   * renderer stays a viewer only.
   *
   * The artifact SURVIVES: printing does not consume the token, so the operator can
   * print again, or Save PDF, from the same preview. It is freed only by
   * `print:releasePreview` or app shutdown.
   */
  ipcMain.handle('print:printArtifact', async (_event, raw: unknown) => {
    const r = (raw ?? {}) as { contractVersion?: string; token?: string; copies?: number };

    if (r.contractVersion !== SUPPORTED_CONTRACT) {
      return { status: 'failed', error: `إصدار عقد الطباعة غير مدعوم: ${String(r.contractVersion)}` };
    }
    if (typeof r.token !== 'string') {
      return { status: 'failed', error: 'رمز المعاينة غير صالح' };
    }
    if (r.copies !== undefined && (!Number.isInteger(r.copies) || r.copies < 1 || r.copies > 99)) {
      return { status: 'failed', error: 'عدد النسخ غير صالح' };
    }

    const artifact = artifacts.get(r.token);
    if (!artifact) {
      // An expired or already-released token must fail — never fall back to printing
      // the visible window.
      return { status: 'failed', error: 'انتهت صلاحية المعاينة — أعد توليدها.' };
    }

    const copies = r.copies && r.copies > 1 ? r.copies : undefined;
    const tmpPdf = path.join(getTempDir(), `${randomUUID()}.pdf`);
    let win: BrowserWindow | null = null;

    try {
      await fs.promises.writeFile(tmpPdf, artifact.pdf, { mode: 0o600 });

      win = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          plugins: true, // enables Chromium's PDF viewer — required to render/print a PDF
        },
      });

      const ready = new Promise<void>((resolve, reject) => {
        const w = win!;
        w.webContents.once('did-finish-load', () => resolve());
        w.webContents.once('did-fail-load', (_e, _c, desc) =>
          reject(new Error(desc || 'failed to load pdf')),
        );
      });
      await win.loadFile(tmpPdf);
      await ready;

      const result = await new Promise<{ status: string; error?: string }>((resolve) => {
        win!.webContents.print(
          { silent: false, printBackground: true, ...(copies ? { copies } : {}) },
          (success, failureReason) => {
            if (success) return resolve({ status: 'printed' });
            const reason = (failureReason ?? '').toLowerCase();
            if (reason.includes('cancel')) return resolve({ status: 'canceled' });
            resolve({ status: 'failed', error: failureReason || 'فشل إرسال المستند إلى الطابعة' });
          },
        );
      });

      return result;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[printing] printArtifact failed:', err);
      return { status: 'failed', error: 'تعذّر إرسال المستند إلى الطابعة.' };
    } finally {
      // Destroyed and cleaned on EVERY path — success, cancel, failure, throw.
      if (win && !win.isDestroyed()) win.destroy();
      await fs.promises.unlink(tmpPdf).catch(() => {});
    }
  });

  ipcMain.handle('print:releasePreview', async (_event, raw: unknown) => {
    const r = (raw ?? {}) as { token?: string };
    if (typeof r.token !== 'string') return { released: false };
    return { released: releaseArtifact(r.token) };
  });
}

/** Called on app shutdown — no artifacts, no temp files, no windows survive. */
export function shutdownPreviewService(): void {
  releaseAllArtifacts();
  cleanupTempDir();
}
