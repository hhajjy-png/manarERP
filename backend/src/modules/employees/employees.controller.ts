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
  /** كشف مستحقات الموظف — يدعم تاريخ احتساب صريح (asOf)، وإلا فاليوم. */
  async getEntitlements(req: Request, res: Response) {
    const asOf = req.query.asOf ? new Date(String(req.query.asOf)) : undefined;
    ok(res, await employeesService.getEntitlements(Number(req.params.id), asOf));
  },
  async listLeaveSettlements(req: Request, res: Response) {
    ok(res, await employeesService.listLeaveSettlements(Number(req.params.id)));
  },
  async createLeaveSettlement(req: Request, res: Response) {
    created(res, await employeesService.createLeaveSettlement(Number(req.params.id), req.body, req), 'تم تسجيل التسوية بنجاح');
  },
  async listEntitlementPayments(req: Request, res: Response) {
    ok(res, await employeesService.listEntitlementPayments(Number(req.params.id)));
  },
  async recordEntitlementPayment(req: Request, res: Response) {
    created(res, await employeesService.recordEntitlementPayment(Number(req.params.id), req.body, req), 'تم تسجيل الدفعة بنجاح');
  },
  async updateEntitlementPayment(req: Request, res: Response) {
    ok(res, await employeesService.updateEntitlementPayment(Number(req.params.id), Number(req.params.paymentId), req.body, req), 'تم تعديل الدفعة بنجاح');
  },
  async deleteEntitlementPayment(req: Request, res: Response) {
    ok(res, await employeesService.deleteEntitlementPayment(Number(req.params.id), Number(req.params.paymentId), req), 'تم حذف الدفعة بنجاح');
  },
  async createFinalSettlement(req: Request, res: Response) {
    created(res, await employeesService.createFinalSettlement(Number(req.params.id), req.body, req), 'تم إنشاء مسودة التصفية النهائية');
  },
  async updateFinalSettlement(req: Request, res: Response) {
    ok(res, await employeesService.updateFinalSettlement(Number(req.params.id), req.body, req), 'تم تحديث بيانات التصفية');
  },
  async approveFinalSettlement(req: Request, res: Response) {
    ok(res, await employeesService.approveFinalSettlement(Number(req.params.id), req), 'تم اعتماد التصفية النهائية');
  },
  async recordFinalSettlementPayment(req: Request, res: Response) {
    created(res, await employeesService.recordFinalSettlementPayment(Number(req.params.id), req.body, req), 'تم تسجيل دفعة التصفية بنجاح');
  },
  async updateFinalSettlementPayment(req: Request, res: Response) {
    ok(res, await employeesService.updateFinalSettlementPayment(Number(req.params.id), Number(req.params.paymentId), req.body, req), 'تم تعديل دفعة التصفية بنجاح');
  },
  async deleteFinalSettlementPayment(req: Request, res: Response) {
    ok(res, await employeesService.deleteFinalSettlementPayment(Number(req.params.id), Number(req.params.paymentId), req), 'تم حذف دفعة التصفية بنجاح');
  },
  async cancelFinalSettlement(req: Request, res: Response) {
    ok(res, await employeesService.cancelFinalSettlement(Number(req.params.id), req.body, req), 'تم إلغاء التصفية النهائية');
  },
  async deleteFinalSettlementDraft(req: Request, res: Response) {
    ok(res, await employeesService.deleteFinalSettlementDraft(Number(req.params.id), req), 'تم حذف مسودة التصفية');
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
