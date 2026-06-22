import { Request, Response } from 'express';
import { executiveService } from './executive.service';
import { kpiTimelinePeriodSchema } from './executive.schema';
import { ok } from '../../core/utils/response';
import { asyncHandler } from '../../core/utils/asyncHandler';

export const getDecisionCenter = asyncHandler(async (_req: Request, res: Response) => {
  const data = await executiveService.decisionCenter();
  ok(res, data);
});

export const getKPITimeline = asyncHandler(async (req: Request, res: Response) => {
  const { period } = kpiTimelinePeriodSchema.parse(req.query);
  const data = await executiveService.kpiTimeline(period);
  ok(res, data);
});
