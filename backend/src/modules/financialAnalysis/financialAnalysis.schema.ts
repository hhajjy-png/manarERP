import { z } from 'zod';

/**
 * فلتر الصفحة **الوحيد** — تُطبَّق نتيجته على الأقسام السبعة دفعةً واحدة.
 *
 * الواجهة تحلّ «السنة / الشهر / فترة مخصصة» إلى `from`/`to` قبل الإرسال، فيبقى
 * عقد الخادم واحدًا لا ثلاثة، ويستحيل أن يفسّر قسمٌ الفترة على نحو مختلف.
 */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');

export const analysisQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;

export const drilldownQuerySchema = analysisQuerySchema.extend({
  kind: z.enum(['revenue', 'expenses', 'collections']),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'صيغة الشهر يجب أن تكون YYYY-MM').optional(),
  category: z.string().min(1).max(60).optional(),
  customerId: z.coerce.number().int().positive().optional(),
});

export type DrilldownQuery = z.infer<typeof drilldownQuerySchema>;
