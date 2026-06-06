import { Request, Response } from 'express';
import { equipmentService } from './equipment.service';
import { ok, created } from '../../core/utils/response';

export const equipmentController = {
  async list(req: Request, res: Response) {
    ok(res, await equipmentService.list(req.query));
  },
  async summary(_req: Request, res: Response) {
    ok(res, await equipmentService.statusSummary());
  },
  async expiring(req: Request, res: Response) {
    const days = req.query.days ? Number(req.query.days) : 30;
    ok(res, await equipmentService.expiringRegistrations(days));
  },
  async getById(req: Request, res: Response) {
    ok(res, await equipmentService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await equipmentService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await equipmentService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async remove(req: Request, res: Response) {
    ok(res, await equipmentService.remove(Number(req.params.id), req), 'تم الحذف');
  },
};
