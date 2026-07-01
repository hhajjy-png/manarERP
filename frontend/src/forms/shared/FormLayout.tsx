import { ReactNode, useEffect, useRef, useState } from 'react';
import { printCurrentView } from '../../utils/print';
import { useNavigate } from 'react-router-dom';
import { ProfileId, PRINT_PROFILES } from './printProfiles';
import { loadCopies, saveCopies } from './usePrintProfileMemory';
import FormHeader from './FormHeader';
import FormQRCode, { QRData } from './FormQRCode';
import ApprovalSection from './ApprovalSection';

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
}: FormLayoutProps) {
  const navigate = useNavigate();

  const [copies, setCopies] = useState(() =>
    formType ? loadCopies(formType) : 1,
  );
  const copiesRef = useRef(copies);
  copiesRef.current = copies;

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

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => printCurrentView(), 600);
    return () => clearTimeout(t);
  }, [ready]);

  const activeProfile = PRINT_PROFILES[profile];
  const { top: mt, right: mr, bottom: mb, left: ml } = activeProfile.margins;

  return (
    <>
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
        {/* No-print toolbar */}
        <div
          className="no-print"
          style={{ display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <button type="button" className="btn" onClick={doPrint}>
            🖨️ {lang === 'en' ? 'Print / Save PDF' : 'طباعة / حفظ PDF'}
          </button>
          {/* Copies control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <button
              type="button"
              aria-label={lang === 'en' ? 'Fewer copies' : 'نسخة أقل'}
              onClick={() => updateCopies(copies - 1)}
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
              onClick={() => updateCopies(copies + 1)}
              style={{ padding: '4px 8px', border: 'none', background: 'transparent', cursor: copies < 10 ? 'pointer' : 'default', color: copies < 10 ? 'var(--text)' : 'var(--text-muted)', fontSize: 14, lineHeight: 1 }}
            >+</button>
          </div>
          <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
            {lang === 'en' ? 'Back' : 'رجوع'}
          </button>
          {toolbarExtra}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
            {PRINT_PROFILES[profile].labelAr} — {formNumber}
          </span>
        </div>

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
    </>
  );
}
