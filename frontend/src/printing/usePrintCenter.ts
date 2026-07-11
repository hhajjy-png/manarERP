/**
 * Print Center — preview lifecycle hook (Phase 2).
 *
 * Lifecycle: idle → composing → rendering → ready → (printing | saving) → released
 *
 * The invariants this hook exists to guarantee:
 *   • THE PREVIEW IS THE ARTIFACT. Save PDF writes the exact bytes that were
 *     previewed — the main process keeps them; there is no second render.
 *   • NO STALE OVERWRITE. Every request carries a monotonic id; a response from an
 *     older request is dropped, so a slow render can never replace a newer one.
 *   • ZOOM NEVER REGENERATES. Zoom/page are presentation state held by the preview
 *     pane. Only layout-affecting inputs (the document itself, its PageSpec) cause a
 *     re-render, and they do so by calling `generate()` again.
 *   • NOTHING LEAKS. The object URL is revoked and the main-process artifact released
 *     on close and on unmount, including when the component dies mid-render.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { recordPrintEvent } from './auditClient';
import type {
  PageSpecId,
  PrintDocType,
  PrintJobStatus,
  PrintPreviewState,
  PrintRenderSource,
} from './types';
import { PRINT_CONTRACT_VERSION } from './types';

export interface PreviewSource {
  docType: PrintDocType;
  documentId?: string;
  /** Self-contained HTML from an EXISTING composer — the Print Center never renders. */
  html: string;
  pageSpecId?: PageSpecId;
  title: string;
  documentLabel?: string;
  renderSource?: PrintRenderSource;
  suggestedFileName: string;
  templateId?: string;
}

export interface PrintCenterState {
  state: PrintPreviewState;
  pageCount: number;
  /** Object URL of the generated PDF — feed to the preview pane. */
  objectUrl: string | null;
  error: string | null;
  sizeBytes: number;
}

const INITIAL: PrintCenterState = {
  state: 'idle',
  pageCount: 0,
  objectUrl: null,
  error: null,
  sizeBytes: 0,
};

export function usePrintCenter() {
  const [status, setStatus] = useState<PrintCenterState>(INITIAL);

  const requestIdRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const sourceRef = useRef<PreviewSource | null>(null);
  const mountedRef = useRef(true);

  /** Free the object URL and the main-process artifact. Safe to call repeatedly. */
  const release = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    const token = tokenRef.current;
    tokenRef.current = null;
    if (token) void window.manar?.printReleasePreview?.({ token }).catch(() => {});
    if (mountedRef.current) setStatus(INITIAL);
  }, []);

  // Release on unmount too — a component destroyed mid-render must not leak an
  // artifact in the main process or an object URL in the renderer.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const token = tokenRef.current;
      if (token) void window.manar?.printReleasePreview?.({ token }).catch(() => {});
      urlRef.current = null;
      tokenRef.current = null;
    };
  }, []);

  /**
   * Compose → render → ready. Calling again supersedes any in-flight render.
   * `compose` is invoked lazily so the caller can serialize the DOM at the last moment.
   */
  const generate = useCallback(
    async (compose: () => PreviewSource) => {
      const id = ++requestIdRef.current;
      const isStale = () => id !== requestIdRef.current || !mountedRef.current;

      // Supersede the previous artifact immediately — no two artifacts alive at once.
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      const prevToken = tokenRef.current;
      tokenRef.current = null;
      if (prevToken) void window.manar?.printReleasePreview?.({ token: prevToken }).catch(() => {});

      setStatus({ ...INITIAL, state: 'composing' });

      let source: PreviewSource;
      try {
        source = compose();
        sourceRef.current = source;
      } catch (err) {
        if (isStale()) return;
        setStatus({
          ...INITIAL,
          state: 'failed',
          error: err instanceof Error ? err.message : 'تعذّر تجهيز المستند للطباعة.',
        });
        return;
      }

      const preview = window.manar?.printPreview;
      if (!preview) {
        // Older preload / non-Electron: the Print Center cannot preview. The caller's
        // legacy path remains available — this is a state, not a crash.
        if (isStale()) return;
        setStatus({
          ...INITIAL,
          state: 'failed',
          error: 'معاينة الطباعة غير متاحة في هذا الوضع.',
        });
        return;
      }

      if (isStale()) return;
      setStatus((s) => ({ ...s, state: 'rendering' }));

      const res = await preview({
        contractVersion: PRINT_CONTRACT_VERSION,
        docType: source.docType,
        documentId: source.documentId,
        html: source.html,
        pageSpecId: source.pageSpecId,
        title: source.title,
        renderSource: source.renderSource,
      }).catch(() => ({ ok: false as const, error: 'تعذّر توليد معاينة المستند.' }));

      // A newer request started while we were rendering → drop this response entirely,
      // and release the artifact it produced so it does not leak.
      if (isStale()) {
        if (res.ok) void window.manar?.printReleasePreview?.({ token: res.token }).catch(() => {});
        return;
      }

      if (!res.ok) {
        setStatus({ ...INITIAL, state: 'failed', error: res.error });
        return;
      }

      // Copy into a fresh ArrayBuffer: the IPC-transferred view may be backed by a
      // buffer TypeScript cannot prove is a plain ArrayBuffer, and Blob needs one.
      const bytes = new Uint8Array(res.data.byteLength);
      bytes.set(res.data);
      const url = URL.createObjectURL(new Blob([bytes.buffer], { type: 'application/pdf' }));
      tokenRef.current = res.token;
      urlRef.current = url;
      setStatus({
        state: 'ready',
        pageCount: res.pageCount,
        objectUrl: url,
        error: null,
        sizeBytes: res.sizeBytes,
      });

      void recordPrintEvent({
        action: 'PREVIEW_GENERATED',
        docType: source.docType,
        documentId: source.documentId,
        templateId: source.templateId,
        status: 'printed', // the preview itself succeeded; PRINT is a separate event
      });
    },
    [],
  );

  /**
   * PRINT the previewed artifact — the SAME PDF bytes, not the visible window.
   *
   * The Print Center must never go through the Phase 1 `submitPrintJob` gateway, because
   * that prints the visible application window: the sidebar, the toolbar and the Print
   * Center dialog itself would all land on paper. `print:printArtifact` loads the cached
   * PDF into an isolated hidden surface and prints THAT.
   *
   * Single-flight: a second click while a print is in progress is dropped before it
   * reaches Electron, so there is one dialog and one audit event.
   */
  const printingRef = useRef(false);

  const printArtifact = useCallback(
    async (copies: number): Promise<PrintJobStatus> => {
      const token = tokenRef.current;
      const source = sourceRef.current;
      if (!token || !source) return 'failed';
      if (printingRef.current) return 'canceled'; // suppressed — nothing was sent, no audit
      printingRef.current = true;

      if (mountedRef.current) setStatus((s) => ({ ...s, state: 'printing' }));

      const n = Number.isInteger(copies) ? Math.max(1, Math.min(99, copies)) : 1;
      let status: PrintJobStatus = 'failed';
      let error: string | undefined;

      try {
        const print = window.manar?.printArtifact;
        if (!print) {
          // No bridge → report failure. We must NEVER fall back to printing the visible
          // window: that is the very defect this replaces.
          error = 'الطباعة غير متاحة في هذا الوضع.';
        } else {
          const res = await print({
            contractVersion: PRINT_CONTRACT_VERSION,
            token,
            copies: n,
          }).catch(() => ({ status: 'failed' as const, error: 'تعذّر إرسال المستند إلى الطابعة.' }));
          status = res.status as PrintJobStatus;
          error = res.error;
        }
      } finally {
        printingRef.current = false;
        if (mountedRef.current) {
          setStatus((s) => ({
            ...s,
            state: status === 'failed' ? 'failed' : 'ready',
            error: status === 'failed' ? (error ?? 'تعذّر إرسال المستند إلى الطابعة.') : null,
          }));
        }
      }

      // Exactly one PRINT event, recording the copies actually requested. Cancel is
      // recorded as canceled — never as success.
      void recordPrintEvent({
        action: 'PRINT',
        docType: source.docType,
        documentId: source.documentId,
        templateId: source.templateId,
        copies: n,
        status,
        error,
      });

      return status;
    },
    [],
  );

  /** Save the previewed artifact. Same bytes — no regeneration. */
  const savePdf = useCallback(async (): Promise<PrintJobStatus> => {
    const token = tokenRef.current;
    const source = sourceRef.current;
    if (!token || !source) return 'failed';

    setStatus((s) => ({ ...s, state: 'saving' }));
    const res = await window.manar
      ?.printSavePdf?.({ token, suggestedFileName: source.suggestedFileName })
      .catch(() => ({ status: 'failed' as const, error: 'تعذّر حفظ ملف PDF.' }));

    const status: PrintJobStatus = (res?.status as PrintJobStatus) ?? 'failed';
    if (mountedRef.current) {
      setStatus((s) => ({
        ...s,
        state: status === 'exported' ? 'ready' : status === 'canceled' ? 'ready' : 'failed',
        error: status === 'failed' ? (res?.error ?? 'تعذّر حفظ ملف PDF.') : null,
      }));
    }

    void recordPrintEvent({
      action: 'PDF_EXPORT',
      docType: source.docType,
      documentId: source.documentId,
      templateId: source.templateId,
      status, // 'canceled' is recorded as canceled — never as success
    });
    return status;
  }, []);

  return { status, generate, savePdf, printArtifact, release, currentSource: sourceRef };
}
