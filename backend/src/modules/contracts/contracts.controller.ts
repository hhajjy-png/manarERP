import { Request, Response } from 'express';
import { contractsService } from './contracts.service';
import { ok, created } from '../../core/utils/response';

export const contractsController = {
  async list(req: Request, res: Response) {
    ok(res, await contractsService.list(req.query));
  },
  async summary(_req: Request, res: Response) {
    ok(res, await contractsService.monthlyTransportSummary());
  },
  async getById(req: Request, res: Response) {
    ok(res, await contractsService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await contractsService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await contractsService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async remove(req: Request, res: Response) {
    ok(res, await contractsService.remove(Number(req.params.id), req), 'تم الحذف');
  },
  async forceRemovePreview(req: Request, res: Response) {
    ok(res, await contractsService.forceRemovePreview(Number(req.params.id)));
  },
  async forceRemove(req: Request, res: Response) {
    ok(res, await contractsService.forceRemove(Number(req.params.id), req), 'تم الحذف الإجباري بنجاح');
  },
};
