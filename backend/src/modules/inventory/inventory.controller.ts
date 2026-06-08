import { Request, Response } from 'express';
import { categoriesService, materialsService, purchaseOrdersService, goodsReceiptsService, materialIssuesService } from './inventory.service';
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

// ── أوامر الشراء ──────────────────────────────────────────────────────────

export const purchaseOrdersController = {
  async list(req: Request, res: Response) {
    ok(res, await purchaseOrdersService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await purchaseOrdersService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await purchaseOrdersService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await purchaseOrdersService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async submit(req: Request, res: Response) {
    ok(res, await purchaseOrdersService.submit(Number(req.params.id), req), 'تم الإرسال بنجاح');
  },
  async cancel(req: Request, res: Response) {
    ok(res, await purchaseOrdersService.cancel(Number(req.params.id), req), 'تم الإلغاء');
  },
  async remove(req: Request, res: Response) {
    ok(res, await purchaseOrdersService.remove(Number(req.params.id), req), 'تم الحذف');
  },
};

// ── سندات الاستلام ────────────────────────────────────────────────────────

export const goodsReceiptsController = {
  async list(req: Request, res: Response) {
    ok(res, await goodsReceiptsService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await goodsReceiptsService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await goodsReceiptsService.create(req.body, req));
  },
  async post(req: Request, res: Response) {
    ok(res, await goodsReceiptsService.post(Number(req.params.id), req), 'تم الترحيل وتحديث المخزون');
  },
  async remove(req: Request, res: Response) {
    ok(res, await goodsReceiptsService.remove(Number(req.params.id), req), 'تم الحذف');
  },
};

// ── سندات الصرف ───────────────────────────────────────────────────────────

export const materialIssuesController = {
  async list(req: Request, res: Response) {
    ok(res, await materialIssuesService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await materialIssuesService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await materialIssuesService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await materialIssuesService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async post(req: Request, res: Response) {
    ok(res, await materialIssuesService.post(Number(req.params.id), req), 'تم الترحيل وخصم المخزون');
  },
  async cancel(req: Request, res: Response) {
    ok(res, await materialIssuesService.cancel(Number(req.params.id), req), 'تم الإلغاء واستعادة المخزون');
  },
  async remove(req: Request, res: Response) {
    ok(res, await materialIssuesService.remove(Number(req.params.id), req), 'تم الحذف');
  },
};
