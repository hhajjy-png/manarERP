import { z } from 'zod';
import { ENUMS } from '../../config/constants';

const invoiceNumberSchema = z.string().trim().min(1, 'رقم الفاتورة مطلوب').regex(/^MN-INV-\d{4}-[A-Za-z0-9]+$/, 'صيغة رقم الفاتورة غير صحيحة — المطلوب: MN-INV-YYYY-XXXX');

const itemSchema = z.object({
  description: z.string().min(1, 'وصف البند مطلوب'),
  quantity: z.coerce.number().positive('الكمية يجب أن تكون موجبة').default(1),
  unit: z.enum(ENUMS.invoiceUnit).default('طن'),
  unitPrice: z.coerce.number().nonnegative('السعر يجب ألا يكون سالبًا').default(0),
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
      taxRate: z.coerce.number().min(0).max(100).default(0),
      discount: z.coerce.number().nonnegative().default(0),
      notes: z.string().optional(),
      items: z.array(itemSchema).min(1, 'يجب إضافة بند واحد على الأقل'),
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
    ),
});

export const updateInvoiceSchema = z.object({
  body: z.object({
    invoiceNumber: invoiceNumberSchema.optional(),
    contractId: z.coerce.number().int().positive().nullable().optional(),
    invoiceType: z.string().min(1).optional(),
    issueDate: z.coerce.date().optional(),
    dueDate: z.coerce.date().optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    discount: z.coerce.number().nonnegative().optional(),
    notes: z.string().optional(),
    items: z.array(itemSchema).min(1).optional(),
  }),
});

export const addPaymentSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive('المبلغ يجب أن يكون موجبًا'),
    method: z.enum(ENUMS.paymentMethod).default('CASH'),
    date: z.coerce.date().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>['body'];
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>['body'];
export type AddPaymentInput = z.infer<typeof addPaymentSchema>['body'];
