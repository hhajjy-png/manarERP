import { z } from 'zod';
import { ENUMS } from '../../config/constants';
import { endOfDay } from '../../core/utils/dateWindows';

// فاتورة مستقبلية التاريخ ممنوعة: تاريخ الإصدار لا يتجاوز نهاية اليوم المحلي الحالي.
// دالة واحدة يشترك فيها create/update حتى لا تنحرف رسالة أو حدّ الفحص بين المسارين.
const FUTURE_ISSUE_DATE_MESSAGE = 'تاريخ الفاتورة لا يمكن أن يكون في المستقبل';
function isNotFutureIssueDate(d: { issueDate?: Date }): boolean {
  return !d.issueDate || d.issueDate <= endOfDay(new Date());
}

// GL payment method for purchase invoice routing (Part 2 — Phase D)
const glPaymentMethod = z.enum(ENUMS.glPaymentMethod).optional();

const invoiceNumberSchema = z.string().trim().min(1, 'رقم الفاتورة مطلوب').regex(/^MN-INV-\d{4}-[A-Za-z0-9]+$/, 'رقم الفاتورة يجب أن يبدأ بـ MN-INV-YYYY-');

const itemSchema = z.object({
  description: z.string().min(1, 'وصف البند مطلوب'),
  quantity: z.coerce.number().positive('الكمية يجب أن تكون موجبة').default(1),
  unit: z.string().trim().min(1, 'الوحدة مطلوبة').default('طن'),
  unitPrice: z.coerce.number().nonnegative('السعر يجب ألا يكون سالبًا').default(0),
  priceId: z.coerce.number().int().positive().optional().nullable(),
});

export const createInvoiceSchema = z.object({
  body: z
    .object({
      invoiceNumber: invoiceNumberSchema,
      number: z.string().min(1).optional(),
      direction: z.string().min(1, 'الاتجاه مطلوب').default('SALES'),
      invoiceType: z.string().min(1, 'نوع الفاتورة مطلوب').default('نقل اسفلت'),
      customerId: z.coerce.number().int().positive().optional(),
      supplierId: z.coerce.number().int().positive().optional(),
      contractId: z.coerce.number().int().positive().optional(),
      issueDate: z.coerce.date().optional(),
      dueDate: z.coerce.date().optional(),
      deliveryDate: z.coerce.date().optional().nullable(),
      billingMonth: z.coerce.number().int().min(1).max(12).optional(),
      billingYear: z.coerce.number().int().min(2020).max(2099).optional(),
      taxRate: z.coerce.number().min(0).max(100).default(0),
      discount: z.coerce.number().nonnegative().default(0),
      notes: z.string().optional(),
      paymentMethod: glPaymentMethod, // GL routing for PURCHASE invoices
      items: z.array(itemSchema).min(1, 'يجب إضافة بند واحد على الأقل'),
      // سبب الإدخال المتأخر لفاتورة تخصّ سنة سابقة — يُسجَّل في Audit Log فقط.
      lateEntryReason: z.string().trim().max(500).optional(),
    })
    .refine(
      (d) => {
        if (d.direction === 'SALES') return !!d.customerId;
        if (d.direction === 'PURCHASE') return !!d.supplierId;
        // custom direction — requires either a customer or supplier
        return !!d.customerId || !!d.supplierId;
      },
      {
        message: 'فاتورة المبيعات تتطلب عميلًا، فاتورة المشتريات تتطلب مورّدًا، والاتجاه المخصص يتطلب أحدهما',
        path: ['customerId'],
      },
    )
    .refine((d) => !d.dueDate || !d.issueDate || d.dueDate >= d.issueDate, {
      message: 'تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الإصدار',
      path: ['dueDate'],
    })
    .refine(isNotFutureIssueDate, { message: FUTURE_ISSUE_DATE_MESSAGE, path: ['issueDate'] }),
});

export const updateInvoiceSchema = z.object({
  body: z.object({
    invoiceNumber: invoiceNumberSchema.optional(),
    direction: z.string().min(1).optional(),
    customerId: z.coerce.number().int().positive().nullable().optional(),
    supplierId: z.coerce.number().int().positive().nullable().optional(),
    contractId: z.coerce.number().int().positive().nullable().optional(),
    invoiceType: z.string().min(1).optional(),
    issueDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    deliveryDate: z.coerce.date().optional().nullable(),
    billingMonth: z.coerce.number().int().min(1).max(12).optional(),
    billingYear: z.coerce.number().int().min(2020).max(2099).optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    discount: z.coerce.number().nonnegative().optional(),
    notes: z.string().optional(),
    paymentMethod: glPaymentMethod, // GL routing for PURCHASE invoices
    items: z.array(itemSchema).min(1).optional(),
  }).refine((d) => !d.dueDate || !d.issueDate || d.dueDate >= d.issueDate, {
    message: 'تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الإصدار',
    path: ['dueDate'],
  }).refine(isNotFutureIssueDate, { message: FUTURE_ISSUE_DATE_MESSAGE, path: ['issueDate'] }),
});

export const addPaymentSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive('المبلغ يجب أن يكون موجبًا'),
    method: z.enum(ENUMS.paymentMethod).default('CASH'),
    date: z.coerce.date().optional(), // تاريخ التحصيل — official collection date; falls back to now() when omitted
    reference: z.string().optional(),
    notes: z.string().optional(),
    lateEntryReason: z.string().trim().max(500).optional(),
  }),
});

export const forceDeleteInvoiceSchema = z.object({
  body: z.object({
    confirmation: z.string().min(1, 'التأكيد مطلوب'),
  }),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>['body'];
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>['body'];
export type AddPaymentInput = z.infer<typeof addPaymentSchema>['body'];
export type ForceDeleteInvoiceInput = z.infer<typeof forceDeleteInvoiceSchema>['body'];
