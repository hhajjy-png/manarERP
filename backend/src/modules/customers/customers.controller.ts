import { Request, Response } from 'express';
import { customersService } from './customers.service';
import { ok, created } from '../../core/utils/response';

export const customersController = {
  async list(req: Request, res: Response) {
    ok(res, await customersService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await customersService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await customersService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await customersService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async archive(req: Request, res: Response) {
    ok(res, await customersService.setArchived(Number(req.params.id), true, req), 'تمت الأرشفة');
  },
  async unarchive(req: Request, res: Response) {
    ok(res, await customersService.setArchived(Number(req.params.id), false, req), 'تم إلغاء الأرشفة');
  },
  async remove(req: Request, res: Response) {
    ok(res, await customersService.remove(Number(req.params.id), req), 'تم الحذف');
  },
};
