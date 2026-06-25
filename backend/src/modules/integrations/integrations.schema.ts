import { z } from 'zod';

export const UpdateIntegrationSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  notes:   z.string().max(500, 'الملاحظات لا تتجاوز 500 حرف').optional(),
});

export type UpdateIntegrationSettingsInput = z.infer<typeof UpdateIntegrationSettingsSchema>;
