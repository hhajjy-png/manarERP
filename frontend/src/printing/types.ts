/**
 * Print Center — unified job contract (Foundation v1).
 *
 * This is the single shape every future print/PDF request travels in. It is
 * deliberately additive: nothing in the app is required to use it yet, and every
 * legacy path (`printCurrentView`, `pdf:export`, `pdf:exportHtml`) keeps working
 * untouched. Only the Receipt Voucher pilot submits jobs through the gateway in
 * this phase, and only when the PRINT_CENTER_FOUNDATION_V1 flag is on.
 *
 * Mirrored (not shared) with `backend/src/modules/printing/printing.schema.ts`.
 * The repo has no cross-package workspace, so DTO shapes are mirrored the same way
 * every other API contract is. `PRINT_CONTRACT_VERSION` exists so a drift between
 * the two copies is detectable rather than silent.
 */

export const PRINT_CONTRACT_VERSION = 'v1' as const;

/** Business document kinds that can be printed. Extend by adding a member — every
 *  switch over this type is exhaustive-checked (see `assertNeverDocType`). */
export type PrintDocType =
  | 'receipt-voucher'
  | 'payment-voucher'
  | 'invoice'
  | 'quotation'
  | 'report'
  | 'payslip'
  | 'form'
  | 'cheque';

/** Where the composed document ends up. */
export type PrintDestination =
  | 'printer' // physical print
  | 'pdf' // save-to-file
  | 'preview'; // render only, return to the renderer (Phase 2 — reserved, not used in v1)

export type PrintOrientation = 'portrait' | 'landscape';

/** Outcome of a submitted job. `canceled` is a first-class state, not an error:
 *  the operator dismissing the OS print dialog is a normal flow. */
export type PrintJobStatus = 'printed' | 'exported' | 'canceled' | 'failed';

/**
 * A print request. Everything except `docType` and `destination` is optional, so a
 * caller may submit the minimum and let profiles/PageSpec supply the rest.
 *
 * Extensibility: new fields must be OPTIONAL, so an older caller keeps compiling.
 * `metadata` is the escape hatch for document-specific context that does not
 * deserve a top-level field (never for anything security-relevant — the backend
 * does not trust it).
 */
export interface PrintJob {
  contractVersion: typeof PRINT_CONTRACT_VERSION;
  docType: PrintDocType;
  /** Business identifier of the document (voucher number, invoice id, …). May be
   *  absent for documents that are not persisted at print time. */
  documentId?: string;
  destination: PrintDestination;

  /** Named page specification — see `pageSpec.ts`. Resolves paper + orientation +
   *  margins. Explicit `paper`/`orientation` below override it when present. */
  pageSpecId?: PageSpecId;
  paper?: PaperSize;
  orientation?: PrintOrientation;

  copies?: number;
  /** Which template rendered the document (registry id, studio id, cheque version). */
  templateId?: string;
  /** Reserved for Phase 2 — a preview-only render. Ignored in v1. */
  preview?: boolean;
  /** Target printer device name. Absent → OS default / dialog. */
  printerName?: string;
  /** Suggested filename for `destination: 'pdf'`. */
  suggestedFileName?: string;

  /** Free-form, non-authoritative context (labels, page counts, UI state). Never
   *  used for permission decisions. */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface PrintJobResult {
  status: PrintJobStatus;
  /** Populated for `destination: 'pdf'` when a file was written. */
  filePath?: string;
  sizeBytes?: number;
  /** Human-readable failure reason (Arabic). Present only when status = 'failed'. */
  error?: string;
}

/** A printer as reported by the OS. Shape mirrors Electron's PrinterInfo subset we
 *  actually need — we deliberately do not forward the raw driver `options` blob. */
export interface PrinterDescriptor {
  name: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  status: number;
}

// ── PageSpec identifiers (values live in pageSpec.ts) ────────────────────────────

export type PaperSize = 'A4' | 'A5' | 'Letter' | 'Legal' | 'custom';

export type PageSpecId =
  | 'a4-portrait'
  | 'a4-landscape'
  | 'a5-receipt'
  | 'cheque-dynamic';

/** Exhaustiveness helper for switches over PrintDocType / PrintDestination. */
export function assertNeverDocType(x: never): never {
  throw new Error(`Unhandled print doc type: ${String(x)}`);
}
