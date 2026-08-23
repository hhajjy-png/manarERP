import { z } from 'zod';
import { startOfLocalDay, endOfLocalDay } from '@core/utils/dateWindows';

export const StatementQuerySchema = z.object({
  fromDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  toDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  search: z.string().optional(),
  status: z.string().optional(),
  referenceType: z.enum(['INVOICE', 'PAYMENT', 'EXPENSE']).optional(),
});

export type StatementQuery = z.infer<typeof StatementQuerySchema>;

/**
 * حدّا الكشف بالتقويم المحلي — نفس عقد `localDateRange` في بقية الخلفية.
 *
 * كانت `parseDate` واحدة تُمرِّر `new Date('YYYY-MM-DD')` للحدّين، وهي منتصف ليل **UTC**
 * لا محليًا. في الكويت (UTC+03:00) يعني ذلك أن `gte` يبدأ الساعة 03:00 من يوم البداية
 * فتسقط قيود أول ثلاث ساعات، وأن `lte` ينتهي الساعة 03:00 من اليوم الأخير فيسقط معظمه.
 * التوأم في الوحدة المالية أُصلح سابقًا مع اختبار انحدار؛ هذا المسار كان لا يزال قديمًا.
 *
 * `from` ⇒ 00:00:00.000 محليًا · `to` ⇒ 23:59:59.999 محليًا.
 * الطوابع الزمنية الكاملة (ISO مع إزاحة) تمرّ كما هي — لا تُقصّ إلى حدود اليوم.
 */
const FULL_TIMESTAMP = /[T ]\d{2}:\d{2}/;

export function parseFromDate(value?: string): Date | undefined {
  if (!value) return undefined;
  if (FULL_TIMESTAMP.test(value)) return parseExact(value);
  return startOfLocalDay(value);
}

export function parseToDate(value?: string): Date | undefined {
  if (!value) return undefined;
  if (FULL_TIMESTAMP.test(value)) return parseExact(value);
  return endOfLocalDay(value);
}

function parseExact(value: string): Date | undefined {
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}
