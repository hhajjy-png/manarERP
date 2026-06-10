import { z } from 'zod';
import { ENUMS } from '../../config/constants';

const maintenanceStatus = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export const createMaintenanceSchema = z.object({
  body: z.object({
    equipmentId: z.coerce.number().int().positive('المعدة مطلوبة'),
    type: z.enum(ENUMS.maintenanceType),
    description: z.string().min(1, 'الوصف مطلوب'),
    cost: z.coerce.number().nonnegative().default(0),
    performedBy: z.string().optional(),
    date: z.coerce.date(),
    nextDueDate: z.coerce.date().optional(),
    status: z.enum(maintenanceStatus).default('COMPLETED'),
  }),
});

export const updateMaintenanceSchema = z.object({
  body: z.object({
    type: z.enum(ENUMS.maintenanceType).optional(),
    description: z.string().min(1).optional(),
    cost: z.coerce.number().nonnegative().optional(),
    performedBy: z.string().optional(),
    date: z.coerce.date().optional(),
    nextDueDate: z.coerce.date().nullable().optional(),
    status: z.enum(maintenanceStatus).optional(),
  }),
});

export const createFuelSchema = z.object({
  body: z.object({
    equipmentId: z.coerce.number().int().positive('المعدة مطلوبة'),
    liters: z.coerce.number().positive('عدد اللترات يجب أن يكون موجبًا'),
    cost: z.coerce.number().nonnegative().default(0),
    odometer: z.coerce.number().nonnegative().optional(),
    date: z.coerce.date().optional(),
    notes: z.string().optional(),
  }),
});

export const createBreakdownSchema = z.object({
  body: z.object({
    equipmentId: z.coerce.number().int().positive('المعدة مطلوبة'),
    description: z.string().min(1, 'وصف العطل مطلوب'),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  }),
});

export const createSparePartSchema = z.object({
  body: z.object({
    equipmentId: z.coerce.number().int().positive('المعدة مطلوبة'),
    partName: z.string().min(1, 'اسم القطعة مطلوب'),
    quantity: z.coerce.number().int().positive().default(1),
    unitCost: z.coerce.number().nonnegative().default(0),
    date: z.coerce.date().optional(),
  }),
});

export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>['body'];
export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>['body'];
export type CreateFuelInput = z.infer<typeof createFuelSchema>['body'];
export type CreateBreakdownInput = z.infer<typeof createBreakdownSchema>['body'];
export type CreateSparePartInput = z.infer<typeof createSparePartSchema>['body'];
