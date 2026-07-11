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
import type { PageSpec } from './pageSpec';
import { toPageCss } from './pageSpec';

/** Hard ceiling on composed HTML. Bounds the IPC payload and the hidden-window
 *  render; a document this large is a bug, not a business case. */
export const MAX_COMPOSED_HTML_BYTES = 12 * 1024 * 1024; // 12 MB

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

const FONT_FACE = cairoRegular
  ? `@font-face { font-family: 'Cairo'; src: url('${cairoRegular}') format('truetype'); font-weight: normal; font-style: normal; }`
  : ''; // graceful degradation — mirrors the backend engine

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
    font-family: 'Cairo', Arial, sans-serif;
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
