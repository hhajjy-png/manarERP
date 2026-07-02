import { z } from 'zod';

export const createChequeSchema = z.object({
  body: z.object({
    chequeNumber: z
      .string()
      .trim()
      .min(3, 'رقم الشيك يجب أن يكون 3 أحرف على الأقل')
      .regex(/^\S+$/, 'رقم الشيك لا يجب أن يحتوي على مسافات'),
    chequeDate: z.coerce
      .date()
      .refine((d) => d.getFullYear() >= 2020 && d.getFullYear() <= 2035, {
        message: 'تاريخ الشيك غير صالح',
      }),
    beneficiaryName: z.string().min(1, 'اسم المستفيد مطلوب'),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون موجبًا'),
    currency: z.enum(['KWD', 'USD', 'SAR', 'AED']).default('KWD'),
    description: z.string().nullable().optional(),
    bankName: z.string().min(1, 'اسم البنك مطلوب'),
    notes: z.string().nullable().optional(),
  }),
});

export const updateChequeSchema = z.object({
  body: z.object({
    chequeNumber: z
      .string()
      .trim()
      .min(3, 'رقم الشيك يجب أن يكون 3 أحرف على الأقل')
      .regex(/^\S+$/, 'رقم الشيك لا يجب أن يحتوي على مسافات')
      .optional(),
    chequeDate: z.coerce
      .date()
      .refine((d) => d.getFullYear() >= 2020 && d.getFullYear() <= 2035, {
        message: 'تاريخ الشيك غير صالح',
      })
      .optional(),
    beneficiaryName: z.string().min(1).optional(),
    amount: z.coerce.number().positive().optional(),
    currency: z.enum(['KWD', 'USD', 'SAR', 'AED']).optional(),
    description: z.string().nullable().optional(),
    bankName: z.string().min(1).optional(),
    notes: z.string().nullable().optional(),
  }),
});

export const forceDeleteChequeSchema = z.object({
  body: z.object({
    confirmation: z.string().min(1, 'التأكيد مطلوب'),
  }),
});

export type CreateChequeInput = z.infer<typeof createChequeSchema>['body'];
export type UpdateChequeInput = z.infer<typeof updateChequeSchema>['body'];
export type ForceDeleteChequeInput = z.infer<typeof forceDeleteChequeSchema>['body'];
