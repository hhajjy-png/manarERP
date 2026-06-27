import { Request, Response } from 'express';
import { chequesService } from './cheques.service';
import { ok, created } from '../../core/utils/response';

export const chequesController = {
  async stats(req: Request, res: Response) {
    ok(res, await chequesService.stats());
  },
  async list(req: Request, res: Response) {
    ok(res, await chequesService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await chequesService.getById(Number(req.params.id)));
  },
  async create(req: Request, res: Response) {
    created(res, await chequesService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await chequesService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async markPrinted(req: Request, res: Response) {
    ok(res, await chequesService.markPrinted(Number(req.params.id), req), 'تم تسجيل الطباعة');
  },
  async cancel(req: Request, res: Response) {
    ok(res, await chequesService.cancel(Number(req.params.id), req), 'تم إلغاء الشيك');
  },
  async generatePaymentVoucherNumber(req: Request, res: Response) {
    const voucherNumber = await chequesService.getOrCreatePaymentVoucherNumber(Number(req.params.id));
    ok(res, { voucherNumber }, 'تم إنشاء رقم سند الصرف');
  },
};
