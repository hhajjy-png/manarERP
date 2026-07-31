import { z } from 'zod';
import { dateOnlySchema } from '../../core/utils/dateOnly';

/**
 * تصحيح تاريخ التحصيل الرسمي (Payment.date) لدفعة محصّلة تاريخيًا — إجراء إداري بحت.
 * يتحقق من الجسم فقط؛ معرّف الدفعة يُقرأ من المسار ويُتحقق منه في المتحكّم.
 */
export const correctCollectionDateSchema = z.object({
  // معرّف الدفعة من المسار — تحقق تصريحي موحّد مع الجسم (عدد صحيح موجب).
  params: z.object({
    paymentId: z.coerce.number().int().positive(),
  }),
  body: z.object({
    // تاريخ التحصيل الجديد — DATE-ONLY قانوني (YYYY-MM-DD) فقط؛ يُرفض أي شكل غامض
    // أو غير موجود تقويميًا عبر dateOnlySchema (API Date Hardening Pack v1).
    date: dateOnlySchema,
    // سبب التصحيح (اختياري) — يُسجَّل ضمن سجل التدقيق للحفاظ على الأثر الكامل.
    reason: z.string().trim().max(500, 'السبب طويل جدًا (500 حرف كحد أقصى)').optional(),
  }),
});

export type CorrectCollectionDateInput = z.infer<typeof correctCollectionDateSchema>['body'];
