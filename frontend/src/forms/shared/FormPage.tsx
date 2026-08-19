/**
 * ورقة النموذج المطبوعة (`.form-page`) — **العقدة الوحيدة** التي يطبعها النظام.
 *
 * ═══ لماذا وُجد هذا الملف ═══
 * كان هذا الهيكل مكتوبًا داخل `FormLayout` مباشرةً، فبقي حبيس مسار «مستند واحد لكل
 * صفحة». والطباعة الجماعية تحتاج **نفس** الورقة مكرَّرة N مرة داخل مستند واحد — ولو
 * أُعيدت كتابتها هناك لصار في النظام هيكلان لورقة واحدة، ولانحرف المستند المطبوع
 * جماعيًا عن نظيره المطبوع منفردًا عند أول تعديل على أيٍّ منهما.
 *
 * استُخرج الهيكل هنا **حرفيًا**: نفس العناصر، نفس ترتيبها، نفس أنماطها السطرية، نفس
 * الأصناف. `FormLayout` صار يُصيّره بنفس القيم التي كان يمرّرها لنفسه، فالمخرَج
 * المطبوع لكل نموذج قائم لم يتغيّر بأي شيء.
 *
 * ═══ ما لا يملكه هذا المكوّن ═══
 * لا يعرف الطباعة، ولا `@page`، ولا الهوامش، ولا ملفات التعريف، ولا أزرارًا، ولا
 * شريط أدوات. يستقبل ترويسته وكتلة الاعتماد **جاهزتين** (`header` و`footerStart`)
 * لأن قرار «أي ترويسة» و«هل تظهر كتلة الاعتماد» يخصّ المستدعي لا الورقة.
 */
import type { CSSProperties, ReactNode, Ref } from 'react';
import FormQRCode, { QRData } from './FormQRCode';

export interface FormPageProps {
  /** مرجع العقدة المطبوعة — هو ما تستنسخه المعاينة الدقيقة و«حفظ PDF» والطباعة. */
  pageRef?: Ref<HTMLDivElement>;
  lang: 'ar' | 'en';
  /** الحشو السطري للورقة على الشاشة (وسيط الطباعة يتولّاه CSS المستدعي). */
  padding: string;
  docFontStack: string;
  /** فاصل حقيقي أعلى المحتوى — داخل العقدة نفسها، فيسري على المعاينة والطباعة معًا. */
  contentTopOffset?: string;
  /** ترويسة الشركة المُهيّأة (`FormHeader`) — أو `null` لورقة بلا ترويسة. */
  header?: ReactNode;
  formNumber: string;
  hideFormNumber?: boolean;
  title: string;
  titleFontSize: number;
  hideTitleRule?: boolean;
  children: ReactNode;
  /** كتلة الاعتماد في التذييل (`ApprovalSection`) — أو `null` لإخفائها. */
  footerStart?: ReactNode;
  qrData: QRData;
  /** أنماط سطرية إضافية على الورقة — للحالات التي تُمثّل فيها الورقة الصفحة كاملة. */
  pageStyle?: CSSProperties;
}

export default function FormPage({
  pageRef,
  lang,
  padding,
  docFontStack,
  contentTopOffset,
  header,
  formNumber,
  hideFormNumber,
  title,
  titleFontSize,
  hideTitleRule,
  children,
  footerStart,
  qrData,
  pageStyle,
}: FormPageProps) {
  return (
    <div
      ref={pageRef}
      className="form-page"
      style={{
        // Containing block for FormHeader's ready-paper-only overlay
        // positioning (`FormHeader`'s `overlay` prop) — a no-op for every other
        // profile/form, since nothing else in `.form-page` is absolutely
        // positioned against it.
        position: 'relative',
        // Page-level model (ready-paper): on screen `.form-page` must model the
        // whole A4 SHEET, exactly as it does at print — the profile margins are
        // its padding, so the preview shows the letterhead band and the content
        // start at the same places the printout will. Every other profile keeps
        // the original screen padding untouched.
        padding,
        boxSizing: 'border-box',
        fontFamily: docFontStack,
        maxWidth: 793,
        margin: '0 auto',
        color: '#0f172a',
        background: '#fff',
        direction: lang === 'en' ? 'ltr' : 'rtl',
        borderRadius: 4,
        ...pageStyle,
      }}
    >
      {contentTopOffset && <div aria-hidden="true" style={{ height: contentTopOffset }} />}

      {header}

      {/* Form number + title */}
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, direction: 'ltr' }}>
          {/* The text node stays present (just invisible) so the line box's height —
              and therefore the title's vertical position — never changes based on
              hideFormNumber; an empty div here would collapse to 0 height instead. */}
          <span style={hideFormNumber ? { visibility: 'hidden' } : undefined}>{formNumber}</span>
        </div>
        <h1
          style={{
            fontSize: titleFontSize,
            fontWeight: 800,
            color: '#1d4e6f',
            margin: '0 0 6px',
            letterSpacing: 1,
          }}
        >
          {title}
        </h1>
        {!hideTitleRule && (
          <div
            style={{
              width: 60,
              height: 3,
              background: '#1d4e6f',
              margin: '0 auto',
              borderRadius: 2,
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
          />
        )}
      </div>

      {/* Form-specific content */}
      {children}

      {/* Bottom row: Approval (right/start in RTL) | QR (left/end in RTL) */}
      <div
        className="form-page-footer"
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 20,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        <div style={{ flex: 1 }}>{footerStart}</div>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <FormQRCode data={qrData} size={80} />
        </div>
      </div>
    </div>
  );
}
