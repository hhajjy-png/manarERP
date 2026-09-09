import { ReactNode, useEffect, useRef, useState } from 'react';
import { printCurrentView, printCurrentViewWithResult, type PrintResult } from '../../utils/print';
import {
  createPrintJob,
  isFlagEnabled,
  submitPrintJob,
  waitForPrintReady,
  PRINT_CENTER_FOUNDATION_V1,
} from '../../printing';
import { useNavigate } from 'react-router-dom';
import { useFormOpenIntent, useFormPreviewInitialZoom } from './formOpenIntent';
import { ProfileId, PRINT_PROFILES } from './printProfiles';
import { loadCopies, saveCopies } from './usePrintProfileMemory';
import { SECTION_HEADER_BG } from './formStyles';
import FormHeader from './FormHeader';
import type { QRData } from './FormQRCode';
import FormPage from './FormPage';
import ApprovalSection from './ApprovalSection';
import { useCompanyBranding } from '../../print-templates/hooks/useCompanyBranding';
import { useBrandingSelection } from '../../print-templates/hooks/useBrandingSelection';
import BrandingAssetPicker from '../../print-templates/components/BrandingAssetPicker';
import { useBrandingDesigner } from '../../print-templates/hooks/useBrandingDesigner';
import BrandingDesignerPanel from '../../print-templates/components/BrandingDesignerPanel';
import { getBrandingLayoutForDocument, isFormBrandingDocKey } from '../../print-templates/utils/brandingLayout';
import type { BrandingDocKey, PrintBrandingLayoutSettings } from '../../print-templates/engine/types';
import { PrintWorkspace } from '../../components/print-workspace';
import officialLogoHead from '../../assets/logohead.png';
import { DOC_FONT_STACK } from '../../styles/fontRegistry';
import type { ApprovalSecondaryLabels } from './ApprovalSection';

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
  /**
   * Opt-in: omit the date row under the ApprovalSection signature. Off by default —
   * every existing form keeps the date. Passed straight through to `ApprovalSection`.
   */
  approvalHideDate?: boolean;
  /**
   * Opt-in: render the ApprovalSection stamp label on the same row as the signature
   * instead of below it. Off by default. Passed straight through to `ApprovalSection`.
   */
  approvalStampInline?: boolean;
  /**
   * Opt-in: suppress the form-number text printed above the title. Off by default —
   * every existing form keeps its number. The reserved line/margin stays in place so
   * no other spacing shifts; only the text itself is omitted.
   */
  hideFormNumber?: boolean;
  /**
   * Opt-in: omit the short decorative rule drawn under the title. Off by default —
   * every existing form keeps it, byte-identical.
   *
   * Exists for a form that draws its **own** titled header inside its template and
   * therefore passes `title=""`: with no title text above it the rule reads as a
   * stray horizontal line at the very top of the sheet, not as an underline. The
   * Administrative Payment Voucher also passes `title=""` but does NOT set this, so
   * its printed output is unchanged.
   */
  hideTitleRule?: boolean;
  /**
   * Opt-in: omit the `ApprovalSection` (manager approval title, signature, date,
   * official stamp) from the footer entirely. Off by default — every existing form
   * keeps it. The footer's flex layout and QR position are unchanged; only the
   * approval block itself is not rendered.
   */
  hideApprovalSection?: boolean;
  /**
   * Opt-in: bind the footer `ApprovalSection` to the central Multi-Signature & Stamp
   * system — a picker appears in the (never-printed) toolbar and the chosen signature
   * and stamp are drawn in the approval block's existing places.
   *
   * Off by default, so a form joins the system only by an explicit, reviewed decision:
   *  · `Quotation` (legacy view) stays out — the quotation's company signature belongs
   *    to its print-template path (`QuotationBase`), which already owns the choice.
   *  · The payment vouchers set `hideApprovalSection` — there is no company approval
   *    slot on them to bind.
   *
   * A new form joins with this one prop; no per-form state, images or resolution logic.
   */
  approvalBranding?: boolean;
  /**
   * Opt-in: render a second-language line under each of the footer
   * `ApprovalSection`'s four labels (title / signature / date / stamp). Passed
   * straight through — this layer authors no text and knows no second language;
   * the strings come from the form that needs them (the EN+HI templates).
   *
   * Absent (every existing form) ⇒ the approval block is byte-identical.
   */
  approvalSecondaryLabels?: ApprovalSecondaryLabels;
  /**
   * Opt-in: override the document font stack applied to `.form-page`. Off by
   * default — every existing form keeps `DOC_FONT_STACK` (`Cairo, Arial,
   * sans-serif`) exactly as before.
   *
   * Exists for the EN+HI variant, whose stack appends `Noto Sans Devanagari`
   * AFTER Cairo: Latin and digits still resolve to Cairo (so the English half is
   * visually identical to the English template), and the Devanagari family is
   * reached only for codepoints Cairo/Arial do not cover. Setting it here rather
   * than on the template's own root is what carries the family through every
   * surface that clones `.form-page` — accurate preview, Save PDF and print.
   */
  docFontStack?: string;
  /**
   * Payment-voucher-only, opt-in top-margin trim: when a form on the
   * `payment-voucher` profile sets `compactTopMargin`, its `@page` top margin is
   * reduced from the profile's default 12mm to 5mm, reclaiming top space so the
   * form's content (including a taller header, e.g. `useLogoHeader`) fits on one
   * page. Mirrors `letterheadCompactFooter` below. Does not touch the shared
   * `PRINT_PROFILES` margins or any other form/profile — only this instance's
   * `@page` rule and Save-PDF export margins change.
   */
  compactTopMargin?: boolean;
  /**
   * Opt-in: replace the plain-text company name in the header with the official
   * `logohead.png` letterhead image, at its natural aspect ratio. Off by default —
   * every existing form keeps the plain-text header unchanged.
   */
  useLogoHeader?: boolean;
  /**
   * Explicit override for the logo header's recolor tint (hex, e.g. `'#1d4e6f'`).
   * Rarely needed: on the `ready-paper` profile FormLayout already applies
   * `SECTION_HEADER_BG` automatically (see `readyPaperLogoTintColor` below); on
   * every other profile the default stays `FormHeader`'s own brand tint. Pass
   * this only to override either of those defaults for a specific form.
   */
  logoTintColor?: string;
  /**
   * Opt-in: extra top offset added above the whole content block (e.g. `'2cm'`).
   * Off by default — every existing form keeps its current top spacing. Implemented
   * as a real spacer element (not container padding), so it survives the
   * `.form-page { padding: 0 !important }` print/PDF reset below — padding here
   * would be zeroed at print time. Shifts the whole page content (header through
   * footer) down as one block without altering the spacing between elements.
   */
  contentTopOffset?: string;
  /**
   * Optional preview gate for the toolbar's Print button. **Additive and opt-in** —
   * when it is absent (every form but Quotation today) the button calls `doPrint`
   * directly, exactly as before.
   *
   * It receives the page's own print path as `proceed` and the printable `.form-page`
   * node, and decides *when* to run `proceed`. It cannot change *what* printing does:
   * `doPrint` — copies, readiness, the gateway, `webContents.print` — is untouched, and
   * remains the only executor of a physical print.
   */
  printIntercept?: (ctx: { proceed: () => void; node: HTMLElement | null }) => void;

  /**
   * Optional gate for the toolbar's **Save PDF** button — the exact sibling of
   * `printIntercept`, with the same contract and the same limits. **Additive and
   * opt-in**: absent (every form but the Employee Debt Acknowledgment today) the
   * button calls `doExportPdf` directly, exactly as before.
   *
   * It receives the page's own export path as `proceed` and decides *when* to run it.
   * It cannot change *what* exporting does: `doExportPdf` — the composer, the page
   * spec, the strip selectors, the Electron bridge — is untouched, and remains the
   * only executor of an export.
   *
   * Exists because a form can have a precondition that makes an export WRONG rather
   * than merely ugly: the debt acknowledgment must never emit an English or Hindi
   * document that still carries Arabic values, since the worker signing it cannot
   * read them. Printing was already gateable; exporting was not, and a blocked print
   * with an unblocked "Save PDF" beside it is not a gate at all.
   */
  exportIntercept?: (ctx: { proceed: () => void; node: HTMLElement | null }) => void;

  /**
   * **إضافي بحت.** يَنشر للنموذج مرجعَي: العقدة المطبوعة (`.form-page`) ودالة الطباعة
   * القديمة (`doPrint`) — كما هما، بلا تغليف. أُضيف ليتمكّن زر «المعاينة الدقيقة» من
   * إعادة استخدام **نفس** مصدر المستند و**نفس** مسار الطباعة، دون لمس `doPrint` ولا
   * `printIntercept` ولا أي سلوك قائم.
   *
   * حين لا يُمرَّر (كل الاستخدامات السابقة) لا يحدث شيء إطلاقًا.
   *
   * `print()` now resolves with the real `PrintResult` (success/cancelled/error/
   * unknown) instead of `void` — additive: any existing caller that ignores the
   * return value (as all callers did before this pack) is unaffected, since a
   * function resolving a value is always usable where `void` was expected.
   */
  onPrintApiReady?: (api: { getNode: () => HTMLElement | null; print: () => Promise<PrintResult> }) => void;
  /**
   * Opt-in override for the document title's font size (px). Off by default —
   * every existing form keeps the original 22px heading exactly as before.
   *
   * Exists for a title that carries BOTH languages on one line (the bilingual
   * Monthly Employee Entitlements statement): at 22px that string wraps to a
   * second heading line and costs the one-page layout vertical space it does not
   * have. Only the heading's own font size changes — the surrounding block, the
   * rule beneath it, the margins and every other form are untouched.
   */
  titleFontSize?: number;
  /**
   * Opt-in: render the sheet as **content only** — no title block (form number,
   * title, rule) and no footer block (approval, QR, its top rule). Off by default,
   * so every existing form is byte-identical.
   *
   * Exists for printing on the company's PRE-PRINTED letterhead stationery, where
   * the physical paper already carries the header and footer and drawing them again
   * duplicates them. Purely a matter of which blocks `FormPage` renders — it does not
   * touch `@page`, the profile margins, the print path or the preview. The content
   * band itself comes from the profile the form selects.
   */
  contentOnly?: boolean;
}

/**
 * Ready-paper letterhead: how far the overlay sits below the sheet's top edge.
 *
 * The artwork's crop boundary lands exactly on its first inked row, so at `0`
 * there is no tolerance at all — sub-pixel rounding, or a printer's
 * non-printable edge band, shaves the top of the logo. This offset is taken
 * from the clearance that already exists between the artwork's bottom and the
 * content start (measured 2.9mm), so it costs the content nothing and moves
 * nothing: the form still begins at the profile's own 40mm.
 *
 * Deliberately the smallest value that restores a visible top edge — raising it
 * further would push the artwork into the content column.
 */
const READY_PAPER_LOGO_TOP_OFFSET = '2.5mm';

/**
 * PRINT-ONLY safety compensation for the ready-paper letterhead.
 *
 * Why it exists: the screen preview and the PDF export both render the full
 * 210×297mm sheet, so a logo sitting 2.75mm from the paper edge looks perfect in
 * both. A physical printer cannot — `printService.printToPrinter` calls
 * `webContents.print({ silent: false, printBackground: true })` with no
 * `margins`/`pageSize`, so the DRIVER's hardware non-printable band (typically
 * 3–5mm on A4) applies and simply never deposits ink there. That band is a
 * property of the hardware; no CSS can print into it.
 *
 * The compensation therefore lives in `@media print` ONLY, so the approved
 * on-screen preview stays byte-identical: push the header down to a safe top and
 * scale it uniformly (aspect ratio preserved — one `scale()`, never separate
 * x/y) so it still finishes above the content, whose position never changes.
 *
 * Geometry it is solved for (measured on the real app):
 *   ink height 37.18mm, ink starts ~0.25mm below the header's own top edge,
 *   content begins at 40.25mm.
 *     ink top    = TOP + 0.25 × SCALE           → 5 + 0.23 ≈ 5.23mm
 *     ink bottom = TOP + 37.43 × SCALE          → 5 + 34.8 ≈ 39.81mm
 *   leaving ~0.44mm before the content and ~5.2mm of printer safety above.
 *
 * SCALE is the smallest reduction that clears a 5mm band; raise TOP (and lower
 * SCALE to match) only if a specific printer needs a wider one.
 */
const READY_PAPER_PRINT_SAFE_TOP = '5mm';
const READY_PAPER_PRINT_LOGO_SCALE = 0.93;

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
  printIntercept,
  exportIntercept,
  onPrintApiReady,
  lang = 'ar',
  letterheadCompactFooter = false,
  approvalHideDate = false,
  approvalStampInline = false,
  hideFormNumber = false,
  hideTitleRule = false,
  hideApprovalSection = false,
  approvalBranding = false,
  approvalSecondaryLabels,
  docFontStack = DOC_FONT_STACK,
  compactTopMargin = false,
  useLogoHeader = false,
  logoTintColor,
  contentTopOffset,
  contentOnly = false,
  titleFontSize = 22,
}: FormLayoutProps) {
  const navigate = useNavigate();

  /**
   * فُتح هذا النموذج عبر زر «فتح» في صفحة النماذج الإدارية (علامة في الرابط —
   * انظر `formOpenIntent.ts`). حينها: لا طباعة تلقائية، والمعاينة تفتح على 80%.
   * أي مسار آخر يصل لنفس الشاشة (مسار الشيكات، رابط عميق مباشر) لا يحمل العلامة،
   * فيبقى سلوكه كما كان حرفًا بحرف.
   */
  const openedForPreview = useFormOpenIntent();
  const previewInitialZoom = useFormPreviewInitialZoom();

  /**
   * The company's signature/stamp choice for this document. The hooks run
   * unconditionally (rules of hooks) — only the picker and the images are gated on
   * `approvalBranding`, so an opted-out form renders exactly what it rendered before.
   */
  const branding = useCompanyBranding();
  const brandingSelection = useBrandingSelection(branding);
  const showBrandingPicker = approvalBranding && !hideApprovalSection && brandingSelection.ready;

  /**
   * Design mode — the SAME `useBrandingDesigner` the quotation and invoice screens use,
   * keyed by this form's own `formType`. That key is why each form's position and size
   * are independent: the salary certificate and the purchase request write to different
   * entries of one record.
   */
  const [savedLayout, setSavedLayout] = useState<PrintBrandingLayoutSettings | undefined>(undefined);
  // The layout key is the form's own type, taken from the central registry — this layer
  // names no individual form. A `formType` that is not registered yields `undefined`,
  // which makes the designer inert rather than aimed at another form's entry.
  const layoutDocKey: BrandingDocKey | undefined = isFormBrandingDocKey(formType)
    ? formType
    : undefined;
  const designer = useBrandingDesigner({
    docType: layoutDocKey,
    initialLayout: savedLayout ?? branding.brandingLayout,
    onSaved: setSavedLayout,
  });
  // While designing, the live (unsaved) layout drives the document so the drag is
  // visible; otherwise the saved one does — and that is the layout the accurate preview,
  // the print dialog and the PDF all compose from, because they read this same DOM.
  const effectiveApprovalLayout = getBrandingLayoutForDocument(
    designer.isActive ? designer.localLayout : (savedLayout ?? branding.brandingLayout),
    layoutDocKey,
  );
  const canDesignApproval =
    showBrandingPicker &&
    !!layoutDocKey &&
    ((brandingSelection.showSignature && !!brandingSelection.signatureUrl) ||
      (brandingSelection.showStamp && !!brandingSelection.stampUrl));

  const [copies, setCopies] = useState(() =>
    formType ? loadCopies(formType) : 1,
  );
  const copiesRef = useRef(copies);
  copiesRef.current = copies;

  // Ref to the printable `.form-page` — its outerHTML is the ONLY content sent to
  // the PDF export, isolated from the surrounding PrintWorkspace shell.
  const formPageRef = useRef<HTMLDivElement>(null);

  // الاعتراض يُقرأ من ref حتى يبقى تأثير الطباعة التلقائية معتمدًا على [ready] وحده،
  // فلا يتغيّر توقيته ولا عدد مرات تشغيله عمّا كان.
  const printInterceptRef = useRef(printIntercept);
  printInterceptRef.current = printIntercept;

  // نشر واجهة الطباعة للنموذج (إضافي). `doPrint` نفسها لم تُمسّ — تُقرأ من ref فقط،
  // فلا يتغيّر توقيتها ولا عدد استدعاءاتها ولا سلوكها.
  const doPrintRef = useRef<() => Promise<PrintResult>>(() => Promise.resolve({ outcome: 'unknown' as const }));
  const apiPublishedRef = useRef(false);
  useEffect(() => {
    if (apiPublishedRef.current || !onPrintApiReady) return;
    apiPublishedRef.current = true;
    onPrintApiReady({
      getNode: () => formPageRef.current,
      print: () => doPrintRef.current(),
    });
  }, [onPrintApiReady]);

  const activeProfile = PRINT_PROFILES[profile];
  // Central, per-profile logo header (e.g. "ready-paper"): OR'd with the explicit
  // per-form `useLogoHeader` opt-in (e.g. Payment Voucher) — either source turns
  // it on, so no existing caller's behavior changes. `hideHeader` only suppresses
  // the header when the profile is blank AND does NOT supply its own logo —
  // letterhead (blankHeader, no logoHeader) stays exactly as hidden as before;
  // a profile with `logoHeader: true` renders the logo instead of staying blank.
  // Margins/page config are untouched by either flag.
  const showLogoHeader = useLogoHeader || activeProfile.logoHeader;
  const hideHeader = activeProfile.blankHeader && !activeProfile.logoHeader;
  // Only a PROFILE-level logo (ready-paper's `logoHeader`) renders as an
  // out-of-flow overlay pinned to the page's top edge. Payment Voucher's
  // page-level `useLogoHeader` opt-in is untouched — it never sets this, so its
  // header stays in-flow exactly as designed today.
  const logoHeaderIsOverlay = activeProfile.logoHeader;
  // Ready-paper logo tint, centralized: `logoHeader: true` is set on the
  // `ready-paper` profile ONLY (see printProfiles.ts) — reusing that same flag
  // here means every current and future form on this profile gets the logo
  // recolored to match its own section-header bars automatically, with zero
  // per-page opt-in. Every other profile (`logoHeader: false`) leaves this
  // `undefined`, so `FormHeader` falls back to its own unchanged default tint.
  // An explicit `logoTintColor` prop still wins, preserving that escape hatch.
  const readyPaperLogoTintColor = activeProfile.logoHeader ? SECTION_HEADER_BG : undefined;

  /**
   * PAGE-LEVEL HEADER MODEL (ready-paper only).
   *
   * Default model: `@page { margin: <profile margins> }` and `.form-page
   * { padding: 0 }`. The browser therefore starts `.form-page` at the page
   * CONTENT-AREA origin — 40mm below the physical sheet edge for ready-paper.
   * `.form-page` is the content box, NOT the sheet, so an overlay pinned at
   * `top: 0` lands 40mm down, on top of the form's title. Reaching the sheet
   * edge from there needs a negative offset, which every renderer clips
   * (composeStyledFromNode / formPdfDocument clone `.form-page` alone; paged
   * print does not paint above the page area).
   *
   * Page-level model: give `@page` a ZERO margin and re-apply the very same
   * profile margin values as PADDING on `.form-page`. `.form-page` then spans
   * the whole physical A4 sheet, and because an absolutely positioned child is
   * laid out against its containing block's PADDING BOX, `top: 0` now means the
   * real sheet edge — the top band becomes usable for the letterhead, while the
   * in-flow content still begins after the same 40mm and never moves.
   *
   * PRINT_PROFILES values are read verbatim and never modified; only where they
   * are applied changes (page margin → page padding).
   */
  // Letterhead-only, opt-in bottom-margin trim: when a form sets
  // `letterheadCompactFooter`, reclaim the generous 20mm bottom margin to 10mm so it
  // stays on one page (top/header clearance untouched — see the prop's JSDoc). Feeds
  // BOTH the @page print rules and the Save-PDF export so print and PDF can't drift.
  // Payment-voucher-only, opt-in top-margin trim: see `compactTopMargin`'s JSDoc.
  const formMargins =
    activeProfile.blankHeader && letterheadCompactFooter
      ? { ...activeProfile.margins, bottom: '10mm' }
      : profile === 'payment-voucher' && compactTopMargin
        ? { ...activeProfile.margins, top: '5mm' }
        : activeProfile.margins;
  const { top: mt, right: mr, bottom: mb, left: ml } = formMargins;
  // Page-level header model (see `logoHeaderIsOverlay`'s note above): the SAME
  // margin values move from the `@page` margin to `.form-page`'s padding, so the
  // element models the physical sheet instead of the content box.
  const pageMarginCss = logoHeaderIsOverlay ? '0' : `${mt} ${mr} ${mb} ${ml}`;
  const formPagePaddingCss = logoHeaderIsOverlay ? `${mt} ${mr} ${mb} ${ml}` : '0';

  function updateCopies(n: number) {
    const clamped = Math.max(1, Math.min(10, n));
    setCopies(clamped);
    if (formType) saveCopies(formType, clamped);
  }

  /**
   * Print the form.
   *
   * THE DEFECT THIS REPLACES: this function used to LOOP — `printCurrentView()` once
   * per copy, 1.5 s apart. Asking for 3 copies therefore opened **three separate OS
   * print dialogs** and spooled three separate jobs. That is the "3 dialogs" bug.
   *
   * NOW: one call, one dialog, and `copies` is handed to the driver NATIVELY
   * (`webContents.print({ copies })`) so the printer produces N copies from a single
   * spool job — which is what every other desktop application does.
   *
   * `silent` stays FALSE: the OS dialog is still shown, exactly as before. Nothing here
   * enables silent or batch printing.
   *
   * Rollback: with PRINT_CENTER_FOUNDATION_V1 off, the original single-shot
   * `printCurrentView()` is used. (The old N-dialog loop is NOT restored — it was a
   * defect, not a behaviour worth preserving. A single dialog with the copy count in it
   * is strictly closer to the user's intent than three dialogs.)
   */
  // نفس الدالة القديمة بمرجعها — تُعيد الآن Promise<PrintResult> بدل تجاهل النتيجة
  // (كانت `void submitPrintJob(...)` تُلقي نتيجة حقيقية موجودة أصلاً)؛ الفعليات نفسها:
  // نفس الخيارات، نفس البوابة، نفس webContents.print — بلا أي تغيير في ما يحدث فعليًا.
  doPrintRef.current = doPrint;

  async function doPrint(): Promise<PrintResult> {
    const count = copiesRef.current;

    if (!isFlagEnabled(PRINT_CENTER_FOUNDATION_V1)) {
      return printCurrentViewWithResult();
    }

    const result = await submitPrintJob(
      createPrintJob({
        docType: 'form',
        documentId: formNumber || formType,
        destination: 'printer',
        copies: count, // normalized + clamped by createPrintJob; passed once
        title,
        documentLabel: formNumber || title,
        renderSource: 'dom-node',
      }),
    );
    return {
      outcome: result.status === 'printed' || result.status === 'exported'
        ? 'success'
        : result.status === 'canceled' ? 'cancelled' : 'error',
      failureReason: result.error,
    };
  }

  /**
   * "Save PDF" — نفس مُركِّب المعاينة الدقيقة حرفيًا (`composeStyledFromNode` على
   * `formPageRef.current` الحيّة، نفس `pageSpec` الافتراضي 'a4-portrait'، نفس
   * `stripSelectors`)، فيصبح الملف المحفوظ **نفس المستند** الذي عاينه المستخدم —
   * لا بناء CSS مستقلّ بموازاته. (كان هذا المسار اختياريًا خلف علم أثناء التعميم
   * المرحلي عبر المراحل 5A–5D؛ بعد أن أثبت كل مستهلك حالي لـ `FormLayout` أنه
   * يعمل صحيحًا بلا استثناء بروفايل، أُزيل العلم والفرع القديم معًا — مسار واحد،
   * بلا CSS مطبوع مبنيّ يدويًا بمعزل عن المستند الحيّ.)
   *
   * فشل التركيب (تعذّر التقاط الأنماط — `composeStyledFromNode` تفشل بصوت عالٍ
   * عمدًا): نتراجع إلى **نفس شبكة الأمان القائمة أصلًا** لكل نموذج عند أي فشل
   * تصدير: `printCurrentView()` (حوار الطباعة الأصلي، الذي يعرض «حفظ PDF» أيضًا).
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
      const { composeStyledFromNode, getPageSpec } = await import('../../printing');
      const html = composeStyledFromNode({
        node: pageEl,
        pageSpec: getPageSpec('a4-portrait'),
        title: title || name,
        lang,
        stripSelectors: ['.no-print'],
      });
      await exportFromHtml(html, name);
    } catch {
      printCurrentView();
    }
  }

  /**
   * Auto-print once the form has rendered. The BEHAVIOUR is unchanged (forms still
   * print themselves when opened); only the TRIGGER is fixed.
   *
   * It used to be `setTimeout(() => printCurrentView(), 600)` — an arbitrary sleep
   * standing in for "the document is ready". On a slow machine or a cold font cache the
   * dialog could open over a half-laid-out form, or before Cairo had loaded (which
   * breaks Arabic shaping). We now await the real signals — fonts, images, a painted
   * frame — with a bounded fallback, exactly as PayrollPayslip already does.
   *
   * This fires ONE dialog. It does not loop, and it is independent of `copies`.
   *
   * **«فتح» (`openedForPreview`) يُلغي هذه الطباعة التلقائية وحدها.** لا يمسّ
   * `doPrint` ولا زر الطباعة ولا خيارات الطابعة ولا الهوامش: النموذج يُعرض في
   * مساحة العمل، ويطبع المستخدم من نفس الزر ونفس المسار متى شاء. أما المسارات
   * التي لا تحمل العلامة فتطبع تلقائيًا كما كانت تمامًا.
   */
  useEffect(() => {
    if (!ready || openedForPreview) return;
    let canceled = false;
    void waitForPrintReady().then(() => {
      if (canceled) return;
      // الطباعة التلقائية تمرّ بنفس بوابة زر الطباعة اليدوي: لو كان هناك اعتراض،
      // فهو يقرّر التوقيت (يفتح المعاينة) — وإلا فالسلوك القديم كما هو: طباعة فورية.
      // بلا اعتراض ⇒ سطر واحد لم يتغيّر: printCurrentView().
      const intercept = printInterceptRef.current;
      if (intercept) {
        intercept({ proceed: doPrint, node: formPageRef.current });
        return;
      }
      printCurrentView();
    });
    return () => {
      canceled = true;
    };
  }, [ready, openedForPreview]);

  const paperLabel = lang === 'en' ? activeProfile.labelEn : activeProfile.labelAr;

  const toolbar = (
    <>
      {/* السلوك الافتراضي بلا `printIntercept`: نفس النقرة، نفس `doPrint`، بلا وسيط.
          ومع الاعتراض: تُقرَّر لحظةُ الطباعة فقط — لا كيفيتها؛ `doPrint` يظل المنفّذ الوحيد. */}
      <button
        type="button"
        className="btn"
        onClick={
          printIntercept
            ? () => printIntercept({ proceed: doPrint, node: formPageRef.current })
            : doPrint
        }
      >
        🖨️ {lang === 'en' ? 'Print' : 'طباعة'}
      </button>
      {/* السلوك الافتراضي بلا `exportIntercept`: نفس النقرة، نفس `doExportPdf`، بلا وسيط. */}
      <button
        type="button"
        className="btn secondary"
        onClick={
          exportIntercept
            ? () => exportIntercept({ proceed: doExportPdf, node: formPageRef.current })
            : doExportPdf
        }
      >
        📄 {lang === 'en' ? 'Save PDF' : 'حفظ PDF'}
      </button>
      <span className="pw-toolbar-divider" />
      <div className="pw-tb-field">
        <span className="pw-tb-label">{lang === 'en' ? 'Copies' : 'عدد النسخ'}</span>
        <CopiesControl copies={copies} onChange={updateCopies} lang={lang} />
      </div>
      <div className="pw-toolbar-group">{toolbarExtra}</div>
      {showBrandingPicker && (
        <div className="pw-toolbar-group">
          <BrandingAssetPicker selection={brandingSelection} />
          {canDesignApproval && (
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
    <>
    <PrintWorkspace
      lang={lang}
      toolbar={toolbar}
      sidebar={sidebar}
      // 80% حين فُتح النموذج عبر «فتح»، و`undefined` (سلوك «ملاءمة الصفحة» السابق
      // بلا أي تغيير) في كل مسار آخر. تكبير شاشة بحت — لا يمسّ الطباعة ولا PDF.
      initialZoom={previewInitialZoom}
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
          @page { size: A4; margin: ${pageMarginCss}; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          .form-page {
            width: 100% !important;
            padding: ${formPagePaddingCss} !important;
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
${logoHeaderIsOverlay ? `
          /* Printer non-printable-band compensation — PRINT MEDIA ONLY, so the
             on-screen preview is untouched. Uniform scale about the top centre:
             aspect ratio and horizontal centring are both preserved. */
          [data-page-logo-header] {
            top: ${READY_PAPER_PRINT_SAFE_TOP} !important;
            transform: scale(${READY_PAPER_PRINT_LOGO_SCALE});
            transform-origin: top center;
          }` : ''}
        }
      `}</style>

      <FormPage
        pageRef={formPageRef}
        lang={lang}
        // Page-level model (ready-paper): the profile margins become the page's
        // padding so `.form-page` models the whole A4 sheet — see
        // `logoHeaderIsOverlay`'s note above. Every other profile keeps the
        // original screen padding untouched.
        padding={logoHeaderIsOverlay ? `${mt} ${mr} ${mb} ${ml}` : '18px 32px'}
        docFontStack={docFontStack}
        contentTopOffset={contentTopOffset}
        header={
          /* Company header — hidden on a blank-header profile with no logo of its
             own (letterhead: physical sheet already carries the letterhead).
             A blank-header profile that declares `logoHeader` (ready-paper) renders
             the same official logo image used by the Payment Voucher instead, as an
             out-of-flow overlay (`overlay`) so it never pushes the form down. */
          <FormHeader
            isLetterhead={hideHeader}
            lang={lang}
            logoSrc={showLogoHeader ? officialLogoHead : undefined}
            overlay={logoHeaderIsOverlay}
            tintColor={logoTintColor ?? readyPaperLogoTintColor}
            // `.form-page` now spans the whole sheet, so inset the overlay by the
            // profile's own horizontal margins to keep the header exactly as wide
            // as the content column — the artwork's size is therefore unchanged.
            overlayInsetLeft={logoHeaderIsOverlay ? ml : '0'}
            overlayInsetRight={logoHeaderIsOverlay ? mr : '0'}
            overlayTop={logoHeaderIsOverlay ? READY_PAPER_LOGO_TOP_OFFSET : '0'}
          />
        }
        formNumber={formNumber}
        hideFormNumber={hideFormNumber}
        title={title}
        titleFontSize={titleFontSize}
        hideTitleRule={hideTitleRule}
        footerStart={
          hideApprovalSection ? null : (
            <ApprovalSection
              lang={lang}
              secondaryLabels={approvalSecondaryLabels}
              hideDate={approvalHideDate}
              stampInline={approvalStampInline}
              signatureUrl={approvalBranding && brandingSelection.showSignature ? brandingSelection.signatureUrl : undefined}
              stampUrl={approvalBranding && brandingSelection.showStamp ? brandingSelection.stampUrl : undefined}
              layout={approvalBranding ? effectiveApprovalLayout : undefined}
              designer={approvalBranding && layoutDocKey ? designer : undefined}
            />
          )
        }
        qrData={qrData}
        contentOnly={contentOnly}
      >
        {children}
      </FormPage>
    </PrintWorkspace>

    {/* The SAME properties panel the quotation/invoice design mode uses — position,
        size, opacity, layer, snap, alignment, reset and save.
        Rendered OUTSIDE `PrintWorkspace` on purpose: the workspace zooms its preview
        with a CSS `transform`, and a transformed ancestor turns `position: fixed` into
        `absolute` — the panel would scale and drift with the zoom. It is `.no-print`, and
        the PDF path strips `.no-print` too, so it reaches neither paper nor export. */}
    {designer.isActive && (
      <BrandingDesignerPanel
        designer={designer}
        docLabel={title || formNumber}
        onClose={designer.deactivate}
      />
    )}
    </>
  );
}
