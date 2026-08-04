/**
 * Print Center — document composer (Phase 2).
 *
 * Turns an EXISTING printable surface into a self-contained HTML document that the
 * hidden window can render to PDF. This is the "shell around existing renderers"
 * principle in code: the Print Center never lays a document out, it only WRAPS what
 * a page already rendered.
 *
 * The technique is the one already proven in production by
 * `forms/shared/formPdfDocument.ts` and the backend report engine
 * (`reportEngine/html.service.ts`): serialize the printable node, inline the Cairo
 * font as a base64 @font-face, emit ONE `@page` rule from the PageSpec, and neutralise
 * the on-screen-only styling (paper border, shadow, max-width, centering) so the page
 * fills the printable area. Nothing external is fetched — no CDN, no network.
 *
 * Two composers are provided:
 *   • composeFromNode()  — an on-page element (Receipt Voucher, invoices, forms…)
 *   • composeFromHtml()  — already-self-contained HTML (the backend report engine)
 */

import cairoRegular from '../assets/fonts/Cairo-Regular.ttf';
import { buildEmbeddedFontFaceCss, docFontStack } from '../styles/fontRegistry';
import type { PageSpec } from './pageSpec';
import { toPageCss } from './pageSpec';
import { capturePrintStyles, mergePageRules } from './styleCapture';

/** Hard ceiling on composed HTML. Bounds the IPC payload and the hidden-window
 *  render; a document this large is a bug, not a business case. */
export const MAX_COMPOSED_HTML_BYTES = 12 * 1024 * 1024; // 12 MB

/**
 * Chrome that must NEVER reach the composed document, whatever the caller passes.
 *
 * Defence in depth for the whole-page-print defect: the Print Center's own shell, any
 * screen-only control, and any portal/overlay are removed from the clone even if a page
 * accidentally nests them inside its printable root. The physical-print fix is printing
 * the cached PDF artifact (see previewService `print:printArtifact`); this is the second
 * barrier, not the fix.
 */
const ALWAYS_STRIP = [
  '.pc-scrim', // Print Center dialog (scrim + dialog live inside it)
  '.no-print',
  '[data-no-print]',
  '[data-print-hidden]',
] as const;

export interface ComposeOptions {
  /** The printable element. Its `outerHTML` (inline styles + data: URIs) is used. */
  node: HTMLElement;
  pageSpec: PageSpec;
  title: string;
  lang?: 'ar' | 'en';
  /** Selectors removed from the composed copy — screen-only chrome (toolbars, etc.). */
  stripSelectors?: string[];
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// كتلة الخط المضمَّن — تُبنى الآن من `styles/fontRegistry` (مصدر واحد يشاركه
// `formPdfDocument`)، وتحتفظ بنفس التدهور اللطيف: سلسلة فارغة عند فشل التضمين.
const FONT_FACE = buildEmbeddedFontFaceCss(cairoRegular);

/** Shared skeleton. `bodyHtml` must already be safe, serialized markup. */
function wrap(bodyHtml: string, pageCss: string, title: string, lang: 'ar' | 'en'): string {
  const dir = lang === 'en' ? 'ltr' : 'rtl';
  return `<!DOCTYPE html>
<html dir="${dir}" lang="${lang === 'en' ? 'en' : 'ar'}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  ${FONT_FACE}
  ${pageCss}
  *, *::before, *::after {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    font-family: ${docFontStack(lang)};
  }
  /* The serialized node carries its ON-SCREEN styling (paper border, shadow, radius,
     max-width, centering). Neutralise it so the document fills the printable area
     inside the page margins — identical to what FormLayout's own print rules do. */
  [data-print-root] {
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    background: #fff !important;
  }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function assertSize(html: string): string {
  const bytes = new TextEncoder().encode(html).length;
  if (bytes > MAX_COMPOSED_HTML_BYTES) {
    throw new Error(
      `المستند كبير جدًا للطباعة (${Math.round(bytes / 1024 / 1024)} ميجابايت). الحد الأقصى ${MAX_COMPOSED_HTML_BYTES / 1024 / 1024} ميجابايت.`,
    );
  }
  return html;
}

/**
 * Compose from a live printable element. The node is CLONED — the live DOM is never
 * mutated, so the page the user is looking at is unaffected.
 */
export function composeFromNode({
  node,
  pageSpec,
  title,
  lang = 'ar',
  stripSelectors = [],
}: ComposeOptions): string {
  const clone = node.cloneNode(true) as HTMLElement;
  for (const sel of stripSelectors) {
    clone.querySelectorAll(sel).forEach((el) => el.remove());
  }
  // Marker the skeleton's neutralising rule targets, without depending on the page's
  // own class names.
  clone.setAttribute('data-print-root', '');
  return assertSize(wrap(clone.outerHTML, toPageCss(pageSpec), title, lang));
}

/**
 * Pass through HTML that is ALREADY a complete self-contained document — the backend
 * report engine emits exactly this (its own @page, its own embedded Cairo). We do not
 * re-wrap it: re-wrapping would give it two <html> elements and two @page rules.
 */
export function composeFromHtml(html: string): string {
  return assertSize(html);
}

// ── Phase 2B — styled composition (Invoice / Quotation) ─────────────────────────

export interface ComposeStyledOptions extends ComposeOptions {
  /** Document to capture stylesheets from. Injectable for tests. */
  sourceDocument?: Document;
  /**
   * Let the caller's `pageSpec` WIN over the captured `@page` rules instead of
   * deferring to them. Default `false` — every existing caller keeps byte-identical
   * output.
   *
   * Why this exists: `app/theme.css` declares a document-wide `@page { margin: 1cm }`.
   * Because that rule is always captured, the `?? toPageCss(pageSpec)` fallback below
   * is **unreachable in this app** — a caller asking for `a4-landscape` silently got
   * portrait. The only alternatives were declaring `@page { size: … landscape }` in a
   * page's own stylesheet (a document-global rule that leaks to every other print
   * surface once that lazy chunk loads) or string-patching this module's output.
   *
   * Opting in appends the spec's `@page` LAST, so `mergePageRules`' existing
   * cascade semantics (later property wins) give the caller `size` and `margin`
   * while any other captured property survives. No second geometry engine.
   */
  forcePageSpec?: boolean;
}

/**
 * Compose a document whose styling lives in STYLESHEETS rather than inline styles —
 * the print-templates engine (CSS Modules), Template Studio, the branding/layout
 * designer overrides, and DocumentVerificationQR.
 *
 * The Print Center remains a SHELL: it clones what the existing renderer already put on
 * screen and carries that renderer's own CSS with it. It does not re-render, it does
 * not mount a second React app, and it owns no layout engine.
 *
 * @page policy — exactly one, and the TEMPLATE wins:
 *   • If the captured CSS contains any @page rules, they are reconciled with
 *     `mergePageRules` — later declarations win per property, exactly like the real
 *     browser cascade resolves multiple `@page` rules of equal specificity. This is
 *     what makes the template's own, more specific geometry (declared later in
 *     document order, e.g. `@page { size: A4; margin: 0 }`) win over an earlier,
 *     document-wide fallback rule (e.g. `app/theme.css`'s `@page { margin: 1cm; }`)
 *     — the PageSpec's default is NOT emitted when the template declares its own.
 *     There is still never more than one @page in the composed document.
 *   • Only if the captured CSS declares none do we fall back to the PageSpec.
 *
 * FAILS LOUDLY: if no stylesheet rules could be captured, the document would print
 * unstyled. That is a silent-fidelity disaster, so we throw an Arabic error and the
 * preview reports failure rather than showing a plausible-looking, wrong document.
 */
export function composeStyledFromNode({
  node,
  pageSpec,
  title,
  lang = 'ar',
  stripSelectors = [],
  sourceDocument,
  forcePageSpec = false,
}: ComposeStyledOptions): string {
  const captured = capturePrintStyles(sourceDocument ?? node.ownerDocument ?? document);

  if (captured.ruleCount === 0) {
    throw new Error(
      'تعذّر قراءة أنماط المستند — لا يمكن توليد معاينة قد تظهر بتنسيق ناقص. أعد تحميل الصفحة وحاول مجددًا.',
    );
  }
  if (captured.problems.length > 0) {
    // Offline app: this should never happen. If it does, the composed document would be
    // missing CSS we cannot see — refuse rather than ship a partially styled invoice.
    throw new Error(
      'تعذّر الوصول إلى بعض أنماط المستند — تم إيقاف المعاينة تفاديًا لإخراج غير مطابق.',
    );
  }

  const clone = node.cloneNode(true) as HTMLElement;
  for (const sel of [...ALWAYS_STRIP, ...stripSelectors]) {
    clone.querySelectorAll(sel).forEach((el) => el.remove());
  }
  clone.setAttribute('data-print-root', '');

  // Exactly one @page: the captured rules merged in cascade order (later property
  // wins — see `mergePageRules`), or the PageSpec's if none were captured at all.
  // `forcePageSpec` appends the spec LAST so its properties win the same merge —
  // still exactly one @page, still the same cascade rule, no second code path.
  const pageCss = forcePageSpec
    ? mergePageRules([...captured.pageRules, toPageCss(pageSpec)])!
    : mergePageRules(captured.pageRules) ?? toPageCss(pageSpec);

  // Reproduce the SOURCE document's inherited context rather than inventing one.
  // Bidi resolution depends on the root direction, and the app's <html> is `dir="rtl"`;
  // a mismatch here is what lets a trailing LTR token like "KWD" reorder relative to its
  // amount. We copy the real root's dir/lang and the body's classes so the cloned subtree
  // inherits exactly what it inherited on screen. `lang` still overrides when the caller
  // is explicitly rendering an English document.
  const srcDoc = sourceDocument ?? node.ownerDocument ?? document;
  const rootDir = srcDoc.documentElement.getAttribute('dir') ?? 'rtl';
  const rootLang = srcDoc.documentElement.getAttribute('lang') ?? 'ar';
  const dir = lang === 'en' ? 'ltr' : rootDir;
  const htmlLang = lang === 'en' ? 'en' : rootLang;
  const bodyClass = srcDoc.body?.className ?? '';

  const html = `<!DOCTYPE html>
<html dir="${dir}" lang="${htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="color-scheme" content="light">
<base href="${escapeHtml(srcDoc.baseURI)}">
<title>${escapeHtml(title)}</title>
<style>
  ${FONT_FACE}
</style>
<style data-captured-styles>
${captured.css}
</style>
<style>
  /* Normalisation, LAST so it wins. The captured CSS above carries the template's real
     layout; this only guarantees a clean white sheet and neutralises the on-screen-only
     chrome of the preview surface. */
  ${pageCss}
  :root { color-scheme: light; }
  *, *::before, *::after {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff !important;
  }
  /* The cloned root carried its on-screen framing (paper border, shadow, max-width,
     centering, zoom transform). Strip it so the document fills the printable area. */
  [data-print-root] {
    margin: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    transform: none !important;
    background: #fff !important;
  }
</style>
</head>
<body class="${escapeHtml(bodyClass)}">${clone.outerHTML}</body>
</html>`;

  return assertSize(html);
}
