import { z } from 'zod';

export const createChequeSchema = z.object({
  body: z.object({
    chequeNumber: z.string().min(1, 'رقم الشيك مطلوب'),
    chequeDate: z.coerce.date(),
    beneficiaryName: z.string().min(1, 'اسم المستفيد مطلوب'),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون موجبًا'),
    currency: z.string().min(1).default('KWD'),
    description: z.string().optional(),
    bankName: z.string().min(1, 'اسم البنك مطلوب'),
    templateName: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const updateChequeSchema = z.object({
  body: z.object({
    chequeNumber: z.string().min(1).optional(),
    chequeDate: z.coerce.date().optional(),
    beneficiaryName: z.string().min(1).optional(),
    amount: z.coerce.number().positive().optional(),
    currency: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    bankName: z.string().min(1).optional(),
    templateName: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
});

export type CreateChequeInput = z.infer<typeof createChequeSchema>['body'];
export type UpdateChequeInput = z.infer<typeof updateChequeSchema>['body'];
