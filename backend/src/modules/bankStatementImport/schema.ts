import { z } from 'zod';

// ── StatementTransaction (from frontend parser) ────────────────────────────────

const StatementTransactionSchema = z.object({
  transactionId:  z.string().max(128).nullable(),
  bankName:       z.string().min(1).max(64),
  statementDate:  z.string().max(32).nullable(),
  postingDate:    z.string().max(32).nullable(),
  description:    z.string().max(500),
  reference:      z.string().max(128).nullable(),
  debit:          z.number().nonnegative(),
  credit:         z.number().nonnegative(),
  balance:        z.number().nullable(),
  currency:       z.string().max(8),
  accountNumber:  z.string().max(64).nullable(),
  iban:           z.string().max(34).nullable(),
  chequeNumber:   z.string().max(64).nullable(),
  rawRow:         z.record(z.unknown()),
});

// ── Preview request ────────────────────────────────────────────────────────────

export const PreviewRequestSchema = z.object({
  bankName:  z.string().min(1).max(64),
  fileName:  z.string().min(1).max(256),
  fromDate:  z.string().max(32).optional(),
  toDate:    z.string().max(32).optional(),
  rows:      z.array(StatementTransactionSchema).min(1).max(10000),
});
export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;

// ── Execute (import) request ───────────────────────────────────────────────────

export const ExecuteImportSchema = z.object({
  bankName:  z.string().min(1).max(64),
  fileName:  z.string().min(1).max(256),
  fromDate:  z.string().max(32).optional(),
  toDate:    z.string().max(32).optional(),
  rows:      z.array(StatementTransactionSchema).min(1).max(10000),
});
export type ExecuteImportRequest = z.infer<typeof ExecuteImportSchema>;

// ── Workspace query ────────────────────────────────────────────────────────────

const RECONCILE_STATUSES = ['UNMATCHED', 'MATCHED', 'IGNORED', 'DUPLICATE', 'REVIEW'] as const;

export const WorkspaceQuerySchema = z.object({
  status:      z.enum(RECONCILE_STATUSES).optional(),
  isBankFee:   z.enum(['true', 'false']).optional(),
  isDuplicate: z.enum(['true', 'false']).optional(),
  search:      z.string().max(128).optional(),
  fromDate:    z.string().max(32).optional(),
  toDate:      z.string().max(32).optional(),
  minAmount:   z.coerce.number().nonnegative().optional(),
  maxAmount:   z.coerce.number().nonnegative().optional(),
  page:        z.coerce.number().int().positive().optional(),
  pageSize:    z.coerce.number().int().positive().max(100).optional(),
});

// ── Update status ──────────────────────────────────────────────────────────────

export const UpdateStatusSchema = z.object({
  status:         z.enum(RECONCILE_STATUSES),
  matchedType:    z.string().max(32).nullable().optional(),
  matchedId:      z.number().int().positive().nullable().optional(),
  matchedRef:     z.string().max(128).nullable().optional(),
  matchConfidence: z.number().int().min(0).max(100).nullable().optional(),
});
export type UpdateStatusRequest = z.infer<typeof UpdateStatusSchema>;

// ── Bulk update status ─────────────────────────────────────────────────────────

export const BulkUpdateStatusSchema = z.object({
  ids:    z.array(z.number().int().positive()).min(1).max(500),
  status: z.enum(RECONCILE_STATUSES),
});
export type BulkUpdateStatusRequest = z.infer<typeof BulkUpdateStatusSchema>;

// ── Report export ──────────────────────────────────────────────────────────────

export const ReportExportSchema = z.object({
  format: z.enum(['excel', 'pdf']),
});
export type ReportExportRequest = z.infer<typeof ReportExportSchema>;

// ── Bulk delete imports ────────────────────────────────────────────────────────

export const BulkDeleteImportSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
});
export type BulkDeleteImportRequest = z.infer<typeof BulkDeleteImportSchema>;

// ── Timeline query ─────────────────────────────────────────────────────────────

export const TimelineQuerySchema = z.object({
  page:      z.coerce.number().int().positive().default(1),
  pageSize:  z.coerce.number().int().positive().max(200).default(50),
  fromDate:  z.string().max(32).optional(),
  toDate:    z.string().max(32).optional(),
  search:    z.string().max(128).optional(),
  type:      z.enum(['all', 'deposits', 'withdrawals', 'fees', 'cheques', 'transfers']).optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
});
export type TimelineQuery = z.infer<typeof TimelineQuerySchema>;
