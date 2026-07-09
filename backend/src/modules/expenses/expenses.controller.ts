import { Request, Response } from 'express';
import { expensesService } from './expenses.service';
import { ok, created } from '../../core/utils/response';

export const expensesController = {
  async list(req: Request, res: Response) {
    ok(res, await expensesService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await expensesService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await expensesService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await expensesService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async approve(req: Request, res: Response) {
    ok(res, await expensesService.approve(Number(req.params.id), req), 'تم اعتماد المصروف');
  },
  async reject(req: Request, res: Response) {
    ok(res, await expensesService.reject(Number(req.params.id), req), 'تم رفض المصروف');
  },
  async cancelApproval(req: Request, res: Response) {
    ok(res, await expensesService.cancelApproval(Number(req.params.id), req), 'تم إلغاء اعتماد المصروف');
  },
  async amend(req: Request, res: Response) {
    ok(res, await expensesService.amend(Number(req.params.id), req), 'تم فتح المصروف للتعديل');
  },
  async cancel(req: Request, res: Response) {
    ok(res, await expensesService.cancel(Number(req.params.id), req), 'تم إلغاء المصروف');
  },
  async remove(req: Request, res: Response) {
    ok(res, await expensesService.remove(Number(req.params.id), req), 'تم الحذف');
  },
  async forceRemovePreview(req: Request, res: Response) {
    ok(res, await expensesService.forceRemovePreview(Number(req.params.id)));
  },
  async forceRemove(req: Request, res: Response) {
    ok(res, await expensesService.forceRemove(Number(req.params.id), req.body.confirmation as string, req), 'تم الحذف النهائي بنجاح');
  },
  async stats(req: Request, res: Response) {
    ok(res, await expensesService.stats(req.query as Record<string, string>));
  },
};
