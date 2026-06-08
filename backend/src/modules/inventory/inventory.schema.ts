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

// ── أوامر الشراء ──────────────────────────────────────────────────────────

const purchaseOrderItemSchema = z.object({
  materialId: z.number().int().positive('المادة مطلوبة'),
  quantity: z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unitCost: z.number().min(0, 'التكلفة لا تكون سالبة').default(0),
});

export const createPurchaseOrderSchema = z.object({
  body: z.object({
    supplierId: z.number().int().positive('المورد مطلوب'),
    date: z.string().optional(),
    expectedDate: z.string().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(purchaseOrderItemSchema).min(1, 'يجب إضافة مادة واحدة على الأقل'),
  }),
});

export const updatePurchaseOrderSchema = z.object({
  body: z.object({
    supplierId: z.number().int().positive().optional(),
    date: z.string().optional(),
    expectedDate: z.string().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(purchaseOrderItemSchema).min(1).optional(),
  }),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>['body'];
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>['body'];

// ── سندات الاستلام ────────────────────────────────────────────────────────

const goodsReceiptItemSchema = z.object({
  materialId: z.number().int().positive('المادة مطلوبة'),
  quantity: z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unitCost: z.number().min(0, 'التكلفة لا تكون سالبة'),
});

export const createGoodsReceiptSchema = z.object({
  body: z.object({
    supplierId: z.number().int().positive('المورد مطلوب'),
    purchaseOrderId: z.number().int().positive().optional(),
    date: z.string().optional(),
    notes: z.string().nullable().optional(),
    items: z.array(goodsReceiptItemSchema).min(1, 'يجب إضافة مادة واحدة على الأقل'),
  }),
});

export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptSchema>['body'];
