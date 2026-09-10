import { z } from 'zod';
import { RECEIPT_INVOICE_STATUSES, RECEIPT_METHODS } from './receipts.calc';

/* ════════════════════════════════════════════════════════════════════════════
   عقد استعلام صفحة المقبوضات — **واحد** لنقطتَي القائمة والملخّص معًا.

   الفلاتر تصل الاثنتين متطابقةً، فيستحيل أن يعرض الملخّص إجماليًا لمجموعة
   والجدول صفوفَ مجموعة أخرى. الترقيم والفرز يخصّان القائمة وحدها، ولذلك
   يعيشان في امتداد منفصل بدل أن يتسرّبا إلى عقد الملخّص.
   ════════════════════════════════════════════════════════════════════════════ */

/** `YYYY-MM-DD` — نفس عقد `dateWindows.localDateRange` الذي يستهلكها. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');

/**
 * مبلغ حدّ (أدنى/أعلى). `nonnegative` لا `positive`: الصفر حدٌّ أدنى مشروع.
 * سلسلة الاستعلام نصّية دائمًا فيلزم `coerce`.
 */
const amountBound = z.coerce.number().nonnegative().finite();

export const receiptFiltersSchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  customerId: z.coerce.number().int().positive().optional(),
  method: z.enum(RECEIPT_METHODS).optional(),
  /** حالة سداد الفاتورة المقبوض ضدّها — لا «حالة قبض» (لا وجود لها في النموذج). */
  invoiceStatus: z.enum(RECEIPT_INVOICE_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
  minAmount: amountBound.optional(),
  maxAmount: amountBound.optional(),
});

export type ReceiptFiltersQuery = z.infer<typeof receiptFiltersSchema>;

/**
 * عقد القائمة = الفلاتر + الترقيم + الفرز.
 *
 * `pageSize` محدود بـ200 — نفس سقف `core/utils/pagination.MAX_PAGE_SIZE`، وهو
 * ما يعتمد عليه تصدير Excel في الواجهة (`fetchAllRows` يكرّر بـ200 صف/صفحة).
 */
export const receiptListSchema = receiptFiltersSchema.extend({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  sortBy: z.enum(['date', 'amount', 'method', 'customer']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export type ReceiptListQuery = z.infer<typeof receiptListSchema>;
