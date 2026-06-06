import { Request, Response } from 'express';
import { usersService } from './users.service';
import { ok, created } from '../../core/utils/response';

export const usersController = {
  async list(req: Request, res: Response) {
    ok(res, await usersService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await usersService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await usersService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await usersService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async remove(req: Request, res: Response) {
    ok(res, await usersService.remove(Number(req.params.id), req), 'تم تعطيل الحساب');
  },
};
