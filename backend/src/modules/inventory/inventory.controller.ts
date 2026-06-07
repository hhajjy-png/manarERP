import { Request, Response } from 'express';
import { categoriesService, materialsService } from './inventory.service';
import { ok, created } from '@core/utils/response';

// ── تصنيفات المواد ────────────────────────────────────────────────────────

export const categoriesController = {
  async list(req: Request, res: Response) {
    ok(res, await categoriesService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await categoriesService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await categoriesService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await categoriesService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async remove(req: Request, res: Response) {
    ok(res, await categoriesService.remove(Number(req.params.id), req), 'تم الحذف');
  },
};

// ── المواد ────────────────────────────────────────────────────────────────

export const materialsController = {
  async list(req: Request, res: Response) {
    ok(res, await materialsService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await materialsService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await materialsService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await materialsService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async remove(req: Request, res: Response) {
    ok(res, await materialsService.remove(Number(req.params.id), req), 'تم الحذف');
  },
};
