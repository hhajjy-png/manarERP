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

/** Build a job with the contract version stamped, so callers never hand-write it. */
export function createPrintJob(job: Omit<PrintJob, 'contractVersion'>): PrintJob {
  return { ...job, contractVersion: PRINT_CONTRACT_VERSION };
}

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
