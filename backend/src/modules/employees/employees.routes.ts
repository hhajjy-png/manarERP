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
  createEntitlementLedgerSchema,
  createLeaveSettlementSchema,
  leaveSchema,
  updateAttendanceSchema,
  updateEmployeeSchema,
} from './employees.schema';

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
// الاستحقاقات (قراءة فقط) — قبل مسار :id العام لتفادي التعارض
router.get('/:id/entitlements', requirePermission('employees.read'), asyncHandler(employeesController.getEntitlements));
// تسويات رصيد الإجازة (تسجيل يدوي فقط — لا محاسبة/بنوك/رواتب)
router.get('/:id/leave-settlements', requirePermission('employees.read'), asyncHandler(employeesController.listLeaveSettlements));
router.post('/:id/leave-settlements', requirePermission('employees.update'), validate(createLeaveSettlementSchema), asyncHandler(employeesController.createLeaveSettlement));
// سجل المستحقات المصروفة (تاريخي فقط — لا يؤثر في أي احتساب، لا محاسبة/بنوك/رواتب)
router.get('/:id/entitlement-ledger', requirePermission('employees.read'), asyncHandler(employeesController.listEntitlementLedger));
router.post('/:id/entitlement-ledger', requirePermission('employees.update'), validate(createEntitlementLedgerSchema), asyncHandler(employeesController.createEntitlementLedgerEntry));
router.get('/:id', requirePermission('employees.read'), asyncHandler(employeesController.getById));
router.post('/', requirePermission('employees.create'), validate(createEmployeeSchema), asyncHandler(employeesController.create));
router.put('/:id', requirePermission('employees.update'), validate(updateEmployeeSchema), asyncHandler(employeesController.update));
router.delete('/:id', requirePermission('employees.delete'), asyncHandler(employeesController.remove));

export default router;
