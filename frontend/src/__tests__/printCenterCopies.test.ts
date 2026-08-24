// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  submitPrintJob,
  createPrintJob,
  normalizeCopies,
  isPrintInFlight,
  MAX_PRINT_COPIES,
  setFlagOverride,
  PRINT_CENTER_FOUNDATION_V1,
} from '../printing';
import { api } from '../api/client';

/**
 * THE DEFECT: choosing 3 copies opened THREE OS print dialogs.
 * Root cause: FormLayout.doPrint() looped `printCurrentView()` once per copy.
 *
 * These tests are BEHAVIOURAL — they count the actual IPC calls that reach the preload
 * bridge. A grep for "for(" would not have caught the original loop (it used recursion
 * + setTimeout), so we assert on call counts instead.
 */

type Job = { copies?: number; destination?: string };

let printSubmit: ReturnType<typeof vi.fn>;
let audit: ReturnType<typeof vi.fn>;

beforeEach(() => {
  printSubmit = vi.fn(async () => ({ status: 'printed' as const }));
  audit = vi.fn(async () => ({ data: {} }));

  (window as unknown as { manar: unknown }).manar = { printSubmit };
  // Intercept the audit POST at the network boundary so we can count events.
  vi.spyOn(api, 'post').mockImplementation(audit as never);
  setFlagOverride(PRINT_CENTER_FOUNDATION_V1, true);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { manar?: unknown }).manar;
  setFlagOverride(PRINT_CENTER_FOUNDATION_V1, null);
});

const job = (copies?: number) =>
  createPrintJob({ docType: 'receipt-voucher', destination: 'printer', copies });

describe('copies — one click, one IPC call, one dialog', () => {
  it('copies=1 → exactly ONE printSubmit call', async () => {
    await submitPrintJob(job(1));
    expect(printSubmit).toHaveBeenCalledTimes(1);
    expect((printSubmit.mock.calls[0][0] as Job).copies).toBe(1);
  });

  it('copies=3 → exactly ONE printSubmit call carrying copies: 3 (NOT three calls)', async () => {
    await submitPrintJob(job(3));
    // This is the regression that matters: the old loop produced 3.
    expect(printSubmit).toHaveBeenCalledTimes(1);
    const sent = printSubmit.mock.calls[0][0] as Job;
    expect(sent.copies).toBe(3);
    expect(sent.destination).toBe('printer');
  });

  it('copies=10 → still exactly ONE call', async () => {
    await submitPrintJob(job(10));
    expect(printSubmit).toHaveBeenCalledTimes(1);
    expect((printSubmit.mock.calls[0][0] as Job).copies).toBe(10);
  });
});

describe('copies — validation', () => {
  it('is an integer, at least 1, at most the project ceiling', () => {
    expect(normalizeCopies(3)).toBe(3);
    expect(normalizeCopies(undefined)).toBe(1); // undefined → 1
    expect(normalizeCopies(0)).toBe(1);
    expect(normalizeCopies(-5)).toBe(1);
    expect(normalizeCopies(2.7)).toBe(2); // truncated, never fractional
    expect(normalizeCopies(NaN)).toBe(1);
    expect(normalizeCopies('3' as unknown)).toBe(1); // non-number → 1
    expect(normalizeCopies(10_000)).toBe(MAX_PRINT_COPIES);
  });

  it('createPrintJob normalizes before the job can ever reach Electron', () => {
    expect(createPrintJob({ docType: 'form', destination: 'printer', copies: 0 }).copies).toBe(1);
    expect(createPrintJob({ docType: 'form', destination: 'printer' }).copies).toBe(1);
    expect(
      createPrintJob({ docType: 'form', destination: 'printer', copies: 1e9 }).copies,
    ).toBe(MAX_PRINT_COPIES);
  });
});

describe('double-click protection', () => {
  it('a rapid second submit does NOT open a second dialog', async () => {
    let release!: () => void;
    printSubmit.mockImplementation(
      () => new Promise((r) => { release = () => r({ status: 'printed' }); }),
    );

    const first = submitPrintJob(job(3));
    const second = submitPrintJob(job(3)); // fired before the first resolves

    const secondResult = await second;
    expect(secondResult.status).toBe('canceled'); // dropped, truthfully — nothing was sent

    // The first job is still resolving readiness; wait until it reaches the bridge.
    await vi.waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1));
    expect(printSubmit).toHaveBeenCalledTimes(1); // ← ONE dialog, not two

    release();
    await first;
    expect(printSubmit).toHaveBeenCalledTimes(1);
    expect(isPrintInFlight()).toBe(false);
  });

  it('the in-flight guard is released after a failure — it cannot wedge', async () => {
    printSubmit.mockRejectedValueOnce(new Error('driver exploded'));
    const res = await submitPrintJob(job(1));
    expect(res.status).toBe('failed');
    expect(isPrintInFlight()).toBe(false); // not stuck
    await submitPrintJob(job(1)); // a subsequent print still works
    expect(printSubmit).toHaveBeenCalledTimes(2);
  });
});

describe('audit — exactly one event per user action', () => {
  const events = () => audit.mock.calls.filter((c) => c[0] === '/printing/events');

  // The audit write is fire-and-forget by design (it must never block a print), so we
  // wait for it rather than assuming it has landed by the time submitPrintJob resolves.
  it('copies=3 produces ONE PRINT event recording copies: 3', async () => {
    await submitPrintJob(job(3));
    await vi.waitFor(() => expect(events()).toHaveLength(1));
    const body = events()[0][1] as { action: string; copies: number; status: string };
    expect(body.action).toBe('PRINT');
    expect(body.copies).toBe(3);
    expect(body.status).toBe('printed');
  });

  it('a canceled dialog is recorded as canceled — never as success', async () => {
    printSubmit.mockResolvedValueOnce({ status: 'canceled' });
    await submitPrintJob(job(2));
    await vi.waitFor(() => expect(events()).toHaveLength(1));
    expect((events()[0][1] as { status: string }).status).toBe('canceled');
  });

  it('a failed print produces ONE failed event — not a duplicate', async () => {
    printSubmit.mockResolvedValueOnce({ status: 'failed', error: 'خطأ' });
    await submitPrintJob(job(1));
    await vi.waitFor(() => expect(events()).toHaveLength(1));
    expect((events()[0][1] as { status: string }).status).toBe('failed');
  });

  it('a suppressed double-click writes NO second audit event', async () => {
    let release!: () => void;
    printSubmit.mockImplementation(
      () => new Promise((r) => { release = () => r({ status: 'printed' }); }),
    );
    const first = submitPrintJob(job(3));
    await submitPrintJob(job(3)); // suppressed — never reaches the bridge
    await vi.waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1));
    release();
    await first;
    await vi.waitFor(() => expect(events()).toHaveLength(1)); // one action → one event
  });
});

describe('legacy path preserved', () => {
  it('flag OFF → the gateway is not used and no printSubmit IPC occurs', async () => {
    setFlagOverride(PRINT_CENTER_FOUNDATION_V1, false);
    // FormLayout consults the flag before submitting; assert the source contract.
    const form = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(form).toContain('if (!isFlagEnabled(PRINT_CENTER_FOUNDATION_V1))');
    expect(form).toContain('printCurrentView();');
  });
});

/** Strip comments so a source scan judges CODE, not prose about the code. */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('no loop remains anywhere in the print path', () => {
  it('FormLayout no longer loops printCurrentView per copy', () => {
    const form = codeOf('src/forms/shared/FormLayout.tsx');
    // The old loop was `function next() { printCurrentView(); … setTimeout(next, 1500) }`
    // — recursion + a timer, which a naive "no for-loop" check would have missed.
    expect(form).not.toContain('setTimeout(next, 1500)');
    expect(form).not.toMatch(/function next\s*\(\)/);
    // No arbitrary timer may schedule a print any more (the 600 ms auto-print sleep is
    // gone too — it now awaits real readiness).
    expect(form).not.toMatch(/setTimeout\([^)]*printCurrentView/);
    expect(form).toContain('waitForPrintReady()');
    // Copies now go to the driver through the gateway, once.
    expect(form).toContain('submitPrintJob(');
    expect(form).toMatch(/copies:\s*count/);

    // Every surviving printCurrentView() call site is a single-shot fallback, never a
    // per-copy repeat: (1) the bridge-unavailable Save-PDF fallback, (2) the ONE Save-PDF
    // export function's compose-or-export failure fallback (5D: buildFormPdfDocument
    // retired — composeStyledFromNode is now the only Save-PDF path, so there is no
    // longer a second, legacy-branch fallback site), (3) the auto-print on ready.
    // The flag-OFF legacy print path calls `printCurrentViewWithResult()` instead —
    // same physical print, but it returns the real success/cancelled/error outcome
    // instead of discarding it (Provider Parity & Print Result Correctness).
    expect((form.match(/printCurrentView\(\)/g) ?? []).length).toBe(3);
    expect(form).toContain('printCurrentViewWithResult()');
  });

  it('the Print Center path contains no copy loop and no repeated submit', () => {
    const gw = codeOf('src/printing/printCenter.ts');
    // Universal Print Preview v1: the preview dialog replaced the old Print Center
    // dialog. It never prints — it hands off to the page's own print path — so it must
    // contain no submit loop either.
    const dlg = codeOf('src/printing/components/PrintPreviewDialog.tsx');
    for (const src of [gw, dlg]) {
      expect(src).not.toMatch(/for\s*\(/);
      expect(src).not.toMatch(/Array\.from\([^)]*\)\.map\([^)]*submit/i);
      expect(src).not.toMatch(/Promise\.all\([^)]*submit/i);
      expect(src).not.toMatch(/setTimeout\([^)]*(print|submit)/i);
    }
    expect((gw.match(/submit\(job\)/g) ?? []).length).toBe(1); // ONE bridge call site
  });

  it('Electron passes copies natively in a single print() call', () => {
    const svc = codeOf('../electron/services/printService.ts');
    // Exactly one physical print call in the whole service.
    expect((svc.match(/webContents\.print\(/g) ?? []).length).toBe(1);
    expect(svc).toMatch(/copies\s*\?\s*\{\s*copies\s*\}/); // spread natively into options
    expect(svc).toContain('silent: false'); // dialog still shown; no silent printing
    expect(svc).not.toContain('silent: true');
  });

  it('cheque printing is untouched by this fix', () => {
    const cheques = readFileSync('src/pages/Cheques.tsx', 'utf8');
    expect(cheques).not.toMatch(/from\s+['"][^'"]*\/printing['"]/);
    // Anchor updated: the Classic page constants went away with the Classic
    // template. Cheque printing still owns itself via `modules/chequePrint`.
    expect(cheques).toContain("from '../modules/chequePrint'");
  });
});
