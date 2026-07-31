import { z } from 'zod';
import { ENUMS } from '../../config/constants';
import { dateOnlySchema } from '../../core/utils/dateOnly';

export const createContractSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'رقم العقد مطلوب'),
    asphaltPlant: z.string().min(1, 'اسم مصنع الأسفلت مطلوب'),
    location: z.string().optional(),
    monthlyTransportValue: z.coerce.number().nonnegative('قيمة النقل الشهري يجب ألا تكون سالبة').default(0),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    status: z.enum(ENUMS.contractStatus).default('ACTIVE'),
    unitName: z.string().optional(),
    price: z.coerce.number().nonnegative('السعر يجب ألا يكون سالباً').optional(),
    companyName: z.string().optional(),
    customerId: z.coerce.number().int().positive().optional(),
    managerId: z.coerce.number().int().positive().optional(),
    notes: z.string().optional(),
  }),
});

export const updateContractSchema = z.object({
  body: createContractSchema.shape.body.partial(),
});

export type CreateContractInput = z.infer<typeof createContractSchema>['body'];
export type UpdateContractInput = z.infer<typeof updateContractSchema>['body'];
