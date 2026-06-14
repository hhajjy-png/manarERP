import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PrintMode } from './printMode';
import FormHeader from './FormHeader';
import FormFooter from './FormFooter';
import FormQRCode, { QRData } from './FormQRCode';

interface FormLayoutProps {
  children: ReactNode;
  /** Set to true once data is ready — triggers auto-print after 600ms */
  ready: boolean;
  formNumber: string;
  title: string;
  printMode: PrintMode;
  qrData: QRData;
}

export default function FormLayout({
  children,
  ready,
  formNumber,
  title,
  printMode,
  qrData,
}: FormLayoutProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [ready]);

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
            padding: 10mm 12mm !important;
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
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
            {printMode === 'letterhead' ? 'وضع الورق الرسمي' : 'وضع القالب الكامل'} —{' '}
            {formNumber}
          </span>
        </div>

        {/* Company header — hidden in letterhead mode (space preserved) */}
        <FormHeader printMode={printMode} />

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

        {/* QR code — always visible in both modes */}
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <FormQRCode data={qrData} size={80} />
        </div>

        {/* Company footer — hidden in letterhead mode (space preserved) */}
        <FormFooter printMode={printMode} />
      </div>
    </>
  );
}
