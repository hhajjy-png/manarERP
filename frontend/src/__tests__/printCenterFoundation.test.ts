// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PAGE_SPECS,
  RECEIPT_VOUCHER_PAGE_SPEC,
  getPageSpec,
  listPageSpecs,
  toPageCss,
  isFlagEnabled,
  setFlagOverride,
  PRINT_CENTER_FOUNDATION_V1,
  PRINT_CONTRACT_VERSION,
  createPrintJob,
  waitForPrintReady,
} from '../printing';

describe('Print Center Foundation — PageSpec registry', () => {
  it('registers the four foundation specs', () => {
    expect(listPageSpecs().map((s) => s.id).sort()).toEqual([
      'a4-landscape',
      'a4-portrait',
      'a5-receipt',
      'cheque-dynamic',
    ]);
  });

  it('emits a single @page rule per spec', () => {
    expect(toPageCss(getPageSpec('a4-portrait'))).toBe('@page { size: A4; margin: 12mm 12mm 12mm 12mm; }');
    expect(toPageCss(getPageSpec('a4-landscape'))).toBe(
      '@page { size: A4 landscape; margin: 10mm 10mm 10mm 10mm; }',
    );
    expect(toPageCss(getPageSpec('a5-receipt'))).toBe('@page { size: A5; margin: 8mm 8mm 8mm 8mm; }');
  });

  it('refuses to invent geometry for the dynamic cheque spec', () => {
    expect(PAGE_SPECS['cheque-dynamic'].dynamic).toBe(true);
    expect(() => toPageCss(PAGE_SPECS['cheque-dynamic'])).toThrow(/dynamic/i);
  });

  it('the Receipt Voucher spec reproduces the page’s existing geometry exactly', () => {
    // The pilot must not change physical output: ReceiptVoucher.tsx prints with
    // `@page { size: A4; margin: 12mm 15mm; }`. The spec must say the same thing.
    expect(RECEIPT_VOUCHER_PAGE_SPEC.paper).toBe('A4');
    expect(RECEIPT_VOUCHER_PAGE_SPEC.orientation).toBe('portrait');
    expect(RECEIPT_VOUCHER_PAGE_SPEC.margins).toEqual({
      top: '12mm',
      right: '15mm',
      bottom: '12mm',
      left: '15mm',
    });
    const source = readFileSync('src/pages/ReceiptVoucher.tsx', 'utf8');
    expect(source).toContain('@page { size: A4; margin: 12mm 15mm; }');
  });
});

describe('Print Center Foundation — feature flag', () => {
  afterEach(() => setFlagOverride(PRINT_CENTER_FOUNDATION_V1, null));

  it('is on by default', () => {
    expect(isFlagEnabled(PRINT_CENTER_FOUNDATION_V1)).toBe(true);
  });

  it('can be turned OFF at runtime — the rollback lever, no rebuild', () => {
    setFlagOverride(PRINT_CENTER_FOUNDATION_V1, false);
    expect(isFlagEnabled(PRINT_CENTER_FOUNDATION_V1)).toBe(false);
    setFlagOverride(PRINT_CENTER_FOUNDATION_V1, true);
    expect(isFlagEnabled(PRINT_CENTER_FOUNDATION_V1)).toBe(true);
  });
});

describe('Print Center Foundation — PrintJob contract', () => {
  it('stamps the contract version so callers cannot forget it', () => {
    const job = createPrintJob({ docType: 'receipt-voucher', destination: 'printer' });
    expect(job.contractVersion).toBe(PRINT_CONTRACT_VERSION);
    expect(job.contractVersion).toBe('v1');
  });

  it('keeps the backend Zod mirror in step with the frontend doc types', () => {
    const schema = readFileSync('../backend/src/modules/printing/printing.schema.ts', 'utf8');
    for (const docType of [
      'receipt-voucher',
      'payment-voucher',
      'invoice',
      'quotation',
      'report',
      'payslip',
      'form',
      'cheque',
    ]) {
      expect(schema).toContain(`'${docType}'`);
    }
    for (const status of ['printed', 'exported', 'canceled', 'failed']) {
      expect(schema).toContain(`'${status}'`);
    }
  });
});

describe('Print Center Foundation — readiness replaces arbitrary sleeps', () => {
  it('resolves once fonts, images and the layout have settled', async () => {
    const res = await waitForPrintReady(document, 2000);
    expect(res.ready).toBe(true);
    expect(res.timedOut).toBe(false);
  });

  it('never hangs — a blocking data-print-ready hook still resolves via the timeout', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-print-ready', 'false');
    document.body.appendChild(el);
    try {
      const res = await waitForPrintReady(document, 60);
      expect(res.timedOut).toBe(true);
      expect(res.ready).toBe(false); // proceeded anyway — never blocks a print
    } finally {
      el.remove();
    }
  });

  it('unblocks as soon as data-print-ready flips to true', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-print-ready', 'false');
    document.body.appendChild(el);
    setTimeout(() => el.setAttribute('data-print-ready', 'true'), 10);
    try {
      const res = await waitForPrintReady(document, 2000);
      expect(res.ready).toBe(true);
      expect(res.timedOut).toBe(false);
    } finally {
      el.remove();
    }
  });
});

// ── Scope discipline: nothing outside the pilot may have been touched. ────────────
describe('Print Center Foundation — scope discipline', () => {
  it('no arbitrary print sleeps remain in the migrated paths', () => {
    const payslip = readFileSync('src/pages/PayrollPayslip.tsx', 'utf8');
    expect(payslip).not.toContain('setTimeout(() => printCurrentView(), 500)');
    expect(payslip).toContain('waitForPrintReady');

    const pdfIpc = readFileSync('../electron/ipc/pdf.ipc.ts', 'utf8');
    expect(pdfIpc).not.toContain('setTimeout(resolve, 400)');
    expect(pdfIpc).toContain('waitForRenderReady');
  });

  it('cheque printing is completely untouched by the Print Center', () => {
    const cheques = readFileSync('src/pages/Cheques.tsx', 'utf8');
    // The cheque page does not import the Print Center at all. (It legitimately uses
    // the word "printing" in its own state and comments — what matters is the import.)
    expect(cheques).not.toMatch(/from\s+['"][^'"]*\/printing['"]/);
    expect(cheques).not.toContain('submitPrintJob');
    // The cheque print engine's own anchors. The Classic page constants they used
    // to name were removed with the Classic template ("Keep Gulf Bank Template
    // Only"); the surviving anchor is the same statement in current terms — the
    // cheque page owns its printing through `modules/chequePrint`, and the Print
    // Center is nowhere near it.
    expect(cheques).toContain("from '../modules/chequePrint'");
    expect(cheques).toContain('profilePlacementMm');

    const studio = readFileSync('src/components/chequeTemplateManager/ChequeTemplateManager.tsx', 'utf8');
    expect(studio).not.toContain('submitPrintJob');
  });

  it('the legacy primitive still exists and is still used by unmigrated pages', () => {
    const print = readFileSync('src/utils/print.ts', 'utf8');
    expect(print).toContain('export function printCurrentView');
    // ReceiptVoucher keeps the legacy call for the flag-OFF path.
    const rcv = readFileSync('src/pages/ReceiptVoucher.tsx', 'utf8');
    expect(rcv).toContain('printCurrentView()');
    expect(rcv).toContain('isFlagEnabled(PRINT_CENTER_FOUNDATION_V1)');
  });

  it('preload still exposes every legacy channel plus the two new ones', () => {
    const preload = readFileSync('../electron/preload.ts', 'utf8');
    for (const legacy of ['app:print', 'pdf:export', 'pdf:exportHtml']) {
      expect(preload).toContain(legacy);
    }
    expect(preload).toContain('print:submit');
    expect(preload).toContain('print:listPrinters');
  });
});

// Keep vi imported-and-used so the linter cannot flag it; also documents that no
// module under test is mocked — these are real behaviours, not stubs.
describe('Print Center Foundation — no mocks', () => {
  it('runs against the real modules', () => {
    expect(vi.isMockFunction(waitForPrintReady)).toBe(false);
  });
});
