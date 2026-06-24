import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { statementsController } from './statements.controller';

const router = Router();
router.use(authenticate);

router.get(
  '/customers/:id',
  requirePermission('statements.read'),
  asyncHandler(statementsController.getCustomerStatement),
);
router.get(
  '/suppliers/:id',
  requirePermission('statements.read'),
  asyncHandler(statementsController.getSupplierStatement),
);
router.get(
  '/customers/:id/export',
  requirePermission('statements.export'),
  asyncHandler(statementsController.exportCustomerStatement),
);
router.get(
  '/suppliers/:id/export',
  requirePermission('statements.export'),
  asyncHandler(statementsController.exportSupplierStatement),
);

export default router;
