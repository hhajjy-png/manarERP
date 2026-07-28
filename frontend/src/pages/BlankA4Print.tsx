import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { printCurrentView, printCurrentViewWithResult, type PrintResult } from '../utils/print';
import {
  createPrintJob,
  isFlagEnabled,
  submitPrintJob,
  useAccurateFormPreview,
  PRINT_CENTER_FOUNDATION_V1,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
} from '../printing';
import { PrintWorkspace } from '../components/print-workspace';
import LanguageToggle from '../forms/shared/LanguageToggle';
import A4Ruler, { A4_RULER_THICKNESS } from '../forms/shared/A4Ruler';
import { useCompanyBranding } from '../print-templates/hooks/useCompanyBranding';
import { useBrandingSelection } from '../print-templates/hooks/useBrandingSelection';
import BrandingAssetPicker from '../print-templates/components/BrandingAssetPicker';
import { useBrandingDesigner } from '../print-templates/hooks/useBrandingDesigner';
import BrandingDesignerPanel from '../print-templates/components/BrandingDesignerPanel';
import DesignableBrandingImage from '../print-templates/designer/DesignableBrandingImage';
import { getBrandingLayoutForDocument } from '../print-templates/utils/brandingLayout';
import type { BrandingDocKey, PrintBrandingLayoutSettings } from '../print-templates/engine/types';

const FORM_KEY: BrandingDocKey = 'blank-a4-print';

/**
 * THE ONE PAGE GEOMETRY, shared verbatim by all four paths.
 *
 * The sheet element IS the physical A4 sheet — 210 × 297 mm with ZERO padding — and
 * `@page { size: A4; margin: 0 }`. That single decision is what makes the four paths
 * agree, and it is why there is exactly one printed page:
 *
 *   · @page margin 0  ⇒ the page box is the full 210 × 297 mm, so a 297 mm-tall
 *     element fits it exactly. With any non-zero @page margin the printable band is
 *     shorter than the sheet and a 297 mm element necessarily spills onto a 2nd page.
 *   · padding 0       ⇒ the coordinate origin is the sheet's true top-left corner,
 *     which is exactly what the rulers measure from. A padded box would put the
 *     origin 10 mm inside the paper and every ruler reading would be off by 10 mm.
 *
 * Element anchors are therefore expressed in MILLIMETRES from that corner, and Design
 * Mode's own offsets are CSS px — which are defined as 1/96 in, i.e. a fixed physical
 * length — so an (x, y, scale) triple means the same physical placement on screen, in
 * the accurate preview, in the PDF and on paper.
 */
const SHEET_W_MM = 210;
const SHEET_H_MM = 297;

/**
 * Centre of each element at the identity layout (x=0, y=0, scale=1) — i.e. where Reset
 * puts it — in mm from the sheet corner.
 *
 * These two anchors are what `BLANK_A4_LAYOUT_BOUNDS` is DERIVED from: the travel range
 * is exactly what each centre needs to reach any point of the 210 × 297 mm sheet. If an
 * anchor moves, that derivation (and the assertion pinning it) must move with it.
 */
const SIGNATURE_ANCHOR_MM = { x: 68, y: 210 };
const STAMP_ANCHOR_MM = { x: 142, y: 210 };

/**
 * A genuinely blank A4 sheet — no header, no title, no form number, no QR, no
 * approval block. The only printable content is a company signature and/or stamp,
 * chosen from the SAME central Multi-Signature & Stamp system every other
 * administrative form uses, positioned with the SAME Design Mode (drag, resize
 * handle, sliders, undo/redo, save/reset) under the SAME shared envelope
 * (`BRANDING_LAYOUT_BOUNDS`). Intended use: print over an external, already
 * pre-printed sheet loaded in the printer, so only the signature/stamp ink lands
 * on the physical page.
 *
 * Deliberately does NOT go through `FormLayout`/`ApprovalSection`: both always
 * render a title, a form-number line, a QR code and an approval label, none of
 * which belong on a blank sheet, and neither exposes an opt-out. This page instead
 * composes the same lower-level building blocks `FormLayout` itself uses.
 */
export default function BlankA4Print() {
  const { t } = useT();
  const navigate = useNavigate();
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const title = t('page.blankA4.title');

  const branding = useCompanyBranding();
  const selection = useBrandingSelection(branding);

  const [savedLayout, setSavedLayout] = useState<PrintBrandingLayoutSettings | undefined>(undefined);
  const designer = useBrandingDesigner({
    docType: FORM_KEY,
    initialLayout: savedLayout ?? branding.brandingLayout,
    onSaved: setSavedLayout,
  });
  const effectiveLayout = getBrandingLayoutForDocument(
    designer.isActive ? designer.localLayout : (savedLayout ?? branding.brandingLayout),
    FORM_KEY,
  );
  const canDesign =
    selection.ready &&
    ((selection.showSignature && !!selection.signatureUrl) || (selection.showStamp && !!selection.stampUrl));

  const formPageRef = useRef<HTMLDivElement>(null);

  async function doPrint(): Promise<PrintResult> {
    if (!isFlagEnabled(PRINT_CENTER_FOUNDATION_V1)) {
      return printCurrentViewWithResult();
    }
    const result = await submitPrintJob(
      createPrintJob({
        docType: 'form',
        documentId: FORM_KEY,
        destination: 'printer',
        copies: 1,
        title,
        documentLabel: title,
        renderSource: 'dom-node',
      }),
    );
    return {
      outcome:
        result.status === 'printed' || result.status === 'exported'
          ? 'success'
          : result.status === 'canceled' ? 'cancelled' : 'error',
      failureReason: result.error,
    };
  }

  /**
   * PDF export — نفس مُركِّب المعاينة الدقيقة أدناه حرفيًا (`composeStyledFromNode`
   * على نفس `formPageRef.current`، نفس `pageSpecId` الافتراضي، نفس `stripSelectors`).
   *
   * الهندسة الفيزيائية (210×297مم، `@page margin:0`، `padding:0`) مصدرها **نفس**
   * `<style>` الذي يحقنه هذا الملف أدناه (`.form-page.blank-a4-sheet` داخل
   * `@media print`، مع `@page` متداخلة تُستخرَج وتفوز عبر `mergePageRules` —
   * تمامًا كآلية FormLayout المُثبَتة لبقية النماذج). التخصيص الأعلى (فئتان
   * `.form-page.blank-a4-sheet`) يتغلّب دائمًا على تحييد `composeStyledFromNode`
   * العام (`[data-print-root]`، تخصيص واحد) للخاصيتين المتعارضتين الوحيدتين
   * (width/height) — لا تصادم، ولا حاجة لأي CSS خاص بالتصدير بعد الآن.
   *
   * المساطر الأربع **لا تدخل أبدًا**: هي أشقّاء لعقدة `.form-page.blank-a4-sheet`
   * (خارج `formPageRef` كليًا)، لا أبناء لها — فالاستنساخ (`cloneNode` داخل
   * `composeStyledFromNode`) لا يراها إطلاقًا، بصرف النظر عن `stripSelectors`.
   *
   * فشل التركيب: نفس شبكة الأمان القائمة في كل مكان — `printCurrentView()`، لا
   * تراجع صامت إلى مسار PDF مختلف.
   */
  async function doExportPdf() {
    const exportFromHtml = window.manar?.exportPdfFromHtml;
    const pageEl = formPageRef.current;
    if (!exportFromHtml || !pageEl) {
      printCurrentView();
      return;
    }
    try {
      const { composeStyledFromNode, getPageSpec } = await import('../printing');
      const html = composeStyledFromNode({
        node: pageEl,
        pageSpec: getPageSpec('a4-portrait'),
        title,
        lang,
        stripSelectors: ['.no-print'],
      });
      await exportFromHtml(html, FORM_KEY);
    } catch {
      printCurrentView();
    }
  }

  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => formPageRef.current,
    onPrint: () => { void doPrint(); },
    title,
    documentLabel: title,
    lang,
  });

  const toolbar = (
    <>
      <button type="button" className="btn" onClick={() => { void doPrint(); }}>
        🖨️ {lang === 'en' ? 'Print' : 'طباعة'}
      </button>
      <button type="button" className="btn secondary" onClick={doExportPdf}>
        📄 {lang === 'en' ? 'Save PDF' : 'حفظ PDF'}
      </button>
      <span className="pw-toolbar-divider" />
      <LanguageToggle lang={lang} onChange={setLang} />
      {accurate.button}
      {selection.ready && (
        <div className="pw-toolbar-group">
          <BrandingAssetPicker selection={selection} />
          {canDesign && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontWeight: 600 }}
              onClick={() => (designer.isActive ? designer.deactivate() : designer.activate())}
            >
              {designer.isActive
                ? (lang === 'en' ? '✓ Finish design' : '✓ إنهاء التصميم')
                : (lang === 'en' ? '🔧 Design mode' : '🔧 وضع التصميم')}
            </button>
          )}
        </div>
      )}
      <span className="pw-toolbar-spacer" />
      <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
        {lang === 'en' ? '‹ Back' : 'رجوع ›'}
      </button>
    </>
  );

  const sidebar = (
    <>
      <div className="pw-sidebar-section">
        <span className="pw-sidebar-label">{lang === 'en' ? 'Paper' : 'الورق'}</span>
        <div className="pw-readonly-field">
          <span>A4</span>
          <small>{SHEET_W_MM} × {SHEET_H_MM} {lang === 'en' ? 'mm' : 'مم'}</small>
        </div>
      </div>
      <div className="pw-sidebar-section">
        <span className="pw-sidebar-label">{lang === 'en' ? 'Content' : 'المحتوى'}</span>
        <div className="pw-readonly-field">
          <span>{lang === 'en' ? 'Signature & stamp only' : 'التوقيع والختم فقط'}</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {accurate.dialog}
      <PrintWorkspace
        lang={lang}
        toolbar={toolbar}
        sidebar={sidebar}
        documentName={title}
        paperLabel={lang === 'en' ? 'Blank A4' : 'A4 فارغة'}
        paperSize="A4"
      >
        <style>{`
          @media screen {
            /* The stage exists ONLY to hang the rulers off the sheet's edges. It is the
               sheet's own box, so a ruler anchored at its corner is flush with the paper. */
            .blank-a4-stage {
              position: relative;
              width: ${SHEET_W_MM}mm;
              /* Reserves room for a ruler on all four sides. It is a MARGIN, never
                 padding or a border, so the sheet's own box is untouched. */
              margin: ${A4_RULER_THICKNESS + 6}px;
            }
            /* Each ruler is anchored just outside its edge and takes the sheet's own
               origin, so all four share one coordinate system with the branding layer. */
            .blank-a4-ruler-top    { position: absolute; bottom: 100%; left: 0; }
            .blank-a4-ruler-bottom { position: absolute; top: 100%;    left: 0; }
            .blank-a4-ruler-left   { position: absolute; right: 100%;  top: 0; }
            .blank-a4-ruler-right  { position: absolute; left: 100%;   top: 0; }
            .form-page.blank-a4-sheet { border: 1px solid #e2e8f0; }
          }
          @media print {
            /* Zero page margin: the page box IS the sheet, so a 297mm element fits it
               exactly and cannot spill onto a second page. */
            @page { size: A4; margin: 0; }
            html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
            .no-print { display: none !important; }
            /* The stage generates no box at print, so its screen-only ruler margins
               cannot add height and push the sheet past the page box. */
            .blank-a4-stage { display: contents !important; }
            /* The sheet's geometry is ASSERTED, never relaxed. A collapsing rule here
               (e.g. height:auto) would zero the box — its children are all absolutely
               positioned and contribute no flow height — and every percentage/absolute
               anchor inside would resolve against nothing. */
            .form-page.blank-a4-sheet {
              position: relative !important;
              width: ${SHEET_W_MM}mm !important;
              height: ${SHEET_H_MM}mm !important;
              min-height: 0 !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 !important;
              border: none !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              overflow: hidden !important;
              box-sizing: border-box !important;
            }
          }
        `}</style>

        <div className="blank-a4-stage">
          {/* Rulers on all four edges. They are SIBLINGS of the sheet, absolutely
              positioned outside it, so they add no height/width to it and cannot
              affect pagination — and the export paths, which clone the sheet alone,
              never see them at all. */}
          <div className="no-print blank-a4-ruler-top">
            <A4Ruler edge="top" lengthMm={SHEET_W_MM} />
          </div>
          <div className="no-print blank-a4-ruler-bottom">
            <A4Ruler edge="bottom" lengthMm={SHEET_W_MM} />
          </div>
          <div className="no-print blank-a4-ruler-left">
            <A4Ruler edge="left" lengthMm={SHEET_H_MM} />
          </div>
          <div className="no-print blank-a4-ruler-right">
            <A4Ruler edge="right" lengthMm={SHEET_H_MM} />
          </div>

          {/* The physical A4 sheet — the ONLY node handed to print / PDF / accurate
              preview. Its geometry is inline so it survives cloning into the export
              documents, and re-asserted in the print CSS above for the two paths that
              render the LIVE stylesheet (physical print, accurate preview). */}
          <div
            ref={formPageRef}
            className="form-page blank-a4-sheet"
            style={{
              position: 'relative',
              width: `${SHEET_W_MM}mm`,
              height: `${SHEET_H_MM}mm`,
              boxSizing: 'border-box',
              padding: 0,
              margin: 0,
              overflow: 'hidden',
              background: '#fff',
              direction: lang === 'en' ? 'ltr' : 'rtl',
            }}
          >
            {selection.showSignature && selection.signatureUrl && (
              <DesignableBrandingImage
                src={selection.signatureUrl}
                kind="signature"
                layout={effectiveLayout.signature}
                designer={designer}
                transformPrefix="translate(-50%, -50%)"
                baseStyle={{
                  position: 'absolute',
                  left: `${SIGNATURE_ANCHOR_MM.x}mm`,
                  top: `${SIGNATURE_ANCHOR_MM.y}mm`,
                  maxWidth: '65mm',
                  maxHeight: '28mm',
                  objectFit: 'contain',
                }}
              />
            )}
            {selection.showStamp && selection.stampUrl && (
              <DesignableBrandingImage
                src={selection.stampUrl}
                kind="stamp"
                layout={effectiveLayout.stamp}
                designer={designer}
                transformPrefix="translate(-50%, -50%)"
                baseStyle={{
                  position: 'absolute',
                  left: `${STAMP_ANCHOR_MM.x}mm`,
                  top: `${STAMP_ANCHOR_MM.y}mm`,
                  maxWidth: '40mm',
                  maxHeight: '40mm',
                  objectFit: 'contain',
                }}
              />
            )}
          </div>
        </div>
      </PrintWorkspace>

      {designer.isActive && (
        <BrandingDesignerPanel designer={designer} docLabel={title} onClose={designer.deactivate} />
      )}
    </>
  );
}
