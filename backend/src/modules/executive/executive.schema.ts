import { z } from 'zod';

export const kpiTimelinePeriodSchema = z.object({
  period: z.enum(['1m', '3m', '6m', '12m']).default('6m'),
});
