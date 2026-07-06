import { ReactNode, useEffect, useRef, useState } from 'react';
import { printCurrentView } from '../../utils/print';
import { useNavigate } from 'react-router-dom';
import { ProfileId, PRINT_PROFILES } from './printProfiles';
import { loadCopies, saveCopies } from './usePrintProfileMemory';
import FormHeader from './FormHeader';
import FormQRCode, { QRData } from './FormQRCode';
import ApprovalSection from './ApprovalSection';
import { PrintWorkspace } from '../../components/print-workspace';

interface FormLayoutProps {
  children: ReactNode;
  /** Set to true once data is ready — triggers auto-print after 600ms */
  ready: boolean;
  formNumber: string;
  title: string;
  profile: ProfileId;
  qrData: QRData;
  /** Form type key — used to persist copies preference per document type */
  formType?: string;
  /** Extra controls rendered in the no-print toolbar (e.g. LanguageToggle, PrintProfileToggle) */
  toolbarExtra?: ReactNode;
  /** Language for FormHeader, ApprovalSection, and copy count labels */
  lang?: 'ar' | 'en';
  /**
   * Opt-in (letterhead profile only): reclaim the generous 20mm bottom margin down
   * to 10mm so a single-page form that overflows the official-letterhead printable
   * band by only a few millimetres stays on one page. Top/header clearance is
   * unchanged. Off by default — only forms that actually overflow set this, so no
   * other form, multi-page template, or future layout is affected. Does not touch
   * the shared PRINT_PROFILES margins (the Employment Contract stays byte-identical).
   */
  letterheadCompactFooter?: boolean;
}

/** Shared −/count/+ copies stepper, reused in the workspace toolbar and sidebar. */
function CopiesControl({
  copies,
  onChange,
  lang,
}: {
  copies: number;
  onChange: (n: number) => void;
  lang: 'ar' | 'en';
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <button
        type="button"
        aria-label={lang === 'en' ? 'Fewer copies' : 'نسخة أقل'}
        onClick={() => onChange(copies - 1)}
        style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: copies > 1 ? 'pointer' : 'default', color: copies > 1 ? 'var(--text)' : 'var(--text-muted)', fontSize: 14, lineHeight: 1 }}
      >−</button>
      <span style={{ fontSize: 12, minWidth: 28, textAlign: 'center', padding: '0 2px', color: 'var(--text)' }} title={lang === 'en' ? 'Copies' : 'عدد النسخ'}>
        {lang === 'en'
          ? (copies === 1 ? '1 copy' : `${copies} copies`)
          : (copies === 1 ? '١ نسخة' : `${copies} نسخ`)}
      </span>
      <button
        type="button"
        aria-label={lang === 'en' ? 'More copies' : 'نسخة أكثر'}
        onClick={() => onChange(copies + 1)}
        style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: copies < 10 ? 'pointer' : 'default', color: copies < 10 ? 'var(--text)' : 'var(--text-muted)', fontSize: 14, lineHeight: 1 }}
      >+</button>
    </div>
  );
}

export default function FormLayout({
  children,
  ready,
  formNumber,
  title,
  profile,
  qrData,
  formType,
  toolbarExtra,
  lang = 'ar',
  letterheadCompactFooter = false,
}: FormLayoutProps) {
  const navigate = useNavigate();

  const [copies, setCopies] = useState(() =>
    formType ? loadCopies(formType) : 1,
  );
  const copiesRef = useRef(copies);
  copiesRef.current = copies;

  // Ref to the printable `.form-page` — its outerHTML is the ONLY content sent to
  // the PDF export, isolated from the surrounding PrintWorkspace shell.
  const formPageRef = useRef<HTMLDivElement>(null);

  const activeProfile = PRINT_PROFILES[profile];
  // Letterhead-only, opt-in bottom-margin trim: when a form sets
  // `letterheadCompactFooter`, reclaim the generous 20mm bottom margin to 10mm so it
  // stays on one page (top/header clearance untouched — see the prop's JSDoc). Feeds
  // BOTH the @page print rules and the Save-PDF export so print and PDF can't drift.
  const formMargins =
    profile === 'letterhead' && letterheadCompactFooter
      ? { ...activeProfile.margins, bottom: '10mm' }
      : activeProfile.margins;
  const { top: mt, right: mr, bottom: mb, left: ml } = formMargins;

  function updateCopies(n: number) {
    const clamped = Math.max(1, Math.min(10, n));
    setCopies(clamped);
    if (formType) saveCopies(formType, clamped);
  }

  function doPrint() {
    const count = copiesRef.current;
    if (count <= 1) {
      printCurrentView();
      return;
    }
    let i = 0;
    function next() {
      printCurrentView();
      i++;
      if (i < count) setTimeout(next, 1500);
    }
    next();
  }

  /**
   * "Save PDF" — exports ONLY the printable `.form-page` through the same
   * hidden-window `printToPDF` pipeline the Reports export uses
   * (`window.manar.exportPdfFromHtml` → `pdf:exportHtml`). The live PrintWorkspace
   * shell, dark theme, zoom transform and preview canvas never reach the PDF, so
   * the output matches the physical printout (and the Invoice Report PDF) with no
   * black frame. Physical printing (`doPrint`/`printCurrentView`) is untouched.
   *
   * Falls back to the native print dialog (which offers "Save as PDF") outside
   * Electron, if the bridge is unavailable, or if anything in the HTML build fails.
   */
  async function doExportPdf() {
    const name = formNumber || formType || 'document';
    const exportFromHtml = window.manar?.exportPdfFromHtml;
    const pageEl = formPageRef.current;

    if (!exportFromHtml || !pageEl) {
      printCurrentView();
      return;
    }

    try {
      // Clone the page and strip the screen-only controls that physical print
      // already hides, so the PDF mirrors the printout exactly. `.no-print` is the
      // same marker FormLayout's @media print rules key off (it wraps every
      // "print-fields only" override panel — headers, date inputs, selects and the
      // reset button); the data-attribute variants are defensive. Real document
      // content is never marked no-print, so only the override panels are removed.
      const clone = pageEl.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll('.no-print, [data-no-print], [data-print-hidden]')
        .forEach((el) => el.remove());

      const { buildFormPdfDocument } = await import('./formPdfDocument');
      const html = buildFormPdfDocument({
        formPageHtml: clone.outerHTML,
        title: title || name,
        lang,
        margins: formMargins,
      });
      await exportFromHtml(html, name);
    } catch {
      printCurrentView();
    }
  }

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => printCurrentView(), 600);
    return () => clearTimeout(t);
  }, [ready]);

  const paperLabel = lang === 'en' ? activeProfile.labelEn : activeProfile.labelAr;

  const toolbar = (
    <>
      <button type="button" className="btn" onClick={doPrint}>
        🖨️ {lang === 'en' ? 'Print' : 'طباعة'}
      </button>
      <button type="button" className="btn secondary" onClick={doExportPdf}>
        📄 {lang === 'en' ? 'Save PDF' : 'حفظ PDF'}
      </button>
      <span className="pw-toolbar-divider" />
      <div className="pw-tb-field">
        <span className="pw-tb-label">{lang === 'en' ? 'Copies' : 'عدد النسخ'}</span>
        <CopiesControl copies={copies} onChange={updateCopies} lang={lang} />
      </div>
      <div className="pw-toolbar-group">{toolbarExtra}</div>
      <span className="pw-toolbar-spacer" />
      <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
        {lang === 'en' ? '‹ Back' : 'رجوع ›'}
      </button>
    </>
  );

  const sidebar = (
    <>
      <div className="pw-sidebar-section">
        <span className="pw-sidebar-label">{lang === 'en' ? 'Copies' : 'عدد النسخ'}</span>
        <CopiesControl copies={copies} onChange={updateCopies} lang={lang} />
      </div>
      <div className="pw-sidebar-section">
        <span className="pw-sidebar-label">{lang === 'en' ? 'Paper' : 'الورق'}</span>
        <div className="pw-readonly-field">
          <span>{activeProfile.page.size}</span>
          <small>210 × 297 {lang === 'en' ? 'mm' : 'مم'}</small>
        </div>
      </div>
      <div className="pw-sidebar-section">
        <span className="pw-sidebar-label">{lang === 'en' ? 'Print profile' : 'قالب الطباعة'}</span>
        <div className="pw-readonly-field">
          <span>{paperLabel}</span>
        </div>
      </div>
      <div className="pw-sidebar-section">
        <span className="pw-sidebar-label">{lang === 'en' ? 'Document info' : 'معلومات المستند'}</span>
        <div className="pw-info-row">
          <span>{lang === 'en' ? 'Number' : 'رقم المستند'}</span>
          <span style={{ direction: 'ltr' }}>{formNumber}</span>
        </div>
        <div className="pw-info-row">
          <span>{lang === 'en' ? 'Language' : 'اللغة'}</span>
          <span>{lang === 'en' ? 'English' : 'عربي'}</span>
        </div>
      </div>
      <div className="pw-sidebar-section">
        <div className="pw-ready-box">
          <span className="pw-ready-icon" aria-hidden="true">✓</span>
          <div>
            <div className="pw-ready-title">{lang === 'en' ? 'Ready to print' : 'جاهز للطباعة'}</div>
            <div className="pw-ready-sub">
              {lang === 'en' ? 'All settings match the printout.' : 'جميع الإعدادات مطابقة للطباعة.'}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <PrintWorkspace
      lang={lang}
      toolbar={toolbar}
      sidebar={sidebar}
      documentName={title || formNumber}
      paperLabel={paperLabel}
      paperSize={activeProfile.page.size}
    >
      <style>{`
        @media screen {
          .form-page {
            border: 1px solid #e2e8f0;
            box-shadow: 0 2px 12px rgba(0,0,0,0.07);
          }
        }
        @media print {
          @page { size: A4; margin: ${mt} ${mr} ${mb} ${ml}; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          .form-page {
            width: 100% !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            overflow: visible !important;
            margin: 0 !important;
            max-width: none !important;
            border: none !important;
            box-shadow: none !important;
          }
          .form-page-footer {
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div
        ref={formPageRef}
        className="form-page"
        style={{
          padding: '18px 32px',
          fontFamily: '"Cairo", Arial, sans-serif',
          maxWidth: 793,
          margin: '0 auto',
          color: '#0f172a',
          background: '#fff',
          direction: lang === 'en' ? 'ltr' : 'rtl',
          borderRadius: 4,
        }}
      >
        {/* Company header — hidden in letterhead mode (space preserved) */}
        <FormHeader isLetterhead={profile === 'letterhead'} lang={lang} />

        {/* Form number + title */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, direction: 'ltr' }}>
            {formNumber}
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#1d4e6f',
              margin: '0 0 6px',
              letterSpacing: 1,
            }}
          >
            {title}
          </h1>
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
          <div style={{ flex: 1 }}>
            <ApprovalSection lang={lang} />
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <FormQRCode data={qrData} size={80} />
          </div>
        </div>
      </div>
    </PrintWorkspace>
  );
}
