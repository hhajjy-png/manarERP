import { z } from 'zod';
import { ENUMS } from '../../config/constants';

export const createCustomerSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'رقم العميل مطلوب'),
    name: z.string().min(1, 'اسم العميل مطلوب'),
    nameEn: z.string().trim().optional(),
    type: z.enum(ENUMS.customerType).default('PRIVATE'),
    category: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email('بريد غير صحيح').optional().or(z.literal('')),
    address: z.string().optional(),
    contactName: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const updateCustomerSchema = z.object({
  body: createCustomerSchema.shape.body.partial(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>['body'];
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>['body'];
