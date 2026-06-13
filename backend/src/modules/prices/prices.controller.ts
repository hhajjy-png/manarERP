import { Request, Response } from 'express';
import { ok, created, noContent } from '@core/utils/response';
import { asyncHandler } from '@core/utils/asyncHandler';
import * as service from './prices.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const result = await service.listPrices({
    page,
    pageSize,
    search: req.query.search as string | undefined,
    asphaltPlant: req.query.asphaltPlant as string | undefined,
    companyName: req.query.companyName as string | undefined,
    contractUnit: req.query.contractUnit as string | undefined,
  });
  ok(res, result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const price = await service.createPrice(req.body);
  created(res, price);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const price = await service.updatePrice(id, req.body);
  ok(res, price);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await service.deletePrice(id);
  noContent(res);
});

export const forceRemovePreview = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await service.forceRemovePreview(Number(req.params.id)));
});

export const forceRemove = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await service.forceRemove(Number(req.params.id), req), 'تم الحذف النهائي بنجاح');
});
