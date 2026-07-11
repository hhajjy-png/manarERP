// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  capturePrintStyles,
  composeStyledFromNode,
  getPageSpec,
  isFlagEnabled,
  isPhase2Enabled,
  setFlagOverride,
  PRINT_CENTER_PHASE2,
  PRINT_CENTER_PHASE2_INVOICE,
  PRINT_CENTER_PHASE2_QUOTATION,
} from '../printing';

/**
 * PHASE 2B FIDELITY.
 *
 * Invoice and Quotation carry their styling in STYLESHEETS (CSS Modules, Template
 * Studio, designer overrides), not inline. `cloneNode()` copies markup, not CSS — so the
 * single failure mode that matters is a composed document that has the right text and NO
 * LAYOUT. These tests exist to make that failure impossible to ship silently.
 */

/** A stylesheet that stands in for the real print-templates CSS Modules bundle. */
const TEMPLATE_CSS = `
:root { --brand: #1d4e6f; --paper: #ffffff; }
@font-face { font-family: 'Cairo'; src: url(data:font/ttf;base64,AAAA) format('truetype'); }
._invoiceRoot_a1b2c3 { color: var(--brand); direction: rtl; }
._invoiceRoot_a1b2c3 .totals { font-weight: 700; }
._invoiceRoot_a1b2c3 .row::after { content: ''; display: block; }
._qrBlock_x9y8z7 { width: 90px; }
.tplStudioEl { position: absolute; }
.designer-override { letter-spacing: .2px; }
table { page-break-inside: avoid; }
@media print {
  @page { size: A4; margin: 0; }
  .no-print { display: none !important; }
  .engine-hide-legacy { display: none !important; }
  ._invoiceRoot_a1b2c3 { box-shadow: none !important; }
}
@media (prefers-color-scheme: dark) {
  :root { --paper: #0f172a; }
  ._invoiceRoot_a1b2c3 { background: #0f172a; color: #e2e8f0; }
}
`;

/** The application shell stylesheet — present in the document, must not break anything. */
const SHELL_CSS = `.xpl-sidebar { width: 240px; } .xpl-topbar { height: 56px; }`;

let styleEls: HTMLStyleElement[] = [];

function addSheet(css: string): void {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
  styleEls.push(el);
}

function renderedNode(): HTMLElement {
  const root = document.createElement('div');
  root.className = '_invoiceRoot_a1b2c3';
  root.style.boxShadow = '0 2px 12px rgba(0,0,0,.07)';
  root.style.transform = 'scale(0.65)';
  const body = document.createElement('div');
  body.innerHTML =
    '<div class="no-print">toolbar</div>' +
    '<div class="row totals">1,250.000 KWD</div>' +
    '<div class="_qrBlock_x9y8z7"></div>' +
    '<div class="tplStudioEl"></div>' +
    '<div class="designer-override"></div>';
  root.appendChild(body);
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  // Cascade order matters: shell first, template second.
  addSheet(SHELL_CSS);
  addSheet(TEMPLATE_CSS);
});

afterEach(() => {
  styleEls.forEach((el) => el.remove());
  styleEls = [];
  document.body.innerHTML = '';
  setFlagOverride(PRINT_CENTER_PHASE2_INVOICE, null);
  setFlagOverride(PRINT_CENTER_PHASE2_QUOTATION, null);
  setFlagOverride(PRINT_CENTER_PHASE2, null);
});

const compose = (node: HTMLElement, lang: 'ar' | 'en' = 'ar') =>
  composeStyledFromNode({
    node,
    pageSpec: getPageSpec('a4-portrait'),
    title: 'فاتورة 123',
    lang,
    stripSelectors: ['.no-print'],
  });

describe('Phase 2B — style capture', () => {
  it('captures rules in original cascade order', () => {
    const { css, ruleCount } = capturePrintStyles(document);
    expect(ruleCount).toBeGreaterThan(0);
    expect(css.indexOf('.xpl-sidebar')).toBeLessThan(css.indexOf('_invoiceRoot_a1b2c3'));
  });

  it('hoists @page out of the captured CSS and reports it separately', () => {
    const { css, pageRules } = capturePrintStyles(document);
    expect(pageRules.length).toBe(1);
    expect(pageRules[0]).toMatch(/@page[^{]*\{[^}]*margin:\s*0/);
    expect(css).not.toContain('@page'); // hoisted — so it can be emitted exactly once
  });

  it('drops dark-scheme blocks so the paper stays light under app dark mode', () => {
    const { css } = capturePrintStyles(document);
    expect(css).not.toContain('prefers-color-scheme: dark');
    expect(css).not.toContain('#0f172a'); // the dark repaint never reaches the page
  });

  it('reports zero rules when there is nothing to capture (the fail-loud signal)', () => {
    styleEls.forEach((el) => el.remove());
    styleEls = [];
    expect(capturePrintStyles(document).ruleCount).toBe(0);
  });
});

describe('Phase 2B — composed document fidelity', () => {
  it('carries the CSS Module hashed class names from the rendered node', () => {
    const html = compose(renderedNode());
    // The single most important assertion in this file: without these, the PDF has text
    // and no layout.
    expect(html).toContain('_invoiceRoot_a1b2c3'); // in the markup
    expect(html).toContain('._invoiceRoot_a1b2c3'); // and in the CSS
    expect(html).toContain('_qrBlock_x9y8z7'); // QR styles
  });

  it('carries pseudo-element, Template Studio, designer-override and page-break rules', () => {
    const html = compose(renderedNode());
    expect(html).toContain('._invoiceRoot_a1b2c3 .row::after'); // selector-matching would drop this
    expect(html).toContain('.tplStudioEl');
    expect(html).toContain('.designer-override');
    expect(html).toContain('page-break-inside: avoid');
  });

  it('carries @font-face and CSS custom properties', () => {
    const html = compose(renderedNode());
    expect(html).toContain('@font-face');
    expect(html).toContain('--brand');
  });

  it('retains @media print rules (printToPDF honours them, so .no-print stays hidden)', () => {
    const html = compose(renderedNode());
    expect(html).toContain('@media print');
    expect(html).toContain('.no-print');
  });

  it('emits @page EXACTLY once, and the TEMPLATE’s wins over the PageSpec', () => {
    const html = compose(renderedNode());
    const pages = html.match(/@page/g) ?? [];
    expect(pages.length).toBe(1);
    // The template declares margin:0 — the invoice's existing geometry is preserved and
    // the PageSpec's 12mm default is NOT emitted.
    expect(html).toMatch(/@page[^{]*\{[^}]*margin:\s*0/);
    expect(html).not.toMatch(/@page[^{]*\{[^}]*12mm/);
  });

  it('strips screen-only chrome and the preview surface’s framing', () => {
    const html = compose(renderedNode());
    expect(html).not.toContain('toolbar'); // .no-print removed from the clone
    expect(html).toContain('transform: none !important'); // the 65% preview zoom neutralised
    expect(html).toContain('box-shadow: none !important');
  });

  it('never mutates the live DOM', () => {
    const node = renderedNode();
    compose(node);
    expect(node.hasAttribute('data-print-root')).toBe(false); // marker went on the clone
    expect(node.querySelector('.no-print')).not.toBeNull(); // toolbar still on screen
    expect(node.style.transform).toBe('scale(0.65)'); // on-screen styling untouched
  });

  it('preserves direction: RTL for Arabic, LTR for English', () => {
    expect(compose(renderedNode(), 'ar')).toContain('dir="rtl"');
    document.body.innerHTML = '';
    expect(compose(renderedNode(), 'en')).toContain('dir="ltr"');
  });

  it('has no EXTERNAL dependency — no CDN, no remote stylesheet, no third-party host', () => {
    const html = compose(renderedNode());

    // No CDN, ever.
    for (const cdn of ['cdnjs', 'unpkg', 'jsdelivr', 'googleapis', 'gstatic', 'cloudflare']) {
      expect(html).not.toContain(cdn);
    }

    // The document may reference the APPLICATION'S OWN origin — that is the point of the
    // <base href> and of absolutising url(): in production the app is served from
    // file://, in dev from http://localhost, and the fonts/logos must resolve. What must
    // never appear is a host that is not ours.
    const hosts = [...html.matchAll(/https?:\/\/([^/"')\s]+)/g)].map((m) => m[1]);
    for (const host of hosts) {
      expect(host).toMatch(/^(localhost|127\.0\.0\.1)(:\d+)?$/);
    }
  });

  it('forces a light paper surface regardless of the application theme', () => {
    const html = compose(renderedNode());
    expect(html).toContain('color-scheme: light');
    expect(html).toContain('background: #fff !important');
  });
});

describe('Phase 2B — fails loudly rather than shipping an unstyled document', () => {
  it('THROWS when no stylesheet rules can be captured', () => {
    const node = renderedNode();
    styleEls.forEach((el) => el.remove()); // simulate total capture failure
    styleEls = [];
    expect(() => compose(node)).toThrow(/أنماط المستند/);
  });

  it('THROWS when a stylesheet is unreadable, rather than composing partial CSS', () => {
    const node = renderedNode();
    const bad = document.createElement('link');
    bad.rel = 'stylesheet';
    bad.href = 'https://cdn.example.com/x.css'; // cross-origin — must never be silently skipped
    document.head.appendChild(bad);
    try {
      Object.defineProperty(bad, 'sheet', {
        get: () => ({ href: 'https://cdn.example.com/x.css', cssRules: null }),
      });
      const { problems } = capturePrintStyles(document);
      if (problems.length > 0) expect(() => compose(node)).toThrow(/أنماط المستند/);
    } finally {
      bad.remove();
    }
  });
});

describe('Phase 2B — feature flags default OFF', () => {
  it('invoice and quotation ship OFF — a style-capture risk can never auto-enable them', () => {
    expect(isFlagEnabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(false);
    expect(isFlagEnabled(PRINT_CENTER_PHASE2_QUOTATION)).toBe(false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_QUOTATION)).toBe(false);
  });

  it('require BOTH the master flag and their own', () => {
    setFlagOverride(PRINT_CENTER_PHASE2_INVOICE, true);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(true);
    setFlagOverride(PRINT_CENTER_PHASE2, false); // master kill switch
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(false);
  });
});

// ── Scope + regression: renderers reused, nothing else touched. ──────────────────
describe('Phase 2B — scope discipline', () => {
  const invoice = readFileSync('src/pages/InvoicePreview.tsx', 'utf8');
  const quotation = readFileSync('src/pages/Quotation.tsx', 'utf8');

  it('reuses the EXISTING renderers — no template duplication, no second React app', () => {
    // Both pages still drive the existing print-templates engine.
    expect(invoice).toContain('usePrintTemplate');
    expect(invoice).toContain('EngineComponent');
    expect(quotation).toContain('usePrintTemplate');
    expect(quotation).toContain('TemplateStudioRenderer');
    // The Print Center composes from the rendered node; it does not render.
    expect(invoice).toContain('composeStyledFromNode');
    expect(quotation).toContain('composeStyledFromNode');
    for (const src of [invoice, quotation]) {
      expect(src).not.toContain('createRoot'); // no second React app
      expect(src).not.toContain('renderToString'); // no independent re-render
    }
  });

  it('keeps the legacy print path on both pages', () => {
    for (const src of [invoice, quotation]) {
      expect(src).toContain('printCurrentView()');
      expect(src).toContain('isPhase2Enabled(');
    }
  });

  it('leaves the existing @page rules on both pages untouched', () => {
    expect(invoice).toContain('@page { size: A4; margin: 8mm 10mm; }');
    expect(quotation).toContain('@page { size: A4; margin: 0; }');
  });

  it('did not touch cheques, Reports or PDFKit', () => {
    const cheques = readFileSync('src/pages/Cheques.tsx', 'utf8');
    expect(cheques).not.toMatch(/from\s+['"][^'"]*\/printing['"]/);
    expect(cheques).toContain('const CHEQUE_PAGE_OFFSET_Y_MM: number = 40;');

    const reports = readFileSync('src/pages/Reports.tsx', 'utf8');
    expect(reports).not.toMatch(/from\s+['"][^'"]*\/printing['"]/); // Reports NOT migrated

    // PDFKit is still wired exactly as before — not retired in this phase.
    const routes = readFileSync('../backend/src/modules/reports/reports.routes.ts', 'utf8');
    expect(routes).toContain('buildPdf');
  });

  it('did not add silent printing, batch printing, queues or a Prisma migration', () => {
    const svc = readFileSync('../electron/services/printService.ts', 'utf8');
    expect(svc).not.toContain('silent: true');
    const schema = readFileSync('../backend/prisma/schema.prisma', 'utf8');
    expect(schema).not.toMatch(/model\s+PrintLog\b/i);
  });

  it('Receipt Voucher and Forms are unchanged by this phase', () => {
    const rcv = readFileSync('src/pages/ReceiptVoucher.tsx', 'utf8');
    expect(rcv).toContain('PRINT_CENTER_PHASE2_RECEIPT_VOUCHER');
    expect(rcv).toContain('composeFromNode'); // still the inline-style composer
    const form = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(form).toContain('submitPrintJob('); // native copies fix intact
  });
});
