import { z } from 'zod';
import { ENUMS } from '../../config/constants';
import { dateOnlySchema } from '../../core/utils/dateOnly';

export const createExpenseSchema = z.object({
  body: z.object({
    code: z.string().min(1).optional(), // يُولّد تلقائيًا إن لم يُرسل
    category: z.enum(ENUMS.expenseCategory),
    description: z.string().min(1, 'الوصف مطلوب'),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون موجبًا'),
    date: dateOnlySchema.optional(),
    billingMonth: z.coerce.number().int().min(1).max(12).optional(),
    billingYear: z.coerce.number().int().min(2020).max(2100).optional(),
    notes: z.string().optional(),
    contractId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional().nullable(),
    supplierName: z.string().max(200).optional().nullable(), // مورد حر (خارج قائمة الموردين)
    documentPath: z.string().optional(),
    paymentMethod: z.enum(ENUMS.expensePaymentMethod).optional(),
    // سبب الإدخال المتأخر لمصروف يخصّ سنة مالية سابقة.
    // لا يُخزَّن على المصروف (لا Migration) — يُسجَّل في Audit Log فقط.
    lateEntryReason: z.string().trim().max(500).optional(),
  }),
});

export const updateExpenseSchema = z.object({
  body: createExpenseSchema.shape.body.partial(),
});

export const forceDeleteExpenseSchema = z.object({
  body: z.object({
    confirmation: z.string().min(1, 'التأكيد مطلوب'), // يجب أن يطابق رمز المصروف
  }),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>['body'];
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>['body'];
export type ForceDeleteExpenseInput = z.infer<typeof forceDeleteExpenseSchema>['body'];
