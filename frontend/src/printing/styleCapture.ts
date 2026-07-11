/**
 * Print Center — stylesheet capture (Phase 2B).
 *
 * WHY THIS EXISTS
 * ---------------
 * Receipt Voucher could be composed by serializing its printable node alone, because
 * that node is styled almost entirely with INLINE styles — the styling travelled with
 * the markup.
 *
 * Invoice and Quotation are not. They render through the print-templates engine, whose
 * designs are CSS MODULES (`InvoiceDesign1.module.css`, `QuotationShared.module.css`,
 * …), plus Template Studio, plus the branding/layout designer overrides, plus
 * `DocumentVerificationQR`. Those rules live in the document's stylesheets, not on the
 * elements. `node.cloneNode(true)` copies markup, NOT CSS — so serializing the node on
 * its own would produce a PDF with the right text and NO LAYOUT AT ALL.
 *
 * This module captures the document's own stylesheet text, in cascade order, so the
 * hidden window renders the SAME CSS the operator is looking at. The Print Center stays
 * a shell: it does not re-render, it does not mount a second React app, it does not own
 * a layout engine. It carries the existing renderer's output and the existing
 * renderer's CSS.
 *
 * WHAT IS CAPTURED, AND WHY WHOLESALE
 * -----------------------------------
 * Every SAME-ORIGIN stylesheet, in document order, verbatim. We deliberately do NOT try
 * to compute "only the rules that currently match the node": that approach silently
 * drops pseudo-elements, print-only rules, page-break rules, @font-face, CSS custom
 * properties, and template state classes — exactly the things whose absence produces a
 * plausible-looking but WRONG document. Over-inclusion is harmless (a selector for the
 * app sidebar simply matches nothing in a document that contains only the invoice);
 * under-inclusion is a silent fidelity bug. We choose the safe failure.
 *
 * TWO THINGS ARE DELIBERATELY DROPPED
 * -----------------------------------
 * 1. `@media (prefers-color-scheme: dark)` blocks. The hidden window inherits the OS
 *    theme, so on a dark-mode machine the app's dark tokens would repaint the invoice
 *    light-on-white. The printed page must be a light paper surface regardless of the
 *    application's theme, so dark-scheme blocks never reach the composed document.
 * 2. `@page` rules — hoisted out and returned separately, so the composer can emit
 *    EXACTLY ONE authoritative @page (see composeDocument).
 */

/** A stylesheet we could not read. Same-origin failures should not happen offline, but
 *  we surface them rather than pretending the CSS was captured. */
export interface StyleCaptureProblem {
  href: string | null;
  reason: 'cross-origin' | 'unreadable';
}

export interface CapturedStyles {
  /** All captured rule text, in original cascade order, with @page hoisted out. */
  css: string;
  /** The @page rules found in the document's own CSS, in order. May be empty. */
  pageRules: string[];
  /** Number of top-level rules captured — 0 means capture FAILED. */
  ruleCount: number;
  /** Stylesheets that could not be read. */
  problems: StyleCaptureProblem[];
}

/** True for a media rule that only applies in dark mode. */
function isDarkSchemeRule(rule: CSSRule): boolean {
  if (!(rule instanceof CSSMediaRule)) return false;
  return /prefers-color-scheme\s*:\s*dark/i.test(rule.conditionText ?? rule.media.mediaText ?? '');
}

/** Recursively pull @page rules out of a rule's text, returning [textWithoutPage, pages]. */
function extractPageRules(cssText: string): { text: string; pages: string[] } {
  const pages: string[] = [];
  // @page blocks are flat (no nested braces in practice) — a non-greedy match is safe.
  const text = cssText.replace(/@page[^{]*\{[^}]*\}/gi, (m) => {
    pages.push(m.trim());
    return '';
  });
  return { text, pages };
}

/**
 * Capture the document's stylesheets.
 *
 * Never throws. A caller MUST check `ruleCount` — zero means nothing was captured and
 * the document would print unstyled, which must fail loudly rather than ship a
 * misleading PDF.
 */
export function capturePrintStyles(doc: Document = document): CapturedStyles {
  const chunks: string[] = [];
  const pageRules: string[] = [];
  const problems: StyleCaptureProblem[] = [];
  let ruleCount = 0;

  for (const sheet of Array.from(doc.styleSheets)) {
    const href = sheet.href;

    // Offline app: there should be no remote sheets. If one ever appears, we do not
    // fetch it — we record it and move on.
    if (href && !href.startsWith(window.location.origin) && !href.startsWith('file:')) {
      problems.push({ href, reason: 'cross-origin' });
      continue;
    }

    let rules: CSSRuleList;
    try {
      // Throws SecurityError for a cross-origin sheet.
      rules = (sheet as CSSStyleSheet).cssRules;
      if (!rules) {
        problems.push({ href, reason: 'unreadable' });
        continue;
      }
    } catch {
      problems.push({ href, reason: 'cross-origin' });
      continue;
    }

    for (const rule of Array.from(rules)) {
      // The printed page is always a light paper surface — the application's dark theme
      // must never repaint it.
      if (isDarkSchemeRule(rule)) continue;

      const { text, pages } = extractPageRules(rule.cssText);
      pageRules.push(...pages);

      const trimmed = text.trim();
      // A media rule that contained ONLY an @page collapses to `@media print { }` —
      // keep it out rather than emitting empty noise.
      if (!trimmed || /^@media[^{]*\{\s*\}$/i.test(trimmed)) continue;

      chunks.push(trimmed);
      ruleCount++;
    }
  }

  return { css: chunks.join('\n'), pageRules, ruleCount, problems };
}
