import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission, requireRole } from '@core/middleware/rbac.middleware';
import { ROLES } from '@config/constants';
import { validate } from '@core/middleware/validate.middleware';
import { createPriceSchema, updatePriceSchema } from './prices.schema';
import * as ctrl from './prices.controller';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('prices.read'), ctrl.list);
router.post('/', requirePermission('prices.create'), validate(createPriceSchema), ctrl.create);
router.get('/stats', requirePermission('prices.read'), ctrl.stats);
router.get('/usage-report', requirePermission('prices.read'), ctrl.usageReport);
router.get('/:id/force', requireRole(ROLES.SYSTEM_ADMIN), ctrl.forceRemovePreview);
router.patch('/:id', requirePermission('prices.update'), validate(updatePriceSchema), ctrl.update);
router.delete('/:id/force', requireRole(ROLES.SYSTEM_ADMIN), ctrl.forceRemove);
router.delete('/:id', requirePermission('prices.delete'), ctrl.remove);

export default router;
