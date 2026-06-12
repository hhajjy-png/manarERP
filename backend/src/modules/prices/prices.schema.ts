import { z } from 'zod';
import { ENUMS } from '../../config/constants';

export const createPriceSchema = z.object({
  body: z.object({
    asphaltPlant: z.string().min(1, 'مصنع الأسفلت مطلوب'),
    companyName: z.string().min(1, 'اسم الشركة مطلوب'),
    contractLocation: z.string().min(1, 'مكان العقد مطلوب'),
    contractUnit: z.enum(ENUMS.invoiceUnit, { errorMap: () => ({ message: 'وحدة العقد غير صحيحة' }) }),
    unitPrice: z.coerce.number().nonnegative('السعر يجب ألا يكون سالبًا'),
  }),
});

export const updatePriceSchema = z.object({
  body: z.object({
    asphaltPlant: z.string().min(1).optional(),
    companyName: z.string().min(1).optional(),
    contractLocation: z.string().min(1).optional(),
    contractUnit: z.enum(ENUMS.invoiceUnit).optional(),
    unitPrice: z.coerce.number().nonnegative().optional(),
    isArchived: z.boolean().optional(),
  }),
});

export type CreatePriceInput = z.infer<typeof createPriceSchema>['body'];
export type UpdatePriceInput = z.infer<typeof updatePriceSchema>['body'];
