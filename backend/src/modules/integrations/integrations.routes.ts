import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { integrationsController } from './integrations.controller';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission('integrations.read'),
  asyncHandler(integrationsController.list),
);

router.get(
  '/:id',
  requirePermission('integrations.read'),
  asyncHandler(integrationsController.getById),
);

router.put(
  '/:id/settings',
  requirePermission('integrations.configure'),
  asyncHandler(integrationsController.updateSettings),
);

router.post(
  '/:id/run',
  requirePermission('integrations.run'),
  asyncHandler(integrationsController.run),
);

export default router;
