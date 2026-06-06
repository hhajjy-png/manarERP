import { Router } from 'express';
import { payrollController } from './payroll.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { generatePayrollSchema } from './payroll.schema';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('payroll.read'), asyncHandler(payrollController.list));
router.post('/generate', requirePermission('payroll.create'), validate(generatePayrollSchema), asyncHandler(payrollController.generate));
router.patch('/:id/approve', requirePermission('payroll.approve'), asyncHandler(payrollController.approve));
router.patch('/:id/pay', requirePermission('payroll.approve'), asyncHandler(payrollController.markPaid));

export default router;
