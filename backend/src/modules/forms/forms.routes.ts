import { Router } from 'express';
import { formsController } from './forms.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';

const router = Router();
router.use(authenticate);

router.get(
  '/salary-certificate/:employeeId',
  requirePermission('forms.read'),
  asyncHandler(formsController.getSalaryCertificate),
);

export default router;
