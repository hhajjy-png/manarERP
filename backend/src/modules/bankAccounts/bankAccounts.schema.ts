import { z } from 'zod';

export const AccountKeyParamSchema = z.object({
  accountKey: z.string().min(1).max(256),
});
