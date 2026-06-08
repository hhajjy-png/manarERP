import { Request, Response } from 'express';
import { ok } from '../../core/utils/response';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { validate } from '../../core/middleware/validate.middleware';
import { importRequestSchema } from './import.schema';
import { previewImport, executeImport } from './import.service';
import type { EntityType } from './import.types';

export const validateImportBody = validate(importRequestSchema);

export const previewHandler = asyncHandler(async (req: Request, res: Response) => {
  const { entityType, rows } = req.body as { entityType: EntityType; rows: Record<string, unknown>[] };
  const result = await previewImport(entityType, rows);
  ok(res, result);
});

export const executeHandler = asyncHandler(async (req: Request, res: Response) => {
  const { entityType, rows } = req.body as { entityType: EntityType; rows: Record<string, unknown>[] };
  const result = await executeImport(req, entityType, rows);
  ok(res, result);
});
