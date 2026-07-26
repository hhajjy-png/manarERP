// @vitest-environment jsdom
/**
 * Regression coverage for the Exact Preview `@page` cascade bug.
 *
 * BUG: `composeStyledFromNode` picked `captured.pageRules[0]` — the FIRST `@page`
 * rule found in `document.styleSheets` order. In the real app, `app/theme.css`'s
 * document-wide fallback (`@page { margin: 1cm; }`, imported at app startup —
 * `main.tsx`) is always captured before any form's own, later-mounted `@page` rule
 * (e.g. `FormLayout`'s dynamic margins, or a print-templates CSS Module's `@page`).
 * "First found" silently resurrected the generic fallback over the form's real
 * geometry — Exact Preview then paginated differently from the physical printout
 * and the PDF export, BOTH of which apply the form's own rule directly (the real
 * browser print engine via normal cascade order, and `formPdfDocument.ts`'s own
 * `@page` built straight from `FormLayout`'s margins, bypassing this capture path
 * entirely).
 *
 * FIX: reconcile ALL captured `@page` rules with `mergePageRules` — later
 * declarations win PER PROPERTY, mirroring how the browser itself resolves
 * multiple `@page` rules of equal specificity. This affects every page that
 * composes its Exact Preview via the default `composeStyledFromNode` path
 * (PaymentVoucher, Resignation, ReturnToWork, SalaryAdvance, SalaryCertificate,
 * ToWhomItMayConcern, PurchaseRequest, EmployeeWarning, LeaveRequest,
 * PerformanceEvaluation, EmploymentContract, Quotation) uniformly — it is an
 * engine-level fix, not a per-form workaround.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mergePageRules, capturePrintStyles, composeStyledFromNode } from '../printing';
import { getPageSpec } from '../printing/pageSpec';

describe('mergePageRules — property-level cascade merge', () => {
  it('returns null for an empty input (nothing captured)', () => {
    expect(mergePageRules([])).toBeNull();
  });

  it('re-serializes a single rule unchanged (no merge needed)', () => {
    const merged = mergePageRules(['@page { size: A4; margin: 0; }']);
    expect(merged).toContain('size: A4');
    expect(merged).toContain('margin: 0');
    expect((merged?.match(/@page/g) ?? []).length).toBe(1);
  });

  it('a later rule overrides an earlier rule for the SAME property', () => {
    const merged = mergePageRules([
      '@page { margin: 1cm; }', // theme.css-style generic fallback, captured first
      '@page { size: A4; margin: 5mm 15mm 12mm 15mm; }', // form-specific, captured later
    ]);
    expect(merged).toContain('margin: 5mm 15mm 12mm 15mm');
    expect(merged).not.toContain('1cm');
  });

  it('does NOT drop a property only an EARLIER rule declared (proves this is a merge, not "last rule wins")', () => {
    // The earlier rule declares `size`; the later, "winning" rule only overrides
    // `margin` and never re-states `size`. A naive "replace with the last full rule
    // text" fix would silently lose `size: A4` here — property-level merge must not.
    const merged = mergePageRules([
      '@page { size: A4; margin: 20mm; }',
      '@page { margin: 5mm; }',
    ]);
    expect(merged).toContain('size: A4');
    expect(merged).toContain('margin: 5mm');
    expect(merged).not.toContain('20mm');
  });

  it('chains across 3+ rules — the LAST value per property always wins', () => {
    const merged = mergePageRules([
      '@page { margin: 1cm; }',
      '@page { margin: 8mm; }',
      '@page { size: A4; margin: 5mm; }',
    ]);
    expect(merged).toContain('size: A4');
    expect(merged).toContain('margin: 5mm');
    expect(merged).not.toContain('1cm');
    expect(merged).not.toContain('8mm');
  });

  it('matches property names case-insensitively', () => {
    const merged = mergePageRules(['@page { SIZE: A4; }', '@page { Margin: 5mm; }']);
    expect(merged).toContain('size: A4');
    expect(merged).toContain('margin: 5mm');
  });
});

describe('composeStyledFromNode — Exact Preview uses the form\'s @page, not an earlier generic fallback', () => {
  let styleEls: HTMLStyleElement[] = [];

  function addSheet(css: string): HTMLStyleElement {
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    styleEls.push(el);
    return el;
  }

  afterEach(() => {
    styleEls.forEach((el) => el.remove());
    styleEls = [];
    document.body.innerHTML = '';
  });

  it('reproduces the reported bug scenario: theme.css-style @page loaded first, form @page mounted later — the FORM margins win', () => {
    // 1) App-startup-style global fallback — same shape as app/theme.css's real rule.
    addSheet('@media print { @page { margin: 1cm; } }');

    // 2) The printable node's own scoped class, styled by a later-mounted stylesheet
    //    (same shape as FormLayout's own inline <style>, mounted only once the form
    //    page renders — i.e. always AFTER the app-wide stylesheet in document order).
    // Margins are 4 DISTINCT values on purpose: jsdom's CSSOM canonicalizes a
    // symmetric 4-value shorthand (left === right) down to 3 values on read-back,
    // which is correct, equivalent CSS but would make this assertion fragile for
    // the wrong reason. Distinct values sidestep that entirely.
    const formCss = `
      .form-page { padding: 0; }
      @media print {
        @page { size: A4; margin: 5mm 16mm 12mm 17mm; }
      }
    `;
    addSheet(formCss);

    const node = document.createElement('div');
    node.className = 'form-page';
    node.textContent = 'سند صرف';
    document.body.appendChild(node);

    const html = composeStyledFromNode({
      node,
      pageSpec: getPageSpec('a4-portrait'), // 12mm uniform — must NOT win either
      title: 'سند صرف',
      lang: 'ar',
    });

    const pageMatches = html.match(/@page\s*\{[^}]*\}/g) ?? [];
    expect(pageMatches.length).toBe(1); // still exactly one @page, never more
    expect(pageMatches[0]).toContain('5mm 16mm 12mm 17mm'); // the form's real margins
    // NOTE: not asserting `size: A4` survives here — jsdom's CSSOM does not support
    // the @page `size` descriptor at all (verified directly: `capturePrintStyles`
    // captures `@page { size: A4; margin: ...; }` as just `@page { margin: ...; }`
    // in jsdom, regardless of this fix). That is a jsdom/test-environment gap, not
    // a real-browser one — Chromium (both the physical print path and Electron's
    // hidden PDF window) fully supports `size` and this fix's *string-level*
    // property preservation is proven directly by the `mergePageRules` unit tests
    // above, which operate on rule text and are unaffected by jsdom's CSSOM.
    expect(html).not.toMatch(/@page[^{]*\{[^}]*margin:\s*1cm/); // the generic fallback lost
    expect(html).not.toMatch(/@page[^{]*\{[^}]*margin:\s*12mm/); // not the PageSpec default either
  });

  it('sanity: capturePrintStyles still returns pageRules in raw document order (capture itself is unchanged — only how composeDocument consumes it changed)', () => {
    addSheet('@media print { @page { margin: 1cm; } }');
    addSheet('@media print { @page { size: A4; margin: 5mm; } }');
    const { pageRules } = capturePrintStyles(document);
    expect(pageRules.length).toBe(2);
    expect(pageRules[0]).toContain('1cm');
    expect(pageRules[1]).toContain('5mm');
  });
});
