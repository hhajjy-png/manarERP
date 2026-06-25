import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { previewHandler, executeHandler, reportExcelHandler, reportPdfHandler } from './controller';

const router = Router();
router.use(authenticate);

const canRead   = requirePermission('payrollBankImport.read');
const canCreate = requirePermission('payrollBankImport.create');
const canExport = requirePermission('payrollBankImport.export');

router.post('/preview',        canRead,   asyncHandler(previewHandler));
router.post('/execute',        canCreate, asyncHandler(executeHandler));
router.post('/report/excel',   canExport, asyncHandler(reportExcelHandler));
router.post('/report/pdf',     canExport, asyncHandler(reportPdfHandler));

export default router;
