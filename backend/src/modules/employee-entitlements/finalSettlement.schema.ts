import { z } from 'zod';
import { ENUMS } from '../../config/constants';
import { dateOnlySchema } from '../../core/utils/dateOnly';

/**
 * مخططات التحقق لمسار التصفية النهائية.
 *
 * المستخدم لا يُدخل أي مبلغ محتسَب إطلاقًا: مدخلاته لإنشاء المسودة هي **يوم العمل الأخير
 * وسبب انتهاء الخدمة** فقط، ومدخلاته للدفع هي **المبلغ والتاريخ** (وطريقة الدفع ومرجع/
 * ملاحظة اختياريان). كل قيمة مالية يشتقّها الخادم من المحرّك القانوني الوحيد.
 */

/** إنشاء/تعديل مسودة التصفية — لا مبالغ، لا مكوّنات، لا بنود يدوية. */
export const upsertFinalSettlementSchema = z.object({
  body: z.object({
    lastWorkingDay: dateOnlySchema,
    terminationReason: z.enum(ENUMS.terminationReason),
  }),
});

/** تسجيل دفعة على تصفية معتمدة — نفس نمط دفعات المستحقات القائم. */
export const recordSettlementPaymentSchema = z.object({
  body: z.object({
    paymentDate: dateOnlySchema,
    amount: z.coerce.number().positive('مبلغ الدفعة يجب أن يكون أكبر من صفر'),
    paymentMethod: z.enum(ENUMS.leaveSettlementPaymentMethod),
    reference: z.string().optional(),
    notes: z.string().optional(),
  }),
});

/** إلغاء تصفية معتمدة/مسدَّدة — السبب إلزامي وغير فارغ (توثيق التصحيح لا مجرّد وسم). */
export const cancelFinalSettlementSchema = z.object({
  body: z.object({
    cancellationReason: z.string().trim().min(1, 'سبب الإلغاء مطلوب'),
  }),
});

export type UpsertFinalSettlementInput = z.infer<typeof upsertFinalSettlementSchema>['body'];
export type RecordSettlementPaymentInput = z.infer<typeof recordSettlementPaymentSchema>['body'];
export type CancelFinalSettlementInput = z.infer<typeof cancelFinalSettlementSchema>['body'];
