import { Request, Response } from 'express';
import { ok } from '../../core/utils/response';
import { payrollBankExportService, listExportProfiles } from './payrollBankExport.service';

export const payrollBankExportController = {
  async profiles(_req: Request, res: Response) {
    ok(res, listExportProfiles());
  },

  async preview(req: Request, res: Response) {
    const profileId = String(req.query.profile ?? 'nbk_salary_xls');
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    ok(res, await payrollBankExportService.buildPreview(profileId, month, year));
  },
};
