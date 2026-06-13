import { Request, Response } from 'express';
import { formsService } from './forms.service';
import { ok } from '../../core/utils/response';

export const formsController = {
  async getSalaryCertificate(req: Request, res: Response) {
    const data = await formsService.getSalaryCertificateData(Number(req.params.employeeId));
    ok(res, data);
  },
};
