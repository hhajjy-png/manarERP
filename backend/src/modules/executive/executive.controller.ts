import { Request, Response } from 'express';
import { executiveService } from './executive.service';
import { kpiTimelinePeriodSchema } from './executive.schema';
import { ok } from '../../core/utils/response';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { periodQuerySchema } from '../../core/utils/periodFilter';

export const getDecisionCenter = asyncHandler(async (req: Request, res: Response) => {
  const filters = periodQuerySchema.parse(req.query);
  const data = await executiveService.decisionCenter(filters);
  ok(res, data);
});

export const getKPITimeline = asyncHandler(async (req: Request, res: Response) => {
  const { period } = kpiTimelinePeriodSchema.parse(req.query);
  const data = await executiveService.kpiTimeline(period);
  ok(res, data);
});
