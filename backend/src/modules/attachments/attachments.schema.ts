import { z } from 'zod';

export const ALLOWED_ENTITY_TYPES = [
  'CUSTOMER', 'CONTRACT', 'INVOICE', 'EMPLOYEE', 'SUPPLIER', 'EXPENSE', 'EQUIPMENT',
] as const;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const listQuerySchema = z.object({
  entityType: z.enum(ALLOWED_ENTITY_TYPES),
  entityId:   z.coerce.number().int().positive(),
});

export const deleteParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
