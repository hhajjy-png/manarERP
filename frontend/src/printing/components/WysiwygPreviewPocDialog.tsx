/**
 * True Chromium WYSIWYG Preview — POC dialog (invoice only, flag-gated).
 *
 * يعرض **صفحات Chromium الحقيقية**: مستند المعاينة المُركّب نفسه يُرسل إلى العملية
 * الرئيسية، تولّد منه Chromium ملف PDF مُرقّمًا عبر `printToPDF`، ويُعرض هنا بعارض
 * PDF المدمج في Chromium داخل iframe (blob URL). لا PDF.js، ولا محرّك عرض ثانٍ،
 * ولا محاكاة فواصل صفحات — عدد الصفحات وحدودها هي ما ركّبته Chromium فعلًا.
 *
 * **هذا الحوار لا يطبع.** زر «طباعة» يغلقه ثم يستدعي `onPrint()` — مسار الطباعة
 * القديم الذي تملكه الصفحة، بنفس نمط `PrintPreviewDialog` حرفيًا. وعند أي فشل
 * توليد يعرض زر تراجع يفتح المعاينة المتصلة الحالية (`onFallback`).
 *
 * ملاحظة صدق واجهة: شريط عارض Chromium يحمل زرَّي تنزيل/طباعة خاصّين به لا نتحكم
 * بهما (يطبعان/يحفظان أداة المعاينة ذاتها). مقبول في POC، ويُقيَّم قبل أي تعميم.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import './PrintCenter.css';

export interface WysiwygPreviewPocDialogProps {
  open: boolean;
  onClose: () => void;
  /** نفس مُركِّب مستند المعاينة الحالي — مصدر واحد للمعاينة والطباعة. */
  compose: () => string;
  /** مسار الطباعة القديم للصفحة. يُستدعى مرة واحدة بعد إغلاق المعاينة. */
  onPrint: () => void;
  /** فشل التوليد ⇒ يفتح المستخدم المعاينة المتصلة الحالية بدلًا منها. */
  onFallback: () => void;
  documentLabel?: string;
}

type Phase =
  | { kind: 'generating' }
  /** `pageCount: null` = Chromium's PDF could not be counted confidently. We show NO
   *  number rather than a false «0». The pages themselves are still Chromium's — only
   *  the metadata label is unknown. */
  | { kind: 'ready'; viewerUrl: string; pageCount: number | null }
  | { kind: 'error'; message: string };

/**
 * PDFium open parameter that removes Chromium's native PDF toolbar — its **print** and
 * **download** buttons (which bypass the official manarERP print path), plus the page,
 * zoom and thumbnail-sidebar controls. Verified on this app's runtime (Electron 31 /
 * Chromium 126): the toolbar is gone, and the document still renders and scrolls.
 *
 * It is applied ONLY to the URL handed to the iframe. The raw Blob URL is kept separate,
 * because `URL.revokeObjectURL` must receive the ORIGINAL blob URL — a fragment-appended
 * string is a different URL and would silently fail to revoke, leaking the PDF.
 *
 * This is not an overlay and not a crop: there is no dependence on any toolbar height.
 */
const PDF_VIEWER_FRAGMENT = '#toolbar=0';

/** `blob:…` → `blob:…#toolbar=0`. The blob URL never carries a fragment of its own. */
function toViewerUrl(blobUrl: string): string {
  return `${blobUrl}${PDF_VIEWER_FRAGMENT}`;
}

export default function WysiwygPreviewPocDialog({
  open,
  onClose,
  compose,
  onPrint,
  onFallback,
  documentLabel = '',
}: WysiwygPreviewPocDialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'generating' });

  const dialogRef = useRef<HTMLDivElement>(null);
  const printingRef = useRef(false);
  /** يميّز آخر طلب فتح؛ نتيجة متأخرة من فتحة سابقة تُهمَل ولا تلمس الحالة. */
  const requestIdRef = useRef(0);
  const blobUrlRef = useRef<string | null>(null);
  const composeRef = useRef(compose);
  composeRef.current = compose;

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      // الـ blob URL الخام — لا النسخة المذيّلة بالجزء. تمرير `…#toolbar=0` هنا لا يُلغي
      // شيئًا (عنوان مختلف) وكان سيُسرّب مستند الفاتورة في الذاكرة.
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  /**
   * رمز جلسة الحارس التي يملكها **هذا** الحوار.
   *
   * أثناء فتح العارض تكبت العملية الرئيسية اختصاري PDFium (‎Ctrl+P‎ / ‎Ctrl+S‎) — وهما
   * منفذا الطباعة/الحفظ اللذان يلتفّان على مسار الطباعة الرسمي. الإغلاق يُنهي الجلسة
   * برمزها هي؛ ورمز قديم من حوار سابق يُتجاهل في العملية الرئيسية فلا يُعطّل حارس حوارٍ
   * أحدث.
   */
  const guardTokenRef = useRef<number | null>(null);

  const releaseGuard = useCallback(() => {
    const token = guardTokenRef.current;
    guardTokenRef.current = null;
    if (token === null) return;
    void window.manar?.wysiwygViewerDeactivate?.(token).catch(() => {
      /* الحارس يُنظَّف أيضًا عند إغلاق النافذة/سقوط الـ renderer في العملية الرئيسية */
    });
  }, []);

  // توليد واحد لكل فتحة. الإغلاق أو فتحة أحدث يُبطل النتيجة القادمة.
  useEffect(() => {
    if (!open) {
      releaseGuard();
      revokeBlob();
      setPhase({ kind: 'generating' });
      return;
    }
    const requestId = ++requestIdRef.current;
    setPhase({ kind: 'generating' });

    (async () => {
      const generate = window.manar?.generateWysiwygPreviewPoc;
      if (!generate) {
        throw new Error('هذه التجربة متاحة داخل تطبيق سطح المكتب فقط.');
      }
      // الحارس يُسلَّح **قبل** التوليد: العارض على وشك الظهور، والقناة نفسها لا تجيب
      // إلا وجلسة عارض نشطة (تضييق قناة التوليد — انظر wysiwygPoc.ipc.ts).
      const token = (await window.manar?.wysiwygViewerActivate?.()) ?? null;
      if (requestIdRef.current !== requestId) {
        // أُغلق الحوار بينما كان التسليح جاريًا. الرمز مُنح فعلًا في العملية الرئيسية،
        // ولم يُخزَّن بعد — فلو عدنا هنا بلا تحرير لبقي الحارس مسلّحًا بلا حوار مفتوح
        // (كبتٌ دائم لـ Ctrl+P/Ctrl+S). نُحرّره بالرمز نفسه فورًا.
        if (token !== null) {
          void window.manar?.wysiwygViewerDeactivate?.(token).catch(() => {});
        }
        return; // فتحة أقدم — تُهمل
      }
      guardTokenRef.current = token;

      const html = composeRef.current();
      const result = await generate(html);
      if (requestIdRef.current !== requestId) return; // نتيجة قديمة — تُهمل
      if (!result.ok || !result.pdf) {
        throw new Error(result.error || 'تعذّر توليد المعاينة.');
      }
      revokeBlob();
      // نسخة جديدة: bytes الـ IPC قد تكون على ArrayBufferLike — نثبّتها كـ ArrayBuffer.
      const bytes = new Uint8Array(result.pdf);
      // الـ blob URL الخام هو **وحده** ما يُلغى لاحقًا؛ الجزء (#toolbar=0) يُضاف للعرض فقط.
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      blobUrlRef.current = blobUrl;
      // UNKNOWN, never zero. The main process already returns `null` when it cannot
      // count confidently; treating a 0 (or any non-positive value) as unknown here too
      // means no code path can ever render the lie «الصفحات الفعلية: 0».
      const count =
        typeof result.pageCount === 'number' && Number.isInteger(result.pageCount) && result.pageCount > 0
          ? result.pageCount
          : null;
      setPhase({ kind: 'ready', viewerUrl: toViewerUrl(blobUrl), pageCount: count });
    })().catch((e: unknown) => {
      if (requestIdRef.current !== requestId) return;
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'تعذّر توليد المعاينة.' });
    });

    return () => {
      // إغلاق/تفكيك أثناء التوليد ⇒ الطلب الجاري يصبح قديمًا ويُهمل عند وصوله.
      requestIdRef.current++;
    };
  }, [open, revokeBlob]);

  // تفكيك المكوّن نهائيًا — لا blob URL يبقى حيًّا، ولا جلسة حارس معلّقة.
  useEffect(
    () => () => {
      releaseGuard();
      revokeBlob();
    },
    [releaseGuard, revokeBlob],
  );

  /**
   * Focus: move into the dialog on open, and RESTORE it to the element that opened it on
   * close — matching the cheque calibration preview's established behaviour.
   */
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dialogRef.current?.focus();
      return;
    }
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, [open]);

  const doPrint = useCallback(() => {
    if (printingRef.current) return;
    printingRef.current = true;
    onClose(); // الإغلاق أولًا — مسار الطباعة القديم يطبع النافذة المرئية
    requestAnimationFrame(() => {
      try {
        onPrint();
      } finally {
        printingRef.current = false;
      }
    });
  }, [onClose, onPrint]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(); // الإغلاق لا يطبع
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div className="pc-scrim" role="presentation">
      <div
        className="pc-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="معاينة WYSIWYG (تجريبي)"
        dir="rtl"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <div className="pc-toolbar">
          <div className="pc-toolbar-group">
            <button type="button" className="pc-btn" onClick={onClose} aria-label="إغلاق">
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
              إغلاق
            </button>
          </div>

          <span style={{ fontSize: 12.5, fontWeight: 700 }}>
            معاينة WYSIWYG — ترقيم Chromium الحقيقي
            <span
              style={{
                marginInlineStart: 8,
                fontSize: 11,
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(217,119,6,0.15)',
                color: '#b45309',
              }}
            >
              تجريبي
            </span>
          </span>

          {/* No count is shown when it is unknown — a confident «0» would be a lie. */}
          {phase.kind === 'ready' && phase.pageCount !== null && (
            <span className="pc-pages" aria-live="polite">
              الصفحات الفعلية: <strong>{phase.pageCount}</strong>
            </span>
          )}

          <div className="pc-toolbar-group pc-toolbar-group--end">
            <button
              type="button"
              className="pc-btn pc-btn--primary"
              onClick={doPrint}
              disabled={phase.kind !== 'ready'}
              aria-label="طباعة"
            >
              <span className="material-symbols-outlined" aria-hidden="true">print</span>
              طباعة
            </button>
          </div>
        </div>

        <div className="pc-body" style={{ position: 'relative' }}>
          {phase.kind === 'generating' && (
            <div className="pc-state" role="status">
              <span className="material-symbols-outlined" aria-hidden="true">hourglass_top</span>
              <strong>جارٍ توليد الصفحات الحقيقية…</strong>
              <span>تُركِّب Chromium المستند وتُرقّم صفحاته الآن.</span>
            </div>
          )}

          {phase.kind === 'error' && (
            <div className="pc-state pc-state--error" role="alert">
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              <strong>تعذّرت معاينة WYSIWYG</strong>
              <span>{phase.message}</span>
              <button
                type="button"
                className="pc-btn"
                style={{ marginTop: 12 }}
                onClick={() => {
                  onClose();
                  onFallback(); // المعاينة المتصلة الحالية — مسار التراجع الآمن
                }}
              >
                فتح المعاينة الحالية بدلًا منها
              </button>
            </div>
          )}

          {phase.kind === 'ready' && (
            <iframe
              title="معاينة WYSIWYG"
              src={phase.viewerUrl}
              style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
            />
          )}
        </div>

        <div className="pc-statusbar">
          <span className="pc-status-doc">{documentLabel}</span>
          <span className="pc-status-sep" aria-hidden="true">·</span>
          <span>الطباعة تتم عبر المسار الأصلي دون تغيير — هذه معاينة فقط</span>
        </div>
      </div>
    </div>
  );
}
