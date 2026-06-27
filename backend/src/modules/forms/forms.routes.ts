import { Router } from 'express';
import { formsController } from './forms.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.get('/salary-certificate/:employeeId', requirePermission('forms.read'), asyncHandler(formsController.getSalaryCertificate));
router.get('/to-whom-it-may-concern/:employeeId', requirePermission('forms.read'), asyncHandler(formsController.getToWhomItMayConcern));
router.get('/leave-request/:employeeId', requirePermission('forms.read'), asyncHandler(formsController.getLeaveRequest));
router.get('/return-to-work/:employeeId', requirePermission('forms.read'), asyncHandler(formsController.getReturnToWork));
router.get('/salary-advance/:employeeId', requirePermission('forms.read'), asyncHandler(formsController.getSalaryAdvance));
router.get('/resignation/:employeeId', requirePermission('forms.read'), asyncHandler(formsController.getResignation));
router.get('/employee-warning/:employeeId', requirePermission('forms.read'), asyncHandler(formsController.getWarning));
router.get('/performance-evaluation/:employeeId', requirePermission('forms.read'), asyncHandler(formsController.getPerformanceEvaluation));
router.get('/employment-contract/:employeeId', requirePermission('forms.read'), asyncHandler(formsController.getEmploymentContract));
router.post('/print-log', requirePermission('forms.print'), asyncHandler(formsController.logPrint));
router.post('/receipt-voucher-number', requirePermission('forms.print'), asyncHandler(formsController.generateReceiptVoucherNumber));

export default router;
