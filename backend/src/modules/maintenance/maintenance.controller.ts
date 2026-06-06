import { Request, Response } from 'express';
import { maintenanceService } from './maintenance.service';
import { ok, created } from '../../core/utils/response';

const eqId = (req: Request) => (req.query.equipmentId ? Number(req.query.equipmentId) : undefined);

export const maintenanceController = {
  // سجلات الصيانة
  async listRecords(req: Request, res: Response) {
    ok(res, await maintenanceService.listRecords(eqId(req)));
  },
  async createRecord(req: Request, res: Response) {
    created(res, await maintenanceService.createRecord(req.body, req));
  },
  async due(req: Request, res: Response) {
    ok(res, await maintenanceService.dueMaintenance(req.query.days ? Number(req.query.days) : 30));
  },
  // الوقود
  async listFuel(req: Request, res: Response) {
    ok(res, await maintenanceService.listFuel(eqId(req)));
  },
  async addFuel(req: Request, res: Response) {
    created(res, await maintenanceService.addFuel(req.body, req));
  },
  // الأعطال
  async listBreakdowns(req: Request, res: Response) {
    ok(res, await maintenanceService.listBreakdowns(eqId(req), req.query.status as string | undefined));
  },
  async reportBreakdown(req: Request, res: Response) {
    created(res, await maintenanceService.reportBreakdown(req.body, req));
  },
  async resolveBreakdown(req: Request, res: Response) {
    ok(res, await maintenanceService.resolveBreakdown(Number(req.params.id), req), 'تم حل العطل');
  },
  // قطع الغيار
  async listSpareParts(req: Request, res: Response) {
    ok(res, await maintenanceService.listSpareParts(eqId(req)));
  },
  async addSparePart(req: Request, res: Response) {
    created(res, await maintenanceService.addSparePart(req.body, req));
  },
};
