import { CSSProperties } from 'react';
import type { BrandingLayout } from '../../print-templates/engine/types';
import { DEFAULT_ELEMENT_LAYOUT } from '../../print-templates/utils/brandingLayout';
import type { BrandingDesignerHandle } from '../../print-templates/hooks/useBrandingDesigner';
import DesignableBrandingImage from '../../print-templates/designer/DesignableBrandingImage';

const IDENTITY_LAYOUT: BrandingLayout = {
  signature: { ...DEFAULT_ELEMENT_LAYOUT },
  stamp: { ...DEFAULT_ELEMENT_LAYOUT },
};

/**
 * The company's approval slot — the ONE place every administrative form carries the
 * company's own signature and official stamp. Everything else a form prints
 * ("توقيع الموظف", "المُستلِم", the contract's two-party lines) belongs to a
 * counterparty and is signed by hand; this block is the company's.
 *
 * `signatureUrl` / `stampUrl` come from the central Multi-Signature & Stamp system
 * (`useBrandingSelection`) — this component never reads settings, never picks an asset
 * and holds no image of its own. With neither url it renders exactly what it always
 * did: a blank ruling for the signature and the "الختم الرسمي" label.
 *
 * Geometry is deliberately unchanged. The signature image is drawn OUT OF FLOW, sitting
 * on the existing ruling, so no form's height or pagination shifts. The stamp replaces
 * the label at the label's own anchor — out of flow too in `stampInline` mode (the mode
 * every certificate-style form uses), in flow in the stacked mode.
 */
interface Props {
  lang?: 'ar' | 'en';
  title?: string;
  /** Opt-in: omit the date row under the signature. Off by default — every existing caller keeps the date. */
  hideDate?: boolean;
  /** Opt-in: render the stamp label on the same row as the signature instead of below it. Off by default. */
  stampInline?: boolean;
  /** Selected company signature image. Absent ⇒ the blank ruling alone, as before. */
  signatureUrl?: string;
  /** Selected company stamp image. Absent ⇒ the "الختم الرسمي" label, as before. */
  stampUrl?: string;
  /**
   * This form's saved position/size for each image. Omitted ⇒ the identity layout, i.e.
   * the images sit exactly where this component places them. **Independent of which
   * image is selected**: the layout is keyed by form, the image by the asset picker, so
   * swapping signatures never disturbs a saved position.
   */
  layout?: BrandingLayout;
  /** Present and active ⇒ the images become draggable/resizable in place. */
  designer?: BrandingDesignerHandle;
}

const line: CSSProperties = {
  borderBottom: '1px solid #64748b',
  display: 'inline-block',
  width: 200,
  marginBottom: 2,
};

const LABELS = {
  ar: {
    defaultTitle: 'اعتماد المدير المباشر',
    signature:    'التوقيع:',
    date:         'التاريخ:',
    stamp:        'الختم الرسمي',
  },
  en: {
    defaultTitle: 'Direct Manager Approval',
    signature:    'Signature:',
    date:         'Date:',
    stamp:        'Official Stamp',
  },
} as const;

export default function ApprovalSection({
  lang = 'ar',
  title,
  hideDate = false,
  stampInline = false,
  signatureUrl,
  stampUrl,
  layout,
  designer,
}: Props) {
  const L = LABELS[lang];
  const dir = lang === 'en' ? 'ltr' : 'rtl';
  const effectiveLayout = layout ?? IDENTITY_LAYOUT;

  const signature = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ minWidth: 80, fontWeight: 600 }}>{L.signature}</span>
      {/* The ruling keeps its exact box (200 × border-bottom). The signature is drawn
          on top of it, out of flow, so the row's height — and every form's pagination
          — is byte-identical to the blank case. */}
      <span style={{ ...line, position: 'relative' }}>
        {signatureUrl && (
          <DesignableBrandingImage
            src={signatureUrl}
            kind="signature"
            layout={effectiveLayout.signature}
            designer={designer}
            transformPrefix="translateX(-50%)"
            baseStyle={{
              position: 'absolute',
              bottom: 2,
              left: '50%',
              maxHeight: 30,
              maxWidth: 180,
              objectFit: 'contain',
            }}
          />
        )}
      </span>
    </div>
  );

  // Toward the barcode/QR side of the footer row: ApprovalSection is always the first
  // flex child (QR is second), so the QR sits at the row's logical "end" — physically
  // left under RTL (ar), physically right under LTR (en). Shifting the centered anchor
  // ~2cm toward that end keeps the label correctly biased toward the QR in both langs.
  const stamp = (
    <div
      style={{
        marginTop: stampInline ? 0 : 8,
        fontSize: 13,
        fontWeight: 600,
        color: '#374151',
        ...(stampInline
          ? {
              position: 'absolute',
              left: `calc(50% ${dir === 'rtl' ? '-' : '+'} 2cm)`,
              transform: 'translateX(-50%)',
            }
          // `relative` with no offsets paints identically — it only makes this box the
          // containing block for the design-mode resize handle.
          : { position: 'relative' }),
      }}
    >
      {stampUrl ? (
        /* The image IS the stamp — the label would be redundant beside it. Same anchor
           as the label it replaces, so the stamp lands where the label sat. */
        <DesignableBrandingImage
          src={stampUrl}
          kind="stamp"
          layout={effectiveLayout.stamp}
          designer={designer}
          baseStyle={{
            display: 'block',
            maxHeight: stampInline ? '18mm' : '12mm',
            maxWidth: stampInline ? '30mm' : '26mm',
            objectFit: 'contain',
          }}
        />
      ) : (
        L.stamp
      )}
    </div>
  );

  return (
    <div
      style={{
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        direction: dir,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4e6f', marginBottom: 16 }}>
        {title ?? L.defaultTitle}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: '#374151' }}>
        {stampInline ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, position: 'relative' }}>
            {signature}
            {stamp}
          </div>
        ) : (
          signature
        )}
        {!hideDate && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ minWidth: 80, fontWeight: 600 }}>{L.date}</span>
            <span>____ / ____ / ______</span>
          </div>
        )}
        {!stampInline && stamp}
      </div>
    </div>
  );
}
