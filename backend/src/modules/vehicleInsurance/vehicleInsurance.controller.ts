import { Request, Response } from 'express';
import { ok, created } from '../../core/utils/response';
import { vehicleInsuranceService } from './vehicleInsurance.service';
import { policyFiltersSchema } from './vehicleInsurance.schema';

/** معرّف المعدة من الاستعلام — غيابه يعني «كل المعدات». */
function equipmentIdParam(req: Request): number | undefined {
  const raw = req.query.equipmentId;
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export const vehicleInsuranceController = {
  async summary(_req: Request, res: Response) {
    ok(res, await vehicleInsuranceService.summary());
  },

  /** الجدول الرئيسي — وثيقة واحدة (الأحدث) لكل مركبة مؤمَّن عليها. */
  async listCurrent(req: Request, res: Response) {
    const filters = policyFiltersSchema.parse(req.query);
    ok(res, await vehicleInsuranceService.listCurrentPolicies(filters));
  },

  /** سجل التأمين — كل وثائق مركبة واحدة (أو كل الوثائق عند غياب `equipmentId`). */
  async listPolicies(req: Request, res: Response) {
    ok(res, await vehicleInsuranceService.listPolicies(equipmentIdParam(req)));
  },

  async createPolicy(req: Request, res: Response) {
    created(res, await vehicleInsuranceService.createPolicy(req.body, req));
  },

  async updatePolicy(req: Request, res: Response) {
    ok(res, await vehicleInsuranceService.updatePolicy(Number(req.params.id), req.body, req));
  },

  async listInsurers(_req: Request, res: Response) {
    ok(res, await vehicleInsuranceService.listInsurers());
  },

  async listEquipmentOptions(_req: Request, res: Response) {
    ok(res, await vehicleInsuranceService.listEquipmentOptions());
  },

  async listAccidents(req: Request, res: Response) {
    ok(res, await vehicleInsuranceService.listAccidents(equipmentIdParam(req)));
  },

  async createAccident(req: Request, res: Response) {
    created(res, await vehicleInsuranceService.createAccident(req.body, req));
  },

  async updateAccident(req: Request, res: Response) {
    ok(res, await vehicleInsuranceService.updateAccident(Number(req.params.id), req.body, req));
  },
};
