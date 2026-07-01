import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

type Lang = 'ar' | 'en';
export type FitMode = 'width' | 'page' | null;

interface Props {
  lang?: Lang;
  /** The document to preview (e.g. `.form-page`), rendered unchanged. */
  children: ReactNode;

  /** Controlled zoom state, owned by PrintWorkspace. */
  scale: number;
  fitMode: FitMode;
  /** Set an exact scale (used to report a computed fit result). */
  onScale: (n: number) => void;
  /** Nudge zoom by a delta (also clears fit mode). */
  onStep: (delta: number) => void;
  onReset: () => void;
  onFit: (mode: Exclude<FitMode, null>) => void;

  /** Reports the estimated on-screen page count of the document. */
  onPageCount?: (n: number) => void;
}

/** A4 portrait at 96dpi — matches the document's on-screen width/height. */
const PAGE_W = 793;
const PAGE_H = 1122;
const CANVAS_PAD_X = 80; // matches .pw-canvas horizontal padding (40px × 2)
const CANVAS_PAD_Y = 56;

export function clampScale(n: number): number {
  return Math.min(2, Math.max(0.25, n));
}

/**
 * Preview surface with on-screen zoom controls (buttons + Ctrl/⌘ + wheel).
 *
 * Zoom is applied purely as a CSS `transform: scale()` on the wrapper around the
 * document. It affects the screen preview ONLY — the printed output is untouched
 * (in print the scaler collapses to `display: contents` with no transform).
 */
export default function PrintWorkspacePreview({
  lang = 'ar',
  children,
  scale,
  fitMode,
  onScale,
  onStep,
  onReset,
  onFit,
  onPageCount,
}: Props) {
  const en = lang === 'en';
  const canvasRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);

  const computeFit = useCallback(
    (mode: Exclude<FitMode, null>) => {
      const el = canvasRef.current;
      if (!el) return;
      const availW = el.clientWidth - CANVAS_PAD_X;
      const availH = el.clientHeight - CANVAS_PAD_Y;
      if (availW <= 0) return; // not laid out yet (jsdom / hidden)
      const byWidth = availW / PAGE_W;
      const next = mode === 'width' ? byWidth : Math.min(byWidth, availH / PAGE_H);
      onScale(clampScale(next));
    },
    [onScale],
  );

  // Recompute fit-based zoom when the container resizes.
  useLayoutEffect(() => {
    if (!fitMode) return;
    computeFit(fitMode);
    if (typeof ResizeObserver === 'undefined') return;
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => computeFit(fitMode));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitMode, computeFit]);

  // Ctrl / Cmd + wheel zoom (screen only). Non-passive so we can preventDefault.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onStep(e.deltaY < 0 ? 0.1 : -0.1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onStep]);

  // Estimate the on-screen page count from the rendered document height.
  useLayoutEffect(() => {
    if (!onPageCount) return;
    const el = scalerRef.current;
    if (!el) return;
    const measure = () => {
      const page = el.querySelector('.form-page') as HTMLElement | null;
      const h = page ? page.offsetHeight : el.offsetHeight; // pre-transform height
      onPageCount(Math.max(1, Math.ceil(h / PAGE_H)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onPageCount, children]);

  const pct = Math.round(scale * 100);

  return (
    <div className="pw-preview">
      <div className="pw-preview-toolbar pw-chrome">
        <div className="pw-zoom-pill">
          <button
            type="button"
            className="pw-zoom-btn"
            onClick={() => onStep(-0.1)}
            aria-label={en ? 'Zoom out' : 'تصغير'}
            title={en ? 'Zoom out' : 'تصغير'}
          >
            −
          </button>
          <button
            type="button"
            className="pw-zoom-value"
            onClick={onReset}
            aria-label={en ? 'Reset zoom to 100%' : 'إعادة التكبير إلى 100%'}
            title={en ? 'Reset to 100%' : 'إعادة إلى 100%'}
          >
            {pct}%
          </button>
          <button
            type="button"
            className="pw-zoom-btn"
            onClick={() => onStep(0.1)}
            aria-label={en ? 'Zoom in' : 'تكبير'}
            title={en ? 'Zoom in' : 'تكبير'}
          >
            +
          </button>
          <span className="pw-zoom-divider" />
          <button
            type="button"
            className="pw-zoom-btn"
            aria-pressed={fitMode === 'width' ? 'true' : 'false'}
            onClick={() => onFit('width')}
          >
            {en ? 'Fit width' : 'ملاءمة العرض'}
          </button>
          <button
            type="button"
            className="pw-zoom-btn"
            aria-pressed={fitMode === 'page' ? 'true' : 'false'}
            onClick={() => onFit('page')}
          >
            {en ? 'Fit page' : 'ملاءمة الصفحة'}
          </button>
        </div>
      </div>

      <div className="pw-canvas" ref={canvasRef}>
        <div
          className="pw-scaler"
          data-testid="pw-scaler"
          ref={scalerRef}
          style={{ transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
