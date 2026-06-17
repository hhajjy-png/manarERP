import { z } from 'zod';

export const IMPORT_MAX_ROWS = 1000;

const entityTypeSchema = z.enum(['employees', 'customers', 'equipment', 'suppliers', 'prices', 'contracts', 'expenses', 'invoices', 'payroll']);

const rawRowSchema = z.record(z.string(), z.unknown());

export const importRequestSchema = z.object({
  body: z.object({
    entityType: entityTypeSchema,
    rows: z
      .array(rawRowSchema)
      .min(1, 'لا توجد صفوف للاستيراد')
      .max(IMPORT_MAX_ROWS, `الحد الأقصى ${IMPORT_MAX_ROWS} صف لكل عملية استيراد`),
  }),
});

export type ImportRequestBody = z.infer<typeof importRequestSchema>['body'];
