import { Request, Response } from 'express';
import { holidaysService } from './holidays.service';
import { ok, created } from '../../core/utils/response';

export const holidaysController = {
  async list(_req: Request, res: Response) {
    ok(res, await holidaysService.list());
  },
  async create(req: Request, res: Response) {
    created(res, await holidaysService.create(req.body, req), 'تمت إضافة العطلة بنجاح');
  },
  async remove(req: Request, res: Response) {
    ok(res, await holidaysService.remove(Number(req.params.id), req), 'تم حذف العطلة بنجاح');
  },
};
