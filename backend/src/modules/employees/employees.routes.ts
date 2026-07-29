import { Router } from 'express';
import { employeesController } from './employees.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import {
  adjustmentSchema,
  attendanceSchema,
  createEmployeeSchema,
  createLeaveSettlementSchema,
  leaveSchema,
  updateAttendanceSchema,
  updateEmployeeSchema,
} from './employees.schema';
import {
  entitlementStatementQuerySchema,
  recordEntitlementPaymentSchema,
  updateEntitlementPaymentSchema,
} from '../employee-entitlements/entitlements.schema';
import {
  upsertFinalSettlementSchema,
  recordSettlementPaymentSchema,
  cancelFinalSettlementSchema,
} from '../employee-entitlements/finalSettlement.schema';

const router = Router();
router.use(authenticate);

// الحضور
router.get('/attendance', requirePermission('attendance.read'), asyncHandler(employeesController.listAttendance));
router.post('/attendance', requirePermission('attendance.create'), validate(attendanceSchema), asyncHandler(employeesController.recordAttendance));
router.patch('/attendance/:id', requirePermission('attendance.update'), validate(updateAttendanceSchema), asyncHandler(employeesController.updateAttendance));
router.delete('/attendance/:id', requirePermission('attendance.delete'), asyncHandler(employeesController.deleteAttendance));

// الإجازات
router.get('/leaves', requirePermission('employees.read'), asyncHandler(employeesController.listLeaves));
router.post('/leaves', requirePermission('employees.create'), validate(leaveSchema), asyncHandler(employeesController.requestLeave));
router.patch('/leaves/:id/approve', requirePermission('employees.update'), asyncHandler(employeesController.approveLeave));
router.patch('/leaves/:id/reject', requirePermission('employees.update'), asyncHandler(employeesController.rejectLeave));

// الخصومات والمكافآت
router.post('/deductions', requirePermission('employees.update'), validate(adjustmentSchema), asyncHandler(employeesController.addDeduction));
router.post('/bonuses', requirePermission('employees.update'), validate(adjustmentSchema), asyncHandler(employeesController.addBonus));

// تنبيه المستندات المنتهية/القريبة (الإقامة/الجواز/الرخصة)
router.get('/expiring-documents', requirePermission('employees.read'), asyncHandler(employeesController.expiringDocuments));

// الموظفون (المسارات العامة بعد الفرعية لتفادي تعارض :id)
router.get('/', requirePermission('employees.read'), asyncHandler(employeesController.list));
// كشف «تفاصيل مستحقات الموظف» (قراءة فقط) — قبل مسار :id العام لتفادي التعارض.
// يقبل ?asOf=YYYY-MM-DD لاحتساب قابل لإعادة الإنتاج عند أي تاريخ.
router.get('/:id/entitlements', requirePermission('employees.read'), validate(entitlementStatementQuerySchema), asyncHandler(employeesController.getEntitlements));
// تسويات رصيد الإجازة (تسجيل يدوي فقط — لا محاسبة/بنوك/رواتب)
router.get('/:id/leave-settlements', requirePermission('employees.read'), asyncHandler(employeesController.listLeaveSettlements));
router.post('/:id/leave-settlements', requirePermission('employees.update'), validate(createLeaveSettlementSchema), asyncHandler(employeesController.createLeaveSettlement));
// دفعات المستحقات المسجَّلة — المصدر الوحيد لأي مبلغ «مدفوع». حركة مالية داخل نطاق
// المستحقات فقط: لا قيود محاسبية، ولا أثر على الرواتب، ولا استهلاك لأيام الإجازة.
router.get('/:id/entitlement-payments', requirePermission('employees.read'), asyncHandler(employeesController.listEntitlementPayments));
router.post('/:id/entitlement-payments', requirePermission('employees.update'), validate(recordEntitlementPaymentSchema), asyncHandler(employeesController.recordEntitlementPayment));
// تصحيح/حذف حركة دفع مسجَّلة — تصحيح سجل الدفعات فقط، بلا أي أثر خارج نطاق المستحقات.
router.patch('/:id/entitlement-payments/:paymentId', requirePermission('employees.update'), validate(updateEntitlementPaymentSchema), asyncHandler(employeesController.updateEntitlementPayment));
router.delete('/:id/entitlement-payments/:paymentId', requirePermission('employees.update'), asyncHandler(employeesController.deleteEntitlementPayment));
// التصفية النهائية — مسار مستقل داخل نطاق المستحقات: لا رواتب، ولا قيود محاسبية، ولا
// تغيير لحالة الموظف. القراءة تتم ضمن كشف المستحقات نفسه (لا نقطة قراءة منفصلة).
router.post('/:id/final-settlement', requirePermission('employees.update'), validate(upsertFinalSettlementSchema), asyncHandler(employeesController.createFinalSettlement));
router.patch('/:id/final-settlement', requirePermission('employees.update'), validate(upsertFinalSettlementSchema), asyncHandler(employeesController.updateFinalSettlement));
router.post('/:id/final-settlement/approve', requirePermission('employees.update'), asyncHandler(employeesController.approveFinalSettlement));
router.post('/:id/final-settlement/payments', requirePermission('employees.update'), validate(recordSettlementPaymentSchema), asyncHandler(employeesController.recordFinalSettlementPayment));
// تصحيح سجل دفعات التصفية — لا يمسّ اللقطة المجمَّدة، والحالة تُشتق من جديد بعد كل تغيير.
router.patch('/:id/final-settlement/payments/:paymentId', requirePermission('employees.update'), validate(recordSettlementPaymentSchema), asyncHandler(employeesController.updateFinalSettlementPayment));
router.delete('/:id/final-settlement/payments/:paymentId', requirePermission('employees.update'), asyncHandler(employeesController.deleteFinalSettlementPayment));
// إلغاء تصفية معتمدة/مسدَّدة — حالة نهائية بلا حذف؛ وحذف المسودة وحدها حذف فعلي.
router.post('/:id/final-settlement/cancel', requirePermission('employees.update'), validate(cancelFinalSettlementSchema), asyncHandler(employeesController.cancelFinalSettlement));
router.delete('/:id/final-settlement', requirePermission('employees.update'), asyncHandler(employeesController.deleteFinalSettlementDraft));
router.get('/:id', requirePermission('employees.read'), asyncHandler(employeesController.getById));
router.post('/', requirePermission('employees.create'), validate(createEmployeeSchema), asyncHandler(employeesController.create));
router.put('/:id', requirePermission('employees.update'), validate(updateEmployeeSchema), asyncHandler(employeesController.update));
router.delete('/:id', requirePermission('employees.delete'), asyncHandler(employeesController.remove));

export default router;
