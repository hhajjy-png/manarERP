import { z } from 'zod';

export const expirationFiltersSchema = z.object({
  urgency:  z.enum(['expired', '7', '30', '60', '90', 'ok', 'all']).optional().default('all'),
  category: z.string().optional(),
  search:   z.string().optional(),
});

export type ExpirationFilters = z.infer<typeof expirationFiltersSchema>;
