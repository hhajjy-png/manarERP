import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfileId, PRINT_PROFILES, getPrintProfileStyle } from './printProfiles';
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
  /** Extra controls rendered in the no-print toolbar (e.g. LanguageToggle, PrintProfileToggle) */
  toolbarExtra?: ReactNode;
}

export default function FormLayout({
  children,
  ready,
  formNumber,
  title,
  profile,
  qrData,
  toolbarExtra,
}: FormLayoutProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [ready]);

  const activeProfile = PRINT_PROFILES[profile];
  const padding = getPrintProfileStyle(activeProfile);

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          .form-page {
            width: 210mm !important;
            height: 297mm !important;
            padding: ${padding} !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            margin: 0 !important;
            max-width: none !important;
          }
        }
      `}</style>

      <div
        className="form-page"
        style={{
          padding: '18px 32px',
          fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
          maxWidth: 820,
          margin: '0 auto',
          color: '#0f172a',
          background: '#fff',
          direction: 'rtl',
        }}
      >
        {/* No-print toolbar */}
        <div
          className="no-print"
          style={{ display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center' }}
        >
          <button className="btn" onClick={() => window.print()}>
            🖨️ طباعة / حفظ PDF
          </button>
          <button className="btn secondary" onClick={() => navigate(-1)}>
            رجوع
          </button>
          {toolbarExtra}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
            {PRINT_PROFILES[profile].labelAr} — {formNumber}
          </span>
        </div>

        {/* Company header — hidden in letterhead mode (space preserved) */}
        <FormHeader isLetterhead={profile === 'letterhead'} />

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
            <ApprovalSection />
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <FormQRCode data={qrData} size={80} />
          </div>
        </div>
      </div>
    </>
  );
}
