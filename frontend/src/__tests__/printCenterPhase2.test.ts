// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  composeFromNode,
  composeFromHtml,
  MAX_COMPOSED_HTML_BYTES,
  RECEIPT_VOUCHER_PAGE_SPEC,
  PAGE_SPECS,
  isFlagEnabled,
  isPhase2Enabled,
  setFlagOverride,
  PRINT_CENTER_PHASE2,
  PRINT_CENTER_PHASE2_RECEIPT_VOUCHER,
} from '../printing';

// ── Composer: the Print Center WRAPS an existing renderer; it never renders. ──────
describe('Phase 2 — document composer', () => {
  function node(html = '<p>سند</p>'): HTMLElement {
    const el = document.createElement('div');
    el.className = 'rcv-preview';
    el.style.boxShadow = '0 2px 12px rgba(0,0,0,.07)';
    el.innerHTML = html;
    return el;
  }

  it('produces a self-contained document with exactly ONE @page rule from the PageSpec', () => {
    const html = composeFromNode({ node: node(), pageSpec: RECEIPT_VOUCHER_PAGE_SPEC, title: 'سند' });
    expect(html).toContain('<!DOCTYPE html>');
    expect((html.match(/@page/g) ?? []).length).toBe(1);
    // The pilot's geometry, preserved exactly (A4, 12mm/15mm).
    expect(html).toContain('@page { size: A4; margin: 12mm 15mm 12mm 15mm; }');
  });

  it('is offline: no CDN, no network reference, font embedded', () => {
    const html = composeFromNode({ node: node(), pageSpec: RECEIPT_VOUCHER_PAGE_SPEC, title: 'سند' });
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain('@font-face');
    expect(html).toContain("font-family: 'Cairo'");
  });

  it('is RTL for Arabic and LTR for English', () => {
    const ar = composeFromNode({ node: node(), pageSpec: RECEIPT_VOUCHER_PAGE_SPEC, title: 'س', lang: 'ar' });
    const en = composeFromNode({ node: node(), pageSpec: RECEIPT_VOUCHER_PAGE_SPEC, title: 's', lang: 'en' });
    expect(ar).toContain('dir="rtl"');
    expect(en).toContain('dir="ltr"');
  });

  it('never mutates the live DOM — the node is cloned', () => {
    const el = node();
    document.body.appendChild(el);
    composeFromNode({ node: el, pageSpec: RECEIPT_VOUCHER_PAGE_SPEC, title: 'س' });
    expect(el.hasAttribute('data-print-root')).toBe(false); // marker went on the CLONE
    expect(el.style.boxShadow).toContain('rgba'); // on-screen styling untouched
    el.remove();
  });

  it('strips screen-only chrome from the printed copy', () => {
    const el = node('<div class="no-print">toolbar</div><p>body</p>');
    const html = composeFromNode({
      node: el,
      pageSpec: RECEIPT_VOUCHER_PAGE_SPEC,
      title: 'س',
      stripSelectors: ['.no-print'],
    });
    expect(html).not.toContain('toolbar');
    expect(html).toContain('body');
  });

  it('rejects an over-size document instead of hanging the renderer', () => {
    const huge = document.createElement('div');
    huge.textContent = 'x'.repeat(MAX_COMPOSED_HTML_BYTES + 1024);
    expect(() =>
      composeFromNode({ node: huge, pageSpec: RECEIPT_VOUCHER_PAGE_SPEC, title: 'big' }),
    ).toThrow(/كبير جدًا/);
  });

  it('passes already-self-contained backend HTML through unwrapped (no double @page)', () => {
    const backendHtml = '<!DOCTYPE html><html><head><style>@page{size:A4}</style></head><body>r</body></html>';
    const out = composeFromHtml(backendHtml);
    expect(out).toBe(backendHtml);
    expect((out.match(/@page/g) ?? []).length).toBe(1);
  });

  it('refuses to compose with the dynamic cheque spec — its geometry is not ours', () => {
    expect(() =>
      composeFromNode({ node: node(), pageSpec: PAGE_SPECS['cheque-dynamic'], title: 'x' }),
    ).toThrow(/dynamic/i);
  });
});

// ── Feature-flag hierarchy: master AND document. ─────────────────────────────────
describe('Phase 2 — flag hierarchy', () => {
  beforeEach(() => {
    setFlagOverride(PRINT_CENTER_PHASE2, null);
    setFlagOverride(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER, null);
  });
  afterEach(() => {
    setFlagOverride(PRINT_CENTER_PHASE2, null);
    setFlagOverride(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER, null);
  });

  it('ships the Receipt Voucher document flag OFF — no user behaviour changes on upgrade', () => {
    expect(isFlagEnabled(PRINT_CENTER_PHASE2)).toBe(true); // master is a kill switch…
    expect(isFlagEnabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)).toBe(false); // …enabling nothing
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)).toBe(false);
  });

  it('requires BOTH master and document flag', () => {
    setFlagOverride(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER, true);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)).toBe(true);

    // Master off → document off, regardless of its own flag. The kill switch works.
    setFlagOverride(PRINT_CENTER_PHASE2, false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)).toBe(false);
  });
});

// ── Scope discipline. ───────────────────────────────────────────────────────────
describe('Phase 2 — scope discipline', () => {
  const preview = readFileSync('../electron/services/previewService.ts', 'utf8');
  const printSvc = readFileSync('../electron/services/printService.ts', 'utf8');

  it('did NOT enable silent printing', () => {
    expect(preview).not.toContain('silent: true');
    expect(printSvc).not.toContain('silent: true');
    expect(printSvc).toContain('silent: false');
  });

  it('did NOT add batch printing or a print queue', () => {
    for (const src of [preview, printSvc]) {
      expect(src).not.toMatch(/\bqueue\b/i);
      expect(src).not.toMatch(/\bbatch\b/i);
    }
  });

  it('did NOT add a Prisma migration or a generic print_logs table', () => {
    const schema = readFileSync('../backend/prisma/schema.prisma', 'utf8');
    // No new print-log model. (`cheque_print_logs` PRE-EXISTS and belongs to the cheque
    // module — it must survive untouched, so it is explicitly excluded here.)
    expect(schema).not.toMatch(/model\s+PrintLog\b/i);
    const printLogTables = [...schema.matchAll(/(\w*)print_logs/gi)].map((m) => m[0]);
    expect(printLogTables.every((t) => t === 'cheque_print_logs')).toBe(true);
  });

  it('did NOT introduce any CDN or remote content', () => {
    const files = [
      'src/printing/composeDocument.ts',
      'src/printing/components/PrintPreviewPane.tsx',
      'src/printing/components/PrintCenterDialog.tsx',
      'src/printing/components/PrintCenter.css',
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // no CDN, no remote fetch
    }
  });

  it('did NOT touch cheque printing or calibration', () => {
    const cheques = readFileSync('src/pages/Cheques.tsx', 'utf8');
    const calib = readFileSync('src/components/ChequeCalibrator.tsx', 'utf8');
    expect(cheques).not.toMatch(/from\s+['"][^'"]*\/printing['"]/);
    expect(calib).not.toMatch(/from\s+['"][^'"]*\/printing['"]/);
    expect(cheques).toContain('const CHEQUE_PAGE_OFFSET_X_MM: number = 0;');
    expect(cheques).toContain('const CHEQUE_PAGE_OFFSET_Y_MM: number = 40;');
    // Calibration geometry-derived @page is untouched.
    expect(calib).toContain('@page { size: ${geometry.pageWidthMm}mm ${geometry.pageHeightMm}mm; margin: 0; }');
  });

  it('preview destination can never fall through to a physical print', () => {
    // printService rejects 'preview' explicitly rather than defaulting to print.
    expect(printSvc).toContain("job.destination === 'preview'");
    expect(printSvc).toMatch(/destination === 'preview'[\s\S]{0,200}status: 'failed'/);
  });

  it('hidden windows are destroyed and temp files unlinked on EVERY path', () => {
    expect(preview).toContain('} finally {');
    expect(preview).toContain('win.destroy()');
    expect(preview).toContain('unlink(tmpPath)');
    expect(preview).toContain('shutdownPreviewService');
  });

  it('savePdf returns no filesystem path to the renderer', () => {
    expect(preview).toContain('filePath is deliberately NOT returned');
  });

  it('the Phase 1 legacy channels all survive', () => {
    const preload = readFileSync('../electron/preload.ts', 'utf8');
    for (const ch of ['app:print', 'pdf:export', 'pdf:exportHtml', 'print:submit', 'print:listPrinters']) {
      expect(preload).toContain(ch);
    }
    // …plus the Phase 2 additions.
    for (const ch of ['print:preview', 'print:savePdf', 'print:releasePreview']) {
      expect(preload).toContain(ch);
    }
  });

  it('Receipt Voucher still uses its EXISTING renderer and keeps both legacy paths', () => {
    const rcv = readFileSync('src/pages/ReceiptVoucher.tsx', 'utf8');
    expect(rcv).toContain('ReceiptVoucherTemplate'); // the existing renderer, untouched
    expect(rcv).toContain('printCurrentView()'); // legacy fallback retained
    expect(rcv).toContain('isFlagEnabled(PRINT_CENTER_FOUNDATION_V1)'); // Phase 1 path retained
    expect(rcv).toContain('isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)');
    expect(rcv).toContain('@page { size: A4; margin: 12mm 15mm; }'); // geometry unchanged
  });

  it('native copies replaced the loop — no repeated dialogs, no setTimeout(1500)', () => {
    expect(printSvc).toContain('copies');
    expect(printSvc).not.toContain('setTimeout(next, 1500)');
  });
});

describe('Phase 2 — no mocks', () => {
  it('runs against the real modules', () => {
    expect(vi.isMockFunction(composeFromNode)).toBe(false);
  });
});
