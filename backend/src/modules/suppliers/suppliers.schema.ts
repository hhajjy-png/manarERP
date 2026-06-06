import { z } from 'zod';

export const createSupplierSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'رقم المورّد مطلوب'),
    name: z.string().min(1, 'اسم المورّد مطلوب'),
    phone: z.string().optional(),
    email: z.string().email('بريد غير صحيح').optional().or(z.literal('')),
    address: z.string().optional(),
    contactName: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const updateSupplierSchema = z.object({
  body: createSupplierSchema.shape.body.partial(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>['body'];
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>['body'];
