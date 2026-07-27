import { Router } from 'express';
import { payrollController } from './payroll.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import {
  manualPayrollLineSchema,
  payPayrollSchema,
  payrollAdvanceSchema,
  payrollPeriodSchema,
  recurringAllowanceSchema,
  recurringDeductionSchema,
  updatePayrollSchema,
} from './payroll.schema';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('payroll.read'), asyncHandler(payrollController.list));
// Static path — must precede '/:id' so it is not captured as an id param.
router.get('/stats', requirePermission('payroll.read'), asyncHandler(payrollController.stats));
router.get('/:id', requirePermission('payroll.read'), asyncHandler(payrollController.getById));
router.get('/:id/payslip', requirePermission('payroll.payslip', 'payroll.read'), asyncHandler(payrollController.payslip));

router.post('/preview', requirePermission('payroll.generate', 'payroll.read'), validate(payrollPeriodSchema), asyncHandler(payrollController.preview));
router.post('/generate', requirePermission('payroll.generate', 'payroll.create'), validate(payrollPeriodSchema), asyncHandler(payrollController.generate));
router.post('/allowances', requirePermission('payroll.adjust'), validate(recurringAllowanceSchema), asyncHandler(payrollController.createAllowance));
router.post('/recurring-deductions', requirePermission('payroll.adjust'), validate(recurringDeductionSchema), asyncHandler(payrollController.createRecurringDeduction));
router.post('/advances', requirePermission('payroll.adjust'), validate(payrollAdvanceSchema), asyncHandler(payrollController.createAdvance));

router.put('/:id', requirePermission('payroll.update'), validate(updatePayrollSchema), asyncHandler(payrollController.update));
router.post('/:id/lines', requirePermission('payroll.adjust'), validate(manualPayrollLineSchema), asyncHandler(payrollController.addManualLine));
router.patch('/:id/approve', requirePermission('payroll.approve'), asyncHandler(payrollController.approve));
// إلغاء اعتماد: يُعيد الكشف من APPROVED إلى DRAFT. يستخدم نفس صلاحية الاعتماد —
// من يملك سلطة الاعتماد يملك سلطة التراجع عنه (نفس منطق expenses.amend/expenses.approve).
router.patch('/:id/unapprove', requirePermission('payroll.approve'), asyncHandler(payrollController.unapprove));
router.patch('/:id/cancel', requirePermission('payroll.cancel'), asyncHandler(payrollController.cancel));
router.patch('/:id/pay', requirePermission('payroll.pay'), validate(payPayrollSchema), asyncHandler(payrollController.markPaid));

export default router;
