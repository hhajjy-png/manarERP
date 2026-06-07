import { z } from 'zod';

const money = z.coerce.number().min(0);

export const payrollPeriodSchema = z.object({
  body: z.object({
    employeeId: z.coerce.number().int().positive().optional(),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    notes: z.string().optional(),
  }),
});

export const updatePayrollSchema = z.object({
  body: z.object({
    notes: z.string().optional(),
  }),
});

export const payPayrollSchema = z.object({
  body: z.object({
    paymentMethod: z.enum(['CASH', 'BANK', 'CHEQUE', 'TRANSFER']).default('BANK'),
  }),
});

export const recurringAllowanceSchema = z.object({
  body: z.object({
    employeeId: z.coerce.number().int().positive(),
    name: z.string().min(1),
    amount: money,
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    notes: z.string().optional(),
  }),
});

export const recurringDeductionSchema = recurringAllowanceSchema;

export const payrollAdvanceSchema = z.object({
  body: z.object({
    employeeId: z.coerce.number().int().positive(),
    amount: money,
    date: z.coerce.date().optional(),
    notes: z.string().optional(),
  }),
});

export const manualPayrollLineSchema = z.object({
  body: z.object({
    type: z.enum(['ALLOWANCE', 'DEDUCTION']),
    label: z.string().min(1),
    amount: money,
    notes: z.string().optional(),
  }),
});

export type PayrollPeriodInput = z.infer<typeof payrollPeriodSchema>['body'];
export type UpdatePayrollInput = z.infer<typeof updatePayrollSchema>['body'];
export type PayPayrollInput = z.infer<typeof payPayrollSchema>['body'];
export type RecurringAllowanceInput = z.infer<typeof recurringAllowanceSchema>['body'];
export type PayrollAdvanceInput = z.infer<typeof payrollAdvanceSchema>['body'];
export type ManualPayrollLineInput = z.infer<typeof manualPayrollLineSchema>['body'];
