import { Request } from 'express';
import { recordAudit } from '../../core/middleware/audit';
import { ROLES } from '../../config/constants';
import type { PrintEventInput } from './printing.schema';

/**
 * Print Center — print audit service (Foundation v1).
 *
 * Writes PRINT / PDF_EXPORT events to the EXISTING AuditLog table. No new Prisma
 * model, no migration in this phase — a dedicated `print_logs` table is a later
 * phase, and would generalize the proven `cheque_print_logs` design.
 *
 * The cheque module keeps its own richer print logging (print counts, reprint
 * reasons); this service does not touch it and does not duplicate it.
 */
export class PrintingService {
  /**
   * Record the outcome of a print job.
   *
   * Identity is taken from `req.user` (JWT), never from the payload — the renderer
   * cannot claim to be another user. `recordAudit` itself never throws: a failed
   * audit write is logged server-side and swallowed, so it can never block a print.
   */
  async recordPrintEvent(input: PrintEventInput, req: Request): Promise<{ recorded: true }> {
    const isSystemAdmin = req.user?.roleName === ROLES.SYSTEM_ADMIN;

    await recordAudit({
      req,
      action: input.action, // 'PRINT' | 'PDF_EXPORT' — distinguishable in the log
      module: 'printing',
      entityId: input.documentId,
      newValue: {
        docType: input.docType,
        documentId: input.documentId ?? null,
        printer: input.printer ?? null,
        copies: input.copies ?? 1,
        templateId: input.templateId ?? null,
        status: input.status, // printed | exported | canceled | failed
        error: input.error ?? null,
        // SYSTEM_ADMIN bypasses every permission check (rbac.middleware). Flagging
        // its prints keeps the elevated path visible in the audit trail.
        elevated: isSystemAdmin,
      },
    });

    return { recorded: true };
  }
}

export const printingService = new PrintingService();
