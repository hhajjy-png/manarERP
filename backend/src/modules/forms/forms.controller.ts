import { Request, Response } from 'express';
import { formsService } from './forms.service';
import { ok } from '../../core/utils/response';

export const formsController = {
  async getSalaryCertificate(req: Request, res: Response) {
    ok(res, await formsService.getSalaryCertificateData(Number(req.params.employeeId)));
  },
  async getToWhomItMayConcern(req: Request, res: Response) {
    ok(res, await formsService.getToWhomItMayConcernData(Number(req.params.employeeId)));
  },
  async getLeaveRequest(req: Request, res: Response) {
    ok(res, await formsService.getLeaveRequestData(Number(req.params.employeeId)));
  },
  async getReturnToWork(req: Request, res: Response) {
    ok(res, await formsService.getReturnToWorkData(Number(req.params.employeeId)));
  },
  async getSalaryAdvance(req: Request, res: Response) {
    ok(res, await formsService.getSalaryAdvanceData(Number(req.params.employeeId)));
  },
  async getResignation(req: Request, res: Response) {
    ok(res, await formsService.getResignationData(Number(req.params.employeeId)));
  },
  async getWarning(req: Request, res: Response) {
    ok(res, await formsService.getWarningData(Number(req.params.employeeId)));
  },
  async getPerformanceEvaluation(req: Request, res: Response) {
    ok(res, await formsService.getPerformanceEvaluationData(Number(req.params.employeeId)));
  },
  async getEmploymentContract(req: Request, res: Response) {
    ok(res, await formsService.getEmploymentContractData(Number(req.params.employeeId)));
  },
  async logPrint(req: Request, res: Response) {
    await formsService.logFormPrint(req, req.body);
    ok(res, { logged: true });
  },
};
