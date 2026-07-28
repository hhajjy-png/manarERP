/**
 * formPdfDocument — builds a fully self-contained A4 HTML document that wraps
 * ONLY the printable `.form-page`, for the `window.manar.exportPdfFromHtml`
 * (`pdf:exportHtml`) pipeline. This is the SAME architecture the Reports export
 * uses: a standalone document is rendered in a hidden BrowserWindow via
 * `printToPDF`, so the live PrintWorkspace shell, dark theme, zoom transform and
 * preview canvas never reach the PDF — no black frame.
 *
 * The `.form-page` is styled almost entirely with inline styles, and its QR code
 * is an `<img src="data:image/png;base64,...">`, so its `outerHTML` is already
 * self-contained. The only external dependency is the Cairo font, which is
 * embedded here as a base64 `@font-face` — the identical technique the backend
 * report engine uses (`reportEngine/html.service.ts`). The font is imported with
 * Vite's `?inline` suffix, which forces a base64 data URI at build time (fully
 * offline, no CDN, no runtime file access).
 */

// Base64 `data:` URI for the already-shipped Cairo TTF (the same subset the
// backend embeds). vite.config forces THIS asset to inline (assetsInlineLimit),
// so the import resolves to a self-contained data URI — no file:// resolution in
// the hidden export window. Callers dynamic-import this module, so the encoded
// font lives in a lazy chunk, off the initial bundle.
import cairoRegular from '../../assets/fonts/Cairo-Regular.ttf';

export interface FormPdfMargins {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export interface BuildFormPdfDocumentArgs {
  /** `outerHTML` of the live `.form-page` element (inline styles + QR data-URI travel with it). */
  formPageHtml: string;
  /** Document title — used for the `<title>` element only. */
  title: string;
  lang: 'ar' | 'en';
  /** Page margins from the active PRINT_PROFILE — the same values the physical printer uses. */
  margins: FormPdfMargins;
  /**
   * Page-level header model (ready-paper). When true the SAME margin values are
   * applied as `.form-page` PADDING with a zero `@page` margin, so `.form-page`
   * spans the whole physical sheet and its absolutely-positioned letterhead
   * overlay can occupy the top band. Content still begins after the same
   * margins, so the printed layout is unchanged. Off by default — every other
   * profile keeps the original page-margin model byte-for-byte.
   */
  marginsAsPagePadding?: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildFormPdfDocument({
  formPageHtml,
  title,
  lang,
  margins,
  marginsAsPagePadding = false,
}: BuildFormPdfDocumentArgs): string {
  const dir = lang === 'en' ? 'ltr' : 'rtl';
  const htmlLang = lang === 'en' ? 'en' : 'ar';
  const marginCss = `${margins.top} ${margins.right} ${margins.bottom} ${margins.left}`;
  const pageMargin = marginsAsPagePadding ? '0' : marginCss;
  const formPagePadding = marginsAsPagePadding ? marginCss : '0';

  // Graceful degradation mirrors the backend: if the font failed to inline, fall
  // back to Arial/system Arabic shaping rather than emitting a broken @font-face.
  const fontFace = cairoRegular
    ? `@font-face {
        font-family: 'Cairo';
        src: url('${cairoRegular}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }`
    : '';

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    ${fontFace}

    @page {
      size: A4;
      margin: ${pageMargin};
    }

    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: 'Cairo', Arial, sans-serif;
    }

    /* The extracted .form-page carries its on-screen inline styles (max-width,
       centering, content padding, paper border/shadow/radius). Neutralize them
       with !important so the page fills the printable area between the @page
       margins — identical to FormLayout's own @media print rules that drive the
       physical printout. */
    .form-page {
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: ${formPagePadding} !important;
      border: none !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      background: #fff !important;
    }

    .form-page-footer {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  ${formPageHtml}
</body>
</html>`;
}
