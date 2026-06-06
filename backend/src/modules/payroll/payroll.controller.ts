import { Request, Response } from 'express';
import { payrollService } from './payroll.service';
import { ok, created } from '../../core/utils/response';

export const payrollController = {
  async list(req: Request, res: Response) {
    ok(res, await payrollService.list(req.query));
  },
  async generate(req: Request, res: Response) {
    created(res, await payrollService.generate(req.body, req), 'تم توليد كشف الرواتب');
  },
  async approve(req: Request, res: Response) {
    ok(res, await payrollService.approve(Number(req.params.id), req), 'تم اعتماد الكشف');
  },
  async markPaid(req: Request, res: Response) {
    ok(res, await payrollService.markPaid(Number(req.params.id), req), 'تم صرف الراتب');
  },
};
