import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { payrollBankExportController } from './payrollBankExport.controller';

const router = Router();
router.use(authenticate);

// Read-only salary bank-export engine. Reuses the existing `payroll.read` permission
// (no new permission key → no seed/DB change). No mutation endpoints exist here.
router.get('/profiles', requirePermission('payroll.read'), asyncHandler(payrollBankExportController.profiles));
router.get('/preview', requirePermission('payroll.read'), asyncHandler(payrollBankExportController.preview));

export default router;
