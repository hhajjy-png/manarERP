import { z } from 'zod';

/* ════════════════════════════════════════════════════════════════════════════
   عقد الفلاتر — واحد لكل نقاط الوحدة (تقرير / تفصيل / تصدير).

   كل الفلاتر اختيارية وتعمل **مجتمعةً**: الغياب يعني «بلا حصر» لا «افتراضي
   خفيّ»، فلا يمكن أن يفسّر جدولان الفلتر نفسه على نحوين مختلفين.
   ════════════════════════════════════════════════════════════════════════════ */

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');

/** حدّ السنوات المقبولة — يمنع سنة خارج أي بيانات ممكنة دون تقييد المصفوفة. */
const fiscalYear = z.coerce.number().int().min(1900).max(2999);

/**
 * عَلَم منطقي قادم من سلسلة استعلام.
 *
 * `z.coerce.boolean()` **لا يصلح** هنا: `Boolean('false') === true`، فكان أي
 * عَلَم مُرسَل صراحةً بقيمة `false` سيُقرأ صادقًا ويقلب نتيجة التقرير. القراءة
 * هنا على القيمة النصّية نفسها، وأي شيء آخر يعني «مطفأ».
 */
const boolFlag = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const collectionFiltersSchema = z.object({
  invoiceFrom: dateOnly.optional(),
  invoiceTo: dateOnly.optional(),
  collectionFrom: dateOnly.optional(),
  collectionTo: dateOnly.optional(),
  invoiceYear: fiscalYear.optional(),
  collectionYear: fiscalYear.optional(),
  customerId: z.coerce.number().int().positive().optional(),
  contractId: z.coerce.number().int().positive().optional(),
  /** `0` مقبول عمدًا: يعني «بنود بلا اتفاقية سعر» (مشروع غير محدّد). */
  projectId: z.coerce.number().int().min(0).optional(),
  settlement: z.enum(['PAID', 'PARTIAL', 'UNPAID']).optional(),
  overdueOnly: boolFlag.optional(),
  outstandingOnly: boolFlag.optional(),
  collectionScope: z.enum(['all', 'same-year', 'other-years']).optional(),
  search: z.string().trim().max(120).optional(),
});

export type CollectionFiltersQuery = z.infer<typeof collectionFiltersSchema>;

export const collectionDrilldownSchema = collectionFiltersSchema.extend({
  scopeInvoiceYear: fiscalYear.optional(),
  scopeCollectionYear: fiscalYear.optional(),
  dimension: z.enum(['customer', 'contract', 'project']).optional(),
  dimensionId: z.coerce.number().int().min(0).optional(),
});

export type CollectionDrilldownQuery = z.infer<typeof collectionDrilldownSchema>;
