import { z } from 'zod';
import { ENUMS } from '../../config/constants';

export const createEquipmentSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'رقم المعدة مطلوب'),
    type: z.string().min(1, 'نوع المعدة مطلوب'), // قلاب | شيول | حفار | مدحلة | رصاصة | معدة خفيفة
    ownerName: z.string().optional(), // اسم المالك
    driverName: z.string().optional(), // اسم السائق
    plateNumber: z.string().optional(), // رقم اللوحة
    registrationExpiry: z.coerce.date().optional(), // تاريخ انتهاء دفتر المركبة
    status: z.enum(ENUMS.equipmentStatus).default('WORKING'), // WORKING | NOT_WORKING
    name: z.string().optional(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    manufactureYear: z.coerce.number().int().min(1900).max(2100).optional(),
    serialNumber: z.string().optional(),
    currentLocation: z.string().optional(),
    operatingHours: z.coerce.number().nonnegative().default(0),
    purchaseDate: z.coerce.date().optional(),
    purchaseCost: z.coerce.number().nonnegative().optional(),
    notes: z.string().optional(),
  }),
});

export const updateEquipmentSchema = z.object({
  body: createEquipmentSchema.shape.body.partial(),
});

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>['body'];
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>['body'];
