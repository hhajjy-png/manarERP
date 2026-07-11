import { z } from 'zod';

/**
 * Print Center — request validation (Foundation v1).
 *
 * Mirrors `frontend/src/printing/types.ts` (the repo has no shared workspace; API
 * DTO shapes are mirrored, as everywhere else). Keep `PRINT_CONTRACT_VERSION` in
 * step across the two files.
 *
 * NOTE ON TRUST: nothing in this payload identifies the actor. The acting user is
 * derived from the JWT (`req.user`) in the service — never from the request body.
 */

export const PRINT_DOC_TYPES = [
  'receipt-voucher',
  'payment-voucher',
  'invoice',
  'quotation',
  'report',
  'payslip',
  'form',
  'cheque',
] as const;

/**
 * PREVIEW_GENERATED (Phase 2) is a DISTINCT action from PRINT — opening the Print
 * Center preview must never be counted as a physical print. AuditLog.action is a free
 * string column, so this needs no migration.
 */
export const PRINT_AUDIT_ACTIONS = ['PRINT', 'PDF_EXPORT', 'PREVIEW_GENERATED'] as const;

export const PRINT_JOB_STATUSES = ['printed', 'exported', 'canceled', 'failed'] as const;

export const printEventSchema = z.object({
  body: z.object({
    action: z.enum(PRINT_AUDIT_ACTIONS),
    docType: z.enum(PRINT_DOC_TYPES),
    documentId: z.string().max(128).optional(),
    printer: z.string().max(200).optional(),
    copies: z.number().int().min(1).max(100).optional(),
    status: z.enum(PRINT_JOB_STATUSES),
    templateId: z.string().max(128).optional(),
    error: z.string().max(500).optional(),
  }),
});

export type PrintEventInput = z.infer<typeof printEventSchema>['body'];
