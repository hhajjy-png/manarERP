/**
 * Print Center — audit client.
 *
 * Reports the OUTCOME of a print job to the backend, which writes it to the existing
 * AuditLog (no new table, no migration in this phase).
 *
 * Two rules, both deliberate:
 *
 * 1. AUDIT NEVER BLOCKS PRINTING. A failure here is swallowed and logged to the
 *    console. Losing an audit row is bad; refusing to print a receipt because the
 *    audit write failed is worse, and would be a new failure mode the legacy path
 *    never had. (The backend logs its own failure too — `recordAudit` already
 *    follows exactly this philosophy.)
 *
 * 2. THE RENDERER IS NOT TRUSTED FOR IDENTITY. We send document facts only. The
 *    acting user is derived on the backend from the JWT (`req.user`), never from
 *    this payload — see printing.service.ts.
 */

import { api } from '../api/client';
import type { PrintDocType, PrintJobStatus } from './types';

/**
 * PREVIEW_GENERATED is Phase 2. It is a distinct action so a preview can never be
 * mistaken for a physical PRINT: opening the Print Center records PREVIEW_GENERATED,
 * and only pressing Print records PRINT. That is what keeps preview from inflating
 * the print trail.
 */
export type PrintAuditAction = 'PRINT' | 'PDF_EXPORT' | 'PREVIEW_GENERATED';

export interface PrintAuditEvent {
  action: PrintAuditAction;
  docType: PrintDocType;
  documentId?: string;
  printer?: string;
  copies?: number;
  status: PrintJobStatus;
  templateId?: string;
  /** Populated only when status === 'failed'. */
  error?: string;
}

export async function recordPrintEvent(event: PrintAuditEvent): Promise<void> {
  try {
    await api.post('/printing/events', event);
  } catch (err) {
    // Never surface to the user, never rethrow — see rule 1 above.
    // eslint-disable-next-line no-console
    console.warn('[printing] audit event not recorded', err);
  }
}
