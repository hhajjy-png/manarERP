// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { absolutizeUrls, composeStyledFromNode, getPageSpec } from '../printing';

/**
 * Source assertions judge CODE, not the prose about it — several of these files
 * legitimately NAME the defect they fixed in a comment.
 */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');
}

/**
 * PHASE 2B — CORRECTIVE. Two blocking defects, confirmed manually.
 *
 * DEFECT 1: the Print Center's Print button printed the VISIBLE APPLICATION WINDOW
 *           (sidebar, toolbar, the Print Center dialog itself) instead of the document,
 *           because it went through the Phase 1 gateway (print:submit ->
 *           webContents.print() on the visible window).
 *
 * DEFECT 2: monetary values changed appearance (10,395.000 KWD -> KWD 10 395 000).
 *           ROOT CAUSE: the built CSS references its fonts RELATIVELY
 *           (`url(./IBMPlexSansArabic-Regular-*.woff2)`). The composed document is
 *           written to a PRIVATE TEMP DIRECTORY, so every font URL 404'd and the hidden
 *           window fell back to a system font with different metrics. The TEXT was never
 *           wrong — the FONT was missing.
 */

const APP_CSS = `
@font-face { font-family: "IBM Plex Sans Arabic"; src: url(./IBMPlexSansArabic-Regular-DHf6Regc.woff2) format("woff2"); }
@font-face { font-family: "Cairo"; src: url("./Cairo-Regular-abc123.woff2") format("woff2"); }
.logo { background-image: url(./almanar-logo-xyz.png); }
._amount_h4sh { direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums; }
.inline-data { background: url(data:image/png;base64,AAA); }
@media print { @page { size: A4; margin: 8mm 10mm; } .no-print { display: none !important; } }
`;

let sheet: HTMLStyleElement;

beforeEach(() => {
  sheet = document.createElement('style');
  sheet.textContent = APP_CSS;
  document.head.appendChild(sheet);
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'ar');
  document.body.className = 'app-shell';
});

afterEach(() => {
  sheet.remove();
  document.body.innerHTML = '';
  document.body.className = '';
});

/** An invoice root carrying a real monetary amount, plus chrome that must not print. */
function invoiceRoot(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'inv-wrap';
  const toolbar = document.createElement('div');
  toolbar.className = 'no-print';
  toolbar.textContent = 'TOOLBAR-SIDEBAR-TEMPLATE-SELECTOR';
  const dialog = document.createElement('div');
  dialog.className = 'pc-scrim'; // the Print Center shell itself
  dialog.textContent = 'PRINT-CENTER-DIALOG';
  const amount = document.createElement('span');
  amount.className = '_amount_h4sh';
  amount.textContent = '10,395.000 KWD';
  root.append(toolbar, dialog, amount);
  document.body.appendChild(root);
  return root;
}

const compose = (node: HTMLElement) =>
  composeStyledFromNode({
    node,
    pageSpec: getPageSpec('a4-portrait'),
    title: 'فاتورة 123',
    lang: 'ar',
    stripSelectors: ['.no-print'],
  });

// ── DEFECT 2 — monetary fidelity ────────────────────────────────────────────────
describe('Defect 2 — monetary formatting', () => {
  it('the amount TEXT is unchanged through capture and composition', () => {
    const root = invoiceRoot();
    const live = root.querySelector('._amount_h4sh')!.textContent;
    expect(live).toBe('10,395.000 KWD'); // legacy rendered DOM — correct

    const html = compose(root);
    // …and the composed document carries the SAME string. The formatter was never the
    // problem, so it was not touched.
    expect(html).toContain('10,395.000 KWD');
    expect(html).not.toContain('KWD 10 395 000');
  });

  /**
   * These assert `absolutizeUrls` DIRECTLY rather than through jsdom's CSSOM: jsdom does
   * not parse `@font-face { src: url(...) }` into cssText, so a capture-level assertion
   * here would be testing jsdom, not the fix. The rewriter is where the bug lived.
   */
  it('ROOT CAUSE FIX: relative font urls are made absolute so the fonts actually load', () => {
    const base = 'file:///C:/app/frontend/dist/assets/index-abc.css';
    const out = absolutizeUrls(APP_CSS, base);

    // Before the fix these stayed `url(./IBMPlexSansArabic-…woff2)`, which resolved
    // against the composed file's PRIVATE TEMP DIRECTORY and 404'd — killing every web
    // font and changing the glyph metrics of every monetary amount.
    expect(out).not.toContain('url(./');
    expect(out).not.toContain('url("./');
    expect(out).toContain('file:///C:/app/frontend/dist/assets/IBMPlexSansArabic-Regular-DHf6Regc.woff2');
    expect(out).toContain('file:///C:/app/frontend/dist/assets/Cairo-Regular-abc123.woff2');
    // Images too — the company logo would otherwise vanish from the invoice.
    expect(out).toContain('file:///C:/app/frontend/dist/assets/almanar-logo-xyz.png');

    // Every url() is now absolute or a data: URI.
    for (const m of out.match(/url\([^)]*\)/g) ?? []) {
      expect(m).toMatch(/url\(\s*['"]?(data:|https?:|file:|blob:)/i);
    }
  });

  it('leaves data: URIs alone — they are already self-contained', () => {
    const out = absolutizeUrls(APP_CSS, 'file:///C:/app/x.css');
    expect(out).toContain('url(data:image/png;base64,AAA)');
  });

  it('leaves an already-absolute url and an unresolvable one intact', () => {
    const base = 'file:///C:/app/x.css';
    expect(absolutizeUrls('a{background:url(file:///C:/y.png)}', base)).toContain('file:///C:/y.png');
    expect(absolutizeUrls('a{background:url(#grad)}', base)).toContain('url(#grad)');
  });

  it('carries the amount’s own bidi/numeric rules, so KWD cannot reorder', () => {
    const html = compose(invoiceRoot());
    expect(html).toContain('._amount_h4sh');
    expect(html).toContain('unicode-bidi: isolate');
    expect(html).toContain('direction: ltr');
    expect(html).toContain('font-variant-numeric: tabular-nums');
  });

  it('reproduces the SOURCE root context (dir/lang/body class) instead of inventing one', () => {
    const html = compose(invoiceRoot());
    expect(html).toContain('dir="rtl"'); // copied from the live <html>
    expect(html).toContain('lang="ar"');
    expect(html).toContain('class="app-shell"'); // body classes inherited as on screen
    expect(html).toContain('<base href='); // relative refs in the MARKUP resolve too
  });

  it('does NOT introduce a Print-Center-only monetary formatter', () => {
    const src = codeOf('src/printing/composeDocument.ts');
    const cap = codeOf('src/printing/styleCapture.ts');
    for (const s of [src, cap]) {
      expect(s).not.toContain('NumberFormat');
      expect(s).not.toContain('toLocaleString');
      expect(s).not.toContain('KWD');
    }
  });
});

// ── DEFECT 1 / Part C — printable-root isolation ─────────────────────────────────
describe('Defect 1 (Part C) — printable-root isolation', () => {
  it('strips the Print Center shell and all screen-only chrome from the clone', () => {
    const html = compose(invoiceRoot());
    expect(html).not.toContain('PRINT-CENTER-DIALOG'); // .pc-scrim removed
    expect(html).not.toContain('TOOLBAR-SIDEBAR-TEMPLATE-SELECTOR'); // .no-print removed
    expect(html).toContain('10,395.000 KWD'); // the document itself survives
  });

  it('never mutates the live DOM while stripping', () => {
    const root = invoiceRoot();
    compose(root);
    expect(root.querySelector('.no-print')).not.toBeNull();
    expect(root.querySelector('.pc-scrim')).not.toBeNull();
    expect(root.hasAttribute('data-print-root')).toBe(false);
  });

  it('mounts the Print Center dialog OUTSIDE the printable root on both pages', () => {
    const quotation = readFileSync('src/pages/Quotation.tsx', 'utf8');
    const invoice = readFileSync('src/pages/InvoicePreview.tsx', 'utf8');
    for (const src of [quotation, invoice]) {
      const dialogAt = src.indexOf('<PrintCenterDialog');
      const rootAt = src.indexOf('ref={printRootRef}');
      expect(dialogAt).toBeGreaterThan(-1);
      expect(rootAt).toBeGreaterThan(-1);
      expect(dialogAt).toBeLessThan(rootAt); // dialog precedes — and is not nested in — the root
    }
  });
});

// ── DEFECT 1 — the physical print artifact ──────────────────────────────────────
describe('Defect 1 — Print prints the cached PDF artifact, not the visible window', () => {
  // Comment-stripped: these files legitimately NAME the defect they fixed in prose.
  const dialog = codeOf('src/printing/components/PrintCenterDialog.tsx');
  const hook = codeOf('src/printing/usePrintCenter.ts');
  const preview = codeOf('../electron/services/previewService.ts');
  const preload = codeOf('../electron/preload.ts');

  it('the Print Center NEVER uses the visible-window print path', () => {
    // The Phase 1 gateway prints the visible BrowserWindow — that WAS the defect.
    expect(dialog).not.toContain('submitPrintJob');
    expect(dialog).not.toContain('createPrintJob');
    expect(dialog).not.toContain('printCurrentView');
    expect(hook).not.toContain('submitPrintJob');
    expect(hook).not.toContain('printCurrentView');
  });

  it('the Print button routes to the dedicated print-artifact IPC with the preview token', () => {
    expect(dialog).toContain('printArtifact(copies)');
    expect(hook).toContain('window.manar?.printArtifact');
    expect(hook).toContain('token,');
    expect(hook).toContain('contractVersion: PRINT_CONTRACT_VERSION');
    expect(preload).toContain("ipcRenderer.invoke('print:printArtifact'");
  });

  it('main validates the token, the contract and copies, and fails on an expired token', () => {
    expect(preview).toContain("ipcMain.handle('print:printArtifact'");
    expect(preview).toContain('contractVersion !== SUPPORTED_CONTRACT');
    expect(preview).toContain('artifacts.get(r.token)');
    expect(preview).toContain('انتهت صلاحية المعاينة'); // expired/released token fails safely
    expect(preview).toMatch(/copies < 1 \|\| r\.copies > 99/);
  });

  it('prints the EXACT cached bytes in an isolated hidden surface — not a re-render', () => {
    expect(preview).toContain('artifact.pdf'); // the cached buffer, written to a temp PDF
    expect(preview).toContain('plugins: true'); // Chromium PDF viewer renders the PDF
    expect(preview).toContain('sandbox: true');
    expect(preview).toContain('contextIsolation: true');
    expect(preview).toContain('nodeIntegration: false');
    // Never rasterised, never regenerated, never sourced from the PDF.js canvas.
    expect(preview).not.toContain('toDataURL');
    expect(preview).not.toContain('canvas');
  });

  it('one print call, native copies, silent stays false, one OS dialog', () => {
    const block = preview.slice(preview.indexOf("ipcMain.handle('print:printArtifact'"));
    expect((block.match(/webContents\.print\(/g) ?? []).length).toBe(1);
    expect(block).toContain('silent: false');
    expect(block).not.toContain('silent: true');
    expect(block).toMatch(/copies \? \{ copies \}/);
    expect(block).not.toMatch(/for\s*\(|setTimeout/); // no copy loop
  });

  it('destroys the hidden surface and deletes the temp PDF on EVERY path', () => {
    const block = preview.slice(preview.indexOf("ipcMain.handle('print:printArtifact'"));
    expect(block).toContain('} finally {');
    expect(block).toContain('win.destroy()');
    expect(block).toContain('unlink(tmpPdf)');
    expect(block).toContain('mode: 0o600'); // restrictive permissions on the temp PDF
  });

  it('printing does NOT consume the artifact — reprint and Save PDF still work', () => {
    const block = preview.slice(
      preview.indexOf("ipcMain.handle('print:printArtifact'"),
      preview.indexOf("ipcMain.handle('print:releasePreview'"),
    );
    expect(block).not.toContain('artifacts.delete'); // only releasePreview / shutdown free it
  });

  it('never falls back to printing the visible window when the bridge is absent', () => {
    expect(hook).toContain('الطباعة غير متاحة في هذا الوضع'); // fails; does not degrade
  });

  it('emits exactly ONE PRINT event, with the requested copies; cancel is not success', () => {
    const fn = hook.slice(hook.indexOf('const printArtifact'), hook.indexOf('const savePdf'));
    expect((fn.match(/recordPrintEvent\(/g) ?? []).length).toBe(1);
    expect(fn).toContain("action: 'PRINT'");
    expect(fn).toContain('copies: n');
    expect(fn).toContain('status,'); // canceled recorded as canceled, failed as failed
    // A suppressed double-click returns before the audit line.
    expect(fn).toContain("if (printingRef.current) return 'canceled'");
  });
});

// ── Regression ──────────────────────────────────────────────────────────────────
describe('Corrective — regression', () => {
  it('Receipt Voucher, Forms and the Phase 1 gateway are unchanged', () => {
    const rcv = readFileSync('src/pages/ReceiptVoucher.tsx', 'utf8');
    expect(rcv).toContain('submitPrintJob('); // RV still uses the Phase 1 path (flag OFF)
    const form = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(form).toContain('submitPrintJob('); // native copies fix intact
    const gw = readFileSync('src/printing/printCenter.ts', 'utf8');
    expect(gw).toContain('export async function submitPrintJob'); // gateway still exists
  });

  it('cheques, Reports and PDFKit remain untouched', () => {
    const cheques = readFileSync('src/pages/Cheques.tsx', 'utf8');
    expect(cheques).not.toMatch(/from\s+['"][^'"]*\/printing['"]/);
    expect(cheques).toContain('const CHEQUE_PAGE_OFFSET_Y_MM: number = 40;');
    const routes = readFileSync('../backend/src/modules/reports/reports.routes.ts', 'utf8');
    expect(routes).toContain('buildPdf'); // PDFKit not retired
  });

  it('Invoice and Quotation flags remain OFF by default', () => {
    const flags = readFileSync('src/printing/flags.ts', 'utf8');
    expect(flags).toMatch(/PRINT_CENTER_PHASE2_INVOICE:\s*false/);
    expect(flags).toMatch(/PRINT_CENTER_PHASE2_QUOTATION:\s*false/);
  });

  it('no Prisma migration, no silent printing, no batch printing', () => {
    const schema = readFileSync('../backend/prisma/schema.prisma', 'utf8');
    expect(schema).not.toMatch(/model\s+PrintLog\b/i);
    const svc = readFileSync('../electron/services/printService.ts', 'utf8');
    expect(svc).not.toContain('silent: true');
  });
});

describe('no mocks', () => {
  it('runs against the real modules', () => {
    expect(vi.isMockFunction(composeStyledFromNode)).toBe(false);
  });
});
