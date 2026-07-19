import { z } from 'zod';

export const createHolidaySchema = z.object({
  body: z.object({
    date: z.coerce.date(),
    name: z.string().min(1, 'اسم العطلة مطلوب'),
    notes: z.string().optional(),
  }),
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>['body'];
