import { Request, Response } from 'express';
import { suppliersService } from './suppliers.service';
import { ok, created } from '../../core/utils/response';

export const suppliersController = {
  async list(req: Request, res: Response) {
    ok(res, await suppliersService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await suppliersService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await suppliersService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await suppliersService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async archive(req: Request, res: Response) {
    ok(res, await suppliersService.setArchived(Number(req.params.id), true, req), 'تمت الأرشفة');
  },
  async unarchive(req: Request, res: Response) {
    ok(res, await suppliersService.setArchived(Number(req.params.id), false, req), 'تم إلغاء الأرشفة');
  },
  async remove(req: Request, res: Response) {
    ok(res, await suppliersService.remove(Number(req.params.id), req), 'تم الحذف');
  },
  async forceRemovePreview(req: Request, res: Response) {
    ok(res, await suppliersService.forceRemovePreview(Number(req.params.id)));
  },
  async forceRemove(req: Request, res: Response) {
    ok(res, await suppliersService.forceRemove(Number(req.params.id), req), 'تم الحذف الإجباري بنجاح');
  },
};
