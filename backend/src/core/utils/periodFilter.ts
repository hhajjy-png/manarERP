import { z } from 'zod';
import { startOfLocalDay, endOfLocalDay } from './dateWindows';

/**
 * فلتر الفترة المالية على مستوى الـ backend.
 *
 * الواجهة ترسل `fromDate`/`toDate` بصيغة `YYYY-MM-DD` (محلية). هذا المحوّل يحوّلها إلى:
 *  - `flow`: فلتر Prisma `{ gte, lte }` لتقارير الحركة (إيراد/مصروف/تحصيل خلال الفترة).
 *  - `asOf`: نهاية الفترة (بنهاية اليوم) لتقارير الأرصدة اللحظية (ذمم/متأخرات كما في تاريخ).
 *
 * عند غياب الحدّين (أو 'all') يعود كلاهما `undefined`، فيعمل الاستعلام على كل الفترات
 * صراحةً — وهو نفس سلوك ما قبل هذه الحزمة (توافق رجعي).
 */

export const periodQuerySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export type PeriodQuery = z.infer<typeof periodQuerySchema>;

export interface PeriodFilter {
  /** فلتر Prisma للحركة، أو undefined لكل الفترات. */
  flow?: { gte?: Date; lte?: Date };
  /** تاريخ الرصيد اللحظي (نهاية اليوم)، أو undefined. */
  asOf?: Date;
  hasRange: boolean;
}

export function resolvePeriod(q: PeriodQuery | undefined): PeriodFilter {
  // حدود التقويم المحلي تُبنى من مكوّنات صريحة في `dateWindows` — لا تفسير ISO.
  const from = startOfLocalDay(q?.fromDate);
  const to = endOfLocalDay(q?.toDate);
  if (!from && !to) return { hasRange: false };
  const flow: { gte?: Date; lte?: Date } = {};
  if (from) flow.gte = from;
  if (to) flow.lte = to;
  return { flow, asOf: to, hasRange: true };
}
