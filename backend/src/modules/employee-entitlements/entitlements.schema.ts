import { z } from 'zod';
import { ENUMS } from '../../config/constants';

/**
 * مخططات التحقق لنطاق مستحقات الموظف.
 *
 * المستخدم لا يُدخل أي قيمة محتسَبة: لا أيام إجازة مكافئة، ولا رصيد متبقٍّ، ولا استحقاق.
 * مدخلاته الجوهرية: **المبلغ + التاريخ** (وطريقة الدفع ومرجع/ملاحظة اختياريان).
 */

/** تاريخ الاحتساب الاختياري — يسمح بكشف قابل لإعادة الإنتاج عند أي تاريخ. */
export const entitlementStatementQuerySchema = z.object({
  query: z.object({
    asOf: z.coerce.date({ invalid_type_error: 'تاريخ الاحتساب غير صالح' }).optional(),
  }),
});

export const recordEntitlementPaymentSchema = z.object({
  body: z.object({
    category: z.enum(ENUMS.entitlementLedgerType),
    paymentDate: z.coerce.date({ invalid_type_error: 'تاريخ الدفعة غير صالح' }),
    amount: z.coerce.number().positive('مبلغ الدفعة يجب أن يكون أكبر من صفر'),
    paymentMethod: z.enum(ENUMS.leaveSettlementPaymentMethod),
    reference: z.string().optional(),
    notes: z.string().optional(),
  }),
});

/**
 * تعديل دفعة مسجَّلة — الحقول التي أدخلها المستخدم وحدها.
 *
 * لا `category` ولا `employeeId` هنا عمدًا: الفئة تُقرأ من الصف القائم، والموظف من المسار.
 * تغيير أيٍّ منهما يُبدّل معنى الحركة الأصلية بدل تصحيحها، فمُنِع على مستوى المخطط نفسه —
 * لا اعتمادًا على تجاهله لاحقًا في الخدمة.
 */
export const updateEntitlementPaymentSchema = z.object({
  body: z.object({
    paymentDate: z.coerce.date({ invalid_type_error: 'تاريخ الدفعة غير صالح' }),
    amount: z.coerce.number().positive('مبلغ الدفعة يجب أن يكون أكبر من صفر'),
    paymentMethod: z.enum(ENUMS.leaveSettlementPaymentMethod),
    reference: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export type EntitlementStatementQuery = z.infer<typeof entitlementStatementQuerySchema>['query'];
export type RecordEntitlementPaymentInput = z.infer<typeof recordEntitlementPaymentSchema>['body'];
export type UpdateEntitlementPaymentInput = z.infer<typeof updateEntitlementPaymentSchema>['body'];
