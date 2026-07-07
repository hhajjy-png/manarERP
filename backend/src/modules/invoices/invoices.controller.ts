import { Request, Response } from 'express';
import { invoicesService } from './invoices.service';
import { ok, created } from '../../core/utils/response';

export const invoicesController = {
  async list(req: Request, res: Response) {
    ok(res, await invoicesService.list(req.query));
  },
  async getStats(req: Request, res: Response) {
    ok(res, await invoicesService.stats(req.query));
  },
  async getMonthlyReport(req: Request, res: Response) {
    ok(res, await invoicesService.monthlyReport(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await invoicesService.getById(Number(req.params.id)));
  },
  async nextNumber(req: Request, res: Response) {
    const year = Number(req.query.year) || new Date().getFullYear();
    ok(res, { nextNumber: await invoicesService.getNextInvoiceNumber(year) });
  },
  async create(req: Request, res: Response) {
    created(res, await invoicesService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await invoicesService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async addPayment(req: Request, res: Response) {
    ok(res, await invoicesService.addPayment(Number(req.params.id), req.body, req), 'تم تسجيل الدفعة');
  },
  async approve(req: Request, res: Response) {
    ok(res, await invoicesService.approve(Number(req.params.id), req), 'تم اعتماد الفاتورة');
  },
  async cancel(req: Request, res: Response) {
    ok(res, await invoicesService.cancel(Number(req.params.id), req), 'تم إلغاء الفاتورة');
  },
  async remove(req: Request, res: Response) {
    ok(res, await invoicesService.remove(Number(req.params.id), req), 'تم الحذف');
  },
  async forceRemovePreview(req: Request, res: Response) {
    ok(res, await invoicesService.forceRemovePreview(Number(req.params.id)));
  },
  async forceRemove(req: Request, res: Response) {
    ok(res, await invoicesService.forceRemove(Number(req.params.id), req.body.confirmation as string, req), 'تم الحذف الإجباري بنجاح');
  },
};
