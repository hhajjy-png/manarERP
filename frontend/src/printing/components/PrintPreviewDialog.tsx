/**
 * Universal Print Preview v1 — نافذة المعاينة.
 *
 * المعاينة **تعرض فقط**. لا تطبع، ولا تعرف IPC، ولا تستدعي `window.manar` ولا
 * `webContents`. زر «طباعة» بداخلها يغلقها أولًا (وإلا ظهرت في الورقة — مسار الطباعة
 * القديم يطبع النافذة المرئية) ثم يستدعي `onPrint()` — callback تملكه الصفحة وتنفّذ فيه
 * مسارها القديم المستقر.
 *
 * المستند يُعرض داخل `<iframe srcdoc>` في **نفس أصل التطبيق**: لذلك تُحمَّل الخطوط
 * والشعار كما على الشاشة، وتظهر العربية مشكّلة ومتّصلة. لا نافذة مخفية، لا ملف مؤقّت،
 * لا PDF وسيط، لا PDF.js، لا rasterisation.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './PrintCenter.css';

/** نسب التكبير الصريحة. Fit Width / Fit Page ليسا نسبتين ثابتتين — بل يُحسبان. */
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

type FitMode = 'width' | 'page' | 'none';

/** أبعاد A4 بالمليمتر — تُحوَّل إلى بكسل عند 96dpi. */
const MM_TO_PX = 96 / 25.4; // ≈ 3.7795
const A4_W_MM = 210;
const A4_H_MM = 297;

/** حشوة بصرية حول الورقة — تتقلّص على الشاشات الضيقة. */
const PAD_WIDE = 56;
const PAD_NARROW = 32;
const NARROW_AT = 900;

export interface PrintPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  /** ينتج مستند HTML مكتفيًا بذاته من الـ printable root الحالي (لا يعيد الرسم). */
  compose: () => string;
  /** مسار الطباعة القديم للصفحة. يُستدعى مرة واحدة بعد إغلاق المعاينة. */
  onPrint: () => void;
  documentLabel?: string;
  lang?: 'ar' | 'en';
  orientation?: 'portrait' | 'landscape';
}

export default function PrintPreviewDialog({
  open,
  onClose,
  compose,
  onPrint,
  documentLabel = '',
  lang = 'ar',
  orientation = 'portrait',
}: PrintPreviewDialogProps) {
  const en = lang === 'en';

  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState<FitMode>('width'); // ← Fit Width هو الافتراضي
  const [zoom, setZoom] = useState(1); // النسبة الصريحة عند fit === 'none'
  const [fitScale, setFitScale] = useState(1); // النسبة المحسوبة لـ width/page
  const [pageCount, setPageCount] = useState(1);
  const [printing, setPrinting] = useState(false);

  const printingRef = useRef(false); // حاجز نقر مزدوج متزامن
  const canvasRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef(compose);
  composeRef.current = compose;

  const pageWmm = orientation === 'landscape' ? A4_H_MM : A4_W_MM;
  const pageHmm = orientation === 'landscape' ? A4_W_MM : A4_H_MM;
  const pageWpx = pageWmm * MM_TO_PX;
  const pageHpx = pageHmm * MM_TO_PX;

  /** النسبة الفعلية المعروضة — محسوبة لا ثابتة. */
  const scale = fit === 'none' ? zoom : fitScale;

  // بناء المستند عند الفتح فقط. التكبير لا يعيد البناء.
  useEffect(() => {
    if (!open) {
      setHtml(null);
      setError(null);
      setPageCount(1);
      return;
    }
    try {
      setError(null);
      setHtml(composeRef.current());
    } catch (e) {
      setHtml(null);
      setError(e instanceof Error ? e.message : 'تعذّر تجهيز المعاينة.');
    }
  }, [open]);

  // قفل تمرير الصفحة خلف النافذة، واستعادته عند الإغلاق.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  /**
   * حساب Fit Width / Fit Page من المساحة المتاحة فعلًا — لا نسبة ثابتة.
   *
   *   Fit Width = (عرض الـ canvas − الحشوتان − عرض شريط التمرير) ÷ عرض الورقة
   *   Fit Page  = أصغر (نسبة العرض، نسبة الارتفاع) — لتظهر الصفحة كاملة
   *
   * يُعاد الحساب عند: الفتح · تغيير حجم النافذة · تغيير الاتجاه/الـ PageSpec ·
   * تغيّر عدد الصفحات (ظهور/اختفاء شريط تمرير رأسي يغيّر العرض المتاح).
   */
  const recomputeFit = useCallback(() => {
    const el = canvasRef.current;
    if (!el || fit === 'none') return;
    const pad = el.clientWidth < NARROW_AT ? PAD_NARROW : PAD_WIDE;
    const availW = Math.max(80, el.clientWidth - pad * 2);
    const availH = Math.max(80, el.clientHeight - pad * 2);
    const next =
      fit === 'width'
        ? availW / pageWpx
        : Math.min(availW / pageWpx, availH / pageHpx);
    // لا نكبّر فوق 100% تلقائيًا — الورقة لا تتضخّم بلا داعٍ.
    setFitScale(Math.max(0.1, Math.min(next, 2)));
  }, [fit, pageWpx, pageHpx]);

  useLayoutEffect(() => {
    if (!open) return;
    recomputeFit();
  }, [open, recomputeFit, pageCount, html]);

  useEffect(() => {
    if (!open) return;
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', recomputeFit);
      return () => window.removeEventListener('resize', recomputeFit);
    }
    const ro = new ResizeObserver(() => recomputeFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, recomputeFit]);

  /** عدد الصفحات **تقديري** من ارتفاع المحتوى — لا ندّعي ترقيمًا حقيقيًا. */
  const onFrameLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    setPageCount(Math.max(1, Math.ceil(h / pageHpx)));
  }, [pageHpx]);

  const doPrint = useCallback(() => {
    if (printingRef.current) return; // نقرة ثانية أثناء الطباعة → تُتجاهل
    printingRef.current = true;
    setPrinting(true);
    onClose(); // الإغلاق أولًا — وإلا طُبعت النافذة نفسها
    requestAnimationFrame(() => {
      try {
        onPrint();
      } finally {
        printingRef.current = false;
        setPrinting(false);
      }
    });
  }, [onClose, onPrint]);

  const zoomBy = useCallback((dir: 1 | -1) => {
    setFit('none');
    setZoom((z) => {
      const current = z;
      return dir > 0
        ? (ZOOM_STEPS.find((s) => s > current) ?? current)
        : ([...ZOOM_STEPS].reverse().find((s) => s < current) ?? current);
    });
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(); // الإغلاق لا يطبع
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        doPrint();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomBy(1);
      } else if (e.key === '-') {
        e.preventDefault();
        zoomBy(-1);
      }
    },
    [onClose, doPrint, zoomBy],
  );

  if (!open) return null;

  const ready = html !== null && !error;
  const selectValue = fit === 'none' ? String(zoom) : fit;

  return (
    <div className="pc-scrim" role="presentation">
      <div
        className="pc-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={en ? 'Print preview' : 'معاينة قبل الطباعة'}
        dir={en ? 'ltr' : 'rtl'}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        {/* ── شريط الأدوات — ثابت، لا يتمرّر مع المستند ── */}
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
              {en ? 'Print' : 'طباعة'}
            </button>
            <button
              type="button"
              className="pc-btn"
              onClick={onClose}
              aria-label={en ? 'Close' : 'إغلاق'}
            >
              {en ? 'Close' : 'إغلاق'}
            </button>
          </div>

          <div className="pc-toolbar-group">
            <button
              type="button"
              className="pc-icon-btn"
              aria-label={en ? 'Zoom out' : 'تصغير'}
              disabled={!ready}
              onClick={() => zoomBy(-1)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">zoom_out</span>
            </button>

            {/* تباين صريح — لا اعتماد على اللون الموروث (Windows/Electron يرسم
                الـ <option> بألوان النظام، فالأبيض على الأبيض كان يخفي القيم). */}
            <select
              className="pc-select"
              aria-label={en ? 'Zoom level' : 'مستوى التكبير'}
              disabled={!ready}
              value={selectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'width' || v === 'page') setFit(v);
                else {
                  setFit('none');
                  setZoom(Number(v));
                }
              }}
            >
              <option value="width">{en ? 'Fit Width' : 'ملاءمة العرض'}</option>
              <option value="page">{en ? 'Fit Page' : 'ملاءمة الصفحة'}</option>
              {ZOOM_STEPS.map((z) => (
                <option key={z} value={String(z)}>{Math.round(z * 100)}%</option>
              ))}
            </select>

            <button
              type="button"
              className="pc-icon-btn"
              aria-label={en ? 'Zoom in' : 'تكبير'}
              disabled={!ready}
              onClick={() => zoomBy(1)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">zoom_in</span>
            </button>

            {/* النسبة الفعلية المعروضة — تشمل النسبة المحسوبة لـ Fit. */}
            <span className="pc-zoom-value" aria-live="polite">
              {Math.round(scale * 100)}%
            </span>
          </div>
        </div>

        {/* ── مساحة المعاينة — هي وحدها القابلة للتمرير ── */}
        <div className="pc-body">
          {error && (
            <div className="pc-state pc-state--error" role="alert">
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              <strong>{en ? 'Preview failed' : 'تعذّرت المعاينة'}</strong>
              <span>{error}</span>
            </div>
          )}

          {ready && (
            <div className="pc-canvas" ref={canvasRef}>
              {/* الورقة: توسيط أفقي، حشوة حولها، حدّ خفيف وظل هادئ. */}
              <div
                className="pc-sheet"
                style={{
                  width: `${Math.round(pageWpx * scale)}px`,
                  minHeight: `${Math.round(pageHpx * scale)}px`,
                }}
              >
                <iframe
                  ref={frameRef}
                  className="pc-frame"
                  title={en ? 'Document preview' : 'معاينة المستند'}
                  srcDoc={html}
                  sandbox="allow-same-origin"
                  onLoad={onFrameLoad}
                  style={{
                    width: `${Math.round(pageWpx)}px`,
                    height: `${Math.round(pageHpx * pageCount)}px`,
                    transform: `scale(${scale})`,
                    transformOrigin: en ? 'top left' : 'top right',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── شريط الحالة ── */}
        <div className="pc-statusbar">
          <span className="pc-status-doc">{documentLabel}</span>
          <span className="pc-status-sep" aria-hidden="true">·</span>
          {/* لا ترقيم حقيقي بعد — لا نضيف أزرار تنقّل وهمية، ولا ندّعي دقة غير موجودة. */}
          <span>
            {en ? 'Estimated pages' : 'الصفحات التقديرية'}: {pageCount}
          </span>
          <span className={`pc-status-chip pc-status-chip--${ready ? 'ready' : 'failed'}`}>
            {ready ? (en ? 'Ready' : 'جاهز') : en ? 'Failed' : 'فشل'}
          </span>
        </div>
      </div>
    </div>
  );
}
