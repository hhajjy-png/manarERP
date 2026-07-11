/**
 * Print Center — PDF preview pane (Phase 2).
 *
 * RENDERING CHOICE: PDF.js (`pdfjs-dist`, bundled offline, worker served from our own
 * assets via Vite's `?url`). Chromium's built-in PDF viewer was evaluated first and
 * rejected: it exposes no API, so it cannot give us a page count, per-page paper
 * surfaces, zoom presets, fit modes, or a scroll-driven current-page indicator — all
 * of which are required. PDF.js renders each page to a <canvas> we control.
 *
 * It renders THE ACTUAL PDF ARTIFACT produced by `printToPDF` — the same bytes that
 * Save PDF writes. It is not a screenshot and not a second HTML mockup, so what the
 * operator sees is what the file contains.
 *
 * Theme rule: the application shell may be light or dark; the PAGE is always white.
 * The drop shadow exists only here, never in the PDF.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Offline: the worker is one of OUR bundled assets. No CDN, no network.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** A4 at 96 dpi ≈ 794 px wide — the reference width for the fit calculations. */
const BASE_SCALE = 1.5;

interface Props {
  /** Object URL of the generated PDF. */
  objectUrl: string;
  pageCount: number;
  /** Presentation scale (1 = 100%). Changing it must NOT regenerate the PDF. */
  scale: number;
  fitMode: 'none' | 'width' | 'page';
  /** Reports the page currently under the viewport, for the page indicator. */
  onCurrentPageChange: (page: number) => void;
  /** Set when the caller wants to jump to a page (page navigator / Page Up/Down). */
  gotoPage: number | null;
  onGotoHandled: () => void;
  /** Reports the fit scale computed for 'width' / 'page', so the toolbar can show it. */
  onFitScale?: (scale: number) => void;
}

export default function PrintPreviewPane({
  objectUrl,
  pageCount,
  scale,
  fitMode,
  onCurrentPageChange,
  gotoPage,
  onGotoHandled,
  onFitScale,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // ── Load the document once per artifact. ──
  useEffect(() => {
    let canceled = false;
    setLoaded(false);
    setRenderError(null);

    const task = pdfjs.getDocument({ url: objectUrl });
    task.promise
      .then((doc) => {
        if (canceled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setLoaded(true);
      })
      .catch(() => {
        if (!canceled) setRenderError('تعذّر عرض ملف المعاينة.');
      });

    return () => {
      canceled = true;
      void task.destroy();
      const doc = docRef.current;
      docRef.current = null;
      if (doc) void doc.destroy(); // free the PDF worker's buffers — no leak on close
    };
  }, [objectUrl]);

  // ── Render every page at the effective scale. ──
  const renderPages = useCallback(async () => {
    const doc = docRef.current;
    const container = scrollRef.current;
    if (!doc || !container) return;

    // Compute the fit scale from the FIRST page's intrinsic size.
    let effective = scale;
    if (fitMode !== 'none') {
      const first = await doc.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      const availW = container.clientWidth - 48; // gutters
      const availH = container.clientHeight - 48;
      effective = fitMode === 'width' ? availW / vp.width : Math.min(availW / vp.width, availH / vp.height);
      onFitScale?.(effective);
    }

    for (let n = 1; n <= doc.numPages; n++) {
      const holder = pageRefs.current[n - 1];
      if (!holder) continue;
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: effective * BASE_SCALE });

      let canvas = holder.querySelector('canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        holder.appendChild(canvas);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      // CSS size drives layout; the canvas is oversampled for crisp text.
      canvas.style.width = `${Math.floor(viewport.width / BASE_SCALE)}px`;
      canvas.style.height = `${Math.floor(viewport.height / BASE_SCALE)}px`;

      await page.render({ canvasContext: ctx, viewport }).promise;
    }
  }, [scale, fitMode, onFitScale]);

  useEffect(() => {
    if (loaded) void renderPages();
  }, [loaded, renderPages]);

  // ── Current page follows the scroll position. ──
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !loaded) return;
    const onScroll = () => {
      const mid = container.scrollTop + container.clientHeight / 2;
      let current = 1;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (el && el.offsetTop <= mid) current = i + 1;
      }
      onCurrentPageChange(current);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
  }, [loaded, onCurrentPageChange, pageCount]);

  // ── Programmatic navigation (page navigator, Page Up/Down). ──
  useEffect(() => {
    if (gotoPage === null) return;
    const el = pageRefs.current[gotoPage - 1];
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onGotoHandled();
  }, [gotoPage, onGotoHandled]);

  if (renderError) {
    return (
      <div className="pc-preview-error" role="alert">
        {renderError}
      </div>
    );
  }

  return (
    <div className="pc-preview-scroll" ref={scrollRef} tabIndex={0} aria-label="معاينة المستند">
      {Array.from({ length: pageCount }, (_, i) => (
        <div
          key={i}
          className="pc-page"
          ref={(el) => {
            pageRefs.current[i] = el;
          }}
          aria-label={`صفحة ${i + 1} من ${pageCount}`}
        />
      ))}
    </div>
  );
}
