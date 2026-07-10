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
  async reprint(req: Request, res: Response) {
    ok(res, await chequesService.reprint(Number(req.params.id), req.body, req), 'تم تسجيل إعادة الطباعة');
  },
  async listPrintLogs(req: Request, res: Response) {
    ok(res, await chequesService.listPrintLogs(Number(req.params.id)));
  },
  async saveTemplateVersion(req: Request, res: Response) {
    created(res, await chequesService.saveTemplateVersion(req.body, req), 'تم حفظ نسخة النموذج');
  },
  async listTemplateVersions(req: Request, res: Response) {
    ok(res, await chequesService.listTemplateVersions(String(req.params.bank)));
  },
  async restoreTemplateVersion(req: Request, res: Response) {
    ok(res, await chequesService.restoreTemplateVersion(Number(req.params.id), req), 'تم استعادة النسخة');
  },
  async getCalibrationGeometry(_req: Request, res: Response) {
    ok(res, await chequesService.getCalibrationGeometry());
  },
  async saveCalibrationGeometry(req: Request, res: Response) {
    ok(res, await chequesService.saveCalibrationGeometry(req.body, req), 'تم حفظ إعدادات القياس');
  },
  async cancel(req: Request, res: Response) {
    ok(res, await chequesService.cancel(Number(req.params.id), req), 'تم إلغاء الشيك');
  },
  async generatePaymentVoucherNumber(req: Request, res: Response) {
    const voucherNumber = await chequesService.getOrCreatePaymentVoucherNumber(Number(req.params.id));
    ok(res, { voucherNumber }, 'تم إنشاء رقم سند الصرف');
  },
  async forceRemovePreview(req: Request, res: Response) {
    ok(res, await chequesService.forceRemovePreview(Number(req.params.id)));
  },
  async forceRemove(req: Request, res: Response) {
    ok(res, await chequesService.forceRemove(Number(req.params.id), req.body.confirmation as string, req), 'تم الحذف الإجباري بنجاح');
  },
};
