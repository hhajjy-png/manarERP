import { Request, Response } from 'express';
import { employeesService } from './employees.service';
import { ok, created } from '../../core/utils/response';

const empId = (req: Request) => (req.query.employeeId ? Number(req.query.employeeId) : undefined);

export const employeesController = {
  // الموظفون
  async list(req: Request, res: Response) {
    ok(res, await employeesService.list(req.query));
  },
  async getById(req: Request, res: Response) {
    ok(res, await employeesService.getById(Number(req.params.id)));
  },
  async getEntitlements(req: Request, res: Response) {
    ok(res, await employeesService.getEntitlements(Number(req.params.id)));
  },
  async expiringDocuments(req: Request, res: Response) {
    const days = req.query.days ? Number(req.query.days) : 30;
    ok(res, await employeesService.expiringDocuments(days));
  },
  async create(req: Request, res: Response) {
    created(res, await employeesService.create(req.body, req));
  },
  async update(req: Request, res: Response) {
    ok(res, await employeesService.update(Number(req.params.id), req.body, req), 'تم التحديث بنجاح');
  },
  async remove(req: Request, res: Response) {
    ok(res, await employeesService.remove(Number(req.params.id), req), 'تم إنهاء خدمة الموظف');
  },
  // الحضور
  async listAttendance(req: Request, res: Response) {
    ok(res, await employeesService.listAttendance(req.query));
  },
  async recordAttendance(req: Request, res: Response) {
    created(res, await employeesService.recordAttendance(req.body, req));
  },
  async updateAttendance(req: Request, res: Response) {
    ok(res, await employeesService.updateAttendance(Number(req.params.id), req.body, req));
  },
  async deleteAttendance(req: Request, res: Response) {
    ok(res, await employeesService.deleteAttendance(Number(req.params.id), req));
  },
  // الإجازات
  async listLeaves(req: Request, res: Response) {
    ok(res, await employeesService.listLeaves(empId(req), req.query.status as string | undefined));
  },
  async requestLeave(req: Request, res: Response) {
    created(res, await employeesService.requestLeave(req.body, req));
  },
  async approveLeave(req: Request, res: Response) {
    ok(res, await employeesService.setLeaveStatus(Number(req.params.id), 'APPROVED', req), 'تمت الموافقة على الإجازة');
  },
  async rejectLeave(req: Request, res: Response) {
    ok(res, await employeesService.setLeaveStatus(Number(req.params.id), 'REJECTED', req), 'تم رفض الإجازة');
  },
  // الخصومات والمكافآت
  async addDeduction(req: Request, res: Response) {
    created(res, await employeesService.addDeduction(req.body, req));
  },
  async addBonus(req: Request, res: Response) {
    created(res, await employeesService.addBonus(req.body, req));
  },
};
