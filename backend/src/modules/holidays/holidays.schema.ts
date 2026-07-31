import { z } from 'zod';
import { dateOnlySchema } from '../../core/utils/dateOnly';

export const createHolidaySchema = z.object({
  body: z.object({
    date: dateOnlySchema,
    name: z.string().min(1, 'اسم العطلة مطلوب'),
    notes: z.string().optional(),
  }),
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>['body'];

// توليد العطل (Kuwait Holiday Intelligence Pack v1) — سنة الهدف فقط لكلا مسارَي
// المعاينة (بلا كتابة) والتطبيق (Part 1: لا كتابة قبل تأكيد المستخدم صراحةً في الواجهة).
export const generateHolidaysSchema = z.object({
  body: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
  }),
});

export type GenerateHolidaysInput = z.infer<typeof generateHolidaysSchema>['body'];
