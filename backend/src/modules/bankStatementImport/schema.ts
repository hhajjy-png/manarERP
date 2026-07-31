import { z } from 'zod';
import { dateOnlySchema } from '../../core/utils/dateOnly.js';

/**
 * Bank Statement Import Server Date Hardening Pack v1.
 *
 * The trusted client parser (`frontend/src/utils/bankStatementParser.ts`
 * `parseDateStr`) already normalizes every legitimate bank-file date shape
 * (Excel serial, ISO, `DD/MM/YYYY`, `DD-MM-YYYY`, verbose month) into canonical
 * `YYYY-MM-DD` — or `null` when a cell cannot be parsed — before this request
 * body is ever built. So the **proven client → server contract** for
 * `statementDate`/`postingDate`/`fromDate`/`toDate` is canonical `YYYY-MM-DD`
 * (never the bank's raw source format), which was previously accepted here as
 * only `z.string().max(32)` — any string at all — and later reached bare
 * `new Date(str)` in `service.ts` (persistence), `dedupDetector.ts` (dedup
 * date-range lookups) and `validators.ts` (`checkDate`). A crafted request, a
 * future caller, or a parser regression could all have let V8's non-standard
 * `MM/DD/YYYY` heuristic silently misread a date.
 *
 * Reuses the released `dateOnlySchema` (API Date Hardening Pack v1) — no
 * competing validator — composed with one extra `.transform()` back to a
 * canonical string, because every downstream consumer in this module
 * (`previewBuilder.ts`, `dedupDetector.ts`, `fingerprint.ts`, `matcher.ts`,
 * `reconciliationEngine.ts`) treats these dates as `YYYY-MM-DD` strings for
 * sorting, substring comparison and dedup-key building, not `Date` objects —
 * `service.ts` alone converts to `Date`, at the single existing insert
 * boundary. Once this schema rejects anything but a real, unambiguous
 * calendar date, every one of those downstream `new Date(str)` calls becomes
 * safe by construction — an unambiguous canonical string is spec-guaranteed
 * (ECMA-262) to parse as UTC midnight, with no engine guessing involved.
 */
const bankStatementDateOnly = dateOnlySchema.transform((d) => d.toISOString().substring(0, 10));

// ── StatementTransaction (from frontend parser) ────────────────────────────────

const StatementTransactionSchema = z.object({
  transactionId:  z.string().max(128).nullable(),
  bankName:       z.string().min(1).max(64),
  statementDate:  bankStatementDateOnly.nullable(),
  postingDate:    bankStatementDateOnly.nullable(),
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
  fromDate:  bankStatementDateOnly.optional(),
  toDate:    bankStatementDateOnly.optional(),
  rows:      z.array(StatementTransactionSchema).min(1).max(10000),
});
export type PreviewRequest = z.infer<typeof PreviewRequestSchema>;

// ── Execute (import) request ───────────────────────────────────────────────────

export const ExecuteImportSchema = z.object({
  bankName:  z.string().min(1).max(64),
  fileName:  z.string().min(1).max(256),
  fromDate:  bankStatementDateOnly.optional(),
  toDate:    bankStatementDateOnly.optional(),
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
