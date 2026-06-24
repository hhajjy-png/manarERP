import { z } from 'zod';

export const StatementQuerySchema = z.object({
  fromDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  toDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  search: z.string().optional(),
  status: z.string().optional(),
  referenceType: z.enum(['INVOICE', 'PAYMENT', 'EXPENSE']).optional(),
});

export type StatementQuery = z.infer<typeof StatementQuerySchema>;

export function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}
