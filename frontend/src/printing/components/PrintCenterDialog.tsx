/**
 * Print Center — dialog shell (Phase 2).
 *
 * A SHELL. It composes nothing and renders no document: it receives a `PreviewSource`
 * (self-contained HTML already produced by an EXISTING renderer), asks the main
 * process to turn it into a PDF, shows those exact bytes, and offers Print / Save PDF.
 *
 * ExplorerKit language, Arabic-first RTL, light+dark application shell — but the paper
 * itself is always white (see PrintCenter.css).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './PrintCenter.css';
import PrintPreviewPane from './PrintPreviewPane';
import { usePrintCenter, type PreviewSource } from '../usePrintCenter';

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const MAX_COPIES = 20;

export interface PrintCenterDialogProps {
  open: boolean;
  onClose: () => void;
  /** Lazily produces the self-contained document at generate time. */
  compose: () => PreviewSource;
  lang?: 'ar' | 'en';
}

export default function PrintCenterDialog({ open, onClose, compose, lang = 'ar' }: PrintCenterDialogProps) {
  const en = lang === 'en';
  const { status, generate, savePdf, printArtifact, release, currentSource } = usePrintCenter();

  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<'none' | 'width' | 'page'>('width');
  const [currentPage, setCurrentPage] = useState(1);
  const [gotoPage, setGotoPage] = useState<number | null>(null);
  const [pageInput, setPageInput] = useState('1');
  const [copies, setCopies] = useState(1);
  const [printing, setPrinting] = useState(false);
  /** Synchronous double-click barrier — see doPrint(). */
  const printingRef = useRef(false);

  const composeRef = useRef(compose);
  composeRef.current = compose;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Generate on open; release on close. Zoom/page changes never re-enter this effect,
  // so they can never regenerate the PDF.
  useEffect(() => {
    if (!open) return;
    void generate(() => composeRef.current());
    return () => release();
  }, [open, generate, release]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const ready = status.state === 'ready';
  const busy = status.state === 'composing' || status.state === 'rendering';

  /**
   * Print the PREVIEWED PDF ARTIFACT.
   *
   * THE DEFECT THIS REPLACES: this used to call `submitPrintJob` (the Phase 1 gateway),
   * which prints the VISIBLE APPLICATION WINDOW. The physical output therefore contained
   * the sidebar, the toolbar and this very dialog, instead of the document. The legacy
   * invoice path never showed the bug only because that page hides its chrome with
   * `@media print` — the Print Center has no such rules, so everything it displayed went
   * to paper.
   *
   * Now the SAME PDF bytes that were previewed (and that Save PDF writes) are loaded into
   * an isolated hidden surface and printed. The visible window is never printed, and the
   * PDF.js canvas is never a print source — PDF.js stays a viewer.
   *
   * The ref guard is a synchronous double-click barrier; the hook single-flights too.
   */
  const doPrint = useCallback(async () => {
    if (!ready || printingRef.current) return;
    printingRef.current = true;
    setPrinting(true);
    try {
      await printArtifact(copies);
    } finally {
      printingRef.current = false;
      setPrinting(false);
    }
  }, [ready, copies, printArtifact]);

  const doSave = useCallback(async () => {
    if (!ready) return;
    await savePdf();
  }, [ready, savePdf]);

  // Keyboard: Ctrl+P print · Ctrl+S save · Esc close · +/- zoom · PageUp/Down navigate
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const inField = (e.target as HTMLElement).tagName === 'INPUT';
      if (e.key === 'Escape' && !busy && !printing) {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        void doPrint();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave();
      } else if (!inField && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        setFitMode('none');
        setScale((s) => ZOOM_STEPS.find((z) => z > s) ?? s);
      } else if (!inField && e.key === '-') {
        e.preventDefault();
        setFitMode('none');
        setScale((s) => [...ZOOM_STEPS].reverse().find((z) => z < s) ?? s);
      } else if (!inField && e.key === 'PageDown') {
        e.preventDefault();
        setGotoPage(Math.min(status.pageCount, currentPage + 1));
      } else if (!inField && e.key === 'PageUp') {
        e.preventDefault();
        setGotoPage(Math.max(1, currentPage - 1));
      }
    },
    [busy, printing, onClose, doPrint, doSave, currentPage, status.pageCount],
  );

  const commitPageInput = () => {
    const n = parseInt(pageInput, 10);
    if (!Number.isFinite(n)) {
      setPageInput(String(currentPage)); // reject silently, restore
      return;
    }
    const clamped = Math.max(1, Math.min(status.pageCount || 1, n)); // clamp, never crash
    setPageInput(String(clamped));
    setGotoPage(clamped);
  };

  if (!open) return null;

  const label = currentSource.current?.documentLabel ?? currentSource.current?.title ?? '';

  return (
    <div className="pc-scrim" role="presentation">
      <div
        className="pc-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={en ? 'Print Center' : 'مركز الطباعة'}
        dir={en ? 'ltr' : 'rtl'}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        {/* ── Toolbar ── */}
        <div className="pc-toolbar">
          <div className="pc-toolbar-group">
            <button
              type="button"
              className="pc-btn pc-btn--primary"
              onClick={doPrint}
              disabled={!ready || printing}
              aria-label={en ? 'Print' : 'طباعة'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">print</span>
              {printing ? (en ? 'Printing…' : 'جارٍ الطباعة…') : en ? 'Print' : 'طباعة'}
            </button>
            <button
              type="button"
              className="pc-btn"
              onClick={doSave}
              disabled={!ready || status.state === 'saving'}
              aria-label={en ? 'Save PDF' : 'حفظ PDF'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>
              {status.state === 'saving' ? (en ? 'Saving…' : 'جارٍ الحفظ…') : en ? 'Save PDF' : 'حفظ PDF'}
            </button>

            <label className="pc-copies">
              <span>{en ? 'Copies' : 'النسخ'}</span>
              <input
                type="number"
                min={1}
                max={MAX_COPIES}
                value={copies}
                aria-label={en ? 'Number of copies' : 'عدد النسخ'}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setCopies(Number.isFinite(n) ? Math.max(1, Math.min(MAX_COPIES, n)) : 1);
                }}
              />
            </label>
          </div>

          <div className="pc-toolbar-group">
            {/* Zoom — presentation only; never regenerates the PDF. */}
            <button
              type="button"
              className="pc-icon-btn"
              aria-label={en ? 'Zoom out' : 'تصغير'}
              disabled={!ready}
              onClick={() => {
                setFitMode('none');
                setScale((s) => [...ZOOM_STEPS].reverse().find((z) => z < s) ?? s);
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">zoom_out</span>
            </button>
            <select
              className="pc-select"
              aria-label={en ? 'Zoom level' : 'مستوى التكبير'}
              disabled={!ready}
              value={fitMode === 'none' ? String(scale) : fitMode}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'width' || v === 'page') {
                  setFitMode(v);
                } else {
                  setFitMode('none');
                  setScale(Number(v));
                }
              }}
            >
              <option value="width">{en ? 'Fit Width' : 'ملاءمة العرض'}</option>
              <option value="page">{en ? 'Fit Page' : 'ملاءمة الصفحة'}</option>
              {ZOOM_STEPS.map((z) => (
                <option key={z} value={String(z)}>
                  {Math.round(z * 100)}%
                </option>
              ))}
            </select>
            <button
              type="button"
              className="pc-icon-btn"
              aria-label={en ? 'Zoom in' : 'تكبير'}
              disabled={!ready}
              onClick={() => {
                setFitMode('none');
                setScale((s) => ZOOM_STEPS.find((z) => z > s) ?? s);
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">zoom_in</span>
            </button>

            {/* Page navigation */}
            <div className="pc-pager">
              <button
                type="button"
                className="pc-icon-btn"
                aria-label={en ? 'Previous page' : 'الصفحة السابقة'}
                disabled={!ready || currentPage <= 1}
                onClick={() => setGotoPage(Math.max(1, currentPage - 1))}
              >
                <span className="material-symbols-outlined" aria-hidden="true">expand_less</span>
              </button>
              <input
                className="pc-page-input"
                aria-label={en ? 'Page number' : 'رقم الصفحة'}
                value={pageInput}
                disabled={!ready}
                onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={commitPageInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitPageInput();
                }}
              />
              <span className="pc-page-total">
                / {status.pageCount || 0}
              </span>
              <button
                type="button"
                className="pc-icon-btn"
                aria-label={en ? 'Next page' : 'الصفحة التالية'}
                disabled={!ready || currentPage >= status.pageCount}
                onClick={() => setGotoPage(Math.min(status.pageCount, currentPage + 1))}
              >
                <span className="material-symbols-outlined" aria-hidden="true">expand_more</span>
              </button>
            </div>

            <button
              type="button"
              className="pc-icon-btn"
              onClick={onClose}
              disabled={busy || printing}
              aria-label={en ? 'Close' : 'إغلاق'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="pc-body">
          {busy && (
            <div className="pc-state" role="status" aria-live="polite">
              <span className="pc-spinner" aria-hidden="true" />
              <strong>
                {status.state === 'composing'
                  ? en
                    ? 'Preparing document…'
                    : 'جارٍ تجهيز المستند…'
                  : en
                    ? 'Generating preview…'
                    : 'جارٍ توليد المعاينة…'}
              </strong>
              <span>{en ? 'This may take a moment for large reports.' : 'قد يستغرق الأمر لحظات للتقارير الكبيرة.'}</span>
            </div>
          )}

          {status.state === 'failed' && (
            <div className="pc-state pc-state--error" role="alert">
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              <strong>{en ? 'Preview failed' : 'تعذّرت المعاينة'}</strong>
              {/* Arabic, human-readable. Never a stack trace, never a filesystem path. */}
              <span>{status.error}</span>
              <button type="button" className="pc-btn" onClick={() => void generate(() => composeRef.current())}>
                {en ? 'Retry' : 'إعادة المحاولة'}
              </button>
            </div>
          )}

          {ready && status.objectUrl && (
            <PrintPreviewPane
              objectUrl={status.objectUrl}
              pageCount={status.pageCount}
              scale={scale}
              fitMode={fitMode}
              onCurrentPageChange={setCurrentPage}
              gotoPage={gotoPage}
              onGotoHandled={() => setGotoPage(null)}
            />
          )}
        </div>

        {/* ── Status bar ── */}
        <div className="pc-statusbar">
          <span className="pc-status-doc">{label}</span>
          <span className="pc-status-sep" aria-hidden="true">·</span>
          <span>
            {en ? 'Pages' : 'الصفحات'}: {status.pageCount || 0}
          </span>
          <span className="pc-status-sep" aria-hidden="true">·</span>
          {/* Status is text, never colour-only. */}
          <span className={`pc-status-chip pc-status-chip--${status.state}`}>
            {STATE_LABEL[status.state][en ? 1 : 0]}
          </span>
        </div>
      </div>
    </div>
  );
}

const STATE_LABEL: Record<string, [string, string]> = {
  idle: ['في الانتظار', 'Idle'],
  composing: ['تجهيز', 'Composing'],
  rendering: ['توليد المعاينة', 'Rendering'],
  ready: ['جاهز', 'Ready'],
  printing: ['طباعة', 'Printing'],
  saving: ['حفظ', 'Saving'],
  canceled: ['أُلغيت', 'Canceled'],
  failed: ['فشل', 'Failed'],
};
