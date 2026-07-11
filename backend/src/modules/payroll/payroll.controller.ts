import { Request, Response } from 'express';
import { payrollService } from './payroll.service';
import { parsePayrollRouteId } from './payrollMonth.readModel';
import { ok, created } from '../../core/utils/response';

export const payrollController = {
  async list(req: Request, res: Response) {
    ok(res, await payrollService.list(req.query));
  },
  async stats(req: Request, res: Response) {
    ok(res, await payrollService.stats(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await payrollService.getById(parsePayrollRouteId(req.params.id)));
  },
  async preview(req: Request, res: Response) {
    ok(res, await payrollService.preview(req.body));
  },
  async generate(req: Request, res: Response) {
    created(res, await payrollService.generate(req.body, req), 'تم توليد كشف الرواتب');
  },
  async update(req: Request, res: Response) {
    ok(res, await payrollService.update(parsePayrollRouteId(req.params.id), req.body, req), 'تم تحديث كشف الراتب');
  },
  async addManualLine(req: Request, res: Response) {
    created(res, await payrollService.addManualLine(parsePayrollRouteId(req.params.id), req.body, req), 'تمت إضافة بند التسوية');
  },
  async approve(req: Request, res: Response) {
    ok(res, await payrollService.approve(parsePayrollRouteId(req.params.id), req), 'تم اعتماد الكشف');
  },
  async cancel(req: Request, res: Response) {
    ok(res, await payrollService.cancel(parsePayrollRouteId(req.params.id), req), 'تم إلغاء الكشف');
  },
  async markPaid(req: Request, res: Response) {
    ok(res, await payrollService.markPaid(parsePayrollRouteId(req.params.id), req.body, req), 'تم صرف الراتب وترحيل القيد المحاسبي');
  },
  async createAllowance(req: Request, res: Response) {
    created(res, await payrollService.createAllowance(req.body, req));
  },
  async createRecurringDeduction(req: Request, res: Response) {
    created(res, await payrollService.createRecurringDeduction(req.body, req));
  },
  async createAdvance(req: Request, res: Response) {
    created(res, await payrollService.createAdvance(req.body, req));
  },
  async payslip(req: Request, res: Response) {
    ok(res, await payrollService.payslip(parsePayrollRouteId(req.params.id)));
  },
};
