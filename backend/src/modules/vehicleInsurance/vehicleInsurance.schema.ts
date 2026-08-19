import { z } from 'zod';
import { ENUMS } from '../../config/constants';
import { dateOnlySchema } from '../../core/utils/dateOnly';

/**
 * تأمين المركبات — عقود التحقق (Vehicle Insurance Management v1).
 *
 * كل حقول التواريخ من نوع DATE-ONLY فتستخدم `dateOnlySchema` القانوني (يرفض الصيغ
 * الغامضة ويطبّع إلى منتصف ليل UTC) — لا `z.coerce.date()` في أي موضع.
 */

export const createPolicySchema = z.object({
  body: z
    .object({
      equipmentId: z.coerce.number().int().positive('المعدة مطلوبة'),
      policyNumber: z.string().trim().min(1, 'رقم وثيقة التأمين مطلوب'),
      insurerName: z.string().trim().min(1, 'شركة التأمين مطلوبة'),
      coverageType: z.enum(ENUMS.insuranceCoverageType),
      startDate: dateOnlySchema,
      endDate: dateOnlySchema,
      cost: z.coerce.number().nonnegative('تكلفة التأمين لا يمكن أن تكون سالبة').default(0),
      notes: z.string().trim().optional(),
    })
    // وثيقة تنتهي قبل أن تبدأ بيانات خاطئة لا حالة تشغيلية — تُرفض في الحدود لا في الخدمة.
    .refine((b) => b.endDate.getTime() >= b.startDate.getTime(), {
      message: 'تاريخ انتهاء التأمين يجب أن يكون في أو بعد تاريخ البدء',
      path: ['endDate'],
    }),
});

/**
 * تصحيح وثيقة قائمة — **ليس تجديدًا**. التجديد يمرّ بـ `createPolicySchema` وينشئ سجلًا
 * جديدًا، فالمعدة (`equipmentId`) غير قابلة للتعديل هنا عمدًا: نقل وثيقة من مركبة إلى
 * أخرى ليس تصحيحًا كتابيًا، ويكسر سجل المركبتين معًا.
 */
export const updatePolicySchema = z.object({
  body: z
    .object({
      policyNumber: z.string().trim().min(1, 'رقم وثيقة التأمين مطلوب').optional(),
      insurerName: z.string().trim().min(1, 'شركة التأمين مطلوبة').optional(),
      coverageType: z.enum(ENUMS.insuranceCoverageType).optional(),
      startDate: dateOnlySchema.optional(),
      endDate: dateOnlySchema.optional(),
      cost: z.coerce.number().nonnegative('تكلفة التأمين لا يمكن أن تكون سالبة').optional(),
      notes: z.string().trim().nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'لا توجد حقول للتعديل' })
    // الفحص هنا يغطي الحالة التي يُرسَل فيها التاريخان معًا؛ الحالة الجزئية (تاريخ واحد
    // مقابل المحفوظ) تُفحَص في الخدمة حيث تتوفر القيمة القديمة.
    .refine((b) => !(b.startDate && b.endDate) || b.endDate.getTime() >= b.startDate.getTime(), {
      message: 'تاريخ انتهاء التأمين يجب أن يكون في أو بعد تاريخ البدء',
      path: ['endDate'],
    }),
});

export const createAccidentSchema = z.object({
  body: z.object({
    equipmentId: z.coerce.number().int().positive('المعدة مطلوبة'),
    accidentDate: dateOnlySchema,
    description: z.string().trim().min(1, 'وصف الحادث مطلوب'),
    repairCost: z.coerce.number().nonnegative('تكلفة الإصلاح لا يمكن أن تكون سالبة').optional(),
    notes: z.string().trim().optional(),
  }),
});

export const updateAccidentSchema = z.object({
  body: z
    .object({
      accidentDate: dateOnlySchema.optional(),
      description: z.string().trim().min(1, 'وصف الحادث مطلوب').optional(),
      repairCost: z.coerce.number().nonnegative('تكلفة الإصلاح لا يمكن أن تكون سالبة').nullable().optional(),
      notes: z.string().trim().nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'لا توجد حقول للتعديل' }),
});

/** فلاتر الجدول الرئيسي (وثيقة واحدة سارية/أحدث لكل مركبة). */
export const policyFiltersSchema = z.object({
  search: z.string().trim().optional(),
  insurer: z.string().trim().optional(),
  // القيم مكتوبة صريحةً (لا نشر مصفوفة) لأن `z.enum` يتطلّب tuple لا `string[]`.
  status: z.enum(['VALID', 'EXPIRING_SOON', 'EXPIRED', 'all']).optional().default('all'),
});

export type CreatePolicyInput = z.infer<typeof createPolicySchema>['body'];
export type UpdatePolicyInput = z.infer<typeof updatePolicySchema>['body'];
export type CreateAccidentInput = z.infer<typeof createAccidentSchema>['body'];
export type UpdateAccidentInput = z.infer<typeof updateAccidentSchema>['body'];
export type PolicyFilters = z.infer<typeof policyFiltersSchema>;
