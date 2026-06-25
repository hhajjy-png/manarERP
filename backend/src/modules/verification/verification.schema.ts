import { z } from 'zod';

export const verifyByUuidSchema = z.object({
  params: z.object({
    uuid: z.string().min(1, 'UUID مطلوب'),
  }),
});
