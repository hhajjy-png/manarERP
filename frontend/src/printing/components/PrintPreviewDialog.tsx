/**
 * Universal Print Preview v1 — نافذة المعاينة.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * لماذا تغيّرت البنية؟
 *
 * المعاينة السابقة كانت تكتب المستند إلى ملف مؤقّت وتحمّله في نافذة مخفية عبر
 * `file://` ثم تولّد PDF. هذا كان السبب الجذري لعطلين مؤكّدين يدويًا:
 *
 *   • العربية مشوّهة: أصل التطبيق في التطوير هو `http://localhost`، ونافذة `file://`
 *     لا تستطيع تحميل خطوطه (cross-origin). فسقطت كل الخطوط، وعاد Chromium إلى خط
 *     نظام لا يشكّل العربية ولا يصلها — فظهر النص مقطّعًا.
 *   • ورقة بيضاء: طباعة PDF محمّل عبر `plugins:true` لم تُخرج شيئًا.
 *
 * الحل ليس ترقيع الخطوط، بل **عدم الخروج من أصل التطبيق أصلًا**: نعرض المستند داخل
 * `<iframe srcdoc>` في نفس المستند. عندها:
 *   – نفس الأصل، فكل الأصول (الخطوط، الشعار، الصور) تُحمَّل كما تُحمَّل على الشاشة.
 *   – الخطوط محمّلة فعلًا في التطبيق، فالعربية تُشكَّل وتتّصل بشكل صحيح.
 *   – لا نافذة مخفية، ولا ملف مؤقّت، ولا PDF وسيط.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * المعاينة لا تطبع.
 *
 * زر «طباعة» هنا لا يعرف شيئًا عن IPC ولا عن الطباعة. يغلق المعاينة أولًا (حتى لا
 * تظهر النافذة نفسها في الورقة) ثم يستدعي `onPrint()` — وهو callback تملكه الصفحة
 * الأصلية وتنفّذ فيه **مسار طباعتها القديم المستقر بلا أي تغيير**.
 *
 * لا `webContents.print` على نافذة المعاينة. لا `print:printArtifact`. لا طباعة
 * لنافذة التطبيق من داخل هذه النافذة.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './PrintCenter.css';

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** ارتفاع صفحة A4 بالبكسل عند 96dpi — لتقدير عدد الصفحات. */
const A4_PORTRAIT_PX = 1123;
const A4_LANDSCAPE_PX = 794;

export interface PrintPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  /** ينتج مستند HTML مكتفيًا بذاته من الـ printable root الحالي (لا يعيد الرسم). */
  compose: () => string;
  /**
   * مسار الطباعة القديم المستقر للصفحة. تُستدعى مرة واحدة بعد إغلاق المعاينة.
   * المعاينة لا تعرف كيف تطبع هذا المستند — الصفحة هي التي تعرف.
   */
  onPrint: () => void;
  /** عنوان يظهر في شريط الحالة. */
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
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState<'none' | 'width'>('width');
  const [pageCount, setPageCount] = useState(1);
  const [printing, setPrinting] = useState(false);

  const printingRef = useRef(false); // حاجز نقر مزدوج متزامن
  const frameRef = useRef<HTMLIFrameElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef(compose);
  composeRef.current = compose;

  // تُبنى المعاينة عند الفتح فقط. التكبير لا يعيد البناء.
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

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  /** عدد الصفحات مقدَّر من ارتفاع المحتوى — تقدير، لا وعد. */
  const onFrameLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    const pageH = orientation === 'landscape' ? A4_LANDSCAPE_PX : A4_PORTRAIT_PX;
    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    setPageCount(Math.max(1, Math.ceil(h / pageH)));
  }, [orientation]);

  /**
   * طباعة: أغلق المعاينة ثم سلّم الأمر للصفحة.
   * الإغلاق أولًا ضروري — مسار الطباعة القديم يطبع نافذة التطبيق المرئية، ولو بقيت
   * هذه النافذة مفتوحة لظهرت في الورقة.
   */
  const doPrint = useCallback(() => {
    if (printingRef.current) return; // نقرة ثانية أثناء الطباعة → تُتجاهل
    printingRef.current = true;
    setPrinting(true);

    onClose();
    // إطار واحد حتى تختفي النافذة من الـ DOM قبل أن يبدأ مسار الطباعة.
    requestAnimationFrame(() => {
      try {
        onPrint();
      } finally {
        printingRef.current = false;
        setPrinting(false);
      }
    });
  }, [onClose, onPrint]);

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
        setFit('none');
        setScale((s) => ZOOM_STEPS.find((z) => z > s) ?? s);
      } else if (e.key === '-') {
        e.preventDefault();
        setFit('none');
        setScale((s) => [...ZOOM_STEPS].reverse().find((z) => z < s) ?? s);
      }
    },
    [onClose, doPrint],
  );

  if (!open) return null;

  const ready = html !== null && !error;

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
            <span className="pc-hint">
              {en ? 'Preview only — printing uses the page’s own print path.' : 'معاينة فقط — الطباعة تتم بمسار الصفحة المعتمد.'}
            </span>
          </div>

          <div className="pc-toolbar-group">
            <button
              type="button"
              className="pc-icon-btn"
              aria-label={en ? 'Zoom out' : 'تصغير'}
              disabled={!ready}
              onClick={() => {
                setFit('none');
                setScale((s) => [...ZOOM_STEPS].reverse().find((z) => z < s) ?? s);
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">zoom_out</span>
            </button>
            <select
              className="pc-select"
              aria-label={en ? 'Zoom level' : 'مستوى التكبير'}
              disabled={!ready}
              value={fit === 'width' ? 'width' : String(scale)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'width') setFit('width');
                else {
                  setFit('none');
                  setScale(Number(v));
                }
              }}
            >
              <option value="width">{en ? 'Fit Width' : 'ملاءمة العرض'}</option>
              {ZOOM_STEPS.map((z) => (
                <option key={z} value={String(z)}>{Math.round(z * 100)}%</option>
              ))}
            </select>
            <button
              type="button"
              className="pc-icon-btn"
              aria-label={en ? 'Zoom in' : 'تكبير'}
              disabled={!ready}
              onClick={() => {
                setFit('none');
                setScale((s) => ZOOM_STEPS.find((z) => z > s) ?? s);
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">zoom_in</span>
            </button>
            <button
              type="button"
              className="pc-icon-btn"
              onClick={onClose}
              aria-label={en ? 'Close' : 'إغلاق'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>
        </div>

        <div className="pc-body">
          {error && (
            <div className="pc-state pc-state--error" role="alert">
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              <strong>{en ? 'Preview failed' : 'تعذّرت المعاينة'}</strong>
              <span>{error}</span>
            </div>
          )}

          {ready && (
            <div className="pc-preview-scroll">
              {/* المستند داخل iframe في نفس الأصل — لذلك تُحمَّل الخطوط والصور كما على
                  الشاشة، وتظهر العربية مشكّلة ومتّصلة. sandbox يمنع أي سكربت. */}
              <iframe
                ref={frameRef}
                className="pc-frame"
                title={en ? 'Document preview' : 'معاينة المستند'}
                srcDoc={html}
                sandbox="allow-same-origin"
                onLoad={onFrameLoad}
                style={{
                  width: fit === 'width' ? '100%' : `${Math.round(210 * scale * 3.7795)}px`,
                }}
              />
            </div>
          )}
        </div>

        <div className="pc-statusbar">
          <span className="pc-status-doc">{documentLabel}</span>
          <span className="pc-status-sep" aria-hidden="true">·</span>
          <span>
            {en ? 'Pages (approx.)' : 'الصفحات (تقديري)'}: {pageCount}
          </span>
          <span className={`pc-status-chip pc-status-chip--${ready ? 'ready' : 'failed'}`}>
            {ready ? (en ? 'Ready' : 'جاهز') : en ? 'Failed' : 'فشل'}
          </span>
        </div>
      </div>
    </div>
  );
}
