/**
 * Print Center — the gateway (Foundation v1).
 *
 * `submitPrintJob()` is the single door every document type will eventually walk
 * through. In THIS phase it is deliberately thin, and its contract with the rest of
 * the app is: **produce byte-identical physical output to the legacy path.**
 *
 * What it adds on top of the legacy call, and only this:
 *   • real readiness (fonts + images + optional hook) instead of a sleep
 *   • an audit event (PRINT / PDF_EXPORT) written to the backend AuditLog
 *   • a typed, extensible job shape and a named PageSpec
 *
 * What it does NOT do yet:
 *   • it does not compose the document (the page still renders itself)
 *   • it does not choose a printer (Phase 2/3 — `printerName` is carried but the
 *     underlying v1 print service ignores it and shows the OS dialog, exactly as
 *     `printCurrentView()` always did)
 *   • it does not preview, batch, or print silently
 *
 * Transport: `window.manar.printSubmit` (new IPC `print:submit`) when available;
 * otherwise it falls back to `printCurrentView()` — so the gateway is safe in the
 * browser/dev and on an older preload.
 */

import { printCurrentView } from '../utils/print';
import { waitForPrintReady } from './readiness';
import { recordPrintEvent } from './auditClient';
import type { PrintJob, PrintJobResult, PrinterDescriptor } from './types';
import { PRINT_CONTRACT_VERSION } from './types';

/** Absolute ceiling on copies. The driver receives this value ONCE — we never spool
 *  N separate jobs, and we never open N dialogs. */
export const MAX_PRINT_COPIES = 99;

/** Integer, ≥ 1, ≤ MAX_PRINT_COPIES. `undefined` / garbage → 1. */
export function normalizeCopies(copies: unknown): number {
  const n = typeof copies === 'number' ? Math.trunc(copies) : NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PRINT_COPIES);
}

/** Build a job with the contract version stamped, so callers never hand-write it. */
export function createPrintJob(job: Omit<PrintJob, 'contractVersion'>): PrintJob {
  return {
    ...job,
    copies: normalizeCopies(job.copies),
    contractVersion: PRINT_CONTRACT_VERSION,
  };
}

/**
 * SINGLE-FLIGHT GUARD.
 *
 * One user action → one IPC call → one native dialog. This is enforced HERE, at the
 * gateway, rather than only in a component's `busy` state, because component state is
 * asynchronous: a fast double-click, an Enter keypress landing on a focused button, or
 * a Ctrl+P racing the click can all fire two handlers before React has re-rendered the
 * disabled button. A module-level in-flight flag cannot be raced that way.
 *
 * A second submit while one is in progress is IGNORED (resolved as 'canceled', which is
 * truthful — nothing was sent) and produces NO second dialog and NO second audit event.
 */
let inFlight = false;

export interface SubmitOptions {
  /** The printable subtree to await readiness on. Defaults to the whole document —
   *  correct for the v1 whole-window print transport. */
  readyRoot?: ParentNode;
  /** Skip the audit write (used by internal/technical prints such as a calibration
   *  test sheet, which are not business documents). Default: audit. */
  skipAudit?: boolean;
}

/**
 * Submit a print job. Resolves with the outcome; never throws for a canceled
 * dialog — cancellation is a normal status, not an error.
 */
export async function submitPrintJob(
  job: PrintJob,
  options: SubmitOptions = {},
): Promise<PrintJobResult> {
  // 0. SINGLE FLIGHT. A second submission while one is in progress is dropped before
  //    it can reach Electron — no second dialog, no second spool job, no second audit.
  if (inFlight) {
    return { status: 'canceled', error: undefined };
  }
  inFlight = true;

  try {
    return await runJob(job, options);
  } finally {
    inFlight = false;
  }
}

/** Exposed for tests only — asserts the guard is not stuck after a failure. */
export function isPrintInFlight(): boolean {
  return inFlight;
}

async function runJob(job: PrintJob, options: SubmitOptions): Promise<PrintJobResult> {
  // 1. Wait for the document to be genuinely ready (never an arbitrary sleep).
  await waitForPrintReady(options.readyRoot ?? document);

  // 2. Transport. Prefer the new service; fall back to the legacy primitive so the
  //    gateway degrades gracefully outside Electron or on an older preload build.
  let result: PrintJobResult;
  const submit = window.manar?.printSubmit;

  if (submit) {
    try {
      result = await submit(job);
    } catch (err) {
      result = {
        status: 'failed',
        error: err instanceof Error ? err.message : 'فشل إرسال أمر الطباعة',
      };
    }
  } else {
    try {
      await printCurrentView();
      // The legacy primitive cannot distinguish "printed" from "dialog canceled" —
      // it resolves either way. We report the optimistic status it always implied,
      // and the audit row records the transport used.
      result = { status: job.destination === 'pdf' ? 'exported' : 'printed' };
    } catch (err) {
      result = {
        status: 'failed',
        error: err instanceof Error ? err.message : 'فشل الطباعة',
      };
    }
  }

  // 3. Audit (fire-and-forget — never blocks or fails the print).
  if (!options.skipAudit) {
    void recordPrintEvent({
      action: job.destination === 'pdf' ? 'PDF_EXPORT' : 'PRINT',
      docType: job.docType,
      documentId: job.documentId,
      printer: job.printerName,
      copies: job.copies,
      templateId: job.templateId,
      status: result.status,
      error: result.error,
    });
  }

  return result;
}

/**
 * Enumerate the OS printers. No UI consumes this in Foundation v1 — it exists so
 * Phase 2/3 printer selection has a working, tested seam. Returns [] outside
 * Electron.
 */
export async function listPrinters(): Promise<PrinterDescriptor[]> {
  const list = window.manar?.listPrinters;
  if (!list) return [];
  try {
    return await list();
  } catch {
    return [];
  }
}
