import { z } from 'zod';
import { ENUMS } from '@config/constants';

// ── تصنيفات المواد ────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'اسم التصنيف مطلوب'),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const updateCategorySchema = z.object({
  body: createCategorySchema.shape.body.partial(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];

// ── المواد ────────────────────────────────────────────────────────────────

export const createMaterialSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'رمز المادة مطلوب'),
    name: z.string().min(1, 'اسم المادة مطلوب'),
    categoryId: z.number().int().positive('التصنيف مطلوب'),
    unit: z.enum(ENUMS.materialUnit, { errorMap: () => ({ message: 'وحدة القياس غير صحيحة' }) }),
    unitCost: z.number().min(0).optional(),
    currentStock: z.number().min(0).optional(),
    minimumStock: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
    notes: z.string().optional(),
  }),
});

export const updateMaterialSchema = z.object({
  body: createMaterialSchema.shape.body.partial(),
});

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>['body'];
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>['body'];
