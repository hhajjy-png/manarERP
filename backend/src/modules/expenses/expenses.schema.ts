import { z } from 'zod';
import { ENUMS } from '../../config/constants';

export const createExpenseSchema = z.object({
  body: z.object({
    code: z.string().min(1).optional(), // يُولّد تلقائيًا إن لم يُرسل
    category: z.enum(ENUMS.expenseCategory),
    description: z.string().min(1, 'الوصف مطلوب'),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون موجبًا'),
    date: z.coerce.date().optional(),
    contractId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    documentPath: z.string().optional(),
  }),
});

export const updateExpenseSchema = z.object({
  body: createExpenseSchema.shape.body.partial(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>['body'];
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>['body'];
