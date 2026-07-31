import { z } from 'zod';
import { ENUMS } from '../../config/constants';
import { dateOnlySchema } from '../../core/utils/dateOnly';

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
    // Unified GL payment method — determines credit account in GL journal entry
    paymentMethod: z.enum(ENUMS.glPaymentMethod).default('BANK'),
    // تاريخ الصرف الفعلي. عند غيابه يُرحَّل القيد بآخر يوم من شهر الراتب —
    // لا بتاريخ اليوم — حتى يهبط راتب ديسمبر 2024 في ديسمبر 2024.
    paymentDate: dateOnlySchema.optional(),
    lateEntryReason: z.string().trim().max(500).optional(),
  }),
});

export const recurringAllowanceSchema = z.object({
  body: z.object({
    employeeId: z.coerce.number().int().positive(),
    name: z.string().min(1),
    amount: money,
    startsAt: dateOnlySchema.optional(),
    endsAt: dateOnlySchema.optional(),
    notes: z.string().optional(),
  }),
});

export const recurringDeductionSchema = recurringAllowanceSchema;

export const payrollAdvanceSchema = z.object({
  body: z.object({
    employeeId: z.coerce.number().int().positive(),
    amount: money,
    date: dateOnlySchema.optional(),
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
