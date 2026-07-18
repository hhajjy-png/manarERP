import { z } from 'zod';

const dateStr    = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const pageInt    = z.coerce.number().int().positive().default(1);
const pageSizeInt = z.coerce.number().int().positive().max(200).default(50);

// ── Statement ────────────────────────────────────────────────────────────────
export const StatementParamsSchema = z.object({
  entityType: z.enum(['customer', 'supplier']),
  id:         z.coerce.number().int().positive(),
});

export const StatementQuerySchema = z.object({
  fromDate:      dateStr,
  toDate:        dateStr,
  search:        z.string().optional(),
  referenceType: z.string().optional(),
  status:        z.string().optional(),
});

export const ExportQuerySchema = StatementQuerySchema.extend({
  format: z.enum(['pdf', 'html', 'excel']).default('excel'),
});

// ── Aging (stubs for Parts 3–5) ──────────────────────────────────────────────
export const AgingQuerySchema = z.object({
  asOfDate:     dateStr,
  search:       z.string().optional(),
  customerType: z.enum(['GOVERNMENT', 'PRIVATE']).optional(),
  hideZero:     z.coerce.boolean().default(false),
  format:       z.enum(['pdf', 'html', 'excel']).optional(),
});

// ── GL (stubs) ────────────────────────────────────────────────────────────────
export const GlStatementQuerySchema = z.object({
  fromDate: dateStr,
  toDate:   dateStr,
  search:   z.string().optional(),
  status:   z.string().optional(),
  format:   z.enum(['pdf', 'html', 'excel']).optional(),
  page:     pageInt,
  pageSize: pageSizeInt,
});

export const GlReportQuerySchema = z.object({
  fromDate:    dateStr,
  toDate:      dateStr,
  accountType: z.string().optional(),
  page:        pageInt,
  pageSize:    z.coerce.number().int().positive().max(100).default(20),
  format:      z.enum(['pdf', 'html', 'excel']).optional(),
  // فرز أساس الشبكة الموحّد — القيم تُتحقّق نهائيًا في القائمة البيضاء بالخدمة.
  sortBy:      z.string().optional(),
  sortDir:     z.enum(['asc', 'desc']).optional(),
});

// ── Trial Balance (stubs) ─────────────────────────────────────────────────────
export const TrialBalanceQuerySchema = z.object({
  mode:             z.enum(['as-of', 'period']).default('as-of'),
  asOfDate:         dateStr,
  fromDate:         dateStr,
  toDate:           dateStr,
  showZeroBalances: z.coerce.boolean().default(false),
  accountType:      z.string().optional(),
  format:           z.enum(['pdf', 'html', 'excel']).optional(),
});

// ── Journal Book (stubs) ──────────────────────────────────────────────────────
export const JournalBookQuerySchema = z.object({
  fromDate:      dateStr,
  toDate:        dateStr,
  status:        z.string().optional(),
  referenceType: z.string().optional(),
  search:        z.string().optional(),
  page:          pageInt,
  pageSize:      pageSizeInt,
  format:        z.enum(['pdf', 'html', 'excel']).optional(),
});

// ── Financial Summary (stubs) ─────────────────────────────────────────────────
export const SummaryQuerySchema = z.object({
  fromDate: dateStr,
  toDate:   dateStr,
  format:   z.enum(['pdf', 'html', 'excel']).optional(),
});
