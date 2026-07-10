import { z } from 'zod';
import { endOfDay } from './dateWindows';

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

function parseLocal(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function resolvePeriod(q: PeriodQuery | undefined): PeriodFilter {
  const from = parseLocal(q?.fromDate);
  const to = q?.toDate ? endOfDay(new Date(`${q.toDate.slice(0, 10)}T00:00:00`)) : undefined;
  if (!from && !to) return { hasRange: false };
  const flow: { gte?: Date; lte?: Date } = {};
  if (from) flow.gte = from;
  if (to) flow.lte = to;
  return { flow, asOf: to, hasRange: true };
}
