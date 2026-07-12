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
 *
 * ── نموذج التكبير ─────────────────────────────────────────────────────────────
 * `transform: scale()` **لا يغيّر صندوق التخطيط**: الـ iframe يظل يشغل مقاسه الأصلي
 * في التدفّق مهما صغّرناه بصريًا. لذلك لا يكفي وحده. النموذج هنا مزدوج:
 *
 *   الورقة (`.pc-sheet`)  → صندوق **مقيس** صراحةً: العرض والارتفاع مضروبان في scale.
 *   الـ iframe            → يرسم بمقاس A4 الحقيقي (794×1123px عند 96dpi) ثم يُقيَّس
 *                            بصريًا بـ transform داخل صندوق الورقة.
 *
 * الورقة هي ما يراه التخطيط والتمرير؛ الـ transform مجرّد طبقة رسم فوقها. هكذا يبقى
 * مقاس الورقة المعروض = مقاسها الحقيقي × النسبة، بلا فراغ أبيض ولا قصّ.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './PrintCenter.css';

/** نسب التكبير الصريحة. Fit Width / Fit Page ليسا نسبتين ثابتتين — بل يُحسبان. */
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const MIN_SCALE = 0.1;
const MAX_SCALE = 2;

type FitMode = 'width' | 'page' | 'none';

/** أبعاد A4 بالمليمتر — تُحوَّل إلى بكسل عند 96dpi (نفس افتراض Chromium للطباعة). */
const MM_TO_PX = 96 / 25.4; // ≈ 3.7795
const A4_W_MM = 210;
const A4_H_MM = 297;

/** عتبة القياس: تجاوز كسري (sub-pixel) لا يصنع صفحة ثانية. صفحة حقيقية تضيف مئات البكسلات. */
const PAGE_EPSILON = 8;

/** حشوة بصرية حول الورقة — تتقلّص على الشاشات الضيقة. */
const PAD_WIDE = 56;
const PAD_NARROW = 40;
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

  const { pageWpx, pageHpx } = useMemo(() => {
    const wmm = orientation === 'landscape' ? A4_H_MM : A4_W_MM;
    const hmm = orientation === 'landscape' ? A4_W_MM : A4_H_MM;
    return { pageWpx: wmm * MM_TO_PX, pageHpx: hmm * MM_TO_PX };
  }, [orientation]);

  /** النسبة الفعلية المعروضة — محسوبة لا ثابتة. */
  const scale = fit === 'none' ? zoom : fitScale;

  /** مقاس الورقة المعروض. هذا هو الصندوق الحقيقي في التخطيط — لا مجرد أثر بصري. */
  const sheetW = Math.round(pageWpx * scale);
  const sheetH = Math.round(pageHpx * pageCount * scale);

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
   * حساب Fit Width / Fit Page من المساحة المتاحة فعلًا — لا نسبة ثابتة، ولا معادلة
   * واحدة للاثنين:
   *
   *   Fit Width = العرض المتاح ÷ عرض الورقة            (بُعد واحد — العرض)
   *   Fit Page  = أصغر (العرض المتاح ÷ عرض الورقة، الارتفاع المتاح ÷ ارتفاع صفحة واحدة)
   *               (بُعدان — لتظهر الصفحة **كاملة** بلا تشويه للنسبة)
   *
   * «الارتفاع المتاح» يُقاس على **صفحة واحدة** لا على المستند كله: Fit Page يعني أن
   * ترى صفحة كاملة، لا أن تُسحق عشر صفحات في الشاشة.
   *
   * العرض المتاح = `clientWidth` — وهو يستثني شريط التمرير الرأسي أصلًا. ولأن الـ canvas
   * يحجز مساره دائمًا (`scrollbar-gutter: stable`) فالقيمة لا تتذبذب بين ظهوره واختفائه،
   * فلا تتولّد حلقة قياس ولا شريط تمرير أفقي في Fit Width.
   */
  const recomputeFit = useCallback(() => {
    const el = canvasRef.current;
    if (!el || fit === 'none') return;
    const pad = el.clientWidth < NARROW_AT ? PAD_NARROW : PAD_WIDE;
    const availW = Math.max(80, el.clientWidth - pad * 2);
    const availH = Math.max(80, el.clientHeight - pad * 2);
    const next = fit === 'width' ? availW / pageWpx : Math.min(availW / pageWpx, availH / pageHpx);
    setFitScale(Math.max(MIN_SCALE, Math.min(next, MAX_SCALE)));
  }, [fit, pageWpx, pageHpx]);

  // الفتح · تغيّر الوضع · تغيّر الاتجاه/المقاس · تغيّر عدد الصفحات · تبدّل المستند.
  useLayoutEffect(() => {
    if (!open) return;
    recomputeFit();
  }, [open, recomputeFit, pageCount, html]);

  // تغيّر حجم النافذة أو الحاوية — إعادة حساب فورية، لا قيمة محفوظة من فتحة سابقة.
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

  /**
   * الورقة لا «تقفز» عند تغيير التكبير: نحفظ نقطة المنتصف المرئية ونعيد التمرير إليها
   * بعد تغيّر المقاس (في نفس دورة الرسم، فلا يرى المستخدم ارتدادًا).
   */
  const prevScaleRef = useRef(scale);
  useLayoutEffect(() => {
    const el = canvasRef.current;
    const prev = prevScaleRef.current;
    prevScaleRef.current = scale;
    if (!el || !prev || prev === scale) return;
    const ratio = scale / prev;
    const midX = el.scrollLeft + el.clientWidth / 2;
    const midY = el.scrollTop + el.clientHeight / 2;
    el.scrollLeft = midX * ratio - el.clientWidth / 2;
    el.scrollTop = midY * ratio - el.clientHeight / 2;
  }, [scale]);

  /**
   * عدد الصفحات **تقديري** — لكنه يُقاس من المحتوى نفسه، لا من الحاوية.
   *
   * الخلل الذي كان: `documentElement.scrollHeight` **لا يقلّ أبدًا عن ارتفاع الـ viewport**،
   * وviewport الـ iframe هو ارتفاعه الذي نحدّده نحن (‎Math.round(1122.52) = 1123px‎).
   * فأي فاتورة من صفحة واحدة كانت تُقاس ‎1123 ≥ 1122.52‎ ⇒ ‎ceil(1.0004) = 2‎:
   * صفحة ثانية وهمية وامتداد أبيض طويل تحتها. القياس كان يقيس **الإطار لا المستند**،
   * وكان يفتح باب حلقة ذاتية (عدد الصفحات → ارتفاع الـ iframe → قياس أكبر → عدد أكبر).
   *
   * المصدر الصحيح الوحيد: `[data-print-root]` — الجذر القابل للطباعة داخل المستند
   * المُركَّب (يضعه `composeDocument`، وهوامشه مصفَّرة هناك، وbody/html بهامش صفر).
   * ارتفاعه عنصريّ خالص، لا يرث أرضية الـ viewport، فلا يدخل ارتفاع الـ iframe في
   * الحساب إطلاقًا.
   *
   * وtolerance صغيرة (‎PAGE_EPSILON‎) تمنع تجاوزًا كسريًا من ‎1–2px‎ من أن يخلق صفحة
   * ثانية. صفحة ثانية **حقيقية** تضيف مئات البكسلات، فلا تُخفيها هذه العتبة.
   */
  const onFrameLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    const root = doc.querySelector<HTMLElement>('[data-print-root]') ?? doc.body;
    // rect للارتفاع المرسوم، وscrollHeight للعناصر التي تفيض عنه — كلاهما عنصريّ.
    const contentH = Math.max(root.getBoundingClientRect().height, root.scrollHeight);
    setPageCount(Math.max(1, Math.ceil((contentH - PAGE_EPSILON) / pageHpx)));
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

  /** خطوة التكبير تبدأ من النسبة المعروضة فعلًا — حتى لو كانت محسوبة من Fit. */
  const zoomBy = useCallback(
    (dir: 1 | -1) => {
      const current = scale;
      const next =
        dir > 0
          ? (ZOOM_STEPS.find((s) => s > current + 0.001) ?? MAX_SCALE)
          : ([...ZOOM_STEPS].reverse().find((s) => s < current - 0.001) ?? MIN_SCALE);
      setFit('none');
      setZoom(next);
    },
    [scale],
  );

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
              className="pc-btn"
              onClick={onClose}
              aria-label={en ? 'Close' : 'إغلاق'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
              {en ? 'Close' : 'إغلاق'}
            </button>
          </div>

          <div className="pc-toolbar-group pc-toolbar-group--zoom">
            <button
              type="button"
              className="pc-icon-btn"
              aria-label={en ? 'Zoom out' : 'تصغير'}
              disabled={!ready || scale <= ZOOM_STEPS[0]}
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
              value={fit === 'none' ? String(zoom) : 'fit'}
              onChange={(e) => {
                setFit('none');
                setZoom(Number(e.target.value));
              }}
            >
              {/* النسبة المحسوبة تُعرض كقيمة حيّة ما دام المستخدم في وضع ملاءمة. */}
              {fit !== 'none' && (
                <option value="fit">{Math.round(scale * 100)}%</option>
              )}
              {ZOOM_STEPS.map((z) => (
                <option key={z} value={String(z)}>{Math.round(z * 100)}%</option>
              ))}
            </select>

            <button
              type="button"
              className="pc-icon-btn"
              aria-label={en ? 'Zoom in' : 'تكبير'}
              disabled={!ready || scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              onClick={() => zoomBy(1)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">zoom_in</span>
            </button>
          </div>

          <div className="pc-toolbar-group">
            {/* وضعا الملاءمة — محسوبان، ولكل منهما معادلته. */}
            <button
              type="button"
              className={`pc-btn pc-btn--toggle${fit === 'width' ? ' is-active' : ''}`}
              aria-pressed={fit === 'width'}
              disabled={!ready}
              onClick={() => setFit('width')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">fit_width</span>
              {en ? 'Fit Width' : 'ملاءمة العرض'}
            </button>
            <button
              type="button"
              className={`pc-btn pc-btn--toggle${fit === 'page' ? ' is-active' : ''}`}
              aria-pressed={fit === 'page'}
              disabled={!ready}
              onClick={() => setFit('page')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">fit_page</span>
              {en ? 'Fit Page' : 'ملاءمة الصفحة'}
            </button>
          </div>

          {/*
            لا ترقيم حقيقي — ولا ادّعاء دقة غير موجودة.

            العرض **متصل** عمدًا: المعاينة لا تعرف أين يكسر Chromium الصفحات فعلًا
            (هوامش @page، عرض صندوق الطباعة، `page-break-before/after`،
            `break-inside: avoid`). ورسمُ فواصل عند مضاعفات ارتفاع A4 كان يعرض حدودًا
            **خاطئة بثقة** — وهو أسوأ من عدم عرضها. فلا فواصل، ولا أزرار تنقّل، ورقم
            الصفحات **تقديري** ومُعلَن كذلك.
          */}
          <span className="pc-pages" aria-live="polite">
            {en ? 'Estimated pages' : 'الصفحات التقديرية'}: <strong>{pageCount}</strong>
          </span>

          {pageCount > 1 && (
            <span className="pc-continuous-note">
              {en
                ? 'Continuous view — the printer decides the final page breaks'
                : 'عرض متصل — التقسيم النهائي يحدده الطابع'}
            </span>
          )}

          <div className="pc-toolbar-group pc-toolbar-group--end">
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
              {/* الورقة: صندوق مقيس فعلًا (لا يعتمد على أثر الـ transform)، متوسّط،
                  بحدّ خفيف وظل هادئ. */}
              <div className="pc-sheet" style={{ width: `${sheetW}px`, height: `${sheetH}px` }}>
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
