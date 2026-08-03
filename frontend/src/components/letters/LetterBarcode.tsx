/**
 * Letter Engine — the barcode renderer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  REUSES THE ERP'S EXISTING CODE ENGINE. NO SECOND LIBRARY.
 * ══════════════════════════════════════════════════════════════════════════
 * The `qrcode` package already shipped in this application, already used by
 * `forms/shared/FormQRCode.tsx` and `print-templates/components/DocumentVerificationQR`,
 * with the same accent colour and the same Arabic line-based payload convention. This
 * component adds no dependency and introduces no second encoder.
 *
 * (The other thing in the repo called a barcode — `TemplateStudioRenderer`'s
 * `BarcodePlaceholder` — is a decorative strip of bars on a fixed `i % 3` pattern. It
 * encodes nothing and is not a code engine; reusing it here would put a symbol on an
 * official letter that no scanner can read.)
 *
 * ── WHY NOT A LINEAR BARCODE ─────────────────────────────────────────────
 * The payload must carry the SUBJECT, and subjects here are Arabic. Code 128 and Code
 * 39 encode ASCII only — an Arabic subject cannot be represented in them at all. A
 * linear symbology would therefore have forced either dropping the subject or
 * transliterating it into something no Arabic reader can check. The existing engine
 * carries UTF-8 natively, which is why P0's spec was written against it.
 *
 * ── THE PAYLOAD IS GIVEN, NEVER COMPUTED HERE ────────────────────────────
 * This component receives a finished string. It does not know the three fields, cannot
 * add a fourth, and cannot reach the document. For a registered letter the payload
 * comes from the frozen registration snapshot, so a reprint reproduces the code that
 * was printed rather than one built from today's data.
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import './letter-barcode.css';

export interface LetterBarcodeProps {
  /** The finished payload. Built by `letters/barcode/payloadBuilder`. */
  payload: string;
  /** Printed beneath the symbol, after the label. */
  reference: string;
  /** Edge length in millimetres — from the Geometry Registry, never from CSS. */
  sizeMm: number;
  /** Rendered without the caption when the reference is not yet issued. */
  showCaption?: boolean;
}

/**
 * Accent used by every code symbol in this application.
 *
 * Matched to `FormQRCode` deliberately: a letter's symbol that rendered pure black
 * beside a voucher's brand-blue one would read as two different systems.
 */
const SYMBOL_DARK = '#1d4e6f';

export default function LetterBarcode({
  payload,
  reference,
  sizeMm,
  showCaption = true,
}: LetterBarcodeProps) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!payload) {
      setSrc('');
      setFailed(false);
      return;
    }

    QRCode.toDataURL(payload, {
      // Rendered at a generous pixel density and then scaled DOWN to its millimetre
      // box, so the printed symbol is limited by the printer rather than by the raster.
      width: 512,
      margin: 1,
      color: { dark: SYMBOL_DARK, light: '#ffffff' },
    })
      .then((url) => {
        if (cancelled) return;
        setSrc(url);
        setFailed(false);
      })
      .catch(() => {
        // Reported, never swallowed: a letter that printed with a silently missing
        // barcode would look complete and be unverifiable. The validation engine
        // surfaces this through the empty `src`.
        if (cancelled) return;
        setSrc('');
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div className="lb-root" style={{ width: `${sizeMm}mm` }}>
      <div className="lb-symbol" style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }}>
        {src ? (
          <img src={src} alt={`رمز الخطاب ${reference}`} className="lb-image" />
        ) : (
          <span className="lb-fallback" role="img" aria-label={failed ? 'تعذّر توليد الرمز' : 'الرمز غير متاح'}>
            {failed ? 'تعذّر توليد الرمز' : ''}
          </span>
        )}
      </div>

      {showCaption && (
        <div className="lb-caption" dir="rtl">
          <span className="lb-caption-label">رقم المرجع</span>
          <span className="lb-caption-value" dir="ltr">{reference}</span>
        </div>
      )}
    </div>
  );
}
