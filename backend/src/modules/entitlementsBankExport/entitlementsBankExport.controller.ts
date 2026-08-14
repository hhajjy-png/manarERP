/**
 * متحكّم كشف المستحقات الشهرية البنكي — تفويض رقيق لا منطق.
 * كل قرار أهلية أو تجميد أو صيغة بنكية يعيش في الخدمة والمحرّك المشترك.
 */
import { Request, Response } from 'express';
import { ok } from '../../core/utils/response';
import {
  entitlementsBankExportService as service,
  listEntitlementsExportProfiles,
} from './entitlementsBankExport.service';

const DEFAULT_PROFILE = 'nbk_entitlements_xls';
const num = (v: unknown): number => Number(v);

export const entitlementsBankExportController = {
  async profiles(_req: Request, res: Response) {
    ok(res, listEntitlementsExportProfiles());
  },

  async month(req: Request, res: Response) {
    ok(res, await service.getMonth(num(req.query.month), num(req.query.year)));
  },

  async preview(req: Request, res: Response) {
    const profileId = String(req.query.profile ?? DEFAULT_PROFILE);
    ok(res, await service.buildPreview(profileId, num(req.query.month), num(req.query.year)));
  },

  async approve(req: Request, res: Response) {
    const { month, year, employeeIds, profileId } = req.body as {
      month: number; year: number; employeeIds: number[]; profileId?: string;
    };
    ok(
      res,
      await service.approve({ month, year, employeeIds, profileId: profileId ?? DEFAULT_PROFILE }, req),
      'تم اعتماد كشف المستحقات الشهرية',
    );
  },

  async unapprove(req: Request, res: Response) {
    const { month, year } = req.body as { month: number; year: number };
    ok(res, await service.unapprove({ month, year }, req), 'تم إلغاء اعتماد كشف المستحقات الشهرية');
  },
};
