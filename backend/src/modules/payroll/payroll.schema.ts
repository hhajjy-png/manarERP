import { z } from 'zod';

export const generatePayrollSchema = z.object({
  body: z.object({
    employeeId: z.coerce.number().int().positive().optional(), // إن غاب: لكل الموظفين النشطين
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
  }),
});

export type GeneratePayrollInput = z.infer<typeof generatePayrollSchema>['body'];
