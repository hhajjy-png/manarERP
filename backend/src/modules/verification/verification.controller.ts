import { Request, Response } from 'express';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';
import { verifyByUuid } from './verification.service';

export const verifyByUuidHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await verifyByUuid(req.params.uuid);
  ok(res, result);
});
